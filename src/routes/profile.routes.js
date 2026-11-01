const express = require('express');

const profileController = require('../controllers/profile.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/', profileController.getProfileDashboard);
router.get('/recognition', profileController.getProfileRecognition);
router.get('/leaderboard', profileController.getLeaderboard);

module.exports = router;
