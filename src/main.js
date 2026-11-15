// 게임 부트스트랩 · 카메라 · 메인 루프
import THREE from './three.js?v=20261115d';
import { buildWorld, MAPS, ARENA_RADIUS } from './world.js?v=20261115d';
import { VFX } from './vfx.js?v=20261115d';
import { Sfx } from './audio.js?v=20261115d';
import { Player } from './player.js?v=20261115d';
import { EnemyManager } from './enemies.js?v=20261115d';
import { UI } from './ui.js?v=20261115d';
import { Input } from './input.js?v=20261115d';
import { ANIMALS } from './animals.js?v=20261115d';
import { clamp, damp, dampAngle } from './util.js?v=20261115d';

class FakeInput {
  constructor() {
    this.move = { f: 0, s: 0 };
    this.sprint = false;
    this.q = new Set();
  }
  consume(a) {
    if (this.q.has(a)) {
      this.q.delete(a);
      return true;
    }
    return false;
  }
  press(a) {
    this.q.add(a);
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.mobile = matchMedia('(pointer: coarse)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.mobile,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.75 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.touchAction = 'none';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 600);

    this.mapId = 'savanna';
    try {
      const saved = localStorage.getItem('wt.map');
      if (saved && MAPS[saved]) this.mapId = saved;
    } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
    this.world = buildWorld(this.scene, { mobile: this.mobile });
    this.world.setMap(this.mapId);
    this.vfx = new VFX(this.scene);
    this.sfx = new Sfx();
    this.ui = new UI(this);
    this.enemies = new EnemyManager(this);
    this.enemies.setBiome(MAPS[this.mapId].enemies);
    this.player = new Player(this);
    this.input = new Input(this.canvas);

    document.body.classList.toggle('touch', this.input.isTouch);

    this.camYaw = 0;
    this.camPitch = 0.34;
    this.camDist = this.mobile ? 9.6 : 8.8;
    this.viewScale = 1;
    this.camTarget = new THREE.Vector3(0, 1.1, 8);
    this.lastCamInput = 0;
    this.paused = true;
    this.running = false;
    this.frame = 0;
    this.fps = 60;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.slowTime = 0;
    this.qualityReduced = false;

    this.sfx.init();
    this.bindEvents();
    this.resize();

    // 시작: 선택 화면
    this.ui.showSelect();
    this.ui.hideLoading();
    this.camera.position.set(0, 6, 22);
    this.camera.lookAt(0, 1, 0);

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    window.__game = this;
    window.__THREE = THREE;
    window.__ready = true;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.canvas.addEventListener('pointerdown', () => this.sfx.resume(), { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.paused) return;
        this.openSelect();
      }
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 세로 화면(폰)에서는 시야각을 조금 넓혀 동물이 잘리지 않게
    this.camera.fov = aspect < 0.85 ? 58 : 52;
    // 화면이 좁을수록 카메라를 뒤로 물린다
    this.viewScale = aspect < 1 ? clamp(1.0 / Math.max(0.55, aspect), 1, 1.55) : 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  selectAnimal(id) {
    this.player.spawn(id);
    this.ui.setAnimal(this.player.cfg);
    this.ui.hideSelect();
    this.paused = false;
    this.running = true;
    this.sfx.resume();
    this.camYaw = this.player.yaw + Math.PI;
    this.camDist = this.mobile ? 9.6 : 8.8;
    this.camPitch = 0.34;
  }

  openSelect() {
    this.ui.hideDeath();
    this.ui.closeMapMenu?.();
    this.paused = true;
    this.ui.showSelect();
  }

  // 지도 교체 — 페이지 새로고침 없이 무대만 바뀐다
  setMap(id) {
    const map = MAPS[id];
    if (!map) return;
    if (this.mapId === id) return;
    this.mapId = id;
    this.world.setMap(id);
    this.enemies.setBiome(map.enemies);
    this.ui.setMapActive(id);
    try {
      localStorage.setItem('wt.map', id);
    } catch (e) { /* ignore */ }
    // 동물은 그대로, 위치만 아레나 안전 범위로
    const d = Math.hypot(this.player.pos.x, this.player.pos.z);
    if (d > ARENA_RADIUS - 2) {
      const k = (ARENA_RADIUS - 2) / d;
      this.player.pos.x *= k;
      this.player.pos.z *= k;
      this.player.syncRoot();
    }
    this.ui.toast(`${map.emoji} ${map.name} — 새 무대`);
  }

  openMapMenu() {
    this.paused = true;
  }

  closeMapMenu() {
    if (!this.ui.el.select.classList.contains('hidden')) return;
    this.paused = false;
  }

  updateCamera(dt, instant = false) {
    const p = this.player;
    // 입력에 따른 회전
    if (this.input.camDelta.x || this.input.camDelta.y) {
      this.camYaw -= this.input.camDelta.x * 0.0055;
      this.camPitch = clamp(this.camPitch + this.input.camDelta.y * 0.0042, 0.06, 1.12);
      this.lastCamInput = performance.now();
    }
    if (this.input.zoom) {
      this.camDist = clamp(this.camDist + this.input.zoom * 0.006, 4.6, 17);
      this.lastCamInput = performance.now();
    }

    // 이동 중 자동 추적 (카메라 입력이 없을 때)
    const noCamInput = performance.now() - this.lastCamInput > 1700;
    if (noCamInput && this.input.move.f > 0.35 && p.alive && !this.paused) {
      this.camYaw = dampAngle(this.camYaw, p.yaw + Math.PI, 1.1, dt);
    }

    const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.15, p.pos.z);
    const ahead = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(0.55);
    target.add(ahead);

    const dist = this.camDist * (this.viewScale || 1);
    const horiz = Math.cos(this.camPitch) * dist;
    const vert = Math.sin(this.camPitch) * dist + 0.55;
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.camYaw) * horiz,
      target.y + vert,
      target.z + Math.cos(this.camYaw) * horiz
    );
    desired.y = Math.max(desired.y, 0.7);

    if (instant) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-9 * dt));

    const look = target.clone();
    if (this.vfx.shakeAmount > 0.002) {
      const s = this.vfx.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.55;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.4;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.55;
      look.x += (Math.random() - 0.5) * s * 0.25;
      look.y += (Math.random() - 0.5) * s * 0.2;
    }
    this.camera.lookAt(look);
  }

  stepOnce(dt, input) {
    this.player.update(dt, input, this.camYaw);
    this.enemies.update(dt, this.player);
    this.vfx.update(dt);
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = clamp(rawDt, 0, 1 / 20);
    this.frame++;

    // FPS
    this.fpsAcc += rawDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.ui.setFps(this.fps);
      if (!this.qualityReduced && this.fps < 34 && this.frame > 180) {
        this.qualityReduced = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      }
    }

    this.input.update();

    if (!this.paused) {
      this.player.update(dt, this.input, this.camYaw);
      this.enemies.update(dt, this.player);
      this.ui.update(this.player, this.enemies);
    } else {
      // 선택 화면: 천천히 도는 배경
      this.camYaw += dt * 0.12;
      this.camPitch = 0.3 + Math.sin(now * 0.0002) * 0.06;
    }

    this.vfx.update(dt);
    this.world.update(dt);
    this.updateCamera(dt, this.frame === 1);
    this.input.endFrame();

    this.renderer.render(this.scene, this.camera);
  }

  // ── 자체 점검 (헤드리스 검증용) ───────────────────────────
  runSelfTest() {
    const out = { results: [], ok: true };
    const fake = new FakeInput();
    const wasPaused = this.paused;
    this.paused = true;
    // 부활로 인한 피해량 측정 오차 방지
    this.enemies.all.forEach((e) => {
      e.respawnT = 999;
    });

    const step = (n) => {
      for (let i = 0; i < n; i++) this.stepOnce(1 / 60, fake);
    };
    const placeEnemy = (dist = 2.2) => {
      const e = this.enemies.all.find((x) => x.alive) || this.enemies.all[0];
      e.alive = true;
      e.hp = e.maxHp;
      e.stunT = 0;
      e.constricted = false;
      e.state = 'idle';
      e.respawnT = 999;
      e.root.visible = true;
      e.root.position.set(this.player.pos.x + Math.sin(this.player.yaw) * dist, 0, this.player.pos.z + Math.cos(this.player.yaw) * dist);
      return e;
    };
    const totalHp = () => this.enemies.all.reduce((s, e) => s + Math.max(0, e.hp), 0);
    const waitIdle = () => {
      for (let i = 0; i < 300 && this.player.action; i++) this.stepOnce(1 / 60, fake);
    };

    try {
      for (const id of Object.keys(ANIMALS)) {
        const r = { id, ok: true };
        try {
          this.player.spawn(id, { silent: true });
          fake.move.f = 0;
          fake.sprint = false;
          step(6);
          r.meshes = (() => {
            let n = 0;
            this.player.model.traverse((o) => {
              if (o.isMesh) n++;
            });
            return n;
          })();
          r.height = (() => {
            const box = new THREE.Box3().setFromObject(this.player.model);
            return +(box.max.y - box.min.y).toFixed(2);
          })();

          const startPos = this.player.pos.clone();
          fake.move.f = 1;
          step(45);
          r.walkDist = +this.player.pos.distanceTo(startPos).toFixed(2);

          const st0 = this.player.stamina;
          fake.sprint = true;
          step(40);
          r.sprintSpeed = +this.player.speed.toFixed(2);
          r.staminaDrain = +(st0 - this.player.stamina).toFixed(1);
          fake.sprint = false;

          const y0 = this.player.pos.y;
          fake.press('jump');
          step(10);
          r.jumpHeight = +(this.player.pos.y - y0).toFixed(2);
          step(45);

          // 피해량은 '맞은 그 적'의 체력 변화로 잰다 (다른 적의 부활로 인한 오차 방지)
          const e1 = placeEnemy(2.0);
          this.player.vel.set(0, 0, 0);
          const hp0 = Math.max(0, e1.hp);
          fake.press('attack');
          step(45);
          waitIdle();
          r.attackDamage = Math.max(0, +(hp0 - Math.max(0, e1.hp)).toFixed(0));
          r.combo = this.player.combo;

          const e2 = placeEnemy(2.4);
          const hp1 = Math.max(0, e2.hp);
          fake.press('skill1');
          step(160);
          waitIdle();
          r.skill1 = this.player.cfg.skills[0].name;
          r.skill1Damage = Math.max(0, +(hp1 - Math.max(0, e2.hp)).toFixed(0));
          r.skill1Cooldown = +(this.player.cd[this.player.cfg.skills[0].id] || 0).toFixed(1);

          const e3 = placeEnemy(2.4);
          const hp2 = Math.max(0, e3.hp);
          fake.press('skill2');
          step(170);
          waitIdle();
          r.skill2 = this.player.cfg.skills[1].name;
          r.skill2Damage = Math.max(0, +(hp2 - Math.max(0, e3.hp)).toFixed(0));
          r.skill2Cooldown = +(this.player.cd[this.player.cfg.skills[1].id] || 0).toFixed(1);

          r.ok = r.meshes > 8 && r.walkDist > 1 && r.jumpHeight > 0.3 && r.attackDamage > 0 && r.skill1Cooldown > 0 && r.skill2Cooldown > 0;
          if (!r.ok) out.ok = false;
        } catch (err) {
          r.ok = false;
          r.error = err && err.stack ? err.stack : String(err);
          out.ok = false;
        }
        out.results.push(r);
      }
    } finally {
      this.player.spawn('lion', { silent: true });
      this.ui.setAnimal(this.player.cfg);
      this.paused = wasPaused;
      if (!this.paused) this.ui.hideSelect();
    }
    // 지도 4종이 모두 로드되고 걸을 수 있는지
    out.maps = [];
    const savedMap = this.mapId;
    for (const id of Object.keys(MAPS)) {
      try {
        this.mapId = null;
        this.setMap(id);
        this.player.spawn('lion', { silent: true });
        this.player.pos.set(0, 0, 6);
        fake.move.f = 1;
        step(30);
        fake.move.f = 0;
        const onGround = Math.abs(this.player.pos.y) < 0.6;
        const alive = this.enemies.all.length > 0 && this.enemies.all.every((e) => !!e.root);
        out.maps.push({ id, ok: onGround && alive, mobs: this.enemies.all.length, y: +this.player.pos.y.toFixed(2) });
        if (!onGround || !alive) out.ok = false;
      } catch (err) {
        out.maps.push({ id, ok: false, error: String(err && err.message ? err.message : err) });
        out.ok = false;
      }
    }
    this.mapId = null;
    this.setMap(savedMap);

    out.errors = window.__errors || [];
    return out;
  }
}

function boot() {
  try {
    window.__game = new Game();
  } catch (err) {
    const box = document.getElementById('fatal');
    const log = document.getElementById('fatal-log');
    if (box && log) {
      log.textContent = err && err.stack ? err.stack : String(err);
      box.classList.remove('hidden');
    }
    throw err;
  }
}

boot();
