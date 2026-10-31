const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

function createPrismaClient() {
  // Do not throw here when DATABASE_URL is missing.
  // This allows the Express app to start on serverless platforms.
  // Prisma will report the configuration error when a DB query is executed.

  return new PrismaClient({
    log: ['error', 'warn'],
  });
}

const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;