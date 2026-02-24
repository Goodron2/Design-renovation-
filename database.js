/**
 * Database setup and initialization
 * Uses SQLite for simple, file-based storage
 */

const Database = require("better-sqlite3");
const path = require("path");

// Create database file in data directory
const dbPath = path.join(__dirname, "data", "database.sqlite");
const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

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
      pricing_type TEXT DEFAULT 'area',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add pricing_type column if missing (for existing DBs)
  try {
    const columns = db.pragma("table_info(pricing_options)");
    const hasPricingType = columns.some(col => col.name === "pricing_type");
    if (!hasPricingType) {
      db.exec("ALTER TABLE pricing_options ADD COLUMN pricing_type TEXT DEFAULT 'area'");
      db.exec("UPDATE pricing_options SET pricing_type = 'quantity' WHERE category IN ('electrical', 'plumbing')");
      console.log("✓ Migration: added pricing_type column");
    }
  } catch (e) {
    console.log("Migration check skipped:", e.message);
  }

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

  // Chat history table
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

  // Admin settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL
    )
  `);

  // Insert default admin password if not exists
  const adminExists = db.prepare("SELECT * FROM admin_settings WHERE setting_key = ?").get("admin_password");
  if (!adminExists) {
    db.prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?)").run("admin_password", "admin123");
  }

  // Insert default pricing options if table is empty
  const pricingCount = db.prepare("SELECT COUNT(*) as count FROM pricing_options").get();
  if (pricingCount.count === 0) {
    insertDefaultPricing();
  }

  console.log("✓ Database initialized successfully");
}

/**
 * Insert default pricing options
 */
function insertDefaultPricing() {
  const defaultOptions = [
    // Walls
    { category: "walls", name_ru: "Покраска стен", name_key: "wall_painting", price_per_sqm: 450, unit: "м²", description_ru: "Подготовка и покраска стен", pricing_type: "area" },
    { category: "walls", name_ru: "Обои", name_key: "wallpaper", price_per_sqm: 550, unit: "м²", description_ru: "Поклейка обоев с подготовкой", pricing_type: "area" },
    { category: "walls", name_ru: "Декоративная штукатурка", name_key: "decorative_plaster", price_per_sqm: 1200, unit: "м²", description_ru: "Нанесение декоративной штукатурки", pricing_type: "area" },
    // Floors
    { category: "floors", name_ru: "Ламинат", name_key: "laminate", price_per_sqm: 800, unit: "м²", description_ru: "Укладка ламината с подложкой", pricing_type: "area" },
    { category: "floors", name_ru: "Плитка", name_key: "floor_tile", price_per_sqm: 1500, unit: "м²", description_ru: "Укладка напольной плитки", pricing_type: "area" },
    { category: "floors", name_ru: "Линолеум", name_key: "linoleum", price_per_sqm: 400, unit: "м²", description_ru: "Укладка линолеума", pricing_type: "area" },
    // Ceiling
    { category: "ceiling", name_ru: "Покраска потолка", name_key: "ceiling_painting", price_per_sqm: 350, unit: "м²", description_ru: "Подготовка и покраска потолка", pricing_type: "area" },
    { category: "ceiling", name_ru: "Натяжной потолок", name_key: "stretch_ceiling", price_per_sqm: 900, unit: "м²", description_ru: "Установка натяжного потолка", pricing_type: "area" },
    { category: "ceiling", name_ru: "Гипсокартон", name_key: "drywall_ceiling", price_per_sqm: 1100, unit: "м²", description_ru: "Монтаж потолка из гипсокартона", pricing_type: "area" },
    // Electrical (quantity-based)
    { category: "electrical", name_ru: "Розетки", name_key: "outlets", price_per_sqm: 200, unit: "шт", description_ru: "Установка розеток", pricing_type: "quantity" },
    { category: "electrical", name_ru: "Освещение", name_key: "lighting", price_per_sqm: 300, unit: "точка", description_ru: "Монтаж точек освещения", pricing_type: "quantity" },
    // Plumbing (quantity-based)
    { category: "plumbing", name_ru: "Замена труб", name_key: "pipe_replacement", price_per_sqm: 2500, unit: "точка", description_ru: "Замена водопроводных труб", pricing_type: "quantity" },
    { category: "plumbing", name_ru: "Установка сантехники", name_key: "plumbing_fixtures", price_per_sqm: 3000, unit: "шт", description_ru: "Установка сантехнического оборудования", pricing_type: "quantity" },
  ];

  const insert = db.prepare(`
    INSERT INTO pricing_options (category, name_ru, name_key, price_per_sqm, unit, description_ru, pricing_type)
    VALUES (@category, @name_ru, @name_key, @price_per_sqm, @unit, @description_ru, @pricing_type)
  `);

  const insertMany = db.transaction((options) => {
    for (const option of options) {
      insert.run(option);
    }
  });

  insertMany(defaultOptions);
  console.log("✓ Default pricing options inserted");
}

// Initialize on module load
initializeDatabase();

module.exports = db;
