const AppError = require('../utils/app-error');

function validateReportDecisionPayload(status, payload = {}) {
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new AppError('قرار مراجعة التقرير غير صالح', 400);
  }
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (status === 'REJECTED' && (reason.length < 3 || reason.length > 1000)) {
    throw new AppError('سبب الرفض مطلوب ويجب أن يكون بين 3 و1000 حرف', 400);
  }
  return { reason: status === 'REJECTED' ? reason : null };
}

module.exports = { validateReportDecisionPayload };
