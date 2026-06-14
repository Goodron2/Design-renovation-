/**
 * Standardized /api/scheduler/* adapter for the МастерДом site (Design-renovation).
 *
 * Drop this file into the site repo (next to server.js, database.js, ai.js) and
 * mount it in server.js with ONE line, before the static handler:
 *
 *     app.use(require('./scheduler-adapter'));
 *
 * Auth: every request must carry  X-Api-Key: <SCHEDULER_API_KEY>  (set in .env).
 * It reuses the site's own ai.generateArticle() + the existing `articles` table,
 * so generated articles look and behave exactly like manually-made ones.
 */

const express = require('express');
const db = require('./database');
const ai = require('./ai');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

const KEY = process.env.SCHEDULER_API_KEY || '';
const BASE_URL = (process.env.BASE_URL || 'http://185.22.172.45:3000').replace(/\/$/, '');

// Idempotency map: requestId -> article id (so retried runs never duplicate).
db.exec(`CREATE TABLE IF NOT EXISTS scheduler_requests (
  request_id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const insertStmt = db.prepare(`
  INSERT INTO articles (slug, title, description, keywords, preview_svg, content_html, status, provider)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const mapStmt = db.prepare('INSERT OR REPLACE INTO scheduler_requests (request_id, article_id) VALUES (?, ?)');

function auth(req, res, next) {
  if (!KEY || (req.headers['x-api-key'] || '') !== KEY) {
    return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'bad api key' });
  }
  next();
}

/** Word count over visible prose only — strip <svg> blocks and all tags first. */
function wordCount(html) {
  const text = String(html || '').replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return text.split(/\s+/).filter(Boolean).length;
}

function toContract(row, status) {
  const st = status || row.status;
  return {
    id: String(row.id),
    title: row.title,
    slug: row.slug,
    url: st === 'published' ? `${BASE_URL}/blog/${row.slug}` : '',
    wordCount: wordCount(row.content_html),
    status: st
  };
}

/** Resolve a unique slug, INSERT the article, and record idempotency — atomically. */
function saveArticle(article, status, requestId) {
  const base = ai.slugify(article.slug || article.title);
  const tx = db.transaction(() => {
    let id = null;
    for (let attempt = 0; attempt < 8 && id == null; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        id = insertStmt.run(slug, article.title, article.description, article.keywords,
          article.preview_svg, article.content_html, status, article.provider || '').lastInsertRowid;
      } catch (e) {
        if (String(e.code || '').includes('SQLITE_CONSTRAINT')) continue; // slug taken, try next suffix
        throw e;
      }
    }
    if (id == null) {
      const slug = `${base}-${Date.now()}`;
      id = insertStmt.run(slug, article.title, article.description, article.keywords,
        article.preview_svg, article.content_html, status, article.provider || '').lastInsertRowid;
    }
    if (requestId) mapStmt.run(requestId, id);
    return id;
  });
  return tx();
}

/** Build the `extra` hint string the site's generator understands from the theme. */
function buildExtra(theme, options) {
  const bits = [];
  if (theme.promptHint) bits.push(theme.promptHint);
  if (Array.isArray(theme.keywords) && theme.keywords.length) {
    bits.push(`Естественно используй ключевые фразы: ${theme.keywords.join(', ')}.`);
  }
  if (options && options.minWords) bits.push(`Объём не меньше ${options.minWords} слов.`);
  return bits.join(' ');
}

// ── health ──────────────────────────────────────────────────────────────────
router.get('/api/scheduler/health', auth, (req, res) => {
  res.json({ status: 'ok', version: '1.0', providers: ai.getProviders() });
});

// ── generate (and persist) ────────────────────────────────────────────────
router.post('/api/scheduler/generate', auth, async (req, res) => {
  try {
    const { requestId, mode = 'draft', theme = {}, options = {} } = req.body || {};
    if (!theme || !theme.title) {
      return res.status(400).json({ status: 'error', code: 'INVALID_THEME', message: 'theme.title required' });
    }

    // idempotency: return the already-generated article for this requestId
    if (requestId) {
      const prior = db.prepare('SELECT article_id FROM scheduler_requests WHERE request_id = ?').get(requestId);
      if (prior) {
        const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(prior.article_id);
        if (row) return res.json({ status: 'ok', article: toContract(row) });
      }
    }

    let article;
    try {
      article = await ai.generateArticle({ topic: theme.title, extra: buildExtra(theme, options), provider: 'auto' });
    } catch (e) {
      return res.status(502).json({ status: 'error', code: 'LLM_FAILED', message: e.message });
    }

    const status = mode === 'publish' ? 'published' : 'draft';
    const id = saveArticle(article, status, requestId);
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    res.json({ status: 'ok', article: toContract(row, status) });
  } catch (e) {
    res.status(500).json({ status: 'error', code: 'INTERNAL', message: e.message });
  }
});

// ── publish a draft ───────────────────────────────────────────────────────
router.post('/api/scheduler/publish/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'article not found' });
  db.prepare("UPDATE articles SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ status: 'ok', article: toContract(row, 'published') });
});

// ── reject a draft (only drafts; never touch a live article) ───────────────
router.post('/api/scheduler/reject/:id', auth, (req, res) => {
  const info = db.prepare(
    "UPDATE articles SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'"
  ).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'no draft to reject' });
  res.json({ status: 'ok' });
});

// ── list drafts ──────────────────────────────────────────────────────────
router.get('/api/scheduler/articles', auth, (req, res) => {
  const status = req.query.status || 'draft';
  const rows = db.prepare('SELECT * FROM articles WHERE status = ? ORDER BY created_at DESC LIMIT 100').all(status);
  res.json({ status: 'ok', articles: rows.map((r) => toContract(r)) });
});

module.exports = router;
