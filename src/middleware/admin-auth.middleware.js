const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { verifyAdminAccessToken } = require('../utils/jwt');

async function requireAdminAuth(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
      throw new AppError('يتطلب هذا المسار تسجيل دخول الأدمن', 401);
    }
    let payload;
    try {
      payload = verifyAdminAccessToken(authorization.slice(7).trim());
    } catch (error) {
      if (error.statusCode) throw error;
      throw new AppError('رمز الأدمن غير صالح', 401);
    }
    const adminId = Number(payload.sub);
    const sessionId = Number(payload.sid);
    if (!Number.isInteger(adminId) || !Number.isInteger(sessionId)) {
      throw new AppError('رمز الأدمن غير صالح', 401);
    }
    const session = await prisma.adminAuthSession.findUnique({
      where: { id: sessionId },
      select: {
        adminId: true,
        revokedAt: true,
        expiresAt: true,
        admin: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (
      !session ||
      session.adminId !== adminId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.admin.isActive
    ) {
      throw new AppError('جلسة الأدمن غير صالحة أو منتهية', 401);
    }
    if (
      session.admin.mustChangePassword &&
      req.path !== '/change-password'
    ) {
      throw new AppError('يجب تغيير كلمة المرور قبل استخدام واجهات الأدمن', 403);
    }
    req.user = { ...session.admin, accountType: 'ADMIN' };
    req.authRole = 'ADMIN';
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAdminAuth };
