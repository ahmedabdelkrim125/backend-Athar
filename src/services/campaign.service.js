const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { buildDistanceContext } = require('../utils/geolocation');
const {
  serializeLocation,
  serializePagination,
  serializeVolunteerSummary,
} = require('../utils/serializers');
const {
  parseCoordinatesQuery,
  parsePositiveInteger,
  validateCampaignCreatePayload,
  validateCampaignListQuery,
  validateCampaignUpdatePayload,
} = require('../validators/resource.validators');
const { resolveLocationInput } = require('./location.service');
const { canCreateCampaign, canManageCampaignById } = require('../middleware/rbac.middleware');
const { writeAuditLog } = require('./audit.service');
const notificationService = require('./notification.service');

const volunteerSummarySelect = {
  id: true,
  fullName: true,
  nationalId: true,
  email: true,
  phone: true,
  avatarUrl: true,
  status: true,
};

const campaignInclude = {
  location: true,
  createdBy: {
    select: volunteerSummarySelect,
  },
  createdByAdmin: {
    select: { id: true, fullName: true, email: true },
  },
  _count: {
    select: {
      tasks: true,
      reports: true,
      ratings: true,
    },
  },
};

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  return value ? new Date(value).toISOString().slice(11, 19) : null;
}

function serializeCampaignTaskSummary(task, currentVolunteerId) {
  if (!task) {
    return null;
  }

  const myAssignment =
    Array.isArray(task.volunteerTasks) && currentVolunteerId
      ? task.volunteerTasks.find((assignment) => assignment.volunteerId === currentVolunteerId) ||
        null
      : null;

  return {
    id: task.id,
    title: task.title,
    date: formatDateOnly(task.date),
    startTime: formatTimeOnly(task.startTime),
    endTime: formatTimeOnly(task.endTime),
    status: task.status,
    location: serializeLocation(task.location),
    myAssignment: myAssignment
      ? {
          status: myAssignment.status,
          checkInTime: myAssignment.checkInTime?.toISOString() ?? null,
        }
      : null,
  };
}

function serializeCampaign(campaign, options = {}) {
  const location = serializeLocation(campaign.location);
  const attendance = buildDistanceContext(
    location,
    options.viewerCoordinates ?? null,
    campaign.attendanceRadiusMeters,
  );

  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    coverImage: campaign.coverImage ?? null,
    startDate: formatDateOnly(campaign.startDate),
    endDate: formatDateOnly(campaign.endDate),
    startTime: formatTimeOnly(campaign.startTime),
    endTime: formatTimeOnly(campaign.endTime),
    status: campaign.status,
    location,
    createdBy: campaign.createdBy
      ? serializeVolunteerSummary(campaign.createdBy)
      : campaign.createdByAdmin
        ? {
            id: campaign.createdByAdmin.id,
            fullName: campaign.createdByAdmin.fullName,
            email: campaign.createdByAdmin.email,
            role: 'ADMIN',
          }
        : null,
    attendance: {
      radiusMeters: campaign.attendanceRadiusMeters,
      pointsOnCheckIn: campaign.attendancePoints,
      pointsOnReport: campaign.reportPoints,
      distanceMeters: attendance.distanceMeters,
      isWithinRange: attendance.isWithinRange,
    },
    stats: {
      tasks: campaign._count?.tasks ?? 0,
      reports: campaign._count?.reports ?? 0,
      ratings: campaign._count?.ratings ?? 0,
      registeredVolunteers: options.registeredVolunteers ?? 0,
    },
    nextTask: options.nextTask
      ? serializeCampaignTaskSummary(options.nextTask, options.currentVolunteerId)
      : null,
  };
}

async function getCampaignOrThrow(campaignId) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId,
    },
    include: campaignInclude,
  });

  if (!campaign) {
    throw new AppError('الحملة غير موجودة', 404);
  }

  return campaign;
}

async function ensureCampaignOwner(campaign, actor) {
  if (!(await canManageCampaignById(actor, campaign))) {
    throw new AppError('غير مسموح لك بإدارة هذه الحملة', 403);
  }
}

async function listCampaigns(query, actor) {
  const filters = validateCampaignListQuery(query);
  const where = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.createdById) {
    where.createdById = filters.createdById;
  }

  if (filters.locationId) {
    where.locationId = filters.locationId;
  }

  if (query.mine === 'true') {
    if (actor.accountType === 'ADMIN') where.createdByAdminId = actor.id;
    else where.createdById = actor.id;
  }

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: campaignInclude,
      orderBy: [
        { startDate: 'asc' },
        { id: 'desc' },
      ],
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    message: 'تم جلب الحملات بنجاح',
    pagination: serializePagination(filters.page, filters.limit, total),
    campaigns: campaigns.map(serializeCampaign),
  };
}

async function getCampaignById(campaignId, actor, query = {}) {
  const parsedCampaignId = parsePositiveInteger(campaignId, 'معرف الحملة');
  const viewerCoordinates = parseCoordinatesQuery(query);
  const campaign = await getCampaignOrThrow(parsedCampaignId);
  const [registeredVolunteers, nextTask] = await Promise.all([
    prisma.volunteerTask.findMany({
      where: {
        task: {
          campaignId: parsedCampaignId,
        },
      },
      distinct: ['volunteerId'],
      select: {
        volunteerId: true,
      },
    }),
    prisma.task.findFirst({
      where: {
        campaignId: parsedCampaignId,
      },
      include: {
        location: true,
        volunteerTasks: {
          where: {
            volunteerId: actor.accountType === 'ADMIN' ? -1 : actor.id,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' },
        { id: 'asc' },
      ],
    }),
  ]);

  return {
    message: 'تم جلب بيانات الحملة بنجاح',
    campaign: serializeCampaign(campaign, {
      currentVolunteerId: actor.accountType === 'ADMIN' ? null : actor.id,
      nextTask,
      registeredVolunteers: registeredVolunteers.length,
      viewerCoordinates,
    }),
  };
}

async function createCampaign(payload, actor) {
  if (!(await canCreateCampaign(actor))) {
    throw new AppError('إنشاء الحملات متاح للأدمن فقط', 403);
  }
  const validatedPayload = validateCampaignCreatePayload(payload);

  const campaign = await prisma.$transaction(async (transactionClient) => {
    const locationId = await resolveLocationInput(transactionClient, validatedPayload);

    return transactionClient.campaign.create({
      data: {
        title: validatedPayload.title,
        description: validatedPayload.description,
        coverImage: validatedPayload.coverImage,
        startDate: validatedPayload.startDate,
        endDate: validatedPayload.endDate,
        startTime: validatedPayload.startTime,
        endTime: validatedPayload.endTime,
        status: validatedPayload.status,
        attendanceRadiusMeters: validatedPayload.attendanceRadiusMeters,
        attendancePoints: validatedPayload.attendancePoints,
        reportPoints: validatedPayload.reportPoints,
        locationId,
        ...(actor.accountType === 'ADMIN'
          ? { createdByAdminId: actor.id }
          : { createdById: actor.id }),
      },
      include: campaignInclude,
    });
  });

  return {
    message: 'تم إنشاء الحملة بنجاح',
    campaign: serializeCampaign(campaign),
  };
}

async function updateCampaign(campaignId, payload, actor) {
  const parsedCampaignId = parsePositiveInteger(campaignId, 'معرف الحملة');
  const validatedPayload = validateCampaignUpdatePayload(payload);
  const existingCampaign = await getCampaignOrThrow(parsedCampaignId);

  await ensureCampaignOwner(existingCampaign, actor);

  if (Object.keys(validatedPayload).length === 0) {
    throw new AppError('لا توجد بيانات صالحة للتحديث', 400);
  }

  const nextStartDate = validatedPayload.startDate || existingCampaign.startDate;
  const nextEndDate = validatedPayload.endDate || existingCampaign.endDate;
  const nextStartTime =
    validatedPayload.startTime !== undefined ? validatedPayload.startTime : existingCampaign.startTime;
  const nextEndTime =
    validatedPayload.endTime !== undefined ? validatedPayload.endTime : existingCampaign.endTime;

  if (nextStartDate > nextEndDate) {
    throw new AppError('تاريخ بداية الحملة يجب أن يكون قبل أو مساويًا لتاريخ النهاية', 400);
  }

  if (nextStartTime && nextEndTime && nextStartTime >= nextEndTime) {
    throw new AppError('وقت بداية الحملة يجب أن يكون قبل وقت النهاية', 400);
  }

  const result = await prisma.$transaction(async (transactionClient) => {
    const data = {
      title: validatedPayload.title,
      description: validatedPayload.description,
      coverImage: validatedPayload.coverImage,
      startDate: validatedPayload.startDate,
      endDate: validatedPayload.endDate,
      startTime: validatedPayload.startTime,
      endTime: validatedPayload.endTime,
      status: validatedPayload.status,
      attendanceRadiusMeters: validatedPayload.attendanceRadiusMeters,
      attendancePoints: validatedPayload.attendancePoints,
      reportPoints: validatedPayload.reportPoints,
    };

    if (validatedPayload.locationId || validatedPayload.location) {
      data.locationId = await resolveLocationInput(transactionClient, validatedPayload);
    }

    const updatedCampaign = await transactionClient.campaign.update({
      where: {
        id: parsedCampaignId,
      },
      data: Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
      include: campaignInclude,
    });
    const notifications = [];
    if (validatedPayload.status && validatedPayload.status !== existingCampaign.status) {
      await writeAuditLog(
        {
          ...(actor.accountType === 'ADMIN'
            ? { adminId: actor.id }
            : { actorId: actor.id }),
          action: 'CAMPAIGN_STATUS_CHANGED',
          targetType: 'CAMPAIGN',
          targetId: parsedCampaignId,
          data: { from: existingCampaign.status, to: validatedPayload.status },
        },
        transactionClient,
      );
    }
    if (validatedPayload.status === 'CANCELLED' && existingCampaign.status !== 'CANCELLED') {
      const tasks = await transactionClient.task.findMany({
        where: {
          campaignId: parsedCampaignId,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
        select: {
          id: true,
          title: true,
          missionJoinRequests: {
            where: { status: { in: ['PENDING', 'APPROVED'] } },
            select: { volunteerId: true },
          },
          volunteerTasks: {
            where: { status: { in: ['ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT'] } },
            select: { volunteerId: true },
          },
        },
      });
      const taskIds = tasks.map((task) => task.id);
      if (taskIds.length > 0) {
        await transactionClient.task.updateMany({
          where: { id: { in: taskIds } },
          data: { status: 'CANCELLED', approvalStatus: 'CANCELLED' },
        });
        await transactionClient.missionJoinRequest.updateMany({
          where: { taskId: { in: taskIds }, status: { in: ['PENDING', 'APPROVED'] } },
          data: { status: 'CANCELLED', decidedAt: new Date() },
        });
        await transactionClient.volunteerTask.updateMany({
          where: {
            taskId: { in: taskIds },
            status: { in: ['ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT'] },
          },
          data: { status: 'CANCELLED' },
        });
        for (const task of tasks) {
          const recipients = new Set([
            ...task.missionJoinRequests.map((request) => request.volunteerId),
            ...task.volunteerTasks.map((assignment) => assignment.volunteerId),
          ]);
          for (const userId of recipients) {
            const notification = await notificationService.createInAppNotification(
              {
                userId,
                title: 'تم إلغاء الحملة',
                body: `تم إلغاء الحملة "${existingCampaign.title}" والمهمة "${task.title}".`,
                type: notificationService.NOTIFICATION_TYPES.MISSION_CANCELLED,
                eventKey: `campaign-cancelled:${parsedCampaignId}:task:${task.id}`,
                data: {
                  campaignId: parsedCampaignId,
                  taskId: task.id,
                  status: 'CANCELLED',
                },
              },
              transactionClient,
            );
            if (notification) notifications.push(notification);
          }
        }
      }
    }
    return { campaign: updatedCampaign, notifications };
  });
  for (const notification of result.notifications) {
    await notificationService.sendNotificationPush(notification);
  }

  return {
    message: 'تم تحديث الحملة بنجاح',
    campaign: serializeCampaign(result.campaign),
  };
}

module.exports = {
  createCampaign,
  getCampaignById,
  listCampaigns,
  updateCampaign,
};
