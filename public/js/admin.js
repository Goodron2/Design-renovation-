/**
 * Admin Panel JavaScript
 * Handles admin authentication and pricing management
 */

// State
let isAuthenticated = false;
let pricingData = [];

// DOM Elements
const elements = {
  loginSection: document.getElementById('loginSection'),
  adminPanel: document.getElementById('adminPanel'),
  adminPassword: document.getElementById('adminPassword'),
  loginBtn: document.getElementById('loginBtn'),
  loginError: document.getElementById('loginError'),
  logoutBtn: document.getElementById('logoutBtn'),
  pricingTableBody: document.getElementById('pricingTableBody'),
  saveAllPricingBtn: document.getElementById('saveAllPricingBtn'),
  projectsList: document.getElementById('projectsList'),
  // New option form
  newCategory: document.getElementById('newCategory'),
  newNameRu: document.getElementById('newNameRu'),
  newNameKey: document.getElementById('newNameKey'),
  newPrice: document.getElementById('newPrice'),
  newUnit: document.getElementById('newUnit'),
  newDescription: document.getElementById('newDescription'),
  addOptionBtn: document.getElementById('addOptionBtn'),
  // Password change
  currentPassword: document.getElementById('currentPassword'),
  newPassword: document.getElementById('newPassword'),
  changePasswordBtn: document.getElementById('changePasswordBtn'),
  passwordMessage: document.getElementById('passwordMessage')
};

// Category translations
const categoryNames = {
  walls: 'Стены',
  floors: 'Полы',
  ceiling: 'Потолок',
  electrical: 'Электрика',
  plumbing: 'Сантехника'
};

/**
 * Initialize admin panel
 */
function init() {
  // Check if already authenticated (session storage)
  if (sessionStorage.getItem('adminAuth') === 'true') {
    showAdminPanel();
  }

  // Setup event listeners
  elements.loginBtn.addEventListener('click', login);
  elements.adminPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  elements.logoutBtn.addEventListener('click', logout);
  elements.saveAllPricingBtn.addEventListener('click', saveAllPricing);
  elements.addOptionBtn.addEventListener('click', addNewOption);
  elements.changePasswordBtn.addEventListener('click', changePassword);
}

/**
 * Login handler
 */
async function login() {
  const password = elements.adminPassword.value;

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (data.success) {
      sessionStorage.setItem('adminAuth', 'true');
      showAdminPanel();
    } else {
      elements.loginError.style.display = 'block';
      elements.loginError.textContent = data.error || 'Неверный пароль';
    }
  } catch (error) {
    console.error('Login error:', error);
    elements.loginError.style.display = 'block';
    elements.loginError.textContent = 'Ошибка соединения';
  }
}

/**
 * Logout handler
 */
function logout() {
  sessionStorage.removeItem('adminAuth');
  isAuthenticated = false;
  elements.adminPanel.classList.add('hidden');
  elements.loginSection.style.display = 'block';
  elements.adminPassword.value = '';
}

/**
 * Show admin panel and load data
 */
async function showAdminPanel() {
  isAuthenticated = true;
  elements.loginSection.style.display = 'none';
  elements.adminPanel.classList.remove('hidden');

  // Load data
  await loadPricing();
  await loadProjects();
}

/**
 * Load pricing data
 */
async function loadPricing() {
  try {
    const response = await fetch('/api/admin/pricing');
    const data = await response.json();

    if (data.success) {
      pricingData = data.options;
      renderPricingTable();
    }
  } catch (error) {
    console.error('Error loading pricing:', error);
  }
}

/**
 * Render pricing table
 */
function renderPricingTable() {
  elements.pricingTableBody.innerHTML = '';

  // Group by category
  const grouped = {};
  pricingData.forEach(option => {
    if (!grouped[option.category]) {
      grouped[option.category] = [];
    }
    grouped[option.category].push(option);
  });

  // Render each category
  Object.entries(grouped).forEach(([category, options]) => {
    // Category header row
    const headerRow = document.createElement('tr');
    headerRow.className = 'category-row';
    headerRow.innerHTML = `<td colspan="5">${categoryNames[category] || category}</td>`;
    elements.pricingTableBody.appendChild(headerRow);

    // Option rows
    options.forEach(option => {
      const row = document.createElement('tr');
      row.dataset.id = option.id;
      row.innerHTML = `
        <td>
          <strong>${option.name_ru}</strong>
          <br><small class="text-muted">${option.description_ru || ''}</small>
        </td>
        <td>
          <input type="number" class="price-input" value="${option.price_per_sqm}" min="0" step="10">
        </td>
        <td>${option.unit}</td>
        <td>
          <input type="checkbox" class="active-checkbox" ${option.is_active ? 'checked' : ''}>
        </td>
        <td>
          <button class="btn btn-small btn-secondary save-row-btn">Сохранить</button>
        </td>
      `;

      // Add save handler for individual row
      const saveBtn = row.querySelector('.save-row-btn');
      saveBtn.addEventListener('click', () => saveRowPricing(option.id, row));

      elements.pricingTableBody.appendChild(row);
    });
  });
}

/**
 * Save pricing for a single row
 */
async function saveRowPricing(id, row) {
  const priceInput = row.querySelector('.price-input');
  const activeCheckbox = row.querySelector('.active-checkbox');

  try {
    const response = await fetch(`/api/pricing/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_per_sqm: parseFloat(priceInput.value),
        is_active: activeCheckbox.checked
      })
    });

    const data = await response.json();

    if (data.success) {
      // Visual feedback
      row.style.backgroundColor = '#d1fae5';
      setTimeout(() => {
        row.style.backgroundColor = '';
      }, 1000);
    } else {
      alert('Ошибка сохранения: ' + (data.error || 'Неизвестная ошибка'));
    }
  } catch (error) {
    console.error('Save error:', error);
    alert('Ошибка сохранения');
  }
}

/**
 * Save all pricing changes
 */
async function saveAllPricing() {
  const rows = elements.pricingTableBody.querySelectorAll('tr[data-id]');
  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const id = row.dataset.id;
    const priceInput = row.querySelector('.price-input');
    const activeCheckbox = row.querySelector('.active-checkbox');

    try {
      const response = await fetch(`/api/pricing/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_per_sqm: parseFloat(priceInput.value),
          is_active: activeCheckbox.checked
        })
      });

      const data = await response.json();
      if (data.success) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      errorCount++;
    }
  }

  if (errorCount === 0) {
    alert(`Все изменения сохранены (${successCount} записей)`);
  } else {
    alert(`Сохранено: ${successCount}, ошибок: ${errorCount}`);
  }
}

/**
 * Add new pricing option
 */
async function addNewOption() {
  const category = elements.newCategory.value;
  const nameRu = elements.newNameRu.value.trim();
  const nameKey = elements.newNameKey.value.trim().toLowerCase().replace(/\s+/g, '_');
  const price = parseFloat(elements.newPrice.value);
  const unit = elements.newUnit.value.trim() || 'м²';
  const description = elements.newDescription.value.trim();

  // Validate
  if (!nameRu || !nameKey || !price) {
    alert('Заполните все обязательные поля: название, ключ и цену');
    return;
  }

  try {
    const response = await fetch('/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        name_ru: nameRu,
        name_key: nameKey,
        price_per_sqm: price,
        unit,
        description_ru: description
      })
    });

    const data = await response.json();

    if (data.success) {
      // Clear form
      elements.newNameRu.value = '';
      elements.newNameKey.value = '';
      elements.newPrice.value = '';
      elements.newDescription.value = '';

      // Reload table
      await loadPricing();
      alert('Услуга добавлена');
    } else {
      alert('Ошибка: ' + (data.error || 'Не удалось добавить услугу'));
    }
  } catch (error) {
    console.error('Add option error:', error);
    alert('Ошибка добавления услуги');
  }
}

/**
 * Load projects list
 */
async function loadProjects() {
  try {
    const response = await fetch('/api/admin/projects');
    const data = await response.json();

    if (data.success) {
      renderProjectsList(data.projects);
    }
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

/**
 * Render projects list
 */
function renderProjectsList(projects) {
  if (projects.length === 0) {
    elements.projectsList.innerHTML = '<p class="text-muted">Пока нет проектов</p>';
    return;
  }

  elements.projectsList.innerHTML = '';

  projects.forEach(project => {
    const date = new Date(project.created_at).toLocaleDateString('ru-RU');
    const cost = project.total_cost.toLocaleString('ru-RU');

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-info">
        <h3>${project.name}</h3>
        <p>Создан: ${date} | Стоимость: ${cost} ₽</p>
      </div>
      <div class="project-card-actions">
        <a href="/project/${project.share_id}" class="btn btn-small btn-secondary" target="_blank">Открыть</a>
        <a href="/api/export/${project.share_id}" class="btn btn-small btn-primary">Excel</a>
      </div>
    `;

    elements.projectsList.appendChild(card);
  });
}

/**
 * Change admin password
 */
async function changePassword() {
  const currentPwd = elements.currentPassword.value;
  const newPwd = elements.newPassword.value;

  if (!currentPwd || !newPwd) {
    showPasswordMessage('Заполните оба поля', 'error');
    return;
  }

  if (newPwd.length < 4) {
    showPasswordMessage('Пароль должен быть не менее 4 символов', 'error');
    return;
  }

  try {
    const response = await fetch('/api/admin/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: currentPwd,
        newPassword: newPwd
      })
    });

    const data = await response.json();

    if (data.success) {
      showPasswordMessage('Пароль успешно изменён', 'success');
      elements.currentPassword.value = '';
      elements.newPassword.value = '';
    } else {
      showPasswordMessage(data.error || 'Ошибка смены пароля', 'error');
    }
  } catch (error) {
    console.error('Password change error:', error);
    showPasswordMessage('Ошибка соединения', 'error');
  }
}

/**
 * Show password change message
 */
function showPasswordMessage(message, type) {
  elements.passwordMessage.textContent = message;
  elements.passwordMessage.style.display = 'block';
  elements.passwordMessage.style.color = type === 'error' ? 'var(--danger-color)' : 'var(--success-color)';

  setTimeout(() => {
    elements.passwordMessage.style.display = 'none';
  }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
