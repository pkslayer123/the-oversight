// Wave 2 Group C mechanics verification: Inspiration, Nostalgia.
// (the Middle Manager sections were deleted with its retired monster, 2026-10-08.)
// Run: node scripts/test-wave2-groupC.js (no jest — pure node, uses game harness)
const path = require('path');
const fs = require('fs');

// Minimal harness: load game data + combat engine without the full app.
const repo = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monsters.json'), 'utf8'));
const mlist = Array.isArray(monsters) ? monsters : (monsters.monsters || []);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}
function def(id) { return mlist.find(m => m.id === id); }

console.log('\n== DATA: bright_idea (Inspiration) ==');
{
  const d = def('bright_idea');
  ok(!!d, 'monster def exists');
  const pat = d.attack.pattern;
  ok(pat.type === 'burst' && pat.radius === 2, 'burst radius 2', JSON.stringify(pat));
  ok(pat.windup === 2, 'windup 2');
  ok(JSON.stringify(d.encounter.phases) === JSON.stringify(['settle','brighten','bloom','ember']), 'phases settle→brighten→bloom→ember');
  ok(d.fear === 'daylight', 'fears daylight');
  ok(d.behavior === 'ambush' && d.activity === 'nocturnal', 'nocturnal ambush');
  ok(d.attack.damage[0] === 22 && d.attack.damage[1] === 34, 'damage 22-34 psychic');
}

console.log('\n== DATA: memory_projector (Nostalgia) ==');
{
  const d = def('memory_projector');
  ok(!!d, 'monster def exists');
  const pat = d.attack.pattern;
  ok(pat.type === 'beam' && pat.length === 5, 'beam length 5', JSON.stringify(pat));
  ok(pat.windup === 2, 'windup 2');
  ok(JSON.stringify(d.encounter.phases) === JSON.stringify(['watch','spell','static']), 'phases watch→spell→static');
  ok(d.fear === 'movement', 'fears movement');
  ok(d.attack.damage[0] === 16 && d.attack.damage[1] === 26, 'damage 16-26 psychic');
  ok(d.attack.telegraph && d.attack.telegraph.length > 40, 'distinct telegraph text');
}

console.log('\n== GAME.JS: Inspiration / Nostalgia blocks ==');
{
  const src = fs.readFileSync(path.join(repo, 'src/js/game.js'), 'utf8');
  ok(src.includes("if (this.biIs(m))"), 'bright_idea block present');
  ok(src.includes("if (this.mpIs(m))"), 'memory_projector block present');
  ok(src.includes("audioEvent('eurekaCharge')"), 'eurekaCharge fired');
  ok(src.includes("audioEvent('eurekaTick'"), 'eurekaTick fired');
  ok(src.includes("audioEvent('eurekaSpent')"), 'eurekaSpent fired');
  ok(src.includes("audioEvent('eurekaDisperse')"), 'eurekaDisperse fired');
  ok(src.includes("audioEvent('eurekaDrift')"), 'eurekaDrift fired');
  ok(src.includes("audioEvent('eurekaDetonate')"), 'eurekaDetonate fired');
  ok(src.includes("encSetPhase(m, 'bloom')"), 'bloom phase set on detonation');
  ok(src.includes("audioEvent('projectorHum'"), 'projectorHum fired');
  ok(src.includes("audioEvent('projectorStatic')"), 'projectorStatic fired');
  ok(src.includes("audioEvent('projectorBreak')"), 'projectorBreak fired');
  ok(src.includes("audioEvent('projectorPull')"), 'projectorPull fired');
  ok(src.includes('mpSpellPull(m, tg)'), 'spell-pull invoked in countdown');
}

console.log('\n== APP.JS: audio synths registered ==');
{
  const src = fs.readFileSync(path.join(repo, 'src/js/app.js'), 'utf8');
  const fns = ['eurekaTick','eurekaCharge','eurekaSpent','eurekaDisperse','eurekaDrift','eurekaDetonate',
    'projectorHum','projectorStatic','projectorBreak','projectorPull',
    'managerCircle','managerCharge','managerDebrief','managerFear'];
  for (const fn of fns) {
    ok(src.includes('function ' + fn + '('), fn + ' synth defined');
    ok(src.includes(fn + '() { ' + fn + '(') || src.includes(fn + '(d) { ' + fn + '(d)'), fn + ' registered in audio map');
  }
}

console.log('\n== SYNTAX ==');
{
  const { execSync } = require('child_process');
  try { execSync('node --check src/js/game.js', { cwd: repo }); ok(true, 'game.js parses'); }
  catch (e) { ok(false, 'game.js parses', e.message); }
  try { execSync('node --check src/js/app.js', { cwd: repo }); ok(true, 'app.js parses'); }
  catch (e) { ok(false, 'app.js parses', e.message); }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
