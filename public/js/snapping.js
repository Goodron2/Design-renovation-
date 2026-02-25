/**
 * Room Snapping & Collision Utilities
 * - Magnetic edge snapping when dragging rooms
 * - Room overlap / collision detection
 */
var RoomSnapping = (function() {
  var SNAP_THRESHOLD = 0.8; // meters — generous snap for connecting rooms

  /**
   * Get world-space edges for a room
   * Returns [{x1,y1,x2,y2,nx,ny}] where nx,ny is outward normal direction hint
   */
  function getRoomEdges(room) {
    var verts = RoomShapes.getRoomVertices(room);
    var pos = room.position || { x: 0, y: 0 };
    var edges = [];
    for (var i = 0; i < verts.length; i++) {
      var j = (i + 1) % verts.length;
      edges.push({
        x1: verts[i].x + pos.x,
        y1: verts[i].y + pos.y,
        x2: verts[j].x + pos.x,
        y2: verts[j].y + pos.y
      });
    }
    return edges;
  }

  /**
   * Check if two edges are parallel (horizontal or vertical)
   * Returns "h" (horizontal), "v" (vertical), or null
   */
  function edgeOrientation(e) {
    var dx = Math.abs(e.x2 - e.x1);
    var dy = Math.abs(e.y2 - e.y1);
    if (dy < 0.01) return "h";
    if (dx < 0.01) return "v";
    return null;
  }

  /**
   * Check if two edges overlap in their primary axis
   */
  function edgesOverlap(e1, e2, orient) {
    if (orient === "h") {
      var a1 = Math.min(e1.x1, e1.x2), a2 = Math.max(e1.x1, e1.x2);
      var b1 = Math.min(e2.x1, e2.x2), b2 = Math.max(e2.x1, e2.x2);
      return a1 < b2 && b1 < a2;
    } else {
      var c1 = Math.min(e1.y1, e1.y2), c2 = Math.max(e1.y1, e1.y2);
      var d1 = Math.min(e2.y1, e2.y2), d2 = Math.max(e2.y1, e2.y2);
      return c1 < d2 && d1 < c2;
    }
  }

  /**
   * Find the snap offset for a dragged room against other rooms.
   * Returns {dx, dy, snapped: bool, guides: [{x1,y1,x2,y2}]}
   */
  function findSnapOffset(dragRoom, allRooms, dragIndex) {
    var dragEdges = getRoomEdges(dragRoom);
    var bestDx = 0, bestDy = 0;
    var snappedX = false, snappedY = false;
    var guides = [];
    var bestDistX = SNAP_THRESHOLD + 1;
    var bestDistY = SNAP_THRESHOLD + 1;

    for (var ri = 0; ri < allRooms.length; ri++) {
      if (ri === dragIndex) continue;
      var otherEdges = getRoomEdges(allRooms[ri]);

      for (var di = 0; di < dragEdges.length; di++) {
        var de = dragEdges[di];
        var deOrient = edgeOrientation(de);
        if (!deOrient) continue;

        for (var oi = 0; oi < otherEdges.length; oi++) {
          var oe = otherEdges[oi];
          var oeOrient = edgeOrientation(oe);
          if (deOrient !== oeOrient) continue;
          if (!edgesOverlap(de, oe, deOrient)) continue;

          if (deOrient === "h") {
            var dist = Math.abs(de.y1 - oe.y1);
            if (dist < SNAP_THRESHOLD && dist < bestDistY) {
              bestDistY = dist;
              bestDy = oe.y1 - de.y1;
              snappedY = true;
              guides.push({
                x1: Math.min(de.x1, de.x2, oe.x1, oe.x2),
                y1: oe.y1,
                x2: Math.max(de.x1, de.x2, oe.x1, oe.x2),
                y2: oe.y1
              });
            }
          } else {
            var distV = Math.abs(de.x1 - oe.x1);
            if (distV < SNAP_THRESHOLD && distV < bestDistX) {
              bestDistX = distV;
              bestDx = oe.x1 - de.x1;
              snappedX = true;
              guides.push({
                x1: oe.x1,
                y1: Math.min(de.y1, de.y2, oe.y1, oe.y2),
                x2: oe.x1,
                y2: Math.max(de.y1, de.y2, oe.y1, oe.y2)
              });
            }
          }
        }
      }
    }

    return {
      dx: snappedX ? bestDx : 0,
      dy: snappedY ? bestDy : 0,
      snapped: snappedX || snappedY,
      guides: guides
    };
  }

  // --- Collision detection ---

  /**
   * Get world-space polygon vertices for a room
   */
  function getWorldVertices(room) {
    var verts = RoomShapes.getRoomVertices(room);
    var pos = room.position || { x: 0, y: 0 };
    return verts.map(function(v) {
      return { x: v.x + pos.x, y: v.y + pos.y };
    });
  }

  /**
   * Check if a point is inside a polygon (ray casting)
   */
  function pointInPolygon(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y;
      var xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Check if two line segments intersect
   */
  function segmentsIntersect(a1, a2, b1, b2) {
    var d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    var d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    var cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return false;
    var t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
    var u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
    return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
  }

  /**
   * Check if two rooms overlap (edge intersection + point-in-polygon)
   * Returns true if they overlap
   */
  function roomsOverlap(roomA, roomB) {
    var polyA = getWorldVertices(roomA);
    var polyB = getWorldVertices(roomB);

    // Edge intersection check
    for (var i = 0; i < polyA.length; i++) {
      var a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
      for (var j = 0; j < polyB.length; j++) {
        var b1 = polyB[j], b2 = polyB[(j + 1) % polyB.length];
        if (segmentsIntersect(a1, a2, b1, b2)) return true;
      }
    }

    // Point-in-polygon (check if any vertex of A is inside B or vice versa)
    for (var k = 0; k < polyA.length; k++) {
      if (pointInPolygon(polyA[k].x, polyA[k].y, polyB)) return true;
    }
    for (var m = 0; m < polyB.length; m++) {
      if (pointInPolygon(polyB[m].x, polyB[m].y, polyA)) return true;
    }

    return false;
  }

  /**
   * Check if a room collides with any other room
   */
  function checkCollision(room, allRooms, skipIndex) {
    for (var i = 0; i < allRooms.length; i++) {
      if (i === skipIndex) continue;
      if (roomsOverlap(room, allRooms[i])) return true;
    }
    return false;
  }

  return {
    findSnapOffset: findSnapOffset,
    roomsOverlap: roomsOverlap,
    checkCollision: checkCollision,
    getRoomEdges: getRoomEdges
  };
})();

window.RoomSnapping = RoomSnapping;
