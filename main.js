import * as THREE from 'three';
import { Track, surfaceAt, ROAD_HALF, LANE } from './track.js';
import { buildWorld } from './world.js';
import { createSim, stepSim, trailerPoint, WHEELBASE } from './sim.js';
import { buildTruck } from './trucks.js';
import { TRUCKS, defaultConfig, computeStats, totalDamage, START_MONEY, WHEEL_R } from './truckdata.js';
import { AudioSys, ENGINE_PROFILES } from './audio.js';
import { Traffic, Animals, Police } from './actors.js';
import { initUI } from './ui.js';
import { TANK_L, FUEL_MODES, PUMP_LPS, CALLOUT_FEE, CALLOUT_L, dieselPrice, fuelFlow, stationAt, nextStation } from './fuel.js';
import { DEFAULTS, PRESETS, DRAW, MIRROR_Q } from './settings.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function showErr(e) { const el = $('err'); if (el) el.textContent = 'Error: ' + ((e && e.message) || e); console.error(e); }
addEventListener('error', ev => showErr(ev.error || ev.message));
addEventListener('unhandledrejection', ev => showErr(ev.reason));
const fmtP = n => 'P ' + Math.round(n).toLocaleString('en-US');

// ------------------------------------------------------------------ save
const SAVE_KEY = 'bwt-save-v1';
const newOwn = id => ({ eng: { [TRUCKS[id].engines[0].id]: 1 }, turbo: { 0: 1 }, exhaust: { 0: 1 }, tyres: { 0: 1 }, brakes: { 0: 1 }, acc: {}, paint: { [TRUCKS[id].color]: 1 }, tpaint: { 14737632: 1 } });
function freshSave() {
  return { money: START_MONEY, truck: 'volvo', trucks: { volvo: { cfg: defaultConfig('volvo'), own: newOwn('volvo') } },
    settings: Object.assign({}, DEFAULTS), fuel: TANK_L, stats: { delivered: 0, earned: 0, fines: 0 }, job: { from: 0, to: 1 } };
}
function loadSave() {
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (j && j.trucks && j.trucks[j.truck]) { const f = freshSave(), old = j.settings || {}; j.settings = Object.assign(f.settings, old.res === undefined ? (PRESETS[old.gfx] || {}) : {}, old); if (typeof j.fuel !== 'number') j.fuel = TANK_L; j.stats = Object.assign(f.stats, j.stats || {}); j.job = j.job || f.job; return j; }
  } catch (_) {}
  return freshSave();
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {} }
setInterval(persist, 8000);

// world is always built at full detail; the settings menu scales it down at run time (see applySettings)
const q = { shadows: true, shadowMap: 2048, trees: 2600, hills: 30, pr: 1.5, mirrorEvery: 3 };
let MQ = MIRROR_Q.med;

// ------------------------------------------------------------------ state
const S = {
  mode: 'boot', cam: 0, lights: false, hour: 10.5, hint: -1, loc: null, steerIn: 0, gas: 0, brake: 0, arrow: 0, wheelAng: 0,
  look: { yaw: 0, pitch: -0.03 }, lookHold: 0, heat: 0, tickets: [], ticketAge: 0, cd: {}, offT: 0, wrongT: 0, nightT: 0, speedT: 0,
  zone: '', lastNight: false, msgT: 0, showRev: 0, showRpm: 0, showCockpit: false, orbit: { theta: 0.6, phi: 1.2, r: 26, auto: true },
  mirrorSel: 'L', madj: { L: { yaw: 0, pitch: 0 }, R: { yaw: 0, pitch: 0 } }, frame: 0, depotT: 0, tollT: {}, tilt: 0, gyro: 0, tiltOffset: null, tiltRaw: 0, sensorSeen: false,
  trapUsed: {}, tickets_total: 0, camPos: null, camPsi: 0,
  engineOn: false, crankT: 0, crankOk: false, refuel: null, fuelWarn: 0, callT: 0, beepT: 0, pumpT: 0, stHint: false, inStation: -1,
};
let renderer, scene, camera, world, track, traffic, animals, police, T = null, sim, audio, rng;
const mirrorRT = {}, mcam = {}, mquad = {}, modelGroup = new THREE.Group(), SH = new THREE.Group();
const SX = 40000, SZ = 0;
const ortho = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10);
let lastTruckKey = '';

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function toast(msg, ms = 3200) { const m = $('msg'); m.textContent = msg; m.classList.add('show'); S.msgT = ms / 1000; }
function updateMoney() { $('money').textContent = fmtP(save.money); }
function addMoney(d) { save.money += d; updateMoney(); }
function curCfg() { return save.trucks[save.truck].cfg; }
function curStats() { return computeStats(save.truck, curCfg()); }

// ------------------------------------------------------------------ truck model management
function rebuildTruck(id, cfg) {
  if (T) { scene.remove(T.root); scene.remove(T.trailer); modelGroup.remove(T.root); modelGroup.remove(T.trailer); T.dispose(); }
  T = buildTruck(id, cfg, TRUCKS[id]);
  T.root.rotation.order = 'YXZ';
  for (const side of ['L', 'R']) { const g = T.mirrors[side].glass; g.material = new THREE.MeshBasicMaterial({ map: mirrorRT[side].texture, toneMapped: false }); }
  T.lightsOn = S.lights; T.setLights(S.lights);
  const parent = S.mode === 'show' ? modelGroup : scene;
  parent.add(T.root); parent.add(T.trailer);
  if (S.mode === 'show') { T.root.position.set(0, 0, 0); T.root.rotation.set(0, 0, 0); T.trailer.position.set(0, 0, 1.3); T.trailer.rotation.set(0, 0, 0); }
  T.setCockpit(S.mode === 'show' ? S.showCockpit : S.cam === 0);
  const st = computeStats(id, cfg); audio.setProfile(st.snd);
  return st;
}

// ------------------------------------------------------------------ input
const sensors = { motion: false };
function steerFromSensors(dt) {
  const st = save.settings, inv = st.invert ? -1 : 1;
  if (st.steer === 'tilt') {
    if (S.tiltOffset === null && S.sensorSeen) S.tiltOffset = S.tiltRaw;
    let d = S.tiltRaw - (S.tiltOffset || 0); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return clamp(inv * d * st.sens / 0.6, -1, 1);
  }
  S.gyro *= 1 - Math.min(1, 0.2 * dt);
  return clamp(inv * S.gyro * st.sens / 0.6, -1, 1);
}
function onMotion(e) {
  S.sensorSeen = true;
  const a = e.accelerationIncludingGravity;
  if (a && a.x != null) {
    const ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    let sx, sy;
    switch (ang) { case 90: sx = -a.y; sy = a.x; break; case 270: case -90: sx = a.y; sy = -a.x; break; case 180: sx = -a.x; sy = -a.y; break; default: sx = a.x; sy = a.y; }
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) { sx = -sx; sy = -sy; }
    S.tiltRaw = -Math.atan2(sx, sy);
  }
  const r = e.rotationRate;
  if (r && r.alpha != null) S.gyro += (-(r.alpha || 0) * Math.PI / 180) * (1 / 60);
}
async function requestSensors() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission(); if (res !== 'granted') { toast('Motion permission was denied'); return false; }
    }
  } catch (_) { toast('Could not ask for motion permission'); return false; }
  if (!sensors.motion) { addEventListener('devicemotion', onMotion); sensors.motion = true; }
  setTimeout(() => { if (!S.sensorSeen) toast('No motion sensor found. Use Arrows or Wheel steering.', 4500); }, 1800);
  return true;
}
function applySteerMode() {
  const m = save.settings.steer;
  $('bL').style.display = $('bR').style.display = m === 'arrows' ? '' : 'none';
  $('steerWheel').style.display = m === 'wheel' ? 'block' : 'none';
  if (m === 'tilt' || m === 'gyro') { S.tiltOffset = null; S.gyro = 0; requestSensors(); }
}
function holdButton(el, on, off) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} on(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => off());
}
const keys = {};
const fuelMult = () => { const m = FUEL_MODES[save.settings.fuelMode]; return m === undefined ? FUEL_MODES.normal : m; };
function toggleEngine() {
  if (S.crankT > 0 || S.mode !== 'drive') return;
  if (S.engineOn) { S.engineOn = false; audio.airRelease(); toast('Engine off', 1200); return; }
  if (S.refuel) return;
  audio.init();
  if (save.fuel <= 0 && fuelMult() > 0) { S.crankT = 1.3; S.crankOk = false; audio.crank(1.3); return; }
  S.crankT = 0.9; S.crankOk = true; audio.crank(0.9);
}
function startCall() {
  if (S.callT > 0) return;
  S.callT = 8; toast('Fuel delivery called. Stay where you are.', 3500);
}
function buildFuelPanel() {
  const w = document.createElement('div'); w.className = 'panelWrap'; w.id = 'pFuel';
  const bs = 'flex:1 1 40%;min-height:44px';
  w.innerHTML = '<div class="panel"><h2 id="fuTitle">Fuel station</h2><div id="fuInfo" style="font-size:14px;line-height:1.5"></div>' +
    '<div style="margin:10px 0;height:20px;background:#222;border-radius:10px;overflow:hidden"><div id="fuBar" style="height:100%;width:0;background:#ffb300"></div></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn" data-fu="50" style="' + bs + '">+50 L</button><button class="btn" data-fu="100" style="' + bs + '">+100 L</button><button class="btn" data-fu="999" style="' + bs + '">Fill up</button><button class="btn" id="fuStop" style="' + bs + '">Leave pump</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'fuStop') { S.refuel = null; w.classList.remove('show'); return; }
    if (b.dataset.fu) {
      const price = dieselPrice(S.refuel.st);
      if (save.money < price) { toast('Not enough money for fuel', 2500); return; }
      if (save.fuel >= TANK_L - 0.5) { toast('Tank is full', 1500); return; }
      S.refuel.left = +b.dataset.fu; S.refuel.paid = 0; S.refuel.liters = 0; S.refuel.on = true;
    }
  });
}
function fuelUI() {
  const f = save.fuel, m = fuelMult();
  $('fuelFill').style.width = (m ? f / TANK_L * 100 : 100) + '%';
  $('fuelFill').style.background = f / TANK_L < 0.1 ? '#ff1744' : f / TANK_L < 0.2 ? '#ff9100' : '#7bd88f';
  $('fuelTxt').textContent = m ? '⛽ ' + Math.round(f) + ' L' : '⛽ unlimited';
  $('bCall').style.display = (m && f <= 0 && !S.engineOn && S.mode === 'drive') ? '' : 'none';
  $('bCall').textContent = S.callT > 0 ? '📞 Help coming… ' + Math.ceil(S.callT) + 's' : '📞 Fuel delivery (' + fmtP(CALLOUT_FEE) + ')';
}
function refuelUpdate(dt) {
  const r = S.refuel; if (!r) return;
  const price = dieselPrice(r.st);
  if (r.on) {
    let amt = Math.min(PUMP_LPS * dt, r.left, TANK_L - save.fuel, save.money / price);
    if (amt > 0.0001) {
      save.fuel += amt; r.left -= amt; r.liters += amt; r.paid += amt * price; addMoney(-amt * price);
      S.pumpT -= dt; if (S.pumpT <= 0) { S.pumpT = 0.12; audio.pump(); }
    }
    if (amt <= 0.0001 || r.left <= 0.0001) {
      r.on = false; if (r.liters > 0.5) { toast('Added ' + Math.round(r.liters) + ' L for ' + fmtP(r.paid), 3000); audio.coin(); persist(); }
      if (save.fuel < TANK_L - 0.5 && save.money < price) toast('Out of money', 2500);
    }
  }
  $('fuTitle').textContent = 'Fuel station · ' + track.towns[r.st].name;
  $('fuInfo').innerHTML = 'Diesel ' + price.toFixed(2) + ' P per litre<br>Tank ' + Math.round(save.fuel) + ' / ' + TANK_L + ' L' + (r.on ? '<br>Pumping… ' + Math.round(r.liters) + ' L · ' + fmtP(r.paid) : '') + '<br>Money ' + fmtP(save.money);
  $('fuBar').style.width = (save.fuel / TANK_L * 100) + '%';
}
function setupInput() {
  holdButton($('bGas'), () => { S.gasBtn = 1; }, () => { S.gasBtn = 0; });
  holdButton($('bBrake'), () => { S.brakeBtn = 1; }, () => { S.brakeBtn = 0; });
  holdButton($('bL'), () => { S.arrow = -1; }, () => { if (S.arrow < 0) S.arrow = 0; });
  holdButton($('bR'), () => { S.arrow = 1; }, () => { if (S.arrow > 0) S.arrow = 0; });
  holdButton($('bHorn'), () => audio.horn(true), () => audio.horn(false));
  // steering wheel drag
  const w = $('steerWheel'); let drag = null;
  const angleOf = e => { const r = w.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  w.addEventListener('pointerdown', e => { e.preventDefault(); try { w.setPointerCapture(e.pointerId); } catch (_) {} drag = { a0: angleOf(e), w0: S.wheelAng }; S.wheelHeld = true; });
  w.addEventListener('pointermove', e => { if (!drag) return; let d = angleOf(e) - drag.a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; S.wheelAng = clamp(drag.w0 + d, -1.6, 1.6); w.style.transform = 'rotate(' + S.wheelAng + 'rad)'; });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) w.addEventListener(ev, () => { drag = null; S.wheelHeld = false; });
  // look around by dragging the view
  const cv = $('gl'); let ld = null;
  cv.addEventListener('pointerdown', e => { ld = { x: e.clientX, y: e.clientY }; S.lookDrag = true; if (S.mode === 'show') S.orbit.auto = false; });
  cv.addEventListener('pointermove', e => {
    if (!ld) return; const dx = e.clientX - ld.x, dy = e.clientY - ld.y; ld.x = e.clientX; ld.y = e.clientY;
    if (S.mode === 'show' && !S.showCockpit) { S.orbit.theta -= dx * 0.008; S.orbit.phi = clamp(S.orbit.phi - dy * 0.006, 0.35, 1.5); }
    else { S.look.yaw = clamp(S.look.yaw + dx * 0.006, -2.4, 2.4); S.look.pitch = clamp(S.look.pitch + dy * 0.004, -0.6, 0.6); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(ev, () => { ld = null; S.lookDrag = false; });
  cv.addEventListener('wheel', e => { S.orbit.r = clamp(S.orbit.r + e.deltaY * 0.02, 10, 45); }, { passive: true });
  // buttons
  $('bCam').addEventListener('click', () => { S.cam = (S.cam + 1) % 4; S.look.yaw = 0; S.look.pitch = -0.03; T.setCockpit(S.cam === 0); toast(['Cockpit', 'Chase view', 'Far chase view', 'Bumper view'][S.cam], 1200); });
  $('bLights').addEventListener('click', () => setLights(!S.lights));
  $('bMirror').addEventListener('click', () => { $('mirrorPad').classList.toggle('show'); $('bMirror').classList.toggle('on', $('mirrorPad').classList.contains('show')); });
  document.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.m, a = S.madj[S.mirrorSel];
    if (k === 'sel') { S.mirrorSel = S.mirrorSel === 'L' ? 'R' : 'L'; b.textContent = 'Mirror: ' + S.mirrorSel; return; }
    if (k === 'up') a.pitch = clamp(a.pitch + 0.03, -0.3, 0.3); if (k === 'down') a.pitch = clamp(a.pitch - 0.03, -0.3, 0.3);
    if (k === 'left') a.yaw = clamp(a.yaw + 0.03, -0.4, 0.4); if (k === 'right') a.yaw = clamp(a.yaw - 0.03, -0.4, 0.4);
  }));
  $('bShow').addEventListener('click', () => enterShowroom());
  $('bMusic').addEventListener('click', () => { audio.init(); $('pMusic').classList.add('show'); G.refreshMusic(); });
  $('bSet').addEventListener('click', () => G.openSettings());
  // extra buttons: look left / right, reverse, manual gears
  const mk = (id, txt, css) => { const b = document.createElement('button'); b.className = 'btn'; b.id = id; b.textContent = txt; b.style.cssText = 'position:absolute;' + css; $('hud').appendChild(b); return b; };
  holdButton(mk('bLookL', '◀ Look', 'left:10px;top:50%;transform:translateY(-50%)'), () => { S.lookHold = -1; }, () => { S.lookHold = 0; });
  holdButton(mk('bLookR', 'Look ▶', 'right:10px;top:50%;transform:translateY(-50%)'), () => { S.lookHold = 1; }, () => { S.lookHold = 0; });
  const rev = mk('bRev', 'D', 'right:210px;bottom:calc(14px + env(safe-area-inset-bottom))');
  rev.addEventListener('click', () => { if (Math.abs(sim.v) > 1) { toast('Stop first to change direction', 1500); return; } sim.reverse = !sim.reverse; rev.textContent = sim.reverse ? 'R' : 'D'; rev.classList.toggle('on', sim.reverse); });
  const gu = mk('bGUp', 'G+', 'right:210px;bottom:calc(70px + env(safe-area-inset-bottom))'), gd = mk('bGDn', 'G−', 'right:210px;bottom:calc(126px + env(safe-area-inset-bottom))');
  gu.addEventListener('click', () => { if (!sim.auto) { sim.gear = clamp(sim.gear + 1, 1, 12); sim.shiftT = 0.3; audio.gearShift(); } });
  gd.addEventListener('click', () => { if (!sim.auto) { sim.gear = clamp(sim.gear - 1, 1, 12); sim.shiftT = 0.3; audio.gearShift(); } });
  const nav = document.createElement('div'); nav.id = 'nav'; nav.style.cssText = 'position:absolute;top:calc(64px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);margin-top:44px;background:rgba(12,16,22,.78);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:5px 12px;font-size:13px;pointer-events:none;text-align:center;white-space:nowrap'; $('hud').appendChild(nav);
  $('speedo').insertAdjacentHTML('beforeend', '<div style="margin:3px auto 0;height:5px;width:110px;background:#333;border-radius:3px;overflow:hidden"><div id="fuelFill" style="height:100%;width:100%;background:#7bd88f"></div></div><div class="u" id="fuelTxt"></div>');
  const eng = mk('bEng', '🔑 Engine', 'right:276px;bottom:calc(14px + env(safe-area-inset-bottom))');
  eng.addEventListener('click', toggleEngine);
  const eb = mk('bEBrake', '🛑 E-Brake', 'right:276px;bottom:calc(70px + env(safe-area-inset-bottom));background:rgba(180,20,30,.85)');
  holdButton(eb, () => { S.ebBtn = 1; }, () => { S.ebBtn = 0; });
  const call = mk('bCall', '', 'left:50%;top:calc(150px + env(safe-area-inset-top));transform:translateX(-50%);display:none');
  call.addEventListener('click', startCall);
  buildFuelPanel();
  addEventListener('keydown', e => {
    if (e.repeat) return; keys[e.code] = true;
    if (e.code === 'KeyI') toggleEngine();
    if (e.code === 'KeyH') audio.horn(true); if (e.code === 'KeyL') setLights(!S.lights); if (e.code === 'KeyC') $('bCam').click(); if (e.code === 'KeyM') $('bMusic').click();
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyH') audio.horn(false); });
}
function setLights(on) { S.lights = on; if (T) { T.lightsOn = on; T.setLights(on); } $('bLights').classList.toggle('on', on); }

// ------------------------------------------------------------------ showroom
function enterShowroom() {
  if (S.mode === 'show') return;
  S.mode = 'show'; S.savedHour = S.hour; S.showCockpit = false; S.orbit.auto = true;
  $('hud').style.display = 'none'; hideWorld(true);
  rebuildTruck(save.truck, curCfg());
  world.setHour(12); scene.background = new THREE.Color(0x0b1016);
  $('pShow').classList.add('show'); G.openShowroom();
}
function exitShowroom() {
  if (S.mode !== 'show') return;
  S.mode = 'drive'; $('pShow').classList.remove('show'); hideWorld(false); scene.background = null;
  $('hud').style.display = ''; world.setHour(S.hour);
  rebuildTruck(save.truck, curCfg()); persist(); updateMoney(); audio.updateEngine(0, 0, 0, 0, false, { muffler: 1, turbo: 1 });
}
function hideWorld(h) {
  world.group.visible = !h; world.ground.visible = !h; world.sky.visible = !h; world.clouds.visible = !h;
  traffic.group.visible = !h; animals.group.visible = !h; police.group.visible = !h && !!save.settings.police; SH.visible = h;
}

// ------------------------------------------------------------------ game rules
function addTicket(kind, amt, heat, cool = 20) {
  if (!save.settings.police) return false;
  if (S.cd[kind] > 0) return false;
  S.cd[kind] = cool; S.tickets.push({ kind, amt }); S.heat += heat; S.ticketAge = 0;
  toast('Violation: ' + kind + '  (' + fmtP(amt) + ')', 3000); return true;
}
function damage(part, amt) {
  const d = curCfg().dmg; d[part] = clamp(d[part] + amt, 0, 100);
}
function truckCircles() {
  const fx = -Math.sin(sim.psi), fz = -Math.cos(sim.psi), c = [];
  for (const o of [2.6, 0.2, -1.4]) c.push({ x: sim.x + fx * o, z: sim.z + fz * o, r: 1.35 });
  for (const d of [3, 6.5, 10, 13]) { const p = trailerPoint(sim, d); c.push({ x: p.x, z: p.z, r: 1.4 }); }
  return c;
}

function gameStep(h, gas, brake, eb) {
  const st = curStats(), prof = ENGINE_PROFILES[st.snd] || ENGINE_PROFILES.volvo;
  const loc = track.locate(sim.x, sim.z, S.hint); S.hint = loc.i; S.loc = loc;
  const stn = stationAt(track, loc.s, loc.lat); S.inStation = stn;
  const surf = stn >= 0 ? 'road' : surfaceAt(loc.lat);
  const mult = fuelMult(), run = S.engineOn && S.crankT <= 0 && (save.fuel > 0 || mult === 0);
  stepSim(sim, h, { throttle: gas, brake: brake, steer: S.steerIn, engine: run, ebrake: !!eb }, { surface: surf, idle: prof.idle, redline: prof.redline }, st);
  if (run && mult > 0) {
    save.fuel = Math.max(0, save.fuel - fuelFlow(st.hp, sim.throttle, sim.rpm, true) * mult * h);
    if (save.fuel <= 0) { S.engineOn = false; audio.airRelease(); toast('OUT OF FUEL! The engine stopped.', 5000); }
  }
  if (stn < 0 && Math.abs(loc.lat) > 14) sim.v *= 1 - Math.min(0.9, (Math.abs(loc.lat) - 14) * 0.02) * h;
  const cfg = curCfg();
  if (sim.rpm > prof.redline + 40) damage('engine', 0.5 * h);
  damage('tyres', ((sim.slip ? 0.6 : 0.0015 * Math.abs(sim.v)) + (surf === 'sand' ? 0.2 : 0)) * st.tyreWear * h * 0.5);
  if (sim.jack > 1.1 && Math.abs(sim.v) > 4) damage('body', 0.8 * h);
  if (sim.shifted) { audio.gearShift(); sim.shifted = 0; }
  return loc;
}

function updateRules(dt) {
  const loc = S.loc, kmh = Math.abs(sim.v) * 3.6, limit = track.limitAt(loc.s), over = kmh - limit;
  for (const k in S.cd) if (S.cd[k] > 0) S.cd[k] -= dt;
  const player = { s: loc.s, lat: loc.lat, v: sim.v, x: sim.x, z: sim.z };
  // speeding
  if (over > 10) S.speedT += dt; else S.speedT = Math.max(0, S.speedT - dt * 2);
  if (S.speedT > 1.6) { const amt = over > 35 ? 2000 : over > 20 ? 800 : 300; if (addTicket('Speeding ' + Math.round(kmh) + ' in a ' + limit + ' zone', amt, over > 35 ? 0.8 : 0.35, 25)) S.speedT = 0; }
  // speed traps
  track.posts.forEach((p, i) => {
    const d = track.ds(p.s, loc.s);
    if (save.settings.police && Math.abs(d) < 10 && over > 10 && !police.active && !S.trapUsed[i]) {
      S.trapUsed[i] = true; addTicket('Speed trap ' + Math.round(kmh) + ' km/h', over > 35 ? 2000 : 800, 0, 5); police.start(player, p); toast('Police radar! Pull over when the officer catches up.', 4000);
    }
    if (Math.abs(d) > 250) S.trapUsed[i] = false;
  });
  // lane / road discipline
  if (loc.lat < -0.4 && Math.abs(sim.v) > 3 && loc.lat > -7) S.wrongT += dt; else S.wrongT = Math.max(0, S.wrongT - dt * 2);
  if (S.wrongT > 6) { addTicket('Driving on the wrong side', 500, 0.25); S.wrongT = 0; }
  if (S.inStation < 0 && Math.abs(loc.lat) > 6.9 && Math.abs(sim.v) > 3) S.offT += dt; else S.offT = Math.max(0, S.offT - dt);
  if (S.offT > 5) { addTicket('Driving off the road', 300, 0.1); S.offT = 0; }
  if (world.nightness > 0.55 && !S.lights && Math.abs(sim.v) > 3) S.nightT += dt; else S.nightT = 0;
  if (S.nightT > 10) { addTicket('No headlights at night', 400, 0.3); S.nightT = 0; }
  // toll gates
  track.tolls.forEach((t, i) => {
    const wt = world.tolls[i], d = track.ds(t.s, loc.s);
    if (d > -16 && d < 0.8 && loc.lat > 0 && !t.paid) {
      if (Math.abs(sim.v) < 0.7) { S.tollT[i] = (S.tollT[i] || 0) + dt; if (S.tollT[i] > 1.0) { addMoney(-t.fee); t.paid = true; wt.dir = -1; audio.coin(); toast(t.name + ' paid: ' + fmtP(t.fee), 2500); } }
      else S.tollT[i] = 0;
    }
    if (d > 2.6 && d < 8 && !t.paid && Math.abs(sim.v) > 1 && loc.lat > 0) { t.paid = true; wt.dir = -1; damage('body', 3); audio.crash(0.6); addTicket('Toll evasion at ' + t.name, 1500, 0.8, 5); }
    if (d > 25 && t.paid) { t.paid = false; wt.dir = 1; }
    if (d < -40) { if (t.paid) { t.paid = false; } wt.dir = 1; }
  });
  // deliveries
  const job = save.job, dep = world.depots[job.to];
  world.depots.forEach((dp, i) => { dp.beam.visible = dp.ring.visible = i === job.to; });
  const dd = track.ds(dep.s, loc.s);
  if (Math.abs(dd) < 22 && loc.lat > 5 && loc.lat < 21 && Math.abs(sim.v) < 1.0) {
    S.depotT += dt;
    if (S.depotT > 1.4) {
      const dist = track.wrap(track.towns[job.to].s - track.towns[job.from].s), dm = totalDamage(curCfg()) / 100;
      const pay = Math.round(dist * 3.0 * (1 - 0.5 * dm) / 10) * 10;
      addMoney(pay); save.stats.delivered++; save.stats.earned += pay;
      toast('Delivered to ' + dep.name + '!  +' + fmtP(pay), 4500); audio.coin();
      job.from = job.to; job.to = (job.to + 1) % track.towns.length; S.depotT = 0; persist();
    }
  } else S.depotT = 0;
  const nd = track.wrap(track.towns[job.to].s + 0 - loc.s);
  const ns = nextStation(track, loc.s);
  $('nav').textContent = '→ ' + track.towns[job.to].name + ' depot · ' + (nd / 1000).toFixed(1) + ' km' + (fuelMult() ? '   ⛽ ' + track.towns[ns.i].name + ' ' + (ns.d / 1000).toFixed(1) + ' km' : '');
  // guardrails: the rail stands just past the shoulder; hitting it hurts and pushes you back
  if (world.guard && world.guard[loc.i] && Math.abs(loc.lat) > 5.55) {
    const sg = loc.lat > 0 ? 1 : -1, p = track.pointAt(loc.s, sg * 5.45), spd = Math.abs(sim.v);
    sim.x += (p.x - sim.x) * 0.25; sim.z += (p.z - sim.z) * 0.25; sim.v *= 0.985;
    if (spd > 2.5 && !(S.cd.guard > 0)) { S.cd.guard = 0.9; damage('body', clamp(spd * 0.6, 1, 14)); audio.crash(clamp(spd / 18, 0.25, 0.8)); toast('Guardrail!', 1000); }
  }
  // fuel stations
  if (S.inStation >= 0 && fuelMult() > 0) {
    if (Math.abs(sim.v) < 0.4 && !S.engineOn && S.crankT <= 0 && !S.refuel) { S.refuel = { st: S.inStation, left: 0, liters: 0, paid: 0, on: false }; $('pFuel').classList.add('show'); }
    else if (Math.abs(sim.v) < 0.4 && S.engineOn && !S.stHint) { S.stHint = true; toast('Switch the engine off (🔑) to refuel', 3500); }
  } else S.stHint = false;
  // zone messages
  const zn = track.zoneName(loc.s); if (zn !== S.zone) { S.zone = zn; if (zn) toast('Entering ' + zn + '. Limit ' + limit + ' km/h', 2500); }
  // collisions
  const pc = truckCircles(), hits = traffic.collide(pc, sim.v, sim.x, sim.z);
  if (hits.length) {
    const sp = Math.abs(sim.v); damage('body', clamp(2 + sp * 0.9, 2, 28)); sim.v *= 0.4; audio.crash(clamp(sp / 15, 0.3, 1));
    addTicket('Collision with a vehicle', 1500, 0.7, 6); toast('Crash!', 1500);
  }
  const ah = animals.collide(pc, sim.x, sim.z);
  if (ah.length) { damage('body', 5); sim.v *= 0.75; audio.crash(0.5); addTicket('Hitting livestock', 2500, 0.6, 6); toast('You hit livestock!', 2200); }
  // police
  S.heat = Math.max(0, S.heat - 0.012 * dt);
  if (!save.settings.police) S.heat = 0;
  if (S.heat >= 1 && !police.active) { police.start(player, null); S.heat = 0; toast('Police are chasing you! Pull over.', 4000); }
  const res = police.update(dt, player);
  audio.siren(police.active && res.near, dt);
  const cop = $('cop');
  if (police.active) { cop.style.display = 'block'; cop.textContent = res.onTail ? 'POLICE: PULL OVER AND STOP' : 'POLICE BEHIND YOU'; } else cop.style.display = 'none';
  if (police.active && res.ticket) {
    const total = S.tickets.reduce((a, t) => a + t.amt, 0); const list = S.tickets.map(t => t.kind).join(', ');
    addMoney(-total); save.stats.fines += total; S.tickets = []; police.release(); toast('Fined ' + fmtP(total) + (list ? ': ' + list : ''), 5500); persist();
  } else if (police.active && res.timedOut) {
    const total = S.tickets.reduce((a, t) => a + t.amt, 0) + 3000;
    addMoney(-total); save.stats.fines += total; S.tickets = []; police.release(); toast('You did not stop. Fined ' + fmtP(total), 5500);
  }
  if (!police.active && S.tickets.length) { S.ticketAge += dt; if (S.ticketAge > 90) { S.tickets = []; } }
  // night
  const night = world.nightness > 0.55;
  if (night && !S.lastNight) { toast('It is getting dark. Press the lights button.', 3500); if (!S.lights) setLights(true); }
  S.lastNight = night;
  return { limit, kmh };
}

// ------------------------------------------------------------------ camera, mirrors
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function updateCamera(dt) {
  const fx = -Math.sin(sim.psi), fz = -Math.cos(sim.psi);
  T.root.updateMatrixWorld(true);
  if (S.cam === 0) {
    camera.fov = 70; tmpV.copy(T.eye); T.root.localToWorld(tmpV); camera.position.copy(tmpV);
    camera.rotation.set(S.look.pitch, sim.psi + S.look.yaw, 0);
  } else if (S.cam === 3) {
    camera.fov = 70; tmpV.set(0, 1.6, -3.9); T.root.localToWorld(tmpV); camera.position.copy(tmpV);
    camera.rotation.set(S.look.pitch, sim.psi + S.look.yaw, 0);
  } else {
    camera.fov = 55; const dist = S.cam === 1 ? 19 : 34, hgt = S.cam === 1 ? 6.8 : 12;
    S.camPsi += clamp(((sim.psi - S.camPsi + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1) * Math.min(1, dt * 4) * 0.9;
    const cx = sim.x + Math.sin(S.camPsi) * dist, cz = sim.z + Math.cos(S.camPsi) * dist;
    camera.position.set(cx, hgt, cz); camera.position.x += Math.sin(S.camPsi + Math.PI / 2) * S.look.yaw * 6;
    camera.lookAt(sim.x + fx * 10, 2.4, sim.z + fz * 10);
  }
  camera.updateProjectionMatrix();
}
function mirrorPass() {
  for (const side of ['L', 'R']) {
    const a = T.mirrors[side].anchor, cam = mcam[side], ad = S.madj[side], sgn = side === 'L' ? 1 : -1;
    a.getWorldPosition(tmpV2); cam.position.copy(tmpV2);
    const alpha = sgn * 0.10 + ad.yaw;
    cam.rotation.set(-0.03 + ad.pitch, sim.psi + Math.PI - alpha, 0);
    cam.updateMatrixWorld(true);
  }
}
let mirrorToggle = 0;
function renderMirrors() {
  renderer.shadowMap.autoUpdate = false;
  const side = mirrorToggle++ % 2 ? 'R' : 'L';
  mirrorPass();
  renderer.setRenderTarget(mirrorRT[side]); renderer.clear(); renderer.render(scene, mcam[side]); renderer.setRenderTarget(null);
}
function drawMirrorOverlay() {
  const W = innerWidth, H = innerHeight, mw = Math.min(190, W * 0.22), mh = mw * 0.66, top = 130;
  renderer.autoClear = false; renderer.setScissorTest(true);
  const rects = { L: [8, H - top - mh, mw, mh], R: [W - 8 - mw, H - top - mh, mw, mh] };
  for (const side of ['L', 'R']) {
    const [x, y, w, h] = rects[side];
    renderer.setViewport(x - 3, y - 3, w + 6, h + 6); renderer.setScissor(x - 3, y - 3, w + 6, h + 6); renderer.setClearColor(0x0a0c0f, 1); renderer.clear(true, true, false);
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); renderer.clear(true, true, false);
    renderer.render(mquad[side], ortho);
  }
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.autoClear = true;
}

// ------------------------------------------------------------------ main loop
let last = 0, acc = 0, hourT = 0, hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now; S.frame++;
  const panelOpen = document.querySelectorAll('.panelWrap.show').length > 0;
  if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0) $('msg').classList.remove('show'); }
  try {
    if (S.mode === 'show') showFrame(dt); else driveFrame(dt, panelOpen);
  } catch (e) { showErr(e); }
}

function driveFrame(dt, panelOpen) {
  const st = save.settings;
  const kb = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const gasIn = (S.gasBtn || keys.ArrowUp || keys.KeyW) ? 1 : 0;
  const ebIn = (S.ebBtn || keys.KeyE || keys.KeyB) ? 1 : 0;
  const brakeIn = (S.brakeBtn || keys.ArrowDown || keys.KeyS || keys.Space || ebIn) ? 1 : 0;
  S.brakeNow = brakeIn;
  if (S.crankT > 0 && !panelOpen) { S.crankT -= dt; if (S.crankT <= 0) { if (S.crankOk) { S.engineOn = true; } else toast('No fuel. Call for a fuel delivery.', 3500); } }
  if (S.callT > 0) { S.callT -= dt; if (S.callT <= 0) { if (save.money >= CALLOUT_FEE) { addMoney(-CALLOUT_FEE); save.fuel = Math.min(TANK_L, save.fuel + CALLOUT_L); toast('Fuel delivered: ' + CALLOUT_L + ' L for ' + fmtP(CALLOUT_FEE), 4000); } else { save.fuel = Math.min(TANK_L, save.fuel + 10); toast('A passing driver gave you 10 L of diesel.', 4500); } persist(); } }
  refuelUpdate(dt);
  if (!panelOpen) {
    let target = 0;
    if (st.steer === 'arrows') { const goal = S.arrow || kb; S.arrowV = S.arrowV || 0; S.arrowV += (goal - S.arrowV) * Math.min(1, dt * (goal ? 4 : 7)); target = S.arrowV; }
    else if (st.steer === 'wheel') { target = kb || S.wheelAng / 1.6; }
    else target = kb || steerFromSensors(dt);
    S.steerIn = clamp(target, -1, 1);
    sim.auto = !!st.auto;
    acc += dt; let n = 0;
    while (acc >= 1 / 60 && n < 5) { gameStep(1 / 60, gasIn, brakeIn, ebIn); acc -= 1 / 60; n++; }
    if (n === 5) acc = 0;
    // wheel springs back to centre; look returns to straight ahead
    if (!S.wheelHeld) { S.wheelAng *= 1 - Math.min(1, dt * 5); $('steerWheel').style.transform = 'rotate(' + S.wheelAng + 'rad)'; }
    if (S.lookHold) S.look.yaw += (S.lookHold * 1.6 - S.look.yaw) * Math.min(1, dt * 7);
    else if (!S.lookDrag) S.look.yaw *= 1 - Math.min(1, dt * 3);
    // time of day
    if (st.todSph > 0) S.hour = (S.hour + dt / st.todSph) % 24; hourT += dt;
    if (hourT > 0.4) { hourT = 0; world.setHour(S.hour); traffic.setNight(world.nightness); }
    S.rules = updateRules(dt);
    traffic.update(dt, { s: S.loc.s, lat: S.loc.lat, v: sim.v }, S.hour);
    animals.update(dt, { s: S.loc.s, v: sim.v });
  } else { audio.horn(false); }
  placeTruck(dt);
  updateCamera(dt);
  const kmh = Math.abs(sim.v) * 3.6, stt = curStats(), prof = ENGINE_PROFILES[stt.snd] || ENGINE_PROFILES.volvo;
  const running = S.engineOn && S.crankT <= 0;
  audio.setInterior(S.cam === 0 || S.cam === 3);
  audio.updateEngine(running ? sim.rpm : 0, panelOpen || !running ? 0 : sim.throttle, Math.abs(sim.v), sim.brake, running, { muffler: stt.muffler, turbo: stt.turboBoost });
  if (sim.reverse && running && Math.abs(sim.v) > 0.3 && !panelOpen) { S.beepT -= dt; if (S.beepT <= 0) { S.beepT = 0.85; audio.reverseBeep(); } } else S.beepT = 0;
  const fr = save.fuel / TANK_L;
  if (fuelMult() && fr < 0.1 && S.fuelWarn < 2) { S.fuelWarn = 2; toast('Fuel very low! Find a station.', 4000); audio.beep(700, 0.2, 0.15); }
  else if (fuelMult() && fr < 0.2 && S.fuelWarn < 1) { S.fuelWarn = 1; toast('Low fuel. Next station on the left in a town.', 4000); }
  else if (fr > 0.25) S.fuelWarn = 0;
  hudT += dt;
  if (hudT > 0.08) {
    hudT = 0; $('spd').textContent = Math.round(kmh); fuelUI(); $('bEng').classList.toggle('on', running);
    $('gear').textContent = !running ? 'OFF' : sim.reverse ? 'R' : (sim.auto ? 'D' : 'M') + sim.gear;
    const lim = S.rules ? S.rules.limit : 80; $('limit').textContent = lim;
    $('limit').style.borderColor = kmh > lim + 10 ? '#ff1744' : '#d32f2f';
  }
  if (T.drawCluster && S.cam === 0 && S.frame % 3 === 0) T.drawCluster(kmh, sim.rpm, sim.reverse ? 'R' : String(sim.gear), S.rules ? S.rules.limit : 80, prof.redline, S.lights, curCfg().dmg.engine);
  render(true);
}

function placeTruck(dt) {
  T.root.position.set(sim.x, 0, sim.z); T.root.rotation.set(clamp(sim.accel || 0, -5, 3) * 0.004, sim.psi, 0);
  T.trailer.position.set(sim.hitX, 0, sim.hitZ); T.trailer.rotation.set(0, sim.tpsi, 0);
  T.setSteer(sim.steer); wheelAngle += sim.v * dt / WHEEL_R; T.spinWheels(wheelAngle);
  T.setBraking((S.brakeNow || 0) > 0.3 || sim.brake > 0.3);
}
let wheelAngle = 0;

function render(mirrors) {
  const cockpitLike = S.mode === 'drive' && (S.cam === 0 || S.cam === 3);
  world.update(0.016, S.mode === 'show' ? new THREE.Vector3(SX, 0, SZ) : new THREE.Vector3(sim.x, 0, sim.z), camera.position);
  renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = true;
  if (mirrors && S.mode === 'drive' && S.frame % MQ.every === 0) { renderMirrors(); renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = true; }
  renderer.render(scene, camera);
  if (cockpitLike && S.mode === 'drive') drawMirrorOverlay();
}

// showroom frame
function showFrame(dt) {
  const prof = ENGINE_PROFILES[(G.showStats && G.showStats.snd) || curStats().snd] || ENGINE_PROFILES.volvo;
  const idle = prof.idle, target = S.showRev ? idle + (prof.redline - 100 - idle) : (S.showRunning ? idle : 0);
  S.showRpm += (target - S.showRpm) * Math.min(1, dt * (S.showRev ? 2.4 : 1.4));
  const stt = G.showStats || curStats();
  audio.setInterior(S.showCockpit);
  audio.updateEngine(S.showRpm, S.showRev ? 1 : 0, 0, 0, S.showRunning || !!S.showRev, { muffler: stt.muffler, turbo: stt.turboBoost });
  T.spinWheels(0);
  modelGroup.position.set(0, 0, -5.5);
  if (S.showCockpit) {
    SH.rotation.y = 0; SH.updateMatrixWorld(true); tmpV.copy(T.eye); T.root.localToWorld(tmpV); camera.position.copy(tmpV); camera.fov = 72;
    camera.rotation.set(S.look.pitch, S.look.yaw, 0);
    if (T.drawCluster) T.drawCluster(0, S.showRpm, 'N', 80, prof.redline, false, 0);
  } else {
    if (S.orbit.auto) S.orbit.theta += dt * 0.2; SH.rotation.y = 0; camera.fov = 42;
    const r = S.orbit.r, th = S.orbit.theta, ph = S.orbit.phi;
    camera.position.set(SX + r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) + 1.5, SZ + r * Math.sin(ph) * Math.cos(th));
    camera.lookAt(SX, 1.8, SZ);
  }
  camera.updateProjectionMatrix();
  render(false);
}

// ------------------------------------------------------------------ settings applied at run time
function applySettings() {
  const st = save.settings, D = DRAW[clamp(st.draw | 0, 0, 3)];
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, st.res)); renderer.setSize(innerWidth, innerHeight, false);
  const sh = world.sun.shadow;
  world.sun.castShadow = st.shadows > 0;
  if (st.shadows > 0 && sh.mapSize.x !== st.shadows) { sh.mapSize.set(st.shadows, st.shadows); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  camera.far = D.far; camera.updateProjectionMatrix();
  world.sky.scale.setScalar(Math.min(1, D.far * 0.9 / 2400));
  world.setHaze(st.haze * D.fog); world.setWet(st.wet); world.setVegetation(st.veg);
  traffic.setDensity(st.traffic); animals.setLevel(st.animals);
  if (!st.police && police.active) { police.stop(); S.tickets = []; S.heat = 0; $('cop').style.display = 'none'; }
  police.group.visible = !!st.police && S.mode !== 'show';
  MQ = MIRROR_Q[st.mirrorQ] || MIRROR_Q.med;
  for (const side of ['L', 'R']) { mirrorRT[side].setSize(MQ.w, MQ.h); mcam[side].aspect = MQ.w / MQ.h; mcam[side].updateProjectionMatrix(); }
  if (audio) { audio.setVolume(st.vol); audio.setEngineVolume(st.volEng); audio.setSfxVolume(st.volSfx); audio.setMusicVolume(st.volMusic); }
}

// ------------------------------------------------------------------ boot
const G = {
  applySettings, openSettings() {}, setHour(h) { S.hour = h; world.setHour(h); traffic.setNight(world.nightness); },
  save, persist, toast, updateMoney, addMoney, enterShowroom, exitShowroom, requestSensors, applySteerMode, ENGINE_PROFILES,
  fmtP, showStats: null, refreshMusic: () => {}, openShowroom: () => {},
  previewTruck(id, cfg) { G.showStats = rebuildTruck(id, cfg); return G.showStats; },
  setShowCockpit(on) { S.showCockpit = on; T.setCockpit(on); S.look.yaw = 0; S.look.pitch = -0.03; },
  showRev(on) { S.showRev = on ? 1 : 0; if (on) { audio.init(); S.showRunning = true; } },
  setGfx(g) { save.settings.gfx = g; persist(); toast('Graphics will change next time you open the game', 3500); },
  calibrate() { S.tiltOffset = S.tiltRaw; S.gyro = 0; toast('Steering centred', 1200); },
  get audio() { return audio; },
};

async function boot() {
  const bar = $('bar').firstElementChild, step = async p => { bar.style.width = p + '%'; await new Promise(r => setTimeout(r, 25)); };
  await step(5);
  const canvas = $('gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: save.settings.res > 1, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, save.settings.res)); renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 6000); camera.rotation.order = 'YXZ'; scene.add(camera);
  audio = new AudioSys(); audio.setVolume(save.settings.vol);
  await step(15);
  // reflections
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 top = vec3(0.45,0.62,0.85); vec3 hor = vec3(0.95,0.8,0.6); vec3 gnd = vec3(0.35,0.28,0.2); vec3 c = h>0.0 ? mix(hor, top, pow(h,0.6)) : mix(hor*0.7, gnd, min(1.0,-h*3.0)); gl_FragColor = vec4(c,1.0); }' })));
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.04).texture;
  await step(30);
  track = new Track(); world = buildWorld(scene, track, q);
  await step(55);
  rng = mulberry(4242);
  const startS = track.towns[0].s - 150;
  traffic = new Traffic(scene, track, rng, startS); animals = new Animals(scene, track, rng); police = new Police(scene, track);
  await step(70);
  // mirrors
  for (const side of ['L', 'R']) {
    mirrorRT[side] = new THREE.WebGLRenderTarget(MQ.w, MQ.h); mcam[side] = new THREE.PerspectiveCamera(34, 1.5, 0.3, 800); mcam[side].rotation.order = 'YXZ';
    const sc = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: mirrorRT[side].texture, toneMapped: false, side: THREE.DoubleSide }));
    quad.scale.x = -1; quad.position.z = -1; sc.add(quad); mquad[side] = sc;
  }
  ortho.position.z = 1;
  // showroom stage
  SH.position.set(SX, 0, SZ); scene.add(SH); SH.add(modelGroup);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(34, 64), new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.5, metalness: 0.25 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; SH.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(18, 18.3, 96), new THREE.MeshBasicMaterial({ color: 0xffb300 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; SH.add(ring);
  SH.visible = false;
  await step(80);
  // truck + sim
  const p = track.pointAt(startS, LANE); sim = createSim(p.x, p.z, p.psi); sim.auto = !!save.settings.auto;
  S.camPsi = p.psi; S.camPos = new THREE.Vector3(); S.loc = track.locate(sim.x, sim.z, -1); S.hint = S.loc.i; S.rules = { limit: track.limitAt(S.loc.s), kmh: 0 };
  S.mode = 'drive'; wheelAngle = 0;
  rebuildTruck(save.truck, curCfg());
  setupInput(); initUI(G, { onSteerChange: applySteerMode });
  window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  updateMoney(); applySteerMode(); world.setHour(S.hour); traffic.setNight(world.nightness);
  applySettings();
  hideWorld(false); SH.visible = false;
  await step(100);
  const start = $('bStart'); start.style.display = ''; $('bar').style.display = 'none';
  start.addEventListener('click', async () => {
    audio.init(); applySettings();
    try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch (_) {}
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) {}
    $('boot').style.display = 'none'; $('hud').style.display = '';
    toast('Hold GAS to drive. Deliver cargo to ' + track.towns[save.job.to].name + '. Obey the speed limit.', 5000);
    last = performance.now(); requestAnimationFrame(frame);
    setTimeout(toggleEngine, 400);
  });
}
boot().catch(showErr);
