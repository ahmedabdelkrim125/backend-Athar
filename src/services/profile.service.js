const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { serializeBadge } = require('../utils/serializers');
const { listVolunteerTitles } = require('./volunteer-title.service');
const { resolveVolunteerTitle } = require('../utils/volunteer-titles');
const {
  buildAchievementCatalog,
  buildAvatarUrl,
  buildCertificates,
  buildHoursRecognition,
  buildLeaderboardRows,
  buildMemberSinceLabel,
  buildStatusLabel,
  collectVolunteerMetrics,
} = require('../utils/profile-helpers');

function normalizePeriod(periodValue) {
  const normalizedValue = String(periodValue || 'weekly').trim().toLowerCase();

  if (['weekly', 'monthly', 'all'].includes(normalizedValue)) {
    return normalizedValue;
  }

  return 'weekly';
}

function buildVolunteerSelect() {
  return {
    id: true,
    fullName: true,
    nationalId: true,
    email: true,
    phone: true,
    status: true,
    totalHours: true,
    points: true,
    joinDate: true,
    createdAt: true,
    reports: {
      select: {
        id: true,
        campaignId: true,
        createdAt: true,
        rating: true,
      },
    },
    assignedTasks: {
      select: {
        id: true,
        status: true,
        hoursWorked: true,
        checkInTime: true,
        checkOutTime: true,
        task: {
          select: {
            campaignId: true,
            date: true,
          },
        },
      },
    },
    volunteerBadges: {
      select: {
        id: true,
        awardedAt: true,
      },
    },
  };
}

function buildLeaderboardPayload(rows, currentVolunteerId) {
  const currentUser = rows.find((row) => row.id === currentVolunteerId) || null;
  const topThree = rows.slice(0, 3);
  const surrounding = rows.slice(0, Math.max(8, topThree.length));

  return {
    totalParticipants: rows.length,
    currentUserRank: currentUser?.rank || null,
    topThree,
    entries: surrounding,
    currentUser,
  };
}

async function loadVolunteers() {
  return prisma.volunteer.findMany({
    where: {
      status: {
        in: ['ACTIVE', 'PENDING', 'INACTIVE'],
      },
    },
    select: buildVolunteerSelect(),
  });
}

async function loadMissionsSummary(volunteerId) {
  const completedWhere = {
    volunteerId,
    status: 'COMPLETED',
  };

  const [completedAssignments, completedTotals, volunteerBadges] = await Promise.all([
    prisma.volunteerTask.findMany({
      where: completedWhere,
      orderBy: [{ checkOutTime: 'desc' }, { id: 'desc' }],
      take: 50,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            date: true,
            rewardBadge: true,
            campaign: {
              select: {
                id: true,
                title: true,
              },
            },
            reports: {
              where: {
                volunteerId,
              },
              select: {
                pointsAwarded: true,
                createdAt: true,
              },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.volunteerTask.aggregate({
      where: completedWhere,
      _count: true,
      _sum: {
        hoursWorked: true,
      },
    }),
    prisma.volunteerBadge.findMany({
      where: {
        volunteerId,
      },
      include: {
        badge: true,
      },
      orderBy: {
        awardedAt: 'desc',
      },
    }),
  ]);

  const missionItems = completedAssignments.map((assignment) => {
    const report = assignment.task.reports?.[0] ?? null;
    const completedAt = assignment.checkOutTime || report?.createdAt || null;

    return {
      taskId: assignment.task.id,
      title: assignment.task.title,
      campaignId: assignment.task.campaign?.id ?? null,
      campaignTitle: assignment.task.campaign?.title ?? null,
      date: assignment.task.date ? assignment.task.date.toISOString().slice(0, 10) : null,
      completedAt: completedAt ? completedAt.toISOString() : null,
      hoursWorked: assignment.hoursWorked,
      pointsEarned: (assignment.attendancePointsAwarded ?? 0) + (report?.pointsAwarded ?? 0),
      badge: serializeBadge(assignment.task.rewardBadge),
    };
  });

  return {
    missions: {
      completedCount: completedTotals._count ?? 0,
      totalHours: completedTotals._sum?.hoursWorked ?? 0,
      items: missionItems,
    },
    badges: {
      count: volunteerBadges.length,
      items: volunteerBadges.map((volunteerBadge) => ({
        ...serializeBadge(volunteerBadge.badge),
        awardedAt: volunteerBadge.awardedAt.toISOString(),
      })),
    },
  };
}

async function getProfileDashboard(volunteerId) {
  const [volunteers, volunteerTitles] = await Promise.all([
    loadVolunteers(),
    listVolunteerTitles(),
  ]);
  const currentVolunteer = volunteers.find((volunteer) => volunteer.id === volunteerId);

  if (!currentVolunteer) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  const overallMetrics = collectVolunteerMetrics(currentVolunteer, { period: 'all' });
  const weeklyRows = buildLeaderboardRows(volunteers, {
    currentVolunteerId: volunteerId,
    period: 'weekly',
    titles: volunteerTitles,
  });
  const leaderboard = buildLeaderboardPayload(weeklyRows, volunteerId);
  const achievements = buildAchievementCatalog(overallMetrics, {
    currentRank: leaderboard.currentUserRank,
  });
  const certificates = buildCertificates(overallMetrics, achievements, currentVolunteer);
  const displayTotalHours = Number(currentVolunteer.totalHours) || overallMetrics.totalHours;
  const displayPoints = Number(currentVolunteer.points) || 0;
  const recognition = buildHoursRecognition(displayTotalHours);
  const missionsSummary = await loadMissionsSummary(volunteerId);

  return {
    message: 'تم جلب بيانات الحساب بنجاح',
    profile: {
      volunteer: {
        id: currentVolunteer.id,
        fullName: currentVolunteer.fullName,
        nationalId: currentVolunteer.nationalId,
        email: currentVolunteer.email,
        phone: currentVolunteer.phone,
        avatarUrl: buildAvatarUrl(currentVolunteer),
        status: currentVolunteer.status,
        statusLabel: `${buildStatusLabel(currentVolunteer.status)} 🌟`,
        memberSinceLabel: buildMemberSinceLabel(currentVolunteer.joinDate),
        joinDate: currentVolunteer.joinDate?.toISOString?.() || null,
        recognitionTitle: recognition.currentTitle,
      },
      stats: {
        totalHours: displayTotalHours,
        points: displayPoints,
        campaignsCompleted: overallMetrics.completedCampaigns,
        missionsCompleted: missionsSummary.missions.completedCount,
        badgesCount: achievements.filter((achievement) => achievement.unlocked).length,
        certificatesCount: certificates.length,
      },
      volunteerTitle: resolveVolunteerTitle(
        {
          ...overallMetrics,
          points: currentVolunteer.points,
        },
        volunteerTitles,
      ),
      recognition,
      leaderboard: {
        period: 'weekly',
        ...leaderboard,
      },
      achievements: {
        achievedCount: achievements.filter((achievement) => achievement.unlocked).length,
        totalCount: achievements.length,
        items: achievements,
      },
      certificates: {
        count: certificates.length,
        items: certificates,
      },
      missions: missionsSummary.missions,
      badges: missionsSummary.badges,
    },
  };
}

async function getProfileRecognition(volunteerId) {
  const volunteer = await prisma.volunteer.findUnique({
    where: {
      id: volunteerId,
    },
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      totalHours: true,
      joinDate: true,
      createdAt: true,
    },
  });

  if (!volunteer) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  const recognition = buildHoursRecognition(volunteer.totalHours);

  return {
    message: 'تم جلب لقب المتطوع بنجاح',
    recognition: {
      volunteer: {
        id: volunteer.id,
        fullName: volunteer.fullName,
        nationalId: volunteer.nationalId,
      },
      ...recognition,
    },
  };
}

async function getLeaderboard(volunteerId, periodValue) {
  const [volunteers, volunteerTitles] = await Promise.all([
    loadVolunteers(),
    listVolunteerTitles(),
  ]);
  const currentVolunteer = volunteers.find((volunteer) => volunteer.id === volunteerId);

  if (!currentVolunteer) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  const period = normalizePeriod(periodValue);
  const rows = buildLeaderboardRows(volunteers, {
    currentVolunteerId: volunteerId,
    period,
    titles: volunteerTitles,
  });

  return {
    message: 'تم جلب لوحة المتصدرين بنجاح',
    leaderboard: {
      period,
      ...buildLeaderboardPayload(rows, volunteerId),
    },
  };
}

module.exports = {
  getLeaderboard,
  getProfileDashboard,
  getProfileRecognition,
};