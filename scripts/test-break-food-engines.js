// BREAK-IT: food economy infinite-engine attacks.
// 1) blood_magic x2 + field_medicine + time_skip loop: does time_skip's
//    costless day-part advance reset the blood cap -> unbounded calories?
// 2) cannibal_frenzy starvation loop: re-trigger cost honesty.
// 3) blood_magic cap enforcement: 10 activations in one day part.
'use strict';
const h = require('./break-monsters-harness.js');

function grantAbility(G, id) {
  const s = G.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.find(a => a.id === id))
    s.abilities.push({ id, name: id, level: 1, xp: 0 });
  G.hasAbility = G.hasAbility || function (x) {
    return (s.abilities || []).some(a => a.id === x) ||
           (s.backgroundAbilities || []).some(a => a.id === x);
  };
  // ensure the (possibly wrapped) hasAbility sees it
  if (!s.abilities.find(a => a.id === id)) s.abilities.push({ id, name: id });
}

async function main() {
  const G = await h.freshGame(4242);
  const s = G.state.scholar;
  const origHasAbility = G.hasAbility.bind(G);
  G.hasAbility = function (id) {
    return origHasAbility(id) || (s.abilities || []).some(a => a.id === id);
  };
  grantAbility(G, 'blood_magic');
  grantAbility(G, 'field_medicine');
  grantAbility(G, 'time_skip');
  // silence spam
  const sayLog = [];
  G.say = function (m) { sayLog.push(String(m)); };

  console.log('--- TEST 1: blood cap within one day part ---');
  s.health = 100; s.kcal = 0; s.day = 1; G.dayPart = 1;
  for (let i = 0; i < 10; i++) G.activateAbility('blood_magic');
  console.log('kcal after 10 activations:', s.kcal, '(expect <= 1000+bank-cap clamp)',
              'bloodPriceUses:', s.bloodPriceUses, 'health:', s.health);

  console.log('--- TEST 2: time_skip resets blood cap -> engine? ---');
  s.health = 100; s.kcal = 0; s.day = 1; G.dayPart = 1;
  s.bloodPriceUses = 0; s.bloodPriceDayPart = null; s.fieldMedDayPart = null;
  const kcal0 = s.kcal, day0 = s.day, age0 = s.ageDebt || 0, hp0 = s.health;
  for (let cycle = 0; cycle < 40; cycle++) {
    G.activateAbility('blood_magic');
    G.activateAbility('blood_magic');
    G.activateAbility('field_medicine');
    G.activateAbility('time_skip');
  }
  const net = s.kcal - kcal0;
  console.log(`after 40 cycles: day ${day0}->${s.day}, kcal +${net}, hp ${hp0}->${s.health}, ageDebt ${age0}->${s.ageDebt || 0}`);
  console.log('VERDICT-ENGINE:', net > 5000 ? 'BROKEN: unbounded calorie engine' : 'held');
  console.log('ageDebt consumed anywhere? (grep says no) -> time_skip cost is DEAD');

  console.log('--- TEST 3: cannibal_frenzy gating ---');
  s.kcal = 0;
  for (let i = 0; i < 5; i++) G.activateAbility('cannibal_frenzy');
  console.log('kcal after 5 frenzies from 0:', s.kcal, '(expect 1000: gate blocks repeat while fed)');
  s.kcal = 400;
  G.activateAbility('cannibal_frenzy');
  console.log('kcal at 400 +frenzy:', s.kcal, '(expect 1400)');
  console.log('trust keys sample:', JSON.stringify(Object.entries(s.trust || {}).slice(0,3)), 'village trust:', JSON.stringify(Object.entries((G.state.village.trust||{})).slice(0,3)));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
