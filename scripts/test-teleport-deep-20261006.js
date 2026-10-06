// Test: barrier crossing is exit-only, no spurious teleports (Steve 2026-10-06)
// - Walking along the edge or landing on an edge tile does NOT trigger crossing
// - Only pushing OFF the grid (exit intent) triggers tbBarrierExit
// - No other code path repositions the player fighter in combat
const fs = require('fs');
const gameSrc = fs.readFileSync('/home/hatch/workspace/the-scattering/src/js/game.js', 'utf8');
const appSrc = fs.readFileSync('/home/hatch/workspace/the-scattering/src/js/app.js', 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok:', name); }
  else { fail++; console.log('  FAIL:', name); }
}

// 1. tbPlayerMove must NOT contain the atEdge auto-trigger
const tbMoveMatch = gameSrc.match(/tbPlayerMove\(cx, cy\) \{[\s\S]*?\n    \},/);
check('tbPlayerMove exists', !!tbMoveMatch);
if (tbMoveMatch) {
  check('tbPlayerMove has no atEdge auto-trigger', !tbMoveMatch[0].includes('atEdge'));
  check('tbPlayerMove has no barrier crossing', !tbMoveMatch[0].includes('BARRIER CROSSED'));
}

// 2. tbBarrierExit exists and requires exit intent
check('tbBarrierExit exists', gameSrc.includes('tbBarrierExit(dx, dy)'));
const beMatch = gameSrc.match(/tbBarrierExit\(dx, dy\) \{[\s\S]*?\n    \},/);
if (beMatch) {
  check('tbBarrierExit checks onEdge (exit intent)', beMatch[0].includes('onEdge'));
  check('tbBarrierExit requires player on the pushed edge',
    beMatch[0].includes('p.mx === 0') && beMatch[0].includes('p.mx === 8'));
  check('tbBarrierExit guards world edge', beMatch[0].includes('known world ends here'));
}

// 3. moveStepHook routes off-grid combat steps to tbBarrierExit
check('moveStepHook calls tbBarrierExit on off-grid',
  appSrc.includes('Game.tbBarrierExit(step.dx, step.dy)'));
check('moveStepHook clears hold after exit', 
  appSrc.includes('if (exited) MoveAnim.clearHold()'));

// 4. No other player-fighter repositioning in game.js outside tbPlayerMove path-walk and tbBarrierExit
// Find the enclosing method for each p.mx assignment by scanning backward for method definitions.
const methodDefs = [...gameSrc.matchAll(/^    (\w+)\(/gm)].map(m => ({ name: m[1], pos: m.index }));
const allowedMethods = new Set(['tbPlayerMove', 'tbBarrierExit']);
let badRepositions = [];
for (const m of gameSrc.matchAll(/p\.mx = /g)) {
  let enclosing = null;
  for (const md of methodDefs) {
    if (md.pos < m.index) enclosing = md.name;
    else break;
  }
  if (!allowedMethods.has(enclosing)) badRepositions.push({ pos: m.index, method: enclosing });
}
console.log(`  info: ${[...gameSrc.matchAll(/p\.mx = /g)].length} p.mx assignments`);
if (badRepositions.length) console.log('  bad:', JSON.stringify(badRepositions));
check('all p.mx assignments are in tbPlayerMove or tbBarrierExit', badRepositions.length === 0);

// 5. travelTo is only called from barrier exit, door flee, tryNodeExit, and non-combat paths
const travelCalls = [...gameSrc.matchAll(/this\.travelTo\(/g)].length;
console.log(`  info: ${travelCalls} travelTo calls in game.js`);
check('travelTo call count sane (<=6)', travelCalls <= 6);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
