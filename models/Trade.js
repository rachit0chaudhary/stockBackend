const mongoose = require("mongoose"); 
const Client = require("./client");
const Stoploss = require("./StopLoss");
const Bid = require("./Bid");

const tradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  stockId: {
    type: String,
    ref: "Stock",
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
  exchange: {
    type: String,
    required: true,
    enum: ["MCX", "NSE"],
  },
  tradeType: {
    type: String,
    enum: ["buy", "sell"],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  tradePercentage: {
    type: Number,
    required: false,
  },
  price: {
    type: Number,
    required: true,
    min: [0, "Price must be positive"],
  },
  status: {
    type: String,
    enum: ["open", "closed", "canceled"],
    default: "open",
  },
  action: {
    type: String,
    enum: ["buy", "sell"],
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
  },
});

// Pre-save hook to validate total trade limits
tradeSchema.pre("save", async function (next) {
  this.action = this.tradeType === "buy" ? "sell" : "buy";
  this.updatedAt = Date.now();

  try {
    let instruments = [];
    let existingTrade = [];
    const trades = await Trade.find({
      userId: this.userId,
      exchange: this.exchange,
      status: "open",
    });

    trades.forEach((trade) => {
      const existing = existingTrade.find(
        (item) => item.instrument === trade.instrumentIdentifier
      );

      if (existing) {
       
        existing.netQuantity += trade.quantity;
        existing.netPercentage += trade.tradePercentage;
      } else {
        existingTrade.push({
          instrument: trade.instrumentIdentifier,
          netQuantity: trade.quantity,
          netPercentage: trade.tradePercentage,
        });
      }
    });

   

    const totalPercentage = existingTrade.reduce(
      (sum, item) => sum + Math.abs(item.netPercentage),
      0
    );
    const scriptExistInArray = existingTrade.find(
      (item) => item.instrument === this.instrumentIdentifier
    );
  
    console.log("Total Percentage:", totalPercentage);

    trades.forEach((trade) => {
      const existingInstrument = instruments.find(
        (item) => item.instrument === trade.instrumentIdentifier
      );

      if (existingInstrument) {
        existingInstrument.netQuantity += trade.quantity;
        existingInstrument.netPercentage += trade.tradePercentage;
      } else {
        instruments.push({
          instrument: trade.instrumentIdentifier,
          netQuantity: trade.quantity,
          netPercentage: trade.tradePercentage,
        });
      }
    });

    const stoplosses = await Stoploss.find({
      userId: this.userId,
      exchange: this.exchange,
      status: "active",
    });

    stoplosses.forEach((stoploss) => {
      const existingInstrument = instruments.find(
        (item) => item.instrument === stoploss.instrumentIdentifier
      );

      if (existingInstrument) {
        if(stoploss.stoplossPercentage>=existingInstrument.netPercentage){
          existingInstrument.netQuantity = stoploss.quantity;
          existingInstrument.netPercentage += stoploss.stoplossPercentage;
        }
           
      } else {
        instruments.push({
          instrument: stoploss.instrumentIdentifier,
          netQuantity: stoploss.quantity,
          netPercentage: stoploss.stoplossPercentage,
        });
      }
    });

    const bids = await Bid.find({
      userId: this.userId,
      exchange: this.exchange,
      status: "active",
    });

    bids.forEach((bid) => {
      const existingInstrument = instruments.find(
        (item) => item.instrument === bid.instrumentIdentifier
      );

      if (existingInstrument) {
        if(Math.abs(bid.bidPercentage)>=Math.abs(existingInstrument.netPercentage)){
          existingInstrument.netQuantity = bid.quantity;
          existingInstrument.netPercentage += bid.bidPercentage;
        }
           
      } else {
        instruments.push({
          instrument: bid.instrumentIdentifier,
          netQuantity: bid.bidQuantity,
          netPercentage: bid.bidPercentage,
        });
      }
    });

    const client = await Client.findById(this.userId);
    if (!client) {
      return next(new Error("Client not found"));
    }

    let newAddition = this.instrumentIdentifier;
    let tradePercentage = this.tradePercentage || 0;

    const existingInstrumentInArray = instruments.find(
      (item) => item.instrument === newAddition
    );

    const netNumber = instruments.reduce(
      (sum, item) => sum + Math.abs(item.netPercentage),
      0
    );

    let tradeLimit;
    if (this.exchange === "MCX") {
      tradeLimit = client.TotalMCXTrade * 100;
    } else if (this.exchange === "NSE") {
      tradeLimit = client.TotalNSETrade * 100;
    }

    if (tradeLimit > totalPercentage) {
      if (existingInstrumentInArray && existingInstrumentInArray.netPercentage !== 0) {
        console.log("Existing instrument in array limit not reached");
        if (existingInstrumentInArray.netPercentage === 0) {
          tradePercentage = Math.abs(tradePercentage);
        } else if (
          existingInstrumentInArray.netPercentage < 0 &&
          tradePercentage > 0
        ) {
          tradePercentage = -tradePercentage;
        } else if (
          existingInstrumentInArray.netPercentage < 0 &&
          tradePercentage < 0
        ) {
          tradePercentage = Math.abs(tradePercentage);
        }
      } else {
        tradePercentage = Math.abs(tradePercentage);
      
      }
    } else {
      if (existingInstrumentInArray) {
        console.log("Existing instrument in array limit reached");
      
        // Check if scriptExistInArray is defined before accessing netPercentage
        let imaginary =
          existingInstrumentInArray.netPercentage +
          (scriptExistInArray?.netPercentage || 0); // Use 0 if scriptExistInArray is undefined

        const newPercentage = Math.abs(imaginary + tradePercentage);

        imaginary = Math.abs(imaginary);
        if (imaginary >= newPercentage && newPercentage >= 0) {
          console.log("New Percentage:", newPercentage, "and Existing Instrument Percentage:", existingInstrumentInArray.netPercentage);
          next();
        } else {
          return next(
            new Error(
              `Combined limit of ${tradeLimit}% exceeded for trades, stop losses, and bids on ${this.exchange} exchange.`
            )
          );
        }
        }
        else {
         return next(
           new Error(
             `Combined limit of ${tradeLimit}% exceeded for trades, stop losses, and bids on ${this.exchange} exchange.`
           )
         );
       }
   }

    const combinedPercentage = netNumber + tradePercentage;



    if (combinedPercentage >tradeLimit) {
      return next(
        new Error(
          `Combined limit of ${tradeLimit}% exceeded for trades, stop losses, and bids on ${this.exchange} exchange.`
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

const Trade = mongoose.model("Trade", tradeSchema);
module.exports = Trade;
