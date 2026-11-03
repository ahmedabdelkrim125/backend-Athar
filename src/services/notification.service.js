const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  validateDeviceDeletePayload,
  validateDevicePayload,
  validatePagination,
} = require('../validators/notification.validators');
const { isFirebaseConfigured, sendMulticast } = require('./firebase-admin.service');
const DEFAULT_MISSION_REMINDER_MINUTES = 60;
const DEFAULT_MISSION_REMINDER_WINDOW_MINUTES = 15;

const NOTIFICATION_TYPES = Object.freeze({
  MISSION_JOIN_REQUEST: 'MISSION_JOIN_REQUEST',
  MISSION_JOIN_APPROVED: 'MISSION_JOIN_APPROVED',
  MISSION_JOIN_REJECTED: 'MISSION_JOIN_REJECTED',
  MISSION_CANCELLED: 'MISSION_CANCELLED',
  MISSION_REMINDER: 'MISSION_REMINDER',
  MISSION_CHECK_IN: 'MISSION_CHECK_IN',
  MISSION_APPROVED: 'MISSION_APPROVED',
  REPORT_SUBMITTED: 'REPORT_SUBMITTED',
  REPORT_APPROVED: 'REPORT_APPROVED',
  REPORT_REJECTED: 'REPORT_REJECTED',
  EMERGENCY_SOS: 'EMERGENCY_SOS',
  EMERGENCY_STATUS: 'EMERGENCY_STATUS',
});

function serializeNotification(notification) {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    data: notification.data,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

async function deliverPushBestEffort(notification) {
  if (!isFirebaseConfigured()) return;

  try {
    const ownerWhere = notification.adminId
      ? { adminId: notification.adminId }
      : { userId: notification.userId };
    const devices = await prisma.userDevice.findMany({
      where: {
        ...ownerWhere,
        isActive: true,
      },
      select: {
        id: true,
        fcmToken: true,
      },
    });

    for (let index = 0; index < devices.length; index += 500) {
      const batch = devices.slice(index, index + 500);
      const result = await sendMulticast(
        batch.map((device) => device.fcmToken),
        notification,
      );

      if (!result) {
        return;
      }

      const invalidIds = [];
      result.responses.forEach((response, responseIndex) => {
        const code = response.error?.code;
        if (
          !response.success &&
          ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(
            code,
          )
        ) {
          invalidIds.push(batch[responseIndex].id);
        }
      });

      if (invalidIds.length > 0) {
        await prisma.userDevice.updateMany({
          where: { id: { in: invalidIds } },
          data: { isActive: false },
        });
      }
    }
  } catch (error) {
    console.error('Push notification delivery failed.', {
      code: error?.code || 'unknown',
    });
  }
}

async function createInAppNotification(input, dbClient = prisma) {
  let notification;

  try {
    notification = await dbClient.notification.create({
      data: {
        userId: input.userId ?? null,
        adminId: input.adminId ?? null,
        title: input.title,
        body: input.body,
        type: input.type,
        data: input.data || {},
        eventKey: input.eventKey || null,
      },
    });
  } catch (error) {
    if (error.code === 'P2002' && input.eventKey) {
      return null;
    }
    throw error;
  }

  if (dbClient === prisma) {
    await deliverPushBestEffort(notification);
  }

  return notification;
}

function recipientWhere(recipient) {
  const account =
    typeof recipient === 'object' && recipient !== null
      ? recipient
      : { id: recipient, accountType: 'VOLUNTEER' };
  if (!Number.isInteger(Number(account.id)) || Number(account.id) < 1) {
    throw new AppError('هوية الحساب غير صالحة', 400);
  }
  return account.accountType === 'ADMIN'
    ? { adminId: Number(account.id) }
    : { userId: Number(account.id) };
}

async function listNotifications(recipient, query) {
  const pagination = validatePagination(query);
  const where = recipientWhere(recipient);
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
    },
    notifications: notifications.map(serializeNotification),
  };
}

async function getUnreadCount(recipient) {
  const count = await prisma.notification.count({
    where: { ...recipientWhere(recipient), isRead: false },
  });
  return { unreadCount: count };
}

async function markNotificationRead(notificationId, recipient) {
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError('معرف الإشعار غير صالح', 400);
  }

  const result = await prisma.notification.updateMany({
    where: { id, ...recipientWhere(recipient), isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id, ...recipientWhere(recipient) },
    });
    if (!exists) throw new AppError('الإشعار غير موجود', 404);
  }
  return { message: 'تم تحديد الإشعار كمقروء' };
}

async function markAllNotificationsRead(recipient) {
  const result = await prisma.notification.updateMany({
    where: { ...recipientWhere(recipient), isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updatedCount: result.count };
}

async function deleteNotification(notificationId, recipient) {
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError('معرف الإشعار غير صالح', 400);
  }
  const result = await prisma.notification.deleteMany({
    where: { id, ...recipientWhere(recipient) },
  });
  if (result.count === 0) throw new AppError('الإشعار غير موجود', 404);
  return { message: 'تم حذف الإشعار' };
}

async function registerDevice(recipient, payload) {
  const account =
    typeof recipient === 'object' && recipient !== null
      ? recipient
      : { id: recipient, accountType: 'VOLUNTEER' };
  const ownerData =
    account.accountType === 'ADMIN'
      ? { adminId: account.id, userId: null }
      : { userId: account.id, adminId: null };
  const ownerWhere = account.accountType === 'ADMIN'
    ? { adminId: account.id }
    : { userId: account.id };
  const data = validateDevicePayload(payload);
  const existing = await prisma.userDevice.findUnique({
    where: { fcmToken: data.fcmToken },
    select: { id: true, userId: true, adminId: true },
  });

  if (
    existing &&
    (existing.userId !== ownerData.userId || existing.adminId !== ownerData.adminId)
  ) {
    throw new AppError('هذا الجهاز مسجل لحساب آخر', 409);
  }

  let device;
  if (existing) {
    device = await prisma.userDevice.update({
      where: { id: existing.id },
      data: { ...ownerData, platform: data.platform, isActive: true, lastSeenAt: new Date() },
      select: { id: true, platform: true, isActive: true, lastSeenAt: true },
    });
  } else {
    try {
      device = await prisma.userDevice.create({
        data: { ...ownerData, ...data, lastSeenAt: new Date() },
        select: { id: true, platform: true, isActive: true, lastSeenAt: true },
      });
    } catch (error) {
      if (error.code !== 'P2002') throw error;
      const owner = await prisma.userDevice.findUnique({
        where: { fcmToken: data.fcmToken },
        select: { id: true, userId: true, adminId: true },
      });
      if (
        !owner ||
        owner.userId !== ownerData.userId ||
        owner.adminId !== ownerData.adminId
      ) {
        throw new AppError('هذا الجهاز مسجل لحساب آخر', 409);
      }
      device = await prisma.userDevice.update({
        where: { id: owner.id },
        data: { platform: data.platform, isActive: true, lastSeenAt: new Date() },
        select: { id: true, platform: true, isActive: true, lastSeenAt: true },
      });
    }
  }
  return { message: 'تم تسجيل الجهاز بنجاح', device };
}

async function unregisterDevice(recipient, payload) {
  const { fcmToken } = validateDeviceDeletePayload(payload);
  const result = await prisma.userDevice.updateMany({
    where: { ...ownerWhereForDevice(recipient), fcmToken, isActive: true },
    data: { isActive: false },
  });
  if (result.count === 0) {
    throw new AppError('الجهاز غير مسجل لهذا المستخدم', 404);
  }
  return { message: 'تم إلغاء تسجيل الجهاز' };
}

function ownerWhereForDevice(recipient) {
  return recipientWhere(recipient);
}
function getTaskStartDate(task) {
  if (!task.startTime) return null;
  const date = new Date(task.date);
  const time = new Date(task.startTime);
  date.setUTCHours(time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds(), 0);
  return date;
}

function buildMissionReminderEventKey(taskId, userId, startsAt) {
  return `mission-reminder:${taskId}:${userId}:${startsAt.toISOString()}`;
}

function getPositiveMinutesSetting(name, fallback, maximum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

async function sendNotificationPush(notification) {
  if (notification) {
    await deliverPushBestEffort(notification);
  }
}

async function sendUpcomingMissionReminders(now = new Date()) {
  const reminderMinutes = getPositiveMinutesSetting(
    'MISSION_REMINDER_MINUTES',
    DEFAULT_MISSION_REMINDER_MINUTES,
    10080,
  );
  const windowMinutes = getPositiveMinutesSetting(
    'MISSION_REMINDER_WINDOW_MINUTES',
    DEFAULT_MISSION_REMINDER_WINDOW_MINUTES,
    1440,
  );
  const from = new Date(now.getTime() + reminderMinutes * 60 * 1000);
  const until = new Date(from.getTime() + windowMinutes * 60 * 1000);
  const firstDate = new Date(`${from.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const lastDate = new Date(`${until.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const tasks = await prisma.task.findMany({
    where: {
      approvalStatus: 'APPROVED',
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      date: { gte: firstDate, lte: lastDate },
      campaign: {
        status: { in: ['PUBLISHED', 'ACTIVE'] },
        endDate: { gte: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) },
      },
      volunteerTasks: {
        some: {
          status: 'ASSIGNED',
        },
      },
    },
    select: {
      id: true,
      title: true,
      date: true,
      startTime: true,
      volunteerTasks: {
        where: { status: 'ASSIGNED' },
        select: {
          volunteerId: true,
        },
      },
      missionJoinRequests: {
        where: { status: 'APPROVED' },
        select: { volunteerId: true },
      },
    },
  });

  let createdCount = 0;
  for (const task of tasks) {
    const startsAt = getTaskStartDate(task);
    if (!startsAt || startsAt < from || startsAt > until) continue;
    const approvedVolunteerIds = new Set(
      task.missionJoinRequests.map((request) => request.volunteerId),
    );

    for (const assignment of task.volunteerTasks) {
      if (!approvedVolunteerIds.has(assignment.volunteerId)) continue;
      const notification = await createInAppNotification({
        userId: assignment.volunteerId,
        title: 'تذكير بموعد المهمة',
        body: `تبدأ مهمة "${task.title}" قريبًا.`,
        type: NOTIFICATION_TYPES.MISSION_REMINDER,
        eventKey: buildMissionReminderEventKey(
          task.id,
          assignment.volunteerId,
          startsAt,
        ),
        data: {
          taskId: task.id,
          startsAt: startsAt.toISOString(),
          deepLink: `athar://missions/${task.id}`,
        },
      });

      if (notification) {
        createdCount += 1;
      }
    }
  }

  return {
    windowStart: from.toISOString(),
    windowEnd: until.toISOString(),
    notificationsCreated: createdCount,
  };
}

module.exports = {
  NOTIFICATION_TYPES,
  buildMissionReminderEventKey,
  createInAppNotification,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDevice,
  serializeNotification,
  sendNotificationPush,
  sendUpcomingMissionReminders,
  unregisterDevice,
};
