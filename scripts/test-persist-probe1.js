// PROBE 1: round-trip fidelity — save/load must be lossless for player-facing state.
// Hostile question: does anything silently reset, drop, or duplicate on Continue?
'use strict';
let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); }
  else console.log('ok:', name);
}
freshGame();
// set up distinctive state
const s0 = G.state.scholar;
s0.inventory.push({ itemId: 'test_amulet', name: 'Test Amulet', units: 1, kcalEach: 0, kg: 0.2, spoilDay: 9999 });
s0.kcal = 1750; s0.health = 88; s0.day = 5;
G.state.village.pantryKcal = 12345;
G.state.codex.plants['dandelion'] = { identifiedDay: 3, survivedEating: true, notes: 'peppery' };
G.state.runName = 'Probe Run';
const saveKey = (G.state.runKey) || null;
const r = G.save();
check('save returns true', r === true, r);
// snapshot deep
const before = JSON.parse(JSON.stringify(G.state));
const key = G.state.runKey;
check('runKey pinned', typeof key === 'string' && key.length > 0, key);
// simulate full reload: new Game-state via load()
const ok = G.load(key);
check('load returns truthy', !!ok);
// compare scholar/village/codex/run fields
const a = before, b = G.state;
check('scholar.kcal survives', b.scholar.kcal === 1750, b.scholar.kcal);
check('scholar.health survives', b.scholar.health === 88, b.scholar.health);
check('scholar.day survives', b.scholar.day === 5, b.scholar.day);
check('inventory item survives exactly once',
  b.scholar.inventory.filter(i => i.itemId === 'test_amulet').length === 1,
  b.scholar.inventory.length);
check('no inventory duplication on load',
  JSON.stringify(b.scholar.inventory) === JSON.stringify(a.scholar.inventory));
check('codex plant knowledge survives', !!(b.codex.plants['dandelion'] && b.codex.plants['dandelion'].survivedEating));
check('runName survives', b.runName === 'Probe Run', b.runName);
check('saveSeq advanced', (b.saveSeq || 0) >= 1, b.saveSeq);
check('runKey stable across load', b.runKey === key, b.runKey);
// second save+load: no growth/duplication
G.save();
const inv2 = JSON.parse(JSON.stringify(G.state.scholar.inventory));
G.load(key);
check('second load: inventory identical', JSON.stringify(G.state.scholar.inventory) === JSON.stringify(inv2));
console.log(fails === 0 ? 'PROBE1 ALL GREEN' : `PROBE1 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
