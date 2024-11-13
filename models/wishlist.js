// In wishlist.model.js
const mongoose = require("mongoose");
const Stock = require("./stock"); // Adjust the path as needed

// Define the Item sub-schema
const itemSchema = new mongoose.Schema(
  {
    product: {
      type: String,
      required: true,
    },
    exchange: {
      type: String,
      enum: ["MCX", "NSE"],
      required: true,
    },
    instrumentIdentifier: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    serial: {
      type: Number,
    },
  },
  { _id: false }
);

// Define the Wishlist schema
const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    items: [itemSchema],
  },
  { timestamps: true }
);

// Pre-save middleware to auto-increment serial number for new items
wishlistSchema.pre("save", function (next) {
  const wishlist = this;

  wishlist.items.forEach((item, index) => {
    // If serial is not set, calculate it based on the current index
    if (!item.serial) {
      item.serial = index + 1; // Start serial numbers from 1
    }
  });

  next();
});

// Method to reorder wishlist items based on a new order of instrumentIdentifiers
wishlistSchema.methods.reorderItems = async function (newOrder) {
  // Create a mapping of instrumentIdentifier to its new serial number
  const serialMapping = {};
  newOrder.forEach((instrumentIdentifier, index) => {
    serialMapping[instrumentIdentifier] = index + 1; // Start serials from 1
  });

  // Update the serial number of each item in the wishlist
  this.items.forEach((item) => {
    if (serialMapping[item.instrumentIdentifier] !== undefined) {
      item.serial = serialMapping[item.instrumentIdentifier];
    }
  });

  // Save the updated wishlist
  await this.save();
};

// Export the Wishlist model
module.exports = mongoose.model("Wishlist", wishlistSchema);
