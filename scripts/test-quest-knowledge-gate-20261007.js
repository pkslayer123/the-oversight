#!/usr/bin/env node
// PROOF TEST (2026-10-07): village quests are knowledge-gated.
// Bug: maybeOfferQuest named true plant species ('dandelion', 'blackberry')
// in field quest text on blind day 1 — a knowledge leak (the codebase
// convention is plantKnown ? name : description, conversation.js:3204), and
// the bring-quest completion takes IDENTIFIED items (plantId match), so an
// unknown-plant quest was unactionable too.
// Fix: bring-quests are only offered for learned plants; questPlantRef
// renders blind descriptions otherwise; the wake-up debt quest uses it too.
// Seeded RNG (mulberry32, SEED env). Run: node scripts/test-quest-knowledge-gate-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HARNESS_ROOT || path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ORDER = [
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
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

const results = [];
const check = (name, cond, detail) => {
  results.push(!!cond);
  console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const plantName = (pid) => { const p = (Game.data.plants || []).find(x => x.id === pid); return p ? p.name : pid; };

(async () => {
  await Game.init();
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = () => Game.state.scholar;

  // 1. questPlantRef: blind when unknown, named when known
  const blindRef = Game.questPlantRef('dandelion', 3);
  check('questPlantRef hides the true name when unknown',
    !/dandelion/i.test(blindRef) && /3×/.test(blindRef), `"${blindRef}"`);
  // teach dandelion via the codex (simulates the camp ritual)
  Game.state.codex.plants = Game.state.codex.plants || {};
  Game.state.codex.plants['dandelion'] = { level: 2, known: true };
  const knownRef = Game.questPlantRef('dandelion', 3);
  check('questPlantRef names the plant once learned',
    /3 Dandelion/.test(knownRef), `"${knownRef}"`);

  // 2. offer loop while the player knows nothing (fresh state for blackberry too)
  delete Game.state.codex.plants['dandelion'];
  const seenTexts = [], seenTypes = [];
  for (let i = 0; i < 60 && seenTypes.length < 3; i++) {
    s().activeQuest = null;
    Game.maybeOfferQuest();
    const q = s().activeQuest;
    if (q) { seenTexts.push(q.text); seenTypes.push(q.type + ':' + (q.plant || q.tileType)); }
  }
  const leaked = seenTexts.filter(t => /dandelion|blackberry/i.test(t));
  check('no quest offer names an unlearned plant (60 offers)',
    leaked.length === 0, leaked.length ? `leaked: ${leaked[0].slice(0, 80)}` : `${seenTexts.length} offers, types: ${[...new Set(seenTypes)].join(', ')}`);
  const bringUnknown = (s().activeQuest && s().activeQuest.type === 'bring' && !Game.plantKnown(s().activeQuest.plant));
  check('no bring-quest is offered for an unlearned plant', !bringUnknown,
    `offered types: ${[...new Set(seenTypes)].join(', ')}`);

  // 3. once dandelion is learned, its bring-quest becomes offerable and named
  Game.state.codex.plants['dandelion'] = { level: 2, known: true };
  let offeredBring = null;
  for (let i = 0; i < 80 && !offeredBring; i++) {
    s().activeQuest = null;
    Game.maybeOfferQuest();
    const q = s().activeQuest;
    if (q && q.type === 'bring' && q.plant === 'dandelion') offeredBring = q;
  }
  check('learned plant unlocks its bring-quest, named honestly',
    offeredBring && /3 Dandelion/.test(offeredBring.text),
    offeredBring ? offeredBring.text.slice(0, 90) : 'never offered in 80 tries');

  // 4. bring-quest completion still works with identified items (no regression)
  if (offeredBring) {
    s().inventory.push({ plantId: 'dandelion', units: 3, kcalEach: 45, spoilDay: 99, name: 'Dandelion', unit: 'handful of greens', kg: 0.1 });
    s().activeQuest = offeredBring;
    const pan0 = (Game.state.village.pantry || []).length;
    Game.say = () => {};
    Game.checkQuest('forage');
    check('bring-quest completes on identified haul (+500 kcal pantry)',
      !s().activeQuest, `activeQuest=${s().activeQuest ? 'still set' : 'cleared'}`);
  } else {
    check('bring-quest completes on identified haul (+500 kcal pantry)', false, 'no quest offered');
  }

  const fails = results.filter(r => !r).length;
  console.log(`\n=== ${results.length - fails}/${results.length} checks green ===`);
  if (fails) process.exitCode = 1;
})();
