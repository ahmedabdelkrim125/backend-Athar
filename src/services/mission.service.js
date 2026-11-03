const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { serializeBadge, serializeLocation } = require('../utils/serializers');
const {
  calculateTaskDurationHours,
  getTaskAttendanceRadius,
} = require('../utils/task-metrics');
const { parsePositiveInteger } = require('../validators/resource.validators');
const { createReport } = require('./report.service');

const MISSION_TYPE_LABEL = 'مهمة تطوعية';
const MAX_REPORT_NOTES_LENGTH = 500;
const MAX_REPORT_IMAGES = 5;
const FIELD_WORK_STATUSES = ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'];
const REPORTABLE_STATUSES = ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'];

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  return value ? new Date(value).toISOString().slice(11, 19) : null;
}

function buildMissionInclude(volunteerId) {
  return {
    location: true,
    rewardBadge: true,
    campaign: {
      select: {
        id: true,
        title: true,
        coverImage: true,
        attendancePoints: true,
        reportPoints: true,
        attendanceRadiusMeters: true,
      },
    },
    _count: {
      select: {
        volunteerTasks: {
          where: {
            status: {
              not: 'CANCELLED',
            },
          },
        },
      },
    },
    volunteerTasks: {
      where: {
        volunteerId,
      },
    },
    reports: {
      where: {
        volunteerId,
      },
      take: 1,
    },
  };
}

function buildMissionSteps(assignment, report) {
  const completionFlags = [
    Boolean(assignment) && assignment.status !== 'CANCELLED',
    Boolean(assignment) && FIELD_WORK_STATUSES.includes(assignment.status),
    Boolean(report),
  ];
  const definitions = [
    { key: 'joined', title: 'الانضمام للمهمة' },
    { key: 'fieldWork', title: 'تنفيذ المهام الميدانية' },
    { key: 'report', title: 'إرسال التقرير' },
  ];
  const currentIndex = completionFlags.findIndex((isDone) => !isDone);

  return definitions.map((definition, index) => ({
    key: definition.key,
    title: definition.title,
    completed: completionFlags[index],
    isCurrent: index === currentIndex,
  }));
}

function serializeMissionReport(report) {
  return {
    id: report.id,
    notes: report.notes,
    images: Array.isArray(report.images) ? report.images : [],
    rating: report.rating,
    pointsAwarded: report.pointsAwarded ?? 0,
    createdAt: report.createdAt?.toISOString() ?? null,
  };
}

function serializeMission(task) {
  const assignment = task.volunteerTasks?.[0] ?? null;
  const report = task.reports?.[0] ?? null;
  const durationHours = calculateTaskDurationHours(task);
  const attendancePoints = task.campaign?.attendancePoints ?? 0;
  const reportPoints = task.campaign?.reportPoints ?? 0;
  const badge = serializeBadge(task.rewardBadge);
  const steps = buildMissionSteps(assignment, report);
  const isCompleted = Boolean(report) || assignment?.status === 'COMPLETED';
  const isAssigned = Boolean(assignment) && assignment.status !== 'CANCELLED';

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    typeLabel: MISSION_TYPE_LABEL,
    coverImage: task.campaign?.coverImage ?? null,
    status: task.status,
    date: formatDateOnly(task.date),
    startTime: formatTimeOnly(task.startTime),
    endTime: formatTimeOnly(task.endTime),
    durationHours,
    location: serializeLocation(task.location),
    campaign: task.campaign
      ? {
          id: task.campaign.id,
          title: task.campaign.title,
        }
      : null,
    volunteersCount: task._count?.volunteerTasks ?? 0,
    attendance: {
      radiusMeters: getTaskAttendanceRadius(task),
    },
    reward: {
      hours: durationHours,
      points: {
        attendance: attendancePoints,
        report: reportPoints,
        total: attendancePoints + reportPoints,
      },
      badge,
    },
    steps,
    progress: {
      completedSteps: steps.filter((step) => step.completed).length,
      totalSteps: steps.length,
    },
    myAssignment: assignment
      ? {
          status: assignment.status,
          checkInTime: assignment.checkInTime?.toISOString() ?? null,
          checkOutTime: assignment.checkOutTime?.toISOString() ?? null,
          hoursWorked: assignment.hoursWorked,
          attendancePointsAwarded: assignment.attendancePointsAwarded ?? 0,
        }
      : null,
    report: report ? serializeMissionReport(report) : null,
    earned: isCompleted
      ? {
          hours: assignment?.hoursWorked ?? 0,
          points: (assignment?.attendancePointsAwarded ?? 0) + (report?.pointsAwarded ?? 0),
          badge,
        }
      : null,
    permissions: {
      isAssigned,
      canCheckIn: assignment ? ['ASSIGNED', 'CHECKED_OUT'].includes(assignment.status) : false,
      canSubmitReport:
        assignment && !report ? REPORTABLE_STATUSES.includes(assignment.status) : false,
      hasSubmittedReport: Boolean(report),
    },
  };
}

async function getMission(taskId, volunteerId) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const task = await prisma.task.findUnique({
    where: {
      id: parsedTaskId,
    },
    include: buildMissionInclude(volunteerId),
  });

  if (!task) {
    throw new AppError('المهمة غير موجودة', 404);
  }

  return {
    message: 'تم جلب تفاصيل المهمة بنجاح',
    mission: serializeMission(task),
  };
}

async function submitMissionReport(taskId, payload, volunteerId) {
  const parsedTaskId = parsePositiveInteger(taskId, 'معرف المهمة');
  const body = payload && typeof payload === 'object' ? payload : {};
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const images = Array.isArray(body.images) ? body.images : [];

  if (notes.length === 0 && images.length === 0) {
    throw new AppError('اكتب تقريرك أو أرفق صورة قبل الإرسال', 400);
  }

  if (notes.length > MAX_REPORT_NOTES_LENGTH) {
    throw new AppError(`التقرير يجب ألا يتجاوز ${MAX_REPORT_NOTES_LENGTH} حرف`, 400);
  }

  if (images.length > MAX_REPORT_IMAGES) {
    throw new AppError(`الحد الأقصى لعدد الصور هو ${MAX_REPORT_IMAGES}`, 400);
  }

  const reportResult = await createReport(
    {
      taskId: parsedTaskId,
      notes: notes || undefined,
      images,
      rating: body.rating,
    },
    volunteerId,
  );
  const missionResult = await getMission(parsedTaskId, volunteerId);

  return {
    message: 'تم إرسال التقرير وإنهاء المهمة بنجاح',
    summary: reportResult.summary,
    report: reportResult.report,
    mission: missionResult.mission,
  };
}

module.exports = {
  getMission,
  serializeMission,
  submitMissionReport,
};