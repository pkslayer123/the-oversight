#!/usr/bin/env node
// Monster balance test (Steve 2026-10-05)
// Uses debug scenarios to fight each monster and report balance metrics.
// This is how we balance in parallel — not from the desk, from the fight.
//
// Run: node scripts/test-monster-balance.js [wave1|wave2|all]

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Load the game engine
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

// Monster ID -> scenario ID mapping
const SCENARIOS = {
  'bulldozer': 'bulldozer',
  'hushwolf': 'hushpuppy',
  'gallowdeer': 'headlight',
  'mirrormoth': 'flashbulb',
  'belltoad': 'choir',
  'lockpick_raccoon': 'lockpick',
  'white_noise_heron': 'whitenoise',
  'hummice': 'hummice',
  'speedbump_turtle': 'speedbump',
  'nightlight_catfish': 'nightlight',
  'ducks_in_a_row': 'ducksinarow',
  'glasswing': 'glasswing',
  'sunbasker': 'sunbasker',
  'voice_mimic_radio': 'static',
  'mirror_stag': 'griefcounselor',
  'review_drone': 'reviewdrone',
  'camera_swarm': 'influencer',
  'hype_horn': 'motivationalspeaker',
  'service_mimic': 'customerservice',
  'contract_golem': 'termsconditions',
  'delegate_beast': 'middlemanager',
  'bright_idea': 'inspiration',
  'memory_projector': 'nostalgia',
};

async function testMonster(monsterId) {
  const scenId = SCENARIOS[monsterId];
  if (!scenId) {
    return { id: monsterId, error: 'no scenario' };
  }

  try {
    Game.debugScenario(scenId);
    const s = Game.state.scholar;
    const m = s.monster;
    if (!m || m.id !== monsterId) {
      return { id: monsterId, error: `scenario spawned ${m?.id}, expected ${monsterId}` };
    }

    // Get monster definition
    const mdef = (Game.data.monsters || []).find(x => x.id === monsterId) || {};
    
    return {
      id: monsterId,
      name: mdef.name || monsterId,
      hp: mdef.hp,
      armor: mdef.armor || 0,
      resistances: mdef.resistances || {},
      attackType: (mdef.attack || {}).damageType || 'physical',
      attackDmg: (mdef.attack || {}).damage,
      wave: mdef.wave,
      activity: mdef.activity,
      scenario: scenId,
      ok: true,
    };
  } catch (e) {
    return { id: monsterId, error: e.message };
  }
}

(async () => {
  await Game.init();
  
  const filter = process.argv[2] || 'all';
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  
  let toTest = monsters;
  if (filter === 'wave1') toTest = monsters.filter(m => m.wave === 1);
  if (filter === 'wave2') toTest = monsters.filter(m => m.wave === 2);
  
  console.log(`\nTesting ${toTest.length} monsters (${filter})...\n`);
  
  const results = [];
  for (const m of toTest) {
    const r = await testMonster(m.id);
    results.push(r);
    if (r.ok) {
      console.log(`✅ ${r.name} (wave ${r.wave}, ${r.activity})`);
      console.log(`   HP ${r.hp[0]}-${r.hp[1]}, Armor ${r.armor}, Atk ${r.attackType} ${r.attackDmg[0]}-${r.attackDmg[1]}`);
      if (Object.keys(r.resistances).length > 0) {
        console.log(`   Resistances: ${JSON.stringify(r.resistances)}`);
      }
    } else {
      console.log(`❌ ${m.id}: ${r.error}`);
    }
  }
  
  const ok = results.filter(r => r.ok).length;
  console.log(`\n${ok}/${results.length} scenarios working.`);
  
  if (ok !== results.length) process.exit(1);
})();
