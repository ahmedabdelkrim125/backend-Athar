const express = require('express');

const prisma = require('../lib/prisma');
const {
  isSchemaMissingError,
  verifyDatabaseConnection,
  verifyDatabaseSchema,
} = require('../utils/database-readiness');
const authRoutes = require('./auth.routes');
const announcementRoutes = require('./announcement.routes');
const attendanceRoutes = require('./attendance.routes');
const campaignRoutes = require('./campaign.routes');
const communityRoutes = require('./community.routes');
const demoAdminRoutes = require('./demo-admin.routes');
const homeRoutes = require('./home.routes');
const profileRoutes = require('./profile.routes');
const reportRoutes = require('./report.routes');
const sosRequestRoutes = require('./sos-request.routes');
const taskRoutes = require('./task.routes');

const router = express.Router();
const apiRelease = '2026-04-06-sos-recognition-v1';

router.get('/health', async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    await verifyDatabaseConnection(prisma);
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Sanad backend is running but database is unavailable',
      data: {
        release: apiRelease,
        timestamp,
        database: 'disconnected',
        schema: 'unknown',
        reason: error.message,
      },
    });
    return;
  }

  try {
    await verifyDatabaseSchema(prisma);
    res.status(200).json({
      success: true,
      message: 'Sanad backend and database schema are ready',
      data: {
        release: apiRelease,
        timestamp,
        database: 'connected',
        schema: 'ready',
      },
    });
  } catch (error) {
    const schemaStatus = isSchemaMissingError(error) ? 'missing' : 'error';

    res.status(503).json({
      success: false,
      message: 'Sanad backend is running but database schema is not ready',
      data: {
        release: apiRelease,
        timestamp,
        database: 'connected',
        schema: schemaStatus,
        reason: error.message,
      },
    });
  }
});

router.use('/auth', authRoutes);
router.use('/home', homeRoutes);
router.use('/profile', profileRoutes);
router.use('/announcements', announcementRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/tasks', taskRoutes);
router.use('/reports', reportRoutes);
router.use('/sos-requests', sosRequestRoutes);
router.use('/community', communityRoutes);
router.use('/demo-admin', demoAdminRoutes);

module.exports = router;
