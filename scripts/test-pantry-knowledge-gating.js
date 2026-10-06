// Pantry knowledge gating (Steve 2026-10-06): "The village stash shouldn't
// reveal counts of items that you haven't discovered yet, or someone hasn't
// discovered."
// Standing law: "If you don't know, it doesn't show."
//
// Gates (concrete):
//   - pantryItemKnown(p): no plantId (staples/generics) -> always shown.
//     plantId -> plantKnown(pid) (codex level >= 1). 'meat_<mid>' -> monster
//     named (villageName) or System arrived.
//   - renderPantryInline: known items render with name/count/stats/slider as
//     before (original pantry index preserved for takeFromPantryBulk).
//     Unknown items collapse into ONE "Unfamiliar provisions" line: no name,
//     no count, no stats, no take-slider.
//   - Aggregate "Pantry X / Y kcal" stays (pile size is observable).
//   - Caches untouched (you buried them, you know what's in them).
//   - Villager knowledge alone doesn't reveal — teaching flows through
//     identifyPlant into YOUR codex.
// Usage: node scripts/test-pantry-knowledge-gating.js
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
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  const v = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, v.id, ['multitool', 'lighter', 'hoodie', 'trail_compass'], 'PantryKG Test');
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  Game.log = [];
  return s;
}
function pantryItem(over) {
  return Object.assign({ name: 'x', kcalEach: 100, units: 5, spoilDay: 9999, safe: true, kg: 0.2, unit: 'handful' }, over);
}

(async () => {
  await Game.init();
  freshGame();
  // Deterministic knowledge: starting codex is RNG — clear it so the test
  // plants/monsters start unknown regardless of the roll.
  Game.state.codex.plants = {};
  Game.state.codex.monsters = {};
  Game.state.systemArrived = false;
  const V = () => Game.state.village;

  // === 1. pantryItemKnown: identity gates ===
  ok('staple (no plantId) always known', Game.pantryItemKnown(pantryItem({ name: 'Rice' })) === true);
  ok('generic (no plantId) always known', Game.pantryItemKnown(pantryItem({ name: 'Foraged food' })) === true);
  ok('null item not known', Game.pantryItemKnown(null) === false);
  ok('unknown plant hidden', Game.pantryItemKnown(pantryItem({ plantId: 'dandelion', name: 'a plant with jagged leaves' })) === false);
  ok('unknown meat hidden (monster unnamed)', Game.pantryItemKnown(pantryItem({ plantId: 'meat_bulldozer', foodKind: 'meat', name: 'something huge (carcass)' })) === false);

  // === 2. learning reveals ===
  Game.identifyPlant('dandelion', 'test');
  ok('known plant shown after identify', Game.pantryItemKnown(pantryItem({ plantId: 'dandelion' })) === true);
  ok('other plant still hidden', Game.pantryItemKnown(pantryItem({ plantId: 'cattail' })) === false);
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters['bulldozer'] = { villageName: 'Dozer' };
  ok('meat shown once monster named', Game.pantryItemKnown(pantryItem({ plantId: 'meat_bulldozer', foodKind: 'meat' })) === true);
  delete Game.state.codex.monsters['bulldozer'].villageName;
  Game.state.systemArrived = true;
  ok('meat shown after System arrival', Game.pantryItemKnown(pantryItem({ plantId: 'meat_bulldozer', foodKind: 'meat' })) === true);
  Game.state.systemArrived = false;
  ok('meat hidden again pre-System unnamed', Game.pantryItemKnown(pantryItem({ plantId: 'meat_bulldozer', foodKind: 'meat' })) === false);

  // === 3. villager knowledge alone does NOT reveal (teaching path) ===
  // A villager knows cattail, the player doesn't: still hidden until taught.
  Game.villagerLearnsPlant('someVillager', 'cattail', 'test');
  ok('villager-knows-but-you-dont stays hidden', Game.pantryItemKnown(pantryItem({ plantId: 'cattail' })) === false);
  Game.identifyPlant('cattail', 'taught by villager'); // the teaching moment
  ok('teaching reveals', Game.pantryItemKnown(pantryItem({ plantId: 'cattail' })) === true);

  // === 4. render: unknown items collapse, known items keep sliders ===
  // Simulate the render's split logic (same predicate the template uses).
  V().pantry = [
    pantryItem({ name: 'Rice', units: 10 }),                                        // idx 0, known (staple)
    pantryItem({ plantId: 'dandelion', name: 'Dandelion', units: 7 }),              // idx 1, known (identified)
    pantryItem({ plantId: 'blackberry', name: 'a thorny bush', units: 4 }),         // idx 2, UNKNOWN
    pantryItem({ plantId: 'meat_bulldozer', foodKind: 'meat', name: 'something huge (carcass)', units: 2 }), // idx 3, UNKNOWN
  ];
  const pantry = V().pantry;
  const knownIdx = [], unknownIdx = [];
  pantry.forEach((p, idx) => { (Game.pantryItemKnown(p) ? knownIdx : unknownIdx).push(idx); });
  ok('split: 2 known', knownIdx.join(',') === '0,1');
  ok('split: 2 unknown', unknownIdx.join(',') === '2,3');
  ok('known keeps original indices for takeFromPantryBulk', knownIdx.every(i => pantry[i] !== undefined));

  // takeFromPantryBulk still works on original indices after gating
  const before = pantry[0].units;
  Game.takeFromPantryBulk({ 0: 3 });
  ok('take by original index works', pantry[0].units === before - 3);
  ok('unknown stack untouched by take', pantry[2].units === 4);

  // === 5. aggregate kcal still includes unknown stock (observable pile) ===
  const agg = Game.pantryKcal();
  const manual = pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  ok('aggregate pantry kcal includes unknown items', agg === manual && agg > 0);

  // === 6. render source: the gate is actually wired ===
  const src = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const rpStart = src.indexOf('function renderPantryInline');
  const rpEnd = src.indexOf('function pantrySheet', rpStart);
  const rp = src.slice(rpStart, rpEnd);
  ok('render calls Game.pantryItemKnown', rp.includes('Game.pantryItemKnown(p)'));
  ok('render has Unfamiliar provisions line', rp.includes('Unfamiliar provisions'));
  ok('unknown card has no take-slider', !/Unfamiliar provisions[\s\S]{0,600}data-pack/.test(rp));
  const unknownCard = rp.slice(rp.indexOf('Unfamiliar provisions'));
  const unknownText = unknownCard.slice(0, unknownCard.indexOf('</div>')).replace(/#[0-9a-f]{3,6}/gi, '').replace(/[0-9]+px/g, '').replace(/opacity:\.?[0-9]+/g, '');
  ok('unknown line shows no count', !/[0-9]/.test(unknownText));
  ok('data-pack keeps original pantry index', rp.includes('data-pack="${idx}"'));
  ok('known rows use gated display name', rp.includes('Game.itemDisplayName(p)'));
  ok('fair-share note untouched', rp.includes('fairShareNote'));
  ok('water row untouched', rp.includes('packq-water'));
  ok('storage tier UI untouched', rp.includes('storageTier'));

  // === 7. caches untouched by the gate ===
  const cacheSrc = fs.readFileSync(path.join(ROOT, 'src/js/storage.js'), 'utf8');
  ok('cachesHtml has no knowledge gate', !cacheSrc.includes('pantryItemKnown'));
  const appCache = src.indexOf('function renderCachesInline');
  ok('renderCachesInline has no knowledge gate', !src.slice(appCache, appCache + 3000).includes('pantryItemKnown'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
