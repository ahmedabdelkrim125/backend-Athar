const asyncHandler = require('../utils/async-handler');
const demoAdminService = require('../services/demo-admin.service');

const getOverview = asyncHandler(async (req, res) => {
  const result = await demoAdminService.getOverview();

  res.status(200).json({
    success: true,
    ...result,
  });
});

const seedAllVolunteers = asyncHandler(async (req, res) => {
  const result = await demoAdminService.seedAllVolunteers(req.user);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const cleanupDemoCommunityPosts = asyncHandler(async (_req, res) => {
  const result = await demoAdminService.cleanupDemoCommunityPosts();

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  cleanupDemoCommunityPosts,
  getOverview,
  seedAllVolunteers,
};
