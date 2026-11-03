const express = require('express');
const locationService = require('../services/location-monitoring.service');
const asyncHandler = require('../utils/async-handler');
const { isValidCronAuthorization } = require('../utils/cron-auth');

const router = express.Router();

router.get(
  '/prune-location-updates',
  asyncHandler(async (req, res, next) => {
    if (!isValidCronAuthorization(req.headers.authorization)) {
      res.status(401).json({ success: false, message: 'غير مصرح' });
      return;
    }
    next();
  }),
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      success: true,
      ...(await locationService.pruneExpiredLocationUpdates()),
    });
  }),
);

module.exports = router;
