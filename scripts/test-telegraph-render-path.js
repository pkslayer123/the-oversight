// TELEGRAPH RENDER PATH — live-verification regression (Steve 2026-10-06)
// A live-browser check of the shipped build found the run-0016 telegraph
// buckets (dozeLane/pepBurst/swarmHum/resonantBurst/flashBurst) DO NOT RENDER
// live: monsters showed only the beamSource tile glow, no telegraph cells,
// and the classes appeared nowhere in the DOM.
// Verdict: (a) KNOWLEDGE-GATING WORKING AS DESIGNED. A fresh debug-scenario
// player has learned no patterns, so tbAllTelegraphCells skips every bucket
// (`if (!known) continue;`) and renderDetail emits no classes. The banner
// (dangerbar) DOES show — its base cue is diegetic (what you perceive: the
// hum, the inflation), while the tactical coaching (knownCue) and the grid
// cells (where the attack lands) stay hidden until the pattern is learned.
// This test proves the full path bucket → class string → DOM at the code
// level: it extracts the ACTUAL _tgCls emission block from renderDetail
// (not a replica) and asserts classes reach the class string iff the
// pattern is learned. If this ever fails, the render path is broken.
// Run: node scripts/test-telegraph-render-path.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
// REAL bucket routing, extracted from app.js (same fn renderDetail uses).
const _tbSrc = appJs.match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
const tbAllTelegraphCells = eval('(' + _tbSrc + ')');
// REAL class emission, extracted from renderDetail (the actual code that turns
// buckets into the cell's class string). Evaluated per-cell with _tg/_k bound.
const _clsSrc = appJs.match(/const _tgCls =\n(?:.*\n)*?.*?;\n/)[0];
function tgClsFor(_tg, _k) { return eval(_clsSrc + '\n_tgCls;'); }
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}
const P = () => Game.tbFighter('p');
const M = (id) => Game.tbfight.fighters.find(x => x.kind === 'monster' && (!id || (x.mdef || {}).id === id));
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function learn(id) {
  const atkName = ((Game.data.monsters.find(m => m.id === id) || {}).attack || {}).name;
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  const c = Game.state.codex.monsters[id] || (Game.state.codex.monsters[id] = {});
  c.patterns = c.patterns || {};
  if (atkName) c.patterns[atkName] = 'test-learned';
  c.stage = 'observed';
}
function freshFight(mid) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 900;
  Game.canSee = () => true;
  Game.startCombat(mid);
  P().hp = P().maxHp = 900;
  const m = M(mid); m.hp = m.maxHp = 900;
  P().mx = Math.max(0, m.mx - 3); P().my = m.my;
  return m;
}
// Advance until the monster has an active telegraph (or give up).
function untilTelegraph(m, maxTurns) {
  for (let i = 0; i < (maxTurns || 12); i++) {
    if (m.telegraph) return true;
    if (!Game.tbfight || Game.tbfight.over) return false;
    endTurn();
  }
  return !!m.telegraph;
}
(async () => {
  await Game.init();
  Game.say = () => {};
  Game.audioEvent = () => {};
  Game.genDetail = () => flatGrid();

  // === BULLDOZER (charge → dozeLane) ===
  let m = freshFight('bulldozer');
  ok(untilTelegraph(m), 'bulldozer declares its charge');
  const ptype = (m.telegraph.pattern || {}).type;
  ok(ptype === 'charge', 'bulldozer telegraph is charge type (got ' + ptype + ')');

  // FRESH PLAYER: no patterns learned — the live-build behavior.
  let b = tbAllTelegraphCells();
  ok(b.dozeLane.size === 0, 'fresh player: dozeLane bucket EMPTY (knowledge-gated)');
  ok(b.charge.size === 0, 'fresh player: generic charge bucket also empty');
  // The ACTUAL renderDetail class emission: no dozeLane class reaches the DOM.
  const tgCells = (m.telegraph.cells || []).map(c => c.cx + ',' + c.cy);
  ok(tgCells.length > 0, 'bulldozer telegraph carries cells (sanity)');
  const freshCls = tgCells.map(k => tgClsFor(b, k)).join(' ');
  ok(!freshCls.includes('dozeLane'), 'fresh player: renderDetail emits NO dozeLane class (matches live build)');

  // Banner/cell split: the diegetic cue text DOES show (banner), but no coaching.
  const freshCue = Game.tbTelegraphCue(m);
  ok(freshCue && freshCue.length > 0, 'fresh player: dangerbar cue text present (diegetic, ungated)');
  ok(!/you know this one/i.test(freshCue), 'fresh player: no learned coaching in cue');

  // LEARN THE PATTERN: now the cells must render.
  learn('bulldozer');
  ok(Game.encTelegraphKnown(m), 'pattern learned: encTelegraphKnown true');
  b = tbAllTelegraphCells();
  ok(b.dozeLane.size > 0, 'learned player: dozeLane bucket POPULATED (' + b.dozeLane.size + ' cells)');
  const learnedCls = [...b.dozeLane].map(k => tgClsFor(b, k)).join(' ');
  ok(learnedCls.includes('dozeLane'), 'learned player: renderDetail emits dozeLane class (render path intact)');
  // Coaching appears only after learning.
  const learnedCue = Game.tbTelegraphCue(m);
  ok(/you know this one/i.test(learnedCue), 'learned player: coaching appended to cue');

  // === BELLTOAD (burst → resonantBurst) — covers the burst pattern type ===
  m = freshFight('belltoad');
  ok(untilTelegraph(m), 'belltoad declares its burst');
  b = tbAllTelegraphCells();
  ok(b.resonantBurst.size === 0, 'fresh player: resonantBurst bucket EMPTY (knowledge-gated)');
  const toadCells = (m.telegraph.cells || []).map(c => c.cx + ',' + c.cy);
  const toadFreshCls = toadCells.map(k => tgClsFor(b, k)).join(' ');
  ok(!toadFreshCls.includes('resonantBurst'), 'fresh player: renderDetail emits NO resonantBurst class');
  learn('belltoad');
  b = tbAllTelegraphCells();
  ok(b.resonantBurst.size > 0, 'learned player: resonantBurst bucket POPULATED');
  const toadLearnedCls = [...b.resonantBurst].map(k => tgClsFor(b, k)).join(' ');
  ok(toadLearnedCls.includes('resonantBurst'), 'learned player: renderDetail emits resonantBurst class');

  // === STYLE BLOCK SANITY: the CSS classes exist (main.css), so when the
  // bucket is populated the visual has something to hook onto. ===
  const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
  ok(css.includes('.cell.dozeLane'), 'main.css defines .cell.dozeLane');
  ok(css.includes('.cell.resonantBurst'), 'main.css defines .cell.resonantBurst');
  ok(css.includes('.cell.pepBurst'), 'main.css defines .cell.pepBurst');
  ok(css.includes('.cell.swarmHum'), 'main.css defines .cell.swarmHum');
  ok(css.includes('.cell.flashBurst'), 'main.css defines .cell.flashBurst');

  console.log(`\nrender-path: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
