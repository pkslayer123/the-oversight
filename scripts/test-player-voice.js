// Player voice test. Usage: node scripts/test-player-voice.js
// Steve's law (2026-10-06): every player is a completely unique person, and
// not the same person run to run. Choice labels must draw from the player
// character's generated identity (temperament, occupation) — a gruff
// ex-soldier and a nervous teenager must not "say" the same choices.
// Also tests the trust-tier register (new/warm/close) and the moment-aware
// continuers (convoMoreLabel).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js', 'src/js/convo-mood.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}

function setPlayerIdentity(temperament, occName, age) {
  const rc = (Game.state.village.rosterChars || {})[Game.villagerId] || {};
  rc.personality = rc.personality || {};
  rc.personality.temperament = temperament;
  rc.formerOccupation = occName;
  rc.age = age;
  return Game.playerVoice();
}

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  if (!vid) { console.log('FAIL: no villagers'); process.exit(1); }

  console.log('=== 1. playerVoice reads the player character ===');
  let pv = setPlayerIdentity('bold', 'army medic', 42);
  ok('blunt voice class for bold', pv.voiceClass === 'blunt');
  ok('medicinal tag found', pv.occTags.indexOf('medicinal') !== -1);
  pv = setPlayerIdentity('gentle', 'line cook', 19);
  ok('soft voice class for gentle', pv.voiceClass === 'soft');
  ok('food tag found', pv.occTags.indexOf('food') !== -1);
  pv = setPlayerIdentity('dry', 'accountant', 55);
  ok('dry voice class', pv.voiceClass === 'dry');
  ok('no tags for accountant', pv.occTags.length === 0);
  pv = setPlayerIdentity('steady', 'teacher', 35);
  ok('plain voice class for steady', pv.voiceClass === 'plain');

  console.log('\n=== 2. Same villager, different player, different voice ===');
  // blunt ex-medic vs soft young cook ask the same topic
  setPlayerIdentity('prickly', 'army medic', 45);
  const bluntVillage = Game.convoLabel(vid, 'village');
  setPlayerIdentity('gentle', 'poet', 22);
  const softVillage = Game.convoLabel(vid, 'village');
  console.log('  blunt medic village ask: ' + bluntVillage);
  console.log('  soft poet village ask:   ' + softVillage);
  ok('village ask differs by player voice', bluntVillage !== softVillage);

  setPlayerIdentity('intense', 'paramedic', 38);
  const bluntHelp = Game.convoActionLabel(vid, 'offer_help');
  setPlayerIdentity('warm', 'librarian', 50);
  const softHelp = Game.convoActionLabel(vid, 'offer_help');
  console.log('  blunt medic offer_help: ' + bluntHelp);
  console.log('  soft librarian offer_help: ' + softHelp);
  ok('offer_help differs by player voice', bluntHelp !== softHelp);

  console.log('\n=== 3. Occupation flavor: medic asks about injuries ===');
  setPlayerIdentity('steady', 'ER nurse', 33);
  const medVillage = Game.convoLabel(vid, 'village');
  console.log('  nurse village ask: ' + medVillage);
  ok('medic village ask is injury-flavored', /hurt|injured/i.test(medVillage));
  setPlayerIdentity('steady', 'farmer', 40);
  const foodVillage = Game.convoLabel(vid, 'village');
  console.log('  farmer village ask: ' + foodVillage);
  ok('food village ask is hunger-flavored', /hungry|food/i.test(foodVillage));

  console.log('\n=== 4. Trust tiers still work (relationship register) ===');
  setPlayerIdentity('steady', 'teacher', 35);
  v.trust[vid] = 10;
  Game.convoGet(vid).count = 0;
  const newPast = Game.convoLabel(vid, 'past');
  v.trust[vid] = 70;
  Game.convoGet(vid).count = 7;
  const closePast = Game.convoLabel(vid, 'past');
  console.log('  new:   ' + newPast);
  console.log('  close: ' + closePast);
  ok('past ask deepens with trust', newPast !== closePast);

  console.log('\n=== 5. No menu-isms survive ===');
  const labels = [];
  for (const key of ['goal', 'past', 'village', 'plans', 'gossip']) labels.push(Game.convoLabel(vid, key));
  for (const key of ['personal', 'spread_rumor', 'theorize', 'offer_help', 'trade', 'teach', 'subject', 'invite_party']) {
    try { labels.push(Game.convoActionLabel(vid, key)); } catch (e) { ok('action label ' + key + ' no crash', false); }
  }
  labels.push(Game.convoMoreLabel(vid));
  ok('no bare "Tell me more."', !labels.some(l => l === '"Tell me more."'));
  ok('no raw key echo', !labels.some(l => /^(goal|past|personal|theorize)$/.test(l)));
  ok('all labels are quoted speech or stage directions',
    labels.every(l => (l.startsWith('"') && l.endsWith('"')) || (l.startsWith('(') && l.endsWith(')'))));

  console.log('\n=== 6. Voice stability: same person, same phrasing ===');
  setPlayerIdentity('bold', 'army medic', 42);
  v.trust[vid] = 10; Game.convoGet(vid).count = 0;
  const a1 = Game.convoLabel(vid, 'goal');
  const a2 = Game.convoLabel(vid, 'goal');
  ok('stable per person', a1 === a2);

  console.log('\n=== 7. Full choice list sanity (5 conversations) ===');
  let allOk = true;
  for (const testVid of roster.slice(0, 5)) {
    try {
      Game.startConvo(testVid);
      const choices = Game.convoChoices(testVid);
      for (const ch of choices) {
        if (!ch.label || typeof ch.label !== 'string') { allOk = false; console.log('  empty label for', ch.id); }
        if (/^(goal|past|personal|theorize|village|plans|gossip)$/.test(ch.label)) { allOk = false; console.log('  raw key label:', ch.label); }
      }
      Game.endConvo(testVid, 'left');
    } catch (e) { allOk = false; console.log('  crash for', testVid, e.message); }
  }
  ok('5 conversations produce clean choice lists', allOk);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
