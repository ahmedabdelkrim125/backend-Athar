const AppError = require('../utils/app-error');

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new AppError('البريد الإلكتروني مطلوب', 400);
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('البريد الإلكتروني غير صالح', 400);
  }
  return email;
}

function validatePassword(value, { minimum = 12 } = {}) {
  if (typeof value !== 'string' || value.length < minimum || value.length > 128) {
    throw new AppError(`كلمة المرور يجب أن تكون بين ${minimum} و128 حرفًا`, 400);
  }
  return value;
}

function validateAdminLoginPayload(payload = {}) {
  return {
    email: normalizeEmail(payload.email),
    password: validatePassword(payload.password, { minimum: 1 }),
  };
}

function validateAdminCreatePayload(payload = {}) {
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 120) {
    throw new AppError('الاسم يجب أن يكون بين 2 و120 حرفًا', 400);
  }
  return {
    fullName,
    email: normalizeEmail(payload.email),
    password: validatePassword(payload.password),
  };
}

function validateAdminUpdatePayload(payload = {}) {
  const update = {};
  if (payload.email !== undefined) update.email = normalizeEmail(payload.email);
  if (payload.fullName !== undefined) {
    const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
    if (fullName.length < 2 || fullName.length > 120) {
      throw new AppError('الاسم يجب أن يكون بين 2 و120 حرفًا', 400);
    }
    update.fullName = fullName;
  }
  if (payload.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') {
      throw new AppError('isActive يجب أن تكون قيمة منطقية', 400);
    }
    update.isActive = payload.isActive;
  }
  if (Object.keys(update).length === 0) {
    throw new AppError('أرسل الاسم أو حالة الحساب للتحديث', 400);
  }
  return update;
}

function validatePasswordChangePayload(payload = {}, { requireCurrent = true } = {}) {
  const currentPassword =
    typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
  if (requireCurrent && !currentPassword) {
    throw new AppError('كلمة المرور الحالية مطلوبة', 400);
  }
  const newPassword = validatePassword(payload.newPassword);
  if (requireCurrent && currentPassword === newPassword) {
    throw new AppError('كلمة المرور الجديدة يجب أن تختلف عن الحالية', 400);
  }
  return { currentPassword, newPassword };
}

module.exports = {
  normalizeEmail,
  validateAdminCreatePayload,
  validateAdminLoginPayload,
  validateAdminUpdatePayload,
  validatePassword,
  validatePasswordChangePayload,
};
