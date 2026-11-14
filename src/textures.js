// 털 · 비늘 재질 — 캔버스로 만든 방향성 털가닥 텍스처(map/bumpMap/roughnessMap)
// 동물별로 한 번만 생성해 캐시한다. 256² 이하로 유지해 아이폰에서도 가볍다.
import THREE from './three.js';

const RECIPES = {
  'lion-coat': {
    base: '#c08f52',
    blotches: ['#d3aa70', '#a97a3c', '#b98546'],
    strands: [
      { color: '#dcb87e', weight: 0.34, alpha: 0.5 },
      { color: '#a5722f', weight: 0.3, alpha: 0.45 },
      { color: '#e8cd97', weight: 0.2, alpha: 0.4 },
      { color: '#7d4f22', weight: 0.16, alpha: 0.35 },
    ],
    count: 1500,
    len: [7, 22],
    width: [0.6, 1.5],
    dir: 0,
    dirVar: 0.28,
    roughness: [180, 250],
    bump: 0.045,
    repeat: [2, 3],
  },
  'lion-mane': {
    base: '#3f2410',
    blotches: ['#57351a', '#2a170a', '#6a4220'],
    strands: [
      { color: '#5c3517', weight: 0.34, alpha: 0.6 },
      { color: '#8a5a28', weight: 0.24, alpha: 0.55 },
      { color: '#c08a44', weight: 0.22, alpha: 0.5 },
      { color: '#20100a', weight: 0.2, alpha: 0.55 },
    ],
    count: 1900,
    len: [10, 30],
    width: [0.8, 2.0],
    dir: 0,
    dirVar: 0.4,
    roughness: [190, 255],
    bump: 0.075,
    repeat: [2, 2],
  },
  'wolf-coat': {
    base: '#8b897f',
    blotches: ['#9d9a8e', '#6f6d64', '#a8a496'],
    strands: [
      { color: '#b9b5a7', weight: 0.28, alpha: 0.5 },
      { color: '#6b6961', weight: 0.28, alpha: 0.45 },
      { color: '#d6d0be', weight: 0.2, alpha: 0.42 },
      { color: '#4d4b45', weight: 0.24, alpha: 0.45 },
    ],
    count: 1700,
    len: [8, 24],
    width: [0.6, 1.5],
    dir: 0,
    dirVar: 0.3,
    roughness: [175, 245],
    bump: 0.055,
    repeat: [2, 3],
  },
  'wolf-cream': {
    base: '#d6cdb7',
    blotches: ['#e3dbc8', '#c3b9a1', '#eae4d4'],
    strands: [
      { color: '#f0ead9', weight: 0.4, alpha: 0.45 },
      { color: '#bfb49b', weight: 0.32, alpha: 0.4 },
      { color: '#a49a83', weight: 0.28, alpha: 0.35 },
    ],
    count: 1200,
    len: [7, 20],
    width: [0.6, 1.4],
    dir: 0,
    dirVar: 0.32,
    roughness: [190, 250],
    bump: 0.05,
    repeat: [2, 2],
  },
  'bear-coat': {
    base: '#6b4a2c',
    blotches: ['#7d5735', '#54381f', '#8f6a41'],
    strands: [
      { color: '#8a6238', weight: 0.3, alpha: 0.5 },
      { color: '#a87a48', weight: 0.24, alpha: 0.45 },
      { color: '#4e341c', weight: 0.3, alpha: 0.5 },
      { color: '#c39a63', weight: 0.16, alpha: 0.4 },
    ],
    count: 1900,
    len: [9, 28],
    width: [0.8, 2.0],
    dir: 0,
    dirVar: 0.38,
    roughness: [185, 252],
    bump: 0.07,
    repeat: [2, 3],
  },
  'bear-light': {
    base: '#b08a5c',
    blotches: ['#c09a6c', '#96703f', '#cda97c'],
    strands: [
      { color: '#d8b384', weight: 0.36, alpha: 0.45 },
      { color: '#8e6a3c', weight: 0.34, alpha: 0.4 },
      { color: '#e3c69b', weight: 0.3, alpha: 0.35 },
    ],
    count: 1100,
    len: [6, 18],
    width: [0.6, 1.4],
    dir: 0,
    dirVar: 0.3,
    roughness: [180, 240],
    bump: 0.05,
    repeat: [2, 2],
  },
  'tiger-coat': {
    base: '#d9791f',
    blotches: ['#e08a34', '#b85e12', '#f0a24a'],
    pattern: { type: 'stripes', color: '#1a1008', count: 6, width: [0.05, 0.1], belly: 0.76, bellyColor: '#f3e7cf', wobble: 0.04, alpha: 0.86 },
    strands: [
      { color: '#f2b260', weight: 0.4, alpha: 0.32 },
      { color: '#b85e12', weight: 0.4, alpha: 0.3 },
      { color: '#ffe0b0', weight: 0.2, alpha: 0.26 },
    ],
    count: 900,
    len: [6, 16],
    width: [0.6, 1.3],
    dir: 0,
    dirVar: 0.2,
    roughness: [160, 240],
    bump: 0.03,
    repeat: [1, 1],
  },
  'cheetah-coat': {
    base: '#d7a25c',
    blotches: ['#e2b478', '#c08d47', '#ecc98f'],
    pattern: { type: 'spots', color: '#241a10', count: 240, size: [0.02, 0.04], belly: 0.7, bellyColor: '#f8f0df', alpha: 0.95 },
    strands: [
      { color: '#f0c68c', weight: 0.4, alpha: 0.3 },
      { color: '#b8843f', weight: 0.35, alpha: 0.3 },
      { color: '#fbe6c4', weight: 0.25, alpha: 0.25 },
    ],
    count: 800,
    len: [5, 14],
    width: [0.5, 1.2],
    dir: 0,
    dirVar: 0.2,
    roughness: [170, 245],
    bump: 0.03,
    repeat: [1, 1],
  },
  'elephant-hide': {
    base: '#8a8177',
    blotches: ['#948b80', '#726a61', '#a09990'],
    pattern: { type: 'wrinkles', color: '#5e564d', count: 90, alpha: 0.35 },
    strands: [],
    count: 0,
    len: [4, 8],
    width: [0.6, 1.1],
    dir: 0,
    dirVar: 0.6,
    roughness: [200, 250],
    bump: 0.06,
    repeat: [2, 2],
  },
  'rhino-hide': {
    base: '#8a8a83',
    blotches: ['#96968f', '#6f6f69', '#a3a39b'],
    pattern: { type: 'plates', color: '#4e4e48', alpha: 0.5 },
    strands: [],
    count: 0,
    len: [4, 8],
    width: [0.6, 1.1],
    dir: 0,
    dirVar: 0.6,
    roughness: [190, 250],
    bump: 0.07,
    repeat: [2, 2],
  },
  'polar-coat': {
    base: '#e6e2d6',
    blotches: ['#f2efe6', '#cfc9ba', '#faf8f2'],
    strands: [
      { color: '#fbf9f3', weight: 0.45, alpha: 0.4 },
      { color: '#cdc7b8', weight: 0.35, alpha: 0.32 },
      { color: '#ffffff', weight: 0.2, alpha: 0.35 },
    ],
    count: 1500,
    len: [8, 24],
    width: [0.7, 1.8],
    dir: 0,
    dirVar: 0.34,
    roughness: [180, 250],
    bump: 0.06,
    repeat: [2, 3],
  },
  'zebra-coat': {
    base: '#efeade',
    blotches: ['#f6f2e8', '#ddd6c6', '#fbf8f0'],
    pattern: { type: 'stripes', color: '#1b1916', count: 8, width: [0.05, 0.085], belly: 0.9, bellyColor: '#efeade', wobble: 0.02, alpha: 0.95 },
    strands: [
      { color: '#ffffff', weight: 0.6, alpha: 0.35 },
      { color: '#d8d2c2', weight: 0.4, alpha: 0.3 },
    ],
    count: 700,
    len: [5, 14],
    width: [0.5, 1.2],
    dir: 0,
    dirVar: 0.2,
    roughness: [170, 245],
    bump: 0.035,
    repeat: [1, 1],
  },
  'hyena-coat': {
    base: '#bd9a63',
    blotches: ['#cbaa74', '#a3824f', '#d9bc8c'],
    pattern: { type: 'spots', color: '#3c2b1a', count: 300, size: [0.012, 0.026], belly: 0.75, alpha: 0.9 },
    strands: [
      { color: '#d8bd8c', weight: 0.4, alpha: 0.4 },
      { color: '#8a6b40', weight: 0.4, alpha: 0.4 },
      { color: '#f0dcb4', weight: 0.2, alpha: 0.3 },
    ],
    count: 1200,
    len: [6, 20],
    width: [0.6, 1.5],
    dir: 0,
    dirVar: 0.45,
    roughness: [180, 250],
    bump: 0.055,
    repeat: [2, 2],
  },
  'deer-coat': {
    base: '#a3713f',
    blotches: ['#b3804a', '#8a5c2f', '#c39258'],
    strands: [
      { color: '#c08a52', weight: 0.4, alpha: 0.4 },
      { color: '#7d5228', weight: 0.4, alpha: 0.4 },
      { color: '#e0b581', weight: 0.2, alpha: 0.3 },
    ],
    count: 1000,
    len: [6, 18],
    width: [0.5, 1.3],
    dir: 0,
    dirVar: 0.3,
    roughness: [180, 248],
    bump: 0.045,
    repeat: [2, 2],
  },
  'fox-coat': {
    base: '#b5551c',
    blotches: ['#c86526', '#93400f', '#d97a34'],
    strands: [
      { color: '#d97a34', weight: 0.42, alpha: 0.45 },
      { color: '#8e3c10', weight: 0.36, alpha: 0.42 },
      { color: '#f0a464', weight: 0.22, alpha: 0.35 },
    ],
    count: 1400,
    len: [7, 22],
    width: [0.6, 1.5],
    dir: 0,
    dirVar: 0.35,
    roughness: [180, 250],
    bump: 0.055,
    repeat: [2, 2],
  },
  'reindeer-coat': {
    base: '#8c6f56',
    blotches: ['#9c8065', '#6f5540', '#b09a80'],
    strands: [
      { color: '#b09479', weight: 0.4, alpha: 0.42 },
      { color: '#63503c', weight: 0.38, alpha: 0.4 },
      { color: '#d6c2a8', weight: 0.22, alpha: 0.32 },
    ],
    count: 1300,
    len: [7, 22],
    width: [0.6, 1.5],
    dir: 0,
    dirVar: 0.4,
    roughness: [190, 250],
    bump: 0.06,
    repeat: [2, 2],
  },
  'arcticfox-coat': {
    base: '#e8e7e0',
    blotches: ['#f4f3ee', '#cfcec6', '#fdfcf8'],
    strands: [
      { color: '#ffffff', weight: 0.5, alpha: 0.4 },
      { color: '#d3d2ca', weight: 0.3, alpha: 0.32 },
      { color: '#f7f7f2', weight: 0.2, alpha: 0.35 },
    ],
    count: 1500,
    len: [7, 22],
    width: [0.6, 1.5],
    dir: 0,
    dirVar: 0.35,
    roughness: [185, 250],
    bump: 0.055,
    repeat: [2, 2],
  },
  'shark-skin': {
    base: '#5f707c',
    blotches: ['#6d7f8b', '#4c5b66', '#7b8d99'],
    pattern: { type: 'countershade', belly: '#eef2f2', alpha: 0.95 },
    strands: [],
    count: 0,
    len: [4, 8],
    width: [0.5, 1],
    dir: 0,
    dirVar: 0.8,
    roughness: [70, 140],
    bump: 0.03,
    repeat: [1, 2],
  },
  'orca-skin': {
    base: '#171a20',
    blotches: ['#20242b', '#0e1014', '#2a2f36'],
    strands: [],
    count: 0,
    len: [4, 8],
    width: [0.4, 0.9],
    dir: 0,
    dirVar: 0.8,
    roughness: [40, 90],
    bump: 0.02,
    repeat: [1, 2],
  },
  'octopus-skin': {
    base: '#b04a1e',
    blotches: ['#c25c25', '#8a3312', '#d97a3a'],
    pattern: { type: 'spots', color: '#6b2409', count: 260, size: [0.01, 0.03], belly: 1.1, alpha: 0.5 },
    strands: [],
    count: 0,
    len: [4, 8],
    width: [0.5, 1.1],
    dir: 0,
    dirVar: 0.8,
    roughness: [90, 160],
    bump: 0.045,
    repeat: [2, 2],
  },
  'boar-coat': {
    base: '#6a5b48',
    blotches: ['#7a6a54', '#514434', '#847459'],
    strands: [
      { color: '#8a7a63', weight: 0.3, alpha: 0.5 },
      { color: '#4a3d2e', weight: 0.35, alpha: 0.5 },
      { color: '#a3937a', weight: 0.2, alpha: 0.4 },
      { color: '#33291e', weight: 0.15, alpha: 0.45 },
    ],
    count: 1400,
    len: [6, 20],
    width: [0.7, 1.7],
    dir: 0,
    dirVar: 0.5,
    roughness: [200, 255],
    bump: 0.06,
    repeat: [2, 2],
  },
};

// 아나콘다 — 광택 비늘 (텍스처 자체가 무늬를 담는다)
const ANACONDA = {
  base: '#4d6335',
  belly: '#cfc79a',
  dorsal: '#141a10',
  flank: '#a06a2c',
  scaleSize: 15,
  rough: [60, 130],
};

const texCache = new Map();
const matCache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(rnd, list) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const item of list) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

// 한 붓을 9방향으로 복제해 타일 이음매를 없앤다
function strokeWrapped(ctx, w, h, s) {
  const margin = s.len + 6;
  const xs = [0];
  const ys = [0];
  if (s.x < margin) xs.push(w);
  if (s.x > w - margin) xs.push(-w);
  if (s.y < margin) ys.push(h);
  if (s.y > h - margin) ys.push(-h);
  for (const dx of xs) {
    for (const dy of ys) {
      ctx.beginPath();
      ctx.moveTo(s.x + dx, s.y + dy);
      const nx = s.x + dx + Math.sin(s.ang) * s.len;
      const ny = s.y + dy + Math.cos(s.ang) * s.len;
      const cx = (s.x + dx + nx) / 2 + Math.cos(s.ang) * s.bend;
      const cy = (s.y + dy + ny) / 2 - Math.sin(s.ang) * s.bend;
      ctx.quadraticCurveTo(cx, cy, nx, ny);
      ctx.stroke();
    }
  }
}

function bellyBand(gc, size, color, center = 0.75, width = 0.13, alpha = 0.95) {
  const grad = gc.createLinearGradient((center - width) * size, 0, (center + width) * size, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  gc.save();
  gc.globalAlpha = alpha;
  gc.fillStyle = grad;
  gc.fillRect((center - width) * size, 0, width * 2 * size, size);
  gc.restore();
}

function paintPattern(gc, gh, gr, recipe, size, rnd) {
  const p = recipe.pattern;
  if (!p) return;
  const alpha = p.alpha ?? 0.9;
  if (p.type === 'stripes') {
    const n = p.count || 12;
    for (let i = 0; i < n; i++) {
      const y0 = ((i + 0.5) / n + (rnd() - 0.5) * 0.02) * size;
      const w = (p.width[0] + rnd() * (p.width[1] - p.width[0])) * size;
      for (const [ctx, style, a, lw] of [
        [gc, p.color, alpha, w],
        [gh, '#000000', 0.3, w * 0.8],
        [gr, '#b4b4b4', 0.25, w],
      ]) {
        ctx.save();
        ctx.strokeStyle = style;
        ctx.globalAlpha = a;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k <= 14; k++) {
          const x = (k / 14) * size;
          const y = y0 + Math.sin(k * 0.8 + i * 1.7) * size * (p.wobble ?? 0.02);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    if (p.bellyColor) bellyBand(gc, size, p.bellyColor, p.belly ?? 0.75, 0.14, 0.95);
  } else if (p.type === 'spots') {
    const n = p.count || 200;
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const rx = (p.size[0] + rnd() * (p.size[1] - p.size[0])) * size;
      const ry = rx * (0.7 + rnd() * 0.6);
      gc.save();
      gc.globalAlpha = alpha;
      gc.fillStyle = p.color;
      gc.beginPath();
      gc.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
      gc.fill();
      gc.restore();
      gh.save();
      gh.globalAlpha = 0.25;
      gh.fillStyle = '#000000';
      gh.beginPath();
      gh.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      gh.fill();
      gh.restore();
    }
  } else if (p.type === 'countershade') {
    bellyBand(gc, size, p.belly || '#eef2f2', 0.75, 0.2, alpha);
    bellyBand(gh, size, 'rgba(255,255,255,0.6)', 0.75, 0.16, 0.5);
  } else if (p.type === 'wrinkles') {
    const n = p.count || 80;
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = size * (0.04 + rnd() * 0.12);
      const ang = (rnd() - 0.5) * 0.5;
      gc.save();
      gc.strokeStyle = p.color || '#5e564d';
      gc.globalAlpha = alpha * (0.5 + rnd() * 0.6);
      gc.lineWidth = 0.6 + rnd() * 1.4;
      gc.beginPath();
      gc.moveTo(x, y);
      gc.quadraticCurveTo(x + len * 0.5, y + Math.sin(i) * 3, x + len, y + Math.sin(ang) * len);
      gc.stroke();
      gc.restore();
      gh.save();
      gh.strokeStyle = '#000000';
      gh.globalAlpha = 0.25;
      gh.lineWidth = 1;
      gh.beginPath();
      gh.moveTo(x, y);
      gh.quadraticCurveTo(x + len * 0.5, y + Math.sin(i) * 3, x + len, y + Math.sin(ang) * len);
      gh.stroke();
      gh.restore();
    }
  } else if (p.type === 'plates') {
    // 큰 판: 가로 세로 이음매
    const rows = 3;
    const cols = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols * size + (rnd() - 0.5) * size * 0.05;
        const y = (r + 0.5) / rows * size + (rnd() - 0.5) * size * 0.05;
        const rx = size / cols * (0.42 + rnd() * 0.12);
        const ry = size / rows * (0.42 + rnd() * 0.12);
        gc.save();
        gc.strokeStyle = p.color || '#4e4e48';
        gc.globalAlpha = alpha * (0.4 + rnd() * 0.4);
        gc.lineWidth = 1.6;
        gc.beginPath();
        gc.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        gc.stroke();
        gc.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
        gc.fill();
        gc.restore();
        gh.save();
        gh.globalAlpha = 0.3;
        gh.strokeStyle = '#000000';
        gh.lineWidth = 2;
        gh.beginPath();
        gh.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        gh.stroke();
        gh.restore();
      }
    }
  }
}

function furCanvases(recipe, size, seed) {
  const rnd = mulberry(seed);
  const color = makeCanvas(size);
  const height = makeCanvas(size);
  const rough = makeCanvas(size);
  const gc = color.getContext('2d');
  const gh = height.getContext('2d');
  const gr = rough.getContext('2d');

  // 바탕
  gc.fillStyle = recipe.base;
  gc.fillRect(0, 0, size, size);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, size, size);
  const rAvg = (recipe.roughness[0] + recipe.roughness[1]) / 2;
  gr.fillStyle = `rgb(${rAvg},${rAvg},${rAvg})`;
  gr.fillRect(0, 0, size, size);

  // 큰 얼룩으로 결을 흩뜨린다
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rad = size * (0.06 + rnd() * 0.2);
    const col = recipe.blotches[i % recipe.blotches.length];
    const g = gc.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gc.globalAlpha = 0.16 + rnd() * 0.16;
    gc.fillStyle = g;
    gc.beginPath();
    gc.arc(x, y, rad, 0, Math.PI * 2);
    gc.fill();
    gc.globalAlpha = 1;
  }

  paintPattern(gc, gh, gr, recipe, size, rnd);

  // 털가닥
  const count = Math.round((recipe.count || 0) * (size / 256) ** 1.5);
  for (let i = 0; i < count; i++) {
    const s = {
      x: rnd() * size,
      y: rnd() * size,
      len: (recipe.len[0] + rnd() * (recipe.len[1] - recipe.len[0])) * (size / 256),
      ang: (rnd() - 0.5) * 2 * recipe.dirVar,
      bend: (rnd() - 0.5) * 4 * (size / 256),
    };
    const w = recipe.width[0] + rnd() * (recipe.width[1] - recipe.width[0]);
    const pickStrand = rnd() < 0.88 ? weighted(rnd, recipe.strands) : recipe.strands[0];
    gc.strokeStyle = pickStrand.color;
    gc.globalAlpha = pickStrand.alpha * (0.55 + rnd() * 0.6);
    gc.lineWidth = w;
    gc.lineCap = 'round';
    strokeWrapped(gc, size, size, s);
    gc.globalAlpha = 1;

    // 높이: 밝은 가닥은 솟고 어두운 가닥은 골
    const up = rnd() < 0.62;
    gh.strokeStyle = up ? '#ffffff' : '#000000';
    gh.globalAlpha = 0.16 + rnd() * 0.2;
    gh.lineWidth = w * 1.15;
    gh.lineCap = 'round';
    strokeWrapped(gh, size, size, s);
    gh.globalAlpha = 1;

    const rv = Math.round(recipe.roughness[0] + rnd() * (recipe.roughness[1] - recipe.roughness[0]));
    gr.strokeStyle = `rgb(${rv},${rv},${rv})`;
    gr.globalAlpha = 0.2 + rnd() * 0.25;
    gr.lineWidth = w * 1.3;
    gr.lineCap = 'round';
    strokeWrapped(gr, size, size, s);
    gr.globalAlpha = 1;
  }

  // 마모 얼룩 (거칠기 변화)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rad = size * (0.05 + rnd() * 0.16);
    const v = Math.round(recipe.roughness[1] * 0.96);
    const g = gr.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gr.fillStyle = g;
    gr.beginPath();
    gr.arc(x, y, rad, 0, Math.PI * 2);
    gr.fill();
  }

  return { color, height, rough };
}

function scaleCanvases(size, seed) {
  const rnd = mulberry(seed);
  const color = makeCanvas(size);
  const height = makeCanvas(size);
  const rough = makeCanvas(size);
  const gc = color.getContext('2d');
  const gh = height.getContext('2d');
  const gr = rough.getContext('2d');

  gc.fillStyle = ANACONDA.base;
  gc.fillRect(0, 0, size, size);
  gh.fillStyle = '#606060';
  gh.fillRect(0, 0, size, size);
  gr.fillStyle = '#4a4a4a';
  gr.fillRect(0, 0, size, size);

  // 몸통 방향: u(가로)가 둘레, u=0.25가 등, u=0.75가 배
  const U = (v) => v * size;
  // 배쪽 크림색 띠
  const bellyGrad = gc.createLinearGradient(U(0.63), 0, U(0.87), 0);
  bellyGrad.addColorStop(0, 'rgba(207,199,154,0)');
  bellyGrad.addColorStop(0.5, 'rgba(207,199,154,0.92)');
  bellyGrad.addColorStop(1, 'rgba(207,199,154,0)');
  gc.fillStyle = bellyGrad;
  gc.fillRect(U(0.6), 0, U(0.3), size);

  // 등면 큰 검은 반점
  for (let i = 0; i < 5; i++) {
    const cx = U(0.25) + (rnd() - 0.5) * size * 0.09;
    const cy = ((i + 0.5) / 5) * size + (rnd() - 0.5) * size * 0.05;
    const w = size * (0.11 + rnd() * 0.05);
    const h = size * (0.1 + rnd() * 0.06);
    gc.save();
    gc.translate(cx, cy);
    gc.fillStyle = ANACONDA.dorsal;
    gc.beginPath();
    gc.ellipse(0, 0, w, h, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
    gc.fill();
    gc.restore();
  }
  // 옆구리 주황 갈색 타원
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? 0.13 : 0.37;
    const cx = U(side) + (rnd() - 0.5) * size * 0.05;
    const cy = ((i + 0.5) / 10) * size + (rnd() - 0.5) * size * 0.04;
    gc.save();
    gc.translate(cx, cy);
    gc.fillStyle = ANACONDA.flank;
    gc.globalAlpha = 0.75;
    gc.beginPath();
    gc.ellipse(0, 0, size * (0.035 + rnd() * 0.02), size * (0.045 + rnd() * 0.025), (rnd() - 0.5) * 0.5, 0, Math.PI * 2);
    gc.fill();
    gc.restore();
  }

  // 비늘 세포 — 마름모꼴 격자
  const n = ANACONDA.scaleSize;
  const cell = size / n;
  for (let ry = 0; ry < n; ry++) {
    for (let rx = 0; rx < n; rx++) {
      const cx = (rx + (ry % 2 ? 0.5 : 0)) * cell + cell * 0.5;
      const cy = ry * cell + cell * 0.5;
      const w = cell * 0.62;
      const h = cell * 0.72;
      // 색: 세포마다 밝기 변화
      const l = 0.86 + rnd() * 0.3;
      gc.save();
      gc.globalAlpha = 0.16;
      gc.globalCompositeOperation = 'overlay';
      gc.fillStyle = l > 1 ? '#dfe6c0' : '#0d1409';
      gc.beginPath();
      gc.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      gc.fill();
      gc.restore();

      // 높이: 가운데 볼록
      const g = gh.createRadialGradient(cx, cy, 0, cx, cy, w);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      gh.fillStyle = g;
      gh.beginPath();
      gh.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      gh.fill();

      // 거칠기: 비늘 가운데는 유광, 테두리는 살짝 거침
      const rg = gr.createRadialGradient(cx, cy, 0, cx, cy, w);
      rg.addColorStop(0, 'rgba(40,40,40,0.9)');
      rg.addColorStop(0.8, 'rgba(90,90,90,0.5)');
      rg.addColorStop(1, 'rgba(150,150,150,0.5)');
      gr.fillStyle = rg;
      gr.beginPath();
      gr.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      gr.fill();
    }
  }

  // 비늘 경계선
  gc.save();
  gc.globalAlpha = 0.22;
  gc.strokeStyle = '#1b2413';
  gc.lineWidth = Math.max(1, size / 320);
  for (let ry = 0; ry < n; ry++) {
    for (let rx = 0; rx < n; rx++) {
      const cx = (rx + (ry % 2 ? 0.5 : 0)) * cell + cell * 0.5;
      const cy = ry * cell + cell * 0.5;
      gc.beginPath();
      gc.ellipse(cx, cy, cell * 0.62, cell * 0.72, 0, 0, Math.PI * 2);
      gc.stroke();
    }
  }
  gc.restore();

  return { color, height, rough };
}

export function furMaps(key) {
  if (texCache.has(key)) return texCache.get(key);
  const recipe = RECIPES[key];
  if (!recipe) throw new Error('알 수 없는 털 재질: ' + key);
  const size = 256;
  const seed = key.split('').reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7);
  const canv = furCanvases(recipe, size, seed);
  const out = {
    map: tex(canv.color, true),
    bump: tex(canv.height, false),
    rough: tex(canv.rough, false),
    bumpScale: recipe.bump,
    repeat: recipe.repeat || [2, 2],
  };
  out.map.repeat.set(out.repeat[0], out.repeat[1]);
  out.bump.repeat.set(out.repeat[0], out.repeat[1]);
  out.rough.repeat.set(out.repeat[0], out.repeat[1]);
  texCache.set(key, out);
  return out;
}

export function scaleMaps() {
  if (texCache.has('anaconda-skin')) return texCache.get('anaconda-skin');
  const size = 256;
  const canv = scaleCanvases(size, 991);
  const out = {
    map: tex(canv.color, true),
    bump: tex(canv.height, false),
    rough: tex(canv.rough, false),
    bumpScale: 0.055,
  };
  texCache.set('anaconda-skin', out);
  return out;
}

/** 털 재질 (vertex color × 텍스처) */
export function furMaterial(key, opts = {}) {
  const matKey = `${key}|${opts.roughness ?? 1}|${opts.flat ?? false}|${opts.metalness ?? 0}`;
  let m = matCache.get(matKey);
  if (m) return m;
  const maps = furMaps(key);
  m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: maps.map,
    bumpMap: maps.bump,
    bumpScale: maps.bumpScale,
    roughnessMap: maps.rough,
    roughness: opts.roughness ?? 1,
    metalness: opts.metalness ?? 0,
    flatShading: !!opts.flat,
  });
  matCache.set(matKey, m);
  return m;
}

/** 비늘 재질 — 젖은 광택 */
export function scaleMaterial(opts = {}) {
  const matKey = `anaconda|${opts.roughness ?? 1}`;
  let m = matCache.get(matKey);
  if (m) return m;
  const maps = scaleMaps();
  m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: maps.map,
    bumpMap: maps.bump,
    bumpScale: maps.bumpScale,
    roughnessMap: maps.rough,
    roughness: opts.roughness ?? 0.85,
    metalness: 0.18,
  });
  matCache.set(matKey, m);
  return m;
}

/** 매끈한 피부 재질 (상어·범고래 등 — 낮은 거칠기) */
export function skinMaterial(key, opts = {}) {
  const matKey = `skin|${key}|${opts.roughness ?? 0.8}|${opts.metalness ?? 0.12}`;
  let m = matCache.get(matKey);
  if (m) return m;
  const maps = furMaps(key);
  m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: maps.map,
    bumpMap: maps.bump,
    bumpScale: maps.bumpScale,
    roughnessMap: maps.rough,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0.12,
  });
  matCache.set(matKey, m);
  return m;
}
