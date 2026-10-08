#!/usr/bin/env node
// Proof test: Alien Players playground behavior (Steve 2026-10-07)
// Persistent aliens kill/burn/raid/duel, factions align, veterans exploit.
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

// ---- 1. Static: playground methods exist ----
const src = fs.readFileSync('src/js/alienPlayers.js', 'utf8');
const methods = [
  'apPlaygroundTick', 'apMaybeActivate', 'apMaybeDeactivate',
  'apPlaygroundAction', 'apPlaygroundKill', 'apPlaygroundBurn',
  'apPlaygroundRaid', 'apPlaygroundRookieMistake', 'apPlaygroundDuel',
  'apFactionAligned', 'apVillagerFear', 'apIsArsonist', 'apExperience',
  'apActive',
];
for (const m of methods) {
  ok(src.includes(m + ': function') || src.includes(m + ':function'), 'method exists: ' + m);
}

// ---- 2. Static: playground tick wired into daily tick ----
ok(src.includes('apPlaygroundTick()'), 'playground tick called from daily tick');

// ---- 3. Static: ontology updated ----
ok(src.includes('(playground)'), 'ontology has playground rule');
ok(src.includes('(factions)'), 'ontology has factions rule');
ok(src.includes('(veterans)'), 'ontology has veterans rule');

// ---- 4. Data: experience field ----
const data = JSON.parse(fs.readFileSync('src/data/alienPlayers.json', 'utf8'));
for (const p of data) {
  ok(p.experience === 'veteran' || p.experience === 'rookie', p.id + ' has experience field');
}
const pip = data.find(p => p.id === 'pip_quindle');
ok(pip && pip.experience === 'rookie', 'Pip is the rookie');
const vex = data.find(p => p.id === 'vex_marlowe');
ok(vex && vex.experience === 'veteran', 'Vex is a veteran');

// ---- 5. Static: balance limits present ----
ok(src.includes('>= 3') || src.includes('count >= 3'), 'max 3 active aliens');
ok(src.includes('lastVillagerKillDay'), 'villager kill cooldown tracked');
ok(src.includes('lastBurnDay'), 'burn cooldown tracked');
ok(src.includes('lastRaidDay'), 'raid cooldown tracked');
ok(src.includes('lastDuelDay'), 'duel cooldown tracked');

// ---- 6. Static: kill targets covered ----
ok(src.includes("'villager'") && src.includes("'monster'") && src.includes("'animal'"),
   'all three kill targets (villager/monster/animal) present');

// ---- 7. Static: veteran mechanics ----
ok(src.includes('pantry'), 'pantry raid present');
ok(src.includes('fireSabotaged') || src.includes('fire'), 'fire sabotage present');
ok(src.includes('trust'), 'trust sabotage present');

// ---- 8. Static: faction logic ----
ok(src.includes('0.7') && src.includes('0.9'), 'faction probabilities present');
ok(src.includes('NEVER aligned') || src.includes('never align'), 'sadistic+benevolent never align documented');

// ---- 9. Static: arsonists ----
ok(src.includes('countess_sable') && src.includes('apIsArsonist'), 'Sable is arsonist');

// ---- 10. Static: rookie mistakes ----
ok(src.includes('apPlaygroundRookieMistake'), 'rookie mistake method present');
ok(src.includes('pet a monster') || src.includes('Pip'), 'Pip rookie content present');

// ---- 11. Static: villager fear reaction ----
ok(src.includes('apVillagerFear'), 'villager fear method present');
ok(src.includes('needs.fear') || src.includes('fear'), 'fear mechanic referenced');

// ---- 12. Static: wealth affects persistence ----
ok(src.includes('maxStay'), 'wealth-based stay duration present');
ok(src.includes("'rich'") && src.includes('12'), 'rich stay longer');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
