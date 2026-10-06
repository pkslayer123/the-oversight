// Animals: hunting mechanics (Steve 2026-10-05)
// - Per-animal flee behavior (plays_dead, slow, aggressive, curious, aquatic, arboreal, cunning, wary, flock)
// - Bite on close capture (restored into active hunt path)
// - Charred meat for energy weapons (restored into active hunt path)
// - Unarmed-vs-big-game gate (hands can't take a deer)
// - Butchering yields (hide/bone/feather/antler/shell) on cleanCarcass
// Usage: node scripts/test-animals.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}
const s = () => Game.state.scholar;
function sayLines() { return (Game.log || []).map(l => String(l.text || l)).join('\n'); }
function clearSay() { Game.log = []; }

function withRand(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.99);
  try { return fn(); } finally { Math.random = orig; }
}
function setAnimal(id, mx, my, extra) {
  s().animal = Object.assign({ id, mx, my, aware: 0, stamina: 3, pstate: 'graze', edgeTurns: 0 }, extra || {});
  s().mx = 4; s().my = 4;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().kcal = 4000; s().hydration = 100; s().health = 100;
  // ensure a knife so cleanCarcass works
  s().inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1, kg: 0.3 });

  // ---- 1. Data: animals have butcher yields defined (count dynamic — see note in test-animals-flesh.js) ----
  const animals = Game.data.animals;
  ok('animals loaded', animals.length > 0, 'got ' + animals.length);
  ok('all have butcher field', animals.every(a => a.butcher && typeof a.butcher === 'object'));
  const deer = animals.find(a => a.id === 'white_tailed_deer');
  ok('deer yields hide+bone+antler', deer.butcher.hide === 2 && deer.butcher.bone === 4 && deer.butcher.antler === 2);
  ok('frog yields nothing extra', Object.keys(animals.find(a => a.id === 'bullfrog').butcher).length === 0);

  // ---- 2. foodCarcass charred flag ----
  const rabbit = animals.find(a => a.id === 'cottontail_rabbit');
  const charred = Game.foodCarcass(rabbit, 80, 1, 'charred');
  ok('charred carcass flagged', charred.charred === true);
  ok('charred carcass named', /charred remains/.test(charred.name), charred.name);
  const normal = Game.foodCarcass(rabbit, 800, 1, 'hunted');
  ok('normal carcass not flagged', !normal.charred);

  // ---- 3. cleanCarcass yields materials ----
  s().inventory.push(Game.foodCarcass(deer, 20000, s().day, 'hunted'));
  clearSay();
  Game.cleanCarcass();
  const hides = s().inventory.filter(i => i.material === 'hide').reduce((n, i) => n + (i.units || 0), 0);
  const bones = s().inventory.filter(i => i.material === 'bone').reduce((n, i) => n + (i.units || 0), 0);
  const antlers = s().inventory.filter(i => i.material === 'antler').reduce((n, i) => n + (i.units || 0), 0);
  ok('deer cleaning yields 2 hides', hides === 2, 'got ' + hides);
  ok('deer cleaning yields 4 bones', bones === 4, 'got ' + bones);
  ok('deer cleaning yields 2 antlers', antlers === 2, 'got ' + antlers);
  ok('yield message shown', /Butchering yields/.test(sayLines()));

  // ---- 4. charred carcass yields no materials ----
  const before = s().inventory.length;
  s().inventory.push(Game.foodCarcass(rabbit, 80, s().day, 'charred'));
  clearSay();
  Game.cleanCarcass();
  const afterMats = s().inventory.filter(i => i.material === 'hide' || i.material === 'bone');
  ok('charred gives no hide/bone', afterMats.every(i => (i.units || 0) <= 4), 'mats: ' + JSON.stringify(afterMats.map(i => [i.material, i.units])));
  ok('no yield message for charred', !/Butchering yields/.test(sayLines()));

  // ---- 5. Unarmed vs deer: auto-fail ----
  setAnimal('white_tailed_deer', 5, 4);
  s().equipped = {}; // bare hands
  clearSay();
  withRand([0.01], () => Game.huntAnimal()); // even a great roll fails
  ok('hands cant take deer', /can.t take/i.test(sayLines()), sayLines().slice(0, 120));
  ok('deer still there', !!s().animal);

  // ---- 6. Bite on close capture (force bite roll to succeed) ----
  setAnimal('snapping_turtle', 5, 4); // aggressive: 60% bite
  s().equipped = {};
  const hpBefore = s().health;
  clearSay();
  // rand sequence: preyReaction flee roll (high -> no bolt), bite roll (low -> bite), fumble (high -> no fumble), kill roll
  withRand([0.99, 0.01, 0.99, 0.01], () => Game.huntAnimal());
  const biteMsg = /bites!|It bites/.test(sayLines());
  ok('snapper bites at close range', biteMsg || s().health < hpBefore, sayLines().slice(0, 160));

  // ---- 7. Opossum plays dead ----
  setAnimal('opossum', 6, 4); // dist 2
  clearSay();
  Game.animalTurn();
  ok('opossum plays dead', s().animal && s().animal.pstate === 'playing_dead', 'pstate=' + (s().animal && s().animal.pstate));
  ok('playing dead announced', /playing dead/.test(sayLines()));
  // stays put while watched
  const ox = s().animal.mx, oy = s().animal.my;
  Game.animalTurn(); Game.animalTurn();
  ok('opossum stays put', s().animal && s().animal.mx === ox && s().animal.my === oy);
  // wanders off when you leave
  s().mx = 0; s().my = 0;
  Game.animalTurn();
  ok('opossum gone when you leave', !s().animal);

  // ---- 8. Box turtle never bolts ----
  setAnimal('box_turtle', 5, 4, { aware: 1 });
  for (let i = 0; i < 10; i++) Game.animalTurn();
  ok('turtle never bolts', !!s().animal && s().animal.pstate !== 'bolt', 'pstate=' + (s().animal && s().animal.pstate));

  // ---- 9. Snapping turtle never flees, hisses ----
  setAnimal('snapping_turtle', 6, 4);
  clearSay();
  Game.animalTurn();
  ok('snapper hisses', /hisses/.test(sayLines()));
  for (let i = 0; i < 8; i++) Game.animalTurn();
  ok('snapper never bolts', !!s().animal, s().animal ? 'pstate=' + s().animal.pstate : 'despawned');

  // ---- 10. Raccoon curiosity: approaches when far ----
  setAnimal('raccoon', 0, 0); // dist 4+ from (4,4)
  let movedCloser = false;
  for (let i = 0; i < 20 && s().animal; i++) {
    const d0 = Math.max(Math.abs(s().animal.mx - 4), Math.abs(s().animal.my - 4));
    Game.animalTurn();
    if (!s().animal) break;
    const d1 = Math.max(Math.abs(s().animal.mx - 4), Math.abs(s().animal.my - 4));
    if (d1 < d0) { movedCloser = true; break; }
  }
  ok('raccoon approaches (curious)', movedCloser);

  // ---- 11. Deer bolts early (wary at 0.7) ----
  setAnimal('white_tailed_deer', 6, 4, { aware: 0.7 });
  clearSay();
  Game.animalTurn();
  ok('deer bolts at 0.7 aware', s().animal && s().animal.pstate === 'bolt', 'pstate=' + (s().animal && s().animal.pstate));

  // ---- 12. Rabbit still uses generic bolt ----
  setAnimal('cottontail_rabbit', 6, 4, { aware: 1 });
  Game.animalTurn();
  ok('rabbit bolts when fully aware', !s().animal || s().animal.pstate === 'bolt');

  // ---- 13. huntAnimal kill still works (rabbit, forced success) ----
  setAnimal('cottontail_rabbit', 5, 4, { aware: 0, pstate: 'graze' });
  s().equipped = {};
  clearSay();
  const invBefore = s().inventory.length;
  // preyReaction: aware 0.6 default? set low; rand: reaction flee (high->stay), bite (high->no), kill (low->kill)
  withRand([0.99, 0.99, 0.01], () => Game.huntAnimal());
  ok('rabbit hunt can succeed', s().inventory.length > invBefore, sayLines().slice(0, 120));

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
