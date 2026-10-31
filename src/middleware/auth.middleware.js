const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');
const { verifyAccessToken } = require('../utils/jwt');

async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || '';

    if (!authorizationHeader.startsWith('Bearer ')) {
      throw new AppError('يجب تسجيل الدخول أولًا', 401);
    }

    const token = authorizationHeader.replace('Bearer ', '').trim();
    const payload = verifyAccessToken(token);
    const volunteerId = Number(payload.sub);

    if (!Number.isInteger(volunteerId)) {
      throw new AppError('رمز الدخول غير صالح', 401);
    }

    const volunteer = await prisma.volunteer.findUnique({
      where: {
        id: volunteerId,
      },
    });

    if (!volunteer) {
      throw new AppError('المستخدم غير موجود', 401);
    }

    if (volunteer.status === 'SUSPENDED' || volunteer.status === 'INACTIVE') {
      throw new AppError('هذا الحساب غير مسموح له بالدخول حاليًا', 403);
    }

    req.user = volunteer;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireAuth,
};
