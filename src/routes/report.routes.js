const express = require('express');

const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');
const { requireAccountAuth } = require('../middleware/account-auth.middleware');

const router = express.Router();

router.get('/pending-review', requireAdminAuth, reportController.listPendingReviewReports);
router.get('/', requireAccountAuth, reportController.listReports);
router.post('/', requireAuth, reportController.createReport);
router.patch('/:reportId/approve', requireAdminAuth, reportController.approveReport);
router.patch('/:reportId/reject', requireAdminAuth, reportController.rejectReport);
router.get('/:reportId/review-history', requireAdminAuth, reportController.getReviewHistory);
router.get('/:reportId', requireAccountAuth, reportController.getReportById);
router.patch('/:reportId', requireAuth, reportController.updateReport);

module.exports = router;
