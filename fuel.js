// Fuel model (pure maths, no rendering). Diesel flow follows engine power; the game world is compressed
// (a lap is ~12 km), so the use rate is multiplied so that fuel stops matter during play.
export const TANK_L = 300;
export const FUEL_MODES = { off: 0, easy: 8, normal: 15, hard: 25 };
export const PUMP_LPS = 7;                // litres per second at the pump
export const CALLOUT_FEE = 1500, CALLOUT_L = 40;
const PRICES = [15.1, 14.8, 15.6, 14.9, 16.2, 15.4];   // Pula per litre, per town

export function dieselPrice(townIdx) { return PRICES[townIdx % PRICES.length]; }

// litres per second (real-world rate before the game multiplier)
export function fuelFlow(hp, throttle, rpm, running) {
  if (!running) return 0;
  return 0.0008 + throttle * Math.min(1.2, rpm / 2000) * hp * 0.00006;
}

export const STATION_OFFSET = -120;       // station sits this far before the town centre
export function stationS(track, i) { return track.towns[i].s + STATION_OFFSET; }

// index of the fuel station whose apron the truck is on, or -1
export function stationAt(track, s, lat) {
  if (lat < 2.5 || lat > 26) return -1;
  for (let i = 0; i < track.towns.length; i++) if (Math.abs(track.ds(stationS(track, i), s)) < 24) return i;
  return -1;
}

// distance (m) and index of the next station ahead
export function nextStation(track, s) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < track.towns.length; i++) { const d = track.wrap(stationS(track, i) - s); if (d < bd) { bd = d; best = i; } }
  return { i: best, d: bd };
}
