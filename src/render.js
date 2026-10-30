// ── VOIDLINE :: canvas renderer ──────────────────────────────────────
import { TAU, clamp, lerp, rgba, hexToRgb, dist, angleTo, wrapAngle, hashString, mulberry32, formatCredits } from './util.js';
import { SHIP_MAP, COMMODITY_MAP, ROLES } from './data.js';
import { sectorKey, getSectorMeta, isRevealed, neighbors, getStation } from './galaxy.js';

const TAU2 = Math.PI * 2;

function mixColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A.r, B.r, t))},${Math.round(lerp(A.g, B.g, t))},${Math.round(lerp(A.b, B.b, t))})`;
}

const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  const rgb = hexToRgb(color);
  grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
  grad.addColorStop(.22, `rgba(${rgb.r},${rgb.g},${rgb.b},.55)`);
  grad.addColorStop(.6, `rgba(${rgb.r},${rgb.g},${rgb.b},.12)`);
  grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  glowCache.set(color, c);
  return c;
}

function drawGlow(ctx, x, y, radius, color, alpha = 1) {
  const s = glowSprite(color);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.w = 1; this.h = 1; this.dpr = 1;
    this.zoom = 1;
    this.quality = 'high';
    this.stars = null;
    this.starKey = '';
    this.starSeed = 0;
    this.titleStars = null;
    this.titlePlanet = null;
    this.planetCache = new Map();
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 2);
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.zoom = clamp(Math.min(w, h) / 820, .7, 1.16);
    if (w > 1100 && h > 720) this.zoom = clamp(Math.min(w / 1440, h / 900) * 1.13, .86, 1.2);
    this.planetCache.clear();
    this.stars = null;
    this.titlePlanet = null;
  }

  setQuality(q) {
    this.quality = q;
    this.resize();
  }

  // ── backgrounds ─────────────────────────────────────────────────
  makeStars(seed, count = 260) {
    const rng = mulberry32(seed || 1);
    const layers = [];
    const specs = [
      { f: .035, n: Math.round(count * .42), min: .4, max: .95, size: [.5, 1.1], alpha: [.18, .48] },
      { f: .09, n: Math.round(count * .34), min: .5, max: 1.4, size: [.7, 1.6], alpha: [.3, .7] },
      { f: .18, n: Math.round(count * .24), min: .6, max: 1.9, size: [1, 2.2], alpha: [.45, .95] }
    ];
    for (const s of specs) {
      const arr = [];
      for (let i = 0; i < s.n; i++) {
        arr.push({
          x: rng(), y: rng(),
          size: lerp(s.size[0], s.size[1], rng()),
          a: lerp(s.alpha[0], s.alpha[1], rng()),
          tw: rng() * TAU2,
          hue: rng() < .18 ? (rng() < .5 ? 190 : 38) : 0
        });
      }
      layers.push({ f: s.f, stars: arr });
    }
    return layers;
  }

  drawSpaceBackground(ctx, game, time) {
    const { w, h } = this;
    const meta = game.world?.meta;
    const key = meta ? meta.key : 'title';
    if (!this.stars || this.starKey !== key) {
      this.stars = this.makeStars(meta?.seed || 918273, this.quality === 'low' ? 140 : 280);
      this.starKey = key;
    }
    const hue = meta?.hue ?? 208;
    const hue2 = meta?.hue2 ?? 282;
    const cam = game.camera || { x: 0, y: 0 };

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue} 46% 5%)`);
    g.addColorStop(.48, '#03060e');
    g.addColorStop(1, `hsl(${hue2} 38% 6%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // nebula clouds (parallax, screen space)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const blobs = 6;
    for (let i = 0; i < blobs; i++) {
      const s = 0.07 + (i % 3) * 0.016;
      const nx = ((i * 0.271 + 0.12) * w - cam.x * s) % (w * 1.4);
      const ny = ((i * 0.413 + 0.24) * h - cam.y * s) % (h * 1.4);
      const px = ((nx + w * .7) % (w * 1.4)) - w * .2;
      const py = ((ny + h * .7) % (h * 1.4)) - h * .2;
      const r = Math.max(w, h) * (0.28 + (i % 2) * .14);
      const col = i % 2 ? hue : hue2;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `hsla(${col}, 78%, 52%, ${.055 + (i === 0 ? .05 : 0)})`);
      grad.addColorStop(.45, `hsla(${col}, 72%, 40%, .022)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    // distant galaxy smear
    ctx.save();
    ctx.translate(w * .72 - cam.x * .012, h * .24 - cam.y * .012);
    ctx.rotate(-.5);
    const gg = ctx.createLinearGradient(-w * .3, 0, w * .3, 0);
    gg.addColorStop(0, 'transparent');
    gg.addColorStop(.5, `hsla(${hue2},70%,70%,.055)`);
    gg.addColorStop(1, 'transparent');
    ctx.fillStyle = gg;
    ctx.fillRect(-w * .3, -h * .06, w * .6, h * .12);
    ctx.restore();
    ctx.restore();

    // stars
    ctx.save();
    for (const layer of this.stars) {
      for (const s of layer.stars) {
        let x = (s.x * w - cam.x * layer.f) % w;
        let y = (s.y * h - cam.y * layer.f) % h;
        if (x < 0) x += w;
        if (y < 0) y += h;
        const twinkle = .72 + .28 * Math.sin(time * 1.4 + s.tw);
        const a = s.a * twinkle;
        if (s.size > 1.5) {
          ctx.fillStyle = s.hue ? `hsla(${s.hue},80%,75%,${a})` : `rgba(220,245,255,${a})`;
          ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
          if (s.size > 1.85 && this.quality === 'high') {
            ctx.fillStyle = `rgba(210,240,255,${a * .3})`;
            ctx.fillRect(x - 5, y - .5, 10, 1);
            ctx.fillRect(x - .5, y - 5, 1, 10);
          }
        } else {
          ctx.fillStyle = s.hue ? `hsla(${s.hue},80%,75%,${a})` : `rgba(215,242,255,${a})`;
          ctx.fillRect(x, y, s.size, s.size);
        }
      }
    }
    ctx.restore();

    // faint lens dust
    if (this.quality === 'high') {
      ctx.save();
      ctx.globalAlpha = .1;
      for (let i = 0; i < 6; i++) {
        const x = ((i * 197.3 - cam.x * .25) % w + w) % w;
        const y = ((i * 311.7 - cam.y * .25) % h + h) % h;
        drawGlow(ctx, x, y, 70 + i * 18, ['#7fd8ff', '#9fa8ff', '#ff9fd4', '#7fffe0', '#ffd08a', '#9f8fff'][i % 6], .07);
      }
      ctx.restore();
    }
  }

  // ── planet texture ──────────────────────────────────────────────
  getPlanetTexture(p) {
    if (this.planetCache.has(p.seed)) return this.planetCache.get(p.seed);
    const size = this.quality === 'low' ? 160 : 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const cx = size / 2, cy = size / 2, r = size / 2 - 2;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU2); g.clip();
    const base = g.createLinearGradient(0, 0, size, size);
    base.addColorStop(0, p.light);
    base.addColorStop(.45, p.color);
    base.addColorStop(1, p.dark);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const rng = mulberry32(p.seed);
    // bands
    for (let i = 0; i < p.bands * 3; i++) {
      const y = (i / (p.bands * 3)) * size + (rng() - .5) * 8;
      const hh = 6 + rng() * (size / 12);
      g.fillStyle = i % 2 ? rgba(p.light, .12) : rgba(p.dark, .16);
      g.beginPath();
      g.ellipse(cx, y, size, hh, 0, 0, TAU2);
      g.fill();
    }
    // mottling
    for (let i = 0; i < 160; i++) {
      const a = rng() * TAU2, rr = Math.sqrt(rng()) * r;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const s = 2 + rng() * 16;
      g.fillStyle = rng() < .5 ? rgba(p.light, .06 + rng() * .08) : rgba(p.dark, .05 + rng() * .1);
      g.beginPath(); g.ellipse(x, y, s * 2.4, s, rng() * 2, 0, TAU2); g.fill();
    }
    // craters
    for (let i = 0; i < 16; i++) {
      const a = rng() * TAU2, rr = Math.sqrt(rng()) * r * .92;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const s = 2 + rng() * 12;
      g.fillStyle = rgba(p.dark, .32);
      g.beginPath(); g.arc(x, y, s, 0, TAU2); g.fill();
      g.fillStyle = rgba(p.light, .14);
      g.beginPath(); g.arc(x - s * .25, y - s * .25, s * .7, 0, TAU2); g.fill();
    }
    // terminator shading
    const shade = g.createRadialGradient(cx - r * .4, cy - r * .45, r * .12, cx, cy, r * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,.18)');
    shade.addColorStop(.42, 'rgba(255,255,255,0)');
    shade.addColorStop(.72, 'rgba(0,0,0,.24)');
    shade.addColorStop(1, 'rgba(0,0,8,.72)');
    g.fillStyle = shade;
    g.fillRect(0, 0, size, size);
    g.restore();
    // rim light
    g.strokeStyle = rgba(p.light, .32);
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, r - 1, 0, TAU2); g.stroke();
    this.planetCache.set(p.seed, c);
    return c;
  }

  drawPlanet(ctx, p, time) {
    const tex = this.getPlanetTexture(p);
    const r = p.radius;
    // atmosphere
    const atmo = ctx.createRadialGradient(p.x, p.y, r * .88, p.x, p.y, r * 1.22);
    atmo.addColorStop(0, rgba(p.light, .16));
    atmo.addColorStop(.55, rgba(p.light, .05));
    atmo.addColorStop(1, rgba(p.light, 0));
    ctx.fillStyle = atmo;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.22, 0, TAU2); ctx.fill();

    if (p.ring) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ringTilt);
      ctx.scale(1, .24);
      ctx.strokeStyle = rgba(p.light, .16);
      ctx.lineWidth = r * .12;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, Math.PI, TAU2); ctx.stroke();
      ctx.strokeStyle = rgba(p.light, .08);
      ctx.lineWidth = r * .035;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.75, Math.PI, TAU2); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU2); ctx.clip();
    ctx.drawImage(tex, p.x - r, p.y - r, r * 2, r * 2);
    ctx.restore();

    if (p.ring) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ringTilt);
      ctx.scale(1, .24);
      ctx.strokeStyle = rgba(p.light, .23);
      ctx.lineWidth = r * .12;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = rgba(p.light, .1);
      ctx.lineWidth = r * .035;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.75, 0, Math.PI); ctx.stroke();
      ctx.restore();
    }
    // moons
    if (p.moons) {
      const a = time * .03 + p.seed;
      const mx = p.x + Math.cos(a) * r * 2.05;
      const my = p.y + Math.sin(a) * r * .62;
      ctx.fillStyle = rgba(p.light, .5);
      ctx.beginPath(); ctx.arc(mx, my, Math.max(4, r * .09), 0, TAU2); ctx.fill();
    }
    // label
    if (r > 440) {
      ctx.save();
      ctx.font = `${10 / this.zoom}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(160,200,220,.32)';
      ctx.fillText(p.name, p.x, p.y + r + 24 / this.zoom);
      ctx.restore();
    }
  }

  // ── world ───────────────────────────────────────────────────────
  renderGame(game, time, dt = .016) {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.drawSpaceBackground(ctx, game, time);

    const cam = game.camera;
    const zoom = this.zoom;
    const shakeX = cam.shakeX * zoom, shakeY = cam.shakeY * zoom;
    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const viewR = Math.hypot(w, h) / (2 * zoom) + 500;
    const visible = (x, y, pad = 300) => dist(x, y, cam.x, cam.y) < viewR + pad;

    this.drawWorldGrid(ctx, cam, viewR);
    this.drawAsteroidHaze(ctx, game);

    for (const p of game.world.planets) {
      if (visible(p.x, p.y, p.radius)) this.drawPlanet(ctx, p, time);
    }
    if (game.world.derelict && visible(game.world.derelict.x, game.world.derelict.y, 250)) this.drawDerelict(ctx, game.world.derelict, time, game);
    if (game.world.anomaly && !game.world.anomaly.scanned && visible(game.world.anomaly.x, game.world.anomaly.y, 250)) this.drawAnomaly(ctx, game.world.anomaly, time);

    // asteroid field labels
    for (const f of game.world.fields) {
      if (!visible(f.x, f.y, f.radius)) continue;
      ctx.save();
      ctx.font = `${8 / zoom}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(140,180,200,.18)';
      ctx.fillText(f.name, f.x, f.y - f.radius - 20 / zoom);
      ctx.restore();
    }

    for (const a of game.world.asteroids) {
      if (a.amount <= 0) continue;
      if (!visible(a.x, a.y, a.radius + 200)) continue;
      this.drawAsteroid(ctx, a, time, game);
    }

    for (const st of game.world.stations) {
      if (!visible(st.x, st.y, 360)) continue;
      this.drawStation(ctx, st, time, zoom, game);
    }

    for (const pk of game.pickups) this.drawPickup(ctx, pk, time);
    for (const e of game.enemies) {
      if (!e.alive || !visible(e.x, e.y, 150)) continue;
      this.drawEnemy(ctx, e, time, zoom);
    }

    if (game.player && !game.dead) this.drawPlayer(ctx, game, time);

    for (const b of game.bullets) this.drawBullet(ctx, b);
    if (game.beam) this.drawBeam(ctx, game.beam, time);
    this.drawParticles(ctx, game, time);
    this.drawTexts(ctx, game, zoom);

    ctx.restore();

    // screen-space overlays
    this.drawScreenEffects(ctx, game, time);
    if (game.warp) this.drawWarp(ctx, game.warp, time);
    return { zoom, viewR };
  }

  drawWorldGrid(ctx, cam, viewR) {
    ctx.save();
    ctx.strokeStyle = 'rgba(90,170,200,.035)';
    ctx.lineWidth = 1 / this.zoom;
    const step = 1000;
    const x0 = Math.floor((cam.x - viewR) / step) * step;
    const y0 = Math.floor((cam.y - viewR) / step) * step;
    ctx.beginPath();
    for (let x = x0; x < cam.x + viewR; x += step) { ctx.moveTo(x, cam.y - viewR); ctx.lineTo(x, cam.y + viewR); }
    for (let y = y0; y < cam.y + viewR; y += step) { ctx.moveTo(cam.x - viewR, y); ctx.lineTo(cam.x + viewR, y); }
    ctx.stroke();
    ctx.restore();
  }

  drawAsteroidHaze(ctx, game) {
    for (const f of game.world.fields) {
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 1.4);
      grad.addColorStop(0, 'rgba(120,150,170,.045)');
      grad.addColorStop(.6, 'rgba(90,120,140,.018)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 1.4, 0, TAU2); ctx.fill();
    }
  }

  drawAsteroid(ctx, a, time, game) {
    const ratio = a.amount / Math.max(1, a.maxAmount);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    const r = a.radius;
    const pts = a.shape;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const ang = (i / pts.length) * TAU2;
      const rr = r * pts[i];
      if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#4b5460');
    g.addColorStop(.35, '#2f3742');
    g.addColorStop(.75, '#1d232d');
    g.addColorStop(1, '#12161e');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,195,210,.2)';
    ctx.lineWidth = Math.max(1, r * .028);
    ctx.stroke();

    // facets
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const ang = (i / pts.length) * TAU2 + .22;
      const rr = r * pts[i] * .6;
      const ang2 = ((i + 2) / pts.length) * TAU2;
      const rr2 = r * pts[(i + 2) % pts.length] * .58;
      ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      ctx.lineTo(Math.cos(ang2) * rr2, Math.sin(ang2) * rr2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = Math.max(1, r * .02);
    ctx.stroke();

    // mineral veins
    const cm = COMMODITY_MAP[a.ore];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(cm.color, .25 + (1 - ratio) * .2);
    ctx.lineWidth = Math.max(1, r * .018);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ang = (i * 2.1 + a.tint * 4) % TAU2;
      const rr = r * (.22 + (i * .13));
      ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      ctx.lineTo(Math.cos(ang + .6) * (rr * 1.4), Math.sin(ang + .6) * (rr * 1.4));
      ctx.lineTo(Math.cos(ang + .3) * (rr * 1.75), Math.sin(ang + .3) * (rr * 1.75));
    }
    ctx.stroke();
    // glints
    for (let i = 0; i < 3; i++) {
      const ang = a.tint * 9 + i * 2.4;
      drawGlow(ctx, Math.cos(ang) * r * .5, Math.sin(ang) * r * .5, r * .18, cm.color, .25 + .2 * Math.sin(time * 2 + i));
    }
    ctx.restore();

    // cracks as depleted
    if (ratio < .65) {
      ctx.strokeStyle = `rgba(0,0,0,${.4 * (1 - ratio)})`;
      ctx.lineWidth = Math.max(1, r * .03);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = i * 1.7 + a.tint;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * r * .45, Math.sin(ang) * r * .45);
        ctx.lineTo(Math.cos(ang + .4) * r * .8, Math.sin(ang + .4) * r * .8);
      }
      ctx.stroke();
    }
    ctx.restore();

    // mining label
    if (game.player && dist(a.x, a.y, game.player.x, game.player.y) < 700) {
      ctx.save();
      ctx.font = `${9 / this.zoom}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(cm.color, .7);
      ctx.fillText(`${cm.code} ${Math.ceil(a.amount)}`, a.x, a.y - r - 9 / this.zoom);
      ctx.restore();
    }
  }

  drawStation(ctx, st, time, zoom, game) {
    const pulse = .5 + .5 * Math.sin(time * 1.4 + st.seed);
    ctx.save();
    ctx.translate(st.x, st.y);

    // glow
    drawGlow(ctx, 0, 0, 210, st.type.color, .16 + pulse * .04);

    // docking range
    if (game.player && dist(game.player.x, game.player.y, st.x, st.y) < 620) {
      ctx.save();
      ctx.strokeStyle = rgba(st.type.color, .14 + pulse * .08);
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([8 / zoom, 12 / zoom]);
      ctx.beginPath(); ctx.arc(0, 0, st.dockRadius, 0, TAU2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // outer rotating ring segments
    ctx.save();
    ctx.rotate(time * st.spin + st.angle);
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * TAU2 + .12;
      const a1 = a0 + TAU2 / segments - .25;
      ctx.strokeStyle = i % 2 ? rgba(st.type.color, .3) : 'rgba(130,160,180,.14)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 104, a0, a1); ctx.stroke();
      if (i % 2 === 0) {
        const ma = (a0 + a1) / 2;
        ctx.save();
        ctx.rotate(ma);
        ctx.fillStyle = '#1c2734';
        ctx.strokeStyle = rgba(st.type.color, .35);
        ctx.lineWidth = 1;
        ctx.fillRect(88, -8, 22, 16);
        ctx.strokeRect(88, -8, 22, 16);
        ctx.fillStyle = rgba(st.type.color, .5 + pulse * .3);
        ctx.fillRect(103, -2, 4, 4);
        ctx.restore();
      }
    }
    ctx.restore();

    // inner ring
    ctx.save();
    ctx.rotate(-time * st.spin * 1.6 + st.angle);
    ctx.strokeStyle = 'rgba(150,180,200,.23)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU2 / 4);
      ctx.fillStyle = '#223040';
      ctx.strokeStyle = rgba(st.type.color, .4);
      ctx.beginPath();
      ctx.moveTo(56, -7); ctx.lineTo(78, -5); ctx.lineTo(82, 0); ctx.lineTo(78, 5); ctx.lineTo(56, 7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // central hex hub
    const g = ctx.createLinearGradient(-50, -50, 50, 50);
    g.addColorStop(0, '#3b4d5f');
    g.addColorStop(.45, '#1a2532');
    g.addColorStop(1, '#0a1018');
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU2 + Math.PI / 6;
      const x = Math.cos(a) * 48, y = Math.sin(a) * 48;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba(st.type.color, .38); ctx.lineWidth = 1.5; ctx.stroke();

    // central tower
    ctx.fillStyle = '#0d1520';
    ctx.strokeStyle = rgba(st.type.color, .28);
    ctx.lineWidth = 1;
    ctx.fillRect(-14, -38, 28, 76);
    ctx.strokeRect(-14, -38, 28, 76);
    ctx.fillStyle = rgba(st.type.color, .14);
    for (let i = 0; i < 6; i++) {
      if ((i + Math.floor(time * 2)) % 3 === 0) ctx.fillRect(-9, -30 + i * 11, 18, 4);
    }
    // crown light
    drawGlow(ctx, 0, -40, 26, st.type.color, .6);
    ctx.fillStyle = rgba(st.type.color, .9);
    ctx.beginPath(); ctx.arc(0, -40, 3.5, 0, TAU2); ctx.fill();

    // blinking marker lights
    for (let i = 0; i < 4; i++) {
      const a = i * TAU2 / 4 + time * .4;
      const on = Math.sin(time * 3 + i * 1.7) > .2;
      if (!on) continue;
      drawGlow(ctx, Math.cos(a) * 88, Math.sin(a) * 88, 13, '#ffb45c', .8);
      ctx.fillStyle = '#ffd49b';
      ctx.beginPath(); ctx.arc(Math.cos(a) * 88, Math.sin(a) * 88, 2, 0, TAU2); ctx.fill();
    }

    ctx.restore();

    // labels (world -> screen compensated)
    const d = game.player ? dist(game.player.x, game.player.y, st.x, st.y) : 9999;
    if (d < 2000) {
      ctx.save();
      const alpha = clamp(1 - (d - 500) / 1500, .2, 1);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = `600 ${14 / zoom}px Rajdhani, sans-serif`;
      ctx.fillStyle = '#dff7ff';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8 / zoom;
      ctx.fillText(st.name, st.x, st.y - 132 / zoom);
      ctx.shadowBlur = 0;
      ctx.font = `${8 / zoom}px "Space Mono", monospace`;
      ctx.fillStyle = rgba(st.type.color, .85);
      ctx.fillText(st.type.label, st.x, st.y - 116 / zoom);
      if (d < st.dockRadius + 200) {
        ctx.fillStyle = 'rgba(255,207,106,.9)';
        ctx.font = `${7 / zoom}px "Space Mono", monospace`;
        ctx.fillText('◈ DOCKING RADIUS', st.x, st.y + 138 / zoom);
      }
      ctx.restore();
    }
  }

  drawDerelict(ctx, d, time, game) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    drawGlow(ctx, 0, 0, 170, '#8f9aaa', .06);
    // broken spine
    ctx.fillStyle = '#252d38';
    ctx.strokeStyle = 'rgba(180,200,215,.2)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-80, -22); ctx.lineTo(-12, -32); ctx.lineTo(16, -18); ctx.lineTo(80, -24);
    ctx.lineTo(96, 0); ctx.lineTo(48, 14); ctx.lineTo(12, 32); ctx.lineTo(-40, 26); ctx.lineTo(-96, 8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#171e27' : '#2c3542';
      ctx.fillRect(-60 + i * 24, -12, 16, 24);
    }
    // broken wing
    ctx.strokeStyle = 'rgba(160,180,200,.18)';
    ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(-50, -74); ctx.lineTo(-18, -54); ctx.stroke();
    ctx.restore();
    // red distress light
    const blink = Math.sin(time * 2.2) > .4;
    if (blink) drawGlow(ctx, d.x, d.y, 45, '#ff5d76', .55);
    // label
    if (game.player && dist(game.player.x, game.player.y, d.x, d.y) < 900) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `${9 / this.zoom}px "Space Mono", monospace`;
      ctx.fillStyle = 'rgba(200,180,190,.5)';
      ctx.fillText(`DERELICT · ${d.name}`, d.x, d.y - 100);
      ctx.restore();
    }
    if (!d.looted) {
      for (const c of d.crates) {
        if (c.taken) continue;
        const bob = Math.sin(time * 2 + c.x) * 3;
        const col = c.kind === 'credits' ? '#ffcf6a' : COMMODITY_MAP[c.commodity].color;
        drawGlow(ctx, c.x, c.y + bob, 30, col, .6);
        ctx.save();
        ctx.translate(c.x, c.y + bob);
        ctx.rotate(time * .8);
        ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      }
    }
  }

  drawAnomaly(ctx, an, time) {
    ctx.save();
    ctx.translate(an.x, an.y);
    const r = an.radius;
    for (let i = 0; i < 3; i++) {
      const a = time * (.3 + i * .12) + i;
      ctx.save();
      ctx.rotate(a);
      ctx.scale(1, .42 + i * .12);
      ctx.strokeStyle = `rgba(183,155,255,${.2 - i * .04})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * (.7 + i * .25), .2, Math.PI * 1.5); ctx.stroke();
      ctx.restore();
    }
    const pulse = .5 + .5 * Math.sin(time * 2.1);
    drawGlow(ctx, 0, 0, r * 1.2, '#b79bff', .16 + pulse * .12);
    ctx.fillStyle = `rgba(220,205,255,${.55 + pulse * .3})`;
    ctx.beginPath(); ctx.arc(0, 0, 3 + pulse * 3, 0, TAU2); ctx.fill();
    // orbiting motes
    for (let i = 0; i < 7; i++) {
      const a = time * .7 + i * .9;
      const rr = r * (.5 + .35 * Math.sin(time + i));
      ctx.fillStyle = `rgba(190,165,255,${.25 + .35 * Math.sin(time * 2 + i)})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 0, TAU2); ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `${8 / this.zoom}px "Space Mono", monospace`;
    ctx.fillStyle = 'rgba(183,155,255,.6)';
    ctx.fillText(`ANOMALY · ${an.name}`, an.x, an.y - r - 10);
    ctx.restore();
  }

  drawPlayer(ctx, game, time) {
    const p = game.player;
    const ship = game.ship;
    const role = ship.role;
    const roleData = ROLES[role];
    const s = (0.78 + ship.tier * .018);
    const thrust = clamp(p.speed / (ship.speed * 1.65), 0, 1);
    const shieldRatio = game.state.shield / game.maxShield;

    // shield bubble
    if (shieldRatio > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(111,242,255,${.1 + shieldRatio * .1})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 31 * s, 0, TAU2); ctx.stroke();
      ctx.fillStyle = `rgba(90,220,255,${.025 + shieldRatio * .02})`;
      ctx.fill();
      ctx.restore();
    }

    // engine glow
    const back = p.angle + Math.PI;
    const boost = game.controls.boost && game.state.boost > 1;
    drawGlow(ctx, p.x + Math.cos(back) * 20 * s, p.y + Math.sin(back) * 20 * s, 24 * s + thrust * 20, boost ? '#ffd08a' : '#6fe8ff', .3 + thrust * .5);

    this.drawShip(ctx, p.x, p.y, p.angle, s, role, ship.tier, {
      time, thrust, color: roleData.color, glow: roleData.soft, player: true,
      hit: game.hitFlash
    });

    if (game.dockHintShown) { /* no-op */ }
  }

  drawEnemy(ctx, e, time, zoom) {
    const s = (e.type === 'gunner' ? 1.08 : e.type === 'sniper' ? .92 : .82) * (1 + e.tier * .012);
    if (e.shield > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,120,130,${.06 + (e.shield / e.maxShield) * .15})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, 27 * s, 0, TAU2); ctx.stroke();
      ctx.restore();
    }
    drawGlow(ctx, e.x, e.y, 26 * s, '#ff7a6a', .15 + e.hit * .2);
    this.drawShip(ctx, e.x, e.y, e.angle, s, 'combat', Math.min(20, e.tier), {
      time, thrust: .55, color: '#ff6f7d', glow: '#ffb1b8', enemy: true, hit: e.hit
    });
    if (e.hull < e.maxHull) {
      const w = 34;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(e.x - w / 2, e.y - 31 * s - 10, w, 3);
      ctx.fillStyle = '#ff7a6a';
      ctx.fillRect(e.x - w / 2, e.y - 31 * s - 10, w * (e.hull / e.maxHull), 3);
    }
  }

  drawShip(ctx, x, y, angle, s, role, tier, opts = {}) {
    const time = opts.time || 0;
    const color = opts.color || '#6ff2ff';
    const dark = opts.enemy ? '#2a1218' : '#111b28';
    const mid = opts.enemy ? '#4a2028' : '#1d2c3d';
    const light = opts.enemy ? '#6e2b34' : '#2d4258';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);

    // engine flame
    const thrust = opts.thrust || 0;
    if (thrust > .02) {
      const len = 10 + thrust * 22 + Math.sin(time * 30 + x) * 2;
      const grad = ctx.createLinearGradient(-16, 0, -16 - len, 0);
      grad.addColorStop(0, opts.enemy ? 'rgba(255,150,120,.9)' : 'rgba(160,250,255,.95)');
      grad.addColorStop(.35, opts.enemy ? 'rgba(255,90,80,.45)' : 'rgba(90,220,255,.45)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-14, -5); ctx.lineTo(-16 - len, 0); ctx.lineTo(-14, 5); ctx.closePath();
      ctx.fill();
      // side engines
      ctx.globalAlpha = .7;
      ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(-12 - len * .6, -7); ctx.lineTo(-11, -3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-11, 8); ctx.lineTo(-12 - len * .6, 7); ctx.lineTo(-11, 3); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = rgba(color, .55);
    ctx.lineWidth = 1.1;

    if (role === 'trade') {
      // containers
      ctx.fillStyle = opts.enemy ? '#3a1a20' : '#172433';
      ctx.strokeStyle = rgba(color, .18);
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(-14 + i * 8, -13, 6, 26);
        ctx.strokeRect(-14 + i * 8, -13, 6, 26);
      }
      const g = ctx.createLinearGradient(0, -12, 0, 12);
      g.addColorStop(0, light); g.addColorStop(.5, mid); g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(22, 0); ctx.lineTo(12, -8); ctx.lineTo(-16, -11); ctx.lineTo(-20, -7);
      ctx.lineTo(-20, 7); ctx.lineTo(-16, 11); ctx.lineTo(12, 8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // cockpit
      ctx.fillStyle = rgba(color, .55);
      ctx.beginPath(); ctx.ellipse(12, 0, 4, 3, 0, 0, TAU2); ctx.fill();
      // engine blocks
      ctx.fillStyle = '#0c131c';
      ctx.fillRect(-19, -8, 4, 5); ctx.fillRect(-19, 3, 4, 5);
      // navigation stripe
      ctx.strokeStyle = rgba(color, .35);
      ctx.beginPath(); ctx.moveTo(-10, -9.5); ctx.lineTo(13, -6.5); ctx.stroke();
    } else if (role === 'mining') {
      // drill prongs
      ctx.strokeStyle = '#8d7a5d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(30, -3); ctx.lineTo(14, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, -3); ctx.lineTo(31, 0); ctx.lineTo(26, 3); ctx.stroke();
      // body
      const g = ctx.createLinearGradient(0, -14, 0, 14);
      g.addColorStop(0, '#4a4132'); g.addColorStop(.45, mid); g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(17, -8); ctx.lineTo(10, -14); ctx.lineTo(-13, -14); ctx.lineTo(-18, -8);
      ctx.lineTo(-18, 8); ctx.lineTo(-13, 14); ctx.lineTo(10, 14); ctx.lineTo(17, 8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(color, .5); ctx.stroke();
      // industrial stripes
      ctx.fillStyle = rgba(color, .28);
      ctx.fillRect(-12, -11, 5, 22);
      ctx.fillStyle = '#0b1118';
      ctx.fillRect(-18, -9, 4, 6); ctx.fillRect(-18, 3, 4, 6);
      // cockpit
      ctx.fillStyle = rgba('#ffe2a8', .55);
      ctx.beginPath(); ctx.ellipse(8, 0, 4, 5, 0, 0, TAU2); ctx.fill();
      // side pods
      ctx.fillStyle = '#3b3428';
      ctx.strokeStyle = rgba(color, .3);
      ctx.fillRect(-1, -17, 10, 5); ctx.strokeRect(-1, -17, 10, 5);
      ctx.fillRect(-1, 12, 10, 5); ctx.strokeRect(-1, 12, 10, 5);
      ctx.fillStyle = rgba(color, .4);
      ctx.fillRect(3, -15.5, 4, 2); ctx.fillRect(3, 13.5, 4, 2);
    } else {
      // combat
      // wings
      const g = ctx.createLinearGradient(0, -20, 0, 20);
      g.addColorStop(0, light); g.addColorStop(.45, mid); g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(12, -7);
      ctx.lineTo(-2, -20);
      ctx.lineTo(-10, -16);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-17, -7);
      ctx.lineTo(-21, 0);
      ctx.lineTo(-17, 7);
      ctx.lineTo(-7, 6);
      ctx.lineTo(-10, 16);
      ctx.lineTo(-2, 20);
      ctx.lineTo(12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(color, .55); ctx.stroke();

      // spine
      ctx.fillStyle = '#0d1723';
      ctx.beginPath();
      ctx.moveTo(22, 0); ctx.lineTo(6, -4.5); ctx.lineTo(-9, -3); ctx.lineTo(-12, 0);
      ctx.lineTo(-9, 3); ctx.lineTo(6, 4.5); ctx.closePath(); ctx.fill();
      // cockpit
      ctx.fillStyle = rgba(color, .7);
      ctx.beginPath(); ctx.ellipse(8, 0, 5, 3.2, 0, 0, TAU2); ctx.fill();
      drawGlow(ctx, 8, 0, 7, opts.enemy ? '#ff8a8a' : color, .35);
      // guns
      ctx.fillStyle = '#0a1119';
      ctx.fillRect(2, -12, 10, 2.5); ctx.fillRect(2, 9.5, 10, 2.5);
      ctx.fillStyle = rgba(color, .8);
      ctx.fillRect(11.5, -12, 2, 2.5); ctx.fillRect(11.5, 9.5, 2, 2.5);
      // tier pips
      const pips = Math.min(5, Math.ceil(tier / 4));
      ctx.fillStyle = rgba(color, .7);
      for (let i = 0; i < pips; i++) ctx.fillRect(-15 + i * 3, -1, 1.6, 2);
    }

    // hit flash
    if (opts.hit > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opts.hit * .55;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU2); ctx.fill();
    }
    ctx.restore();
  }

  drawBullet(ctx, b) {
    const col = b.color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (b.trail.length > 1) {
      const first = b.trail[0];
      const grad = ctx.createLinearGradient(first.x, first.y, b.x, b.y);
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(1, rgba(col, .55));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    drawGlow(ctx, b.x, b.y, 12, col, .85);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, TAU2); ctx.fill();
    ctx.restore();
  }

  drawBeam(ctx, beam, time) {
    const dx = beam.x2 - beam.x1, dy = beam.y2 - beam.y1;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const segs = 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (beam.weak) {
      ctx.strokeStyle = 'rgba(255,160,80,.15)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
      ctx.restore();
      return;
    }
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = pass === 0 ? 'rgba(255,160,60,.13)' : pass === 1 ? 'rgba(255,210,120,.45)' : 'rgba(255,255,235,.95)';
      ctx.lineWidth = pass === 0 ? 9 : pass === 1 ? 3.4 : 1.2;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const jitter = i === 0 || i === segs ? 0 : Math.sin(time * 38 + i * 2.4) * (pass === 0 ? 5 : 2.2);
        const x = beam.x1 + dx * t + nx * jitter;
        const y = beam.y1 + dy * t + ny * jitter;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    const pulse = .5 + .5 * Math.sin(time * 12);
    drawGlow(ctx, beam.x2, beam.y2, 24 + pulse * 12, '#ffd08a', .65);
    drawGlow(ctx, beam.x1, beam.y1, 16, '#ffcf6a', .5);
    ctx.restore();
  }

  drawPickup(ctx, pk, time) {
    const bob = Math.sin(time * 3 + pk.x * .01) * 3;
    const col = pk.kind === 'credits' ? '#ffd166' : COMMODITY_MAP[pk.commodity].color;
    const r = pk.kind === 'credits' ? 7 : 6;
    drawGlow(ctx, pk.x, pk.y + bob, 22, col, .55);
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.rotate(time * 1.8);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    if (pk.kind === 'credits') {
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = rgba(col, .28); ctx.fill();
      ctx.fillStyle = '#fff8df';
      ctx.fillRect(-1, -2.5, 2, 5);
    } else {
      ctx.fillStyle = rgba(col, .28);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
  }

  drawParticles(ctx, game, time) {
    ctx.save();
    for (const p of game.particles) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(p.color.startsWith('#') ? p.color : '#ffffff', t * .9);
        if (!p.color.startsWith('#')) ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * t;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * .022, p.y - p.vy * .022);
        ctx.stroke();
      } else if (p.type === 'glow') {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, p.x, p.y, p.size * 4 * (1.2 - t * .3), p.color, t * .8);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = t * .4;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - t * .5), 0, TAU2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of game.rings) {
      const t = clamp(r.life / r.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (0.4 + t * 1.4);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, TAU2); ctx.stroke();
    }
    ctx.restore();
  }

  drawTexts(ctx, game, zoom) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of game.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `${t.size / zoom}px "Space Mono", monospace`;
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, t.x + 1 / zoom, t.y + 1 / zoom);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawScreenEffects(ctx, game, time) {
    const { w, h } = this;
    // warning rim when hull low
    const hullPct = game.state.hull / game.maxHull;
    if (hullPct < .32) {
      const pulse = .5 + .5 * Math.sin(time * 5);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .28, w / 2, h / 2, Math.max(w, h) * .7);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, `rgba(255,40,70,${.12 + pulse * .12})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // scanline only quality
    if (this.quality === 'high') {
      ctx.save();
      ctx.globalAlpha = .035;
      ctx.fillStyle = '#8fe9ff';
      for (let y = (time * 20) % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      ctx.restore();
    }
  }

  drawWarp(ctx, warp, time) {
    const { w, h } = this;
    const p = clamp(warp.progress || 0, 0, 1);
    const intensity = Math.sin(p * Math.PI);
    ctx.save();
    const cx = w / 2, cy = h / 2;
    const flash = p < .5 ? p * 2 : (1 - p) * 2;
    ctx.fillStyle = `rgba(180,245,255,${Math.pow(flash, 3) * .32})`;
    ctx.fillRect(0, 0, w, h);
    if (intensity > .02) {
      ctx.globalCompositeOperation = 'lighter';
      const rng = mulberry32(Math.floor(time * 28) + 7);
      for (let i = 0; i < 90; i++) {
        const a = rng() * TAU2;
        const r0 = rng() * Math.min(w, h) * .4;
        const len = (rng() * .7 + .3) * Math.max(w, h) * .55 * intensity;
        const alpha = (rng() * .5 + .1) * intensity;
        ctx.strokeStyle = i % 4 === 0 ? `rgba(255,220,170,${alpha})` : `rgba(150,240,255,${alpha})`;
        ctx.lineWidth = rng() * 1.8 + .4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .5);
      g.addColorStop(0, `rgba(240,255,255,${intensity * .5})`);
      g.addColorStop(.25, `rgba(130,230,255,${intensity * .18})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // ── minimap ─────────────────────────────────────────────────────
  drawMinimap(canvas, game, time) {
    if (!game.world) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const c = w / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, c - 4, 0, TAU2); ctx.clip();
    ctx.fillStyle = 'rgba(3,12,20,.7)';
    ctx.fillRect(0, 0, w, h);

    const range = 2650;
    const scale = (c - 8) / range;
    const p = game.player;
    const toMap = (x, y) => [c + (x - p.x) * scale, c + (y - p.y) * scale];
    // rings
    ctx.strokeStyle = 'rgba(111,242,255,.11)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(c, c, (c - 8) * i / 3, 0, TAU2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(c, 8); ctx.lineTo(c, h - 8); ctx.moveTo(8, c); ctx.lineTo(w - 8, c); ctx.stroke();

    // sweep
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(time * .55);
    const sg = ctx.createLinearGradient(0, 0, c, 0);
    sg.addColorStop(0, 'rgba(111,242,255,.18)');
    sg.addColorStop(1, 'rgba(111,242,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, c, -.35, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(111,242,255,.35)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(c, 0); ctx.stroke();
    ctx.restore();

    // asteroid fields
    for (const f of game.world.fields) {
      const [x, y] = toMap(f.x, f.y);
      if (Math.hypot(x - c, y - c) > c) continue;
      ctx.fillStyle = 'rgba(140,160,175,.12)';
      ctx.beginPath(); ctx.arc(x, y, f.radius * scale, 0, TAU2); ctx.fill();
      ctx.fillStyle = 'rgba(170,190,205,.4)';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + f.hue;
        ctx.fillRect(x + Math.cos(a) * f.radius * scale * .6, y + Math.sin(a) * f.radius * scale * .6, 2, 2);
      }
    }
    // planets
    for (const pl of game.world.planets) {
      const [x, y] = toMap(pl.x, pl.y);
      if (Math.hypot(x - c, y - c) > c - 2) continue;
      ctx.fillStyle = 'rgba(110,180,220,.45)';
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, pl.radius * scale * .7), 0, TAU2); ctx.fill();
    }
    // stations
    for (const st of game.world.stations) {
      const [x, y] = toMap(st.x, st.y);
      if (Math.hypot(x - c, y - c) > c - 2) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffb45c'; ctx.shadowColor = '#ffb45c'; ctx.shadowBlur = 6;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // anomaly/derelict
    if (game.world.anomaly && !game.world.anomaly.scanned) {
      const [x, y] = toMap(game.world.anomaly.x, game.world.anomaly.y);
      ctx.strokeStyle = '#b79bff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU2); ctx.stroke();
      ctx.fillStyle = 'rgba(183,155,255,.6)';
      ctx.font = '10px "Space Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 3);
    }
    if (game.world.derelict && !game.world.derelict.looted) {
      const [x, y] = toMap(game.world.derelict.x, game.world.derelict.y);
      ctx.fillStyle = 'rgba(200,200,210,.55)';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    // enemies
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const [x, y] = toMap(e.x, e.y);
      if (Math.hypot(x - c, y - c) > c - 4) continue;
      ctx.fillStyle = '#ff5d76';
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.angle);
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, 3); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // pickups
    for (const pk of game.pickups) {
      const [x, y] = toMap(pk.x, pk.y);
      if (Math.hypot(x - c, y - c) > c - 4) continue;
      ctx.fillStyle = pk.kind === 'credits' ? '#ffd166' : '#8ee07a';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // player
    ctx.save();
    ctx.translate(c, c); ctx.rotate(p.angle);
    ctx.fillStyle = '#c7faff'; ctx.shadowColor = '#6ff2ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-2, 0); ctx.lineTo(-5, -4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ── galaxy map ──────────────────────────────────────────────────
  drawGalaxyMap(canvas, state, selected, time) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const cell = Math.min(w / 8.2, h / 7.6) * 1.02;
    const cur = state.sector;
    const visited = state.visitedSet || new Set(state.visited || []);
    const pos = (x, y) => [cx + (x - cur.x) * cell, cy + (y - cur.y) * cell];

    // background
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .7);
    bg.addColorStop(0, 'rgba(14,44,62,.32)');
    bg.addColorStop(1, 'rgba(2,6,13,.1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(111,242,255,.045)';
    ctx.lineWidth = 1;
    const step = cell / 2;
    for (let x = cx % cell; x < w; x += cell) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = cy % cell; y < h; y += cell) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // faint stars
    const rng = mulberry32(8712);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(200,235,255,${.05 + rng() * .1})`;
      ctx.fillRect(rng() * w, rng() * h, 1, 1);
    }

    const range = 5;
    const nodes = [];
    for (let dx = -range; dx <= range; dx++) for (let dy = -range; dy <= range; dy++) {
      const x = cur.x + dx, y = cur.y + dy;
      if (!isRevealed(visited, x, y)) continue;
      nodes.push({ x, y, ...getSectorMeta(x, y) });
    }
    const reveal = (x, y) => visited.has(sectorKey(x, y)) || nodes.some(n => n.x === x && n.y === y);

    // connections
    ctx.lineWidth = 1;
    for (const n of nodes) {
      const [x1, y1] = pos(n.x, n.y);
      for (const nb of [{ x: n.x + 1, y: n.y }, { x: n.x, y: n.y + 1 }, { x: n.x + 1, y: n.y + 1 }, { x: n.x + 1, y: n.y - 1 }]) {
        if (!reveal(nb.x, nb.y)) continue;
        const [x2, y2] = pos(nb.x, nb.y);
        const vis = visited.has(sectorKey(n.x, n.y)) && visited.has(sectorKey(nb.x, nb.y));
        ctx.strokeStyle = vis ? 'rgba(111,242,255,.14)' : 'rgba(111,242,255,.055)';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }

    // nodes
    for (const n of nodes) {
      const [x, y] = pos(n.x, n.y);
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
      const isCur = n.x === cur.x && n.y === cur.y;
      const isVisited = visited.has(sectorKey(n.x, n.y));
      const isSel = selected && selected.x === n.x && selected.y === n.y;
      const dangerCol = ['#74f0b0', '#a6f0a0', '#ffe28a', '#ffb45c', '#ff8264', '#ff4d6d'][n.danger] || '#ff5d76';
      const nodeR = Math.max(4, cell * .075);

      // nebula glow
      if (isVisited) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, cell * .6);
        g.addColorStop(0, `hsla(${n.hue},70%,55%,.07)`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(x - cell * .6, y - cell * .6, cell * 1.2, cell * 1.2);
      }

      if (isCur) {
        const pulse = .5 + .5 * Math.sin(time * 3);
        ctx.strokeStyle = `rgba(111,242,255,${.35 + pulse * .35})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, nodeR + 7 + pulse * 4, 0, TAU2); ctx.stroke();
        ctx.strokeStyle = 'rgba(111,242,255,.5)';
        ctx.beginPath(); ctx.arc(x, y, nodeR + 3, 0, TAU2); ctx.stroke();
      }
      if (isSel) {
        ctx.strokeStyle = '#ffcf6a';
        ctx.lineWidth = 1.3;
        const b = nodeR + 8;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(x + sx * b, y + sy * b - sy * 5);
          ctx.lineTo(x + sx * b, y + sy * b);
          ctx.lineTo(x + sx * b - sx * 5, y + sy * b);
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      const r = nodeR;
      if (isVisited) {
        ctx.fillStyle = isCur ? 'rgba(111,242,255,.85)' : rgba(dangerCol, .42);
        ctx.strokeStyle = isCur ? '#d8feff' : dangerCol;
        ctx.lineWidth = 1.2;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.strokeRect(-r, -r, r * 2, r * 2);
      } else {
        ctx.strokeStyle = 'rgba(160,205,225,.42)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = 'rgba(111,242,255,.08)';
        ctx.fillRect(-r, -r, r * 2, r * 2);
      }
      ctx.restore();

      if (isVisited && n.stationCount > 0) {
        ctx.fillStyle = '#ffb45c';
        ctx.beginPath(); ctx.arc(x + nodeR + 4, y - nodeR - 4, 2.2, 0, TAU2); ctx.fill();
      }
      if (isVisited) {
        ctx.font = `${clamp(cell * .11, 6, 9)}px "Space Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isCur ? 'rgba(220,250,255,.9)' : 'rgba(160,198,214,.58)';
        const label = n.name.split(' ')[0];
        ctx.fillText(label, x, y + nodeR + 11);
      } else {
        ctx.font = `${clamp(cell * .12, 7, 10)}px "Space Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(150,190,210,.35)';
        ctx.fillText('?', x, y + 3);
      }
    }

    // selected route
    if (selected) {
      const [x1, y1] = pos(cur.x, cur.y);
      const [x2, y2] = pos(selected.x, selected.y);
      if (x1 !== x2 || y1 !== y2) {
        ctx.save();
        ctx.setLineDash([6, 7]);
        ctx.lineDashOffset = -time * 22;
        ctx.strokeStyle = 'rgba(255,207,106,.65)';
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
      }
    }

    // center reticle
    ctx.strokeStyle = 'rgba(111,242,255,.07)';
    ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * .44, 0, TAU2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * .24, 0, TAU2); ctx.stroke();
  }

  // ── title backdrop ──────────────────────────────────────────────
  renderTitle(time) {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fakeGame = {
      camera: { x: Math.sin(time * .03) * 260 + 700, y: Math.cos(time * .021) * 120 + 100 },
      world: { meta: { hue: 196, hue2: 274, seed: 88231, key: 'title' } }
    };
    this.drawSpaceBackground(ctx, fakeGame, time);

    // large planet right
    if (!this.titlePlanet) {
      this.titlePlanet = {
        x: 0, y: 0, radius: 1, seed: 552211,
        color: '#1d5670', light: '#7fd9d8', dark: '#07192b',
        bands: 6, ring: true, ringTilt: -.42, moons: true, name: ''
      };
    }
    const pr = Math.min(w, h) * (w < 800 ? .34 : .29);
    const px = w * (w < 900 ? .78 : .76);
    const py = h * .62;
    // planet glows
    const atm = ctx.createRadialGradient(px, py, pr * .85, px, py, pr * 1.35);
    atm.addColorStop(0, 'rgba(100,220,240,.18)');
    atm.addColorStop(.5, 'rgba(80,180,220,.05)');
    atm.addColorStop(1, 'transparent');
    ctx.fillStyle = atm;
    ctx.beginPath(); ctx.arc(px, py, pr * 1.35, 0, TAU2); ctx.fill();
    if (!this.titlePlanet.tex) this.titlePlanet.tex = this.getPlanetTexture(this.titlePlanet);
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU2); ctx.clip();
    ctx.drawImage(this.titlePlanet.tex, px - pr, py - pr, pr * 2, pr * 2);
    ctx.restore();
    // ring
    ctx.save();
    ctx.translate(px, py); ctx.rotate(-.42); ctx.scale(1, .28);
    ctx.strokeStyle = 'rgba(150,230,245,.2)'; ctx.lineWidth = pr * .1;
    ctx.beginPath(); ctx.arc(0, 0, pr * 1.38, 0, TAU2); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,230,245,.09)'; ctx.lineWidth = pr * .03;
    ctx.beginPath(); ctx.arc(0, 0, pr * 1.62, 0, TAU2); ctx.stroke();
    ctx.restore();

    // station silhouette bottom right
    const sx = w * .84, sy = h * .84;
    drawGlow(ctx, sx, sy, 150, '#6ff2ff', .08);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-.2);
    ctx.strokeStyle = 'rgba(120,200,220,.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(0, 0, 44 + i * 17, i * .4, i * .4 + 1.7); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(12,24,38,.85)';
    ctx.fillRect(-8, -60, 16, 120);
    ctx.fillStyle = 'rgba(80,200,230,.25)';
    for (let i = 0; i < 5; i++) if (Math.sin(time * 2 + i) > 0) ctx.fillRect(-5, -45 + i * 20, 10, 4);
    ctx.restore();

    // flying ships
    for (let i = 0; i < 3; i++) {
      const t = (time * (.018 + i * .006) + i * .31) % 1;
      const x = w * (1.05 - t * 1.35);
      const y = h * (.22 + i * .19) + Math.sin(time * .4 + i * 2) * 18;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI + .18);
      const scale = .38 + i * .1;
      this.drawShip(ctx, 0, 0, 0, scale, i === 1 ? 'trade' : 'combat', 6 + i * 3, { time, thrust: .8, color: i === 2 ? '#ffcf6a' : '#6ff2ff', glow: '#bffaff' });
      ctx.restore();
      // trail
      ctx.strokeStyle = i === 2 ? 'rgba(255,180,90,.1)' : 'rgba(111,242,255,.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 12 * scale, y - 3 * scale); ctx.lineTo(x + 90 * scale, y - 2 * scale); ctx.stroke();
    }

    // horizon haze
    const hz = ctx.createLinearGradient(0, h * .72, 0, h);
    hz.addColorStop(0, 'rgba(3,9,18,0)');
    hz.addColorStop(1, 'rgba(2,5,12,.9)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, h * .72, w, h * .28);

    // HUD-ish grid lines
    ctx.strokeStyle = 'rgba(111,242,255,.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(px, py, pr * (1.15 + i * .18), -1.2 + i * .1, .3 + i * .1);
      ctx.stroke();
    }
  }
}

// standalone ship art for UI cards
const previewRenderer = Object.create(Renderer.prototype);
previewRenderer.zoom = 1;
export function drawShipPreview(canvas, role, tier, opts = {}) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width || canvas.width), h = Math.max(1, rect.height || canvas.height);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const roleData = ROLES[role] || ROLES.combat;
  const scale = (opts.detail ? Math.min(w / 92, h / 46) : Math.min(w / 66, h / 29)) * (0.9 + tier * .01);
  // backdrop rings
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.min(w, h) * .55);
  g.addColorStop(0, rgba(roleData.color, .1));
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.strokeStyle = rgba(roleData.color, .15);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) * .34, 0, TAU2); ctx.stroke();
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = rgba(roleData.color, .1);
  ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) * .44, 0, TAU2); ctx.stroke();
  ctx.restore();
  const renderer = previewRenderer;
  const fake = { time: 0, thrust: .45, color: roleData.color, glow: roleData.soft, enemy: false, hit: 0 };
  const t = opts.t || 0;
  renderer.drawShip(ctx, w / 2, h / 2, opts.angle ?? -.12, scale, role, tier, { ...fake, time: t });
}
