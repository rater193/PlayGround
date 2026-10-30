// ── VOIDLINE :: procedural galaxy ────────────────────────────────────
import {
  clamp, rngAt, rngFor, rangeRng, intRng, pickRng, weightedRng, hashCoords,
  TAU
} from './util.js';
import {
  COMMODITIES, COMMODITY_MAP, MINED_ORES, STATION_TYPES, STATION_TYPE_MAP,
  FACTIONS, PIRATE_GANGS, SECTOR_A, SECTOR_B, STATION_PREFIX, STATION_SUFFIX,
  SHIPS
} from './data.js';

export const WORLD_SIZE = 6800;
export const WORLD_HALF = WORLD_SIZE / 2;

let UNIVERSE_SEED = 0x5f3759df;
export function setUniverseSeed(seed) { UNIVERSE_SEED = (seed >>> 0) || 1; }
export function getUniverseSeed() { return UNIVERSE_SEED; }

const metaCache = new Map();
const stationCache = new Map();
const boardCache = new Map();

export const sectorKey = (x, y) => `${x},${y}`;
export const sectorName = (x, y) => getSectorMeta(x, y).name;

export function getSectorMeta(x, y) {
  const key = sectorKey(x, y);
  let m = metaCache.get(key);
  if (m) return m;
  const rng = rngAt(x, y, 17, UNIVERSE_SEED);
  const d = Math.hypot(x, y);
  const start = x === 0 && y === 0;

  let danger = clamp(Math.floor(d * 0.72 + rng() * 1.9 - 0.5), 0, 5);
  if (start) danger = 0;
  const security = ['CORE SPACE', 'PATROLLED', 'CONTESTED', 'FRONTIER', 'LAWLESS', 'DEAD ZONE'][danger];
  const name = start ? 'HELIOS PRIME' : `${pickRng(rng, SECTOR_A)} ${pickRng(rng, SECTOR_B)}`;

  let stationCount;
  if (start) stationCount = 1;
  else {
    const roll = rng();
    stationCount = roll < 0.28 ? 0 : roll < 0.84 ? 1 : 2;
    if (d > 7 && roll > 0.62) stationCount += 1; // deep space hubs cluster
    stationCount = Math.min(2, stationCount);
  }

  const planetCount = start ? 2 : intRng(rng, 1, 3);
  const fieldCount = start ? 2 : intRng(rng, 1, 4);
  const hasDerelict = !start && rng() < 0.3;
  const hasAnomaly = rng() < (start ? 0.35 : 0.42);
  const hue = rangeRng(rng, 168, 322);
  const hue2 = (hue + rangeRng(rng, 35, 120)) % 360;
  const nebula = 0.2 + rng() * 0.5;

  const meta = {
    x, y, key, name, danger, security, start,
    stationCount, planetCount, fieldCount, hasDerelict, hasAnomaly,
    hue, hue2, nebula,
    seed: hashCoords(x, y, UNIVERSE_SEED),
    tech: clamp(7 - danger + Math.floor(rng() * 2), 1, 6),
    rng
  };
  metaCache.set(key, meta);
  return meta;
}

export function getStation(x, y, idx = 0, now = Date.now()) {
  const meta = getSectorMeta(x, y);
  if (idx >= meta.stationCount) return null;
  const key = `${x},${y},${idx}`;
  let st = stationCache.get(key);
  if (st) return st;
  const rng = rngFor('station', UNIVERSE_SEED, x, y, idx);

  const typeRoll = rng();
  let typeId;
  if (meta.start) typeId = 'exchange';
  else if (meta.danger >= 4) typeId = weightedRng(rng, [['frontier', 5], ['mining', 3], ['military', 1.6], ['industrial', 1]]);
  else if (meta.danger >= 2) typeId = weightedRng(rng, [['industrial', 3.2], ['mining', 3], ['exchange', 2], ['military', 1.8], ['frontier', 1.5], ['agri', 1.2]]);
  else typeId = weightedRng(rng, [['exchange', 3.4], ['industrial', 2.2], ['agri', 1.8], ['military', 1.6], ['resort', 1.3], ['mining', 1.1]]);

  const type = STATION_TYPE_MAP[typeId];
  const tech = clamp(meta.tech + (typeId === 'military' ? 1 : 0) + (typeId === 'frontier' ? -1 : 0) + (rng() < .25 ? 1 : 0), 1, 6);
  let name = `${pickRng(rng, STATION_PREFIX)} ${pickRng(rng, STATION_SUFFIX)}`;
  if (meta.start) name = 'HALCYON EXCHANGE';
  const angle = rng() * TAU;
  const radius = rangeRng(rng, 760, 2080);

  const market = {};
  for (const c of COMMODITIES) {
    const bias = type.market[c.id] || 1;
    const noise = rangeRng(rng, 0.86, 1.14);
    const factor = clamp(bias * noise, 0.52, 1.72);
    const spread = rangeRng(rng, 0.13, 0.23);
    const buy = Math.max(1, Math.round(c.base * factor * (1 - spread / 2)));
    const sell = Math.max(buy + 1, Math.round(c.base * factor * (1 + spread / 2)));
    market[c.id] = { buy, sell, factor };
  }

  const maxTier = clamp(2 + tech * 3 + (typeId === 'military' ? 1 : 0), 1, 20);
  const stock = [];
  const seen = new Set();
  const targetCount = intRng(rng, 7, 11);
  const roleBias = type.stock;
  const addShip = (ship, used = false) => {
    if (!ship || seen.has(ship.id) || stock.length >= targetCount + 2) return;
    seen.add(ship.id);
    let price = ship.price * rangeRng(rng, 0.94, 1.12);
    if (used) price *= 0.8;
    stock.push({ shipId: ship.id, price: Math.round(price / 10) * 10, used });
  };

  // guaranteed top-of-the-line offering
  const topShips = SHIPS.filter(s => s.tier === maxTier);
  if (topShips.length) addShip(pickRng(rng, topShips), rng() < .14);
  // guaranteed role-flavoured spread
  const roles = ['combat', 'trade', 'mining'];
  for (let i = 0; i < targetCount - 1; i++) {
    const role = weightedRng(rng, roles.map(r => [r, roleBias[r] || 1]));
    const tier = clamp(Math.max(1, Math.round(maxTier - Math.pow(rng(), 1.5) * maxTier * 0.9)), 1, maxTier);
    const candidates = SHIPS.filter(s => s.role === role && s.tier === tier);
    if (candidates.length) addShip(candidates[0], rng() < 0.16);
  }
  stock.sort((a, b) => {
    const sa = SHIPS.find(s => s.id === a.shipId), sb = SHIPS.find(s => s.id === b.shipId);
    return sa.tier - sb.tier || sa.role.localeCompare(sb.role);
  });

  st = {
    key, sx: x, sy: y, idx, name, typeId, type, tech, maxTier,
    faction: pickRng(rng, FACTIONS),
    angle, radius,
    pos: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
    market, stock,
    seed: hashCoords(x, y, idx + 1),
    spin: rangeRng(rng, -0.055, 0.055)
  };
  stationCache.set(key, st);
  return st;
}

export function allStationsInSector(x, y, now = Date.now()) {
  const meta = getSectorMeta(x, y);
  const out = [];
  for (let i = 0; i < meta.stationCount; i++) {
    const s = getStation(x, y, i, now);
    if (s) out.push(s);
  }
  return out;
}

export function neighbors(x, y) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    out.push({ x: x + dx, y: y + dy });
  }
  return out;
}

export function isAdjacent(a, b) {
  return a.x !== b.x || a.y !== b.y ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1 : false;
}

export function isRevealed(visited, x, y) {
  if (visited.has(sectorKey(x, y))) return true;
  return neighbors(x, y).some(n => visited.has(sectorKey(n.x, n.y)));
}

// ── sector world construction ───────────────────────────────────────
export function buildSector(x, y, persistent = {}) {
  const meta = getSectorMeta(x, y);
  const rng = rngFor('world', UNIVERSE_SEED, x, y);
  const world = {
    meta,
    stations: [],
    planets: [],
    fields: [],
    asteroids: [],
    derelict: null,
    anomaly: null,
    dockables: []
  };

  const occupied = [];
  const freeSpot = (minR, maxR, clearance) => {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * TAU;
      const r = rangeRng(rng, minR, maxR);
      const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      if (Math.hypot(p.x, p.y) < 360) continue;
      let ok = true;
      for (const o of occupied) {
        if (Math.hypot(p.x - o.x, p.y - o.y) < clearance + o.r) { ok = false; break; }
      }
      if (ok) { occupied.push({ x: p.x, y: p.y, r: clearance }); return p; }
    }
    const a = rng() * TAU, r = rangeRng(rng, minR, maxR);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };

  // stations
  for (let i = 0; i < meta.stationCount; i++) {
    const st = getStation(x, y, i);
    const p = st.pos;
    occupied.push({ x: p.x, y: p.y, r: 520 });
    world.stations.push({
      ...st,
      x: p.x, y: p.y,
      radius: 95,
      dockRadius: 245,
      visitAngle: 0,
      docked: false
    });
  }

  // planets
  for (let i = 0; i < meta.planetCount; i++) {
    const p = freeSpot(1250, 2950, 720);
    const planetRng = rngFor('planet', UNIVERSE_SEED, x, y, i);
    const radius = rangeRng(planetRng, 300, 760);
    const palette = pickRng(planetRng, [
      ['#2b6a86', '#7fd0d8', '#132c45'], ['#6b4c7d', '#c59bcf', '#22142f'],
      ['#7f5a36', '#e0b276', '#2c1a10'], ['#2c6b52', '#8fd7a4', '#0c261c'],
      ['#365a8c', '#9ec4f0', '#101d36'], ['#8a3f4c', '#ef9a8d', '#2b0e15'],
      ['#5a5f78', '#c3c8da', '#151827']
    ]);
    world.planets.push({
      x: p.x, y: p.y, radius,
      color: palette[0], light: palette[1], dark: palette[2],
      ring: planetRng() < 0.38,
      ringTilt: rangeRng(planetRng, -0.5, 0.5),
      bands: Math.round(rangeRng(planetRng, 3, 7)),
      moons: planetRng() < .45 ? 1 : 0,
      seed: Math.floor(planetRng() * 1e9),
      name: `${pickRng(planetRng, ['Kepler', 'Tethys', 'Orison', 'Vesper', 'Morrow', 'Cirrus', 'Talos', 'Iris', 'Nadir'])} ${['I', 'II', 'III', 'IV', 'V', 'VI'][Math.floor(planetRng() * 6)]}`
    });
  }

  // asteroid fields
  for (let fi = 0; fi < meta.fieldCount; fi++) {
    const p = freeSpot(950, 2750, 610);
    const fieldRng = rngFor('field', UNIVERSE_SEED, x, y, fi);
    const radius = rangeRng(fieldRng, 330, 660);
    const oreWeights = [
      ['iron', 4.2], ['titanium', 3.2], ['cobalt', 2.1], ['gold', 0.85 + meta.danger * 0.12]
    ];
    const primary = weightedRng(fieldRng, oreWeights);
    const field = {
      id: `f${fi}`, x: p.x, y: p.y, radius,
      primary,
      name: `${primary === 'gold' ? 'AURUM' : primary === 'cobalt' ? 'COBALT' : primary === 'titanium' ? 'TITAN' : 'FERRO'} FIELD ${String.fromCharCode(65 + fi)}`,
      hue: rangeRng(fieldRng, 180, 40)
    };
    world.fields.push(field);
    const count = intRng(fieldRng, 13, 26);
    for (let ai = 0; ai < count; ai++) {
      const a = fieldRng() * TAU;
      const r = Math.sqrt(fieldRng()) * radius;
      const id = `f${fi}a${ai}`;
      const ore = fieldRng() < 0.72 ? primary : weightedRng(fieldRng, oreWeights);
      const baseAmount = ore === 'gold' ? intRng(fieldRng, 14, 42) : ore === 'cobalt' ? intRng(fieldRng, 22, 62) : intRng(fieldRng, 34, 96);
      const maxAmount = baseAmount;
      const mined = persistent?.mined?.[id] || 0;
      const amount = Math.max(0, maxAmount - mined);
      const ar = rangeRng(fieldRng, 26, 86) * (0.72 + (amount / Math.max(1, maxAmount)) * 0.28);
      const points = [];
      const n = intRng(fieldRng, 7, 11);
      for (let k = 0; k < n; k++) {
        const aa = (k / n) * TAU;
        points.push(rangeRng(fieldRng, 0.72, 1.12));
      }
      world.asteroids.push({
        id, fieldId: field.id,
        x: field.x + Math.cos(a) * r,
        y: field.y + Math.sin(a) * r,
        radius: ar, baseRadius: ar,
        angle: fieldRng() * TAU,
        spin: rangeRng(fieldRng, -0.22, 0.22),
        ore, amount, maxAmount,
        shape: points,
        tint: rangeRng(fieldRng, 0, 1)
      });
    }
  }

  // derelict
  if (meta.hasDerelict) {
    const p = freeSpot(800, 2600, 380);
    world.derelict = {
      x: p.x, y: p.y, angle: rng() * TAU, radius: 92,
      name: `${pickRng(rng, ['ION WAKE', 'PALE HORSE', 'LAST LIGHT', 'GRAVE TIDE', 'SILENT MERIDIAN', 'OLD COVENANT'])}`,
      looted: !!persistent?.derelictLooted,
      crates: [
        { id: 'd0', x: p.x + Math.cos(rng() * TAU) * 110, y: p.y + Math.sin(rng() * TAU) * 110, kind: 'credits', value: intRng(rng, 400, 2200), taken: false },
        { id: 'd1', x: p.x + Math.cos(rng() * TAU) * 150, y: p.y + Math.sin(rng() * TAU) * 150, kind: 'ore', commodity: pickRng(rng, MINED_ORES), value: intRng(rng, 8, 26), taken: false }
      ]
    };
  }

  // anomaly
  if (meta.hasAnomaly) {
    const p = freeSpot(1100, 2900, 300);
    world.anomaly = {
      x: p.x, y: p.y, radius: 130,
      phase: rng() * TAU,
      scanned: !!persistent?.anomalyScanned,
      name: `${pickRng(rng, ['GRAVITIC ECHO', 'COLD SIGNAL', 'UNKNOWN RELIC', 'PHASE WAKE', 'DEAD BEACON'])}`,
      reward: intRng(rng, 900, 3400)
    };
  }

  world.dockables = world.stations;
  return world;
}

// ── contracts ───────────────────────────────────────────────────────
function contractId(parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    for (const ch of String(p)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  }
  return 'c' + (h >>> 0).toString(36);
}

export function getContracts(station, accepted = new Set()) {
  const bucket = Math.floor(Date.now() / 600000);
  const cacheKey = `${station.key}:${bucket}`;
  let board = boardCache.get(cacheKey);
  if (!board) {
    board = generateBoard(station, bucket);
    boardCache.set(cacheKey, board);
  }
  return board.filter(c => !accepted.has(c.id));
}

function findStationSectorNear(x, y, rng, minD = 1, maxD = 3) {
  const candidates = [];
  for (let dx = -maxD; dx <= maxD; dx++) for (let dy = -maxD; dy <= maxD; dy++) {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d < minD || d > maxD) continue;
    const m = getSectorMeta(x + dx, y + dy);
    if (m.stationCount > 0) candidates.push({ x: x + dx, y: y + dy, d, danger: m.danger });
  }
  if (!candidates.length) return null;
  // slightly favour nearby stations
  return weightedRng(rng, candidates.map(c => [c, 1 / (c.d * 0.7 + 0.5)]));
}

function generateBoard(station, bucket) {
  const rng = rngFor('board', UNIVERSE_SEED, station.key, bucket);
  const count = intRng(rng, 4, 6);
  const out = [];
  const meta = getSectorMeta(station.sx, station.sy);

  for (let i = 0; i < count; i++) {
    const type = weightedRng(rng, [
      ['delivery', 3.2], ['mining', station.typeId === 'mining' || station.typeId === 'industrial' ? 3.8 : 2.4],
      ['bounty', meta.danger >= 2 ? 3.3 : 1.6], ['survey', 1.6]
    ]);
    let c = null;
    if (type === 'delivery') {
      const target = findStationSectorNear(station.sx, station.sy, rng, 1, 3);
      if (target) {
        const ts = getStation(target.x, target.y, 0);
        if (ts) {
          const commodity = pickRng(rng, COMMODITIES.filter(c => !c.mined));
          const qty = intRng(rng, 5, Math.max(8, Math.round(14 + 10 / Math.sqrt(COMMODITY_MAP[commodity.id].base / 26))));
          const dist = Math.hypot(target.x - station.sx, target.y - station.sy);
          const reward = Math.round((qty * commodity.base * 1.55 + dist * 460 + 420) / 10) * 10;
          c = {
            id: contractId([station.key, bucket, i, 'del']),
            type: 'delivery',
            giverKey: station.key, giverName: station.name,
            giverSector: { x: station.sx, y: station.sy },
            targetKey: ts.key, targetName: ts.name,
            targetSector: { x: target.x, y: target.y },
            commodity: commodity.id, qty, reward,
            title: `Deliver ${qty} ${commodity.name} to ${ts.name}`,
            desc: `${ts.name} in sector ${target.x}:${target.y} is short on ${commodity.name.toLowerCase()}. Cargo is provided on acceptance; deliver it intact.`,
            note: `Destination: ${ts.name} · ${target.x}:${target.y}`
          };
        }
      }
    } else if (type === 'mining') {
      const oreId = weightedRng(rng, [['iron', 3], ['titanium', 3], ['cobalt', 2], ['gold', 1]]);
      const ore = COMMODITY_MAP[oreId];
      const qty = oreId === 'gold' ? intRng(rng, 6, 18) : oreId === 'cobalt' ? intRng(rng, 12, 28) : intRng(rng, 18, 44);
      const reward = Math.round((qty * ore.base * 1.75 + 650) / 10) * 10;
      c = {
        id: contractId([station.key, bucket, i, 'mine']),
        type: 'mining',
        giverKey: station.key, giverName: station.name,
        giverSector: { x: station.sx, y: station.sy },
        commodity: oreId, qty, reward,
        title: `Supply ${qty} ${ore.name}`,
        desc: `The refinery here needs ${qty} units of ${ore.name.toLowerCase()}. Mine it from any asteroid field and return with it in your hold.`,
        note: `Turn in at ${station.name}`
      };
    } else if (type === 'bounty') {
      let target = { x: station.sx, y: station.sy };
      let bestDanger = meta.danger;
      if (meta.danger < 2) {
        const nearby = findStationSectorNear(station.sx, station.sy, rng, 1, 2);
        if (nearby) { target = nearby; bestDanger = nearby.danger; }
      }
      const gang = pickRng(rng, PIRATE_GANGS);
      const kills = intRng(rng, 3, 7);
      const reward = Math.round((kills * (520 + bestDanger * 290) + 520) / 10) * 10;
      c = {
        id: contractId([station.key, bucket, i, 'bounty']),
        type: 'bounty',
        giverKey: station.key, giverName: station.name,
        giverSector: { x: station.sx, y: station.sy },
        targetSector: { x: target.x, y: target.y },
        faction: gang, kills, reward,
        title: `Clear ${kills} ${gang} ships`,
        desc: `Pirates from ${gang} are strangling traffic in sector ${target.x}:${target.y}. Destroy ${kills} of their ships, then return for payment.`,
        note: `Target sector ${target.x}:${target.y} · ${bestDanger >= 4 ? 'EXTREME RISK' : bestDanger >= 2 ? 'HOSTILE' : 'LOW RISK'}`
      };
    } else {
      const target = findStationSectorNear(station.sx, station.sy, rng, 2, 3);
      if (target) {
        const dist = Math.hypot(target.x - station.sx, target.y - station.sy);
        const reward = Math.round((1250 + dist * 620) / 10) * 10;
        c = {
          id: contractId([station.key, bucket, i, 'survey']),
          type: 'survey',
          giverKey: station.key, giverName: station.name,
          giverSector: { x: station.sx, y: station.sy },
          targetSector: { x: target.x, y: target.y },
          reward,
          title: `Survey sector ${target.x}:${target.y}`,
          desc: `Long-range telemetry is stale. Jump into sector ${target.x}:${target.y}, complete a passive sweep, then return to ${station.name} for payment.`,
          note: `Target sector ${target.x}:${target.y} · ${getSectorMeta(target.x, target.y).name}`
        };
      }
    }
    if (c) out.push(c);
  }

  if (!out.length) {
    const ore = COMMODITY_MAP[pickRng(rng, MINED_ORES)];
    const qty = intRng(rng, 12, 24);
    out.push({
      id: contractId([station.key, bucket, 'fallback']),
      type: 'mining', giverKey: station.key, giverName: station.name,
      giverSector: { x: station.sx, y: station.sy }, commodity: ore.id, qty,
      reward: Math.round((qty * ore.base * 1.8 + 600) / 10) * 10,
      title: `Supply ${qty} ${ore.name}`,
      desc: `A standing order for ${qty} units of ${ore.name.toLowerCase()}. Any asteroid field will do.`,
      note: `Turn in at ${station.name}`
    });
  }
  return out;
}

export function stationAtSector(x, y, idx = 0) {
  return getStation(x, y, idx);
}

export function sectorDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
