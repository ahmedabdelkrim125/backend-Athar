const express = require('express');

const missionController = require('../controllers/mission.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/:taskId', missionController.getMission);
router.post('/:taskId/report', missionController.submitMissionReport);

module.exports = router;