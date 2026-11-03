const asyncHandler = require('../utils/async-handler');
const uploadService = require('../services/upload.service');

const uploadImage = asyncHandler(async (req, res) => {
  const result = await uploadService.uploadImage(req.body);

  res.status(201).json({
    success: true,
    ...result,
  });
});

module.exports = {
  uploadImage,
};