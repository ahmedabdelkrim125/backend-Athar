const AppError = require('../utils/app-error');

const DEFAULT_DEMO_ADMIN_NATIONAL_IDS = ['30410018800673'];

function normalizeNationalIds(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDemoAdminNationalIds() {
  const configuredIds = normalizeNationalIds(process.env.DEMO_ADMIN_NATIONAL_IDS);
  return new Set(
    configuredIds.length > 0 ? configuredIds : DEFAULT_DEMO_ADMIN_NATIONAL_IDS,
  );
}

function isDemoAdmin(user) {
  if (!user?.nationalId) {
    return false;
  }

  return getDemoAdminNationalIds().has(String(user.nationalId));
}

function requireDemoAdmin(req, _res, next) {
  if (!isDemoAdmin(req.user)) {
    next(new AppError('غير مسموح لك بالوصول إلى أدوات الديمو', 403));
    return;
  }

  next();
}

module.exports = {
  isDemoAdmin,
  requireDemoAdmin,
};
