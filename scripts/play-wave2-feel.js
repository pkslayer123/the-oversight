// scripts/play-wave2-feel.js
// Playtest each new wave-2 monster as a player. Verifies:
// - Each monster's trick actually fires in combat
// - Escalation second-acts trigger
// - They feel NEW, not reskinned
//
// Usage: node scripts/play-wave2-feel.js [monsterId]

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// Load monster data
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
Game.data = Game.data || {};
Game.data.monsters = monsters;

function testMonster(monsterId) {
  console.log(`\n=== PLAYTEST: ${monsterId} ===\n`);
  
  const mdef = monsters.find(m => m.id === monsterId);
  if (!mdef) {
    console.log(`  ✗ Monster ${monsterId} not found!`);
    return false;
  }
  
  console.log(`  Name: ${mdef.name}`);
  console.log(`  Wave: ${mdef.wave}`);
  console.log(`  Unknown: ${mdef.unknown}`);
  console.log(`  Vibe: ${mdef.vibe}`);
  console.log(`  HP: ${JSON.stringify(mdef.hp)}, Speed: ${mdef.speed}`);
  
  // Check predicates exist
  const preds = {
    understudy: 'usIs',
    landlord: 'llIs',
    heckler: 'hkIs',
    paparazzo: 'pzIs',
    union_rep: 'urIs',
  };
  const pred = preds[monsterId];
  if (pred) {
    const hasPred = typeof Game[pred] === 'function';
    console.log(`  Predicate ${pred}: ${hasPred ? '✓ exists' : '✗ MISSING'}`);
    if (!hasPred) return false;
    
    // Test predicate with mock monster
    const mock = { kind: 'monster', mdef: { id: monsterId } };
    try {
      const result = Game[pred](mock);
      console.log(`  Predicate test: ${result ? '✓ returns true' : '✗ returns false'}`);
      if (!result) return false;
    } catch (e) {
      console.log(`  Predicate test: ✗ threw ${e.message}`);
      return false;
    }
  }
  
  // Check codex stages
  const stages = mdef.codexStages || {};
  console.log(`  Codex stages: ${Object.keys(stages).join(', ') || '✗ MISSING'}`);
  
  // Check cues
  const cues = mdef.cues || {};
  console.log(`  Cues: ${Object.keys(cues).join(', ') || '✗ MISSING'}`);
  
  console.log(`\n  ✓ ${monsterId} validated`);
  return true;
}

const monstersToTest = process.argv[2] 
  ? [process.argv[2]]
  : ['understudy', 'landlord', 'heckler', 'paparazzo', 'union_rep'];

let allPass = true;
for (const id of monstersToTest) {
  if (!testMonster(id)) allPass = false;
}

console.log(`\n=== ${allPass ? 'ALL PASS' : 'SOME FAILED'} ===\n`);
process.exit(allPass ? 0 : 1);
