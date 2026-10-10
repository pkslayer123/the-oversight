// Regression tests for partner-reported bugs (2026-10-05):
// 1. Movement must cost kcal (2/step) and time (1 tick)
// 2. cellActions must return 'Go inside' for lodge cells
// 3. Actions must be available after movement (no stale state)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// RNG STABILITY (landing 2026-10-09): this file never seeded Math.random, so
// genDetail's per-run layout sometimes put a blocking cell at the movement
// target and the cost assertions flaked (5 pass / 4 fail ~1 run in 6).
// Seed before eval — several modules capture Math.random at load.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  console.log('\n=== Movement costs ===');
  s.kcal = 2000; s.mx = 4; s.my = 4; s.insideHaven = false;
  Game.map.px = 3; Game.map.py = 3;
  // FLAKY-TARGET FIX (landing 2026-10-09): hardcoded targets (4,5)/(4,6) are
  // sometimes blocking cells in the seeded detail, and a refused move costs
  // nothing — pick walkable neighbors at runtime instead.
  const walkable = (x, y) => {
    const d = Game.genDetail(Game.map.px, Game.map.py);
    const c = d[y] && d[y][x];
    return !!c && !Game.cellProps(c).blocks;
  };
  const neighbors = (x, y) => [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]]
    .filter(([ax, ay]) => ax >= 0 && ax <= 8 && ay >= 0 && ay <= 8 && walkable(ax, ay));
  const nA = neighbors(4, 4)[0];
  ok('a walkable neighbor exists for the cost test', !!nA, nA ? nA.join(',') : 'none on this seed');
  const k1 = s.kcal, t1 = s.dayTicks || 0;
  const moved1 = nA ? Game.microMove(nA[0], nA[1]) : false;
  ok('microMove stepped', moved1 === true);
  ok('microMove costs 2 kcal', Math.round(k1 - s.kcal) === 2);
  ok('microMove costs 1 tick', (s.dayTicks || 0) - t1 === 1);

  const nB = nA ? (neighbors(nA[0], nA[1]).filter(([ax, ay]) => !(ax === 4 && ay === 4))[0] || neighbors(nA[0], nA[1])[0]) : null;
  const k2 = s.kcal, t2 = s.dayTicks || 0;
  const moved2 = nB ? Game.pathStep(nB[0], nB[1]) : false;
  ok('pathStep stepped', moved2 === true);
  // HONESTY (explorer break-it 2026-10-10): pathStep levies one square's
  // walk cost per landed step — the SAME walkStepKcal() a manual microMove
  // step pays (one square, one price, whichever verb walks it).
  ok('pathStep costs walkStepKcal() per landed step', Math.round(k2 - s.kcal) === Game.walkStepKcal());
  ok('pathStep costs 1 tick', (s.dayTicks || 0) - t2 === 1);

  console.log('\n=== Haven re-entry ===');
  // Simulate haven grounds — back on the haven tile (the movement section
  // above moved the map to 3,3; enterBuilding's haven-tile gate needs home).
  Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4;
  s.mx = 4; s.my = 2; s.insideHaven = false;
  // the grounds/hall layouts cache in tile.detail — flipping insideHaven by
  // hand needs the same invalidation exitBuilding/enterBuilding perform.
  Game.tileAt(Game.map.px, Game.map.py).detail = null;
  // the lodge sits centered on the grounds (rows 3-4, cols 3-5 — Steve
  // 2026-10-07); the old (4,1) coordinate predates the centered layout.
  const actions = Game.cellActions(4, 3); // lodge cell
  ok('Go inside action available at lodge', actions.includes('Go inside'));
  
  // Enter and verify state
  const entered = Game.enterBuilding();
  ok('enterBuilding succeeds on haven node', entered === true);
  ok('insideHaven is true after entering', s.insideHaven === true);

  // Exit and verify
  Game.exitBuilding();
  ok('insideHaven is false after exiting', s.insideHaven === false);
  ok('player at grounds doorstep (4,2)', s.mx === 4 && s.my === 2);

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
