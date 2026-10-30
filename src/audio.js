// ── VOIDLINE :: synthesized audio ────────────────────────────────────
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientGain = null;
    this.enabled = true;
    this.started = false;
    this.last = {};
    this.noiseBuffer = null;
    this.ambientNodes = [];
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.0;
    this.ambientGain.connect(this.master);
    this.noiseBuffer = this.makeNoise(2);
    this.started = true;
    this.startAmbient();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.5 : 0.0, this.ctx.currentTime, 0.08);
    if (on) this.resume();
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbient() {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 2.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.13;
    filter.connect(gain);
    gain.connect(this.ambientGain);

    const freqs = [55, 82.4, 110, 164.8];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.18 / (i * 0.4 + 1);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.032 + i * 0.011;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = f * 0.006;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(g); g.connect(filter);
      osc.start(); lfo.start();
      this.ambientNodes.push(osc, lfo);
    });

    // slow filter drift
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.017;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg); lg.connect(filter.frequency); lfo.start();
    this.ambientNodes.push(lfo);

    // distant wind
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.5;
    const ng = ctx.createGain(); ng.gain.value = 0.045;
    noise.connect(nf); nf.connect(ng); ng.connect(this.ambientGain);
    noise.start();
    this.ambientNodes.push(noise);

    this.ambientGain.gain.setTargetAtTime(0.8, ctx.currentTime, 3.5);
  }

  setAmbient(level) {
    if (!this.ambientGain) return;
    this.ambientGain.gain.setTargetAtTime(level, this.ctx.currentTime, 1.2);
  }

  can(name, ms = 40) {
    if (!this.ctx || !this.enabled) return false;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < ms) return false;
    this.last[name] = now;
    return true;
  }

  tone({ freq = 440, freqEnd = null, type = 'sine', dur = .15, vol = .1, attack = .005, detune = 0, filter = null, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq || 1000;
      f.Q.value = filter.q || 1;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise({ dur = .3, vol = .2, filterType = 'lowpass', freq = 900, freqEnd = null, q = .8, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + .03);
  }

  sfx(name, opt = {}) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'ui':
        if (!this.can('ui', 45)) return;
        this.tone({ freq: 620, freqEnd: 780, type: 'square', dur: .045, vol: .025, filter: { freq: 1800 } });
        break;
      case 'uiBack':
        this.tone({ freq: 420, freqEnd: 320, type: 'square', dur: .05, vol: .022, filter: { freq: 1200 } });
        break;
      case 'laser':
        if (!this.can('laser', 55)) return;
        this.tone({ freq: 920, freqEnd: 260, type: 'sawtooth', dur: .075, vol: .045, filter: { freq: 1600, q: 3 } });
        this.noise({ dur: .04, vol: .02, filterType: 'highpass', freq: 1800 });
        break;
      case 'enemyLaser':
        if (!this.can('enemyLaser', 80)) return;
        this.tone({ freq: 480, freqEnd: 140, type: 'square', dur: .11, vol: .026, filter: { freq: 900, q: 2 } });
        break;
      case 'mining':
        if (!this.can('mining', 150)) return;
        this.noise({ dur: .12, vol: .04, filterType: 'bandpass', freq: 1100 + Math.random() * 500, q: 1.4 });
        this.tone({ freq: 150 + Math.random() * 70, type: 'sawtooth', dur: .08, vol: .014 });
        break;
      case 'hit':
        if (!this.can('hit', 35)) return;
        this.noise({ dur: .055, vol: .045, filterType: 'highpass', freq: 1400 });
        break;
      case 'shield':
        if (!this.can('shield', 60)) return;
        this.tone({ freq: 300, freqEnd: 640, type: 'sine', dur: .1, vol: .035 });
        break;
      case 'explode':
        if (!this.can('explode', 60)) return;
        this.noise({ dur: .5, vol: .19, filterType: 'lowpass', freq: 900, freqEnd: 70 });
        this.tone({ freq: 90, freqEnd: 35, type: 'sine', dur: .45, vol: .16 });
        break;
      case 'bigExplode':
        this.noise({ dur: .9, vol: .25, filterType: 'lowpass', freq: 700, freqEnd: 45 });
        this.tone({ freq: 65, freqEnd: 24, type: 'sine', dur: .8, vol: .2 });
        break;
      case 'coin':
        if (!this.can('coin', 60)) return;
        [880, 1174, 1568].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: .12, vol: .028, delay: i * .045 }));
        break;
      case 'ore':
        if (!this.can('ore', 90)) return;
        this.tone({ freq: 330, freqEnd: 520, type: 'triangle', dur: .13, vol: .035 });
        break;
      case 'dock':
        this.tone({ freq: 180, freqEnd: 90, type: 'sine', dur: .5, vol: .08 });
        this.tone({ freq: 360, type: 'triangle', dur: .25, vol: .04, delay: .08 });
        this.noise({ dur: .25, vol: .03, filterType: 'lowpass', freq: 500 });
        break;
      case 'undock':
        this.tone({ freq: 100, freqEnd: 220, type: 'sine', dur: .3, vol: .06 });
        break;
      case 'jump':
        this.tone({ freq: 80, freqEnd: 1200, type: 'sawtooth', dur: 1.4, vol: .07, filter: { freq: 500, q: 4 } });
        this.noise({ dur: 1.5, vol: .09, filterType: 'bandpass', freq: 300, freqEnd: 3000, q: 1 });
        break;
      case 'arrive':
        this.tone({ freq: 1200, freqEnd: 160, type: 'sine', dur: .8, vol: .075 });
        this.noise({ dur: .6, vol: .07, filterType: 'lowpass', freq: 2200, freqEnd: 200 });
        break;
      case 'deny':
        this.tone({ freq: 180, freqEnd: 120, type: 'square', dur: .16, vol: .04, filter: { freq: 600 } });
        break;
      case 'warn':
        if (!this.can('warn', 300)) return;
        this.tone({ freq: 740, type: 'square', dur: .09, vol: .035, filter: { freq: 1200 } });
        this.tone({ freq: 740, type: 'square', dur: .09, vol: .035, filter: { freq: 1200 }, delay: .16 });
        break;
      case 'buy':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: .16, vol: .04, delay: i * .06 }));
        break;
      case 'contract':
        [392, 523, 659].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: .3, vol: .04, delay: i * .1 }));
        break;
      case 'scan':
        this.tone({ freq: 300, freqEnd: 1400, type: 'sine', dur: .7, vol: .03 });
        break;
      case 'alarm':
        this.tone({ freq: 880, freqEnd: 560, type: 'sawtooth', dur: .5, vol: .04, filter: { freq: 1200, q: 2 } });
        break;
    }
  }
}

export const audio = new AudioEngine();
