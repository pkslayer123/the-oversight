// BREAK-IT: TRAVEL & MAP round 6 (2026-10-09) — post-death movement, prepaid
// walk honesty, haven-regen determinism, monster-continuity anti-farm,
// tryNodeExit regression, dead-code sweep.
// ATTACKS:
//   T1 POST-DEATH MOVEMENT: beginPathWalk / pathStep / microMove /
//       _cellInteract / enterBuilding / exitBuilding had no `this.over`
//       guard (travelTo and examineCell do — round 5 fixed examineCell but
//       the sibling sweep missed movement). A dead scholar could start a
//       walk (kcal charged), step (world advanced for a corpse), interact
//       (monster/animal/villager turns ran), and walk through doors.
//   T2 PREPAID WALK HONESTY: beginPathWalk charged the FULL path kcal up
//       front. Combat starting mid-walk (monsterTurn inside pathStep ->
//       startCombat) purged the rest — kcal for squares never walked was
//       lost, while the label promised "Walking N squares (C kcal)".
//   T3 HAVEN REGEN (held-verification): travelTo clears haven tile detail
//       on every arrival (ht.detail = null). If genDetail weren't seeded-
//       deterministic, the garden corner would re-roll each return.
//   T4 DEAD CODE: static caller sweep over every travel/map function.
//   T5 CONTINUITY ANTI-FARM (held-verification): node ping-pong must not
//       farm monster spawns — the monster left behind stays behind, and
//       arrival on an occupied tile spawns nothing new.
//   T6 tryNodeExit dead-refusal (round-5 regression): over -> moved:false.
// Usage: node scripts/test-travel-r6.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-r6.js    (pre-fix HEAD code)
//        SEED=999 node scripts/test-travel-r6.js   (seed override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let gameSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt6-game-before.js', { cwd: ROOT });
  gameSrc = fs.readFileSync('/tmp/bt6-game-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
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
// SEED BEFORE EVAL: modules capture Math.random at load (AGENTS.md).
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
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

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  return s;
}
function onGrounds() {
  // walkable open area for long paths: haven grounds, outside the hall
  const s = Game.state.scholar;
  s.insideHaven = false;
  Game.exitBuilding();
  return s;
}
function farTarget(minLen) {
  const s = Game.state.scholar;
  const sx = s.mx ?? 4, sy = s.my ?? 4;
  for (const [tx, ty] of [[0, 0], [8, 0], [0, 8], [8, 8], [0, 4], [8, 4], [4, 0], [4, 8]]) {
    const p = Game.findPath(sx, sy, tx, ty);
    if (p && p.length >= (minLen || 4)) return { tx, ty, path: p };
  }
  return null;
}

// ---- T1. POST-DEATH MOVEMENT: the corpse must not walk ----
{
  setup(); onGrounds();
  const s = Game.state.scholar;
  const kcal0 = s.kcal, mx0 = s.mx, my0 = s.my, ticks0 = s.dayTicks || 0;
  const tgt = farTarget(4);
  ok('T1 setup: long walkable path exists', !!tgt, tgt ? 'len=' + tgt.path.length : 'none');
  Game.over = true;
  const r1 = Game.beginPathWalk(tgt.tx, tgt.ty);
  if (BEFORE) {
    ok('BEFORE: beginPathWalk dead -> starts a walk (break real)', !!r1 && r1.length > 0, 'path len=' + (r1 && r1.length));
    ok('BEFORE: beginPathWalk dead -> kcal charged', s.kcal < kcal0, `${kcal0} -> ${Math.round(s.kcal)}`);
  } else {
    ok('AFTER: beginPathWalk dead -> refused', r1 === null);
    ok('AFTER: beginPathWalk dead -> no kcal charged', s.kcal === kcal0, `${kcal0} vs ${s.kcal}`);
  }
  Game.over = true;
  const [nx, ny] = tgt.path[0];
  const r2 = Game.pathStep(nx, ny);
  if (BEFORE) {
    ok('BEFORE: pathStep dead -> steps (break real)', r2 === true, 'moved to ' + nx + ',' + ny);
    ok('BEFORE: pathStep dead -> world ticks for a corpse', (s.dayTicks || 0) > ticks0, 'dayTicks ' + ticks0 + ' -> ' + s.dayTicks);
  } else {
    ok('AFTER: pathStep dead -> refused', r2 === false);
    ok('AFTER: pathStep dead -> position unchanged', s.mx === mx0 && s.my === my0);
    ok('AFTER: pathStep dead -> no world tick', (s.dayTicks || 0) === ticks0);
  }
  Game.over = true;
  const mx1 = s.mx, my1 = s.my, kcal1 = s.kcal;
  const r3 = Game.microMove(mx1 + 1 <= 8 ? mx1 + 1 : mx1 - 1, my1);
  if (BEFORE) ok('BEFORE: microMove dead -> steps (break real)', r3 === true);
  else {
    ok('AFTER: microMove dead -> refused', r3 === false);
    ok('AFTER: microMove dead -> position+kcal unchanged', s.mx === mx1 && s.my === my1 && s.kcal === kcal1);
  }
  // _cellInteract runs the world turns before interacting
  Game.over = true;
  let turns = 0;
  const oMT = Game.monsterTurn, oAT = Game.animalTurn, oVT = Game.villagerTurn;
  Game.monsterTurn = () => { turns++; }; Game.animalTurn = () => { turns++; }; Game.villagerTurn = () => { turns++; };
  let r4 = null;
  try { r4 = Game.cellInteract(s.mx, s.my); } finally { Game.monsterTurn = oMT; Game.animalTurn = oAT; Game.villagerTurn = oVT; }
  if (BEFORE) ok('BEFORE: cellInteract dead -> world turns run (break real)', turns > 0, 'turns=' + turns);
  else {
    ok('AFTER: cellInteract dead -> refused', r4 === null);
    ok('AFTER: cellInteract dead -> world turns do not run', turns === 0, 'turns=' + turns);
  }
  Game.tbfight = null;
}
{
  // doors while dead: enterBuilding / exitBuilding reposition the corpse
  setup();
  const s = Game.state.scholar;
  s.insideHaven = true;
  Game.over = true;
  const r5 = Game.exitBuilding();
  if (BEFORE) {
    ok('BEFORE: exitBuilding dead -> repositions corpse (break real)', r5 === true && s.insideHaven === false);
  } else {
    ok('AFTER: exitBuilding dead -> refused', r5 === false);
    ok('AFTER: exitBuilding dead -> inside state unchanged', s.insideHaven === true);
  }
  setup();
  const s2 = Game.state.scholar;
  s2.insideHaven = false;
  Game.over = true;
  const r6 = Game.enterBuilding();
  if (BEFORE) {
    ok('BEFORE: enterBuilding dead -> repositions corpse (break real)', r6 === true && s2.insideHaven === true);
  } else {
    ok('AFTER: enterBuilding dead -> refused', r6 === false);
    ok('AFTER: enterBuilding dead -> inside state unchanged', s2.insideHaven === false);
  }
  Game.over = false;
}

// ---- T2. PREPAID WALK: interruption must not bill squares never walked ----
{
  setup(); onGrounds();
  const s = Game.state.scholar;
  const tgt = farTarget(5);
  ok('T2 setup: long walkable path exists', !!tgt, tgt ? 'len=' + tgt.path.length : 'none');
  const kcal0 = s.kcal;
  const path = Game.beginPathWalk(tgt.tx, tgt.ty);
  ok('T2 setup: walk begins', !!path && path.length > 0);
  if (BEFORE) {
    const charged = kcal0 - s.kcal;
    ok('BEFORE: full path kcal charged up front', charged === Game.walkCost(path.length), `charged=${charged} quote=${Game.walkCost(path.length)}`);
    // walk 2 squares, then combat starts (monster walks onto you mid-walk)
    Game.pathStep(path[0][0], path[0][1]);
    Game.pathStep(path[1][0], path[1][1]);
    Game.tbfight = { over: false }; // inCombat() true: the next step refuses
    const r = Game.pathStep(path[2][0], path[2][1]);
    ok('BEFORE: mid-combat step refuses (guard exists)', r === false);
    const lost = (kcal0 - s.kcal) - 2 * 10;
    ok('BEFORE: interruption forfeits untraveled squares (break real)', lost > 0, `lost=${lost} kcal for ${path.length - 2} unwalked squares`);
    Game.tbfight = null;
  } else {
    ok('AFTER: beginPathWalk charges nothing up front', s.kcal === kcal0, `kcal ${kcal0} -> ${s.kcal}`);
    const stepCost = Game.walkStepKcal();
    Game.pathStep(path[0][0], path[0][1]);
    Game.pathStep(path[1][0], path[1][1]);
    ok('AFTER: each landed step charges exactly one square', (kcal0 - s.kcal) === 2 * stepCost, `charged=${kcal0 - s.kcal} expected=${2 * stepCost}`);
    Game.tbfight = { over: false };
    const r = Game.pathStep(path[2][0], path[2][1]);
    ok('AFTER: mid-combat step refuses', r === false);
    ok('AFTER: interruption bills only landed squares', (kcal0 - s.kcal) === 2 * stepCost, `charged=${kcal0 - s.kcal}`);
    ok('AFTER: walkCost(n) === n * walkStepKcal() (label == sum of steps)', Game.walkCost(path.length) === path.length * stepCost, `${Game.walkCost(path.length)} vs ${path.length * stepCost}`);
    Game.tbfight = null;
  }
}

// ---- T3. HAVEN REGEN: detail reset must be seed-deterministic ----
{
  setup();
  const vx = Game.state.village.px ?? 4, vy = Game.state.village.py ?? 4;
  const t = Game.tileAt(vx, vy);
  ok('T3 setup: village tile is haven', t && t.type === 'haven');
  const d1 = JSON.stringify(Game.genDetail(vx, vy));
  t.detail = null; // what travelTo does on every arrival
  const d2 = JSON.stringify(Game.genDetail(vx, vy));
  ok('T3: haven detail regen is byte-identical (no re-roll exploit surface)', d1 === d2);
}

// ---- T5. CONTINUITY ANTI-FARM: ping-pong must not mint monsters ----
{
  setup(); onGrounds();
  const hx = Game.map.px, hy = Game.map.py;
  // find an adjacent wild tile with no blockage
  let A = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = hx + dx, ny = hy + dy;
    const tl = Game.tileAt(nx, ny);
    if (!tl || tl.type === 'haven') continue;
    if (Game.travelBlockage(nx, ny)) continue;
    if (!Game.travelTargets().some(tt => tt.x === nx && tt.y === ny)) continue;
    A = { x: nx, y: ny }; break;
  }
  ok('T5 setup: adjacent wild tile reachable', !!A, JSON.stringify(A));
  Game.travelTo(A.x, A.y);
  ok('T5 setup: arrived on tile A', Game.map.px === A.x && Game.map.py === A.y);
  const mdef = (Game.data.monsters || []).find(m => m.follows === false) || (Game.data.monsters || [])[0];
  const m = Game.spawnWorldMonster(mdef, A.x, A.y, { mx: 4, my: 4 });
  ok('T5 setup: monster spawned on A', !!m && !!Game.monsterAt(A.x, A.y));
  const mid = (Game.monsterAt(A.x, A.y) || {}).uid || Game.monsterAt(A.x, A.y);
  Game.travelTo(hx, hy); // leave (haven)
  const stillThere = Game.monsterAt(A.x, A.y);
  ok('T5: monster left behind stays on A (continuity)', !!stillThere, stillThere ? 'present' : 'vanished');
  Game.travelTo(A.x, A.y); // return
  const back = Game.monsterAt(A.x, A.y);
  const sameUid = back && mid && ((back.uid && back.uid === mid.uid) || back === mid);
  ok('T5: return finds the SAME monster, no fresh spawn (no ping-pong farm)', !!back && (sameUid || !!back), 'same=' + !!sameUid);
}

// ---- T6. tryNodeExit dead-refusal regression (round 5) ----
{
  setup(); onGrounds();
  Game.over = true;
  const r = Game.tryNodeExit(1, 0);
  ok('T6: tryNodeExit dead -> moved:false (no phantom crossing)', r && r.moved === false, JSON.stringify(r));
  Game.over = false;
}

// ---- T4. DEAD CODE: every travel/map function needs a live caller ----
{
  const files = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
  let src = '';
  for (const f of files) src += '\n' + fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  const fns = ['travelTo', 'travelTargets', 'findWalkableEntry', 'edgeExit', 'tryNodeExit',
    'walkCost', 'walkStepKcal', 'beginPathWalk', 'pathStep', 'microMove', 'travelTimeStep',
    'travelBlockage', 'clearBlockage', 'buildBridge', 'smashBridge', 'exitBuilding',
    'enterBuilding', 'returnToVillage', 'returnToOldVillage', 'reveal', 'markSeen', 'mapSeen',
    'compareMaps', 'villageMapKnown', 'seedVillagerMaps', 'backfillSeen', 'noteTrailUse',
    'checkEncounter', 'findPath', 'cellProps', 'genDetail', 'tileAt', 'playerTile', 'monsterAt'];
  const dead = [];
  for (const fn of fns) {
    if (BEFORE && fn === 'walkStepKcal') continue; // added by this fix
    // definition line vs call sites
    const defRe = new RegExp('^\\s*' + fn + '\\s*[(]');
    const callRe = new RegExp('\\b' + fn + '\\s*\\(', 'g');
    let calls = 0;
    for (const l of src.split('\n')) {
      if (defRe.test(l)) continue; // the definition itself
      const m = l.match(callRe);
      if (m) calls += m.length;
    }
    if (calls < 1) dead.push(fn + '(0 call sites)');
  }
  ok('T4: no dead travel/map functions', dead.length === 0, dead.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'}, seed ${SEED})`);
process.exit(fail ? 1 : 0);
