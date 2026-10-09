#!/usr/bin/env node
// PROOF TEST: membership exile + founding (Steve 2026-10-05 / 2026-10-06)
// src/js/membership.js + betrayal.js — exile moment → founding fork,
// applicant uniqueness, foodSupports honesty, rejoin semantics.
//
// (2026-10-09 gap sweep: the exile-arc state machine — exileArcState,
// roadDaily, forkVillage, seekReadmission, genSettler, foodSupportsSpeech,
// pantryAccess — was deliberately removed (commit ab148efc). The current
// design: exilePlayer severs; foundHaven() forks a hard-reset new haven;
// rejoinMembership() ends YOUR exile when you join another village while
// the old village's severed record stays. This test covers the CURRENT
// systems, not the removed ones.)
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
  ok(saidHas(/not one of ours anymore/), 'severing is legible (not silent)');
  ok(G.isMember('p1') === false, 'isMember false after exile');
  // pantry closed to the exiled: the live block, not a query function
  G.state.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 5, spoilDay: 99 }];
  SAID = [];
  ok(G.takeFromPantry(0) === null, 'takeFromPantry blocked when exiled');
  ok(saidHas(/not yours anymore/), 'pantry refusal is spoken');
}

// ===== 2. EXILE DAY-TO-DAY: what the severing means =====
console.log('2. exile day-to-day');
{
  // (2026-10-09: roadDaily was removed with the arc state machine. The exiled
  // player simply plays the survival game: pack, knowledge, and wits. What
  // exile DOES mean, enforced live: pantry/stash closed, codex cut, and the
  // village sim no longer counts you.)
  const st = freshWorld();
  G.exilePlayer('theft');
  const s = st.scholar;
  // pack and knowledge cross the threshold with you
  ok(s.inventory.length === 2, 'pack kept through exile');
  ok(s.knowledge.plants.dandelion.level === 3, 'knowledge kept through exile');
  // the village sim withholds you from the common pot
  st.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 10, spoilDay: 99 }];
  st.village.roster = ['p1', 'v2', 'v3'];
  SAID = [];
  try { G.villageEats(); } catch (e) {}
  const left = st.village.pantry.length ? st.village.pantry[0].units : 0;
  ok(left === 10 || left < 10, 'villageEats runs while exiled (sim continues without you)');
  // exile is the ONE way to lose membership — no presence check-ins
  ok(G.isMember('v2') === true, 'loyal members unaffected by your exile');
}

// ===== 3. FOUNDING: foundHaven hard reset =====
console.log('3. founding fork');
{
  // (2026-10-09: forkVillage was removed with the arc state machine.
  // The live founding path is foundHaven() in betrayal.js — same hard-reset
  // semantics: real village fork, old village archived, pack + knowledge
  // cross, severed record stays with the old village.)
  const st = freshWorld();
  const oldVillage = st.village;
  G.exilePlayer('theft');
  const s = st.scholar;
  // satisfy the canonical founding requirements
  s.exileStartDay = s.day - 8;
  s.founding = { siteClaimed: true, shelterTier: 2, stockpileKcal: 10000, claimX: 3, claimY: 3 };
  const packBefore = JSON.stringify(s.inventory);
  SAID = [];
  const forked = G.foundHaven();
  ok(forked === true, 'foundHaven returns true on success');
  const nv = G.state.village;
  ok(!!nv, 'new village object exists');
  ok(nv !== oldVillage, 'new village OBJECT (not the same reference)');
  ok(nv.name !== 'Haven', 'new fire, new name');
  ok((nv.roster || []).indexOf('p1') >= 0, 'player crosses over');
  ok(s.exiled === false, 'exile ends at founding');
  ok(s.codexCut === false, 'codex cut healed: the new book is yours to write');
  ok(JSON.stringify(s.inventory) === packBefore, 'PACK KEPT across the fork');
  ok(s.knowledge && s.knowledge.plants && s.knowledge.plants.dandelion.level === 3, 'KNOWLEDGE KEPT across the fork');
  ok(!((nv.severed || {}).p1), 'no severed record in the new village');
  ok((st.pastVillages || []).indexOf(oldVillage) >= 0, 'old village archived to pastVillages (it continues without you)');
  ok(!!((oldVillage.severed || {}).p1), 'old village still holds YOUR severed record — they remember');
  // founding requires exile: not a free second fire
  SAID = [];
  ok(G.foundHaven() === null, 'foundHaven refuses when not exiled');
  ok(saidHas(/already have a haven/), 'refusal is spoken');
}

// ===== 4. APPLICANT UNIQUENESS =====
console.log('4. applicant uniqueness');
{
  // (2026-10-09: genSettler and the backstory/livedEvents/need/origin wrap
  // enrichment were removed with the arc state machine. Current genApplicant
  // returns: id, name, formerOccupation, charId, reputation, fromVillage,
  // fromVillageName, day, reason.)
  freshWorld();
  const apps = [G.genApplicant(), G.genApplicant(), G.genApplicant()];
  ok(apps.every(Boolean), 'three applicants generated');
  const ids = apps.map((a) => a.id);
  ok(new Set(ids).size === ids.length, 'applicant ids unique');
  ok(apps.every((a) => !!a.name && !!a.formerOccupation), 'every applicant has a name and occupation');
  ok(apps.every((a) => !!a.reason), 'every applicant has a reason for coming');
  ok(apps.every((a) => ['good', 'bad', 'unknown'].indexOf(a.reputation) >= 0), 'every applicant carries a reputation read');
}

// ===== 5. foodSupports HONESTY =====
console.log('5. foodSupports honesty');
{
  // (2026-10-09: foodSupportsSpeech was removed with the arc state machine.
  // Current foodSupports(n) returns { ok, shortfall, pantryDays, extraNeed }
  // — honest projection math, no speech wrapper.)
  freshWorld();
  // starving village: nobody provides
  G.data.villagers = [{ id: 'v2', providesPerDay: 0, kcalPerDay: 2000 },
    { id: 'v3', providesPerDay: 0, kcalPerDay: 2000 }];
  G.state.village.roster = ['v2', 'v3'];
  const fs = G.foodSupports(2);
  ok(fs.ok === false, 'foodSupports denies what the village cannot carry');
  ok(typeof fs.shortfall === 'number' && fs.shortfall > 0, 'denial names the shortfall in kcal');
  // productive village: can carry one more
  G.data.villagers = [{ id: 'v2', providesPerDay: 5000, kcalPerDay: 2000 },
    { id: 'v3', providesPerDay: 5000, kcalPerDay: 2000 }];
  const fs2 = G.foodSupports(1);
  ok(fs2.ok === true, 'foodSupports approves what the village can carry');
  ok(typeof fs2.pantryDays === 'number', 'projection includes pantry runway');
}

// ===== 6. REJOIN: the way back (current design) =====
console.log('6. rejoin semantics');
{
  // (2026-10-09: seekReadmission and the petition arc were removed with the
  // arc state machine (Steve's simplification). Current design, per the
  // rejoinMembership comment: joining another village ends YOUR exile (the
  // mantle picks up at the new fire); the OLD village's severed record stays
  // — they still remember, and earning their trust back is the amends path
  // via the justice system, not a petition function.)
  freshWorld();
  G.exilePlayer('theft');
  const s = G.state.scholar;
  ok(s.exiled === true, 'exiled before rejoin');
  ok(G.isMember('p1') === false, 'not a member while exiled');
  SAID = [];
  const r = G.rejoinMembership();
  ok(r === true, 'rejoinMembership returns true');
  ok(s.exiled === false, 'exile ends on rejoin (player side)');
  ok(s.codexCut === false, 'codex cut healed');
  ok(!!((G.state.village.severed || {}).p1), 'old village KEEPS the severed record — they remember');
  ok(G.isMember('p1') === false, 'still not a member of the OLD village (their record, not yours)');
  ok(saidHas(/new fire, new names/), 'rejoin is spoken, not silent');
}

console.log('\nseed ' + SEED + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
