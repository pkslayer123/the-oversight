// Conversation depth gaps test. Usage: node scripts/test-conversation-depth-gaps.js
// Steve's directive (2026-10-06): "Address all gaps."
//
// Gap 1 (minTrust): the trust-gating code exists but the question pool's
// values needed audit. Verifies every NPC question has a meaningful
// minTrust, personal questions require trust, and the q_read snitch
// question was raised 5 -> 15.
// Gap 2 (age voice): a teenager and an elder with the same temperament
// must not sound alike. Verifies ageBand derivation and that young/elder
// players get age-distinct labels while adult players are unchanged.
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
  // Neutralize trust/tier so voice differences come from identity, not relationship.
  v.trust[vid] = 10;
  Game.convoGet(vid).count = 0;

  console.log('=== 1. minTrust: every NPC question is gated ===');
  const cg = Game.data.characterGen;
  const qs = (cg.convo || {}).questions || [];
  ok('question pool non-empty', qs.length > 0);
  const missing = qs.filter(q => q.minTrust === undefined || q.minTrust === null);
  ok('zero questions missing minTrust', missing.length === 0);
  if (missing.length) console.log('  missing:', missing.map(q => q.id).join(', '));
  // Deeply personal questions must require real trust.
  const personalIds = ['q_regret', 'q_guilty', 'q_left_behind', 'q_trust', 'q_stay', 'q_fight'];
  const lowPersonal = personalIds.map(id => qs.find(q => q.id === id)).filter(q => !q || q.minTrust < 30);
  ok('personal questions (regret/guilt/left-behind/trust/stay/fight) all require 30+', lowPersonal.length === 0);
  if (lowPersonal.length) console.log('  too low:', lowPersonal.map(q => q.id + '=' + q.minTrust).join(', '));
  // Small talk stays reachable.
  const smallIds = ['q_origin', 'q_hands', 'q_night', 'q_laugh', 'q_name_day'];
  const highSmall = smallIds.map(id => qs.find(q => q.id === id)).filter(q => !q || q.minTrust > 5);
  ok('small-talk questions stay low-gated', highSmall.length === 0);

  console.log('\n=== 2. q_read snitch question raised 5 -> 15 ===');
  const qRead = qs.find(q => q.id === 'q_read');
  ok('q_read exists', !!qRead);
  ok('q_read minTrust is 15 (was 5)', qRead && qRead.minTrust === 15);

  console.log('\n=== 3. ageBand derivation ===');
  let pv = setPlayerIdentity('steady', 'teacher', 19);
  ok('age 19 -> young', pv.ageBand === 'young');
  pv = setPlayerIdentity('steady', 'teacher', 24);
  ok('age 24 -> young', pv.ageBand === 'young');
  pv = setPlayerIdentity('steady', 'teacher', 25);
  ok('age 25 -> adult', pv.ageBand === 'adult');
  pv = setPlayerIdentity('steady', 'teacher', 40);
  ok('age 40 -> adult', pv.ageBand === 'adult');
  pv = setPlayerIdentity('steady', 'teacher', 54);
  ok('age 54 -> adult', pv.ageBand === 'adult');
  pv = setPlayerIdentity('steady', 'teacher', 55);
  ok('age 55 -> elder', pv.ageBand === 'elder');
  pv = setPlayerIdentity('steady', 'teacher', 70);
  ok('age 70 -> elder', pv.ageBand === 'elder');

  console.log('\n=== 4. Same temperament, different age, different voice ===');
  // Same temperament (bold -> blunt), same villager, same trust: only age differs.
  setPlayerIdentity('bold', 'carpenter', 19);
  const youngPast = Game.convoLabel(vid, 'past');
  setPlayerIdentity('bold', 'carpenter', 65);
  const elderPast = Game.convoLabel(vid, 'past');
  console.log('  young blunt past: ' + youngPast);
  console.log('  elder blunt past: ' + elderPast);
  ok('young vs elder past ask differ', youngPast !== elderPast);
  setPlayerIdentity('bold', 'carpenter', 19);
  const youngGoal = Game.convoLabel(vid, 'goal');
  setPlayerIdentity('bold', 'carpenter', 65);
  const elderGoal = Game.convoLabel(vid, 'goal');
  ok('young vs elder goal ask differ', youngGoal !== elderGoal);
  // Action labels too.
  setPlayerIdentity('bold', 'carpenter', 19);
  const youngPersonal = Game.convoActionLabel(vid, 'personal');
  setPlayerIdentity('bold', 'carpenter', 65);
  const elderPersonal = Game.convoActionLabel(vid, 'personal');
  console.log('  young personal: ' + youngPersonal);
  console.log('  elder personal: ' + elderPersonal);
  ok('young vs elder personal ask differ', youngPersonal !== elderPersonal);

  console.log('\n=== 5. Adult players unchanged (backward compat) ===');
  // Adult = no age pool, so voice -> tier exactly as before.
  setPlayerIdentity('bold', 'carpenter', 40);
  const adultPast = Game.convoLabel(vid, 'past');
  console.log('  adult blunt past: ' + adultPast);
  ok('adult past uses temperament voice (blunt pool)', /what were you, before\?|before all this — what\?/i.test(adultPast));
  setPlayerIdentity('gentle', 'librarian', 35);
  const adultSoftPast = Game.convoLabel(vid, 'past');
  ok('adult soft past uses soft voice pool', /do you mind talking about before\?|what was your life like/i.test(adultSoftPast));

  console.log('\n=== 6. Occupation still wins over age ===');
  setPlayerIdentity('steady', 'army medic', 19);
  const youngMedic = Game.convoLabel(vid, 'village');
  console.log('  young medic village: ' + youngMedic);
  ok('young medic still gets injury flavor', /hurt|injured/i.test(youngMedic));
  setPlayerIdentity('steady', 'line cook', 68);
  const elderCook = Game.convoLabel(vid, 'village');
  console.log('  elder cook village: ' + elderCook);
  ok('elder cook still gets hunger flavor', /hungry|food/i.test(elderCook));

  console.log('\n=== 7. Continuers carry age ===');
  Game.startConvo(vid);
  // Force a neutral context: plain statement (no question, no trailing off),
  // neutral mood, non-topic2 thread — so the continuer falls through to
  // the voice/age pools rather than the moment-aware branches.
  const cc = Game.convoGet(vid);
  cc.thread = 'small';
  cc.transcript.push({ who: 'them', text: '"It has been a strange week."' });
  setPlayerIdentity('steady', 'teacher', 19);
  const youngMore = Game.convoMoreLabel(vid);
  setPlayerIdentity('steady', 'teacher', 68);
  const elderMore = Game.convoMoreLabel(vid);
  console.log('  young continuer: ' + youngMore);
  console.log('  elder continuer: ' + elderMore);
  ok('young vs elder continuer differ', youngMore !== elderMore);
  Game.endConvo(vid, 'left');

  console.log('\n=== 8. Age pools are quoted speech ===');
  const ageLabels = [];
  for (const age of [19, 68]) {
    setPlayerIdentity('bold', 'carpenter', age);
    for (const key of ['goal', 'past', 'village', 'plans', 'gossip']) ageLabels.push(Game.convoLabel(vid, key));
    for (const key of ['personal', 'theorize', 'offer_help']) ageLabels.push(Game.convoActionLabel(vid, key));
  }
  ok('all age labels are quoted speech', ageLabels.every(l => l.startsWith('"') && l.endsWith('"')));
  ok('no raw key echo in age labels', !ageLabels.some(l => /^(goal|past|personal|theorize)$/.test(l)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
