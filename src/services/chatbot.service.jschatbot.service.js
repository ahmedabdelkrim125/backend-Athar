const AppError = require('../utils/app-error');
const homeService = require('./home.service');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_HISTORY = 12;
const MAX_MESSAGE_LENGTH = 1000;

const PERSONA = `
أنت "سند"، مساعد ذكي مخصص لتطبيق سند لإدارة المتطوعين المصريين.
كلم المتطوع بالعامية المصرية دايمًا، وكن ودود ومشجع، وخلي ردودك مختصرة وواضحة.
نادي المتطوع باسمه لما يناسب.
متتكلمش عن أي حاجة خارج نطاق التطبيق والتطوع، ولو اتسألت عن حاجة خارجه قول بأدب إنك بتساعد في التطبيق والمهام بس.
متخترعش أرقام أو معلومات مش موجودة قدامك، ولو مش عارف قول إنك مش متأكد.
`;

const APP_RULES = `
قواعد التطبيق:
- النقاط: كل حملة ليها نقاط حضور ونقاط تقرير خاصة بيها، وبتختلف من حملة للتانية. متقولش رقم ثابت.
- الشارات: بداية العطاء عند 100 نقطة، نجم الفرق الميدانية عند 250 نقطة، بطل التوعية الميدانية عند 450 نقطة، صانع الأثر عند 800 نقطة.
- تسجيل الحضور: افتح المهمة من الصفحة الرئيسية، اضغط تسجيل الحضور، لازم تكون داخل النطاق الجغرافي المحدد للمهمة أو الحملة (النطاق بيختلف من مهمة للتانية)، وبعدين اضغط تأكيد.
- التقارير: بعد ما تخلص المهمة افتحها واضغط رفع تقرير، قيّم الحملة، اكتب ملاحظاتك أو استخدم المايك، ارفع صور ميدانية لو عندك، واضغط إرسال التقرير.
- الحملات: تبويب الخريطة بيعرض الحملات القريبة، ومن صفحة تفاصيل الحملة تقدر تسجل حضورك.
- الطوارئ: زر طوارئ SOS الأحمر في الصفحة الرئيسية. بعد الضغط بيبدأ عد تنازلي 5 ثواني تقدر تلغي فيه، وبعدها بيتبعت طلب الطوارئ بموقعك الحالي. لازم صلاحية الموقع تكون مفعلة.
`;

function formatTask(task) {
  const campaign = task.campaign?.title ? ` - حملة: ${task.campaign.title}` : '';
  const status = task.assignment?.status ? ` - الحالة: ${task.assignment.status}` : '';
  return `• ${task.title}${campaign}${status}`;
}

function buildSystemPrompt(summary) {
  const { volunteer, stats, todayTasks, upcomingTasks } = summary;

  const todayList = todayTasks.length
    ? todayTasks.map(formatTask).join('\n')
    : 'مفيش مهام النهارده';

  const upcomingList = upcomingTasks.length
    ? upcomingTasks.map((task) => `${formatTask(task)} - التاريخ: ${task.date}`).join('\n')
    : 'مفيش مهام قادمة';

  return [
    PERSONA.trim(),
    APP_RULES.trim(),
    `بيانات المتطوع الحالي:
- الاسم: ${volunteer.fullName}
- النقاط: ${stats.points}
- ساعات التطوع: ${stats.totalHours}
- عدد الشارات: ${stats.badges}
- عدد التقارير: ${stats.reports}`,
    `مهام النهارده:\n${todayList}`,
    `المهام القادمة:\n${upcomingList}`,
  ].join('\n\n');
}

function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    }));
}

async function sendMessage(volunteerId, rawMessages) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new AppError('المساعد غير مفعل حاليًا', 503);
  }

  const history = sanitizeMessages(rawMessages);

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    throw new AppError('الرسالة مطلوبة', 400);
  }

  const { summary } = await homeService.getHomeSummary(volunteerId);

  let response;

  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: buildSystemPrompt(summary) }, ...history],
        max_tokens: 500,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    console.error('[chatbot] request failed:', error.message);
    throw new AppError('المساعد مش متاح دلوقتي، حاول بعد شوية', 502);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error('[chatbot] groq error:', response.status, details);
    throw new AppError(
      response.status === 429
        ? 'المساعد عليه ضغط دلوقتي، حاول بعد شوية'
        : 'المساعد مش متاح دلوقتي، حاول بعد شوية',
      response.status === 429 ? 429 : 502,
    );
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new AppError('المساعد مرجّعش رد، حاول مرة أخرى', 502);
  }

  return reply;
}

module.exports = {
  sendMessage,
};