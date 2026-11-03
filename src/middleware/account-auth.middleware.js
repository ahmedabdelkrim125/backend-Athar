const jwt = require('jsonwebtoken');
const { requireAdminAuth } = require('./admin-auth.middleware');
const { requireAuth } = require('./auth.middleware');

function requireAccountAuth(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const claims = token ? jwt.decode(token) : null;
  if (claims?.type === 'admin-access') {
    return requireAdminAuth(req, res, next);
  }
  return requireAuth(req, res, next);
}

module.exports = { requireAccountAuth };
