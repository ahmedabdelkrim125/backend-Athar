const AppError = require('../utils/app-error');
const { parseCoordinatesQuery, parsePositiveInteger } = require('./resource.validators');

const INCIDENT_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
  'FALSE_ALARM',
];

function validateDeviceTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    throw new AppError('deviceTimestamp مطلوب لإثبات حداثة الموقع', 400);
  }
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new AppError('deviceTimestamp غير صالح', 400);
  }
  const age = Date.now() - timestamp.getTime();
  if (age > 5 * 60 * 1000) {
    throw new AppError('إحداثيات الموقع أقدم من الحد المسموح (5 دقائق)', 400);
  }
  if (age < -2 * 60 * 1000) {
    throw new AppError('deviceTimestamp لا يمكن أن يكون في المستقبل', 400);
  }
  return timestamp;
}

function validateCreateIncidentPayload(payload = {}, options = {}) {
  const coordinates = parseCoordinatesQuery(payload);
  if (!coordinates) throw new AppError('يجب إرسال latitude و longitude صالحين', 400);
  const hasAccuracy =
    payload.accuracy !== undefined && payload.accuracy !== null && payload.accuracy !== '';
  if (!hasAccuracy && !options.allowMissingAccuracy) {
    throw new AppError('accuracy مطلوب ويجب أن يكون بين 0 و10000 متر', 400);
  }
  const accuracy =
    options.allowMissingAccuracy && !hasAccuracy
      ? null
      : Number(payload.accuracy);
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000)) {
    throw new AppError('accuracy يجب أن تكون بين 0 و1000 متر لبلاغ الطوارئ', 400);
  }
  const message =
    payload.message === undefined || payload.message === null
      ? null
      : typeof payload.message === 'string'
        ? payload.message.trim()
        : '';
  if (message === '' && payload.message !== undefined && payload.message !== null) {
    throw new AppError('message يجب أن يكون نصًا غير فارغ', 400);
  }
  if (message && message.length > 2000) {
    throw new AppError('message يجب ألا يتجاوز 2000 حرف', 400);
  }
  const missionId = parsePositiveInteger(payload.missionId, 'معرف المهمة', {
    required: false,
  });
  const deviceTimestamp = validateDeviceTimestamp(payload.deviceTimestamp);
  return { ...coordinates, accuracy, message, missionId, deviceTimestamp };
}

function validateLocationUpdatePayload(payload = {}) {
  const validated = validateCreateIncidentPayload(payload);
  if (validated.missionId || validated.message) {
    throw new AppError('تحديث موقع الطوارئ يقبل الإحداثيات والدقة ووقت الجهاز فقط', 400);
  }
  return validated;
}

function validateMissionLocationUpdatePayload(payload = {}) {
  const coordinates = parseCoordinatesQuery(payload);
  if (!coordinates) throw new AppError('يجب إرسال latitude و longitude صالحين', 400);
  if (payload.accuracy === undefined || payload.accuracy === null || payload.accuracy === '') {
    throw new AppError('accuracy مطلوب ويجب أن يكون بين 0 و10000 متر', 400);
  }
  const accuracy = Number(payload.accuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000) {
    throw new AppError('accuracy يجب أن تكون بين 0 و10000 متر', 400);
  }
  const missionId = parsePositiveInteger(payload.missionId, 'معرف المهمة');
  const deviceTimestamp = validateDeviceTimestamp(payload.deviceTimestamp);
  return { ...coordinates, accuracy, missionId, deviceTimestamp };
}

function validateIncidentStatusPayload(payload = {}) {
  const status = typeof payload.status === 'string' ? payload.status.toUpperCase() : '';
  if (!INCIDENT_STATUSES.includes(status)) {
    throw new AppError('حالة البلاغ غير صالحة', 400);
  }
  const notes =
    payload.notes === undefined || payload.notes === null
      ? null
      : typeof payload.notes === 'string'
        ? payload.notes.trim()
        : '';
  if (notes === '' && payload.notes !== undefined && payload.notes !== null) {
    throw new AppError('notes يجب أن يكون نصًا غير فارغ', 400);
  }
  if (['CLOSED', 'CANCELLED', 'FALSE_ALARM'].includes(status) && (!notes || notes.length < 3)) {
    throw new AppError('ملاحظات الإغلاق أو البلاغ الخاطئ مطلوبة', 400);
  }
  if (notes && notes.length > 2000) {
    throw new AppError('notes يجب ألا يتجاوز 2000 حرف', 400);
  }
  return { status, notes };
}

function validateCancelIncidentPayload(payload = {}) {
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (reason.length < 3 || reason.length > 1000) {
    throw new AppError('سبب الإلغاء مطلوب ويجب أن يكون بين 3 و1000 حرف', 400);
  }
  return { reason };
}

function validateIncidentListQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;
  if (limit > 100) throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  const status =
    query.status === undefined
      ? undefined
      : typeof query.status === 'string' && INCIDENT_STATUSES.includes(query.status.toUpperCase())
        ? query.status.toUpperCase()
        : (() => {
            throw new AppError('حالة البلاغ غير صالحة', 400);
          })();
  return {
    page,
    limit,
    status,
    volunteerId: parsePositiveInteger(query.volunteerId, 'المتطوع', { required: false }),
  };
}

function validateAdminVolunteerQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;
  if (limit > 100) throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) throw new AppError('البحث يجب ألا يتجاوز 100 حرف', 400);
  const statuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
  const status =
    query.status === undefined
      ? undefined
      : typeof query.status === 'string' && statuses.includes(query.status.toUpperCase())
        ? query.status.toUpperCase()
        : (() => {
            throw new AppError('حالة المتطوع غير صالحة', 400);
          })();
  const activity =
    query.activity === undefined
      ? undefined
      : typeof query.activity === 'string' &&
          ['ACTIVE', 'INACTIVE'].includes(query.activity.toUpperCase())
        ? query.activity.toUpperCase()
        : (() => {
            throw new AppError('فلتر النشاط غير صالح', 400);
          })();
  const titleLevel = parsePositiveInteger(query.titleLevel, 'مستوى اللقب', {
    required: false,
  });
  if (titleLevel !== undefined && titleLevel > 5) {
    throw new AppError('مستوى اللقب يجب أن يكون بين 1 و5', 400);
  }
  return { page, limit, search, status, activity, titleLevel };
}

function validateLocationAccessQuery(query = {}) {
  const reason = typeof query.reason === 'string' ? query.reason.trim() : '';
  if (reason.length < 10 || reason.length > 500) {
    throw new AppError('سبب الاطلاع مطلوب ويجب أن يكون بين 10 و500 حرف', 400);
  }
  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;
  if (limit > 100) throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 100) throw new AppError('البحث يجب ألا يتجاوز 100 حرف', 400);
  return {
    page,
    limit,
    search,
    reason,
  };
}

module.exports = {
  INCIDENT_STATUSES,
  validateAdminVolunteerQuery,
  validateCancelIncidentPayload,
  validateCreateIncidentPayload,
  validateIncidentListQuery,
  validateIncidentStatusPayload,
  validateLocationAccessQuery,
  validateMissionLocationUpdatePayload,
  validateLocationUpdatePayload,
};
