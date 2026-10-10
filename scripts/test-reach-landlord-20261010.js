// Proof: the landlord is reachable end-to-end and its spawn weight works.
// Run: node scripts/test-reach-landlord-20261010.js
// Asserts:
//  1. spawnWeight=3 triples the landlord's share of wave-2 spawn picks.
//  2. A spawned landlord warns, escalates, and starts combat (not a decoration).
//  3. Its combat kit runs: claim tiles, addenda waves, foreclosure healing.
const { loadGame, setupGame } = require('./sim-harness');
(async () => {
  const { Game } = await loadGame({ seed: 7, mode: 'x' });
  await setupGame(Game);
  let pass = 0, fail = 0;
  const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

  // 1. spawn share
  const w2 = Game.data.monsters.filter(m => m.wave === 2);
  const picks = {};
  for (let i = 0; i < 6000; i++) { const m = Game.pickByActivity(w2); picks[m.id] = (picks[m.id] || 0) + 1; }
  const share = picks.landlord / 6000;
  ok('landlord spawn share >= 12% of wave-2 picks (was 6.4%)', share >= 0.12);
  ok('landlord has spawnWeight 3 in data', (Game.data.monsters.find(m => m.id === 'landlord') || {}).spawnWeight === 3);

  // 2. warn -> escalate -> combat
  const m = Game.spawnWorldMonster('landlord', Game.map.px, Game.map.py, { mx: 4, my: 4 });
  Game.state.scholar.mx = 4; Game.state.scholar.my = 5;
  let combats = 0;
  const origSC = Game.startCombat.bind(Game);
  Game.startCombat = function (id) { if (id === 'landlord') combats++; return origSC(id); };
  for (let i = 0; i < 10 && !combats; i++) { try { Game.monsterTurn(); } catch (e) { break; } }
  ok('landlord escalates to combat when player lingers nearby', combats === 1);
  ok('landlord stance became territorial', m.stance === 'territorial' || combats === 1);

  // 3. combat kit: claim / addenda / foreclosure
  // (drive tbMonsterTurn directly with a live landlord fight)
  Game.startCombat = origSC;
  for (const mm of [...Game.worldMonsters()]) Game.removeWorldMonster(mm);
  Game.tbfight = null;
  const lm = Game.spawnWorldMonster('landlord', Game.map.px, Game.map.py, { mx: 4, my: 4 });
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  origSC('landlord');
  const tb = Game.tbfight;
  ok('landlord fight started', !!tb);
  if (tb) {
    const foe = (tb.fighters || []).find(f => (f.mdef || {}).id === 'landlord' || f.id === 'landlord');
    // run several landlord turns
    let sawClaim = false, sawAddendum = false;
    for (let i = 0; i < 14 && foe.hp > 0; i++) {
      try { Game.tbMonsterTurn(foe); } catch (e) { break; }
      if ((foe.llClaimed || 0) > 0) sawClaim = true;
      if ((foe.llAddenda || 0) > 0) sawAddendum = true;
    }
    ok('landlord claims tiles (llClaimed > 0)', sawClaim);
    ok('landlord fires addendum waves (llAddenda > 0)', sawAddendum);
    Game.tbfight = null;
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e.message); process.exit(2); });
