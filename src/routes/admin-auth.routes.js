const express = require('express');
const controller = require('../controllers/admin-auth.controller');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');
const { createPersistentRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.post(
  '/login',
  createPersistentRateLimit({ name: 'admin-login', limit: 5, windowMs: 15 * 60 * 1000 }),
  controller.login,
);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/change-password', requireAdminAuth, controller.changePassword);

module.exports = router;
