const AppError = require('../utils/app-error');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function calculateAge(dateOfBirthValue) {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirthValue.getFullYear();
  const monthDifference = now.getMonth() - dateOfBirthValue.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && now.getDate() < dateOfBirthValue.getDate())
  ) {
    age -= 1;
  }

  return age;
}

function validateRegisterPayload(payload = {}) {
  const fullName = normalizeText(payload.fullName || payload.name);
  const nationalId = normalizeText(payload.nationalId);
  const email = normalizeText(payload.email).toLowerCase();
  const phone = normalizeText(payload.phone);
  const password = normalizeText(payload.password);
  const confirmPassword = normalizeText(payload.confirmPassword);
  const dateOfBirth = normalizeText(payload.dateOfBirth);
  const city = normalizeText(payload.city) || null;
  const gender = normalizeText(payload.gender) || null;

  if (fullName.length < 3) {
    throw new AppError('الاسم يجب أن يكون 3 أحرف على الأقل', 400);
  }

  if (!/^[2-3][0-9]{13}$/.test(nationalId)) {
    throw new AppError('الرجاء إدخال رقم قومي صالح مكون من 14 رقم', 400);
  }

  if (!/^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    throw new AppError('من فضلك أدخل بريد إلكتروني صحيح', 400);
  }

  if (!/^[0-9]{10,15}$/.test(phone)) {
    throw new AppError('من فضلك أدخل رقم هاتف صحيح', 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new AppError('صيغة تاريخ الميلاد يجب أن تكون YYYY-MM-DD', 400);
  }

  const parsedDateOfBirth = new Date(dateOfBirth);

  if (Number.isNaN(parsedDateOfBirth.getTime())) {
    throw new AppError('تاريخ الميلاد غير صالح', 400);
  }

  const age = calculateAge(parsedDateOfBirth);

  if (age < 10 || age > 100) {
    throw new AppError('العمر يجب أن يكون بين 10 و 100 سنة', 400);
  }

  if (password.length < 6) {
    throw new AppError('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 400);
  }

  if (!confirmPassword) {
    throw new AppError('الرجاء تأكيد كلمة المرور', 400);
  }

  if (password !== confirmPassword) {
    throw new AppError('كلمة المرور غير متطابقة', 400);
  }

  const allowedGenders = new Set(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']);

  if (gender && !allowedGenders.has(gender)) {
    throw new AppError('قيمة النوع غير صحيحة', 400);
  }

  return {
    fullName,
    nationalId,
    email,
    phone,
    city,
    dateOfBirth,
    gender,
    password,
  };
}

function validateLoginPayload(payload = {}) {
  const nationalId = normalizeText(payload.nationalId);
  const password = normalizeText(payload.password);

  if (!/^[2-3][0-9]{13}$/.test(nationalId)) {
    throw new AppError('الرجاء إدخال رقم قومي صالح مكون من 14 رقم', 400);
  }

  if (!password) {
    throw new AppError('الرجاء إدخال كلمة المرور', 400);
  }

  return {
    nationalId,
    password,
  };
}

function validateRefreshTokenPayload(payload = {}) {
  const refreshToken = normalizeText(payload.refreshToken);

  if (!refreshToken) {
    throw new AppError('رمز التحديث مطلوب', 400);
  }

  return {
    refreshToken,
  };
}

module.exports = {
  validateLoginPayload,
  validateRefreshTokenPayload,
  validateRegisterPayload,
};
