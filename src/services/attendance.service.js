const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { syncVolunteerBadges } = require('./reward.service');
const { syncTaskStatusFromAssignments } = require('./task-assignment.service');
const { buildDistanceContext } = require('../utils/geolocation');
const { serializeLocation } = require('../utils/serializers');
const { getTaskAttendanceRadius } = require('../utils/task-metrics');
const { assertMissionCheckInEligible } = require('../utils/mission-checkin');
const notificationService = require('./notification.service');
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
        status: true,
      },
    },
    missionJoinRequests: {
      where: { volunteerId: currentVolunteerId },
      select: { status: true },
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
    joinRequest: task.missionJoinRequests?.[0] || null,
  };
}

function serializeAttendancePreview(task, assignment, joinRequest, coordinates) {
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
      canCheckIn:
        task.approvalStatus === 'APPROVED' &&
        joinRequest?.status === 'APPROVED' &&
        assignment.status === 'ASSIGNED',
      canSubmitReport: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(
        assignment.status,
      ),
    },
  };
}

async function getAttendancePreview(taskId, volunteerId, query = {}) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const { coordinates } = validateAttendancePreviewQuery(query);
  const { task, assignment, joinRequest } = await getAssignedTaskOrThrow(
    parsedTaskId,
    volunteerId,
  );

  return {
    message: 'تم التحقق من بيانات الحضور بنجاح',
    attendance: serializeAttendancePreview(task, assignment, joinRequest, coordinates),
  };
}

async function checkInToTask(taskId, payload, volunteerId) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const coordinates = validateAttendanceCheckInPayload(payload);
  const now = new Date();
  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${parsedTaskId} FOR UPDATE`;
    const task = await transactionClient.task.findUnique({
      where: { id: parsedTaskId },
      include: buildAttendanceTaskInclude(volunteerId),
    });
    const assignment = task?.volunteerTasks?.[0] ?? null;
    const joinRequest = task?.missionJoinRequests?.[0] ?? null;
    if (!task) throw new AppError('المهمة غير موجودة', 404);
    if (!assignment) throw new AppError('لا توجد مهمة مسندة لك بهذا المعرف', 403);
    assertMissionCheckInEligible(task, assignment, joinRequest, now);

    const radiusMeters = getTaskAttendanceRadius(task);
    const location = serializeLocation(task.location);
    const distance = buildDistanceContext(location, coordinates, radiusMeters);
    if (distance.isWithinRange === false) {
      throw new AppError('أنت خارج نطاق الحضور المسموح للمهمة', 403);
    }
    const pointsDelta = assignment.attendancePointsAwarded
      ? 0
      : task.campaign.attendancePoints;
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
    const notification = await notificationService.createInAppNotification(
      {
        userId: volunteerId,
        title: 'تم تسجيل الحضور',
        body: `تم تسجيل حضورك لمهمة "${task.title}".`,
        type: notificationService.NOTIFICATION_TYPES.MISSION_CHECK_IN,
        eventKey: `mission-check-in:${parsedTaskId}:${volunteerId}`,
        data: {
          taskId: parsedTaskId,
          campaignId: task.campaign.id,
          deepLink: `athar://missions/${parsedTaskId}`,
        },
      },
      transactionClient,
    );

    return {
      task,
      location,
      distance,
      radiusMeters,
      pointsDelta,
      assignment: updatedAssignment,
      volunteer: updatedVolunteer,
      newlyAwardedBadges,
      notification,
    };
  });

  await notificationService.sendNotificationPush(result.notification);

  return {
    message: 'تم تسجيل الحضور بنجاح',
    attendance: {
      taskId: result.task.id,
      campaignId: result.task.campaign.id,
      checkedInAt: result.assignment.checkInTime?.toISOString() ?? now.toISOString(),
      location: result.location,
      distanceMeters: result.distance.distanceMeters,
      radiusMeters: result.radiusMeters,
      status: result.assignment.status,
    },
    summary: {
      pointsAwarded: result.pointsDelta,
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
