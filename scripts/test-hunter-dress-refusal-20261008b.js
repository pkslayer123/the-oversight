#!/usr/bin/env node
// PROOF TEST (hunter break-it 2026-10-08b): Field Dress refusal honesty +
// trap-catch meat yield.
// FAILS on old code, PASSES on new:
//  1. Tapping Field Dress with no carcass in the pack must cost nothing
//     (old: paid 30 min / 40 kcal, then fizzled).
//  2. The refusal must narrate exactly once (old: "No game to dress..."
//     AND "Nothing happened. (Field Dress fizzled.)").
//  3. A trapped catch bakes hunt.meat_yield into the carcass at catch time
//     (old: raw animal.calories; skill bonus never applied to trapped game).
//  4. dress_game never claims a multiplier it doesn't apply (old text:
//     "(Field Dressing ×1.3 — your skill kept more of the carcass.)").
// Deterministic: seeded RNG (mulberry32, SEED env override). Run x3 seeds.
// Run: node scripts/test-hunter-dress-refusal-20261008b.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
 'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const results = [];
const check = (name, cond, detail) => { results.push([name, !!cond]); console.log(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };
function grantAbility(id) { const s = Game.state.scholar; s.abilities = s.abilities || []; if (!s.abilities.includes(id)) s.abilities.push(id); }

(async () => {
  await Game.init();
  console.log('== TEST: hunter dress refusal + trap yield | SEED ' + SEED + ' ==');
  const says = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  const deer = Game.data.animals.find(a => a.id === 'white_tailed_deer');

  // ---- 1+2: refused tap costs nothing, narrates once ----
  Game.newGame('somewhere rural', null, null, null, 'proof');
  grantAbility('field_dressing');
  let s = Game.state.scholar;
  const k0 = s.kcal || 0;
  says.length = 0;
  const r = Game.useAbility('field_dressing', 'dress_game');
  const k1 = s.kcal || 0;
  check('refused tap returns false', r === false);
  check('refused tap costs 0 kcal', (k1 - k0) === 0, 'delta=' + (k1 - k0));
  check('refusal narrates exactly once', says.length === 1, says.length + ' msgs: ' + says.join(' // ').slice(0, 200));
  check('refusal says no-game (not fizzle)', says.length === 1 && /no game to dress/i.test(says[0]) && !/fizzled/i.test(says.join(' ')));

  // ---- 4: successful dress claims no multiplier ----
  Game.newGame('somewhere rural', null, null, null, 'proof');
  grantAbility('field_dressing');
  s = Game.state.scholar;
  s.inventory.push(Game.foodCarcass(deer, deer.calories, s.day, 'hunted'));
  says.length = 0;
  const r2 = Game.useAbility('field_dressing', 'dress_game');
  check('dress with carcass succeeds', r2 === true);
  check('dress text claims no multiplier', !/×1\.3|multiplier|×/.test(says.join(' ')), says.join(' ').slice(0, 160));

  // ---- 3: trap catch bakes hunt.meat_yield ----
  Game.newGame('somewhere rural', null, null, null, 'proof');
  grantAbility('field_dressing'); // ×1.3 meat yield
  s = Game.state.scholar;
  Game.learnRecipe('snare', 3);
  const snare = Game.data.recipes.find(r => r.id === 'snare');
  for (const [mat, need] of Object.entries(snare.materials)) s.inventory.push({ material: mat, name: mat, units: need, kg: 0.1 });
  Game.craft('snare');
  s.mx = 4; s.my = 4; Game.map.px = 0; Game.map.py = 0;
  const tile = Game.playerTile();
  Game.setTrap('snare');
  let caught = null;
  for (let d = 0; d < 20 && !caught; d++) {
    tile.wildlife = { cottontail_rabbit: 5 };
    Game.checkTraps();
    caught = s.inventory.find(i => i.foodState === 'carcass');
  }
  check('trap caught something within 20 dawns', !!caught);
  if (caught) {
    const animal = Game.data.animals.find(a => 'meat_' + a.id === caught.plantId);
    const expected = Math.round(Game.modTarget('hunt.meat_yield', animal.calories));
    check('trapped carcass carries meat_yield bonus', caught.hiddenKcal === expected,
      `hiddenKcal=${caught.hiddenKcal} expected=${expected} (raw=${animal.calories})`);
    check('trapped carcass NOT raw calories', caught.hiddenKcal !== animal.calories || expected === animal.calories,
      'bonus applied: ' + (caught.hiddenKcal !== animal.calories));
  }

  Game.say = osay;
  const fails = results.filter(x => !x[1]).length;
  console.log(fails ? `RESULT: FAIL (${fails})` : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
