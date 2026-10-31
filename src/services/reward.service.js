const prisma = require('../lib/prisma');
const { serializeBadge } = require('../utils/serializers');

const DEFAULT_BADGES = [
  {
    name: 'بداية العطاء',
    description: 'تمنح عند الوصول إلى 100 نقطة تطوعية.',
    pointsRequired: 100,
  },
  {
    name: 'نجم الفرق الميدانية',
    description: 'تمنح عند الوصول إلى 250 نقطة من الأنشطة الميدانية.',
    pointsRequired: 250,
  },
  {
    name: 'بطل التوعية الميدانية',
    description: 'تمنح عند الوصول إلى 450 نقطة بعد المشاركة الفعالة في الحملات.',
    pointsRequired: 450,
  },
  {
    name: 'صانع الأثر',
    description: 'تمنح عند الوصول إلى 800 نقطة.',
    pointsRequired: 800,
  },
];

async function ensureDefaultBadges(dbClient = prisma) {
  await Promise.all(
    DEFAULT_BADGES.map((badge) =>
      dbClient.badge.upsert({
        where: {
          name: badge.name,
        },
        update: {
          description: badge.description,
          pointsRequired: badge.pointsRequired,
        },
        create: badge,
      }),
    ),
  );
}

async function syncVolunteerBadges(dbClient, volunteerId) {
  await ensureDefaultBadges(dbClient);

  const volunteer = await dbClient.volunteer.findUnique({
    where: {
      id: volunteerId,
    },
    select: {
      points: true,
      volunteerBadges: {
        select: {
          badgeId: true,
        },
      },
    },
  });

  if (!volunteer) {
    return [];
  }

  const eligibleBadges = await dbClient.badge.findMany({
    where: {
      pointsRequired: {
        lte: volunteer.points,
      },
    },
    orderBy: {
      pointsRequired: 'asc',
    },
  });

  const existingBadgeIds = new Set(
    (volunteer.volunteerBadges || []).map((volunteerBadge) => volunteerBadge.badgeId),
  );
  const newlyAwardedBadges = [];

  for (const badge of eligibleBadges) {
    if (existingBadgeIds.has(badge.id)) {
      continue;
    }

    await dbClient.volunteerBadge.create({
      data: {
        volunteerId,
        badgeId: badge.id,
      },
    });

    newlyAwardedBadges.push(serializeBadge(badge));
  }

  return newlyAwardedBadges;
}

module.exports = {
  ensureDefaultBadges,
  syncVolunteerBadges,
};
