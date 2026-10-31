const express = require('express');

const communityController = require('../controllers/community.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', communityController.listCommunityFeed);
router.get('/feed', communityController.listCommunityFeed);
router.post('/posts', communityController.createCommunityPost);
router.delete('/posts/:postId', communityController.deleteCommunityPost);
router.post('/posts/:postId/like', communityController.toggleCommunityPostLike);
router.get('/posts/:postId/comments', communityController.listCommunityPostComments);
router.post('/posts/:postId/comments', communityController.createCommunityPostComment);

module.exports = router;
