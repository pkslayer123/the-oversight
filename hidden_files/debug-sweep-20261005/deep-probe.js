'use strict';
// Deep probe: re-runs one scenario and reports betrayal/justice/exile/mantle state
// with the CORRECT state keys (village.betrayal.cases etc.).
// Usage: node deep-probe.js <scenarioName>   (run under `timeout 60`)
const fs = require('fs');
const path = require('path');

const ROOT = '/home/hatch/workspace/the-scattering';
const OUT = path.join(ROOT, 'hidden_files/debug-sweep-20261005/results');

const scenario = process.argv[2];
if (!scenario) { console.error('usage: node deep-probe.js <scenarioName>'); process.exit(2); }

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});
global.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => { m.clear(); },
  };
})();

const FILES = [
  'src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
  'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
  'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/journal.js',
  'src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js',
  'src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js',
  'src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
  'src/js/progression.js','src/js/ledger.js','src/js/villager-agency.js',
  'src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js',
  'src/js/debug-scenarios.js','src/js/build.js',
];
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { /* recorded in main harness; build.js window ref is benign */ }
}

(async () => {
  const Game = globalThis.Scattering.Game;
  await Game.init();
  const ret = Game.debugScenario(scenario);
  const v = Game.state.village, sch = Game.state.scholar;
  const bs = (v.betrayal || {});
  const j = (() => { try { return Game.justiceState(); } catch (e) { return { err: e.message }; } })();
  const out = {
    scenario, returnValue: ret,
    cases: (bs.cases || []).map(c => ({
      status: c.status, type: c.type, accused: c.accused,
      accuser: c.accuser, charge: c.charge || c.charges,
      playerRole: c.playerRole, knownToPlayer: c.knownToPlayer,
      firesDay: c.firesDay, defenseWindow: c.defenseWindow || c.defenseUntil || null,
    })),
    plots: (bs.plots || []).map(p => ({ status: p.status, target: p.target, leader: p.leader, members: p.members })),
    crimes: (j.crimes || []).map(c => ({ type: c.type, witnessed: c.witnessed, caseId: !!c.caseId, victim: c.victim })),
    justiceStage: j.stage, mootDemanded: j.mootDemanded,
    exiled: sch.exiled === true, exileMeta: sch.exileMeta || null,
    scholarRegion: (sch.position || {}).region,
    inBuilding: sch.inBuilding !== undefined ? sch.inBuilding : 'n/a',
    tbfight: !!Game.tbfight,
    playerDead: !!(sch.dead || sch.health <= 0),
    playerId: Game.villagerId,
    scholarAlive: sch.alive !== false,
    villagePop: (v.villagers || []).length,
    fallen: (v.fallen || []).length,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'deep-' + scenario + '.json'), JSON.stringify(out, null, 2));
  console.log('deep probe done:', scenario);
})().catch(e => { console.error('DEEP PROBE FATAL:', e.message); process.exit(3); });
