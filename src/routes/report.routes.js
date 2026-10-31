const express = require('express');

const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', reportController.listReports);
router.post('/', reportController.createReport);
router.get('/:reportId', reportController.getReportById);
router.patch('/:reportId', reportController.updateReport);

module.exports = router;
