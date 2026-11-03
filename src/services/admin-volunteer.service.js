const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  buildAchievementCatalog,
  buildAvatarUrl,
  buildCertificates,
  collectVolunteerMetrics,
} = require('../utils/profile-helpers');
const { resolveVolunteerTitle } = require('../utils/volunteer-titles');
const { listVolunteerTitles } = require('./volunteer-title.service');
const {
  validateAdminVolunteerQuery,
} = require('../validators/emergency.validators');
const { writeAuditLog } = require('./audit.service');

function buildDashboardWhere(filters) {
  const clauses = [];
  if (filters.search) {
    const search = `%${filters.search}%`;
    clauses.push(
      Prisma.sql`(v.full_name LIKE ${search} OR v.phone LIKE ${search} OR v.email LIKE ${search})`,
    );
  }
  if (filters.status) clauses.push(Prisma.sql`v.status = ${filters.status}`);
  if (filters.activity === 'ACTIVE') {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM volunteer_tasks active_vt
      INNER JOIN tasks active_t ON active_t.id = active_vt.task_id
      WHERE active_vt.volunteer_id = v.id
        AND active_vt.status IN ('ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT')
        AND active_t.status NOT IN ('CANCELLED', 'COMPLETED')
    )`);
  } else if (filters.activity === 'INACTIVE') {
    clauses.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM volunteer_tasks active_vt
      INNER JOIN tasks active_t ON active_t.id = active_vt.task_id
      WHERE active_vt.volunteer_id = v.id
        AND active_vt.status IN ('ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT')
        AND active_t.status NOT IN ('CANCELLED', 'COMPLETED')
    )`);
  }
  return clauses.length ? Prisma.join(clauses, ' AND ') : Prisma.sql`1 = 1`;
}

function buildTitleLevelExpression(titles) {
  const branches = [...titles]
    .sort((left, right) => right.level - left.level)
    .map(
      (title) => Prisma.sql`WHEN v.points >= ${title.minPoints}
        AND v.total_hours >= ${title.minHours}
        AND (SELECT COUNT(*) FROM volunteer_tasks completed_vt
          WHERE completed_vt.volunteer_id = v.id AND completed_vt.status = 'COMPLETED')
          >= ${title.minCompletedTasks}
        AND (SELECT COUNT(*) FROM reports approved_r
          WHERE approved_r.volunteer_id = v.id AND approved_r.approval_status = 'APPROVED')
          >= ${title.minReports}
        THEN ${title.level}`,
    );
  return Prisma.sql`CASE ${Prisma.join(branches, ' ')} ELSE ${titles[0].level} END`;
}

function toVolunteerDashboardRow(row, titles) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    email: row.email,
    phone: row.phone,
    status: row.status,
    role: 'VOLUNTEER',
    joinDate: row.join_date.toISOString(),
    totalHours: Number(row.total_hours),
    points: Number(row.points),
    completedCampaigns: Number(row.completed_campaigns),
    completedTasks: Number(row.completed_tasks),
    approvedReports: Number(row.approved_reports),
    submittedReports: Number(row.submitted_reports),
    activeTasks: Number(row.active_tasks),
    volunteerTitle: resolveVolunteerTitle(
      {
        points: Number(row.points),
        totalHours: Number(row.total_hours),
        completedTasksCount: Number(row.completed_tasks),
        reportsCount: Number(row.approved_reports),
      },
      titles,
    ),
  };
}

async function listVolunteers(query = {}) {
  const filters = validateAdminVolunteerQuery(query);
  const titles = await listVolunteerTitles();
  const whereSql = buildDashboardWhere(filters);
  const titleExpression = buildTitleLevelExpression(titles);
  const levelCondition =
    filters.titleLevel === undefined
      ? Prisma.sql`1 = 1`
      : Prisma.sql`dashboard.title_level = ${filters.titleLevel}`;
  const base = Prisma.sql`
    SELECT
      v.id, v.full_name, v.avatar_url, v.email, v.phone, v.status, v.role, v.national_id,
      v.join_date, v.total_hours, v.points,
      ${titleExpression} AS title_level,
      (SELECT COUNT(DISTINCT completed_t.campaign_id)
        FROM volunteer_tasks completed_vt
        INNER JOIN tasks completed_t ON completed_t.id = completed_vt.task_id
        WHERE completed_vt.volunteer_id = v.id AND completed_vt.status = 'COMPLETED')
        AS completed_campaigns,
      (SELECT COUNT(*) FROM volunteer_tasks completed_vt
        WHERE completed_vt.volunteer_id = v.id AND completed_vt.status = 'COMPLETED')
        AS completed_tasks,
      (SELECT COUNT(*) FROM reports approved_r
        WHERE approved_r.volunteer_id = v.id AND approved_r.approval_status = 'APPROVED')
        AS approved_reports,
      (SELECT COUNT(*) FROM reports submitted_r
        WHERE submitted_r.volunteer_id = v.id)
        AS submitted_reports,
      (SELECT COUNT(*) FROM volunteer_tasks active_vt
        INNER JOIN tasks active_t ON active_t.id = active_vt.task_id
        WHERE active_vt.volunteer_id = v.id
          AND active_vt.status IN ('ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT')
          AND active_t.status NOT IN ('CANCELLED', 'COMPLETED'))
        AS active_tasks
    FROM volunteers v
    WHERE ${whereSql}
  `;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT dashboard.* FROM (${base}) dashboard
      WHERE ${levelCondition}
      ORDER BY dashboard.join_date DESC, dashboard.id DESC
      LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS total FROM (${base}) dashboard
      WHERE ${levelCondition}
    `),
  ]);
  const total = Number(countRows[0]?.total || 0);
  return {
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
    volunteers: rows.map((row) => toVolunteerDashboardRow(row, titles)),
  };
}

async function getVolunteerDetails(volunteerId, actor) {
  const id = Number(volunteerId);
  if (!Number.isInteger(id) || id < 1) throw new AppError('معرف المتطوع غير صالح', 400);
  const volunteer = await prisma.volunteer.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      avatarUrl: true,
      email: true,
      phone: true,
      status: true,
      role: true,
      joinDate: true,
      city: true,
      totalHours: true,
      points: true,
      locationSharingEnabled: true,
      reports: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          task: { select: { id: true, title: true, date: true } },
          campaign: { select: { id: true, title: true } },
          reviewAudits: {
            orderBy: { createdAt: 'asc' },
            select: { action: true, reason: true, createdAt: true },
          },
        },
      },
      assignedTasks: {
        orderBy: [{ task: { date: 'desc' } }, { id: 'desc' }],
        include: {
          task: {
            select: {
              id: true,
              title: true,
              date: true,
              campaignId: true,
              approvalStatus: true,
              location: { select: { name: true } },
              campaign: { select: { id: true, title: true } },
            },
          },
        },
      },
      missionJoinRequests: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          task: {
            select: { id: true, title: true, campaign: { select: { id: true, title: true } } },
          },
        },
      },
      volunteerBadges: {
        orderBy: { awardedAt: 'desc' },
        include: { badge: true },
      },
      ratingsReceived: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, rating: true, feedback: true, createdAt: true, campaignId: true },
      },
    },
  });
  if (!volunteer) throw new AppError('المتطوع غير موجود', 404);
  const titles = await listVolunteerTitles();
  const metrics = collectVolunteerMetrics(volunteer, { period: 'all' });
  const achievements = buildAchievementCatalog(metrics);
  const certificates = buildCertificates(metrics, achievements, volunteer);
  await writeAuditLog({
    adminId: actor.id,
    action: 'VOLUNTEER_PROFILE_VIEWED',
    targetType: 'VOLUNTEER',
    targetId: id,
  });

  return {
    volunteer: {
      id: volunteer.id,
      fullName: volunteer.fullName,
      avatarUrl: volunteer.avatarUrl || buildAvatarUrl(volunteer),
      email: volunteer.email,
      phone: volunteer.phone,
      status: volunteer.status,
      role: 'VOLUNTEER',
      city: volunteer.city,
      joinDate: volunteer.joinDate.toISOString(),
      totalHours: volunteer.totalHours,
      points: volunteer.points,
      volunteerTitle: resolveVolunteerTitle(
        { ...metrics, points: volunteer.points },
        titles,
      ),
      stats: {
        completedCampaigns: metrics.completedCampaigns,
        completedTasks: metrics.completedTasksCount,
        approvedReports: metrics.reportsCount,
      },
      achievements: achievements.filter((item) => item.unlocked),
      certificates,
      badges: volunteer.volunteerBadges.map((item) => ({
        ...item.badge,
        awardedAt: item.awardedAt.toISOString(),
      })),
      currentAndPastTasks: volunteer.assignedTasks.map((item) => ({
        id: item.task.id,
        title: item.task.title,
        date: item.task.date.toISOString().slice(0, 10),
        campaign: item.task.campaign,
        locationName: item.task.location.name,
        status: item.status,
        checkInAt: item.checkInTime?.toISOString() ?? null,
        checkOutAt: item.checkOutTime?.toISOString() ?? null,
        hoursWorked: item.hoursWorked,
        checkInCoordinates:
          item.checkInLatitude === null
            ? null
            : {
                latitude: Number(item.checkInLatitude),
                longitude: Number(item.checkInLongitude),
              },
      })),
      joinRequests: volunteer.missionJoinRequests.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        decidedAt: item.decidedAt?.toISOString() ?? null,
        rejectionReason: item.rejectionReason,
        task: item.task,
      })),
      reports: volunteer.reports.map((item) => ({
        id: item.id,
        status: item.approvalStatus,
        pointsAwarded: item.pointsAwarded,
        rejectionReason: item.rejectionReason,
        notes: item.notes,
        images: Array.isArray(item.images) ? item.images : [],
        createdAt: item.createdAt.toISOString(),
        task: item.task,
        campaign: item.campaign,
        reviews: item.reviewAudits.map((review) => ({
          action: review.action,
          reason: review.reason,
          createdAt: review.createdAt.toISOString(),
        })),
      })),
      ratings: volunteer.ratingsReceived.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    },
  };
}

module.exports = {
  getVolunteerDetails,
  listVolunteers,
};
