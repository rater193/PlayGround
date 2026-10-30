// ── VOIDLINE :: static game data ─────────────────────────────────────
export const ROLES = {
  combat: {
    id: 'combat', label: 'COMBAT', color: '#ff6f7d', soft: '#ffb1b8',
    accent: '#ff8a64', tagline: 'Hunt. Escort. Eliminate.',
    desc: 'Fast, heavily armed hulls built to punch through pirate blockades and collect bounties.'
  },
  trade: {
    id: 'trade', label: 'TRADE', color: '#5ee6ff', soft: '#b4f6ff',
    accent: '#72a7ff', tagline: 'Haul. Haggle. Profit.',
    desc: 'Massive cargo holds and long legs. Move goods between stations and turn distance into credits.'
  },
  mining: {
    id: 'mining', label: 'MINING', color: '#ffc35e', soft: '#ffe0a1',
    accent: '#ff9f45', tagline: 'Crack. Extract. Refine.',
    desc: 'Industrial frames with powerful extraction beams and reinforced holds for deep-field prospecting.'
  }
};

export const COMMODITIES = [
  { id: 'iron', name: 'Iron Ore', code: 'FE', base: 26, color: '#9fb1c4', cat: 'ore', mined: true, desc: 'Common ferrous ore. Always in demand at industrial stations.' },
  { id: 'titanium', name: 'Titanium', code: 'TI', base: 58, color: '#b9c8dd', cat: 'ore', mined: true, desc: 'Light, strong alloy feedstock used in hull fabrication.' },
  { id: 'cobalt', name: 'Cobalt', code: 'CO', base: 96, color: '#7f9cff', cat: 'ore', mined: true, desc: 'Heat-resistant metal for reactor linings and precision parts.' },
  { id: 'gold', name: 'Gold Ore', code: 'AU', base: 248, color: '#ffd166', cat: 'ore', mined: true, desc: 'Rare precious ore. Small volumes, large paydays.' },
  { id: 'water', name: 'Water', code: 'H2O', base: 17, color: '#6fc8ff', cat: 'food', desc: 'Recycled potable water. Cheap, bulky, and always needed.' },
  { id: 'food', name: 'Food Paste', code: 'FD', base: 24, color: '#8ee07a', cat: 'food', desc: 'Shelf-stable nutrient paste. Agri stations sell it cheap.' },
  { id: 'medicine', name: 'Medicine', code: 'MED', base: 118, color: '#79ffcf', cat: 'goods', desc: 'Stabilized medicines and trauma kits. High value in frontier ports.' },
  { id: 'electronics', name: 'Electronics', code: 'ELX', base: 186, color: '#b79bff', cat: 'tech', desc: 'Avionics, sensors and control boards. Industrial stations undercut the rest.' },
  { id: 'parts', name: 'Machine Parts', code: 'PRT', base: 154, color: '#ffab73', cat: 'tech', desc: 'Precision components for station upkeep and ship repair.' },
  { id: 'luxury', name: 'Luxury Goods', code: 'LUX', base: 326, color: '#ff7fd4', cat: 'luxury', desc: 'Rare textiles, spirits and art. Resort stations pay a premium.' }
];
export const COMMODITY_MAP = Object.fromEntries(COMMODITIES.map(c => [c.id, c]));
export const MINED_ORES = COMMODITIES.filter(c => c.mined).map(c => c.id);

export const STATION_TYPES = [
  { id: 'exchange', label: 'ORBITAL EXCHANGE', color: '#6ff2ff', desc: 'Balanced markets and a broad ship catalogue.', tech: 1, stock: { trade: 1.3, combat: 1.0, mining: 1.0 }, market: {} },
  { id: 'industrial', label: 'INDUSTRIAL YARD', color: '#ffab73', desc: 'Cheap machine parts and electronics; hungry for ore.', tech: 0, stock: { trade: 1.1, combat: 0.9, mining: 1.35 }, market: { parts: 0.72, electronics: 0.8, iron: 1.18, titanium: 1.22, cobalt: 1.15 } },
  { id: 'mining', label: 'MINING OUTPOST', color: '#ffcf6a', desc: 'Ore buyers pay well. Food and medicine cost more.', tech: -1, stock: { trade: 0.85, combat: 0.7, mining: 1.7 }, market: { iron: 1.28, titanium: 1.3, cobalt: 1.28, gold: 1.18, food: 1.2, water: 1.2, medicine: 1.18 } },
  { id: 'agri', label: 'AGRI COLONY', color: '#8ee07a', desc: 'Food and water are cheap. Medicine and tech sell high.', tech: -1, stock: { trade: 1.25, combat: 0.6, mining: 0.85 }, market: { food: 0.6, water: 0.58, medicine: 1.28, electronics: 1.22, parts: 1.2 } },
  { id: 'military', label: 'MILITARY ANCHORAGE', color: '#ff6f7d', desc: 'Top-tier combat hulls. Pays premium for medicine and electronics.', tech: 1, stock: { trade: 0.65, combat: 1.85, mining: 0.55 }, market: { medicine: 1.3, electronics: 1.26, parts: 1.2, luxury: 0.9 } },
  { id: 'resort', label: 'RESORT HABITAT', color: '#ff7fd4', desc: 'Luxury goods command ridiculous prices. Everything else is expensive.', tech: 1, stock: { trade: 1.1, combat: 0.85, mining: 0.5 }, market: { luxury: 1.55, food: 1.32, water: 1.25, medicine: 1.1 } },
  { id: 'frontier', label: 'FRONTIER DEPOT', color: '#b79bff', desc: 'Scarce stock, rough crews, and a taste for contraband prices.', tech: 0, stock: { trade: 0.95, combat: 1.0, mining: 1.0 }, market: { medicine: 1.36, parts: 1.28, luxury: 1.22, iron: 1.1 } }
];
export const STATION_TYPE_MAP = Object.fromEntries(STATION_TYPES.map(s => [s.id, s]));

export const FACTIONS = [
  'FREE TRADERS UNION', 'HELIOS CONSORTIUM', 'ORION FRONTIER AUTHORITY', 'COBALT GUILD',
  'SEVENTH MERIDIAN', 'ASHFALL SYNDICATE', 'PALE STAR COMPACT', 'VANGUARD COLONIAL',
  'NOVA CARTEL', 'DEEP VEIL MINING CO.'
];

// 20 hulls per branch. Stats scale by tier; names are hand-authored.
const NAMES = {
  combat: ['Talon', 'Wasp', 'Sabre', 'Raptor', 'Shrike', 'Viper', 'Lancer', 'Falcon', 'Tempest', 'Reaver',
    'Wraith', 'Specter', 'Nemesis', 'Basilisk', 'Thunderhead', 'Manticore', 'Dreadnought', 'Sovereign', 'Apex', 'Annihilator'],
  trade: ['Mule', 'Packhorse', 'Courier', 'Clipper', 'Freighter', 'Hauler', 'Caravan', 'Merchant', 'Trader', 'Galleon',
    'Atlas', 'Behemoth', 'Leviathan', 'Colossus', 'Titan', 'Juggernaut', 'Beacon', 'Concord', 'Dominion', 'Monolith'],
  mining: ['Pickaxe', 'Prospector', 'Drillbit', 'Excavator', 'Rockhound', 'Veinfinder', 'Borer', 'Tunneler', 'Crusher', 'Sifter',
    'Motherlode', 'Quarry', 'Deepcore', 'Rockbreaker', 'Orehound', 'Terranova', 'Geode', 'Bedrock', 'Midas', 'Worldcarver']
};
const MAKERS = {
  combat: ['Kestrel Dynamics', 'Vanguard Arms', 'Ravenlark Military', 'Ironveil Systems', 'Aegis Foundry'],
  trade: ['Meridian Freight', 'Halcyon Lift', 'Atlas Bulkworks', 'Cobalt Line', 'Longhaul Cooperative'],
  mining: ['Cobalt Works', 'Terra Extract', 'Deep Veil Industrial', 'Moleworth Heavy', 'Oreline Fabrication']
};
const FLAVOR = {
  combat: [
    'A nimble patrol frame with a single oversized cannon. Cheap to run, mean in a knife fight.',
    'Point-defense wings and a hot reactor. Built to break up raider packs before they scatter.',
    'The first hull in the line with twin hardpoints. A favourite of station marshals.',
    'Reinforced spine, quick vectoring. Outruns anything it cannot outgun.',
    'A strike fighter with an appetite for bounties and a cockpit like a coffin.',
    'Low-signature hull plates make this the ambusher\'s choice in dark sectors.',
    'Long-range lance capacitor. One clean pass is usually enough.',
    'Escort-rated frame with redundant shield emitters and a brutal close-in battery.',
    'Overbuilt reactor and vented armour. It turns, it burns, it comes back.',
    'The pirate captains know this silhouette. Most turn away. Most.',
    'Phase-tuned targeting array. Its shots seem to arrive before the sound does.',
    'A ghost of the outer lanes — cold thrusters, hot guns, no wasted mass.',
    'Fleet-interceptor doctrine in a single seat. Nothing survives the second pass.',
    'Serpentine armour geometry deflects glancing fire while the main gun charges.',
    'A gunship disguised as a fighter. Shake the stick and the whole sky opens up.',
    'Heavy assault frame with layered shields. Built for the fight you cannot avoid.',
    'Capital-adjacent firepower on a frigate chassis. Crew of three, ego of thirty.',
    'Sovereign-class command fighter. Its arrival changes the terms of engagement.',
    'The apex predator of the line. Two reactors, four hardpoints, zero hesitation.',
    'A myth with engines. The last thing many squadrons ever register on sensors.'
  ],
  trade: [
    'A dependable light hauler. Slow to anger, slower to stop.',
    'Doubled container clamps and a livable cabin. The working captain\'s first step up.',
    'Stripped-down courier frame. Sacrifices cargo for the kind of speed that keeps contracts alive.',
    'Fast clipper with a narrow profile. Smugglers swear by the hull geometry.',
    'The classic mid-weight freighter. Ugly, roomy, and almost impossible to kill.',
    'Long-haul workhorse with a generous hold and a surprisingly strong shield grid.',
    'Convoy leader. Its cargo pods can be jettisoned as decoys — a grim but useful feature.',
    'Merchant-class hull with a market uplink suite and a proper galley.',
    'A trader\'s trader. Every system is overbuilt for the long silence between stations.',
    'Galleon frame with modular holds. Turn a profit on volume, not velocity.',
    'Atlas heavy lifter. Stations build entire economies around one of these arriving.',
    'Behemoth bulk carrier. The engines are the size of a small station.',
    'Leviathan-class freighter. It does not dodge asteroid fields; it negotiates.',
    'Colossal hull with triple-layer cargo shielding and a small city inside.',
    'Titan-class superfreighter. Its wake bends debris fields for a hundred kilometres.',
    'Juggernaut industrial carrier. Armed enough to remind pirates that cargo fights back.',
    'Beacon-class command transport. Fleet logistics, market intelligence, and a very good bed.',
    'Concord trade cruiser. A mobile embassy with a hold full of leverage.',
    'Dominion-class megahauler. Entire sectors adjust prices when it docks.',
    'Monolith. The largest civilian hull ever licensed. A station that happens to move.'
  ],
  mining: [
    'A single-seat prospector with a focus beam and a stubborn little reactor.',
    'The classic claim-jumper. Enough hold space for a good day in the belt.',
    'Twin cutting heads and a reinforced nose. Chews rock faster than it should.',
    'Industrial excavator with an articulated boom and a cabin full of dust.',
    'Rockhound frame. Its ore sorter is worth more than the engines.',
    'Vein-finder suite and a deep-core drill. Built for the deposits others miss.',
    'Borer-class hull with hardened extraction arrays and a two-person crew pod.',
    'Tunneler. Can process a small asteroid without ever slowing down.',
    'Crusher frame with an onboard smelter and a very loud warning klaxon.',
    'Sifter-class refinery ship. Separates the good rock from the waste in real time.',
    'Motherlode. A mobile mining camp with lights, cranes and a coffee machine.',
    'Quarry-class heavy extractor. The drill alone masses more than a fighter.',
    'Deepcore industrial. Rated for radiation belts and claims nobody else will touch.',
    'Rockbreaker. Its wake is a trail of gravel and terrified survey drones.',
    'Orehound. Long-range sensors sniff out gold through half a kilometre of stone.',
    'Terranova. A self-sufficient prospecting platform with a full refinery deck.',
    'Geode-class harvester. Cuts, sorts, and packages ore before the dust settles.',
    'Bedrock. Reinforced to operate inside a collapsing asteroid if the pay is good.',
    'Midas. Turns a dead rock into a payday with almost indecent efficiency.',
    'Worldcarver. The undisputed king of the belt. Stations clear their schedules for it.'
  ]
};

function shipPerks(role, tier) {
  const perks = [];
  if (tier >= 5) perks.push(role === 'combat' ? 'Twin-linked targeting' : role === 'trade' ? 'Expanded hold clamps' : 'Hardened drill bearings');
  if (tier >= 10) perks.push('Reinforced shield capacitors');
  if (tier >= 15) perks.push(role === 'combat' ? 'Overcharged weapon bus' : role === 'trade' ? 'Convoy shield lattice' : 'Resonant extraction beam');
  if (tier >= 20) perks.push('Flagship-grade reactor');
  return perks;
}

function makeShip(role, tier, idx) {
  const t = tier;
  const base = {
    combat: { hull: 132 + 28 * t, shield: 62 + 18 * t, speed: 238 + 3.1 * t, cargo: 26 + 2.4 * t, mining: 1.0, damage: 10.5 + 3.15 * t, rate: 5.15 + .055 * t, range: 760 + 9 * t, regen: 4.2 + .55 * t },
    trade: { hull: 122 + 26 * t, shield: 48 + 14 * t, speed: 194 + 2.9 * t, cargo: 92 + 24 * t, mining: 1.25, damage: 7 + 1.7 * t, rate: 4.15 + .04 * t, range: 640 + 7 * t, regen: 3.1 + .4 * t },
    mining: { hull: 144 + 27 * t, shield: 56 + 16 * t, speed: 208 + 3.0 * t, cargo: 64 + 13.5 * t, mining: 2.3 + .72 * t, damage: 8 + 2.2 * t, rate: 4.55 + .045 * t, range: 690 + 8 * t, regen: 3.6 + .46 * t }
  }[role];
  const priceMul = { combat: 1.12, trade: 1.18, mining: 1.08 }[role];
  let price = 4200 * priceMul * Math.pow(1.285, tier - 1);
  if (tier >= 18) price *= 1.18;
  price = Math.round(price / 50) * 50;
  const hardpoints = tier >= 16 ? 3 : tier >= 8 ? 2 : 1;
  return {
    id: `${role}-${tier}`,
    role, tier,
    name: NAMES[role][idx],
    maker: MAKERS[role][idx % MAKERS[role].length],
    price,
    hull: Math.round(base.hull),
    shield: Math.round(base.shield),
    speed: Math.round(base.speed),
    cargo: Math.round(base.cargo),
    mining: +base.mining.toFixed(2),
    damage: +base.damage.toFixed(1),
    rate: +base.rate.toFixed(2),
    range: Math.round(base.range),
    regen: +base.regen.toFixed(1),
    hardpoints,
    flavor: FLAVOR[role][idx],
    perks: shipPerks(role, tier),
    start: tier === 1
  };
}

export const SHIPS = [];
for (const role of ['combat', 'trade', 'mining']) {
  NAMES[role].forEach((_, i) => SHIPS.push(makeShip(role, i + 1, i)));
}
export const SHIP_MAP = Object.fromEntries(SHIPS.map(s => [s.id, s]));
export const STARTERS = ['combat-1', 'trade-1', 'mining-1'];

export function shipById(id) { return SHIP_MAP[id] || SHIP_MAP['combat-1']; }
export function shipsForRole(role) { return SHIPS.filter(s => s.role === role); }

export const ENEMY_TYPES = [
  { id: 'raider', name: 'Raider', hull: 74, shield: 18, speed: 212, damage: 5, rate: 1.7, range: 520, reward: 1.0, scale: .78 },
  { id: 'gunner', name: 'Gunboat', hull: 168, shield: 42, speed: 150, damage: 9, rate: 1.3, range: 600, reward: 1.55, scale: 1.1 },
  { id: 'sniper', name: 'Lance', hull: 92, shield: 30, speed: 172, damage: 15, rate: .72, range: 860, reward: 1.45, scale: .9 },
  { id: 'interceptor', name: 'Interceptor', hull: 66, shield: 26, speed: 285, damage: 4, rate: 2.4, range: 460, reward: 1.25, scale: .7 }
];

// procedural naming vocabulary
export const SECTOR_A = ['HELIOS', 'ARCTURUS', 'VEGA', 'NADIR', 'ORISON', 'KEPLER', 'CASSINI', 'MERIDIAN', 'HALCYON', 'PYRRHUS',
  'TALOS', 'ELYSIUM', 'CIRRUS', 'ORPHEUS', 'VULCAN', 'ANDROMEDA', 'SIRIUS', 'CALYPSO', 'NEREID', 'OBERON', 'TETHYS', 'LUMEN',
  'ASHFALL', 'PALE', 'NOVA', 'VESPER', 'IRIDIUM', 'COBALT', 'SOLACE', 'HORIZON', 'ZEPHYR', 'MORROW', 'SABLE', 'QUASAR'];
export const SECTOR_B = ['PRIME', 'REACH', 'GATE', 'EXPANSE', 'DRIFT', 'CROSSING', 'HOLLOW', 'SHOAL', 'VERGE', 'WAKE',
  'ANCHORAGE', 'BASIN', 'SPUR', 'TREK', 'LATTICE', 'DEPTHS', 'CROWN', 'VEIL', 'TIDE', 'BREAK', 'FALL', 'RIFT', 'HAVEN'];
export const STATION_PREFIX = ['HALCYON', 'KESTREL', 'MERIDIAN', 'ORISON', 'VESPER', 'CASSINI', 'NADIR', 'SOLACE', 'AURORA',
  'TALOS', 'CIRRUS', 'LUMEN', 'PALE STAR', 'ORION', 'VANGUARD', 'COBALT', 'ASHFALL', 'NOVA', 'TETHYS', 'OBERON', 'IRIS', 'MORROW',
  'SABLE', 'ZEPHYR', 'HELIOS', 'CALYPSO', 'PYRRHUS', 'ANDROMEDA'];
export const STATION_SUFFIX = ['EXCHANGE', 'DEPOT', 'STATION', 'YARD', 'HAVEN', 'SPIRE', 'JUNCTION', 'ANCHORAGE', 'OUTPOST', 'RELAY', 'BASTION', 'TERMINAL'];

export const PIRATE_GANGS = ['ASHFALL SYNDICATE', 'RED WAKE', 'THE HOLLOW PACK', 'NOVA CARTEL', 'VEIL CUTTERS',
  'SEVENTH MERIDIAN RAIDERS', 'GRAVE TIDE', 'BLACK KESTREL', 'THE RUST CHOIR', 'NOCTURNE FLOTILLA'];

export const QUALITY = { high: true, low: false };
