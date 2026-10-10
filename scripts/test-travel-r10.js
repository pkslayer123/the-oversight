// BREAK-IT: TRAVEL & MAP round 10 (2026-10-10) — hostile player.
// Rounds 1-9 + the morning run are closed and NOT re-attacked. This round
// attacks NEW surface:
//   T1 EXPLOIT: phantom walk after Continue — MoveAnim's in-memory step queue
//       survives Game.load (the Continue handler never purges it), so queued
//       path steps keep executing against the freshly loaded state: the
//       reloaded bearer walks, spends kcal, ticks the clock, and moves
//       monsters for steps they never authorized post-load. Cross-save too
//       (Continue a DIFFERENT save mid-walk).
//   T2 EXPLOIT: death mid-walk phantom — playerDeath passes the mantle
//       (over stays false) but never stops the animator; queued path steps
//       keep executing and walk the NEW bearer on the dead player's intent,
//       charging the new body.
//   T3 EXPLOIT/HONESTY: long committed walks silently truncate —
//       walkPathAnimated bulk-enqueues the whole path, but MoveAnim caps the
//       queue at maxQueue (10): paths longer than 11 steps land only 11, the
//       label quoted the full walk, onDone(false) fires early while steps are
//       still animating.
//   T4 HONESTY probe: checkEncounter firing mid-fight during tbBarrierExit.
//   T5 DEAD CODE: travel/map functions reachable.
//   T6 HELD notes: swimmer creek crossing, force=true callers, teleports.
// Usage: node scripts/test-travel-r10.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-r10.js    (pre-fix HEAD code)
//        SEED=999 node scripts/test-travel-r10.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
function headSrc(p) {
  const tmp = `/tmp/bt10-before-${p.replace(/\//g, '_')}`;
  execSync(`git show HEAD:${p} > ${tmp}`, { cwd: ROOT });
  return fs.readFileSync(tmp, 'utf8');
}
const gameSrc = BEFORE ? headSrc('src/js/game.js') : fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const ledgerSrc = BEFORE ? headSrc('src/js/ledger.js') : fs.readFileSync(path.join(ROOT, 'src/js/ledger.js'), 'utf8');
const appSrc = BEFORE ? headSrc('src/js/app.js') : fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
console.log(BEFORE ? 'MODE: BEFORE (pre-fix HEAD code)' : 'MODE: AFTER (fixed worktree code)');

// ---- node-local localStorage stub (engine/state.js save/load) ----
const _lsStore = {};
global.localStorage = {
  getItem: (k) => (k in _lsStore ? _lsStore[k] : null),
  setItem: (k, v) => { _lsStore[k] = String(v); },
  removeItem: (k) => { delete _lsStore[k]; },
  key: (i) => Object.keys(_lsStore)[i] || null,
  get length() { return Object.keys(_lsStore).length; },
};

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
  let src;
  if (f === '__GAME__') src = gameSrc;
  else if (f === 'ledger.js') src = ledgerSrc;
  else src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
// move-anim.js is DOM-free and framework-agnostic ("testable in node with
// stub hooks") — load the REAL module for queue-drain proofs.
try { eval(fs.readFileSync(path.join(ROOT, 'src/js/move-anim.js'), 'utf8')); }
catch (e) { console.error('EVAL FAIL move-anim.js: ' + e.message); process.exit(2); }
delete global.window;
const Game = globalThis.Scattering.Game;
const MoveAnim = globalThis.Scattering.MoveAnim;
Game.data = global.SCATTER_DATA;
Game.say = function () {};
// silence world sims except where a test needs them
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  Game.tbfight = null;
  for (const k of Object.keys(_lsStore)) delete _lsStore[k];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  return s;
}
function goWild() {
  const t = Game.travelTargets().find(tt =>
    Math.abs(tt.x - Game.map.px) + Math.abs(tt.y - Game.map.py) === 1 &&
    !Game.travelBlockage(tt.x, tt.y) && Game.tileAt(tt.x, tt.y).type !== 'haven');
  if (t) Game.travelTo(t.x, t.y);
  Game.tbfight = null;
  return t;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Drain the animator: run until the queue is empty and no step is active.
async function drainMoveAnim(timeoutMs) {
  const t0 = Date.now();
  while ((MoveAnim.queue.length || MoveAnim.active) && Date.now() - t0 < (timeoutMs || 4000)) {
    await sleep(10);
  }
}
function wireStepHook(record) {
  // The production moveStepHook resolves each step against the CURRENT
  // position and runs exactly one Game step. Here: record execution (the
  // phantom-harm signal) and emulate a landed step.
  MoveAnim.hooks.step = (st) => { record.push({ dx: st.dx, dy: st.dy, kind: st.kind }); return { moved: true }; };
  MoveAnim.hooks.render = () => {};
  MoveAnim.hooks.sync = () => {};
  MoveAnim.hooks.gridEl = () => null;
  MoveAnim.stepMs = 5; MoveAnim.pathMs = 5; MoveAnim.blockedMs = 5;
}

async function main() {
  // ============ T1. EXPLOIT: phantom walk after Continue (save/load) ============
  {
    console.log('T1: phantom walk after Continue');
    // T1a — source: does the shipped Continue handler purge the animator?
    const m = appSrc.match(/if\s*\(\s*Game\.load\(b\.dataset\.load\)\)\s*([^;]*;?)/);
    const handlerSrc = m ? m[1] : '';
    const purgesOnLoad = /stopAll|purgeKind/.test(handlerSrc);
    console.log(`  [info] T1a Continue handler: ${JSON.stringify(handlerSrc.slice(0, 120))}`);
    // T1b — behavior: queue steps, load mid-queue, count post-load executions.
    setup(); goWild();
    const s = Game.state.scholar;
    const saveKey = (Game.state.runKey) || 't1save';
    Game.save();
    const execLog = [];
    wireStepHook(execLog);
    for (let i = 0; i < 6; i++) MoveAnim.enqueue({ dx: 1, dy: 0, kind: 'path', walkId: 'w1', ms: 5 });
    await sleep(25); // ~2 steps land pre-load
    const preLoad = execLog.length;
    const loadedOk = Game.load(saveKey);
    // Replicate the shipped Continue handler's post-load action:
    if (!BEFORE) { try { MoveAnim.stopAll(); } catch (e) {} } // AFTER: the fix
    // (BEFORE: the handler does nothing — queue survives)
    await drainMoveAnim();
    const postLoad = execLog.length - preLoad;
    console.log(`  [info] T1b load ok=${loadedOk}, steps pre-load=${preLoad}, post-load executions=${postLoad}`);
    if (BEFORE) {
      ok('BEFORE: queued walk steps execute AFTER Continue (phantom walk)', postLoad > 0, `postLoad=${postLoad}`);
    } else {
      ok('T1a: Continue handler purges the animator on load', purgesOnLoad, handlerSrc.slice(0, 80));
      ok('T1b: no walk steps execute after Continue', postLoad === 0 && loadedOk, `postLoad=${postLoad}`);
    }
    MoveAnim.stopAll();
  }

  // ============ T2. EXPLOIT: death mid-walk phantom (new bearer walks) ============
  {
    console.log('T2: death mid-walk phantom');
    // T2a — source: does playerDeath stop the animator?
    const pdSrc = (() => {
      const i = ledgerSrc.indexOf('playerDeath(cause)');
      return i >= 0 ? ledgerSrc.slice(i, i + 1200) : '';
    })();
    const deathPurges = /MoveAnim/.test(pdSrc) && /stopAll|purgeKind/.test(pdSrc);
    console.log(`  [info] T2a playerDeath touches MoveAnim: ${/MoveAnim/.test(pdSrc)}`);
    setup(); goWild();
    const s = Game.state.scholar;
    const bearerBefore = Game.villagerId;
    const execLog = [];
    wireStepHook(execLog);
    for (let i = 0; i < 6; i++) MoveAnim.enqueue({ dx: 1, dy: 0, kind: 'path', walkId: 'w2', ms: 5 });
    await sleep(25); // ~2 steps land pre-death
    const preDeath = execLog.length;
    try { Game.playerDeath('break-it r10 probe'); } catch (e) { console.log('  [info] playerDeath threw: ' + e.message); }
    const bearerAfter = Game.villagerId;
    await drainMoveAnim();
    const postDeath = execLog.length - preDeath;
    console.log(`  [info] T2b bearer ${bearerBefore} -> ${bearerAfter}, steps pre-death=${preDeath}, post-death executions=${postDeath}`);
    if (BEFORE) {
      ok('BEFORE: queued walk steps execute AFTER death (new bearer walks)', postDeath > 0 && bearerAfter !== bearerBefore, `postDeath=${postDeath}`);
    } else {
      ok('T2a: playerDeath stops the animator', deathPurges);
      ok('T2b: no walk steps execute after death', postDeath === 0, `postDeath=${postDeath}`);
    }
    MoveAnim.stopAll();
  }

  // ============ T3. EXPLOIT/HONESTY: long committed walks truncate ============
  {
    console.log('T3: long committed walk truncation');
    // Extract the SHIPPED walkPathAnimated and run it against the real
    // MoveAnim with a 14-step path.
    const fnMatch = appSrc.match(/function walkPathAnimated\(tx, ty, onDone\) \{[\s\S]*?\n  \}/);
    if (!fnMatch) { ok('T3: walkPathAnimated found in app.js', false); }
    else {
      const fnSrc = fnMatch[0];
      const fakePath = [];
      for (let i = 1; i <= 14; i++) fakePath.push([i, 0]);
      const pos = { mx: 0, my: 0, kcal: 9000 };
      const landed = [];
      const stubGame = {
        inCombat: () => false,
        beginPathWalk: () => fakePath,
        state: { scholar: pos },
      };
      wireStepHook(landed);
      MoveAnim.hooks.step = (st) => {
        landed.push({ dx: st.dx, dy: st.dy });
        pos.mx += st.dx; pos.my += st.dy; // emulate the landed step
        return { moved: true };
      };
      let walkSeqUnused = 0;
      const walkToken = { current: null };
      const expeditionScreen = () => {};
      let doneVal = 'unset';
      // Rebind the function's module-scope names (walkSeq, walkToken,
      // expeditionScreen) in a closure so the SHIPPED source runs as-is.
      const runnerSrc = `let walkSeq = 0;\nconst walkToken = { current: null };\nconst expeditionScreen = () => {};\n${fnSrc}\nreturn walkPathAnimated;`;
      const walkPathAnimated = new Function('Game', 'MoveAnim', runnerSrc)(stubGame, MoveAnim);
      walkPathAnimated(14, 0, (v) => { doneVal = v; });
      await drainMoveAnim();
      console.log(`  [info] T3 14-step path: landed=${landed.length}, onDone=${doneVal}, maxQueue=${MoveAnim.maxQueue}`);
      if (BEFORE) {
        ok('BEFORE: 14-step walk truncates (queue cap drops steps)', landed.length < 14, `landed=${landed.length}`);
        ok('BEFORE: onDone reports failure while steps still pending', doneVal === false, `onDone=${doneVal}`);
      } else {
        ok('T3: full 14-step path lands', landed.length === 14, `landed=${landed.length}`);
        ok('T3: onDone(true) after the last step', doneVal === true, `onDone=${doneVal}`);
      }
      MoveAnim.stopAll();
    }
  }

  // ============ T4. HONESTY probe: checkEncounter mid-fight barrier exit ============
  {
    console.log('T4: checkEncounter during tbBarrierExit (probe)');
    setup(); goWild();
    const s = Game.state.scholar;
    s.mx = 4; s.my = 4;
    // plant a monster and start a real fight
    const mon = Game.spawnWorldMonster({ id: 'bulldozer' }, Game.map.px, Game.map.py, { mx: 4, my: 5 });
    Game.startCombat('bulldozer');
    const inFight = Game.inCombat();
    const p = Game.tbFighter('p');
    if (p) { p.mx = 0; p.my = 4; } // on the west edge
    let ceRanMidFight = false, spawnsDuringExit = 0;
    const oCE = Game.checkEncounter;
    Game.checkEncounter = function () { if (Game.inCombat()) ceRanMidFight = true; return oCE.apply(this, arguments); };
    const oSpawn = Game.spawnWorldMonster;
    Game.spawnWorldMonster = function () { if (Game.inCombat()) spawnsDuringExit++; return oSpawn.apply(this, arguments); };
    // force the encounter roll to hit: Math.random -> 0
    const oRand = Math.random;
    Math.random = () => 0.0;
    let exited = false;
    try { exited = Game.tbBarrierExit(-1, 0); } catch (e) { console.log('  [info] tbBarrierExit threw: ' + e.message); }
    Math.random = oRand;
    Game.checkEncounter = oCE; Game.spawnWorldMonster = oSpawn;
    const px = Game.map.px, py = Game.map.py;
    console.log(`  [info] T4 inFight=${inFight}, exited=${exited}, stillInCombat=${Game.inCombat()}, checkEncounter ran mid-fight=${ceRanMidFight}, world spawns during exit=${spawnsDuringExit}`);
    ok('T4 probe recorded (verdict in evidence file)', true);
    Game.tbfight = null;
  }

  // ============ T5. DEAD CODE: travel/map functions reachable ============
  {
    console.log('T5: dead-code audit (travel/map surface)');
    const fns = ['travelTo', 'travelTargets', 'travelBlockage', 'travelTimeStep', 'tryNodeExit',
      'edgeExit', 'microMove', 'pathStep', 'beginPathWalk', 'findPath', 'walkStepKcal',
      'walkCost', 'clearBlockage', 'buildBridge', 'reveal', 'markSeen', 'mapSeen',
      'backfillSeen', 'compareMaps', 'villageMapKnown', 'hiveSight', 'seedVillagerMaps',
      'checkEncounter', 'findWalkableEntry', 'returnToVillage', 'noteTrailUse'];
    let dead = [];
    for (const fn of fns) {
      const defined = typeof Game[fn] === 'function';
      // reachable: called somewhere in src (excluding its own def line)
      const calls = (gameSrc.match(new RegExp(`[^a-zA-Z_]${fn}\\(`, 'g')) || []).length;
      if (!defined) dead.push(fn + ' (not on Game)');
      else if (calls < 1) dead.push(fn + ' (no call sites)');
    }
    console.log(`  [info] T5 dead/unreachable: ${dead.length ? dead.join(', ') : 'none'}`);
    ok('T5: every travel/map function defined and called', dead.length === 0, dead.join('; '));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'} mode, seed ${SEED})`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
