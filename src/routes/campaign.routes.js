const express = require('express');

const campaignController = require('../controllers/campaign.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', campaignController.listCampaigns);
router.post('/', campaignController.createCampaign);
router.get('/:campaignId', campaignController.getCampaignById);
router.patch('/:campaignId', campaignController.updateCampaign);

module.exports = router;
