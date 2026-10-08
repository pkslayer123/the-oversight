#!/usr/bin/env node
// Tree examine bug repro (Steve 2026-10-06)
// Uses REAL game data, not mocks.
// Run: node scripts/repro-tree-examine.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

const files = [
  'src/js/engine/state.js',
  'src/js/engine/modifiers.js',
  'src/js/engine/calories.js',
  'src/js/engine/day.js',
  'src/js/engine/forage.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
  'src/js/sprites.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/examine.js',
  'src/js/debug-scenarios.js',
];
files.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

// Run a scenario that has trees
Game.debugScenario('forest_start'); // or whatever scenario has trees

// Find a tree in the detail grid
const detail = Game.genDetail(Game.map.px, Game.map.py);
let treePos = null;
for (let y = 0; y < 9; y++) {
  for (let x = 0; x < 9; x++) {
    if (detail[y] && (detail[y][x] === 'tree' || detail[y][x] === 'bigtree')) {
      treePos = { x, y, cell: detail[y][x] };
      break;
    }
  }
  if (treePos) break;
}

if (!treePos) {
  console.log('No tree found in detail grid');
  process.exit(0);
}

console.log(`Found tree at (${treePos.x},${treePos.y}): ${treePos.cell}`);

// Move player next to tree (if needed)
Game.state.scholar.mx = treePos.x;
Game.state.scholar.my = treePos.y;

// Get cell before examine
const before = Game.genDetail(Game.map.px, Game.map.py)[treePos.y][treePos.x];
console.log(`Before examine: ${before}`);

// Examine the tree
try {
  Game.examineCell(treePos.x, treePos.y);
} catch (e) {
  console.log(`Examine failed: ${e.message}`);
}

// Get cell after examine
const after = Game.genDetail(Game.map.px, Game.map.py)[treePos.y][treePos.x];
console.log(`After examine: ${after}`);

if (before !== after) {
  console.log(`\n🐛 BUG REPRODUCED: cell changed from '${before}' to '${after}'`);
} else {
  console.log(`\n✅ No bug: cell stayed '${before}'`);
}
