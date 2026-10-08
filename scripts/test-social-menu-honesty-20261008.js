// HONESTY SWEEP (break-it social 2026-10-08): every conversation menu choice
// id produced by buildMenu must dispatch to a handler in convoTurn without
// throwing, and the resulting state must be sane (non-empty menu or ended).
// Only CURRENT-menu ids are exercised (the real UI contract).
// Also asserts: endConvo('natural') completes (was: ReferenceError `t is not
// defined` at conversation.js endConvo — every natural conversation end
// threw, skipping the exit line, mood goodbye, and coherence close-beat).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require(path.join(ROOT, 'scripts', 'harness-detective.js'));

let pass = 0, fail = 0;
const t = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  await H.Game.init();
  const G = H.Game;
  H.fresh();
  const s = G.state.scholar;
  const v = G.state.village;
  const vids = (v.roster || []).filter(id => id !== s.villagerId).slice(0, 5);
  t('has NPC villagers', vids.length > 0);

  const seen = new Set();
  const problems = [];
  for (const vid of vids) {
    try { G.startConvo(vid); H.say(); } catch (e) { problems.push(`startConvo(${vid}): ${e.message}`); continue; }
    for (let turn = 0; turn < 8; turn++) {
      let menu;
      try { menu = G.convoChoices(vid) || []; } catch (e) { problems.push(`convoChoices(${vid}): ${e.message}`); break; }
      if (!menu.length) { problems.push(`empty menu ${vid} turn ${turn}`); break; }
      for (const ch of menu) {
        const key = ch.id;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        let r;
        try { r = G.convoTurn(vid, key); H.say(); }
        catch (e) { problems.push(`${key} THREW: ${e.message}`); continue; }
        const sane = !r || r.ended || r.over || ((r.choices || []).length > 0);
        if (!sane) problems.push(`${key} -> empty non-ended menu`);
        if (r && (r.ended || r.over)) break; // convo over; stop feeding this thread
      }
      const st = G.convoGet(vid);
      if (!st || !st.active) break;
    }
    try { if (G.convoGet(vid) && G.convoGet(vid).active) G.endConvo(vid, 'left'); } catch (e) {}
    H.say();
  }
  t('no choice id threw or dead-ended', problems.length === 0, problems.slice(0, 6).join(' | '));
  t('exercised a decent spread of choice ids', seen.size >= 5, `seen ${seen.size}`);

  // endConvo natural path must complete and return ended:true
  const vid2 = vids[0];
  G.startConvo(vid2); H.say();
  let endRet = null, endErr = null;
  try { endRet = G.endConvo(vid2, 'natural'); H.say(); } catch (e) { endErr = e.message; }
  t('endConvo(natural) does not throw', endErr === null, endErr);
  t('endConvo(natural) returns ended:true', !!(endRet && endRet.ended), JSON.stringify(endRet && Object.keys(endRet)));
  t('endConvo(natural) returns a goodbye line', !!(endRet && endRet.line), endRet && endRet.line);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
