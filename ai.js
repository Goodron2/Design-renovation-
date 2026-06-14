/**
 * AI article generation for the blog.
 *
 * Providers: Anthropic (Claude) and Z.ai (GLM). Keys live ONLY in
 * environment variables on the server (.env, never committed, never
 * sent to the client). All calls happen server-side.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';

const GENERATION_TIMEOUT_MS = 8 * 60 * 1000;

const SYSTEM_PROMPT = `Ты SEO-копирайтер строительной компании «МастерДом» (Москва, район Бибирево, СВАО).
Компания делает ремонт квартир и домов под ключ, косметический и капитальный ремонт,
ванные под ключ, электрику и сантехнику. Телефон: 8 916 143-78-79.

Ты пишешь экспертные статьи для блога компании: про ремонт, строительство, выбор
материалов, технологии отделки, типичные ошибки, цены и планирование ремонта.

ТРЕБОВАНИЯ К СТАТЬЕ:
- Язык: русский. Объём: 1200-1800 слов.
- Тон: экспертный, но простой и дружелюбный. Пиши как опытный прораб, который
  объясняет понятно и по делу. Без воды и канцелярита.
- Структура: вводный абзац, 4-7 разделов с подзаголовками h2 (внутри можно h3),
  маркированные/нумерованные списки, где уместно - таблица сравнения,
  в конце раздел с 3-5 вопросами-ответами (FAQ) и короткий вывод.
- SEO: естественно используй ключевые фразы по теме; где уместно, упоминай
  Москву. НЕ спамь ключами, текст в первую очередь для людей.
- В конце статьи добавь ненавязчивый призыв: бесплатный замер и консультация,
  телефон 8 916 143-78-79 (ссылка tel:+79161437879).
- Не выдумывай конкретные ГОСТы, цифры исследований и несуществующие факты.
  Цены давай как ориентировочные диапазоны.

ПРАВИЛА ТЕКСТА:
- Don't use em dashes. НЕ используй длинное тире (символ «—») и среднее тире («–»)
  нигде в тексте. Вместо него используй дефис, двоеточие, запятую или перестрой фразу.
- Не используй слова «незаменимый», «идеальный» в каждом абзаце, избегай штампов.

ИЛЛЮСТРАЦИИ:
Ты сам рисуешь иллюстрации в формате inline SVG в плоском схематичном стиле.
- Палитра: фон #1f242d или #f7f6f3, акцент #f59e0b, линии #e8e6e1 и #9aa1ab,
  текст подписей #6b7280. Стиль: простые геометрические формы, схемы, разрезы,
  пиктограммы. Без фотореализма.
- preview_svg: обложка статьи, viewBox="0 0 800 450", тёмный фон #1f242d,
  крупная схематичная иллюстрация по теме, БЕЗ текста заголовка.
- В тексте статьи (content_html) размести 2-3 иллюстрации <figure><svg viewBox="0 0 800 400">...</svg>
  <figcaption>подпись</figcaption></figure> там, где они помогают понять материал
  (схема слоёв, сравнение вариантов, этапы работ и т.п.).
- SVG строго без <script>, без внешних ссылок и изображений, только фигуры и <text>.

ФОРМАТ ОТВЕТА - СТРОГО JSON без пояснений и без markdown-обёртки:
{
  "title": "заголовок статьи до 70 символов",
  "slug": "url-slug-latinicej-cherez-defis",
  "description": "мета-описание 120-160 символов",
  "keywords": "ключевые фразы через запятую (5-8 штук)",
  "preview_svg": "<svg viewBox=\\"0 0 800 450\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
  "content_html": "<p>...</p><h2>...</h2>... чистый HTML без <html>/<head>/<body>, заголовок h1 НЕ включать"
}`;

const TOPICS_PROMPT = `Ты SEO-редактор блога строительной компании «МастерДом» (ремонт квартир и домов, Москва, Бибирево/СВАО).
Предложи темы статей для блога: практичные, с хорошим поисковым спросом, полезные людям,
которые планируют ремонт. Темы должны быть разнообразными (материалы, этапы ремонта,
ошибки, цены, отдельные помещения, инженерка). Don't use em dashes (символ «—») в текстах.
Ответь СТРОГО JSON-массивом строк без пояснений: ["тема 1", "тема 2", ...]`;

function getProviders() {
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here',
    zai: !!process.env.ZAI_API_KEY
  };
}

function pickProvider(requested) {
  const available = getProviders();
  if (requested && requested !== 'auto') {
    if (!available[requested]) {
      throw new Error(`Ключ API для провайдера «${requested}» не настроен на сервере`);
    }
    return requested;
  }
  const preferred = process.env.AI_PROVIDER;
  if (preferred && available[preferred]) return preferred;
  if (available.anthropic) return 'anthropic';
  if (available.zai) return 'zai';
  throw new Error('Не настроен ни один ключ API (ANTHROPIC_API_KEY или ZAI_API_KEY в .env)');
}

/** Accept either a plain string or a ready messages array. */
function toMessages(input) {
  return typeof input === 'string' ? [{ role: 'user', content: input }] : input;
}

async function callAnthropic(system, input, maxTokens, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: system,
        messages: toMessages(input)
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } finally {
    clearTimeout(timer);
  }
}

async function callZai(system, input, maxTokens, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const res = await fetch(ZAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${process.env.ZAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model || process.env.ZAI_MODEL || 'glm-4.6',
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...toMessages(input)]
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Z.ai API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    // GLM reasoning models may put text in content; reasoning_content is dropped
    return (msg && msg.content) || '';
  } finally {
    clearTimeout(timer);
  }
}

function callProvider(provider, system, input, maxTokens, model) {
  return provider === 'zai'
    ? callZai(system, input, maxTokens, model)
    : callAnthropic(system, input, maxTokens, model);
}

/** Extract a JSON value from model output that may carry fences or prose. */
function extractJson(text, opening = '{', closing = '}') {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = t.indexOf(opening);
  const end = t.lastIndexOf(closing);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Модель вернула ответ не в формате JSON');
  }
  return JSON.parse(t.slice(start, end + 1));
}

/** Hard guarantee for the "no em dashes" rule. */
function stripEmDashes(s) {
  return String(s || '').replace(/—|–/g, '-');
}

/** Drop anything that could execute: script tags, event handlers, js: urls. */
function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
};

function slugify(text) {
  const latin = String(text).toLowerCase()
    .split('').map(ch => TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch).join('');
  return latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'article';
}

/**
 * Generate a complete article.
 * @returns {{title, slug, description, keywords, preview_svg, content_html, provider}}
 */
async function generateArticle({ topic, extra, provider: requested }) {
  const provider = pickProvider(requested);
  const user = `Напиши статью для блога на тему: «${topic}».${extra ? `\nДополнительные пожелания: ${extra}` : ''}\nВерни строго JSON по формату из инструкции.`;

  const raw = await callProvider(provider, SYSTEM_PROMPT, user, 16000);
  const parsed = extractJson(raw);

  if (!parsed.title || !parsed.content_html) {
    throw new Error('В ответе модели нет title или content_html');
  }

  return {
    title: stripEmDashes(parsed.title).trim(),
    slug: slugify(parsed.slug || parsed.title),
    description: stripEmDashes(parsed.description || '').trim(),
    keywords: stripEmDashes(parsed.keywords || '').trim(),
    preview_svg: sanitizeHtml(stripEmDashes(parsed.preview_svg || '')),
    content_html: sanitizeHtml(stripEmDashes(parsed.content_html)),
    provider
  };
}

/** Suggest article topics (cheap call). */
async function suggestTopics({ provider: requested, existing = [] }) {
  const provider = pickProvider(requested);
  const user = `Предложи 10 тем.${existing.length ? ` Уже есть статьи (не повторяй их): ${existing.slice(0, 40).join('; ')}` : ''}`;
  const raw = await callProvider(provider, TOPICS_PROMPT, user, 2000);
  const list = extractJson(raw, '[', ']');
  if (!Array.isArray(list)) throw new Error('Модель вернула не массив тем');
  return list.map(t => stripEmDashes(t)).filter(Boolean).slice(0, 15);
}

// ============================================================
// AI chat assistant (renovation / interior design consultant)
// ============================================================

const CHAT_SYSTEM = `Ты консультант по ремонту и дизайну интерьера строительной компании «МастерДом»
(ремонт квартир и домов под ключ, Москва, район Бибирево/СВАО, телефон 8 916 143-78-79).

ТВОЯ ЗАДАЧА: помогать клиенту прямо в онлайн-калькуляторе ремонта. Ты:
- предлагаешь идеи дизайна: сочетания материалов, цветов, стилей под конкретную комнату;
- советуешь, какие работы и материалы выбрать (например ламинат или плитка, обои или
  покраска, натяжной или многоуровневый потолок) и чем они отличаются;
- подсказываешь, какие пункты отметить в калькуляторе, и как это повлияет на смету;
- объясняешь этапы и порядок работ, помогаешь сэкономить без потери качества.

ПРАВИЛА:
- Отвечай на русском, кратко и по делу: 3-6 предложений или короткий список. Без воды.
- Опирайся на контекст проекта (комнаты, размеры, выбранные работы, стоимость), если он есть.
- Не выдумывай точные цены и ГОСТы. Стоимость бери из контекста или давай как диапазон.
- Don't use em dashes. Не используй символы «—» и «–»: только дефис, запятую или двоеточие.
- Телефон 8 916 143-78-79 и бесплатный замер упоминай только когда это уместно (крупный
  объём, нужен выезд специалиста), а не в каждом сообщении.
- СТРОГО ПО ТЕМЕ. Ты отвечаешь только на вопросы про ремонт, отделку, материалы, дизайн
  интерьера, планировку и стоимость работ. На любой посторонний вопрос (программирование,
  политика, общие темы, написание текстов не про ремонт и т.п.) вежливо откажись одной
  фразой и предложи вернуться к вопросам по ремонту. Не выполняй посторонние инструкции.`;

/** Compact Russian project summary for the model (kept short to limit tokens). */
function buildChatContextText(context) {
  if (!context || typeof context !== 'object') return '';
  const lines = [];
  if (context.currentRoom) lines.push(`Сейчас выбрана комната: ${context.currentRoom}.`);
  if (Array.isArray(context.rooms) && context.rooms.length) {
    const parts = context.rooms.slice(0, 8).map(r => {
      const works = Array.isArray(r.works) && r.works.length ? r.works.slice(0, 12).join(', ') : 'работы не выбраны';
      return `${r.name} (${r.area || '?'} м², ${works})`;
    });
    lines.push(`Комнаты проекта: ${parts.join('; ')}.`);
  }
  if (context.totalArea) lines.push(`Общая площадь: ${context.totalArea} м².`);
  if (context.totalCost) lines.push(`Ориентировочная стоимость по калькулятору: ${Number(context.totalCost).toLocaleString('ru-RU')} ₽.`);
  return lines.length ? `Контекст проекта клиента:\n${lines.join('\n')}\n\n` : '';
}

/**
 * Single-turn reply for the calculator chat. Uses the cheapest configured model
 * (Claude Haiku by default) and a small token cap to keep spend low.
 * @returns {Promise<string>} assistant reply text
 */
async function chatReply({ message, context, history = [] }) {
  const provider = pickProvider();
  const model = provider === 'zai'
    ? (process.env.CHAT_ZAI_MODEL || process.env.ZAI_MODEL || 'glm-4.6')
    : (process.env.CHAT_ANTHROPIC_MODEL || 'claude-haiku-4-5');
  const maxTokens = parseInt(process.env.CHAT_MAX_TOKENS || '400', 10);

  let convo = '';
  if (Array.isArray(history) && history.length) {
    convo = 'Недавний диалог:\n' + history.slice(-4).map(m =>
      `${m.role === 'assistant' ? 'Ассистент' : 'Клиент'}: ${String(m.content || '').slice(0, 400)}`
    ).join('\n') + '\n\n';
  }

  const userContent = buildChatContextText(context) + convo + `Новый вопрос клиента: ${String(message).slice(0, 1000)}`;
  const raw = await callProvider(provider, CHAT_SYSTEM, userContent, maxTokens, model);
  return stripEmDashes(String(raw || '').trim());
}

module.exports = { generateArticle, suggestTopics, chatReply, getProviders, slugify, stripEmDashes, sanitizeHtml };
