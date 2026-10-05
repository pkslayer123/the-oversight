// Fishing tackle gate (Steve 2026-10-05): Fish action hidden without a line,
// fish() refuses without tackle.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
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
  const v = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, v.id, v.items.slice(0, 5));
  Game.depart();

  // Test 1: fish() refuses without tackle
  Game.state.scholar.inventory = Game.state.scholar.inventory.filter(i => i.id !== 'fishing_line');
  const r1 = Game.fish();
  ok('fish() returns null without fishing_line', r1 === null);

  // Test 2: fish() attempts with tackle (doesn't complain about tackle)
  Game.state.scholar.inventory.push({ id: 'fishing_line', name: 'Fishing Line', units: 1, kg: 0.05 });
  Game.state.scholar.kcal = 2000;
  Game.fish();
  const said = (Game.state.scholar.log || []).join(' ');
  ok('fish() with line does not complain about tackle', !said.includes('fishing tackle'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
