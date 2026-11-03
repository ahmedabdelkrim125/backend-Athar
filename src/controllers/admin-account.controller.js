const service = require('../services/admin-account.service');
const asyncHandler = require('../utils/async-handler');

const listAdmins = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, ...(await service.listAdmins(req.query)) });
});

const createAdmin = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, ...(await service.createAdmin(req.user, req.body)) });
});

const updateAdmin = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await service.updateAdmin(req.user, req.params.adminId, req.body)),
  });
});

const resetAdminPassword = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await service.resetAdminPassword(req.user, req.params.adminId, req.body)),
  });
});

const getDashboardStatistics = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, ...(await service.getDashboardStatistics()) });
});

module.exports = {
  createAdmin,
  getDashboardStatistics,
  listAdmins,
  resetAdminPassword,
  updateAdmin,
};
