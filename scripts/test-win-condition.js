// Win condition test (Steve 2026-10-05)
// Verifies: leadership vector, readiness, day-based wave gates
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
  
  console.log('=== Win Condition Tests ===\n');
  
  // Leadership vector exists
  const l = Game.leadership();
  ok('leadership vector initialized', l && typeof l.force === 'number');
  
  // Lead shift works
  Game.leadShift('force', 3);
  ok('leadShift force', Game.leadership().force === 3);
  
  // Earned ending
  Game.leadShift('force', 10);
  Game.leadShift('systemDefiant', 5);
  ok('earned ending feared', Game.earnedEnding() === 'feared', `got ${Game.earnedEnding()}`);
  
  // Readiness
  const r = Game.readiness();
  ok('readiness has score', typeof r.score === 'number');
  ok('readiness not ready at start', !r.ready);
  
  // Wave gates: day-based
  Game.state.scholar.day = 1;
  ok('day 1 = wave 1', Game.unlockedWave() === 1);
  
  Game.state.scholar.day = 10;
  Game.state.waveKills = {1: 5};
  ok('day 10 + 4 kills = wave 2', Game.unlockedWave() === 2, `got ${Game.unlockedWave()}`);
  
  Game.state.scholar.day = 10;
  Game.state.waveKills = {1: 2}; // not enough kills
  ok('day 10 but only 2 kills = wave 1', Game.unlockedWave() === 1);
  
  Game.state.scholar.day = 30;
  Game.state.waveKills = {1: 10, 2: 10};
  ok('day 30 + 8 w2 kills = wave 3', Game.unlockedWave() === 3);
  
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
