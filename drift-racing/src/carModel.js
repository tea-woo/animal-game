// 절차적 3D 차량 모델 — 차종별로 차체 비율·파츠가 실제로 다른 3종을 만든다.
//  GT-01 AERO : 프런트엔진 GT 쿠페 — 긴 보닛·낮은 패스트백 루프·덕테일·듀얼 배기
//  SLIDE-R    : 드리프트 쿠페 — 짧고 높은 캐빈·와이드 펜더·대형 GT윙·센터 쿼드 배기
//  VX-9 FURY  : 하이퍼카 — 캡포워드·초저 차체·스완넥 윙·대형 디퓨저·터보팬 휠
// 비율 기준: 전장 4.3~4.6m, 전폭 2.08~2.20m, 전고 1.22~1.40m, 휠 지름 0.70~0.74m.
// 도장은 클리어코트 + 환경맵 반사, 카본 파츠는 트윌 텍스처로 마감한다.
import THREE from './three.js?v=20261118a';

export const CARS = [
  {
    id: 'gt', name: 'GT-01 AERO', role: '밸런스 프런트엔진 GT', color: 0x2a6dff, ui: '#43e6ff',
    maxSpeed: 56, accel: 15.5, grip: 1.0, driftGrip: 1.0, steer: 1.0, hp: 1.0,
    stats: { 속도: 0.74, 가속: 0.8, 드리프트: 0.66 }, spoiler: 'lip',
    design: {
      key: [
        [2.20, 0.72, 0.50], [2.14, 0.86, 0.605], [2.06, 0.93, 0.685], [1.92, 0.99, 0.745],
        [1.70, 1.02, 0.80], [1.34, 1.035, 0.845], [0.94, 1.04, 0.875], [0.52, 1.045, 0.895],
        [0.00, 1.05, 0.905], [-0.55, 1.045, 0.905], [-1.05, 1.035, 0.893], [-1.50, 1.01, 0.875],
        [-1.86, 0.96, 0.842], [-2.04, 0.92, 0.805], [-2.12, 0.87, 0.765], [-2.18, 0.78, 0.73],
      ],
      cabin: [
        [0.98, 0.878, 0.898, 0.62], [0.80, 0.965, 0.90, 0.67],
        [0.56, 1.06, 0.903, 0.70], [0.28, 1.15, 0.906, 0.72],
        [0.04, 1.222, 0.908, 0.72], [-0.26, 1.245, 0.908, 0.715],
        [-0.58, 1.212, 0.906, 0.70], [-0.90, 1.12, 0.902, 0.66],
        [-1.16, 1.01, 0.898, 0.60], [-1.32, 0.905, 0.89, 0.52],
      ],
      roof: { z0: 0.30, z1: -0.80, k0: 4, k1: 12 },
      floor: 0.20, archR: 0.49, axleF: 1.40, axleR: -1.42, wheelR: 0.355,
      trackF: 0.90, trackR: 0.91, widthF: 0.31, widthR: 0.35,
      flareAmt: 0.012, flareR: 0.78,
      ringP: 0.50, topW: 0.90, botW: 0.86,
      paint: { metalness: 0.62, roughness: 0.26, clearcoat: 1, ccr: 0.028 },
      caliper: 0xc3352a, rim: 0x9aa4b2,
    },
  },
  {
    id: 'slide', name: 'SLIDE-R', role: '드리프트 특화 쿠페', color: 0xff5a18, ui: '#ff8b3d',
    maxSpeed: 52, accel: 14.2, grip: 0.92, driftGrip: 1.26, steer: 1.08, hp: 0.95,
    stats: { 속도: 0.64, 가속: 0.74, 드리프트: 0.97 }, spoiler: 'gt',
    design: {
      key: [
        [2.14, 0.72, 0.48], [2.08, 0.85, 0.585], [2.00, 0.93, 0.67], [1.86, 0.99, 0.725],
        [1.58, 1.03, 0.775], [1.18, 1.055, 0.82], [0.76, 1.065, 0.865], [0.34, 1.06, 0.895],
        [-0.10, 1.055, 0.91], [-0.58, 1.075, 0.915], [-1.02, 1.09, 0.912], [-1.42, 1.085, 0.893],
        [-1.78, 1.03, 0.858], [-2.00, 0.96, 0.81], [-2.08, 0.88, 0.775], [-2.14, 0.78, 0.74],
      ],
      cabin: [
        [0.86, 0.888, 0.882, 0.60], [0.70, 0.98, 0.888, 0.65],
        [0.50, 1.09, 0.893, 0.69], [0.24, 1.20, 0.898, 0.71],
        [0.00, 1.288, 0.90, 0.71], [-0.30, 1.31, 0.90, 0.705],
        [-0.62, 1.285, 0.898, 0.69], [-0.92, 1.185, 0.893, 0.65],
        [-1.14, 1.05, 0.888, 0.59], [-1.28, 0.925, 0.878, 0.50],
      ],
      roof: { z0: 0.22, z1: -0.84, k0: 4, k1: 12 },
      floor: 0.215, archR: 0.50, axleF: 1.34, axleR: -1.36, wheelR: 0.35,
      trackF: 0.95, trackR: 0.97, widthF: 0.33, widthR: 0.37,
      flareAmt: 0.038, flareR: 0.82,
      ringP: 0.46, topW: 0.91, botW: 0.84,
      paint: { metalness: 0.38, roughness: 0.20, clearcoat: 1, ccr: 0.022 },
      caliper: 0xd8a32a, rim: 0xb08a4e,
    },
  },
  {
    id: 'vx', name: 'VX-9 FURY', role: '최고속 하이퍼카', color: 0xb6f02e, ui: '#b6ff45',
    maxSpeed: 64, accel: 14.4, grip: 0.94, driftGrip: 0.98, steer: 1.0, hp: 0.95,
    stats: { 속도: 0.95, 가속: 0.74, 드리프트: 0.70 }, spoiler: 'swan',
    design: {
      key: [
        [2.32, 0.68, 0.44], [2.26, 0.82, 0.53], [2.16, 0.92, 0.60], [2.02, 1.00, 0.665],
        [1.76, 1.05, 0.715], [1.36, 1.08, 0.76], [0.96, 1.09, 0.80], [0.50, 1.10, 0.82],
        [0.00, 1.10, 0.838], [-0.52, 1.09, 0.855], [-1.04, 1.075, 0.865], [-1.54, 1.05, 0.865],
        [-1.94, 1.00, 0.84], [-2.16, 0.94, 0.80], [-2.26, 0.84, 0.755], [-2.32, 0.72, 0.72],
      ],
      cabin: [
        [1.16, 0.815, 0.795, 0.58], [1.00, 0.885, 0.802, 0.64],
        [0.80, 0.975, 0.81, 0.69], [0.54, 1.055, 0.818, 0.72],
        [0.28, 1.12, 0.822, 0.72], [-0.04, 1.165, 0.826, 0.715],
        [-0.38, 1.155, 0.832, 0.70], [-0.70, 1.11, 0.838, 0.66],
        [-1.00, 1.02, 0.844, 0.61], [-1.22, 0.90, 0.848, 0.53],
      ],
      roof: { z0: 0.22, z1: -0.56, k0: 4, k1: 12 },
      floor: 0.175, archR: 0.51, axleF: 1.50, axleR: -1.50, wheelR: 0.365,
      trackF: 0.95, trackR: 0.99, widthF: 0.31, widthR: 0.37,
      flareAmt: 0.026, flareR: 0.85,
      ringP: 0.54, topW: 0.90, botW: 0.80,
      paint: { metalness: 0.72, roughness: 0.28, clearcoat: 1, ccr: 0.04 },
      caliper: 0xe0691c, rim: 0x5d6470,
    },
  },
];

/* ── 지오메트리 유틸 ──────────────────────────────────── */

function mergeGeos(entries) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const { geo, m } of entries) {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx.push(a[i] + off);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(i + off);
    }
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

// 파츠를 짧게 적기 위한 헬퍼
const B = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
  ({ geo: new THREE.BoxGeometry(w, h, d), m: M(x, y, z, rx, ry, rz) });
const CY = (rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) =>
  ({ geo: new THREE.CylinderGeometry(rt, rb, h, seg), m: M(x, y, z, rx, ry, rz) });

/* ── 차체 단면 ─────────────────────────────────────────
 * 모서리가 단단한 둥근 사각형 단면(수퍼엘립스)에
 * 벨트라인 위 좁힘(tumblehome)과 아래 말림을 준다 → 어깨선이 살아 있는 차체.
 */
function bodyRing(sec, segs, P) {
  const { w, h, cy } = sec;
  const topW = sec.topW != null ? sec.topW : w * 0.9;
  const botW = sec.botW != null ? sec.botW : w * 0.86;
  const pts = [];
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const sa = Math.sin(a), ca = Math.cos(a);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), P);
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), P);
    const y = cy + h * sy;
    const t = (sy + 1) / 2;                     // 0 = 바닥, 1 = 지붕
    const half = t < 0.5
      ? botW + (w - botW) * (t / 0.5)
      : w + (topW - w) * ((t - 0.5) / 0.5);
    pts.push([cx * half, y]);
  }
  return pts;
}

function loftGeometry(sections, segs, P, capFront = true, capBack = true) {
  const rings = sections.map((s) => ({ z: s.z, ring: bodyRing(s, segs, P) }));
  const pos = [], idx = [];
  const n = segs;
  for (let i = 0; i < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const [x, y] = rings[i].ring[k];
      pos.push(x, y, rings[i].z);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const b = i * n + ((k + 1) % n);
      const c = (i + 1) * n + k;
      const d = (i + 1) * n + ((k + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const first = rings[0], last = rings[rings.length - 1];
  if (capFront) {
    const center = pos.length / 3;
    pos.push(0, first.ring.reduce((s, p) => s + p[1], 0) / n, first.z);
    for (let k = 0; k < n; k++) idx.push(center, k, (k + 1) % n);
  }
  if (capBack) {
    const center = pos.length / 3;
    pos.push(0, last.ring.reduce((s, p) => s + p[1], 0) / n, last.z);
    const base = (rings.length - 1) * n;
    for (let k = 0; k < n; k++) idx.push(center, base + ((k + 1) % n), base + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 로프트의 링 인덱스 k0~k1 구간만 띠로 뽑는다 (지붕 패널용)
function loftStrip(sections, k0, k1, segs, P) {
  const rings = sections.map((s) => ({ z: s.z, ring: bodyRing(s, segs, P) }));
  const pos = [], idx = [];
  const w = k1 - k0 + 1;
  for (let i = 0; i < rings.length; i++) {
    for (let k = k0; k <= k1; k++) {
      const [x, y] = rings[i].ring[((k % segs) + segs) % segs];
      pos.push(x, y, rings[i].z);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < w - 1; k++) {
      const a = i * w + k;
      const b = a + 1;
      const c = (i + 1) * w + k;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ── 카본 트윌 텍스처 ────────────────────────────────── */
function carbonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0b0d';
  g.fillRect(0, 0, 128, 128);
  const cell = 16;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const over = ((x >> 1) + (y >> 1)) % 2 === 0;
      const grd = g.createLinearGradient(x * cell, y * cell, x * cell + cell, y * cell + cell);
      if (over) {
        grd.addColorStop(0, 'rgba(54,58,66,0.95)');
        grd.addColorStop(0.5, 'rgba(30,33,39,0.98)');
        grd.addColorStop(1, 'rgba(16,18,22,1)');
      } else {
        grd.addColorStop(0, 'rgba(20,22,26,1)');
        grd.addColorStop(0.5, 'rgba(34,37,43,0.98)');
        grd.addColorStop(1, 'rgba(48,52,60,0.9)');
      }
      g.fillStyle = grd;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ── 타이어·휠 ───────────────────────────────────────── */
function makeWheel(r = 0.355, width = 0.32, style = 'twin5', rimColor = 0x9aa4b2, caliperColor = 0xc3352a) {
  const halfW = width / 2;
  const tw = r * 0.94;
  const profile = [
    [tw * 0.72, -halfW * 1.0],
    [tw * 0.86, -halfW * 1.0],
    [tw * 0.95, -halfW * 0.86],
    [r, -halfW * 0.5],
    [r, halfW * 0.5],
    [tw * 0.95, halfW * 0.86],
    [tw * 0.86, halfW * 1.0],
    [tw * 0.72, halfW * 1.0],
  ];
  const tireGeo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 30);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x151618, roughness: 0.92, metalness: 0.03, side: THREE.DoubleSide,
  });

  const rimR = tw * 0.74;
  const rimEntries = [];
  const barrel = new THREE.CylinderGeometry(rimR, rimR, width * 0.9, 24, 1, true);
  rimEntries.push({ geo: barrel, m: M(0, 0, 0, 0, 0, Math.PI / 2) });
  const lip = new THREE.TorusGeometry(rimR * 0.99, 0.014, 6, 26);
  rimEntries.push({ geo: lip, m: M(halfW * 0.87, 0, 0, 0, Math.PI / 2, 0) });
  const lipIn = new THREE.TorusGeometry(rimR * 0.88, 0.010, 6, 24);
  rimEntries.push({ geo: lipIn, m: M(halfW * 0.55, 0, 0, 0, Math.PI / 2, 0) });

  if (style === 'twin5') {
    for (let i = 0; i < 5; i++) {
      for (const dir of [-1, 1]) {
        const ang = (i / 5) * Math.PI * 2 + dir * 0.20;
        rimEntries.push({
          geo: new THREE.BoxGeometry(0.028, rimR * 0.94, 0.044),
          m: M(halfW * 0.60, Math.cos(ang) * rimR * 0.46, Math.sin(ang) * rimR * 0.46, 0, 0, 0)
            .multiply(M(0, 0, 0, ang, 0, 0)),
        });
      }
    }
  } else if (style === 'mesh10') {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      rimEntries.push({
        geo: new THREE.BoxGeometry(0.024, rimR * 0.96, 0.032),
        m: M(halfW * 0.72, Math.cos(ang) * rimR * 0.48, Math.sin(ang) * rimR * 0.48, 0, 0, 0)
          .multiply(M(0, 0, 0, ang, 0, 0)),
      });
      const ang2 = ang + Math.PI / 10;
      rimEntries.push({
        geo: new THREE.BoxGeometry(0.018, rimR * 0.82, 0.024),
        m: M(halfW * 0.58, Math.cos(ang2) * rimR * 0.42, Math.sin(ang2) * rimR * 0.42, 0, 0, 0)
          .multiply(M(0, 0, 0, ang2, 0, 0)),
      });
    }
  } else {
    // 터보팬 — 큰 에어로 디스크 + 방사형 슬롯
    rimEntries.push({ geo: new THREE.CylinderGeometry(rimR * 0.99, rimR * 0.99, 0.026, 28), m: M(halfW * 0.46, 0, 0, 0, 0, Math.PI / 2) });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      rimEntries.push({
        geo: new THREE.BoxGeometry(0.014, rimR * 0.80, 0.07),
        m: M(halfW * 0.48, Math.cos(ang) * rimR * 0.46, Math.sin(ang) * rimR * 0.46, 0, 0, 0)
          .multiply(M(0, 0, 0, ang, 0, 0)),
      });
    }
  }
  const hub = new THREE.CylinderGeometry(rimR * 0.25, rimR * 0.25, width * 0.6, 12);
  rimEntries.push({ geo: hub, m: M(halfW * 0.28, 0, 0, 0, 0, Math.PI / 2) });
  // 센터 락 너트
  const nut = new THREE.CylinderGeometry(rimR * 0.17, rimR * 0.17, 0.05, 6);
  rimEntries.push({ geo: nut, m: M(halfW * 0.92, 0, 0, 0, 0, Math.PI / 2) });

  const rimGeo = mergeGeos(rimEntries);
  const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.26, metalness: 0.94, envMapIntensity: 1.2 });

  const discGeo = new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.022, 22);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.46, metalness: 0.95 });
  const caliperGeo = new THREE.BoxGeometry(0.052, 0.10, 0.062);
  const caliperMat = new THREE.MeshStandardMaterial({ color: caliperColor, roughness: 0.42, metalness: 0.35 });

  return { tireGeo, tireMat, rimGeo, rimMat, discGeo, discMat, caliperGeo, caliperMat, rimR };
}

/* ── 날개 단면(에어포일) ───────────────────────────────── */
function airfoilGeo(chord = 0.46, thick = 0.07, span = 1.7) {
  const s = new THREE.Shape();
  const n = 14;
  s.moveTo(-chord / 2, 0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    s.lineTo(-chord / 2 + chord * t, thick * Math.sin(Math.PI * t) * 0.85);
  }
  for (let i = n - 1; i >= 0; i--) {
    const t = i / n;
    s.lineTo(-chord / 2 + chord * t, -thick * 0.3 * Math.sin(Math.PI * t));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -span / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

export function buildCar(spec) {
  const D = spec.design || CARS[0].design;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';       // yaw 다음 로컬 피치(지형 경사)
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({
    color: spec.color, metalness: D.paint.metalness, roughness: D.paint.roughness,
    clearcoat: D.paint.clearcoat, clearcoatRoughness: D.paint.ccr, envMapIntensity: 1.25,
    reflectivity: 0.55,
  });
  const carbon = new THREE.MeshStandardMaterial({
    map: carbonTexture(), color: 0x3c4048, roughness: 0.62, metalness: 0.28, envMapIntensity: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.5, metalness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.62, metalness: 0.3 });
  const gloss = new THREE.MeshPhysicalMaterial({
    color: 0x05070a, roughness: 0.14, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.0,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1018, roughness: 0.05, metalness: 0.35,
    clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 1.45,
    transparent: true, opacity: 0.955,
  });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8e0ea, roughness: 0.14, metalness: 1.0 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.34, metalness: 1.0 });
  const headMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf7ff, emissive: 0xc8ecff, emissiveIntensity: 1.9,
    roughness: 0.08, metalness: 0.1, clearcoat: 1,
  });
  const tailMat = new THREE.MeshPhysicalMaterial({
    color: 0xcf0f24, emissive: 0xff0e20, emissiveIntensity: 1.0,
    roughness: 0.2, metalness: 0.1, clearcoat: 1,
  });
  const revMat = new THREE.MeshStandardMaterial({
    color: 0xf6fbff, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3,
  });

  const noseZ = D.key[0][0];
  const tailZ = D.key[D.key.length - 1][0];
  const P = D.ringP;

  /* ── 하부 차체(메인 로프트) ───────────────────────────── */
  const keyAt = (z) => {
    for (let i = 0; i < D.key.length - 1; i++) {
      const a = D.key[i], b = D.key[i + 1];
      if (z <= a[0] && z >= b[0]) {
        const t = (a[0] - z) / (a[0] - b[0] || 1);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    const e = z > D.key[0][0] ? D.key[0] : D.key[D.key.length - 1];
    return [e[1], e[2]];
  };
  const topAt = (z) => keyAt(z)[1];
  const archTop = D.wheelR * 2 + 0.05;                 // 타이어 위 5cm 여유
  const archAt = (z) => {
    let h = 0;
    for (const c of [D.axleF, D.axleR]) {
      const dz = Math.abs(z - c);
      if (dz < D.archR) {
        h = Math.max(h, D.floor - 0.02 + (archTop - D.floor + 0.02) * Math.sqrt(1 - (dz / D.archR) ** 2));
      }
    }
    return h;
  };
  const sections = [];
  const STEPS = 58;
  const bulge = (z) => {
    let b = 0;
    const amt = D.flareAmt || 0, R = D.flareR || 0.8;
    for (const c of [D.axleF, D.axleR]) {
      const dz = Math.abs(z - c);
      if (dz < R) b += amt * (1 - (dz / R) ** 2);
    }
    return b;
  };
  for (let i = 0; i <= STEPS; i++) {
    const z = noseZ + (tailZ - noseZ) * (i / STEPS);
    const [w0, top] = keyAt(z);
    const w = w0 + bulge(z);
    const baseBot = z > noseZ - 0.10 ? D.floor + 0.015
      : z < tailZ + 0.34 ? D.floor + (tailZ + 0.34 - z) * 0.5
        : D.floor;
    const bot = Math.min(top - 0.035, Math.max(baseBot, archAt(z)));
    sections.push({
      z, w, top, bot,
      topW: w * D.topW, botW: w * D.botW,
      cy: (top + bot) / 2, h: (top - bot) / 2,
    });
  }
  const hull = new THREE.Mesh(loftGeometry(sections, 34, P), paint);
  hull.castShadow = true;
  hull.receiveShadow = true;
  body.add(hull);

  /* ── 유리 캐빈 + 지붕 ────────────────────────────────── */
  const cabin = D.cabin.map(([z, top, bot, w]) => ({
    z, w, top: top * 0.995, bot,
    topW: w * 0.78, botW: w * 0.99,
    cy: (top * 0.995 + bot) / 2, h: (top * 0.995 - bot) / 2,
  }));
  const cabinMesh = new THREE.Mesh(loftGeometry(cabin, 34, P), glass);
  cabinMesh.castShadow = true;
  body.add(cabinMesh);

  const roofShell = cabin
    .filter((s) => s.z <= D.roof.z0 && s.z >= D.roof.z1)
    .map((s) => ({ ...s, w: s.w * 1.014, h: s.h * 1.012, cy: s.cy + 0.007, top: s.top + 0.007, bot: s.bot + 0.007 }));
  if (roofShell.length > 1) {
    const roof = new THREE.Mesh(loftStrip(roofShell, D.roof.k0, D.roof.k1, 34, P), paint);
    roof.castShadow = true;
    body.add(roof);
  }

  const axleZ = { f: D.axleF, r: D.axleR };
  const hullWAt = (z) => keyAt(z)[0] + bulge(z);
  // 차체 단면 — 특정 z 에서의 폭·높이
  const secAt = (z) => {
    const [w0, top] = keyAt(z);
    const w = w0 + bulge(z);
    const bot = Math.max(D.floor, archAt(z));
    return { w, top, bot, cy: (top + bot) / 2, h: (top - bot) / 2, topW: w * D.topW, botW: w * D.botW };
  };
  // 단면 링 위의 점 (k: 0=오른쪽, segs/4=위) — 램프를 차체 표면에 붙인다
  const ringPt = (z, k, segs = 34) => {
    const p = bodyRing(secAt(z), segs, P)[((k % segs) + segs) % segs];
    return { x: p[0], y: p[1] };
  };
  // 특정 높이에서 쓸 수 있는 차체 반폭(근사)
  const halfAt = (z, y) => {
    const s = secAt(z);
    const t = Math.min(1, Math.max(0, (y - s.bot) / Math.max(0.001, s.top - s.bot)));
    return t < 0.5 ? s.botW + (s.w - s.botW) * (t / 0.5) : s.w + (s.topW - s.w) * ((t - 0.5) / 0.5);
  };

  /* ── 앞부분 ───────────────────────────────────────────── */
  const frontKit = [];      // 카본
  const frontDark = [];     // 검정 범퍼·그릴
  const frontLampH = [];    // 헤드램프 하우징
  const frontLamp = [];     // 발광 렌즈
  const splY = D.floor - 0.005;

  if (spec.id === 'gt') {
    const hz = noseZ - 0.10;
    const hp = ringPt(hz, 2);
    const lampY = hp.y;
    const lampX = hp.x * 0.94;
    const faceY = lampY * 0.58;
    const gw = Math.min(1.14, 2 * halfAt(noseZ - 0.05, faceY) * 0.72);
    // 낮게 깔린 스플리터 + 엔드플레이트
    frontKit.push(B(gw * 1.16, 0.038, 0.26, 0, splY, noseZ - 0.15, -0.05));
    for (const s of [-1, 1]) frontKit.push(B(0.045, 0.075, 0.28, s * gw * 0.72, splY + 0.018, noseZ - 0.17, -0.05));
    // 범퍼 페이스 + 센트럴 그릴
    frontDark.push(B(gw, 0.15, 0.05, 0, faceY, noseZ - 0.035, -0.08));
    frontDark.push(B(gw * 0.46, 0.10, 0.045, 0, faceY, noseZ - 0.02, -0.08));
    for (let i = -2; i <= 2; i++) frontDark.push(B(0.013, 0.09, 0.02, i * gw * 0.085, faceY, noseZ - 0.01, -0.08));
    // 사이드 인테이크
    for (const s of [-1, 1]) {
      frontDark.push(B(gw * 0.26, 0.10, 0.05, s * gw * 0.60, faceY + 0.005, noseZ - 0.045, -0.10, s * 0.12, 0));
    }
    // 헤드램프 — 얇은 수평 LED
    for (const s of [-1, 1]) {
      frontLampH.push(B(0.40, 0.075, 0.055, s * lampX, lampY, hz + 0.015, -0.10, s * 0.42, 0));
      frontLamp.push(B(0.33, 0.036, 0.04, s * (lampX * 0.985), lampY, hz + 0.04, -0.10, s * 0.42, 0));
      frontLamp.push(B(0.28, 0.011, 0.028, s * (lampX * 0.98), lampY + 0.026, hz + 0.042, -0.10, s * 0.42, 0));
    }
    // 보닛 벤트
    const vents = [];
    for (const s of [-1, 1]) vents.push(B(0.13, 0.012, 0.28, s * 0.36, topAt(1.34) - 0.004, 1.34, -0.08));
    body.add(new THREE.Mesh(mergeGeos(vents), trim));
  } else if (spec.id === 'slide') {
    const hz = noseZ - 0.10;
    const hp = ringPt(hz, 2);
    const lampY = hp.y;
    const lampX = hp.x * 0.92;
    const faceY = lampY * 0.56;
    const gw = Math.min(1.22, 2 * halfAt(noseZ - 0.05, faceY) * 0.74);
    // 깊은 카본 스플리터 + 카나드
    frontKit.push(B(gw * 1.20, 0.036, 0.34, 0, splY, noseZ - 0.19, -0.04));
    for (const s of [-1, 1]) {
      frontKit.push(B(0.05, 0.10, 0.38, s * gw * 0.70, splY + 0.022, noseZ - 0.21, -0.04));
      frontKit.push(B(0.20, 0.018, 0.12, s * gw * 0.52, splY + 0.09, noseZ - 0.09, 0.16));
      frontKit.push(B(0.20, 0.018, 0.12, s * gw * 0.52, splY + 0.145, noseZ - 0.055, 0.16));
    }
    // 큰 인터쿨러 그릴 + 수평 슬랫
    frontDark.push(B(gw * 0.82, 0.21, 0.06, 0, faceY, noseZ - 0.045, -0.05));
    for (let i = 0; i < 5; i++) frontDark.push(B(gw * 0.70, 0.013, 0.03, 0, faceY - 0.075 + i * 0.038, noseZ - 0.01, -0.05));
    for (const s of [-1, 1]) frontDark.push(B(gw * 0.17, 0.08, 0.05, s * gw * 0.60, faceY + 0.01, noseZ - 0.02, -0.05, s * 0.16, 0));
    // 헤드램프 — 2구 프로젝터
    for (const s of [-1, 1]) {
      frontLampH.push(B(0.40, 0.115, 0.05, s * lampX, lampY, hz + 0.02, -0.08, s * 0.40, 0));
      for (const [dx, dy] of [[0.09, 0.012], [-0.09, -0.006]]) {
        const px = s * (lampX + dx), py = lampY + dy;
        frontLampH.push({ geo: new THREE.CylinderGeometry(0.058, 0.058, 0.018, 14), m: M(px, py, hz + 0.035, Math.PI / 2, s * 0.40, 0) });
        frontLamp.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.026, 14), m: M(px, py, hz + 0.048, Math.PI / 2, s * 0.40, 0) });
      }
    }
    // 보닛 에어 덕트 + 후드핀
    const vents = [];
    for (const s of [-1, 1]) vents.push(B(0.24, 0.014, 0.42, s * 0.34, topAt(1.18) - 0.004, 1.18, -0.09));
    body.add(new THREE.Mesh(mergeGeos(vents), trim));
  } else {
    const hz = noseZ - 0.12;
    const hp = ringPt(hz, 2);
    const lampY = hp.y;
    const lampX = hp.x * 0.94;
    const faceY = lampY * 0.66;
    const gw = Math.min(1.20, 2 * halfAt(noseZ - 0.06, faceY) * 0.74);
    // VX — 카본 노즈 + 대형 센트럴 인테이크 + 다이브 플레인
    frontKit.push(B(gw * 1.22, 0.034, 0.32, 0, splY, noseZ - 0.18, -0.03));
    for (const s of [-1, 1]) {
      frontKit.push(B(0.05, 0.08, 0.36, s * gw * 0.72, splY + 0.018, noseZ - 0.20, -0.03));
      frontKit.push(B(0.26, 0.016, 0.14, s * gw * 0.56, splY + 0.07, noseZ - 0.05, 0.14));
      frontKit.push(B(0.04, 0.15, 0.14, s * gw * 0.64, splY + 0.19, noseZ - 0.34, 0, s * 0.16, 0));
    }
    frontDark.push(B(gw * 0.74, 0.14, 0.06, 0, faceY, noseZ - 0.05, -0.06));
    frontDark.push(B(gw * 0.48, 0.085, 0.045, 0, faceY, noseZ - 0.03, -0.06));
    for (const s of [-1, 1]) {
      frontDark.push(B(0.07, 0.16, 0.09, s * gw * 0.42, faceY + 0.02, noseZ - 0.12, -0.06, 0, s * 0.2));
      frontDark.push(B(gw * 0.17, 0.055, 0.045, s * gw * 0.58, faceY, noseZ - 0.01, -0.06, s * 0.16, 0));
    }
    // 헤드램프 — 슬릿형 LED (L자)
    for (const s of [-1, 1]) {
      frontLampH.push(B(0.32, 0.055, 0.045, s * lampX, lampY, hz + 0.02, -0.08, s * 0.44, 0));
      frontLamp.push(B(0.27, 0.021, 0.032, s * (lampX * 0.99), lampY, hz + 0.041, -0.08, s * 0.44, 0));
      frontLamp.push(B(0.04, 0.085, 0.032, s * (lampX + 0.115), lampY - 0.04, hz + 0.03, -0.08, s * 0.44, 0));
    }
    // 보닛 — 큰 배기 벤트 2개
    const vents = [];
    for (const s of [-1, 1]) vents.push(B(0.26, 0.014, 0.48, s * 0.34, topAt(1.46) - 0.006, 1.46, -0.12));
    body.add(new THREE.Mesh(mergeGeos(vents), dark));
    // 프런트 휠 아치 상부 루버
    const luv = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) luv.push(B(0.032, 0.012, 0.10, s * (hullWAt(D.axleF) - 0.02), topAt(D.axleF) - 0.02 - i * 0.022, D.axleF + 0.34 + i * 0.10));
    body.add(new THREE.Mesh(mergeGeos(luv), trim));
  }

  if (frontKit.length) {
    const m = new THREE.Mesh(mergeGeos(frontKit), carbon);
    m.castShadow = true; body.add(m);
  }
  if (frontDark.length) body.add(new THREE.Mesh(mergeGeos(frontDark), dark));
  if (frontLampH.length) body.add(new THREE.Mesh(mergeGeos(frontLampH), gloss));
  if (frontLamp.length) body.add(new THREE.Mesh(mergeGeos(frontLamp), headMat));

  /* ── 테일 · 디퓨저 · 배기 ─────────────────────────────── */
  const tails = [];
  const tailParts = [];
  const tailDark = [];
  const exhaustParts = [];
  const exhaustIn = [];
  const capTop = topAt(tailZ);
  const capW = hullWAt(tailZ);
  const deckY = topAt(tailZ + 0.12);
  const tz = tailZ - 0.015;

  if (spec.id === 'gt') {
    const lampY = capTop - 0.115;
    const pw = Math.min(1.44, capW * 1.86);
    tailDark.push(B(pw, 0.15, 0.05, 0, lampY, tz));
    tailParts.push(B(pw * 0.94, 0.038, 0.045, 0, lampY + 0.028, tz - 0.012));
    for (const s of [-1, 1]) tailParts.push(B(0.22, 0.075, 0.04, s * pw * 0.42, lampY - 0.012, tz - 0.012));
    // 범퍼 하단 디퓨저
    tailDark.push(B(pw * 1.02, 0.10, 0.30, 0, D.floor + 0.10, tailZ + 0.16, 0.30));
    for (let i = -2; i <= 2; i++) tailDark.push(B(0.036, 0.14, 0.27, i * pw * 0.19, D.floor + 0.10, tailZ + 0.16, 0.30));
    for (const s of [-1, 1]) {
      exhaustParts.push(CY(0.058, 0.064, 0.16, 14, s * pw * 0.29, D.floor + 0.16, tailZ + 0.02, Math.PI / 2, 0, 0));
      exhaustIn.push(CY(0.047, 0.047, 0.15, 12, s * pw * 0.29, D.floor + 0.16, tailZ + 0.02, Math.PI / 2, 0, 0));
    }
  } else if (spec.id === 'slide') {
    const lampY = capTop - 0.115;
    const pw = Math.min(1.52, capW * 1.80);
    // 양쪽 클러스터 + 중앙 번호판 리세스
    for (const s of [-1, 1]) {
      tailDark.push(B(pw * 0.40, 0.15, 0.05, s * pw * 0.40, lampY, tz));
      tailParts.push({ geo: new THREE.CylinderGeometry(0.056, 0.056, 0.038, 12), m: M(s * (pw * 0.32), lampY, tz - 0.012, Math.PI / 2, 0, 0) });
      tailParts.push({ geo: new THREE.CylinderGeometry(0.056, 0.056, 0.038, 12), m: M(s * (pw * 0.47), lampY, tz - 0.012, Math.PI / 2, 0, 0) });
    }
    tailDark.push(B(pw * 0.30, 0.13, 0.045, 0, lampY - 0.01, tz));
    // 디퓨저 + 쿼드 센터 배기
    tailDark.push(B(pw * 0.98, 0.12, 0.32, 0, D.floor + 0.10, tailZ + 0.15, 0.28));
    for (let i = -2; i <= 2; i++) tailDark.push(B(0.040, 0.16, 0.29, i * pw * 0.19, D.floor + 0.10, tailZ + 0.15, 0.28));
    for (const sx of [-1, 1]) {
      for (const sy of [0, 1]) {
        exhaustParts.push(CY(0.045, 0.049, 0.15, 12, sx * 0.11, D.floor + 0.13 + sy * 0.095, tailZ + 0.03, Math.PI / 2, 0, 0));
        exhaustIn.push(CY(0.036, 0.036, 0.14, 10, sx * 0.11, D.floor + 0.13 + sy * 0.095, tailZ + 0.03, Math.PI / 2, 0, 0));
      }
    }
    // 사이드 배기 — 드리프트 카 느낌
    for (const s of [-1, 1]) {
      exhaustParts.push(CY(0.048, 0.052, 0.12, 12, s * (hullWAt(-0.95) + 0.02), 0.42, -0.95, 0, 0, Math.PI / 2));
      exhaustIn.push(CY(0.038, 0.038, 0.13, 10, s * (hullWAt(-0.95) + 0.02), 0.42, -0.95, 0, 0, Math.PI / 2));
    }
  } else {
    const lampY = capTop - 0.085;
    const pw = Math.min(1.56, capW * 1.84);
    tailDark.push(B(pw, 0.12, 0.05, 0, lampY, tz));
    tailParts.push(B(pw * 0.97, 0.028, 0.04, 0, lampY + 0.032, tz - 0.012));
    for (const s of [-1, 1]) tailParts.push(B(0.026, 0.10, 0.04, s * pw * 0.475, lampY - 0.012, tz - 0.012));
    tailDark.push(B(pw * 0.72, 0.14, 0.05, 0, lampY - 0.135, tz));
    for (let i = -6; i <= 6; i++) tailDark.push(B(0.012, 0.12, 0.02, i * pw * 0.055, lampY - 0.135, tz - 0.03, 0, 0, 0.25));
    tailDark.push(B(pw * 0.96, 0.14, 0.40, 0, D.floor + 0.09, tailZ + 0.20, 0.33));
    for (let i = -3; i <= 3; i++) tailDark.push(B(0.030, 0.19, 0.38, i * pw * 0.15, D.floor + 0.09, tailZ + 0.20, 0.33));
    for (const sx of [-1, 1]) {
      exhaustParts.push({ geo: new THREE.CylinderGeometry(0.08, 0.08, 0.16, 6), m: M(sx * 0.15, D.floor + 0.155, tailZ + 0.02, Math.PI / 2, 0, 0) });
      exhaustIn.push({ geo: new THREE.CylinderGeometry(0.068, 0.068, 0.15, 6), m: M(sx * 0.15, D.floor + 0.155, tailZ + 0.02, Math.PI / 2, 0, 0) });
    }
  }

  if (tailDark.length) body.add(new THREE.Mesh(mergeGeos(tailDark), dark));
  if (tailParts.length) {
    const tm = new THREE.Mesh(mergeGeos(tailParts), tailMat);
    body.add(tm);
    tails.push(tm);
  }
  if (exhaustParts.length) body.add(new THREE.Mesh(mergeGeos(exhaustParts), spec.id === 'vx' ? titanium : chrome));
  if (exhaustIn.length) body.add(new THREE.Mesh(mergeGeos(exhaustIn), dark));
  // 후진등
  {
    const rev = new THREE.Mesh(mergeGeos([
      B(0.10, 0.032, 0.03, -0.18, D.floor + 0.075, tailZ - 0.01),
      B(0.10, 0.032, 0.03, 0.18, D.floor + 0.075, tailZ - 0.01),
    ]), revMat);
    body.add(rev);
  }

  /* ── 언더바디(차 밑 어두운 판) ───────────────────────── */
  {
    const ub = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.03, Math.abs(noseZ - tailZ) * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.9, metalness: 0.1 })
    );
    ub.position.set(0, D.floor - 0.02, (noseZ + tailZ) / 2);
    body.add(ub);
  }

  /* ── 리어 윙 ──────────────────────────────────────────── */
  {
    if (spec.id === 'gt') {
      // 덕테일 — 트렁크 끝이 살짝 들린 일체형
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.05, 0.24), paint);
      lip.position.set(0, deckY + 0.045, tailZ + 0.22);
      lip.rotation.x = -0.22;
      lip.castShadow = true;
      body.add(lip);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.04, 0.09), paint);
      base.position.set(0, deckY + 0.015, tailZ + 0.25);
      body.add(base);
    } else if (spec.id === 'slide') {
      const wy = deckY + 0.44;
      const wing = new THREE.Mesh(airfoilGeo(0.44, 0.07, 1.80), carbon);
      wing.position.set(0, wy, tailZ + 0.13);
      wing.rotation.x = -0.17;
      wing.castShadow = true;
      body.add(wing);
      const hard = [];
      for (const s of [-1, 1]) {
        hard.push(B(0.05, 0.44, 0.11, s * 0.58, deckY + 0.22, tailZ + 0.19, 0.16));
        hard.push(B(0.02, 0.24, 0.54, s * 0.905, wy + 0.01, tailZ + 0.13, -0.17));
      }
      body.add(new THREE.Mesh(mergeGeos(hard), carbon));
    } else {
      // 스완넥 윙
      const wy = deckY + 0.38;
      const wing = new THREE.Mesh(airfoilGeo(0.50, 0.06, 1.92), carbon);
      wing.position.set(0, wy, tailZ + 0.19);
      wing.rotation.x = -0.14;
      wing.castShadow = true;
      body.add(wing);
      const hard = [];
      for (const s of [-1, 1]) {
        hard.push(B(0.032, 0.40, 0.09, s * 0.55, deckY + 0.20, tailZ + 0.33, -0.28));
        hard.push(B(0.024, 0.28, 0.42, s * 0.955, wy + 0.01, tailZ + 0.17, -0.14));
      }
      body.add(new THREE.Mesh(mergeGeos(hard), carbon));
      // 엔진 커버 핀
      body.add(new THREE.Mesh(mergeGeos([B(0.026, 0.13, 0.46, 0, deckY + 0.10, tailZ + 0.62, 0.04)]), paint));
    }
  }

  /* ── 사이드: 스커트·펜더 통풍구·미러 ──────────────────── */
  {
    const skirtParts = [];
    if (spec.id === 'slide') {
      for (const s of [-1, 1]) {
        skirtParts.push(B(0.09, 0.15, 1.84, s * 1.015, D.floor + 0.075, -0.02));
        skirtParts.push(B(0.15, 0.045, 0.14, s * 1.01, D.floor + 0.01, 0.70));
      }
      const gills = [];
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        gills.push(B(0.026, 0.05, 0.15, s * (hullWAt(0.90) + 0.015), 0.70 + i * 0.052, 0.90 - i * 0.015, 0, 0, s * 0.12));
      }
      body.add(new THREE.Mesh(mergeGeos(gills), dark));
    } else if (spec.id === 'vx') {
      for (const s of [-1, 1]) {
        skirtParts.push(B(0.08, 0.12, 2.0, s * 1.045, D.floor + 0.06, -0.05));
        skirtParts.push(B(0.11, 0.055, 0.48, s * 1.03, D.floor + 0.01, -0.30));
        // 대형 사이드 인테이크 (뒷바퀴 앞)
        skirtParts.push(B(0.05, 0.24, 0.60, s * 1.055, 0.62, -0.62, 0, 0, s * 0.04));
      }
      const fins = [];
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        fins.push(B(0.045, 0.20, 0.018, s * 1.058, 0.62, -0.44 - i * 0.17));
      }
      body.add(new THREE.Mesh(mergeGeos(fins), trim));
    } else {
      for (const s of [-1, 1]) {
        skirtParts.push(B(0.07, 0.09, 1.90, s * 1.0, D.floor + 0.055, -0.06));
        skirtParts.push(B(0.045, 0.10, 0.28, s * 1.005, 0.60, -1.02, 0, 0, s * 0.08));
      }
    }
    body.add(new THREE.Mesh(mergeGeos(skirtParts), carbon));

    // 도어 컷 라인 + 핸들
    const lines = [];
    for (const s of [-1, 1]) {
      const xw = hullWAt(0.0) + 0.008;
      lines.push(B(0.012, 0.32, 0.014, s * xw, 0.66, 0.56));
      lines.push(B(0.012, 0.32, 0.014, s * xw, 0.66, -0.38));
      lines.push(B(0.014, 0.026, 0.20, s * (xw + 0.004), 0.70, -0.02));
    }
    body.add(new THREE.Mesh(mergeGeos(lines), trim));

    // 미러 — 차종별 형태
    const arms = [];
    const shells = [];
    const mirrors = [];
    const mx = hullWAt(0.7);
    for (const s of [-1, 1]) {
      if (spec.id === 'slide') {
        arms.push(B(0.19, 0.03, 0.05, s * (mx - 0.10), 0.905, 0.66, 0, s * 0.22, 0));
        shells.push({ geo: new THREE.SphereGeometry(0.072, 12, 8), m: M(s * (mx + 0.02), 0.945, 0.64, 0, 0, 0, 1, 1.25, 0.55) });
        mirrors.push({ geo: new THREE.SphereGeometry(0.062, 10, 8), m: M(s * (mx + 0.05), 0.945, 0.64, 0, 0, 0, 0.3, 1.2, 0.5) });
      } else if (spec.id === 'vx') {
        arms.push(B(0.15, 0.02, 0.02, s * (mx - 0.06), 0.885, 0.60, 0, s * 0.16, 0));
        arms.push(B(0.02, 0.055, 0.018, s * (mx + 0.02), 0.91, 0.60));
        shells.push(B(0.045, 0.042, 0.13, s * (mx + 0.045), 0.935, 0.585, 0, s * 0.10, 0));
        mirrors.push(B(0.012, 0.03, 0.10, s * (mx + 0.068), 0.935, 0.585, 0, s * 0.10, 0));
      } else {
        arms.push(B(0.15, 0.038, 0.05, s * (mx - 0.08), 0.905, 0.70, 0, s * 0.2, 0));
        shells.push(B(0.09, 0.065, 0.18, s * (mx + 0.03), 0.93, 0.67, 0, s * 0.14, 0));
        mirrors.push(B(0.013, 0.05, 0.145, s * (mx + 0.075), 0.93, 0.67, 0, s * 0.14, 0));
      }
    }
    body.add(new THREE.Mesh(mergeGeos(arms), dark));
    body.add(new THREE.Mesh(mergeGeos(shells), paint));
    body.add(new THREE.Mesh(mergeGeos(mirrors), glass));
  }

  /* ── 차종별 시그니처 디테일 ───────────────────────────── */
  if (spec.id === 'slide') {
    // 루프 스쿠프
    const scoop = [B(0.32, 0.05, 0.30, 0, 1.35, -0.36)];
    body.add(new THREE.Mesh(mergeGeos(scoop), paint));
    body.add(new THREE.Mesh(mergeGeos([B(0.26, 0.032, 0.02, 0, 1.348, -0.22)]), dark));
  } else if (spec.id === 'vx') {
    // 엔진 데크 루버 + 루프 스쿱
    const deck = [];
    for (let i = 0; i < 5; i++) deck.push(B(0.60, 0.012, 0.07, 0, deckY - 0.02 - i * 0.004, -1.16 - i * 0.13, 0.06));
    body.add(new THREE.Mesh(mergeGeos(deck), dark));
    body.add(new THREE.Mesh(mergeGeos([B(0.24, 0.045, 0.32, 0, 1.215, -0.46)]), paint));
    body.add(new THREE.Mesh(mergeGeos([B(0.20, 0.032, 0.02, 0, 1.21, -0.30)]), dark));
  } else {
    // GT — 리어 윈도 루버 + 샤크핀 안테나
    const louver = [];
    for (let i = 0; i < 4; i++) louver.push(B(0.50, 0.011, 0.07, 0, 1.115 - i * 0.072, -0.96 - i * 0.075, 0.3));
    body.add(new THREE.Mesh(mergeGeos(louver), trim));
    body.add(new THREE.Mesh(mergeGeos([B(0.028, 0.065, 0.19, 0, 1.265, -0.66, -0.35)]), paint));
  }

  /* ── 바퀴 ─────────────────────────────────────────────── */
  const wheelStyle = spec.id === 'vx' ? 'fan' : spec.id === 'slide' ? 'mesh10' : 'twin5';
  const wheelFront = makeWheel(D.wheelR, D.widthF, wheelStyle, D.rim, D.caliper);
  const wheelRear = makeWheel(D.wheelR, D.widthR, wheelStyle, D.rim, D.caliper);
  const wheels = [];
  for (const [x, z, front] of [[D.trackF, D.axleF, true], [-D.trackF, D.axleF, true], [D.trackR, D.axleR, false], [-D.trackR, D.axleR, false]]) {
    const parts = front ? wheelFront : wheelRear;
    const pivot = new THREE.Group();
    pivot.position.set(x, D.wheelR, z);
    const flip = new THREE.Group();
    flip.rotation.y = x > 0 ? 0 : Math.PI;
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(parts.tireGeo, parts.tireMat);
    tire.castShadow = true;
    spin.add(tire);
    spin.add(new THREE.Mesh(parts.rimGeo, parts.rimMat));
    const disc = new THREE.Mesh(parts.discGeo, parts.discMat);
    disc.rotation.z = Math.PI / 2;
    spin.add(disc);
    const caliper = new THREE.Mesh(parts.caliperGeo, parts.caliperMat);
    caliper.position.set(0, 0.075, -0.085);
    flip.add(caliper);
    flip.add(spin);
    pivot.add(flip);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  /* ── 접지 그림자(가짜) ────────────────────────────────── */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  {
    const g = shadowCanvas.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.52)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, Math.abs(noseZ - tailZ) * 1.06),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.016;
  shadow.renderOrder = 1;
  root.add(shadow);

  root.userData = {
    wheels, body, tails, neon: shadow, headMat, tailMat, paint, revMat, shadowTex,
    wheelR: D.wheelR, design: D,
  };
  return root;
}

/* ── 차체 자세(롤·피치) ──────────────────────────────────
 * 바퀴는 지면에 붙인 채 차체(body 그룹)만 기울인다.
 */
const ROLL_PIVOT_Y = 0.42;

export function applyBodyAttitude(model, roll = 0, pitch = 0) {
  const body = model.userData && model.userData.body;
  if (!body) {
    model.rotation.z = roll;
    model.rotation.x = pitch;
    return;
  }
  body.rotation.z = roll;
  body.rotation.x = pitch;
  body.position.x = ROLL_PIVOT_Y * Math.sin(roll);
  body.position.y = ROLL_PIVOT_Y * (1 - Math.cos(roll))
    + 0.30 * Math.abs(Math.sin(roll))
    + 0.90 * Math.abs(Math.sin(pitch));
  body.position.z = -0.35 * Math.sin(pitch);
}

export function updateCarVisual(car, dt) {
  const u = car.model.userData;
  const spinRate = car.speed / (u.wheelR || 0.36);
  for (const w of u.wheels) {
    w.spin.rotation.x -= spinRate * dt;
    // +steerVisual = 우조향 → 앞바퀴도 차의 오른쪽으로 (로컬 -X)
    if (w.front) w.pivot.rotation.y = -car.steerVisual * 0.44;
  }
  const braking = car.brake > 0.3;
  for (const t of u.tails) {
    t.material.emissiveIntensity = braking ? 3.6 : 1.0;
  }
  if (u.revMat) u.revMat.emissiveIntensity = car.reversing ? 3.0 : 0;
  if (u.neon) u.neon.material.opacity = 0.5;
}
