const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { syncVolunteerBadges } = require('./reward.service');
const { syncTaskStatusFromAssignments } = require('./task-assignment.service');
const { buildDistanceContext } = require('../utils/geolocation');
const { serializeLocation } = require('../utils/serializers');
const { getTaskAttendanceRadius } = require('../utils/task-metrics');
const {
  parsePositiveInteger,
  validateAttendanceCheckInPayload,
  validateAttendancePreviewQuery,
} = require('../validators/resource.validators');

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  return value ? new Date(value).toISOString().slice(11, 19) : null;
}

function buildAttendanceTaskInclude(currentVolunteerId) {
  return {
    location: true,
    campaign: {
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        attendanceRadiusMeters: true,
        attendancePoints: true,
      },
    },
    volunteerTasks: {
      where: {
        volunteerId: currentVolunteerId,
      },
    },
  };
}

async function getAssignedTaskOrThrow(taskId, volunteerId) {
  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
    },
    include: buildAttendanceTaskInclude(volunteerId),
  });

  if (!task) {
    throw new AppError('المهمة غير موجودة', 404);
  }

  const assignment = task.volunteerTasks?.[0] || null;

  if (!assignment) {
    throw new AppError('لا توجد مهمة مسندة لك بهذا المعرف', 403);
  }

  return {
    task,
    assignment,
  };
}

function serializeAttendancePreview(task, assignment, coordinates) {
  const radiusMeters = getTaskAttendanceRadius(task);
  const location = serializeLocation(task.location);
  const distance = buildDistanceContext(location, coordinates, radiusMeters);

  return {
    taskId: task.id,
    title: task.title,
    date: formatDateOnly(task.date),
    startTime: formatTimeOnly(task.startTime),
    endTime: formatTimeOnly(task.endTime),
    campaign: {
      id: task.campaign.id,
      title: task.campaign.title,
      startDate: formatDateOnly(task.campaign.startDate),
      endDate: formatDateOnly(task.campaign.endDate),
      startTime: formatTimeOnly(task.campaign.startTime),
      endTime: formatTimeOnly(task.campaign.endTime),
    },
    location,
    assignment: {
      status: assignment.status,
      checkInTime: assignment.checkInTime?.toISOString() ?? null,
      checkOutTime: assignment.checkOutTime?.toISOString() ?? null,
    },
    attendance: {
      ...distance,
      pointsOnCheckIn: task.campaign.attendancePoints,
      canCheckIn: ['ASSIGNED', 'CHECKED_OUT'].includes(assignment.status),
      canSubmitReport: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(
        assignment.status,
      ),
    },
  };
}

async function getAttendancePreview(taskId, volunteerId, query = {}) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const { coordinates } = validateAttendancePreviewQuery(query);
  const { task, assignment } = await getAssignedTaskOrThrow(parsedTaskId, volunteerId);

  return {
    message: 'تم التحقق من بيانات الحضور بنجاح',
    attendance: serializeAttendancePreview(task, assignment, coordinates),
  };
}

async function checkInToTask(taskId, payload, volunteerId) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const coordinates = validateAttendanceCheckInPayload(payload);
  const { task, assignment } = await getAssignedTaskOrThrow(parsedTaskId, volunteerId);
  const radiusMeters = getTaskAttendanceRadius(task);
  const location = serializeLocation(task.location);
  const distance = buildDistanceContext(location, coordinates, radiusMeters);

  if (assignment.status === 'COMPLETED') {
    throw new AppError('تم إنهاء هذه المهمة بالفعل', 400);
  }

  if (assignment.status === 'CHECKED_IN') {
    throw new AppError('تم تسجيل الحضور لهذه المهمة مسبقًا', 409);
  }

  if (distance.isWithinRange === false) {
    throw new AppError('أنت خارج نطاق الحضور المسموح للمهمة', 403);
  }

  const now = new Date();
  const pointsDelta = assignment.attendancePointsAwarded
    ? 0
    : task.campaign.attendancePoints;

  const result = await prisma.$transaction(async (transactionClient) => {
    const updatedAssignment = await transactionClient.volunteerTask.update({
      where: {
        volunteerId_taskId: {
          volunteerId,
          taskId: parsedTaskId,
        },
      },
      data: {
        status: 'CHECKED_IN',
        checkInTime: assignment.checkInTime || now,
        checkInLatitude: coordinates.latitude,
        checkInLongitude: coordinates.longitude,
        attendancePointsAwarded: assignment.attendancePointsAwarded || pointsDelta,
      },
    });

    const updatedVolunteer = await transactionClient.volunteer.update({
      where: {
        id: volunteerId,
      },
      data: {
        points: {
          increment: pointsDelta,
        },
      },
      select: {
        id: true,
        points: true,
        totalHours: true,
      },
    });

    await syncTaskStatusFromAssignments(transactionClient, parsedTaskId);
    const newlyAwardedBadges = await syncVolunteerBadges(
      transactionClient,
      volunteerId,
    );

    return {
      assignment: updatedAssignment,
      volunteer: updatedVolunteer,
      newlyAwardedBadges,
    };
  });

  return {
    message: 'تم تسجيل الحضور بنجاح',
    attendance: {
      taskId: task.id,
      campaignId: task.campaign.id,
      checkedInAt: result.assignment.checkInTime?.toISOString() ?? now.toISOString(),
      location,
      distanceMeters: distance.distanceMeters,
      radiusMeters,
      status: result.assignment.status,
    },
    summary: {
      pointsAwarded: pointsDelta,
      totalPoints: result.volunteer.points,
      totalHours: result.volunteer.totalHours,
      newlyAwardedBadges: result.newlyAwardedBadges,
    },
  };
}

module.exports = {
  checkInToTask,
  getAttendancePreview,
};
