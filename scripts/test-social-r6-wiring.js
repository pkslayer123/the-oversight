// BREAK-IT social r6 (2026-10-09): SOCIAL WIRING check (the Alien Players lesson).
// 1. conversation.js, drama.js, justice.js, betrayal.js all in index.html in eval order.
// 2. Each has a valid @ontology header (validate-ontology.js covers it — quick header presence here).
// 3. One real function from each is reachable at runtime in the node harness
//    (drama.js is DOM-only — excluded from node eval per AGENTS.md — so it gets
//    a static wiring check: loaded in index.html + Game.drama defined + the
//    'social' verb the moot emits has a handler).
// Run: node scripts/test-social-r6-wiring.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

// --- 1. index.html script order
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(src\/js\/[^"]+)"/g)].map(m => m[1].split('?')[0]);
const mods = ['src/js/conversation.js', 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/drama.js'];
const idx = mods.map(m => scripts.indexOf(m));
check('all four social modules in index.html', idx.every(i => i >= 0), idx.join(','));
check('eval order conversation < justice < betrayal < drama', idx[0] < idx[1] && idx[1] < idx[2] && idx[2] < idx[3], idx.join(','));
// betrayal.js after justice.js is a load-order contract (justice.js comment)
check('justice before betrayal (load contract)', idx[1] < idx[2]);

// --- 2. @ontology headers
for (const m of mods) {
  const src = fs.readFileSync(path.join(ROOT, m), 'utf8');
  check(m + ' has @ontology header', /@ontology/.test(src.slice(0, 3000)));
}

// --- 3a. runtime reachability (node-evaluable modules)
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(20261009);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
scripts.filter(f => !SKIP.has(f)).forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const v = Game.state.village, me = Game.villagerId;
  const npc = (v.roster || []).filter(id => id !== me)[0];

  // conversation.js: real convo opens on a living villager
  // (startConvo returns {line, choices, transcript, ended} — not the convo obj)
  const c = Game.startConvo(npc);
  check('conversation.js reachable (startConvo)', !!(c && c.ended === false && typeof c.line === 'string'));

  // justice.js: the justice ladder state is live
  const j = Game.justiceState();
  check('justice.js reachable (justiceState)', !!(j && typeof Game.justiceHeat === 'function'));

  // betrayal.js: moot machinery reachable end-to-end (case -> moot -> vote)
  const plot = { id: 'plot_wire', leader: npc, accomplices: [], target: me, day: Game.state.scholar.day, resolved: false };
  Game.betrayalState().plots = Game.betrayalState().plots || [];
  Game.betrayalState().plots.push(plot);
  const cs = Game.openCase(plot, 'ambush');
  let mootOk = false;
  try { const r = Game.callMoot(cs.id, npc); if (r && r.trial) { Game.castPlayerVote(cs.id, true); mootOk = ['resolved', 'acquitted'].includes(cs.status); } } catch (e) { mootOk = false; }
  check('betrayal.js reachable (openCase->callMoot->vote)', mootOk, 'status=' + cs.status);

  // --- 3b. drama.js static wiring (DOM-only, cannot node-eval)
  // drama.js is an IIFE that publishes Scattering.Drama; game.js's Game.drama
  // dispatches into it (guarded — degrades silently without the overlay).
  const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  check('drama.js publishes Scattering.Drama', /S\.Drama\s*=\s*Drama/.test(dramaSrc));
  check('game.js Game.drama dispatches to Scattering.Drama', gameSrc.includes('Scattering.Drama') && gameSrc.includes('drama(kind'));
  check('drama.js handles social/moot verb', /['"]moot['"]/.test(dramaSrc));
  check('drama.js handles social/vote verb', /['"]vote['"]/.test(dramaSrc));
  check('drama.js handles social/exile verb', /['"]exile['"]/.test(dramaSrc));
  // every drama('social', ...) call site in game code names a handled type
  const callTypes = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
    for (const m of src.matchAll(/this\.drama\('social',\s*\{[^}]*type:\s*['"]([^'"]+)['"]/g)) callTypes.add(m[1]);
  }
  const missing = [...callTypes].filter(t => !new RegExp(`['"]${t}['"]`).test(dramaSrc));
  check('all emitted social drama types handled', missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : [...callTypes].join(','));

  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
