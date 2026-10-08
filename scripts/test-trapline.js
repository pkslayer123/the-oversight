// Trapline tests: traps catch on ANY tile at dawn, not just the player's.
// Regression test for the hunter-loop bug where away-tile traps never checked.
// Usage: node scripts/test-trapline.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

function freshGameWithTraps() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  Game.learnRecipe('snare', 3);
  s.inventory.push({ material: 'vine', units: 8 }, { material: 'stick', units: 8 });
  // trap A on the tile we will sleep on
  for (let i = 0; i < 5 && !Game.craft('snare'); i++) {} // 85% craft success
  if (!Game.setTrap('snare')) throw new Error('setTrap A failed');
  const home = { x: Game.map.px, y: Game.map.py };
  // trap B two tiles away
  let tgt = Game.travelTargets().find(t => t.d >= 2 && Game.tileAt(t.x, t.y).type !== 'haven')
    || Game.travelTargets().find(t => Game.tileAt(t.x, t.y).type !== 'haven');
  if (!tgt) { // reveal the map so travel works
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) Game.tileAt(x, y).revealed = true;
    tgt = Game.travelTargets().find(t => t.d >= 2 && Game.tileAt(t.x, t.y).type !== 'haven');
  }
  for (let i = 0; i < 5 && !Game.craft('snare'); i++) {}
  // travel can be blocked (blockage object) — try targets until one lands,
  // otherwise trap B silently ends up on the wrong tile and the test flakes.
  // Prefer a tile 2+ away (a real trapline); fall back to any reachable tile.
  const cands = Game.travelTargets().filter(t => Game.tileAt(t.x, t.y).type !== 'haven');
  cands.sort((a, b) => (b.d >= 2) - (a.d >= 2));
  let landed = null;
  for (const cand of cands) {
    if (Game.travelTo(cand.x, cand.y) === undefined) { landed = cand; break; }
  }
  if (!landed) throw new Error('no reachable tile for trap B');
  tgt = landed;
  if (!Game.setTrap('snare')) throw new Error('setTrap B failed');
  Game.map.px = home.x; Game.map.py = home.y; // go home to sleep
  // ECOLOGY FIXTURE (hunter loop 2026-10-08): traps now hunt the tile's real
  // wildlife — stock both trap tiles with snare game so the test measures the
  // trapline mechanics (away tiles check at dawn), not the ecology.
  for (const p of [home, { x: tgt.x, y: tgt.y }]) {
    Game.tileAt(p.x, p.y).wildlife = { cottontail_rabbit: 12, gray_squirrel: 12, opossum: 8 };
  }
  return { home, away: { x: tgt.x, y: tgt.y } };
}

(async () => {
  await Game.init();

  // 1. away traps check at dawn (statistical: 30 dawns, both traps set)
  let awayCatches = 0, homeCatches = 0;
  let { home, away } = freshGameWithTraps();
  for (let d = 0; d < 30; d++) {
    const uHome = (Game.tileAt(home.x, home.y).traps[0] || {}).uses;
    const uAway = (Game.tileAt(away.x, away.y).traps[0] || {}).uses;
    Game.map.px = home.x; Game.map.py = home.y;
    Game.state.scholar.kcal = 2400; Game.state.scholar.hydration = 100; Game.state.scholar.health = 100;
    Game.endDay();
    const uHome2 = (Game.tileAt(home.x, home.y).traps[0] || {}).uses;
    const uAway2 = (Game.tileAt(away.x, away.y).traps[0] || {}).uses;
    if (uHome2 !== undefined && uHome2 < uHome) homeCatches++;
    if (uAway2 !== undefined && uAway2 < uAway) awayCatches++;
    else if (uAway === 10 && uAway2 === undefined) awayCatches++; // trap broke from catches
    if (Game.over || Game.villageLost) break;
  }
  ok('away-tile trap catches over 30 dawns (was: never)', awayCatches > 0);
  ok('home-tile trap still catches', homeCatches > 0);
  console.log(`  info: home catches=${homeCatches}, away catches=${awayCatches} over 30 dawns`);

  // 2. catch message names the location (no silent teleport-food)
  // (fresh game each test — capture its own coordinates, never reuse test 1's)
  ({ home, away } = freshGameWithTraps());
  Game.state.scholar.day = 1;
  // force a catch on the away tile by stubbing random once
  const awayTile = Game.tileAt(away.x, away.y);
  awayTile.traps[0].setDay = 0;
  const realRandom = Math.random;
  Math.random = () => 0.01; // force catch + first catchId
  Game.log.length = 0;
  Game.map.px = home.x; Game.map.py = home.y;
  Game.checkTraps();
  Math.random = realRandom;
  const said = Game.log.join(' | ');
  ok('catch message mentions distance/direction', /tile(s)? (north|south|east|west)/.test(said));
  ok('catch names the trap', /[Ss]nare/.test(said));
  console.log(`  info: "${said.slice(0, 140)}"`);

  // 3. the "check it tomorrow" promise: a trap set today IS eligible at the
  // end-of-day check — that checkTraps call runs before the day increments, so
  // it IS tomorrow's dawn. Regression: the old >= guard skipped the first
  // dawn entirely (first check landed on waking day+2, not day+1).
  ({ home, away } = freshGameWithTraps());
  const t = Game.tileAt(away.x, away.y);
  const usesBefore = t.traps[0].uses;
  Math.random = () => 0.01; // force a catch
  Game.log.length = 0;
  Game.checkTraps(); // end of the set day = tomorrow's dawn
  Math.random = realRandom;
  ok('trap set today is checked at end-of-day (first dawn)', t.traps[0].uses < usesBefore);

  // 4. broken traps are removed from their tile (not the player's)
  ({ home, away } = freshGameWithTraps());
  const at = Game.tileAt(away.x, away.y);
  at.traps[0].uses = 1; at.traps[0].setDay = Game.state.scholar.day - 1;
  Math.random = () => 0.01;
  Game.checkTraps();
  Math.random = realRandom;
  ok('spent trap removed from its own tile', (at.traps || []).length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
