function isSchemaMissingError(error) {
  return error?.code === 'P2021' || error?.code === 'P2022';
}

async function verifyDatabaseConnection(prisma) {
  await prisma.$queryRawUnsafe('SELECT 1 AS ok');
}

async function verifyDatabaseSchema(prisma) {
  await Promise.all([
    prisma.volunteer.findFirst({
      select: { id: true, role: true, locationSharingEnabled: true },
    }),
    prisma.admin.findFirst({ select: { id: true, role: true, isActive: true } }),
    prisma.adminAuthSession.findFirst({ select: { id: true, adminId: true } }),
    prisma.volunteerTitle.findFirst({ select: { id: true } }),
    prisma.missionJoinRequest.findFirst({
      select: { id: true, rejectionReason: true },
    }),
    prisma.notification.findFirst({ select: { id: true, eventKey: true } }),
    prisma.sosRequest.findFirst({
      select: { id: true, taskId: true, lastUpdatedAt: true },
    }),
    prisma.volunteerLocationUpdate.findFirst({
      select: { id: true, expiresAt: true },
    }),
    prisma.auditLog.findFirst({ select: { id: true } }),
    prisma.rateLimitBucket.findFirst({ select: { id: true } }),
  ]);
}

module.exports = {
  isSchemaMissingError,
  verifyDatabaseConnection,
  verifyDatabaseSchema,
};
