// 절차적 애니메이션 — 대기/걷기/질주/점프/공격/스킬 자세를 블렌딩한다.
import { clamp, lerp, damp, smoothstep, TAU } from './util.js';

const ZERO = {
  bodyY: 0, pitch: 0, roll: 0, twist: 0, breath: 0,
  neck: 0, headPitch: 0, headYaw: 0, jaw: 0,
  lf: 0, lfk: 0, rf: 0, rfk: 0, lb: 0, lbk: 0, rb: 0, rbk: 0,
  tailX: 0, tailY: 0, lunge: 0, tongue: 0, sway: 0, scale: 0,
};

const GAIT = {
  trot: [0, Math.PI, Math.PI, 0], // fl, fr, bl, br
  gallop: [0, 0.5, Math.PI + 0.15, Math.PI + 0.55],
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
    this.stunned = 0;

    this.bodyBaseY = rig.body.position.y;
    this.neckBase = rig.neck ? rig.neck.rotation.x : 0;
    this.jawBase = rig.jaw ? rig.jaw.rotation.x : 0;
    this.headBase = rig.head ? rig.head.position.clone() : null;
    this.earBase = (rig.ears || []).map((e) => ({ z: e.rotation.z, x: e.rotation.x }));
  }

  play(action) {
    this.action = action;
    this.actionT = 0;
  }

  get actionProgress() {
    if (!this.action) return 0;
    return clamp(this.actionT / this.action.duration, 0, 1);
  }

  stopAction() {
    this.action = null;
  }

  update(dt, s) {
    const cfg = this.cfg;
    const anim = cfg.anim || {};
    const speed = Math.max(0, s.speed || 0);
    const maxSpeed = cfg.run || 9;
    const ratio = clamp(speed / maxSpeed, 0, 1.3);
    const moving = speed > 0.25;
    const gaitT = clamp(speed / 2.4, 0, 1);
    const sprintT = clamp((speed - (cfg.walk || 4)) / Math.max(0.001, (cfg.run || 9) - (cfg.walk || 4)), 0, 1);

    this.t += dt;
    this.stunned = Math.max(0, this.stunned - dt);

    // 보행 위상 — 이동 속도에 비례
    this.phase += dt * (anim.gaitRate || 1.5) * 3.0 * clamp(speed / 1.2, 0, 2.4);
    this.phase %= TAU * 1000;

    const d = { ...ZERO };
    const idle = 1 - clamp(speed / 2.0, 0, 1);

    if (this.serpent) this.poseSerpent(dt, s, d, { speed, ratio, moving, idle, sprintT });
    else this.poseQuadruped(dt, s, d, { speed, ratio, moving, idle, sprintT, gaitT });

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
    const k = this.action ? 16 : 9;
    for (const key in d) {
      c[key] = damp(c[key], d[key], key === 'jaw' || key === 'lunge' ? 22 : k, dt);
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
    d.bodyY = (anim.bob || 0.04) * amp * Math.sin(this.phase * 2) + breath * 0.008 * m.idle;
    d.breath = breath;

    // 앞으로 기울기 (질주할수록)
    d.pitch = 0.02 + m.sprintT * 0.16 + Math.sin(this.phase * 2) * 0.018 * amp;
    d.roll = Math.sin(this.phase) * (anim.sway || 0.05) * m.ratio;

    // 다리
    const swing = (off, sign, front) => {
      const hip = Math.sin(this.phase + off) * amp * (front ? 1 : 0.92);
      const lift = Math.max(0, Math.sin(this.phase + off + 0.9));
      const knee = sign * lift * amp * 1.45;
      return [hip, knee];
    };
    const [flh, flk] = swing(offs[0], 1, true);
    const [frh, frk] = swing(offs[1], 1, true);
    const [blh, blk] = swing(offs[2], -1, false);
    const [brh, brk] = swing(offs[3], -1, false);

    // 오른쪽 다리는 위상만 다르고, 정지 시 살짝 벌려 균형
    const restSpread = m.idle * 0.04;
    d.lf = flh; d.lfk = flk;
    d.rf = frh + restSpread; d.rfk = frk;
    d.lb = blh; d.lbk = blk;
    d.rb = brh - restSpread; d.rbk = brk;

    // 점프 중 자세
    if (!s.grounded) {
      const up = clamp(s.vy / 8, -1, 1);
      const tuck = 1 - clamp(Math.abs(s.vy) / 8, 0, 1) * 0.4;
      d.lf = d.rf = -0.75 * tuck;
      d.lfk = d.rfk = 1.0 * tuck;
      d.lb = d.rb = 0.62 * tuck;
      d.lbk = d.rbk = -0.9 * tuck;
      d.pitch = clamp(-up * 0.28, -0.32, 0.34);
      d.bodyY += 0.04;
      d.tailX = 0.35;
    }

    // 머리 — 시선은 수평 유지 + 두리번
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.6 + Math.random() * 3.4;
      this.lookYaw = (Math.random() - 0.5) * 0.55;
      this.lookPitch = (Math.random() - 0.5) * 0.22;
    }
    const runFocus = clamp(m.ratio * 1.4, 0, 1);
    d.headYaw = lerp(this.lookYaw * m.idle, 0, runFocus) + Math.sin(this.phase) * 0.03 * amp;
    d.headPitch = -d.pitch * 0.7 + lerp(this.lookPitch * m.idle, 0, runFocus) + Math.sin(this.phase + 0.6) * (anim.headBob || 0.04) * amp;
    d.neck = -d.pitch * 0.35;

    // 꼬리
    const tailAmp = anim.tailAmp || 0.3;
    d.tailY = Math.sin(this.t * 2.4) * tailAmp * (0.35 + 0.65 * m.idle);
    d.tailX = 0.12 + m.sprintT * 0.5 + Math.sin(this.t * 3.1) * 0.06;

    // 귀/눈 깜빡임
    this.earTwitch = Math.max(0, this.earTwitch - dt);
    if (Math.random() < dt * 0.35) this.earTwitch = 0.18;
    d.jaw = 0;
    if (m.sprintT > 0.6) d.jaw = 0.12 * (Math.sin(this.t * 6) * 0.5 + 0.5);
  }

  poseSerpent(dt, s, d, m) {
    const anim = this.cfg.anim || {};
    const amp = 0.34 * clamp(m.speed / 2.2, 0.25, 1.9);
    d.sway = amp;

    // 몸통이 살짝 들썩이며 기어간다
    d.bodyY = Math.sin(this.phase * 2) * 0.02 * (anim.bob ? anim.bob * 10 : 1) * m.ratio * 3;
    d.pitch = -0.02 * m.ratio;
    d.roll = Math.sin(this.phase) * 0.05 * m.ratio;

    // 머리는 앞을 응시, 이동 시 살짝 흔들림
    d.headYaw = Math.sin(this.t * 0.7) * 0.14 * m.idle + Math.sin(this.phase * 0.6) * 0.05;
    d.headPitch = Math.sin(this.t * 1.1) * 0.05 * m.idle;
    d.neck = -0.03 + Math.sin(this.phase * 0.5) * 0.03 * m.ratio;

    // 혀 날름
    this.tongueTimer -= dt;
    if (this.tongueTimer <= 0) {
      this.tongueTimer = 1.4 + Math.random() * 2.6;
      this.tongueFlick = 0.28;
    }
    this.tongueFlick = Math.max(0, (this.tongueFlick || 0) - dt);
    d.tongue = this.tongueFlick > 0 ? Math.sin((1 - this.tongueFlick / 0.28) * Math.PI) : 0;

    if (!s.grounded) {
      d.bodyY += 0.12;
      d.neck = -0.16;
      d.pitch = clamp(-s.vy * 0.02, -0.2, 0.2);
    }
  }

  apply(c) {
    const rig = this.rig;

    rig.body.position.y = this.bodyBaseY + c.bodyY;
    rig.body.rotation.x = c.pitch;
    rig.body.rotation.z = c.roll;
    rig.body.rotation.y = c.twist;

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
      const set = (leg, hip, knee) => {
        if (!leg) return;
        leg.hip.rotation.x = leg.baseHip + hip;
        leg.knee.rotation.x = leg.baseKnee + knee;
      };
      set(rig.legs.fl, c.lf, c.lfk);
      set(rig.legs.fr, c.rf, c.rfk);
      set(rig.legs.bl, c.lb, c.lbk);
      set(rig.legs.br, c.rb, c.rbk);
    }

    if (this.serpent && rig.spine) {
      const n = rig.spine.length;
      for (let i = 0; i < n; i++) {
        const seg = rig.spine[i];
        const w = 0.35 + 0.9 * (i / n);
        seg.rotation.y = Math.sin(this.phase - i * 0.62) * c.sway * w * 0.62 + c.twist * (i / n);
        // 지면을 따라 미세하게 오르내리는 물결
        seg.rotation.x = Math.sin(this.phase * 0.5 - i * 0.75) * 0.03 * w;
      }
    }

    if (rig.tail && rig.tail.length) {
      const n = rig.tail.length;
      for (let i = 0; i < n; i++) {
        const g = rig.tail[i];
        const base = i === 0 ? 1 : 0.75;
        g.rotation.y = c.tailY * base * Math.sin(this.t * 2.4 - i * 0.5) * 0.9;
        g.rotation.x = c.tailX * base + Math.sin(this.t * 3.1 - i * 0.5) * 0.03;
      }
    }

    if (rig.ears) {
      rig.ears.forEach((ear, i) => {
        const b = this.earBase[i];
        if (!b) return;
        const tw = this.earTwitch > 0 ? Math.sin(this.earTwitch * 60) * 0.12 : 0;
        ear.rotation.z = b.z + tw * (i === 0 ? 1 : -1);
        ear.rotation.x = b.x + Math.abs(tw) * 0.5;
      });
    }
  }
}
