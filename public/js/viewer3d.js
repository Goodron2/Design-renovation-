/**
 * 3D Room Viewer using Three.js
 * Renders rooms with walls and floor (no ceiling for top-down visibility)
 * Uses MeshBasicMaterial — no lighting dependency
 */
class Viewer3D {
  constructor(containerId, options) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = options || {};
    this.readOnly = this.options.readOnly || false;

    this.rooms = [];
    this.selectedIndex = -1;
    this.onRoomSelect = null;
    this._initialized = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = null;
    this.mouse = null;
    this._animFrameId = null;

    this._roomMeshes = [];
    this._floorMeshes = [];

    // Floor colors by material
    this.materialColors = {
      laminate: 0xC4A46C,
      floor_tile: 0xB0B0B0,
      linoleum: 0x7CB68E,
      default: 0xDED4C1
    };

    // Texture paths
    this._textureMap = {
      laminate: "/textures/laminate.jpg",
      floor_tile: "/textures/floor_tile.jpg",
      linoleum: "/textures/linoleum.jpg"
    };
    this._wallTexturePath = "/textures/wall_paint.jpg";
    this._textureCache = {};
    this._textureLoader = null;

    this._wallColor = 0xF0EBE3;
    this._selectedWireColor = 0x2563eb;
  }

  _initScene() {
    if (this._initialized) return;
    this._initialized = true;

    this._textureLoader = new THREE.TextureLoader();

    var w = this.container.clientWidth || 600;
    var h = this.container.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f2f5);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    this.camera.position.set(8, 10, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 80;

    // Grid
    var gridHelper = new THREE.GridHelper(40, 40, 0xd0d0d0, 0xe8e8e8);
    gridHelper.position.y = -0.01;
    this.scene.add(gridHelper);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.renderer.domElement.addEventListener("click", (e) => this._onClick(e));

    this._resizeHandler = () => this._onResize();
    window.addEventListener("resize", this._resizeHandler);
  }

  _getTexture(path) {
    if (this._textureCache[path]) return this._textureCache[path];
    var self = this;
    var tex = this._textureLoader.load(path, function() {
      // Re-render when texture loads
      if (self.renderer && self.scene && self.camera) {
        self.renderer.render(self.scene, self.camera);
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
    this._textureCache[path] = tex;
    return tex;
  }

  show() {
    this._initScene();

    if (!this.container.contains(this.renderer.domElement)) {
      this.container.appendChild(this.renderer.domElement);
    }
    this.renderer.domElement.style.display = "block";

    this._onResize();
    this._startRenderLoop();

    // Always rebuild when show is called
    if (this.rooms.length > 0) {
      this._buildAllRooms();
      this.fitToView();
    }
  }

  hide() {
    this._stopRenderLoop();
    if (this.renderer && this.renderer.domElement.parentNode) {
      this.renderer.domElement.style.display = "none";
    }
  }

  setRooms(rooms) {
    this.rooms = rooms.map(function(r) { return RoomShapes.normalizeRoom(r); });
    this._autoPositionRooms();
    if (this._initialized) {
      this._buildAllRooms();
    }
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
        nextX = roomRight;
      }
    }
  }

  _buildAllRooms() {
    this._clearRoomMeshes();
    for (var i = 0; i < this.rooms.length; i++) {
      this._buildRoom(i);
    }
  }

  _clearRoomMeshes() {
    for (var i = 0; i < this._roomMeshes.length; i++) {
      var rm = this._roomMeshes[i];
      if (rm.floor) this.scene.remove(rm.floor);
      if (rm.wireframe) this.scene.remove(rm.wireframe);
      if (rm.furniture) {
        for (var f = 0; f < rm.furniture.length; f++) {
          this.scene.remove(rm.furniture[f]);
        }
      }
      for (var j = 0; j < rm.walls.length; j++) {
        this.scene.remove(rm.walls[j]);
      }
    }
    this._roomMeshes = [];
    this._floorMeshes = [];
  }

  /**
   * Build floor geometry on XZ plane using triangulation
   */
  _buildFloorGeometry(worldVerts) {
    var positions = [];
    var normals = [];
    var uvs = [];

    var shape = new THREE.Shape();
    shape.moveTo(worldVerts[0].x, worldVerts[0].z);
    for (var i = 1; i < worldVerts.length; i++) {
      shape.lineTo(worldVerts[i].x, worldVerts[i].z);
    }
    shape.closePath();

    var shapePoints = shape.getPoints();
    var triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);

    for (var t = 0; t < triangles.length; t++) {
      var tri = triangles[t];
      for (var k = 0; k < 3; k++) {
        var vi = tri[k];
        var vx = shapePoints[vi].x;
        var vz = shapePoints[vi].y;
        positions.push(vx, 0, vz);
        normals.push(0, 1, 0);
        uvs.push(vx / 2, vz / 2);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    return geo;
  }

  /**
   * Build 3D room: floor + walls (no ceiling)
   */
  _buildRoom(index) {
    var room = this.rooms[index];
    var verts = RoomShapes.getRoomVertices(room);
    var height = room.height || 2.7;
    var pos = room.position || { x: 0, y: 0 };
    var isSelected = index === this.selectedIndex;

    var floorColorHex = this.materialColors.default;
    var materialKey = room._materialKey || null;
    if (materialKey && this.materialColors[materialKey]) {
      floorColorHex = this.materialColors[materialKey];
    }

    // Convert 2D shape verts to Three.js XZ world coords
    var worldVerts = [];
    for (var i = 0; i < verts.length; i++) {
      worldVerts.push({
        x: verts[i].x + pos.x,
        z: -(verts[i].y + pos.y)
      });
    }

    // --- Floor ---
    var floorGeo = this._buildFloorGeometry(worldVerts);
    var floorMat;
    var texPath = materialKey ? this._textureMap[materialKey] : null;
    if (texPath) {
      var floorTex = this._getTexture(texPath);
      floorMat = new THREE.MeshBasicMaterial({
        map: floorTex,
        side: THREE.DoubleSide
      });
    } else {
      floorMat = new THREE.MeshBasicMaterial({
        color: floorColorHex,
        side: THREE.DoubleSide
      });
    }
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0;
    floorMesh.userData.roomIndex = index;
    this.scene.add(floorMesh);

    // --- Walls (half height for visibility) ---
    var wallDisplayHeight = height * 0.5;
    var walls = [];
    for (var j = 0; j < verts.length; j++) {
      var v1 = verts[j];
      var v2 = verts[(j + 1) % verts.length];

      var x1 = v1.x + pos.x;
      var z1 = -(v1.y + pos.y);
      var x2 = v2.x + pos.x;
      var z2 = -(v2.y + pos.y);

      var dx = x2 - x1;
      var dz = z2 - z1;
      var edgeLength = Math.sqrt(dx * dx + dz * dz);
      if (edgeLength < 0.01) continue;

      var wallGeo = new THREE.PlaneGeometry(edgeLength, wallDisplayHeight);
      var wallMat = new THREE.MeshBasicMaterial({
        color: this._wallColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      var wallMesh = new THREE.Mesh(wallGeo, wallMat);

      wallMesh.position.set(
        (x1 + x2) / 2,
        wallDisplayHeight / 2,
        (z1 + z2) / 2
      );
      wallMesh.rotation.y = Math.atan2(-dz, dx);

      this.scene.add(wallMesh);
      walls.push(wallMesh);

      // Wall top edge line
      var edgePoints = [
        new THREE.Vector3(x1, wallDisplayHeight, z1),
        new THREE.Vector3(x2, wallDisplayHeight, z2)
      ];
      var edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
      var edgeMat = new THREE.LineBasicMaterial({ color: 0xb0a898 });
      var edgeLine = new THREE.Line(edgeGeo, edgeMat);
      this.scene.add(edgeLine);
      walls.push(edgeLine);

      // Wall bottom edge line
      var bottomPoints = [
        new THREE.Vector3(x1, 0.01, z1),
        new THREE.Vector3(x2, 0.01, z2)
      ];
      var bottomGeo = new THREE.BufferGeometry().setFromPoints(bottomPoints);
      var bottomLine = new THREE.Line(bottomGeo, new THREE.LineBasicMaterial({ color: 0xc0b8a8 }));
      this.scene.add(bottomLine);
      walls.push(bottomLine);
    }

    // --- Selection wireframe ---
    var wireframe = null;
    if (isSelected) {
      wireframe = this._createSelectionWireframe(verts, pos, wallDisplayHeight);
      this.scene.add(wireframe);
    }

    // --- Furniture ---
    var furnitureMeshes = [];
    if (room.furniture && room.furniture.length > 0) {
      for (var fi = 0; fi < room.furniture.length; fi++) {
        var fItem = room.furniture[fi];
        var fMesh = this._buildFurnitureMesh(fItem, pos);
        if (fMesh) {
          this.scene.add(fMesh);
          furnitureMeshes.push(fMesh);
        }
      }
    }

    this._roomMeshes.push({
      floor: floorMesh,
      walls: walls,
      wireframe: wireframe,
      furniture: furnitureMeshes
    });
    this._floorMeshes.push(floorMesh);
  }

  _buildFurnitureMesh(item, roomPos) {
    if (!item || !item.width || !item.depth) return null;
    var w = item.width;
    var d = item.depth;
    var h = item.height || 0.8;
    var geo = new THREE.BoxGeometry(w, h, d);
    var color = item.color ? new THREE.Color(item.color) : new THREE.Color(0x8B4513);
    var mat = new THREE.MeshBasicMaterial({ color: color });
    var mesh = new THREE.Mesh(geo, mat);
    var wx = (item.x || 0) + roomPos.x;
    var wz = -((item.y || 0) + roomPos.y);
    var rot = item.rotation || 0;
    mesh.position.set(wx, h / 2, wz);
    mesh.rotation.y = -rot;
    return mesh;
  }

  _createSelectionWireframe(verts, pos, height) {
    var group = new THREE.Group();
    var bottomPts = [];
    for (var i = 0; i < verts.length; i++) {
      bottomPts.push(new THREE.Vector3(verts[i].x + pos.x, 0.02, -(verts[i].y + pos.y)));
    }
    bottomPts.push(bottomPts[0].clone());

    var bottomGeo = new THREE.BufferGeometry().setFromPoints(bottomPts);
    var lineMat = new THREE.LineBasicMaterial({ color: this._selectedWireColor, linewidth: 2 });
    group.add(new THREE.Line(bottomGeo, lineMat));

    var topPts = bottomPts.map(function(p) {
      return new THREE.Vector3(p.x, height + 0.02, p.z);
    });
    var topGeo = new THREE.BufferGeometry().setFromPoints(topPts);
    group.add(new THREE.Line(topGeo, lineMat.clone()));

    for (var j = 0; j < verts.length; j++) {
      var vertPts = [
        new THREE.Vector3(verts[j].x + pos.x, 0.02, -(verts[j].y + pos.y)),
        new THREE.Vector3(verts[j].x + pos.x, height + 0.02, -(verts[j].y + pos.y))
      ];
      var vertGeo = new THREE.BufferGeometry().setFromPoints(vertPts);
      group.add(new THREE.Line(vertGeo, lineMat.clone()));
    }
    return group;
  }

  selectRoom(index) {
    this.selectedIndex = index;
    if (this._initialized) {
      this._buildAllRooms();
    }
  }

  deselectAll() {
    this.selectedIndex = -1;
    if (this._initialized) {
      this._buildAllRooms();
    }
    if (this.onRoomSelect) {
      this.onRoomSelect(-1);
    }
  }

  updateRoomMaterial(index, materialKey) {
    if (this.rooms[index]) {
      this.rooms[index]._materialKey = materialKey;
      if (this._initialized) {
        this._buildAllRooms();
      }
    }
  }

  zoomIn() {
    if (!this.camera || !this.controls) return;
    var dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, 2);
    this.controls.update();
  }

  zoomOut() {
    if (!this.camera || !this.controls) return;
    var dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, -2);
    this.controls.update();
  }

  fitToView() {
    if (!this.camera || this.rooms.length === 0) return;
    var minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;

    for (var i = 0; i < this.rooms.length; i++) {
      var room = this.rooms[i];
      var pos = room.position || { x: 0, y: 0 };
      var bb = RoomShapes.getBoundingBox(room);
      var rx1 = pos.x + bb.minX;
      var rz1 = -(pos.y + bb.maxY);
      var rx2 = pos.x + bb.maxX;
      var rz2 = -(pos.y + bb.minY);
      if (rx1 < minX) minX = rx1;
      if (rz1 < minZ) minZ = rz1;
      if (rx2 > maxX) maxX = rx2;
      if (rz2 > maxZ) maxZ = rz2;
    }

    var centerX = (minX + maxX) / 2;
    var centerZ = (minZ + maxZ) / 2;
    var sizeX = maxX - minX;
    var sizeZ = maxZ - minZ;
    var maxSize = Math.max(sizeX, sizeZ, 3);
    var distance = Math.max(maxSize * 1.8, 6);

    this.camera.position.set(
      centerX + distance * 0.6,
      distance * 0.7,
      centerZ + distance * 0.6
    );
    this.controls.target.set(centerX, 0.5, centerZ);
    this.controls.update();
  }

  _onClick(e) {
    if (!this.renderer || !this.camera) return;
    var rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    var intersects = this.raycaster.intersectObjects(this._floorMeshes);
    if (intersects.length > 0) {
      var roomIndex = intersects[0].object.userData.roomIndex;
      if (roomIndex !== undefined) {
        this.selectRoom(roomIndex);
        if (this.onRoomSelect) this.onRoomSelect(roomIndex);
      }
    } else {
      if (!this.readOnly) this.deselectAll();
    }
  }

  _startRenderLoop() {
    var self = this;
    function animate() {
      self._animFrameId = requestAnimationFrame(animate);
      if (self.controls) self.controls.update();
      if (self.renderer && self.scene && self.camera) {
        self.renderer.render(self.scene, self.camera);
      }
    }
    animate();
  }

  _stopRenderLoop() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  _onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    var w = this.container.clientWidth || 600;
    var h = this.container.clientHeight || 400;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this._stopRenderLoop();
    this._clearRoomMeshes();
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    if (this.controls) {
      this.controls.dispose();
    }
    this._initialized = false;
  }
}

window.Viewer3D = Viewer3D;
