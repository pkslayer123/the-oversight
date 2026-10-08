#!/usr/bin/env node
// COMBAT BREAK-IT round 2: phantom belltoad pack across fights (Steve 2026-10-08).
// Attack: _pendingPack (belltoad round-2 reinforcements) is set in startCombat
// but never cleared. Fleeing (door/barrier -> tbEnd('fled')) bypasses the
// chorus check, so the stale pack survived into the NEXT fight: at round 2
// tbAdvance spawned belltoads into an unrelated encounter, and tbEndCheck's
// chorus clause could hold a finished fight open ("another croak answers")
// for a fight that never had toads.
// Fix: resetPerFightFlags() clears _pendingPack (startCombat calls it).
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  const Game = await H.newCombatReadyGame();

  console.log('--- P1. belltoad pack is staged per-fight (mechanism sanity) ---');
  Game.startCombat('belltoad');
  check('P1 pending pack staged (3 delayed)', Game._pendingPack && Game._pendingPack.id === 'belltoad' && Game._pendingPack.count === 3,
    JSON.stringify(Game._pendingPack && { id: Game._pendingPack.id, count: Game._pendingPack.count }));
  check('P1 only 1 toad starts the fight',
    Game.tbfight.fighters.filter(f => f.kind === 'monster').length === 1);

  console.log('--- P2. fleeing leaves the stale pack behind (pre-fix leak shape) ---');
  const p = Game.tbFighter('p');
  p.fled = true;
  Game.tbEnd('fled');
  check('P2 fight ended', !Game.tbfight);
  check('P2 stale pack survives the flee (this is the leak)', Game._pendingPack && Game._pendingPack.count === 3,
    'pendingPack=' + JSON.stringify(Game._pendingPack && Game._pendingPack.count));

  console.log('--- P3. impact: stale pack hijacks an unrelated fight ---');
  // Simulate the pre-fix world: stale pack present when a new fight starts.
  Game.startCombat('bulldozer');
  Game._pendingPack = { id: 'belltoad', count: 3, mdef: Game.data.monsters.find(m => m.id === 'belltoad') };
  const bull = Game.tbfight.fighters.find(f => f.kind === 'monster');
  bull.alive = false; bull.hp = 0;
  const held = Game.tbEndCheck(); // chorus clause: "another croak answers"
  check('P3 stale pack holds a finished fight open (bug impact)', held === false && Game.tbfight && !Game.tbfight.over,
    `tbEndCheck returned ${held}, over=${Game.tbfight && Game.tbfight.over}`);
  if (Game.tbfight) Game.tbEnd('fled');

  console.log('--- P4. fix: new fight clears the pack ---');
  Game._pendingPack = { id: 'belltoad', count: 3, mdef: Game.data.monsters.find(m => m.id === 'belltoad') };
  Game.startCombat('bulldozer'); // resetPerFightFlags runs here
  check('P4 pending pack cleared on new fight start', Game._pendingPack == null,
    'pendingPack=' + JSON.stringify(Game._pendingPack));
  const bull2 = Game.tbfight.fighters.find(f => f.kind === 'monster');
  bull2.alive = false; bull2.hp = 0;
  Game.tbEndCheck();
  check('P4 fight ends won with no stale pack', Game.tbfight == null || Game.tbfight.over,
    'over=' + (Game.tbfight && Game.tbfight.over));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
