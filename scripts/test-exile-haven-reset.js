// Exile haven hard reset — full arc playtest + regression test.
// Steve (2026-10-06): "If you are exiled, finding a New Haven is like a hard reset."
// Bug: foundHaven promised 'Hard reset' but kept the player in the same village
// object with their exilers (same roster, trust, gossip, pantry, reputation).
// Fix: foundHaven now does a REAL village fork — old village archived to
// pastVillages, fresh village object (new name, founder-only roster, fresh
// trust/pantry/gossip). Scholar, Codex, and pack cross over untouched.
// Usage: node scripts/test-exile-haven-reset.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

// Deterministic RNG (mulberry32)
(function seed() {
  let a = 0xE411E;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

(async () => {
  await Game.init();

  console.log('== 1. full arc: crime -> exile -> drift -> new haven ==');
  Game.debugScenario('day1');
  const pid = Game.villagerId;
  // simulate a lived-in village: crimes, trust history, gossip, relationships
  const oldVillage = Game.state.village;
  const oldName = oldVillage.name;
  const oldRoster = [...(oldVillage.roster || [])];
  ok('old village has a full roster', oldRoster.length > 5);
  // plant distinguishing state that MUST NOT survive the fork
  oldVillage.trust[pid] = 90; // beloved before the fall
  const npcId = oldRoster.find(id => id !== pid);
  oldVillage.trust[npcId] = 5; // someone hates you
  oldVillage.gossip = oldVillage.gossip || [];
  oldVillage.gossip.push({ action: 'theft_1', dims: { trustworthy: -20 }, text: 'stole from the pantry' });
  const oldPantryUnits = (oldVillage.pantry || []).reduce((a, i) => a + (i.units || 0), 0);
  ok('old pantry is a real stockpile', oldPantryUnits > 50);
  // record a crime, then exile
  try { Game.recordCrime('theft', { kcal: 500 }); } catch (e) {}
  Game.exilePlayer('test');
  const s = Game.state.scholar;
  ok('player is exiled', s.exiled === true);
  // drift a while — the road between
  Game.drift();
  ok('player is drifting', s.drifting === true);
  for (let i = 0; i < 3; i++) { try { Game.driftTick(); } catch (e) {} }
  // snapshot what must cross over
  const scholarRef = Game.state.scholar;
  const codexRef = Game.state.codex;
  const packBefore = JSON.stringify(scholarRef.inventory);
  const codexPlantsBefore = Object.keys(codexRef.plants || {}).length;
  const playerCharBefore = (oldVillage.rosterChars || {})[pid];
  ok('player has a character record', !!playerCharBefore);

  // the founding project (Steve 2026-10-06): founding is a struggle now —
  // solo days, claimed site, hut+, full cache — before the fork happens
  ok('foundHaven refused before the project is done', Game.foundHaven() !== true);
  Game.exileSelfDo('claimsite');
  ok('site claimed', Game.foundingState().siteClaimed === true);
  s.day = s.exileStartDay + 7; // a week surviving solo
  Game.addWood(100);
  Game.exileSelfDo('buildshelter');
  Game.exileSelfDo('buildshelter');
  ok('hut raised (tier 2)', Game.foundingState().shelterTier === 2);
  Game.foundingState().stockpileKcal = 10000; // (caching loop covered in test-exile-haven-struggle.js)
  ok('founding checklist clear', Game.foundingMissing().length === 0);
  // re-snapshot: the project legitimately changed the pack (wood in, timber
  // spent) — the assertion below is that the FORK itself doesn't touch it
  const packBeforeProject = JSON.stringify(scholarRef.inventory);

  console.log('== 2. foundHaven forks the village ==');
  const r = Game.foundHaven();
  ok('foundHaven returns true', r === true);
  const nv = Game.state.village;
  ok('new village object (not the old one)', nv !== oldVillage);
  ok('old village archived in pastVillages', (Game.state.pastVillages || []).includes(oldVillage));
  ok('new village has a different name', nv.name !== oldName);
  ok('new village name is set', typeof nv.name === 'string' && nv.name.length > 0);

  console.log('== 3. village-side state is fresh ==');
  ok('roster is founder-only', JSON.stringify(nv.roster) === JSON.stringify([pid]));
  ok('villagers is founder-only', JSON.stringify(nv.villagers) === JSON.stringify([pid]));
  ok('trust is fresh (no old grudges)', Object.keys(nv.trust || {}).length === 1 && nv.trust[pid] != null);
  ok('old NPC trust did not cross over', !(nv.trust || {})[npcId]);
  ok('gossip is empty', (nv.gossip || []).length === 0);
  ok('truthClaims fresh', (nv.truthClaims || []).length === 0);
  ok('conflicts fresh', (nv.conflicts || []).length === 0);
  ok('groups fresh', (nv.groups || []).length === 0);
  ok('needs/memory/requests fresh', Object.keys(nv.needs || {}).length === 0 && Object.keys(nv.memory || {}).length === 0);
  const newPantryUnits = (nv.pantry || []).reduce((a, i) => a + (i.units || 0), 0);
  ok('pantry is a founder cache, not the old stockpile', newPantryUnits > 0 && newPantryUnits < oldPantryUnits);
  ok('water is fresh', nv.water && typeof nv.water.clean === 'number');
  // betrayal/justice lazily re-init on the new object
  const bs = Game.betrayalState();
  ok('betrayal state fresh (no old plots)', (bs.plots || []).length === 0 && (bs.cases || []).length === 0);
  const js = Game.justiceState();
  ok('justice state fresh (exile cleared, no old crimes)', js.exiled === false && (js.crimes || []).length === 0);

  console.log('== 4. player-side state crosses over ==');
  ok('scholar object untouched (same ref)', Game.state.scholar === scholarRef);
  ok('codex object untouched (knowledge kept)', Game.state.codex === codexRef);
  ok('pack/inventory unchanged', JSON.stringify(Game.state.scholar.inventory) === packBeforeProject);
  ok('codex plants kept', Object.keys(Game.state.codex.plants || {}).length === codexPlantsBefore);
  ok('player character record moved to new village', (nv.rosterChars || {})[pid] === playerCharBefore);
  ok('exile ended', Game.state.scholar.exiled === false);
  ok('foundedHaven set', Game.state.scholar.foundedHaven === true);

  console.log('== 5. old village persists in fiction ==');
  const archived = (Game.state.pastVillages || [])[0];
  ok('archived village keeps its roster', JSON.stringify(archived.roster) === JSON.stringify(oldRoster));
  ok('archived village keeps its name', archived.name === oldName);
  ok('archived village keeps its gossip', (archived.gossip || []).length > 0);

  console.log('== 6. new haven lives: strangers can arrive ==');
  // the strangers system should work on the fresh village
  let strangerOk = true;
  try {
    const n0 = Game.villageNotability();
    ok('notability computes on new village', typeof n0 === 'number');
  } catch (e) { strangerOk = false; ok('notability computes on new village', false); }
  ok('no exception in stranger check', strangerOk);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
