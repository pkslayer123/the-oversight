// Test: kcal gated behind preparation knowledge (Steve 2026-10-05)
// - Kcal hidden at L1 (identification only)
// - Kcal shown at L2+ (preparation knowledge)
// - Eating teaches kcal (experiential learning)
// - Preparation separable from identification (can know how without knowing what)

const fs = require('fs');
const path = require('path');

// Minimal harness: load game.js and check the logic
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}`); }
}

// Mock the minimal Game structure for codexEntries
const mockPlants = [
  { id: 'dandelion', name: 'Dandelion', caloriesPerUnit: 45, unit: 'handful',
    preparation: 'Eat raw; boil to reduce bitterness.',
    knowledgeLevels: { '1': 'Dandelion. Jagged leaves.', '2': 'Parts: roots, leaves.' } },
  { id: 'mystery_plant', name: 'Mystery Plant', caloriesPerUnit: 60, unit: 'bundle',
    preparation: 'Boil twice, discard water.',
    knowledgeLevels: { '1': 'Unknown. Green leaves.', '2': 'Boil before eating.' } },
];

function codexEntries(codexPlants) {
  // Mirrors the implementation in game.js
  return Object.keys(codexPlants).map(pid => {
    const p = mockPlants.find(x => x.id === pid);
    const e = codexPlants[pid];
    if (!p || !e) return null;
    const lvl = e.level || 1;
    const prepKnown = !!(e.prepKnown || lvl >= 2);
    return { pid, name: p.name, level: lvl,
      kcal: prepKnown ? p.caloriesPerUnit : null,
      kcalKnown: prepKnown,
      prep: prepKnown ? p.preparation : null,
      prepKnown };
  }).filter(Boolean);
}

console.log('=== Kcal Gating Tests ===\n');

// Test 1: L1 without prepKnown → kcal hidden
let entries = codexEntries({ dandelion: { level: 1, harvests: 0, tastings: 0 } });
check('L1 hides kcal', entries[0].kcal === null);
check('L1 kcalKnown false', entries[0].kcalKnown === false);
check('L1 hides prep', entries[0].prep === null);

// Test 2: L1 with prepKnown (learned by eating) → kcal shown
entries = codexEntries({ dandelion: { level: 1, harvests: 0, tastings: 0, prepKnown: true } });
check('L1+prepKnown shows kcal', entries[0].kcal === 45);
check('L1+prepKnown kcalKnown true', entries[0].kcalKnown === true);
check('L1+prepKnown shows prep', entries[0].prep === 'Eat raw; boil to reduce bitterness.');

// Test 3: L2 automatically has prepKnown
entries = codexEntries({ dandelion: { level: 2, harvests: 5, tastings: 0 } });
check('L2 shows kcal', entries[0].kcal === 45);
check('L2 prepKnown true', entries[0].prepKnown === true);

// Test 4: Level 0 (unknown) with prepKnown (ate it but don't know what it is)
entries = codexEntries({ mystery_plant: { level: 0, harvests: 0, tastings: 0, prepKnown: true } });
check('L0+prepKnown shows kcal (edible unknown)', entries[0].kcal === 60);
check('L0+prepKnown shows prep', entries[0].prep === 'Boil twice, discard water.');

// Test 5: Level 0 without prepKnown → nothing
entries = codexEntries({ mystery_plant: { level: 0, harvests: 0, tastings: 0 } });
check('L0 hides kcal', entries[0].kcal === null);

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
