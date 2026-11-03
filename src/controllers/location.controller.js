const locationService = require('../services/location-monitoring.service');
const asyncHandler = require('../utils/async-handler');

const updateLocation = asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    ...(await locationService.updateVolunteerLocation(req.user.id, req.body)),
  });
});

module.exports = { updateLocation };
