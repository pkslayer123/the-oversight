#!/usr/bin/env node
// COMBAT BREAK-IT round 2: double-KO honesty (Steve 2026-10-08).
// Attack: the player kills a winding-up sweeping-beam monster (Highbeam
// class) at low HP. Death throes fire the beam from the corpse and kill the
// player on the same tick. tbEndCheck checked monsters FIRST, so the fight
// ended 'won' for a corpse — the 'lost' death flow (playerDeath ->
// village-as-protagonist respawn) never ran, leaving a 0-HP scholar.
// Fix: player death is checked before the monster-victory check (and before
// the belltoad chorus check — the dead get no encores).
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;

  console.log('--- K1. killing blow + lethal death throes = lost, not won ---');
  const mk = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 10 });
  s.health = 10;
  const m = Game.tbFighter(mk);
  // sweep-beam monster, never fired: death throes will loose the beam
  m.mdef = Object.assign({}, m.mdef, {
    attack: { damage: [40, 60], name: 'Sweep Beam', pattern: { sweep: true, type: 'beam', length: 5 } },
  });
  let deaths = 0;
  const _pd = Game.playerDeath;
  Game.playerDeath = function (c) { deaths++; return _pd.call(this, c); };
  Game.tbDamage(mk, 9999, 'you'); // killing blow -> throes -> player dies
  const p = Game.tbFighter('p');
  check('K1 player died to the throes', !p.alive, `alive=${p.alive}, hp=${p.hp}`);
  check('K1 monster died', !m.alive);
  const f = Game.tbfight; // capture: tbEnd nulls Game.tbfight in finally
  const ended = Game.tbEndCheck();
  Game.playerDeath = _pd;
  check('K1 fight ended', ended === true && f.over, `ended=${ended}`);
  check('K1 result is lost (death flow ran)', f.result === 'lost', `result=${f.result}`);
  check('K1 playerDeath ran (respawn flow)', deaths === 1, `deaths=${deaths}`);

  console.log('--- K2. clean kill at full HP still wins ---');
  const mk2 = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 300 });
  s.health = 100;
  Game.tbFighter('p').hp = 300;
  const m2 = Game.tbFighter(mk2);
  m2.mdef = Object.assign({}, m2.mdef, {
    attack: { damage: [40, 60], name: 'Sweep Beam', pattern: { sweep: true, type: 'beam', length: 5 } },
  });
  Game.tbDamage(mk2, 9999, 'you');
  const p2 = Game.tbFighter('p');
  check('K2 player survived the throes', p2.alive, `hp=${p2.hp}`);
  const f2 = Game.tbfight;
  Game.tbEndCheck();
  check('K2 result is won', f2.result === 'won', `result=${f2.result}`);

  console.log('--- K3. second wind still gets its chance on double-KO ---');
  const mk3 = H.synthFight(Game, 'bulldozer', { mhp: 30, php: 10 });
  s.health = 10;
  const m3 = Game.tbFighter(mk3);
  m3.mdef = Object.assign({}, m3.mdef, {
    attack: { damage: [40, 60], name: 'Sweep Beam', pattern: { sweep: true, type: 'beam', length: 5 } },
  });
  // grant Refuse Death
  const def = Game.data.abilities.find(a => a.id === 'second_wind') || {};
  (s.abilities = s.abilities || []).push({ id: 'second_wind', name: def.name || 'second_wind', level: 1, xp: 0 });
  s.refuseDay = -1;
  Game.tbDamage(mk3, 9999, 'you');
  Game.tbEndCheck();
  const p3 = Game.tbFighter('p');
  const f3 = Game.tbfight;
  check('K3 cheat-death revives instead of ending lost', p3.alive && f3 && !f3.over,
    `alive=${p3.alive}, over=${f3 && f3.over}, result=${f3 && f3.result}`);
  s.abilities = (s.abilities || []).filter(a => a.id !== 'second_wind');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
