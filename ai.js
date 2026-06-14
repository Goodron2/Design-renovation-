/**
 * AI article generation for the blog.
 *
 * Providers: OpenRouter (default, OpenAI-compatible - text via gpt-4o-mini),
 * with Anthropic (Claude) and Z.ai (GLM) kept as fallbacks. Keys live ONLY in
 * environment variables on the server (.env, never committed, never sent to the
 * client). All calls happen server-side.
 *
 * Covers are real raster images generated from the finished article via
 * OpenRouter's image model, saved under public/uploads and referenced at
 * /uploads/<file> (the site serves public/ statically). The legacy `preview_svg`
 * column now carries the cover <img> markup; the public blog renders it raw.
 */

const fs = require('fs');
const path = require('path');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const GENERATION_TIMEOUT_MS = 8 * 60 * 1000;

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* ignore */ }

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

ОФОРМЛЕНИЕ:
- Обложку статьи мы генерируем отдельно (готовое изображение), поэтому НЕ рисуй SVG
  и НЕ вставляй изображения в текст. content_html - это чистый HTML статьи:
  <p>, <h2>, <h3>, <ul>/<ol>/<li>, <table>, <strong>, <em>. Без <html>/<head>/<body>,
  без <h1>, без <svg>, без <img>, без <script>.

ФОРМАТ ОТВЕТА - СТРОГО JSON без пояснений и без markdown-обёртки:
{
  "title": "заголовок статьи до 70 символов",
  "slug": "url-slug-latinicej-cherez-defis",
  "description": "мета-описание 120-160 символов",
  "keywords": "ключевые фразы через запятую (5-8 штук)",
  "content_html": "<p>...</p><h2>...</h2>... чистый HTML"
}`;

const TOPICS_PROMPT = `Ты SEO-редактор блога строительной компании «МастерДом» (ремонт квартир и домов, Москва, Бибирево/СВАО).
Предложи темы статей для блога: практичные, с хорошим поисковым спросом, полезные людям,
которые планируют ремонт. Темы должны быть разнообразными (материалы, этапы ремонта,
ошибки, цены, отдельные помещения, инженерка). Don't use em dashes (символ «—») в текстах.
Ответь СТРОГО JSON-массивом строк без пояснений: ["тема 1", "тема 2", ...]`;

function getProviders() {
  return {
    openrouter: !!process.env.OPENROUTER_API_KEY,
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
  if (available.openrouter) return 'openrouter';
  if (available.anthropic) return 'anthropic';
  if (available.zai) return 'zai';
  throw new Error('Не настроен ни один ключ API (OPENROUTER_API_KEY, ANTHROPIC_API_KEY или ZAI_API_KEY в .env)');
}

async function callAnthropic(system, userMessage, maxTokens) {
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
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: system,
        messages: [{ role: 'user', content: userMessage }]
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

async function callZai(system, userMessage, maxTokens) {
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
        model: process.env.ZAI_MODEL || 'glm-4.6',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage }
        ]
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Z.ai API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    return (msg && msg.content) || '';
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenRouter(system, userMessage, maxTokens) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.BASE_URL || 'https://masterdom.local',
        'X-Title': 'MasterDom Blog'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_TEXT_MODEL || 'openai/gpt-4o-mini',
        max_tokens: maxTokens,
        temperature: 0.6,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage }
        ]
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    return (msg && msg.content) || '';
  } finally {
    clearTimeout(timer);
  }
}

function callProvider(provider, system, userMessage, maxTokens) {
  if (provider === 'zai') return callZai(system, userMessage, maxTokens);
  if (provider === 'anthropic') return callAnthropic(system, userMessage, maxTokens);
  return callOpenRouter(system, userMessage, maxTokens);
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

function escAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

// ── inline SVG schemes (drawn by Claude Haiku, independent of the text model) ──
const SVG_MODEL = process.env.OPENROUTER_SVG_MODEL || 'anthropic/claude-haiku-4.5';
const SCHEME_COUNT = Number(process.env.SCHEME_COUNT || 2);

function sanitizeSvg(svg) {
  return String(svg || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<image\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*"(?!#)[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
}
function responsiveSvg(svg) {
  return String(svg).replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    const cleaned = attrs.replace(/\s(width|height|style)\s*=\s*"[^"]*"/gi, '');
    return `<svg${cleaned} style="width:100%;height:auto;display:block">`;
  });
}
function buildFigure(svg, caption) {
  return `<figure class="article-figure" style="margin:1.6rem 0">`
    + `<div style="background:#f7f6f3;border-radius:12px;overflow:hidden;border:1px solid #e8e6e1">${responsiveSvg(sanitizeSvg(svg))}</div>`
    + (caption ? `<figcaption style="text-align:center;font-size:0.9em;color:#6b7280;margin-top:8px">${escAttr(caption)}</figcaption>` : '')
    + `</figure>`;
}
function parseFigures(raw) {
  const out = [];
  for (const b of String(raw || '').split(/===FIGURE===/i)) {
    const svgM = b.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgM) continue;
    const capM = b.match(/CAPTION:\s*(.+)/i);
    const caption = capM ? stripEmDashes(capM[1].trim()).replace(/[<>]/g, '') : '';
    out.push(buildFigure(svgM[0], caption));
  }
  return out;
}
function htmlToText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
async function makeSchemes(title, plainText) {
  if (SCHEME_COUNT <= 0 || !process.env.OPENROUTER_API_KEY) return [];
  const sys = `Ты опытный технический иллюстратор. Ты рисуешь понятные схемы в виде inline SVG для статей о ремонте и строительстве.
- Нарисуй ${SCHEME_COUNT} схему(ы), которые наглядно объясняют ключевые идеи статьи (схема слоёв, сравнение вариантов, этапы работ, узел/разрез и т.п.).
- Плоский схематичный стиль. Палитра: фон #f7f6f3, акцент #f59e0b, линии #d8d5cf и #9aa1ab, текст подписей #4b5563.
- Каждый SVG: viewBox="0 0 800 400", читаемые подписи <text> НА РУССКОМ, только векторные фигуры и <text>. БЕЗ <script>, БЕЗ <image>, без внешних ссылок, без растра.
- Для КАЖДОЙ схемы выведи ровно такой блок и ничего больше:
===FIGURE===
CAPTION: <короткая подпись, до 8 слов>
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">...</svg>
- Выводи ТОЛЬКО эти блоки. Без пояснений и markdown-обёрток.`;
  const user = `Заголовок статьи: «${title}».\nСтатья (для контекста):\n${String(plainText || '').slice(0, 4000)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.BASE_URL || 'https://masterdom.local',
        'X-Title': 'MasterDom Blog'
      },
      body: JSON.stringify({ model: SVG_MODEL, max_tokens: 8000, temperature: 0.5, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] })
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    return parseFigures(raw).slice(0, SCHEME_COUNT);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
function insertFiguresHtml(html, figures) {
  if (!figures.length) return html;
  const positions = [];
  const re = /<h2[\s>]/gi; let m;
  while ((m = re.exec(html))) positions.push(m.index);
  const points = [];
  if (positions.length >= 2) points.push(positions[1]);
  if (positions.length >= 4) points.push(positions[3]);
  let out = html, offset = 0;
  const used = Math.min(figures.length, points.length);
  for (let i = 0; i < used; i++) {
    const at = points[i] + offset;
    out = out.slice(0, at) + figures[i] + out.slice(at);
    offset += figures[i].length;
  }
  for (let i = used; i < figures.length; i++) out += figures[i];
  return out;
}

/** Generate a real cover image from the article. Returns an <img> tag or '' (best-effort). */
async function makeCover(title, summary) {
  if (!process.env.OPENROUTER_API_KEY) return '';
  const model = process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image';
  const prompt = `Профессиональная обложка для статьи строительной компании о ремонте под названием "${title}". Тема: ${String(summary || '').slice(0, 240)}. Стиль: современная чистая иллюстрация на тему ремонта и отделки квартир, тёплые нейтральные тона, оранжевый акцент, аккуратные геометричные формы (инструменты, интерьер, материалы). Без текста, без слов, без букв, без логотипов.`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.BASE_URL || 'https://masterdom.local',
        'X-Title': 'MasterDom Blog'
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] })
    });
    if (!res.ok) return '';
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    const imgs = (msg && msg.images) || [];
    const url = (imgs[0] && (imgs[0].image_url ? imgs[0].image_url.url : imgs[0].url)) || '';
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return '';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 1000) return '';
    const ext = /jpeg|jpg/.test(m[1]) ? 'jpg' : /webp/.test(m[1]) ? 'webp' : 'png';
    const fname = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
    return `<img src="/uploads/${fname}" alt="${escAttr(title)}" loading="lazy" style="width:100%;height:auto;display:block;border-radius:12px">`;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a complete article.
 * @returns {{title, slug, description, keywords, preview_svg, content_html, provider}}
 */
async function generateArticle({ topic, extra, provider: requested }) {
  const provider = pickProvider(requested);
  const user = `Напиши статью для блога на тему: «${topic}».${extra ? `\nДополнительные пожелания: ${extra}` : ''}\nВерни строго JSON по формату из инструкции.`;

  let parsed = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const reminder = attempt === 0 ? '' : '\nВАЖНО: верни ТОЛЬКО JSON-объект, без какого-либо другого текста.';
    const raw = await callProvider(provider, SYSTEM_PROMPT, user + reminder, 9000);
    try {
      const p = extractJson(raw);
      if (!p.title || !p.content_html) throw new Error('нет title или content_html');
      parsed = p;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!parsed) throw new Error(`Ответ модели некорректен: ${lastErr ? lastErr.message : 'нет JSON'}`);

  const title = stripEmDashes(parsed.title).trim();
  const description = stripEmDashes(parsed.description || '').trim();
  let content_html = sanitizeHtml(stripEmDashes(parsed.content_html));

  // Inline schematic diagrams (Haiku) + a real cover image (best-effort, in parallel).
  const [figures, preview_svg] = await Promise.all([
    makeSchemes(title, htmlToText(content_html)),
    makeCover(title, description || topic),
  ]);
  content_html = insertFiguresHtml(content_html, figures);

  return {
    title,
    slug: slugify(parsed.slug || title),
    description,
    keywords: stripEmDashes(parsed.keywords || '').trim(),
    preview_svg, // cover <img> markup (legacy column name; rendered raw by blog.js)
    content_html,
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

module.exports = { generateArticle, suggestTopics, getProviders, slugify, stripEmDashes, sanitizeHtml };
