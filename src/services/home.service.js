const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { serializeVolunteerSummary, serializeLocation } = require('../utils/serializers');
const { serializeAnnouncement } = require('./announcement.service');
const nearbyMissionService = require('./nearby-mission.service');
const { parseCoordinatesQuery } = require('../validators/resource.validators');

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  return value ? new Date(value).toISOString().slice(11, 19) : null;
}

function serializeHomeTask(task) {
  const assignment = task.volunteerTasks?.[0] || null;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    date: formatDateOnly(task.date),
    startTime: formatTimeOnly(task.startTime),
    endTime: formatTimeOnly(task.endTime),
    status: task.status,
    location: serializeLocation(task.location),
    campaign: task.campaign
      ? {
          id: task.campaign.id,
          title: task.campaign.title,
          coverImage: task.campaign.coverImage,
          startDate: formatDateOnly(task.campaign.startDate),
          endDate: formatDateOnly(task.campaign.endDate),
          startTime: formatTimeOnly(task.campaign.startTime),
          endTime: formatTimeOnly(task.campaign.endTime),
        }
      : null,
    assignment: assignment
      ? {
          status: assignment.status,
          checkInTime: assignment.checkInTime?.toISOString() ?? null,
        }
      : null,
  };
}

async function getHomeSummary(volunteerId, query = {}) {
  const volunteer = await prisma.volunteer.findUnique({
    where: {
      id: volunteerId,
    },
    include: {
      _count: {
        select: {
          assignedTasks: true,
          volunteerBadges: true,
          reports: true,
        },
      },
    },
  });

  if (!volunteer) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  const todayDateString = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(`${todayDateString}T00:00:00.000Z`);

  const coordinates = parseCoordinatesQuery(query);
  const [announcements, upcomingTasks, nearbyResult] = await Promise.all([
    prisma.announcement.findMany({
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 3,
    }),
    prisma.task.findMany({
      where: {
        approvalStatus: 'APPROVED',
        date: {
          gte: todayDate,
        },
        campaign: {
          status: { in: ['PUBLISHED', 'ACTIVE'] },
        },
        volunteerTasks: {
          some: {
            volunteerId,
          },
        },
      },
      include: {
        location: true,
        campaign: {
          select: {
            id: true,
            title: true,
            coverImage: true,
            startDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
          },
        },
        volunteerTasks: {
          where: {
            volunteerId,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' },
        { id: 'asc' },
      ],
      take: 5,
    }),
    coordinates
      ? nearbyMissionService.getNearbyMissions(
          {
            ...coordinates,
            radiusMeters: query.radiusMeters,
            accuracyMeters: query.accuracyMeters,
            page: 1,
            limit: 5,
          },
          volunteerId,
        )
      : Promise.resolve(null),
  ]);

  const todayTasks = upcomingTasks.filter(
    (task) => formatDateOnly(task.date) === todayDateString,
  );

  return {
    message: 'تم جلب بيانات الصفحة الرئيسية بنجاح',
    summary: {
      volunteer: {
        ...serializeVolunteerSummary(volunteer),
        totalHours: volunteer.totalHours,
        points: volunteer.points,
      },
      stats: {
        totalHours: volunteer.totalHours,
        points: volunteer.points,
        badges: volunteer._count?.volunteerBadges ?? 0,
        assignedTasks: volunteer._count?.assignedTasks ?? 0,
        reports: volunteer._count?.reports ?? 0,
        todayTasks: todayTasks.length,
      },
      announcements: announcements.map(serializeAnnouncement),
      todayTasks: todayTasks.map(serializeHomeTask),
      upcomingTasks: upcomingTasks.map(serializeHomeTask),
      nearbyMissions: nearbyResult
        ? {
            pagination: nearbyResult.pagination,
            missions: nearbyResult.missions,
          }
        : null,
    },
  };
}

module.exports = {
  getHomeSummary,
};
