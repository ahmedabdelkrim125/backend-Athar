const asyncHandler = require('../utils/async-handler');
const homeService = require('../services/home.service');

const getHomeSummary = asyncHandler(async (req, res) => {
  const result = await homeService.getHomeSummary(req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  getHomeSummary,
};
