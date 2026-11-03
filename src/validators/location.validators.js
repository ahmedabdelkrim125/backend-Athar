const AppError = require('../utils/app-error');
const { parseCoordinatesQuery } = require('./resource.validators');

function validateLocationSharingPayload(payload = {}) {
  if (typeof payload.enabled !== 'boolean') {
    throw new AppError('enabled يجب أن تكون true أو false', 400);
  }
  return { enabled: payload.enabled };
}

function validateVolunteerLocationPayload(payload = {}) {
  const coordinates = parseCoordinatesQuery(payload);
  if (!coordinates) {
    throw new AppError('latitude و longitude مطلوبان', 400);
  }
  const accuracyMeters = Number(payload.accuracyMeters);
  if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10000) {
    throw new AppError('accuracyMeters يجب أن تكون بين 0 و10000', 400);
  }
  return { ...coordinates, accuracyMeters };
}

module.exports = {
  validateLocationSharingPayload,
  validateVolunteerLocationPayload,
};
