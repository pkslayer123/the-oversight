// Attack visuals test: verifies grid telegraphs render for all pattern types.
// Usage: node scripts/test-attack-visuals.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

// Load game (for pattern data)
const gameFiles = [
  'src/js/engine/state.js',
  'src/js/engine/modifiers.js',
  'src/js/engine/calories.js',
  'src/js/engine/day.js',
  'src/js/engine/forage.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
];
gameFiles.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// Load app.js telegraph collector (extract the function)
// We test the logic directly: for each pattern type, verify telegraph cells are collected.

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

async function main() {
  await Game.init();
  
  // 1. Verify all pattern types in monsters.json are handled by tbAllTelegraphCells
  const monsters = Game.data.monsters || [];
  const patternTypes = new Set();
  for (const m of monsters) {
    const ptype = (m.attack && m.attack.pattern && m.attack.pattern.type) || 'NONE';
    patternTypes.add(ptype);
  }
  console.log('Pattern types found:', [...patternTypes].join(', '));
  
  // The collector handles these (beam is handled separately by existing renderer)
  const handled = ['burst', 'charge', 'line', 'single', 'direct', 'rush', 'ambush'];
  for (const pt of patternTypes) {
    if (pt === 'beam' || pt === 'NONE') continue;
    ok(`pattern '${pt}' has a visual class`, handled.includes(pt), `missing visual for ${pt}`);
  }
  
  // 2. Verify CSS classes exist
  const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
  // rushIndicator removed (Steve 2026-10-06): rush patterns never declare —
  // the bucket was unreachable dead code.
  for (const cls of ['burstRadius', 'chargeLane', 'lineCells', 'targetTile', 'lockOn', 'ambushZone', 'vague',
    'dozeLane', 'pepBurst', 'swarmHum', 'resonantBurst', 'flashBurst']) {
    ok(`CSS .cell.${cls} exists`, css.includes(`.cell.${cls}`));
  }
  ok('CSS .cell.rushIndicator removed (dead)', !css.includes('.cell.rushIndicator'));
  
  // 3. Verify tbAllTelegraphCells function exists in app.js
  const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('tbAllTelegraphCells defined in app.js', appJs.includes('function tbAllTelegraphCells()'));
  ok('renderDetail calls tbAllTelegraphCells', appJs.includes('tbAllTelegraphCells()'));
  ok('grid uses _tgCls', appJs.includes('_tgCls'));
  
  // 4. Verify knowledge gating (vague flag)
  ok('vague flag for unlearned patterns', appJs.includes("out.vague.add"));
  ok('encTelegraphKnown checked', appJs.includes('encTelegraphKnown'));
  
  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
