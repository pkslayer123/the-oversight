#!/usr/bin/env node
// PROOF TEST (detective playtest, 2026-10-08): false accusations have a social cost.
// BREAK (demonstrated by scripts/attack-detective-20261008c.js):
//   truth.js promises "people remember being called a liar" and stores a
//   'wrongly_accused' memory — but convo-mood.js never read that memory kind,
//   so a baseless accusation cost 2 trust and NOTHING socially. Accuse-everyone
//   stayed near-free.
// AFTER: 'wrongly_accused' is a HURT_KIND — the relationship cools for days.
// Run: SEED=N node scripts/test-detective-wrongly-accused-20261008.js
const H = require('./harness-detective.js');
let pass = 0, fail = 0;
const t = (name, cond, detail) => { if (cond) { pass++; console.log(`[ok] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); } };

(async () => {
  await H.Game.init();
  console.log('== SEED ' + H.SEED + ' ==');
  const G = H.Game;
  H.fresh();

  let vid = null;
  for (const id of G.npcIds()) {
    const l = G.npcLies(id);
    if (l && !Object.values(l).some(x => x && x.told)) { vid = id; break; }
  }
  // a gossip doubt with evidence matching nothing real — a baseless accusation
  const d = G.addDoubt(vid, 'gossip', 'test gossip doubt', ['someone said something']);
  const mood0 = G.convoMoodReceptivity(vid);
  const r = G.confrontDoubt(vid, d.id);
  H.say();
  const mood1 = G.convoMoodReceptivity(vid);
  const memTypes = (G.state.village.memory[vid] || []).map(m => m.t);

  t('baseless accusation clears', r.outcome === 'cleared', `outcome=${r.outcome}`);
  t('wrongly_accused remembered', memTypes.includes('wrongly_accused'), JSON.stringify(memTypes));
  t('relationship cools (receptivity drops)', mood1 < mood0, `${mood0} -> ${mood1}`);
  t('doubt resolved as misunderstanding', d.resolved === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
