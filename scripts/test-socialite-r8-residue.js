// BREAK-IT socialite r8 (2026-10-09): the MOOD-RESIDUE trust farm.
// Standing rules under test:
//   - "Words only go so far": talk-originated trust caps at 40 (convo-scene.js
//     resolveConsequence, canon docs/CONVERSATIONS.md "Trust +3 on natural end
//     (same 40-cap as before: words only go so far)").
//   - endConvo pays a mood residue: trust = clamp(mood,-3..3), talk:false
//     (UNCAPPED) — gated on exchanges>=3 + c.substantive.
//   - c.substantive flips on ANY non-light choice id (convo-dialogue.js
//     convoTurn wrapper). Light set: goon/leave/recap/dlg:react/dlg:more/
//     agree/joke/silence/nv:nod/nv:smile/nv:pointself.
// HOSTILE CLAIM: "Can I ask you something else?" / a small-talk topic ask +
// two "You're right." + goodbye is pure words, costs 10 kcal + 1 tick, and
// harvests UNCAPPED trust past the 40 cap — the exact farm the cap was built
// to kill, wearing a "felt experience" disguise.
// The harness plays ONLY buttons buildMenu actually offers (honest player).
// Run: node scripts/test-socialite-r8-residue.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\\\"]+\.js|src\/js\/engine\/[^\/\\\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };
const LIGHT = new Set(['goon', 'leave', 'recap', 'dlg:react', 'dlg:more', 'agree', 'joke', 'silence', 'nv:nod', 'nv:smile', 'nv:pointself']);

(async () => {
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me && (v.trust || {})[id] !== 0);
  const A = npcs[0];
  v.trust[A] = 40; // start AT the words cap
  S.scholar.kcal = 99999;
  const mood0 = (() => { try { return Game.npcMood(A); } catch (e) { return '?'; } })();

  let farmOk = true, detail = '';
  const trace = [];
  for (let i = 0; i < 60; i++) {
    const st = Game.startConvo(A);
    if (!st) { farmOk = false; detail = 'startConvo returned null at iter ' + i; break; }
    // hostile play: first non-light, non-leave choice the menu offers.
    // react:* (answering their direct question) IS substantive by design —
    // only honest_pass is excluded.
    let menu = Game.buildMenu(A).map(c => c.id);
    const sub = menu.find(id => !LIGHT.has(id) && id !== 'leave' && id.indexOf('ans:') !== 0 && id.indexOf('honest_pass') === -1);
    if (!sub) { farmOk = false; detail = 'no substantive choice offered at iter ' + i + ' menu=' + menu.join(','); break; }
    let r;
    try { r = Game.convoTurn(A, sub); } catch (e) { farmOk = false; detail = 'convoTurn(' + sub + ') threw: ' + e.message; break; }
    // two agrees (whatever the menu calls them — use the agree-family if offered)
    for (let k = 0; k < 2; k++) {
      menu = Game.buildMenu(A).map(c => c.id);
      const ag = menu.includes('agree') ? 'agree' : menu.find(id => ['joke', 'silence', 'dlg:react'].includes(id));
      if (!ag) { farmOk = false; detail = 'no agree-family choice at iter ' + i + ' menu=' + menu.join(','); break; }
      try { Game.convoTurn(A, ag); } catch (e) { farmOk = false; detail = 'agree threw: ' + e.message; break; }
    }
    if (!farmOk) break;
    const c = Game.convoGet(A);
    const ex = c.exchanges, subst = !!c.substantive, mood = c.mood;
    Game.endConvo(A, 'left');
    if (i < 3 || i % 10 === 9) trace.push(`iter${i}: trust=${v.trust[A]} ex=${ex} subst=${subst} mood=${mood} firstChoice=${sub}`);
    if (v.trust[A] >= 90) { trace.push(`reached 90 at iter ${i}`); break; }
  }
  console.log('--- farm trace (trust starts at 40, npcMood=' + mood0 + ') ---');
  trace.forEach(t => console.log('  ' + t));
  const end = v.trust[A];
  check('E1 words-only farm: trust stays at/below the 40 words cap', farmOk && end <= 40,
    `farmOk=${farmOk} ${detail} trust 40 -> ${end}`);
  if (!(farmOk && end <= 40)) {
    console.log('KILL CANDIDATE: pure-words conversation loop moved trust 40 -> ' + end);
  }

  // ---------- E2: penalties still land whole above 40 ----------
  // A tense ending must still cost trust — the cap binds gains only.
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S2 = Game.state, v2 = S2.village;
  const B2 = (v2.roster || []).filter(id => id !== Game.villagerId)[0];
  v2.trust[B2] = 60; S2.scholar.kcal = 99999;
  v2.grief = 3; // everyone grieving: jokes land badly (-1 mood each)
  Game.startConvo(B2);
  let m = Game.buildMenu(B2).map(c => c.id);
  // answer any hanging direct question first (react:* is substantive)
  const rq = m.find(id => (id.indexOf('react:') === 0 || id.indexOf('gq:') === 0) && id.indexOf('honest_pass') === -1);
  if (rq) Game.convoTurn(B2, rq);
  // cool the room for real: rudely dodge two direct questions (deflect_q:
  // trust -1, mood -1 each — the engine's own question state, seeded here
  // the way the 0.4/turn question probability would produce it)
  for (let k = 0; k < 3; k++) {
    const cc = Game.convoGet(B2);
    cc.pendingQ = { id: 'qtest' + k, answers: [{ id: 'a', label: '"Far from here."' }] };
    const mm = Game.buildMenu(B2).map(x => x.id);
    if (!mm.includes('deflect_q')) break;
    Game.convoTurn(B2, 'deflect_q');
  }
  const c2 = Game.convoGet(B2);
  console.log(`E2 setup: mood=${c2.mood} exchanges=${c2.exchanges} substantive=${c2.substantive} trust=${v2.trust[B2]}`);
  Game.endConvo(B2, 'left');
  check('E2 tense ending above 40 still costs trust (penalties land whole)',
    v2.trust[B2] < 60, `trust 60 -> ${v2.trust[B2]}`);

  // ---------- E3: dlg:subject flips substantive (bypass fix) ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S3 = Game.state, v3 = S3.village;
  const C3 = (v3.roster || []).filter(id => id !== Game.villagerId)[0];
  v3.trust[C3] = 40; S3.scholar.kcal = 99999;
  Game.startConvo(C3);
  Game.convoTurn(C3, 'dlg:subject');
  check('E3 dlg:subject marks conversation substantive (choke-point bypass fixed)',
    Game.convoGet(C3).substantive === true, `substantive=${Game.convoGet(C3).substantive}`);
  Game.endConvo(C3, 'left');

  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
