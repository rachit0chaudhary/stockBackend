const TradingHours = require("../models/TradingHours");
const moment = require("moment-timezone");
// Create new trading hours
exports.addTradingHours = async (req, res) => {
  const { exchange, startHour, startMinute, endHour, endMinute, date } =
    req.body;

  try {
    // Check if trading hours already exist for the exchange
    let existingTradingHours = await TradingHours.findOne({
      exchange: exchange.toUpperCase(),
    });
    if (existingTradingHours) {
      return res
        .status(400)
        .json({ message: "Trading hours for this exchange already exist" });
    }

    // Create a new trading hours entry
    const newTradingHours = new TradingHours({
      exchange: exchange.toUpperCase(),
      startHour,
      startMinute,
      endHour,
      endMinute,
      date: new Date(date),
    });

    await newTradingHours.save();
    res.status(201).json(newTradingHours);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to add trading hours", error: err.message });
  }
};

exports.getTradingHoursByExchange = async (req, res) => {
  const { exchange } = req.params;

  if (!exchange) {
    return res.status(400).json({ message: "Exchange parameter is required" });
  }

  try {
    // Get the current date in Kolkata time
    const currentDateKolkata = moment().tz("Asia/Kolkata").startOf("day");

    // Fetch trading hours from the database
    const tradingHours = await TradingHours.findOne({
      exchange: exchange.toUpperCase(),
      date: {
        $gte: currentDateKolkata.toDate(),
        $lt: currentDateKolkata.clone().endOf("day").toDate(), // Check within the full day range
      },
    });

    // Check if trading hours exist for the current date
    if (!tradingHours) {
      // If not found, assign default trading hours based on exchange
      let startHour, startMinute, endHour, endMinute;

      if (exchange.toUpperCase() === "NSE") {
        startHour = 9;
        startMinute = 15;
        endHour = 15;
        endMinute = 30;
      } else if (exchange.toUpperCase() === "MCX") {
        startHour = 0;
        startMinute = 15;
        endHour = 23;
        endMinute = 30;
      } else {
        return res
          .status(404)
          .json({ message: "No trading hours available for this exchange" });
      }

      // Return default trading hours
      return res.json({
        exchange: exchange.toUpperCase(),
        startHour,
        startMinute,
        endHour,
        endMinute,
        date: currentDateKolkata.toDate(), // Send the current date
      });
    }

    // If found, return the trading hours
    res.json(tradingHours);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to get trading hours", error: err.message });
  }
};

// Get all trading hours
exports.getAllTradingHours = async (req, res) => {
  try {
    const tradingHours = await TradingHours.find();
    res.json(tradingHours);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to get trading hours", error: err.message });
  }
};

// Update trading hours
exports.updateTradingHours = async (req, res) => {
  const { exchange } = req.params;
  const { startHour, startMinute, endHour, endMinute, date } = req.body;

  try {
    const tradingHours = await TradingHours.findOne({
      exchange: exchange.toUpperCase(),
    });
    if (!tradingHours) {
      return res.status(404).json({ message: "Trading hours not found" });
    }

    // Update trading hours fields
    tradingHours.startHour = startHour;
    tradingHours.startMinute = startMinute;
    tradingHours.endHour = endHour;
    tradingHours.endMinute = endMinute;
    tradingHours.date = new Date(date);

    await tradingHours.save();
    res.json(tradingHours);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update trading hours", error: err.message });
  }
};

// Delete trading hours
exports.deleteTradingHours = async (req, res) => {
  const { exchange } = req.params;

  try {
    const tradingHours = await TradingHours.findOneAndDelete({
      exchange: exchange.toUpperCase(),
    });
    if (!tradingHours) {
      return res.status(404).json({ message: "Trading hours not found" });
    }

    res.json({ message: "Trading hours deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete trading hours", error: err.message });
  }
};
