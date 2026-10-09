// BREAK-IT social r6 (2026-10-09): WHO-GOSSIP TRUST-DRIFT (sibling of the rumor farm).
// mootAccuserAftermath seeds 'moot_weak_case' gossip with dims.who=accuser and no
// noTrust flag — every hop paid the accuser's trust-of-player -4 (penalties land
// whole) plus a 40% ripple to their whole group, because third-party talk ABOUT
// someone moved their trust OF the player. Structural fix: subject-targeted
// gossip (dims.who) moves REP only, never TRUST.
// Run: node scripts/test-social-r6-whogossip.js (SEED=... optional)
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
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, s = S.scholar;
  const me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  const accuser = npcs[0];
  const heardBy = npcs.slice(1, 6);
  v.trust = v.trust || {};
  for (const id of npcs) v.trust[id] = 40;
  v.gossip = [];
  const t0 = v.trust[accuser];
  const sum0 = npcs.reduce((a, id) => a + v.trust[id], 0);

  // seed exactly what mootAccuserAftermath seeds on an acquittal
  Game.seedGossip('moot_weak_case', { honest: -8, competent: -8, who: accuser }, heardBy);
  const parts = ['morning', 'afternoon', 'evening', 'night'];
  for (let d = 0; d < 3; d++) {
    for (const p of parts) { Game.dayPart = p; Game.spreadGossip(); }
    s.day++;
  }
  const t1 = v.trust[accuser];
  const sum1 = npcs.reduce((a, id) => a + v.trust[id], 0);
  const repH = Game.repOf(accuser).honest || 0;
  console.log(`who-gossip travel: accuser trust ${t0} -> ${t1} (delta ${t1 - t0}), village sum delta ${sum1 - sum0}, accuser honest rep ${repH}`);
  check('who-gossip moves no trust', t1 >= t0 - 1, `delta ${t1 - t0}`);
  check('no group trust ripple', sum1 >= sum0 - 2, `sum delta ${sum1 - sum0}`);
  check('rep still lands (mechanic intact)', repH < 0, `honest rep=${repH}`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
