#!/usr/bin/env node
// PROOF TEST: false accusations cost trust (detective feel 2026-10-08).
// Before: confronting an innocent villager ("misunderstanding — they explained
// it") granted +3 trust — accuse-everyone was the dominant strategy,
// confrontation was risk-free.
// After: a baseless accusation stings (-2 trust, 'wrongly_accused' memory).
// Behavior doubts (real observations, no backstory lie) stay trust-neutral.
// Gossip-first lead doubts get their evidence stamped once the player's heard
// the target's own story ("heard X's own story (day N)").
// Run: node scripts/test-detective-false-accusation.js (exit 0 = pass)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Shared resettable seeded RNG, installed BEFORE eval: several modules capture
// `const R = Math.random` at load time; seeding after eval leaves those on the
// unseeded builtin and the test goes nondeterministic.
function makeSharedRng() {
  let a = 1 >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (seed) => { a = seed >>> 0; };
  return f;
}
const sharedRng = makeSharedRng();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js load-time need; deleted before play
Math.random = sharedRng; sharedRng.reset(90210);
const files = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .match(/src\/js\/[^"]*\.js/g)
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
const seen = new Set();
for (const f of files) { if (seen.has(f)) continue; seen.add(f); eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window;
const Game = globalThis.Scattering.Game;

const failures = [];
const ok = (cond, label, extra) => {
  if (cond) console.log('  PASS', label);
  else { console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); failures.push(label); }
};
const trustOf = (vid) => ((Game.state.village.trust || {})[vid]) || 10;
const memTypes = (vid) => (((Game.state.village.memory || {})[vid]) || []).map(m => m.t);

async function newSession(seed) {
  sharedRng.reset(seed);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.village.roster.filter(id => id !== Game.villagerId);
}
const innocent = (roster) => roster.find(vid => {
  const lies = Game.npcLies(vid) || {};
  return !Object.values(lies).some(l => l && l.told);
});

(async () => {
  // ---- 1. false accusation stings ----
  console.log('1. false accusation of an innocent villager');
  let roster = await newSession(111);
  const vid = innocent(roster);
  ok(!!vid, 'found a villager with no lies');
  Game.checkGossipClaim(vid, 'occupation', 'underwater basket weaver', roster[0]);
  const doubt = Game.getDoubts(vid).find(d => d.kind === 'gossip');
  ok(!!doubt, 'false gossip formed a doubt');
  const t0 = trustOf(vid);
  const r = Game.confrontDoubt(vid, doubt.id);
  ok(r.outcome === 'cleared', 'outcome is cleared, not rewarded', r.outcome);
  ok(doubt.resolved === true, 'doubt resolved');
  ok(trustOf(vid) - t0 === -2, 'trust delta is exactly -2 (was +3 before fix)', trustOf(vid) - t0);
  ok(memTypes(vid).includes('wrongly_accused'), 'wrongly_accused memory recorded', memTypes(vid).slice(-3));

  // ---- 2. behavior doubt stays neutral ----
  console.log('2. behavior doubt (real observation, no backstory lie)');
  roster = await newSession(222);
  const vid2 = innocent(roster);
  const bd = Game.addDoubt(vid2, 'behavior', 'says they want to belong but hoards', ['observed: selfish behavior']);
  const t2 = trustOf(vid2);
  const r2 = Game.confrontDoubt(vid2, bd.id);
  ok(r2.outcome === 'cleared', 'behavior doubt clears', r2.outcome);
  ok(trustOf(vid2) - t2 === 0, 'behavior doubt is trust-neutral', trustOf(vid2) - t2);
  ok(!memTypes(vid2).includes('wrongly_accused'), 'no wrongly_accused memory for a real observation');

  // ---- 3. gossip-first lead evidence gets stamped ----
  console.log('3. gossip-first lead: evidence stamped after hearing their story');
  roster = await newSession(333);
  const vid3 = innocent(roster);
  Game.checkGossipClaim(vid3, 'occupation', 'blacksmith', roster[0]); // no claim on file → lead
  const lead = Game.getDoubts(vid3).find(d => d.kind === 'gossip');
  ok(!!lead && lead.evidence.some(e => String(e).includes("haven't heard")), 'lead carries "haven\'t heard" evidence');
  Game.trackClaimSilent(vid3, 'occupation', 'miller'); // hear their story (convo path)
  ok(lead.evidence.some(e => String(e).includes("own story (day")), 'evidence stamped with heard-their-story', lead.evidence);

  // ---- 4. true positive control: real liars are NOT punished as false ----
  console.log('4. control: confronting a real liar never records wrongly_accused');
  roster = await newSession(444);
  const liar = roster.find(v => {
    const lies = Game.npcLies(v) || {};
    return Object.values(lies).some(l => l && l.told && !l.confessed);
  });
  if (liar) {
    Game.checkGossipClaim(liar, 'occupation', (Game.npcLies(liar).occupation || {}).truth || 'x', roster[0]);
    const ld = Game.getDoubts(liar).find(d => !d.resolved);
    if (ld) {
      Game.confrontDoubt(liar, ld.id);
      ok(!memTypes(liar).includes('wrongly_accused'), 'no wrongly_accused memory for a real liar');
    } else ok(true, 'no doubt formed for liar (skipped)');
  } else ok(true, 'no liar in roster (skipped)');

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
