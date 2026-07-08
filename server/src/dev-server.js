/**
 * Local dev entry point — runs the API against an in-memory MongoDB so you can
 * try the app with zero database setup. Data persists in ./.mongo-data between
 * restarts. Production still uses src/server.js + a real MONGODB_URI.
 *
 *   npm run dev:local     (this file)
 *   npm run seed:local    (seeds against the mongod this process keeps alive)
 */
const path = require('path');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const DB_PATH = path.join(__dirname, '..', '.mongo-data');
const PORT = 27017; // matches the default MONGODB_URI in .env

async function main() {
  fs.mkdirSync(DB_PATH, { recursive: true });

  console.log('[local-db] starting embedded MongoDB (first run downloads the binary)…');
  const mongod = await MongoMemoryServer.create({
    instance: { port: PORT, dbPath: DB_PATH, storageEngine: 'wiredTiger' },
  });
  console.log(`[local-db] ready → ${mongod.getUri()}`);

  // Boot the normal server; env already points at 127.0.0.1:27017.
  require('./server');

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[local-db] failed to start:', err);
  process.exit(1);
});
