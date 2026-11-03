const test = require('node:test');
const assert = require('node:assert/strict');

const AppError = require('../src/utils/app-error');
const {
  canManageCampaignById,
  hasPermission,
} = require('../src/middleware/rbac.middleware');
const { isWithinTaskWindow } = require('../src/services/location-monitoring.service');
const { assertIncidentAccess } = require('../src/services/emergency.service');
const {
  validateCancelIncidentPayload,
  validateCreateIncidentPayload,
  validateIncidentStatusPayload,
  validateLocationAccessQuery,
  validateLocationUpdatePayload,
  validateMissionLocationUpdatePayload,
} = require('../src/validators/emergency.validators');

test('SOS payload validates coordinates, accuracy, optional mission, and timestamps', () => {
  const deviceTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
  const payload = validateCreateIncidentPayload({
    latitude: 30.0444,
    longitude: 31.2357,
    accuracy: 18,
    missionId: '12',
    deviceTimestamp,
  });
  assert.equal(payload.latitude, 30.0444);
  assert.equal(payload.longitude, 31.2357);
  assert.equal(payload.accuracy, 18);
  assert.equal(payload.missionId, 12);

  assert.throws(
    () => validateCreateIncidentPayload({ latitude: 91, longitude: 31, accuracy: 10 }),
    AppError,
  );
  assert.throws(
    () => validateCreateIncidentPayload({ latitude: 30, longitude: 31, accuracy: -1 }),
    AppError,
  );
  assert.throws(
    () => validateCreateIncidentPayload({ latitude: 30, longitude: 31, accuracy: 10, deviceTimestamp: 'bad' }),
    AppError,
  );
  assert.throws(
    () => validateCreateIncidentPayload({
      latitude: 30,
      longitude: 31,
      accuracy: 10,
      deviceTimestamp: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }),
    AppError,
  );
});

test('mission location updates require a mission and emergency updates exclude mission fields', () => {
  assert.equal(
    validateMissionLocationUpdatePayload({
      missionId: 7,
      latitude: 30,
      longitude: 31,
      accuracy: 25,
      deviceTimestamp: new Date().toISOString(),
    }).missionId,
    7,
  );
  assert.throws(
    () => validateMissionLocationUpdatePayload({
      latitude: 30,
      longitude: 31,
      accuracy: 25,
      deviceTimestamp: new Date().toISOString(),
    }),
    AppError,
  );
  assert.throws(
    () => validateLocationUpdatePayload({
      missionId: 7,
      latitude: 30,
      longitude: 31,
      accuracy: 25,
    }),
    AppError,
  );
});

test('emergency state changes require terminal-state notes and valid cancellation reason', () => {
  assert.deepEqual(validateIncidentStatusPayload({ status: 'IN_PROGRESS' }), {
    status: 'IN_PROGRESS',
    notes: null,
  });
  assert.throws(() => validateIncidentStatusPayload({ status: 'CLOSED' }), AppError);
  assert.equal(
    validateIncidentStatusPayload({ status: 'CLOSED', notes: 'تم التأكد من سلامة المتطوع' }).status,
    'CLOSED',
  );
  assert.throws(() => validateIncidentStatusPayload({ status: 'UNKNOWN' }), AppError);
  assert.throws(() => validateCancelIncidentPayload({ reason: 'لا' }), AppError);
  assert.equal(validateCancelIncidentPayload({ reason: 'تم حل المشكلة' }).reason, 'تم حل المشكلة');
});

test('location access requires an audit reason and bounded pagination', () => {
  assert.throws(() => validateLocationAccessQuery({}), AppError);
  assert.throws(() => validateLocationAccessQuery({ reason: 'سبب كافٍ', limit: 101 }), AppError);
  assert.deepEqual(
    validateLocationAccessQuery({ reason: 'متابعة بلاغ ميداني', page: '2', limit: '10' }),
    {
      page: 2,
      limit: 10,
      search: '',
      reason: 'متابعة بلاغ ميداني',
    },
  );
});

test('only separately authenticated admins can manage campaigns', async () => {
  const admin = { id: 8, role: 'ADMIN', accountType: 'ADMIN' };
  const volunteer = { id: 9, role: 'VOLUNTEER', accountType: 'VOLUNTEER' };
  const client = {
    admin: {
      findFirst: async () => admin,
    },
  };
  assert.equal(await canManageCampaignById(admin, { id: 3 }, client), true);
  assert.equal(await canManageCampaignById(volunteer, { id: 3 }, client), false);
  assert.equal(hasPermission(volunteer, 'volunteers:read'), false);
  assert.equal(hasPermission(admin, 'emergencies:manage'), true);
});

test('only separately authenticated admins can view emergency incidents', () => {
  const volunteer = { id: 8, role: 'VOLUNTEER', accountType: 'VOLUNTEER' };
  const admin = { id: 10, role: 'ADMIN', accountType: 'ADMIN' };
  assert.throws(
    () => assertIncidentAccess({ task: { campaign: { createdById: volunteer.id } } }, volunteer),
    { statusCode: 404 },
  );
  assert.doesNotThrow(() => assertIncidentAccess({ task: null }, admin));
});

test('mission location sharing is valid only during the approved task time window', () => {
  const task = {
    date: new Date('2026-11-08T00:00:00.000Z'),
    startTime: new Date('1970-01-01T10:00:00.000Z'),
    endTime: new Date('1970-01-01T12:00:00.000Z'),
  };
  assert.equal(isWithinTaskWindow(task, new Date('2026-11-08T11:00:00.000Z')), true);
  assert.equal(isWithinTaskWindow(task, new Date('2026-11-08T09:59:59.000Z')), false);
  assert.equal(isWithinTaskWindow(task, new Date('2026-11-08T12:00:01.000Z')), false);
});
