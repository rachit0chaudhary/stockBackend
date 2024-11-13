const mongoose = require("mongoose");

const tradingHoursSchema = new mongoose.Schema({
  exchange: { type: String, required: true, unique: true },
  startHour: { type: Number, required: true },
  startMinute: { type: Number, required: true },
  endHour: { type: Number, required: true },
  endMinute: { type: Number, required: true },
  date: { type: Date, required: true },
});

const TradingHours = mongoose.model("TradingHours", tradingHoursSchema);

module.exports = TradingHours;
