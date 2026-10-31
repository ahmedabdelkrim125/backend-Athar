const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  serializePagination,
  serializeVolunteerSummary,
} = require('../utils/serializers');
const {
  parsePositiveInteger,
  validateCommunityCommentCreatePayload,
  validateCommunityFeedQuery,
  validateCommunityPostCreatePayload,
} = require('../validators/resource.validators');
const { findFeaturedAnnouncement } = require('./announcement.service');

const volunteerSummarySelect = {
  id: true,
  fullName: true,
  nationalId: true,
  email: true,
  phone: true,
  avatarUrl: true,
  status: true,
};

function buildPostInclude(currentVolunteerId) {
  return {
    volunteer: {
      select: volunteerSummarySelect,
    },
    _count: {
      select: {
        likes: true,
        comments: true,
      },
    },
    likes: {
      where: {
        volunteerId: currentVolunteerId,
      },
      select: {
        id: true,
      },
    },
  };
}

function serializeCommunityPost(post) {
  return {
    id: post.id,
    content: post.content,
    image: post.image,
    createdAt: post.createdAt?.toISOString() ?? null,
    updatedAt: post.updatedAt?.toISOString() ?? null,
    volunteer: serializeVolunteerSummary(post.volunteer),
    stats: {
      likes: post._count?.likes ?? 0,
      comments: post._count?.comments ?? 0,
    },
    likedByMe: Array.isArray(post.likes) ? post.likes.length > 0 : false,
  };
}

function serializeCommunityComment(comment) {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt?.toISOString() ?? null,
    volunteer: serializeVolunteerSummary(comment.volunteer),
  };
}

async function getPostOrThrow(postId, currentVolunteerId) {
  const post = await prisma.communityPost.findUnique({
    where: {
      id: postId,
    },
    include: buildPostInclude(currentVolunteerId),
  });

  if (!post) {
    throw new AppError('المنشور غير موجود', 404);
  }

  return post;
}

async function listCommunityFeed(query = {}, currentVolunteerId) {
  const filters = validateCommunityFeedQuery(query);

  const [featuredAnnouncement, posts, total] = await Promise.all([
    findFeaturedAnnouncement(),
    prisma.communityPost.findMany({
      include: buildPostInclude(currentVolunteerId),
      orderBy: {
        createdAt: 'desc',
      },
      skip: filters.skip,
      take: filters.limit,
    }),
    prisma.communityPost.count(),
  ]);

  return {
    message: 'تم جلب مجتمع سند بنجاح',
    featuredAnnouncement,
    pagination: serializePagination(filters.page, filters.limit, total),
    posts: posts.map(serializeCommunityPost),
  };
}

async function createCommunityPost(payload, currentVolunteerId) {
  const validatedPayload = validateCommunityPostCreatePayload(payload);

  const post = await prisma.communityPost.create({
    data: {
      volunteerId: currentVolunteerId,
      content: validatedPayload.content,
      image: validatedPayload.image,
    },
    include: buildPostInclude(currentVolunteerId),
  });

  return {
    message: 'تم إنشاء المنشور بنجاح',
    post: serializeCommunityPost(post),
  };
}

async function toggleCommunityPostLike(postId, currentVolunteerId) {
  const parsedPostId = parsePositiveInteger(postId, 'معرف المنشور');
  await getPostOrThrow(parsedPostId, currentVolunteerId);

  const existingLike = await prisma.communityPostLike.findUnique({
    where: {
      postId_volunteerId: {
        postId: parsedPostId,
        volunteerId: currentVolunteerId,
      },
    },
  });

  if (existingLike) {
    await prisma.communityPostLike.delete({
      where: {
        id: existingLike.id,
      },
    });
  } else {
    await prisma.communityPostLike.create({
      data: {
        postId: parsedPostId,
        volunteerId: currentVolunteerId,
      },
    });
  }

  const updatedPost = await getPostOrThrow(parsedPostId, currentVolunteerId);

  return {
    message: existingLike ? 'تم إزالة الإعجاب بنجاح' : 'تم تسجيل الإعجاب بنجاح',
    post: serializeCommunityPost(updatedPost),
  };
}

async function listCommunityPostComments(postId) {
  const parsedPostId = parsePositiveInteger(postId, 'معرف المنشور');
  const post = await prisma.communityPost.findUnique({
    where: {
      id: parsedPostId,
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    throw new AppError('المنشور غير موجود', 404);
  }

  const comments = await prisma.communityPostComment.findMany({
    where: {
      postId: parsedPostId,
    },
    include: {
      volunteer: {
        select: volunteerSummarySelect,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    message: 'تم جلب التعليقات بنجاح',
    comments: comments.map(serializeCommunityComment),
  };
}

async function createCommunityPostComment(postId, payload, currentVolunteerId) {
  const parsedPostId = parsePositiveInteger(postId, 'معرف المنشور');
  const validatedPayload = validateCommunityCommentCreatePayload(payload);

  const post = await prisma.communityPost.findUnique({
    where: {
      id: parsedPostId,
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    throw new AppError('المنشور غير موجود', 404);
  }

  const comment = await prisma.communityPostComment.create({
    data: {
      postId: parsedPostId,
      volunteerId: currentVolunteerId,
      content: validatedPayload.content,
    },
    include: {
      volunteer: {
        select: volunteerSummarySelect,
      },
    },
  });

  return {
    message: 'تم إضافة التعليق بنجاح',
    comment: serializeCommunityComment(comment),
  };
}

async function deleteCommunityPost(postId, currentVolunteerId, options = {}) {
  const parsedPostId = parsePositiveInteger(postId, 'معرف المنشور');
  const post = await prisma.communityPost.findUnique({
    where: {
      id: parsedPostId,
    },
    select: {
      id: true,
      volunteerId: true,
    },
  });

  if (!post) {
    throw new AppError('المنشور غير موجود', 404);
  }

  const canModerate = options.canModerate === true;

  if (!canModerate && post.volunteerId !== currentVolunteerId) {
    throw new AppError('غير مسموح لك بحذف هذا المنشور', 403);
  }

  await prisma.$transaction([
    prisma.communityPostLike.deleteMany({
      where: {
        postId: parsedPostId,
      },
    }),
    prisma.communityPostComment.deleteMany({
      where: {
        postId: parsedPostId,
      },
    }),
    prisma.communityPost.delete({
      where: {
        id: parsedPostId,
      },
    }),
  ]);

  return {
    message: 'تم حذف المنشور بنجاح',
    deletedPostId: parsedPostId,
  };
}

module.exports = {
  createCommunityPost,
  createCommunityPostComment,
  deleteCommunityPost,
  listCommunityFeed,
  listCommunityPostComments,
  toggleCommunityPostLike,
};
