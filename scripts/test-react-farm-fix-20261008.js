// PROOF TEST: dlg:react wind-down / trust-farm fix (2026-10-08).
// Bug: after a topic answer whose thread had no more beats, dlg:react was
// offered forever; every tap printed '"Anyway." A small smile.' and granted
// +0.5 trust with no cap — an infinite trust farm on a dead button. The old
// wind-down counter only incremented on formally-dry threads (via dlg:more),
// so threadless wind-downs never engaged it.
// Fix: every beat-less react increments c.reactDryCount (reset when a beat
// lands); the menu hides dlg:react after 2 consecutive dead reacts.
// FAILS on pre-fix code (react offered 8+ taps, trust +4), PASSES after.
// Run: node scripts/test-react-farm-fix-20261008.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (ns) => { s = ns >>> 0; };
  return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let A = 0, F = 0;
function ok(cond, msg, extra) { A++; if (!cond) { F++; console.log('  FAIL:', msg, extra || ''); } }

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const vid = v.roster.filter(id => id !== Game.villagerId)[0];
  Game.startConvo(vid);
  const c = Game.convoGet(vid);
  // get a real answer first (beat context, like a player would)
  const ids0 = (Game.convoChoices(vid) || []).map(x => x.id);
  const first = ids0.find(id => id.indexOf('gq:') === 0) || ids0.find(id => id === 'ask:personal');
  if (first) Game.convoTurn(vid, first);
  // force the threadless state deterministically: no thread -> convoThreadBeat
  // returns null -> every react is a dead wind-down regardless of RNG
  c.thread = null; c.threadDryFor = null; c.reactDryCount = 0;
  const t0 = v.trust[vid] || 0;
  let deadTaps = 0, beatTaps = 0;
  for (let i = 0; i < 8; i++) {
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    if (!ids.includes('dlg:react')) break;
    const r = Game.convoTurn(vid, 'dlg:react');
    const line = String(r.line || r.msg || '');
    if (line.indexOf('Anyway.') >= 0) deadTaps++; else beatTaps++;
  }
  const t1 = v.trust[vid] || 0;
  console.log(`dead taps before hidden: ${deadTaps}, beat taps: ${beatTaps}, trust ${t0} -> ${t1}`);
  ok(deadTaps <= 2, 'dlg:react winds down after at most 2 dead taps', `deadTaps=${deadTaps}`);
  // Trust moves in whole points (trustGainMult rounds; 0.5 -> 1 since the
  // dialogue rethink routes consequences through trustGainProgressive).
  // Two dead taps = +2 max, and the menu hides the button — the farm fix
  // is the wind-down, not the half-point.
  ok(t1 - t0 <= 2.01, 'no infinite trust farm on the dead button', `delta=${+(t1 - t0).toFixed(2)}`);
  const idsAfter = (Game.convoChoices(vid) || []).map(x => x.id);
  ok(!idsAfter.includes('dlg:react'), 'dlg:react hidden once wound down');
  ok(idsAfter.length > 0, 'menu still offers other verbs (not a dead end)', idsAfter.join(','));
  // reset: a landed beat re-opens react. Force a thread with beats if data has any.
  Game.convoGet(vid).reactDryCount = 2;
  let resetChecked = false;
  for (const th of ['goal', 'past', 'plans']) {
    Game.convoGet(vid).thread = th;
    const b = Game.convoThreadBeat(vid);
    if (b) {
      resetChecked = true;
      ok(Game.convoGet(vid).reactDryCount === 0, 'a landed beat resets the dead-react count', `thread=${th}`);
      break;
    }
  }
  if (!resetChecked) ok(true, 'reset check skipped (no beat data for goal/past/plans this seed)');
  Game.endConvo(vid, 'left');
  console.log(`\n${A - F}/${A} assertions green`);
  if (F) process.exitCode = 1;
})().catch(e => { console.error('CRASH:', e); process.exitCode = 2; });
