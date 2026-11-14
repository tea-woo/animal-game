// 아레나 — 사바나/숲 지형, 조명, 장식
import THREE from './three.js';
import { ellipsoid, cylinder, cone, material } from './builders.js';
import { clamp, fbm, rand, smoothstep, TAU } from './util.js';

export const ARENA_RADIUS = 40;

export function buildWorld(scene, opts = {}) {
  const group = new THREE.Group();
  scene.add(group);

  const mobile = !!opts.mobile;

  // ── 하늘 ────────────────────────────────────────────────
  const skyGeo = new THREE.SphereGeometry(320, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e5f93) },
      mid: { value: new THREE.Color(0x9dc0d6) },
      bottom: { value: new THREE.Color(0xffd9a1) },
    },
    vertexShader: `varying float vH;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vH = normalize(wp.xyz).y;
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying float vH;
      void main(){
        float h = clamp(vH, -0.2, 1.0);
        vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.22, h));
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  group.add(sky);

  scene.fog = new THREE.Fog(0xe6d3ab, 70, 210);

  // ── 조명 ────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6b5a35, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0cc, 2.15);
  sun.position.set(38, 46, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x9ec2ff, 0.45);
  rim.position.set(-30, 18, -28);
  scene.add(rim);

  const amb = new THREE.AmbientLight(0xffe6bf, 0.25);
  scene.add(amb);

  // ── 지면 ────────────────────────────────────────────────
  const RAD = 78;
  const segs = mobile ? 72 : 112;
  const groundGeo = new THREE.CircleGeometry(RAD, segs, 0, TAU);
  groundGeo.rotateX(-Math.PI / 2);

  const pos = groundGeo.attributes.position;
  const colors = [];
  const cGold = new THREE.Color(0x9c8a4e);
  const cGold2 = new THREE.Color(0xb5a05c);
  const cGreen = new THREE.Color(0x6d7c40);
  const cDirt = new THREE.Color(0x8a7448);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    // 중앙은 평평하게, 바깥으로 갈수록 기복
    const falloff = smoothstep(ARENA_RADIUS * 0.75, RAD * 0.95, r);
    const h = (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 5.2 * falloff + (fbm(x * 0.16, z * 0.16, 2) - 0.5) * 0.35 * (1 - falloff);
    pos.setY(i, h);

    const patch = fbm(x * 0.09 + 11, z * 0.09 - 7, 3);
    const ring = smoothstep(30, 44, r);
    tmp.copy(cGold).lerp(cGold2, fbm(x * 0.3, z * 0.3, 2));
    tmp.lerp(cGreen, clamp((patch - 0.5) * 1.7, 0, 0.65) * (0.4 + ring * 0.5));
    tmp.lerp(cDirt, smoothstep(14, 3, r) * 0.35);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 })
  );
  ground.receiveShadow = true;
  group.add(ground);

  // ── 아레나 경계 표시 ────────────────────────────────────
  const ringGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.5, ARENA_RADIUS + 0.2, 96);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0xffd489, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  ringMesh.position.y = 0.03;
  group.add(ringMesh);

  // ── 풀 (인스턴스) ───────────────────────────────────────
  const grassGeo = new THREE.ConeGeometry(0.07, 0.62, 3, 1, true);
  grassGeo.translate(0, 0.31, 0);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x8d9145, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const grassCount = mobile ? 700 : 1300;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  grass.castShadow = false;
  grass.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const grassColor = new THREE.Color();
  for (let i = 0; i < grassCount; i++) {
    const a = Math.random() * TAU;
    const r = 3 + Math.sqrt(Math.random()) * (RAD - 8);
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const s = 0.6 + Math.random() * 1.5;
    dummy.scale.set(s * (0.7 + Math.random() * 0.6), s, s * (0.7 + Math.random() * 0.6));
    dummy.rotation.y = Math.random() * TAU;
    dummy.rotation.z = (Math.random() - 0.5) * 0.18;
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grassColor.setHSL(0.16 + Math.random() * 0.07, 0.35 + Math.random() * 0.2, 0.28 + Math.random() * 0.16);
    grass.setColorAt(i, grassColor);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.frustumCulled = false;
  group.add(grass);

  // ── 나무 ────────────────────────────────────────────────
  const treeCount = mobile ? 14 : 22;
  const trunkMat = material(0x5a4530, { roughness: 0.95 });
  const trunkMat2 = material(0x6b5238, { roughness: 0.95 });
  const leafMats = [material(0x4a6b31, { roughness: 0.95, flat: true }), material(0x5c7d3a, { roughness: 0.95, flat: true }), material(0x3d5a29, { roughness: 0.95, flat: true })];

  for (let i = 0; i < treeCount; i++) {
    const a = (i / treeCount) * TAU + rand(-0.14, 0.14);
    const r = rand(ARENA_RADIUS * 0.72, RAD * 0.92);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    const h = rand(4.2, 7.4);
    const trunk = cylinder(rand(0.16, 0.26), rand(0.3, 0.46), h, 0x5a4530, { seg: 6 });
    trunk.position.y = h / 2;
    trunk.rotation.z = rand(-0.06, 0.06);
    tree.add(trunk);

    // 가지
    const branches = 2 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branches; b++) {
      const ba = Math.random() * TAU;
      const br = rand(0.8, 1.8);
      const bh = rand(0.5, 1.1);
      const branch = cylinder(0.07, 0.13, br, 0x5a4530, { seg: 5 });
      branch.position.set(Math.cos(ba) * br * 0.42, h * rand(0.72, 0.95), Math.sin(ba) * br * 0.42);
      branch.rotation.z = Math.cos(ba) * 0.85;
      branch.rotation.x = -Math.sin(ba) * 0.85;
      tree.add(branch);
    }

    // 우산형 캐노피
    const canopyY = h + rand(-0.3, 0.5);
    const layers = 3 + Math.floor(Math.random() * 2);
    for (let l = 0; l < layers; l++) {
      const cw = rand(2.0, 3.6);
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(1, 7, 5),
        leafMats[Math.floor(Math.random() * leafMats.length)]
      );
      leaf.scale.set(cw, rand(0.5, 0.9), cw * rand(0.8, 1.15));
      leaf.position.set(rand(-1.3, 1.3), canopyY + rand(-0.4, 0.5), rand(-1.3, 1.3));
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      tree.add(leaf);
    }
    tree.rotation.y = Math.random() * TAU;
    group.add(tree);
  }

  // ── 바위 ────────────────────────────────────────────────
  const rockMats = [material(0x8b8578, { roughness: 0.95, flat: true }), material(0x756f63, { roughness: 0.95, flat: true }), material(0x9a9384, { roughness: 0.95, flat: true })];
  const rockCount = mobile ? 16 : 26;
  for (let i = 0; i < rockCount; i++) {
    const a = Math.random() * TAU;
    const r = rand(10, RAD * 0.9);
    const s = rand(0.5, 2.6);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), rockMats[Math.floor(Math.random() * rockMats.length)]);
    rock.scale.set(s * rand(0.8, 1.6), s * rand(0.5, 1.0), s * rand(0.8, 1.5));
    rock.position.set(Math.cos(a) * r, s * 0.18, Math.sin(a) * r);
    rock.rotation.set(Math.random(), Math.random() * TAU, Math.random() * 0.4);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  // ── 먼 산 ───────────────────────────────────────────────
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + rand(-0.1, 0.1);
    const r = rand(150, 235);
    const hh = rand(22, 52);
    const m = cone(rand(30, 62), hh, 0x6f7d84, { seg: 5, flat: true });
    m.material = new THREE.MeshStandardMaterial({ color: 0x7a8890, roughness: 1, flatShading: true });
    m.position.set(Math.cos(a) * r, hh / 2 - 6, Math.sin(a) * r);
    m.rotation.y = Math.random() * TAU;
    group.add(m);
  }

  // ── 공중 부유물 ─────────────────────────────────────────
  const moteCount = mobile ? 120 : 240;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * 46;
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = rand(0.3, 9);
    motePos[i * 3 + 2] = Math.sin(a) * r;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({ color: 0xffe9b8, size: 0.14, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  group.add(motes);

  // 태양 광휘
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  sunSprite.scale.set(70, 70, 1);
  sunSprite.position.copy(sun.position).multiplyScalar(4.2);
  group.add(sunSprite);

  let t = 0;
  return {
    group,
    ground,
    radius: ARENA_RADIUS,
    sun,
    update(dt) {
      t += dt;
      motes.rotation.y = t * 0.012;
      motes.position.y = Math.sin(t * 0.35) * 0.25;
      ringMesh.material.opacity = 0.13 + Math.sin(t * 0.9) * 0.04;
    },
  };
}
