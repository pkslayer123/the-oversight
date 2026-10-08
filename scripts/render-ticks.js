#!/usr/bin/env node
// Tick-by-tick grid visualizer (Steve 2026-10-06)
// Captures the 9x9 grid at each tick during scenario execution.
// Usage: node scripts/render-ticks.js [scenario] [num_ticks]
// Output: /tmp/ticks-<scenario>.png (filmstrip of all ticks)
//
// This lets Muse SEE the grid at each tick — movement, combat cadence,
// positioning — without a browser. Lightweight and fast.

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
  'src/js/debug-scenarios.js',
];
files.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed to load ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

function renderGridSVG(tickNum, label) {
  const s = Game.state.scholar;
  const CELL = 24; // Smaller for filmstrip
  const SIZE = 9 * CELL;
  const WIDTH = SIZE + 20;
  const HEIGHT = SIZE + 40;
  
  let svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${WIDTH}" height="${HEIGHT}" fill="#1a1a2e"/>`;
  svg += `<text x="${WIDTH/2}" y="15" text-anchor="middle" fill="#eee" font-size="10" font-family="monospace">Tick ${tickNum}: ${label}</text>`;
  
  const ox = 10, oy = 25;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const px = ox + x * CELL;
      const py = oy + y * CELL;
      let fill = '#2a2a3e';
      let emoji = '';
      
      // Player position
      if (s.x === x && s.y === y) {
        fill = '#3a3a5e';
        emoji = '🧍';
      }
      // Monsters
      const m = (Game.state.monsters || []).find(m => m.x === x && m.y === y);
      if (m) {
        fill = '#5e2a2a';
        emoji = m.emoji || '👹';
      }
      
      svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#444" stroke-width="0.5"/>`;
      if (emoji) {
        svg += `<text x="${px + CELL/2}" y="${py + CELL/2 + 5}" text-anchor="middle" font-size="12">${emoji}</text>`;
      }
    }
  }
  svg += `</svg>`;
  return svg;
}

function main() {
  const scenario = process.argv[2];
  const numTicks = parseInt(process.argv[3] || '10');
  
  if (!scenario) {
    console.error('Usage: node scripts/render-ticks.js [scenario] [num_ticks]');
    process.exit(1);
  }
  
  console.log(`Running scenario: ${scenario}`);
  const ok = Game.debugScenario(scenario);
  if (!ok) {
    console.error('Scenario failed:', scenario);
    process.exit(1);
  }
  
  const ticks = [];
  
  // Tick 0: initial state
  ticks.push({ num: 0, label: 'start', svg: renderGridSVG(0, 'start') });
  
  // Run ticks
  for (let i = 1; i <= numTicks; i++) {
    try {
      // Advance one turn
      if (Game.tbAdvance) {
        Game.tbAdvance();
      } else if (Game.advance) {
        Game.advance();
      } else {
        console.error('No advance function found');
        break;
      }
      
      const label = Game.tbIsPlayerTurn && Game.tbIsPlayerTurn() ? 'player' : 'ai';
      ticks.push({ num: i, label, svg: renderGridSVG(i, label) });
      
      // Stop if combat ended
      if (!Game.state.monsters || Game.state.monsters.length === 0) {
        console.log(`Combat ended at tick ${i}`);
        break;
      }
    } catch (e) {
      console.error(`Tick ${i} failed: ${e.message}`);
      break;
    }
  }
  
  // Output as JSON for Python to composite
  const out = {
    scenario,
    ticks: ticks.map(t => ({ num: t.num, label: t.label, svg: t.svg }))
  };
  
  fs.writeFileSync('/tmp/ticks-output.json', JSON.stringify(out));
  console.log(`✅ Captured ${ticks.length} ticks`);
  console.log(`   Output: /tmp/ticks-output.json`);
}

main();
