// ── VOIDLINE :: flight, combat, mining and career simulation ─────────
import {
  TAU, clamp, lerp, dist, dist2, angleTo, wrapAngle, angleDelta, turnToward,
  rand, randInt, pick, chance, formatCredits, rgba
} from './util.js';
import {
  SHIP_MAP, shipById, COMMODITY_MAP, COMMODITIES, MINED_ORES,
  ENEMY_TYPES, PIRATE_GANGS
} from './data.js';
import {
  WORLD_HALF, buildSector, getSectorMeta, getStation, sectorKey, allStationsInSector,
  isAdjacent, getUniverseSeed, setUniverseSeed
} from './galaxy.js';
import { audio } from './audio.js';

const MAX_PARTICLES = 620;
const MAX_BULLETS = 240;

export class SpaceGame {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.state = null;
    this.world = null;
    this.controls = { x: 0, y: 0, fire: false, mine: false, boost: false, aimAngle: 0, usingMouse: false };
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.rings = [];
    this.pickups = [];
    this.texts = [];
    this.time = 0;
    this.spawnTimer = 40;
    this.shake = 0;
    this.hitFlash = 0;
    this.nearStation = null;
    this.beam = null;
    this.mineTarget = null;
    this.mineAccum = 0;
    this.dockHintShown = false;
    this.boundaryTimer = 0;
    this.warp = null;
    this.dead = false;
    this.enemyId = 1;
    this.camera = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
    this.drones = [];
  }

  // ── career setup ─────────────────────────────────────────────────
  static createCareer(roleId = 'combat') {
    const shipId = `${roleId}-1`;
    return {
      v: 1,
      seed: getUniverseSeed(),
      createdAt: Date.now(),
      credits: 3200,
      shipId,
      hull: shipById(shipId).hull,
      shield: shipById(shipId).shield,
      boost: 100,
      cargo: {},
      missionCargo: [],
      sector: { x: 0, y: 0 },
      visited: ['0,0'],
      lastStation: { sx: 0, sy: 0, idx: 0, name: 'HALCYON EXCHANGE' },
      active: [],
      sectorStates: {},
      stats: { kills: 0, ore: 0, trades: 0, jumps: 0, contracts: 0, deaths: 0, creditsEarned: 0, ships: 1 },
      settings: { sound: true, tilt: false, sens: 1, quality: 'high' },
      playTime: 0,
      tutorial: { docked: false, mined: false, mission: false }
    };
  }

  loadCareer(save) {
    const s = save;
    if (!s || !s.shipId || !SHIP_MAP[s.shipId]) throw new Error('Bad save');
    setUniverseSeed(s.seed);
    this.state = s;
    if (!Array.isArray(s.visited)) s.visited = ['0,0'];
    s.visitedSet = new Set(s.visited);
    if (!s.sectorStates) s.sectorStates = {};
    if (!s.cargo) s.cargo = {};
    if (!s.missionCargo) s.missionCargo = [];
    if (!s.active) s.active = [];
    if (!s.stats) s.stats = SpaceGame.createCareer().stats;
    if (!s.settings) s.settings = { sound: true, tilt: false, sens: 1, quality: 'high' };
    if (!s.lastStation) s.lastStation = { sx: 0, sy: 0, idx: 0, name: 'HALCYON EXCHANGE' };
    if (!s.sector) s.sector = { x: 0, y: 0 };
    const ship = shipById(s.shipId);
    s.hull = clamp(s.hull ?? ship.hull, 1, ship.hull);
    s.shield = clamp(s.shield ?? ship.shield, 0, ship.shield);
    s.boost = clamp(s.boost ?? 100, 0, 100);
    this.dead = false;
    this.enterSector(s.sector.x, s.sector.y, { spawnNearStation: true, silent: true });
    this.applySurveyProgress();
  }

  get ship() { return shipById(this.state.shipId); }
  get maxHull() { return this.ship.hull; }
  get maxShield() { return this.ship.shield; }
  get maxCargo() { return this.ship.cargo; }

  cargoUsed() {
    let n = 0;
    for (const k in this.state.cargo) n += this.state.cargo[k] || 0;
    for (const m of this.state.missionCargo) n += m.qty || 0;
    return n;
  }

  cargoFree() { return Math.max(0, this.maxCargo - this.cargoUsed()); }

  addCargo(id, qty) {
    const free = this.cargoFree();
    const add = Math.min(free, qty);
    if (add <= 0) return 0;
    this.state.cargo[id] = (this.state.cargo[id] || 0) + add;
    return add;
  }

  removeCargo(id, qty) {
    const have = this.state.cargo[id] || 0;
    const rem = Math.min(have, qty);
    if (rem <= 0) return 0;
    this.state.cargo[id] = have - rem;
    if (this.state.cargo[id] <= 0) delete this.state.cargo[id];
    return rem;
  }

  // ── sector lifecycle ─────────────────────────────────────────────
  getSectorState(key = sectorKey(this.state.sector.x, this.state.sector.y)) {
    if (!this.state.sectorStates[key]) this.state.sectorStates[key] = { mined: {}, derelictLooted: false, anomalyScanned: false };
    return this.state.sectorStates[key];
  }

  enterSector(sx, sy, opts = {}) {
    const key = sectorKey(sx, sy);
    this.state.sector = { x: sx, y: sy };
    this.state.visitedSet.add(key);
    if (!this.state.visited.includes(key)) this.state.visited.push(key);
    this.world = buildSector(sx, sy, this.getSectorState(key));
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.rings = [];
    this.pickups = [];
    this.texts = [];
    this.drones = [];
    this.beam = null;
    this.nearStation = null;
    this.mineTarget = null;
    this.time = 0;
    this.spawnTimer = rand(35, 55);
    this.dead = false;

    let spawnX = 0, spawnY = 0;
    const first = this.world.stations[0];
    if (opts.spawnNearStation && first) {
      const a = first.angle + Math.PI + rand(-0.25, 0.25);
      spawnX = first.x + Math.cos(a) * 350;
      spawnY = first.y + Math.sin(a) * 350;
    } else if (opts.nearStation && first) {
      spawnX = first.x + Math.cos(first.angle + Math.PI) * 330;
      spawnY = first.y + Math.sin(first.angle + Math.PI) * 330;
    } else if (opts.arriveAt) {
      spawnX = opts.arriveAt.x; spawnY = opts.arriveAt.y;
    } else {
      spawnX = rand(-320, 320); spawnY = rand(-320, 320);
    }
    this.player = {
      x: spawnX, y: spawnY, vx: 0, vy: 0, angle: -Math.PI / 2,
      speed: 0, radius: 18, dead: false,
      lastHit: 99, fireCd: 0, boostIdle: 0, trailTimer: 0
    };
    this.camera.x = spawnX; this.camera.y = spawnY;
    this.camera.zoom = 1;

    this.spawnSectorEnemies();
    if (opts.arrive) {
      this.addRing(spawnX, spawnY, 20, 420, 1.35, '#8ff6ff', 3);
      this.shake = 9;
    }
    this.applySurveyProgress();
    this.cb.onSector?.(this.world.meta, opts);
  }

  spawnSectorEnemies() {
    const meta = this.world.meta;
    if (meta.danger <= 0) return;
    const target = clamp(1 + meta.danger * 2, 1, 10);
    for (let i = 0; i < target; i++) {
      const a = rand(0, TAU);
      const r = rand(920, 2750);
      this.spawnEnemy({
        x: Math.cos(a) * r, y: Math.sin(a) * r,
        tier: clamp(1 + Math.round(meta.danger * 2.2 + rand(-1, 2)), 1, 20),
        danger: meta.danger
      });
    }
  }

  spawnEnemy(opts = {}) {
    const meta = this.world.meta;
    const tier = opts.tier ?? clamp(1 + Math.round(meta.danger * 2 + rand(0, 2)), 1, 20);
    const typeRoll = chance(.15 + meta.danger * .08)
      ? pick(ENEMY_TYPES)
      : ENEMY_TYPES[Math.floor(Math.random() * 2)];
    const hullScale = 1 + (tier - 1) * .22;
    const dmgScale = 1 + (tier - 1) * .155;
    const e = {
      id: this.enemyId++,
      type: typeRoll.id,
      name: typeRoll.name,
      x: opts.x ?? 0, y: opts.y ?? 0,
      vx: rand(-20, 20), vy: rand(-20, 20),
      angle: rand(0, TAU),
      radius: 17 * typeRoll.scale + Math.min(8, tier * .35),
      hull: Math.round(typeRoll.hull * hullScale),
      maxHull: Math.round(typeRoll.hull * hullScale),
      shield: Math.round(typeRoll.shield * hullScale),
      maxShield: Math.round(typeRoll.shield * hullScale),
      speed: typeRoll.speed * (1 + (tier - 1) * .012),
      damage: typeRoll.damage * dmgScale,
      rate: typeRoll.rate * (1 + tier * .012),
      range: typeRoll.range,
      reward: typeRoll.reward,
      tier,
      faction: pick(PIRATE_GANGS),
      cooldown: rand(.6, 2.4),
      aggro: false,
      orbit: chance(.5) ? 1 : -1,
      hit: 0,
      engine: 0,
      alive: true
    };
    this.enemies.push(e);
    return e;
  }

  // ── main update ──────────────────────────────────────────────────
  update(dt) {
    if (!this.state || this.dead || !this.player) return;
    dt = Math.min(dt, .05);
    this.time += dt;
    this.state.playTime = (this.state.playTime || 0) + dt;

    this.updatePlayer(dt);
    this.updateMining(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateAsteroids(dt);
    this.updateAnomaly(dt);
    this.updateSpawns(dt);
    this.updateCamera(dt);

    this.hitFlash = Math.max(0, this.hitFlash - dt * 3.2);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.boundaryTimer = Math.max(0, this.boundaryTimer - dt);

    // shield regen
    const s = this.state;
    const p = this.player;
    p.lastHit += dt;
    if (p.lastHit > 4.2 && s.shield < this.maxShield) {
      s.shield = Math.min(this.maxShield, s.shield + this.ship.regen * dt * (this.controls.boost ? .35 : 1));
    }
    s.boost = clamp(s.boost + (this._boosting ? -34 * dt : 16 * dt), 0, 100);

    // dock prompt
    this.nearStation = null;
    let best = 1e9;
    for (const st of this.world.stations) {
      const d = dist(p.x, p.y, st.x, st.y);
      if (d < st.dockRadius && d < best) { best = d; this.nearStation = st; }
    }
    if (this.nearStation && !this.dockHintShown) {
      this.dockHintShown = true;
      this.cb.onDockAvailable?.(this.nearStation);
    }
    if (!this.nearStation) this.dockHintShown = false;
  }

  updatePlayer(dt) {
    const p = this.player;
    const s = this.state;
    const ship = this.ship;
    const c = this.controls;
    let mx = c.x, my = c.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const inputMag = Math.min(1, mag);

    const wantingBoost = c.boost && s.boost > 1;
    this._boosting = wantingBoost;
    const speedCap = ship.speed * (wantingBoost ? 1.62 : 1);
    const accel = ship.speed * 3.4;

    if (inputMag > .05) {
      p.vx += mx * accel * dt;
      p.vy += my * accel * dt;
      p.boostIdle = 0;
    } else {
      p.boostIdle += dt;
      const drag = Math.exp(-2.1 * dt);
      p.vx *= drag; p.vy *= drag;
    }
    if (wantingBoost) {
      p.vx += mx * ship.speed * 1.5 * dt;
      p.vy += my * ship.speed * 1.5 * dt;
    }
    const v = Math.hypot(p.vx, p.vy);
    if (v > speedCap) {
      p.vx = p.vx / v * speedCap;
      p.vy = p.vy / v * speedCap;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.speed = Math.hypot(p.vx, p.vy);

    // thruster particles / engine trail
    if (p.speed > 20 || inputMag > .1) {
      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = wantingBoost ? .012 : .032;
        const back = p.angle + Math.PI;
        this.addParticle({
          x: p.x + Math.cos(back) * 17, y: p.y + Math.sin(back) * 17,
          vx: Math.cos(back) * rand(30, 90) + rand(-12, 12),
          vy: Math.sin(back) * rand(30, 90) + rand(-12, 12),
          life: rand(.25, .55), size: rand(1.5, 3.6),
          color: wantingBoost ? '#ffd08a' : '#7fe9ff', type: 'glow', drag: 1.5
        });
      }
    }

    // facing
    let face = p.angle;
    const aimTarget = this.nearestEnemy(1200);
    if (c.fire) {
      if (c.usingMouse) face = c.aimAngle;
      else if (aimTarget) face = angleTo(p.x, p.y, aimTarget.x, aimTarget.y);
      else if (inputMag > .1) face = Math.atan2(my, mx);
    } else if (this.beam && this.mineTarget) {
      face = angleTo(p.x, p.y, this.mineTarget.x, this.mineTarget.y);
    } else if (c.usingMouse) {
      face = c.aimAngle;
    } else if (inputMag > .1) {
      face = Math.atan2(my, mx);
    } else if (p.speed > 18) {
      face = Math.atan2(p.vy, p.vx);
    }
    p.angle = turnToward(p.angle, face, 9.5 * dt);

    // fire
    p.fireCd -= dt;
    if (c.fire && p.fireCd <= 0) {
      this.playerFire();
    }

    // collision with planets
    for (const pl of this.world.planets) {
      const d = dist(p.x, p.y, pl.x, pl.y);
      const min = pl.radius + p.radius;
      if (d < min) {
        const a = angleTo(pl.x, pl.y, p.x, p.y);
        p.x = pl.x + Math.cos(a) * min;
        p.y = pl.y + Math.sin(a) * min;
        const impact = p.speed;
        p.vx *= -.28; p.vy *= -.28;
        if (impact > 220) this.damagePlayer((impact - 190) * .07, 'PLANETARY IMPACT');
      }
    }
    // stations
    for (const st of this.world.stations) {
      const d = dist(p.x, p.y, st.x, st.y);
      const min = 112 + p.radius;
      if (d < min) {
        const a = angleTo(st.x, st.y, p.x, p.y);
        p.x = st.x + Math.cos(a) * min;
        p.y = st.y + Math.sin(a) * min;
        p.vx *= -.3; p.vy *= -.3;
      }
    }
    // asteroids
    for (const a of this.world.asteroids) {
      if (a.amount <= 0) continue;
      const d = dist(p.x, p.y, a.x, a.y);
      const min = a.radius * .82 + p.radius;
      if (d < min) {
        const ang = angleTo(a.x, a.y, p.x, p.y);
        p.x = a.x + Math.cos(ang) * min;
        p.y = a.y + Math.sin(ang) * min;
        const impact = p.speed;
        p.vx = Math.cos(ang) * impact * .35;
        p.vy = Math.sin(ang) * impact * .35;
        if (impact > 250) {
          this.damagePlayer((impact - 210) * .03, 'ASTEROID IMPACT');
          this.spawnSparks(p.x, p.y, ang, '#ffcf8a', 5);
          this.shake = Math.max(this.shake, 4);
        }
      }
    }

    // world boundary
    const boundary = WORLD_HALF - 110;
    if (Math.abs(p.x) > boundary || Math.abs(p.y) > boundary) {
      p.x = clamp(p.x, -boundary, boundary);
      p.y = clamp(p.y, -boundary, boundary);
      p.vx *= -.15; p.vy *= -.15;
      if (this.boundaryTimer <= 0) {
        this.boundaryTimer = 8;
        this.cb.toast?.('SECTOR BOUNDARY — OPEN THE STAR MAP TO JUMP', 'warn');
      }
    }
  }

  playerFire() {
    const p = this.player;
    const s = this.state;
    const ship = this.ship;
    const c = this.controls;
    p.fireCd = 1 / ship.rate;
    let angle = p.angle;
    let target = null;
    if (c.usingMouse) {
      angle = c.aimAngle;
      // gentle aim assist within 8 degrees
      let best = null, bestD = .16;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > ship.range * 1.15) continue;
        const diff = Math.abs(angleDelta(angle, angleTo(p.x, p.y, e.x, e.y)));
        if (diff < bestD) { bestD = diff; best = e; }
      }
      target = best;
      if (target) angle = angleTo(p.x, p.y, target.x, target.y);
    } else {
      target = this.nearestEnemy(1250);
      if (target) angle = angleTo(p.x, p.y, target.x, target.y);
    }
    const speed = 1080;
    const hardpoints = ship.hardpoints;
    for (let i = 0; i < hardpoints; i++) {
      const spread = hardpoints === 1 ? rand(-.012, .012) : (i - (hardpoints - 1) / 2) * .026 + rand(-.008, .008);
      const a = angle + spread;
      const side = (i - (hardpoints - 1) / 2) * 9;
      const ox = Math.cos(angle + Math.PI / 2) * side;
      const oy = Math.sin(angle + Math.PI / 2) * side;
      this.bullets.push({
        x: p.x + Math.cos(angle) * 20 + ox,
        y: p.y + Math.sin(angle) * 20 + oy,
        vx: Math.cos(a) * speed + p.vx * .18,
        vy: Math.sin(a) * speed + p.vy * .18,
        life: ship.range / speed,
        damage: ship.damage,
        friendly: true,
        radius: 4,
        color: this.state.shipId.startsWith('mining') ? '#ffcf7a' : '#8ff6ff',
        trail: []
      });
    }
    this.muzzle = { x: p.x + Math.cos(angle) * 22, y: p.y + Math.sin(angle) * 22, angle, life: .07 };
    this.spawnSparks(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, angle, '#bffaff', 3);
    this.shake = Math.max(this.shake, 1.3);
    audio.sfx('laser');
  }

  updateMining(dt) {
    const p = this.player;
    const c = this.controls;
    this.beam = null;
    this.mineTarget = null;
    if (!c.mine) { this.mineAccum = 0; return; }
    let best = null, bestD = 440;
    for (const a of this.world.asteroids) {
      if (a.amount <= 0) continue;
      const d = dist(p.x, p.y, a.x, a.y);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (!best) return;
    this.mineTarget = best;
    const ship = this.ship;
    const free = this.cargoFree();
    if (free <= 0) {
      if (this._cargoWarn < this.time) {
        this._cargoWarn = this.time + 3;
        this.cb.toast?.('CARGO HOLD FULL — SELL OR JETTISON', 'warn');
        audio.sfx('deny');
      }
      this.beam = { x1: p.x, y1: p.y, x2: best.x, y2: best.y, color: '#ffb45c', weak: true };
      return;
    }
    this.beam = { x1: p.x, y1: p.y, x2: best.x, y2: best.y, color: '#ffcf6a', weak: false };
    this.mineAccum += ship.mining * dt;
    const yield_ = clamp(1 + (ship.tier - 1) * .02, 1, 1.5);
    const take = Math.min(this.mineAccum, best.amount, free);
    if (take >= 1) {
      const whole = Math.floor(take);
      this.mineAccum -= whole;
      best.amount -= whole;
      const added = this.addCargo(best.ore, whole);
      if (added > 0) {
        this.state.stats.ore += added;
        this.state.stats.minedByOre = this.state.stats.minedByOre || {};
        this.state.stats.minedByOre[best.ore] = (this.state.stats.minedByOre[best.ore] || 0) + added;
        this.mineAccum += (whole - added);
        if (this.time - (this._lastOreToast || 0) > 1.1) {
          this._lastOreToast = this.time;
          const cm = COMMODITY_MAP[best.ore];
          this.addText(best.x, best.y - best.radius - 10, `+${added} ${cm.name}`, cm.color, 11);
          audio.sfx('ore');
        }
        this.spawnSparks(best.x, best.y, rand(0, TAU), COMMODITY_MAP[best.ore].color, 2);
        const sec = this.getSectorState();
        sec.mined[best.id] = best.maxAmount - best.amount;
      }
      best.radius = Math.max(14, best.baseRadius * (.62 + .38 * (best.amount / Math.max(1, best.maxAmount))));
      if (best.amount <= 0) this.depleteAsteroid(best);
    }
    if (Math.random() < dt * 10) {
      const a = angleTo(best.x, best.y, p.x, p.y);
      this.addParticle({
        x: best.x + Math.cos(a) * best.radius * .5, y: best.y + Math.sin(a) * best.radius * .5,
        vx: Math.cos(a) * rand(50, 130) + rand(-30, 30), vy: Math.sin(a) * rand(50, 130) + rand(-30, 30),
        life: rand(.1, .25), size: rand(1, 2.6), color: COMMODITY_MAP[best.ore].color, type: 'spark', drag: .5
      });
    }
    audio.sfx('mining');
  }

  depleteAsteroid(a) {
    a.amount = 0;
    a.radius = 4;
    this.spawnSparks(a.x, a.y, rand(0, TAU), COMMODITY_MAP[a.ore].color, 18, 220);
    this.addRing(a.x, a.y, a.radius, a.radius * 5, .55, COMMODITY_MAP[a.ore].color, 2);
    this.shake = Math.max(this.shake, 2);
    if (chance(.09)) {
      this.pickups.push({ x: a.x, y: a.y, vx: rand(-30, 30), vy: rand(-30, 30), kind: 'credits', value: randInt(90, 340), life: 30 });
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (!e.aggro && d < 1650) e.aggro = true;
      if (!e.aggro) {
        // drift patrol
        e.x += Math.cos(e.angle) * 14 * dt;
        e.y += Math.sin(e.angle) * 14 * dt;
        e.angle += Math.sin(this.time * .3 + e.id) * .15 * dt;
        continue;
      }
      const toP = angleTo(e.x, e.y, p.x, p.y);
      let ax = 0, ay = 0;
      const desired = clamp(e.range * .62, 230, 620);
      if (d > desired + 90) {
        ax += Math.cos(toP); ay += Math.sin(toP);
      } else if (d < desired - 90) {
        ax -= Math.cos(toP); ay -= Math.sin(toP);
      }
      // orbit component
      ax += Math.cos(toP + Math.PI / 2 * e.orbit) * .75;
      ay += Math.sin(toP + Math.PI / 2 * e.orbit) * .75;
      // separation
      for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const dd = dist(e.x, e.y, o.x, o.y);
        if (dd < 150 && dd > .1) {
          ax -= (o.x - e.x) / dd * .9;
          ay -= (o.y - e.y) / dd * .9;
        }
      }
      const al = Math.hypot(ax, ay) || 1;
      e.vx += (ax / al) * e.speed * 2.6 * dt;
      e.vy += (ay / al) * e.speed * 2.6 * dt;
      const v = Math.hypot(e.vx, e.vy);
      if (v > e.speed) { e.vx = e.vx / v * e.speed; e.vy = e.vy / v * e.speed; }
      e.vx *= Math.exp(-.5 * dt); e.vy *= Math.exp(-.5 * dt);
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.angle = turnToward(e.angle, toP, 5.2 * dt);
      e.hit = Math.max(0, e.hit - dt * 3);
      e.engine += dt;

      // keep inside world
      e.x = clamp(e.x, -WORLD_HALF + 80, WORLD_HALF - 80);
      e.y = clamp(e.y, -WORLD_HALF + 80, WORLD_HALF - 80);

      // fire
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < e.range && Math.abs(angleDelta(e.angle, toP)) < .5) {
        e.cooldown = (1 / e.rate) * rand(.8, 1.25);
        this.enemyFire(e, toP);
      }
      // collision with player
      if (d < e.radius + p.radius) {
        const a = angleTo(e.x, e.y, p.x, p.y);
        p.x += Math.cos(a) * 3;
        p.y += Math.sin(a) * 3;
        this.damagePlayer(4, 'COLLISION');
        e.vx *= -.5; e.vy *= -.5;
      }
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  enemyFire(e, toP) {
    const p = this.player;
    const lead = dist(e.x, e.y, p.x, p.y) / 760;
    const tx = p.x + p.vx * lead * .55, ty = p.y + p.vy * lead * .55;
    const a = angleTo(e.x, e.y, tx, ty);
    const spread = e.type === 'sniper' ? .012 : e.type === 'interceptor' ? .06 : .035;
    const shots = e.type === 'gunner' ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const aa = a + (i - (shots - 1) / 2) * .045 + rand(-spread, spread);
      this.bullets.push({
        x: e.x + Math.cos(e.angle) * 18, y: e.y + Math.sin(e.angle) * 18,
        vx: Math.cos(aa) * 760, vy: Math.sin(aa) * 760,
        life: e.range / 760, damage: e.damage, friendly: false,
        radius: 4, color: '#ff6f7d', trail: []
      });
    }
    this.spawnSparks(e.x + Math.cos(e.angle) * 20, e.y + Math.sin(e.angle) * 20, e.angle, '#ff9a8a', 2);
    audio.sfx('enemyLaser');
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 5) b.trail.shift();
      if (b.life <= 0 || Math.abs(b.x) > WORLD_HALF || Math.abs(b.y) > WORLD_HALF) { b.life = 0; continue; }

      if (b.friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist2(b.x, b.y, e.x, e.y) < (e.radius + b.radius) ** 2) {
            this.damageEnemy(e, b.damage, b.x, b.y);
            b.life = 0;
            break;
          }
        }
      } else {
        if (dist2(b.x, b.y, p.x, p.y) < (p.radius + b.radius) ** 2) {
          this.damagePlayer(b.damage, 'WEAPON FIRE');
          b.life = 0;
          this.spawnSparks(b.x, b.y, rand(0, TAU), '#ff9b9b', 4);
        }
      }
      // asteroid cover
      if (b.life > 0) {
        for (const a of this.world.asteroids) {
          if (a.amount <= 0) continue;
          if (dist2(b.x, b.y, a.x, a.y) < (a.radius * .9 + b.radius) ** 2) {
            this.spawnSparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), '#cfd8e0', 3);
            b.life = 0;
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    if (this.bullets.length > MAX_BULLETS) this.bullets.splice(0, this.bullets.length - MAX_BULLETS);
  }

  damageEnemy(e, dmg, hx, hy) {
    e.hit = 1;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      this.spawnSparks(hx, hy, rand(0, TAU), '#8fe9ff', 3);
      audio.sfx('shield');
    }
    if (dmg > 0) {
      e.hull -= dmg;
      this.spawnSparks(hx, hy, rand(0, TAU), '#ffd0a0', 4);
      audio.sfx('hit');
    }
    this.addText(e.x, e.y - e.radius - 7, String(Math.round(dmg)), '#ffe6a0', 9);
    if (e.hull <= 0 && e.alive) this.killEnemy(e);
  }

  killEnemy(e) {
    e.alive = false;
    this.state.stats.kills++;
    this.spawnExplosion(e.x, e.y, e.radius * 3.4, '#ff9a6a');
    this.shake = Math.max(this.shake, 7);
    audio.sfx('explode');
    const value = Math.round((55 + e.tier * 24) * e.reward);
    this.pickups.push({ x: e.x, y: e.y, vx: rand(-40, 40), vy: rand(-40, 40), kind: 'credits', value, life: 40 });
    if (chance(.55)) {
      const ore = pick(MINED_ORES);
      this.pickups.push({ x: e.x, y: e.y, vx: rand(-50, 50), vy: rand(-50, 50), kind: 'ore', commodity: ore, value: randInt(2, 7), life: 40 });
    }
    this.addText(e.x, e.y - 24, `+◈${formatCredits(value)}`, '#ffd166', 12);
    // bounty progress
    for (const c of this.state.active) {
      if (c.type !== 'bounty' || c.progress >= c.kills) continue;
      if (c.targetSector.x !== this.state.sector.x || c.targetSector.y !== this.state.sector.y) continue;
      if (c.faction && e.faction !== c.faction && Math.random() > .3) continue;
      c.progress++;
      if (c.progress >= c.kills) this.cb.toast?.(`BOUNTY COMPLETE — RETURN TO ${c.giverName}`, 'good');
    }
  }

  damagePlayer(amount, source = 'UNKNOWN') {
    if (this.dead || !this.player) return;
    const s = this.state;
    const p = this.player;
    p.lastHit = 0;
    this.hitFlash = 1;
    this.shake = Math.max(this.shake, 3.4);
    let dmg = amount;
    if (s.shield > 0) {
      const ab = Math.min(s.shield, dmg);
      s.shield -= ab;
      dmg -= ab;
      this.spawnSparks(p.x, p.y, rand(0, TAU), '#8fe9ff', 5);
      audio.sfx('shield');
    }
    if (dmg > 0) {
      s.hull -= dmg;
      this.spawnSparks(p.x, p.y, rand(0, TAU), '#ff9a8a', 6);
      audio.sfx('hit');
    }
    if (s.hull <= 0) {
      s.hull = 0;
      this.playerDestroyed(source);
    }
  }

  playerDestroyed(source) {
    this.dead = true;
    const p = this.player;
    this.spawnExplosion(p.x, p.y, 110, '#ff8a6a');
    this.spawnExplosion(p.x + rand(-30, 30), p.y + rand(-30, 30), 70, '#ffd0a0');
    this.shake = 16;
    audio.sfx('bigExplode');
    this.state.stats.deaths++;
    this.cb.onDeath?.(source);
  }

  updatePickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      pk.life -= dt;
      const d = dist(p.x, p.y, pk.x, pk.y);
      if (d < 190) {
        const a = angleTo(pk.x, pk.y, p.x, p.y);
        pk.vx += Math.cos(a) * 620 * dt;
        pk.vy += Math.sin(a) * 620 * dt;
      }
      pk.vx *= Math.exp(-1.4 * dt); pk.vy *= Math.exp(-1.4 * dt);
      pk.x += pk.vx * dt; pk.y += pk.vy * dt;
      if (d < 34) {
        if (pk.kind === 'credits') {
          this.state.credits += pk.value;
          this.state.stats.creditsEarned += pk.value;
          this.addText(p.x, p.y - 26, `+◈${formatCredits(pk.value)}`, '#ffd166', 12);
          audio.sfx('coin');
          pk.life = 0;
        } else {
          const added = this.addCargo(pk.commodity, pk.value);
          if (added > 0) {
            const cm = COMMODITY_MAP[pk.commodity];
            this.state.stats.ore += added;
            this.state.stats.minedByOre = this.state.stats.minedByOre || {};
            this.state.stats.minedByOre[pk.commodity] = (this.state.stats.minedByOre[pk.commodity] || 0) + added;
            this.addText(p.x, p.y - 26, `+${added} ${cm.name}`, cm.color, 11);
            audio.sfx('ore');
            pk.life = 0;
          } else if (this.time - (this._fullToast || 0) > 4) {
            this._fullToast = this.time;
            this.cb.toast?.('CARGO FULL — CANNOT COLLECT SALVAGE', 'warn');
          }
        }
      }
    }
    this.pickups = this.pickups.filter(pk => pk.life > 0);
  }

  updateAnomaly(dt) {
    const an = this.world.anomaly;
    if (!an || an.scanned || !this.player) return;
    const d = dist(this.player.x, this.player.y, an.x, an.y);
    if (d < 165) {
      an.scanned = true;
      this.getSectorState().anomalyScanned = true;
      const reward = an.reward;
      this.state.credits += reward;
      this.state.stats.creditsEarned += reward;
      this.addRing(an.x, an.y, 10, 360, 1.1, '#c5a6ff', 3);
      this.spawnSparks(an.x, an.y, rand(0, TAU), '#c5a6ff', 26, 200);
      this.addText(an.x, an.y - 40, `ANOMALY DATA +◈${formatCredits(reward)}`, '#c5a6ff', 13);
      audio.sfx('scan');
      this.cb.toast?.(`ANOMALY SURVEYED — ◈${formatCredits(reward)} RECOVERED`, 'good');
      this.shake = Math.max(this.shake, 4);
    }
  }

  updateSpawns(dt) {
    if (!this.world || this.world.meta.danger <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = rand(48, 80);
      const alive = this.enemies.length;
      const target = clamp(1 + this.world.meta.danger * 2, 1, 10);
      if (alive < target + 2) {
        const n = randInt(1, 2);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), r = rand(1500, 2600);
          const e = this.spawnEnemy({ x: Math.cos(a) * r, y: Math.sin(a) * r });
          e.aggro = false;
        }
        this.cb.toast?.('PIRATE SIGNALS DETECTED ON LONG-RANGE SCAN', 'warn');
        audio.sfx('warn');
      }
    }
  }

  updateAsteroids(dt) {
    for (const a of this.world.asteroids) {
      if (a.amount > 0 || a.radius > 5) a.angle += a.spin * dt;
    }
    // derelict crates
    const d = this.world.derelict;
    if (d && !d.looted && this.player) {
      for (const c of d.crates) {
        if (c.taken) continue;
        if (dist(this.player.x, this.player.y, c.x, c.y) < 80) {
          c.taken = true;
          if (c.kind === 'credits') {
            this.state.credits += c.value;
            this.state.stats.creditsEarned += c.value;
            this.addText(c.x, c.y - 20, `SALVAGE +◈${formatCredits(c.value)}`, '#ffd166', 12);
          } else {
            const added = this.addCargo(c.commodity, c.value);
            if (added > 0) this.addText(c.x, c.y - 20, `SALVAGE +${added} ${COMMODITY_MAP[c.commodity].name}`, COMMODITY_MAP[c.commodity].color, 11);
            else this.state.credits += c.value * 40;
          }
          audio.sfx('coin');
          this.spawnSparks(c.x, c.y, rand(0, TAU), '#ffd166', 10);
          if (d.crates.every(cc => cc.taken)) {
            d.looted = true;
            this.getSectorState().derelictLooted = true;
          }
        }
      }
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const lead = .34;
    const tx = p.x + p.vx * lead;
    const ty = p.y + p.vy * lead;
    const k = 1 - Math.exp(-5.5 * dt);
    this.camera.x = lerp(this.camera.x, tx, k);
    this.camera.y = lerp(this.camera.y, ty, k);
    const sh = this.shake;
    this.camera.shakeX = rand(-sh, sh);
    this.camera.shakeY = rand(-sh, sh);
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = Math.exp(-(p.drag || 1) * dt);
      p.vx *= drag; p.vy *= drag;
      if (p.type === 'smoke') { p.size += dt * 9; p.vx *= .98; p.vy *= .98; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    for (const r of this.rings) { r.life -= dt; r.radius += r.grow * dt; }
    this.rings = this.rings.filter(r => r.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 18 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  // ── fx helpers ───────────────────────────────────────────────────
  addParticle(p) {
    p.maxLife = p.life;
    p.type = p.type || 'spark';
    p.color = p.color || '#fff';
    p.size = p.size || 2;
    this.particles.push(p);
  }

  spawnSparks(x, y, angle, color, count = 5, speed = 150) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-.9, .9);
      const s = rand(speed * .3, speed);
      this.addParticle({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(.18, .55), size: rand(1, 2.6), color, type: 'spark', drag: 2.2
      });
    }
  }

  spawnExplosion(x, y, size = 60, color = '#ffb27a') {
    this.addRing(x, y, size * .15, size * 2.6, .62, color, 2.5);
    this.addRing(x, y, 2, size * 1.5, .35, '#fff3d0', 1.6);
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), s = rand(30, size * 5);
      this.addParticle({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(.3, 1.1), size: rand(1.2, 4.2), color: i % 3 ? color : '#fff0d0',
        type: i % 5 === 0 ? 'smoke' : 'spark', drag: 1.4
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU), s = rand(10, size * 1.4);
      this.addParticle({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(.6, 1.4), size: rand(8, 22), color: 'rgba(120,110,120,.25)', type: 'smoke', drag: .7
      });
    }
  }

  addRing(x, y, radius, endRadius, life, color, width = 2) {
    this.rings.push({ x, y, radius, endRadius, life, maxLife: life, color, width, grow: (endRadius - radius) / Math.max(.05, life) });
  }

  addText(x, y, text, color, size = 10) {
    this.texts.push({ x, y, text, color, size, life: 1.25, maxLife: 1.25 });
  }

  // ── targeting / helpers ──────────────────────────────────────────
  nearestEnemy(maxDist = 1200) {
    if (!this.player) return null;
    let best = null, bd = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(this.player.x, this.player.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  nearestAsteroid(maxDist = 430) {
    if (!this.player) return null;
    let best = null, bd = maxDist;
    for (const a of this.world.asteroids) {
      if (a.amount <= 0) continue;
      const d = dist(this.player.x, this.player.y, a.x, a.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  nearestStation() {
    if (!this.player) return null;
    let best = null, bd = 1e9;
    for (const st of this.world.stations) {
      const d = dist(this.player.x, this.player.y, st.x, st.y);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  // ── station / economy actions ────────────────────────────────────
  dock(station) {
    if (!station) return false;
    this.state.lastStation = { sx: station.sx, sy: station.sy, idx: station.idx, name: station.name };
    this.state.hull = Math.max(1, this.state.hull);
    audio.sfx('dock');
    this.cb.onDock?.(station);
    return true;
  }

  buyCommodity(station, id, qty = 1) {
    const m = station.market[id];
    if (!m) return { ok: false, msg: 'NOT TRADED HERE' };
    const maxByCargo = this.cargoFree();
    const can = Math.min(qty, maxByCargo, Math.floor(this.state.credits / m.sell));
    if (can <= 0) {
      const msg = maxByCargo <= 0 ? 'CARGO HOLD FULL' : 'INSUFFICIENT CREDITS';
      return { ok: false, msg };
    }
    this.state.credits -= m.sell * can;
    this.addCargo(id, can);
    this.state.stats.trades++;
    audio.sfx('buy');
    return { ok: true, qty: can, total: m.sell * can, msg: `BOUGHT ${can} ${COMMODITY_MAP[id].name.toUpperCase()}` };
  }

  sellCommodity(station, id, qty = 1) {
    const m = station.market[id];
    if (!m) return { ok: false, msg: 'NOT TRADED HERE' };
    const have = this.state.cargo[id] || 0;
    const can = Math.min(qty, have);
    if (can <= 0) return { ok: false, msg: 'NO CARGO TO SELL' };
    this.removeCargo(id, can);
    this.state.credits += m.buy * can;
    this.state.stats.creditsEarned += m.buy * can;
    this.state.stats.trades++;
    audio.sfx('coin');
    return { ok: true, qty: can, total: m.buy * can, msg: `SOLD ${can} ${COMMODITY_MAP[id].name.toUpperCase()}` };
  }

  repairCost(station) {
    const repair = Math.max(0, this.maxHull - this.state.hull) * 9;
    const shield = Math.max(0, this.maxShield - this.state.shield) * 4.5;
    const techMod = 1 + (6 - Math.min(6, station.tech)) * .035;
    return Math.ceil((repair + shield) * techMod);
  }

  repair(station) {
    const cost = this.repairCost(station);
    if (cost <= 0) return { ok: false, msg: 'ALL SYSTEMS NOMINAL' };
    if (this.state.credits < cost) return { ok: false, msg: 'INSUFFICIENT CREDITS' };
    this.state.credits -= cost;
    this.state.hull = this.maxHull;
    this.state.shield = this.maxShield;
    audio.sfx('dock');
    return { ok: true, msg: `HULL AND SHIELD RESTORED · ◈${formatCredits(cost)}` };
  }

  sellAllOre(station) {
    let total = 0, count = 0;
    for (const id of MINED_ORES) {
      const q = this.state.cargo[id] || 0;
      if (q > 0) {
        const price = station.market[id]?.buy || 0;
        total += price * q;
        count += q;
        this.removeCargo(id, q);
      }
    }
    if (count <= 0) return { ok: false, msg: 'NO ORE IN HOLD' };
    this.state.credits += total;
    this.state.stats.creditsEarned += total;
    this.state.stats.trades++;
    audio.sfx('coin');
    return { ok: true, msg: `SOLD ${count} ORE FOR ◈${formatCredits(total)}` };
  }

  tradeInValue() {
    return Math.round((this.ship.price * .58) / 10) * 10;
  }

  buyShip(station, ship, price) {
    if (ship.id === this.state.shipId) return { ok: false, msg: 'ALREADY FLYING THIS HULL' };
    if (this.state.credits + this.tradeInValue() < price) return { ok: false, msg: 'INSUFFICIENT CREDITS' };
    if (this.cargoUsed() > ship.cargo) return { ok: false, msg: `CARGO ${this.cargoUsed()} EXCEEDS NEW HOLD (${ship.cargo})` };
    const net = Math.max(0, price - this.tradeInValue());
    this.state.credits -= net;
    this.state.shipId = ship.id;
    this.state.hull = ship.hull;
    this.state.shield = ship.shield;
    this.state.boost = 100;
    this.state.stats.ships++;
    audio.sfx('buy');
    return { ok: true, msg: `${ship.name.toUpperCase()} ACQUIRED · ◈${formatCredits(net)} PAID`, net };
  }

  // ── contracts ────────────────────────────────────────────────────
  acceptContract(contract) {
    if (this.state.active.some(c => c.id === contract.id)) return { ok: false, msg: 'CONTRACT ALREADY ACTIVE' };
    if (contract.type === 'delivery') {
      if (this.cargoFree() < contract.qty) return { ok: false, msg: 'NOT ENOUGH FREE CARGO SPACE' };
      this.state.missionCargo.push({
        contractId: contract.id, commodity: contract.commodity, qty: contract.qty
      });
    }
    const c = { ...contract, progress: 0, acceptedAt: Date.now() };
    if (contract.type === 'survey' && this.state.visitedSet.has(sectorKey(contract.targetSector.x, contract.targetSector.y))) {
      c.progress = 1;
    }
    this.state.active.push(c);
    this.state.tutorial.mission = true;
    audio.sfx('contract');
    return { ok: true, msg: 'CONTRACT ACCEPTED' };
  }

  abandonContract(id) {
    const i = this.state.active.findIndex(c => c.id === id);
    if (i < 0) return { ok: false, msg: 'CONTRACT NOT FOUND' };
    const c = this.state.active[i];
    if (c.type === 'delivery') {
      this.state.missionCargo = this.state.missionCargo.filter(m => m.contractId !== id);
    }
    this.state.active.splice(i, 1);
    audio.sfx('uiBack');
    return { ok: true, msg: 'CONTRACT ABANDONED' };
  }

  contractProgress(c) {
    if (c.type === 'bounty') return clamp((c.progress || 0) / c.kills, 0, 1);
    if (c.type === 'survey') return c.progress ? 1 : 0;
    if (c.type === 'mining') return clamp((this.state.cargo[c.commodity] || 0) / c.qty, 0, 1);
    if (c.type === 'delivery') {
      const m = this.state.missionCargo.find(m => m.contractId === c.id);
      return m ? 1 : 0;
    }
    return 0;
  }

  applySurveyProgress() {
    if (!this.state) return;
    const key = sectorKey(this.state.sector.x, this.state.sector.y);
    for (const c of this.state.active) {
      if (c.type === 'survey' && !c.progress && sectorKey(c.targetSector.x, c.targetSector.y) === key) {
        c.progress = 1;
        this.cb.toast?.(`SURVEY DATA CAPTURED — RETURN TO ${c.giverName}`, 'good');
        audio.sfx('scan');
      }
    }
  }

  canClaimContract(c, station) {
    if (c.giverKey !== station.key) return { ok: false, msg: 'WRONG STATION' };
    if (c.type === 'delivery') {
      if (c.targetKey !== station.key) return { ok: false, msg: `DELIVER TO ${c.targetName.toUpperCase()}` };
      const m = this.state.missionCargo.find(m => m.contractId === c.id);
      if (!m || m.qty < c.qty) return { ok: false, msg: 'MISSION CARGO MISSING' };
      return { ok: true };
    }
    if (c.type === 'mining') {
      if ((this.state.cargo[c.commodity] || 0) < c.qty) return { ok: false, msg: `NEED ${c.qty} ${COMMODITY_MAP[c.commodity].name.toUpperCase()}` };
      return { ok: true };
    }
    if (c.type === 'bounty') {
      if (c.progress < c.kills) return { ok: false, msg: `BOUNTIES ${c.progress}/${c.kills}` };
      return { ok: true };
    }
    if (c.type === 'survey') {
      if (!c.progress) return { ok: false, msg: 'SURVEY NOT COMPLETE' };
      return { ok: true };
    }
    return { ok: false, msg: 'UNKNOWN CONTRACT' };
  }

  claimContract(c, station) {
    const can = this.canClaimContract(c, station);
    if (!can.ok) return can;
    if (c.type === 'delivery') {
      this.state.missionCargo = this.state.missionCargo.filter(m => m.contractId !== c.id);
    } else if (c.type === 'mining') {
      this.removeCargo(c.commodity, c.qty);
    }
    this.state.credits += c.reward;
    this.state.stats.creditsEarned += c.reward;
    this.state.stats.contracts++;
    this.state.active = this.state.active.filter(x => x.id !== c.id);
    audio.sfx('contract');
    return { ok: true, msg: `CONTRACT COMPLETE · ◈${formatCredits(c.reward)} PAID` };
  }

  // death / respawn
  respawn() {
    const s = this.state;
    s.stats.deaths = s.stats.deaths || 0;
    const lost = Math.round(s.credits * .2);
    s.credits = Math.max(0, s.credits - lost);
    s.cargo = {};
    s.missionCargo = [];
    s.active = s.active.filter(c => c.type !== 'delivery');
    s.hull = this.maxHull;
    s.shield = this.maxShield;
    s.boost = 100;
    const last = s.lastStation || { sx: 0, sy: 0, idx: 0, name: 'HALCYON EXCHANGE' };
    this.dead = false;
    this.enterSector(last.sx, last.sy, { spawnNearStation: true, silent: true });
    this.cb.onSector?.(this.world.meta, { respawn: true });
    return { lost };
  }

  // ── persistence ─────────────────────────────────────────────────
  serialize() {
    const s = this.state;
    return {
      v: 1, seed: s.seed, createdAt: s.createdAt,
      credits: Math.round(s.credits), shipId: s.shipId,
      hull: Math.round(s.hull * 10) / 10, shield: Math.round(s.shield * 10) / 10,
      boost: Math.round(s.boost),
      cargo: s.cargo, missionCargo: s.missionCargo,
      sector: s.sector, visited: s.visited,
      lastStation: s.lastStation, active: s.active,
      sectorStates: s.sectorStates,
      stats: s.stats, settings: s.settings,
      playTime: s.playTime, tutorial: s.tutorial
    };
  }

  // helpers used by UI
  xpLabel() {
    return this.ship.role.toUpperCase();
  }

  missionSummary() {
    const c = this.state.active[0];
    if (!c) return null;
    let sub = '';
    if (c.type === 'delivery') sub = `DELIVER TO ${c.targetName} · ${c.targetSector.x}:${c.targetSector.y}`;
    else if (c.type === 'mining') sub = `${this.state.cargo[c.commodity] || 0}/${c.qty} ${COMMODITY_MAP[c.commodity].name.toUpperCase()}`;
    else if (c.type === 'bounty') sub = `${c.progress}/${c.kills} KILLS · ${c.targetSector.x}:${c.targetSector.y}`;
    else if (c.type === 'survey') sub = `SURVEY ${c.targetSector.x}:${c.targetSector.y} · ${c.progress ? 'DATA READY' : 'INCOMPLETE'}`;
    return { ...c, sub, pct: this.contractProgress(c) };
  }
}
