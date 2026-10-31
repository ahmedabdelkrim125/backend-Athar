const crypto = require('crypto');

const bcrypt = require('bcryptjs');

const env = require('../config/env');
const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');
const {
  validateLoginPayload,
  validateRefreshTokenPayload,
  validateRegisterPayload,
} = require('../validators/auth.validators');
const {
  buildAvatarUrl,
  buildMemberSinceLabel,
  buildStatusLabel,
} = require('../utils/profile-helpers');

const userCountSelection = {
  campaignsCreated: true,
  assignedTasks: true,
  volunteerBadges: true,
};

function sanitizeUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    nationalId: user.nationalId,
    email: user.email,
    phone: user.phone,
    avatarUrl: buildAvatarUrl(user),
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    city: user.city,
    joinDate: user.joinDate,
    memberSinceLabel: buildMemberSinceLabel(user.joinDate),
    status: user.status,
    statusLabel: buildStatusLabel(user.status),
    totalHours: user.totalHours,
    points: user.points,
    createdAt: user.createdAt,
    stats: {
      campaignsCreated: user._count?.campaignsCreated ?? 0,
      assignedTasks: user._count?.assignedTasks ?? 0,
      badges: user._count?.volunteerBadges ?? 0,
    },
  };
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildExpiryDate(duration) {
  const normalizedDuration = String(duration || '').trim();
  const match = normalizedDuration.match(/^(\d+)([smhd])$/i);

  if (!match) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitToMilliseconds = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + value * unitToMilliseconds[unit]);
}

function buildAuthResponse(user, message, tokens) {
  return {
    message,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: sanitizeUser(user),
  };
}

function buildUserInclude() {
  return {
    _count: {
      select: userCountSelection,
    },
  };
}

async function createSession(dbClient, user, sessionContext = {}) {
  const session = await dbClient.authSession.create({
    data: {
      volunteerId: user.id,
      userAgent: sessionContext.userAgent,
      ipAddress: sessionContext.ipAddress,
      expiresAt: buildExpiryDate(env.jwtRefreshExpiresIn),
    },
  });

  const refreshToken = generateRefreshToken(user, session.id);

  await dbClient.authSession.update({
    where: {
      id: session.id,
    },
    data: {
      refreshTokenHash: hashRefreshToken(refreshToken),
    },
  });

  return {
    accessToken: generateAccessToken(user),
    refreshToken,
  };
}

async function rotateSession(session, user, sessionContext = {}) {
  const refreshToken = generateRefreshToken(user, session.id);

  await prisma.authSession.update({
    where: {
      id: session.id,
    },
    data: {
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: sessionContext.userAgent ?? session.userAgent,
      ipAddress: sessionContext.ipAddress ?? session.ipAddress,
      expiresAt: buildExpiryDate(env.jwtRefreshExpiresIn),
      revokedAt: null,
    },
  });

  return {
    accessToken: generateAccessToken(user),
    refreshToken,
  };
}

function ensureActiveVolunteer(user) {
  if (!user) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
    throw new AppError('هذا الحساب غير مسموح له بالدخول حاليًا', 403);
  }
}

async function register(payload, sessionContext) {
  const validatedPayload = validateRegisterPayload(payload);
  const conflictingUser = await prisma.volunteer.findFirst({
    where: {
      OR: [
        { nationalId: validatedPayload.nationalId },
        { email: validatedPayload.email },
        { phone: validatedPayload.phone },
      ],
    },
  });

  if (conflictingUser) {
    if (conflictingUser.nationalId === validatedPayload.nationalId) {
      throw new AppError('الرقم القومي مسجل بالفعل', 409);
    }

    if (conflictingUser.email === validatedPayload.email) {
      throw new AppError('البريد الإلكتروني مسجل بالفعل', 409);
    }

    throw new AppError('رقم الهاتف مسجل بالفعل', 409);
  }

  const passwordHash = await bcrypt.hash(validatedPayload.password, 10);

  const result = await prisma.$transaction(async (transactionClient) => {
    const user = await transactionClient.volunteer.create({
      data: {
        fullName: validatedPayload.fullName,
        nationalId: validatedPayload.nationalId,
        email: validatedPayload.email,
        phone: validatedPayload.phone,
        passwordHash,
        dateOfBirth: new Date(validatedPayload.dateOfBirth),
        gender: validatedPayload.gender,
        city: validatedPayload.city,
        status: 'ACTIVE',
      },
      include: buildUserInclude(),
    });

    const tokens = await createSession(transactionClient, user, sessionContext);

    return {
      user,
      tokens,
    };
  });

  return buildAuthResponse(result.user, 'تم إنشاء الحساب بنجاح', result.tokens);
}

async function login(payload, sessionContext) {
  const validatedPayload = validateLoginPayload(payload);
  const user = await prisma.volunteer.findUnique({
    where: {
      nationalId: validatedPayload.nationalId,
    },
    include: buildUserInclude(),
  });

  if (!user) {
    throw new AppError('الرقم القومي أو كلمة المرور غير صحيحة', 401);
  }

  ensureActiveVolunteer(user);

  const isPasswordValid = await bcrypt.compare(
    validatedPayload.password,
    user.passwordHash,
  );

  if (!isPasswordValid) {
    throw new AppError('الرقم القومي أو كلمة المرور غير صحيحة', 401);
  }

  const tokens = await createSession(prisma, user, sessionContext);

  return buildAuthResponse(user, 'تم تسجيل الدخول بنجاح', tokens);
}

async function getProfile(volunteerId) {
  const user = await prisma.volunteer.findUnique({
    where: {
      id: volunteerId,
    },
    include: buildUserInclude(),
  });

  if (!user) {
    throw new AppError('المستخدم غير موجود', 404);
  }

  return {
    message: 'تم جلب بيانات المستخدم بنجاح',
    user: sanitizeUser(user),
  };
}

async function refreshSession(payload, sessionContext) {
  const { refreshToken } = validateRefreshTokenPayload(payload);
  const decodedPayload = verifyRefreshToken(refreshToken);
  const volunteerId = Number(decodedPayload.sub);
  const sessionId = Number(decodedPayload.sid);

  if (!Number.isInteger(volunteerId) || !Number.isInteger(sessionId)) {
    throw new AppError('رمز التحديث غير صالح', 401);
  }

  const session = await prisma.authSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      volunteer: {
        include: buildUserInclude(),
      },
    },
  });

  if (!session || session.volunteerId !== volunteerId) {
    throw new AppError('الجلسة غير صالحة أو انتهت', 401);
  }

  if (session.revokedAt || session.expiresAt <= new Date()) {
    throw new AppError('الجلسة غير صالحة أو انتهت', 401);
  }

  if (!session.refreshTokenHash || session.refreshTokenHash !== hashRefreshToken(refreshToken)) {
    throw new AppError('رمز التحديث غير صالح', 401);
  }

  ensureActiveVolunteer(session.volunteer);

  const tokens = await rotateSession(session, session.volunteer, sessionContext);

  return buildAuthResponse(session.volunteer, 'تم تحديث الجلسة بنجاح', tokens);
}

async function logout(payload) {
  const { refreshToken } = validateRefreshTokenPayload(payload);
  const decodedPayload = verifyRefreshToken(refreshToken);
  const sessionId = Number(decodedPayload.sid);

  if (!Number.isInteger(sessionId)) {
    throw new AppError('رمز التحديث غير صالح', 401);
  }

  const session = await prisma.authSession.findUnique({
    where: {
      id: sessionId,
    },
  });

  if (
    session &&
    session.refreshTokenHash &&
    session.refreshTokenHash === hashRefreshToken(refreshToken) &&
    !session.revokedAt
  ) {
    await prisma.authSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  return {
    message: 'تم تسجيل الخروج بنجاح',
  };
}

async function logoutAll(volunteerId) {
  await prisma.authSession.updateMany({
    where: {
      volunteerId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return {
    message: 'تم إنهاء كل الجلسات بنجاح',
  };
}

module.exports = {
  getProfile,
  login,
  logout,
  logoutAll,
  refreshSession,
  register,
};
