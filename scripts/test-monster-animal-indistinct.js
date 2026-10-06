// Test: Monster vs Animal UI indistinguishability (Steve 2026-10-05)
// "We shouldn't be able to tell monster vs animal for most. But show the
// correct emoji, that's... okay to know from looking I think."
//
// Verifies:
// 1. Grid renders monsters and animals with the SAME CSS class ('creature')
// 2. data-ent does not reveal mon vs ani (uses 'creature:' prefix)
// 3. Animals show their correct species emoji (not paw-prints)
// 4. Monsters show their correct species emoji
// 5. No 'monster' or 'animal' CSS classes in the rendered output

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}

console.log('=== Monster/Animal UI Indistinguishability ===\n');

// 1. Check app.js source for the rendering code
console.log('--- Source code audit ---');
const appCode = fs.readFileSync(path.join(__dirname, '../src/js/app.js'), 'utf8');

// Should NOT have 'monster' or 'animal' CSS classes for creatures
const hasMonsterClass = /cls \+= ' monster'/.test(appCode);
const hasAnimalClass = /cls \+= ' animal'/.test(appCode);
ok(!hasMonsterClass, 'No cls += \' monster\' in app.js');
ok(!hasAnimalClass, 'No cls += \' animal\' in app.js');

// Should have 'creature' class
const hasCreatureClass = /cls \+= ' creature'/.test(appCode);
ok(hasCreatureClass, 'Uses cls += \' creature\' for both');

// data-ent should use 'creature:' prefix, not 'mon:' or 'ani:'
const hasMonEnt = appCode.includes('data-ent="mon:') || appCode.includes('data-ent=\\"mon:');
const hasAniEnt = appCode.includes('data-ent="ani:') || appCode.includes('data-ent=\\"ani:');
const hasCreatureEnt = appCode.includes('data-ent="creature:') || appCode.includes('data-ent=\\"creature:');
ok(!hasMonEnt, 'No data-ent="mon:" in app.js');
ok(!hasAniEnt, 'No data-ent="ani:" in app.js');
ok(hasCreatureEnt, 'Uses data-ent="creature:" prefix');

// ANIMAL_GLYPH proxy (paw-print gating) should be removed. Strip line
// comments first — the removal note in a comment isn't the proxy.
const codeNoComments = appCode.replace(/\/\/[^\n]*/g, '');
const hasAnimalGlyph = /ANIMAL_GLYPH/.test(codeNoComments);
ok(!hasAnimalGlyph, 'ANIMAL_GLYPH proxy removed (no paw-print gating)');

// 2. Check animals.json has emojis for all animals
console.log('\n--- Animal emoji coverage ---');
const animalsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/animals.json'), 'utf8'));
const animals = animalsData.animals || animalsData;
let allHaveEmoji = true;
for (const a of animals) {
  if (!a.emoji) {
    console.log(`  ✗ ${a.id} missing emoji`);
    allHaveEmoji = false;
  }
}
ok(allHaveEmoji, `All ${animals.length} animals have emoji in data`);

// 3. Check monsters.json has emojis
console.log('\n--- Monster emoji coverage ---');
const monstersData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/monsters.json'), 'utf8'));
const monsters = monstersData.monsters || monstersData;
let monstersHaveEmoji = true;
for (const m of monsters) {
  if (!m.emoji) {
    console.log(`  ✗ ${m.id} missing emoji`);
    monstersHaveEmoji = false;
  }
}
ok(monstersHaveEmoji, `All ${monsters.length} monsters have emoji in data`);

// 4. Verify bullfrog (animal) and belltoad (monster) share 🐸 — the indistinguishability is real
console.log('\n--- Shared emoji check ---');
const bullfrog = animals.find(a => a.id === 'bullfrog');
const belltoad = monsters.find(m => m.id === 'belltoad');
ok(bullfrog && belltoad && bullfrog.emoji === belltoad.emoji,
   `Bullfrog (${bullfrog?.emoji}) and Belltoad (${belltoad?.emoji}) share emoji — truly indistinguishable`);

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
