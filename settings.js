// Settings menu: controls, graphics, traffic, sound and game options. Everything is saved and most options apply at once.
import { FUEL_MODES } from './fuel.js';

export const DEFAULTS = {
  steer: 'arrows', sens: 1.2, gfx: 'med', vol: 0.8, auto: true, invert: false,
  res: 1.5, shadows: 1024, draw: 1, veg: 0.7, haze: 1, wet: 0.15, mirrorQ: 'med',
  traffic: 0.6, animals: 1, police: true, todSph: 70, fuelMode: 'normal',
  volEng: 1, volSfx: 1, volMusic: 0.7,
};
export const PRESETS = {
  low:   { res: 1,   shadows: 0,    draw: 0, veg: 0.3, haze: 1,   wet: 0.1,  mirrorQ: 'low' },
  med:   { res: 1.5, shadows: 1024, draw: 1, veg: 0.7, haze: 1,   wet: 0.15, mirrorQ: 'med' },
  high:  { res: 2,   shadows: 2048, draw: 2, veg: 1,   haze: 1,   wet: 0.3,  mirrorQ: 'high' },
  ultra: { res: 2.5, shadows: 2048, draw: 3, veg: 1,   haze: 1.25, wet: 0.5, mirrorQ: 'high' },
};
export const DRAW = [{ far: 700, fog: 3.4 }, { far: 1500, fog: 2 }, { far: 3200, fog: 1 }, { far: 6000, fog: 1 }];
export const MIRROR_Q = { low: { w: 256, h: 170, every: 4 }, med: { w: 384, h: 256, every: 3 }, high: { w: 512, h: 340, every: 2 } };

const $ = id => document.getElementById(id);
const TIMES = { Morning: 7.5, Midday: 12, Evening: 17.6, Night: 22 };

export function initSettings(G, opts) {
  const st = G.save.settings;
  for (const k in DEFAULTS) if (st[k] === undefined) st[k] = DEFAULTS[k];
  const css = document.createElement('style');
  css.textContent = `
    #pSet .panel{max-height:92vh}
    .set{margin:10px 0}.set .lab{font-size:12.5px;opacity:.8;margin-bottom:5px;display:flex;justify-content:space-between;gap:8px}
    .seg{display:flex;flex-wrap:wrap;gap:6px}.seg .btn{flex:1 1 auto;min-height:38px;padding:7px 10px;font-size:13px}
    .note{font-size:12px;opacity:.65;margin:6px 0}
    #setTabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px}#setTabs .btn{flex:1 1 auto;min-height:38px;padding:7px 10px;font-size:13px}
    #setFoot{display:flex;gap:8px;margin-top:12px;position:sticky;bottom:0;background:#10161e;padding:8px 0}#setFoot .btn{flex:1}
  `;
  document.head.appendChild(css);
  const panel = document.querySelector('#pSet .panel');
  panel.innerHTML = '<h2>Settings</h2><div id="setTabs"></div><div id="setBody"></div><div id="setFoot"><button class="btn" id="bCloseSet">Close</button></div>';
  let tab = 'Controls';
  const TABS = ['Controls', 'Graphics', 'Traffic', 'Sound', 'Game'];
  const eq = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-6 : a === b;
  const seg = (key, label, items) => `<div class="set"><div class="lab"><span>${label}</span></div><div class="seg">${items.map(([l, v]) => `<button class="btn ${eq(st[key], v) ? 'on' : ''}" data-set="${key}" data-v='${JSON.stringify(v)}'>${l}</button>`).join('')}</div></div>`;
  const slider = (key, label, min, max, step, fmt) => `<div class="set"><div class="lab"><span>${label}</span><span id="sv_${key}">${fmt(st[key])}</span></div><input type="range" data-slider="${key}" min="${min}" max="${max}" step="${step}" value="${st[key]}"></div>`;
  const toggle = (key, label, on, off) => `<div class="set"><button class="btn ${st[key] ? 'on' : ''}" data-toggle="${key}" style="width:100%">${st[key] ? on : off}</button></div>`;
  const pct = v => Math.round(v * 100) + '%';

  const pages = {
    Controls: () =>
      seg('steer', 'Steering', [['Wheel', 'wheel'], ['Arrows', 'arrows'], ['Tilt', 'tilt'], ['Gyro', 'gyro']]) +
      slider('sens', 'Tilt / gyro sensitivity', 0.5, 2.5, 0.1, v => (+v).toFixed(1)) +
      '<div class="seg"><button class="btn" data-act="cal">Centre steering</button></div>' +
      toggle('invert', '', 'Tilt direction: reversed', 'Tilt direction: normal') +
      toggle('auto', '', 'Gearbox: automatic', 'Gearbox: manual (use G+ and G-)') +
      '<p class="note">Tilt and gyro: hold the phone like a steering wheel and tap Centre steering. If it turns the wrong way, switch the tilt direction.</p>',
    Graphics: () =>
      seg('gfx', 'Quality preset', [['Low', 'low'], ['Medium', 'med'], ['High', 'high'], ['Ultra', 'ultra']]) +
      seg('res', 'Sharpness (resolution)', [['Low', 1], ['Medium', 1.5], ['High', 2], ['Max', 2.5]]) +
      seg('shadows', 'Shadows', [['Off', 0], ['Low', 512], ['Medium', 1024], ['High', 2048]]) +
      seg('draw', 'View distance', [['Short', 0], ['Medium', 1], ['Long', 2], ['Max', 3]]) +
      slider('veg', 'Trees, bushes and grass', 0, 1, 0.05, pct) +
      seg('haze', 'Haze in the distance', [['Clear', 0.4], ['Light', 0.8], ['Normal', 1], ['Heavy', 1.8]]) +
      seg('wet', 'Road surface', [['Dry', 0], ['Damp', 0.3], ['Wet', 0.6], ['Soaked', 0.9]]) +
      seg('mirrorQ', 'Mirror quality', [['Low', 'low'], ['Medium', 'med'], ['High', 'high']]) +
      '<p class="note">Higher settings look better but use more battery and can slow older phones. Start with Medium and go up.</p>',
    Traffic: () =>
      seg('traffic', 'Traffic', [['None', 0], ['Light', 0.25], ['Normal', 0.6], ['Heavy', 0.85], ['Rush hour', 1]]) +
      seg('animals', 'Cattle, donkeys and goats', [['None', 0], ['Few', 0.4], ['Normal', 1]]) +
      seg('police', 'Police and fines', [['On', true], ['Off', false]]) +
      seg('todSph', 'Day and night speed', [['Frozen', 0], ['Slow', 240], ['Normal', 70], ['Fast', 20]]) +
      '<div class="set"><div class="lab"><span>Set the time of day</span></div><div class="seg">' + Object.keys(TIMES).map(k => `<button class="btn" data-act="time" data-v="${TIMES[k]}">${k}</button>`).join('') + '</div></div>',
    Sound: () =>
      slider('vol', 'Master volume', 0, 1, 0.05, pct) + slider('volEng', 'Engine', 0, 1.5, 0.05, pct) +
      slider('volSfx', 'Horn, brakes and other sounds', 0, 1.5, 0.05, pct) + slider('volMusic', 'Music', 0, 1, 0.05, pct),
    Game: () => {
      const s = G.save.stats || {};
      return seg('fuelMode', 'Fuel use', [['Off', 'off'], ['Easy', 'easy'], ['Normal', 'normal'], ['Hard', 'hard']]) +
        `<p class="note">Normal: a full tank lasts about 5 laps of the route. Fuel stations are in every town, on the left. Switch the engine off to refuel.</p>
         <div class="set"><div class="lab"><span>Deliveries ${s.delivered || 0} &nbsp; Earned ${G.fmtP(s.earned || 0)} &nbsp; Fines ${G.fmtP(s.fines || 0)}</span></div></div>
         <div class="set"><button class="btn" data-act="reset" style="width:100%">${resetArm ? 'Tap again to erase everything' : 'Reset game and save'}</button></div>`;
    },
  };
  let resetArm = false;
  function render() {
    const body = $('setBody'), keep = panel.scrollTop;
    $('setTabs').innerHTML = TABS.map(t => `<button class="btn ${t === tab ? 'on' : ''}" data-tab="${t}">${t}</button>`).join('');
    body.innerHTML = pages[tab]();
    panel.scrollTop = keep;
  }

  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'bCloseSet') { G.persist(); $('pSet').classList.remove('show'); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; resetArm = false; render(); return; }
    if (b.dataset.set) {
      const key = b.dataset.set, v = JSON.parse(b.dataset.v);
      if (key === 'gfx') { Object.assign(st, PRESETS[v], { gfx: v }); G.persist(); G.applySettings(); render(); G.toast('Graphics: ' + v, 1200); return; }
      st[key] = v; if (['res', 'shadows', 'draw', 'veg', 'haze', 'wet', 'mirrorQ'].includes(key)) st.gfx = 'custom';
      G.persist(); G.applySettings(key);
      if (key === 'steer') { opts.onSteerChange(); if (v === 'tilt' || v === 'gyro') G.toast('Hold the phone like a steering wheel, then tap Centre steering.', 4500); }
      render(); return;
    }
    if (b.dataset.toggle) { const k = b.dataset.toggle; st[k] = !st[k]; G.persist(); G.applySettings(k); render(); return; }
    const act = b.dataset.act; if (!act) return;
    if (act === 'cal') G.calibrate();
    if (act === 'time') { G.setHour(+b.dataset.v); G.toast('Time set', 1000); }
    if (act === 'reset') { if (!resetArm) { resetArm = true; render(); return; } try { localStorage.removeItem('bwt-save-v1'); } catch (_) {} location.reload(); }
  });
  panel.addEventListener('input', e => {
    const r = e.target.closest('[data-slider]'); if (!r) return;
    const key = r.dataset.slider, v = +r.value; st[key] = v; if (key === 'veg') st.gfx = 'custom';
    const lab = $('sv_' + key); if (lab) lab.textContent = key === 'sens' ? v.toFixed(1) : Math.round(v * 100) + '%';
    G.applySettings(key);
  });
  panel.addEventListener('change', e => { if (e.target.closest('[data-slider]')) G.persist(); });
  $('pSet').addEventListener('click', e => { if (e.target.id === 'pSet') { G.persist(); $('pSet').classList.remove('show'); } });
  G.openSettings = () => { resetArm = false; render(); $('pSet').classList.add('show'); };
  render();
}
