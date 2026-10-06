#!/usr/bin/env node
// Monster verification (Steve 2026-10-06)
// Checks every monster against the "Highbeam Deer level" standard.
// Run: node scripts/verify-monsters.js
// Exit 0 = all pass, Exit 1 = failures

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const spritesSrc = fs.readFileSync(path.join(ROOT, 'src/js/sprites.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');

let failures = [];
let passes = 0;

function check(mid, name, condition, msg) {
  if (condition) {
    passes++;
  } else {
    failures.push(`${mid} (${name}): ${msg}`);
  }
}

console.log(`Verifying ${monsters.length} monsters...\n`);

for (const m of monsters) {
  const mid = m.id;
  const name = m.name;
  
  // 1. Sprites exist
  check(mid, name, spritesSrc.includes(`${mid}_calm`), `Missing ${mid}_calm sprite`);
  check(mid, name, spritesSrc.includes(`${mid}_aggro`), `Missing ${mid}_aggro sprite`);
  
  // 2. Telegraph text
  const atk = m.attack || {};
  check(mid, name, !!atk.telegraph, 'No telegraph text');
  
  // 3. Phases (at least 3 for a real fight)
  const enc = m.encounter || {};
  const phases = enc.phases || [];
  check(mid, name, phases.length >= 3, `Only ${phases.length} phases (need 3+)`);
  
  // 4. KnownCue (coaching after learning)
  check(mid, name, !!enc.knownCue, 'No knownCue');
}

// Systemic checks (apply to all monsters)
console.log('Systemic checks...\n');

// SVG wiring in app.js
check('SYSTEM', 'all', appSrc.includes('monsterSpriteHtml'), 'monsterSpriteHtml not in app.js');
check('SYSTEM', 'all', appSrc.includes('MONSTER SVGS'), 'Monster SVG comment not found (wiring may be missing)');

// Telegraph gating defaults to hidden
check('SYSTEM', 'all', appSrc.includes('let known = false'), 'Telegraph gating does not default to hidden');

// Sprite sizing (visible, not tiny)
check('SYSTEM', 'all', cssSrc.includes('2.2em'), 'Creature sprites not sized to 2.2em (may be tiny)');

// Async cadence
check('SYSTEM', 'all', gameSrc.includes('tbAdvanceAsync'), 'Async combat cadence not in game.js');
check('SYSTEM', 'all', gameSrc.includes('actingKey'), 'Acting highlight not in game.js');

console.log(`\n=== RESULTS ===`);
console.log(`Passed: ${passes}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(`\nFailures:`);
  failures.forEach(f => console.log(`  ❌ ${f}`));
  process.exit(1);
} else {
  console.log(`\n✅ All monsters meet the standard`);
  process.exit(0);
}
