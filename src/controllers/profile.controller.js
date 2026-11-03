const asyncHandler = require('../utils/async-handler');
const profileService = require('../services/profile.service');

const getProfileDashboard = asyncHandler(async (req, res) => {
  const result = await profileService.getProfileDashboard(req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getLeaderboard = asyncHandler(async (req, res) => {
  const result = await profileService.getLeaderboard(req.user.id, req.query.period);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getProfileRecognition = asyncHandler(async (req, res) => {
  const result = await profileService.getProfileRecognition(req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const setLocationSharing = asyncHandler(async (req, res) => {
  const result = await profileService.setLocationSharing(req.user.id, req.body);
  res.status(200).json({ success: true, ...result });
});

const updateLastKnownLocation = asyncHandler(async (req, res) => {
  const result = await profileService.updateLastKnownLocation(req.user.id, req.body);
  res.status(200).json({ success: true, ...result });
});

const listLocationAccessLogs = asyncHandler(async (req, res) => {
  const result = await profileService.listLocationAccessLogs(req.user.id, req.query);
  res.status(200).json({ success: true, ...result });
});

module.exports = {
  getLeaderboard,
  getProfileDashboard,
  getProfileRecognition,
  listLocationAccessLogs,
  setLocationSharing,
  updateLastKnownLocation,
};
