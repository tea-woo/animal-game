// 적 — 멧돼지 무리 (순찰/추격/돌진/기절/부활)
import THREE from './three.js';
import { buildEnemy, collectMaterials } from './animals.js';
import { Animator } from './animation.js';
import { ARENA_RADIUS } from './world.js';
import { clamp, damp, dampAngle, rand, TAU, smoothstep } from './util.js';

function makeBarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 20;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

export class Boar {
  constructor(manager, kind, pos) {
    this.manager = manager;
    this.game = manager.game;
    this.kind = kind;

    const built = buildEnemy(kind);
    this.root = built.root;
    this.rig = built.rig;
    this.type = built.type;
    this.root.scale.setScalar(this.type.scale);
    this.root.position.copy(pos);
    this.home = pos.clone();
    this.game.scene.add(this.root);

    this.maxHp = this.type.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.radius = 0.85 * this.type.scale;
    this.yaw = Math.random() * TAU;
    this.vel = new THREE.Vector3();
    this.state = 'patrol';
    this.timer = rand(0.5, 2.5);
    this.stunT = 0;
    this.constricted = false;
    this.deathT = 0;
    this.respawnT = 0;
    this.hitFlash = 0;
    this.aggro = false;
    this.wander = pos.clone();
    this.barTimer = 0;

    // 개별 인스턴스 머티리얼 (피격 점멸용)
    this.root.traverse((o) => {
      if (o.isMesh && o.material) o.material = o.material.clone();
    });
    this.materials = collectMaterials(this.root);
    this.baseEmissive = this.materials.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));

    this.animator = new Animator(this.rig, {
      walk: 2.2,
      run: 4.8,
      anim: { gaitAmp: 0.5, bob: 0.03, sway: 0.05, gaitRate: 2.0, tailAmp: 0.12, headBob: 0.04 },
    });

    // 체력바
    const bar = makeBarTexture();
    this.bar = bar;
    const mat = new THREE.SpriteMaterial({ map: bar.tex, transparent: true, depthWrite: false, depthTest: false });
    this.barSprite = new THREE.Sprite(mat);
    this.barSprite.scale.set(2.0, 0.3, 1);
    this.barSprite.position.y = 2.0;
    this.barSprite.renderOrder = 25;
    this.barSprite.visible = false;
    this.root.add(this.barSprite);
    this.drawBar(1);
  }

  get position() {
    return this.root.position;
  }

  drawBar(frac) {
    const { ctx, canvas, tex } = this.bar;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(8,8,10,0.75)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, canvas.width, canvas.height, 8) : ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.fill();
    const w = Math.max(0, frac) * (canvas.width - 4);
    const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
    g.addColorStop(0, this.kind === 'alpha' ? '#ff8a3c' : '#ff5252');
    g.addColorStop(1, this.kind === 'alpha' ? '#ffd166' : '#ff9a6a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(2, 2, w, canvas.height - 4, 6) : ctx.rect(2, 2, w, canvas.height - 4);
    ctx.fill();
    tex.needsUpdate = true;
  }

  stun(seconds) {
    this.stunT = Math.max(this.stunT, seconds);
    this.animator.stunned = Math.max(this.animator.stunned, seconds);
    if (this.stunT > 0.3) {
      this.state = 'stunned';
      this.timer = 0;
      if (this.coilGrab) this.coilGrab();
    }
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive) return 0;
    const dmg = Math.max(1, Math.round(amount));
    this.hp -= dmg;
    this.barTimer = 3;
    this.drawBar(clamp(this.hp / this.maxHp, 0, 1));
    this.barSprite.visible = true;

    const color = opts.constrict ? '#a8e07a' : opts.heavy ? '#ffd166' : '#ffe0b0';
    this.game.vfx.damageNumber(this.root.position.clone().setY(this.root.position.y + 1.9 * this.type.scale), dmg, {
      color,
      crit: !!opts.heavy,
      scale: this.type.scale,
    });

    // 피격 점멸
    this.hitFlash = 0.14;
    for (const m of this.materials) {
      if (m.emissive) {
        m.emissive.setHex(opts.constrict ? 0x66ff44 : 0xff3b22);
        m.emissiveIntensity = 1.6;
      }
    }

    // 넉백
    if (opts.source && opts.knock) {
      const dir = new THREE.Vector3().subVectors(this.root.position, opts.source.pos);
      dir.y = 0;
      if (dir.lengthSq() < 0.001) dir.set(rand(-1, 1), 0, rand(-1, 1));
      dir.normalize();
      this.vel.addScaledVector(dir, opts.knock);
      if (!opts.constrict) this.yaw = Math.atan2(-dir.x, -dir.z);
    }

    if (opts.stun) this.stun(opts.stun);

    this.game.vfx.burst(this.root.position.clone().setY(0.9 * this.type.scale), {
      count: opts.heavy ? 10 : 6,
      color: opts.constrict ? 0xa8e07a : 0xffb070,
      speed: 4.5,
      size: 0.4 * this.type.scale,
      life: 0.35,
      gravity: 8,
    });

    if (this.hp <= 0) this.die();
    return 1;
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.deathT = 0;
    this.respawnT = 7;
    this.hp = 0;
    this.barSprite.visible = false;
    this.constricted = false;
    this.game.sfx.death();
    this.game.vfx.burst(this.root.position.clone().setY(0.8), {
      count: 18,
      color: 0xff8a5a,
      speed: 6,
      size: 0.6,
      life: 0.7,
      gravity: 9,
    });
    this.game.vfx.damageNumber(this.root.position.clone().setY(2.2), '처치!', { color: '#ffe9a8', crit: true, scale: 1.1 });
    this.manager.kills += 1;
    this.animator.play({
      duration: 1.2,
      onPose: (p, d) => {
        const f = smoothstep(0, 0.8, p);
        d.roll = 1.5 * f;
        d.bodyY = -0.3 * f;
        d.pitch = 0.22 * f;
        d.lf = d.rf = 0.4 * f;
        d.lb = d.rb = -0.4 * f;
        d.headPitch = 0.4 * f;
      },
    });
  }

  revive() {
    this.alive = true;
    this.hp = this.maxHp;
    this.state = 'patrol';
    this.deathT = 0;
    this.stunT = 0;
    this.constricted = false;
    this.vel.set(0, 0, 0);
    this.root.position.copy(this.home);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.visible = true;
    this.barSprite.visible = false;
    this.drawBar(1);
    this.animator = new Animator(this.rig, {
      walk: 2.2,
      run: 4.8,
      anim: { gaitAmp: 0.5, bob: 0.03, sway: 0.05, gaitRate: 2.0, tailAmp: 0.12, headBob: 0.04 },
    });
    this.game.vfx.spawnFx(this.home.clone(), 0xff9a5a);
    this.timer = rand(0.4, 1.6);
  }

  update(dt, player) {
    const g = this.game;

    // 점멸 해제
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) {
        this.materials.forEach((m, i) => {
          const b = this.baseEmissive[i];
          if (b && m.emissive) {
            m.emissive.copy(b.color);
            m.emissiveIntensity = b.intensity;
          }
        });
      }
    }
    if (this.barTimer > 0) {
      this.barTimer -= dt;
      if (this.barTimer <= 0) this.barSprite.visible = false;
    }

    if (!this.alive) {
      this.deathT += dt;
      this.respawnT -= dt;
      if (this.deathT > 0.8) {
        this.root.position.y = Math.max(-0.4, this.root.position.y - dt * 0.5);
      }
      if (this.respawnT <= 0) this.revive();
      this.animator.update(dt, { speed: 0, grounded: true, vy: 0 });
      return;
    }

    this.stunT = Math.max(0, this.stunT - dt);
    const dist = this.root.position.distanceTo(player.pos);

    if (this.stunT > 0 || this.constricted) {
      this.state = 'stunned';
    } else {
      if (!player.dead) {
        if (dist < (this.kind === 'alpha' ? 16 : 13)) this.aggro = true;
        if (dist > 30) this.aggro = false;
      } else {
        this.aggro = false;
      }

      if (this.state === 'stunned') {
        this.state = this.aggro ? 'chase' : 'patrol';
        this.timer = 0;
      }

      switch (this.state) {
        case 'patrol': {
          this.timer -= dt;
          const toW = new THREE.Vector3().subVectors(this.wander, this.root.position);
          toW.y = 0;
          if (this.timer <= 0 || toW.length() < 1.2) {
            this.timer = rand(2.2, 5.0);
            const a = Math.random() * TAU;
            const r = Math.hypot(this.home.x, this.home.z) + rand(-6, 6);
            const nr = clamp(r, 6, ARENA_RADIUS - 4);
            this.wander.set(Math.cos(a) * nr, 0, Math.sin(a) * nr);
            this.state = Math.random() < 0.25 ? 'idle' : 'patrol';
          }
          this.moveToward(this.wander, 1.8, dt);
          if (this.aggro && !player.dead) this.state = 'chase';
          break;
        }
        case 'idle': {
          this.timer -= dt;
          this.vel.multiplyScalar(0.9);
          if (this.timer <= 0) {
            this.state = 'patrol';
            this.timer = 0;
          }
          if (this.aggro && !player.dead) this.state = 'chase';
          break;
        }
        case 'chase': {
          if (player.dead || dist > 30) {
            this.state = 'patrol';
            this.timer = 0;
            break;
          }
          const speed = this.type.speed * (this.kind === 'alpha' ? 1.05 : 1);
          if (dist > 2.4) {
            this.moveToward(player.pos, speed, dt);
          } else {
            this.state = 'windup';
            this.timer = 0.42;
            this.game.sfx.hit && this.game.sfx.ui();
          }
          break;
        }
        case 'windup': {
          this.timer -= dt;
          this.vel.multiplyScalar(0.82);
          const toP = new THREE.Vector3().subVectors(player.pos, this.root.position);
          this.yaw = dampAngle(this.yaw, Math.atan2(toP.x, toP.z), 12, dt);
          this.animator.play({
            duration: 0.42,
            onPose: (p, d) => {
              const c = smoothstep(0, 1, p);
              d.pitch = -0.25 * c;
              d.bodyY = 0.1 * c;
              d.lf = d.rf = -0.5 * c;
              d.lfk = d.rfk = 0.6 * c;
              d.headPitch = -0.3 * c;
              d.jaw = 0.35 * c;
            },
          });
          if (this.timer <= 0) {
            this.state = 'attack';
            this.timer = 0.45;
            this.attackHit = false;
            const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
            this.vel.addScaledVector(dir, 14);
            this.game.sfx.dash();
          }
          break;
        }
        case 'attack': {
          this.timer -= dt;
          if (!this.attackHit) {
            this.attackHit = true;
            const hitDist = this.root.position.distanceTo(player.pos);
            if (hitDist < 3.0 * this.type.scale && !player.dead) {
              player.takeDamage(this.type.damage, { from: this });
              this.game.vfx.shake(0.3);
            }
          }
          if (this.timer <= 0) {
            this.state = 'recover';
            this.timer = 0.85;
          }
          break;
        }
        case 'recover': {
          this.timer -= dt;
          this.vel.multiplyScalar(0.86);
          if (this.timer <= 0) this.state = 'chase';
          break;
        }
        default:
          this.state = 'patrol';
      }
    }

    // 물리
    this.root.position.x += this.vel.x * dt;
    this.root.position.z += this.vel.z * dt;
    this.vel.x *= Math.exp(-3.2 * dt);
    this.vel.z *= Math.exp(-3.2 * dt);

    // 다른 개체와 겹침 방지
    for (const other of this.manager.all) {
      if (other === this || !other.alive) continue;
      const d = this.root.position.distanceTo(other.root.position);
      const min = (this.radius + other.radius) * 0.9;
      if (d < min && d > 0.001) {
        const push = new THREE.Vector3().subVectors(this.root.position, other.root.position).setY(0).normalize();
        this.root.position.addScaledVector(push, (min - d) * 0.5);
      }
    }

    // 경계
    const r = Math.hypot(this.root.position.x, this.root.position.z);
    if (r > ARENA_RADIUS - 2) {
      const k = (ARENA_RADIUS - 2) / r;
      this.root.position.x *= k;
      this.root.position.z *= k;
      this.wander.set(rand(-10, 10), 0, rand(-10, 10));
    }

    // 모델 회전
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.yaw, 7, dt);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.animator.update(dt, { speed, grounded: true, vy: 0 });
  }

  moveToward(target, speed, dt) {
    const dir = new THREE.Vector3().subVectors(target, this.root.position);
    dir.y = 0;
    if (dir.length() < 0.05) return;
    dir.normalize();
    this.vel.x = damp(this.vel.x, dir.x * speed, 6, dt);
    this.vel.z = damp(this.vel.z, dir.z * speed, 6, dt);
    this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 6, dt);
  }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.all = [];
    this.kills = 0;
    this.spawnWave();
  }

  spawnWave() {
    const spots = [
      [-14, -10], [12, -14], [-20, 6], [18, 8], [4, -20], [-6, 18], [24, -4], [-24, -18],
    ];
    for (const [x, z] of spots) {
      this.all.push(new Boar(this, 'boar', new THREE.Vector3(x, 0, z)));
    }
    this.all.push(new Boar(this, 'alpha', new THREE.Vector3(0, 0, -26)));
  }

  update(dt, player) {
    for (const b of this.all) b.update(dt, player);
  }

  nearest(pos, maxDist, filter) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.all) {
      if (!e.alive) continue;
      if (filter && !filter(e)) continue;
      const d = e.root.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  hitCone(origin, yaw, range, arc, damage, opts = {}) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let hits = 0;
    for (const e of this.all) {
      if (!e.alive) continue;
      const dx = e.root.position.x - origin.x;
      const dz = e.root.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      const ang = Math.acos(clamp(dot, -1, 1));
      if (ang > arc / 2 && dist > e.radius) continue;
      if (e.takeDamage(damage, { ...opts, source: opts.source })) hits++;
    }
    if (hits === 0) {
      // 헛방 — 바람만
      this.game.vfx.burst(
        new THREE.Vector3(origin.x + Math.sin(yaw) * range * 0.6, 0.9, origin.z + Math.cos(yaw) * range * 0.6),
        { count: 4, color: 0xffffff, speed: 3, size: 0.3, life: 0.25, gravity: 2 }
      );
    }
    return hits;
  }

  hitCircle(center, radius, damage, opts = {}) {
    let hits = 0;
    for (const e of this.all) {
      if (!e.alive) continue;
      const d = Math.hypot(e.root.position.x - center.x, e.root.position.z - center.z);
      if (d > radius + e.radius) continue;
      if (e.takeDamage(damage, { ...opts })) hits++;
    }
    return hits;
  }

  totalAlive() {
    return this.all.filter((e) => e.alive).length;
  }
}
