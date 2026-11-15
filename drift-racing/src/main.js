// DRIFT LEGEND — 부트스트랩·레이스 진행·카메라·메인 루프
import THREE from './three.js?v=20261115g';
import { buildTrack, COURSES } from './track.js?v=20261115g';
import { CARS, buildCar } from './carModel.js?v=20261115g';
import { Car } from './car.js?v=20261115g';
import { AICar } from './ai.js?v=20261115g';
import { Effects, NitroFlame } from './vfx.js?v=20261115g';
import { Hud } from './hud.js?v=20261115g';
import { Input } from './input.js?v=20261115g';
import { Sfx } from './audio.js?v=20261115g';
import { Net, RemoteCar, makeRoomCode, roomFromUrl, courseFromUrl, inviteLink, BROKERS } from './net.js?v=20261115g';
import { clamp, lerp, damp, formatTime, rand } from './util.js?v=20261115g';

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

function skyTexture(sunDir) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  // 천정의 옅은 푸른 하늘 → 지평선의 따뜻한 복숭아빛
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0.0, '#2b68b6');
  grd.addColorStop(0.16, '#4f8ecb');
  grd.addColorStop(0.30, '#7fb2dd');
  grd.addColorStop(0.40, '#b3d2e9');
  grd.addColorStop(0.465, '#e6e9e2');
  grd.addColorStop(0.495, '#ffe4c2');
  grd.addColorStop(0.515, '#ffcf9c');
  grd.addColorStop(0.56, '#d8c3a2');
  grd.addColorStop(0.72, '#a2947a');
  grd.addColorStop(1.0, '#6b6552');
  g.fillStyle = grd;
  g.fillRect(0, 0, 2048, 1024);

  // 태양 위치 (equirect 매핑 기준)
  const u = 0.5 + Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2);
  const v = 0.5 + Math.asin(clamp(sunDir.y, -1, 1)) / Math.PI;
  const sx = u * 2048, sy = (1 - v) * 1024;

  const wrapDraw = (x, fn) => { fn(x); fn(x - 2048); fn(x + 2048); };

  // 수평선 전체의 따뜻한 기운
  const band = g.createLinearGradient(0, 440, 0, 620);
  band.addColorStop(0, 'rgba(255, 236, 205, 0)');
  band.addColorStop(0.45, 'rgba(255, 226, 178, 0.5)');
  band.addColorStop(0.6, 'rgba(255, 208, 152, 0.55)');
  band.addColorStop(1, 'rgba(255, 200, 150, 0)');
  g.fillStyle = band;
  g.fillRect(0, 440, 2048, 180);

  // 태양 광휘
  wrapDraw(sx, (x) => {
    const glow = g.createRadialGradient(x, sy, 0, x, sy, 430);
    glow.addColorStop(0, 'rgba(255, 250, 232, 0.95)');
    glow.addColorStop(0.12, 'rgba(255, 240, 198, 0.72)');
    glow.addColorStop(0.34, 'rgba(255, 214, 152, 0.34)');
    glow.addColorStop(0.62, 'rgba(255, 190, 130, 0.12)');
    glow.addColorStop(1, 'rgba(255, 180, 120, 0)');
    g.fillStyle = glow;
    g.fillRect(x - 430, sy - 430, 860, 860);
    // 원반
    const disc = g.createRadialGradient(x, sy, 0, x, sy, 34);
    disc.addColorStop(0, 'rgba(255, 255, 250, 1)');
    disc.addColorStop(0.55, 'rgba(255, 246, 216, 0.95)');
    disc.addColorStop(1, 'rgba(255, 232, 180, 0)');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x, sy, 34, 0, Math.PI * 2);
    g.fill();
  });

  // 구름 — 낮게 깔린 옅은 아침 구름
  const puff = (x, y, w, h, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, h);
    gr.addColorStop(0, `rgba(255, 253, 248, ${a})`);
    gr.addColorStop(0.55, `rgba(255, 246, 232, ${a * 0.55})`);
    gr.addColorStop(1, 'rgba(255, 240, 224, 0)');
    g.save();
    g.translate(x, y);
    g.scale(w / h, 1);
    g.fillStyle = gr;
    g.translate(-x, -y);
    g.beginPath();
    g.arc(x, y, h, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 26; i++) {
    const cx = rand(0, 2048);
    const cy = rand(120, 400);
    const cw = rand(90, 320);
    const ch = rand(26, 74);
    const a = rand(0.16, 0.5) * clamp(1 - (cy - 120) / 420, 0.25, 1);
    wrapDraw(cx, (x) => {
      puff(x, cy, cw, ch, a * 0.9);
      puff(x + cw * 0.4, cy - ch * 0.5, cw * 0.7, ch * 0.9, a);
      puff(x - cw * 0.4, cy + ch * 0.1, cw * 0.6, ch * 0.8, a * 0.8);
    });
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

    // 상쾌한 아침 — 옅은 푸른 하늘, 지평선의 따뜻한 기운, 낮게 뜬 햇살
    this.sunDir = new THREE.Vector3(-0.60, 0.30, 0.74).normalize();
    const sky = skyTexture(this.sunDir);
    this.scene.background = sky;
    // 반사용 환경맵은 PMREM 으로 전처리 — 도장·유리·크롬의 하이라이트가 부드럽고 자연스러워진다
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.envRT = pmrem.fromEquirectangular(sky);
      this.scene.environment = this.envRT.texture;
      pmrem.dispose();
    } catch (e) {
      this.scene.environment = sky;
    }
    this.scene.fog = new THREE.FogExp2(0xdfe6ea, 0.0024);

    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0xb59a72, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.9);
    this.sun.position.copy(this.sunDir).multiplyScalar(150);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 420;
    const sc = 52;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.055;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.course = localStorage.getItem('drift.course') === 'offroad' ? 'offroad' : 'circuit';
    this.track = buildTrack(this.scene, this.course);
    this.effects = new Effects(this.scene);
    this.effects.track = this.track;
    this.hud = new Hud(this.track);
    this.hud.setTrack(this.track);
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
    this.bestLap = this.loadBest();
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

    /* ── 멀티플레이 상태 ──────────────────────────── */
    this.mode = 'solo';              // 메뉴에서 고른 모드
    this.raceMode = 'solo';          // 실제 레이스 모드
    this.playerName = localStorage.getItem('drift.name') || '';
    this.remotes = new Map();        // id → RemoteCar
    this.remoteList = [];
    this.finishedTime = 0;
    this.standingsAt = 0;
    this.net = new Net({
      onStatus: (s, url, lat) => this.onNetStatus(s, url, lat),
      onPeers: (list) => this.onPeers(list),
      onState: (id, m, now) => this.onRemoteState(id, m, now),
      onJoin: (p) => { if (this.state === 'racing' || this.state === 'countdown') this.ensureRemote(p); },
      onLeave: (id) => this.removeRemote(id),
      onStart: (m) => this.onNetStart(m),
      onCourse: (c) => this.onNetCourse(c),
      onFinish: () => this.renderResultStandings(),
      onHost: () => this.updateLobbyUI(),
    });

    this.bindUI();
    this.buildCourseCards();
    this.buildLobbyCourses();
    this.applyAtmosphere();
    this.selectCar(0);
    this.createAI();
    this.ai.forEach((a) => { a.model.visible = false; });
    this.resetGrid();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    this.hud.show(false);
    document.getElementById('menu').classList.remove('hidden');
    // 초대 링크(?room=1234)로 들어왔으면 바로 그 방 대기실로
    const urlRoom = roomFromUrl();
    if (urlRoom) {
      const urlCourse = courseFromUrl();
      if (urlCourse) this.setCourse(urlCourse, { silent: true });
      this.setMode('multi', { silent: true });
      setTimeout(() => this.joinRoom(urlRoom), 60);
    }
    document.getElementById('load-fill').style.width = '100%';
    // 로딩 화면은 첫 프레임이 그려진 뒤 사라진다 (느린 기기에서 타이머가 늦어도
    // HUD 조작을 막지 않도록 CSS 에서도 pointer-events 를 끈 상태)
    const hideLoading = () => document.getElementById('loading').classList.add('hidden');
    setTimeout(hideLoading, 220);
    requestAnimationFrame(() => requestAnimationFrame(hideLoading));

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
      courses: document.getElementById('course-list'),
      tagline: document.getElementById('tagline'),
      modeSwitch: document.getElementById('mode-switch'),
      multiPanel: document.getElementById('multi-panel'),
      soloActions: document.getElementById('solo-actions'),
      nameInput: document.getElementById('name-input'),
      roomInput: document.getElementById('room-input'),
      createRoom: document.getElementById('create-room'),
      joinRoom: document.getElementById('join-room'),
      lobby: document.getElementById('lobby'),
      lobbyCode: document.getElementById('lobby-code'),
      lobbyName: document.getElementById('lobby-name'),
      lobbyStatus: document.getElementById('lobby-status'),
      lobbyDot: document.getElementById('lobby-dot'),
      lobbyLink: document.getElementById('lobby-link'),
      copyLink: document.getElementById('copy-link'),
      shareLink: document.getElementById('share-link'),
      playerList: document.getElementById('player-list'),
      lobbyCount: document.getElementById('lobby-count'),
      lobbyCourses: document.getElementById('lobby-courses'),
      lobbyCourseNote: document.getElementById('lobby-course-note'),
      lobbyStart: document.getElementById('lobby-start'),
      lobbyLeave: document.getElementById('lobby-leave'),
      lobbyHint: document.getElementById('lobby-hint'),
      netPill: document.getElementById('net-pill'),
      netText: document.getElementById('net-text'),
      standings: document.getElementById('standings'),
      resultStandings: document.getElementById('result-standings'),
    };

    this.input.bindHold(document.getElementById('btn-left'), 'left');
    this.input.bindHold(document.getElementById('btn-right'), 'right');
    this.input.bindHold(document.getElementById('btn-drift'), 'drift');
    this.input.bindHold(document.getElementById('btn-boost'), 'boost');

    this.el.start.addEventListener('click', () => this.startRace());
    this.el.resume.addEventListener('click', () => this.setPaused(false));
    this.el.restart.addEventListener('click', () => { this.setPaused(false); this.startRace(); });
    this.el.garage.addEventListener('click', () => { this.setPaused(false); this.toMenu(); });
    this.el.again.addEventListener('click', () => this.onAgain());
    this.el.resultGarage.addEventListener('click', () => this.toMenu());
    this.el.pauseBtn.addEventListener('click', () => this.setPaused(true));
    this.el.mute.addEventListener('click', () => {
      const on = !this.sfx.enabled;
      this.sfx.setEnabled(on);
      this.el.mute.textContent = on ? '🔊' : '🔇';
    });
    this.el.bestLap.textContent = this.bestLap ? `베스트 랩 ${formatTime(this.bestLap)}` : '베스트 랩 —';

    /* ── 모드 · 멀티플레이 UI ───────────────────── */
    if (this.el.modeSwitch) {
      this.el.modeSwitch.addEventListener('click', (e) => {
        const b = e.target.closest('.mode-btn');
        if (b) this.setMode(b.dataset.mode);
      });
    }
    if (this.el.nameInput) {
      this.el.nameInput.value = this.playerName;
      this.el.nameInput.addEventListener('input', () => {
        this.playerName = this.el.nameInput.value.trim().slice(0, 10);
        localStorage.setItem('drift.name', this.playerName);
        this.net.name = this.playerName;
        this.updateLobbyUI();
      });
    }
    if (this.el.roomInput) {
      this.el.roomInput.addEventListener('input', () => {
        this.el.roomInput.value = this.el.roomInput.value.replace(/\D/g, '').slice(0, 4);
      });
    }
    if (this.el.lobbyName) {
      this.el.lobbyName.value = this.playerName;
      this.el.lobbyName.addEventListener('input', () => {
        this.playerName = this.el.lobbyName.value.trim().slice(0, 10);
        localStorage.setItem('drift.name', this.playerName);
        if (this.el.nameInput) this.el.nameInput.value = this.playerName;
        this.net.updateProfile({ name: this.playerName });
        this.updateLobbyUI();
      });
    }
    if (this.el.createRoom) this.el.createRoom.addEventListener('click', () => this.createRoom());
    if (this.el.joinRoom) {
      this.el.joinRoom.addEventListener('click', () => {
        const code = (this.el.roomInput.value || '').trim();
        if (code.length !== 4) {
          this.el.roomInput.focus();
          this.hud.toast('방 코드 4자리를 입력해줘', 1400, '#ffb46b');
          return;
        }
        this.joinRoom(code);
      });
    }
    if (this.el.copyLink) {
      this.el.copyLink.addEventListener('click', async () => {
        const link = this.el.lobbyLink.value;
        try {
          await navigator.clipboard.writeText(link);
          this.el.copyLink.textContent = '복사됨!';
        } catch (e) {
          this.el.lobbyLink.select();
          try { document.execCommand('copy'); this.el.copyLink.textContent = '복사됨!'; } catch (e2) { /* noop */ }
        }
        setTimeout(() => { this.el.copyLink.textContent = '링크 복사'; }, 1800);
      });
    }
    if (this.el.shareLink) {
      this.el.shareLink.addEventListener('click', async () => {
        const link = this.el.lobbyLink.value;
        const text = `DRIFT LEGEND 같이 달리자! 방 코드 ${this.net.room} — ${link}`;
        if (navigator.share) {
          try { await navigator.share({ title: 'DRIFT LEGEND', text, url: link }); } catch (e) { /* 취소 */ }
        } else if (this.el.copyLink) {
          this.el.copyLink.click();
        }
      });
    }
    if (this.el.lobbyStart) this.el.lobbyStart.addEventListener('click', () => this.hostStartRace());
    if (this.el.lobbyLeave) this.el.lobbyLeave.addEventListener('click', () => this.leaveRoom());

    this.updateMenuLabels();
    this.setMode('solo', { silent: true });
  }

  /* ── 모드 · 이름 ──────────────────────────────────── */
  setMode(mode, opts = {}) {
    if (mode !== 'solo' && mode !== 'multi') return;
    this.mode = mode;
    if (this.el.modeSwitch) {
      for (const b of this.el.modeSwitch.children) b.classList.toggle('sel', b.dataset.mode === mode);
    }
    const multi = mode === 'multi';
    if (this.el.menu) this.el.menu.classList.toggle('multi-mode', multi);
    if (this.el.multiPanel) this.el.multiPanel.classList.toggle('hidden', !multi);
    if (this.el.soloActions) this.el.soloActions.classList.toggle('hidden', multi);
    if (!opts.silent && !multi && this.net.room) this.leaveRoom({ backToMenu: true });
    this.updateMenuLabels();
  }

  ensureName() {
    const n = (this.playerName || '').trim();
    if (n) return n;
    this.playerName = '레이서';
    localStorage.setItem('drift.name', this.playerName);
    if (this.el.nameInput) this.el.nameInput.value = this.playerName;
    return this.playerName;
  }

  /* ── 방 만들기 / 들어가기 ─────────────────────────── */
  createRoom() {
    this.ensureName();
    const code = makeRoomCode();
    this.net.createRoom({
      room: code, name: this.playerName, carId: CARS[this.selected].id, color: CARS[this.selected].ui,
    });
    this.net.startHeartbeat();
    this.openLobby();
  }

  joinRoom(code) {
    this.ensureName();
    this.net.joinRoom({
      room: code, name: this.playerName, carId: CARS[this.selected].id, color: CARS[this.selected].ui,
    });
    this.net.startHeartbeat();
    this.openLobby();
  }

  openLobby() {
    this.state = 'lobby';
    this.raceMode = 'solo';
    this.el.menu.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.el.lobby.classList.remove('hidden');
    this.hud.show(false);
    const link = inviteLink(this.net.room, this.course);
    if (this.el.lobbyCode) this.el.lobbyCode.textContent = this.net.room || '----';
    if (this.el.lobbyLink) this.el.lobbyLink.value = link;
    if (this.el.lobbyName) this.el.lobbyName.value = this.playerName || '';
    this.updateLobbyUI();
  }

  closeLobby() {
    this.el.lobby.classList.add('hidden');
  }

  leaveRoom(opts = {}) {
    this.net.leave();
    for (const rc of this.remotes.values()) {
      this.scene.remove(rc.model);
      rc.dispose();
    }
    this.remotes.clear();
    this.remoteList = [];
    this.closeLobby();
    this.state = 'menu';
    this.raceMode = 'solo';
    this.el.pause.classList.add('hidden');
    this.el.result.classList.add('hidden');
    if (this.el.standings) this.el.standings.classList.add('hidden');
    if (this.el.netPill) this.el.netPill.classList.add('hidden');
    if (opts.backToMenu !== false) {
      this.el.menu.classList.remove('hidden');
      this.setMode('solo', { silent: true });
    }
    this.createAI();
    this.resetGrid();
    this.ai.forEach((a) => { a.model.visible = false; });
    this.updateMenuLabels();
  }

  /* ── 네트워크 이벤트 ─────────────────────────────── */
  onNetStatus(state, url) {
    const label = state === 'online' ? '연결됨' : state === 'connecting' ? '연결 중…' : '연결 끊김 · 재시도';
    if (this.el.lobbyStatus) this.el.lobbyStatus.textContent = label;
    if (this.el.lobbyDot) this.el.lobbyDot.className = `net-dot ${state}`;
    if (this.el.netText) {
      this.el.netText.textContent = `${this.net.peerCount}명`;
    }
  }

  onPeers(list) {
    this.renderLobbyPlayers(list);
    if (this.state === 'racing' || this.state === 'countdown') {
      for (const p of list) {
        if (!p.me && this.net.peers.has(p.id)) this.ensureRemote(this.net.peers.get(p.id));
      }
      for (const id of [...this.remotes.keys()]) {
        if (!this.net.peers.has(id)) this.removeRemote(id);
      }
    }
  }

  renderLobbyPlayers(list) {
    if (!this.el.playerList) return;
    this.el.playerList.innerHTML = '';
    for (const p of list) {
      const li = document.createElement('li');
      li.className = 'player-row' + (p.me ? ' me' : '') + (p.online === false ? ' offline' : '');
      const car = CARS.find((c) => c.id === p.car) || CARS[0];
      li.innerHTML = `<i style="background:${p.color || car.ui}"></i>` +
        `<b>${(p.name || '레이서').replace(/[<>&]/g, '')}</b>` +
        `<span>${car.name}</span>` +
        (p.host ? '<em>방장</em>' : '') +
        (p.me ? '<u>나</u>' : '');
      this.el.playerList.appendChild(li);
    }
    if (this.el.lobbyCount) this.el.lobbyCount.textContent = `${list.length}/4`;
  }

  updateLobbyUI() {
    if (!this.net.room) return;
    const host = this.net.host;
    if (this.el.lobbyStart) {
      this.el.lobbyStart.disabled = !host;
      this.el.lobbyStart.style.opacity = host ? '1' : '0.5';
      this.el.lobbyStart.textContent = host ? '레이스 시작' : '방장을 기다리는 중…';
    }
    if (this.el.lobbyCourseNote) {
      this.el.lobbyCourseNote.textContent = host ? '내가 선택' : '방장이 선택';
    }
    if (this.el.lobbyCourses) {
      this.el.lobbyCourses.classList.toggle('locked', !host);
    }
    if (this.el.lobbyHint) {
      this.el.lobbyHint.textContent = host
        ? '초대 링크를 가족에게 보내면 바로 이 방에 들어와요. 들어오면 자동으로 목록에 나타나요.'
        : '방장이 코스를 고르고 레이스 시작을 누르면 같이 출발해요.';
    }
    if (this.el.lobbyStatus) {
      this.el.lobbyStatus.textContent = this.net.connected
        ? (host ? '방장 · 연결됨' : '연결됨')
        : '연결 중…';
    }
    this.buildLobbyCourses();
    this.renderLobbyPlayers([
      { id: this.net.id, name: this.playerName || '레이서', car: CARS[this.selected].id, color: CARS[this.selected].ui, host: this.net.host, me: true, online: true },
      ...[...this.net.peers.values()].map((p) => ({
        id: p.id, name: p.name, car: p.car, color: p.color, host: p.host, me: false, online: p.online !== false,
      })),
    ]);
  }

  buildLobbyCourses() {
    const list = this.el.lobbyCourses;
    if (!list) return;
    list.innerHTML = '';
    for (const key of ['circuit', 'offroad']) {
      const c = COURSES[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'course-card' + (key === this.course ? ' sel' : '');
      b.dataset.course = key;
      b.style.setProperty('--course-accent', key === 'offroad' ? '#ffb347' : '#43e6ff');
      b.innerHTML = `<span class="cc-emoji">${c.emoji}</span>` +
        `<span class="cc-body"><b>${c.label}</b><em>${c.desc}</em></span>`;
      b.addEventListener('click', () => {
        if (!this.net.host) return;
        this.net.requestCourse(key);
        this.setCourse(key);
      });
      list.appendChild(b);
    }
  }

  /* ── 원격 플레이어 ───────────────────────────────── */
  ensureRemote(p) {
    let rc = this.remotes.get(p.id);
    if (rc) return rc;
    rc = new RemoteCar({ id: p.id, name: p.name, carId: p.car, color: p.color });
    this.scene.add(rc.model);
    this.remotes.set(p.id, rc);
    this.remoteList = [...this.remotes.values()];
    this.placeRemoteOnGrid(p.id);
    return rc;
  }

  removeRemote(id) {
    const rc = this.remotes.get(id);
    if (!rc) return;
    this.scene.remove(rc.model);
    rc.dispose();
    this.remotes.delete(id);
    this.remoteList = [...this.remotes.values()];
  }

  onRemoteState(id, m) {
    let rc = this.remotes.get(id);
    if (!rc) {
      const peer = this.net.peers.get(id);
      rc = this.ensureRemote(peer || { id, name: m.name, car: m.car, color: null });
    }
    rc.applyState(m, performance.now() / 1000);
  }

  /* 그리드 슬롯 — 모두 같은 정렬 기준(아이디)을 써서 화면마다 같은 자리를 본다 */
  raceSlot(id) {
    const ids = [this.net.id, ...this.net.peers.keys()].sort();
    const i = ids.indexOf(id);
    return (i < 0 ? ids.length : i) % GRID.length;
  }

  placeRemoteOnGrid(id) {
    const rc = this.remotes.get(id);
    if (!rc) return;
    const slot = GRID[this.raceSlot(id)];
    const p = this.track.placeAt(this.track.length + slot.s, slot.lane);
    rc.pos.set(p.x, 0, p.z);
    rc.yaw = p.yaw;
    rc.model.position.set(p.x, this.track.surfaceAt ? this.track.surfaceAt(this.track.length + slot.s, slot.lane) : 0, p.z);
    rc.model.rotation.set(0, p.yaw, 0);
  }

  onNetStart(m) {
    if (m.course && COURSES[m.course] && m.course !== this.course) this.setCourse(m.course, { silent: true });
    this.beginMultiRace(m.course || this.course);
  }

  onNetCourse(c) {
    if (!COURSES[c] || c === this.course) return;
    this.setCourse(c);
    this.buildLobbyCourses();
  }

  hostStartRace() {
    if (!this.net.host || !this.net.room) return;
    this.ensureName();
    this.net.requestStart(this.course);
    // 초대받은 사람들이 메시지를 받을 시간을 살짝 두고 출발
    setTimeout(() => this.beginMultiRace(this.course), 700);
  }

  /* ── 실제 레이스 ─────────────────────────────────── */
  onAgain() {
    if (this.raceMode === 'multi') {
      this.el.result.classList.add('hidden');
      this.state = 'lobby';
      this.openLobby();
      this.resetGrid();
      this.net.startHeartbeat();
      return;
    }
    this.startRace();
  }

  localState() {
    const p = this.player;
    if (!p) return null;
    return {
      x: Math.round(p.pos.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round(p.pos.z * 100) / 100,
      yaw: Math.round(p.yaw * 1000) / 1000,
      sp: Math.round(p.speed * 100) / 100,
      vl: Math.round(p.vLat * 100) / 100,
      rl: Math.round(p.roll * 1000) / 1000,
      p: Math.round(p.pitch * 1000) / 1000,
      sv: Math.round(p.steerVisual * 100) / 100,
      dr: p.drifting ? 1 : 0,
      bt: Math.round(p.boostTimer * 100) / 100,
      br: p.brake > 0.5 ? 1 : 0,
      rv: p.reversing ? 1 : 0,
      car: p.spec.id,
      name: this.playerName,
      lap: this.lapIndex,
      ps: Math.round(p.progressS * 10) / 10,
      fin: this.state === 'finished' ? 1 : 0,
    };
  }

  /* ── 코스 ─────────────────────────────────────────────── */
  bestKey(id = this.course) { return `drift.best.${id}`; }

  loadBest(id = this.course) {
    let v = Number(localStorage.getItem(this.bestKey(id)) || 0) || 0;
    if (!v && id === 'circuit') v = Number(localStorage.getItem('drift.best') || 0) || 0;
    return v;
  }

  buildCourseCards() {
    const list = this.el.courses;
    if (!list) return;
    list.innerHTML = '';
    for (const key of ['circuit', 'offroad']) {
      const c = COURSES[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'course-card' + (key === this.course ? ' sel' : '');
      b.dataset.course = key;
      b.style.setProperty('--course-accent', key === 'offroad' ? '#ffb347' : '#43e6ff');
      b.innerHTML = `<span class="cc-emoji">${c.emoji}</span>` +
        `<span class="cc-body"><b>${c.label}</b><em>${c.desc}</em></span>`;
      b.addEventListener('click', () => this.setCourse(key));
      list.appendChild(b);
    }
  }

  updateMenuLabels() {
    const spec = this.track.spec;
    if (this.el.tagline) this.el.tagline.textContent = spec.tagline;
    if (this.el.bestLap) {
      this.el.bestLap.textContent = this.bestLap
        ? `베스트 랩 (${spec.label}) ${formatTime(this.bestLap)}`
        : `베스트 랩 (${spec.label}) —`;
    }
    if (this.el.courses) {
      for (const b of this.el.courses.children) {
        b.classList.toggle('sel', b.dataset.course === this.course);
      }
    }
  }

  applyAtmosphere() {
    const off = this.course === 'offroad';
    this.scene.fog.color.set(off ? 0xe6dcc6 : 0xdfe6ea);
    this.scene.fog.density = off ? 0.0030 : 0.0024;
    this.hemi.groundColor.set(off ? 0xb5926a : 0xb59a72);
  }

  /** 코스 교체 — 트랙·차량·AI·지도를 새 코스로 다시 만든다 */
  setCourse(id, opts = {}) {
    if (!COURSES[id] || id === this.course) return;
    this.course = id;
    localStorage.setItem('drift.course', id);

    // 기존 월드 정리
    this.hud.countdown(null);
    for (const a of this.ai) {
      this.scene.remove(a.model);
      this.disposeModel(a.model);
    }
    this.ai = [];
    for (const rc of this.remotes.values()) {
      this.scene.remove(rc.model);
      rc.dispose();
    }
    this.remotes.clear();
    this.remoteList = [];
    if (this.player) {
      this.scene.remove(this.player.model);
      this.disposeModel(this.player.model);
      this.player = null;
      this.flame = null;
    }
    this.track.dispose();

    // 새 코스
    this.track = buildTrack(this.scene, id);
    this.effects.track = this.track;
    this.effects.reset();
    this.hud.setTrack(this.track);
    this.applyAtmosphere();

    this.bestLap = this.loadBest();
    this.selectCar(this.selected);      // 플레이어 재생성 + 그리드 리셋
    this.createAI();
    this.resetGrid();
    this.ai.forEach((a) => { a.model.visible = this.state !== 'menu'; });
    if (this.net.room) {
      for (const p of this.net.peers.values()) this.ensureRemote(p);
    }
    this.updateCamera(0.016);
    this.updateSun();
    this.updateMenuLabels();
    if (this.el.lobbyCourses && this.el.lobby) this.buildLobbyCourses();
    if (this.el.lobbyLink) this.el.lobbyLink.value = inviteLink(this.net.room, this.course);
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
    if (this.net && this.net.room) this.net.updateProfile({ carId: spec.id, color: spec.ui });
  }

  createAI() {
    for (const a of this.ai) {
      this.scene.remove(a.model);
      this.disposeModel(a.model);
    }
    this.ai = [];
    // 멀티플레이에서는 AI 라이벌을 만들지 않는다 — 접속한 사람끼리만 달린다
    if (this.mode === 'multi' || this.raceMode === 'multi') return;
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
    if (this.raceMode === 'multi') {
      const slot = GRID[this.raceSlot(this.net.id)];
      this.player.reset(this.track.length + slot.s, slot.lane);
      this.player.model.position.copy(this.player.pos);
      this.player.model.rotation.set(0, this.player.yaw, 0);
      for (const id of this.remotes.keys()) this.placeRemoteOnGrid(id);
    } else {
      const slot = GRID[PLAYER_SLOT];
      this.player.reset(this.track.length + slot.s, slot.lane);
      this.player.model.position.copy(this.player.pos);
      this.player.model.rotation.set(0, this.player.yaw, 0);
      this.ai.forEach((a, k) => {
        const s = GRID[k];
        a.reset(this.track.length + s.s, s.lane, 0);
      });
    }
    this.lapIndex = 0;
    this.raceTime = 0;
    this.lapStart = 0;
    this.lastLap = 0;
    this.finishedTime = 0;
    this.cp = [false, false, false];
    this.prevS = this.player.progressS;
    this.effects.reset();
  }

  /* ── 화면 전환 ───────────────────────────────────────── */
  toMenu() {
    if (this.raceMode === 'multi' && this.net.room) {
      this.leaveRoom({ backToMenu: true });
      return;
    }
    this.raceMode = 'solo';
    this.state = 'menu';
    this.manual = false;
    this.input.reset();
    this.createAI();
    this.resetGrid();
    this.ai.forEach((a) => { a.model.visible = false; });
    this.hud.show(false);
    this.hud.countdown(null);
    if (this.el.standings) this.el.standings.classList.add('hidden');
    if (this.el.netPill) this.el.netPill.classList.add('hidden');
    this.closeLobby();
    this.el.menu.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.updateMenuLabels();
    this.sfx.update({ active: false });
  }

  startRace() {
    this.raceMode = 'solo';
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

  /** 멀티플레이 레이스 시작 (방장 신호 또는 내가 시작) */
  beginMultiRace(course) {
    if (!this.net.room) return;
    if (course && COURSES[course] && course !== this.course) this.setCourse(course, { silent: true });
    this.raceMode = 'multi';
    this.createAI();                    // AI 0대
    this.remoteList = [...this.remotes.values()];
    this.resetGrid();
    this.finishedTime = 0;
    this.sfx.init();
    this.sfx.resume();
    this.state = 'countdown';
    this.countdownT = 3.65;
    this.lastCount = 4;
    this.closeLobby();
    this.el.menu.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.hud.show(true);
    this.hud.setLap(1, TOTAL_LAPS);
    this.hud.setPos(this.net.peerCount, this.net.peerCount);
    this.hud.setTime(0);
    this.hud.setBest(this.bestLap);
    if (this.el.netPill) {
      this.el.netPill.classList.remove('hidden');
      if (this.el.netText) this.el.netText.textContent = `${this.net.peerCount}명`;
    }
    this.camPos.set(
      this.player.pos.x - Math.sin(this.player.yaw) * 9,
      4.2,
      this.player.pos.z - Math.cos(this.player.yaw) * 9
    );
    this.camLook.copy(this.player.pos);
    // 상태 전송 시작 (16Hz)
    this.net.startSyncing(() => (this.state === 'racing' || this.state === 'countdown' || this.state === 'finished' || this.state === 'paused'
      ? this.localState() : null));
    clearInterval(this.net.hbTimer);
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
    this.finishedTime = this.raceTime || 0.001;
    const total = this.racers().length;
    if (this.raceMode === 'multi' && this.net.room) {
      this.net.reportFinish(this.finishedTime, TOTAL_LAPS, this.playerName);
    }
    const rank = this.rankOf(this.player);
    const rt = this.raceTime;
    document.getElementById('result-title').textContent = rank === 1 ? 'WINNER' : 'FINISH';
    document.getElementById('r-pos').textContent = `${rank}위 / ${total}`;
    document.getElementById('r-total').textContent = formatTime(rt);
    document.getElementById('r-best').textContent = this.bestLap ? formatTime(this.bestLap) : '--:--.--';
    document.getElementById('r-speed').textContent = `${Math.round(this.player.topSpeed)} km/h`;
    this.el.result.classList.remove('hidden');
    this.hud.countdown(null);
    this.sfx.update({ active: false });
    this.sfx.blip(660, 0.2);
    setTimeout(() => this.sfx.blip(880, 0.3), 160);
    this.renderResultStandings();
  }

  racers() {
    return [this.player, ...this.ai, ...this.remoteList].filter(Boolean);
  }

  /** 결과 화면 순위표 — 멀티에서는 다른 사람 도착 기록이 올 때마다 갱신된다 */
  renderResultStandings() {
    const box = this.el.resultStandings;
    if (!box) return;
    const rows = this.standings();
    box.innerHTML = rows.map((r, i) => {
      const time = r.fin ? formatTime(r.fin) : (r.me && this.state === 'finished' ? '—' : '주행 중…');
      return `<div class="rs-row${r.me ? ' me' : ''}">` +
        `<b>${i + 1}</b><i style="background:${r.color}"></i>` +
        `<span>${String(r.name || '레이서').replace(/[<>&]/g, '')}</span>` +
        `<em>${time}</em></div>`;
    }).join('');
  }

  /* ── 매 프레임 ──────────────────────────────────────── */
  step(dt) {
    if (this.state === 'menu' || this.state === 'lobby') {
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
      if (this.raceMode === 'multi') this.updateRemotes(dt);
      this.effects.update(dt * 0.25);
      this.sfx.update({ active: false });
      return;
    }

    if (this.state === 'countdown') {
      this.countdownT -= dt;
      if (this.raceMode === 'multi') this.updateRemotes(dt);
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
    if (this.raceMode === 'multi') this.updateRemotes(dt);
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
      } else if (ev.type === 'obstacle') {
        // 바위·통나무·상자 — 파편과 먼지, 차체 흔들림
        this.effects.debris(ev.x, 0.7, ev.z, ev.power, ev.kind);
        this.effects.crashSpark(ev.x, 0.6, ev.z, Math.min(2.4, ev.power * 0.2));
        this.shake = Math.max(this.shake, Math.min(1.0, 0.2 + ev.power * 0.05));
        if (!this.wallSoundLock) {
          this.sfx.crash();
          this.wallSoundLock = true;
          setTimeout(() => { this.wallSoundLock = false; }, 220);
        }
        if (ev.power > 3.5) this.hud.toast('장애물 충돌!', 900, '#ff8b3d');
      } else if (ev.type === 'jump') {
        this.effects.landing(ev.x, this.player.y, ev.z, 0.6);
        this.sfx.blip(420, 0.12, 'square', 0.05);
        this.hud.toast('JUMP!', 700, '#ffd166');
      } else if (ev.type === 'land') {
        this.effects.landing(ev.x, this.player.y, ev.z, ev.power * 0.5);
        this.effects.dust(ev.x, ev.z, 0, 0);
        this.shake = Math.max(this.shake, Math.min(0.7, ev.power * 0.06));
        this.sfx.blip(150, 0.16, 'sine', 0.07);
      }
    }

    const others = this.ai.map((a) => ({ s: a.s, lane: a.lane }));
    others.push({ s: this.player.progressS, lane: this.player.lat });
    for (const a of this.ai) a.update(dt, others, true);

    // 차량끼리 충돌 (밀어내기·반발·속도 손실·스파크)
    const carsAll = [this.player, ...this.ai, ...this.remoteList];
    this.resolveCarContacts(carsAll);
    if (this.raceMode === 'multi') this.resolveRemoteContacts();

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
          localStorage.setItem(this.bestKey(), String(this.bestLap));
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
    // 진흙 웅덩이 — 바퀴에서 진흙이 튄다
    if (this.player.inMud) {
      this.player.mudSplash = Math.min(6, (this.player.mudSplash || 0) + dt * 40);
      while (this.player.mudSplash > 1) {
        this.player.mudSplash -= 1;
        const w = this.player.rearWheelWorld(Math.random() < 0.5 ? 1 : -1);
        this.effects.mudSplash(w.x, w.z, this.player.vel.x, this.player.vel.z);
      }
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
    this.hud.setPos(this.rankOf(this.player), Math.max(2, carsAll.length));
    this.hud.setGear(this.player.reversing, this.player.brake > 0.5);
    this.hud.update(dt, carsAll, 0);
    this.standingsAt += dt;
    if (this.standingsAt > 0.26) {
      this.standingsAt = 0;
      this.hud.setStandings(this.standings());
    }

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
        if (vn < -0.35) {
          const impact = -vn;
          // 반발 계수를 높이고 양쪽 모두에 뜨겁게 튕겨나는 넉백 임펄스를 준다.
          //  (플레이어는 applyImpulse 에서 '그립에 먹히지 않는' 넉백 성분까지 받는다)
          const e = 0.78;
          const jimp = clamp((1 + e) * impact * 0.5, 0, 14);
          if (A.applyImpulse) A.applyImpulse(-best.nx * jimp, -best.nz * jimp);
          else { A.vel.x -= best.nx * jimp; A.vel.z -= best.nz * jimp; }
          if (B.applyImpulse) B.applyImpulse(best.nx * jimp, best.nz * jimp);
          else { B.vel.x += best.nx * jimp; B.vel.z += best.nz * jimp; }
          // 충돌 직후 위치도 살짝 벌려 — '붙어서 밀기'가 아니라 '튕김'으로 보이게
          const pop = Math.min(0.6, impact * 0.05);
          A.pos.x -= best.nx * pop; A.pos.z -= best.nz * pop;
          B.pos.x += best.nx * pop; B.pos.z += best.nz * pop;
          if (A.shove) A.shove(-best.nx * pop, -best.nz * pop);
          if (B.shove) B.shove(best.nx * pop, best.nz * pop);
          if (impact > 1.4) {
            this.impacts++;
            this.effects.crashSpark(best.x, 0.55, best.z, Math.min(3.4, impact * 0.18));
            this.shake = Math.max(this.shake, Math.min(1.05, 0.18 + impact * 0.05));
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

  /* ── 순위 · 스탠딩 ───────────────────────── */
  rowOf(car, kind, name, lap, s, fin) {
    return {
      car, kind, name,
      fin: fin || 0,
      dist: (lap | 0) * this.track.length + (s || 0),
      color: (car.spec && car.spec.ui) || '#ffffff',
      me: kind === 'me',
    };
  }

  standings() {
    const rows = [this.rowOf(this.player, 'me', this.playerName || '나', this.lapIndex, this.player.progressS, this.finishedTime)];
    for (const a of this.ai) rows.push(this.rowOf(a, 'ai', a.spec.name, a.lapIndex, a.s, 0));
    for (const rc of this.remoteList) rows.push(this.rowOf(rc, 'net', rc.name, rc.lapIndex, rc.progressS, rc.finishTime || 0));
    rows.sort((a, b) => {
      if (a.fin && b.fin) return a.fin - b.fin;
      if (a.fin) return -1;
      if (b.fin) return 1;
      return b.dist - a.dist;
    });
    return rows;
  }

  rankOf(car) {
    const rows = this.standings();
    const i = rows.findIndex((r) => r.car === car);
    return i < 0 ? 1 : i + 1;
  }

  /* ── 원격 차량 갱신 · 접촉 ─────────────────── */
  updateRemotes(dt) {
    if (!this.remotes.size) return;
    const now = performance.now() / 1000;
    for (const rc of this.remotes.values()) rc.update(dt, now, this.track);
  }

  resolveRemoteContacts() {
    for (const rc of this.remotes.values()) {
      const dx = this.player.pos.x - rc.pos.x;
      const dz = this.player.pos.z - rc.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 2.6;
      if (d >= min || d < 1e-3) continue;
      const nx = dx / d, nz = dz / d;
      this.player.pos.x += nx * (min - d);
      this.player.pos.z += nz * (min - d);
      const vn = this.player.vel.x * nx + this.player.vel.z * nz;
      if (vn < -0.6) {
        const imp = -vn;
        this.player.applyImpulse(nx * imp * 0.85, nz * imp * 0.85);
        this.contacts++;
        if (imp > 1.4) {
          this.impacts++;
          this.effects.crashSpark((this.player.pos.x + rc.pos.x) * 0.5, 0.55, (this.player.pos.z + rc.pos.z) * 0.5, Math.min(3, imp * 0.16));
          this.shake = Math.max(this.shake, Math.min(0.9, 0.15 + imp * 0.05));
          if (imp > 2.6 && !this.carCrashLock) {
            this.sfx.crash();
            this.carCrashLock = true;
            setTimeout(() => { this.carCrashLock = false; }, 220);
          }
        }
      }
    }
  }

  rankOfOld(car) {
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
    const portrait = this.camera.aspect < 1;
    // 주행 중에는 카메라가 '차 머리'가 아니라 '실제 진행 방향(속도 벡터)'을 축으로 따라간다.
    //  차 머리를 100% 따라가면 코너를 돌 때 카메라가 차와 함께 제자리에서 돌아
    //  화면상 차가 옆으로 가지 않고 팽이처럼 회전하는 것처럼 보인다.
    let dir = { x: fwd.x, z: fwd.z };
    let travel = null;
    if (speed > 4 && car.speed > 1) {          // 후진 중에는 차 머리 기준 유지
      const vx = car.vel.x / speed, vz = car.vel.z / speed;
      travel = { x: vx, z: vz };
      // 드리프트 때 속도 벡터를 84% 따라가면 차체가 화면 옆으로 흘러 '옆으로 가는' 것처럼 보인다.
      //  40% 선으로 낮춰 카메라가 코너 정면을 안정적으로 잡고 차는 진행 방향을 향해 감아 돈다.
      const w = car.drifting ? (portrait ? 0.44 : 0.4) : 0.65;
      dir.x = lerp(fwd.x, vx, w);
      dir.z = lerp(fwd.z, vz, w);
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

    // 시선도 진행 방향 위주 + 차 머리 일부 — 차체가 화면에서 비스듬히 흐른다
    const aheadLen = car.drifting ? (portrait ? 5.6 + speed * 0.05 : 7 + speed * 0.09) : 7 + speed * 0.09;
    const lw = travel ? (car.drifting ? 0.42 : 0.5) : 0;
    const lookDir = travel
      ? { x: lerp(fwd.x, travel.x, lw), z: lerp(fwd.z, travel.z, lw) }
      : fwd;
    const ll = Math.hypot(lookDir.x, lookDir.z) || 1;
    const lookAt = new THREE.Vector3(
      car.pos.x + (lookDir.x / ll) * aheadLen,
      1.15,
      car.pos.z + (lookDir.z / ll) * aheadLen
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
    // 태양은 플레이어를 중심으로 낮은 고도에서 비스듬히 — 아침 그림자가 길게 누운다
    this.sun.position.set(
      c.x + this.sunDir.x * 150,
      this.sunDir.y * 150,
      c.z + this.sunDir.z * 150
    );
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
  standings: () => game.standings().map((r) => ({ name: r.name, me: r.me, dist: Math.round(r.dist), fin: r.fin })),
  multi: {
    create: (name) => {
      game.setMode('multi', { silent: true });
      game.playerName = name || game.ensureName();
      game.createRoom();
      return game.net.room;
    },
    join: (code, name) => {
      game.setMode('multi', { silent: true });
      game.playerName = name || game.ensureName();
      game.joinRoom(code);
      return code;
    },
    leave: () => game.leaveRoom({ backToMenu: true }),
    start: () => game.hostStartRace(),
    status: () => ({
      room: game.net.room,
      host: game.net.host,
      connected: game.net.connected,
      broker: game.net.sock && game.net.sock.url,
      peerCount: game.net.peerCount,
      peers: [...game.net.peers.values()].map((p) => ({ id: p.id, name: p.name, car: p.car, host: p.host })),
      mode: game.mode,
      raceMode: game.raceMode,
      state: game.state,
    }),
    lobby: () => ({
      open: !game.el.lobby.classList.contains('hidden'),
      code: game.el.lobbyCode && game.el.lobbyCode.textContent,
      players: game.el.playerList ? game.el.playerList.innerText : '',
      link: game.el.lobbyLink ? game.el.lobbyLink.value : '',
    }),
    remotes: () => [...game.remotes.values()].map((rc) => ({
      id: rc.id, name: rc.name,
      pos: [Math.round(rc.pos.x), Math.round(rc.pos.z)],
      model: [Math.round(rc.model.position.x), Math.round(rc.model.position.z)],
      y: Math.round(rc.y * 100) / 100,
      lap: rc.lapIndex, ps: Math.round(rc.progressS), visible: rc.model.visible,
    })),
    aiCount: () => game.ai.length,
    hudPlayers: () => game.hud.setStandings && game.standings().length,
  },
  state: () => ({
    state: game.state,
    course: game.course,
    courseLength: game.track.length,
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
  setCourse: (id) => game.setCourse(id),
  course: () => game.course,
  start: () => game.startRace(),
  input: (o) => { game.debugInput = o; },
  manual: (v) => { game.manual = v; },
  // 검증용 — 렌더 루프를 멈추고 필요할 때 한 프레임만 그린다
  freeze: () => { cancelAnimationFrame(game.raf); game.raf = 0; },
  resume: () => { if (!game.raf) { game.last = performance.now(); game.raf = requestAnimationFrame(game.loop); } },
  render: () => { game.renderer.render(game.scene, game.camera); },
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

    // 2) 드리프트 — 옆으로 밀리지 않고 차가 도는 방향으로 깔끔하게 돈다
    g.debugInput = { steer: 0.42, drift: true, boost: false, brake: false };
    let sawDrift = false, maxDriftT = 0, maxLevel = 0;
    const yaw0 = g.player.yaw;
    let yawTurn = 0, maxLat = 0;
    let prevYaw = g.player.yaw;
    for (let i = 0; i < 90; i++) {
      window.__drift.tick(1);
      if (g.player.drifting) sawDrift = true;
      maxDriftT = Math.max(maxDriftT, g.player.driftTime);
      maxLevel = Math.max(maxLevel, g.player.driftLevel);
      maxLat = Math.max(maxLat, Math.abs(g.player.vLat));
      let dy = g.player.yaw - prevYaw;
      dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      yawTurn += Math.abs(dy);
      prevYaw = g.player.yaw;
    }
    st = window.__drift.state();
    push('드리프트 진입', sawDrift && maxLevel >= 1, `driftTime=${maxDriftT.toFixed(2)} level=${maxLevel}`);
    push('스키드마크', st.skids > 0, `quads=${st.skids}`);
    push('연기 파티클', st.smoke > 0, `particles=${st.smoke}`);
    push('드리프트 선회(차가 돈다)', yawTurn > 0.45, `회전=${(yawTurn * 180 / Math.PI).toFixed(0)}°`);
    push('횡이탈 없음(옆으로 안 밀림)', maxLat < 2.8, `최대 횡속도=${maxLat.toFixed(2)}m/s (${(Math.atan2(maxLat, Math.max(8, Math.abs(g.player.speed))) * 180 / Math.PI).toFixed(1)}°)`);

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
