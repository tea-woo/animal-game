// 절차적 캔버스 텍스처 — 외부 이미지 없이 모든 재질을 만든다.
import THREE from './three.js?v=20261115f';
import { rand } from './util.js?v=20261115f';

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

/* ── 아스팔트 (아침 햇살 아래의 밝은 회색) ─────────────── */
export function asphaltTexture() {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#4c5158';
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
    const n = (Math.random() - 0.5) * 32;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 1.05;
  }
  g.putImageData(img, 0, 0);
  // 타이어 고무 흔적
  g.globalAlpha = 0.085;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = Math.random() < 0.7 ? '#0e1014' : '#6d727a';
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

/* ── 비포장 흙·자갈 노면 (타이어 자국 포함) ────────────── */
// u(가로 0~1) 가 코스 폭 방향이라 좌우 바퀴 자국을 u 위치에 그린다.
export function dirtRoadTexture() {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#a1754a';
  g.fillRect(0, 0, 512, 512);

  // 큰 흙 얼룩
  for (let i = 0; i < 120; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = rand(16, 110);
    const light = Math.random() < 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, light ? `rgba(214,186,144,${rand(0.05, 0.2)})` : `rgba(84,60,38,${rand(0.05, 0.2)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // 바퀴 자국 2쌍 (폭 방향 u = 0.28 / 0.72 근처)
  for (const cu of [0.29, 0.71]) {
    for (const [dw, a] of [[0.075, 0.3], [0.035, 0.24], [0.012, 0.3]]) {
      const grd = g.createLinearGradient((cu - dw) * 512, 0, (cu + dw) * 512, 0);
      grd.addColorStop(0, 'rgba(70,50,32,0)');
      grd.addColorStop(0.5, `rgba(70,50,32,${a})`);
      grd.addColorStop(1, 'rgba(70,50,32,0)');
      g.fillStyle = grd;
      g.fillRect((cu - dw) * 512, 0, dw * 2 * 512, 512);
    }
  }
  // 자국 방향의 결
  g.globalAlpha = 0.12;
  for (let i = 0; i < 220; i++) {
    const x = rand(0, 512);
    g.strokeStyle = Math.random() < 0.5 ? '#5c4326' : '#c9ae84';
    g.lineWidth = rand(0.7, 2.4);
    g.beginPath();
    g.moveTo(x, 0);
    let y = 0;
    while (y < 512) {
      y += rand(20, 70);
      g.lineTo(x + rand(-4, 4), y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  // 가운데 풀 한 줄기 느낌의 옅은 띠
  {
    const grd = g.createLinearGradient(0.44 * 512, 0, 0.56 * 512, 0);
    grd.addColorStop(0, 'rgba(150,150,86,0)');
    grd.addColorStop(0.5, 'rgba(150,150,86,0.2)');
    grd.addColorStop(1, 'rgba(150,150,86,0)');
    g.fillStyle = grd;
    g.fillRect(0.44 * 512, 0, 0.12 * 512, 512);
  }

  // 자갈·돌
  for (let i = 0; i < 1500; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = rand(0.6, 2.6);
    const v = rand(0.25, 0.9);
    g.fillStyle = `rgba(${Math.round(210 * v + 30)}, ${Math.round(200 * v + 26)}, ${Math.round(180 * v + 20)}, ${rand(0.25, 0.85)})`;
    g.beginPath();
    g.ellipse(x, y, r, r * rand(0.6, 1), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  // 입자 노이즈
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] += n;
    d[i + 1] += n * 0.95;
    d[i + 2] += n * 0.85;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 마른 땅(오프로드 주변 지면) ───────────────────────── */
export function dirtGroundTexture() {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#a08659';
  g.fillRect(0, 0, 512, 512);
  // 마른 흙·모래 얼룩
  for (let i = 0; i < 260; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = rand(18, 90);
    const hue = rand(34, 46);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `hsla(${hue}, ${rand(18, 34)}%, ${rand(32, 54)}%, ${rand(0.08, 0.26)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // 마른 풀 포기(누렇게 바랜)
  for (let i = 0; i < 2600; i++) {
    const x = rand(0, 512), y = rand(0, 512);
    g.fillStyle = `hsla(${rand(38, 56)}, ${rand(22, 42)}%, ${rand(26, 44)}%, ${rand(0.2, 0.6)})`;
    g.fillRect(x, y, rand(0.8, 2.2), rand(1.6, 4.4));
  }
  // 모래·자갈
  for (let i = 0; i < 900; i++) {
    const x = rand(0, 512), y = rand(0, 512);
    g.fillStyle = `rgba(${Math.round(rand(200, 240))}, ${Math.round(rand(186, 220))}, ${Math.round(rand(156, 190))}, ${rand(0.15, 0.5)})`;
    g.fillRect(x, y, rand(1, 2.4), rand(1, 2.4));
  }
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 20;
    d[i] += n;
    d[i + 1] += n * 0.92;
    d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
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

/* ── 잔디 (아침 햇살) ──────────────────────────────────── */
export function grassTexture() {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#3c6329';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rand(0, 512), y = rand(0, 512);
    const hue = rand(78, 118);
    g.fillStyle = `hsla(${hue}, ${rand(28, 52)}%, ${rand(18, 40)}%, ${rand(0.3, 0.85)})`;
    g.fillRect(x, y, rand(1, 3), rand(2, 6));
  }
  for (let i = 0; i < 40; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = rand(20, 70);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(140,180,90,${rand(0.05, 0.16)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, { repeat: [1, 1] });
}

/* ── 빌딩 창문 (낮) ────────────────────────────────────── */
export function buildingTexture(litChance = 0.12, tint = '#8d959c') {
  const { c, g } = makeCanvas(256, 512);
  g.fillStyle = tint;
  g.fillRect(0, 0, 256, 512);
  // 층별 음영
  for (let y = 0; y < 512; y += 16) {
    g.fillStyle = `rgba(0,0,0,${rand(0.02, 0.07)})`;
    g.fillRect(0, y, 256, 2);
  }
  const cols = 8, rows = 26;
  const cw = 256 / cols, ch = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = Math.random() < litChance;
      if (on) {
        g.fillStyle = `rgba(255, ${Math.floor(rand(215, 240))}, ${Math.floor(rand(170, 210))}, ${rand(0.5, 0.9)})`;
      } else {
        // 유리: 위쪽은 하늘, 아래는 실내
        const grd = g.createLinearGradient(0, y * ch, 0, y * ch + ch);
        grd.addColorStop(0, `rgba(${Math.floor(rand(96, 126))}, ${Math.floor(rand(136, 168))}, ${Math.floor(rand(166, 196))}, 0.95)`);
        grd.addColorStop(1, `rgba(${Math.floor(rand(40, 62))}, ${Math.floor(rand(54, 78))}, ${Math.floor(rand(76, 100))}, 0.95)`);
        g.fillStyle = grd;
      }
      g.fillRect(x * cw + cw * 0.16, y * ch + ch * 0.22, cw * 0.68, ch * 0.5);
    }
  }
  // 세로 기둥
  for (let x = 0; x <= cols; x++) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(x * cw - 1.2, 0, 2.4, 512);
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
export function bannerTexture(sub = 'C I R C U I T   ·   G P', accent = '#43e6ff') {
  const { c, g } = makeCanvas(1024, 256);
  g.fillStyle = '#11161f';
  g.fillRect(0, 0, 1024, 256);
  // 체커
  for (let x = 0; x < 1024; x += 32) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = ((x / 32) + y) % 2 === 0 ? '#f2f6ff' : '#111722';
      g.fillRect(x, y * 32 + 8, 32, 32);
      g.fillRect(x, 256 - 40 - y * 32, 32, 32);
    }
  }
  g.fillStyle = accent;
  g.font = 'italic 900 92px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = accent;
  g.shadowBlur = 24;
  g.fillText('DRIFT LEGEND', 512, 130);
  g.shadowBlur = 0;
  g.fillStyle = '#ffd9a8';
  g.font = '700 30px system-ui, -apple-system, sans-serif';
  g.fillText(sub, 512, 198, 900);
  return toTexture(c, { srgb: true });
}

/* ── 관중석 ────────────────────────────────────────────── */
export function crowdTexture() {
  const { c, g } = makeCanvas(512, 256);
  g.fillStyle = '#3a4657';
  g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 26) {
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(0, y, 512, 3);
  }
  const colors = ['#eef1f7', '#43c6e0', '#ff9d55', '#ff5d93', '#b6ff45', '#6b7c96', '#ffd166'];
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = colors[Math.floor(rand(0, colors.length))];
    g.globalAlpha = rand(0.35, 0.95);
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

/* ── 타이어 트레드 ─────────────────────────────────────── */
export function treadTexture() {
  const { c, g } = makeCanvas(256, 128);
  g.fillStyle = '#191a1d';
  g.fillRect(0, 0, 256, 128);
  // 원주 방향 그루브
  for (const y of [26, 62, 98]) {
    g.fillStyle = '#0d0e10';
    g.fillRect(0, y, 256, 6);
  }
  // 블록 패턴 (비스듬한 러그)
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = '#232529';
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 22, 58);
    g.lineTo(x + 6, 58);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(x + 16, 68);
    g.lineTo(x + 32, 68);
    g.lineTo(x + 26, 94);
    g.lineTo(x + 10, 94);
    g.closePath();
    g.fill();
  }
  // 노이즈
  const img = g.getImageData(0, 0, 256, 128);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: [10, 1], srgb: true, aniso: 4 });
}

/* ── 우드(나무 울타리) ─────────────────────────────────── */
export function woodTexture() {
  const { c, g } = makeCanvas(256, 64);
  g.fillStyle = '#a5825a';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 60; i++) {
    const y = rand(0, 64);
    g.strokeStyle = `rgba(${Math.floor(rand(90, 140))}, ${Math.floor(rand(64, 100))}, ${Math.floor(rand(38, 62))}, ${rand(0.15, 0.5)})`;
    g.lineWidth = rand(0.6, 2.2);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x < 256; x += 32) g.lineTo(x, y + rand(-1.6, 1.6));
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(70,50,30,${rand(0.2, 0.45)})`;
    g.beginPath();
    g.ellipse(rand(0, 256), rand(0, 64), rand(2, 6), rand(1.5, 4), 0, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, { repeat: [1, 1] });
}
