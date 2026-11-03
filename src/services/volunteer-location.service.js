const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  buildNearbyBounds,
  calculateHaversineDistanceMeters,
} = require('../utils/nearby-missions');
const {
  validateLocationSharingPayload,
  validateVolunteerLocationPayload,
} = require('../validators/location.validators');
const notificationService = require('./notification.service');
const { writeAuditLog } = require('./audit.service');

function getPositiveSetting(name, fallback, maximum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function isEligibleNearbyVolunteerLocation(
  volunteer,
  missionLocation,
  limits,
  now = new Date(),
) {
  if (!volunteer.locationSharingEnabled) return false;
  const updatedAt = volunteer.locationLastUpdatedAt
    ? new Date(volunteer.locationLastUpdatedAt)
    : null;
  const accuracy = Number(volunteer.locationAccuracy);
  if (
    !updatedAt ||
    updatedAt > now ||
    updatedAt < limits.cutoff ||
    !Number.isFinite(accuracy) ||
    accuracy > limits.maxAccuracyMeters
  ) {
    return false;
  }
  const latitude = Number(volunteer.lastKnownLatitude);
  const longitude = Number(volunteer.lastKnownLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const distance = calculateHaversineDistanceMeters(
    missionLocation.latitude,
    missionLocation.longitude,
    latitude,
    longitude,
  );
  return distance + accuracy <= limits.radiusMeters;
}

async function setLocationSharing(userId, payload) {
  const { enabled } = validateLocationSharingPayload(payload);
  const current = await prisma.volunteer.findUnique({
    where: { id: userId },
    select: { locationSharingEnabled: true },
  });
  if (!current) throw new AppError('المستخدم غير موجود', 404);
  if (current.locationSharingEnabled === enabled) {
    return { message: 'إعداد مشاركة الموقع لم يتغير', locationSharingEnabled: enabled };
  }

  const result = await prisma.$transaction(async (transactionClient) => {
    const volunteer = await transactionClient.volunteer.update({
      where: { id: userId },
      data: enabled
        ? {
            locationSharingEnabled: true,
            lastKnownLatitude: null,
            lastKnownLongitude: null,
            locationAccuracy: null,
            locationLastUpdatedAt: null,
          }
        : {
            locationSharingEnabled: false,
            lastKnownLatitude: null,
            lastKnownLongitude: null,
            locationAccuracy: null,
            locationLastUpdatedAt: null,
          },
      select: { locationSharingEnabled: true },
    });
    await transactionClient.volunteerLocationAccessLog.create({
      data: {
        volunteerId: userId,
        accessedById: userId,
        purpose: enabled ? 'OWNER_LOCATION_UPDATE' : 'OWNER_LOCATION_DISABLE',
      },
    });
    await writeAuditLog(
      {
        actorId: userId,
        action: enabled ? 'LOCATION_SHARING_ENABLED' : 'LOCATION_SHARING_DISABLED',
        targetType: 'VOLUNTEER',
        targetId: userId,
      },
      transactionClient,
    );
    return volunteer;
  });
  return {
    message: enabled ? 'تم تفعيل مشاركة الموقع، أرسل موقعك لتحديثه' : 'تم إيقاف مشاركة الموقع وحذف الموقع المحفوظ',
    locationSharingEnabled: result.locationSharingEnabled,
  };
}

async function updateLastKnownLocation(userId, payload) {
  const location = validateVolunteerLocationPayload(payload);
  const result = await prisma.$transaction(async (transactionClient) => {
    const volunteer = await transactionClient.volunteer.findUnique({
      where: { id: userId },
      select: { locationSharingEnabled: true },
    });
    if (!volunteer) throw new AppError('المستخدم غير موجود', 404);
    if (!volunteer.locationSharingEnabled) {
      throw new AppError('فعّل مشاركة الموقع أولًا لإرسال الإحداثيات', 409);
    }

    const updated = await transactionClient.volunteer.update({
      where: { id: userId },
      data: {
        lastKnownLatitude: location.latitude,
        lastKnownLongitude: location.longitude,
        locationAccuracy: location.accuracyMeters,
        locationLastUpdatedAt: new Date(),
      },
      select: {
        locationSharingEnabled: true,
        locationLastUpdatedAt: true,
        locationAccuracy: true,
      },
    });
    await transactionClient.volunteerLocationAccessLog.create({
      data: {
        volunteerId: userId,
        accessedById: userId,
        purpose: 'OWNER_LOCATION_UPDATE',
      },
    });
    return updated;
  });
  return {
    message: 'تم تحديث الموقع الحالي',
    location: {
      locationSharingEnabled: result.locationSharingEnabled,
      accuracyMeters: Number(result.locationAccuracy),
      lastUpdatedAt: result.locationLastUpdatedAt.toISOString(),
    },
  };
}

async function updateLocationFromNearbyRequest(userId, filters) {
  if (filters.accuracyMeters === undefined) return;
  const volunteer = await prisma.volunteer.findUnique({
    where: { id: userId },
    select: { locationSharingEnabled: true },
  });
  if (!volunteer?.locationSharingEnabled) return;
  await updateLastKnownLocation(userId, {
    latitude: filters.latitude,
    longitude: filters.longitude,
    accuracyMeters: filters.accuracyMeters,
  });
}

async function listLocationAccessLogs(userId, query = {}) {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('بيانات الصفحات غير صالحة', 400);
  }
  const where = { volunteerId: userId };
  const [logs, total] = await Promise.all([
    prisma.volunteerLocationAccessLog.findMany({
      where,
      select: {
        id: true,
        accessedById: true,
        taskId: true,
        purpose: true,
        accessedAt: true,
      },
      orderBy: [{ accessedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.volunteerLocationAccessLog.count({ where }),
  ]);
  return {
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    accessLogs: logs.map((log) => ({
      ...log,
      accessedAt: log.accessedAt.toISOString(),
    })),
  };
}

async function createMissionApprovalNotifications(taskId, actor, dbClient) {
  const task = await dbClient.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      attendanceRadiusMeters: true,
      location: { select: { latitude: true, longitude: true } },
      campaign: {
        select: {
          status: true,
          attendanceRadiusMeters: true,
        },
      },
    },
  });
  if (!task || !['PUBLISHED', 'ACTIVE'].includes(task.campaign.status)) {
    return [];
  }

  const notificationRadius = getPositiveSetting(
    'MISSION_NEARBY_NOTIFICATION_RADIUS_METERS',
    10000,
    100000,
  );
  const maxAccuracy = getPositiveSetting('NEARBY_LOCATION_MAX_ACCURACY_METERS', 100, 10000);
  const maxAgeMinutes = getPositiveSetting('NEARBY_LOCATION_MAX_AGE_MINUTES', 15, 1440);
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);
  const latitude = Number(task.location.latitude);
  const longitude = Number(task.location.longitude);
  const bounds = buildNearbyBounds(latitude, longitude, notificationRadius);
  const where = {
    status: 'ACTIVE',
    locationSharingEnabled: true,
    locationLastUpdatedAt: { gte: cutoff, lte: now },
    locationAccuracy: { lte: maxAccuracy },
    lastKnownLatitude: { gte: bounds.minLatitude, lte: bounds.maxLatitude },
  };
  if (bounds.longitude?.OR) {
    where.OR = bounds.longitude.OR.map((range) => ({
      lastKnownLongitude: range,
    }));
  } else if (bounds.longitude !== null) {
    where.lastKnownLongitude = { gte: bounds.minLongitude, lte: bounds.maxLongitude };
  }

  const candidates = await dbClient.volunteer.findMany({
    where: {
      ...where,
    },
    select: {
      id: true,
      locationSharingEnabled: true,
      lastKnownLatitude: true,
      lastKnownLongitude: true,
      locationAccuracy: true,
      locationLastUpdatedAt: true,
    },
  });
  const recipients = candidates.filter((candidate) =>
    isEligibleNearbyVolunteerLocation(
      candidate,
      { latitude, longitude },
      {
        cutoff,
        maxAccuracyMeters: maxAccuracy,
        radiusMeters: notificationRadius,
      },
      now,
    ),
  );

  if (candidates.length > 0) {
    await dbClient.volunteerLocationAccessLog.createMany({
      data: candidates.map((candidate) => ({
        volunteerId: candidate.id,
        accessedByAdminId: actor.id,
        taskId,
        purpose: 'MISSION_APPROVAL_TARGETING',
      })),
    });
  }

  const notifications = [];
  for (const recipient of recipients) {
    const notification = await notificationService.createInAppNotification(
      {
        userId: recipient.id,
        title: 'مهمة تطوعية قريبة منك',
        body: `تم اعتماد مهمة "${task.title}" بالقرب منك.`,
        type: notificationService.NOTIFICATION_TYPES.MISSION_APPROVED,
        eventKey: `mission-approved:${taskId}:${recipient.id}`,
        data: {
          taskId,
          deepLink: `athar://missions/${taskId}`,
        },
      },
      dbClient,
    );
    if (notification) notifications.push(notification);
  }
  return notifications;
}

async function dispatchMissionApprovalNotifications(notifications) {
  for (const notification of notifications) {
    await notificationService.sendNotificationPush(notification);
  }
}

module.exports = {
  createMissionApprovalNotifications,
  dispatchMissionApprovalNotifications,
  isEligibleNearbyVolunteerLocation,
  listLocationAccessLogs,
  setLocationSharing,
  updateLastKnownLocation,
  updateLocationFromNearbyRequest,
};
