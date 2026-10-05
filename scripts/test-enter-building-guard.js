// enterBuilding location guard. Usage: node scripts/test-enter-building-guard.js
// The hall is at Haven. enterBuilding() from anywhere else must refuse
// instead of desyncing inside/outside state (which gates pantry/stash).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // at haven (depart leaves you inside the hall)
  ok('starts at haven', Game.playerTile().type === 'haven');
  Game.state.scholar.insideHaven = false; // step out onto the grounds
  const r1 = Game.enterBuilding();
  ok('enterBuilding works at haven', r1 === true && Game.state.scholar.insideHaven === true);

  // walk to a neighboring wild node, try to "go inside" there
  const t = Game.travelTargets()[0];
  Game.travelTo(t.x, t.y);
  ok('left haven', Game.playerTile().type !== 'haven');
  Game.state.scholar.insideHaven = false;
  const r2 = Game.enterBuilding();
  ok('enterBuilding refuses in the wild', r2 === false);
  ok('insideHaven stays false in the wild', Game.state.scholar.insideHaven === false);
  ok('pantry gate still closed out there',
    Game.havenStoresAccess() === 'none' || Game.havenStoresAccess() === 'outside');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
