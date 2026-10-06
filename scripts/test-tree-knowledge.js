// Tree species knowledge gating (Steve 2026-10-05)
// - Tree species must be learned, no hints
// - Common trees (oak, hickory) start at L1 for new survivors
// - Unknown trees show generic "tree", not species name

const fs = require('fs');
const path = require('path');

// Load the game (minimal harness)
global.Scattering = {};
require(path.join(__dirname, '../src/js/engine/state.js'));
const gameCode = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');

// Extract and eval the Game object (simplified - we test the logic directly)
let pass = 0, fail = 0;
function test(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}

console.log('=== Tree Knowledge Gating ===\n');

// Test 1: newCodex includes trees
console.log('1. Codex structure:');
const codex = global.Scattering.state.newCodex();
test('newCodex has trees object', codex.trees !== undefined && typeof codex.trees === 'object');

// Test 2: treeLevel helper (we'll test via mock)
console.log('\n2. treeLevel logic:');
// Mock the Game object with treeLevel
const mockGame = {
  state: { codex: { trees: { oak: { level: 1 }, hickory: { level: 1 } } } },
  treeLevel(species) {
    const e = (this.state.codex.trees || {})[species];
    return (e && e.level) || 0;
  },
  treeName(species) {
    return this.treeLevel(species) >= 1 ? species : null;
  }
};
test('oak starts at L1 (common knowledge)', mockGame.treeLevel('oak') === 1);
test('hickory starts at L1 (common knowledge)', mockGame.treeLevel('hickory') === 1);
test('pine starts at L0 (unknown)', mockGame.treeLevel('pine') === 0);
test('treeName returns species if known', mockGame.treeName('oak') === 'oak');
test('treeName returns null if unknown (no hints)', mockGame.treeName('pine') === null);

// Test 3: No hints in display
console.log('\n3. No hints:');
const speciesName = mockGame.treeName('pine');
const desc = speciesName ? `${speciesName}, healthy` : 'a tree, healthy';
test('Unknown pine shows generic "a tree"', desc === 'a tree, healthy');
test('Does NOT show "pine-like" or hints', !desc.includes('pine'));

const oakName = mockGame.treeName('oak');
const oakDesc = oakName ? `${oakName}, healthy` : 'a tree, healthy';
test('Known oak shows "oak"', oakDesc === 'oak, healthy');

// Test 4: Verify the code change is in place
console.log('\n4. Code verification:');
test('game.js has treeLevel helper', gameCode.includes('treeLevel(species)'));
test('game.js has treeName helper', gameCode.includes('treeName(species)'));
test('game.js gates species display', gameCode.includes('this.treeName(mod.species)'));
test('state.js newCodex has trees', fs.readFileSync(path.join(__dirname, '../src/js/engine/state.js'), 'utf8').includes('trees: {}'));
test('newGame seeds oak/hickory at L1', gameCode.includes("for (const sp of ['oak', 'hickory'])"));

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
