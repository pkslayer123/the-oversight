// Detective adversarial break-it, run 5 (2026-10-09e).
// Hostile player verbs: doubt-rot (dead men tell no tales, but their doubts
// live forever), trust-oscillation contradiction farming, windup/UI honesty.
//
// BREAKS under test (expected FAIL before the fix, PASS after):
//  S1. DOUBT ROT. Plant open doubts (contradiction + observation + theft) on
//      a villager, then remove them (killed AND fled). confrontDoubt's gone
//      guard refuses forever, observePerson refuses, no convo can exist —
//      the open doubts have NO resolution path. They sit in the journal /
//      codex as "unresolved — confront them, watch them, or ask around"
//      forever: a softlocked detective thread and a UI promise that can
//      never be kept. Fix: removing a villager closes their open doubts as
//      unanswered — the question outlives them, honestly.
//  E1. CONTRADICTION DOUBLE-NOTE. A liar heard at trust 10 (cover), 65
//      (truth — the honest branch fires a contradiction doubt), then 10
//      again (cover). The flip-flop plants TWO open contradiction doubts
//      for the same cover<->truth pair: the doubtText variants are random,
//      so addDoubt's text-keyed dedupe misses. The journal carries two
//      notes for one flip. Fix: trackClaim skips planting when an
//      unresolved contradiction doubt already covers the same pair — the
//      aha beat still fires (they really did flip again), the record stays
//      one thread.
//
// HELD (expected PASS before and after — record the target held):
//  H1. WINDUP/UI HONESTY. After the S1 fix: no open doubt may reference a
//      gone villager anywhere (getDoubts, allDoubts, doubtsHTML). The
//      "confront them, watch them, or ask around" copy only appears for
//      doubts that are actually actionable. The aha beat still fires on a
//      re-flip while the doubt count stays at one (E1's beat is kept).
'use strict';
const H = require('./harness-detective.js');
const G = H.Game;

const failures = [];
const ok = (cond, label, extra) => {
  if (cond) console.log('  PASS', label);
  else { console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); failures.push(label); }
};
const openFor = (vid) => G.getDoubts(vid).filter(d => !d.resolved);

(async () => {
  await G.init();
  H.fresh();

  // ---------- S1: doubt rot ----------
  console.log('S1: doubt rot on removal');
  const dead = G.npcIds()[0];
  const d1 = G.addDoubt(dead, 'contradiction', 'S1 contradiction', ['said "A" (day 1)', 'now says "B" (day 2)'], { field: 'occupation' });
  const d2 = G.addDoubt(dead, 'observation', 'S1 observation', ['claimed "X"', 'observed: mismatch'], { field: 'occupation' });
  const d3 = G.addDoubt(dead, 'observation', 'S1 theft', ['saw them near the cache'], { quiet: true });
  if (d3) d3.theft = { label: '3x dried meat', place: 'the wilds', day: 1, witness: 'you' };
  H.say();
  G.removeVillager(dead, 'killed');
  H.say();
  ok(openFor(dead).length === 0, 'S1 killed: no open doubts remain', openFor(dead).length);
  ok(G.confrontDoubt(dead, d1.id).ok === false, 'S1 killed: confrontation refused');

  const fled = G.npcIds()[0];
  const d4 = G.addDoubt(fled, 'gossip', 'S1 gossip lead', ['someone: the truth is "Y"', "you haven't heard their own story yet"], { field: 'origin' });
  H.say();
  G.removeVillager(fled, 'fled');
  H.say();
  ok(openFor(fled).length === 0, 'S1 fled: no open doubts remain', openFor(fled).length);

  for (let i = 0; i < 5; i++) G.endDay();
  ok(openFor(dead).length === 0 && openFor(fled).length === 0, 'S1: no open doubts after 5 days');

  // ---------- E1: contradiction double-note ----------
  console.log('E1: trust-oscillation contradiction farming');
  const vid = G.npcIds().find(id => { const l = G.npcLies(id) || {}; return l.occupation && !l.occupation.confessed; });
  ok(!!vid, 'E1: found occupation liar');
  const lie = G.npcLies(vid).occupation;
  G.state.village.trust = G.state.village.trust || {};
  G.startConvo(vid); H.say();
  G.state.village.trust[vid] = 10;
  G.convoAskTopic(vid, 'past'); H.say();                    // hears cover
  G.state.village.trust[vid] = 65;
  G.convoAskTopic(vid, 'past'); H.say();                    // hears truth -> doubt #1
  const afterFlip = openFor(vid).filter(d => d.kind === 'contradiction' && d.field === 'occupation').length;
  ok(afterFlip === 1, 'E1: one contradiction doubt after trust flip', afterFlip);
  G.state.village.trust[vid] = 10;
  G.convoAskTopic(vid, 'past'); const beat = H.say();       // hears cover again
  const afterReflip = openFor(vid).filter(d => d.kind === 'contradiction' && d.field === 'occupation').length;
  ok(afterReflip === 1, 'E1: still one contradiction doubt after re-flip (no double-note)', afterReflip);
  ok(/❓/.test(beat), 'H1: aha beat still fires on the re-flip', beat.slice(0, 120));
  console.log('  liar:', G.displayName(vid), '| cover:', lie.told, '| truth:', lie.truth);

  // ---------- H1: UI honesty ----------
  console.log('H1: windup/UI honesty');
  const goneOpen = G.allDoubts().filter(d => !d.resolved && !G.npcIds().includes(d.vid));
  ok(goneOpen.length === 0, 'H1: no open doubt references a gone villager', goneOpen.length);
  const html = G.doubtsHTML();
  const promises = (html.match(/confront them, watch them, or ask around/g) || []).length;
  const unresolved = (html.match(/unresolved/g) || []).length;
  ok(promises === unresolved, 'H1: every "unresolved" doubt is actionable (promise == unresolved count)', { promises, unresolved });

  const n = failures.length;
  console.log(n === 0 ? 'RESULT: ALL PASS' : `RESULT: ${n} FAILURES`);
  process.exit(n === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(1); });
