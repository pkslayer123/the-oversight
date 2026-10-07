// test-audio-wiring-fixes-20261007.js — proof for the three audio wiring fixes
// (Steve 2026-10-05): Drama.audioFor dead call, hummice aggroAudio fallback,
// antlerThrash double-run.
//
// Part A (static): every `D.<method>(` call site in game.js must resolve to a
//   real method on the Drama object in drama.js — no silent dead calls.
// Part B (static): hummice must declare encounter.aggroAudio pointing at a
//   voice that EXISTS in the Game.audio registry (not the deerAggro
//   fallback); no monster may carry a top-level-only *Audio declare the
//   wiring never reads.
// Part C (behavioral): node harness runs the REAL tbMonsterTurn for a
//   gallowdeer through the REAL preTurnHooks dispatch and counts REAL
//   tbAntlerThrash invocations — exactly 1 per turn when not firing, 0
//   while the beam fires.
//
// Harness rules (AGENTS.md): eval the full src/js list in index.html order
// minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js; stub window
// for the eval phase, then `delete global.window` before playing so combat
// takes the sync path. Deterministic: no RNG on the exercised path.
// Exit 0 = all green, 1 = any failure.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok ' + m);

// ---------------------------------------------------------------- Part A ---
(function partA() {
  console.log('== Part A: Drama call sites resolve ==');
  const game = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const drama = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');

  // methods defined on the Drama object literal
  const objStart = drama.indexOf('const Drama = {');
  const objEnd = drama.indexOf('S.Drama = Drama;');
  const body = drama.slice(objStart, objEnd);
  const defined = new Set();
  for (const m of body.matchAll(/^    ([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) defined.add(m[1]);

  // every D.<name>( call in game.js (the drama dispatcher uses D.*)
  const called = new Set();
  for (const m of game.matchAll(/(?<![A-Za-z0-9_.])D\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) called.add(m[1]);

  if (!called.has('audioFor')) fail('game.js no longer calls D.audioFor (sync path removed?)');
  for (const name of [...called].sort()) {
    if (!defined.has(name)) fail(`D.${name}() called in game.js but NOT defined on Drama (dead call)`);
  }
  if (!defined.has('audioFor')) fail('Drama.audioFor missing in drama.js');
  else ok('D.audioFor exists on Drama; all ' + called.size + ' D.* call sites resolve');

  // audioFor must actually map (not throw, not always-null)
  const mateSrc = drama.match(/const DRAMA_AUDIO_MATES = \{([\s\S]*?)\};/);
  if (!mateSrc) fail('DRAMA_AUDIO_MATES table missing in drama.js');
  else {
    const voiced = [...mateSrc[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*'([A-Za-z_][A-Za-z0-9_]*)'/gm)];
    if (!voiced.length) fail('DRAMA_AUDIO_MATES has no voiced kinds');
    else ok('DRAMA_AUDIO_MATES voices ' + voiced.length + ' kinds: ' + voiced.map(v => v[1] + '->' + v[2]).join(', '));
  }
})();

// ---------------------------------------------------------------- Part B ---
(function partB() {
  console.log('== Part B: hummice aggroAudio declared + wired ==');
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const start = app.indexOf('const CombatAudio = (() => {');
  const retIdx = app.indexOf('return {', start);
  const block = app.slice(retIdx, app.indexOf('\n    };', retIdx));
  const defined = new Set([...block.matchAll(/^      ([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)].map(m => m[1]));

  const hum = mons.find(m => m.id === 'hummice');
  if (!hum) { fail('hummice missing from monsters.json'); return; }
  const aa = (hum.encounter || {}).aggroAudio;
  if (!aa) fail('hummice.encounter.aggroAudio NOT declared — still falls back to deerAggro');
  else if (!defined.has(aa)) fail(`hummice aggroAudio '${aa}' not in Game.audio registry`);
  else ok(`hummice aggroAudio '${aa}' declared in encounter + defined in registry (own voice, no deer fallback)`);
  if (hum.aggroAudio && !(hum.encounter || {}).aggroAudio)
    fail('hummice has top-level-only aggroAudio that the wiring never reads');

  // no monster may carry a top-level-only *Audio key the engine ignores
  // (engine reads (mdef.encounter || {}).<key> everywhere)
  for (const m of mons) {
    for (const k of Object.keys(m)) {
      if (/udio/i.test(k) && k !== 'encounter' && typeof m[k] === 'string') {
        if (!(m.encounter || {})[k]) fail(`${m.id}: top-level '${k}' never read (wiring reads encounter.${k})`);
      }
    }
  }
  ok('no top-level-only *Audio declares remain anywhere in monsters.json');
})();

// ---------------------------------------------------------------- Part C ---
// Behavioral: run the REAL tbMonsterTurn for a gallowdeer through the REAL
// preTurnHooks dispatch and count REAL tbAntlerThrash invocations.
(function partC() {
  console.log('== Part C: antlerThrash fires exactly once per turn ==');

  // full src/js list in index.html order, minus DOM-only modules
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const skip = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js']);
  const files = [...html.matchAll(/src\/js\/([a-zA-Z0-9_-]+\.js)/g)]
    .map(m => m[1]).filter((f, i, a) => a.indexOf(f) === i && !skip.has(f));

  // stub window for the eval phase (equipment.js needs it at load); drama.js's
  // CSS injector needs a minimal document stub at load too
  global.window = global;
  global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} },
    body: { appendChild() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const sandbox = vm.createContext(global);
  try {
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
      vm.runInContext(src, sandbox, { filename: f });
    }
  } catch (e) {
    fail('harness eval failed: ' + (e && e.message));
    return;
  } finally {
    delete global.window; // sync combat path for play
    delete global.document;
  }

  const S = global.Scattering;
  const Game = S && S.Game;
  if (!Game || typeof Game.tbMonsterTurn !== 'function') { fail('Game.tbMonsterTurn not available'); return; }
  if (typeof Game.mbRunPreTurn !== 'function') { fail('Game.mbRunPreTurn not available (hook dispatch missing)'); return; }
  ok('harness loaded ' + files.length + ' modules; tbMonsterTurn + mbRunPreTurn live');

  // static double-fire guard: the inline branch must be gone, the hook alive
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  if (/if\s*\(isDeer\s*&&\s*m\.beamPhase\s*!==\s*'firing'\)\s*\{\s*\n\s*this\.tbAntlerThrash\(m\)/.test(gameSrc))
    fail('inline antlerThrash branch still present in tbMonsterTurn (double-fire source)');
  else ok('inline antlerThrash branch absent from tbMonsterTurn');
  const hooks = global.MonsterBehaviorHooks || {};
  if (typeof hooks.antlerThrash !== 'function') fail('antlerThrash hook missing from monsterBehaviors registry');
  else ok('antlerThrash hook registered (single-fire path)');

  // minimal stubs for the turn's early path; turtle branch = clean exit
  Game.say = () => {};
  Game.tbEndCheck = () => false;
  Game.seTickFighter = () => false;
  Game.seFizzle = () => false;
  Game.encUsesFifo = () => false;
  Game.tbRefreshTelegraphUI = () => {};
  Game.turtleIs = () => true; // exit trick: bunker branch returns right after the deer branch
  Game.data = { monsterBehaviors: { behaviors: { gallowdeer: { preTurnHooks: ['antlerThrash'] } } } };

  let thrashCalls = 0;
  const realThrash = Game.tbAntlerThrash;
  Game.tbAntlerThrash = function (m) { thrashCalls++; return realThrash.call(this, m); };

  function runTurn(beamPhase) {
    thrashCalls = 0;
    const m = {
      kind: 'monster', key: 'deer1', name: 'Gallowdeer',
      mdef: { id: 'gallowdeer' }, mx: 4, my: 4, alive: true,
      beamPhase, turtleBunker: 1,
    };
    Game.tbfight = { fighters: [m], over: false };
    Game.tbMonsterTurn(m);
    return thrashCalls;
  }

  const n1 = runTurn('aim');
  if (n1 === 1) ok('beamPhase=aim: tbAntlerThrash fired exactly once');
  else fail(`beamPhase=aim: tbAntlerThrash fired ${n1}x (want exactly 1)`);
  const n2 = runTurn('firing');
  if (n2 === 0) ok('beamPhase=firing: tbAntlerThrash correctly silent (hook skips)');
  else fail(`beamPhase=firing: tbAntlerThrash fired ${n2}x (want 0)`);

  Game.tbAntlerThrash = realThrash;
})();

console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS — all three audio wiring fixes verified');
process.exit(failures ? 1 : 0);
