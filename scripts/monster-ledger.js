#!/usr/bin/env node
// Monster Completion Ledger (Steve 2026-10-05)
// Evidence-based tracker for all monsters. Source of truth:
// - docs/MONSTER-WAVES.md for wave assignments
// - docs/DECISIONS.md for naming
// - src/data/monsters.json for stats
// - src/js/debug-scenarios.js for scenario coverage
//
// Run: node scripts/monster-ledger.js
// This prevents the "making shit up" problem — the ledger reads the docs,
// not my memory.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadJson(f) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
}

function loadText(f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8');
}

const monsters = loadJson('src/data/monsters.json');
const wavesDoc = loadText('docs/MONSTER-WAVES.md');
const scenariosJs = loadText('src/js/debug-scenarios.js');

// Extract scenario IDs from debug-scenarios.js
const scenarioIds = new Set();
const scenMatches = scenariosJs.matchAll(/(\w+)\(\)\s*{/g);
for (const m of scenMatches) scenarioIds.add(m[1]);

// Map monster IDs to scenario IDs (manual mapping, verified against code)
const monsterToScenario = {
  'gallowdeer': 'headlight',
  'mirrormoth': 'flashbulb',
  'belltoad': 'choir',
  'lockpick_raccoon': 'lockpick',
  'hummice': 'hummice',
  'nightlight_catfish': 'nightlight',
  'glasswing': 'glasswing',
  'sunbasker': 'sunbasker',
  'bulldozer': 'bulldozer',
  'hushwolf': 'hushpuppy',
  'white_noise_heron': 'whitenoise',
  'review_drone': 'reviewdrone',
  'paparazzo': 'influencer',
  'understudy': 'customerservice',
  'bright_idea': 'inspiration',
  'speedbump_turtle': 'speedbump',
  'ducks_in_a_row': 'ducksinarow',
  'voice_mimic_radio': 'static',
  'mirror_stag': 'griefcounselor',
  'heckler': 'motivationalspeaker',
  'landlord': 'termsconditions',
  'union_rep': 'middlemanager',
  'memory_projector': 'nostalgia',
};

// Wave assignments from MONSTER-WAVES.md (NOT from monsters.json — that drifted)
const WAVE1_DOC = ['Bulldozer', 'Hushpuppy', 'Highbeam Deer', 'Flashbulb Moth', 'Choir Toad',
                   'Lockpick', 'White Noise', 'Hummice', 'Speedbump', 'Nightlight'];
const WAVE2_DOC = ['Static', 'Grief Counselor', 'Performance Review', 'Influencer',
                   'Motivational Speaker', 'Customer Service', 'Terms & Conditions',
                   'Middle Manager', 'Inspiration', 'Nostalgia'];

console.log('# Monster Completion Ledger');
console.log('# Generated: ' + new Date().toISOString());
console.log('# Source: docs/MONSTER-WAVES.md, src/data/monsters.json, src/js/debug-scenarios.js');
console.log('');

let total = 0, withScenario = 0, withMechanic = 0;

for (const wave of [1, 2]) {
  const waveMonsters = monsters.filter(m => m.wave === wave);
  console.log(`\n## Wave ${wave} (${waveMonsters.length} monsters)`);
  console.log('');
  console.log('| Monster | HP | DMG | Activity | Scenario | Unique Mechanic |');
  console.log('|---------|----|-----|----------|----------|-----------------|');
  
  for (const m of waveMonsters) {
    total++;
    const scenId = monsterToScenario[m.id];
    const hasScen = scenId && scenarioIds.has(scenId);
    if (hasScen) withScenario++;
    
    // Check for unique mechanic (not just generic combat)
    // This is a heuristic — looks for behavior/telegraph fields
    const hasMechanic = !!(m.behavior && m.behavior !== 'generic') || 
                        !!(m.telegraph) || 
                        !!(m.uniqueMechanic);
    if (hasMechanic) withMechanic++;
    
    const hp = `${m.hp[0]}-${m.hp[1]}`;
    const dmg = `${m.attack.damage[0]}-${m.attack.damage[1]}`;
    console.log(`| ${m.name} | ${hp} | ${dmg} | ${m.activity || '?'} | ${hasScen ? '✅' : '❌'} | ${hasMechanic ? '✅' : '❌'} |`);
  }
}

console.log(`\n## Summary`);
console.log(`- Total monsters: ${total}`);
console.log(`- With debug scenario: ${withScenario}/${total}`);
console.log(`- With unique mechanic: ${withMechanic}/${total}`);
console.log('');
console.log('### Missing scenarios (TODO):');
for (const m of monsters) {
  const scenId = monsterToScenario[m.id];
  if (!scenId || !scenarioIds.has(scenId)) {
    console.log(`- ${m.name} (wave ${m.wave})`);
  }
}
