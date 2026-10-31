const express = require('express');

const attendanceController = require('../controllers/attendance.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/tasks/:taskId/preview', attendanceController.getAttendancePreview);
router.post('/tasks/:taskId/check-in', attendanceController.checkInToTask);

module.exports = router;
