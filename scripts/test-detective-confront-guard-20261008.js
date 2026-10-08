#!/usr/bin/env node
// PROOF TEST (detective playtest, 2026-10-08): confrontation identity guard.
// BREAK (demonstrated by scripts/attack-detective-20261008b.js):
//   confrontDoubt(A, dB.id) — A's id with B's doubt id — ran the full
//   confrontation against the WRONG person: A lost trust, B's doubt resolved
//   (softlocking B's detective thread: the legit call returns "Never mind."
//   forever), and confrontTheft made an INNOCENT villager confess to a theft
//   they didn't commit, on the record, in the journal.
// AFTER: mismatched vid/doubt is refused; B's thread stays alive; the
// innocent is untouched.
// Run: SEED=N node scripts/test-detective-confront-guard-20261008.js
const H = require('./harness-detective.js');
let pass = 0, fail = 0;
const t = (name, cond, detail) => { if (cond) { pass++; console.log(`[ok] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); } };

(async () => {
  await H.Game.init();
  console.log('== SEED ' + H.SEED + ' ==');
  const G = H.Game;
  H.fresh();

  // B is a liar; A is someone else.
  let B = null;
  for (const id of G.npcIds()) {
    const l = G.npcLies(id);
    if (l && Object.values(l).some(x => x && x.told && !x.confessed)) { B = id; break; }
  }
  const A = G.npcIds().find(id => id !== B);
  const lieB = Object.values(G.npcLies(B)).find(x => x && x.told && !x.confessed);
  const dB = G.addDoubt(B, 'contradiction', 'B contradiction', [`said "${lieB.told}" (day 0)`, 'now says "Y" (day 1)']);
  H.say();

  const trustA0 = (G.state.village.trust || {})[A] ?? 10;
  const r = G.confrontDoubt(A, dB.id); // HOSTILE: A's id, B's doubt
  const trustA1 = (G.state.village.trust || {})[A] ?? 10;
  H.say();

  t('cross-villager confront refused', r.ok === false, `ok=${r.ok} outcome=${r.outcome}`);
  t("B's doubt NOT resolved", dB.resolved === false, `resolved=${dB.resolved}`);
  t('A trust untouched', trustA1 === trustA0, `${trustA0} -> ${trustA1}`);
  t("B's lie not confessed by the cross call", lieB.confessed !== true);

  // the legitimate confrontation still works — B's thread is NOT softlocked
  const r2 = G.confrontDoubt(B, dB.id);
  H.say();
  t('legit confrontDoubt(B, dB.id) works', r2.ok === true && ['confessed', 'deflected', 'attacked'].includes(r2.outcome),
    `ok=${r2.ok} outcome=${r2.outcome}`);

  // theft path: accusing the wrong person of the doubt's theft
  const thief = G.npcIds()[0];
  const innocent = G.npcIds().find(id => id !== thief);
  const d = G.addDoubt(thief, 'gossip', 'theft suspicion', ['sighting at the cache']);
  d.theft = { label: 'buried rations', place: 'the north cache', day: 1 };
  const trustI0 = (G.state.village.trust || {})[innocent] ?? 10;
  const rt = G.confrontDoubt(innocent, d.id);
  const trustI1 = (G.state.village.trust || {})[innocent] ?? 10;
  H.say();
  t('cross-villager THEFT confront refused', rt.ok === false, `ok=${rt.ok} outcome=${rt.outcome}`);
  t('theft doubt NOT resolved', d.resolved === false);
  t('innocent trust untouched', trustI1 === trustI0, `${trustI0} -> ${trustI1}`);
  const memTypes = (G.state.village.memory[innocent] || []).map(m => m.t);
  t('innocent has no theft-confessed memory', !memTypes.includes('theft-confessed'), JSON.stringify(memTypes));

  // direct confrontTheft call also guarded
  const d2 = G.addDoubt(thief, 'gossip', 'theft suspicion 2', ['sighting']);
  d2.theft = { label: 'buried rations', place: 'the north cache', day: 1 };
  const rd = G.confrontTheft(innocent, d2.id);
  H.say();
  t('direct confrontTheft(innocent, d2.id) refused', rd.ok === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
