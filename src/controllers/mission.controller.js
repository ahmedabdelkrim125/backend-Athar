const asyncHandler = require('../utils/async-handler');
const missionService = require('../services/mission.service');
const nearbyMissionService = require('../services/nearby-mission.service');
const missionParticipationService = require('../services/mission-participation.service');

const getNearbyMissions = asyncHandler(async (req, res) => {
  const result = await nearbyMissionService.getNearbyMissions(req.query, req.user.id);
  res.status(200).json({ success: true, ...result });
});

const setMissionApproval = asyncHandler(async (req, res) => {
  const result = await missionParticipationService.setMissionApproval(
    req.params.taskId,
    req.body,
    req.user,
  );
  res.status(200).json({ success: true, ...result });
});

const createJoinRequest = asyncHandler(async (req, res) => {
  const result = await missionParticipationService.createJoinRequest(
    req.params.taskId,
    req.user.id,
  );
  res.status(201).json({ success: true, ...result });
});

const listJoinRequests = asyncHandler(async (req, res) => {
  const result = await missionParticipationService.listJoinRequests(
    req.params.taskId,
    req.user,
    req.query,
  );
  res.status(200).json({ success: true, ...result });
});

const approveJoinRequest = asyncHandler(async (req, res) => {
  const result = await missionParticipationService.decideJoinRequest(
    req.params.taskId,
    req.params.requestId,
    'APPROVED',
    req.user,
  );
  res.status(200).json({ success: true, ...result });
});

const rejectJoinRequest = asyncHandler(async (req, res) => {
  const result = await missionParticipationService.decideJoinRequest(
    req.params.taskId,
    req.params.requestId,
    'REJECTED',
    req.user,
    req.body,
  );
  res.status(200).json({ success: true, ...result });
});

const cancelJoinRequest = asyncHandler(async (req, res) => {
  const result = await missionParticipationService.cancelJoinRequest(
    req.params.taskId,
    req.user.id,
  );
  res.status(200).json({ success: true, ...result });
});

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
  approveJoinRequest,
  cancelJoinRequest,
  createJoinRequest,
  getNearbyMissions,
  getMission,
  listJoinRequests,
  rejectJoinRequest,
  setMissionApproval,
  submitMissionReport,
};