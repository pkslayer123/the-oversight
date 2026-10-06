// Proof tests (survivalist loop 2026-10-06): three honest-button fixes.
// 1. drinkWater at >=95 hydration refuses instead of silently burning a liter.
// 2. sleep() in the wild says the sleepPreview line before committing
//    (the haven panel already renders it — no duplicate there).
// 3. doAction('rest') routes its kcal cost through ACTION_COSTS.rest
//    (the master-clock contract); the message names the cost.
// Usage: node scripts/test-survivalist-honesty-20261006.js  (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
const said = [];
Game.say = function (t) { said.push(String(t)); return t; };
const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // --- FIX 1: not-thirsty guard ---
  said.length = 0;
  s.hydration = 96;
  const bottlesBefore = (s.water || []).length;
  Game.drinkWater();
  check('drink at 96 hydration refuses', (s.water || []).length === bottlesBefore && said.join(' ').includes("not thirsty"),
    `bottles ${bottlesBefore}->${(s.water || []).length}, said=${said.join(' ').slice(0, 80)}`);
  said.length = 0;
  s.hydration = 50;
  const b2 = (s.water || []).length;
  Game.drinkWater();
  check('drink at 50 hydration consumes and hydrates', (s.water || []).length === b2 - 1 && Math.round(s.hydration) === 100,
    `bottles ${b2}->${(s.water || []).length}, hyd=${Math.round(s.hydration)}`);

  // --- FIX 2: wild sleep says the preview line ---
  Game.map.px = 0; Game.map.py = 0; // wilderness (haven is at 3,3)
  s.dayTicks = 300; // mid/late day, not dawn — sleep allowed
  s.hydration = 80; s.kcal = 2500; s.energy = 50; s.health = 90;
  said.length = 0;
  try { Game.sleep(); } catch (e) { console.log('SLEEP ERROR: ' + e.message); failures.push('sleep threw'); }
  const sleepSays = said.join(' ');
  check('wild sleep announces the honest preview line', /Sleeping rough means .*heal ~\d+/.test(sleepSays),
    sleepSays.match(/Sleeping rough means[^.]*\./)?.[0] || sleepSays.slice(0, 120));

  // --- FIX 3: rest cost flows through the master clock ---
  check('ACTION_COSTS.rest is the played cost, not dead -200', S.calories.ACTION_COSTS.rest === 40,
    'ACTION_COSTS.rest=' + S.calories.ACTION_COSTS.rest);
  const kcalBefore = Math.round(s.kcal || 0);
  said.length = 0;
  try { Game.doAction('rest'); } catch (e) { console.log('REST ERROR: ' + e.message); failures.push('rest threw'); }
  const kcalAfter = Math.round(s.kcal || 0);
  check('rest burns exactly ACTION_COSTS.rest kcal', kcalBefore - kcalAfter === S.calories.ACTION_COSTS.rest,
    `${kcalBefore}->${kcalAfter} (cost ${S.calories.ACTION_COSTS.rest})`);
  check('rest message names the kcal cost', said.join(' ').includes(`-${S.calories.ACTION_COSTS.rest} kcal`),
    said.join(' ').slice(0, 140));

  if (failures.length) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
  console.log('ALL SURVIVALIST-HONESTY TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
