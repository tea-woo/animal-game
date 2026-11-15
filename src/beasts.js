// 조형 v2 — 해부학적 실루엣으로 다시 만든 12종 동물
// 몸통·목·머리·다리·꼬리·지느러미를 각각 단면 프로파일로 스윕해 유기적 곡면을 만든다.
import THREE from './three.js?v=20261115d';
import { merge, sweep, track, unitSphere, unitCone, vertexMaterial, TAU } from './sculpt.js?v=20261115d';
import { furMaterial, clumpMaterial, skinMaterial, scaleMaterial } from './textures.js?v=20261115d';
import { clamp, lerp } from './util.js?v=20261115d';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = (r = 1, g = r, b = r) => new THREE.Color(r, g, b);
const WHITE = W(1);
const C = (hex) => new THREE.Color(hex);
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
// hex 두 색을 섞어 곱셈 계수로 돌려준다 (텍스처 위에 얹는 정점 색)
const tintOf = (base, t) => () => new THREE.Color(base).lerp(new THREE.Color(t ?? base), 1);

function meshWith(geo, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  return m;
}

function sphPart(rx, ry, rz, o = {}) {
  return {
    geo: unitSphere(o.seg ?? 14),
    pos: o.pos,
    rot: o.rot,
    quat: o.quat,
    scale: [rx, ry, rz],
    color: o.color,
    colorFn: o.colorFn,
  };
}

function conePart(rx, h, o = {}) {
  return {
    geo: unitCone(o.seg ?? 6),
    pos: o.pos,
    rot: o.rot,
    quat: o.quat,
    scale: [rx, h, o.rz ?? rx],
    color: o.color,
    colorFn: o.colorFn,
  };
}

// ── 곡선 관 (평행 이동 프레임) ─────────────────────────────
// points: Vector3[], radii: [[rx, ry], ...] 또는 number[]
export function tubeGeometry(points, radii, opts = {}) {
  const n = points.length;
  const radial = opts.radial ?? 12;
  const colorFn = opts.colorFn;
  const capStart = opts.capStart !== false;
  const capEnd = opts.capEnd !== false;
  const uvFn = opts.uv;

  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-9) t.set(0, 1, 0);
    tangents.push(t.normalize());
  }
  // 평행 이동 프레임
  const normals = [];
  let nrm = new THREE.Vector3(0, 0, 1);
  if (Math.abs(tangents[0].dot(nrm)) > 0.9) nrm.set(1, 0, 0);
  nrm.crossVectors(tangents[0], nrm).normalize();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      q.setFromUnitVectors(tangents[i - 1], tangents[i]);
      nrm.applyQuaternion(q);
      // 누적 오차 제거
      nrm.addScaledVector(tangents[i], -nrm.dot(tangents[i])).normalize();
    }
    normals.push(nrm.clone());
  }

  const ringCount = n * (radial + 1);
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const T = tangents[i];
    const N = normals[i];
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    const r = radii[i];
    const rx = Array.isArray(r) ? r[0] : r;
    const ry = Array.isArray(r) ? r[1] : r;
    const t = n === 1 ? 0 : i / (n - 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const px = points[i].x + N.x * Math.cos(a) * rx + B.x * Math.sin(a) * ry;
      const py = points[i].y + N.y * Math.cos(a) * rx + B.y * Math.sin(a) * ry;
      const pz = points[i].z + N.z * Math.cos(a) * rx + B.z * Math.sin(a) * ry;
      positions.push(px, py, pz);
      if (colorFn) {
        const dir = V(N.x * Math.cos(a), N.y * Math.cos(a), N.z * Math.cos(a)).addScaledVector(B, Math.sin(a));
        col.copy(colorFn(V(px, py, pz), dir, t, a) || WHITE);
        colors.push(col.r, col.g, col.b);
      } else {
        colors.push(1, 1, 1);
      }
      const uv = uvFn ? uvFn(V(px, py, pz), t, a) : [j / radial, t];
      uvs.push(uv[0], uv[1]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + 1;
      const c = a + radial + 2;
      const d = a + radial + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  // 뚜껑
  const capAt = (idx, flip) => {
    const base = positions.length / 3;
    const p = points[idx];
    const T = tangents[idx];
    positions.push(p.x, p.y, p.z);
    if (colorFn) {
      col.copy(colorFn(p, T, idx / Math.max(1, n - 1), 0) || WHITE);
      colors.push(col.r, col.g, col.b);
    } else colors.push(1, 1, 1);
    uvs.push(0.5, idx === 0 ? 0 : 1);
    const ringStart = base + 1;
    for (let j = 0; j <= radial; j++) {
      const src = (idx * (radial + 1) + j) * 3;
      positions.push(positions[src], positions[src + 1], positions[src + 2]);
      const sc = idx * (radial + 1) + j;
      colors.push(colors[sc * 3], colors[sc * 3 + 1], colors[sc * 3 + 2]);
      uvs.push(uvs[sc * 2], uvs[sc * 2 + 1]);
    }
    for (let j = 0; j < radial; j++) {
      if (flip) indices.push(base, ringStart + j + 1, ringStart + j);
      else indices.push(base, ringStart + j, ringStart + j + 1);
    }
  };
  if (capStart) capAt(0, false);
  if (capEnd) capAt(n - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Catmull-Rom 스플라인을 따라 관을 만든다. pts: [[x,y,z,r], ...] */
function splineTube(pts, opts = {}) {
  const steps = opts.steps ?? 10;
  const curvePts = pts.map((p) => V(p[0], p[1], p[2]));
  const radiiPts = pts.map((p) => p[3]);
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.5);
  const N = Math.max(2, Math.round(steps * (pts.length - 1)));
  const points = [];
  const radii = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    points.push(curve.getPoint(t));
    const fi = t * (radiiPts.length - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(radiiPts.length - 1, i0 + 1);
    radii.push(lerp(radiiPts[i0], radiiPts[i1], fi - i0) * (opts.wide ?? 1));
  }
  return tubeGeometry(points, radii, { radial: opts.radial ?? 12, colorFn: opts.colorFn, capStart: opts.capStart, capEnd: opts.capEnd, uv: opts.uv });
}

/** 스플라인 위 점 목록 (리그용) */
function splinePoints(pts, count) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
  const out = [];
  for (let i = 0; i <= count; i++) out.push(curve.getPoint(i / count));
  return out;
}

// ── 털 뭉치 ────────────────────────────────────────────────
// 타원체 표면을 따라 작은 뭉치를 심는다. (무늬 텍스처를 곱하지 않는 재질과 함께 쓴다)
function tuftParts(cfg) {
  const parts = [];
  const c = cfg.center || V(0, 0, 0);
  const radii = cfg.radii || [0.3, 0.3, 0.3];
  const count = cfg.count ?? 40;
  const base = C(cfg.color ?? 0xffffff);
  const tip = C(cfg.tip ?? cfg.color ?? 0xffffff);
  const rnd = cfg.rnd || Math.random;
  for (let i = 0; i < count; i++) {
    const yy = 1 - ((i + 0.5) / count) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
    const phi = i * 2.399963 + (cfg.phase ?? 0);
    const n = V(Math.cos(phi) * ring, yy, Math.sin(phi) * ring);
    if (cfg.skip && cfg.skip(n)) continue;
    const at = cfg.at ?? 0.95;
    const surface = c.clone().add(V(n.x * radii[0] * at, n.y * radii[1] * at, n.z * radii[2] * at));
    const tilt = cfg.tilt ?? 0.35;
    const lean = n
      .clone()
      .multiplyScalar(1 - tilt)
      .add(V(0, cfg.sagY ?? -0.3, cfg.sagZ ?? -0.3).multiplyScalar(tilt))
      .normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), lean);
    const len = (cfg.len ?? 0.12) * (0.6 + rnd() * 0.75);
    const w = (cfg.width ?? 0.03) * (0.75 + rnd() * 0.6);
    const pos = surface.clone().addScaledVector(lean, len * 0.36);
    const k = (cfg.bias ?? 0) + rnd() * 0.3;
    const col = base.clone().lerp(tip, k);
    parts.push({
      geo: unitCone(cfg.seg ?? 5),
      quat: q,
      pos,
      scale: [w, len, w * (cfg.flat ?? 0.55)],
      color: col,
    });
  }
  return parts;
}


// ── 털 껍질 — 표면을 노이즈로 밀어 올린 층 ─────────────────
function fuzz(geo, opts = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const amp = opts.amp ?? 0.02;
  const fx = opts.fx ?? 26;
  const fy = opts.fy ?? 24;
  const fz = opts.fz ?? 30;
  const seed = opts.seed ?? 1.7;
  const bias = opts.bias ?? 0;
  const base = C(opts.color ?? 0xffffff);
  const colors = new Float32Array(pos.count * 3);
  const v = V();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * fx + seed) * Math.sin(y * fy + seed * 2.1) * Math.sin(z * fz + seed * 0.7);
    const k = (n * 0.55 + bias) * amp;
    v.set(x + nrm.getX(i) * k, y + nrm.getY(i) * k, z + nrm.getZ(i) * k);
    pos.setXYZ(i, v.x, v.y, v.z);
    const shade = 1 + n * (opts.shade ?? 0.18);
    colors[i * 3] = base.r * shade;
    colors[i * 3 + 1] = base.g * shade;
    colors[i * 3 + 2] = base.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}


// ── 털 뭉치 부채 — 표면에서 뻗는 굽은 가닥 ─────────────────
function clumpFan(cfg) {
  const parts = [];
  const c = cfg.center || V();
  const radii = cfg.radii || [0.3, 0.3, 0.3];
  const count = cfg.count ?? 30;
  const base = C(cfg.color ?? 0xffffff);
  const tip = C(cfg.tip ?? cfg.color ?? 0xffffff);
  const rnd = Math.random;
  for (let i = 0; i < count; i++) {
    const yy = 1 - ((i + 0.5) / count) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
    const phi = i * 2.399963 + (cfg.phase ?? 0);
    const n = V(Math.cos(phi) * ring, yy, Math.sin(phi) * ring);
    if (cfg.skip && cfg.skip(n)) continue;
    const at = cfg.at ?? 0.94;
    const p0 = c.clone().add(V(n.x * radii[0] * at, n.y * radii[1] * at, n.z * radii[2] * at));
    const dir = cfg.dir || n;
    const len = (cfg.len ?? 0.16) * (0.65 + rnd() * 0.7);
    const w = (cfg.width ?? 0.035) * (0.75 + rnd() * 0.55);
    const sag = cfg.sag || V(0, -0.35, -0.5);
    const tw = (rnd() - 0.5) * (cfg.twist ?? 0.2);
    const p1 = p0.clone().addScaledVector(dir, len * 0.45).addScaledVector(sag, len * 0.16).add(V(tw * len, 0, 0));
    const p2 = p0.clone().addScaledVector(dir, len * 0.88).addScaledVector(sag, len * 0.45).add(V(-tw * len, 0, 0));
    parts.push({
      geo: splineTube([[p0.x, p0.y, p0.z, w], [p1.x, p1.y, p1.z, w * 0.72], [p2.x, p2.y, p2.z, w * 0.1]], { radial: cfg.radial ?? 5, steps: cfg.steps ?? 3 }),
      color: base.clone().lerp(tip, (cfg.bias ?? 0) + rnd() * 0.45),
      keepColors: false,
    });
  }
  return parts;
}


// ── 털 덩어리 — 작은 타원 로브를 겹쳐 털 뭉치 실루엣을 만든다 ─
function lobeFan(cfg) {
  const parts = [];
  const c = cfg.center || V();
  const radii = cfg.radii || [0.3, 0.3, 0.3];
  const count = cfg.count ?? 40;
  const base = C(cfg.color ?? 0xffffff);
  const tip = C(cfg.tip ?? cfg.color ?? 0xffffff);
  const rnd = Math.random;
  for (let i = 0; i < count; i++) {
    const yy = 1 - ((i + 0.5) / count) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
    const phi = i * 2.399963 + (cfg.phase ?? 0);
    const n = V(Math.cos(phi) * ring, yy, Math.sin(phi) * ring);
    if (cfg.skip && cfg.skip(n)) continue;
    const at = cfg.at ?? 1.0;
    const r = (cfg.r ?? 0.1) * (0.72 + rnd() * 0.6) * (cfg.scaleR ?? 0.85);
    const p = c.clone().add(V(n.x * radii[0] * at, n.y * radii[1] * at, n.z * radii[2] * at));
    p.add(V((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03));
    const k = (cfg.bias ?? 0) + rnd() * (cfg.spread ?? 0.4);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n.clone().normalize());
    parts.push(sphPart(r * (cfg.sx ?? 1.05), r * (cfg.sy ?? 0.62), r * (cfg.sz ?? 1.05), {
      pos: [p.x, p.y, p.z],
      quat: q,
      color: base.clone().lerp(tip, k),
      seg: cfg.seg ?? 8,
    }));
  }
  return parts;
}

// ── 머리 ───────────────────────────────────────────────────
// profile: [t, z, y, rx, ry] — 뒤통수 → 코끝
function makeHead(cfg, mats, eyeMat) {
  const head = new THREE.Group();
  const prof = track(cfg.profile);
  const N = cfg.steps ?? 22;
  const radial = cfg.radial ?? 18;
  const secs = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const [z, y, rx, ry] = prof(t);
    secs.push({ p: V(0, y, z), rx, ry });
  }
  const geo = sweep(secs, {
    radial,
    capStart: true,
    capEnd: true,
    uv: (p, t, a) => [a / TAU, t],
    colorFn: (p, d, t) => cfg.color(t, d),
  });
  head.add(meshWith(geo, mats.fur));

  const zs = prof(0)[0];
  const ze = prof(1)[0];
  const span = ze - zs;

  // 볼 · 광대
  if (cfg.cheeks) {
    const cp = [];
    for (const sd of [-1, 1]) {
      cp.push(sphPart(cfg.cheeks.rx, cfg.cheeks.ry, cfg.cheeks.rz, {
        pos: [sd * cfg.cheeks.x, cfg.cheeks.y, cfg.cheeks.z],
        rot: [0, sd * 0.2, 0],
        colorFn: cfg.cheeks.color,
      }));
    }
    head.add(meshWith(merge(cp), mats.fur));
  }
  // 눈두덩
  if (cfg.brow) {
    const bp = [];
    for (const sd of [-1, 1]) {
      bp.push(sphPart(cfg.brow.rx, cfg.brow.ry, cfg.brow.rz, {
        pos: [sd * cfg.brow.x, cfg.brow.y, cfg.brow.z],
        rot: [0, 0, sd * 0.25],
        colorFn: cfg.brow.color,
      }));
    }
    head.add(meshWith(merge(bp), mats.fur));
  }

  // 눈
  const eyeParts = [];
  const e = cfg.eyes;
  for (const sd of [-1, 1]) {
    const ex = sd * e.x;
    // 눈두덩 테두리 (짙은 피부)
    eyeParts.push(sphPart(e.r * 1.7, e.r * 1.5, e.r * 0.9, { pos: [ex, e.y, e.z - e.r * 0.35], color: e.rim ?? 0x241a12, seg: 12 }));
    // 안구
    eyeParts.push(sphPart(e.r, e.r * 1.02, e.r * 0.92, { pos: [ex, e.y, e.z], color: e.iris, seg: 14 }));
    // 동공
    eyeParts.push(sphPart(e.r * 0.3, e.r * (e.slit ? 0.86 : 0.62), e.r * 0.34, { pos: [ex, e.y, e.z + e.r * 0.62], color: 0x05040a, seg: 10 }));
    // 각막 반사
    eyeParts.push(sphPart(e.r * 0.26, e.r * 0.26, e.r * 0.16, { pos: [ex - sd * e.r * 0.3, e.y + e.r * 0.34, e.z + e.r * 0.72], color: 0xffffff, seg: 8 }));
    // 위 눈꺼풀
    eyeParts.push(sphPart(e.r * 1.25, e.r * 0.62, e.r * 0.85, {
      pos: [ex, e.y + e.r * 0.72, e.z - e.r * 0.1],
      rot: [0.42, 0, 0],
      colorFn: cfg.lidColor,
    }));
  }

  // 코
  if (cfg.nose) {
    const n = cfg.nose;
    const np = [];
    np.push(sphPart(n.w, n.h, n.d, { pos: [0, n.y, n.z], color: n.color ?? 0x241a14, seg: 12 }));
    for (const sd of [-1, 1]) {
      np.push(sphPart(n.w * 0.26, n.h * 0.3, n.d * 0.28, { pos: [sd * n.w * 0.44, n.y - n.h * 0.1, n.z + n.d * 0.7], color: 0x0b0806, seg: 7 }));
    }
    if (n.philtrum) {
      np.push(sphPart(n.w * 0.07, n.h * 1.5, n.d * 0.3, { pos: [0, n.y - n.h * 1.1, n.z + n.d * 0.5], color: 0x120d0a, seg: 6 }));
    }
    head.add(meshWith(merge(np), mats.plain));
  }

  // 입술선
  const jcfg = cfg.jaw || {};
  head.add(meshWith(merge(eyeParts), eyeMat || mats.eye));

  // 아래턱
  const jaw = new THREE.Group();
  jaw.position.set(0, (jcfg.y ?? -0.06) * 0.86, jcfg.z ?? span * 0.45);
  jaw.rotation.x = jcfg.open ?? 0;
  jaw.scale.set(0.78, 0.66, 0.9);
  head.add(jaw);
  const jp = cfg.jawProfile;
  if (jp) {
    const jprof = track(jp);
    const jsecs = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const [z, y, rx, ry] = jprof(t);
      jsecs.push({ p: V(0, y, z), rx, ry });
    }
    jaw.add(meshWith(sweep(jsecs, { radial: 12, capStart: true, capEnd: true, colorFn: (p, d, t) => cfg.jawColor ? cfg.jawColor(t, d) : WHITE }), mats.jaw || mats.fur));
  }

  // 이빨
  if (cfg.teeth) {
    const tp = [];
    const tm = cfg.teeth;
    for (const sd of [-1, 1]) {
      if (tm.canines !== false) {
        tp.push(conePart(tm.w * 1.15, tm.len, { pos: [sd * tm.x, tm.y, tm.z], rot: [Math.PI, 0, sd * 0.05], color: 0xf6efdd, seg: 6 }));
        tp.push(conePart(tm.w * 0.8, tm.len * 0.72, { pos: [sd * tm.x, tm.y - tm.len * 0.62, tm.z - 0.01], rot: [0, 0, sd * 0.05], color: 0xeee5d0, seg: 6 }));
      }
      for (let k = 0; k < (tm.incisors ?? 3); k++) {
        const ox = (k - 1) * tm.w * 0.9;
        tp.push(conePart(tm.w * 0.34, tm.len * 0.42, { pos: [sd * tm.x * 0.55 + ox, tm.y + 0.005, tm.z + 0.02], rot: [Math.PI, 0, 0], color: 0xf2ead6, seg: 5 }));
      }
    }
    jaw.add(meshWith(merge(tp), mats.plain));
  }

  // 혀
  let tongue = null;
  if (cfg.tongue) {
    tongue = new THREE.Group();
    tongue.position.set(0, (jcfg.y ?? -0.06) + 0.02, (jcfg.z ?? 0) + 0.05);
    jaw.add(tongue);
    tongue.add(meshWith(merge([sphPart(cfg.tongueW ?? 0.05, 0.012, cfg.tongueL ?? 0.1, { pos: [0, 0, 0.04], color: cfg.tongueColor ?? 0xa8555c })]), mats.plain));
    tongue.scale.z = 0.001;
  }

  // 귀
  const ears = [];
  const ec = cfg.ears;
  if (ec) {
    for (const sd of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(sd * ec.x, ec.y, ec.z);
      ear.rotation.z = sd * (ec.out ?? -0.3) * 0.7;
      ear.rotation.x = ec.tilt ?? -0.1;
      ear.rotation.y = sd * (ec.yaw ?? 0.2);
      head.add(ear);
      const parts = [];
      if (ec.type === 'pointed') {
        parts.push({
          geo: sweep(
            [
              { p: V(0, 0, 0.01), rx: ec.r * 1.15, ry: ec.r * 0.5 },
              { p: V(0, ec.h * 0.45, 0.0), rx: ec.r * 0.95, ry: ec.r * 0.42 },
              { p: V(0, ec.h, -0.01), rx: ec.r * 0.16, ry: ec.r * 0.1 },
            ],
            { radial: 10, capStart: true, capEnd: true, colorFn: () => WHITE }
          ),
          scale: [1, 1, 1],
        });
        parts.push({
          geo: sweep(
            [
              { p: V(0, ec.r * 0.16, ec.r * 0.34), rx: ec.r * 0.8, ry: ec.r * 0.22 },
              { p: V(0, ec.h * 0.5, ec.r * 0.26), rx: ec.r * 0.62, ry: ec.r * 0.18 },
              { p: V(0, ec.h * 0.9, ec.r * 0.1), rx: ec.r * 0.12, ry: ec.r * 0.05 },
            ],
            { radial: 8, capStart: false, capEnd: true, colorFn: () => C(ec.innerColor ?? 0x3a2a20) }
          ),
          scale: [1, 1, 1],
          keepColors: true,
        });
      } else {
        // 둥근 컵 모양 귀
        const R = ec.r;
        const H = ec.h ?? ec.r * 1.2;
        parts.push({
          geo: sweep(
            [
              { p: V(0, 0, 0), rx: R * 1.1, ry: R * 0.55 },
              { p: V(0, H * 0.55, -R * 0.06), rx: R * 1.0, ry: R * 0.5 },
              { p: V(0, H, -R * 0.16), rx: R * 0.55, ry: R * 0.3 },
            ],
            { radial: 12, capStart: true, capEnd: true, colorFn: () => WHITE }
          ),
          scale: [1, 1, 1],
        });
        parts.push({
          geo: sweep(
            [
              { p: V(0, H * 0.16, R * 0.24), rx: R * 0.66, ry: R * 0.26 },
              { p: V(0, H * 0.6, R * 0.16), rx: R * 0.55, ry: R * 0.2 },
              { p: V(0, H * 0.9, R * 0.02), rx: R * 0.22, ry: R * 0.1 },
            ],
            { radial: 10, capStart: false, capEnd: true, colorFn: () => C(ec.innerColor ?? 0x4a3226) }
          ),
          scale: [1, 1, 1],
          keepColors: true,
        });
      }
      ear.add(meshWith(merge(parts), mats.fur));
      ears.push(ear);
    }
  }

  return { head, jaw, ears, tongue, span, zs, ze };
}

// ── 다리 ───────────────────────────────────────────────────
function buildLeg(parent, o) {
  const hip = new THREE.Group();
  hip.position.set(o.x, o.y, o.z);
  hip.rotation.x = o.baseHip ?? 0;
  parent.add(hip);

  const tint = o.tint || (() => WHITE);
  const mat = o.mat;
  const total = o.upper + o.lower + o.pastern;

  // 상완/대퇴 — 근육 덩어리에서 가늘어지는 스윕
  const upperSecs = [
    { p: V(0, o.rTop * 2.2, 0), rx: o.rTop * 0.85, ry: o.rTop * 1.0 },
    { p: V(0, o.rTop * 0.8, 0), rx: o.rTop * 1.04, ry: o.rTop * 1.12 },
    { p: V(0, -o.upper * 0.1, o.front ? 0.014 : -0.018), rx: o.rTop * 1.0, ry: o.rTop * 1.22 },
    { p: V(0, -o.upper * 0.38, 0), rx: o.rTop * 0.94, ry: o.rTop * 1.02 },
    { p: V(0, -o.upper * 0.68, 0), rx: o.rTop * 0.84, ry: o.rTop * 0.86 },
    { p: V(0, -o.upper * 0.92, 0), rx: o.rMid * 1.0, ry: o.rMid * 1.0 },
    { p: V(0, -o.upper, 0), rx: o.rMid * 0.88, ry: o.rMid * 0.9 },
  ];
  hip.add(meshWith(sweep(upperSecs, { radial: 14, capStart: false, colorFn: (p, d) => tint(p, d, true) }), mat));

  const knee = new THREE.Group();
  knee.position.y = -o.upper;
  knee.rotation.x = o.baseKnee ?? 0;
  hip.add(knee);
  // 무릎/비절 관절 덩어리
  knee.add(meshWith(merge([sphPart(o.rMid * 0.86, o.rMid * 0.9, o.rMid * 0.92, { colorFn: (x, y, z, nx, ny, nz) => tint({ x, y, z }, { x: nx, y: ny, z: nz }, false) })]), mat));

  const lowerSecs = [
    { p: V(0, 0.02, 0), rx: o.rMid * 0.86, ry: o.rMid * 0.9 },
    { p: V(0, -o.lower * 0.22, o.front ? 0.004 : -0.026), rx: o.rMid * 0.82, ry: o.rMid * 0.86 },
    { p: V(0, -o.lower * 0.62, o.front ? 0.006 : -0.012), rx: o.rBot * 1.02, ry: o.rBot * 1.04 },
    { p: V(0, -o.lower, 0), rx: o.rBot * 0.92, ry: o.rBot * 0.94 },
  ];
  knee.add(meshWith(sweep(lowerSecs, { radial: 12, capStart: true, colorFn: (p, d) => tint(p, d, false) }), mat));

  const ankle = new THREE.Group();
  ankle.position.y = -o.lower;
  ankle.rotation.x = o.baseAnkle ?? 0;
  knee.add(ankle);

  const pastern = sweep(
    [
      { p: V(0, 0.02, 0), rx: o.rBot * 0.95, ry: o.rBot * 0.98 },
      { p: V(0, -o.pastern * 0.5, o.front ? 0.01 : -0.012), rx: o.rBot * 1.06, ry: o.rBot * 1.08 },
      { p: V(0, -o.pastern, 0.004), rx: o.rBot * 0.9, ry: o.rBot * 0.92 },
    ],
    { radial: 12, capStart: true, colorFn: (p, d) => tint(p, d, false) }
  );
  ankle.add(meshWith(pastern, mat));

  const paw = new THREE.Group();
  paw.position.y = -o.pastern;
  ankle.add(paw);
  const pawTint = (x, y, z, nx, ny, nz) => tint({ x, y, z }, { x: nx, y: ny, z: nz }, false);
  const pw = o.pawHalf ?? o.rBot * 0.8;
  const pl = o.pawLen ?? o.rBot * 2;

  if (o.hoof) {
    // 발굽 — 넓고 편평한 원통
    const hp = [];
    hp.push(sphPart(o.rBot * 1.18, pw * 1.25, pl * 0.55, { pos: [0, -pw * 0.35, pl * 0.22], colorFn: o.hoofColor ? () => C(o.hoofColor) : pawTint }));
    hp.push(sphPart(o.rBot * 0.98, pw * 0.7, pl * 0.6, { pos: [0, -pw * 1.05, pl * 0.3], colorFn: o.hoofColor ? () => C(o.hoofColor) : pawTint }));
    paw.add(meshWith(merge(hp), mat));
    // 발톱
    const nails = [];
    const toes = o.toes ?? 3;
    for (let i = 0; i < toes; i++) {
      const tx = (i - (toes - 1) / 2) * o.rBot * 0.78;
      nails.push(sphPart(o.rBot * 0.3, pw * 0.42, pl * 0.2, { pos: [tx, -pw * 0.72, pl * 0.62], color: o.clawColor ?? 0xd8cdb4 }));
    }
    paw.add(meshWith(merge(nails), mat));
  } else {
    const parts = [];
    // 발바닥 덩어리
    parts.push(sphPart(o.rBot * (o.plantigrade ? 1.3 : 1.22), pw * 1.1, pl * 0.66, { pos: [0, -pw * 0.5, pl * 0.28], colorFn: pawTint }));
    // 발가락
    const toes = o.toes ?? 4;
    for (let i = 0; i < toes; i++) {
      const tx = (i - (toes - 1) / 2) * o.rBot * 0.66;
      const tz = pl * 0.66 + Math.abs(i - (toes - 1) / 2) * -o.rBot * 0.1;
      parts.push(sphPart(o.rBot * 0.5, pw * 0.7, pl * 0.34, { pos: [tx, -pw * 0.58, tz], colorFn: pawTint, seg: 10 }));
    }
    paw.add(meshWith(merge(parts), mat));
    if (o.claws) {
      const cp = [];
      for (let i = 0; i < toes; i++) {
        const tx = (i - (toes - 1) / 2) * o.rBot * 0.66;
        cp.push(conePart(o.rBot * 0.15, o.clawLen ?? 0.1, {
          pos: [tx, -pw * 0.78, pl * 0.86],
          rot: [Math.PI * 0.66, 0, 0],
          color: o.clawColor ?? 0xe8dfc8,
          seg: 5,
        }));
      }
      paw.add(meshWith(merge(cp), o.plain || mat));
    }
  }

  return {
    hip,
    knee,
    ankle,
    paw,
    front: !!o.front,
    baseHip: o.baseHip ?? 0,
    baseKnee: o.baseKnee ?? 0,
    baseAnkle: o.baseAnkle ?? 0,
  };
}

// ── 꼬리 ───────────────────────────────────────────────────
function buildTail(parent, o) {
  const segs = o.segs ?? 5;
  const chain = [];
  let bone = new THREE.Group();
  bone.position.set(0, o.y ?? 0.1, o.z ?? -0.6);
  bone.rotation.x = o.basePitch ?? 0;
  parent.add(bone);
  chain.push(bone);
  const mat = o.mat;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -o.len;
    bone.add(seg);
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const r0 = lerp(o.r0, o.r1, t0);
    const r1 = lerp(o.r0, o.r1, t1);
    const secs = [
      { p: V(0, 0, 0.02), rx: r0 * 1.05, ry: r0 * 1.02 },
      { p: V(0, 0, -o.len * 0.55), rx: (r0 + r1) * 0.5, ry: (r0 + r1) * 0.5 },
      { p: V(0, 0, -o.len - 0.02), rx: r1 * 1.02, ry: r1 * 1.0 },
    ];
    seg.add(meshWith(sweep(secs, { radial: 10, colorFn: (p, d, t) => (o.tint ? o.tint(t0 + (t1 - t0) * t) : WHITE) }), mat));
    chain.push(seg);
    bone = seg;
  }
  if (o.tuft) {
    const last = chain[chain.length - 1];
    const L = o.tuft.len ?? 0.2;
    const R = o.tuft.r ?? 0.07;
    const tp = [sphPart(R * 1.05, R * 1.05, L * 0.42, { pos: [0, 0, -L * 0.34], color: o.tuft.color })];
    if (o.tuft.fur) {
      tp.push(...lobeFan({
        center: V(0, 0, -L * 0.42),
        radii: [R * 1.0, R * 1.0, L * 0.5],
        count: o.tuft.count ?? 22,
        r: R * 0.62,
        color: o.tuft.color,
        tip: o.tuft.tip ?? o.tuft.color,
        skip: (n) => n.z > 0.75,
      }));
    }
    last.add(meshWith(merge(tp), o.tuft.mat || mat));
  }
  if (o.fluff) {
    // 꼬리 전체를 감싸는 긴 털 (늑대·여우)
    const last = chain[chain.length - 1];
    const parts = [];
    for (let i = 1; i < chain.length; i++) {
      const rr = lerp(o.r0, o.r1, i / segs);
      parts.push(...lobeFan({
        center: V(0, 0, -o.len * 0.5),
        radii: [rr * 1.1, rr * 1.1, o.len * 0.6],
        count: 14,
        r: o.len * 0.5,
        color: o.fluffColor,
        tip: o.fluffTip,
        sy: 0.7,
      }));
    }
    last.add(meshWith(merge(parts), o.fluffMat || mat));
  }
  return chain;
}

// ── 사족 조립 ──────────────────────────────────────────────
function quad(cfg) {
  const root = new THREE.Group();
  const rig = { form: 'quadruped' };
  const body = new THREE.Group();
  body.position.y = cfg.hipY;
  root.add(body);
  rig.body = body;
  rig.hipY = cfg.hipY;

  const mats = cfg.mats;

  // 몸통
  const prof = track(cfg.torso);
  const N = cfg.steps ?? 30;
  const radial = cfg.radial ?? 20;
  const secs = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const [z, y, rx, ry] = prof(t);
    secs.push({ p: V(0, y, z), rx, ry });
  }
  const torso = sweep(secs, {
    radial,
    capStart: true,
    capEnd: true,
    uv: (p, t, a) => [a / TAU, t],
    colorFn: (p, d, t) => cfg.torsoColor(t, d),
  });
  body.add(meshWith(torso, mats.fur));
  rects: {
    // 어깨·볼기 덩어리
    if (cfg.masses) {
      const parts = [];
      for (const m of cfg.masses) {
        parts.push(sphPart(m.rx, m.ry, m.rz, { pos: m.pos, rot: m.rot, colorFn: m.color }));
      }
      body.add(meshWith(merge(parts), mats.fur));
    }
  }

  // 목
  const nk = cfg.neck;
  const neck = new THREE.Group();
  neck.position.set(0, nk.y, nk.z);
  neck.rotation.x = nk.tilt ?? 0;
  body.add(neck);
  rig.neck = neck;
  const nSecs = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    nSecs.push({
      p: V(0, lerp(nk.y0, nk.y1, t), lerp(0, nk.forward ?? 0, t)),
      rx: lerp(nk.r0, nk.r1, t),
      ry: lerp(nk.r0 * (nk.d0 ?? 1.02), nk.r1 * (nk.d1 ?? 1.02), t),
    });
  }
  neck.add(meshWith(sweep(nSecs, { radial: 16, capStart: true, capEnd: true, colorFn: (p, d, t) => cfg.torsoColor(0.98, d) }), mats.fur));

  // 머리
  const mount = new THREE.Group();
  mount.position.set(0, nk.y1 + (nk.headY ?? 0.02), (nk.forward ?? 0) + (nk.headZ ?? 0));
  mount.rotation.x = nk.headTilt ?? 0;
  if (cfg.headScale) mount.scale.setScalar(cfg.headScale);
  neck.add(mount);
  const H = makeHead(cfg.head, mats, mats.eye);
  mount.add(H.head);
  rig.head = H.head;
  rig.jaw = H.jaw;
  rig.jawBase = H.jaw.rotation.x;
  rig.ears = H.ears;
  rig.tongue = H.tongue;

  // 꼬리
  if (cfg.tail) {
    rig.tail = buildTail(body, cfg.tail);
    rig.tailBase = rig.tail[0].position.clone();
  } else {
    rig.tail = [];
  }

  // 다리
  const legOf = (l, front) => {
    const total = l.upper + l.lower + l.pastern + (l.pawDrop ?? 0);
    return buildLeg(body, {
      ...l,
      front,
      y: -(cfg.hipY - total),
      mat: mats.fur,
      plain: mats.plain,
      tint: (p, d, upper) => cfg.legColor(p, d, front, upper),
      claws: l.claws,
      toes: l.toes,
      clawColor: l.clawColor ?? cfg.clawColor,
      clawLen: l.clawLen,
      hoof: l.hoof,
      hoofColor: l.hoofColor,
      plantigrade: l.plantigrade,
      baseHip: l.baseHip ?? (front ? 0.04 : -0.14),
      baseKnee: l.baseKnee ?? (front ? 0.1 : 0.2),
      baseAnkle: l.baseAnkle ?? (front ? -0.1 : -0.22),
    });
  };
  rig.legs = {
    fl: legOf({ ...cfg.legs.front, x: -cfg.legSpread, z: cfg.legs.front.z }, true),
    fr: legOf({ ...cfg.legs.front, x: cfg.legSpread, z: cfg.legs.front.z }, true),
    bl: legOf({ ...cfg.legs.back, x: -cfg.legSpread * 1.04, z: cfg.legs.back.z }, false),
    br: legOf({ ...cfg.legs.back, x: cfg.legSpread * 1.04, z: cfg.legs.back.z }, false),
  };

  if (cfg.extras) cfg.extras({ body, neck, head: H.head, mount, rig, mats, H });

  return { root, rig, body };
}

// ══════════════════════════════════════════════════════════
//  사자
// ══════════════════════════════════════════════════════════
function buildLion() {
  const fur = furMaterial('lion-coat');
  const mane = clumpMaterial('lion-mane');
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.12, metalness: 0.15 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };
  const body = 0xd8b68a;

  const built = quad({
    id: 'lion',
    hipY: 0.96,
    mat: fur,
    mats,
    torso: [
      [0.00, -0.94, 0.13, 0.10, 0.12],
      [0.05, -0.88, 0.11, 0.20, 0.22],
      [0.14, -0.76, 0.07, 0.27, 0.29],
      [0.28, -0.56, 0.02, 0.30, 0.33],
      [0.42, -0.32, -0.02, 0.285, 0.30],
      [0.56, -0.06, -0.01, 0.30, 0.33],
      [0.70, 0.18, 0.01, 0.345, 0.375],
      [0.82, 0.38, 0.05, 0.365, 0.385],
      [0.92, 0.55, 0.05, 0.315, 0.34],
      [1.00, 0.66, 0.0, 0.21, 0.24],
    ],
    torsoColor: (t, d) => {
      if (d.y < -0.45) return W(1.09, 1.07, 1.02);
      if (d.y > 0.6) return W(0.97, 0.95, 0.92);
      return W(1.0);
    },
    legColor: (p, d, front) => {
      const k = p.y < -0.28 ? 1.06 : 1.0;
      return W(k, k * 0.985, k * 0.95);
    },
    masses: [
      { rx: 0.13, ry: 0.13, rz: 0.18, pos: [-0.16, 0.16, 0.42], color: () => W(1.02) },
      { rx: 0.13, ry: 0.13, rz: 0.18, pos: [0.16, 0.16, 0.42], color: () => W(1.02) },
    ],
    legSpread: 0.23,
    legs: {
      front: { upper: 0.36, lower: 0.34, pastern: 0.13, rTop: 0.135, rMid: 0.088, rBot: 0.072, pawHalf: 0.052, pawLen: 0.19, z: 0.42, toes: 4, claws: true, clawLen: 0.06 },
      back: { upper: 0.38, lower: 0.36, pastern: 0.11, rTop: 0.165, rMid: 0.095, rBot: 0.072, pawHalf: 0.052, pawLen: 0.19, z: -0.56, toes: 4, claws: true, clawLen: 0.06 },
    },
    clawColor: 0xe8dfc8,
    neck: { y: 0.06, z: 0.46, tilt: 0.62, y0: 0.0, y1: 0.24, forward: 0.14, r0: 0.235, r1: 0.175, headY: 0.02, headZ: 0.02, headTilt: -0.5 },
    headScale: 1.08,
    head: {
      steps: 24,
      profile: [
        [0.00, -0.235, 0.015, 0.095, 0.095],
        [0.12, -0.165, 0.03, 0.175, 0.165],
        [0.28, -0.055, 0.03, 0.215, 0.19],
        [0.44, 0.052, 0.022, 0.225, 0.20],
        [0.58, 0.13, 0.015, 0.20, 0.175],
        [0.70, 0.195, -0.004, 0.162, 0.148],
        [0.82, 0.265, -0.03, 0.122, 0.112],
        [0.92, 0.325, -0.05, 0.10, 0.095],
        [1.00, 0.372, -0.06, 0.062, 0.058],
      ],
      color: (t, d) => {
        if (d.y < -0.4) return W(1.14, 1.1, 1.04);
        if (t > 0.72) return W(1.08, 1.06, 1.0);
        return W(1.0);
      },
      lidColor: () => W(1.0, 0.97, 0.92),
      cheeks: { rx: 0.085, ry: 0.088, rz: 0.10, x: 0.145, y: -0.035, z: 0.155, color: () => W(1.12, 1.09, 1.02) },
      brow: { rx: 0.075, ry: 0.045, rz: 0.075, x: 0.105, y: 0.075, z: 0.19, color: () => W(1.04) },
      eyes: { x: 0.115, y: 0.052, z: 0.228, r: 0.035, iris: 0xb9862c, rim: 0x2b1d12, slit: true },
      nose: { w: 0.055, h: 0.036, d: 0.032, y: -0.04, z: 0.365, color: 0x3b2620, philtrum: true },
      jaw: { y: -0.055, z: 0.11, open: 0.02 },
      jawProfile: [
        [0.00, -0.055, 0.0, 0.075, 0.045],
        [0.45, -0.01, 0.06, 0.095, 0.042],
        [1.00, -0.045, 0.27, 0.055, 0.03],
      ],
      jawColor: () => W(1.12, 1.08, 1.0),
      teeth: { w: 0.016, len: 0.07, x: 0.055, y: -0.045, z: 0.16, incisors: 3 },
      tongue: true,
      ears: { type: 'round', x: 0.145, y: 0.115, z: -0.05, r: 0.07, h: 0.08, out: -0.55, tilt: -0.12, yaw: 0.3, innerColor: 0x4d3324 },
    },
    tail: { z: -0.9, y: 0.14, segs: 5, len: 0.17, r0: 0.055, r1: 0.032, mat: fur, tuft: { len: 0.24, r: 0.062, color: 0x402916, fur: true, count: 30, tip: 0x6b4622, mat: mane } },
    extras: ({ body: b, neck, rig, mats: mm }) => {
      // 갈기 — 목을 감싸는 털 덩어리 (로브를 겹쳐 뭉치감을 낸다)
      const mass = [
        sphPart(0.34, 0.31, 0.32, { pos: [0, 0.1, -0.02], color: 0x7a5228, seg: 18 }),
        sphPart(0.235, 0.2, 0.23, { pos: [0, 0.24, -0.06], color: 0x6f4a22, seg: 16 }),
        sphPart(0.29, 0.23, 0.25, { pos: [0, -0.12, 0.02], color: 0x6a4520, seg: 16 }),
      ];
      const lobes = [
        ...lobeFan({ center: V(0, 0.2, -0.05), radii: [0.3, 0.26, 0.29], count: 54, r: 0.075, at: 1.0, color: 0x6a4420, tip: 0x94682f, skip: (n) => n.z > 0.5 || n.y < -0.2 }),
        ...lobeFan({ center: V(0, 0.08, -0.02), radii: [0.33, 0.30, 0.31], count: 78, r: 0.085, at: 1.0, color: 0x6d4622, tip: 0x9a6c34, skip: (n) => n.z > 0.74 }),
        ...lobeFan({ center: V(0, 0.07, -0.03), radii: [0.36, 0.33, 0.33], count: 62, r: 0.07, at: 1.0, color: 0x835528, tip: 0xb5823f, phase: 1.4, skip: (n) => n.z > 0.68 }),
        ...lobeFan({ center: V(0, 0.02, -0.01), radii: [0.385, 0.36, 0.35], count: 46, r: 0.055, at: 1.0, color: 0x9a6a30, tip: 0xc79a52, phase: 2.6, skip: (n) => n.z > 0.62 }),
      ];
      neck.add(meshWith(merge(mass.concat(lobes)), mane));

      // 가슴 갈기 — 앞가슴 아래로 흐르는 털
      const chestMass = [
        sphPart(0.19, 0.2, 0.16, { pos: [0, -0.16, 0.5], color: 0x6f4a22, seg: 16 }),
      ];
      const chestFan = lobeFan({
        center: V(0, -0.16, 0.5), radii: [0.2, 0.21, 0.17],
        color: 0x6b4522, tip: 0xa8763c, at: 1.0, count: 26, r: 0.075,
        skip: (n) => n.y > 0.45 || n.z < -0.2,
      });
      b.add(meshWith(merge(chestMass.concat(chestFan)), mane));

      // 어깨 위 갈기
      const sh = [];
      for (const sd of [-1, 1]) {
        sh.push(...lobeFan({
          center: V(sd * 0.19, 0.22, 0.3), radii: [0.16, 0.15, 0.2], count: 20, r: 0.07,
          color: 0x7d5429, tip: 0xb07e3e, at: 1.0, skip: (n) => n.y < 0.05,
        }));
      }
      b.add(meshWith(merge(sh), mane));
      void rig;
      void mm;
    },
  });

  return built;
}


// ══════════════════════════════════════════════════════════
//  호랑이 — 묵직한 대형 고양이
// ══════════════════════════════════════════════════════════
function buildTiger() {
  const fur = furMaterial('tiger-coat');
  const cream = furMaterial('wolf-cream');
  const ruff = clumpMaterial('tiger-coat');
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.12, metalness: 0.15 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: cream };

  return quad({
    id: 'tiger',
    hipY: 1.0,
    mat: fur,
    mats,
    torso: [
      [0.00, -1.02, 0.16, 0.11, 0.13],
      [0.05, -0.96, 0.14, 0.22, 0.24],
      [0.14, -0.82, 0.09, 0.29, 0.31],
      [0.28, -0.6, 0.03, 0.32, 0.35],
      [0.42, -0.34, -0.02, 0.30, 0.33],
      [0.56, -0.06, -0.02, 0.32, 0.35],
      [0.70, 0.2, 0.0, 0.36, 0.40],
      [0.82, 0.42, 0.05, 0.38, 0.41],
      [0.92, 0.58, 0.05, 0.33, 0.36],
      [1.00, 0.7, 0.0, 0.23, 0.26],
    ],
    torsoColor: (t, d) => {
      if (d.y < -0.5) return W(1.2, 1.18, 1.12);
      if (d.y > 0.6) return W(0.97, 0.95, 0.92);
      return W(1.0);
    },
    legColor: (p, d) => {
      const k = p.y < -0.3 ? 1.12 : 1.0;
      return W(k, k * 0.99, k * 0.96);
    },
    masses: [
      { rx: 0.14, ry: 0.14, rz: 0.19, pos: [-0.17, 0.18, 0.44], color: () => W(1.02) },
      { rx: 0.14, ry: 0.14, rz: 0.19, pos: [0.17, 0.18, 0.44], color: () => W(1.02) },
    ],
    legSpread: 0.235,
    legs: {
      front: { upper: 0.37, lower: 0.35, pastern: 0.13, rTop: 0.14, rMid: 0.09, rBot: 0.073, pawHalf: 0.055, pawLen: 0.2, z: 0.44, toes: 4, claws: true, clawLen: 0.055, baseHip: 0.05, baseKnee: -0.08, baseAnkle: 0.06 },
      back: { upper: 0.39, lower: 0.37, pastern: 0.11, rTop: 0.17, rMid: 0.098, rBot: 0.074, pawHalf: 0.055, pawLen: 0.2, z: -0.6, toes: 4, claws: true, clawLen: 0.055, baseHip: -0.18, baseKnee: 0.26, baseAnkle: -0.16 },
    },
    clawColor: 0xe8dfc8,
    neck: { y: 0.08, z: 0.5, tilt: 0.6, y0: 0.0, y1: 0.22, forward: 0.14, r0: 0.26, r1: 0.19, headY: 0.02, headZ: 0.02, headTilt: -0.48 },
    head: {
      steps: 24,
      profile: [
        [0.00, -0.25, 0.02, 0.10, 0.10],
        [0.12, -0.175, 0.035, 0.185, 0.175],
        [0.28, -0.06, 0.032, 0.235, 0.205],
        [0.44, 0.055, 0.024, 0.245, 0.215],
        [0.58, 0.14, 0.016, 0.215, 0.19],
        [0.70, 0.205, -0.004, 0.175, 0.16],
        [0.82, 0.28, -0.032, 0.132, 0.12],
        [0.92, 0.34, -0.052, 0.108, 0.10],
        [1.00, 0.39, -0.062, 0.066, 0.06],
      ],
      color: (t, d) => (d.y < -0.4 ? W(1.24, 1.2, 1.12) : W(1.0)),
      lidColor: () => W(0.98, 0.94, 0.88),
      cheeks: { rx: 0.1, ry: 0.1, rz: 0.11, x: 0.155, y: -0.045, z: 0.16, color: () => W(1.3, 1.26, 1.16) },
      brow: { rx: 0.08, ry: 0.05, rz: 0.08, x: 0.115, y: 0.08, z: 0.2, color: () => W(1.04) },
      eyes: { x: 0.125, y: 0.055, z: 0.24, r: 0.037, iris: 0xc9a227, rim: 0x231a12, slit: true },
      nose: { w: 0.06, h: 0.038, d: 0.032, y: -0.042, z: 0.385, color: 0x8a5548, philtrum: true },
      jaw: { y: -0.055, z: 0.12, open: 0.02 },
      jawProfile: [
        [0.00, -0.05, 0.0, 0.08, 0.045],
        [0.45, -0.012, 0.065, 0.1, 0.042],
        [1.00, -0.05, 0.28, 0.058, 0.03],
      ],
      jawColor: () => W(1.22, 1.18, 1.1),
      teeth: { w: 0.018, len: 0.085, x: 0.06, y: -0.045, z: 0.17, incisors: 3 },
      tongue: true,
      ears: { type: 'round', x: 0.16, y: 0.12, z: -0.055, r: 0.075, h: 0.072, out: -0.6, tilt: -0.1, yaw: 0.32, innerColor: 0x4a2e20 },
    },
    tail: { z: -0.98, y: 0.16, segs: 5, len: 0.18, r0: 0.06, r1: 0.035, mat: fur, tuft: { len: 0.1, r: 0.045, color: 0x241a12, mat: plain } },
    extras: ({ body: b, head, rig }) => {
      // 볼 털 (크림색 러프)
      const parts = [];
      for (const sd of [-1, 1]) {
        parts.push(...lobeFan({
          center: V(sd * 0.15, -0.05, 0.13), radii: [0.11, 0.11, 0.12], count: 16, r: 0.05,
          color: 0xe8dcc4, tip: 0xf6efdd, skip: (n) => n.x * sd < 0.15,
        }));
      }
      head.add(meshWith(merge(parts), cream));
      // 가슴 흰 털
      const chest = lobeFan({ center: V(0, -0.18, 0.5), radii: [0.2, 0.2, 0.16], count: 14, r: 0.06, color: 0xe4d8c0, tip: 0xf4ecda, skip: (n) => n.y > 0.4 });
      b.add(meshWith(merge(chest), cream));
      void rig;
    },
  });
}

// ══════════════════════════════════════════════════════════
//  치타 — 가늘고 긴 사냥꾼
// ══════════════════════════════════════════════════════════
function buildCheetah() {
  const fur = furMaterial('cheetah-coat');
  const cream = furMaterial('wolf-cream');
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.12, metalness: 0.15 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: cream };

  return quad({
    id: 'cheetah',
    hipY: 0.98,
    mat: fur,
    mats,
    torso: [
      [0.00, -0.92, 0.14, 0.075, 0.09],
      [0.05, -0.86, 0.12, 0.15, 0.17],
      [0.14, -0.74, 0.07, 0.20, 0.22],
      [0.28, -0.54, 0.0, 0.19, 0.22],
      [0.42, -0.3, -0.05, 0.175, 0.21],
      [0.56, -0.06, -0.05, 0.21, 0.25],
      [0.70, 0.2, -0.03, 0.255, 0.31],
      [0.82, 0.4, 0.01, 0.265, 0.31],
      [0.92, 0.54, 0.03, 0.225, 0.27],
      [1.00, 0.64, 0.0, 0.15, 0.19],
    ],
    torsoColor: (t, d) => (d.y < -0.5 ? W(1.26, 1.24, 1.18) : d.y > 0.62 ? W(0.98) : W(1.0)),
    legColor: (p) => W(p.y < -0.3 ? 1.16 : 1.0, p.y < -0.3 ? 1.14 : 1.0, p.y < -0.3 ? 1.08 : 1.0),
    masses: [
      { rx: 0.11, ry: 0.12, rz: 0.16, pos: [-0.13, 0.16, 0.38], color: () => W(1.02) },
      { rx: 0.11, ry: 0.12, rz: 0.16, pos: [0.13, 0.16, 0.38], color: () => W(1.02) },
    ],
    legSpread: 0.17,
    legs: {
      front: { upper: 0.4, lower: 0.38, pastern: 0.14, rTop: 0.085, rMid: 0.055, rBot: 0.045, pawHalf: 0.04, pawLen: 0.15, z: 0.38, toes: 4, claws: false, baseHip: 0.05, baseKnee: -0.06, baseAnkle: 0.05 },
      back: { upper: 0.42, lower: 0.4, pastern: 0.12, rTop: 0.115, rMid: 0.06, rBot: 0.045, pawHalf: 0.04, pawLen: 0.15, z: -0.52, toes: 4, claws: false, baseHip: -0.2, baseKnee: 0.3, baseAnkle: -0.18 },
    },
    neck: { y: 0.02, z: 0.44, tilt: 0.68, y0: 0.0, y1: 0.2, forward: 0.12, r0: 0.15, r1: 0.115, headY: 0.015, headZ: 0.02, headTilt: -0.55 },
    head: {
      steps: 22,
      profile: [
        [0.00, -0.185, 0.015, 0.075, 0.078],
        [0.12, -0.13, 0.025, 0.135, 0.128],
        [0.30, -0.045, 0.024, 0.165, 0.148],
        [0.46, 0.03, 0.018, 0.16, 0.145],
        [0.60, 0.085, 0.008, 0.135, 0.125],
        [0.72, 0.125, -0.01, 0.108, 0.1],
        [0.84, 0.165, -0.03, 0.078, 0.073],
        [0.94, 0.196, -0.042, 0.062, 0.058],
        [1.00, 0.222, -0.05, 0.04, 0.038],
      ],
      color: (t, d) => (d.y < -0.4 ? W(1.3, 1.28, 1.2) : W(1.0)),
      lidColor: () => W(0.97, 0.93, 0.86),
      cheeks: { rx: 0.055, ry: 0.055, rz: 0.07, x: 0.1, y: -0.03, z: 0.09, color: () => W(1.22, 1.2, 1.12) },
      brow: { rx: 0.055, ry: 0.036, rz: 0.055, x: 0.078, y: 0.055, z: 0.115, color: () => W(1.02) },
      eyes: { x: 0.085, y: 0.038, z: 0.135, r: 0.026, iris: 0xc09a3a, rim: 0x2a1d12, slit: true },
      nose: { w: 0.038, h: 0.026, d: 0.022, y: -0.032, z: 0.222, color: 0x2b1e18, philtrum: true },
      jaw: { y: -0.04, z: 0.07, open: 0.02 },
      jawProfile: [
        [0.00, -0.035, 0.0, 0.055, 0.032],
        [0.45, -0.008, 0.045, 0.068, 0.03],
        [1.00, -0.035, 0.19, 0.04, 0.022],
      ],
      jawColor: () => W(1.26, 1.24, 1.16),
      teeth: { w: 0.012, len: 0.05, x: 0.042, y: -0.032, z: 0.115, incisors: 3 },
      tongue: true,
      ears: { type: 'round', x: 0.1, y: 0.085, z: -0.04, r: 0.048, h: 0.046, out: -0.7, tilt: -0.05, yaw: 0.35, innerColor: 0x4a2e20 },
    },
    tail: { z: -0.88, y: 0.14, segs: 6, len: 0.17, r0: 0.045, r1: 0.026, mat: fur, tuft: { len: 0.09, r: 0.038, color: 0xf2ece0, mat: cream } },
    extras: ({ head }) => {
      // 눈물 자국
      const tears = [];
      for (const sd of [-1, 1]) {
        tears.push(sphPart(0.011, 0.042, 0.012, { pos: [sd * 0.062, -0.012, 0.152], rot: [0.32, 0, sd * 0.12], color: 0x1c130c }));
        tears.push(sphPart(0.008, 0.026, 0.009, { pos: [sd * 0.03, -0.028, 0.19], rot: [0.4, 0, 0], color: 0x2a1c10 }));
      }
      head.add(meshWith(merge(tears), vertexMaterial({ roughness: 0.9 })));
    },
  });
}

// ══════════════════════════════════════════════════════════
//  늑대 — 마른 몸의 추격자
// ══════════════════════════════════════════════════════════
function buildWolf() {
  const fur = furMaterial('wolf-coat');
  const cream = furMaterial('wolf-cream');
  const ruffMat = clumpMaterial('wolf-coat');
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.12, metalness: 0.15 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: cream };

  return quad({
    id: 'wolf',
    hipY: 0.95,
    mat: fur,
    mats,
    torso: [
      [0.00, -0.86, 0.13, 0.075, 0.09],
      [0.05, -0.8, 0.11, 0.15, 0.17],
      [0.14, -0.68, 0.06, 0.21, 0.23],
      [0.28, -0.5, 0.0, 0.205, 0.235],
      [0.42, -0.28, -0.045, 0.195, 0.235],
      [0.56, -0.04, -0.045, 0.215, 0.265],
      [0.70, 0.2, -0.01, 0.245, 0.3],
      [0.82, 0.4, 0.03, 0.25, 0.3],
      [0.92, 0.54, 0.04, 0.215, 0.26],
      [1.00, 0.63, 0.015, 0.15, 0.185],
    ],
    torsoColor: (t, d) => {
      if (d.y < -0.45) return W(1.22, 1.18, 1.08);
      if (d.y > 0.55) return W(0.86, 0.86, 0.85);
      return W(1.0);
    },
    legColor: (p) => W(p.y < -0.28 ? 1.18 : 1.0, p.y < -0.28 ? 1.15 : 1.0, p.y < -0.28 ? 1.06 : 1.0),
    legSpread: 0.165,
    legs: {
      front: { upper: 0.38, lower: 0.36, pastern: 0.13, rTop: 0.088, rMid: 0.055, rBot: 0.046, pawHalf: 0.042, pawLen: 0.16, z: 0.36, toes: 4, baseHip: 0.05, baseKnee: -0.07, baseAnkle: 0.05 },
      back: { upper: 0.4, lower: 0.38, pastern: 0.11, rTop: 0.115, rMid: 0.06, rBot: 0.046, pawHalf: 0.042, pawLen: 0.16, z: -0.5, toes: 4, baseHip: -0.2, baseKnee: 0.3, baseAnkle: -0.18 },
    },
    neck: { y: 0.1, z: 0.44, tilt: 0.72, y0: 0.0, y1: 0.22, forward: 0.14, r0: 0.18, r1: 0.13, headY: 0.015, headZ: 0.02, headTilt: -0.62 },
    head: {
      steps: 22,
      profile: [
        [0.00, -0.2, 0.02, 0.075, 0.08],
        [0.12, -0.14, 0.03, 0.13, 0.13],
        [0.30, -0.05, 0.026, 0.15, 0.145],
        [0.46, 0.02, 0.015, 0.135, 0.13],
        [0.6, 0.07, 0.0, 0.105, 0.1],
        [0.74, 0.11, -0.018, 0.08, 0.075],
        [0.86, 0.15, -0.035, 0.062, 0.058],
        [1.00, 0.2, -0.05, 0.042, 0.04],
      ],
      color: (t, d) => (d.y < -0.4 ? W(1.16, 1.12, 1.02) : W(1.0)),
      lidColor: () => W(0.85, 0.84, 0.8),
      cheeks: { rx: 0.06, ry: 0.07, rz: 0.09, x: 0.105, y: -0.03, z: 0.08, color: () => W(1.2, 1.16, 1.06) },
      brow: { rx: 0.055, ry: 0.035, rz: 0.06, x: 0.075, y: 0.06, z: 0.1, color: () => W(0.92) },
      eyes: { x: 0.082, y: 0.04, z: 0.115, r: 0.027, iris: 0xd8a02a, rim: 0x2c2418 },
      nose: { w: 0.036, h: 0.024, d: 0.022, y: -0.026, z: 0.196, color: 0x1a1a1c, philtrum: false },
      jaw: { y: -0.04, z: 0.06, open: 0.02 },
      jawProfile: [
        [0.00, -0.035, 0.0, 0.05, 0.03],
        [0.45, -0.008, 0.05, 0.062, 0.028],
        [1.00, -0.035, 0.2, 0.036, 0.02],
      ],
      jawColor: () => W(1.2, 1.16, 1.06),
      teeth: { w: 0.013, len: 0.062, x: 0.038, y: -0.032, z: 0.1, incisors: 4 },
      tongue: true,
      ears: { type: 'pointed', x: 0.1, y: 0.1, z: -0.03, r: 0.055, h: 0.17, out: -0.2, tilt: -0.05, yaw: 0.12, innerColor: 0x5c4a3c },
    },
    tail: { z: -0.82, y: 0.12, segs: 5, len: 0.16, r0: 0.05, r1: 0.03, mat: fur, basePitch: -0.25, fluff: true, fluffColor: 0xa8a49a, fluffTip: 0xd6d0c2, fluffMat: ruffMat },
    extras: ({ neck, body: b, head }) => {
      // 목덜미 러프
      const grey = lobeFan({ center: V(0, 0.06, 0.02), radii: [0.2, 0.18, 0.18], count: 38, r: 0.04, color: 0x8b887e, tip: 0xa5a196, skip: (n) => n.z > 0.45 || n.y > 0.4 });
      const cream2 = lobeFan({ center: V(0, 0.0, 0.06), radii: [0.19, 0.18, 0.18], count: 34, r: 0.042, color: 0xbdb4a0, tip: 0xd8d0bc, skip: (n) => n.z > 0.55 || n.y > 0.35 });
      neck.add(meshWith(merge(grey.concat(cream2)), ruffMat));
      // 가슴 크림
      b.add(meshWith(merge(lobeFan({ center: V(0, -0.16, 0.44), radii: [0.19, 0.19, 0.15], count: 16, r: 0.05, color: 0xd2c9b4, tip: 0xece4d0, skip: (n) => n.y > 0.4 })), cream));
      // 볼 털
      for (const sd of [-1, 1]) {
        head.add(meshWith(merge(lobeFan({ center: V(sd * 0.1, -0.045, 0.055), radii: [0.075, 0.075, 0.085], count: 12, r: 0.026, color: 0xc8bfa8, tip: 0xe8e0cc, skip: (n) => n.x * sd < 0.45 || n.z > 0.55 })), cream));
      }
    },
  });
}

// ══════════════════════════════════════════════════════════
//  곰 — 그리즐리
// ══════════════════════════════════════════════════════════
function buildBear() {
  const fur = furMaterial('bear-coat');
  const light = furMaterial('bear-light');
  const ruffMat = clumpMaterial('bear-coat');
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.14, metalness: 0.12 });
  const mats = { fur, light, plain, eye: eyeMat, jaw: light };

  return quad({
    id: 'bear',
    hipY: 0.94,
    mat: fur,
    mats,
    torso: [
      [0.00, -0.82, 0.14, 0.19, 0.2],
      [0.05, -0.76, 0.14, 0.28, 0.3],
      [0.16, -0.64, 0.1, 0.35, 0.36],
      [0.3, -0.46, 0.04, 0.38, 0.4],
      [0.44, -0.24, -0.01, 0.38, 0.41],
      [0.58, 0.0, 0.01, 0.4, 0.43],
      [0.72, 0.24, 0.07, 0.43, 0.46],
      [0.84, 0.42, 0.09, 0.42, 0.44],
      [0.94, 0.56, 0.05, 0.34, 0.36],
      [1.00, 0.64, 0.0, 0.24, 0.27],
    ],
    torsoColor: (t, d) => {
      if (d.y > 0.45) {
        const k = 1.04 + clamp((t - 0.45) * 0.5, 0, 0.18);
        return W(k, k * 0.98, k * 0.94);
      }
      if (d.y < -0.4) return W(1.06, 1.03, 0.98);
      return W(1.0);
    },
    legColor: (p) => W(p.y < -0.25 ? 1.1 : 1.0, p.y < -0.25 ? 1.06 : 1.0, p.y < -0.25 ? 1.0 : 1.0),
    masses: [
      // 어깨 혹
      { rx: 0.26, ry: 0.22, rz: 0.26, pos: [0, 0.28, 0.28], color: () => W(1.1, 1.06, 1.0) },
    ],
    legSpread: 0.29,
    legs: {
      front: { upper: 0.32, lower: 0.3, pastern: 0.12, rTop: 0.155, rMid: 0.115, rBot: 0.1, pawHalf: 0.075, pawLen: 0.27, z: 0.34, toes: 5, claws: true, clawLen: 0.11, plantigrade: true, baseHip: 0.08, baseKnee: -0.12, baseAnkle: 0.06 },
      back: { upper: 0.34, lower: 0.32, pastern: 0.11, rTop: 0.19, rMid: 0.125, rBot: 0.1, pawHalf: 0.075, pawLen: 0.28, z: -0.42, toes: 5, claws: true, clawLen: 0.11, plantigrade: true, baseHip: -0.17, baseKnee: 0.24, baseAnkle: -0.12 },
    },
    clawColor: 0xe6dcc4,
    neck: { y: 0.16, z: 0.42, tilt: 0.45, y0: 0.0, y1: 0.2, forward: 0.12, r0: 0.3, r1: 0.23, headY: 0.01, headZ: 0.02, headTilt: -0.4 },
    head: {
      steps: 22,
      profile: [
        [0.00, -0.24, 0.02, 0.13, 0.13],
        [0.12, -0.16, 0.035, 0.21, 0.2],
        [0.30, -0.04, 0.03, 0.245, 0.225],
        [0.46, 0.06, 0.02, 0.235, 0.215],
        [0.60, 0.13, 0.0, 0.19, 0.18],
        [0.72, 0.185, -0.02, 0.15, 0.14],
        [0.84, 0.23, -0.04, 0.115, 0.108],
        [1.00, 0.29, -0.055, 0.07, 0.065],
      ],
      color: (t, d) => (d.y < -0.4 ? W(1.12, 1.1, 1.06) : W(1.0)),
      lidColor: () => W(0.94, 0.9, 0.85),
      cheeks: { rx: 0.1, ry: 0.09, rz: 0.1, x: 0.16, y: -0.04, z: 0.12, color: () => W(1.06, 1.03, 0.98) },
      brow: { rx: 0.08, ry: 0.05, rz: 0.08, x: 0.11, y: 0.075, z: 0.16, color: () => W(1.04) },
      eyes: { x: 0.115, y: 0.055, z: 0.19, r: 0.03, iris: 0x6b4413, rim: 0x2a1c10 },
      nose: { w: 0.062, h: 0.042, d: 0.035, y: -0.045, z: 0.285, color: 0x1d1410, philtrum: true },
      jaw: { y: -0.055, z: 0.1, open: 0.02 },
      jawProfile: [
        [0.00, -0.05, 0.0, 0.09, 0.05],
        [0.45, -0.012, 0.06, 0.105, 0.045],
        [1.00, -0.05, 0.22, 0.06, 0.032],
      ],
      jawColor: () => W(1.16, 1.1, 1.0),
      teeth: { w: 0.019, len: 0.075, x: 0.058, y: -0.045, z: 0.14, incisors: 3 },
      tongue: true,
      ears: { type: 'round', x: 0.185, y: 0.13, z: -0.05, r: 0.075, h: 0.07, out: -0.7, tilt: -0.1, yaw: 0.35, innerColor: 0x6b4a34 },
    },
    tail: { z: -0.78, y: 0.16, segs: 2, len: 0.1, r0: 0.07, r1: 0.05, mat: fur },
    extras: ({ body: b, neck, head }) => {
      const ruff = lobeFan({ center: V(0, 0.02, 0.04), radii: [0.24, 0.22, 0.22], count: 34, r: 0.045, color: 0x7d5836, tip: 0x96703f, skip: (n) => n.z > 0.5 || n.y > 0.35 });
      neck.add(meshWith(merge(ruff), ruffMat));
      for (const sd of [-1, 1]) {
        head.add(meshWith(merge(lobeFan({ center: V(sd * 0.155, -0.055, 0.055), radii: [0.09, 0.09, 0.1], count: 12, r: 0.032, color: 0x6f4a2c, tip: 0x8a6440, skip: (n) => n.x * sd < 0.45 || n.z > 0.55 })), ruffMat));
      }
      // 어깨 털
      b.add(meshWith(merge(lobeFan({ center: V(0, 0.28, 0.24), radii: [0.28, 0.2, 0.26], count: 26, r: 0.05, color: 0x7a5533, tip: 0x9a7442, skip: (n) => n.y < 0.35 })), ruffMat));
    },
  });
}

// ══════════════════════════════════════════════════════════
//  북극곰
// ══════════════════════════════════════════════════════════
function buildPolarBear() {
  const fur = furMaterial('polar-coat');
  const ruffMat = clumpMaterial('polar-coat');
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.14, metalness: 0.12 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  return quad({
    id: 'polarBear',
    hipY: 1.0,
    mat: fur,
    mats,
    torso: [
      [0.00, -0.9, 0.15, 0.17, 0.18],
      [0.05, -0.84, 0.15, 0.25, 0.27],
      [0.16, -0.7, 0.11, 0.32, 0.33],
      [0.3, -0.5, 0.05, 0.35, 0.37],
      [0.44, -0.26, 0.0, 0.35, 0.38],
      [0.58, 0.0, 0.02, 0.37, 0.4],
      [0.72, 0.24, 0.07, 0.39, 0.42],
      [0.84, 0.42, 0.08, 0.38, 0.4],
      [0.94, 0.55, 0.04, 0.31, 0.33],
      [1.00, 0.62, 0.0, 0.22, 0.24],
    ],
    torsoColor: (t, d) => (d.y > 0.45 ? W(1.02) : d.y < -0.4 ? W(0.94, 0.94, 0.92) : W(1.0)),
    legColor: (p) => W(p.y < -0.25 ? 0.97 : 1.0),
    legSpread: 0.29,
    legs: {
      front: { upper: 0.35, lower: 0.32, pastern: 0.13, rTop: 0.16, rMid: 0.125, rBot: 0.11, pawHalf: 0.08, pawLen: 0.3, z: 0.36, toes: 5, claws: true, clawLen: 0.1, plantigrade: true, baseHip: 0.08, baseKnee: -0.12, baseAnkle: 0.06 },
      back: { upper: 0.37, lower: 0.34, pastern: 0.12, rTop: 0.195, rMid: 0.135, rBot: 0.11, pawHalf: 0.08, pawLen: 0.31, z: -0.46, toes: 5, claws: true, clawLen: 0.1, plantigrade: true, baseHip: -0.17, baseKnee: 0.24, baseAnkle: -0.12 },
    },
    clawColor: 0x3a3630,
    neck: { y: 0.18, z: 0.46, tilt: 0.32, y0: 0.0, y1: 0.26, forward: 0.14, r0: 0.26, r1: 0.2, headY: 0.01, headZ: 0.02, headTilt: -0.3 },
    head: {
      steps: 22,
      profile: [
        [0.00, -0.22, 0.02, 0.115, 0.115],
        [0.12, -0.15, 0.032, 0.185, 0.175],
        [0.30, -0.045, 0.028, 0.21, 0.195],
        [0.46, 0.045, 0.018, 0.2, 0.185],
        [0.6, 0.11, 0.0, 0.165, 0.155],
        [0.74, 0.17, -0.022, 0.13, 0.122],
        [0.86, 0.22, -0.04, 0.1, 0.094],
        [1.00, 0.275, -0.055, 0.062, 0.058],
      ],
      color: (t, d) => (d.y < -0.4 ? W(0.96) : W(1.0)),
      lidColor: () => W(0.9, 0.9, 0.88),
      cheeks: { rx: 0.09, ry: 0.085, rz: 0.1, x: 0.145, y: -0.04, z: 0.11, color: () => W(1.0) },
      brow: { rx: 0.07, ry: 0.045, rz: 0.07, x: 0.1, y: 0.07, z: 0.15, color: () => W(1.0) },
      eyes: { x: 0.105, y: 0.05, z: 0.175, r: 0.028, iris: 0x3f2a12, rim: 0x3a342c },
      nose: { w: 0.056, h: 0.038, d: 0.032, y: -0.042, z: 0.27, color: 0x1a1614, philtrum: false },
      jaw: { y: -0.05, z: 0.09, open: 0.02 },
      jawProfile: [
        [0.00, -0.045, 0.0, 0.08, 0.045],
        [0.45, -0.01, 0.055, 0.095, 0.04],
        [1.00, -0.045, 0.21, 0.055, 0.03],
      ],
      jawColor: () => W(0.98),
      teeth: { w: 0.017, len: 0.07, x: 0.052, y: -0.042, z: 0.13, incisors: 3 },
      tongue: true,
      ears: { type: 'round', x: 0.165, y: 0.12, z: -0.04, r: 0.06, h: 0.055, out: -0.75, tilt: -0.05, yaw: 0.35, innerColor: 0xb8b4a8 },
    },
    tail: { z: -0.86, y: 0.17, segs: 2, len: 0.1, r0: 0.07, r1: 0.05, mat: fur },
    extras: ({ body: b, neck, head }) => {
      const ruff = lobeFan({ center: V(0, 0.04, 0.04), radii: [0.22, 0.2, 0.2], count: 26, r: 0.04, color: 0xdedac8, tip: 0xeceae0, skip: (n) => n.z > 0.5 || n.y > 0.35 });
      neck.add(meshWith(merge(ruff), ruffMat));
      b.add(meshWith(merge(lobeFan({ center: V(0, -0.16, 0.46), radii: [0.18, 0.18, 0.14], count: 12, r: 0.05, color: 0xe6e2d4, tip: 0xf6f4ea, skip: (n) => n.y > 0.4 })), ruffMat));
      for (const sd of [-1, 1]) {
        head.add(meshWith(merge(lobeFan({ center: V(sd * 0.13, -0.045, 0.05), radii: [0.075, 0.075, 0.085], count: 10, r: 0.026, color: 0xe4e0d2, tip: 0xf6f4ea, skip: (n) => n.x * sd < 0.45 || n.z > 0.55 })), ruffMat));
      }
    },
  });
}


// ══════════════════════════════════════════════════════════
//  아프리카 코끼리
// ══════════════════════════════════════════════════════════
function buildElephant() {
  const fur = furMaterial('elephant-hide');
  const ruffMat = clumpMaterial('elephant-hide');
  const plain = vertexMaterial({ roughness: 0.5 });
  const ivory = vertexMaterial({ roughness: 0.35 });
  const eyeMat = vertexMaterial({ roughness: 0.1, metalness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  return quad({
    id: 'elephant',
    hipY: 1.5,
    mat: fur,
    mats,
    torso: [
      [0.00, -1.2, 0.1, 0.3, 0.33],
      [0.06, -1.12, 0.12, 0.42, 0.45],
      [0.18, -0.95, 0.1, 0.51, 0.53],
      [0.34, -0.72, 0.05, 0.55, 0.57],
      [0.5, -0.44, 0.02, 0.56, 0.59],
      [0.66, -0.12, 0.06, 0.575, 0.6],
      [0.8, 0.18, 0.13, 0.55, 0.59],
      [0.9, 0.4, 0.15, 0.47, 0.51],
      [1.00, 0.54, 0.1, 0.34, 0.4],
    ],
    torsoColor: (t, d) => {
      if (d.y > 0.5) return W(1.04, 1.03, 1.0);
      if (d.y < -0.4) return W(0.95, 0.94, 0.92);
      // 등줄기 결
      return W(1.0);
    },
    legColor: (p) => W(p.y < -0.35 ? 0.98 : 1.0),
    masses: [
      { rx: 0.34, ry: 0.3, rz: 0.4, pos: [0, 0.22, 0.34], color: () => W(1.03) },
      { rx: 0.3, ry: 0.28, rz: 0.34, pos: [0, 0.16, -0.72], color: () => W(1.0) },
    ],
    legSpread: 0.36,
    legs: {
      front: { upper: 0.56, lower: 0.5, pastern: 0.18, rTop: 0.245, rMid: 0.2, rBot: 0.185, pawHalf: 0.11, pawLen: 0.3, z: 0.46, toes: 3, hoof: true, hoofColor: 0xcfc6b2, baseHip: 0.02, baseKnee: -0.02, baseAnkle: 0.0 },
      back: { upper: 0.58, lower: 0.52, pastern: 0.16, rTop: 0.27, rMid: 0.21, rBot: 0.19, pawHalf: 0.11, pawLen: 0.31, z: -0.66, toes: 3, hoof: true, hoofColor: 0xcfc6b2, baseHip: -0.06, baseKnee: 0.08, baseAnkle: -0.04 },
    },
    neck: { y: 0.26, z: 0.62, tilt: 0.06, y0: 0.0, y1: 0.12, forward: 0.16, r0: 0.4, r1: 0.33, headY: 0.0, headZ: 0.0, headTilt: 0.05 },
    headScale: 1.12,
    head: {
      steps: 22,
      profile: [
        [0.00, -0.42, 0.0, 0.18, 0.19],
        [0.15, -0.32, 0.03, 0.33, 0.32],
        [0.35, -0.15, 0.05, 0.39, 0.36],
        [0.55, 0.02, 0.03, 0.37, 0.34],
        [0.72, 0.16, 0.0, 0.30, 0.27],
        [0.86, 0.26, -0.02, 0.24, 0.22],
        [1.00, 0.33, -0.03, 0.18, 0.17],
      ],
      color: () => W(1.0),
      lidColor: () => W(0.94, 0.93, 0.9),
      cheeks: { rx: 0.1, ry: 0.11, rz: 0.12, x: 0.24, y: -0.06, z: 0.1, color: () => W(1.02) },
      brow: { rx: 0.09, ry: 0.05, rz: 0.1, x: 0.16, y: 0.1, z: 0.1, color: () => W(1.03) },
      eyes: { x: 0.2, y: 0.03, z: 0.16, r: 0.028, iris: 0x3a2a18, rim: 0x4a443c },
      nose: null,
      jaw: { y: -0.09, z: 0.1, open: 0.01 },
      jawProfile: [
        [0.00, -0.06, 0.0, 0.15, 0.07],
        [0.45, -0.02, 0.1, 0.17, 0.07],
        [1.00, -0.06, 0.3, 0.11, 0.05],
      ],
      jawColor: () => W(1.0),
      teeth: false,
      tongue: false,
      ears: null,
    },
    tail: { z: -1.16, y: 0.2, segs: 2, len: 0.12, r0: 0.055, r1: 0.03, mat: fur },
    extras: ({ head, rig, body: b }) => {
      // 귀 — 아프리카 대륙 모양의 큰 판
      for (const sd of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(sd * 0.28, 0.04, -0.08);
        ear.rotation.z = sd * -0.5;
        ear.rotation.x = -0.16;
        ear.rotation.y = sd * 0.5;
        head.add(ear);
        const secs = [
          { p: V(0, -0.42, 0.05), rx: 0.008, ry: 0.04 },
          { p: V(0, -0.3, 0.02), rx: 0.018, ry: 0.13 },
          { p: V(0, -0.12, -0.02), rx: 0.026, ry: 0.25 },
          { p: V(0, 0.1, -0.05), rx: 0.028, ry: 0.3 },
          { p: V(0, 0.3, -0.06), rx: 0.024, ry: 0.28 },
          { p: V(0, 0.43, -0.05), rx: 0.016, ry: 0.18 },
          { p: V(0, 0.5, -0.03), rx: 0.006, ry: 0.06 },
        ];
        const outer = sweep(secs, { radial: 12, capStart: true, capEnd: true, colorFn: () => W(1.0, 0.97, 0.94) });
        ear.add(meshWith(outer, fur));
        // 안쪽 결
        const inner = sweep(secs.map((x) => ({ p: V(x.p.x + sd * 0.02, x.p.y, x.p.z + 0.03), rx: x.rx * 0.5, ry: x.ry * 0.86 })), {
          radial: 10, capStart: true, capEnd: true, colorFn: () => W(0.95, 0.92, 0.88),
        });
        ear.add(meshWith(inner, fur));
        rig.ears.push(ear);
      }

      // 상아 — 위턱에서 앞으로 뻗어 위로 굽는다
      for (const sd of [-1, 1]) {
        const tusk = splineTube([
          [sd * 0.1, -0.2, 0.2, 0.05],
          [sd * 0.13, -0.34, 0.44, 0.045],
          [sd * 0.15, -0.4, 0.66, 0.032],
          [sd * 0.16, -0.34, 0.84, 0.012],
        ], { radial: 10, steps: 6, colorFn: () => W(1.0) });
        head.add(meshWith(tusk, ivory));
      }
      // 코 — 관절 체인
      const trunkPts = [
        [0, -0.07, 0.31, 0.2],
        [0, -0.3, 0.48, 0.18],
        [0, -0.58, 0.58, 0.155],
        [0, -0.86, 0.6, 0.125],
        [0, -1.12, 0.56, 0.098],
        [0, -1.32, 0.6, 0.07],
      ];
      rig.trunk = [];
      const BONES = 5;
      const pts = splinePoints(trunkPts, BONES);
      const radiusAt = (t) => lerp(0.2, 0.06, Math.pow(t, 0.8));
      let parent = head;
      for (let i = 0; i < BONES; i++) {
        const bone = new THREE.Group();
        const a = pts[i];
        const b2 = pts[i + 1];
        if (i === 0) {
          bone.position.set(a.x, a.y, a.z);
          head.add(bone);
        } else {
          bone.position.set(a.x - pts[i - 1].x, a.y - pts[i - 1].y, a.z - pts[i - 1].z);
          parent.add(bone);
        }
        const local = pts.slice(i, i + 2).map((p2, k) => [p2.x - a.x, p2.y - a.y, p2.z - a.z, radiusAt((i + k) / BONES)]);
        const seg = splineTube(local.length > 2 ? local : [local[0], local[1], local[1]], { radial: 12, steps: 4, capStart: i === 0, capEnd: i === BONES - 1, colorFn: () => W(1.0) });
        bone.add(meshWith(seg, fur));
        rig.trunk.push(bone);
        parent = bone;
        void b2;
      }
      // 발톱
      for (const key of ['fl', 'fr', 'bl', 'br']) {
        const paw = rig.legs[key].paw;
        const nails = [];
        for (let i = 0; i < 3; i++) {
          nails.push(sphPart(0.05, 0.03, 0.04, { pos: [(i - 1) * 0.11, -0.03, 0.16], color: 0xcfc6b2 }));
        }
        paw.add(meshWith(merge(nails), plain));
      }
      // 등 결 (피부 주름)
      const wr = [];
      for (let i = 0; i < 5; i++) {
        wr.push(sphPart(0.4 - i * 0.03, 0.03, 0.06, { pos: [0, 0.5 - i * 0.02, 0.3 - i * 0.24], color: 0x8a8278 }));
      }
      b.add(meshWith(merge(wr), fur));
      void ruffMat;
    },
  });
}

// ══════════════════════════════════════════════════════════
//  코뿔소
// ══════════════════════════════════════════════════════════
function buildRhino() {
  const fur = furMaterial('rhino-hide');
  const plain = vertexMaterial({ roughness: 0.5 });
  const hornMat = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.12, metalness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  return quad({
    id: 'rhino',
    hipY: 1.16,
    mat: fur,
    mats,
    torso: [
      [0.00, -0.92, 0.12, 0.24, 0.26],
      [0.06, -0.86, 0.14, 0.36, 0.38],
      [0.18, -0.72, 0.1, 0.44, 0.45],
      [0.34, -0.5, 0.04, 0.47, 0.47],
      [0.5, -0.26, 0.0, 0.47, 0.47],
      [0.66, 0.0, 0.04, 0.47, 0.48],
      [0.8, 0.24, 0.1, 0.44, 0.46],
      [0.9, 0.4, 0.12, 0.38, 0.42],
      [1.00, 0.5, 0.08, 0.3, 0.34],
    ],
    torsoColor: (t, d) => {
      if (d.y < -0.4) return W(0.92, 0.92, 0.9);
      if (d.y > 0.55) return W(1.05, 1.05, 1.03);
      return W(1.0);
    },
    legColor: (p) => W(p.y < -0.3 ? 1.03 : 1.0),
    legSpread: 0.31,
    legs: {
      front: { upper: 0.34, lower: 0.3, pastern: 0.16, rTop: 0.2, rMid: 0.175, rBot: 0.16, pawHalf: 0.095, pawLen: 0.26, z: 0.42, toes: 3, hoof: true, hoofColor: 0x9a938a, baseHip: 0.03, baseKnee: -0.02, baseAnkle: 0.0 },
      back: { upper: 0.36, lower: 0.32, pastern: 0.14, rTop: 0.22, rMid: 0.185, rBot: 0.165, pawHalf: 0.095, pawLen: 0.27, z: -0.6, toes: 3, hoof: true, hoofColor: 0x9a938a, baseHip: -0.08, baseKnee: 0.1, baseAnkle: -0.05 },
    },
    neck: { y: 0.16, z: 0.5, tilt: 0.22, y0: 0.0, y1: 0.12, forward: 0.12, r0: 0.34, r1: 0.28, headY: 0.0, headZ: 0.0, headTilt: -0.05 },
    head: {
      steps: 22,
      profile: [
        [0.00, -0.3, 0.0, 0.15, 0.16],
        [0.16, -0.22, 0.02, 0.24, 0.22],
        [0.36, -0.1, 0.02, 0.26, 0.23],
        [0.54, 0.0, 0.0, 0.24, 0.21],
        [0.70, 0.06, -0.03, 0.22, 0.19],
        [0.86, 0.1, -0.05, 0.2, 0.17],
        [1.00, 0.12, -0.06, 0.17, 0.15],
      ],
      color: () => W(1.0),
      lidColor: () => W(0.96, 0.95, 0.93),
      cheeks: { rx: 0.1, ry: 0.1, rz: 0.12, x: 0.21, y: -0.07, z: 0.12, color: () => W(1.02) },
      brow: { rx: 0.08, ry: 0.05, rz: 0.09, x: 0.15, y: 0.08, z: 0.12, color: () => W(1.02) },
      eyes: { x: 0.19, y: 0.02, z: 0.18, r: 0.026, iris: 0x33260f, rim: 0x3a352c },
      nose: { w: 0.09, h: 0.045, d: 0.04, y: -0.06, z: 0.3, color: 0x4a443a, philtrum: false },
      jaw: { y: -0.075, z: 0.1, open: 0.01 },
      jawProfile: [
        [0.00, -0.05, 0.0, 0.14, 0.06],
        [0.45, -0.02, 0.09, 0.15, 0.055],
        [1.00, -0.05, 0.26, 0.12, 0.045],
      ],
      jawColor: () => W(0.98),
      teeth: false,
      tongue: false,
      ears: { type: 'pointed', x: 0.16, y: 0.16, z: -0.06, r: 0.055, h: 0.12, out: -0.55, tilt: -0.15, yaw: 0.3, innerColor: 0x6b6152 },
    },
    tail: { z: -0.88, y: 0.2, segs: 2, len: 0.1, r0: 0.05, r1: 0.03, mat: fur },
    extras: ({ head, body: b }) => {
      // 앞뿔(길게 굽음) + 뒷뿔
      const horn1 = splineTube([
        [0, 0.08, 0.2, 0.085],
        [0, 0.18, 0.19, 0.062],
        [0, 0.3, 0.21, 0.03],
        [0, 0.4, 0.26, 0.008],
      ], { radial: 10, steps: 6, colorFn: () => W(0.9, 0.88, 0.82) });
      head.add(meshWith(horn1, hornMat));
      const horn2 = splineTube([
        [0, 0.1, 0.06, 0.07],
        [0, 0.2, 0.06, 0.05],
        [0, 0.3, 0.08, 0.022],
        [0, 0.36, 0.1, 0.006],
      ], { radial: 10, steps: 5, colorFn: () => W(0.88, 0.86, 0.8) });
      head.add(meshWith(horn2, hornMat));
      // 어깨·엉덩이 경계의 얕은 골 — 가죽 주름
      const folds = [];
      for (const [z, r] of [[0.46, 0.45], [-0.6, 0.43]]) {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          folds.push(sphPart(0.045, 0.03, 0.045, {
            pos: [Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.88 + 0.02, z],
            color: 0x7c7b74,
          }));
        }
      }
      b.add(meshWith(merge(folds), fur));
    },
  });
}

// ══════════════════════════════════════════════════════════
//  수중 생물 공통 몸통
// ══════════════════════════════════════════════════════════
function fishBody(cfg) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, cfg.bodyY ?? 1.0, 0);
  root.add(body);
  const rig = { form: 'serpent', body, hipY: cfg.bodyY ?? 1.0 };
  const SEG = cfg.segs ?? 7;
  const LEN = cfg.segLen ?? 0.42;
  const total = SEG * LEN;
  const spine = [];
  let parent = body;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? total * 0.5 : -LEN);
    parent.add(seg);
    const steps = 4;
    const secs = [];
    for (let k = 0; k <= steps; k++) {
      const g = (i + k / steps) / SEG;
      const r = cfg.radiusAt(g);
      const yy = (cfg.axisY ? cfg.axisY(g) : 0);
      // 이웃 마디와 겹치게 해 이음매를 감춘다
      const over = i === 0 ? 0 : 0.09;
      secs.push({ p: V(0, yy, over * (1 - k / steps) - (k / steps) * LEN), rx: r * (cfg.flatten ?? 1), ry: r });
    }
    const geo = sweep(secs, {
      radial: cfg.radial ?? 18,
      capStart: i === 0,
      capEnd: i === SEG - 1,
      uv: (p, t, a) => [a / TAU, (i + t) / SEG],
      colorFn: (p, d, t) => cfg.colorFn(p, d, (i + t) / SEG),
    });
    seg.add(meshWith(geo, cfg.mat));
    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;
  return { root, rig, body, total };
}

// ══════════════════════════════════════════════════════════
//  백상아리
// ══════════════════════════════════════════════════════════
function buildShark() {
  const skin = vertexMaterial({ roughness: 0.45, metalness: 0.06 });
  const plain = vertexMaterial({ roughness: 0.45 });
  const DORSAL = C(0x596a76);
  const FLANK = C(0x6d7f8c);
  const BELLY = C(0xeef2f2);
  const sharkTone = (d) => {
    const y = clamp(d.y, -1, 1);
    if (y < -0.45) return BELLY;
    if (y < 0.05) return FLANK.clone().lerp(BELLY, (0.05 - y) / 0.5);
    if (y < 0.5) return FLANK.clone().lerp(DORSAL, (y - 0.05) / 0.45);
    return DORSAL;
  };
  const eyeMat = vertexMaterial({ roughness: 0.05, metalness: 0.4 });
  const bodyY = 1.2;
  const { root, rig } = fishBody({
    bodyY,
    segs: 7,
    segLen: 0.46,
    radial: 20,
    flatten: 0.92,
    radiusAt: (g) => {
      if (g < 0.1) return lerp(0.045, 0.14, g / 0.1);
      if (g < 0.3) return lerp(0.14, 0.3, (g - 0.1) / 0.2);
      if (g < 0.45) return lerp(0.3, 0.33, (g - 0.3) / 0.15);
      if (g < 0.7) return lerp(0.33, 0.19, (g - 0.45) / 0.25);
      return lerp(0.19, 0.035, (g - 0.7) / 0.3);
    },
    axisY: (g) => -0.02 + Math.sin(g * 2.6) * 0.03,
    colorFn: (p, d) => sharkTone(d),
    ratio: 1,
    mat: skin,
  });
  const body = rig.body;
  const noseZ = 1.61;

  // 머리 — 뾰족한 주둥이
  const headGroup = new THREE.Group();
  headGroup.position.set(0, -0.01, noseZ - 0.34);
  body.add(headGroup);
  rig.neck = headGroup;
  const head = new THREE.Group();
  headGroup.add(head);
  rig.head = head;
  const snout = sweep([
    { p: V(0, 0.06, -0.3), rx: 0.16, ry: 0.14 },
    { p: V(0, 0.02, -0.1), rx: 0.19, ry: 0.16 },
    { p: V(0, -0.01, 0.1), rx: 0.15, ry: 0.13 },
    { p: V(0, -0.03, 0.26), rx: 0.08, ry: 0.07 },
    { p: V(0, -0.035, 0.34), rx: 0.03, ry: 0.025 },
  ], { radial: 18, capStart: true, capEnd: true, colorFn: (p, d) => sharkTone(d) });
  head.add(meshWith(snout, skin));

  // 입 — 아래로 굽은 초승달
  const mouth = [];
  mouth.push(sphPart(0.1, 0.045, 0.13, { pos: [0, -0.11, 0.14], color: 0x3a2c2c }));
  head.add(meshWith(merge(mouth), plain));
  const teeth = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - 0.5) * 1.9;
    teeth.push(conePart(0.014, 0.045, { pos: [Math.sin(a) * 0.12, -0.075, 0.14 + Math.cos(a) * 0.1], rot: [Math.PI * 0.92, 0, 0], color: 0xf6f2e6, seg: 4 }));
    teeth.push(conePart(0.011, 0.03, { pos: [Math.sin(a) * 0.11, -0.135, 0.13 + Math.cos(a) * 0.09], rot: [0.08, 0, 0], color: 0xeae4d4, seg: 4 }));
  }
  head.add(meshWith(merge(teeth), plain));

  // 눈 (검은 구슬)
  const eyes = [];
  for (const sd of [-1, 1]) {
    eyes.push(sphPart(0.038, 0.036, 0.034, { pos: [sd * 0.15, 0.03, 0.06], color: 0x08090a, seg: 12 }));
    eyes.push(sphPart(0.012, 0.012, 0.008, { pos: [sd * 0.16, 0.045, 0.085], color: 0x9ab0c0, seg: 6 }));
  }
  head.add(meshWith(merge(eyes), eyeMat));

  // 아가미 (5줄)
  const gills = [];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      gills.push(sphPart(0.008, 0.085 - i * 0.006, 0.012, { pos: [sd * 0.19, 0.02, -0.02 - i * 0.055], rot: [0, 0, sd * 0.12], color: 0x2e3a44 }));
    }
  }
  head.add(meshWith(merge(gills), plain));

  // 지느러미
  const finMat = skin;
  // 등지느러미
  const dorsal = sweep([
    { p: V(0, 0, 0), rx: 0.05, ry: 0.22 },
    { p: V(0, 0.2, -0.05), rx: 0.04, ry: 0.19 },
    { p: V(0, 0.38, -0.02), rx: 0.03, ry: 0.13 },
    { p: V(0, 0.5, 0.06), rx: 0.014, ry: 0.05 },
  ], { radial: 10, capStart: true, capEnd: true, colorFn: (p, d) => (d.y < -0.2 ? BELLY : DORSAL) });
  const dorsalMesh = meshWith(dorsal, finMat);
  dorsalMesh.position.set(0, 0.2, 0.15);
  dorsalMesh.rotation.x = -0.28;
  body.add(dorsalMesh);

  for (const sd of [-1, 1]) {
    // 가슴지느러미
    const pec = sweep([
      { p: V(0, 0, 0), rx: 0.045, ry: 0.16 },
      { p: V(0, 0.16, -0.03), rx: 0.035, ry: 0.15 },
      { p: V(0, 0.32, 0.02), rx: 0.022, ry: 0.1 },
      { p: V(0, 0.42, 0.1), rx: 0.01, ry: 0.04 },
    ], { radial: 8, capStart: true, capEnd: true, colorFn: (p, d) => (d.y < -0.2 ? FLANK.clone().lerp(BELLY, 0.6) : DORSAL) });
    const pm = meshWith(pec, finMat);
    pm.position.set(sd * 0.24, -0.06, 0.42);
    pm.rotation.z = sd * 1.15;
    pm.rotation.x = -0.35;
    body.add(pm);
    // 배지느러미
    const pel = sweep([
      { p: V(0, 0, 0), rx: 0.03, ry: 0.1 },
      { p: V(0, 0.1, 0), rx: 0.02, ry: 0.08 },
      { p: V(0, 0.18, 0.03), rx: 0.008, ry: 0.03 },
    ], { radial: 8, capStart: true, capEnd: true, colorFn: () => BELLY });
    const plm = meshWith(pel, finMat);
    plm.position.set(sd * 0.14, -0.24, -0.42);
    plm.rotation.z = sd * 1.3;
    body.add(plm);
  }

  // 꼬리지느러미 (위·아래 갈래)
  const tailBase = rig.spine[rig.spine.length - 1];
  const up = sweep([
    { p: V(0, 0.02, 0), rx: 0.04, ry: 0.1 },
    { p: V(0, 0.2, -0.1), rx: 0.03, ry: 0.12 },
    { p: V(0, 0.44, -0.26), rx: 0.018, ry: 0.14 },
    { p: V(0, 0.58, -0.4), rx: 0.006, ry: 0.06 },
  ], { radial: 8, capStart: true, capEnd: true, colorFn: () => DORSAL });
  tailBase.add(meshWith(up, finMat)).position.set(0, 0, -0.12);
  const down = sweep([
    { p: V(0, -0.02, 0), rx: 0.035, ry: 0.09 },
    { p: V(0, -0.16, -0.08), rx: 0.024, ry: 0.1 },
    { p: V(0, -0.3, -0.22), rx: 0.012, ry: 0.08 },
    { p: V(0, -0.38, -0.34), rx: 0.004, ry: 0.04 },
  ], { radial: 8, capStart: true, capEnd: true, colorFn: () => FLANK });
  tailBase.add(meshWith(down, finMat)).position.set(0, 0, -0.12);

  return { root, rig };
}

// ══════════════════════════════════════════════════════════
//  범고래
// ══════════════════════════════════════════════════════════
function buildOrca() {
  const skin = vertexMaterial({ roughness: 0.34, metalness: 0.08 });
  const white = vertexMaterial({ roughness: 0.42 });
  const plain = vertexMaterial({ roughness: 0.3, metalness: 0.15 });
  const BLACK = C(0x121519);
  const GREY = C(0x2c3238);
  const WHITE = C(0xf4f6f6);
  const orcaTone = (d, t) => {
    const y = clamp(d.y, -1, 1);
    // 아래쪽은 흰 배 — 배는 앞쪽에서 넓고 뒤로 갈수록 좁다
    const bellyLine = -0.12 - (1 - t) * 0.34 + Math.max(0, t - 0.6) * 1.1;
    if (y < bellyLine - 0.12) return WHITE;
    if (y < bellyLine + 0.06) return WHITE.clone().lerp(BLACK, (y - bellyLine - 0.12) / 0.18);
    return y > 0.55 ? GREY.clone().lerp(BLACK, 0.5) : BLACK;
  };
  const eyeMat = vertexMaterial({ roughness: 0.05, metalness: 0.4 });
  const bodyY = 1.35;
  const { root, rig } = fishBody({
    bodyY,
    segs: 7,
    segLen: 0.5,
    radial: 20,
    flatten: 0.95,
    radiusAt: (g) => {
      if (g < 0.06) return lerp(0.1, 0.26, g / 0.06);
      if (g < 0.22) return lerp(0.26, 0.4, (g - 0.06) / 0.16);
      if (g < 0.42) return lerp(0.4, 0.42, (g - 0.22) / 0.2);
      if (g < 0.72) return lerp(0.42, 0.2, (g - 0.42) / 0.3);
      return lerp(0.2, 0.04, (g - 0.72) / 0.28);
    },
    axisY: () => -0.02,
    colorFn: (p, d, t) => orcaTone(d, t),
    mat: skin,
  });
  const body = rig.body;
  // 등지느러미
  const dorsal = sweep([
    { p: V(0, 0, 0), rx: 0.06, ry: 0.3 },
    { p: V(0, 0.28, -0.06), rx: 0.05, ry: 0.24 },
    { p: V(0, 0.56, -0.06), rx: 0.035, ry: 0.15 },
    { p: V(0, 0.75, 0.0), rx: 0.012, ry: 0.05 },
  ], { radial: 10, capStart: true, capEnd: true, colorFn: () => BLACK });
  const dm = meshWith(dorsal, skin);
  dm.position.set(0, 0.32, 0.3);
  dm.rotation.x = -0.2;
  body.add(dm);

  // 머리 — 둥근 이마
  const head = new THREE.Group();
  head.position.set(0, 0, 1.62);
  body.add(head);
  rig.head = head;
  rig.neck = head;
  const snout = sweep([
    { p: V(0, 0.02, -0.36), rx: 0.3, ry: 0.29 },
    { p: V(0, 0.01, -0.16), rx: 0.32, ry: 0.3 },
    { p: V(0, 0.0, 0.04), rx: 0.27, ry: 0.25 },
    { p: V(0, -0.02, 0.2), rx: 0.18, ry: 0.17 },
    { p: V(0, -0.03, 0.3), rx: 0.08, ry: 0.075 },
  ], { radial: 18, capStart: true, capEnd: true, colorFn: (p, d) => (d.y < -0.15 ? WHITE : BLACK) });
  head.add(meshWith(snout, skin));

  // 흰 턱
  const chin = sweep([
    { p: V(0, -0.14, -0.3), rx: 0.22, ry: 0.09 },
    { p: V(0, -0.16, -0.1), rx: 0.24, ry: 0.1 },
    { p: V(0, -0.15, 0.1), rx: 0.2, ry: 0.085 },
    { p: V(0, -0.13, 0.24), rx: 0.12, ry: 0.05 },
  ], { radial: 14, capStart: true, capEnd: true, colorFn: () => W(1, 1, 1) });
  head.add(meshWith(chin, white));
  void WHITE;

  // 흰 눈 패치 (눈 뒤 타원)
  const patch = [];
  for (const sd of [-1, 1]) {
    patch.push(sphPart(0.09, 0.05, 0.13, { pos: [sd * 0.24, 0.09, -0.02], rot: [0, sd * 0.2, sd * 0.1], color: W(2.5, 2.5, 2.5) }));
  }
  head.add(meshWith(merge(patch), white));
  // 눈
  const eyes = [];
  for (const sd of [-1, 1]) {
    eyes.push(sphPart(0.035, 0.033, 0.03, { pos: [sd * 0.245, 0.06, 0.06], color: 0x08080a, seg: 12 }));
  }
  head.add(meshWith(merge(eyes), eyeMat));

  // 회색 안장 무늬 (등지느러미 뒤)
  const saddle = [];
  saddle.push(sphPart(0.16, 0.05, 0.22, { pos: [0, 0.3, -0.35], color: W(1.5, 1.5, 1.55) }));
  body.add(meshWith(merge(saddle), white));

  // 가슴지느러미 — 둥근 노 모양
  for (const sd of [-1, 1]) {
    const pec = sweep([
      { p: V(0, 0, 0.1), rx: 0.09, ry: 0.11 },
      { p: V(0, 0.12, -0.06), rx: 0.075, ry: 0.1 },
      { p: V(0, 0.22, -0.2), rx: 0.05, ry: 0.075 },
      { p: V(0, 0.26, -0.3), rx: 0.02, ry: 0.03 },
    ], { radial: 8, capStart: true, capEnd: true, colorFn: () => BLACK });
    const pm = meshWith(pec, skin);
    pm.position.set(sd * 0.3, -0.1, 0.62);
    pm.rotation.z = sd * 1.25;
    pm.rotation.x = 0.5;
    body.add(pm);
  }

  // 꼬리지느러미 — 수평
  const tailBase = rig.spine[rig.spine.length - 1];
  const fluke = sweep([
    { p: V(0, 0, 0), rx: 0.03, ry: 0.1 },
    { p: V(0.18, 0, -0.08), rx: 0.022, ry: 0.16 },
    { p: V(0.34, 0, -0.18), rx: 0.012, ry: 0.14 },
  ], { radial: 8, capStart: true, capEnd: true, colorFn: () => BLACK });
  const fm1 = meshWith(fluke, skin);
  fm1.position.set(0, 0, -0.1);
  fm1.rotation.y = Math.PI / 2;
  tailBase.add(fm1);
  const fm2 = meshWith(fluke, skin);
  fm2.position.set(0, 0, -0.1);
  fm2.rotation.y = -Math.PI / 2;
  tailBase.add(fm2);

  return { root, rig };
}

// ══════════════════════════════════════════════════════════
//  대왕문어
// ══════════════════════════════════════════════════════════
function buildOctopus() {
  const skin = furMaterial('octopus-skin', { roughness: 0.55 });
  const plain = vertexMaterial({ roughness: 0.4 });
  const eyeMat = vertexMaterial({ roughness: 0.08, metalness: 0.2 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, 1.1, 0);
  root.add(body);
  const rig = { form: 'serpent', body, hipY: 1.1 };

  // 외투막 — 물방울 모양
  const mantle = sweep([
    { p: V(0, 0.72, 0), rx: 0.06, ry: 0.06 },
    { p: V(0, 0.6, 0.0), rx: 0.24, ry: 0.24 },
    { p: V(0, 0.42, 0), rx: 0.36, ry: 0.36 },
    { p: V(0, 0.2, 0.02), rx: 0.38, ry: 0.37 },
    { p: V(0, 0.0, 0.02), rx: 0.33, ry: 0.32 },
    { p: V(0, -0.12, 0), rx: 0.24, ry: 0.23 },
  ], {
    radial: 22, capStart: true, capEnd: true,
    colorFn: (p, d) => (d.y > 0.4 ? W(1.08, 1.04, 1.0) : d.y < -0.3 ? W(0.92, 0.88, 0.86) : W(1.0)),
  });
  body.add(meshWith(mantle, skin));

  // 머리(눈 두덩) — 외투막 아래
  const head = new THREE.Group();
  head.position.set(0, -0.02, 0);
  body.add(head);
  rig.head = head;
  rig.neck = head;
  const eyeBump = [];
  for (const sd of [-1, 1]) {
    eyeBump.push(sphPart(0.1, 0.1, 0.1, { pos: [sd * 0.22, -0.02, 0.16], color: W(1.04) }));
  }
  head.add(meshWith(merge(eyeBump), skin));
  const eyes = [];
  for (const sd of [-1, 1]) {
    eyes.push(sphPart(0.055, 0.055, 0.05, { pos: [sd * 0.245, -0.02, 0.2], color: 0xd8b070, seg: 12 }));
    eyes.push(sphPart(0.03, 0.038, 0.03, { pos: [sd * 0.26, -0.02, 0.235], color: 0x0a0806, seg: 10 }));
  }
  head.add(meshWith(merge(eyes), eyeMat));

  // 사이펀
  const siphon = splineTube([
    [0.16, -0.12, 0.16, 0.06],
    [0.24, -0.15, 0.26, 0.045],
    [0.3, -0.16, 0.34, 0.03],
  ], { radial: 8, steps: 4, colorFn: () => W(0.9, 0.86, 0.84) });
  head.add(meshWith(siphon, skin));

  // 다리 8개 — 한 덩어리 곡선 관 (마디 없이 부드럽게)
  rig.tentacles = [];
  const armCount = 8;
  for (let a = 0; a < armCount; a++) {
    const ang = (a / armCount) * TAU + 0.35;
    const arm = new THREE.Group();
    arm.position.set(Math.cos(ang) * 0.18, -0.22, Math.sin(ang) * 0.18);
    arm.rotation.y = -ang + Math.PI / 2;
    body.add(arm);
    rig.tentacles.push([arm]);

    const len = 1.55 + (a % 3) * 0.12;
    const pts = [
      [0, 0.02, 0, 0.105],
      [0, -0.06, len * 0.22, 0.088],
      [0, -0.2, len * 0.46, 0.062],
      [0, -0.36, len * 0.68, 0.04],
      [0, -0.44, len * 0.86, 0.022],
      [0, -0.36, len * 1.0, 0.008],
    ];
    const armGeo = splineTube(pts, { radial: 12, steps: 8, colorFn: (p, d) => (d.y < -0.3 ? W(1.1, 1.02, 0.96) : W(1.0)) });
    arm.add(meshWith(armGeo, skin));

    // 빨판 — 다리 안쪽 두 줄
    const suckers = [];
    for (let k = 0; k < 12; k++) {
      const t = 0.12 + (k / 12) * 0.8;
      const idx = t * (pts.length - 1);
      const i0 = Math.min(pts.length - 2, Math.floor(idx));
      const f = idx - i0;
      const z = lerp(pts[i0][2], pts[i0 + 1][2], f);
      const y = lerp(pts[i0][1], pts[i0 + 1][1], f);
      const r = lerp(pts[i0][3], pts[i0 + 1][3], f);
      for (const sd of [-1, 1]) {
        suckers.push(sphPart(r * 0.42, r * 0.3, r * 0.42, { pos: [sd * r * 0.45, y - r * 0.72, z], color: 0xe0a888, seg: 6 }));
      }
    }
    arm.add(meshWith(merge(suckers), plain));
  }
  rig.spine = null;
  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  return { root, rig };
}


// ══════════════════════════════════════════════════════════
//  아나콘다
// ══════════════════════════════════════════════════════════
function buildAnaconda() {
  const skin = scaleMaterial();
  const plain = vertexMaterial({ roughness: 0.5 });
  const eyeMat = vertexMaterial({ roughness: 0.08, metalness: 0.3 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, 0.34, 0);
  root.add(body);
  const rig = { form: 'serpent', body, hipY: 0.34 };

  const SEG = 13;
  const LEN = 0.34;
  const OVER = 0.08;
  const total = SEG * LEN;
  const radiusAt = (g) => {
    if (g < 0.06) return lerp(0.19, 0.29, g / 0.06);
    if (g < 0.2) return lerp(0.29, 0.36, (g - 0.06) / 0.14);
    if (g < 0.45) return 0.36;
    if (g < 0.8) return lerp(0.36, 0.19, (g - 0.45) / 0.35);
    return lerp(0.19, 0.035, (g - 0.8) / 0.2);
  };
  const spine = [];
  let parent = body;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? 1.2 : -LEN);
    parent.add(seg);
    const steps = 4;
    const secs = [];
    for (let k = 0; k <= steps; k++) {
      const g = clamp((i + k / steps) / SEG, 0, 1);
      const r = radiusAt(g);
      secs.push({ p: V(0, 0, i === 0 ? -(k / steps) * LEN : -(k / steps) * LEN + OVER * (1 - k / steps)), rx: r * 0.94, ry: r });
    }
    const geo = sweep(secs, {
      radial: 18,
      capStart: i === 0,
      capEnd: i === SEG - 1,
      uv: (p, t, a) => [a / TAU, (i + t) / SEG],
      colorFn: (p, d) => (d.y < -0.4 ? W(1.35, 1.3, 1.1) : d.y > 0.5 ? W(0.9, 0.94, 0.9) : W(1.0)),
    });
    seg.add(meshWith(geo, skin));
    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;

  // 꼬리 끝
  const tipGeo = splineTube([
    [0, 0, 0.02, 0.035],
    [0, -0.01, -0.16, 0.018],
    [0, -0.02, -0.3, 0.004],
  ], { radial: 10, steps: 4, colorFn: () => W(0.8, 0.82, 0.78) });
  spine[spine.length - 1].add(meshWith(tipGeo, skin));

  // 머리 — 쐐기형
  const neck = new THREE.Group();
  neck.position.set(0, 0.06, 1.26);
  neck.rotation.x = -0.3;
  body.add(neck);
  rig.neck = neck;
  const head = new THREE.Group();
  neck.add(head);
  rig.head = head;
  const hprofile = [
    { p: V(0, 0.0, -0.14), rx: 0.15, ry: 0.13 },
    { p: V(0, 0.01, -0.02), rx: 0.18, ry: 0.15 },
    { p: V(0, 0.005, 0.12), rx: 0.165, ry: 0.13 },
    { p: V(0, -0.005, 0.26), rx: 0.135, ry: 0.1 },
    { p: V(0, -0.015, 0.36), rx: 0.1, ry: 0.075 },
    { p: V(0, -0.02, 0.42), rx: 0.06, ry: 0.05 },
  ];
  const headGeo = sweep(hprofile, { radial: 16, capStart: true, capEnd: true, uv: (p, t, a) => [a / TAU, 0.02 + t * 0.2], colorFn: (p, d) => (d.y < -0.3 ? W(1.3, 1.26, 1.06) : W(1.0)) });
  head.add(meshWith(headGeo, skin));

  // 눈 (위쪽) + 열 감지 구멍
  const eyeParts = [];
  const lipParts = [];
  for (const sd of [-1, 1]) {
    eyeParts.push(sphPart(0.042, 0.038, 0.036, { pos: [sd * 0.11, 0.075, 0.1], color: 0xd8a52c, seg: 12 }));
    eyeParts.push(sphPart(0.016, 0.03, 0.014, { pos: [sd * 0.115, 0.08, 0.13], color: 0x0a0c06, seg: 8 }));
    lipParts.push(sphPart(0.014, 0.012, 0.016, { pos: [sd * 0.05, 0.05, 0.4], color: 0x10140c, seg: 6 }));
    for (let k = 0; k < 3; k++) {
      lipParts.push(sphPart(0.008, 0.008, 0.01, { pos: [sd * (0.085 + k * 0.012), 0.012, 0.3 - k * 0.03], color: 0x1a1a10, seg: 6 }));
    }
  }
  head.add(meshWith(merge(lipParts), skin));
  head.add(meshWith(merge(eyeParts), eyeMat));

  // 아래턱
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.05, 0.06);
  head.add(jaw);
  rig.jaw = jaw;
  rig.jawBase = 0;
  const jawGeo = sweep([
    { p: V(0, -0.02, 0.0), rx: 0.13, ry: 0.05 },
    { p: V(0, -0.03, 0.14), rx: 0.12, ry: 0.045 },
    { p: V(0, -0.035, 0.3), rx: 0.075, ry: 0.03 },
  ], { radial: 12, capStart: true, capEnd: true, colorFn: () => W(1.2, 1.16, 1.0) });
  jaw.add(meshWith(jawGeo, skin));

  // 두 갈래 혀
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.03, 0.34);
  head.add(tongue);
  rig.tongue = tongue;
  const tg = [];
  tg.push(sphPart(0.022, 0.01, 0.1, { pos: [0, 0, 0.04], color: 0x9c2f3a }));
  for (const sd of [-1, 1]) {
    tg.push(sphPart(0.011, 0.008, 0.08, { pos: [sd * 0.026, 0, 0.16], rot: [0, sd * 0.35, 0], color: 0xb8404e }));
  }
  tongue.add(meshWith(merge(tg), plain));
  tongue.scale.z = 0.001;

  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  return { root, rig };
}

export {
  quad, buildLeg, buildTail, makeHead, meshWith, sphPart, conePart,
  splineTube, splinePoints, tuftParts, V, W, C, WHITE, mix,
  buildLion, buildTiger, buildCheetah, buildWolf, buildBear, buildPolarBear,
  buildElephant, buildRhino, buildShark, buildOrca, buildOctopus, buildAnaconda, fishBody,
};
