const express = require('express');

const sosRequestController = require('../controllers/sos-request.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', sosRequestController.listSosRequests);
router.get('/active', sosRequestController.getActiveSosRequest);
router.get('/nearby', sosRequestController.listNearbySosRequests);
router.patch('/active/cancel', sosRequestController.cancelActiveSosRequest);
router.post('/', sosRequestController.createSosRequest);
router.get('/:requestId', sosRequestController.getSosRequestById);
router.patch('/:requestId/location', sosRequestController.updateSosRequestLocation);
router.post('/:requestId/respond', sosRequestController.respondToSosRequest);
router.patch('/:requestId/status', sosRequestController.updateSosRequestStatus);

module.exports = router;