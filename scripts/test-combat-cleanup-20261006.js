// Proof: combat cleanup — dead monsters don't persist, movement never softlocks.
// Steve 2026-10-06: playtester softlocked, dead 👹 on grid at Haven after combat.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Test');
  Game.newGame('Test', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // ---- 1. tbEnd clears tbfight even if narration throws ----
  Game.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', alive: true, mx: 4, my: 4, hp: 80, moveLeft: 3 },
      { key: 'm1', kind: 'monster', monsterId: 'x', alive: false, mx: 5, my: 5, hp: 0, mdef: { id: 'x' } },
    ],
    over: false, fightersByKey: {},
  };
  // Sabotage: make say() throw to simulate a narration crash
  const origSay = Game.say;
  Game.say = () => { throw new Error('simulated narration crash'); };
  try { Game.tbEnd('won'); } catch (e) { /* tbEnd should not propagate */ }
  Game.say = origSay;
  ok('tbfight cleared even when narration throws', Game.tbfight === null);
  ok('inCombat() false after failed tbEnd', Game.inCombat() === false);

  // ---- 2. tbEnd clears scholar.monster ----
  s.monster = { id: 'ghost', mx: 3, my: 3 };
  Game.tbfight = {
    fighters: [{ key: 'p', kind: 'player', alive: true, mx: 4, my: 4, hp: 80, moveLeft: 3 }],
    over: false, fightersByKey: {},
  };
  Game.tbEnd('fled');
  ok('scholar.monster cleared on tbEnd', s.monster === null || s.monster === undefined);
  ok('tbfight null on normal tbEnd', Game.tbfight === null);

  // ---- 3. inCombat() respects over flag ----
  Game.tbfight = { fighters: [], over: true };
  ok('inCombat() false when tbfight.over=true', Game.inCombat() === false);
  Game.tbfight = { fighters: [], over: false };
  ok('inCombat() true when tbfight active', Game.inCombat() === true);
  Game.tbfight = null;
  ok('inCombat() false when tbfight null', Game.inCombat() === false);

  // ---- 4. Double tbEnd is safe ----
  Game.tbfight = {
    fighters: [{ key: 'p', kind: 'player', alive: true, mx: 4, my: 4, hp: 80, moveLeft: 3 }],
    over: false, fightersByKey: {},
  };
  Game.tbEnd('won');
  const afterFirst = Game.tbfight;
  Game.tbEnd('won'); // should early-return, not crash
  ok('double tbEnd safe', afterFirst === null && Game.tbfight === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(1); });
