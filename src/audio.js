// WebAudio 합성 효과음 (외부 오디오 파일 없음)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);

    // 노이즈 버퍼 (1초)
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _tone(o = {}) {
    if (!this.ready || !this.enabled) return;
    const { type = 'sine', f1 = 220, f2 = 110, dur = 0.3, vol = 0.3, delay = 0, filter = null, detune = 0 } = o;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f1, t0);
    if (f2 !== f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.setValueAtTime(filter.f1 || 1200, t0);
      if (filter.f2) f.frequency.exponentialRampToValueAtTime(Math.max(60, filter.f2), t0 + dur);
      f.Q.value = filter.q || 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise(o = {}) {
    if (!this.ready || !this.enabled) return;
    const { dur = 0.25, vol = 0.3, delay = 0, type = 'bandpass', f1 = 1800, f2 = 600, q = 1.2 } = o;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f1, t0);
    if (f2 !== f1) f.frequency.exponentialRampToValueAtTime(Math.max(60, f2), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ── 효과음 ────────────────────────────────────────────────
  slash() {
    this._noise({ dur: 0.2, vol: 0.22, type: 'highpass', f1: 2600, f2: 700, q: 0.8 });
    this._tone({ type: 'triangle', f1: 640, f2: 220, dur: 0.16, vol: 0.08 });
  }

  bite() {
    this._noise({ dur: 0.12, vol: 0.26, type: 'bandpass', f1: 1400, f2: 300, q: 1.4 });
    this._tone({ type: 'square', f1: 180, f2: 70, dur: 0.12, vol: 0.14, filter: { type: 'lowpass', f1: 900, f2: 300 } });
  }

  hit(crit = false) {
    this._tone({ type: 'sine', f1: crit ? 220 : 170, f2: 60, dur: 0.16, vol: crit ? 0.4 : 0.28 });
    this._noise({ dur: 0.09, vol: 0.2, type: 'bandpass', f1: crit ? 2200 : 1200, f2: 400, q: 0.9 });
  }

  slam() {
    this._tone({ type: 'sine', f1: 110, f2: 38, dur: 0.42, vol: 0.42 });
    this._noise({ dur: 0.3, vol: 0.24, type: 'lowpass', f1: 900, f2: 120, q: 0.6 });
  }

  roar() {
    this._tone({ type: 'sawtooth', f1: 150, f2: 62, dur: 0.95, vol: 0.24, filter: { type: 'lowpass', f1: 900, f2: 260, q: 4 } });
    this._tone({ type: 'square', f1: 86, f2: 46, dur: 0.9, vol: 0.12, filter: { type: 'lowpass', f1: 500, f2: 180, q: 3 }, detune: 8 });
    this._noise({ dur: 0.9, vol: 0.14, type: 'bandpass', f1: 700, f2: 260, q: 0.8 });
    this._tone({ type: 'sine', f1: 60, f2: 34, dur: 1.1, vol: 0.22 });
  }

  stomp() {
    this._tone({ type: 'sine', f1: 90, f2: 30, dur: 0.7, vol: 0.5 });
    this._noise({ dur: 0.5, vol: 0.3, type: 'lowpass', f1: 700, f2: 90, q: 0.7 });
    this._noise({ dur: 0.25, vol: 0.16, type: 'bandpass', f1: 1800, f2: 500, q: 0.7 });
  }

  howl() {
    this._tone({ type: 'sine', f1: 320, f2: 660, dur: 0.5, vol: 0.18 });
    this._tone({ type: 'sine', f1: 660, f2: 520, dur: 0.85, vol: 0.16, delay: 0.45 });
    this._tone({ type: 'triangle', f1: 165, f2: 260, dur: 0.6, vol: 0.1, delay: 0.05 });
  }

  dash() {
    this._noise({ dur: 0.3, vol: 0.24, type: 'bandpass', f1: 600, f2: 3200, q: 1.5 });
    this._tone({ type: 'sawtooth', f1: 180, f2: 520, dur: 0.22, vol: 0.09, filter: { type: 'lowpass', f1: 1600 } });
  }

  jump() {
    this._tone({ type: 'sine', f1: 260, f2: 520, dur: 0.14, vol: 0.1 });
  }

  land() {
    this._noise({ dur: 0.12, vol: 0.16, type: 'lowpass', f1: 700, f2: 200 });
  }

  hurt() {
    this._tone({ type: 'sawtooth', f1: 240, f2: 90, dur: 0.22, vol: 0.2, filter: { type: 'lowpass', f1: 1200, f2: 400 } });
  }

  death() {
    this._tone({ type: 'sawtooth', f1: 190, f2: 40, dur: 0.85, vol: 0.22, filter: { type: 'lowpass', f1: 900, f2: 200 } });
    this._noise({ dur: 0.7, vol: 0.14, type: 'lowpass', f1: 800, f2: 120 });
  }

  spawn() {
    this._tone({ type: 'sine', f1: 180, f2: 420, dur: 0.45, vol: 0.16 });
    this._tone({ type: 'triangle', f1: 360, f2: 720, dur: 0.55, vol: 0.1, delay: 0.06 });
    this._noise({ dur: 0.5, vol: 0.12, type: 'bandpass', f1: 900, f2: 2400, q: 1.2 });
  }

  buff() {
    this._tone({ type: 'sine', f1: 520, f2: 780, dur: 0.3, vol: 0.14 });
    this._tone({ type: 'sine', f1: 780, f2: 1040, dur: 0.35, vol: 0.1, delay: 0.12 });
  }

  ui() {
    this._tone({ type: 'triangle', f1: 660, f2: 880, dur: 0.07, vol: 0.06 });
  }

  coil() {
    this._noise({ dur: 0.8, vol: 0.16, type: 'bandpass', f1: 300, f2: 900, q: 2.4 });
    this._tone({ type: 'sawtooth', f1: 70, f2: 120, dur: 0.9, vol: 0.1, filter: { type: 'lowpass', f1: 500 } });
  }
}
