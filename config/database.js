// config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Get the connection string from environment variables
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These options are recommended to avoid deprecation warnings
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Exit process with failure code
    process.exit(1);
  }
};

// Handle application termination gracefully
mongoose.connection.on('disconnected', () => {
  console.log('ℹ️  MongoDB disconnected');
});

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('ℹ️  MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = connectDB;