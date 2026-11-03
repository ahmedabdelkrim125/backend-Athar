const campaignService = require('../services/campaign.service');
const asyncHandler = require('../utils/async-handler');

const listCampaigns = asyncHandler(async (req, res) => {
  const result = await campaignService.listCampaigns(req.query, req.user);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const getCampaignById = asyncHandler(async (req, res) => {
  const result = await campaignService.getCampaignById(
    req.params.campaignId,
    req.user,
    req.query,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createCampaign = asyncHandler(async (req, res) => {
  const result = await campaignService.createCampaign(req.body, req.user);

  res.status(201).json({
    success: true,
    ...result,
  });
});

const updateCampaign = asyncHandler(async (req, res) => {
  const result = await campaignService.updateCampaign(
    req.params.campaignId,
    req.body,
    req.user,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  createCampaign,
  getCampaignById,
  listCampaigns,
  updateCampaign,
};
