// People journal test: facts fill in as you learn them
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

async function main() {
  const Game = globalThis.Scattering.Game;
  await Game.init();

  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; }
    else { fail++; console.log('  FAIL: ' + name); }
  };

  Game.newGame('Chicago, Illinois', null, null);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  t('roster has NPCs', roster.length >= 5);
  const vid = roster[0];

  // --- 1. entry creation ---
  console.log('1. entry');
  const e0 = Game.journalPerson(vid);
  t('entry created', !!e0 && e0.vid === vid);
  t('name unknown initially', e0.name === null);
  t('goal unknown initially', e0.goal === null);

  // --- 2. name via revealName ---
  console.log('2. name');
  const logBefore = Game.log.length;
  const r = Game.revealName(vid, 'intro');
  t('revealName worked', r === true);
  const e1 = Game.journalPerson(vid);
  t('name learned', !!e1.name && e1.name.value.length > 0);
  t('name how recorded', e1.name.how === 'they told me');
  t('noted feedback in log', Game.log.length > logBefore && Game.log.some(l => l.indexOf('📓') !== -1));
  t('second revealName no-op', Game.revealName(vid, 'intro') === false);

  // --- 3. goal via conversation ---
  console.log('3. goal');
  Game.convoAskTopic(vid, 'goal');
  const e2 = Game.journalPerson(vid);
  t('goal learned', !!e2.goal && !!e2.goal.id);
  t('goal want filled', !!e2.goal.want);

  // --- 4. past via conversation ---
  console.log('4. past');
  Game.convoAskTopic(vid, 'past');
  const e3 = Game.journalPerson(vid);
  const vp = Game.vpOf(vid);
  if (vp.formerOccupation) {
    t('occupation learned', !!e3.occupation && e3.occupation.value === vp.formerOccupation);
    t('occupation sure (they told you)', e3.occupation.sure === true);
  } else t('occupation learned (no occ data)', true);
  if (vp.homeRegion) t('backstory snippet', e3.backstory.length > 0);

  // --- 5. language via first conversation ---
  console.log('5. language');
  const vid2 = roster[1];
  Game.startConvo(vid2);
  const e4 = Game.journalPerson(vid2);
  t('language learned on first convo', e4.languages.length > 0);
  Game.convoTurn(vid2, 'leave');

  // --- 6. promises ---
  console.log('6. promises');
  Game.convoAskTopic(vid, 'goal'); // ensure goal known
  const pr = Game.promiseHelp(vid);
  const e5 = Game.journalPerson(vid);
  t('promise recorded as open', e5.promises.length > 0 && e5.promises[0].status === 'open');

  // --- 7. dedupe ---
  console.log('7. dedupe');
  const dup = Game.journalLearn(vid, 'goal', { id: e2.goal.id, want: e2.goal.want });
  t('re-learning same goal returns false', dup === false);

  // --- 8. peopleJournal listing ---
  console.log('8. listing');
  const list = Game.peopleJournal();
  t('lists roster NPCs', list.length === roster.length);
  t('entries have vids', list.every(x => !!x.vid && !!x.e));

  // --- 9. uncertainty ---
  console.log('9. uncertainty');
  const vid3 = roster[2];
  Game.journalLearn(vid3, 'occupation', 'nurse', { sure: false });
  const e6 = Game.journalPerson(vid3);
  t('unsure occupation stored', e6.occupation.value === 'nurse' && e6.occupation.sure === false);
  Game.journalLearn(vid3, 'occupation', 'nurse', { sure: true });
  t('sure fact upgrades unsure one', Game.journalPerson(vid3).occupation.sure === true);

  // --- 10. traits via observation ---
  console.log('10. traits');
  Game.journalLearn(vid, 'trait', 'Seems generous.', { via: 'observed', sure: true });
  t('trait recorded', Game.journalPerson(vid).traits.length > 0);

  // --- 11. persistence shape ---
  console.log('11. persistence');
  let jsonOk = false;
  try { JSON.parse(JSON.stringify(Game.state.codex.people)); jsonOk = true; } catch (e) {}
  t('journal serializes cleanly', jsonOk);

  // --- 12. pre/post System voice ---
  console.log('12. voice');
  t('journalName pre-System is Journal', Game.journalName() === 'Journal');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('THROW:', e); process.exit(2); });
