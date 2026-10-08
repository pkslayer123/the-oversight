// RED TEST (2026-10-07): when a village uprising ends with the mob YIELDING
// (the common outcome — party.js:791 "Most human fights end here, not in
// death"), party.js's tbEnd yield branch handles it inline and SKIPS the
// betrayalAftermath wrapper, so justice.js's uprisingAftermath() never runs.
// The designed yield resolution ("One by one, they stop... j.stage = 3, back
// to exile enforced by fear", justice.js:681) is unreachable: the justice
// ladder sits at stage 4 forever with no enforcement and no resolution.
// Expected after fix: after an uprising yield, justiceState().stage === 3.
const H = require('../harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  const tf = Game.tbfight;
  if (!tf || !tf.uprising) { console.log('SETUP FAIL: no uprising fight'); process.exit(2); }
  // arrange the yield the way the morale code does (party.js:795-801)
  const h = tf.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled);
  h.yielded = true;
  Game.tbEnd('betrayal_yielded');
  const out = cap.log.splice(0).join('\n');
  cap.restore();
  const j = Game.justiceState();
  let failures = 0;
  if (j.stage !== 3) {
    console.log('FAIL: justice stage = ' + j.stage + ' after uprising yield (expected 3: "back to exile, enforced by fear")');
    failures++;
  }
  if (!/One by one, they stop/.test(out)) {
    console.log('FAIL: uprising yield resolution text never spoken');
    failures++;
  }
  console.log(failures ? 'RED: ' + failures + ' failure(s)' : 'GREEN: uprising yield resolves');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
