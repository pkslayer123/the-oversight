// BREAK-IT: pantry cap bypass via putAwayFinished.
// BEFORE: donateToPantry refused when full, but putAwayFinished -> pantryAdd
// pushed unconditionally — pantry overfilled past its cap.
// AFTER: pantryAdd is the single choke point; a full pantry leaves the
// batch on the counter with an honest message.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(2026);
  const s = G.state.scholar, v = G.state.village;
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const cap = G.pantryCapKcal();
  let i = 0;
  while (G.pantryKcal() + 5000 <= cap && i < 100) { G.pantryAdd({ name: 'Fill' + i, kcalEach: 500, units: 10, spoilDay: 99 }); i++; }
  const before = G.pantryKcal();
  check('P0 pantryAdd respects cap on the way up', before <= cap, `${Math.round(before)} <= ${cap}`);

  // direct pantryAdd overfill attempt
  const ok = G.pantryAdd({ name: 'Over', kcalEach: 50000, units: 10, spoilDay: 99 });
  check('P1 pantryAdd refuses overfill', ok === false && G.pantryKcal() === before,
    `returned ${ok}, kcal ${Math.round(G.pantryKcal())}`);

  // putAwayFinished with a full pantry: batch stays on the counter
  s.prepStash = [{ name: 'Extra', kcalEach: 1000, units: 5, spoilDay: 99, foodState: 'cooked', foodKind: 'meat', edible: true }];
  sayLog.length = 0;
  G.putAwayFinished();
  check('P2 putAwayFinished blocked at cap', G.pantryKcal() === before, `kcal ${Math.round(G.pantryKcal())}`);
  check('P2b batch stays on counter', (s.prepStash || []).length === 1, `stash len ${(s.prepStash || []).length}`);
  check('P2c honest message', sayLog.some(m => /pantry is full/i.test(m)), sayLog.slice(-1)[0]);

  // room available: put-away works again
  v.pantry = [];
  s.prepStash = [{ name: 'Extra', kcalEach: 1000, units: 5, spoilDay: 99, foodState: 'cooked', foodKind: 'meat', edible: true }];
  G.putAwayFinished();
  check('P3 put-away works with room', G.pantryKcal() === 5000 && (s.prepStash || []).length === 0,
    `kcal ${G.pantryKcal()}, stash ${(s.prepStash || []).length}`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
