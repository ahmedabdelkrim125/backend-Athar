const asyncHandler = require('../utils/async-handler');
const chatbotService = require('../services/chatbot.service');

const sendMessage = asyncHandler(async (req, res) => {
  const reply = await chatbotService.sendMessage(req.user.id, req.body?.messages);

  res.status(200).json({
    success: true,
    reply,
  });
});

module.exports = {
  sendMessage,
};