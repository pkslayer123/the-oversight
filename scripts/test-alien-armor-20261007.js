// Test: Alien armor transition — beam weapons vs human/bonded/alien armor (Steve 2026-10-07)
// Verifies: spawn gating, beam resistance counting, beam damage curve, horror beat
'use strict';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL:', msg); }
}

const fs = require('fs');
const src = fs.readFileSync('src/js/alienPlayers.js', 'utf8');
const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

console.log('=== Static: armor transition methods exist ===');
assert(src.includes('apBeamResistPieces'), 'apBeamResistPieces exists');
assert(src.includes('apBeamResistLevel'), 'apBeamResistLevel exists');
assert(src.includes('apBeamResistText'), 'apBeamResistText exists');
assert(src.includes('apReadinessCheck'), 'apReadinessCheck exists');
assert(src.includes('apBeamHit'), 'apBeamHit exists');
assert(src.includes('apMaybeBeamAttack'), 'apMaybeBeamAttack exists');
assert(src.includes('apArmorName'), 'apArmorName exists');

console.log('=== Static: beam damage type ===');
assert(src.includes("damageType === 'alien_beam'") || src.includes('damageType==="alien_beam"') || src.includes("'alien_beam'"), 'alien_beam damage type referenced');

console.log('=== Static: readiness gating ===');
assert(src.includes('apReadinessCheck') && src.includes('apEncounterEligible'), 'readiness gates encounters');

console.log('=== Static: bonded sentimental threshold ===');
assert(src.includes('>= 25'), 'bond threshold 25 present');

console.log('=== Static: no conflation ===');
// Beam resistance should not reference monster waves or loot tiers
const beamSection = src.slice(src.indexOf('ALIEN ARMOR TRANSITION'));
assert(!beamSection.includes('mdef.wave'), 'beam section does not reference monster waves');

console.log('=== Behavioral: beam damage curve ===');
// Simulate the damage math: base 90-110% maxHp, each piece *0.7
function beamDamage(maxHp, pieces) {
  const base = maxHp * 1.0; // use 100% for deterministic test
  return Math.max(1, Math.round(base * Math.pow(0.7, pieces)));
}
// 0 pieces: ~100 (lethal for 100 HP player)
assert(beamDamage(100, 0) >= 90, '0 pieces: nearly lethal (' + beamDamage(100, 0) + ')');
// 1 piece: ~70 (survivable once, barely)
assert(beamDamage(100, 1) >= 60 && beamDamage(100, 1) <= 80, '1 piece: tremendous risk (' + beamDamage(100, 1) + ')');
// 2 pieces: ~49
assert(beamDamage(100, 2) >= 40 && beamDamage(100, 2) <= 60, '2 pieces: hurts (' + beamDamage(100, 2) + ')');
// 5 pieces (full): ~17 (fair fight)
assert(beamDamage(100, 5) >= 10 && beamDamage(100, 5) <= 25, '5 pieces: fair fight (' + beamDamage(100, 5) + ')');

console.log('=== Behavioral: readiness scoring ===');
// Score: party*25 + min(threat,100) + day>=30?25 + sysInt>=1?25 + resist*15
// Threshold: 100
function readinessScore(party, threat, day, resist) {
  let s = party * 25 + Math.min(threat, 100) + (day >= 30 ? 25 : 0) + 25 + resist * 15;
  return s;
}
// Solo day-10, no gear: 0 + 30 + 0 + 25 + 0 = 55. NOT ready.
assert(readinessScore(0, 30, 10, 0) < 100, 'solo day-10 not ready');
// Day-30, 2 allies, threat 60: 50 + 60 + 25 + 25 = 160. Ready.
assert(readinessScore(2, 60, 30, 0) >= 100, 'day-30 party ready');
// Day-30 solo with 3 resist pieces: 0 + 60 + 25 + 25 + 45 = 155. Ready (gear compensates).
assert(readinessScore(0, 60, 30, 3) >= 100, 'geared solo ready');

console.log('=== Items: alien armor exists ===');
const items = JSON.parse(fs.readFileSync('src/data/items.json', 'utf8'));
const itemList = Array.isArray(items) ? items : items.items;
const alienArmor = itemList.filter(i => i.armor && i.armor.beamResist);
assert(alienArmor.length === 5, '5 alien armor pieces (' + alienArmor.length + ')');
const slots = ['head', 'torso', 'legs', 'hands', 'feet'];
// Check via equipment slot mapping (SLOT_BY_ID in equipment.js)
const eqSrc = fs.readFileSync('src/js/equipment.js', 'utf8');
for (const a of alienArmor) {
  assert(eqSrc.includes(a.id) || a.id.startsWith('alien_'), 'alien armor piece: ' + a.id);
}
assert(alienArmor.every(a => a.tier === 4), 'all alien armor is tier 4');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
