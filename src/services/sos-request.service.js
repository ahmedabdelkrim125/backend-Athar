const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { calculateDistanceMeters } = require('../utils/geolocation');
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

const ACTIVE_SOS_STATUSES = ['OPEN', 'RESPONDED'];
const ACTIVE_WINDOW_HOURS = 12;
const NEARBY_DEFAULT_RADIUS_KM = 10;
const NEARBY_MAX_RADIUS_KM = 100;

function activeSince() {
  return new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000);
}

function isRequestActive(sosRequest) {
  return (
    ACTIVE_SOS_STATUSES.includes(sosRequest.status) &&
    sosRequest.createdAt >= activeSince()
  );
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
    case 'RESOLVED':
      return 'تمت المعالجة';
    case 'CANCELLED':
      return 'تم الإلغاء';
    default:
      return status;
  }
}

function serializeSosRequest(sosRequest) {
  const latitude = decimalToNumber(sosRequest.latitude);
  const longitude = decimalToNumber(sosRequest.longitude);

  return {
    id: sosRequest.id,
    volunteerId: sosRequest.volunteerId,
    latitude,
    longitude,
    location: {
      latitude,
      longitude,
    },
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
      createdAt: {
        gte: activeSince(),
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

async function listSosRequests(query, volunteerId) {
  const filters = validateSosRequestListQuery(query);
  const where = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.volunteerId) {
    where.volunteerId = filters.volunteerId;
  }

  if (filters.mine || query.mine === 'true') {
    where.volunteerId = volunteerId;
  }

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

async function getSosRequestById(requestId) {
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  const sosRequest = await getSosRequestOrThrow(parsedRequestId);

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
          in: ['RESOLVED', 'CANCELLED'],
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
  const validatedPayload = validateSosRequestCreatePayload(payload);
  const existingActiveRequest = await findActiveSosRequest(volunteerId);

  if (existingActiveRequest) {
    const refreshedRequest = await prisma.sosRequest.update({
      where: {
        id: existingActiveRequest.id,
      },
      data: {
        latitude: validatedPayload.latitude,
        longitude: validatedPayload.longitude,
      },
      include: sosRequestInclude,
    });

    return {
      statusCode: 200,
      message: 'يوجد طلب طوارئ نشط بالفعل لهذا الحساب',
      request: serializeSosRequest(refreshedRequest),
      created: false,
    };
  }

  const sosRequest = await prisma.sosRequest.create({
    data: {
      volunteerId,
      latitude: validatedPayload.latitude,
      longitude: validatedPayload.longitude,
    },
    include: sosRequestInclude,
  });

  return {
    statusCode: 201,
    message: 'تم إنشاء طلب الاستغاثة بنجاح',
    request: serializeSosRequest(sosRequest),
    created: true,
  };
}

async function cancelActiveSosRequest(volunteerId) {
  const activeRequest = await findActiveSosRequest(volunteerId);

  if (!activeRequest) {
    throw new AppError('لا يوجد طلب طوارئ نشط لإلغائه', 404);
  }

  const sosRequest = await prisma.sosRequest.update({
    where: {
      id: activeRequest.id,
    },
    data: {
      status: 'CANCELLED',
      resolvedAt: new Date(),
    },
    include: sosRequestInclude,
  });

  return {
    message: 'تم إلغاء طلب الطوارئ النشط بنجاح',
    request: serializeSosRequest(sosRequest),
  };
}

async function updateSosRequestStatus(requestId, payload, volunteerId) {
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  const validatedPayload = validateSosRequestStatusPayload(payload);
  const existingRequest = await getSosRequestOrThrow(parsedRequestId);

  if (
    validatedPayload.status === 'CANCELLED' &&
    existingRequest.volunteerId !== volunteerId
  ) {
    throw new AppError('فقط صاحب الطلب يمكنه إلغاء الاستغاثة', 403);
  }

  if (
    existingRequest.volunteerId !== volunteerId &&
    !['RESPONDED', 'RESOLVED'].includes(validatedPayload.status)
  ) {
    throw new AppError('غير مسموح لك بتغيير حالة هذا الطلب إلى هذه القيمة', 403);
  }

  const sosRequest = await prisma.sosRequest.update({
    where: {
      id: parsedRequestId,
    },
    data: {
      status: validatedPayload.status,
      resolvedAt:
        ['RESOLVED', 'CANCELLED'].includes(validatedPayload.status) ? new Date() : null,
    },
    include: sosRequestInclude,
  });

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
  const { latitude, longitude } = validateSosRequestCreatePayload(payload);
  const existingRequest = await getSosRequestOrThrow(parsedRequestId);

  if (existingRequest.volunteerId !== volunteerId) {
    throw new AppError('فقط صاحب الطلب يمكنه تحديث الموقع', 403);
  }

  if (!isRequestActive(existingRequest)) {
    throw new AppError('طلب الاستغاثة لم يعد نشطًا', 409);
  }

  const sosRequest = await prisma.sosRequest.update({
    where: {
      id: parsedRequestId,
    },
    data: {
      latitude,
      longitude,
    },
    include: sosRequestInclude,
  });

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

async function respondToSosRequest(requestId, volunteerId) {
  const parsedRequestId = parsePositiveInteger(requestId, 'معرف الاستغاثة');
  const existingRequest = await getSosRequestOrThrow(parsedRequestId);

  if (existingRequest.volunteerId === volunteerId) {
    throw new AppError('لا يمكنك الاستجابة لطلب الاستغاثة الخاص بك', 400);
  }

  if (!isRequestActive(existingRequest)) {
    throw new AppError('طلب الاستغاثة لم يعد نشطًا', 409);
  }

  if (existingRequest.status === 'OPEN') {
    await prisma.sosRequest.updateMany({
      where: {
        id: parsedRequestId,
        status: 'OPEN',
      },
      data: {
        status: 'RESPONDED',
      },
    });
  }

  const sosRequest = await getSosRequestOrThrow(parsedRequestId);

  return {
    message: 'تم تسجيل استجابتك لطلب الاستغاثة',
    request: serializeSosRequest(sosRequest),
  };
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