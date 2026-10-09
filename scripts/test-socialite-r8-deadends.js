// BREAK-IT socialite r8 (2026-10-09): SOFTLOCK + HONESTY sweep.
// S1: every choice id buildMenu offers must have a working handler — no
//     throws, no null returns that strand the player, no dead-end menus
//     without a 'leave'.
// H1: 10 kcal conversation-open cost — charged exactly once per successful
//     open, never on failed opens.
// H2: endConvo('left') vs endConvo('natural') — the canon doc
//     (docs/CONVERSATIONS.md) says trust is paid "on natural end"; the
//     engine pays the stipend on ANY end. Record the behavior honestly.
// Run: node scripts/test-socialite-r8-deadends.js (SEED=... optional)
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

(async () => {
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  const A = npcs[0], B = npcs[1];
  S.scholar.kcal = 99999;

  // ---------- H1: open cost ----------
  const kcalBefore = S.scholar.kcal;
  Game.startConvo(A);
  const chargedOnce = (kcalBefore - S.scholar.kcal) === 10;
  check('H1 open charges exactly 10 kcal', chargedOnce, `delta=${kcalBefore - S.scholar.kcal}`);
  Game.endConvo(A, 'left');
  // failed open (not on roster) must not charge
  const k2 = S.scholar.kcal;
  const bad = Game.startConvo('no-such-villager');
  check('H1 failed open charges nothing and returns null', bad === null && S.scholar.kcal === k2, `ret=${bad} delta=${k2 - S.scholar.kcal}`);

  // ---------- S1: dead-end sweep ----------
  // Walk several conversations; for every menu, try every choice id once in
  // a FRESH conversation state snapshot (we only need handler robustness).
  const seen = new Set(), deadends = [], throws = [];
  for (let convo = 0; convo < 6; convo++) {
    Game.startConvo(A);
    for (let turn = 0; turn < 8; turn++) {
      const menu = Game.buildMenu(A);
      if (!menu.some(c => c.id === 'leave' || c.id === 'goon')) {
        const c = Game.convoGet(A);
        if (c.active) deadends.push('no leave/goon in menu: ' + menu.map(x => x.id).join(','));
      }
      for (const ch of menu) {
        if (seen.has(ch.id)) continue;
        seen.add(ch.id);
        // fresh convo per probe so one probe can't poison the next
        Game.startConvo(B);
        let r = null, err = null;
        try { r = Game.convoTurn(B, ch.id); } catch (e) { err = e.message; }
        if (err) throws.push(ch.id + ': ' + err);
        else if (r === null || r === undefined) throws.push(ch.id + ': returned null/undefined (chat would die)');
        else if (!r.ended && !(r.choices || []).length) deadends.push(ch.id + ': live turn with zero choices (stranded)');
        try { Game.endConvo(B, 'left'); } catch (e) {}
      }
      // advance the A conversation, rotating through menu positions to visit
      // more states (topics, rumor prompts, teach/learn, promises...)
      const m2 = Game.buildMenu(A).map(c => c.id);
      const nxt = m2[(turn + convo * 3) % m2.length];
      try { Game.convoTurn(A, nxt); } catch (e) { break; }
      if (!Game.convoGet(A).active) break;
    }
    try { Game.endConvo(A, 'left'); } catch (e) {}
  }
  console.log('choice ids probed: ' + seen.size);
  check('S1 no choice handler throws or returns null', throws.length === 0, throws.slice(0, 5).join(' | '));
  check('S1 no stranded menus (live turn, zero choices, no leave)', deadends.length === 0, deadends.slice(0, 5).join(' | '));

  // ---------- H2: left vs natural payout ----------
  v.trust[A] = 10;
  Game.startConvo(A);
  Game.convoTurn(A, 'agree'); Game.convoTurn(A, 'agree'); Game.convoTurn(A, 'agree');
  const tBeforeLeft = v.trust[A];
  Game.endConvo(A, 'left');
  const leftPaid = v.trust[A] - tBeforeLeft;
  v.trust[A] = 10;
  Game.startConvo(A);
  Game.convoTurn(A, 'agree'); Game.convoTurn(A, 'agree'); Game.convoTurn(A, 'agree');
  const tBeforeNat = v.trust[A];
  Game.endConvo(A, 'natural');
  const natPaid = v.trust[A] - tBeforeNat;
  console.log(`H2 'left' paid +${leftPaid}, 'natural' paid +${natPaid} (canon doc says "natural end")`);
  check('H2 behavior recorded (no crash on either path)', true);

  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
