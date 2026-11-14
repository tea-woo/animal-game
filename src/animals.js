// 동물 모델 — 관절형(articulated) 절차적 3D 모델과 종별 설정
import THREE from './three.js';
import { ellipsoid, sphere, capsuleY, capsuleZ, box, cone, cylinder, group, palette } from './builders.js';
import { lerp } from './util.js';

// ── 관절 다리 ───────────────────────────────────────────────
function makeLeg(parent, o) {
  const hip = group(o.x, o.y, o.z);
  parent.add(hip);

  const upperLen = o.upper;
  const lowerLen = o.lower;
  const rTop = o.rTop;
  const rBot = o.rBot;

  const up = capsuleY(rTop, Math.max(0.02, upperLen - rTop * 2), o.color, { seg: 10 });
  up.position.y = -upperLen / 2;
  hip.add(up);

  const shoulder = ellipsoid(rTop * 1.3, rTop * 1.5, rTop * 1.4, o.color);
  shoulder.position.y = -rTop * 0.15;
  hip.add(shoulder);

  const knee = group(0, -upperLen, 0);
  hip.add(knee);
  knee.add(sphere(rBot * 1.08, o.color, { seg: 10 }));

  const low = capsuleY(rBot, Math.max(0.02, lowerLen - rBot * 2), o.colorLight ?? o.color, { seg: 10 });
  low.position.y = -lowerLen / 2;
  knee.add(low);

  const paw = group(0, -lowerLen, 0);
  knee.add(paw);

  const pawMesh = ellipsoid(rBot * 1.15, o.pawHalf, o.pawLen, o.pawColor ?? o.color);
  pawMesh.position.z = o.pawLen * 0.22;
  pawMesh.position.y = -o.pawHalf * 0.6;
  paw.add(pawMesh);

  for (let i = -1; i <= 1; i++) {
    const toe = ellipsoid(rBot * 0.4, o.pawHalf * 0.85, rBot * 0.42, o.pawColor ?? o.colorLight ?? o.color);
    toe.position.set(i * rBot * 0.6, -o.pawHalf * 0.75, o.pawLen * 0.95);
    paw.add(toe);
  }

  return {
    hip,
    knee,
    paw,
    sign: o.front ? 1 : -1,
    front: !!o.front,
    baseHip: o.front ? 0.06 : -0.05,
    baseKnee: o.front ? 0.1 : -0.1,
  };
}

function makeQuadruped(o) {
  const rig = { form: 'quadruped' };
  const root = new THREE.Group();
  const body = group(0, o.hipY, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = o.hipY;

  // 몸통
  const torso = capsuleZ(o.bodyR, o.bodyLen, o.fur);
  torso.scale.set(1, o.bodySquash ?? 1.02, 1);
  body.add(torso);

  const chest = ellipsoid(o.chestR, o.chestR * 0.98, o.chestR * 1.15, o.fur);
  chest.position.set(0, o.chestY ?? 0.03, o.bodyLen * 0.5 + o.bodyR * 0.35);
  body.add(chest);

  const hips = ellipsoid(o.hipR, o.hipR * 0.98, o.hipR * 1.1, o.fur);
  hips.position.set(0, o.hipSy ?? 0.0, -(o.bodyLen * 0.5 + o.bodyR * 0.3));
  body.add(hips);

  // 배/가슴 밝은 털
  const belly = ellipsoid(o.bodyR * 0.78, o.bodyR * 0.5, o.bodyLen * 0.6, o.furLight);
  belly.position.set(0, -o.bodyR * 0.62, o.bodyR * 0.1);
  body.add(belly);

  // 목
  const neck = group(0, o.neckY ?? o.bodyR * 0.55, o.bodyLen * 0.55 + o.bodyR * 0.3);
  neck.rotation.x = -(o.neckTilt ?? 0.32);
  body.add(neck);
  rig.neck = neck;
  rig.neckBase = neck.rotation.x;

  const neckMesh = capsuleY(o.neckR, o.neckLen ?? 0.3, o.fur, { seg: 10 });
  neckMesh.position.y = (o.neckLen ?? 0.3) * 0.4;
  neck.add(neckMesh);

  // 머리
  const head = group(0, (o.headY ?? 0.3), o.headZ ?? 0.1);
  neck.add(head);
  rig.head = head;

  const skull = ellipsoid(o.headR, o.headR * 0.92, o.headR * 0.98, o.fur);
  head.add(skull);

  const muzzleLen = o.muzzleLen ?? 0.3;
  const muzzle = ellipsoid(o.muzzleR, o.muzzleRy ?? o.muzzleR * 0.8, muzzleLen, o.furLight);
  muzzle.position.set(0, -o.headR * 0.22, o.headR * 0.7 + muzzleLen * 0.5);
  head.add(muzzle);

  const nose = ellipsoid(o.muzzleR * 0.48, o.muzzleR * 0.34, o.muzzleR * 0.4, o.nose);
  nose.position.set(0, -o.headR * 0.16, o.headR * 0.7 + muzzleLen * 1.02);
  head.add(nose);
  rig.nose = nose;

  // 눈
  for (const s of [-1, 1]) {
    const eye = sphere(o.headR * 0.17, o.eye ?? 0x201408, { seg: 10, roughness: 0.25 });
    eye.position.set(s * o.headR * 0.5, o.headR * 0.18, o.headR * 0.78);
    head.add(eye);
    const glint = sphere(o.headR * 0.055, 0xffffff, { seg: 6, roughness: 0.1 });
    glint.position.set(s * o.headR * 0.54, o.headR * 0.22, o.headR * 0.9);
    head.add(glint);
    // 눈썹(표정)
    const brow = ellipsoid(o.headR * 0.22, o.headR * 0.07, o.headR * 0.12, o.furDark ?? o.fur);
    brow.position.set(s * o.headR * 0.5, o.headR * 0.33, o.headR * 0.72);
    brow.rotation.z = s * 0.28;
    head.add(brow);
  }

  // 턱 (물기 표현)
  const jaw = group(0, -o.headR * 0.3, o.headR * 0.25);
  head.add(jaw);
  rig.jaw = jaw;
  const jawMesh = ellipsoid(o.muzzleR * 0.85, o.muzzleR * 0.4, muzzleLen * 0.9, o.furLight);
  jawMesh.position.set(0, -o.muzzleR * 0.15, muzzleLen * 0.45);
  jaw.add(jawMesh);
  rig.jawBase = jaw.rotation.x;

  // 귀
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = group(s * o.headR * 0.62, o.headR * 0.72, -o.headR * 0.08);
    ear.rotation.z = s * -0.22;
    head.add(ear);
    const outer = o.earRound
      ? ellipsoid(o.earR, o.earR * 1.05, o.earR * 0.55, o.fur)
      : cone(o.earR, o.earR * 2.6, o.furDark ?? o.fur, { seg: 7 });
    if (!o.earRound) outer.position.y = o.earR * 1.2;
    ear.add(outer);
    if (!o.earRound) {
      const inner = cone(o.earR * 0.6, o.earR * 1.7, o.furLight, { seg: 7 });
      inner.position.set(0, o.earR * 1.1, o.earR * 0.24);
      ear.add(inner);
    }
    ears.push(ear);
  }
  rig.ears = ears;

  // 꼬리
  const tail = [];
  let parent = group(0, o.tailY ?? o.bodyR * 0.24, -(o.bodyLen * 0.5 + o.bodyR * 0.7));
  body.add(parent);
  tail.push(parent);
  const segs = o.tailSegs ?? 3;
  for (let i = 0; i < segs; i++) {
    const seg = group(0, 0, -(o.tailLen ?? 0.22));
    parent.add(seg);
    const m = capsuleZ((o.tailR ?? 0.06) * (1 - i * 0.18), (o.tailLen ?? 0.22) * 0.9, o.furDark ?? o.fur, { seg: 8 });
    m.position.z = -(o.tailLen ?? 0.22) * 0.35;
    parent.add(m);
    tail.push(seg);
    parent = seg;
  }
  if (o.tailTuft) {
    const tuft = ellipsoid(o.tailR * 2.0, o.tailR * 2.1, o.tailR * 2.6, o.tailTuftColor ?? o.furDark ?? o.fur);
    tuft.position.z = -(o.tailLen ?? 0.22) * 0.6;
    parent.add(tuft);
  }
  rig.tail = tail;

  // 다리 (앞/뒤)
  const legY = -(o.hipY - (o.frontLeg.upper + o.frontLeg.lower + o.frontLeg.pawHalf));
  const legYBack = -(o.hipY - (o.backLeg.upper + o.backLeg.lower + o.backLeg.pawHalf));
  rig.legs = {
    fl: makeLeg(body, { ...o.frontLeg, x: -o.legSpread, y: legY, z: o.frontLeg.z, front: true, color: o.fur, colorLight: o.fur, pawColor: o.pawColor ?? o.fur }),
    fr: makeLeg(body, { ...o.frontLeg, x: o.legSpread, y: legY, z: o.frontLeg.z, front: true, color: o.fur, colorLight: o.fur, pawColor: o.pawColor ?? o.fur }),
    bl: makeLeg(body, { ...o.backLeg, x: -o.legSpread * 1.05, y: legYBack, z: o.backLeg.z, front: false, color: o.fur, colorLight: o.fur, pawColor: o.pawColor ?? o.fur }),
    br: makeLeg(body, { ...o.backLeg, x: o.legSpread * 1.05, y: legYBack, z: o.backLeg.z, front: false, color: o.fur, colorLight: o.fur, pawColor: o.pawColor ?? o.fur }),
  };

  rig.extras = [];
  return { root, rig };
}

// ── 사자 ────────────────────────────────────────────────────
function buildLion() {
  const p = palette.lion;
  const { root, rig } = makeQuadruped({
    hipY: 1.04,
    bodyR: 0.4,
    bodyLen: 1.16,
    chestR: 0.44,
    hipR: 0.41,
    fur: p.fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    eye: p.eye,
    legSpread: 0.255,
    frontLeg: { upper: 0.47, lower: 0.43, rTop: 0.14, rBot: 0.088, pawHalf: 0.07, pawLen: 0.2, z: 0.52 },
    backLeg: { upper: 0.47, lower: 0.44, rTop: 0.17, rBot: 0.095, pawHalf: 0.07, pawLen: 0.21, z: -0.5 },
    neckR: 0.27,
    neckLen: 0.3,
    neckY: 0.24,
    neckTilt: 0.34,
    headR: 0.3,
    headY: 0.28,
    headZ: 0.12,
    muzzleR: 0.16,
    muzzleLen: 0.24,
    earR: 0.075,
    tailR: 0.055,
    tailLen: 0.22,
    tailSegs: 3,
    tailY: 0.16,
    tailTuft: true,
    tailTuftColor: p.mane,
  });

  const head = rig.head;
  const p2 = p;

  // 갈기 — 여러 겹의 털 뭉치
  const mane = group(0, 0.02, -0.05);
  head.add(mane);
  rig.mane = mane;

  const tuftGeo = new THREE.ConeGeometry(1, 1, 6);
  const layer = (count, radius, size, tilt, color, yOff = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const tuft = new THREE.Mesh(tuftGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
      const r = radius * (0.86 + Math.random() * 0.3);
      tuft.scale.set(size * 0.5, size * (1.5 + Math.random() * 0.7), size * 0.55);
      tuft.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.98 + yOff, -0.1 - Math.abs(Math.sin(a)) * 0.06);
      tuft.rotation.z = a - Math.PI / 2;
      tuft.rotation.x = -Math.PI / 2 + tilt + Math.cos(a) * 0.25;
      tuft.castShadow = true;
      mane.add(tuft);
    }
  };
  layer(16, 0.36, 0.16, 0.0, p2.mane, 0.02);
  layer(12, 0.46, 0.15, 0.12, p2.maneLight, -0.02);
  layer(9, 0.28, 0.14, -0.16, p2.mane, 0.06);

  // 갈기 안쪽 볼륨
  const maneCore = ellipsoid(0.4, 0.42, 0.28, p2.mane);
  maneCore.position.z = -0.1;
  mane.add(maneCore);

  // 가슴 갈기
  const chestMane = ellipsoid(0.28, 0.3, 0.18, p2.mane);
  chestMane.position.set(0, 0.02, 0.66);
  rig.body.add(chestMane);

  // 어깨 근육
  for (const s of [-1, 1]) {
    const shoulder = ellipsoid(0.2, 0.24, 0.3, p2.fur);
    shoulder.position.set(s * 0.3, 0.1, 0.46);
    rig.body.add(shoulder);
  }

  return { root, rig };
}

// ── 늑대 ────────────────────────────────────────────────────
function buildWolf() {
  const p = palette.wolf;
  const { root, rig } = makeQuadruped({
    hipY: 0.95,
    bodyR: 0.3,
    bodyLen: 1.2,
    bodySquash: 0.98,
    chestR: 0.33,
    hipR: 0.3,
    fur: p.fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    eye: p.eye,
    legSpread: 0.2,
    frontLeg: { upper: 0.44, lower: 0.4, rTop: 0.1, rBot: 0.062, pawHalf: 0.05, pawLen: 0.15, z: 0.54 },
    backLeg: { upper: 0.44, lower: 0.43, rTop: 0.13, rBot: 0.07, pawHalf: 0.05, pawLen: 0.16, z: -0.52 },
    neckR: 0.2,
    neckLen: 0.34,
    neckY: 0.16,
    neckTilt: 0.45,
    headR: 0.23,
    headY: 0.34,
    headZ: 0.1,
    muzzleR: 0.1,
    muzzleLen: 0.34,
    earR: 0.075,
    tailR: 0.055,
    tailLen: 0.2,
    tailSegs: 4,
    tailY: 0.1,
    tailTuft: true,
    tailTuftColor: p.furLight,
  });

  const head = rig.head;

  // 목덜미 러프 (뾰족한 털)
  const ruff = group(0, 0.02, -0.06);
  head.add(ruff);
  const coneGeo = new THREE.ConeGeometry(1, 1, 5);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const t = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? p.furLight : p.fur, roughness: 0.95, flatShading: true }));
    const r = 0.27 + Math.random() * 0.05;
    t.scale.set(0.07, 0.2 + Math.random() * 0.08, 0.07);
    t.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.9, -0.05);
    t.rotation.z = a - Math.PI / 2;
    t.rotation.x = -Math.PI / 2 + 0.1;
    ruff.add(t);
  }

  // 등줄기 진한 털
  const ridge = ellipsoid(0.14, 0.08, 0.66, p.furDark);
  ridge.position.set(0, 0.28, 0.02);
  rig.body.add(ridge);

  // 어깨/허리 근육
  for (const s of [-1, 1]) {
    const shoulder = ellipsoid(0.14, 0.18, 0.26, p.fur);
    shoulder.position.set(s * 0.24, 0.08, 0.44);
    rig.body.add(shoulder);
  }

  // 꼬리 볼륨
  const tailFluff = ellipsoid(0.11, 0.12, 0.26, p.furLight);
  tailFluff.position.z = -0.34;
  rig.tail[rig.tail.length - 1].add(tailFluff);

  return { root, rig };
}

// ── 곰 ──────────────────────────────────────────────────────
function buildBear() {
  const p = palette.bear;
  const { root, rig } = makeQuadruped({
    hipY: 0.88,
    bodyR: 0.54,
    bodyLen: 0.96,
    bodySquash: 1.05,
    chestR: 0.58,
    hipR: 0.52,
    fur: p.fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    eye: p.eye,
    legSpread: 0.34,
    frontLeg: { upper: 0.36, lower: 0.32, rTop: 0.19, rBot: 0.12, pawHalf: 0.08, pawLen: 0.26, z: 0.44 },
    backLeg: { upper: 0.37, lower: 0.33, rTop: 0.22, rBot: 0.13, pawHalf: 0.08, pawLen: 0.27, z: -0.42 },
    neckR: 0.34,
    neckLen: 0.18,
    neckY: 0.26,
    neckTilt: 0.24,
    headR: 0.36,
    headY: 0.24,
    headZ: 0.14,
    muzzleR: 0.2,
    muzzleLen: 0.22,
    earR: 0.1,
    tailR: 0.07,
    tailLen: 0.1,
    tailSegs: 1,
    tailY: 0.14,
    earRound: true,
    tailTuft: false,
    pawColor: p.furDark,
  });

  // 어깨 혹
  const hump = ellipsoid(0.4, 0.3, 0.36, p.fur);
  hump.position.set(0, 0.34, 0.28);
  rig.body.add(hump);

  // 뺨 털
  for (const s of [-1, 1]) {
    const cheek = ellipsoid(0.14, 0.14, 0.12, p.furLight);
    cheek.position.set(s * 0.3, -0.06, 0.24);
    rig.head.add(cheek);
  }

  // 발톱
  const clawGeo = new THREE.ConeGeometry(0.026, 0.11, 5);
  for (const key of ['fl', 'fr', 'bl', 'br']) {
    const leg = rig.legs[key];
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(clawGeo, new THREE.MeshStandardMaterial({ color: 0xd8cfbd, roughness: 0.5 }));
      claw.rotation.x = Math.PI * 0.55;
      claw.position.set(i * 0.075, -0.075, 0.22);
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

  const SEG = 14;
  const SEG_LEN = 0.3;
  const spine = [];

  let parent = body;
  for (let i = 0; i < SEG; i++) {
    const t = i / (SEG - 1); // 0 = 머리쪽, 1 = 꼬리쪽
    const seg = group(0, 0, i === 0 ? 0.92 : -SEG_LEN);
    parent.add(seg);
    const r = lerp(0.29, 0.055, Math.pow(t, 0.72)) * (i < 3 ? 1.03 : 1);
    const mesh = ellipsoid(r * 1.14, r * 0.82, SEG_LEN * 0.72 + r * 0.5, i % 2 ? p.fur : 0x53733d);
    seg.add(mesh);
    // 등 비늘 무늬
    if (i < SEG - 2) {
      for (let k = 0; k < 2; k++) {
        const spot = ellipsoid(r * 0.34, r * 0.16, r * 0.42, p.spot);
        spot.position.set((k ? 1 : -1) * r * 0.5, r * 0.72, -SEG_LEN * 0.12 + k * SEG_LEN * 0.28);
        seg.add(spot);
      }
      const saddle = ellipsoid(r * 0.5, r * 0.2, SEG_LEN * 0.34, p.furDark);
      saddle.position.set(0, r * 0.75, -SEG_LEN * 0.05);
      seg.add(saddle);
    }
    // 배 밝은 비늘
    const belly = ellipsoid(r * 0.9, r * 0.22, SEG_LEN * 0.6, p.furLight);
    belly.position.y = -r * 0.72;
    seg.add(belly);

    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;
  rig.spineBaseY = 0.3;

  // 머리 — 납작한 타원형 두개골
  const headBase = group(0, 0.06, 1.0);
  headBase.rotation.x = -0.62;
  body.add(headBase);
  rig.neck = headBase;
  rig.neckBase = headBase.rotation.x;

  const head = group(0, 0.26, 0.14);
  headBase.add(head);
  rig.head = head;

  const skull = ellipsoid(0.21, 0.13, 0.28, p.fur);
  head.add(skull);
  const jaw = group(0, -0.07, 0.06);
  head.add(jaw);
  rig.jaw = jaw;
  rig.jawBase = 0;
  const lowerJaw = ellipsoid(0.185, 0.075, 0.25, p.furLight);
  lowerJaw.position.z = 0.16;
  jaw.add(lowerJaw);

  const snout = ellipsoid(0.16, 0.09, 0.16, p.fur);
  snout.position.set(0, 0.01, 0.3);
  head.add(snout);

  for (const s of [-1, 1]) {
    const nostril = sphere(0.02, 0x1b2414);
    nostril.position.set(s * 0.06, 0.08, 0.43);
    head.add(nostril);
    const eye = sphere(0.045, p.eye, { roughness: 0.2 });
    eye.position.set(s * 0.16, 0.09, 0.2);
    head.add(eye);
    const pupil = ellipsoid(0.012, 0.035, 0.02, 0x101008);
    pupil.position.set(s * 0.198, 0.09, 0.21);
    head.add(pupil);
    const brow = ellipsoid(0.1, 0.03, 0.08, p.furDark);
    brow.position.set(s * 0.15, 0.14, 0.16);
    brow.rotation.z = s * 0.2;
    head.add(brow);
  }

  // 혀 (두 갈래)
  const tongue = group(0, -0.03, 0.42);
  head.add(tongue);
  rig.tongue = tongue;
  const tongueBase = box(0.035, 0.02, 0.16, 0xa8343f);
  tongueBase.position.z = 0.07;
  tongue.add(tongueBase);
  for (const s of [-1, 1]) {
    const fork = box(0.022, 0.018, 0.12, 0xc04452);
    fork.position.set(s * 0.03, 0, 0.19);
    fork.rotation.y = s * 0.35;
    tongue.add(fork);
  }
  tongue.scale.z = 0.001;

  // 꼬리 끝
  const tip = cone(0.05, 0.2, p.furDark, { seg: 6 });
  tip.rotation.x = Math.PI / 2;
  tip.position.z = -0.24;
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
    hipY: 0.62,
    bodyR: 0.34,
    bodyLen: 0.8,
    bodySquash: 1.0,
    chestR: 0.36,
    hipR: 0.32,
    fur,
    furLight: p.furLight,
    furDark: p.furDark,
    nose: p.nose,
    eye: p.eye,
    legSpread: 0.22,
    frontLeg: { upper: 0.24, lower: 0.22, rTop: 0.09, rBot: 0.055, pawHalf: 0.045, pawLen: 0.12, z: 0.36 },
    backLeg: { upper: 0.25, lower: 0.23, rTop: 0.11, rBot: 0.06, pawHalf: 0.045, pawLen: 0.12, z: -0.34 },
    neckR: 0.26,
    neckLen: 0.1,
    neckY: 0.02,
    neckTilt: 0.12,
    headR: 0.27,
    headY: 0.1,
    headZ: 0.12,
    muzzleR: 0.15,
    muzzleLen: 0.2,
    earR: 0.07,
    tailR: 0.04,
    tailLen: 0.1,
    tailSegs: 2,
    tailY: 0.16,
    tailTuft: false,
  });

  // 등 강모
  const bristleGeo = new THREE.ConeGeometry(0.022, 0.22, 4);
  const bristleMat = new THREE.MeshStandardMaterial({ color: p.furDark, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(bristleGeo, bristleMat);
    b.position.set((Math.random() - 0.5) * 0.24, 0.31, 0.42 - i * 0.06);
    b.rotation.x = -0.35 + (Math.random() - 0.5) * 0.3;
    b.rotation.z = (Math.random() - 0.5) * 0.4;
    rig.body.add(b);
  }

  // 엄니
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), tuskMat);
    tusk.position.set(s * 0.12, -0.05, 0.26);
    tusk.rotation.x = -0.9;
    tusk.rotation.z = s * 0.25;
    rig.head.add(tusk);
  }

  // 코 (납작한 주둥이)
  const snout = cylinder(0.1, 0.11, 0.06, p.nose, { seg: 10 });
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.04, 0.28);
  rig.head.add(snout);

  // 분노의 눈 (발광)
  for (const s of [-1, 1]) {
    const glow = sphere(0.045, 0xff3a24, { emissive: 0xff2200, emissiveIntensity: 2.2, roughness: 0.3 });
    glow.position.set(s * 0.19, 0.09, 0.21);
    rig.head.add(glow);
  }

  // 어깨 근육
  for (const s of [-1, 1]) {
    const sh = ellipsoid(0.14, 0.16, 0.2, fur);
    sh.position.set(s * 0.26, 0.06, 0.28);
    rig.body.add(sh);
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
    attack: { name: '앞발 할퀴기', short: '할퀴기', range: 3.5, arc: 2.5, damage: 26, knock: 8, cd: 0.62, dur: 0.55, hitAt: 0.32, lunge: 1.0, sound: 'slash' },
    skills: [
      { id: 'roar', name: '사자의 포효', short: '포효', icon: '📣', key: 'K', cd: 9, desc: '충격파로 주변 적을 밀쳐내고 1.8초 동안 기절시킵니다.' },
      { id: 'pounce', name: '맹수의 도약', short: '도약', icon: '🌀', key: 'L', cd: 7.5, desc: '앞으로 길게 도약해 착지 지점을 강하게 내리칩니다.' },
    ],
    anim: { gaitAmp: 0.62, bob: 0.045, sway: 0.055, gaitRate: 1.55, tailAmp: 0.3, headBob: 0.05 },
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
    attack: { name: '송곳니 물기', short: '물기', range: 3.0, arc: 1.5, damage: 20, knock: 4, cd: 0.42, dur: 0.4, hitAt: 0.2, lunge: 1.6, sound: 'bite' },
    skills: [
      { id: 'dash', name: '달빛 질주', short: '질주', icon: '🌙', key: 'K', cd: 6, desc: '달빛을 남기며 앞으로 돌진해 지나치는 적을 베어냅니다.' },
      { id: 'howl', name: '무리 울부짖기', short: '울부짖기', icon: '🐾', key: 'L', cd: 14, desc: '9초 동안 이동 속도와 공격력이 35% 증가합니다.' },
    ],
    anim: { gaitAmp: 0.72, bob: 0.05, sway: 0.045, gaitRate: 1.7, tailAmp: 0.36, headBob: 0.05 },
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
    attack: { name: '묵직한 내리치기', short: '내리치기', range: 3.9, arc: 2.7, damage: 34, knock: 11, cd: 0.85, dur: 0.72, hitAt: 0.4, lunge: 0.8, sound: 'slam' },
    skills: [
      { id: 'stomp', name: '대지 강타', short: '강타', icon: '💥', key: 'K', cd: 8, desc: '땅을 내리쳐 반경 8m에 충격파를 일으키고 적을 기절시킵니다.' },
      { id: 'charge', name: '광폭 돌진', short: '돌진', icon: '🔥', key: 'L', cd: 10, desc: '앞으로 미친 듯이 돌진해 부딪히는 적을 날려버립니다.' },
    ],
    anim: { gaitAmp: 0.5, bob: 0.055, sway: 0.08, gaitRate: 1.35, tailAmp: 0.2, headBob: 0.04 },
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
    attack: { name: '기습 물기', short: '물기', range: 3.3, arc: 1.15, damage: 22, knock: 3.5, cd: 0.5, dur: 0.46, hitAt: 0.17, lunge: 2.0, sound: 'bite' },
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
  alpha: { build: (tint) => buildBoar(tint ?? 0x4b3a2c), hp: 165, speed: 4.7, damage: 20, scale: 1.35 },
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
