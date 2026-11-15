// 동물 모델 — 스윕/병합 조형 + 털·비늘 재질
import THREE from './three.js?v=20261115d';
import { merge, sweep, track, unitSphere, unitCone, unitBox, unitCyl, meshOf, vertexMaterial, TAU, shade } from './sculpt.js?v=20261115d';
import { furMaterial, scaleMaterial, skinMaterial } from './textures.js?v=20261115d';
import { clamp, lerp } from './util.js?v=20261115d';
import { buildLion as bLion, buildTiger as bTiger, buildCheetah as bCheetah, buildWolf as bWolf, buildBear as bBear, buildPolarBear as bPolar, buildElephant as bElephant, buildRhino as bRhino, buildShark as bShark, buildOrca as bOrca, buildOctopus as bOctopus, buildAnaconda as bAnaconda } from './beasts.js?v=20261115d';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = (r = 1, g = r, b = r) => new THREE.Color(r, g, b);
const WHITE = W(1);

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
    scale: [rx, ry, rz],
    color: o.color,
    colorFn: o.colorFn,
    keepColors: false,
  };
}

function conePart(rx, h, o = {}) {
  return {
    geo: unitCone(o.seg ?? 6),
    pos: o.pos,
    rot: o.rot,
    scale: [rx, h, o.rz ?? rx],
    color: o.color,
    colorFn: o.colorFn,
  };
}

// 털다발: 타원 표면에 가닥을 세워 실루엣을 푼다
function shardsAround(center, radii, count, o = {}) {
  const parts = [];
  const c = center.isVector3 ? center : V(...center);
  const base = o.color !== undefined ? new THREE.Color(o.color) : null;
  const tip = o.tip !== undefined ? new THREE.Color(o.tip) : null;
  for (let i = 0; i < count; i++) {
    const yy = 1 - ((i + 0.5) / count) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - yy * yy));
    const phi = i * 2.399963;
    const n = V(Math.cos(phi) * ring, yy, Math.sin(phi) * ring);
    if (o.skip && o.skip(n)) continue;
    const at = o.at ?? 0.92;
    const surface = c.clone().add(V(n.x * radii[0] * at, n.y * radii[1] * at, n.z * radii[2] * at));
    const lean = n
      .clone()
      .multiplyScalar(1 - (o.tilt ?? 0.35))
      .add(V(0, o.sagY ?? -0.25, o.sagZ ?? -0.3).multiplyScalar(o.tilt ?? 0.35))
      .normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), lean);
    const len = (o.len ?? 0.22) * (0.62 + Math.random() * 0.8);
    const w = (o.width ?? 0.05) * (0.7 + Math.random() * 0.7);
    const useCone = o.shape === 'cone';
    // 둥근 털뭉치: 표면에서 살짝 떠서 결을 따라 눕는다
    const pos = useCone ? surface : surface.clone().addScaledVector(lean, len * 0.42);
    const py = pos.y;
    const part = {
      geo: useCone ? unitCone(o.seg ?? 4) : unitSphere(o.seg ?? 6),
      quat: q,
      pos,
      scale: useCone ? [w, len, w * (o.flat ?? 0.6)] : [w * 0.62, len * 0.62, w * (o.flat ?? 0.62)],
    };
    if (base) {
      part.colorFn = tip
        ? (x, y) => base.clone().lerp(tip, clamp((y - py) / Math.max(0.02, len), 0, 1))
        : () => base;
    }
    parts.push(part);
  }
  return parts;
}

// ── 머리 ───────────────────────────────────────────────────
// cfg: { skull:[x,y,z], muzzle:{z0,z1,r0,r1,y0,y1,ry0,ry1, tint}, brow, cheeks,
//        nose:{w,h,d,y,z, color}, eyes:{x,y,z,r,iris,rim}, ears:{...}, jaw:{...} }
function makeHead(cfg, mats) {
  const head = new THREE.Group();
  const s = cfg.skull;
  const furParts = [];
  const lightParts = [];
  const detailParts = [];

  // 두개골 + 이마 + 볼
  furParts.push(sphPart(s[0], s[1], s[2], { seg: 16, colorFn: cfg.skullTint }));
  furParts.push(sphPart(s[0] * 0.8, s[1] * 0.46, s[2] * 0.6, { pos: [0, s[1] * 0.34, s[2] * 0.46], colorFn: cfg.skullTint }));
  for (const sd of [-1, 1]) {
    furParts.push(
      sphPart(s[0] * 0.5, s[1] * 0.44, s[2] * 0.52, {
        pos: [sd * s[0] * 0.56, -s[1] * 0.14, s[2] * 0.32],
        colorFn: cfg.cheekTint || cfg.skullTint,
      })
    );
  }

  // 주둥이
  const m = cfg.muzzle;
  const steps = 8;
  const sections = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sections.push({
      p: V(0, lerp(m.y0 ?? 0, m.y1 ?? -0.04, t), lerp(m.z0, m.z1, t)),
      rx: lerp(m.r0, m.r1, t),
      ry: lerp(m.r0 * (m.ry0 ?? 0.92), m.r1 * (m.ry1 ?? 0.88), t),
    });
  }
  const muzzleGeo = sweep(sections, {
    radial: 14,
    capStart: false,
    capEnd: true,
    colorFn: (p, d, t) => {
      const k = (m.tint ?? 1) * (1 + t * (m.tintTip ?? 0.1));
      return W(k, k, k);
    },
  });
  (m.light ? lightParts : furParts).push({ geo: muzzleGeo, keepColors: true });

  // 코
  const n = cfg.nose;
  detailParts.push(sphPart(n.w, n.h, n.d, { pos: [0, n.y, n.z], color: n.color, seg: 10 }));
  for (const sd of [-1, 1]) {
    detailParts.push(sphPart(n.w * 0.24, n.h * 0.22, n.d * 0.2, { pos: [sd * n.w * 0.42, n.y - n.h * 0.12, n.z + n.d * 0.72], color: 0x0a0806, seg: 6 }));
  }
  // 입술선
  detailParts.push(sphPart(m.r1 * 0.85, m.r1 * 0.12, m.r1 * 0.5, { pos: [0, (m.y1 ?? -0.04) - m.r1 * 0.42, m.z1 - m.r1 * 0.2], color: 0x1c1410, seg: 8 }));

  // 눈두덩 (털) + 눈
  const e = cfg.eyes;
  const eyeParts = [];
  for (const sd of [-1, 1]) {
    furParts.push(
      sphPart(s[0] * 0.34, s[1] * 0.2, s[2] * 0.26, {
        pos: [sd * e.x * 0.94, e.y + e.r * 0.9, e.z - e.r * 0.1],
        rot: [0, 0, sd * 0.2],
        colorFn: cfg.browTint || cfg.skullTint,
      })
    );
    // 눈꺼풀 테두리
    eyeParts.push(sphPart(e.r * 1.55, e.r * 1.4, e.r * 0.75, { pos: [sd * e.x, e.y, e.z - e.r * 0.15], color: cfg.eyes.rim, seg: 12 }));
    // 홍채
    eyeParts.push(sphPart(e.r, e.r * 0.96, e.r * 0.72, { pos: [sd * e.x, e.y, e.z], color: e.iris, seg: 12 }));
    // 동공
    eyeParts.push(sphPart(e.r * 0.34, e.r * 0.78, e.r * 0.4, { pos: [sd * e.x, e.y, e.z + e.r * 0.5], color: 0x080605, seg: 10 }));
    // 반사광
    eyeParts.push(sphPart(e.r * 0.2, e.r * 0.2, e.r * 0.12, { pos: [sd * e.x - sd * e.r * 0.3, e.y + e.r * 0.32, e.z + e.r * 0.62], color: 0xffffff, seg: 6 }));
  }

  const meshes = [];
  const furGeo = merge(furParts);
  meshes.push(meshWith(furGeo, mats.fur));
  if (lightParts.length) meshes.push(meshWith(merge(lightParts), mats.light || mats.fur));
  if (detailParts.length) meshes.push(meshWith(merge(detailParts), mats.plain));
  meshes.push(meshWith(merge(eyeParts), mats.eye));
  meshes.forEach((mm) => head.add(mm));

  // 턱
  const jaw = new THREE.Group();
  jaw.position.set(0, cfg.jaw?.y ?? -s[1] * 0.36, cfg.jaw?.z ?? s[2] * 0.2);
  jaw.rotation.x = cfg.jaw?.open ?? 0;
  head.add(jaw);
  const jawParts = [];
  jawParts.push(sphPart(m.r0 * 0.94, m.r0 * 0.5, (m.z1 - m.z0) * 0.62, {
    pos: [0, -m.r0 * 0.18, (m.z1 - m.z0) * 0.36],
    colorFn: cfg.jawTint || cfg.skullTint,
  }));
  jawParts.push(sphPart(m.r0 * 0.7, m.r0 * 0.34, m.r0 * 0.5, { pos: [0, -m.r0 * 0.1, (m.z1 - m.z0) * 0.72], colorFn: cfg.jawTint || cfg.skullTint }));
  jaw.add(meshWith(merge(jawParts), mats.jaw || mats.fur));

  // 이빨 / 혀
  if (cfg.teeth) {
    const tp = [];
    for (const sd of [-1, 1]) {
      tp.push(conePart(m.r1 * 0.16, m.r1 * 0.62, { pos: [sd * m.r1 * 0.5, m.r1 * 0.3, (m.z1 - m.z0) * 0.52], rot: [Math.PI, 0, 0], color: 0xf4ecd8, seg: 5 }));
      tp.push(conePart(m.r1 * 0.11, m.r1 * 0.4, { pos: [sd * m.r1 * 0.24, m.r1 * 0.22, (m.z1 - m.z0) * 0.68], rot: [Math.PI, 0, 0], color: 0xeee4cd, seg: 5 }));
    }
    jaw.add(meshWith(merge(tp), mats.plain));
  }
  let tongue = null;
  if (cfg.tongue) {
    tongue = new THREE.Group();
    tongue.position.set(0, m.r0 * 0.05, (m.z1 - m.z0) * 0.5);
    jaw.add(tongue);
    const tg = merge([
      sphPart(m.r0 * 0.42, m.r0 * 0.16, m.r0 * 0.7, { pos: [0, 0, m.r0 * 0.3], color: cfg.tongueColor ?? 0xa8505a }),
    ]);
    tongue.add(meshWith(tg, mats.plain));
  }

  // 귀
  const ears = [];
  const ec = cfg.ears;
  for (const sd of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sd * ec.x, ec.y, ec.z);
    ear.rotation.z = sd * (ec.out ?? -0.28);
    ear.rotation.x = ec.tilt ?? -0.1;
    ear.rotation.y = sd * (ec.yaw ?? 0.2);
    head.add(ear);
    const parts = [];
    if (ec.type === 'pointed') {
      parts.push(conePart(ec.r, ec.h, { pos: [0, 0, 0], rot: [0.1, 0, 0], colorFn: cfg.skullTint, seg: 8 }));
      parts.push(conePart(ec.r * 0.55, ec.h * 0.78, { pos: [0, ec.h * 0.06, ec.r * 0.36], rot: [0.1, 0, 0], color: ec.innerColor ?? 0x3a2a1e, seg: 6 }));
    } else {
      parts.push(sphPart(ec.r, ec.h ?? ec.r * 1.15, ec.r * 0.55, { pos: [0, ec.h ? ec.h * 0.3 : ec.r * 0.35, 0], colorFn: cfg.skullTint }));
      parts.push(sphPart(ec.r * 0.62, (ec.h ?? ec.r * 1.15) * 0.62, ec.r * 0.3, { pos: [0, (ec.h ? ec.h * 0.3 : ec.r * 0.35), ec.r * 0.34], color: ec.innerColor ?? 0x2e2018 }));
    }
    ear.add(meshWith(merge(parts), mats.fur));
    ears.push(ear);
  }

  return { head, jaw, ears, tongue };
}

// ── 다리 ───────────────────────────────────────────────────
function buildLeg(parent, o) {
  const hip = new THREE.Group();
  hip.position.set(o.x, o.y, o.z);
  parent.add(hip);

  const tint = o.tint || (() => WHITE);
  const mat = o.mat;

  // 위 마디
  const upSections = [
    { p: V(0, o.rTop * 1.15, 0.01), rx: o.rTop * 1.14, ry: o.rTop * 1.2 },
    { p: V(0, -o.upper * 0.5, o.front ? -0.012 : 0.014), rx: o.rTop * 0.99, ry: o.rTop * 1.0 },
    { p: V(0, -o.upper + 0.012, 0), rx: o.rMid * 1.12, ry: o.rMid * 1.16 },
  ];
  hip.add(meshWith(sweep(upSections, { radial: 10, capStart: true, colorFn: (p, d) => tint(p, d, true) }), mat));

  const knee = new THREE.Group();
  knee.position.y = -o.upper;
  hip.add(knee);
  const lowSections = [
    { p: V(0, 0.035, 0), rx: o.rMid * 1.04, ry: o.rMid * 1.08 },
    { p: V(0, -o.lower * 0.5, o.front ? 0.014 : -0.014), rx: o.rMid * 0.8, ry: o.rMid * 0.82 },
    { p: V(0, -o.lower + 0.012, 0), rx: o.rBot * 1.02, ry: o.rBot * 1.04 },
  ];
  knee.add(meshWith(sweep(lowSections, { radial: 10, capStart: true, colorFn: (p, d) => tint(p, d, false) }), mat));

  const ankle = new THREE.Group();
  ankle.position.y = -o.lower;
  knee.add(ankle);

  // 발목
  const pastern = sweep(
    [
      { p: V(0, 0.02, 0), rx: o.rBot * 1.0, ry: o.rBot * 1.02 },
      { p: V(0, -o.pastern * 0.55, 0.01), rx: o.rBot * 0.92, ry: o.rBot * 0.94 },
      { p: V(0, -o.pastern, 0), rx: o.rBot * 0.96, ry: o.rBot * 0.98 },
    ],
    { radial: 8, capStart: true, colorFn: (p, d) => tint(p, d, false) }
  );
  ankle.add(meshWith(pastern, mat));

  const paw = new THREE.Group();
  paw.position.set(0, -o.pastern, 0);
  ankle.add(paw);

  const pawParts = [];
  const pw = o.pawHalf;
  const pl = o.pawLen;
  const pawTint = (x, y, z, nx, ny, nz) => tint({ x, y, z }, { x: nx, y: ny, z: nz }, false);
  pawParts.push(sphPart(o.rBot * 1.5, pw, pl, { pos: [0, -pw * 0.62, pl * 0.24], colorFn: pawTint }));
  // 발가락
  const toes = o.toes ?? 4;
  for (let i = 0; i < toes; i++) {
    const tx = (i - (toes - 1) / 2) * o.rBot * 0.62;
    pawParts.push(sphPart(o.rBot * 0.5, pw * 0.8, o.rBot * 0.62, { pos: [tx, -pw * 0.72, pl * 0.82], colorFn: pawTint, seg: 10 }));
  }
  paw.add(meshWith(merge(pawParts), mat));

  if (o.claws) {
    const cp = [];
    for (let i = 0; i < toes; i++) {
      const tx = (i - (toes - 1) / 2) * o.rBot * 0.62;
      cp.push(
        conePart(o.rBot * 0.17, o.clawLen ?? 0.09, {
          pos: [tx, -pw * 0.78, pl * 1.02],
          rot: [Math.PI * 0.62, 0, 0],
          color: o.clawColor ?? 0xe8dfc8,
          seg: 5,
        })
      );
    }
    paw.add(meshWith(merge(cp), o.plain));
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

// ── 꼬리 ───────────────────────────────────────────────────
function buildTail(parent, o) {
  const tail = [];
  const segs = o.segs ?? 5;
  let parentBone = new THREE.Group();
  parentBone.position.set(0, o.y ?? 0.14, o.z);
  parent.add(parentBone);
  tail.push(parentBone);
  const mat = o.mat;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -o.len;
    parentBone.add(seg);
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const r0 = lerp(o.r0, o.r1, t0);
    const r1 = lerp(o.r0, o.r1, t1);
    const sections = [
      { p: V(0, 0, 0.02), rx: r0 * 1.06, ry: r0 * 1.06 },
      { p: V(0, 0, -o.len * 0.5), rx: (r0 + r1) * 0.5, ry: (r0 + r1) * 0.5 },
      { p: V(0, 0, -o.len - 0.02), rx: r1 * 1.02, ry: r1 * 1.02 },
    ];
    seg.add(meshWith(sweep(sections, { radial: 9, colorFn: (p, d, t) => o.tint ? o.tint(t0 + (t1 - t0) * t) : WHITE }), mat));
    if (o.fluff) {
      // 북슬북슬한 꼬리 — 가닥을 덧대 굵게
      const parts = shardsAround(V(0, 0, -o.len * 0.45), [r0 * 1.5, r0 * 1.5, o.len * 0.62], 12, {
        len: o.len * 1.15,
        width: r0 * 0.75,
        tilt: 0.1,
        sagY: -0.4,
        sagZ: -0.9,
        color: o.fluffColor,
        tip: o.fluffTip,
        flat: 0.7,
        seg: 4,
      });
      seg.add(meshWith(merge(parts), o.fluffMat || mat));
    }
    tail.push(seg);
    parentBone = seg;
  }
  if (o.tuft) {
    const last = tail[tail.length - 1];
    const parts = [];
    const L = o.tuft.len ?? 0.2;
    const R = o.tuft.r ?? 0.07;
    parts.push(sphPart(R, R * 1.05, L * 0.7, { pos: [0, 0, -L * 0.35], color: o.tuft.color }));
    parts.push(...shardsAround(V(0, 0, -L * 0.35), [R * 1.0, R * 1.0, L * 0.6], 18, {
      len: L,
      width: R * 0.55,
      tilt: 0.15,
      sagY: -0.6,
      sagZ: -0.9,
      color: o.tuft.color,
      tip: o.tuft.tip ?? o.tuft.color,
      flat: 0.7,
      seg: 4,
    }));
    last.add(meshWith(merge(parts), o.tuftMat || mat));
  }
  return tail;
}

// ── 사족 동물 조립 ──────────────────────────────────────────
function makeQuadruped(cfg) {
  const root = new THREE.Group();
  const rig = { form: 'quadruped' };
  const body = new THREE.Group();
  body.position.y = cfg.hipY;
  root.add(body);
  rig.body = body;
  rig.hipY = cfg.hipY;

  // 몸통 (한 덩어리 스윕)
  const prof = track(cfg.torso);
  const N = cfg.steps ?? 26;
  const radial = cfg.radial ?? 18;
  const sections = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const [z, y, rx, ry] = prof(t);
    sections.push({ p: V(0, y, z), rx, ry });
  }
  const torsoGeo = sweep(sections, {
    radial,
    capStart: true,
    capEnd: true,
    colorFn: (p, d, t) => cfg.torsoColor(t, d),
  });
  const torsoMesh = meshWith(torsoGeo, cfg.mat);
  body.add(torsoMesh);

  // 추가 몸통 덩어리 (어깨 혹, 허벅지 등)
  if (cfg.bodyExtras) {
    const extras = cfg.bodyExtras();
    if (extras.length) body.add(meshWith(merge(extras), cfg.mat));
  }

  // 목
  const neck = new THREE.Group();
  neck.position.set(0, cfg.neck.pos[1], cfg.neck.pos[2]);
  neck.rotation.x = cfg.neck.tilt;
  body.add(neck);
  rig.neck = neck;
  const nSec = [];
  const nSteps = 6;
  for (let i = 0; i <= nSteps; i++) {
    const t = i / nSteps;
    nSec.push({
      p: V(0, lerp(cfg.neck.y0, cfg.neck.y1, t), lerp(cfg.neck.z0 ?? 0, cfg.neck.z1 ?? 0, t)),
      rx: lerp(cfg.neck.r0, cfg.neck.r1, t),
      ry: lerp(cfg.neck.r0 * 1.04, cfg.neck.r1 * 1.04, t),
    });
  }
  neck.add(meshWith(sweep(nSec, { radial: 12, capStart: false, colorFn: cfg.torsoColor }), cfg.mat));

  // 머리 (뼈대 → 장착 회전 → 머리 본)
  const mount = new THREE.Group();
  mount.position.set(0, cfg.neck.headY, cfg.neck.headZ ?? 0);
  mount.rotation.x = cfg.headTilt ?? 0;
  neck.add(mount);
  const headParts = makeHead(cfg.head, cfg.mats);
  mount.add(headParts.head);
  rig.head = headParts.head;
  rig.headBase = headParts.head.position.clone();
  rig.jaw = headParts.jaw;
  rig.jawBase = headParts.jaw.rotation.x;
  rig.ears = headParts.ears;
  rig.tongue = headParts.tongue;

  // 꼬리
  rig.tail = buildTail(body, cfg.tail);
  rig.tailBase = rig.tail[0].position.clone();

  // 다리
  const legCfg = (l, front, inSide) => {
    const total = l.upper + l.lower + l.pastern + l.pawHalf;
    return buildLeg(body, {
      ...l,
      x: l.x,
      y: -(cfg.hipY - total),
      z: l.z,
      front,
      mat: cfg.mat,
      plain: cfg.mats.plain,
      tint: (p, d, upperLeg) => cfg.legColor(p, d, front, upperLeg, inSide),
      claws: l.claws,
      toes: l.toes,
      clawColor: cfg.clawColor,
      clawLen: l.clawLen,
    });
  };
  rig.legs = {
    fl: legCfg({ ...cfg.legs.front, x: -cfg.legSpread, z: cfg.legs.front.z }, true, 1),
    fr: legCfg({ ...cfg.legs.front, x: cfg.legSpread, z: cfg.legs.front.z }, true, -1),
    bl: legCfg({ ...cfg.legs.back, x: -cfg.legSpread * 1.06, z: cfg.legs.back.z }, false, 1),
    br: legCfg({ ...cfg.legs.back, x: cfg.legSpread * 1.06, z: cfg.legs.back.z }, false, -1),
  };

  // 동물별 추가 장식
  if (cfg.extras) cfg.extras({ body, neck, head: headParts.head, mount, rig, mats: cfg.mats });

  return { root, rig };
}

// ── 사자 ────────────────────────────────────────────────────
function buildLion() {
  const fur = furMaterial('lion-coat');
  const maneMat = furMaterial('lion-mane');
  const plain = vertexMaterial({ roughness: 0.72 });
  const eyeMat = vertexMaterial({ roughness: 0.22, metalness: 0.1 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 1.02,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.64, 0.02, 0.1, 0.12],
      [0.06, -0.58, 0.05, 0.25, 0.27],
      [0.18, -0.46, 0.07, 0.33, 0.34],
      [0.34, -0.24, 0.03, 0.31, 0.32],
      [0.52, -0.02, 0.0, 0.35, 0.36],
      [0.72, 0.22, 0.05, 0.39, 0.41],
      [0.88, 0.39, 0.1, 0.36, 0.39],
      [1.0, 0.5, 0.05, 0.25, 0.29],
    ],
    steps: 28,
    radial: 20,
    torsoColor: (t, d) => {
      // 등은 햇빛, 배는 밝은 크림
      if (d.y < -0.25) return W(1.3, 1.26, 1.2);
      if (d.y > 0.55) return W(1.02, 0.98, 0.94);
      return W(1.02, 1.0, 0.98);
    },
    legColor: (p, d, front, upperLeg, inSide) => {
      // 안쪽 다리는 밝게
      let k = 1.0;
      if (p.y < -0.18) k = 1.12;
      if (inSide && d.x * inSide > 0.15) k += 0.09;
      return W(k * 1.02, k, k * 0.95);
    },
    bodyExtras: () => {
      const parts = [];
      // 어깨 혹
      parts.push(sphPart(0.33, 0.24, 0.34, { pos: [0, 0.24, 0.24], colorFn: () => W(1.0, 0.96, 0.92) }));
      // 허벅지
      for (const s of [-1, 1]) {
        parts.push(sphPart(0.19, 0.24, 0.22, { pos: [s * 0.24, 0.02, -0.42], colorFn: () => W(1.0) }));
      }
      return parts;
    },
    legSpread: 0.245,
    legs: {
      front: { upper: 0.45, lower: 0.4, pastern: 0.12, rTop: 0.145, rMid: 0.1, rBot: 0.078, pawHalf: 0.055, pawLen: 0.2, z: 0.3, toes: 4, claws: false },
      back: { upper: 0.47, lower: 0.42, pastern: 0.08, rTop: 0.19, rMid: 0.115, rBot: 0.08, pawHalf: 0.055, pawLen: 0.21, z: -0.4, toes: 4, claws: false },
    },
    neck: { pos: [0, 0.16, 0.43], tilt: 0.4, y0: -0.06, y1: 0.24, z0: 0, z1: 0.02, r0: 0.26, r1: 0.2, headY: 0.27, headZ: 0.0 },
    headTilt: -0.62,
    head: {
      skull: [0.25, 0.235, 0.27],
      skullTint: () => W(1.04, 1.0, 0.94),
      cheekTint: () => W(1.12, 1.08, 1.0),
      muzzle: { z0: 0.14, z1: 0.4, r0: 0.155, r1: 0.105, y0: -0.04, y1: -0.075, tint: 1.16, tintTip: 0.16, ry0: 0.9, ry1: 0.82 },
      nose: { w: 0.07, h: 0.045, d: 0.055, y: -0.1, z: 0.42, color: 0x17100c },
      eyes: { x: 0.13, y: 0.05, z: 0.17, r: 0.038, iris: 0xb8801f, rim: 0x2a1b10 },
      ears: { type: 'round', x: 0.155, y: 0.185, z: -0.04, r: 0.075, h: 0.08, out: -0.35, tilt: -0.15, yaw: 0.25, innerColor: 0x4a2f1b },
      teeth: true,
      tongue: true,
      jaw: { y: -0.08, z: 0.08, open: 0.02 },
    },
    tail: { z: -0.66, y: 0.18, segs: 5, len: 0.16, r0: 0.068, r1: 0.042, mat: fur, tint: (t) => W(0.98 + t * 0.06) },
    extras: ({ body, neck, rig }) => {
      // ── 갈기 ──
      // 1) 어깨를 덮는 두꺼운 갈기 망토 (몸통에 붙는다)
      const capeVol = [];
      capeVol.push(sphPart(0.42, 0.36, 0.3, { pos: [0, 0.1, 0.22], colorFn: () => W(1.0, 0.94, 0.86) }));
      capeVol.push(sphPart(0.34, 0.3, 0.24, { pos: [0, -0.06, 0.3], colorFn: () => W(0.98, 0.92, 0.86) }));
      capeVol.push(sphPart(0.3, 0.26, 0.2, { pos: [0, 0.22, 0.3], colorFn: () => W(1.02, 0.96, 0.9) }));
      const capeShards = shardsAround(V(0, 0.06, 0.24), [0.44, 0.38, 0.3], 92, {
        len: 0.19,
        width: 0.105,
        tilt: 0.66,
        sagY: -0.45,
        sagZ: -0.8,
        color: W(0.78, 0.74, 0.7),
        tip: W(1.16, 1.08, 0.98),
        seg: 6,
        skip: (nrm) => nrm.z > 0.45 && nrm.y < 0.35,
      });
      body.add(meshWith(merge(capeVol.concat(capeShards)), maneMat));

      // 2) 얼굴 테두리 갈기 (목뼈에 붙어 머리와 함께 움직인다) — 밝은 금빛
      const faceVol = [];
      faceVol.push(sphPart(0.33, 0.32, 0.24, { pos: [0, 0.03, 0.05], colorFn: () => W(1.12, 1.04, 0.92) }));
      const faceShards = shardsAround(V(0, 0.03, 0.06), [0.33, 0.31, 0.25], 56, {
        len: 0.16,
        width: 0.095,
        tilt: 0.55,
        sagY: -0.4,
        sagZ: -0.7,
        color: W(0.92, 0.88, 0.8),
        tip: W(1.26, 1.18, 1.04),
        seg: 6,
        skip: (nrm) => nrm.z > 0.5,
      });
      neck.add(meshWith(merge(faceVol.concat(faceShards)), fur));

      // 3) 가슴·배 아래로 흐르는 갈기
      const chest = [];
      chest.push(sphPart(0.26, 0.22, 0.2, { pos: [0, -0.14, 0.34], colorFn: () => W(0.96, 0.9, 0.84) }));
      chest.push(...shardsAround(V(0, -0.12, 0.34), [0.27, 0.24, 0.2], 30, {
        len: 0.2,
        width: 0.085,
        tilt: 0.7,
        sagY: -1.1,
        sagZ: -0.1,
        color: W(0.8, 0.76, 0.72),
        tip: W(1.12, 1.05, 0.96),
        seg: 6,
      }));
      chest.push(...shardsAround(V(0, -0.28, 0.12), [0.26, 0.13, 0.34], 20, {
        len: 0.16,
        width: 0.07,
        tilt: 0.75,
        sagY: -1.2,
        sagZ: 0.1,
        color: W(0.82, 0.78, 0.74),
        tip: W(1.1, 1.04, 0.96),
        seg: 6,
        skip: (nrm) => nrm.y > 0.2,
      }));
      body.add(meshWith(merge(chest), maneMat));

      // 4) 꼬리 끝 검은 술
      const last = rig.tail[rig.tail.length - 1];
      const tuft = [];
      tuft.push(sphPart(0.065, 0.07, 0.1, { pos: [0, 0, -0.13], color: 0x2a1a0d }));
      tuft.push(...shardsAround(V(0, 0, -0.14), [0.06, 0.06, 0.08], 14, {
        len: 0.15,
        width: 0.055,
        tilt: 0.5,
        sagY: -0.9,
        sagZ: -1.0,
        color: W(0.86, 0.84, 0.82),
        tip: W(1.12, 1.06, 1.0),
        seg: 6,
      }));
      last.add(meshWith(merge(tuft), maneMat));

      // 5) 팔꿈치 털
      for (const key of ['fl', 'fr']) {
        const parts = shardsAround(V(0, 0, 0), [0.1, 0.1, 0.09], 7, {
          len: 0.12,
          width: 0.05,
          tilt: 0.6,
          sagY: -1,
          sagZ: -0.3,
          color: W(0.9, 0.86, 0.82),
          tip: W(1.14, 1.08, 1.0),
          seg: 6,
          skip: (nrm) => nrm.z > 0.4,
        });
        const m = meshWith(merge(parts), maneMat);
        m.position.set(0, -0.34, -0.04);
        rig.legs[key].knee.add(m);
      }
    },
  });

  return { root, rig };
}

// ── 늑대 ────────────────────────────────────────────────────
function buildWolf() {
  const fur = furMaterial('wolf-coat');
  const cream = furMaterial('wolf-cream');
  const plain = vertexMaterial({ roughness: 0.72 });
  const eyeMat = vertexMaterial({ roughness: 0.2, metalness: 0.1 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 0.95,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.72, 0.04, 0.12, 0.13],
      [0.07, -0.64, 0.06, 0.24, 0.25],
      [0.2, -0.5, 0.06, 0.27, 0.28],
      [0.36, -0.28, 0.02, 0.24, 0.26],
      [0.55, -0.02, 0.0, 0.27, 0.29],
      [0.75, 0.24, 0.03, 0.3, 0.33],
      [0.9, 0.42, 0.06, 0.26, 0.29],
      [1.0, 0.52, 0.03, 0.17, 0.2],
    ],
    steps: 28,
    radial: 18,
    torsoColor: (t, d) => {
      // 등은 어두운 안장, 배는 크림
      if (d.y < -0.35) return W(1.34, 1.3, 1.18);
      if (d.y > 0.55) return W(0.72, 0.72, 0.72);
      if (d.y > 0.2) return W(0.86, 0.86, 0.86);
      return W(1.0);
    },
    legColor: (p, d, front, upperLeg) => {
      const low = p.y < -0.2 ? 1.2 : 1.0;
      return W(low, low * 0.99, low * 0.92);
    },
    legSpread: 0.17,
    legs: {
      front: { upper: 0.4, lower: 0.36, pastern: 0.11, rTop: 0.082, rMid: 0.058, rBot: 0.048, pawHalf: 0.042, pawLen: 0.14, z: 0.3, toes: 4 },
      back: { upper: 0.43, lower: 0.38, pastern: 0.09, rTop: 0.115, rMid: 0.062, rBot: 0.05, pawHalf: 0.042, pawLen: 0.15, z: -0.42, toes: 4 },
    },
    neck: { pos: [0, 0.13, 0.46], tilt: 0.52, y0: -0.08, y1: 0.28, r0: 0.17, r1: 0.125, headY: 0.3, headZ: 0.04 },
    headTilt: -0.74,
    head: {
      skull: [0.185, 0.175, 0.21],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.24, 1.22, 1.12),
      muzzle: { z0: 0.1, z1: 0.42, r0: 0.095, r1: 0.058, y0: -0.01, y1: -0.03, tint: 1.05, tintTip: 0.2, ry0: 0.92, ry1: 0.86 },
      nose: { w: 0.045, h: 0.032, d: 0.035, y: -0.045, z: 0.435, color: 0x191819 },
      eyes: { x: 0.095, y: 0.05, z: 0.12, r: 0.032, iris: 0xd8a02a, rim: 0x2c2418 },
      ears: { type: 'pointed', x: 0.11, y: 0.16, z: -0.03, r: 0.062, h: 0.2, out: -0.24, tilt: -0.05, yaw: 0.1, innerColor: 0x3a2c22 },
      teeth: true,
      tongue: true,
      jaw: { y: -0.07, z: 0.06, open: 0.02 },
    },
    tail: { z: -0.74, y: 0.12, segs: 5, len: 0.17, r0: 0.09, r1: 0.055, mat: fur, fluff: true, fluffColor: W(1.08, 1.06, 1.02), fluffTip: W(1.25, 1.22, 1.16), fluffMat: fur, tint: (t) => W(1.0 - t * 0.06) },
    extras: ({ body, neck, head, rig }) => {
      // 목덜미 러프 (크림 + 회색)
      const creamParts = [];
      const greyParts = [];
      creamParts.push(sphPart(0.19, 0.2, 0.17, { pos: [0, -0.05, 0.1], colorFn: () => W(1.08, 1.05, 1.0) }));
      creamParts.push(...shardsAround(V(0, -0.04, 0.12), [0.23, 0.22, 0.2], 34, {
        len: 0.19,
        width: 0.045,
        tilt: 0.25,
        sagY: -0.7,
        sagZ: -0.4,
        color: W(0.96, 0.94, 0.9),
        tip: W(1.14, 1.1, 1.04),
        flat: 0.8,
        seg: 4,
        skip: (nrm) => nrm.y > 0.35 || nrm.z < -0.2,
      }));
      greyParts.push(...shardsAround(V(0, 0.02, 0.04), [0.24, 0.23, 0.22], 26, {
        len: 0.17,
        width: 0.045,
        tilt: 0.2,
        sagY: -0.4,
        sagZ: -0.6,
        color: W(0.82, 0.82, 0.82),
        tip: W(1.16, 1.15, 1.12),
        flat: 0.8,
        seg: 4,
        skip: (nrm) => nrm.y < -0.1 || nrm.z > 0.4,
      }));
      neck.add(meshWith(merge(greyParts), fur));
      neck.add(meshWith(merge(creamParts), cream));

      // 가슴 크림 패치
      const chest = [
        sphPart(0.24, 0.2, 0.16, { pos: [0, -0.1, 0.42], colorFn: () => W(1.05, 1.02, 0.95) }),
        sphPart(0.2, 0.12, 0.3, { pos: [0, -0.22, 0.28], colorFn: () => W(1.02, 1.0, 0.94) }),
      ];
      body.add(meshWith(merge(chest), cream));

      // 볼 털
      for (const sd of [-1, 1]) {
        const parts = shardsAround(V(sd * 0.14, -0.03, 0.06), [0.1, 0.11, 0.09], 10, {
          len: 0.12,
          width: 0.03,
          tilt: 0.4,
          sagY: -0.6,
          sagZ: 0.1,
          color: W(0.96, 0.94, 0.9),
          tip: W(1.12, 1.1, 1.05),
          flat: 0.8,
          seg: 4,
          skip: (nrm) => nrm.x * sd < 0.1,
        });
        head.add(meshWith(merge(parts), cream));
      }
    },
  });

  return { root, rig };
}

// ── 곰 ──────────────────────────────────────────────────────
function buildBear() {
  const fur = furMaterial('bear-coat');
  const light = furMaterial('bear-light');
  const plain = vertexMaterial({ roughness: 0.7 });
  const eyeMat = vertexMaterial({ roughness: 0.2, metalness: 0.1 });
  const mats = { fur, light, plain, eye: eyeMat, jaw: light };

  const { root, rig } = makeQuadruped({
    hipY: 0.9,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.58, 0.06, 0.2, 0.22],
      [0.08, -0.5, 0.08, 0.36, 0.37],
      [0.24, -0.34, 0.03, 0.42, 0.42],
      [0.44, -0.1, 0.0, 0.45, 0.45],
      [0.64, 0.16, 0.05, 0.48, 0.49],
      [0.8, 0.34, 0.11, 0.47, 0.5],
      [0.92, 0.44, 0.1, 0.4, 0.44],
      [1.0, 0.5, 0.02, 0.28, 0.32],
    ],
    steps: 28,
    radial: 20,
    torsoColor: (t, d) => {
      // 어깨·등 윗면은 햇빛에 밝은 황갈색
      if (d.y > 0.35) {
        const k = 1.06 + clamp((t - 0.4) * 1.1, 0, 0.34);
        return W(k, k * 0.99, k * 0.94);
      }
      if (d.y < -0.3) return W(0.98, 0.96, 0.94);
      return W(1.0);
    },
    legColor: (p, d, front, upperLeg) => {
      const k = p.y < -0.2 ? 1.06 : 1.0;
      return W(k, k * 0.98, k * 0.94);
    },
    bodyExtras: () => {
      const parts = [];
      // 등 혹 — 곰의 상징
      parts.push(sphPart(0.36, 0.27, 0.36, { pos: [0, 0.34, 0.18], colorFn: () => W(1.22, 1.18, 1.08) }));
      // 볼록한 어깨 근육
      for (const s of [-1, 1]) {
        parts.push(sphPart(0.22, 0.26, 0.24, { pos: [s * 0.3, 0.2, 0.26], colorFn: () => W(1.1, 1.07, 1.0) }));
        parts.push(sphPart(0.24, 0.26, 0.26, { pos: [s * 0.3, 0.04, -0.34], colorFn: () => W(1.0) }));
      }
      return parts;
    },
    legSpread: 0.31,
    legs: {
      front: { upper: 0.34, lower: 0.29, pastern: 0.11, rTop: 0.155, rMid: 0.115, rBot: 0.09, pawHalf: 0.06, pawLen: 0.24, z: 0.3, toes: 5, claws: true, clawLen: 0.12 },
      back: { upper: 0.36, lower: 0.31, pastern: 0.1, rTop: 0.19, rMid: 0.125, rBot: 0.095, pawHalf: 0.06, pawLen: 0.25, z: -0.36, toes: 5, claws: true, clawLen: 0.12 },
    },
    clawColor: 0xe6dcc4,
    neck: { pos: [0, 0.2, 0.4], tilt: 0.34, y0: -0.08, y1: 0.24, r0: 0.3, r1: 0.22, headY: 0.26, headZ: 0.04 },
    headTilt: -0.46,
    head: {
      skull: [0.3, 0.27, 0.29],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.06, 1.03, 0.98),
      muzzle: { z0: 0.16, z1: 0.4, r0: 0.155, r1: 0.115, y0: -0.05, y1: -0.075, tint: 1.0, light: true, ry0: 0.88, ry1: 0.8 },
      nose: { w: 0.075, h: 0.05, d: 0.05, y: -0.09, z: 0.42, color: 0x18100c },
      eyes: { x: 0.14, y: 0.06, z: 0.16, r: 0.034, iris: 0x6b4413, rim: 0x2a1c10 },
      ears: { type: 'round', x: 0.19, y: 0.22, z: -0.02, r: 0.072, h: 0.075, out: -0.5, tilt: -0.1, yaw: 0.3, innerColor: 0x3a2418 },
      teeth: true,
      tongue: true,
      jaw: { y: -0.1, z: 0.08, open: 0.02 },
    },
    tail: { z: -0.6, y: 0.14, segs: 2, len: 0.1, r0: 0.075, r1: 0.05, mat: fur, tint: () => W(0.95) },
    extras: ({ body, neck, head, rig }) => {
      // 목덜미 긴 털
      const neckFur = shardsAround(V(0, 0.0, 0.06), [0.32, 0.3, 0.28], 40, {
        len: 0.24,
        width: 0.075,
        tilt: 0.3,
        sagY: -0.5,
        sagZ: -0.3,
        color: W(0.88, 0.85, 0.82),
        tip: W(1.2, 1.14, 1.04),
        flat: 0.8,
        seg: 4,
        skip: (nrm) => nrm.z > 0.5,
      });
      neck.add(meshWith(merge(neckFur), fur));

      // 옆구리·허리 털
      const flank = [];
      for (const sd of [-1, 1]) {
        flank.push(...shardsAround(V(sd * 0.3, 0.08, -0.05), [0.2, 0.26, 0.44], 20, {
          len: 0.2,
          width: 0.06,
          tilt: 0.45,
          sagY: -0.9,
          sagZ: 0.2,
          color: W(0.9, 0.87, 0.83),
          tip: W(1.18, 1.12, 1.04),
          flat: 0.8,
          seg: 4,
          skip: (nrm) => nrm.x * sd < 0.25,
        }));
      }
      flank.push(...shardsAround(V(0, 0.3, 0.18), [0.34, 0.24, 0.32], 22, {
        len: 0.2,
        width: 0.06,
        tilt: 0.3,
        sagY: -0.2,
        sagZ: 0.5,
        color: W(1.02, 0.98, 0.92),
        tip: W(1.3, 1.24, 1.14),
        flat: 0.8,
        seg: 4,
        skip: (nrm) => nrm.y < 0.2,
      }));
      body.add(meshWith(merge(flank), fur));

      // 턱 밑 털
      const chin = shardsAround(V(0, -0.1, 0.16), [0.2, 0.14, 0.2], 16, {
        len: 0.13,
        width: 0.045,
        tilt: 0.5,
        sagY: -1,
        sagZ: 0.2,
        color: W(0.96, 0.95, 0.92),
        tip: W(1.1, 1.08, 1.04),
        flat: 0.8,
        seg: 4,
        skip: (nrm) => nrm.y > 0.2,
      });
      head.add(meshWith(merge(chin), light));
    },
  });

  return { root, rig };
}

// ── 아나콘다 ────────────────────────────────────────────────
function buildAnaconda() {
  const skin = scaleMaterial();
  const plain = vertexMaterial({ roughness: 0.6 });
  const eyeMat = vertexMaterial({ roughness: 0.15, metalness: 0.2 });
  const mats = { fur: skin, light: skin, plain, eye: eyeMat, jaw: skin };

  const rig = { form: 'serpent' };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, 0.36, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = 0.36;

  const SEG = 16;
  const SEG_LEN = 0.27;
  const OVER = 0.05;
  const total = SEG * SEG_LEN;
  // 굵기: 머리 뒤에서 가장 두껍고 꼬리로 갈수록 가늘게
  const radiusAt = (d) => {
    const t = clamp(d / total, 0, 1);
    const head = 0.235;
    const peak = 0.33;
    const k = Math.min(1, t / 0.16);
    const r = lerp(head, peak, Math.sin(k * Math.PI * 0.5));
    return lerp(r, 0.032, Math.pow(clamp((t - 0.12) / 0.88, 0, 1), 0.82));
  };
  const uvFor = (p, t, a, dOffset, segLen) => [a / TAU, (dOffset + t * segLen) / 1.05];

  const spine = [];
  let parent = body;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? 0.86 : -SEG_LEN);
    parent.add(seg);
    const d0 = i * SEG_LEN;
    const steps = 5;
    const sections = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const d = d0 - OVER + t * (SEG_LEN + OVER * 2);
      const r = radiusAt(d);
      // 몸이 땅에 닿는 느낌: 아래쪽을 살짝 눌러 타원 단면
      sections.push({ p: V(0, 0, (SEG_LEN - OVER) * 1 - t * (SEG_LEN + OVER * 2)), rx: r * 1.12, ry: r * 0.9 });
    }
    const geo = sweep(sections, {
      radial: 16,
      capStart: i === 0,
      capEnd: i === SEG - 1,
      uv: (p, t, a) => uvFor(p, t, a, d0 - OVER, SEG_LEN + OVER * 2),
      colorFn: () => W(1),
    });
    const m = meshWith(geo, skin);
    seg.add(m);
    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;

  // 꼬리 끝
  const tip = meshWith(
    merge([conePart(0.045, 0.2, { pos: [0, 0, -0.12], rot: [-Math.PI / 2, 0, 0], color: 0x1a2114 })]),
    plain
  );
  spine[spine.length - 1].add(tip);

  // 머리 (뼈대 → 장착 회전)
  const headBase = new THREE.Group();
  headBase.position.set(0, 0.06, 0.98);
  headBase.rotation.x = -0.82;
  body.add(headBase);
  rig.neck = headBase;
  rig.neckBase = headBase.rotation.x;

  const head = new THREE.Group();
  head.position.set(0, 0.06, -0.02);
  headBase.add(head);
  rig.head = head;
  rig.headBase = head.position.clone();

  // 머리통: 납작하고 넓은 쐐기형 (스윕)
  const hSections = [];
  const hSteps = 8;
  for (let i = 0; i <= hSteps; i++) {
    const t = i / hSteps;
    hSections.push({
      p: V(0, lerp(0.0, -0.025, t), lerp(0.02, 0.4, t)),
      rx: lerp(0.2, 0.115, Math.pow(t, 0.75)),
      ry: lerp(0.115, 0.075, Math.pow(t, 0.8)),
    });
  }
  const headGeo = sweep(hSections, {
    radial: 16,
    capStart: true,
    capEnd: true,
    uv: (p, t, a) => [a / TAU, 0.1 + t * 0.32],
    colorFn: () => W(1),
  });
  head.add(meshWith(headGeo, skin));

  // 눈두덩 + 눈 (머리 위쪽)
  const topParts = [];
  const eyeParts = [];
  for (const sd of [-1, 1]) {
    topParts.push(sphPart(0.075, 0.055, 0.1, { pos: [sd * 0.115, 0.06, 0.17], colorFn: () => W(0.85, 0.85, 0.85) }));
    eyeParts.push(sphPart(0.038, 0.034, 0.03, { pos: [sd * 0.125, 0.072, 0.18], color: 0xcfa227, seg: 12 }));
    eyeParts.push(sphPart(0.014, 0.026, 0.012, { pos: [sd * 0.128, 0.074, 0.2], color: 0x0d0f08, seg: 8 }));
    // 콧구멍
    topParts.push(sphPart(0.014, 0.012, 0.016, { pos: [sd * 0.045, 0.055, 0.38], color: 0x10160c, seg: 6 }));
  }
  head.add(meshWith(merge(topParts), skin));
  head.add(meshWith(merge(eyeParts), eyeMat));

  // 아래턱
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.055, 0.06);
  head.add(jaw);
  rig.jaw = jaw;
  rig.jawBase = 0;
  const jawGeo = merge([
    sphPart(0.14, 0.055, 0.19, { pos: [0, -0.01, 0.13], colorFn: () => W(1.05, 1.05, 1.0) }),
  ]);
  jaw.add(meshWith(jawGeo, skin));

  // 두 갈래 혀
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.02, 0.34);
  head.add(tongue);
  rig.tongue = tongue;
  const tg = [];
  tg.push(sphPart(0.024, 0.012, 0.11, { pos: [0, 0, 0.05], color: 0x9c2f3a }));
  for (const sd of [-1, 1]) {
    tg.push(sphPart(0.012, 0.01, 0.09, { pos: [sd * 0.028, 0, 0.17], rot: [0, sd * 0.34, 0], color: 0xc04452 }));
  }
  tongue.add(meshWith(merge(tg), plain));
  tongue.scale.z = 0.001;

  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.extras = [];
  return { root, rig };
}

// ── 멧돼지 (적) ─────────────────────────────────────────────
function buildBoar(tintHex) {
  const fur = furMaterial('boar-coat');
  const plain = vertexMaterial({ roughness: 0.7 });
  const eyeMat = vertexMaterial({ roughness: 0.2, metalness: 0.1 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };
  const T = tintHex ? new THREE.Color(tintHex) : null;
  // 틴트는 어두운 색을 곱해 개체 차이를 준다
  const tintMul = T ? () => W(0.62, 0.56, 0.5) : () => W(1);

  const { root, rig } = makeQuadruped({
    hipY: 0.62,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.42, 0.02, 0.16, 0.17],
      [0.1, -0.34, 0.04, 0.27, 0.28],
      [0.3, -0.16, 0.0, 0.29, 0.3],
      [0.55, 0.04, -0.02, 0.3, 0.31],
      [0.78, 0.2, 0.02, 0.29, 0.3],
      [0.92, 0.3, 0.02, 0.25, 0.27],
      [1.0, 0.34, -0.02, 0.19, 0.21],
    ],
    steps: 20,
    radial: 16,
    torsoColor: (t, d) => {
      const k = d.y > 0.4 ? 0.9 : d.y < -0.3 ? 1.1 : 1.0;
      return W(k * (T ? 0.8 : 1), k * (T ? 0.74 : 1), k * (T ? 0.66 : 1));
    },
    legColor: (p, d) => {
      const k = p.y < -0.12 ? 0.9 : 1.0;
      return W(k * (T ? 0.8 : 1), k * (T ? 0.74 : 1), k * (T ? 0.66 : 1));
    },
    legSpread: 0.2,
    legs: {
      front: { upper: 0.22, lower: 0.18, pastern: 0.07, rTop: 0.075, rMid: 0.05, rBot: 0.042, pawHalf: 0.032, pawLen: 0.1, z: 0.24, toes: 4 },
      back: { upper: 0.23, lower: 0.19, pastern: 0.07, rTop: 0.085, rMid: 0.052, rBot: 0.043, pawHalf: 0.032, pawLen: 0.1, z: -0.28, toes: 4 },
    },
    neck: { pos: [0, 0.04, 0.3], tilt: 0.2, y0: -0.06, y1: 0.1, r0: 0.2, r1: 0.17, headY: 0.12, headZ: 0.02 },
    headTilt: -0.2,
    head: {
      skull: [0.19, 0.18, 0.2],
      skullTint: () => W(T ? 0.8 : 1, T ? 0.74 : 1, T ? 0.66 : 1),
      cheekTint: () => W(T ? 0.9 : 1.02, T ? 0.84 : 1, T ? 0.75 : 0.96),
      muzzle: { z0: 0.1, z1: 0.3, r0: 0.11, r1: 0.085, y0: -0.03, y1: -0.06, tint: T ? 1.2 : 1.06, ry0: 0.9, ry1: 0.8 },
      nose: { w: 0.07, h: 0.04, d: 0.03, y: -0.07, z: 0.31, color: 0x3a2a24 },
      eyes: { x: 0.11, y: 0.05, z: 0.1, r: 0.028, iris: 0xd8342a, rim: 0x3a1a14 },
      ears: { type: 'pointed', x: 0.12, y: 0.14, z: -0.02, r: 0.05, h: 0.1, out: -0.7, tilt: 0.1, yaw: 0.3, innerColor: 0x3a2a20 },
      teeth: false,
      tongue: false,
      jaw: { y: -0.06, z: 0.05, open: 0.0 },
    },
    tail: { z: -0.44, y: 0.12, segs: 2, len: 0.06, r0: 0.03, r1: 0.02, mat: fur, tint: () => W(0.9) },
    extras: ({ body, head, rig }) => {
      // 등 강모
      const bristles = [];
      for (let i = 0; i < 12; i++) {
        bristles.push(conePart(0.014, 0.13, { pos: [(Math.random() - 0.5) * 0.16, 0.24, 0.34 - i * 0.06], rot: [-0.5 + (Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.3], color: W(0.55, 0.5, 0.45), seg: 4 }));
      }
      body.add(meshWith(merge(bristles), fur));
      // 엄니
      const tusks = [];
      for (const sd of [-1, 1]) {
        tusks.push(conePart(0.028, 0.19, { pos: [sd * 0.1, -0.06, 0.26], rot: [-1.05, 0, sd * 0.3], color: 0xe8dfc8, seg: 6 }));
      }
      head.add(meshWith(merge(tusks), plain));
      // 눈 광채
      for (const sd of [-1, 1]) {
        const glow = sphPart(0.03, 0.03, 0.014, { pos: [sd * 0.105, 0.05, 0.12], color: 0xff3a24 });
        head.add(meshWith(merge([glow]), vertexMaterial({ roughness: 0.3, emissive: 0xff2200, emissiveIntensity: 1.6 })));
      }
    },
  });

  return { root, rig };
}


// ══════════════════════════════════════════════════════════
//  추가 동물들 — 같은 조형 도구를 설정만 바꿔 재사용한다
// ══════════════════════════════════════════════════════════

// 납작한 지느러미/귀 (삼각 판)
function finPart(w, h, d, colorOpts = {}) {
  return {
    geo: unitCone(3),
    pos: colorOpts.pos,
    rot: colorOpts.rot,
    scale: [w, h, d],
    color: colorOpts.color,
    colorFn: colorOpts.colorFn,
  };
}

// 곡선 관 (코끼리 코 등) — points: [[x,y,z,r], ...]
function curvedTube(points, radial = 10, colorFn) {
  const sections = points.map(([x, y, z, r]) => ({ p: V(x, y, z), rx: r, ry: r * 0.95 }));
  return sweep(sections, { radial, capStart: true, capEnd: true, colorFn });
}

// ── 아프리카 코끼리 ─────────────────────────────────────────
function buildElephant() {
  const fur = furMaterial('elephant-hide');
  const plain = vertexMaterial({ roughness: 0.62 });
  const eyeMat = vertexMaterial({ roughness: 0.22, metalness: 0.1 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 1.48,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.92, 0.06, 0.28, 0.3],
      [0.08, -0.82, 0.12, 0.46, 0.48],
      [0.24, -0.6, 0.06, 0.56, 0.56],
      [0.46, -0.24, -0.02, 0.6, 0.6],
      [0.68, 0.16, 0.02, 0.62, 0.62],
      [0.84, 0.44, 0.1, 0.56, 0.58],
      [1.0, 0.62, 0.02, 0.4, 0.44],
    ],
    steps: 28,
    radial: 20,
    torsoColor: (t, d) => {
      if (d.y < -0.3) return W(1.05, 1.03, 1.0);
      if (d.y > 0.5) return W(0.98, 0.96, 0.92);
      return W(1.0);
    },
    legColor: (p, d) => {
      const k = p.y < -0.3 ? 1.04 : 1.0;
      return W(k, k * 0.99, k * 0.96);
    },
    bodyExtras: () => [
      sphPart(0.4, 0.36, 0.4, { pos: [0, 0.3, 0.42], colorFn: () => W(1.02, 1.0, 0.96) }),
      sphPart(0.34, 0.34, 0.34, { pos: [0, 0.16, -0.62], colorFn: () => W(0.98, 0.96, 0.92) }),
    ],
    legSpread: 0.34,
    legs: {
      front: { upper: 0.52, lower: 0.44, pastern: 0.18, rTop: 0.27, rMid: 0.2, rBot: 0.16, pawHalf: 0.11, pawLen: 0.28, z: 0.42, toes: 4 },
      back: { upper: 0.54, lower: 0.46, pastern: 0.16, rTop: 0.3, rMid: 0.21, rBot: 0.17, pawHalf: 0.11, pawLen: 0.28, z: -0.58, toes: 4 },
    },
    neck: { pos: [0, 0.28, 0.6], tilt: 0.1, y0: -0.12, y1: 0.16, r0: 0.44, r1: 0.34, headY: 0.2, headZ: 0.02 },
    headTilt: 0.06,
    head: {
      skull: [0.42, 0.4, 0.42],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.03, 1.01, 0.98),
      muzzle: { z0: 0.2, z1: 0.36, r0: 0.24, r1: 0.2, y0: -0.06, y1: -0.12, tint: 1.02, ry0: 0.9, ry1: 0.86 },
      nose: { w: 0.06, h: 0.04, d: 0.03, y: -0.16, z: 0.36, color: 0x4a413a },
      eyes: { x: 0.24, y: 0.02, z: 0.28, r: 0.036, iris: 0x3d2a16, rim: 0x4a4038 },
      ears: { type: 'round', x: 0.34, y: 0.2, z: -0.04, r: 0.02, h: 0.02, out: 0, tilt: 0, yaw: 0, innerColor: 0x6a6058 },
      teeth: false,
      tongue: false,
      jaw: { y: -0.14, z: 0.12, open: 0.02 },
    },
    tail: { z: -0.94, y: 0.16, segs: 2, len: 0.1, r0: 0.05, r1: 0.03, mat: fur, tint: () => W(0.95) },
    extras: ({ head, rig }) => {
      // 큰 귀 — 납작한 판, 머리에 붙어 펄럭인다
      for (const sd of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(sd * 0.36, 0.06, -0.02);
        ear.rotation.z = sd * -0.25;
        ear.rotation.y = sd * 0.35;
        head.add(ear);
        const parts = [];
        parts.push(sphPart(0.3, 0.36, 0.05, { pos: [sd * 0.24, 0.06, 0], rot: [0, 0, sd * 0.18], colorFn: () => W(1.02, 1.0, 0.97) }));
        parts.push(sphPart(0.24, 0.3, 0.03, { pos: [sd * 0.28, 0.05, 0.04], rot: [0, 0, sd * 0.18], colorFn: () => W(0.94, 0.9, 0.88) }));
        ear.add(meshWith(merge(parts), fur));
        rig.ears.push(ear);
      }
      // 상아
      const tusks = [];
      for (const sd of [-1, 1]) {
        tusks.push({ geo: unitCone(8), pos: [sd * 0.16, -0.26, 0.36], rot: [1.9, 0, sd * 0.18], scale: [0.05, 0.5, 0.05], color: 0xefe6cf });
        tusks.push({ geo: unitCone(7), pos: [sd * 0.2, -0.5, 0.5], rot: [1.15, 0, sd * 0.24], scale: [0.04, 0.22, 0.04], color: 0xe8dfc6 });
      }
      head.add(meshWith(merge(tusks), plain));

      // 코 — 관절 체인
      const trunkPts = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // 머리 앞에서 앞으로 나갔다가 아래로 늘어진다
        const z = 0.34 + Math.sin(t * Math.PI * 0.9) * 0.3;
        const y = -0.12 - Math.pow(t, 1.5) * 0.95;
        trunkPts.push([0, y, z, lerp(0.15, 0.055, Math.pow(t, 0.8))]);
      }
      rig.trunk = [];
      const bones = 4;
      let parentBone = head;
      let base = 0;
      for (let b = 0; b < bones; b++) {
        const from = Math.round((b / bones) * N);
        const to = Math.round(((b + 1) / bones) * N);
        const bone = new THREE.Group();
        const anchor = trunkPts[from];
        const prev = b === 0 ? [0, 0, 0] : trunkPts[Math.round((b / bones) * N)];
        bone.position.set(anchor[0] - prev[0], anchor[1] - prev[1], anchor[2] - prev[2]);
        if (b === 0) head.add(bone);
        else parentBone.add(bone);
        const pts = trunkPts.slice(from, to + 1).map(([x, y, z, r]) => [x - anchor[0], y - anchor[1], z - anchor[2], r]);
        if (pts.length < 2) pts.push([0, -0.02, 0, 0.05]);
        const geo = curvedTube(pts, 12, () => W(1.0));
        bone.add(meshWith(geo, fur));
        rig.trunk.push(bone);
        parentBone = bone;
      }
      // 발톱
      for (const key of ['fl', 'fr', 'bl', 'br']) {
        const paw = rig.legs[key].paw;
        const nails = [];
        for (let i = 0; i < 3; i++) {
          nails.push(conePart(0.03, 0.07, { pos: [(i - 1) * 0.09, -0.06, 0.26], rot: [Math.PI * 0.6, 0, 0], color: 0xd8d0bc, seg: 5 }));
        }
        paw.add(meshWith(merge(nails), plain));
      }
    },
  });

  return { root, rig };
}

// ── 호랑이 ──────────────────────────────────────────────────
function buildTiger() {
  const fur = furMaterial('tiger-coat');
  const cream = furMaterial('wolf-cream');
  const plain = vertexMaterial({ roughness: 0.72 });
  const eyeMat = vertexMaterial({ roughness: 0.2, metalness: 0.1 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: cream };

  const { root, rig } = makeQuadruped({
    hipY: 1.0,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.74, 0.04, 0.16, 0.18],
      [0.07, -0.66, 0.07, 0.3, 0.32],
      [0.2, -0.52, 0.08, 0.35, 0.36],
      [0.38, -0.28, 0.03, 0.33, 0.34],
      [0.56, -0.02, 0.0, 0.36, 0.37],
      [0.75, 0.24, 0.05, 0.39, 0.41],
      [0.9, 0.42, 0.08, 0.34, 0.38],
      [1.0, 0.52, 0.04, 0.24, 0.28],
    ],
    steps: 28,
    radial: 20,
    torsoColor: (t, d) => {
      if (d.y < -0.3) return W(1.28, 1.24, 1.16);
      if (d.y > 0.55) return W(0.98, 0.96, 0.94);
      return W(1.0);
    },
    legColor: (p, d, front, upperLeg, inSide) => {
      let k = p.y < -0.16 ? 1.2 : 1.0;
      if (inSide && d.x * inSide > 0.15) k += 0.08;
      return W(k, k * 0.98, k * 0.94);
    },
    legSpread: 0.24,
    legs: {
      front: { upper: 0.42, lower: 0.38, pastern: 0.11, rTop: 0.14, rMid: 0.1, rBot: 0.078, pawHalf: 0.055, pawLen: 0.19, z: 0.32, toes: 4, claws: true, clawLen: 0.07 },
      back: { upper: 0.44, lower: 0.4, pastern: 0.09, rTop: 0.18, rMid: 0.11, rBot: 0.08, pawHalf: 0.055, pawLen: 0.2, z: -0.44, toes: 4, claws: true, clawLen: 0.07 },
    },
    clawColor: 0xe8dfc8,
    neck: { pos: [0, 0.14, 0.44], tilt: 0.45, y0: -0.06, y1: 0.24, r0: 0.26, r1: 0.2, headY: 0.27, headZ: 0.02 },
    headTilt: -0.62,
    head: {
      skull: [0.26, 0.24, 0.27],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.26, 1.24, 1.16),
      muzzle: { z0: 0.14, z1: 0.36, r0: 0.15, r1: 0.105, y0: -0.03, y1: -0.06, tint: 1.02, ry0: 0.92, ry1: 0.86 },
      nose: { w: 0.07, h: 0.045, d: 0.05, y: -0.09, z: 0.38, color: 0x8f5a4a },
      eyes: { x: 0.13, y: 0.05, z: 0.17, r: 0.04, iris: 0xc9a227, rim: 0x231a12 },
      ears: { type: 'round', x: 0.16, y: 0.2, z: -0.03, r: 0.07, h: 0.075, out: -0.4, tilt: -0.1, yaw: 0.25, innerColor: 0x4a2a1c },
      teeth: true,
      tongue: true,
      jaw: { y: -0.08, z: 0.08, open: 0.02 },
    },
    tail: { z: -0.76, y: 0.16, segs: 5, len: 0.17, r0: 0.075, r1: 0.05, mat: fur, fluff: true, fluffColor: W(1.0), fluffTip: W(1.05), fluffMat: fur, tint: (t) => W(1.0 - t * 0.05) },
    extras: ({ body, head, rig }) => {
      // 흰 볼 털
      for (const sd of [-1, 1]) {
        const parts = shardsAround(V(sd * 0.15, -0.04, 0.08), [0.1, 0.11, 0.09], 10, {
          len: 0.11, width: 0.045, tilt: 0.5, sagY: -0.7, sagZ: 0.1,
          color: W(0.98, 0.96, 0.92), tip: W(1.08, 1.06, 1.0), seg: 6,
          skip: (nrm) => nrm.x * sd < 0.15,
        });
        head.add(meshWith(merge(parts), cream));
      }
      // 가슴 흰 털
      body.add(meshWith(merge([sphPart(0.17, 0.15, 0.1, { pos: [0, -0.16, 0.4], colorFn: () => W(0.9, 0.88, 0.84) })]), cream));
      // 꼬리 끝 검은 띠
      const last = rig.tail[rig.tail.length - 1];
      last.add(meshWith(merge([sphPart(0.05, 0.05, 0.12, { pos: [0, 0, -0.2], color: 0x1a1410 })]), plain));
    },
  });

  return { root, rig };
}

// ── 치타 ────────────────────────────────────────────────────
function buildCheetah() {
  const fur = furMaterial('cheetah-coat');
  const cream = furMaterial('wolf-cream');
  const plain = vertexMaterial({ roughness: 0.72 });
  const eyeMat = vertexMaterial({ roughness: 0.2, metalness: 0.1 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: cream };

  const { root, rig } = makeQuadruped({
    hipY: 0.92,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.62, 0.04, 0.1, 0.12],
      [0.08, -0.54, 0.06, 0.2, 0.22],
      [0.24, -0.4, 0.04, 0.23, 0.24],
      [0.42, -0.2, -0.02, 0.19, 0.21],
      [0.6, 0.0, -0.02, 0.22, 0.24],
      [0.78, 0.22, 0.02, 0.26, 0.28],
      [0.92, 0.36, 0.03, 0.22, 0.25],
      [1.0, 0.42, 0.0, 0.15, 0.18],
    ],
    steps: 26,
    radial: 18,
    torsoColor: (t, d) => {
      if (d.y < -0.3) return W(1.3, 1.28, 1.2);
      if (d.y > 0.5) return W(0.98, 0.97, 0.95);
      return W(1.0);
    },
    legColor: (p, d, front, upperLeg, inSide) => {
      let k = p.y < -0.2 ? 1.28 : 1.0;
      if (inSide && d.x * inSide > 0.15) k += 0.06;
      return W(k, k * 0.99, k * 0.95);
    },
    legSpread: 0.16,
    legs: {
      front: { upper: 0.44, lower: 0.4, pastern: 0.12, rTop: 0.075, rMid: 0.05, rBot: 0.042, pawHalf: 0.038, pawLen: 0.14, z: 0.26, toes: 4 },
      back: { upper: 0.46, lower: 0.42, pastern: 0.1, rTop: 0.1, rMid: 0.055, rBot: 0.045, pawHalf: 0.038, pawLen: 0.15, z: -0.36, toes: 4 },
    },
    neck: { pos: [0, 0.1, 0.38], tilt: 0.55, y0: -0.06, y1: 0.2, r0: 0.15, r1: 0.115, headY: 0.21, headZ: 0.02 },
    headTilt: -0.66,
    head: {
      skull: [0.16, 0.15, 0.18],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.2, 1.18, 1.12),
      muzzle: { z0: 0.09, z1: 0.28, r0: 0.085, r1: 0.06, y0: -0.01, y1: -0.03, tint: 1.24, ry0: 0.94, ry1: 0.9 },
      nose: { w: 0.04, h: 0.028, d: 0.03, y: -0.04, z: 0.29, color: 0x2a1c14 },
      eyes: { x: 0.085, y: 0.055, z: 0.1, r: 0.03, iris: 0xb98a2a, rim: 0x2a1c12 },
      ears: { type: 'round', x: 0.1, y: 0.14, z: -0.02, r: 0.045, h: 0.045, out: -0.35, tilt: -0.1, yaw: 0.2, innerColor: 0x4a2e1c },
      teeth: true,
      tongue: true,
      jaw: { y: -0.05, z: 0.05, open: 0.02 },
    },
    tail: { z: -0.64, y: 0.14, segs: 5, len: 0.17, r0: 0.055, r1: 0.035, mat: fur, fluff: true, fluffColor: W(1.0), fluffTip: W(1.08), fluffMat: fur, tint: () => W(1.0) },
    extras: ({ head, rig }) => {
      // 눈물 자국 (검은 줄)
      const tears = [];
      for (const sd of [-1, 1]) {
        tears.push(sphPart(0.012, 0.05, 0.012, { pos: [sd * 0.075, -0.02, 0.19], rot: [0.3, 0, sd * 0.1], color: 0x1c130c }));
      }
      head.add(meshWith(merge(tears), plain));
      const last = rig.tail[rig.tail.length - 1];
      last.add(meshWith(merge([sphPart(0.04, 0.04, 0.06, { pos: [0, 0, -0.16], color: 0xf0e6d2 })]), plain));
    },
  });

  return { root, rig };
}

// ── 코뿔소 ──────────────────────────────────────────────────
function buildRhino() {
  const fur = furMaterial('rhino-hide');
  const plain = vertexMaterial({ roughness: 0.6 });
  const eyeMat = vertexMaterial({ roughness: 0.25, metalness: 0.1 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 1.05,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.8, 0.1, 0.24, 0.26],
      [0.08, -0.72, 0.12, 0.4, 0.4],
      [0.26, -0.52, 0.06, 0.48, 0.46],
      [0.46, -0.24, 0.0, 0.5, 0.48],
      [0.66, 0.04, 0.04, 0.5, 0.5],
      [0.84, 0.28, 0.12, 0.44, 0.46],
      [1.0, 0.44, 0.1, 0.32, 0.36],
    ],
    steps: 26,
    radial: 20,
    torsoColor: (t, d) => {
      if (d.y > 0.5) return W(1.06, 1.06, 1.04);
      if (d.y < -0.3) return W(0.96, 0.96, 0.94);
      return W(1.0);
    },
    legColor: (p) => W(p.y < -0.2 ? 1.04 : 1.0),
    bodyExtras: () => [
      // 어깨·엉덩이 갑옷판
      sphPart(0.42, 0.3, 0.3, { pos: [0, 0.28, 0.3], colorFn: () => W(1.08, 1.08, 1.05) }),
      sphPart(0.3, 0.26, 0.26, { pos: [0, 0.2, -0.5], colorFn: () => W(1.0) }),
    ],
    legSpread: 0.3,
    legs: {
      front: { upper: 0.3, lower: 0.26, pastern: 0.12, rTop: 0.2, rMid: 0.16, rBot: 0.14, claw: false, pawHalf: 0.085, pawLen: 0.22, z: 0.4, toes: 4 },
      back: { upper: 0.32, lower: 0.28, pastern: 0.11, rTop: 0.23, rMid: 0.17, rBot: 0.15, pawHalf: 0.085, pawLen: 0.23, z: -0.56, toes: 4 },
    },
    neck: { pos: [0, 0.16, 0.5], tilt: 0.3, y0: -0.14, y1: 0.12, r0: 0.36, r1: 0.3, headY: 0.16, headZ: 0.02 },
    headTilt: -0.2,
    head: {
      skull: [0.3, 0.28, 0.36],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.04, 1.04, 1.02),
      muzzle: { z0: 0.24, z1: 0.5, r0: 0.21, r1: 0.17, y0: -0.08, y1: -0.12, tint: 1.04, ry0: 0.82, ry1: 0.78 },
      nose: { w: 0.08, h: 0.05, d: 0.04, y: -0.2, z: 0.5, color: 0x3a352e },
      eyes: { x: 0.17, y: 0.11, z: 0.2, r: 0.03, iris: 0x3a2a16, rim: 0x33302a },
      ears: { type: 'pointed', x: 0.15, y: 0.28, z: -0.06, r: 0.055, h: 0.12, out: -0.5, tilt: 0, yaw: 0.4, innerColor: 0x4a423a },
      teeth: false,
      tongue: false,
      jaw: { y: -0.16, z: 0.14, open: 0.01 },
    },
    tail: { z: -0.82, y: 0.18, segs: 2, len: 0.1, r0: 0.045, r1: 0.025, mat: fur, tint: () => W(0.96) },
    extras: ({ head }) => {
      // 앞뿔 + 뒷뿔
      const horns = [];
      horns.push({ geo: unitCone(9), pos: [0, 0.1, 0.44], rot: [-0.25, 0, 0], scale: [0.11, 0.5, 0.11], color: 0xb6ab93 });
      horns.push({ geo: unitCone(8), pos: [0, 0.12, 0.26], rot: [-0.2, 0, 0], scale: [0.085, 0.26, 0.085], color: 0xb0a58d });
      head.add(meshWith(merge(horns), plain));
      // 등 판 (몸통 위 굵은 주름)
      const plates = [];
      for (let i = 0; i < 4; i++) {
        plates.push(sphPart(0.34, 0.09, 0.1, { pos: [0, 0.46 - i * 0.03, 0.4 - i * 0.22], colorFn: () => W(0.9, 0.9, 0.88) }));
      }
      head.parent.parent.add(meshWith(merge(plates), fur));
    },
  });

  return { root, rig };
}

// ── 북극곰 ──────────────────────────────────────────────────
function buildPolarBear() {
  const fur = furMaterial('polar-coat');
  const plain = vertexMaterial({ roughness: 0.62 });
  const eyeMat = vertexMaterial({ roughness: 0.2, metalness: 0.1 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 0.98,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.64, 0.06, 0.2, 0.22],
      [0.08, -0.56, 0.1, 0.34, 0.35],
      [0.24, -0.38, 0.04, 0.4, 0.4],
      [0.46, -0.1, 0.0, 0.42, 0.43],
      [0.66, 0.16, 0.04, 0.44, 0.46],
      [0.82, 0.32, 0.1, 0.42, 0.45],
      [1.0, 0.46, 0.02, 0.28, 0.32],
    ],
    steps: 28,
    radial: 20,
    torsoColor: (t, d) => {
      if (d.y > 0.4) return W(1.04, 1.04, 1.02);
      if (d.y < -0.3) return W(0.94, 0.94, 0.94);
      return W(1.0);
    },
    legColor: (p) => W(p.y < -0.2 ? 0.98 : 1.0),
    bodyExtras: () => [
      sphPart(0.36, 0.28, 0.34, { pos: [0, 0.3, 0.16], colorFn: () => W(1.06, 1.06, 1.04) }),
      sphPart(0.24, 0.26, 0.24, { pos: [0.32, 0.16, 0.24], colorFn: () => W(1.02) }),
      sphPart(0.24, 0.26, 0.24, { pos: [-0.32, 0.16, 0.24], colorFn: () => W(1.02) }),
    ],
    legSpread: 0.3,
    legs: {
      front: { upper: 0.36, lower: 0.3, pastern: 0.12, rTop: 0.17, rMid: 0.13, rBot: 0.105, pawHalf: 0.07, pawLen: 0.26, z: 0.32, toes: 5, claws: true, clawLen: 0.1 },
      back: { upper: 0.38, lower: 0.32, pastern: 0.11, rTop: 0.2, rMid: 0.14, rBot: 0.11, pawHalf: 0.07, pawLen: 0.27, z: -0.4, toes: 5, claws: true, clawLen: 0.1 },
    },
    clawColor: 0x3a3630,
    neck: { pos: [0, 0.2, 0.46], tilt: 0.4, y0: -0.08, y1: 0.28, r0: 0.27, r1: 0.19, headY: 0.3, headZ: 0.04 },
    headTilt: -0.62,
    head: {
      skull: [0.25, 0.23, 0.26],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.02),
      muzzle: { z0: 0.14, z1: 0.4, r0: 0.13, r1: 0.1, y0: -0.04, y1: -0.07, tint: 1.02, ry0: 0.9, ry1: 0.84 },
      nose: { w: 0.06, h: 0.04, d: 0.04, y: -0.08, z: 0.42, color: 0x241c18 },
      eyes: { x: 0.12, y: 0.06, z: 0.15, r: 0.032, iris: 0x3f2a12, rim: 0x3a342c },
      ears: { type: 'round', x: 0.16, y: 0.2, z: -0.03, r: 0.058, h: 0.06, out: -0.45, tilt: -0.1, yaw: 0.3, innerColor: 0x9a958a },
      teeth: true,
      tongue: true,
      jaw: { y: -0.08, z: 0.08, open: 0.02 },
    },
    tail: { z: -0.64, y: 0.16, segs: 2, len: 0.1, r0: 0.07, r1: 0.05, mat: fur, tint: () => W(1.0) },
    extras: ({ body, neck, rig }) => {
      const neckFur = shardsAround(V(0, 0.02, 0.08), [0.3, 0.28, 0.26], 34, {
        len: 0.2, width: 0.085, tilt: 0.35, sagY: -0.6, sagZ: -0.3,
        color: W(0.98, 0.98, 0.96), tip: W(1.06, 1.06, 1.04), seg: 6,
        skip: (nrm) => nrm.z > 0.5,
      });
      neck.add(meshWith(merge(neckFur), fur));
      const flank = [];
      for (const sd of [-1, 1]) {
        flank.push(...shardsAround(V(sd * 0.3, 0.02, -0.06), [0.2, 0.24, 0.4], 16, {
          len: 0.17, width: 0.07, tilt: 0.5, sagY: -0.9, sagZ: 0.2,
          color: W(0.98), tip: W(1.05), seg: 6, skip: (nrm) => nrm.x * sd < 0.25,
        }));
      }
      body.add(meshWith(merge(flank), fur));
    },
  });

  return { root, rig };
}

// ══════════════════════════════════════════════════════════
//  바다 생물 — 물속을 나는 듯한 척추 체인
// ══════════════════════════════════════════════════════════

function seaRig(bodyY) {
  const rig = { form: 'serpent' };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, bodyY, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = bodyY;
  return { root, rig };
}

function buildShark() {
  const skin = skinMaterial('shark-skin', { roughness: 0.75, metalness: 0.15 });
  const plain = vertexMaterial({ roughness: 0.55 });
  const eyeMat = vertexMaterial({ roughness: 0.15, metalness: 0.2 });
  const { root, rig } = seaRig(0.95);

  const SEG = 7;
  const LEN = 0.52;
  // 머리(코) → 꼬리 방향으로 두께 변화
  const radiusAt = (t) => {
    // t: 0 = 코끝, 1 = 꼬리 끝
    if (t < 0.12) return lerp(0.06, 0.28, t / 0.12);
    if (t < 0.42) return lerp(0.28, 0.38, (t - 0.12) / 0.3);
    if (t < 0.78) return lerp(0.38, 0.14, (t - 0.42) / 0.36);
    return lerp(0.14, 0.03, (t - 0.78) / 0.22);
  };
  const spine = [];
  let parent = rig.body;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? 1.5 : -LEN);
    parent.add(seg);
    const steps = 4;
    const sections = [];
    for (let k = 0; k <= steps; k++) {
      const g = (i * LEN + (k / steps) * LEN) / (SEG * LEN);
      const r = radiusAt(g);
      sections.push({ p: V(0, Math.sin(g * 3.2) * 0.04, -(k / steps) * LEN), rx: r * 0.85, ry: r });
    }
    seg.add(meshWith(sweep(sections, {
      radial: 16,
      capStart: i === 0,
      capEnd: i === SEG - 1,
      colorFn: () => W(1),
    }), skin));
    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;

  // 등지느러미 · 가슴지느러미 · 꼬리지느러미
  const fins = [];
  fins.push({ geo: unitCone(3), pos: [0, 0.34, -0.15], rot: [-0.35, 0, 0], scale: [0.05, 0.62, 0.34], color: 0x55636d });
  fins.push({ geo: unitCone(3), pos: [0.36, -0.08, 0.62], rot: [0.25, 0, -1.15], scale: [0.05, 0.62, 0.26], color: 0x5b6a74 });
  fins.push({ geo: unitCone(3), pos: [-0.36, -0.08, 0.62], rot: [0.25, 0, 1.15], scale: [0.05, 0.62, 0.26], color: 0x5b6a74 });
  // 꼬리 — 위아래로 뻗은 초승달
  fins.push({ geo: unitCone(3), pos: [0, 0.16, -2.05], rot: [0.5, 0, 0], scale: [0.04, 0.55, 0.22], color: 0x4f5c66 });
  fins.push({ geo: unitCone(3), pos: [0, -0.16, -2.02], rot: [2.4, 0, 0], scale: [0.04, 0.4, 0.2], color: 0x4f5c66 });
  // 아가미
  for (let i = 0; i < 5; i++) {
    for (const sd of [-1, 1]) {
      fins.push({ geo: unitBox(), pos: [sd * 0.27, 0.02, 0.95 - i * 0.1], rot: [0, sd * 0.1, 0], scale: [0.01, 0.16, 0.012], color: 0x33404a });
    }
  }
  rig.body.add(meshWith(merge(fins), plain));

  // 머리 — 뾰족한 주둥이와 입
  const headParts = [];
  headParts.push(sphPart(0.24, 0.16, 0.3, { pos: [0, 0.02, 1.55], colorFn: () => W(1.0) }));
  rig.body.add(meshWith(merge(headParts), skin));
  const mouth = [];
  mouth.push(sphPart(0.13, 0.05, 0.2, { pos: [0, -0.12, 1.72], color: 0x2a1a1a }));
  for (let i = 0; i < 6; i++) {
    for (const sd of [-1, 1]) {
      mouth.push({ geo: unitCone(4), pos: [sd * (0.03 + i * 0.017), -0.1, 1.78 - i * 0.055], rot: [Math.PI, 0, 0], scale: [0.016, 0.05, 0.016], color: 0xf2ead8 });
    }
  }
  for (const sd of [-1, 1]) {
    mouth.push(sphPart(0.028, 0.028, 0.028, { pos: [sd * 0.19, 0.08, 1.68], color: 0x0a0a0a }));
  }
  rig.body.add(meshWith(merge(mouth), plain));

  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.head = spine[0];
  rig.headBase = spine[0].position.clone();
  rig.jaw = null;
  rig.tongue = null;
  return { root, rig };
}

function buildOrca() {
  const skin = skinMaterial('orca-skin', { roughness: 0.55, metalness: 0.2 });
  const white = vertexMaterial({ roughness: 0.5 });
  const plain = vertexMaterial({ roughness: 0.5 });
  const { root, rig } = seaRig(1.2);

  const SEG = 8;
  const LEN = 0.55;
  const radiusAt = (t) => {
    if (t < 0.1) return lerp(0.16, 0.5, t / 0.1);
    if (t < 0.4) return lerp(0.5, 0.62, (t - 0.1) / 0.3);
    if (t < 0.75) return lerp(0.62, 0.28, (t - 0.4) / 0.35);
    return lerp(0.28, 0.07, (t - 0.75) / 0.25);
  };
  const spine = [];
  let parent = rig.body;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? 1.9 : -LEN);
    parent.add(seg);
    const steps = 4;
    const sections = [];
    for (let k = 0; k <= steps; k++) {
      const g = (i * LEN + (k / steps) * LEN) / (SEG * LEN);
      const r = radiusAt(g);
      sections.push({ p: V(0, Math.sin(g * 2.4) * 0.03, -(k / steps) * LEN), rx: r * 0.9, ry: r });
    }
    seg.add(meshWith(sweep(sections, { radial: 18, capStart: i === 0, capEnd: i === SEG - 1, colorFn: () => W(1) }), skin));
    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;

  // 흰 배 — 몸 아래쪽 띠
  const belly = [];
  const bodyMesh = spine[1];
  belly.push(sphPart(0.5, 0.12, 1.5, { pos: [0, -0.5, 0.3], color: 0xf2f4f4 }));
  belly.push(sphPart(0.42, 0.1, 0.9, { pos: [0, -0.34, 1.5], color: 0xf2f4f4 }));
  rig.body.add(meshWith(merge(belly), white));

  // 등지느러미 (수컷의 높은 삼각)
  const fins = [];
  fins.push({ geo: unitCone(3), pos: [0, 0.5, 0.95], rot: [-0.2, 0, 0], scale: [0.06, 0.95, 0.42], color: 0x14171c });
  // 가슴지느러미 (둥근 노)
  for (const sd of [-1, 1]) {
    fins.push(sphPart(0.34, 0.06, 0.24, { pos: [sd * 0.52, -0.2, 1.35], rot: [0.1, sd * 0.3, sd * 0.35], color: 0x171a20 }));
  }
  // 꼬리 지느러미 (수평)
  fins.push(sphPart(0.62, 0.05, 0.3, { pos: [0, 0.02, -2.35], rot: [0.05, 0, 0], color: 0x14171c }));
  fins.push(sphPart(0.3, 0.04, 0.16, { pos: [0, 0.02, -2.4], rot: [0, 0.4, 0], color: 0xe8ecec }));
  rig.body.add(meshWith(merge(fins), plain));

  // 머리 — 흰 눈 패치
  const head = spine[0];
  const patch = [];
  for (const sd of [-1, 1]) {
    patch.push(sphPart(0.09, 0.06, 0.16, { pos: [sd * 0.28, 0.14, 1.98], rot: [0, sd * 0.2, 0], color: 0xf4f6f6 }));
    patch.push(sphPart(0.03, 0.03, 0.03, { pos: [sd * 0.32, 0.12, 2.0], color: 0x0a0a0a }));
  }
  patch.push(sphPart(0.28, 0.08, 0.3, { pos: [0, -0.24, 2.0], color: 0xf4f6f6 }));
  if (white) rig.body.add(meshWith(merge(patch), white));

  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.head = head;
  rig.headBase = head.position.clone();
  rig.jaw = null;
  rig.tongue = null;
  return { root, rig };
}

function buildOctopus() {
  const skin = skinMaterial('octopus-skin', { roughness: 0.7, metalness: 0.05 });
  const plain = vertexMaterial({ roughness: 0.5 });
  const eyeMat = vertexMaterial({ roughness: 0.18, metalness: 0.15 });
  const { root, rig } = seaRig(1.35);

  // 머리(외투막)
  const mantle = new THREE.Group();
  rig.body.add(mantle);
  const mantleParts = [];
  mantleParts.push(sphPart(0.52, 0.58, 0.72, { pos: [0, 0.1, -0.1], colorFn: () => W(1.0) }));
  mantleParts.push(sphPart(0.4, 0.34, 0.3, { pos: [0, -0.16, 0.34], colorFn: () => W(1.04, 1.0, 0.98) }));
  mantle.add(meshWith(merge(mantleParts), skin));

  // 눈 (외투막 옆면)
  const eyes = [];
  for (const sd of [-1, 1]) {
    eyes.push(sphPart(0.1, 0.09, 0.07, { pos: [sd * 0.24, -0.02, 0.28], color: 0xe0c58a }));
    eyes.push(sphPart(0.045, 0.07, 0.03, { pos: [sd * 0.28, -0.02, 0.3], color: 0x0d0d0d }));
  }
  mantle.add(meshWith(merge(eyes), eyeMat));

  // 다리 8개 — 4마디 체인
  rig.tentacles = [];
  const T = 8;
  for (let i = 0; i < T; i++) {
    const a = (i / T) * TAU + 0.2;
    const rootBone = new THREE.Group();
    rootBone.position.set(Math.cos(a) * 0.3, -0.32, Math.sin(a) * 0.3 + 0.1);
    rootBone.rotation.y = -a + Math.PI / 2;
    rootBone.rotation.x = 0.9;
    mantle.add(rootBone);
    const chain = [];
    let parentBone = rootBone;
    const segs = 4;
    for (let k = 0; k < segs; k++) {
      const bone = new THREE.Group();
      bone.position.z = k === 0 ? 0 : 0.34;
      parentBone.add(bone);
      const r0 = lerp(0.12, 0.03, k / segs);
      const r1 = lerp(0.12, 0.03, (k + 1) / segs);
      const geo = sweep([
        { p: V(0, 0, -0.02), rx: r0, ry: r0 * 0.85 },
        { p: V(0, -0.03, 0.17), rx: (r0 + r1) * 0.5, ry: (r0 + r1) * 0.44 },
        { p: V(0, -0.06, 0.36), rx: r1, ry: r1 * 0.85 },
      ], {
        radial: 10,
        colorFn: (p, d, t) => (d.y < -0.2 ? W(1.35, 1.28, 1.18) : W(1.0)),
      });
      bone.add(meshWith(geo, skin));
      chain.push(bone);
      parentBone = bone;
    }
    rig.tentacles.push(chain);
  }

  rig.spine = [mantle];
  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.head = mantle;
  rig.headBase = mantle.position.clone();
  rig.jaw = null;
  rig.tongue = null;
  return { root, rig };
}


// ══════════════════════════════════════════════════════════
//  지형별 야생 AI — 지역에 맞는 먹잇감
// ══════════════════════════════════════════════════════════

function buildZebra() {
  const fur = furMaterial('zebra-coat');
  const dark = vertexMaterial({ roughness: 0.8 });
  const plain = vertexMaterial({ roughness: 0.7 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 0.95,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.6, 0.04, 0.14, 0.15],
      [0.1, -0.52, 0.06, 0.28, 0.3],
      [0.28, -0.36, 0.02, 0.31, 0.32],
      [0.5, -0.08, -0.02, 0.32, 0.33],
      [0.72, 0.18, 0.02, 0.32, 0.34],
      [0.88, 0.34, 0.06, 0.29, 0.31],
      [1.0, 0.44, 0.02, 0.21, 0.24],
    ],
    steps: 22,
    radial: 16,
    torsoColor: (t, d) => (d.y < -0.35 ? W(1.04) : d.y > 0.5 ? W(0.98) : W(1.0)),
    legColor: (p) => W(p.y < -0.2 ? 1.03 : 1.0),
    legSpread: 0.19,
    legs: {
      front: { upper: 0.34, lower: 0.3, pastern: 0.1, rTop: 0.09, rMid: 0.062, rBot: 0.05, pawHalf: 0.04, pawLen: 0.13, z: 0.28, toes: 3 },
      back: { upper: 0.36, lower: 0.32, pastern: 0.09, rTop: 0.11, rMid: 0.065, rBot: 0.052, pawHalf: 0.04, pawLen: 0.13, z: -0.38, toes: 3 },
    },
    neck: { pos: [0, 0.2, 0.36], tilt: 0.8, y0: -0.1, y1: 0.3, r0: 0.2, r1: 0.13, headY: 0.32, headZ: 0.04 },
    headTilt: -0.95,
    head: {
      skull: [0.17, 0.16, 0.2],
      skullTint: () => W(1.0),
      muzzle: { z0: 0.1, z1: 0.36, r0: 0.1, r1: 0.08, y0: -0.02, y1: -0.05, tint: 0.96, ry0: 0.9, ry1: 0.86 },
      nose: { w: 0.05, h: 0.03, d: 0.03, y: -0.06, z: 0.37, color: 0x2a2622 },
      eyes: { x: 0.1, y: 0.05, z: 0.1, r: 0.028, iris: 0x2a1c10, rim: 0x201a14 },
      ears: { type: 'pointed', x: 0.1, y: 0.18, z: -0.03, r: 0.045, h: 0.18, out: -0.35, tilt: -0.15, yaw: 0.25, innerColor: 0x3a2c22 },
      teeth: false,
      tongue: false,
      jaw: { y: -0.06, z: 0.06, open: 0 },
    },
    tail: { z: -0.64, y: 0.2, segs: 2, len: 0.12, r0: 0.045, r1: 0.03, mat: fur, tuft: { len: 0.22, r: 0.05, color: 0x2a2420 }, tuftMat: dark },
    extras: ({ neck, rig }) => {
      // 목덜미의 곧은 갈기
      const bristles = [];
      for (let i = 0; i < 10; i++) {
        bristles.push(conePart(0.022, 0.16, { pos: [0, 0.03 + i * 0.028, 0.12 - i * 0.03], rot: [0.4, 0, 0], color: W(0.6, 0.55, 0.5), seg: 4 }));
      }
      neck.add(meshWith(merge(bristles), dark));
      void rig;
    },
  });
  return { root, rig };
}

function buildHyena() {
  const fur = furMaterial('hyena-coat');
  const plain = vertexMaterial({ roughness: 0.75 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 0.92,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.58, -0.06, 0.16, 0.17],
      [0.1, -0.5, -0.04, 0.26, 0.27],
      [0.3, -0.32, -0.02, 0.29, 0.3],
      [0.52, -0.06, 0.0, 0.31, 0.32],
      [0.74, 0.16, 0.08, 0.33, 0.35],
      [0.9, 0.28, 0.1, 0.29, 0.31],
      [1.0, 0.36, 0.04, 0.2, 0.23],
    ],
    steps: 22,
    radial: 16,
    torsoColor: (t, d) => (d.y > 0.45 ? W(0.92, 0.9, 0.86) : d.y < -0.35 ? W(1.1) : W(1.0)),
    legColor: (p) => W(p.y < -0.2 ? 1.06 : 1.0),
    legSpread: 0.18,
    legs: {
      front: { upper: 0.38, lower: 0.32, pastern: 0.1, rTop: 0.095, rMid: 0.065, rBot: 0.052, pawHalf: 0.042, pawLen: 0.14, z: 0.3, toes: 4, claws: true, clawLen: 0.05 },
      back: { upper: 0.4, lower: 0.34, pastern: 0.09, rTop: 0.115, rMid: 0.068, rBot: 0.054, pawHalf: 0.042, pawLen: 0.14, z: -0.34, toes: 4, claws: true, clawLen: 0.05 },
    },
    neck: { pos: [0, 0.2, 0.36], tilt: 0.55, y0: -0.06, y1: 0.24, r0: 0.22, r1: 0.16, headY: 0.26, headZ: 0.02 },
    headTilt: -0.7,
    head: {
      skull: [0.2, 0.19, 0.22],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.08),
      muzzle: { z0: 0.1, z1: 0.34, r0: 0.11, r1: 0.08, y0: -0.02, y1: -0.05, tint: 0.94, ry0: 0.92, ry1: 0.86 },
      nose: { w: 0.05, h: 0.035, d: 0.03, y: -0.06, z: 0.35, color: 0x1e1814 },
      eyes: { x: 0.1, y: 0.06, z: 0.1, r: 0.03, iris: 0x8a6a1e, rim: 0x241c14 },
      ears: { type: 'round', x: 0.13, y: 0.18, z: -0.02, r: 0.06, h: 0.075, out: -0.3, tilt: 0.1, yaw: 0.2, innerColor: 0x3a2a1e },
      teeth: true,
      tongue: true,
      jaw: { y: -0.07, z: 0.06, open: 0.05 },
    },
    tail: { z: -0.62, y: 0.1, segs: 3, len: 0.12, r0: 0.055, r1: 0.04, mat: fur, fluff: true, fluffColor: W(0.9), fluffTip: W(1.0), fluffMat: fur, tint: () => W(1.0) },
    extras: ({ neck }) => {
      // 갈기(하이에나의 등 털)
      const ridge = [];
      for (let i = 0; i < 9; i++) {
        ridge.push(conePart(0.03, 0.18, { pos: [0, 0.06 + i * 0.02, 0.18 - i * 0.04], rot: [0.1, 0, 0], color: W(0.85, 0.82, 0.78), seg: 4 }));
      }
      neck.add(meshWith(merge(ridge), fur));
    },
  });
  return { root, rig };
}

function buildWarthog() {
  const fur = furMaterial('boar-coat');
  const plain = vertexMaterial({ roughness: 0.7 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 0.6,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.38, 0.06, 0.16, 0.17],
      [0.1, -0.32, 0.08, 0.25, 0.26],
      [0.32, -0.16, 0.06, 0.27, 0.28],
      [0.55, 0.02, 0.02, 0.27, 0.28],
      [0.78, 0.18, 0.06, 0.26, 0.27],
      [0.92, 0.26, 0.02, 0.21, 0.23],
      [1.0, 0.3, -0.02, 0.16, 0.18],
    ],
    steps: 18,
    radial: 14,
    torsoColor: (t, d) => (d.y > 0.4 ? W(0.88) : W(1.0)),
    legColor: (p) => W(p.y < -0.12 ? 0.94 : 1.0),
    legSpread: 0.17,
    legs: {
      front: { upper: 0.2, lower: 0.16, pastern: 0.07, rTop: 0.06, rMid: 0.042, rBot: 0.036, pawHalf: 0.03, pawLen: 0.09, z: 0.22, toes: 3 },
      back: { upper: 0.21, lower: 0.17, pastern: 0.06, rTop: 0.07, rMid: 0.044, rBot: 0.037, pawHalf: 0.03, pawLen: 0.09, z: -0.26, toes: 3 },
    },
    neck: { pos: [0, 0.04, 0.26], tilt: 0.25, y0: -0.06, y1: 0.08, r0: 0.17, r1: 0.14, headY: 0.1, headZ: 0.02 },
    headTilt: -0.15,
    head: {
      skull: [0.17, 0.16, 0.19],
      skullTint: () => W(1.0),
      muzzle: { z0: 0.1, z1: 0.28, r0: 0.1, r1: 0.08, y0: -0.03, y1: -0.06, tint: 1.04, ry0: 0.88, ry1: 0.8 },
      nose: { w: 0.06, h: 0.035, d: 0.03, y: -0.07, z: 0.29, color: 0x3a2a24 },
      eyes: { x: 0.1, y: 0.05, z: 0.1, r: 0.026, iris: 0x9a3a1a, rim: 0x2a1a12 },
      ears: { type: 'pointed', x: 0.11, y: 0.15, z: -0.03, r: 0.045, h: 0.1, out: -0.6, tilt: 0.1, yaw: 0.3, innerColor: 0x3a2a20 },
      teeth: false,
      tongue: false,
      jaw: { y: -0.06, z: 0.04, open: 0 },
    },
    tail: { z: -0.4, y: 0.1, segs: 2, len: 0.05, r0: 0.02, r1: 0.012, mat: fur, tuft: { len: 0.12, r: 0.03, color: 0x3a2e22 }, tuftMat: plain },
    extras: ({ body, head }) => {
      // 등 강모 + 엄니
      const bristles = [];
      for (let i = 0; i < 9; i++) {
        bristles.push(conePart(0.012, 0.13, { pos: [(Math.random() - 0.5) * 0.1, 0.22, 0.28 - i * 0.05], rot: [-0.5, 0, 0], color: W(0.6, 0.55, 0.5), seg: 4 }));
      }
      body.add(meshWith(merge(bristles), fur));
      const tusks = [];
      for (const sd of [-1, 1]) {
        tusks.push(conePart(0.022, 0.15, { pos: [sd * 0.09, -0.05, 0.24], rot: [-0.9, 0, sd * 0.5], color: 0xe8dfc8, seg: 5 }));
      }
      head.add(meshWith(merge(tusks), plain));
    },
  });
  return { root, rig };
}

function buildTurtle() {
  const shellMat = vertexMaterial({ roughness: 0.55 });
  const skinMat = vertexMaterial({ roughness: 0.6 });
  const rig = { form: 'serpent' };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, 0.55, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = 0.55;

  // 등껍질
  const shell = [];
  shell.push(sphPart(0.62, 0.3, 0.78, { colorFn: () => W(0.55, 0.5, 0.32) }));
  shell.push(sphPart(0.5, 0.16, 0.64, { pos: [0, 0.14, 0], colorFn: () => W(0.62, 0.56, 0.36) }));
  // 껍질 판 무늬
  for (let i = 0; i < 5; i++) {
    for (const sd of [-1, 1]) {
      shell.push(sphPart(0.11, 0.03, 0.12, { pos: [sd * 0.22, 0.24, 0.4 - i * 0.2], colorFn: () => W(0.42, 0.38, 0.24) }));
    }
  }
  // 배판
  shell.push(sphPart(0.5, 0.1, 0.66, { pos: [0, -0.2, 0], colorFn: () => W(0.78, 0.72, 0.5) }));
  body.add(meshWith(merge(shell), shellMat));

  // 머리 + 목
  const headGrp = new THREE.Group();
  headGrp.position.set(0, -0.02, 0.76);
  body.add(headGrp);
  const headParts = [];
  headParts.push(sphPart(0.16, 0.14, 0.2, { pos: [0, 0, 0.1], colorFn: () => W(0.7, 0.66, 0.44) }));
  for (const sd of [-1, 1]) {
    headParts.push(sphPart(0.03, 0.03, 0.03, { pos: [sd * 0.1, 0.05, 0.16], color: 0x120e08 }));
  }
  headGrp.add(meshWith(merge(headParts), skinMat));
  rig.head = headGrp;
  rig.headBase = headGrp.position.clone();

  // 지느러미 4개
  const flips = [];
  for (const [x, z, rot] of [[-0.62, 0.42, 0.35], [0.62, 0.42, -0.35], [-0.55, -0.5, 0.45], [0.55, -0.5, -0.45]]) {
    flips.push(sphPart(0.34, 0.05, 0.16, { pos: [x, -0.12, z], rot: [0.1, rot, 0], colorFn: () => W(0.72, 0.68, 0.46) }));
  }
  body.add(meshWith(merge(flips), skinMat));

  // 꼬리
  body.add(meshWith(merge([sphPart(0.06, 0.06, 0.16, { pos: [0, -0.1, -0.82], color: 0x6a6040 })]), skinMat));

  rig.spine = [body];
  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.jaw = null;
  rig.tongue = null;
  rig.head = headGrp;
  return { root, rig };
}

function buildManta() {
  const skin = vertexMaterial({ roughness: 0.5 });
  const rig = { form: 'serpent' };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.set(0, 0.85, 0);
  root.add(body);
  rig.body = body;
  rig.hipY = 0.85;

  const parts = [];
  parts.push(sphPart(0.5, 0.12, 0.52, { pos: [0, 0, 0], colorFn: () => W(0.24, 0.26, 0.3) }));
  // 날개
  for (const sd of [-1, 1]) {
    parts.push(sphPart(0.85, 0.05, 0.32, { pos: [sd * 0.72, 0, 0.05], rot: [0, 0, sd * 0.12], colorFn: () => W(0.2, 0.22, 0.26) }));
    parts.push(sphPart(0.5, 0.035, 0.2, { pos: [sd * 0.95, 0, -0.12], rot: [0, 0.2, sd * 0.18], colorFn: () => W(0.18, 0.2, 0.24) }));
    // 머리 지느러미
    parts.push(sphPart(0.1, 0.04, 0.16, { pos: [sd * 0.24, 0, 0.5], rot: [0, sd * 0.4, 0], colorFn: () => W(0.22, 0.24, 0.28) }));
  }
  // 배 (흰색)
  parts.push(sphPart(0.42, 0.06, 0.42, { pos: [0, -0.06, 0], color: 0xd8dcd8 }));
  body.add(meshWith(merge(parts), skin));

  // 꼬리 (길고 가는 채찍)
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.45);
  body.add(tail);
  const tParts = [];
  for (let i = 0; i < 3; i++) {
    tParts.push(sphPart(0.03 - i * 0.008, 0.02, 0.16, { pos: [0, 0, -0.15 - i * 0.28], color: 0x2a2c32 }));
  }
  tail.add(meshWith(merge(tParts), skin));
  rig.tail = [tail];

  rig.spine = [body];
  rig.legs = null;
  rig.ears = [];
  rig.jaw = null;
  rig.tongue = null;
  rig.head = body;
  rig.headBase = body.position.clone();
  return { root, rig };
}

function buildMarlin() {
  const skin = skinMaterial('shark-skin', { roughness: 0.7, metalness: 0.15 });
  const plain = vertexMaterial({ roughness: 0.55 });
  const { root, rig } = seaRig(1.0);
  const SEG = 5;
  const LEN = 0.5;
  const spine = [];
  let parent = rig.body;
  for (let i = 0; i < SEG; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? 1.1 : -LEN);
    parent.add(seg);
    const steps = 4;
    const sections = [];
    for (let k = 0; k <= steps; k++) {
      const g = (i * LEN + (k / steps) * LEN) / (SEG * LEN);
      const r = g < 0.3 ? lerp(0.12, 0.26, g / 0.3) : lerp(0.26, 0.03, (g - 0.3) / 0.7);
      sections.push({ p: V(0, 0, -(k / steps) * LEN), rx: r * 0.8, ry: r });
    }
    seg.add(meshWith(sweep(sections, { radial: 12, capStart: i === 0, capEnd: i === SEG - 1, colorFn: () => W(1) }), skin));
    spine.push(seg);
    parent = seg;
  }
  rig.spine = spine;
  const fins = [];
  fins.push({ geo: unitCone(3), pos: [0, 0.26, 0.05], rot: [-0.3, 0, 0], scale: [0.04, 0.5, 0.24], color: 0x4c5b66 });
  fins.push({ geo: unitCone(3), pos: [0, 0.06, -2.3], rot: [0.4, 0, 0], scale: [0.03, 0.4, 0.18], color: 0x4c5b66 });
  fins.push({ geo: unitCone(3), pos: [0, -0.06, -2.28], rot: [2.6, 0, 0], scale: [0.03, 0.3, 0.16], color: 0x4c5b66 });
  for (const sd of [-1, 1]) {
    fins.push({ geo: unitCone(3), pos: [sd * 0.22, -0.04, 0.6], rot: [0.2, 0, sd * 1.2], scale: [0.03, 0.42, 0.16], color: 0x50606b });
  }
  // 긴 주둥이(창)
  fins.push({ geo: unitCone(6), pos: [0, 0.02, 2.0], rot: [Math.PI / 2, 0, 0], scale: [0.035, 0.9, 0.035], color: 0x4a5862 });
  rig.body.add(meshWith(merge(fins), plain));
  const eyes = [];
  for (const sd of [-1, 1]) eyes.push(sphPart(0.035, 0.035, 0.035, { pos: [sd * 0.16, 0.06, 1.28], color: 0x080808 }));
  rig.body.add(meshWith(merge(eyes), plain));

  rig.legs = null;
  rig.ears = [];
  rig.tail = [];
  rig.head = spine[0];
  rig.headBase = spine[0].position.clone();
  rig.jaw = null;
  rig.tongue = null;
  return { root, rig };
}

function buildDeer() {
  const fur = furMaterial('deer-coat');
  const plain = vertexMaterial({ roughness: 0.6 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };

  const { root, rig } = makeQuadruped({
    hipY: 1.02,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.55, 0.04, 0.13, 0.15],
      [0.1, -0.48, 0.06, 0.24, 0.26],
      [0.3, -0.32, 0.02, 0.26, 0.27],
      [0.52, -0.06, -0.02, 0.25, 0.26],
      [0.74, 0.16, 0.02, 0.25, 0.27],
      [0.9, 0.28, 0.06, 0.21, 0.23],
      [1.0, 0.36, 0.0, 0.15, 0.18],
    ],
    steps: 20,
    radial: 16,
    torsoColor: (t, d) => (d.y < -0.35 ? W(1.2, 1.16, 1.08) : W(1.0)),
    legColor: (p) => W(p.y < -0.25 ? 1.12 : 1.0),
    legSpread: 0.17,
    legs: {
      front: { upper: 0.42, lower: 0.38, pastern: 0.12, rTop: 0.065, rMid: 0.045, rBot: 0.036, pawHalf: 0.032, pawLen: 0.11, z: 0.26, toes: 3 },
      back: { upper: 0.44, lower: 0.4, pastern: 0.1, rTop: 0.085, rMid: 0.05, rBot: 0.038, pawHalf: 0.032, pawLen: 0.11, z: -0.36, toes: 3 },
    },
    neck: { pos: [0, 0.18, 0.34], tilt: 0.6, y0: -0.08, y1: 0.3, r0: 0.14, r1: 0.1, headY: 0.32, headZ: 0.04 },
    headTilt: -0.85,
    head: {
      skull: [0.12, 0.115, 0.15],
      skullTint: () => W(1.0),
      muzzle: { z0: 0.08, z1: 0.28, r0: 0.075, r1: 0.055, y0: 0, y1: -0.03, tint: 0.96, ry0: 0.9, ry1: 0.86 },
      nose: { w: 0.04, h: 0.028, d: 0.025, y: -0.045, z: 0.29, color: 0x1e1814 },
      eyes: { x: 0.08, y: 0.04, z: 0.09, r: 0.026, iris: 0x2a1c0e, rim: 0x241c14 },
      ears: { type: 'pointed', x: 0.09, y: 0.13, z: -0.03, r: 0.04, h: 0.15, out: -0.7, tilt: -0.1, yaw: 0.4, innerColor: 0x4a3a2a },
      teeth: false,
      tongue: false,
      jaw: { y: -0.05, z: 0.04, open: 0 },
    },
    tail: { z: -0.58, y: 0.16, segs: 2, len: 0.08, r0: 0.03, r1: 0.02, mat: fur, tint: () => W(1.2, 1.16, 1.1) },
    extras: ({ head }) => {
      // 뿔 (가지가 있는)
      const antlers = [];
      for (const sd of [-1, 1]) {
        antlers.push({ geo: unitCone(5), pos: [sd * 0.06, 0.14, 0.02], rot: [-0.2, 0, sd * 0.35], scale: [0.022, 0.4, 0.022], color: 0x8a7455 });
        antlers.push({ geo: unitCone(4), pos: [sd * 0.14, 0.34, 0.0], rot: [-0.1, 0, sd * 0.9], scale: [0.018, 0.26, 0.018], color: 0x8a7455 });
        antlers.push({ geo: unitCone(4), pos: [sd * 0.05, 0.36, 0.06], rot: [0.5, 0, sd * 0.2], scale: [0.015, 0.22, 0.015], color: 0x8a7455 });
      }
      head.add(meshWith(merge(antlers), plain));
    },
  });
  return { root, rig };
}

function buildFox() {
  const fur = furMaterial('fox-coat');
  const cream = furMaterial('wolf-cream');
  const plain = vertexMaterial({ roughness: 0.7 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: cream, plain, eye: eyeMat, jaw: cream };

  const { root, rig } = makeQuadruped({
    hipY: 0.62,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.34, 0.02, 0.1, 0.11],
      [0.1, -0.28, 0.04, 0.16, 0.17],
      [0.32, -0.16, 0.0, 0.17, 0.18],
      [0.56, 0.0, -0.02, 0.17, 0.18],
      [0.78, 0.14, 0.02, 0.18, 0.2],
      [0.92, 0.22, 0.02, 0.15, 0.17],
      [1.0, 0.26, -0.02, 0.1, 0.12],
    ],
    steps: 18,
    radial: 14,
    torsoColor: (t, d) => (d.y < -0.3 ? W(1.24, 1.18, 1.1) : W(1.0)),
    legColor: (p) => W(p.y < -0.14 ? 0.9 : 1.0),
    legSpread: 0.12,
    legs: {
      front: { upper: 0.24, lower: 0.2, pastern: 0.07, rTop: 0.05, rMid: 0.035, rBot: 0.03, pawHalf: 0.026, pawLen: 0.08, z: 0.18, toes: 3 },
      back: { upper: 0.25, lower: 0.21, pastern: 0.06, rTop: 0.06, rMid: 0.037, rBot: 0.031, pawHalf: 0.026, pawLen: 0.08, z: -0.24, toes: 3 },
    },
    neck: { pos: [0, 0.08, 0.24], tilt: 0.5, y0: -0.06, y1: 0.14, r0: 0.1, r1: 0.08, headY: 0.16, headZ: 0.02 },
    headTilt: -0.6,
    head: {
      skull: [0.1, 0.095, 0.12],
      skullTint: () => W(1.0),
      cheekTint: () => W(1.24, 1.2, 1.12),
      muzzle: { z0: 0.06, z1: 0.24, r0: 0.055, r1: 0.038, y0: 0, y1: -0.025, tint: 0.94, ry0: 0.92, ry1: 0.88 },
      nose: { w: 0.03, h: 0.022, d: 0.02, y: -0.035, z: 0.25, color: 0x14100c },
      eyes: { x: 0.065, y: 0.035, z: 0.07, r: 0.022, iris: 0xc98a1a, rim: 0x201810 },
      ears: { type: 'pointed', x: 0.075, y: 0.11, z: -0.02, r: 0.035, h: 0.14, out: -0.2, tilt: 0.05, yaw: 0.15, innerColor: 0x3a2418 },
      teeth: true,
      tongue: true,
      jaw: { y: -0.04, z: 0.03, open: 0.01 },
    },
    tail: { z: -0.36, y: 0.08, segs: 4, len: 0.14, r0: 0.07, r1: 0.05, mat: fur, fluff: true, fluffColor: W(1.0), fluffTip: W(1.3, 1.24, 1.16), fluffMat: fur, tint: () => W(1.0) },
    extras: ({ head }) => {
      const cheek = [];
      for (const sd of [-1, 1]) {
        cheek.push(...shardsAround(V(sd * 0.09, -0.02, 0.04), [0.06, 0.06, 0.05], 6, {
          len: 0.08, width: 0.035, tilt: 0.5, sagY: -0.7, sagZ: 0.2,
          color: W(0.98), tip: W(1.06), seg: 6, skip: (nrm) => nrm.x * sd < 0.15,
        }));
      }
      head.add(meshWith(merge(cheek), cream));
    },
  });
  return { root, rig };
}

function buildReindeer() {
  const fur = furMaterial('reindeer-coat');
  const plain = vertexMaterial({ roughness: 0.6 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };
  const { root, rig } = makeQuadruped({
    hipY: 0.98,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.5, 0.06, 0.16, 0.18],
      [0.1, -0.44, 0.08, 0.26, 0.28],
      [0.3, -0.3, 0.04, 0.29, 0.3],
      [0.52, -0.06, 0.0, 0.29, 0.3],
      [0.74, 0.16, 0.06, 0.3, 0.32],
      [0.9, 0.28, 0.1, 0.26, 0.29],
      [1.0, 0.34, 0.02, 0.19, 0.22],
    ],
    steps: 22,
    radial: 16,
    torsoColor: (t, d) => (d.y < -0.35 ? W(1.18, 1.14, 1.06) : d.y > 0.45 ? W(0.94) : W(1.0)),
    legColor: (p) => W(p.y < -0.24 ? 1.14 : 1.0),
    legSpread: 0.19,
    legs: {
      front: { upper: 0.4, lower: 0.36, pastern: 0.11, rTop: 0.08, rMid: 0.055, rBot: 0.045, pawHalf: 0.038, pawLen: 0.12, z: 0.28, toes: 3 },
      back: { upper: 0.42, lower: 0.38, pastern: 0.1, rTop: 0.1, rMid: 0.06, rBot: 0.047, pawHalf: 0.038, pawLen: 0.12, z: -0.34, toes: 3 },
    },
    neck: { pos: [0, 0.2, 0.34], tilt: 0.55, y0: -0.1, y1: 0.3, r0: 0.2, r1: 0.13, headY: 0.3, headZ: 0.04 },
    headTilt: -0.8,
    head: {
      skull: [0.14, 0.135, 0.17],
      skullTint: () => W(1.0),
      muzzle: { z0: 0.08, z1: 0.3, r0: 0.09, r1: 0.065, y0: 0, y1: -0.03, tint: 0.96, ry0: 0.9, ry1: 0.86 },
      nose: { w: 0.045, h: 0.03, d: 0.025, y: -0.05, z: 0.31, color: 0x241c16 },
      eyes: { x: 0.09, y: 0.04, z: 0.09, r: 0.026, iris: 0x2a1c10, rim: 0x241a12 },
      ears: { type: 'pointed', x: 0.1, y: 0.15, z: -0.03, r: 0.042, h: 0.13, out: -0.6, tilt: -0.05, yaw: 0.35, innerColor: 0x4a3a2c },
      teeth: false,
      tongue: false,
      jaw: { y: -0.05, z: 0.04, open: 0 },
    },
    tail: { z: -0.54, y: 0.16, segs: 2, len: 0.08, r0: 0.035, r1: 0.022, mat: fur, tint: () => W(1.1, 1.06, 1.0) },
    extras: ({ head, rig }) => {
      const antlers = [];
      for (const sd of [-1, 1]) {
        antlers.push({ geo: unitCone(5), pos: [sd * 0.06, 0.16, 0.0], rot: [-0.2, 0, sd * 0.3], scale: [0.02, 0.42, 0.02], color: 0x7c6a52 });
        antlers.push({ geo: unitCone(4), pos: [sd * 0.12, 0.4, -0.02], rot: [-0.1, 0, sd * 1.1], scale: [0.016, 0.28, 0.016], color: 0x7c6a52 });
        antlers.push({ geo: unitCone(4), pos: [sd * 0.04, 0.42, 0.06], rot: [0.9, 0, sd * 0.3], scale: [0.014, 0.2, 0.014], color: 0x7c6a52 });
      }
      head.add(meshWith(merge(antlers), plain));
      // 목 털
      const neckFur = shardsAround(V(0, -0.02, 0.06), [0.22, 0.2, 0.16], 18, {
        len: 0.14, width: 0.055, tilt: 0.55, sagY: -1, sagZ: -0.2,
        color: W(0.96), tip: W(1.1), seg: 6,
      });
      const m = meshWith(merge(neckFur), fur);
      rig.neck.add(m);
    },
  });
  return { root, rig };
}

function buildArcticFox() {
  const fur = furMaterial('arcticfox-coat');
  const plain = vertexMaterial({ roughness: 0.7 });
  const eyeMat = vertexMaterial({ roughness: 0.2 });
  const mats = { fur, light: fur, plain, eye: eyeMat, jaw: fur };
  const { root, rig } = makeQuadruped({
    hipY: 0.58,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.32, 0.03, 0.11, 0.12],
      [0.1, -0.26, 0.05, 0.17, 0.18],
      [0.32, -0.15, 0.01, 0.18, 0.19],
      [0.56, 0.0, -0.01, 0.17, 0.18],
      [0.78, 0.13, 0.03, 0.18, 0.19],
      [0.92, 0.21, 0.03, 0.15, 0.17],
      [1.0, 0.25, -0.01, 0.11, 0.13],
    ],
    steps: 18,
    radial: 14,
    torsoColor: (t, d) => (d.y < -0.3 ? W(1.04) : W(0.99)),
    legColor: (p) => W(p.y < -0.14 ? 0.98 : 1.0),
    legSpread: 0.12,
    legs: {
      front: { upper: 0.22, lower: 0.19, pastern: 0.07, rTop: 0.055, rMid: 0.038, rBot: 0.032, pawHalf: 0.028, pawLen: 0.08, z: 0.18, toes: 3 },
      back: { upper: 0.23, lower: 0.2, pastern: 0.06, rTop: 0.06, rMid: 0.04, rBot: 0.033, pawHalf: 0.028, pawLen: 0.08, z: -0.24, toes: 3 },
    },
    neck: { pos: [0, 0.08, 0.24], tilt: 0.5, y0: -0.06, y1: 0.14, r0: 0.11, r1: 0.085, headY: 0.16, headZ: 0.02 },
    headTilt: -0.6,
    head: {
      skull: [0.105, 0.1, 0.12],
      skullTint: () => W(1.0),
      muzzle: { z0: 0.06, z1: 0.23, r0: 0.058, r1: 0.04, y0: 0, y1: -0.025, tint: 0.98, ry0: 0.94, ry1: 0.9 },
      nose: { w: 0.03, h: 0.02, d: 0.02, y: -0.035, z: 0.24, color: 0x201a16 },
      eyes: { x: 0.065, y: 0.035, z: 0.07, r: 0.02, iris: 0x8a6a2a, rim: 0x2a241c },
      ears: { type: 'round', x: 0.08, y: 0.1, z: -0.02, r: 0.032, h: 0.035, out: -0.3, tilt: 0, yaw: 0.2, innerColor: 0x9a958c },
      teeth: false,
      tongue: false,
      jaw: { y: -0.04, z: 0.03, open: 0 },
    },
    tail: { z: -0.34, y: 0.08, segs: 4, len: 0.12, r0: 0.065, r1: 0.045, mat: fur, fluff: true, fluffColor: W(1.0), fluffTip: W(1.05), fluffMat: fur, tint: () => W(1.0) },
  });
  return { root, rig };
}

function buildPuffin() {
  // 설원/바다의 작은 새 (빠른 제작용 단순 모델)
  const fur = furMaterial('arcticfox-coat');
  const plain = vertexMaterial({ roughness: 0.6 });
  const mats = { fur, light: fur, plain, eye: vertexMaterial({ roughness: 0.2 }), jaw: fur };
  const { root, rig } = makeQuadruped({
    hipY: 0.42,
    mat: fur,
    mats,
    torso: [
      [0.0, -0.16, 0.0, 0.1, 0.1],
      [0.2, -0.1, 0.02, 0.15, 0.16],
      [0.6, 0.04, 0.02, 0.16, 0.17],
      [0.9, 0.1, 0.04, 0.12, 0.13],
      [1.0, 0.12, 0.04, 0.08, 0.09],
    ],
    steps: 14,
    radial: 12,
    torsoColor: (t, d) => (d.y < -0.2 ? W(0.3) : W(1.0)),
    legColor: () => W(0.9),
    legSpread: 0.08,
    legs: {
      front: { upper: 0.12, lower: 0.1, pastern: 0.04, rTop: 0.03, rMid: 0.02, rBot: 0.018, pawHalf: 0.016, pawLen: 0.05, z: 0.08, toes: 3 },
      back: { upper: 0.12, lower: 0.1, pastern: 0.04, rTop: 0.032, rMid: 0.021, rBot: 0.018, pawHalf: 0.016, pawLen: 0.05, z: -0.1, toes: 3 },
    },
    neck: { pos: [0, 0.06, 0.12], tilt: 0.2, y0: -0.04, y1: 0.08, r0: 0.08, r1: 0.065, headY: 0.1, headZ: 0.02 },
    headTilt: -0.2,
    head: {
      skull: [0.09, 0.085, 0.1],
      skullTint: () => W(1.0),
      muzzle: { z0: 0.06, z1: 0.16, r0: 0.04, r1: 0.028, y0: -0.01, y1: -0.02, tint: 0.9, ry0: 0.9, ry1: 0.86 },
      nose: { w: 0.025, h: 0.02, d: 0.02, y: -0.03, z: 0.17, color: 0x2a2018 },
      eyes: { x: 0.055, y: 0.02, z: 0.06, r: 0.018, iris: 0x1a1612, rim: 0x2a241c },
      ears: { type: 'round', x: 0.05, y: 0.08, z: 0, r: 0.016, h: 0.018, out: 0, tilt: 0, yaw: 0 },
      teeth: false,
      tongue: false,
      jaw: { y: -0.03, z: 0.02, open: 0 },
    },
    tail: { z: -0.2, y: 0.06, segs: 2, len: 0.06, r0: 0.05, r1: 0.04, mat: fur, fluff: true, fluffColor: W(0.2), fluffTip: W(0.25), fluffMat: fur, tint: () => W(0.35) },
    extras: ({ body }) => {
      const wings = [];
      for (const sd of [-1, 1]) {
        wings.push(sphPart(0.05, 0.1, 0.02, { pos: [sd * 0.16, 0.08, 0.02], rot: [0, 0, sd * 0.2], color: 0x2a2a2a }));
      }
      body.add(meshWith(merge(wings), plain));
    },
  });
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
    biomes: ['savanna'],
    desc: '묵직한 앞발과 위압적인 포효로 무리를 몰아냅니다.',
    hp: 150, walk: 4.5, run: 9.6, accel: 30, turn: 9, jump: 7.6, radius: 0.6,
    stats: { power: 5, speed: 4, tough: 4 },
    attack: { name: '앞발 할퀴기', short: '할퀴기', range: 3.6, arc: 2.5, damage: 26, knock: 8, cd: 0.62, dur: 0.62, hitAt: 0.36, lunge: 1.0, sound: 'slash' },
    skills: [
      { id: 'roar', impl: 'roar', name: '사자의 포효', short: '포효', icon: '📣', key: 'K', cd: 9, desc: '충격파로 주변 적을 밀쳐내고 1.8초 동안 기절시킵니다.' },
      { id: 'pounce', impl: 'pounce', name: '맹수의 도약', short: '도약', icon: '🌀', key: 'L', cd: 7.5, desc: '앞으로 길게 도약해 착지 지점을 강하게 내리칩니다.' },
    ],
    anim: { gaitAmp: 0.62, bob: 0.05, sway: 0.055, gaitRate: 1.5, tailAmp: 0.32, headBob: 0.05 },
    build: bLion,
  },
  tiger: {
    id: 'tiger',
    name: '호랑이',
    emoji: '🐯',
    tagline: '숲의 지배자',
    accent: '#e8853a',
    biomes: ['forest'],
    desc: '주황빛 줄무늬와 단단한 앞발. 조용히 다가가 한 번에 덮칩니다.',
    hp: 160, walk: 4.8, run: 10.2, accel: 32, turn: 10, jump: 8.0, radius: 0.62,
    stats: { power: 5, speed: 4, tough: 4 },
    attack: { name: '앞발 연타', short: '할퀴기', range: 3.6, arc: 2.4, damage: 29, knock: 9, cd: 0.58, dur: 0.56, hitAt: 0.3, lunge: 1.3, sound: 'slash' },
    skills: [
      { id: 'tigerdash', impl: 'dash', name: '맹호 돌진', short: '돌진', icon: '🐾', key: 'K', cd: 7, desc: '낮게 몸을 날려 앞으로 돌진하며 지나치는 적을 베어냅니다.' },
      { id: 'tigerroar', impl: 'roar', name: '호랑이 포효', short: '포효', icon: '📣', key: 'L', cd: 10, desc: '숲을 울리는 포효로 주변 적을 기절시킵니다.' },
    ],
    anim: { gaitAmp: 0.66, bob: 0.05, sway: 0.055, gaitRate: 1.55, tailAmp: 0.34, headBob: 0.05 },
    build: bTiger,
  },
  cheetah: {
    id: 'cheetah',
    name: '치타',
    emoji: '🐆',
    tagline: '폭풍의 질주자',
    accent: '#f0b55c',
    biomes: ['savanna'],
    desc: '가장 빠른 발. 짧고 빠른 연속 할퀴기로 순식간에 거리를 좁힙니다.',
    hp: 110, walk: 5.8, run: 13.6, accel: 42, turn: 12, jump: 8.4, radius: 0.5,
    stats: { power: 3, speed: 5, tough: 2 },
    attack: { name: '연속 할퀴기', short: '연타', range: 3.2, arc: 1.9, damage: 15, knock: 4, cd: 0.32, dur: 0.34, hitAt: 0.16, lunge: 1.6, sound: 'slash' },
    skills: [
      { id: 'cheetahdash', impl: 'dash', name: '전력 질주', short: '질주', icon: '💨', key: 'K', cd: 5, desc: '폭발적인 가속으로 앞으로 내달려 지나치는 적을 베어냅니다.' },
      { id: 'cheetahpounce', impl: 'pounce', name: '사냥의 도약', short: '도약', icon: '🌀', key: 'L', cd: 7, desc: '멀리 뛰어올라 착지 지점의 적을 덮칩니다.' },
    ],
    anim: { gaitAmp: 0.8, bob: 0.06, sway: 0.04, gaitRate: 1.9, tailAmp: 0.42, headBob: 0.06 },
    build: bCheetah,
  },
  elephant: {
    id: 'elephant',
    name: '아프리카 코끼리',
    emoji: '🐘',
    tagline: '초원의 거인',
    accent: '#b9a48a',
    biomes: ['savanna'],
    desc: '코와 상아, 거대한 몸. 한 번의 돌진으로 앞을 지웁니다.',
    hp: 250, walk: 3.8, run: 7.6, accel: 18, turn: 5.5, jump: 5.4, radius: 0.95,
    stats: { power: 5, speed: 3, tough: 5 },
    attack: { name: '코 후려치기', short: '코', range: 4.4, arc: 2.4, damage: 40, knock: 14, cd: 0.95, dur: 0.86, hitAt: 0.44, lunge: 0.6, sound: 'slam' },
    skills: [
      { id: 'tuskcharge', impl: 'charge', name: '상아 돌진', short: '돌진', icon: '🦷', key: 'K', cd: 10, desc: '상아를 앞세우고 돌진해 부딪히는 적을 멀리 날려버립니다.' },
      { id: 'quake', impl: 'stomp', name: '대지 발구르기', short: '발구르기', icon: '💥', key: 'L', cd: 9, desc: '발을 구르며 반경 9m에 충격파를 일으켜 적을 기절시킵니다.' },
    ],
    anim: { gaitAmp: 0.42, bob: 0.05, sway: 0.06, gaitRate: 1.15, tailAmp: 0.22, headBob: 0.04 },
    build: bElephant,
  },
  rhino: {
    id: 'rhino',
    name: '코뿔소',
    emoji: '🦏',
    tagline: '갑옷의 분노',
    accent: '#9a9a92',
    biomes: ['savanna'],
    desc: '두꺼운 가죽과 큰 뿔. 멈추지 않는 돌진은 막을 수 없습니다.',
    hp: 230, walk: 3.6, run: 8.6, accel: 20, turn: 6, jump: 5.2, radius: 0.9,
    stats: { power: 5, speed: 3, tough: 5 },
    attack: { name: '뿔 치받기', short: '치받기', range: 4.0, arc: 2.0, damage: 38, knock: 15, cd: 0.9, dur: 0.78, hitAt: 0.34, lunge: 1.2, sound: 'slam' },
    skills: [
      { id: 'rhinocharge', impl: 'charge', name: '광란의 돌진', short: '돌진', icon: '🔥', key: 'K', cd: 9, desc: '뿔을 앞세우고 미친 듯이 돌진합니다.' },
      { id: 'hornToss', impl: 'stomp', name: '땅뜨기', short: '땅뜨기', icon: '💥', key: 'L', cd: 8, desc: '뿔로 땅을 파올려 주변 적을 띄우고 기절시킵니다.' },
    ],
    anim: { gaitAmp: 0.46, bob: 0.05, sway: 0.07, gaitRate: 1.2, tailAmp: 0.18, headBob: 0.04 },
    build: bRhino,
  },
  wolf: {
    id: 'wolf',
    name: '늑대',
    emoji: '🐺',
    tagline: '달빛의 추격자',
    accent: '#8fb4e8',
    biomes: ['forest', 'snow'],
    desc: '빠른 발과 날카로운 송곳니, 무리의 울부짖음으로 사냥합니다.',
    hp: 125, walk: 5.0, run: 10.8, accel: 36, turn: 11, jump: 8.2, radius: 0.5,
    stats: { power: 3, speed: 5, tough: 3 },
    attack: { name: '송곳니 물기', short: '물기', range: 3.1, arc: 1.5, damage: 20, knock: 4, cd: 0.45, dur: 0.46, hitAt: 0.22, lunge: 1.6, sound: 'bite' },
    skills: [
      { id: 'dash', impl: 'dash', name: '달빛 질주', short: '질주', icon: '🌙', key: 'K', cd: 6, desc: '달빛을 남기며 앞으로 돌진해 지나치는 적을 베어냅니다.' },
      { id: 'howl', impl: 'howl', name: '무리 울부짖기', short: '울부짖기', icon: '🐾', key: 'L', cd: 14, desc: '9초 동안 이동 속도와 공격력이 35% 증가합니다.' },
    ],
    anim: { gaitAmp: 0.72, bob: 0.05, sway: 0.045, gaitRate: 1.65, tailAmp: 0.36, headBob: 0.05 },
    build: bWolf,
  },
  bear: {
    id: 'bear',
    name: '곰',
    emoji: '🐻',
    tagline: '대지의 분노',
    accent: '#c98a52',
    biomes: ['forest'],
    desc: '거대한 몸으로 내리치고, 땅을 울려 적을 띄웁니다.',
    hp: 200, walk: 4.0, run: 8.2, accel: 22, turn: 7, jump: 6.8, radius: 0.78,
    stats: { power: 5, speed: 2, tough: 5 },
    attack: { name: '묵직한 내리치기', short: '내리치기', range: 4.0, arc: 2.7, damage: 34, knock: 11, cd: 0.85, dur: 0.8, hitAt: 0.44, lunge: 0.8, sound: 'slam' },
    skills: [
      { id: 'stomp', impl: 'stomp', name: '대지 강타', short: '강타', icon: '💥', key: 'K', cd: 8, desc: '땅을 내리쳐 반경 8m에 충격파를 일으키고 적을 기절시킵니다.' },
      { id: 'charge', impl: 'charge', name: '광폭 돌진', short: '돌진', icon: '🔥', key: 'L', cd: 10, desc: '앞으로 미친 듯이 돌진해 부딪히는 적을 날려버립니다.' },
    ],
    anim: { gaitAmp: 0.5, bob: 0.055, sway: 0.08, gaitRate: 1.3, tailAmp: 0.2, headBob: 0.04 },
    build: bBear,
  },
  polarBear: {
    id: 'polarBear',
    name: '북극곰',
    emoji: '🐻‍❄️',
    tagline: '빙원의 거수',
    accent: '#cfe3f2',
    biomes: ['snow'],
    desc: '눈밭에 녹아드는 흰 거구. 얼음장 같은 일격을 내립니다.',
    hp: 210, walk: 4.0, run: 8.4, accel: 24, turn: 7.5, jump: 7.0, radius: 0.8,
    stats: { power: 5, speed: 2, tough: 5 },
    attack: { name: '얼음 내리치기', short: '내리치기', range: 4.0, arc: 2.6, damage: 35, knock: 12, cd: 0.84, dur: 0.8, hitAt: 0.42, lunge: 0.9, sound: 'slam' },
    skills: [
      { id: 'iceSmash', impl: 'stomp', name: '얼음 강타', short: '강타', icon: '❄️', key: 'K', cd: 8, desc: '얼어붙은 땅을 내리쳐 충격파를 일으킵니다.' },
      { id: 'frostRoar', impl: 'roar', name: '서리 포효', short: '포효', icon: '🌬️', key: 'L', cd: 11, desc: '차가운 포효로 주변 적을 얼려 기절시킵니다.' },
    ],
    anim: { gaitAmp: 0.5, bob: 0.055, sway: 0.075, gaitRate: 1.35, tailAmp: 0.18, headBob: 0.04 },
    build: bPolar,
  },
  anaconda: {
    id: 'anaconda',
    name: '아나콘다',
    emoji: '🐍',
    tagline: '수풀의 포식자',
    accent: '#7fae5c',
    biomes: ['forest'],
    desc: '소리 없이 다가가 조여 오는 거대한 뱀. 압박하면 벗어날 수 없습니다.',
    hp: 140, walk: 4.3, run: 8.6, accel: 26, turn: 8, jump: 6.2, radius: 0.55,
    stats: { power: 4, speed: 4, tough: 4 },
    attack: { name: '기습 물기', short: '물기', range: 3.4, arc: 1.15, damage: 22, knock: 3.5, cd: 0.52, dur: 0.5, hitAt: 0.2, lunge: 2.0, sound: 'bite' },
    skills: [
      { id: 'constrict', impl: 'constrict', name: '압박하기', short: '압박', icon: '🌀', key: 'K', cd: 9, desc: '가까운 적에게 달려들어 2초 동안 조여 옥죄며 지속 피해를 줍니다.' },
      { id: 'tailslam', impl: 'tailslam', name: '꼬리 강타', short: '꼬리', icon: '💢', key: 'L', cd: 7, desc: '꼬리를 크게 휘둘러 주변 적을 강하게 날려버립니다.' },
    ],
    anim: { gaitAmp: 0.05, bob: 0.02, sway: 0.02, gaitRate: 1.2, tailAmp: 0.2, headBob: 0.03, serpent: true },
    build: bAnaconda,
  },
  shark: {
    id: 'shark',
    name: '백상아리',
    emoji: '🦈',
    tagline: '푸른 심연의 이빨',
    accent: '#7fa8c4',
    biomes: ['ocean'],
    desc: '등푸른 회색 몸과 흰 배. 물속에서 순식간에 사라졌다 나타납니다.',
    hp: 165, walk: 5.2, run: 10.4, accel: 30, turn: 7, jump: 6.6, radius: 0.7,
    stats: { power: 5, speed: 4, tough: 3 },
    attack: { name: '턱 물기', short: '물기', range: 3.8, arc: 1.5, damage: 30, knock: 8, cd: 0.6, dur: 0.56, hitAt: 0.24, lunge: 1.8, sound: 'bite' },
    skills: [
      { id: 'frenzy', impl: 'dash', name: '혈흔 돌진', short: '돌진', icon: '🩸', key: 'K', cd: 7, desc: '물살을 가르며 돌진해 지나치는 적을 물어뜯습니다.' },
      { id: 'sharktail', impl: 'tailslam', name: '꼬리지느러미 강타', short: '꼬리', icon: '🌊', key: 'L', cd: 8, desc: '거대한 꼬리로 주변을 후려쳐 적을 날려버립니다.' },
    ],
    anim: { gaitAmp: 0.05, bob: 0.03, sway: 0.07, gaitRate: 1.3, tailAmp: 0.45, headBob: 0.02, serpent: true },
    build: bShark,
  },
  orca: {
    id: 'orca',
    name: '범고래',
    emoji: '🐋',
    tagline: '검은 파도의 왕',
    accent: '#3b4a5a',
    biomes: ['ocean'],
    desc: '광택 나는 검은 몸과 흰 눈 패치. 거대한 몸으로 밀어붙입니다.',
    hp: 210, walk: 4.7, run: 9.2, accel: 24, turn: 6, jump: 6.4, radius: 0.85,
    stats: { power: 5, speed: 3, tough: 4 },
    attack: { name: '몸통 박치기', short: '박치기', range: 4.2, arc: 2.0, damage: 34, knock: 13, cd: 0.8, dur: 0.72, hitAt: 0.32, lunge: 1.2, sound: 'slam' },
    skills: [
      { id: 'breach', impl: 'pounce', name: '브리칭 강타', short: '브리칭', icon: '💦', key: 'K', cd: 8, desc: '물 밖으로 솟구쳤다 그대로 내리쳐 커다란 충격을 줍니다.' },
      { id: 'sonar', impl: 'roar', name: '초음파 파동', short: '초음파', icon: '🔊', key: 'L', cd: 10, desc: '초음파가 사방으로 퍼져 적을 기절시킵니다.' },
    ],
    anim: { gaitAmp: 0.05, bob: 0.035, sway: 0.05, gaitRate: 1.15, tailAmp: 0.4, headBob: 0.02, serpent: true },
    build: bOrca,
  },
  octopus: {
    id: 'octopus',
    name: '대왕문어',
    emoji: '🐙',
    tagline: '여덟 팔의 포식자',
    accent: '#d9743f',
    biomes: ['ocean'],
    desc: '여덟 개의 팔과 먹물. 붙잡히면 빠져나올 수 없습니다.',
    hp: 145, walk: 4.4, run: 8.2, accel: 28, turn: 9, jump: 6.0, radius: 0.7,
    stats: { power: 4, speed: 3, tough: 4 },
    attack: { name: '촉수 채찍', short: '채찍', range: 3.6, arc: 2.2, damage: 24, knock: 7, cd: 0.55, dur: 0.5, hitAt: 0.24, lunge: 1.0, sound: 'slash' },
    skills: [
      { id: 'ink', impl: 'roar', name: '먹물 분사', short: '먹물', icon: '🖤', key: 'K', cd: 9, desc: '검은 먹물을 뿜어 주변 적을 휘감고 기절시킵니다.' },
      { id: 'crush', impl: 'constrict', name: '8다리 휘감기', short: '휘감기', icon: '🌀', key: 'L', cd: 8, desc: '가까운 적을 여덟 팔로 감아 조이며 지속 피해를 줍니다.' },
    ],
    anim: { gaitAmp: 0.05, bob: 0.04, sway: 0.03, gaitRate: 1.2, tailAmp: 0.2, headBob: 0.03, serpent: true },
    build: bOctopus,
  },
};

// 지형별 야생 AI — 한 마리씩 다른 종이 섞이도록
export const ENEMY_TYPES = {
  boar: { build: (tint) => buildBoar(tint), hp: 72, speed: 4.0, damage: 12, scale: 1, name: '멧돼지' },
  alpha: { build: (tint) => buildBoar(tint ?? 0x53402c), hp: 165, speed: 4.7, damage: 20, scale: 1.35, name: '대형 멧돼지' },
  zebra: { build: () => buildZebra(), hp: 85, speed: 5.2, damage: 13, scale: 1, name: '얼룩말' },
  hyena: { build: () => buildHyena(), hp: 78, speed: 5.6, damage: 15, scale: 1, name: '하이에나' },
  warthog: { build: () => buildWarthog(), hp: 68, speed: 4.8, damage: 12, scale: 1, name: '혹멧돼지' },
  deer: { build: () => buildDeer(), hp: 65, speed: 5.4, damage: 10, scale: 1, name: '사슴' },
  fox: { build: () => buildFox(), hp: 52, speed: 5.8, damage: 9, scale: 1, name: '붉은여우' },
  reindeer: { build: () => buildReindeer(), hp: 88, speed: 5.0, damage: 13, scale: 1, name: '순록' },
  arcticFox: { build: () => buildArcticFox(), hp: 50, speed: 6.0, damage: 9, scale: 1, name: '북극여우' },
  turtle: { build: () => buildTurtle(), hp: 110, speed: 2.6, damage: 10, scale: 1.15, name: '바다거북' },
  manta: { build: () => buildManta(), hp: 90, speed: 4.4, damage: 12, scale: 1, name: '가오리' },
  marlin: { build: () => buildMarlin(), hp: 80, speed: 6.2, damage: 15, scale: 1, name: '청새치' },
};

// 지형별로 4~6마리만 — 서로 다른 종이 섞인다
export const BIOME_MOBS = {
  savanna: ['zebra', 'hyena', 'warthog', 'zebra', 'hyena'],
  forest: ['boar', 'deer', 'fox', 'deer', 'boar'],
  snow: ['reindeer', 'arcticFox', 'reindeer', 'arcticFox'],
  ocean: ['turtle', 'manta', 'marlin', 'turtle', 'marlin'],
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
