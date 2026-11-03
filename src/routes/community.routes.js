const express = require('express');

const communityController = require('../controllers/community.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireAccountAuth } = require('../middleware/account-auth.middleware');

const router = express.Router();

router.get('/', requireAuth, communityController.listCommunityFeed);
router.get('/feed', requireAuth, communityController.listCommunityFeed);
router.post('/posts', requireAuth, communityController.createCommunityPost);
router.delete('/posts/:postId', requireAccountAuth, communityController.deleteCommunityPost);
router.post('/posts/:postId/like', requireAuth, communityController.toggleCommunityPostLike);
router.get('/posts/:postId/comments', requireAuth, communityController.listCommunityPostComments);
router.post('/posts/:postId/comments', requireAuth, communityController.createCommunityPostComment);

module.exports = router;
