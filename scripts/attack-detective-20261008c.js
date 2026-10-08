#!/usr/bin/env node
// ATTACK SCRIPT 2 (detective playtest, 2026-10-08): follow-up attacks.
// Run: SEED=N node scripts/attack-detective-20261008c.js
const H = require('./harness-detective.js');
const G = H.Game;
function section(s) { console.log('\n===== ' + s + ' ====='); H.say(); }
function honestNpc() {
  for (const id of G.npcIds()) { const l = G.npcLies(id); if (l && !Object.values(l).some(x => x && x.told)) return id; }
  return null;
}

(async () => {
  await G.init();
  console.log('== SEED ' + H.SEED + ' ==');
  H.fresh();

  // ---------- ATTACK 2b: false accusation via gossip doubt on honest villager ----------
  section('ATTACK 2b: gossip-doubt confrontation of an HONEST villager');
  {
    const s = H.fresh();
    const vid = honestNpc();
    console.log('subject (honest):', G.displayName(vid), '| lies:', JSON.stringify(G.npcLies(vid)));
    // a gossip doubt whose evidence matches nothing real — a baseless accusation
    const d = G.addDoubt(vid, 'gossip', 'test gossip doubt', ['someone said something']);
    const trustBefore = (G.state.village.trust || {})[vid] ?? 10;
    const moodBefore = G.convoMoodReceptivity(vid);
    const r = G.confrontDoubt(vid, d.id);
    const trustAfter = (G.state.village.trust || {})[vid] ?? 10;
    const moodAfter = G.convoMoodReceptivity(vid);
    console.log('outcome:', r.outcome);
    console.log('trust:', trustBefore, '->', trustAfter, '(expect -2)');
    console.log('mood receptivity:', moodBefore, '->', moodAfter, '(wrongly_accused NOT in HURT_KINDS => expect 0 change)');
    console.log('memories:', JSON.stringify((G.state.village.memory[vid] || []).map(m => m.t)));
    // recovery: how fast is -2 regained? one gift
    G.bumpTrust(vid, 2);
    console.log('after one +2 bump:', (G.state.village.trust || {})[vid]);
    H.say();
  }

  // ---------- ATTACK 5: duplicate rumor = +2 trust with no rumor spread ----------
  section('ATTACK 5: repeat the same rumor in a fresh convo (dedupe path)');
  {
    const s = H.fresh();
    const vid = G.npcIds()[0];
    const target = G.npcIds().find(id => id !== vid);
    const trustOf = () => (G.state.village.trust || {})[vid] ?? 10;
    const runRumorThread = () => {
      G.startConvo(vid); H.say();
      G.convoTurn(vid, 'ask:spread_rumor'); H.say();
      G.convoTurn(vid, 'rumor:tgt:' + target); H.say();
      const r = G.convoTurn(vid, 'rumor:type:untrustworthy');
      const out = H.say();
      try { G.endConvo(vid, 'left'); } catch (e) {}
      H.say();
      return out;
    };
    console.log('listener:', G.displayName(vid), '| target:', G.displayName(target));
    console.log('trust before:', trustOf());
    const out1 = runRumorThread();
    console.log('trust after 1st rumor:', trustOf());
    console.log('1st thread tail:', JSON.stringify(out1.slice(-160)));
    const out2 = runRumorThread();
    console.log('trust after 2nd (DUPLICATE) rumor:', trustOf(), '<- +2 again for nothing?');
    console.log('2nd thread tail:', JSON.stringify(out2.slice(-220)));
    const nGossip = (G.state.village.gossip || []).filter(g => g.playerRumor).length;
    console.log('player rumors in system:', nGossip, '(dedupe => expect 1)');
    H.say();
  }

  // ---------- ATTACK 6: wrong-person CONFESSION via cross doubt (multi-attempt) ----------
  section('ATTACK 6: cross-villager doubt — can A confess to B\'s evidence?');
  {
    const s = H.fresh();
    // force B to be a liar with a live lie; A honest-ish
    let B = null, A = null;
    for (const id of G.npcIds()) {
      const l = G.npcLies(id);
      if (!B && l && Object.values(l).some(x => x && x.told && !x.confessed)) B = id;
    }
    A = G.npcIds().find(id => id !== B);
    const lieB = Object.values(G.npcLies(B)).find(x => x && x.told && !x.confessed);
    console.log('B:', G.displayName(B), 'lie:', lieB.field, lieB.told, '| A:', G.displayName(A));
    // try several seeds of the confrontation roll by re-creating the doubt
    let confessedWrong = 0, trials = 0;
    for (let i = 0; i < 12; i++) {
      const d = G.addDoubt(B, 'contradiction', 'x', [`said "${lieB.told}" (day 0)`, 'now says "Y" (day 1)']);
      const r = G.confrontDoubt(A, d.id);
      trials++;
      if (r.outcome === 'confessed') confessedWrong++;
      // reset: unresolve B's doubt is impossible — use fresh doubt each time; A state persists
    }
    console.log(`A confessed to B's evidence in ${confessedWrong}/${trials} trials`);
    H.say();
  }

  console.log('\nDONE');
})();
