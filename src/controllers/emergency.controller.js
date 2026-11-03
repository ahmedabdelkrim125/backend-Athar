const emergencyService = require('../services/emergency.service');
const asyncHandler = require('../utils/async-handler');

const createIncident = asyncHandler(async (req, res) => {
  const result = await emergencyService.createIncident(req.user.id, req.body);
  res.status(201).json({ success: true, ...result });
});

const updateIncidentLocation = asyncHandler(async (req, res) => {
  const result = await emergencyService.updateIncidentLocation(
    req.params.incidentId,
    req.user.id,
    req.body,
  );
  res.status(200).json({ success: true, ...result });
});

const cancelIncident = asyncHandler(async (req, res) => {
  const result = await emergencyService.cancelIncident(
    req.params.incidentId,
    req.user.id,
    req.body,
  );
  res.status(200).json({ success: true, ...result });
});

const getOwnActiveIncident = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await emergencyService.getOwnActiveIncident(req.user.id)),
  });
});

const listIncidents = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await emergencyService.listIncidents(req.query, req.user)),
  });
});

const getIncidentDetails = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await emergencyService.getIncidentDetails(req.params.incidentId, req.user)),
  });
});

const getIncidentLocations = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await emergencyService.getIncidentLocations(
      req.params.incidentId,
      req.user,
      req.query,
    )),
  });
});

const updateIncidentStatus = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await emergencyService.updateIncidentStatus(
      req.params.incidentId,
      req.user,
      req.body,
    )),
  });
});

module.exports = {
  cancelIncident,
  createIncident,
  getIncidentDetails,
  getIncidentLocations,
  getOwnActiveIncident,
  listIncidents,
  updateIncidentLocation,
  updateIncidentStatus,
};
