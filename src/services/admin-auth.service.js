const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminRefreshToken,
} = require('../utils/jwt');
const {
  validateAdminLoginPayload,
  validatePasswordChangePayload,
} = require('../validators/admin-auth.validators');
const { writeAuditLog } = require('./audit.service');

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function expiryDate(duration) {
  const match = String(duration).match(/^(\d+)([smhd])$/i);
  if (!match) return new Date(Date.now() + 12 * 60 * 60 * 1000);
  const scale = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
  return new Date(Date.now() + Number(match[1]) * scale);
}

function serializeAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: 'ADMIN',
    isActive: admin.isActive,
    mustChangePassword: admin.mustChangePassword,
    createdAt: admin.createdAt,
  };
}

async function createSession(admin, context = {}) {
  const session = await prisma.adminAuthSession.create({
    data: {
      adminId: admin.id,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: expiryDate(process.env.ADMIN_JWT_REFRESH_EXPIRES_IN || '12h'),
    },
  });
  const refreshToken = generateAdminRefreshToken(admin, session.id);
  await prisma.adminAuthSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashRefreshToken(refreshToken) },
  });
  return {
    accessToken: generateAdminAccessToken(admin, session.id),
    refreshToken,
  };
}

function buildResponse(admin, tokens, message) {
  return { message, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, admin: serializeAdmin(admin) };
}

async function login(payload, context) {
  const data = validateAdminLoginPayload(payload);
  const admin = await prisma.admin.findUnique({ where: { email: data.email } });
  const passwordMatches = admin
    ? await bcrypt.compare(data.password, admin.passwordHash)
    : false;
  if (!passwordMatches || !admin.isActive) {
    throw new AppError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);
  }
  const tokens = await createSession(admin, context);
  return buildResponse(admin, tokens, 'تم تسجيل دخول الأدمن بنجاح');
}

async function refresh(payload, context) {
  const token = typeof payload.refreshToken === 'string' ? payload.refreshToken : '';
  if (!token) throw new AppError('refreshToken مطلوب', 400);
  let claims;
  try {
    claims = verifyAdminRefreshToken(token);
  } catch (error) {
    if (error.statusCode) throw error;
    throw new AppError('رمز التحديث غير صالح', 401);
  }
  const adminId = Number(claims.sub);
  const sessionId = Number(claims.sid);
  if (!Number.isInteger(adminId) || !Number.isInteger(sessionId)) {
    throw new AppError('رمز التحديث غير صالح', 401);
  }
  const session = await prisma.adminAuthSession.findUnique({
    where: { id: sessionId },
    include: { admin: true },
  });
  if (
    !session ||
    session.adminId !== adminId ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.refreshTokenHash ||
    session.refreshTokenHash !== hashRefreshToken(token) ||
    !session.admin.isActive
  ) {
    throw new AppError('الجلسة غير صالحة أو انتهت', 401);
  }
  const nextRefreshToken = generateAdminRefreshToken(session.admin, session.id);
  await prisma.adminAuthSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashRefreshToken(nextRefreshToken),
      userAgent: context.userAgent ?? session.userAgent,
      ipAddress: context.ipAddress ?? session.ipAddress,
      expiresAt: expiryDate(process.env.ADMIN_JWT_REFRESH_EXPIRES_IN || '12h'),
    },
  });
  const tokens = {
    accessToken: generateAdminAccessToken(session.admin, session.id),
    refreshToken: nextRefreshToken,
  };
  return buildResponse(session.admin, tokens, 'تم تحديث جلسة الأدمن');
}

async function logout(payload) {
  const token = typeof payload.refreshToken === 'string' ? payload.refreshToken : '';
  if (!token) throw new AppError('refreshToken مطلوب', 400);
  let claims;
  try {
    claims = verifyAdminRefreshToken(token);
  } catch (error) {
    if (error.statusCode) throw error;
    return { message: 'تم تسجيل الخروج' };
  }
  const sessionId = Number(claims.sid);
  if (Number.isInteger(sessionId)) {
    await prisma.adminAuthSession.updateMany({
      where: { id: sessionId, refreshTokenHash: hashRefreshToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  return { message: 'تم تسجيل الخروج' };
}

async function changePassword(admin, payload) {
  const data = validatePasswordChangePayload(payload);
  const currentAdmin = await prisma.admin.findUnique({
    where: { id: admin.id },
    select: { passwordHash: true },
  });
  if (!currentAdmin) throw new AppError('حساب الأدمن غير موجود', 404);
  const matches = await bcrypt.compare(data.currentPassword, currentAdmin.passwordHash);
  if (!matches) throw new AppError('كلمة المرور الحالية غير صحيحة', 401);
  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  await prisma.$transaction(async (transactionClient) => {
    await transactionClient.admin.update({
      where: { id: admin.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await transactionClient.adminAuthSession.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(
      {
        adminId: admin.id,
        action: 'ADMIN_PASSWORD_CHANGED',
        targetType: 'ADMIN',
        targetId: admin.id,
      },
      transactionClient,
    );
  });
  return { message: 'تم تغيير كلمة المرور. سجّل الدخول مجددًا.' };
}

module.exports = { changePassword, login, logout, refresh, serializeAdmin };
