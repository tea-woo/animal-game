// 플레이어 — 이동/질주/점프/공격/스킬 상태 머신과 동물별 전투 연출
import THREE from './three.js';
import { ANIMALS, buildAnimal } from './animals.js';
import { Animator } from './animation.js';
import { ARENA_RADIUS } from './world.js';
import { clamp, damp, dampAngle, smoothstep, rand, TAU } from './util.js';

const GRAVITY = 26;

export class Player {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);

    this.pos = new THREE.Vector3(0, 0, 8);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.vy = 0;
    this.grounded = true;

    this.hp = 100;
    this.maxHp = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.exhausted = false;
    this.sprintHold = 0;

    this.action = null;
    this.attackCd = 0;
    this.cd = {};
    this.invuln = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.buff = 0;
    this.dead = false;
    this.deadT = 0;
    this.bestCombo = 0;
    this.dustTimer = 0;
    this.model = null;
    this.rig = null;
    this.animator = null;
    this.cfg = null;
    this.spawnId = 'lion';
  }

  get alive() {
    return !this.dead;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get dmgMul() {
    return this.buff > 0 ? 1.35 : 1;
  }

  get buffed() {
    return this.buff > 0;
  }

  spawn(id = 'lion', opts = {}) {
    if (this.model) {
      this.root.remove(this.model);
      this.disposeModel(this.model);
      this.model = null;
    }
    const built = buildAnimal(id);
    this.cfg = built.cfg;
    this.spawnId = id;
    this.model = built.root;
    this.rig = built.rig;
    this.root.add(this.model);
    this.animator = new Animator(this.rig, this.cfg);

    this.maxHp = this.cfg.hp;
    this.hp = this.cfg.hp;
    this.maxStamina = 100;
    this.stamina = 100;
    this.exhausted = false;
    this.action = null;
    this.attackCd = 0;
    this.invuln = 1.2;
    this.buff = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.dead = false;
    this.deadT = 0;
    this.vy = 0;
    this.grounded = true;
    this.vel.set(0, 0, 0);
    this.pos.set(0, 0, 8);
    this.yaw = Math.PI;
    this.model.rotation.y = this.yaw;
    this.model.position.set(0, 0, 0);
    this.model.visible = true;
    this.model.scale.setScalar(1);

    this.cd = {};
    for (const s of this.cfg.skills) this.cd[s.id] = 0;

    this.syncRoot();
    this.game.vfx.spawnFx(new THREE.Vector3(this.pos.x, 0, this.pos.z), this.cfg.accent ? new THREE.Color(this.cfg.accent).getHex() : 0xffd27a);
    this.game.sfx.spawn();
    if (!opts.silent) this.game.ui.toast(`${this.cfg.name} 스폰!`);
  }

  disposeModel(root) {
    root.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.dispose && o.userData.built) o.geometry.dispose();
    });
  }

  syncRoot() {
    this.root.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
  }

  // ── 입력 처리 ──────────────────────────────────────────────
  update(dt, input, camYaw) {
    const g = this.game;

    // 쿨다운
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    if (this.buff > 0) this.buff = Math.max(0, this.buff - dt);

    if (this.dead) {
      this.deadT += dt;
      this.animator.update(dt, { speed: 0, grounded: true, vy: 0 });
      // 쓰러진 자세 유지
      const k = 1 - Math.exp(-5 * dt);
      this.rig.body.rotation.z += (1.45 - this.rig.body.rotation.z) * k;
      this.rig.body.position.y += (this.animator.bodyBaseY - 0.34 - this.rig.body.position.y) * k;
      this.model.position.y += (-0.1 - this.model.position.y) * k;
      if (this.deadT > 2.4) this.respawn();
      return;
    }

    // 행동 진행
    if (this.action) {
      this.action.t += dt;
      const p = clamp(this.action.t / this.action.dur, 0, 1);
      this.action.onProgress?.(dt, p);
      if (this.action.t >= this.action.dur) {
        this.action.onEnd?.();
        this.action = null;
      }
    }

    const canMove = !this.action || this.action.moveScale > 0;
    const moveScale = this.action ? this.action.moveScale : 1;

    // 카메라 기준 이동
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, input.move.f).addScaledVector(right, input.move.s);
    const wishLen = wish.length();
    if (wishLen > 1) wish.normalize();
    const moving = wishLen > 0.12;

    // 질주
    const wantSprint = !!input.sprint && moving;
    this.sprinting = wantSprint && !this.exhausted && this.stamina > 0 && canMove;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - 19 * dt);
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.sprinting = false;
      }
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.exhausted ? 12 : 17) * dt);
      if (this.exhausted && this.stamina > 28) this.exhausted = false;
    }

    const baseSpeed = this.sprinting ? this.cfg.run : this.cfg.walk;
    const targetSpeed = baseSpeed * this.dmgSpeedMul * (this.buff > 0 ? 1.35 : 1) * moveScale;

    if (canMove) {
      const tx = moving ? wish.x * targetSpeed : 0;
      const tz = moving ? wish.z * targetSpeed : 0;
      const accel = this.grounded ? (moving ? 11 : 13) : 3.2;
      this.vel.x = damp(this.vel.x, tx, accel, dt);
      this.vel.z = damp(this.vel.z, tz, accel, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 9, dt);
      this.vel.z = damp(this.vel.z, 0, 9, dt);
    }

    // 방향 전환
    if (moving && (canMove || this.action?.allowTurn)) {
      const targetYaw = Math.atan2(wish.x, wish.z);
      this.yaw = dampAngle(this.yaw, targetYaw, this.action ? 3.5 : this.cfg.turn, dt);
    }

    // 점프
    if (input.consume('jump') && this.grounded && !this.action) {
      this.vy = this.cfg.jump;
      this.grounded = false;
      this.game.sfx.jump();
      const p = this.pos;
      this.game.vfx.dust(new THREE.Vector3(p.x, 0, p.z), 0, 0, 1.2);
    }

    // 중력
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded && this.vy < -6) {
        this.game.sfx.land();
        this.game.vfx.dust(new THREE.Vector3(this.pos.x, 0, this.pos.z), 0, 0, 1.3);
      }
      this.pos.y = 0;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // 이동 적용
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // 아레나 경계
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS - 1) {
      const k = (ARENA_RADIUS - 1) / r;
      this.pos.x *= k;
      this.pos.z *= k;
      this.vel.multiplyScalar(0.5);
    }

    // 공격/스킬 입력 (행동 중 입력은 버리지 않고 다음 가능한 순간에 발동)
    if (!this.action && this.attackCd <= 0 && input.consume('attack')) this.doAttack();
    if (!this.action && this.cd[this.cfg.skills[0].id] <= 0 && input.consume('skill1')) this.doSkill(0);
    if (!this.action && this.cd[this.cfg.skills[1].id] <= 0 && input.consume('skill2')) this.doSkill(1);

    // 달릴 때 먼지
    if (this.sprinting && this.grounded && this.speed > 4) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.07;
        const back = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.game.vfx.dust(new THREE.Vector3(this.pos.x + back.x * 0.7, 0, this.pos.z + back.z * 0.7), back.x, back.z, 1.1);
      }
    }

    // 애니메이션
    this.animator.update(dt, {
      speed: this.speed,
      grounded: this.grounded,
      vy: this.vy,
      sprinting: this.sprinting,
    });

    this.syncRoot();

    // 부드러운 모델 기울기 (회전 시 몸이 쏠리는 느낌)
    const mvx = this.vel.x;
    const mvz = this.vel.z;
    const lean = clamp((mvx * Math.cos(this.yaw) - mvz * Math.sin(this.yaw)) * 0.012, -0.22, 0.22);
    this.model.rotation.z = damp(this.model.rotation.z, -lean, 8, dt);
  }

  get dmgSpeedMul() {
    return 1;
  }

  respawn() {
    this.dead = false;
    this.deadT = 0;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.exhausted = false;
    this.pos.set(0, 0, 6);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.invuln = 2;
    this.action = null;
    this.model.visible = true;
    this.model.rotation.z = 0;
    this.model.position.y = 0;
    this.animator.stopAction();
    this.game.ui.hideDeath();
    this.game.ui.toast('다시 일어섰습니다');
    this.game.vfx.spawnFx(new THREE.Vector3(this.pos.x, 0, this.pos.z), 0xffe0a0);
  }

  takeDamage(amount, opts = {}) {
    if (this.dead || this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = 0.55;
    this.combo = 0;
    this.comboTimer = 0;
    this.game.vfx.shake(0.45);
    this.game.vfx.damageNumber(new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z), amount, { color: '#ff6b5a', scale: 0.9 });
    this.game.vfx.burst(new THREE.Vector3(this.pos.x, this.pos.y + 1.1, this.pos.z), { count: 10, color: 0xff5a3c, speed: 5, size: 0.5, life: 0.5, gravity: 6 });
    this.game.sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return true;
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.action = null;
    this.game.sfx.death();
    this.game.vfx.shake(0.8);
    this.game.vfx.burst(new THREE.Vector3(this.pos.x, 1, this.pos.z), { count: 26, color: 0xff7a52, speed: 7, size: 0.8, life: 0.8, gravity: 5 });
    this.animator.play({
      duration: 0.9,
      onPose: (p, d) => {
        d.roll = 1.45 * smoothstep(0, 0.7, p);
        d.bodyY = -0.45 * smoothstep(0, 0.7, p);
        d.pitch = 0.2 * p;
        d.lf = d.rf = -0.3;
        d.lb = d.rb = 0.3;
        d.headPitch = 0.3 * p;
      },
    });
    this.game.ui.showDeath();
  }

  // ── 기본 공격 ──────────────────────────────────────────────
  doAttack() {
    const a = this.cfg.attack;
    this.attackCd = a.cd;
    const dir = this.forward;
    let hit = false;

    const strike = () => {
      if (hit) return;
      hit = true;
      const count = this.game.enemies.hitCone(this.pos, this.yaw, a.range, a.arc, a.damage * this.dmgMul, {
        knock: a.knock,
        source: this,
        stun: 0.12,
        origin: this.pos,
      });
      if (count > 0) {
        this.addCombo(count);
        this.game.sfx.hit(count > 1);
        this.game.vfx.shake(0.16 + 0.05 * count);
      }
      this.spawnAttackVfx(a.range);
    };

    const dur = a.dur;
    this.action = {
      kind: 'attack',
      t: 0,
      dur,
      moveScale: 0.28,
      allowTurn: true,
      onProgress: (dt, p) => {
        if (p >= a.hitAt && !hit) strike();
        // 살짝 앞으로 파고들기
        if (p > a.hitAt && p < a.hitAt + 0.18) {
          const lungeSpeed = a.lunge * 4.5;
          this.pos.addScaledVector(dir, lungeSpeed * dt);
        }
      },
      onEnd: () => {},
    };

    this.game.sfx[a.sound] ? this.game.sfx[a.sound]() : this.game.sfx.slash();

    // 종별 공격 자세
    const cfgId = this.cfg.id;
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const wind = smoothstep(0, 0.35, p) * (1 - smoothstep(0.35, 1, p));
        const strikeT = smoothstep(0.3, 0.52, p) * (1 - smoothstep(0.55, 1, p));
        const rec = smoothstep(0.6, 1, p);
        if (cfgId === 'lion') {
          d.twist = -0.35 * wind + 0.55 * strikeT;
          d.rf = -1.05 * wind + 0.9 * strikeT;
          d.rfk = 1.1 * wind + 0.1 * strikeT;
          d.rbr = 0;
          d.pitch += 0.12 * strikeT - 0.08 * wind;
          d.headPitch += -0.14 * wind + 0.2 * strikeT;
          d.jaw = 0.3 * wind;
          d.bodyY -= 0.04 * strikeT;
        } else if (cfgId === 'wolf') {
          d.neck = -0.12 * wind + 0.2 * strikeT;
          d.headPitch = -0.25 * wind + 0.35 * strikeT;
          d.lunge = -0.28 * wind + 0.45 * strikeT;
          d.jaw = 0.55 * wind * (1 - smoothstep(0.35, 0.5, p)) + 0.05;
          d.pitch += 0.1 * strikeT;
          d.lf = -0.25 * strikeT * (1 - rec);
        } else if (cfgId === 'bear') {
          d.pitch = -0.3 * wind + 0.34 * strikeT;
          d.bodyY = 0.12 * wind - 0.1 * strikeT;
          d.lf = -1.15 * wind + 0.35 * strikeT;
          d.rf = -1.15 * wind + 0.35 * strikeT;
          d.lfk = 1.2 * wind;
          d.rfk = 1.2 * wind;
          d.jaw = 0.4 * wind;
          d.headPitch += -0.25 * wind + 0.3 * strikeT;
        } else if (cfgId === 'anaconda') {
          d.neck = -0.2 * wind + 0.12 * strikeT;
          d.headPitch = -0.3 * wind + 0.3 * strikeT;
          d.lunge = -0.5 * wind + 0.65 * strikeT;
          d.jaw = 0.7 * wind * (1 - smoothstep(0.3, 0.45, p)) + 0.12 * strikeT;
          d.sway = 0.3 * wind + 0.2 * strikeT;
          d.pitch += 0.1 * strikeT;
        }
      },
    });
  }

  spawnAttackVfx(range) {
    const id = this.cfg.id;
    const p = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.9, this.pos.y, this.pos.z + Math.cos(this.yaw) * 0.9);
    if (id === 'lion') {
      const colors = [0xffe9a8, 0xffcf6a, 0xfff6d8];
      colors.forEach((c, i) => {
        setTimeout(() => {
          if (!this.game.running) return;
          this.game.vfx.slash(p, this.yaw, { color: c, radius: range * (0.85 + i * 0.09), arc: 2.3, dur: 0.3, plane: 'vertical', tilt: -0.5 + i * 0.5, y: 0.8 + i * 0.25, thickness: 0.28 });
        }, i * 55);
      });
      this.game.vfx.burst(new THREE.Vector3(p.x, p.y + 1.0, p.z), { count: 8, color: 0xffe2a0, speed: 6, size: 0.45, life: 0.35, gravity: 4 });
    } else if (id === 'wolf') {
      this.game.vfx.slash(p, this.yaw, { color: 0xcfe6ff, radius: range * 0.8, arc: 1.1, dur: 0.22, plane: 'vertical', y: 0.85, thickness: 0.3 });
      this.game.vfx.burst(new THREE.Vector3(p.x, p.y + 0.9, p.z), { count: 6, color: 0xdff0ff, speed: 7, size: 0.35, life: 0.3, gravity: 3 });
    } else if (id === 'bear') {
      this.game.vfx.slash(p, this.yaw, { color: 0xffb066, radius: range * 0.78, arc: 2.7, dur: 0.32, plane: 'horizontal', y: 0.5, thickness: 0.5 });
      this.game.vfx.burst(new THREE.Vector3(p.x, 0.4, p.z), { count: 12, color: 0xd8b47a, speed: 6, size: 0.6, life: 0.5, gravity: 9, up: 0.8 });
    } else if (id === 'anaconda') {
      this.game.vfx.slash(p, this.yaw, { color: 0xa8e07a, radius: range * 0.7, arc: 1.0, dur: 0.2, plane: 'vertical', y: 0.9, thickness: 0.26 });
      this.game.vfx.burst(new THREE.Vector3(p.x, p.y + 0.9, p.z), { count: 7, color: 0xc8f09a, speed: 6, size: 0.4, life: 0.35, gravity: 5 });
    }
  }

  addCombo(n) {
    this.combo += n;
    this.comboTimer = 2.4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.game.ui.popCombo(this.combo);
  }

  // ── 스킬 ──────────────────────────────────────────────────
  doSkill(index) {
    const skill = this.cfg.skills[index];
    if (!skill) return;
    const fn = {
      roar: () => this.skillRoar(),
      pounce: () => this.skillPounce(),
      dash: () => this.skillDash(),
      howl: () => this.skillHowl(),
      stomp: () => this.skillStomp(),
      charge: () => this.skillCharge(),
      constrict: () => this.skillConstrict(),
      tailslam: () => this.skillTailSlam(),
    }[skill.id];
    if (!fn) return;
    const started = fn();
    if (started !== false) {
      this.cd[skill.id] = skill.cd;
      this.game.ui.toast(skill.name);
      this.game.ui.flashSkill(index);
    }
  }

  // 사자 — 포효
  skillRoar() {
    const dur = 1.1;
    let fired = false;
    this.action = {
      kind: 'roar',
      t: 0,
      dur,
      moveScale: 0.12,
      onProgress: (dt, p) => {
        if (fired || p < 0.34) return;
        fired = true;
        const gp = new THREE.Vector3(this.pos.x, 0.05, this.pos.z);
        this.game.vfx.ring(gp, { color: 0xffd27a, radius: 9.6, dur: 0.9, thickness: 0.06 });
        this.game.vfx.ring(gp, { color: 0xfff6d8, radius: 6.2, dur: 0.62, thickness: 0.035 });
        this.game.vfx.ring(gp, { color: 0xffb452, radius: 12.2, dur: 1.1, thickness: 0.02 });
        this.game.vfx.burst(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), { count: 30, color: 0xffdc96, speed: 12, size: 0.7, life: 0.75, gravity: 2, up: 0.15, spread: 1 });
        this.game.vfx.shake(0.95);
        this.game.sfx.roar();
        const hits = this.game.enemies.hitCircle(this.pos, 9.6, 18 * this.dmgMul, { knock: 15, stun: 1.8, source: this, heavy: true });
        if (hits) this.addCombo(hits);
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const open = smoothstep(0.22, 0.36, p) * (1 - smoothstep(0.8, 1, p));
        d.jaw = 0.62 * open;
        d.headPitch = -0.42 * open + Math.sin(p * 26) * 0.03 * open;
        d.neck = -0.26 * open;
        d.pitch = -0.2 * open;
        d.bodyY = 0.02 * open;
        d.roll = Math.sin(p * 18) * 0.02 * open;
        d.lf = -0.35 * open;
        d.rf = -0.35 * open;
        d.lfk = 0.4 * open;
        d.rfk = 0.4 * open;
      },
    });
    this.game.sfx.roar();
    return true;
  }

  // 사자 — 도약
  skillPounce() {
    const dur = 1.25;
    let launched = false;
    let slammed = false;
    const slam = () => {
      if (slammed) return;
      slammed = true;
      const gp = new THREE.Vector3(this.pos.x, 0.05, this.pos.z);
      this.game.vfx.ring(gp, { color: 0xffcf7a, radius: 5.0, dur: 0.55, thickness: 0.1 });
      this.game.vfx.ring(gp, { color: 0xfff0c0, radius: 3.2, dur: 0.4, thickness: 0.05 });
      this.game.vfx.burst(new THREE.Vector3(this.pos.x, 0.5, this.pos.z), { count: 24, color: 0xe8c48a, speed: 9, size: 0.7, life: 0.6, gravity: 10, up: 0.9 });
      this.game.vfx.shake(0.8);
      this.game.sfx.slam();
      const hits = this.game.enemies.hitCircle(this.pos, 4.6, 36 * this.dmgMul, { knock: 13, stun: 0.5, source: this, heavy: true });
      if (hits) this.addCombo(hits);
    };
    this.action = {
      kind: 'pounce',
      t: 0,
      dur,
      moveScale: 0,
      onProgress: (dt, p) => {
        if (!launched && p >= 0.22) {
          launched = true;
          this.vy = 9.2;
          this.grounded = false;
          this.vel.set(Math.sin(this.yaw) * 16, 0, Math.cos(this.yaw) * 16);
          this.game.sfx.dash();
          this.game.vfx.burst(new THREE.Vector3(this.pos.x, 0.4, this.pos.z), { count: 14, color: 0xd8c090, speed: 6, size: 0.6, life: 0.5, gravity: 8, up: 0.6 });
        }
        if (launched && !slammed && this.grounded && this.pos.y <= 0.01) slam();
        if (p > 0.88 && !slammed) slam();
        if (launched && !slammed && this.pos.y > 0.2 && p > 0.3) {
          this.game.vfx.trail(this.pos, this.yaw, 0xffd89a, 1.3);
        }
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        if (p < 0.22) {
          const c = smoothstep(0, 0.22, p);
          d.bodyY = -0.14 * c;
          d.pitch = 0.06 * c;
          d.lf = d.rf = -0.7 * c;
          d.lfk = d.rfk = 0.9 * c;
          d.lb = d.rb = 0.5 * c;
          d.lbk = d.rbk = -0.7 * c;
          d.headPitch = 0.12 * c;
        } else {
          const air = smoothstep(0.22, 0.4, p) * (1 - smoothstep(0.62, 0.8, p));
          d.lf = d.rf = -0.9 * air + 0.5 * (1 - air);
          d.lfk = d.rfk = 1.2 * air;
          d.lb = d.rb = 0.7 * air;
          d.lbk = d.rbk = -1.0 * air;
          d.pitch = -0.22 * air + 0.3 * smoothstep(0.7, 0.85, p);
          d.headPitch = -0.2 * air;
          d.tailX = 0.5 * air;
        }
      },
    });
    return true;
  }

  // 늑대 — 달빛 질주
  skillDash() {
    const dur = 0.55;
    let fired = false;
    this.hitSet = new Set();
    this.action = {
      kind: 'dash',
      t: 0,
      dur,
      moveScale: 0,
      allowTurn: false,
      onProgress: (dt, p) => {
        if (!fired) {
          fired = true;
          this.vel.set(Math.sin(this.yaw) * 27, 0, Math.cos(this.yaw) * 27);
          this.invuln = 0.45;
          this.game.sfx.dash();
          this.game.vfx.shake(0.3);
        }
        if (p < 0.75) {
          this.game.vfx.trail(this.pos, this.yaw, 0xb9dcff, 1.25);
          const targets = this.game.enemies.all;
          for (const e of targets) {
            if (!e.alive || this.hitSet.has(e)) continue;
            if (e.root.position.distanceTo(this.pos) < 2.5) {
              this.hitSet.add(e);
              this.game.vfx.slash(new THREE.Vector3(e.root.position.x, 0, e.root.position.z), this.yaw, { color: 0xbfe0ff, radius: 2.2, arc: 2.4, dur: 0.25, plane: 'vertical', y: 1.0, thickness: 0.35 });
              const hits = e.takeDamage(30 * this.dmgMul, { knock: 9, source: this, stun: 0.4 });
              if (hits) this.addCombo(1);
            }
          }
        }
        this.pos.y = Math.max(0, this.pos.y);
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const a = Math.sin(Math.min(1, p * 1.6) * Math.PI);
        d.pitch = 0.3 * a;
        d.bodyY = -0.05 * a;
        d.lf = d.rf = 0.7 * a;
        d.lfk = d.rfk = -0.3 * a;
        d.lb = d.rb = -0.7 * a;
        d.lbk = d.rbk = 0.4 * a;
        d.headPitch = -0.2 * a;
        d.jaw = 0.2 * a;
        d.tailX = 0.9 * a;
      },
    });
    return true;
  }

  // 늑대 — 무리 울부짖기
  skillHowl() {
    const dur = 1.15;
    let fired = false;
    this.action = {
      kind: 'howl',
      t: 0,
      dur,
      moveScale: 0.1,
      onProgress: (dt, p) => {
        if (fired || p < 0.28) return;
        fired = true;
        this.buff = 9;
        this.game.sfx.howl();
        this.game.sfx.buff();
        this.game.vfx.aura(() => this.pos, { color: 0x9fd0ff, duration: 9, radius: 1.4 });
        this.game.vfx.ring(new THREE.Vector3(this.pos.x, 0.05, this.pos.z), { color: 0xa8d8ff, radius: 6.5, dur: 0.8, thickness: 0.05 });
        this.game.vfx.burst(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), { count: 22, color: 0xbfe0ff, speed: 6, size: 0.5, life: 0.9, gravity: -3, up: 1 });
        this.game.ui.toast('무리 울부짖기 · 공격력/이동속도 증가');
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const up = smoothstep(0.1, 0.35, p) * (1 - smoothstep(0.8, 1, p));
        d.headPitch = -0.6 * up;
        d.neck = -0.35 * up;
        d.jaw = 0.45 * up;
        d.bodyY = 0.06 * up;
        d.pitch = -0.14 * up;
        d.lf = -0.2 * up;
        d.rf = -0.2 * up;
      },
    });
    return true;
  }

  // 곰 — 대지 강타
  skillStomp() {
    const dur = 1.15;
    let fired = false;
    this.action = {
      kind: 'stomp',
      t: 0,
      dur,
      moveScale: 0.08,
      onProgress: (dt, p) => {
        if (fired || p < 0.42) return;
        fired = true;
        const gp = new THREE.Vector3(this.pos.x, 0.06, this.pos.z);
        this.game.vfx.ring(gp, { color: 0xffb066, radius: 8.4, dur: 0.8, thickness: 0.09 });
        this.game.vfx.ring(gp, { color: 0xffe0b0, radius: 5.4, dur: 0.55, thickness: 0.05 });
        this.game.vfx.ring(gp, { color: 0xd8863c, radius: 11, dur: 1.1, thickness: 0.03 });
        this.game.vfx.burst(new THREE.Vector3(this.pos.x, 0.35, this.pos.z), { count: 34, color: 0xe2c08a, speed: 11, size: 0.8, life: 0.75, gravity: 13, up: 1 });
        this.game.vfx.shake(1.25);
        this.game.sfx.stomp();
        const hits = this.game.enemies.hitCircle(this.pos, 8.4, 32 * this.dmgMul, { knock: 10, stun: 1.3, source: this, heavy: true });
        if (hits) this.addCombo(hits);
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        if (p < 0.42) {
          const c = smoothstep(0, 0.42, p);
          d.pitch = -0.34 * c;
          d.bodyY = 0.2 * c;
          d.lf = d.rf = -1.35 * c;
          d.lfk = d.rfk = 1.3 * c;
          d.headPitch = -0.3 * c;
          d.jaw = 0.5 * c;
          d.tailX = 0.3 * c;
        } else {
          const c = smoothstep(0.42, 0.55, p) * (1 - smoothstep(0.75, 1, p));
          d.pitch = 0.32 * c;
          d.bodyY = -0.12 * c;
          d.lf = d.rf = 0.25 * c;
          d.lfk = d.rfk = 0.1 * c;
          d.headPitch = 0.3 * c;
          d.jaw = 0.25 * c;
        }
      },
    });
    return true;
  }

  // 곰 — 광폭 돌진
  skillCharge() {
    const dur = 1.2;
    let fired = false;
    this.hitSet = new Set();
    this.action = {
      kind: 'charge',
      t: 0,
      dur,
      moveScale: 0,
      onProgress: (dt, p) => {
        if (!fired) {
          fired = true;
          this.invuln = 1.0;
          this.game.sfx.dash();
          this.game.sfx.roar();
          this.game.vfx.shake(0.5);
        }
        if (p > 0.12 && p < 0.88) {
          this.vel.set(Math.sin(this.yaw) * 19, 0, Math.cos(this.yaw) * 19);
          this.game.vfx.dust(new THREE.Vector3(this.pos.x, 0, this.pos.z), Math.sin(this.yaw), Math.cos(this.yaw), 1.5);
          this.game.vfx.trail(this.pos, this.yaw, 0xffb066, 1.1);
          for (const e of this.game.enemies.all) {
            if (!e.alive || this.hitSet.has(e)) continue;
            if (e.root.position.distanceTo(this.pos) < 2.8) {
              this.hitSet.add(e);
              const hits = e.takeDamage(32 * this.dmgMul, { knock: 17, source: this, stun: 0.7 });
              if (hits) this.addCombo(1);
              this.game.vfx.shake(0.4);
            }
          }
        } else if (p >= 0.88) {
          this.vel.multiplyScalar(0.86);
        }
      },
      onEnd: () => {
        this.vel.multiplyScalar(0.3);
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const a = Math.sin(Math.min(1, p * 1.4) * Math.PI);
        d.pitch = 0.26 * a;
        d.bodyY = -0.06 * a;
        d.lf = d.rf = 0.55 * a;
        d.lfk = d.rfk = 0.3 * a;
        d.lb = d.rb = -0.5 * a;
        d.headPitch = 0.12 * a;
        d.jaw = 0.45 * a;
      },
    });
    return true;
  }

  // 아나콘다 — 압박하기
  skillConstrict() {
    const target = this.game.enemies.nearest(this.pos, 10, (e) => e.alive);
    if (!target) {
      this.game.ui.toast('조일 대상이 없습니다');
      this.game.sfx.ui();
      return false;
    }
    const dur = 2.5;
    let grabbed = false;
    let tickTimer = 0;
    let ticks = 0;
    this.constrictTarget = target;
    this.hitSet = new Set();

    const dirTo = new THREE.Vector3();
    this.action = {
      kind: 'constrict',
      t: 0,
      dur,
      moveScale: 0,
      onProgress: (dt, p) => {
        dirTo.copy(target.root.position).sub(this.pos);
        dirTo.y = 0;
        const dist = dirTo.length();
        if (dist > 0.001) dirTo.normalize();

        if (!grabbed && p < 0.3) {
          // 대상에게 미끄러지듯 파고들기
          const sp = Math.min(24, 8 + dist * 2.4);
          if (dist > 1.5) {
            this.pos.addScaledVector(dirTo, sp * dt);
            this.yaw = dampAngle(this.yaw, Math.atan2(dirTo.x, dirTo.z), 14, dt);
            this.game.vfx.trail(this.pos, this.yaw, 0x9ad06a, 1.0);
          }
          this.game.sfx.coil && p < 0.05 && this.game.sfx.coil();
        }

        if (!grabbed && (p >= 0.28 || dist <= 1.6)) {
          grabbed = true;
          target.stun(2.2);
          target.constricted = true;
          this.game.vfx.coil(target.root, { duration: 2.0, color: 0x9fe07a });
          this.game.vfx.ring(new THREE.Vector3(target.root.position.x, 0.05, target.root.position.z), { color: 0x9fe07a, radius: 3.4, dur: 0.7, thickness: 0.06 });
          this.game.vfx.shake(0.55);
          this.game.sfx.coil();
          this.game.ui.toast('압박! 대상이 움직이지 못합니다');
        }

        if (grabbed) {
          // 대상 옆에 붙어 조인다
          const side = new THREE.Vector3(-dirTo.z, 0, dirTo.x);
          const anchor = target.root.position.clone().addScaledVector(side, 0.55);
          this.pos.lerp(anchor, 1 - Math.exp(-8 * dt));
          this.pos.y = 0;
          this.vel.set(0, 0, 0);
          tickTimer -= dt;
          if (tickTimer <= 0 && ticks < 5 && p < 0.88) {
            tickTimer = 0.34;
            ticks++;
            target.takeDamage(9 * this.dmgMul, { knock: 0, source: this, silent: true, constrict: true });
            this.addCombo(1);
            this.game.vfx.burst(new THREE.Vector3(target.root.position.x, 0.8, target.root.position.z), { count: 5, color: 0x9fe07a, speed: 3, size: 0.4, life: 0.4, gravity: 2 });
            this.game.sfx.hit(false);
          }
        }
      },
      onEnd: () => {
        if (this.constrictTarget) {
          this.constrictTarget.constricted = false;
          this.constrictTarget.stun(0.2);
        }
        this.constrictTarget = null;
      },
    };

    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const grip = smoothstep(0.25, 0.4, p) * (1 - smoothstep(0.85, 1, p));
        d.sway = 0.9 * grip + 0.3 * (1 - grip);
        d.twist = Math.sin(p * 44) * 0.16 * grip;
        d.bodyY = -0.05 * grip;
        d.headPitch = 0.25 * grip;
        d.neck = 0.1 * grip;
        d.jaw = 0.3 * grip;
        d.pitch = 0.08 * grip;
      },
    });
    return true;
  }

  // 아나콘다 — 꼬리 강타
  skillTailSlam() {
    const dur = 0.95;
    let fired = false;
    this.action = {
      kind: 'tailslam',
      t: 0,
      dur,
      moveScale: 0.15,
      onProgress: (dt, p) => {
        if (fired || p < 0.34) return;
        fired = true;
        const gp = new THREE.Vector3(this.pos.x, 0.05, this.pos.z);
        this.game.vfx.ring(gp, { color: 0xa8e07a, radius: 5.4, dur: 0.6, thickness: 0.09 });
        this.game.vfx.ring(gp, { color: 0xe4ffc0, radius: 3.6, dur: 0.45, thickness: 0.04 });
        this.game.vfx.slash(gp, this.yaw, { color: 0xcaf59a, radius: 5.2, arc: Math.PI * 1.9, dur: 0.4, plane: 'horizontal', y: 0.35, thickness: 0.4 });
        this.game.vfx.burst(new THREE.Vector3(this.pos.x, 0.4, this.pos.z), { count: 22, color: 0xc8e8a0, speed: 10, size: 0.65, life: 0.55, gravity: 11, up: 0.7 });
        this.game.vfx.shake(0.75);
        this.game.sfx.slam();
        const hits = this.game.enemies.hitCircle(this.pos, 5.4, 28 * this.dmgMul, { knock: 14, stun: 0.5, source: this });
        if (hits) this.addCombo(hits);
      },
    };
    this.animator.play({
      duration: dur,
      onPose: (p, d) => {
        const a = p < 0.34 ? -smoothstep(0, 0.34, p) : Math.sin(smoothstep(0.34, 0.8, p) * Math.PI);
        d.twist = -0.75 * (p < 0.34 ? smoothstep(0, 0.34, p) : 0) + 1.15 * smoothstep(0.34, 0.6, p) * (1 - smoothstep(0.7, 1, p));
        d.sway = 0.85;
        d.bodyY = 0.02 * a;
        d.headPitch = 0.2 * a;
      },
    });
    return true;
  }
}
