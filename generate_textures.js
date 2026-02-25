/**
 * Generate tileable texture images (512x512) using Node.js canvas.
 * Run: node generate_textures.js
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const outDir = path.join(__dirname, '../public/textures');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function saveCanvas(canvas, name) {
  const buf = canvas.toBuffer('image/jpeg', { quality: 0.85 });
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('Created', name);
}

// --- Laminate (wood plank pattern) ---
function genLaminate() {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  // Base wood color
  ctx.fillStyle = '#C4A46C';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Planks
  const plankH = 64;
  for (let y = 0; y < SIZE; y += plankH) {
    // Alternate offset
    const offset = (Math.floor(y / plankH) % 2) * (SIZE / 3);
    // Plank lines
    ctx.strokeStyle = '#B0904A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();

    // Vertical seams
    for (let x = offset; x < SIZE; x += SIZE / 3) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + plankH);
      ctx.stroke();
    }

    // Wood grain lines
    ctx.strokeStyle = 'rgba(139, 100, 50, 0.15)';
    ctx.lineWidth = 0.5;
    for (let g = 0; g < 8; g++) {
      const gy = y + 5 + Math.random() * (plankH - 10);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let gx = 0; gx < SIZE; gx += 20) {
        ctx.lineTo(gx, gy + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }
  }

  // Subtle noise
  const id = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    id.data[i] += n;
    id.data[i+1] += n;
    id.data[i+2] += n;
  }
  ctx.putImageData(id, 0, 0);

  saveCanvas(c, 'laminate.jpg');
}

// --- Floor Tile (ceramic grid) ---
function genFloorTile() {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#C8C0B0';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const tileSize = 128;
  const grout = 3;

  for (let y = 0; y < SIZE; y += tileSize) {
    for (let x = 0; x < SIZE; x += tileSize) {
      // Grout lines
      ctx.fillStyle = '#A09888';
      ctx.fillRect(x, y, tileSize, grout);
      ctx.fillRect(x, y, grout, tileSize);

      // Tile surface with slight color variation
      const v = Math.random() * 10 - 5;
      ctx.fillStyle = `rgb(${195 + v}, ${187 + v}, ${170 + v})`;
      ctx.fillRect(x + grout, y + grout, tileSize - grout * 2, tileSize - grout * 2);

      // Subtle specular highlights
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + grout + 5, y + grout + 5, tileSize - grout * 2 - 10, 2);
    }
  }

  // Noise
  const id = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    id.data[i] += n;
    id.data[i+1] += n;
    id.data[i+2] += n;
  }
  ctx.putImageData(id, 0, 0);

  saveCanvas(c, 'floor_tile.jpg');
}

// --- Linoleum (subtle speckled pattern) ---
function genLinoleum() {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7CB68E';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Speckles
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = Math.random() * 2 + 0.5;
    const brightness = Math.random() * 40 - 20;
    ctx.fillStyle = `rgba(${124 + brightness}, ${182 + brightness}, ${142 + brightness}, 0.5)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Noise
  const id = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    id.data[i] += n;
    id.data[i+1] += n;
    id.data[i+2] += n;
  }
  ctx.putImageData(id, 0, 0);

  saveCanvas(c, 'linoleum.jpg');
}

// --- Wall Paint (subtle texture) ---
function genWallPaint() {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F5F0EB';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle brush strokes
  ctx.strokeStyle = 'rgba(200, 190, 180, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 200; i++) {
    const y = Math.random() * SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < SIZE; x += 10) {
      ctx.lineTo(x, y + (Math.random() - 0.5) * 2);
    }
    ctx.stroke();
  }

  // Noise
  const id = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    id.data[i] += n;
    id.data[i+1] += n;
    id.data[i+2] += n;
  }
  ctx.putImageData(id, 0, 0);

  saveCanvas(c, 'wall_paint.jpg');
}

// --- Ceiling White (very subtle texture) ---
function genCeilingWhite() {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Very subtle noise
  const id = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 4;
    id.data[i] += n;
    id.data[i+1] += n;
    id.data[i+2] += n;
  }
  ctx.putImageData(id, 0, 0);

  saveCanvas(c, 'ceiling_white.jpg');
}

genLaminate();
genFloorTile();
genLinoleum();
genWallPaint();
genCeilingWhite();
console.log('All textures generated!');
