// Pure track model (no rendering): a closed loop road with towns, tolls, police posts and speed zones.
// Drive on the LEFT like Botswana. lat > 0 means left of the direction of travel.

export const STEP = 4;            // metres between samples
export const ROAD_HALF = 3.9;     // half width of the tarmac incl. edge lines
export const SHOULDER = 2.6;      // gravel shoulder width each side
export const LANE = 1.9;          // lane centre offset

export const TOWN_NAMES = ['Gaborone', 'Mahalapye', 'Palapye', 'Francistown', 'Nata', 'Maun'];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class Track {
  constructor() {
    // control points: a wobbly big loop (flat country with long gentle bends)
    const N = 72, R = 2000, pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = R * (1 + 0.20 * Math.sin(2 * a + 0.7) + 0.11 * Math.sin(3 * a + 1.9) + 0.05 * Math.sin(5 * a + 0.3));
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]);
    }
    // dense evaluation
    const dense = [], per = 40;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i + N - 1) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      for (let k = 0; k < per; k++) { const t = k / per; dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]); }
    }
    const M = dense.length, cum = new Float64Array(M + 1);
    for (let i = 0; i < M; i++) { const a = dense[i], b = dense[(i + 1) % M]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const total = cum[M];
    const n = Math.floor(total / STEP);
    this.n = n; this.step = total / n; this.length = total;
    this.X = new Float64Array(n); this.Z = new Float64Array(n); this.TX = new Float64Array(n); this.TZ = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const d = i * this.step;
      while (j < M - 1 && cum[j + 1] < d) j++;
      const f = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      const a = dense[j], b = dense[(j + 1) % M];
      this.X[i] = a[0] + (b[0] - a[0]) * f; this.Z[i] = a[1] + (b[1] - a[1]) * f;
    }
    for (let i = 0; i < n; i++) {
      const a = (i + n - 2) % n, b = (i + 2) % n;
      let dx = this.X[b] - this.X[a], dz = this.Z[b] - this.Z[a]; const l = Math.hypot(dx, dz) || 1;
      this.TX[i] = dx / l; this.TZ[i] = dz / l;
    }
    // Towns, tolls, police posts placed by fraction of the loop
    const L = this.length;
    this.towns = TOWN_NAMES.map((name, i) => ({ name, s: (i / TOWN_NAMES.length) * L + 300 }));
    this.tolls = [0.085, 0.255, 0.425, 0.595, 0.765, 0.935].map((f, i) => ({ s: f * L + 300, name: 'Toll Gate ' + (i + 1), fee: 40 + (i % 3) * 20, open: 0, paid: false }));
    this.posts = [0.04, 0.12, 0.21, 0.30, 0.38, 0.47, 0.55, 0.64, 0.72, 0.80, 0.89, 0.97].map(f => ({ s: f * L + 300, used: 0 }));
    // nature: cattle crossing spots
    this.cattleSpots = []; for (let i = 0; i < 22; i++) this.cattleSpots.push(((i + 0.37) / 22) * L);
  }

  wrap(s) { const L = this.length; s %= L; return s < 0 ? s + L : s; }
  ds(a, b) { const L = this.length; let d = (b - a) % L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; }   // signed shortest distance a -> b

  pointAt(s, lat = 0) {
    s = this.wrap(s); const f = s / this.step, i = Math.floor(f) % this.n, t = f - Math.floor(f), j = (i + 1) % this.n;
    const x = this.X[i] + (this.X[j] - this.X[i]) * t, z = this.Z[i] + (this.Z[j] - this.Z[i]) * t;
    let tx = this.TX[i] + (this.TX[j] - this.TX[i]) * t, tz = this.TZ[i] + (this.TZ[j] - this.TZ[i]) * t; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const lx = tz, lz = -tx;     // left of travel
    return { x: x + lx * lat, z: z + lz * lat, tx, tz, lx, lz, psi: Math.atan2(-tx, -tz), cx: x, cz: z };
  }

  // Find s and lateral offset of a world point. hint = previous sample index (or -1 for global search)
  locate(x, z, hint) {
    const n = this.n; let best = -1, bd = Infinity;
    const test = i => { const dx = x - this.X[i], dz = z - this.Z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
    if (hint == null || hint < 0) { for (let i = 0; i < n; i += 6) test(i); const c = best; for (let k = -8; k <= 8; k++) test((c + k + n) % n); }
    else for (let k = -30; k <= 30; k++) test((hint + k + n) % n);
    const i = best, j = (i + 1) % n, k0 = (i + n - 1) % n;
    // project on whichever neighbouring segment is closer
    const seg = (a, b) => { const ax = this.X[a], az = this.Z[a], bx = this.X[b], bz = this.Z[b], ex = bx - ax, ez = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))); return { t, d: Math.hypot(x - (ax + ex * t), z - (az + ez * t)) }; };
    const s1 = seg(i, j), s0 = seg(k0, i);
    let idx, t; if (s1.d <= s0.d) { idx = i; t = s1.t; } else { idx = k0; t = s0.t; }
    const s = (idx + t) * this.step, p = this.pointAt(s);
    const lat = (x - p.cx) * p.lx + (z - p.cz) * p.lz;
    return { i, s: this.wrap(s), lat, tx: p.tx, tz: p.tz, psi: p.psi };
  }

  limitAt(s) {
    for (const t of this.towns) if (Math.abs(this.ds(s, t.s)) < 380) return 60;
    for (const t of this.tolls) { const d = this.ds(t.s, s); if (d > -320 && d < 60) return 40; }
    return 80;
  }
  zoneName(s) { for (const t of this.towns) if (Math.abs(this.ds(s, t.s)) < 380) return t.name; return ''; }

  nextTown(s, from) {   // next town ahead of s, skipping the one at index `from`
    let best = null, bd = Infinity;
    this.towns.forEach((t, idx) => { if (idx === from) return; const d = this.wrap(t.s - s); if (d < bd) { bd = d; best = idx; } });
    return best;
  }
}

export function surfaceAt(lat) { const a = Math.abs(lat); return a < ROAD_HALF + 0.3 ? 'road' : a < ROAD_HALF + SHOULDER + 0.6 ? 'shoulder' : 'sand'; }
