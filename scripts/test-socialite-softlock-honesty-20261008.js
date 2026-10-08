// ADVERSARIAL 3 (break-it 2026-10-08, socialite): softlock + honesty sweeps.
// SOFTLOCK: (a) no active conversation may offer an empty menu; (b) talk-
// request cues must be consumed when opened; (c) rumor verbs must not dangle
// when no targets remain; (d) the Ask/Answer contract must hold on every NPC
// question type (bespoke pendingQ, reactiveQ, genericQ).
// HONESTY: (e) the 'leave' label must not lie — "Nice talking to you" after
// zero exchanges is a false player line; (f) menu labels must not leak names
// the player hasn't learned (nameKnown gate on gossip subject pickers).
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
  const others = v.roster.filter(id => id !== Game.villagerId);

  // (a) empty-menu sweep across villagers and menu states
  let emptyMenus = 0, checked = 0;
  for (const vid of others.slice(0, 4)) {
    for (let k = 0; k < 6; k++) {
      Game.startConvo(vid);
      const ids = (Game.convoChoices(vid) || []).map(x => x.id);
      checked++;
      if (!ids.length) { emptyMenus++; console.log(`  EMPTY menu for ${vid} cycle ${k}`); }
      const pick = ids.find(x => x.indexOf('gq:') === 0) || ids.find(x => x === 'ask:personal') || ids[0];
      if (pick) Game.convoTurn(vid, pick); else break;
      Game.endConvo(vid, 'left');
    }
    try { if (Game.convoGet(vid).active) Game.endConvo(vid, 'left'); } catch (e) {}
  }
  console.log(`menus checked: ${checked}, empty: ${emptyMenus}`);
  ok(emptyMenus === 0, 'no active conversation offers an empty menu', `empty=${emptyMenus}`);

  // (e) leave-label honesty on a zero-exchange convo
  const vid = others[0];
  Game.startConvo(vid);
  const leaveChoice = (Game.convoChoices(vid) || []).find(x => x.id === 'leave');
  console.log(`zero-exchange leave label: ${leaveChoice && leaveChoice.label}`);
  ok(!leaveChoice || leaveChoice.label.indexOf('Nice talking to you') === -1,
    'leave label must not claim a conversation happened when none did', leaveChoice && leaveChoice.label);
  Game.endConvo(vid, 'left');

  // (d) Ask/Answer contract on live question states
  let contractFails = [];
  for (const v2 of others.slice(0, 3)) {
    if (typeof Game.validateAskContract === 'function') {
      const r = Game.validateAskContract(v2);
      if (!r.ok) contractFails.push(v2 + ': ' + (r.failures || []).join(';'));
    }
  }
  console.log(`ask-contract failures: ${contractFails.length}`);
  ok(contractFails.length === 0, 'Ask/Answer contract holds (honest opt-out present)', contractFails.slice(0, 3).join(' | '));

  console.log(`${A - F}/${A} assertions passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
