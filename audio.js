// Audio: synthesized engine (per-brand character), horn, siren, beeps, and a music player that plays your own files.

export const ENGINE_PROFILES = {
  volvo:  { cyl: 6, harm: [1.0, 0.55, 0.38, 0.22, 0.12], growl: 3,  cutoff: 1500, noise: 0.10, turbo: 0.9, idle: 600, redline: 2000, lope: 0.00, knock: 0.85, bright: 0.9, uneven: false },
  scania: { cyl: 8, harm: [1.0, 0.70, 0.45, 0.30, 0.18], growl: 7,  cutoff: 1300, noise: 0.12, turbo: 0.6, idle: 550, redline: 2100, lope: 0.35, knock: 1.0, bright: 1.0, uneven: true },
  man:    { cyl: 6, harm: [1.0, 0.45, 0.50, 0.35, 0.25], growl: 11, cutoff: 1900, noise: 0.16, turbo: 1.1, idle: 650, redline: 2000, lope: 0.05, knock: 1.3, bright: 1.25, uneven: false },
  scania6:{ cyl: 6, harm: [1.0, 0.85, 0.70, 0.55, 0.40], growl: 5,  cutoff: 2300, noise: 0.14, turbo: 1.3, idle: 580, redline: 2000, lope: 0.10, knock: 1.1, bright: 1.5, uneven: false },
};

// Renders one seamless loop of diesel combustion pulses (thump + body resonance + injector clatter).
// Played back at different speeds to follow engine rpm, so the engine "chugs" like a real diesel instead of buzzing.
function renderEngineLoop(sr, cyl, uneven, loaded, baseRpm, knockMul, bright) {
  bright = bright || 1;
  const cycle = 120 / baseRpm, cycles = Math.max(6, Math.round(1.6 / cycle));
  const N = Math.round(sr * cycle * cycles), out = new Float32Array(N), ev = cyl * cycles;
  let seed = 977 + cyl * 31 + (loaded ? 101 : 0) + Math.round(baseRpm); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const scale = 750 / baseRpm;   // keep pulse length natural for the loop's own rpm
  for (let k = 0; k < ev; k++) {
    let t0 = (k / cyl) * cycle; if (uneven) t0 += (k % 2 ? 1 : -1) * 0.07 * cycle / cyl;
    const amp = (0.7 + 0.6 * rnd()) * (uneven && k % 2 ? 0.78 : 1);
    const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
    const i0 = Math.floor(t0 * sr), len = Math.floor(0.11 * sr * Math.max(0.5, scale));
    for (let j = 0; j < len; j++) {
      const t = j / sr / Math.max(0.5, scale), idx = (i0 + j + N) % N;
      const thump = Math.sin(2 * Math.PI * (64 - 160 * t) * t) * Math.exp(-t / 0.03);
      const body = Math.sin(2 * Math.PI * 131 * t + 1.1) * Math.exp(-t / 0.04) * 0.6;
      const knock = (rnd() * 2 - 1) * Math.exp(-t / (loaded ? 0.0032 : 0.006)) * (loaded ? 0.4 : 0.85) * knockMul;
      const crack = (rnd() * 2 - 1) * Math.exp(-t / 0.0011) * (loaded ? 0.55 : 0.35) * knockMul;
      // mid/high content: injector tick, valve-train rattle and combustion ring (what a phone microphone really hears)
      const ring = (Math.sin(2 * Math.PI * 820 * t + ph1) * 0.5 + Math.sin(2 * Math.PI * 1650 * t + ph2) * 0.35 + Math.sin(2 * Math.PI * 2700 * t + ph1 * 2) * 0.22) * Math.exp(-t / 0.0075);
      const tick = (rnd() * 2 - 1) * Math.exp(-t / 0.0007) * 0.9;
      const rattle = (rnd() * 2 - 1) * Math.exp(-t / 0.014) * 0.16;
      out[idx] += amp * (thump * (loaded ? 0.62 : 0.42) + body * (loaded ? 0.55 : 0.4) + knock * 1.1 + crack * 1.3 + bright * (ring * (loaded ? 0.8 : 0.6) + tick * (loaded ? 0.5 : 0.7) + rattle));
    }
  }
  let peak = 0, y = 0;
  for (let pass = 0; pass < 1; pass++) for (let i = 0; i < N; i++) { y += 0.75 * (out[i] - y); out[i] = y; peak = Math.max(peak, Math.abs(y)); }
  for (let i = 0; i < N; i++) out[i] /= (peak * 1.25 || 1);
  return out;
}

function makeCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return c;
}

export class AudioSys {
  constructor() {
    this.ctx = null; this.ready = false;
    this.profile = ENGINE_PROFILES.volvo; this.profileName = 'volvo';
    this.volume = 0.8;
    this.playlist = []; this.cur = -1; this.shuffle = false;
    this.onTrack = null; this.interior = true; this._lastLoad = 0; this._lastBrake = 0; this._eb = 0; this.engBufs = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.7; this.musicGain.connect(this.master);

    // Engine chain: oscillator bank -> shaper -> lowpass -> gain
    this.engBus = ctx.createGain(); this.engBus.gain.value = 1; this.engBus.connect(this.sfx);
    this.engOut = ctx.createGain(); this.engOut.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 1.2;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = makeCurve(6); this.shaper.oversample = '2x';
    this.shaper.connect(this.engFilter); this.engFilter.connect(this.engOut); this.engOut.connect(this.engBus);
    this.oscs = [];
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'triangle';
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.shaper); o.start();
      this.oscs.push({ o, g });
    }
    // Sampled diesel layer: four looping pulse trains (low/high rpm x idle-clatter/loaded), crossfaded by rpm and throttle
    this.sampMix = ctx.createGain(); this.sampMix.gain.value = 1; this.sampMix.connect(this.engFilter);
    this.samp = {};
    for (const key of ['loI', 'loL', 'hiI', 'hiL']) {
      const src = ctx.createBufferSource(); src.loop = true; const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.sampMix); this.samp[key] = { src, g, started: false };
    }
    this._loadSamples();
    // Lope / pulse LFO on engine amplitude (gives the V8 burble & diesel chug)
    this.lope = ctx.createOscillator(); this.lope.frequency.value = 8;
    this.lopeGain = ctx.createGain(); this.lopeGain.gain.value = 0;
    this.lope.connect(this.lopeGain); this.lopeGain.connect(this.engOut.gain); this.lope.start();

    // Noise (intake, exhaust hiss, tyre, wind)
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const mkNoise = (type, f, q, bus) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(bus || this.sfx); s.start();
      return { s, fl, g };
    };
    this.nEng = mkNoise('lowpass', 500, 0.7, this.engBus);
    this.nWind = mkNoise('bandpass', 700, 0.5);
    this.nRoad = mkNoise('lowpass', 250);
    this.nTurbo = mkNoise('bandpass', 3000, 8, this.engBus);
    this.nBrake = mkNoise('bandpass', 2200, 4);

    // Horn (two-tone air horn)
    this.hornG = ctx.createGain(); this.hornG.gain.value = 0; this.hornG.connect(this.sfx);
    this.hornO = [311, 392, 466].map(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(this.hornG); o.start(); return o; });

    // Siren
    this.sirG = ctx.createGain(); this.sirG.gain.value = 0; this.sirG.connect(this.sfx);
    this.sirO = ctx.createOscillator(); this.sirO.type = 'square'; this.sirO.frequency.value = 800;
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2500;
    this.sirO.connect(sf); sf.connect(this.sirG); this.sirO.start();
    this.sirT = 0;

    // Music element
    this.el = new Audio(); this.el.crossOrigin = 'anonymous'; this.el.preload = 'auto';
    this.src = ctx.createMediaElementSource(this.el); this.src.connect(this.musicGain);
    this.el.addEventListener('ended', () => this.next());
    this.el.addEventListener('error', () => { if (this.playlist.length > 1) this.next(); });
    this.ready = true;
    this._loadSaved();
  }

  setVolume(v) { this.volume = v; if (this.ready) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMusicVolume(v) { if (this.ready) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setProfile(name) { this.profileName = name; this.profile = ENGINE_PROFILES[name] || ENGINE_PROFILES.volvo; if (this.ready) this._loadSamples(); }
  setEngineVolume(v) { if (this.ready) this.engBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setSfxVolume(v) { if (this.ready) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setInterior(on) { this.interior = !!on; }
  _loadSamples() {
    if (!this.ctx) return; const p = this.profile, key = this.profileName, ctx = this.ctx;
    if (!this.engBufs[key]) {
      const mk = (loaded, base) => { const d = renderEngineLoop(ctx.sampleRate, p.cyl, !!p.uneven, loaded, base, p.knock || 1, p.bright || 1), b = ctx.createBuffer(1, d.length, ctx.sampleRate); b.getChannelData(0).set(d); return b; };
      this.engBufs[key] = { loI: mk(false, 700), loL: mk(true, 700), hiI: mk(false, 1500), hiL: mk(true, 1500) };
    }
    for (const k of ['loI', 'loL', 'hiI', 'hiL']) {
      const slot = this.samp[k], buf = this.engBufs[key][k];
      if (slot.started) { try { slot.src.stop(); } catch (_) {} const ns = ctx.createBufferSource(); ns.loop = true; ns.connect(slot.g); slot.src = ns; }
      slot.src.buffer = buf; slot.src.start(); slot.started = true;
    }
  }
  crank(dur = 0.9) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 46; lfo.frequency.value = 9; lg.gain.value = 16; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 650; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.08); g.gain.setValueAtTime(0.4, t + dur - 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); this.clunk();
  }
  _hiss(dur, freq, vol, sweepTo) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.05);
  }
  airRelease() { this._hiss(0.55, 4200, 0.22, 2500); }
  airApply() { this._hiss(0.18, 3000, 0.1, 2000); }
  blowOff(amt = 1) { this._hiss(0.45, 3200, 0.2 * amt, 1100); }
  pump() { this.beep(260, 0.03, 0.08, 'square'); }
  reverseBeep() { this.beep(1000, 0.2, 0.12, 'square'); }
  setCurve(k) { if (this.ready) this.shaper.curve = makeCurve(k); }

  // rpm: engine rpm, load 0..1 (throttle), speed m/s, braking 0..1, turboBoost 0..1, running bool, tune {power, muffler}
  updateEngine(rpm, load, speed, braking, running, tune) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, p = this.profile, k = 0.04;
    const mufflerMul = tune && tune.muffler ? tune.muffler : 1;
    const fire = (rpm / 60) * (p.cyl / 2);            // firing frequency
    p.harm.forEach((a, i) => {
      const slot = this.oscs[i];
      slot.o.frequency.setTargetAtTime(fire * (i + 1) * (i === 0 ? 1 : 1 + (i % 2 ? 0.003 : -0.002)), t, 0.02);
      slot.g.gain.setTargetAtTime(running ? 0.3 * a * (0.35 + 0.65 * load) * (i > 1 ? 0.6 + 0.8 * load : 1) : 0, t, k);
    });
    // subharmonic "rumble" osc
    const sub = this.oscs[5];
    sub.o.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
    sub.g.gain.setTargetAtTime(running ? 0.25 + 0.15 * (1 - load) : 0, t, k);
    // sampled diesel layer
    const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const wR = sm((rpm - 1000) / 550), wL = sm(load * 1.1), lvl = running ? 1 : 0, S = this.samp;
    const eb = (running && load < 0.05 && speed > 3 && rpm > 1000) ? 1 : 0; this._eb += (eb - this._eb) * 0.08;
    if (S.loI.started) {
      S.loI.g.gain.setTargetAtTime(lvl * (1 - wR) * (1 - wL), t, 0.04); S.loL.g.gain.setTargetAtTime(lvl * (1 - wR) * wL, t, 0.04);
      S.hiI.g.gain.setTargetAtTime(lvl * wR * (1 - wL), t, 0.04); S.hiL.g.gain.setTargetAtTime(lvl * wR * wL, t, 0.04);
      const r = Math.max(60, rpm); S.loI.src.playbackRate.setTargetAtTime(r / 700, t, 0.03); S.loL.src.playbackRate.setTargetAtTime(r / 700, t, 0.03);
      S.hiI.src.playbackRate.setTargetAtTime(r / 1500, t, 0.03); S.hiL.src.playbackRate.setTargetAtTime(r / 1500, t, 0.03);
    }
    this.sampMix.gain.setTargetAtTime(1.15 + 0.45 * this._eb, t, 0.05);
    if (running && this._lastLoad > 0.7 && load < 0.15 && rpm > 1250) this.blowOff(Math.min(1, (rpm - 1250) / 700));
    if (this._lastBrake > 0.45 && braking < 0.15 && speed > 1.5) this.airRelease();
    else if (this._lastBrake < 0.2 && braking > 0.6 && speed > 3) this.airApply();
    this._lastLoad = load; this._lastBrake = braking;

    const rpmN = Math.min(1, Math.max(0, (rpm - p.idle) / (p.redline - p.idle)));
    const cut = (p.cutoff + rpmN * 1500 + load * 1400 + this._eb * 500) * mufflerMul * (this.interior ? 0.7 : 1.2);
    this.engFilter.frequency.setTargetAtTime(cut, t, 0.05);
    this.engOut.gain.cancelScheduledValues(t);
    this.engOut.gain.setTargetAtTime(running ? 0.30 + 0.22 * load + 0.1 * rpmN : 0, t, 0.05);

    // lope (rough idle burble, fades with revs)
    this.lope.frequency.setTargetAtTime(Math.max(4, fire / (p.cyl >= 8 ? 2 : 3)), t, 0.1);
    this.lopeGain.gain.setTargetAtTime(running ? p.lope * 0.2 * (1 - rpmN) : 0, t, 0.1);

    this.nEng.g.gain.setTargetAtTime(running ? p.noise * (0.3 + 0.9 * load) : 0, t, 0.08);
    this.nEng.fl.frequency.setTargetAtTime(300 + rpmN * 900, t, 0.1);

    // turbo whistle: rises with load and rpm; lifts off -> flutter
    const boost = running ? load * rpmN * p.turbo * (tune && tune.turbo ? tune.turbo : 1) : 0;
    this.nTurbo.g.gain.setTargetAtTime(boost * 0.10, t, 0.12);
    this.nTurbo.fl.frequency.setTargetAtTime(2200 + boost * 3600, t, 0.1);

    // wind & tyre road noise scale with speed
    const sp = Math.min(1, speed / 28);
    this.nWind.g.gain.setTargetAtTime(sp * sp * 0.22, t, 0.1);
    this.nWind.fl.frequency.setTargetAtTime(400 + sp * 900, t, 0.1);
    this.nRoad.g.gain.setTargetAtTime(sp * 0.18, t, 0.1);
    // brake squeal at speed
    this.nBrake.g.gain.setTargetAtTime(braking > 0.6 && speed > 4 ? 0.05 * sp + 0.02 : 0, t, 0.05);
  }

  horn(on) { if (!this.ready) return; this.hornG.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.02); }

  siren(on, dt) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.sirG.gain.setTargetAtTime(on ? 0.12 : 0, t, 0.1);
    if (on) { this.sirT += dt || 0.016; const ph = (this.sirT % 1.2) / 1.2; this.sirO.frequency.setTargetAtTime(700 + 500 * Math.abs(Math.sin(ph * Math.PI)), t, 0.02); }
  }

  beep(freq = 880, dur = 0.12, vol = 0.2, type = 'sine') {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  click() { this.beep(1200, 0.05, 0.12, 'square'); }
  coin() { this.beep(988, 0.08, 0.18, 'triangle'); setTimeout(() => this.beep(1319, 0.18, 0.18, 'triangle'), 80); }
  clunk() {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.35);
  }
  crash(intensity = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5 * Math.min(1, intensity), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + 0.7);
  }
  indicatorTick() { this.beep(1800, 0.02, 0.05, 'square'); }
  gearShift() { this.clunk(); }

  // ---------- Music ----------
  async addFiles(fileList) {
    this.init();
    for (const f of fileList) {
      if (!f.type.startsWith('audio') && !/\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(f.name)) continue;
      const id = await this._save(f);
      this.playlist.push({ id, name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
    }
    if (this.cur < 0 && this.playlist.length) { this.cur = 0; this._load(); }
    this._notify();
  }
  _load() { if (this.cur < 0 || !this.playlist[this.cur]) return; this.el.src = this.playlist[this.cur].url; this._notify(); }
  play(i) { this.init(); if (typeof i === 'number') { this.cur = i; this._load(); } if (this.cur < 0 && this.playlist.length) { this.cur = 0; this._load(); } this.el.play().catch(() => {}); this._notify(); }
  toggle() { this.init(); if (this.el.paused) this.play(); else this.el.pause(); this._notify(); }
  next() { if (!this.playlist.length) return; this.cur = this.shuffle ? Math.floor(Math.random() * this.playlist.length) : (this.cur + 1) % this.playlist.length; this._load(); this.el.play().catch(() => {}); }
  prev() { if (!this.playlist.length) return; if (this.el.currentTime > 4) { this.el.currentTime = 0; return; } this.cur = (this.cur - 1 + this.playlist.length) % this.playlist.length; this._load(); this.el.play().catch(() => {}); }
  async clear() { this.el.pause(); this.playlist.forEach(p => URL.revokeObjectURL(p.url)); this.playlist = []; this.cur = -1; this.el.removeAttribute('src'); await this._wipe(); this._notify(); }
  _notify() { if (this.onTrack) this.onTrack(); }

  // IndexedDB persistence so your songs stay available offline next time
  _db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('bwt-music', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('songs', { autoIncrement: true });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async _save(file) { try { const db = await this._db(); return await new Promise((res, rej) => { const tx = db.transaction('songs', 'readwrite'); const rq = tx.objectStore('songs').add({ name: file.name, type: file.type, blob: file }); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); } catch (_) { return null; } }
  async _wipe() { try { const db = await this._db(); db.transaction('songs', 'readwrite').objectStore('songs').clear(); } catch (_) {} }
  async _loadSaved() {
    try {
      const db = await this._db();
      const all = await new Promise((res, rej) => { const out = []; const rq = db.transaction('songs').objectStore('songs').openCursor(); rq.onsuccess = e => { const c = e.target.result; if (c) { out.push({ id: c.key, v: c.value }); c.continue(); } else res(out); }; rq.onerror = () => rej(rq.error); });
      for (const { id, v } of all) this.playlist.push({ id, name: v.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(v.blob) });
      if (this.playlist.length && this.cur < 0) { this.cur = 0; this._load(); }
      this._notify();
    } catch (_) {}
  }
}
