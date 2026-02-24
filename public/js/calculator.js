/**
 * Renovation Cost Calculator
 * Handles pricing options and cost calculations
 * Supports area-based and quantity-based pricing
 */

class RenovationCalculator {
  constructor() {
    this.pricingOptions = [];
    this.selectedOptions = {}; // roomIndex -> { optionKey: boolean|number }
    this.rooms = [];
    this.onUpdateCallback = null;
  }

  /**
   * Load pricing options from server
   */
  async loadPricing() {
    try {
      const response = await fetch('/api/pricing');
      const data = await response.json();

      if (data.success) {
        this.pricingOptions = data.options;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading pricing:', error);
      return false;
    }
  }

  onUpdate(callback) {
    this.onUpdateCallback = callback;
  }

  setRooms(rooms) {
    this.rooms = rooms.map(r => RoomShapes.normalizeRoom(r));
    this.rooms.forEach((room, index) => {
      if (!this.selectedOptions[index]) {
        this.selectedOptions[index] = {};
      }
    });
  }

  getOptionsByCategory(category) {
    return this.pricingOptions.filter(opt => opt.category === category);
  }

  /**
   * Toggle option selection for a room
   * For quantity-based items, pass the quantity as the value
   */
  toggleOption(roomIndex, optionKey, selected) {
    if (!this.selectedOptions[roomIndex]) {
      this.selectedOptions[roomIndex] = {};
    }
    this.selectedOptions[roomIndex][optionKey] = selected;

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.calculateTotal());
    }
  }

  /**
   * Set quantity for a quantity-based option
   */
  setQuantity(roomIndex, optionKey, quantity) {
    if (!this.selectedOptions[roomIndex]) {
      this.selectedOptions[roomIndex] = {};
    }
    // Store as number for quantity-based items
    this.selectedOptions[roomIndex][optionKey] = quantity > 0 ? quantity : false;

    // Update room quantities
    if (this.rooms[roomIndex]) {
      if (!this.rooms[roomIndex].quantities) {
        this.rooms[roomIndex].quantities = {};
      }
      this.rooms[roomIndex].quantities[optionKey] = quantity;
    }

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.calculateTotal());
    }
  }

  isOptionSelected(roomIndex, optionKey) {
    const val = this.selectedOptions[roomIndex]?.[optionKey];
    if (typeof val === 'number') return val > 0;
    return val || false;
  }

  getOptionQuantity(roomIndex, optionKey) {
    const val = this.selectedOptions[roomIndex]?.[optionKey];
    if (typeof val === 'number') return val;
    return 0;
  }

  getSelectedOptions() {
    return this.selectedOptions;
  }

  setSelectedOptions(options) {
    this.selectedOptions = options;
  }

  /**
   * Determine if an option uses quantity-based pricing
   */
  isQuantityBased(option) {
    return option.pricing_type === 'quantity' ||
      option.category === 'electrical' ||
      option.category === 'plumbing';
  }

  /**
   * Get default quantity for a quantity-based option
   */
  getDefaultQuantity(roomIndex, optionKey) {
    const room = this.rooms[roomIndex];
    if (!room) return 1;
    const floorArea = RoomShapes.calculateRoomArea(room);

    if (optionKey === 'outlets') return Math.ceil(floorArea / 4);
    if (optionKey === 'lighting') return Math.ceil(floorArea / 5);
    return 1;
  }

  /**
   * Calculate cost for a specific option in a room
   */
  calculateOptionCost(roomIndex, optionKey) {
    const room = this.rooms[roomIndex];
    if (!room) return 0;

    const option = this.pricingOptions.find(opt => opt.name_key === optionKey);
    if (!option) return 0;

    if (this.isQuantityBased(option)) {
      const qty = this.getOptionQuantity(roomIndex, optionKey);
      return Math.round(qty * option.price_per_sqm);
    }

    // Area-based calculation using shape functions
    const floorArea = RoomShapes.calculateRoomArea(room);
    const wallArea = RoomShapes.calculateWallArea(room);
    const ceilingArea = floorArea;

    let area = floorArea;
    switch (option.category) {
      case 'walls':
        area = wallArea;
        break;
      case 'floors':
        area = floorArea;
        break;
      case 'ceiling':
        area = ceilingArea;
        break;
      default:
        area = floorArea;
    }

    return Math.round(area * option.price_per_sqm);
  }

  /**
   * Calculate total cost for a room
   */
  calculateRoomCost(roomIndex) {
    const roomOptions = this.selectedOptions[roomIndex] || {};
    let total = 0;

    Object.entries(roomOptions).forEach(([optionKey, value]) => {
      if (value === true || (typeof value === 'number' && value > 0)) {
        total += this.calculateOptionCost(roomIndex, optionKey);
      }
    });

    return total;
  }

  /**
   * Get per-category subtotals for a room
   */
  getCategorySubtotals(roomIndex) {
    const roomOptions = this.selectedOptions[roomIndex] || {};
    const subtotals = {};

    Object.entries(roomOptions).forEach(([optionKey, value]) => {
      if (value === true || (typeof value === 'number' && value > 0)) {
        const option = this.pricingOptions.find(opt => opt.name_key === optionKey);
        if (option) {
          const cost = this.calculateOptionCost(roomIndex, optionKey);
          subtotals[option.category] = (subtotals[option.category] || 0) + cost;
        }
      }
    });

    return subtotals;
  }

  calculateTotal() {
    let total = 0;
    this.rooms.forEach((room, index) => {
      total += this.calculateRoomCost(index);
    });
    return total;
  }

  calculateTotalArea() {
    return this.rooms.reduce((sum, room) => sum + RoomShapes.calculateRoomArea(room), 0);
  }

  getRoomBreakdown(roomIndex) {
    const room = this.rooms[roomIndex];
    if (!room) return [];

    const roomOptions = this.selectedOptions[roomIndex] || {};
    const breakdown = [];

    Object.entries(roomOptions).forEach(([optionKey, value]) => {
      if (value === true || (typeof value === 'number' && value > 0)) {
        const option = this.pricingOptions.find(opt => opt.name_key === optionKey);
        if (option) {
          const cost = this.calculateOptionCost(roomIndex, optionKey);
          breakdown.push({
            name: option.name_ru,
            category: option.category,
            pricePerUnit: option.price_per_sqm,
            unit: option.unit,
            cost: cost,
            isQuantity: this.isQuantityBased(option),
            quantity: typeof value === 'number' ? value : null
          });
        }
      }
    });

    return breakdown;
  }

  /**
   * Render options for a room in the UI
   * Quantity-based items get stepper inputs instead of simple checkboxes
   */
  renderOptions(roomIndex, containers) {
    const categories = {
      walls: containers.wallOptions,
      floors: containers.floorOptions,
      ceiling: containers.ceilingOptions,
      electrical: containers.electricalOptions,
      plumbing: containers.plumbingOptions
    };

    Object.values(categories).forEach(container => {
      if (container) container.innerHTML = '';
    });

    const grouped = {};
    this.pricingOptions.forEach(option => {
      if (!grouped[option.category]) grouped[option.category] = [];
      grouped[option.category].push(option);
    });

    const self = this;

    Object.entries(grouped).forEach(([category, options]) => {
      const container = categories[category];
      if (!container) return;

      options.forEach(option => {
        const isQty = self.isQuantityBased(option);
        const isSelected = self.isOptionSelected(roomIndex, option.name_key);
        const qty = isQty ? self.getOptionQuantity(roomIndex, option.name_key) : 0;
        const cost = self.calculateOptionCost(roomIndex, option.name_key);

        const optionEl = document.createElement('div');
        optionEl.className = 'option-item' + (isSelected ? ' selected' : '');

        if (isQty) {
          // Quantity-based item with stepper
          optionEl.innerHTML =
            '<div class="option-info">' +
              '<span class="option-name">' + option.name_ru + '</span>' +
              '<span class="option-price">' + option.price_per_sqm + ' \u20BD/' + option.unit + '</span>' +
            '</div>' +
            '<div class="quantity-input">' +
              '<button class="qty-btn qty-minus">-</button>' +
              '<input type="number" class="qty-value" value="' + qty + '" min="0" max="100">' +
              '<button class="qty-btn qty-plus">+</button>' +
            '</div>' +
            '<span class="option-cost">' + cost.toLocaleString('ru-RU') + ' \u20BD</span>';

          const qtyInput = optionEl.querySelector('.qty-value');
          const minusBtn = optionEl.querySelector('.qty-minus');
          const plusBtn = optionEl.querySelector('.qty-plus');

          const updateQty = (newQty) => {
            newQty = Math.max(0, Math.min(100, newQty));
            qtyInput.value = newQty;
            self.setQuantity(roomIndex, option.name_key, newQty);
            optionEl.classList.toggle('selected', newQty > 0);
            const newCost = self.calculateOptionCost(roomIndex, option.name_key);
            optionEl.querySelector('.option-cost').textContent = newCost.toLocaleString('ru-RU') + ' \u20BD';
          };

          minusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateQty(parseInt(qtyInput.value) - 1);
          });

          plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (parseInt(qtyInput.value) === 0) {
              // First click: set default quantity
              updateQty(self.getDefaultQuantity(roomIndex, option.name_key));
            } else {
              updateQty(parseInt(qtyInput.value) + 1);
            }
          });

          qtyInput.addEventListener('change', () => {
            updateQty(parseInt(qtyInput.value) || 0);
          });

          qtyInput.addEventListener('click', (e) => e.stopPropagation());

        } else {
          // Area-based item with checkbox
          optionEl.innerHTML =
            '<input type="checkbox" id="opt_' + option.name_key + '" ' + (isSelected ? 'checked' : '') + '>' +
            '<div class="option-info">' +
              '<span class="option-name">' + option.name_ru + '</span>' +
              '<span class="option-price">' + option.price_per_sqm + ' \u20BD/' + option.unit + '</span>' +
            '</div>' +
            '<span class="option-cost">' + cost.toLocaleString('ru-RU') + ' \u20BD</span>';

          optionEl.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
              const checkbox = optionEl.querySelector('input[type="checkbox"]');
              checkbox.checked = !checkbox.checked;
            }
            const checkbox = optionEl.querySelector('input[type="checkbox"]');
            self.toggleOption(roomIndex, option.name_key, checkbox.checked);
            optionEl.classList.toggle('selected', checkbox.checked);
            const newCost = self.calculateOptionCost(roomIndex, option.name_key);
            optionEl.querySelector('.option-cost').textContent = newCost.toLocaleString('ru-RU') + ' \u20BD';

            // Update floor plan material color
            if (option.category === 'floors' && checkbox.checked && window.floorPlan) {
              window.floorPlan.updateRoomMaterial(roomIndex, option.name_key);
            }
          });
        }

        container.appendChild(optionEl);
      });
    });
  }

  getSummaryData() {
    const summary = {
      rooms: [],
      totalCost: this.calculateTotal(),
      totalArea: this.calculateTotalArea()
    };

    this.rooms.forEach((room, index) => {
      summary.rooms.push({
        ...room,
        index: index,
        floorArea: RoomShapes.calculateRoomArea(room),
        wallArea: RoomShapes.calculateWallArea(room),
        breakdown: this.getRoomBreakdown(index),
        roomCost: this.calculateRoomCost(index)
      });
    });

    return summary;
  }
}

window.RenovationCalculator = RenovationCalculator;
