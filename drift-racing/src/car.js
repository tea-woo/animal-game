// 플레이어 차량 물리 — 아케이드 드리프트 모델 (횡방향 미끄럼 + 접지력)
import THREE from './three.js?v=20261115a';
import { buildCar, updateCarVisual } from './carModel.js?v=20261115a';
import { clamp, damp, TAU } from './util.js?v=20261115a';

const WHEELBASE = 2.7;

export class Car {
  constructor(spec, track) {
    this.spec = spec;
    this.track = track;
    this.model = buildCar(spec);
    this.pos = new THREE.Vector3();
    this.vel = { x: 0, z: 0 };
    this.yaw = 0;
    this.speed = 0;
    this.vLat = 0;
    this.steerVisual = 0;
    this.pathHint = -1;
    this.lat = 0;
    this.progressS = 0;
    this.offRoad = false;
    this.drifting = false;
    this.driftTime = 0;
    this.driftLevel = 0;
    this.driftCharge = 0;   // 0~1 게이지
    this.nitro = 0.35;      // 0~1
    this.boostTimer = 0;
    this.boostPower = 0;
    this.brake = 0;
    this.topSpeed = 0;
    this.slip = 0;
    this.events = [];
    this.roll = 0;
    this.pitch = 0;
    this.wallHit = 0;
  }

  reset(s = 0, lateral = 0) {
    const p = this.track.placeAt(s, lateral);
    this.pos.set(p.x, 0, p.z);
    this.yaw = p.yaw;
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    this.vel.x = f.x * 0;
    this.vel.z = f.z * 0;
    this.speed = 0;
    this.vLat = 0;
    this.steerVisual = 0;
    this.pathHint = Math.round((s / this.track.ds) % this.track.N);
    this.progressS = s;
    this.lat = lateral;
    this.drifting = false;
    this.driftTime = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.nitro = 0.35;
    this.boostTimer = 0;
    this.topSpeed = 0;
    this.slip = 0;
    this.events.length = 0;
    this.model.position.copy(this.pos);
    this.model.rotation.set(0, this.yaw, 0);
  }

  get kmh() { return Math.hypot(this.vel.x, this.vel.z) * 3.6; }

  get maxSpeed() { return this.spec.maxSpeed; }

  update(dt, input) {
    const t = this.track;
    const proj = t.project(this.pos.x, this.pos.z, this.pathHint);
    this.pathHint = proj.index;
    this.lat = proj.lat;
    this.progressS = proj.s;

    const absLat = Math.abs(proj.lat);
    const offRoad = absLat > t.halfWidth + 0.4;
    const wallLimit = t.railOff - 1.0;

    const spec = this.spec;
    const steer = clamp(input.steer || 0, -1, 1);
    this.steerVisual = damp(this.steerVisual, steer, 14, dt);

    // 유선형 조향 (속도가 높을수록 조향각 감소)
    const speedNorm = clamp(Math.abs(this.speed) / spec.maxSpeed, 0, 1.4);
    const maxSteer = 0.6 - 0.2 * Math.min(1, speedNorm) - 0.12 * Math.max(0, speedNorm - 1);

    // 현재 프레임 속도 분해
    let fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    let right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let vLong = this.vel.x * fwd.x + this.vel.z * fwd.z;
    let vLat = this.vel.x * right.x + this.vel.z * right.z;

    /* ── 엔진 ─────────────────────────────────────────── */
    const boosting = this.boostTimer > 0;
    const maxSpeed = spec.maxSpeed * (boosting ? 1.24 : 1);
    const throttleOn = !input.brake || vLong < 1;

    if (input.brake) {
      if (vLong > 0.5) vLong -= 34 * dt;
      else vLong -= spec.accel * 0.55 * dt; // 후진
    }
    if (throttleOn) {
      const head = 1 - clamp(vLong / maxSpeed, 0, 1);
      const push = spec.accel * (0.35 + 0.65 * head);
      vLong += push * dt;
    }
    if (boosting) vLong += 17 * dt;

    // 저항
    const drag = offRoad ? 2.6 : 0.55;
    vLong -= vLong * drag * dt * 0.1;
    vLong -= Math.sign(vLong) * 0.42 * dt;
    vLong = clamp(vLong, -13, maxSpeed);
    this.brake = input.brake ? 1 : 0;

    /* ── 드리프트 판정 ────────────────────────────────── */
    const wantsDrift = !!input.drift;
    const canDrift = Math.abs(vLong) > 8.5 && Math.abs(steer) > 0.1 && !offRoad;
    if (wantsDrift && canDrift) {
      if (!this.drifting) {
        this.drifting = true;
        this.driftTime = 0;
        this.events.push('drift-start');
      }
      this.driftTime += dt;
      this.driftLevel = this.driftTime > 2.1 ? 3 : this.driftTime > 0.95 ? 2 : 1;
      this.driftCharge = clamp(this.driftTime / 2.6, 0, 1);
      this.nitro = clamp(this.nitro + dt * (0.055 + 0.03 * this.driftLevel), 0, 1);
    } else if (this.drifting) {
      // 드리프트 종료 → 미니 터보
      this.drifting = false;
      const lvl = this.driftTime > 1.5 ? 3 : this.driftTime > 0.7 ? 2 : 1;
      if (this.driftTime > 0.45) {
        this.boostTimer = Math.max(this.boostTimer, 0.35 + lvl * 0.32);
        this.boostPower = Math.max(this.boostPower, lvl);
        vLong += 1.4 * lvl;
        this.events.push({ type: 'miniturbo', level: lvl });
      }
      this.driftTime = 0;
      this.driftLevel = 0;
      this.driftCharge = 0;
    }

    /* ── 회전 ─────────────────────────────────────────── */
    if (!this.drifting) this.boostPower = Math.max(0, this.boostPower - dt * 0.6);

    let yawRate = (vLong / WHEELBASE) * Math.tan(maxSteer * this.steerVisual);
    const gripBase = 24 * spec.grip;
    const latAccelCap = (this.drifting ? 15.5 * spec.driftGrip : gripBase) * (offRoad ? 0.5 : 1);
    const cap = latAccelCap / Math.max(7, Math.abs(vLong));
    yawRate = clamp(yawRate, -cap, cap);
    if (this.drifting) yawRate *= 1.12 * spec.steer;

    /* ── 접지력 (횡방향 마찰) ─────────────────────────── */
    let grip;
    if (this.drifting) grip = (2.7 / spec.driftGrip) * (offRoad ? 1.9 : 1);
    else grip = offRoad ? 4.5 : 11.5;
    vLat *= Math.exp(-grip * dt);
    if (this.drifting && Math.abs(vLong) > 5) vLong += 2.2 * dt;

    // 회전 전 축 기준으로 월드 속도 재구성
    this.vel.x = fwd.x * vLong + right.x * vLat;
    this.vel.z = fwd.z * vLong + right.z * vLat;
    this.speed = vLong;
    this.vLat = vLat;

    // 조향 회전 (차체만 먼저 돌리고, 속도 벡터는 관성으로 남는다 → 드리프트)
    this.yaw += yawRate * dt;
    this.yaw = ((this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    /* ── 가드레일 충돌 ────────────────────────────────── */
    const p2 = t.project(this.pos.x, this.pos.z, this.pathHint);
    this.pathHint = p2.index;
    this.progressS = p2.s;
    this.lat = p2.lat;
    this.offRoad = Math.abs(p2.lat) > t.halfWidth + 0.4;
    if (Math.abs(p2.lat) > wallLimit) {
      const sgn = Math.sign(p2.lat);
      const rx = p2.tz, rz = -p2.tx;
      const over = Math.abs(p2.lat) - wallLimit;
      this.pos.x -= rx * sgn * over;
      this.pos.z -= rz * sgn * over;
      const outward = this.vel.x * rx * sgn + this.vel.z * rz * sgn;
      if (outward > 0) {
        this.vel.x -= rx * sgn * outward * 1.35;
        this.vel.z -= rz * sgn * outward * 1.35;
      }
      const sp = Math.hypot(this.vel.x, this.vel.z);
      // 벽에 붙어 멈추지 않게 약한 마찰만 적용
      this.vel.x *= 0.975;
      this.vel.z *= 0.975;
      if (sp > 12) this.wallHit = 1;
      this.drifting = false;
      this.driftTime = 0;
    }
    this.wallHit = Math.max(0, this.wallHit - dt * 2);

    /* ── 부스터 ───────────────────────────────────────── */
    if (input.boost && this.nitro > 0.02) {
      this.nitro = Math.max(0, this.nitro - dt * 0.3);
      this.boostTimer = Math.max(this.boostTimer, 0.18);
      this.boostPower = Math.max(this.boostPower, 2.4);
    }
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) this.boostTimer = 0;
    }

    this.topSpeed = Math.max(this.topSpeed, this.kmh);
    this.slip = Math.abs(Math.atan2(vLat, Math.max(1, Math.abs(vLong))));

    /* ── 시각 반영 ────────────────────────────────────── */
    this.model.position.set(this.pos.x, 0, this.pos.z);
    this.model.rotation.y = this.yaw;
    const rollTarget = clamp(-yawRate * Math.abs(vLong) * 0.012, -0.16, 0.16);
    this.roll = damp(this.roll, rollTarget, 6, dt);
    this.model.rotation.z = this.roll;
    updateCarVisual(this, dt);
  }

  consumeEvent() {
    return this.events.shift() || null;
  }

  rearWheelWorld(side = 1) {
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    return {
      x: this.pos.x - fwd.x * 1.45 + right.x * 0.95 * side,
      z: this.pos.z - fwd.z * 1.45 + right.z * 0.95 * side,
    };
  }
}
