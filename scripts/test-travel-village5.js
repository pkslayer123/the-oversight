// BREAK-IT: TRAVEL & MAP round 5 (2026-10-09) — village card fog leak +
// remote-petition travel bypass.
// ATTACKS:
//   V1 FOG: the world-map tap handler called Game.villageCard() for ANY
//       generated village on the tapped tile — no seenTiles gate — so tapping
//       fogged tiles leaked undiscovered villages by NAME, population, and
//       focus. (renderMap already gated the icon; the card bypassed it.)
//   V2 EXPLOIT: petitionVillage had no proximity gate — an exile could tap a
//       distant (but seen) village tile and JOIN it remotely: no travel, no
//       danger, and the probation clock only ticks at their fire, so you'd
//       be "in" while standing miles away. villageTalk/villageShareFood/
//       studyVillageCodex all gate on proximity — petition was the outlier.
//   V3 HONESTY: the exile card offered "Approach & petition" from across the
//       map — a button promising an approach it couldn't make.
// Usage: node scripts/test-travel-village5.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-village5.js    (pre-fix HEAD code)
//        SEED=999 node scripts/test-travel-village5.js   (seed override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let betrayalSrc, gameSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/betrayal.js > /tmp/bv5-betrayal-before.js', { cwd: ROOT });
  execSync('git show HEAD:src/js/game.js > /tmp/bv5-game-before.js', { cwd: ROOT });
  betrayalSrc = fs.readFileSync('/tmp/bv5-betrayal-before.js', 'utf8');
  gameSrc = fs.readFileSync('/tmp/bv5-game-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix betrayal.js + game.js from git HEAD)');
} else {
  betrayalSrc = fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8');
  gameSrc = null;
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
// SEED BEFORE EVAL: modules capture Math.random at load (AGENTS.md).
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
// FULL module list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', '__GAME__', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', '__BETRAYAL__', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = f === '__BETRAYAL__' ? betrayalSrc
    : f === '__GAME__' ? (gameSrc || fs.readFileSync(path.join(ROOT, 'src/js', 'game.js'), 'utf8'))
    : fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  if (Game.tbfight) Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 9000; s.hydration = 100; s.health = 100;
  s.exiled = true; s.drifting = true;
  Game.map.px = 4; Game.map.py = 4;
  Game.state.otherVillages = [{
    id: 'vtest', name: 'Ashford', x: 0, y: 0, generated: true,
    population: 6, day: 40, knowledgeProfile: { focus: 'fisher' },
    trust: 0, codex: { plants: {} },
  }];
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  let r; try { r = fn(); } finally { Game.say = origSay; }
  return { r, says };
}

// ---- V1. FOG: villageCard on an UNSEEN tile ----
{
  setup();
  ok('V1 setup: tile (0,0) is fogged', Game.mapSeen(0, 0) === null);
  const card = Game.villageCard('vtest');
  if (BEFORE) {
    ok('BEFORE: fogged-tile village card leaks the name', !!(card && card.name === 'Ashford'),
      'card=' + (card && card.name));
    ok('BEFORE: leak includes population/focus', !!(card && /people/.test(card.sub) && /fishing folk/.test(card.sub)),
      'sub=' + (card && card.sub));
  } else {
    ok('AFTER: fogged-tile village card is withheld', card === null, 'card=' + JSON.stringify(card));
    // the designed channel still works: walk there (mark seen), the card reads
    Game.markSeen(0, 0, 'visited');
    const card2 = Game.villageCard('vtest');
    ok('AFTER: seen-tile village card still reads', !!(card2 && card2.name === 'Ashford'));
  }
}

// ---- V2. EXPLOIT: remote petition from across the map ----
{
  setup();
  Game.markSeen(0, 0, 'visited'); // seen, but 8 tiles away
  const { r, says } = captureSay(() => Game.petitionVillage('vtest'));
  const joined = Game.state.scholar.joinedVillage === 'vtest';
  const judged = says.some(m => /listens|turns you away|Probation|Fourteen days/.test(m));
  if (BEFORE) {
    ok('BEFORE: remote petition proceeds to judgment (no proximity gate)', judged || joined,
      'says=' + says.join(' | ').slice(0, 160));
  } else {
    ok('AFTER: remote petition refused', r === false, 'returned ' + r);
    ok('AFTER: not joined from afar', !joined);
    ok('AFTER: refusal names the walk', says.some(m => /face to face/i.test(m)),
      'says=' + says.join(' | ').slice(0, 160));
  }
}

// ---- V3. HONESTY: the exile card's petition button vs distance ----
{
  setup();
  Game.markSeen(0, 0, 'visited');
  const far = Game.villageCard('vtest');
  const farPetition = (far.actions || []).some(a => a.id === 'petition');
  if (BEFORE) {
    ok('BEFORE: card offers "Approach & petition" from 8 tiles away', farPetition);
  } else {
    ok('AFTER: card withholds petition from afar', !farPetition);
    ok('AFTER: card hints the walk instead', !!(far.hint && /face to face/i.test(far.hint)),
      'hint=' + far.hint);
  }
  // walk to their fire: the button (and the engine) must work there
  Game.map.px = 0; Game.map.py = 1;
  const near = Game.villageCard('vtest');
  ok('near tile: card offers petition at their fire',
    (near.actions || []).some(a => a.id === 'petition'));
  const { r, says } = captureSay(() => Game.petitionVillage('vtest'));
  ok('near tile: engine does not refuse on proximity',
    !says.some(m => /face to face/i.test(m)), 'says=' + says.join(' | ').slice(0, 160));
}

// ---- V4. SIBLING UNIFORMITY: talk/sharefood already gate (regressions) ----
{
  setup();
  Game.markSeen(0, 0, 'visited');
  const t = captureSay(() => Game.villageTalk('vtest'));
  ok('villageTalk still refuses from afar', t.r === null && t.says.some(m => /face to face/i.test(m)));
  const f = captureSay(() => Game.villageShareFood('vtest', {}));
  // exiles get the petition redirect; non-exiles get the walk-first line — both refuse
  ok('villageShareFood still refuses from afar', f.r === null && f.says.some(m => /Walk there first|Petition them instead/i.test(m)));
}

// ---- V5. HONESTY: tryNodeExit must not report a crossing that never happened ----
{
  setup();
  Game.state.scholar.insideHaven = false; // on the grounds, not in the hall
  Game.over = true;
  const r = Game.tryNodeExit(1, 0); // node crossing attempt while dead
  if (BEFORE) {
    ok('BEFORE: tryNodeExit reports moved:true when travelTo refused (over)', r && r.moved === true);
  } else {
    ok('AFTER: tryNodeExit reports moved:false when travelTo refused (over)', r && r.moved === false,
      'moved=' + (r && r.moved));
  }
  Game.over = false;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
