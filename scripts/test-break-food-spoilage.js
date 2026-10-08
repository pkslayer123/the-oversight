// BREAK-IT: spoilage-boundary unification.
// BEFORE: preservation_instinct's +days bonus was honored ONLY in eat()/
// eatOne(). The dawn sweep discarded food the eater would still accept;
// stash/pantry labels cried "SPOILED" on good food; processing gates
// (clean/cook/preserve/donate/askSpecialist/eatStashOne) refused it.
// AFTER: isSpoiled() defaults the bonus — one boundary everywhere;
// labels use the same boundary; corpse/caches keep the raw clock
// (the earth doesn't grade on storage technique).
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(555);
  const s = G.state.scholar;
  G.say = () => {};
  // grant preservation_instinct L2 -> +4 days (value 2, scale level)
  s.abilities = [{ id: 'preservation_instinct', name: 'Preservation Instinct', level: 2, xp: 0 }];
  const bonus = G.spoilBonusDays();
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };
  check('S0 bonus reads', bonus === 4, `spoilBonusDays()=${bonus}`);

  const mk = (spoilDay) => ({ name: 'Venison (smoked)', kcalEach: 90, units: 2, spoilDay,
    safe: true, kg: 0.2, unit: 'portion', foodKind: 'meat', foodState: 'preserved', edible: true });

  // S1: food within the bonus window is NOT spoiled (day 10, spoilDay 8, bonus 4 -> eff 12 > 10)
  s.day = 10;
  check('S1 bonus window not spoiled', G.isSpoiled(mk(8)) === false, 'spoilDay 8 + bonus 4 > day 10');
  check('S1b past bonus IS spoiled', G.isSpoiled(mk(6)) === true, 'spoilDay 6 + bonus 4 = 10 <= day 10');

  // S2: dawn sweep keeps bonus-window food
  s.inventory = [mk(8), mk(6)];
  G.state.village.pantry = [mk(8), mk(6)];
  G.sweepSpoiled();
  const invLeft = s.inventory.map(i => i.spoilDay).join(',');
  const panLeft = G.state.village.pantry.map(i => i.spoilDay).join(',');
  check('S2 sweep keeps bonus food (pack)', invLeft === '8', `pack left: ${invLeft}`);
  check('S2b sweep keeps bonus food (pantry)', panLeft === '8', `pantry left: ${panLeft}`);

  // S3: labels agree — stashClock / spoilClockShort bonus-aware
  check('S3 stashClock', G.stashClock(mk(8)) === 'spoils in 2d', G.stashClock(mk(8)));
  check('S3b spoilClockShort silent in window', G.spoilClockShort(mk(9)) === '', JSON.stringify(G.spoilClockShort(mk(9))));

  // S4: processing gates accept bonus-window food (donate path)
  s.inventory = [mk(8)];
  G.state.village.pantry = [];
  G.location = 'haven';
  const v0 = G.state.village.pantry.length;
  G.donateToPantry(0);
  check('S4 donate accepts bonus-window food', G.state.village.pantry.length === v0 + 1,
    `pantry ${v0} -> ${G.state.village.pantry.length}`);

  // S5: corpse clock stays raw (no bonus underground/in the woods)
  check('S5 corpse boundary raw', G.isSpoiled(mk(8), 0) === true, 'explicit 0 bonus: spoilDay 8 <= day 10');

  // S6: eat still works (regression)
  s.kcal = 0;
  s.inventory = [mk(8)];
  G.eatOne(0);
  check('S6 eatOne eats bonus-window food', s.kcal > 0, `kcal=${s.kcal}`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
