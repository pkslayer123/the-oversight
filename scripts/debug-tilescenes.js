#!/usr/bin/env node
// Debug TileScenes with REAL game data (Steve 2026-10-06)
// Run: node scripts/debug-tilescenes.js

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
  'src/js/tile-scenes.js',
  'src/js/debug-scenarios.js',
];
files.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed ${f}: ${e.message}`); }
});

const S = globalThis.Scattering;
const Game = S.Game;
const TS = S.TileScenes;

// Start a new game (this creates the world map)
try {
  Game.newGame({ skipIntro: true });
} catch (e) {
  console.log(`newGame failed: ${e.message}`);
  // Try debug scenario instead
  Game.debugScenario('forest_start');
}

console.log(`Game.map exists: ${!!Game.map}`);
console.log(`Game.map.tiles exists: ${!!(Game.map && Game.map.tiles)}`);
if (Game.map && Game.map.tiles) {
  console.log(`Tiles dimensions: ${Game.map.tiles.length}x${Game.map.tiles[0] ? Game.map.tiles[0].length : 0}`);
}

// Try TileScenes for center tile (should be seen)
const cx = 3, cy = 3;
console.log(`\nTesting TileScenes.svgFor(${cx}, ${cy}, {seen: true})...`);

try {
  const svg = TS.svgFor(cx, cy, { seen: true });
  console.log(`SVG length: ${svg ? svg.length : 'null'}`);
  if (svg && svg.length < 200) {
    console.log(`SVG content: ${svg.substring(0, 200)}`);
  }
  
  // Check safeTile
  const g = S.Game;
  console.log(`\nS.Game exists: ${!!g}`);
  console.log(`S.Game.map exists: ${!!(g && g.map)}`);
  console.log(`S.Game.map.tiles exists: ${!!(g && g.map && g.map.tiles)}`);
  
  if (g && g.map && g.map.tiles && g.map.tiles[cy]) {
    const tile = g.map.tiles[cy][cx];
    console.log(`Tile at (${cx},${cy}): ${tile ? JSON.stringify(Object.keys(tile)) : 'null'}`);
    if (tile) {
      console.log(`  type: ${tile.type}`);
    }
  }
} catch (e) {
  console.log(`ERROR: ${e.message}`);
  console.log(e.stack.split('\n').slice(0, 5).join('\n'));
}
