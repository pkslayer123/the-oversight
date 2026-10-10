// EXPLORER BREAK-IT 2026-10-10 — W1 WALK-PRICE INCOHERENCE (exploit)
// ATTACK: the same grid squares cost 5x more via the "Walk here" button than
// via manual taps. microMove charges 2 kcal/step (Steve 2026-10-05: "not
// free, not punishing"); walkStepKcal() charges 10/square for the committed
// walk — identical fictional weight (1 square, 1 tick), two different prices.
// A hostile player never taps "Walk here": 8 squares cost 16 kcal by hand,
// 80 via the button. The accessibility tap-to-move path is a noob trap.
// (break-it travel r6 noticed the gap — "the old '2 kcal' assertion predates
// the prepaid model" — and walked past it.)
//
// FIX: walkStepKcal() unified to the microMove per-step price (one formula,
// both verbs). TIME-ECONOMY.md matrix updated to match.
// Usage: node scripts/test-explorer-walkprice-20261010.js
//        BEFORE=1 node scripts/test-explorer-walkprice-20261010.js  (pre-fix)
//        SEED=999 node scripts/test-explorer-walkprice-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let gameSrc;
let appSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/exw-game-before.js', { cwd: ROOT });
  gameSrc = fs.readFileSync('/tmp/exw-game-before.js', 'utf8');
  execSync('git show HEAD:src/js/app.js > /tmp/exw-app-before.js', { cwd: ROOT });
  appSrc = fs.readFileSync('/tmp/exw-app-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix game.js + app.js from git HEAD)');
} else {
  gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
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
// SEED BEFORE EVAL (mulberry32; modules capture Math.random at load).
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rngReset(s) { _rng = mulberry32(s === undefined ? SEED : s); }
Math.random = () => _rng();
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', '__GAME__', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = f === '__GAME__' ? gameSrc : fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0, skipped = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function skip(name, why) { skipped++; console.log('  SKIP ' + name + ' — ' + why); }
function setup() {
  rngReset();
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  if (s.insideHaven) Game.exitBuilding();
  s.insideHaven = false;
  return s;
}
function walkableNeighbors(x, y) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const ax = x + dx, ay = y + dy;
    if (ax < 0 || ax > 8 || ay < 0 || ay > 8) continue;
    const c = d[ay] && d[ay][ax];
    if (c && !Game.cellProps(c).blocks) out.push([ax, ay]);
  }
  return out;
}

// ---- W1: one square costs the same however you walk it ----
{
  setup();
  const s = Game.state.scholar;
  const nA = walkableNeighbors(s.mx ?? 4, s.my ?? 4)[0];
  if (!nA) { skip('W1: no walkable neighbor on this seed', 'map'); }
  else {
    // microMove per-step price, measured live (no hardcoded 2 in the invariant).
    const k0 = s.kcal;
    const moved = Game.microMove(nA[0], nA[1]);
    const microStepCost = Math.round(k0 - s.kcal);
    ok('W1 setup: microMove stepped', moved === true);
    ok('W1 setup: microMove charges a positive per-step price', microStepCost > 0, 'cost=' + microStepCost);

    const committedStepCost = Game.walkStepKcal();
    if (BEFORE) {
      ok('BEFORE: committed-walk square costs 5x a manual step (the exploit)',
        committedStepCost === 5 * microStepCost,
        `walkStepKcal=${committedStepCost} vs microMove=${microStepCost}`);
    } else {
      ok('AFTER: walkStepKcal() === microMove per-step price (one price, both verbs)',
        committedStepCost === microStepCost,
        `walkStepKcal=${committedStepCost} vs microMove=${microStepCost}`);
      ok('AFTER: walkCost(n) === n x the single per-step price',
        Game.walkCost(6) === 6 * microStepCost,
        `walkCost(6)=${Game.walkCost(6)}`);
    }
  }
}

// ---- W2: an 8-square walk costs the same by hand or by button ----
{
  setup();
  const s = Game.state.scholar;
  // find a straight-ish walkable run of 8: walk greedily, then walk it back.
  let x = s.mx ?? 4, y = s.my ?? 4;
  const trail = [];
  for (let i = 0; i < 8; i++) {
    const next = walkableNeighbors(x, y).filter(([ax, ay]) => !trail.some(([tx, ty]) => tx === ax && ty === ay))[0];
    if (!next) break;
    trail.push(next); x = next[0]; y = next[1];
  }
  if (trail.length < 8) { skip('W2: no 8-step walkable trail on this seed', 'map'); }
  else {
    // reset position to trail start
    const sx = s.mx ?? 4, sy = s.my ?? 4;
    // walk it by hand (microMove), measuring total
    const k0 = s.kcal;
    let allMoved = true;
    for (const [tx, ty] of trail) { if (!Game.microMove(tx, ty)) { allMoved = false; break; } }
    const handCost = Math.round(k0 - s.kcal);
    ok('W2 setup: 8 manual steps all landed', allMoved, 'cost=' + handCost);
    // walk the IDENTICAL squares back via the committed-walk step verb
    // (pathStep levies walkStepKcal per landed square — r6)
    const k1 = s.kcal;
    // rebuild: from trail end back to start, one adjacent hop per step
    const revPoints = trail.slice(0, -1).reverse().concat([[sx, sy]]);
    let backSteps = 0;
    for (const [tx, ty] of revPoints) { if (Game.pathStep(tx, ty)) backSteps++; else break; }
    const buttonCost = Math.round(k1 - s.kcal);
    ok('W2 setup: 8 committed steps all landed on the same squares', backSteps === 8, `landed=${backSteps} cost=${buttonCost}`);
    // the button's quote for this exact walk, for reference
    const quote = Game.walkCost(revPoints.length);
    ok('W2 setup: committed walk billed exactly its quote', buttonCost === quote, `billed=${buttonCost} quote=${quote}`);
    if (BEFORE) {
      ok('BEFORE: same squares cost 5x via the walk verb (the exploit)',
        buttonCost === 5 * handCost, `walk-verb=${buttonCost} hand=${handCost}`);
    } else {
      ok('AFTER: same squares cost the same via either verb',
        buttonCost === handCost, `walk-verb=${buttonCost} hand=${handCost}`);
    }
  }
}

// ---- W3: UI fallback honesty (app.js raw fallback must match the formula) ----
{
  const m = appSrc.match(/path\.length \* (\d+)/);
  if (BEFORE) {
    ok('BEFORE: app.js fallback prices the walk at 10/square', m && m[1] === '10', m ? m[0] : 'no match');
  } else {
    ok('AFTER: app.js fallback prices the walk at the unified per-step price',
      m && parseInt(m[1], 10) === Game.walkStepKcal(), m ? m[0] : 'no match');
  }
}

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail, ${skipped} skipped (seed ${SEED}) ===`);
process.exit(fail > 0 ? 1 : 0);
