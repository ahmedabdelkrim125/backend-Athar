const AppError = require('../utils/app-error');
const prisma = require('../lib/prisma');

const ADMIN_PERMISSIONS = new Set([
  'dashboard:read',
  'accounts:manage',
  'campaigns:manage',
  'missions:review',
  'joinRequests:manage',
  'volunteers:read',
  'locations:read',
  'emergencies:manage',
  'reports:read',
  'audit:read',
  'notifications:manage',
]);

const PERMISSIONS_BY_ROLE = Object.freeze({
  ADMIN: ADMIN_PERMISSIONS,
  VOLUNTEER: new Set(),
});

function getEffectiveRole(user) {
  if (user?.accountType === 'ADMIN' && user.role === 'ADMIN') return 'ADMIN';
  return 'VOLUNTEER';
}

function hasPermission(user, permission) {
  return (
    getEffectiveRole(user) === 'ADMIN' &&
    (ADMIN_PERMISSIONS.has(permission) || ADMIN_PERMISSIONS.has('*'))
  );
}

function requirePermission(permission) {
  return (req, _res, next) => {
    if (!hasPermission(req.user, permission)) {
      next(new AppError('ليس لديك صلاحية تنفيذ هذا الإجراء', 403));
      return;
    }
    req.authRole = 'ADMIN';
    next();
  };
}

function requireAnyPermission(...permissions) {
  return (req, _res, next) => {
    if (!permissions.some((permission) => hasPermission(req.user, permission))) {
      next(new AppError('ليس لديك صلاحية تنفيذ هذا الإجراء', 403));
      return;
    }
    req.authRole = 'ADMIN';
    next();
  };
}

function canManageCampaign(user) {
  return hasPermission(user, 'campaigns:manage');
}

async function canManageCampaignById(actor, campaign, dbClient = prisma) {
  if (actor?.accountType !== 'ADMIN' || actor.role !== 'ADMIN') return false;
  const admin = await dbClient.admin.findFirst({
    where: { id: actor.id, isActive: true, role: 'ADMIN' },
    select: { id: true },
  });
  return Boolean(admin && campaign);
}

async function canCreateCampaign(actor) {
  return hasPermission(actor, 'campaigns:manage');
}

module.exports = {
  PERMISSIONS_BY_ROLE,
  canCreateCampaign,
  canManageCampaign,
  canManageCampaignById,
  getEffectiveRole,
  hasPermission,
  requireAnyPermission,
  requirePermission,
};
