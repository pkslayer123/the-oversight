#!/usr/bin/env node
// Fast game visualizer (Steve 2026-10-05)
// Renders the 9x9 game grid as SVG — instant, no browser needed.
// Usage: node scripts/render-grid.js [scenario]
//
// This gives you VISUALS at the speed of node scripts.

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
  'src/js/debug-scenarios.js',
];
files.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function renderGridSVG() {
  const s = Game.state.scholar;
  const CELL = 40;
  const SIZE = 9 * CELL;
  
  let svg = `<svg width="390" height="500" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="390" height="500" fill="#1a1a2e"/>`;
  svg += `<text x="195" y="25" text-anchor="middle" fill="#eee" font-size="16" font-family="monospace">The Oversight — ${s.day || 1}</text>`;
  
  // Grid
  const ox = 15, oy = 40;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const px = ox + x * CELL;
      const py = oy + y * CELL;
      let fill = '#2a2a3e';
      let emoji = '';
      
      // Player
      if (s.mx === x && s.my === y) {
        fill = '#4a4a6e';
        emoji = '🧍';
      }
      // Monster
      if (s.monster && s.monster.mx === x && s.monster.my === y) {
        const mdef = (Game.data.monsters || []).find(m => m.id === s.monster.id) || {};
        fill = '#6e2a2a';
        emoji = mdef.emoji || '👹';
      }
      
      svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#444" stroke-width="1"/>`;
      if (emoji) {
        svg += `<text x="${px + CELL/2}" y="${py + CELL/2 + 8}" text-anchor="middle" font-size="24">${emoji}</text>`;
      }
    }
  }
  
  // Info panel
  const iy = oy + SIZE + 10;
  const hp = s.hp ?? s.health ?? '?';
  const maxHp = s.maxHp ?? s.maxHealth ?? '?';
  svg += `<text x="15" y="${iy + 20}" fill="#eee" font-size="14" font-family="monospace">HP: ${hp}/${maxHp} | Hunger: ${Math.round(s.hunger || 0)}</text>`;
  
  if (s.monster) {
    const mdef = (Game.data.monsters || []).find(m => m.id === s.monster.id) || {};
    svg += `<text x="15" y="${iy + 45}" fill="#f88" font-size="14" font-family="monospace">⚔️ ${mdef.name || s.monster.id}</text>`;
    svg += `<text x="15" y="${iy + 65}" fill="#aaa" font-size="12" font-family="monospace">HP ${mdef.hp ? mdef.hp[0]+'-'+mdef.hp[1] : '?'} | Armor ${mdef.armor || 0}</text>`;
  }
  
  svg += `</svg>`;
  return svg;
}

(async () => {
  await Game.init();
  
  const scenario = process.argv[2];
  if (scenario) {
    // freshGame() is defined in debug-scenarios.js and sets up Game.state
    // We need to call it via the scenario, which does it internally
    const ok = Game.debugScenario(scenario);
    if (!ok) {
      console.error('Scenario failed or not found:', scenario);
      process.exit(1);
    }
  } else {
    console.error('Usage: node scripts/render-grid.js [scenario]');
    console.log('Available:', Game.debugScenarioList().slice(0, 10).join(', '));
    process.exit(1);
  }
  
  const svg = renderGridSVG();
  const out = '/tmp/oversight-grid.svg';
  fs.writeFileSync(out, svg);
  console.log(`✅ Grid rendered: ${out}`);
  console.log(`   Open in browser or convert to PNG.`);
})();
