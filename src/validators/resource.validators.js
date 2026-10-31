const AppError = require('../utils/app-error');

const CAMPAIGN_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
];

const TASK_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

const VOLUNTEER_TASK_STATUSES = [
  'ASSIGNED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'COMPLETED',
  'CANCELLED',
];

const SOS_REQUEST_STATUSES = [
  'OPEN',
  'RESPONDED',
  'RESOLVED',
  'CANCELLED',
];

const ANNOUNCEMENT_SORT_FIELDS = ['CREATEDAT'];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function parseRequiredText(value, label, options = {}) {
  const normalizedValue = normalizeText(value);
  const minimumLength = options.minimumLength ?? 1;
  const maximumLength = options.maximumLength ?? null;

  if (normalizedValue.length < minimumLength) {
    throw new AppError(`${label} مطلوب`, 400);
  }

  if (maximumLength !== null && normalizedValue.length > maximumLength) {
    throw new AppError(`${label} يجب ألا يزيد عن ${maximumLength} حرف`, 400);
  }

  return normalizedValue;
}

function parseOptionalText(value, label, options = {}) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  const maximumLength = options.maximumLength ?? null;

  if (maximumLength !== null && normalizedValue.length > maximumLength) {
    throw new AppError(`${label} يجب ألا يزيد عن ${maximumLength} حرف`, 400);
  }

  return normalizedValue;
}

function parsePositiveInteger(value, label, options = {}) {
  const required = options.required ?? true;

  if (isBlank(value)) {
    if (!required) {
      return undefined;
    }

    throw new AppError(`${label} مطلوب`, 400);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new AppError(`${label} يجب أن يكون رقمًا صحيحًا أكبر من صفر`, 400);
  }

  return parsedValue;
}

function parseOptionalNonNegativeInteger(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    throw new AppError(`${label} يجب أن يكون رقمًا صحيحًا غير سالب`, 400);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new AppError(`${label} يجب أن يكون رقمًا صحيحًا غير سالب`, 400);
  }

  return parsedValue;
}

function parseEnumValue(value, label, allowedValues, options = {}) {
  const required = options.required ?? true;

  if (isBlank(value)) {
    if (!required) {
      return undefined;
    }

    throw new AppError(`${label} مطلوب`, 400);
  }

  const normalizedValue = normalizeText(value).toUpperCase();

  if (!allowedValues.includes(normalizedValue)) {
    throw new AppError(
      `${label} غير صالح. القيم المسموحة: ${allowedValues.join(', ')}`,
      400,
    );
  }

  return normalizedValue;
}

function parseDateOnly(value, label, options = {}) {
  const required = options.required ?? true;

  if (isBlank(value)) {
    if (!required) {
      return undefined;
    }

    throw new AppError(`${label} مطلوب`, 400);
  }

  const normalizedValue = normalizeText(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new AppError(`${label} يجب أن يكون بصيغة YYYY-MM-DD`, 400);
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError(`${label} غير صالح`, 400);
  }

  return parsedDate;
}

function parseDateTime(value, label, options = {}) {
  const required = options.required ?? true;

  if (isBlank(value)) {
    if (!required) {
      return undefined;
    }

    throw new AppError(`${label} مطلوب`, 400);
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError(`${label} غير صالح`, 400);
  }

  return parsedDate;
}

function parseNullableDateTimeField(payload, key, label) {
  if (!hasOwn(payload, key)) {
    return undefined;
  }

  if (payload[key] === null || isBlank(payload[key])) {
    return null;
  }

  return parseDateTime(payload[key], label);
}

function parseTimeValue(value, label, options = {}) {
  const required = options.required ?? true;

  if (isBlank(value)) {
    if (!required) {
      return undefined;
    }

    throw new AppError(`${label} مطلوب`, 400);
  }

  const normalizedValue = normalizeText(value);
  const timeMatch = normalizedValue.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!timeMatch) {
    throw new AppError(`${label} يجب أن يكون بصيغة HH:MM أو HH:MM:SS`, 400);
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = Number(timeMatch[3] || '00');

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new AppError(`${label} غير صالح`, 400);
  }

  return new Date(
    `1970-01-01T${timeMatch[1]}:${timeMatch[2]}:${String(seconds).padStart(2, '0')}.000Z`,
  );
}

function parseNullableTimeField(payload, key, label) {
  if (!hasOwn(payload, key)) {
    return undefined;
  }

  if (payload[key] === null || isBlank(payload[key])) {
    return null;
  }

  return parseTimeValue(payload[key], label);
}

function parseLatitude(value) {
  if (isBlank(value)) {
    throw new AppError('خط العرض مطلوب', 400);
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < -90 || parsedValue > 90) {
    throw new AppError('خط العرض يجب أن يكون بين -90 و 90', 400);
  }

  return parsedValue;
}

function parseLongitude(value) {
  if (isBlank(value)) {
    throw new AppError('خط الطول مطلوب', 400);
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < -180 || parsedValue > 180) {
    throw new AppError('خط الطول يجب أن يكون بين -180 و 180', 400);
  }

  return parsedValue;
}

function parseOptionalLatitude(value) {
  if (value === undefined) {
    return undefined;
  }

  return parseLatitude(value);
}

function parseOptionalLongitude(value) {
  if (value === undefined) {
    return undefined;
  }

  return parseLongitude(value);
}

function parseCoordinatesQuery(query = {}) {
  const latitude = parseOptionalLatitude(query.latitude);
  const longitude = parseOptionalLongitude(query.longitude);

  if ((latitude === undefined) !== (longitude === undefined)) {
    throw new AppError('يجب إرسال latitude و longitude معًا', 400);
  }

  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function validateCoordinatesPayload(payload = {}) {
  return {
    latitude: parseLatitude(payload.latitude),
    longitude: parseLongitude(payload.longitude),
  };
}

function parseBooleanQuery(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalizedValue = normalizeText(value).toLowerCase();

  if (['true', '1', 'yes'].includes(normalizedValue)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalizedValue)) {
    return false;
  }

  throw new AppError('قيمة boolean غير صالحة في الاستعلام', 400);
}

function parsePaginationQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'رقم الصفحة', { required: false }) || 1;
  const limit = parsePositiveInteger(query.limit, 'عدد العناصر', { required: false }) || 20;

  if (limit > 100) {
    throw new AppError('عدد العناصر في الصفحة يجب ألا يزيد عن 100', 400);
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function parseImages(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new AppError('الصور يجب أن تكون مصفوفة من الروابط النصية', 400);
  }

  return value.map((item, index) => {
    const imageUrl = normalizeText(item);

    if (!imageUrl) {
      throw new AppError(`رابط الصورة رقم ${index + 1} غير صالح`, 400);
    }

    return imageUrl;
  });
}

function parseRating(value, options = {}) {
  const required = options.required ?? false;

  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    if (!required) {
      return null;
    }

    throw new AppError('التقييم مطلوب', 400);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 5) {
    throw new AppError('التقييم يجب أن يكون رقمًا صحيحًا بين 1 و 5', 400);
  }

  return parsedValue;
}

function validateLocationPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('بيانات الموقع غير صالحة', 400);
  }

  return {
    name: parseRequiredText(value.name, 'اسم الموقع', { minimumLength: 2 }),
    latitude: parseLatitude(value.latitude),
    longitude: parseLongitude(value.longitude),
    city: parseRequiredText(value.city, 'المدينة', { minimumLength: 2 }),
    area: parseRequiredText(value.area, 'المنطقة', { minimumLength: 2 }),
  };
}

function validateLocationReference(payload, options = {}) {
  const required = options.required ?? true;
  const hasLocationId = hasOwn(payload, 'locationId') && !isBlank(payload.locationId);
  const hasLocationObject =
    hasOwn(payload, 'location') && payload.location !== null && payload.location !== undefined;

  if (hasLocationId && hasLocationObject) {
    throw new AppError('أرسل locationId أو location فقط وليس الاثنين معًا', 400);
  }

  if (hasLocationId) {
    return {
      locationId: parsePositiveInteger(payload.locationId, 'الموقع'),
    };
  }

  if (hasLocationObject) {
    return {
      location: validateLocationPayload(payload.location),
    };
  }

  if (required) {
    throw new AppError('الموقع مطلوب', 400);
  }

  return {};
}

function validateCampaignCreatePayload(payload = {}) {
  const startDate = parseDateOnly(payload.startDate, 'تاريخ بداية الحملة');
  const endDate = parseDateOnly(payload.endDate, 'تاريخ نهاية الحملة');
  const startTime = parseTimeValue(payload.startTime, 'وقت بداية الحملة', {
    required: false,
  });
  const endTime = parseTimeValue(payload.endTime, 'وقت نهاية الحملة', {
    required: false,
  });

  if (startDate > endDate) {
    throw new AppError('تاريخ بداية الحملة يجب أن يكون قبل أو مساويًا لتاريخ النهاية', 400);
  }

  if (startTime && endTime && startTime >= endTime) {
    throw new AppError('وقت بداية الحملة يجب أن يكون قبل وقت النهاية', 400);
  }

  return {
    title: parseRequiredText(payload.title, 'عنوان الحملة', { minimumLength: 3 }),
    description: parseRequiredText(payload.description, 'وصف الحملة', {
      minimumLength: 10,
    }),
    coverImage: parseOptionalText(payload.coverImage, 'صورة الحملة', {
      maximumLength: 2048,
    }),
    startDate,
    endDate,
    startTime: startTime || null,
    endTime: endTime || null,
    status:
      parseEnumValue(payload.status, 'حالة الحملة', CAMPAIGN_STATUSES, {
        required: false,
      }) || 'DRAFT',
    attendanceRadiusMeters:
      parseOptionalNonNegativeInteger(payload.attendanceRadiusMeters, 'نطاق الحضور بالمتر') ??
      100,
    attendancePoints:
      parseOptionalNonNegativeInteger(payload.attendancePoints, 'نقاط تسجيل الحضور') ?? 50,
    reportPoints:
      parseOptionalNonNegativeInteger(payload.reportPoints, 'نقاط تسليم التقرير') ?? 50,
    ...validateLocationReference(payload),
  };
}

function validateCampaignUpdatePayload(payload = {}) {
  const data = {};

  if (hasOwn(payload, 'title')) {
    data.title = parseRequiredText(payload.title, 'عنوان الحملة', { minimumLength: 3 });
  }

  if (hasOwn(payload, 'description')) {
    data.description = parseRequiredText(payload.description, 'وصف الحملة', {
      minimumLength: 10,
    });
  }

  if (hasOwn(payload, 'coverImage')) {
    data.coverImage = parseOptionalText(payload.coverImage, 'صورة الحملة', {
      maximumLength: 2048,
    });
  }

  if (hasOwn(payload, 'startDate')) {
    data.startDate = parseDateOnly(payload.startDate, 'تاريخ بداية الحملة');
  }

  if (hasOwn(payload, 'endDate')) {
    data.endDate = parseDateOnly(payload.endDate, 'تاريخ نهاية الحملة');
  }

  if (hasOwn(payload, 'startTime')) {
    data.startTime = parseNullableTimeField(payload, 'startTime', 'وقت بداية الحملة');
  }

  if (hasOwn(payload, 'endTime')) {
    data.endTime = parseNullableTimeField(payload, 'endTime', 'وقت نهاية الحملة');
  }

  if (data.startTime && data.endTime && data.startTime >= data.endTime) {
    throw new AppError('وقت بداية الحملة يجب أن يكون قبل وقت النهاية', 400);
  }

  if (hasOwn(payload, 'status')) {
    data.status = parseEnumValue(payload.status, 'حالة الحملة', CAMPAIGN_STATUSES);
  }

  if (hasOwn(payload, 'attendanceRadiusMeters')) {
    data.attendanceRadiusMeters = parseOptionalNonNegativeInteger(
      payload.attendanceRadiusMeters,
      'نطاق الحضور بالمتر',
    );
  }

  if (hasOwn(payload, 'attendancePoints')) {
    data.attendancePoints = parseOptionalNonNegativeInteger(
      payload.attendancePoints,
      'نقاط تسجيل الحضور',
    );
  }

  if (hasOwn(payload, 'reportPoints')) {
    data.reportPoints = parseOptionalNonNegativeInteger(
      payload.reportPoints,
      'نقاط تسليم التقرير',
    );
  }

  if (hasOwn(payload, 'locationId') || hasOwn(payload, 'location')) {
    Object.assign(data, validateLocationReference(payload, { required: false }));
  }

  return data;
}

function validateCampaignListQuery(query = {}) {
  return {
    ...parsePaginationQuery(query),
    status: parseEnumValue(query.status, 'حالة الحملة', CAMPAIGN_STATUSES, {
      required: false,
    }),
    createdById: parsePositiveInteger(query.createdById, 'منشئ الحملة', {
      required: false,
    }),
    locationId: parsePositiveInteger(query.locationId, 'الموقع', {
      required: false,
    }),
  };
}

function validateTaskCreatePayload(payload = {}) {
  const date = parseDateOnly(payload.date, 'تاريخ المهمة');
  const startTime = parseTimeValue(payload.startTime, 'وقت البداية', { required: false });
  const endTime = parseTimeValue(payload.endTime, 'وقت النهاية', { required: false });

  if (startTime && endTime && startTime >= endTime) {
    throw new AppError('وقت البداية يجب أن يكون قبل وقت النهاية', 400);
  }

  return {
    title: parseRequiredText(payload.title, 'عنوان المهمة', { minimumLength: 3 }),
    description: parseRequiredText(payload.description, 'وصف المهمة', {
      minimumLength: 10,
    }),
    campaignId: parsePositiveInteger(payload.campaignId, 'الحملة'),
    date,
    startTime: startTime || null,
    endTime: endTime || null,
    attendanceRadiusMeters: parseOptionalNonNegativeInteger(
      payload.attendanceRadiusMeters,
      'نطاق الحضور بالمتر',
    ),
    status:
      parseEnumValue(payload.status, 'حالة المهمة', TASK_STATUSES, {
        required: false,
      }) || 'OPEN',
    ...validateLocationReference(payload, { required: false }),
  };
}

function validateTaskUpdatePayload(payload = {}) {
  const data = {};

  if (hasOwn(payload, 'title')) {
    data.title = parseRequiredText(payload.title, 'عنوان المهمة', { minimumLength: 3 });
  }

  if (hasOwn(payload, 'description')) {
    data.description = parseRequiredText(payload.description, 'وصف المهمة', {
      minimumLength: 10,
    });
  }

  if (hasOwn(payload, 'date')) {
    data.date = parseDateOnly(payload.date, 'تاريخ المهمة');
  }

  data.startTime = parseNullableTimeField(payload, 'startTime', 'وقت البداية');
  data.endTime = parseNullableTimeField(payload, 'endTime', 'وقت النهاية');

  if (data.startTime && data.endTime && data.startTime >= data.endTime) {
    throw new AppError('وقت البداية يجب أن يكون قبل وقت النهاية', 400);
  }

  if (hasOwn(payload, 'status')) {
    data.status = parseEnumValue(payload.status, 'حالة المهمة', TASK_STATUSES);
  }

  if (hasOwn(payload, 'attendanceRadiusMeters')) {
    data.attendanceRadiusMeters = parseOptionalNonNegativeInteger(
      payload.attendanceRadiusMeters,
      'نطاق الحضور بالمتر',
    );
  }

  if (hasOwn(payload, 'locationId') || hasOwn(payload, 'location')) {
    Object.assign(data, validateLocationReference(payload, { required: false }));
  }

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function validateTaskListQuery(query = {}) {
  return {
    ...parsePaginationQuery(query),
    campaignId: parsePositiveInteger(query.campaignId, 'الحملة', { required: false }),
    locationId: parsePositiveInteger(query.locationId, 'الموقع', { required: false }),
    volunteerId: parsePositiveInteger(query.volunteerId, 'المتطوع', { required: false }),
    date: parseDateOnly(query.date, 'تاريخ المهمة', { required: false }),
    fromDate: parseDateOnly(query.fromDate, 'من تاريخ المهمة', { required: false }),
    toDate: parseDateOnly(query.toDate, 'إلى تاريخ المهمة', { required: false }),
    status: parseEnumValue(query.status, 'حالة المهمة', TASK_STATUSES, {
      required: false,
    }),
    assignedToMe: parseBooleanQuery(query.assignedToMe),
    coordinates: parseCoordinatesQuery(query),
  };
}

function validateTaskAssignmentCreatePayload(payload = {}) {
  return {
    volunteerId: parsePositiveInteger(payload.volunteerId, 'المتطوع'),
    status:
      parseEnumValue(payload.status, 'حالة إسناد المهمة', VOLUNTEER_TASK_STATUSES, {
        required: false,
      }) || 'ASSIGNED',
  };
}

function validateTaskAssignmentUpdatePayload(payload = {}) {
  const data = {};

  if (hasOwn(payload, 'status')) {
    data.status = parseEnumValue(
      payload.status,
      'حالة إسناد المهمة',
      VOLUNTEER_TASK_STATUSES,
    );
  }

  data.checkInTime = parseNullableDateTimeField(payload, 'checkInTime', 'وقت تسجيل الحضور');
  data.checkOutTime = parseNullableDateTimeField(
    payload,
    'checkOutTime',
    'وقت تسجيل الانصراف',
  );

  if (hasOwn(payload, 'hoursWorked')) {
    data.hoursWorked = parseOptionalNonNegativeInteger(payload.hoursWorked, 'عدد الساعات');
  }

  const sanitizedData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(sanitizedData).length === 0) {
    throw new AppError('لا توجد بيانات صالحة للتحديث', 400);
  }

  if (
    sanitizedData.checkInTime &&
    sanitizedData.checkOutTime &&
    sanitizedData.checkInTime >= sanitizedData.checkOutTime
  ) {
    throw new AppError('وقت الحضور يجب أن يكون قبل وقت الانصراف', 400);
  }

  return sanitizedData;
}

function validateReportCreatePayload(payload = {}) {
  return {
    taskId: parsePositiveInteger(payload.taskId, 'المهمة'),
    campaignId: parsePositiveInteger(payload.campaignId, 'الحملة', { required: false }),
    notes: parseOptionalText(payload.notes, 'الملاحظات', { maximumLength: 5000 }),
    voiceNote: parseOptionalText(payload.voiceNote, 'الملاحظة الصوتية', {
      maximumLength: 2048,
    }),
    images: parseImages(payload.images),
    rating: parseRating(payload.rating),
  };
}

function validateReportUpdatePayload(payload = {}) {
  const data = {};

  if (hasOwn(payload, 'notes')) {
    data.notes = parseOptionalText(payload.notes, 'الملاحظات', { maximumLength: 5000 });
  }

  if (hasOwn(payload, 'voiceNote')) {
    data.voiceNote = parseOptionalText(payload.voiceNote, 'الملاحظة الصوتية', {
      maximumLength: 2048,
    });
  }

  if (hasOwn(payload, 'images')) {
    data.images = parseImages(payload.images);
  }

  if (hasOwn(payload, 'rating')) {
    data.rating = parseRating(payload.rating);
  }

  const sanitizedData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(sanitizedData).length === 0) {
    throw new AppError('لا توجد بيانات صالحة للتحديث', 400);
  }

  return sanitizedData;
}

function validateReportListQuery(query = {}) {
  return {
    ...parsePaginationQuery(query),
    campaignId: parsePositiveInteger(query.campaignId, 'الحملة', { required: false }),
    taskId: parsePositiveInteger(query.taskId, 'المهمة', { required: false }),
    volunteerId: parsePositiveInteger(query.volunteerId, 'المتطوع', { required: false }),
    mine: parseBooleanQuery(query.mine),
  };
}

function validateSosRequestCreatePayload(payload = {}) {
  return {
    latitude: parseLatitude(payload.latitude),
    longitude: parseLongitude(payload.longitude),
  };
}

function validateSosRequestStatusPayload(payload = {}) {
  return {
    status: parseEnumValue(payload.status, 'حالة الاستغاثة', SOS_REQUEST_STATUSES),
  };
}

function validateSosRequestListQuery(query = {}) {
  return {
    ...parsePaginationQuery(query),
    volunteerId: parsePositiveInteger(query.volunteerId, 'المتطوع', { required: false }),
    status: parseEnumValue(query.status, 'حالة الاستغاثة', SOS_REQUEST_STATUSES, {
      required: false,
    }),
    mine: parseBooleanQuery(query.mine),
  };
}

function validateAttendancePreviewQuery(query = {}) {
  return {
    coordinates: parseCoordinatesQuery(query),
  };
}

function validateAttendanceCheckInPayload(payload = {}) {
  return {
    ...validateCoordinatesPayload(payload),
  };
}

function validateAnnouncementListQuery(query = {}) {
  return {
    ...parsePaginationQuery(query),
    pinnedOnly: parseBooleanQuery(query.pinnedOnly),
    sortBy:
      parseEnumValue(query.sortBy, 'ترتيب الإعلانات', ANNOUNCEMENT_SORT_FIELDS, {
        required: false,
      }) || 'CREATEDAT',
  };
}

function validateAnnouncementCreatePayload(payload = {}) {
  return {
    title: parseRequiredText(payload.title, 'عنوان الإعلان', {
      minimumLength: 3,
      maximumLength: 200,
    }),
    content: parseRequiredText(payload.content, 'محتوى الإعلان', {
      minimumLength: 5,
      maximumLength: 5000,
    }),
    image: parseOptionalText(payload.image, 'صورة الإعلان', {
      maximumLength: 2048,
    }),
    isPinned: Boolean(payload.isPinned),
  };
}

function validateCommunityPostCreatePayload(payload = {}) {
  return {
    content: parseRequiredText(payload.content, 'محتوى المنشور', {
      minimumLength: 3,
      maximumLength: 5000,
    }),
    image: parseOptionalText(payload.image, 'صورة المنشور', {
      maximumLength: 2048,
    }),
  };
}

function validateCommunityCommentCreatePayload(payload = {}) {
  return {
    content: parseRequiredText(payload.content, 'محتوى التعليق', {
      minimumLength: 1,
      maximumLength: 2000,
    }),
  };
}

function validateCommunityFeedQuery(query = {}) {
  return parsePaginationQuery(query);
}

module.exports = {
  ANNOUNCEMENT_SORT_FIELDS,
  CAMPAIGN_STATUSES,
  SOS_REQUEST_STATUSES,
  TASK_STATUSES,
  VOLUNTEER_TASK_STATUSES,
  hasOwn,
  parseCoordinatesQuery,
  parsePositiveInteger,
  validateAnnouncementCreatePayload,
  validateAnnouncementListQuery,
  validateAttendanceCheckInPayload,
  validateAttendancePreviewQuery,
  validateCampaignCreatePayload,
  validateCampaignListQuery,
  validateCampaignUpdatePayload,
  validateCommunityCommentCreatePayload,
  validateCommunityFeedQuery,
  validateCommunityPostCreatePayload,
  validateCoordinatesPayload,
  validateLocationReference,
  validateReportCreatePayload,
  validateReportListQuery,
  validateReportUpdatePayload,
  validateSosRequestCreatePayload,
  validateSosRequestListQuery,
  validateSosRequestStatusPayload,
  validateTaskAssignmentCreatePayload,
  validateTaskAssignmentUpdatePayload,
  validateTaskCreatePayload,
  validateTaskListQuery,
  validateTaskUpdatePayload,
};
