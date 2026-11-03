const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { awardBadgeById, syncVolunteerBadges } = require('./reward.service');
const { syncTaskStatusFromAssignments } = require('./task-assignment.service');
const notificationService = require('./notification.service');
const {
  serializePagination,
  serializeVolunteerSummary,
} = require('../utils/serializers');
const { calculateTaskDurationHours } = require('../utils/task-metrics');
const { hasPermission } = require('../middleware/rbac.middleware');
const { writeAuditLog } = require('./audit.service');
const { validateReportDecisionPayload } = require('../validators/report-review.validators');
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
const REPORTABLE_ASSIGNMENT_STATUSES = ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'];

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
    approvalStatus: report.approvalStatus,
    rejectionReason: report.rejectionReason,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
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
  if (volunteerId.accountType === 'ADMIN') {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: reportInclude,
    });
    if (!report) throw new AppError('التقرير غير موجود', 404);
    return report;
  }
  const volunteerIdValue = typeof volunteerId === 'object' ? volunteerId.id : volunteerId;
  const report = await prisma.report.findFirst({
    where: {
      AND: [
        {
          id: reportId,
        },
        buildReportAccessWhere(volunteerIdValue),
      ],
    },
    include: reportInclude,
  });

  if (!report) {
    throw new AppError('التقرير غير موجود أو لا تملك صلاحية الوصول إليه', 404);
  }

  return report;
}

async function listReports(query, actor) {
  const filters = validateReportListQuery(query);
  const admin = actor?.accountType === 'ADMIN';
  const volunteerId = typeof actor === 'object' ? actor.id : actor;
  const where = admin ? {} : { AND: [buildReportAccessWhere(volunteerId)] };

  if (!admin && (filters.mine || query.mine === 'true')) {
    const ownReports = {
      volunteerId,
    };
    if (admin) Object.assign(where, ownReports);
    else where.AND.push(ownReports);
  }

  if (filters.volunteerId) {
    const selectedVolunteer = {
      volunteerId: filters.volunteerId,
    };
    if (admin) Object.assign(where, selectedVolunteer);
    else where.AND.push(selectedVolunteer);
  }

  if (filters.campaignId) {
    const selectedCampaign = {
      campaignId: filters.campaignId,
    };
    if (admin) Object.assign(where, selectedCampaign);
    else where.AND.push(selectedCampaign);
  }

  if (filters.taskId) {
    const selectedTask = {
      taskId: filters.taskId,
    };
    if (admin) Object.assign(where, selectedTask);
    else where.AND.push(selectedTask);
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

async function listPendingReviewReports(query, reviewer) {
  const filters = validateReportListQuery(query);
  const where = {
    approvalStatus: 'PENDING_REVIEW',
  };
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.taskId) where.taskId = filters.taskId;
  if (filters.volunteerId) where.volunteerId = filters.volunteerId;
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: reportInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.report.count({ where }),
  ]);
  return {
    message: 'تم جلب التقارير بانتظار المراجعة',
    pagination: serializePagination(filters.page, filters.limit, total),
    reports: reports.map(serializeReport),
  };
}

async function getReportById(reportId, actor) {
  const parsedReportId = parsePositiveInteger(reportId, 'معرف التقرير');
  const report = await getReportOrThrow(parsedReportId, actor);

  return {
    message: 'تم جلب بيانات التقرير بنجاح',
    report: serializeReport(report),
  };
}

async function getReviewHistory(reportId, reviewer) {
  const parsedReportId = parsePositiveInteger(reportId, 'معرف التقرير');
  const report = await prisma.report.findUnique({
    where: { id: parsedReportId },
    select: {
      id: true,
      campaign: { select: { createdById: true } },
    },
  });
  if (!report) throw new AppError('التقرير غير موجود', 404);
  if (!hasPermission(reviewer, 'reports:read') && report.campaign.createdById !== reviewer.id) {
    throw new AppError('غير مسموح لك بمراجعة هذا التقرير', 403);
  }
  const history = await prisma.reportReviewAudit.findMany({
    where: { reportId: parsedReportId },
    include: {
      reviewer: { select: { id: true, fullName: true } },
      reviewerAdmin: { select: { id: true, fullName: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return {
    reportId: parsedReportId,
    history: history.map((entry) => ({
      id: entry.id,
      action: entry.action,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
      reviewer: entry.reviewerAdmin
        ? { id: entry.reviewerAdmin.id, fullName: entry.reviewerAdmin.fullName, role: 'ADMIN' }
        : entry.reviewer
          ? { id: entry.reviewer.id, fullName: entry.reviewer.fullName, role: 'VOLUNTEER' }
          : null,
    })),
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
      missionJoinRequests: {
        where: { volunteerId },
        select: { status: true },
      },
    },
  });

  if (!task) {
    throw new AppError('المهمة غير موجودة', 404);
  }

  if (validatedPayload.campaignId && validatedPayload.campaignId !== task.campaignId) {
    throw new AppError('الحملة المرسلة لا تطابق الحملة المرتبطة بالمهمة', 400);
  }

  if (task.approvalStatus !== 'APPROVED') {
    throw new AppError('لا يمكن إرسال تقرير قبل اعتماد المهمة', 409);
  }
  if (task.campaign.createdById === volunteerId) {
    throw new AppError('منشئ الحملة لا يمكنه تقديم تقرير لهذه المهمة', 403);
  }

  const assignment = task.volunteerTasks?.[0] || null;
  if (!assignment || task.missionJoinRequests?.[0]?.status !== 'APPROVED') {
    throw new AppError('يجب قبول طلب انضمامك للمهمة قبل إرسال التقرير', 403);
  }
  if (!REPORTABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    throw new AppError('يجب تسجيل الحضور في المهمة قبل إرسال التقرير', 400);
  }

  let result;

  try {
    result = await prisma.$transaction(async (transactionClient) => {
      const report = await transactionClient.report.create({
        data: {
          volunteerId,
          taskId: task.id,
          campaignId: task.campaignId,
          notes: validatedPayload.notes,
          voiceNote: validatedPayload.voiceNote,
          images: validatedPayload.images || [],
          rating: validatedPayload.rating,
          approvalStatus: 'PENDING_REVIEW',
          pointsAwarded: 0,
        },
        include: reportInclude,
      });

      const volunteer = await transactionClient.volunteer.findUnique({
        where: {
          id: volunteerId,
        },
        select: {
          id: true,
          points: true,
          totalHours: true,
        },
      });
      const admins = await transactionClient.admin.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const notifications = [];
      for (const admin of admins) {
        const notification = await notificationService.createInAppNotification(
          {
            adminId: admin.id,
            title: 'تقرير جديد بانتظار المراجعة',
            body: `أرسل متطوع تقريرًا لمهمة "${task.title}" ويحتاج إلى مراجعة.`,
            type: notificationService.NOTIFICATION_TYPES.REPORT_SUBMITTED,
            eventKey: `report-submitted:${report.id}:${report.updatedAt.toISOString()}`,
            data: {
              taskId: task.id,
              reportId: report.id,
              deepLink: `athar://reports/${report.id}`,
            },
          },
          transactionClient,
        );
        if (notification) notifications.push(notification);
      }
      return {
        report,
        volunteer,
        notifications,
      };
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError('تم إرسال تقرير لهذه المهمة من قبل', 409);
    }

    throw error;
  }

  for (const notification of result.notifications) {
    await notificationService.sendNotificationPush(notification);
  }

  return {
    message: 'تم إرسال التقرير للمراجعة',
    report: serializeReport(result.report),
    summary: {
      approvalStatus: 'PENDING_REVIEW',
      pointsAwarded: 0,
      hoursAdded: 0,
      totalPoints: result.volunteer.points,
      totalHours: result.volunteer.totalHours,
      newlyAwardedBadges: [],
    },
  };
}

async function reviewReport(reportId, status, payload, reviewer) {
  const parsedReportId = parsePositiveInteger(reportId, 'معرف التقرير');
  const { reason } = validateReportDecisionPayload(status, payload);
  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM reports WHERE id = ${parsedReportId} FOR UPDATE`;
    const report = await transactionClient.report.findUnique({
      where: { id: parsedReportId },
      include: {
        campaign: {
          select: { createdById: true, reportPoints: true },
        },
        task: {
          select: {
            id: true,
            title: true,
            date: true,
            startTime: true,
            endTime: true,
            durationHours: true,
            rewardBadgeId: true,
          },
        },
      },
    });
    if (!report) throw new AppError('التقرير غير موجود', 404);
    if (reviewer.accountType !== 'ADMIN' && report.volunteerId === reviewer.id) {
      throw new AppError('لا يمكنك مراجعة تقريرك الشخصي', 403);
    }
    if (!hasPermission(reviewer, 'reports:read') && report.campaign.createdById !== reviewer.id) {
      throw new AppError('غير مسموح لك بمراجعة هذا التقرير', 403);
    }
    if (report.approvalStatus !== 'PENDING_REVIEW') {
      throw new AppError('تمت مراجعة التقرير مسبقًا', 409);
    }

    await transactionClient.$queryRaw`SELECT id FROM tasks WHERE id = ${report.taskId} FOR UPDATE`;
    const assignment = await transactionClient.volunteerTask.findUnique({
      where: {
        volunteerId_taskId: {
          volunteerId: report.volunteerId,
          taskId: report.taskId,
        },
      },
    });
    let pointsAwarded = 0;
    let hoursAdded = 0;
    let volunteer;
    let newlyAwardedBadges = [];

    if (status === 'APPROVED') {
      if (assignment?.status === 'CANCELLED') {
        throw new AppError('لا يمكن قبول تقرير لمهمة ملغاة للمتطوع', 409);
      }
      pointsAwarded = report.campaign.reportPoints || 0;
      if (assignment) {
        const plannedHours = assignment.hoursWorked || calculateTaskDurationHours(report.task);
        hoursAdded = Math.max(0, plannedHours - assignment.hoursWorked);
        await transactionClient.volunteerTask.update({
          where: {
            volunteerId_taskId: {
              volunteerId: report.volunteerId,
              taskId: report.taskId,
            },
          },
          data: {
            status: 'COMPLETED',
            checkOutTime: assignment.checkOutTime || new Date(),
            hoursWorked: assignment.hoursWorked || plannedHours,
          },
        });
        await syncTaskStatusFromAssignments(transactionClient, report.taskId);
        const missionBadge = await awardBadgeById(
          transactionClient,
          report.volunteerId,
          report.task.rewardBadgeId,
        );
        newlyAwardedBadges = missionBadge ? [missionBadge] : [];
      }
      volunteer = await transactionClient.volunteer.update({
        where: { id: report.volunteerId },
        data: {
          points: { increment: pointsAwarded },
          totalHours: { increment: hoursAdded },
        },
        select: { points: true, totalHours: true },
      });
      const pointsBadges = await syncVolunteerBadges(
        transactionClient,
        report.volunteerId,
      );
      newlyAwardedBadges = [...newlyAwardedBadges, ...pointsBadges];
    }

    const reviewedAt = new Date();
    const updatedReport = await transactionClient.report.update({
      where: { id: parsedReportId },
      data: {
        approvalStatus: status,
        rejectionReason: reason,
        pointsAwarded,
        reviewedById: reviewer.accountType === 'ADMIN' ? null : reviewer.id,
        reviewedByAdminId: reviewer.accountType === 'ADMIN' ? reviewer.id : null,
        reviewedAt,
      },
      include: reportInclude,
    });
    await transactionClient.reportReviewAudit.create({
      data: {
        reportId: parsedReportId,
        reviewerId: reviewer.accountType === 'ADMIN' ? null : reviewer.id,
        reviewerAdminId: reviewer.accountType === 'ADMIN' ? reviewer.id : null,
        action: status,
        reason,
      },
    });
    await writeAuditLog(
      {
        adminId: reviewer.id,
        action: `REPORT_${status}`,
        targetType: 'REPORT',
        targetId: parsedReportId,
        reason,
        data: { volunteerId: report.volunteerId, taskId: report.taskId },
      },
      transactionClient,
    );
    const notification = await notificationService.createInAppNotification(
      {
        userId: report.volunteerId,
        title: status === 'APPROVED' ? 'تم قبول تقريرك' : 'تم رفض تقريرك',
        body:
          status === 'APPROVED'
            ? 'تم اعتماد التقرير واحتساب نقاطه وساعاته.'
            : `يرجى تعديل التقرير وإعادة إرساله. السبب: ${reason}`,
        type:
          status === 'APPROVED'
            ? notificationService.NOTIFICATION_TYPES.REPORT_APPROVED
            : notificationService.NOTIFICATION_TYPES.REPORT_REJECTED,
        eventKey: `report-${status.toLowerCase()}:${report.id}:${reviewedAt.toISOString()}`,
        data: {
          reportId: report.id,
          taskId: report.taskId,
          status,
          deepLink: `athar://reports/${report.id}`,
        },
      },
      transactionClient,
    );
    return {
      report: updatedReport,
      pointsAwarded,
      hoursAdded,
      volunteer,
      newlyAwardedBadges,
      notification,
    };
  });

  await notificationService.sendNotificationPush(result.notification);

  return {
    message: status === 'APPROVED' ? 'تم قبول التقرير واحتساب الإنجازات' : 'تم رفض التقرير وإرسال سبب الرفض',
    report: serializeReport(result.report),
    summary: {
      pointsAwarded: result.pointsAwarded,
      hoursAdded: result.hoursAdded,
      totalPoints: result.volunteer?.points ?? null,
      totalHours: result.volunteer?.totalHours ?? null,
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

  if (existingReport.approvalStatus !== 'REJECTED') {
    throw new AppError('يمكن تعديل التقرير وإعادة إرساله بعد رفضه فقط', 409);
  }

  const result = await prisma.$transaction(async (transactionClient) => {
    await transactionClient.$queryRaw`SELECT id FROM reports WHERE id = ${parsedReportId} FOR UPDATE`;
    const currentReport = await transactionClient.report.findUnique({
      where: { id: parsedReportId },
      select: { approvalStatus: true, volunteerId: true },
    });
    if (
      !currentReport ||
      currentReport.volunteerId !== volunteerId ||
      currentReport.approvalStatus !== 'REJECTED'
    ) {
      throw new AppError('لم يعد التقرير متاحًا للتعديل', 409);
    }
    const report = await transactionClient.report.update({
      where: { id: parsedReportId },
      data: {
        ...validatedPayload,
        approvalStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        reviewedById: null,
        reviewedAt: null,
      },
      include: reportInclude,
    });
    const admins = await transactionClient.admin.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const notifications = [];
    for (const admin of admins) {
      const notification = await notificationService.createInAppNotification(
        {
          adminId: admin.id,
          title: 'أُعيد إرسال تقرير للمراجعة',
          body: `أعاد المتطوع إرسال تقرير مهمة "${report.task.title}" بعد تعديله.`,
          type: notificationService.NOTIFICATION_TYPES.REPORT_SUBMITTED,
          eventKey: `report-submitted:${report.id}:${report.updatedAt.toISOString()}`,
          data: {
            reportId: report.id,
            taskId: report.taskId,
            deepLink: `athar://reports/${report.id}`,
          },
        },
        transactionClient,
      );
      if (notification) notifications.push(notification);
    }
    return { report, notifications };
  });

  for (const notification of result.notifications) {
    await notificationService.sendNotificationPush(notification);
  }

  return {
    message: 'تم تعديل التقرير وإرساله للمراجعة',
    report: serializeReport(result.report),
  };
}

module.exports = {
  createReport,
  getReportById,
  getReviewHistory,
  listReports,
  listPendingReviewReports,
  reviewReport,
  updateReport,
};