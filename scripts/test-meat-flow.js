// End-to-end playtest: kill a monster -> carcass -> clean -> cautious test.
// Verifies the whole monster-food-safety chain stays knowledge-gated.
// Usage: node scripts/test-meat-flow.js
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
  if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}`); }
}
function drain() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  const c = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, c.id);
  Game.depart();
  drain();
  const st = Game.state;

  // --- win a fight against a belltoad (Choir Toad, toxic flesh) ---
  const mdef = Game.data.monsters.find(m => m.id === 'belltoad');
  ok('belltoad exists', !!mdef);
  Game.tbfight = {
    over: false, result: null, style: 10, round: 1, turnIdx: 0, order: ['p', 'm_0'],
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, alive: true, fled: false, mx: 4, my: 4 },
      { key: 'm_0', kind: 'monster', monsterId: 'belltoad', mdef, name: Game.monsterDisplayName('belltoad'), hp: 0, maxHp: 50, alive: false, fled: false, mx: 5, my: 5 },
    ],
  };
  Game.tbEnd('won');
  const winLog = drain();
  console.log('=== WIN LOG ===');
  console.log(winLog.slice(0, 600));
  ok('win log: no true name', !/choir toad/i.test(winLog));
  ok('win log: no kcal reveal', !/\d+ ?kcal/i.test(winLog) || /style/i.test(winLog));

  const carcass = st.scholar.inventory.find(i => i.plantId === 'meat_belltoad');
  ok('carcass in pack', !!carcass);
  if (carcass) {
    console.log('=== CARCASS ITEM ===', JSON.stringify({ name: carcass.name, plantId: carcass.plantId, foodKind: carcass.foodKind, foodState: carcass.foodState, edible: carcass.edible, kcalEach: carcass.kcalEach, hiddenKcal: carcass.hiddenKcal }));
    ok('carcass plantId format', carcass.plantId === 'meat_belltoad');
    ok('carcass not edible', carcass.edible === false);
    ok('carcass hides kcal', carcass.kcalEach === 0 && carcass.hiddenKcal > 0);
    ok('carcass name gated', !/choir toad/i.test(carcass.name));
    ok('itemDisplayName shows carcass name', Game.itemDisplayName(carcass) === carcass.name);
  }

  // --- clean it (need a knife; ensure one) ---
  if (!Game.hasCuttingTool()) {
    st.scholar.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', tool: true, cutting: true, units: 1, kg: 0.3 });
  }
  const cIdx = st.scholar.inventory.indexOf(carcass);
  Game.cleanCarcass(cIdx);
  const cleanLog = drain();
  console.log('=== CLEAN LOG (first 300) ===', cleanLog.slice(0, 300));
  const cleaned = st.scholar.inventory.find(i => i.plantId === 'meat_belltoad');
  if (cleaned) {
    console.log('=== CLEANED ITEM ===', JSON.stringify({ name: cleaned.name, edible: cleaned.edible, kcalEach: cleaned.kcalEach, hiddenKcal: cleaned.hiddenKcal, prep: (cleaned.prep || '').slice(0, 60) }));
    ok('cleaned still not edible (unknown flesh)', cleaned.edible === false);
    ok('cleaned still hides kcal', cleaned.kcalEach === 0 && cleaned.hiddenKcal > 0);
    ok('cleaned prep warns unknown', /unknown flesh/i.test(cleaned.prep || ''));
    ok('cleaned name renamed from carcass', /cleaned/.test(cleaned.name) && !/carcass/.test(cleaned.name));
  }

  // --- cautious test (belltoad is toxic) ---
  const tIdx = st.scholar.inventory.indexOf(cleaned);
  Game.testMonsterMeat(tIdx, st.scholar.inventory);
  const testLog = drain();
  console.log('=== TEST LOG (first 400) ===', testLog.slice(0, 400));
  ok('test log: no true name', !/choir toad/i.test(testLog));
  ok('test marks poison', (st.codex.monsters['belltoad'] || {}).foodTested === 'poison');
  ok('test does NOT mark safe', !Game.monsterFoodSafe('belltoad'));

  // --- village names the beast -> meat names refresh ---
  st.codex.monsters['belltoad'].villageName = 'War Drum';
  Game.refreshMeatNames('belltoad');
  const renamed = st.scholar.inventory.find(i => i.plantId === 'meat_belltoad');
  ok('meat renamed after village naming', renamed && renamed.name === 'War Drum (cleaned)');
  console.log('   renamed:', renamed && renamed.name);

  // --- safe monster full loop: hummice -> clean -> cautious test -> revealed ---
  Game.tbfight = {
    over: false, result: null, style: 10, round: 1, turnIdx: 0, order: ['p', 'm_0'],
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, alive: true, fled: false, mx: 4, my: 4 },
      { key: 'm_0', kind: 'monster', monsterId: 'hummice', mdef: Game.data.monsters.find(m => m.id === 'hummice'), name: Game.monsterDisplayName('hummice'), hp: 0, maxHp: 30, alive: false, fled: false, mx: 5, my: 5 },
    ],
  };
  Game.tbEnd('won');
  drain();
  const hc = st.scholar.inventory.find(i => i.plantId === 'meat_hummice' && i.foodState === 'carcass');
  ok('hummice carcass created', !!hc);
  Game.cleanCarcass(st.scholar.inventory.indexOf(hc));
  drain();
  const hcl = st.scholar.inventory.find(i => i.plantId === 'meat_hummice' && i.foodState === 'cleaned');
  Game.testMonsterMeat(st.scholar.inventory.indexOf(hcl), st.scholar.inventory);
  const hlog = drain();
  ok('hummice test: marked food safe', Game.monsterFoodSafe('hummice'));
  ok('hummice test: no true name in log', !/\bhummice\b/i.test(hlog.replace(/the grass is humming in harmony/gi, '')));
  const revealed = st.scholar.inventory.find(i => i.plantId === 'meat_hummice');
  ok('hummice revealed: edible + kcal', revealed && revealed.edible === true && revealed.kcalEach > 0);
  console.log('   hummice after reveal:', JSON.stringify({ name: revealed.name, edible: revealed.edible, kcalEach: revealed.kcalEach }));

  console.log(`\npass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
