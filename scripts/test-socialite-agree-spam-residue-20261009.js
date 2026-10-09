// PROOF TEST: acknowledgment-spam mood-residue farm (break-it 2026-10-09, socialite).
// Bug (pre-fix): the 2026-10-08 agree-spam fix named "yeah" (agree) in its
// comment but never added 'agree'/'joke'/'silence' to the wrapper's light
// set — and missed the no-language menu's gesture acks (nv:nod/smile/
// pointself). Pure acknowledgment spam ("You're right." x6, or smile x6)
// flipped c.substantive=true, and the mood those acks pump made endConvo's
// UNCAPPED (talk:false) mood residue fire every conversation. Measured
// pre-fix: 13 -> 57 over 25 empty convos — straight past the 40 talk cap.
// Fix (convo-dialogue.js convoTurn wrapper): the light set now covers
// agree/joke/silence + nv:nod/nv:smile/nv:pointself. Nodding along is
// listening, not engaging: it earns the capped talk stipend, never the
// residue. Answering direct questions (react:*) stays substantive, as do
// nv:listen (language learning) and nv:translate (third-party real act).
// FAILS on pre-fix code (final > 40), PASSES after.
// Run: node scripts/test-socialite-agree-spam-residue-20261009.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
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
[...html.matchAll(/src\/js\/[^\/"]+\.js|src\/js\/engine\/[^\/"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let A = 0, F = 0;
function ok(cond, msg, extra) { A++; if (!cond) { F++; console.log('  FAIL:', msg, extra || ''); } }

function ackSpamConvo(vid, ackIds) {
  Game.startConvo(vid);
  for (let e = 0; e < 6; e++) {
    const ids = (Game.convoChoices(vid) || []).map(x => x.id);
    const pick = ackIds.find(a => ids.includes(a)) || ids.find(x => x !== 'leave');
    if (!pick) break;
    const r = Game.convoTurn(vid, pick);
    if (r && r.ended) break;
  }
  const c = Game.convoGet(vid);
  const sub = !!(c && c.substantive);
  Game.endConvo(vid, 'natural');
  return sub;
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  Game.say = function () {}; Game.save = function () {};
  const v = Game.state.village;
  const vid = v.roster.filter(id => id !== Game.villagerId)[0];
  const trust = () => ((v.trust || {})[vid] === undefined ? 10 : v.trust[vid]);

  // 1. ACKS DON'T FLIP SUBSTANTIVE — the wrapper's light set.
  Game.startConvo(vid);
  Game.convoTurn(vid, 'agree');
  ok(Game.convoGet(vid).substantive === false, "'agree' does not flip substantive");
  Game.endConvo(vid, 'left');
  Game.startConvo(vid);
  const ids0 = (Game.convoChoices(vid) || []).map(x => x.id);
  if (ids0.includes('silence')) { Game.convoTurn(vid, 'silence'); ok(Game.convoGet(vid).substantive === false, "'silence' does not flip substantive"); }
  else console.log('  (silence not offered this menu — skip)');
  Game.endConvo(vid, 'left');

  // 2. EXPLOIT REPLAY — 25 pure-ack convos must not pass the 40 talk cap.
  v.trust = v.trust || {}; v.trust[vid] = 13;
  let sawSubstantive = false;
  for (let i = 0; i < 25; i++) sawSubstantive = ackSpamConvo(vid, ['agree', 'joke', 'silence']) || sawSubstantive;
  const final = trust();
  console.log(`25 ack-spam convos: 13 -> ${final.toFixed(1)} (substantive seen: ${sawSubstantive})`);
  ok(!sawSubstantive, 'no ack-only convo flipped substantive', `saw=${sawSubstantive}`);
  ok(final <= 40, 'ack-spam cannot pass the 40 talk cap', `final=${final.toFixed(1)}`);

  // 3. NO REGRESSION — a real substantive convo still earns stipend + residue.
  v.trust[vid] = 20;
  Game.startConvo(vid);
  let deep = null;
  // the dialogue menu surfaces asks behind dlg:subject ("talk about something else")
  let menu = (Game.convoChoices(vid) || []).map(x => x.id);
  if (menu.includes('dlg:subject')) {
    Game.convoTurn(vid, 'dlg:subject');
    menu = (Game.convoChoices(vid) || []).map(x => x.id);
  }
  deep = menu.find(id => id.indexOf('ask:') === 0 && id !== 'ask:spread_rumor') || menu.find(id => id.indexOf('ask:') === 0);
  const tBefore = trust();
  if (deep) {
    Game.convoTurn(vid, deep); // substantive for real
    for (let e = 0; e < 4; e++) {
      const m2 = (Game.convoChoices(vid) || []).map(x => x.id);
      const p2 = m2.includes('agree') ? 'agree' : m2.find(x => x !== 'leave');
      if (!p2) break;
      const r = Game.convoTurn(vid, p2); if (r && r.ended) break;
    }
  } else console.log('  (no ask: choice offered — cannot test regression path)');
  const c = Game.convoGet(vid);
  const wasSub = !!(c && c.substantive);
  Game.endConvo(vid, 'natural');
  const tAfter = trust();
  console.log(`real convo (substantive=${wasSub}): ${tBefore.toFixed(1)} -> ${tAfter.toFixed(1)}`);
  ok(wasSub, 'a deep ask still flips substantive');
  ok(tAfter > tBefore, 'a real conversation still builds trust', `delta=${(tAfter - tBefore).toFixed(1)}`);

  console.log(`${A - F}/${A} assertions passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})();
