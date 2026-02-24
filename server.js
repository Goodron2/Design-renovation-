/**
 * Renovation Cost Estimator - Main Server
 * Express server with SQLite database
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const RoomShapes = require('./public/js/shapes');

// Load environment variables from .env file (if exists)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, use system environment variables
}

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const adminSessions = new Map();
const rateLimitStore = new Map();

// ============================================
// Security Middleware
// ============================================

function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
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

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function verifyAdminSession(token) {
  if (!token) return false;
  const session = adminSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

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

function checkAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  req.isAdmin = verifyAdminSession(token);
  next();
}

// Middleware
app.use(express.json());
app.use(rateLimit(200, 15 * 60 * 1000));
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

app.post('/api/projects', (req, res) => {
  try {
    const { name, rooms, selectedOptions, totalCost } = req.body;
    const shareId = uuidv4().substring(0, 8);

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
      shareUrl: '/project/' + shareId
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: 'Ошибка создания проекта' });
  }
});

app.get('/api/projects/:shareId', (req, res) => {
  try {
    const { shareId } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE share_id = ?').get(shareId);

    if (!project) {
      return res.status(404).json({ success: false, error: 'Проект не найден' });
    }

    project.rooms = JSON.parse(project.rooms);
    project.selected_options = JSON.parse(project.selected_options);

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

app.get('/api/pricing', (req, res) => {
  try {
    const options = db.prepare('SELECT * FROM pricing_options WHERE is_active = 1 ORDER BY category, name_ru').all();
    res.json({ success: true, options: options });
  } catch (error) {
    console.error('Error getting pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки цен' });
  }
});

app.put('/api/pricing/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { price_per_sqm, is_active, pricing_type } = req.body;

    const stmt = db.prepare('UPDATE pricing_options SET price_per_sqm = ?, is_active = ?, pricing_type = ? WHERE id = ?');
    stmt.run(price_per_sqm, is_active ? 1 : 0, pricing_type || 'area', id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка обновления цены' });
  }
});

app.get('/api/admin/pricing', requireAdmin, (req, res) => {
  try {
    const options = db.prepare('SELECT * FROM pricing_options ORDER BY category, name_ru').all();
    res.json({ success: true, options: options });
  } catch (error) {
    console.error('Error getting admin pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки цен' });
  }
});

app.post('/api/admin/pricing', requireAdmin, (req, res) => {
  try {
    const { category, name_ru, name_key, price_per_sqm, unit, description_ru, pricing_type } = req.body;

    const stmt = db.prepare(`
      INSERT INTO pricing_options (category, name_ru, name_key, price_per_sqm, unit, description_ru, pricing_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(category, name_ru, name_key, price_per_sqm, unit || 'м²', description_ru || '', pricing_type || 'area');

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error adding pricing option:', error);
    res.status(500).json({ success: false, error: 'Ошибка добавления опции' });
  }
});

// ============================================
// API Routes - Chat
// ============================================

let anthropicClient = null;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here') {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    console.log('✓ Claude API initialized');
  } catch (e) {
    console.log('⚠ Claude API SDK not installed. Run: npm install @anthropic-ai/sdk');
  }
}

async function generateAIResponse(message, context, useRealAI = false) {
  if (anthropicClient && useRealAI) {
    try {
      const systemPrompt = 'Вы - опытный консультант по ремонту квартир.\nПомогайте пользователям с выбором материалов, расчётом стоимости и рекомендациями.\nОтвечайте на русском языке. Будьте кратким и полезным.' +
        (context ? '\n\nКонтекст проекта:\n- Количество комнат: ' + (context.rooms?.length || 0) + '\n- Общая площадь: ' + (context.totalArea || 0) + ' м²\n- Текущая стоимость: ' + (context.totalCost || 0) + ' ₽' : '');

      const response = await anthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude API error:', error);
      return generateMockResponse(message, context);
    }
  }

  return generateMockResponse(message, context);
}

app.post('/api/chat', checkAdmin, rateLimit(30, 15 * 60 * 1000), async (req, res) => {
  try {
    const { projectId, message, projectContext } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Сообщение не может быть пустым' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ success: false, error: 'Сообщение слишком длинное' });
    }

    if (projectId) {
      const project = db.prepare('SELECT id FROM projects WHERE share_id = ?').get(projectId);
      if (project) {
        db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, 'user', message);
      }
    }

    const useRealAI = req.isAdmin && anthropicClient !== null;
    const aiResponse = await generateAIResponse(message, projectContext, useRealAI);

    if (projectId) {
      const project = db.prepare('SELECT id FROM projects WHERE share_id = ?').get(projectId);
      if (project) {
        db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, 'assistant', aiResponse);
      }
    }

    res.json({ success: true, response: aiResponse, isRealAI: useRealAI });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ success: false, error: 'Ошибка чата' });
  }
});

function generateMockResponse(message, context) {
  const lowerMessage = message.toLowerCase();

  if (context && context.rooms && context.rooms.length > 0) {
    const totalArea = context.rooms.reduce((sum, room) => {
      const r = RoomShapes.normalizeRoom(room);
      return sum + RoomShapes.calculateRoomArea(r);
    }, 0);

    if (lowerMessage.includes('стоимость') || lowerMessage.includes('цена') || lowerMessage.includes('сколько')) {
      return 'На основе вашего проекта общая площадь составляет ' + totalArea.toFixed(1) + ' м². Текущая оценка стоимости: ' + (context.totalCost?.toLocaleString('ru-RU') || 0) + ' ₽. Хотите, чтобы я объяснил расчёт подробнее?';
    }

    if (lowerMessage.includes('рекомендац') || lowerMessage.includes('совет')) {
      return 'Для ваших ' + context.rooms.length + ' комнат(ы) общей площадью ' + totalArea.toFixed(1) + ' м² я бы рекомендовал обратить внимание на комбинацию материалов. Например, ламинат отлично подойдёт для жилых комнат, а плитка — для кухни и ванной.';
    }
  }

  if (lowerMessage.includes('привет') || lowerMessage.includes('здравствуй')) {
    return 'Здравствуйте! Я ваш помощник по планированию ремонта. Чем могу помочь?';
  }
  if (lowerMessage.includes('ламинат')) {
    return 'Ламинат — отличный выбор для жилых комнат. Он практичен, легко укладывается и имеет много вариантов дизайна.';
  }
  if (lowerMessage.includes('плитка') || lowerMessage.includes('плитку')) {
    return 'Плитка идеально подходит для ванной и кухни благодаря водостойкости. Учтите, что укладка требует выравнивания пола.';
  }
  if (lowerMessage.includes('потолок')) {
    return 'Для потолка есть варианты: покраска (бюджетно), натяжной (быстрый монтаж) или гипсокартон (многоуровневые конструкции).';
  }
  if (lowerMessage.includes('стен') || lowerMessage.includes('обои')) {
    return 'Для стен популярны: покраска (легко обновить), обои (выбор дизайнов) и декоративная штукатурка (премиум текстура).';
  }

  return 'Я могу помочь с выбором материалов, расчётом стоимости и рекомендациями. Задайте вопрос о конкретных работах!';
}

// ============================================
// API Routes - Export
// ============================================

app.get('/api/export/:shareId', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { shareId } = req.params;

    const project = db.prepare('SELECT * FROM projects WHERE share_id = ?').get(shareId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Проект не найден' });
    }

    const rooms = JSON.parse(project.rooms).map(r => RoomShapes.normalizeRoom(r));
    const selectedOptions = JSON.parse(project.selected_options);
    const pricingOptionsDb = db.prepare('SELECT * FROM pricing_options').all();

    const pricingLookup = {};
    pricingOptionsDb.forEach(opt => {
      pricingLookup[opt.name_key] = opt;
    });

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

    rooms.forEach((room, index) => {
      const area = RoomShapes.calculateRoomArea(room);
      const wallArea = RoomShapes.calculateWallArea(room);
      const p = room.params;
      summaryData.push(['Комната ' + (index + 1) + ': ' + room.name, '', '', '']);
      summaryData.push(['Размеры:', p.width + ' x ' + p.length + ' x ' + room.height + ' м', '', '']);
      summaryData.push(['Форма:', room.shape === 'rectangle' ? 'Прямоугольник' : room.shape === 'l_shape' ? 'Г-образная' : room.shape === 't_shape' ? 'Т-образная' : room.shape, '', '']);
      summaryData.push(['Площадь пола:', area.toFixed(2) + ' м²', '', '']);
      summaryData.push(['Площадь стен:', wallArea.toFixed(2) + ' м²', '', '']);
      summaryData.push(['', '', '', '']);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

    // Detailed pricing sheet
    const detailsData = [
      ['Детализация работ', '', '', '', ''],
      ['', '', '', '', ''],
      ['Комната', 'Работа', 'Количество', 'Цена за ед.', 'Стоимость'],
    ];

    rooms.forEach((room, roomIndex) => {
      const roomOptions = selectedOptions[roomIndex] || {};
      const floorArea = RoomShapes.calculateRoomArea(room);
      const wallArea = RoomShapes.calculateWallArea(room);
      const ceilingArea = floorArea;

      Object.entries(roomOptions).forEach(([optionKey, value]) => {
        if ((value === true || (typeof value === 'number' && value > 0)) && pricingLookup[optionKey]) {
          const option = pricingLookup[optionKey];
          const isQty = option.pricing_type === 'quantity' || option.category === 'electrical' || option.category === 'plumbing';

          let area;
          if (isQty) {
            area = typeof value === 'number' ? value : 1;
          } else if (option.category === 'walls') {
            area = wallArea;
          } else if (option.category === 'ceiling') {
            area = ceilingArea;
          } else {
            area = floorArea;
          }

          const cost = Math.round(area * option.price_per_sqm);

          detailsData.push([
            room.name,
            option.name_ru,
            (isQty ? area : area.toFixed(2)) + ' ' + option.unit,
            option.price_per_sqm + ' ₽',
            cost + ' ₽'
          ]);
        }
      });
    });

    detailsData.push(['', '', '', '', '']);
    detailsData.push(['', '', '', 'ИТОГО:', project.total_cost + ' ₽']);

    const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
    XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Детализация');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="renovation-estimate-' + shareId + '.xlsx"');
    res.send(buffer);

  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).json({ success: false, error: 'Ошибка экспорта' });
  }
});

// ============================================
// API Routes - Admin
// ============================================

app.post('/api/admin/login', rateLimit(5, 15 * 60 * 1000), (req, res) => {
  try {
    const { password } = req.body;
    const setting = db.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?').get('admin_password');

    if (setting && setting.setting_value === password) {
      const token = generateSessionToken();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000);

      adminSessions.set(token, { createdAt: Date.now(), expiresAt: expiresAt });

      res.json({ success: true, token: token, expiresAt: expiresAt });
    } else {
      setTimeout(() => {
        res.status(401).json({ success: false, error: 'Неверный пароль' });
      }, 1000);
    }
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({ success: false, error: 'Ошибка входа' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) adminSessions.delete(token);
  res.json({ success: true });
});

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
    adminSessions.clear();

    res.json({ success: true, message: 'Пароль изменён. Войдите заново.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, error: 'Ошибка смены пароля' });
  }
});

app.get('/api/admin/projects', requireAdmin, (req, res) => {
  try {
    const projects = db.prepare('SELECT share_id, name, total_cost, created_at, updated_at FROM projects ORDER BY updated_at DESC').all();
    res.json({ success: true, projects: projects });
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки проектов' });
  }
});

app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true, isAdmin: true });
});

// ============================================
// Page Routes
// ============================================

app.get('/project/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Калькулятор стоимости ремонта                          ║
║     Renovation Cost Estimator                               ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                  ║
║  Admin panel: http://localhost:${PORT}/admin                  ║
╚════════════════════════════════════════════════════════════╝
  `);
});
