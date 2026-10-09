/**
 * Room Shape Geometry Module (UMD)
 * Shared between client (Konva floor plan) and server (Excel export)
 * Supports: rectangle, l_shape, t_shape, custom
 */
(function(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.RoomShapes = factory();
  }
})(typeof self !== "undefined" ? self : this, function() {

  /**
   * Normalize old room format {width, length, height} to new format
   */
  function normalizeRoom(room) {
    if (room.shape) return room;
    return {
      ...room,
      shape: "rectangle",
      params: {
        width: room.width || 4,
        length: room.length || 5
      },
      position: room.position || { x: 0, y: 0 },
      rotation: room.rotation || 0,
      quantities: room.quantities || {}
    };
  }

  /**
   * Get polygon vertices for a room shape (in local coords, meters)
   * Origin at top-left corner
   * @returns {Array<{x: number, y: number}>}
   */
  function getRoomVertices(room) {
    var r = normalizeRoom(room);
    var p = r.params;

    // Custom shape: return stored vertices directly
    if (r.shape === "custom") {
      if (p.vertices && p.vertices.length >= 3) {
        return p.vertices.map(function(v) { return { x: v.x, y: v.y }; });
      }
      // Fallback to a 4x5 rectangle if no vertices
      return [{x:0,y:0}, {x:4,y:0}, {x:4,y:5}, {x:0,y:5}];
    }

    var w = p.width;
    var l = p.length;

    if (r.shape === "l_shape") {
      var cw = p.cutWidth || 1;
      var cl = p.cutLength || 1;
      var corner = p.cutCorner || "top_right";

      if (corner === "top_right") {
        return [
          {x:0,y:0}, {x:w-cw,y:0}, {x:w-cw,y:cl},
          {x:w,y:cl}, {x:w,y:l}, {x:0,y:l}
        ];
      } else if (corner === "top_left") {
        return [
          {x:cw,y:0}, {x:w,y:0}, {x:w,y:l},
          {x:0,y:l}, {x:0,y:cl}, {x:cw,y:cl}
        ];
      } else if (corner === "bottom_right") {
        return [
          {x:0,y:0}, {x:w,y:0}, {x:w,y:l-cl},
          {x:w-cw,y:l-cl}, {x:w-cw,y:l}, {x:0,y:l}
        ];
      } else { // bottom_left
        return [
          {x:0,y:0}, {x:w,y:0}, {x:w,y:l},
          {x:cw,y:l}, {x:cw,y:l-cl}, {x:0,y:l-cl}
        ];
      }
    }

    if (r.shape === "t_shape") {
      var sw = p.stemWidth || 1;
      var sl = p.stemLength || 1;
      var pos = p.stemPosition || "bottom_center";

      if (pos === "bottom_center") {
        var stemX = (w - sw) / 2;
        return [
          {x:0,y:0}, {x:w,y:0}, {x:w,y:l},
          {x:stemX+sw,y:l}, {x:stemX+sw,y:l+sl},
          {x:stemX,y:l+sl}, {x:stemX,y:l}, {x:0,y:l}
        ];
      } else if (pos === "top_center") {
        var stemX2 = (w - sw) / 2;
        return [
          {x:stemX2,y:-sl}, {x:stemX2+sw,y:-sl},
          {x:stemX2+sw,y:0}, {x:w,y:0}, {x:w,y:l},
          {x:0,y:l}, {x:0,y:0}, {x:stemX2,y:0}
        ];
      } else if (pos === "left_center") {
        var stemY = (l - sw) / 2;
        return [
          {x:0,y:0}, {x:w,y:0}, {x:w,y:l},
          {x:0,y:l}, {x:0,y:stemY+sw}, {x:-sl,y:stemY+sw},
          {x:-sl,y:stemY}, {x:0,y:stemY}
        ];
      } else { // right_center
        var stemY2 = (l - sw) / 2;
        return [
          {x:0,y:0}, {x:w,y:0}, {x:w,y:stemY2},
          {x:w+sl,y:stemY2}, {x:w+sl,y:stemY2+sw},
          {x:w,y:stemY2+sw}, {x:w,y:l}, {x:0,y:l}
        ];
      }
    }

    // Default: rectangle (4 vertices)
    return [
      {x:0,y:0}, {x:w,y:0}, {x:w,y:l}, {x:0,y:l}
    ];
  }

  /**
   * Calculate room floor area from shape params
   * Uses shoelace formula for custom shapes
   */
  function calculateRoomArea(room) {
    var r = normalizeRoom(room);
    var p = r.params;

    if (r.shape === "custom") {
      // Shoelace formula
      var verts = getRoomVertices(r);
      var area = 0;
      for (var i = 0; i < verts.length; i++) {
        var j = (i + 1) % verts.length;
        area += verts[i].x * verts[j].y;
        area -= verts[j].x * verts[i].y;
      }
      return Math.abs(area) / 2;
    }

    var w = p.width;
    var l = p.length;

    if (r.shape === "l_shape") {
      var cw = p.cutWidth || 1;
      var cl = p.cutLength || 1;
      return w * l - cw * cl;
    }

    if (r.shape === "t_shape") {
      var sw = p.stemWidth || 1;
      var sl = p.stemLength || 1;
      return w * l + sw * sl;
    }

    return w * l;
  }

  /**
   * Calculate total wall perimeter from vertices
   */
  function calculateWallPerimeter(room) {
    var verts = getRoomVertices(room);
    var perimeter = 0;
    for (var i = 0; i < verts.length; i++) {
      var next = verts[(i + 1) % verts.length];
      var dx = next.x - verts[i].x;
      var dy = next.y - verts[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }

  /**
   * Calculate total wall area (perimeter * height)
   */
  function calculateWallArea(room) {
    var r = normalizeRoom(room);
    return calculateWallPerimeter(r) * (r.height || 2.7);
  }

  /**
   * Get flat array of vertex coordinates for Konva polygon [x1,y1,x2,y2,...]
   */
  function getKonvaPoints(room, scale) {
    scale = scale || 1;
    var verts = getRoomVertices(room);
    var points = [];
    for (var i = 0; i < verts.length; i++) {
      points.push(verts[i].x * scale, verts[i].y * scale);
    }
    return points;
  }

  /**
   * Get bounding box of room shape
   */
  function getBoundingBox(room) {
    var verts = getRoomVertices(room);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < verts.length; i++) {
      if (verts[i].x < minX) minX = verts[i].x;
      if (verts[i].y < minY) minY = verts[i].y;
      if (verts[i].x > maxX) maxX = verts[i].x;
      if (verts[i].y > maxY) maxY = verts[i].y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, width: maxX - minX, height: maxY - minY };
  }

  return {
    normalizeRoom: normalizeRoom,
    getRoomVertices: getRoomVertices,
    calculateRoomArea: calculateRoomArea,
    calculateWallPerimeter: calculateWallPerimeter,
    calculateWallArea: calculateWallArea,
    getKonvaPoints: getKonvaPoints,
    getBoundingBox: getBoundingBox
  };
});
