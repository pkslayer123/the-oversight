// BREAK-IT: TRAVEL & MAP — EXPLOIT: travel-spam needs manipulation (Steve 2026-10-08).
// ATTACK: node travel is FREE (no kcal, no ticks — Steve 2026-10-05). travelTo()
// calls travelTimeStep() on EVERY crossing, which ran tickNeeds() + spreadGossip()
// unconditionally. A hostile player pacing back and forth between two adjacent
// tiles got unlimited "portions of the day": NPC fear -> 0, energy -> 100,
// hunger -> 100, grief/cheer decayed, gossip fast-forwarded — with zero player
// cost (dayTicks unchanged, kcal unchanged, day never advances). Hunger 100
// then drives mass foraging departures on the next advancePart -> pantry food.
// FIX: travelTimeStep() only runs its world-advance when the player's clock
// (dayTicks) has moved since the last step. Real journeys still advance the
// world; zero-cost pacing does not.
// REPRICED (break-it travel r7 2026-10-09): the 1-tick re-arm defeated the
// moved-at-all gate (a full part-scale step per ~2 player ticks). Now each
// travel banks elapsed ticks and every 128 banked releases one step; the
// first crossing (ever / per day) keeps its designed free step.
// Usage: node scripts/test-break-travel-spam-20261008.js        (AFTER fix)
//        BEFORE=1 node scripts/test-break-travel-spam-20261008.js (pre-fix code from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt-game-before.js', { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}

const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}

let _seed = 424242;
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = s; };
Math.random = rng;

global.window = global;
const gameFile = BEFORE ? '/tmp/bt-game-before.js' : path.join(ROOT, 'src/js/game.js');
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', null, 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const p = f === null ? gameFile : path.join(ROOT, 'src/js', f);
  try { eval(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// Isolate the needs/gossip mechanics: encounters/animals are separate systems.
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

const SEED = parseInt(process.env.SEED || "424242", 10); rng.reset(SEED);
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
const s = Game.state.scholar;
s.health = 100; s.kcal = 2000;
Game.state.over = false;

const v = Game.state.village;
const rid = (v.roster || []).find(id => id !== Game.villagerId);
if (!rid) { console.error('no NPC roster'); process.exit(2); }
// hostile setup: one NPC at fear 80 / energy 10 / hunger 10
const n = Game.npcNeeds(rid);
n.fear = 80; n.energy = 10; n.hunger = 10;
v.grief = 5;

// pick an unblocked adjacent tile to pace against
const ax = Game.map.px, ay = Game.map.py;
const tgt = Game.travelTargets().find(t => Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1 && !Game.travelBlockage(t.x, t.y));
if (!tgt) { console.error('no unblocked adjacent tile'); process.exit(2); }

const kcalBefore = s.kcal, ticksBefore = s.dayTicks || 0;
// SPAM: 30 free boundary crossings, A <-> B
for (let i = 0; i < 30; i++) {
  const dest = (Game.map.px === ax && Game.map.py === ay) ? tgt : { x: ax, y: ay };
  const r = Game.travelTo(dest.x, dest.y);
  if (!r && !(r && r.moved)) { /* travelTo returns null on success-path too; only blockage objects matter */ }
}
const nAfter = Game.npcNeeds(rid);

console.log(`  [info] after 30 spam travels: fear ${nAfter.fear}, energy ${nAfter.energy}, hunger ${nAfter.hunger}, grief ${v.grief}, dayTicks ${s.dayTicks}, kcal ${s.kcal}`);

if (BEFORE) {
  // the exploit, demonstrated: zero-cost world manipulation
  ok('BEFORE: spam zeroes NPC fear (exploit real)', nAfter.fear === 0, `fear=${nAfter.fear}`);
  ok('BEFORE: spam maxes NPC energy (exploit real)', nAfter.energy === 100, `energy=${nAfter.energy}`);
  ok('BEFORE: spam maxes NPC hunger (exploit real)', nAfter.hunger === 100, `hunger=${nAfter.hunger}`);
  ok('BEFORE: player paid nothing (dayTicks)', (s.dayTicks || 0) === ticksBefore, `dayTicks=${s.dayTicks}`);
  ok('BEFORE: player paid nothing (kcal)', s.kcal === kcalBefore, `kcal=${s.kcal}`);
} else {
  // the fix: the FIRST crossing advances the world one portion (by design —
  // "moving between nodes is a BIG time step"), but crossings 2..30 with no
  // time spent between them advance it ZERO further. One tickNeeds total.
  ok('AFTER: 30 spams = exactly one world-step (fear)', nAfter.fear === 72, `fear=${nAfter.fear}`);
  ok('AFTER: 30 spams = exactly one world-step (energy)', nAfter.energy === 14, `energy=${nAfter.energy}`);
  ok('AFTER: 30 spams = exactly one world-step (hunger)', nAfter.hunger === 18, `hunger=${nAfter.hunger}`);
  ok('AFTER: 30 spams = exactly one world-step (grief)', v.grief === 4, `grief=${v.grief}`);
  // design preserved: spend real time, then travel DOES advance the world.
  // REPRICED (break-it travel r7 2026-10-09): the world-step is a day-part
  // (128 ticks) of needs+gossip, so a travel only earns one after a part's
  // worth of banked clock. 32 ticks no longer buys it — the honest price is
  // the honest price.
  Game.tickAction(128);
  const f0 = Game.npcNeeds(rid).fear;
  const here = { x: Game.map.px, y: Game.map.py };
  const back = (here.x === ax && here.y === ay) ? tgt : { x: ax, y: ay };
  Game.travelTo(back.x, back.y);
  const f1 = Game.npcNeeds(rid).fear;
  ok('AFTER: real travel (after time spent) still advances needs', f1 === f0 - 8, `fear ${f0} -> ${f1}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
