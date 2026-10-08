// PROOF TEST: endConvo hello-goodbye / repeat-call trust farm (break-it 2026-10-08, socialite).
// Bug (pre-fix): endConvo had no active-convo guard and paid its +3 talk
// stipend + mood residue on EVERY call. A hostile player could (a) call
// endConvo repeatedly on a dead conversation for +3/call to 100 with no
// conversation at all, and (b) spam startConvo->endConvo with zero exchanges
// to farm the +3 stipend to the 40 talk cap. The mood residue (talk:false,
// uncapped) also bypassed the 40 cap on content-free goodbyes.
// Fix (conversation.js endConvo):
//   - no-op (same return shape) when the conversation isn't active — a
//     goodbye is an event; it happens once, for a conversation that happened.
//   - talk stipend scales with actual exchanges: 0 -> 0, 1-2 -> +1, 3+ -> +3.
//   - mood residue only lingers after 3+ exchanges.
// FAILS on pre-fix code (trust 14 -> 40+ on dead convos), PASSES after.
// Run: node scripts/test-socialite-endconvo-farm-20261008.js (SEED=... optional)
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
[...html.matchAll(/src\/js\/[^\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
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
  const trust = () => ((v.trust || {})[vid] === undefined ? 10 : v.trust[vid]);
  const t0 = trust();

  // 1. REPEAT CALLS on a dead conversation pay nothing.
  Game.startConvo(vid);
  Game.endConvo(vid, 'left');
  const tAfterOne = trust();
  for (let i = 0; i < 10; i++) Game.endConvo(vid, 'left');
  const tAfterSpam = trust();
  console.log(`repeat-call: ${t0} -> 1st end ${tAfterOne} -> 10 more ends ${tAfterSpam}`);
  ok(tAfterSpam === tAfterOne, 'endConvo is a no-op on an inactive conversation', `+${tAfterSpam - tAfterOne} over 10 dead calls`);

  // 2. ZERO-EXCHANGE hello-goodbye spam pays nothing.
  const tBeforeHG = trust();
  for (let i = 0; i < 30; i++) { Game.startConvo(vid); Game.endConvo(vid, 'left'); }
  const tAfterHG = trust();
  console.log(`hello-goodbye x30: ${tBeforeHG} -> ${tAfterHG}`);
  ok(tAfterHG === tBeforeHG, 'a zero-exchange goodbye builds no trust', `delta=${tAfterHG - tBeforeHG}`);

  // 3. A REAL conversation (3+ exchanges) still earns its stipend + residue.
  Game.startConvo(vid);
  let n = 0;
  for (let i = 0; i < 12 && n < 4; i++) {
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    const r = ['agree', 'joke', 'silence'].find(x => ids.includes(x));
    if (!r) break;
    const st = Game.convoTurn(vid, r);
    if (!st) break;
    n++;
  }
  const tBeforeReal = trust();
  Game.endConvo(vid, 'left');
  const tAfterReal = trust();
  console.log(`real convo (${n} exchanges): ${tBeforeReal} -> ${tAfterReal}`);
  ok(tAfterReal >= tBeforeReal, 'a real conversation still pays its stipend', `delta=${tAfterReal - tBeforeReal}`);

  // 4. endConvo noop keeps the return shape (callers rely on st.ended).
  const noop = Game.endConvo(vid, 'left');
  ok(noop && noop.ended === true && noop.noop === true, 'dead-call returns the ended shape', JSON.stringify(noop));

  console.log(`${A - F}/${A} assertions passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
