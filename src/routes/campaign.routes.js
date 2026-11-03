const express = require('express');

const campaignController = require('../controllers/campaign.controller');
const { requireAccountAuth } = require('../middleware/account-auth.middleware');
const { requireAdminAuth } = require('../middleware/admin-auth.middleware');

const router = express.Router();

router.get('/', requireAccountAuth, campaignController.listCampaigns);
router.post('/', requireAdminAuth, campaignController.createCampaign);
router.get('/:campaignId', requireAccountAuth, campaignController.getCampaignById);
router.patch('/:campaignId', requireAdminAuth, campaignController.updateCampaign);

module.exports = router;
