const sosRequestService = require('../services/sos-request.service');
const asyncHandler = require('../utils/async-handler');

const listSosRequests = asyncHandler(async (req, res) => {
  const result = await sosRequestService.listSosRequests(req.query, req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getActiveSosRequest = asyncHandler(async (req, res) => {
  const result = await sosRequestService.getActiveSosRequest(req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getSosRequestById = asyncHandler(async (req, res) => {
  const result = await sosRequestService.getSosRequestById(req.params.requestId);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createSosRequest = asyncHandler(async (req, res) => {
  const result = await sosRequestService.createSosRequest(req.body, req.user.id);
  const { statusCode, ...response } = result;

  res.status(statusCode || 201).json({
    success: true,
    ...response,
  });
});

const cancelActiveSosRequest = asyncHandler(async (req, res) => {
  const result = await sosRequestService.cancelActiveSosRequest(req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const updateSosRequestStatus = asyncHandler(async (req, res) => {
  const result = await sosRequestService.updateSosRequestStatus(
    req.params.requestId,
    req.body,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  cancelActiveSosRequest,
  createSosRequest,
  getActiveSosRequest,
  getSosRequestById,
  listSosRequests,
  updateSosRequestStatus,
};
