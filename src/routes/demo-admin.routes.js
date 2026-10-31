const express = require('express');

const demoAdminController = require('../controllers/demo-admin.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireDemoAdmin } = require('../middleware/demo-admin.middleware');

const router = express.Router();

router.use(requireAuth);
router.use(requireDemoAdmin);

router.get('/overview', demoAdminController.getOverview);
router.post('/seed', demoAdminController.seedAllVolunteers);
router.delete('/community-posts', demoAdminController.cleanupDemoCommunityPosts);

module.exports = router;
