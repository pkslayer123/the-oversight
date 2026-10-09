// ATTACK 1: bite-spam trust farm via Game.giveFood (socialite verb).
// Hypothesis: give_food observe() has no noTrust, so every gift pays TWICE —
// direct trustGainProgressive + flat uncapped trust drift from observe() to the
// recipient AND every witness, plus rep ripple to group mates.
'use strict';
const H = require('./socialite-harness.js');
const { Game, newWorld, addFood, trustOf } = H;

newWorld(4);
Game._moodOverride = 'grieving'; // mood irrelevant for giveFood, just needs food
addFood(500, 100, 'dried meat'); // 500 units, 1 unit per bite

const t0 = [1, 2, 3, 4].map(i => trustOf('v' + i));
console.log('trust before:', t0.join(','));
console.log('rep before v1:', JSON.stringify(Game.repOf('v1')));

for (let i = 0; i < 10; i++) {
  const r = Game.giveFood('v1', 'bite');
  if (!r) { console.log('giveFood returned null at', i); break; }
}
const t1 = [1, 2, 3, 4].map(i => trustOf('v' + i));
console.log('trust after 10 bites to v1:', t1.join(','));
console.log('per-gift to recipient:', ((t1[0] - t0[0]) / 10).toFixed(2));
console.log('per-gift to bystander v2:', ((t1[1] - t0[1]) / 10).toFixed(2));
console.log('rep after v1 (their view of player):', JSON.stringify(Game.repOf('v1')));
console.log('rep after v2 (bystander):', JSON.stringify(Game.repOf('v2')));
console.log('food units left:', Game.state.scholar.inventory.reduce((s, i) => s + (i.units || 0), 0));
