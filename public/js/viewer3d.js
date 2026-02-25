/**
 * 3D Room Viewer using Three.js
 * Renders rooms with walls, floor, and ceiling from shapes.js vertices
 * Mirrors FloorPlanViewer public API for seamless 2D/3D toggling
 */
class Viewer3D {
  constructor(containerId, options) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = options || {};
    this.readOnly = this.options.readOnly || false;

    // State
    this.rooms = [];
    this.selectedIndex = -1;
    this.onRoomSelect = null;
    this._initialized = false;

    // Three.js objects (created lazily)
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = null;
    this.mouse = null;
    this._animFrameId = null;

    // Room meshes grouped by room index
    this._roomMeshes = []; // [{floor, ceiling, walls[], wireframe, furniture[]}]
    this._floorMeshes = []; // flat list of floor meshes for raycasting

    // Material color map (matches FloorPlanViewer)
    this.materialColors = {
      laminate: 0xC4A46C,
      floor_tile: 0xA0A0A0,
      linoleum: 0x7CB68E,
      default: 0xE8E0D0
    };

    // Texture path map
    this._textureMap = {
      laminate: "/textures/laminate.jpg",
      floor_tile: "/textures/floor_tile.jpg",
      linoleum: "/textures/linoleum.jpg"
    };
    this._wallTexturePath = "/textures/wall_paint.jpg";
    this._ceilingTexturePath = "/textures/ceiling_white.jpg";

    // Texture cache
    this._textureCache = {};
    this._textureLoader = null;

    // Wall/ceiling colors
    this._wallColor = 0xf5f0eb;
    this._ceilingColor = 0xfafafa;
    this._selectedWireColor = 0x2563eb;
  }

  /**
   * Lazy initialization of Three.js scene
   */
  _initScene() {
    if (this._initialized) return;
    this._initialized = true;

    this._textureLoader = new THREE.TextureLoader();

    var w = this.container.clientWidth;
    var h = this.container.clientHeight || 400;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfafbfc);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(10, 12, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // OrbitControls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 100;

    // Lights
    var ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    // Ground plane (subtle grid reference)
    var gridHelper = new THREE.GridHelper(50, 50, 0xe0e0e0, 0xf0f0f0);
    gridHelper.position.y = -0.01;
    this.scene.add(gridHelper);

    // Raycaster for click selection
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Click handler
    this.renderer.domElement.addEventListener("click", (e) => this._onClick(e));

    // Resize handler
    this._resizeHandler = () => this._onResize();
    window.addEventListener("resize", this._resizeHandler);
  }

  /**
   * Load or get cached texture
   */
  _getTexture(path) {
    if (this._textureCache[path]) return this._textureCache[path];
    var tex = this._textureLoader.load(path, undefined, undefined, function() {});
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this._textureCache[path] = tex;
    return tex;
  }

  /**
   * Show the 3D viewer
   */
  show() {
    this._initScene();

    if (!this.container.contains(this.renderer.domElement)) {
      this.container.appendChild(this.renderer.domElement);
    }
    this.renderer.domElement.style.display = "block";

    this._onResize();
    this._startRenderLoop();

    if (this.rooms.length > 0) {
      this._buildAllRooms();
      this.fitToView();
    }
  }

  /**
   * Hide the 3D viewer
   */
  hide() {
    this._stopRenderLoop();
    if (this.renderer && this.renderer.domElement.parentNode) {
      this.renderer.domElement.style.display = "none";
    }
  }

  /**
   * Set rooms data and rebuild 3D meshes
   */
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
      if (rm.ceiling) this.scene.remove(rm.ceiling);
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
   * Build a flat polygon geometry on the XZ plane from 2D vertices.
   * Uses ShapeUtils.triangulateShape for proper triangulation.
   * Adds UV coords: u = worldX / 2, v = worldZ / 2 (2m tile repeat).
   */
  _buildFlatGeometry(worldVerts2D) {
    var positions = [];
    var normals = [];
    var uvs = [];

    // Use THREE.Shape + ShapeUtils to triangulate
    var shape = new THREE.Shape();
    shape.moveTo(worldVerts2D[0].x, worldVerts2D[0].z);
    for (var i = 1; i < worldVerts2D.length; i++) {
      shape.lineTo(worldVerts2D[i].x, worldVerts2D[i].z);
    }
    shape.closePath();

    var shapePoints = shape.getPoints();
    var triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);

    for (var t = 0; t < triangles.length; t++) {
      var tri = triangles[t];
      for (var k = 0; k < 3; k++) {
        var vi = tri[k];
        var vx = shapePoints[vi].x;
        var vz = shapePoints[vi].y; // Shape uses x,y; we mapped z->y
        positions.push(vx, 0, vz);
        normals.push(0, 1, 0); // Explicit UP normal for floor/ceiling
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
   * Build 3D meshes for a single room.
   * Coordinate mapping: shapes (x->right, y->down) -> Three.js (x->right, y->up, z = -shapesY)
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

    // Convert 2D shape vertices to Three.js XZ world coords
    var worldVerts = [];
    for (var i = 0; i < verts.length; i++) {
      worldVerts.push({
        x: verts[i].x + pos.x,
        z: -(verts[i].y + pos.y)
      });
    }

    // --- Floor (BufferGeometry on XZ plane at y=0) ---
    var floorGeo = this._buildFlatGeometry(worldVerts);
    var floorMat;
    var texPath = materialKey ? this._textureMap[materialKey] : null;
    if (texPath) {
      var floorTex = this._getTexture(texPath);
      floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
    } else {
      floorMat = new THREE.MeshStandardMaterial({
        color: floorColorHex,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
    }
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    floorMesh.userData.roomIndex = index;
    this.scene.add(floorMesh);

    // --- Ceiling (independent BufferGeometry at y=height) ---
    var ceilingGeo = this._buildFlatGeometry(worldVerts);
    var ceilingMat = new THREE.MeshStandardMaterial({
      color: this._ceilingColor,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide
    });
    var ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceilingMesh.position.y = height;
    this.scene.add(ceilingMesh);

    // --- Walls (per edge) ---
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

      var wallGeo = new THREE.PlaneGeometry(edgeLength, height);
      var wallMat = new THREE.MeshStandardMaterial({
        color: this._wallColor,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide
      });
      var wallMesh = new THREE.Mesh(wallGeo, wallMat);

      // Position at edge midpoint
      wallMesh.position.set(
        (x1 + x2) / 2,
        height / 2,
        (z1 + z2) / 2
      );

      // Rotate to align with edge direction (fixed formula)
      wallMesh.rotation.y = Math.atan2(-dz, dx);

      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);
      walls.push(wallMesh);
    }

    // --- Selection wireframe ---
    var wireframe = null;
    if (isSelected) {
      wireframe = this._createSelectionWireframe(verts, pos, height);
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
      ceiling: ceilingMesh,
      walls: walls,
      wireframe: wireframe,
      furniture: furnitureMeshes
    });
    this._floorMeshes.push(floorMesh);
  }

  /**
   * Build a 3D box mesh for a furniture item
   */
  _buildFurnitureMesh(item, roomPos) {
    if (!item || !item.width || !item.depth) return null;
    var w = item.width;
    var d = item.depth;
    var h = item.height || 0.8;
    var geo = new THREE.BoxGeometry(w, h, d);
    var color = item.color ? new THREE.Color(item.color) : new THREE.Color(0x8B4513);
    var mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.1
    });
    var mesh = new THREE.Mesh(geo, mat);
    var wx = (item.x || 0) + roomPos.x;
    var wz = -((item.y || 0) + roomPos.y);
    var rot = item.rotation || 0;
    mesh.position.set(wx, h / 2, wz);
    mesh.rotation.y = -rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _createSelectionWireframe(verts, pos, height) {
    var group = new THREE.Group();
    var bottomPts = [];
    for (var i = 0; i < verts.length; i++) {
      bottomPts.push(new THREE.Vector3(verts[i].x + pos.x, 0.01, -(verts[i].y + pos.y)));
    }
    bottomPts.push(bottomPts[0].clone());

    var bottomGeo = new THREE.BufferGeometry().setFromPoints(bottomPts);
    var lineMat = new THREE.LineBasicMaterial({ color: this._selectedWireColor, linewidth: 2 });
    group.add(new THREE.Line(bottomGeo, lineMat));

    var topPts = bottomPts.map(function(p) {
      return new THREE.Vector3(p.x, height, p.z);
    });
    var topGeo = new THREE.BufferGeometry().setFromPoints(topPts);
    group.add(new THREE.Line(topGeo, lineMat.clone()));

    for (var j = 0; j < verts.length; j++) {
      var vertPts = [
        new THREE.Vector3(verts[j].x + pos.x, 0.01, -(verts[j].y + pos.y)),
        new THREE.Vector3(verts[j].x + pos.x, height, -(verts[j].y + pos.y))
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
    var maxHeight = 0;

    for (var i = 0; i < this.rooms.length; i++) {
      var room = this.rooms[i];
      var pos = room.position || { x: 0, y: 0 };
      var bb = RoomShapes.getBoundingBox(room);
      var h = room.height || 2.7;
      var rx1 = pos.x + bb.minX;
      var rz1 = -(pos.y + bb.maxY);
      var rx2 = pos.x + bb.maxX;
      var rz2 = -(pos.y + bb.minY);
      if (rx1 < minX) minX = rx1;
      if (rz1 < minZ) minZ = rz1;
      if (rx2 > maxX) maxX = rx2;
      if (rz2 > maxZ) maxZ = rz2;
      if (h > maxHeight) maxHeight = h;
    }

    var centerX = (minX + maxX) / 2;
    var centerZ = (minZ + maxZ) / 2;
    var sizeX = maxX - minX;
    var sizeZ = maxZ - minZ;
    var maxSize = Math.max(sizeX, sizeZ, maxHeight);
    var distance = Math.max(maxSize * 1.5, 5);

    this.camera.position.set(
      centerX + distance * 0.7,
      distance * 0.8,
      centerZ + distance * 0.7
    );
    this.controls.target.set(centerX, maxHeight / 2, centerZ);
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
    var w = this.container.clientWidth;
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
