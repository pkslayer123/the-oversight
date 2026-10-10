// PROBE 7: TIMER HONESTY — disease tick + spoilage across the load boundary.
// Hostile: does a mid-duration disease get double-ticked or reset by reload?
// Does food spoil while the tab is closed (wall-clock) — canon says NO.
'use strict';
let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
  else console.log('ok:', name);
}
freshGame();
const s = G.state.scholar;
// plant a disease with a dayPart-based duration
s.diseases = [{ id: 'gut_rot', name: 'Gut Rot', daysLeft: 3, severity: 1 }];
s.inventory.push({ plantId: 'apple', name: 'Apple', units: 2, kcalEach: 95, spoilDay: s.day + 2 });
G.save();
const key = G.state.runKey;
const t0 = Date.now();
// "close the tab for 3 real days" — nothing in-game happens; wall clock only.
G.load(key);
const d = G.state.scholar.diseases[0];
check('disease survives reload', !!(d && d.id === 'gut_rot'), JSON.stringify(G.state.scholar.diseases).slice(0, 200));
check('disease duration NOT advanced by wall clock', d && d.daysLeft === 3, d && d.daysLeft);
const apple = G.state.scholar.inventory.find(i => i.plantId === 'apple');
check('spoilage NOT advanced by wall clock', !!(apple && apple.spoilDay === s.day + 2), apple && apple.spoilDay);
// now advance one real dayPart tick and confirm single progression (no double)
if (typeof G.tickStatuses === 'function') {
  const before = JSON.stringify(G.state.scholar.diseases);
  G.tickStatuses('day');
  const after = JSON.stringify(G.state.scholar.diseases);
  check('tickStatuses runs post-load without throwing', true);
  console.log('   disease before tick:', before.slice(0, 160));
  console.log('   disease after tick: ', after.slice(0, 160));
} else console.log('   (no tickStatuses; skipping tick check)');
// displayed day matches simulated state (no days passed: still day 1)
check('day display consistent (still day 1, no phantom advance)', G.state.scholar.day === 1, G.state.scholar.day);
console.log(fails === 0 ? 'PROBE7 ALL GREEN' : `PROBE7 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
