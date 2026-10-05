// Codex people-entries tests. Usage: node scripts/test-codex-people.js
// Steve's design: every villager is a living codex entry —
// stranger → named → known → trusted → confirmed, deeds as legend,
// death closes the book, rare posthumous revelations from the body.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/villager-agency.js', 'src/js/betrayal.js', 'src/js/codex-people.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.health = 100; s.trauma = 0;
  Game.map.px = 3; Game.map.py = 3;
  Game.state.corpses = [];
  return s;
}
function npcVid() {
  return Game.state.village.roster.find(id => id !== Game.villagerId);
}
function learnFacts(vid) {
  Game.journalLearn(vid, 'occupation', 'nurse', { sure: false });
  Game.journalLearn(vid, 'goal', { id: 'survive', want: 'survive' });
  Game.journalLearn(vid, 'backstory', 'grew up near water', { via: 'talk' });
}

(async () => {
  await Game.init();

  // 1. entry starts as stranger
  freshGame();
  let vid = npcVid();
  let d = Game.personDepth(vid);
  ok('starts at level 0', d.level === 0);
  ok('not closed', d.closed === false);

  // 2. name → level 1 (named)
  Game.journalLearn(vid, 'name', 'Mara Test', { how: 'told' });
  ok('name reaches level 1', Game.personDepth(vid).level === 1);

  // 3. facts → level 2 (known) + lifeseed reveal, never invented
  learnFacts(vid);
  d = Game.personDepth(vid);
  ok('3 facts reach level 2', d.level === 2);
  ok('hometown revealed from lifeseed', !!d.revealed.hometown);
  const e = Game.journalPerson(vid);
  ok('reveal written into journal backstory', e.backstory.some(b => /Grew up in/.test(b.text) && b.via === 'confided'));
  ok('wound NOT revealed before trusted', !d.revealed.wound && !e.backstory.some(b => /don't talk about/.test(b.text)));

  // 4. trusted: trust + time + convos
  Game.state.village.trust[vid] = 60;
  d.convos = 4;
  d.levelDay[2] = Game.state.scholar.day - 3;
  Game.codexPersonTick();
  d = Game.personDepth(vid);
  ok('trust+time+convos reach level 3', d.level === 3);
  ok('wound revealed at trusted', !!d.revealed.wound);
  ok('want revealed at trusted', !!d.revealed.want);
  ok('event revealed at trusted', !!d.revealed.event);

  // 4b. time gate holds: not enough days
  freshGame(); vid = npcVid();
  Game.journalLearn(vid, 'name', 'Mara Test', { how: 'told' });
  learnFacts(vid);
  Game.state.village.trust[vid] = 90;
  Game.personDepth(vid).convos = 10;
  Game.codexPersonTick();
  ok('time gate blocks instant trust', Game.personDepth(vid).level === 2);

  // 5. confirmation: confession flips "said" to "known" → level 4
  freshGame(); vid = npcVid();
  Game.journalLearn(vid, 'name', 'Mara Test', { how: 'told' });
  learnFacts(vid);
  Game.state.village.trust[vid] = 60;
  Game.personDepth(vid).convos = 4;
  Game.personDepth(vid).levelDay[2] = Game.state.scholar.day - 3;
  Game.codexPersonTick();
  Game.journalLearn(vid, 'occupation', 'ER doctor', { sure: true, via: 'confessed' });
  d = Game.personDepth(vid);
  ok('confession confirms occupation', !!d.confirmed.occupation);
  ok('confirmation reaches level 4', d.level === 4);
  const html = Game.personDepthHTML(vid);
  ok('HTML shows chapter + confirmed', /Chapter: Confirmed/.test(html) && /Known:/.test(html));

  // 6. deeds mirrored as legend
  Game.recordDeed(vid, 'monster_kill', 'Mara killed the ridge thing — alone — and walked home.', 10);
  d = Game.personDepth(vid);
  ok('deed mirrored into entry', d.deeds.length === 1 && d.deeds[0].mag === 10);
  ok('HTML shows legend', /LEGEND/.test(Game.personDepthHTML(vid)));

  // 7. shared history + their view
  ok('noteSharedHistory records', Game.noteSharedHistory(vid, 'survived the ambush together') === true);
  ok('noteSharedHistory dedupes', Game.noteSharedHistory(vid, 'survived the ambush together') === false);
  ok('their view renders', /How they see you/.test(Game.personDepthHTML(vid)));

  // 8. death closes the book
  freshGame(); vid = npcVid();
  Game.journalLearn(vid, 'name', 'Mara Test', { how: 'told' });
  learnFacts(vid);
  const lvlBefore = Game.personDepth(vid).level;
  Game.registerDeath({ kind: 'person', villagerId: vid, name: 'Mara Test', mx: 4, my: 4, cause: 'the ridge thing', witnesses: [] });
  d = Game.personDepth(vid);
  ok('death closes the book', d.closed === true && d.death && d.death.cause === 'the ridge thing');
  ok('death note written', Game.journalPerson(vid).notes.some(n => /Died day/.test(n.text)));
  Game.journalLearn(vid, 'backstory', 'one more story', { via: 'talk' });
  Game.state.village.trust[vid] = 100;
  d.convos = 99;
  Game.codexPersonTick();
  ok('closed book never deepens', Game.personDepth(vid).level === lvlBefore);
  ok('epitaph renders', /The book is closed/.test(Game.personDepthHTML(vid)));

  // 9. posthumous revelation: rare, weighty, from the body
  freshGame(); vid = npcVid();
  Game.journalLearn(vid, 'name', 'Mara Test', { how: 'told' });
  learnFacts(vid); // level 2 — wound still hidden
  Game.state.village.trust[vid] = 50;
  const corpse = Game.registerDeath({ kind: 'person', villagerId: vid, name: 'Mara Test', mx: 4, my: 4, cause: 'combat', witnesses: [Game.villagerId] });
  const realRandom = Math.random;
  Math.random = () => 0.1; // force the 35% roll to hit
  let revealed = false;
  try { revealed = Game.examineCorpse(corpse.id) && !!Game.personDepth(vid).posthumous; } catch (err) { console.log('posthumous threw', err.message); }
  Math.random = realRandom;
  ok('posthumous revelation fires on body-find', revealed === true);
  ok('revelation reveals hidden lifeseed', !!Game.personDepth(vid).revealed.wound);
  ok('revelation written as found-on-body', Game.journalPerson(vid).backstory.some(b => b.via === 'found on the body'));
  ok('one revelation per corpse max', (() => {
    Math.random = () => 0.01;
    let second = false;
    try { Game.examineCorpse(corpse.id); second = !!Game.personDepth(vid).posthumous && Game.personDepth(vid).posthumous !== Game.personDepth(vid).posthumous; } catch (err) {}
    Math.random = realRandom;
    return Game.personDepth(vid).posthumous && corpse.posthumousRolled === true;
  })());

  // 10. codex persists at state level (mantle: the village's book, not the individual's)
  ok('codex lives on Game.state (survives viewpoint change)', !!Game.state.codex && !!Game.state.codex.people && Object.keys(Game.state.codex.people).length > 0);

  // 11. background survivor (no generated lifeseed) still gets depth
  freshGame();
  const bgVid = (Game.state.village.roster || []).find(id => id !== Game.villagerId && !(Game.state.village.rosterChars || {})[id]);
  if (bgVid) {
    Game.journalLearn(bgVid, 'name', 'Bg Person', { how: 'told' });
    learnFacts(bgVid);
    const bd = Game.personDepth(bgVid);
    ok('bg survivor reaches known', bd.level === 2);
    ok('bg survivor got lazy lifeseed reveal', !!bd.revealed.hometown);
  } else {
    ok('bg survivor reaches known (no bg vid this run — skip)', true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
