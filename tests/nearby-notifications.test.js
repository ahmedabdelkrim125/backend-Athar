const test = require('node:test');
const assert = require('node:assert/strict');

const AppError = require('../src/utils/app-error');
const { isValidCronAuthorization } = require('../src/utils/cron-auth');
const {
  buildNearbyBounds,
  calculateHaversineDistanceMeters,
  sortAndPaginateNearbyMissions,
} = require('../src/utils/nearby-missions');
const {
  assertManualAssignmentUpdateAllowed,
  assertMissionCheckInEligible,
} = require('../src/utils/mission-checkin');
const { buildMissionReminderEventKey } = require('../src/services/notification.service');
const {
  isEligibleNearbyVolunteerLocation,
} = require('../src/services/volunteer-location.service');
const {
  validateDevicePayload,
} = require('../src/validators/notification.validators');
const {
  validateReportDecisionPayload,
} = require('../src/validators/report-review.validators');
const {
  validateLocationSharingPayload,
  validateVolunteerLocationPayload,
} = require('../src/validators/location.validators');
const {
  validateNearbyMissionsQuery,
} = require('../src/validators/mission.validators');

test('Haversine distance returns zero for same point and realistic equatorial distance', () => {
  assert.equal(calculateHaversineDistanceMeters(30, 31, 30, 31), 0);
  assert.ok(Math.abs(calculateHaversineDistanceMeters(0, 0, 0, 1) - 111195) < 100);
});

test('nearby bounds handle antimeridian and polar coordinates', () => {
  const acrossDateline = buildNearbyBounds(0, 179.9, 30000);
  assert.ok(acrossDateline.longitude.OR.length === 2);

  const nearPole = buildNearbyBounds(90, 0, 50000);
  assert.equal(nearPole.minLatitude, 90 - 50000 / 110000);
  assert.equal(nearPole.maxLatitude, 90);
  assert.equal(nearPole.longitude, null);
});

test('nearby results sort by distance then paginate', () => {
  const sorted = sortAndPaginateNearbyMissions(
    [
      { distanceMeters: 80, mission: { id: 2, date: '2026-11-04' } },
      { distanceMeters: 30, mission: { id: 3, date: '2026-11-05' } },
      { distanceMeters: 30, mission: { id: 1, date: '2026-11-04' } },
    ],
    2,
    1,
  );
  assert.equal(sorted.total, 3);
  assert.deepEqual(sorted.missions.map((mission) => mission.id), [3]);
});

test('nearby query validates coordinates, radius, and page bounds', () => {
  assert.throws(() => validateNearbyMissionsQuery({}), AppError);
  assert.throws(
    () => validateNearbyMissionsQuery({ latitude: 91, longitude: 30 }),
    AppError,
  );
  assert.throws(
    () => validateNearbyMissionsQuery({ latitude: 30, longitude: 31, radiusMeters: 50001 }),
    AppError,
  );
  assert.deepEqual(
    validateNearbyMissionsQuery({ latitude: 30, longitude: 31 }).radiusMeters,
    10000,
  );
});

test('check-in requires approval, accepted join request, an eligible status and task time', () => {
  const baseTask = {
    approvalStatus: 'APPROVED',
    status: 'OPEN',
    date: new Date('2026-11-03T00:00:00.000Z'),
    startTime: new Date('1970-01-01T10:00:00.000Z'),
    endTime: new Date('1970-01-01T12:00:00.000Z'),
    campaign: {
      status: 'ACTIVE',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-05T00:00:00.000Z'),
      startTime: null,
      endTime: null,
    },
  };
  const assignment = { status: 'ASSIGNED' };
  const joined = { status: 'APPROVED' };
  const now = new Date('2026-11-03T11:00:00.000Z');

  assert.doesNotThrow(() => assertMissionCheckInEligible(baseTask, assignment, joined, now));
  assert.throws(
    () =>
      assertMissionCheckInEligible(
        { ...baseTask, approvalStatus: 'PENDING_APPROVAL' },
        assignment,
        joined,
        now,
      ),
    { statusCode: 403 },
  );
  assert.throws(
    () => assertMissionCheckInEligible(baseTask, assignment, { status: 'PENDING' }, now),
    { statusCode: 403 },
  );
  assert.throws(
    () => assertMissionCheckInEligible(baseTask, { status: 'CHECKED_IN' }, joined, now),
    { statusCode: 409 },
  );
  assert.throws(
    () =>
      assertMissionCheckInEligible(
        baseTask,
        assignment,
        joined,
        new Date('2026-11-03T09:00:00.000Z'),
      ),
    { statusCode: 409 },
  );
  assert.throws(
    () =>
      assertMissionCheckInEligible(
        { ...baseTask, campaign: { ...baseTask.campaign, status: 'DRAFT' } },
        assignment,
        joined,
        now,
      ),
    { statusCode: 409 },
  );
});

test('assignment updates cannot bypass check-in or report approval', () => {
  assert.throws(
    () =>
      assertManualAssignmentUpdateAllowed(
        { status: 'ASSIGNED' },
        { status: 'CHECKED_IN' },
        true,
      ),
    { statusCode: 409 },
  );
  assert.throws(
    () =>
      assertManualAssignmentUpdateAllowed(
        { status: 'ASSIGNED' },
        { checkInTime: new Date() },
        true,
      ),
    { statusCode: 409 },
  );
  assert.throws(
    () =>
      assertManualAssignmentUpdateAllowed(
        { status: 'ASSIGNED' },
        { status: 'CHECKED_OUT' },
        true,
      ),
    { statusCode: 409 },
  );
  assert.doesNotThrow(
    () =>
      assertManualAssignmentUpdateAllowed(
        { status: 'CHECKED_IN' },
        { status: 'CHECKED_OUT', checkOutTime: new Date() },
        false,
      ),
  );
});

test('device registration and cron authorization reject invalid input', () => {
  assert.deepEqual(
    validateDevicePayload({ fcmToken: 'token', platform: 'ANDROID' }),
    { fcmToken: 'token', platform: 'android' },
  );
  assert.throws(() => validateDevicePayload({ fcmToken: 'token', platform: 'windows' }), AppError);

  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  assert.equal(isValidCronAuthorization('Bearer test-secret'), true);
  assert.equal(isValidCronAuthorization('Bearer wrong'), false);
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
});

test('mission reminder event keys are deterministic for the same task occurrence', () => {
  const startsAt = new Date('2026-11-03T10:00:00.000Z');
  assert.equal(
    buildMissionReminderEventKey(9, 4, startsAt),
    'mission-reminder:9:4:2026-11-03T10:00:00.000Z',
  );
});

test('location targeting requires explicit opt-in, fresh accurate coordinates, and proximity', () => {
  const now = new Date('2026-06-02T12:00:00.000Z');
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const mission = { latitude: 30, longitude: 31 };
  const volunteer = {
    locationSharingEnabled: true,
    lastKnownLatitude: 30,
    lastKnownLongitude: 31,
    locationAccuracy: 25,
    locationLastUpdatedAt: new Date(now.getTime() - 5 * 60 * 1000),
  };
  const limits = { cutoff, maxAccuracyMeters: 100, radiusMeters: 500 };

  assert.equal(isEligibleNearbyVolunteerLocation(volunteer, mission, limits, now), true);
  assert.equal(
    isEligibleNearbyVolunteerLocation(
      { ...volunteer, locationSharingEnabled: false },
      mission,
      limits,
      now,
    ),
    false,
  );
  assert.equal(
    isEligibleNearbyVolunteerLocation(
      { ...volunteer, locationLastUpdatedAt: new Date(cutoff.getTime() - 1) },
      mission,
      limits,
      now,
    ),
    false,
  );
  assert.equal(
    isEligibleNearbyVolunteerLocation(
      { ...volunteer, locationAccuracy: 101 },
      mission,
      limits,
      now,
    ),
    false,
  );
  assert.equal(
    isEligibleNearbyVolunteerLocation(
      { ...volunteer, lastKnownLongitude: 31.01 },
      mission,
      limits,
      now,
    ),
    false,
  );
});

test('report review validation requires a reason only for rejection', () => {
  assert.deepEqual(validateReportDecisionPayload('APPROVED', {}), { reason: null });
  assert.deepEqual(validateReportDecisionPayload('REJECTED', { reason: 'الصورة غير واضحة' }), {
    reason: 'الصورة غير واضحة',
  });
  assert.throws(() => validateReportDecisionPayload('REJECTED', {}), AppError);
});

test('location APIs validate explicit consent, coordinates, and accuracy', () => {
  assert.deepEqual(validateLocationSharingPayload({ enabled: true }), { enabled: true });
  assert.throws(() => validateLocationSharingPayload({ enabled: 'true' }), AppError);
  assert.deepEqual(
    validateVolunteerLocationPayload({
      latitude: 30,
      longitude: 31,
      accuracyMeters: 20,
    }),
    { latitude: 30, longitude: 31, accuracyMeters: 20 },
  );
  assert.throws(() => validateVolunteerLocationPayload({}), AppError);
  assert.throws(
    () =>
      validateVolunteerLocationPayload({
        latitude: 91,
        longitude: 31,
        accuracyMeters: 20,
      }),
    AppError,
  );
});
