// 절차적 캔버스 텍스처 — 외부 이미지 없이 모든 재질을 만든다.
import THREE from './three.js?v=20261115d';
import { rand } from './util.js?v=20261115d';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function toTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}

/* ── 아스팔트 ───────────────────────────────────────────── */
export function asphaltTexture() {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#2c3038';
  g.fillRect(0, 0, 512, 512);

  // 큰 얼룩(패치·기름 자국)
  for (let i = 0; i < 70; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = rand(18, 90);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() < 0.5 ? 0 : 255;
    grd.addColorStop(0, `rgba(${v},${v},${v},${rand(0.015, 0.06)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // 자갈 입자
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 34;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 1.05;
  }
  g.putImageData(img, 0, 0);
  // 타이어 고무 흔적
  g.globalAlpha = 0.1;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = Math.random() < 0.7 ? '#0e1014' : '#4a4f59';
    g.lineWidth = rand(2, 8);
    g.beginPath();
    let x = rand(0, 512), y = rand(0, 512);
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += rand(-60, 60);
      y += rand(-60, 60);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 연석(빨강·흰색) ──────────────────────────────────── */
export function curbTexture() {
  const { c, g } = makeCanvas(64, 256);
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 === 0 ? '#e63c3c' : '#f4f4f4';
    g.fillRect(0, (256 / bands) * i, 64, 256 / bands);
  }
  // 마모
  g.globalAlpha = 0.16;
  for (let i = 0; i < 240; i++) {
    g.fillStyle = '#2a2a2a';
    g.fillRect(rand(0, 64), rand(0, 256), rand(1, 5), rand(1, 4));
  }
  g.globalAlpha = 1;
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 잔디 ──────────────────────────────────────────────── */
export function grassTexture() {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#25401f';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rand(0, 512), y = rand(0, 512);
    const hue = rand(80, 125);
    g.fillStyle = `hsla(${hue}, ${rand(24, 46)}%, ${rand(12, 30)}%, ${rand(0.3, 0.85)})`;
    g.fillRect(x, y, rand(1, 3), rand(2, 6));
  }
  for (let i = 0; i < 40; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = rand(20, 70);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(90,120,60,${rand(0.05, 0.16)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 빌딩 창문 ─────────────────────────────────────────── */
export function buildingTexture(litChance = 0.5, tint = '#1a2230') {
  const { c, g } = makeCanvas(256, 512);
  g.fillStyle = tint;
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = 'rgba(255,255,255,0.045)';
  for (let y = 0; y < 512; y += 16) g.fillRect(0, y, 256, 1);
  const cols = 8, rows = 26;
  const cw = 256 / cols, ch = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = Math.random() < litChance;
      if (on) {
        const warm = Math.random() < 0.7;
        g.fillStyle = warm
          ? `rgba(255, ${Math.floor(rand(190, 225))}, ${Math.floor(rand(130, 175))}, ${rand(0.5, 1)})`
          : `rgba(${Math.floor(rand(150, 190))}, 235, 255, ${rand(0.4, 0.9)})`;
      } else {
        g.fillStyle = `rgba(20, 28, 40, ${rand(0.6, 0.95)})`;
      }
      g.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.2, cw * 0.64, ch * 0.52);
    }
  }
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 연기 스프라이트 ───────────────────────────────────── */
export function smokeTexture() {
  const { c, g } = makeCanvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  // 살짝 구름 결
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(0,0,0,${rand(0.05, 0.16)})`;
    g.beginPath();
    g.arc(rand(20, 108), rand(20, 108), rand(4, 18), 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return toTexture(c, { srgb: true, aniso: 1 });
}

/* ── 스타트 아치 배너 ──────────────────────────────────── */
export function bannerTexture() {
  const { c, g } = makeCanvas(1024, 256);
  g.fillStyle = '#0a0f18';
  g.fillRect(0, 0, 1024, 256);
  // 체커
  for (let x = 0; x < 1024; x += 32) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = ((x / 32) + y) % 2 === 0 ? '#f2f6ff' : '#111722';
      g.fillRect(x, y * 32 + 8, 32, 32);
      g.fillRect(x, 256 - 40 - y * 32, 32, 32);
    }
  }
  g.fillStyle = '#43e6ff';
  g.font = 'italic 900 92px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#43e6ff';
  g.shadowBlur = 26;
  g.fillText('DRIFT LEGEND', 512, 132);
  g.shadowBlur = 0;
  g.fillStyle = '#ff8b3d';
  g.font = '700 30px system-ui, -apple-system, sans-serif';
  g.fillText('C I R C U I T   ·   G P', 512, 200);
  return toTexture(c, { srgb: true });
}

/* ── 관중석 ────────────────────────────────────────────── */
export function crowdTexture() {
  const { c, g } = makeCanvas(512, 256);
  g.fillStyle = '#131a26';
  g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 26) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, y, 512, 3);
  }
  const colors = ['#e8eaf2', '#43e6ff', '#ff8b3d', '#ff3d81', '#b6ff45', '#5b6b86', '#f5c542'];
  for (let i = 0; i < 900; i++) {
    g.fillStyle = colors[Math.floor(rand(0, colors.length))];
    g.globalAlpha = rand(0.25, 0.9);
    g.beginPath();
    g.arc(rand(0, 512), rand(0, 256), rand(2.2, 4.6), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 안내 표지판 ───────────────────────────────────────── */
export function signTexture(text, color = '#43e6ff') {
  const { c, g } = makeCanvas(512, 256);
  g.fillStyle = '#0b1018';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(14, 14, 484, 228);
  g.fillStyle = color;
  g.font = 'italic 900 96px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillText(text, 256, 132, 440);
  return toTexture(c, { srgb: true });
}

/* ── 숫자(코너 마커) ──────────────────────────────────── */
export function numberTexture(num) {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#0b0f16';
  g.font = 'italic 900 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 66, 70);
  return toTexture(c, { srgb: true });
}
