import * as THREE from 'three';
import { ROAD_HALF, SHOULDER, STEP } from './track.js';
import { textPlane } from './trucks.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function noiseFill(g, w, h, base, amp, n, seed) {
  const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.floor(128 + (r() - 0.5) * amp); g.fillStyle = `rgba(${v},${v},${v},${0.06 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
}

export function buildWorld(scene, track, q) {
  const W = { track, q, group: new THREE.Group() }; scene.add(W.group);
  const R = rng(777), dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const n = track.n;

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3a7bd5) }, hor: { value: new THREE.Color(0xcfe4f5) }, sun: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 }, sunCol: { value: new THREE.Color(0xfff3cf) } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 p; uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform float night; uniform vec3 sunCol;
      float h21(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }
      void main(){ vec3 d = normalize(p); float h = max(d.y, 0.0);
        vec3 c = mix(hor, top, pow(h, 0.55));
        float sd = max(dot(d, normalize(sun)), 0.0);
        c += sunCol * (pow(sd, 900.0) * 3.0 + pow(sd, 18.0) * 0.28) * (1.0 - night);
        if (d.y < 0.0) c = mix(hor, hor*0.7, min(1.0, -d.y*4.0));
        vec2 sp = floor(d.xz / (d.y + 1.2) * 90.0); float st = step(0.9965, h21(sp)) * night * smoothstep(0.05, 0.3, d.y);
        c += vec3(st);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 12), skyMat); W.sky.frustumCulled = false; W.sky.renderOrder = -10; scene.add(W.sky);

  // ---------- lights ----------
  W.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a6a45, 0.9); scene.add(W.hemi);
  W.sun = new THREE.DirectionalLight(0xfff1d6, 2.6); W.sun.castShadow = q.shadows;
  if (q.shadows) { W.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap); const c = W.sun.shadow.camera; c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400; W.sun.shadow.bias = -0.0005; W.sun.shadow.normalBias = 0.05; }
  scene.add(W.sun, W.sun.target);
  scene.fog = new THREE.FogExp2(0xcfe4f5, 0.00042);

  // ---------- ground ----------
  const gt = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#b98f62', 90, 2600, 3);
    const r = rng(5); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${120 + r() * 50},${110 + r() * 40},${50 + r() * 20},0.35)`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 3 + r() * 7); }
  }, true); gt.repeat.set(200, 200);
  W.groundMat = new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0 });
  W.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), W.groundMat); W.ground.rotation.x = -Math.PI / 2; W.ground.receiveShadow = q.shadows; scene.add(W.ground);

  // ---------- road ----------
  const roadTex = canvasTex(256, 512, (g, w, h) => {
    noiseFill(g, w, h, '#34373b', 70, 5200, 11);
    g.fillStyle = '#e9e9e4';
    g.fillRect(w * 0.025, 0, w * 0.03, h); g.fillRect(w * 0.945, 0, w * 0.03, h);              // edge lines
    g.fillRect(w * 0.488, 0, w * 0.024, h * 0.34);                                              // broken centre line
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(w * 0.25, 0, w * 0.1, h); g.fillRect(w * 0.65, 0, w * 0.1, h);   // tyre wear tracks
  }, true);
  const shTex = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#a58a68', 110, 1800, 21), true);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const shMat = new THREE.MeshStandardMaterial({ map: shTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  roadTex.repeat.set(1, 1); shTex.repeat.set(1, 1);
  const CH = 40;
  const strip = (i0, i1, latA, latB, y, vScale, uvMode) => {
    const cnt = i1 - i0 + 1, pos = new Float32Array(cnt * 6), uv = new Float32Array(cnt * 4), idx = [];
    for (let k = 0; k < cnt; k++) {
      const i = (i0 + k) % n, tx = track.TX[i], tz = track.TZ[i], lx = tz, lz = -tx;
      pos.set([track.X[i] + lx * latA, y, track.Z[i] + lz * latA, track.X[i] + lx * latB, y, track.Z[i] + lz * latB], k * 6);
      const v = (i0 + k) * STEP / vScale; uv.set([uvMode ? 0 : latA * 0.2, v, uvMode ? 1 : latB * 0.2, v], k * 4);
      if (k < cnt - 1) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    // make sure normals point up
    const nr = geo.attributes.normal; for (let k = 0; k < nr.count; k++) if (nr.getY(k) < 0) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k));
    return geo;
  };
  for (let i0 = 0; i0 < n; i0 += CH) {
    const i1 = Math.min(n, i0 + CH); // overlap by one sample so chunks meet (wraps via modulo)
    const m = new THREE.Mesh(strip(i0, i1, ROAD_HALF, -ROAD_HALF, 0.06, 24, true), roadMat); m.receiveShadow = q.shadows; W.group.add(m);
    for (const [a, b] of [[ROAD_HALF, ROAD_HALF + SHOULDER], [-ROAD_HALF - SHOULDER, -ROAD_HALF]]) { const sm = new THREE.Mesh(strip(i0, i1, a, b, 0.045, 5, false), shMat); sm.receiveShadow = q.shadows; W.group.add(sm); }
  }

  // ---------- reflective roadside posts ----------
  const postGeo = new THREE.BoxGeometry(0.1, 0.9, 0.1);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x222222 }), Math.floor(n / 10) * 2);
  let pi = 0; for (let i = 0; i < n - 10; i += 10) for (const side of [1, -1]) {
    const lat = side * (ROAD_HALF + SHOULDER + 0.3), p = track.pointAt(i * STEP, lat); dummy.position.set(p.x, 0.45, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); posts.setMatrixAt(pi++, dummy.matrix);
  }
  posts.count = pi; W.group.add(posts);

  // ---------- vegetation ----------
  const nTree = q.trees;
  const trunkG = new THREE.CylinderGeometry(0.16, 0.3, 3.4, 6); trunkG.translate(0, 1.7, 0);
  const crownG = new THREE.SphereGeometry(1, 8, 6); crownG.scale(1, 0.34, 1);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5b4331, roughness: 1 }), nTree);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), nTree);
  const bushG = new THREE.IcosahedronGeometry(1, 0); bushG.scale(1, 0.6, 1);
  const nBush = Math.floor(nTree * 1.6);
  const bushes = new THREE.InstancedMesh(bushG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), nBush);
  const pickSpot = (minOff, maxOff) => {
    const i = Math.floor(R() * n), side = R() < 0.5 ? 1 : -1, off = minOff + Math.pow(R(), 1.6) * (maxOff - minOff);
    const p = track.pointAt(i * STEP, side * off); return p;
  };
  for (let k = 0; k < nTree; k++) {
    const p = pickSpot(11, 420), s = 0.8 + R() * 1.0;
    dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); trunks.setMatrixAt(k, dummy.matrix);
    dummy.position.set(p.x, 3.3 * s, p.z); dummy.scale.set(s * (3 + R() * 2), s * 1.5, s * (3 + R() * 2)); dummy.updateMatrix(); crowns.setMatrixAt(k, dummy.matrix);
    crowns.setColorAt(k, tmpC.setHSL(0.22 + R() * 0.08, 0.35 + R() * 0.2, 0.22 + R() * 0.12));
  }
  for (let k = 0; k < nBush; k++) {
    const p = pickSpot(8.5, 300), s = 0.5 + R() * 1.1;
    dummy.position.set(p.x, 0.3 * s, p.z); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.set(s * 1.4, s, s * 1.4); dummy.updateMatrix(); bushes.setMatrixAt(k, dummy.matrix);
    bushes.setColorAt(k, tmpC.setHSL(0.16 + R() * 0.12, 0.3 + R() * 0.2, 0.25 + R() * 0.15));
  }
  for (const m of [trunks, crowns, bushes]) { m.castShadow = q.shadows && m !== bushes; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; W.group.add(m); }
  // baobabs (few, big)
  const baoG = new THREE.CylinderGeometry(1.6, 2.4, 9, 10); baoG.translate(0, 4.5, 0);
  const bao = new THREE.InstancedMesh(baoG, new THREE.MeshStandardMaterial({ color: 0x7d6a58, roughness: 1 }), 18);
  const baoC = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ color: 0x5f7a3a, roughness: 1 }), 18);
  for (let k = 0; k < 18; k++) { const p = pickSpot(25, 500); const s = 0.8 + R() * 0.6; dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); bao.setMatrixAt(k, dummy.matrix); dummy.position.set(p.x, 10 * s, p.z); dummy.scale.set(5 * s, 2.2 * s, 5 * s); dummy.updateMatrix(); baoC.setMatrixAt(k, dummy.matrix); }
  bao.castShadow = q.shadows; for (const m of [bao, baoC]) { m.frustumCulled = false; W.group.add(m); }
  // termite mounds
  const mound = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 1.8, 7), new THREE.MeshStandardMaterial({ color: 0x9c6b46, roughness: 1 }), 150);
  for (let k = 0; k < 150; k++) { const p = pickSpot(9, 200), s = 0.6 + R() * 1.0; dummy.position.set(p.x, 0.8 * s, p.z); dummy.rotation.set(0, R() * 6, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); mound.setMatrixAt(k, dummy.matrix); }
  mound.frustumCulled = false; W.group.add(mound);
  // koppies (hills)
  const hillN = q.hills, hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x7e6b52, roughness: 1, flatShading: true }), hillN);
  let hc = 0;
  for (let tries = 0; tries < hillN * 12 && hc < hillN; tries++) {
    const i = Math.floor(R() * n), side = R() < 0.5 ? 1 : -1, off = 300 + R() * 1300, p = track.pointAt(i * STEP, side * off);
    let ok = true; for (let j = 0; j < n; j += 8) { const dx = p.x - track.X[j], dz = p.z - track.Z[j]; if (dx * dx + dz * dz < 260 * 260) { ok = false; break; } }
    if (!ok) continue;
    const w = 90 + R() * 220, h = 25 + R() * 70; dummy.position.set(p.x, h / 2 - 2, p.z); dummy.rotation.set(0, R() * 6, 0); dummy.scale.set(w, h, w * (0.7 + R() * 0.5)); dummy.updateMatrix(); hills.setMatrixAt(hc++, dummy.matrix);
  }
  hills.count = hc; hills.frustumCulled = false; W.group.add(hills);

  // ---------- clouds ----------
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false, depthWrite: false }), 70);
  for (let k = 0; k < 70; k++) { dummy.position.set((R() - 0.5) * 6000, 320 + R() * 160, (R() - 0.5) * 5000); dummy.rotation.set(0, 0, 0); dummy.scale.set(120 + R() * 220, 22 + R() * 20, 80 + R() * 120); dummy.updateMatrix(); clouds.setMatrixAt(k, dummy.matrix); }
  clouds.frustumCulled = false; W.clouds = clouds; scene.add(clouds);

  // ---------- towns ----------
  const wallCols = [0xf3ead7, 0xe9d8b4, 0xd9a47a, 0xcfe3d0, 0xe8c9c0, 0xbfd7ea, 0xf6f6f2];
  const roofCols = [0x6b6f73, 0x8a4b3c, 0x555a60, 0x7a8087];
  const nH = track.towns.length * 34;
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), nH);
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 }), nH);
  let hi = 0; W.townPos = [];
  track.towns.forEach((t, ti) => {
    for (let k = 0; k < 34; k++) {
      const ds = (R() - 0.5) * 720, side = R() < 0.5 ? 1 : -1, off = (k < 6 ? 18 + R() * 6 : 22 + R() * 70);
      const p = track.pointAt(t.s + ds, side * (side > 0 && Math.abs(ds) < 24 ? off + 22 : off));   // keep clear of the depot pad on the left
      const w = 5 + R() * 5, d = 5 + R() * 4, h = 2.8 + R() * 1.6;
      dummy.position.set(p.x, h / 2, p.z); dummy.rotation.set(0, p.psi + (R() - 0.5) * 0.2, 0); dummy.scale.set(w, h, d); dummy.updateMatrix(); walls.setMatrixAt(hi, dummy.matrix); walls.setColorAt(hi, tmpC.setHex(wallCols[Math.floor(R() * wallCols.length)]));
      dummy.position.y = h + 0.12; dummy.scale.set(w + 0.6, 0.25, d + 0.6); dummy.updateMatrix(); roofs.setMatrixAt(hi, dummy.matrix); roofs.setColorAt(hi, tmpC.setHex(roofCols[Math.floor(R() * roofCols.length)])); hi++;
    }
  });
  walls.count = roofs.count = hi; walls.castShadow = roofs.castShadow = q.shadows; walls.receiveShadow = true; walls.frustumCulled = roofs.frustumCulled = false;
  walls.instanceColor.needsUpdate = roofs.instanceColor.needsUpdate = true; W.group.add(walls, roofs);

  // ---------- signs ----------
  const signTexCache = {};
  const signTex = (key, draw) => signTexCache[key] || (signTexCache[key] = canvasTex(256, 256, draw));
  const limitTex = v => signTex('L' + v, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.strokeStyle = '#d32f2f'; g.lineWidth = 26; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), 128, 138); });
  const cattleTex = () => signTex('C', (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128, 8); g.lineTo(248, 224); g.lineTo(8, 224); g.closePath(); g.fill(); g.strokeStyle = '#d32f2f'; g.lineWidth = 20; g.stroke(); g.fillStyle = '#111'; g.fillRect(70, 120, 110, 50); g.fillRect(170, 100, 32, 38); g.fillRect(76, 170, 14, 34); g.fillRect(160, 170, 14, 34); g.fillRect(172, 90, 8, 18); g.fillRect(196, 90, 8, 18); });
  const tollTex = () => signTex('T', (g, w, h) => { g.fillStyle = '#1565c0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#fff'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TOLL', 128, 90); g.font = 'bold 34px Arial'; g.fillText('GATE', 128, 140); g.fillText('AHEAD', 128, 184); });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.4 });
  const placeSign = (s, lat, tex, size = 0.9, h = 2.4) => {
    const p = track.pointAt(s, lat), g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), poleMat); pole.position.y = h / 2; g.add(pole);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })); face.position.set(0, h + size / 2 - 0.2, 0.06); g.add(face);
    g.position.set(p.x, 0, p.z); g.rotation.y = p.psi; W.group.add(g); return g;
  };
  const sideLat = ROAD_HALF + SHOULDER + 0.6;
  track.towns.forEach(t => {
    placeSign(t.s - 390, sideLat, limitTex(60)); placeSign(t.s + 390, sideLat, limitTex(80));
    const nm = textPlane('WELCOME TO ' + t.name.toUpperCase(), 5, 1.1, { bg: '#0d5f3a', fg: '#fff', cw: 1024, size: 0.5 });
    const p = track.pointAt(t.s - 400, sideLat + 3), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.psi;
    for (const x of [-2.2, 2.2]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), poleMat); pl.position.set(x, 1.7, 0); g.add(pl); }
    nm.position.set(0, 3.2, 0.08); nm.material.side = THREE.DoubleSide; g.add(nm); W.group.add(g);
  });
  track.cattleSpots.forEach(s => placeSign(s - 120, sideLat, cattleTex(), 0.9));
  track.tolls.forEach(t => { placeSign(t.s - 360, sideLat, tollTex(), 1.1); placeSign(t.s - 330, sideLat, limitTex(40)); placeSign(t.s + 80, sideLat, limitTex(80)); });

  // ---------- toll plazas ----------
  W.tolls = [];
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b9b4, roughness: 0.9 }), paintStripe = new THREE.MeshStandardMaterial({ color: 0xc62828 }), white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.5, metalness: 0.2 });
  track.tolls.forEach((t, idx) => {
    const p = track.pointAt(t.s), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.psi; W.group.add(g);   // local: +x = right of travel, -z = forward
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * (ROAD_HALF + 5), 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.9 })); slab.position.y = 0.05; slab.receiveShadow = q.shadows; g.add(slab);
    for (const sgn of [1, -1]) {  // sgn=+1 : our direction side (left of travel => local x negative)
      const x = -sgn * 4.1;
      const island = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 12), concrete); island.position.set(x, 0.12, 0); g.add(island);
      const booth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 3), white); booth.position.set(x, 1.5, 0); booth.castShadow = q.shadows; g.add(booth);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.9, 2.4), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.5 })); win.position.set(x, 1.8, 0); g.add(win);
      // barrier arm
      const piv = new THREE.Group(); piv.position.set(x - sgn * 0.7 * -1, 1.15, -2.1); g.add(piv);
      piv.position.set(x + (-sgn) * 0.0 + (sgn > 0 ? 0.75 : -0.75) * -1 * -1, 1.15, -2.1);
      const len = 4.2, arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), paintStripe); arm.position.x = (sgn > 0 ? 1 : -1) * len / 2; piv.add(arm);
      for (let k = 0; k < 5; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.125, 0.125), white); st.position.set((sgn > 0 ? 1 : -1) * (0.5 + k * 0.85), 0, 0); piv.add(st); }
      if (sgn > 0) W.tolls.push({ s: t.s, arm: piv, angle: 0, dir: 1, idx }); else piv.rotation.z = (-1) * 1.35 * -1 * -1;
    }
    // canopy
    for (const x of [-(ROAD_HALF + 4.2), ROAD_HALF + 4.2, 0]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), concrete); col.position.set(x, 3, 0); col.castShadow = q.shadows; g.add(col); }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2 * (ROAD_HALF + 5), 0.7, 9), roofMat); canopy.position.set(0, 6.3, 0); canopy.castShadow = q.shadows; g.add(canopy);
    const board = textPlane('TOLL GATE ' + (idx + 1) + '   P' + t.fee, 7, 0.9, { bg: '#0d47a1', fg: '#fff', cw: 1024, size: 0.55 }); board.position.set(0, 6.3, -4.55); board.material.side = THREE.DoubleSide; g.add(board);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0 })); lamp.position.set(-1.9, 5.9, 0); g.add(lamp); (W.lamps || (W.lamps = [])).push(lamp);
  });

  // ---------- depots (delivery points) ----------
  W.depots = track.towns.map((t, i) => {
    const pad = track.pointAt(t.s, 12.5), g = new THREE.Group(); g.position.set(pad.x, 0, pad.z); g.rotation.y = pad.psi; W.group.add(g);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 26), new THREE.MeshStandardMaterial({ color: 0x8e8f8c, roughness: 1 })); slab.position.y = 0.04; slab.receiveShadow = q.shadows; g.add(slab);
    const wh = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 14), new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.8 })); wh.position.set(11, 3, 0); wh.castShadow = q.shadows; g.add(wh);
    const wr = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.3, 14.6), new THREE.MeshStandardMaterial({ color: 0x75797d, metalness: 0.4, roughness: 0.5 })); wr.position.set(11, 6.1, 0); g.add(wr);
    const lab = textPlane(t.name.toUpperCase() + ' DEPOT', 7, 1, { bg: '#e65100', fg: '#fff', cw: 1024, size: 0.5 }); lab.position.set(6.95, 4.5, 0); lab.rotation.y = -Math.PI / 2; lab.material.side = THREE.DoubleSide; g.add(lab);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 70, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.position.set(0, 35, 0); beam.visible = false; g.add(beam);
    const ringM = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.2, 40), new THREE.MeshBasicMaterial({ color: 0xffb300, side: THREE.DoubleSide })); ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.12; ringM.visible = false; g.add(ringM);
    return { s: t.s, lat: 12.5, beam, ring: ringM, x: pad.x, z: pad.z, name: t.name };
  });

  // ---------- fuel stations / roadside shops ----------
  const shopMat = new THREE.MeshStandardMaterial({ color: 0xffc107, roughness: 0.6 });
  track.towns.forEach(t => { const p = track.pointAt(t.s - 120, 17); const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.psi; const c = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 6), shopMat); c.position.y = 4.4; c.castShadow = q.shadows; g.add(c); for (const x of [-3.5, 3.5]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.4, 0.3), poleMat); pl.position.set(x, 2.2, 0); g.add(pl); } const lb = textPlane('FUEL • TUCK SHOP', 6, 0.9, { bg: '#1b5e20', fg: '#fff', cw: 1024, size: 0.5 }); lb.position.set(0, 3.7, 3.1); lb.material.side = THREE.DoubleSide; g.add(lb); W.group.add(g); });

  // ---------- time of day ----------
  const cDay = { top: new THREE.Color(0x2f6fc2), hor: new THREE.Color(0xcfe4f5) }, cDusk = { top: new THREE.Color(0x3b3f78), hor: new THREE.Color(0xf29a5a) }, cNight = { top: new THREE.Color(0x03060d), hor: new THREE.Color(0x0e1626) };
  W.hour = 10; W.nightness = 0;
  W.setHour = (h) => {
    W.hour = h; const el = Math.sin(((h - 6) / 24) * Math.PI * 2);   // sun elevation -1..1
    const day = THREE.MathUtils.smoothstep(el, 0.0, 0.35), dusk = Math.max(0, 1 - Math.abs(el) * 4.5);
    const night = 1 - THREE.MathUtils.smoothstep(el, -0.15, 0.08); W.nightness = night;
    const top = cNight.top.clone().lerp(cDay.top, day).lerp(cDusk.top, dusk * 0.6), hor = cNight.hor.clone().lerp(cDay.hor, day).lerp(cDusk.hor, dusk * 0.85);
    skyMat.uniforms.top.value.copy(top); skyMat.uniforms.hor.value.copy(hor); skyMat.uniforms.night.value = night;
    const ang = ((h - 6) / 24) * Math.PI * 2; W.sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.08, Math.sin(ang)), 0.5).normalize();
    skyMat.uniforms.sun.value.set(Math.cos(ang) * 0.8, Math.sin(ang), 0.5);
    W.sun.intensity = 0.05 + 2.6 * day; W.sun.color.setHex(dusk > 0.3 ? 0xffb070 : 0xfff1d6);
    W.hemi.intensity = 0.12 + 0.8 * day + 0.1 * dusk;
    scene.fog.color.copy(hor); scene.fog.density = 0.00042 + night * 0.0003;
    W.groundMat.color.setScalar(0.25 + 0.75 * Math.max(day, dusk * 0.7)); roadMat.color.setScalar(0.3 + 0.7 * Math.max(day, dusk * 0.7));
    if (W.lamps) W.lamps.forEach(l => l.material.emissiveIntensity = night > 0.4 ? 2 : 0);
    if (scene.environment) scene.environmentIntensity = 0.15 + 0.85 * day;
  };
  W.setHour(10);

  W.update = (dt, focus, camPos) => {
    W.sky.position.copy(camPos);
    W.ground.position.set(Math.round(focus.x / 30) * 30, 0, Math.round(focus.z / 30) * 30);
    W.sun.position.set(focus.x + W.sunDir.x * 150, focus.y + W.sunDir.y * 150, focus.z + W.sunDir.z * 150); W.sun.target.position.set(focus.x, 0, focus.z); W.sun.target.updateMatrixWorld();
    W.tolls.forEach(t => { const target = t.dir > 0 ? 0 : 1.35; t.angle += (target - t.angle) * Math.min(1, dt * 3.5); t.arm.rotation.z = (t.arm.position.x < 0 ? 1 : -1) * 0; t.arm.rotation.z = t.angle * (t.arm.children[0].position.x > 0 ? 1 : -1); });
  };
  W.groundMat.map.repeat.set(200, 200);
  return W;
}
