// Animals hunt fixes — W2 (Steve 2026-10-06)
// 1. food.js preyReaction same-tile bolt root cause: striking from the
//    animal's own tile used to "bolt" in place (dx=dy=0), burning stamina
//    and costing 50 kcal for nothing. Now it panics past you in a real
//    direction (encBoltDir), with a shuffled-ring fallback so a wall in
//    the first pick never means bolting in place.
// 2. recipes.json trap honesty: every animal whose method lists 'trap'
//    must be catchable by a real trap recipe (sibling fd50785 wired this;
//    this test locks the invariant + the balance weighting).
// Usage: node scripts/test-animals-hunt-fixes.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}
function sayText() { return (Game.log || []).map(l => String(l.text || l)).join('\n'); }

function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function putAnimal(s, id, mx, my, extra) {
  const cfg = Game.encPreyCfg(id);
  s.animal = Object.assign({ id, mx, my, aware: 1, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 }, extra || {});
  return s.animal;
}
function withRand(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.99);
  try { return fn(); } finally { Math.random = orig; }
}
const neighbors8 = (x, y) => {
  const out = [];
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const nx = x + ox, ny = y + oy;
    if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8) out.push([nx, ny]);
  }
  return out;
};

(async () => {
  await Game.init();
  const animals = Game.data.animals;
  const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/recipes.json'), 'utf8'));

  // ============ 1. SAME-TILE BOLT: the root-cause fix ============
  // deterministic: dir pick 0.0 -> [1,0], flee gate 0.05 < 0.9
  let s = freshGame();
  let ra = putAnimal(s, 'cottontail_rabbit', 4, 4);
  const fled = withRand([0.0, 0.05], () => Game.preyReaction(ra));
  ok('same-tile strike: it bolts (flee roll passes)', fled === true);
  ok('same-tile bolt lands on a REAL tile, not in place', ra.mx === 5 && ra.my === 4, `at ${ra.mx},${ra.my}`);
  ok('same-tile bolt: one-tile move (chase stays real)', Math.max(Math.abs(ra.mx - 4), Math.abs(ra.my - 4)) === 1);

  // every board position: same-tile bolt always leaves the tile on open ground
  let stuck = 0, trials = 0;
  for (let y = 0; y <= 8; y += 2) for (let x = 0; x <= 8; x += 2) {
    s = freshGame(); s.mx = x; s.my = y;
    ra = putAnimal(s, 'cottontail_rabbit', x, y);
    const r = Game.preyReaction(ra); // real randomness
    trials++;
    if (r === true && s.animal && ra.mx === x && ra.my === y) stuck++;
  }
  ok(`same-tile bolt never bolts in place on open ground (${trials} positions)`, stuck === 0, stuck + ' stuck');

  // wall in the first-pick direction: shuffled ring still finds a real tile
  s = freshGame();
  Game.genDetail = () => Array.from({ length: 9 }, (_, yy) =>
    Array.from({ length: 9 }, (_, xx) => (xx === 5 && yy === 4 ? 'wall' : 'grass')));
  ra = putAnimal(s, 'cottontail_rabbit', 4, 4);
  withRand([0.0, 0.05], () => Game.preyReaction(ra)); // first pick [1,0] -> wall
  ok('wall in first pick: ring fallback still moves', !(ra.mx === 4 && ra.my === 4), `at ${ra.mx},${ra.my}`);
  ok('wall in first pick: never lands ON the wall', !(ra.mx === 5 && ra.my === 4));

  // fully surrounded: honest — stays put (nowhere to run), strike still dodged
  s = freshGame();
  Game.genDetail = () => Array.from({ length: 9 }, (_, yy) =>
    Array.from({ length: 9 }, (_, xx) => (xx === 4 && yy === 4 ? 'grass' : 'wall')));
  ra = putAnimal(s, 'cottontail_rabbit', 4, 4);
  const dodged = withRand([0.0, 0.05], () => Game.preyReaction(ra)); // gate 0.05 < 0.08 cap
  ok('surrounded: strike dodged (returns true)', dodged === true);
  ok('surrounded: honestly stays put — nowhere to run', ra.mx === 4 && ra.my === 4);

  // corner same-tile: (0,0) bolt must leave the corner on open ground
  s = freshGame(); s.mx = 0; s.my = 0;
  ra = putAnimal(s, 'cottontail_rabbit', 0, 0);
  withRand([0.0, 0.05], () => Game.preyReaction(ra));
  ok('corner same-tile bolt leaves the corner', !(ra.mx === 0 && ra.my === 0), `at ${ra.mx},${ra.my}`);

  // stamina still burns exactly once per bolt (the chase is real, not free)
  s = freshGame();
  ra = putAnimal(s, 'cottontail_rabbit', 4, 4, { stamina: 3 });
  withRand([0.0, 0.05], () => Game.preyReaction(ra));
  ok('bolt burns exactly 1 stamina', ra.stamina === 2, 'stamina=' + ra.stamina);
  ok('bolt costs the lunge (50 kcal)', s.kcal === 2950, 'kcal=' + s.kcal);

  // full strike path (encounters.js shim + food.js fix compose): huntAnimal
  // from the animal's tile — the shim's same-tile guard should find nothing
  // to shove (no double-move), and the hunt must not leave it in place.
  s = freshGame();
  ra = putAnimal(s, 'cottontail_rabbit', 4, 4, { aware: 1 });
  Game.log = [];
  withRand([0.05, 0.0, 0.05], () => { try { Game.huntAnimal(); } catch (e) { console.log('huntAnimal err: ' + e.message); } });
  const a2 = s.animal;
  ok('huntAnimal same-tile: no in-place bolt left behind',
    !a2 || !(a2.mx === 4 && a2.my === 4), a2 ? `at ${a2.mx},${a2.my}` : 'resolved');
  const txt = sayText();
  ok('huntAnimal same-tile: fiction reads like a chase, not a glitch',
    /explodes away|melts into the treeline|winded/i.test(txt), txt.slice(0, 120));

  // ============ 2. TRAP HONESTY: every trap-method animal has a real trap ============
  const trapRecipes = recipes.filter(r => r.catches);
  ok('trap recipes exist', trapRecipes.length >= 3, trapRecipes.map(r => r.id).join(','));
  const animalIds = new Set(animals.map(a => a.id));
  const trapAnimals = animals.filter(a => (a.method || []).includes('trap'));
  ok('trap-method animals found', trapAnimals.length >= 5, trapAnimals.map(a => a.id).join(','));
  for (const a of trapAnimals) {
    const catchers = trapRecipes.filter(r => r.catches.includes(a.id)).map(r => r.id);
    ok(`trap-method ${a.id} is catchable by a real trap`, catchers.length > 0, 'catchers: ' + catchers.join(','));
  }
  // no dangling catch references
  for (const r of trapRecipes) {
    const bad = r.catches.filter(id => !animalIds.has(id));
    ok(`recipe ${r.id}: all catches are real animals`, bad.length === 0, bad.join(','));
  }
  // traps are actually buildable: materials + uses + knowledge text
  for (const r of trapRecipes) {
    ok(`recipe ${r.id}: has materials`, r.materials && Object.keys(r.materials).length > 0);
    ok(`recipe ${r.id}: has uses`, (r.uses || 0) > 0, 'uses=' + r.uses);
    ok(`recipe ${r.id}: knowledge teaches it`, !!(r.knowledgeLevels && r.knowledgeLevels['3']));
  }
  // balance honesty: deer rare in deadfall, fox shy in box trap (feel, real-world anchored)
  const deadfall = trapRecipes.find(r => r.id === 'deadfall');
  const deerN = deadfall.catches.filter(c => c === 'white_tailed_deer').length;
  const rabN = deadfall.catches.filter(c => c === 'cottontail_rabbit').length;
  ok('deadfall: deer rarer than rabbit (a deer deadfall is work, not lunch)', deerN > 0 && deerN < rabN, `deer=${deerN} rabbit=${rabN}`);
  ok('deadfall: knowledge text is honest about the rarity', /once in a long while|rare/i.test(deadfall.knowledgeLevels['3']), deadfall.knowledgeLevels['3'].slice(0, 60));
  const boxTrap = trapRecipes.find(r => r.id === 'box_trap');
  const foxN = boxTrap.catches.filter(c => c === 'gray_fox').length;
  const racN = boxTrap.catches.filter(c => c === 'raccoon').length;
  ok('box trap: fox rarer than raccoon (foxes are shy of traps)', foxN > 0 && foxN <= racN, `fox=${foxN} raccoon=${racN}`);
  const musN = boxTrap.catches.filter(c => c === 'muskrat').length;
  ok('box trap: muskrat common (the classic trapped furbearer)', musN >= 2, `muskrat=${musN}`);
  const skuN = boxTrap.catches.filter(c => c === 'striped_skunk').length;
  const snaN = boxTrap.catches.filter(c => c === 'timber_rattlesnake').length;
  ok('box trap: skunk occasional (you will regret it)', skuN === 1, `skunk=${skuN}`);
  ok('box trap: rattlesnake rare (a problem you built)', snaN === 1, `snake=${snaN}`);
  ok('box trap: knowledge text warns about skunk and snake honestly',
    /upwind|long stick/i.test(boxTrap.knowledgeLevels['3']) && /rattlesnake/i.test(boxTrap.knowledgeLevels['3']),
    boxTrap.knowledgeLevels['3'].slice(0, 80));
  // the hunt feedback promise: "a trap would work better" names a real mechanic
  ok("encMethodWords('trap') is honest copy", Game.encMethodWords('trap') === 'a trap');
  const snare = trapRecipes.find(r => r.id === 'snare');
  ok('snare: opossum wanders in (easy meat, matches knowledge text)', snare.catches.includes('opossum'));

  // ============ 3. FEEL: a player transcript, eyeball the fiction ============
  s = freshGame();
  Game.log = [];
  const lines = [];
  for (let i = 0; i < 3; i++) {
    ra = putAnimal(s, 'cottontail_rabbit', 4, 4, { aware: 1, stamina: 3 });
    Game.log = [];
    Game.preyReaction(ra); // real randomness
    const t = sayText().trim().split('\n').pop();
    lines.push(`strike ${i + 1}: rabbit at (${ra.mx},${ra.my}) — "${t}"`);
  }
  console.log('\n--- hunt feel transcript (same-tile strikes, open grass) ---');
  lines.forEach(l => console.log('  ' + l));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
