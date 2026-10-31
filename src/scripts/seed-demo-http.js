#!/usr/bin/env node

const API_BASE = (process.env.SEED_API_BASE_URL || 'https://sanad-app-production.up.railway.app/api')
  .replace(/\/+$/, '');

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || '12345678';
const OWNER = {
  nationalId: process.env.SEED_OWNER_NATIONAL_ID || '30410018800673',
  password: process.env.SEED_OWNER_PASSWORD || DEFAULT_PASSWORD,
};

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80';

const DEMO_COORDINATES = {
  october: { latitude: 29.9769, longitude: 30.9470 },
  maadi: { latitude: 29.9602, longitude: 31.2569 },
  heliopolis: { latitude: 30.0918, longitude: 31.3302 },
  faisal: { latitude: 30.0176, longitude: 31.2017 },
  dokki: { latitude: 30.0412, longitude: 31.2094 },
};

const demoVolunteers = [
  {
    fullName: 'محمد السيد',
    nationalId: '30111011001122',
    email: 'mohamed.elsayed@sanad.demo',
    phone: '201111000122',
    dateOfBirth: '1998-11-01',
    gender: 'MALE',
    city: 'الجيزة',
  },
  {
    fullName: 'سارة أحمد',
    nationalId: '30111011001133',
    email: 'sarah.ahmed@sanad.demo',
    phone: '201111000133',
    dateOfBirth: '1999-06-12',
    gender: 'FEMALE',
    city: 'القاهرة',
  },
  {
    fullName: 'خالد عمر',
    nationalId: '30111011001144',
    email: 'khaled.omar@sanad.demo',
    phone: '201111000144',
    dateOfBirth: '1997-04-19',
    gender: 'MALE',
    city: 'الجيزة',
  },
  {
    fullName: 'فاطمة علي',
    nationalId: '30111011001155',
    email: 'fatma.ali@sanad.demo',
    phone: '201111000155',
    dateOfBirth: '2000-02-28',
    gender: 'FEMALE',
    city: 'القاهرة',
  },
  {
    fullName: 'عمر حسن',
    nationalId: '30111011001166',
    email: 'omar.hassan@sanad.demo',
    phone: '201111000166',
    dateOfBirth: '1996-09-14',
    gender: 'MALE',
    city: 'الجيزة',
  },
  {
    fullName: 'كريم أحمد',
    nationalId: '30111011001177',
    email: 'karim.ahmed@sanad.demo',
    phone: '201111000177',
    dateOfBirth: '2001-01-20',
    gender: 'MALE',
    city: 'القاهرة',
  },
];

const announcements = [
  {
    title: 'تحديث جديد في تطبيق سند',
    content: 'أضفنا هذا الأسبوع تحسينات على الهوم والبروفايل ولوحة المجتمع لتظهر بيانات المتطوعين بشكل مباشر وأكثر حيوية.',
    isPinned: true,
    image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'حملة التوعية الجديدة في الجيزة',
    content: 'شارك في تحسين الوعي المجتمعي داخل المناطق السكنية وساعد الفريق في تنظيم نقاط الاستقبال والمتابعة.',
    isPinned: true,
    image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'موعد حملة توزيع الكراتين الجمعة القادمة',
    content: 'تم فتح مهام ميدانية لفرز الصناديق وتجهيز نقاط التسليم والمتابعة النهائية داخل نطاق أكتوبر والمعادي.',
    isPinned: false,
    image: 'https://images.unsplash.com/photo-1469571486292-b53601010376?auto=format&fit=crop&w=1200&q=80',
  },
];

function formatDate(offsetDays) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function nowIso(hoursOffset = 0) {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  const expectedStatuses = options.expectedStatuses || [200];

  if (!expectedStatuses.includes(response.status)) {
    const error = new Error(payload.message || `HTTP ${response.status} ${path}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function login(nationalId, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { nationalId, password },
    expectedStatuses: [200],
  });
}

async function loginOrRegister(account) {
  try {
    return await login(account.nationalId, DEFAULT_PASSWORD);
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }
  }

  try {
    await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        ...account,
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
      },
      expectedStatuses: [201],
    });
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }
  }

  return login(account.nationalId, DEFAULT_PASSWORD);
}

async function listAll(path, token, dataKey) {
  const payload = await apiRequest(`${path}${path.includes('?') ? '&' : '?'}page=1&limit=100`, {
    token,
  });

  return payload[dataKey] || [];
}

async function ensureAnnouncement(token, announcement) {
  const existing = await listAll('/announcements', token, 'announcements');
  const matched = existing.find((item) => item.title === announcement.title);

  if (matched) {
    return matched;
  }

  const created = await apiRequest('/announcements', {
    method: 'POST',
    token,
    body: announcement,
    expectedStatuses: [201],
  });

  return created.announcement;
}

async function ensureCampaign(token, title, payload) {
  const campaigns = await listAll('/campaigns?mine=true', token, 'campaigns');
  const matched = campaigns.find((campaign) => campaign.title === title);

  if (matched) {
    return matched;
  }

  const created = await apiRequest('/campaigns', {
    method: 'POST',
    token,
    body: payload,
    expectedStatuses: [201],
  });

  return created.campaign;
}

async function listCampaignTasks(token, campaignId) {
  return listAll(`/tasks?campaignId=${campaignId}`, token, 'tasks');
}

async function ensureTask(token, campaignId, title, payload) {
  const tasks = await listCampaignTasks(token, campaignId);
  const matched = tasks.find((task) => task.title === title);

  if (matched) {
    return matched;
  }

  const created = await apiRequest('/tasks', {
    method: 'POST',
    token,
    body: {
      ...payload,
      campaignId,
    },
    expectedStatuses: [201],
  });

  return created.task;
}

async function ensureAssignment(ownerToken, taskId, volunteerId, status = 'ASSIGNED') {
  const assignmentsPayload = await apiRequest(`/tasks/${taskId}/assignments`, {
    token: ownerToken,
  });
  const matched = (assignmentsPayload.assignments || []).find(
    (assignment) => assignment.volunteerId === volunteerId,
  );

  if (matched) {
    return matched;
  }

  const created = await apiRequest(`/tasks/${taskId}/assignments`, {
    method: 'POST',
    token: ownerToken,
    body: {
      volunteerId,
      status,
    },
    expectedStatuses: [201],
  });

  return created.assignment;
}

async function ensureCheckIn(token, taskId, coordinates) {
  try {
    return await apiRequest(`/attendance/tasks/${taskId}/check-in`, {
      method: 'POST',
      token,
      body: coordinates,
      expectedStatuses: [200],
    });
  } catch (error) {
    if (error.status === 409) {
      return null;
    }

    throw error;
  }
}

async function ensureReport(token, taskId, campaignId, notes, imageUrl) {
  const reports = await listAll(`/reports?mine=true&taskId=${taskId}`, token, 'reports');
  const existing = reports.find((report) => report.taskId === taskId);

  if (existing) {
    return existing;
  }

  const created = await apiRequest('/reports', {
    method: 'POST',
    token,
    body: {
      taskId,
      campaignId,
      notes,
      rating: 5,
      images: imageUrl ? [imageUrl] : [],
    },
    expectedStatuses: [201],
  });

  return created.report;
}

async function ensureCommunityPost(token, content, image) {
  const feed = await listAll('/community/feed', token, 'posts');
  const existing = feed.find((post) => post.content === content);

  if (existing) {
    return existing;
  }

  const created = await apiRequest('/community/posts', {
    method: 'POST',
    token,
    body: {
      content,
      image,
    },
    expectedStatuses: [201],
  });

  return created.post;
}

async function ensureComment(token, postId, content) {
  const commentsPayload = await apiRequest(`/community/posts/${postId}/comments`, {
    token,
  });
  const existing = (commentsPayload.comments || []).find((comment) => comment.content === content);

  if (existing) {
    return existing;
  }

  const created = await apiRequest(`/community/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: { content },
    expectedStatuses: [201],
  });

  return created.comment;
}

async function ensureLike(token, postId) {
  const feed = await listAll('/community/feed', token, 'posts');
  const existing = feed.find((post) => post.id === postId);

  if (existing?.likedByMe) {
    return existing;
  }

  return apiRequest(`/community/posts/${postId}/like`, {
    method: 'POST',
    token,
    expectedStatuses: [200],
  });
}

async function ensureSosRequest(token, coordinates) {
  const requestsPayload = await apiRequest('/sos-requests?mine=true&page=1&limit=20', {
    token,
  });
  const activeRequest = (requestsPayload.requests || []).find((request) =>
    ['OPEN', 'RESPONDED'].includes(request.status),
  );

  if (activeRequest) {
    return activeRequest;
  }

  const created = await apiRequest('/sos-requests', {
    method: 'POST',
    token,
    body: coordinates,
    expectedStatuses: [201],
  });

  return created.request;
}

async function seedHomeAnnouncements(ownerToken) {
  for (const announcement of announcements) {
    await ensureAnnouncement(ownerToken, announcement);
  }
}

async function seedUpcomingHomeTasks(ownerToken, ownerId) {
  const campaign = await ensureCampaign(ownerToken, 'ديمو الهوم - أبريل', {
    title: 'ديمو الهوم - أبريل',
    description:
      'حملة ميدانية تجريبية لتغذية الصفحة الرئيسية بمهام اليوم والمهام القادمة والإعلانات الميدانية.',
    coverImage:
      'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
    startDate: formatDate(0),
    endDate: formatDate(7),
    startTime: '09:00',
    endTime: '18:00',
    status: 'ACTIVE',
    attendanceRadiusMeters: 120,
    attendancePoints: 25,
    reportPoints: 35,
    location: {
      name: 'نقطة تنسيق أكتوبر',
      city: 'الجيزة',
      area: 'أكتوبر',
      ...DEMO_COORDINATES.october,
    },
  });

  const tasks = [
    {
      title: 'منطقة أكتوبر السكنية',
      description: 'مهمة ميدانية سريعة لتجهيز نقطة الاستقبال وتنسيق مسار دخول المتطوعين.',
      date: formatDate(0),
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
      description: 'دعم لوجستي وتوزيع الأدوات ومتابعة حالة الحضور داخل النقطة الميدانية.',
      date: formatDate(0),
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
      description: 'تغطية ميدانية ومساندة فريق التوعية داخل نطاق مصر الجديدة.',
      date: formatDate(1),
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

  for (const task of tasks) {
    const createdTask = await ensureTask(ownerToken, campaign.id, task.title, task);
    await ensureAssignment(ownerToken, createdTask.id, ownerId);
  }

  return campaign;
}

async function seedCompletedOwnerTasks(ownerToken, ownerId) {
  const campaign = await ensureCampaign(ownerToken, 'ديمو الإنجازات - أبريل', {
    title: 'ديمو الإنجازات - أبريل',
    description:
      'حملة تجريبية لرفع الساعات والنقاط الفعلية للمستخدم وإظهار الإنجازات والشهادات في الحساب.',
    coverImage:
      'https://images.unsplash.com/photo-1469571486292-b53601010376?auto=format&fit=crop&w=1200&q=80',
    startDate: formatDate(-5),
    endDate: formatDate(-1),
    startTime: '08:00',
    endTime: '20:00',
    status: 'COMPLETED',
    attendanceRadiusMeters: 100,
    attendancePoints: 30,
    reportPoints: 30,
    location: {
      name: 'جمعية الدقي الخيرية',
      city: 'الجيزة',
      area: 'الدقي',
      ...DEMO_COORDINATES.dokki,
    },
  });

  for (let index = 0; index < 5; index += 1) {
    const task = await ensureTask(
      ownerToken,
      campaign.id,
      `سجل الإنجاز الميداني ${index + 1}`,
      {
        title: `سجل الإنجاز الميداني ${index + 1}`,
        description:
          'مهمة مطولة لرفع الساعات الفعلية داخل الحساب وإظهار البيانات الواقعية في الصفحة الرئيسية.',
        date: formatDate(index - 5),
        startTime: '00:00',
        endTime: '23:59',
        location: {
          name: `نقطة الإنجاز ${index + 1}`,
          city: 'الجيزة',
          area: 'الدقي',
          ...DEMO_COORDINATES.dokki,
        },
      },
    );

    await ensureAssignment(ownerToken, task.id, ownerId);
    await ensureCheckIn(ownerToken, task.id, DEMO_COORDINATES.dokki);
    await ensureReport(
      ownerToken,
      task.id,
      campaign.id,
      `تقرير ديمو للمهمة ${index + 1} يوضح اكتمال التنفيذ والمخرجات الميدانية.`,
      FALLBACK_IMAGE,
    );
  }

  return campaign;
}

async function seedCommunity(volunteerTokens) {
  const [ownerToken, mohamedToken, sarahToken] = volunteerTokens;

  const postOne = await ensureCommunityPost(
    mohamedToken,
    'حملة النهارده في أكتوبر كانت منظمة جدًا، والناس تعاونت بشكل ممتاز. فخور إننا بنكبر خطوة بخطوة مع سند.',
    'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80',
  );

  const postTwo = await ensureCommunityPost(
    sarahToken,
    'أول مرة أشارك في مهمة التوعية وكانت التجربة جميلة جدًا. شكرًا للفريق على التنظيم والدعم من البداية للنهاية.',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
  );

  await ensureComment(ownerToken, postOne.id, 'مجهود رائع جدًا، واضح إن الفريق كان منظم ومركز.');
  await ensureComment(sarahToken, postOne.id, 'الصور والمخرجات ممتازة، استمروا على نفس المستوى.');
  await ensureComment(mohamedToken, postTwo.id, 'بداية قوية جدًا، منتظرين مشاركات أكتر الفترة الجاية.');

  await ensureLike(ownerToken, postOne.id);
  await ensureLike(sarahToken, postOne.id);
  await ensureLike(ownerToken, postTwo.id);
  await ensureLike(mohamedToken, postTwo.id);
}

async function seedSos(ownerToken) {
  await ensureSosRequest(ownerToken, DEMO_COORDINATES.maadi);
}

async function verify(ownerToken) {
  const [home, profile, community, announcementsPayload, authMe, sos] = await Promise.all([
    apiRequest('/home', { token: ownerToken }),
    apiRequest('/profile', { token: ownerToken }),
    apiRequest('/community/feed?page=1&limit=5', { token: ownerToken }),
    apiRequest('/announcements?page=1&limit=5', { token: ownerToken }),
    apiRequest('/auth/me', { token: ownerToken }),
    apiRequest('/sos-requests?mine=true&page=1&limit=5', { token: ownerToken }),
  ]);

  return {
    home: {
      announcements: home.summary.announcements.length,
      todayTasks: home.summary.todayTasks.length,
      upcomingTasks: home.summary.upcomingTasks.length,
      points: home.summary.stats.points,
      totalHours: home.summary.stats.totalHours,
    },
    profile: {
      currentRank: profile.profile.leaderboard.currentUserRank,
      points: profile.profile.stats.points,
      totalHours: profile.profile.stats.totalHours,
      certificates: profile.profile.certificates.count,
      achievements: profile.profile.achievements.achievedCount,
    },
    community: {
      featuredAnnouncement: Boolean(community.featuredAnnouncement),
      posts: community.posts.length,
    },
    announcements: announcementsPayload.pagination.total,
    auth: {
      points: authMe.user.points,
      totalHours: authMe.user.totalHours,
      assignedTasks: authMe.user.stats.assignedTasks,
      badges: authMe.user.stats.badges,
    },
    sos: sos.pagination.total,
  };
}

async function main() {
  console.log(`Seeding demo data via ${API_BASE}`);

  const ownerSession = await login(OWNER.nationalId, OWNER.password);
  const ownerToken = ownerSession.accessToken;
  const ownerId = ownerSession.user.id;

  const volunteerSessions = [];

  for (const volunteer of demoVolunteers) {
    const session = await loginOrRegister(volunteer);
    volunteerSessions.push(session);
  }

  await seedHomeAnnouncements(ownerToken);
  await seedUpcomingHomeTasks(ownerToken, ownerId);
  await seedCompletedOwnerTasks(ownerToken, ownerId);
  await seedCommunity([
    ownerToken,
    volunteerSessions[0].accessToken,
    volunteerSessions[1].accessToken,
  ]);
  await seedSos(ownerToken);

  const summary = await verify(ownerToken);

  console.log('Seed completed successfully.');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('Seed failed.');
  console.error(error.status || '');
  console.error(error.message || error);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
