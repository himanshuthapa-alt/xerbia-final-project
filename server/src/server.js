const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');

async function main() {
  await connectDB();
  app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('[api] fatal startup error:', err);
  process.exit(1);
});
