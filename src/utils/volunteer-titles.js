const AppError = require('../utils/app-error');

const REQUIRED_TITLE_LEVELS = [1, 2, 3, 4, 5];
const REQUIRED_THRESHOLDS = [
  'minPoints',
  'minHours',
  'minCompletedTasks',
  'minReports',
];

function validateVolunteerTitles(titles) {
  if (!Array.isArray(titles)) {
    throw new AppError('بيانات ألقاب المتطوعين غير صالحة', 500);
  }

  const containObjects = titles.every(
    (title) => title && typeof title === 'object' && !Array.isArray(title),
  );

  if (!containObjects) {
    throw new AppError('إعدادات ألقاب المتطوعين ناقصة أو غير صالحة', 500);
  }

  const levels = titles.map((title) => title.level);
  const hasAllLevels = REQUIRED_TITLE_LEVELS.every((level) => levels.includes(level));
  const hasUniqueLevels = new Set(levels).size === levels.length;
  const areValid = titles.every(
    (title) =>
      Number.isInteger(title.id) &&
      typeof title.name === 'string' &&
      title.name.trim().length > 0 &&
      Number.isInteger(title.level) &&
      typeof title.description === 'string' &&
      title.description.trim().length > 0 &&
      typeof title.icon === 'string' &&
      title.icon.trim().length > 0 &&
      REQUIRED_THRESHOLDS.every(
        (key) => Number.isInteger(title[key]) && title[key] >= 0,
      ),
  );

  if (
    titles.length !== REQUIRED_TITLE_LEVELS.length ||
    !hasAllLevels ||
    !hasUniqueLevels ||
    !areValid
  ) {
    throw new AppError('إعدادات ألقاب المتطوعين ناقصة أو غير صالحة', 500);
  }

  return [...titles].sort((left, right) => left.level - right.level);
}

function serializeVolunteerTitle(title) {
  if (!title) {
    return null;
  }

  return {
    id: title.id,
    name: title.name,
    level: title.level,
    description: title.description,
    icon: title.icon,
  };
}

function resolveVolunteerTitle(metrics, titles) {
  if (!Array.isArray(titles) || titles.length !== REQUIRED_TITLE_LEVELS.length) {
    throw new AppError('بيانات ألقاب المتطوعين غير صالحة', 500);
  }

  const actualPoints = Number(metrics.points) || 0;
  const totalHours = Number(metrics.totalHours) || 0;
  const completedTasks = Number(metrics.completedTasksCount) || 0;
  const reportsCount = Number(metrics.reportsCount) || 0;

  const currentTitle = titles
    .filter(
      (title) =>
        actualPoints >= title.minPoints &&
        totalHours >= title.minHours &&
        completedTasks >= title.minCompletedTasks &&
        reportsCount >= title.minReports,
    )
    .pop() || titles[0];

  return serializeVolunteerTitle(currentTitle);
}

module.exports = {
  resolveVolunteerTitle,
  serializeVolunteerTitle,
  validateVolunteerTitles,
};
