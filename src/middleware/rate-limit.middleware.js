const crypto = require('crypto');
const prisma = require('../lib/prisma');
const AppError = require('../utils/app-error');

function createPersistentRateLimit({ name, limit, windowMs }) {
  if (!name || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1000) {
    throw new Error('Invalid persistent rate-limit configuration');
  }
  return async (req, _res, next) => {
    try {
      const now = Date.now();
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
      const key = crypto
        .createHash('sha256')
        .update(`${name}:${req.user?.accountType || 'anonymous'}:${req.user?.id || req.ip}:${windowStart.toISOString()}`)
        .digest('hex');
      const bucket = await prisma.rateLimitBucket.upsert({
        where: { key_windowFrom: { key, windowFrom: windowStart } },
        create: { key, windowFrom: windowStart, expiresAt, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      if (bucket.count > limit) {
        next(new AppError('تم تجاوز عدد الطلبات المسموح، حاول مرة أخرى لاحقًا', 429));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createPersistentRateLimit };
