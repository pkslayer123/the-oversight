'use strict';
// Headless debug-scenario sweep harness — BATCH B (combat/social drama).
// Usage: node harness.js <scenarioName>   (run under `timeout 60`)
const fs = require('fs');
const path = require('path');

const ROOT = '/home/hatch/workspace/the-scattering';
const OUT = path.join(ROOT, 'hidden_files/debug-sweep-20261005/results');

const scenario = process.argv[2];
if (!scenario) { console.error('usage: node harness.js <scenarioName>'); process.exit(2); }

// ---- 1. fetch stub: read local JSON files ----
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

// ---- localStorage stub (state.js touches it at load/save time) ----
global.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => { m.clear(); },
  };
})();

// ---- 2. eval sources IN ORDER (skip app.js and move-anim.js — DOM-bound) ----
const FILES = [
  'src/js/engine/state.js',
  'src/js/engine/modifiers.js',
  'src/js/engine/calories.js',
  'src/js/engine/day.js',
  'src/js/engine/forage.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
  'src/js/encounters.js',
  'src/js/conversation.js',
  'src/js/journal.js',
  'src/js/party.js',
  'src/js/party-formal.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/storage.js',
  'src/js/perceive.js',
  'src/js/carexplore.js',
  'src/js/justice.js',
  'src/js/food.js',
  'src/js/betrayal.js',
  'src/js/corpses.js',
  'src/js/lifeseed.js',
  'src/js/progression.js',
  'src/js/ledger.js',
  'src/js/villager-agency.js',
  'src/js/codex-people.js',
  'src/js/membership.js',
  'src/js/hierarchy.js',
  'src/js/debug-scenarios.js',
  'src/js/build.js',
];

const loadErrors = [];
for (const f of FILES) {
  try {
    // direct eval — files self-attach to globalThis via IIFE
    eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  } catch (e) {
    loadErrors.push({ file: f, message: e.message, stack: (e.stack || '').split('\n').slice(0, 5) });
  }
}

function safeSnapshot(Game) {
  const s = {};
  const probe = (k, fn) => { try { s[k] = fn(); } catch (e) { s[k] = 'PROBE_ERROR: ' + e.message; } };
  probe('villagerIds', () => (Game.state.village.villagers || []).slice(0, 8));
  probe('villagerCount', () => (Game.state.village.villagers || []).length);
  probe('playerId', () => Game.villagerId);
  probe('playerName', () => { try { return Game.playerName(); } catch (e) { return String(Game.villagerId); } });
  probe('playerHealth', () => (Game.state.scholar || {}).health);
  probe('playerDead', () => !!(Game.state.scholar || {}).dead || ((Game.state.scholar || {}).health <= 0));
  probe('day', () => (Game.state.scholar || {}).day);
  probe('tbfightActive', () => !!Game.tbfight);
  probe('tbfightFighters', () => {
    if (!Game.tbfight || !Game.tbfight.fighters) return null;
    return Game.tbfight.fighters.map(x => ({ kind: x.kind, id: (x.mdef || {}).id || x.vid || x.id, alive: x.alive }));
  });
  probe('debugChatRequest', () => Game.debugChatRequest || null);
  probe('mootCases', () => {
    const cases = Game.state.mootCases || Game.state.cases || Game.state.moot || null;
    if (!cases) return 'none-found(state.mootCases/state.cases/state.moot all empty)';
    const arr = Array.isArray(cases) ? cases : Object.values(cases);
    return arr.map(c => ({ id: c.id, accused: c.accused, playerRole: c.playerRole, knownToPlayer: c.knownToPlayer, status: c.status })).slice(0, 3);
  });
  probe('justiceFlags', () => Object.keys(Game.state).filter(k => /moot|case|crime|trial|vote/i.test(k)));
  probe('exileFlags', () => {
    const sch = Game.state.scholar || {};
    return { exiled: sch.exiled === true, exileHow: sch.exileHow || null, stateExile: Game.state.exile ? 'present' : 'absent' };
  });
  probe('scholarPos', () => {
    const sch = Game.state.scholar || {};
    return { region: (sch.position || {}).region, x: (sch.position || {}).x, y: (sch.position || {}).y, mx: sch.mx, my: sch.my };
  });
  probe('keepsake', () => {
    const inv = (Game.state.scholar || {}).inventory || [];
    return inv.filter(i => i.itemId === 'mothers_ring' || i.sentimental).map(i => ({ itemId: i.itemId, chosen: i.chosen, bond: i.bond }));
  });
  probe('suspectStateFlags', () => Object.keys(Game.state).filter(k => /contest|mantle|death|flashback|convo/i.test(k)));
  return s;
}

(async () => {
  const result = { scenario, ts: new Date().toISOString(), loadErrors };
  const write = () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, scenario + '.json'), JSON.stringify(result, null, 2));
  };

  const Game = global.Scattering && global.Scattering.Game;
  if (!Game) { result.fatal = 'Game did not attach to globalThis.Scattering after eval'; write(); process.exit(1); }

  try {
    await Game.init();
  } catch (e) {
    result.initError = { message: e.message, stack: (e.stack || '').split('\n').slice(0, 5) };
    write(); process.exit(1);
  }

  let ret;
  try {
    ret = Game.debugScenario(scenario);
    result.returnValue = ret;
  } catch (e) {
    result.thrownError = { message: e.message, stack: (e.stack || '').split('\n').slice(0, 5) };
  }

  const log = Game.log || [];
  result.logTail = log.slice(-12);
  result.failLines = log.filter(l => /failed|unknown scenario|error/i.test(String(l)));
  result.snapshot = safeSnapshot(Game);
  result.logLength = log.length;

  write();
  console.log('done', scenario, 'returnValue=' + result.returnValue, 'failLines=' + result.failLines.length);
  process.exit(0);
})().catch(e => {
  console.error('HARNESS FATAL:', e.message);
  process.exit(3);
});
