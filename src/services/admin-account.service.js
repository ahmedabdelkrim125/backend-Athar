const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  validateAdminCreatePayload,
  validateAdminUpdatePayload,
  validatePasswordChangePayload,
} = require('../validators/admin-auth.validators');
const { validatePagination } = require('../validators/notification.validators');
const { writeAuditLog } = require('./audit.service');

function serializeAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: 'ADMIN',
    isActive: admin.isActive,
    mustChangePassword: admin.mustChangePassword,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
  };
}

function validateAdminId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError('معرف الأدمن غير صالح', 400);
  return id;
}

async function listAdmins(query = {}) {
  const pagination = validatePagination(query);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) throw new AppError('البحث يجب ألا يتجاوز 100 حرف', 400);
  const where = search
    ? { OR: [{ fullName: { contains: search } }, { email: { contains: search } }] }
    : {};
  const [admins, total] = await Promise.all([
    prisma.admin.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.admin.count({ where }),
  ]);
  return {
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
    },
    admins: admins.map(serializeAdmin),
  };
}

async function createAdmin(actor, payload) {
  const data = validateAdminCreatePayload(payload);
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    return await prisma.$transaction(async (transactionClient) => {
      const admin = await transactionClient.admin.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          passwordHash,
          role: 'ADMIN',
          isActive: true,
          mustChangePassword: true,
        },
      });
      await writeAuditLog(
        {
          adminId: actor.id,
          action: 'ADMIN_CREATED',
          targetType: 'ADMIN',
          targetId: admin.id,
        },
        transactionClient,
      );
      return { admin: serializeAdmin(admin) };
    });
  } catch (error) {
    if (error.code === 'P2002') throw new AppError('البريد الإلكتروني مستخدم لحساب أدمن آخر', 409);
    throw error;
  }
}

async function updateAdmin(actor, adminId, payload) {
  const id = validateAdminId(adminId);
  const changes = validateAdminUpdatePayload(payload);
  if (id === actor.id && changes.isActive === false) {
    throw new AppError('لا يمكنك تعطيل حسابك بنفسك', 409);
  }
  return prisma.$transaction(async (transactionClient) => {
    const target = await transactionClient.admin.findUnique({ where: { id } });
    if (!target) throw new AppError('حساب الأدمن غير موجود', 404);
    if (
      changes.isActive === false &&
      target.isActive &&
      (await transactionClient.admin.count({ where: { isActive: true } })) <= 1
    ) {
      throw new AppError('لا يمكن تعطيل آخر حساب أدمن نشط', 409);
    }
    let admin;
    try {
      admin = await transactionClient.admin.update({ where: { id }, data: changes });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new AppError('البريد الإلكتروني مستخدم لحساب أدمن آخر', 409);
      }
      throw error;
    }
    if (changes.isActive === false) {
      await transactionClient.adminAuthSession.updateMany({
        where: { adminId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await writeAuditLog(
      {
        adminId: actor.id,
        action: 'ADMIN_UPDATED',
        targetType: 'ADMIN',
        targetId: id,
        data: {
          changes: Object.fromEntries(
            Object.entries(changes).map(([key, value]) => [
              key,
              key === 'email' || key === 'fullName' || key === 'isActive' ? value : undefined,
            ]),
          ),
        },
      },
      transactionClient,
    );
    return { admin: serializeAdmin(admin) };
  });
}

async function resetAdminPassword(actor, adminId, payload) {
  const id = validateAdminId(adminId);
  if (id === actor.id) {
    throw new AppError('استخدم مسار تغيير كلمة المرور لتحديث حسابك', 409);
  }
  const { newPassword } = validatePasswordChangePayload(payload, { requireCurrent: false });
  const passwordHash = await bcrypt.hash(newPassword, 12);
  return prisma.$transaction(async (transactionClient) => {
    const target = await transactionClient.admin.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!target) throw new AppError('حساب الأدمن غير موجود', 404);
    await transactionClient.admin.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
    });
    await transactionClient.adminAuthSession.updateMany({
      where: { adminId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(
      {
        adminId: actor.id,
        action: 'ADMIN_PASSWORD_RESET',
        targetType: 'ADMIN',
        targetId: id,
      },
      transactionClient,
    );
    return { message: 'تم تعيين كلمة مرور جديدة وإنهاء جميع جلسات الحساب' };
  });
}

async function getDashboardStatistics(now = new Date()) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const [
    volunteers,
    activeVolunteers,
    campaigns,
    tasks,
    upcomingTasks,
    runningTasks,
    completedTasks,
    pendingJoinRequests,
    pendingReports,
    volunteerTotals,
    openIncidents,
  ] = await Promise.all([
    prisma.volunteer.count(),
    prisma.volunteer.count({ where: { status: 'ACTIVE' } }),
    prisma.campaign.count(),
    prisma.task.count(),
    prisma.task.count({
      where: { approvalStatus: 'APPROVED', status: { notIn: ['CANCELLED', 'COMPLETED'] }, date: { gte: tomorrow } },
    }),
    prisma.task.count({
      where: { approvalStatus: 'APPROVED', status: { notIn: ['CANCELLED', 'COMPLETED'] }, date: today },
    }),
    prisma.task.count({ where: { status: 'COMPLETED' } }),
    prisma.missionJoinRequest.count({ where: { status: 'PENDING' } }),
    prisma.report.count({ where: { approvalStatus: 'PENDING_REVIEW' } }),
    prisma.volunteer.aggregate({
      _sum: { totalHours: true, points: true },
    }),
    prisma.sosRequest.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
  ]);
  return {
    statistics: {
      volunteers: { total: volunteers, active: activeVolunteers },
      campaigns: { total: campaigns },
      tasks: { total: tasks, upcoming: upcomingTasks, running: runningTasks, completed: completedTasks },
      pendingJoinRequests,
      pendingReports,
      volunteerTotals: {
        hours: volunteerTotals._sum.totalHours || 0,
        points: volunteerTotals._sum.points || 0,
      },
      emergencyIncidents: { open: openIncidents },
    },
  };
}

module.exports = {
  createAdmin,
  getDashboardStatistics,
  listAdmins,
  resetAdminPassword,
  updateAdmin,
};
