#!/usr/bin/env node
// PROOF TEST: membership social depth (Steve 2026-10-05 / 2026-10-07)
// src/js/membership.js — readmission petition ARC (beats, choices,
// consequences), witnessed severing, knowledge-gated social info,
// unique-person registry, founding beats, moot voices.
//
// Seeded: mulberry32, default seed 20261007, SEED env override. Run:
//   node scripts/test-membership-depth-20261007.js            (seed 20261007)
//   SEED=2 node scripts/test-membership-depth-20261007.js
// Green required across >= 3 seeds.
//
// Harness: FULL src/js/*.js list in index.html order (minus DOM-only
// app.js/sprites.js/tile-scenes.js/move-anim.js). window stubbed for the
// eval phase, deleted before playing (sync path). jest is NOT run here
// (concurrency hazard — separate processes only).
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

// ---------- seeded RNG (before eval: module-level R captures are seeded) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);
let nowTick = 0;
const realNow = Date.now;
Date.now = () => 1700000000000 + (nowTick++); // deterministic ids

// ---------- full eval ----------
global.window = global; // stub for eval phase only
const FILES = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js',
  'engine/day.js', 'engine/forage.js', 'engine/combat.js', 'game.js',
  'encounters.js', 'conversation.js', 'convo-mood.js', 'convoTopics.js',
  'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js', 'examine.js',
  'equipment.js', 'journal.js', 'party.js', 'party-formal.js', 'truth.js',
  'contests.js', 'storage.js', 'perceive.js', 'carexplore.js', 'justice.js',
  'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'villager-agency.js', 'codex-people.js', 'membership.js',
  'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'), { filename: f });
}
delete global.window; // sync path for play
Date.now = realNow;

const G = globalThis.Scattering && globalThis.Scattering.Game;
if (!G) { console.error('FATAL: Game did not load'); process.exit(2); }

// ---------- speech capture ----------
let SAID = [];
G.say = function (t) { SAID.push(String(t)); };
const saidHas = (re) => SAID.some((t) => re.test(t));

// ---------- assertions ----------
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; /* quiet on pass to keep the transcript readable */ }
  else { fail++; console.log('  FAIL', label); }
}

// ---------- world factory ----------
function freshWorld() {
  SAID = [];
  G.villagerId = 'p1';
  G.data = G.data || {};
  G.data.villagers = [];
  G.data.background_survivors = []; // force the drifter branch deterministically
  G.state = {
    village: {
      id: 'haven', name: 'Haven', day: 10, season: 'spring',
      roster: ['p1', 'v2', 'v3'],
      trust: { p1: 50, v2: 40, v3: 30 },
      health: { p1: 100, v2: 100, v3: 100 },
      pantry: [], taught: {}, severed: {},
      rosterChars: {
        v2: { id: 'v2', name: 'Vee Two', temperament: 'generous' },
        v3: { id: 'v3', name: 'Vee Three', temperament: 'cold' },
      },
    },
    scholar: {
      villagerId: 'p1', day: 10, health: 100, kcal: 2500,
      hydration: 100, energy: 100, abilities: [],
      inventory: [
        { name: 'Dried meat', kcalEach: 400, units: 3, safe: true },
        { name: 'Trail mix', kcalEach: 400, units: 2, safe: true },
      ],
      knowledge: { plants: { dandelion: { level: 3 } } }, // the head-codex
    },
    codex: { plants: {}, monsters: {}, recipes: [], terrain: {}, skills: {}, trees: {} },
    pastVillages: [],
    otherVillages: [],
  };
  return G.state;
}

console.log('seed', SEED);

// ===== 1. PETITION ARC: refusal → demand → pay → wait → grant =====
console.log('1. petition arc (refuse → demand → pay → wait → grant)');
let TRANSCRIPT = [];
{
  const st = freshWorld();
  const s = st.scholar;
  G.exilePlayer('theft');
  s.day = 12;
  G.justiceState().amendsCredit = 6;
  SAID = [];
  // 1a. refused: itemized, demand named, choices announced
  const refused = G.seekReadmission();
  ok(refused === false, 'petition refused when conditions unmet');
  ok(saidHas(/not yet: Time on the road/), 'refusal itemizes time');
  ok(saidHas(/not yet: Amends made/), 'refusal itemizes amends');
  ok(saidHas(/they name a price/), 'refusal names a price');
  ok(saidHas(/"pay".*"face".*"withdraw"/), 'choices announced');
  const pet = G.exileArcState().petition;
  ok(pet && pet.stage === 'demanded', 'petition staged as demanded');
  ok(pet && pet.demand && pet.demand.key === 'amends', 'demand is amends (answerable first)');
  ok(saidHas(/weregild/), 'demand speaks weregild');
  // 1b. second petition while pending: status, never silence
  SAID = [];
  const pend = G.seekReadmission();
  ok(pend === 'pending', 're-petition while pending returns pending');
  ok(saidHas(/already named its price/), 'pending petition reports its status');
  // 1c. pay without the coin: honest short
  SAID = [];
  const short = G.answerPetitionDemand('pay');
  ok(short === 'short', 'cannot pay what you do not hold');
  ok(saidHas(/don't have it to give/), 'short payment is spoken honestly');
  // 1d. earn, then pay: real cost, weregild flag, stage ready
  G.justiceState().amendsCredit = 14;
  SAID = [];
  const paid = G.answerPetitionDemand('pay');
  ok(paid === 'paid', 'weregild paid');
  ok(G.justiceState().amendsCredit === 0, 'credit is SPENT — the heat buffer thins');
  ok(G.exileArcState().petition.paidWeregild === true, 'weregild recorded on the petition');
  ok(G.exileArcState().petition.stage === 'ready', 'petition ready after payment');
  ok(saidHas(/counted, coin by coin/), 'payment beat spoken');
  // 1e. renew: time still unmet → new demand is waiting
  SAID = [];
  const renewed = G.answerPetitionDemand('renew');
  ok(renewed === false, 'renew re-runs the check; time still unmet');
  const pet2 = G.exileArcState().petition;
  ok(pet2 && pet2.demand && pet2.demand.key === 'wait', 'second demand is waiting');
  ok(pet2.paidWeregild === true, 'weregild survives the re-petition');
  // 1f. wait it out, day by day (mirrors real play: endDay advances the day)
  SAID = [];
  let guard = 0;
  while (G.exileArcState().petition && G.exileArcState().petition.stage === 'demanded' && guard++ < 30) {
    s.day += 1;
    G.petitionDaily();
  }
  ok(G.exileArcState().petition.stage === 'ready', 'waiting demand fulfilled by days');
  ok(saidHas(/days you owed are paid/), 'fulfillment announced, never silent');
  // 1g. grant: the moot weighs your name, then COME HOME
  SAID = [];
  const granted = G.seekReadmission();
  ok(granted === true, 'petition granted when the work is done');
  ok(saidHas(/argued your name/), 'the moot weighs your name in voices');
  ok(saidHas(/spoke for you/), 'a voice speaks for you');
  ok(saidHas(/COME HOME/), 'verdict announced to the village');
  ok(saidHas(/warier welcome/), 'homecoming line (not the new-village line)');
  ok(saidHas(/One of ours\. Trusted by/), 'standing spoken at the homecoming');
  ok(!((G.state.village.severed || {}).p1), 'severed record struck — earned');
  ok(s.exiled === false, 'exile ends');
  ok(G.exileArcState().stage === 'home', 'arc closes');
  ok(G.exileArcState().petition === null, 'petition cleared on grant');
  TRANSCRIPT = TRANSCRIPT.concat(SAID);
}

// ===== 2. FACE THE BOUNDARY: vouched vs turned away vs withdraw =====
console.log('2. face / withdraw choices');
{
  // 2a. vouched: the steady ones speak → price softens
  freshWorld();
  G.state.village.trust.v2 = 50;
  G.state.village.trust.v3 = 45;
  G.exilePlayer('theft');
  G.state.scholar.day = 12;
  SAID = [];
  G.seekReadmission();
  const needBefore = G.exileArcState().petition.demand.need;
  const faced = G.answerPetitionDemand('face');
  ok(faced === 'faced', 'facing returns faced');
  ok(G.exileArcState().petition.demand.need === Math.ceil(needBefore / 2), 'vouched-for softens the price');
  ok(saidHas(/Someone walks out to meet you/), 'vouching beat spoken');
  SAID = [];
  const faced2 = G.answerPetitionDemand('face');
  ok(faced2 === 'faced', 'second facing is a no-op with a line');
  ok(saidHas(/won't come out twice/), 'no double-facing — announced');
  // 2b. turned away: consequences land
  freshWorld();
  G.exilePlayer('theft');
  const heardBefore = (G.betrayalState().strangersHeard || 0);
  G.state.scholar.day = 12;
  SAID = [];
  G.seekReadmission();
  const tBefore = { v2: G.state.village.trust.v2, v3: G.state.village.trust.v3 };
  const turned = G.answerPetitionDemand('face');
  ok(turned === 'faced', 'facing resolves');
  ok(G.state.village.trust.v2 === tBefore.v2 - 2, 'trust frays when turned away');
  ok(G.state.village.severed.p1.pressed === 12, 'the pressing is noted on the severed record');
  ok((G.betrayalState().strangersHeard || 0) === heardBefore + 1, 'word travels that the cast-out pushed');
  ok(saidHas(/Nobody comes out/), 'rejection beat spoken');
  // 2c. withdraw: the word dies, noted
  freshWorld();
  G.exilePlayer('theft');
  G.state.scholar.day = 12;
  SAID = [];
  G.seekReadmission();
  const w = G.answerPetitionDemand('withdraw');
  ok(w === 'withdrawn', 'withdraw resolves');
  ok(G.exileArcState().petition === null, 'petition cleared on withdraw');
  ok(G.state.village.trust.v2 === 39, 'withdrawal frays trust a little');
  ok(saidHas(/let the word die/), 'withdrawal announced');
}

// ===== 3. DIVIDED ROOM: forgiven, not forgotten =====
console.log('3. divided room starts cool');
{
  freshWorld();
  G.state.village.rosterChars.v2.temperament = 'cold';
  G.exilePlayer('theft');
  const s = G.state.scholar;
  s.day = 30;
  G.justiceState().amendsCredit = 25;
  SAID = [];
  const granted = G.seekReadmission();
  ok(granted === true, 'grant still lands in a cold room');
  ok(saidHas(/It was close/), 'division is spoken');
  ok(saidHas(/Forgiven, not forgotten/), 'cool start announced');
  ok(G.state.village.trust.p1 === 25, 'trust starts cool after a divided verdict');
}

// ===== 4. SEVERING IS WITNESSED =====
console.log('4. witnessed severing');
{
  const st = freshWorld();
  SAID = [];
  G.exilePlayer('theft');
  const sev = st.village.severed.p1;
  ok(!!sev, 'severed record written');
  ok(Array.isArray(sev.witnesses) && sev.witnesses.length === 2, 'witnesses recorded on the record');
  ok(sev.witnesses.indexOf('v2') >= 0 && sev.witnesses.indexOf('v3') >= 0, 'the room was there');
  ok(saidHas(/At the severing:/), 'the moot reacts in voices');
  ok(saidHas(/looked away/), 'the generous mourns');
  ok(saidHas(/nodded/), 'the cold approves');
  ok(saidHas(/-10 standing abroad/), 'the abroad cost is concrete, not vague');
  ok(saidHas(/Word will travel/), 'other villages hear');
}

// ===== 5. KNOWLEDGE-GATED SOCIAL INFO =====
console.log('5. nameKnown gate');
{
  freshWorld();
  ok(G.socialNameKnown('zzz') === null, 'a stranger has no name to you');
  const known = G.socialNameKnown('v2');
  ok(typeof known === 'string' && known.length > 0, 'someone you lived with has a name');
  ok(G.socialNameKnown('nobody-at-all') === null, 'unknown ids stay unknown');
}

// ===== 6. STANDING, SPOKEN =====
console.log('6. standingSummarySpeech');
{
  freshWorld();
  SAID = [];
  const s = G.standingSummarySpeech('p1');
  ok(s.member === true && s.trustedBy === 1 && s.of === 2, 'standing data intact');
  ok(saidHas(/One of ours\. Trusted by 1 of 2/), 'belonging spoken with numbers');
  ok(saidHas(/counts you as theirs/), 'the steady ones named');
  // severed: hear the record back
  G.exilePlayer('theft');
  SAID = [];
  G.standingSummarySpeech('p1');
  ok(saidHas(/Severed — exiled day 10\. The village remembers\./), 'the severed hear their record');
}

// ===== 7. UNIQUE-PERSON LAW: registry + drifters + lived ties =====
console.log('7. unique-person registry');
{
  freshWorld();
  const settlers = [];
  for (let i = 0; i < 50; i++) settlers.push(G.genSettler());
  const names = settlers.map((x) => x.name);
  ok(new Set(names).size === 50, '50 settlers, 50 unique names (registry holds)');
  ok(settlers.every((x) => x.temperament === null), 'temperament never pre-assigned');
  const stories = settlers.map((x) => x.backstory);
  ok(new Set(stories).size >= 40, 'backstories composed, not templated (' + new Set(stories).size + '/50 distinct)');
  ok(settlers.every((x) => Array.isArray(x.livedEvents) && x.livedEvents.length >= 1), 'lived events on every settler');
  // drifters arrive as full people, never 'a tired cook'
  const apps = [];
  for (let i = 0; i < 20; i++) apps.push(G.genApplicant());
  ok(apps.every((a) => a.backstory && a.livedEvents && a.need && a.origin), 'every drifter composed: backstory, events, need, origin');
  ok(apps.every((a) => /^[A-Z][a-z]+ [A-Z][a-z]+/.test(a.name)), 'drifter names are real names, not labels');
  ok(!apps.some((a) => /^a (tired|lean|weathered|young|quiet) /.test(a.name)), 'no label-names leak through');
  const anames = apps.map((a) => a.name);
  ok(new Set(anames).size === anames.length, 'applicant names unique within the run');
  // backstory ties to lived data: a real village name
  const app = { id: 't1', name: 'Test Person', formerOccupation: 'cook', fromVillageName: 'Emberhold' };
  G.applicantBackstory(app);
  ok(app.origin === 'late of Emberhold', 'origin ties to the real village');
  ok(app.livedEvents[0].text.indexOf('Emberhold') >= 0, 'a lived event names the real village');
}

// ===== 8. FOUNDING BEATS + HARD RESET =====
console.log('8. founding beats + hard reset');
{
  const st = freshWorld();
  const oldVillage = st.village;
  G.exilePlayer('theft');
  const s = st.scholar;
  s.exileStartDay = s.day - 8;
  s.founding = { siteClaimed: true, shelterTier: 2, stockpileKcal: 10000, claimX: 3, claimY: 3 };
  // a petition is open — the road's petition dies with the road
  s.day = 12;
  G.seekReadmission();
  ok(G.exileArcState().petition !== null, 'petition open before founding');
  const packBefore = JSON.stringify(s.inventory);
  SAID = [];
  const nv = G.forkVillage();
  ok(!!nv && nv !== oldVillage, 'new village OBJECT');
  ok(G.state.village === nv, 'state.village swapped');
  ok(st.pastVillages.indexOf(oldVillage) >= 0, 'old village archived (it continues without you)');
  ok(!!(oldVillage.severed || {}).p1, 'old village keeps YOUR severed record — they remember');
  ok(nv.trust.v2 === undefined && nv.trust.v3 === undefined, 'old trust ties do not cross');
  ok(JSON.stringify(s.inventory) === packBefore, 'PACK KEPT');
  ok(s.knowledge.plants.dandelion.level === 3, 'KNOWLEDGE KEPT');
  ok(G.exileArcState().stage === 'home', 'arc closes');
  ok(G.exileArcState().petition === null, "the road's petition dies with the road");
  const f = G.exileArcState().founding;
  ok(f && f.oldVillage === 'Haven' && f.name === nv.name, 'founding recorded with the old village name');
  ok(saidHas(/first fire/), 'beat: the fire');
  ok(saidHas(/Say it out loud/), 'beat: the name');
  ok(saidHas(/keeps its fire/), "beat: the old village's memory");
  ok(saidHas(/slate is clean/), 'beat: the clean slate');
  ok(saidHas(/New fire, new names, same codex/), 'membership terms of the fork');
}

// ===== 9. MOOT VOICES PRIMITIVE =====
console.log('9. mootVoices');
{
  freshWorld();
  const mv = G.mootVoices('intake');
  ok(mv.forW === 50 && mv.againstW === 40, 'trust-weighted voices (50 for / 40 against)');
  ok(mv.againstPct === 44, 'againstPct derived');
  ok(mv.frame === 'warm', 'first speaker (highest trust, generous) frames warm');
  ok(mv.firstName === G.socialNameKnown('v2'), 'first speaker named');
  const mvS = G.mootVoices('severing');
  ok(mvS.forW === 40 && mvS.againstW === 50, 'severing: the cold approves, the generous mourns');
  SAID = [];
  const app = { name: 'Test Applicant' };
  const d = G.debateIntake(app);
  ok(d === 44, 'debateAgainst preserved');
  ok(saidHas(/speaks first, and kindly/), 'speaking-order consequence spoken');
}

// ===== 10. NO SILENT ACTIONS SWEEP =====
console.log('10. every beat speaks');
{
  freshWorld();
  const beats = [];
  const snap = () => { const n = SAID.length; SAID = []; return n; };
  snap();
  G.exilePlayer('theft'); beats.push(['exile moment', snap()]);
  G.roadDaily(); beats.push(['road daily', snap()]);
  G.foodSupportsSpeech(1); beats.push(['foodSupportsSpeech', snap()]);
  G.standingSummarySpeech('p1'); beats.push(['standingSummarySpeech (severed)', snap()]);
  G.seekReadmission(); beats.push(['petition refusal', snap()]);
  G.answerPetitionDemand('bogus'); beats.push(['demand choices menu', snap()]);
  const s = G.state.scholar;
  s.exileStartDay = s.day - 8;
  s.founding = { siteClaimed: true, shelterTier: 2, stockpileKcal: 10000, claimX: 3, claimY: 3 };
  G.forkVillage(); beats.push(['founding', snap()]);
  for (const [label, n] of beats) ok(n > 0, 'beat speaks: ' + label + ' (' + n + ' lines)');
}

// ---------- played-pass transcript: one full arc, as a player hears it ----------
console.log('\n--- PLAYED PASS: the full petition arc, as spoken ---');
{
  freshWorld();
  const s = G.state.scholar;
  G.exilePlayer('theft');
  const arc = [];
  const take = (label) => { arc.push('\n[' + label + ']'); for (const t of SAID) arc.push('  ' + t); SAID = []; };
  take('THE MOMENT');
  s.day = 12;
  G.justiceState().amendsCredit = 14;
  G.seekReadmission(); take('THE PETITION (refused, price named)');
  G.answerPetitionDemand('pay'); take('THE WEREGILD');
  G.answerPetitionDemand('renew'); take('WORD AGAIN (time still owed)');
  let guard = 0;
  while (G.exileArcState().petition && G.exileArcState().petition.stage === 'demanded' && guard++ < 30) { s.day += 1; G.petitionDaily(); }
  take('THE WAITING');
  G.seekReadmission(); take('THE VERDICT');
  console.log(arc.join('\n'));
}

console.log('\nseed ' + SEED + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
