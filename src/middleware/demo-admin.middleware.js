const AppError = require('../utils/app-error');

function isDemoAdmin(user) {
  return user?.accountType === 'ADMIN' && user?.role === 'ADMIN';
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
