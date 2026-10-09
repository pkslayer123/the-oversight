#!/usr/bin/env node
// PROOF TEST (explorer 2026-10-09): eagle_eye's data modifier was dead.
// BEFORE: abilities.json granted `explore.spot_chance` (+0.25/level) — a target
// no code anywhere consumes. forage.rare_find_chance (the engine's actual rare-find
// roll, whose comment says "eagle_eye: sometimes you see what others miss") was
// granted by nothing. Net: Eagle Eye did literally nothing, while its level-up
// text promised "You see through fog."
// AFTER: eagle_eye grants forage.rare_find_chance (+0.05/level); flavor text
// describes the real mechanic. This test fails pre-fix, passes post-fix.
// Run: node scripts/test-eagle-eye-20261009.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '777', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
let fails = 0;
const check = (name, cond, detail) => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

(async () => {
  await Game.init();
  const abilities = Game.data.abilities;
  const ee = (Array.isArray(abilities) ? abilities : Object.values(abilities)).find(a => a.id === 'eagle_eye');

  // 1. data hygiene: nothing grants the dead target anymore
  const grants = (m) => (m.target === 'explore.spot_chance');
  const allMods = [];
  (Array.isArray(abilities) ? abilities : Object.values(abilities)).forEach(a => (a.modifiers || []).forEach(m => allMods.push([a.id, m])));
  check('no ability grants explore.spot_chance', !allMods.some(([id, m]) => grants(m)),
    `grants: ${allMods.filter(([id, m]) => grants(m)).map(([id]) => id).join(',') || 'none'}`);

  // 2. the granted modifier resolves on the live target
  const scholar = { abilities: [{ id: 'eagle_eye', level: 5, xp: 0 }], backgroundAbilities: [] };
  const mods = S.modifiers.collectModifiers(scholar, abilities);
  const rare = S.modifiers.resolve(0, 'forage.rare_find_chance', mods, {});
  check('L5 eagle_eye grants forage.rare_find_chance = 0.25', Math.abs(rare - 0.25) < 1e-9, `resolved: ${rare}`);
  const l1 = S.modifiers.collectModifiers({ abilities: [{ id: 'eagle_eye', level: 1 }] }, abilities);
  check('L1 eagle_eye grants 0.05', Math.abs(S.modifiers.resolve(0, 'forage.rare_find_chance', l1, {}) - 0.05) < 1e-9, '');

  // 3. behavioral: 3000 seeded forage presses with eagle_eye L5 produce rare finds
  Math.random = mulberry32(SEED); // reseed for the forage loop (forage.js reads Math.random directly)
  const plants = [{ id: 'dandelion', name: 'Dandelion', description: 'a dandelion', unit: 'handful', caloriesPerUnit: 20, tileAffinity: ['forest_floor'] }];
  const biome = { id: 'test_woods', forageTable: { dandelion: 1 } };
  const codex = { plants: {} };
  let rareCount = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const r = S.forage.forage({ type: 'forest_floor', stock: 5 }, biome, plants, scholar, codex, abilities, null, {});
    if (r.rareFind) rareCount++;
  }
  check(`rare finds occur (${N} presses, expect ~750 at 25%)`, rareCount > 500 && rareCount < 1000, `rare: ${rareCount}`);
  // control: no eagle_eye -> no rare finds
  Math.random = mulberry32(SEED);
  const plain = { abilities: [], backgroundAbilities: [] };
  let controlRare = 0;
  for (let i = 0; i < N; i++) {
    const r = S.forage.forage({ type: 'forest_floor', stock: 5 }, biome, plants, plain, codex, abilities, null, {});
    if (r.rareFind) controlRare++;
  }
  check('control (no ability): zero rare finds', controlRare === 0, `rare: ${controlRare}`);

  // 4. flavor text no longer promises fog-penetration
  const t3 = Game.abilityLevelBonus('eagle_eye', 3);
  check('L3 flavor text honest (no fog promise)', !/fog/i.test(t3), `"${t3}"`);

  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
