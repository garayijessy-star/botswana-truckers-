// Pure vehicle simulation (tractor + semi-trailer). Forward is (-sin psi, -cos psi).
import { GEARS, FINAL_DRIVE, WHEEL_R, torqueFactor } from './truckdata.js';

export const WHEELBASE = 3.8, TRAILER_L = 11.2, HITCH = 1.3, VMAX = 30.5;
const G = 9.81;

export function createSim(x = 0, z = 0, psi = 0) {
  return { x, z, psi, tpsi: psi, v: 0, steer: 0, gear: 1, rpm: 650, shiftT: 0, reverse: false, auto: true, throttle: 0, brake: 0, load: 0, hitX: x, hitZ: z, slip: 0, jack: 0, vy: 0 };
}

const CRR = { road: 0.007, shoulder: 0.03, sand: 0.11 };

// in: {throttle 0..1, brake 0..1, steer -1..1}; env: {surface, idle, redline}; stats from computeStats
export function stepSim(s, dt, inp, env, st) {
  const idle = env.idle || 650, red = env.redline || 2000;
  s.throttle += (inp.throttle - s.throttle) * Math.min(1, dt * 8);
  s.brake += (inp.brake - s.brake) * Math.min(1, dt * 10);
  const surf = env.surface || 'road';
  const grip = (surf === 'road' ? st.grip : surf === 'shoulder' ? st.grip * 0.78 : st.sandGrip) * (env.wet ? 0.8 : 1);

  // --- gearbox ---
  s.shiftT = Math.max(0, s.shiftT - dt);
  const ratio = (g) => GEARS[Math.max(0, Math.min(11, g - 1))] * FINAL_DRIVE;
  const dir = s.reverse ? -1 : 1;
  if (s.auto && s.shiftT <= 0 && !s.reverse) {
    const wheelRpm = (Math.abs(s.v) / WHEEL_R) * ratio(s.gear) * 60 / (2 * Math.PI);
    if (wheelRpm > 1560 + s.throttle * 220 && s.gear < 12) { s.gear++; s.shiftT = 0.35; s.shifted = 1; }
    else if (wheelRpm < 880 && s.gear > 1 && Math.abs(s.v) > 0.2) { s.gear--; s.shiftT = 0.3; s.shifted = -1; }
  }
  if (s.reverse) s.gear = 1;
  const rt = ratio(s.gear);
  const wheelRpm = (Math.abs(s.v) / WHEEL_R) * rt * 60 / (2 * Math.PI);
  const slipRpm = idle + s.throttle * 500;
  s.rpm = Math.max(slipRpm, Math.min(red + 150, wheelRpm));
  if (wheelRpm < slipRpm) s.rpm = idle + (slipRpm - idle) * (1 - Math.min(1, wheelRpm / slipRpm) * 0.5);

  // --- longitudinal forces ---
  const m = st.mass;
  let F = 0;
  if (s.shiftT <= 0 && s.rpm < red + 100 && Math.abs(s.v) < (s.reverse ? 6 : VMAX)) {
    const T = st.nm * s.throttle * torqueFactor(s.rpm, idle, red);
    F = (T * rt * 0.88) / WHEEL_R * dir * (s.reverse ? 0.5 : 1);
  }
  const maxTrac = grip * m * G * 0.30;
  F = Math.max(-maxTrac, Math.min(maxTrac, F));
  s.slip = Math.abs(F) >= maxTrac * 0.99 ? 1 : 0;
  const sg = Math.sign(s.v) || dir;
  const drag = 3.3 * s.v * Math.abs(s.v);
  const roll = CRR[surf] * m * G * sg;
  const eb = (s.throttle < 0.05 ? (0.55 + 0.9 * st.retarder) * (s.rpm / 1500) * 1000 : 0) * 12 * sg;   // engine / retarder braking
  let brakeF = s.brake * st.brake * 6.0 * m * Math.min(1, grip / 0.8 + 0.1) * sg;
  brakeF = Math.min(Math.abs(brakeF), maxTrac * 2.1 + 1) * sg;
  let net = F - drag - roll - eb - brakeF;
  let a = net / m;
  const v0 = s.v;
  s.v += a * dt;
  // brakes/drag/rolling can stop the truck but never reverse it by themselves
  if (v0 !== 0 && Math.sign(s.v) !== Math.sign(v0) && Math.abs(F) < Math.abs(drag + roll + eb + brakeF)) s.v = 0;
  if (!s.reverse && s.v < 0 && inp.throttle === 0) s.v = Math.max(s.v, 0);
  s.accel = a;

  // --- steering ---
  const maxSteer = 0.36 / (1 + Math.pow(Math.abs(s.v) / 10, 2));
  const tgt = inp.steer * maxSteer;
  s.steer += (tgt - s.steer) * Math.min(1, dt * (Math.abs(inp.steer) > 0.01 ? 5 : 7));
  let yaw = -(s.v / WHEELBASE) * Math.tan(s.steer);   // steer > 0 = turn RIGHT (psi decreases)
  const latA = Math.abs(s.v * yaw), limit = grip * G * 0.55;
  if (latA > limit) { const k = limit / latA; yaw *= k; s.v *= 1 - 0.15 * dt * (1 - k); s.slip = 1; }
  s.psi += yaw * dt;
  s.x += -Math.sin(s.psi) * s.v * dt; s.z += -Math.cos(s.psi) * s.v * dt;

  // --- trailer ---
  const hx = s.x + HITCH * Math.sin(s.psi), hz = s.z + HITCH * Math.cos(s.psi);
  let rel = s.psi - s.tpsi; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  s.tpsi += (s.v / TRAILER_L) * Math.sin(rel) * dt;
  rel = s.psi - s.tpsi; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  s.jack = Math.abs(rel); s.hitX = hx; s.hitZ = hz;
  if (s.jack > 1.15) { s.tpsi = s.psi - Math.sign(rel) * 1.15; s.jack = 1.15; }
  return s;
}

// where the trailer's rear and axle centre are (for collisions / lane checks)
export function trailerPoint(s, d) { return { x: s.hitX + Math.sin(s.tpsi) * d, z: s.hitZ + Math.cos(s.tpsi) * d }; }
export function forward(s) { return { x: -Math.sin(s.psi), z: -Math.cos(s.psi) }; }
