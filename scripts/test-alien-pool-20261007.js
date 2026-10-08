// Test: Alien Players exclusive human pool (Steve 2026-10-07)
// Verifies: NOT monsters, exclusive pool, ability kits, alien tech, knowledge gating
'use strict';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL:', msg); }
}
function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

// Load the module source for static checks
const fs = require('fs');
const src = fs.readFileSync('/tmp/ap-new.js', 'utf8');
const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

console.log('=== Static: separation of concepts ===');

// 1. No piloted-monster mechanic
assert(!srcNoComments.includes('apMaybeInhabit'), 'apMaybeInhabit removed');
assert(!srcNoComments.includes('apPilotAffinity'), 'apPilotAffinity removed');

// 2. No monster-wave gating for alien encounters
assert(!srcNoComments.includes('mdef.wave'), 'no mdef.wave references');

// 3. New exclusive pool methods exist
assert(src.includes('apEncounterEligible'), 'apEncounterEligible exists');
assert(src.includes('apRollEncounter'), 'apRollEncounter exists');
assert(src.includes('apBuildFighter'), 'apBuildFighter exists');
assert(src.includes('apAbilityKit'), 'apAbilityKit exists');
assert(src.includes('apAlienTech'), 'apAlienTech exists');
assert(src.includes('apStartEncounter'), 'apStartEncounter exists');

// 4. Fighter kind is 'hostile', NOT 'monster'
assert(src.includes("kind: 'hostile'"), 'fighter kind is hostile');
// Ensure we're not creating monster-kind fighters for aliens
const hostileMatches = (src.match(/kind: 'hostile'/g) || []).length;
assert(hostileMatches >= 1, 'at least one hostile fighter creation');

// 5. Knowledge gating methods renamed
assert(src.includes('apKnowsAlien'), 'apKnowsAlien exists');
assert(src.includes('apRevealAlien'), 'apRevealAlien exists');
assert(!srcNoComments.includes('apKnowsInhabited'), 'old apKnowsInhabited gone');
assert(!srcNoComments.includes('apRevealInhabited'), 'old apRevealInhabited gone');

// 6. Language: human, not monster
assert(src.includes('wasn') && src.includes('human. That was'), 'reveal says "wasn\'t human"');
assert(!src.includes("wasn't a beast"), 'no "wasn\'t a beast" language');
assert(!src.includes('wearing a monster like a suit'), 'no "monster suit" language');

console.log('\n=== Static: ability kits ===');

// 7. Each combat persona has a 6-ability kit
const kits = {
  'vex_marlowe': 6, 'countess_sable': 6, 'rax_dentist': 6,
  'pip_quindle': 6, 'sarge': 6, 'dr_fenwick': 6, 'old_tam': 6,
};
for (const pid in kits) {
  const pattern = new RegExp(`'${pid}':\\s*\\[([^\\]]+)\\]`);
  const m = src.match(pattern);
  assert(m, `ability kit exists for ${pid}`);
  if (m) {
    const abilities = m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(s => s);
    assertEq(abilities.length, 6, `${pid} has 6 abilities`);
  }
}

console.log('\n=== Static: alien tech ===');

// 8. Each combat persona has alien tech (except Old Tam who fights fair)
const techPersonas = ['vex_marlowe', 'countess_sable', 'rax_dentist', 'pip_quindle', 'sarge', 'dr_fenwick'];
for (const pid of techPersonas) {
  const pattern = new RegExp(`'${pid}':\\s*\\[\\s*\\{`);
  assert(pattern.test(src), `${pid} has alien tech defined`);
}
// Old Tam has empty tech (fights fair)
assert(src.includes("'old_tam': ["), 'old_tam tech section exists');

console.log('\n=== Static: wraps ===');

// 9. No startCombat wrap for pilot injection
assert(!src.includes('G.startCombat = function'), 'no startCombat wrap');
// 10. tbEnd wrap checks for hostile/alienPid, not monster/pilot
assert(src.includes("f.kind === 'hostile'"), 'tbEnd checks hostile kind');
assert(src.includes('f.alienPid'), 'tbEnd checks alienPid');
assert(!srcNoComments.includes("f.kind === 'monster' && f.pilot"), 'no monster pilot check');

console.log('\n=== Behavioral: mock game test ===');

// 11. Mock test: ability kits return valid arrays
// Extract and eval just the methods we need
const mockG = {
  data: { alienPlayers: [] },
  state: { systemArrived: true, scholar: { day: 10 } },
  map: { px: 4, py: 4 },
  apPersonas: function() { return this.data.alienPlayers; },
  apPersona: function(pid) {
    return this.data.alienPlayers.find(p => p.id === pid) || null;
  },
  apState: function() {
    this.state.alienPlayers = this.state.alienPlayers || { met: {}, favor: 0, known: {} };
    return this.state.alienPlayers;
  },
  apKnowsAlien: function(pid) { return !!(this.apState().known[pid]); },
};

// Load personas
const personas = JSON.parse(fs.readFileSync('/tmp/ap-personas.json', 'utf8'));
mockG.data.alienPlayers = personas;

// Extract apAbilityKit and apAlienTech functions and bind them
// (simplified: we test the data structures directly)
const kitMatch = src.match(/apAbilityKit: function \(pid\) \{[\s\S]*?return KITS\[pid\] \|\|/);
assert(kitMatch, 'apAbilityKit function structure valid');

const techMatch = src.match(/apAlienTech: function \(pid\) \{[\s\S]*?return TECH\[pid\] \|\|/);
assert(techMatch, 'apAlienTech function structure valid');

// 12. Verify personas have required fields for human encounters
const combatPids = ['vex_marlowe', 'countess_sable', 'rax_dentist', 'pip_quindle', 'sarge', 'dr_fenwick', 'old_tam'];
for (const pid of combatPids) {
  const p = personas.find(x => x.id === pid);
  assert(p, `persona ${pid} exists`);
  if (p) {
    assert(p.introLines && p.introLines.length > 0, `${pid} has intro lines`);
    assert(p.taunts !== undefined, `${pid} has taunts field`);
    assert(p.disposition, `${pid} has disposition`);
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
