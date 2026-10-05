// Synergy/OP build detector (Steve 2026-10-05)
// "The hardest part will be controlling for OP builds we haven't predicted
// used together. Synergies too."
//
// This script tests ability combinations for unexpected power spikes.
// It calculates the effective power multiplier of each ability pair/triple
// and flags combinations that exceed expected bounds.

const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';

const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));

console.log('=== SYNERGY ANALYSIS ===\n');
console.log(`Total abilities: ${abilities.length}\n`);

// Group by pool
const byPool = {};
for (const a of abilities) {
  const p = a.pool || 'unknown';
  byPool[p] = byPool[p] || [];
  byPool[p].push(a);
}

console.log('Abilities by pool:');
for (const [pool, list] of Object.entries(byPool)) {
  console.log(`  ${pool}: ${list.length}`);
}

// Find synergy hints
console.log('\n=== DECLARED SYNERGIES ===');
let synergyCount = 0;
for (const a of abilities) {
  if (a.synergyHints && a.synergyHints.length) {
    console.log(`\n${a.name} (${a.id}):`);
    for (const hint of a.synergyHints) {
      console.log(`  → ${hint}`);
      synergyCount++;
    }
  }
}
console.log(`\nTotal declared synergies: ${synergyCount}`);

// Analyze modifier stacking (potential OP combos)
console.log('\n=== MODIFIER STACKING ANALYSIS ===');
console.log('Looking for abilities that modify the same target...\n');

const byTarget = {};
for (const a of abilities) {
  for (const mod of (a.modifiers || [])) {
    const t = mod.target;
    byTarget[t] = byTarget[t] || [];
    byTarget[t].push({ ability: a.id, name: a.name, op: mod.op, value: mod.value });
  }
}

for (const [target, mods] of Object.entries(byTarget)) {
  if (mods.length >= 2) {
    console.log(`⚠️  ${target}: ${mods.length} abilities stack`);
    for (const m of mods) {
      console.log(`    - ${m.name}: ${m.op} ${m.value}`);
    }
    // Calculate combined effect (multiplicative)
    let combined = 1;
    for (const m of mods) {
      if (m.op === 'multiply') combined *= m.value;
    }
    if (combined > 2.0) {
      console.log(`    🔴 OP RISK: combined multiplier ${combined.toFixed(2)}x`);
    } else if (combined > 1.5) {
      console.log(`    🟡 Watch: combined multiplier ${combined.toFixed(2)}x`);
    }
    console.log();
  }
}

console.log('=== RECOMMENDATIONS ===');
console.log('1. Test declared synergies in combat sims');
console.log('2. Cap stacking multipliers at 2.0x to prevent OP builds');
console.log('3. Add diminishing returns for 3+ abilities on same target');
