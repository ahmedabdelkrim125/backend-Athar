const express = require('express');
const locationController = require('../controllers/location.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { createPersistentRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.use(requireAuth);
router.post(
  '/update',
  createPersistentRateLimit({ name: 'location-update', limit: 60, windowMs: 60 * 1000 }),
  locationController.updateLocation,
);

module.exports = router;
