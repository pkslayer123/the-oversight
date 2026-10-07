// Cache theft distance rule. Usage: node scripts/test-cache-distance.js
// Steve's rule: personal-cache theft risk decreases with distance from any village/haven.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const approx = (a, b) => Math.abs(a - b) < 1e-9;

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}

(async () => {
  await Game.init();

  // 1. Unit: the chance curve.
  ok('method exists', typeof Game.cacheTheftChance === 'function');
  ok('at haven doorstep ~0.8%/batch', approx(Game.cacheTheftChance(0), 0.008));
  ok('halfway (6 tiles) ~0.4%/batch', approx(Game.cacheTheftChance(6), 0.004));
  ok('far (12+ tiles) floored ~0.048%/batch', approx(Game.cacheTheftChance(12), 0.00048));
  ok('farther stays floored', approx(Game.cacheTheftChance(40), 0.00048));
  ok('monotonic decrease', Game.cacheTheftChance(0) > Game.cacheTheftChance(4) &&
    Game.cacheTheftChance(4) > Game.cacheTheftChance(8) && Game.cacheTheftChance(8) >= Game.cacheTheftChance(20));

  // 2. Integration: bury near and far, run batches, far survives more often.
  freshGame();
  const v = Game.state.village;
  const hx = v.px ?? 3, hy = v.py ?? 3;
  Game.playerCaches().push({ id: 'near', node: { x: hx, y: hy }, desc: '', label: 'near', items: [{ name: 'x' }], found: false, day: 0 });
  Game.playerCaches().push({ id: 'far', node: { x: hx + 10, y: hy + 10 }, desc: '', label: 'far', items: [{ name: 'x' }], found: false, day: 0 });
  let nearFound = 0, farFound = 0;
  const TRIALS = 40, BATCHES = 60;
  for (let t = 0; t < TRIALS; t++) {
    for (const c of Game.playerCaches()) { c.found = false; }
    for (let b = 0; b < BATCHES; b++) Game.npcBatchTurn();
    if (Game.playerCaches().find(c => c.id === 'near').found) nearFound++;
    if (Game.playerCaches().find(c => c.id === 'far').found) farFound++;
  }
  console.log(`near found ${nearFound}/${TRIALS}, far found ${farFound}/${TRIALS}`);
  ok('near cache gets hit more than far cache', nearFound > farFound);
  ok('near cache gets hit sometimes (mechanic live)', nearFound > 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
