const express = require('express');

const chatbotController = require('../controllers/chatbot.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.post('/', chatbotController.sendMessage);

module.exports = router;