#!/usr/bin/env node
// COMBAT BREAK-IT: ability-activation exploits (Steve 2026-10-08).
// Attacks:
//   A. FREE XP LOOP — failed activateAbility() calls grant XP + synergy
//      attempts with zero cost (gainAbilityXP runs BEFORE failure checks).
//   B. DEAD BUTTON — "Bury Food" (compost_king) is listed in the UI but
//      activateAbility('compost_king') has no branch: silent no-op (+free XP).
//   C. MERGE BUG — purify's branch swallowed compost_king's body: purifying
//      poison ALSO buries food; "No food to bury" fails AFTER the cure.
//   D. DEAD WIRING — data-driven actions listed as 'abilityId.actionId'
//      (e.g. 'tracker.track') fall through activateAbility silently: the
//      whole ABILITY_ACTION_IMPLS table is unreachable from the UI.
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function holdAbility(Game, s, id, level) {
  const def = Game.data.abilities.find(a => a.id === id) || {};
  let e = (s.backgroundAbilities || []).find(a => a.id === id) || (s.abilities || []).find(a => a.id === id);
  if (!e) { e = { id, name: def.name || id, desc: '', level, xp: 0 }; (s.abilities = s.abilities || []).push(e); }
  else { e.level = level; e.xp = 0; }
  return e;
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const xpOf = (id) => {
    const e = (s.backgroundAbilities || []).find(a => a.id === id) || (s.abilities || []).find(a => a.id === id);
    return e ? (e.xp || 0) : null;
  };

  console.log('--- A. failed blood_magic must not grant XP ---');
  holdAbility(Game, s, 'blood_magic', 1);
  s.health = 5; // too weak: cost is 10
  const xpBefore = xpOf('blood_magic');
  Game.activateAbility('blood_magic');
  check('A health unchanged (activation failed)', s.health === 5, 'health=' + s.health);
  check('A no XP granted for failed activation', xpOf('blood_magic') === xpBefore,
    `xp ${xpBefore} -> ${xpOf('blood_magic')}`);

  console.log('--- A2. failed echo_location (already echoed) must not grant XP ---');
  holdAbility(Game, s, 'echo_location', 1);
  s.echoDay = s.day;
  const xpBefore2 = xpOf('echo_location');
  Game.activateAbility('echo_location');
  check('A2 no XP granted for failed activation', xpOf('echo_location') === xpBefore2,
    `xp ${xpBefore2} -> ${xpOf('echo_location')}`);

  console.log('--- A3. unknown ability id must not grant XP/log uses ---');
  const logBefore = (s.abilityUseLog || []).length;
  Game.activateAbility('no_such_ability_xyz');
  check('A3 unknown id logs no use', (s.abilityUseLog || []).length === logBefore,
    `log ${logBefore} -> ${(s.abilityUseLog || []).length}`);

  console.log('--- B. compost_king "Bury Food" must actually bury ---');
  holdAbility(Game, s, 'compost_king', 1);
  s.inventory = [{ name: 'Test Berries', kcalEach: 50, units: 2, spoilDay: 99 }];
  const invBefore = s.inventory[0].units;
  Game.activateAbility('compost_king');
  const buried = s.inventory.length === 0 || (s.inventory[0] && s.inventory[0].units === invBefore - 1);
  check('B food was buried (inventory decreased)', buried, JSON.stringify(s.inventory).slice(0, 80));

  console.log('--- C. purify must cure poison and NOT touch food ---');
  holdAbility(Game, s, 'purify', 1);
  s.poisons = [{ id: 'test_poison' }];
  s.purifyDay = -1;
  s.inventory = [{ name: 'Test Nuts', kcalEach: 100, units: 3, spoilDay: 99 }];
  Game.activateAbility('purify');
  check('C poison cured', (s.poisons || []).length === 0, JSON.stringify(s.poisons));
  check('C food NOT buried by purify', s.inventory.length === 1 && s.inventory[0].units === 3,
    JSON.stringify(s.inventory).slice(0, 80));

  console.log('--- D. composite data-driven id routes to useAbility ---');
  holdAbility(Game, s, 'tracker', 1);
  s.abilityUseLog = [];
  const xpTBefore = xpOf('tracker');
  Game.activateAbility('tracker.track');
  const trackerUses = (s.abilityUseLog || []).filter(u => u.id === 'tracker').length;
  const garbageUses = (s.abilityUseLog || []).filter(u => u.id === 'tracker.track').length;
  check('D use logged against tracker (not the composite id)', trackerUses >= 1 && garbageUses === 0,
    `tracker uses=${trackerUses}, composite uses=${garbageUses}`);
  check('D XP granted to tracker exactly once', xpOf('tracker') === xpTBefore + 1,
    `xp ${xpTBefore} -> ${xpOf('tracker')}`);

  console.log(`\n${fail ? 'BROKEN' : 'HELD'} — ${pass} pass, ${fail} fail (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
