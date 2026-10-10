// Shared node harness for break-it persistence probes (2026-10-10 r1).
// Usage: node scripts/test-persist-harness.js <probe-script>
// Loads: seeded Math.random BEFORE eval, then FULL src/js/*.js in index.html
// order (minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
// Provides: fake localStorage (Map-backed, with optional quota), document stub,
// Game global. The probe script runs with `harness` helpers in scope.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '1234567', 10);

// ---- deterministic RNG installed BEFORE eval (modules capture const R at load) ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
Math.random = rng;

// ---- fake localStorage ----
class FakeStorage {
  constructor() { this.m = new Map(); this.quota = Infinity; this.failWrites = false; }
  getItem(k) { const v = this.m.get(String(k)); return v === undefined ? null : v; }
  setItem(k, v) {
    if (this.failWrites) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    v = String(v);
    const cur = this.m.get(String(k));
    const size = [...this.m.values()].reduce((a, s) => a + s.length, 0) - (cur ? cur.length : 0) + v.length;
    if (size > this.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.m.set(String(k), v);
  }
  removeItem(k) { this.m.delete(String(k)); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
}
const storage = new FakeStorage();

// ---- sandbox ----
const sandbox = {
  console, Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp,
  Error, TypeError, RangeError, SyntaxError, Map, Set, WeakMap, Promise,
  setTimeout, clearTimeout, setInterval, clearInterval,
  process,
  localStorage: storage,
  // window stub for load-time `window` references (deleted before play).
  // Aliased to the sandbox itself so `window.X = ...` writes land where
  // `globalThis.X` reads expect them (game.js IIFE param picks window).
  // NOTE (AGENTS.md): delete before play so combat takes the sync path.
  document: {
    addEventListener() {}, createElement() { return { style: {}, appendChild() {} }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    body: { appendChild() {} }, hidden: false, visibilityState: 'visible',
  },
  navigator: { userAgent: 'node' },
};
sandbox.globalThis = sandbox;
sandbox.global = sandbox;
sandbox.window = sandbox; // load-time alias; deleted before play
vm.createContext(sandbox);

const EXCLUDE = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js', 'drama.js']);
const ORDER = [
  'engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js',
  'perceive.js', 'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js',
  'corruption.js', 'lifeseed.js', 'progression.js', 'ledger.js', 'abilityActions.js',
  'monsterBehaviors.js', 'partyTactics.js', 'statusEffects.js', 'metaProgression.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'havenGrowth.js', 'hierarchy.js', 'comms.js', 'villageAgency.js',
  'debug-scenarios.js', 'build.js',
];
for (const f of ORDER) {
  if (EXCLUDE.has(path.basename(f))) continue;
  const code = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: f });
  } catch (e) {
    console.error(`EVAL FAIL ${f}: ${e.message}`);
    process.exit(2);
  }
}
// drop the window stub so runtime code takes the sync path
delete sandbox.window;

const G = sandbox.Scattering.Game;
if (!G) { console.error('Game not found'); process.exit(2); }
// data files: load JSON data into Game.data like app.js does
const dataDir = path.join(ROOT, 'src/data');
let dataFiles = [];
try { dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')); } catch (e) {}
G.data = G.data || {};
for (const f of dataFiles) {
  const key = f.replace(/\.json$/, '');
  try { G.data[key] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch (e) {
    console.error('DATA FAIL', f, e.message);
  }
}

function freshGame() {
  // mirror debug-scenarios fresh-game: genRoster + newGame
  G.genRoster('Minneapolis, USA');
  const char = G.generatedRoster[0];
  G.newGame('Minneapolis, USA', null, char.id, [], 'Probe Run');
  return char;
}

const harness = { G, S: sandbox.Scattering, storage, sandbox, freshGame, SEED,
  saveSize() {
    let n = 0;
    for (const k of [...storage.m.keys()]) n += storage.m.get(k).length;
    return n;
  },
};

// run the probe file with harness in scope
const probe = process.argv[2];
if (!probe) { console.error('usage: node scripts/test-persist-harness.js <probe>'); process.exit(2); }
const probeCode = fs.readFileSync(path.resolve(probe), 'utf8');
sandbox.__harness = harness;
const wrapped = `(function(){ const harness = __harness; const {G, S, storage, sandbox, freshGame, SEED} = harness;\n${probeCode}\n})()`;
vm.runInContext(wrapped, sandbox, { filename: path.basename(probe) });
