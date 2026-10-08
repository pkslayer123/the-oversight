#!/usr/bin/env node
// World map visual test (Steve 2026-10-06)
// Renders the 7x7 world map as SVG to verify terrain shows.
// Run: node scripts/render-map.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

const files = [
  'src/js/engine/state.js',
  'src/js/game.js',
  'src/js/sprites.js',
  'src/js/tile-scenes.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/debug-scenarios.js',
];

files.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed ${f}:`, e.message); }
});

const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  
  // Start a new game to get map data
  // Use a simple scenario or create minimal state
  Game.debugScenario('day1');
  
  const s = Game.state.scholar;
  console.log('Map center:', Game.map ? `${Game.map.px},${Game.map.py}` : 'no map');
  
  // Simulate renderMap logic for 7x7
  let html = '<svg width="390" height="390" xmlns="http://www.w3.org/2000/svg">';
  html += '<rect width="390" height="390" fill="#0d120d"/>';
  
  const CELL = 390 / 7;
  const TS = (typeof Scattering !== 'undefined' && Scattering.TileScenes) || null;
  
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const px = x * CELL;
      const py = y * CELL;
      
      const tl = Game.tileAt ? Game.tileAt(x, y) : null;
      const seen = Game.mapSeen ? Game.mapSeen(x, y) : null;
      
      // Replicate the app.js logic
      let g = '';
      let bg = '#0d120d';
      
      if (!seen) {
        // My fix: show terrain even when unseen
        try {
          const ttype = tl ? tl.type : 'unknown';
          const colors = {
            forest_floor: '#241c12', grove: '#1b2f1c', meadow: '#28331b',
            thicket: '#18291f', wetland: '#1a2830', creek: '#14303c',
            trail_edge: '#322e1b', ruin: '#27272b', haven: '#20271f'
          };
          const isUnknown = !tl || ttype === 'unknown';
          bg = isUnknown ? '#2a2a26' : (colors[ttype] || '#1c1c18');
          const glyph = isUnknown ? '?' : '·';
          g = glyph;
        } catch (e) {
          g = '·';
        }
      }
      
      html += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${bg}" stroke="#1a2a1a" stroke-width="1"/>`;
      if (g) {
        html += `<text x="${px + CELL/2}" y="${py + CELL/2 + 6}" text-anchor="middle" font-size="16" fill="#8a8a7a">${g}</text>`;
      }
    }
  }
  
  html += '</svg>';
  fs.writeFileSync('/tmp/world-map.svg', html);
  console.log('✅ World map rendered: /tmp/world-map.svg');
})();
