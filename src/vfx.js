// 시각 효과 — 참격 호, 충격파, 먼지, 피해 숫자, 조이기 코일, 오라
import THREE from './three.js';
import { makeSoftCircleTexture } from './util.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.shakeAmount = 0;
    this.time = 0;
    this.softTex = new THREE.CanvasTexture(makeSoftCircleTexture(64, 0.3));
    this.softTex.colorSpace = THREE.SRGBColorSpace;
    this.spritePool = [];
    this.numPool = [];
    this.maxSprites = 260;
    this.spriteCount = 0;
  }

  shake(amount) {
    this.shakeAmount = Math.min(1.6, this.shakeAmount + amount);
  }

  // ── 스프라이트 풀 ─────────────────────────────────────────
  _sprite(color, size, opacity = 1, additive = true) {
    let s = this.spritePool.pop();
    if (!s) {
      const mat = new THREE.SpriteMaterial({
        map: this.softTex,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      s = new THREE.Sprite(mat);
      s.renderOrder = 8;
    }
    s.material.color.set(color);
    s.material.opacity = opacity;
    s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.needsUpdate = false;
    s.scale.set(size, size, 1);
    s.visible = true;
    this.scene.add(s);
    this.spriteCount++;
    return s;
  }

  _release(s) {
    this.scene.remove(s);
    this.spritePool.push(s);
    this.spriteCount--;
  }

  _push(item) {
    this.items.push(item);
    return item;
  }

  // ── 참격 호 ──────────────────────────────────────────────
  slash(pos, yaw, opts = {}) {
    const {
      color = 0xfff0b8,
      radius = 2.4,
      arc = 2.2,
      dur = 0.3,
      plane = 'horizontal',
      tilt = 0,
      y = 1.0,
      thickness = 0.55,
    } = opts;

    const geo = new THREE.RingGeometry(radius * (1 - thickness), radius, 36, 1, -arc / 2, arc);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).setY(pos.y + y);
    if (plane === 'horizontal') {
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -yaw + Math.PI / 2 + tilt;
    } else {
      mesh.rotation.y = yaw + tilt;
      mesh.rotation.x = 0;
    }
    this.scene.add(mesh);

    let t = 0;
    const baseRot = mesh.rotation.z;
    return this._push({
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / dur);
        mat.opacity = 0.95 * (1 - p) ** 1.6;
        const s = 0.75 + p * 0.55;
        mesh.scale.set(s, s, s);
        if (plane === 'horizontal') mesh.rotation.z = baseRot - p * 0.5;
        else mesh.rotation.z = p * 0.4;
        if (p >= 1) {
          this.scene.remove(mesh);
          geo.dispose();
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  // ── 지면 충격파 ──────────────────────────────────────────
  ring(pos, opts = {}) {
    const { color = 0xffd27a, radius = 6, dur = 0.6, thickness = 0.14, y = 0.06, vertical = false, startScale = 0.12 } = opts;
    const geo = new THREE.RingGeometry(1 - thickness, 1, 64);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).setY(y);
    if (!vertical) mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(radius * startScale);
    this.scene.add(mesh);

    let t = 0;
    return this._push({
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / dur);
        const e = 1 - Math.pow(1 - p, 2.2);
        mesh.scale.setScalar(radius * (startScale + (1 - startScale) * e));
        mat.opacity = 0.9 * (1 - p) ** 1.4;
        if (p >= 1) {
          this.scene.remove(mesh);
          geo.dispose();
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  // ── 파티클 폭발 ──────────────────────────────────────────
  burst(pos, opts = {}) {
    const {
      count = 14,
      color = 0xffcf80,
      speed = 7,
      size = 0.7,
      life = 0.55,
      gravity = 9,
      spread = 1,
      additive = true,
      up = 0.5,
    } = opts;

    for (let i = 0; i < count; i++) {
      if (this.spriteCount > this.maxSprites) break;
      const s = this._sprite(color, size * (0.5 + Math.random()), 0.95, additive);
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const vel = new THREE.Vector3(Math.cos(a) * r * spread, up + Math.random() * (1 - up * 0.5), Math.sin(a) * r * spread)
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      const l = life * (0.6 + Math.random() * 0.7);
      let t = 0;
      const s0 = s.scale.x;
      this._push({
        update: (dt) => {
          t += dt;
          const p = Math.min(1, t / l);
          vel.y -= gravity * dt;
          s.position.addScaledVector(vel, dt);
          s.material.opacity = 0.95 * (1 - p) ** 1.3;
          const sc = s0 * (1 - p * 0.5);
          s.scale.set(sc, sc, 1);
          if (p >= 1) {
            this._release(s);
            return false;
          }
          return true;
        },
      });
    }
  }

  // ── 달리는 먼지 ──────────────────────────────────────────
  dust(pos, dirX = 0, dirZ = 0, strength = 1) {
    if (this.spriteCount > this.maxSprites - 20) return;
    const s = this._sprite(0xd8c48f, 0.9 * strength, 0.5, false);
    s.position.set(pos.x + (Math.random() - 0.5) * 0.6, 0.18, pos.z + (Math.random() - 0.5) * 0.6);
    const vel = new THREE.Vector3(-dirX * (1.4 + Math.random()) + (Math.random() - 0.5), 0.8 + Math.random() * 0.7, -dirZ * (1.4 + Math.random()) + (Math.random() - 0.5));
    let t = 0;
    const life = 0.55 + Math.random() * 0.35;
    const s0 = s.scale.x;
    this._push({
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / life);
        s.position.addScaledVector(vel, dt);
        vel.multiplyScalar(0.94);
        s.material.opacity = 0.42 * (1 - p);
        s.scale.setScalar(s0 * (1 + p * 1.8));
        if (p >= 1) {
          this._release(s);
          return false;
        }
        return true;
      },
    });
  }

  // ── 피해 숫자 ────────────────────────────────────────────
  _numberSprite() {
    let n = this.numPool.pop();
    if (!n) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 30;
      n = { canvas, ctx: canvas.getContext('2d'), tex, mat, sprite };
    }
    return n;
  }

  damageNumber(pos, value, opts = {}) {
    const { color = '#ffe9a8', scale = 1, crit = false } = opts;
    const n = this._numberSprite();
    const { ctx, canvas, tex, mat, sprite } = n;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const text = typeof value === 'string' ? value : String(Math.round(value));
    const size = crit ? 92 : 74;
    ctx.font = `800 ${size}px "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(12,10,6,0.9)';
    ctx.strokeText(text, 128, 66);
    const grad = ctx.createLinearGradient(0, 20, 0, 110);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillText(text, 128, 66);
    tex.needsUpdate = true;

    sprite.material.opacity = 1;
    const base = (crit ? 1.5 : 1.05) * scale;
    sprite.scale.set(base * 2, base, 1);
    sprite.position.copy(pos);
    sprite.position.y += 1.4;
    this.scene.add(sprite);

    const start = sprite.position.clone();
    const drift = (Math.random() - 0.5) * 0.9;
    let t = 0;
    const life = 0.95;
    return this._push({
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / life);
        const e = 1 - Math.pow(1 - p, 2);
        sprite.position.y = start.y + e * 1.9;
        sprite.position.x = start.x + drift * e;
        const pop = p < 0.15 ? 0.6 + (p / 0.15) * 0.4 : 1;
        sprite.scale.set(base * 2 * pop, base * pop, 1);
        sprite.material.opacity = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        if (p >= 1) {
          this.scene.remove(sprite);
          this.numPool.push(n);
          return false;
        }
        return true;
      },
    });
  }

  // ── 스폰 마법진 ──────────────────────────────────────────
  spawnFx(pos, color = 0xffd27a) {
    this.ring(pos, { color, radius: 3.4, dur: 0.9, thickness: 0.05, y: 0.05 });
    this.ring(pos, { color: 0xffffff, radius: 1.6, dur: 0.6, thickness: 0.03, y: 0.05 });
    this.burst(new THREE.Vector3(pos.x, 0.6, pos.z), { count: 26, color, speed: 6, size: 0.7, life: 0.8, gravity: -1.5, up: 1, spread: 0.4 });
  }

  // ── 대상에게 붙는 조이기 코일 ────────────────────────────
  coil(target, opts = {}) {
    const { duration = 2.1, color = 0x8fd06a } = opts;
    const g = new THREE.Group();
    target.add(g);

    const rings = [];
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.TorusGeometry(0.75 - i * 0.05, 0.075, 6, 28);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      m.rotation.z = Math.random() * Math.PI;
      m.position.y = 0.35 + i * 0.22;
      g.add(m);
      rings.push({ m, mat, geo, phase: Math.random() * Math.PI * 2 });
    }

    let t = 0;
    return this._push({
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / duration);
        const grow = p < 0.15 ? p / 0.15 : 1;
        const fade = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
        rings.forEach((r, i) => {
          const wob = Math.sin(t * 22 + r.phase) * 0.06 * (1 - p * 0.3);
          r.m.scale.setScalar((0.85 + i * 0.03) * grow * (1 - p * 0.18) + wob * 0.05);
          r.m.position.y = 0.32 + i * 0.24 + Math.sin(t * 8 + i) * 0.02;
          r.m.rotation.z += dt * (1.6 + i * 0.2);
          r.mat.opacity = 0.85 * fade * (0.7 + Math.sin(t * 14 + i) * 0.3);
        });
        if (Math.random() < dt * 24) {
          this.burst(new THREE.Vector3(target.position.x, 0.5 + Math.random() * 1.1, target.position.z), {
            count: 1,
            color,
            speed: 2.2,
            size: 0.34,
            life: 0.4,
            gravity: -2,
            up: 0.9,
          });
        }
        if (p >= 1) {
          target.remove(g);
          rings.forEach((r) => {
            r.geo.dispose();
            r.mat.dispose();
          });
          return false;
        }
        return true;
      },
    });
  }

  // ── 오라 (버프) ──────────────────────────────────────────
  aura(getPos, opts = {}) {
    const { color = 0x9fd0ff, duration = 9, radius = 1.5 } = opts;
    let t = 0;
    let acc = 0;
    return this._push({
      update: (dt) => {
        t += dt;
        acc += dt;
        if (acc > 0.35 && t < duration) {
          acc = 0;
          const p = getPos();
          this.ring(new THREE.Vector3(p.x, 0.04, p.z), { color, radius: radius * 1.6, dur: 0.7, thickness: 0.08, y: 0.06, startScale: 0.4 });
          this.burst(new THREE.Vector3(p.x, 0.7, p.z), { count: 2, color, speed: 1.4, size: 0.4, life: 0.7, gravity: -1.2, up: 1, spread: 0.5 });
        }
        return t < duration;
      },
    });
  }

  // ── 이동 잔상 ────────────────────────────────────────────
  trail(pos, yaw, color = 0xa8d8ff, size = 1.1) {
    if (this.spriteCount > this.maxSprites - 30) return;
    const s = this._sprite(color, size, 0.55, true);
    s.position.set(pos.x, pos.y + 0.9, pos.z);
    let t = 0;
    const life = 0.32;
    this._push({
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / life);
        s.material.opacity = 0.55 * (1 - p);
        s.scale.setScalar(size * (1 - p * 0.4));
        if (p >= 1) {
          this._release(s);
          return false;
        }
        return true;
      },
    });
  }

  update(dt) {
    this.time += dt;
    this.shakeAmount *= Math.exp(-6 * dt);
    if (this.shakeAmount < 0.001) this.shakeAmount = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const alive = this.items[i].update(dt);
      if (!alive) this.items.splice(i, 1);
    }
  }
}
