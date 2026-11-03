const express = require('express');

const profileController = require('../controllers/profile.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { createPersistentRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/', profileController.getProfileDashboard);
router.get('/recognition', profileController.getProfileRecognition);
router.get('/leaderboard', profileController.getLeaderboard);
router.patch(
  '/location-sharing',
  createPersistentRateLimit({ name: 'profile-location-sharing', limit: 10, windowMs: 60 * 1000 }),
  profileController.setLocationSharing,
);
router.put(
  '/location',
  createPersistentRateLimit({ name: 'profile-location-update', limit: 60, windowMs: 60 * 1000 }),
  profileController.updateLastKnownLocation,
);
router.get('/location-access-log', profileController.listLocationAccessLogs);

module.exports = router;
