// HUD — 랩·순위·기록·속도계·드리프트/니트로 게이지·코스 미니맵
import { clamp, formatTime } from './util.js?v=20261115d';

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
      gear: document.getElementById('gear-badge'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this.gearOn = null;
    this.buildMiniBase();
    this.toastTimer = 0;
    this.lastSpeed = -1;
  }

  /* ── 코스 미니맵 ─────────────────────────────────────── */
  buildMiniBase() {
    const pts = this.track.pts;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const size = this.el.minimap.width;
    const pad = 28;
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
    g.lineJoin = 'round';
    g.lineCap = 'round';

    const path = () => {
      g.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const q = this.toMap(p.x, p.z);
        if (i === 0) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
      }
      g.closePath();
    };

    // 바탕 그늘 (트랙 안쪽을 살짝 채워 코스 형태를 또렷하게)
    path();
    g.fillStyle = 'rgba(10, 17, 28, 0.55)';
    g.fill();

    // 코스 외곽 → 노면
    path();
    g.strokeStyle = 'rgba(16, 28, 44, 0.95)';
    g.lineWidth = 17;
    g.stroke();
    path();
    g.strokeStyle = 'rgba(86, 150, 205, 0.55)';
    g.lineWidth = 11;
    g.stroke();
    path();
    g.strokeStyle = '#dcecff';
    g.lineWidth = 4.2;
    g.shadowColor = 'rgba(120, 210, 255, 0.85)';
    g.shadowBlur = 7;
    g.stroke();
    g.shadowBlur = 0;

    // 결승선 (체커)
    const p0 = this.track.placeAt(6);
    const st = this.toMap(p0.x, p0.z);
    g.save();
    g.translate(st.x, st.y);
    g.rotate(Math.atan2(p0.p.tz, p0.p.tx));
    const cw = 4.6;
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 4; k++) {
        g.fillStyle = (i + k) % 2 ? '#0a0f18' : '#ffffff';
        g.fillRect(-cw + i * cw, -9.2 + k * cw, cw, cw);
      }
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.lineWidth = 1.2;
    g.strokeRect(-cw, -9.2, cw * 2, cw * 4);
    g.restore();

    this.miniBase = c;
  }

  show(v) {
    this.el.root.classList.toggle('hidden', !v);
    this.el.root.setAttribute('aria-hidden', v ? 'false' : 'true');
    // iOS Safari 는 메모리 압박·백그라운드 복귀 시 캔버스 내용을 잃을 수 있다 →
    // 레이스에 들어갈 때마다 코스 지도를 다시 그려 둔다
    if (v) {
      this.buildMiniBase();
      this.el.minimap.getContext('2d').drawImage(this.miniBase, 0, 0);
    }
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

  // 후진 기어 표시
  setGear(reversing) {
    const el = this.el.gear;
    if (!el) return;
    if (this.gearOn === !!reversing) return;
    this.gearOn = !!reversing;
    el.classList.toggle('on', !!reversing);
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

    // AI 라이벌 — 차량 색 점
    for (let i = 0; i < cars.length; i++) {
      if (i === playerIdx) continue;
      const car = cars[i];
      const q = this.toMap(car.pos.x, car.pos.z);
      const col = (car.spec && car.spec.ui) || '#ffffff';
      g.beginPath();
      g.arc(q.x, q.y, 5.4, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(6, 10, 18, 0.9)';
      g.stroke();
    }

    // 내 차량 — 방향 화살표
    const me = cars[playerIdx];
    if (me) {
      const q = this.toMap(me.pos.x, me.pos.z);
      g.save();
      g.translate(q.x, q.y);
      // 맵 좌표(x→x, z→y)에서 진행 방향 = atan2(cos yaw, sin yaw) → 화살표 회전
      g.rotate(Math.PI - me.yaw);
      // 바깥 후광
      g.beginPath();
      g.arc(0, 0, 11, 0, Math.PI * 2);
      g.fillStyle = 'rgba(182, 255, 69, 0.18)';
      g.fill();
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(7.4, 8.4);
      g.lineTo(0, 4.4);
      g.lineTo(-7.4, 8.4);
      g.closePath();
      g.fillStyle = '#b6ff45';
      g.shadowColor = '#b6ff45';
      g.shadowBlur = 10;
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(8, 14, 22, 0.95)';
      g.stroke();
      g.restore();
    }
  }
}
