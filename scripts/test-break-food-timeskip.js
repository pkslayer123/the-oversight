// BREAK-IT: time_skip honesty + gating.
// BEFORE: unlimited uses/day, promised cost "Ages you 1 day" fed ageDebt —
// a write-only stat nothing reads (fictional cost); a second dead button
// (time_skip.skip_time) rendered with the old lie; no combat guard.
// AFTER: 1/day gate enforced in engine + shown in UI, honest label, dead
// button removed, combat refused.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(31337);
  const s = G.state.scholar;
  const orig = G.hasAbility.bind(G);
  G.hasAbility = id => orig(id) || (s.abilities || []).some(a => a.id === id);
  s.abilities = s.abilities || [];
  s.abilities.push({ id: 'time_skip', name: 'Time Skip', level: 1, xp: 0 });
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  // 1) first use fires
  s.day = 5; s.timeSkipDay = null;
  const dpBefore = G.dayPart;
  G.activateAbility('time_skip');
  check('T1 first skip fires', s.timeSkipDay === 5, `timeSkipDay=${s.timeSkipDay}`);

  // 2) second use same day refused (engine gate)
  sayLog.length = 0;
  const dp2 = G.dayPart;
  G.activateAbility('time_skip');
  check('T2 second skip same day refused', s.timeSkipDay === 5 && G.dayPart === dp2,
    `timeSkipDay=${s.timeSkipDay} dayPart unchanged=${G.dayPart === dp2}`);
  check('T2b refusal says why', sayLog.some(m => /1\/day/.test(m)), sayLog.slice(-1)[0]);

  // 3) next day it works again
  s.day = 6;
  G.activateAbility('time_skip');
  check('T3 works next day', s.timeSkipDay === 6, `timeSkipDay=${s.timeSkipDay}`);

  // 4) UI: exactly one Time Skip button, honest label, gated availability
  const acts = G.activatableAbilities().filter(a => /time_skip/.test(a.id));
  check('T4 single Time Skip button', acts.length === 1, `found ${acts.length}: ${acts.map(a => a.id).join(',')}`);
  const b = acts[0];
  check('T4b honest label', /1\/day/.test(b.desc) && !/Ages you 1 day/.test(b.desc), b.desc.slice(0, 80));
  check('T4c UI shows used', b.available === false && /today/i.test(b.why || ''), `available=${b.available} why=${b.why}`);

  // 5) combat guard
  s.day = 7; s.timeSkipDay = null;
  G.tbfight = { over: false };
  sayLog.length = 0;
  G.activateAbility('time_skip');
  const refusedCombat = s.timeSkipDay !== 7 && sayLog.some(m => /fight/i.test(m));
  G.tbfight = null;
  check('T5 refused in combat', refusedCombat, sayLog.slice(-1)[0]);

  // 6) ageDebt is dead — nothing writes it anymore
  check('T6 no ageDebt written', (s.ageDebt || 0) === 0, `ageDebt=${s.ageDebt}`);

  // 7) failed activations grant no XP (regression: gate returns false before XP)
  const ab = s.abilities.find(a => a.id === 'time_skip');
  const xpBefore = ab.xp || 0;
  s.day = 7; s.timeSkipDay = 7; // already used today
  G.activateAbility('time_skip');
  check('T7 refused activation grants no XP', (ab.xp || 0) === xpBefore, `xp ${xpBefore} -> ${ab.xp || 0}`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
