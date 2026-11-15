// 아레나 — 지형별(사바나 · 바다 · 숲 · 설원) 세계 생성
// 바닥/식생/조명/안개/원경을 지도마다 다시 만들고, 하늘·태양은 재사용한다.
import THREE from './three.js?v=20261115d';
import { merge, sweep, unitSphere, unitCone, unitCyl, vertexMaterial } from './sculpt.js?v=20261115d';
import { clamp, fbm, rand, smoothstep, TAU, makeSoftCircleTexture } from './util.js?v=20261115d';

export const ARENA_RADIUS = 40;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = (r = 1, g = r, b = r) => new THREE.Color(r, g, b);

// ── 지도 정의 ───────────────────────────────────────────────
export const MAPS = {
  savanna: {
    id: 'savanna',
    name: '사바나',
    emoji: '🌾',
    tagline: '붉은 흙과 황금 초원',
    accent: '#e8b04b',
    desc: '아카시아 그늘과 마른 풀, 뜨거운 햇살이 내리쬐는 초원.',
    sky: { top: 0x2f6194, mid: 0x9ec1d6, bottom: 0xffd39a },
    fog: { color: 0xded0ae, density: 0.0135 },
    sun: { color: 0xfff0cc, intensity: 2.2, pos: [38, 44, 22] },
    hemi: { sky: 0xbcd6f6, ground: 0x6d5a33, intensity: 1.05 },
    amb: { color: 0xffe6bf, intensity: 0.26 },
    motes: { color: 0xffe9b8, count: 220 },
    sunSprite: { color: 0xfff0c0, opacity: 0.5 },
    enemies: 'savanna',
    ground: {
      radius: 84,
      height: (x, z, r) => (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 5.4 * smoothstep(30, 74, r) + (fbm(x * 0.16, z * 0.16, 2) - 0.5) * 0.3,
      color: (x, z, r, h) => {
        const c = new THREE.Color(0x9c8348);
        const patch = fbm(x * 0.08 + 11, z * 0.08 - 7, 3);
        c.lerp(new THREE.Color(0xb9a15c), fbm(x * 0.3, z * 0.3, 2));
        c.lerp(new THREE.Color(0x6f7c3d), clamp((patch - 0.46) * 1.9, 0, 0.6));
        c.lerp(new THREE.Color(0x8e5f36), smoothstep(18, 2, r) * 0.5);
        c.lerp(new THREE.Color(0xb08a5c), smoothstep(52, 78, r) * 0.4);
        return c;
      },
      texture: 'dry',
      texRepeat: 20,
      roughness: 0.99,
    },
    ridge: { color: 0x9a8a6a, far: 0xbdb096, height: [24, 58], radius: 175 },
  },
  ocean: {
    id: 'ocean',
    name: '바다',
    emoji: '🌊',
    tagline: '산호초와 파도',
    accent: '#4aa7c0',
    desc: '얕은 모래톱과 산호초, 파도가 부서지는 해안.',
    sky: { top: 0x3d86b8, mid: 0xb3dcea, bottom: 0xf3f0d8 },
    fog: { color: 0xc3dde6, density: 0.0105 },
    sun: { color: 0xfff8e0, intensity: 2.25, pos: [26, 52, 18] },
    hemi: { sky: 0xd8f0ff, ground: 0x6b7f7a, intensity: 1.2 },
    amb: { color: 0xdff4ff, intensity: 0.3 },
    motes: { color: 0xd8f4ff, count: 200 },
    sunSprite: { color: 0xfffbe8, opacity: 0.55 },
    enemies: 'ocean',
    water: true,
    ground: {
      radius: 86,
      height: (x, z, r) => (fbm(x * 0.06, z * 0.06, 3) - 0.5) * 0.7 * smoothstep(24, 40, r) - 7.5 * smoothstep(43, 70, r),
      color: (x, z, r, h) => {
        const c = new THREE.Color(0xd9c79c);
        c.lerp(new THREE.Color(0xefe0b8), fbm(x * 0.22, z * 0.22, 2));
        c.lerp(new THREE.Color(0xb9a678), smoothstep(30, 44, r) * 0.6);
        c.lerp(new THREE.Color(0x7f9a90), smoothstep(46, 62, r) * 0.75);
        c.lerp(new THREE.Color(0x4d7f7c), smoothstep(58, 80, r) * 0.7);
        return c;
      },
      texture: 'sand',
      texRepeat: 26,
      roughness: 0.95,
    },
    ridge: { color: 0x86a9b8, far: 0xb9d2dc, height: [18, 46], radius: 190 },
  },
  forest: {
    id: 'forest',
    name: '숲',
    emoji: '🌲',
    tagline: '이끼와 나무 그늘',
    accent: '#6f9a4a',
    desc: '빽빽한 나무와 이끼, 스며드는 햇빛만이 길을 밝힙니다.',
    sky: { top: 0x2c4b47, mid: 0x7ba382, bottom: 0xcfd7a8 },
    fog: { color: 0x7c9070, density: 0.019 },
    sun: { color: 0xfff2c8, intensity: 1.75, pos: [26, 52, 14] },
    hemi: { sky: 0xbfe0c4, ground: 0x3b3a24, intensity: 0.95 },
    amb: { color: 0xcfe6b8, intensity: 0.3 },
    motes: { color: 0xd8ffb0, count: 180 },
    sunSprite: { color: 0xf6ffd8, opacity: 0.32 },
    enemies: 'forest',
    ground: {
      radius: 84,
      height: (x, z, r) => (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 4.2 * smoothstep(28, 72, r) + (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 0.4,
      color: (x, z, r, h) => {
        const c = new THREE.Color(0x53603a);
        c.lerp(new THREE.Color(0x6d7a45), fbm(x * 0.14, z * 0.14, 3));
        c.lerp(new THREE.Color(0x3f4c2c), clamp((fbm(x * 0.3 + 5, z * 0.3, 2) - 0.45) * 1.6, 0, 0.7));
        c.lerp(new THREE.Color(0x7a6a42), smoothstep(16, 4, r) * 0.3);
        return c;
      },
      texture: 'moss',
      texRepeat: 22,
      roughness: 1,
    },
    ridge: { color: 0x4a5c42, far: 0x6d8264, height: [26, 54], radius: 165 },
  },
  snow: {
    id: 'snow',
    name: '설원',
    emoji: '❄️',
    tagline: '눈과 얼음의 벌판',
    accent: '#a8cfe8',
    desc: '눈보라가 스치는 하얀 벌판, 소나무 숲이 바람을 막습니다.',
    sky: { top: 0x3d6a92, mid: 0xa8c4d8, bottom: 0xe8eef2 },
    fog: { color: 0xd8e4ec, density: 0.016 },
    sun: { color: 0xdff0ff, intensity: 1.85, pos: [30, 40, 26] },
    hemi: { sky: 0xd6ecff, ground: 0x8a98a8, intensity: 1.25 },
    amb: { color: 0xdceaf6, intensity: 0.36 },
    motes: { color: 0xffffff, count: 300, falling: true },
    sunSprite: { color: 0xe8f4ff, opacity: 0.35 },
    enemies: 'snow',
    ground: {
      radius: 84,
      height: (x, z, r) => (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 3.6 * smoothstep(26, 70, r) + (fbm(x * 0.19, z * 0.19, 2) - 0.5) * 0.35,
      color: (x, z, r, h) => {
        const c = new THREE.Color(0xe6eef4);
        c.lerp(new THREE.Color(0xf7fbfd), fbm(x * 0.2, z * 0.2, 2));
        c.lerp(new THREE.Color(0xc4d6e2), clamp((fbm(x * 0.1 + 3, z * 0.1, 2) - 0.5) * 1.4, 0, 0.6));
        c.lerp(new THREE.Color(0x9fb4c6), smoothstep(46, 78, r) * 0.5);
        return c;
      },
      texture: 'snow',
      texRepeat: 18,
      roughness: 0.92,
    },
    ridge: { color: 0x9fb3c6, far: 0xc8d6e2, height: [30, 62], radius: 175 },
  },
};

// ── 바닥 텍스처 ─────────────────────────────────────────────
const groundTexCache = new Map();
function groundTexture(kind) {
  if (groundTexCache.has(kind)) return groundTexCache.get(kind);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const blobs = {
    dry: ['#c8b076', '#a08a52', '#e0c98c'],
    sand: ['#d8c69c', '#c0ab7e', '#efe2bb'],
    moss: ['#8f9c60', '#6a7a44', '#b0bb80'],
    snow: ['#ffffff', '#dbe6ee', '#f4f9fc'],
  }[kind] || ['#cccccc'];
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 18 + Math.random() * 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, blobs[i % blobs.length]);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 0.22;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const grains = kind === 'snow' ? 2600 : 12000;
  for (let i = 0; i < grains; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const b = 150 + Math.random() * 105;
    g.fillStyle = `rgba(${b},${b - 3},${b - 10},${0.06 + Math.random() * 0.16})`;
    g.fillRect(x, y, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  if (kind === 'sand') {
    g.strokeStyle = 'rgba(160,140,100,0.25)';
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      const y = Math.random() * size;
      g.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.12 + i) * 4);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  groundTexCache.set(kind, tex);
  return tex;
}

// ── 풀/잎 다발 지오메트리 ──────────────────────────────────
function bladeTuft({ blades = 6, height = 0.9, spread = 0.3, width = 0.06, bend = 0.35, base = 0x4a5a26, tip = 0x9aa54e }) {
  const positions = [];
  const colors = [];
  const c0 = new THREE.Color(base);
  const c1 = new THREE.Color(tip);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU + Math.random() * 0.6;
    const lean = spread * (0.4 + Math.random() * 0.9);
    const h = height * (0.6 + Math.random() * 0.7);
    const bx = Math.cos(a) * 0.03;
    const bz = Math.sin(a) * 0.03;
    const mx = Math.cos(a) * lean * 0.5;
    const mz = Math.sin(a) * lean * 0.5;
    const tx = Math.cos(a) * lean;
    const tz = Math.sin(a) * lean;
    const w = width * (0.7 + Math.random() * 0.6);
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    // 아래 삼각형
    const vb = [
      [bx - px, 0, bz - pz],
      [bx + px, 0, bz + pz],
      [mx, h * 0.55, mz],
    ];
    const vt = [
      [mx - px * 0.55, h * 0.55, mz - pz * 0.55],
      [mx + px * 0.55, h * 0.55, mz + pz * 0.55],
      [tx, h, tz],
    ];
    for (const tri of [vb, vt]) {
      for (const p of tri) {
        positions.push(p[0], p[1], p[2]);
      }
    }
    const cb = c0.clone().lerp(c1, 0.15);
    const ct = c1.clone();
    for (let k = 0; k < 3; k++) colors.push(cb.r, cb.g, cb.b);
    for (let k = 0; k < 3; k++) colors.push(ct.r, ct.g, ct.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function instancedTufts(geo, mat, count, fn) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const { x, z, s, rot, tint } = fn(i);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.set(tint ?? 0xffffff);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

// 먼 지평선 — 겹겹의 능선 커튼 (종이 삼각형 대신 노이즈 실루엣)
function ridgeCurtain({ radius, height, color, seed = 3, segments = 140, yBase = -8 }) {
  const pos = [];
  const col = [];
  const top = new THREE.Color(color);
  const fogC = new THREE.Color(0xd9cdb0);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const h0 = height[0] + fbm(Math.cos(a0) * 2 + seed, Math.sin(a0) * 2 + seed, 4) * (height[1] - height[0]) * 1.6;
    const h1 = height[0] + fbm(Math.cos(a1) * 2 + seed, Math.sin(a1) * 2 + seed, 4) * (height[1] - height[0]) * 1.6;
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    // 아래-위 사각형 (뒷면 안 보이게 양쪽 감기)
    pos.push(x0, yBase, z0, x1, yBase, z1, x1, yBase + h1, z1);
    pos.push(x0, yBase, z0, x1, yBase + h1, z1, x0, yBase + h0, z0);
    const cBottom = top.clone().lerp(fogC, 0.85);
    const cTop = top.clone().lerp(fogC, 0.35);
    for (let k = 0; k < 3; k++) {
      col.push(cBottom.r, cBottom.g, cBottom.b);
    }
    for (let k = 0; k < 3; k++) {
      col.push(cTop.r, cTop.g, cTop.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}


// 스폰 지점(0,0,8)과 그 뒤 카메라 자리를 비워 둔다 — 동물 앞을 가리는 바위/수풀 방지
function clearOfSpawn(x, z, pad = 3.4) {
  const dx = x - 0;
  const dz = z - 8;
  if (dx * dx + dz * dz < pad * pad) return false;
  // 카메라가 서는 뒤쪽 통로
  if (Math.abs(x) < 3.0 && z > 8 && z < 20) return false;
  return true;
}

// ── 나무 · 바위 · 산호 조각들 ───────────────────────────────
function trunkPart(x, y, z, h, r0, r1, color, lean = 0, leanZ = 0) {
  const sections = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sections.push({
      p: V(x + Math.sin(lean) * h * t, y + h * t, z + Math.sin(leanZ) * h * t),
      rx: r0 + (r1 - r0) * t,
      ry: r0 + (r1 - r0) * t,
    });
  }
  return { geo: sweep(sections, { radial: 7, capStart: false, capEnd: true, colorFn: () => color }) };
}

function canopyPart(x, y, z, rx, ry, rz, color, seg = 8) {
  return { geo: unitSphere(seg), pos: [x, y, z], scale: [rx, ry, rz], color };
}

// 사바나 아카시아
function acaciaParts(x, z, s, colorFn) {
  const parts = [];
  const h = rand(4.2, 6.4) * s;
  parts.push(trunkPart(x, 0, z, h * 0.72, 0.3 * s, 0.2 * s, new THREE.Color(0x655034)));
  // 가지
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * TAU + rand(-0.4, 0.4);
    const len = rand(1.2, 2.2) * s;
    parts.push({
      geo: unitCyl(6),
      pos: [x + Math.cos(a) * len * 0.5, h * 0.82, z + Math.sin(a) * len * 0.5],
      rot: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0],
      scale: [0.12 * s, len, 0.12 * s],
      color: new THREE.Color(0x5d4930),
    });
  }
  // 우산형 잎
  const layers = 3;
  for (let l = 0; l < layers; l++) {
    const cw = rand(2.4, 3.6) * s;
    parts.push(canopyPart(x + rand(-0.7, 0.7), h * 0.9 + l * 0.32 * s, z + rand(-0.7, 0.7), cw, 0.42 * s, cw * rand(0.85, 1.05), colorFn(l), 7));
  }
  return parts;
}

// 숲 나무
function forestTreeParts(x, z, s, colorFn) {
  const parts = [];
  const h = rand(5, 9) * s;
  parts.push(trunkPart(x, 0, z, h, 0.32 * s, 0.16 * s, new THREE.Color(0x4a3b28), rand(-0.05, 0.05), rand(-0.05, 0.05)));
  const layers = 3 + Math.floor(Math.random() * 2);
  for (let l = 0; l < layers; l++) {
    const cw = rand(1.9, 3.2) * s * (1 - l * 0.16);
    parts.push(canopyPart(x + rand(-1.2, 1.2), h * 0.66 + l * 0.9 * s, z + rand(-1.2, 1.2), cw, cw * 0.72, cw, colorFn(l), 7));
  }
  return parts;
}

// 침엽수 (설원 · 숲)
function pineParts(x, z, s, snow) {
  const parts = [];
  const h = rand(4.6, 8.4) * s;
  parts.push(trunkPart(x, 0, z, h * 0.9, 0.24 * s, 0.1 * s, new THREE.Color(0x453423)));
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const th = (h * 0.4) * (1 - t * 0.18);
    const tr = (1.5 - t * 0.28) * s;
    const y = h * 0.28 + t * h * 0.17;
    parts.push({
      geo: unitCone(7),
      pos: [x, y, z],
      scale: [tr, th, tr],
      color: snow ? new THREE.Color(0x2f4a3e).lerp(new THREE.Color(0xf2f8fb), 0.35 + t * 0.08) : new THREE.Color(0x2d4a30),
    });
    if (snow) {
      parts.push({
        geo: unitCone(7),
        pos: [x, y + th * 0.62, z],
        scale: [tr * 0.72, th * 0.42, tr * 0.72],
        color: new THREE.Color(0xf4f9fc),
      });
    }
  }
  return parts;
}

// 야자수
function palmParts(x, z, s) {
  const parts = [];
  const h = rand(4.5, 7) * s;
  const lean = rand(-0.25, 0.25);
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5;
    const t1 = (i + 1) / 5;
    parts.push({
      geo: unitCyl(7),
      pos: [x + Math.sin(lean) * h * (t0 + t1) * 0.5, h * (t0 + t1) * 0.5, z + Math.cos(lean * 0.4) * h * 0.02 * i],
      rot: [0, 0, -lean],
      scale: [0.24 * s * (1 - t0 * 0.4), h / 5, 0.24 * s * (1 - t0 * 0.4)],
      color: new THREE.Color(0x6a5334),
    });
  }
  const topX = x + Math.sin(lean) * h;
  const topZ = z;
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * TAU;
    parts.push({
      geo: unitCone(3),
      pos: [topX + Math.cos(a) * 0.9 * s, h + rand(-0.1, 0.25), topZ + Math.sin(a) * 0.9 * s],
      rot: [Math.cos(a) * 0.7, -a, Math.sin(a) * 0.7],
      scale: [0.34 * s, 2.1 * s, 0.06 * s],
      color: new THREE.Color(0x3f6b32).lerp(new THREE.Color(0x6f9a44), Math.random() * 0.7),
    });
  }
  return parts;
}

// 산호 (가지형)
function coralParts(x, y, z, s, color) {
  const parts = [];
  parts.push({
    geo: unitCyl(5),
    pos: [x, y + 0.3 * s, z],
    scale: [0.12 * s, 0.6 * s, 0.12 * s],
    color: new THREE.Color(color).multiplyScalar(0.8),
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const len = rand(0.4, 0.8) * s;
    parts.push({
      geo: unitCyl(5),
      pos: [x + Math.cos(a) * len * 0.3, y + 0.7 * s + len * 0.3, z + Math.sin(a) * len * 0.3],
      rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7],
      scale: [0.07 * s, len, 0.07 * s],
      color: new THREE.Color(color).lerp(new THREE.Color(0xfff0e0), Math.random() * 0.3),
    });
  }
  return parts;
}

function bushParts(x, z, s, color) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    parts.push({
      geo: unitSphere(6),
      pos: [x + rand(-0.3, 0.3) * s, 0.22 * s + rand(0, 0.2) * s, z + rand(-0.3, 0.3) * s],
      scale: [rand(0.3, 0.55) * s, rand(0.25, 0.4) * s, rand(0.3, 0.55) * s],
      color: new THREE.Color(color).multiplyScalar(0.85 + Math.random() * 0.3),
    });
  }
  return parts;
}

function rockParts(x, z, s, color) {
  const parts = [];
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    parts.push({
      geo: unitSphere(5),
      pos: [x + rand(-0.4, 0.4) * s, 0.18 * s, z + rand(-0.4, 0.4) * s],
      rot: [Math.random(), Math.random() * TAU, Math.random()],
      scale: [rand(0.5, 1.2) * s, rand(0.3, 0.8) * s, rand(0.5, 1.2) * s],
      color: new THREE.Color(color).multiplyScalar(0.85 + Math.random() * 0.3),
    });
  }
  return parts;
}

// ── 바다 물 ─────────────────────────────────────────────────
function makeWater() {
  const geo = new THREE.PlaneGeometry(760, 760, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x1d6a80) },
      uShallow: { value: new THREE.Color(0x63c2c4) },
    },
  ]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      void main(){
        vec3 p = position;
        float w1 = sin(p.x * 0.09 + uTime * 1.1) * 0.09;
        float w2 = sin(p.z * 0.075 - uTime * 0.85) * 0.07;
        float w3 = sin((p.x + p.z) * 0.045 + uTime * 0.55) * 0.1;
        p.y += w1 + w2 + w3;
        vWave = w1 + w2 + w3;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec3 vWorld;
      varying float vWave;
      void main(){
        float d = length(vWorld.xz);
        vec3 col = mix(uShallow, uDeep, smoothstep(26.0, 190.0, d));
        float sparkle = pow(max(0.0, sin(vWorld.x * 0.55 + uTime * 1.7) * sin(vWorld.z * 0.5 - uTime * 1.3)), 10.0);
        col += vec3(0.5, 0.6, 0.55) * sparkle * 0.7;
        col += vWave * 0.16;
        gl_FragColor = vec4(col, 0.9);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.75;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

function foamRing() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
    g.beginPath();
    g.arc(x, y, Math.random() * 3.2, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  const geo = new THREE.RingGeometry(43.5, 47.5, 96);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.42;
  return { mesh, tex, mat };
}

// ── 지도 조립 ───────────────────────────────────────────────
function buildMap(map, opts) {
  const mobile = !!opts.mobile;
  const g = new THREE.Group();
  const cleanups = [];
  const updaters = [];

  // 바닥
  const radius = map.ground.radius || 84;
  const segs = mobile ? 80 : 120;
  const geo = new THREE.CircleGeometry(radius, segs, 0, TAU);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const h = map.ground.height(x, z, r);
    pos.setY(i, h);
    tmp.copy(map.ground.color(x, z, r, h));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = groundTexture(map.ground.texture).clone();
  tex.needsUpdate = true;
  tex.repeat.set(map.ground.texRepeat, map.ground.texRepeat);
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: map.ground.roughness, metalness: 0 });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  g.add(ground);
  cleanups.push(() => {
    geo.dispose();
    groundMat.dispose();
    tex.dispose();
  });

  // 아레나 경계
  const ringGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.45, ARENA_RADIUS + 0.15, 96);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: map.id === 'ocean' ? 0xffffff : 0xffd489, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.04;
  g.add(ring);
  cleanups.push(() => {
    ringGeo.dispose();
    ringMat.dispose();
  });

  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, flatShading: false });

  // ── 지형별 식생 ────────────────────────────────────────
  const addMerged = (parts) => {
    // 스폰 지점과 카메라 통로를 가리는 조형물은 걸러낸다
    const kept = parts.filter((pp) => !pp.pos || clearOfSpawn(pp.pos[0], pp.pos[2]));
    if (!kept.length) return;
    const m = new THREE.Mesh(merge(kept), vegMat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    g.add(m);
  };

  if (map.id === 'savanna') {
    const grassGeo = bladeTuft({ blades: 7, height: 1.05, spread: 0.28, width: 0.055, base: 0x6b7033, tip: 0xc9b76a });
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const count = mobile ? 900 : 1900;
    const grass = instancedTufts(grassGeo, grassMat, count, () => {
      const a = Math.random() * TAU;
      const r = 2 + Math.sqrt(Math.random()) * 66;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.6 + Math.random() * 1.3, rot: Math.random() * TAU, tint: new THREE.Color().setHSL(0.13 + Math.random() * 0.06, 0.35, 0.42 + Math.random() * 0.22) };
    });
    g.add(grass);
    cleanups.push(() => {
      grassGeo.dispose();
      grassMat.dispose();
    });

    const parts = [];
    const leaf = (l) => new THREE.Color(0x4a6b31).lerp(new THREE.Color(0x6f8c42), l * 0.4 + Math.random() * 0.25);
    for (let i = 0; i < (mobile ? 12 : 18); i++) {
      const a = (i / 18) * TAU + rand(-0.2, 0.2);
      const r = rand(30, 74);
      parts.push(...acaciaParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.85, 1.25), leaf));
    }
    // 안쪽에도 몇 그루
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      const r = rand(26, 34);
      parts.push(...acaciaParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.7, 0.9), leaf));
    }
    for (let i = 0; i < (mobile ? 26 : 48); i++) {
      const a = Math.random() * TAU;
      const r = rand(6, 46);
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      if (!clearOfSpawn(px, pz)) continue;
      parts.push(...bushParts(px, pz, rand(0.5, 1.1), 0x6d7c3a));
    }
    for (let i = 0; i < (mobile ? 14 : 24); i++) {
      const a = Math.random() * TAU;
      const r = rand(10, 60);
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      if (!clearOfSpawn(px, pz, 4.2)) continue;
      parts.push(...rockParts(px, pz, rand(0.6, 1.9), 0x8a8274));
    }
    addMerged(parts);
  }

  if (map.id === 'ocean') {
    // 물
    const water = makeWater();
    g.add(water.mesh);
    cleanups.push(() => {
      water.mesh.geometry.dispose();
      water.mesh.material.dispose();
    });
    const foam = foamRing();
    g.add(foam.mesh);
    cleanups.push(() => {
      foam.mesh.geometry.dispose();
      foam.mat.dispose();
      foam.tex.dispose();
    });
    updaters.push((dt, t) => {
      water.uniforms.uTime.value = t;
      foam.tex.offset.x = t * 0.03;
      foam.mat.opacity = 0.55 + Math.sin(t * 1.4) * 0.2;
    });

    // 해초 (인스턴스)
    const kelpGeo = bladeTuft({ blades: 5, height: 2.6, spread: 0.55, width: 0.13, base: 0x2f5a38, tip: 0x6fa060 });
    const kelpMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    const kelpCount = mobile ? 160 : 320;
    const kelp = instancedTufts(kelpGeo, kelpMat, kelpCount, () => {
      const a = Math.random() * TAU;
      const r = 30 + Math.random() * 45;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + Math.random() * 0.9, rot: Math.random() * TAU, tint: new THREE.Color().setHSL(0.32, 0.35, 0.35 + Math.random() * 0.2) };
    });
    g.add(kelp);
    cleanups.push(() => {
      kelpGeo.dispose();
      kelpMat.dispose();
    });

    const parts = [];
    for (let i = 0; i < (mobile ? 9 : 14); i++) {
      const a = (i / 14) * TAU + rand(-0.2, 0.2);
      const r = rand(34, 60);
      parts.push(...palmParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.85, 1.2)));
    }
    for (let i = 0; i < (mobile ? 30 : 60); i++) {
      const a = Math.random() * TAU;
      const r = rand(16, 62);
      const palette = [0xe2705a, 0xe8a23c, 0xcf5f96, 0x9a6ad0, 0x58b6a0];
      parts.push(...coralParts(Math.cos(a) * r, Math.max(0, -0.4 - r * 0.02), Math.sin(a) * r, rand(0.6, 1.3), palette[i % palette.length]));
    }
    for (let i = 0; i < (mobile ? 16 : 26); i++) {
      const a = Math.random() * TAU;
      const r = rand(8, 58);
      parts.push(...rockParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.5, 1.6), 0x8c9a92));
    }
    addMerged(parts);
  }

  if (map.id === 'forest') {
    const fernGeo = bladeTuft({ blades: 8, height: 1.2, spread: 0.45, width: 0.09, base: 0x2f4a26, tip: 0x7fa050 });
    const fernMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const fernCount = mobile ? 700 : 1500;
    const ferns = instancedTufts(fernGeo, fernMat, fernCount, () => {
      const a = Math.random() * TAU;
      const r = 2 + Math.sqrt(Math.random()) * 68;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + Math.random() * 1.1, rot: Math.random() * TAU, tint: new THREE.Color().setHSL(0.26 + Math.random() * 0.05, 0.4, 0.36 + Math.random() * 0.2) };
    });
    g.add(ferns);
    cleanups.push(() => {
      fernGeo.dispose();
      fernMat.dispose();
    });

    const parts = [];
    const leaf = (l) => new THREE.Color(0x2f5228).lerp(new THREE.Color(0x5d8236), l * 0.3 + Math.random() * 0.3);
    for (let i = 0; i < (mobile ? 34 : 58); i++) {
      const a = Math.random() * TAU;
      const r = 14 + Math.sqrt(Math.random()) * 62;
      parts.push(...forestTreeParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.8, 1.3), leaf));
    }
    for (let i = 0; i < (mobile ? 30 : 60); i++) {
      const a = Math.random() * TAU;
      const r = rand(5, 52);
      parts.push(...bushParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.5, 1.2), 0x466a30));
    }
    // 쓰러진 통나무
    for (let i = 0; i < (mobile ? 5 : 9); i++) {
      const a = Math.random() * TAU;
      const r = rand(10, 40);
      const len = rand(2, 4.5);
      parts.push({
        geo: unitCyl(7),
        pos: [Math.cos(a) * r, 0.28, Math.sin(a) * r],
        rot: [0, Math.random() * TAU, Math.PI / 2],
        scale: [0.32, len, 0.32],
        color: new THREE.Color(0x4a3a26),
      });
      parts.push(...bushParts(Math.cos(a) * r + 0.4, Math.sin(a) * r, 0.5, 0x557a3a));
    }
    for (let i = 0; i < (mobile ? 10 : 18); i++) {
      const a = Math.random() * TAU;
      const r = rand(8, 46);
      parts.push(...rockParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.4, 1.2), 0x6f7a66));
    }
    addMerged(parts);
  }

  if (map.id === 'snow') {
    const grassGeo = bladeTuft({ blades: 5, height: 0.65, spread: 0.3, width: 0.05, base: 0x7d8a92, tip: 0xe8f0f6 });
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    const count = mobile ? 600 : 1200;
    const grass = instancedTufts(grassGeo, grassMat, count, () => {
      const a = Math.random() * TAU;
      const r = 2 + Math.sqrt(Math.random()) * 66;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.5 + Math.random() * 1.0, rot: Math.random() * TAU, tint: new THREE.Color(0xf2f8fc) };
    });
    g.add(grass);
    cleanups.push(() => {
      grassGeo.dispose();
      grassMat.dispose();
    });

    const parts = [];
    for (let i = 0; i < (mobile ? 34 : 56); i++) {
      const a = Math.random() * TAU;
      const r = 15 + Math.sqrt(Math.random()) * 62;
      parts.push(...pineParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.8, 1.35), true));
    }
    // 눈더미
    for (let i = 0; i < (mobile ? 26 : 46); i++) {
      const a = Math.random() * TAU;
      const r = rand(6, 60);
      parts.push({
        geo: unitSphere(6),
        pos: [Math.cos(a) * r, 0.1, Math.sin(a) * r],
        scale: [rand(0.8, 2.2), rand(0.2, 0.5), rand(0.8, 2.2)],
        color: new THREE.Color(0xf4f9fc),
      });
    }
    // 얼음 결정
    for (let i = 0; i < (mobile ? 8 : 16); i++) {
      const a = Math.random() * TAU;
      const r = rand(12, 52);
      const h = rand(1.2, 3.2);
      parts.push({
        geo: unitCone(4),
        pos: [Math.cos(a) * r, h * 0.4, Math.sin(a) * r],
        rot: [rand(-0.2, 0.2), Math.random() * TAU, rand(-0.2, 0.2)],
        scale: [rand(0.25, 0.5), h, rand(0.25, 0.5)],
        color: new THREE.Color(0xa8d4e8),
      });
    }
    for (let i = 0; i < (mobile ? 10 : 18); i++) {
      const a = Math.random() * TAU;
      const r = rand(8, 50);
      parts.push(...rockParts(Math.cos(a) * r, Math.sin(a) * r, rand(0.5, 1.6), 0x8a97a2));
    }
    addMerged(parts);
  }

  // ── 먼 지평선 ───────────────────────────────────────────
  const ridgeA = ridgeCurtain({ radius: map.ridge.radius * 0.72, height: map.ridge.height, color: map.ridge.color, seed: 5, yBase: -10 });
  const ridgeB = ridgeCurtain({ radius: map.ridge.radius, height: [map.ridge.height[0] * 1.2, map.ridge.height[1] * 1.3], color: map.ridge.far, seed: 11, yBase: -10 });
  g.add(ridgeA);
  g.add(ridgeB);
  cleanups.push(() => {
    ridgeA.geometry.dispose();
    ridgeA.material.dispose();
    ridgeB.geometry.dispose();
    ridgeB.material.dispose();
  });

  // ── 공중 입자 ───────────────────────────────────────────
  const moteCount = map.motes.count;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * 52;
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = rand(0.4, 12);
    motePos[i * 3 + 2] = Math.sin(a) * r;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    color: map.motes.color,
    map: new THREE.CanvasTexture(makeSoftCircleTexture(32, 0.15)),
    size: map.motes.falling ? 0.32 : 0.2,
    transparent: true,
    opacity: map.motes.falling ? 0.85 : 0.6,
    depthWrite: false,
    blending: map.motes.falling ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  g.add(motes);
  cleanups.push(() => {
    moteGeo.dispose();
    moteMat.dispose();
    if (moteMat.map) moteMat.map.dispose();
  });
  updaters.push((dt, t) => {
    if (map.motes.falling) {
      const arr = moteGeo.attributes.position.array;
      for (let i = 0; i < moteCount; i++) {
        arr[i * 3 + 1] -= dt * (1.1 + (i % 5) * 0.25);
        if (arr[i * 3 + 1] < 0.2) arr[i * 3 + 1] = 12;
      }
      moteGeo.attributes.position.needsUpdate = true;
      motes.rotation.y = t * 0.01;
    } else {
      motes.rotation.y = t * 0.015;
      motes.position.y = Math.sin(t * 0.3) * 0.3;
    }
  });

  updaters.push((dt, t) => {
    ringMat.opacity = 0.1 + Math.sin(t * 0.9) * 0.04;
  });

  return {
    group: g,
    ground,
    update(dt, t) {
      updaters.forEach((u) => u(dt, t));
    },
    dispose() {
      cleanups.forEach((f) => f());
      vegMat.dispose();
      g.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry.dispose && !o.geometry.userData.keep) o.geometry.dispose();
      });
      g.parent && g.parent.remove(g);
    },
  };
}

// ── 월드 ────────────────────────────────────────────────────
export function buildWorld(scene, opts = {}) {
  const mobile = !!opts.mobile;
  const root = new THREE.Group();
  scene.add(root);

  // 하늘 (재사용)
  const skyGeo = new THREE.SphereGeometry(340, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e5f93) },
      mid: { value: new THREE.Color(0x9dc0d6) },
      bottom: { value: new THREE.Color(0xffd9a1) },
    },
    vertexShader: `varying float vH;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vH = normalize(wp.xyz).y;
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying float vH;
      void main(){
        float h = clamp(vH, -0.2, 1.0);
        vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.22, h));
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  root.add(sky);

  // 조명 (재사용)
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6b5a35, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0cc, 2.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 170;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x9ec2ff, 0.4);
  rim.position.set(-30, 18, -28);
  scene.add(rim);
  const amb = new THREE.AmbientLight(0xffe6bf, 0.25);
  scene.add(amb);

  const sunSpriteMat = new THREE.SpriteMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const sunSprite = new THREE.Sprite(sunSpriteMat);
  sunSprite.scale.set(90, 90, 1);
  root.add(sunSprite);

  scene.fog = new THREE.FogExp2(0xded0ae, 0.0135);

  let current = null;
  let currentId = null;
  let t = 0;

  const api = {
    root,
    radius: ARENA_RADIUS,
    sun,
    mapId: null,
    get group() {
      return current ? current.group : null;
    },
    get ground() {
      return current ? current.ground : null;
    },
    setMap(id) {
      const map = MAPS[id] || MAPS.savanna;
      if (currentId === map.id) return;
      if (current) {
        root.remove(current.group);
        current.dispose();
      }
      current = buildMap(map, { mobile });
      root.add(current.group);
      currentId = map.id;
      api.mapId = map.id;

      skyMat.uniforms.top.value.set(map.sky.top);
      skyMat.uniforms.mid.value.set(map.sky.mid);
      skyMat.uniforms.bottom.value.set(map.sky.bottom);
      scene.fog = new THREE.FogExp2(map.fog.color, map.fog.density);
      hemi.color.set(map.hemi.sky);
      hemi.groundColor.set(map.hemi.ground);
      hemi.intensity = map.hemi.intensity;
      sun.color.set(map.sun.color);
      sun.intensity = map.sun.intensity;
      sun.position.set(...map.sun.pos);
      amb.color.set(map.amb.color);
      amb.intensity = map.amb.intensity;
      sunSpriteMat.color.set(map.sunSprite.color);
      sunSpriteMat.opacity = map.sunSprite.opacity;
      sunSprite.position.set(map.sun.pos[0] * 4.4, map.sun.pos[1] * 4.2, map.sun.pos[2] * 4.4);
    },
    update(dt) {
      t += dt;
      if (current) current.update(dt, t);
    },
  };

  api.setMap('savanna');
  return api;
}
