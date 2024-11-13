const mongoose = require("mongoose");
const Trade = require("../models/Trade");
const Bid = require("../models/Bid");
const Stoploss = require("../models/StopLoss");
const Stock = require("../models/stock");
const Client = require("../models/client");

const addBid = async (req, res) => {
  try {
    const {
      userId,
      instrumentIdentifier,
      bidPrice,
      bidQuantity,
      tradeType,
      bidPercentage,
      exchange,
    } = req.body;
    

    // Validate required fields
    if (
      !userId ||
      !instrumentIdentifier ||
      !bidPrice ||
      !bidQuantity ||
      !tradeType ||
      !exchange ||
      bidPercentage === undefined
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate tradeType
    const validTradeTypes = ["buy", "sell"];
    if (!validTradeTypes.includes(tradeType)) {
      return res.status(400).json({
        message: `Invalid tradeType. It should be either "buy" or "sell".`,
      });
    }

    // Validate bidPrice and bidQuantity
    if (bidQuantity <= 0 || bidPrice <= 0) {
      return res.status(400).json({
        message: "Bid quantity and price must be greater than zero.",
      });
    }

    // Validate userId (ensure it's a valid MongoDB ObjectId)
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    // Find the stock using InstrumentIdentifier
    const stock = await Stock.findOne({
      InstrumentIdentifier: instrumentIdentifier,
    });
    if (!stock) {
      return res.status(404).json({ message: "Stock not found" });
    }

    // Find the client using userId
    const client = await Client.findById(userId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Set maximum percentage limit for each exchange based on client's PerMCXTrade and PerNSETrade
    const maxLimits = {
      MCX: client.PerMCXTrade * 100,
      NSE: client.PerNSETrade * 100,
    };
    console.log("max limit", maxLimits);
    // Ensure the exchange exists in maxLimits
    if (!maxLimits.hasOwnProperty(exchange)) {
      return res
        .status(400)
        .json({ message: `Exchange ${exchange} is not supported.` });
    }

    // Fetch all active bids, trades, and stoplosses for the client with the same instrument and exchange
    const clientBids = await Bid.find({
      userId: client._id,
      exchange,
      instrumentIdentifier,
      status: "active",
    }).exec();

    const clientTrades = await Trade.find({
      userId: client._id,
      exchange,
      instrumentIdentifier,
    }).exec();

    const clientStoplosses = await Stoploss.find({
      userId: client._id,
      exchange,
      instrumentIdentifier,
      status: "active",
    }).exec();



    // Calculate the current total buy and sell percentage across bids, trades, and stoplosses
    const calculateTotalPercentage = (items, field) =>
      items.reduce((sum, item) => sum + item[field], 0);

      const currentBidTotal =
      calculateTotalPercentage(
        clientBids.filter((bid) => bid.bidPercentage > 0),
        "bidPercentage"
      ) +
      calculateTotalPercentage(
        clientBids.filter((bid) => bid.bidPercentage < 0),
        "bidPercentage"
      );

      const currentStoplossTotal =
      calculateTotalPercentage(
        clientStoplosses.filter((sl) => sl.stoplossPercentage > 0),
        "stoplossPercentage"
      ) +
      calculateTotalPercentage(
        clientStoplosses.filter((sl) => sl.stoplossPercentage < 0),
        "stoplossPercentage"
      );

      const currentTradeTotal =
      calculateTotalPercentage(
        clientTrades.filter((trade) => trade.tradePercentage > 0),
        "tradePercentage"
      ) +
      calculateTotalPercentage(
        clientTrades.filter((trade) => trade.tradePercentage < 0),
        "tradePercentage"
      );

    // Calculate the net total percentage (buy - sell)
    const netTotal = currentStoplossTotal+currentBidTotal+currentTradeTotal;  
    const bidPercentageNum=Number(bidPercentage);
    const imaginary= currentStoplossTotal + currentBidTotal;
    const remainingBuy = maxLimits[exchange] - netTotal;
    const remainingSell = maxLimits[exchange] + netTotal;
    const finalTotal= imaginary + bidPercentageNum + currentTradeTotal;

    if(Math.abs(currentTradeTotal)>=maxLimits[exchange]&&Math.abs(imaginary)>maxLimits[exchange]){
      return res.status(400).json({
        message: `Adding this trade would exceed the combined limit of ${maxLimits[exchange]} for ${exchange}.`,
        remainingBuy: remainingBuy >= 0 ? remainingBuy : 0,
        remainingSell: remainingSell >= 0 ? remainingSell : 0,
      });
    }
    // Check if the absolute value of proposed net total exceeds the limit
    if (Math.abs(finalTotal) > maxLimits[exchange]) {
      console.log(
        "Proposed net total exceeds the limit:",
        finalTotal,
        "Max limit:",
        maxLimits[exchange]
      );
    
      console.log(
        "Remaining Buy:",
        remainingBuy,
        "Remaining Sell:",
        remainingSell
      );

      return res.status(400).json({
        message: `Adding this trade would exceed the combined limit of ${maxLimits[exchange]} for ${exchange}.`,
        remainingBuy: remainingBuy >= 0 ? remainingBuy : 0,
        remainingSell: remainingSell >= 0 ? remainingSell : 0,
      });
    }
   

    // Create and save a new Bid
    const newBid = new Bid({
      userId,
      stockId: stock._id,
      instrumentIdentifier,
      bidPrice,
      bidQuantity,
      tradeType,
      bidPercentage: bidPercentageNum,
      exchange,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const savedBid = await newBid.save();

    // Respond with the saved bid
    res.status(201).json({
      message: "Bid added successfully",
      bid: savedBid,
    });
  } catch (error) {
    console.error("Error adding bid:", error);
    res.status(500).json({ message: "", error: error.message });
  }
};

// const addBid = async (req, res) => {
//   try {
//     const {
//       userId,
//       instrumentIdentifier,
//       bidPrice,
//       bidQuantity,
//       tradeType,
//       bidPercentage,
//       exchange,
//     } = req.body;

//     // Validate required fields
//     if (
//       !userId ||
//       !instrumentIdentifier ||
//       !bidPrice ||
//       !bidQuantity ||
//       !tradeType ||
//       !exchange ||
//       bidPercentage === undefined // Allow bidPercentage to be zero or negative
//     ) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // Validate tradeType
//     if (!["buy", "sell"].includes(tradeType)) {
//       return res.status(400).json({
//         message: 'Invalid trade_type. It should be either "buy" or "sell".',
//       });
//     }

//     // Validate bidPrice and bidQuantity (but no longer validate bidPercentage)
//     if (bidQuantity <= 0 || bidPrice <= 0) {
//       return res.status(400).json({
//         message: "Bid quantity and price must be greater than zero.",
//       });
//     }

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return res.status(400).json({ message: "Invalid User ID" });
//     }

//     // Find the stock using InstrumentIdentifier
//     const stock = await Stock.findOne({
//       InstrumentIdentifier: instrumentIdentifier,
//     });
//     if (!stock) {
//       return res.status(404).json({ message: "Stock not found" });
//     }

//     // Find the client using userId
//     const client = await Client.findById(userId);
//     if (!client) {
//       return res.status(404).json({ message: "Client not found" });
//     }

//     // Create and save a new Bid
//     const newBid = new Bid({
//       userId,
//       stockId: stock._id,
//       instrumentIdentifier,
//       bidPrice,
//       bidQuantity,
//       tradeType,
//       bidPercentage, // Negative value allowed
//       exchange,
//       status: "active",
//       createdAt: Date.now(),
//       updatedAt: Date.now(),
//     });

//     const savedBid = await newBid.save();

//     // Return success response
//     res.status(201).json({
//       message: "Bid added successfully",
//       bid: savedBid,
//     });
//   } catch (error) {
//     console.error("Error adding bid:", error);
//     res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };

const getBidsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    // Find bids associated with the given userId
    const bids = await Bid.find({ userId }).populate(
      "stockId",
      "InstrumentIdentifier"
    ); // Optionally populate stockId to include stock details

    if (bids.length === 0) {
      return res.status(404).json({ message: "No bids found for this user" });
    }

    res.status(200).json({
      message: "Bids retrieved successfully",
      bids,
    });
  } catch (error) {
    console.error("Error retrieving bids:", error);
    res.status(500).json({ message: "", error: error.message });
  }
};

// Delete bid by ID
const deleteBidById = async (req, res) => {
  const { id } = req.params;

  try {
    // Find and delete the bid
    const result = await Bid.findByIdAndDelete(id);

    // Check if the bid was found and deleted
    if (!result) {
      return res.status(404).json({ message: "Bid not found" });
    }

    // Respond with a success message
    return res.status(200).json({ message: "Bid deleted successfully" });
  } catch (error) {
    console.error("Error deleting bid:", error);
    return res.status(500).json({ message: "", error: error.message });
  }
};

// Update bid controller
const updateBid = async (req, res) => {
  const { id } = req.params;
  const { bidPrice, bidQuantity, tradeType } = req.body;

  try {
    // Validate input
    if (bidPrice < 0 || bidQuantity < 0) {
      return res
        .status(400)
        .json({ message: "Bid price and quantity must be non-negative." });
    }

    // Find and update the bid
    const updatedBid = await Bid.findByIdAndUpdate(
      id,
      { bidPrice, bidQuantity, tradeType, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    // Check if bid was found and updated
    if (!updatedBid) {
      return res.status(404).json({ message: "Bid not found." });
    }

    // Return the updated bid
    return res.status(200).json(updatedBid);
  } catch (error) {
    console.error("Error updating bid:", error);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

const getBidsFulfilledByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    // Find bids associated with the given userId and status "fulfilled"
    const fulfilledBids = await Bid.find({
      userId,
      status: "fulfilled",
    }).populate("stockId", "instrumentIdentifier");

    if (fulfilledBids.length === 0) {
      return res
        .status(404)
        .json({ message: "No fulfilled bids found for this user" });
    }

    res.status(200).json({
      message: "Fulfilled bids retrieved successfully",
      bids: fulfilledBids,
    });
  } catch (error) {
    console.error("Error retrieving bids:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  addBid,
  getBidsByUserId,
  deleteBidById,
  updateBid,
  getBidsFulfilledByUserId,
};
