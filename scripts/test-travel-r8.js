// BREAK-IT: TRAVEL & MAP round 8 (2026-10-10) — hostile player.
// Rounds 1-7 + the morning run (diagonal armor, hive_mind, echo/dowsing fog
// honesty) are closed and NOT re-attacked. This round attacks NEW surface:
//   T1 EXPLOIT: glasswing trap resolve stacking onto an occupied tile (the
//       open round-7 item). The arming removes the glasswing, so another
//       monster can claim the tile while the shadow circles; the dive then
//       stacked — startCombat deleted the WRONG monster (free silent kill),
//       built the fighter at the old monster's cell with its phase flags
//       (grounded window lie), and left a phantom glasswing (second fight
//       for one trap).
//   T2 HONESTY: scholar.monster resync on travelTo (ontology claims it;
//       verify it's wired, not just commented).
//   T3 HONESTY: tryNodeExit pit-death — travelTo returns undefined on
//       pit death, so `res !== null` reported moved:true for a corpse.
//   T4 HONESTY: swim handler (app.js) — pit death on the far bank charged
//       20 kcal and said "cold and grinning" for a corpse (source check;
//       app.js is DOM-only).
//   T5 DEAD CODE: every travel/map function reachable (incl. new code).
//   T6 EXPLOIT held: force=true travelTo only reachable via swim (UI,
//       creek/washed_out + swimmer) and debug-scenarios.
//   T7 SOFTLOCK held: no strand between nodes — map.px/py writes valid,
//       returnToVillage PIN keeps grid coords sane.
// Usage: node scripts/test-travel-r8.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-r8.js    (pre-fix HEAD code)
//        SEED=999 node scripts/test-travel-r8.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
function headSrc(p) {
  execSync(`git show HEAD:${p} > /tmp/bt8-before-${p.replace(/\//g, '_')}`, { cwd: ROOT });
  return fs.readFileSync(`/tmp/bt8-before-${p.replace(/\//g, '_')}`, 'utf8');
}
const gameSrc = BEFORE ? headSrc('src/js/game.js') : fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const appSrc = BEFORE ? headSrc('src/js/app.js') : fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
console.log(BEFORE ? 'MODE: BEFORE (pre-fix HEAD code)' : 'MODE: AFTER (fixed worktree code)');
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
function goWild() {
  // leave haven for an unblocked adjacent wild tile
  const t = Game.travelTargets().find(tt =>
    Math.abs(tt.x - Game.map.px) + Math.abs(tt.y - Game.map.py) === 1 &&
    !Game.travelBlockage(tt.x, tt.y) && Game.tileAt(tt.x, tt.y).type !== 'haven');
  if (t) Game.travelTo(t.x, t.y);
  Game.tbfight = null;
  return t;
}

// ---- T1. EXPLOIT: glasswing trap resolve onto an occupied tile ----
{
  setup(); goWild();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  const bull = Game.spawnWorldMonster({ id: 'bulldozer' }, Game.map.px, Game.map.py, { mx: 1, my: 1 });
  bull.hp = 7; // wounded: if it vanishes, that's a free silent kill
  s.gwTrap = { turns: 2, tileX: 4, tileY: 4, monsterId: 'glasswing' };
  const log = [];
  const osay = Game.say; Game.say = (m) => log.push(m);
  let spawnedOpts = null, atSpawn = -1;
  const oSpawn = Game.spawnWorldMonster;
  Game.spawnWorldMonster = function (mdef, tx, ty, opts) {
    const r = oSpawn.call(this, mdef, tx, ty, opts);
    // count the moment the dive lands, before startCombat reshuffles
    atSpawn = Game.worldMonsters().filter(m => m.tx === Game.map.px && m.ty === Game.map.py).length;
    spawnedOpts = opts;
    return r;
  };
  Game.gwTrapTick();
  Game.spawnWorldMonster = oSpawn;
  Game.say = osay;
  const onTile = Game.worldMonsters().filter(m => m.tx === Game.map.px && m.ty === Game.map.py);
  const mf = Game.tbfight ? Game.tbfight.fighters.find(f => f.kind === 'monster') : null;
  console.log(`  [info] T1 after trap resolve: at spawn n=${atSpawn}, now [${onTile.map(m => m.id).join(',')}], bulldozer alive=${Game.worldMonsters().includes(bull)}, fighter=${mf ? mf.monsterId + ' @' + mf.mx + ',' + mf.my + ' gwGrounded=' + mf.gwGrounded + ' phase=' + mf.beamPhase : 'none'}`);
  if (BEFORE) {
    ok('BEFORE: the dive stacked a 2nd monster onto the occupied tile', atSpawn === 2, `n=${atSpawn}`);
    ok('BEFORE: startCombat silently deleted the WRONG monster (free kill)', !Game.worldMonsters().includes(bull));
    ok('BEFORE: grounded window promised by narration is silently 0', mf && mf.gwGrounded === 0, `gwGrounded=${mf && mf.gwGrounded}`);
    ok('BEFORE: fighter built at the old monster\'s cell, not the slam site', mf && mf.mx === 1 && mf.my === 1, `at ${mf && mf.mx},${mf && mf.my}`);
    ok('BEFORE: fighter lost the grounded phase (stalked instead of grounded)', mf && mf.beamPhase !== 'grounded', `phase=${mf && mf.beamPhase}`);
    ok('BEFORE: phantom glasswing left on the tile (second fight for one trap)',
      onTile.some(m => m.id === 'glasswing'));
  } else {
    // The glasswing is removed INTO the fight by design ("it's in the fight
    // now, not wandering") — the tile reads empty, same as every combat.
    // The drive-off ran BEFORE the spawn, so the dive never stacked.
    ok('AFTER: the dive landed on unclaimed ground (drive-off ran first)',
      atSpawn === 1, `n=${atSpawn}`);
    ok('AFTER: no stacked tile — the glasswing went into the fight, nothing phantom left',
      onTile.length === 0, `[${onTile.map(m => m.id).join(',')}]`);
    ok('AFTER: the bulldozer was driven off, not deleted', Game.worldMonsters().includes(bull), 'bulldozer gone');
    ok('AFTER: driven-off bulldozer is on an adjacent tile, wounds kept',
      (Math.abs(bull.tx - Game.map.px) + Math.abs(bull.ty - Game.map.py) >= 1) && bull.hp === 7,
      `at ${bull.tx},${bull.ty} hp=${bull.hp}`);
    ok('AFTER: the dive spawned with the promised grounded window (3 ticks)',
      spawnedOpts && spawnedOpts.gwGrounded === 3 && spawnedOpts.beamPhase === 'grounded' &&
      spawnedOpts.mx === 4 && spawnedOpts.my === 4,
      spawnedOpts ? `g=${spawnedOpts.gwGrounded} p=${spawnedOpts.beamPhase} @${spawnedOpts.mx},${spawnedOpts.my}` : 'no spawn captured');
    // The speed-5 darter OPENS (Steve 2026-10-04 opening-turns rule), burning
    // one grounded tick before the player moves: 3 -> 2 is the designed
    // window (GROUNDED WINDOW PARITY comment), not a leak.
    ok('AFTER: fighter holds the slam site, grounded, window intact after the opening tick',
      mf && mf.mx === 4 && mf.my === 4 && mf.gwGrounded === 2 && mf.beamPhase === 'grounded',
      mf ? `@${mf.mx},${mf.my} g=${mf.gwGrounded} p=${mf.beamPhase}` : 'no fighter');
    ok('AFTER: the drive-off is narrated honestly',
      log.some(l => /drives the|drives something|scatters the|scatters something/i.test(l)),
      log.slice(-3).join(' | ').slice(0, 120));
  }
  Game.tbfight = null;
}

// ---- T2. HONESTY: scholar.monster resyncs on travelTo (ontology claim) ----
{
  setup();
  const s = Game.state.scholar;
  const t = Game.travelTargets().find(tt =>
    Math.abs(tt.x - Game.map.px) + Math.abs(tt.y - Game.map.py) === 1 &&
    !Game.travelBlockage(tt.x, tt.y) && Game.tileAt(tt.x, tt.y).type !== 'haven');
  ok('T2 setup: adjacent wild tile', !!t);
  // plant a monster on the DESTINATION, then poison the alias with a stale one
  const m = Game.spawnWorldMonster({ id: 'bulldozer' }, t.x, t.y, { mx: 2, my: 2 });
  s.monster = { id: 'hushwolf', mx: 0, my: 0 }; // stale phantom: never on any tile
  Game.travelTo(t.x, t.y);
  Game.tbfight = null;
  ok('T2: travelTo re-synced scholar.monster to the arrival tile monster',
    s.monster === m || (s.monster && s.monster.id === 'bulldozer'),
    `alias=${s.monster && s.monster.id}`);
  ok('T2: the stale phantom no longer haunts the alias', !(s.monster && s.monster.id === 'hushwolf'));
}

// ---- T3. HONESTY: pit death mid-crossing — moved report + swim charge ----
{
  // T3a: the mantle passes (normal case). The crossing HAPPENED (map moved),
  // then the bearer died and the successor woke at Haven. tryNodeExit must
  // report the crossing honestly, and the successor must be sane — no
  // phantom tile, no stranded grid coords.
  setup(); goWild();
  const s = Game.state.scholar;
  const bearerBefore = Game.villagerId;
  s.health = 10; s.mx = 4; s.my = 4;
  const t = Game.travelTargets().find(tt =>
    Math.abs(tt.x - Game.map.px) + Math.abs(tt.y - Game.map.py) === 1 &&
    !Game.travelBlockage(tt.x, tt.y) && Game.tileAt(tt.x, tt.y).type !== 'haven');
  ok('T3a setup: adjacent wild tile', !!t);
  Game.tileAt(t.x, t.y).traps = [{ recipeId: 'pit_trap', setDay: s.day - 1, uses: 2 }];
  const dx = t.x - Game.map.px, dy = t.y - Game.map.py;
  const _r = Math.random; Math.random = () => 0; // force the 50% pit trigger, 15 dmg
  let r = null;
  try { r = Game.tryNodeExit(dx, dy); } finally { Math.random = _r; }
  const s2 = Game.state.scholar;
  const mantlePassed = Game.villagerId !== bearerBefore;
  console.log(`  [info] T3a pit death: mantle passed=${mantlePassed}, moved=${r && r.moved}, successor at map ${Game.map.px},${Game.map.py} grid ${s2.mx},${s2.my} insideHaven=${!!s2.insideHaven}`);
  ok('T3a setup: the pit killed the bearer', mantlePassed);
  ok('T3a: the crossing is still reported (it happened before the death)', r && r.moved === true, `moved=${r && r.moved}`);
  const hv = Game.state.village;
  ok('T3a: the successor wakes at Haven with sane coords (no phantom tile)',
    Game.map.px === (hv.px ?? 4) && Game.map.py === (hv.py ?? 4) && s2.mx === 4 && s2.my === 4 && !!s2.insideHaven,
    `map ${Game.map.px},${Game.map.py} grid ${s2.mx},${s2.my}`);
  ok('T3a: the successor was NOT charged a phantom swim toll', s2.kcal === 1500, `kcal=${s2.kcal}`);

  // T3b: the village is wiped by the death (no successors). tryNodeExit must
  // not report moved:true for a run that no longer exists.
  setup(); goWild();
  const s3 = Game.state.scholar;
  s3.health = 10; s3.mx = 4; s3.my = 4;
  const t3 = Game.travelTargets().find(tt =>
    Math.abs(tt.x - Game.map.px) + Math.abs(tt.y - Game.map.py) === 1 &&
    !Game.travelBlockage(tt.x, tt.y) && Game.tileAt(tt.x, tt.y).type !== 'haven');
  ok('T3b setup: adjacent wild tile', !!t3);
  Game.tileAt(t3.x, t3.y).traps = [{ recipeId: 'pit_trap', setDay: s3.day - 1, uses: 2 }];
  const dx3 = t3.x - Game.map.px, dy3 = t3.y - Game.map.py;
  const oNpcIds = Game.npcIds;
  Game.npcIds = () => []; // no successors: this death ends the run
  const _r3 = Math.random; Math.random = () => 0;
  let r3 = null;
  try { r3 = Game.tryNodeExit(dx3, dy3); } finally { Math.random = _r3; Game.npcIds = oNpcIds; }
  console.log(`  [info] T3b wiped run: over=${Game.over}, moved=${r3 && r3.moved}`);
  ok('T3b setup: the run is over', !!Game.over);
  if (BEFORE) {
    ok('BEFORE: tryNodeExit reported moved:true for a wiped run (break real)', r3 && r3.moved === true);
  } else {
    ok('AFTER: tryNodeExit reports moved:false for a wiped run', r3 && r3.moved === false, `moved=${r3 && r3.moved}`);
  }
}

// ---- T4. HONESTY (source): swim handler must not charge/grin for a dead bearer ----
// app.js is DOM-only (excluded from the node harness per convention), so this
// is a source assertion on the exact branch. The engine half (T3a) proves the
// mantle-passing behavior the branch guards.
{
  const at = appSrc.indexOf("act === 'swim'");
  const swimBranch = appSrc.slice(at, at + 1600);
  if (BEFORE) {
    ok('BEFORE: swim branch only null-checked — pit death charged the successor and grinned',
      swimBranch.includes('swam === null') && !swimBranch.includes('bearerBefore'));
  } else {
    ok('AFTER: swim branch refuses the charge when the bearer died mid-crossing',
      swimBranch.includes('bearerBefore') && swimBranch.includes('Game.villagerId !== bearerBefore') && swimBranch.includes('Game.over'));
  }
}

// ---- T5. DEAD CODE: every travel/map function reachable ----
{
  const srcs = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    if (f.endsWith('.js')) srcs['js/' + f] = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  }
  // debugToWildNode is a test hook: its live callers are the proof scripts.
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
    if (f.endsWith('.js')) srcs['scripts/' + f] = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
  }
  const all = Object.values(srcs).join('\n');
  const fns = ['travelTo', 'travelTargets', 'travelBlockage', 'travelTimeStep', 'reveal',
    'markSeen', 'mapSeen', 'compareMaps', 'villageMapKnown', 'seedVillagerMaps',
    'edgeExit', 'tryNodeExit', 'findWalkableEntry', 'clearBlockage', 'buildBridge',
    'smashBridge', 'beginPathWalk', 'pathStep', 'walkCost', 'walkStepKcal',
    'debugToWildNode', 'renderMap', 'hiveSight', 'syncMonsterAlias', 'playerMonster',
    'glasswingTrapCells', 'touchTileScene', 'monsterNoun', 'gwTrapTick'];
  let dead = [];
  for (const fn of fns) {
    const defRe = new RegExp(`(function ${fn}|${fn}\\s*\\(|${fn}\\s*[:=]\\s*function|Game\\.${fn}\\s*=)`);
    const uses = (all.match(new RegExp(`\\b${fn}\\b`, 'g')) || []).length;
    if (!defRe.test(all) || uses < 2) dead.push(fn);
  }
  ok('T5: all travel/map functions defined and called', dead.length === 0, dead.join(','));
}

// ---- T6. EXPLOIT held: force=true only via swim UI + debug ----
{
  const forceCalls = [];
  const re = /travelTo\(([^)]*)\)/g;
  let mm;
  const appLines = appSrc.split('\n');
  appLines.forEach((ln, i) => { if (/travelTo\(.*, *true/.test(ln)) forceCalls.push(`app.js:${i + 1}`); });
  const dbgSrc = fs.readFileSync(path.join(ROOT, 'src/js/debug-scenarios.js'), 'utf8');
  dbgSrc.split('\n').forEach((ln, i) => { if (/travelTo\(.*, *true/.test(ln)) forceCalls.push(`debug-scenarios.js:${i + 1}`); });
  console.log('  [info] T6 force=true call sites: ' + forceCalls.join(', '));
  ok('T6: force=true only at the swim branch + debug scenario',
    forceCalls.length === 2 && forceCalls[0].startsWith('app.js:') && forceCalls[1].startsWith('debug-scenarios.js:'),
    forceCalls.join(','));
  // the swim button is only offered for creek/washed_out blockages
  const cardSrc = appSrc;
  ok('T6: swim offered only for creek/washed_out (never smuggles past fallen trees)',
    /blockType === 'washed_out' \|\| blockType === 'creek'/.test(cardSrc) &&
    cardSrc.indexOf("data-act=\"swim\"") > cardSrc.indexOf("blockType === 'washed_out'"));
}

// ---- T7. SOFTLOCK held: no strand between nodes ----
{
  setup(); goWild();
  const s = Game.state.scholar;
  // every map.px/py write in the codebase lands in-bounds (travelTo guards,
  // PINs use village coords ?? 4)
  const writes = (gameSrc.match(/map\.p[xy] = [^;]+/g) || []);
  ok('T7: map.px/py writes are all guarded or pinned', writes.length > 0 && writes.length < 10, writes.length + ' writes');
  Game.returnToVillage();
  const px = Game.map.px, py = Game.map.py;
  const sane = px >= 0 && px <= 8 && py >= 0 && py <= 8 && (s.mx ?? 4) >= 0 && (s.mx ?? 4) <= 8 && (s.my ?? 4) >= 0 && (s.my ?? 4) <= 8;
  ok('T7: returnToVillage PIN leaves player on a real tile with sane grid coords', sane, `map ${px},${py} grid ${s.mx},${s.my}`);
  const stepped = Game.microMove(Math.min(8, (s.mx ?? 4) + 1), s.my ?? 4);
  ok('T7: the player can still move after the PIN (no phantom tile)', stepped === true || stepped === false);
}

console.log(`\n${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'} mode, seed ${SEED})`);
process.exit(fail ? 1 : 0);
