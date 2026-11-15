// 서킷 생성 — 트랙 형상, 노면·연석·가드레일·관중석·도시 풍경
import THREE from './three.js?v=20261115b';
import { clamp, rand, TAU } from './util.js?v=20261115b';
import {
  asphaltTexture, curbTexture, grassTexture, buildingTexture,
  bannerTexture, crowdTexture, signTexture, numberTexture,
} from './textures.js?v=20261115b';

// 좌표: (x, z) 평면. 시작/결승 직선은 +x 방향(직선 중앙에서 출발).
const CONTROL = [
  [150, 203], [238, 197], [286, 172], [300, 128],
  [286, 84], [246, 54], [186, 44], [146, 55], [128, 92],
  [130, 130], [117, 158], [88, 163], [77, 136], [82, 100],
  [70, 70], [34, 55], [9, 86], [4, 136], [18, 181], [40, 199], [60, 200],
];

export const HALF_WIDTH = 8.4;
const SHOULDER = 3.2;
const RAIL_OFF = HALF_WIDTH + 3.4;

export function buildTrack(scene) {
  const curve = new THREE.CatmullRomCurve3(
    CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true, 'catmullrom', 0.5
  );
  const length = curve.getLength();
  const N = Math.max(360, Math.round(length / 2.0));
  const ds = length / N;

  const pts = [];
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    pts.push({ x: p.x, z: p.z, s: u * length, u, tx: 0, tz: 1, curv: 0 });
  }
  // 접선·곡률
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    let dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    pts[i].tx = dx / l;
    pts[i].tz = dz / l;
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    const cross = a.tx * b.tz - a.tz * b.tx;
    const dot = clamp(a.tx * b.tx + a.tz * b.tz, -1, 1);
    pts[i].curv = Math.atan2(cross, dot) / (2 * ds);
  }
  // 곡률 스무딩
  for (let pass = 0; pass < 3; pass++) {
    const tmp = pts.map((p) => p.curv);
    for (let i = 0; i < N; i++) {
      pts[i].curv = (tmp[(i - 1 + N) % N] + tmp[i] * 2 + tmp[(i + 1) % N]) / 4;
    }
  }

  const group = new THREE.Group();
  group.name = 'circuit';
  scene.add(group);

  const idx = (i) => (i % N + N) % N;
  const pt = (i) => pts[idx(i)];
  const rightOf = (p) => ({ x: p.tz, z: -p.tx });

  /* ── 지면(잔디) ───────────────────────────────────────── */
  const grassMap = grassTexture();
  grassMap.repeat.set(46, 46);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900, 1, 1),
    new THREE.MeshStandardMaterial({ map: grassMap, roughness: 1, metalness: 0, color: 0x9fb98a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(150, -0.02, 105);
  ground.receiveShadow = true;
  group.add(ground);

  /* ── 리본 지오메트리 헬퍼 ─────────────────────────────── */
  function ribbon(offA, offB, y, vScale, tex, opts = {}) {
    const pos = [], uv = [], nor = [], ind = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i], r = rightOf(p);
      const ax = p.x + r.x * offA, az = p.z + r.z * offA;
      const bx = p.x + r.x * offB, bz = p.z + r.z * offB;
      pos.push(ax, y, az, bx, y, bz);
      uv.push(0, p.s * vScale, 1, p.s * vScale);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = ((i + 1) % N) * 2, d = ((i + 1) % N) * 2 + 1;
      ind.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(ind);
    const mat = opts.material || new THREE.MeshStandardMaterial({
      roughness: 0.94, metalness: 0.02, side: THREE.DoubleSide,
    });
    if (tex) mat.map = tex;
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = !!opts.receiveShadow;
    group.add(m);
    return m;
  }

  /* ── 노면 ─────────────────────────────────────────────── */
  const asphalt = asphaltTexture();
  asphalt.repeat.set(1, 1);
  const road = ribbon(-HALF_WIDTH, HALF_WIDTH, 0.02, 1 / 9, asphalt, { receiveShadow: true });
  road.name = 'road';

  // 어깨(콘크리트)
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.95 });
  ribbon(HALF_WIDTH, HALF_WIDTH + SHOULDER, 0.015, 0.2, null, { material: shoulderMat });
  ribbon(-HALF_WIDTH - SHOULDER, -HALF_WIDTH, 0.015, 0.2, null, { material: shoulderMat });

  // 연석
  const curb = curbTexture();
  curb.repeat.set(1, 1);
  ribbon(HALF_WIDTH - 0.1, HALF_WIDTH + 1.25, 0.045, 1 / 4.4, curb);
  ribbon(-HALF_WIDTH - 1.25, -HALF_WIDTH + 0.1, 0.045, 1 / 4.4, curb);

  // 흰색 경계선
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.6 });
  ribbon(-HALF_WIDTH + 0.45, -HALF_WIDTH + 0.85, 0.035, 0.2, null, { material: lineMat });
  ribbon(HALF_WIDTH - 0.85, HALF_WIDTH - 0.45, 0.035, 0.2, null, { material: lineMat });

  /* ── 가드레일 ─────────────────────────────────────────── */
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xb9c4d4, roughness: 0.36, metalness: 0.85, side: THREE.DoubleSide,
  });
  function railBand(off) {
    const pos = [], nor = [], ind = [], uv = [];
    const y0 = 0.52, y1 = 1.0;
    for (let i = 0; i < N; i++) {
      const p = pts[i], r = rightOf(p);
      const x = p.x + r.x * off, z = p.z + r.z * off;
      pos.push(x, y0, z, x, y1, z);
      uv.push(p.s * 0.2, 0, p.s * 0.2, 1);
      nor.push(r.x, 0, r.z, r.x, 0, r.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = ((i + 1) % N) * 2, d = ((i + 1) % N) * 2 + 1;
      ind.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ind);
    const m = new THREE.Mesh(g, railMat);
    group.add(m);
  }
  railBand(RAIL_OFF);
  railBand(-RAIL_OFF);

  // 가드레일 기둥
  const postCount = Math.floor(N / 3.2);
  const postGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x69737f, roughness: 0.5, metalness: 0.6 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, postCount * 2);
  const dummy = new THREE.Object3D();
  let pi = 0;
  for (let k = 0; k < postCount; k++) {
    const p = pts[Math.floor((k * N) / postCount)];
    const r = rightOf(p);
    for (const side of [1, -1]) {
      dummy.position.set(p.x + r.x * RAIL_OFF * side, 0.5, p.z + r.z * RAIL_OFF * side);
      dummy.rotation.set(0, Math.atan2(p.tx, p.tz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(pi++, dummy.matrix);
    }
  }
  posts.count = pi;
  posts.castShadow = false;
  group.add(posts);

  /* ── 스타트/결승 체커 라인 & 아치 ────────────────────── */
  function placeAt(s, laneOff = 0, y = 0) {
    const i = Math.floor((s / ds) % N);
    const p = pts[idx(i)];
    const r = rightOf(p);
    return { x: p.x + r.x * laneOff, z: p.z + r.z * laneOff, y, yaw: Math.atan2(p.tx, p.tz), p };
  }

  // 체커 라인
  const checker = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const g = c.getContext('2d');
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? '#f4f7ff' : '#141922';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  })();
  {
    const p = placeAt(6);
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_WIDTH * 2, 2.2),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7 })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -p.yaw;
    strip.position.set(p.x, 0.06, p.z);
    group.add(strip);
  }

  // 스타트 아치
  {
    const p = placeAt(0);
    const arch = new THREE.Group();
    arch.position.set(p.x, 0, p.z);
    arch.rotation.y = p.yaw;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.5, metalness: 0.4 });
    const span = HALF_WIDTH + 2.2;
    for (const side of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.2, 0.9), pillarMat);
      pil.position.set(side * span, 3.6, 0);
      pil.castShadow = true;
      arch.add(pil);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), pillarMat);
      foot.position.set(side * span, 0.25, 0);
      arch.add(foot);
    }
    const bannerMat = new THREE.MeshStandardMaterial({
      map: bannerTexture(), roughness: 0.55, metalness: 0.1,
      emissive: 0x2a3648, emissiveIntensity: 0.35,
    });
    // 앞·뒤 양면 (한 면은 회전시켜 글자가 뒤집히지 않게)
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 2.7), bannerMat);
    banner.position.set(0, 5.95, 0.03);
    arch.add(banner);
    const bannerBack = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 2.7), bannerMat);
    bannerBack.position.set(0, 5.95, -0.03);
    bannerBack.rotation.y = Math.PI;
    arch.add(bannerBack);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.42, 0.6), pillarMat);
    beam.position.set(0, 7.0, 0);
    arch.add(beam);
    // 조명 스트립
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(span * 2, 0.1, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x43e6ff })
    );
    glow.position.set(0, 4.62, 0.35);
    arch.add(glow);
    group.add(arch);
  }

  /* ── 풍경: 관중석, 건물, 나무, 표지판 ────────────────── */
  // 관중석(시작 직선 바깥)
  {
    const p0 = placeAt(30);
    const r = rightOf(p0.p);
    const stand = new THREE.Group();
    const len = 62;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(len, 5.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x1c2432, roughness: 0.85 })
    );
    base.position.set(0, 2.8, 0);
    stand.add(base);
    const crowdTex = crowdTexture();
    crowdTex.repeat.set(6, 2);
    const crowd = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 6.4),
      new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9, emissive: 0x2b3448, emissiveIntensity: 0.5 })
    );
    crowd.position.set(0, 3.4, -5.9);
    crowd.rotation.y = Math.PI;
    stand.add(crowd);
    // 지붕
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(len + 3, 0.4, 13),
      new THREE.MeshStandardMaterial({ color: 0x394a63, roughness: 0.4, metalness: 0.5 })
    );
    roof.position.set(0, 7.2, 0);
    roof.rotation.x = 0.08;
    stand.add(roof);
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 7, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a6678, metalness: 0.6, roughness: 0.4 })
      );
      col.position.set((len / 2 - 2) * s, 3.5, 5.4);
      stand.add(col);
    }
    stand.position.set(p0.x + r.x * 20, 0, p0.z + r.z * 20);
    stand.rotation.y = p0.yaw + Math.PI / 2;
    group.add(stand);
  }

  // 도시 빌딩 — 트랙에서 충분히 떨어진 곳에만 배치
  const samplesForDist = pts.filter((_, i) => i % 2 === 0);
  const centroid = pts.reduce((a, p) => ({ x: a.x + p.x / N, z: a.z + p.z / N }), { x: 0, z: 0 });
  function farFromTrack(x, z, min) {
    const m2 = min * min;
    for (let i = 0; i < samplesForDist.length; i += 1) {
      const p = samplesForDist[i];
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < m2) return false;
    }
    return true;
  }

  const bTexA = buildingTexture(0.42, '#161d2b');
  const bTexB = buildingTexture(0.6, '#202a3a');
  const bMatA = new THREE.MeshStandardMaterial({ map: bTexA, roughness: 0.65, metalness: 0.25, emissive: 0x1a2438, emissiveIntensity: 0.55 });
  const bMatB = new THREE.MeshStandardMaterial({ map: bTexB, roughness: 0.6, metalness: 0.3, emissive: 0x24314a, emissiveIntensity: 0.5 });
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const bCount = 54;
  const buildings = [new THREE.InstancedMesh(bGeo, bMatA, bCount), new THREE.InstancedMesh(bGeo, bMatB, bCount)];
  let bi = [0, 0];
  let placed = 0, guard = 0;
  while (placed < bCount * 2 && guard < 3000) {
    guard++;
    const ang = rand(0, TAU);
    const rad = rand(58, 210);
    const x = centroid.x + Math.cos(ang) * rad * 1.25;
    const z = centroid.z + Math.sin(ang) * rad;
    if (!farFromTrack(x, z, 34)) continue;
    const w = rand(8, 22), d = rand(8, 22), h = rand(14, 76);
    const which = placed % 2;
    dummy.position.set(x, h / 2, z);
    dummy.rotation.set(0, rand(-0.4, 0.4), 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    buildings[which].setMatrixAt(bi[which]++, dummy.matrix);
    placed++;
  }
  buildings.forEach((b, i) => {
    b.count = bi[i];
    b.instanceMatrix.needsUpdate = true;
    b.castShadow = false;
    b.receiveShadow = false;
    group.add(b);
  });

  // 나무
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6a35, roughness: 0.9, flatShading: true });
  const TREES = 150;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, TREES);
  leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TREES * 3), 3);
  leaves.instanceColor.setUsage(THREE.DynamicDrawUsage);
  let ti = 0; guard = 0;
  const cTmp = new THREE.Color();
  while (ti < TREES && guard < 4000) {
    guard++;
    const ang = rand(0, TAU);
    const rad = rand(20, 230);
    const x = centroid.x + Math.cos(ang) * rad * 1.2;
    const z = centroid.z + Math.sin(ang) * rad;
    if (!farFromTrack(x, z, 15)) continue;
    const sc = rand(0.75, 1.55);
    dummy.position.set(x, 1.3 * sc, z);
    dummy.rotation.set(0, rand(0, TAU), 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti, dummy.matrix);
    dummy.position.set(x, 3.0 * sc, z);
    dummy.rotation.set(rand(0, 3), rand(0, TAU), 0);
    dummy.scale.set(sc * rand(0.9, 1.25), sc * rand(1.0, 1.5), sc * rand(0.9, 1.25));
    dummy.updateMatrix();
    leaves.setMatrixAt(ti, dummy.matrix);
    cTmp.setHSL(rand(0.24, 0.34), rand(0.35, 0.6), rand(0.18, 0.32));
    leaves.setColorAt(ti, cTmp);
    ti++;
  }
  trunks.count = ti;
  leaves.count = ti;
  trunks.castShadow = false;
  leaves.castShadow = false;
  group.add(trunks, leaves);

  // 코너 표지판 & 광고판
  const signs = [
    { s: 0.10, txt: 'DRIFT', color: '#ff8b3d' },
    { s: 0.27, txt: 'NITRO', color: '#43e6ff' },
    { s: 0.44, txt: 'TURBO', color: '#b6ff45' },
    { s: 0.62, txt: 'APEX', color: '#ff3d81' },
    { s: 0.80, txt: 'SLIDE', color: '#ffd166' },
  ];
  for (const sg of signs) {
    const p = placeAt(sg.s * length);
    const r = rightOf(p.p);
    const side = rand() < 0.5 ? 1 : -1;
    const bill = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 4.2),
      new THREE.MeshStandardMaterial({
        map: signTexture(sg.txt, sg.color), roughness: 0.5, metalness: 0.2,
        emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide,
      })
    );
    bill.position.set(p.x + r.x * (RAIL_OFF + 5.4) * side, 3.4, p.z + r.z * (RAIL_OFF + 5.4) * side);
    bill.rotation.y = p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    group.add(bill);
    for (const s2 of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 3.4, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x39424f, metalness: 0.5, roughness: 0.5 })
      );
      leg.position.set(
        bill.position.x + Math.cos(bill.rotation.y) * s2 * 3.6,
        1.7,
        bill.position.z - Math.sin(bill.rotation.y) * s2 * 3.6
      );
      group.add(leg);
    }
  }

  // 코너 번호 마커
  for (let i = 0; i < 6; i++) {
    const p = placeAt((i / 6) * length + length * 0.05);
    const r = rightOf(p.p);
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ map: numberTexture(i + 1), side: THREE.DoubleSide, roughness: 0.8 })
    );
    const side = -1;
    marker.position.set(p.x + r.x * (RAIL_OFF + 1.6) * side, 1.3, p.z + r.z * (RAIL_OFF + 1.6) * side);
    marker.rotation.y = p.yaw + Math.PI / 2;
    group.add(marker);
  }

  /* ── 구간 투영(진행도) ────────────────────────────────── */
  function project(x, z, hint = -1) {
    let best = -1, bestD = Infinity, bestT = 0;
    const scan = (i0, i1) => {
      for (let k = i0; k <= i1; k++) {
        const i = idx(k);
        const a = pts[i], b = pts[idx(i + 1)];
        const vx = b.x - a.x, vz = b.z - a.z;
        const wx = x - a.x, wz = z - a.z;
        const len2 = vx * vx + vz * vz || 1;
        let t = (wx * vx + wz * vz) / len2;
        t = clamp(t, 0, 1);
        const px = a.x + vx * t, pz = a.z + vz * t;
        const d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < bestD) { bestD = d; best = i; bestT = t; }
      }
    };
    if (hint >= 0) {
      scan(hint - 45, hint + 55);
      if (bestD > 900) scan(0, N - 1);
    } else {
      scan(0, N - 1);
    }
    const a = pts[best], b = pts[idx(best + 1)];
    const px = a.x + (b.x - a.x) * bestT, pz = a.z + (b.z - a.z) * bestT;
    const rx = a.tz, rz = -a.tx;
    const lat = (x - px) * rx + (z - pz) * rz;
    return {
      index: best,
      s: (best + bestT) * ds,
      lat,
      dist: Math.sqrt(bestD),
      curv: a.curv,
      tx: a.tx, tz: a.tz,
      px, pz,
    };
  }

  const startInfo = placeAt(0, 0);
  const gridInfo = placeAt(length - 9, 0);

  return {
    group, curve, pts, N, ds, length, halfWidth: HALF_WIDTH, railOff: RAIL_OFF,
    project, placeAt, startInfo, gridInfo,
    curvatureAt(s) {
      const i = idx(Math.round((s / ds) % N));
      return pts[i].curv;
    },
    speedLimitAt(s) {
      const i = idx(Math.round((s / ds) % N));
      return Math.abs(pts[i].curv);
    },
    heightAt: () => 0.02,
  };
}

export function makeStartCamera() {
  return { pos: new THREE.Vector3(-20, 12, 220), look: new THREE.Vector3(60, 2, 200) };
}
