const express = require('express');

const missionController = require('../controllers/mission.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');

const router = express.Router();

router.get('/nearby', requireAuth, missionController.getNearbyMissions);
router.patch('/:taskId/approval', requireAdminAuth, missionController.setMissionApproval);
router.post('/:taskId/join', requireAuth, missionController.createJoinRequest);
router.delete('/:taskId/join', requireAuth, missionController.cancelJoinRequest);
router.get('/:taskId/join-requests', requireAdminAuth, missionController.listJoinRequests);
router.patch(
  '/:taskId/join-requests/:requestId/approve',
  requireAdminAuth,
  missionController.approveJoinRequest,
);
router.patch(
  '/:taskId/join-requests/:requestId/reject',
  requireAdminAuth,
  missionController.rejectJoinRequest,
);
router.get('/:taskId', requireAuth, missionController.getMission);
router.post('/:taskId/report', requireAuth, missionController.submitMissionReport);

module.exports = router;