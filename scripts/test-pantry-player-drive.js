// Player-drive: forage plants, haul home, pool surplus into the village
// pantry via the REAL returnToVillage path, then verify knowledge gating on
// the real deposited items. (Steve 2026-10-06)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/progression.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : (fail++, console.log(`FAIL ${n}${x ? ' — ' + x : ''}`)); };

(async () => {
  await Game.init();
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id, ['multitool', 'lighter', 'hoodie', 'trail_compass'], 'PantryDrive');
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  Game.log = [];
  Game.state.codex.plants = {};
  Game.state.codex.monsters = {};
  Game.state.systemArrived = false;
  Game.state.village.pantry = [];

  // The player foraged dandelion + cattail (real item shape from forage path).
  s.inventory.push(
    { name: 'a plant with jagged leaves', plantId: 'dandelion', kcalEach: 120, units: 30, spoilDay: 9999, safe: true, kg: 0.2, unit: 'handful' },
    { name: 'a tall reed with a brown spike', plantId: 'cattail', kcalEach: 150, units: 30, spoilDay: 9999, safe: true, kg: 0.2, unit: 'handful' },
  );
  // identify ONLY dandelion (taught by a villager, the real teaching path)
  Game.identifyPlant('dandelion', 'taught by villager');

  // Return home: surplus pools into the village pantry via the real path.
  Game.returnToVillage();
  const pantry = Game.state.village.pantry;
  const dan = pantry.find(p => p.plantId === 'dandelion');
  const cat = pantry.find(p => p.plantId === 'cattail');
  ok('drive: real deposit created dandelion stack', !!dan);
  ok('drive: real deposit created cattail stack', !!cat);

  // Player opens the pantry screen: what do they see?
  const known = pantry.filter(p => Game.pantryItemKnown(p));
  const unknown = pantry.filter(p => !Game.pantryItemKnown(p));
  ok('drive: known dandelion shows by name', known.some(p => p.plantId === 'dandelion'));
  ok('drive: unknown cattail collapses to Unfamiliar provisions', unknown.some(p => p.plantId === 'cattail'));
  // the display name the UI would render for each
  ok('drive: known renders true name', Game.itemDisplayName(dan) === 'Dandelion');
  ok('drive: unknown renders descriptor only', Game.itemDisplayName(cat) !== 'Cattail' && !/cattail/i.test(Game.itemDisplayName(cat)),
    `got "${Game.itemDisplayName(cat)}"`);
  // aggregate still counts the pile
  ok('drive: aggregate pantry kcal > 0', Game.pantryKcal() > 0);

  // Later: the player learns cattail (forages it again, identifies) — pantry reveals.
  Game.identifyPlant('cattail', 'tasted and compared');
  ok('drive: learned cattail now shows', Game.pantryItemKnown(cat));
  ok('drive: learned cattail renders true name', Game.itemDisplayName(cat) === 'Cattail');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
