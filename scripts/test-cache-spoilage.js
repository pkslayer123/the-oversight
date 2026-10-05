// Miser playtest: buried food spoils underground, and the robbed-cache
// codex entry doesn't stutter the label.
// - The earth doesn't stop time: perishables rot in a buried cache just like
//   in your pack, and dig-up says so honestly at the hole.
// - Materials never rot.
// - "Cache robbed: <label> — <label> — buried at ..." was a duplicated label.
// Usage: node scripts/test-cache-spoilage.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

let said = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  Game.state.scholar.water = (Game.state.scholar.water || []).slice(0, 1);
  Game.state.scholar.inventory = [];
  Game.state.scholar.materials = {};
}
const day = () => Game.state.scholar.day;
function buryFood(name, kcalEach, units, spoilInDays, kg) {
  const inv = Game.state.scholar.inventory;
  inv.push({ name, kcalEach, units, spoilDay: day() + spoilInDays, safe: true, kg: kg || 0.2 });
  Game.buryCache('food', inv.length - 1, units);
  return Game.playerCaches()[Game.playerCaches().length - 1];
}

(async () => {
  await Game.init();

  // ---------- 1. perishable rots underground; dig-up is honest ----------
  freshGame();
  const c1 = buryFood('Venison strips', 250, 4, 2);
  Game.state.scholar.day += 10; // spoilDay long past
  said = [];
  Game.digUpCache(c1.id);
  const ven = (Game.state.scholar.inventory || []).filter(i => i.name === 'Venison strips');
  ok('rotten buried food does not enter the pack', ven.length === 0);
  ok('cache is gone after digging up rot', !Game.playerCaches().some(c => c.id === c1.id));
  ok('dig-up says the food went bad', said.some(t => /gone bad|went bad/i.test(t)));

  // ---------- 2. mixed cache: good comes up, rot stays in the ground ----------
  freshGame();
  const c2 = buryFood('Venison strips', 250, 4, 2);
  c2.items.push({ name: 'Dried meat', kcalEach: 400, units: 2, spoilDay: 9999, safe: true, kg: 0.3 });
  Game.state.scholar.day += 10;
  said = [];
  Game.digUpCache(c2.id);
  const dm = (Game.state.scholar.inventory || []).filter(i => i.name === 'Dried meat');
  const ven2 = (Game.state.scholar.inventory || []).filter(i => i.name === 'Venison strips');
  ok('preserved item dug up', dm.length === 1 && dm[0].units === 2);
  ok('rotten item excluded', ven2.length === 0);
  ok('partial rot announced', said.some(t => /went bad underground/i.test(t)));
  ok('dug-up label is honest about what came up',
    said.some(t => /Dug up:.*Dried meat/.test(t) && !/Dug up:.*Venison/.test(t)));

  // ---------- 3. fresh dig-up: nothing rots, no false rot ----------
  freshGame();
  const c3 = buryFood('Venison strips', 250, 4, 2);
  said = [];
  Game.digUpCache(c3.id);
  const ven3 = (Game.state.scholar.inventory || []).filter(i => i.name === 'Venison strips');
  ok('fresh buried food comes up intact', ven3.length === 1 && ven3[0].units === 4);
  ok('no rot announced for fresh dig', !said.some(t => /gone bad|went bad|worms/i.test(t)));

  // ---------- 4. materials never rot ----------
  freshGame();
  Game.addMaterial('branch', 10);
  Game.buryCache('material', 'branch', 10);
  const c4 = Game.playerCaches()[Game.playerCaches().length - 1];
  Game.state.scholar.day += 100;
  said = [];
  Game.digUpCache(c4.id);
  ok('branches survive 100 days underground',
    Game.materialCount('branch') >= 10);
  ok('no rot announced for materials', !said.some(t => /gone bad|went bad|worms/i.test(t)));

  // ---------- 5. robbed codex entry: label said once ----------
  freshGame();
  const c5 = buryFood('Dried meat', 400, 2, 9999);
  Game.resolveCacheRobbery(c5);
  const places = Game.state.codex.places || [];
  const entry = places[places.length - 1];
  ok('robbed entry exists', entry && /Cache robbed/.test(entry.text));
  ok('robbed entry matches "Cache robbed: <desc>"', entry && entry.text === `Cache robbed: ${c5.desc}`);
  ok('label not duplicated in robbed entry',
    entry && entry.text.split(c5.label).length - 1 === 1);

  // ---------- 6. rot doesn't count toward carry weight ----------
  freshGame();
  const c6 = buryFood('Venison strips', 250, 4, 2, 5); // 20kg of meat, would exceed cap
  Game.state.scholar.day += 10;
  said = [];
  Game.digUpCache(c6.id); // all rotten: no weight complaint, just rot
  ok('all-rotten dig-up reports rot, not weight', said.some(t => /gone bad/i.test(t)) && !said.some(t => /Too heavy/i.test(t)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
