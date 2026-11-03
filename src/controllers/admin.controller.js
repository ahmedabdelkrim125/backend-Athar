const adminVolunteerService = require('../services/admin-volunteer.service');
const locationService = require('../services/location-monitoring.service');
const auditService = require('../services/audit.service');
const adminAccountService = require('../services/admin-account.service');
const asyncHandler = require('../utils/async-handler');

const listVolunteers = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await adminVolunteerService.listVolunteers(req.query)),
  });
});

const getVolunteerDetails = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await adminVolunteerService.getVolunteerDetails(req.params.volunteerId, req.user)),
  });
});

const listVolunteerLocations = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await locationService.listVolunteerLocations(req.query, req.user)),
  });
});

const getVolunteerLocationHistory = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await locationService.getLocationHistory(
      req.params.volunteerId,
      req.user,
      req.query,
    )),
  });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await auditService.listAuditLogs(req.query)),
  });
});

const getDashboardStatistics = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    ...(await adminAccountService.getDashboardStatistics()),
  });
});

module.exports = {
  getDashboardStatistics,
  getVolunteerDetails,
  getVolunteerLocationHistory,
  listAuditLogs,
  listVolunteerLocations,
  listVolunteers,
};
