const jwt = require('jsonwebtoken');

const env = require('../config/env');

function ensureTokenType(payload, expectedType) {
  if (payload.type !== expectedType) {
    throw new jwt.JsonWebTokenError('نوع الرمز غير صالح');
  }
}

function generateAccessToken(volunteer) {
  return jwt.sign(
    {
      sub: volunteer.id,
      nationalId: volunteer.nationalId,
      type: 'access',
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtAccessExpiresIn,
    },
  );
}

function generateRefreshToken(volunteer, sessionId) {
  return jwt.sign(
    {
      sub: volunteer.id,
      sid: sessionId,
      type: 'refresh',
    },
    env.jwtRefreshSecret,
    {
      expiresIn: env.jwtRefreshExpiresIn,
    },
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  ensureTokenType(payload, 'access');
  return payload;
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.jwtRefreshSecret);
  ensureTokenType(payload, 'refresh');
  return payload;
}

function getAdminSecret(secret, name) {
  if (!secret || secret.length < 32) {
    const error = new Error(`${name} must be configured with at least 32 characters`);
    error.statusCode = 503;
    throw error;
  }
  return secret;
}

function generateAdminAccessToken(admin, sessionId) {
  return jwt.sign(
    { sub: admin.id, sid: sessionId, type: 'admin-access' },
    getAdminSecret(env.adminJwtSecret, 'ADMIN_JWT_SECRET'),
    { expiresIn: env.adminJwtAccessExpiresIn },
  );
}

function generateAdminRefreshToken(admin, sessionId) {
  return jwt.sign(
    { sub: admin.id, sid: sessionId, type: 'admin-refresh' },
    getAdminSecret(env.adminJwtRefreshSecret, 'ADMIN_JWT_REFRESH_SECRET'),
    { expiresIn: env.adminJwtRefreshExpiresIn },
  );
}

function verifyAdminAccessToken(token) {
  const payload = jwt.verify(
    token,
    getAdminSecret(env.adminJwtSecret, 'ADMIN_JWT_SECRET'),
  );
  ensureTokenType(payload, 'admin-access');
  return payload;
}

function verifyAdminRefreshToken(token) {
  const payload = jwt.verify(
    token,
    getAdminSecret(env.adminJwtRefreshSecret, 'ADMIN_JWT_REFRESH_SECRET'),
  );
  ensureTokenType(payload, 'admin-refresh');
  return payload;
}

module.exports = {
  generateAccessToken,
  generateAdminAccessToken,
  generateAdminRefreshToken,
  generateRefreshToken,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
