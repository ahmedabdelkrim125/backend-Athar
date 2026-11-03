const AppError = require('../utils/app-error');
const {
  parseCoordinatesQuery,
  parsePositiveInteger,
} = require('./resource.validators');

const MAX_NEARBY_RADIUS_METERS = 50000;

function validateNearbyMissionsQuery(query = {}) {
  const coordinates = parseCoordinatesQuery(query);

  if (!coordinates) {
    throw new AppError('يجب إرسال latitude و longitude', 400);
  }

  const radiusMeters = query.radiusMeters === undefined ? 10000 : Number(query.radiusMeters);

  if (
    !Number.isInteger(radiusMeters) ||
    radiusMeters < 1 ||
    radiusMeters > MAX_NEARBY_RADIUS_METERS
  ) {
    throw new AppError(`radiusMeters يجب أن يكون بين 1 و${MAX_NEARBY_RADIUS_METERS}`, 400);
  }
  const accuracyMeters =
    query.accuracyMeters === undefined ? undefined : Number(query.accuracyMeters);
  if (
    accuracyMeters !== undefined &&
    (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10000)
  ) {
    throw new AppError('accuracyMeters يجب أن تكون بين 0 و10000', 400);
  }

  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;

  if (limit > 100) {
    throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  }

  return {
    ...coordinates,
    radiusMeters,
    accuracyMeters,
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function validateMissionApprovalPayload(payload = {}) {
  const status = typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';

  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    throw new AppError('حالة اعتماد المهمة غير صالحة', 400);
  }

  return { status };
}

module.exports = {
  MAX_NEARBY_RADIUS_METERS,
  validateMissionApprovalPayload,
  validateNearbyMissionsQuery,
};
