/**
 * 2D Floor Plan Viewer using Konva.js
 * Renders all rooms on a single canvas with drag, zoom, and selection
 * Supports: texture fill, custom rooms, edge editing, snapping, collision, furniture
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
    this.onRoomMoved = null;
    this.readOnly = this.options.readOnly || false;

    // Mode: "select" or "draw"
    this.mode = "select";
    this.wallDrawTool = null;

    // Material color map
    this.materialColors = {
      laminate: "#C4A46C",
      floor_tile: "#A0A0A0",
      linoleum: "#7CB68E",
      default: "#E8E0D0"
    };

    // Texture images cache
    this._textureImages = {};
    this._textureMap = {
      laminate: "/textures/laminate.jpg",
      floor_tile: "/textures/floor_tile.jpg",
      linoleum: "/textures/linoleum.jpg"
    };

    // Snap guide layer objects
    this._snapGuides = [];

    // Edge editing handles
    this._editHandles = [];

    this.stage = null;
    this.gridLayer = null;
    this.roomsLayer = null;
    this.guideLayer = null;
    this.editLayer = null;
    this.furnitureLayer = null;

    if (this.container) {
      this._init();
      this._preloadTextures();
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
    this.guideLayer = new Konva.Layer();
    this.editLayer = new Konva.Layer();
    this.furnitureLayer = new Konva.Layer();

    this.stage.add(this.gridLayer);
    this.stage.add(this.roomsLayer);
    this.stage.add(this.furnitureLayer);
    this.stage.add(this.guideLayer);
    this.stage.add(this.editLayer);

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
        if (this.mode === "draw") return;
        if (e.target === this.stage) {
          this.deselectAll();
        }
      });
    }

    window.addEventListener("resize", () => this._onResize());
  }

  /**
   * Preload texture images for 2D fill patterns
   */
  _preloadTextures() {
    var self = this;
    Object.keys(this._textureMap).forEach(function(key) {
      var img = new Image();
      img.onload = function() {
        self._textureImages[key] = img;
        // Re-render if rooms exist
        if (self.rooms.length > 0) self._renderAll();
      };
      img.src = self._textureMap[key];
    });
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
      if (roomRight > nextX) {
        nextX = roomRight; // No gap — rooms share walls
      }
    }
  }

  _renderAll() {
    this.roomsLayer.destroyChildren();
    this.furnitureLayer.destroyChildren();
    this.editLayer.destroyChildren();
    this.guideLayer.destroyChildren();
    this.roomGroups = [];
    this._editHandles = [];
    this._snapGuides = [];

    for (var i = 0; i < this.rooms.length; i++) {
      this._createRoomGroup(i);
    }

    // Show edge editing handles for selected custom room
    if (this.selectedIndex >= 0 && !this.readOnly) {
      var selRoom = this.rooms[this.selectedIndex];
      if (selRoom && selRoom.shape === "custom") {
        this._createEditHandles(this.selectedIndex);
      }
    }

    this.roomsLayer.batchDraw();
    this.furnitureLayer.batchDraw();
    this.editLayer.batchDraw();
  }

  _createRoomGroup(index) {
    var room = this.rooms[index];
    var s = this.scale;
    var pos = room.position || { x: 0, y: 0 };
    var isSelected = index === this.selectedIndex;
    var self = this;

    var group = new Konva.Group({
      x: pos.x * s,
      y: pos.y * s,
      draggable: !this.readOnly && this.mode === "select",
      name: "room_" + index
    });

    // Drag with snapping and collision
    if (!this.readOnly) {
      var lastValidPos = null;

      group.on("dragstart", function() {
        lastValidPos = { x: group.x(), y: group.y() };
      });

      group.on("dragmove", function() {
        var snapPx = self.gridSize * s;
        var newX = Math.round(group.x() / snapPx) * snapPx;
        var newY = Math.round(group.y() / snapPx) * snapPx;

        // Update room position temporarily for snapping calc
        var tempRoom = Object.assign({}, room, { position: { x: newX / s, y: newY / s } });

        // Snapping
        if (typeof RoomSnapping !== "undefined") {
          var snap = RoomSnapping.findSnapOffset(tempRoom, self.rooms, index);
          if (snap.snapped) {
            newX += snap.dx * s;
            newY += snap.dy * s;
            tempRoom.position = { x: newX / s, y: newY / s };
          }
          self._drawSnapGuides(snap.guides);
        }

        // Collision detection
        if (typeof RoomSnapping !== "undefined") {
          var collides = RoomSnapping.checkCollision(tempRoom, self.rooms, index);
          var poly = group.findOne("Line");
          if (poly) {
            poly.stroke(collides ? "#ef4444" : (isSelected ? "#2563eb" : "#475569"));
            poly.opacity(collides ? 0.6 : 1);
          }
          if (!collides) {
            lastValidPos = { x: newX, y: newY };
          }
        } else {
          lastValidPos = { x: newX, y: newY };
        }

        group.position({ x: newX, y: newY });
      });

      group.on("dragend", function() {
        self._clearSnapGuides();
        var snapPx = self.gridSize * s;
        var newX = Math.round(group.x() / snapPx) * snapPx;
        var newY = Math.round(group.y() / snapPx) * snapPx;

        var tempRoom = Object.assign({}, room, { position: { x: newX / s, y: newY / s } });
        if (typeof RoomSnapping !== "undefined") {
          var snap = RoomSnapping.findSnapOffset(tempRoom, self.rooms, index);
          if (snap.snapped) {
            newX += snap.dx * s;
            newY += snap.dy * s;
            tempRoom.position = { x: newX / s, y: newY / s };
          }
          var collides = RoomSnapping.checkCollision(tempRoom, self.rooms, index);
          if (collides && lastValidPos) {
            newX = lastValidPos.x;
            newY = lastValidPos.y;
          }
        }

        group.position({ x: newX, y: newY });
        room.position = { x: newX / s, y: newY / s };
        self._renderAll();
        if (self.onRoomMoved) self.onRoomMoved(index);
      });
    }

    // Room polygon
    var fillColor = this._getRoomColor(room);
    var points = RoomShapes.getKonvaPoints(room, s);
    var materialKey = room._materialKey || null;

    var polygonConfig = {
      points: points,
      fill: fillColor,
      stroke: isSelected ? "#2563eb" : "#475569",
      strokeWidth: isSelected ? 3 : 1.5,
      closed: true,
      shadowColor: "rgba(0,0,0,0.1)",
      shadowBlur: isSelected ? 8 : 3,
      shadowOffset: { x: 1, y: 1 }
    };

    // Apply texture pattern if available
    if (materialKey && this._textureImages[materialKey]) {
      polygonConfig.fillPatternImage = this._textureImages[materialKey];
      polygonConfig.fillPatternScale = { x: s / 512, y: s / 512 };
      polygonConfig.fillPatternRepeat = "repeat";
      delete polygonConfig.fill;
    }

    var polygon = new Konva.Line(polygonConfig);
    group.add(polygon);

    // Room name and area labels
    var bb = RoomShapes.getBoundingBox(room);
    var area = RoomShapes.calculateRoomArea(room);
    var centerX = (bb.minX + bb.width / 2) * s;
    var centerY = (bb.minY + bb.height / 2) * s;

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
      if (this.mode === "draw") return;
      e.cancelBubble = true;
      this.selectRoom(index);
      if (this.onRoomSelect) {
        this.onRoomSelect(index);
      }
    });

    this.roomsLayer.add(group);
    this.roomGroups[index] = group;

    // Render furniture for this room
    this._renderRoomFurniture(index);
  }

  /**
   * Render furniture items for a room
   */
  _renderRoomFurniture(index) {
    var room = this.rooms[index];
    if (!room.furniture || room.furniture.length === 0) return;
    var s = this.scale;
    var pos = room.position || { x: 0, y: 0 };
    var self = this;

    for (var fi = 0; fi < room.furniture.length; fi++) {
      (function(fIndex) {
        var item = room.furniture[fIndex];
        var fw = item.width * s;
        var fd = item.depth * s;

        var fGroup = new Konva.Group({
          x: (item.x + pos.x) * s,
          y: (item.y + pos.y) * s,
          rotation: (item.rotation || 0) * (180 / Math.PI),
          draggable: !self.readOnly && self.mode === "select"
        });

        var rect = new Konva.Rect({
          x: -fw / 2,
          y: -fd / 2,
          width: fw,
          height: fd,
          fill: item.color || "#8B4513",
          stroke: "#374151",
          strokeWidth: 1,
          cornerRadius: 2,
          opacity: 0.85
        });
        fGroup.add(rect);

        var label = new Konva.Text({
          x: -fw / 2,
          y: -6,
          width: fw,
          text: item.name || "",
          fontSize: 9,
          fontFamily: "sans-serif",
          fill: "#fff",
          align: "center",
          listening: false
        });
        fGroup.add(label);

        // Drag furniture within room
        if (!self.readOnly) {
          fGroup.on("dragend", function() {
            item.x = fGroup.x() / s - pos.x;
            item.y = fGroup.y() / s - pos.y;
          });

          // Rotate with R key when selected
          fGroup.on("click tap", function(e) {
            e.cancelBubble = true;
            self._selectedFurniture = { roomIndex: index, furnitureIndex: fIndex };
          });
        }

        self.furnitureLayer.add(fGroup);
      })(fi);
    }
  }

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
   * Create edge editing handles for a custom room
   */
  _createEditHandles(index) {
    var room = this.rooms[index];
    if (room.shape !== "custom") return;
    var verts = RoomShapes.getRoomVertices(room);
    var pos = room.position || { x: 0, y: 0 };
    var s = this.scale;
    var self = this;

    // Corner handles (drag vertex)
    for (var i = 0; i < verts.length; i++) {
      (function(vi) {
        var handle = new Konva.Circle({
          x: (verts[vi].x + pos.x) * s,
          y: (verts[vi].y + pos.y) * s,
          radius: 6,
          fill: "#2563eb",
          stroke: "#fff",
          strokeWidth: 2,
          draggable: true
        });

        handle.on("dragmove", function() {
          var snapPx = self.gridSize * s;
          var nx = Math.round(handle.x() / snapPx) * snapPx;
          var ny = Math.round(handle.y() / snapPx) * snapPx;
          handle.position({ x: nx, y: ny });
          room.params.vertices[vi] = {
            x: +((nx / s) - pos.x).toFixed(3),
            y: +((ny / s) - pos.y).toFixed(3)
          };
          self._renderAll();
        });

        self.editLayer.add(handle);
        self._editHandles.push(handle);
      })(i);
    }

    // Midpoint handles (drag edge)
    for (var j = 0; j < verts.length; j++) {
      (function(ei) {
        var v1 = verts[ei];
        var v2 = verts[(ei + 1) % verts.length];
        var mx = ((v1.x + v2.x) / 2 + pos.x) * s;
        var my = ((v1.y + v2.y) / 2 + pos.y) * s;

        // Determine if edge is horizontal or vertical
        var dx = Math.abs(v2.x - v1.x);
        var dy = Math.abs(v2.y - v1.y);
        var isHorizontal = dy < 0.01;
        var isVertical = dx < 0.01;

        if (!isHorizontal && !isVertical) return; // Only axis-aligned edges get midpoint handles

        var handle = new Konva.Rect({
          x: mx - 5,
          y: my - 5,
          width: 10,
          height: 10,
          fill: "#60a5fa",
          stroke: "#fff",
          strokeWidth: 1,
          draggable: true,
          dragBoundFunc: function(p) {
            // Constrain: horizontal edges move only vertically, vice versa
            if (isHorizontal) return { x: mx - 5, y: p.y };
            return { x: p.x, y: my - 5 };
          }
        });

        handle.on("dragmove", function() {
          var snapPx = self.gridSize * s;
          var vi1 = ei;
          var vi2 = (ei + 1) % verts.length;
          if (isHorizontal) {
            var newY = Math.round((handle.y() + 5) / snapPx) * snapPx;
            var yWorld = +((newY / s) - pos.y).toFixed(3);
            room.params.vertices[vi1].y = yWorld;
            room.params.vertices[vi2].y = yWorld;
          } else {
            var newX = Math.round((handle.x() + 5) / snapPx) * snapPx;
            var xWorld = +((newX / s) - pos.x).toFixed(3);
            room.params.vertices[vi1].x = xWorld;
            room.params.vertices[vi2].x = xWorld;
          }
          self._renderAll();
        });

        self.editLayer.add(handle);
        self._editHandles.push(handle);
      })(j);
    }

    this.editLayer.batchDraw();
  }

  /**
   * Draw snap guide lines
   */
  _drawSnapGuides(guides) {
    this._clearSnapGuides();
    var s = this.scale;
    for (var i = 0; i < guides.length; i++) {
      var g = guides[i];
      var line = new Konva.Line({
        points: [g.x1 * s, g.y1 * s, g.x2 * s, g.y2 * s],
        stroke: "#22c55e",
        strokeWidth: 1,
        dash: [4, 4],
        listening: false
      });
      this.guideLayer.add(line);
      this._snapGuides.push(line);
    }
    this.guideLayer.batchDraw();
  }

  _clearSnapGuides() {
    for (var i = 0; i < this._snapGuides.length; i++) {
      this._snapGuides[i].destroy();
    }
    this._snapGuides = [];
    this.guideLayer.batchDraw();
  }

  _getRoomColor(room) {
    if (room._materialKey && this.materialColors[room._materialKey]) {
      return this.materialColors[room._materialKey];
    }
    return this.materialColors.default;
  }

  selectRoom(index) {
    this.selectedIndex = index;
    this._renderAll();
  }

  deselectAll() {
    this.selectedIndex = -1;
    this._selectedFurniture = null;
    this._renderAll();
    if (this.onRoomSelect) {
      this.onRoomSelect(-1);
    }
  }

  updateRoomMaterial(index, materialKey) {
    if (this.rooms[index]) {
      this.rooms[index]._materialKey = materialKey;
      this._renderAll();
    }
  }

  /**
   * Enter draw mode
   */
  enterDrawMode(onComplete, onCancel) {
    this.mode = "draw";
    this.stage.draggable(false);
    // Disable room dragging
    this.roomGroups.forEach(function(g) { if (g) g.draggable(false); });

    if (typeof WallDrawTool !== "undefined") {
      this.wallDrawTool = new WallDrawTool(this.stage, this.roomsLayer, {
        scale: this.scale,
        gridSize: this.gridSize,
        onComplete: (vertices, position) => {
          this.exitDrawMode();
          if (onComplete) onComplete(vertices, position);
        },
        onCancel: () => {
          this.exitDrawMode();
          if (onCancel) onCancel();
        }
      });
      this.wallDrawTool.activate();
    }
  }

  /**
   * Exit draw mode
   */
  exitDrawMode() {
    this.mode = "select";
    if (this.wallDrawTool) {
      this.wallDrawTool.deactivate();
      this.wallDrawTool = null;
    }
    this.stage.draggable(!this.readOnly);
    this._renderAll();
  }

  /**
   * Handle furniture key events (R to rotate, Del to delete)
   */
  handleFurnitureKey(e) {
    if (!this._selectedFurniture) return false;
    var sf = this._selectedFurniture;
    var room = this.rooms[sf.roomIndex];
    if (!room || !room.furniture) return false;
    var item = room.furniture[sf.furnitureIndex];
    if (!item) return false;

    if (e.key === "r" || e.key === "R") {
      item.rotation = ((item.rotation || 0) + Math.PI / 2) % (Math.PI * 2);
      this._renderAll();
      return true;
    }
    if (e.key === "Delete") {
      room.furniture.splice(sf.furnitureIndex, 1);
      this._selectedFurniture = null;
      this._renderAll();
      return true;
    }
    return false;
  }

  /**
   * Add a furniture item to a room
   */
  addFurniture(roomIndex, furnitureData) {
    var room = this.rooms[roomIndex];
    if (!room) return;
    if (!room.furniture) room.furniture = [];
    var bb = RoomShapes.getBoundingBox(room);
    var item = Object.assign({}, furnitureData, {
      x: bb.width / 2,
      y: bb.height / 2,
      rotation: 0
    });
    room.furniture.push(item);
    this._renderAll();
  }

  zoomIn() {
    var s = this.stage.scaleX() * 1.2;
    s = Math.min(5, s);
    this.stage.scale({ x: s, y: s });
    this.stage.batchDraw();
  }

  zoomOut() {
    var s = this.stage.scaleX() / 1.2;
    s = Math.max(0.1, s);
    this.stage.scale({ x: s, y: s });
    this.stage.batchDraw();
  }

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
    if (this.wallDrawTool) this.wallDrawTool.deactivate();
    if (this.stage) {
      this.stage.destroy();
    }
  }
}

window.FloorPlanViewer = FloorPlanViewer;
