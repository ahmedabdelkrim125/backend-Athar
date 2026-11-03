const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');

function buildCorsOptions() {
  if (env.corsOrigins.includes('*')) {
    return {
      origin: true,
      credentials: true,
    };
  }

  return {
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  };
}

const app = express();

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sanad backend is live',
    docs: {
      health: '/api/health',
      register: '/api/auth/register',
      login: '/api/auth/login',
      adminLogin: '/api/admin-auth/login',
      refresh: '/api/auth/refresh',
      logout: '/api/auth/logout',
      profile: '/api/auth/me',
      profileDashboard: '/api/profile',
      profileRecognition: '/api/profile/recognition',
      profileLeaderboard: '/api/profile/leaderboard?period=weekly',
      logoutAll: '/api/auth/logout-all',
      home: '/api/home',
      announcements: '/api/announcements',
      createAnnouncement: '/api/announcements',
      attendance: '/api/attendance',
      campaigns: '/api/campaigns',
      tasks: '/api/tasks',
      reports: '/api/reports',
      sosRequests: '/api/sos-requests',
      activeSosRequest: '/api/sos-requests/active',
      cancelActiveSosRequest: '/api/sos-requests/active/cancel',
      emergencySos: '/api/emergency/sos',
      adminVolunteers: '/api/admin/volunteers',
      volunteerLocations: '/api/admin/volunteers/locations',
      community: '/api/community',
      missions: '/api/missions/:taskId',
      submitMissionReport: '/api/missions/:taskId/report',
      nearbyMissions: '/api/missions/nearby?latitude=:latitude&longitude=:longitude',
      notifications: '/api/notifications',
      uploadImage: '/api/uploads/images',
    },
  });
});

app.use('/api', apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;