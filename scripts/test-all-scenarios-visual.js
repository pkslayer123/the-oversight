#!/usr/bin/env node
// Test all scenarios with visuals (Steve 2026-10-05)
// Runs every monster scenario, captures SVG, checks for issues.
// Usage: node scripts/test-all-scenarios-visual.js

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

const SCENARIOS = [
  ['headlight', 'gallowdeer', 'Highbeam Deer'],
  ['flashbulb', 'mirrormoth', 'Flashbulb Moth'],
  ['choir', 'belltoad', 'Choir Toad'],
  ['lockpick', 'lockpick_raccoon', 'Lockpick'],
  ['hummice', 'hummice', 'Hummice'],
  ['glasswing', 'glasswing', 'Glasswing Darter'],
  ['sunbasker', 'sunbasker', 'Sunbasker'],
  ['bulldozer', 'bulldozer', 'Bulldozer'],
  ['hushpuppy', 'hushwolf', 'Hushpuppy'],
  ['whitenoise', 'white_noise_heron', 'White Noise Heron'],
  ['nightlight', 'nightlight_catfish', 'Nightlight Catfish'],
  ['speedbump', 'speedbump_turtle', 'Speedbump Turtle'],
  ['ducksinarow', 'ducks_in_a_row', 'Ducks in a Row'],
  ['static', 'voice_mimic_radio', 'Static'],
  ['griefcounselor', 'mirror_stag', 'Grief Counselor'],
  ['reviewdrone', 'review_drone', 'Performance Review'],
  ['influencer', 'camera_swarm', 'Influencer'],
  ['motivationalspeaker', 'hype_horn', 'Motivational Speaker'],
  ['customerservice', 'service_mimic', 'Customer Service'],
  ['termsconditions', 'contract_golem', 'Terms & Conditions'],
  ['inspiration', 'bright_idea', 'Inspiration'],
  ['nostalgia', 'memory_projector', 'Nostalgia'],
];

function renderSVG(scenarioId, monsterName) {
  const s = Game.state.scholar;
  const CELL = 40;
  const SIZE = 9 * CELL;
  
  let svg = `<svg width="390" height="520" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="390" height="520" fill="#1a1a2e"/>`;
  svg += `<text x="195" y="25" text-anchor="middle" fill="#eee" font-size="16" font-family="monospace">${monsterName}</text>`;
  
  const ox = 15, oy = 40;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const px = ox + x * CELL;
      const py = oy + y * CELL;
      let fill = '#2a2a3e';
      let emoji = '';
      
      if (s.mx === x && s.my === y) {
        fill = '#4a4a6e';
        emoji = '🧍';
      }
      if (s.monster && s.monster.mx === x && s.monster.my === y) {
        const mdef = (Game.data.monsters || []).find(m => m.id === s.monster.id) || {};
        fill = '#6e2a2a';
        emoji = mdef.emoji || '👹';
      }
      
      svg += `<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="#444"/>`;
      if (emoji) svg += `<text x="${px+CELL/2}" y="${py+CELL/2+8}" text-anchor="middle" font-size="24">${emoji}</text>`;
    }
  }
  
  const mdef = s.monster ? (Game.data.monsters || []).find(m => m.id === s.monster.id) || {} : {};
  const iy = oy + SIZE + 10;
  svg += `<text x="15" y="${iy+20}" fill="#eee" font-size="13" font-family="monospace">Scenario: ${scenarioId}</text>`;
  if (mdef.name) {
    svg += `<text x="15" y="${iy+40}" fill="#f88" font-size="13" font-family="monospace">${mdef.name} | HP ${mdef.hp[0]}-${mdef.hp[1]} | Armor ${mdef.armor||0}</text>`;
    const res = Object.entries(mdef.resistances || {}).map(([k,v]) => `${k}:${Math.round(v*100)}%`).join(' ');
    if (res) svg += `<text x="15" y="${iy+60}" fill="#aaa" font-size="11" font-family="monospace">Res: ${res}</text>`;
  }
  svg += `</svg>`;
  
  const out = `/tmp/scenario-${scenarioId}.svg`;
  fs.writeFileSync(out, svg);
  return out;
}

(async () => {
  await Game.init();
  
  console.log('\n=== Testing all 23 monster scenarios with visuals ===\n');
  
  const results = [];
  const issues = [];
  
  for (const [scenId, monsterId, name] of SCENARIOS) {
    try {
      const ok = Game.debugScenario(scenId);
      if (!ok) {
        results.push([scenId, 'FAILED: debugScenario returned false']);
        issues.push(`${name}: scenario failed to run`);
        continue;
      }
      
      const s = Game.state.scholar;
      if (!s.monster || s.monster.id !== monsterId) {
        results.push([scenId, `FAILED: wrong monster (got ${s.monster?.id})`]);
        issues.push(`${name}: wrong monster spawned`);
        continue;
      }
      
      // Check for issues
      const mdef = (Game.data.monsters || []).find(m => m.id === monsterId) || {};
      
      // Issue: monster too close to player? (should be 3 tiles away)
      const dist = Math.max(Math.abs(s.monster.mx - s.mx), Math.abs(s.monster.my - s.my));
      if (dist < 2) issues.push(`${name}: monster spawns too close (dist ${dist})`);
      
      // Issue: missing armor/resistances?
      if (mdef.armor === undefined) issues.push(`${name}: missing armor field`);
      if (!mdef.attack?.damageType) issues.push(`${name}: missing attack damageType`);
      
      const svgPath = renderSVG(scenId, name);
      results.push([scenId, `OK (${svgPath})`]);
      console.log(`✅ ${name}`);
      
    } catch (e) {
      results.push([scenId, `ERROR: ${e.message}`]);
      issues.push(`${name}: ${e.message}`);
      console.log(`❌ ${name}: ${e.message}`);
    }
  }
  
  console.log(`\n=== Results: ${results.filter(r => r[1].startsWith('OK')).length}/${results.length} passed ===\n`);
  
  if (issues.length > 0) {
    console.log('ISSUES FOUND:');
    issues.forEach(i => console.log(`  ⚠️  ${i}`));
  } else {
    console.log('No issues found.');
  }
  
  console.log('\nSVGs saved to /tmp/scenario-*.svg');
})();
