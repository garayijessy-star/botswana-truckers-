// Audio: synthesized engine (per-brand character), horn, siren, beeps, and a music player that plays your own files.

export const ENGINE_PROFILES = {
  volvo:  { cyl: 6, harm: [1.0, 0.55, 0.38, 0.22, 0.12], growl: 3,  cutoff: 900,  noise: 0.10, turbo: 0.9, idle: 600, redline: 2000, lope: 0.00 },
  scania: { cyl: 8, harm: [1.0, 0.70, 0.45, 0.30, 0.18], growl: 7,  cutoff: 700,  noise: 0.12, turbo: 0.6, idle: 550, redline: 2100, lope: 0.35 },
  man:    { cyl: 6, harm: [1.0, 0.45, 0.50, 0.35, 0.25], growl: 11, cutoff: 1100, noise: 0.16, turbo: 1.1, idle: 650, redline: 2000, lope: 0.05 },
  scania6:{ cyl: 6, harm: [1.0, 0.62, 0.40, 0.26, 0.15], growl: 5,  cutoff: 800,  noise: 0.11, turbo: 0.8, idle: 580, redline: 2000, lope: 0.10 },
};

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
    this.onTrack = null;
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
    this.engOut = ctx.createGain(); this.engOut.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 1.2;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = makeCurve(6); this.shaper.oversample = '2x';
    this.shaper.connect(this.engFilter); this.engFilter.connect(this.engOut); this.engOut.connect(this.sfx);
    this.oscs = [];
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'triangle';
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.shaper); o.start();
      this.oscs.push({ o, g });
    }
    // Lope / pulse LFO on engine amplitude (gives the V8 burble & diesel chug)
    this.lope = ctx.createOscillator(); this.lope.frequency.value = 8;
    this.lopeGain = ctx.createGain(); this.lopeGain.gain.value = 0;
    this.lope.connect(this.lopeGain); this.lopeGain.connect(this.engOut.gain); this.lope.start();

    // Noise (intake, exhaust hiss, tyre, wind)
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const mkNoise = (type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start();
      return { s, fl, g };
    };
    this.nEng = mkNoise('lowpass', 500);
    this.nWind = mkNoise('bandpass', 700, 0.5);
    this.nRoad = mkNoise('lowpass', 250);
    this.nTurbo = mkNoise('bandpass', 3000, 8);
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
  setProfile(name) { this.profileName = name; this.profile = ENGINE_PROFILES[name] || ENGINE_PROFILES.volvo; }
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
      slot.g.gain.setTargetAtTime(running ? a * (0.35 + 0.65 * load) * (i > 1 ? 0.6 + 0.8 * load : 1) : 0, t, k);
    });
    // subharmonic "rumble" osc
    const sub = this.oscs[5];
    sub.o.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
    sub.g.gain.setTargetAtTime(running ? 0.55 + 0.3 * (1 - load) : 0, t, k);

    const rpmN = Math.min(1, Math.max(0, (rpm - p.idle) / (p.redline - p.idle)));
    const cut = (p.cutoff + rpmN * 1500 + load * 1400) * mufflerMul;
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
