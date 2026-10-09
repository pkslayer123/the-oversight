// BREAK-IT: TRAVEL & MAP round 3 — EXPLOIT: engine movement had no combat guard (Steve 2026-10-08).
// ATTACK: Game.travelTo() never checked inCombat(). tryNodeExit (dpad) and walkPathAnimated
// both refuse mid-fight, and the grid-tap handler routes taps to tbPlayerMove — but the
// engine itself teleported: Game.travelTo(adjacent) mid-fight moved map.px/py with the
// tbfight still live. Free flee with no 50% barrier roll, no consequences, and a desynced
// fight whose fighters reference a node you left. Same latent class in microMove,
// beginPathWalk, pathStep (scholar.mx/my slides without the tb fighter moving).
// FIX (game.js): travelTo refuses mid-combat unless combatExit (tbBarrierExit passes true —
// the barrier is the one legitimate mid-fight crossing); microMove/beginPathWalk/pathStep
// refuse outright. All refusals say so (no silent actions).
// Also removed two dead variables found in the sweep: wasUnknown (game.js travelTo),
// pendingTravel (app.js — declared, never read).
// Usage: node scripts/test-travel-breakit.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-breakit.js    (pre-fix code from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt3-game-before.js', { cwd: ROOT });
  execSync('git show HEAD:src/js/party.js > /tmp/bt3-party-before.js', { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix game.js + party.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
const gameFile = BEFORE ? '/tmp/bt3-game-before.js' : path.join(ROOT, 'src/js/game.js');
const partyFile = BEFORE ? '/tmp/bt3-party-before.js' : null; // null => normal LIST path
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', null, 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  let p;
  if (f === null) p = gameFile;
  else if (BEFORE && f === 'party.js') p = partyFile;
  else p = path.join(ROOT, 'src/js', f);
  try { eval(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const realRandom = Math.random;

function setupFight() {
  rng.reset();
  if (Game.tbfight) Game.tbfight = null; // harness hygiene: newGame doesn't clear fights (combat loop's area)
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  Game.startCombat('hushwolf');
  return { px: Game.map.px, py: Game.map.py };
}
// clearEast: make the east neighbor a plain unblocked grove so crossing tests
// don't depend on the seeded tile (creek/rubble would honestly refuse).
function clearEast(px, py) {
  const t = Game.tileAt(px + 1, py);
  t.type = 'grove'; delete t.needsBridge; delete t.bridged; delete t.blockFrom;
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  const r = fn();
  Game.say = origSay;
  return { r, says };
}

// ---- 1. travelTo mid-combat ----
{
  const { px, py } = setupFight();
  const { r, says } = captureSay(() => Game.travelTo(px + 1, py));
  const moved = Game.map.px !== px || Game.map.py !== py;
  const fightLive = !!Game.tbfight && !Game.tbfight.over;
  console.log(`  [info travelTo] moved=${moved} fightLive=${fightLive} ret=${r === null ? 'null' : typeof r}`);
  if (BEFORE) {
    ok('BEFORE: travelTo mid-combat TELEPORTS with the fight still live (exploit real)', moved && fightLive);
  } else {
    ok('AFTER: travelTo mid-combat refused (null)', r === null);
    ok('AFTER: no movement', !moved);
    ok('AFTER: fight still live (not silently ended)', fightLive);
    ok('AFTER: says the honest line', says.some(m => /not mid-fight/i.test(m)), says.join(' | ').slice(0, 120));
  }
}

// ---- 2. sibling: microMove / beginPathWalk / pathStep mid-combat ----
{
  const { px, py } = setupFight();
  const mx0 = Game.state.scholar.mx, my0 = Game.state.scholar.my;
  const mm = Game.microMove(mx0 + 1 > 8 ? mx0 - 1 : mx0 + 1, my0);
  const bp = Game.beginPathWalk(mx0, my0 === 8 ? my0 - 2 : my0 + 2);
  const ps = Game.pathStep(mx0, my0);
  const unmoved = Game.state.scholar.mx === mx0 && Game.state.scholar.my === my0;
  console.log(`  [info sibs] microMove=${mm} beginPathWalk=${bp === null ? 'null' : 'path'} pathStep=${ps} unmoved=${unmoved}`);
  if (BEFORE) {
    ok('BEFORE: microMove slides mid-combat (desync real)', mm === true || !unmoved);
  } else {
    ok('AFTER: microMove refused', mm === false);
    ok('AFTER: beginPathWalk refused', bp === null);
    ok('AFTER: pathStep refused', ps === false);
    ok('AFTER: scholar unmoved by all three', unmoved);
  }
}

// ---- 3. regression: barrier exit still crosses (combatExit bypass) ----
if (!BEFORE) {
  const { px, py } = setupFight();
  const p = Game.tbFighter('p');
  p.mx = 8; p.my = 4;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4;
  clearEast(px, py);
  Math.random = () => 0.1; // flee roll succeeds
  captureSay(() => Game.tbBarrierExit(1, 0));
  Math.random = realRandom;
  const moved = Game.map.px === px + 1;
  const fightOver = !Game.tbfight || !!Game.tbfight.over;
  ok('AFTER: tbBarrierExit (legit mid-combat crossing) still moves + ends fight', moved && fightOver,
    `at ${Game.map.px},${Game.map.py} fightOver=${fightOver}`);
}

// ---- 4. regression: normal travel untouched when not in combat ----
if (!BEFORE) {
  rng.reset();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  if (Game.tbfight) Game.tbfight = null;
  const px = Game.map.px, py = Game.map.py;
  clearEast(px, py);
  const { r } = captureSay(() => Game.travelTo(px + 1, py));
  const blocked = r && r.kind === 'blockage';
  ok('AFTER: travelTo outside combat still works', Game.map.px === px + 1 && !blocked);
  const mm = Game.microMove(Game.state.scholar.mx, (Game.state.scholar.my + 1) % 9);
  ok('AFTER: microMove outside combat still works', mm === true);
}

// ---- 5. wrapper side effects only on real arrivals (party.js) ----
{
  rng.reset();
  if (Game.tbfight) Game.tbfight = null; // harness hygiene (see setupFight)
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  const px = Game.map.px, py = Game.map.py;
  // block the east neighbor: travelTo will REFUSE with a blockage object
  Game.tileAt(px + 1, py).blockFrom = { type: 'fallen_tree', dx: -1, dy: 0 };
  let banter = 0, sweep = 0, placed = 0;
  const ob = Game.partyBanter, os = Game.betrayalSweep, op = Game.placePartyAtPlayer;
  Game.partyBanter = () => { banter++; };
  Game.betrayalSweep = () => { sweep++; };
  Game.placePartyAtPlayer = () => { placed++; };
  const r = Game.travelTo(px + 1, py);
  Game.partyBanter = ob; Game.betrayalSweep = os; Game.placePartyAtPlayer = op;
  const refused = r && r.kind === 'blockage';
  const fired = banter + sweep + placed;
  console.log(`  [info wrapper] refused=${refused} sideEffectsFired=${fired}`);
  if (BEFORE) {
    ok('BEFORE: refused travel still fires party side effects (betrayal-roll farm real)', refused && fired > 0);
  } else {
    ok('AFTER: refused travel fires NO party side effects', refused && fired === 0,
      `banter=${banter} sweep=${sweep} placed=${placed}`);
  }
}

// ---- 6. wrapper still fires on a REAL arrival (AFTER only) ----
if (!BEFORE) {
  rng.reset();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  if (Game.tbfight) Game.tbfight = null; // harness hygiene (see setupFight)
  const px = Game.map.px, py = Game.map.py;
  clearEast(px, py);
  let banter = 0, sweep = 0;
  const ob = Game.partyBanter, os = Game.betrayalSweep;
  Game.partyBanter = () => { banter++; };
  Game.betrayalSweep = () => { sweep++; };
  Game.travelTo(px + 1, py);
  Game.partyBanter = ob; Game.betrayalSweep = os;
  ok('AFTER: real arrival still fires party side effects', Game.map.px === px + 1 && banter === 1 && sweep === 1,
    `banter=${banter} sweep=${sweep}`);
}

console.log(`\n${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'})`);
process.exit(fail ? 1 : 0);
