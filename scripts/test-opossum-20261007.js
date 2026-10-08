// PROOF TEST (red): clean miss on an opossum prints a contradiction on one
// turn: 'Missed! <label> bolts. (-100 kcal)' followed by the flop text
// ('flops over, tongue lolling — playing dead'). It cannot both bolt and
// flop. Deterministic: Math.random pinned at 0.99 so the roll lands in the
// clean-miss branch, and encMissReact (plays_dead) does the flop.
// Expected (fixed): no "bolts" in the miss text for a plays_dead animal —
// the flop owns the turn.
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
  Game.debugScenario('opossum');
  says.length = 0;
  Math.random = () => 0.99; // clean miss -> flop
  try { Game.huntAnimal(); } finally { /* keep pinned */ }
  const bolts = says.filter(t => /\bbolts\b/i.test(t));
  const flop = says.filter(t => /playing dead/i.test(t));
  let fail = 0;
  if (!flop.length) { console.log('FAIL: opossum did not flop on a clean miss: ' + says.join(' // ')); fail = 1; }
  if (bolts.length) { console.log('FAIL: opossum miss text says "bolts" AND it flops: ' + bolts[0]); fail = 1; }
  if (!fail) console.log('PASS: opossum miss reads as one fiction (flop, no bolt).');
  process.exit(fail);
}).catch(e => { console.error('FATAL', e); process.exit(2); });
