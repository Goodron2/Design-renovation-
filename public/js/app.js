/**
 * Main Application
 * Renovation Cost Estimator - Main Controller
 */

// Global state
let rooms = [];
let selectedRoomIndex = -1;
let viewer3d = null;
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
  saveRoomBtn: document.getElementById('saveRoomBtn'),
  cancelRoomBtn: document.getElementById('cancelRoomBtn'),
  resetViewBtn: document.getElementById('resetViewBtn'),
  currentRoomInfo: document.getElementById('currentRoomInfo'),
  noRoomSelected: document.getElementById('noRoomSelected'),
  optionsPanel: document.getElementById('optionsPanel'),
  totalRooms: document.getElementById('totalRooms'),
  totalArea: document.getElementById('totalArea'),
  totalCost: document.getElementById('totalCost'),
  saveProjectBtn: document.getElementById('saveProjectBtn'),
  exportExcelBtn: document.getElementById('exportExcelBtn'),
  shareProjectBtn: document.getElementById('shareProjectBtn'),
  shareModal: document.getElementById('shareModal'),
  shareLink: document.getElementById('shareLink'),
  copyLinkBtn: document.getElementById('copyLinkBtn'),
  wallColor: document.getElementById('wallColor'),
  floorColor: document.getElementById('floorColor')
};

// Options containers
const optionContainers = {
  wallOptions: document.getElementById('wallOptions'),
  floorOptions: document.getElementById('floorOptions'),
  ceilingOptions: document.getElementById('ceilingOptions'),
  electricalOptions: document.getElementById('electricalOptions'),
  plumbingOptions: document.getElementById('plumbingOptions')
};

// Editing state
let editingRoomIndex = -1;

/**
 * Initialize application
 */
async function init() {
  // Initialize 3D viewer
  viewer3d = new Room3DViewer('viewer3d');

  // Initialize calculator and load pricing
  calculator = new RenovationCalculator();
  await calculator.loadPricing();

  // Set calculator update callback
  calculator.onUpdate((total) => {
    updateTotalDisplay();
    // Reflect the newly (de)selected works in the 3D view for that room.
    // Wrapped so a render hiccup can never block cost calculation.
    if (selectedRoomIndex >= 0 && viewer3d) {
      try { viewer3d.updateRoom(selectedRoomIndex, calculator.getRoomFinishes(selectedRoomIndex)); }
      catch (e) { console.error('3D update error:', e); }
    }
  });

  // Initialize chat
  chat = new RenovationChat({
    getProjectContext: buildChatContext
  });

  // Setup event listeners
  setupEventListeners();

  // Check if loading existing project from URL
  checkForExistingProject();

  // Update UI + initial 3D (placeholder until a room is added)
  updateUI();
  rerenderRooms(false);
}

/**
 * Finishes for every room (for the all-rooms 3D view).
 */
function getAllFinishes() {
  return rooms.map((_, i) => calculator.getRoomFinishes(i));
}

/**
 * Render every room in the 3D viewer. recenter=true refits the camera.
 */
function rerenderRooms(recenter) {
  if (!viewer3d) return;
  try {
    viewer3d.render(rooms, getAllFinishes(), selectedRoomIndex, { recenter: !!recenter });
  } catch (e) {
    console.error('3D render error:', e);
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Add room button
  elements.addRoomBtn.addEventListener('click', () => showRoomEditor());

  // Room editor buttons
  elements.saveRoomBtn.addEventListener('click', saveRoom);
  elements.cancelRoomBtn.addEventListener('click', hideRoomEditor);

  // Reset 3D view
  elements.resetViewBtn.addEventListener('click', () => viewer3d.resetView());

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });

  // Color pickers
  elements.wallColor.addEventListener('input', (e) => {
    viewer3d.setWallColor(e.target.value);
  });

  elements.floorColor.addEventListener('input', (e) => {
    viewer3d.setFloorColor(e.target.value);
  });

  // Project actions
  elements.saveProjectBtn.addEventListener('click', saveProject);
  elements.exportExcelBtn.addEventListener('click', exportToExcel);
  elements.shareProjectBtn.addEventListener('click', shareProject);
  elements.copyLinkBtn.addEventListener('click', copyShareLink);
}

/**
 * Show room editor for new or existing room
 */
function showRoomEditor(roomIndex = -1) {
  editingRoomIndex = roomIndex;

  if (roomIndex >= 0) {
    // Editing existing room
    const room = rooms[roomIndex];
    elements.roomEditorTitle.textContent = 'Редактировать комнату';
    elements.roomName.value = room.name;
    elements.roomWidth.value = room.width;
    elements.roomLength.value = room.length;
    elements.roomHeight.value = room.height;
  } else {
    // New room
    elements.roomEditorTitle.textContent = 'Новая комната';
    elements.roomName.value = 'Гостиная';
    elements.roomWidth.value = 4;
    elements.roomLength.value = 5;
    elements.roomHeight.value = 2.7;
  }

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
  const room = {
    name: elements.roomName.value,
    width: parseFloat(elements.roomWidth.value) || 4,
    length: parseFloat(elements.roomLength.value) || 5,
    height: parseFloat(elements.roomHeight.value) || 2.7
  };

  // Validate
  if (room.width < 1 || room.length < 1 || room.height < 2) {
    alert('Пожалуйста, введите корректные размеры комнаты');
    return;
  }

  if (editingRoomIndex >= 0) {
    // Update existing room
    rooms[editingRoomIndex] = room;
  } else {
    // Add new room
    rooms.push(room);
  }

  hideRoomEditor();
  calculator.setRooms(rooms);
  updateUI();

  // Re-render all rooms (a room was added or resized), refit camera, then select it
  const target = editingRoomIndex >= 0 ? editingRoomIndex : rooms.length - 1;
  selectedRoomIndex = target;
  rerenderRooms(true);
  selectRoom(target);
}

/**
 * Delete a room
 */
function deleteRoom(index) {
  if (confirm('Удалить эту комнату?')) {
    rooms.splice(index, 1);

    // Update selected options indices
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

    // Adjust selection
    if (selectedRoomIndex === index) {
      // The selected room was deleted: clear the selection
      selectedRoomIndex = -1;
      elements.noRoomSelected.classList.remove('hidden');
      elements.optionsPanel.classList.add('hidden');
      elements.currentRoomInfo.textContent = 'Выберите комнату';
      rerenderRooms(true);
    } else {
      // A different room was deleted: keep the same room selected (fixing its
      // index) and re-bind the options panel, whose click handlers captured the
      // old roomIndex.
      if (selectedRoomIndex > index) selectedRoomIndex--;
      rerenderRooms(true);
      if (selectedRoomIndex >= 0) selectRoom(selectedRoomIndex);
    }

    updateUI();
  }
}

/**
 * Select a room
 */
function selectRoom(index) {
  selectedRoomIndex = index;
  const room = rooms[index];

  // Highlight this room in the all-rooms 3D view (no full rebuild)
  if (viewer3d) viewer3d.setSelected(index);

  // Update room info
  const area = (room.width * room.length).toFixed(1);
  elements.currentRoomInfo.textContent = `${room.name}: ${room.width}м × ${room.length}м × ${room.height}м (${area} м²)`;

  // Show options panel
  elements.noRoomSelected.classList.add('hidden');
  elements.optionsPanel.classList.remove('hidden');

  // Render options for this room
  calculator.renderOptions(index, optionContainers);

  // Update rooms list UI
  updateRoomsList();
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}Tab`);
  });
}

/**
 * Update entire UI
 */
function updateUI() {
  updateRoomsList();
  updateTotalDisplay();

  // Enable/disable project actions
  const hasRooms = rooms.length > 0;
  elements.exportExcelBtn.disabled = !currentProjectId;
  elements.shareProjectBtn.disabled = !hasRooms;
}

/**
 * Update rooms list display
 */
function updateRoomsList() {
  elements.roomsList.innerHTML = '';

  rooms.forEach((room, index) => {
    const area = (room.width * room.length).toFixed(1);
    const isSelected = index === selectedRoomIndex;

    const roomEl = document.createElement('div');
    roomEl.className = `room-item ${isSelected ? 'active' : ''}`;
    roomEl.innerHTML = `
      <div class="room-info">
        <span class="room-name">${room.name}</span>
        <span class="room-area">${area} м²</span>
      </div>
      <div class="room-actions">
        <button onclick="event.stopPropagation(); showRoomEditor(${index})">✏️</button>
        <button onclick="event.stopPropagation(); deleteRoom(${index})">🗑️</button>
      </div>
    `;

    roomEl.addEventListener('click', () => selectRoom(index));
    elements.roomsList.appendChild(roomEl);
  });
}

/**
 * Build a compact project snapshot for the AI chat (kept small to limit tokens).
 */
function buildChatContext() {
  return {
    rooms: rooms.map((r, i) => ({
      name: r.name,
      size: `${r.width}x${r.length}x${r.height}м`,
      area: +(r.width * r.length).toFixed(1),
      works: calculator.getSelectedOptionNames(i)
    })),
    currentRoom: selectedRoomIndex >= 0 ? rooms[selectedRoomIndex]?.name : null,
    totalArea: +calculator.calculateTotalArea().toFixed(1),
    totalCost: calculator.calculateTotal()
  };
}

/**
 * Update total cost display
 */
function updateTotalDisplay() {
  elements.totalRooms.textContent = rooms.length;
  elements.totalArea.textContent = `${calculator.calculateTotalArea().toFixed(1)} м²`;
  elements.totalCost.textContent = `${calculator.calculateTotal().toLocaleString('ru-RU')} ₽`;
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
      // Update existing project
      response = await fetch(`/api/projects/${currentProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
    } else {
      // Create new project
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

        // Update URL without reload
        window.history.pushState({}, '', `/project/${currentProjectId}`);
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

  window.location.href = `/api/export/${currentProjectId}`;
}

/**
 * Share project (show modal with link)
 */
async function shareProject() {
  // Save first if not saved
  if (!currentProjectId) {
    await saveProject();
    if (!currentProjectId) return; // Save failed
  }

  const shareUrl = `${window.location.origin}/project/${currentProjectId}`;
  elements.shareLink.value = shareUrl;
  elements.shareModal.classList.remove('hidden');
}

/**
 * Copy share link to clipboard
 */
function copyShareLink() {
  elements.shareLink.select();
  document.execCommand('copy');

  // Show feedback
  const originalText = elements.copyLinkBtn.textContent;
  elements.copyLinkBtn.textContent = 'Скопировано!';
  setTimeout(() => {
    elements.copyLinkBtn.textContent = originalText;
  }, 2000);
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
    const projectId = pathMatch[1];
    await loadProject(projectId);
  }
}

/**
 * Load existing project
 */
async function loadProject(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}`);
    const data = await response.json();

    if (data.success) {
      const project = data.project;

      // Restore state
      currentProjectId = project.share_id;
      rooms = project.rooms;
      calculator.setRooms(rooms);
      calculator.setSelectedOptions(project.selected_options);

      // Update chat
      chat.setProjectId(currentProjectId);
      if (data.chatHistory && data.chatHistory.length > 0) {
        chat.loadHistory(data.chatHistory);
      }

      // Update UI + render all rooms
      updateUI();

      if (rooms.length > 0) {
        selectedRoomIndex = 0;
        rerenderRooms(true);
        selectRoom(0);
      } else {
        rerenderRooms(true);
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
