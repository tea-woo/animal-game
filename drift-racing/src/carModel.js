// 절차적 3D 차량 모델 — 로프트 차체, 유리 캐빈, 조향·회전 바퀴, 라이트
import THREE from './three.js?v=20261115a';

export const CARS = [
  {
    id: 'gt', name: 'GT-01 AERO', role: '밸런스 스포츠카', color: 0x2f7cff, ui: '#43e6ff',
    maxSpeed: 56, accel: 15.5, grip: 1.0, driftGrip: 1.0, steer: 1.0, hp: 1.0,
    stats: { 속도: 0.74, 가속: 0.8, 드리프트: 0.66 }, spoiler: 'small',
  },
  {
    id: 'slide', name: 'SLIDE-R', role: '드리프트 특화 쿠페', color: 0xff6a2a, ui: '#ff8b3d',
    maxSpeed: 52, accel: 14.2, grip: 0.92, driftGrip: 1.26, steer: 1.08, hp: 0.95,
    stats: { 속도: 0.64, 가속: 0.74, 드리프트: 0.97 }, spoiler: 'big',
  },
  {
    id: 'vx', name: 'VX-9 FURY', role: '최고속 하이퍼카', color: 0xb9f542, ui: '#b6ff45',
    maxSpeed: 64, accel: 13.2, grip: 0.88, driftGrip: 0.9, steer: 0.94, hp: 0.88,
    stats: { 속도: 0.96, 가속: 0.62, 드리프트: 0.55 }, spoiler: 'wing',
  },
];

function sectionRing(halfW, halfH, cy, round, segs = 16) {
  // 둥근 사각형 단면: (x, y) 16점
  const pts = [];
  const r = Math.min(halfW, halfH) * round;
  const corners = [
    [halfW - r, cy + halfH - r, 0],
    [-(halfW - r), cy + halfH - r, Math.PI / 2],
    [-(halfW - r), cy - halfH + r, Math.PI],
    [halfW - r, cy - halfH + r, Math.PI * 1.5],
  ];
  const per = segs / 4;
  for (let i = 0; i < 4; i++) {
    const [cx, cyy, a0] = corners[i];
    for (let k = 0; k < per; k++) {
      const a = a0 + (k / per) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r * (i === 0 || i === 3 ? 1 : 1), cyy + Math.sin(a) * r]);
    }
  }
  return pts;
}

function loftGeometry(sections, round = 0.4, segs = 16) {
  const rings = sections.map((s) => ({ z: s.z, ring: sectionRing(s.w, s.h, s.cy, round, segs) }));
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
  // 앞·뒤 캡
  const first = rings[0], last = rings[rings.length - 1];
  const firstCenter = pos.length / 3;
  pos.push(0, first.ring.reduce((s, p) => s + p[1], 0) / n, first.z);
  const lastCenter = pos.length / 3;
  pos.push(0, last.ring.reduce((s, p) => s + p[1], 0) / n, last.z);
  for (let k = 0; k < n; k++) {
    idx.push(firstCenter, k, (k + 1) % n);
    const base = (rings.length - 1) * n;
    idx.push(lastCenter, base + ((k + 1) % n), base + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wheel(radius = 0.37, width = 0.30) {
  const g = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 22, 1);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(
    tireGeo,
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92, metalness: 0.05 })
  );
  tire.castShadow = true;
  g.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width * 1.02, 18, 1);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(
    rimGeo,
    new THREE.MeshStandardMaterial({ color: 0xcdd6e4, roughness: 0.28, metalness: 0.95 })
  );
  g.add(rim);

  // 스포크
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x9aa7ba, roughness: 0.32, metalness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, radius * 0.1, radius * 1.16), spokeMat);
    sp.rotation.x = (i / 5) * Math.PI;
    g.add(sp);
  }
  // 허브
  const hubGeo = new THREE.CylinderGeometry(radius * 0.19, radius * 0.19, width * 1.1, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, new THREE.MeshStandardMaterial({ color: 0xff8b3d, metalness: 0.8, roughness: 0.3, emissive: 0x552000, emissiveIntensity: 0.4 }));
  g.add(hub);

  return g;
}

export function buildCar(spec) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshStandardMaterial({
    color: spec.color, roughness: 0.24, metalness: 0.62,
    envMapIntensity: 1.15,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.55, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1b3048, roughness: 0.06, metalness: 0.6,
    transparent: true, opacity: 0.93, envMapIntensity: 2.0,
  });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd6deea, roughness: 0.18, metalness: 1.0 });

  const long = spec.id === 'vx' ? 1.06 : spec.id === 'slide' ? 0.98 : 1.0;
  const L = (v) => v * long;

  const hull = new THREE.Mesh(loftGeometry([
    { z: L(-2.18), w: 0.74, h: 0.26, cy: 0.60 },
    { z: L(-1.92), w: 0.94, h: 0.38, cy: 0.58 },
    { z: L(-1.25), w: 1.00, h: 0.46, cy: 0.58 },
    { z: L(-0.35), w: 1.02, h: 0.50, cy: 0.60 },
    { z: L(0.55), w: 0.99, h: 0.45, cy: 0.61 },
    { z: L(1.40), w: 0.91, h: 0.33, cy: 0.60 },
    { z: L(1.98), w: 0.78, h: 0.23, cy: 0.58 },
    { z: L(2.22), w: 0.52, h: 0.14, cy: 0.56 },
  ], 0.5, 16), paint);
  hull.castShadow = true;
  hull.receiveShadow = true;
  body.add(hull);

  // 캐빈(유리)
  const cabin = new THREE.Mesh(loftGeometry([
    { z: L(0.86), w: 0.62, h: 0.012, cy: 0.92 },
    { z: L(0.36), w: 0.73, h: 0.17, cy: 0.95 },
    { z: L(-0.45), w: 0.75, h: 0.20, cy: 0.96 },
    { z: L(-1.0), w: 0.67, h: 0.13, cy: 0.94 },
    { z: L(-1.26), w: 0.5, h: 0.012, cy: 0.9 },
  ], 0.55, 16), glass);
  cabin.castShadow = true;
  body.add(cabin);

  // 지붕(차체 색) — 캐빈 상단을 덮는 낮은 판
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 0.045, 0.78),
    paint
  );
  roof.position.set(0, 1.145, L(-0.38));
  roof.scale.x = spec.id === 'slide' ? 0.98 : 1.0;
  body.add(roof);

  // 보닛 인테이크 / 스플리터 / 디퓨저
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.07, 0.5), dark);
  splitter.position.set(0, 0.29, L(2.02));
  body.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.45), dark);
  diffuser.position.set(0, 0.33, L(-2.05));
  body.add(diffuser);
  const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 2.5), dark);
  skirtL.position.set(-1.0, 0.3, 0);
  const skirtR = skirtL.clone();
  skirtR.position.x = 1.0;
  body.add(skirtL, skirtR);

  // 스포일러
  const spoilerGroup = new THREE.Group();
  const wingW = spec.spoiler === 'wing' ? 1.95 : 1.72;
  const wingH = spec.spoiler === 'big' ? 0.10 : 0.07;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, 0.46), paint);
  wing.position.set(0, spec.spoiler === 'wing' ? 1.16 : 1.02, L(-2.02));
  wing.rotation.x = -0.12;
  spoilerGroup.add(wing);
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.2), dark);
    strut.position.set(s * wingW * 0.36, spec.spoiler === 'wing' ? 0.98 : 0.85, L(-2.02));
    spoilerGroup.add(strut);
  }
  if (spec.spoiler === 'wing') {
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.62), dark);
      plate.position.set(s * wingW * 0.5, 1.16, L(-2.02));
      spoilerGroup.add(plate);
    }
  }
  body.add(spoilerGroup);

  // 헤드라이트
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xf2fbff, emissive: 0xbfe9ff, emissiveIntensity: 2.4, roughness: 0.2,
  });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.1), headMat);
    hl.position.set(s * 0.55, 0.66, L(2.18));
    hl.rotation.y = s * 0.12;
    body.add(hl);
  }
  // 테일라이트
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2b3d, emissive: 0xff1428, emissiveIntensity: 1.6, roughness: 0.3,
  });
  const tails = [];
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.1), tailMat.clone());
    tl.position.set(s * 0.5, 0.68, L(-2.19));
    body.add(tl);
    tails.push(tl);
  }
  // 배기구
  for (const s of [-0.42, 0.42]) {
    const pipeGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.22, 10);
    pipeGeo.rotateX(Math.PI / 2);
    const pipe = new THREE.Mesh(pipeGeo, chrome);
    pipe.position.set(s, 0.4, L(-2.2));
    body.add(pipe);
  }

  // 바퀴
  const wheels = [];
  const wheelR = 0.37;
  const positions = [
    [-0.93, L(1.40), true], [0.93, L(1.40), true],
    [-0.95, L(-1.42), false], [0.95, L(-1.42), false],
  ];
  for (const [x, z, front] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelR, z);
    const spin = new THREE.Group();
    const w = wheel(wheelR, front ? 0.28 : 0.33);
    spin.add(w);
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  // 차체 아래 네온
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 3.6),
    new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  neon.rotation.x = -Math.PI / 2;
  neon.position.y = 0.02;
  root.add(neon);

  root.userData = { wheels, tails, neon, headMat, tailMat, paint };
  return root;
}

export function updateCarVisual(car, dt) {
  const u = car.model.userData;
  const spinRate = car.speed / 0.37;
  for (const w of u.wheels) {
    w.spin.rotation.x -= spinRate * dt;
    if (w.front) w.pivot.rotation.y = car.steerVisual * 0.42;
  }
  // 바퀴 회전 시 스포크가 x축 기준 회전하므로 그대로 둔다
  const braking = car.brake > 0.3;
  for (const t of u.tails) {
    t.material.emissiveIntensity = braking ? 4.5 : 1.5;
  }
  u.neon.material.opacity = 0.16 + Math.min(0.3, car.speed / car.maxSpeed * 0.3);
}
