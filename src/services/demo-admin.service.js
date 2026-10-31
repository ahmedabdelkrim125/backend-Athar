const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { ensureDefaultBadges, syncVolunteerBadges } = require('./reward.service');

const DEMO_COORDINATES = {
  october: { latitude: 29.9769, longitude: 30.9470 },
  maadi: { latitude: 29.9602, longitude: 31.2569 },
  heliopolis: { latitude: 30.0918, longitude: 31.3302 },
  faisal: { latitude: 30.0176, longitude: 31.2017 },
  dokki: { latitude: 30.0412, longitude: 31.2094 },
  zayed: { latitude: 30.0276, longitude: 30.9864 },
};

const DEMO_POST_TARGET = 24;
const DEMO_ANNOUNCEMENTS = [
  {
    title: 'تحديث منصة سند لفرق المتطوعين',
    content:
      'تم تجهيز الهوم والبروفايل ولوحة المجتمع ببيانات ديمو مباشرة من قاعدة البيانات لتسهيل اختبار التطبيق كاملًا.',
    isPinned: true,
    image: buildPlaceholderImage('sanad-announcement-home', 0),
  },
  {
    title: 'بدء مهام ميدانية جديدة في القاهرة والجيزة',
    content:
      'تمت إضافة مهام حضور ومتابعة وتقارير على عدة مواقع لتظهر المهام اليومية والقادمة لكل المتطوعين داخل التطبيق.',
    isPinned: true,
    image: buildPlaceholderImage('sanad-announcement-tasks', 1),
  },
  {
    title: 'تحديث مجتمع سند وزيادة عدد المنشورات',
    content:
      'تم توسيع مجتمع المتطوعين بعدد منشورات أكبر من 20 مع تعليقات وإعجابات حقيقية لتجربة واجهات الفلاتر بسلاسة.',
    isPinned: false,
    image: buildPlaceholderImage('sanad-announcement-community', 2),
  },
  {
    title: 'جاهزية بيانات الإنجازات والشهادات',
    content:
      'تم ملء الساعات والنقاط والشارات والشهادات واللوحة الأسبوعية ببيانات متنوعة لكل حساب موجود في المنصة.',
    isPinned: false,
    image: buildPlaceholderImage('sanad-announcement-profile', 3),
  },
];

const ACTIVE_CAMPAIGN_BLUEPRINT = {
  title: 'تشغيل الهوم والمتابعة اليومية - أبريل',
  description:
    'حملة تشغيلية لتجهيز الصفحة الرئيسية والمهام الحالية والقادمة داخل تطبيق سند بشكل واقعي.',
  coverImage: buildPlaceholderImage('sanad-campaign-active', 0),
  startOffsetDays: 0,
  endOffsetDays: 14,
  startTime: '09:00',
  endTime: '18:00',
  status: 'ACTIVE',
  attendanceRadiusMeters: 180,
  attendancePoints: 25,
  reportPoints: 35,
  location: {
    name: 'مركز تنسيق أكتوبر',
    city: 'الجيزة',
    area: 'أكتوبر',
    ...DEMO_COORDINATES.october,
  },
};

const COMPLETED_CAMPAIGN_BLUEPRINTS = [
  {
    key: 'awareness',
    title: 'سجل الإنجازات - التوعية المجتمعية',
    description:
      'حملة مكتملة لتغذية إنجازات الحساب وشاشات التوعية والتقارير.',
    coverImage: buildPlaceholderImage('sanad-campaign-awareness', 1),
    startOffsetDays: -35,
    endOffsetDays: -20,
    startTime: '09:00',
    endTime: '16:00',
    location: {
      name: 'نقطة توعية المعادي',
      city: 'القاهرة',
      area: 'المعادي',
      ...DEMO_COORDINATES.maadi,
    },
  },
  {
    key: 'logistics',
    title: 'سجل الإنجازات - الدعم اللوجستي',
    description:
      'حملة مكتملة لتجهيز بيانات الساعات والنقاط ولوحة المتصدرين بصورة أقرب للواقعية.',
    coverImage: buildPlaceholderImage('sanad-campaign-logistics', 2),
    startOffsetDays: -25,
    endOffsetDays: -12,
    startTime: '08:30',
    endTime: '17:00',
    location: {
      name: 'مخزن التوزيع الرئيسي',
      city: 'الجيزة',
      area: 'فيصل',
      ...DEMO_COORDINATES.faisal,
    },
  },
  {
    key: 'field',
    title: 'سجل الإنجازات - الجولات الميدانية',
    description:
      'حملة مكتملة للجولات الميدانية وتوثيق النجاحات داخل الحسابات الشخصية.',
    coverImage: buildPlaceholderImage('sanad-campaign-field', 3),
    startOffsetDays: -18,
    endOffsetDays: -4,
    startTime: '09:30',
    endTime: '15:30',
    location: {
      name: 'مركز دعم الدقي',
      city: 'الجيزة',
      area: 'الدقي',
      ...DEMO_COORDINATES.dokki,
    },
  },
];

const ACTIVE_TASK_BLUEPRINTS = [
  {
    title: 'منطقة أكتوبر السكنية',
    description:
      'مهمة ميدانية سريعة لتجهيز نقطة الاستقبال وتنسيق مسار دخول المتطوعين.',
    dateOffsetDays: 0,
    startTime: '10:00',
    endTime: '12:00',
    location: {
      name: 'منطقة أكتوبر السكنية',
      city: 'الجيزة',
      area: 'أكتوبر',
      ...DEMO_COORDINATES.october,
    },
  },
  {
    title: 'حي المعادي - شارع 9',
    description:
      'دعم لوجستي وتوزيع أدوات ومتابعة الحضور داخل النقطة الميدانية.',
    dateOffsetDays: 0,
    startTime: '14:30',
    endTime: '17:30',
    location: {
      name: 'حي المعادي - شارع 9',
      city: 'القاهرة',
      area: 'المعادي',
      ...DEMO_COORDINATES.maadi,
    },
  },
  {
    title: 'مصر الجديدة',
    description:
      'تغطية ميدانية ومساندة فريق التوعية داخل نطاق مصر الجديدة.',
    dateOffsetDays: 1,
    startTime: '09:00',
    endTime: '12:00',
    location: {
      name: 'مصر الجديدة',
      city: 'القاهرة',
      area: 'مصر الجديدة',
      ...DEMO_COORDINATES.heliopolis,
    },
  },
];

const COMPLETED_TASK_BLUEPRINTS = [
  {
    campaignKey: 'awareness',
    title: 'تنظيم نقطة الاستقبال',
    description: 'تجهيز نقطة الاستقبال والمتابعة الميدانية في بداية الحملة.',
    dateOffsetDays: -33,
    startTime: '09:00',
    endTime: '15:00',
    location: {
      name: 'نقطة الاستقبال - المعادي',
      city: 'القاهرة',
      area: 'المعادي',
      ...DEMO_COORDINATES.maadi,
    },
  },
  {
    campaignKey: 'awareness',
    title: 'توزيع مواد التوعية',
    description: 'نشر مواد التوعية ومتابعة المستفيدين داخل المنطقة.',
    dateOffsetDays: -30,
    startTime: '10:00',
    endTime: '16:00',
    location: {
      name: 'ميدان التوعية - المعادي',
      city: 'القاهرة',
      area: 'المعادي',
      ...DEMO_COORDINATES.maadi,
    },
  },
  {
    campaignKey: 'awareness',
    title: 'المتابعة الختامية للتوعية',
    description: 'إغلاق مخرجات حملة التوعية ورفع ملخص التنفيذ.',
    dateOffsetDays: -27,
    startTime: '09:30',
    endTime: '14:30',
    location: {
      name: 'نقطة المتابعة - المعادي',
      city: 'القاهرة',
      area: 'المعادي',
      ...DEMO_COORDINATES.maadi,
    },
  },
  {
    campaignKey: 'logistics',
    title: 'فرز الكراتين وتجهيزها',
    description: 'فرز الدعم وتجهيز الصناديق ومراجعة مسارات النقل.',
    dateOffsetDays: -23,
    startTime: '08:30',
    endTime: '14:30',
    location: {
      name: 'مخزن فيصل الرئيسي',
      city: 'الجيزة',
      area: 'فيصل',
      ...DEMO_COORDINATES.faisal,
    },
  },
  {
    campaignKey: 'logistics',
    title: 'تحميل ونقل المستلزمات',
    description: 'متابعة التحميل والتسليم داخل النقطة اللوجستية.',
    dateOffsetDays: -20,
    startTime: '09:00',
    endTime: '16:00',
    location: {
      name: 'بوابة المخزن',
      city: 'الجيزة',
      area: 'فيصل',
      ...DEMO_COORDINATES.faisal,
    },
  },
  {
    campaignKey: 'logistics',
    title: 'التسليم النهائي للموقع',
    description: 'مراجعة الاستلام وإغلاق تسليم المعدات داخل الموقع.',
    dateOffsetDays: -17,
    startTime: '10:00',
    endTime: '15:00',
    location: {
      name: 'نقطة التسليم',
      city: 'الجيزة',
      area: 'فيصل',
      ...DEMO_COORDINATES.faisal,
    },
  },
  {
    campaignKey: 'field',
    title: 'جولة ميدانية صباحية',
    description: 'متابعة الفريق الميداني وتوثيق الملاحظات في بداية اليوم.',
    dateOffsetDays: -14,
    startTime: '09:00',
    endTime: '14:00',
    location: {
      name: 'مركز الدقي الميداني',
      city: 'الجيزة',
      area: 'الدقي',
      ...DEMO_COORDINATES.dokki,
    },
  },
  {
    campaignKey: 'field',
    title: 'مراجعة نقاط الخدمة',
    description: 'فحص نقاط الخدمة والتأكد من تغطية الاحتياج داخل النطاق.',
    dateOffsetDays: -11,
    startTime: '11:00',
    endTime: '17:00',
    location: {
      name: 'نقطة الخدمة',
      city: 'الجيزة',
      area: 'الدقي',
      ...DEMO_COORDINATES.dokki,
    },
  },
  {
    campaignKey: 'field',
    title: 'إغلاق الجولة الميدانية',
    description: 'إغلاق الجولة النهائية ورفع تقرير الإنجاز النهائي.',
    dateOffsetDays: -8,
    startTime: '09:30',
    endTime: '15:30',
    location: {
      name: 'مكتب الختام الميداني',
      city: 'الجيزة',
      area: 'الدقي',
      ...DEMO_COORDINATES.dokki,
    },
  },
];

const COMMUNITY_TOPICS = [
  'مبسوط جدًا بتنظيم الفريق النهارده والمجهود كان واضح من أول دقيقة.',
  'التجربة الميدانية كانت ممتازة والردود من الناس مشجعة جدًا.',
  'أول مرة أشارك في المهمة بالشكل ده والتنظيم فرق جدًا في النتيجة.',
  'رفع التقارير بقى أسهل وأوضح بعد التحديثات الأخيرة.',
  'حملة النهارده خلصت بشكل محترم جدًا والكل كان متعاون.',
  'الدعم اللوجستي كان منظم وسهّل علينا إنجاز المهمة أسرع.',
  'أكثر شيء عجبني هو وضوح توزيع الأدوار داخل الفريق.',
  'المهام اليومية أصبحت أوضح بكثير وساعدتني أنظم وقتي.',
  'محتاجين نستمر بنفس الجودة في الجولات القادمة.',
  'شكراً لكل من شارك وساعد في إنهاء اليوم بهذا الشكل الممتاز.',
  'متابعة الحضور والتقارير خلّت الشغل أوضح من السابق.',
  'الداتا الجديدة على التطبيق فعلاً مفيدة وبتبيّن مجهود الفريق.',
];

const SCORE_PRESETS = [850, 720, 650, 580, 520, 490, 480, 470, 430, 390, 360, 330];
const HOURS_PRESETS = [160, 144, 132, 120, 108, 100, 94, 88, 76, 68, 60, 52];

function buildPlaceholderImage(slug, paletteIndex = 0, size = '1200x800') {
  const palettes = [
    ['EAF7F1', '167C65'],
    ['FFF6E8', 'D97706'],
    ['EDF4FF', '2563EB'],
    ['F7EDFF', '7C3AED'],
    ['FDECEC', 'DC2626'],
  ];
  const [background, foreground] = palettes[paletteIndex % palettes.length];

  return `https://placehold.co/${size}/${background}/${foreground}.png?text=${encodeURIComponent(
    slug,
  )}`;
}

function startOfUtcDay(offsetDays = 0) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value;
}

function buildDate(offsetDays = 0) {
  return startOfUtcDay(offsetDays);
}

function buildTime(timeText) {
  const [hours, minutes] = String(timeText || '00:00')
    .split(':')
    .map((value) => Number(value) || 0);

  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function buildVolunteerTarget(index) {
  const points =
    SCORE_PRESETS[index] ?? Math.max(180, SCORE_PRESETS[SCORE_PRESETS.length - 1] - (index - 11) * 20);
  const totalHours =
    HOURS_PRESETS[index] ?? Math.max(32, HOURS_PRESETS[HOURS_PRESETS.length - 1] - (index - 11) * 4);
  const completedTaskCount = Math.min(
    COMPLETED_TASK_BLUEPRINTS.length,
    Math.max(3, 7 - Math.floor(index / 2)),
  );

  return {
    points,
    totalHours,
    completedTaskCount,
    postCount: index < 8 ? 2 : 1,
  };
}

function buildDemoSosStatus(volunteer, index) {
  if (volunteer?.nationalId === '30410018800673') {
    return 'OPEN';
  }

  const statuses = ['RESPONDED', 'RESOLVED', 'CANCELLED', 'OPEN'];
  return statuses[index % statuses.length];
}

function buildReportNotes(volunteer, task, sequence) {
  return `تقرير ديمو للمهمة ${sequence} بواسطة ${volunteer.fullName} يوضح اكتمال التنفيذ في ${task.location.name} ورفع المخرجات الميدانية بنجاح.`;
}

function buildCommunityPostContent(volunteer, index) {
  const topic = COMMUNITY_TOPICS[index % COMMUNITY_TOPICS.length];
  return `${volunteer.fullName}: ${topic}`;
}

async function ensureLocation(dbClient, location) {
  const existingLocation = await dbClient.location.findFirst({
    where: {
      name: location.name,
      city: location.city,
      area: location.area,
    },
  });

  if (existingLocation) {
    return existingLocation.id;
  }

  const createdLocation = await dbClient.location.create({
    data: location,
  });

  return createdLocation.id;
}

async function ensureAnnouncement(dbClient, announcement) {
  const existingAnnouncement = await dbClient.announcement.findFirst({
    where: {
      title: announcement.title,
    },
  });

  if (existingAnnouncement) {
    return dbClient.announcement.update({
      where: {
        id: existingAnnouncement.id,
      },
      data: announcement,
    });
  }

  return dbClient.announcement.create({
    data: announcement,
  });
}

async function ensureCampaign(dbClient, createdById, blueprint) {
  const locationId = await ensureLocation(dbClient, blueprint.location);
  const data = {
    title: blueprint.title,
    description: blueprint.description,
    coverImage: blueprint.coverImage,
    startDate: buildDate(blueprint.startOffsetDays),
    endDate: buildDate(blueprint.endOffsetDays),
    startTime: blueprint.startTime ? buildTime(blueprint.startTime) : null,
    endTime: blueprint.endTime ? buildTime(blueprint.endTime) : null,
    status: blueprint.status || 'COMPLETED',
    createdById,
    locationId,
    attendanceRadiusMeters: blueprint.attendanceRadiusMeters || 120,
    attendancePoints: blueprint.attendancePoints || 20,
    reportPoints: blueprint.reportPoints || 30,
  };

  const existingCampaign = await dbClient.campaign.findFirst({
    where: {
      title: blueprint.title,
    },
  });

  if (existingCampaign) {
    return dbClient.campaign.update({
      where: {
        id: existingCampaign.id,
      },
      data,
    });
  }

  return dbClient.campaign.create({
    data,
  });
}

async function ensureTask(dbClient, campaignId, blueprint) {
  const locationId = await ensureLocation(dbClient, blueprint.location);
  const data = {
    title: blueprint.title,
    description: blueprint.description,
    campaignId,
    date: buildDate(blueprint.dateOffsetDays),
    startTime: buildTime(blueprint.startTime),
    endTime: buildTime(blueprint.endTime),
    locationId,
    status: blueprint.status || 'OPEN',
    attendanceRadiusMeters: blueprint.attendanceRadiusMeters || null,
  };

  const existingTask = await dbClient.task.findFirst({
    where: {
      campaignId,
      title: blueprint.title,
    },
  });

  if (existingTask) {
    return dbClient.task.update({
      where: {
        id: existingTask.id,
      },
      data,
    });
  }

  return dbClient.task.create({
    data,
  });
}

async function ensureAssignment(dbClient, volunteerId, taskId, assignmentData) {
  const existingAssignment = await dbClient.volunteerTask.findUnique({
    where: {
      volunteerId_taskId: {
        volunteerId,
        taskId,
      },
    },
  });

  if (existingAssignment) {
    return dbClient.volunteerTask.update({
      where: {
        volunteerId_taskId: {
          volunteerId,
          taskId,
        },
      },
      data: assignmentData,
    });
  }

  return dbClient.volunteerTask.create({
    data: {
      volunteerId,
      taskId,
      ...assignmentData,
    },
  });
}

async function ensureReport(dbClient, volunteerId, task, index) {
  const existingReport = await dbClient.report.findUnique({
    where: {
      volunteerId_taskId: {
        volunteerId,
        taskId: task.id,
      },
    },
  });

  const data = {
    volunteerId,
    taskId: task.id,
    campaignId: task.campaignId,
    notes: buildReportNotes(task.volunteer, task, index + 1),
    images: [buildPlaceholderImage(`sanad-report-${task.id}-${volunteerId}`, index % 4)],
    rating: 5,
    pointsAwarded: task.campaign?.reportPoints || 35,
  };

  if (existingReport) {
    return dbClient.report.update({
      where: {
        id: existingReport.id,
      },
      data,
    });
  }

  return dbClient.report.create({
    data,
  });
}

async function ensureSosRequest(dbClient, volunteerId, index) {
  const volunteer = await dbClient.volunteer.findUnique({
    where: {
      id: volunteerId,
    },
    select: {
      id: true,
      nationalId: true,
    },
  });
  const existingRequest = await dbClient.sosRequest.findFirst({
    where: {
      volunteerId,
    },
  });
  const coordinates = Object.values(DEMO_COORDINATES)[index % Object.values(DEMO_COORDINATES).length];
  const status = buildDemoSosStatus(volunteer, index);
  const data = {
    volunteerId,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    status,
    resolvedAt: ['RESOLVED', 'CANCELLED'].includes(status) ? new Date() : null,
  };

  if (existingRequest) {
    return dbClient.sosRequest.update({
      where: {
        id: existingRequest.id,
      },
      data,
    });
  }

  return dbClient.sosRequest.create({
    data,
  });
}

async function ensureCommunityPost(dbClient, volunteerId, content, image) {
  const existingPost = await dbClient.communityPost.findFirst({
    where: {
      volunteerId,
      content,
    },
  });

  if (existingPost) {
    return dbClient.communityPost.update({
      where: {
        id: existingPost.id,
      },
      data: {
        image,
      },
    });
  }

  return dbClient.communityPost.create({
    data: {
      volunteerId,
      content,
      image,
    },
  });
}

async function ensureCommunityComment(dbClient, postId, volunteerId, content) {
  const existingComment = await dbClient.communityPostComment.findFirst({
    where: {
      postId,
      volunteerId,
      content,
    },
  });

  if (existingComment) {
    return existingComment;
  }

  return dbClient.communityPostComment.create({
    data: {
      postId,
      volunteerId,
      content,
    },
  });
}

async function ensureCommunityLike(dbClient, postId, volunteerId) {
  const existingLike = await dbClient.communityPostLike.findUnique({
    where: {
      postId_volunteerId: {
        postId,
        volunteerId,
      },
    },
  });

  if (existingLike) {
    return existingLike;
  }

  return dbClient.communityPostLike.create({
    data: {
      postId,
      volunteerId,
    },
  });
}

async function buildSeedAssets(dbClient, adminUser) {
  const activeCampaign = await ensureCampaign(dbClient, adminUser.id, ACTIVE_CAMPAIGN_BLUEPRINT);
  const completedCampaigns = {};

  for (const campaignBlueprint of COMPLETED_CAMPAIGN_BLUEPRINTS) {
    completedCampaigns[campaignBlueprint.key] = await ensureCampaign(
      dbClient,
      adminUser.id,
      {
        ...campaignBlueprint,
        status: 'COMPLETED',
        attendanceRadiusMeters: 120,
        attendancePoints: 25,
        reportPoints: 35,
      },
    );
  }

  const activeTasks = [];

  for (const blueprint of ACTIVE_TASK_BLUEPRINTS) {
    activeTasks.push(
      await ensureTask(dbClient, activeCampaign.id, {
        ...blueprint,
        status: 'ASSIGNED',
      }),
    );
  }

  const completedTasks = [];

  for (const blueprint of COMPLETED_TASK_BLUEPRINTS) {
    completedTasks.push(
      await ensureTask(dbClient, completedCampaigns[blueprint.campaignKey].id, {
        ...blueprint,
        status: 'COMPLETED',
      }),
    );
  }

  return {
    activeCampaign,
    activeTasks,
    completedCampaigns,
    completedTasks,
  };
}

async function seedVolunteerRecord(dbClient, volunteer, index, assets) {
  const target = buildVolunteerTarget(index);
  const assignmentSummary = {
    activeAssignments: 0,
    completedAssignments: 0,
  };

  for (const task of assets.activeTasks) {
    await ensureAssignment(dbClient, volunteer.id, task.id, {
      status: 'ASSIGNED',
      checkInTime: null,
      checkOutTime: null,
      hoursWorked: 0,
      attendancePointsAwarded: 0,
    });
    assignmentSummary.activeAssignments += 1;
  }

  for (let taskIndex = 0; taskIndex < target.completedTaskCount; taskIndex += 1) {
    const task = assets.completedTasks[taskIndex];
    const baseHours = 4 + ((index + taskIndex) % 5) * 2;
    const checkInTime = new Date(task.date);
    checkInTime.setUTCHours(8 + (taskIndex % 3), 0, 0, 0);
    const checkOutTime = new Date(checkInTime.getTime() + baseHours * 60 * 60 * 1000);

    await ensureAssignment(dbClient, volunteer.id, task.id, {
      status: 'COMPLETED',
      checkInTime,
      checkOutTime,
      checkInLatitude: taskIndex % 2 === 0 ? DEMO_COORDINATES.dokki.latitude : DEMO_COORDINATES.maadi.latitude,
      checkInLongitude: taskIndex % 2 === 0 ? DEMO_COORDINATES.dokki.longitude : DEMO_COORDINATES.maadi.longitude,
      checkOutLatitude: taskIndex % 2 === 0 ? DEMO_COORDINATES.dokki.latitude : DEMO_COORDINATES.maadi.latitude,
      checkOutLongitude: taskIndex % 2 === 0 ? DEMO_COORDINATES.dokki.longitude : DEMO_COORDINATES.maadi.longitude,
      hoursWorked: baseHours,
      attendancePointsAwarded: 25,
    });

    await ensureReport(
      dbClient,
      volunteer.id,
      {
        ...task,
        campaign: COMPLETED_CAMPAIGN_BLUEPRINTS.find(
          (campaignBlueprint) =>
            assets.completedCampaigns[campaignBlueprint.key].id === task.campaignId,
        ) || { reportPoints: 35 },
        volunteer,
        location: COMPLETED_TASK_BLUEPRINTS[taskIndex]?.location || ACTIVE_TASK_BLUEPRINTS[0].location,
      },
      taskIndex,
    );

    assignmentSummary.completedAssignments += 1;
  }

  const nextVolunteerData = {
    points: Math.max(Number(volunteer.points) || 0, target.points),
    totalHours: Math.max(Number(volunteer.totalHours) || 0, target.totalHours),
  };

  if (volunteer.status === 'PENDING') {
    nextVolunteerData.status = 'ACTIVE';
  }

  await dbClient.volunteer.update({
    where: {
      id: volunteer.id,
    },
    data: nextVolunteerData,
  });

  await ensureSosRequest(dbClient, volunteer.id, index);
  const newlyAwardedBadges = await syncVolunteerBadges(dbClient, volunteer.id);

  return {
    volunteerId: volunteer.id,
    fullName: volunteer.fullName,
    points: nextVolunteerData.points,
    totalHours: nextVolunteerData.totalHours,
    badgesAwardedNow: newlyAwardedBadges.length,
    ...assignmentSummary,
  };
}

async function seedCommunity(dbClient, volunteers) {
  const postsToCreate = Math.max(DEMO_POST_TARGET, volunteers.length * 2);
  let createdOrUpdated = 0;

  for (let postIndex = 0; postIndex < postsToCreate; postIndex += 1) {
    const author = volunteers[postIndex % volunteers.length];
    const content = buildCommunityPostContent(author, postIndex);
    const image = buildPlaceholderImage(`sanad-community-${postIndex + 1}`, postIndex % 5);
    const post = await ensureCommunityPost(dbClient, author.id, content, image);
    createdOrUpdated += 1;

    const firstCommenter = volunteers[(postIndex + 1) % volunteers.length];
    const secondCommenter = volunteers[(postIndex + 2) % volunteers.length];
    const firstLiker = volunteers[(postIndex + 3) % volunteers.length];
    const secondLiker = volunteers[(postIndex + 4) % volunteers.length];

    await ensureCommunityComment(
      dbClient,
      post.id,
      firstCommenter.id,
      `تعليق ديمو من ${firstCommenter.fullName}: المجهود واضح والتنظيم ممتاز جدًا.`,
    );
    await ensureCommunityComment(
      dbClient,
      post.id,
      secondCommenter.id,
      `تعليق ديمو من ${secondCommenter.fullName}: شكرًا لكل الفريق على جودة التنفيذ.`,
    );
    await ensureCommunityLike(dbClient, post.id, firstLiker.id);
    await ensureCommunityLike(dbClient, post.id, secondLiker.id);
  }

  return {
    postsTarget: postsToCreate,
    postsProcessed: createdOrUpdated,
  };
}

async function getOverview() {
  const today = startOfUtcDay(0);
  const [volunteers, counts] = await Promise.all([
    prisma.volunteer.findMany({
      orderBy: [
        { points: 'desc' },
        { totalHours: 'desc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        fullName: true,
        nationalId: true,
        status: true,
        points: true,
        totalHours: true,
        _count: {
          select: {
            assignedTasks: true,
            reports: true,
            sosRequests: true,
            volunteerBadges: true,
            communityPosts: true,
          },
        },
        assignedTasks: {
          select: {
            task: {
              select: {
                date: true,
              },
            },
          },
        },
      },
    }),
    Promise.all([
      prisma.announcement.count(),
      prisma.campaign.count(),
      prisma.task.count(),
      prisma.report.count(),
      prisma.communityPost.count(),
      prisma.communityPostComment.count(),
      prisma.sosRequest.count(),
    ]),
  ]);

  return {
    message: 'تم جلب ملخص بيانات الديمو بنجاح',
    overview: {
      volunteers: {
        total: volunteers.length,
        active: volunteers.filter((volunteer) => volunteer.status === 'ACTIVE').length,
        withPoints: volunteers.filter((volunteer) => (Number(volunteer.points) || 0) > 0).length,
        withHours: volunteers.filter((volunteer) => (Number(volunteer.totalHours) || 0) > 0).length,
        withReports: volunteers.filter((volunteer) => (volunteer._count?.reports || 0) > 0).length,
        withBadges: volunteers.filter(
          (volunteer) => (volunteer._count?.volunteerBadges || 0) > 0,
        ).length,
        withSosRequests: volunteers.filter(
          (volunteer) => (volunteer._count?.sosRequests || 0) > 0,
        ).length,
        withUpcomingTasks: volunteers.filter((volunteer) =>
          (volunteer.assignedTasks || []).some((assignment) => assignment.task?.date >= today),
        ).length,
      },
      resources: {
        announcements: counts[0],
        campaigns: counts[1],
        tasks: counts[2],
        reports: counts[3],
        communityPosts: counts[4],
        communityComments: counts[5],
        sosRequests: counts[6],
      },
      sampleVolunteers: volunteers.slice(0, 12).map((volunteer) => ({
        id: volunteer.id,
        fullName: volunteer.fullName,
        nationalId: volunteer.nationalId,
        status: volunteer.status,
        points: volunteer.points,
        totalHours: volunteer.totalHours,
        assignedTasks: volunteer._count?.assignedTasks || 0,
        reports: volunteer._count?.reports || 0,
        communityPosts: volunteer._count?.communityPosts || 0,
        sosRequests: volunteer._count?.sosRequests || 0,
        badges: volunteer._count?.volunteerBadges || 0,
      })),
    },
  };
}

async function seedAllVolunteers(adminUser) {
  if (!adminUser?.id) {
    throw new AppError('المستخدم الحالي غير صالح لتشغيل بيانات الديمو', 401);
  }

  await ensureDefaultBadges(prisma);

  const volunteers = await prisma.volunteer.findMany({
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      status: true,
      points: true,
      totalHours: true,
    },
  });

  if (volunteers.length === 0) {
    throw new AppError('لا يوجد أي حسابات متطوعين مسجلة حاليًا', 404);
  }

  for (const announcement of DEMO_ANNOUNCEMENTS) {
    await ensureAnnouncement(prisma, announcement);
  }

  const assets = await buildSeedAssets(prisma, adminUser);
  const volunteerResults = [];

  for (const [index, volunteer] of volunteers.entries()) {
    volunteerResults.push(await seedVolunteerRecord(prisma, volunteer, index, assets));
  }

  const community = await seedCommunity(prisma, volunteers);
  const overview = await getOverview();

  return {
    message: 'تم ملء بيانات الديمو لكل الحسابات بنجاح',
    seed: {
      volunteersProcessed: volunteers.length,
      community,
      assignmentsSeeded: volunteerResults.reduce(
        (total, item) => total + item.activeAssignments + item.completedAssignments,
        0,
      ),
      reportsSeeded: volunteerResults.reduce(
        (total, item) => total + item.completedAssignments,
        0,
      ),
    },
    ...overview,
  };
}

async function cleanupDemoCommunityPosts() {
  const demoPosts = await prisma.communityPost.findMany({
    where: {
      image: {
        contains: 'sanad-community-',
      },
    },
    select: {
      id: true,
    },
  });

  if (demoPosts.length === 0) {
    return {
      message: 'لا توجد منشورات ديمو للحذف',
      deletedPosts: 0,
    };
  }

  const postIds = demoPosts.map((post) => post.id);

  await prisma.$transaction([
    prisma.communityPostLike.deleteMany({
      where: {
        postId: {
          in: postIds,
        },
      },
    }),
    prisma.communityPostComment.deleteMany({
      where: {
        postId: {
          in: postIds,
        },
      },
    }),
    prisma.communityPost.deleteMany({
      where: {
        id: {
          in: postIds,
        },
      },
    }),
  ]);

  return {
    message: 'تم حذف منشورات الديمو بنجاح',
    deletedPosts: postIds.length,
  };
}

module.exports = {
  cleanupDemoCommunityPosts,
  getOverview,
  seedAllVolunteers,
};
