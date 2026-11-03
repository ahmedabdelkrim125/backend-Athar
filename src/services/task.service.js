const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { buildDistanceContext } = require('../utils/geolocation');
const {
  serializeLocation,
  serializePagination,
  serializeVolunteerSummary,
} = require('../utils/serializers');
const { getTaskAttendanceRadius } = require('../utils/task-metrics');
const { assertManualAssignmentUpdateAllowed } = require('../utils/mission-checkin');
const { canManageCampaignById } = require('../middleware/rbac.middleware');
const {
  parsePositiveInteger,
  validateTaskAssignmentCreatePayload,
  validateTaskAssignmentUpdatePayload,
  validateTaskCreatePayload,
  validateTaskListQuery,
  validateTaskUpdatePayload,
} = require('../validators/resource.validators');
const { resolveLocationInput } = require('./location.service');
const { syncTaskStatusFromAssignments } = require('./task-assignment.service');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = notificationService;

const volunteerSummarySelect = {
  id: true,
  fullName: true,
  nationalId: true,
  email: true,
  phone: true,
  avatarUrl: true,
  status: true,
};

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  return value ? new Date(value).toISOString().slice(11, 19) : null;
}

function serializeAssignment(assignment) {
  return {
    id: assignment.id,
    volunteerId: assignment.volunteerId,
    taskId: assignment.taskId,
    status: assignment.status,
    checkInTime: assignment.checkInTime?.toISOString() ?? null,
    checkOutTime: assignment.checkOutTime?.toISOString() ?? null,
    hoursWorked: assignment.hoursWorked,
    attendancePointsAwarded: assignment.attendancePointsAwarded ?? 0,
    volunteer: serializeVolunteerSummary(assignment.volunteer),
  };
}

function buildTaskInclude(options = {}) {
  const include = {
    location: true,
    campaign: {
      select: {
        id: true,
        title: true,
        status: true,
        createdById: true,
        coverImage: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        attendanceRadiusMeters: true,
        attendancePoints: true,
        reportPoints: true,
      },
    },
    _count: {
      select: {
        volunteerTasks: true,
        reports: true,
      },
    },
  };

  if (options.currentVolunteerId) {
    include.volunteerTasks = {
      where: {
        volunteerId: options.currentVolunteerId,
      },
    };
  }

  if (options.includeAssignments) {
    include.volunteerTasks = {
      include: {
        volunteer: {
          select: volunteerSummarySelect,
        },
      },
      orderBy: {
        id: 'asc',
      },
    };
  }

  return include;
}

function serializeTask(task, options = {}) {
  const includeAssignments = options.includeAssignments ?? false;
  const currentVolunteerId = options.currentVolunteerId ?? null;
  const viewerCoordinates = options.viewerCoordinates ?? null;
  const assignments = Array.isArray(task.volunteerTasks) ? task.volunteerTasks : [];
  const myAssignment =
    currentVolunteerId !== null
      ? assignments.find((assignment) => assignment.volunteerId === currentVolunteerId) || null
      : null;
  const location = serializeLocation(task.location);
  const attendanceRadiusMeters = getTaskAttendanceRadius(task);
  const distance = buildDistanceContext(location, viewerCoordinates, attendanceRadiusMeters);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    date: formatDateOnly(task.date),
    startTime: formatTimeOnly(task.startTime),
    endTime: formatTimeOnly(task.endTime),
    status: task.status,
    approvalStatus: task.approvalStatus,
    requiredVolunteers: task.requiredVolunteers,
    campaign: task.campaign
      ? {
          id: task.campaign.id,
          title: task.campaign.title,
          status: task.campaign.status,
          createdById: task.campaign.createdById,
          coverImage: task.campaign.coverImage ?? null,
          startDate: formatDateOnly(task.campaign.startDate),
          endDate: formatDateOnly(task.campaign.endDate),
          startTime: formatTimeOnly(task.campaign.startTime),
          endTime: formatTimeOnly(task.campaign.endTime),
        }
      : null,
    location,
    stats: {
      assignments: task._count?.volunteerTasks ?? assignments.length,
      reports: task._count?.reports ?? 0,
    },
    attendance: {
      radiusMeters: attendanceRadiusMeters,
      pointsOnCheckIn: task.campaign?.attendancePoints ?? 0,
      pointsOnReport: task.campaign?.reportPoints ?? 0,
      distanceMeters: distance.distanceMeters,
      isWithinRange: distance.isWithinRange,
      canCheckIn: myAssignment ? myAssignment.status === 'ASSIGNED' : false,
      canSubmitReport: myAssignment
        ? ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(myAssignment.status)
        : false,
    },
    myAssignment: myAssignment ? serializeAssignment(myAssignment) : null,
    assignments: includeAssignments ? assignments.map(serializeAssignment) : undefined,
  };
}

async function ensureTaskOwner(task, actor) {
  if (!(await canManageCampaignById(actor, task.campaign))) {
    throw new AppError('غير مسموح لك بإدارة هذه المهمة', 403);
  }
}

async function getTaskOrThrow(taskId, options = {}) {
  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
    },
    include: buildTaskInclude(options),
  });

  if (!task) {
    throw new AppError('المهمة غير موجودة', 404);
  }

  return task;
}

async function getCampaignForTaskManagement(campaignId, actor) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId,
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      locationId: true,
      createdById: true,
      createdByAdminId: true,
    },
  });

  if (!campaign) {
    throw new AppError('الحملة غير موجودة', 404);
  }

  if (!(await canManageCampaignById(actor, campaign))) {
    throw new AppError('غير مسموح لك بإدارة مهام هذه الحملة', 403);
  }

  return campaign;
}

function ensureTaskDateWithinCampaign(taskDate, campaign) {
  const campaignStartDate = new Date(campaign.startDate);
  const campaignEndDate = new Date(campaign.endDate);

  if (taskDate < campaignStartDate || taskDate > campaignEndDate) {
    throw new AppError('تاريخ المهمة يجب أن يقع داخل تاريخ الحملة', 400);
  }
}

async function listTasks(query, actor) {
  const volunteerId = actor.accountType === 'ADMIN' ? -1 : actor.id;
  const filters = validateTaskListQuery(query);
  const where = {};

  if (filters.campaignId) {
    where.campaignId = filters.campaignId;
  }

  if (filters.locationId) {
    where.locationId = filters.locationId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.date) {
    where.date = filters.date;
  }

  if (filters.fromDate || filters.toDate) {
    where.date = {
      ...(filters.fromDate ? { gte: filters.fromDate } : {}),
      ...(filters.toDate ? { lte: filters.toDate } : {}),
    };
  }

  if (filters.assignedToMe || query.mine === 'true') {
    where.volunteerTasks = {
      some: {
        volunteerId,
      },
    };
  } else if (filters.volunteerId) {
    where.volunteerTasks = {
      some: {
        volunteerId: filters.volunteerId,
      },
    };
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: buildTaskInclude({
        currentVolunteerId: actor.accountType === 'ADMIN' ? null : volunteerId,
      }),
      orderBy: [
        { date: 'asc' },
        { id: 'desc' },
      ],
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    message: 'تم جلب المهام بنجاح',
    pagination: serializePagination(filters.page, filters.limit, total),
    tasks: tasks.map((task) =>
      serializeTask(task, {
        currentVolunteerId: actor.accountType === 'ADMIN' ? null : volunteerId,
        viewerCoordinates: filters.coordinates,
      }),
    ),
  };
}

async function getTaskById(taskId, actor, query = {}) {
  const volunteerId = actor.accountType === 'ADMIN' ? -1 : actor.id;
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const filters = validateTaskListQuery({
    latitude: query.latitude,
    longitude: query.longitude,
  });
  const task = await getTaskOrThrow(parsedTaskId, {
    currentVolunteerId: actor.accountType === 'ADMIN' ? null : volunteerId,
    includeAssignments: true,
  });

  return {
    message: 'تم جلب بيانات المهمة بنجاح',
    task: serializeTask(task, {
      currentVolunteerId: actor.accountType === 'ADMIN' ? null : volunteerId,
      includeAssignments: true,
      viewerCoordinates: filters.coordinates,
    }),
  };
}

async function createTask(payload, actor) {
  const validatedPayload = validateTaskCreatePayload(payload);
  const campaign = await getCampaignForTaskManagement(
    validatedPayload.campaignId,
    actor,
  );

  ensureTaskDateWithinCampaign(validatedPayload.date, campaign);

  const task = await prisma.$transaction(async (transactionClient) => {
    const locationId =
      validatedPayload.locationId || validatedPayload.location
        ? await resolveLocationInput(transactionClient, validatedPayload)
        : campaign.locationId;

    return transactionClient.task.create({
      data: {
        title: validatedPayload.title,
        description: validatedPayload.description,
        campaignId: validatedPayload.campaignId,
        date: validatedPayload.date,
        startTime: validatedPayload.startTime,
        endTime: validatedPayload.endTime,
        attendanceRadiusMeters: validatedPayload.attendanceRadiusMeters,
        status: validatedPayload.status,
        approvalStatus: 'PENDING_APPROVAL',
        requiredVolunteers: validatedPayload.requiredVolunteers,
        locationId,
      },
      include: buildTaskInclude({
        currentVolunteerId: actor.accountType === 'ADMIN' ? -1 : actor.id,
      }),
    });
  });

  return {
    message: 'تم إنشاء المهمة بنجاح',
    task: serializeTask(task, {
      currentVolunteerId: actor.accountType === 'ADMIN' ? null : actor.id,
    }),
  };
}

async function updateTask(taskId, payload, actor) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const validatedPayload = validateTaskUpdatePayload(payload);
  const existingTask = await getTaskOrThrow(parsedTaskId, {
    currentVolunteerId: actor.accountType === 'ADMIN' ? -1 : actor.id,
  });

  await ensureTaskOwner(existingTask, actor);

  if (Object.keys(validatedPayload).length === 0) {
    throw new AppError('لا توجد بيانات صالحة للتحديث', 400);
  }

  const campaign = await getCampaignForTaskManagement(existingTask.campaignId, actor);
  const nextTaskDate = validatedPayload.date || existingTask.date;

  ensureTaskDateWithinCampaign(nextTaskDate, campaign);

  const nextStartTime =
    validatedPayload.startTime !== undefined ? validatedPayload.startTime : existingTask.startTime;
  const nextEndTime =
    validatedPayload.endTime !== undefined ? validatedPayload.endTime : existingTask.endTime;

  if (nextStartTime && nextEndTime && nextStartTime >= nextEndTime) {
    throw new AppError('وقت البداية يجب أن يكون قبل وقت النهاية', 400);
  }

  const task = await prisma.$transaction(async (transactionClient) => {
    const data = {
      title: validatedPayload.title,
      description: validatedPayload.description,
      date: validatedPayload.date,
      startTime: validatedPayload.startTime,
      endTime: validatedPayload.endTime,
      attendanceRadiusMeters: validatedPayload.attendanceRadiusMeters,
      requiredVolunteers: validatedPayload.requiredVolunteers,
      status: validatedPayload.status,
    };

    if (validatedPayload.locationId || validatedPayload.location) {
      data.locationId = await resolveLocationInput(transactionClient, validatedPayload);
    }

    return transactionClient.task.update({
      where: {
        id: parsedTaskId,
      },
      data: Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
      include: buildTaskInclude({
        currentVolunteerId: actor.accountType === 'ADMIN' ? -1 : actor.id,
      }),
    });
  });

  return {
    message: 'تم تحديث المهمة بنجاح',
    task: serializeTask(task, {
      currentVolunteerId: actor.accountType === 'ADMIN' ? null : actor.id,
    }),
  };
}

async function listTaskAssignments(taskId, actor) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const task = await getTaskOrThrow(parsedTaskId, {
    includeAssignments: true,
  });

  await ensureTaskOwner(task, actor);

  return {
    message: 'تم جلب إسنادات المهمة بنجاح',
    assignments: (task.volunteerTasks || []).map(serializeAssignment),
  };
}

async function assignVolunteerToTask(taskId, payload, actor) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const validatedPayload = validateTaskAssignmentCreatePayload(payload);
  const task = await getTaskOrThrow(parsedTaskId);

  await ensureTaskOwner(task, actor);

  const volunteer = await prisma.volunteer.findUnique({
    where: {
      id: validatedPayload.volunteerId,
    },
    select: volunteerSummarySelect,
  });

  if (!volunteer) {
    throw new AppError('المتطوع غير موجود', 404);
  }

  const existingAssignment = await prisma.volunteerTask.findUnique({
    where: {
      volunteerId_taskId: {
        volunteerId: validatedPayload.volunteerId,
        taskId: parsedTaskId,
      },
    },
  });

  if (existingAssignment) {
    throw new AppError('هذا المتطوع مسند بالفعل إلى المهمة', 409);
  }

  let result;
  try {
    result = await prisma.$transaction(async (transactionClient) => {
      await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
      const currentTask = await transactionClient.task.findUnique({
        where: { id: parsedTaskId },
        select: {
          status: true,
          approvalStatus: true,
          requiredVolunteers: true,
          campaign: { select: { status: true } },
        },
      });
      if (!currentTask || ['CANCELLED', 'COMPLETED'].includes(currentTask.status)) {
        throw new AppError('لا يمكن الإسناد إلى مهمة منتهية أو ملغاة', 409);
      }
      if (
        currentTask.approvalStatus !== 'APPROVED' ||
        !['PUBLISHED', 'ACTIVE'].includes(currentTask.campaign.status)
      ) {
        throw new AppError('اعتمد المهمة وانشر الحملة قبل الإسناد', 409);
      }
      if (currentTask.requiredVolunteers !== null) {
        const [participants, pendingRequests] = await Promise.all([
          transactionClient.volunteerTask.count({
            where: { taskId: parsedTaskId, status: { not: 'CANCELLED' } },
          }),
          transactionClient.missionJoinRequest.count({
            where: { taskId: parsedTaskId, status: 'PENDING' },
          }),
        ]);
        if (participants + pendingRequests >= currentTask.requiredVolunteers) {
          throw new AppError('اكتمل عدد الأماكن المتاحة للمهمة', 409);
        }
      }

      const createdAssignment = await transactionClient.volunteerTask.create({
        data: {
          volunteerId: validatedPayload.volunteerId,
          taskId: parsedTaskId,
          status: validatedPayload.status,
        },
        include: {
          volunteer: {
            select: volunteerSummarySelect,
          },
        },
      });

      await transactionClient.missionJoinRequest.upsert({
        where: {
          volunteerId_taskId: {
            volunteerId: validatedPayload.volunteerId,
            taskId: parsedTaskId,
          },
        },
        create: {
          volunteerId: validatedPayload.volunteerId,
          taskId: parsedTaskId,
          status: 'APPROVED',
          decidedAt: new Date(),
        },
        update: {
          status: 'APPROVED',
          decidedAt: new Date(),
        },
      });
      await syncTaskStatusFromAssignments(transactionClient, parsedTaskId);
      const notification = await notificationService.createInAppNotification(
        {
          userId: validatedPayload.volunteerId,
          title: 'تم قبول طلب الانضمام',
          body: 'تم إسنادك إلى المهمة ويمكنك الآن الاطلاع على تفاصيلها.',
          type: NOTIFICATION_TYPES.MISSION_JOIN_APPROVED,
          eventKey: `mission-assigned:${createdAssignment.id}`,
          data: {
            taskId: parsedTaskId,
            deepLink: `athar://missions/${parsedTaskId}`,
          },
        },
        transactionClient,
      );
      return { assignment: createdAssignment, notification };
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError('هذا المتطوع مسند بالفعل إلى المهمة', 409);
    }
    throw error;
  }

  await notificationService.sendNotificationPush(result.notification);

  return {
    message: 'تم إسناد المتطوع إلى المهمة بنجاح',
    assignment: serializeAssignment(result.assignment),
  };
}

async function updateTaskAssignment(taskId, assignmentVolunteerId, payload, actor) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const parsedVolunteerId = parsePositiveInteger(assignmentVolunteerId, 'معرف المتطوع');
  const validatedPayload = validateTaskAssignmentUpdatePayload(payload);

  const assignment = await prisma.volunteerTask.findUnique({
    where: {
      volunteerId_taskId: {
        volunteerId: parsedVolunteerId,
        taskId: parsedTaskId,
      },
    },
    include: {
      volunteer: {
        select: volunteerSummarySelect,
      },
      task: {
        include: {
          campaign: {
            select: {
              createdById: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError('إسناد المهمة غير موجود', 404);
  }

  const isTaskOwner = actor.accountType === 'ADMIN';
  const isAssignedVolunteer = actor.accountType !== 'ADMIN' && assignment.volunteerId === actor.id;

  if (!isTaskOwner && !isAssignedVolunteer) {
    throw new AppError('غير مسموح لك بتحديث هذا الإسناد', 403);
  }

  const updatedAssignment = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
    const currentAssignment = await transactionClient.volunteerTask.findUnique({
      where: {
        volunteerId_taskId: {
          volunteerId: parsedVolunteerId,
          taskId: parsedTaskId,
        },
      },
      select: {
        status: true,
        checkInTime: true,
        checkOutTime: true,
      },
    });
    if (!currentAssignment) throw new AppError('إسناد المهمة غير موجود', 404);
    assertManualAssignmentUpdateAllowed(currentAssignment, validatedPayload, isTaskOwner);
    const nextCheckInTime =
      validatedPayload.checkInTime !== undefined
        ? validatedPayload.checkInTime
        : currentAssignment.checkInTime;
    const nextCheckOutTime =
      validatedPayload.checkOutTime !== undefined
        ? validatedPayload.checkOutTime
        : currentAssignment.checkOutTime;
    if (
      nextCheckInTime &&
      nextCheckOutTime &&
      nextCheckInTime >= nextCheckOutTime
    ) {
      throw new AppError('وقت الحضور يجب أن يكون قبل وقت الانصراف', 400);
    }

    const assignmentRecord = await transactionClient.volunteerTask.update({
      where: {
        volunteerId_taskId: {
          volunteerId: parsedVolunteerId,
          taskId: parsedTaskId,
        },
      },
      data: validatedPayload,
      include: {
        volunteer: {
          select: volunteerSummarySelect,
        },
      },
    });

    await syncTaskStatusFromAssignments(transactionClient, parsedTaskId);

    return assignmentRecord;
  });

  return {
    message: 'تم تحديث إسناد المهمة بنجاح',
    assignment: serializeAssignment(updatedAssignment),
  };
}

module.exports = {
  assignVolunteerToTask,
  createTask,
  getTaskById,
  listTaskAssignments,
  listTasks,
  updateTask,
  updateTaskAssignment,
};
