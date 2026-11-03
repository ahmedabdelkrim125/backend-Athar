const express = require('express');

const sosRequestController = require('../controllers/sos-request.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireAccountAuth } = require('../middleware/account-auth.middleware');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');
const { createPersistentRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.get('/', requireAuth, sosRequestController.listSosRequests);
router.get('/active', requireAuth, sosRequestController.getActiveSosRequest);
router.get('/nearby', requireAdminAuth, sosRequestController.listNearbySosRequests);
router.patch('/active/cancel', requireAuth, sosRequestController.cancelActiveSosRequest);
router.post(
  '/',
  requireAuth,
  createPersistentRateLimit({ name: 'legacy-sos', limit: 3, windowMs: 5 * 60 * 1000 }),
  sosRequestController.createSosRequest,
);
router.get('/:requestId', requireAccountAuth, sosRequestController.getSosRequestById);
router.patch(
  '/:requestId/location',
  requireAuth,
  createPersistentRateLimit({ name: 'legacy-emergency-location', limit: 60, windowMs: 60 * 1000 }),
  sosRequestController.updateSosRequestLocation,
);
router.post(
  '/:requestId/respond',
  requireAdminAuth,
  sosRequestController.respondToSosRequest,
);
router.patch('/:requestId/status', requireAccountAuth, sosRequestController.updateSosRequestStatus);

module.exports = router;