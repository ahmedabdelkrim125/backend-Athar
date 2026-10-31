const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { syncVolunteerBadges } = require('./reward.service');
const { syncTaskStatusFromAssignments } = require('./task-assignment.service');
const {
  serializePagination,
  serializeVolunteerSummary,
} = require('../utils/serializers');
const { calculateTaskDurationHours } = require('../utils/task-metrics');
const {
  parsePositiveInteger,
  validateReportCreatePayload,
  validateReportListQuery,
  validateReportUpdatePayload,
} = require('../validators/resource.validators');

const volunteerSummarySelect = {
  id: true,
  fullName: true,
  nationalId: true,
  email: true,
  phone: true,
  avatarUrl: true,
  status: true,
};

const reportInclude = {
  volunteer: {
    select: volunteerSummarySelect,
  },
  task: {
    select: {
      id: true,
      title: true,
      date: true,
      status: true,
    },
  },
  campaign: {
    select: {
      id: true,
      title: true,
      status: true,
      createdById: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
    },
  },
};

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function serializeReport(report) {
  return {
    id: report.id,
    volunteerId: report.volunteerId,
    taskId: report.taskId,
    campaignId: report.campaignId,
    notes: report.notes,
    voiceNote: report.voiceNote,
    images: Array.isArray(report.images) ? report.images : [],
    rating: report.rating,
    pointsAwarded: report.pointsAwarded ?? 0,
    createdAt: report.createdAt?.toISOString() ?? null,
    volunteer: serializeVolunteerSummary(report.volunteer),
    task: report.task
      ? {
          id: report.task.id,
          title: report.task.title,
          date: formatDateOnly(report.task.date),
          status: report.task.status,
        }
      : null,
    campaign: report.campaign
      ? {
          id: report.campaign.id,
          title: report.campaign.title,
          status: report.campaign.status,
          createdById: report.campaign.createdById,
          startDate: formatDateOnly(report.campaign.startDate),
          endDate: formatDateOnly(report.campaign.endDate),
          startTime: report.campaign.startTime
            ? new Date(report.campaign.startTime).toISOString().slice(11, 19)
            : null,
          endTime: report.campaign.endTime
            ? new Date(report.campaign.endTime).toISOString().slice(11, 19)
            : null,
        }
      : null,
  };
}

function buildReportAccessWhere(volunteerId) {
  return {
    OR: [
      {
        volunteerId,
      },
      {
        campaign: {
          is: {
            createdById: volunteerId,
          },
        },
      },
    ],
  };
}

async function getReportOrThrow(reportId, volunteerId) {
  const report = await prisma.report.findFirst({
    where: {
      AND: [
        {
          id: reportId,
        },
        buildReportAccessWhere(volunteerId),
      ],
    },
    include: reportInclude,
  });

  if (!report) {
    throw new AppError('التقرير غير موجود أو لا تملك صلاحية الوصول إليه', 404);
  }

  return report;
}

async function listReports(query, volunteerId) {
  const filters = validateReportListQuery(query);
  const where = {
    AND: [buildReportAccessWhere(volunteerId)],
  };

  if (filters.mine || query.mine === 'true') {
    where.AND.push({
      volunteerId,
    });
  }

  if (filters.volunteerId) {
    where.AND.push({
      volunteerId: filters.volunteerId,
    });
  }

  if (filters.campaignId) {
    where.AND.push({
      campaignId: filters.campaignId,
    });
  }

  if (filters.taskId) {
    where.AND.push({
      taskId: filters.taskId,
    });
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: reportInclude,
      orderBy: {
        createdAt: 'desc',
      },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.report.count({ where }),
  ]);

  return {
    message: 'تم جلب التقارير بنجاح',
    pagination: serializePagination(filters.page, filters.limit, total),
    reports: reports.map(serializeReport),
  };
}

async function getReportById(reportId, volunteerId) {
  const parsedReportId = parsePositiveInteger(reportId, 'معرف التقرير');
  const report = await getReportOrThrow(parsedReportId, volunteerId);

  return {
    message: 'تم جلب بيانات التقرير بنجاح',
    report: serializeReport(report),
  };
}

async function createReport(payload, volunteerId) {
  const validatedPayload = validateReportCreatePayload(payload);
  const existingReport = await prisma.report.findFirst({
    where: {
      volunteerId,
      taskId: validatedPayload.taskId,
    },
    select: {
      id: true,
    },
  });

  if (existingReport) {
    throw new AppError('تم إرسال تقرير لهذه المهمة من قبل', 409);
  }

  const task = await prisma.task.findUnique({
    where: {
      id: validatedPayload.taskId,
    },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          status: true,
          createdById: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          reportPoints: true,
        },
      },
      volunteerTasks: {
        where: {
          volunteerId,
        },
      },
    },
  });

  if (!task) {
    throw new AppError('المهمة غير موجودة', 404);
  }

  if (validatedPayload.campaignId && validatedPayload.campaignId !== task.campaignId) {
    throw new AppError('الحملة المرسلة لا تطابق الحملة المرتبطة بالمهمة', 400);
  }

  const isAssignedVolunteer = task.volunteerTasks.length > 0;
  const isCampaignOwner = task.campaign.createdById === volunteerId;

  if (!isAssignedVolunteer && !isCampaignOwner) {
    throw new AppError('يجب أن تكون مسندًا لهذه المهمة أو منشئ الحملة لإنشاء تقرير', 403);
  }

  const assignment = task.volunteerTasks?.[0] || null;
  const pointsAwarded = task.campaign.reportPoints || 0;

  if (assignment && assignment.status === 'CANCELLED') {
    throw new AppError('لا يمكن إرسال تقرير لمهمة تم إلغاؤها لك', 400);
  }

  const result = await prisma.$transaction(async (transactionClient) => {
    const report = await transactionClient.report.create({
      data: {
        volunteerId,
        taskId: task.id,
        campaignId: task.campaignId,
        notes: validatedPayload.notes,
        voiceNote: validatedPayload.voiceNote,
        images: validatedPayload.images || [],
        rating: validatedPayload.rating,
        pointsAwarded,
      },
      include: reportInclude,
    });

    let hoursAdded = 0;

    if (assignment) {
      const plannedHours = assignment.hoursWorked || calculateTaskDurationHours(task);
      hoursAdded = Math.max(0, plannedHours - assignment.hoursWorked);

      await transactionClient.volunteerTask.update({
        where: {
          volunteerId_taskId: {
            volunteerId,
            taskId: task.id,
          },
        },
        data: {
          status: 'COMPLETED',
          checkOutTime: assignment.checkOutTime || new Date(),
          hoursWorked: assignment.hoursWorked || plannedHours,
        },
      });

      await syncTaskStatusFromAssignments(transactionClient, task.id);

      const volunteer = await transactionClient.volunteer.update({
        where: {
          id: volunteerId,
        },
        data: {
          points: {
            increment: pointsAwarded,
          },
          totalHours: {
            increment: hoursAdded,
          },
        },
        select: {
          points: true,
          totalHours: true,
        },
      });

      const newlyAwardedBadges = await syncVolunteerBadges(
        transactionClient,
        volunteerId,
      );

      return {
        report,
        hoursAdded,
        volunteer,
        newlyAwardedBadges,
      };
    }

    const volunteer = await transactionClient.volunteer.update({
      where: {
        id: volunteerId,
      },
      data: {
        points: {
          increment: pointsAwarded,
        },
      },
      select: {
        points: true,
        totalHours: true,
      },
    });

    const newlyAwardedBadges = await syncVolunteerBadges(
      transactionClient,
      volunteerId,
    );

    return {
      report,
      hoursAdded,
      volunteer,
      newlyAwardedBadges,
    };
  });

  return {
    message: 'تم إنشاء التقرير بنجاح',
    report: serializeReport(result.report),
    summary: {
      pointsAwarded,
      hoursAdded: result.hoursAdded,
      totalPoints: result.volunteer.points,
      totalHours: result.volunteer.totalHours,
      newlyAwardedBadges: result.newlyAwardedBadges,
    },
  };
}

async function updateReport(reportId, payload, volunteerId) {
  const parsedReportId = parsePositiveInteger(reportId, 'معرف التقرير');
  const validatedPayload = validateReportUpdatePayload(payload);
  const existingReport = await prisma.report.findUnique({
    where: {
      id: parsedReportId,
    },
  });

  if (!existingReport) {
    throw new AppError('التقرير غير موجود', 404);
  }

  if (existingReport.volunteerId !== volunteerId) {
    throw new AppError('غير مسموح لك بتحديث هذا التقرير', 403);
  }

  const report = await prisma.report.update({
    where: {
      id: parsedReportId,
    },
    data: validatedPayload,
    include: reportInclude,
  });

  return {
    message: 'تم تحديث التقرير بنجاح',
    report: serializeReport(report),
  };
}

module.exports = {
  createReport,
  getReportById,
  listReports,
  updateReport,
};
