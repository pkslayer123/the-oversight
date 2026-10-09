// PROOF (break-it socialite r5, 2026-10-09): four hostile-player attacks on the
// trust surface, each measured BEFORE (broken) and asserted AFTER (fixed).
// Run: SEED=<n> node scripts/test-socialite-r5.js  (try several seeds)
// Design-honest thresholds: deeds move trust progressively, words cap at 40,
// hearsay moves opinion per-hearer, one real vulnerability per villager per day.
'use strict';
const H = require('./socialite-harness.js');
const { Game, newWorld, addFood, trustOf } = H;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}

// --- ATTACK 1: bite-spam farm -------------------------------------------
// BEFORE: 10 bites -> recipient 10->100, bystanders 10->50 (flat uncapped
// observe drift double-paid the recipient and farmed every witness).
// AFTER: recipient gets the deed gain only (no double-dip), witness drift
// is progressive. 10 bites ~= 1 day of food -> trust lands <= 55.
newWorld(4);
Game._moodOverride = 'grieving';
addFood(500, 100);
for (let i = 0; i < 10; i++) Game.giveFood('v1', 'bite');
check('bite farm: recipient <= 55', trustOf('v1') <= 55, 'got ' + trustOf('v1'));
check('bite farm: witness <= 55', trustOf('v2') <= 55, 'got ' + trustOf('v2'));
check('bite farm: recipient not maxed', trustOf('v1') < 100, 'got ' + trustOf('v1'));
// a full meal still pays honestly more than a bite
newWorld(4);
Game._moodOverride = 'grieving';
addFood(500, 100);
Game.giveFood('v1', 'bite');
const biteT = trustOf('v1');
newWorld(4);
Game._moodOverride = 'grieving';
addFood(500, 100);
Game.giveFood('v1', 'full');
check('honesty: full meal > bite', trustOf('v1') > biteT, `full=${trustOf('v1')} bite=${biteT}`);

// --- ATTACK 2: rally-spam farm ------------------------------------------
// BEFORE: +6/rally (+3 flat + +3 drift), 4/day -> 10->82 in 3 days.
// AFTER: words cap at 40; opinion still forms (rep dims move).
newWorld(6);
for (let day = 1; day <= 3; day++) {
  Game.state.scholar.day = day;
  for (let part = 0; part < 4; part++) { Game.dayPart = part; Game.rallyVillage(); }
}
check('rally farm: capped at 40', trustOf('v1') <= 40, 'got ' + trustOf('v1'));
check('rally: opinion still forms', (Game.repOf('v1').brave || 0) > 0, JSON.stringify(Game.repOf('v1')));
// per-part gate still works
newWorld(3);
Game.state.scholar.day = 9; Game.dayPart = 0;
const r1 = Game.rallyVillage();
const r2 = Game.rallyVillage();
check('rally: once per part', !!(r1 && r1.ok) && r2 === null, '');

// --- ATTACK 3: comfort share-spam ---------------------------------------
// BEFORE: 20 identical shares -> 40->97 in one day-part, no cooldown.
// AFTER: one real share per villager per day; repeats are just words
// (words-cap: zero gain past 40).
newWorld(4);
Game._moodOverride = 'grieving';
Game.state.village.trust['v1'] = 40;
let ok = 0;
for (let i = 0; i < 20; i++) { const r = Game.comfort('v1', 'share'); if (r && r.ok) ok++; }
check('share spam: 20 shares -> <= 60', trustOf('v1') <= 60, 'got ' + trustOf('v1') + ' (' + ok + ' ok)');
// next day the share is real again
Game.state.scholar.day = 2;
const tBefore = trustOf('v1');
Game.state.village.trust['v1'] = 40;
Game.comfort('v1', 'share');
check('share: real again next day', trustOf('v1') > 44, 'got ' + trustOf('v1'));

// --- ATTACK 4: hearsay rep (the build lying) ----------------------------
// BEFORE: public gift's gossip applied rep to repOf(player) — the player's
// view of themselves — so distant villagers never updated their opinion.
// AFTER: each hearer updates their own view (per-hearer, 0.4 weight).
newWorld(3);
Game.state.village.positions['v1'] = { mx: 4, my: 5 };
Game.state.village.positions['v2'] = { mx: 5, my: 5 };
Game.state.village.positions['v3'] = { mx: 8, my: 8 };
addFood(10, 100);
Game._moodOverride = 'grieving';
Game.giveFood('v1', 'bite');
for (let i = 0; i < 8; i++) { try { Game.spreadGossip(); } catch (e) {} }
check('hearsay: distant villager opinion moves', (Game.repOf('v3').generous || 0) > 0,
  'generous=' + Game.repOf('v3').generous);

// --- HELD: rumor self-laundering stays self-defeating --------------------
// Negative rumors trace to the player ~always; the victim's trust DROPS.
newWorld(4);
Game._moodOverride = 'scared';
Game.spreadRumor('v2', 'untrustworthy', 'v3');
for (let i = 0; i < 6; i++) { try { Game.spreadGossip(); } catch (e) {} }
const v2t = trustOf('v2');
Game.comfort('v2');
check('laundering: victim trust not farmable', trustOf('v2') <= 10, 'v2 trust=' + v2t + '->' + trustOf('v2'));

console.log(`\n${pass} passed, ${fail} failed (SEED=${H.SEED})`);
process.exit(fail ? 1 : 0);
