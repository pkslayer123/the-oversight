// PROBE 2: SAVE-SCUM / DEATH — die, then reload. The dead run must stay dead.
// Hostile questions:
//  (a) after a village-lost death, does an autosave-shaped save() resurrect it?
//  (b) after mantle-pass death, is the new Bearer <redacted> save/load clean (no dead-scholar ghost)?
//  (c) does load() of a tombstoned key refuse?
'use strict';
let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
  else console.log('ok:', name);
}
freshGame();
G.save();
const key = G.state.runKey;
// --- (a) village-lost: kill all villagers then playerDeath ---
try { G.state.village.villagers = []; } catch (e) {}
// npcIds reads state.village.roster (minus bearer); force village-lost
try {
  G.state.village.roster = [];
  G.playerDeath('probe');
} catch (e) { console.log('playerDeath threw:', e.message); }
check('village-lost sets over', G.over === true);
const afterDeathSave = G.save();
check('save() after game-over does not persist (over guard)', afterDeathSave !== true, afterDeathSave);
const tombKey = 'scattering-save-tombstone-' + key;
check('tombstone written for dead run', storage.getItem(tombKey) !== null);
// stale-tab resurrection attempt: flip over off and force-save
G.over = false;
const res = S.state.save(G.state);
check('save() on tombstoned key refuses with tombstoned', res === 'tombstoned', res);
check('load() of tombstoned key refuses', S.state.load(key) === null);
check('listSaves hides the dead run', !S.state.listSaves({ includeStale: true }).some(i => i.key === key));
// --- (b) mantle-pass: fresh game, keep villagers, kill bearer ---
storage.clear();
freshGame();
G.save();
const key2 = G.state.runKey;
const oldId = G.villagerId;
try { G.playerDeath('probe2'); } catch (e) { console.log('playerDeath2 threw:', e.message); }
check('mantle passes to a new bearer', G.villagerId && G.villagerId !== oldId, G.villagerId);
check('run still saveable after mantle', G.save() === true);
const nk = G.state.runKey;
check('runKey stable across mantle', nk === key2, nk + ' vs ' + key2);
const okLoad = G.load(key2);
check('load after mantle works', !!okLoad);
check('loaded bearer is the new one', G.state.scholar.villagerId === G.villagerId, G.state.scholar.villagerId);
console.log(fails === 0 ? 'PROBE2 ALL GREEN' : `PROBE2 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
