/**
 * Renovation Cost Estimator - Main Server
 * Express server with SQLite database
 *
 * SECURITY: API keys are stored in environment variables, not in code.
 * Copy .env.example to .env and configure your keys there.
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const ai = require('./ai');
const blog = require('./blog');

// Load environment variables from .env file (if exists)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, use system environment variables
}

const app = express();
const PORT = process.env.PORT || 3000;

// Session secret for token generation
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory session store (use Redis in production for multiple servers)
const adminSessions = new Map();

// ============================================
// Security Middleware
// ============================================

/**
 * Rate limiting middleware
 * Limits requests per IP to prevent abuse.
 * Each limiter keeps its own store - otherwise the global limiter's
 * counter would trip the stricter per-route limits (e.g. login).
 */
function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  const rateLimitStore = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const record = rateLimitStore.get(ip);

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    record.count++;

    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Слишком много запросов. Попробуйте позже.'
      });
    }

    next();
  };
}

/**
 * Generate secure admin session token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify admin session token
 */
function verifyAdminSession(token) {
  if (!token) return false;
  const session = adminSessions.get(token);
  if (!session) return false;

  // Check if session expired (24 hours)
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Admin authentication middleware
 * Protects admin-only routes with server-side session validation
 */
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;

  if (!verifyAdminSession(token)) {
    return res.status(401).json({
      success: false,
      error: 'Требуется авторизация администратора'
    });
  }

  next();
}

/**
 * Optional admin check (doesn't block, just sets flag)
 */
function checkAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  req.isAdmin = verifyAdminSession(token);
  next();
}

// Middleware
app.use(express.json());

// Apply rate limiting to all routes
app.use(rateLimit(200, 15 * 60 * 1000)); // 200 requests per 15 minutes

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ============================================
// API Routes - Projects
// ============================================

/**
 * Create a new project
 */
app.post('/api/projects', (req, res) => {
  try {
    const { name, rooms, selectedOptions, totalCost } = req.body;
    const shareId = uuidv4().substring(0, 8); // Short shareable ID

    const stmt = db.prepare(`
      INSERT INTO projects (share_id, name, rooms, selected_options, total_cost)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      shareId,
      name || 'Новый проект',
      JSON.stringify(rooms || []),
      JSON.stringify(selectedOptions || {}),
      totalCost || 0
    );

    res.json({
      success: true,
      projectId: result.lastInsertRowid,
      shareId: shareId,
      shareUrl: `/project/${shareId}`
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: 'Ошибка создания проекта' });
  }
});

/**
 * Get project by share ID
 */
app.get('/api/projects/:shareId', (req, res) => {
  try {
    const { shareId } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE share_id = ?').get(shareId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Проект не найден' });
    }

    // Parse JSON fields
    project.rooms = JSON.parse(project.rooms);
    project.selected_options = JSON.parse(project.selected_options);

    // Get chat history
    const chatHistory = db.prepare('SELECT role, message, created_at FROM chat_history WHERE project_id = ? ORDER BY created_at').all(project.id);

    res.json({
      success: true,
      project: project,
      chatHistory: chatHistory
    });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки проекта' });
  }
});

/**
 * Update project
 */
app.put('/api/projects/:shareId', (req, res) => {
  try {
    const { shareId } = req.params;
    const { name, rooms, selectedOptions, totalCost } = req.body;

    const stmt = db.prepare(`
      UPDATE projects
      SET name = ?, rooms = ?, selected_options = ?, total_cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE share_id = ?
    `);

    stmt.run(
      name,
      JSON.stringify(rooms),
      JSON.stringify(selectedOptions),
      totalCost,
      shareId
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, error: 'Ошибка сохранения проекта' });
  }
});

// ============================================
// API Routes - Pricing
// ============================================

/**
 * Get all pricing options
 */
app.get('/api/pricing', (req, res) => {
  try {
    const options = db.prepare('SELECT * FROM pricing_options WHERE is_active = 1 ORDER BY category, name_ru').all();
    res.json({ success: true, options: options });
  } catch (error) {
    console.error('Error getting pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки цен' });
  }
});

/**
 * Update pricing option (admin only - PROTECTED)
 */
app.put('/api/pricing/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { price_per_sqm, is_active } = req.body;

    const stmt = db.prepare('UPDATE pricing_options SET price_per_sqm = ?, is_active = ? WHERE id = ?');
    stmt.run(price_per_sqm, is_active ? 1 : 0, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка обновления цены' });
  }
});

/**
 * Get all pricing options for admin (including inactive - PROTECTED)
 */
app.get('/api/admin/pricing', requireAdmin, (req, res) => {
  try {
    const options = db.prepare('SELECT * FROM pricing_options ORDER BY category, name_ru').all();
    res.json({ success: true, options: options });
  } catch (error) {
    console.error('Error getting admin pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки цен' });
  }
});

/**
 * Add new pricing option (admin only - PROTECTED)
 */
app.post('/api/admin/pricing', requireAdmin, (req, res) => {
  try {
    const { category, name_ru, name_key, price_per_sqm, unit, description_ru } = req.body;

    const stmt = db.prepare(`
      INSERT INTO pricing_options (category, name_ru, name_key, price_per_sqm, unit, description_ru)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(category, name_ru, name_key, price_per_sqm, unit || 'м²', description_ru || '');

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error adding pricing option:', error);
    res.status(500).json({ success: false, error: 'Ошибка добавления опции' });
  }
});

// ============================================
// API Routes - Chat
// ============================================

// ----- AI chat configuration & hard spend limits -----
// The assistant uses a cheap model and a small token cap (see ai.js). On top of
// that we cap how many AI replies can be produced, so the chat cannot be abused
// as a free general-purpose chatbot and run up the API bill.
const CHAT_MAX_INPUT    = parseInt(process.env.CHAT_MAX_INPUT    || '600', 10); // chars per message
const CHAT_DAILY_PER_IP = parseInt(process.env.CHAT_DAILY_PER_IP || '25', 10);  // AI replies / IP / day
const CHAT_DAILY_GLOBAL = parseInt(process.env.CHAT_DAILY_GLOBAL || '400', 10); // AI replies / day (everyone)

const chatUsage = { day: '', global: 0, perIp: new Map() };
function chatBudget(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (chatUsage.day !== today) { chatUsage.day = today; chatUsage.global = 0; chatUsage.perIp.clear(); }
  const used = chatUsage.perIp.get(ip) || 0;
  return {
    globalLeft: CHAT_DAILY_GLOBAL - chatUsage.global,
    ipLeft: CHAT_DAILY_PER_IP - used,
    consume() { chatUsage.global += 1; chatUsage.perIp.set(ip, used + 1); }
  };
}

const LIMIT_MSG_IP = 'Вы задали уже много вопросов помощнику за сегодня. Чтобы подробно обсудить проект, позвоните нам: 8 916 143-78-79 (бесплатный замер и консультация).';
const LIMIT_MSG_GLOBAL = 'Помощник сейчас перегружен запросами. Пожалуйста, попробуйте чуть позже или позвоните нам: 8 916 143-78-79.';

/** True when at least one AI provider key is configured on the server. */
function aiAvailable() {
  const p = ai.getProviders();
  return !!(p.openrouter || p.anthropic || p.zai);
}

/** Sanitize the short conversation history sent by the client. */
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-6)
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 800) }));
}

/**
 * AI chat for the calculator. A real renovation assistant for everyone (cheap
 * model), protected by per-IP and global daily caps; falls back to a basic
 * keyword helper when no API key is configured on the server.
 */
app.post('/api/chat', rateLimit(30, 15 * 60 * 1000), async (req, res) => {
  try {
    const { projectId, message, projectContext } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Сообщение не может быть пустым' });
    }
    if (message.length > CHAT_MAX_INPUT) {
      return res.status(400).json({ success: false, error: `Сообщение слишком длинное (максимум ${CHAT_MAX_INPUT} символов)` });
    }

    const saveTurn = (role, text) => {
      if (!projectId) return;
      const project = db.prepare('SELECT id FROM projects WHERE share_id = ?').get(projectId);
      if (project) db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, role, text);
    };

    saveTurn('user', message);

    let aiResponse;
    let limited = false;

    if (aiAvailable()) {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const budget = chatBudget(ip);
      if (budget.globalLeft <= 0) {
        aiResponse = LIMIT_MSG_GLOBAL; limited = true;
      } else if (budget.ipLeft <= 0) {
        aiResponse = LIMIT_MSG_IP; limited = true;
      } else {
        budget.consume();
        try {
          aiResponse = await ai.chatReply({
            message,
            context: projectContext,
            history: sanitizeHistory(req.body.history)
          });
        } catch (e) {
          console.error('AI chat error:', e.message);
          aiResponse = generateMockResponse(message, projectContext);
        }
      }
    } else {
      // No API key configured: degrade to the basic keyword helper.
      aiResponse = generateMockResponse(message, projectContext);
    }

    if (!aiResponse || !aiResponse.trim()) aiResponse = generateMockResponse(message, projectContext);

    saveTurn('assistant', aiResponse);

    res.json({ success: true, response: aiResponse, limited });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ success: false, error: 'Ошибка чата' });
  }
});

/**
 * Mock AI response generator
 * Will be replaced with Claude API integration
 */
function generateMockResponse(message, context) {
  const lowerMessage = message.toLowerCase();

  // Context-aware responses based on project data
  if (context && context.rooms && context.rooms.length > 0) {
    const totalArea = context.rooms.reduce((sum, room) => sum + (room.width * room.length), 0);

    if (lowerMessage.includes('стоимость') || lowerMessage.includes('цена') || lowerMessage.includes('сколько')) {
      return `На основе вашего проекта общая площадь составляет ${totalArea.toFixed(1)} м². Текущая оценка стоимости: ${context.totalCost?.toLocaleString('ru-RU') || 0} ₽. Хотите, чтобы я объяснил расчёт подробнее?`;
    }

    if (lowerMessage.includes('рекомендац') || lowerMessage.includes('совет')) {
      return `Для ваших ${context.rooms.length} комнат(ы) общей площадью ${totalArea.toFixed(1)} м² я бы рекомендовал обратить внимание на комбинацию материалов. Например, ламинат отлично подойдёт для жилых комнат, а плитка — для кухни и ванной.`;
    }
  }

  // General responses
  if (lowerMessage.includes('привет') || lowerMessage.includes('здравствуй')) {
    return 'Здравствуйте! Я ваш помощник по планированию ремонта. Чем могу помочь? Вы можете спросить меня о стоимости работ, материалах или получить рекомендации.';
  }

  if (lowerMessage.includes('ламинат')) {
    return 'Ламинат — отличный выбор для жилых комнат. Он практичен, легко укладывается и имеет много вариантов дизайна. Стоимость укладки включает подготовку основания и подложку.';
  }

  if (lowerMessage.includes('плитка') || lowerMessage.includes('плитку')) {
    return 'Плитка идеально подходит для ванной комнаты и кухни благодаря водостойкости. Учтите, что укладка плитки требует выравнивания пола, что может увеличить стоимость.';
  }

  if (lowerMessage.includes('потолок')) {
    return 'Для потолка есть несколько вариантов: покраска (бюджетный вариант), натяжной потолок (быстрый монтаж, много вариантов) или гипсокартон (позволяет создать многоуровневые конструкции).';
  }

  if (lowerMessage.includes('стен') || lowerMessage.includes('обои')) {
    return 'Для отделки стен популярны три варианта: покраска (легко обновить), обои (большой выбор дизайнов) и декоративная штукатурка (премиум вариант с уникальной текстурой).';
  }

  if (lowerMessage.includes('сэконом') || lowerMessage.includes('дешев') || lowerMessage.includes('бюджет')) {
    return 'Для экономии рекомендую: линолеум вместо ламината, покраску стен вместо обоев, и покраску потолка. Это позволит сократить бюджет на 30-40% без потери качества.';
  }

  if (lowerMessage.includes('срок') || lowerMessage.includes('время') || lowerMessage.includes('долго')) {
    return 'Сроки ремонта зависят от объёма работ. Для комнаты 15-20 м² обычно требуется: подготовка 2-3 дня, основные работы 5-7 дней, финишная отделка 2-3 дня. Точные сроки подрядчик определит после осмотра.';
  }

  // Default response
  return 'Я могу помочь вам с выбором материалов, расчётом стоимости и рекомендациями по ремонту. Задайте вопрос о конкретных работах или материалах, и я постараюсь дать полезный совет!';
}

// ============================================
// API Routes - Export
// ============================================

/**
 * Export project to Excel
 */
app.get('/api/export/:shareId', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { shareId } = req.params;

    const project = db.prepare('SELECT * FROM projects WHERE share_id = ?').get(shareId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Проект не найден' });
    }

    const rooms = JSON.parse(project.rooms);
    const selectedOptions = JSON.parse(project.selected_options);
    const pricingOptions = db.prepare('SELECT * FROM pricing_options').all();

    // Create pricing lookup
    const pricingLookup = {};
    pricingOptions.forEach(opt => {
      pricingLookup[opt.name_key] = opt;
    });

    // Build Excel data
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Смета ремонта', '', '', ''],
      ['Проект:', project.name, '', ''],
      ['Дата:', new Date().toLocaleDateString('ru-RU'), '', ''],
      ['', '', '', ''],
      ['Общая стоимость:', project.total_cost, '₽', ''],
      ['', '', '', ''],
    ];

    // Room details
    rooms.forEach((room, index) => {
      const area = room.width * room.length;
      const wallArea = 2 * room.height * (room.width + room.length);
      summaryData.push([`Комната ${index + 1}: ${room.name}`, '', '', '']);
      summaryData.push(['Размеры:', `${room.width} x ${room.length} x ${room.height} м`, '', '']);
      summaryData.push(['Площадь пола:', `${area.toFixed(2)} м²`, '', '']);
      summaryData.push(['Площадь стен:', `${wallArea.toFixed(2)} м²`, '', '']);
      summaryData.push(['', '', '', '']);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

    // Detailed pricing sheet
    const detailsData = [
      ['Детализация работ', '', '', '', ''],
      ['', '', '', '', ''],
      ['Комната', 'Работа', 'Площадь', 'Цена за м²', 'Стоимость'],
    ];

    rooms.forEach((room, roomIndex) => {
      const roomOptions = selectedOptions[roomIndex] || {};
      const floorArea = room.width * room.length;
      const wallArea = 2 * room.height * (room.width + room.length);
      const ceilingArea = floorArea;

      Object.entries(roomOptions).forEach(([optionKey, selected]) => {
        if (selected && pricingLookup[optionKey]) {
          const option = pricingLookup[optionKey];
          let area = floorArea;

          if (option.category === 'walls') area = wallArea;
          else if (option.category === 'ceiling') area = ceilingArea;
          else if (option.category === 'electrical' || option.category === 'plumbing') area = 1;

          const cost = area * option.price_per_sqm;

          detailsData.push([
            room.name,
            option.name_ru,
            `${area.toFixed(2)} ${option.unit}`,
            `${option.price_per_sqm} ₽`,
            `${cost.toFixed(0)} ₽`
          ]);
        }
      });
    });

    detailsData.push(['', '', '', '', '']);
    detailsData.push(['', '', '', 'ИТОГО:', `${project.total_cost} ₽`]);

    const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
    XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Детализация');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="renovation-estimate-${shareId}.xlsx"`);
    res.send(buffer);

  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).json({ success: false, error: 'Ошибка экспорта' });
  }
});

// ============================================
// API Routes - Admin
// ============================================

/**
 * Admin login - returns session token for subsequent requests
 * Rate limited more strictly to prevent brute force
 */
app.post('/api/admin/login', rateLimit(5, 15 * 60 * 1000), (req, res) => {
  try {
    const { password } = req.body;
    const setting = db.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?').get('admin_password');

    if (setting && setting.setting_value === password) {
      // Generate secure session token
      const token = generateSessionToken();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      // Store session server-side
      adminSessions.set(token, {
        createdAt: Date.now(),
        expiresAt: expiresAt
      });

      res.json({
        success: true,
        token: token,
        expiresAt: expiresAt
      });
    } else {
      // Delay response to slow down brute force attempts
      setTimeout(() => {
        res.status(401).json({ success: false, error: 'Неверный пароль' });
      }, 1000);
    }
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({ success: false, error: 'Ошибка входа' });
  }
});

/**
 * Admin logout - invalidates session
 */
app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) {
    adminSessions.delete(token);
  }
  res.json({ success: true });
});

/**
 * Change admin password (PROTECTED)
 */
app.put('/api/admin/password', requireAdmin, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const setting = db.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?').get('admin_password');

    if (!setting || setting.setting_value !== currentPassword) {
      return res.status(401).json({ success: false, error: 'Неверный текущий пароль' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Пароль должен быть не менее 6 символов' });
    }

    db.prepare('UPDATE admin_settings SET setting_value = ? WHERE setting_key = ?').run(newPassword, 'admin_password');

    // Invalidate all sessions after password change
    adminSessions.clear();

    res.json({ success: true, message: 'Пароль изменён. Войдите заново.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, error: 'Ошибка смены пароля' });
  }
});

/**
 * Get all projects (admin - PROTECTED)
 */
app.get('/api/admin/projects', requireAdmin, (req, res) => {
  try {
    const projects = db.prepare('SELECT share_id, name, total_cost, created_at, updated_at FROM projects ORDER BY updated_at DESC').all();
    res.json({ success: true, projects: projects });
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки проектов' });
  }
});

/**
 * Verify admin session (for client-side checks)
 */
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true, isAdmin: true });
});

// ============================================
// Public Blog (SEO articles)
// ============================================

app.get('/blog', (req, res) => {
  try {
    const articles = db.prepare(
      "SELECT slug, title, description, preview_svg, created_at FROM articles WHERE status = 'published' ORDER BY created_at DESC"
    ).all();
    res.send(blog.renderBlogList(articles));
  } catch (error) {
    console.error('Error rendering blog:', error);
    res.status(500).send('Ошибка загрузки блога');
  }
});

app.get('/blog/:slug', (req, res) => {
  try {
    const article = db.prepare(
      "SELECT * FROM articles WHERE slug = ? AND status = 'published'"
    ).get(req.params.slug);
    if (!article) {
      return res.status(404).send(blog.renderBlogList(
        db.prepare("SELECT slug, title, description, preview_svg, created_at FROM articles WHERE status = 'published' ORDER BY created_at DESC").all()
      ));
    }
    const others = db.prepare(
      "SELECT slug, title, created_at FROM articles WHERE status = 'published' AND id != ? ORDER BY created_at DESC LIMIT 4"
    ).all(article.id);
    res.send(blog.renderArticle(article, others));
  } catch (error) {
    console.error('Error rendering article:', error);
    res.status(500).send('Ошибка загрузки статьи');
  }
});

// Dynamic sitemap including published articles
app.get('/sitemap.xml', (req, res) => {
  try {
    const articles = db.prepare(
      "SELECT slug, updated_at FROM articles WHERE status = 'published' ORDER BY created_at DESC"
    ).all();
    res.type('application/xml').send(blog.renderSitemap(articles));
  } catch (error) {
    console.error('Error rendering sitemap:', error);
    res.status(500).send('');
  }
});

// ============================================
// Article Studio (hidden, admin-only)
// ============================================
//
// The studio page lives OUTSIDE public/ so the static middleware can
// never serve it. It is reachable only via the secret path below
// (configure STUDIO_PATH in .env), is marked noindex, and every API
// endpoint requires an admin session. AI keys never leave the server.

const STUDIO_PATH = process.env.STUDIO_PATH || '/studio-x9k2m';

app.get(STUDIO_PATH, (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'private', 'studio.html'));
});

// noindex for admin surfaces
app.use(['/admin', '/api'], (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

/** Which providers are configured (booleans only - no key material). */
app.get('/api/studio/providers', requireAdmin, (req, res) => {
  res.json({ success: true, providers: ai.getProviders(), studioPath: STUDIO_PATH });
});

/** Suggest article topics. */
app.post('/api/studio/suggest', requireAdmin, rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  try {
    const existing = db.prepare('SELECT title FROM articles ORDER BY created_at DESC LIMIT 40').all().map(r => r.title);
    const topics = await ai.suggestTopics({ provider: req.body.provider, existing });
    res.json({ success: true, topics });
  } catch (error) {
    console.error('Error suggesting topics:', error.message);
    res.status(502).json({ success: false, error: error.message });
  }
});

/** Generate a full article (does not save - returns draft for review). */
app.post('/api/studio/generate', requireAdmin, rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { topic, extra, provider } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ success: false, error: 'Укажите тему статьи' });
    }
    const article = await ai.generateArticle({ topic: topic.trim(), extra, provider });
    res.json({ success: true, article });
  } catch (error) {
    console.error('Error generating article:', error.message);
    res.status(502).json({ success: false, error: error.message });
  }
});

/** List all articles (drafts included). */
app.get('/api/studio/articles', requireAdmin, (req, res) => {
  const articles = db.prepare(
    'SELECT id, slug, title, description, status, provider, created_at, updated_at FROM articles ORDER BY created_at DESC'
  ).all();
  res.json({ success: true, articles });
});

/** Get one article with full content. */
app.get('/api/studio/articles/:id', requireAdmin, (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ success: false, error: 'Статья не найдена' });
  res.json({ success: true, article });
});

function uniqueSlug(base, excludeId) {
  let slug = ai.slugify(base);
  let i = 2;
  while (true) {
    const row = excludeId
      ? db.prepare('SELECT id FROM articles WHERE slug = ? AND id != ?').get(slug, excludeId)
      : db.prepare('SELECT id FROM articles WHERE slug = ?').get(slug);
    if (!row) return slug;
    slug = `${ai.slugify(base)}-${i++}`;
  }
}

function articlePayload(body) {
  return {
    title: ai.stripEmDashes(String(body.title || '').trim()),
    description: ai.stripEmDashes(String(body.description || '').trim()),
    keywords: ai.stripEmDashes(String(body.keywords || '').trim()),
    preview_svg: ai.sanitizeHtml(String(body.preview_svg || '')),
    content_html: ai.sanitizeHtml(ai.stripEmDashes(String(body.content_html || ''))),
    status: body.status === 'published' ? 'published' : 'draft',
    provider: String(body.provider || '')
  };
}

/** Save a new article. */
app.post('/api/studio/articles', requireAdmin, (req, res) => {
  try {
    const p = articlePayload(req.body);
    if (!p.title || !p.content_html) {
      return res.status(400).json({ success: false, error: 'Нужны заголовок и текст статьи' });
    }
    const slug = uniqueSlug(req.body.slug || p.title);
    const result = db.prepare(`
      INSERT INTO articles (slug, title, description, keywords, preview_svg, content_html, status, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(slug, p.title, p.description, p.keywords, p.preview_svg, p.content_html, p.status, p.provider);
    res.json({ success: true, id: result.lastInsertRowid, slug });
  } catch (error) {
    console.error('Error saving article:', error);
    res.status(500).json({ success: false, error: 'Ошибка сохранения статьи' });
  }
});

/** Update an article. */
app.put('/api/studio/articles/:id', requireAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM articles WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Статья не найдена' });
    const p = articlePayload(req.body);
    if (!p.title || !p.content_html) {
      return res.status(400).json({ success: false, error: 'Нужны заголовок и текст статьи' });
    }
    const slug = uniqueSlug(req.body.slug || p.title, existing.id);
    db.prepare(`
      UPDATE articles SET slug = ?, title = ?, description = ?, keywords = ?, preview_svg = ?,
        content_html = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(slug, p.title, p.description, p.keywords, p.preview_svg, p.content_html, p.status, existing.id);
    res.json({ success: true, slug });
  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({ success: false, error: 'Ошибка обновления статьи' });
  }
});

/** Delete an article. */
app.delete('/api/studio/articles/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============================================
// Page Routes
// ============================================

// Serve calculator page
app.get('/calculator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calculator.html'));
});

// Serve project page
app.get('/project/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     🏠 МастерДом — ремонт квартир и домов                  ║
╠════════════════════════════════════════════════════════════╣
║  Сайт:        http://localhost:${PORT}                        ║
║  Блог:        http://localhost:${PORT}/blog                   ║
║  Калькулятор: http://localhost:${PORT}/calculator             ║
║  Студия статей: http://localhost:${PORT}${STUDIO_PATH}
║  Админ-панель: http://localhost:${PORT}/admin                 ║
╚════════════════════════════════════════════════════════════╝
  `);
});
