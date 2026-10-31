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

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
