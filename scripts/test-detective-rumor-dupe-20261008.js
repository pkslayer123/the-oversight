#!/usr/bin/env node
// PROOF TEST (detective playtest, 2026-10-08): duplicate rumors pay nothing.
// BREAK (demonstrated by scripts/attack-detective-20261008c.js):
//   spreadRumor dedupes per (day-part, target) — "You've already started that
//   rumor" — but the conversation handler still fired the full intimacy
//   reward (+trust, 'you_told_rumor' memory, socialTick) on the duplicate
//   path. Repeating the same rumor in every fresh conversation farmed trust
//   for nothing. The fallback line also contradicted the dedupe line:
//   "It's out there." followed by "Hmm. No one's around to hear that yet."
// AFTER: no rumor spread -> no reward; the fallback line agrees it's out there.
// Run: SEED=N node scripts/test-detective-rumor-dupe-20261008.js
const H = require('./harness-detective.js');
let pass = 0, fail = 0;
const t = (name, cond, detail) => { if (cond) { pass++; console.log(`[ok] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); } };

(async () => {
  await H.Game.init();
  console.log('== SEED ' + H.SEED + ' ==');
  const G = H.Game;
  H.fresh();

  const vid = G.npcIds()[0];
  const target = G.npcIds().find(id => id !== vid);
  const rumorMems = () => (G.state.village.memory[vid] || []).filter(m => m.t === 'you_told_rumor').length;
  const runThread = () => {
    G.startConvo(vid); H.say();
    G.convoTurn(vid, 'ask:spread_rumor'); H.say();
    G.convoTurn(vid, 'rumor:tgt:' + target); H.say();
    G.convoTurn(vid, 'rumor:type:untrustworthy');
    const out = H.say();
    try { G.endConvo(vid, 'left'); } catch (e) {}
    H.say();
    return out;
  };

  const out1 = runThread();
  const mems1 = rumorMems();
  const nRumor1 = (G.state.village.gossip || []).filter(g => g.playerRumor).length;
  const out2 = runThread(); // same target+type, same day-part -> dedupe path
  const mems2 = rumorMems();
  const nRumor2 = (G.state.village.gossip || []).filter(g => g.playerRumor).length;

  t('first rumor spreads', nRumor1 === 1, `rumors=${nRumor1}`);
  t('first rumor rewarded (memory)', mems1 === 1, `mems=${mems1}`);
  t('duplicate spreads nothing new', nRumor2 === 1, `rumors=${nRumor2}`);
  t('duplicate pays no intimacy reward', mems2 === 1, `you_told_rumor mems: ${mems1} -> ${mems2}`);
  t('duplicate line is honest (already out there)', !out2.includes("No one's around to hear that yet"),
    JSON.stringify(out2.slice(-120)));
  t('first thread said the rumor line', out1.includes("can't be trusted") || out1.includes('telling people'),
    JSON.stringify(out1.slice(-80)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
