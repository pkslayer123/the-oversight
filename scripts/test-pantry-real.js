// Pantry reality tests. Usage: node scripts/test-pantry-real.js
// Covers: player hauls land as REAL pantry items (not phantom pantryKcal that
// evaporates at the end-of-day sync); returnToVillage keeps non-food inventory
// (bonded relics, tools); stockPantry makes NPC hauls real; oak/hickory trees
// yield their own nuts (fiction matches the harvest).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const itemsKcal = () => Game.state.village.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000;
  const t = Game.playerTile();
  t.stock = 10; t.maxStock = 10;
  return t;
}

(async () => {
  await Game.init();

  // 1. PLAYER HAUL: real items land in the pantry, counter stays honest.
  freshGame();
  const relicCount = Game.state.scholar.inventory.filter(i => i.bonded).length;
  ok('starts with bonded relics', relicCount >= 5);
  Game.state.scholar.inventory.push({ plantId: 'dandelion', units: 6, kcalEach: 75, spoilDay: 3, name: 'Dandelion greens', unit: 'handful', kg: 0.6 });
  const beforeItems = Game.state.village.pantry.length;
  const beforeKcal = itemsKcal();
  const unloadedKcal = Game.state.scholar.inventory.reduce((t, i) => t + ((i.kcalEach || 0) > 0 ? (i.units || 0) * (i.kcalEach || 0) : 0), 0);
  Game.returnToVillage();
  ok('haul adds real pantry items', Game.state.village.pantry.length > beforeItems);
  const haulItem = Game.state.village.pantry.find(i => i.plantId === 'dandelion');
  ok('hauled dandelion is a real item with units', !!haulItem && haulItem.units === 6 && haulItem.kcalEach === 75);
  ok('pantryKcal equals items-derived value', Game.state.village.pantryKcal === itemsKcal());
  ok('pantryKcal grew by the haul', Game.state.village.pantryKcal === beforeKcal + unloadedKcal);

  // 2. NON-FOOD SURVIVES the trip home (relics, tools, materials).
  const afterRelics = Game.state.scholar.inventory.filter(i => i.bonded).length;
  ok('bonded relics survive returnToVillage', afterRelics === relicCount);
  ok('no food left in pack (it was unloaded)', !Game.state.scholar.inventory.some(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0));

  // 3. HAUL SURVIVES endDay (the old phantom number evaporated at the sync).
  const haulKcalBefore = itemsKcal();
  Game.tickAction(520); // force the day to roll
  const stillThere = Game.state.village.pantry.find(i => i.plantId === 'dandelion');
  ok('hauled food survives endDay sync', !!stillThere);
  ok('pantryKcal still honest after endDay', Game.state.village.pantryKcal === itemsKcal());

  // 4. stockPantry: NPC-style contributions are real items.
  freshGame();
  const k0 = itemsKcal();
  Game.stockPantry(450, 'Foraged food');
  ok('stockPantry adds a real item', Game.state.village.pantry.some(i => i.name === 'Foraged food' && i.kcalEach === 450));
  ok('stockPantry keeps counter exact', Game.state.village.pantryKcal === itemsKcal() && itemsKcal() === k0 + 450);
  Game.tickAction(520);
  ok('stockPantry food survives endDay', Game.state.village.pantry.some(i => i.name === 'Foraged food'));

  // 5. OAK gives acorns; HICKORY gives hickory nuts (not a biome dice roll).
  freshGame();
  let t = Game.playerTile();
  t.modifiers = t.modifiers || {};
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[4][5] = 'tree'; d[4][3] = 'tree';
  t.modifiers['5,4'] = { species: 'oak', health: 'healthy', known: false };
  t.modifiers['3,4'] = { species: 'hickory', health: 'healthy', known: false };
  // stand adjacent to (5,4): scholar at (4,4)
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.cellInteract(5, 4);
  // LUMPED UNKNOWNS: unknown nuts land in the "unknown nuts" lump; the game
  // tracks true composition underneath.
  const nutLump = () => Game.state.scholar.inventory.find(i => i.lumpForm === 'nuts');
  ok('oak tree yields acorns', !!nutLump() && !!nutLump().lump.acorn_white_oak);
  // walk adjacent to (3,4): stand at (4,4) is distance 1 from (3,4)? |4-3|=1 yes
  Game.cellInteract(3, 4);
  ok('hickory tree yields hickory nuts', !!nutLump() && !!nutLump().lump.hickory_nut);
  ok('nut lump is one stack', Game.state.scholar.inventory.filter(i => i.lumpForm === 'nuts').length === 1);

  // 6. PINE does not promise nuts it can't deliver.
  freshGame();
  t = Game.playerTile();
  t.modifiers = t.modifiers || {};
  const d6 = Game.genDetail(Game.map.px, Game.map.py);
  d6[4][5] = 'tree';
  t.modifiers['5,4'] = { species: 'pine', health: 'healthy', known: false };
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  const logBefore = Game.log.length;
  Game.cellInteract(5, 4);
  const pineLog = Game.log.slice(logBefore).join(' ');
  ok('pine message does not promise nuts', !pineLog.includes('Nuts — about'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 6).join('\n')); process.exit(2); });
