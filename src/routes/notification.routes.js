const express = require('express');

const notificationController = require('../controllers/notification.controller');
const { requireAccountAuth } = require('../middleware/account-auth.middleware');

const router = express.Router();

router.get('/mission-reminders/cron', notificationController.sendMissionReminders);
router.use(requireAccountAuth);
router.get('/unread-count', notificationController.getUnreadCount);
router.post('/devices', notificationController.registerDevice);
router.delete('/devices', notificationController.unregisterDevice);
router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllNotificationsRead);
router.patch('/:notificationId/read', notificationController.markNotificationRead);
router.delete('/:notificationId', notificationController.deleteNotification);

module.exports = router;
