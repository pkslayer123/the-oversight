// ATTACK 3: rallyVillage farm — flat +3 to everyone per day-part + observe drift.
'use strict';
const H = require('./socialite-harness.js');
const { Game, newWorld, trustOf } = H;

newWorld(6);
const S = Game.state;
console.log('day 1 start trust:', [1,2,3,4,5,6].map(i=>trustOf('v'+i)).join(','));
for (let day = 1; day <= 3; day++) {
  S.scholar.day = day;
  for (let part = 0; part < 4; part++) {
    Game.dayPart = part;
    Game.rallyVillage();
  }
  console.log('after day', day, 'trust:', [1,2,3,4,5,6].map(i=>trustOf('v'+i)).join(','));
}
// per-call breakdown on a fresh villager
newWorld(6);
S2check: {
  const S2 = Game.state;
  S2.scholar.day = 5; Game.dayPart = 0;
  const before = trustOf('v1');
  Game.rallyVillage();
  console.log('single rally: v1 trust', before, '->', trustOf('v1'), '(flat +3 + observe drift)');
  console.log('v1 rep of player:', JSON.stringify(Game.repOf('v1')));
}
