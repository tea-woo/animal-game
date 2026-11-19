// AI 라이벌 — 레이싱 라인 추종, 코너 속도 계산, 차선 회피·추월
import THREE from './three.js?v=20261119a';
import { buildCar, updateCarVisual, applyBodyAttitude } from './carModel.js?v=20261119a';
import { clamp, damp, rand } from './util.js?v=20261119a';

export class AICar {
  constructor(spec, track, { skill = 1, startS = 0, lane = 0, lapIndex = 0 } = {}) {
    this.spec = spec;
    this.track = track;
    this.model = buildCar(spec);
    this.skill = skill;
    this.baseLane = lane;
    this.lane = lane;
    this.targetLane = lane;
    this.s = startS;
    this.lapIndex = lapIndex;
    this.speed = 0;
    this.maxSpeed = spec.maxSpeed * 0.80 * skill;
    this.latAccel = 18.0 * skill;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.drifting = false;
    this.vLat = 0;
    this.vel = { x: 0, z: 0 };
    this.brake = 0;
    this.roll = 0;
    this.laneTimer = rand(1, 4);
    this.finished = false;
    this.finishTime = 0;
    this.gridSlot = 0;
    this.jitter = rand(0, 100);
    // 충돌로 밀려난 위치 오프셋 (트랙 라인 기준, 서서히 복귀)
    this.off = { x: 0, z: 0 };
    this.offVel = { x: 0, z: 0 };
    this.bumpT = 0;
    this.placeOnTrack();
  }

  get raceDist() {
    return this.lapIndex * this.track.length + this.s;
  }

  placeOnTrack() {
    const p = this.track.placeAt(this.s, this.lane);
    this.pos.set(p.x, 0, p.z);
    const ahead = this.track.placeAt((this.s + 5) % this.track.length, this.lane);
    this.yaw = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    const h = this.track.heightAt(this.s, this.lane);
    this.model.position.set(this.pos.x, h, this.pos.z);
    this.model.rotation.set(0, this.yaw, 0);
    this.model.rotation.x = -Math.atan2(
      this.track.heightAt(this.s + 1.35, this.lane) - h, 2.8
    );
    applyBodyAttitude(this.model, 0, 0);
  }

  reset(startS, lane, lapIndex = 0) {
    this.s = startS;
    this.lane = this.baseLane = lane;
    this.targetLane = lane;
    this.lapIndex = lapIndex;
    this.speed = 0;
    this.finished = false;
    this.finishTime = 0;
    this.off.x = this.off.z = 0;
    this.offVel.x = this.offVel.z = 0;
    this.bumpT = 0;
    this.placeOnTrack();
  }

  /** 다른 차량과 접촉 — 밀림 + 속도 손실 (넉백) */
  applyImpulse(vx, vz) {
    // 차체가 실제로 확 밀려나도록 오프셋 속도에 강하게 적재
    this.offVel.x += vx * 1.05;
    this.offVel.z += vz * 1.05;
    const j = Math.hypot(vx, vz);
    this.speed = Math.max(0, this.speed - j * 0.55);
    this.bumpT = Math.max(this.bumpT, 0.8);
  }

  /** 위치 보정(파고든 만큼 즉시 밀어내기) */
  shove(dx, dz) {
    this.off.x += dx;
    this.off.z += dz;
  }

  targetSpeedAt(sAhead) {
    const L = this.track.length;
    let limit = this.maxSpeed;
    for (let k = 0; k < 5; k++) {
      const s = (sAhead + k * 9) % L;
      const curv = Math.abs(this.track.curvatureAt(s)) + 0.0009;
      const v = Math.sqrt(this.latAccel / curv);
      if (k === 0) limit = Math.min(limit, v * 1.14);
      else limit = Math.min(limit, v);
    }
    return limit;
  }

  update(dt, others, raceStarted) {
    const L = this.track.length;
    const aheadS = (this.s + 16 + this.speed * 0.55) % L;
    const target = raceStarted ? this.targetSpeedAt(aheadS) : 0;

    // 앞차 회피
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = rand(2.5, 5.5);
      this.targetLane = this.baseLane + rand(-1.4, 1.4);
    }
    for (const o of others) {
      if (o === this) continue;
      let gap = o.s - this.s;
      if (gap < -L / 2) gap += L;
      if (gap > L / 2) gap -= L;
      if (gap > 2 && gap < 14 && Math.abs(o.lane - this.lane) < 3.2) {
        const side = o.lane > this.lane ? -1 : 1;
        this.targetLane = clamp(this.lane + side * 3.4, -this.track.halfWidth + 2.2, this.track.halfWidth - 2.2);
      }
    }
    this.targetLane = clamp(this.targetLane, -this.track.halfWidth + 2.4, this.track.halfWidth - 2.4);

    // 장애물(바위·통나무·상자) 회피 — 앞쪽 같은 라인에 있으면 빈 라인으로 비켜간다
    if (this.track.obstaclesNear && this.track.obstacles && this.track.obstacles.length && raceStarted) {
      const look = 20 + this.speed * 1.15;
      const near = this.track.obstaclesNear((this.s + look * 0.45) % L, this.lane,
        Math.round(look / 2 / Math.max(0.5, this.track.ds)) + 4);
      for (const o of near) {
        let gap = o.s - this.s;
        if (gap < -L / 2) gap += L;
        if (gap > L / 2) gap -= L;
        if (gap > 3 && gap < look && Math.abs(o.lat - this.lane) < 4.4) {
          const side = o.lat > 0 ? -1 : 1;
          this.targetLane = clamp(o.lat + side * 6.4,
            -this.track.halfWidth + 2.4, this.track.halfWidth - 2.4);
        }
      }
    }
    this.lane = damp(this.lane, this.targetLane, 1.6, dt);

    // 속도
    if (raceStarted) {
      const diff = target - this.speed;
      if (diff > 0) this.speed += Math.min(diff, 11 * dt * this.skill);
      else this.speed += Math.max(diff, -20 * dt);
      this.speed = clamp(this.speed, 0, this.maxSpeed * 1.02);
      this.brake = diff < -3 ? 1 : 0;
    } else {
      this.speed = 0;
      this.brake = 1;
    }

    this.s = this.s + this.speed * dt;
    if (this.s >= L) {
      this.s -= L;
      this.lapIndex += 1;
    }
    if (this.s < 0) this.s += L;

    // 진흙에서는 무겹게 붙는다
    if (this.track.mudAt && raceStarted && this.track.mudAt(this.s, this.lane)) {
      this.speed = Math.max(0, this.speed - 7 * dt);
    }

    // 충격 오프셋 감쇠 — 밀려나고 천천히 라인으로 복귀
    this.bumpT = Math.max(0, this.bumpT - dt);
    if (this.off.x || this.off.z || this.offVel.x || this.offVel.z) {
      this.off.x += this.offVel.x * dt;
      this.off.z += this.offVel.z * dt;
      const dv = Math.exp(-4.6 * dt);
      this.offVel.x *= dv;
      this.offVel.z *= dv;
      const back = Math.exp(-1.6 * dt);
      this.off.x *= back;
      this.off.z *= back;
      const m = Math.hypot(this.off.x, this.off.z);
      if (m > 4.6) { this.off.x *= 4.6 / m; this.off.z *= 4.6 / m; }
      if (m < 0.015 && Math.hypot(this.offVel.x, this.offVel.z) < 0.04) {
        this.off.x = 0; this.off.z = 0; this.offVel.x = 0; this.offVel.z = 0;
      }
    }

    const p = this.track.placeAt(this.s, this.lane);
    this.pos.set(p.x + this.off.x, 0, p.z + this.off.z);
    const ahead = this.track.placeAt((this.s + 6) % L, this.lane + (this.targetLane - this.lane) * 0.3);
    const yawTarget = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    this.yaw = damp(this.yaw, yawTarget, 10, dt);

    const curv = Math.abs(this.track.curvatureAt(this.s));
    const latAcc = curv * this.speed * this.speed;
    this.drifting = raceStarted && latAcc > 12 && this.speed > 14;
    this.vLat = this.drifting ? Math.sin(0.3) * this.speed * (latAcc > 20 ? 0.55 : 0.32) : 0;

    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    this.vel.x = fwd.x * this.speed;
    this.vel.z = fwd.z * this.speed;
    this.speed = Math.hypot(this.vel.x, this.vel.z) || this.speed;

    const surf = this.track.surfaceAt ? this.track.surfaceAt(this.s, this.lane) : this.track.heightAt(this.s, this.lane);
    this.model.position.set(this.pos.x, surf, this.pos.z);
    this.model.rotation.y = this.yaw;
    const gh = surf;
    this.model.rotation.x = damp(
      this.model.rotation.x,
      -Math.atan2((this.track.surfaceAt ? this.track.surfaceAt(this.s + 1.35, this.lane) : this.track.heightAt(this.s + 1.35, this.lane)) - gh, 2.8),
      7, dt
    );
    // 차체 롤도 주행 속도에 비례 — 저속 코너에서는 거의 수평, 고속 코너에서만 기운다
    const curvSigned = this.track.curvatureAt(this.s);
    const aiLatAcc = Math.abs(curvSigned) * this.speed * this.speed;
    const aiSpeedGate = clamp((this.speed / this.maxSpeed - 0.10) / 0.75, 0, 1);
    const aiRollTarget = -Math.sign(curvSigned)
      * clamp(aiLatAcc / 22, 0, 1) * aiSpeedGate * 0.16;
    this.roll = damp(this.roll, aiRollTarget, 6, dt);
    applyBodyAttitude(this.model, this.roll, 0);

    updateCarVisual(this, dt);
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
