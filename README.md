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
