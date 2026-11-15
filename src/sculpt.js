// 조형 도구 — 키프레임 보간, 스윕(관) 메시, 부위 병합, 털 다발
// 여러 개의 작은 도형을 하나의 지오메트리로 합쳐 드로우콜과 이음매를 줄인다.
import THREE from './three.js?v=20261115c';

export const TAU = Math.PI * 2;

const geoCache = new Map();
const matCache = new Map();

// ── 1차원 채널 보간 (Catmull-Rom) ───────────────────────────
// pts: [[x, v0, v1, ...], ...] (x 오름차순) → f(x) = [v0, v1, ...]
export function track(pts) {
  const n = pts.length;
  const dim = pts[0].length - 1;
  return (x) => {
    if (x <= pts[0][0]) return pts[0].slice(1);
    if (x >= pts[n - 1][0]) return pts[n - 1].slice(1);
    let i = 0;
    while (i < n - 2 && x > pts[i + 1][0]) i++;
    const x0 = pts[i][0];
    const x1 = pts[i + 1][0];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const out = new Array(dim);
    for (let d = 0; d < dim; d++) {
      const v0 = pts[i][d + 1];
      const v1 = pts[i + 1][d + 1];
      const im = Math.max(0, i - 1);
      const ip = Math.min(n - 1, i + 2);
      const vm = pts[im][d + 1];
      const vp = pts[ip][d + 1];
      const m0 = im === i ? (v1 - v0) / h : (v1 - vm) / (x1 - pts[im][0]);
      const m1 = ip === i + 1 ? (v1 - v0) / h : (vp - v0) / (pts[ip][0] - x0);
      out[d] =
        (2 * t3 - 3 * t2 + 1) * v0 +
        (t3 - 2 * t2 + t) * h * m0 +
        (-2 * t3 + 3 * t2) * v1 +
        (t3 - t2) * h * m1;
    }
    return out;
  };
}

// ── 지오메트리 캐시 ────────────────────────────────────────
export function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function unitSphere(seg = 14) {
  const s = Math.max(6, Math.round(seg * 0.62));
  return cachedGeo(`sph|${seg}`, () => new THREE.SphereGeometry(1, seg, s));
}

export function unitCone(seg = 5) {
  // 밑면이 y=0, 꼭짓점이 y=1
  return cachedGeo(`cone|${seg}`, () => {
    const g = new THREE.ConeGeometry(1, 1, seg, 1);
    g.translate(0, 0.5, 0);
    return g;
  });
}

export function unitBox() {
  return cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
}

export function unitCyl(seg = 12, open = false) {
  return cachedGeo(`cyl|${seg}|${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));
}

// ── 변환 행렬 ──────────────────────────────────────────────
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();

export function matrixOf(o = {}) {
  const m = new THREE.Matrix4();
  if (o.quat) _quat.copy(o.quat);
  else {
    const r = o.rot || [0, 0, 0];
    _quat.setFromEuler(_euler.set(r[0] || 0, r[1] || 0, r[2] || 0));
  }
  const s = o.scale;
  if (s === undefined) _scale.set(1, 1, 1);
  else if (typeof s === 'number') _scale.set(s, s, s);
  else _scale.set(s[0] ?? s.x ?? 1, s[1] ?? s.y ?? 1, s[2] ?? s.z ?? 1);
  const p = o.pos;
  if (!p) _pos.set(0, 0, 0);
  else if (p.isVector3) _pos.copy(p);
  else _pos.set(p[0] || 0, p[1] || 0, p[2] || 0);
  m.compose(_pos, _quat, _scale);
  return m;
}

// ── 부위 병합 ──────────────────────────────────────────────
// parts: [{ geo, color, colorFn(x,y,z,nx,ny,nz,out), pos, rot, scale, quat }]
const _c = new THREE.Color();

export function merge(parts) {
  const list = [];
  let total = 0;
  for (const part of parts) {
    if (!part || !part.geo) continue;
    let g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    g.applyMatrix4(matrixOf(part));
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push({ g, part });
    total += g.attributes.position.count;
  }
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let base = 0;
  for (const { g, part } of list) {
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    const cnt = g.attributes.position.count;
    position.set(pa, base * 3);
    normal.set(na, base * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, base * 2);
    const flat = part.color !== undefined ? new THREE.Color(part.color) : null;
    const fn = part.colorFn;
    if (part.keepColors && g.attributes.color) {
      color.set(g.attributes.color.array, base * 3);
    } else if (!fn && flat) {
      for (let i = 0; i < cnt; i++) {
        color[(base + i) * 3] = flat.r;
        color[(base + i) * 3 + 1] = flat.g;
        color[(base + i) * 3 + 2] = flat.b;
      }
    } else {
      for (let i = 0; i < cnt; i++) {
        const o = (base + i) * 3;
        const lo = i * 3;
        if (fn) {
          _c.copy(fn(pa[lo], pa[lo + 1], pa[lo + 2], na[lo], na[lo + 1], na[lo + 2]) || flat || 0xffffff);
        } else {
          _c.copy(flat || 0xffffff);
        }
        color[o] = _c.r;
        color[o + 1] = _c.g;
        color[o + 2] = _c.b;
      }
    }
    base += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.userData.built = true;
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ── 스윕: 단면 고리를 따라 이어 붙인 관 ────────────────────
// sections: [{ p: Vector3, rx, ry, roll? }]
// opts.colorFn(p, dir, t, angle) → THREE.Color
export function sweep(sections, opts = {}) {
  const radial = opts.radial ?? 14;
  const n = sections.length;
  const upRef = opts.up
    ? opts.up.isVector3
      ? opts.up.clone()
      : new THREE.Vector3(...opts.up)
    : new THREE.Vector3(0, 1, 0);
  const colorFn = opts.colorFn;
  const capStart = !!opts.capStart;
  const capEnd = !!opts.capEnd;

  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = sections[Math.max(0, i - 1)].p;
    const b = sections[Math.min(n - 1, i + 1)].p;
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-10) t.set(0, 0, 1);
    tangents.push(t.normalize());
  }

  const vertCount = n * (radial + 1);
  const capCount = (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const extra = capCount * (radial + 2);
  const positions = new Float32Array((vertCount + extra) * 3);
  const colors = new Float32Array((vertCount + extra) * 3);
  const uvs = new Float32Array((vertCount + extra) * 2);
  const uvFn = opts.uv;
  const indices = [];
  const col = new THREE.Color();
  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const T = tangents[i];
    let ref = upRef;
    if (Math.abs(T.dot(ref)) > 0.94) ref = new THREE.Vector3(0, 0, 1);
    const S = new THREE.Vector3().crossVectors(ref, T).normalize();
    const U = new THREE.Vector3().crossVectors(T, S).normalize();
    const s = sections[i];
    const t = n === 1 ? 0 : i / (n - 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU + (s.roll || 0);
      dir.set(0, 0, 0).addScaledVector(S, Math.cos(a)).addScaledVector(U, Math.sin(a));
      p.copy(s.p).addScaledVector(S, Math.cos(a) * s.rx).addScaledVector(U, Math.sin(a) * s.ry);
      const vi = i * (radial + 1) + j;
      positions[vi * 3] = p.x;
      positions[vi * 3 + 1] = p.y;
      positions[vi * 3 + 2] = p.z;
      const uv = uvFn ? uvFn(p, t, a) : [j / radial, t];
      uvs[vi * 2] = uv[0];
      uvs[vi * 2 + 1] = uv[1];
      if (colorFn) {
        col.copy(colorFn(p, dir, t, a) || 0xffffff);
        colors[vi * 3] = col.r;
        colors[vi * 3 + 1] = col.g;
        colors[vi * 3 + 2] = col.b;
      } else {
        // 기본 흰색 (텍스처를 그대로 보여준다)
        colors[vi * 3] = colors[vi * 3 + 1] = colors[vi * 3 + 2] = 1;
      }
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = i * (radial + 1) + j + 1;
      const c = (i + 1) * (radial + 1) + j + 1;
      const d = (i + 1) * (radial + 1) + j;
      indices.push(a, b, c, a, c, d);
    }
  }

  let next = vertCount;
  const addCap = (i, forward) => {
    const s = sections[i];
    const T = tangents[i];
    const ref = Math.abs(T.dot(upRef)) > 0.94 ? new THREE.Vector3(0, 0, 1) : upRef;
    const S = new THREE.Vector3().crossVectors(ref, T).normalize();
    const U = new THREE.Vector3().crossVectors(T, S).normalize();
    const centerIdx = next;
    // 뚜껑 중심점
    positions[next * 3] = s.p.x;
    positions[next * 3 + 1] = s.p.y;
    positions[next * 3 + 2] = s.p.z;
    if (colorFn) {
      const t = n === 1 ? 0 : i / (n - 1);
      col.copy(colorFn(s.p, new THREE.Vector3(0, forward ? 1 : -1, 0), t, 0) || 0xffffff);
      colors[next * 3] = col.r;
      colors[next * 3 + 1] = col.g;
      colors[next * 3 + 2] = col.b;
    }
    next++;
    // 테두리 복제 (색은 원래 고리에서)
    const ringStart = next;
    for (let j = 0; j <= radial; j++) {
      const src = (i * (radial + 1) + j) * 3;
      positions[next * 3] = positions[src];
      positions[next * 3 + 1] = positions[src + 1];
      positions[next * 3 + 2] = positions[src + 2];
      if (colorFn) {
        colors[next * 3] = colors[src];
        colors[next * 3 + 1] = colors[src + 1];
        colors[next * 3 + 2] = colors[src + 2];
      }
      next++;
    }
    for (let j = 0; j < radial; j++) {
      const a = ringStart + j;
      const b = ringStart + j + 1;
      if (forward) indices.push(centerIdx, a, b);
      else indices.push(centerIdx, b, a);
    }
    void S;
    void U;
  };

  if (capStart) addCap(0, false);
  if (capEnd) addCap(n - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.built = true;
  return geo;
}

// ── 머티리얼 ───────────────────────────────────────────────
export function vertexMaterial({ roughness = 0.9, metalness = 0, flat = false, doubleSide = false, sheenColor } = {}) {
  const key = `v|${roughness}|${metalness}|${flat}|${doubleSide}|${sheenColor ?? '-'}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness,
      metalness,
      flatShading: flat,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (sheenColor !== undefined) {
      // 유광 비늘/젖은 코트용 (낮은 거칠기 사용 시)
      m.envMapIntensity = 0.6;
    }
    matCache.set(key, m);
  }
  return m;
}

export function meshOf(geo, opts = {}) {
  const m = new THREE.Mesh(geo, vertexMaterial(opts));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  return m;
}

export function shade(hex, k) {
  // k>1 밝게, k<1 어둡게 (sRGB 근사)
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c;
}

// ── 털 다발: 방사형으로 뻗은 납작한 가닥들 ─────────────────
// cfg: { center, axis?, rows: [{count, radius(R x), radiusY, len, width, tilt, spread, color, tipColor, y?}] }
export function shardFan(cfg) {
  const parts = [];
  const center = cfg.center ? (cfg.center.isVector3 ? cfg.center : new THREE.Vector3(...cfg.center)) : new THREE.Vector3();
  const rows = cfg.rows || [];
  const coneGeo = unitCone(cfg.seg || 4);
  for (const row of rows) {
    const count = row.count;
    const phase = row.phase ?? 0;
    const arc = row.arc ?? TAU;
    for (let i = 0; i < count; i++) {
      const a = phase + (count === 1 ? 0 : (i / count) * arc);
      const dir = new THREE.Vector3(
        Math.cos(a) * (row.rx ?? 1),
        (row.y ?? 0) + Math.sin(a * (row.wave ?? 1)) * (row.yVar ?? 0),
        Math.sin(a) * (row.rz ?? 1)
      ).normalize();
      const len = (row.len ?? 0.2) * (0.7 + Math.random() * 0.6);
      const w = (row.width ?? 0.05) * (0.8 + Math.random() * 0.5);
      const tilt = row.tilt ?? 0;
      // 가닥이 뻗는 방향 = 표면 방향 + 바깥/뒤로 젖힘
      const lean = new THREE.Vector3()
        .copy(dir)
        .multiplyScalar(1 - tilt)
        .addScaledVector(new THREE.Vector3(0, row.sag ?? -0.2, 0), tilt)
        .normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
      // 살짝 비틀어 납작하게
      const base = new THREE.Color(row.color ?? 0xffffff);
      const tip = new THREE.Color(row.tipColor ?? row.color ?? 0xffffff);
      const pos = center.clone().addScaledVector(dir, row.at ?? 0);
      parts.push({
        geo: coneGeo,
        quat: q,
        pos,
        scale: [w, len, w * (row.flat ?? 0.55)],
        colorFn: (x, y, z) => {
          const t = Math.min(1, Math.max(0, y - pos.y) / Math.max(0.001, len));
          return base.clone().lerp(tip, Math.pow(t, 1.4));
        },
      });
    }
  }
  return merge(parts);
}
