function getTaskAttendanceRadius(task) {
  return task?.attendanceRadiusMeters ?? task?.campaign?.attendanceRadiusMeters ?? null;
}

function calculateTaskDurationHours(task) {
  if (!task?.startTime || !task?.endTime) {
    return 1;
  }

  const startTime = new Date(task.startTime);
  const endTime = new Date(task.endTime);
  const durationMilliseconds = endTime.getTime() - startTime.getTime();

  if (!Number.isFinite(durationMilliseconds) || durationMilliseconds <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(durationMilliseconds / (60 * 60 * 1000)));
}

module.exports = {
  calculateTaskDurationHours,
  getTaskAttendanceRadius,
};
