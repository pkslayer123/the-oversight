// Drifter generosity: a traveler at another village's fire can share food.
// Steve 2026-10-05 (drifter loop): the smoke line promises "food would talk
// here" — villageShareFood is the mechanic behind the promise. Real cost
// (from your pack), real memory (pantry + named trust bump, gossip home).
// Usage: node scripts/test-village-share-food.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js', 'src/js/justice.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

const ME = () => Game.state.scholar.villagerId;
const said = [];
function atVillage(v) { Game.map.px = v.x; Game.map.py = v.y; }
function setPack(kcal) { Game.state.village.pack = Game.state.village.pack || {}; Game.state.village.pack[ME()] = { day: Game.state.scholar.day, kcal }; }
function freshSetup() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.otherVillages[0];
  v.day = Game.state.scholar.day; // catch-up is a no-op: we control the pantry
  v.trust = 0; v.lastGiftDay = -1; v.lastTalkDay = -1;
  atVillage(v);
  return v;
}

(async () => {
  await Game.init();
  const _say = Game.say.bind(Game);
  Game.say = (m) => { said.push(m); return _say(m); };

  // ---------- 1. card offers sharefood tiers at the fire ----------
  let v = freshSetup();
  setPack(2000);
  let card = Game.villageCard(v.id);
  const ids = (card.actions || []).map(a => a.id);
  ok('1a: card shows talk', ids.includes('talk'));
  ok('1b: card shows sharefood', ids.includes('sharefood'));
  const tiers = (card.actions || []).filter(a => a.id === 'sharefood').map(a => a.giftKcal).sort((a, b) => a - b);
  ok('1c: both tiers offered', JSON.stringify(tiers) === '[700,1500]');
  ok('1d: labels name the cost', card.actions.filter(a => a.id === 'sharefood').every(a => /700 kcal|1500 kcal/.test(a.label)));

  // ---------- 2. broke pack: no sharefood on the card ----------
  v = freshSetup();
  setPack(300);
  card = Game.villageCard(v.id);
  ok('2: no sharefood when pack < 700', !(card.actions || []).some(a => a.id === 'sharefood'));

  // ---------- 3. far away: no at-fire actions ----------
  v = freshSetup();
  setPack(2000);
  Game.map.px = 3; Game.map.py = 3; // home, far from village
  card = Game.villageCard(v.id);
  ok('3a: no sharefood from afar', !(card.actions || []).some(a => a.id === 'sharefood'));
  ok('3b: hint to walk there', !!card.hint);

  // ---------- 4. broke sharefood: honest refusal, nothing moves ----------
  v = freshSetup();
  setPack(300);
  v.pantryKcal = 5000;
  said.length = 0;
  const r4 = Game.villageShareFood(v.id, { giftKcal: 700 });
  ok('4a: broke gift returns null', r4 === null);
  ok('4b: pantry unchanged', v.pantryKcal === 5000);
  ok('4c: trust unchanged', (v.trust || 0) === 0);
  ok('4d: says why, names the numbers', said.some(t => /don't carry enough/.test(t) && /300/.test(t) && /700/.test(t)));

  // ---------- 5. 700 gift: pack, pantry, trust all move ----------
  v = freshSetup();
  setPack(2000);
  v.pantryKcal = 5000; v.trust = 0;
  said.length = 0;
  const r5 = Game.villageShareFood(v.id, { giftKcal: 700 });
  ok('5a: returns true', r5 === true);
  ok('5b: pack spent', Game.packKcal(ME()) === 1300);
  ok('5c: pantry gains the food', v.pantryKcal === 5700);
  ok('5d: trust +10 for a day of food', v.trust === 10);
  ok('5e: say line names gift + trust', said.some(t => /700 kcal/.test(t) && /trust \+10/.test(t)));

  // ---------- 6. lean bonus: an empty pot remembers harder ----------
  v = freshSetup();
  setPack(2000);
  v.pantryKcal = 0; v.trust = 0;
  said.length = 0;
  Game.villageShareFood(v.id, { giftKcal: 700 });
  ok('6a: lean trust +14', v.trust === 14);
  ok('6b: lean line in text', said.some(t => /pot was empty/i.test(t)));

  // ---------- 7. feast tier: +18 ----------
  v = freshSetup();
  setPack(3000);
  v.pantryKcal = 5000; v.trust = 0;
  Game.villageShareFood(v.id, { giftKcal: 1500 });
  ok('7a: feast trust +18', v.trust === 18);
  ok('7b: pantry +1500', v.pantryKcal === 6500);
  ok('7c: pack -1500', Game.packKcal(ME()) === 1500);

  // ---------- 8. same-day repeat: diminished ----------
  v = freshSetup();
  setPack(4000);
  v.pantryKcal = 5000; v.trust = 0;
  Game.villageShareFood(v.id, { giftKcal: 700 });
  const t1 = v.trust;
  Game.villageShareFood(v.id, { giftKcal: 700 });
  ok('8: second gift same day capped at +6', v.trust - t1 === 6);

  // ---------- 9. trust caps at 100 ----------
  v = freshSetup();
  setPack(4000);
  v.pantryKcal = 5000; v.trust = 96;
  Game.villageShareFood(v.id, { giftKcal: 1500 });
  ok('9: trust capped at 100', v.trust === 100);

  // ---------- 10. gift clamps to what you carry ----------
  v = freshSetup();
  setPack(900);
  v.pantryKcal = 5000; v.trust = 0;
  Game.villageShareFood(v.id, { giftKcal: 1500 });
  ok('10: gift clamps to pack (900 given)', v.pantryKcal === 5900 && Game.packKcal(ME()) === 0);

  // ---------- 11. exiled: petition instead ----------
  v = freshSetup();
  setPack(2000);
  Game.state.scholar.exiled = true;
  said.length = 0;
  const r11 = Game.villageShareFood(v.id, { giftKcal: 700 });
  ok('11a: exiled gift refused', r11 === null);
  ok('11b: redirected to petition', said.some(t => /Petition them instead/.test(t)));
  ok('11c: pack untouched', Game.packKcal(ME()) === 2000);
  Game.state.scholar.exiled = false;

  // ---------- 12. not at their fire: walk there first ----------
  v = freshSetup();
  setPack(2000);
  Game.map.px = 3; Game.map.py = 3;
  said.length = 0;
  const r12 = Game.villageShareFood(v.id, { giftKcal: 700 });
  ok('12a: far gift refused', r12 === null);
  ok('12b: face-to-face line', said.some(t => /Walk there first/.test(t)));

  // ---------- 13. routed through villageCardAction ----------
  v = freshSetup();
  setPack(2000);
  v.pantryKcal = 5000; v.trust = 0;
  const r13 = Game.villageCardAction(v.id, 'sharefood', { giftKcal: 700 });
  ok('13: card action routes', r13 === true && v.pantryKcal === 5700);

  // ---------- 14. talk regression: sit still works ----------
  v = freshSetup();
  said.length = 0;
  const r14 = Game.villageTalk(v.id);
  ok('14: talk still works', r14 === true && said.some(t => /You sit with/.test(t)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
