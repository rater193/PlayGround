// ── VOIDLINE :: keyboard, mouse, touch joystick and tilt ─────────────
import { clamp, angleTo } from './util.js';

export class InputSystem {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.cb = callbacks;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, active: false };
    this.touchActive = false;
    this.joystick = { id: null, active: false, ox: 0, oy: 0, x: 0, y: 0 };
    this.btn = { fire: false, mine: false, boost: false };
    this.tilt = { enabled: false, hasData: false, baseBeta: 0, baseGamma: 0, beta: 0, gamma: 0, available: 'DeviceOrientationEvent' in window };
    this.enabled = true;
    this.isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.joyEl = document.getElementById('joystick');
    this.stickEl = document.getElementById('stick');
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
    this._bindButtons();
  }

  // ── keyboard ─────────────────────────────────────────────────────
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
      if (!this.enabled) return;
      if (k === 'm' || k === 'tab') this.cb.onMap?.();
      else if (k === 'e') this.cb.onInteract?.();
      else if (k === 'escape') this.cb.onPause?.();
      else if (k === 'f') { /* held via keys */ }
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.btn.fire = this.btn.mine = this.btn.boost = false;
    });
  }

  // ── mouse ────────────────────────────────────────────────────────
  _bindMouse() {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.active = true;
        this.touchActive = false;
      }
    }, { passive: true });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) {
        this.mouse.down = true;
        this.mouse.active = true;
        this.cb.onFirstGesture?.();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouse.down = false;
    });
    window.addEventListener('contextmenu', (e) => {
      if (e.target === this.canvas) e.preventDefault();
    });
  }

  // ── touch joystick ───────────────────────────────────────────────
  _bindTouch() {
    const zone = window;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!this.enabled) return;
      const t = e.target;
      if (t && t.closest && t.closest('button, .overlay, .station-shell, .map-shell, #modal-layer, .screen')) return;
      if (e.clientX > window.innerWidth * .56) return;
      if (this.joystick.active) return;
      this.touchActive = true;
      this.cb.onFirstGesture?.();
      this.joystick.id = e.pointerId;
      this.joystick.active = true;
      this.joystick.ox = e.clientX;
      this.joystick.oy = e.clientY;
      this.joystick.x = 0;
      this.joystick.y = 0;
      if (this.joyEl) {
        this.joyEl.classList.remove('hidden');
        this.joyEl.style.left = e.clientX + 'px';
        this.joyEl.style.top = e.clientY + 'px';
      }
      this._moveStick(0, 0);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('pointermove', (e) => {
      if (!this.joystick.active || e.pointerId !== this.joystick.id) return;
      const dx = e.clientX - this.joystick.ox;
      const dy = e.clientY - this.joystick.oy;
      const max = 54;
      const len = Math.hypot(dx, dy);
      const cl = len > max ? max / len : 1;
      this.joystick.x = dx * cl / max;
      this.joystick.y = dy * cl / max;
      this._moveStick(dx * cl, dy * cl);
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      if (e.pointerId !== this.joystick.id) return;
      this.joystick.active = false;
      this.joystick.id = null;
      this.joystick.x = 0; this.joystick.y = 0;
      if (this.joyEl) this.joyEl.classList.add('hidden');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  _moveStick(dx, dy) {
    if (!this.stickEl) return;
    this.stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  // ── action buttons ───────────────────────────────────────────────
  _bindButtons() {
    const bind = (id, name) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => {
        e.preventDefault();
        this.touchActive = true;
        this.btn[name] = true;
        el.classList.add('pressed');
        this.cb.onFirstGesture?.();
      };
      const up = (e) => {
        if (e) e.preventDefault();
        this.btn[name] = false;
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerdown', down, { passive: false });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    bind('btn-fire', 'fire');
    bind('btn-mine', 'mine');
    bind('btn-boost', 'boost');
  }

  // ── tilt ────────────────────────────────────────────────────────
  async setTilt(on) {
    if (!on) {
      this.tilt.enabled = false;
      window.removeEventListener('deviceorientation', this._tiltHandler);
      return { ok: true };
    }
    if (!('DeviceOrientationEvent' in window)) {
      return { ok: false, msg: 'TILT NOT SUPPORTED ON THIS DEVICE' };
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return { ok: false, msg: 'MOTION PERMISSION DENIED' };
      }
    } catch (err) {
      return { ok: false, msg: 'MOTION PERMISSION UNAVAILABLE' };
    }
    this._tiltHandler = (e) => {
      if (e.beta === null && e.gamma === null) return;
      this.tilt.beta = e.beta || 0;
      this.tilt.gamma = e.gamma || 0;
      this.tilt.hasData = true;
    };
    window.addEventListener('deviceorientation', this._tiltHandler, true);
    this.tilt.enabled = true;
    // give the sensor a moment, then capture a level baseline
    setTimeout(() => this.recalibrateTilt(), 450);
    return { ok: true };
  }

  recalibrateTilt() {
    this.tilt.baseBeta = this.tilt.beta || 0;
    this.tilt.baseGamma = this.tilt.gamma || 0;
  }

  getTiltVector() {
    if (!this.tilt.enabled || !this.tilt.hasData) return { x: 0, y: 0 };
    // landscape-first mapping; kept intentionally gentle
    const dz = 3.5;
    let gx = (this.tilt.gamma - this.tilt.baseGamma);
    let gy = (this.tilt.beta - this.tilt.baseBeta);
    const o = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    if (o === -90 || o === 270) { const t = gx; gx = gy; gy = -t; }
    else if (o === 180) { gx = -gx; gy = -gy; }
    const x = Math.abs(gx) < dz ? 0 : clamp(gx / 22, -1, 1);
    const y = Math.abs(gy) < dz ? 0 : clamp(gy / 22, -1, 1);
    return { x, y };
  }

  // ── read state ───────────────────────────────────────────────────
  getMove() {
    let x = 0, y = 0;
    if (this.joystick.active) {
      const sens = this.cb.getSensitivity?.() || 1;
      x = clamp(this.joystick.x * sens, -1, 1);
      y = clamp(this.joystick.y * sens, -1, 1);
      const len = Math.hypot(x, y);
      if (len < .12) { x = 0; y = 0; }
    } else {
      if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
      const t = this.getTiltVector();
      if (x === 0 && y === 0) { x = t.x; y = t.y; }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  getFire() {
    return this.mouse.down || this.keys.has(' ') || this.btn.fire;
  }

  getMine() {
    return this.keys.has('f') || this.btn.mine;
  }

  getBoost() {
    return this.keys.has('shift') || this.btn.boost;
  }

  getUsingMouse() {
    return this.mouse.active && !this.touchActive;
  }

  getAim(game, zoom) {
    if (!game.player) return { x: 0, y: 0, angle: 0 };
    const sx = this.mouse.x - window.innerWidth / 2;
    const sy = this.mouse.y - window.innerHeight / 2;
    const wx = game.camera.x + sx / zoom;
    const wy = game.camera.y + sy / zoom;
    return { x: wx, y: wy, angle: angleTo(game.player.x, game.player.y, wx, wy) };
  }

  applyToGame(game, zoom) {
    const mv = this.getMove();
    game.controls.x = mv.x;
    game.controls.y = mv.y;
    game.controls.fire = this.getFire();
    game.controls.mine = this.getMine();
    game.controls.boost = this.getBoost();
    game.controls.usingMouse = this.getUsingMouse();
    if (game.player) {
      const aim = this.getAim(game, zoom);
      game.controls.aimAngle = aim.angle;
    }
  }

  resetActions() {
    this.btn.fire = this.btn.mine = this.btn.boost = false;
    this.mouse.down = false;
    this.keys.clear();
    if (this.joyEl) this.joyEl.classList.add('hidden');
    document.querySelectorAll('.action.pressed').forEach(el => el.classList.remove('pressed'));
  }
}
