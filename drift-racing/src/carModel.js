// 절차적 3D 차량 모델 — 실제 양산 스포츠카 비율의 매끈한 차체(로프트) + 유리 캐빈 +
// 휀더 플레어·스커트·디퓨저·듀얼 배기·리어 윙, 트레드 타이어와 멀티스포크 알로이 휠.
import THREE from './three.js?v=20261115e';

export const CARS = [
  {
    id: 'gt', name: 'GT-01 AERO', role: '밸런스 스포츠카', color: 0x2f7cff, ui: '#43e6ff',
    maxSpeed: 56, accel: 15.5, grip: 1.0, driftGrip: 1.0, steer: 1.0, hp: 1.0,
    stats: { 속도: 0.74, 가속: 0.8, 드리프트: 0.66 }, spoiler: 'lip',
  },
  {
    id: 'slide', name: 'SLIDE-R', role: '드리프트 특화 쿠페', color: 0xff6a2a, ui: '#ff8b3d',
    maxSpeed: 52, accel: 14.2, grip: 0.92, driftGrip: 1.26, steer: 1.08, hp: 0.95,
    stats: { 속도: 0.64, 가속: 0.74, 드리프트: 0.97 }, spoiler: 'gt',
  },
  {
    id: 'vx', name: 'VX-9 FURY', role: '최고속 하이퍼카', color: 0xb9f542, ui: '#b6ff45',
    maxSpeed: 64, accel: 13.2, grip: 0.88, driftGrip: 0.9, steer: 0.94, hp: 0.88,
    stats: { 속도: 0.96, 가속: 0.62, 드리프트: 0.55 }, spoiler: 'swan',
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

/* ── 차체 단면 ─────────────────────────────────────────
 * 모서리가 단단한 둥근 사각형 단면(수퍼엘립스)에
 * 벨트라인 위 좁힘(tumblehome)과 아래 말림을 준다 → 어깨선이 살아 있는 차체.
 * k = 0 (오른쪽) → segs/4 (위) → segs/2 (왼쪽) → 3segs/4 (아래)
 */
const RING_P = 0.42;

function bodyRing(sec, segs = 32) {
  const { w, h, cy } = sec;
  const topW = sec.topW != null ? sec.topW : w * 0.86;
  const botW = sec.botW != null ? sec.botW : w * 0.8;
  const pts = [];
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const sa = Math.sin(a), ca = Math.cos(a);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), RING_P);
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), RING_P);
    const y = cy + h * sy;
    const t = (sy + 1) / 2;                     // 0 = 바닥, 1 = 지붕
    // 어깨선(0.5)에서 꺾이는 선형 폭 변화 — 부드러운 곡면 대신 각을 만든다
    const half = t < 0.5
      ? botW + (w - botW) * (t / 0.5)
      : w + (topW - w) * ((t - 0.5) / 0.5);
    pts.push([cx * half, y]);
  }
  return pts;
}

function loftGeometry(sections, segs = 32, capFront = true, capBack = true) {
  const rings = sections.map((s) => ({ z: s.z, ring: bodyRing(s, segs) }));
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
function loftStrip(sections, k0, k1, segs = 32) {
  const rings = sections.map((s) => ({ z: s.z, ring: bodyRing(s, segs) }));
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

/* ── 타이어·휠 ───────────────────────────────────────── */
function makeWheelMeshes(r = 0.36, width = 0.32) {
  const halfW = width / 2;
  const profile = [
    [0.255, -halfW * 1.0],
    [0.30, -halfW * 1.0],
    [0.338, -halfW * 0.86],
    [r, -halfW * 0.5],
    [r, halfW * 0.5],
    [0.338, halfW * 0.86],
    [0.30, halfW * 1.0],
    [0.255, halfW * 1.0],
  ];
  const tireGeo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 32);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x191a1d, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide,
  });

  const rimEntries = [];
  const barrel = new THREE.CylinderGeometry(0.255, 0.255, width * 0.9, 26, 1, true);
  rimEntries.push({ geo: barrel, m: M(0, 0, 0, 0, 0, Math.PI / 2) });
  const lip = new THREE.TorusGeometry(0.252, 0.018, 6, 28);
  rimEntries.push({ geo: lip, m: M(halfW * 0.84, 0, 0, 0, Math.PI / 2, 0) });
  for (let i = 0; i < 5; i++) {
    for (const dir of [-1, 1]) {
      const ang = (i / 5) * Math.PI * 2 + (dir > 0 ? 0.3 : -0.3);
      const spoke = new THREE.BoxGeometry(0.032, 0.23, 0.048);
      rimEntries.push({
        geo: spoke,
        m: M(halfW * 0.6, Math.cos(ang) * 0.125, Math.sin(ang) * 0.125,
          0, 0, 0, 1, 1, 1).multiply(M(0, 0, 0, ang, 0, 0)),
      });
    }
  }
  const hub = new THREE.CylinderGeometry(0.058, 0.058, width * 0.66, 12);
  rimEntries.push({ geo: hub, m: M(0, 0, 0, 0, 0, Math.PI / 2) });
  const rimGeo = mergeGeos(rimEntries);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x6f7883, roughness: 0.34, metalness: 0.85 });

  const discGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 22);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x62656a, roughness: 0.5, metalness: 0.9 });
  const caliperGeo = new THREE.BoxGeometry(0.058, 0.11, 0.07);
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xc94a2c, roughness: 0.45, metalness: 0.4 });

  return { tireGeo, tireMat, rimGeo, rimMat, discGeo, discMat, caliperGeo, caliperMat };
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
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';       // yaw 다음 로컬 피치(지형 경사)
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({
    color: spec.color, metalness: 0.42, roughness: 0.3,
    clearcoat: 1.0, clearcoatRoughness: 0.07, envMapIntensity: 0.8,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 0.5, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x24282f, roughness: 0.62, metalness: 0.25 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b1119, roughness: 0.07, metalness: 0.4,
    clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.25,
    transparent: true, opacity: 0.97,
  });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdce4ee, roughness: 0.15, metalness: 1.0 });
  const headMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef9ff, emissive: 0xbfe9ff, emissiveIntensity: 1.5,
    roughness: 0.1, metalness: 0.1, clearcoat: 1,
  });
  const tailMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8172c, emissive: 0xff1024, emissiveIntensity: 0.9,
    roughness: 0.22, metalness: 0.1, clearcoat: 1,
  });
  const revMat = new THREE.MeshStandardMaterial({
    color: 0xf6fbff, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3,
  });

  const long = spec.id === 'vx' ? 1.05 : spec.id === 'slide' ? 0.99 : 1.0;
  const L = (v) => v * long;

  /* ── 하부 차체(메인 로프트) ─────────────────────────────
   * z 를 촘촘히 샘플링해 단면을 만들고, 바퀴 위치에서 차체 아래 모서리를
   * 아치 모양으로 들어올린다 → 실제 휠 아치가 파인 차체.
   */
  const KEY = [
    [2.18, 0.86, 0.52], [2.05, 0.94, 0.60], [1.85, 0.99, 0.69],
    [1.55, 1.01, 0.77], [1.15, 1.02, 0.83], [0.85, 1.02, 0.86],
    [0.45, 1.03, 0.895], [0.00, 1.03, 0.905], [-0.50, 1.03, 0.905],
    [-1.00, 1.02, 0.895], [-1.45, 1.00, 0.885], [-1.80, 0.97, 0.855],
    [-2.02, 0.93, 0.82], [-2.16, 0.89, 0.76],
  ];
  const FRONT_AXLE = L(1.40), REAR_AXLE = L(-1.42);
  const ARCH_R = 0.47;
  const archAt = (z) => {
    let h = 0;
    for (const c of [FRONT_AXLE, REAR_AXLE]) {
      const dz = Math.abs(z - c);
      if (dz < ARCH_R) h = Math.max(h, 0.24 + 0.485 * Math.sqrt(1 - (dz / ARCH_R) ** 2));
    }
    return h;
  };
  const keyAt = (z) => {
    const zz = z / long;
    for (let i = 0; i < KEY.length - 1; i++) {
      const a = KEY[i], b = KEY[i + 1];
      if (zz <= a[0] && zz >= b[0]) {
        const t = (a[0] - zz) / (a[0] - b[0]);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    const e = zz > KEY[0][0] ? KEY[0] : KEY[KEY.length - 1];
    return [e[1], e[2]];
  };
  const sections = [];
  const Z0 = L(2.18), Z1 = L(-2.16);
  const STEPS = 56;
  for (let i = 0; i <= STEPS; i++) {
    const z = Z0 + (Z1 - Z0) * (i / STEPS);
    const [w, top] = keyAt(z);
    const baseBot = z > L(2.10) ? 0.26 : z < L(-1.86) ? 0.26 + (L(-1.86) - z) * 0.65 : 0.24;
    const bot = Math.min(top - 0.035, Math.max(baseBot, archAt(z)));
    sections.push({
      z, w, top, bot,
      topW: w * 0.86, botW: w * 0.8,
      cy: (top + bot) / 2, h: (top - bot) / 2,
    });
  }
  const hull = new THREE.Mesh(loftGeometry(sections, 34), paint);
  hull.castShadow = true;
  hull.receiveShadow = true;
  body.add(hull);

  /* ── 유리 캐빈 ─────────────────────────────────────────
   * 벨트라인(0.88~0.91) 위에 얹히는 그린하우스. 지붕은 높고 평평하게, 옆유리는 세워서.
   */
  const cabin = [
    { z: L(0.88), top: 0.895, bot: 0.885, w: 0.64 },
    { z: L(0.70), top: 1.00, bot: 0.895, w: 0.68 },
    { z: L(0.46), top: 1.12, bot: 0.90, w: 0.70 },
    { z: L(0.20), top: 1.205, bot: 0.905, w: 0.70 },
    { z: L(0.00), top: 1.225, bot: 0.905, w: 0.70 },
    { z: L(-0.34), top: 1.215, bot: 0.905, w: 0.695 },
    { z: L(-0.66), top: 1.155, bot: 0.905, w: 0.68 },
    { z: L(-0.96), top: 1.05, bot: 0.90, w: 0.65 },
    { z: L(-1.22), top: 0.945, bot: 0.895, w: 0.58 },
  ].map((s) => ({
    z: s.z, w: s.w, top: s.top * 0.99, bot: s.bot,
    topW: s.w * 0.8, botW: s.w * 0.98,
    cy: (s.top * 0.99 + s.bot) / 2, h: (s.top * 0.99 - s.bot) / 2,
  }));
  const cabinMesh = new THREE.Mesh(loftGeometry(cabin, 34), glass);
  cabinMesh.castShadow = true;
  body.add(cabinMesh);

  // 지붕 패널(차체 색) — 유리와 겹치지 않게 살짝 밖으로 띄운다
  const roofShell = cabin
    .filter((s) => s.z <= L(0.26) && s.z >= L(-0.7))
    .map((s) => ({
      ...s, w: s.w * 1.012, h: s.h * 1.01, cy: s.cy + 0.006,
      top: s.top + 0.006, bot: s.bot + 0.006,
    }));
  const roof = new THREE.Mesh(loftStrip(roofShell, 4, 12, 34), paint);
  roof.material.side = THREE.DoubleSide;
  body.add(roof);

  /* ── 앞부분: 스플리터·그릴·인테이크 ───────────────────── */
  {
    const front = [];
    // 프론트 스플리터
    front.push({ geo: new THREE.BoxGeometry(1.66, 0.045, 0.22), m: M(0, 0.2, L(2.02), -0.08) });
    for (const s of [-1, 1]) {
      front.push({ geo: new THREE.BoxGeometry(0.08, 0.026, 0.15), m: M(s * 0.8, 0.21, L(2.1), 0.1) });
    }
    // 노즈 전면의 어두운 범퍼 페이스 + 그릴
    front.push({ geo: new THREE.BoxGeometry(1.52, 0.15, 0.05), m: M(0, 0.325, L(2.155), -0.1) });
    front.push({ geo: new THREE.BoxGeometry(0.62, 0.1, 0.05), m: M(0, 0.325, L(2.17), -0.1) });
    for (let i = -2; i <= 2; i++) {
      front.push({ geo: new THREE.BoxGeometry(0.016, 0.09, 0.02), m: M(i * 0.11, 0.325, L(2.18), -0.1) });
    }
    body.add(new THREE.Mesh(mergeGeos(front), dark));
  }

  // 보닛 벤트 (표면에 살짝 파인 슬롯)
  {
    const vents = [];
    for (const s of [-1, 1]) {
      vents.push({ geo: new THREE.BoxGeometry(0.13, 0.012, 0.26), m: M(s * 0.4, 0.762, L(1.34), -0.1) });
    }
    body.add(new THREE.Mesh(mergeGeos(vents), trim));
  }

  /* ── 헤드라이트 ───────────────────────────────────────── */
  {
    const housings = [];
    const lenses = [];
    for (const s of [-1, 1]) {
      // 노즈 전면(수직에 가까운 면)에 밀착한 램프
      housings.push({
        geo: new THREE.BoxGeometry(0.44, 0.095, 0.07),
        m: M(s * 0.6, 0.45, L(2.155), -0.12, s * 0.14, 0),
      });
      lenses.push({
        geo: new THREE.BoxGeometry(0.38, 0.055, 0.05),
        m: M(s * 0.6, 0.452, L(2.19), -0.12, s * 0.14, 0),
      });
      lenses.push({
        geo: new THREE.BoxGeometry(0.32, 0.016, 0.03),
        m: M(s * 0.61, 0.478, L(2.192), -0.12, s * 0.14, 0),
      });
    }
    body.add(new THREE.Mesh(mergeGeos(housings), trim));
    body.add(new THREE.Mesh(mergeGeos(lenses), headMat));
  }

  /* ── 테일라이트 · 후진등 ──────────────────────────────── */
  const tails = [];
  {
    // 테일 면의 어두운 배경 패널
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.17, 0.05), dark);
    panel.position.set(0, 0.635, L(-2.17));
    body.add(panel);
    // 가로로 이어지는 얇은 램프 바
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.055), tailMat);
    bar.position.set(0, 0.665, L(-2.19));
    body.add(bar);
    tails.push(bar);
    for (const s of [-1, 1]) {
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.095, 0.06), tailMat.clone());
      cl.position.set(s * 0.6, 0.655, L(-2.19));
      body.add(cl);
      tails.push(cl);
    }
    const rev = new THREE.Mesh(
      mergeGeos([
        { geo: new THREE.BoxGeometry(0.12, 0.04, 0.035), m: M(-0.2, 0.598, L(-2.19)) },
        { geo: new THREE.BoxGeometry(0.12, 0.04, 0.035), m: M(0.2, 0.598, L(-2.19)) },
      ]),
      revMat
    );
    body.add(rev);
  }

  // 디퓨저 + 배기
  {
    const diff = [];
    diff.push({ geo: new THREE.BoxGeometry(1.4, 0.12, 0.34), m: M(0, 0.345, L(-2.03), 0.3) });
    for (let i = -2; i <= 2; i++) {
      diff.push({ geo: new THREE.BoxGeometry(0.045, 0.16, 0.3), m: M(i * 0.26, 0.345, L(-2.04), 0.3) });
    }
    body.add(new THREE.Mesh(mergeGeos(diff), dark));

    const pipes = [];
    const inner = [];
    for (const s of [-1, 1]) {
      pipes.push({ geo: new THREE.CylinderGeometry(0.062, 0.068, 0.16, 14, 1, true), m: M(s * 0.4, 0.375, L(-2.16), Math.PI / 2, 0, 0) });
      inner.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), m: M(s * 0.4, 0.375, L(-2.16), Math.PI / 2, 0, 0) });
    }
    body.add(new THREE.Mesh(mergeGeos(pipes), chrome));
    body.add(new THREE.Mesh(mergeGeos(inner), dark));
  }

  /* ── 사이드: 스커트·도어 라인·미러 ───────────────────── */
  {
    const skirts = [];
    for (const s of [-1, 1]) {
      skirts.push({ geo: new THREE.BoxGeometry(0.07, 0.08, 1.95), m: M(s * 0.99, 0.28, L(-0.12)) });
      // 사이드 벤트 (뒷바퀴 앞)
      skirts.push({ geo: new THREE.BoxGeometry(0.05, 0.12, 0.3), m: M(s * 0.995, 0.62, L(-1.05), 0, 0, s * 0.08) });
    }
    body.add(new THREE.Mesh(mergeGeos(skirts), trim));

    const lines = [];
    for (const s of [-1, 1]) {
      lines.push({ geo: new THREE.BoxGeometry(0.012, 0.3, 0.018), m: M(s * 1.028, 0.62, L(0.62)) });   // 프론트 도어 컷
      lines.push({ geo: new THREE.BoxGeometry(0.012, 0.3, 0.018), m: M(s * 1.03, 0.62, L(-0.42)) });   // 리어 도어 컷
      lines.push({ geo: new THREE.BoxGeometry(0.014, 0.03, 0.24), m: M(s * 1.035, 0.655, L(-0.1)) });   // 도어 핸들
    }
    body.add(new THREE.Mesh(mergeGeos(lines), trim));

    const arms = [];
    const shells = [];
    const glasses = [];
    for (const s of [-1, 1]) {
      arms.push({ geo: new THREE.BoxGeometry(0.17, 0.045, 0.06), m: M(s * 0.9, 0.895, L(0.72), 0, s * 0.2, 0) });
      shells.push({ geo: new THREE.BoxGeometry(0.1, 0.075, 0.18), m: M(s * 0.99, 0.915, L(0.68), 0, s * 0.14, 0) });
      glasses.push({ geo: new THREE.BoxGeometry(0.015, 0.06, 0.15), m: M(s * 1.038, 0.915, L(0.68), 0, s * 0.14, 0) });
    }
    body.add(new THREE.Mesh(mergeGeos(arms), dark));
    body.add(new THREE.Mesh(mergeGeos(shells), paint));
    body.add(new THREE.Mesh(mergeGeos(glasses), glass));
  }

  /* ── 리어 윙 (차종별) ─────────────────────────────────── */
  {
    const type = spec.spoiler;
    if (type === 'lip') {
      // 덕테일 — 트렁크 끝이 살짝 들린 일체형 스포일러
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.26), paint);
      lip.position.set(0, 0.845, L(-1.98));
      lip.rotation.x = -0.22;
      body.add(lip);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.05, 0.1), paint);
      base.position.set(0, 0.812, L(-2.02));
      body.add(base);
    } else {
      const span = type === 'swan' ? 1.78 : 1.66;
      const wy = type === 'swan' ? 1.14 : 1.02;
      const wz = L(-2.0);
      const wing = new THREE.Mesh(airfoilGeo(0.44, 0.065, span), paint);
      wing.position.set(0, wy, wz);
      wing.rotation.x = -0.14;
      wing.castShadow = true;
      body.add(wing);
      const hard = [];
      for (const s of [-1, 1]) {
        if (type === 'swan') {
          hard.push({ geo: new THREE.BoxGeometry(0.04, 0.4, 0.1), m: M(s * span * 0.32, wy - 0.19, wz + 0.07, 0.4) });
        } else {
          hard.push({ geo: new THREE.BoxGeometry(0.045, 0.3, 0.09), m: M(s * span * 0.32, wy - 0.17, wz + 0.04, 0.18) });
        }
        hard.push({ geo: new THREE.BoxGeometry(0.018, 0.16, 0.46), m: M(s * span * 0.5, wy + 0.01, wz) });
      }
      body.add(new THREE.Mesh(mergeGeos(hard), trim));
    }
  }

  /* ── 휠 아치 마감 (아치 테두리 + 어두운 휠 하우스) ─────── */
  const wheelR = 0.36;
  const wheelPos = [
    [-0.88, L(1.40), true, 0.26],
    [0.88, L(1.40), true, 0.26],
    [-0.90, L(-1.42), false, 0.34],
    [0.90, L(-1.42), false, 0.34],
  ];

  /* ── 바퀴 ─────────────────────────────────────────────── */
  const wheelParts = makeWheelMeshes(wheelR, 0.32);
  const wheels = [];
  for (const [x, z, front, width] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelR, z);
    const flip = new THREE.Group();
    flip.rotation.y = Math.sign(x) > 0 ? 0 : Math.PI;
    const spin = new THREE.Group();
    const wScale = width / 0.32;
    const tire = new THREE.Mesh(wheelParts.tireGeo, wheelParts.tireMat);
    tire.castShadow = true;
    tire.scale.set(wScale, 1, 1);
    spin.add(tire);
    const rim = new THREE.Mesh(wheelParts.rimGeo, wheelParts.rimMat);
    rim.scale.set(wScale, 1, 1);
    spin.add(rim);
    const disc = new THREE.Mesh(wheelParts.discGeo, wheelParts.discMat);
    disc.rotation.z = Math.PI / 2;
    spin.add(disc);
    const caliper = new THREE.Mesh(wheelParts.caliperGeo, wheelParts.caliperMat);
    caliper.position.set(0, 0.085, -0.1);
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
    grd.addColorStop(0, 'rgba(0,0,0,0.5)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.24)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 4.8),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.016;
  shadow.renderOrder = 1;
  root.add(shadow);

  root.userData = {
    wheels, body, tails, neon: shadow, headMat, tailMat, paint, revMat, shadowTex, wheelParts,
  };
  return root;
}

/* ── 차체 자세(롤·피치) ──────────────────────────────────
 * 바퀴는 지면에 붙인 채 차체(body 그룹)만 기울인다.
 * 롤 축을 차축 높이 근처에 두고, 차체 아래 모서리가 지면을 뚫지 않게 살짝 들어올린다.
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
  const spinRate = car.speed / 0.36;
  for (const w of u.wheels) {
    w.spin.rotation.x -= spinRate * dt;
    // +steerVisual = 우조향 → 앞바퀴도 차의 오른쪽으로 (로컬 -X)
    if (w.front) w.pivot.rotation.y = -car.steerVisual * 0.44;
  }
  const braking = car.brake > 0.3;
  for (const t of u.tails) {
    t.material.emissiveIntensity = braking ? 3.6 : 0.9;
  }
  if (u.revMat) u.revMat.emissiveIntensity = car.reversing ? 3.0 : 0;
  if (u.neon) u.neon.material.opacity = 0.5;
}
