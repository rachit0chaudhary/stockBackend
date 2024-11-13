const express = require("express");
const router = express.Router();
const tradingHoursController = require("../controllers/TradingHoursController");

// Add new trading hours
router.post("/trading-hours", tradingHoursController.addTradingHours);

// Get all trading hours
router.get("/trading-hours", tradingHoursController.getAllTradingHours);

// Get trading hours for a specific exchange
router.get(
  "/trading-hours/:exchange",
  tradingHoursController.getTradingHoursByExchange
);
// Update trading hours by exchange
router.put(
  "/trading-hours/:exchange",
  tradingHoursController.updateTradingHours
);

// Delete trading hours by exchange
router.delete(
  "/trading-hours/:exchange",
  tradingHoursController.deleteTradingHours
);

module.exports = router;
