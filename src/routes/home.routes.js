const express = require('express');

const homeController = require('../controllers/home.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', homeController.getHomeSummary);

module.exports = router;
