/**
 * 3D Room Visualization using Three.js
 * Creates interactive 3D representation of rooms
 */

class Room3DViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.roomMesh = null;
    this.currentRoom = null;

    // Default colors
    this.colors = {
      wall: '#f5f5f5',
      floor: '#8B4513',
      ceiling: '#ffffff'
    };

    // Initialize if container exists
    if (this.container) {
      this.init();
    }
  }

  /**
   * Initialize Three.js scene
   */
  init() {
    // Remove placeholder
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8f4fc);

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(8, 6, 8);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI / 2;

    // Lighting
    this.setupLighting();

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xe0e0e0);
    gridHelper.position.y = -0.01;
    this.scene.add(gridHelper);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Start animation loop
    this.animate();
  }

  /**
   * Setup scene lighting
   */
  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Main directional light
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(10, 15, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    this.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);
  }

  /**
   * Create 3D room mesh
   */
  createRoom(room) {
    this.currentRoom = room;

    // Remove existing room
    if (this.roomMesh) {
      this.scene.remove(this.roomMesh);
    }

    const { width, length, height } = room;
    this.roomMesh = new THREE.Group();

    // Materials
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: this.colors.wall,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: this.colors.floor,
      roughness: 0.9,
      metalness: 0.0
    });

    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: this.colors.ceiling,
      roughness: 0.8,
      metalness: 0.0
    });

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(width, length);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.roomMesh.add(floor);

    // Ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(width, length);
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.roomMesh.add(ceiling);

    // Back wall
    const backWallGeometry = new THREE.PlaneGeometry(width, height);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, height / 2, -length / 2);
    backWall.receiveShadow = true;
    this.roomMesh.add(backWall);

    // Front wall (with transparency for viewing)
    const frontWallGeometry = new THREE.PlaneGeometry(width, height);
    const frontWallMaterial = new THREE.MeshStandardMaterial({
      color: this.colors.wall,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      roughness: 0.8
    });
    const frontWall = new THREE.Mesh(frontWallGeometry, frontWallMaterial);
    frontWall.position.set(0, height / 2, length / 2);
    frontWall.rotation.y = Math.PI;
    this.roomMesh.add(frontWall);

    // Left wall
    const leftWallGeometry = new THREE.PlaneGeometry(length, height);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-width / 2, height / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.roomMesh.add(leftWall);

    // Right wall (with transparency)
    const rightWallGeometry = new THREE.PlaneGeometry(length, height);
    const rightWallMaterial = new THREE.MeshStandardMaterial({
      color: this.colors.wall,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      roughness: 0.8
    });
    const rightWall = new THREE.Mesh(rightWallGeometry, rightWallMaterial);
    rightWall.position.set(width / 2, height / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.roomMesh.add(rightWall);

    // Add baseboards
    this.addBaseboards(width, length, height);

    // Add to scene
    this.scene.add(this.roomMesh);

    // Center camera on room
    this.centerCamera(width, length, height);
  }

  /**
   * Add decorative baseboards to room
   */
  addBaseboards(width, length, height) {
    const baseboardMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5
    });

    const baseboardHeight = 0.1;
    const baseboardDepth = 0.02;

    // Back baseboard
    const backBaseboard = new THREE.Mesh(
      new THREE.BoxGeometry(width, baseboardHeight, baseboardDepth),
      baseboardMaterial
    );
    backBaseboard.position.set(0, baseboardHeight / 2, -length / 2 + baseboardDepth / 2);
    this.roomMesh.add(backBaseboard);

    // Left baseboard
    const leftBaseboard = new THREE.Mesh(
      new THREE.BoxGeometry(baseboardDepth, baseboardHeight, length),
      baseboardMaterial
    );
    leftBaseboard.position.set(-width / 2 + baseboardDepth / 2, baseboardHeight / 2, 0);
    this.roomMesh.add(leftBaseboard);
  }

  /**
   * Center camera to view room
   */
  centerCamera(width, length, height) {
    const maxDim = Math.max(width, length, height);
    const distance = maxDim * 1.5;

    this.camera.position.set(
      width / 2 + distance * 0.7,
      height / 2 + distance * 0.5,
      length / 2 + distance * 0.7
    );

    this.controls.target.set(0, height / 2, 0);
    this.controls.update();
  }

  /**
   * Update room colors
   */
  updateColors(wallColor, floorColor) {
    this.colors.wall = wallColor;
    this.colors.floor = floorColor;

    if (this.currentRoom) {
      this.createRoom(this.currentRoom);
    }
  }

  /**
   * Set wall color only
   */
  setWallColor(color) {
    this.colors.wall = color;
    if (this.roomMesh) {
      this.roomMesh.children.forEach(child => {
        if (child.material && child.geometry.type === 'PlaneGeometry' && child.rotation.x === 0) {
          child.material.color.setStyle(color);
        }
      });
    }
  }

  /**
   * Set floor color only
   */
  setFloorColor(color) {
    this.colors.floor = color;
    if (this.roomMesh) {
      this.roomMesh.children.forEach(child => {
        if (child.material && child.rotation.x === -Math.PI / 2) {
          child.material.color.setStyle(color);
        }
      });
    }
  }

  /**
   * Reset camera view
   */
  resetView() {
    if (this.currentRoom) {
      const { width, length, height } = this.currentRoom;
      this.centerCamera(width, length, height);
    }
  }

  /**
   * Handle window resize
   */
  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Show placeholder when no room selected
   */
  showPlaceholder() {
    if (this.roomMesh) {
      this.scene.remove(this.roomMesh);
      this.roomMesh = null;
    }
    this.currentRoom = null;

    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) {
      placeholder.style.display = 'block';
    }
  }

  /**
   * Cleanup resources
   */
  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
    }
  }
}

// Export for use in other scripts
window.Room3DViewer = Room3DViewer;
