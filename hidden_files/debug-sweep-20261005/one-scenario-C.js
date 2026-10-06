// one-scenario-C.js <scenarioName>
// BATCH C (system scenarios): headless runner. Loads the game, runs one
// debug scenario, probes scenario-specific premise state, prints JSON to stdout.
// Each run is done in its own child process with a wall-clock guard by the driver.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HOME + '/workspace/the-scattering';
const name = process.argv[2];

globalThis.Scattering = globalThis.Scattering || {};
// build.js assigns window.BUILD_VERSION; modules use (typeof window !== 'undefined' ? window : globalThis)
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
  scenario: name, loadOk: false, loadError: null,
  returned: null, scenarioError: null, failLines: [],
  log: [], premise: {}, notes: [],
};

function snap(fn, dflt) {
  try { const v = fn(); return v === undefined ? (dflt === undefined ? 'undefined' : dflt) : v; }
  catch (e) { return 'PROBE_ERROR: ' + e.message; }
}

async function main() {
  try {
    for (const f of FILES) (0, eval)(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    result.loadOk = true;
  } catch (e) {
    result.loadError = e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n');
    return;
  }
  const Game = globalThis.Scattering.Game;
  if (!Game) { result.loadError = 'Scattering.Game not defined after load'; return; }

  try { await Game.init(); }
  catch (e) { result.scenarioError = 'Game.init failed: ' + e.message; return; }

  try { result.returned = Game.debugScenario(name); }
  catch (e) {
    result.scenarioError = 'debugScenario threw: ' + e.message + '\n' +
      (e.stack || '').split('\n').slice(0, 5).join('\n');
  }

  const log = (Game.log || []).map(String);
  result.log = log;
  result.failLines = log.filter(l => /failed|unknown scenario/i.test(l));

  const S = () => Game.state || {};
  const sch = () => (Game.state && Game.state.scholar) || {};
  const vil = () => (Game.state && Game.state.village) || {};

  // ---- generic premise ----
  result.premise.hasState = !!Game.state;
  result.premise.hasScholar = !!sch().id || !!sch().name || Object.keys(sch()).length > 5;
  result.premise.hasVillage = !!vil().roster;
  result.premise.scholarDay = snap(() => sch().day);
  result.premise.villageDay = snap(() => vil().day);
  result.premise.rosterCount = snap(() => (vil().roster || []).length);
  result.premise.villagersCount = snap(() => (vil().villagers || []).length);
  result.premise.mapExists = snap(() => !!Game.map);
  result.premise.gameOver = snap(() => !!Game.over);
  result.premise.dayPart = snap(() => Game.dayPart);
  result.premise.tbfightActive = snap(() => !!Game.tbfight);

  // ---- scenario-specific premises ----
  const P = result.premise;
  if (name === 'day7') {
    P.dayIs7 = snap(() => sch().day === 7);
    P.day7Armed = snap(() => sch()._day7Armed === true);
    P.systemArrived = snap(() => !!S().systemArrived);
    P.trustEntries = snap(() => Object.keys(vil().trust || {}).length);
    P.knownNames = snap(() => Object.keys(vil().knownNames || {}).length);
    P.pantryKcal = snap(() => vil().pantryKcal);
    P.week1 = snap(() => sch().week1);
    P.journalKeys = snap(() => Object.keys((S().journal || {})).length);
    P.stateKeys = snap(() => Object.keys(S()));
  }
  if (name === 'uprising') {
    P.fighters = snap(() => (Game.tbfight && Game.tbfight.fighters || []).map(x => ({
      key: x.key, kind: x.kind, name: x.name, hp: x.hp, alive: x.alive, uprising: !!x.uprising, villagerId: x.villagerId || null,
    })));
    P.hostileCount = snap(() => (Game.tbfight && Game.tbfight.fighters || []).filter(x => x.kind === 'hostile').length);
    P.uprisingFlagCount = snap(() => (Game.tbfight && Game.tbfight.fighters || []).filter(x => x.uprising).length);
    P.startVillageUprisingExists = snap(() => typeof Game.startVillageUprising === 'function');
    P.playerHp = snap(() => (Game.tbfight && Game.tbfight.fighters.find(x => x.key === 'p') || {}).hp);
  }
  if (name === 'day1') {
    P.dayIs1 = snap(() => sch().day === 1);
    P.pantryKcal = snap(() => vil().pantryKcal);
    P.kcal = snap(() => sch().kcal);
    P.energy = snap(() => sch().energy);
    P.hydration = snap(() => sch().hydration);
    P.health = snap(() => sch().health);
  }
  if (name === 'language') {
    P.bgLangsCount = snap(() => Object.keys(vil().bgLangs || {}).length);
    P.bgLangsSample = snap(() => {
      const e = Object.entries(vil().bgLangs || {})[0];
      return e ? { id: e[0], val: e[1] } : null;
    });
    P.anyEnglish = snap(() => Object.values(vil().bgLangs || {}).some(v =>
      JSON.stringify(v).toLowerCase().includes('english')));
    P.knownNamesCleared = snap(() => Object.keys(vil().knownNames || {}).length === 0);
  }
  if (name === 'liars') {
    P.liarCount = snap(() => {
      const ids = (vil().roster || []).filter(rid => rid !== Game.villagerId);
      return ids.filter(rid => { try { const vp = Game.vpOf(rid); return !!(vp && vp.lies); } catch (e) { return false; } }).length;
    });
    P.liesSample = snap(() => {
      const ids = (vil().roster || []).filter(rid => rid !== Game.villagerId);
      for (const rid of ids) {
        try { const vp = Game.vpOf(rid); if (vp && vp.lies) return { rid, lies: vp.lies }; } catch (e) {}
      }
      return null;
    });
    P.npcLiesExists = snap(() => typeof Game.npcLies === 'function');
  }
  if (name === 'night') {
    P.dayPartIsNight = snap(() => Game.dayPart === 3);
    P.animal = snap(() => sch().animal);
    P.weapon = snap(() => (sch().equipped || {}).weapon);
    P.insideHavenFalse = snap(() => sch().insideHaven === false);
    P.mxMy = snap(() => [sch().mx, sch().my]);
  }
  if (name === 'starving') {
    P.pantryItems = snap(() => (vil().pantry || []).map(i => ({ name: i.name, units: i.units, kcalEach: i.kcalEach })));
    P.pantryKcalTotal = snap(() => (vil().pantry || []).reduce((a, i) => a + (i.kcalEach || 0) * (i.units || 0), 0));
    P.pantryKcalField = snap(() => vil().pantryKcal);
    P.kcal = snap(() => sch().kcal);
    P.energy = snap(() => sch().energy);
    P.hydration = snap(() => sch().hydration);
    P.dayIs4 = snap(() => sch().day === 4);
    P.trustValues = snap(() => Object.values(vil().trust || {}).slice(0, 5));
  }
}

main().then(() => {
  process.stdout.write(JSON.stringify(result));
}).catch((e) => {
  result.scenarioError = 'harness crash: ' + e.message;
  process.stdout.write(JSON.stringify(result));
  process.exitCode = 1;
});
