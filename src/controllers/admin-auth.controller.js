const adminAuthService = require('../services/admin-auth.service');
const asyncHandler = require('../utils/async-handler');

function sessionContext(req) {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

const login = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await adminAuthService.login(req.body, sessionContext(req))),
  });
});

const refresh = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await adminAuthService.refresh(req.body, sessionContext(req))),
  });
});

const logout = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, ...(await adminAuthService.logout(req.body)) });
});

const changePassword = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    ...(await adminAuthService.changePassword(req.user, req.body)),
  });
});

module.exports = { changePassword, login, logout, refresh };
