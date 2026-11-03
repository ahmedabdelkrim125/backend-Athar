const asyncHandler = require('../utils/async-handler');
const missionService = require('../services/mission.service');

const getMission = asyncHandler(async (req, res) => {
  const result = await missionService.getMission(req.params.taskId, req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const submitMissionReport = asyncHandler(async (req, res) => {
  const result = await missionService.submitMissionReport(
    req.params.taskId,
    req.body,
    req.user.id,
  );

  res.status(201).json({
    success: true,
    ...result,
  });
});

module.exports = {
  getMission,
  submitMissionReport,
};