const express = require('express');

const uploadController = require('../controllers/upload.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.post('/images', uploadController.uploadImage);

module.exports = router;