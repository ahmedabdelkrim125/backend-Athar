const asyncHandler = require('../utils/async-handler');
const attendanceService = require('../services/attendance.service');

const getAttendancePreview = asyncHandler(async (req, res) => {
  const result = await attendanceService.getAttendancePreview(
    req.params.taskId,
    req.user.id,
    req.query,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const checkInToTask = asyncHandler(async (req, res) => {
  const result = await attendanceService.checkInToTask(
    req.params.taskId,
    req.body,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  checkInToTask,
  getAttendancePreview,
};
