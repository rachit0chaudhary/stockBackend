const mongoose = require('mongoose');
const Stock = require('./models/Stock'); // Adjust the path as needed
const Trade = require('./models/Trade'); // Adjust the path as needed

async function updateTradePrices() {
  try {
    const stocks = await Stock.find({});
    if (stocks.length > 0) {
      for (const stock of stocks) {
        await Trade.updateMany(
          { instrumentIdentifier: stock.InstrumentIdentifier },
          { price: stock.Close }
        );
      }
      console.log('Trade prices updated successfully');
    } else {
      console.log('No stock data found to update trades.');
    }
  } catch (error) {
    console.error('Error updating trade prices:', error);
  }
}

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/yourDatabaseName', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('Connected to MongoDB');
    console.log('Running trade price update task...');
    updateTradePrices().finally(() => mongoose.disconnect());
  })
  .catch((error) => console.error('Error connecting to MongoDB:', error));
