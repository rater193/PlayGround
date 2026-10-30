// ── VOIDLINE :: math + deterministic generation helpers ──────────────
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smooth = t => t * t * (3 - 2 * t);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2;
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const wrapAngle = a => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export const angleDelta = (a, b) => wrapAngle(b - a);
export const turnToward = (a, b, maxStep) => a + clamp(angleDelta(a, b), -maxStep, maxStep);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const chance = p => Math.random() < p;

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashCoords(x, y, seed = 0) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(a) {
  let t = a >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngAt(x, y, salt = 0, seed = 0) {
  return mulberry32(hashCoords(x, y, (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0));
}

export function rngFor(...parts) {
  return mulberry32(hashString(parts.join('::')));
}

export function rangeRng(rng, a, b) { return a + rng() * (b - a); }
export function intRng(rng, a, b) { return Math.floor(rangeRng(rng, a, b + 0.9999)); }
export function pickRng(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function weightedRng(rng, entries) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rng() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}

export function formatCredits(n) {
  const v = Math.round(n);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e5) return (v / 1e3).toFixed(0) + 'K';
  return v.toLocaleString('en-US');
}

export function formatNum(n) {
  const v = Math.round(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

export function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  return Math.floor(s / 3600) + 'h';
}

export function clamp01(x) { return clamp(x, 0, 1); }

export function circleHit(ax, ay, ar, bx, by, br) {
  const rr = ar + br;
  return dist2(ax, ay, bx, by) < rr * rr;
}

export function segCircle(x1, y1, x2, y2, cx, cy, cr) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return dist2(x1, y1, cx, cy) < cr * cr;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - cr * cr;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a), t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

export function approachZero(v, amount) {
  if (Math.abs(v) <= amount) return 0;
  return v - Math.sign(v) * amount;
}

export function shuffleRng(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

export function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
