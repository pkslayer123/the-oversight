// ATTACK 2: rumor rotation + self-laundering.
// (a) rotate spreadRumor targets each day-part: +2 words-trust per fresh hearer
//     — measure how much trust per part with N villagers.
// (b) negative rumor about v2 then comfort v2: gain victim trust while rival
//     rep burns.
// (c) trace probability: how often does a negative rumor blow back.
'use strict';
const H = require('./socialite-harness.js');
const { Game, newWorld, trustOf } = H;

function fresh(n) {
  newWorld(n);
  Game.state.village.promises = {};
  Game.dayPart = 0;
  return n;
}

// (a) rotation farm
fresh(6);
const hearer = 'v3';
const t0 = trustOf(hearer);
let started = 0;
['v1', 'v2', 'v4', 'v5', 'v6'].forEach(tid => {
  const g = Game.spreadRumor(tid, 'stingy', hearer);
  if (g) started++;
  // simulate the conversation trust reward path (convo does resolveConsequence trust:2)
  Game.resolveConsequence && Game.resolveConsequence(hearer, { trust: 2, temper: 'cruel', name: 'rumor:spread' });
});
console.log('A: rumors started', started, 'hearer trust', t0, '->', trustOf(hearer), '(expected +2 each, words-cap 40)');

// (b) self-laundering: burn v2, comfort v2
fresh(4);
Game._moodOverride = 'scared';
Game.spreadRumor('v2', 'untrustworthy', 'v3');
// let gossip travel 6 ticks
for (let i = 0; i < 6; i++) { try { Game.spreadGossip(); } catch (e) {} }
console.log('B: v2 rep after rumor travel:', JSON.stringify(Game.repOf('v2')));
console.log('B: v2 trust before comfort:', trustOf('v2'), 'player rep:', JSON.stringify(Game.repOf(Game.villagerId)));
const cr = Game.comfort('v2');
console.log('B: comfort ok?', !!(cr && cr.ok), 'v2 trust after:', trustOf('v2'));

// (c) trace risk over 20 rumors x 6 ticks
fresh(4);
let caught = 0, trials = 0;
for (let r = 0; r < 20; r++) {
  Game.state.scholar.day = 10 + r; // fresh partKey per rumor
  Game.spreadRumor('v2', 'scheming', 'v3');
  for (let i = 0; i < 6; i++) {
    try { Game.spreadGossip(); } catch (e) {}
    trials++;
  }
  const mems = (Game.state.village.memory || {})['v2'] || [];
  if (mems.some(m => m.t === 'rumor_about_them' && /you/.test(m.d || m.note || ''))) caught++;
}
console.log('C: rumors that blew back (traced to player):', caught, '/20 over', trials, 'ticks');
console.log('C: player honest rep now:', Game.repOf(Game.villagerId).honest, 'v2 trust now:', trustOf('v2'));
