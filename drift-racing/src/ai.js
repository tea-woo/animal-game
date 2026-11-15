// AI 라이벌 — 레이싱 라인 추종, 코너 속도 계산, 차선 회피·추월
import THREE from './three.js?v=20261115a';
import { buildCar, updateCarVisual } from './carModel.js?v=20261115a';
import { clamp, damp, rand } from './util.js?v=20261115a';

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
    this.jitter = rand(0, 100);
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
    this.model.position.copy(this.pos);
    this.model.rotation.set(0, this.yaw, 0);
  }

  reset(startS, lane, lapIndex = 0) {
    this.s = startS;
    this.lane = this.baseLane = lane;
    this.targetLane = lane;
    this.lapIndex = lapIndex;
    this.speed = 0;
    this.finished = false;
    this.placeOnTrack();
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

    const p = this.track.placeAt(this.s, this.lane);
    this.pos.set(p.x, 0, p.z);
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

    this.model.position.set(p.x, 0, p.z);
    this.model.rotation.y = this.yaw;
    this.roll = damp(this.roll, clamp(-this.track.curvatureAt(this.s) * this.speed * 0.03, -0.13, 0.13), 5, dt);
    this.model.rotation.z = this.roll;

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
