const AppError = require('./app-error');

function assertMissionCheckInEligible(task, assignment, joinRequest, now = new Date()) {
  if (task.approvalStatus !== 'APPROVED') {
    throw new AppError('لم يتم اعتماد المهمة بعد', 403);
  }
  if (joinRequest?.status !== 'APPROVED') {
    throw new AppError('يجب قبول طلب انضمامك قبل تسجيل الحضور', 403);
  }
  if (
    ['CANCELLED', 'COMPLETED'].includes(task.status) ||
    ['CANCELLED', 'COMPLETED'].includes(task.campaign.status)
  ) {
    throw new AppError('تم إلغاء المهمة أو انتهت', 409);
  }
  if (!['PUBLISHED', 'ACTIVE'].includes(task.campaign.status)) {
    throw new AppError('الحملة غير متاحة لتسجيل الحضور', 409);
  }
  if (assignment.status === 'COMPLETED') {
    throw new AppError('تم إنهاء هذه المهمة بالفعل', 400);
  }
  if (['CHECKED_IN', 'CHECKED_OUT'].includes(assignment.status)) {
    throw new AppError('تم تسجيل الحضور لهذه المهمة مسبقًا', 409);
  }

  const taskDate = new Date(task.date).toISOString().slice(0, 10);
  const campaignStart = task.campaign.startDate
    ? new Date(task.campaign.startDate).toISOString().slice(0, 10)
    : null;
  const campaignEnd = task.campaign.endDate
    ? new Date(task.campaign.endDate).toISOString().slice(0, 10)
    : null;
  const currentDate = now.toISOString().slice(0, 10);
  const startTime = task.startTime || task.campaign.startTime;
  const endTime = task.endTime || task.campaign.endTime;
  const toMinutes = (value) => {
    if (!value) return null;
    const time = new Date(value);
    return time.getUTCHours() * 60 + time.getUTCMinutes();
  };
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (
    taskDate !== currentDate ||
    (campaignStart && taskDate < campaignStart) ||
    (campaignEnd && taskDate > campaignEnd) ||
    (startTime && currentMinutes < toMinutes(startTime)) ||
    (endTime && currentMinutes > toMinutes(endTime))
  ) {
    throw new AppError('الحضور متاح فقط خلال موعد المهمة', 409);
  }
}

function assertManualAssignmentUpdateAllowed(assignment, payload, isTaskOwner) {
  if (assignment.status === 'COMPLETED') {
    throw new AppError('لا يمكن تعديل الإسناد بعد اعتماد التقرير', 409);
  }
  if (payload.checkInTime !== undefined) {
    throw new AppError('يتم تسجيل وقت الحضور من خلال واجهة تسجيل الحضور فقط', 409);
  }
  if (['CHECKED_IN', 'COMPLETED'].includes(payload.status)) {
    throw new AppError('لا يمكن تغيير حالة الحضور أو الإكمال يدويًا', 409);
  }
  if (payload.status === 'CHECKED_OUT' && assignment.status !== 'CHECKED_IN') {
    throw new AppError('يجب تسجيل الحضور قبل تسجيل الانصراف', 409);
  }
  if (
    payload.status === 'CHECKED_OUT' &&
    payload.checkOutTime === undefined &&
    !assignment.checkOutTime
  ) {
    throw new AppError('وقت تسجيل الانصراف مطلوب', 400);
  }
  if (
    ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(assignment.status) &&
    payload.status &&
    payload.status !== 'CHECKED_OUT'
  ) {
    throw new AppError('لا يمكن الرجوع عن حالة حضور مسجلة', 409);
  }
  if (
    payload.checkOutTime !== undefined &&
    assignment.status === 'CHECKED_IN' &&
    payload.status !== 'CHECKED_OUT'
  ) {
    throw new AppError('يجب تسجيل الانصراف بعد تسجيل الحضور', 409);
  }
  if (payload.hoursWorked !== undefined && !isTaskOwner) {
    throw new AppError('لا يمكن للمتطوع تعديل ساعات المهمة يدويًا', 403);
  }
}

module.exports = {
  assertManualAssignmentUpdateAllowed,
  assertMissionCheckInEligible,
};
