// 플레이어 차량 물리 — 아케이드 드리프트 모델 (횡방향 미끄럼 + 접지력)
//
// 좌표 규약
//   fwd(yaw) = (sin yaw, cos yaw)   … 차의 정면
//   left(yaw) = (cos yaw, -sin yaw) … 차의 왼쪽 (모델 로컬 +X)
//   input.steer = +1 → 오른쪽(우회전), -1 → 왼쪽(좌회전)
//   yaw 를 증가시키면 정면이 left 쪽으로 돌므로, 우회전은 yawRate < 0 이다.
import THREE from './three.js?v=20261121a';
import { buildCar, updateCarVisual, applyBodyAttitude } from './carModel.js?v=20261121a';
import { clamp, damp, smoothstep, TAU } from './util.js?v=20261121a';

const WHEELBASE = 2.7;
const REVERSE_MAX = 12.5;
// 드리프트 중 니트로 충전 배율 (아빠 피드백: 기존보다 3배 빠르게)
const NITRO_DRIFT_GAIN = 3;
// 후진이 발동되는 속도 임계값 — HUD 의 드리프트 버튼이 R 로 바뀌는 기준과 같다
const REVERSE_TRIGGER = 3.0;
// 차체 롤 한계 — 과하지 않은 서스펜션 롤 수준(약 10°)
const ROLL_MAX = 0.18;
// 가감속 피치 한계 (약 1.2°)
const PITCH_MAX = 0.021;
// 드리프트 슬립 — 차체가 진행 방향보다 코너 안쪽으로 향하는 각도(뒤가 흐르는 느낌).
//  예전 30~38° 는 '옆으로 게걸음'이라 사용자가 싫어했고, 20261117a 의 ~10° 는 레일 위처럼 딱딱했다.
//  20261118b 의 22~26°(실측 24.2°)가 가장 좋다는 피드백으로 이 값으로 되돌렸다.
//  30°+ 는 '옆으로 게걸음'이 되어 코너 밖 벽에 박는다.
const DRIFT_SLIP_RATIO = 0.45;   // 횡속도 ≤ |전진속도| × 0.45 (≈ 24.2°)
const DRIFT_SLIP_GRIP = 4.6;     // 드리프트 중 횡감쇠 — 낮을수록 더 미끄러진다(정상상태 횡속도 ≈ 57 × driftGrip / 이 값)
// 드리프트를 놓은 뒤 접지력이 11.5 로 뚝 튀지 않게 되돌아오는 시간(초)
//  실제로는 아직 옆으로 흐르고 있는데 접지가 순간적으로 붙으면 슬라이드가 '뚝' 끊긴다.
//  이 시간 동안 접지력 4.6→11.5·슬립 상한 0.45→0.18 이 부드럽게 복귀한다(손 뗀 뒤 한 박자 여운).
//  20261121a — 한 단계 더 길게: 유지 0.26→0.42초 · 복귀 0.88→1.25초
const DRIFT_GRIP_RECOVER = 1.25;
// 해제 직후 이 시간만큼은 접지를 거의 풀어둔 채 그대로 흘러간다(여운의 앞부분)
const DRIFT_GRIP_HOLD = 0.42;
// DRIFT 를 쥔 채 조향 버튼을 잠깐 떼어도 드리프트 판정을 유지하는 관성(초) — 모바일 손가락 여운
//  20261121a — 0.35→0.42초
const DRIFT_STEER_GRACE = 0.42;

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
    this.driftGrip = 0;     // 1 = 드리프트 접지, 0 = 완전 접지 — 해제 후 여운을 두고 돌아온다
    this.driftEase = 0;     // 해제 후 경과 시간(초) — 접지 복귀 곡선의 시간축
    this.driftSteerGrace = 0; // 조향을 잠깐 놓아도 드리프트 판정을 유지하는 관성(초)
    this.nitro = 0.35;      // 0~1
    this.boostTimer = 0;
    this.boostPower = 0;
    this.brake = 0;
    this.topSpeed = 0;
    this.slip = 0;
    this.events = [];
    this.roll = 0;
    this.pitch = 0;
    this.accelLong = 0;
    this.wallHit = 0;
    // 차량끼리 충돌 넉백 — 그립 감쇠에 먹히지 않는 추가 속도(짧게 유지)
    this.knock = { x: 0, z: 0 };
    this.knockT = 0;
    this.yawKick = 0;
    // 기어: DRIFT 홀드로 정지 후 후진
    this.reversing = false;
    this.driftHold = 0;
    this.reverseLock = 0;
    this.impact = 0;
    this.hitFlash = 0;
    this.driftVis = 0;
    // 수직 운동 (오프로드 점프대·착지)
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.climb = 0;
    this.lastSurf = null;
    this.inMud = false;
    this.mudSplash = 0;
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
    this.driftGrip = 0;
    this.driftEase = 0;
    this.driftSteerGrace = 0;
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
    this.knock.x = 0;
    this.knock.z = 0;
    this.knockT = 0;
    this.yawKick = 0;
    this.brake = 0;
    this.roll = 0;
    this.pitch = 0;
    this.accelLong = 0;
    this.driftVis = 0;
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.climb = 0;
    this.lastSurf = null;
    this.inMud = false;
    this.mudSplash = 0;
    this.model.position.set(this.pos.x, this.surfaceNow(), this.pos.z);
    this.model.rotation.set(0, this.yaw, 0);
    applyBodyAttitude(this.model, 0, 0);
  }

  get kmh() { return Math.hypot(this.vel.x, this.vel.z) * 3.6; }

  /** 정지(후진 발동 속도 이하) 상태 — HUD 의 드리프트 버튼을 R 로 표시할 기준 */
  get atRest() {
    return Math.abs(this.speed) < REVERSE_TRIGGER || this.reversing;
  }

  /** 현재 위치의 노면 높이(램프 포함) */
  surfaceNow() {
    const t = this.track;
    const y = t.surfaceAt ? t.surfaceAt(this.progressS, this.lat) : t.heightAt(this.progressS, this.lat);
    this.y = y;
    this.lastSurf = y;
    return y;
  }

  /** 차량 충돌 임펄스 — 속도 변화 + 그립에 먹히지 않는 넉백 + 차체 흔들림 */
  applyImpulse(vx, vz) {
    this.vel.x += vx;
    this.vel.z += vz;
    // 넉백 성분은 접지력 감쇠를 받지 않으므로 실제로 밀려나는 거리로 체감된다
    this.knock.x += vx * 0.9;
    this.knock.z += vz * 0.9;
    this.knockT = 0.55;
    // 충격을 받은 쪽 옆구리 방향으로 차체가 휘청 (좌우 부호는 충격의 횡성분)
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    const lat = vx * lx + vz * lz;
    const mag = Math.hypot(vx, vz);
    this.yawKick = clamp(this.yawKick + (lat >= 0 ? 1 : -1) * Math.min(0.95, mag * 0.09), -1.2, 1.2);
    this.impact = mag;
  }

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
    const mudNow = t.mudAt ? t.mudAt(this.progressS, this.lat) : null;
    this.inMud = !!mudNow;

    const spec = this.spec;
    const steer = clamp(input.steer || 0, -1, 1);
    this.steerVisual = damp(this.steerVisual, steer, 14, dt);

    // 유선형 조향 (속도가 높을수록 조향각 감소)
    //  차종별 조향 특성(spec.steer)도 반영 — SLIDE-R 은 조금 더 예리하고 GT/VX-9 은 중립
    const speedNorm = clamp(Math.abs(this.speed) / spec.maxSpeed, 0, 1.4);
    const maxSteer = (0.6 - 0.2 * Math.min(1, speedNorm) - 0.12 * Math.max(0, speedNorm - 1)) * (spec.steer || 1);

    // 현재 프레임 속도 분해
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const left = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let vLong = this.vel.x * fwd.x + this.vel.z * fwd.z;
    let vLat = this.vel.x * left.x + this.vel.z * left.z;
    const vLongIn = vLong;

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
    if (driftBrake && !input.brake && Math.abs(vLong) < REVERSE_TRIGGER && this.driftHold > 0.3) {
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

    // 저항 (진흙에서는 무겁게 붙는다)
    const drag = (offRoad ? 2.6 : 0.55) * (mudNow ? 4.2 : 1);
    vLong -= vLong * drag * dt * 0.1;
    vLong -= Math.sign(vLong) * 0.42 * dt;
    if (mudNow) vLong -= vLong * 0.5 * dt;
    vLong = clamp(vLong, -REVERSE_MAX, maxSpeed);
    this.brake = (input.brake || driftBrake || (this.reversing && vLong > 0.4)) ? 1 : 0;

    /* ── 드리프트 판정 ────────────────────────────────── */
    // 모바일 터치에서 조향 버튼을 잠깐 떼는 순간에도 DRIFT 를 쥐고 있으면 0.30초 관성 유지 —
    //  판정이 즉시 풀려 슬라이드가 뚝 끊기고 드리프트 레벨/니트로가 리셋되던 문제를 막는다.
    if (Math.abs(steer) > 0.1) this.driftSteerGrace = DRIFT_STEER_GRACE;
    else this.driftSteerGrace = Math.max(0, this.driftSteerGrace - dt);
    const steerForDrift = Math.abs(steer) > 0.1 || (wantsDrift && this.drifting && this.driftSteerGrace > 0);
    const canDrift = !this.reversing && Math.abs(vLong) > 8.5 && steerForDrift && !offRoad;
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
      this.nitro = clamp(this.nitro + dt * (0.055 + 0.03 * this.driftLevel) * NITRO_DRIFT_GAIN, 0, 1);
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
    // DRIFT 홀드 중에는 일반 조향보다 확실히 더 날카롭게 코너 안쪽으로 감아 돈다
    //  (아빠 피드백: 드리프트 후 부스터로 커브를 꺾어 나갈 수 있게 선회력을 강화)
    if (this.drifting) yawRate *= 1.95;
    if (this.reversing) yawRate *= 0.8;

    // 횡가속 한계 — 예전 값(24/27 m/s²)은 중속에서도 초당 80~100°씩 머리가 팽이처럼
    //  돌아버려 '제자리 회전'처럼 보였다. 실제 코너 궤적을 따라 옆으로 흐르는 수준으로 낮춘다.
    const gripBase = 19.5 * spec.grip;
    // 드리프트는 접지 선회보다 확실히 더 잘 감아 돌아야 한다 — 예전 22.5 는 타이트한 코너에서
    // 회전이 모자라 차가 코너 바깥으로 밀려 나가 가드레일로 직행했다.
    const latAccelCap = (this.drifting ? 57 * spec.driftGrip : gripBase) * (offRoad ? 0.5 : 1);
    const cap = latAccelCap / Math.max(7, Math.abs(vLong));
    yawRate = clamp(yawRate, -cap, cap);
    // 공중에서는 조종이 거의 들지 않는다
    if (this.airborne) yawRate *= 0.22;

    /* ── 접지력 / 드리프트 ─────────────────────── */
    if (this.airborne) {
      // 공중 — 속도 벡터 그대로 나아간다 (조종은 거의 들지 않는다)
      vLat *= Math.exp(-0.4 * dt);
    } else {
      // 드리프트 중에는 뒤가 흐르는 느낌을 낸다 — 횡감쇠를 낮춰 차체가 진행 방향보다
      //  코너 안쪽을 22~26° 안팎으로 향하게 하고(오버스티어), 횡속도 한계도 그만큼만 푼다.
      // 드리프트 접지 여운 — 드리프트를 막 끝냈거나 조향을 잠깐 놓아 판정이 풀려도
      //  접지력이 11.5 로 곧바로 튀지 않고, DRIFT_GRIP_RECOVER(1.25초) 동안 부드럽게 돌아오며
      //  아직 남은 횡속도가 서서히 잡혀 슬라이드가 '한 박자' 이어진다.
      if (this.drifting) {
        this.driftGrip = 1;
        this.driftEase = 0;
      } else if (this.driftGrip > 0) {
        this.driftEase = Math.min(DRIFT_GRIP_RECOVER, this.driftEase + dt);
        const u = (this.driftEase - DRIFT_GRIP_HOLD) / (DRIFT_GRIP_RECOVER - DRIFT_GRIP_HOLD);
        //  20261121a — 여운을 한 단계 더 길게: 유지 0.26→0.42초 · 복귀 0.88→1.25초
        this.driftGrip = 1 - smoothstep(u);   // 앞부분은 미끄러지고 끝은 뚝 끊기지 않게 부드럽게
      }
      const gripBase = mudNow ? 2.4 : offRoad ? 4.5 : 11.5;
      const gripping = this.drifting
        ? DRIFT_SLIP_GRIP
        : gripBase - (gripBase - DRIFT_SLIP_GRIP) * this.driftGrip;
      vLat *= Math.exp(-gripping * dt);
      const driftSlip = DRIFT_SLIP_RATIO * (0.92 + 0.08 * (spec.driftGrip || 1));  // SLIDE-R 은 조금 더 흐르고 VX-9 은 조금 더 안정적
      const slipRatio = this.drifting
        ? driftSlip
        : 0.18 + (driftSlip - 0.18) * this.driftGrip;  // 해제 직후에도 남은 횡속도를 잘라내지 않는다
      const latLimit = Math.abs(vLong) * slipRatio;
      vLat = clamp(vLat, -latLimit, latLimit);
      if (this.drifting && Math.abs(vLong) > 5) vLong += 2.2 * dt;
    }

    // 회전 전 축 기준으로 월드 속도 재구성
    this.vel.x = fwd.x * vLong + left.x * vLat;
    this.vel.z = fwd.z * vLong + left.z * vLat;
    this.speed = vLong;
    this.vLat = vLat;

    // 조향 회전 (차체만 먼저 돌리고, 속도 벡터는 관성으로 남는다 → 드리프트)
    //  + 충돌로 받은 차체 흔들림(yawKick)은 짧게 감쇠
    this.yaw += (yawRate + this.yawKick) * dt;
    this.yawKick *= Math.exp(-5.5 * dt);
    this.yaw = ((this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;

    // 넉백 성분 포함 이동 — 충돌 직후에는 접지력과 무관하게 확 밀려난다
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    if (this.knockT > 0) {
      this.knockT = Math.max(0, this.knockT - dt);
      const kd = Math.exp(-2.9 * dt);
      this.knock.x *= kd;
      this.knock.z *= kd;
    } else {
      this.knock.x *= Math.exp(-11 * dt);
      this.knock.z *= Math.exp(-11 * dt);
    }
    if (Math.hypot(this.knock.x, this.knock.z) < 0.04) { this.knock.x = 0; this.knock.z = 0; }

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

    /* ── 오프로드 장애물 충돌 (바위·통나무·상자) ────── */
    if (t.obstaclesNear && t.obstacles.length) {
      const near = t.obstaclesNear(this.progressS, this.lat, 9);
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
        const rad = o.r + 1.2;
        const d2 = dx * dx + dz * dz;
        if (d2 > rad * rad || d2 < 1e-5) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        this.pos.x += nx * (rad - d);
        this.pos.z += nz * (rad - d);
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < -0.5) {
          const imp = -vn;
          // 반사 + 큰 속도 손실 — 부딫히면 확 튕겨 나간다
          this.vel.x = (this.vel.x - 1.5 * vn * nx) * 0.52;
          this.vel.z = (this.vel.z - 1.5 * vn * nz) * 0.52;
          const push = Math.min(7.5, imp * 0.55);
          this.knock.x += nx * push;
          this.knock.z += nz * push;
          this.knockT = 0.5;
          this.impact = imp;
          this.hitFlash = 1;
          this.drifting = false;
          this.driftTime = 0;
          if (imp > 1.0) {
            this.events.push({ type: 'obstacle', x: o.x, z: o.z, power: imp, kind: o.kind });
          }
        }
      }
    }

    /* ── 수직 운동 — 점프대에서 뛰어오르고 착지한다 ── */
    const surf = t.surfaceAt
      ? t.surfaceAt(this.progressS, this.lat)
      : t.heightAt(this.progressS, this.lat);
    if (this.lastSurf == null) this.lastSurf = surf;
    const dSurf = (surf - this.lastSurf) / Math.max(dt, 1e-4);
    this.lastSurf = surf;
    if (!this.airborne) {
      if (this.climb > 0.9 && dSurf < -6 && Math.abs(vLong) > 6) {
        this.airborne = true;
        this.vy = Math.min(13, this.climb * 1.25 + 0.6);
        this.y = surf + 0.05;
        this.events.push({ type: 'jump', x: this.pos.x, z: this.pos.z });
      } else {
        this.climb = damp(this.climb, Math.max(0, dSurf), 14, dt);
        this.y = surf;
      }
    }
    if (this.airborne) {
      this.vy -= 27 * dt;
      this.y += this.vy * dt;
      if (this.y <= surf) {
        const land = -this.vy;
        this.y = surf;
        this.vy = 0;
        this.airborne = false;
        this.climb = 0;
        if (land > 1.5) {
          this.events.push({ type: 'land', x: this.pos.x, z: this.pos.z, power: land });
        }
      }
    }

    /* ── 진흙을 지나면 튄다 ── */
    if (mudNow && Math.hypot(this.vel.x, this.vel.z) > 4) {
      this.mudSplash += dt * 30;
    }

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
    // 지면 높이(오프로드 굴곡)와 지형 경사를 차체 전체에 적용 — 바퀴는 노면을 따라간다
    const gh = this.y;
    const hF = t.surfaceAt ? t.surfaceAt(this.progressS + 1.35, this.lat) : t.heightAt(this.progressS + 1.35, this.lat);
    const hR = t.surfaceAt ? t.surfaceAt(this.progressS - 1.45, this.lat) : t.heightAt(this.progressS - 1.45, this.lat);
    const terrPitch = this.airborne
      ? -Math.atan2(this.vy, Math.max(8, Math.abs(vLong)))
      : -Math.atan2(hF - hR, 2.8);
    this.model.position.set(this.pos.x, gh, this.pos.z);
    this.model.rotation.y = this.yaw;
    this.model.rotation.x = damp(this.model.rotation.x, terrPitch, 9, dt);

    // 차체 롤 — 조향 입력이 아니라 실제 횡가속도(원심력) × 주행 속도에 비례.
    //  저속(≈30km/h 이하)에서는 거의 수평, 고속·드리프트·부스트 선회에서만
    //  서스펜션 롤처럼 은은하게(최대 0.18rad ≈ 10°) 기운다.
    const vAbs = Math.abs(vLong);
    const speedRatio = clamp(vAbs / spec.maxSpeed, 0, 1.35);
    const latAcc = Math.abs(yawRate) * vAbs;                       // m/s² 원심 가속도
    const latNorm = clamp(Math.pow(latAcc / (24 * spec.grip), 0.75), 0, 1.4);   // 접지 한계 대비
    const speedGate = clamp((speedRatio - 0.10) / 0.62, 0, 1);     // 속도 게이트(저속 0)
    const driftGain = this.drifting ? 1.16 : 1;
    const rollTarget = Math.sign(yawRate)
      * clamp(latNorm * speedGate * driftGain, 0, 1) * ROLL_MAX;
    this.roll = damp(this.roll, rollTarget, 7, dt);

    // 가속하면 앞이 들리고, 브레이크를 밟으면 앞이 꺼지는 피치
    const aLong = (vLong - vLongIn) / Math.max(dt, 1e-4);
    this.accelLong = damp(this.accelLong, clamp(aLong, -42, 42), 6, dt);
    const pitchTarget = clamp(-this.accelLong * 0.0028, -PITCH_MAX, PITCH_MAX);
    this.pitch = damp(this.pitch, pitchTarget, 8, dt);

    // 롤·피치·드리프트 연출은 차체에만 — 바퀴는 지면에 붙어 있다
    applyBodyAttitude(this.model, this.roll, this.pitch);
    // 아케이드 드리프트 연출 — 실제 슬립(22~26°)에 더해 차체만 코너 안쪽으로 조금 더(최대 ~7°)
    //  틀어 보인다. 해제 시에는 2.6 으로 천천히 풀어 시각적으로도 여운이 자연스럽게 이어진다
    //  (20261121a — 접지 복귀가 1.25초로 길어진 만큼 차체 틀어짐도 그 길이에 맞춰 더디게 풀린다).
    const driftVisTarget = this.drifting ? clamp(yawRate * 0.085, -0.12, 0.12) : 0;
    this.driftVis = damp(this.driftVis, driftVisTarget, this.drifting ? 10 : 2.6, dt);
    const bodyGroup = this.model.userData && this.model.userData.body;
    if (bodyGroup) bodyGroup.rotation.y = this.driftVis;
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
