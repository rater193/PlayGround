// ── VOIDLINE :: DOM interface ────────────────────────────────────────
import { SHIPS, SHIP_MAP, shipById, COMMODITIES, COMMODITY_MAP, MINED_ORES, ROLES, STARTERS, PIRATE_GANGS } from './data.js';
import { getContracts, getSectorMeta, getStation, sectorKey, isAdjacent, isRevealed, neighbors, getUniverseSeed } from './galaxy.js';
import { formatCredits, clamp, timeAgo } from './util.js';
import { drawShipPreview } from './render.js';
import { audio } from './audio.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const TYPE_COLORS = {
  delivery: '#6ff2ff', mining: '#ffc35e', bounty: '#ff6f7d', survey: '#b79bff'
};
const TYPE_LABELS = {
  delivery: 'DELIVERY', mining: 'MINING QUOTA', bounty: 'BOUNTY', survey: 'DEEP SURVEY'
};

export class UI {
  constructor() {
    this.app = null;
    this.station = null;
    this.stationTab = 'shipyard';
    this.selectedShip = null;
    this.contractFilter = 'available';
    this.mapOpen = false;
    this.mapSelected = null;
    this.settingsReturn = 'title';
    this.modalAction = null;
    this.lastShipId = null;
    this.minimapTick = 0;
    this.toastQueue = [];
    this.toastBusy = false;
    this.lastMissionKey = '';
    this.screen = 'title';
    this.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.mapTime = 0;
  }

  init(app) {
    this.app = app;
    this.cache();
    this.bind();
    this.refreshTitle();
    this.drawPathCards();
    this.updateSoundToggle();
    this.updateTiltToggle();
    this.updateQuality();
    $('#sens-range').value = app.game.state?.settings?.sens || 1;
    this.updateSensLabel();
  }

  cache() {
    this.el = {
      hud: $('#hud'),
      title: $('#title-screen'),
      select: $('#select-screen'),
      station: $('#station-screen'),
      map: $('#map-screen'),
      settings: $('#settings-screen'),
      pause: $('#pause-screen'),
      death: $('#death-screen'),
      modal: $('#modal-layer'),
      shipName: $('#hud-ship-name'),
      tier: $('#hud-tier'),
      role: $('#hud-role'),
      shieldText: $('#hud-shield-text'),
      shieldBar: $('#hud-shield-bar'),
      hullText: $('#hud-hull-text'),
      hullBar: $('#hud-hull-bar'),
      boostText: $('#hud-boost-text'),
      boostBar: $('#hud-boost-bar'),
      cargo: $('#hud-cargo'),
      cargoMax: $('#hud-cargo-max'),
      credits: $('#hud-credits'),
      sector: $('#hud-sector'),
      danger: $('#hud-danger'),
      shipCanvas: $('#hud-ship-canvas'),
      mission: $('#mission-tracker'),
      missionTitle: $('#mission-title'),
      missionSub: $('#mission-sub'),
      missionBar: $('#mission-bar'),
      dockPrompt: $('#dock-prompt'),
      dockName: $('#dock-name'),
      interact: $('#btn-interact'),
      minimap: $('#minimap'),
      radarLabel: $('#radar-label'),
      crosshair: $('#crosshair'),
      damage: $('#damage-flash'),
      warp: $('#warp-banner'),
      warpDest: $('#warp-dest'),
      mapCanvas: $('#galaxy-map'),
      mapInfo: $('#map-info'),
      mapEmpty: $('#map-info-empty'),
      mapCredits: $('#map-credits'),
      mapCoords: $('#map-coords'),
      stnCredits: $('#stn-credits'),
      stnCargo: $('#stn-cargo'),
      stnName: $('#stn-name'),
      stnType: $('#stn-type'),
      stnFaction: $('#stn-faction'),
      stnTech: $('#stn-tech'),
      stnEyebrow: $('#stn-eyebrow'),
      stnFootnote: $('#stn-footnote'),
      toast: $('#toast-layer'),
      titleSeed: $('#title-seed')
    };
  }

  // ── boot / title ────────────────────────────────────────────────
  refreshTitle() {
    this.el.titleSeed.textContent = getUniverseSeed().toString(16).toUpperCase().padStart(8, '0');
    const has = this.app?.hasSave();
    $('#btn-continue').classList.toggle('hidden', !has);
  }

  drawPathCards() {
    const wrap = $('#path-cards');
    if (!wrap) return;
    wrap.innerHTML = STARTERS.map(id => {
      const ship = shipById(id);
      const role = ROLES[ship.role];
      const stats = this.statLines(ship, true);
      return `
        <button class="path-card" data-role="${ship.role}" style="--accent:${role.color};--glow:${role.color}22">
          <div class="pc-role">${role.label} PATH</div>
          <h3>${ship.name.toUpperCase()}</h3>
          <div class="pc-ship">${role.tagline.toUpperCase()}</div>
          <div class="pc-art"><canvas data-preview="${ship.role}" data-tier="${ship.tier}"></canvas></div>
          <div class="pc-desc">${role.desc}</div>
          <div class="pc-stats">${stats}</div>
          <div class="pc-pick"><span>BEGIN WITH ${ship.name.toUpperCase()}</span><span class="arrow">→</span></div>
        </button>`;
    }).join('');
    this.paintPreviews(wrap);
  }

  paintPreviews(root = document) {
    requestAnimationFrame(() => {
      $$('canvas[data-preview]', root).forEach(c => {
        const role = c.dataset.preview;
        const tier = +c.dataset.tier || 1;
        drawShipPreview(c, role, tier, { detail: c.dataset.detail === '1' });
      });
    });
  }

  refreshOverlayClass() {
    document.body.classList.toggle('overlay-open', !!$('.overlay:not(.hidden)'));
  }

  showTitle() {
    this.screen = 'title';
    this.el.title.classList.remove('hidden');
    this.el.select.classList.add('hidden');
    this.el.station.classList.add('hidden');
    this.el.map.classList.add('hidden');
    this.el.settings.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.death.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.modal.classList.add('hidden');
    this.mapOpen = false;
    this.refreshOverlayClass();
    this.refreshTitle();
  }

  showSelect() {
    this.screen = 'select';
    this.el.title.classList.add('hidden');
    this.el.select.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.drawPathCards();
  }

  showSpace() {
    this.screen = 'space';
    this.el.title.classList.add('hidden');
    this.el.select.classList.add('hidden');
    this.el.station.classList.add('hidden');
    this.el.map.classList.add('hidden');
    this.el.settings.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.death.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.modal.classList.add('hidden');
    this.mapOpen = false;
    this.lastShipId = null;
    this.refreshOverlayClass();
  }

  // ── HUD ─────────────────────────────────────────────────────────
  updateHUD(game, renderer, time, dt) {
    if (!game.state || !game.player) return;
    const s = game.state;
    const ship = game.ship;
    if (this.lastShipId !== ship.id) {
      this.lastShipId = ship.id;
      this.el.shipName.textContent = ship.name.toUpperCase();
      this.el.tier.textContent = 'T' + ship.tier;
      this.el.role.textContent = ROLES[ship.role].label;
      this.el.role.style.color = ROLES[ship.role].color;
      this.el.shipCanvas.parentElement.style.setProperty('--sc', ROLES[ship.role].color);
      requestAnimationFrame(() => drawShipPreview(this.el.shipCanvas, ship.role, ship.tier, { angle: -.25 }));
    }
    const hp = Math.max(0, s.hull) / game.maxHull;
    const sp = Math.max(0, s.shield) / game.maxShield;
    const bp = Math.max(0, s.boost) / 100;
    this.el.shieldBar.style.width = (sp * 100).toFixed(1) + '%';
    this.el.hullBar.style.width = (hp * 100).toFixed(1) + '%';
    this.el.boostBar.style.width = (bp * 100).toFixed(1) + '%';
    this.el.shieldText.textContent = Math.ceil(s.shield);
    this.el.hullText.textContent = Math.ceil(s.hull);
    this.el.boostText.textContent = Math.ceil(s.boost);
    this.el.cargo.textContent = game.cargoUsed();
    this.el.cargoMax.textContent = game.maxCargo;
    this.el.credits.textContent = formatCredits(s.credits);
    this.el.sector.textContent = game.world.meta.name;
    const danger = game.world.meta.danger;
    this.el.danger.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < danger ? 'on' : ''} ${danger <= 1 && i < danger ? 'low' : ''}"></i>`).join('');

    // mission tracker
    const m = game.missionSummary();
    if (m) {
      const key = m.id + ':' + m.sub + ':' + Math.round(m.pct * 100);
      if (key !== this.lastMissionKey) {
        this.lastMissionKey = key;
        this.el.mission.classList.remove('hidden');
        this.el.missionTitle.textContent = m.title;
        this.el.missionSub.textContent = m.sub;
        this.el.missionBar.style.width = (m.pct * 100).toFixed(0) + '%';
      }
    } else {
      this.lastMissionKey = '';
      this.el.mission.classList.add('hidden');
    }

    // dock prompt
    const near = game.nearStation;
    if (near) {
      this.el.dockPrompt.classList.remove('hidden');
      this.el.dockName.textContent = near.name;
      if (this.touch) this.el.interact.classList.remove('hidden');
    } else {
      this.el.dockPrompt.classList.add('hidden');
      this.el.interact.classList.add('hidden');
    }

    // warp
    if (game.warp) {
      this.el.warp.classList.remove('hidden');
      this.el.warpDest.textContent = game.warp.destName || '';
    } else {
      this.el.warp.classList.add('hidden');
    }

    // damage flash
    this.el.damage.classList.toggle('hit', game.hitFlash > .72);

    // crosshair
    const usingMouse = game.controls.usingMouse;
    if (usingMouse && this.screen === 'space') {
      this.el.crosshair.classList.remove('hidden');
      const inp = this.app.input;
      this.el.crosshair.style.left = inp.mouse.x + 'px';
      this.el.crosshair.style.top = inp.mouse.y + 'px';
    } else {
      this.el.crosshair.classList.add('hidden');
    }

    // minimap ~ 20 fps
    this.minimapTick += dt;
    if (this.minimapTick > .05) {
      this.minimapTick = 0;
      renderer.drawMinimap(this.el.minimap, game, time);
      const near2 = game.nearestStation();
      const d = near2 ? Math.hypot(near2.x - game.player.x, near2.y - game.player.y) : 0;
      this.el.radarLabel.textContent = near2 ? `STN ${(d / 100).toFixed(1)} KM` : 'DEEP SPACE';
    }
  }

  // ── toasts / modal ──────────────────────────────────────────────
  toast(msg, type = '', duration = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = msg;
    this.el.toast.appendChild(el);
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 380);
    }, duration);
    while (this.el.toast.children.length > 4) this.el.toast.firstChild.remove();
  }

  confirm(opts) {
    this.el.modal.classList.remove('hidden');
    $('#modal-eyebrow').textContent = opts.eyebrow || 'CONFIRM';
    $('#modal-title').textContent = opts.title || 'ARE YOU SURE?';
    $('#modal-text').innerHTML = opts.text || '';
    const ok = $('#modal-confirm');
    ok.textContent = opts.confirmText || 'CONFIRM';
    ok.classList.toggle('danger', !!opts.danger);
    ok.classList.toggle('primary', !opts.danger);
    $('#modal-cancel').textContent = opts.cancelText || 'CANCEL';
    this.modalAction = opts.onConfirm || null;
    this.modalCancel = opts.onCancel || null;
    audio.sfx('ui');
  }

  closeModal() {
    this.el.modal.classList.add('hidden');
    this.modalAction = null;
  }

  // ── station ─────────────────────────────────────────────────────
  showStation(station) {
    this.screen = 'station';
    this.station = station;
    this.stationTab = 'shipyard';
    this.selectedShip = station.stock[0]?.shipId || null;
    this.contractFilter = 'available';
    this.el.station.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.dockPrompt.classList.add('hidden');
    this.el.interact.classList.add('hidden');
    this.renderStationHeader();
    this.setTab('shipyard');
    this.refreshOverlayClass();
  }

  hideStation() {
    this.el.station.classList.add('hidden');
    this.station = null;
    this.refreshOverlayClass();
  }

  renderStationHeader() {
    const st = this.station;
    if (!st) return;
    this.el.stnName.textContent = st.name;
    this.el.stnType.textContent = st.type.label;
    this.el.stnType.style.color = st.type.color;
    this.el.stnFaction.textContent = st.faction;
    this.el.stnTech.textContent = st.tech;
    this.el.stnEyebrow.textContent = `DOCKED // SECTOR ${st.sx},${st.sy}`;
    this.el.stnCredits.textContent = '◈ ' + formatCredits(this.app.game.state.credits);
    this.el.stnCargo.textContent = `${this.app.game.cargoUsed()} / ${this.app.game.maxCargo}`;
    this.el.stnFootnote.textContent = `DOCKING CLAMP SECURED · ${st.type.desc.toUpperCase()}`;
  }

  setTab(tab) {
    this.stationTab = tab;
    $$('.station-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach(p => p.classList.add('hidden'));
    const panel = $('#tab-' + tab);
    if (panel) panel.classList.remove('hidden');
    if (tab === 'shipyard') this.renderShipyard();
    else if (tab === 'market') this.renderMarket();
    else if (tab === 'contracts') this.renderContracts();
    else if (tab === 'services') this.renderServices();
    this.renderStationHeader();
  }

  statLines(ship, compact = false) {
    const stats = [
      ['HULL', ship.hull, 800],
      ['SHIELD', ship.shield, 460],
      ['SPEED', ship.speed, 330],
      ['CARGO', ship.cargo, 620],
      ['DAMAGE', ship.damage, 90],
      ['MINING', ship.mining, 18]
    ];
    return stats.map(([label, val, max]) => {
      if (compact) return `<div class="pc-stat"><span>${label}</span><b>${val}</b></div>`;
      const pct = clamp(val / max, 0, 1);
      return `<div class="stat-line"><div class="sl-head"><span>${label}</span><b>${val}</b></div><div class="stat-bar"><i style="width:${(pct * 100).toFixed(0)}%"></i></div></div>`;
    }).join('');
  }

  renderShipyard() {
    const st = this.station;
    const game = this.app.game;
    const selected = SHIP_MAP[this.selectedShip] || SHIP_MAP[st.stock[0]?.shipId];
    if (!selected) return;
    const stockEntry = st.stock.find(x => x.shipId === selected.id);
    const price = stockEntry?.price || selected.price;
    const trade = game.tradeInValue();
    const net = Math.max(0, price - trade);
    const isCurrent = selected.id === game.state.shipId;
    const canBuy = !isCurrent && game.state.credits + trade >= price && game.cargoUsed() <= selected.cargo;

    const cards = st.stock.map(entry => {
      const s = SHIP_MAP[entry.shipId];
      if (!s) return '';
      const role = ROLES[s.role];
      const current = s.id === game.state.shipId;
      const affordable = game.state.credits + game.tradeInValue() >= entry.price;
      return `
        <button class="ship-card ${current ? 'current' : ''} ${selected.id === s.id ? 'selected' : ''} ${affordable ? '' : 'locked'}" data-ship-id="${s.id}" style="--sc:${role.color}">
          <div class="sc-top"><span class="sc-role" style="color:${role.color}">${role.label}</span><span class="sc-tier">T${s.tier}</span></div>
          <h4>${s.name.toUpperCase()}</h4>
          <div class="sc-maker">${s.maker.toUpperCase()}</div>
          <div class="sc-art"><canvas data-ship-preview="${s.role}" data-ship-tier="${s.tier}"></canvas></div>
          <div class="sc-bottom">
            <div class="sc-price"><small>${entry.used ? 'USED · ' : ''}PRICE</small>◈ ${formatCredits(entry.price)}</div>
            ${current ? '<span class="sc-tag">ACTIVE</span>' : `<span class="sc-tag" style="color:${affordable ? '#74f0b0' : '#6f8799'};border-color:currentColor">${affordable ? 'BUY' : 'SAVE UP'}</span>`}
          </div>
        </button>`;
    }).join('');

    const detail = `
      <div class="ship-detail">
        <div class="detail-art" style="--sc:${ROLES[selected.role].color}">
          <canvas data-detail-preview="${selected.role}" data-detail-tier="${selected.tier}" data-detail="1"></canvas>
          <div class="da-label">HULL SCHEMATIC // T${selected.tier}</div>
          <div class="da-class">${ROLES[selected.role].label} BRANCH</div>
          <div class="da-name">${selected.name.toUpperCase()}</div>
        </div>
        <div class="detail-info" style="--sc:${ROLES[selected.role].color}">
          <div class="eyebrow">${selected.maker.toUpperCase()} · ${ROLES[selected.role].label} CLASS</div>
          <h3>${selected.name.toUpperCase()}</h3>
          <div class="di-maker">TIER ${selected.tier} · ${selected.hardpoints} HARDPOINT${selected.hardpoints > 1 ? 'S' : ''} · ${selected.perks.join(' · ').toUpperCase()}</div>
          <div class="di-desc">${selected.flavor}</div>
          <div class="stat-grid">${this.statLines(selected)}</div>
          <div class="detail-buy">
            <div class="dp"><small>STATION PRICE${stockEntry?.used ? ' · USED HULL' : ''}</small>◈ ${formatCredits(price)}</div>
            <div class="dp" style="font-size:11px;color:var(--green)"><small>YOUR TRADE-IN</small>◈ ${formatCredits(trade)}</div>
            <button class="btn primary" data-buy-ship="${selected.id}" ${isCurrent || !canBuy ? 'disabled' : ''}>${isCurrent ? 'ACTIVE HULL' : canBuy ? `ACQUIRE · ◈${formatCredits(net)}` : 'UNAVAILABLE'}</button>
          </div>
        </div>
      </div>`;
    $('#tab-shipyard').innerHTML = `
      <div class="section-head">
        <div><h3>SHIPYARD</h3><p>${st.stock.length} HULLS ON THE PAD · LOCAL TECH ${st.tech}/6 · STOCK ROTATES BETWEEN STATIONS</p></div>
        <span class="hint">TRADE-IN VALUE: ◈${formatCredits(trade)}</span>
      </div>
      ${detail}
      <div class="section-head" style="margin-top:22px"><h3>AVAILABLE HULLS</h3><p>TAP A HULL TO INSPECT</p></div>
      <div class="ship-grid">${cards}</div>`;
    this.paintShipPreviews();
  }

  paintShipPreviews() {
    requestAnimationFrame(() => {
      $$('canvas[data-ship-preview]').forEach(c => drawShipPreview(c, c.dataset.shipPreview, +c.dataset.shipTier || 1));
      $$('canvas[data-detail-preview]').forEach(c => drawShipPreview(c, c.dataset.detailPreview, +c.dataset.detailTier || 1, { detail: true, angle: -.12 }));
    });
  }

  renderMarket() {
    const st = this.station;
    const game = this.app.game;
    const s = game.state;
    const rows = COMMODITIES.map(c => {
      const m = st.market[c.id];
      const hold = s.cargo[c.id] || 0;
      return `
        <div class="mt-row" style="--cc:${c.color}">
          <div class="mt-name"><i></i><div>${c.name}<small>${c.code} · ${c.cat.toUpperCase()}</small></div></div>
          <div class="mt-price">◈ ${m.sell}</div>
          <div class="mt-price sell">◈ ${m.buy}</div>
          <div class="mt-actions">
            <button class="mini-btn" data-trade="buy" data-c="${c.id}" data-q="1">+1</button>
            <button class="mini-btn" data-trade="buy" data-c="${c.id}" data-q="10">+10</button>
            <button class="mini-btn sell" data-trade="sell" data-c="${c.id}" data-q="1" ${hold ? '' : 'disabled'}>−1</button>
            <button class="mini-btn sell" data-trade="sell" data-c="${c.id}" data-q="all" ${hold ? '' : 'disabled'}>ALL</button>
          </div>
        </div>`;
    }).join('');
    const holds = COMMODITIES.filter(c => (s.cargo[c.id] || 0) > 0).map(c => {
      const q = s.cargo[c.id];
      const m = st.market[c.id];
      return `<div class="hold-row"><span>${c.name} ×${q}</span><b>◈ ${formatCredits(q * m.buy)}</b></div>`;
    }).join('') || '<div class="hold-row" style="color:var(--dim)"><span>HOLD EMPTY</span><b>—</b></div>';
    const missions = s.missionCargo.map(mc => `<div class="hold-row"><span style="color:var(--amber)">${COMMODITY_MAP[mc.commodity].name} ×${mc.qty}</span><b style="color:var(--amber)">MISSION</b></div>`).join('');
    const oreValue = MINED_ORES.reduce((a, id) => a + (s.cargo[id] || 0) * (st.market[id]?.buy || 0), 0);
    $('#tab-market').innerHTML = `
      <div class="section-head"><div><h3>COMMODITY MARKET</h3><p>PRICES VARY BY STATION. BUY LOW, SELL HIGH, KEEP MOVING.</p></div><span class="hint">${st.type.label}</span></div>
      <div class="market-layout">
        <div>
          <div class="market-table">
            <div class="mt-row head"><div>COMMODITY</div><div>YOU PAY</div><div>THEY PAY</div><div style="text-align:right">TRADE</div></div>
            ${rows}
          </div>
          <div class="market-legend" style="margin-top:9px">STATION STOCK IS EFFECTIVELY UNLIMITED. <b>THEY PAY</b> IS YOUR SELL PRICE. MISSION CARGO CANNOT BE SOLD.</div>
        </div>
        <div class="market-side">
          <div class="side-card">
            <div class="eyebrow">CARGO HOLD</div>
            <h4>${game.cargoUsed()} / ${game.maxCargo} <span style="font-size:10px;color:var(--dim);font-weight:400">UNITS</span></h4>
            <div class="cargo-line"><i style="width:${clamp(game.cargoUsed() / game.maxCargo, 0, 1) * 100}%"></i></div>
            <div class="hold-list">${holds}${missions}</div>
          </div>
          <div class="side-card">
            <div class="eyebrow">QUICK SALE</div>
            <h4>RAW ORE</h4>
            <p style="font-size:11px;color:var(--dim);line-height:1.35;margin-bottom:8px">Sell every mined ore in your hold at this station's buy price.</p>
            <div class="price-trend"><span>ESTIMATED</span><b>◈ ${formatCredits(oreValue)}</b></div>
            <button class="btn ghost wide" style="margin-top:8px;height:34px;font-size:8px" data-sell-ore="1">SELL ALL ORE</button>
          </div>
        </div>
      </div>`;
    this.renderStationHeader();
  }

  renderContracts() {
    const st = this.station;
    const game = this.app.game;
    const activeIds = new Set(game.state.active.map(c => c.id));
    const available = getContracts(st, activeIds);
    const active = game.state.active;
    const filter = this.contractFilter;

    const cards = (filter === 'available' ? available : active).map(c => {
      const col = TYPE_COLORS[c.type];
      if (filter === 'available') {
        const noSpace = c.type === 'delivery' && game.cargoFree() < c.qty;
        return `
          <div class="contract-card" style="--ct:${col}">
            <div class="cc-top"><span class="cc-type">${TYPE_LABELS[c.type]}</span><div class="cc-reward">◈ ${formatCredits(c.reward)}<small>PAYOUT</small></div></div>
            <h4>${c.title}</h4>
            <div class="cc-desc">${c.desc}</div>
            <div class="cc-meta">
              ${c.type === 'delivery' ? `<span>CARGO <b>${c.qty}</b> PROVIDED</span>` : ''}
              ${c.type === 'mining' ? `<span>ORE <b>${c.qty} ${COMMODITY_MAP[c.commodity].code}</b></span>` : ''}
              ${c.type === 'bounty' ? `<span>TARGET <b>${c.kills} SHIPS</b></span>` : ''}
              ${c.type === 'survey' ? `<span>DEST <b>${c.targetSector.x}:${c.targetSector.y}</b></span>` : ''}
              ${c.targetSector && c.type !== 'survey' ? `<span>DEST <b>${c.targetSector.x}:${c.targetSector.y}</b></span>` : ''}
              <span>RISK <b>${c.type === 'bounty' ? 'COMBAT' : c.type === 'survey' ? 'DEEP SPACE' : 'LOW'}</b></span>
            </div>
            <div class="cc-foot">
              <span class="warn">${noSpace ? 'NOT ENOUGH CARGO SPACE' : c.note || ''}</span>
              <button class="btn primary" style="height:32px;padding:0 14px;font-size:8px" data-accept="${c.id}" ${noSpace ? 'disabled' : ''}>ACCEPT</button>
            </div>
          </div>`;
      }
      const can = game.canClaimContract(c, st);
      const pct = game.contractProgress(c) * 100;
      const pctText = c.type === 'bounty' ? `${c.progress}/${c.kills} SHIPS` :
        c.type === 'mining' ? `${game.state.cargo[c.commodity] || 0}/${c.qty} ORE` :
          c.type === 'survey' ? (c.progress ? 'DATA CAPTURED' : 'TRAVEL REQUIRED') :
            (c.targetKey === st.key ? 'DELIVER CARGO HERE' : `GO TO ${c.targetName}`);
      return `
        <div class="contract-card" style="--ct:${col}">
          <div class="cc-top"><span class="cc-type">${TYPE_LABELS[c.type]} · ACTIVE</span><div class="cc-reward">◈ ${formatCredits(c.reward)}<small>ON COMPLETION</small></div></div>
          <h4>${c.title}</h4>
          <div class="cc-desc">${c.desc}</div>
          <div class="cc-progress"><i style="width:${pct}%"></i></div>
          <div class="cc-meta"><span>PROGRESS <b>${pctText}</b></span><span>GIVER <b>${c.giverName}</b></span></div>
          <div class="cc-foot">
            <button class="mini-btn" data-abandon="${c.id}">ABANDON</button>
            ${can.ok ? `<button class="btn primary" style="height:31px;padding:0 14px;font-size:8px" data-claim="${c.id}">CLAIM ◈${formatCredits(c.reward)}</button>` : `<span class="warn">${can.msg}</span>`}
          </div>
        </div>`;
    }).join('');

    $('#tab-contracts').innerHTML = `
      <div class="section-head"><div><h3>CONTRACT BOARD</h3><p>FRESH WORK FROM LOCAL FACTIONS · BOARD REFRESHES EVERY 10 MINUTES</p></div><span class="hint">${active.length} ACTIVE</span></div>
      <div class="contracts-head">
        <div class="filter"><button data-cfilter="available" class="${filter === 'available' ? 'active' : ''}">AVAILABLE (${available.length})</button><button data-cfilter="active" class="${filter === 'active' ? 'active' : ''}">ACTIVE (${active.length})</button></div>
        <span style="font-family:var(--mono);font-size:7px;color:var(--dim);letter-spacing:.08em">DELIVERY CARGO IS PROVIDED · MINING USES YOUR HOLD</span>
      </div>
      <div class="contracts-grid">${cards || `<div class="empty-state">${filter === 'available' ? 'NO CONTRACTS ON THIS BOARD.<br>CHECK ANOTHER STATION.' : 'NO ACTIVE CONTRACTS.<br>VISIT THE BOARD TO TAKE WORK.'}</div>`}</div>`;
  }

  renderServices() {
    const st = this.station;
    const game = this.app.game;
    const s = game.state;
    const repair = game.repairCost(st);
    const oreValue = MINED_ORES.reduce((a, id) => a + (s.cargo[id] || 0) * (st.market[id]?.buy || 0), 0);
    const stats = s.stats;
    const mins = Math.floor((s.playTime || 0) / 60);
    $('#tab-services').innerHTML = `
      <div class="section-head"><div><h3>STATION SERVICES</h3><p>KEEP THE HULL TOGETHER AND THE HOLD EMPTY ENOUGH TO FILL AGAIN.</p></div><span class="hint">TECH ${st.tech}/6</span></div>
      <div class="service-grid">
        <div class="service-card">
          <div class="eyebrow">DOCKYARD</div>
          <h4>HULL &amp; SHIELD REPAIR</h4>
          <p>Restore the ship to full integrity. Prices scale with missing hull and local tech level.</p>
          <div class="svc-price">◈ ${formatCredits(repair)} ${repair === 0 ? '· ALL SYSTEMS NOMINAL' : ''}</div>
          <button class="btn ghost" data-service="repair" ${repair === 0 ? 'disabled' : ''}>REPAIR NOW</button>
          <div class="svc-note">HULL ${Math.ceil(s.hull)}/${game.maxHull} · SHIELD ${Math.ceil(s.shield)}/${game.maxShield}</div>
        </div>
        <div class="service-card">
          <div class="eyebrow">REFINERY BUYER</div>
          <h4>SELL ALL RAW ORE</h4>
          <p>Dump every mined ore in the hold at this station's buy price. Mission cargo is untouched.</p>
          <div class="svc-price">◈ ${formatCredits(oreValue)} ESTIMATED</div>
          <button class="btn ghost" data-service="sellore" ${oreValue <= 0 ? 'disabled' : ''}>SELL ALL ORE</button>
          <div class="svc-note">IRON · TITANIUM · COBALT · GOLD</div>
        </div>
        <div class="service-card">
          <div class="eyebrow">CARGO BAY</div>
          <h4>JETTISON ALL CARGO</h4>
          <p>Vent the hold into space. Useful when a full load is keeping you from a better contract.</p>
          <div class="svc-price">${game.cargoUsed()} UNITS · ${game.cargoFree()} FREE</div>
          <button class="btn danger" data-service="jettison" ${game.cargoUsed() ? '' : 'disabled'}>JETTISON</button>
          <div class="svc-note">MISSION CARGO WILL BE LOST AND ITS CONTRACT FAILED.</div>
        </div>
        <div class="service-card">
          <div class="eyebrow">CAPTAIN'S LOG</div>
          <h4>${s.shipId ? shipById(s.shipId).name.toUpperCase() : '—'}</h4>
          <p>Career record since registration. The void keeps score even when you do not.</p>
          <div class="cc-meta" style="border:0;padding:0;margin:8px 0;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px">
            <span>KILLS <b>${stats.kills}</b></span>
            <span>ORE MINED <b>${stats.ore}</b></span>
            <span>CONTRACTS <b>${stats.contracts}</b></span>
            <span>JUMPS <b>${stats.jumps}</b></span>
            <span>TRADES <b>${stats.trades}</b></span>
            <span>FLIGHT TIME <b>${mins} MIN</b></span>
          </div>
          <div class="svc-note">SHIPS OWNED ${stats.ships} · DEATHS ${stats.deaths}</div>
        </div>
      </div>`;
  }

  // ── map ─────────────────────────────────────────────────────────
  openMap() {
    this.screen = 'map';
    this.mapOpen = true;
    this.mapSelected = { x: this.app.game.state.sector.x, y: this.app.game.state.sector.y };
    this.el.map.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.mapCredits.textContent = formatCredits(this.app.game.state.credits);
    this.renderMapInfo();
    this.refreshOverlayClass();
    audio.sfx('scan');
  }

  closeMap() {
    this.mapOpen = false;
    this.el.map.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.screen = 'space';
    this.refreshOverlayClass();
    audio.sfx('uiBack');
  }

  renderMapInfo() {
    const state = this.app.game.state;
    const sel = this.mapSelected;
    if (!sel) {
      this.el.mapInfo.classList.add('hidden');
      this.el.mapEmpty.classList.remove('hidden');
      return;
    }
    this.el.mapEmpty.classList.add('hidden');
    this.el.mapInfo.classList.remove('hidden');
    const meta = getSectorMeta(sel.x, sel.y);
    const visited = state.visitedSet.has(sectorKey(sel.x, sel.y));
    const cur = sel.x === state.sector.x && sel.y === state.sector.y;
    const adjacent = isAdjacent(state.sector, sel);
    const revealed = visited || isRevealed(state.visitedSet, sel.x, sel.y);
    $('#mi-status').textContent = cur ? 'CURRENT POSITION' : visited ? 'CHARTED SECTOR' : revealed ? 'ADJACENT SIGNAL' : 'UNCHARTED';
    $('#mi-name').textContent = visited || revealed ? meta.name : 'UNCHARTED';
    $('#mi-coords').textContent = `SECTOR ${sel.x} : ${sel.y} · ${meta.security}`;
    const pips = $('#mi-danger-pips');
    pips.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < meta.danger ? 'on' : ''} ${meta.danger <= 1 && i < meta.danger ? 'low' : ''}"></i>`).join('');
    $('#mi-stations').textContent = visited ? String(meta.stationCount) : revealed ? `${meta.stationCount} SIGNATURE${meta.stationCount === 1 ? '' : 'S'}` : '—';
    $('#mi-planets').textContent = visited ? String(meta.planetCount) : revealed ? 'UNSCANNED' : '—';
    $('#mi-fields').textContent = visited ? String(meta.fieldCount) : revealed ? 'UNSCANNED' : '—';
    $('#mi-anomaly').textContent = visited ? (meta.hasAnomaly ? 'DETECTED' : 'NONE') : revealed ? '?' : '—';
    const route = $('#mi-route');
    if (cur) route.innerHTML = '<span class="ok">● CURRENT SECTOR.</span> Open the chart and select an adjacent node to jump.';
    else if (adjacent) route.innerHTML = '<span class="ok">◈ ADJACENT · WARP READY.</span> One jump. No fuel cost.';
    else route.innerHTML = '<span class="bad">◈ OUT OF RANGE.</span> Warp range is one sector. Hop through charted space.';
    const jump = $('#btn-jump');
    jump.disabled = !adjacent;
    jump.textContent = cur ? 'YOU ARE HERE' : adjacent ? 'ENGAGE WARP' : 'OUT OF RANGE';
    $('#mi-note').textContent = visited ? 'Sector telemetry archived.' : 'Charts show station signatures but not their inventories. Dock to see what they stock.';
    this.el.mapCoords.textContent = `SECTOR ${state.sector.x} : ${state.sector.y}`;
  }

  bindMapCanvas() {
    const cv = this.el.mapCanvas;
    const handler = (e) => {
      const rect = cv.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const cell = Math.min(w / 8.2, h / 7.6) * 1.02;
      const cur = this.app.game.state.sector;
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const dx = Math.round((px - w / 2) / cell);
      const dy = Math.round((py - h / 2) / cell);
      const x = cur.x + dx, y = cur.y + dy;
      const visited = this.app.game.state.visitedSet;
      if (!isRevealed(visited, x, y)) {
        this.toast('NO TELEMETRY — JUMP TO A REVEALED SECTOR FIRST', 'warn');
        return;
      }
      this.mapSelected = { x, y };
      audio.sfx('ui');
      this.renderMapInfo();
    };
    cv.addEventListener('pointerdown', handler);
  }

  // ── settings ────────────────────────────────────────────────────
  openSettings(from = 'title') {
    this.settingsReturn = from;
    this.el.settings.classList.remove('hidden');
    if (from === 'pause') this.el.pause.classList.add('hidden');
    $('#sens-range').value = this.app.game.state?.settings?.sens || 1;
    this.updateSensLabel();
    this.updateSoundToggle();
    this.updateTiltToggle();
    this.updateQuality();
    this.refreshOverlayClass();
  }

  closeSettings() {
    this.el.settings.classList.add('hidden');
    if (this.settingsReturn === 'pause') {
      this.el.pause.classList.remove('hidden');
    } else if (this.settingsReturn === 'title') {
      this.el.title.classList.remove('hidden');
    } else if (this.settingsReturn === 'space') {
      this.el.hud.classList.remove('hidden');
    }
    this.refreshOverlayClass();
  }

  updateSoundToggle() {
    const on = this.app?.game?.state?.settings?.sound ?? true;
    $('#toggle-sound').classList.toggle('on', on);
  }

  updateTiltToggle() {
    const on = this.app?.game?.state?.settings?.tilt ?? false;
    $('#toggle-tilt').classList.toggle('on', on);
  }

  updateQuality() {
    const q = this.app?.game?.state?.settings?.quality || 'high';
    $$('#quality-seg button').forEach(b => b.classList.toggle('active', b.dataset.q === q));
  }

  updateSensLabel() {
    const v = parseFloat($('#sens-range').value);
    $('#sens-value').textContent = v.toFixed(1) + '×';
  }

  // ── pause / death ───────────────────────────────────────────────
  openPause() {
    this.screen = 'pause';
    const s = this.app.game.state;
    const stats = s.stats;
    const mins = Math.floor((s.playTime || 0) / 60);
    $('#pause-stats').innerHTML = `
      <div>CREDITS <b>◈ ${formatCredits(s.credits)}</b></div>
      <div>KILLS <b>${stats.kills}</b></div>
      <div>ORE MINED <b>${stats.ore}</b></div>
      <div>CONTRACTS <b>${stats.contracts}</b></div>
      <div>JUMPS <b>${stats.jumps}</b></div>
      <div>FLIGHT TIME <b>${mins}m</b></div>`;
    this.el.pause.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.refreshOverlayClass();
    audio.sfx('ui');
  }

  closePause() {
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.screen = 'space';
    this.refreshOverlayClass();
    audio.sfx('uiBack');
  }

  showDeath(source) {
    this.screen = 'death';
    this.el.death.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.refreshOverlayClass();
    const s = this.app.game.state;
    const lost = Math.round(s.credits * .2);
    $('#death-reason').textContent = source === 'PLANETARY IMPACT'
      ? 'You flew into a planet. The planet did not notice.'
      : source === 'ASTEROID IMPACT'
        ? 'An asteroid field claimed your hull. The belt keeps what it takes.'
        : 'Your hull was breached in combat. An emergency beacon recovered your pod.';
    $('#death-penalty').innerHTML = `RECOVERY FEE <b style="color:var(--danger)">−◈ ${formatCredits(lost)}</b><br>CARGO LOST · DELIVERY CONTRACTS FAILED<br>RETURNING TO ${s.lastStation?.name || 'LAST STATION'}`;
  }

  hideDeath() {
    this.el.death.classList.add('hidden');
    this.refreshOverlayClass();
  }

  // ── events ──────────────────────────────────────────────────────
  bind() {
    const clickSound = () => audio.sfx('ui');
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) audio.sfx('ui');
    }, { passive: true });

    $('#btn-new').addEventListener('click', () => {
      if (this.app.hasSave()) {
        this.confirm({
          eyebrow: 'NEW CAREER',
          title: 'OVERWRITE CURRENT SAVE?',
          text: 'Starting a new career replaces your current captain and ship. This cannot be undone.',
          confirmText: 'START NEW',
          danger: true,
          onConfirm: () => this.app.newCareerFlow()
        });
      } else this.app.newCareerFlow();
    });
    $('#btn-continue').addEventListener('click', () => this.app.continueCareer());
    $('#btn-title-settings').addEventListener('click', () => this.openSettings('title'));
    $('#btn-select-back').addEventListener('click', () => this.app.showTitle());

    $('#path-cards').addEventListener('click', (e) => {
      const card = e.target.closest('.path-card');
      if (!card) return;
      $$('.path-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => this.app.startNewCareer(card.dataset.role), 120);
    });

    $('#station-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      this.setTab(b.dataset.tab);
    });
    $('#btn-undock').addEventListener('click', () => this.app.undock());

    $('#station-screen').addEventListener('click', (e) => {
      const card = e.target.closest('[data-ship-id]');
      if (card) {
        this.selectedShip = card.dataset.shipId;
        this.renderShipyard();
        return;
      }
      const buy = e.target.closest('[data-buy-ship]');
      if (buy) { this.buyShipFlow(buy.dataset.buyShip); return; }
      const trade = e.target.closest('[data-trade]');
      if (trade) { this.tradeFlow(trade.dataset.trade, trade.dataset.c, trade.dataset.q); return; }
      if (e.target.closest('[data-sell-ore]')) { this.serviceFlow('sellore'); return; }
      const accept = e.target.closest('[data-accept]');
      if (accept) { this.acceptFlow(accept.dataset.accept); return; }
      const claim = e.target.closest('[data-claim]');
      if (claim) { this.claimFlow(claim.dataset.claim); return; }
      const abandon = e.target.closest('[data-abandon]');
      if (abandon) {
        this.confirm({
          eyebrow: 'CONTRACT',
          title: 'ABANDON CONTRACT?',
          text: 'The contract will be removed from your log. Any provided mission cargo will be jettisoned.',
          confirmText: 'ABANDON', danger: true,
          onConfirm: () => {
            const r = this.app.game.abandonContract(abandon.dataset.abandon);
            this.toast(r.msg, r.ok ? 'warn' : 'bad');
            this.renderContracts();
          }
        });
        return;
      }
      if (e.target.closest('[data-cfilter]')) { this.contractFilter = e.target.closest('[data-cfilter]').dataset.cfilter; this.renderContracts(); return; }
      const svc = e.target.closest('[data-service]');
      if (svc) { this.serviceFlow(svc.dataset.service); return; }
    });

    $('#btn-map').addEventListener('click', () => this.app.openMap());
    $('#btn-map-close').addEventListener('click', () => this.app.closeMap());
    $('#btn-jump').addEventListener('click', () => {
      if (this.mapSelected) this.app.jumpTo(this.mapSelected);
    });
    this.bindMapCanvas();

    $('#btn-menu').addEventListener('click', () => this.app.openPause());
    $('#btn-resume').addEventListener('click', () => this.app.closePause());
    $('#btn-pause-settings').addEventListener('click', () => this.openSettings('pause'));
    $('#btn-save-quit').addEventListener('click', () => {
      this.app.save();
      this.app.quitToTitle();
    });
    $('#btn-respawn').addEventListener('click', () => this.app.respawn());

    $('#btn-settings-close').addEventListener('click', () => this.closeSettings());
    $('#toggle-sound').addEventListener('click', () => {
      const s = this.app.game.state;
      s.settings.sound = !s.settings.sound;
      audio.setEnabled(s.settings.sound);
      this.updateSoundToggle();
      audio.sfx('ui');
    });
    $('#toggle-tilt').addEventListener('click', async () => {
      const s = this.app.game.state;
      const next = !s.settings.tilt;
      if (next) {
        const r = await this.app.input.setTilt(true);
        if (!r.ok) {
          this.toast(r.msg || 'TILT UNAVAILABLE', 'warn');
          s.settings.tilt = false;
          this.updateTiltToggle();
          return;
        }
        this.toast('TILT STEERING ENABLED — HOLD YOUR DEVICE LEVEL', 'good');
      } else {
        this.app.input.setTilt(false);
        this.toast('TILT STEERING DISABLED');
      }
      s.settings.tilt = next;
      this.updateTiltToggle();
    });
    $('#sens-range').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (this.app.game.state) this.app.game.state.settings.sens = v;
      this.updateSensLabel();
    });
    $('#quality-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]');
      if (!b) return;
      if (this.app.game.state) this.app.game.state.settings.quality = b.dataset.q;
      this.app.renderer.setQuality(b.dataset.q);
      this.updateQuality();
      this.app.input.resetActions();
    });
    $('#btn-reset-save').addEventListener('click', () => {
      this.confirm({
        eyebrow: 'DANGER ZONE',
        title: 'ERASE CAREER?',
        text: 'Your captain, ships, credits, contracts and charted sectors will be permanently deleted.',
        confirmText: 'ERASE', danger: true,
        onConfirm: () => {
          this.app.resetSave();
          this.toast('SAVE ERASED', 'warn');
          this.closeSettings();
          this.showTitle();
        }
      });
    });

    $('#modal-cancel').addEventListener('click', () => this.closeModal());
    $('#modal-confirm').addEventListener('click', () => {
      const fn = this.modalAction;
      this.closeModal();
      if (fn) fn();
    });
    $('.modal-backdrop').addEventListener('click', () => this.closeModal());

    $('#btn-dock').addEventListener('click', () => this.app.dockNearest());
    $('#btn-interact').addEventListener('click', () => this.app.dockNearest());

    // map selection via touch already bound
    window.addEventListener('resize', () => {
      if (this.mapOpen) this.renderMapInfo();
      this.lastShipId = null;
    });
  }

  // ── flows ───────────────────────────────────────────────────────
  buyShipFlow(id) {
    const st = this.station;
    const entry = st.stock.find(x => x.shipId === id);
    const ship = SHIP_MAP[id];
    if (!entry || !ship) return;
    const game = this.app.game;
    const trade = game.tradeInValue();
    const net = Math.max(0, entry.price - trade);
    if (game.state.credits + trade < entry.price) { this.toast('INSUFFICIENT CREDITS', 'bad'); audio.sfx('deny'); return; }
    if (game.cargoUsed() > ship.cargo) { this.toast(`NEW HOLD TOO SMALL — ${game.cargoUsed()} UNITS ABOARD`, 'bad'); audio.sfx('deny'); return; }
    this.confirm({
      eyebrow: 'SHIPYARD ACQUISITION',
      title: `ACQUIRE ${ship.name.toUpperCase()}?`,
      text: `${ship.maker} ${ROLES[ship.role].label} hull, tier ${ship.tier}. Your current ${game.ship.name} trades in for <b>◈${formatCredits(trade)}</b>.<br><br>Net cost: <b style="color:var(--credits)">◈${formatCredits(net)}</b>. Cargo is transferred.`,
      confirmText: `ACQUIRE · ◈${formatCredits(net)}`,
      onConfirm: () => {
        const r = game.buyShip(st, ship, entry.price);
        this.toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) {
          this.app.save();
          this.el.stnCredits.textContent = '◈ ' + formatCredits(game.state.credits);
          this.renderShipyard();
          this.app.refreshHudShip();
        }
      }
    });
  }

  tradeFlow(action, id, qty) {
    const game = this.app.game;
    const s = game.state;
    const amount = qty === 'all' ? (s.cargo[id] || 0) : parseInt(qty, 10);
    const r = action === 'buy' ? game.buyCommodity(this.station, id, amount) : game.sellCommodity(this.station, id, amount);
    if (!r.ok) { this.toast(r.msg, 'bad'); audio.sfx('deny'); }
    else { this.toast(r.msg, 'good'); }
    this.renderMarket();
    this.renderStationHeader();
    this.app.save();
  }

  serviceFlow(type) {
    const game = this.app.game;
    if (type === 'repair') {
      const r = game.repair(this.station);
      this.toast(r.msg, r.ok ? 'good' : 'warn');
      if (r.ok) this.app.save();
      this.renderServices();
      this.renderStationHeader();
    } else if (type === 'sellore') {
      const r = game.sellAllOre(this.station);
      this.toast(r.msg, r.ok ? 'good' : 'warn');
      if (r.ok) this.app.save();
      this.renderServices();
      this.renderMarket();
      this.renderStationHeader();
    } else if (type === 'jettison') {
      this.confirm({
        eyebrow: 'CARGO BAY',
        title: 'JETTISON ALL CARGO?',
        text: 'Every commodity and all mission cargo will be vented. Delivery contracts will fail.',
        confirmText: 'JETTISON', danger: true,
        onConfirm: () => {
          game.state.cargo = {};
          game.state.missionCargo = [];
          game.state.active = game.state.active.filter(c => c.type !== 'delivery');
          this.toast('CARGO JETTISONED', 'warn');
          this.renderServices();
          this.renderStationHeader();
          this.app.save();
        }
      });
    }
  }

  acceptFlow(id) {
    const st = this.station;
    const game = this.app.game;
    const c = getContracts(st, new Set(game.state.active.map(x => x.id))).find(x => x.id === id);
    if (!c) return;
    const r = game.acceptContract(c);
    this.toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) {
      this.contractFilter = 'active';
      this.app.save();
      this.renderContracts();
    }
  }

  claimFlow(id) {
    const game = this.app.game;
    const c = game.state.active.find(x => x.id === id);
    if (!c) return;
    const r = game.claimContract(c, this.station);
    this.toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) {
      this.app.save();
      this.renderContracts();
      this.renderStationHeader();
      this.renderServices();
    }
  }
}
