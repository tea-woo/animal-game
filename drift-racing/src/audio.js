// 사운드 — WebAudio 엔진음·타이어 스키드·부스트 (사용자 제스처 후 시작)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);

      // 엔진: 톱니 2개 + 로우패스
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 900;
      this.engFilter.Q.value = 6;
      this.engGain.connect(this.engFilter);
      this.engFilter.connect(this.master);

      this.osc1 = ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.value = 60;
      this.osc2 = ctx.createOscillator();
      this.osc2.type = 'square';
      this.osc2.frequency.value = 90;
      const g2 = ctx.createGain();
      g2.gain.value = 0.35;
      this.osc1.connect(this.engGain);
      this.osc2.connect(g2);
      g2.connect(this.engGain);
      this.osc1.start();
      this.osc2.start();

      // 스키드 노이즈
      const len = ctx.sampleRate * 1.2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      this.noiseBuf = buf;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      this.skidFilter = ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.value = 2100;
      this.skidFilter.Q.value = 1.6;
      this.skidGain = ctx.createGain();
      this.skidGain.gain.value = 0;
      noise.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.master);
      noise.start();

      this.ready = true;
    } catch (e) {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  update({ speed = 0, maxSpeed = 55, throttle = 0, skid = 0, boost = 0, active = true }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const norm = Math.min(1.3, speed / maxSpeed);
    const freq = 48 + norm * 118 + boost * 34;
    this.osc1.frequency.setTargetAtTime(freq, t, 0.05);
    this.osc2.frequency.setTargetAtTime(freq * 1.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(420 + norm * 1700 + boost * 700, t, 0.08);
    const targetGain = active ? 0.05 + norm * 0.09 + boost * 0.02 : 0;
    this.engGain.gain.setTargetAtTime(targetGain, t, 0.08);
    this.skidGain.gain.setTargetAtTime(active ? Math.min(0.16, skid * 0.2 + boost * 0.02) : 0, t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1600 + skid * 1500, t, 0.1);
  }

  blip(freq = 660, dur = 0.08, type = 'square', vol = 0.12) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  miniTurbo(level = 1) {
    this.blip(520 + level * 160, 0.14, 'triangle', 0.14);
    if (this.ready) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.22);
      g.gain.setValueAtTime(0.09, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      o.connect(f);
      f.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(ctx.currentTime + 0.33);
    }
  }

  countdown(n) {
    this.blip(n > 0 ? 440 : 880, n > 0 ? 0.12 : 0.32, 'square', 0.14);
  }

  crash() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.26);
  }
}
