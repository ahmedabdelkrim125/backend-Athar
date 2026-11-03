const express = require('express');
const emergencyController = require('../controllers/emergency.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { createPersistentRateLimit } = require('../middleware/rate-limit.middleware');
const { requirePermission } = require('../middleware/rbac.middleware');

const router = express.Router();

router.use(requireAuth);
router.post(
  '/sos',
  createPersistentRateLimit({ name: 'emergency-sos', limit: 3, windowMs: 5 * 60 * 1000 }),
  emergencyController.createIncident,
);
router.get('/sos/active', emergencyController.getOwnActiveIncident);
router.patch(
  '/sos/:incidentId/location',
  createPersistentRateLimit({ name: 'emergency-location', limit: 60, windowMs: 60 * 1000 }),
  emergencyController.updateIncidentLocation,
);
router.post('/sos/:incidentId/cancel', emergencyController.cancelIncident);

module.exports = router;
