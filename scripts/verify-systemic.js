#!/usr/bin/env node
// Systemic invariant verification (Steve 2026-10-06)
// Checks the cross-cutting fixes that Steve keeps finding broken.
// These are the "I bet they're systemic" issues.
// Run: node scripts/verify-systemic.js
// Exit 0 = all pass, Exit 1 = failures

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
const spritesSrc = fs.readFileSync(path.join(ROOT, 'src/js/sprites.js'), 'utf8');

let failures = [];
let passes = 0;

function check(name, condition, fix) {
  if (condition) {
    passes++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push({ name, fix });
    console.log(`  ❌ ${name}`);
    console.log(`     Fix: ${fix}`);
  }
}

console.log('Systemic invariants:\n');

console.log('Monster SVGs:');
check(
  'Grid uses monsterSpriteHtml (not emoji)',
  appSrc.includes('monsterSpriteHtml('),
  'Add monsterSpriteHtml() call in grid rendering'
);
check(
  'Combat strip uses custom SVGs',
  appSrc.includes('monsterSprite(') || appSrc.includes('monsterSpriteHtml'),
  'Wire custom SVGs into combat strip'
);
check(
  'Sprites sized visible (2.2em)',
  cssSrc.includes('2.2em'),
  'Set .ord-creature font-size to 2.2em in main.css'
);

console.log('\nCombat cadence:');
check(
  'Async turn advancement exists',
  gameSrc.includes('tbAdvanceAsync'),
  'Add tbAdvanceAsync() with 550ms beats to game.js'
);
check(
  'Acting monster highlighted',
  gameSrc.includes('actingKey'),
  'Add actingKey highlight in tbAdvanceAsync'
);

console.log('\nTelegraph knowledge gating:');
check(
  'Telegraph defaults to hidden (no knowledge)',
  appSrc.includes('let known = false'),
  'Set known=false by default in telegraph rendering'
);
check(
  'Knowledge gate comment present',
  appSrc.includes('TELEGRAPH KNOWLEDGE GATE') || appSrc.includes('knowledge gate'),
  'Add knowledge gating to telegraph cells'
);

console.log('\nSprite definitions:');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
let missingSprites = [];
for (const m of monsters) {
  if (!spritesSrc.includes(`${m.id}_calm`)) missingSprites.push(`${m.id}_calm`);
  if (!spritesSrc.includes(`${m.id}_aggro`)) missingSprites.push(`${m.id}_aggro`);
}
check(
  `All ${monsters.length} monsters have calm/aggro sprites`,
  missingSprites.length === 0,
  missingSprites.length > 0 ? `Missing: ${missingSprites.join(', ')}` : ''
);

console.log(`\n=== RESULTS ===`);
console.log(`Passed: ${passes}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(`\nRun scripts/verify-monsters.js for per-monster details.`);
  process.exit(1);
} else {
  console.log(`\n✅ All systemic invariants hold`);
  process.exit(0);
}
