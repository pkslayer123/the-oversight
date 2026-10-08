// RED TEST (playtest-54, 2026-10-07): watch-mode "Give them space" is not honored.
// Setup: villager taken (watch mode), watcher picks "Give them space" at the
// final watch phase, verdict rolls LOST. Expected: no "You go to <name>" line.
// Actual (bug): _contestEnd's watch-lost branch prints "You go to X. They're
// quiet..." unconditionally — the choice is a lie. contests.js:2245.
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

const said = [];
Game.say = t => said.push('[say] ' + String(t));
Game.sysSay = t => said.push('[sys] ' + String(t));

async function main() {
  await Game.init();
  Game.debugScenario('contestWatch'); // leaves activeContest in watch mode, phase 0
  const ac = Game.state.activeContest;
  if (!ac || ac.participant === 'player') { console.log('SKIP: no watch-mode contest'); process.exit(2); }
  const vid = ac.participant;
  const vname = Game.displayName(vid);
  // Jump to final watch phase (index 2): [Go to them | Give them space]
  ac.phaseIdx = 2;
  // Script random so the VERDICT rolls LOST, not die/win:
  // pit risk=high -> dieBase 0.10, winBase 0.40. [0.5, 0.5]: no die, no win.
  const real = Math.random;
  const q = [0.5, 0.5];
  Math.random = () => (q.length ? q.shift() : real());
  try { Game.contestChoose(1); } finally { Math.random = real; } // "Give them space"
  const text = said.join('\n');
  const went = new RegExp('You go to ' + vname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(text);
  if (went) {
    console.log('RED: chose "Give them space" but verdict says "You go to ' + vname + '"');
    console.log(text.split('\n').filter(l => /You go to|Give them space/.test(l)).join('\n'));
    process.exit(1);
  }
  console.log('GREEN: "Give them space" honored — no "You go to" line. Verdict coherent.');
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(3); });
