const reportService = require('../services/report.service');
const asyncHandler = require('../utils/async-handler');

const listReports = asyncHandler(async (req, res) => {
  const result = await reportService.listReports(req.query, req.user);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getReportById = asyncHandler(async (req, res) => {
  const result = await reportService.getReportById(
    req.params.reportId,
    req.user,
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

const listPendingReviewReports = asyncHandler(async (req, res) => {
  const result = await reportService.listPendingReviewReports(req.query, req.user);
  res.status(200).json({ success: true, ...result });
});

const approveReport = asyncHandler(async (req, res) => {
  const result = await reportService.reviewReport(
    req.params.reportId,
    'APPROVED',
    req.body,
    req.user,
  );
  res.status(200).json({ success: true, ...result });
});

const rejectReport = asyncHandler(async (req, res) => {
  const result = await reportService.reviewReport(
    req.params.reportId,
    'REJECTED',
    req.body,
    req.user,
  );
  res.status(200).json({ success: true, ...result });
});

const getReviewHistory = asyncHandler(async (req, res) => {
  const result = await reportService.getReviewHistory(req.params.reportId, req.user);
  res.status(200).json({ success: true, ...result });
});

module.exports = {
  approveReport,
  createReport,
  getReviewHistory,
  getReportById,
  listPendingReviewReports,
  listReports,
  rejectReport,
  updateReport,
};
