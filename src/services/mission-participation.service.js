const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const notificationService = require('./notification.service');
const {
  validateMissionApprovalPayload,
} = require('../validators/mission.validators');
const { parsePositiveInteger } = require('../validators/resource.validators');
const { syncTaskStatusFromAssignments } = require('./task-assignment.service');
const { canManageCampaignById } = require('../middleware/rbac.middleware');
const { writeAuditLog } = require('./audit.service');
const { NOTIFICATION_TYPES } = notificationService;
const volunteerLocationService = require('./volunteer-location.service');

const joinRequestSelect = {
  id: true,
  taskId: true,
  volunteerId: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  rejectionReason: true,
  volunteer: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      status: true,
    },
  },
};

async function getTaskForManager(taskId, actor) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          createdById: true,
          status: true,
        },
      },
    },
  });
  if (!task) throw new AppError('المهمة غير موجودة', 404);
  if (!(await canManageCampaignById(actor, task.campaign))) {
    throw new AppError('غير مسموح لك بإدارة هذه المهمة', 403);
  }
  return task;
}

async function setMissionApproval(taskId, payload, actor) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const { status } = validateMissionApprovalPayload(payload);
  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
    const existing = await transactionClient.task.findUnique({
      where: { id: parsedTaskId },
      include: { campaign: { select: { createdById: true } } },
    });
    if (!existing) throw new AppError('المهمة غير موجودة', 404);
    if (!(await canManageCampaignById(actor, existing.campaign, transactionClient))) {
      throw new AppError('غير مسموح لك بإدارة هذه المهمة', 403);
    }
    const canDecide =
      existing.approvalStatus === 'PENDING_APPROVAL' ||
      (existing.approvalStatus === 'APPROVED' && status === 'CANCELLED');
    if (!canDecide) {
      throw new AppError('لا يمكن تغيير حالة اعتماد المهمة الحالية', 409);
    }

    const task = await transactionClient.task.update({
      where: { id: parsedTaskId },
      data: {
        approvalStatus: status,
        approvedById: null,
        approvedByAdminId: status === 'APPROVED' ? actor.id : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      },
      select: {
        id: true,
        title: true,
        approvalStatus: true,
        approvedAt: true,
        approvedById: true,
      },
    });
    await writeAuditLog(
      {
        adminId: actor.id,
        action: 'MISSION_APPROVAL_CHANGED',
        targetType: 'TASK',
        targetId: parsedTaskId,
        data: { from: existing.approvalStatus, to: status },
      },
      transactionClient,
    );
    let notifications = [];
    if (status === 'APPROVED') {
      notifications = await volunteerLocationService.createMissionApprovalNotifications(
        parsedTaskId,
        actor,
        transactionClient,
      );
    } else if (status === 'CANCELLED') {
      const participants = await transactionClient.missionJoinRequest.findMany({
        where: { taskId: parsedTaskId, status: { in: ['PENDING', 'APPROVED'] } },
        select: { volunteerId: true },
      });
      await transactionClient.missionJoinRequest.updateMany({
        where: { taskId: parsedTaskId, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'CANCELLED', decidedAt: new Date() },
      });
      await transactionClient.volunteerTask.updateMany({
        where: { taskId: parsedTaskId, status: 'ASSIGNED' },
        data: { status: 'CANCELLED' },
      });
      notifications = (
        await Promise.all(
          [...new Set(participants.map((participant) => participant.volunteerId))].map(
            (userId) =>
              notificationService.createInAppNotification(
                {
                  userId,
                  title: 'تم إلغاء المهمة',
                  body: `تم إلغاء المهمة "${existing.title}".`,
                  type: NOTIFICATION_TYPES.MISSION_CANCELLED,
                  eventKey: `mission-cancelled:${parsedTaskId}`,
                  data: { taskId: parsedTaskId, status: 'CANCELLED' },
                },
                transactionClient,
              ),
          ),
        )
      ).filter(Boolean);
    }
    return { task, notifications };
  });
  await volunteerLocationService.dispatchMissionApprovalNotifications(result.notifications);
  return { message: 'تم تحديث حالة اعتماد المهمة', mission: result.task };
}

async function createJoinRequest(taskId, volunteerId) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
    const task = await transactionClient.task.findUnique({
      where: { id: parsedTaskId },
      select: {
        id: true,
        title: true,
        approvalStatus: true,
        status: true,
        date: true,
        requiredVolunteers: true,
        campaign: {
          select: { createdById: true, status: true, endDate: true },
        },
      },
    });
    if (!task) throw new AppError('المهمة غير موجودة', 404);
    if (
      task.approvalStatus !== 'APPROVED' ||
      !['PUBLISHED', 'ACTIVE'].includes(task.campaign.status)
    ) {
      throw new AppError('لا يمكن طلب الانضمام إلى مهمة غير معتمدة أو غير منشورة', 409);
    }
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    if (
      ['CANCELLED', 'COMPLETED'].includes(task.status) ||
      task.date < today ||
      task.campaign.endDate < today
    ) {
      throw new AppError('المهمة منتهية أو ملغاة', 409);
    }
    if (task.campaign.createdById === volunteerId) {
      throw new AppError('منشئ المهمة لا يحتاج إلى إرسال طلب انضمام', 400);
    }

    const existing = await transactionClient.missionJoinRequest.findUnique({
      where: {
        volunteerId_taskId: { volunteerId, taskId: parsedTaskId },
      },
    });
    if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) {
      throw new AppError('لديك طلب انضمام قائم لهذه المهمة', 409);
    }

    const [participants, pendingRequests] = await Promise.all([
      transactionClient.volunteerTask.count({
        where: { taskId: parsedTaskId, status: { not: 'CANCELLED' } },
      }),
      transactionClient.missionJoinRequest.count({
        where: { taskId: parsedTaskId, status: 'PENDING' },
      }),
    ]);
    if (
      task.requiredVolunteers !== null &&
      participants + pendingRequests >= task.requiredVolunteers
    ) {
      throw new AppError('اكتمل عدد الأماكن المتاحة للمهمة', 409);
    }

    const now = new Date();
    const request = existing
      ? await transactionClient.missionJoinRequest.update({
          where: { id: existing.id },
          data: { status: 'PENDING', createdAt: now, updatedAt: now, decidedAt: null },
          select: joinRequestSelect,
        })
      : await transactionClient.missionJoinRequest.create({
          data: { taskId: parsedTaskId, volunteerId },
          select: joinRequestSelect,
        });
    const admins = await transactionClient.admin.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const notifications = [];
    for (const admin of admins) {
      const notification = await notificationService.createInAppNotification(
        {
          adminId: admin.id,
          title: 'طلب انضمام جديد',
          body: `لديك طلب انضمام جديد إلى مهمة "${task.title}".`,
          type: NOTIFICATION_TYPES.MISSION_JOIN_REQUEST,
          eventKey: `mission-join-request:${request.id}:${request.createdAt.toISOString()}`,
          data: {
            taskId: parsedTaskId,
            joinRequestId: request.id,
            deepLink: `athar://missions/${parsedTaskId}/join-requests`,
          },
        },
        transactionClient,
      );
      if (notification) notifications.push(notification);
    }
    return { request, notifications };
  });

  for (const notification of result.notifications) {
    await notificationService.sendNotificationPush(notification);
  }
  return { message: 'تم إرسال طلب الانضمام للمراجعة', joinRequest: result.request };
}

async function listJoinRequests(taskId, actor, query = {}) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const task = await getTaskForManager(parsedTaskId, actor);
  const status =
    typeof query.status === 'string' &&
    ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(query.status.toUpperCase())
      ? query.status.toUpperCase()
      : undefined;
  if (query.status && !status) throw new AppError('حالة طلب الانضمام غير صالحة', 400);
  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;
  if (limit > 100) throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  const where = { taskId: parsedTaskId, ...(status ? { status } : {}) };
  const [requests, total] = await Promise.all([
    prisma.missionJoinRequest.findMany({
      where,
      select: joinRequestSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.missionJoinRequest.count({ where }),
  ]);
  return {
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    mission: {
      id: task.id,
      title: task.title,
      campaign: { id: task.campaign.id, title: task.campaign.title },
    },
    joinRequests: requests,
  };
}

async function decideJoinRequest(taskId, requestId, status, actor, payload = {}) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف طلب الانضمام');
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new AppError('قرار طلب الانضمام غير صالح', 400);
  }

  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
    const task = await transactionClient.task.findUnique({
      where: { id: parsedTaskId },
      include: { campaign: { select: { createdById: true, status: true } } },
    });
    if (!task) throw new AppError('المهمة غير موجودة', 404);
    if (!(await canManageCampaignById(actor, task.campaign, transactionClient))) {
      throw new AppError('غير مسموح لك بإدارة هذه المهمة', 403);
    }
    const request = await transactionClient.missionJoinRequest.findUnique({
      where: { id: parsedRequestId },
      select: joinRequestSelect,
    });
    if (!request || request.taskId !== parsedTaskId) {
      throw new AppError('طلب الانضمام غير موجود', 404);
    }
    if (request.status !== 'PENDING') {
      throw new AppError('تمت معالجة طلب الانضمام مسبقًا', 409);
    }
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    if (status === 'REJECTED' && reason.length > 1000) {
      throw new AppError('سبب الرفض يجب ألا يتجاوز 1000 حرف', 400);
    }

    if (status === 'APPROVED') {
      if (
        task.approvalStatus !== 'APPROVED' ||
        !['PUBLISHED', 'ACTIVE'].includes(task.campaign.status) ||
        ['CANCELLED', 'COMPLETED'].includes(task.status)
      ) {
        throw new AppError('لا يمكن قبول طلب لمهمة غير معتمدة أو غير منشورة', 409);
      }
      const participants = await transactionClient.volunteerTask.count({
        where: { taskId: parsedTaskId, status: { not: 'CANCELLED' } },
      });
      if (task.requiredVolunteers !== null && participants >= task.requiredVolunteers) {
        throw new AppError('اكتمل عدد الأماكن المتاحة للمهمة', 409);
      }
      await transactionClient.volunteerTask.create({
        data: {
          taskId: parsedTaskId,
          volunteerId: request.volunteerId,
          status: 'ASSIGNED',
        },
      });
      await syncTaskStatusFromAssignments(transactionClient, parsedTaskId);
    }

    const updatedRequest = await transactionClient.missionJoinRequest.update({
      where: { id: parsedRequestId },
      data: {
        status,
        decidedAt: new Date(),
        rejectionReason: status === 'REJECTED' ? reason || null : null,
      },
      select: joinRequestSelect,
    });
    await writeAuditLog(
      {
        adminId: actor.id,
        action: `JOIN_REQUEST_${status}`,
        targetType: 'MISSION_JOIN_REQUEST',
        targetId: parsedRequestId,
        reason: status === 'REJECTED' ? reason || null : null,
        data: { taskId: parsedTaskId, volunteerId: updatedRequest.volunteerId },
      },
      transactionClient,
    );
    const notification = await notificationService.createInAppNotification(
      {
        userId: updatedRequest.volunteerId,
        title: status === 'APPROVED' ? 'تم قبول طلب الانضمام' : 'تم رفض طلب الانضمام',
        body:
          status === 'APPROVED'
            ? 'تم قبول طلبك، يمكنك الآن الحضور للمهمة.'
            : reason
              ? `نعتذر، لم يتم قبول طلب انضمامك للمهمة. السبب: ${reason}`
              : 'نعتذر، لم يتم قبول طلب انضمامك للمهمة.',
        type:
          status === 'APPROVED'
            ? NOTIFICATION_TYPES.MISSION_JOIN_APPROVED
            : NOTIFICATION_TYPES.MISSION_JOIN_REJECTED,
        eventKey: `mission-join-${status.toLowerCase()}:${updatedRequest.id}`,
        data: {
          taskId: parsedTaskId,
          joinRequestId: updatedRequest.id,
          status,
          deepLink: `athar://missions/${parsedTaskId}`,
        },
      },
      transactionClient,
    );
    return { request: updatedRequest, notification };
  });

  await notificationService.sendNotificationPush(result.notification);
  return {
    message: status === 'APPROVED' ? 'تم قبول طلب الانضمام' : 'تم رفض طلب الانضمام',
    joinRequest: result.request,
  };
}

async function cancelJoinRequest(taskId, volunteerId) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
    return transactionClient.missionJoinRequest.updateMany({
      where: { taskId: parsedTaskId, volunteerId, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
  });
  if (result.count === 0) {
    throw new AppError('لا يوجد طلب قيد الانتظار لإلغائه', 404);
  }
  return { message: 'تم إلغاء طلب الانضمام' };
}

module.exports = {
  cancelJoinRequest,
  createJoinRequest,
  decideJoinRequest,
  listJoinRequests,
  setMissionApproval,
};
