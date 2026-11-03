const express = require('express');

const prisma = require('../lib/prisma');
const {
  isSchemaMissingError,
  verifyDatabaseConnection,
  verifyDatabaseSchema,
} = require('../utils/database-readiness');
const authRoutes = require('./auth.routes');
const adminAuthRoutes = require('./admin-auth.routes');
const announcementRoutes = require('./announcement.routes');
const attendanceRoutes = require('./attendance.routes');
const adminRoutes = require('./admin.routes');
const campaignRoutes = require('./campaign.routes');
const chatbotRoutes = require('./chatbot.routes');
const communityRoutes = require('./community.routes');
const cronRoutes = require('./cron.routes');
const demoAdminRoutes = require('./demo-admin.routes');
const emergencyRoutes = require('./emergency.routes');
const homeRoutes = require('./home.routes');
const locationRoutes = require('./location.routes');
const missionRoutes = require('./mission.routes');
const notificationRoutes = require('./notification.routes');
const profileRoutes = require('./profile.routes');
const reportRoutes = require('./report.routes');
const sosRequestRoutes = require('./sos-request.routes');
const taskRoutes = require('./task.routes');
const uploadRoutes = require('./upload.routes');

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
router.use('/admin-auth', adminAuthRoutes);
router.use('/home', homeRoutes);
router.use('/profile', profileRoutes);
router.use('/announcements', announcementRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/admin', adminRoutes);
router.use('/cron', cronRoutes);
router.use('/emergency', emergencyRoutes);
router.use('/location', locationRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/tasks', taskRoutes);
router.use('/reports', reportRoutes);
router.use('/sos-requests', sosRequestRoutes);
router.use('/community', communityRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/missions', missionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/demo-admin', demoAdminRoutes);

module.exports = router;