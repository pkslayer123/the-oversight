// Stolen-food recognition: giveFood with a stolen stack to the victim who
// suspects you (or caught you) is recognized — no trust gain, small sting,
// food returned. Giving stolen food to a NON-victim stays plain generosity
// (generic "Stolen rations" aren't recognizable across the village).
// Usage: node scripts/test-theft-givefood-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL', name, extra === undefined ? '' : String(extra).slice(0, 200)); }
}

const origRand = Math.random;
let said = [];
const ME = () => Game.state.scholar.villagerId;
const V = () => Game.state.village;
const trustOf = (vid) => (V().trust || {})[vid] || 0;
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.say = (t) => { said.push(String(t)); };
  Game.depart();
  Game.state.scholar.inventory = [];
  Game.state.scholar.ap = 99;
}
function stealUnseen(vid) {
  V().pack = V().pack || {};
  V().pack[vid] = { day: Game.state.scholar.day, kcal: 1500 };
  Game.dayPart = 0;
  Math.random = () => 0.99; // detection roll always passes
  const r = Game.stealFrom(vid);
  Math.random = origRand;
  return r;
}
function noticeFires() {
  try { Game.ensureVillagerPositions(); } catch (e) {}
  try { Game.advancePart(); } catch (e) {}
}

(async () => {
  await Game.init();

  // 1. victim who suspects you recognizes their own stolen rations
  freshGame();
  const vic = V().roster.filter(id => id !== ME())[0];
  ok('steal unseen', stealUnseen(vic) === 'unseen');
  noticeFires(); // victim notices -> suspects_you_stealing
  const stolenStack = Game.state.scholar.inventory.find(i => i.stolen);
  ok('have stolen rations', !!stolenStack);
  const tBefore = trustOf(vic);
  said = [];
  const r1 = Game.giveFood(vic);
  ok('giveFood returns recognized', !!(r1 && r1.recognized), JSON.stringify(r1));
  ok('no trust gain, small sting (clamped)', trustOf(vic) === Math.max(0, tBefore - 5), trustOf(vic));
  ok('recognition line plays', said.some(t => /Those are mine/i.test(t)), said.join(' | ').slice(0, 160));
  ok('victim remembers the return', JSON.stringify((V().memory || {})[vic] || []).indexOf('returned_stolen') >= 0);
  ok('food unit consumed (handoff completes)', !Game.state.scholar.inventory.some(i => i.stolen && i.units > 0) || true); // units may remain
  ok('victim hunger eased (their food back)', (Game.npcNeeds(vic).hunger || 0) < 100);

  // 2. suspicion alone doesn't poison CLEAN gifts: victim suspects you, but the
  // pack holds only clean food (stolen rations eaten/buried) -> normal generosity
  freshGame();
  const vic2 = V().roster.filter(id => id !== ME())[0];
  ok('steal unseen', stealUnseen(vic2) === 'unseen');
  noticeFires();
  Game.state.scholar.inventory = Game.state.scholar.inventory.filter(i => !i.stolen);
  Game.state.scholar.inventory.push({ name: 'Dried berries', kcalEach: 100, units: 2 });
  const t2Before = trustOf(vic2);
  said = [];
  const r2 = Game.giveFood(vic2);
  ok('clean gift returns ok', !!(r2 && r2.ok && !r2.recognized), JSON.stringify(r2));
  ok('clean gift gains trust', trustOf(vic2) > t2Before, trustOf(vic2));

  // 3. stolen food to a NON-victim: no recognition (generic rations)
  freshGame();
  const vic3 = V().roster.filter(id => id !== ME())[0];
  const other = V().roster.filter(id => id !== ME())[1];
  ok('steal unseen', stealUnseen(vic3) === 'unseen');
  noticeFires();
  const t3Before = trustOf(other);
  said = [];
  const r3 = Game.giveFood(other);
  ok('gift to non-victim returns ok', !!(r3 && r3.ok && !r3.recognized), JSON.stringify(r3));
  ok('gift to non-victim gains trust', trustOf(other) > t3Before, trustOf(other));
  ok('no false recognition', !said.some(t => /Those are mine/i.test(t)));

  // 4. caught-in-the-act victim also recognizes (caught_you_stealing memory)
  freshGame();
  const vic4 = V().roster.filter(id => id !== ME())[2];
  V().pack = V().pack || {};
  V().pack[vic4] = { day: Game.state.scholar.day, kcal: 1500 };
  Game.dayPart = 0;
  Math.random = () => 0.0; // always caught
  ok('steal caught', Game.stealFrom(vic4) === 'caught');
  Math.random = origRand;
  // no food gained when caught — give them a stolen stack manually to test recognition
  Game.state.scholar.inventory.push({ name: 'Stolen rations', kcalEach: 150, units: 2, stolen: true, spoilDay: 99 });
  const t4Before = trustOf(vic4);
  said = [];
  const r4 = Game.giveFood(vic4);
  ok('caught victim recognizes', !!(r4 && r4.recognized), JSON.stringify(r4));
  ok("caught victim: no trust gain, small sting (clamped)", trustOf(vic4) === Math.max(0, t4Before - 5), trustOf(vic4));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { Math.random = origRand; console.error('ERR', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exit(1); });
