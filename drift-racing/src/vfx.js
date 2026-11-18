// 이펙트 — 타이어 스키드마크, 드리프트 연기, 니트로 화염·불꽃
import THREE from './three.js?v=20261118b';
import { smokeTexture } from './textures.js?v=20261118b';
import { rand } from './util.js?v=20261118b';

/* ── 스키드마크 (링 버퍼) ─────────────────────────────── */
export class SkidMarks {
  constructor(scene, max = 3200) {
    this.max = max;
    this.cursor = 0;
    this.count = 0;
    this.arr = new Float32Array(max * 6 * 3);
    const g = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this.arr, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x08090c, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  add(x1, z1, x2, z2, width = 0.26, y = 0.055) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.02 || len > 6) return;
    const nx = (dz / len) * width, nz = (-dx / len) * width;
    const i = this.cursor * 18;
    const a = this.arr;
    // 삼각형 1
    a[i] = x1 - nx; a[i + 1] = y; a[i + 2] = z1 - nz;
    a[i + 3] = x1 + nx; a[i + 4] = y; a[i + 5] = z1 + nz;
    a[i + 6] = x2 + nx; a[i + 7] = y; a[i + 8] = z2 + nz;
    // 삼각형 2
    a[i + 9] = x1 - nx; a[i + 10] = y; a[i + 11] = z1 - nz;
    a[i + 12] = x2 + nx; a[i + 13] = y; a[i + 14] = z2 + nz;
    a[i + 15] = x2 - nx; a[i + 16] = y; a[i + 17] = z2 - nz;

    this.cursor = (this.cursor + 1) % this.max;
    this.count = Math.min(this.max, this.count + 1);
    this.geo.setDrawRange(0, this.count * 6);
    this.geo.attributes.position.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.cursor = 0;
    this.geo.setDrawRange(0, 0);
    this.geo.attributes.position.needsUpdate = true;
  }
}

/* ── GPU 파티클 (연기·불꽃 공용) ──────────────────────── */
const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

class ParticlePool {
  constructor(scene, max, blending) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;

    const map = smokeTexture();
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, grow = 1.6) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.color[i * 3] = color.r; this.color[i * 3 + 1] = color.g; this.color[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha, size } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0;
        continue;
      }
      life[i] -= dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3] *= 1 - 1.6 * dt;
      vel[i * 3 + 1] *= 1 - 1.2 * dt;
      vel[i * 3 + 2] *= 1 - 1.6 * dt;
      vel[i * 3 + 1] += 0.55 * dt;
      size[i] += this.grow[i] * dt;
      alpha[i] = Math.min(1, t * 1.6) * (t > 0.75 ? 1 : t / 0.75);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

/* ── 드리프트 연기 ────────────────────────────────────── */
const SMOKE_COLORS = [
  new THREE.Color(0xf2f6ff),
  new THREE.Color(0x9fe8ff),
  new THREE.Color(0xffc46b),
  new THREE.Color(0xffa257),
];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.skids = new SkidMarks(scene, 3200);
    this.smoke = new ParticlePool(scene, 520, THREE.NormalBlending);
    this.spark = new ParticlePool(scene, 320, THREE.AdditiveBlending);
    this.lastWheel = [{ x: 0, z: 0, ok: false }, { x: 0, z: 0, ok: false }];
    this.tmp = new THREE.Color();
    this.smokeAccum = 0;
  }

  reset() {
    this.skids.clear();
    this.smoke.life.fill(0);
    this.smoke.alpha.fill(0);
    this.spark.life.fill(0);
    this.spark.alpha.fill(0);
    this.lastWheel.forEach((w) => { w.ok = false; });
  }

  // 드리프트/스키드 갱신 (플레이어·AI 공용 — 차량별로 상태를 따로 둔다)
  wheelTrail(car, level, dt, intensity = 1) {
    if (!car._trail) {
      car._trail = [{ x: 0, z: 0, ok: false }, { x: 0, z: 0, ok: false }];
      car._smokeAccum = 0;
    }
    const trail = car._trail;
    const speed = Math.hypot(car.vel.x, car.vel.z);
    if (speed < 3) {
      trail.forEach((w) => { w.ok = false; });
      return;
    }
    const sliding = car.drifting || Math.abs(car.vLat) > 2.2 || car.brake > 0.5;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const w = car.rearWheelWorld(side);
      const prev = trail[s];
      if (sliding && car.drifting) {
        if (prev.ok) this.skids.add(prev.x, prev.z, w.x, w.z, 0.24 + 0.07 * (level || 1), 0.052);
        prev.x = w.x; prev.z = w.z; prev.ok = true;
      } else {
        prev.ok = false;
      }
    }
    // 연기
    if (car.drifting || (sliding && speed > 12)) {
      car._smokeAccum += dt * (car.drifting ? 46 : 14) * intensity;
      const colIdx = car.drifting ? Math.min(3, Math.max(0, (level || 1) - 1)) : 0;
      const col = SMOKE_COLORS[colIdx];
      while (car._smokeAccum > 1) {
        car._smokeAccum -= 1;
        for (let s = 0; s < 2; s++) {
          const w = car.rearWheelWorld(s === 0 ? -1 : 1);
          this.smoke.spawn(
            w.x + rand(-0.35, 0.35), rand(0.12, 0.42), w.z + rand(-0.35, 0.35),
            rand(-1.6, 1.6) - car.vel.x * 0.07, rand(0.3, 1.6), rand(-1.6, 1.6) - car.vel.z * 0.07,
            col, rand(0.8, 1.55) * (car.drifting ? 1.15 : 0.8), rand(0.45, 0.95), 2.2
          );
        }
      }
    } else {
      car._smokeAccum = 0;
    }
  }

  dust(x, z, vx, vz) {
    this.smoke.spawn(x, 0.2, z, vx + rand(-1, 1), rand(0.6, 2), vz + rand(-1, 1),
      new THREE.Color(0xa8946e), rand(0.8, 1.5), rand(0.4, 0.9), 2.4);
  }

  /* 진흙·물 튐 — 웅덩이를 지날 때 차폭에서 튀어 오른다 */
  mudSplash(x, z, vx, vz) {
    this.smoke.spawn(
      x + rand(-0.5, 0.5), rand(0.15, 0.5), z + rand(-0.5, 0.5),
      vx * 0.35 + rand(-1.8, 1.8), rand(1.4, 3.4), vz * 0.35 + rand(-1.8, 1.8),
      new THREE.Color(0x4c3a22), rand(0.5, 1.05), rand(0.3, 0.6), 1.8
    );
  }

  /* 부딫힘 파편 — 바위·통나무·상자에 부딫할 때 흙과 나무 조각 */
  debris(x, y, z, power = 1, kind = 'rock') {
    const p = Math.min(3, Math.max(0.5, power));
    const wood = kind === 'log' || kind === 'crate';
    const col = wood ? new THREE.Color(0xa5763f) : new THREE.Color(0x9b9184);
    const n = Math.round(6 + p * 5);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(2, 5) * (0.6 + p * 0.3);
      this.smoke.spawn(
        x + rand(-0.4, 0.4), y + rand(0.2, 0.9), z + rand(-0.4, 0.4),
        Math.cos(a) * sp, rand(1.2, 3.6), Math.sin(a) * sp,
        col, rand(0.35, 0.8), rand(0.35, 0.8), 0.9
      );
    }
    for (let i = 0; i < 4; i++) {
      this.smoke.spawn(x, y + 0.3, z, rand(-2.6, 2.6), rand(0.6, 1.8), rand(-2.6, 2.6),
        new THREE.Color(0xb5a894), rand(0.9, 1.7), rand(0.3, 0.7), 2.2);
    }
  }

  /* 착지 먼지 — 점프 후 땅에 닿을 때 퍼지는 둥근 먼지 */
  landing(x, y, z, power = 1) {
    const n = Math.round(8 + Math.min(3, power) * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const sp = rand(2.2, 4.4);
      this.smoke.spawn(
        x, y + 0.15, z,
        Math.cos(a) * sp, rand(0.5, 1.4), Math.sin(a) * sp,
        new THREE.Color(0xb0a189), rand(0.9, 1.6), rand(0.4, 0.8), 2.6
      );
    }
  }

  // 충돌 스파크 — 차량끼리/가드레일 접촉 시
  crashSpark(x, y, z, power = 1) {
    const p = Math.max(0.4, Math.min(3, power));
    const n = Math.round(8 + p * 7);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(1.8, 4.6) * (0.7 + p * 0.25);
      this.spark.spawn(
        x, y + rand(-0.1, 0.35), z,
        Math.cos(a) * sp, rand(1.0, 3.8), Math.sin(a) * sp,
        i % 3 === 0 ? new THREE.Color(0xfff4d2) : new THREE.Color(0xffa23d),
        rand(0.3, 0.72), rand(0.16, 0.4), 0.35
      );
    }
    for (let i = 0; i < 3 + Math.round(p); i++) {
      this.smoke.spawn(x, y + 0.2, z, rand(-2.4, 2.4), rand(0.5, 1.6), rand(-2.4, 2.4),
        new THREE.Color(0xb9c2cf), rand(0.9, 1.7), rand(0.3, 0.7), 2.4);
    }
  }

  burst(x, y, z, level) {
    const n = 14 + level * 10;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(2, 7) * (0.6 + level * 0.25);
      this.spark.spawn(
        x, y + rand(-0.2, 0.4), z,
        Math.cos(a) * sp, rand(1.2, 4.2), Math.sin(a) * sp,
        level >= 3 ? new THREE.Color(0xff8b3d) : level === 2 ? new THREE.Color(0x6fe6ff) : new THREE.Color(0xffffff),
        rand(0.5, 1.1), rand(0.25, 0.55), 0.6
      );
    }
    for (let i = 0; i < 10; i++) {
      this.smoke.spawn(x, y + 0.2, z, rand(-3, 3), rand(0.8, 2.4), rand(-3, 3),
        SMOKE_COLORS[Math.min(3, level)], rand(1.2, 2.2), rand(0.5, 1.1), 2.6);
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.spark.update(dt);
  }
}

/* ── 니트로 화염 (차량 뒤에 붙는 콘) ─────────────────── */
export class NitroFlame {
  constructor(carModel) {
    this.group = new THREE.Group();
    const geo = new THREE.ConeGeometry(0.16, 1.5, 10, 1, true);
    geo.translate(0, 0.75, 0);
    geo.rotateX(Math.PI / 2);
    this.coreGeo = geo;
    this.core = [];
    this.glow = [];
    for (const s of [-0.42, 0.42]) {
      const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x2bb7ff, transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      outer.position.set(s, 0.4, -2.26);
      this.group.add(outer);
      this.core.push(outer);
      const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xfff1c4, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      inner.position.set(s, 0.4, -2.24);
      inner.scale.set(0.5, 0.5, 0.6);
      this.group.add(inner);
      this.glow.push(inner);
    }
    this.group.visible = false;
    carModel.add(this.group);
    this.t = 0;
  }

  update(dt, power) {
    this.t += dt;
    if (power <= 0.01) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const flick = 0.82 + Math.sin(this.t * 44) * 0.12 + Math.random() * 0.12;
    const len = Math.min(2.4, 0.7 + power * 0.55) * flick;
    for (const m of this.core) {
      m.scale.set(1, 1, len);
      m.material.opacity = 0.5 + 0.2 * flick;
      m.material.color.setHex(power > 1.8 ? 0x7fd8ff : 0x9fe6ff);
    }
    for (const m of this.glow) {
      m.scale.set(0.55, 0.55, len * 0.7);
      m.material.opacity = 0.85;
    }
  }
}
