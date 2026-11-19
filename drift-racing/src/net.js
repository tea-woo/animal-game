// 가족 실시간 멀티플레이 — 별도 서버 없이 공개 MQTT(WSS) 브로커로 방 코드 하나에 모인다.
//  · 정적 GitHub Pages 에서도 iPhone Safari(LTE/5G/Wi-Fi, NAT 무관)끼리 붙도록
//    WebSocket 위의 MQTT 3.1.1 을 직접 구현했다 (외부 라이브러리 0).
//  · 방 코드(4자리) = 토픽 이름. 메시지는 JSON. 위치는 16Hz 로 보내고 받는 쪽은 보간한다.
import THREE from './three.js?v=20261119a';
import { CARS, buildCar, updateCarVisual, applyBodyAttitude } from './carModel.js?v=20261119a';
import { clamp } from './util.js?v=20261119a';

/* ── 브로커 후보 (앞에서부터 시도, 실패하면 다음으로) ────────── */
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const TOPIC_ROOT = 'driftlegend/v2/room/';

const enc = new TextEncoder();
const dec = new TextDecoder();

function mqttLen(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}
function mqttStr(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
}

/* ── 최소 MQTT 3.1.1 클라이언트 ────────────────────────────── */
export class MqttSocket {
  constructor(url, opts = {}) {
    this.url = url;
    this.clientId = opts.clientId || `dl_${Math.random().toString(36).slice(2, 10)}`;
    this.onConnect = opts.onConnect || (() => {});
    this.onMessage = opts.onMessage || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.onError = opts.onError || (() => {});
    this.buf = new Uint8Array(0);
    this.ws = null;
    this.closed = false;
    this.subs = new Set();
    this.pingTimer = 0;
    this._open();
  }

  _open() {
    let ws;
    try {
      ws = new WebSocket(this.url, 'mqtt');
    } catch (e) {
      this.onError(e);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => this._sendConnect();
    ws.onmessage = (ev) => this._onData(ev);
    ws.onerror = (e) => this.onError(e);
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.ws = null;
      if (!this.closed) this.onClose();
    };
  }

  _send(bytes) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(new Uint8Array(bytes));
  }

  _sendConnect() {
    const flags = 0x02;                       // clean session
    const body = [
      ...mqttStr('MQTT'), 4, flags, 0, 45,     // protocol level / flags / keepalive(45s)
      ...mqttStr(this.clientId),
    ];
    this._send([0x10, ...mqttLen(body.length), ...body]);
  }

  _onData(ev) {
    const chunk = new Uint8Array(ev.data);
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    for (;;) {
      if (this.buf.length < 2) break;
      let mult = 1, len = 0, i = 1, done = false;
      for (; i < this.buf.length; i++) {
        const b = this.buf[i];
        len += (b & 127) * mult;
        mult *= 128;
        if ((b & 128) === 0) { done = true; i++; break; }
        if (i > 5) break;
      }
      if (!done) break;
      if (this.buf.length < i + len) break;
      const type = this.buf[0] >> 4;
      const body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);
      this._handle(type, body);
    }
  }

  _handle(type, body) {
    if (type === 2) {                          // CONNACK
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this._send([0xc0, 0]), 22000);
      for (const t of this.subs) this._subscribe(t);
      this.onConnect();
    } else if (type === 3) {                   // PUBLISH (QoS 0)
      if (body.length < 2) return;
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.slice(2, 2 + tlen));
      const payload = dec.decode(body.slice(2 + tlen));
      this.onMessage(topic, payload);
    }
  }

  _subscribe(topic) {
    const body = [0x00, 0x0a, ...mqttStr(topic), 0];   // packet id 10, QoS 0
    this._send([0x82, ...mqttLen(body.length), ...body]);
  }

  subscribe(topic) {
    this.subs.add(topic);
    if (this.ws && this.ws.readyState === 1) this._subscribe(topic);
  }

  publish(topic, text) {
    const body = [...mqttStr(topic), ...enc.encode(text)];
    this._send([0x30, ...mqttLen(body.length), ...body]);
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    try { this._send([0xe0, 0]); } catch (e) { /* noop */ }
    try { this.ws && this.ws.close(); } catch (e) { /* noop */ }
    this.ws = null;
  }
}

/* ── 방 코드 · 이름표 ──────────────────────────────────── */
export function makeRoomCode() {
  // 헷갈리는 글자(0/O, 1/I)를 뺀 4자리 숫자 코드
  let s = '';
  for (let i = 0; i < 4; i++) s += String(Math.floor(Math.random() * 10));
  return s;
}
export function roomFromUrl() {
  try {
    const u = new URL(window.location.href);
    const r = (u.searchParams.get('room') || '').trim();
    return /^\d{4}$/.test(r) ? r : null;
  } catch (e) { return null; }
}
export function courseFromUrl() {
  try {
    const c = new URL(window.location.href).searchParams.get('course');
    return c === 'offroad' || c === 'circuit' ? c : null;
  } catch (e) { return null; }
}
export function inviteLink(code, course) {
  const u = new URL(window.location.href);
  u.search = `?room=${code}${course ? `&course=${course}` : ''}`;
  u.hash = '';
  return u.toString();
}

/* ── 원격 플레이어 차량 (수신 스냅샷 보간) ────────────────── */
function makeNamePlate(name, color) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 80;
  const g = c.getContext('2d');
  const label = String(name || 'RACER').slice(0, 12);
  g.font = 'bold 34px -apple-system, system-ui, sans-serif';
  const w = Math.min(300, g.measureText(label).width + 38);
  g.fillStyle = 'rgba(8, 12, 20, 0.72)';
  const x0 = (320 - w) / 2;
  const r = 16;
  g.beginPath();
  g.moveTo(x0 + r, 14); g.lineTo(x0 + w - r, 14);
  g.quadraticCurveTo(x0 + w, 14, x0 + w, 14 + r);
  g.lineTo(x0 + w, 58 - r); g.quadraticCurveTo(x0 + w, 58, x0 + w - r, 58);
  g.lineTo(x0 + r, 58); g.quadraticCurveTo(x0, 58, x0, 58 - r);
  g.lineTo(x0, 14 + r); g.quadraticCurveTo(x0, 14, x0 + r, 14);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(x0 + 12, 35, 4, 20);
  g.fillStyle = color || '#bfe9ff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 160, 37);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(4.4, 1.1, 1);
  spr.position.set(0, 2.7, 0);
  return spr;
}

export class RemoteCar {
  constructor({ id, name, carId, color }) {
    this.id = id;
    this.netId = id;
    this.name = name || 'RACER';
    this.finishTime = 0;
    const base = CARS.find((c) => c.id === carId) || CARS[0];
    this.spec = { ...base, color: color || base.color, ui: color || base.ui };
    this.model = buildCar(this.spec);
    this.model.visible = true;
    this.plate = makeNamePlate(this.name, this.spec.ui);
    this.model.add(this.plate);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.y = 0;
    this.roll = 0;
    this.pitch = 0;
    this.speed = 0;
    this.vLat = 0;
    this.vel = { x: 0, z: 0 };
    this.drifting = false;
    this.brake = 0;
    this.steerVisual = 0;
    this.boostTimer = 0;
    this.reversing = false;
    this.lapIndex = 0;
    this.progressS = 0;
    this.finished = false;
    this.snaps = [];
    this.lastSeen = 0;
    this.online = true;
  }

  applyState(m, now) {
    this.lastSeen = now;
    this.online = true;
    this.snaps.push({ t: now, m });
    if (this.snaps.length > 8) this.snaps.shift();
    this.lapIndex = m.lap | 0;
    this.progressS = m.ps || 0;
    // m.fin 은 완주 기록(초) — 0/없음이면 아직 주행 중
    this.finishTime = m.fin || 0;
    this.finished = !!m.fin;
    this.speed = m.sp || 0;
    this.vLat = m.vl || 0;
    this.drifting = !!m.dr;
    this.brake = m.br || 0;
    this.steerVisual = m.sv || 0;
    this.boostTimer = m.bt || 0;
    this.reversing = !!m.rv;
  }

  /** 120ms 지연 재생으로 부드럽게 보간 */
  update(dt, now, track) {
    const DELAY = 0.13;
    const trs = this.snaps;
    if (!trs.length) return;
    const target = now - DELAY;
    let a = trs[0], b = null;
    for (let i = 0; i < trs.length; i++) {
      if (trs[i].t <= target) a = trs[i];
      if (trs[i].t > target) { b = trs[i]; break; }
    }
    let x, z, y, yaw, roll, pitch;
    if (b && a && b.t > a.t) {
      const k = clamp((target - a.t) / (b.t - a.t), 0, 1);
      x = a.m.x + (b.m.x - a.m.x) * k;
      z = a.m.z + (b.m.z - a.m.z) * k;
      y = (a.m.y || 0) + ((b.m.y || 0) - (a.m.y || 0)) * k;
      let dy = (b.m.yaw - a.m.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      yaw = a.m.yaw + dy * k;
      roll = (a.m.rl || 0) + ((b.m.rl || 0) - (a.m.rl || 0)) * k;
      pitch = (a.m.p || 0) + ((b.m.p || 0) - (a.m.p || 0)) * k;
    } else {
      // 마지막 스냅샷 이후 — 짧게 예측 주행
      const last = trs[trs.length - 1];
      const over = Math.min(0.3, Math.max(0, now - last.t - DELAY));
      const m = last.m;
      const sp = m.sp || 0;
      x = m.x + Math.sin(m.yaw) * sp * over;
      z = m.z + Math.cos(m.yaw) * sp * over;
      y = m.y || 0;
      yaw = m.yaw;
      roll = m.rl || 0;
      pitch = m.p || 0;
    }
    // 위치가 크게 튀면(코스 이동·재접속) 즉시 스냅
    if (Math.hypot(x - this.pos.x, z - this.pos.z) > 60) {
      this.pos.set(x, 0, z);
    }
    this.pos.x = x;
    this.pos.z = z;
    this.y = y || 0;
    this.yaw = yaw;
    this.roll = roll;
    this.pitch = pitch;
    this.vel.x = Math.sin(yaw) * this.speed;
    this.vel.z = Math.cos(yaw) * this.speed;
    this.model.position.set(x, y || 0, z);
    this.model.rotation.set(0, yaw, 0);
    applyBodyAttitude(this.model, this.roll, this.pitch);
    updateCarVisual(this, dt);
    if (this.plate) this.plate.visible = this.online;
  }

  dispose() {
    this.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }
}

/* ── 방 세션 ───────────────────────────────────────────── */
export class Net {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.id = Math.random().toString(36).slice(2, 8);
    this.room = null;
    this.name = '';
    this.carId = CARS[0].id;
    this.color = CARS[0].ui;
    this.host = false;
    this.connected = false;
    this.joinedAt = Date.now();
    this.sock = null;
    this.brokerIdx = 0;
    this.peers = new Map();
    this.remote = new Map();     // id -> RemoteCar
    this.sendTimer = 0;
    this.hbTimer = 0;
    this.pruneTimer = 0;
    this.wantState = null;       // () => state object or null
    this.latency = 0;
    this.lastRecv = 0;
    this.finishes = [];
    this.reconnectT = 0;
    this.reconnectTimer = 0;
    this.running = false;
    this.soloTest = false;
  }

  get topic() { return TOPIC_ROOT + this.room; }

  get peerCount() { return this.peers.size + 1; }

  connect() {
    this.running = true;
    this._openBroker(this.brokerIdx);
  }

  _openBroker(i) {
    if (!this.running) return;
    this.brokerIdx = i % BROKERS.length;
    const url = BROKERS[this.brokerIdx];
    this._status('connecting', url);
    if (this.sock) { try { this.sock.close(); } catch (e) { /* noop */ } }
    this.sock = null;
    const sock = new MqttSocket(url, {
      clientId: `drift_${this.room}_${this.id}`,
      onConnect: () => {
        if (this.sock !== sock) return;
        this.connected = true;
        this.reconnectT = 0;
        this.reconnectTimer = 0;
        this._status('online', url);
        this._sendHello();
        this.sock.subscribe(`${this.topic}/#`);
        this._emitPeers();
      },
      onMessage: (topic, text) => { if (this.sock === sock) this._onMessage(topic, text); },
      onClose: () => {
        if (this.sock !== sock) return;
        this.connected = false;
        this._status('offline', url);
        this._scheduleReconnect();
      },
      onError: () => {},
    });
    this.sock = sock;
    // 10초 안에 붙지 못하면 다음 브로커로
    setTimeout(() => {
      if (this.sock === sock && !this.connected && this.running) {
        try { sock.close(); } catch (e) { /* noop */ }
        this._openBroker(this.brokerIdx + 1);
      }
    }, 9000);
  }

  _scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    const delay = Math.min(8000, 800 * Math.pow(1.6, this.reconnectT++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = 0;
      if (!this.running) return;
      this._openBroker(this.brokerIdx);
    }, delay);
  }

  _status(s, url) {
    if (this.hooks.onStatus) this.hooks.onStatus(s, url, this.latency);
  }

  /** 방 만들기 */
  createRoom({ room, name, carId, color }) {
    if (this.running) this.leave();
    this.room = room || makeRoomCode();
    this.name = name;
    this.carId = carId;
    this.color = color;
    this.host = true;
    this.joinedAt = Date.now();
    this.peers.clear();
    this.connect();
    return this.room;
  }

  /** 방 코드로 들어가기 */
  joinRoom({ room, name, carId, color }) {
    if (this.running) this.leave();
    this.room = room;
    this.name = name;
    this.carId = carId;
    this.color = color;
    this.host = false;
    this.joinedAt = Date.now();
    this.peers.clear();
    this.connect();
    return this.room;
  }

  leave() {
    this.running = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = 0; }
    clearInterval(this.sendTimer);
    clearInterval(this.hbTimer);
    clearInterval(this.pruneTimer);
    this.sendTimer = this.hbTimer = this.pruneTimer = 0;
    if (this.sock) {
      try { this._publish({ t: 'bye' }); } catch (e) { /* noop */ }
      this.sock.close();
    }
    this.sock = null;
    this.connected = false;
    this.peers.clear();
    this.remote.forEach((r) => r.dispose());
    this.remote.clear();
    this.room = null;
  }

  _publish(obj) {
    if (this.sock && this.connected && this.room) {
      this.sock.publish(`${this.topic}/${this.id}`, JSON.stringify(obj));
    }
  }

  _sendHello() {
    this._publish({
      t: 'hi', id: this.id, name: this.name, car: this.carId, color: this.color,
      host: this.host, at: this.joinedAt,
    });
  }

  /** 대기실 → 레이스: 상태 전송 시작 */
  startSyncing(getState) {
    this.wantState = getState;
    clearInterval(this.sendTimer);
    // 16Hz
    this.sendTimer = setInterval(() => {
      if (!this.connected) return;
      const st = this.wantState && this.wantState();
      if (st) this._publish({ t: 's', ...st });
    }, 62);
  }

  startHeartbeat() {
    clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      if (!this.connected) return;
      this._sendHello();
    }, 1500);
    clearInterval(this.pruneTimer);
    this.pruneTimer = setInterval(() => this._prune(), 1200);
  }

  _prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > 6000) {
        this.peers.delete(id);
        changed = true;
        if (p.host) this._promoteHost();
      } else if (p.online === false) {
        p.online = true;
        changed = true;
      }
    }
    if (changed) this._emitPeers();
  }

  _promoteHost() {
    let best = { id: this.id, at: this.joinedAt };
    for (const [id, p] of this.peers) {
      if (p.at && p.at < best.at) best = { id, at: p.at };
    }
    const meHost = best.id === this.id;
    if (meHost !== this.host) {
      this.host = meHost;
      this._sendHello();
      if (this.hooks.onHost) this.hooks.onHost(this.host);
    }
    this._emitPeers();
  }

  _emitPeers() {
    const list = [];
    list.push({ id: this.id, name: this.name, car: this.carId, color: this.color, host: this.host, me: true, online: true });
    for (const [id, p] of this.peers) {
      list.push({ id, name: p.name, car: p.car, color: p.color, host: p.host, me: false, online: p.online !== false });
    }
    list.sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0));
    if (this.hooks.onPeers) this.hooks.onPeers(list);
  }

  _onMessage(topic, text) {
    if (!topic.startsWith(this.topic + '/')) return;
    const from = topic.slice(this.topic.length + 1);
    if (from === this.id) return;
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const now = Date.now();
    this.lastRecv = now;

    if (m.t === 'hi' || m.t === 's') {
      let p = this.peers.get(from);
      if (!p) {
        p = { id: from, name: m.name || 'RACER', car: m.car || 'gt', color: m.color, host: !!m.host, at: m.at || now, lastSeen: now, online: true };
        this.peers.set(from, p);
        this._emitPeers();
        if (this.hooks.onJoin) this.hooks.onJoin(p);
        // 새로 들어온 사람에게 내 정보를 즉시 알려 준다
        this._sendHello();
      }
      if (m.t === 'hi') {
        p.name = m.name || p.name;
        p.car = m.car || p.car;
        p.color = m.color || p.color;
        if (m.host && !p.host) { p.host = true; this.host = false; }
        if (!m.host && p.host && from !== this.id) { /* 상대가 양보 */ }
      }
      p.lastSeen = now;
      if (m.t === 'hi') this._emitPeers();
      if (m.t === 's' && this.hooks.onState) this.hooks.onState(from, m, now);
    } else if (m.t === 'bye') {
      const p = this.peers.get(from);
      this.peers.delete(from);
      if (p && p.host) this._promoteHost();
      this._emitPeers();
      if (this.hooks.onLeave) this.hooks.onLeave(from);
    } else if (m.t === 'course') {
      if (this.hooks.onCourse) this.hooks.onCourse(m.course);
    } else if (m.t === 'start') {
      if (this.hooks.onStart) this.hooks.onStart(m);
    } else if (m.t === 'fin') {
      this.finishes.push({ id: from, name: m.name, time: m.time, at: now });
      if (this.hooks.onFinish) this.hooks.onFinish(from, m);
    } else if (m.t === 'ping') {
      this._publish({ t: 'pong', c: m.c });
    } else if (m.t === 'pong') {
      this.latency = Math.max(0, Math.min(3000, now - m.c));
      this._status(this.connected ? 'online' : 'offline', null);
    }
  }

  ping() {
    this._publish({ t: 'ping', c: Date.now() });
  }

  updateProfile({ name, carId, color }) {
    if (name !== undefined) this.name = name;
    if (carId !== undefined) this.carId = carId;
    if (color !== undefined) this.color = color;
    if (this.room) this._sendHello();
  }

  requestCourse(course) {
    this._publish({ t: 'course', course });
  }

  requestStart(course) {
    this._publish({ t: 'start', course, at: Date.now() });
  }

  reportFinish(time, laps, name) {
    this._publish({ t: 'fin', time, laps, name });
  }
}
