// BREAK-IT knowledge: HONESTY — fireside wrong-teaching doesn't do what the comment says.
// BEFORE: firesideTeaching()'s comment says "villagers who don't know better
// learn it wrong" — but the code only adds pid to their taught[] (they learn
// it RIGHT, mechanically) and says nothing at the fire. The wrongness never
// propagates: a villager "taught wrong" later teaches the player the CORRECT
// name. Copy vs engine.
// AFTER: learners' wrongAbout records the false name (it travels when they
// teach it on), and the fire beat is narrated honestly.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(4404);
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const v = G.state.village;
  const plants = G.data.plants;
  const pid = plants[5].id, wrongPid = plants[6].id;
  const teacher = v.roster.find(id => id !== G.villagerId);
  const learner = v.roster.find(id => id !== G.villagerId && id !== teacher);

  v.sharedKnowledge = v.sharedKnowledge || {};
  v.sharedKnowledge[pid] = { taughtAround: false, discoveredBy: teacher, identifiedDay: 1 };
  v.taught[teacher] = [pid];
  G.villagerWrongAbout(teacher)[pid] = { wrongPid, deliberate: false };

  // deterministic fire: only one lesson candidate, Math.random -> 0
  const realRandom = Math.random;
  Math.random = () => 0;
  try { G.firesideTeaching(true); } finally { Math.random = realRandom; }

  check('F0 lesson happened (taughtAround)', v.sharedKnowledge[pid].taughtAround === true);
  check('F1 learner learned the plant', (v.taught[learner] || []).includes(pid),
    `taught=${JSON.stringify(v.taught[learner] || []).slice(0, 60)}`);

  const lw = G.villagerWrongAbout(learner)[pid];
  check('F2 learner learned it WRONG (wrongness propagated)',
    !!(lw && lw.wrongPid === wrongPid), `wrongAbout=${JSON.stringify(lw)}`);
  check('F2b learner is not marked a deliberate liar', !!(lw && lw.deliberate === false));

  const wname = plants.find(p => p.id === wrongPid).name;
  check('F3 fire beat narrates the wrong name honestly',
    sayLog.some(m => /fire/i.test(m) && m.includes(wname)), sayLog.slice(-2).join(' | ').slice(0, 160));

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
