const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
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

async function getProfileDashboard(volunteerId) {
  const volunteers = await loadVolunteers();
  const currentVolunteer = volunteers.find((volunteer) => volunteer.id === volunteerId);

  if (!currentVolunteer) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  const overallMetrics = collectVolunteerMetrics(currentVolunteer, { period: 'all' });
  const weeklyRows = buildLeaderboardRows(volunteers, {
    currentVolunteerId: volunteerId,
    period: 'weekly',
  });
  const leaderboard = buildLeaderboardPayload(weeklyRows, volunteerId);
  const achievements = buildAchievementCatalog(overallMetrics, {
    currentRank: leaderboard.currentUserRank,
  });
  const certificates = buildCertificates(overallMetrics, achievements, currentVolunteer);
  const displayTotalHours = Number(currentVolunteer.totalHours) || overallMetrics.totalHours;
  const displayPoints = Number(currentVolunteer.points) || overallMetrics.score;
  const recognition = buildHoursRecognition(displayTotalHours);

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
        badgesCount: achievements.filter((achievement) => achievement.unlocked).length,
        certificatesCount: certificates.length,
      },
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
  const volunteers = await loadVolunteers();
  const currentVolunteer = volunteers.find((volunteer) => volunteer.id === volunteerId);

  if (!currentVolunteer) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  const period = normalizePeriod(periodValue);
  const rows = buildLeaderboardRows(volunteers, {
    currentVolunteerId: volunteerId,
    period,
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
