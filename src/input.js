// 입력 — 키보드, 마우스, 터치(조이스틱/버튼)
const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
  KeyJ: 'attack',
  KeyK: 'skill1', Digit1: 'skill1', Numpad1: 'skill1',
  KeyL: 'skill2', Digit2: 'skill2', Numpad2: 'skill2',
  Escape: 'pause',
};

const TRIGGERS = new Set(['jump', 'attack', 'skill1', 'skill2', 'pause']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.press = new Set();
    this.move = { f: 0, s: 0 };
    this.joy = { x: 0, y: 0, active: false };
    this.sprint = false;
    this.touchSprint = false;
    this.camDelta = { x: 0, y: 0 };
    this.zoom = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.lastCamInput = 0;
    this.bindKeyboard();
    this.bindCanvas();
    this.bindButtons();
    this.bindJoystick();
    this.blockZoom();
  }

  // iOS Safari 핀치/더블탭 확대 차단
  blockZoom() {
    const stop = (e) => e.preventDefault();
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
      document.addEventListener(t, stop, { passive: false })
    );
    document.addEventListener('dblclick', stop, { passive: false });
    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      },
      { passive: false }
    );
    let lastEnd = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const now = performance.now();
        if (now - lastEnd < 320) e.preventDefault();
        lastEnd = now;
      },
      { passive: false }
    );
    document.addEventListener('contextmenu', stop);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', () => {
        if (Math.abs((vv.scale || 1) - 1) > 0.01) window.scrollTo(0, 0);
      });
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      if (['up', 'down', 'left', 'right', 'jump', 'sprint'].includes(action)) e.preventDefault();
      if (!this.held.has(action) && TRIGGERS.has(action)) this.press.add(action);
      this.held.add(action);
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      this.held.delete(action);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.touchSprint = false;
      this.joy = { x: 0, y: 0, active: false };
    });
  }

  bindCanvas() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    let dragId = null;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let moved = 0;

    c.addEventListener('pointerdown', (e) => {
      if (dragId !== null) return;
      dragId = e.pointerId;
      lastX = startX = e.clientX;
      lastY = startY = e.clientY;
      startT = performance.now();
      moved = 0;
      c.setPointerCapture?.(e.pointerId);
    });

    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== dragId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      this.camDelta.x += dx;
      this.camDelta.y += dy;
      if (Math.abs(dx) + Math.abs(dy) > 1) this.lastCamInput = performance.now();
    });

    const end = (e) => {
      if (e.pointerId !== dragId) return;
      const dt = performance.now() - startT;
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (!this.isTouch && dt < 320 && dist < 8) this.press.add('attack');
      dragId = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => {
      dragId = null;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom += Math.sign(e.deltaY) * Math.min(120, Math.abs(e.deltaY));
      },
      { passive: false }
    );
  }

  bindButtons() {
    const map = {
      'btn-sprint': 'sprint',
      'btn-jump': 'jump',
      'btn-attack': 'attack',
      'btn-skill1': 'skill1',
      'btn-skill2': 'skill2',
    };
    for (const [id, action] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('down');
        el.setPointerCapture?.(e.pointerId);
        if (action === 'sprint') this.touchSprint = true;
        else this.press.add(action);
      });
      const up = (e) => {
        el.classList.remove('down');
        if (action === 'sprint') this.touchSprint = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('click', (e) => e.preventDefault());
    }
  }

  bindJoystick() {
    const base = document.getElementById('joystick');
    const stick = document.getElementById('stick');
    if (!base || !stick) return;
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 46;

    const start = (e) => {
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      const rect = base.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      base.classList.add('active');
      base.setPointerCapture?.(e.pointerId);
      move(e);
    };
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      const max = R;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / max;
      const ny = dy / max;
      const dead = 0.14;
      this.joy = {
        x: Math.abs(nx) < dead ? 0 : nx,
        y: Math.abs(ny) < dead ? 0 : ny,
        active: true,
      };
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      base.classList.remove('active');
      stick.style.transform = 'translate(0px, 0px)';
      this.joy = { x: 0, y: 0, active: false };
    };
    base.addEventListener('pointerdown', start);
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    base.addEventListener('pointerleave', end);
  }

  update() {
    let f = 0;
    let s = 0;
    if (this.held.has('up')) f += 1;
    if (this.held.has('down')) f -= 1;
    if (this.held.has('right')) s += 1;
    if (this.held.has('left')) s -= 1;
    f += -this.joy.y;
    s += this.joy.x;
    const len = Math.hypot(f, s);
    if (len > 1) {
      f /= len;
      s /= len;
    }
    this.move.f = f;
    this.move.s = s;
    this.sprint = this.held.has('sprint') || this.touchSprint;
  }

  consume(action) {
    if (this.press.has(action)) {
      this.press.delete(action);
      return true;
    }
    return false;
  }

  endFrame() {
    this.press.clear();
    this.camDelta.x = 0;
    this.camDelta.y = 0;
    this.zoom = 0;
  }
}
