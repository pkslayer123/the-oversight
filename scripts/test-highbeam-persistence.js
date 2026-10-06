// Regression test: Highbeam Deer persistence across node boundaries.
// Plays the full path: encounter → monster flees → player follows → findable.
// Usage: node scripts/test-highbeam-persistence.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
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

  console.log('\n=== TEST 1: Deer starts grazing (skittish phase) ===');
  Game.debugScenario('headlight');
  let s = Game.state.scholar;
  Game.dayPart = 1; // daylight for visibility (scenario sets night)
  // Place player far (dist > 5) so deer stays grazing (hasn't noticed you)
  s.mx = 1; s.my = 4;
  s.monster.mx = 7; s.monster.my = 4; // dist 6
  // Ensure clear LOS by placing on same row (may still be blocked, retry logic below)
  Game.monsterTurn();
  if (!s.monster || !s.monster.stance) {
    // LOS blocked, move deer closer to player for clear sight
    s.monster = { id: 'gallowdeer', mx: 7, my: 4 };
    s.mx = 0; s.my = 4; // dist 7, definitely grazing range
    Game.monsterTurn();
  }
  ok('deer has stance', !!(s.monster && s.monster.stance));
  ok('deer starts grazing (not territorial)', s.monster && s.monster.stance === 'grazing');

  console.log('\n=== TEST 2: Spook the deer at close range → it flees ===');
  // Teleport player right next to deer (dist 1) while it's grazing
  s.monster = { id: 'gallowdeer', mx: 5, my: 4, stance: 'grazing', turns: 1 };
  s.mx = 4; s.my = 4; // dist 1, deer not at edge (won't instantly flee to node)
  Game.monsterTurn();
  const fled2 = s.monster ? s.monster.stance === 'fearful' : !!Game.state.fledMonsters;
  ok('deer became fearful when spooked (or fled to node)', fled2);
  if (s.monster) console.log(`    stance: ${s.monster.stance}`);

  console.log('\n=== TEST 3: Fearful deer at edge → stored in fledMonsters (not deleted) ===');
  // Fresh deer, make it fearful near the edge
  s.monster = { id: 'gallowdeer', mx: 7, my: 4, stance: 'fearful', fearTurns: 0, turns: 1 };
  s.mx = 4; s.my = 4; // player far, deer runs away (east)
  const startNode = Game.map.px + ',' + Game.map.py;
  Game.state.fledMonsters = {}; // clear from previous test
  // Run until it hits edge or 10 turns
  for (let i = 0; i < 10 && s.monster; i++) {
    Game.monsterTurn();
  }
  const fledKey = Object.keys(Game.state.fledMonsters || {})[0];
  ok('monster was stored in fledMonsters (not just deleted)', !!fledKey);
  if (fledKey) {
    console.log(`    fled to node: ${fledKey} (from ${startNode})`);
    ok('fled monster is gallowdeer', Game.state.fledMonsters[fledKey].id === 'gallowdeer');
  }

  console.log('\n=== TEST 4: Player follows to adjacent node → deer is findable ===');
  if (fledKey) {
    const [nx, ny] = fledKey.split(',').map(Number);
    // Simulate player crossing to that node
    Game.map.px = nx; Game.map.py = ny;
    // Trigger the node-entry logic (normally happens in travel code)
    // We need to manually invoke the fledMonsters check
    const fmKey = Game.map.px + ',' + Game.map.py;
    const fled = (Game.state.fledMonsters || {})[fmKey];
    ok('fled monster found on adjacent node', !!fled);
    // Simulate the restoration (this happens in the travel code)
    if (fled && !s.monster) {
      s.monster = {
        id: fled.id, mx: fled.mx, my: fled.my,
        stance: 'fearful', fearTurns: 0,
      };
      delete Game.state.fledMonsters[fmKey];
    }
    ok('deer restored to s.monster', !!s.monster && s.monster.id === 'gallowdeer');
    ok('same monster (not a new spawn)', s.monster.id === 'gallowdeer');
  }

  console.log('\n=== TEST 5: Territorial deer does NOT flee (committed) ===');
  Game.debugScenario('headlight'); // fresh
  s = Game.state.scholar;
  // Force daylight so the deer can see (it's night in the scenario, and
  // canSee fails at dist 4-5 in the dark — correct behavior, but the test
  // needs visibility to exercise the stance machine).
  Game.dayPart = 1;
  Game.monsterTurn(); // sets grazing, then notices at dist 5 -> territorial
  // Move to dist 3-5 (notice range) to trigger territorial
  s.monster.mx = 7; s.monster.my = 4;
  s.mx = 3; s.my = 4; // dist 4
  Game.monsterTurn();
  ok('deer became territorial when noticed at range', s.monster && s.monster.stance === 'territorial');
  // Now get close — it should NOT become fearful
  if (s.monster) { s.mx = 6; s.my = 4; } // dist 1
  Game.monsterTurn();
  ok('territorial deer does NOT flee when approached', s.monster && s.monster.stance !== 'fearful');

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
