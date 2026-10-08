#!/usr/bin/env node
// PROOF TEST: the new hunter debug scenarios are playable, not just present.
// 'hunt': deer 4 tiles out (not adjacent), crude bow + arrows, stone knife in
// pack, dawn — the full arc is set up and the coaching text is honest.
// 'butcher': a fresh deer carcass in the pack, NO knife, day 1 — the rot
// clock ticks; cleaning without a knife fails honestly; with a knife it
// yields 4 raw portions.
// Deterministic: seeded RNG.
// Run: node scripts/test-hunter-scenarios-20261008.js
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
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const results = [];
const check = (name, cond, detail) => { results.push([name, !!cond]); console.log(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  await Game.init();
  console.log('== TEST: hunter debug scenarios | SEED ' + SEED + ' ==');
  const says = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };

  // ---- hunt ----
  says.length = 0;
  check('hunt scenario runs', Game.debugScenario('hunt') === true);
  let s = Game.state.scholar;
  const a = s.animal;
  const d = a ? Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my)) : -1;
  check('deer starts at distance (not adjacent)', d >= 3, 'dist=' + d);
  check('deer interior (1..7)', a && a.mx >= 1 && a.mx <= 7 && a.my >= 1 && a.my <= 7, a && `(${a.mx},${a.my})`);
  check('deer calm and grazing', a && a.pstate === 'graze' && (a.aware || 0) === 0);
  const bow = (s.equipped || {}).weapon || {};
  check('crude bow equipped', /bow/i.test(bow.name || ''));
  check('arrows in pack', (s.inventory || []).some(it => /arrow/i.test(it.name || '')));
  check('stone knife in pack', Game.hasCuttingTool && Game.hasCuttingTool());
  check('dawn (deer crepuscular)', Game.dayPart === 0);
  check('coaching mentions the arc', says.join(' ').match(/bolt|stalk|winded/i) !== null);
  check('hunt listed in debug panel', Game.debugScenarioList().some(e => e[0] === 'hunt'));
  check('hunt in Animals category', (Game.debugScenarioCategories()['🐾 Animals — Prey'] || []).some(e => e[0] === 'hunt'));

  // ---- butcher ----
  says.length = 0;
  check('butcher scenario runs', Game.debugScenario('butcher') === true);
  s = Game.state.scholar;
  const carcIdx = (s.inventory || []).findIndex(it => it && it.foodState === 'carcass');
  check('fresh carcass in pack', carcIdx >= 0);
  const carc = s.inventory[carcIdx];
  check('carcass spoil clock = day+2', carc && carc.spoilDay === s.day + 2, 'spoilDay=' + (carc && carc.spoilDay) + ' day=' + s.day);
  check('no knife in pack', !(Game.hasCuttingTool && Game.hasCuttingTool()));
  says.length = 0;
  Game.cleanCarcass(carcIdx); // knifeless — must fail honestly, not silently
  check('knifeless clean fails honestly', says.join(' ').match(/need a knife/i) !== null && s.inventory[carcIdx] && s.inventory[carcIdx].foodState === 'carcass');
  s.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1, kcalEach: 0, kg: 0.3 });
  Game.cleanCarcass(carcIdx);
  const meat = (s.inventory || []).find(it => it && it.foodState === 'cleaned');
  check('clean with knife yields portions', meat && meat.units === 4, meat && `${meat.units}x ${meat.kcalEach}kcal`);
  check('butcher listed in debug panel', Game.debugScenarioList().some(e => e[0] === 'butcher'));

  Game.say = osay;
  const fails = results.filter(r => !r[1]).length;
  console.log(fails ? `RESULT: FAIL (${fails})` : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
