const prisma = require('../lib/prisma');
const { validatePagination } = require('../validators/notification.validators');

async function writeAuditLog(input, dbClient = prisma) {
  return dbClient.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      adminId: input.adminId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: String(input.targetId),
      reason: input.reason ?? null,
      data: input.data ?? undefined,
    },
  });
}

async function listAuditLogs(query = {}) {
  const pagination = validatePagination(query);
  const where = {};
  if (query.targetType) where.targetType = String(query.targetType);
  if (query.targetId) where.targetId = String(query.targetId);
  if (query.action) where.action = String(query.action);
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, fullName: true } },
        admin: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
    },
    auditLogs: logs.map((log) => {
      const { actor, admin, ...entry } = log;
      return {
        ...entry,
        performedBy: admin
          ? { id: admin.id, fullName: admin.fullName, role: 'ADMIN' }
          : actor
            ? { id: actor.id, fullName: actor.fullName, role: 'VOLUNTEER' }
            : null,
        createdAt: log.createdAt.toISOString(),
      };
    }),
  };
}

module.exports = {
  listAuditLogs,
  writeAuditLog,
};
