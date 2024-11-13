const mongoose = require("mongoose");
const Bid = require("./models/Bid");
const Stock = require("./models/stock");
const Stoploss = require("./models/StopLoss");
const Trade = require("./models/Trade");

// Function to create a trade from a fulfilled bid or stop-loss
async function createTrade(bidOrStoploss, stock, price, session) {
  try {
    console.log("bidOrStoploss",bidOrStoploss)
    console.log("bidOrStoploss",bidOrStoploss.bidPercentage)
    const trade = new Trade({
      userId: bidOrStoploss.userId,
      stockId: stock._id.toString(),
      instrumentIdentifier: bidOrStoploss.instrumentIdentifier,
      name: stock.name,
      exchange: stock.Exchange,
      tradeType: bidOrStoploss.tradeType,
      quantity: bidOrStoploss.bidQuantity || bidOrStoploss.quantity,
      tradePercentage: bidOrStoploss.bidPercentage || bidOrStoploss.stoplossPercentage || undefined,
      price: price,
      status: "open",
      action: bidOrStoploss.tradeType === "buy" ? "sell" : "buy",
      date: new Date(),
      createdAt: new Date(),
      updatedAt: null,
    });

    await trade.save({ session });
    // console.log(`Trade created for ${bidOrStoploss.instrumentIdentifier} at ${price}`);
  } catch (error) {
    console.error("Error creating trade:", error);
  }
}

// Function to check and update active bids
async function checkAndUpdateBids() {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const activeBids = await Bid.find({ status: "active" }).session(session);

    if (activeBids.length === 0) {
      await session.commitTransaction();
      session.endSession();
      return;
    }

    const instrumentIdentifiers = activeBids.map((bid) => bid.instrumentIdentifier);
    const stocks = await Stock.find({
      InstrumentIdentifier: { $in: instrumentIdentifiers },
    }).session(session);

    const stockMap = new Map();
    stocks.forEach((stock) => {
      stockMap.set(stock.InstrumentIdentifier, stock);
    });

    const bulkOperations = [];
    const fulfilledBids = [];

    for (const bid of activeBids) {
      const { instrumentIdentifier, bidPrice, tradeType, _id } = bid;
      const stock = stockMap.get(instrumentIdentifier);

      if (!stock) continue;

      let shouldFulfill = false;
      if ((tradeType === "buy" && bidPrice > stock.BuyPrice) ||
          (tradeType === "sell" && bidPrice < stock.SellPrice)) {
        shouldFulfill = true;
      }

      if (shouldFulfill) {
        bulkOperations.push({
          updateOne: {
            filter: { _id },
            update: { $set: { status: "fulfilled", fulfilledAt: new Date() } },
          },
        });
        fulfilledBids.push({ bid, stock, tradePrice: bidPrice });
      }
    }

    if (bulkOperations.length > 0) {
      await Bid.bulkWrite(bulkOperations, { session });
      for (const { bid, stock, tradePrice } of fulfilledBids) {
        await createTrade(bid, stock, tradePrice, session);
      }
    }

    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error checking and updating bids:", error);
  }
}

// Function to check and update active stop-losses
async function checkAndUpdateStoplosses() {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const activeStoplosses = await Stoploss.find({ status: "active" }).session(session);

    if (activeStoplosses.length === 0) {
      await session.commitTransaction();
      session.endSession();
      return;
    }

    const instrumentIdentifiers = activeStoplosses.map(
      (stoploss) => stoploss.instrumentIdentifier
    );
    const stocks = await Stock.find({
      InstrumentIdentifier: { $in: instrumentIdentifiers },
    }).session(session);

    const stockMap = new Map();
    stocks.forEach((stock) => {
      stockMap.set(stock.InstrumentIdentifier, stock);
    });

    const bulkOperations = [];
    const fulfilledStoplosses = [];

    for (const stoploss of activeStoplosses) {
      const { instrumentIdentifier, stopPrice, tradeType, _id } = stoploss;
      const stock = stockMap.get(instrumentIdentifier);

      if (!stock) continue;

      let shouldFulfill = false;
      if ((tradeType === "buy" && stopPrice < stock.BuyPrice) ||
          (tradeType === "sell" && stopPrice > stock.SellPrice)) {
        shouldFulfill = true;
      }

      if (shouldFulfill) {
        bulkOperations.push({
          updateOne: {
            filter: { _id },
            update: { $set: { status: "fulfilled", fulfilledAt: new Date() } },
          },
        });
        fulfilledStoplosses.push({
          stoploss,
          stock,
          tradePrice: tradeType === "buy" ? stock.BuyPrice : stock.SellPrice,
        });
      }
    }

    if (bulkOperations.length > 0) {
      await Stoploss.bulkWrite(bulkOperations, { session });
      for (const { stoploss, stock, tradePrice } of fulfilledStoplosses) {
        await createTrade(stoploss, stock, tradePrice, session);
      }
    }

    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error checking and updating stop-loss orders:", error);
  }
}

// Function to initiate polling
function startBidPolling(intervalMs) {
  (async () => {
    await checkAndUpdateBids();
    await checkAndUpdateStoplosses();
  })();

  setInterval(async () => {
    await checkAndUpdateBids();
    await checkAndUpdateStoplosses();
  }, intervalMs);
}

module.exports = { startBidPolling };