// 절차적 애니메이션 — 대기/걷기/질주(갈롭)/점프/공격/스킬 자세를 블렌딩한다.
import { clamp, lerp, damp, smoothstep, TAU } from './util.js?v=20261115b';

const ZERO = {
  bodyY: 0, pitch: 0, roll: 0, twist: 0, breath: 0, stretch: 0,
  neck: 0, headPitch: 0, headYaw: 0, jaw: 0,
  lf: 0, lfk: 0, lfa: 0, rf: 0, rfk: 0, rfa: 0,
  lb: 0, lbk: 0, lba: 0, rb: 0, rbk: 0, rba: 0,
  tailX: 0, tailY: 0, lunge: 0, tongue: 0, sway: 0, coil: 0, ear: 0,
};

// fl, fr, bl, br 위상
const GAIT = {
  trot: [0, Math.PI, Math.PI, 0],
  gallop: [0, 0.55, Math.PI + 0.12, Math.PI + 0.52],
};

export class Animator {
  constructor(rig, cfg) {
    this.rig = rig;
    this.cfg = cfg || {};
    this.serpent = !!(this.cfg.anim && this.cfg.anim.serpent);
    this.t = Math.random() * 20;
    this.phase = 0;
    this.cur = { ...ZERO };
    this.action = null;
    this.actionT = 0;
    this.blink = 2 + Math.random() * 3;
    this.lookTimer = 1 + Math.random() * 2;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.earTwitch = 0;
    this.tongueTimer = 1 + Math.random() * 2;
    this.tongueFlick = 0;
    this.stunned = 0;

    this.bodyBaseY = rig.body.position.y;
    this.neckBase = rig.neck ? rig.neck.rotation.x : 0;
    this.jawBase = rig.jaw ? rig.jaw.rotation.x : 0;
    this.headBase = rig.head ? rig.head.position.clone() : null;
    this.earBase = (rig.ears || []).map((e) => ({ z: e.rotation.z, x: e.rotation.x }));
    this.chestBaseScale = rig.chest ? rig.chest.scale.clone() : null;
    this.trunkBase = (rig.trunk || []).map((g) => ({ x: g.rotation.x, y: g.rotation.y }));
    this.tentacleBase = (rig.tentacles || []).map((chain) => chain.map((g) => ({ x: g.rotation.x, y: g.rotation.y, z: g.rotation.z })));
  }

  play(action) {
    this.action = action;
    this.actionT = 0;
  }

  stopAction() {
    this.action = null;
  }

  get actionProgress() {
    if (!this.action) return 0;
    return clamp(this.actionT / this.action.duration, 0, 1);
  }

  update(dt, s) {
    const cfg = this.cfg;
    const anim = cfg.anim || {};
    const speed = Math.max(0, s.speed || 0);
    const maxSpeed = cfg.run || 9;
    const ratio = clamp(speed / maxSpeed, 0, 1.3);
    const moving = speed > 0.25;
    const sprintT = clamp((speed - (cfg.walk || 4)) / Math.max(0.001, (cfg.run || 9) - (cfg.walk || 4)), 0, 1);

    this.t += dt;
    this.stunned = Math.max(0, this.stunned - dt);

    // 보행 위상 — 이동 속도에 비례
    this.phase += dt * (anim.gaitRate || 1.5) * 3.0 * clamp(speed / 1.2, 0, 2.4);
    this.phase %= TAU * 1000;

    const d = { ...ZERO };
    const idle = 1 - clamp(speed / 2.0, 0, 1);

    if (this.serpent) this.poseSerpent(dt, s, d, { speed, ratio, moving, idle, sprintT });
    else this.poseQuadruped(dt, s, d, { speed, ratio, moving, idle, sprintT });

    // 행동(action) 오버레이
    if (this.action) {
      this.actionT += dt;
      const p = clamp(this.actionT / this.action.duration, 0, 1);
      if (this.action.onPose) this.action.onPose(p, d, s);
      if (this.actionT >= this.action.duration) this.action = null;
    }

    // 스턴: 몸을 낮게 떨며 움찔
    if (this.stunned > 0) {
      d.bodyY -= 0.06;
      d.pitch += 0.05;
      d.headPitch += 0.12;
      d.roll += Math.sin(this.t * 30) * 0.03;
    }

    // 감쇠 후 적용
    const c = this.cur;
    const k = this.action ? 15 : 8;
    for (const key in d) {
      const fast = key === 'jaw' || key === 'lunge' || key === 'tongue';
      c[key] = damp(c[key], d[key], fast ? 22 : k, dt);
    }

    this.apply(c);
  }

  poseQuadruped(dt, s, d, m) {
    const anim = this.cfg.anim || {};
    const amp = (anim.gaitAmp || 0.6) * clamp(m.speed / (this.cfg.walk || 4), 0, 1.5);
    const gallop = smoothstep(0.15, 0.85, m.ratio);
    const offs = GAIT.trot.map((o, i) => lerp(o, GAIT.gallop[i], gallop));
    const legs = this.rig.legs;
    if (!legs) return;

    const breath = Math.sin(this.t * 1.7) * 0.5 + 0.5;
    // 갈롭은 한 번의 큰 도약, 트롯은 두 번의 작은 상하 운동
    const bounce = Math.sin(this.phase * (1 + gallop)) ;
    d.bodyY = (anim.bob || 0.04) * amp * bounce * (1 - gallop * 0.3) + breath * 0.006 * m.idle;
    d.breath = breath;
    d.stretch = gallop * 0.04;

    // 앞으로 기울기 + 척추 굴곡
    const spineFlex = Math.sin(this.phase * (1 + gallop)) * 0.06 * gallop;
    d.pitch = 0.02 + m.sprintT * 0.17 + spineFlex + bounce * 0.012 * amp;
    d.roll = Math.sin(this.phase) * (anim.sway || 0.05) * m.ratio;

    // 다리 — 엉덩이 + 무릎 + 발목
    const swing = (off, sign, front) => {
      const hip = Math.sin(this.phase + off) * amp * (front ? 1 : 0.94);
      const lift = Math.max(0, Math.sin(this.phase + off + 0.85));
      const knee = sign * lift * amp * 1.5;
      const ankle = -knee * 0.7 + Math.sin(this.phase + off) * 0.1 * amp;
      return [hip, knee, ankle];
    };
    const [flh, flk, fla] = swing(offs[0], 1, true);
    const [frh, frk, fra] = swing(offs[1], 1, true);
    const [blh, blk, bla] = swing(offs[2], -1, false);
    const [brh, brk, bra] = swing(offs[3], -1, false);

    const rest = m.idle * 0.03;
    d.lf = flh; d.lfk = flk; d.lfa = fla;
    d.rf = frh + rest; d.rfk = frk; d.rfa = fra;
    d.lb = blh; d.lbk = blk; d.lba = bla;
    d.rb = brh - rest; d.rbk = brk; d.rba = bra;

    // 점프 중 자세
    if (!s.grounded) {
      const up = clamp(s.vy / 8, -1, 1);
      const tuck = 1 - clamp(Math.abs(s.vy) / 8, 0, 1) * 0.4;
      d.lf = d.rf = -0.8 * tuck;
      d.lfk = d.rfk = 1.05 * tuck;
      d.lfa = d.rfa = 0.5 * tuck;
      d.lb = d.rb = 0.66 * tuck;
      d.lbk = d.rbk = -0.95 * tuck;
      d.lba = d.rba = -0.3 * tuck;
      d.pitch = clamp(-up * 0.3, -0.34, 0.36);
      d.bodyY += 0.04;
      d.tailX = 0.35;
    }

    // 머리 — 시선은 수평 유지 + 두리번
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.6 + Math.random() * 3.4;
      this.lookYaw = (Math.random() - 0.5) * 0.5;
      this.lookPitch = (Math.random() - 0.5) * 0.2;
    }
    const runFocus = clamp(m.ratio * 1.4, 0, 1);
    d.headYaw = lerp(this.lookYaw * m.idle, 0, runFocus) + Math.sin(this.phase) * 0.04 * amp;
    d.headPitch =
      -d.pitch * 0.62 + lerp(this.lookPitch * m.idle, 0, runFocus) + Math.sin(this.phase + 0.6) * (anim.headBob || 0.04) * amp;
    d.neck = -d.pitch * 0.32 + Math.sin(this.phase * 0.5) * 0.02 * amp;

    // 꼬리 — 균형추
    const tailAmp = anim.tailAmp || 0.3;
    d.tailY = Math.sin(this.t * 2.4) * tailAmp * (0.35 + 0.65 * m.idle) + Math.sin(this.phase) * 0.12 * m.ratio;
    d.tailX = 0.1 + m.sprintT * 0.55 + Math.sin(this.t * 3.1) * 0.06 - d.pitch * 0.35;

    // 귀 / 입
    this.earTwitch = Math.max(0, this.earTwitch - dt);
    if (Math.random() < dt * 0.35) this.earTwitch = 0.18;
    d.jaw = 0;
    if (m.sprintT > 0.55) d.jaw = 0.1 * (Math.sin(this.t * 6) * 0.5 + 0.5);
  }

  poseSerpent(dt, s, d, m) {
    const anim = this.cfg.anim || {};
    const amp = 0.34 * clamp(m.speed / 2.2, 0.22, 2.0);
    d.sway = amp;

    d.bodyY = Math.sin(this.phase * 2) * 0.012 * m.ratio * 4;
    d.pitch = -0.02 * m.ratio;
    d.roll = Math.sin(this.phase) * 0.05 * m.ratio;

    d.headYaw = Math.sin(this.t * 0.7) * 0.12 * m.idle + Math.sin(this.phase * 0.6) * 0.05;
    d.headPitch = Math.sin(this.t * 1.1) * 0.05 * m.idle;
    d.neck = -0.03 + Math.sin(this.phase * 0.5) * 0.03 * m.ratio;

    // 혀 날름
    this.tongueTimer -= dt;
    if (this.tongueTimer <= 0) {
      this.tongueTimer = 1.2 + Math.random() * 2.4;
      this.tongueFlick = 0.3;
    }
    this.tongueFlick = Math.max(0, this.tongueFlick - dt);
    d.tongue = this.tongueFlick > 0 ? Math.sin((1 - this.tongueFlick / 0.3) * Math.PI) : 0;

    if (!s.grounded) {
      d.bodyY += 0.14;
      d.neck = -0.18;
      d.pitch = clamp(-s.vy * 0.02, -0.2, 0.2);
    }
  }

  apply(c) {
    const rig = this.rig;

    rig.body.position.y = this.bodyBaseY + c.bodyY;
    rig.body.rotation.x = c.pitch;
    rig.body.rotation.z = c.roll;
    rig.body.rotation.y = c.twist;
    if (c.stretch) rig.body.scale.set(1 + c.stretch * 0.5, 1 - c.stretch, 1 + c.stretch * 1.4);

    if (rig.chest && this.chestBaseScale) {
      const b = 1 + c.breath * 0.012 * (1 - Math.min(1, c.stretch * 10));
      rig.chest.scale.set(this.chestBaseScale.x * b, this.chestBaseScale.y * b, this.chestBaseScale.z);
    }

    if (rig.neck) rig.neck.rotation.x = this.neckBase + c.neck;
    if (rig.head) {
      rig.head.rotation.x = c.headPitch;
      rig.head.rotation.y = c.headYaw;
      if (this.headBase) rig.head.position.z = this.headBase.z + c.lunge;
    }
    if (rig.jaw) rig.jaw.rotation.x = this.jawBase + c.jaw;

    if (rig.tongue) {
      rig.tongue.scale.z = 0.001 + c.tongue * 1.0;
      rig.tongue.rotation.x = -0.1 + c.tongue * 0.5;
    }

    if (rig.legs) {
      const set = (leg, hip, knee, ankle) => {
        if (!leg) return;
        leg.hip.rotation.x = leg.baseHip + hip;
        leg.knee.rotation.x = leg.baseKnee + knee;
        leg.ankle.rotation.x = leg.baseAnkle + ankle;
      };
      set(rig.legs.fl, c.lf, c.lfk, c.lfa);
      set(rig.legs.fr, c.rf, c.rfk, c.rfa);
      set(rig.legs.bl, c.lb, c.lbk, c.lba);
      set(rig.legs.br, c.rb, c.rbk, c.rba);
    }

    if (this.serpent && rig.spine) {
      const n = rig.spine.length;
      const coil = c.coil;
      for (let i = 0; i < n; i++) {
        const seg = rig.spine[i];
        const w = 0.35 + 0.9 * (i / n);
        const wave = Math.sin(this.phase - i * 0.62) * c.sway * w * 0.62;
        // 조이기: 마디마다 일정한 각도로 감아 올라가는 나선
        seg.rotation.y = (i === 0 ? 0 : wave) + c.twist * (i / n) + coil * 0.58;
        seg.rotation.x = Math.sin(this.phase * 0.5 - i * 0.75) * 0.03 * w + coil * 0.1 * Math.sin(i * 0.8);
        seg.rotation.z = coil * 0.05 * Math.cos(i * 0.5);
      }
    }

    if (rig.tail && rig.tail.length) {
      const n = rig.tail.length;
      for (let i = 0; i < n; i++) {
        const g = rig.tail[i];
        const base = i === 0 ? 1 : 0.75 - i * 0.06;
        g.rotation.y = c.tailY * base * Math.sin(this.t * 2.4 - i * 0.5) * 0.9;
        g.rotation.x = (c.tailX - 0.3) * base + Math.sin(this.t * 3.1 - i * 0.5) * 0.03;
      }
    }

    // 코끼리 코 — 좌우로 흔들리며 말린다
    if (rig.trunk) {
      const n = rig.trunk.length;
      for (let i = 0; i < n; i++) {
        const b = this.trunkBase[i];
        const w = i / Math.max(1, n - 1);
        rig.trunk[i].rotation.x = b.x + Math.sin(this.t * 1.3 - i * 0.55) * 0.07 * (0.4 + w) - 0.03 * w;
        rig.trunk[i].rotation.y = b.y + Math.sin(this.t * 0.8 - i * 0.7) * 0.12 * (0.3 + w);
      }
    }

    // 문어 다리 — 파도처럼 일렁인다
    if (rig.tentacles) {
      for (let t = 0; t < rig.tentacles.length; t++) {
        const chain = rig.tentacles[t];
        for (let i = 0; i < chain.length; i++) {
          const b = this.tentacleBase[t] && this.tentacleBase[t][i];
          if (!b) continue;
          const ph = this.t * 1.5 + t * 0.8 + i * 0.55;
          chain[i].rotation.x = b.x + Math.sin(ph) * 0.16;
          chain[i].rotation.z = b.z + Math.cos(ph * 0.8) * 0.12;
        }
      }
    }

    if (rig.ears) {
      rig.ears.forEach((ear, i) => {
        const b = this.earBase[i];
        if (!b) return;
        const tw = this.earTwitch > 0 ? Math.sin(this.earTwitch * 60) * 0.1 : 0;
        ear.rotation.z = b.z + tw * (i === 0 ? 1 : -1) + c.ear * (i === 0 ? 0.2 : -0.2);
        ear.rotation.x = b.x + Math.abs(tw) * 0.5;
      });
    }
  }
}
