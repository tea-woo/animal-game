// 동물 모델 — 관절형(articulated) 절차적 3D 모델과 종별 설정
import THREE from './three.js';
import { ellipsoid, sphere, capsuleY, capsuleZ, box, cone, cylinder, group, palette } from './builders.js';
import { lerp } from './util.js';

const TAU = Math.PI * 2;

// ── 다리 (어깨/허벅지 → 무릎 → 발목 → 발) ───────────────────
function makeLeg(parent, o) {
  const hip = group(o.x, o.y, o.z);
  parent.add(hip);

  const U = o.upper;
  const L = o.lower;
  const P = o.pastern;

  // 어깨/허벅지 근육
  const shoulder = ellipsoid(o.rTop * 1.5, o.rTop * 1.85, o.rTop * 1.6, o.color);
  shoulder.position.y = -o.rTop * 0.1;
  hip.add(shoulder);

  const up = capsuleY(o.rTop * 0.92, Math.max(0.02, U - o.rTop * 1.6), o.color, { seg: 10 });
  up.position.y = -U * 0.5;
  hip.add(up);

  const knee = group(0, -U, 0);
  hip.add(knee);
  knee.add(sphere(o.rMid * 1.12, o.color, { seg: 10 }));

  const low = capsuleY(o.rMid, Math.max(0.02, L - o.rMid * 1.8), o.colorLight ?? o.color, { seg: 10 });
  low.position.y = -L * 0.5;
  knee.add(low);

  const ankle = group(0, -L, 0);
  knee.add(ankle);
  ankle.add(sphere(o.rBot * 1.06, o.colorLight ?? o.color, { seg: 8 }));

  // 발목뼈
  const pastern = capsuleY(o.rBot * 0.9, Math.max(0.02, P - o.rBot * 1.6), o.pawColor ?? o.color, { seg: 8 });
  pastern.position.y = -P * 0.5;
  ankle.add(pastern);

  const paw = group(0, -P, 0);
  ankle.add(paw);

  const pawMesh = ellipsoid(o.rBot * 1.45, o.pawHalf, o.pawLen, o.pawColor ?? o.color);
  pawMesh.position.set(0, -o.pawHalf * 0.55, o.pawLen * 0.2);
  paw.add(pawMesh);

  // 발가락 / 발톱
  for (let i = -1; i <= 1; i++) {
    const toe = ellipsoid(o.rBot * 0.42, o.pawHalf * 0.75, o.rBot * 0.5, o.pawColor ?? o.colorLight ?? o.color);
    toe.position.set(i * o.rBot * 0.62, -o.pawHalf * 0.7, o.pawLen * 0.9);
    paw.add(toe);
    if (o.claws) {
      const claw = cone(o.pawHalf * 0.32, o.pawHalf * 1.1, 0xe6dcc4, { seg: 5 });
      claw.position.set(i * o.rBot * 0.62, -o.pawHalf * 0.8, o.pawLen * 1.12);
      claw.rotation.x = Math.PI * 0.62;
      paw.add(claw);
    }
  }

  return {
    hip,
    knee,
    ankle,
    paw,
    sign: o.front ? 1 : -1,
    front: !!o.front,
    baseHip: o.front ? 0.05 : -0.06,
    baseKnee: o.front ? 0.14 : -0.18,
    baseAnkle: o.front ? -0.12 : 0.16,
  };
}

// ── 머리 ───────────────────────────────────────────────────
function makeHead(neck, o) {
  const head = group(0, o.headY, o.headZ);
  neck.add(head);

  const R = o.headR;
  const skull = ellipsoid(R, R * 0.92, R * 1.02, o.fur);
  head.add(skull);

  // 이마 / 광대
  const forehead = ellipsoid(R * 0.78, R * 0.34, R * 0.52, o.fur);
  forehead.position.set(0, R * 0.4, R * 0.36);
  head.add(forehead);
  for (const s of [-1, 1]) {
    const cheek = ellipsoid(R * 0.44, R * 0.36, R * 0.4, o.fur);
    cheek.position.set(s * R * 0.62, -R * 0.16, R * 0.26);
    head.add(cheek);
  }

  // 주둥이
  const M = o.muzzleR;
  const L = o.muzzleLen;
  const muzzle = ellipsoid(M, M * 0.82, L, o.furLight);
  muzzle.position.set(0, -R * 0.18, R * 0.72 + L * 0.55);
  head.add(muzzle);
  const bridge = ellipsoid(M * 0.62, M * 0.62, L * 0.95, o.fur);
  bridge.position.set(0, R * 0.02, R * 0.66 + L * 0.5);
  head.add(bridge);

  // 코
  const nose = ellipsoid(M * 0.56, M * 0.4, M * 0.34, o.nose);
  nose.position.set(0, -R * 0.12, R * 0.72 + L * 1.02);
  head.add(nose);
  for (const s of [-1, 1]) {
    const n = sphere(M * 0.14, 0x0b0808, { seg: 6 });
    n.position.set(s * M * 0.22, -R * 0.1, R * 0.72 + L * 1.1);
    head.add(n);
  }
  // 수염 자국
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const dot = sphere(M * 0.07, 0x2a1c12, { seg: 5 });
      dot.position.set(s * M * 0.5, -R * 0.2 + i * R * 0.04, R * 0.72 + L * (0.55 + i * 0.1));
      head.add(dot);
    }
  }

  // 눈 (흰자 + 홍채 + 동공 + 반사광)
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = group(s * R * 0.46, R * 0.16, R * 0.76);
    eye.rotation.y = s * 0.42;
    head.add(eye);
    eyes.push(eye);

    const sclera = ellipsoid(R * 0.19, R * 0.17, R * 0.12, 0xf3e4c2, { seg: 12, roughness: 0.4 });
    eye.add(sclera);
    const iris = ellipsoid(R * 0.125, R * 0.125, R * 0.06, o.iris ?? 0xb87716, { roughness: 0.35 });
    iris.position.z = R * 0.09;
    eye.add(iris);
    const pupil = ellipsoid(R * 0.055, R * 0.09, R * 0.03, 0x0a0806, { roughness: 0.2 });
    pupil.position.z = R * 0.13;
    eye.add(pupil);
    const glint = sphere(R * 0.035, 0xffffff, { seg: 6, roughness: 0.1 });
    glint.position.set(-s * R * 0.03, R * 0.03, R * 0.15);
    eye.add(glint);

    // 눈꺼풀 / 눈두덩
    const lid = ellipsoid(R * 0.23, R * 0.1, R * 0.16, o.fur);
    lid.position.set(s * R * 0.47, R * 0.28, R * 0.72);
    lid.rotation.z = s * -0.12;
    head.add(lid);
    // 눈썹
    const brow = ellipsoid(R * 0.22, R * 0.07, R * 0.15, o.furDark ?? o.fur);
    brow.position.set(s * R * 0.44, R * 0.36, R * 0.7);
    brow.rotation.z = s * 0.24;
    head.add(brow);
  }

  // 턱 (움직임)
  const jaw = group(0, -R * 0.34, R * 0.18);
  head.add(jaw);
  const jawMesh = ellipsoid(M * 0.92, M * 0.42, L * 0.96, o.furLight);
  jawMesh.position.set(0, -M * 0.1, L * 0.55);
  jaw.add(jawMesh);
  const chin = ellipsoid(M * 0.4, M * 0.24, M * 0.3, o.fur);
  chin.position.set(0, -M * 0.28, L * 0.42);
  jaw.add(chin);
  // 아래 이빨
  if (o.teeth) {
    for (const s of [-1, 1]) {
      const tooth = cone(M * 0.09, M * 0.3, 0xf6efdc, { seg: 5 });
      tooth.position.set(s * M * 0.34, M * 0.24, L * 0.9);
      jaw.add(tooth);
    }
    const tongue = ellipsoid(M * 0.3, M * 0.1, L * 0.42, 0xa8505a);
    tongue.position.set(0, M * 0.12, L * 0.6);
    jaw.add(tongue);
  }

  // 귀
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = group(s * R * 0.66, R * 0.66, -R * 0.08);
    ear.rotation.z = s * -0.26;
    ear.rotation.x = -0.12;
    head.add(ear);
    if (o.earType === 'round') {
      const outer = ellipsoid(o.earR, o.earR * 1.1, o.earR * 0.6, o.fur);
      ear.add(outer);
      const inner = ellipsoid(o.earR * 0.6, o.earR * 0.68, o.earR * 0.3, o.furDark ?? o.fur);
      inner.position.z = o.earR * 0.42;
      ear.add(inner);
    } else {
      const outer = cone(o.earR, o.earR * 2.6, o.fur, { seg: 7 });
      outer.position.y = o.earR * 1.2;
      ear.add(outer);
      const inner = cone(o.earR * 0.58, o.earR * 1.7, o.furDark ?? o.furLight, { seg: 6 });
      inner.position.set(0, o.earR * 1.15, o.earR * 0.3);
      ear.add(inner);
    }
    ears.push(ear);
  }

  return { head, jaw, ears, eyes, nose };
}

// ── 사족 동물 공통 골격 ─────────────────────────────────────
function makeQuadruped(o) {
  const rig = { form: 'quadruped' };
  const root = new THREE.Group();
  const body = group(0, o.hipY, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = o.hipY;

  // 몸통: 가슴 / 흉곽 / 허리 / 엉덩이
  const chest = ellipsoid(o.chestR, o.chestR * 0.96, o.chestR * 1.05, o.fur);
  chest.position.set(0, 0.02, o.bodyLen * 0.44);
  body.add(chest);
  rig.chest = chest;

  const torso = capsuleZ(o.bodyR, o.bodyLen * 0.9, o.fur);
  torso.scale.set(1, o.bodySquash ?? 1.0, 1);
  body.add(torso);

  const belly = ellipsoid(o.bodyR * 0.86, o.bodyR * 0.62, o.bodyLen * 0.52, o.furLight);
  belly.position.set(0, -o.bodyR * 0.5, o.bodyLen * 0.06);
  body.add(belly);

  const hipMass = ellipsoid(o.hipR, o.hipR * 0.98, o.hipR * 1.05, o.fur);
  hipMass.position.set(0, 0.0, -o.bodyLen * 0.46);
  body.add(hipMass);

  // 견갑골 / 골반 돌출
    for (const s of [-1, 1]) {
    const blade = ellipsoid(o.bodyR * 0.32, o.bodyR * 0.42, o.bodyR * 0.5, o.fur);
    blade.position.set(s * o.bodyR * 0.62, o.bodyR * 0.3, o.bodyLen * 0.32);
    body.add(blade);
    const haunch = ellipsoid(o.hipR * 0.42, o.hipR * 0.44, o.hipR * 0.54, o.fur);
    haunch.position.set(s * o.bodyR * 0.58, o.bodyR * 0.18, -o.bodyLen * 0.34);
    body.add(haunch);
  }

  // 목 (두 마디)
  const neck = group(0, o.neckY ?? o.bodyR * 0.6, o.bodyLen * 0.5 + o.bodyR * 0.28);
  neck.rotation.x = -(o.neckTilt ?? 0.3);
  body.add(neck);
  rig.neck = neck;
  rig.neckBase = neck.rotation.x;

  const neckMesh = capsuleY(o.neckR, Math.max(0.02, (o.neckLen ?? 0.3) * 0.9), o.fur, { seg: 12 });
  neckMesh.position.y = (o.neckLen ?? 0.3) * 0.45;
  neck.add(neckMesh);

  const headParts = makeHead(neck, o);
  rig.head = headParts.head;
  rig.headBase = headParts.head.position.clone();
  rig.jaw = headParts.jaw;
  rig.jawBase = headParts.jaw.rotation.x;
  rig.ears = headParts.ears;
  rig.eyes = headParts.eyes;

  // 꼬리 (여러 마디 + 끝 털)
  const tail = [];
  let parent = group(0, o.tailY ?? o.bodyR * 0.3, -(o.bodyLen * 0.5 + o.bodyR * 0.55));
  tail.push(parent);
  body.add(parent);
  const segs = o.tailSegs ?? 4;
  const tailLen = o.tailLen ?? 0.18;
  for (let i = 0; i < segs; i++) {
    const seg = group(0, 0, -tailLen);
    parent.add(seg);
    const r = (o.tailR ?? 0.06) * (1 - i * 0.14);
    const m = capsuleZ(r, tailLen * 0.9, i > segs - 2 ? (o.tailTipColor ?? o.furDark ?? o.fur) : o.fur, { seg: 8 });
    m.position.z = -tailLen * 0.4;
    parent.add(m);
    tail.push(seg);
    parent = seg;
  }
  if (o.tailTuft) {
    const tuft = ellipsoid((o.tailR ?? 0.06) * 2.1, (o.tailR ?? 0.06) * 2.3, (o.tailR ?? 0.06) * 2.8, o.tailTuftColor ?? o.furDark ?? o.fur);
    tuft.position.z = -tailLen * 0.5;
    parent.add(tuft);
    const tuft2 = cone((o.tailR ?? 0.06) * 1.3, (o.tailR ?? 0.06) * 3.4, o.tailTuftColor ?? o.furDark ?? o.fur, { seg: 6 });
    tuft2.rotation.x = -Math.PI / 2;
    tuft2.position.z = -tailLen * 1.2;
    parent.add(tuft2);
  }
  rig.tail = tail;
  rig.tailBase = tail[0].position.clone();

  // 다리
  const mk = (cfg, x, front) => {
    const total = cfg.upper + cfg.lower + cfg.pastern + cfg.pawHalf;
    return makeLeg(body, {
      ...cfg,
      x,
      y: -(o.hipY - total),
      front,
      color: o.fur,
      colorLight: o.legLight ?? o.fur,
      pawColor: o.pawColor ?? o.furDark ?? o.fur,
    });
  };
  rig.legs = {
    fl: mk({ ...o.frontLeg, z: o.frontLeg.z }, -o.legSpread, true),
    fr: mk({ ...o.frontLeg, z: o.frontLeg.z }, o.legSpread, true),
    bl: mk({ ...o.backLeg, z: o.backLeg.z }, -o.legSpread * 1.06, false),
    br: mk({ ...o.backLeg, z: o.backLeg.z }, o.legSpread * 1.06, false),
  };

  rig.extras = [];
  return { root, rig };
}

// ── 사자 ────────────────────────────────────────────────────
function buildLion() {
  const p = palette.lion;
  const { root, rig } = makeQuadruped({
    hipY: 1.03,
    bodyR: 0.4,
    bodyLen: 1.2,
    chestR: 0.44,
    hipR: 0.41,
    fur: p.fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    iris: 0xb87716,
    legSpread: 0.26,
    frontLeg: { upper: 0.44, lower: 0.38, pastern: 0.1, rTop: 0.17, rMid: 0.115, rBot: 0.088, pawHalf: 0.055, pawLen: 0.2, claws: false },
    backLeg: { upper: 0.45, lower: 0.4, pastern: 0.11, rTop: 0.2, rMid: 0.12, rBot: 0.09, pawHalf: 0.055, pawLen: 0.21 },
    neckR: 0.28,
    neckLen: 0.32,
    neckY: 0.22,
    neckTilt: 0.3,
    headR: 0.33,
    headY: 0.3,
    headZ: 0.12,
    muzzleR: 0.16,
    muzzleLen: 0.23,
    earR: 0.08,
    earType: 'pointed',
    teeth: true,
    tailR: 0.055,
    tailLen: 0.2,
    tailSegs: 4,
    tailY: 0.18,
    tailTuft: true,
    tailTuftColor: p.mane,
  });

  const head = rig.head;

  // 갈기 — 머리를 감싸는 털 층
  const mane = group(0, 0.02, -0.02);
  head.add(mane);
  rig.mane = mane;

  const shells = [
    { r: [0.4, 0.42, 0.35], z: -0.06, color: p.mane },
    { r: [0.47, 0.49, 0.33], z: -0.16, color: p.maneLight },
    { r: [0.33, 0.35, 0.31], z: 0.02, color: 0x5e3a18 },
  ];
  shells.forEach((s) => {
    const m = ellipsoid(s.r[0], s.r[1], s.r[2], s.color);
    m.position.z = s.z;
    mane.add(m);
  });

  const tuftGeo = new THREE.ConeGeometry(1, 1, 5);
  const maneMats = [
    new THREE.MeshStandardMaterial({ color: p.mane, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: p.maneLight, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x5e3a18, roughness: 0.95, flatShading: true }),
  ];
  const UP = new THREE.Vector3(0, 1, 0);
  const N = 56;
  for (let i = 0; i < N; i++) {
    const yy = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
    const phi = i * 2.399963;
    const dir = new THREE.Vector3(Math.cos(phi) * rad, yy, Math.sin(phi) * rad).normalize();
    if (dir.z > 0.38) continue;
    const tuft = new THREE.Mesh(tuftGeo, maneMats[i % 3]);
    const len = 0.26 + Math.random() * 0.18;
    tuft.scale.set(0.062, len, 0.062);
    tuft.position.copy(dir).multiplyScalar(0.43);
    tuft.position.z -= 0.05;
    tuft.quaternion.setFromUnitVectors(UP, dir);
    tuft.rotateX(-0.32);
    tuft.castShadow = true;
    mane.add(tuft);
  }

  // 가슴 갈기
  const chestMane = ellipsoid(0.3, 0.32, 0.2, p.mane);
  chestMane.position.set(0, 0.0, 0.66);
  rig.body.add(chestMane);
  for (let i = 0; i < 12; i++) {
    const t = cone(0.055, 0.2, p.mane, { seg: 5 });
    t.position.set((Math.random() - 0.5) * 0.4, -0.1 + Math.random() * 0.4, 0.74 + Math.random() * 0.06);
    t.rotation.x = 0.9 + Math.random() * 0.3;
    rig.body.add(t);
  }

  // 팔꿈치 털
  for (const key of ['fl', 'fr']) {
    const tuft = ellipsoid(0.09, 0.13, 0.1, p.furDark);
    tuft.position.set(0, -0.36, -0.05);
    rig.legs[key].knee.add(tuft);
  }

  return { root, rig };
}

// ── 늑대 ────────────────────────────────────────────────────
function buildWolf() {
  const p = palette.wolf;
  const { root, rig } = makeQuadruped({
    hipY: 0.95,
    bodyR: 0.29,
    bodyLen: 1.24,
    bodySquash: 0.96,
    chestR: 0.32,
    hipR: 0.3,
    fur: p.fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    iris: 0xd9a12c,
    legSpread: 0.2,
    frontLeg: { upper: 0.42, lower: 0.36, pastern: 0.1, rTop: 0.1, rMid: 0.068, rBot: 0.055, pawHalf: 0.045, pawLen: 0.15 },
    backLeg: { upper: 0.44, lower: 0.38, pastern: 0.11, rTop: 0.13, rMid: 0.072, rBot: 0.058, pawHalf: 0.045, pawLen: 0.16 },
    neckR: 0.19,
    neckLen: 0.36,
    neckY: 0.14,
    neckTilt: 0.42,
    headR: 0.22,
    headY: 0.34,
    headZ: 0.1,
    muzzleR: 0.095,
    muzzleLen: 0.32,
    earR: 0.075,
    earType: 'pointed',
    teeth: true,
    tailR: 0.06,
    tailLen: 0.19,
    tailSegs: 5,
    tailY: 0.1,
    tailTuft: false,
  });

  // 목덜미 러프
  const head = rig.head;
  const ruff = group(0, 0.02, -0.08);
  head.add(ruff);
  const coneGeo = new THREE.ConeGeometry(1, 1, 5);
  const furMats = [
    new THREE.MeshStandardMaterial({ color: p.fur, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: p.furLight, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: p.furDark, roughness: 0.95, flatShading: true }),
  ];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU;
    const t = new THREE.Mesh(coneGeo, furMats[i % 3]);
    const r = 0.25 + Math.random() * 0.06;
    t.scale.set(0.055, 0.18 + Math.random() * 0.1, 0.055);
    t.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.92, -0.02);
    t.rotation.z = a - Math.PI / 2;
    t.rotation.x = -0.5 + Math.cos(a) * 0.2;
    t.castShadow = true;
    ruff.add(t);
  }

  // 목 뒤 갈기 + 등줄기
  const ridge = ellipsoid(0.1, 0.07, 0.62, p.furDark);
  ridge.position.set(0, 0.27, 0.0);
  rig.body.add(ridge);
  for (let i = 0; i < 6; i++) {
    const t = cone(0.05, 0.16, p.furDark, { seg: 5 });
    t.position.set(0, 0.33, 0.3 - i * 0.13);
    t.rotation.x = -0.5;
    rig.body.add(t);
  }

  // 풍성한 꼬리
  const tailTip = rig.tail[rig.tail.length - 1];
  for (let i = 0; i < 3; i++) {
    const seg = rig.tail[Math.min(rig.tail.length - 1, i + 2)];
    const fluff = ellipsoid(0.11 - i * 0.015, 0.13 - i * 0.015, 0.2, i === 2 ? p.furLight : p.fur);
    fluff.position.z = -0.0;
    seg.add(fluff);
  }
  const tipTuft = ellipsoid(0.09, 0.1, 0.16, p.furLight);
  tipTuft.position.z = -0.18;
  tailTip.add(tipTuft);

  // 뺨 털
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = cone(0.035, 0.15, p.furLight, { seg: 4 });
      t.position.set(s * 0.17, -0.08 + i * 0.05, 0.12 + i * 0.01);
      t.rotation.z = s * (1.1 + i * 0.1);
      head.add(t);
    }
  }

  return { root, rig };
}

// ── 곰 ──────────────────────────────────────────────────────
function buildBear() {
  const p = palette.bear;
  const { root, rig } = makeQuadruped({
    hipY: 0.88,
    bodyR: 0.47,
    bodyLen: 1.06,
    bodySquash: 1.04,
    chestR: 0.52,
    hipR: 0.47,
    fur: p.fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    iris: 0x8a5a1c,
    legSpread: 0.36,
    frontLeg: { upper: 0.36, lower: 0.3, pastern: 0.1, rTop: 0.17, rMid: 0.12, rBot: 0.1, pawHalf: 0.07, pawLen: 0.25, claws: true },
    backLeg: { upper: 0.38, lower: 0.32, pastern: 0.1, rTop: 0.2, rMid: 0.13, rBot: 0.11, pawHalf: 0.07, pawLen: 0.26, claws: true },
    neckR: 0.3,
    neckLen: 0.3,
    neckY: 0.3,
    neckTilt: 0.3,
    headR: 0.33,
    headY: 0.3,
    headZ: 0.26,
    muzzleR: 0.17,
    muzzleLen: 0.22,
    earR: 0.1,
    earType: 'round',
    teeth: true,
    tailR: 0.07,
    tailLen: 0.1,
    tailSegs: 1,
    tailY: 0.16,
    tailTuft: false,
    pawColor: p.furDark,
  });

  // 어깨 혹
  const hump = ellipsoid(0.34, 0.26, 0.36, p.fur);
  hump.position.set(0, 0.32, 0.26);
  rig.body.add(hump);

  // 뺨 / 목 털
  for (const s of [-1, 1]) {
    const cheek = ellipsoid(0.13, 0.14, 0.12, p.furLight);
    cheek.position.set(s * 0.28, -0.05, 0.24);
    rig.head.add(cheek);
    const jawFluff = ellipsoid(0.14, 0.1, 0.16, p.fur);
    jawFluff.position.set(s * 0.2, -0.22, 0.16);
    rig.head.add(jawFluff);
  }

  // 등 털 뭉치
  for (let i = 0; i < 8; i++) {
    const t = ellipsoid(0.12, 0.06, 0.1, p.furDark);
    t.position.set((Math.random() - 0.5) * 0.4, 0.46, 0.4 - i * 0.13);
    rig.body.add(t);
  }

  // 발톱 (발가락 위로)
  const clawMat = new THREE.MeshStandardMaterial({ color: 0xd8cfbd, roughness: 0.45 });
  for (const key of ['fl', 'fr', 'bl', 'br']) {
    const leg = rig.legs[key];
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.12, 5), clawMat);
      claw.rotation.x = Math.PI * 0.56;
      claw.position.set(i * 0.075, -0.08, 0.235);
      leg.paw.add(claw);
    }
  }

  return { root, rig };
}

// ── 아나콘다 (다관절 뱀) ────────────────────────────────────
function buildAnaconda() {
  const p = palette.anaconda;
  const rig = { form: 'serpent' };
  const root = new THREE.Group();

  const body = group(0, 0.3, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = 0.3;

  const SEG = 16;
  const SEG_LEN = 0.27;
  const spine = [];
  const scaleMats = [p.fur, 0x53733d, 0x476634];

  let parent = body;
  for (let i = 0; i < SEG; i++) {
    const t = i / (SEG - 1);
    const seg = group(0, 0, i === 0 ? 0.94 : -SEG_LEN);
    parent.add(seg);
    const r = lerp(0.3, 0.035, Math.pow(t, 0.68)) * (i < 3 ? 1.02 : 1);

    // 몸통 마디 (겹치게)
    const mesh = ellipsoid(r * 1.18, r * 0.84, SEG_LEN * 0.92, scaleMats[i % 3]);
    seg.add(mesh);

    // 등 비늘 무늬
    if (i < SEG - 3) {
      const saddle = ellipsoid(r * 0.72, r * 0.14, SEG_LEN * 0.42, p.spot);
      saddle.position.set(0, r * 0.68, -SEG_LEN * 0.06);
      seg.add(saddle);
      for (const s of [-1, 1]) {
        const spot = ellipsoid(r * 0.24, r * 0.1, r * 0.3, p.furDark);
        spot.position.set(s * r * 0.62, r * 0.5, SEG_LEN * 0.16);
        seg.add(spot);
      }
    }
    // 배 비늘
    const belly = ellipsoid(r * 0.92, r * 0.2, SEG_LEN * 0.66, p.furLight);
    belly.position.y = -r * 0.6;
    seg.add(belly);

    // 옆 비늘 질감
    for (const s of [-1, 1]) {
      const sc = ellipsoid(r * 0.16, r * 0.1, r * 0.18, p.furDark);
      sc.position.set(s * r * 0.8, r * 0.12, -SEG_LEN * 0.18);
      seg.add(sc);
    }

    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;

  // 머리 — 납작한 쐐기형
  const headBase = group(0, 0.08, 1.0);
  headBase.rotation.x = -0.95;
  body.add(headBase);
  rig.neck = headBase;
  rig.neckBase = headBase.rotation.x;

  const head = group(0, 0.3, 0.16);
  headBase.add(head);
  rig.head = head;
  rig.headBase = head.position.clone();

  const skull = ellipsoid(0.22, 0.13, 0.3, p.fur);
  head.add(skull);
  const snout = ellipsoid(0.17, 0.1, 0.18, p.fur);
  snout.position.set(0, 0.01, 0.3);
  head.add(snout);
  const brow = ellipsoid(0.19, 0.05, 0.12, p.furDark);
  brow.position.set(0, 0.1, 0.12);
  head.add(brow);

  // 열감 기관(heat pit)
  for (const s of [-1, 1]) {
    const pit = sphere(0.022, 0x22301a, { seg: 6 });
    pit.position.set(s * 0.1, 0.06, 0.3);
    head.add(pit);
  }

  const jaw = group(0, -0.08, 0.06);
  head.add(jaw);
  rig.jaw = jaw;
  rig.jawBase = 0;
  const lowerJaw = ellipsoid(0.19, 0.07, 0.28, p.furLight);
  lowerJaw.position.z = 0.18;
  jaw.add(lowerJaw);

  for (const s of [-1, 1]) {
    const nostril = sphere(0.018, 0x151d10);
    nostril.position.set(s * 0.06, 0.08, 0.44);
    head.add(nostril);
    const eye = sphere(0.05, p.eye, { roughness: 0.2 });
    eye.position.set(s * 0.17, 0.09, 0.2);
    head.add(eye);
    const pupil = ellipsoid(0.013, 0.04, 0.022, 0x0f1109);
    pupil.position.set(s * 0.205, 0.09, 0.21);
    head.add(pupil);
    const ridge = ellipsoid(0.1, 0.032, 0.08, p.furDark);
    ridge.position.set(s * 0.15, 0.145, 0.16);
    ridge.rotation.z = s * 0.18;
    head.add(ridge);
  }

  // 혀 (두 갈래)
  const tongue = group(0, -0.03, 0.44);
  head.add(tongue);
  rig.tongue = tongue;
  const tongueBase = box(0.035, 0.02, 0.16, 0xa8343f);
  tongueBase.position.z = 0.07;
  tongue.add(tongueBase);
  for (const s of [-1, 1]) {
    const fork = box(0.022, 0.018, 0.13, 0xc04452);
    fork.position.set(s * 0.032, 0, 0.2);
    fork.rotation.y = s * 0.36;
    tongue.add(fork);
  }
  tongue.scale.z = 0.001;

  // 꼬리 끝
  const tip = cone(0.04, 0.26, p.furDark, { seg: 6 });
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.26;
  spine[spine.length - 1].add(tip);

  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.extras = [];
  return { root, rig };
}

// ── 멧돼지 (적) ─────────────────────────────────────────────
function buildBoar(tint) {
  const p = palette.boar;
  const fur = tint ?? p.fur;
  const { root, rig } = makeQuadruped({
    hipY: 0.6,
    bodyR: 0.3,
    bodyLen: 0.92,
    bodySquash: 1.02,
    chestR: 0.34,
    hipR: 0.29,
    fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    iris: 0xd8342a,
    legSpread: 0.24,
    frontLeg: { upper: 0.25, lower: 0.2, pastern: 0.08, rTop: 0.085, rMid: 0.055, rBot: 0.045, pawHalf: 0.04, pawLen: 0.11 },
    backLeg: { upper: 0.26, lower: 0.22, pastern: 0.08, rTop: 0.1, rMid: 0.06, rBot: 0.048, pawHalf: 0.04, pawLen: 0.11 },
    neckR: 0.24,
    neckLen: 0.12,
    neckY: 0.04,
    neckTilt: 0.15,
    headR: 0.25,
    headY: 0.14,
    headZ: 0.16,
    muzzleR: 0.13,
    muzzleLen: 0.2,
    earR: 0.07,
    earType: 'pointed',
    teeth: false,
    tailR: 0.035,
    tailLen: 0.08,
    tailSegs: 2,
    tailY: 0.16,
    tailTuft: false,
  });

  // 등 강모
  const bristleGeo = new THREE.ConeGeometry(0.018, 0.16, 4);
  const bristleMat = new THREE.MeshStandardMaterial({ color: p.furDark, roughness: 1, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(bristleGeo, bristleMat);
    b.position.set((Math.random() - 0.5) * 0.2, 0.26, 0.4 - i * 0.07);
    b.rotation.x = -0.4 + (Math.random() - 0.5) * 0.3;
    b.rotation.z = (Math.random() - 0.5) * 0.4;
    rig.body.add(b);
  }

  // 엄니
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.22, 6), tuskMat);
    tusk.position.set(s * 0.12, -0.06, 0.28);
    tusk.rotation.x = -1.0;
    tusk.rotation.z = s * 0.3;
    rig.head.add(tusk);
  }

  // 코 (납작한 주둥이)
  const snout = cylinder(0.1, 0.11, 0.06, p.nose, { seg: 10 });
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.05, 0.3);
  rig.head.add(snout);
  for (const s of [-1, 1]) {
    const n = sphere(0.018, 0x120c0a, { seg: 6 });
    n.position.set(s * 0.04, -0.03, 0.34);
    rig.head.add(n);
  }

  // 분노의 눈 (발광)
  for (const s of [-1, 1]) {
    const glow = sphere(0.05, 0xff3a24, { emissive: 0xff2200, emissiveIntensity: 2.2, roughness: 0.3 });
    glow.position.set(s * 0.18, 0.1, 0.22);
    rig.head.add(glow);
  }

  return { root, rig };
}

// ── 종 설정 ────────────────────────────────────────────────
export const ANIMALS = {
  lion: {
    id: 'lion',
    name: '사자',
    emoji: '🦁',
    tagline: '사바나의 제압자',
    accent: '#e8b04b',
    desc: '묵직한 앞발과 위압적인 포효로 무리를 몰아냅니다.',
    hp: 150,
    walk: 4.5,
    run: 9.6,
    accel: 30,
    turn: 9,
    jump: 7.6,
    radius: 0.55,
    stats: { power: 5, speed: 4, tough: 4 },
    attack: { name: '앞발 할퀴기', short: '할퀴기', range: 3.5, arc: 2.5, damage: 26, knock: 8, cd: 0.62, dur: 0.62, hitAt: 0.36, lunge: 1.0, sound: 'slash' },
    skills: [
      { id: 'roar', name: '사자의 포효', short: '포효', icon: '📣', key: 'K', cd: 9, desc: '충격파로 주변 적을 밀쳐내고 1.8초 동안 기절시킵니다.' },
      { id: 'pounce', name: '맹수의 도약', short: '도약', icon: '🌀', key: 'L', cd: 7.5, desc: '앞으로 길게 도약해 착지 지점을 강하게 내리칩니다.' },
    ],
    anim: { gaitAmp: 0.62, bob: 0.05, sway: 0.055, gaitRate: 1.5, tailAmp: 0.32, headBob: 0.05 },
    build: buildLion,
  },
  wolf: {
    id: 'wolf',
    name: '늑대',
    emoji: '🐺',
    tagline: '달빛의 추격자',
    accent: '#8fb4e8',
    desc: '빠른 발과 날카로운 송곳니, 무리의 울부짖음으로 사냥합니다.',
    hp: 120,
    walk: 5.0,
    run: 10.8,
    accel: 36,
    turn: 11,
    jump: 8.2,
    radius: 0.48,
    stats: { power: 3, speed: 5, tough: 3 },
    attack: { name: '송곳니 물기', short: '물기', range: 3.0, arc: 1.5, damage: 20, knock: 4, cd: 0.45, dur: 0.46, hitAt: 0.22, lunge: 1.6, sound: 'bite' },
    skills: [
      { id: 'dash', name: '달빛 질주', short: '질주', icon: '🌙', key: 'K', cd: 6, desc: '달빛을 남기며 앞으로 돌진해 지나치는 적을 베어냅니다.' },
      { id: 'howl', name: '무리 울부짖기', short: '울부짖기', icon: '🐾', key: 'L', cd: 14, desc: '9초 동안 이동 속도와 공격력이 35% 증가합니다.' },
    ],
    anim: { gaitAmp: 0.72, bob: 0.05, sway: 0.045, gaitRate: 1.65, tailAmp: 0.36, headBob: 0.05 },
    build: buildWolf,
  },
  bear: {
    id: 'bear',
    name: '곰',
    emoji: '🐻',
    tagline: '대지의 분노',
    accent: '#c98a52',
    desc: '거대한 몸으로 내리치고, 땅을 울려 적을 띄웁니다.',
    hp: 195,
    walk: 4.0,
    run: 8.2,
    accel: 22,
    turn: 7,
    jump: 6.8,
    radius: 0.72,
    stats: { power: 5, speed: 2, tough: 5 },
    attack: { name: '묵직한 내리치기', short: '내리치기', range: 3.9, arc: 2.7, damage: 34, knock: 11, cd: 0.85, dur: 0.8, hitAt: 0.44, lunge: 0.8, sound: 'slam' },
    skills: [
      { id: 'stomp', name: '대지 강타', short: '강타', icon: '💥', key: 'K', cd: 8, desc: '땅을 내리쳐 반경 8m에 충격파를 일으키고 적을 기절시킵니다.' },
      { id: 'charge', name: '광폭 돌진', short: '돌진', icon: '🔥', key: 'L', cd: 10, desc: '앞으로 미친 듯이 돌진해 부딪히는 적을 날려버립니다.' },
    ],
    anim: { gaitAmp: 0.5, bob: 0.055, sway: 0.08, gaitRate: 1.3, tailAmp: 0.2, headBob: 0.04 },
    build: buildBear,
  },
  anaconda: {
    id: 'anaconda',
    name: '아나콘다',
    emoji: '🐍',
    tagline: '수풀의 포식자',
    accent: '#7fae5c',
    desc: '소리 없이 다가가 조여 오는 거대한 뱀. 압박하면 벗어날 수 없습니다.',
    hp: 135,
    walk: 4.3,
    run: 8.6,
    accel: 26,
    turn: 8,
    jump: 6.2,
    radius: 0.5,
    stats: { power: 4, speed: 4, tough: 4 },
    attack: { name: '기습 물기', short: '물기', range: 3.3, arc: 1.15, damage: 22, knock: 3.5, cd: 0.52, dur: 0.5, hitAt: 0.2, lunge: 2.0, sound: 'bite' },
    skills: [
      { id: 'constrict', name: '압박하기', short: '압박', icon: '🌀', key: 'K', cd: 9, desc: '가까운 적에게 달려들어 2초 동안 조여 옥죄며 지속 피해를 줍니다. 대상은 움직이지 못합니다.' },
      { id: 'tailslam', name: '꼬리 강타', short: '꼬리', icon: '💢', key: 'L', cd: 7, desc: '꼬리를 크게 휘둘러 주변 적을 강하게 날려버립니다.' },
    ],
    anim: { gaitAmp: 0.05, bob: 0.02, sway: 0.02, gaitRate: 1.2, tailAmp: 0.2, headBob: 0.03, serpent: true },
    build: buildAnaconda,
  },
};

export const ENEMY_TYPES = {
  boar: { build: (tint) => buildBoar(tint), hp: 72, speed: 4.0, damage: 12, scale: 1 },
  alpha: { build: (tint) => buildBoar(tint ?? 0x53402c), hp: 165, speed: 4.7, damage: 20, scale: 1.35 },
};

export function buildAnimal(id) {
  const cfg = ANIMALS[id];
  if (!cfg) throw new Error('알 수 없는 동물: ' + id);
  const { root, rig } = cfg.build();
  rig.form = cfg.anim.serpent ? 'serpent' : 'quadruped';
  return { root, rig, cfg };
}

export function buildEnemy(kind) {
  const type = ENEMY_TYPES[kind];
  const { root, rig } = type.build();
  return { root, rig, type };
}

export function collectMaterials(root) {
  const set = new Set();
  root.traverse((o) => {
    if (o.isMesh && o.material) set.add(o.material);
  });
  return [...set];
}
