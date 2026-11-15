// DRIFT LEGEND — 부트스트랩·레이스 진행·카메라·메인 루프
import THREE from './three.js?v=20261115b';
import { buildTrack } from './track.js?v=20261115b';
import { CARS, buildCar } from './carModel.js?v=20261115b';
import { Car } from './car.js?v=20261115b';
import { AICar } from './ai.js?v=20261115b';
import { Effects, NitroFlame } from './vfx.js?v=20261115b';
import { Hud } from './hud.js?v=20261115b';
import { Input } from './input.js?v=20261115b';
import { Sfx } from './audio.js?v=20261115b';
import { clamp, lerp, damp, formatTime, rand } from './util.js?v=20261115b';

const TOTAL_LAPS = 3;
const GRID = [
  { s: -9, lane: -2.6 }, { s: -9, lane: 2.6 },
  { s: -16, lane: -2.6 }, { s: -16, lane: 2.6 },
];
const PLAYER_SLOT = 3;
const AI_SKINS = [
  { color: 0xff3b57, ui: '#ff3b57', name: 'RIVAL RED' },
  { color: 0x9b5cff, ui: '#9b5cff', name: 'VIOLET' },
  { color: 0xe6ecf7, ui: '#e6ecf7', name: 'GHOST' },
];

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.0, '#04070f');
  grd.addColorStop(0.22, '#0a1730');
  grd.addColorStop(0.40, '#1d3b63');
  grd.addColorStop(0.48, '#5a6f92');
  grd.addColorStop(0.505, '#c98a63');
  grd.addColorStop(0.53, '#8a5a4a');
  grd.addColorStop(0.62, '#20232f');
  grd.addColorStop(1.0, '#070a10');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);

  // 태양 광휘
  const sun = g.createRadialGradient(700, 262, 0, 700, 262, 190);
  sun.addColorStop(0, 'rgba(255,214,160,0.95)');
  sun.addColorStop(0.25, 'rgba(255,150,90,0.42)');
  sun.addColorStop(1, 'rgba(255,120,80,0)');
  g.fillStyle = sun;
  g.fillRect(430, 60, 560, 400);

  // 별
  for (let i = 0; i < 220; i++) {
    const y = rand(0, 170);
    g.fillStyle = `rgba(200,225,255,${rand(0.15, 0.8) * (1 - y / 200)})`;
    g.fillRect(rand(0, 1024), y, rand(0.6, 1.8), rand(0.6, 1.8));
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance', alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.2, 1200);
    this.camera.position.set(30, 18, 240);

    const sky = skyTexture();
    this.scene.background = sky;
    this.scene.environment = sky;
    this.scene.fog = new THREE.FogExp2(0x2b3448, 0.0028);

    this.hemi = new THREE.HemisphereLight(0x9dc4ff, 0x3a2a1e, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd7ab, 2.5);
    this.sun.position.set(-90, 80, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    const sc = 46;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.track = buildTrack(this.scene);
    this.effects = new Effects(this.scene);
    this.hud = new Hud(this.track);
    this.sfx = new Sfx();
    this.input = new Input();

    this.state = 'menu';
    this.selected = 0;
    this.player = null;
    this.flame = null;
    this.ai = [];
    this.raceTime = 0;
    this.lapStart = 0;
    this.lapIndex = 0;
    this.bestLap = Number(localStorage.getItem('drift.best') || 0) || 0;
    this.lastLap = 0;
    this.countdownT = 0;
    this.cp = [false, false, false];
    this.prevS = 0;
    this.camPos = new THREE.Vector3(30, 10, 240);
    this.camLook = new THREE.Vector3(60, 1, 200);
    this.orbit = 0;
    this.fov = 64;
    this.shake = 0;
    this.manual = false;
    this.debugInput = null;
    this.errors = [];
    this.contacts = 0;
    this.impacts = 0;
    this.carCrashLock = false;
    this.raf = 0;
    this.last = performance.now();
    this.frameTimes = [];
    this.pixelRatioCap = Math.min(window.devicePixelRatio || 1, 2);

    this.bindUI();
    this.selectCar(0);
    this.createAI();
    this.ai.forEach((a) => { a.model.visible = false; });
    this.resetGrid();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    this.hud.show(false);
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('load-fill').style.width = '100%';
    setTimeout(() => document.getElementById('loading').classList.add('hidden'), 260);

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    window.__driftReady = true;
  }

  /* ── UI 바인딩 ───────────────────────────────────────── */
  bindUI() {
    this.el = {
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      result: document.getElementById('result'),
      start: document.getElementById('start-btn'),
      resume: document.getElementById('resume-btn'),
      restart: document.getElementById('restart-btn'),
      garage: document.getElementById('garage-btn'),
      again: document.getElementById('again-btn'),
      resultGarage: document.getElementById('result-garage'),
      pauseBtn: document.getElementById('pause-btn'),
      mute: document.getElementById('mute-btn'),
      bestLap: document.getElementById('best-lap'),
      carList: document.getElementById('car-list'),
    };

    this.input.bindHold(document.getElementById('btn-left'), 'left');
    this.input.bindHold(document.getElementById('btn-right'), 'right');
    this.input.bindHold(document.getElementById('btn-drift'), 'drift');
    this.input.bindHold(document.getElementById('btn-boost'), 'boost');

    this.el.start.addEventListener('click', () => this.startRace());
    this.el.resume.addEventListener('click', () => this.setPaused(false));
    this.el.restart.addEventListener('click', () => { this.setPaused(false); this.startRace(); });
    this.el.garage.addEventListener('click', () => { this.setPaused(false); this.toMenu(); });
    this.el.again.addEventListener('click', () => this.startRace());
    this.el.resultGarage.addEventListener('click', () => this.toMenu());
    this.el.pauseBtn.addEventListener('click', () => this.setPaused(true));
    this.el.mute.addEventListener('click', () => {
      const on = !this.sfx.enabled;
      this.sfx.setEnabled(on);
      this.el.mute.textContent = on ? '🔊' : '🔇';
    });
    this.el.bestLap.textContent = this.bestLap ? `베스트 랩 ${formatTime(this.bestLap)}` : '베스트 랩 —';
  }

  buildCards() {
    const list = this.el.carList;
    list.innerHTML = '';
    CARS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'car-card' + (i === this.selected ? ' sel' : '');
      b.style.setProperty('--accent', c.ui);
      b.innerHTML = `<div class="swatch"></div><h3>${c.name}</h3><p class="role">${c.role}</p>` +
        Object.entries(c.stats).map(([k, v]) =>
          `<div class="stat"><em>${k} ${(v * 100).toFixed(0)}</em><div class="bar"><i style="width:${(v * 100).toFixed(0)}%"></i></div></div>`
        ).join('');
      b.addEventListener('click', () => this.selectCar(i));
      list.appendChild(b);
    });
  }

  disposeModel(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) v.dispose();
          }
          m.dispose();
        });
      }
    });
  }

  selectCar(i) {
    this.selected = i;
    const spec = CARS[i];
    if (this.player) {
      this.scene.remove(this.player.model);
      this.disposeModel(this.player.model);
    }
    this.player = new Car(spec, this.track);
    this.scene.add(this.player.model);
    this.flame = new NitroFlame(this.player.model);
    this.resetGrid();
    this.buildCards();
    if (this.state === 'menu') this.ai.forEach((a) => { a.model.visible = false; });
  }

  createAI() {
    for (const a of this.ai) {
      this.scene.remove(a.model);
      this.disposeModel(a.model);
    }
    this.ai = [];
    const order = [0, 1, 2];
    const skills = [0.93, 0.985, 1.02];
    for (let k = 0; k < 3; k++) {
      const base = CARS[(this.selected + 1 + k) % CARS.length];
      const skin = AI_SKINS[k];
      const spec = { ...base, color: skin.color, ui: skin.ui, name: skin.name };
      const slot = GRID[k];
      const car = new AICar(spec, this.track, {
        skill: skills[k],
        startS: this.track.length + slot.s,
        lane: slot.lane,
      });
      this.scene.add(car.model);
      this.ai.push(car);
    }
  }

  resetGrid() {
    if (!this.player) return;
    const slot = GRID[PLAYER_SLOT];
    this.player.reset(this.track.length + slot.s, slot.lane);
    this.player.model.position.copy(this.player.pos);
    this.player.model.rotation.set(0, this.player.yaw, 0);
    this.ai.forEach((a, k) => {
      const s = GRID[k];
      a.reset(this.track.length + s.s, s.lane, 0);
    });
    this.lapIndex = 0;
    this.raceTime = 0;
    this.lapStart = 0;
    this.lastLap = 0;
    this.cp = [false, false, false];
    this.prevS = this.player.progressS;
    this.effects.reset();
  }

  /* ── 화면 전환 ───────────────────────────────────────── */
  toMenu() {
    this.state = 'menu';
    this.manual = false;
    this.input.reset();
    this.createAI();
    this.resetGrid();
    this.ai.forEach((a) => { a.model.visible = false; });
    this.hud.show(false);
    this.hud.countdown(null);
    this.el.menu.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.el.bestLap.textContent = this.bestLap ? `베스트 랩 ${formatTime(this.bestLap)}` : '베스트 랩 —';
    this.sfx.update({ active: false });
  }

  startRace() {
    this.sfx.init();
    this.sfx.resume();
    this.createAI();
    this.resetGrid();
    this.state = 'countdown';
    this.countdownT = 3.65;
    this.lastCount = 4;
    this.el.menu.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.ai.forEach((a) => { a.model.visible = true; });
    this.hud.show(true);
    this.hud.setLap(1, TOTAL_LAPS);
    this.hud.setPos(4, 4);
    this.hud.setTime(0);
    this.hud.setBest(this.bestLap);
    this.camPos.set(
      this.player.pos.x - Math.sin(this.player.yaw) * 9,
      4.2,
      this.player.pos.z - Math.cos(this.player.yaw) * 9
    );
    this.camLook.copy(this.player.pos);
  }

  setPaused(p) {
    if (p && this.state === 'racing') {
      this.state = 'paused';
      this.el.pause.classList.remove('hidden');
      this.sfx.update({ active: false });
    } else if (!p && this.state === 'paused') {
      this.state = 'racing';
      this.el.pause.classList.add('hidden');
    }
  }

  finishRace() {
    this.state = 'finished';
    this.manual = false;
    const rank = this.rankOf(this.player);
    const rt = this.raceTime;
    document.getElementById('result-title').textContent = rank === 1 ? 'WINNER' : 'FINISH';
    document.getElementById('r-pos').textContent = `${rank}위 / 4`;
    document.getElementById('r-total').textContent = formatTime(rt);
    document.getElementById('r-best').textContent = this.bestLap ? formatTime(this.bestLap) : '--:--.--';
    document.getElementById('r-speed').textContent = `${Math.round(this.player.topSpeed)} km/h`;
    this.el.result.classList.remove('hidden');
    this.hud.countdown(null);
    this.sfx.update({ active: false });
    this.sfx.blip(660, 0.2);
    setTimeout(() => this.sfx.blip(880, 0.3), 160);
  }

  /* ── 매 프레임 ──────────────────────────────────────── */
  step(dt) {
    if (this.state === 'menu') {
      this.orbit += dt * 0.22;
      const c = this.player.pos;
      const portrait = this.camera.aspect < 0.85;
      const r = portrait ? 19 : 11.5;
      this.camera.position.set(
        c.x + Math.sin(this.orbit) * r,
        (portrait ? 3.4 : 2.6) + Math.sin(this.orbit * 0.7) * 0.2,
        c.z + Math.cos(this.orbit) * r
      );
      this.camera.lookAt(c.x, portrait ? 3.4 : 2.9, c.z);
      this.camera.fov = 40;
      this.camera.updateProjectionMatrix();
      this.effects.update(dt);
      this.sfx.update({ active: false });
      return;
    }

    if (this.state === 'paused' || this.state === 'finished') {
      this.effects.update(dt * 0.25);
      this.sfx.update({ active: false });
      return;
    }

    if (this.state === 'countdown') {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT - 0.6);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0) {
          this.hud.countdown(String(n));
          this.sfx.countdown(n);
        } else {
          this.hud.countdown('GO!', true);
          this.sfx.countdown(0);
          setTimeout(() => this.hud.countdown(null), 700);
        }
      }
      if (this.countdownT <= 0.6 && this.state === 'countdown') {
        this.state = 'racing';
        this.raceTime = 0;
        this.lapStart = 0;
      }
      this.updateCamera(dt);
      this.effects.update(dt);
      this.sfx.update({ speed: 0, maxSpeed: this.player.maxSpeed, active: true });
      return;
    }

    /* ── 주행 ─────────────────────────────────────────── */
    this.raceTime += dt;
    const rawInput = this.debugInput ? { ...this.input.state(), ...this.debugInput } : this.input.state();
    const driving = { ...rawInput };
    this.player.update(dt, driving);

    // 이벤트
    let ev;
    while ((ev = this.player.consumeEvent())) {
      if (ev === 'drift-start') {
        this.sfx.blip(300, 0.05, 'sine', 0.05);
      } else if (ev === 'reverse') {
        this.sfx.blip(200, 0.14, 'square', 0.06);
        this.hud.toast('R · 후진', 760, '#ffb46b');
      } else if (ev.type === 'miniturbo') {
        this.effects.burst(
          this.player.pos.x, 0.5, this.player.pos.z, ev.level
        );
        this.sfx.miniTurbo(ev.level);
        this.shake = Math.max(this.shake, 0.35 + ev.level * 0.12);
        if (ev.level >= 3) this.hud.toast('MINI TURBO Lv.3', 900, '#ff8b3d');
      } else if (ev.type === 'wall') {
        this.effects.crashSpark(ev.x, 0.6, ev.z, Math.min(3, ev.power * 0.16));
        this.shake = Math.max(this.shake, Math.min(0.85, 0.2 + ev.power * 0.032));
        if (!this.wallSoundLock) {
          this.sfx.crash();
          this.wallSoundLock = true;
          setTimeout(() => { this.wallSoundLock = false; }, 240);
        }
      }
    }

    const others = this.ai.map((a) => ({ s: a.s, lane: a.lane }));
    others.push({ s: this.player.progressS, lane: this.player.lat });
    for (const a of this.ai) a.update(dt, others, true);

    // 차량끼리 충돌 (밀어내기·반발·속도 손실·스파크)
    const carsAll = [this.player, ...this.ai];
    this.resolveCarContacts(carsAll);

    // 진행도·랩
    const L = this.track.length;
    const s = this.player.progressS;
    this.cpCheck(s);
    if (this.prevS > L * 0.72 && s < L * 0.28) {
      const allCp = this.cp.every(Boolean);
      if (this.lapIndex === 0) {
        this.lapIndex = 1;
        this.lapStart = this.raceTime;
      } else if (allCp) {
        this.lastLap = this.raceTime - this.lapStart;
        this.lapStart = this.raceTime;
        if (!this.bestLap || this.lastLap < this.bestLap) {
          this.bestLap = this.lastLap;
          localStorage.setItem('drift.best', String(this.bestLap));
          this.hud.toast(`BEST LAP ${formatTime(this.lastLap)}`, 1400, '#b6ff45');
        } else {
          this.hud.toast(`LAP ${this.lapIndex} · ${formatTime(this.lastLap)}`, 1200);
        }
        this.lapIndex += 1;
        this.cp = [false, false, false];
        if (this.lapIndex > TOTAL_LAPS) {
          this.finishRace();
          return;
        }
      }
    }
    this.prevS = s;

    // 이펙트
    this.effects.wheelTrail(this.player, this.player.driftLevel, dt, 1);
    if (this.player.offRoad && Math.hypot(this.player.vel.x, this.player.vel.z) > 6) {
      const w = this.player.rearWheelWorld(1);
      this.effects.dust(w.x, w.z, -this.player.vel.x * 0.1, -this.player.vel.z * 0.1);
    }
    for (const a of this.ai) {
      this.effects.wheelTrail(a, 2, dt, 0.55);
    }
    this.effects.update(dt);

    // HUD
    this.hud.setSpeed(this.player.kmh);
    this.hud.setTime(this.raceTime);
    this.hud.setLap(Math.max(1, this.lapIndex), TOTAL_LAPS);
    this.hud.setDrift(this.player.driftCharge, this.player.driftLevel, this.player.drifting);
    this.hud.setNitro(this.player.nitro);
    this.hud.setPos(this.rankOf(this.player), 4);
    this.hud.setGear(this.player.reversing, this.player.brake > 0.5);
    this.hud.update(dt, carsAll, 0);

    // 사운드
    this.sfx.update({
      speed: this.player.kmh / 3.6,
      maxSpeed: this.player.maxSpeed,
      throttle: this.player.speed > 0 ? 1 : 0,
      skid: clamp(this.player.slip * 2.2 + (this.player.drifting ? 0.5 : 0), 0, 1),
      boost: this.player.boostTimer > 0 ? 1 : 0,
    });

    this.flame.update(dt, this.player.boostTimer > 0 ? this.player.boostPower : 0);
    this.updateCamera(dt);
    this.updateSun();
  }

  /* ── 차량 접촉 ─────────────────────────────────────── */
  // 차체를 앞·뒤 두 개의 원으로 근사해 접촉점을 구한다
  bodyCircles(car) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const r = 1.12;
    return [
      { x: car.pos.x + fx * 1.05, z: car.pos.z + fz * 1.05, r },
      { x: car.pos.x - fx * 1.05, z: car.pos.z - fz * 1.05, r },
    ];
  }

  resolveCarContacts(cars) {
    this.contacts = 0;
    this.impacts = 0;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const A = cars[i], B = cars[j];
        const ac = this.bodyCircles(A), bc = this.bodyCircles(B);
        let best = null;
        for (const ca of ac) {
          for (const cb of bc) {
            const dx = cb.x - ca.x, dz = cb.z - ca.z;
            const d = Math.hypot(dx, dz);
            const pen = ca.r + cb.r - d;
            if (d > 1e-4 && pen > 0 && (!best || pen > best.pen)) {
              best = { pen, nx: dx / d, nz: dz / d, x: (ca.x + cb.x) * 0.5, z: (ca.z + cb.z) * 0.5 };
            }
          }
        }
        if (!best) continue;
        this.contacts++;

        // 파고든 만큼 분리
        const half = best.pen * 0.5 + 0.002;
        A.pos.x -= best.nx * half; A.pos.z -= best.nz * half;
        B.pos.x += best.nx * half; B.pos.z += best.nz * half;
        if (A.shove) A.shove(-best.nx * half, -best.nz * half);
        if (B.shove) B.shove(best.nx * half, best.nz * half);

        // 접근 속도에 비례한 반발 (충돌음·스파크·흔들림)
        const rvx = B.vel.x - A.vel.x, rvz = B.vel.z - A.vel.z;
        const vn = rvx * best.nx + rvz * best.nz;
        if (vn < 0) {
          const e = 0.45;
          const jimp = -(1 + e) * vn * 0.5;
          if (A.applyImpulse) A.applyImpulse(-best.nx * jimp, -best.nz * jimp);
          else { A.vel.x -= best.nx * jimp; A.vel.z -= best.nz * jimp; }
          if (B.applyImpulse) B.applyImpulse(best.nx * jimp, best.nz * jimp);
          else { B.vel.x += best.nx * jimp; B.vel.z += best.nz * jimp; }
          const impact = -vn;
          if (impact > 1.4) {
            this.impacts++;
            this.effects.crashSpark(best.x, 0.55, best.z, Math.min(3, impact * 0.16));
            this.shake = Math.max(this.shake, Math.min(0.9, 0.16 + impact * 0.04));
            if (impact > 2.8 && !this.carCrashLock) {
              this.sfx.crash();
              this.carCrashLock = true;
              setTimeout(() => { this.carCrashLock = false; }, 200);
            }
          }
        }
      }
    }
  }

  cpCheck(s) {
    const L = this.track.length;
    for (let i = 0; i < 3; i++) {
      const t = L * (0.25 + i * 0.25);
      if (!this.cp[i] && Math.abs(s - t) < 26) this.cp[i] = true;
    }
  }

  rankOf(car) {
    const list = [this.player, ...this.ai];
    const dist = (c) => (c === this.player ? this.lapIndex : c.lapIndex) * this.track.length +
      (c === this.player ? c.progressS : c.s);
    const my = dist(car);
    let rank = 1;
    for (const c of list) {
      if (c === car) continue;
      if (dist(c) > my) rank++;
    }
    return rank;
  }

  updateCamera(dt) {
    const car = this.player;
    const fwd = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    const speed = Math.hypot(car.vel.x, car.vel.z);
    let dir = { x: fwd.x, z: fwd.z };
    const portrait = this.camera.aspect < 1;
    if (speed > 4) {
      const vx = car.vel.x / speed, vz = car.vel.z / speed;
      const blend = car.drifting ? (portrait ? 0.2 : 0.3) : 0.18;
      dir.x = lerp(fwd.x, vx, blend);
      dir.z = lerp(fwd.z, vz, blend);
      const l = Math.hypot(dir.x, dir.z) || 1;
      dir.x /= l; dir.z /= l;
    }
    // 세로 화면은 가로 화각이 좁아(약 33°) 드리프트 시 차가 화면 밖으로 밀리지 않게 더 멀리 당긴다
    const dist = 8.2 + Math.min(2.2, speed * 0.035) + (car.drifting ? (portrait ? 2.6 : 1.0) : 0);
    const height = 3.5 + Math.min(0.7, speed * 0.008);
    const desired = new THREE.Vector3(
      car.pos.x - dir.x * dist,
      height,
      car.pos.z - dir.z * dist
    );
    const k = 1 - Math.exp(-7.5 * dt);
    this.camPos.lerp(desired, k);

    const aheadLen = car.drifting ? (portrait ? 5.6 + speed * 0.05 : 7 + speed * 0.09) : 7 + speed * 0.09;
    const lookAt = new THREE.Vector3(
      car.pos.x + fwd.x * aheadLen,
      1.15,
      car.pos.z + fwd.z * aheadLen
    );
    this.camLook.lerp(lookAt, 1 - Math.exp(-(car.drifting ? 13 : 9) * dt));

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * 0.22 + (car.boostTimer > 0 ? 0.055 : 0) + Math.min(0.05, speed * 0.0009);
    this.camera.position.set(
      this.camPos.x + rand(-sh, sh),
      this.camPos.y + rand(-sh, sh) * 0.7,
      this.camPos.z + rand(-sh, sh)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLook);

    const fovTarget = 62 + Math.min(12, speed * 0.22) + (car.boostTimer > 0 ? 9 : 0);
    this.fov = damp(this.fov, fovTarget, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateSun() {
    const c = this.player.pos;
    this.sun.position.set(c.x - 70, 85, c.z + 90);
    this.sunTarget.position.set(c.x, 0, c.z);
    this.sun.target.updateMatrixWorld();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const portrait = h > w;
    const base = portrait ? 74 : 62;
    this.fov = base;
    this.camera.fov = base;
    this.camera.updateProjectionMatrix();
    // 안전 영역만큼 캔버스가 전체 화면을 채우도록
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);

    if (!this.manual) {
      try {
        this.step(dt);
      } catch (err) {
        this.errors.push(String(err && err.stack || err));
        console.error(err);
        if (this.errors.length > 3) cancelAnimationFrame(this.raf);
      }
    }

    // 동적 해상도 (저사양·발열 대응)
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) {
      this.frameTimes.shift();
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avg > 0.026 && this.pixelRatioCap > 1.2) {
        this.pixelRatioCap = Math.max(1.2, this.pixelRatioCap - 0.25);
        this.renderer.setPixelRatio(this.pixelRatioCap);
        this.frameTimes.length = 0;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/* ── 부트스트랩 ─────────────────────────────────────────── */
let game;
try {
  game = new Game();
} catch (err) {
  const el = document.getElementById('fatal');
  document.getElementById('fatal-text').textContent = String(err && (err.stack || err.message) || err);
  el.classList.remove('hidden');
  document.getElementById('loading').classList.add('hidden');
  throw err;
}

/* ── 자동 검증 훅 ───────────────────────────────────────── */
window.__drift = {
  game,
  state: () => ({
    state: game.state,
    kmh: game.player.kmh,
    speed: game.player.speed,
    lat: game.player.lat,
    laps: game.lapIndex,
    lapTime: game.raceTime,
    drifting: game.player.drifting,
    driftTime: game.player.driftTime,
    driftLevel: game.player.driftLevel,
    slipDeg: game.player.slip * 180 / Math.PI,
    reversing: game.player.reversing,
    brake: game.player.brake,
    wallHit: game.player.wallHit,
    contacts: game.contacts,
    impacts: game.impacts,
    ai: game.ai.map((a) => ({ s: a.s, lane: a.lane, pos: [a.pos.x, a.pos.z], speed: a.speed, off: Math.hypot(a.off.x, a.off.z) })),
    nitro: game.player.nitro,
    boost: game.player.boostTimer,
    skids: game.effects.skids.count,
    smoke: game.effects.smoke.life.filter((v) => v > 0).length,
    errors: game.errors.slice(),
    pos: game.player.pos.toArray(),
    yaw: game.player.yaw,
    rank: game.rankOf(game.player),
    trackLength: game.track.length,
  }),
  select: (i) => game.selectCar(i),
  start: () => game.startRace(),
  input: (o) => { game.debugInput = o; },
  manual: (v) => { game.manual = v; },
  tick: (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) game.step(dt);
    return window.__drift.state();
  },
  skipCountdown: () => {
    game.countdownT = 0;
    game.state = 'racing';
    game.raceTime = 0;
    game.lapStart = 0;
    game.hud.countdown(null);
  },
  teleport: (s, lane = 0) => {
    const L = game.track.length;
    const ss = ((s % L) + L) % L;
    const p = game.track.placeAt(ss, lane);
    game.player.pos.set(p.x, 0, p.z);
    game.player.yaw = p.yaw;
    game.player.vel.x = 0;
    game.player.vel.z = 0;
    game.player.pathHint = Math.round((ss / game.track.ds) % game.track.N);
    game.player.progressS = ss;
    game.prevS = ss;
  },
  aiPlace: (i, s, lane = 0) => {
    const a = game.ai[i];
    if (!a) return null;
    const L = game.track.length;
    a.s = ((s % L) + L) % L;
    a.lane = a.baseLane = a.targetLane = lane;
    a.off.x = a.off.z = 0;
    a.offVel.x = a.offVel.z = 0;
    a.bumpT = 0;
    a.placeOnTrack();
    return { s: a.s, lane: a.lane };
  },
  // 자동 주행(검증용) — 트랙을 따라 3랩 완주 가능한지 확인
  autoDrive: (ticks = 60, opts = {}) => {
    const g = game;
    const L = g.track.length;
    for (let i = 0; i < ticks; i++) {
      if (g.state !== 'racing') break;
      const car = g.player;
      const look = 9 + Math.min(22, car.kmh / 9);
      const p = g.track.placeAt((car.progressS + look) % L, (opts.lane || 0));
      const desired = Math.atan2(p.x - car.pos.x, p.z - car.pos.z);
      const err = ((desired - car.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      // steer +1 = 우회전이므로, yaw 를 키우려면(좌회전) 음수를 준다
      const steer = Math.max(-1, Math.min(1, -err * 2.4));
      let vlim = 200 / 3.6;
      for (let k = 0; k < 9; k++) {
        const c = Math.abs(g.track.curvatureAt((car.progressS + 6 + k * 7) % L)) + 1e-4;
        vlim = Math.min(vlim, Math.sqrt(16.5 / c));
      }
      const cAhead = Math.abs(g.track.curvatureAt((car.progressS + 16) % L));
      const drift = !!opts.drift && cAhead > 0.012 && car.kmh > 42 && Math.abs(err) > 0.05;
      const brake = car.kmh / 3.6 > vlim * 0.92;
      g.debugInput = { steer, drift, boost: !!opts.boost && car.nitro > 0.5 && cAhead < 0.01, brake };
      g.step(1 / 60);
    }
    g.debugInput = null;
    return window.__drift.state();
  },
  selftest: async () => {
    const checks = [];
    const push = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
    const g = game;
    g.manual = true;
    g.selectCar(0);
    g.startRace();
    window.__drift.skipCountdown();
    g.debugInput = { steer: 0, drift: false, boost: false, brake: false };

    // 1) 가속
    let st = window.__drift.tick(120);
    push('가속·주행', st.kmh > 40 && isFinite(st.pos[0]) && isFinite(st.pos[2]), `kmh=${st.kmh.toFixed(1)}`);

    // 2) 드리프트
    g.debugInput = { steer: 0.42, drift: true, boost: false, brake: false };
    let sawDrift = false, maxDriftT = 0, maxLevel = 0;
    for (let i = 0; i < 90; i++) {
      window.__drift.tick(1);
      if (g.player.drifting) sawDrift = true;
      maxDriftT = Math.max(maxDriftT, g.player.driftTime);
      maxLevel = Math.max(maxLevel, g.player.driftLevel);
    }
    st = window.__drift.state();
    push('드리프트 진입', sawDrift && maxLevel >= 1, `driftTime=${maxDriftT.toFixed(2)} level=${maxLevel}`);
    push('스키드마크', st.skids > 0, `quads=${st.skids}`);
    push('연기 파티클', st.smoke > 0, `particles=${st.smoke}`);
    push('슬립각', Math.abs(g.player.vLat) > 1.2, `vLat=${g.player.vLat.toFixed(2)}`);

    // 3) 미니 터보
    g.debugInput = { steer: 0, drift: false, boost: false, brake: false };
    st = window.__drift.tick(2);
    push('미니 터보 발동', st.boost > 0, `boostTimer=${st.boost.toFixed(2)}`);

    // 4) 니트로
    const n0 = g.player.nitro;
    g.debugInput = { steer: 0, drift: false, boost: true, brake: false };
    window.__drift.tick(60);
    push('니트로 소모', g.player.nitro < n0, `${n0.toFixed(2)} → ${g.player.nitro.toFixed(2)}`);

    // 5) 랩 카운트 (체크포인트 3개 통과 후 결승선)
    g.debugInput = { steer: 0, drift: false, boost: false, brake: false };
    g.cp = [true, true, true];
    g.lapIndex = 1;
    window.__drift.teleport(2);
    g.prevS = g.track.length - 4;
    window.__drift.tick(2);
    push('랩 카운트', g.lapIndex === 2, `lapIndex=${g.lapIndex}`);

    // 6) 콘솔 오류
    push('콘솔 오류 없음', g.errors.length === 0, g.errors.join(' | ').slice(0, 300));

    g.manual = false;
    g.debugInput = null;
    const ok = checks.every((c) => c.ok);
    return { ok, checks };
  },
};
