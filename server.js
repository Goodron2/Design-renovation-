/**
 * Renovation Cost Estimator - Main Server
 * Express server with SQLite database
 */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
 * Update pricing option (admin only)
 */
app.put('/api/pricing/:id', (req, res) => {
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
 * Get all pricing options for admin (including inactive)
 */
app.get('/api/admin/pricing', (req, res) => {
  try {
    const options = db.prepare('SELECT * FROM pricing_options ORDER BY category, name_ru').all();
    res.json({ success: true, options: options });
  } catch (error) {
    console.error('Error getting admin pricing:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки цен' });
  }
});

/**
 * Add new pricing option (admin only)
 */
app.post('/api/admin/pricing', (req, res) => {
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

/**
 * Send message to AI chat
 * Currently uses mock responses, ready for Claude API integration
 */
app.post('/api/chat', (req, res) => {
  try {
    const { projectId, message, projectContext } = req.body;

    // Save user message to history if project exists
    if (projectId) {
      const project = db.prepare('SELECT id FROM projects WHERE share_id = ?').get(projectId);
      if (project) {
        db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, 'user', message);
      }
    }

    // Generate mock AI response
    // TODO: Replace with Claude API call when API key is available
    const aiResponse = generateMockResponse(message, projectContext);

    // Save AI response to history
    if (projectId) {
      const project = db.prepare('SELECT id FROM projects WHERE share_id = ?').get(projectId);
      if (project) {
        db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, 'assistant', aiResponse);
      }
    }

    res.json({ success: true, response: aiResponse });
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
 * Admin login
 */
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    const setting = db.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?').get('admin_password');

    if (setting && setting.setting_value === password) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Неверный пароль' });
    }
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({ success: false, error: 'Ошибка входа' });
  }
});

/**
 * Change admin password
 */
app.put('/api/admin/password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const setting = db.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?').get('admin_password');

    if (!setting || setting.setting_value !== currentPassword) {
      return res.status(401).json({ success: false, error: 'Неверный текущий пароль' });
    }

    db.prepare('UPDATE admin_settings SET setting_value = ? WHERE setting_key = ?').run(newPassword, 'admin_password');
    res.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, error: 'Ошибка смены пароля' });
  }
});

/**
 * Get all projects (admin)
 */
app.get('/api/admin/projects', (req, res) => {
  try {
    const projects = db.prepare('SELECT share_id, name, total_cost, created_at, updated_at FROM projects ORDER BY updated_at DESC').all();
    res.json({ success: true, projects: projects });
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки проектов' });
  }
});

// ============================================
// Page Routes
// ============================================

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
║     🏠 Калькулятор стоимости ремонта                       ║
║     Renovation Cost Estimator                               ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                  ║
║  Admin panel: http://localhost:${PORT}/admin                  ║
║  Default admin password: admin123                           ║
╚════════════════════════════════════════════════════════════╝
  `);
});
