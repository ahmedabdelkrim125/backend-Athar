const reportService = require('../services/report.service');
const asyncHandler = require('../utils/async-handler');

const listReports = asyncHandler(async (req, res) => {
  const result = await reportService.listReports(req.query, req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getReportById = asyncHandler(async (req, res) => {
  const result = await reportService.getReportById(
    req.params.reportId,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createReport = asyncHandler(async (req, res) => {
  const result = await reportService.createReport(req.body, req.user.id);

  res.status(201).json({
    success: true,
    ...result,
  });
});

const updateReport = asyncHandler(async (req, res) => {
  const result = await reportService.updateReport(
    req.params.reportId,
    req.body,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  createReport,
  getReportById,
  listReports,
  updateReport,
};
