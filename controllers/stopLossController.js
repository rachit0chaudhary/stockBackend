const mongoose = require("mongoose");
const Trade = require("../models/Trade");
const Bid = require("../models/Bid");
const Stoploss = require("../models/StopLoss");
const Stock = require("../models/stock");
const Client = require("../models/client");

const addStoploss = async (req, res) => {
  try {
    const {
      userId,
      instrumentIdentifier,
      stopPrice,
      quantity,
      stoplossPercentage,
      exchange,
      tradeType,
    } = req.body;
    console.log("req.body stoploss", req.body);
    // Validate required fields
    if (
      !userId ||
      !instrumentIdentifier ||
      stopPrice === undefined ||
      quantity === undefined ||
      !tradeType ||
      !exchange ||
      stoplossPercentage === undefined
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Validate tradeType: Must be either 'buy' or 'sell'
    const validTradeTypes = ["buy", "sell"];
    if (!validTradeTypes.includes(tradeType)) {
      return res.status(400).json({
        error: 'Invalid tradeType. It should be either "buy" or "sell".',
      });
    }

    // Validate stopPrice and quantity
    if (quantity <= 0 || stopPrice <= 0) {
      return res.status(400).json({
        error: "Stoploss quantity and price must be greater than zero.",
      });
    }

    // Validate userId (ensure it's a valid MongoDB ObjectId)
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid User ID" });
    }

    // Find the client using userId
    const client = await Client.findById(userId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const maxLimits = {
      MCX: client.PerMCXTrade * 100,
      NSE: client.PerNSETrade * 100,
    };

    // Ensure the exchange exists in maxLimits
    if (!maxLimits.hasOwnProperty(exchange)) {
      return res
        .status(400)
        .json({ error: `Exchange ${exchange} is not supported.` });
    }

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



    // Function to calculate total percentages (buy and sell)
    const calculateTotalPercentage = (items, field) =>
      items.reduce((sum, item) => sum + item[field], 0);

    // Calculate the current total buy and sell percentages across stoplosses, bids, and trades


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

    const netTotal = currentStoplossTotal + currentBidTotal+currentTradeTotal;
    const stoplossPercentageNum=Number(stoplossPercentage);
    const imaginary= currentStoplossTotal + currentBidTotal;
    const finalTotal= imaginary + stoplossPercentageNum+currentTradeTotal;
    const remainingBuy = maxLimits[exchange] - finalTotal;
    const remainingSell = maxLimits[exchange] + finalTotal;
    if(Math.abs(currentTradeTotal)>=maxLimits[exchange]&&Math.abs(imaginary)>=maxLimits[exchange]){
      return res.status(400).json({
        message: `Adding this trade would exceed the combined limit of ${maxLimits[exchange]} for ${exchange}.`,
        remainingBuy: remainingBuy >= 0 ? remainingBuy : 0,
        remainingSell: remainingSell >= 0 ? remainingSell : 0,
      });
    }

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

    // Create and save a new Stoploss
    const stoploss = new Stoploss({
      userId,
      instrumentIdentifier,
      stopPrice,
      quantity,
      tradeType,
      exchange,
      stoplossPercentage: stoplossPercentageNum,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const savedStoploss = await stoploss.save();

    // Respond with the created stoploss data
    return res.status(201).json({
      message: "Stoploss order created successfully",
      stoploss: savedStoploss,
    });
  } catch (error) {
    // Handle any errors during the process
    console.error("Error creating stoploss order:", error);
    return res.status(500).json({
      error: "Failed to create stoploss order",
      details: error.message,
    });
  }
};

const getStoploss = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId parameter
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Find stoploss documents for the given userId
    const stoplosses = await Stoploss.find({ userId });

    // Check if any stoplosses were found
    if (stoplosses.length === 0) {
      return res
        .status(404)
        .json({ message: "No stoploss orders found for this user" });
    }

    // Respond with the retrieved stoploss data
    return res.status(200).json({
      message: "Stoploss orders retrieved successfully",
      stoplosses,
    });
  } catch (error) {
    // Handle any errors during the process
    return res.status(500).json({
      error: "Failed to retrieve stoploss orders",
      details: error.message,
    });
  }
};

// Update Stoploss by ID
const updateStoploss = async (req, res) => {
  const { id } = req.params; // Get the ID from request parameters
  const { stopPrice, quantity, tradeType, status } = req.body; // Destructure the request body

  try {
    const updatedStoploss = await Stoploss.findByIdAndUpdate(
      id,
      { stopPrice, quantity, tradeType, status, updatedAt: Date.now() }, // Update fields
      { new: true, runValidators: true } // Options to return the updated document and run validation
    );

    if (!updatedStoploss) {
      return res.status(404).json({ message: "Stoploss not found" });
    }

    res.status(200).json(updatedStoploss); // Return the updated stoploss
  } catch (error) {
    res.status(400).json({ message: error.message }); // Return error message
  }
};

// Delete Stoploss by ID
const deleteStoploss = async (req, res) => {
  const { id } = req.params; // Get the ID from request parameters

  try {
    const deletedStoploss = await Stoploss.findByIdAndDelete(id); // Find and delete the stoploss

    if (!deletedStoploss) {
      return res.status(404).json({ message: "Stoploss not found" });
    }

    res.status(200).json({ message: "Stoploss deleted successfully" }); // Success message
  } catch (error) {
    res.status(400).json({ message: error.message }); // Return error message
  }
};

module.exports = {
  addStoploss,
  getStoploss,
  updateStoploss,
  deleteStoploss,
};
