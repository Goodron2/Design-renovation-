/**
 * 3D Room Visualization using Three.js
 *
 * Renders ALL rooms of the project at once, laid out as a small "dollhouse"
 * floor plan (no solid ceilings, so you can see into every room from an angle).
 * Each room reflects its chosen renovation works:
 *  - floor / wall finishes drawn as procedural textures (laminate, tile,
 *    linoleum, wallpaper, decorative plaster, PVC panels)
 *  - furniture placed by room type (living room, kitchen, bathroom, ...)
 *  - selected electrical / plumbing works add a lamp, sockets, bathtub, etc.
 * The currently selected room gets a highlight frame.
 *
 * Everything is generated procedurally (canvas textures + primitives) so the
 * page needs no external 3D assets.
 */

// ---------------------------------------------------------------------------
// Palette + primitive helpers
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
  sanitaryEdge: 0xdfe3e6,
  glass: 0xbcd3da,
  plant: 0x4f8456,
  pot: 0xb07a4e,
  rug: 0xc98f63,
  accent: 0x2563eb
};

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

function glassPanel(w, h, d) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.32, roughness: 0.1 })
  );
  return mesh;
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function makeCanvas(w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texFromCanvas(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function woodTexture() {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const planks = 4, pw = s / planks;
  for (let i = 0; i < planks; i++) {
    const shade = 205 + Math.floor((Math.random() - 0.5) * 28);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(i * pw, 0, pw, s);
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    ctx.fillRect(i * pw, 0, 1.5, s);
    ctx.strokeStyle = 'rgba(120,120,120,0.15)';
    ctx.lineWidth = 1;
    for (let gr = 0; gr < 6; gr++) {
      const x = i * pw + Math.random() * pw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 4, s / 3, x - 4, (2 * s) / 3, x + 2, s);
      ctx.stroke();
    }
    const y = ((i % 2) ? 0.5 : 0.8) * s;
    ctx.fillStyle = 'rgba(80,80,80,0.4)';
    ctx.fillRect(i * pw, y, pw, 1.5);
  }
  return texFromCanvas(c);
}

function tileTexture(tiles = 2, base = 224, grout = 150, lineWidth = 3) {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
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

function wallpaperTexture() {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(245,245,245)';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(170,170,170,0.18)';
  for (let x = 0; x < s; x += 24) ctx.fillRect(x, 0, 10, s);
  return texFromCanvas(c);
}

function plasterTexture() {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(236,233,228)';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * 0.16;
    const v = Math.random() > 0.5 ? 255 : 140;
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    const x = Math.random() * s, y = Math.random() * s, r = 4 + Math.random() * 18;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return texFromCanvas(c);
}

function panelTexture() {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(238,238,238)';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(120,120,120,0.35)';
  for (let x = 0; x < s; x += s / 4) ctx.fillRect(x, 0, 2, s);
  return texFromCanvas(c);
}

function linoleumTexture() {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
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
// Furniture sets (return a group in the room's local coords:
// x in [-w/2, w/2], z in [-l/2, l/2], y up; big pieces against -x / -z walls)
// ---------------------------------------------------------------------------

function livingRoom(w, l, h) {
  const g = new THREE.Group();
  const rug = box(Math.min(w * 0.55, 2.6), 0.02, Math.min(l * 0.4, 1.8), PALETTE.rug, { roughness: 1 });
  rug.position.set(0, 0.011, 0);
  g.add(rug);

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

  const table = new THREE.Group();
  const top = box(1.1, 0.06, 0.6, PALETTE.woodFurniture); top.position.y = 0.4; table.add(top);
  [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => {
    const leg = box(0.06, 0.4, 0.06, PALETTE.woodDark); leg.position.set(x, 0.2, z); table.add(leg);
  });
  table.position.set(0, 0, 0.1);
  g.add(table);

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

  const ns = box(0.45, 0.5, 0.4, PALETTE.woodFurniture);
  ns.position.set(-w / 2 + bw + 0.45, 0.25, -l / 2 + 0.4);
  g.add(ns);

  const wardW = Math.min(w * 0.4, 1.4), wardH = Math.min(h * 0.85, 2.2);
  const wardrobe = box(wardW, wardH, 0.55, PALETTE.light);
  wardrobe.position.set(w / 2 - wardW / 2 - 0.1, wardH / 2, -l / 2 + 0.3);
  g.add(wardrobe);
  return g;
}

function kitchen(w, l, h) {
  const g = new THREE.Group();
  const counterH = 0.9, depth = 0.6;

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

  const upper = box(backLen * 0.8, 0.6, 0.35, PALETTE.white);
  upper.position.set(0, h - 0.7, -l / 2 + 0.18);
  g.add(upper);

  const stove = box(0.6, 0.04, depth - 0.05, PALETTE.dark, { roughness: 0.3 });
  stove.position.set(backLen * 0.25, counterH + 0.06, -l / 2 + depth / 2);
  g.add(stove);
  const fridgeH = Math.min(h * 0.78, 1.9);
  const fridge = box(0.6, fridgeH, 0.6, PALETTE.metal, { roughness: 0.35 });
  fridge.position.set(w / 2 - 0.4, fridgeH / 2, -l / 2 + 0.4);
  g.add(fridge);
  // sink on the counter
  const sink = box(0.4, 0.04, 0.35, 0xced3d8, { metalness: 0.4, roughness: 0.4 });
  sink.position.set(-backLen * 0.2, counterH + 0.06, -l / 2 + depth / 2); g.add(sink);

  const tx = w / 2 - 0.8, tz = l / 2 - 0.8;
  const top = box(0.9, 0.05, 0.7, PALETTE.woodFurniture); top.position.set(tx, 0.74, tz); g.add(top);
  [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].forEach(([dx, dz]) => {
    const leg = box(0.05, 0.74, 0.05, PALETTE.woodDark); leg.position.set(tx + dx, 0.37, tz + dz); g.add(leg);
  });
  return g;
}

/** Redesigned bathroom: tub on the left wall, vanity + toilet on the back wall. */
function bathroom(w, l, h, finishes) {
  const g = new THREE.Group();
  const wantShower = finishes && finishes.plumbing && finishes.plumbing.shower;

  // --- Bathtub or shower along the LEFT wall ---
  if (!wantShower) {
    const tubL = Math.min(l * 0.7, 1.7), tubW = 0.72, tubX = -w / 2 + tubW / 2 + 0.08, tubZ = -l / 2 + tubL / 2 + 0.12;
    const shell = box(tubW, 0.5, tubL, PALETTE.sanitaryEdge, { roughness: 0.35 });
    shell.position.set(tubX, 0.25, tubZ); g.add(shell);
    const basin = box(tubW - 0.16, 0.34, tubL - 0.18, 0xffffff, { roughness: 0.2 });
    basin.position.set(tubX, 0.44, tubZ); g.add(basin);
    const faucet = cyl(0.02, 0.02, 0.2, PALETTE.metal, 10, { metalness: 0.6, roughness: 0.3 });
    faucet.position.set(tubX, 0.62, tubZ - tubL / 2 + 0.1); g.add(faucet);
    const mat = box(0.7, 0.02, 0.5, PALETTE.fabricAccent, { roughness: 1 });
    mat.position.set(tubX + tubW / 2 + 0.45, 0.011, l / 2 - 0.7); g.add(mat);
  } else {
    const sH = Math.min(h * 0.78, 1.95);
    const tray = box(0.95, 0.08, 0.95, PALETTE.sanitaryEdge, { roughness: 0.3 });
    tray.position.set(-w / 2 + 0.55, 0.04, -l / 2 + 0.55); g.add(tray);
    const g1 = glassPanel(0.95, sH, 0.04); g1.position.set(-w / 2 + 0.55, sH / 2, -l / 2 + 1.02); g.add(g1);
    const g2 = glassPanel(0.04, sH, 0.95); g2.position.set(-w / 2 + 1.02, sH / 2, -l / 2 + 0.55); g.add(g2);
    const head = cyl(0.08, 0.08, 0.04, PALETTE.metal, 14, { metalness: 0.6, roughness: 0.3 });
    head.position.set(-w / 2 + 0.55, sH - 0.1, -l / 2 + 0.2); g.add(head);
  }

  // helper: position a mesh and add it to the group
  const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };

  // --- Vanity (cabinet + counter + basin + faucet + mirror) on the BACK wall, right ---
  const vanW = Math.min(w * 0.42, 0.95), vanD = 0.5, vx = w / 2 - vanW / 2 - 0.15, vz = -l / 2 + vanD / 2 + 0.05;
  at(box(vanW, 0.8, vanD, PALETTE.woodFurniture), vx, 0.4, vz);
  at(box(vanW + 0.06, 0.06, vanD + 0.04, 0xffffff, { roughness: 0.3 }), vx, 0.83, vz);
  at(box(0.42, 0.12, 0.3, 0xffffff, { roughness: 0.2 }), vx, 0.92, vz);
  at(cyl(0.015, 0.015, 0.16, PALETTE.metal, 10, { metalness: 0.6, roughness: 0.3 }), vx, 1.0, vz - 0.08);
  at(box(0.7, 0.7, 0.04, PALETTE.glass, { roughness: 0.1, metalness: 0.4 }), vx, 1.5, -l / 2 + 0.06);

  // --- Toilet on the back wall, left of the vanity ---
  const tlx = Math.max(-w / 2 + 0.45, vx - vanW / 2 - 0.55);
  at(box(0.4, 0.42, 0.55, 0xffffff, { roughness: 0.25 }), tlx, 0.21, -l / 2 + 0.42);
  at(cyl(0.21, 0.21, 0.09, 0xffffff, 22, { roughness: 0.25 }), tlx, 0.45, -l / 2 + 0.44);
  at(box(0.42, 0.45, 0.16, 0xffffff, { roughness: 0.25 }), tlx, 0.63, -l / 2 + 0.13);

  // --- Towel (accent) on the right wall ---
  const towel = box(0.04, 0.5, 0.34, PALETTE.fabric, { roughness: 1 });
  towel.position.set(w / 2 - 0.06, 1.05, l / 2 - 0.7); g.add(towel);
  return g;
}

function office(w, l, h) {
  const g = new THREE.Group();
  const deskW = Math.min(w * 0.6, 1.6);
  const desk = box(deskW, 0.05, 0.7, PALETTE.woodFurniture);
  desk.position.set(0, 0.74, -l / 2 + 0.45); g.add(desk);
  for (const sx of [-1, 1]) {
    const leg = box(0.05, 0.74, 0.6, PALETTE.woodDark);
    leg.position.set(sx * (deskW / 2 - 0.1), 0.37, -l / 2 + 0.45); g.add(leg);
  }
  const monitor = box(0.04, 0.4, 0.6, PALETTE.dark, { roughness: 0.3 });
  monitor.position.set(0, 1.15, -l / 2 + 0.25); g.add(monitor);
  const seat = box(0.45, 0.05, 0.45, PALETTE.dark); seat.position.set(0, 0.45, -l / 2 + 0.95); g.add(seat);
  const chairBack = box(0.45, 0.5, 0.05, PALETTE.dark); chairBack.position.set(0, 0.7, -l / 2 + 1.15); g.add(chairBack);
  const shelfH = Math.min(h * 0.8, 2.0);
  const shelf = box(0.35, shelfH, Math.min(l * 0.5, 1.4), PALETTE.woodFurniture);
  shelf.position.set(-w / 2 + 0.2, shelfH / 2, 0); g.add(shelf);
  g.add(plant(w / 2 - 0.4, -l / 2 + 0.4));
  return g;
}

function children(w, l, h) {
  const g = new THREE.Group();
  const bw = Math.min(w * 0.45, 1.2), bl = Math.min(l * 0.55, 1.8);
  const frame = box(bw, 0.35, bl, PALETTE.fabricAccent); frame.position.set(-w / 2 + bw / 2 + 0.2, 0.18, -l / 2 + bl / 2 + 0.2); g.add(frame);
  const mattress = box(bw - 0.1, 0.18, bl - 0.1, PALETTE.white); mattress.position.set(-w / 2 + bw / 2 + 0.2, 0.42, -l / 2 + bl / 2 + 0.2); g.add(mattress);
  const desk = box(0.9, 0.05, 0.5, PALETTE.woodFurniture); desk.position.set(w / 2 - 0.7, 0.6, -l / 2 + 0.4); g.add(desk);
  const chest = box(0.6, 0.4, 0.4, PALETTE.plant); chest.position.set(w / 2 - 0.5, 0.2, l / 2 - 0.5); g.add(chest);
  const rug = box(Math.min(w * 0.4, 1.4), 0.02, Math.min(l * 0.4, 1.4), 0x86b2c4, { roughness: 1 });
  rug.position.set(0.2, 0.011, 0.2); g.add(rug);
  return g;
}

function hallway(w, l, h) {
  const g = new THREE.Group();
  const wardH = Math.min(h * 0.85, 2.2), wardL = Math.min(l * 0.5, 1.4);
  const wardrobe = box(0.5, wardH, wardL, PALETTE.light);
  wardrobe.position.set(-w / 2 + 0.3, wardH / 2, -l / 2 + wardL / 2 + 0.2); g.add(wardrobe);
  const bench = box(Math.min(w * 0.5, 1.0), 0.45, 0.4, PALETTE.woodFurniture);
  bench.position.set(0, 0.22, -l / 2 + 0.3); g.add(bench);
  const mirror = box(0.04, 1.4, 0.5, PALETTE.glass, { roughness: 0.1, metalness: 0.3 });
  mirror.position.set(-w / 2 + 0.06, 1.2, l / 2 - 0.6); g.add(mirror);
  return g;
}

function plant(x, z) {
  const g = new THREE.Group();
  const pot = cyl(0.16, 0.12, 0.3, PALETTE.pot); pot.position.y = 0.15; g.add(pot);
  const foliage = cyl(0, 0.32, 0.7, PALETTE.plant, 8); foliage.position.y = 0.65; g.add(foliage);
  g.position.set(x, 0, z);
  return g;
}

function furnitureFor(name, w, l, h, finishes) {
  const n = (name || '').toLowerCase();
  if (n.includes('кухн')) return kitchen(w, l, h);
  if (n.includes('ванн') || n.includes('санузел') || n.includes('туалет')) return bathroom(w, l, h, finishes);
  if (n.includes('спальн')) return bedroom(w, l, h);
  if (n.includes('детск')) return children(w, l, h);
  if (n.includes('кабинет') || n.includes('офис')) return office(w, l, h);
  if (n.includes('коридор') || n.includes('прихож') || n.includes('холл')) return hallway(w, l, h);
  return livingRoom(w, l, h);
}

// ---------------------------------------------------------------------------
// Viewer (renders all rooms at once)
// ---------------------------------------------------------------------------

class Room3DViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.roomsGroup = null;     // holds every room group
    this.roomGroups = [];       // per-room groups (by index)
    this.highlight = null;      // selection frame
    this._positions = [];       // per-room {x, z}
    this._dims = [];            // per-room {width, length, height}
    this._layoutExtent = 8;
    this.rooms = [];
    this.finishesList = [];
    this.selectedIndex = -1;
    this._texCache = {};
    this._roomColors = [];      // per-room { wall, floor } overrides from the colour pickers

    this.colors = { wall: '#f5f5f5', floor: '#8B4513' }; // defaults

    if (this.container) this.init();
  }

  init() {
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef3f7);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
    this.camera.position.set(12, 12, 12);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.setupLighting();

    this.gridHelper = new THREE.GridHelper(60, 60, 0xcccccc, 0xe4e4e4);
    this.gridHelper.position.y = -0.02;
    this.scene.add(this.gridHelper);

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.68));
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.7);
    mainLight.position.set(14, 22, 12);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 120;
    mainLight.shadow.camera.left = -40;
    mainLight.shadow.camera.right = 40;
    mainLight.shadow.camera.top = 40;
    mainLight.shadow.camera.bottom = -40;
    this.scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-8, 8, -8);
    this.scene.add(fillLight);
  }

  // ---- textures ----
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

  mappedTexture(key, repeatX, repeatY) {
    const base = this.getTexture(key);
    if (!base) return null;
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
    t.needsUpdate = true;
    return t;
  }

  floorMaterial(finishes, width, length, colors) {
    const f = finishes.floor;
    const floorColor = (colors && colors.floor) || this.colors.floor;
    let map = null, color = '#cfcfcf', tintable = false;
    if (f === 'wood') { map = this.mappedTexture('wood', width / 1.2, length / 1.2); color = floorColor; tintable = true; }
    else if (f === 'tile') { map = this.mappedTexture('floorTile', width / 0.8, length / 0.8); color = '#ffffff'; }
    else if (f === 'linoleum') { map = this.mappedTexture('linoleum', width / 2, length / 2); color = '#ffffff'; }
    else if (f === 'smooth') { color = '#d9d7d2'; }
    else { map = this.mappedTexture('wood', width / 1.2, length / 1.2); color = floorColor; tintable = true; }
    const mat = new THREE.MeshStandardMaterial({ color, map, roughness: f === 'tile' ? 0.4 : 0.85, metalness: 0 });
    return { mat, tintable };
  }

  wallMaterial(finishes, spanW, spanH, colors) {
    const f = finishes.wall;
    const wallColor = (colors && colors.wall) || this.colors.wall;
    let map = null, color = wallColor, tintable = true;
    if (f === 'tile') { map = this.mappedTexture('wallTile', spanW / 0.4, spanH / 0.4); color = '#ffffff'; tintable = false; }
    else if (f === 'wallpaper') { map = this.mappedTexture('wallpaper', spanW / 1.0, 1); }
    else if (f === 'plaster') { map = this.mappedTexture('plaster', spanW / 1.5, spanH / 1.5); }
    else if (f === 'panels') { map = this.mappedTexture('panels', spanW / 0.5, 1); }
    const mat = new THREE.MeshStandardMaterial({ color, map, side: THREE.DoubleSide, roughness: f === 'tile' ? 0.35 : 0.85, metalness: 0 });
    return { mat, tintable };
  }

  // ---- one room ----
  buildRoomGroup(room, finishes, colors) {
    const g = new THREE.Group();
    const { width, length, height } = room;
    const fin = finishes || {};
    const col = colors || { wall: this.colors.wall, floor: this.colors.floor };

    // Floor
    const floorInfo = this.floorMaterial(fin, width, length, col);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), floorInfo.mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData = { surface: 'floor', tintable: floorInfo.tintable };
    g.add(floor);

    // Walls: back (-z) and left (-x) opaque/textured; front (+z) and right (+x) see-through
    const back = this.makeWall(fin, width, height, col);
    back.position.set(0, height / 2, -length / 2);
    g.add(back);
    const left = this.makeWall(fin, length, height, col);
    left.position.set(-width / 2, height / 2, 0);
    left.rotation.y = Math.PI / 2;
    g.add(left);
    const front = this.makeGlassWall(width, height, col);
    front.position.set(0, height / 2, length / 2);
    front.rotation.y = Math.PI;
    g.add(front);
    const right = this.makeGlassWall(length, height, col);
    right.position.set(width / 2, height / 2, 0);
    right.rotation.y = -Math.PI / 2;
    g.add(right);

    // Baseboards (skip when tiled) + cornice (when a ceiling finish / molding is chosen)
    if (fin.wall !== 'tile') this.addBaseboards(g, width, length);
    if (fin.molding || fin.ceiling) this.addMolding(g, width, length, height, fin.ceiling === 'stretch');

    // Furniture by room type
    const furniture = furnitureFor(room.name, width, length, height, fin);
    if (furniture) g.add(furniture);

    // Electrical fixtures
    if (fin.lighting) this.addCeilingLamp(g, width, length, height);
    if (fin.outlets) this.addOutlets(g, width, length);

    // Washing machine (non-bathroom rooms only)
    if (fin.plumbing && fin.plumbing.washer && !/ванн|санузел/.test((room.name || '').toLowerCase())) {
      const washer = box(0.6, 0.85, 0.6, PALETTE.white, { roughness: 0.4 });
      washer.position.set(width / 2 - 0.4, 0.425, -length / 2 + 0.4);
      g.add(washer);
    }

    // Name label floating above the room
    g.add(this.createLabel(room.name || 'Комната', height));
    return g;
  }

  makeWall(finishes, spanW, spanH, colors) {
    const info = this.wallMaterial(finishes, spanW, spanH, colors);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spanW, spanH), info.mat);
    mesh.receiveShadow = true;
    mesh.userData = { surface: 'wall', tintable: info.tintable };
    return mesh;
  }

  makeGlassWall(spanW, spanH, colors) {
    const mat = new THREE.MeshStandardMaterial({
      color: (colors && colors.wall) || this.colors.wall, side: THREE.DoubleSide,
      transparent: true, opacity: 0.1, roughness: 0.9, depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spanW, spanH), mat);
    mesh.userData = { surface: 'glassWall' };
    return mesh;
  }

  addBaseboards(group, width, length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const bh = 0.1, bd = 0.025;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, bh, bd), mat);
    back.position.set(0, bh / 2, -length / 2 + bd / 2);
    group.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(bd, bh, length), mat);
    left.position.set(-width / 2 + bd / 2, bh / 2, 0);
    group.add(left);
  }

  addMolding(group, width, length, height, glossy) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: glossy ? 0.2 : 0.5, metalness: glossy ? 0.1 : 0 });
    const mh = 0.08, md = 0.05;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, mh, md), mat);
    back.position.set(0, height - mh / 2, -length / 2 + md / 2);
    group.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(md, mh, length), mat);
    left.position.set(-width / 2 + md / 2, height - mh / 2, 0);
    group.add(left);
  }

  addCeilingLamp(group, width, length, height) {
    const disc = cyl(0.26, 0.26, 0.06, 0xfff4d6, 24, { roughness: 0.3, metalness: 0.1 });
    disc.material.emissive = new THREE.Color(0xffe9ad);
    disc.material.emissiveIntensity = 0.5;
    disc.position.set(0, height - 0.04, 0);
    group.add(disc);
    const light = new THREE.PointLight(0xfff1cf, 0.3, Math.max(width, length) * 2.2, 2);
    light.position.set(0, height - 0.3, 0);
    group.add(light);
  }

  addOutlets(group, width, length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
    const positions = [
      [-width * 0.25, 0.3, -length / 2 + 0.015, 0],
      [width * 0.1, 0.3, -length / 2 + 0.015, 0],
      [-width / 2 + 0.015, 0.3, length * 0.1, Math.PI / 2]
    ];
    positions.forEach(([x, y, z, ry]) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), mat);
      o.position.set(x, y, z);
      o.rotation.y = ry;
      group.add(o);
    });
  }

  createLabel(text, height) {
    const c = makeCanvas(256, 64), ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = 'rgba(37,99,235,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 16), 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(1.7, 0.43, 1);
    sprite.position.set(0, height + 0.6, 0);
    sprite.userData = { label: true };
    return sprite;
  }

  // ---- layout / render all rooms ----
  render(rooms, finishesList, selectedIndex, opts = {}) {
    this.disposeRooms();
    this.rooms = rooms || [];
    this.finishesList = finishesList || [];
    this.selectedIndex = (selectedIndex === undefined ? -1 : selectedIndex);

    if (!this.rooms.length) { this.showPlaceholder(); return; }
    this.hidePlaceholder();

    const n = this.rooms.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rowsN = Math.ceil(n / cols);
    const gap = 1.6;
    let cell = 0;
    this.rooms.forEach(r => { cell = Math.max(cell, r.width, r.length); });
    cell += gap;

    const totalW = cols * cell, totalL = rowsN * cell;
    this.roomsGroup = new THREE.Group();
    this.roomGroups = [];
    this._positions = [];
    this._dims = [];

    this.rooms.forEach((room, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = col * cell - (totalW - cell) / 2;
      const cz = row * cell - (totalL - cell) / 2;
      if (!this._roomColors[i]) this._roomColors[i] = { wall: this.colors.wall, floor: this.colors.floor };
      const grp = this.buildRoomGroup(room, this.finishesList[i] || {}, this._roomColors[i]);
      grp.position.set(cx, 0, cz);
      this.roomsGroup.add(grp);
      this.roomGroups[i] = grp;
      this._positions[i] = { x: cx, z: cz };
      this._dims[i] = { width: room.width, length: room.length, height: room.height };
    });

    this.scene.add(this.roomsGroup);
    this._layoutExtent = Math.max(totalW, totalL);
    this.applyHighlight();
    if (opts.recenter !== false) this.centerCameraAll();
  }

  /** Rebuild a single room in place (used on option toggle). */
  updateRoom(index, finishes) {
    if (!this.roomsGroup || !this.roomGroups[index] || !this._positions[index]) return;
    this.finishesList[index] = finishes;
    const old = this.roomGroups[index];
    this.roomsGroup.remove(old);
    this.disposeObject(old);
    const grp = this.buildRoomGroup(this.rooms[index], finishes, this._roomColors[index]);
    const p = this._positions[index];
    grp.position.set(p.x, 0, p.z);
    this.roomsGroup.add(grp);
    this.roomGroups[index] = grp;
  }

  /** Move/show the selection frame without rebuilding rooms. */
  setSelected(index) {
    this.selectedIndex = (index === undefined ? -1 : index);
    this.applyHighlight();
  }

  applyHighlight() {
    if (this.highlight) {
      if (this.roomsGroup) this.roomsGroup.remove(this.highlight);
      this.disposeObject(this.highlight);
      this.highlight = null;
    }
    const i = this.selectedIndex;
    if (i < 0 || !this.roomsGroup || !this._positions[i]) return;
    const { width, length } = this._dims[i];
    const p = this._positions[i];
    const frame = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 0.6, roughness: 0.4 });
    const t = 0.08, m = 0.12, y = 0.03;
    const fw = width + m * 2, fl = length + m * 2;
    const seg = [
      [fw, t, 0, -length / 2 - m], [fw, t, 0, length / 2 + m],
    ];
    seg.forEach(([sw, sd, x, z]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.04, t), mat);
      bar.position.set(x, y, z); frame.add(bar);
    });
    [[-width / 2 - m], [width / 2 + m]].forEach(([x]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(t, 0.04, fl), mat);
      bar.position.set(x, y, 0); frame.add(bar);
    });
    frame.position.set(p.x, 0, p.z);
    frame.userData = { highlight: true };
    this.roomsGroup.add(frame);
    this.highlight = frame;
  }

  centerCameraAll() {
    const ext = this._layoutExtent || 8;
    const d = ext * 0.95 + 6;
    this.camera.position.set(d * 0.5, d * 0.72, d * 0.78);
    this.controls.target.set(0, 0.4, 0);
    this.controls.maxDistance = Math.max(40, d * 2.4);
    this.controls.update();
  }

  // ---- colour pickers: tint ONLY the selected room (live, no rebuild) ----
  setWallColor(color) {
    const i = this.selectedIndex;
    if (i < 0 || !this.roomGroups[i]) return;
    if (!this._roomColors[i]) this._roomColors[i] = { wall: this.colors.wall, floor: this.colors.floor };
    this._roomColors[i].wall = color;
    this.roomGroups[i].traverse(child => {
      if (child.isMesh && child.userData) {
        if (child.userData.surface === 'wall' && child.userData.tintable) child.material.color.setStyle(color);
        if (child.userData.surface === 'glassWall') child.material.color.setStyle(color);
      }
    });
  }

  setFloorColor(color) {
    const i = this.selectedIndex;
    if (i < 0 || !this.roomGroups[i]) return;
    if (!this._roomColors[i]) this._roomColors[i] = { wall: this.colors.wall, floor: this.colors.floor };
    this._roomColors[i].floor = color;
    this.roomGroups[i].traverse(child => {
      if (child.isMesh && child.userData && child.userData.surface === 'floor' && child.userData.tintable) {
        child.material.color.setStyle(color);
      }
    });
  }

  resetView() { this.centerCameraAll(); }

  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth, height = this.container.clientHeight;
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
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'block';
  }
  hidePlaceholder() {
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }

  /** Dispose an object's geometry/materials/textures (skips cached textures). */
  disposeObject(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.map && !Object.values(this._texCache).includes(m.map)) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  disposeRooms() {
    if (this.highlight) { this.disposeObject(this.highlight); this.highlight = null; }
    if (this.roomsGroup) {
      this.scene.remove(this.roomsGroup);
      this.disposeObject(this.roomsGroup);
      this.roomsGroup = null;
    }
    this.roomGroups = [];
    this._positions = [];
    this._dims = [];
  }

  dispose() {
    this.disposeRooms();
    Object.values(this._texCache).forEach(t => { if (t) t.dispose(); });
    this._texCache = {};
    if (this.renderer) this.renderer.dispose();
    if (this.controls) this.controls.dispose();
  }
}

window.Room3DViewer = Room3DViewer;
