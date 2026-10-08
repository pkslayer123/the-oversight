// Shared harness loader for playtest-54 social scenarios.
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
// HOT-TREE GUARD (2026-10-06): a sibling's uncommitted edit can leave a file
// syntactically broken (convo-dialogue.js:315 unescaped apostrophe). Fall back
// to HEAD for any file that fails to parse, and record the substitution.
const headFallbacks = [];
order.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { eval(src); }
  catch (e) {
    if (e instanceof SyntaxError) {
      const head = execSync('git show HEAD:' + f, { cwd: ROOT }).toString();
      eval(head);
      headFallbacks.push(f);
    } else throw e;
  }
});
if (headFallbacks.length) console.error('HEAD-FALLBACK (broken in worktree): ' + headFallbacks.join(', '));
delete global.window;
const Game = globalThis.Scattering.Game;

// helpers
function captureSay() {
  const log = [];
  const orig = Game.say;
  Game.say = function (t) { log.push(String(t)); };
  return { log, restore() { Game.say = orig; } };
}
async function runScenario(name) {
  const { log, restore } = captureSay();
  try { await Game.init(); }
  catch (e) { log.push('INIT ERROR: ' + e.message); }
  try { Game.debugScenario(name); }
  catch (e) { log.push('SCENARIO ERROR: ' + e.message + '\n' + e.stack); }
  restore();
  return log;
}
function safeCall(label, log, fn) {
  try { return fn(); }
  catch (e) { log.push('THROW in ' + label + ': ' + e.message); return null; }
}
module.exports = { Game, captureSay, runScenario, safeCall, fs, path, ROOT };
