#!/usr/bin/env node
// PROOF TEST (detective playtest, 2026-10-08): traced player rumors cost the player.
// BREAK (demonstrated by scripts/attack-detective-20261008b.js):
//   spreadRumor's own comment promises "If caught lying, the player's
//   reputation tanks" — but the trace in spreadGossip blamed an innocent NPC
//   repeater (raw id in the note: "traced to gen_xxxx") and cost the player
//   NOTHING: player rep 0 -> 0 while the target's honest rep went 0 -> -24.
//   False rumors were free reputation destruction.
// AFTER: when the first hearer (the one you told directly) is the teller,
//   the subject traces the rumor to YOU: player honest/trustworthy rep drops
//   and the subject's trust in you drops.
// Determinism: Math.random is pinned to 0.0 for the single spreadGossip tick
// (every probabilistic check fires); restored immediately after.
// Run: SEED=N node scripts/test-detective-rumor-trace-20261008.js
const H = require('./harness-detective.js');
let pass = 0, fail = 0;
const t = (name, cond, detail) => { if (cond) { pass++; console.log(`[ok] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); } };

(async () => {
  await H.Game.init();
  console.log('== SEED ' + H.SEED + ' ==');
  const G = H.Game;
  H.fresh();

  let target = null;
  for (const id of G.npcIds()) {
    const l = G.npcLies(id);
    if (l && !Object.values(l).some(x => x && x.told)) { target = id; break; }
  }
  const listener = G.npcIds().find(id => id !== target);
  const g = G.spreadRumor(target, 'untrustworthy', listener);
  H.say();
  t('rumor seeded with listener as first hearer', !!(g && g.heard[0] === listener));

  const trust0 = (G.state.village.trust || {})[target] ?? 10;
  const repH0 = (G.repOf(G.villagerId).honest || 0);
  const repT0 = (G.repOf(G.villagerId).trustworthy || 0);

  const realRandom = Math.random;
  Math.random = () => 0.0; // every probabilistic check fires this tick
  try { G.spreadGossip(); } finally { Math.random = realRandom; }
  H.say();

  const trust1 = (G.state.village.trust || {})[target] ?? 10;
  const repH1 = (G.repOf(G.villagerId).honest || 0);
  const repT1 = (G.repOf(G.villagerId).trustworthy || 0);
  const traces = (G.state.village.memory[target] || []).filter(m => m.t === 'rumor_about_them');
  const note = traces.length ? traces[traces.length - 1].note : '';

  t('trace fired on the subject', traces.length > 0, `traces=${traces.length}`);
  t('trace names the player, not an NPC id', /traced to you/.test(note), JSON.stringify(note));
  t('player honest rep tanked', repH1 < repH0, `${repH0} -> ${repH1}`);
  t('player trustworthy rep tanked', repT1 < repT0, `${repT0} -> ${repT1}`);
  t('subject trust in player dropped', trust1 < trust0, `${trust0} -> ${trust1}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
