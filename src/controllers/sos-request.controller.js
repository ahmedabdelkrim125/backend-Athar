const sosRequestService = require('../services/sos-request.service');
const emergencyService = require('../services/emergency.service');
const asyncHandler = require('../utils/async-handler');

const listSosRequests = asyncHandler(async (req, res) => {
  const result = await sosRequestService.listSosRequests(req.query, req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const listNearbySosRequests = asyncHandler(async (req, res) => {
  const result = await sosRequestService.listNearbySosRequests(req.query, req.user.id);

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
  const result = await sosRequestService.getSosRequestById(req.params.requestId, req.user);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createSosRequest = asyncHandler(async (req, res) => {
  const { incident } = await emergencyService.createLegacyIncident(req.user.id, req.body);
  const location = {
    latitude: incident.latitude,
    longitude: incident.longitude,
  };
  res.status(201).json({
    success: true,
    message: 'تم إنشاء طلب الاستغاثة بنجاح',
    request: {
      id: incident.id,
      volunteerId: req.user.id,
      latitude: incident.latitude,
      longitude: incident.longitude,
      location,
      status: incident.status,
      statusLabel: 'قيد الإرسال',
      isActive: true,
      createdAt: incident.createdAt,
      resolvedAt: null,
      volunteer: incident.volunteer,
      uiState: {
        screenTitle: 'جاري إرسال طلب الطوارئ...',
        screenSubtitle: 'يتم مشاركة موقعك الآن',
        helperText: 'لا تغلق التطبيق',
        tone: 'danger',
        canCancel: true,
        keepAppOpen: true,
        pollIntervalSeconds: 5,
        estimatedResponseMinutes: 2,
      },
    },
    created: true,
  });
});

const cancelActiveSosRequest = asyncHandler(async (req, res) => {
  const result = await sosRequestService.cancelActiveSosRequest(req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const updateSosRequestLocation = asyncHandler(async (req, res) => {
  const result = await sosRequestService.updateSosRequestLocation(
    req.params.requestId,
    req.body,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const respondToSosRequest = asyncHandler(async (req, res) => {
  const result = await sosRequestService.respondToSosRequest(
    req.params.requestId,
    req.user,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const updateSosRequestStatus = asyncHandler(async (req, res) => {
  const result = await sosRequestService.updateSosRequestStatus(
    req.params.requestId,
    req.body,
    req.user,
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
  listNearbySosRequests,
  listSosRequests,
  respondToSosRequest,
  updateSosRequestLocation,
  updateSosRequestStatus,
};