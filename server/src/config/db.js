const mongoose = require('mongoose');
const env = require('./env');

// Fail fast instead of buffering queries forever when Mongo is down.
mongoose.set('bufferCommands', false);

async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`[db] connected → ${mongoose.connection.name}`);
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    console.error('[db] API will start anyway; data routes will return 503 until Mongo is reachable.');
  }

  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));
}

module.exports = { connectDB };
