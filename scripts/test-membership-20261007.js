#!/usr/bin/env node
// PROOF TEST: membership exile arc (Steve 2026-10-05 / 2026-10-06)
// src/js/membership.js — exile moment → road-between → founding fork,
// applicant uniqueness, foodSupports honesty, readmission arc.
//
// Seeded: mulberry32, default seed 20261007, SEED env override. Run:
//   node scripts/test-membership-20261007.js            (seed 20261007)
//   SEED=2 node scripts/test-membership-20261007.js
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
  if (cond) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label); }
}

// ---------- world factory ----------
function freshWorld() {
  SAID = [];
  G.villagerId = 'p1';
  G.data = G.data || {};
  G.data.villagers = [];
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
  };
  return G.state;
}

console.log('seed', SEED);

// ===== 1. EXILE MOMENT =====
console.log('1. exile moment');
{
  const st = freshWorld();
  const r = G.exilePlayer('theft');
  ok(r === true, 'exilePlayer returns true');
  ok(st.scholar.exiled === true, 'scholar.exiled set');
  ok(!!(st.village.severed && st.village.severed.p1), 'severed record written');
  ok(st.scholar.codexCut === true, 'codex cut: the book stays behind');
  const arc = G.exileArcState();
  ok(arc.stage === 'road', 'arc staged to road (moment spoken, road begun)');
  ok(saidHas(/You KEEP:/), 'moment speaks what you KEEP');
  ok(saidHas(/You LOSE:/), 'moment speaks what you LOSE');
  ok(saidHas(/Word will travel/), 'severing is social: other villages hear');
  ok(G.isMember('p1') === false, 'isMember false after exile');
  ok(G.pantryAccess('p1') === false, 'pantry closed to the exiled');
}

// ===== 2. ROAD-BETWEEN =====
console.log('2. road-between');
{
  // 2a. pack feeds you, honestly reported
  freshWorld();
  G.exilePlayer('theft');
  SAID = [];
  const s = G.state.scholar;
  s.day = 11; s.kcal = 1000; s.health = 100;
  const cap = G.kcalCap();
  const r = G.roadDaily();
  ok(r && r.roadDays === 1, 'roadDaily counts road days');
  ok(r.eaten === 2000, 'ate a day\'s food from the pack (5x400)');
  ok(s.inventory.length === 0, 'pack units consumed');
  ok(s.kcal === Math.min(cap, 1000), 'kcal bank settled honestly (ate then burned the day)');
  ok(s.health === 100, 'no starvation damage when the pack covers the day');
  ok(saidHas(/eat from your pack/), 'road eating is spoken, not silent');
  ok(s.roadExposed === true, 'roadExposed flags the lone walker for encounters');
  ok(Array.isArray(G.exileArcState().roadBeats), 'road beats log exists');
  // 2b. hunger is real: empty pack, empty body
  freshWorld();
  G.exilePlayer('theft');
  SAID = [];
  const s2 = G.state.scholar;
  s2.day = 12; s2.kcal = 100; s2.health = 100; s2.inventory = [];
  G.roadDaily();
  ok(s2.kcal === 0, 'body stores drained');
  ok(s2.health < 100, 'starvation costs health — hunger is real');
  ok(saidHas(/Hunger is not a metaphor/), 'starvation is spoken');
  ok(saidHas(/nothing to eat/), 'empty pack is spoken honestly');
}

// ===== 3. FOUNDING: forkVillage hard reset =====
console.log('3. founding fork');
{
  const st = freshWorld();
  const oldVillage = st.village;
  G.exilePlayer('theft');
  const s = st.scholar;
  // satisfy the canonical founding project (betrayal.js foundHaven gates)
  s.exileStartDay = s.day - 8;
  s.founding = { siteClaimed: true, shelterTier: 2, stockpileKcal: 10000, claimX: 3, claimY: 3 };
  const packBefore = JSON.stringify(s.inventory);
  SAID = [];
  const nv = G.forkVillage();
  ok(!!nv, 'forkVillage returns the new village');
  ok(nv !== oldVillage, 'new village OBJECT (not the same reference)');
  ok(G.state.village === nv, 'state.village swapped to the fork');
  ok(nv.name !== 'Haven', 'new fire, new name');
  ok((nv.roster || []).indexOf('p1') >= 0, 'player crosses over');
  ok(s.exiled === false, 'exile ends at founding');
  ok(s.codexCut === false, 'codex cut healed: the new book is yours to write');
  ok(JSON.stringify(s.inventory) === packBefore, 'PACK KEPT across the fork');
  ok(s.knowledge && s.knowledge.plants && s.knowledge.plants.dandelion.level === 3, 'KNOWLEDGE KEPT across the fork');
  ok(s.roadExposed !== true, 'road ends: roadExposed cleared');
  ok(G.exileArcState().stage === 'home', 'arc closes to home');
  // ties start over
  ok(nv.trust.v2 === undefined && nv.trust.v3 === undefined, 'old trust ties do not cross');
  ok(!((nv.severed || {}).p1), 'no severed record in the new village');
  ok((st.pastVillages || []).indexOf(oldVillage) >= 0, 'old village archived to pastVillages (it continues without you)');
  ok(!!((oldVillage.severed || {}).p1), 'old village still holds YOUR severed record — they remember');
  ok(saidHas(/New fire, new names, same codex/), 'founding beat spoken in membership terms');
  // founding requires exile: not a free second fire
  SAID = [];
  ok(G.forkVillage() === null, 'forkVillage refuses when not exiled');
  ok(saidHas(/already have a fire/), 'refusal is spoken');
}

// ===== 4. APPLICANT UNIQUENESS =====
console.log('4. applicant uniqueness');
{
  freshWorld();
  const apps = [G.genApplicant(), G.genApplicant(), G.genApplicant()];
  ok(apps.every(Boolean), 'three applicants generated');
  ok(apps.every((a) => !!a.backstory), 'every applicant has a backstory (wrap enrichment)');
  ok(apps.every((a) => Array.isArray(a.livedEvents) && a.livedEvents.length >= 1), 'every applicant has lived events');
  ok(apps.every((a) => !!a.need && !!a.origin), 'every applicant has a need and an origin');
  const ids = apps.map((a) => a.id);
  ok(new Set(ids).size === ids.length, 'applicant ids unique');
  // genSettler: unique composed people, temperament never pre-assigned
  const settlers = [];
  for (let i = 0; i < 6; i++) settlers.push(G.genSettler());
  const sids = settlers.map((x) => x.id);
  ok(new Set(sids).size === sids.length, 'settler ids unique');
  ok(settlers.every((x) => x.temperament === null), 'temperament not pre-assigned (learned by living)');
  ok(settlers.every((x) => x.providesPerDay > 0 && x.kcalPerDay === 2000), 'settlers carry foodSupports fields');
  const stories = settlers.map((x) => x.backstory);
  ok(new Set(stories).size > 1, 'backstories composed, not a fixed cast');
}

// ===== 5. foodSupports HONESTY =====
console.log('5. foodSupports honesty');
{
  freshWorld();
  // starving village: nobody provides
  G.data.villagers = [{ id: 'v2', providesPerDay: 0, kcalPerDay: 2000 },
    { id: 'v3', providesPerDay: 0, kcalPerDay: 2000 }];
  SAID = [];
  const fs = G.foodSupportsSpeech(2);
  ok(fs.ok === false, 'foodSupports denies what the pantry cannot carry');
  ok(saidHas(/Honest math/), 'denial is SPOKEN (no silent actions)');
  ok(saidHas(/shortfall/), 'denial names the shortfall');
  // productive village: can carry one more
  G.data.villagers = [{ id: 'v2', providesPerDay: 5000, kcalPerDay: 2000 },
    { id: 'v3', providesPerDay: 5000, kcalPerDay: 2000 }];
  SAID = [];
  const fs2 = G.foodSupportsSpeech(1);
  ok(fs2.ok === true, 'foodSupports approves what the pantry can carry');
  ok(saidHas(/can carry 1 more/), 'approval is spoken too');
}

// ===== 6. READMISSION ARC =====
console.log('6. readmission arc');
{
  // 6a. refused: conditions unmet — announced, never silent
  freshWorld();
  G.exilePlayer('theft');
  G.state.scholar.day = 12; // 2 days out — too soon
  SAID = [];
  const refused = G.seekReadmission();
  ok(refused === false, 'petition refused when conditions unmet');
  ok(saidHas(/not yet/), 'refusal itemizes what is missing');
  ok(G.state.scholar.exiled === true, 'still exiled after refused petition');
  // 6b. granted: time + amends + record — announced to the village
  freshWorld();
  G.exilePlayer('theft');
  const s = G.state.scholar;
  s.day = 30; // 20 days out
  G.justiceState().amendsCredit = 25;
  SAID = [];
  const granted = G.seekReadmission();
  ok(granted === true, 'petition granted when conditions met');
  ok(!((G.state.village.severed || {}).p1), 'severed record struck — earned, not automatic');
  ok(s.exiled === false, 'exile ends on readmission');
  ok(G.isMember('p1') === true, 'membership restored');
  ok(G.exileArcState().stage === 'home', 'arc closes');
  ok(saidHas(/COME HOME/), 'readmission announced to the village');
  // 6c. not exiled: nothing to petition
  SAID = [];
  ok(G.seekReadmission() === null, 'no petition when not exiled');
}

console.log('\nseed ' + SEED + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
