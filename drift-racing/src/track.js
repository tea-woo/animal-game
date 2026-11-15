// 코스 생성 — 레이싱 서킷(아스팔트) / 오프로드(흙·자갈) 두 가지 코스를 만든다.
//  · 코스 선택은 buildTrack(scene, 'circuit' | 'offroad') 로 하고, 바꿀 때는 반환된
//    track.dispose() 로 이전 코스의 지오메트리·재질·텍스처를 모두 정리한다.
import THREE from './three.js?v=20261115e';
import { clamp, rand, TAU } from './util.js?v=20261115e';
import {
  asphaltTexture, dirtRoadTexture, dirtGroundTexture, curbTexture, grassTexture,
  buildingTexture, bannerTexture, crowdTexture, signTexture, numberTexture, woodTexture,
} from './textures.js?v=20261115e';

/* ── 코스 정의 ─────────────────────────────────────────── */
export const COURSES = {
  circuit: {
    id: 'circuit',
    label: '레이싱 서킷',
    en: 'CIRCUIT',
    emoji: '🏁',
    desc: '아스팔트 · 연석 · 가드레일',
    tagline: '아스팔트 서킷 · 3랩 · 4대 경쟁',
    halfWidth: 8.4,
    shoulder: 3.2,
    railMargin: 3.4,
    bumpAmp: 0,
    loading: '서킷 준비 중…',
    minimap: {
      bg: 'rgba(10, 17, 28, 0.55)',
      outer: 'rgba(16, 28, 44, 0.95)',
      road: 'rgba(86, 150, 205, 0.55)',
      line: '#dcecff',
      glow: 'rgba(120, 210, 255, 0.85)',
    },
  },
  offroad: {
    id: 'offroad',
    label: '오프로드',
    en: 'OFFROAD',
    emoji: '🏜️',
    desc: '흙·자갈 · 바위 · 나무 울타리',
    tagline: '비포장 오프로드 · 3랩 · 4대 경쟁',
    halfWidth: 9.6,
    shoulder: 2.6,
    railMargin: 4.8,
    bumpAmp: 0.22,
    loading: '오프로드 코스 준비 중…',
    minimap: {
      bg: 'rgba(38, 28, 16, 0.55)',
      outer: 'rgba(64, 46, 26, 0.95)',
      road: 'rgba(196, 154, 92, 0.6)',
      line: '#ffe0b0',
      glow: 'rgba(255, 180, 90, 0.8)',
    },
  },
};

// 좌표: (x, z) 평면. 시작/결승 직선은 +x 방향.
const CONTROL_CIRCUIT = [
  [150, 203], [238, 197], [286, 172], [300, 128],
  [286, 84], [246, 54], [186, 44], [146, 55], [128, 92],
  [130, 130], [117, 158], [88, 163], [77, 136], [82, 100],
  [70, 70], [34, 55], [9, 86], [4, 136], [18, 181], [40, 199], [60, 200],
];

// 오프로드: 긴 직선 + 큰 스윕 두 개 + 완만한 시케인 — 서킷과 완전히 다른 라인
const CONTROL_OFFROAD = [
  [46, 210], [150, 212], [250, 205], [300, 188], [324, 144], [296, 100],
  [248, 90], [196, 96], [160, 112], [120, 98], [70, 88], [20, 102],
  [-8, 148], [14, 196],
];

export function buildTrack(scene, courseId = 'circuit') {
  const spec = COURSES[courseId] || COURSES.circuit;
  const hw = spec.halfWidth;
  const SHOULDER = spec.shoulder;
  const RAIL_OFF = hw + spec.railMargin;

  const control = spec.id === 'offroad' ? CONTROL_OFFROAD : CONTROL_CIRCUIT;
  const curve = new THREE.CatmullRomCurve3(
    control.map(([x, z]) => new THREE.Vector3(x, 0, z)),
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
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    const dx = b.x - a.x, dz = b.z - a.z;
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
  for (let pass = 0; pass < 3; pass++) {
    const tmp = pts.map((p) => p.curv);
    for (let i = 0; i < N; i++) {
      pts[i].curv = (tmp[(i - 1 + N) % N] + tmp[i] * 2 + tmp[(i + 1) % N]) / 4;
    }
  }

  const group = new THREE.Group();
  group.name = `course-${spec.id}`;
  scene.add(group);

  const idx = (i) => (i % N + N) % N;
  const rightOf = (p) => ({ x: p.tz, z: -p.tx });
  const extraTex = [];      // dispose 대상 텍스처
  const trackTex = (t) => { extraTex.push(t); return t; };

  /* ── 노면 높이 (오프로드 굴곡) ────────────────────────── */
  function heightAt(s, lat = 0) {
    if (!spec.bumpAmp) return 0.02;
    const edge = clamp(1 - Math.max(0, Math.abs(lat) - hw) / 7, 0.12, 1);
    const b = Math.sin(s * 0.083 + 0.7) * 0.5
      + Math.sin(s * 0.031 + 2.2) * 0.36
      + Math.sin(s * 0.197 + 0.3) * 0.14;
    return 0.02 + b * spec.bumpAmp * edge;
  }

  /* ── 리본 지오메트리 헬퍼 ─────────────────────────────── */
  function ribbon(offA, offB, dy, vScale, tex, opts = {}) {
    const pos = [], uv = [], nor = [], ind = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i], r = rightOf(p);
      const y = heightAt(p.s, (offA + offB) * 0.5) + dy;
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

  /* ── 지면 ─────────────────────────────────────────────── */
  if (spec.id === 'offroad') {
    const groundMap = trackTex(dirtGroundTexture());
    groundMap.repeat.set(38, 38);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200, 1, 1),
      new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, metalness: 0, color: 0xd8c49c })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(150, -0.02, 150);
    ground.receiveShadow = true;
    group.add(ground);
  } else {
    const grassMap = trackTex(grassTexture());
    grassMap.repeat.set(46, 46);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900, 1, 1),
      new THREE.MeshStandardMaterial({ map: grassMap, roughness: 1, metalness: 0, color: 0xb6c99a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(150, -0.02, 105);
    ground.receiveShadow = true;
    group.add(ground);
  }

  /* ── 노면 ─────────────────────────────────────────────── */
  if (spec.id === 'offroad') {
    const dirt = trackTex(dirtRoadTexture());
    dirt.repeat.set(1, 1);
    const road = ribbon(-hw, hw, 0.03, 1 / 9, dirt, {
      receiveShadow: true,
      material: new THREE.MeshStandardMaterial({ roughness: 0.99, metalness: 0, side: THREE.DoubleSide }),
    });
    road.name = 'road';

    // 바깥으로 풀리는 흙 어깨
    const soil = new THREE.MeshStandardMaterial({ color: 0x8a6c46, roughness: 1, side: THREE.DoubleSide });
    ribbon(hw - 0.4, hw + SHOULDER, 0.015, 0.18, null, { material: soil });
    ribbon(-hw - SHOULDER, -hw + 0.4, 0.015, 0.18, null, { material: soil });

    // 노면 가장자리의 옅은 모래 띠 (코스 형태를 또렷하게)
    const sand = new THREE.MeshStandardMaterial({
      color: 0xc7ac7d, roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    ribbon(hw - 1.0, hw - 0.15, 0.036, 0.2, null, { material: sand });
    ribbon(-hw + 0.15, -hw + 1.0, 0.036, 0.2, null, { material: sand });
  } else {
    const asphalt = trackTex(asphaltTexture());
    asphalt.repeat.set(1, 1);
    const road = ribbon(-hw, hw, 0.02, 1 / 9, asphalt, { receiveShadow: true });
    road.name = 'road';

    // 어깨(콘크리트)
    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x6f7681, roughness: 0.95 });
    ribbon(hw, hw + SHOULDER, 0.015, 0.2, null, { material: shoulderMat });
    ribbon(-hw - SHOULDER, -hw, 0.015, 0.2, null, { material: shoulderMat });

    // 연석
    const curb = trackTex(curbTexture());
    curb.repeat.set(1, 1);
    ribbon(hw - 0.1, hw + 1.25, 0.045, 1 / 4.4, curb);
    ribbon(-hw - 1.25, -hw + 0.1, 0.045, 1 / 4.4, curb);

    // 흰색 경계선
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xeef3fb, roughness: 0.6 });
    ribbon(-hw + 0.45, -hw + 0.85, 0.035, 0.2, null, { material: lineMat });
    ribbon(hw - 0.85, hw - 0.45, 0.035, 0.2, null, { material: lineMat });
  }

  /* ── 배리어 (서킷: 금속 가드레일 / 오프로드: 나무 울타리 + 타이어·건초) ── */
  function verticalBand(off, y0, y1, mat, uvScale = 0.2) {
    const pos = [], nor = [], ind = [], uv = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i], r = rightOf(p);
      const x = p.x + r.x * off, z = p.z + r.z * off;
      const yb = heightAt(p.s, off);
      pos.push(x, y0 + yb, z, x, y1 + yb, z);
      uv.push(p.s * uvScale, 0, p.s * uvScale, 1);
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
    const m = new THREE.Mesh(g, mat);
    group.add(m);
    return m;
  }

  const dummy = new THREE.Object3D();

  if (spec.id === 'offroad') {
    // 나무 울타리 — 두 단의 가로대 + 기둥
    const woodTex = trackTex(woodTexture());
    woodTex.repeat.set(1, 1);
    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex, color: 0xcfae84, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    });
    verticalBand(RAIL_OFF, 0.52, 0.74, woodMat, 0.35);
    verticalBand(RAIL_OFF, 0.98, 1.2, woodMat, 0.35);
    verticalBand(-RAIL_OFF, 0.52, 0.74, woodMat, 0.35);
    verticalBand(-RAIL_OFF, 0.98, 1.2, woodMat, 0.35);

    const postCount = Math.floor(N / 2.4);
    const postGeo = new THREE.CylinderGeometry(0.13, 0.15, 1.5, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a6c4a, roughness: 0.95 });
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount * 2);
    let pi = 0;
    for (let k = 0; k < postCount; k++) {
      const p = pts[Math.floor((k * N) / postCount)];
      const r = rightOf(p);
      for (const side of [1, -1]) {
        const off = RAIL_OFF * side;
        dummy.position.set(p.x + r.x * off, 0.72 + heightAt(p.s, off), p.z + r.z * off);
        dummy.rotation.set(0, Math.atan2(p.tx, p.tz), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.setMatrixAt(pi++, dummy.matrix);
      }
    }
    posts.count = pi;
    posts.castShadow = false;
    group.add(posts);

    // 울타리 밖 흙 둑
    const bermMat = new THREE.MeshStandardMaterial({ color: 0x7d6140, roughness: 1, side: THREE.DoubleSide });
    ribbon(RAIL_OFF + 1.2, RAIL_OFF + 3.6, 0.55, 0.2, null, { material: bermMat });
    ribbon(-RAIL_OFF - 3.6, -RAIL_OFF - 1.2, 0.55, 0.2, null, { material: bermMat });

    // 타이어 스택 · 건초 더미 (코너마다)
    const tyreGeo = new THREE.TorusGeometry(0.42, 0.16, 6, 12);
    tyreGeo.rotateX(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.95 });
    const tyreCount = 16;
    const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, tyreCount * 3);
    let tIdx = 0;
    const hayGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.1, 10);
    hayGeo.rotateZ(Math.PI / 2);
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xcfae63, roughness: 0.95 });
    const hay = new THREE.InstancedMesh(hayGeo, hayMat, 26);
    let hIdx = 0;
    for (let k = 0; k < tyreCount; k++) {
      const s = (k / tyreCount) * length + 11;
      const p = placeAt(s);
      const r = rightOf(p.p);
      const side = k % 2 === 0 ? 1 : -1;
      const cx = p.x + r.x * (RAIL_OFF - 1.1) * side;
      const cz = p.z + r.z * (RAIL_OFF - 1.1) * side;
      const base = heightAt(s, (RAIL_OFF - 1.1) * side);
      for (let lv = 0; lv < 3; lv++) {
        dummy.position.set(cx, base + 0.17 + lv * 0.3, cz);
        dummy.rotation.set(0, rand(0, TAU), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tyres.setMatrixAt(tIdx++, dummy.matrix);
      }
      if (hIdx < 26) {
        const hs = (s + 6.2) % length;
        const hp = placeAt(hs);
        const hr = rightOf(hp.p);
        const off = (RAIL_OFF + 1.9) * (k % 2 === 0 ? -1 : 1);
        dummy.position.set(hp.x + hr.x * off, 0.62, hp.z + hr.z * off);
        dummy.rotation.set(0, hp.yaw + rand(-0.4, 0.4), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        hay.setMatrixAt(hIdx++, dummy.matrix);
      }
    }
    tyres.count = tIdx;
    hay.count = hIdx;
    group.add(tyres, hay);
  } else {
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc2ccd8, roughness: 0.34, metalness: 0.9, side: THREE.DoubleSide,
    });
    verticalBand(RAIL_OFF, 0.52, 1.0, railMat);
    verticalBand(-RAIL_OFF, 0.52, 1.0, railMat);

    const postCount = Math.floor(N / 3.2);
    const postGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7d8794, roughness: 0.5, metalness: 0.6 });
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount * 2);
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
  }

  /* ── 스타트/결승 체커 라인 & 아치 ────────────────────── */
  function placeAt(s, laneOff = 0, y = 0) {
    const i = Math.floor((s / ds) % N);
    const p = pts[idx(i)];
    const r = rightOf(p);
    return { x: p.x + r.x * laneOff, z: p.z + r.z * laneOff, y, yaw: Math.atan2(p.tx, p.tz), p };
  }

  const checker = trackTex((() => {
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
  })());
  {
    const p = placeAt(6);
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 2.2),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.75 })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -p.yaw;
    strip.position.set(p.x, heightAt(6) + 0.045, p.z);
    group.add(strip);
  }

  // 스타트 아치
  {
    const p = placeAt(0);
    const arch = new THREE.Group();
    arch.position.set(p.x, heightAt(0), p.z);
    arch.rotation.y = p.yaw;
    const offroad = spec.id === 'offroad';
    const pillarMat = offroad
      ? new THREE.MeshStandardMaterial({ map: (() => { const t = trackTex(woodTexture()); return t; })(), color: 0xd8b78c, roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ color: 0x27303f, roughness: 0.45, metalness: 0.4 });
    const span = hw + 2.2;
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
      map: trackTex(bannerTexture(
        offroad ? 'R A L L Y   ·   O F F R O A D' : 'C I R C U I T   ·   G P',
        offroad ? '#ffd166' : '#43e6ff'
      )),
      roughness: 0.6, metalness: 0.1,
      emissive: 0x1a2634, emissiveIntensity: 0.2,
    });
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
      new THREE.MeshBasicMaterial({ color: offroad ? 0xffb347 : 0x43e6ff })
    );
    glow.position.set(0, 4.62, 0.35);
    arch.add(glow);
    group.add(arch);
  }

  /* ── 풍경 ─────────────────────────────────────────────── */
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

  const cTmp = new THREE.Color();

  if (spec.id === 'offroad') {
    /* 바위 */
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    {
      const pos = rockGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.78 + Math.random() * 0.44;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
      }
      rockGeo.computeVertexNormals();
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9d917f, roughness: 0.95, flatShading: true });
    const ROCK_N = 110;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_N);
    let ri = 0, guard = 0;
    while (ri < ROCK_N && guard < 5000) {
      guard++;
      const ang = rand(0, TAU);
      const rad = rand(28, 240);
      const x = centroid.x + Math.cos(ang) * rad * 1.15;
      const z = centroid.z + Math.sin(ang) * rad;
      if (!farFromTrack(x, z, RAIL_OFF + 9)) continue;
      const sc = rand(0.6, 3.2);
      dummy.position.set(x, sc * 0.45, z);
      dummy.rotation.set(rand(-0.2, 0.2), rand(0, TAU), rand(-0.2, 0.2));
      dummy.scale.set(sc * rand(0.9, 1.5), sc * rand(0.6, 1.1), sc * rand(0.9, 1.5));
      dummy.updateMatrix();
      rocks.setMatrixAt(ri++, dummy.matrix);
    }
    rocks.count = ri;
    rocks.castShadow = false;
    group.add(rocks);

    /* 소나무 (기둥 + 3단 잎) */
    const PINE_N = 90;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 0.95 });
    const pTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, PINE_N);
    const coneGeo = new THREE.ConeGeometry(1.7, 2.6, 7);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5b32, roughness: 0.85, flatShading: true });
    const tiers = [new THREE.InstancedMesh(coneGeo, leafMat, PINE_N),
      new THREE.InstancedMesh(coneGeo, leafMat, PINE_N),
      new THREE.InstancedMesh(coneGeo, leafMat, PINE_N)];
    let pin = 0; guard = 0;
    while (pin < PINE_N && guard < 4000) {
      guard++;
      const ang = rand(0, TAU);
      const rad = rand(24, 230);
      const x = centroid.x + Math.cos(ang) * rad * 1.15;
      const z = centroid.z + Math.sin(ang) * rad;
      if (!farFromTrack(x, z, RAIL_OFF + 7)) continue;
      const sc = rand(0.8, 1.7);
      dummy.position.set(x, 1.6 * sc, z);
      dummy.rotation.set(0, rand(0, TAU), 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      pTrunks.setMatrixAt(pin, dummy.matrix);
      for (let ti = 0; ti < 3; ti++) {
        dummy.position.set(x, (2.6 + ti * 1.05) * sc, z);
        dummy.rotation.set(0, rand(0, TAU), 0);
        dummy.scale.set(sc * (1 - ti * 0.2), sc * (1 - ti * 0.12), sc * (1 - ti * 0.2));
        dummy.updateMatrix();
        tiers[ti].setMatrixAt(pin, dummy.matrix);
      }
      pin++;
    }
    pTrunks.count = pin;
    tiers.forEach((t) => { t.count = pin; t.castShadow = false; });
    group.add(pTrunks, ...tiers);

    /* 선인장 */
    const CAC_N = 26;
    const cacGeo = new THREE.CylinderGeometry(0.26, 0.32, 3.0, 8);
    const cacMat = new THREE.MeshStandardMaterial({ color: 0x4f7a43, roughness: 0.85 });
    const cacti = new THREE.InstancedMesh(cacGeo, cacMat, CAC_N);
    const armGeo = new THREE.CylinderGeometry(0.15, 0.17, 1.1, 6);
    const arms = new THREE.InstancedMesh(armGeo, cacMat, CAC_N * 2);
    let ci = 0, ai = 0; guard = 0;
    while (ci < CAC_N && guard < 3000) {
      guard++;
      const ang = rand(0, TAU);
      const rad = rand(30, 220);
      const x = centroid.x + Math.cos(ang) * rad * 1.15;
      const z = centroid.z + Math.sin(ang) * rad;
      if (!farFromTrack(x, z, RAIL_OFF + 8)) continue;
      const sc = rand(0.7, 1.5);
      dummy.position.set(x, 1.5 * sc, z);
      dummy.rotation.set(0, rand(0, TAU), 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      cacti.setMatrixAt(ci, dummy.matrix);
      for (const side of [-1, 1]) {
        dummy.position.set(x + side * 0.5 * sc, (1.5 + 0.2) * sc, z);
        dummy.rotation.set(0, 0, side * 0.9);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        arms.setMatrixAt(ai++, dummy.matrix);
      }
      ci++;
    }
    cacti.count = ci;
    arms.count = ai;
    group.add(cacti, arms);

    /* 덤불 + 마른 풀 */
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x8a8547, roughness: 0.95, flatShading: true });
    const BUSH_N = 220;
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, BUSH_N);
    let bi2 = 0; guard = 0;
    while (bi2 < BUSH_N && guard < 6000) {
      guard++;
      const ang = rand(0, TAU);
      const rad = rand(16, 250);
      const x = centroid.x + Math.cos(ang) * rad * 1.2;
      const z = centroid.z + Math.sin(ang) * rad;
      if (!farFromTrack(x, z, RAIL_OFF + 2.5)) continue;
      const sc = rand(0.5, 1.5);
      dummy.position.set(x, sc * 0.45, z);
      dummy.rotation.set(0, rand(0, TAU), 0);
      dummy.scale.set(sc * rand(0.9, 1.4), sc * rand(0.6, 1.0), sc * rand(0.9, 1.4));
      dummy.updateMatrix();
      bushes.setMatrixAt(bi2, dummy.matrix);
      cTmp.setHSL(rand(0.10, 0.17), rand(0.22, 0.4), rand(0.24, 0.42));
      bushes.setColorAt(bi2, cTmp);
      bi2++;
    }
    bushes.count = bi2;
    group.add(bushes);

    /* 먼 지평선의 메사(바위 언덕) */
    const mesaGeo = new THREE.CylinderGeometry(26, 44, 26, 7);
    const mesaMat = new THREE.MeshStandardMaterial({ color: 0xa88f6c, roughness: 1, flatShading: true });
    const mesas = new THREE.InstancedMesh(mesaGeo, mesaMat, 9);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * TAU + rand(-0.16, 0.16);
      const rad = rand(300, 390);
      const x = centroid.x + Math.cos(ang) * rad;
      const z = centroid.z + Math.sin(ang) * rad;
      dummy.position.set(x, rand(6, 13), z);
      dummy.rotation.set(0, rand(0, TAU), 0);
      dummy.scale.set(rand(0.8, 1.9), rand(0.5, 1.4), rand(0.8, 1.9));
      dummy.updateMatrix();
      mesas.setMatrixAt(i, dummy.matrix);
    }
    group.add(mesas);
  } else {
    /* 관중석 (시작 직선 바깥) */
    {
      const p0 = placeAt(30);
      const r = rightOf(p0.p);
      const stand = new THREE.Group();
      const len = 62;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(len, 5.6, 12),
        new THREE.MeshStandardMaterial({ color: 0x39434f, roughness: 0.9 })
      );
      base.position.set(0, 2.8, 0);
      stand.add(base);
      const crowdTex = trackTex(crowdTexture());
      crowdTex.repeat.set(6, 2);
      const crowd = new THREE.Mesh(
        new THREE.PlaneGeometry(len, 6.4),
        new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 })
      );
      crowd.position.set(0, 3.4, -5.9);
      crowd.rotation.y = Math.PI;
      stand.add(crowd);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(len + 3, 0.4, 13),
        new THREE.MeshStandardMaterial({ color: 0x9fb3c6, roughness: 0.5, metalness: 0.4 })
      );
      roof.position.set(0, 7.2, 0);
      roof.rotation.x = 0.08;
      stand.add(roof);
      for (const s of [-1, 1]) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 7, 8),
          new THREE.MeshStandardMaterial({ color: 0x8c98a8, metalness: 0.5, roughness: 0.45 })
        );
        col.position.set((len / 2 - 2) * s, 3.5, 5.4);
        stand.add(col);
      }
      stand.position.set(p0.x + r.x * 20, 0, p0.z + r.z * 20);
      stand.rotation.y = p0.yaw + Math.PI / 2;
      group.add(stand);
    }

    /* 도시 빌딩 — 낮의 콘크리트·유리 */
    const bTexA = trackTex(buildingTexture(0.06, '#9aa3ab'));
    const bTexB = trackTex(buildingTexture(0.1, '#b3b8bd'));
    const bMatA = new THREE.MeshStandardMaterial({ map: bTexA, color: 0xc2c9d0, roughness: 0.72, metalness: 0.14 });
    const bMatB = new THREE.MeshStandardMaterial({ map: bTexB, color: 0xcbd0d4, roughness: 0.66, metalness: 0.2 });
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    const bCount = 58;
    const buildings = [new THREE.InstancedMesh(bGeo, bMatA, bCount), new THREE.InstancedMesh(bGeo, bMatB, bCount)];
    const bi = [0, 0];
    let placed = 0;
    let guard = 0;
    while (placed < bCount * 2 && guard < 3000) {
      guard++;
      const ang = rand(0, TAU);
      const rad = rand(58, 215);
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

    /* 나무 */
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6);
    const leafGeo = new THREE.IcosahedronGeometry(1.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x54402c, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d7c3f, roughness: 0.9, flatShading: true });
    const TREES = 150;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, TREES);
    leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TREES * 3), 3);
    leaves.instanceColor.setUsage(THREE.DynamicDrawUsage);
    let ti = 0;
    guard = 0;
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
      cTmp.setHSL(rand(0.24, 0.33), rand(0.35, 0.6), rand(0.22, 0.36));
      leaves.setColorAt(ti, cTmp);
      ti++;
    }
    trunks.count = ti;
    leaves.count = ti;
    trunks.castShadow = false;
    leaves.castShadow = false;
    group.add(trunks, leaves);
  }

  /* ── 표지판 · 코너 마커 ───────────────────────────────── */
  const signs = spec.id === 'offroad'
    ? [
      { s: 0.08, txt: 'DIRT', color: '#ffd166' },
      { s: 0.26, txt: 'GRAVEL', color: '#ffb347' },
      { s: 0.45, txt: 'RALLY', color: '#ff8b3d' },
      { s: 0.66, txt: 'DUST', color: '#ffd166' },
      { s: 0.84, txt: 'HAIRPIN', color: '#ff8b3d' },
    ]
    : [
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
        map: trackTex(signTexture(sg.txt, sg.color)), roughness: 0.6, metalness: 0.1,
        emissive: 0xffffff, emissiveIntensity: 0.08, side: THREE.DoubleSide,
      })
    );
    bill.position.set(p.x + r.x * (RAIL_OFF + 5.4) * side, 3.4, p.z + r.z * (RAIL_OFF + 5.4) * side);
    bill.rotation.y = p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    group.add(bill);
    for (const s2 of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 3.4, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x4d5763, metalness: 0.4, roughness: 0.55 })
      );
      leg.position.set(
        bill.position.x + Math.cos(bill.rotation.y) * s2 * 3.6,
        1.7,
        bill.position.z - Math.sin(bill.rotation.y) * s2 * 3.6
      );
      group.add(leg);
    }
  }

  for (let i = 0; i < 6; i++) {
    const p = placeAt((i / 6) * length + length * 0.05);
    const r = rightOf(p.p);
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ map: trackTex(numberTexture(i + 1)), side: THREE.DoubleSide, roughness: 0.8 })
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
    group, curve, pts, N, ds, length,
    courseId: spec.id,
    spec,
    meta: spec,
    halfWidth: hw,
    railOff: RAIL_OFF,
    project, placeAt, startInfo, gridInfo, heightAt,
    curvatureAt(s) {
      const i = idx(Math.round((s / ds) % N));
      return pts[i].curv;
    },
    speedLimitAt(s) {
      const i = idx(Math.round((s / ds) % N));
      return Math.abs(pts[i].curv);
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        mats.forEach((m) => {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) v.dispose();
          }
          m.dispose();
        });
      });
      extraTex.forEach((t) => t.dispose());
      extraTex.length = 0;
    },
  };
}

export function makeStartCamera() {
  return { pos: new THREE.Vector3(-20, 12, 220), look: new THREE.Vector3(60, 2, 200) };
}
