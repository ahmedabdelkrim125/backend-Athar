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

## Required env

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `PORT`
- `CORS_ORIGINS`

## Available endpoints

- `GET /api/health`
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
- `GET /api/sos-requests`
- `POST /api/sos-requests`
- `PATCH /api/sos-requests/:requestId/status`

## Flutter connection

- Android emulator uses `http://10.0.2.2:3000/api/`
- iOS simulator and desktop use `http://127.0.0.1:3000/api/`
- Physical devices can override the URL:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000/api/
```
