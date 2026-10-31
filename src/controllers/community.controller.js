const asyncHandler = require('../utils/async-handler');
const { isDemoAdmin } = require('../middleware/demo-admin.middleware');
const communityService = require('../services/community.service');

const listCommunityFeed = asyncHandler(async (req, res) => {
  const result = await communityService.listCommunityFeed(req.query, req.user.id);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createCommunityPost = asyncHandler(async (req, res) => {
  const result = await communityService.createCommunityPost(req.body, req.user.id);

  res.status(201).json({
    success: true,
    ...result,
  });
});

const toggleCommunityPostLike = asyncHandler(async (req, res) => {
  const result = await communityService.toggleCommunityPostLike(
    req.params.postId,
    req.user.id,
  );

  res.status(200).json({
    success: true,
    ...result,
  });
});

const listCommunityPostComments = asyncHandler(async (req, res) => {
  const result = await communityService.listCommunityPostComments(req.params.postId);

  res.status(200).json({
    success: true,
    ...result,
  });
});

const createCommunityPostComment = asyncHandler(async (req, res) => {
  const result = await communityService.createCommunityPostComment(
    req.params.postId,
    req.body,
    req.user.id,
  );

  res.status(201).json({
    success: true,
    ...result,
  });
});

const deleteCommunityPost = asyncHandler(async (req, res) => {
  const result = await communityService.deleteCommunityPost(req.params.postId, req.user.id, {
    canModerate: isDemoAdmin(req.user),
  });

  res.status(200).json({
    success: true,
    ...result,
  });
});

module.exports = {
  createCommunityPost,
  createCommunityPostComment,
  deleteCommunityPost,
  listCommunityFeed,
  listCommunityPostComments,
  toggleCommunityPostLike,
};
