// 플레이어 차량 물리 — 아케이드 드리프트 모델 (횡방향 미끄럼 + 접지력)
//
// 좌표 규약
//   fwd(yaw) = (sin yaw, cos yaw)   … 차의 정면
//   left(yaw) = (cos yaw, -sin yaw) … 차의 왼쪽 (모델 로컬 +X)
//   input.steer = +1 → 오른쪽(우회전), -1 → 왼쪽(좌회전)
//   yaw 를 증가시키면 정면이 left 쪽으로 돌므로, 우회전은 yawRate < 0 이다.
import THREE from './three.js?v=20261115b';
import { buildCar, updateCarVisual } from './carModel.js?v=20261115b';
import { clamp, damp, TAU } from './util.js?v=20261115b';

const WHEELBASE = 2.7;
const REVERSE_MAX = 12.5;
const SLIP_DAMP = 8.5;

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
    // 기어: DRIFT 홀드로 정지 후 후진
    this.reversing = false;
    this.driftHold = 0;
    this.reverseLock = 0;
    this.impact = 0;
    this.hitFlash = 0;
  }

  reset(s = 0, lateral = 0) {
    const p = this.track.placeAt(s, lateral);
    this.pos.set(p.x, 0, p.z);
    this.yaw = p.yaw;
    this.vel.x = 0;
    this.vel.z = 0;
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
    this.reversing = false;
    this.driftHold = 0;
    this.reverseLock = 0;
    this.impact = 0;
    this.hitFlash = 0;
    this.brake = 0;
    this.model.position.copy(this.pos);
    this.model.rotation.set(0, this.yaw, 0);
  }

  get kmh() { return Math.hypot(this.vel.x, this.vel.z) * 3.6; }

  get maxSpeed() { return this.spec.maxSpeed; }

  /** 드리프트 중 목표 슬립(옆으로 흐르는) 속도 — 슬립각 30~40도 */
  driftSlipTarget(steer, yawRate) {
    const a = Math.abs(this.speed);
    if (a < 4) return 0;
    const dir = Math.sign(steer) || Math.sign(this.vLat) || 1;
    const ratio = clamp(0.5 + 0.26 * Math.abs(steer), 0.5, 0.84) * (0.9 + 0.1 * this.spec.driftGrip);
    // 회전(yaw)이 매 프레임 만들어내는 횡속도만큼 목표를 낮춰 실제 슬립각이 ratio 에 수렴하게
    const feed = a * Math.abs(yawRate || 0) / SLIP_DAMP;
    return dir * Math.max(0, Math.min(a * 0.94, a * ratio) - feed);
  }

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
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const left = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let vLong = this.vel.x * fwd.x + this.vel.z * fwd.z;
    let vLat = this.vel.x * left.x + this.vel.z * left.z;

    /* ── 기어: DRIFT 홀드 → 브레이크 → 저속 후진 ─────────── */
    const wantsDrift = !!input.drift;
    if (wantsDrift && !this.drifting) this.driftHold += dt;
    else if (!wantsDrift) this.driftHold = 0;

    if (!wantsDrift && this.reversing) {
      this.reversing = false;
      this.reverseLock = 0.3;      // 놓은 직후 바로 전진 가속하지 않게
    }
    const driftBrake = wantsDrift && !this.drifting && !this.reversing;

    // 정지 상태에서 DRIFT를 계속 누르면 후진 기어
    if (driftBrake && !input.brake && Math.abs(vLong) < 3.0 && this.driftHold > 0.3) {
      this.reversing = true;
      this.events.push('reverse');
    }

    /* ── 엔진 ─────────────────────────────────────────── */
    const boosting = this.boostTimer > 0;
    const maxSpeed = spec.maxSpeed * (boosting ? 1.24 : 1);
    this.reverseLock = Math.max(0, this.reverseLock - dt);

    if (this.reversing) {
      // 후진: 남은 전진 속도를 먼저 지운 뒤 뒤로
      if (vLong > 0.15) vLong = Math.max(0, vLong - 30 * dt);
      else vLong -= spec.accel * 0.5 * dt;
      vLong = Math.max(vLong, -REVERSE_MAX);
    } else if (input.brake) {
      if (vLong > 0.5) vLong -= 34 * dt;
      else vLong -= spec.accel * 0.5 * dt;
      vLong = Math.max(vLong, -REVERSE_MAX);
    } else if (driftBrake) {
      // 드리프트 중이 아닐 때 DRIFT 홀드 = 브레이크
      const b = 22 * dt;
      vLong = Math.abs(vLong) <= b ? 0 : vLong - Math.sign(vLong) * b;
    } else if (this.reverseLock > 0) {
      const b = 16 * dt;
      vLong = Math.abs(vLong) <= b ? 0 : vLong - Math.sign(vLong) * b;
    } else {
      const head = 1 - clamp(vLong / maxSpeed, 0, 1);
      vLong += spec.accel * (0.35 + 0.65 * head) * dt;
    }
    if (boosting && !this.reversing && !driftBrake) vLong += 17 * dt;

    // 저항
    const drag = offRoad ? 2.6 : 0.55;
    vLong -= vLong * drag * dt * 0.1;
    vLong -= Math.sign(vLong) * 0.42 * dt;
    vLong = clamp(vLong, -REVERSE_MAX, maxSpeed);
    this.brake = (input.brake || driftBrake || (this.reversing && vLong > 0.4)) ? 1 : 0;

    /* ── 드리프트 판정 ────────────────────────────────── */
    const canDrift = !this.reversing && Math.abs(vLong) > 8.5 && Math.abs(steer) > 0.1 && !offRoad;
    const drifting = wantsDrift && canDrift;
    if (drifting) {
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

    // 우조향(+1)이면 우회전 → yawRate < 0 (후진 중에는 yaw 부호가 뒤집혀
    //  뒷바퀴가 조향 쪽으로 흐른다 = 차체 뒷부분이 화면에서 누른 쪽으로 간다)
    let yawRate = -(vLong / WHEELBASE) * Math.tan(maxSteer * this.steerVisual);
    if (this.reversing) yawRate *= 0.8;

    const gripBase = 24 * spec.grip;
    const latAccelCap = (this.drifting ? 27 * spec.driftGrip : gripBase) * (offRoad ? 0.5 : 1);
    const cap = latAccelCap / Math.max(6, Math.abs(vLong));
    yawRate = clamp(yawRate, -cap, cap);
    if (this.drifting) yawRate *= 1.1 * spec.steer;

    /* ── 접지력 / 드리프트 슬립 ───────────────────────── */
    if (this.drifting) {
      // 차체는 코너 안쪽을 향하고 진행 방향은 바깥으로 흐른다 (슬립각 30~40도)
      const target = this.driftSlipTarget(this.steerVisual, yawRate);
      vLat = damp(vLat, target, SLIP_DAMP, dt);
      if (Math.abs(vLong) > 5) vLong += 2.2 * dt;
    } else {
      const grip = offRoad ? 4.5 : 11.5;
      vLat *= Math.exp(-grip * dt);
    }

    // 회전 전 축 기준으로 월드 속도 재구성
    this.vel.x = fwd.x * vLong + left.x * vLat;
    this.vel.z = fwd.z * vLong + left.z * vLat;
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
      const rx = p2.tz, rz = -p2.tx;              // 트랙 바깥(부호 적용) 법선
      const nx = rx * sgn, nz = rz * sgn;
      const over = Math.abs(p2.lat) - wallLimit;
      this.pos.x -= nx * over * 1.01;
      this.pos.z -= nz * over * 1.01;
      const vn = this.vel.x * nx + this.vel.z * nz;   // 벽으로 파고드는 속도
      if (vn > 0.2) {
        const vtx = this.vel.x - nx * vn;
        const vtz = this.vel.z - nz * vn;
        const restitution = 0.52;                    // 단단히 튕겨 나옴
        const friction = 0.74;                       // 스치는 속도 손실
        this.vel.x = vtx * friction - nx * vn * restitution;
        this.vel.z = vtz * friction - nz * vn * restitution;
        if (vn > 2.2) {
          this.wallHit = Math.min(1, 0.55 + vn * 0.045);
          this.impact = vn;
          this.hitFlash = 1;
          this.events.push({ type: 'wall', x: this.pos.x - nx * 1.0, z: this.pos.z - nz * 1.0, power: vn });
        }
      }
      this.drifting = false;
      this.driftTime = 0;
      this.lat = sgn * wallLimit;   // 보정된 위치 기준으로 갱신
    }
    this.wallHit = Math.max(0, this.wallHit - dt * 2.4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3.2);
    this.impact = 0;

    /* ── 부스터 ───────────────────────────────────────── */
    if (input.boost && this.nitro > 0.02 && !this.reversing) {
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
    const rollTarget = clamp(yawRate * Math.abs(vLong) * 0.014, -0.18, 0.18);
    this.roll = damp(this.roll, rollTarget, 6, dt);
    this.model.rotation.z = this.roll;
    updateCarVisual(this, dt);
  }

  consumeEvent() {
    return this.events.shift() || null;
  }

  rearWheelWorld(side = 1) {
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const left = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    return {
      x: this.pos.x - fwd.x * 1.45 + left.x * 0.95 * side,
      z: this.pos.z - fwd.z * 1.45 + left.z * 0.95 * side,
    };
  }
}
