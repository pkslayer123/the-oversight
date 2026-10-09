#!/usr/bin/env node
// PROOF TEST: observePerson wariness bites (detective playtest 2026-10-08d).
// Before: watching was free and traceless — no cooldown, misses wrote zero
// memories, detectChance ignored wariness. A hostile player stripped the whole
// village's backstory lies in ~22 observe calls (44 ticks), invisible.
// After: every watch writes an 'observed' memory (hit or miss), and each
// 'observed' memory in the last 14 days shaves 0.08 off detectChance (floor
// 0.05). Watching is work again — and the watched read guarded/cautious.
//
// Deterministic via pinned RNG: Math.random is pinned just under the player's
// base detectChance (base-0.04) — below base, above every penalized tier
// (base-0.08/-0.16/-0.24, floor 0.05).
//   OLD code: no penalty, misses wrote nothing — every watch hit (or the
//     wrong-stat intellect made sharp targets easier marks).
//   NEW code: exactly 1 hit, then misses; 6 memories (every watch leaves a trace).
// Run: node scripts/test-detective-observe-wariness-20261008d.js (exit 0 = pass)
const H = require('./harness-detective.js');
const G = H.Game;

const failures = [];
const ok = (cond, label, extra) => {
  if (cond) console.log('  PASS', label);
  else { console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); failures.push(label); }
};
const memTypes = (vid) => (((G.state.village.memory || {})[vid]) || []).map(m => m.t);
const observedCount = (vid) => memTypes(vid).filter(t => t === 'observed').length;

(async () => {
  await G.init();
  H.fresh();

  // find a liar with at least one unconfessed occupation/origin lie
  const liar = G.npcIds().find(vid => {
    const lies = G.npcLies(vid) || {};
    return ['occupation', 'origin'].some(f => lies[f] && !lies[f].confessed);
  });
  ok(!!liar, 'found a liar to watch', G.npcIds().length + ' villagers');
  if (!liar) { console.log('RESULT: 1 FAILURES'); process.exit(1); }
  const fields = ['occupation', 'origin'].filter(f => { const l = (G.npcLies(liar) || {})[f]; return l && !l.confessed; });
  console.log('  subject:', G.displayName(liar), '| lie fields:', fields.join(','));

  // pin the RNG just under the player's base detectChance: below base, above
  // every penalized tier (base-0.08/-0.16/-0.24, floor 0.05). Base depends on
  // the OBSERVER's (player's) intellect — compute it like observePerson does.
  const pIntel = (G.npcIntel(G.villagerId) || {}).primary || 'steady';
  const bonus = pIntel === 'observant' ? 0.25 : pIntel === 'social' ? 0.15 : pIntel === 'analytical' ? 0.10 : 0;
  const base = 0.30 + bonus;
  console.log('  player intellect:', pIntel, '| base detectChance:', base.toFixed(2));
  const realRandom = Math.random;
  Math.random = () => base - 0.04;

  let hits = 0;
  for (let i = 0; i < 6; i++) {
    const r = G.observePerson(liar);
    if (r && r.found) hits++;
  }
  Math.random = realRandom;

  console.log('  hits in 6 watches (pinned base-0.04):', hits, '| observed memories:', observedCount(liar));
  ok(hits === 1, 'wariness penalty binds: exactly 1 hit, then misses (old code: 6 hits)', { hits });
  ok(observedCount(liar) === 6, 'every watch leaves a trace, hit or miss (old code: 1)', { n: observedCount(liar) });

  // an innocent watched repeatedly: misses still leave traces
  const innocent = G.npcIds().find(vid => vid !== liar && !['occupation', 'origin'].some(f => { const l = (G.npcLies(vid) || {})[f]; return l && !l.confessed; }));
  if (innocent) {
    const before = observedCount(innocent);
    Math.random = () => 0.99; // force misses
    for (let i = 0; i < 3; i++) G.observePerson(innocent);
    Math.random = realRandom;
    ok(observedCount(innocent) === before + 3, 'misses write observed memories too', { before, after: observedCount(innocent) });
  }

  // wariness is now mechanically visible: 3+ observed memories -> drift wariness >= 2
  // (drift recomputes daily; count the memories directly — same 14d window the code uses)
  const day = (G.state.scholar || {}).day || 1;
  const recent = (((G.state.village || {}).memory || {})[liar] || []).filter(m => m.t === 'observed' && day - (m.day || 0) <= 14).length;
  ok(recent >= 3, 'spam accumulates toward the wariness cap (min 3)', { recent });

  console.log(failures.length ? `\nRESULT: ${failures.length} FAILURES` : '\nALL GREEN');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
