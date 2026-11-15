// 입력 — 키보드 + 멀티터치 버튼, iOS 확대·스크롤 차단
import { clamp } from './util.js?v=20261115a';

export class Input {
  constructor() {
    this.keys = new Set();
    this.btn = { left: false, right: false, drift: false, boost: false };
    this.pressDrift = false;
    this.steerSmooth = 0;
    this.anyInput = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Shift'].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.keys.add(e.code);
      this.anyInput = true;
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.keys.delete(e.code);
    });

    // iOS 제스처 차단
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('gestureend', stop, { passive: false });
    document.addEventListener('dblclick', stop, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) stop(e);
    }, { passive: false });
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch < 320) stop(e);
      lastTouch = now;
    }, { passive: false });
  }

  bindHold(el, name) {
    if (!el) return;
    const on = (e) => {
      e.preventDefault();
      this.btn[name] = true;
      el.classList.add('on');
      if (el.setPointerCapture && e.pointerId != null) {
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      this.anyInput = true;
    };
    const off = (e) => {
      if (e) e.preventDefault();
      this.btn[name] = false;
      el.classList.remove('on');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get steer() {
    let s = 0;
    if (this.btn.left) s -= 1;
    if (this.btn.right) s += 1;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a') || k.has('KeyA')) s -= 1;
    if (k.has('arrowright') || k.has('d') || k.has('KeyD')) s += 1;
    return clamp(s, -1, 1);
  }

  get drift() {
    return this.btn.drift || this.keys.has(' ') || this.keys.has('Space') || this.keys.has('spacebar');
  }

  get boost() {
    return this.btn.boost || this.keys.has('shift') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get brake() {
    const k = this.keys;
    return k.has('arrowdown') || k.has('s') || k.has('KeyS');
  }

  state() {
    return { steer: this.steer, drift: this.drift, boost: this.boost, brake: this.brake };
  }

  reset() {
    this.btn = { left: false, right: false, drift: false, boost: false };
    this.keys.clear();
  }
}
