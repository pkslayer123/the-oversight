// Hunter-loop knife gate (2026-10-05):
//  The whole hunter gut/cook chain was a dead end for characters who don't
//  start with a knife: no recipe existed for any knife, stone_knife in
//  items.json was dead data (nothing reads items.json "craftable"), and the
//  knifeless message offered no path forward. Fix: stone_knife is a real
//  recipe (stone + vine, durable), known by everyone at L3 from game start,
//  craft() handles durable crafts (pack, not the tool row), setTrap refuses
//  non-trap recipes honestly, and the knifeless message points at the recipe.
// Usage: node scripts/test-hunter-knife.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function say() { const l = Game.log.join(' | '); Game.log.length = 0; return l; }
// a character who starts WITHOUT a cutting tool
function freshKnifeless() {
  Game.genRoster('Columbus, Ohio');
  for (const c of Game.generatedRoster) {
    Game.newGame('Columbus, Ohio', null, c.id);
    Game.depart();
    if (!Game.hasCuttingTool()) return Game.state.scholar;
  }
  throw new Error('no knifeless character on roster');
}

(async () => {
  await Game.init();

  // ---- 1. recipe granted at start + opening narration ----
  let s = freshKnifeless();
  ok('knifeless character found (the bug premise)', !Game.hasCuttingTool());
  ok('stone_knife recipe known at L3 from game start',
    ((Game.state.codex.recipes || {}).stone_knife || {}).level === 3);
  ok('opening narration mentions the stone knife',
    /stone knife/i.test(Game.log.join(' ')));
  Game.log.length = 0;

  // ---- 2. craft the knife ----
  s.inventory.push({ material: 'stone', units: 2, name: 'Stone' }, { material: 'vine', units: 2, name: 'Vine' });
  let made = null;
  for (let i = 0; i < 8 && !made; i++) made = Game.craft('stone_knife'); // 85% per attempt
  ok('stone knife crafts', !!made);
  const knife = s.inventory.find(i => /stone knife/i.test(i.name || ''));
  ok('knife lands in inventory (pack), not the tool row', !!knife && !(s.tools || []).some(t => /stone_knife/i.test(t.recipeId || '')));
  ok('hasCuttingTool true after knapping', Game.hasCuttingTool());

  // ---- 3. the dead end is gone: kill -> clean works ----
  s.mx = 4; s.my = 4; s.kcal = 2400;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  for (let i = 0; i < 30; i++) {
    s.animal = { id: 'cottontail_rabbit', mx: 5, my: 4 };
    Game.log.length = 0; Game.huntAnimal();
    if (!s.animal) break;
  }
  const ci = s.inventory.findIndex(i => i.foodState === 'carcass');
  ok('kill produced a carcass', ci >= 0);
  Game.log.length = 0;
  Game.cleanCarcass(ci);
  const cleanSaid = say();
  ok('carcass cleans with the knapped knife', /cleaned|it worked/i.test(cleanSaid));
  ok('cleaning yields 4 portions', (s.inventory.find(i => /cleaned/i.test(i.name || '')) || {}).units === 4);

  // ---- 4. knifeless hint points at the recipe ----
  s = freshKnifeless();
  s.inventory.push({ foodState: 'carcass', name: 'Cottontail Rabbit (carcass)', spoilDay: s.day + 2, hiddenKcal: 800 });
  Game.log.length = 0;
  Game.cleanCarcass(s.inventory.findIndex(i => i.foodState === 'carcass'));
  ok('knifeless message names the stone knife path', /knap a stone knife/i.test(say()));

  // ---- 5. regressions: traps still work, setTrap guards non-traps ----
  s = freshKnifeless();
  Game.learnRecipe('snare', 3);
  s.inventory.push({ material: 'vine', units: 2, name: 'Vine' }, { material: 'stick', units: 2, name: 'Stick' });
  let snare = null;
  for (let i = 0; i < 8 && !snare; i++) snare = Game.craft('snare');
  ok('snare still crafts into tools with uses', !!snare && (s.tools || []).some(t => t.recipeId === 'snare' && t.uses === 10));
  Game.log.length = 0;
  const trapsBefore = (Game.playerTile().traps || []).length;
  const setKnife = Game.setTrap('stone_knife');
  ok('setTrap refuses a non-trap recipe honestly', setKnife === null && /not a trap/i.test(say()));
  ok('no phantom trap placed', (Game.playerTile().traps || []).length === trapsBefore);
  Game.log.length = 0;
  ok('setTrap still sets a real snare', Game.setTrap('snare') === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
