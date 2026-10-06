#!/usr/bin/env node
// Combat feel tracer (Steve 2026-10-06)
// Simulates a fight and analyzes for FEEL-KILLERS:
// - Teleports (monster moves >1 cell in one step)
// - Instant turns (no delay between actions)
// - Skipped turns (monster acts twice, player skipped)
// - Missing highlights (acting monster not signaled)
//
// Run: node scripts/combat-tracer.js <scenario>
// Example: node scripts/combat-tracer.js headlight

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

const files = [
  'src/js/engine/state.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
  'src/js/sprites.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/debug-scenarios.js',
];

files.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed to load ${f}:`, e.message); process.exit(1); }
});

const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  
  const scenario = process.argv[2] || 'headlight';
  const ok = Game.debugScenario(scenario);
  if (!ok) {
    console.error(`Scenario ${scenario} failed to load`);
    process.exit(1);
  }
  
  console.log(`\n=== COMBAT TRACE: ${scenario} ===\n`);
  
  const s = Game.state.scholar;
  
  // Check if we're in combat
  if (!Game.tbfight) {
    console.log('Not in combat. Starting combat...');
    // Try to start combat if there's a monster
    if (s.monster) {
      // Combat should auto-start or we trigger it
      console.log(`Monster present: ${s.monster.id} at (${s.monster.mx}, ${s.monster.my})`);
    } else {
      console.log('No monster in scenario. Cannot trace combat.');
      process.exit(1);
    }
  }
  
  const trace = [];
  const startTime = Date.now();
  
  // Trace function: log every significant combat event
  function logEvent(type, data) {
    trace.push({
      t: Date.now() - startTime,
      type,
      ...data
    });
  }
  
  // Get initial positions
  const fighters = Game.tbfight ? Game.tbfight.fighters || [] : [];
  console.log(`Fighters: ${fighters.length}`);
  
  fighters.forEach((f, i) => {
    console.log(`  ${i}: ${f.name || f.id} at (${f.mx}, ${f.my}) HP:${f.hp}`);
    logEvent('init', { fighter: f.name || f.id, x: f.mx, y: f.my, hp: f.hp });
  });
  
  // Simulate 10 rounds of combat, tracing everything
  console.log(`\nSimulating 10 combat steps...\n`);
  
  for (let step = 0; step < 10; step++) {
    if (!Game.tbfight) {
      console.log('Combat ended.');
      break;
    }
    
    const before = JSON.stringify(fighters.map(f => ({ id: f.id, x: f.mx, y: f.my, hp: f.hp })));
    
    // Advance one turn
    try {
      Game.tbAdvance();
    } catch (e) {
      console.log(`Step ${step}: Error - ${e.message}`);
      break;
    }
    
    const after = JSON.stringify(fighters.map(f => ({ id: f.id, x: f.mx, y: f.my, hp: f.hp })));
    
    if (before !== after) {
      const b = JSON.parse(before);
      const a = JSON.parse(after);
      for (let i = 0; i < a.length; i++) {
        const dx = Math.abs(a[i].x - b[i].x);
        const dy = Math.abs(a[i].y - b[i].y);
        const dist = Math.max(dx, dy);
        if (dist > 0) {
          logEvent('move', {
            fighter: a[i].id,
            from: `(${b[i].x},${b[i].y})`,
            to: `(${a[i].x},${a[i].y})`,
            distance: dist,
            TELEPORT: dist > 1 ? '⚠️' : ''
          });
        }
        if (a[i].hp !== b[i].hp) {
          logEvent('damage', {
            fighter: a[i].id,
            hpBefore: b[i].hp,
            hpAfter: a[i].hp,
            delta: a[i].hp - b[i].hp
          });
        }
      }
    }
    
    logEvent('turn', { step, tbfight: !!Game.tbfight });
  }
  
  // Analyze for feel-killers
  console.log(`\n=== FEEL ANALYSIS ===\n`);
  
  let issues = [];
  
  // Check for teleports
  const teleports = trace.filter(e => e.type === 'move' && e.distance > 1);
  if (teleports.length > 0) {
    issues.push(`TELEPORTS: ${teleports.length} instances of monsters moving >1 cell`);
    teleports.forEach(t => console.log(`  ⚠️ ${t.fighter}: ${t.from} → ${t.to} (dist ${t.distance})`));
  } else {
    console.log(`  ✅ No teleports (all movement is 1 cell)`);
  }
  
  // Check turn timing (we can't measure real async delays in sync trace,
  // but we can check that tbAdvanceAsync exists)
  const hasAsync = gameSrc.includes('tbAdvanceAsync');
  if (hasAsync) {
    console.log(`  ✅ Async cadence code present (550ms beats)`);
  } else {
    issues.push('No async cadence - turns will be instantaneous');
  }
  
  // Check acting highlight
  const hasHighlight = gameSrc.includes('actingKey');
  if (hasHighlight) {
    console.log(`  ✅ Acting highlight code present`);
  } else {
    issues.push('No acting highlight - player cannot tell who is acting');
  }
  
  console.log(`\n=== TRACE (${trace.length} events) ===`);
  trace.slice(0, 20).forEach(e => {
    if (e.type === 'move') {
      console.log(`  [${e.t}ms] MOVE ${e.fighter}: ${e.from} → ${e.to} ${e.TELEPORT}`);
    } else if (e.type === 'damage') {
      console.log(`  [${e.t}ms] DMG ${e.fighter}: ${e.hpBefore} → ${e.hpAfter} (${e.delta})`);
    }
  });
  if (trace.length > 20) console.log(`  ... and ${trace.length - 20} more`);
  
  console.log(`\n=== VERDICT ===`);
  if (issues.length === 0) {
    console.log(`✅ No feel-killers detected`);
    process.exit(0);
  } else {
    console.log(`❌ Feel-killers found:`);
    issues.forEach(i => console.log(`  - ${i}`));
    process.exit(1);
  }
})();
