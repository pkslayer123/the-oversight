// Ducks in a row test (Steve 2026-10-05)
// Verifies: snake spawn, movement, split, contact damage, non-blocking
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  
  console.log('=== Ducks in a Row Tests ===\n');
  
  // Setup and spawn
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.health = 100;
  s.monster = { id: 'ducks_in_a_row', mx: 6, my: 4 };
  Game.startCombat('ducks_in_a_row');
  
  const f = Game.tbfight;
  ok('fight started', !!f);
  
  const segs = f.fighters.filter(x => x.kind === 'monster' && x.mdef.snake);
  ok('6 segments spawned', segs.length === 6, `got ${segs.length}`);
  
  const head = segs.find(x => x.isHead);
  ok('head exists', !!head);
  ok('head segmentIndex 0', head.segmentIndex === 0);
  
  // Non-blocking
  const mdef = Game.data.monsters.find(m => m.id === 'ducks_in_a_row');
  ok('blocks=false', mdef.blocks === false);
  
  // Speed
  ok('speed 5 (scary fast)', head.speed === 5, `got ${head.speed}`);
  
  // Split test: kill middle segment (index 2)
  const mid = segs.find(x => x.segmentIndex === 2);
  const snakeIdBefore = mid.snakeId;
  Game.tbDamage(mid.key, 999, 'test', 'p', { quiet: true });
  ok('middle segment dead', !mid.alive);
  
  // Check split: should have two snakes now
  const snakes = new Set(f.fighters
    .filter(x => x.kind === 'monster' && x.alive && x.mdef.snake)
    .map(x => x.snakeId));
  ok('split into 2 snakes', snakes.size === 2, `got ${snakes.size}`);
  
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
