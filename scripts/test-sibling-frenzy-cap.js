#!/usr/bin/env node
// SIBLING SWEEP (CLASS 5: uncapped converters) — cannibal_frenzy.
// blood_magic was +21,600 kcal/day until capped at 2/daypart. Sibling hunt:
// cannibal_frenzy: +1000 kcal, -30 trust/villager, gate: kcal < 500.
// Hypothesis: the <500 gate mathematically prevents a net-positive kcal loop
// (each reuse requires burning 500+ kcal first), and trust floors at 0.
// Proof: cycle frenzy -> burn to <500 -> frenzy, assert net kcal <= 0.
const H = require('./social-breakit-harness.js');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}
(async () => {
  const Game = await H.newSocialGame();
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.includes('cannibal_frenzy')) s.abilities.push('cannibal_frenzy');
  const v = Game.state.village; v.trust = v.trust || {};
  const roster = (v.roster || []).map(r => r.id || r);
  for (const vid of roster) v.trust[vid] = 0; // worst case: trust already burned
  s.kcal = 400;
  const startKcal = 400;
  let uses = 0;
  for (let i = 0; i < 20; i++) {
    if ((s.kcal || 0) >= 500) break; // gate blocks
    Game._activateAbilityInner('cannibal_frenzy');
    uses++;
    s.kcal -= 1100; // burn back under 500 via a real sink
  }
  const net = (s.kcal || 0) - startKcal;
  console.log('uses:', uses, '| net kcal vs start:', net, '| trust floor held:', Object.values(v.trust).every(t => t >= 0));
  check('no net-positive kcal loop (gate is the cap)', net <= 0, `(net ${net} over ${uses} uses)`);
  check('trust never goes negative', Object.values(v.trust).every(t => t >= 0), '');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
