#!/usr/bin/env node
// PROOF TEST (explorer loop 2026-10-07): 7x7->9x9 migration left stale `> 6`
// node-coordinate bounds across game.js. tryNodeExit told walkers "the known
// world ends here" at column 7 on a 9x9 world; wandering monsters, the
// wanderer, scout reveals, village geography, forage bonuses, epithets,
// flee-pushes, tile-scenes safeTile and debug toWildNode were all clipped to
// the old 7x7. Fixed to 0..8. Run: node scripts/test-worldedge-9x9-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
let fails = 0;
function check(label, cond, extra) {
  console.log(`   ${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
}
function hopTo(x, y) { // adjacent force-hops (bypass blockages) to reposition for the probe
  const dx = Math.sign(x - Game.map.px), dy = Math.sign(y - Game.map.py);
  if (dx) Game.travelTo(Game.map.px + dx, Game.map.py, true);
  else if (dy) Game.travelTo(Game.map.px, Game.map.py + dy, true);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  console.log('=== world-edge 9x9 proof ===');

  // 1. THE bug: rim-walk east from node (7,4) must enter (8,4), not "world ends here"
  while (Game.map.px !== 7 || Game.map.py !== 4) hopTo(7, 4);
  says.length = 0;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4;
  const r1 = Game.tryNodeExit(1, 0);
  check('rim-walk east from (7,4) enters (8,4)', r1 && r1.moved && Game.map.px === 8 && Game.map.py === 4,
    `got ${JSON.stringify(r1)} at (${Game.map.px},${Game.map.py})`);
  check('no fake world-edge message at (7,4)', !says.join(' ').includes('known world ends here'));

  // 2. TRUE edge: (8,4) east says the line once, then stays silent on repeat bumps
  says.length = 0;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4;
  const r2 = Game.tryNodeExit(1, 0);
  const saidOnce = says.join(' ').includes('known world ends here');
  check('true edge (8,4) blocks with words', r2 === null && Game.map.px === 8 && saidOnce);
  says.length = 0;
  Game.tryNodeExit(1, 0);
  check('repeat bump stays silent (once per game)', says.length === 0, `said ${says.length} lines`);

  // 3. direct out-of-bounds travelTo still guards without crashing
  let threw = false;
  try { Game.travelTo(-1, 4); } catch (e) { threw = true; }
  check('travelTo(-1,4) no crash', !threw);

  // 4. wanderer patrols the full 0..8 width now (player moved clear so no contact)
  while (Game.map.px !== 4 || Game.map.py !== 4) hopTo(4, 4);
  Game.wanderer = { x: 7, y: 4, dir: 1 };
  const origEncounter = Game.encounterDone;
  Game.moveWanderer();
  check('wanderer moves 7->8 (not bouncing at 6)', Game.wanderer.x === 8, `x=${Game.wanderer.x}`);
  Game.moveWanderer();
  check('wanderer bounces at true edge 8', Game.wanderer.x === 8 && Game.wanderer.dir === -1,
    `x=${Game.wanderer.x} dir=${Game.wanderer.dir}`);

  // 5. world monsters can wander into columns 7-8
  Game.state.worldMonsters = [{ id: 'wm1', tx: 6, ty: 4, mx: 4, my: 4, alive: true }];
  let reached78 = false;
  for (let i = 0; i < 400 && !reached78; i++) {
    Game.wanderWorldMonsters();
    for (const m of Game.worldMonsters()) if (m.tx > 6 || m.ty > 6) reached78 = true;
  }
  check('world monsters reach beyond old 7x7 bounds', reached78);
  let escaped = false;
  for (const m of Game.worldMonsters()) if (m.tx < 0 || m.tx > 8 || m.ty < 0 || m.ty > 8) escaped = true;
  check('world monsters never leave 9x9', !escaped);

  // 6. nodeEpithet works at the far corner (neighbor scan 0..8, no throw)
  let ep = null, epThrew = false;
  try { ep = Game.nodeEpithet(8, 8); } catch (e) { epThrew = true; }
  check('nodeEpithet(8,8) no throw', !epThrew, ep ? String(ep).slice(0, 40) : '');

  // 7. debug toWildNode picks within 0..8 (haven now at 4,4)
  const DS = globalThis.Scattering && globalThis.Scattering.DebugScenarios;
  if (DS && DS.toWildNode) {
    DS.toWildNode();
    check('toWildNode lands on 9x9 grid', Game.map.px >= 0 && Game.map.px <= 8 && Game.map.py >= 0 && Game.map.py <= 8,
      `at (${Game.map.px},${Game.map.py})`);
  } else console.log('   SKIP toWildNode not exported');

  console.log(fails ? `\nFAILURES: ${fails}` : '\nall green');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
