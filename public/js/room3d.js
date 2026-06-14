/**
 * 3D Room Visualization using Three.js
 *
 * Renders an interactive room that reflects the chosen renovation works:
 *  - floor / wall / ceiling finishes are drawn as procedural textures
 *    (laminate, tile, linoleum, wallpaper, plaster, panels, stretch ceiling...)
 *  - furniture is placed according to the room type (living room, kitchen,
 *    bathroom, bedroom, etc.) so an empty box becomes a recognisable room
 *  - selected electrical / plumbing works add a ceiling lamp, sockets,
 *    a bathtub, sink, toilet and so on.
 *
 * Everything is generated procedurally (canvas textures + primitives) so the
 * page needs no external 3D assets.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const PALETTE = {
  woodFurniture: 0x9c7a52,
  woodDark: 0x6f5436,
  fabric: 0x6c7a8d,
  fabricAccent: 0xb05f49,
  white: 0xf3f2ef,
  light: 0xe7e4dd,
  metal: 0xb9bdc4,
  dark: 0x24262b,
  sanitary: 0xfafafa,
  glass: 0xbcd3da,
  plant: 0x4f8456,
  pot: 0xb07a4e,
  rug: 0xc98f63
};

/** A standard box mesh with shadows. */
function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.75,
    metalness: opts.metalness || 0.05
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A cylinder mesh with shadows. */
function cyl(rTop, rBottom, h, color, seg = 20, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.6,
    metalness: opts.metalness || 0.05
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Procedural textures (drawn on a 2D canvas, used as material maps)
// ---------------------------------------------------------------------------

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function texFromCanvas(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Wood planks (laminate / parquet). Drawn as light greys, tinted by the floor colour. */
function woodTexture() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  const planks = 4, pw = s / planks;
  for (let i = 0; i < planks; i++) {
    const shade = 205 + Math.floor((Math.random() - 0.5) * 28);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(i * pw, 0, pw, s);
    // plank seam
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    ctx.fillRect(i * pw, 0, 1.5, s);
    // grain strokes
    ctx.strokeStyle = 'rgba(120,120,120,0.15)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 6; g++) {
      const x = i * pw + Math.random() * pw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 4, s / 3, x - 4, (2 * s) / 3, x + 2, s);
      ctx.stroke();
    }
    // a horizontal end-joint, offset per column
    const y = ((i % 2) ? 0.5 : 0.8) * s;
    ctx.fillStyle = 'rgba(80,80,80,0.4)';
    ctx.fillRect(i * pw, y, pw, 1.5);
  }
  return texFromCanvas(c);
}

/** Square tiles with grout (floor & wall tile). */
function tileTexture(tiles = 2, base = 224, grout = 150, lineWidth = 3) {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  const step = s / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const v = base + Math.floor((Math.random() - 0.5) * 14);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x * step, y * step, step, step);
    }
  }
  ctx.strokeStyle = `rgb(${grout},${grout},${grout})`;
  ctx.lineWidth = lineWidth;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(s, i * step); ctx.stroke();
  }
  return texFromCanvas(c);
}

/** Subtle vertical-stripe wallpaper. */
function wallpaperTexture() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(245,245,245)';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(170,170,170,0.18)';
  for (let x = 0; x < s; x += 24) ctx.fillRect(x, 0, 10, s);
  return texFromCanvas(c);
}

/** Troweled decorative plaster (soft mottled noise). */
function plasterTexture() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(238,236,232)';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * 0.12;
    const v = Math.random() > 0.5 ? 255 : 150;
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    const x = Math.random() * s, y = Math.random() * s, r = 4 + Math.random() * 18;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return texFromCanvas(c);
}

/** Vertical PVC panels with thin seams. */
function panelTexture() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(238,238,238)';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(120,120,120,0.35)';
  for (let x = 0; x < s; x += s / 4) ctx.fillRect(x, 0, 2, s);
  return texFromCanvas(c);
}

/** Light speckled linoleum. */
function linoleumTexture() {
  const s = 256, c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(222,220,214)';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(Math.random() * 90);
    ctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
  }
  return texFromCanvas(c);
}

// ---------------------------------------------------------------------------
// Furniture sets, keyed by room type
// ---------------------------------------------------------------------------

/**
 * Builders return a THREE.Group whose footprint lives in the room's local
 * coordinates: x in [-w/2, w/2], z in [-l/2, l/2], y up from the floor.
 * The camera looks at the room from +x/+y/+z, and the front (+z) and right
 * (+x) walls are see-through, so large pieces sit against the back/left walls.
 */

function livingRoom(w, l, h) {
  const g = new THREE.Group();

  // Rug
  const rug = box(Math.min(w * 0.55, 2.6), 0.02, Math.min(l * 0.4, 1.8), PALETTE.rug, { roughness: 1 });
  rug.position.set(0, 0.011, 0);
  g.add(rug);

  // Sofa against the back wall
  const sofa = new THREE.Group();
  const sw = Math.min(w * 0.6, 2.4);
  const seat = box(sw, 0.4, 0.85, PALETTE.fabric); seat.position.y = 0.3; sofa.add(seat);
  const back = box(sw, 0.55, 0.2, PALETTE.fabric); back.position.set(0, 0.55, -0.32); sofa.add(back);
  const armL = box(0.2, 0.55, 0.85, PALETTE.fabric); armL.position.set(-sw / 2 + 0.1, 0.42, 0); sofa.add(armL);
  const armR = box(0.2, 0.55, 0.85, PALETTE.fabric); armR.position.set(sw / 2 - 0.1, 0.42, 0); sofa.add(armR);
  for (let i = -1; i <= 1; i++) {
    const cushion = box(sw / 3 - 0.06, 0.16, 0.7, PALETTE.fabricAccent);
    cushion.position.set(i * (sw / 3), 0.55, 0.02); sofa.add(cushion);
  }
  sofa.position.set(0, 0, -l / 2 + 0.55);
  g.add(sofa);

  // Coffee table
  const table = new THREE.Group();
  const top = box(1.1, 0.06, 0.6, PALETTE.woodFurniture); top.position.y = 0.4; table.add(top);
  [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => {
    const leg = box(0.06, 0.4, 0.06, PALETTE.woodDark); leg.position.set(x, 0.2, z); table.add(leg);
  });
  table.position.set(0, 0, 0.1);
  g.add(table);

  // TV unit + TV on the left wall
  const unit = box(0.4, 0.45, Math.min(l * 0.5, 1.6), PALETTE.woodFurniture);
  unit.position.set(-w / 2 + 0.2, 0.225, 0);
  g.add(unit);
  const tv = box(0.05, 0.7, Math.min(l * 0.45, 1.3), PALETTE.dark, { roughness: 0.3 });
  tv.position.set(-w / 2 + 0.06, 1.3, 0);
  g.add(tv);

  g.add(plant(w / 2 - 0.4, -l / 2 + 0.4));
  return g;
}

function bedroom(w, l, h) {
  const g = new THREE.Group();
  const bw = Math.min(w * 0.55, 1.8);
  const bl = Math.min(l * 0.6, 2.0);

  const bed = new THREE.Group();
  const frame = box(bw, 0.3, bl, PALETTE.woodFurniture); frame.position.y = 0.15; bed.add(frame);
  const mattress = box(bw - 0.1, 0.22, bl - 0.1, PALETTE.white); mattress.position.y = 0.4; bed.add(mattress);
  const headboard = box(bw, 0.7, 0.12, PALETTE.fabric); headboard.position.set(0, 0.45, -bl / 2 + 0.06); bed.add(headboard);
  for (const sx of [-1, 1]) {
    const pillow = box(bw / 2 - 0.15, 0.12, 0.45, PALETTE.fabricAccent);
    pillow.position.set(sx * (bw / 4), 0.55, -bl / 2 + 0.35); bed.add(pillow);
  }
  bed.position.set(-w / 2 + bw / 2 + 0.2, 0, -l / 2 + bl / 2 + 0.2);
  g.add(bed);

  // Nightstand
  const ns = box(0.45, 0.5, 0.4, PALETTE.woodFurniture);
  ns.position.set(-w / 2 + bw + 0.45, 0.25, -l / 2 + 0.4);
  g.add(ns);

  // Wardrobe against back wall
  const wardrobe = box(Math.min(w * 0.4, 1.4), Math.min(h * 0.85, 2.2), 0.55, PALETTE.light);
  wardrobe.position.set(w / 2 - Math.min(w * 0.4, 1.4) / 2 - 0.1, Math.min(h * 0.85, 2.2) / 2, -l / 2 + 0.3);
  g.add(wardrobe);
  return g;
}

function kitchen(w, l, h) {
  const g = new THREE.Group();
  const counterH = 0.9, depth = 0.6;

  // L-shaped lower cabinets along back and left walls
  const backLen = w - 0.2;
  const lowerBack = box(backLen, counterH, depth, PALETTE.light);
  lowerBack.position.set(0, counterH / 2, -l / 2 + depth / 2);
  g.add(lowerBack);
  const ctBack = box(backLen, 0.06, depth, PALETTE.metal, { roughness: 0.4 });
  ctBack.position.set(0, counterH + 0.03, -l / 2 + depth / 2);
  g.add(ctBack);

  const sideLen = Math.min(l * 0.6, l - depth - 0.2);
  const lowerSide = box(depth, counterH, sideLen, PALETTE.light);
  lowerSide.position.set(-w / 2 + depth / 2, counterH / 2, -l / 2 + depth + sideLen / 2);
  g.add(lowerSide);
  const ctSide = box(depth, 0.06, sideLen, PALETTE.metal, { roughness: 0.4 });
  ctSide.position.set(-w / 2 + depth / 2, counterH + 0.03, -l / 2 + depth + sideLen / 2);
  g.add(ctSide);

  // Upper cabinets on the back wall
  const upper = box(backLen * 0.8, 0.6, 0.35, PALETTE.white);
  upper.position.set(0, h - 0.7, -l / 2 + 0.18);
  g.add(upper);

  // Stove + fridge
  const stove = box(0.6, 0.04, depth - 0.05, PALETTE.dark, { roughness: 0.3 });
  stove.position.set(backLen * 0.25, counterH + 0.06, -l / 2 + depth / 2);
  g.add(stove);
  const fridge = box(0.6, Math.min(h * 0.78, 1.9), 0.6, PALETTE.metal, { roughness: 0.35 });
  fridge.position.set(w / 2 - 0.4, Math.min(h * 0.78, 1.9) / 2, -l / 2 + 0.4);
  g.add(fridge);

  // Small dining table with legs
  const tx = w / 2 - 0.8, tz = l / 2 - 0.8;
  const top = box(0.9, 0.05, 0.7, PALETTE.woodFurniture); top.position.set(tx, 0.74, tz); g.add(top);
  [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].forEach(([dx, dz]) => {
    const leg = box(0.05, 0.74, 0.05, PALETTE.woodDark); leg.position.set(tx + dx, 0.37, tz + dz); g.add(leg);
  });
  return g;
}

function bathroom(w, l, h, finishes) {
  const g = new THREE.Group();
  const wantShower = finishes && finishes.plumbing && finishes.plumbing.shower;
  // Bathtub (or shower) along the back wall
  if (wantShower) {
    const tray = box(0.9, 0.1, 0.9, PALETTE.sanitary); tray.position.set(-w / 2 + 0.5, 0.05, -l / 2 + 0.5); g.add(tray);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, Math.min(h * 0.8, 1.9), 0.05),
      new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.35, roughness: 0.1 })
    );
    glass.position.set(-w / 2 + 0.5, Math.min(h * 0.8, 1.9) / 2, -l / 2 + 0.95); g.add(glass);
  } else {
    const tub = box(Math.min(w * 0.5, 1.7), 0.55, 0.75, PALETTE.sanitary, { roughness: 0.25 });
    tub.position.set(0, 0.28, -l / 2 + 0.42); g.add(tub);
    const inner = box(Math.min(w * 0.5, 1.7) - 0.16, 0.4, 0.6, 0xffffff, { roughness: 0.2 });
    inner.position.set(0, 0.4, -l / 2 + 0.42); g.add(inner);
  }

  // Sink with pedestal on the left wall
  const pedestal = cyl(0.12, 0.16, 0.7, PALETTE.sanitary); pedestal.position.set(-w / 2 + 0.3, 0.35, l / 2 - 0.6); g.add(pedestal);
  const basin = cyl(0.27, 0.22, 0.16, PALETTE.sanitary, 24); basin.position.set(-w / 2 + 0.3, 0.78, l / 2 - 0.6); g.add(basin);
  const mirror = box(0.04, 0.6, 0.5, PALETTE.glass, { roughness: 0.1, metalness: 0.3 });
  mirror.position.set(-w / 2 + 0.06, 1.4, l / 2 - 0.6); g.add(mirror);

  // Toilet
  const toiletBase = box(0.4, 0.4, 0.6, PALETTE.sanitary, { roughness: 0.25 });
  toiletBase.position.set(w / 2 - 0.35, 0.2, l / 2 - 0.45); g.add(toiletBase);
  const tank = box(0.4, 0.4, 0.18, PALETTE.sanitary, { roughness: 0.25 });
  tank.position.set(w / 2 - 0.35, 0.6, l / 2 - 0.18); g.add(tank);
  return g;
}

function office(w, l, h) {
  const g = new THREE.Group();
  // Desk against back wall
  const desk = box(Math.min(w * 0.6, 1.6), 0.05, 0.7, PALETTE.woodFurniture);
  desk.position.set(0, 0.74, -l / 2 + 0.45); g.add(desk);
  for (const sx of [-1, 1]) {
    const leg = box(0.05, 0.74, 0.6, PALETTE.woodDark);
    leg.position.set(sx * (Math.min(w * 0.6, 1.6) / 2 - 0.1), 0.37, -l / 2 + 0.45); g.add(leg);
  }
  const monitor = box(0.04, 0.4, 0.6, PALETTE.dark, { roughness: 0.3 });
  monitor.position.set(0, 1.15, -l / 2 + 0.25); g.add(monitor);
  // Chair
  const seat = box(0.45, 0.05, 0.45, PALETTE.dark); seat.position.set(0, 0.45, -l / 2 + 0.95); g.add(seat);
  const chairBack = box(0.45, 0.5, 0.05, PALETTE.dark); chairBack.position.set(0, 0.7, -l / 2 + 1.15); g.add(chairBack);
  // Bookshelf on the left wall
  const shelf = box(0.35, Math.min(h * 0.8, 2.0), Math.min(l * 0.5, 1.4), PALETTE.woodFurniture);
  shelf.position.set(-w / 2 + 0.2, Math.min(h * 0.8, 2.0) / 2, 0); g.add(shelf);
  g.add(plant(w / 2 - 0.4, -l / 2 + 0.4));
  return g;
}

function children(w, l, h) {
  const g = new THREE.Group();
  const bw = Math.min(w * 0.45, 1.2), bl = Math.min(l * 0.55, 1.8);
  const frame = box(bw, 0.35, bl, PALETTE.fabricAccent); frame.position.set(-w / 2 + bw / 2 + 0.2, 0.18, -l / 2 + bl / 2 + 0.2); g.add(frame);
  const mattress = box(bw - 0.1, 0.18, bl - 0.1, PALETTE.white); mattress.position.set(-w / 2 + bw / 2 + 0.2, 0.42, -l / 2 + bl / 2 + 0.2); g.add(mattress);
  // Small desk
  const desk = box(0.9, 0.05, 0.5, PALETTE.woodFurniture); desk.position.set(w / 2 - 0.7, 0.6, -l / 2 + 0.4); g.add(desk);
  // Toy chest
  const chest = box(0.6, 0.4, 0.4, PALETTE.plant); chest.position.set(w / 2 - 0.5, 0.2, l / 2 - 0.5); g.add(chest);
  const rug = box(Math.min(w * 0.4, 1.4), 0.02, Math.min(l * 0.4, 1.4), 0x86b2c4, { roughness: 1 });
  rug.position.set(0.2, 0.011, 0.2); g.add(rug);
  return g;
}

function hallway(w, l, h) {
  const g = new THREE.Group();
  // Tall wardrobe / shoe cabinet on left wall
  const wardrobe = box(0.5, Math.min(h * 0.85, 2.2), Math.min(l * 0.5, 1.4), PALETTE.light);
  wardrobe.position.set(-w / 2 + 0.3, Math.min(h * 0.85, 2.2) / 2, -l / 2 + Math.min(l * 0.5, 1.4) / 2 + 0.2); g.add(wardrobe);
  // Bench
  const bench = box(Math.min(w * 0.5, 1.0), 0.45, 0.4, PALETTE.woodFurniture);
  bench.position.set(0, 0.22, -l / 2 + 0.3); g.add(bench);
  // Mirror
  const mirror = box(0.04, 1.4, 0.5, PALETTE.glass, { roughness: 0.1, metalness: 0.3 });
  mirror.position.set(-w / 2 + 0.06, 1.2, l / 2 - 0.6); g.add(mirror);
  return g;
}

/** A potted plant accent, placed at (x, z). */
function plant(x, z) {
  const g = new THREE.Group();
  const pot = cyl(0.16, 0.12, 0.3, PALETTE.pot); pot.position.y = 0.15; g.add(pot);
  const foliage = cyl(0, 0.32, 0.7, PALETTE.plant, 8); foliage.position.y = 0.65; g.add(foliage);
  g.position.set(x, 0, z);
  return g;
}

/** Pick the furniture builder for a room name (Russian, free text). */
function furnitureFor(name, w, l, h, finishes) {
  const n = (name || '').toLowerCase();
  if (n.includes('кухн')) return kitchen(w, l, h);
  if (n.includes('ванн') || n.includes('санузел') || n.includes('туалет')) return bathroom(w, l, h, finishes);
  if (n.includes('спальн')) return bedroom(w, l, h);
  if (n.includes('детск')) return children(w, l, h);
  if (n.includes('кабинет') || n.includes('офис')) return office(w, l, h);
  if (n.includes('коридор') || n.includes('прихож') || n.includes('холл')) return hallway(w, l, h);
  return livingRoom(w, l, h); // гостиная and default
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

class Room3DViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.roomMesh = null;
    this.currentRoom = null;
    this.finishes = {};
    this._texCache = {};

    // Default colours (the colour pickers tint paint/wallpaper walls & wood floors)
    this.colors = {
      wall: '#f5f5f5',
      floor: '#8B4513',
      ceiling: '#ffffff'
    };

    if (this.container) {
      this.init();
    }
  }

  init() {
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef3f7);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    this.camera.position.set(8, 6, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 25;
    this.controls.maxPolarAngle = Math.PI / 2;

    this.setupLighting();

    const gridHelper = new THREE.GridHelper(24, 24, 0xcccccc, 0xe4e4e4);
    gridHelper.position.y = -0.02;
    this.scene.add(gridHelper);

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.75);
    mainLight.position.set(10, 16, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 60;
    mainLight.shadow.camera.left = -18;
    mainLight.shadow.camera.right = 18;
    mainLight.shadow.camera.top = 18;
    mainLight.shadow.camera.bottom = -18;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-6, 6, -6);
    this.scene.add(fillLight);
  }

  /** Cached procedural texture by finish key. */
  getTexture(key) {
    if (this._texCache[key]) return this._texCache[key];
    let t;
    switch (key) {
      case 'wood': t = woodTexture(); break;
      case 'floorTile': t = tileTexture(2, 200, 90, 6); break;
      case 'wallTile': t = tileTexture(4, 228, 140); break;
      case 'linoleum': t = linoleumTexture(); break;
      case 'wallpaper': t = wallpaperTexture(); break;
      case 'plaster': t = plasterTexture(); break;
      case 'panels': t = panelTexture(); break;
      default: t = null;
    }
    this._texCache[key] = t;
    return t;
  }

  /**
   * A per-surface clone of a cached texture with its own repeat. Clones share
   * the source canvas image but have independent tiling, so different walls do
   * not fight over a single shared repeat value.
   */
  mappedTexture(key, repeatX, repeatY) {
    const base = this.getTexture(key);
    if (!base) return null;
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
    t.needsUpdate = true;
    return t;
  }

  /** Material for the floor based on the selected finish. */
  floorMaterial(width, length) {
    const f = this.finishes.floor;
    let map = null, color = '#cfcfcf', tintable = false;
    if (f === 'wood') { map = this.mappedTexture('wood', width / 1.2, length / 1.2); color = this.colors.floor; tintable = true; }
    else if (f === 'tile') { map = this.mappedTexture('floorTile', width / 0.8, length / 0.8); color = '#ffffff'; }
    else if (f === 'linoleum') { map = this.mappedTexture('linoleum', width / 2, length / 2); color = '#ffffff'; }
    else if (f === 'smooth') { color = '#d9d7d2'; }
    else { map = this.mappedTexture('wood', width / 1.2, length / 1.2); color = this.colors.floor; tintable = true; } // sensible default
    const mat = new THREE.MeshStandardMaterial({ color, map, roughness: f === 'tile' ? 0.4 : 0.85, metalness: 0 });
    return { mat, tintable };
  }

  /** Material for an opaque wall based on the selected finish. */
  wallMaterial(spanW, spanH) {
    const f = this.finishes.wall;
    let map = null, color = this.colors.wall, tintable = true;
    if (f === 'tile') { map = this.mappedTexture('wallTile', spanW / 0.4, spanH / 0.4); color = '#ffffff'; tintable = false; }
    else if (f === 'wallpaper') { map = this.mappedTexture('wallpaper', spanW / 1.0, 1); }
    else if (f === 'plaster') { map = this.mappedTexture('plaster', spanW / 1.5, spanH / 1.5); }
    else if (f === 'panels') { map = this.mappedTexture('panels', spanW / 0.5, 1); }
    // 'paint' (and default) => solid colour, no map
    const mat = new THREE.MeshStandardMaterial({
      color, map, side: THREE.DoubleSide,
      roughness: f === 'tile' ? 0.35 : 0.85, metalness: 0
    });
    return { mat, tintable };
  }

  /** Material for the ceiling based on the selected finish. */
  ceilingMaterial() {
    const f = this.finishes.ceiling;
    if (f === 'stretch') return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.15, side: THREE.DoubleSide });
    return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  }

  /**
   * Build the full room: shell, finishes, furniture and fixtures.
   * @param {{name,width,length,height}} room
   * @param {object} finishes  resolved finish profile (see calculator.getRoomFinishes)
   * @param {object} opts  { recenter:boolean }
   */
  createRoom(room, finishes, opts = {}) {
    if (!room) return;
    this.currentRoom = room;
    if (finishes) this.finishes = finishes;
    const recenter = opts.recenter !== false;

    this.disposeRoom();

    const { width, length, height } = room;
    this.roomMesh = new THREE.Group();

    // --- Floor ---
    const floorInfo = this.floorMaterial(width, length);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), floorInfo.mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData = { surface: 'floor', tintable: floorInfo.tintable };
    this.roomMesh.add(floor);

    // --- Ceiling ---
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, length), this.ceilingMaterial());
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.roomMesh.add(ceiling);
    if (this.finishes.ceiling === 'multilevel') this.addMultilevelCeiling(width, length, height);

    // --- Walls --- (back & left opaque/textured; front & right faint so we can see in)
    const back = this.makeWall(width, height, floorInfo, true);
    back.mesh.position.set(0, height / 2, -length / 2);
    this.roomMesh.add(back.mesh);

    const left = this.makeWall(length, height, floorInfo, true);
    left.mesh.position.set(-width / 2, height / 2, 0);
    left.mesh.rotation.y = Math.PI / 2;
    this.roomMesh.add(left.mesh);

    const front = this.makeGlassWall(width, height);
    front.position.set(0, height / 2, length / 2);
    front.rotation.y = Math.PI;
    this.roomMesh.add(front);

    const right = this.makeGlassWall(length, height);
    right.position.set(width / 2, height / 2, 0);
    right.rotation.y = -Math.PI / 2;
    this.roomMesh.add(right);

    // --- Baseboards (skip when walls are tiled) ---
    if (this.finishes.wall !== 'tile') this.addBaseboards(width, length);
    // --- Crown molding ---
    if (this.finishes.molding) this.addMolding(width, length, height);

    // --- Furniture by room type ---
    const furniture = furnitureFor(room.name, width, length, height, this.finishes);
    if (furniture) this.roomMesh.add(furniture);

    // --- Electrical fixtures ---
    if (this.finishes.lighting) this.addCeilingLamp(width, length, height);
    if (this.finishes.outlets) this.addOutlets(width, length);

    // --- Extra plumbing (washing machine) for non-bathroom rooms ---
    if (this.finishes.plumbing && this.finishes.plumbing.washer &&
        !(room.name || '').toLowerCase().match(/ванн|санузел/)) {
      const washer = box(0.6, 0.85, 0.6, PALETTE.white, { roughness: 0.4 });
      washer.position.set(width / 2 - 0.4, 0.425, -length / 2 + 0.4);
      this.roomMesh.add(washer);
    }

    this.scene.add(this.roomMesh);
    if (recenter) this.centerCamera(width, length, height);
  }

  /** Build a wall (a plane facing inward), reusing finish materials. */
  makeWall(spanW, spanH, floorInfo, opaque) {
    const info = this.wallMaterial(spanW, spanH);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spanW, spanH), info.mat);
    mesh.receiveShadow = true;
    mesh.userData = { surface: 'wall', tintable: info.tintable };
    return { mesh };
  }

  /** A faint see-through wall for the open sides. */
  makeGlassWall(spanW, spanH) {
    const mat = new THREE.MeshStandardMaterial({
      color: this.colors.wall, side: THREE.DoubleSide,
      transparent: true, opacity: 0.12, roughness: 0.9, depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spanW, spanH), mat);
    mesh.userData = { surface: 'glassWall' };
    return mesh;
  }

  addMultilevelCeiling(width, length, height) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9, side: THREE.DoubleSide });
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.7, length * 0.7), frameMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = height - 0.12;
    this.roomMesh.add(inner);
    // a thin skirt around the lower level
    const skirt = box(width * 0.7, 0.12, 0.04, 0xeaeaea);
    skirt.position.set(0, height - 0.06, -length * 0.35);
    this.roomMesh.add(skirt);
  }

  addBaseboards(width, length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const bh = 0.1, bd = 0.025;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, bh, bd), mat);
    back.position.set(0, bh / 2, -length / 2 + bd / 2);
    this.roomMesh.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(bd, bh, length), mat);
    left.position.set(-width / 2 + bd / 2, bh / 2, 0);
    this.roomMesh.add(left);
  }

  addMolding(width, length, height) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const mh = 0.08, md = 0.05;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, mh, md), mat);
    back.position.set(0, height - mh / 2, -length / 2 + md / 2);
    this.roomMesh.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(md, mh, length), mat);
    left.position.set(-width / 2 + md / 2, height - mh / 2, 0);
    this.roomMesh.add(left);
  }

  addCeilingLamp(width, length, height) {
    const lamp = new THREE.Group();
    const disc = cyl(0.28, 0.28, 0.06, 0xfff4d6, 24, { roughness: 0.3, metalness: 0.1 });
    disc.material.emissive = new THREE.Color(0xffe9ad);
    disc.material.emissiveIntensity = 0.45;
    disc.position.y = height - 0.04;
    lamp.add(disc);
    const light = new THREE.PointLight(0xfff1cf, 0.35, Math.max(width, length) * 2.2, 2);
    light.position.set(0, height - 0.3, 0);
    lamp.add(light);
    this.roomMesh.add(lamp);
  }

  addOutlets(width, length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
    const positions = [
      [-width * 0.25, 0.3, -length / 2 + 0.015],
      [width * 0.1, 0.3, -length / 2 + 0.015],
      [-width / 2 + 0.015, 0.3, length * 0.1]
    ];
    positions.forEach(([x, y, z], i) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), mat);
      o.position.set(x, y, z);
      if (i === 2) o.rotation.y = Math.PI / 2;
      this.roomMesh.add(o);
    });
  }

  centerCamera(width, length, height) {
    const maxDim = Math.max(width, length, height);
    const distance = maxDim * 1.4;
    this.camera.position.set(
      width / 2 + distance * 0.7,
      height / 2 + distance * 0.55,
      length / 2 + distance * 0.7
    );
    this.controls.target.set(0, height / 2.2, 0);
    this.controls.update();
  }

  /** Re-render the current room with new finishes (e.g. after an option toggle). */
  updateFinishes(finishes) {
    if (!this.currentRoom) return;
    this.createRoom(this.currentRoom, finishes, { recenter: false });
  }

  /** Back-compat: update both colours and rebuild. */
  updateColors(wallColor, floorColor) {
    this.colors.wall = wallColor;
    this.colors.floor = floorColor;
    if (this.currentRoom) this.createRoom(this.currentRoom, this.finishes, { recenter: false });
  }

  /** Live-tint paint/wallpaper/plaster walls without a rebuild. */
  setWallColor(color) {
    this.colors.wall = color;
    if (!this.roomMesh) return;
    this.roomMesh.traverse(child => {
      if (child.isMesh && child.userData) {
        if (child.userData.surface === 'wall' && child.userData.tintable) child.material.color.setStyle(color);
        if (child.userData.surface === 'glassWall') child.material.color.setStyle(color);
      }
    });
  }

  /** Live-tint wood floors without a rebuild. */
  setFloorColor(color) {
    this.colors.floor = color;
    if (!this.roomMesh) return;
    this.roomMesh.traverse(child => {
      if (child.isMesh && child.userData && child.userData.surface === 'floor' && child.userData.tintable) {
        child.material.color.setStyle(color);
      }
    });
  }

  resetView() {
    if (this.currentRoom) {
      const { width, length, height } = this.currentRoom;
      this.centerCamera(width, length, height);
    }
  }

  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  showPlaceholder() {
    this.disposeRoom();
    this.currentRoom = null;
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'block';
  }

  /** Remove and free the current room's GPU resources (avoids leaks on re-render). */
  disposeRoom() {
    if (!this.roomMesh) return;
    this.scene.remove(this.roomMesh);
    this.roomMesh.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m.map && !Object.values(this._texCache).includes(m.map)) m.map.dispose(); m.dispose(); });
      }
    });
    this.roomMesh = null;
  }

  dispose() {
    this.disposeRoom();
    if (this.renderer) this.renderer.dispose();
    if (this.controls) this.controls.dispose();
  }
}

// Export for use in other scripts
window.Room3DViewer = Room3DViewer;
