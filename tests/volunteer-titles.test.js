const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLeaderboardRows,
  collectVolunteerMetrics,
} = require('../src/utils/profile-helpers');
const {
  resolveVolunteerTitle,
  validateVolunteerTitles,
} = require('../src/utils/volunteer-titles');

const titles = validateVolunteerTitles([
  {
    id: 1,
    name: 'متطوع مبتدئ',
    level: 1,
    description: 'بداية الرحلة التطوعية.',
    icon: 'seedling',
    minPoints: 0,
    minHours: 0,
    minCompletedTasks: 0,
    minReports: 0,
  },
  {
    id: 2,
    name: 'صانع الخير',
    level: 2,
    description: 'مساهمات موثقة.',
    icon: 'heart',
    minPoints: 100,
    minHours: 1,
    minCompletedTasks: 1,
    minReports: 1,
  },
  {
    id: 3,
    name: 'متطوع متميز',
    level: 3,
    description: 'مشاركات فعالة.',
    icon: 'star',
    minPoints: 300,
    minHours: 10,
    minCompletedTasks: 5,
    minReports: 5,
  },
  {
    id: 4,
    name: 'قائد الأثر',
    level: 4,
    description: 'مساهمة قيادية.',
    icon: 'flag',
    minPoints: 750,
    minHours: 30,
    minCompletedTasks: 20,
    minReports: 15,
  },
  {
    id: 5,
    name: 'سفير أثر',
    level: 5,
    description: 'أثر مستدام.',
    icon: 'crown',
    minPoints: 1500,
    minHours: 100,
    minCompletedTasks: 50,
    minReports: 40,
  },
]);

function metrics(overrides = {}) {
  return {
    points: 0,
    totalHours: 0,
    completedTasksCount: 0,
    reportsCount: 0,
    ...overrides,
  };
}

function completedVolunteer(id, points) {
  return {
    id,
    fullName: `Volunteer ${id}`,
    points,
    totalHours: 1,
    joinDate: new Date('2026-01-01T00:00:00.000Z'),
    reports: [{ id: id, campaignId: id, createdAt: new Date('2026-01-02T00:00:00.000Z') }],
    assignedTasks: [
      {
        id,
        status: 'COMPLETED',
        hoursWorked: 1,
        checkInTime: new Date('2026-01-02T08:00:00.000Z'),
        checkOutTime: new Date('2026-01-02T09:00:00.000Z'),
        task: { campaignId: id, date: new Date('2026-01-02T00:00:00.000Z') },
      },
    ],
    volunteerBadges: [],
  };
}

test('new volunteers receive the first title even with no achievements', () => {
  assert.deepEqual(
    resolveVolunteerTitle(metrics(), titles),
    {
      id: 1,
      name: 'متطوع مبتدئ',
      level: 1,
      description: 'بداية الرحلة التطوعية.',
      icon: 'seedling',
    },
  );
});

test('every configured requirement must be satisfied to advance a title', () => {
  assert.equal(
    resolveVolunteerTitle(metrics({ points: 500, totalHours: 20, reportsCount: 20 }), titles).level,
    1,
  );
  assert.equal(
    resolveVolunteerTitle(
      metrics({
        points: 100,
        totalHours: 1,
        completedTasksCount: 1,
        reportsCount: 1,
      }),
      titles,
    ).level,
    2,
  );
  assert.equal(
    resolveVolunteerTitle(metrics({ points: 100, totalHours: 1, reportsCount: 1 }), titles).level,
    1,
  );
});

test('title is recomputed from updated task, report, hours and point metrics', () => {
  const beforeCompletion = metrics();
  const afterCompletion = metrics({
    points: 100,
    totalHours: 1,
    completedTasksCount: 1,
    reportsCount: 1,
  });

  assert.equal(resolveVolunteerTitle(beforeCompletion, titles).level, 1);
  assert.equal(resolveVolunteerTitle(afterCompletion, titles).level, 2);
  assert.equal(
    resolveVolunteerTitle(
      metrics({ points: 300, totalHours: 10, completedTasksCount: 5, reportsCount: 5 }),
      titles,
    ).level,
    3,
  );
});

test('leaderboard preserves the scoring formula and returns actual points, rank and title separately', () => {
  const highScoreVolunteer = completedVolunteer(1, 100);
  const highPointsVolunteer = {
    ...completedVolunteer(2, 900),
    totalHours: 0,
    reports: [],
    assignedTasks: [],
  };
  const volunteers = [highScoreVolunteer, highPointsVolunteer];
  const expectedScores = volunteers.map((volunteer) => ({
    id: volunteer.id,
    score: collectVolunteerMetrics(volunteer, { period: 'all' }).score,
  }));
  assert.deepEqual(expectedScores, [
    { id: 1, score: 217 },
    { id: 2, score: 900 },
  ]);
  const expectedOrder = expectedScores
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.id);

  const rows = buildLeaderboardRows(volunteers, { period: 'all', titles });

  assert.deepEqual(rows.map((row) => row.id), expectedOrder);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2]);
  assert.equal(rows.find((row) => row.id === 1).points, 100);
  assert.equal(rows.find((row) => row.id === 2).points, 900);
  assert.ok(rows.every((row) => row.volunteerTitle && !('rankingScore' in row)));
});

test('invalid or incomplete title definitions fail explicitly', () => {
  assert.throws(
    () => validateVolunteerTitles(titles.slice(0, 4)),
    { message: 'إعدادات ألقاب المتطوعين ناقصة أو غير صالحة' },
  );
});
