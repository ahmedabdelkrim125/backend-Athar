const asyncHandler = require('../utils/async-handler');
const notificationService = require('../services/notification.service');
const { isValidCronAuthorization } = require('../utils/cron-auth');

const listNotifications = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await notificationService.listNotifications(req.user, req.query)),
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await notificationService.getUnreadCount(req.user)),
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await notificationService.markNotificationRead(req.params.notificationId, req.user)),
  });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await notificationService.markAllNotificationsRead(req.user)),
  });
});

const deleteNotification = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await notificationService.deleteNotification(req.params.notificationId, req.user)),
  });
});

const registerDevice = asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    ...(await notificationService.registerDevice(req.user, req.body)),
  });
});

const unregisterDevice = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await notificationService.unregisterDevice(req.user, req.body)),
  });
});

const sendMissionReminders = asyncHandler(async (req, res) => {
  if (!isValidCronAuthorization(req.headers.authorization)) {
    res.status(401).json({ success: false, message: 'غير مصرح لهذا الطلب المجدول' });
    return;
  }
  const result = await notificationService.sendUpcomingMissionReminders();
  res.status(200).json({ success: true, ...result });
});

module.exports = {
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDevice,
  sendMissionReminders,
  unregisterDevice,
};
