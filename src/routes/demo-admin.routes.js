const express = require('express');

const demoAdminController = require('../controllers/demo-admin.controller');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/overview', demoAdminController.getOverview);
router.post('/seed', demoAdminController.seedAllVolunteers);
router.delete('/community-posts', demoAdminController.cleanupDemoCommunityPosts);

module.exports = router;
