// Proof: break-it monsters run 2 — lockpick bolt-phase stuck state
// (Steve 2026-10-08).
//
// CATCH (SOFTLOCK): after stealing, the raccoon bolts for the nearest edge.
// When that edge sat behind blocking terrain, tbStepToward returned null
// every turn — the raccoon sat in 'bolt' phase forever saying "pure getaway",
// going nowhere, and the fight never ended on its own (measured: 40 rounds,
// zero movement, over=false).
// FIX: game.js bolt phase — two consecutive no-progress bolt turns and the
// raccoon finds a gap in the treeline (fled=true, item honestly lost). The
// two turns preserve the counterplay: hurt it mid-bolt and it drops the item.
// This test fails on HEAD (fight never ends) and passes patched.
'use strict';
const H = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};

(async () => {
  const Game = await H.freshGame(4242);

  // --- Scenario 1: edges unreachable -> stuck counter escapes, fight ends.
  H.seedRng(31001);
  Game.state.scholar.health = 100;
  Game.startCombat('lockpick_raccoon');
  const tbf = Game.tbfight;
  const p = Game.tbFighter('p');
  const m = tbf.fighters.find(x => x.kind === 'monster');
  // Round 1: it steals (player waits).
  Game.tbPlayerWait();
  ok('raccoon stole something and entered bolt phase',
    m.beamPhase === 'bolt' && !!m.stolen, `phase=${m.beamPhase} stolen=${!!m.stolen}`);
  const stolenName = m.stolen && m.stolen.name;
  const invBefore = Game.state.scholar.inventory.length;
  // Simulate impassable terrain: tbStepToward always fails.
  const origStep = Game.tbStepToward.bind(Game);
  Game.tbStepToward = () => null;
  let rounds = 0;
  try {
    while (!tbf.over && rounds < 10) { rounds++; Game.tbPlayerWait(); }
  } finally {
    Game.tbStepToward = origStep;
  }
  ok('stuck raccoon escapes via the treeline gap (fight ends)',
    tbf.over === true, `over=${tbf.over} rounds=${rounds}`);
  ok('fight ended routed (it got away)', tbf.result === 'routed', `result=${tbf.result}`);
  ok('stolen item is honestly gone (not duped, not returned)',
    !m.stolen && Game.state.scholar.inventory.length === invBefore,
    `stolen=${JSON.stringify(m.stolen)} inv=${Game.state.scholar.inventory.length}/${invBefore}`);
  // ONE TEXT STREAM (2026-10-11): log lines are String objects carrying a
  // surface tag — String(x) recovers the text for the typeof-string guard.
  const gapSaid = Game.log.some(x => String(x).includes('gap in the treeline'));
  ok('escape narrated honestly (gap in the treeline)', gapSaid);
  void stolenName;

  // --- Scenario 2: counterplay survives — hurt it mid-bolt, it drops the item.
  H.seedRng(31002);
  Game.state.scholar.health = 100;
  Game.state.scholar.inventory.push({ name: 'Spare socks', units: 1, kcalEach: 0 });
  Game.startCombat('lockpick_raccoon');
  const tbf2 = Game.tbfight;
  const m2 = tbf2.fighters.find(x => x.kind === 'monster');
  Game.tbPlayerWait(); // steal
  ok('scenario 2: stole and bolting', m2.beamPhase === 'bolt' && !!m2.stolen);
  const itemName = m2.stolen.name;
  const invCount = Game.state.scholar.inventory.length;
  // Hurt it the honest way: step adjacent and strike (strike path sets
  // lockpickHit via encNoticesPain; raw tbDamage bypasses it).
  const p2 = Game.tbFighter('p');
  p2.mx = m2.mx; p2.my = m2.my; // corner it: same tile
  Game.state.scholar.mx = p2.mx; Game.state.scholar.my = p2.my;
  try { Game.tbPlayerStrike(m2.key); } catch (e) { console.log('  strike note: ' + e.message); }
  let g2 = 0;
  while (!tbf2.over && Game.tbIsPlayerTurn() && g2++ < 2) Game.tbPlayerWait(); // its turn: lockpickHit -> drop + flee
  ok('hurt mid-bolt: it drops the item and flees',
    m2.fled === true && !m2.stolen, `fled=${m2.fled} stolen=${!!m2.stolen}`);
  const back = Game.state.scholar.inventory.some(i => i.name === itemName);
  ok('stolen item returned to inventory (no duplication)',
    back && Game.state.scholar.inventory.length === invCount + 1,
    `inv=${Game.state.scholar.inventory.length}/${invCount + 1}`);
  if (!tbf2.over) { try { Game.tbEnd('fled'); } catch (e) {} }

  // --- Scenario 3: normal escape still works when an edge IS reachable.
  H.seedRng(31003);
  Game.state.scholar.health = 100;
  Game.startCombat('lockpick_raccoon');
  const tbf3 = Game.tbfight;
  const m3 = tbf3.fighters.find(x => x.kind === 'monster');
  Game.tbPlayerWait(); // steal
  // put it one step from the east edge on open ground
  m3.mx = 7; m3.my = 4;
  let r3 = 0;
  while (!tbf3.over && r3 < 6) { r3++; Game.tbPlayerWait(); }
  ok('reachable edge: escapes over the ridge, fight ends',
    tbf3.over === true && m3.fled === true, `over=${tbf3.over} fled=${m3.fled}`);

  console.log(`\nlockpick proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
