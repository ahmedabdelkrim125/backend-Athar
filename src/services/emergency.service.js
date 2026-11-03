const crypto = require('crypto');
const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { writeAuditLog } = require('./audit.service');
const notificationService = require('./notification.service');
const { hasPermission } = require('../middleware/rbac.middleware');
const { validatePagination } = require('../validators/notification.validators');
const {
  validateCancelIncidentPayload,
  validateCreateIncidentPayload,
  validateIncidentListQuery,
  validateIncidentStatusPayload,
  validateLocationUpdatePayload,
} = require('../validators/emergency.validators');
const {
  isWithinTaskWindow,
  RETENTION_DAYS,
} = require('./location-monitoring.service');

const ACTIVE_STATUSES = ['OPEN', 'RESPONDED', 'ACKNOWLEDGED', 'IN_PROGRESS'];
const ALLOWED_TRANSITIONS = Object.freeze({
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'FALSE_ALARM'],
  RESPONDED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'FALSE_ALARM'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALARM'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALARM'],
  RESOLVED: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  FALSE_ALARM: [],
  CANCELLED: [],
});

function canManageAllIncidents(actor) {
  return hasPermission(actor, 'emergencies:manage');
}

function assertIncidentAccess(_incident, actor) {
  if (!canManageAllIncidents(actor)) {
    throw new AppError('بلاغ الطوارئ غير موجود أو لا تملك صلاحية الوصول إليه', 404);
  }
}

function serializeIncident(incident) {
  return {
    id: incident.id,
    reference: incident.reference,
    status: incident.status,
    latitude: incident.latitude === null ? null : Number(incident.latitude),
    longitude: incident.longitude === null ? null : Number(incident.longitude),
    accuracy: incident.accuracy === null ? null : Number(incident.accuracy),
    message: incident.message,
    createdAt: incident.createdAt.toISOString(),
    lastUpdatedAt: incident.lastUpdatedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    cancelledReason: incident.cancelledReason,
    volunteer: incident.volunteer
      ? {
          id: incident.volunteer.id,
          fullName: incident.volunteer.fullName,
          avatarUrl: incident.volunteer.avatarUrl,
          phone: incident.volunteer.phone,
        }
      : undefined,
    mission: incident.task
      ? {
          id: incident.task.id,
          title: incident.task.title,
          campaign: incident.task.campaign
            ? {
                id: incident.task.campaign.id,
                title: incident.task.campaign.title,
              }
            : null,
        }
      : null,
    respondedBy: incident.respondedByAdmin
      ? {
          id: incident.respondedByAdmin.id,
          fullName: incident.respondedByAdmin.fullName,
          role: 'ADMIN',
        }
      : incident.respondedBy
        ? { id: incident.respondedBy.id, fullName: incident.respondedBy.fullName, role: 'VOLUNTEER' }
        : null,
  };
}

async function findActiveTask(volunteerId, missionId) {
  const now = new Date();
  const tasks = await prisma.volunteerTask.findMany({
    where: {
      volunteerId,
      ...(missionId ? { taskId: missionId } : {}),
      status: { in: ['ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT'] },
      task: {
        approvalStatus: 'APPROVED',
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        campaign: { is: { status: { in: ['PUBLISHED', 'ACTIVE'] } } },
        missionJoinRequests: { some: { volunteerId, status: 'APPROVED' } },
      },
    },
    include: {
      task: {
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          title: true,
          campaign: { select: { id: true, title: true, createdById: true } },
        },
      },
    },
    orderBy: { id: 'desc' },
  });
  const active = tasks.find((item) => isWithinTaskWindow(item.task, now));
  if (missionId && !active) {
    throw new AppError('المهمة غير نشطة أو لا يوجد طلب انضمام معتمد', 403);
  }
  return active || null;
}

async function getEmergencyRecipientIds() {
  const admins = await prisma.admin.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

async function notifyEmergencyRecipients(incident, action) {
  try {
    const recipientIds = await getEmergencyRecipientIds();
    for (const adminId of recipientIds) {
      try {
        await notificationService.createInAppNotification({
          adminId,
          title: action === 'SOS_CREATED' ? 'بلاغ استغاثة جديد' : 'تحديث بلاغ استغاثة',
          body:
            action === 'SOS_CREATED'
              ? `طلب ${incident.volunteer?.fullName || 'متطوع'} المساعدة${incident.task ? ` في مهمة ${incident.task.title}` : ''}.`
              : `تم تحديث حالة البلاغ SOS-${incident.id} إلى ${incident.status}.`,
          type: action === 'SOS_CREATED' ? 'EMERGENCY_SOS' : 'EMERGENCY_STATUS',
          eventKey: `emergency:${incident.id}:${action}:${incident.status}`,
          data: {
            incidentId: incident.id,
            reference: incident.reference,
            missionId: incident.taskId,
            status: incident.status,
          },
        });
      } catch (error) {
        console.error('Emergency notification creation failed.', {
          code: error?.code || 'unknown',
          incidentId: incident.id,
          recipientId: adminId,
        });
      }
    }
    if (action !== 'SOS_CREATED' && incident.volunteerId) {
      try {
        await notificationService.createInAppNotification({
          userId: incident.volunteerId,
          title: action === 'SOS_CANCELLED' ? 'تم إلغاء بلاغ الطوارئ' : 'تحديث بلاغ الطوارئ',
          body: `تم تحديث حالة البلاغ ${incident.reference} إلى ${incident.status}.`,
          type: 'EMERGENCY_STATUS',
          eventKey: `emergency:${incident.id}:${action}:${incident.status}:volunteer`,
          data: {
            incidentId: incident.id,
            reference: incident.reference,
            status: incident.status,
          },
        });
      } catch (error) {
        console.error('Emergency volunteer notification creation failed.', {
          code: error?.code || 'unknown',
          incidentId: incident.id,
          volunteerId: incident.volunteerId,
        });
      }
    }
  } catch (error) {
    console.error('Emergency notification delivery failed.', {
      code: error?.code || 'unknown',
      incidentId: incident.id,
    });
  }
}

async function createIncident(volunteerId, payload, options = {}) {
  const data = validateCreateIncidentPayload(payload, options);
  const activeTask = await findActiveTask(volunteerId, data.missionId);
  const incident = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM volunteers WHERE id = ${volunteerId} FOR UPDATE`;
    const existing = await transactionClient.sosRequest.findFirst({
      where: { volunteerId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(`يوجد بلاغ نشط بالفعل: SOS-${existing.id}`, 409);
    }
    const created = await transactionClient.sosRequest.create({
      data: {
        volunteerId,
        taskId: activeTask?.task.id ?? null,
        reference: `SOS-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        message: data.message,
        deviceTimestamp: data.deviceTimestamp,
        lastUpdatedAt: new Date(),
        status: 'OPEN',
        locationUpdates: {
          create: {
            volunteerId,
            taskId: activeTask?.task.id ?? null,
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            recordedAt: data.deviceTimestamp,
            receivedAt: new Date(),
            expiresAt: null,
          },
        },
        audits: {
          create: {
            actorId: volunteerId,
            fromStatus: null,
            toStatus: 'OPEN',
            action: 'SOS_CREATED',
            notes: data.message,
          },
        },
      },
      include: {
        volunteer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
        task: {
          select: {
            id: true,
            title: true,
            campaign: { select: { id: true, title: true, createdById: true } },
          },
        },
      },
    });
    await transactionClient.volunteer.update({
      where: { id: volunteerId },
      data: {
        lastKnownLatitude: data.latitude,
        lastKnownLongitude: data.longitude,
        locationAccuracy: data.accuracy,
        locationLastUpdatedAt: new Date(),
      },
    });
    await writeAuditLog(
      {
        actorId: volunteerId,
        action: 'EMERGENCY_SOS_CREATED',
        targetType: 'SOS_INCIDENT',
        targetId: created.id,
      },
      transactionClient,
    );
    return created;
  });
  await notifyEmergencyRecipients(incident, 'SOS_CREATED');
  return {
    incident: serializeIncident(incident),
    googleMapsUrl: `https://maps.google.com/?q=${data.latitude},${data.longitude}`,
  };
}

async function createLegacyIncident(volunteerId, payload) {
  return createIncident(volunteerId, payload);
}

async function updateIncidentLocation(incidentId, volunteerId, payload) {
  const data = validateLocationUpdatePayload(payload);
  const id = Number(incidentId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف البلاغ غير صالح', 400);
  const now = new Date();
  return prisma.$transaction(async (transactionClient) => {
    const incident = await transactionClient.sosRequest.findFirst({
      where: { id, volunteerId, status: { in: ACTIVE_STATUSES } },
      select: { id: true, taskId: true },
    });
    if (!incident) throw new AppError('البلاغ غير موجود أو مغلق', 404);
    const update = await transactionClient.volunteerLocationUpdate.create({
      data: {
        volunteerId,
        taskId: incident.taskId,
        receivedAt: now,
        incidentId: id,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        recordedAt: data.deviceTimestamp || now,
        expiresAt: null,
      },
      select: { id: true, recordedAt: true },
    });
    await transactionClient.sosRequest.update({
      where: { id },
      data: {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        deviceTimestamp: data.deviceTimestamp,
        lastUpdatedAt: now,
      },
    });
    await transactionClient.volunteer.update({
      where: { id: volunteerId },
      data: {
        lastKnownLatitude: data.latitude,
        lastKnownLongitude: data.longitude,
        locationAccuracy: data.accuracy,
        locationLastUpdatedAt: update.recordedAt,
      },
    });
    await transactionClient.sosIncidentAudit.create({
      data: {
        incidentId: id,
        actorId: volunteerId,
        fromStatus: null,
        toStatus: null,
        action: 'LOCATION_UPDATED',
      },
    });
    return { incidentId: id, recordedAt: update.recordedAt.toISOString() };
  });
}

async function cancelIncident(incidentId, volunteerId, payload) {
  const { reason } = validateCancelIncidentPayload(payload);
  const id = Number(incidentId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف البلاغ غير صالح', 400);
  const incident = await prisma.$transaction(async (transactionClient) => {
    const current = await transactionClient.sosRequest.findFirst({
      where: { id, volunteerId, status: { in: ['OPEN', 'RESPONDED', 'ACKNOWLEDGED'] } },
    });
    if (!current) throw new AppError('البلاغ غير موجود أو لا يمكن إلغاؤه', 404);
    const updated = await transactionClient.sosRequest.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledReason: reason, resolvedAt: new Date() },
      include: {
        volunteer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
        task: { select: { id: true, title: true, campaign: { select: { id: true, title: true, createdById: true } } } },
      },
    });
    await transactionClient.sosIncidentAudit.create({
      data: {
        incidentId: id,
        actorId: volunteerId,
        fromStatus: current.status,
        toStatus: 'CANCELLED',
        action: 'SOS_CANCELLED',
        notes: reason,
      },
    });
    await transactionClient.volunteerLocationUpdate.updateMany({
      where: { incidentId: id, expiresAt: null },
      data: {
        expiresAt: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await transactionClient.volunteer.updateMany({
      where: { id: volunteerId, locationSharingEnabled: false },
      data: {
        lastKnownLatitude: null,
        lastKnownLongitude: null,
        locationAccuracy: null,
        locationLastUpdatedAt: null,
      },
    });
    await writeAuditLog(
      {
        actorId: volunteerId,
        action: 'EMERGENCY_SOS_CANCELLED',
        targetType: 'SOS_INCIDENT',
        targetId: id,
        reason,
      },
      transactionClient,
    );
    return updated;
  });
  await notifyEmergencyRecipients(incident, 'SOS_CANCELLED');
  return { incident: serializeIncident(incident) };
}

async function listIncidents(query = {}, actor) {
  const filters = validateIncidentListQuery(query);
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.volunteerId ? { volunteerId: filters.volunteerId } : {}),
  };
  const [incidents, total] = await Promise.all([
    prisma.sosRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: {
        volunteer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
        task: { select: { id: true, title: true, campaign: { select: { id: true, title: true, createdById: true } } } },
        respondedBy: { select: { id: true, fullName: true } },
        respondedByAdmin: { select: { id: true, fullName: true } },
        respondedByAdmin: { select: { id: true, fullName: true } },
      },
    }),
    prisma.sosRequest.count({ where }),
  ]);
  await prisma.$transaction(async (transactionClient) => {
    if (incidents.length) {
      await transactionClient.volunteerLocationAccessLog.createMany({
        data: incidents.map((incident) => ({
          volunteerId: incident.volunteerId,
          accessedByAdminId: actor.id,
          taskId: incident.taskId,
          purpose: 'ADMIN_LOCATION_MONITORING',
        })),
      });
    }
    await writeAuditLog(
      {
        adminId: actor.id,
        action: 'EMERGENCY_INCIDENT_LIST_VIEWED',
        targetType: 'SOS_INCIDENT',
        targetId: 'batch',
        reason: 'متابعة بلاغات الطوارئ',
        data: { incidentIds: incidents.map((incident) => incident.id) },
      },
      transactionClient,
    );
  });
  return {
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
    incidents: incidents.map(serializeIncident),
  };
}

async function getIncidentDetails(incidentId, actor) {
  const id = Number(incidentId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف البلاغ غير صالح', 400);
  const incident = await prisma.sosRequest.findUnique({
    where: { id },
    include: {
      volunteer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
      task: {
        select: {
          id: true,
          title: true,
          campaign: { select: { id: true, title: true, createdById: true } },
        },
      },
      respondedBy: { select: { id: true, fullName: true } },
      respondedByAdmin: { select: { id: true, fullName: true } },
      locationUpdates: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        take: 500,
      },
      audits: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          actor: { select: { id: true, fullName: true } },
          actorAdmin: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!incident) throw new AppError('بلاغ الطوارئ غير موجود', 404);
  assertIncidentAccess(incident, actor);
  await prisma.$transaction(async (transactionClient) => {
    await transactionClient.volunteerLocationAccessLog.create({
      data: {
        volunteerId: incident.volunteerId,
        accessedByAdminId: actor.id,
        taskId: incident.taskId,
        purpose: 'ADMIN_LOCATION_HISTORY',
      },
    });
    await writeAuditLog(
      {
        adminId: actor.id,
        action: 'EMERGENCY_INCIDENT_VIEWED',
        targetType: 'SOS_INCIDENT',
        targetId: id,
      },
      transactionClient,
    );
  });
  const serialized = serializeIncident(incident);
  return {
    incident: {
      ...serialized,
      googleMapsUrl:
        serialized.latitude !== null && serialized.longitude !== null
          ? `https://maps.google.com/?q=${serialized.latitude},${serialized.longitude}`
          : null,
      locationUpdates: incident.locationUpdates.map((update) => ({
        latitude: Number(update.latitude),
        longitude: Number(update.longitude),
        accuracy: Number(update.accuracy),
        recordedAt: update.recordedAt.toISOString(),
        receivedAt: update.receivedAt.toISOString(),
        locationStatus:
          Date.now() - update.recordedAt.getTime() <= 15 * 60 * 1000 ? 'FRESH' : 'STALE',
      })),
      audits: incident.audits.map((audit) => ({
        action: audit.action,
        fromStatus: audit.fromStatus,
        toStatus: audit.toStatus,
        notes: audit.notes,
        actor: audit.actorAdmin
          ? { id: audit.actorAdmin.id, fullName: audit.actorAdmin.fullName, role: 'ADMIN' }
          : audit.actor
            ? { id: audit.actor.id, fullName: audit.actor.fullName, role: 'VOLUNTEER' }
            : null,
        createdAt: audit.createdAt.toISOString(),
      })),
    },
  };
}

async function getIncidentLocations(incidentId, actor, query = {}) {
  const id = Number(incidentId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف البلاغ غير صالح', 400);
  const pagination = validatePagination(query);
  const incident = await prisma.sosRequest.findUnique({
    where: { id },
    select: {
      id: true,
      volunteerId: true,
      taskId: true,
      status: true,
      task: { select: { campaign: { select: { createdById: true } } } },
    },
  });
  if (!incident) throw new AppError('بلاغ الطوارئ غير موجود', 404);
  assertIncidentAccess(incident, actor);
  const where = {
    incidentId: id,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
  const [updates, total] = await Promise.all([
    prisma.volunteerLocationUpdate.findMany({
      where,
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.volunteerLocationUpdate.count({ where }),
  ]);
  await prisma.$transaction(async (transactionClient) => {
    if (updates.length) {
      await transactionClient.volunteerLocationAccessLog.createMany({
        data: updates.map((update) => ({
          volunteerId: incident.volunteerId,
          accessedByAdminId: actor.id,
          taskId: update.taskId,
          purpose: 'ADMIN_LOCATION_HISTORY',
        })),
      });
    }
    await writeAuditLog(
      {
        adminId: actor.id,
        action: 'EMERGENCY_LOCATION_HISTORY_READ',
        targetType: 'SOS_INCIDENT',
        targetId: id,
        reason: `استجابة لبلاغ الطوارئ SOS-${id}`,
        data: { returnedUpdates: updates.length },
      },
      transactionClient,
    );
  });
  return {
    incidentId: id,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
    },
    locations: updates.map((update) => ({
      latitude: Number(update.latitude),
      longitude: Number(update.longitude),
      accuracy: Number(update.accuracy),
      recordedAt: update.recordedAt.toISOString(),
    })),
  };
}

async function updateIncidentStatus(incidentId, actor, payload) {
  const id = Number(incidentId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف البلاغ غير صالح', 400);
  const { status, notes } = validateIncidentStatusPayload(payload);
  const incident = await prisma.$transaction(async (transactionClient) => {
    const current = await transactionClient.sosRequest.findUnique({
      where: { id },
      include: { task: { include: { campaign: { select: { createdById: true } } } } },
    });
    if (!current) throw new AppError('بلاغ الطوارئ غير موجود', 404);
    assertIncidentAccess(current, actor);
    if (!ALLOWED_TRANSITIONS[current.status]?.includes(status)) {
      throw new AppError('لا يمكن الانتقال من الحالة الحالية إلى الحالة المطلوبة', 409);
    }
    const updated = await transactionClient.sosRequest.update({
      where: { id },
      data: {
        status,
        respondedById: current.respondedById,
        respondedByAdminId: current.respondedByAdminId || actor.id,
        resolvedAt: ['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALARM'].includes(status)
          ? new Date()
          : null,
      },
      include: {
        volunteer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
        task: { select: { id: true, title: true, campaign: { select: { id: true, title: true, createdById: true } } } },
        respondedBy: { select: { id: true, fullName: true } },
        respondedByAdmin: { select: { id: true, fullName: true } },
      },
    });
    await transactionClient.sosIncidentAudit.create({
      data: {
        incidentId: id,
        actorAdminId: actor.id,
        fromStatus: current.status,
        toStatus: status,
        action: 'STATUS_CHANGED',
        notes,
      },
    });
    if (['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALARM'].includes(status)) {
      await transactionClient.volunteerLocationUpdate.updateMany({
        where: { incidentId: id },
        data: {
          expiresAt: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      await transactionClient.volunteer.updateMany({
        where: { id: current.volunteerId, locationSharingEnabled: false },
        data: {
          lastKnownLatitude: null,
          lastKnownLongitude: null,
          locationAccuracy: null,
          locationLastUpdatedAt: null,
        },
      });
    }
    await writeAuditLog(
      {
        adminId: actor.id,
        action: status === 'CLOSED' ? 'EMERGENCY_INCIDENT_CLOSED' : 'EMERGENCY_INCIDENT_STATUS_CHANGED',
        targetType: 'SOS_INCIDENT',
        targetId: id,
        reason: notes,
        data: { fromStatus: current.status, toStatus: status },
      },
      transactionClient,
    );
    return updated;
  });
  await notifyEmergencyRecipients(incident, 'SOS_STATUS_CHANGED');
  return { incident: serializeIncident(incident) };
}

async function getOwnActiveIncident(volunteerId) {
  const incident = await prisma.sosRequest.findFirst({
    where: { volunteerId, status: { in: ACTIVE_STATUSES } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      volunteer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
      task: { select: { id: true, title: true, campaign: { select: { id: true, title: true } } } },
    },
  });
  return { incident: incident ? serializeIncident(incident) : null };
}

module.exports = {
  assertIncidentAccess,
  cancelIncident,
  createIncident,
  createLegacyIncident,
  getIncidentDetails,
  getIncidentLocations,
  getOwnActiveIncident,
  listIncidents,
  notifyEmergencyRecipients,
  updateIncidentLocation,
  updateIncidentStatus,
};
