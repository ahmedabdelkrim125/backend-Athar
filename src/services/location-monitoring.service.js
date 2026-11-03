const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { writeAuditLog } = require('./audit.service');
const { hasPermission } = require('../middleware/rbac.middleware');
const {
  validateLocationAccessQuery,
  validateMissionLocationUpdatePayload,
} = require('../validators/emergency.validators');
const RETENTION_DAYS = 30;
const FRESHNESS_MINUTES = 15;
const ACTIVE_INCIDENT_STATUSES = ['OPEN', 'RESPONDED', 'ACKNOWLEDGED', 'IN_PROGRESS'];
const ACTIVE_ASSIGNMENT_STATUSES = ['ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT'];

function getTaskWindow(task) {
  const date = task.date.toISOString().slice(0, 10);
  const toTime = (value) => (value ? value.toISOString().slice(11, 19) : null);
  const start = toTime(task.startTime);
  const end = toTime(task.endTime);
  return {
    start: start ? new Date(`${date}T${start}.000Z`) : new Date(`${date}T00:00:00.000Z`),
    end: end ? new Date(`${date}T${end}.000Z`) : new Date(`${date}T23:59:59.999Z`),
  };
}

function isWithinTaskWindow(task, now) {
  const { start, end } = getTaskWindow(task);
  return now >= start && now <= end;
}

async function updateVolunteerLocation(volunteerId, payload) {
  payload = validateMissionLocationUpdatePayload(payload);
  const now = new Date();
  const taskId = Number(payload.missionId);
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw new AppError('missionId مطلوب لتحديث موقع المهمة', 400);
  }
  return prisma.$transaction(async (transactionClient) => {
    const volunteer = await transactionClient.volunteer.findUnique({
      where: { id: volunteerId },
      select: { locationSharingEnabled: true },
    });
    if (!volunteer?.locationSharingEnabled) {
      throw new AppError('يجب تفعيل مشاركة الموقع صراحةً قبل إرسال التحديثات', 403);
    }

    const assignment = await transactionClient.volunteerTask.findFirst({
      where: {
        volunteerId,
        taskId,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        task: {
          approvalStatus: 'APPROVED',
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          campaign: { is: { status: { in: ['PUBLISHED', 'ACTIVE'] } } },
          missionJoinRequests: { some: { volunteerId, status: 'APPROVED' } },
        },
      },
      include: { task: { select: { id: true, date: true, startTime: true, endTime: true } } },
    });
    if (!assignment || !isWithinTaskWindow(assignment.task, now)) {
      throw new AppError('لا يوجد نشاط معتمد ونشط يسمح بمشاركة الموقع الآن', 403);
    }

    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const update = await transactionClient.volunteerLocationUpdate.create({
      data: {
        volunteerId,
        taskId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
        recordedAt: payload.deviceTimestamp || now,
        expiresAt,
      },
      select: { id: true, recordedAt: true, expiresAt: true },
    });
    await transactionClient.volunteer.update({
      where: { id: volunteerId },
      data: {
        lastKnownLatitude: payload.latitude,
        lastKnownLongitude: payload.longitude,
        locationAccuracy: payload.accuracy,
        locationLastUpdatedAt: update.recordedAt,
      },
    });
    await transactionClient.volunteerLocationAccessLog.create({
      data: {
        volunteerId,
        accessedById: volunteerId,
        taskId,
        purpose: 'OWNER_LOCATION_UPDATE',
      },
    });
    return {
      locationUpdateId: update.id,
      recordedAt: update.recordedAt.toISOString(),
      expiresAt: update.expiresAt.toISOString(),
    };
  });
}

async function recordAdminLocationReads(actor, locations, purpose, reason) {
  await prisma.$transaction(async (transactionClient) => {
    if (locations.length) {
      await transactionClient.volunteerLocationAccessLog.createMany({
        data: locations.map((location) => ({
          volunteerId: location.volunteerId,
          accessedByAdminId: actor.id,
          taskId: location.taskId ?? null,
          purpose,
        })),
      });
    }
    await writeAuditLog(
      {
        adminId: actor.id,
        action: purpose === 'ADMIN_LOCATION_HISTORY' ? 'LOCATION_HISTORY_READ' : 'LOCATION_MONITORING_READ',
        targetType: 'VOLUNTEER_LOCATIONS',
        targetId: 'batch',
        reason,
        data: { volunteerIds: locations.map((location) => location.volunteerId) },
      },
      transactionClient,
    );
  });
}

function serializeLocationUpdate(update, now) {
  const ageMs = now.getTime() - update.recordedAt.getTime();
  return {
    latitude: Number(update.latitude),
    longitude: Number(update.longitude),
    accuracy: Number(update.accuracy),
    recordedAt: update.recordedAt.toISOString(),
    locationStatus: ageMs <= FRESHNESS_MINUTES * 60 * 1000 ? 'FRESH' : 'STALE',
    mission: update.task
      ? {
          id: update.task.id,
          title: update.task.title,
          campaign: update.task.campaign,
        }
      : null,
    incidentId: update.incidentId,
  };
}

async function listVolunteerLocations(query, actor) {
  const filters = validateLocationAccessQuery(query);
  const globalAccess = hasPermission(actor, 'locations:read');
  if (!globalAccess && !hasPermission(actor, 'campaigns:manage')) {
    throw new AppError('ليس لديك صلاحية متابعة المواقع', 403);
  }
  const now = new Date();
  const activeTasks = {
    some: {
      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      task: {
        approvalStatus: 'APPROVED',
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        campaign: { is: { status: { in: ['PUBLISHED', 'ACTIVE'] } } },
        date: { equals: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) },
        missionJoinRequests: { some: { status: 'APPROVED' } },
      },
    },
  };
  const approvedMissionRequests = {
    some: {
      status: 'APPROVED',
      task: {
        approvalStatus: 'APPROVED',
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        campaign: { is: { status: { in: ['PUBLISHED', 'ACTIVE'] } } },
        date: { equals: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) },
      },
    },
  };
  const activeIncidents = {
    some: { status: { in: ACTIVE_INCIDENT_STATUSES } },
  };
  const where = {
    AND: [
      {
        OR: [
          {
            AND: [
              { locationSharingEnabled: true },
              { assignedTasks: activeTasks },
              { missionJoinRequests: approvedMissionRequests },
            ],
          },
          { sosRequests: activeIncidents },
        ],
      },
      ...(filters.search
        ? [
            {
              OR: [
                { fullName: { contains: filters.search } },
                { email: { contains: filters.search } },
                { phone: { contains: filters.search } },
              ],
            },
          ]
        : []),
      ...(!globalAccess
        ? [
            {
              OR: [
                {
                  assignedTasks: {
                    some: {
                      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
                      task: {
                        campaign: { is: { createdById: actor.id } },
                      },
                    },
                  },
                },
                {
                  sosRequests: {
                    some: {
                      status: { in: ACTIVE_INCIDENT_STATUSES },
                      task: {
                        is: {
                          campaign: { is: { createdById: actor.id } },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
  const candidates = await prisma.volunteer.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      locationSharingEnabled: true,
      assignedTasks: {
        where: activeTasks.some,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              date: true,
              startTime: true,
              endTime: true,
              campaign: { select: { id: true, title: true, createdById: true } },
            },
          },
        },
      },
      sosRequests: {
        where: activeIncidents.some,
        select: {
          id: true,
          task: {
            select: { campaign: { select: { createdById: true } } },
          },
        },
      },
      missionJoinRequests: {
        where: { status: 'APPROVED' },
        select: { taskId: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const eligible = candidates
    .map((volunteer) => ({
      ...volunteer,
      activeTask: volunteer.locationSharingEnabled
        ? volunteer.assignedTasks.find(
            (assignment) =>
              volunteer.missionJoinRequests.some(
                (request) => request.taskId === assignment.taskId,
              ) &&
              (globalAccess || assignment.task.campaign.createdById === actor.id) &&
              isWithinTaskWindow(assignment.task, now),
          )?.task ?? null
        : null,
      activeOwnedIncident:
        globalAccess ||
        volunteer.sosRequests.some(
          (incident) =>
            incident.task?.campaign?.createdById === actor.id,
        ),
    }))
    .filter((volunteer) => volunteer.activeTask || volunteer.activeOwnedIncident);
  const total = eligible.length;
  const volunteers = eligible.slice(
    (filters.page - 1) * filters.limit,
    filters.page * filters.limit,
  );
  const ids = volunteers.map((volunteer) => volunteer.id);
  const updates = ids.length
    ? await prisma.volunteerLocationUpdate.findMany({
        where: {
          volunteerId: { in: ids },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              date: true,
              startTime: true,
              endTime: true,
              approvalStatus: true,
              status: true,
              campaign: { select: { id: true, title: true } },
            },
          },
          incident: {
            select: {
              id: true,
              status: true,
              task: { select: { campaign: { select: { createdById: true } } } },
            },
          },
        },
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      })
    : [];
  const taskIdByVolunteer = new Map(
    volunteers.map((volunteer) => [volunteer.id, volunteer.activeTask?.id ?? null]),
  );
  const eligibleUpdates = updates.filter((update) => {
    if (
      update.incident &&
      ACTIVE_INCIDENT_STATUSES.includes(update.incident.status) &&
      (globalAccess || update.incident.task?.campaign?.createdById === actor.id)
    ) {
      return true;
    }
    return (
      update.task &&
      update.task.id === taskIdByVolunteer.get(update.volunteerId) &&
      update.task.approvalStatus === 'APPROVED' &&
      !['CANCELLED', 'COMPLETED'].includes(update.task.status) &&
      isWithinTaskWindow(update.task, now)
    );
  });
  const updateByVolunteer = new Map();
  for (const update of eligibleUpdates) {
    if (!updateByVolunteer.has(update.volunteerId)) {
      updateByVolunteer.set(update.volunteerId, update);
    }
  }
  const locations = volunteers.map((volunteer) => {
    const update = updateByVolunteer.get(volunteer.id);
    const task = update?.task || volunteer.activeTask || null;
    return {
      volunteerId: volunteer.id,
      fullName: volunteer.fullName,
      avatarUrl: volunteer.avatarUrl,
      taskId: update?.taskId ?? task?.id ?? null,
      location:
        update && now.getTime() - update.recordedAt.getTime() <= RETENTION_DAYS * 24 * 60 * 60 * 1000
          ? serializeLocationUpdate(update, now)
          : null,
      locationStatus: update
        ? now.getTime() - update.recordedAt.getTime() <= FRESHNESS_MINUTES * 60 * 1000
          ? 'FRESH'
          : 'STALE'
        : 'UNAVAILABLE',
    };
  });
  await recordAdminLocationReads(actor, locations, 'ADMIN_LOCATION_MONITORING', filters.reason);
  return {
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
    locations,
  };
}

async function getLocationHistory(volunteerId, actor, query) {
  const filters = validateLocationAccessQuery(query);
  const id = Number(volunteerId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف المتطوع غير صالح', 400);
  const globalAccess = hasPermission(actor, 'locations:read');
  if (!globalAccess && !hasPermission(actor, 'campaigns:manage')) {
    throw new AppError('ليس لديك صلاحية الاطلاع على سجل المواقع', 403);
  }
  const volunteer = await prisma.volunteer.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      locationSharingEnabled: true,
      assignedTasks: {
        where: {
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
          task: {
            approvalStatus: 'APPROVED',
            status: { notIn: ['CANCELLED', 'COMPLETED'] },
            campaign: {
              is: {
                status: { in: ['PUBLISHED', 'ACTIVE'] },
                ...(!globalAccess ? { createdById: actor.id } : {}),
              },
            },
            missionJoinRequests: { some: { volunteerId: id, status: 'APPROVED' } },
          },
        },
        select: {
          taskId: true,
          task: {
            select: {
              date: true,
              startTime: true,
              endTime: true,
              campaign: { select: { createdById: true } },
            },
          },
        },
      },
      sosRequests: {
        where: {
          status: { in: ACTIVE_INCIDENT_STATUSES },
          ...(!globalAccess
            ? {
                task: {
                  is: { campaign: { is: { createdById: actor.id } } },
                },
              }
            : {}),
        },
        select: { id: true },
      },
    },
  });
  if (!volunteer) throw new AppError('المتطوع غير موجود', 404);
  if (!volunteer.locationSharingEnabled && volunteer.sosRequests.length === 0) {
    throw new AppError('مشاركة الموقع غير مفعلة لهذا المتطوع', 403);
  }
  const taskIds = volunteer.locationSharingEnabled
    ? volunteer.assignedTasks
        .filter(
          (assignment) =>
            (globalAccess || assignment.task.campaign.createdById === actor.id) &&
            isWithinTaskWindow(assignment.task, new Date()),
        )
        .map((task) => task.taskId)
    : [];
  const incidentIds = volunteer.sosRequests.map((incident) => incident.id);
  if (taskIds.length === 0 && incidentIds.length === 0) {
    throw new AppError('لا يوجد نشاط ميداني أو بلاغ طوارئ نشط يسمح بالاطلاع', 403);
  }
  const where = {
    volunteerId: id,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    OR: [
      ...(taskIds.length ? [{ taskId: { in: taskIds } }] : []),
      ...(incidentIds.length ? [{ incidentId: { in: incidentIds } }] : []),
    ],
  };
  const [updates, total] = await Promise.all([
    prisma.volunteerLocationUpdate.findMany({
      where,
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: {
        task: { select: { id: true, title: true } },
        incident: { select: { id: true, status: true } },
      },
    }),
    prisma.volunteerLocationUpdate.count({ where }),
  ]);
  await recordAdminLocationReads(
    actor,
    updates.map((update) => ({ volunteerId: id, taskId: update.taskId })),
    'ADMIN_LOCATION_HISTORY',
    filters.reason,
  );
  const now = new Date();
  return {
    volunteer: { id: volunteer.id, fullName: volunteer.fullName },
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
    locations: updates.map((update) => ({
      ...serializeLocationUpdate(update, now),
      taskId: update.taskId,
      incidentId: update.incidentId,
    })),
  };
}

async function pruneExpiredLocationUpdates() {
  const now = new Date();
  const [updates, rateLimitBuckets, expiredIncidents] = await prisma.$transaction([
    prisma.volunteerLocationUpdate.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.sosRequest.updateMany({
      where: {
        status: { in: ['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALARM'] },
        resolvedAt: { lte: new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000) },
        OR: [{ latitude: { not: null } }, { longitude: { not: null } }],
      },
      data: { latitude: null, longitude: null, accuracy: null, deviceTimestamp: null },
    }),
  ]);
  return {
    deletedLocationUpdates: updates.count,
    deletedRateLimitBuckets: rateLimitBuckets.count,
    clearedExpiredIncidentLocations: expiredIncidents.count,
  };
}

module.exports = {
  FRESHNESS_MINUTES,
  RETENTION_DAYS,
  isWithinTaskWindow,
  getLocationHistory,
  listVolunteerLocations,
  pruneExpiredLocationUpdates,
  updateVolunteerLocation,
};
