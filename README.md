# Калькулятор стоимости ремонта / Renovation Cost Estimator

Веб-приложение для визуального планирования и расчёта стоимости ремонта квартир с 3D-визуализацией.

## Возможности

- **3D визуализация комнат** — интерактивный просмотр с возможностью вращения и масштабирования
- **Расчёт стоимости** — автоматический подсчёт на основе выбранных работ и площади
- **Множество комнат** — добавляйте несколько комнат в один проект
- **AI чат-помощник** — получайте рекомендации по ремонту (готов к интеграции Claude API)
- **Экспорт в Excel** — скачивайте детальную смету в формате .xlsx
- **Шаринг проектов** — делитесь ссылкой на проект с подрядчиком
- **Админ-панель** — управление ценами и просмотр проектов

## Технологии

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **3D**: Three.js
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Excel**: xlsx library

## Установка

### Требования
- Node.js 16+
- npm

### Шаги установки

```bash
# Клонирование репозитория
git clone <repo-url>
cd Design-renovation-

# Установка зависимостей
npm install

# Запуск сервера
npm start
```

Сервер запустится на `http://localhost:3000`

## Использование

### Для клиентов

1. Откройте главную страницу
2. Добавьте комнаты с указанием размеров
3. Выберите необходимые работы (стены, полы, потолок и т.д.)
4. Настройте цвета в 3D-просмотре
5. Используйте AI чат для получения рекомендаций
6. Сохраните проект и поделитесь ссылкой с подрядчиком

### Для подрядчиков

1. Откройте ссылку, полученную от клиента
2. Просмотрите детали проекта и 3D-визуализацию
3. Скачайте смету в Excel для корректировки

### Админ-панель

Доступна по адресу `/admin`

- **Пароль по умолчанию**: `admin123`
- Управление ценами на работы
- Просмотр всех проектов
- Добавление новых услуг
- Смена пароля администратора

## Структура проекта

```
Design-renovation-/
├── package.json          # Зависимости проекта
├── server.js             # Express сервер + API
├── database.js           # SQLite база данных
├── public/
│   ├── index.html        # Главная страница
│   ├── admin.html        # Админ-панель
│   ├── project.html      # Просмотр проекта
│   ├── css/
│   │   └── styles.css    # Стили (mobile-first)
│   └── js/
│       ├── app.js        # Главный контроллер
│       ├── room3d.js     # Three.js 3D визуализация
│       ├── calculator.js # Расчёт стоимости
│       ├── chat.js       # AI чат
│       └── admin.js      # Логика админ-панели
├── data/
│   └── database.sqlite   # SQLite база (создаётся автоматически)
└── README.md
```

## API Endpoints

### Проекты
- `POST /api/projects` — создать проект
- `GET /api/projects/:shareId` — получить проект
- `PUT /api/projects/:shareId` — обновить проект

### Цены
- `GET /api/pricing` — получить активные цены
- `PUT /api/pricing/:id` — обновить цену (админ)
- `GET /api/admin/pricing` — все цены (админ)
- `POST /api/admin/pricing` — добавить услугу (админ)

### Экспорт
- `GET /api/export/:shareId` — скачать Excel

### Чат
- `POST /api/chat` — отправить сообщение AI

### Админ
- `POST /api/admin/login` — вход
- `PUT /api/admin/password` — сменить пароль
- `GET /api/admin/projects` — список проектов

## Интеграция Claude API

Для подключения Claude API вместо mock-ответов:

1. Зарегистрируйтесь на [console.anthropic.com](https://console.anthropic.com)
2. Получите API ключ
3. Установите SDK: `npm install @anthropic-ai/sdk`
4. Добавьте переменную окружения: `ANTHROPIC_API_KEY=your_key`
5. Замените функцию `generateMockResponse()` в `server.js` на вызов Claude API (пример в `chat.js`)

## Развёртывание на сервере

```bash
# Подключение по SSH
ssh user@your-server

# Установка Node.js (если не установлен)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Клонирование и запуск
git clone <repo-url>
cd Design-renovation-
npm install
npm start

# Для production рекомендуется использовать PM2
npm install -g pm2
pm2 start server.js --name renovation
pm2 save
```

## Лицензия

ISC
