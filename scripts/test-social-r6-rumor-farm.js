// BREAK-IT social r6 (2026-10-09): GENEROUS-RUMOR TRUST FARM.
// Attack: player spreads a 'generous' rumor about NPC X. Every gossip hop applies
// applyRep(subject=X, {generous:+N}, 0.4, noTrust:false) — the applyRep trust-drift
// pays X trust-of-player per hop, PLUS a 40% ripple to X's whole group (unscaled).
// Player can re-spread the SAME rumor every daypart (partKey dedupe is per
// daypart). Measured here BEFORE (farm exists) — run again AFTER fix for GREEN.
// Run: node scripts/test-social-r6-rumor-farm.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\"]+\.js|src\/js\/engine\/[^\/\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const S = Game.state, v = S.village, s = S.scholar;
  const me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  if (npcs.length < 3) { console.log('SKIP: not enough villagers'); process.exit(0); }
  const target = npcs[0], firstHearer = npcs[1];
  const fails = [];
  const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

  // suppress noise
  const quiet = Game.say; Game.say = () => {}; Game.sysSay = () => {};
  const parts = ['morning', 'afternoon', 'evening', 'night'];

  // fresh baseline
  v.trust = v.trust || {};
  for (const id of npcs) v.trust[id] = 10;
  v.gossip = [];
  Game.dayPart = 'morning';

  const t0 = v.trust[target];
  const t0sum = npcs.reduce((a, id) => a + (v.trust[id] || 10), 0);

  // ATTACK: one 'generous' rumor about target, then let it travel 3 days.
  const g = Game.spreadRumor(target, 'generous', firstHearer);
  check('rumor seeded', !!g, 'partKey=' + (g && g.partKey));

  // advance 3 days, 4 dayparts each, spreading gossip each part
  let hops = 0;
  const tellerCounts = [];
  for (let d = 0; d < 3; d++) {
    for (const p of parts) {
      Game.dayPart = p;
      const before = g.heard.length;
      Game.spreadGossip();
      hops += Math.max(0, g.heard.length - before);
      tellerCounts.push(g.heard.length);
    }
    s.day++;
  }
  const t1 = v.trust[target];
  const t1sum = npcs.reduce((a, id) => a + (v.trust[id] || 10), 0);
  const heardMax = Math.max(...tellerCounts);
  console.log(`ONE rumor: heardMax=${heardMax}/${npcs.length} target trust ${t0} -> ${t1} (delta ${t1 - t0}), village trust sum ${t0sum} -> ${t1sum} (delta ${t1sum - t0sum})`);

  // ATTACK 2: re-spread every daypart for 2 more days (dedupe allows per-daypart)
  for (let d = 0; d < 2; d++) {
    for (const p of parts) {
      Game.dayPart = p;
      Game.spreadRumor(target, 'generous', firstHearer);
      Game.spreadGossip();
    }
    s.day++;
  }
  const t2 = v.trust[target];
  const t2sum = npcs.reduce((a, id) => a + (v.trust[id] || 10), 0);
  console.log(`FARM 2 days of re-spreading: target trust ${t0} -> ${t2} (delta ${t2 - t0}), village trust sum ${t0sum} -> ${t2sum} (delta ${t2sum - t0sum})`);

  Game.say = quiet;
  // VERDICT: the fix kills the trust drift from rumor-travel about an NPC subject.
  // A surviving honest farm is none: rumors move REP, not TRUST.
  // Threshold: target trust should not have risen > +8 from rumor-travel alone
  // (post-fix the only movement is the rare trace punishment, negative).
  check('no trust farm from rumor travel', (t2 - t0) <= 8, `target delta ${t2 - t0}`);
  check('no village-wide trust inflation', (t2sum - t0sum) <= 12, `village delta ${t2sum - t0sum}`);
  // the honest mechanic survives: the rumor still moves REP (the subject's
  // generous standing), just not TRUST. Measure generous rep of the target.
  const greps = Game.repOf(target).generous || 0;
  console.log(`target generous rep after farm: ${greps}`);
  check('rumor still moves rep (mechanic intact)', greps > 0, `generous rep=${greps}`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
