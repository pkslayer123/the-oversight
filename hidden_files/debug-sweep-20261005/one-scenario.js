// one-scenario.js <scenarioName>
// Loads the game headlessly, runs one debug scenario, probes the
// contest interruption path, and prints a JSON result to stdout.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HOME + '/workspace/the-scattering';
const name = process.argv[2];

// --- browser-ish stubs (minimal; more added only if a file needs them) ---
globalThis.Scattering = globalThis.Scattering || {};
// build.js does `window.BUILD_VERSION = ...` — alias window to globalThis.
globalThis.window = globalThis;
globalThis.localStorage = {
  _m: {}, getItem(k) { return this._m[k] ?? null; },
  setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; },
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];

const result = {
  scenario: name,
  loadOk: false, loadError: null,
  returned: null, scenarioError: null,
  logTail: [],
  pendingContest: null,
  activeContest: null,
  resolveContestRan: false, resolveContestError: null,
  interruptionFired: false, interruptionPhase: null,
  contestInterruptionExists: false,
  notes: [],
};

async function main() {
  // 1. Load files
  try {
    for (const f of FILES) {
      const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
      (0, eval)(code);
    }
    result.loadOk = true;
  } catch (e) {
    result.loadError = e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n');
    return;
  }

  const Game = globalThis.Scattering.Game;
  if (!Game) { result.loadError = 'Scattering.Game not defined after load'; return; }
  result.contestInterruptionExists = (typeof Game.contestInterruption === 'function');

  // 2. Init
  try { await Game.init(); }
  catch (e) { result.scenarioError = 'Game.init failed: ' + e.message; return; }

  // 3. Run the scenario (sync, guarded by parent process timeout)
  try {
    result.returned = Game.debugScenario(name);
  } catch (e) {
    result.scenarioError = 'debugScenario threw: ' + e.message + '\n' +
      (e.stack || '').split('\n').slice(0, 5).join('\n');
  }

  // 4. Inspect contest state
  try {
    if (Game.state && Game.state.pendingContest) {
      result.pendingContest = JSON.parse(JSON.stringify(Game.state.pendingContest));
    }
    if (Game.state && Game.state.activeContest) {
      result.activeContest = JSON.parse(JSON.stringify(Game.state.activeContest));
    }
  } catch (e) { result.notes.push('state inspect failed: ' + e.message); }

  // 5. If a pending contest was set, force the resolution -> interruption path
  if (result.pendingContest) {
    try {
      Game.resolveContest();
      result.resolveContestRan = true;
      const ac = Game.state && Game.state.activeContest;
      if (ac) {
        result.activeContest = JSON.parse(JSON.stringify(ac));
        result.interruptionFired = true;
        result.interruptionPhase = ac.phase;
      } else {
        result.notes.push('resolveContest ran but set no activeContest (no interruption).');
      }
    } catch (e) {
      result.resolveContestError = e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n');
    }
  } else {
    result.notes.push('no pendingContest after scenario — nothing to resolve.');
  }

  // 6. Log tail (last ~10 lines)
  try {
    const log = (Game.log || []).map(String);
    result.logTail = log.slice(-10);
  } catch (e) { result.notes.push('log tail failed: ' + e.message); }
}

main().then(() => {
  process.stdout.write(JSON.stringify(result, null, 2));
}).catch((e) => {
  result.scenarioError = 'harness crash: ' + e.message;
  process.stdout.write(JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
