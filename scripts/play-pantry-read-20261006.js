// Read-aloud play of pantry_raid (daring line) to judge fun/fear as a player.
// Run: node scripts/play-pantry-read-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.day = 15; Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  const raid = Game.contestPool().find(c => c.id === 'pantry_raid');
  let unrig = rig([0.99, 0.99, 0.99]);
  Game.contestInterruption(Object.assign({}, raid, { givesChoice: false }), 'player');
  unrig();
  const picks = [1, 0, 0]; // brave the front -> grab and run -> present with pride
  let steps = 0;
  unrig = rig([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.5]);
  while (Game.state.activeContest && steps < 6) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    const idx = Math.min(picks[Math.min(steps, picks.length - 1)], phase.choices.length - 1);
    console.log('--- PHASE ---\n' + phase.text + '\nCHOICES: ' + phase.choices.map(c => c.label).join(' | '));
    console.log('>>> YOU: ' + phase.choices[idx].label + '\n');
    const r = Game.contestChoose(idx);
    steps++;
    if (r && r.done) { console.log('DONE: ' + r.outcome); break; }
  }
  unrig();
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
