// Pure data + stats. No rendering here.

export const TRUCKS = {
  volvo: {
    id: 'volvo', brand: 'Volvo', model: 'FH Globetrotter', price: 0, color: 0x1d4f91, cab: 'volvo',
    blurb: 'Smooth inline-six D13/D17 engines. Quiet, refined, great on long hauls.',
    engines: [
      { id: 'd13-460', name: 'D13K 460', hp: 460, nm: 2300, price: 0,      snd: 'volvo', layout: 'I6' },
      { id: 'd13-500', name: 'D13K 500', hp: 500, nm: 2500, price: 38000,  snd: 'volvo', layout: 'I6' },
      { id: 'd13-540', name: 'D13K 540', hp: 540, nm: 2800, price: 72000,  snd: 'volvo', layout: 'I6' },
      { id: 'd17-780', name: 'D17K 780 (FH16)', hp: 780, nm: 3800, price: 190000, snd: 'volvo', layout: 'I6' },
    ],
  },
  scania: {
    id: 'scania', brand: 'Scania', model: 'R-Series', price: 260000, color: 0xb71c1c, cab: 'scania',
    blurb: 'Famous for the thunderous V8. Pick the DC16 for that legendary growl.',
    engines: [
      { id: 'dc13-450', name: 'DC13 450', hp: 450, nm: 2350, price: 0,      snd: 'scania6', layout: 'I6' },
      { id: 'dc13-500', name: 'DC13 500', hp: 500, nm: 2550, price: 36000,  snd: 'scania6', layout: 'I6' },
      { id: 'dc16-590', name: 'DC16 590 V8', hp: 590, nm: 3000, price: 110000, snd: 'scania', layout: 'V8' },
      { id: 'dc16-770', name: 'DC16 770 V8', hp: 770, nm: 3700, price: 210000, snd: 'scania', layout: 'V8' },
    ],
  },
  man: {
    id: 'man', brand: 'MAN', model: 'TGX', price: 240000, color: 0x2e7d32, cab: 'man',
    blurb: 'Punchy D26 six-cylinders with a gruff, raspy note and strong mid-range.',
    engines: [
      { id: 'd26-460', name: 'D26 460', hp: 460, nm: 2400, price: 0,      snd: 'man', layout: 'I6' },
      { id: 'd26-520', name: 'D26 520', hp: 520, nm: 2700, price: 40000,  snd: 'man', layout: 'I6' },
      { id: 'd38-640', name: 'D38 640', hp: 640, nm: 3200, price: 150000, snd: 'man', layout: 'I6' },
    ],
  },
};

export const PAINTS = [0x1d4f91, 0xb71c1c, 0x2e7d32, 0xf9a825, 0xffffff, 0x212121, 0x6a1b9a, 0xef6c00, 0x00897b, 0x9e9e9e, 0x4e342e, 0x00bcd4, 0xe91e63, 0x1b5e20];

export const UP = {
  turbo:   [{ name: 'Stock turbo', price: 0, pow: 1.00 }, { name: 'Stage 1', price: 12000, pow: 1.04 }, { name: 'Stage 2', price: 28000, pow: 1.08 }, { name: 'Stage 3', price: 55000, pow: 1.12 }],
  exhaust: [{ name: 'Stock exhaust', price: 0, pow: 1.00, muf: 1.0 }, { name: 'Sport exhaust', price: 9000, pow: 1.015, muf: 1.35 }, { name: 'Open straight-pipe', price: 22000, pow: 1.03, muf: 1.8 }],
  tyres:   [{ name: 'Standard tyres', price: 0, grip: 0.80, sand: 0.50, wear: 1.0 }, { name: 'All-terrain', price: 8000, grip: 0.82, sand: 0.68, wear: 0.8 }, { name: 'Premium grip', price: 16000, grip: 0.92, sand: 0.52, wear: 0.6 }],
  brakes:  [{ name: 'Standard brakes', price: 0, brake: 1.00, retarder: 0 }, { name: 'Sport discs', price: 10000, brake: 1.20, retarder: 0 }, { name: 'Discs + engine retarder', price: 26000, brake: 1.25, retarder: 1 }],
};
export const ACC = [
  { id: 'bull',   name: 'Bull bar', price: 6000 },
  { id: 'roof',   name: 'Roof light bar', price: 4500 },
  { id: 'visor',  name: 'Sun visor', price: 2500 },
  { id: 'stacks', name: 'Chrome exhaust stacks', price: 7000 },
  { id: 'horns',  name: 'Roof air horns', price: 3000 },
];
export const REPAIR_RATE = { engine: 900, tyres: 600, body: 700 }; // P per 1 % (rate x damage%)
export const START_MONEY = 400000;

export const GEARS = [14.94, 11.73, 9.02, 7.09, 5.43, 4.27, 3.44, 2.70, 2.08, 1.64, 1.26, 1.0];
export const FINAL_DRIVE = 2.64;
export const WHEEL_R = 0.52;

export function defaultConfig(id) {
  const t = TRUCKS[id];
  return {
    engine: t.engines[0].id, turbo: 0, exhaust: 0, tyres: 0, brakes: 0,
    paint: t.color, trailerPaint: 0xe0e0e0, acc: {},
    dmg: { engine: 0, tyres: 0, body: 0 },
  };
}

export function getEngine(id, cfg) { const t = TRUCKS[id]; return t.engines.find(e => e.id === cfg.engine) || t.engines[0]; }

export function computeStats(id, cfg) {
  const e = getEngine(id, cfg), tu = UP.turbo[cfg.turbo | 0], ex = UP.exhaust[cfg.exhaust | 0], ty = UP.tyres[cfg.tyres | 0], br = UP.brakes[cfg.brakes | 0];
  const eng = 1 - 0.5 * Math.min(1, (cfg.dmg.engine || 0) / 100);
  const mult = tu.pow * ex.pow * eng;
  const tyD = 1 - 0.35 * Math.min(1, (cfg.dmg.tyres || 0) / 100);
  return {
    engineName: e.name, hp: Math.round(e.hp * mult), nm: Math.round(e.nm * mult), snd: e.snd,
    turboBoost: 1 + 0.45 * (cfg.turbo | 0), muffler: ex.muf,
    grip: ty.grip * tyD, sandGrip: ty.sand * tyD, tyreWear: ty.wear,
    brake: br.brake, retarder: br.retarder,
    mass: 37000 + (e.hp > 700 ? 600 : 0),
  };
}

export function totalDamage(cfg) { const d = cfg.dmg; return Math.round((d.engine + d.tyres + d.body) / 3); }
export function repairCost(cfg, part) {
  const d = cfg.dmg;
  if (part) return Math.round(d[part] * REPAIR_RATE[part]);
  return Math.round(d.engine * REPAIR_RATE.engine + d.tyres * REPAIR_RATE.tyres + d.body * REPAIR_RATE.body);
}

// Engine torque curve (0..1 of peak torque), diesel-like: strong from 1000 to 1500 rpm
export function torqueFactor(rpm, idle, red) {
  if (rpm < idle) return 0.55;
  if (rpm < 1000) return 0.55 + 0.45 * (rpm - idle) / (1000 - idle);
  if (rpm <= 1500) return 1.0;
  if (rpm <= red) return 1.0 - 0.38 * (rpm - 1500) / (red - 1500);
  return Math.max(0, 0.62 - (rpm - red) * 0.01);
}
