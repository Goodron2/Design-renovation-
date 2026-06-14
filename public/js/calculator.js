/**
 * Renovation Cost Calculator
 * Handles pricing options and cost calculations
 */

class RenovationCalculator {
  constructor() {
    this.pricingOptions = [];
    this.selectedOptions = {}; // roomIndex -> { optionKey: boolean }
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

  /**
   * Set callback for when calculations update
   */
  onUpdate(callback) {
    this.onUpdateCallback = callback;
  }

  /**
   * Set rooms data
   */
  setRooms(rooms) {
    this.rooms = rooms;
    // Initialize selectedOptions for new rooms
    rooms.forEach((room, index) => {
      if (!this.selectedOptions[index]) {
        this.selectedOptions[index] = {};
      }
    });
  }

  /**
   * Get pricing options by category
   */
  getOptionsByCategory(category) {
    return this.pricingOptions.filter(opt => opt.category === category);
  }

  /**
   * Toggle option selection for a room
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
   * Check if option is selected for a room
   */
  isOptionSelected(roomIndex, optionKey) {
    return this.selectedOptions[roomIndex]?.[optionKey] || false;
  }

  /**
   * Get all selected options
   */
  getSelectedOptions() {
    return this.selectedOptions;
  }

  /**
   * Set selected options (for loading saved projects)
   */
  setSelectedOptions(options) {
    this.selectedOptions = options;
  }

  /**
   * Calculate cost for a specific option in a room
   */
  calculateOptionCost(roomIndex, optionKey) {
    const room = this.rooms[roomIndex];
    if (!room) return 0;

    const option = this.pricingOptions.find(opt => opt.name_key === optionKey);
    if (!option) return 0;

    // Calculate area based on option category
    let area = 0;
    const floorArea = room.width * room.length;
    const wallArea = 2 * room.height * (room.width + room.length);
    const ceilingArea = floorArea;

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
      case 'electrical':
      case 'plumbing':
        // For electrical and plumbing, use a base count (e.g., per room)
        area = 1;
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

    Object.entries(roomOptions).forEach(([optionKey, selected]) => {
      if (selected) {
        total += this.calculateOptionCost(roomIndex, optionKey);
      }
    });

    return total;
  }

  /**
   * Calculate total cost for all rooms
   */
  calculateTotal() {
    let total = 0;

    this.rooms.forEach((room, index) => {
      total += this.calculateRoomCost(index);
    });

    return total;
  }

  /**
   * Calculate total floor area
   */
  calculateTotalArea() {
    return this.rooms.reduce((sum, room) => sum + (room.width * room.length), 0);
  }

  /**
   * Get detailed breakdown for a room
   */
  getRoomBreakdown(roomIndex) {
    const room = this.rooms[roomIndex];
    if (!room) return [];

    const roomOptions = this.selectedOptions[roomIndex] || {};
    const breakdown = [];

    Object.entries(roomOptions).forEach(([optionKey, selected]) => {
      if (selected) {
        const option = this.pricingOptions.find(opt => opt.name_key === optionKey);
        if (option) {
          const cost = this.calculateOptionCost(roomIndex, optionKey);
          breakdown.push({
            name: option.name_ru,
            category: option.category,
            pricePerUnit: option.price_per_sqm,
            unit: option.unit,
            cost: cost
          });
        }
      }
    });

    return breakdown;
  }

  /**
   * Render options for a room in the UI
   */
  renderOptions(roomIndex, containers) {
    const categories = {
      walls: containers.wallOptions,
      floors: containers.floorOptions,
      ceiling: containers.ceilingOptions,
      electrical: containers.electricalOptions,
      plumbing: containers.plumbingOptions
    };

    // Clear containers
    Object.values(categories).forEach(container => {
      if (container) container.innerHTML = '';
    });

    // Group options by category
    const grouped = {};
    this.pricingOptions.forEach(option => {
      if (!grouped[option.category]) {
        grouped[option.category] = [];
      }
      grouped[option.category].push(option);
    });

    // Render each category
    Object.entries(grouped).forEach(([category, options]) => {
      const container = categories[category];
      if (!container) return;

      options.forEach(option => {
        const isSelected = this.isOptionSelected(roomIndex, option.name_key);
        const cost = this.calculateOptionCost(roomIndex, option.name_key);

        const optionEl = document.createElement('div');
        optionEl.className = `option-item ${isSelected ? 'selected' : ''}`;
        optionEl.innerHTML = `
          <input type="checkbox"
                 id="opt_${option.name_key}"
                 ${isSelected ? 'checked' : ''}>
          <div class="option-info">
            <span class="option-name">${option.name_ru}</span>
            <span class="option-price">${option.price_per_sqm} ₽/${option.unit}</span>
          </div>
          <span class="option-cost">${cost.toLocaleString('ru-RU')} ₽</span>
        `;

        // Handle click on entire option item
        optionEl.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            const checkbox = optionEl.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            e.target = checkbox;
          }

          const checkbox = optionEl.querySelector('input[type="checkbox"]');
          this.toggleOption(roomIndex, option.name_key, checkbox.checked);
          optionEl.classList.toggle('selected', checkbox.checked);

          // Update displayed cost
          const costSpan = optionEl.querySelector('.option-cost');
          const newCost = this.calculateOptionCost(roomIndex, option.name_key);
          costSpan.textContent = `${newCost.toLocaleString('ru-RU')} ₽`;
        });

        container.appendChild(optionEl);
      });
    });
  }

  /**
   * Resolve a room's selected options into a visual "finish profile" that the
   * 3D viewer can render. Robust to extra/renamed options: matches on the
   * option key and the Russian name within each category.
   */
  getRoomFinishes(roomIndex) {
    const sel = this.selectedOptions[roomIndex] || {};
    const selected = this.pricingOptions.filter(o => sel[o.name_key]);
    const text = (o) => (o.name_key + ' ' + (o.name_ru || '')).toLowerCase();

    // First value whose regex matches any selected option in `category`.
    const pick = (category, rules) => {
      for (const [value, re] of rules) {
        if (selected.some(o => o.category === category && re.test(text(o)))) return value;
      }
      return null;
    };
    const hasKey = (k) => selected.some(o => o.name_key === k);
    const hasText = (re) => selected.some(o => re.test(text(o)));

    const floor = pick('floors', [
      ['tile', /tile|плитк|керамогранит|porcelain/],
      ['wood', /laminate|parquet|ламинат|паркет/],
      ['linoleum', /linoleum|линолеум/],
      ['smooth', /self_leveling|наливн/]
    ]);
    const wall = pick('walls', [
      ['tile', /wall_tiles|керамическ|плитк/],
      ['plaster', /plaster|штукатурк/],
      ['wallpaper', /wallpaper|обои/],
      ['panels', /panel|панел|пвх/],
      ['paint', /paint|покраск/]
    ]);
    const ceiling = pick('ceiling', [
      ['multilevel', /multilevel|многоуровн/],
      ['stretch', /stretch|натяжн/],
      ['drywall', /drywall|гипсокартон/],
      ['paint', /paint|покраск|leveling|выравн/]
    ]);

    return {
      floor,
      wall,
      ceiling,
      molding: hasText(/molding|карниз/),
      lighting: hasText(/light|освещ/),
      outlets: hasText(/outlet|розетк|switch|выключ/),
      plumbing: {
        bathtub: hasKey('bathtub_install') || hasText(/ванн/),
        shower: hasText(/shower|душев/),
        toilet: hasText(/toilet|унитаз/) || hasKey('plumbing_fixtures'),
        sink: hasText(/sink|раковин|faucet|смесител/) || hasKey('plumbing_fixtures'),
        washer: hasText(/washer_connect|стиральн/)
      }
    };
  }

  /**
   * Names of the works selected for a room (for the AI chat context).
   */
  getSelectedOptionNames(roomIndex) {
    const sel = this.selectedOptions[roomIndex] || {};
    return this.pricingOptions.filter(o => sel[o.name_key]).map(o => o.name_ru);
  }

  /**
   * Get summary data for export
   */
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
        floorArea: room.width * room.length,
        wallArea: 2 * room.height * (room.width + room.length),
        breakdown: this.getRoomBreakdown(index),
        roomCost: this.calculateRoomCost(index)
      });
    });

    return summary;
  }
}

// Export for use in other scripts
window.RenovationCalculator = RenovationCalculator;
