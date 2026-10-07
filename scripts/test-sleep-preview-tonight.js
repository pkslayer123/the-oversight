// Sleep honest-button: tonight's burn (2026-10-06).
// Usage: node scripts/test-sleep-preview-tonight.js
// BUG (survivalist water-tax playtest): sleepPreview() only warned at the
// metabolic crisis (kcal<=0 or hydration<=0). A player going to bed at
// kcal=1500 or hydration=30 got NO warning, then midnight ran a full day's
// metabolism (~2200 kcal, -35 hydration) BEFORE the morning meal and dealt
// STARVING/DEHYDRATED damage — a gotcha, not a telegraphed spiral.
// calories.js states the design rule: "warnings telegraph the spiral BEFORE
// it arrives." The fix adds a second warning tier: warn when tonight's burn
// will START the spiral (kcal < dailyNeed, hydration <= 35).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;
  Game.travelTo(Game.state.village.px ?? 3, Game.state.village.py ?? 3);
  Game.state.weather = 'clear'; // no cold-snap warning to confound the metabolic one
  s().trauma = 0;

  // 1. HUNGRY TONIGHT: kcal below the night's burn -> warn names the burn.
  s().kcal = 1500; s().hydration = 100;
  let pv = Game.sleepPreview();
  check('hungry tonight warns', /Tonight will cost you/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);
  check('hungry tonight names kcal', /kcal/.test(pv.warn || ''), `warn="${pv.warn || ''}"`);

  // 2. THIRSTY TONIGHT: hydration at/below 35 -> warn names the drink.
  s().kcal = 3000; s().hydration = 30;
  pv = Game.sleepPreview();
  check('thirsty tonight warns', /Tonight will cost you/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);
  check('thirsty tonight names hydration', /hydration/.test(pv.warn || ''), `warn="${pv.warn || ''}"`);

  // 3. BOTH: single warning covers both.
  s().kcal = 1500; s().hydration = 30;
  pv = Game.sleepPreview();
  check('both bands: one warning, both named',
    /Tonight will cost you/i.test(pv.warn || '') && /kcal/.test(pv.warn || '') && /hydration/.test(pv.warn || ''),
    `warn="${pv.warn || ''}"`);

  // 4. WELL-FED: no metabolic warning.
  s().kcal = 3000; s().hydration = 100;
  pv = Game.sleepPreview();
  check('well-fed: no metabolic warning', !/Tonight will cost you|Running on empty/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);

  // 5. CRISIS INTACT: the old empty warning still fires (existing contract).
  s().kcal = 3000; s().hydration = 0;
  pv = Game.sleepPreview();
  check('crisis still warns on empty', /Running on empty/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);
  s().kcal = 0; s().hydration = 100;
  pv = Game.sleepPreview();
  check('crisis still warns on starving', /Running on empty/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);

  // 6. BOUNDARY: kcal exactly at daily need -> no warn (resolveDay only bites below 0).
  s().hydration = 100;
  s().kcal = globalThis.Scattering.calories.dailyNeed(s());
  pv = Game.sleepPreview();
  check('kcal == dailyNeed: no warn', !/Tonight will cost you/i.test(pv.warn || ''), `need=${globalThis.Scattering.calories.dailyNeed(s())} warn="${pv.warn || ''}"`);
  // hydration exactly 36 -> no warn (36-35=1, survives); 35 -> warn.
  s().kcal = 3000; s().hydration = 36;
  pv = Game.sleepPreview();
  check('hydration 36: no warn', !/Tonight will cost you/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);
  s().hydration = 35;
  pv = Game.sleepPreview();
  check('hydration 35: warns', /Tonight will cost you/i.test(pv.warn || ''), `warn="${pv.warn || ''}"`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
