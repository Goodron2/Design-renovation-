/**
 * Wall Drawing Tool
 * Allows users to draw custom room polygons on the Konva canvas.
 * State machine: idle -> drawing -> closing
 * Features: grid snap (0.5m), angle snap (Shift), preview line + length label,
 *           double-click or click near start to close polygon, Escape to cancel,
 *           self-intersection validation.
 */
class WallDrawTool {
  constructor(stage, layer, options) {
    this.stage = stage;
    this.layer = layer;
    this.options = options || {};
    this.scale = this.options.scale || 50; // px per meter
    this.gridSize = this.options.gridSize || 0.5; // meters
    this.snapRadius = this.options.snapRadius || 15; // px — close polygon threshold
    this.onComplete = this.options.onComplete || null;
    this.onCancel = this.options.onCancel || null;

    // State
    this.state = "idle"; // idle | drawing
    this.vertices = []; // [{x, y}] in meters (world coords)
    this.shiftHeld = false;

    // Konva drawing objects
    this._drawGroup = new Konva.Group({ name: "walldraw" });
    this._lines = null;
    this._previewLine = null;
    this._lengthLabel = null;
    this._startCircle = null;
    this._vertexCircles = [];

    this.layer.add(this._drawGroup);

    // Bound handlers
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onClick = this._handleClick.bind(this);
    this._onDblClick = this._handleDblClick.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
  }

  /**
   * Activate the drawing tool
   */
  activate() {
    this.state = "drawing";
    this.vertices = [];
    this._drawGroup.destroyChildren();
    this._vertexCircles = [];

    // Create drawing elements
    this._lines = new Konva.Line({
      points: [],
      stroke: "#2563eb",
      strokeWidth: 2,
      lineCap: "round",
      lineJoin: "round",
      listening: false
    });
    this._drawGroup.add(this._lines);

    this._previewLine = new Konva.Line({
      points: [],
      stroke: "#2563eb",
      strokeWidth: 1,
      dash: [6, 4],
      listening: false
    });
    this._drawGroup.add(this._previewLine);

    this._lengthLabel = new Konva.Text({
      text: "",
      fontSize: 12,
      fontFamily: "sans-serif",
      fill: "#1e40af",
      padding: 3,
      listening: false
    });
    this._drawGroup.add(this._lengthLabel);

    // Attach handlers
    this.stage.on("mousemove.walldraw", this._onMouseMove);
    this.stage.on("click.walldraw", this._onClick);
    this.stage.on("dblclick.walldraw", this._onDblClick);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);

    // Change cursor
    this.stage.container().style.cursor = "crosshair";

    this.layer.batchDraw();
  }

  /**
   * Deactivate the drawing tool and clean up
   */
  deactivate() {
    this.state = "idle";
    this.stage.off("mousemove.walldraw");
    this.stage.off("click.walldraw");
    this.stage.off("dblclick.walldraw");
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this._drawGroup.destroyChildren();
    this._vertexCircles = [];
    this.stage.container().style.cursor = "default";
    this.layer.batchDraw();
  }

  /**
   * Get pointer position in world meters, with grid snap
   */
  _getWorldPos(stagePos) {
    var transform = this.stage.getAbsoluteTransform().copy().invert();
    var pos = transform.point(stagePos);
    // Snap to grid
    var gridPx = this.gridSize * this.scale;
    var sx = Math.round(pos.x / gridPx) * gridPx;
    var sy = Math.round(pos.y / gridPx) * gridPx;
    return { x: sx / this.scale, y: sy / this.scale };
  }

  /**
   * Apply angle snapping (0/45/90 degrees) when Shift is held
   */
  _applyAngleSnap(prevWorld, currentWorld) {
    if (!this.shiftHeld || !prevWorld) return currentWorld;
    var dx = currentWorld.x - prevWorld.x;
    var dy = currentWorld.y - prevWorld.y;
    var angle = Math.atan2(dy, dx);
    var snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    var dist = Math.sqrt(dx * dx + dy * dy);
    return {
      x: prevWorld.x + dist * Math.cos(snapAngle),
      y: prevWorld.y + dist * Math.sin(snapAngle)
    };
  }

  /**
   * Check if two line segments intersect
   */
  _segmentsIntersect(a1, a2, b1, b2) {
    var d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    var d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    var cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return false;
    var t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
    var u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
    return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
  }

  /**
   * Check if adding a new edge would cause self-intersection
   */
  _wouldSelfIntersect(newVertex) {
    if (this.vertices.length < 2) return false;
    var last = this.vertices[this.vertices.length - 1];
    for (var i = 0; i < this.vertices.length - 2; i++) {
      if (this._segmentsIntersect(last, newVertex, this.vertices[i], this.vertices[i + 1])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if closing the polygon would cause self-intersection
   */
  _closingWouldSelfIntersect() {
    if (this.vertices.length < 3) return true;
    var last = this.vertices[this.vertices.length - 1];
    var first = this.vertices[0];
    for (var i = 1; i < this.vertices.length - 2; i++) {
      if (this._segmentsIntersect(last, first, this.vertices[i], this.vertices[i + 1])) {
        return true;
      }
    }
    return false;
  }

  _handleMouseMove(e) {
    if (this.state !== "drawing") return;
    if (this.vertices.length === 0) return;

    var pointer = this.stage.getPointerPosition();
    var world = this._getWorldPos(pointer);
    var lastVert = this.vertices[this.vertices.length - 1];
    world = this._applyAngleSnap(lastVert, world);

    // Preview line
    this._previewLine.points([
      lastVert.x * this.scale, lastVert.y * this.scale,
      world.x * this.scale, world.y * this.scale
    ]);

    // Length label
    var dx = world.x - lastVert.x;
    var dy = world.y - lastVert.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.1) {
      var mx = ((lastVert.x + world.x) / 2) * this.scale;
      var my = ((lastVert.y + world.y) / 2) * this.scale;
      this._lengthLabel.text(len.toFixed(2) + "\u043C");
      this._lengthLabel.position({ x: mx + 5, y: my - 15 });
      this._lengthLabel.visible(true);
    } else {
      this._lengthLabel.visible(false);
    }

    // Highlight start circle if near it (close polygon hint)
    if (this._startCircle && this.vertices.length >= 3) {
      var startPx = { x: this.vertices[0].x * this.scale, y: this.vertices[0].y * this.scale };
      var curPx = { x: world.x * this.scale, y: world.y * this.scale };
      var dist = Math.sqrt(Math.pow(curPx.x - startPx.x, 2) + Math.pow(curPx.y - startPx.y, 2));
      this._startCircle.fill(dist < this.snapRadius ? "#22c55e" : "#2563eb");
    }

    this.layer.batchDraw();
  }

  _handleClick(e) {
    if (this.state !== "drawing") return;
    // Ignore clicks on stage drag
    if (e.target !== this.stage && e.target.getLayer() !== this.layer) return;

    var pointer = this.stage.getPointerPosition();
    var world = this._getWorldPos(pointer);

    if (this.vertices.length > 0) {
      var lastVert = this.vertices[this.vertices.length - 1];
      world = this._applyAngleSnap(lastVert, world);
    }

    // Check if clicking near start point to close
    if (this.vertices.length >= 3) {
      var startPx = { x: this.vertices[0].x * this.scale, y: this.vertices[0].y * this.scale };
      var curPx = { x: world.x * this.scale, y: world.y * this.scale };
      var dist = Math.sqrt(Math.pow(curPx.x - startPx.x, 2) + Math.pow(curPx.y - startPx.y, 2));
      if (dist < this.snapRadius) {
        this._closePolygon();
        return;
      }
    }

    // Self-intersection check
    if (this._wouldSelfIntersect(world)) return;

    // Add vertex
    this.vertices.push(world);
    this._updateDrawing();
  }

  _handleDblClick(e) {
    if (this.state !== "drawing") return;
    if (this.vertices.length >= 3) {
      this._closePolygon();
    }
  }

  _handleKeyDown(e) {
    if (e.key === "Shift") {
      this.shiftHeld = true;
    }
    if (e.key === "Escape") {
      this.deactivate();
      if (this.onCancel) this.onCancel();
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && this.vertices.length > 0) {
      e.preventDefault();
      this.vertices.pop();
      this._updateDrawing();
    }
  }

  _handleKeyUp(e) {
    if (e.key === "Shift") {
      this.shiftHeld = false;
    }
  }

  _updateDrawing() {
    // Update committed lines
    var pts = [];
    for (var i = 0; i < this.vertices.length; i++) {
      pts.push(this.vertices[i].x * this.scale, this.vertices[i].y * this.scale);
    }
    this._lines.points(pts);

    // Clear old vertex circles
    for (var c = 0; c < this._vertexCircles.length; c++) {
      this._vertexCircles[c].destroy();
    }
    this._vertexCircles = [];

    // Draw vertex dots
    for (var v = 0; v < this.vertices.length; v++) {
      var circle = new Konva.Circle({
        x: this.vertices[v].x * this.scale,
        y: this.vertices[v].y * this.scale,
        radius: 4,
        fill: v === 0 ? "#2563eb" : "#60a5fa",
        stroke: "#fff",
        strokeWidth: 1,
        listening: false
      });
      this._drawGroup.add(circle);
      this._vertexCircles.push(circle);
      if (v === 0) this._startCircle = circle;
    }

    this.layer.batchDraw();
  }

  _closePolygon() {
    if (this.vertices.length < 3) return;
    if (this._closingWouldSelfIntersect()) return;

    // Normalize vertices: shift so min x,y = 0
    var minX = Infinity, minY = Infinity;
    for (var i = 0; i < this.vertices.length; i++) {
      if (this.vertices[i].x < minX) minX = this.vertices[i].x;
      if (this.vertices[i].y < minY) minY = this.vertices[i].y;
    }
    var normalized = this.vertices.map(function(v) {
      return { x: +(v.x - minX).toFixed(3), y: +(v.y - minY).toFixed(3) };
    });

    // Ensure counter-clockwise winding (positive area via shoelace)
    var area = 0;
    for (var j = 0; j < normalized.length; j++) {
      var k = (j + 1) % normalized.length;
      area += normalized[j].x * normalized[k].y;
      area -= normalized[k].x * normalized[j].y;
    }
    if (area < 0) {
      normalized.reverse();
    }

    var position = { x: minX, y: minY };

    this.deactivate();

    if (this.onComplete) {
      this.onComplete(normalized, position);
    }
  }
}

window.WallDrawTool = WallDrawTool;
