#!/usr/bin/env node
// PROOF: break-it knowledge system r2 (2026-10-09).
// Hostile-player attacks on the knowledge system:
//   A. HONESTY: codexEntries().text (p.codex) shown at L1 leaks L2/L3 claims
//      (parts/uses) while the card itself labels levels "L1 Named, L2 Parts,
//      L3 Uses, L4 Mastery". The full designer summary must wait for mastery.
//   B. HONESTY: believed-wrong plants (wrongAs) — the codex card headlines
//      the false name "(as taught)", but inventory/pantry/grid/forage/journal
//      surfaces showed the TRUE name, collapsing the wrong-teaching fiction.
//      Every player-facing name display must say what the player believes.
//   C. EXPLOIT: repeated identify/teach/trade must not farm XP, trust, or
//      knowledge (identifyPlant once; trust caps at 40; trade is one-shot).
//   D. WIRING: the learnFromShowing -> teachPlant -> identifyPlant chain is
//      live (haulTeachingMoment teaches parts for real, not narration);
//      all six knowledge modules load in index.html order.
//   E. SOFTLOCK: empty haul / unknown plant / duplicate facts never wedge.
// Deterministic: mulberry32 seeded BEFORE module eval (modules capture
// Math.random at load). SEED env override. Run across >=3 seeds.
// Steve's fix-verification chain: runnable proof, before/after behavior.
'use strict';

const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
Math.random = rng; // installed BEFORE eval: load-time captures stay deterministic

// equipment.js needs `window` at load; delete it after eval so runtime checks
// take the sync path (AGENTS.md: NODE HARNESS window-stub lesson).
globalThis.window = globalThis;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/
// move-anim.js/drama.js). build.js kept: it evals clean in node.
const MODULES = [
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
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of MODULES) {
  try {
    eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  } catch (e) {
    console.error(`HARNESS FAIL eval ${f}: ${e.message}`);
    process.exit(2);
  }
}
const Game = globalThis.Scattering.Game;
if (!Game) { console.error('HARNESS FAIL: no Game'); process.exit(2); }
delete globalThis.window;

const PLANTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plants.json'), 'utf8'));
const plantList = Array.isArray(PLANTS) ? PLANTS : (PLANTS.plants || []);
const VILLAGERS = [
  { id: 'player', name: 'You', formerOccupation: 'accountant', intelligence: { primary: 'steady' }, personality: { temperament: 'steady' } },
  { id: 'mara', name: 'Mara Voss', formerOccupation: 'cook', intelligence: { primary: 'practical' }, personality: { temperament: 'warm' } },
  { id: 'jesse', name: 'Jesse Park', formerOccupation: 'laborer', intelligence: { primary: 'steady' }, personality: { temperament: 'cautious' } },
  { id: 'ren', name: 'Ren Ito', formerOccupation: 'librarian', trader: true, intelligence: { primary: 'analytical' }, personality: { temperament: 'steady' } },
];

let messages = [];
function freshState() {
  messages = [];
  Game.state = {
    codex: { plants: {}, encounters: {}, people: {}, learnThreshold: {}, notes: [] },
    scholar: { day: 6, kcal: 2000, inventory: [], mx: 4, my: 4, originTags: ['temperate'], integration: 5 },
    village: {
      roster: ['player', 'mara', 'jesse', 'ren'],
      trust: { mara: 80, jesse: 10, ren: 80 },
      taught: { mara: ['dandelion', 'chickweed'], jesse: ['dandelion'], ren: ['dandelion', 'chickweed', 'ghostroot'], player: ['dandelion'] },
      met: {}, wrongAbout: {},
    },
    systemArrived: false, over: false,
  };
  Game.data = Game.data || {};
  Game.data.plants = plantList;
  Game.data.villagers = VILLAGERS;
  Game.data.monsters = [];
  Game.data.characterGen = Game.data.characterGen || { goals: [{ id: 'feed', want: 'feed everyone' }], languages: [] };
  Game.villagerId = 'player';
  Game.map = { px: 0, py: 0 };
  // neutralize noisy peripherals; count what matters
  Game._sayLog = [];
  const origSay = Game.say;
  Game.say = function (m) { Game._sayLog.push(String(m)); };
  Game._integrateCalls = 0;
  const origIntegrate = Game.integrate;
  Game.integrate = function (a, r) { Game._integrateCalls++; return origIntegrate.call(this, a, r); };
  Game.audioEvent = function () {};
  Game.drama = function () {};
  Game.tickAction = function () { return null; };
  Game.setEngaged = function () {};
}
freshState();

let n = 0, failures = 0;
function check(name, fn) {
  n++;
  try { fn(); console.log(`  ok ${n}. ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${n}. ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function codexEntry(pid) {
  return (Game.codexEntries() || []).find(e => e.pid === pid);
}
const dand = () => plantList.find(p => p.id === 'dandelion');
const chick = () => plantList.find(p => p.id === 'chickweed');

console.log(`== break-it knowledge r2 (seed ${SEED}) ==`);

// ---------- A. HONESTY: codex text gate ----------
check('A1: L1 entry shows level text but NOT the full codex summary', () => {
  freshState();
  assert(Game.identifyPlant('dandelion', 'test'), 'identify should succeed');
  const e = codexEntry('dandelion');
  assert(e, 'entry listed');
  assert(e.level === 1, 'level 1');
  assert(e.knowledge === (dand().knowledgeLevels || {})['1'], 'knowledge = L1 text only');
  const leakWords = ['Every part is edible', 'leaves, flowers, roots', 'roast for coffee', 'vitamin C'];
  const text = e.text || '';
  for (const w of leakWords) assert(!text.includes(w), `L1 text must not contain L2/L3 claim: "${w}" (got: ${text.slice(0, 80)})`);
});
check('A2: L4 (mastery) entry earns the full codex summary', () => {
  freshState();
  Game.identifyPlant('dandelion', 'test');
  Game.state.codex.plants.dandelion.level = 4;
  const e = codexEntry('dandelion');
  assert(e.text === dand().codex, 'mastery shows the full summary');
});
check('A3: L2/L3 entries still gate the summary (no partial leak)', () => {
  freshState();
  Game.identifyPlant('dandelion', 'test');
  for (const lvl of [2, 3]) {
    Game.state.codex.plants.dandelion.level = lvl;
    const e = codexEntry('dandelion');
    assert(!e.text, `L${lvl} must not show the full summary`);
    assert(e.knowledge === (dand().knowledgeLevels || {})[String(lvl)], `L${lvl} shows its own level text`);
  }
});

// ---------- B. HONESTY: believed-wrong name consistency ----------
function teachWrong() {
  freshState();
  // mara is wrong about dandelion: believes it is chickweed
  Game.state.village.wrongAbout = { mara: { dandelion: { wrongPid: 'chickweed', deliberate: false } } };
  const r = Game.wrongTeaching('mara', 'dandelion', 'taught');
  assert(r === 'taught-wrong', 'lesson lands wrong, got ' + r);
  const e = Game.state.codex.plants.dandelion;
  assert(e && e.wrongAs === 'Chickweed', 'entry carries the false label');
  return e;
}
check('B1: plantDisplayName says what the player believes', () => {
  teachWrong();
  assert(Game.plantDisplayName('dandelion') === 'Chickweed',
    `inventory/pantry funnel must show the believed name, got "${Game.plantDisplayName('dandelion')}"`);
});
check('B2: itemDisplayName follows the believed name', () => {
  teachWrong();
  const nm = Game.itemDisplayName({ plantId: 'dandelion', name: 'Dandelion', units: 3 });
  assert(nm === 'Chickweed', `pack label must show believed name, got "${nm}"`);
});
check('B3: grid/forage surfaces say what the player believes', () => {
  teachWrong();
  const here = Game.speciesHereLine('dandelion');
  assert(/chickweed/i.test(here), `here-list must use believed name, got "${here}"`);
  const rec = Game.speciesRecognition('dandelion');
  assert(/Chickweed/.test(rec), `recognition line must use believed name, got "${rec}"`);
  const q = Game.questPlantRef('dandelion', 3);
  assert(q === '3 Chickweed', `quest text must use believed name, got "${q}"`);
  const line = Game.codexPlantLine('dandelion');
  assert(line.indexOf('Chickweed') === 0, `codex progress line must lead with believed name, got "${line}"`);
});
check('B4: true name returns after the record corrects itself', () => {
  teachWrong();
  assert(Game.resolveWrongName('dandelion', 'test') === true, 'resolve fires');
  assert(Game.plantDisplayName('dandelion') === 'Dandelion', 'true name restored');
  assert(!Game.state.codex.plants.dandelion.wrongAs, 'false label gone');
});
check('B5: mechanics still key off the real pid under a false label', () => {
  teachWrong();
  assert(Game.plantKnown('dandelion') === true, 'plantKnown true (lvl>=1)');
  assert(Game.canShow('plant', 'dandelion', 'name') === true, 'name gate passes on real pid');
});

// ---------- C. EXPLOIT: no farming ----------
check('C1: identifyPlant is one-shot (no repeat XP)', () => {
  freshState();
  Game._integrateCalls = 0;
  assert(Game.identifyPlant('dandelion', 'test') === true, 'first identify works');
  const calls = Game._integrateCalls;
  assert(calls >= 1, 'first identify granted integrate XP');
  assert(Game.identifyPlant('dandelion', 'test') === false, 'second identify refused');
  assert(Game._integrateCalls === calls, 'no XP on repeat');
});
check('C2: teachPlant trust cannot pass 40, no matter how many lessons', () => {
  freshState();
  Game.state.village.trust.jesse = 10;
  // jesse (laborer, low trust) gives bad-education lessons: 3 ticks each, free to repeat
  for (let i = 0; i < 30; i++) Game.teachPlant('jesse', 'dandelion');
  const t = Game.state.village.trust.jesse;
  assert(t <= 40, `trust capped at 40, got ${t}`);
  assert(t > 10, 'but lessons still build some trust');
});
check('C3: tradeKnowledge sells rungs, not repeats (two buys, then honest refusal)', () => {
  freshState();
  // ren is a librarian-trader; price at trust 80 = 'trust' (free) — the farmable case
  const pool = Game.traderKnowledge('ren');
  assert(pool.length > 0, 'trader has a pool');
  const pid = pool[0];
  const r1 = Game.tradeKnowledge('ren', pid);
  assert(r1 === 'ok', 'first trade works, got ' + r1);
  assert(Game.state.codex.plants[pid].level === 2, 'first buy: L0 -> L2');
  const r2 = Game.tradeKnowledge('ren', pid);
  assert(r2 === 'ok', 'second trade buys the last rung, got ' + r2);
  assert(Game.state.codex.plants[pid].level === 3, 'second buy: L2 -> L3');
  const r3 = Game.tradeKnowledge('ren', pid);
  assert(r3 === 'known', `third trade must refuse honestly, got ${r3}`);
  assert(Game.state.codex.plants[pid].level === 3, 'no level change on refusal');
});
check('C4: gossip/ask loops cannot re-journal the same fact (no reward spam)', () => {
  freshState();
  Game.state.village.met = { mara: true };
  const first = Game.journalLearn('mara', 'name', 'Mara', { how: 'told' });
  assert(first === true, 'first learn is new');
  const sayCount = Game._sayLog.length;
  const second = Game.journalLearn('mara', 'name', 'Mara', { how: 'told' });
  assert(second === false, 'repeat learn is not new');
  assert(Game._sayLog.length === sayCount, 'no reward line on repeat');
});

// ---------- D. WIRING: the teaching chain is live ----------
check('D1: all six knowledge modules attached their API', () => {
  freshState();
  const need = ['journalLearn', 'plantPartsList', 'learnPart', 'recordThinKnowledge',
    'thickenKnowledge', 'learnFromShowing', 'haulTeachingMoment', 'codexPlantLine',
    'knowledgeGaps', 'forageCue', 'plantJournalEntry', 'journalOpening',
    'perceptionHints', 'teachPlant', 'identifyPlant', 'plantKnown',
    'codexEntries', 'codexInProgress', 'convoAskTopic', 'doubtsHTML'];
  for (const f of need) assert(typeof Game[f] === 'function', `Game.${f} must exist`);
  const Ex = globalThis.Scattering.Examine;
  assert(Ex && typeof Ex.examinePlantCell === 'function', 'Scattering.Examine.examinePlantCell must exist');
  assert(Ex && typeof Ex.examineDescription === 'function', 'Scattering.Examine.examineDescription must exist');
});
check('D2: haulTeachingMoment teaches parts for real (not narration into the void)', () => {
  freshState();
  // staged haul: 3 dandelion units on the counter; mara (cook, trust 80) can teach it
  const items = [
    { plantId: 'dandelion', units: 2, name: 'dandelion' },
    { plantId: 'dandelion', units: 1, name: 'dandelion' },
  ];
  const r = Game.haulTeachingMoment(items, { maxLessons: 2 });
  assert(r && r.lessons.length === 1, `one lesson from the haul, got ${JSON.stringify(r)}`);
  const L = r.lessons[0];
  assert(L.pid === 'dandelion' && L.outcome === 'shown-deep',
    `demonstration lesson, got ${JSON.stringify(L)}`);
  const e = Game.state.codex.plants.dandelion;
  assert(e && e.level >= 2, 'parts knowledge landed (L2+)');
  assert(Game.partKnown('dandelion', 'roots'), 'roots part known');
  assert(e.demonstrated === true, 'demonstrated flag set');
});
check('D3: examine never names the unknown (knowledge gate on the cheap look)', () => {
  freshState();
  const Ex = globalThis.Scattering.Examine;
  const desc = Ex.examineDescription('dandelion', 3);
  assert(!/dandelion/i.test(desc), `examine must not name it, got "${desc}"`);
  const p = dand();
  assert(/jagged|rosette|yellow/i.test(desc) || (p.description && desc.length > 10), 'but it says something useful');
});

// ---------- E. SOFTLOCK: nothing wedges ----------
check('E1: unteachable haul is honest, not silent, and returns clean', () => {
  freshState();
  // pokeweed: in the data, but nobody in the village knows it — teachable
  // species with no teachers. The moment must say so honestly.
  const r = Game.haulTeachingMoment([{ plantId: 'pokeweed', units: 2 }], { maxLessons: 2 });
  assert(r && Array.isArray(r.lessons) && r.lessons.length === 0, 'no lessons');
  assert(Game._sayLog.some(m => /nobody|your own hands/i.test(m)), 'honest line said');
});
check('E2: journal ops on unknown plants fail closed (no crash, no entry)', () => {
  freshState();
  assert(Game.writePlantEntry('nope_not_a_plant', 'sighting', 'x') === false, 'no entry for unknown');
  assert(Game.learnPart('nope_not_a_plant', 'roots', 'shown') === false, 'no part for unknown');
  assert(Game.plantJournalEntry('nope_not_a_plant') === null, 'null render for unknown');
  assert(Game.codexPlantLine('nope_not_a_plant') === null, 'null line for unknown');
});
check('E3: doubts resolve when the villager is gone (no permanent open thread)', () => {
  freshState();
  const d = Game.addDoubt ? Game.addDoubt('mara', 'contradiction', 'said two different things') : null;
  if (!d) { console.log('    (addDoubt not exposed; skipping)'); return; }
  assert(Game.getDoubts('mara').some(x => !x.resolved), 'doubt open');
  Game.closeDoubtsForGone('mara');
  const open = Game.getDoubts('mara').filter(x => !x.resolved);
  assert(open.length === 0, 'gone closes the thread');
});

console.log(failures ? `\n${failures}/${n} FAILED` : `\n${n}/${n} green`);
process.exit(failures ? 1 : 0);
