#!/usr/bin/env node
// ATTACK SCRIPT (detective playtest, 2026-10-08): hostile player vs the lie system.
// Run: SEED=N node scripts/attack-detective-20261008b.js
// Each attack prints what the engine actually did — breaks confirmed by observation.
const H = require('./harness-detective.js');
const G = H.Game;

function section(s) { console.log('\n===== ' + s + ' ====='); H.say(); }

// find an honest NPC (no lies) and a lying NPC
function honestNpc() {
  for (const id of G.npcIds()) { const l = G.npcLies(id); if (l && !Object.values(l).some(x => x && x.told)) return id; }
  return null;
}
function lyingNpc() {
  for (const id of G.npcIds()) { const l = G.npcLies(id); if (l && Object.values(l).some(x => x && x.told && !x.confessed)) return id; }
  return null;
}

(async () => {
  await G.init();
  console.log('== SEED ' + H.SEED + ' ==');
  H.fresh();

  // ---------- ATTACK 1: false rumor = free rep destruction + trust farm ----------
  section('ATTACK 1: false rumor about an HONEST villager');
  {
    const s = H.fresh();
    const target = honestNpc();
    const listener = G.npcIds().find(id => id !== target);
    console.log('target (honest):', G.displayName(target), '| lies:', JSON.stringify(G.npcLies(target)));
    console.log('listener:', G.displayName(listener));
    const repBefore = JSON.stringify(G.repOf(target));
    const trustBefore = (G.state.village.trust || {})[listener] ?? 10;
    const playerRepBefore = JSON.stringify(G.repOf(G.villagerId));
    // player invents 'untrustworthy' from nothing — the UI frames it as "I heard something"
    const g = G.spreadRumor(target, 'untrustworthy', listener);
    console.log('spreadRumor returned:', g ? 'gossip object' : null, '| player line shown above');
    const trustAfterSpread = (G.state.village.trust || {})[listener] ?? 10;
    // resolveConsequence path in conversation gives +2; call spreadGossip to make it travel
    for (let i = 0; i < 6; i++) G.spreadGossip();
    const repAfter = JSON.stringify(G.repOf(target));
    const playerRepAfter = JSON.stringify(G.repOf(G.villagerId));
    console.log('target rep before:', repBefore);
    console.log('target rep after 6 gossip ticks:', repAfter);
    console.log('listener trust toward player:', trustBefore, '->', trustAfterSpread, '(spreadRumor itself; convo path adds +2 more)');
    console.log('player rep before:', playerRepBefore);
    console.log('player rep after:', playerRepAfter);
    // who got blamed? check 'rumor_about_them' memories
    const blamed = [];
    for (const id of G.state.village.roster) {
      for (const m of (G.state.village.memory[id] || [])) {
        if (m.t === 'rumor_about_them') blamed.push([G.displayName(id), m.note]);
      }
    }
    console.log('rumor_about_them memories (who was blamed):', JSON.stringify(blamed));
    console.log('player started_rumor memories (on player, never read):',
      JSON.stringify((G.state.village.memory[G.villagerId] || []).filter(m => m.t === 'started_rumor').map(m => m.note)));
    H.say();
  }

  // ---------- ATTACK 2: false accusation cost ----------
  section('ATTACK 2: confront an HONEST villager (no lie behind the doubt)');
  {
    const s = H.fresh();
    const vid = honestNpc();
    console.log('subject (honest):', G.displayName(vid));
    // behavior doubt: a real observation, no lie — confronting is an accusation
    const d = G.addDoubt(vid, 'behavior', 'test doubt', ['observed: selfish behavior']);
    const trustBefore = (G.state.village.trust || {})[vid] ?? 10;
    const moodBefore = G.convoMoodReceptivity(vid);
    const r = G.confrontDoubt(vid, d.id);
    const trustAfter = (G.state.village.trust || {})[vid] ?? 10;
    const moodAfter = G.convoMoodReceptivity(vid);
    console.log('outcome:', r.outcome, '| line:', r.line.slice(0, 80));
    console.log('trust:', trustBefore, '->', trustAfter);
    console.log('mood receptivity:', moodBefore, '->', moodAfter);
    console.log('wrongly_accused memories:', JSON.stringify((G.state.village.memory[vid] || []).filter(m => m.t === 'wrongly_accused')));
    console.log('is wrongly_accused in HURT_KINDS?', 'check convo-mood.js (expect NO)');
    H.say();
  }

  // ---------- ATTACK 3: cross-villager confrontation ----------
  section('ATTACK 3: confront villager A with villager B\'s doubt');
  {
    const s = H.fresh();
    const B = lyingNpc();
    const A = G.npcIds().find(id => id !== B);
    const liesB = G.npcLies(B);
    const lieB = Object.values(liesB).find(x => x && x.told && !x.confessed);
    console.log('B (liar):', G.displayName(B), '| lie:', lieB.field, 'told=' + lieB.told);
    console.log('A:', G.displayName(A));
    // B's doubt, with evidence naming B's cover
    const dB = G.addDoubt(B, 'contradiction', 'B contradiction', [`said "${lieB.told}" (day 0)`, `now says "X" (day 1)`]);
    console.log('doubt dB.vid === B:', dB.vid === B);
    const trustABefore = (G.state.village.trust || {})[A] ?? 10;
    const trustBBefore = (G.state.village.trust || {})[B] ?? 10;
    // HOSTILE: call confrontDoubt with A's id but B's doubt id
    const r = G.confrontDoubt(A, dB.id);
    const trustAAfter = (G.state.village.trust || {})[A] ?? 10;
    const trustBAfter = (G.state.village.trust || {})[B] ?? 10;
    console.log('confrontDoubt(A, dB.id) => ok:', r.ok, 'outcome:', r.outcome);
    console.log('A trust:', trustABefore, '->', trustAAfter, '| B trust:', trustBBefore, '->', trustBAfter);
    console.log('dB.resolved (B\'s thread now dead?):', dB.resolved);
    console.log('B\'s lie confessed?', lieB.confessed === true ? 'YES (wrong person confessed!)' : 'no');
    const liesA = G.npcLies(A) || {};
    console.log('A\'s lies confessed?', Object.values(liesA).some(x => x && x.confessed) ? 'YES' : 'no');
    // now try the legitimate confrontation — is B's thread softlocked?
    const r2 = G.confrontDoubt(B, dB.id);
    console.log('legit confrontDoubt(B, dB.id) after:', JSON.stringify({ ok: r2.ok, line: r2.line, outcome: r2.outcome }));
    H.say();
  }

  // ---------- ATTACK 4: theft accusation against the wrong person ----------
  section('ATTACK 4: confrontTheft on a villager who is NOT the doubt\'s thief');
  {
    const s = H.fresh();
    const thief = G.npcIds()[0];
    const innocent = G.npcIds()[1];
    const d = G.addDoubt(thief, 'gossip', 'theft suspicion', ['sighting at the cache']);
    d.theft = { label: 'buried rations', place: 'the north cache', day: 1 };
    const trustBefore = (G.state.village.trust || {})[innocent] ?? 10;
    const r = G.confrontDoubt(innocent, d.id); // wrong person!
    const trustAfter = (G.state.village.trust || {})[innocent] ?? 10;
    console.log('confrontDoubt(innocent, theftDoubt) => ok:', r.ok, 'outcome:', r.outcome);
    console.log('innocent trust:', trustBefore, '->', trustAfter);
    console.log('doubt resolved:', d.resolved, '| journal entry victim:', '(see log)');
    H.say();
  }

  console.log('\nDONE');
})();
