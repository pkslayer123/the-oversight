// BREAK-IT knowledge: EXPLOIT (anti-player) + HONESTY — wrongTeaching wipes progress.
// BEFORE: the taught-wrong branch of wrongTeaching() REPLACES the whole
// codex.plants[pid] object — harvests, tastings, prepKnown, learned parts,
// demonstrated all reset to zero. The comment directly above it says "The
// label is wrong; the plant is still the plant (mechanics key off the real
// pid)" — the engine contradicts its own design: one bad lesson erases
// hours of handling.
// AFTER: the entry is preserved; only the label fields change.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(2202);
  G.say = () => {};
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const plants = G.data.plants;
  const pid = plants[0].id, otherPid = plants[1].id;
  const vid = G.state.village.roster.find(id => id !== G.villagerId);

  // player groundwork: L1 with real progress toward L2
  G.state.codex.plants[pid] = {
    identifiedDay: 1, level: 1, harvests: 4, tastings: 2, prepKnown: true,
    parts: { root: { known: true, how: 'shown', day: 1 } },
    demonstrated: true, demonstratedBy: 'Mara', by: 'observation',
  };
  // teacher knows it AND is wrong about it (seeded from taught[] — legal)
  const v = G.state.village;
  v.taught[vid] = [pid];
  v.wrongAbout = v.wrongAbout || {};
  v.wrongAbout[vid] = { [pid]: { wrongPid: otherPid, deliberate: false } };

  const r = G.wrongTeaching(vid, pid, 'taught');
  check('W0 wrong lesson lands (taught-wrong)', r === 'taught-wrong', `returned ${r}`);

  const e = G.state.codex.plants[pid];
  check('W1 label is wrong (wrongAs set)', e.wrongAs === plants[1].name, `wrongAs=${e.wrongAs}`);
  check('W2 harvests preserved (4, not 0)', e.harvests === 4, `harvests=${e.harvests}`);
  check('W3 tastings preserved (2, not 0)', e.tastings === 2, `tastings=${e.tastings}`);
  check('W4 prepKnown preserved', e.prepKnown === true, `prepKnown=${e.prepKnown}`);
  check('W5 learned parts preserved', !!(e.parts && e.parts.root && e.parts.root.known),
    `parts=${JSON.stringify(e.parts)}`);
  check('W6 demonstrated flag preserved', e.demonstrated === true, `demonstrated=${e.demonstrated}`);
  check('W7 level still 1', e.level === 1, `level=${e.level}`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
