function isSchemaMissingError(error) {
  return error?.code === 'P2021' || error?.code === 'P2022';
}

async function verifyDatabaseConnection(prisma) {
  await prisma.$queryRawUnsafe('SELECT 1 AS ok');
}

async function verifyDatabaseSchema(prisma) {
  await prisma.volunteer.findFirst({
    select: {
      id: true,
    },
  });
}

module.exports = {
  isSchemaMissingError,
  verifyDatabaseConnection,
  verifyDatabaseSchema,
};
