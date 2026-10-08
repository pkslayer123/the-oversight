// PROOF TEST (red): the TOOL READINESS feedback composes ungrammatical
// text: "You don't have the right tool for this one — no a fishing line,
// no the trapping skill or a cage." (seen live in the snappingturtle
// scenario). encMethodToolName returns article-bearing nouns ('a fishing
// line', 'the trapping skill or a cage') while huntAnimal prefixes 'no '.
// This test composes the line exactly the way huntAnimal does
// (encounters.js ~line 1703-1707) and asserts no 'no a ' / 'no the '.
// Expected (fixed): "no fishing line, no trapping skill or a cage".
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
  Game.debugScenario('snappingturtle'); // methods: line + trap, neither ready
  // compose exactly like huntAnimal does:
  const missing = ['line', 'trap'].map(m => Game.encMethodToolName(m));
  const line = "You lack the right tool for this one \u2014 no " + missing.join(", no ") + ".";
  let fail = 0;
  if (/\bno (a|the)\b/i.test(line)) { console.log('FAIL: ungrammatical tool line: ' + line); fail = 1; }
  if (!fail) console.log('PASS: tool line reads clean: ' + line);
  process.exit(fail);
}).catch(e => { console.error('FATAL', e); process.exit(2); });
