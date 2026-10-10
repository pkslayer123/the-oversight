#!/usr/bin/env node
// VILLAGE-AGENCY PROOF (2026-10-10):
// PROGRESSION.md section 6 settled law: "Other villages are other players."
// First pass: splinter events (cannibal signature), petition-to-join flow
// (played beat + moot vote + consequences), their inner life through the
// rumor pipeline (famine, succession, schism — delayed, possibly wrong),
// and real teeth (beg/raid/aid/exploit).
// Proves:
//   1. fireSplinter fires with NAMED petitioners; half petition, half form a new village
//   2. interview (max 3) + moot vote work; count math is consistent
//   3. consequences land: mouths (roster), reputation (other villages' opinion), corruption crosses
//   4. rumor pipeline carries internal events — delayed, never omniscience
//   5. beg / raid-defense / succession aid-or-exploit beats resolve with real costs
//   6. havenPopCap hook: 12 default, 16/20/24 via growthTier; room:0 moot refuses honestly
// Run: SEED=11 node scripts/test-village-agency-20261010.js (also 222, 3333)
// Node harness: full src/js/*.js list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js). Math.random is
// seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG BEFORE eval ----
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '11', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at LOAD; deleted before play
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/villageAgency.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path, per harness lessons
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function saidHas(re) { return says.some(t => re.test(t)); }

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}

  const ovs = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  ovs.forEach(v => { v.rumored = true; v.opinion = 0; v.population = Math.max(10, v.population || 10); });
  ok(ovs.length >= 2, `have ${ovs.length} foreign villages to play with`);
  const [vA, vB] = ovs;
  // link vA to Haven (the splinter signature needs a linked village)
  const linkA = Game._formLink(vA.id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  ok(!!linkA && !!Game.linkWith(vA.id), 'vA linked to Haven');
  // room for petitioners: the haven workstream hook (growthTier) — longhouse => 16
  Game.state.village.growthTier = 'longhouse';
  const stock = (kcal) => { Game.state.village.pantry = Game.state.village.pantry || []; Game.state.village.pantry.push({ name: 'test grain', kcalEach: kcal, units: 1, spoilDay: 9999 }); };
  stock(40000);
  const pantryKcal = () => (Game.state.village.pantry || []).reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 0), 0);

  console.log(`[seed ${SEED}] --- 1. FACES (camera rule: max 3 named) ---`);
  const faces = Game.ensureFaces(vA);
  ok(faces && faces.leader && faces.speaker && faces.champion, 'village has leader/speaker/champion faces');
  const fnames = [faces.leader.name, faces.speaker.name, faces.champion.name];
  ok(new Set(fnames).size === 3 && fnames.every(n => n && n.length > 1), `faces are 3 distinct named people (${fnames.join(', ')})`);
  ok(Game.ensureFaces(vA) === faces, 'faces are stable across calls');

  console.log(`[seed ${SEED}] --- 2. SPLINTER (cannibal signature) ---`);
  says.length = 0;
  const popBefore = vA.population;
  const spl = Game.fireSplinter(vA.id, 'cannibal');
  ok(!!spl && spl.cause === 'cannibal', 'fireSplinter fires with cause=cannibal');
  ok(spl.petitioners.length >= 1, `${spl.petitioners.length} petitioners break for Haven's fire`);
  ok(spl.petitioners.every(p => p.name && p.name.length > 2), 'every petitioner is NAMED');
  ok(new Set(spl.petitioners.map(p => p.name)).size === spl.petitioners.length, 'petitioner names are unique');
  ok(!!spl.newVillage && spl.newVillage.isSplinter && (Game.state.otherVillages || []).some(v => v.id === spl.newVillage.id),
    `the other half becomes a live village (${spl.newVillage.name})`);
  ok(vA.population < popBefore, `parent village lost people (${popBefore} -> ${vA.population})`);
  const pet = Game.state.pendingPetition;
  ok(!!pet && pet.cause === 'cannibal' && pet.petitioners.length === spl.petitioners.length, 'petition beat is pending at Haven\'s fire');
  ok(saidHas(/asking for a fire/), 'arrival beat played aloud');
  ok(saidHas(/We ate people/), 'cannibal cause stated honestly, not cartoonishly');

  console.log(`[seed ${SEED}] --- 3. INTERVIEW (max 3, played) ---`);
  const petId = pet.id;
  ok(Game.petitionInterview(petId, 'why') === true, 'interview q1 (why) answered');
  ok(Game.petitionInterview(petId, 'bring') === true, 'interview q2 (bring) answered');
  ok(Game.petitionInterview(petId, 'cause') === true, 'interview q3 (cause — the hard question) answered');
  ok(Game.petitionInterview(petId, 'origin') === null, '4th question refused — the village is restless');
  ok(Game.petitionInterview(petId, 'why') === null, 'repeat question refused');

  console.log(`[seed ${SEED}] --- 4. MOOT VOTE ---`);
  says.length = 0;
  const mootRes = Game.conductPetitionMoot(petId);
  ok(!!mootRes && mootRes.awaitingPlayerVote === true, 'moot convenes; the moot turns to the player');
  const pv = Game.state.pendingPetition.vote;
  ok(pv && Array.isArray(pv.votes) && pv.votes.length > 0, `villagers voted (${pv.votes.length} votes tallied)`);
  // speeches: within-village drama happened
  ok(saidHas(/stands\./), 'voters spoke for/against (within-village drama)');
  const rosterBefore = Game.state.village.roster.length;
  const opinionsBefore = {};
  ovs.forEach(v => { if (v.id !== vA.id) opinionsBefore[v.id] = v.opinion || 0; });
  says.length = 0;
  const final = Game.answerPetition(petId, 'accept');
  ok(!!final, 'player vote resolves the petition');
  ok(saidHas(/counts on their fingers/) && saidHas(/for taking them in/), 'the count is said aloud');
  const acceptVotes = pv.accept + 1, total = pv.present + 1, need = Math.floor(total / 2) + 1;
  ok(final.accepted === (acceptVotes >= need), `outcome matches the count (${acceptVotes}/${total}, need ${need}) -> ${final.accepted ? 'ACCEPTED' : 'REJECTED'}`);

  console.log(`[seed ${SEED}] --- 5. CONSEQUENCES ---`);
  if (final.accepted) {
    const admitted = final.admitted || [];
    ok(admitted.length > 0, `${admitted.length} admitted`);
    ok(Game.state.village.roster.length === rosterBefore + admitted.length, `mouths to feed: roster ${rosterBefore} -> ${Game.state.village.roster.length}`);
    ok(admitted.every(id => Game.state.village.roster.includes(id) && (Game.state.village.trust || {})[id] === 5),
      'new villagers are real roster members with wary trust (5)');
    ok(admitted.every(id => { try { return Game.displayName(id).length > 1; } catch (e) { return false; } }),
      'new villagers have display names (hydrated persons)');
    let corrOk = true;
    try { corrOk = admitted.every(id => Game.corruptionOf(id) > 0); } catch (e) { corrOk = false; }
    ok(corrOk, 'their corruption crossed with them (cannibal past)');
    let repOk = true;
    ovs.forEach(v => { if (v.id !== vA.id && (v.opinion || 0) > (opinionsBefore[v.id] || 0)) repOk = false; });
    ok(repOk && ovs.some(v => v.id !== vA.id && (v.opinion || 0) < (opinionsBefore[v.id] || 0)),
      'other villages reacted to harboring cannibals (opinion down)');
    ok(saidHas(/harboring eaters/) || saidHas(/Other fires will remember/), 'the consequence is said aloud');
  } else {
    ok(Game.state.village.roster.length === rosterBefore, 'rejected: no silent population change');
    ok(saidHas(/walks|walk/) , 'rejected: they walk, said aloud');
  }

  console.log(`[seed ${SEED}] --- 5b. FORCED-ACCEPT consequence unit proof ---`);
  // guarantee coverage of the admit path regardless of the moot's mood
  vA.inner.splinterCooldownUntil = 0;
  const spl2 = Game.fireSplinter(vA.id, 'famine-flight');
  const pet2 = Game.state.pendingPetition;
  ok(!!pet2 && pet2.cause === 'famine-flight', 'second petition pending (famine-flight)');
  const rB2 = rosterBefore; // current roster length
  const admitted2 = Game._vaAdmitPetitioners(pet2);
  ok(admitted2.accepted && admitted2.admitted.length > 0, 'forced admit works');
  ok(Game.state.village.roster.length > rB2, 'mouths added by admit');
  ok(!Game.state.pendingPetition, 'petition beat cleared after resolution');

  console.log(`[seed ${SEED}] --- 6. RUMOR PIPELINE (delayed, possibly wrong, never omniscience) ---`);
  says.length = 0;
  const day0 = Game.state.scholar.day;
  const qok = Game.queueVillageEventRumor(vB.id, 'famine', {});
  ok(qok === true, 'famine rumor queued for a known village');
  const rq = (Game.state.scholar.rumors || []).find(r => r.type === 'village_event' && r.villageId === vB.id);
  ok(!!rq && rq.deliverDay > day0, `rumor is DELAYED (day ${day0}, delivers ${rq && rq.deliverDay})`);
  says.length = 0;
  Game.deliverVillageRumors();
  ok(!saidHas(/starving|jars/), 'not delivered the same day it was queued');
  Game.state.scholar.day = rq.deliverDay;
  says.length = 0;
  for (let i = 0; i < 5 && !saidHas(/starving|jars/); i++) Game.deliverVillageRumors();
  ok(saidHas(/starving|jars/), 'delivered at the day boundary through the rumor pipeline');
  // never omniscience: an unknown village gets nothing
  vB.rumored = false; vB.generated = false;
  ok(Game.queueVillageEventRumor(vB.id, 'succession', {}) === null, 'unknown village: no rumor (never omniscience)');
  vB.rumored = true;
  // succession rumor carries the crisis
  Game._vaStartSuccession(vB);
  ok(!!(vB.inner && vB.inner.crisis), 'succession crisis started (leader dead, claimants circle)');
  const qok2 = Game.queueVillageEventRumor(vB.id, 'succession', {});
  ok(qok2 === true, 'succession rumor queued');

  console.log(`[seed ${SEED}] --- 7. SUCCESSION: aid or exploit ---`);
  ok(Game.stageSuccessionBeat(vB.id) === true && !!Game.state.pendingSuccession, 'succession beat staged (runner/visit)');
  says.length = 0;
  const opBefore = vB.opinion || 0;
  const backedName = Game.state.pendingSuccession.claimants[0].name;
  const winner = Game.answerSuccession('backA');
  ok(winner === 'backed', 'backing a claimant resolves the crisis');
  ok(!(vB.inner && vB.inner.crisis), 'crisis cleared');
  ok((vB.faces || {}).leader && vB.faces.leader.name === backedName, `the backed claimant holds the fire (${backedName})`);
  ok((vB.opinion || 0) > opBefore, 'aid remembered (opinion up)');
  // exploit path
  Game._vaStartSuccession(vB);
  Game.stageSuccessionBeat(vB.id);
  says.length = 0;
  const opBefore2 = vB.opinion || 0;
  const ex = Game.answerSuccession('extort');
  ok(ex === 'extorted', 'extortion is a real choice');
  ok((vB.opinion || 0) < opBefore2, 'exploit has teeth (opinion down)');
  ok(saidHas(/names its price/), 'extortion said aloud');

  console.log(`[seed ${SEED}] --- 8. BEG / RAID (famine teeth) ---`);
  vB.famine = { since: Game.state.scholar.day, severity: 1 };
  vB.pantryKcal = 0;
  Game._vaStageBeg(vB);
  ok(!!Game.state.pendingBeg, 'begging speaker arrives (played beat)');
  const pkBefore = pantryKcal();
  const opBBefore = vB.opinion || 0;
  says.length = 0;
  ok(Game.answerBeg('give') === true, 'giving food works');
  ok(pantryKcal() < pkBefore, `real food moved (${pkBefore} -> ${pantryKcal()})`);
  ok((vB.opinion || 0) > opBBefore, 'gratitude is real (opinion up)');
  Game._vaStageRaidDefense(vB);
  ok(!!Game.state.pendingRaidDefense, 'raid staged at the treeline');
  const pkBefore2 = pantryKcal();
  says.length = 0;
  ok(Game.answerRaidDefense('give') === 'gave', 'paying the raid off works');
  ok(pantryKcal() < pkBefore2, 'raiders took real food');
  ok(saidHas(/They'll be back/), 'the teeth are named: they will be back');

  console.log(`[seed ${SEED}] --- 9. CAP HOOK ---`);
  delete Game.state.village.growthTier;
  ok(Game.havenPopCap() === 12, 'default cap is 12 (base Haven)');
  Game.state.village.growthTier = 'longhouse';
  ok(Game.havenPopCap() === 16, 'longhouse tier -> 16');
  Game.state.village.growthTier = 'palisade';
  ok(Game.havenPopCap() === 20, 'palisade tier -> 20');
  Game.state.village.growthTier = 'granary';
  ok(Game.havenPopCap() === 24, 'granary tier -> 24');
  delete Game.state.village.growthTier;
  // room:0 moot refuses honestly
  const saveRoster = Game.state.village.roster.slice();
  while (Game.state.village.roster.length < 12) Game.state.village.roster.push('dummy_' + Game.state.village.roster.length);
  Game.openPetition({ petitioners: [{ name: 'Test Walker', age: 30 }], cause: 'peaceful', originName: 'Nowhere', day: Game.state.scholar.day });
  const noRoom = Game.conductPetitionMoot(Game.state.pendingPetition.id);
  ok(noRoom && noRoom.room === 0, 'moot refuses honestly when there is no room');
  ok(saidHas(/no room/), 'the refusal names the reason');
  Game.state.pendingPetition = null;
  Game.state.village.roster = saveRoster;

  console.log(`[seed ${SEED}] --- 10. DAILY TICK + KNOWLEDGE NEVER GATES ---`);
  let tickOk = true;
  try { for (let i = 0; i < 5; i++) Game.villageAgencyDaily(); } catch (e) { tickOk = false; console.log('   tick threw:', e.message); }
  ok(tickOk, 'villageAgencyDaily runs clean 5x');
  let hdOk = true;
  try { Game.hierarchyDaily(); } catch (e) { hdOk = false; console.log('   hierarchyDaily threw:', e.message); }
  ok(hdOk, 'hierarchyDaily (with agency wrap) runs clean');
  const src = fs.readFileSync(path.join(ROOT, 'src/js/villageAgency.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  ok(!/codex\s*[\.\[]/i.test(src) && !/\.codex\b/i.test(src), 'knowledge never gates: no codex property access anywhere in the module');

  console.log(`[seed ${SEED}] failures: ${failures}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
