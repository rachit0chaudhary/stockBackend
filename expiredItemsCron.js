// cronJobs/expiredItemsCron.js
const cron = require("node-cron");
const mongoose = require("mongoose");
const Wishlist = require("./models/wishlist");
const Stock = require("./models/stock");


const dotenv = require("dotenv");
const moment = require("moment-timezone");

// Load environment variables from .env file
dotenv.config();

// Function to connect to MongoDB
const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Adjust as needed
        socketTimeoutMS: 45000,
      });
      console.log("MongoDB connected for expired items cron job.");
    } catch (error) {
      console.error("MongoDB connection error:", error);
      process.exit(1); // Exit the process with failure
    }
  }
};

// Function to remove expired wishlist items
const removeExpiredWishlistItems = async () => {
  try {
    console.log("Cron Job: Starting to remove expired wishlist items...");

    // Get today's date in UTC (start of the day)
    const today = moment.tz("Asia/Kolkata").startOf("day").utc().toDate();
    const formattedDate = moment(today).format("YYYY-MM-DD");
    console.log(`Current date (UTC): ${formattedDate}`);

    // Find all stocks that have expired (expiry date is before or equal to today)
    const expiredStocks = await Stock.find({ expiry: { $lte: today } }).select(
      "InstrumentIdentifier expiry"
    );

    if (expiredStocks.length === 0) {
      console.log("Cron Job: No expired stocks found today.");
      return;
    }

    const expiredInstrumentIds = expiredStocks.map(
      (stock) => stock.InstrumentIdentifier
    );
    console.log("Expired Instrument Identifiers:", expiredInstrumentIds);

    // Display existing wishlist data and their expiry dates
    const wishlists = await Wishlist.find().populate(
      "items.instrumentIdentifier"
    );

    console.log("Existing Wishlist Data with Expiry Dates:");
    const expiryMap = expiredStocks.reduce((map, stock) => {
      map[stock.InstrumentIdentifier] = stock.expiry;
      return map;
    }, {});

    wishlists.forEach((wishlist) => {
      wishlist.items.forEach((item) => {
        // console.log(`- Checking Item: ${item.instrumentIdentifier}`);

        // Use the expiry map to get the expiry date
        const expiryDate = expiryMap[item.instrumentIdentifier];

        if (expiryDate) {
          console.log(
            `- Item: ${item.instrumentIdentifier}, Expiry Date: ${moment(
              expiryDate
            ).format("YYYY-MM-DD")}`
          );
        } else {
          console.log(
            `- Item: ${item.instrumentIdentifier}, Expiry Date: Not available`
          );
        }
      });
    });

    // Check how many items will be removed
    const itemsToRemove = await Wishlist.find({
      "items.instrumentIdentifier": { $in: expiredInstrumentIds },
    });

    console.log(`Items to be removed from wishlists: ${itemsToRemove.length}`);

    // Remove expired items from all wishlists
    const result = await Wishlist.updateMany(
      { "items.instrumentIdentifier": { $in: expiredInstrumentIds } },
      {
        $pull: {
          items: { instrumentIdentifier: { $in: expiredInstrumentIds } },
        },
      }
    );

    console.log(
      `Cron Job: Expired items removal completed. Modified Wishlists: ${result.modifiedCount}, Acknowledged: ${result.acknowledged}`
    );
  } catch (error) {
    console.error("Cron Job: Error removing expired wishlist items:", error);
  }
};

// Function to start the cron job
const startExpiredItemsCron = async () => {
  await connectDB();

  // Schedule the job to run daily at 10:05 PM in Kolkata timezone
  cron.schedule(
    "50 0 * * *",
    () => {
      // Runs every day at 22:05
      removeExpiredWishlistItems();
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log(
    "Cron Job: Scheduled to run daily at 10:05 PM to remove expired wishlist items."
  );
};

// Export the function to start the cron job
module.exports = { startExpiredItemsCron };
