const express = require('express');
const adminController = require('../controllers/admin.controller');
const emergencyController = require('../controllers/emergency.controller');
const adminAccountController = require('../controllers/admin-account.controller');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');
const notificationController = require('../controllers/notification.controller');
const {
  requireAnyPermission,
  requirePermission,
} = require('../middleware/rbac.middleware');
const { createPersistentRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.use(requireAdminAuth);
router.get('/dashboard', requirePermission('dashboard:read'), adminController.getDashboardStatistics);
router.get('/accounts', requirePermission('accounts:manage'), adminAccountController.listAdmins);
router.post('/accounts', requirePermission('accounts:manage'), adminAccountController.createAdmin);
router.patch('/accounts/:adminId', requirePermission('accounts:manage'), adminAccountController.updateAdmin);
router.patch(
  '/accounts/:adminId/password-reset',
  requirePermission('accounts:manage'),
  adminAccountController.resetAdminPassword,
);
router.get('/volunteers', requirePermission('volunteers:read'), adminController.listVolunteers);
router.get(
  '/volunteers/locations',
  requireAnyPermission('locations:read', 'campaigns:manage'),
  createPersistentRateLimit({ name: 'admin-location-monitoring', limit: 60, windowMs: 60 * 1000 }),
  adminController.listVolunteerLocations,
);
router.get(
  '/volunteers/:volunteerId/location-history',
  requireAnyPermission('locations:read', 'campaigns:manage'),
  createPersistentRateLimit({ name: 'admin-location-history', limit: 30, windowMs: 60 * 1000 }),
  adminController.getVolunteerLocationHistory,
);
router.get(
  '/volunteers/:volunteerId',
  requirePermission('volunteers:read'),
  adminController.getVolunteerDetails,
);
router.get('/audit-logs', requirePermission('audit:read'), adminController.listAuditLogs);
router.get('/notifications/unread-count', notificationController.getUnreadCount);
router.get('/notifications', notificationController.listNotifications);
router.patch('/notifications/read-all', notificationController.markAllNotificationsRead);
router.patch('/notifications/:notificationId/read', notificationController.markNotificationRead);
router.delete('/notifications/:notificationId', notificationController.deleteNotification);
router.post('/notifications/devices', notificationController.registerDevice);
router.delete('/notifications/devices', notificationController.unregisterDevice);
router.get(
  '/emergency/incidents',
  requireAnyPermission('emergencies:manage', 'campaigns:manage'),
  createPersistentRateLimit({ name: 'admin-emergency-dashboard', limit: 60, windowMs: 60 * 1000 }),
  emergencyController.listIncidents,
);
router.get(
  '/emergency/incidents/:incidentId',
  requireAnyPermission('emergencies:manage', 'campaigns:manage'),
  createPersistentRateLimit({ name: 'admin-emergency-details', limit: 60, windowMs: 60 * 1000 }),
  emergencyController.getIncidentDetails,
);
router.get(
  '/emergency/incidents/:incidentId/locations',
  requireAnyPermission('emergencies:manage', 'campaigns:manage'),
  createPersistentRateLimit({ name: 'admin-emergency-history', limit: 60, windowMs: 60 * 1000 }),
  emergencyController.getIncidentLocations,
);
router.patch(
  '/emergency/incidents/:incidentId/status',
  requireAnyPermission('emergencies:manage', 'campaigns:manage'),
  createPersistentRateLimit({ name: 'admin-emergency-status', limit: 30, windowMs: 60 * 1000 }),
  emergencyController.updateIncidentStatus,
);

module.exports = router;
