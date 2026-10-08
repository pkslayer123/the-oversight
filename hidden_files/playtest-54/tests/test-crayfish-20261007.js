// PROOF TEST (red): crayfish catch emits TWO texts — a generic bite AND a
// double "Got it". Bug: huntAnimal's generic BITE hook fires ("It bites!
// Teeth in your hand") for aquatic_defensive, then the kill branch emits
// BOTH 'Got it — Rusty Crayfish!' AND 'Got it — but the tiny boxer gets a
// pinch in first.' A crayfish has no teeth, and "Got it" twice reads as a
// stutter / two catches. Deterministic: Math.random pinned at 0.01 so the
// bite, the kill, and the pinch all fire.
// Expected (fixed): no "Teeth in your hand" for the crayfish; at most one
// "Got it" line per catch.
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

Game.init().then(() => {
  const says = [];
  Game.say = (t) => says.push(String(t));
  Game.feedback = (t) => says.push(String(t));
  Game.debugScenario('crayfish');
  says.length = 0;
  Math.random = () => 0.01; // bite fires, kill lands, pinch fires
  try { Game.huntAnimal(); } finally { /* keep pinned for this run */ }
  const teeth = says.filter(t => /Teeth in your hand/i.test(t));
  const gotIt = says.filter(t => /Got it/i.test(t));
  let fail = 0;
  if (teeth.length) { console.log('FAIL: crayfish bite text says "Teeth in your hand": ' + teeth[0]); fail = 1; }
  if (gotIt.length > 1) { console.log('FAIL: "Got it" appears ' + gotIt.length + 'x: ' + gotIt.join(' // ')); fail = 1; }
  if (!fail) console.log('PASS: crayfish catch is one clean fiction.');
  process.exit(fail);
}).catch(e => { console.error('FATAL', e); process.exit(2); });
