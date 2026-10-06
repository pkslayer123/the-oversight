#!/usr/bin/env node
// Scenario verification (Steve 2026-10-06)
// Runs all debug scenarios, reports failures.
// Run: node scripts/verify-scenarios.js
// Exit 0 = all pass, Exit 1 = failures

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Get scenario list by loading the game files
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

const files = [
  'src/js/engine/state.js',
  'src/js/game.js',
  'src/js/sprites.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/debug-scenarios.js',
];

try {
  files.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
} catch (e) {
  console.error('Failed to load game files:', e.message);
  process.exit(1);
}

const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  // debugScenarioList returns [name, description] pairs or objects
  // We need just the names
  const rawList = Game.debugScenarioList();
  const scenarios = rawList.map(item => {
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) return item[0];
    if (item.name) return item.name;
    return String(item).split(',')[0].split(':')[0].trim();
  }).filter(Boolean);
  
  console.log(`Running ${scenarios.length} scenarios...\n`);
  
  let passed = 0;
  let failed = [];
  
  for (const name of scenarios) {
    try {
      const result = execSync(
        `timeout 30 node scripts/render-grid.js ${name}`,
        { cwd: ROOT, stdio: 'pipe' }
      );
      passed++;
      process.stdout.write('.');
    } catch (e) {
      failed.push({ name, error: e.message.substring(0, 200) });
      process.stdout.write('F');
    }
  }
  
  console.log(`\n\n=== RESULTS ===`);
  console.log(`Passed: ${passed}/${scenarios.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log(`\nFailures:`);
    failed.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log(`\n✅ All scenarios pass`);
    process.exit(0);
  }
})();
