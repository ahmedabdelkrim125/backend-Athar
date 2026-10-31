const NEWS_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1469571486292-b53601010376?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80',
];

const HOURS_RECOGNITION_LEVELS = [
  {
    key: 'new_joiner',
    title: 'متطوع جديد',
    minHours: 0,
    maxHours: 19,
    color: '#94A3B8',
    description: 'بداية الرحلة التطوعية داخل سند.',
  },
  {
    key: 'engaged_member',
    title: 'عضو متفاعل',
    minHours: 20,
    maxHours: 59,
    color: '#2563EB',
    description: 'مشاركة منتظمة وبداية حضور فعلي في الأنشطة.',
  },
  {
    key: 'active_volunteer',
    title: 'متطوع نشط',
    minHours: 60,
    maxHours: 149,
    color: '#1F8F5A',
    description: 'رصيد ساعات قوي ومشاركة ميدانية واضحة.',
  },
  {
    key: 'field_lead',
    title: 'قائد ميداني',
    minHours: 150,
    maxHours: 249,
    color: '#F59E0B',
    description: 'مساهمة كبيرة ومستمرة في إدارة وتنفيذ المهام.',
  },
  {
    key: 'sanad_ambassador',
    title: 'سفير سند',
    minHours: 250,
    maxHours: 399,
    color: '#7C3AED',
    description: 'أثر تطوعي ممتد وحضور قوي داخل المجتمع.',
  },
  {
    key: 'giving_legend',
    title: 'أسطورة العطاء',
    minHours: 400,
    maxHours: null,
    color: '#DC2626',
    description: 'أعلى لقب ساعات داخل المنصة.',
  },
];

function toDate(value) {
  if (!value) {
    return null;
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDateOnly(value) {
  const parsedDate = toDate(value);
  return parsedDate ? parsedDate.toISOString().slice(0, 10) : null;
}

function formatTimeOnly(value) {
  const parsedDate = toDate(value);
  return parsedDate ? parsedDate.toISOString().slice(11, 19) : null;
}

function formatMonthYearArabic(value) {
  const parsedDate = toDate(value);

  if (!parsedDate) {
    return '';
  }

  return new Intl.DateTimeFormat('ar-EG', {
    month: 'long',
    year: 'numeric',
  }).format(parsedDate);
}

function buildAvatarUrl(volunteer = {}) {
  const fallbackSeed = volunteer.nationalId || volunteer.id || volunteer.fullName || 'sanad';
  const name = encodeURIComponent(volunteer.fullName || String(fallbackSeed));
  const palette = ['167C65', '1F8F5A', 'F59E0B', '2563EB', '9333EA', 'DC2626'];
  const paletteIndex = Math.abs(Number(volunteer.id) || 0) % palette.length;
  const background = palette[paletteIndex];

  return `https://ui-avatars.com/api/?name=${name}&background=${background}&color=ffffff&bold=true&size=256`;
}

function buildStatusLabel(status) {
  switch (status) {
    case 'ACTIVE':
      return 'متطوع نشط';
    case 'PENDING':
      return 'بانتظار التفعيل';
    case 'SUSPENDED':
      return 'الحساب موقوف';
    case 'INACTIVE':
      return 'غير نشط';
    default:
      return 'متطوع';
  }
}

function buildMemberSinceLabel(joinDate) {
  const formattedValue = formatMonthYearArabic(joinDate);
  return formattedValue ? `عضو منذ ${formattedValue}` : 'عضو جديد';
}

function buildHoursRecognition(totalHours = 0) {
  const normalizedHours = Math.max(0, Number(totalHours) || 0);
  const currentLevel =
    HOURS_RECOGNITION_LEVELS.find((level) => {
      if (level.maxHours === null) {
        return normalizedHours >= level.minHours;
      }

      return normalizedHours >= level.minHours && normalizedHours <= level.maxHours;
    }) || HOURS_RECOGNITION_LEVELS[0];
  const currentIndex = HOURS_RECOGNITION_LEVELS.findIndex(
    (level) => level.key === currentLevel.key,
  );
  const nextLevel =
    currentIndex >= 0 && currentIndex < HOURS_RECOGNITION_LEVELS.length - 1
      ? HOURS_RECOGNITION_LEVELS[currentIndex + 1]
      : null;
  const currentLevelRange = Math.max(
    1,
    (currentLevel.maxHours ?? currentLevel.minHours) - currentLevel.minHours + 1,
  );
  const progressPercent = nextLevel
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((normalizedHours - currentLevel.minHours) / currentLevelRange) * 100,
          ),
        ),
      )
    : 100;

  return {
    basedOn: 'totalHours',
    totalHours: normalizedHours,
    currentTitle: currentLevel.title,
    currentLevelKey: currentLevel.key,
    color: currentLevel.color,
    description: currentLevel.description,
    nextTitle: nextLevel?.title || null,
    nextLevelKey: nextLevel?.key || null,
    nextMinHours: nextLevel?.minHours || null,
    hoursToNextLevel: nextLevel ? Math.max(0, nextLevel.minHours - normalizedHours) : 0,
    progressPercent,
    levels: HOURS_RECOGNITION_LEVELS.map((level) => ({
      key: level.key,
      title: level.title,
      color: level.color,
      minHours: level.minHours,
      maxHours: level.maxHours,
      description: level.description,
      isCurrent: level.key === currentLevel.key,
      isUnlocked: normalizedHours >= level.minHours,
    })),
  };
}

function getPeriodStart(period, now = new Date()) {
  switch (period) {
    case 'weekly':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function isWithinPeriod(value, periodStart) {
  if (!periodStart) {
    return true;
  }

  const parsedDate = toDate(value);
  return parsedDate ? parsedDate >= periodStart : false;
}

function collectVolunteerMetrics(volunteer, options = {}) {
  const period = options.period || 'all';
  const now = options.now || new Date();
  const periodStart = getPeriodStart(period, now);
  const reports = Array.isArray(volunteer.reports) ? volunteer.reports : [];
  const assignments = Array.isArray(volunteer.assignedTasks) ? volunteer.assignedTasks : [];
  const volunteerBadges = Array.isArray(volunteer.volunteerBadges)
    ? volunteer.volunteerBadges
    : [];

  const filteredReports = reports.filter((report) =>
    isWithinPeriod(report.createdAt, periodStart),
  );
  const filteredAssignments = assignments.filter((assignment) => {
    const assignmentDate =
      assignment.task?.date ||
      assignment.checkOutTime ||
      assignment.checkInTime ||
      assignment.createdAt ||
      assignment.updatedAt;

    return isWithinPeriod(assignmentDate, periodStart);
  });
  const filteredBadges = volunteerBadges.filter((volunteerBadge) =>
    isWithinPeriod(volunteerBadge.awardedAt, periodStart),
  );

  const completedAssignments = filteredAssignments.filter((assignment) =>
    ['CHECKED_OUT', 'COMPLETED'].includes(assignment.status),
  );
  const checkedInAssignments = filteredAssignments.filter((assignment) =>
    ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(assignment.status),
  );
  const campaignIds = new Set();

  filteredReports.forEach((report) => {
    if (report.campaignId) {
      campaignIds.add(report.campaignId);
    }
  });

  completedAssignments.forEach((assignment) => {
    if (assignment.task?.campaignId) {
      campaignIds.add(assignment.task.campaignId);
    }
  });

  const workedHours = filteredAssignments.reduce(
    (total, assignment) => total + (Number(assignment.hoursWorked) || 0),
    0,
  );
  const totalHours =
    period === 'all'
      ? Math.max(Number(volunteer.totalHours) || 0, workedHours)
      : workedHours;
  const reportsCount = filteredReports.length;
  const badgesCount = filteredBadges.length;
  const completedCampaigns = campaignIds.size;
  const completedAssignmentsCount = completedAssignments.length;
  const score =
    (period === 'all' ? Number(volunteer.points) || 0 : 0) +
    totalHours * 2 +
    reportsCount * 60 +
    completedAssignmentsCount * 25 +
    completedCampaigns * 20 +
    badgesCount * 40 +
    checkedInAssignments.length * 10;

  return {
    totalHours,
    reportsCount,
    badgesCount,
    completedCampaigns,
    completedAssignmentsCount,
    checkedInAssignmentsCount: checkedInAssignments.length,
    score,
  };
}

function buildLeaderboardRows(volunteers, options = {}) {
  const currentVolunteerId = options.currentVolunteerId || null;
  const period = options.period || 'all';
  const rows = volunteers
    .map((volunteer) => {
      const metrics = collectVolunteerMetrics(volunteer, { period });

      return {
        id: volunteer.id,
        fullName: volunteer.fullName,
        avatarUrl: buildAvatarUrl(volunteer),
        isCurrentUser: volunteer.id === currentVolunteerId,
        status: volunteer.status,
        joinDate: volunteer.joinDate,
        createdAt: volunteer.createdAt,
        metrics,
      };
    })
    .sort((left, right) => {
      if (right.metrics.score !== left.metrics.score) {
        return right.metrics.score - left.metrics.score;
      }

      return (
        new Date(left.joinDate || left.createdAt || 0) -
        new Date(right.joinDate || right.createdAt || 0)
      );
    })
    .map((row, index) => ({
      rank: index + 1,
      id: row.id,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      isCurrentUser: row.isCurrentUser,
      status: row.status,
      points: row.metrics.score,
      totalHours: row.metrics.totalHours,
      completedCampaigns: row.metrics.completedCampaigns,
      reportsCount: row.metrics.reportsCount,
    }));

  return rows;
}

function buildAchievementCatalog(metrics, context = {}) {
  const currentRank = context.currentRank || 0;

  return [
    {
      key: 'field_awareness',
      title: 'بطل التوعية',
      icon: 'shield',
      color: '#1F8F5A',
      unlocked: metrics.completedCampaigns >= 2,
      progressLabel: `${metrics.completedCampaigns} / 2 حملات`,
      description:
        'يُمنح هذا الإنجاز للمتطوعين الذين شاركوا بانتظام في حملات ميدانية ورفعوا تقارير متابعة واضحة.',
      requirements: [
        'إكمال حملتين ميدانيتين على الأقل',
        'تسجيل حضور فعلي داخل المهمة',
        'رفع تقرير بعد كل حملة',
      ],
    },
    {
      key: 'rescuer',
      title: 'المنقذ',
      icon: 'star',
      color: '#F59E0B',
      unlocked: metrics.reportsCount >= 2,
      progressLabel: `${metrics.reportsCount} / 2 تقارير`,
      description:
        'يُمنح هذا الإنجاز للمتطوع الذي يواظب على رفع التقارير الميدانية ومتابعة التنفيذ حتى النهاية.',
      requirements: [
        'رفع تقريرين أو أكثر',
        'الالتزام بتقييم المهمة',
      ],
    },
    {
      key: 'hours_100',
      title: '100 ساعة',
      icon: 'time',
      color: '#1F8F5A',
      unlocked: metrics.totalHours >= 100,
      progressLabel: `${metrics.totalHours} / 100 ساعة`,
      description:
        'يُمنح هذا الإنجاز عند الوصول إلى مئة ساعة تطوع موثقة داخل المنصة.',
      requirements: [
        'تسجيل 100 ساعة تطوع',
      ],
    },
    {
      key: 'reports_master',
      title: 'مكتمل التقارير',
      icon: 'document',
      color: '#2ECC71',
      unlocked: metrics.reportsCount >= 4,
      progressLabel: `${metrics.reportsCount} / 4 تقارير`,
      description:
        'هذا الإنجاز يخص المتطوع الذي يغلق دورة المهمة كاملة: حضور ثم تقرير.',
      requirements: [
        'رفع 4 تقارير ميدانية أو أكثر',
      ],
    },
    {
      key: 'top_three',
      title: 'متطوع الأسبوع',
      icon: 'medal',
      color: '#0EA5E9',
      unlocked: currentRank > 0 && currentRank <= 3,
      progressLabel: currentRank > 0 ? `المركز ${currentRank}` : 'خارج الترتيب',
      description:
        'يتحقق عند دخول قائمة أفضل ثلاثة متطوعين خلال الفترة الحالية.',
      requirements: [
        'الدخول إلى المراكز الثلاثة الأولى',
      ],
    },
    {
      key: 'campaign_50',
      title: '50 حملة',
      icon: 'lock',
      color: '#DADADA',
      unlocked: metrics.completedCampaigns >= 50,
      progressLabel: `${metrics.completedCampaigns} / 50`,
      description:
        'إنجاز طويل المدى للمتطوعين ذوي المشاركة الممتدة في الحملات.',
      requirements: [
        'إكمال 50 حملة تطوعية',
      ],
    },
  ];
}

function buildCertificates(metrics, achievements, volunteer) {
  const issueDate = volunteer.joinDate || volunteer.createdAt || new Date();
  const items = [];

  if (metrics.totalHours >= 100) {
    items.push({
      id: 'hours-100',
      title: 'شهادة تقدير — 100 ساعة تطوع',
      date: formatMonthYearArabic(issueDate),
      subtitle: 'مستوى التزام ميداني مميز',
      icon: 'award',
    });
  }

  if (
    achievements.some(
      (achievement) => achievement.key === 'reports_master' && achievement.unlocked,
    )
  ) {
    items.push({
      id: 'reports-master',
      title: 'شهادة إتقان التقارير',
      date: formatMonthYearArabic(issueDate),
      subtitle: 'لرفع التقارير الميدانية كاملة',
      icon: 'document',
    });
  }

  if (achievements.some((achievement) => achievement.key === 'top_three' && achievement.unlocked)) {
    items.push({
      id: 'top-three',
      title: 'شهادة أفضل 3 متطوعين',
      date: formatMonthYearArabic(new Date()),
      subtitle: 'أداء أسبوعي قوي داخل المنصة',
      icon: 'medal',
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'welcome',
      title: 'شهادة بداية الرحلة التطوعية',
      date: formatMonthYearArabic(issueDate),
      subtitle: 'مفعّلة تلقائيًا بعد إكمال أول خطوة',
      icon: 'award',
    });
  }

  return items;
}

function buildFallbackNewsItems(context = {}) {
  const items = [];

  if (context.nextTask) {
    items.push({
      id: `task-${context.nextTask.id}`,
      title: `مهمة قادمة: ${context.nextTask.title}`,
      summary: `${context.nextTask.location?.name || 'موقع ميداني'} • ${context.nextTask.date || ''}`,
      description:
        context.nextTask.description || 'تابع استعداداتك للمهمة القادمة وسجّل حضورك في الموعد.',
      imageUrl: NEWS_IMAGE_URLS[0],
      type: 'task',
      publishedAt: new Date().toISOString(),
    });
  }

  if (context.recentReport) {
    items.push({
      id: `report-${context.recentReport.id}`,
      title: 'تقرير جديد أُضيف إلى نشاطك',
      summary: context.recentReport.task?.title || 'نشاط ميداني مكتمل',
      description:
        context.recentReport.notes ||
        'تم تحديث لوحة المتابعة بآخر تقرير ميداني مرتبط بحملاتك.',
      imageUrl: context.recentReport.images?.[0] || NEWS_IMAGE_URLS[1],
      type: 'report',
      publishedAt: context.recentReport.createdAt?.toISOString?.() || new Date().toISOString(),
    });
  }

  if (context.activeCampaign) {
    items.push({
      id: `campaign-${context.activeCampaign.id}`,
      title: context.activeCampaign.title,
      summary: `${context.activeCampaign.location?.area || ''} ${context.activeCampaign.location?.city || ''}`.trim(),
      description:
        context.activeCampaign.description ||
        'حملة نشطة الآن ويمكنك متابعة تفاصيل المهام من الصفحة الرئيسية.',
      imageUrl: NEWS_IMAGE_URLS[2],
      type: 'campaign',
      publishedAt: new Date().toISOString(),
    });
  }

  return items;
}

module.exports = {
  NEWS_IMAGE_URLS,
  buildAchievementCatalog,
  buildAvatarUrl,
  buildCertificates,
  buildFallbackNewsItems,
  buildHoursRecognition,
  buildLeaderboardRows,
  buildMemberSinceLabel,
  buildStatusLabel,
  collectVolunteerMetrics,
  formatDateOnly,
  formatMonthYearArabic,
  formatTimeOnly,
  toDate,
};
