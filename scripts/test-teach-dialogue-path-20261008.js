// PROOF TEST: player->villager teach reachable on the dialogue path (2026-10-08).
// Bug: the 'teach' verb lived only in the base convo menu (conversation.js).
// The live dialogue menu (convo-beats.js dialogueResponses — the common case
// after an opener) never offered it, so villagers on the dialogue path could
// never be taught by the player, even though the teach handler and its
// topical-coherence rule exist.
// Fix: dialogueResponses offers 'teach' under the same gate as the base menu
// (off-topic-thread, not grief/cheer, something actually teachable).
// FAILS on pre-fix code ('teach' absent), PASSES after.
// Run: node scripts/test-teach-dialogue-path-20261008.js (SEED=... optional)
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
function ids(vid) { return (Game.convoChoices(vid) || []).map(c => c.id); }

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  // find a villager whose menu is on the DIALOGUE path after the opener
  let vid = null;
  for (const id of roster) {
    Game.startConvo(id);
    let ch = ids(id);
    const gq = ch.find(i => i.indexOf('gq:') === 0);
    if (gq) Game.convoTurn(id, gq);
    ch = ids(id);
    if (ch.some(i => i.indexOf('dlg:') === 0)) { vid = id; break; }
    Game.endConvo(id, 'left');
  }
  ok(!!vid, 'found a villager on the dialogue path', vid || 'none');
  if (!vid) { console.log(`${A - F}/${A}`); process.exitCode = 1; return; }
  // player learns a plant this villager doesn't know
  const pid = (Game.data.plants || []).map(p => p.id).find(p => !((v.taught || {})[vid] || []).includes(p));
  Game.identifyPlant(pid);
  const menu = ids(vid);
  console.log('dialogue menu:', menu.join('|'));
  ok(menu.includes('teach'), 'teach verb offered on the dialogue path', menu.join(','));
  if (menu.includes('teach')) {
    const t0 = v.trust[vid] || 0;
    const taughtBefore = ((v.taught || {})[vid] || []).slice();
    const r = Game.convoTurn(vid, 'teach');
    const line = String((r && (r.line || r.msg)) || '');
    ok(line.length > 10, 'teach produces a voiced beat', line.slice(0, 60));
    const taughtAfter = ((v.taught || {})[vid] || []);
    const gained = taughtAfter.filter(p => taughtBefore.indexOf(p) === -1);
    ok(gained.length === 1 && !!Game.state.codex.plants[gained[0]],
      'teaching registers a player-known plant on the villager', `gained=${gained.join(',')}`);
    ok((v.trust[vid] || 0) > t0, 'teaching builds trust', `${t0} -> ${v.trust[vid]}`);
    // topical coherence: bridge or plant link, never a bare drop
    ok(/reminds me|speaking of|different subject|let me show you|crouch|show them/i.test(line),
      'teach line carries a bridge or topical link');
  }
  // exhaust: teach everything the player knows, then the verb must go away
  let guard = 0;
  while (ids(vid).includes('teach') && guard < 12) { Game.convoTurn(vid, 'teach'); guard++; }
  ok(!ids(vid).includes('teach'), 'teach hidden when nothing left to teach');
  ok(ids(vid).length > 0, 'menu still alive after teaching everything', ids(vid).join(','));
  // ---- part 2: sweep — teach reachable on EVERY menu path ----
  // Invariant: when teachable (player knows a plant they don't) and off-thread
  // and no question hangs and not nonverbal, 'teach' must be in the menu —
  // on the dialogue path AND on full base menus (starvation fix).
  const TOPIC_THREADS = ['village', 'past', 'goal', 'plans', 'gossip', 'personal'];
  let swept = 0, expected = 0;
  const sweepMisses = [];
  for (const id of roster) {
    Game.startConvo(id);
    let ch = ids(id);
    const gq = ch.find(i => i.indexOf('gq:') === 0);
    if (gq) Game.convoTurn(id, gq);
    // make teachable: player learns a plant this villager doesn't know
    const p2 = (Game.data.plants || []).map(p => p.id).find(p => !((v.taught || {})[id] || []).includes(p));
    if (p2) Game.identifyPlant(p2);
    ch = ids(id);
    const c2 = Game.convoGet(id);
    const isNonverbal = ch.some(i => i.indexOf('nv:') === 0);
    const hangingQ = !!c2.reactiveQ || !!c2.genericQ || !!c2.pendingQ;
    const onThread = TOPIC_THREADS.indexOf(c2.thread) !== -1 || c2.thread === 'grief' || c2.thread === 'cheer';
    swept++;
    if (!isNonverbal && !hangingQ && !onThread && p2) {
      expected++;
      if (!ch.includes('teach')) sweepMisses.push(`${id.slice(0, 12)} menu=${ch.join(',')}`);
    }
    // subject picker: when teachable, "let me show you something" is a subject
    if (!isNonverbal && !hangingQ && p2) {
      const sj = ch.find(i => i === 'dlg:subject') || ch.find(i => i === 'subject');
      if (sj) {
        Game.convoTurn(id, sj);
        const picker = ids(id);
        const cP = Game.convoGet(id);
        if (cP.choosingSubject) {
          expected++;
          if (!picker.includes('teach')) sweepMisses.push(`${id.slice(0, 12)} PICKER=${picker.join(',')}`);
        }
      }
    }
    Game.endConvo(id, 'left');
  }
  console.log(`sweep: ${swept} villagers, ${expected} teachable+off-thread`);
  ok(sweepMisses.length === 0, 'teach offered everywhere teachable+off-thread (both menu paths)', sweepMisses.slice(0, 3).join(' ‖ ') || `${expected}/${expected}`);
  Game.endConvo(vid, 'left');
  console.log(`\n${A - F}/${A} assertions green`);
  if (F) process.exitCode = 1;
})().catch(e => { console.error('CRASH:', e); process.exitCode = 2; });
