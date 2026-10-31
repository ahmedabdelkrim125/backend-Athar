const { PrismaClient } = require('@prisma/client');
const env = require('../config/env');

const globalForPrisma = globalThis;

function createPrismaClient() {
  if (!env.databaseUrl) {
    throw new Error(
      'Database connection is not configured. Set DATABASE_URL, MYSQL_URL, or Railway MySQL vars first.',
    );
  }

  return new PrismaClient({
    log: ['error', 'warn'],
  });
}

const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;