/**
 * Database setup and initialization
 * Uses SQLite for simple, file-based storage
 */

const Database = require('better-sqlite3');
const path = require('path');

// Create database file in data directory
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Initialize database tables
 */
function initializeDatabase() {
  // Pricing options table - stores all available renovation options with prices
  db.exec(`
    CREATE TABLE IF NOT EXISTS pricing_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      price_per_sqm REAL NOT NULL,
      unit TEXT DEFAULT 'м²',
      description_ru TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Projects table - stores user renovation projects
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_id TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'Новый проект',
      rooms TEXT NOT NULL,
      selected_options TEXT NOT NULL,
      total_cost REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chat history table - stores AI chat messages for each project
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Admin settings table - stores admin password and settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL
    )
  `);

  // Blog articles table - AI-generated SEO articles
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      keywords TEXT DEFAULT '',
      preview_svg TEXT DEFAULT '',
      content_html TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      provider TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default admin password if not exists (password: admin123)
  const adminExists = db.prepare('SELECT * FROM admin_settings WHERE setting_key = ?').get('admin_password');
  if (!adminExists) {
    db.prepare('INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?)').run('admin_password', 'admin123');
  }

  // Insert default pricing options if table is empty
  const pricingCount = db.prepare('SELECT COUNT(*) as count FROM pricing_options').get();
  if (pricingCount.count === 0) {
    insertDefaultPricing();
  }

  console.log('✓ Database initialized successfully');
}

/**
 * Insert default pricing options
 * Prices are in rubles per square meter
 */
function insertDefaultPricing() {
  const defaultOptions = [
    // Walls - Стены
    { category: 'walls', name_ru: 'Покраска стен', name_key: 'wall_painting', price_per_sqm: 450, unit: 'м²', description_ru: 'Подготовка и покраска стен' },
    { category: 'walls', name_ru: 'Обои', name_key: 'wallpaper', price_per_sqm: 550, unit: 'м²', description_ru: 'Поклейка обоев с подготовкой' },
    { category: 'walls', name_ru: 'Декоративная штукатурка', name_key: 'decorative_plaster', price_per_sqm: 1200, unit: 'м²', description_ru: 'Нанесение декоративной штукатурки' },

    // Floors - Полы
    { category: 'floors', name_ru: 'Ламинат', name_key: 'laminate', price_per_sqm: 800, unit: 'м²', description_ru: 'Укладка ламината с подложкой' },
    { category: 'floors', name_ru: 'Плитка', name_key: 'floor_tile', price_per_sqm: 1500, unit: 'м²', description_ru: 'Укладка напольной плитки' },
    { category: 'floors', name_ru: 'Линолеум', name_key: 'linoleum', price_per_sqm: 400, unit: 'м²', description_ru: 'Укладка линолеума' },

    // Ceiling - Потолок
    { category: 'ceiling', name_ru: 'Покраска потолка', name_key: 'ceiling_painting', price_per_sqm: 350, unit: 'м²', description_ru: 'Подготовка и покраска потолка' },
    { category: 'ceiling', name_ru: 'Натяжной потолок', name_key: 'stretch_ceiling', price_per_sqm: 900, unit: 'м²', description_ru: 'Установка натяжного потолка' },
    { category: 'ceiling', name_ru: 'Гипсокартон', name_key: 'drywall_ceiling', price_per_sqm: 1100, unit: 'м²', description_ru: 'Монтаж потолка из гипсокартона' },

    // Electrical - Электрика
    { category: 'electrical', name_ru: 'Розетки', name_key: 'outlets', price_per_sqm: 200, unit: 'шт', description_ru: 'Установка розеток' },
    { category: 'electrical', name_ru: 'Освещение', name_key: 'lighting', price_per_sqm: 300, unit: 'точка', description_ru: 'Монтаж точек освещения' },

    // Plumbing - Сантехника
    { category: 'plumbing', name_ru: 'Замена труб', name_key: 'pipe_replacement', price_per_sqm: 2500, unit: 'точка', description_ru: 'Замена водопроводных труб' },
    { category: 'plumbing', name_ru: 'Установка сантехники', name_key: 'plumbing_fixtures', price_per_sqm: 3000, unit: 'шт', description_ru: 'Установка сантехнического оборудования' },
  ];

  const insert = db.prepare(`
    INSERT INTO pricing_options (category, name_ru, name_key, price_per_sqm, unit, description_ru)
    VALUES (@category, @name_ru, @name_key, @price_per_sqm, @unit, @description_ru)
  `);

  const insertMany = db.transaction((options) => {
    for (const option of options) {
      insert.run(option);
    }
  });

  insertMany(defaultOptions);
  console.log('✓ Default pricing options inserted');
}

// Initialize on module load
initializeDatabase();

module.exports = db;
