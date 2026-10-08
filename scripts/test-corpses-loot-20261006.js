// Proof: corpses.js deepening — visible rot clock, tense loot voice,
// honest unknown-flesh gates, keepsake weight. Steve 2026-10-06.
//
// BEFORE (f870716): loot-as-action wired (take/use/eat/leave, no auto-loot,
// meat rots on the body via sweepSpoiled) but the loot moment was flat:
//  - examineCorpse showed NO rot countdown — the player only learned about
//    rot in the overnight announcement, after the decision was made.
//  - _corpseFirstTouch had no sensory voice — opening a body felt like a menu.
//  - corpseEatItem said "That's not food." for unknown carcass meat — a lie;
//    maybe it IS food, you just don't know.
//  - taking a keepsake (the photograph) got the generic "Taken: ..." beat,
//    trauma only, no voice for the choice.
// AFTER: the rot deadline reads on the body at the moment of decision;
// every rot stage has its own sensory beat; unknown flesh is honest;
// the keepsake take is named for what it is.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/corpses.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

// capture say() so we can judge the voice, not just the mechanics
const sayLog = [];
const origSay = Game.say;
Game.say = function (t) { sayLog.push(String(t)); try { origSay.call(Game, t); } catch (e) {} };
const clearSay = () => { sayLog.length = 0; };
const said = (sub) => sayLog.some(l => l.includes(sub));
const dump = (sub) => sayLog.find(l => l.includes(sub));

function mkMonsterCorpse(s, meatSpoilOffset, extraItems) {
  return Game.registerDeath({
    kind: 'monster', monsterId: 'proof_beast', monsterName: 'Proof Beast',
    name: 'Proof Beast', mx: 5, my: 5, cause: 'combat', killerId: Game.villagerId,
    descriptor: 'something proof-sized', witnesses: [],
    items: [{ plantId: 'meat_proof_beast', foodKind: 'meat', foodState: 'carcass',
      edible: false, units: 1, kcalEach: 0, hiddenKcal: 900,
      spoilDay: s.day + meatSpoilOffset, name: 'something proof-sized (carcass)',
      unit: 'carcass', kg: 0.9,
      prep: 'A carcass. Clean it with a knife — quickly. Spoils fast.' }].concat(extraItems || []),
  });
}

(async () => {
  await Game.init();
  Game.genRoster('Test');
  Game.newGame('Test', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 5; s.my = 4; // adjacent to the corpses we register
  const day0 = s.day;

  // ---- 1. THE CLOCK: rot countdown reads on the body (examine = "Look closely") ----
  const c1 = mkMonsterCorpse(s, 2);
  clearSay();
  Game.examineCorpse(c1.id);
  ok('examine shows rot countdown', said('more days'));
  console.log(`   feel> ${dump('more days')}`);

  // ---- 2. THE TURNING: one day left reads as a deadline ----
  s.day = day0 + 1;
  clearSay();
  Game.examineCorpse(c1.id);
  ok('examine shows turning state at 1 day left', said('Today or never'));
  console.log(`   feel> ${dump('Today or never')}`);

  // ---- 3. THE MOMENT: first touch has stage voice + rot beat ----
  s.day = day0; // fresh again for the sensory beat
  const c2 = mkMonsterCorpse(s, 2);
  clearSay();
  const takeIdx = c2.items.findIndex(i => i.plantId === 'meat_proof_beast');
  Game.corpseTakeItem(c2.id, takeIdx);
  ok('first-touch sensory beat fires (fresh carcass)', said('still warm'));
  ok('first-touch rot beat rides along', said('more days'));
  ok('take still works', s.inventory.some(i => i.plantId === 'meat_proof_beast'));

  // ---- 4. HONESTY: unknown carcass is not "not food", it's unknown ----
  const c3 = mkMonsterCorpse(s, 3);
  const eatIdx = c3.items.findIndex(i => i.plantId === 'meat_proof_beast');
  const unitsBefore = c3.items[eatIdx].units;
  clearSay();
  const ate = Game.corpseEatItem(c3.id, eatIdx);
  ok('eat on unknown carcass refused (nothing consumed)', ate === null && c3.items[eatIdx].units === unitsBefore);
  ok('no "That\'s not food." lie', !said("That's not food."));
  ok('gate names the honest barrier', said('Clean it') || said('Unknown flesh'));
  console.log(`   feel> ${dump('Clean it') || dump('Unknown flesh')}`);

  // ---- 5. KEEPSAKE WEIGHT: the photograph costs extra, in trauma and voice ----
  const c4 = Game.registerDeath({
    kind: 'person', name: 'A stranger', mx: 5, my: 5, cause: 'combat',
    killerId: 'not_you', witnesses: [],
    items: [{ plantId: 'keepsake', name: 'A creased photograph, faces smiling',
      units: 1, kg: 0.1, kcalEach: 0, spoilDay: 9999, keepsake: true,
      prep: 'Not useful. Not yours. Take it or leave it with them.' }],
  });
  const traumaBefore = s.trauma || 0;
  clearSay();
  Game.corpseTakeItem(c4.id, 0);
  ok('keepsake take has its own voice', said("It was theirs"));
  ok('keepsake take costs the extra +3 trauma', ((s.trauma || 0) - traumaBefore) >= 9); // base 4*1.5=6 + keepsake 3
  console.log(`   feel> ${dump('It was theirs')}`);

  // ---- 6. CONSEQUENCE: meat left on the body rots, and it's announced ----
  s.day = day0;
  const c5 = mkMonsterCorpse(s, 1);
  s.day = day0 + 2; // past spoilDay
  clearSay();
  Game.sweepSpoiled();
  ok('spoiled meat removed from corpse', !c5.items.some(i => i.plantId === 'meat_proof_beast'));
  ok('loss announced, not silent', said('went bad') || said('maggots') || said('cost'));
  console.log(`   feel> ${dump('went bad') || dump('cost') || '(silent — see FAIL above)'}`);

  // ---- 7. STAGE VOICES: bloating reads different from fresh ----
  s.day = day0;
  const c6 = Game.registerDeath({
    kind: 'monster', monsterId: 'old_beast', monsterName: 'Old Beast',
    name: 'Old Beast', mx: 5, my: 5, cause: 'combat', killerId: Game.villagerId,
    descriptor: 'something gone bad', witnesses: [],
    items: [{ plantId: 'proof_trophy', name: 'Sinew cord', units: 1, kg: 0.2,
      kcalEach: 0, spoilDay: 9999 }],
  });
  c6.dayDied = day0 - 3; // bloating stage
  clearSay();
  Game.corpseTakeItem(c6.id, 0);
  ok('bloating has its own sensory beat', said('bloats') || said('wall'));
  console.log(`   feel> ${dump('bloats') || dump('wall')}`);

  // ---- 8. regression: the f870716 loot-as-action core still holds ----
  const packMeatBefore = s.inventory.filter(i => i.plantId === 'meat_proof_beast').length;
  const c7 = mkMonsterCorpse(s, 3);
  const c7Meat = c7.items.find(i => i.plantId === 'meat_proof_beast');
  ok('no auto-loot: registering a kill adds nothing to the pack',
    !!c7Meat && s.inventory.filter(i => i.plantId === 'meat_proof_beast').length === packMeatBefore);
  ok('ontology: corpseRotBeat/corpseMeatRead exposed', typeof Game.corpseRotBeat === 'function' && typeof Game.corpseMeatRead === 'function');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
