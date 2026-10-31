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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sanad backend is live',
    docs: {
      health: '/api/health',
      register: '/api/auth/register',
      login: '/api/auth/login',
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
      community: '/api/community',
    },
  });
});

app.use('/api', apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
