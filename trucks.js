import * as THREE from 'three';
import { WHEEL_R } from './truckdata.js';

// ---------- helpers ----------
export function rbox(w, h, d, r, mat) {
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const b = Math.max(0.005, r * 0.6), ww = w - 2 * b, hh = h - 2 * b, dd = Math.max(0.001, d - 2 * b), rr = Math.max(0.001, r - b);
  const x = -ww / 2, y = -hh / 2, s = new THREE.Shape();
  s.moveTo(x + rr, y); s.lineTo(x + ww - rr, y); s.quadraticCurveTo(x + ww, y, x + ww, y + rr);
  s.lineTo(x + ww, y + hh - rr); s.quadraticCurveTo(x + ww, y + hh, x + ww - rr, y + hh);
  s.lineTo(x + rr, y + hh); s.quadraticCurveTo(x, y + hh, x, y + hh - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: dd, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 5 });
  g.translate(0, 0, -dd / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
function cyl(rt, rb, h, mat, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; return m; }
export function textPlane(text, w, h, opts = {}) {
  const c = document.createElement('canvas'); c.width = opts.cw || 512; c.height = Math.round((opts.cw || 512) * h / w);
  const g = c.getContext('2d');
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = opts.fg || '#fff'; g.font = `${opts.weight || 'bold'} ${Math.floor(c.height * (opts.size || 0.7))}px ${opts.font || 'Arial'}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !opts.bg, toneMapped: false }));
  return m;
}

const MAT = {
  chrome: new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: 1, roughness: 0.14 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.65, metalness: 0.25 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.9, metalness: 0.0 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.95 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1c26, metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.5, envMapIntensity: 1.4 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.85 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.75 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.5 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x8d8f93, roughness: 0.95 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
};

let _tyreGeo = null, _rimGeo = null, _nutGeo = null;
function tyreGeo() {
  if (_tyreGeo) return _tyreGeo;
  const p = [[0.31, -0.15], [0.44, -0.155], [0.505, -0.13], [0.535, -0.09], [0.54, -0.04], [0.54, 0.04], [0.535, 0.09], [0.505, 0.13], [0.44, 0.155], [0.31, 0.15]].map(a => new THREE.Vector2(a[0], a[1]));
  _tyreGeo = new THREE.LatheGeometry(p, 28); _tyreGeo.rotateZ(Math.PI / 2); // axle along X
  return _tyreGeo;
}
function wheelMesh(dual, side) {
  // returns Group that spins about X
  const g = new THREE.Group();
  const mk = (xo) => {
    const t = new THREE.Mesh(tyreGeo(), MAT.rubber); t.position.x = xo; t.castShadow = true; g.add(t);
    const rim = cyl(0.33, 0.33, 0.29, MAT.alu, 20); rim.rotation.z = Math.PI / 2; rim.position.x = xo + side * 0.012; g.add(rim);
    const hub = cyl(0.12, 0.12, 0.32, MAT.chrome, 12); hub.rotation.z = Math.PI / 2; hub.position.x = xo + side * 0.02; g.add(hub);
    for (let i = 0; i < 8; i++) { // lug nuts + visible spokes so rotation reads
      const a = (i / 8) * Math.PI * 2, n = box(0.04, 0.05, 0.05, MAT.chrome, xo + side * 0.16, Math.sin(a) * 0.22, Math.cos(a) * 0.22); g.add(n);
    }
    const mark = box(0.03, 0.2, 0.05, MAT.red, xo + side * 0.158, 0.33, 0); g.add(mark);
  };
  if (dual) { mk(-0.2); mk(0.2); } else mk(0);
  return g;
}

// ---------- the truck ----------
export function buildTruck(truckId, cfg, truckDef) {
  const T = {};
  const root = new THREE.Group(); T.root = root;                 // tractor (origin between axles; forward = -Z)
  const ext = new THREE.Group(), int = new THREE.Group(), always = new THREE.Group();
  root.add(ext, int, always); T.ext = ext; T.int = int;
  const paintMat = new THREE.MeshPhysicalMaterial({ color: cfg.paint, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  const dmg = Math.min(1, (cfg.dmg.body || 0) / 100);
  if (dmg > 0) paintMat.color.lerp(new THREE.Color(0x2a2118), dmg * 0.55), paintMat.roughness = 0.3 + dmg * 0.5, paintMat.clearcoat = 1 - dmg;
  T.paintMat = paintMat;
  const style = truckDef.cab;

  // chassis
  box(0.16, 0.26, 6.4, MAT.dark, 0.5, 0.95, 0.0, always); box(0.16, 0.26, 6.4, MAT.dark, -0.5, 0.95, 0.0, always);
  for (let i = -2; i <= 2; i++) box(1.2, 0.1, 0.12, MAT.dark, 0, 0.95, i * 1.2, always);
  for (const s of [-1, 1]) {
    const tank = cyl(0.36, 0.36, 1.7, MAT.alu, 18); tank.rotation.x = Math.PI / 2; tank.position.set(s * 1.12, 0.78, -0.2); always.add(tank);
    const strap = box(0.8, 0.04, 0.05, MAT.dark, s * 1.12, 0.78, 0.5, always);
    box(0.5, 0.3, 0.5, MAT.dark, s * 1.0, 0.62, 1.2 - 3.2, always); // battery/air boxes
  }
  box(1.6, 0.3, 0.4, MAT.dark, 0, 0.7, -2.9, always);   // front crossmember
  // fifth wheel
  const fifth = cyl(0.55, 0.6, 0.12, MAT.dark, 20); fifth.position.set(0, 1.15, 1.3); always.add(fifth);
  // rear mudguards + flaps
  for (const s of [-1, 1]) {
    const mg = rbox(0.62, 0.1, 1.7, 0.04, paintMat); mg.position.set(s * 1.1, 1.25, 1.5); always.add(mg);
    box(0.5, 0.45, 0.04, MAT.rubber, s * 1.1, 0.6, 2.42, always);
    const fg = rbox(0.6, 0.08, 1.1, 0.03, paintMat); fg.position.set(s * 1.1, 1.18, -2.3); always.add(fg);
  }
  // exhaust / stacks
  if (cfg.acc.stacks) for (const s of [-1, 1]) {
    const st = cyl(0.07, 0.07, 3.2, MAT.chrome, 12); st.position.set(s * 1.28, 2.6, -1.0); always.add(st);
    const cap = cyl(0.09, 0.07, 0.12, MAT.chrome, 12); cap.position.set(s * 1.28, 4.2, -1.0); always.add(cap);
  } else { const ex = cyl(0.06, 0.06, 1.2, MAT.alu, 10); ex.position.set(-1.28, 1.2, -1.2); always.add(ex); }

  // wheels
  T.wheels = []; T.steerPivots = []; T.spinGroups = [];
  const addWheel = (x, z, dual, steer) => {
    const piv = new THREE.Group(); piv.position.set(x, WHEEL_R, z); always.add(piv);
    const spin = wheelMesh(dual, Math.sign(x) || 1); piv.add(spin);
    T.spinGroups.push(spin); if (steer) T.steerPivots.push(piv);
  };
  addWheel(-1.0, -2.3, false, true); addWheel(1.0, -2.3, false, true);
  addWheel(-1.0, 1.5, true, false); addWheel(1.0, 1.5, true, false);
  box(2.0, 0.12, 0.14, MAT.dark, 0, WHEEL_R, -2.3, always); box(2.0, 0.14, 0.16, MAT.dark, 0, WHEEL_R, 1.5, always);

  // ----- cab exterior -----
  const cabZ = -2.25, W = 2.5;
  const lower = rbox(W, 2.05, 2.4, 0.28, paintMat); lower.position.set(0, 2.05, cabZ); ext.add(lower);
  const upperD = style === 'man' ? 2.05 : 1.95, upperH = style === 'volvo' ? 0.9 : style === 'scania' ? 0.8 : 0.85;
  const upper = rbox(W - 0.06, upperH, upperD, 0.3, paintMat); upper.position.set(0, 3.05 + upperH / 2 - 0.05, cabZ + (2.4 - upperD) / 2 - 0.02); ext.add(upper);
  // roof deflector
  const defl = rbox(2.3, 0.5, 1.2, 0.12, paintMat); defl.position.set(0, 3.05 + upperH + 0.12, cabZ + 0.55); defl.rotation.x = 0.28; ext.add(defl);
  // windscreen & side glass
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.28, 1.35), MAT.glass); ws.position.set(0, 2.85, cabZ - 1.205); ws.rotation.x = -0.06; ext.add(ws);
  const wsFrame = box(2.34, 0.06, 0.04, MAT.black, 0, 3.52, cabZ - 1.2, ext); const wsFrame2 = box(2.34, 0.06, 0.04, MAT.black, 0, 2.17, cabZ - 1.2, ext);
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.92), MAT.glass); sw.position.set(s * 1.256, 2.78, cabZ - 0.35); sw.rotation.y = s * Math.PI / 2; ext.add(sw);
    const swUp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), MAT.glass); swUp.position.set(s * 1.226, 3.55, cabZ - 0.3); swUp.rotation.y = s * Math.PI / 2; if (style === 'scania') ext.add(swUp);
    box(0.06, 0.05, 0.28, MAT.chrome, s * 1.27, 2.35, cabZ - 0.95, ext);        // door handle
    box(0.04, 1.9, 0.03, MAT.black, s * 1.255, 2.05, cabZ - 1.0, ext);          // door seam
    const stepBox = box(0.4, 0.07, 0.9, MAT.alu, s * 1.36, 0.95, cabZ - 0.6, ext);
    const stepBox2 = box(0.4, 0.07, 0.9, MAT.alu, s * 1.36, 1.35, cabZ - 0.6, ext);
  }
  // front face
  const fz = cabZ - 1.215;
  const grilleW = style === 'man' ? 1.75 : 1.55, grilleH = style === 'scania' ? 0.95 : 0.85;
  const grille = rbox(grilleW, grilleH, 0.08, 0.06, MAT.dark); grille.position.set(0, 1.78, fz - 0.03); ext.add(grille);
  const nBars = style === 'scania' ? 9 : 6;
  for (let i = 0; i < nBars; i++) {
    const y = 1.78 - grilleH / 2 + 0.1 + i * ((grilleH - 0.2) / (nBars - 1));
    box(grilleW - 0.18, style === 'scania' ? 0.03 : 0.035, 0.03, MAT.chrome, 0, y, fz - 0.09, ext);
  }
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 24), MAT.chrome); badge.rotation.x = Math.PI / 2; badge.position.set(0, 1.78, fz - 0.12); ext.add(badge);
  const nameTag = textPlane(truckDef.brand.toUpperCase(), 0.9, 0.18, { fg: '#e8e8e8', bg: '#1a1d21', cw: 512, size: 0.62 });
  nameTag.position.set(0, 2.3, fz - 0.07); nameTag.rotation.y = Math.PI; ext.add(nameTag); nameTag.rotation.y = Math.PI; nameTag.rotation.set(0, Math.PI, 0);
  nameTag.position.z = fz - 0.075; nameTag.scale.x = -1;
  // lower bumper + plate
  const bumper = rbox(W + 0.02, 0.5, 0.35, 0.1, paintMat); bumper.position.set(0, 1.05, fz - 0.05); ext.add(bumper);
  const plate = textPlane('B 482 BWT', 0.52, 0.12, { fg: '#111', bg: '#f4f4f4', cw: 256, size: 0.7 }); plate.position.set(0, 1.05, fz - 0.235); plate.rotation.y = Math.PI; plate.scale.x = -1; ext.add(plate);
  // headlights
  T.hlMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xbfe3ff, emissiveIntensity: 0.15, roughness: 0.1 });
  T.drlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });
  for (const s of [-1, 1]) {
    if (style === 'volvo') {
      const a = box(0.55, 0.14, 0.05, T.hlMat, s * 0.95, 2.28, fz - 0.03, ext); const b = box(0.07, 0.55, 0.05, T.drlMat, s * 1.17, 2.0, fz - 0.03, ext);
    } else if (style === 'scania') {
      const a = rbox(0.5, 0.28, 0.06, 0.05, T.hlMat); a.position.set(s * 0.98, 2.05, fz - 0.03); ext.add(a);
      box(0.42, 0.04, 0.05, T.drlMat, s * 0.98, 2.24, fz - 0.05, ext);
    } else {
      const a = rbox(0.62, 0.22, 0.06, 0.04, T.hlMat); a.position.set(s * 0.98, 2.2, fz - 0.03); ext.add(a);
      for (let k = 0; k < 3; k++) box(0.5, 0.025, 0.05, T.drlMat, s * 0.98, 2.1 - k * 0.06, fz - 0.05, ext);
    }
    const fog = cyl(0.07, 0.07, 0.05, T.hlMat, 12); fog.rotation.x = Math.PI / 2; fog.position.set(s * 0.9, 1.1, fz - 0.28); ext.add(fog);
    // wipers
    box(0.7, 0.025, 0.03, MAT.black, s * 0.45, 2.3, fz + 0.01, ext).rotation.z = s * 0.1;
  }
  // visor
  if (cfg.acc.visor) { const v = rbox(2.4, 0.08, 0.6, 0.03, paintMat); v.position.set(0, 3.58, fz - 0.28); v.rotation.x = 0.15; ext.add(v); }
  // roof lights
  if (cfg.acc.roof) for (let i = -2; i <= 2; i++) { const l = cyl(0.09, 0.09, 0.06, T.drlMat, 12); l.rotation.x = Math.PI / 2; l.position.set(i * 0.4, 3.78 + upperH - 0.9 + 0.1, fz + 0.16); ext.add(l); box(2.1, 0.06, 0.06, MAT.black, 0, 3.7 + upperH - 0.9 + 0.1, fz + 0.2, ext); }
  if (cfg.acc.horns) for (let i = -1; i <= 1; i += 2) { const h = cyl(0.05, 0.12, 0.45, MAT.chrome, 12); h.rotation.x = Math.PI / 2; h.position.set(i * 0.25, 3.55 + upperH - 0.2, cabZ - 0.2); ext.add(h); }
  if (cfg.acc.bull) {
    for (const x of [-0.8, 0.8]) { const t = cyl(0.045, 0.045, 1.2, MAT.chrome, 10); t.position.set(x, 1.55, fz - 0.4); ext.add(t); }
    const t2 = cyl(0.05, 0.05, 1.8, MAT.chrome, 10); t2.rotation.z = Math.PI / 2; t2.position.set(0, 2.0, fz - 0.4); ext.add(t2);
    const t3 = cyl(0.05, 0.05, 1.8, MAT.chrome, 10); t3.rotation.z = Math.PI / 2; t3.position.set(0, 1.2, fz - 0.4); ext.add(t3);
  }
  // red tail/amber markers on cab
  T.brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a0505, emissive: 0xff1010, emissiveIntensity: 0.15 });

  // ----- always visible: side mirrors (adjustable, show live rear view) -----
  T.mirrors = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const arm = box(0.5, 0.04, 0.04, MAT.dark, s * 1.45, 2.95, cabZ - 1.05, always);
    const pivot = new THREE.Group(); pivot.position.set(s * 1.72, 2.95, cabZ - 1.0); always.add(pivot);
    const hous = rbox(0.12, 0.62, 0.34, 0.04, MAT.dark); hous.position.set(0, -0.0, 0.0); pivot.add(hous);
    const arm2 = box(0.03, 1.0, 0.03, MAT.dark, s * -0.18, -0.0, 0.0, pivot);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.56), new THREE.MeshBasicMaterial({ color: 0x8fa0a8, toneMapped: false }));
    glass.position.set(0, 0, 0.176); glass.scale.x = -1; pivot.add(glass);
    T.mirrors[side] = { pivot, glass, yaw: 0, pitch: 0, anchor: new THREE.Object3D() };
    const anchor = T.mirrors[side].anchor; anchor.position.set(s * 1.72, 2.95, cabZ - 0.78); always.add(anchor);
  }

  // ----- interior (cockpit view) -----
  const eye = new THREE.Vector3(0.62, 2.98, cabZ - 0.1); T.eye = eye;
  T.eyeLook = new THREE.Vector3(0.62, 2.98, -10);
  box(2.3, 0.04, 2.3, MAT.trim, 0, 1.18, cabZ, int);                          // floor
  box(2.3, 0.04, 2.3, MAT.ceiling, 0, 3.58 + upperH - 0.82, cabZ + 0.1, int); // roof lining
  for (const s of [-1, 1]) {
    box(0.08, 1.15, 2.3, MAT.trim, s * 1.21, 1.78, cabZ, int);                 // door panels (lower)
    box(0.07, 0.07, 2.3, MAT.dark, s * 1.21, 2.4, cabZ, int);                  // beltline
    box(0.09, 1.3, 0.12, MAT.black, s * 1.2, 3.05, cabZ - 1.12, int).rotation.x = -0.08;  // A pillar
    box(0.09, 1.7, 0.16, MAT.black, s * 1.2, 3.1, cabZ + 0.62, int);                         // B pillar
    box(0.06, 0.25, 0.5, MAT.dark, s * 1.17, 2.27, cabZ - 0.55, int);                       // door pull/pocket
  }
  box(2.4, 0.1, 0.1, MAT.black, 0, 3.62, cabZ - 1.15, int);                    // windscreen header
  box(2.3, 1.4, 0.15, MAT.seat, 0, 2.0, cabZ + 1.15, int);                      // rear bulkhead / bunk
  const dash = rbox(2.34, 0.55, 0.75, 0.12, MAT.trim); dash.position.set(0, 2.4, cabZ - 0.88); int.add(dash);
  const dashTop = rbox(2.34, 0.08, 0.8, 0.04, MAT.black); dashTop.position.set(0, 2.7, cabZ - 0.85); int.add(dashTop);
  const woodLine = box(1.1, 0.04, 0.03, MAT.wood, -0.5, 2.5, cabZ - 0.495, int);
  // centre console + radio
  box(0.5, 0.35, 0.5, MAT.dark, -0.18, 2.35, cabZ - 0.7, int);
  const radio = box(0.28, 0.12, 0.02, new THREE.MeshBasicMaterial({ color: 0x1b6ca8 }), -0.18, 2.55, cabZ - 0.445, int);
  // seats
  const mkSeat = (x) => { const sb = rbox(0.62, 0.2, 0.62, 0.07, MAT.seat); sb.position.set(x, 1.95, cabZ + 0.2); int.add(sb); const bk = rbox(0.6, 0.85, 0.16, 0.07, MAT.seat); bk.position.set(x, 2.4, cabZ + 0.55); int.add(bk); const hd = rbox(0.34, 0.22, 0.12, 0.05, MAT.seat); hd.position.set(x, 2.98, cabZ + 0.58); int.add(hd); const base = cyl(0.1, 0.12, 0.7, MAT.dark, 10); base.position.set(x, 1.55, cabZ + 0.2); int.add(base); };
  mkSeat(0.62); mkSeat(-0.55);
  // steering wheel (right-hand drive)
  const sw = new THREE.Group(); sw.position.set(0.62, 2.62, cabZ - 0.62); sw.rotation.x = -0.42; int.add(sw); T.steeringWheel = sw;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 10, 28), MAT.black); sw.add(ring);
  for (let i = 0; i < 3; i++) { const sp = box(0.19, 0.025, 0.02, MAT.black, 0, 0, 0, sw); sp.rotation.z = (i / 3) * Math.PI * 2 + Math.PI / 2; sp.position.set(Math.cos((i / 3) * Math.PI * 2 + Math.PI / 2) * 0.1, Math.sin((i / 3) * Math.PI * 2 + Math.PI / 2) * 0.1, 0); }
  const hubW = cyl(0.055, 0.055, 0.05, MAT.dark, 14); hubW.rotation.x = Math.PI / 2; sw.add(hubW);
  const column = cyl(0.03, 0.03, 0.4, MAT.dark, 8); column.rotation.x = Math.PI / 2 - 0.42; column.position.set(0.62, 2.42, cabZ - 0.75); int.add(column);
  // instrument cluster (live canvas)
  const cc = document.createElement('canvas'); cc.width = 512; cc.height = 256; T.clusterCtx = cc.getContext('2d');
  T.clusterTex = new THREE.CanvasTexture(cc); T.clusterTex.colorSpace = THREE.SRGBColorSpace;
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: T.clusterTex, toneMapped: false }));
  cluster.position.set(0.62, 2.8, cabZ - 0.495); cluster.rotation.x = -0.25; cluster.rotation.y = Math.PI; cluster.scale.x = -1; int.add(cluster);
  cluster.rotation.y = 0; cluster.scale.x = 1; cluster.position.z = cabZ - 0.5; cluster.position.z = cabZ - 0.46; cluster.rotation.set(-0.3, 0, 0);
  // hanging items
  const air = cyl(0.03, 0.05, 0.14, new THREE.MeshStandardMaterial({ color: 0x2e7d32 }), 8); air.position.set(-0.1, 3.4, cabZ - 1.0); int.add(air);
  const flag = textPlane('BW', 0.18, 0.12, { fg: '#fff', bg: '#6ec6f0', cw: 128, size: 0.6 }); flag.position.set(-0.1, 3.28, cabZ - 1.0); int.add(flag);
  // night dash glow
  T.dashLight = new THREE.PointLight(0x88aaff, 0, 2.2); T.dashLight.position.set(0.62, 2.9, cabZ - 0.4); int.add(T.dashLight);
  int.visible = false;

  // ----- headlight beams -----
  T.beams = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.SpotLight(0xfff2dd, 0, 85, 0.5, 0.55, 1.4); sp.position.set(s * 0.95, 2.1, fz - 0.15);
    const tg = new THREE.Object3D(); tg.position.set(s * 0.95, 1.0, fz - 30); always.add(sp, tg); sp.target = tg; T.beams.push(sp);
  }
  // tail lights on the trailer handled below

  // ===== trailer =====
  const tr = new THREE.Group(); T.trailer = tr;          // origin at kingpin, extends +Z (backwards)
  const tpaint = new THREE.MeshPhysicalMaterial({ color: cfg.trailerPaint, metalness: 0.25, roughness: 0.5, clearcoat: 0.4 });
  T.trailerPaint = tpaint;
  const bodyL = 13.4, bodyH = 2.9, bodyW = 2.55, floorY = 1.25;
  const frame = box(0.9, 0.22, bodyL, MAT.dark, 0, floorY - 0.2, bodyL / 2 - 0.2, tr);
  const floor = box(bodyW, 0.12, bodyL, MAT.dark, 0, floorY, bodyL / 2 - 0.2, tr);
  const liv = livery(bodyL, bodyH);
  const sideMat = (flip) => { const t = liv.clone(); t.needsUpdate = true; if (flip) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; } return new THREE.MeshStandardMaterial({ map: t, color: cfg.trailerPaint, roughness: 0.6, metalness: 0.1 }); };
  const nBody0 = tr.children.length;
  const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), [sideMat(false), sideMat(true), tpaint, tpaint, tpaint, tpaint]);
  // BoxGeometry order: +x, -x, +y, -y, +z, -z ; side textures run along z so rotate their UV via custom: use plain map on x faces (u across z)
  bodyBox.position.set(0, floorY + bodyH / 2 + 0.06, bodyL / 2 - 0.2); bodyBox.castShadow = true; bodyBox.receiveShadow = true; tr.add(bodyBox);
  box(bodyW + 0.04, 0.06, bodyL + 0.04, MAT.alu, 0, floorY + bodyH + 0.09, bodyL / 2 - 0.2, tr); // roof rail
  for (let i = 0; i < 9; i++) box(bodyW + 0.05, bodyH, 0.05, MAT.alu, 0, floorY + bodyH / 2 + 0.06, i * 1.6 - 0.1, tr); // curtain posts
  const ttype = cfg.trailer || 'box';
  if (ttype !== 'box') {
    for (let i = nBody0; i < tr.children.length; i++) tr.children[i].visible = false;
    const zc = bodyL / 2 - 0.2;
    if (ttype === 'tanker') {
      const sil = new THREE.MeshPhysicalMaterial({ color: cfg.trailerPaint, metalness: 0.9, roughness: 0.22, clearcoat: 0.3 });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, bodyL - 0.4, 28), sil); tank.rotation.x = Math.PI / 2; tank.position.set(0, floorY + 1.45, zc); tank.castShadow = true; tr.add(tank);
      for (const e of [-1, 1]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 10), sil); cap.scale.set(1, 1, 0.22); cap.position.set(0, floorY + 1.45, zc + e * (bodyL / 2 - 0.2)); tr.add(cap); }
      for (let i = 0; i < 6; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.21, 0.035, 6, 28), MAT.alu); band.position.set(0, floorY + 1.45, 0.6 + i * 2.4); tr.add(band); }
      box(0.7, 0.06, bodyL - 1, MAT.alu, 0, floorY + 2.68, zc, tr);
      for (let i = 0; i < 4; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 12), MAT.alu); h.position.set(0, floorY + 2.78, 1.6 + i * 3.1); tr.add(h); }
      box(0.5, 0.7, 0.4, MAT.dark, 1.15, floorY - 0.45, 6, tr);
    } else {
      box(bodyW, 0.1, bodyL, MAT.dark, 0, floorY + 0.08, zc, tr);
      const cm = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.3 });
      for (const [z, c] of [[3.4, 0x1f4e8c], [9.8, 0xb03a2e]]) {
        const cb = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.6, 6.0), cm(c)); cb.position.set(0, floorY + 1.43, z); cb.castShadow = true; tr.add(cb);
        for (let i = -4; i <= 4; i++) box(0.04, 2.5, 0.06, MAT.alu, 1.23, floorY + 1.43, z + i * 0.6, tr), box(0.04, 2.5, 0.06, MAT.alu, -1.23, floorY + 1.43, z + i * 0.6, tr);
      }
      for (const z of [0.2, 6.6, 12.9]) box(bodyW + 0.1, 0.05, 0.08, MAT.alu, 0, floorY + 0.15, z, tr);
    }
  }
  // rear: doors, bumper, lights
  T.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0505, emissive: 0xff1010, emissiveIntensity: 0.25 });
  const rz = bodyL - 0.2 + 0.03;
  box(bodyW, 0.2, 0.15, MAT.dark, 0, 0.62, rz + 0.1, tr);
  for (const s of [-1, 1]) { box(0.18, 0.3, 0.06, T.tailMat, s * 1.05, 1.0, rz + 0.12, tr); box(0.05, 2.6, 0.06, MAT.alu, s * 0.55, 2.7, rz + 0.04, tr); }
  const rp = textPlane('B 483 BWT', 0.52, 0.12, { fg: '#111', bg: '#f4f4f4', cw: 256, size: 0.7 }); rp.position.set(0, 0.95, rz + 0.17); tr.add(rp);
  // landing legs
  for (const s of [-1, 1]) box(0.12, 0.9, 0.12, MAT.dark, s * 1.0, 0.8, 2.8, tr);
  // trailer wheels: 3 axles
  T.trailerSpin = [];
  for (const z of [10.4, 11.7, 13.0]) {
    for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * 1.0, WHEEL_R, z); tr.add(piv); const sp = wheelMesh(true, s); piv.add(sp); T.trailerSpin.push(sp); }
    box(2.0, 0.12, 0.14, MAT.dark, 0, WHEEL_R, z, tr);
    for (const s of [-1, 1]) box(0.5, 0.45, 0.04, MAT.rubber, s * 1.0, 0.6, z + 0.5, tr);
  }
  box(0.04, 0.35, 8.0, MAT.alu, 1.3, 0.9, 7.0, tr); box(0.04, 0.35, 8.0, MAT.alu, -1.3, 0.9, 7.0, tr); // side skirts

  // ----- API -----
  T.setLights = (on) => {
    T.hlMat.emissiveIntensity = on ? 2.2 : 0.15; T.tailMat.emissiveIntensity = on ? 0.8 : 0.25;
    T.beams.forEach(b => b.intensity = on ? 90 : 0); T.dashLight.intensity = on ? 0.6 : 0;
  };
  T.setBraking = (b) => { T.brakeMat.emissiveIntensity = b ? 1.5 : 0.15; if (!T.lightsOn) T.tailMat.emissiveIntensity = b ? 2.5 : 0.25; else T.tailMat.emissiveIntensity = b ? 2.5 : 0.8; };
  T.setSteer = (a) => { T.steerPivots.forEach(p => p.rotation.y = -a * 1.0); T.steeringWheel.rotation.z = -a * 5.0; };
  T.spinWheels = (ang) => { T.spinGroups.forEach(g => g.rotation.x = ang); T.trailerSpin.forEach(g => g.rotation.x = ang); };
  T.setCockpit = (c) => { ext.visible = !c; int.visible = c; };
  T.dispose = () => { root.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); T.clusterTex.dispose(); };

  // dashboard cluster drawing
  T.drawCluster = (speedKmh, rpm, gear, limit, redline, lightsOn, dmgEngine) => {
    const g = T.clusterCtx; g.fillStyle = '#07090c'; g.fillRect(0, 0, 512, 256);
    const dial = (cx, cy, r, val, max, label, ticks, red) => {
      g.strokeStyle = '#2a3442'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0.75 * Math.PI, 2.25 * Math.PI); g.stroke();
      for (let i = 0; i <= ticks; i++) { const a = 0.75 * Math.PI + (i / ticks) * 1.5 * Math.PI; const big = i % 2 === 0; g.strokeStyle = (red && i / ticks > red) ? '#ff5252' : '#cfd8dc'; g.lineWidth = big ? 3 : 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - (big ? 16 : 9)), cy + Math.sin(a) * (r - (big ? 16 : 9))); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); if (big) { g.fillStyle = '#b0bec5'; g.font = '14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.round(i / ticks * max / (max > 500 ? 1000 : 1) * (max > 500 ? 10 : 1)) / (max > 500 ? 10 : 1)), cx + Math.cos(a) * (r - 32), cy + Math.sin(a) * (r - 32)); } }
      const a = 0.75 * Math.PI + Math.min(1, val / max) * 1.5 * Math.PI;
      g.strokeStyle = '#ffb300'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
      g.fillStyle = '#ffb300'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
      g.fillStyle = '#90a4ae'; g.font = '13px Arial'; g.fillText(label, cx, cy + r * 0.55);
    };
    dial(120, 128, 104, speedKmh, 120, 'km/h', 12, 0);
    dial(392, 128, 104, rpm, 2400, 'x100 rpm', 12, redline / 2400);
    g.fillStyle = '#ffb300'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(gear, 256, 100);
    g.fillStyle = '#cfd8dc'; g.font = 'bold 26px Arial'; g.fillText(Math.round(speedKmh) + ' km/h', 256, 160);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(256, 205, 20, 0, 7); g.fill(); g.strokeStyle = '#c62828'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 20px Arial'; g.fillText(String(limit), 256, 206);
    if (lightsOn) { g.fillStyle = '#4caf50'; g.font = '22px Arial'; g.fillText('☀', 205, 210); }
    if (dmgEngine > 40) { g.fillStyle = '#ff5252'; g.font = '22px Arial'; g.fillText('⚠ ENGINE', 310, 210); }
    T.clusterTex.needsUpdate = true;
  };
  T.setCockpit(false);
  return T;
}

function livery(len, h) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 1024, 256);
  // Botswana flag colours: light blue, white/black/white band
  g.fillStyle = '#75aadb'; g.fillRect(0, 0, 1024, 90); g.fillRect(0, 166, 1024, 90);
  g.fillStyle = '#fff'; g.fillRect(0, 90, 1024, 18); g.fillRect(0, 148, 1024, 18);
  g.fillStyle = '#111'; g.fillRect(0, 108, 1024, 40);
  g.fillStyle = '#fff'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BOTSWANA TRUCKERS • PULA FREIGHT', 512, 129);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
