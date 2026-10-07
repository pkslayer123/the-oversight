// Inspiration (Bright Idea) ember-timing proof — 2026-10-07.
//
// THE BUG: the bloom→ember transition in game.js tbMonsterTurn set
// `m.biEmber = Math.max(0, 3 - m.biCycles)` and the ember-countdown block in
// the SAME monster turn immediately decremented it — the transition turn
// double-counted. Observed player-visible ember turns: 1, 0, 0. Designed
// (monsters.json codex + REKINDLE comment): 2, 1, 0. Cycle 2's kill window
// never appeared at all.
//
// THE FIX: the transition turn IS the first ember turn — it sets biEmber and
// ends the turn (tbRefreshTelegraphUI + tbEndCheck + return); the countdown
// starts next turn. When biEmber <= 0 (cycle 3+) it settles immediately with
// the 'steadies' line.
//
// Asserts (real tbMonsterTurn, real biIs, Bright Idea cycles 1/2/3):
//   - player-visible ember turns (monster turns ending with beamPhase
//     'ember' after the detonation turn) === [2, 1, 0]
//   - the cycle-1 ember transition turn itself shows the guttering text
//     ('The light gutters down to a dying ember. ...')
//   - cycles 1-2 end with the 'steadies' settle line
//
// Seeded PRNG (mulberry32, fixed default, SEED env override). Exit 0 = PASS,
// exit 1 = FAIL. Full src/js list in index.html order, minus DOM-only modules
// (app.js/sprites.js/tile-scenes.js/move-anim.js); window stubbed for eval,
// then deleted before play (sync combat path).
//
// EMBER_GAME_PATH env override: load src/js/game.js from another path (e.g.
// an extract of a committed state) instead of the repo worktree copy.

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
function ok(msg) { console.log('  ok: ' + msg); }
function fail(msg) { failures++; console.log('  FAIL: ' + msg); }

// seeded PRNG (the proof is deterministic; the loop mandates a seedable harness)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);
console.log('seed: ' + SEED);
console.log('game.js source: ' + (process.env.EMBER_GAME_PATH || '<repo worktree src/js/game.js>'));

// ---------------------------------------------------------------- harness ---
function makeStyle() {
  const s = {};
  s.setProperty = () => {};
  s.removeProperty = () => {};
  return s;
}
function makeEl() {
  return {
    style: makeStyle(), children: [], innerHTML: '',
    classList: { add() {}, remove() {} },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 40, height: 40 }; },
  };
}

function loadEngine() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const skip = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js']);
  const files = [...html.matchAll(/src\/js\/((?:engine\/)?[a-zA-Z0-9_-]+\.js)/g)]
    .map(m => m[1]).filter((f, i, a) => a.indexOf(f) === i && !skip.has(f));
  const engineDir = path.join(ROOT, 'src/js/engine');
  if (fs.existsSync(engineDir)) {
    for (const f of fs.readdirSync(engineDir)) {
      if (f.endsWith('.js') && !files.includes('engine/' + f)) files.push('engine/' + f);
    }
  }
  global.window = global;
  global.document = {
    getElementById: () => null,
    createElement: () => makeEl(),
    head: makeEl(), body: makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => true,
  };
  global.requestAnimationFrame = (fn) => fn();
  global.getComputedStyle = () => ({ position: 'relative' });
  const sandbox = vm.createContext(global);
  try {
    for (const f of files) {
      let src;
      if (f === 'game.js' && process.env.EMBER_GAME_PATH) {
        src = fs.readFileSync(process.env.EMBER_GAME_PATH, 'utf8');
      } else {
        src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
      }
      vm.runInContext(src, sandbox, { filename: f });
    }
  } finally {
    delete global.window; // sync combat path for play
  }
  return files.length;
}

const nFiles = loadEngine();
const S = global.Scattering;
const Game = S && S.Game;
if (!Game || typeof Game.tbMonsterTurn !== 'function') { fail('Game.tbMonsterTurn not available'); process.exit(1); }
ok('harness loaded ' + nFiles + ' modules; real Game.tbMonsterTurn live');

// stub the turn's surroundings; keep the REAL tbMonsterTurn + REAL biIs
Game.ensureMonsterEntry = () => ({ attacksSeen: [], stage: 'encountered' });
Game.seTickFighter = () => false;
Game.seFizzle = () => false;
Game.encUsesFifo = () => true;
Game.encScanThreats = () => {};
Game.mbRunPreTurn = () => false;
Game.encTelegraphKnown = () => true;
Game.isNight = () => true;
Game.tbRefreshTelegraphUI = () => {};
Game.tbEndCheck = () => false;
Game.sayTelegraphOnce = () => {};
for (const k of Object.getOwnPropertyNames(Game)) {
  if (/Is$/.test(k) && k !== 'biIs' && typeof Game[k] === 'function') Game[k] = () => false;
}
const player = { kind: 'player', key: 'p', mx: 5, my: 4, alive: true };
Game.tbFighter = (key) => (key === 'p' ? player : null);

const narrations = [];
Game.say = (s) => narrations.push(String(s));
Game.audioEvent = () => {};

function mkMonster() {
  return {
    kind: 'monster', key: 'bi1', name: 'Inspiration',
    mdef: {
      id: 'bright_idea', encounter: { fifo: true },
      attack: { name: 'Eureka', damage: [22, 34], pattern: { type: 'burst', radius: 2, windup: 2 }, telegraph: 'It brightens.' },
    },
    mx: 2, my: 4, alive: true, beamPhase: 'settle', telegraph: null,
  };
}

// one full detonation cycle; returns player-visible ember turns
// (monster turns ending with phase === 'ember' after the detonation turn)
function runCycle(startCycles) {
  const m = mkMonster();
  Game.tbfight = { fighters: [m, player], over: false };
  Game.tbFighter = (key) => (key === 'p' ? player : m);
  narrations.length = 0;
  // turn 0: settle with foe at d=3 -> SET -> brighten, telegraph armed
  Game.tbMonsterTurn(m);
  if (m.beamPhase !== 'brighten' || !m.telegraph || !m.biDeclared) {
    fail('SETUP: settle did not SET the bright_idea (phase=' + m.beamPhase + ')');
    return null;
  }
  // simulate the detonation: telegraph resolved -> bloom; the next monster
  // turn runs the bloom→ember transition
  m.telegraph = null;
  m.beamPhase = 'bloom';
  m.biCycles = startCycles;
  // run monster turns until the monster returns to settle; count turns ending
  // in ember (the player-visible safe window)
  let emberTurns = 0, guard = 0;
  let transitionTurnNarrations = null, sawGutter = false, sawSteadies = false;
  while (guard++ < 8) {
    narrations.length = 0;
    Game.tbMonsterTurn(m);
    if (guard === 1) transitionTurnNarrations = narrations.slice();
    for (const n of narrations) {
      if (n.includes('dying ember')) sawGutter = true;
      if (n.includes('ember steadies')) sawSteadies = true;
    }
    if (m.beamPhase === 'ember') emberTurns++;
    if (m.beamPhase === 'settle' && sawGutter) break;
    if (m.beamPhase === 'brighten') break; // rekindled (shouldn't happen mid-count)
  }
  return { emberTurns, transitionTurnNarrations, sawSteadies, finalPhase: m.beamPhase };
}

// --------------------------------------------------------------- assertions -
const DESIGN = [2, 1, 0]; // codex: "2 turns, then 1, then 0"
for (let cycle = 0; cycle < 3; cycle++) {
  const r = runCycle(cycle);
  if (!r) continue;
  const want = DESIGN[cycle];
  const label = 'cycle ' + (cycle + 1);
  if (r.emberTurns === want) ok(label + ': player-visible ember turns = ' + r.emberTurns + ' (design: ' + want + ')');
  else fail(label + ': player-visible ember turns = ' + r.emberTurns + ' (design: ' + want + ')');
  const gutterOnTransition = (r.transitionTurnNarrations || []).some(n => n.includes('dying ember'));
  if (gutterOnTransition) ok(label + ': transition turn shows the guttering text');
  else fail(label + ': transition turn missing the guttering text');
  if (cycle < 2) {
    if (r.sawSteadies) ok(label + ': ember-steadies line fired on settle');
    else fail(label + ': ember-steadies line never fired');
  }
  if (r.finalPhase !== 'settle') fail(label + ': final phase = ' + r.finalPhase + ' (want settle)');
}

console.log(failures ? '\nRESULT: FAIL (' + failures + ')' : '\nRESULT: PASS — ember timing 2/1/0 verified');
process.exit(failures ? 1 : 0);
