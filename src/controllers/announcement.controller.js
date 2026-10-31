const asyncHandler = require('../utils/async-handler');
const announcementService = require('../services/announcement.service');

const listAnnouncements = asyncHandler(async (req, res) => {
  const result = await announcementService.listAnnouncements(req.query);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const result = await announcementService.createAnnouncement(req.body);

  res.status(201).json({
    success: true,
    ...result,
  });
});

module.exports = {
  createAnnouncement,
  listAnnouncements,
};
