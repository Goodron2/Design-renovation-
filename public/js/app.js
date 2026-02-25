/**
 * Main Application
 * Renovation Cost Estimator - Main Controller
 */

// Global state
let rooms = [];
let selectedRoomIndex = -1;
let floorPlan = null;
let viewer3d = null;
let currentView = '2d';
let calculator = null;
let chat = null;
let currentProjectId = null;

// DOM Elements
const elements = {
  roomsList: document.getElementById('roomsList'),
  addRoomBtn: document.getElementById('addRoomBtn'),
  roomEditor: document.getElementById('roomEditor'),
  roomEditorTitle: document.getElementById('roomEditorTitle'),
  roomName: document.getElementById('roomName'),
  roomWidth: document.getElementById('roomWidth'),
  roomLength: document.getElementById('roomLength'),
  roomHeight: document.getElementById('roomHeight'),
  roomShape: document.getElementById('roomShape'),
  lShapeFields: document.getElementById('lShapeFields'),
  tShapeFields: document.getElementById('tShapeFields'),
  cutWidth: document.getElementById('cutWidth'),
  cutLength: document.getElementById('cutLength'),
  cutCorner: document.getElementById('cutCorner'),
  stemWidth: document.getElementById('stemWidth'),
  stemLength: document.getElementById('stemLength'),
  stemPosition: document.getElementById('stemPosition'),
  saveRoomBtn: document.getElementById('saveRoomBtn'),
  cancelRoomBtn: document.getElementById('cancelRoomBtn'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  fitViewBtn: document.getElementById('fitViewBtn'),
  currentRoomInfo: document.getElementById('currentRoomInfo'),
  noRoomSelected: document.getElementById('noRoomSelected'),
  optionsPanel: document.getElementById('optionsPanel'),
  viewerPlaceholder: document.getElementById('viewerPlaceholder'),
  totalRooms: document.getElementById('totalRooms'),
  totalArea: document.getElementById('totalArea'),
  totalCost: document.getElementById('totalCost'),
  saveProjectBtn: document.getElementById('saveProjectBtn'),
  exportExcelBtn: document.getElementById('exportExcelBtn'),
  shareProjectBtn: document.getElementById('shareProjectBtn'),
  shareModal: document.getElementById('shareModal'),
  shareLink: document.getElementById('shareLink'),
  copyLinkBtn: document.getElementById('copyLinkBtn')
};

// Options containers
const optionContainers = {
  wallOptions: document.getElementById('wallOptions'),
  floorOptions: document.getElementById('floorOptions'),
  ceilingOptions: document.getElementById('ceilingOptions'),
  electricalOptions: document.getElementById('electricalOptions'),
  plumbingOptions: document.getElementById('plumbingOptions')
};

// Subtotal elements
const subtotalElements = {
  walls: document.getElementById('subtotal_walls'),
  floors: document.getElementById('subtotal_floors'),
  ceiling: document.getElementById('subtotal_ceiling'),
  electrical: document.getElementById('subtotal_electrical'),
  plumbing: document.getElementById('subtotal_plumbing')
};

// Editing state
let editingRoomIndex = -1;

/**
 * Normalize old-format room for backward compatibility
 */
function normalizeRoom(room) {
  return RoomShapes.normalizeRoom(room);
}

/**
 * Get the currently active viewer (2D or 3D)
 */
function activeViewer() {
  return currentView === '3d' && viewer3d ? viewer3d : floorPlan;
}

/**
 * Initialize application
 */
async function init() {
  // Initialize floor plan viewer
  floorPlan = new FloorPlanViewer('floorplanViewer');
  floorPlan.onRoomSelect = (index) => {
    if (index >= 0) {
      selectRoom(index);
    } else {
      deselectRoom();
    }
  };

  // Initialize calculator and load pricing
  calculator = new RenovationCalculator();
  await calculator.loadPricing();

  // Set calculator update callback
  calculator.onUpdate((total) => {
    updateTotalDisplay();
    updateCategorySubtotals();
  });

  // Initialize chat
  chat = new RenovationChat({
    getProjectContext: () => ({
      rooms: rooms,
      totalCost: calculator.calculateTotal(),
      totalArea: calculator.calculateTotalArea()
    })
  });

  // Setup event listeners
  setupEventListeners();

  // Check if loading existing project from URL
  checkForExistingProject();

  // Update UI
  updateUI();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  elements.addRoomBtn.addEventListener('click', () => showRoomEditor());
  elements.saveRoomBtn.addEventListener('click', saveRoom);
  elements.cancelRoomBtn.addEventListener('click', hideRoomEditor);

  // Zoom controls — delegate to whichever viewer is active
  elements.zoomInBtn.addEventListener('click', () => activeViewer().zoomIn());
  elements.zoomOutBtn.addEventListener('click', () => activeViewer().zoomOut());
  elements.fitViewBtn.addEventListener('click', () => activeViewer().fitToView());

  // 2D/3D view toggle
  var toggleBtns = document.querySelectorAll('#viewToggle .view-toggle-btn');
  toggleBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var viewMode = btn.dataset.view;
      if (viewMode === currentView) return;
      switchView(viewMode);
      // Update active button state
      toggleBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.view === viewMode); });
    });
  });

  // Shape selector toggle
  elements.roomShape.addEventListener('change', () => {
    updateShapeFields();
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });

  // Project actions
  elements.saveProjectBtn.addEventListener('click', saveProject);
  elements.exportExcelBtn.addEventListener('click', exportToExcel);
  elements.shareProjectBtn.addEventListener('click', shareProject);
  elements.copyLinkBtn.addEventListener('click', copyShareLink);
}

/**
 * Switch between 2D and 3D views
 */
function switchView(viewMode) {
  currentView = viewMode;

  if (viewMode === '3d') {
    // Hide Konva canvas
    var konvaContent = document.querySelector('#floorplanViewer .konvajs-content');
    if (konvaContent) konvaContent.style.display = 'none';

    // Lazy-init Viewer3D
    if (!viewer3d) {
      viewer3d = new Viewer3D('floorplanViewer');
      viewer3d.onRoomSelect = function(index) {
        if (index >= 0) {
          selectRoom(index);
        } else {
          deselectRoom();
        }
      };
    }

    // Sync rooms and selection to 3D
    viewer3d.setRooms(rooms);
    if (selectedRoomIndex >= 0) {
      viewer3d.selectRoom(selectedRoomIndex);
    }
    viewer3d.show();
  } else {
    // Hide 3D
    if (viewer3d) {
      viewer3d.hide();
    }

    // Show Konva canvas
    var konvaContent = document.querySelector('#floorplanViewer .konvajs-content');
    if (konvaContent) konvaContent.style.display = 'block';

    // Trigger resize to fix Konva dimensions
    if (floorPlan && floorPlan.stage) {
      floorPlan._onResize();
      floorPlan.stage.batchDraw();
    }
  }
}

/**
 * Show/hide shape-specific fields in room editor
 */
function updateShapeFields() {
  const shape = elements.roomShape.value;
  elements.lShapeFields.classList.toggle('hidden', shape !== 'l_shape');
  elements.tShapeFields.classList.toggle('hidden', shape !== 't_shape');
}

/**
 * Show room editor for new or existing room
 */
function showRoomEditor(roomIndex = -1) {
  editingRoomIndex = roomIndex;

  if (roomIndex >= 0) {
    const room = normalizeRoom(rooms[roomIndex]);
    elements.roomEditorTitle.textContent = 'Редактировать комнату';
    elements.roomName.value = room.name;
    elements.roomShape.value = room.shape || 'rectangle';
    elements.roomWidth.value = room.params.width;
    elements.roomLength.value = room.params.length;
    elements.roomHeight.value = room.height;

    if (room.shape === 'l_shape') {
      elements.cutWidth.value = room.params.cutWidth || 2;
      elements.cutLength.value = room.params.cutLength || 2;
      elements.cutCorner.value = room.params.cutCorner || 'top_right';
    }
    if (room.shape === 't_shape') {
      elements.stemWidth.value = room.params.stemWidth || 2;
      elements.stemLength.value = room.params.stemLength || 3;
      elements.stemPosition.value = room.params.stemPosition || 'bottom_center';
    }
  } else {
    elements.roomEditorTitle.textContent = 'Новая комната';
    elements.roomName.value = 'Гостиная';
    elements.roomShape.value = 'rectangle';
    elements.roomWidth.value = 4;
    elements.roomLength.value = 5;
    elements.roomHeight.value = 2.7;
  }

  updateShapeFields();
  elements.roomEditor.classList.remove('hidden');
}

/**
 * Hide room editor
 */
function hideRoomEditor() {
  elements.roomEditor.classList.add('hidden');
  editingRoomIndex = -1;
}

/**
 * Save room from editor
 */
function saveRoom() {
  const shape = elements.roomShape.value;
  const params = {
    width: parseFloat(elements.roomWidth.value) || 4,
    length: parseFloat(elements.roomLength.value) || 5
  };

  if (shape === 'l_shape') {
    params.cutWidth = parseFloat(elements.cutWidth.value) || 2;
    params.cutLength = parseFloat(elements.cutLength.value) || 2;
    params.cutCorner = elements.cutCorner.value;
  }
  if (shape === 't_shape') {
    params.stemWidth = parseFloat(elements.stemWidth.value) || 2;
    params.stemLength = parseFloat(elements.stemLength.value) || 3;
    params.stemPosition = elements.stemPosition.value;
  }

  if (params.width < 1 || params.length < 1) {
    alert('Пожалуйста, введите корректные размеры комнаты');
    return;
  }

  const room = {
    name: elements.roomName.value,
    height: parseFloat(elements.roomHeight.value) || 2.7,
    shape: shape,
    params: params,
    position: { x: 0, y: 0 },
    rotation: 0,
    quantities: {}
  };

  if (editingRoomIndex >= 0) {
    // Keep existing position and quantities
    const old = rooms[editingRoomIndex];
    if (old.position) room.position = old.position;
    if (old.quantities) room.quantities = old.quantities;
    rooms[editingRoomIndex] = room;
  } else {
    rooms.push(room);
  }

  hideRoomEditor();
  calculator.setRooms(rooms);
  updateFloorPlan();
  updateUI();

  selectRoom(editingRoomIndex >= 0 ? editingRoomIndex : rooms.length - 1);
}

/**
 * Delete a room
 */
function deleteRoom(index) {
  if (confirm('Удалить эту комнату?')) {
    rooms.splice(index, 1);

    const newSelectedOptions = {};
    Object.keys(calculator.selectedOptions).forEach(key => {
      const oldIndex = parseInt(key);
      if (oldIndex < index) {
        newSelectedOptions[oldIndex] = calculator.selectedOptions[oldIndex];
      } else if (oldIndex > index) {
        newSelectedOptions[oldIndex - 1] = calculator.selectedOptions[oldIndex];
      }
    });
    calculator.setSelectedOptions(newSelectedOptions);
    calculator.setRooms(rooms);

    if (selectedRoomIndex === index) {
      selectedRoomIndex = -1;
    } else if (selectedRoomIndex > index) {
      selectedRoomIndex--;
    }

    updateFloorPlan();
    updateUI();

    if (selectedRoomIndex < 0) {
      deselectRoom();
    }
  }
}

/**
 * Select a room
 */
function selectRoom(index) {
  selectedRoomIndex = index;
  const room = normalizeRoom(rooms[index]);

  // Update floor plan selection
  floorPlan.selectRoom(index);

  // Sync 3D viewer if it exists
  if (viewer3d) {
    viewer3d.selectRoom(index);
  }

  // Update room info
  const area = RoomShapes.calculateRoomArea(room).toFixed(1);
  const p = room.params;
  elements.currentRoomInfo.textContent = room.name + ': ' + p.width + 'м \u00D7 ' + p.length + 'м \u00D7 ' + room.height + 'м (' + area + ' м\u00B2)';

  // Show options panel
  elements.noRoomSelected.classList.add('hidden');
  elements.optionsPanel.classList.remove('hidden');

  // Hide placeholder
  if (elements.viewerPlaceholder) {
    elements.viewerPlaceholder.style.display = 'none';
  }

  // Render options for this room
  calculator.renderOptions(index, optionContainers);
  updateCategorySubtotals();

  // Update rooms list UI
  updateRoomsList();
}

/**
 * Deselect room
 */
function deselectRoom() {
  selectedRoomIndex = -1;

  // Sync 3D viewer if it exists
  if (viewer3d) {
    viewer3d.deselectAll();
  }

  elements.noRoomSelected.classList.remove('hidden');
  elements.optionsPanel.classList.add('hidden');
  elements.currentRoomInfo.textContent = 'Выберите комнату';
  updateRoomsList();
}

/**
 * Update the floor plan with current rooms
 */
function updateFloorPlan() {
  if (rooms.length > 0) {
    if (elements.viewerPlaceholder) {
      elements.viewerPlaceholder.style.display = 'none';
    }
    floorPlan.setRooms(rooms);
    floorPlan.fitToView();

    // Sync 3D viewer if active
    if (viewer3d && currentView === '3d') {
      viewer3d.setRooms(rooms);
      viewer3d.fitToView();
    }
  } else {
    if (elements.viewerPlaceholder) {
      elements.viewerPlaceholder.style.display = 'block';
    }
    floorPlan.setRooms([]);
    if (viewer3d && currentView === '3d') {
      viewer3d.setRooms([]);
    }
  }
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabName + 'Tab');
  });
}

/**
 * Update entire UI
 */
function updateUI() {
  updateRoomsList();
  updateTotalDisplay();

  const hasRooms = rooms.length > 0;
  elements.exportExcelBtn.disabled = !currentProjectId;
  elements.shareProjectBtn.disabled = !hasRooms;
}

/**
 * Update rooms list display with per-room costs
 */
function updateRoomsList() {
  elements.roomsList.innerHTML = '';

  rooms.forEach((room, index) => {
    const normalized = normalizeRoom(room);
    const area = RoomShapes.calculateRoomArea(normalized).toFixed(1);
    const roomCost = calculator.calculateRoomCost(index);
    const isSelected = index === selectedRoomIndex;

    const roomEl = document.createElement('div');
    roomEl.className = 'room-item ' + (isSelected ? 'active' : '');
    roomEl.innerHTML =
      '<div class="room-info">' +
        '<span class="room-name">' + normalized.name + '</span>' +
        '<span class="room-area">' + area + ' м\u00B2</span>' +
      '</div>' +
      '<div class="room-cost">' + roomCost.toLocaleString('ru-RU') + ' \u20BD</div>' +
      '<div class="room-actions">' +
        '<button onclick="event.stopPropagation(); showRoomEditor(' + index + ')">\u270F\uFE0F</button>' +
        '<button onclick="event.stopPropagation(); deleteRoom(' + index + ')">\uD83D\uDDD1\uFE0F</button>' +
      '</div>';

    roomEl.addEventListener('click', () => selectRoom(index));
    elements.roomsList.appendChild(roomEl);
  });
}

/**
 * Update category subtotals
 */
function updateCategorySubtotals() {
  if (selectedRoomIndex < 0) return;
  const subtotals = calculator.getCategorySubtotals(selectedRoomIndex);
  Object.entries(subtotalElements).forEach(([cat, el]) => {
    if (el) {
      const val = subtotals[cat] || 0;
      el.textContent = val > 0 ? ('Итого: ' + val.toLocaleString('ru-RU') + ' \u20BD') : '';
    }
  });
}

/**
 * Update total cost display
 */
function updateTotalDisplay() {
  elements.totalRooms.textContent = rooms.length;
  elements.totalArea.textContent = calculator.calculateTotalArea().toFixed(1) + ' м\u00B2';
  elements.totalCost.textContent = calculator.calculateTotal().toLocaleString('ru-RU') + ' \u20BD';
}

/**
 * Save project to server
 */
async function saveProject() {
  if (rooms.length === 0) {
    alert('Добавьте хотя бы одну комнату');
    return;
  }

  try {
    const projectData = {
      name: 'Мой проект ремонта',
      rooms: rooms,
      selectedOptions: calculator.getSelectedOptions(),
      totalCost: calculator.calculateTotal()
    };

    let response;
    if (currentProjectId) {
      response = await fetch('/api/projects/' + currentProjectId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
    } else {
      response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
    }

    const data = await response.json();

    if (data.success) {
      if (!currentProjectId) {
        currentProjectId = data.shareId;
        chat.setProjectId(currentProjectId);
        window.history.pushState({}, '', '/project/' + currentProjectId);
      }
      elements.exportExcelBtn.disabled = false;
      alert('Проект сохранён!');
    } else {
      alert('Ошибка сохранения: ' + (data.error || 'Неизвестная ошибка'));
    }
  } catch (error) {
    console.error('Save error:', error);
    alert('Ошибка сохранения проекта');
  }
}

/**
 * Export project to Excel
 */
function exportToExcel() {
  if (!currentProjectId) {
    alert('Сначала сохраните проект');
    return;
  }
  window.location.href = '/api/export/' + currentProjectId;
}

/**
 * Share project
 */
async function shareProject() {
  if (!currentProjectId) {
    await saveProject();
    if (!currentProjectId) return;
  }
  const shareUrl = window.location.origin + '/project/' + currentProjectId;
  elements.shareLink.value = shareUrl;
  elements.shareModal.classList.remove('hidden');
}

/**
 * Copy share link
 */
function copyShareLink() {
  elements.shareLink.select();
  document.execCommand('copy');
  const originalText = elements.copyLinkBtn.textContent;
  elements.copyLinkBtn.textContent = 'Скопировано!';
  setTimeout(() => { elements.copyLinkBtn.textContent = originalText; }, 2000);
}

/**
 * Close share modal
 */
function closeShareModal() {
  elements.shareModal.classList.add('hidden');
}

/**
 * Check URL for existing project
 */
async function checkForExistingProject() {
  const pathMatch = window.location.pathname.match(/\/project\/([a-zA-Z0-9-]+)/);
  if (pathMatch) {
    await loadProject(pathMatch[1]);
  }
}

/**
 * Load existing project
 */
async function loadProject(projectId) {
  try {
    const response = await fetch('/api/projects/' + projectId);
    const data = await response.json();

    if (data.success) {
      const project = data.project;
      currentProjectId = project.share_id;

      // Normalize rooms for backward compat
      rooms = project.rooms.map(r => normalizeRoom(r));
      calculator.setRooms(rooms);
      calculator.setSelectedOptions(project.selected_options);

      chat.setProjectId(currentProjectId);
      if (data.chatHistory && data.chatHistory.length > 0) {
        chat.loadHistory(data.chatHistory);
      }

      updateFloorPlan();
      updateUI();

      if (rooms.length > 0) {
        selectRoom(0);
      }

      elements.exportExcelBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error loading project:', error);
  }
}

// Make functions available globally
window.showRoomEditor = showRoomEditor;
window.deleteRoom = deleteRoom;
window.closeShareModal = closeShareModal;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
