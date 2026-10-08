// PROOF (break-it social 2026-10-08): party.js defined betrayalState(vid)
// (per-traveler backstab state) but betrayal.js's betrayalState() (village
// plot/case state, no args) loads later and SHADOWED it. Every party call
// site (betrayalIntent, reevaluateBetrayal, betrayalCueCheck, lureCheck,
// betrayalSweep) got the SHARED village object: intent was global across
// travelers, `evaluated` never cached, and betrayalCueCheck crashed with
// TypeError on bs.cuesSeen.length once any intent was set.
// FIX: renamed to partyBetrayalState(vid) + 5 call sites.
// FAILS pre-fix (no partyBetrayalState; betrayalState(vid) returns village
// object), PASSES after.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require(path.join(ROOT, 'scripts', 'harness-detective.js'));

let pass = 0, fail = 0;
const t = (name, cond, detail) => {
  if (cond) { pass++; console.log(`[ok] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  await H.Game.init();
  const G = H.Game;
  H.fresh();
  const s = G.state.scholar;
  const v = G.state.village;
  const vids = (v.roster || []).filter(id => id !== s.villagerId);
  t('has NPC villagers', vids.length >= 2);
  const [a, b] = vids;

  // 1. the renamed per-vid state exists and is per-vid
  t('partyBetrayalState is a function', typeof G.partyBetrayalState === 'function');
  const sa = G.partyBetrayalState(a), sb = G.partyBetrayalState(b);
  t('per-vid objects are distinct', sa !== sb, sa === sb ? 'SAME OBJECT' : undefined);
  t('has cuesSeen array', Array.isArray(sa.cuesSeen) && Array.isArray(sb.cuesSeen));
  t('village betrayalState untouched', (() => {
    const vb = G.betrayalState();
    return vb && Array.isArray(vb.plots) && Array.isArray(vb.cases);
  })());

  // 2. intent is per-traveler, not global
  sa.intent = true; sa.evaluated = true;
  const sb2 = G.partyBetrayalState(b);
  t('intent does not leak across travelers', sb2.intent === false, `b.intent=${sb2.intent}`);

  // 3. betrayalIntent caches per-vid (evaluated flag works)
  H.say();
  const i1 = G.betrayalIntent(a, true);
  const st1 = G.partyBetrayalState(a);
  t('betrayalIntent sets evaluated', st1.evaluated === true);
  // force intent true on one traveler, then run the cue check: pre-fix this
  // threw TypeError (bs.cuesSeen undefined on the village object)
  st1.intent = true;
  let threw = null;
  try {
    // put both in the traveling party so the sweep sees them
    const ps = G.partyState();
    ps.party = [a, b];
    G.betrayalCueCheck(); H.say();
    G.betrayalSweep(); H.say();
  } catch (e) { threw = e.message; }
  t('betrayalCueCheck/betrayalSweep do not throw with intent set', threw === null, threw);
  t('cues recorded per-vid', st1.cuesSeen.length >= 0 && sb2.cuesSeen.length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
