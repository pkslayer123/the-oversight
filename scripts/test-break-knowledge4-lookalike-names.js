// BREAK-IT knowledge 4th pass — HONESTY: examineDescription's Q3
// lookalikeNote scrub (examine.js) only removed the EXAMINED plant's own FULL
// name — but the rendered note is the FIRST sentence, and these leak true
// species names the player never learned:
//
//   american_ginseng: "Virginia creeper seedlings and young hickory sprouts
//                     fool beginners."            -> "Hickory" (of "Hickory Nuts")
//   greenbrier:       "Thorns + tendrils = greenbrier."  -> own first word
//   hickory_nut:      "Shagbark hickory is the sweet one." -> own first word
//
// All violate examine.js's own documented rule ("examine_never_names: examine
// output never contains the species name unless plantKnown").
//
// AFTER: the scrub also replaces the examined plant's first name-word (>=6
// chars) and any OTHER unknown species' full name or first name-word (>=6),
// with 'it' / 'a lookalike'. Known species keep their names (earned).
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261008, 7, 424242];

function descOf(pid) {
  const Ex = globalThis.Scattering && globalThis.Scattering.Examine;
  if (!Ex || !Ex.examineDescription) return null;
  return Ex.examineDescription(pid, 3);
}

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  G.say = () => {};
  G.state.codex.plants = {}; // nothing known
  const out = {};
  const gd = descOf('american_ginseng');
  out.ginsengClean = gd && !/hickory/i.test(gd) && /fool beginners/i.test(gd);
  const gb = descOf('greenbrier');
  out.greenbrierClean = gb && !/greenbrier/i.test(gb) && /tendrils/i.test(gb);
  const hn = descOf('hickory_nut');
  out.hickoryClean = hn && !/hickory/i.test(hn) && /sweet one/i.test(hn);
  // control: known species keep their names (earned knowledge isn't scrubbed)
  G.state.codex.plants = { hickory_nut: { level: 1 }, hickory_nuts: { level: 1 } };
  const gd2 = descOf('american_ginseng');
  out.knownKeepsName = gd2 && /hickory/i.test(gd2);
  out.detail = JSON.stringify({ gd, gb, hn }).slice(0, 220);
  return { seed, ...out };
}

async function main() {
  let fails = 0, ran = 0;
  for (const seed of SEEDS) {
    const r = await run(seed);
    ran++;
    for (const k of ['ginsengClean', 'greenbrierClean', 'hickoryClean', 'knownKeepsName']) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k} | ${r.detail || ''}`);
      if (!ok) fails++;
    }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
