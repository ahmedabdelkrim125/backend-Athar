require('dotenv').config();

const env = require('./config/env');
const { ensureDatabaseReadiness, validateEnvironment } = require('./utils/startup');

let server;
let prisma;

async function startServer() {
  validateEnvironment();
  const app = require('./app');
  prisma = require('./lib/prisma');

  try {
    await ensureDatabaseReadiness({
      retries: 6,
      delayMs: 5000,
    });
    console.log(
      `Database connection and schema verified${env.databaseUrlSource ? ` via ${env.databaseUrlSource}` : ''}.`,
    );
  } catch (error) {
    console.error(
      'Database was not fully ready during startup. The API will still boot and /api/health will report the current DB/schema state.',
    );
    console.error(error.message || error);
  }

  server = app.listen(env.port, env.host, () => {
    const printableHost = env.host === '0.0.0.0' ? 'localhost' : env.host;
    console.log(`Sanad backend listening on http://${printableHost}:${env.port}`);
  });
}

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  if (!server || !prisma) {
    if (!prisma) {
      process.exit(0);
      return;
    }

    prisma.$disconnect().finally(() => process.exit(0));
    return;
  }

  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch(async (error) => {
  console.error('Failed to start backend.');
  console.error(error.message || error);
  if (prisma) {
    await prisma.$disconnect().catch(() => {});
  }
  process.exit(1);
});
