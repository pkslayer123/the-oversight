#!/usr/bin/env node
// COMBAT BREAK-IT round 2: mid-combat HP routing + consumable action costs
// (Steve 2026-10-08).
// Attacks:
//   R1. PHANTOM HEAL — useItem (first aid / healAmount) wrote scholar.health
//       directly. In a fight the live pool is the fighter's p.hp; tbEnd
//       overwrites s.health from p.hp, so the "+30 health" message was a lie
//       and the heal never landed. Also cost NO combat action.
//   R2. FREE DRINK — drinkWater() in combat cost tickAction(1), which is a
//       no-op mid-fight: unlimited free hydration. Risky-water -15 also wrote
//       the wrong pool (erased at fight end).
//   R3. FREE BAD-FOOD DAMAGE — eatOne's poison/disease/unsafe-food damage
//       wrote scholar.health directly: eat risky food mid-fight, take the
//       kcal, the damage vanished at tbEnd.
//   R4. PHANTOM FIELD MEDICINE — field_medicine (combat:true) healed
//       scholar.health: +20 HP promised, nothing delivered in a fight.
// Fix: Game.addHealth(n) routes to the fighter in combat (can end the fight);
// useItem/drinkWater spend the combat action mid-fight.
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
  return e;
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;

  console.log('--- R1. useItem heal lands on the fighter and costs the action ---');
  H.synthFight(Game, 'bulldozer', { mhp: 60, php: 50 });
  s.health = 50;
  const p = Game.tbFighter('p');
  let monsterTurns = 0;
  const _mt = Game.tbMonsterTurn;
  Game.tbMonsterTurn = function (m) { monsterTurns++; return _mt.call(this, m); };
  s.inventory.push({ itemId: 'bandana', id: 'bandana', name: 'Bandana', units: 1, kcalEach: 0 });
  const msgs1 = []; const _say1 = Game.say;
  Game.say = m => { msgs1.push(String(m)); return _say1.call(Game, m); };
  Game.useItem(s.inventory.length - 1);
  Game.say = _say1;
  Game.tbMonsterTurn = _mt;
  // the stated amount varies with roster healing modifiers — parse it
  const mAmt = (msgs1.join(' ').match(/\+(\d+) health/) || [])[1];
  const amt = mAmt ? parseInt(mAmt, 10) : 10;
  check('R1 fighter healed (stated amount)', p.hp === 50 + amt, `p.hp=${p.hp}, stated +${amt}`);
  check('R1 scholar synced', s.health === 50 + amt, `s.health=${s.health}`);
  check('R1 combat action spent (turn advanced to the monster)', monsterTurns > 0, `monsterTurns=${monsterTurns}`);
  if (Game.tbfight) Game.tbEnd('fled');

  console.log('--- R2. drinkWater costs the action; risky water hits the fighter ---');
  H.synthFight(Game, 'bulldozer', { mhp: 60, php: 50 });
  s.health = 50;
  const p2 = Game.tbFighter('p');
  s.water = [{ quality: 'clean', source: 'test' }];
  s.hydration = 0;
  let monsterTurns2 = 0;
  const _mt2 = Game.tbMonsterTurn;
  Game.tbMonsterTurn = function (m) { monsterTurns2++; return _mt2.call(this, m); };
  Game.drinkWater();
  Game.tbMonsterTurn = _mt2;
  check('R2 drink costs the combat action (turn advanced)', monsterTurns2 > 0, `monsterTurns=${monsterTurns2}`);
  check('R2 hydration applied', s.hydration === 50, `hydration=${s.hydration}`);
  // risky: force the 30% sickness roll by seeding attempts (deterministic seed;
  // try up to a few fresh fights — the seeded RNG decides)
  let sickHit = false;
  for (let i = 0; i < 6 && !sickHit; i++) {
    if (Game.tbfight) Game.tbEnd('fled');
    H.synthFight(Game, 'bulldozer', { mhp: 60, php: 50 });
    s.health = 50;
    const pp = Game.tbFighter('p');
    s.water = [{ quality: 'risky', source: 'test' }];
    s.hydration = 0;
    const hpBefore = pp.hp;
    Game.drinkWater();
    if (pp.hp < hpBefore) { sickHit = true; check('R2 risky water damage hits the fighter', pp.hp === hpBefore - 5, `hp ${hpBefore} -> ${pp.hp} (disease rework 2026-10-09: -5 + gut rot, was flat -15)`); }
  }
  if (!sickHit) check('R2 risky water damage hits the fighter (seed never rolled sick)', false, 'no sickness in 6 attempts');
  if (Game.tbfight) Game.tbEnd('fled');

  console.log('--- R3. bad-food damage hits the fighter mid-combat ---');
  H.synthFight(Game, 'bulldozer', { mhp: 60, php: 50 });
  s.health = 50;
  const p3 = Game.tbFighter('p');
  s.inventory.push({ name: 'Sketchy bits', units: 1, kcalEach: 100, diseaseRisk: { p: 1, dmg: 7, note: 'test' } });
  let monsterTurns3 = 0;
  const _mt3 = Game.tbMonsterTurn;
  Game.tbMonsterTurn = function (m) { monsterTurns3++; return _mt3.call(this, m); };
  Game.eatOne(s.inventory.length - 1);
  Game.tbMonsterTurn = _mt3;
  check('R3 disease damage hits the fighter', p3.hp === 43, `p.hp=${p3.hp}`);
  check('R3 scholar synced', s.health === 43, `s.health=${s.health}`);
  check('R3 eating still costs the action (turn advanced)', monsterTurns3 > 0, `monsterTurns=${monsterTurns3}`);
  if (Game.tbfight) Game.tbEnd('fled');

  console.log('--- R4. field_medicine heals the fighter ---');
  holdAbility(Game, s, 'field_medicine', 1);
  H.synthFight(Game, 'bulldozer', { mhp: 60, php: 50 });
  s.health = 50;
  const p4 = Game.tbFighter('p');
  s.kcal = 500;
  Game._activateAbilityInner('field_medicine');
  check('R4 fighter healed +20', p4.hp === 70, `p.hp=${p4.hp}`);
  check('R4 scholar synced', s.health === 70, `s.health=${s.health}`);
  if (Game.tbfight) Game.tbEnd('fled');

  console.log('--- R5. out-of-combat behavior unchanged ---');
  s.health = 50;
  Game.addHealth(10);
  check('R5 heal clamps normally out of combat', s.health === 60, `s.health=${s.health}`);
  Game.addHealth(-200);
  check('R5 damage floors at 0 out of combat', s.health === 0, `s.health=${s.health}`);

  console.log('--- R6. trade_of_blows HP cost hits the fighter (sibling sweep) ---');
  const tdef = Game.data.abilities.find(a => a.id === 'trade_of_blows') || {};
  (s.backgroundAbilities = s.backgroundAbilities || []).push({ id: 'trade_of_blows', name: tdef.name || 'trade_of_blows', level: 1, xp: 0 });
  H.synthFight(Game, 'bulldozer', { mhp: 60, php: 50 });
  s.health = 50;
  const p6 = Game.tbFighter('p');
  Game.useAbility('trade_of_blows', 'open_trade');
  check('R6 HP cost deducted from the fighter', p6.hp === 40, `p.hp=${p6.hp}`);
  check('R6 scholar synced', s.health === 40, `s.health=${s.health}`);
  // would-kill block still guards (fighter at 5 HP can't pay 10)
  if (Game.tbfight) Game.tbEnd('fled');
  H.synthFight(Game, 'bulldozer', { mhp: 60, php: 5 });
  s.health = 5;
  const msgs6 = []; const _say6 = Game.say;
  Game.say = m => { msgs6.push(String(m)); return _say6.call(Game, m); };
  Game.useAbility('trade_of_blows', 'open_trade');
  Game.say = _say6;
  check('R6 would-kill cost refused', Game.tbFighter('p').hp === 5 && msgs6.some(m => /Too weak/.test(m)),
    `hp=${Game.tbFighter('p').hp}`);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(a => a.id !== 'trade_of_blows');
  if (Game.tbfight) Game.tbEnd('fled');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
