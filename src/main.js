// ── VOIDLINE :: application shell ────────────────────────────────────
import { SpaceGame } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { InputSystem } from './input.js';
import { setUniverseSeed, getSectorMeta, isAdjacent, sectorKey } from './galaxy.js';
import { shipById, ROLES } from './data.js';
import { audio } from './audio.js';

const SAVE_KEY = 'voidline.career.v1';

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.ui = new UI();
    this.screen = 'title';
    this.time = 0;
    this.last = performance.now();
    this.autoSaveAcc = 0;
    this.deathTimer = 0;
    this.dyingSource = '';
    this.pendingDeath = false;

    this.game = new SpaceGame({
      toast: (msg, type = '') => this.ui.toast(msg, type),
      onDeath: (source) => this.handleDeath(source),
      onDock: (station) => this.handleDock(station),
      onDockAvailable: () => {},
      onSector: () => { this.ui.lastShipId = null; }
    });

    this.input = new InputSystem(this.canvas, {
      onMap: () => this.toggleMap(),
      onInteract: () => this.interact(),
      onPause: () => this.togglePause(),
      onFirstGesture: () => this.unlockAudio(),
      getSensitivity: () => this.game.state?.settings?.sens || 1
    });

    this.ui.init(this);
    this.ui.showTitle();
    this.applySettings();
    this.bindLifecycle();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ── lifecycle ───────────────────────────────────────────────────
  bindLifecycle() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      if (this.game.world) this.game.camera.zoom = this.renderer.zoom;
    });
    window.addEventListener('orientationchange', () => setTimeout(() => {
      this.renderer.resize();
      if (this.game.world) this.game.camera.zoom = this.renderer.zoom;
      if (this.game.state?.settings?.tilt) this.input.recalibrateTilt();
      this.updateRotateHint();
    }, 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.screen === 'space') this.save();
        audio.setAmbient(0.2);
      } else audio.setAmbient(0.8);
    });
    window.addEventListener('beforeunload', () => { if (this.game.state && !this.game.dead) this.save(); });
    document.addEventListener('pointerdown', () => this.unlockAudio(), { once: true });
    this.updateRotateHint();
  }

  unlockAudio() {
    if (audio.started) { audio.resume(); return; }
    audio.init();
    const on = this.game.state?.settings?.sound ?? true;
    audio.setEnabled(on);
  }

  applySettings() {
    const s = this.game.state?.settings;
    if (!s) { audio.setEnabled(true); return; }
    audio.setEnabled(s.sound);
    this.renderer.setQuality(s.quality || 'high');
    this.ui.updateSoundToggle();
    this.ui.updateTiltToggle();
    this.ui.updateQuality();
    if (s.tilt) {
      this.input.setTilt(true).then(r => {
        if (!r.ok && this.game.state) {
          this.game.state.settings.tilt = false;
          this.ui.updateTiltToggle();
        }
      });
    }
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  save() {
    if (!this.game.state || this.game.dead) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.serialize()));
    } catch { /* storage may be unavailable */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { }
    this.game.state = null;
    this.game.world = null;
    this.game.dead = false;
    this.screen = 'title';
    this.ui.refreshTitle();
  }

  newCareerFlow() {
    this.unlockAudio();
    this.screen = 'select';
    this.input.resetActions();
    this.ui.showSelect();
  }

  startNewCareer(role) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    setUniverseSeed(seed);
    const save = SpaceGame.createCareer(role);
    this.game.loadCareer(save);
    this.game.state.visitedSet = new Set(this.game.state.visited);
    this.screen = 'space';
    this.input.resetActions();
    this.ui.showSpace();
    this.ui.lastShipId = null;
    this.applySettings();
    this.save();
    this.unlockAudio();
    const roleData = ROLES[role];
    this.ui.toast(`CAREER REGISTERED — ${shipById(save.shipId).name.toUpperCase()} · ${roleData.label} PATH`, 'good', 3600);
    setTimeout(() => this.ui.toast('THRUST WITH THE LEFT STICK · FIRE WITH THE RIGHT', '', 3800), 900);
    setTimeout(() => this.ui.toast(role === 'mining' ? 'HOLD MINE NEAR AN ASTEROID TO EXTRACT ORE' : role === 'trade' ? 'DOCK AT STATIONS TO BUY LOW AND SELL HIGH' : 'PIRATES ROAM DANGEROUS SECTORS — FIRE TO ENGAGE', '', 4200), 1900);
    setTimeout(() => this.ui.toast('OPEN THE STAR MAP TO FIND NEW STATIONS AND HULLS', 'warn', 4200), 2900);
  }

  continueCareer() {
    this.unlockAudio();
    const save = this.loadSave();
    if (!save) {
      this.ui.toast('NO SAVED CAREER FOUND', 'warn');
      return;
    }
    try {
      this.game.loadCareer(save);
      this.screen = 'space';
      this.input.resetActions();
      this.ui.showSpace();
      this.ui.lastShipId = null;
      this.applySettings();
      this.ui.toast(`WELCOME BACK, CAPTAIN — ${this.game.ship.name.toUpperCase()}`, 'good');
      if (this.game.state.settings.tilt) this.ui.toast('TILT STEERING ACTIVE', '', 2600);
    } catch (err) {
      console.error(err);
      this.ui.toast('SAVE FILE UNREADABLE', 'bad');
    }
  }

  quitToTitle() {
    this.save();
    this.game.state = null;
    this.game.world = null;
    this.game.dead = false;
    this.screen = 'title';
    this.input.resetActions();
    audio.setAmbient(0.8);
    this.ui.showTitle();
  }

  showTitle() {
    this.screen = 'title';
    this.input.resetActions();
    this.ui.showTitle();
  }

  // ── navigation / actions ────────────────────────────────────────
  dockNearest() {
    if (this.screen !== 'space' || !this.game.nearStation) return;
    this.game.dock(this.game.nearStation);
  }

  handleDock(station) {
    if (this.screen !== 'space') return;
    this.screen = 'station';
    this.input.resetActions();
    this.game.state.lastStation = { sx: station.sx, sy: station.sy, idx: station.idx, name: station.name };
    this.save();
    this.ui.showStation(station);
    if (!this.game.state.tutorial.docked) {
      this.game.state.tutorial.docked = true;
      setTimeout(() => this.ui.toast('SHIPYARD STOCK DIFFERS BY STATION — EXPLORE TO FIND RARE HULLS', 'warn', 4600), 600);
    }
  }

  undock() {
    if (this.screen !== 'station') return;
    const st = this.ui.station;
    audio.sfx('undock');
    this.ui.hideStation();
    this.screen = 'space';
    this.ui.screen = 'space';
    this.ui.el.hud.classList.remove('hidden');
    this.input.resetActions();
    if (st && this.game.player) {
      const a = st.angle + Math.PI;
      this.game.player.x = st.x + Math.cos(a) * 310;
      this.game.player.y = st.y + Math.sin(a) * 310;
      this.game.player.vx = 0; this.game.player.vy = 0;
      this.game.camera.x = this.game.player.x;
      this.game.camera.y = this.game.player.y;
    }
    this.save();
    this.ui.toast('DOCKING CLAMPS RELEASED', '', 2200);
  }

  openMap() {
    if (this.screen !== 'space') return;
    this.screen = 'map';
    this.input.resetActions();
    this.ui.openMap();
  }

  closeMap() {
    if (this.screen !== 'map') return;
    this.ui.closeMap();
    this.screen = 'space';
    this.input.resetActions();
  }

  toggleMap() {
    if (this.screen === 'space') this.openMap();
    else if (this.screen === 'map') this.closeMap();
  }

  jumpTo(target) {
    if (this.screen !== 'map' || !this.game.state) return;
    const cur = this.game.state.sector;
    if (target.x === cur.x && target.y === cur.y) {
      this.ui.toast('YOU ARE ALREADY IN THIS SECTOR', 'warn');
      return;
    }
    if (!isAdjacent(cur, target)) {
      this.ui.toast('TARGET OUT OF WARP RANGE — JUMP ADJACENT SECTORS', 'bad');
      audio.sfx('deny');
      return;
    }
    const meta = getSectorMeta(target.x, target.y);
    this.ui.closeMap();
    this.screen = 'warp';
    this.game.warp = { progress: 0, to: { ...target }, destName: meta.name, switched: false };
    this.input.resetActions();
    audio.sfx('jump');
    audio.setAmbient(.35);
  }

  updateWarp(dt) {
    const w = this.game.warp;
    if (!w) {
      this.screen = 'space';
      return;
    }
    w.progress = Math.min(1, w.progress + dt / 2.35);
    if (w.progress > .48 && !w.switched) {
      w.switched = true;
      this.game.enterSector(w.to.x, w.to.y, { arrive: true });
      this.game.state.stats.jumps++;
      this.game.state.sector = { x: w.to.x, y: w.to.y };
      this.save();
      audio.sfx('arrive');
      this.ui.lastShipId = null;
    }
    if (w.progress >= 1) {
      this.game.warp = null;
      this.screen = 'space';
      audio.setAmbient(.8);
      this.ui.el.warp.classList.add('hidden');
      this.ui.toast(`ARRIVED — ${w.destName}`, 'good', 3000);
      const danger = this.game.world.meta.danger;
      if (danger >= 4) setTimeout(() => this.ui.toast('THREAT LEVEL CRITICAL — PIRATE ACTIVITY DETECTED', 'bad', 4200), 700);
      this.save();
    }
  }

  handleDeath(source) {
    this.pendingDeath = true;
    this.dyingSource = source;
    this.deathTimer = 1.35;
    this.screen = 'dying';
    this.input.resetActions();
    audio.sfx('alarm');
  }

  finishDeath() {
    this.screen = 'death';
    this.ui.showDeath(this.dyingSource);
    this.pendingDeath = false;
  }

  respawn() {
    const r = this.game.respawn();
    this.ui.hideDeath();
    this.screen = 'space';
    this.input.resetActions();
    this.ui.showSpace();
    this.ui.lastShipId = null;
    this.save();
    this.ui.toast(`RECOVERED AT ${this.game.state.lastStation.name} — ◈${r.lost.toLocaleString()} RECOVERY FEE`, 'warn', 4200);
  }

  openPause() {
    if (this.screen !== 'space') return;
    this.screen = 'pause';
    this.input.resetActions();
    this.ui.openPause();
  }

  closePause() {
    if (this.screen !== 'pause') return;
    this.ui.closePause();
    this.screen = 'space';
    this.input.resetActions();
  }

  togglePause() {
    if (this.screen === 'space') this.openPause();
    else if (this.screen === 'pause') this.closePause();
    else if (this.screen === 'map') this.closeMap();
  }

  interact() {
    if (this.screen !== 'space') return;
    if (this.game.nearStation) this.dockNearest();
    else {
      // nearest anomaly / derelict interaction is automatic; give a hint
      const p = this.game.player;
      if (p && this.game.world.anomaly && !this.game.world.anomaly.scanned) {
        const d = Math.hypot(p.x - this.game.world.anomaly.x, p.y - this.game.world.anomaly.y);
        if (d < 500) this.ui.toast('MOVE CLOSER TO THE ANOMALY TO AUTO-SCAN', '', 2400);
      }
    }
  }

  refreshHudShip() {
    this.ui.lastShipId = null;
  }

  updateRotateHint() {
    const hint = document.getElementById('rotate-hint');
    if (!hint) return;
    const portrait = window.innerHeight > window.innerWidth;
    const show = portrait && this.screen === 'space' && ('ontouchstart' in window);
    hint.classList.toggle('hidden', !show);
  }

  // ── loop ────────────────────────────────────────────────────────
  loop(now) {
    const dt = Math.min(.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.renderer.zoom && (this.game.camera.zoom = this.renderer.zoom);

    if (this.screen === 'space') {
      this.input.applyToGame(this.game, this.renderer.zoom);
      if (this.game.state && this.game.player) {
        this.game.update(dt);
        this.ui.updateHUD(this.game, this.renderer, this.time, dt);
      }
      this.autoSaveAcc += dt;
      if (this.autoSaveAcc > 22) { this.autoSaveAcc = 0; this.save(); }
    } else if (this.screen === 'warp') {
      this.updateWarp(dt);
      if (this.game.state) this.ui.updateHUD(this.game, this.renderer, this.time, dt);
    } else if (this.screen === 'dying') {
      this.deathTimer -= dt;
      if (this.game.player) {
        this.game.updateParticles(dt);
        this.game.updateCamera(dt);
        this.game.shake = Math.max(0, this.game.shake - dt * 18);
        this.game.hitFlash = Math.max(0, this.game.hitFlash - dt * 2);
        this.ui.updateHUD(this.game, this.renderer, this.time, dt);
      }
      if (this.deathTimer <= 0) this.finishDeath();
    }

    // render
    if (this.screen === 'title' || this.screen === 'select' ||
      ((this.screen === 'settings' || this.ui.settingsReturn === 'title') && !this.game.world && !this.ui.el.settings.classList.contains('hidden'))) {
      this.renderer.renderTitle(this.time);
    } else if (this.game.world) {
      this.renderer.renderGame(this.game, this.time, dt);
    } else {
      this.renderer.renderTitle(this.time);
    }

    if (this.ui.mapOpen && this.game.state) {
      this.renderer.drawGalaxyMap(this.ui.el.mapCanvas, this.game.state, this.ui.mapSelected, this.time);
    }

    this.updateRotateHint();
    requestAnimationFrame(this.loop);
  }
}

try {
  window.__voidline = new App();
} catch (err) {
  console.error(err);
  const box = document.getElementById('boot-error');
  if (box) {
    box.classList.remove('hidden');
    box.textContent = 'VOIDLINE FAILED TO BOOT\n\n' + (err?.stack || err);
  }
}
