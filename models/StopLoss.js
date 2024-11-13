const mongoose = require("mongoose");

// Remove direct require of Trade and Bid to avoid circular dependencies

const stoplossSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  instrumentIdentifier: {
    type: String,
    required: true,
  },
  stopPrice: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  stoplossPercentage: {
    type: Number,
    required: false,
  },
  tradeType: {
    type: String,
    enum: ["buy", "sell"],
    required: true,
  },
  exchange: {
    type: String,
    enum: ["MCX", "NSE"],
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "fulfilled", "canceled", "closed"],
    default: "active",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Function to calculate combined percentage for stoploss, trades, and bids
// Pre-save hook to validate combined limit and apply client-specific limits
stoplossSchema.pre("save", async function (next) {
  const Stoploss = mongoose.model("Stoploss");
  const Trade = mongoose.model("Trade");
  const Bid = mongoose.model("Bid");
  const Client = mongoose.model("Client");
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
    // let totalPercentage = trades.reduce(
    //   (sum, trade) => sum + trade.tradePercentage,
    //   0
    // );
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
        if(Math.abs(stoploss.stoplossPercentage)>=Math.abs(existingInstrument.netPercentage)){
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
    let tradePercentage = this.stoplossPercentage || 0;

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
        console.log("abs triggered", tradePercentage);
      }
    } else {
      if (existingInstrumentInArray ){
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
        }else{
          return next(
            new Error(
              `Combined limit of ${tradeLimit}% exceeded for trades, stop losses, and bids on ${this.exchange} exchange.`
            )
          )
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
const Stoploss = mongoose.model("Stoploss", stoplossSchema);
module.exports = Stoploss;
