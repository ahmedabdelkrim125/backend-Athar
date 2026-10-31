// Local development entry point.
// Vercel serves the exported Express app from src/app.js directly.

require('dotenv').config();

const env = require('./config/env');
const { validateEnvironment } = require('./utils/startup');

// Validate required environment variables for local server startup.
validateEnvironment();

const app = require('./app');
const prisma = require('./lib/prisma');

const server = app.listen(env.port, env.host, () => {
  const printableHost =
    env.host === '0.0.0.0' ? 'localhost' : env.host;

  console.log(
    `Sanad backend listening on http://${printableHost}:${env.port}`
  );
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error(
        'Error while disconnecting Prisma:',
        error.message || error
      );
    } finally {
      process.exit(0);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));