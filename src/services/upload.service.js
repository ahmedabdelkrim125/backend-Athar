const AppError = require('../utils/app-error');

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const MAX_BASE64_LENGTH = 3000000;
const DATA_URL_PATTERN = /^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function normalizeBase64Image(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('الصورة مطلوبة', 400);
  }

  const trimmedValue = value.trim();
  const dataUrlMatch = trimmedValue.match(DATA_URL_PATTERN);
  const base64Value = (dataUrlMatch ? dataUrlMatch[1] : trimmedValue).replace(/\s/g, '');

  if (!BASE64_PATTERN.test(base64Value)) {
    throw new AppError('صيغة الصورة غير صالحة', 400);
  }

  if (base64Value.length > MAX_BASE64_LENGTH) {
    throw new AppError('حجم الصورة كبير جدًا', 413);
  }

  return base64Value;
}

async function uploadImage(payload) {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new AppError('رفع الصور غير مفعل حاليًا', 503);
  }

  const image = normalizeBase64Image(payload?.image);
  let response;

  try {
    response = await fetch(`${IMGBB_UPLOAD_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ image }).toString(),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    console.error('[upload] request failed:', error.message);
    throw new AppError('تعذر رفع الصورة، حاول مرة أخرى', 502);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error('[upload] imgbb error:', response.status, details);
    throw new AppError('تعذر رفع الصورة، حاول مرة أخرى', 502);
  }

  const result = await response.json();
  const url = result?.data?.display_url || result?.data?.url;

  if (!url) {
    throw new AppError('تعذر رفع الصورة، حاول مرة أخرى', 502);
  }

  return {
    message: 'تم رفع الصورة بنجاح',
    image: {
      url,
      thumbnailUrl: result?.data?.thumb?.url ?? null,
    },
  };
}

module.exports = {
  uploadImage,
};