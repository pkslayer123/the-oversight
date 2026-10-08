#!/usr/bin/env node
// PROOF TEST: journal depth — the mantle & the marginalia (Steve 2026-10-07)
//
// Plays a 3-life arc AS A PLAYER and READS the journal across it:
//  - Life 1 identifies/tastes/learns/poisons-self on dandelion, dies.
//  - Life 2 inherits the marginalia (in life 1's voice), learns mayapple,
//    goes hungry, dies.
//  - Life 3 reads both plants' journals: two dead hands, two voices.
// Asserts: voice distinction per life, knowledge visibly growing, neglect
// honesty, knowledge-gated honesty (unknown => null, never a leak).
//
// Run: node scripts/test-journal-depth-20261007.js        (default seed)
//      SEED=1 node scripts/test-journal-depth-20261007.js (other seeds)
// Deterministic: seeded mulberry32; assertions are seed-independent.
'use strict';

// ---------------- seeded RNG ----------------
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

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');

// ---------------- data ----------------
const DATA_FILES = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'],
];
global.SCATTER_DATA = {};
for (const [f, key] of DATA_FILES) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', f), 'utf8')); }
  catch (e) { global.SCATTER_DATA[key] = []; }
}
global.SCATTER_DATA.villagers = global.SCATTER_DATA.villagers || [];

// The deferred mantle wrap (journal.js) installs on a macrotask after the
// synchronous script tasks — mirroring browser load order. Await it here.
(async () => {
global.window = global; // stub for eval phase (AGENTS.md: delete before playing)
// ---------------- full production script list, index.html order ----------------
// (minus DOM-only app.js / sprites.js / tile-scenes.js / move-anim.js)
const SCRIPTS = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
];
global.window = global; // stub for eval phase (AGENTS.md: delete before playing)
for (const s of SCRIPTS) {
  const code = fs.readFileSync(path.join(ROOT, s), 'utf8');
  try { (0, eval)(code + `\n//# sourceURL=${s}`); }
  catch (e) { console.error(`EVAL FAILED: ${s}: ${e.message}`); process.exit(2); }
}
delete global.window; // sync combat path from here on
await new Promise(r => setTimeout(r, 25)); // journal.js deferred mantle wrap installs here

const Game = global.Scattering.Game;
assert(Game, 'Game loaded');
const S = global.Scattering.state;

// ---------------- minimal live state ----------------
Game.log = [];
Game.data = global.SCATTER_DATA;
Game.over = false; Game.villageLost = false; Game.won = false;
Game.state = {
  scholar: { day: 1, codexUnlocked: false, inventory: [], kcal: 1500, health: 100, poisons: [], diseases: [] },
  codex: Object.assign(S.newCodex(), { encounters: {} }), // identifyPlant writes encounters directly (game.js:23934)
  village: { roster: [], trust: {}, taught: {}, memory: {}, promises: {}, met: {}, fallen: [], day: 1 },
  systemArrived: false,
};

// playerDeath's heavy callees are outside this assignment's scope; the mantle
// wrap is what's under test. Keep them honest-but-minimal so the REAL
// ledger.js death path runs end to end.
if (!Game.progState) Game.progState = function () { return this.state._prog || (this.state._prog = {}); };
const _lineage = Game.lineage;
Game.lineage = function () { try { return _lineage.call(this); } catch (e) { const p = this.progState(); p.lineage = p.lineage || []; return p.lineage; } };
const _epithet = Game.leadershipEpithet;
Game.leadershipEpithet = function () { try { return _epithet.call(this); } catch (e) { return 'the Keeper'; } };

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------------- cast: 3 lives, pairwise-distinct registers ----------------
const ORIGINS = ['Columbus, Ohio', 'coastal Maine', 'Atlanta, Georgia', 'Seattle, Washington', 'rural Texas', 'Miami, Florida', 'Portland, Oregon', 'Chicago, Illinois'];
const usedNames = new Set(), usedOccs = new Set();
const cast = [];
for (const o of ORIGINS) {
  if (cast.length >= 3) break;
  let ch = null;
  try { ch = Game.genCharacter({ origin: o, forceCultureMatch: false, candidate: true, usedNames, usedOccs }); } catch (e) { continue; }
  if (!ch || !ch.lifeseed || !ch.lifeseed.voice) continue;
  ch.id = ch.id || ('life' + (cast.length + 1));
  const reg = ch.lifeseed.voice.register;
  if (cast.some(c => c.lifeseed.voice.register === reg)) continue; // distinct voices only
  cast.push(ch);
}
check('cast of 3 lives with pairwise-distinct registers', cast.length === 3,
  `got ${cast.length}: ${cast.map(c => (c.lifeseed.voice || {}).register).join(',')}`);
if (cast.length < 3) { console.log(`RESULTS: ${pass} pass, ${fail} fail (seed ${SEED})`); process.exit(1); }
const [L1, L2, L3] = cast;
Game.data.villagers = cast.slice();
Game.villagerId = L1.id;
Game.state.village.roster = cast.map(c => c.id);
Game.state.village.trust = { [L2.id]: 80, [L3.id]: 40 };

const regOf = (ch) => (ch.lifeseed.voice || {}).register || 'plainspoken';
const firstOf = (ch) => String(ch.name || 'Someone').split(' ')[0];
console.log(`\nCast (seed ${SEED}):`);
for (const c of cast) console.log(`  ${firstOf(c)} — ${regOf(c)} — ${c.formerOccupation || 'unknown trade'}`);

// ---------------- A. module surface ----------------
console.log('\nA. module surface');
check('mantle wrap installed on playerDeath (deferred macrotask)',
  !!(Game.playerDeath && Game.playerDeath._journalMantleWrapped));
for (const m of ['mantleRecord', 'journalVoice', 'journalVoiceFor', 'journalVoiceLine',
  'journalTouch', 'journalStaleness', 'journalOpening', 'journalPlantEntries',
  'writePlantEntry', 'plantJournalEntry', 'marginaliaFor', 'recordPlantMark',
  'plantMarks', 'recordLifeMark', 'lifeMarks', 'noteTastings', 'noteHungerNight',
  'writeEpitaph', 'welcomeBearer']) {
  check(`Game.${m} exists`, typeof Game[m] === 'function');
}

// ---------------- B. LIFE 1 ----------------
console.log('\nB. life 1 — dandelion arc');
Game.identifyPlant('dandelion', 'shown', 'Mara');
let dentries = Game.journalPlantEntries('dandelion');
check('sighting entry written', dentries.length === 1 && dentries[0].kind === 'sighting');
check('sighting in life-1 voice', dentries[0].register === regOf(L1) && dentries[0].first === firstOf(L1),
  JSON.stringify({ r: dentries[0].register, f: dentries[0].first }));
check('journal fresh (no staleness)', Game.journalStaleness() === null);

const lpOk = Game.learnPart('dandelion', 'roots', 'shown');
check('learnPart roots ok', lpOk === true);
check('partKnown roots', Game.partKnown('dandelion', 'roots') === true);
dentries = Game.journalPlantEntries('dandelion');
check('part entry written in life-1 voice',
  dentries.some(e => e.kind === 'part' && e.register === regOf(L1) && /roots/.test(e.text)));

// thin -> thicken beat
Game.recordThinKnowledge('dandelion', 'Someone said the petals make tea', 'Mara');
check('thin entry written', Game.journalPlantEntries('dandelion').some(e => e.kind === 'thin'));
Game.thickenKnowledge('dandelion', 'Mara');
check('confirm entry written, thin cleared',
  Game.journalPlantEntries('dandelion').some(e => e.kind === 'confirm')) &&
  check('thin flag cleared', Game.state.codex.plants.dandelion.thin === false);

// the plant turns: eatOne with guaranteed poison
Game.state.scholar.inventory = [{
  name: 'Dandelion greens', plantId: 'dandelion', kcalEach: 40, units: 1, edible: true,
  poisonRisk: { p: 1, note: 'bitter alkaloids' },
}];
Game.state.scholar.kcal = 500;
let poisonThrew = null;
try { Game.eatOne(0); } catch (e) { poisonThrew = e.message; }
check('eatOne ran (poison path)', poisonThrew === null, poisonThrew);
const pmarks = Game.plantMarks('dandelion');
check('poison mark recorded', pmarks.some(m => m.kind === 'poisoned'));
check('poison entry in life-1 voice',
  Game.journalPlantEntries('dandelion').some(e => e.kind === 'poison' && e.register === regOf(L1)));

// ---------------- C. DEATH 1 → LIFE 2 ----------------
console.log('\nC. the mantle passes (death 1)');
let deathThrew = null;
try { Game.playerDeath('a hushwolf'); } catch (e) { deathThrew = e.message; }
check('playerDeath ran', deathThrew === null, deathThrew);
check('successor is highest-trust candidate', Game.villagerId === L2.id, `villagerId=${Game.villagerId}`);
const m1 = Game.mantleRecord();
check('mantle recorded the dead life', m1.lives.length === 1 && m1.lives[0].cause === 'a hushwolf'
  && m1.lives[0].register === regOf(L1), JSON.stringify(m1.lives[0]));
const epitaph = m1.marginalia.find(m => m.kind === 'epitaph');
const newhand = m1.marginalia.find(m => m.kind === 'newhand');
check('epitaph in the DYING voice', epitaph && epitaph.register === regOf(L1) && epitaph.first === firstOf(L1)
  && /hushwolf/.test(epitaph.text), epitaph && epitaph.text);
check('new-hand line in the SUCCESSOR voice', newhand && newhand.register === regOf(L2)
  && newhand.text.includes(firstOf(L1)), newhand && newhand.text);

// life 2 reads the dead hand
const dj2 = Game.plantJournalEntry('dandelion');
check('life 2 sees the entry (codex persists)', !!dj2);
check('life 2 has written nothing yet', dj2.entries.length === 0);
check('marginalia carries life-1 entries', dj2.marginalia.length >= 4,
  `marginalia=${dj2.marginalia.length}`);
check('marginalia attributed to life 1 in life-1 voice',
  dj2.marginalia.every(e => e.life === L1.id && e.register === regOf(L1) && e.first === firstOf(L1)));
check('poison mark visible to the heir', dj2.marks.some(m => m.kind === 'poisoned'));

// ---------------- D. LIFE 2 ----------------
console.log('\nD. life 2 — mayapple arc + hunger');
Game.identifyPlant('mayapple', 'shown', null);
const mentries = Game.journalPlantEntries('mayapple');
check('mayapple sighting in life-2 voice (distinct from life 1)',
  mentries.length === 1 && mentries[0].register === regOf(L2) && regOf(L2) !== regOf(L1));
Game.state.scholar.kcal = 250; // genuinely hungry
const hungerOk = Game.noteHungerNight();
check('hunger night recorded', hungerOk === true);
check('hunger margin in life-2 voice',
  (Game.state.codex.journal.margins || []).some(m => m.kind === 'hunger' && m.register === regOf(L2)));
Game.state.scholar.kcal = 1500;
check('no hunger mark when fed', Game.noteHungerNight() === false);

// ---------------- E. DEATH 2 → LIFE 3 ----------------
console.log('\nE. the mantle passes (death 2)');
try { Game.playerDeath('the long winter'); } catch (e) { deathThrew = e.message; }
check('playerDeath 2 ran', deathThrew === null, deathThrew);
check('life 3 holds the journal', Game.villagerId === L3.id, `villagerId=${Game.villagerId}`);
const m2 = Game.mantleRecord();
check('two lives recorded', m2.lives.length === 2);
check('second epitaph in life-2 voice',
  m2.marginalia.some(m => m.kind === 'epitaph' && m.register === regOf(L2) && /long winter/.test(m.text)));
const dj3 = Game.plantJournalEntry('dandelion');
const hands = new Set(dj3.marginalia.map(e => e.register));
check('dandelion marginalia spans one dead hand so far', hands.size === 1 && hands.has(regOf(L1)),
  [...hands].join(','));
const mj3 = Game.plantJournalEntry('mayapple');
check('mayapple marginalia is life-2 hand', mj3.marginalia.length === 1 && mj3.marginalia[0].register === regOf(L2));
const opening = Game.journalOpening();
check('opening names 3rd bearer + both dead hands',
  opening.lives === 3 && opening.line.includes(firstOf(L1)) && opening.line.includes(firstOf(L2)),
  opening.line);

// ---------------- F. neglect ----------------
console.log('\nF. neglect honesty');
Game.state.scholar.day += 10;
const stale = Game.journalStaleness();
check('neglect stated plainly after 10 days', typeof stale === 'string' && /Neglected/.test(stale), stale);
Game.journalTouch('read');
check('reading clears staleness', Game.journalStaleness() === null);

// ---------------- G. knowledge-gated honesty ----------------
console.log('\nG. knowledge-gated honesty');
check('unknown plant: entry null', Game.plantJournalEntry('zz_unknown_plant') === null);
check('unknown plant: write refused', Game.writePlantEntry('zz_unknown_plant', 'sighting', 'x') === false);
check('unknown plant: codex line null', Game.codexPlantLine('zz_unknown_plant') === null);
check('unknown plant: gaps empty', Game.knowledgeGaps('zz_unknown_plant').length === 0);

// ---------------- H. voice table completeness ----------------
console.log('\nH. voice table completeness');
const regs = ['plainspoken', 'laconic', 'effusive', 'wry', 'formal', 'halting'];
const kinds = ['sighting', 'tasting', 'deeper', 'part', 'handling', 'confirm', 'thin',
  'mastery', 'poison', 'hunger', 'triumph', 'epitaph', 'newhand'];
let voiceHoles = [];
for (const r of regs) for (const k of kinds) {
  const t = Game.journalVoiceLine(k, { register: r, mood: 'steady', first: 'Test' },
    { pname: 'Dandelion', extra: 'x. ', part: 'roots', use: 'coffee', kl2: 'x', kl3: 'x',
      note: 'x', cause: 'the wild', oldFirst: 'Mara', teacher: 'Mara', text: 'x' });
  if (!t || !t.trim()) voiceHoles.push(`${r}/${k}`);
}
check('all 78 voice lines non-empty', voiceHoles.length === 0, voiceHoles.slice(0, 5).join(','));

// ---------------- read it like a player ----------------
function fmtEntry(e) { return `    Day ${e.day} — ${e.first} [${e.register}/${e.kind}]: "${e.text}"`; }
function printPlant(pid) {
  const j = Game.plantJournalEntry(pid);
  console.log(`\n===== JOURNAL: ${pid} =====`);
  if (!j) { console.log('  (unknown — nothing shows)'); return; }
  console.log(`  ${j.line}`);
  if (j.entries.length) { console.log('  -- this hand --'); j.entries.forEach(e => console.log(fmtEntry(e))); }
  if (j.marginalia.length) { console.log('  -- marginalia (other hands) --'); j.marginalia.forEach(e => console.log(fmtEntry(e))); }
  if (j.marks.length) console.log('  marks: ' + j.marks.map(m => `${m.kind} d${m.day}: ${m.note}`).join(' | '));
  if (j.gaps.length) console.log('  still unknown: ' + j.gaps.join(' '));
}
printPlant('dandelion');
printPlant('mayapple');
console.log('\n===== MANTLE MARGINALIA =====');
for (const m of Game.mantleRecord().marginalia) console.log(fmtEntry(m));
console.log('\n===== OPENING =====');
console.log('  ' + Game.journalOpening().line);
console.log('  staleness: ' + Game.journalOpening().staleness);
console.log('\n===== HUNGER MARGINS =====');
for (const m of (Game.state.codex.journal.margins || [])) console.log(fmtEntry(m));

console.log(`\nRESULTS: ${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
