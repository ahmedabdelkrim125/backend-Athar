const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { calculateDistanceMeters } = require('../utils/geolocation');
const { hasPermission } = require('../middleware/rbac.middleware');
const { writeAuditLog } = require('./audit.service');
const emergencyService = require('./emergency.service');
const {
  serializePagination,
  serializeVolunteerSummary,
} = require('../utils/serializers');
const {
  parsePositiveInteger,
  validateSosRequestCreatePayload,
  validateSosRequestListQuery,
  validateSosRequestStatusPayload,
} = require('../validators/resource.validators');

const ACTIVE_SOS_STATUSES = ['OPEN', 'RESPONDED', 'ACKNOWLEDGED', 'IN_PROGRESS'];
const ACTIVE_WINDOW_HOURS = 12;
const NEARBY_DEFAULT_RADIUS_KM = 10;
const NEARBY_MAX_RADIUS_KM = 100;

function activeSince() {
  return new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000);
}

function isRequestActive(sosRequest) {
  return ACTIVE_SOS_STATUSES.includes(sosRequest.status);
}

const volunteerSummarySelect = {
  id: true,
  fullName: true,
  nationalId: true,
  email: true,
  phone: true,
  status: true,
};

const sosRequestInclude = {
  volunteer: {
    select: volunteerSummarySelect,
  },
  task: {
    select: {
      id: true,
      title: true,
      campaign: { select: { id: true, title: true, createdById: true } },
    },
  },
};

function decimalToNumber(value) {
  return Number(value);
}

function buildSosUiState(status) {
  switch (status) {
    case 'OPEN':
      return {
        screenTitle: 'جاري إرسال طلب الطوارئ...',
        screenSubtitle: 'يتم مشاركة موقعك الآن',
        helperText: 'لا تغلق التطبيق',
        tone: 'danger',
        canCancel: true,
        keepAppOpen: true,
        pollIntervalSeconds: 5,
        estimatedResponseMinutes: 2,
      };
    case 'RESPONDED':
    case 'ACKNOWLEDGED':
    case 'IN_PROGRESS':
      return {
        screenTitle: 'تم استلام طلب الطوارئ',
        screenSubtitle: 'فريق سند على علم بموقعك الآن',
        helperText: 'ابقَ في مكان آمن حتى يتم التعامل مع الحالة',
        tone: 'danger',
        canCancel: true,
        keepAppOpen: true,
        pollIntervalSeconds: 5,
        estimatedResponseMinutes: 1,
      };
    case 'RESOLVED':
      return {
        screenTitle: 'تم إنهاء طلب الطوارئ',
        screenSubtitle: 'يمكنك العودة للتطبيق بشكل طبيعي',
        helperText: 'تم إغلاق الحالة بنجاح',
        tone: 'success',
        canCancel: false,
        keepAppOpen: false,
        pollIntervalSeconds: null,
        estimatedResponseMinutes: 0,
      };
    default:
      return {
        screenTitle: 'تم إلغاء طلب الطوارئ',
        screenSubtitle: 'لن يتم متابعة هذا الطلب',
        helperText: 'يمكنك إرسال طلب جديد إذا احتجت المساعدة لاحقًا',
        tone: 'neutral',
        canCancel: false,
        keepAppOpen: false,
        pollIntervalSeconds: null,
        estimatedResponseMinutes: 0,
      };
  }
}

function buildSosStatusLabel(status) {
  switch (status) {
    case 'OPEN':
      return 'قيد الإرسال';
    case 'RESPONDED':
      return 'تمت الاستجابة';
    case 'ACKNOWLEDGED':
    case 'IN_PROGRESS':
      return 'تمت الاستجابة';
    case 'RESOLVED':
      return 'تمت المعالجة';
    case 'CANCELLED':
      return 'تم الإلغاء';
    default:
      return status;
  }
}

function serializeSosRequest(sosRequest) {
  const latitude = sosRequest.latitude === null ? null : decimalToNumber(sosRequest.latitude);
  const longitude = sosRequest.longitude === null ? null : decimalToNumber(sosRequest.longitude);

  return {
    id: sosRequest.id,
    reference: sosRequest.reference,
    volunteerId: sosRequest.volunteerId,
    latitude,
    longitude,
    location: latitude === null || longitude === null ? null : { latitude, longitude },
    status: sosRequest.status,
    statusLabel: buildSosStatusLabel(sosRequest.status),
    isActive: isRequestActive(sosRequest),
    createdAt: sosRequest.createdAt?.toISOString() ?? null,
    resolvedAt: sosRequest.resolvedAt?.toISOString() ?? null,
    volunteer: serializeVolunteerSummary(sosRequest.volunteer),
    uiState: buildSosUiState(sosRequest.status),
  };
}

async function findActiveSosRequest(volunteerId) {
  return prisma.sosRequest.findFirst({
    where: {
      volunteerId,
      status: {
        in: ACTIVE_SOS_STATUSES,
      },
    },
    include: sosRequestInclude,
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function getSosRequestOrThrow(requestId) {
  const sosRequest = await prisma.sosRequest.findUnique({
    where: {
      id: requestId,
    },
    include: sosRequestInclude,
  });

  if (!sosRequest) {
    throw new AppError('طلب الاستغاثة غير موجود', 404);
  }

  return sosRequest;
}

async function listSosRequests(query, actor) {
  const filters = validateSosRequestListQuery(query);
  const where = {};

  const canManageEmergencies = hasPermission(actor, 'emergencies:manage');
  if (filters.status) {
    where.status = filters.status;
  }

  if (canManageEmergencies && filters.volunteerId) {
    where.volunteerId = filters.volunteerId;
  }

  if (!canManageEmergencies || filters.mine || query.mine === 'true') where.volunteerId = actor.id;

  const [requests, total] = await Promise.all([
    prisma.sosRequest.findMany({
      where,
      include: sosRequestInclude,
      orderBy: {
        createdAt: 'desc',
      },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.sosRequest.count({ where }),
  ]);

  return {
    message: 'تم جلب طلبات الاستغاثة بنجاح',
    pagination: serializePagination(filters.page, filters.limit, total),
    requests: requests.map(serializeSosRequest),
  };
}

async function getSosRequestById(requestId, actor) {
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  const sosRequest = await getSosRequestOrThrow(parsedRequestId);
  if (
    sosRequest.volunteerId !== actor.id &&
    !hasPermission(actor, 'emergencies:manage')
  ) {
    throw new AppError('ليس لديك صلاحية الوصول إلى هذا البلاغ', 403);
  }

  return {
    message: 'تم جلب بيانات الاستغاثة بنجاح',
    request: serializeSosRequest(sosRequest),
  };
}

async function getActiveSosRequest(volunteerId) {
  const [activeRequest, historyCount] = await Promise.all([
    findActiveSosRequest(volunteerId),
    prisma.sosRequest.count({
      where: {
        volunteerId,
        status: {
          in: ['RESOLVED', 'CANCELLED', 'CLOSED', 'FALSE_ALARM'],
        },
      },
    }),
  ]);

  return {
    message: activeRequest
      ? 'تم جلب طلب الطوارئ النشط بنجاح'
      : 'لا يوجد طلب طوارئ نشط حاليًا',
    activeRequest: activeRequest ? serializeSosRequest(activeRequest) : null,
    summary: {
      hasActiveRequest: Boolean(activeRequest),
      historyCount,
    },
  };
}

async function createSosRequest(payload, volunteerId) {
  const { incident } = await emergencyService.createLegacyIncident(volunteerId, payload);
  const sosRequest = await getSosRequestOrThrow(incident.id);
  return {
    statusCode: 201,
    message: 'تم إنشاء طلب الاستغاثة بنجاح',
    request: serializeSosRequest(sosRequest),
    created: true,
  };
}

async function cancelActiveSosRequest(volunteerId) {
  const sosRequest = await prisma.$transaction(async (transactionClient) => {
    const activeRequest = await transactionClient.sosRequest.findFirst({
      where: { volunteerId, status: { in: ACTIVE_SOS_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeRequest) throw new AppError('لا يوجد طلب طوارئ نشط لإلغائه', 404);
    const updated = await transactionClient.sosRequest.update({
      where: { id: activeRequest.id },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
      include: sosRequestInclude,
    });
    await transactionClient.sosIncidentAudit.create({
      data: {
        incidentId: activeRequest.id,
        actorId: volunteerId,
        fromStatus: activeRequest.status,
        toStatus: 'CANCELLED',
        action: 'SOS_CANCELLED',
      },
    });
    await writeAuditLog(
      {
        actorId: volunteerId,
        action: 'EMERGENCY_SOS_CANCELLED',
        targetType: 'SOS_INCIDENT',
        targetId: activeRequest.id,
        reason: 'إلغاء عبر واجهة SOS القديمة',
      },
      transactionClient,
    );
    await transactionClient.volunteer.updateMany({
      where: { id: volunteerId, locationSharingEnabled: false },
      data: {
        lastKnownLatitude: null,
        lastKnownLongitude: null,
        locationAccuracy: null,
        locationLastUpdatedAt: null,
      },
    });
    return updated;
  });
  await emergencyService.notifyEmergencyRecipients(sosRequest, 'SOS_CANCELLED');

  return {
    message: 'تم إلغاء طلب الطوارئ النشط بنجاح',
    request: serializeSosRequest(sosRequest),
  };
}

async function updateSosRequestStatus(requestId, payload, actor) {
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  const validatedPayload = validateSosRequestStatusPayload(payload);
  const existingRequest = await getSosRequestOrThrow(parsedRequestId);

  if (
    validatedPayload.status === 'CANCELLED' &&
    actor.accountType !== 'ADMIN' &&
    existingRequest.volunteerId !== actor.id
  ) {
    throw new AppError('فقط صاحب الطلب يمكنه إلغاء الاستغاثة', 403);
  }

  if (
    validatedPayload.status !== 'CANCELLED' &&
    !hasPermission(actor, 'emergencies:manage')
  ) {
    throw new AppError('ليس لديك صلاحية إدارة بلاغات الطوارئ', 403);
  }

  if (!isRequestActive(existingRequest)) {
    throw new AppError('لا يمكن تغيير حالة بلاغ مغلق', 409);
  }
  const status = validatedPayload.status;
  if (
    status === existingRequest.status ||
    (status === 'RESPONDED' && existingRequest.status !== 'OPEN') ||
    (status === 'CANCELLED' && !['OPEN', 'RESPONDED', 'ACKNOWLEDGED'].includes(existingRequest.status))
  ) {
    throw new AppError('لا يمكن الانتقال من الحالة الحالية إلى الحالة المطلوبة', 409);
  }
  const sosRequest = await prisma.$transaction(async (transactionClient) => {
    const current = await transactionClient.sosRequest.findUnique({
      where: { id: parsedRequestId },
    });
    if (!current || current.status !== existingRequest.status) {
      throw new AppError('تم تحديث البلاغ بالتزامن، أعد تحميله ثم حاول مجددًا', 409);
    }
    const updated = await transactionClient.sosRequest.update({
      where: { id: parsedRequestId },
      data: {
        status,
        respondedById: null,
        respondedByAdminId:
          actor.accountType === 'ADMIN'
            ? actor.id
            : current.respondedByAdminId,
        resolvedAt: ['RESOLVED', 'CANCELLED', 'CLOSED', 'FALSE_ALARM'].includes(status)
          ? new Date()
          : null,
      },
      include: sosRequestInclude,
    });
    await transactionClient.sosIncidentAudit.create({
      data: {
        incidentId: parsedRequestId,
        ...(actor.accountType === 'ADMIN'
          ? { actorAdminId: actor.id }
          : { actorId: actor.id }),
        fromStatus: current.status,
        toStatus: status,
        action: 'STATUS_CHANGED',
      },
    });
    await writeAuditLog(
      {
        ...(actor.accountType === 'ADMIN'
          ? { adminId: actor.id }
          : { actorId: actor.id }),
        action: status === 'CANCELLED' ? 'EMERGENCY_SOS_CANCELLED' : 'EMERGENCY_INCIDENT_STATUS_CHANGED',
        targetType: 'SOS_INCIDENT',
        targetId: parsedRequestId,
        data: { fromStatus: current.status, toStatus: status },
      },
      transactionClient,
    );
    if (['RESOLVED', 'CANCELLED'].includes(status)) {
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
    return updated;
  });
  await emergencyService.notifyEmergencyRecipients(sosRequest, 'SOS_STATUS_CHANGED');

  return {
    message: 'تم تحديث حالة طلب الاستغاثة بنجاح',
    request: serializeSosRequest(sosRequest),
  };
}

function parseRadiusKm(value) {
  if (value === undefined || value === null || value === '') {
    return NEARBY_DEFAULT_RADIUS_KM;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new AppError('نصف القطر يجب أن يكون رقمًا أكبر من صفر', 400);
  }

  return Math.min(parsedValue, NEARBY_MAX_RADIUS_KM);
}

function serializeNearbySosRequest(sosRequest, distanceMeters) {
  const serialized = serializeSosRequest(sosRequest);

  return {
    ...serialized,
    distanceMeters,
    volunteer: serialized.volunteer
      ? {
          id: serialized.volunteer.id,
          fullName: serialized.volunteer.fullName,
          phone: serialized.volunteer.phone,
          avatarUrl: serialized.volunteer.avatarUrl,
        }
      : null,
  };
}

async function updateSosRequestLocation(requestId, payload, volunteerId) {
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  await emergencyService.updateIncidentLocation(parsedRequestId, volunteerId, payload);
  const sosRequest = await getSosRequestOrThrow(parsedRequestId);
  return {
    message: 'تم تحديث موقع الاستغاثة بنجاح',
    request: serializeSosRequest(sosRequest),
  };
}

async function listNearbySosRequests(query, volunteerId) {
  const { latitude, longitude } = validateSosRequestCreatePayload(query);
  const radiusKm = parseRadiusKm(query.radiusKm);

  const activeRequests = await prisma.sosRequest.findMany({
    where: {
      status: {
        in: ACTIVE_SOS_STATUSES,
      },
      volunteerId: {
        not: volunteerId,
      },
      createdAt: {
        gte: activeSince(),
      },
    },
    include: sosRequestInclude,
    orderBy: {
      createdAt: 'desc',
    },
    take: 200,
  });

  const nearbyRequests = activeRequests
    .map((sosRequest) => ({
      sosRequest,
      distanceMeters: calculateDistanceMeters(
        latitude,
        longitude,
        sosRequest.latitude,
        sosRequest.longitude,
      ),
    }))
    .filter(
      (item) =>
        item.distanceMeters !== null && item.distanceMeters <= radiusKm * 1000,
    )
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    message: 'تم جلب طلبات الاستغاثة القريبة بنجاح',
    radiusKm,
    requests: nearbyRequests.map((item) =>
      serializeNearbySosRequest(item.sosRequest, item.distanceMeters),
    ),
  };
}

async function respondToSosRequest(requestId, actor) {
  if (!hasPermission(actor, 'emergencies:manage')) {
    throw new AppError('ليس لديك صلاحية الاستجابة لبلاغات الطوارئ', 403);
  }
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  const existingRequest = await getSosRequestOrThrow(parsedRequestId);

  if (
    actor.accountType !== 'ADMIN' &&
    existingRequest.volunteerId === actor.id
  ) {
    throw new AppError('لا يمكنك الاستجابة لطلب الاستغاثة الخاص بك', 400);
  }

  if (!isRequestActive(existingRequest)) {
    throw new AppError('طلب الاستغاثة لم يعد نشطًا', 409);
  }

  return updateSosRequestStatus(parsedRequestId, { status: 'RESPONDED' }, actor);
}

module.exports = {
  cancelActiveSosRequest,
  createSosRequest,
  getActiveSosRequest,
  getSosRequestById,
  listNearbySosRequests,
  listSosRequests,
  respondToSosRequest,
  updateSosRequestLocation,
  updateSosRequestStatus,
};