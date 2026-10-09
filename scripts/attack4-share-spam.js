// ATTACK 4: comfort 'share' spam — gated trust>=40, talk:false, progressive.
// Measure: from 40, how far does 20 shares go? Any cooldown/cost?
'use strict';
const H = require('./socialite-harness.js');
const { Game, newWorld, trustOf } = H;

newWorld(4);
Game._moodOverride = 'grieving';
Game.state.village.trust['v1'] = 40;
Game.state.scholar.day = 1;
let ok = 0;
for (let i = 0; i < 20; i++) {
  const r = Game.comfort('v1', 'share');
  if (r && r.ok) ok++;
  else { console.log('comfort stopped at iter', i); break; }
}
console.log('shares ok:', ok, 'v1 trust 40 ->', trustOf('v1'));
console.log('fear now:', Game.npcNeeds('v1').fear);
console.log('day/part now:', Game.state.scholar.day, Game.dayPart);
