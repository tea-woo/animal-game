// HUD — 랩·순위·기록·속도계·드리프트/니트로 게이지·미니맵
import { clamp, formatTime } from './util.js?v=20261115a';

export class Hud {
  constructor(track) {
    this.track = track;
    this.el = {
      root: document.getElementById('hud'),
      lap: document.getElementById('lap-text'),
      pos: document.getElementById('pos-text'),
      time: document.getElementById('time-text'),
      best: document.getElementById('best-text'),
      speed: document.getElementById('speed-text'),
      arc: document.getElementById('arc-fill'),
      driftFill: document.getElementById('drift-fill'),
      driftLevel: document.getElementById('drift-level'),
      nitro: document.getElementById('nitro-fill'),
      driftBtn: document.getElementById('btn-drift'),
      boostBtn: document.getElementById('btn-boost'),
      countdown: document.getElementById('countdown'),
      toast: document.getElementById('toast'),
      minimap: document.getElementById('minimap'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this.buildMiniBase();
    this.toastTimer = 0;
    this.lastSpeed = -1;
  }

  buildMiniBase() {
    const pts = this.track.pts;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const size = this.el.minimap.width;
    const pad = 20;
    const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxZ - minZ));
    const ox = (size - (maxX - minX) * scale) / 2;
    const oy = (size - (maxZ - minZ) * scale) / 2;
    this.map = { scale, ox, oy, minX, minZ, size };
    this.toMap = (x, z) => ({
      x: ox + (x - minX) * scale,
      y: oy + (z - minZ) * scale,
    });

    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    // 도로
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const q = this.toMap(p.x, p.z);
      if (i === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    }
    g.closePath();
    g.strokeStyle = 'rgba(140, 175, 215, 0.28)';
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = 'rgba(190, 220, 255, 0.55)';
    g.lineWidth = 3.2;
    g.stroke();

    // 시작선
    const st = this.toMap(this.track.startInfo.x, this.track.startInfo.z);
    g.save();
    g.translate(st.x, st.y);
    const p0 = pts[0];
    g.rotate(Math.atan2(p0.tz, p0.tx));
    g.fillStyle = '#f5f9ff';
    g.fillRect(-2.5, -7, 5, 14);
    g.restore();
    this.miniBase = c;
  }

  show(v) {
    this.el.root.classList.toggle('hidden', !v);
    this.el.root.setAttribute('aria-hidden', v ? 'false' : 'true');
  }

  setLap(lap, total = 3) {
    this.el.lap.textContent = `${clamp(lap, 1, total)}/${total}`;
  }

  setPos(p, total = 4) {
    this.el.pos.textContent = `${p}/${total}`;
  }

  setTime(t) {
    this.el.time.textContent = formatTime(t);
  }

  setBest(t) {
    this.el.best.textContent = t ? `BEST ${formatTime(t)}` : 'BEST --:--.--';
  }

  setSpeed(kmh) {
    const v = Math.round(kmh);
    if (v !== this.lastSpeed) {
      this.el.speed.textContent = String(v);
      this.lastSpeed = v;
    }
    const ratio = clamp(kmh / 240, 0, 1);
    this.el.arc.style.strokeDashoffset = String(157 - 157 * ratio);
    this.el.arc.style.stroke = ratio > 0.86 ? '#ff8b3d' : ratio > 0.6 ? '#b6ff45' : '#43e6ff';
  }

  setDrift(charge, level, drifting) {
    this.el.driftFill.style.width = `${Math.round(charge * 100)}%`;
    const colors = ['linear-gradient(90deg,#fff,#dfeaff)', 'linear-gradient(90deg,#fff,#43e6ff)', 'linear-gradient(90deg,#fff,#43e6ff)', 'linear-gradient(90deg,#fff,#ff8b3d)'];
    this.el.driftFill.style.background = colors[clamp(level, 0, 3)];
    const labels = ['READY', 'Lv.1', 'Lv.2', 'Lv.3 MINI TURBO'];
    this.el.driftLevel.textContent = drifting ? labels[clamp(level, 1, 3)] : labels[0];
    this.el.driftLevel.style.color = level >= 3 ? '#ff8b3d' : level === 2 ? '#43e6ff' : '#9aa4bd';
    this.el.driftBtn.classList.toggle('charged', charge > 0.72);
  }

  setNitro(n) {
    this.el.nitro.style.width = `${Math.round(clamp(n, 0, 1) * 100)}%`;
    this.el.boostBtn.style.opacity = n > 0.05 ? '1' : '0.55';
  }

  countdown(text, go = false) {
    const el = this.el.countdown;
    if (text == null) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.classList.remove('hidden');
    el.textContent = text;
    el.classList.toggle('go', go);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  toast(text, ms = 1100, color) {
    const el = this.el.toast;
    el.textContent = text;
    el.style.color = color || '#43e6ff';
    el.classList.remove('hidden');
    this.toastTimer = ms / 1000;
  }

  update(dt, cars, playerIdx) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    const g = this.ctx;
    const size = this.map.size;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.miniBase, 0, 0);

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const q = this.toMap(car.pos.x, car.pos.z);
      if (i === playerIdx) {
        g.save();
        g.translate(q.x, q.y);
        g.rotate(Math.atan2(Math.sin(car.yaw), Math.cos(car.yaw)) * -1 + Math.PI);
        g.fillStyle = '#b6ff45';
        g.shadowColor = '#b6ff45';
        g.shadowBlur = 8;
        g.beginPath();
        g.moveTo(0, -6.5);
        g.lineTo(4.4, 5);
        g.lineTo(0, 2.6);
        g.lineTo(-4.4, 5);
        g.closePath();
        g.fill();
        g.restore();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.62)';
        g.beginPath();
        g.arc(q.x, q.y, 3.1, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
