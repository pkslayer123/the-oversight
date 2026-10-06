// Test: "humming in the grass" teleport investigation (Steve 2026-10-06)
// Player report: fighting hummice, "every time I tried to take an action I was
// suddenly on a new grid."

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ FAIL: ' + msg); }
}

console.log('\n1. Identify "the humming in the grass"');
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/monsters.json'), 'utf8'));
const ms = Array.isArray(monsters) ? monsters : (monsters.monsters || []);
const hum = ms.find(m => m.unknown === 'the humming in the grass');
ok(!!hum, 'found monster with unknown="the humming in the grass"');
ok(hum && hum.id === 'hummice', 'it is hummice (id=' + (hum && hum.id) + ')');

console.log('\n2. Does hummice have push/teleport/forced-movement?');
const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
const humBlock = gameSrc.slice(gameSrc.indexOf('tbHumSwarmCheck'), gameSrc.indexOf('tbHumSwarmCheck') + 3000);
// tbHumSwarmCheck moves MONSTERS (scatter), never the player
ok(!/p\.mx\s*=|p\.my\s*=|player.*mx\s*=/.test(humBlock), 'tbHumSwarmCheck never repositions the player (only monsters scatter)');
const atk = (hum.attack || {});
ok(!/push|teleport|knockback|shove/i.test(JSON.stringify(hum)), 'no push/teleport in hummice data');

console.log('\n3. What DOES reposition the player in combat?');
const moveSection = gameSrc.slice(gameSrc.indexOf('tbPlayerMove(cx, cy)'), gameSrc.indexOf('tbPlayerMove(cx, cy)') + 8000);
ok(/BARRIER CROSSED/.test(moveSection), 'barrier-crossing narration is unmistakable (🚪 BARRIER CROSSED)');
ok(/4 \+ dx \* 3/.test(moveSection), 'barrier-follow repositions player to opposite edge (the "teleport")');

console.log('\n4. Barrier edges are now visible during combat');
const appSrc = fs.readFileSync(path.join(__dirname, '../src/js/app.js'), 'utf8');
ok(/barrierEdge/.test(appSrc), 'grid renderer adds barrierEdge class on edge tiles during combat');
const css = fs.readFileSync(path.join(__dirname, '../src/css/main.css'), 'utf8');
ok(/\.cell\.barrierEdge/.test(css), 'CSS styles barrierEdge (dashed cyan outline = "way out")');

console.log('\n5. Conclusion');
console.log('  The "teleport" is the flee-by-barrier mechanic: at grid edge, 50%');
console.log('  monsters follow to a new node and combat continues. It was invisible —');
console.log('  no edge indicators, easy-to-miss narration. Now: visible edges +');
console.log('  unmistakable 🚪 BARRIER CROSSED narration.');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
