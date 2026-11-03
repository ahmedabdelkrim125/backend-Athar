const prisma = require('../lib/prisma');
const { serializePagination } = require('../utils/serializers');
const {
  buildNearbyBounds,
  calculateHaversineDistanceMeters,
  sortAndPaginateNearbyMissions,
} = require('../utils/nearby-missions');
const { validateNearbyMissionsQuery } = require('../validators/mission.validators');
const volunteerLocationService = require('./volunteer-location.service');

function formatDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  return value ? new Date(value).toISOString().slice(11, 19) : null;
}

function buildLocationFilter(bounds) {
  if (bounds.longitude === null) {
    return {
      latitude: { gte: bounds.minLatitude, lte: bounds.maxLatitude },
    };
  }
  const longitudeFilter = bounds.longitude || {
    gte: bounds.minLongitude,
    lte: bounds.maxLongitude,
  };
  if (bounds.longitude?.OR) {
    return {
      latitude: { gte: bounds.minLatitude, lte: bounds.maxLatitude },
      OR: bounds.longitude.OR.map((longitude) => ({ longitude })),
    };
  }
  return {
    latitude: { gte: bounds.minLatitude, lte: bounds.maxLatitude },
    longitude: longitudeFilter,
  };
}

function isExpiredToday(task, now) {
  if (formatDateOnly(task.date) !== now.toISOString().slice(0, 10) || !task.endTime) {
    return false;
  }
  const endTime = new Date(task.endTime);
  const endMinutes = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return endMinutes < currentMinutes;
}

function serializeNearbyMission(task, distanceMeters) {
  const assignedCount = task._count.volunteerTasks;
  const pendingCount = task._count.missionJoinRequests;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    latitude: Number(task.location.latitude),
    longitude: Number(task.location.longitude),
    locationName: task.location.name,
    date: formatDateOnly(task.date),
    startTime: formatTimeOnly(task.startTime),
    endTime: formatTimeOnly(task.endTime),
    distanceMeters,
    attendanceRadiusMeters: task.attendanceRadiusMeters ?? task.campaign.attendanceRadiusMeters,
    requiredVolunteers: task.requiredVolunteers,
    availableSlots:
      task.requiredVolunteers === null
        ? null
        : Math.max(0, task.requiredVolunteers - assignedCount - pendingCount),
    userJoinStatus: task.missionJoinRequestsForUser[0]?.status ?? null,
  };
}

async function getNearbyMissions(query, volunteerId, now = new Date()) {
  const filters = validateNearbyMissionsQuery(query);
  await volunteerLocationService.updateLocationFromNearbyRequest(volunteerId, filters);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const bounds = buildNearbyBounds(filters.latitude, filters.longitude, filters.radiusMeters);
  const candidates = await prisma.task.findMany({
    where: {
      approvalStatus: 'APPROVED',
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      date: { gte: today },
      campaign: {
        status: { in: ['PUBLISHED', 'ACTIVE'] },
        endDate: { gte: today },
      },
      location: buildLocationFilter(bounds),
    },
    select: {
      id: true,
      title: true,
      description: true,
      date: true,
      startTime: true,
      endTime: true,
      attendanceRadiusMeters: true,
      requiredVolunteers: true,
      location: { select: { name: true, latitude: true, longitude: true } },
      campaign: { select: { attendanceRadiusMeters: true } },
      _count: {
        select: {
          volunteerTasks: { where: { status: { not: 'CANCELLED' } } },
          missionJoinRequests: { where: { status: 'PENDING' } },
        },
      },
      missionJoinRequests: {
        where: { volunteerId },
        select: { status: true },
        take: 1,
      },
    },
  });

  const missions = candidates
    .map((task) => ({
      task,
      distanceMeters: calculateHaversineDistanceMeters(
        filters.latitude,
        filters.longitude,
        Number(task.location.latitude),
        Number(task.location.longitude),
      ),
    }))
    .filter(({ task, distanceMeters }) => {
      return distanceMeters <= filters.radiusMeters && !isExpiredToday(task, now);
    })
    .map(({ task, distanceMeters }) => ({
      distanceMeters,
      mission: serializeNearbyMission(
        {
          ...task,
          missionJoinRequestsForUser: task.missionJoinRequests,
        },
        distanceMeters,
      ),
    }))
    .sort(
      (left, right) =>
        left.distanceMeters - right.distanceMeters ||
        left.mission.date.localeCompare(right.mission.date) ||
        left.mission.id - right.mission.id,
    );
  const result = sortAndPaginateNearbyMissions(missions, filters.page, filters.limit);

  return {
    message: 'تم جلب المهام القريبة بنجاح',
    pagination: serializePagination(filters.page, filters.limit, result.total),
    missions: result.missions,
  };
}

module.exports = { getNearbyMissions };
