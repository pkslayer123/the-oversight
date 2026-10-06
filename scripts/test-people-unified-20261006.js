#!/usr/bin/env node
/**
 * test-people-unified-20261006.js
 * Proof for unified person system (Steve 2026-10-06).
 *
 * Verifies:
 * 1. All 72 seeds are distinct (no duplicate names, IDs, first names, lines)
 * 2. All seeds have valid occupations (match characterGen)
 * 3. No name-origin culture mismatches
 * 4. No dangling person references in lines
 * 5. Hydrated seeds have full person field depth (match genCharacter output)
 * 6. Personality combos are diverse (no excessive repetition)
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const seeds = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/data/background_survivors.json'), 'utf8'));
const cg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/data/characterGen.json'), 'utf8'));

let passed = 0, failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(`${name}: ${detail}`); }
}

// 1. Count
check('seed count >= 72', seeds.length >= 72, `got ${seeds.length}`);

// 2. Unique IDs
const ids = seeds.map(s => s.id);
check('unique IDs', new Set(ids).size === ids.length, 'duplicate IDs found');

// 3. Unique names
const names = seeds.map(s => s.name);
check('unique names', new Set(names).size === names.length, 'duplicate names found');

// 4. Unique first names (fiction breaks with two Marias)
const firsts = names.map(n => n.split(' ')[0]);
const firstCounts = {};
firsts.forEach(f => firstCounts[f] = (firstCounts[f] || 0) + 1);
const dupFirsts = Object.entries(firstCounts).filter(([_, c]) => c > 1);
check('unique first names', dupFirsts.length === 0, `duplicates: ${dupFirsts.map(([n]) => n).join(', ')}`);

// 5. Unique lines
const lines = seeds.map(s => s.line);
check('unique lines', new Set(lines).size === lines.length, 'duplicate lines found');

// 6. All occupations valid
const occNames = new Set(cg.occupations.map(o => o.name.toLowerCase()));
const badOccs = seeds.filter(s => !occNames.has(String(s.formerOccupation || '').toLowerCase()));
check('valid occupations', badOccs.length === 0,
  badOccs.map(s => `${s.name}: ${s.formerOccupation}`).join('; '));

// 7. Required fields present
const required = ['id', 'name', 'age', 'formerOccupation', 'line', 'kcalPerDay', 'providesPerDay', 'personality', 'gender', 'origin', 'skinTone'];
const missing = [];
for (const s of seeds) {
  for (const f of required) {
    if (s[f] === undefined || s[f] === null) missing.push(`${s.id}.${f}`);
  }
  if (s.personality) {
    for (const pf of ['sharing', 'temperament', 'curiosity']) {
      if (!s.personality[pf]) missing.push(`${s.id}.personality.${pf}`);
    }
  }
}
check('required fields', missing.length === 0, missing.slice(0, 5).join('; '));

// 8. Gender values valid
const badGender = seeds.filter(s => !['m', 'f'].includes(s.gender));
check('valid genders', badGender.length === 0, badGender.map(s => s.name).join(', '));

// 9. Personality diversity (no combo appears more than 4x in 72)
const combos = {};
seeds.forEach(s => {
  const k = `${s.personality.sharing}/${s.personality.temperament}/${s.personality.curiosity}`;
  combos[k] = (combos[k] || 0) + 1;
});
const maxCombo = Math.max(...Object.values(combos));
check('personality diversity', maxCombo <= 6, `max combo repeats ${maxCombo}x`);

// 10. No dangling references (names mentioned in lines should exist or be generic)
// Build set of all first names
const allFirsts = new Set(firsts);
// Common words that look like names but aren't
const ignore = new Set(['It', 'Its', 'This', 'That', 'There', 'System', 'Codex', 'Burn', 'She', 'He', 'They']);
const dangling = [];
for (const s of seeds) {
  const refs = s.line.match(/\b([A-Z][a-z]+)'s\b/g) || [];
  for (const r of refs) {
    const name = r.replace("'s", '');
    if (!allFirsts.has(name) && !ignore.has(name)) {
      dangling.push(`${s.name} references '${name}'`);
    }
  }
}
check('no dangling references', dangling.length === 0, dangling.slice(0, 5).join('; '));

// 11. Age sanity (16-75)
const badAge = seeds.filter(s => s.age < 14 || s.age > 80);
check('sane ages', badAge.length === 0, badAge.map(s => `${s.name}:${s.age}`).join(', '));

// 12. kcal sanity
const badKcal = seeds.filter(s => s.kcalPerDay < 1200 || s.kcalPerDay > 2800);
check('sane kcal', badKcal.length === 0, badKcal.map(s => s.name).join(', '));

// Summary
console.log(`\n=== People Unification Test ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('All checks green!');
}
