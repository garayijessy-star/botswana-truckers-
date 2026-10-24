import * as THREE from 'three';
import { rbox, textPlane } from './trucks.js';
import { LANE, ROAD_HALF, SHOULDER } from './track.js';

const mat = (color, rough = 0.5, metal = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x0f1d28, roughness: 0.1, metalness: 0.6 });
const TYRE = mat(0x101010, 0.95, 0);
const DARK = mat(0x1b1d20, 0.8, 0.2);
const WHITE = mat(0xf0f0f0, 0.45, 0.3);
const WHEEL_GEO = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14); WHEEL_GEO.rotateZ(Math.PI / 2);

function bx(w, h, d, m, x, y, z, parent) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; if (parent) parent.add(o); return o;
}
function wheels(g, pts) { for (const [x, z] of pts) { const w = new THREE.Mesh(WHEEL_GEO, TYRE); w.position.set(x, 0.38, z); g.add(w); } }
function lamps(g, y, zF, zB, x, head, tail) {
  for (const s of [-1, 1]) { bx(0.4, 0.18, 0.06, head, s * x, y, zF, g); bx(0.4, 0.16, 0.06, tail, s * x, y, zB, g); }
}

// forward is -z. Returns { g, len, wid, head, tail, bar }
export function buildCar(kind, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.35, clearcoat: 0.8 });
  const head = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c0, emissiveIntensity: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x600000, emissive: 0xff1010, emissiveIntensity: 0.3 });
  const out = { g, head, tail, bar: null, len: 4.6, wid: 1.85 };
  if (kind === 'sedan') {
    const b = rbox(1.82, 0.62, 4.6, 0.18, paint); b.position.y = 0.68; g.add(b);
    const c = rbox(1.58, 0.55, 2.3, 0.2, GLASS); c.position.set(0, 1.2, 0.25); g.add(c);
    const r = rbox(1.54, 0.08, 1.9, 0.04, paint); r.position.set(0, 1.5, 0.25); g.add(r);
    wheels(g, [[-0.88, -1.4], [0.88, -1.4], [-0.88, 1.4], [0.88, 1.4]]); lamps(g, 0.82, -2.3, 2.3, 0.65, head, tail);
  } else if (kind === 'bakkie') {
    out.len = 5.3;
    const b = rbox(1.9, 0.7, 5.3, 0.12, paint); b.position.y = 0.78; g.add(b);
    const c = rbox(1.75, 0.75, 1.9, 0.15, paint); c.position.set(0, 1.45, -0.9); g.add(c);
    bx(1.76, 0.4, 1.4, GLASS, 0, 1.55, -0.95, g);
    bx(1.8, 0.35, 2.3, DARK, 0, 1.15, 1.5, g);
    wheels(g, [[-0.92, -1.6], [0.92, -1.6], [-0.92, 1.6], [0.92, 1.6]]); lamps(g, 0.9, -2.66, 2.66, 0.68, head, tail);
  } else if (kind === 'combi') {
    out.len = 5.3; out.wid = 1.95;
    const b = rbox(1.95, 1.75, 5.3, 0.25, WHITE); b.position.y = 1.3; g.add(b);
    bx(1.97, 0.5, 4.2, GLASS, 0, 1.65, 0.3, g); bx(1.97, 0.16, 5.0, mat(0x1565c0), 0, 1.05, 0, g);
    wheels(g, [[-0.9, -1.6], [0.9, -1.6], [-0.9, 1.5], [0.9, 1.5]]); lamps(g, 0.8, -2.66, 2.66, 0.7, head, tail);
  } else if (kind === 'lorry') {
    out.len = 8.4; out.wid = 2.5;
    const c = rbox(2.3, 2.2, 2.3, 0.25, paint); c.position.set(0, 1.9, -3.0); g.add(c);
    bx(2.31, 0.8, 1.0, GLASS, 0, 2.3, -3.6, g);
    bx(2.45, 2.7, 5.6, WHITE, 0, 2.25, 1.6, g); bx(1.0, 0.3, 8.0, DARK, 0, 0.8, 0, g);
    wheels(g, [[-1.0, -3.0], [1.0, -3.0], [-1.0, 1.6], [1.0, 1.6], [-1.0, 3.0], [1.0, 3.0]]); lamps(g, 0.95, -4.2, 4.2, 0.85, head, tail);
  } else { // police SUV
    out.len = 4.9; out.wid = 1.95;
    const b = rbox(1.9, 0.9, 4.9, 0.2, WHITE); b.position.y = 0.85; g.add(b);
    const c = rbox(1.7, 0.62, 3.0, 0.2, GLASS); c.position.set(0, 1.55, 0.5); g.add(c);
    bx(1.92, 0.24, 4.6, mat(0x0b3d91), 0, 0.85, 0, g);
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0.1 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000a55, emissive: 0x1050ff, emissiveIntensity: 0.1 });
    bx(0.5, 0.13, 0.3, red, -0.27, 1.92, 0.3, g); bx(0.5, 0.13, 0.3, blue, 0.27, 1.92, 0.3, g);
    out.bar = { red, blue };
    for (const s of [-1, 1]) { const t = textPlane('POLICE', 1.7, 0.3, { fg: '#fff', bg: '#0b3d91', cw: 256, size: 0.7 }); t.position.set(s * 0.96, 0.95, 0.2); t.rotation.y = s * Math.PI / 2; g.add(t); }
    wheels(g, [[-0.93, -1.5], [0.93, -1.5], [-0.93, 1.5], [0.93, 1.5]]); lamps(g, 0.95, -2.46, 2.46, 0.7, head, tail);
  }
  return out;
}

// ---------------------------------------------------------------- traffic
export class Traffic {
  constructor(scene, track, rnd, startS) {
    this.track = track; this.cars = []; this.group = new THREE.Group(); scene.add(this.group);
    const kinds = ['sedan', 'sedan', 'sedan', 'bakkie', 'bakkie', 'combi', 'combi', 'lorry'];
    const cols = [0xd8d8d8, 0x9e1b1b, 0x1c3f7a, 0x2b2b2b, 0xc9b78a, 0x3d6b3a, 0xf2f2f2, 0x6b6e73, 0xb55a1f];
    const place = (dir, n) => {
      for (let i = 0; i < n; i++) {
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        const m = buildCar(kind, cols[Math.floor(rnd() * cols.length)]);
        let s = 0, ok = false;
        for (let t = 0; t < 40 && !ok; t++) {
          s = rnd() * track.length; ok = Math.abs(track.ds(startS, s)) > 500;
          for (const o of this.cars) if (o.dir === dir && Math.abs(track.ds(o.s, s)) < 160) ok = false;
        }
        const vmax = kind === 'lorry' ? 19 + rnd() * 3 : kind === 'combi' ? 22 + rnd() * 5 : 22 + rnd() * 8;
        const c = { m, g: m.g, kind, dir, s, lat: dir > 0 ? LANE : -LANE, v: vmax * 0.8, vmax, len: m.len, wid: m.wid, x: 0, z: 0, psi: 0, stun: 0, cool: 0 };
        this.group.add(m.g); this.cars.push(c);
      }
    };
    place(1, 19); place(-1, 18);
    for (const c of this.cars) c.on = true;
    this.update(0.001, { s: startS, lat: LANE, v: 0 }, 0);
  }

  // f = 0..1 share of the maximum traffic; cars are switched on alternately so both directions thin out evenly
  setDensity(f) {
    const a = this.cars.filter(c => c.dir > 0), b = this.cars.filter(c => c.dir < 0), order = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) order.push(a[i]); if (b[i]) order.push(b[i]); }
    const n = Math.round(order.length * Math.max(0, Math.min(1, f)));
    order.forEach((c, i) => { c.on = i < n; if (!c.on) c.g.visible = false; });
  }
  setNight(n) { for (const c of this.cars) { c.m.head.emissiveIntensity = 0.2 + n * 2.6; c.m.tail.emissiveIntensity = 0.3 + n * 0.8; } }

  update(dt, player, hour) {
    const tr = this.track;
    for (const c of this.cars) {
      if (!c.on) continue;
      c.stun = Math.max(0, c.stun - dt); c.cool = Math.max(0, c.cool - dt);
      let vt = Math.min(c.vmax, tr.limitAt(c.s) / 3.6 * 1.08), gap = 1e9, ov = 0;
      for (const o of this.cars) {
        if (o === c || o.dir !== c.dir || !o.on) continue;
        const d = c.dir * tr.ds(c.s, o.s);
        if (d > 0 && d < 70) { const gg = d - (c.len + o.len) / 2; if (gg < gap) { gap = gg; ov = o.v; } }
      }
      const pd = c.dir * tr.ds(c.s, player.s);
      if (c.dir > 0 && pd > 0 && pd < 70 && Math.abs(player.lat - c.lat) < 2.8) { const gg = pd - (c.len / 2 + 9); if (gg < gap) { gap = gg; ov = Math.max(0, player.v); } }
      if (gap < 40) vt = Math.min(vt, Math.max(0, ov + (gap - 9) * 0.35));
      if (gap < 4) vt = 0;
      if (c.stun > 0) vt = 0;
      const a = Math.max(-8, Math.min(2.0, (vt - c.v) * 1.1));
      c.v = Math.max(0, c.v + a * dt);
      c.s = tr.wrap(c.s + c.dir * c.v * dt);
      const p = tr.pointAt(c.s, c.lat);
      c.x = p.x; c.z = p.z; c.psi = p.psi + (c.dir < 0 ? Math.PI : 0);
      c.g.position.set(p.x, 0, p.z); c.g.rotation.y = c.psi;
      c.m.tail.emissiveIntensity = (a < -2 ? 2.4 : 0.3) + (hour || 0) * 0;
      const dd = Math.abs(tr.ds(player.s, c.s)); c.g.visible = dd < 900;
    }
  }

  // two circles per car
  circles(c) { const fx = -Math.sin(c.psi), fz = -Math.cos(c.psi), o = c.len * 0.27, r = c.wid * 0.58; return [{ x: c.x + fx * o, z: c.z + fz * o, r }, { x: c.x - fx * o, z: c.z - fz * o, r }]; }

  // returns list of hits { car, speed } for player circles
  collide(pc, pv, px, pz) {
    const hits = [];
    for (const c of this.cars) {
      if (!c.on || c.cool > 0 || (c.x - px) ** 2 + (c.z - pz) ** 2 > 400) continue;
      const cc = this.circles(c); let hit = false;
      for (const a of pc) { for (const b of cc) { if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < (a.r + b.r) ** 2) { hit = true; break; } } if (hit) break; }
      if (hit) { c.cool = 1.2; c.stun = 3; hits.push({ car: c, speed: Math.abs(pv - c.dir * c.v * 0) + c.v * 0.3 }); }
    }
    return hits;
  }
}

// ---------------------------------------------------------------- livestock
export class Animals {
  constructor(scene, track, rnd) {
    this.track = track; this.list = []; this.group = new THREE.Group(); scene.add(this.group);
    const coat = [0x7a4a2a, 0xf0e8dc, 0x3a2a22, 0xa07850, 0x8d8d8d];
    track.cattleSpots.forEach((s0, idx) => {
      const n = 2 + (idx % 2);
      for (let i = 0; i < n; i++) {
        const kind = idx % 5 === 3 ? 'donkey' : idx % 5 === 1 ? 'goat' : 'cow';
        const g = new THREE.Group(), col = kind === 'donkey' ? 0x8a8a88 : coat[Math.floor(rnd() * coat.length)], m = mat(col, 0.95, 0), k = kind === 'goat' ? 0.55 : kind === 'donkey' ? 0.8 : 1;
        bx(0.7 * k, 0.8 * k, 1.8 * k, m, 0, 1.1 * k, 0, g); bx(0.35 * k, 0.4 * k, 0.6 * k, m, 0, 1.45 * k, -1.05 * k, g);
        for (const x of [-0.25, 0.25]) for (const z of [-0.65, 0.65]) bx(0.14 * k, 0.8 * k, 0.14 * k, m, x * k, 0.4 * k, z * k, g);
        if (kind === 'cow') for (const x of [-0.14, 0.14]) bx(0.05, 0.05, 0.3, mat(0xeeeeee), x, 1.75, -1.05, g);
        const side = rnd() < 0.5 ? 1 : -1;
        const a = { g, kind, s: s0 + (i - 1) * 7 + rnd() * 5, lat: side * (6.2 + rnd() * 3), side, state: 'idle', crosser: rnd() < 0.55, radius: 0.9 * Math.max(0.7, k), dir: rnd() < 0.5 ? 1 : -1, face: 0 };
        this.group.add(g); this.list.push(a);
      }
    });
    this.list.forEach(a => { a.on = true; });
    this.update(0.001, { s: 0, v: 0 });
  }
  setLevel(f) { const n = Math.round(this.list.length * Math.max(0, Math.min(1, f))); this.list.forEach((a, i) => { a.on = (i * 7919) % this.list.length < n; if (!a.on) a.g.visible = false; }); }
  update(dt, player) {
    const tr = this.track;
    for (const a of this.list) {
      if (!a.on) continue;
      const d = tr.ds(player.s, a.s);
      a.g.visible = Math.abs(d) < 500;
      if (a.state === 'idle' && a.crosser && d > 30 && d < 130 && player.v > 4) { a.state = 'cross'; }
      if (a.state === 'cross') {
        const target = -a.side * 7.5;
        a.lat += Math.sign(target - a.lat) * 1.5 * dt;
        if (Math.abs(a.lat - target) < 0.3) { a.state = 'idle'; a.side = -a.side; a.crosser = false; }
      }
      const p = tr.pointAt(a.s, a.lat);
      a.x = p.x; a.z = p.z;
      let yaw = p.psi + (a.dir < 0 ? Math.PI : 0);
      if (a.state === 'cross') { const sx = -Math.sign(a.lat - -a.side * 7.5); yaw = Math.atan2(-(p.lx * -a.side * 1), -(p.lz * -a.side * 1)); }
      if (a.state !== 'dead') { a.g.position.set(p.x, 0, p.z); a.g.rotation.set(0, yaw, 0); }
    }
  }
  collide(pc, px, pz) {
    const hits = [];
    for (const a of this.list) {
      if (!a.on || a.state === 'dead' || (a.x - px) ** 2 + (a.z - pz) ** 2 > 400) continue;
      for (const c of pc) if ((a.x - c.x) ** 2 + (a.z - c.z) ** 2 < (a.radius + c.r) ** 2) { a.state = 'dead'; a.g.rotation.z = Math.PI / 2; a.g.position.y = 0.45; hits.push(a); break; }
    }
    return hits;
  }
}

// ---------------------------------------------------------------- police
export class Police {
  constructor(scene, track) {
    this.track = track; this.group = new THREE.Group(); scene.add(this.group);
    this.parked = [];
    track.posts.forEach((post, i) => {
      const m = buildCar('police', 0xffffff), p = track.pointAt(post.s, ROAD_HALF + 1.7);
      m.g.position.set(p.x, 0, p.z); m.g.rotation.y = p.psi; this.group.add(m.g); post.car = m; this.parked.push(m);
    });
    this.chaser = buildCar('police', 0xffffff); this.chaser.g.visible = false; this.group.add(this.chaser.g);
    this.c = { active: false, s: 0, lat: 0, v: 0, gap: 0, mode: 'idle', flash: 0, stopT: 0, timer: 0, x: 0, z: 0, onTail: false };
  }
  get active() { return this.c.active; }
  start(player, post) {
    const c = this.c, tr = this.track; if (c.active) return;
    c.active = true; c.mode = 'chase'; c.timer = 0; c.stopT = 0; c.onTail = false;
    if (post) { c.s = post.s; c.lat = ROAD_HALF + 1.7; c.v = 0; post.car.g.visible = false; c.post = post; }
    else { c.s = tr.wrap(player.s - 280); c.lat = LANE; c.v = Math.max(18, player.v + 8); c.post = null; }
    this.chaser.g.visible = true;
  }
  stop() { const c = this.c; c.active = false; c.mode = 'idle'; this.chaser.g.visible = false; if (c.post) { c.post.car.g.visible = true; c.post = null; } }
  // returns { ticket: bool, gap, onTail, timedOut }
  update(dt, player) {
    const c = this.c, tr = this.track, res = { ticket: false, gap: 999, onTail: false, timedOut: false, near: false };
    if (!c.active) return res;
    c.timer += dt; c.flash += dt;
    const gap = tr.ds(c.s, player.s); c.gap = gap; res.gap = gap;
    let vt;
    if (c.mode === 'chase') {
      if (player.v < 0.8 && gap > 0 && gap < 60) vt = Math.max(0, Math.min(12, (gap - 12) * 0.5));
      else vt = Math.max(0, Math.min(44, player.v + Math.max(-10, Math.min(18, (gap - 14) * 0.45))));
      if (c.timer > 40 && !c.stopped) { res.timedOut = true; }
      c.onTail = gap > 0 && gap < 35; res.onTail = c.onTail;
      if (player.v < 0.8 && gap > 0 && gap < 28) { c.stopT += dt; if (c.stopT > 1.6) res.ticket = true; } else c.stopT = 0;
    } else { vt = 30; if (c.timer > 14) this.stop(); }
    const a = Math.max(-9, Math.min(6.5, (vt - c.v) * 1.3)); c.v = Math.max(0, c.v + a * dt);
    c.s = tr.wrap(c.s + c.v * dt);
    const tl = Math.max(-3.2, Math.min(5.6, player.lat)); c.lat += (tl - c.lat) * Math.min(1, dt * 1.2);
    const p = tr.pointAt(c.s, c.lat);
    this.chaser.g.position.set(p.x, 0, p.z); this.chaser.g.rotation.y = p.psi; c.x = p.x; c.z = p.z;
    const on = Math.floor(c.flash * 4) % 2 === 0, B = this.chaser.bar;
    B.red.emissiveIntensity = on ? 3 : 0.1; B.blue.emissiveIntensity = on ? 0.1 : 3;
    res.near = Math.abs(gap) < 350;
    return res;
  }
  release() { this.c.mode = 'leave'; this.c.timer = 0; }
}
