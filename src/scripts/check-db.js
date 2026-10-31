require('dotenv').config();

const env = require('../config/env');

function hasPlaceholderDatabaseUrl(databaseUrl) {
  return (
    !databaseUrl ||
    databaseUrl.includes('mysql://USER:PASSWORD@') ||
    databaseUrl.includes('mysql://user:password@')
  );
}

async function main() {
  if (hasPlaceholderDatabaseUrl(env.databaseUrl)) {
    console.error(
      'Database URL is missing or still placeholder. Set DATABASE_URL, MYSQL_URL, or Railway MySQL variables.',
    );
    process.exit(1);
  }

  const prisma = require('../lib/prisma');

  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe('SELECT 1 AS ok');
    console.log('Database connection is healthy.');
  } catch (error) {
    console.error('Database connection failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
