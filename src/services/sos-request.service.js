const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
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
    isActive: ACTIVE_SOS_STATUSES.includes(sosRequest.status),
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
    return {
      statusCode: 200,
      message: 'يوجد طلب طوارئ نشط بالفعل لهذا الحساب',
      request: serializeSosRequest(existingActiveRequest),
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

module.exports = {
  cancelActiveSosRequest,
  createSosRequest,
  getActiveSosRequest,
  getSosRequestById,
  listSosRequests,
  updateSosRequestStatus,
};
