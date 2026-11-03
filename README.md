# Sanad Backend

Express backend powered by `MySQL + Prisma + JWT`.

## Setup

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Production uses committed migrations from `prisma/migrations` via `npm run prisma:deploy`.

## Volunteer titles

The `VolunteerTitle` table stores five editable title levels and their minimum
requirements for lifetime points, volunteer hours, completed tasks, and reports.
Every requirement for a level must be met. Titles are derived from current volunteer
records when the profile or leaderboard is read, so title changes do not require a
separate write or background sync. The leaderboard keeps its existing score formula
for ordering, returns actual earned `points`, and provides `rank` and `volunteerTitle`
as separate fields.

The migration inserts the default levels. To add any missing defaults without
overwriting thresholds edited in the database, run:

```bash
npm run prisma:deploy
npm run prisma:generate
npm run seed:volunteer-titles
```

Default minimum requirements (all columns are editable in `volunteer_titles`):

| Level | Title | Points | Hours | Completed tasks | Reports |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | متطوع مبتدئ | 0 | 0 | 0 | 0 |
| 2 | صانع الخير | 100 | 1 | 1 | 1 |
| 3 | متطوع متميز | 300 | 10 | 5 | 5 |
| 4 | قائد الأثر | 750 | 30 | 20 | 15 |
| 5 | سفير أثر | 1500 | 100 | 50 | 40 |

## Nearby missions and approvals

The existing `Location` model already stores each task location's name and
coordinates. The new migration adds an approval state, an optional participant
capacity, and join requests; existing tasks default to `APPROVED` and existing
non-cancelled task assignments are backfilled as approved join requests. Tasks
created through the API start as `PENDING_APPROVAL`. The campaign creator is the
responsible approver because the current account model has no general admin role.

All routes below are under `/api` and require `Authorization: Bearer <accessToken>`
except the scheduled reminder route, which requires `Authorization: Bearer
<CRON_SECRET>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/missions/nearby?latitude=30.04&longitude=31.23&radiusMeters=10000&page=1&limit=20` | Approved, upcoming missions ordered by Haversine distance. Radius is capped at 50 km. |
| `PATCH` | `/missions/:taskId/approval` | Campaign creator approves/rejects a pending mission or cancels an approved mission. Body: `{"status":"APPROVED"}` (also `REJECTED`, `CANCELLED`). |
| `POST` | `/missions/:taskId/join` | Create a volunteer join request. |
| `GET` | `/missions/:taskId/join-requests?page=1&limit=20&status=PENDING` | Campaign creator lists requests. |
| `PATCH` | `/missions/:taskId/join-requests/:requestId/approve` | Approve a request and create its existing `VolunteerTask` assignment atomically. |
| `PATCH` | `/missions/:taskId/join-requests/:requestId/reject` | Reject a pending request. |
| `DELETE` | `/missions/:taskId/join` | Volunteer cancels their pending request. |
| `POST` | `/reports` | Submit a report for review; no report points, volunteer hours, or task completion are awarded yet. |
| `GET` | `/reports/pending-review?page=1&limit=20` | Campaign creator or configured demo admin lists pending reports. |
| `PATCH` | `/reports/:reportId/approve` | Approve report; awards configured points/hours and completes the assignment atomically. |
| `PATCH` | `/reports/:reportId/reject` | Reject report; body: `{"reason":"سبب واضح"}`. |
| `GET` | `/reports/:reportId/review-history` | Authorized campaign creator or configured demo admin reads reviewer audit history. |
| `PATCH` | `/profile/location-sharing` | Opt in/out of location targeting; body: `{"enabled":true}`. Disabling clears stored coordinates. |
| `PUT` | `/profile/location` | Update own opted-in location; body: `{"latitude":30.04,"longitude":31.23,"accuracyMeters":20}`. |
| `GET` | `/profile/location-access-log?page=1&limit=20` | Current volunteer reviews accesses to their stored location. |
| `GET` | `/notifications?page=1&limit=20` | Current user's in-app notifications. |
| `GET` | `/notifications/unread-count` | Current user's unread count. |
| `PATCH` | `/notifications/:notificationId/read` | Mark one owned notification as read. |
| `PATCH` | `/notifications/read-all` | Mark all current user's notifications as read. |
| `DELETE` | `/notifications/:notificationId` | Delete one owned notification. |
| `POST` | `/notifications/devices` | Register/update the current user's FCM token. |
| `DELETE` | `/notifications/devices` | Deactivate a device token owned by the current user. |
| `GET` | `/notifications/mission-reminders/cron` | Secure scheduled reminder job. |

Nearby response missions contain `id`, `title`, `description`, `latitude`,
`longitude`, `locationName`, `date`, `startTime`, `endTime`, `distanceMeters`,
`attendanceRadiusMeters`, `requiredVolunteers`, `availableSlots`, and
`userJoinStatus`. Coordinates come from the task's existing related Location;
no user or task coordinate defaults are fabricated. Home accepts the same
`latitude` and `longitude` query parameters and returns a `nearbyMissions` object.
Without coordinates that field is `null` and the existing Home data is retained.

Example nearby request:

```http
GET /api/missions/nearby?latitude=30.04&longitude=31.23&radiusMeters=5000
Authorization: Bearer <accessToken>
```

Example join request:

```http
POST /api/missions/12/join
Authorization: Bearer <accessToken>
```

```json
{
  "success": true,
  "message": "تم إرسال طلب الانضمام للمراجعة",
  "joinRequest": { "id": 8, "taskId": 12, "status": "PENDING" }
}
```

Example report submission and review:

```http
POST /api/reports
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{"taskId":12,"notes":"تم تنفيذ أنشطة المهمة","images":[]}
```

New report responses use `approvalStatus: "PENDING_REVIEW"` and
`pointsAwarded: 0`. Review with `PATCH /api/reports/42/approve` and an empty
JSON object, or `PATCH /api/reports/42/reject` with
`{"reason":"يرجى إرفاق صورة أوضح"}`. Points/hours are awarded only on approval.

Example opt-in location update:

```http
PATCH /api/profile/location-sharing
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{"enabled":true}
```

Then send the volunteer's current, explicit GPS fix using
`PUT /api/profile/location` with `latitude`, `longitude`, and
`accuracyMeters`. To opt out, send `{"enabled":false}`; the backend clears the
saved coordinates. Location access is visible at
`GET /api/profile/location-access-log`.

Check-in now independently enforces approved mission, approved join request,
valid GPS coordinates, configured attendance radius, task date/time, and a
single check-in. Existing attendance point and hour calculations remain in place.
New manual assignments by the campaign creator also create an approved join
request so the existing assignment workflow remains compatible.

## In-app notifications, FCM, and scheduled reminders

Notifications are persisted before attempting FCM delivery. Firebase delivery
is best-effort: absent or failing Firebase credentials do not undo the mission,
join, or attendance operation. Invalid registration tokens are deactivated.
Notifications use event keys with a unique user/event constraint to prevent
duplicate event delivery.

Configure these optional/required environment variables in the backend host:

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project identifier. |
| `FIREBASE_CLIENT_EMAIL` | Service-account client email. |
| `FIREBASE_PRIVATE_KEY` | Service-account private key; store only as a host secret and encode newlines as `\n`. |
| `CRON_SECRET` | Required Bearer secret for the scheduled endpoint. |
| `MISSION_REMINDER_MINUTES` | Minutes before start to send a reminder (default `60`). |
| `MISSION_REMINDER_WINDOW_MINUTES` | Matching window for a cron invocation (default `15`). |

Create a Firebase service account with Firebase Cloud Messaging permission,
then copy its project ID, client email, and private key into the hosting
provider's encrypted environment variables. Never commit the service-account
JSON or private key. With no Firebase credentials, in-app notifications still
work and Push delivery is skipped.

Vercel runs request handlers as serverless functions, so the backend does not
use an in-process timer. Configure Vercel Cron or an external scheduler to call
`GET /api/notifications/mission-reminders/cron` at least once per reminder
window and send `Authorization: Bearer <CRON_SECRET>`. The endpoint selects
approved assignments whose start time falls in the configured window; the
notification unique key makes repeat invocations idempotent.

Example device registration:

```http
POST /api/notifications/devices
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{"fcmToken":"<device-fcm-token>","platform":"android"}
```

## Report review and location consent

New reports start as `PENDING_REVIEW`. Points, volunteer hours, badge awards,
and task completion are applied only once the authorized reviewer approves the
report. Rejections require a reason and the volunteer can edit and resubmit a
rejected report; review decisions are retained in `ReportReviewAudit`.
Historical reports migrate as `APPROVED`, preserving previously awarded
balances and avoiding a recalculation.

Volunteer location targeting is opt-in. Coordinates are never inferred from
IP/device metadata or populated with defaults. Enabling sharing clears stale
coordinates until the volunteer explicitly sends a location; disabling sharing
clears the stored coordinates. Approval notifications only consider active
volunteers with fresh, sufficiently accurate, consented coordinates inside the
configured radius. Access events are recorded without storing coordinates in
the access log and can be reviewed using the profile access-log endpoint.

For Vercel Cron, create a scheduled GET request to
`/api/notifications/mission-reminders/cron` and configure its authorization
header as `Bearer <CRON_SECRET>`. Do not expose the secret in client apps or
commit it. An external scheduler can call the same endpoint; there is no
process-local timer.

## Required env

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `PORT`
- `CORS_ORIGINS`
- `CRON_SECRET` (required to call scheduled reminder and location-cleanup endpoints)
- `MISSION_REMINDER_MINUTES` (optional; defaults to `60`)
- `MISSION_REMINDER_WINDOW_MINUTES` (optional; defaults to `15`)
- `NEARBY_LOCATION_MAX_AGE_MINUTES` (optional; defaults to `15`)
- `NEARBY_LOCATION_MAX_ACCURACY_METERS` (optional; defaults to `100`)
- `MISSION_NEARBY_NOTIFICATION_RADIUS_METERS` (optional; defaults to `10000`)
- `ADMIN_JWT_SECRET` (required; at least 32 characters and different from volunteer JWT secrets)
- `ADMIN_JWT_REFRESH_SECRET` (required; at least 32 characters and different from all other JWT secrets)
- `ADMIN_JWT_ACCESS_EXPIRES_IN` (optional; defaults to `15m`)
- `ADMIN_JWT_REFRESH_EXPIRES_IN` (optional; defaults to `12h`)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (optional FCM secrets; configure only on the server)

## Available endpoints

- `GET /api/health`
- `GET /api/home`
- `GET /api/profile`, `/recognition`, `/leaderboard`
- `POST /api/admin-auth/login`, `/refresh`, `/logout`, `/change-password`
- `GET /api/admin/dashboard`, `/accounts`, `/volunteers`, `/audit-logs`
- `POST /api/admin/accounts`; `PATCH /api/admin/accounts/:adminId` and `/password-reset`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/logout-all`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `PATCH /api/campaigns/:campaignId`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:taskId`
- `POST /api/tasks/:taskId/assignments`
- `PATCH /api/tasks/:taskId/assignments/:volunteerId`
- `GET /api/reports`
- `POST /api/reports`
- `PATCH /api/reports/:reportId`
- `GET /api/reports/pending-review`
- `PATCH /api/reports/:reportId/approve`
- `PATCH /api/reports/:reportId/reject`
- `GET /api/reports/:reportId/review-history`
- `GET /api/missions/nearby`
- `PATCH /api/missions/:taskId/approval`
- `POST /api/missions/:taskId/join`
- `GET /api/missions/:taskId/join-requests`
- `PATCH /api/missions/:taskId/join-requests/:requestId/approve`
- `PATCH /api/missions/:taskId/join-requests/:requestId/reject`
- `DELETE /api/missions/:taskId/join`
- `PATCH /api/profile/location-sharing`
- `PUT /api/profile/location`
- `GET /api/profile/location-access-log`
- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `POST /api/notifications/devices`
- `DELETE /api/notifications/devices`
- `PATCH /api/notifications/:notificationId/read`
- `PATCH /api/notifications/read-all`
- `DELETE /api/notifications/:notificationId`
- `GET /api/notifications/mission-reminders/cron`
- `GET /api/sos-requests`
- `POST /api/sos-requests`
- `PATCH /api/sos-requests/:requestId/status`
- `POST /api/emergency/sos`
- `GET /api/emergency/sos/active`
- `PATCH /api/emergency/sos/:incidentId/location`
- `POST /api/emergency/sos/:incidentId/cancel`
- `GET /api/admin/emergency/incidents`
- `GET /api/admin/emergency/incidents/:incidentId`
- `GET /api/admin/emergency/incidents/:incidentId/locations`
- `PATCH /api/admin/emergency/incidents/:incidentId/status`
- `GET /api/admin/volunteers`
- `GET /api/admin/volunteers/:volunteerId`
- `GET /api/admin/volunteers/locations`
- `GET /api/admin/volunteers/:volunteerId/location-history`
- `GET /api/admin/audit-logs`
- `POST /api/location/update`
- `GET /api/cron/prune-location-updates`

## Admin accounts, location privacy, and SOS

Volunteer and admin identities are separate database records and use separate JWT secrets and refresh-session tables. The only roles are `VOLUNTEER` and `ADMIN`; no volunteer is promoted by the migration. Admin endpoints require the separate Admin Bearer token returned by `POST /api/admin-auth/login`. Admin permissions are checked in the backend. Volunteer details omit credential hashes, refresh tokens, and auth sessions; access to profile details and location history is audited.

After deploying the schema migration, create the first admin interactively on the server with `npm run admin:bootstrap`. This command only works when no admin exists; there is no public bootstrap endpoint. Additional admin accounts can be created through `POST /api/admin/accounts`. Disable an account with `PATCH /api/admin/accounts/:adminId` and `{\"isActive\":false}`; disabling or resetting a password revokes sessions. To recover an account, run `npm run admin:reset-password` on the server.

Volunteer location sharing is opt-in. The volunteer must call `PATCH /api/profile/location-sharing` with `{\"enabled\":true}`, then send their GPS fix to `POST /api/location/update` with `missionId`, `latitude`, `longitude`, `accuracy`, and a recent ISO-8601 `deviceTimestamp`. Updates are accepted only during the approved task time window for an approved participant. Turning sharing off clears the saved coordinates. No location is inferred from IP or device metadata. During an active SOS, updates are tied to the incident and stop after it closes.

Location history is retained for 30 days. A location is considered fresh for 15 minutes; older fixes are reported as `STALE`, not live. An admin must provide a reason when reading volunteer location data, and those reads are audited. Configure external/Vercel Cron GET requests for `/api/cron/prune-location-updates` and `/api/notifications/mission-reminders/cron` with `Authorization: Bearer <CRON_SECRET>`.

Submit SOS to `POST /api/emergency/sos` with the volunteer access token. `latitude`, `longitude`, `accuracy`, and a current ISO-8601 `deviceTimestamp` are required; `message` and `missionId` are optional. A supplied mission must be an approved active assignment. The response includes a unique incident ID, reference, status, and map URL. A volunteer may have only one active incident; the endpoint is rate-limited to 3 requests per 5 minutes. Incident state updates, location history, and admin access are audited.

FCM delivery is best-effort after the database notification is committed. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as server-side secrets only; never commit credentials or add them to the Flutter client. Without credentials, In-App Notifications still work.

## Flutter connection

- Android emulator uses `http://10.0.2.2:3000/api/`
- iOS simulator and desktop use `http://127.0.0.1:3000/api/`
- Physical devices can override the URL:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000/api/
```
