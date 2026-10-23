import { TRUCKS, PAINTS, UP, ACC, defaultConfig, computeStats, totalDamage, repairCost } from './truckdata.js';

const $ = id => document.getElementById(id);
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');
const newOwn = id => ({ eng: { [TRUCKS[id].engines[0].id]: 1 }, turbo: { 0: 1 }, exhaust: { 0: 1 }, tyres: { 0: 1 }, brakes: { 0: 1 }, acc: {}, paint: { [TRUCKS[id].color]: 1 }, tpaint: { 14737632: 1 } });
const TRAILER_COLOURS = [0xe0e0e0, 0xffffff, 0x1565c0, 0xb71c1c, 0x2e7d32, 0xf9a825, 0x424242, 0x75aadb];

export function initUI(G, opts) {
  const save = G.save;
  const css = document.createElement('style');
  css.textContent = `
    #pShow{background:none;justify-content:flex-end;align-items:stretch;pointer-events:none}
    #pShow .panel{pointer-events:auto;width:min(50vw,450px);max-height:none;height:100%;border-radius:0;border-width:0 0 0 1px;padding-bottom:calc(14px + env(safe-area-inset-bottom))}
    @media (orientation:portrait){#pShow{align-items:flex-end;justify-content:center}#pShow .panel{width:100vw;height:52vh;border-radius:16px 16px 0 0}}
    .tabs{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap}.tabs .btn{flex:1 1 auto;padding:8px 10px;min-height:40px}
    .card{border:1px solid var(--line);border-radius:12px;padding:10px;margin:8px 0;background:rgba(255,255,255,.03)}
    .card.sel{border-color:var(--accent)}
    .card h4{margin:0 0 2px;font-size:15px}.card p{margin:2px 0 8px;font-size:12.5px;opacity:.75}
    .sw{width:30px;height:30px;border-radius:50%;border:2px solid #555;padding:0;min-width:0;min-height:0}.sw.on{border-color:#fff;box-shadow:0 0 0 2px var(--accent)}
    .swrow{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}
    .bar{height:8px;border-radius:5px;background:#2a3340;overflow:hidden;margin:4px 0}.bar i{display:block;height:100%;background:var(--accent)}
    .stat{font-size:13px;opacity:.9;margin:4px 0}.money{font-weight:800;color:var(--accent)}
    .foot{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;position:sticky;bottom:0;background:#10161e;padding:8px 0}
    .foot .btn{flex:1 1 40%}
    .btn.small{min-height:36px;padding:6px 10px;font-size:13px}
  `;
  document.head.appendChild(css);

  // ======================================================== SHOWROOM
  const view = { id: save.truck, tab: 'trucks', temp: {}, stats: null, inside: false };
  const owned = id => !!save.trucks[id];
  const cfgFor = id => owned(id) ? save.trucks[id].cfg : (view.temp[id] || (view.temp[id] = defaultConfig(id)));
  const ownOf = id => save.trucks[id].own;
  function preview() { view.stats = G.previewTruck(view.id, cfgFor(view.id)); }
  function changed() { G.persist(); G.updateMoney(); preview(); renderShow(); }
  function spend(price) { if (save.money < price) { G.toast('Not enough money. Deliver more cargo.'); return false; } G.addMoney(-price); return true; }

  function renderShow() {
    const id = view.id, t = TRUCKS[id], cfg = cfgFor(id), has = owned(id), st = view.stats || computeStats(id, cfg), own = has ? ownOf(id) : null;
    let h = `<div class="stat"><span class="money">${G.fmtP(save.money)}</span> &nbsp; ${t.brand} ${t.model}${has ? '' : ' (not owned)'}</div>
      <div class="stat">${st.engineName} &middot; ${st.hp} hp &middot; ${st.nm} Nm &middot; damage ${totalDamage(cfg)}%</div>
      <div class="tabs">${['trucks', 'engine', 'parts', 'paint', 'repair'].map(k => `<button class="btn ${view.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`;
    if (view.tab === 'trucks') {
      for (const k of Object.keys(TRUCKS)) {
        const x = TRUCKS[k], o = owned(k), cur = save.truck === k;
        h += `<div class="card ${view.id === k ? 'sel' : ''}"><h4>${x.brand} ${x.model}</h4><p>${x.blurb}</p>
          <div class="row2"><button class="btn small" data-act="look" data-id="${k}">View</button>
          ${o ? (cur ? '<button class="btn small on">In use</button>' : `<button class="btn small" data-act="use" data-id="${k}">Use this truck</button>`) : `<button class="btn small" data-act="buyTruck" data-id="${k}">Buy ${G.fmtP(x.price)}</button>`}</div></div>`;
      }
    } else if (!has) {
      h += `<div class="card"><p>You need to buy this ${t.brand} first. Open the Trucks tab.</p></div>`;
    } else if (view.tab === 'engine') {
      for (const e of t.engines) {
        const o = !!own.eng[e.id], cur = cfg.engine === e.id;
        h += `<div class="card ${cur ? 'sel' : ''}"><h4>${e.name}</h4><p>${e.hp} hp &middot; ${e.nm} Nm &middot; ${e.layout}</p>
          <div class="bar"><i style="width:${Math.round(e.hp / 8)}%"></i></div>
          ${cur ? '<button class="btn small on">Fitted</button>' : `<button class="btn small" data-act="eng" data-id="${e.id}">${o ? 'Fit engine' : 'Buy ' + G.fmtP(e.price)}</button>`}</div>`;
      }
      h += '<p class="stat">Tip: use Hold to rev below to hear each engine.</p>';
    } else if (view.tab === 'parts') {
      for (const [part, label] of [['turbo', 'Turbo'], ['exhaust', 'Exhaust'], ['tyres', 'Tyres'], ['brakes', 'Brakes']]) {
        h += `<h3>${label}</h3>`;
        UP[part].forEach((u, i) => {
          const o = !!own[part][i], cur = (cfg[part] | 0) === i;
          h += `<div class="item"><div>${u.name}<small>${i === 0 ? 'Included' : G.fmtP(u.price)}</small></div>${cur ? '<button class="btn small on">Fitted</button>' : `<button class="btn small" data-act="part" data-p="${part}" data-i="${i}">${o ? 'Fit' : 'Buy'}</button>`}</div>`;
        });
      }
      h += '<h3>Accessories</h3>';
      for (const a of ACC) { const o = !!own.acc[a.id], on = !!cfg.acc[a.id]; h += `<div class="item"><div>${a.name}<small>${G.fmtP(a.price)}</small></div><button class="btn small ${on ? 'on' : ''}" data-act="acc" data-id="${a.id}">${on ? 'Fitted' : (o ? 'Fit' : 'Buy')}</button></div>`; }
    } else if (view.tab === 'paint') {
      h += '<h3>Cab colour (P 500 each new colour)</h3><div class="swrow">' + PAINTS.map(c => `<button class="sw ${cfg.paint === c ? 'on' : ''}" style="background:${hex(c)}" data-act="paint" data-c="${c}" aria-label="Cab colour"></button>`).join('') + '</div>';
      h += '<h3>Trailer colour (P 300 each new colour)</h3><div class="swrow">' + TRAILER_COLOURS.map(c => `<button class="sw ${cfg.trailerPaint === c ? 'on' : ''}" style="background:${hex(c)}" data-act="tpaint" data-c="${c}" aria-label="Trailer colour"></button>`).join('') + '</div>';
    } else if (view.tab === 'repair') {
      for (const [p, label] of [['engine', 'Engine'], ['tyres', 'Tyres'], ['body', 'Body and paint']]) {
        const d = Math.round(cfg.dmg[p]), cost = repairCost(cfg, p);
        h += `<div class="card"><h4>${label}: ${d}% damaged</h4><div class="bar"><i style="width:${d}%;background:${d > 60 ? '#ff5252' : d > 30 ? '#ffb300' : '#4caf50'}"></i></div>
          <button class="btn small" data-act="repair" data-p="${p}" ${d < 1 ? 'disabled' : ''}>${d < 1 ? 'Perfect' : 'Repair ' + G.fmtP(cost)}</button></div>`;
      }
      const all = repairCost(cfg);
      h += `<button class="btn" data-act="repairAll" ${all < 1 ? 'disabled' : ''}>Repair everything ${all < 1 ? '' : G.fmtP(all)}</button>`;
    }
    h += `<div class="foot"><button class="btn" id="shRev">Hold to rev</button><button class="btn ${view.inside ? 'on' : ''}" data-act="inside">${view.inside ? 'Outside view' : 'Inside cab'}</button><button class="btn" data-act="exit">Back to the road</button></div>`;
    const body = $('showBody'), keep = body.scrollTop; body.innerHTML = h; body.scrollTop = keep;
    const rev = $('shRev'), on = e => { e.preventDefault(); G.showRev(true); rev.classList.add('on'); }, off = () => { G.showRev(false); rev.classList.remove('on'); };
    rev.addEventListener('pointerdown', on); rev.addEventListener('pointerup', off); rev.addEventListener('pointercancel', off); rev.addEventListener('pointerleave', off);
  }

  $('showBody').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = view.id, d = b.dataset; G.audio.init();
    if (act === 'tab') { view.tab = d.v; renderShow(); return; }
    if (act === 'exit') { G.showRev(false); G.exitShowroom(); return; }
    if (act === 'inside') { view.inside = !view.inside; G.setShowCockpit(view.inside); renderShow(); return; }
    if (act === 'look') { view.id = d.id; view.inside = false; G.setShowCockpit(false); preview(); renderShow(); return; }
    if (act === 'buyTruck') { const t = TRUCKS[d.id]; if (!spend(t.price)) return; save.trucks[d.id] = { cfg: defaultConfig(d.id), own: newOwn(d.id) }; G.audio.coin(); G.toast('You bought the ' + t.brand + ' ' + t.model); changed(); return; }
    if (act === 'use') { if (!owned(d.id)) return; save.truck = d.id; G.toast('Now driving the ' + TRUCKS[d.id].brand); changed(); return; }
    if (!owned(id)) return;
    const cfg = save.trucks[id].cfg, own = ownOf(id);
    if (act === 'eng') { const e = TRUCKS[id].engines.find(x => x.id === d.id); if (!own.eng[e.id]) { if (!spend(e.price)) return; own.eng[e.id] = 1; G.audio.coin(); } cfg.engine = e.id; G.audio.clunk(); changed(); return; }
    if (act === 'part') { const i = +d.i, u = UP[d.p][i]; if (!own[d.p][i]) { if (!spend(u.price)) return; own[d.p][i] = 1; G.audio.coin(); } cfg[d.p] = i; G.audio.clunk(); changed(); return; }
    if (act === 'acc') { const a = ACC.find(x => x.id === d.id); if (!own.acc[a.id]) { if (!spend(a.price)) return; own.acc[a.id] = 1; G.audio.coin(); cfg.acc[a.id] = true; } else cfg.acc[a.id] = !cfg.acc[a.id]; changed(); return; }
    if (act === 'paint') { const c = +d.c; if (!own.paint[c]) { if (!spend(500)) return; own.paint[c] = 1; } cfg.paint = c; changed(); return; }
    if (act === 'tpaint') { const c = +d.c; if (!own.tpaint[c]) { if (!spend(300)) return; own.tpaint[c] = 1; } cfg.trailerPaint = c; changed(); return; }
    if (act === 'repair') { const cost = repairCost(cfg, d.p); if (!spend(cost)) return; cfg.dmg[d.p] = 0; G.audio.clunk(); G.toast('Repaired'); changed(); return; }
    if (act === 'repairAll') { const cost = repairCost(cfg); if (!spend(cost)) return; cfg.dmg = { engine: 0, tyres: 0, body: 0 }; G.audio.clunk(); G.toast('Everything repaired'); changed(); return; }
  });
  G.openShowroom = () => { view.id = save.truck; view.tab = 'trucks'; view.inside = false; G.setShowCockpit(false); preview(); renderShow(); };

  // ======================================================== SETTINGS
  const st = save.settings;
  const markSteer = () => document.querySelectorAll('[data-steer]').forEach(b => b.classList.toggle('on', b.dataset.steer === st.steer));
  document.querySelectorAll('[data-steer]').forEach(b => b.addEventListener('click', () => { st.steer = b.dataset.steer; G.persist(); markSteer(); opts.onSteerChange(); if (st.steer === 'tilt' || st.steer === 'gyro') G.toast('Hold the phone like a steering wheel. Tap Centre steering to calibrate.', 4500); }));
  markSteer();
  $('sens').value = st.sens; $('sens').addEventListener('input', e => { st.sens = +e.target.value; });
  $('gfx').value = st.gfx; $('gfx').addEventListener('change', e => G.setGfx(e.target.value));
  $('vol').value = st.vol; $('vol').addEventListener('input', e => { st.vol = +e.target.value; G.audio.setVolume(st.vol); });
  const autoB = $('bAuto'), markAuto = () => { autoB.textContent = st.auto ? 'Automatic gearbox' : 'Manual gearbox (use G+ and G−)'; autoB.classList.toggle('on', !!st.auto); };
  autoB.addEventListener('click', () => { st.auto = !st.auto; markAuto(); G.persist(); }); markAuto();
  const extra = document.createElement('div'); extra.className = 'row2'; extra.style.marginTop = '8px';
  extra.innerHTML = '<button class="btn" id="bInvert">Reverse tilt direction</button><button class="btn" id="bCal">Centre steering</button>';
  $('bAuto').parentElement.after(extra);
  const inv = $('bInvert'), markInv = () => inv.classList.toggle('on', !!st.invert);
  inv.addEventListener('click', () => { st.invert = !st.invert; markInv(); G.persist(); }); markInv();
  $('bCal').addEventListener('click', () => G.calibrate());
  $('bCloseSet').addEventListener('click', () => { G.persist(); $('pSet').classList.remove('show'); });
  $('bResetSave').addEventListener('click', () => { try { localStorage.removeItem('bwt-save-v1'); } catch (_) {} location.reload(); });

  // ======================================================== MUSIC
  const au = G.audio;
  function renderMusic() {
    const list = $('playlist'); list.innerHTML = '';
    au.playlist.forEach((p, i) => { const d = document.createElement('div'); d.className = 'item' + (i === au.cur ? ' cur' : ''); d.textContent = p.name; d.addEventListener('click', () => au.play(i)); list.appendChild(d); });
    const p = au.playlist[au.cur]; $('mNow').textContent = p ? '♪ ' + p.name : 'No song loaded. Tap Add songs.';
    $('mShuf').classList.toggle('on', !!au.shuffle);
  }
  au.onTrack = renderMusic; G.refreshMusic = renderMusic;
  $('mAdd').addEventListener('click', () => { au.init(); $('mFile').click(); });
  $('mFile').addEventListener('change', async e => { await au.addFiles(e.target.files); au.play(); renderMusic(); e.target.value = ''; });
  $('mPlay').addEventListener('click', () => { au.init(); if (!au.playlist.length) $('mFile').click(); else au.toggle(); });
  $('mNext').addEventListener('click', () => { au.init(); au.next(); });
  $('mPrev').addEventListener('click', () => { au.init(); au.prev(); });
  $('mShuf').addEventListener('click', () => { au.shuffle = !au.shuffle; renderMusic(); });
  $('mClear').addEventListener('click', () => au.clear());
  $('mVol').addEventListener('input', e => au.setMusicVolume(+e.target.value));
  $('mSeek').addEventListener('input', e => { if (au.el && au.el.duration) au.el.currentTime = (+e.target.value / 1000) * au.el.duration; });
  $('mClose').addEventListener('click', () => $('pMusic').classList.remove('show'));
  setInterval(() => { if (au.el && au.el.duration && $('pMusic').classList.contains('show')) $('mSeek').value = Math.round(au.el.currentTime / au.el.duration * 1000); }, 500);
  for (const id of ['pSet', 'pMusic']) $(id).addEventListener('click', e => { if (e.target.id === id) $(id).classList.remove('show'); });
  renderMusic();
}
