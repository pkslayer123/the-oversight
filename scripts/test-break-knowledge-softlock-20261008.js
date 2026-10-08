// BREAK-IT knowledge: SOFTLOCK — every knowledge state must have a way out.
// - taught-wrong entries: harvest-5 handling converts wrongAs -> contested
//   (the record corrects); contested -> callOutTeaching resolves.
// - monster naming: seedMonsterNames starts a debate (never silent-stuck);
//   monsterNamingCheck converges on majority -> villageName; namingActive clears.
// - identifyPlant is idempotent (no dup entries, no double rewards).
// - journal/codex read surfaces agree after every transition.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(6606);
  G.say = () => {};
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const plants = G.data.plants;
  const pid = plants[10].id, otherPid = plants[11].id;
  const v = G.state.village;
  const vid = v.roster.find(id => id !== G.villagerId);

  // idempotent identify
  check('S0 first identify succeeds', G.identifyPlant(pid, 'observation') === true);
  const keysBefore = Object.keys(G.state.codex.plants).length;
  check('S0b second identify refuses (no dup)', G.identifyPlant(pid, 'observation') === false);
  check('S0c no duplicate entry', Object.keys(G.state.codex.plants).length === keysBefore);

  // read surfaces agree
  const line = G.codexPlantLine(pid), pj = G.plantJournalEntry(pid), gaps = G.knowledgeGaps(pid);
  check('S1 codexPlantLine agrees (L1, true name)', !!line && line.includes('L1') && line.includes(plants[10].name),
    (line || '').slice(0, 80));
  check('S1b plantJournalEntry agrees (non-null at L1)', !!pj && pj.pid === pid);
  check('S1c knowledgeGaps honest (non-empty at L1)', Array.isArray(gaps) && gaps.length > 0);

  // wrongAs -> contested -> resolved: the full way out
  v.taught[vid] = [otherPid];
  G.villagerWrongAbout(vid)[otherPid] = { wrongPid: pid, deliberate: false };
  // player knows otherPid at L2 -> contested branch
  G.state.codex.plants[otherPid] = { identifiedDay: 1, level: 2, harvests: 5, tastings: 0 };
  const wt = G.wrongTeaching(vid, otherPid, 'taught');
  check('S2 knowledge protects: contested, not fooled', wt === 'contested', `returned ${wt}`);
  check('S2b contested recorded', (G.hasContestedWith(vid) || []).includes(otherPid));
  check('S2c callout resolves it', G.callOutTeaching(vid, otherPid, {}) === true);
  check('S2d no longer contested', (G.hasContestedWith(vid) || []).length === 0);

  // monster naming: debate starts, converges, clears
  const mid = (G.data.monsters || [])[0].id;
  G.kickMonsterNaming(mid); // the real path: sets namingKicked, then seeds
  const me = G.state.codex.monsters[mid];
  check('S3 naming debate started (proposals exist)', Object.keys(me.proposals || {}).length > 0);
  check('S3b namingActive while undecided', G.monsterNamingActive() === true);
  // village converges: majority backs one name
  const names = Object.values(me.proposals);
  const winner = names[0];
  v.roster.slice(0, 7).forEach(rid => { me.proposals[rid] = winner; });
  G.monsterNamingCheck(mid);
  check('S4 majority converges to a village name', me.villageName === winner, `villageName=${me.villageName}`);
  check('S4b namingActive clears after naming', G.monsterNamingActive() === false);
  check('S4c display name follows the village name', G.monsterDisplayName(mid) === winner);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
