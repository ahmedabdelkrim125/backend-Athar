const AppError = require('../utils/app-error');
const { parsePositiveInteger } = require('./resource.validators');

function validatePagination(query = {}) {
  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;

  if (limit > 100) {
    throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  }

  return { page, limit, skip: (page - 1) * limit };
}

function validateDevicePayload(payload = {}) {
  const fcmToken = typeof payload.fcmToken === 'string' ? payload.fcmToken.trim() : '';
  const platform = typeof payload.platform === 'string' ? payload.platform.trim().toLowerCase() : '';

  if (!fcmToken || fcmToken.length > 512) {
    throw new AppError('fcmToken مطلوب ويجب ألا يتجاوز 512 حرفًا', 400);
  }

  if (!['android', 'ios', 'web'].includes(platform)) {
    throw new AppError('platform يجب أن تكون android أو ios أو web', 400);
  }

  return { fcmToken, platform };
}

function validateDeviceDeletePayload(payload = {}) {
  const fcmToken = typeof payload.fcmToken === 'string' ? payload.fcmToken.trim() : '';

  if (!fcmToken || fcmToken.length > 512) {
    throw new AppError('fcmToken مطلوب', 400);
  }

  return { fcmToken };
}

module.exports = {
  validateDeviceDeletePayload,
  validateDevicePayload,
  validatePagination,
};
