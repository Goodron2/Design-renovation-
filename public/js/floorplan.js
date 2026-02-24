/**
 * 2D Floor Plan Viewer using Konva.js
 * Renders all rooms on a single canvas with drag, zoom, and selection
 */
class FloorPlanViewer {
  constructor(containerId, options) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = options || {};
    this.rooms = [];
    this.roomGroups = [];
    this.selectedIndex = -1;
    this.scale = 50; // pixels per meter
    this.gridSize = 0.5; // snap grid in meters
    this.onRoomSelect = null;
    this.readOnly = this.options.readOnly || false;

    // Material color map
    this.materialColors = {
      laminate: "#C4A46C",
      floor_tile: "#A0A0A0",
      linoleum: "#7CB68E",
      default: "#E8E0D0"
    };

    this.stage = null;
    this.gridLayer = null;
    this.roomsLayer = null;

    if (this.container) {
      this._init();
    }
  }

  _init() {
    var w = this.container.clientWidth;
    var h = this.container.clientHeight || 400;

    this.stage = new Konva.Stage({
      container: this.containerId,
      width: w,
      height: h,
      draggable: !this.readOnly
    });

    this.gridLayer = new Konva.Layer();
    this.roomsLayer = new Konva.Layer();

    this.stage.add(this.gridLayer);
    this.stage.add(this.roomsLayer);

    this._drawGrid();

    // Zoom on scroll
    if (!this.readOnly) {
      this.stage.on("wheel", (e) => {
        e.evt.preventDefault();
        var oldScale = this.stage.scaleX();
        var pointer = this.stage.getPointerPosition();
        var mousePointTo = {
          x: (pointer.x - this.stage.x()) / oldScale,
          y: (pointer.y - this.stage.y()) / oldScale,
        };
        var direction = e.evt.deltaY > 0 ? -1 : 1;
        var newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;
        newScale = Math.max(0.1, Math.min(5, newScale));

        this.stage.scale({ x: newScale, y: newScale });
        var newPos = {
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        };
        this.stage.position(newPos);
        this.stage.batchDraw();
      });

      // Click on empty space to deselect
      this.stage.on("click tap", (e) => {
        if (e.target === this.stage) {
          this.deselectAll();
        }
      });
    }

    // Handle resize
    window.addEventListener("resize", () => this._onResize());
  }

  _drawGrid() {
    this.gridLayer.destroyChildren();
    var w = 2000;
    var h = 2000;
    var step = this.gridSize * this.scale;
    var offsetX = -w / 2;
    var offsetY = -h / 2;

    for (var x = offsetX; x <= w / 2; x += step) {
      this.gridLayer.add(new Konva.Line({
        points: [x, offsetY, x, h / 2],
        stroke: "#e5e7eb",
        strokeWidth: 0.5,
        listening: false
      }));
    }
    for (var y = offsetY; y <= h / 2; y += step) {
      this.gridLayer.add(new Konva.Line({
        points: [offsetX, y, w / 2, y],
        stroke: "#e5e7eb",
        strokeWidth: 0.5,
        listening: false
      }));
    }
    this.gridLayer.batchDraw();
  }

  /**
   * Set rooms data and render all
   */
  setRooms(rooms) {
    this.rooms = rooms.map(r => RoomShapes.normalizeRoom(r));
    this._autoPositionRooms();
    this._renderAll();
  }

  /**
   * Auto-position rooms that have no explicit position
   */
  _autoPositionRooms() {
    var nextX = 0;
    for (var i = 0; i < this.rooms.length; i++) {
      var room = this.rooms[i];
      if (!room._positioned) {
        room.position = { x: nextX, y: 0 };
        room._positioned = true;
      }
      var bb = RoomShapes.getBoundingBox(room);
      var roomRight = room.position.x + bb.width;
      if (roomRight + 1 > nextX) {
        nextX = roomRight + 1; // 1m gap
      }
    }
  }

  /**
   * Render all rooms on the canvas
   */
  _renderAll() {
    this.roomsLayer.destroyChildren();
    this.roomGroups = [];

    for (var i = 0; i < this.rooms.length; i++) {
      this._createRoomGroup(i);
    }

    this.roomsLayer.batchDraw();
  }

  /**
   * Create a Konva group for a room
   */
  _createRoomGroup(index) {
    var room = this.rooms[index];
    var s = this.scale;
    var pos = room.position || { x: 0, y: 0 };
    var isSelected = index === this.selectedIndex;

    var group = new Konva.Group({
      x: pos.x * s,
      y: pos.y * s,
      draggable: !this.readOnly,
      name: "room_" + index
    });

    // Snap on drag end
    if (!this.readOnly) {
      group.on("dragend", () => {
        var snapPx = this.gridSize * s;
        var newX = Math.round(group.x() / snapPx) * snapPx;
        var newY = Math.round(group.y() / snapPx) * snapPx;
        group.position({ x: newX, y: newY });
        room.position = { x: newX / s, y: newY / s };
        this.roomsLayer.batchDraw();
      });
    }

    // Room polygon
    var fillColor = this._getRoomColor(room);
    var points = RoomShapes.getKonvaPoints(room, s);

    var polygon = new Konva.Line({
      points: points,
      fill: fillColor,
      stroke: isSelected ? "#2563eb" : "#475569",
      strokeWidth: isSelected ? 3 : 1.5,
      closed: true,
      shadowColor: "rgba(0,0,0,0.1)",
      shadowBlur: isSelected ? 8 : 3,
      shadowOffset: { x: 1, y: 1 }
    });

    group.add(polygon);

    // Room name and area labels
    var bb = RoomShapes.getBoundingBox(room);
    var area = RoomShapes.calculateRoomArea(room);
    var centerX = bb.width * s / 2;
    var centerY = bb.height * s / 2;

    var nameText = new Konva.Text({
      x: centerX,
      y: centerY - 12,
      text: room.name,
      fontSize: 14,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#1e293b",
      align: "center",
      listening: false
    });
    nameText.offsetX(nameText.width() / 2);

    var areaText = new Konva.Text({
      x: centerX,
      y: centerY + 6,
      text: area.toFixed(1) + " \u043C\u00B2",
      fontSize: 12,
      fontFamily: "sans-serif",
      fill: "#64748b",
      align: "center",
      listening: false
    });
    areaText.offsetX(areaText.width() / 2);

    group.add(nameText);
    group.add(areaText);

    // Dimension labels on edges
    this._addDimensionLabels(group, room, s);

    // Click to select
    group.on("click tap", (e) => {
      e.cancelBubble = true;
      this.selectRoom(index);
      if (this.onRoomSelect) {
        this.onRoomSelect(index);
      }
    });

    this.roomsLayer.add(group);
    this.roomGroups[index] = group;
  }

  /**
   * Add dimension labels along room edges
   */
  _addDimensionLabels(group, room, s) {
    var verts = RoomShapes.getRoomVertices(room);
    for (var i = 0; i < verts.length; i++) {
      var v1 = verts[i];
      var v2 = verts[(i + 1) % verts.length];
      var dx = v2.x - v1.x;
      var dy = v2.y - v1.y;
      var len = Math.sqrt(dx * dx + dy * dy);

      if (len < 0.5) continue;

      var mx = (v1.x + v2.x) / 2 * s;
      var my = (v1.y + v2.y) / 2 * s;

      // Offset label outward from edge
      var nx = -dy / len * 12;
      var ny = dx / len * 12;

      var dimText = new Konva.Text({
        x: mx + nx,
        y: my + ny,
        text: len.toFixed(1) + "\u043C",
        fontSize: 10,
        fontFamily: "sans-serif",
        fill: "#94a3b8",
        align: "center",
        listening: false
      });
      dimText.offsetX(dimText.width() / 2);
      dimText.offsetY(dimText.height() / 2);

      group.add(dimText);
    }
  }

  /**
   * Get fill color for a room based on selected floor material
   */
  _getRoomColor(room) {
    if (room._materialKey && this.materialColors[room._materialKey]) {
      return this.materialColors[room._materialKey];
    }
    return this.materialColors.default;
  }

  /**
   * Select a room by index
   */
  selectRoom(index) {
    this.selectedIndex = index;
    this._renderAll();
  }

  /**
   * Deselect all rooms
   */
  deselectAll() {
    this.selectedIndex = -1;
    this._renderAll();
    if (this.onRoomSelect) {
      this.onRoomSelect(-1);
    }
  }

  /**
   * Update material color for a room
   */
  updateRoomMaterial(index, materialKey) {
    if (this.rooms[index]) {
      this.rooms[index]._materialKey = materialKey;
      this._renderAll();
    }
  }

  /**
   * Zoom in
   */
  zoomIn() {
    var s = this.stage.scaleX() * 1.2;
    s = Math.min(5, s);
    this.stage.scale({ x: s, y: s });
    this.stage.batchDraw();
  }

  /**
   * Zoom out
   */
  zoomOut() {
    var s = this.stage.scaleX() / 1.2;
    s = Math.max(0.1, s);
    this.stage.scale({ x: s, y: s });
    this.stage.batchDraw();
  }

  /**
   * Fit all rooms into view
   */
  fitToView() {
    if (this.rooms.length === 0) return;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < this.rooms.length; i++) {
      var room = this.rooms[i];
      var pos = room.position || { x: 0, y: 0 };
      var bb = RoomShapes.getBoundingBox(room);
      if (pos.x + bb.minX < minX) minX = pos.x + bb.minX;
      if (pos.y + bb.minY < minY) minY = pos.y + bb.minY;
      if (pos.x + bb.maxX > maxX) maxX = pos.x + bb.maxX;
      if (pos.y + bb.maxY > maxY) maxY = pos.y + bb.maxY;
    }

    var padding = 2;
    minX -= padding; minY -= padding;
    maxX += padding; maxY += padding;

    var stageW = this.stage.width();
    var stageH = this.stage.height();
    var contentW = (maxX - minX) * this.scale;
    var contentH = (maxY - minY) * this.scale;

    var scaleX = stageW / contentW;
    var scaleY = stageH / contentH;
    var newScale = Math.min(scaleX, scaleY, 2);

    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position({
      x: (stageW - contentW * newScale) / 2 - minX * this.scale * newScale,
      y: (stageH - contentH * newScale) / 2 - minY * this.scale * newScale
    });
    this.stage.batchDraw();
  }

  _onResize() {
    if (!this.container || !this.stage) return;
    this.stage.width(this.container.clientWidth);
    this.stage.height(this.container.clientHeight || 400);
    this.stage.batchDraw();
  }

  dispose() {
    if (this.stage) {
      this.stage.destroy();
    }
  }
}

window.FloorPlanViewer = FloorPlanViewer;
