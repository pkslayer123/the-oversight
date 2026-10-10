// BREAK-IT: disease alien-pool enforcement + honest surfaces (2026-10-10).
// Hostile player vs the two-pools law (docs/DISEASES.md: mundane = real
// diseases, earthly cures; alien = monster bites/meat, NEVER diagnosed,
// eased, or cured by mundane medicine).
//
// Attacks:
//   E1 EXPLOIT: Game.cureStatus('scholar','eurika') — the engine's generic
//       cure path has NO pool guard. Pre-fix it deletes a permanent alien
//       infection. Canon: earthly medicine does nothing to alien biology.
//   E2 EXPLOIT: Game.diagnoseDisease('scholar','lemons') — no pool guard.
//       Pre-fix it names an alien disease + writes it into codex.diseases.
//   E3 EXPLOIT: Game.easeDisease('scholar','eurika',5) — no pool guard.
//       Pre-fix it halves the alien tick (easedUntil set).
//   H1 HONESTY: HUD chips show the alien TRUE NAME ("Eurika") with title
//       "Undiagnosed — examine (You) to identify", but examineSick() on an
//       alien-only bearer says "You're not sick. Nothing to examine." —
//       the chip promises an identification path that does not exist.
//   H2 HONESTY: examineSick() with ONLY an alien condition says
//       "You're not sick." — a lie; something is in you.
//   D1 DEAD CODE: the Afflictions panel (descriptions, transformations,
//       the only readable surface for a condition) renders ONLY mundane
//       diseases (sickDiseases()). Alien conditions — the min-max building
//       blocks Steve wants players to SEEK — have no readable surface; the
//       9 transformation texts are never displayed anywhere.
// Usage: node scripts/test-disease-break-alien-20261010.js
//        BEFORE=1 node scripts/test-disease-break-alien-20261010.js  (pre-fix)
//        SEED=999 node scripts/test-disease-break-alien-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
function headSrc(p) {
  const tmp = `/tmp/bda-before-${p.replace(/\//g, '_')}`;
  execSync(`git show HEAD:${p} > ${tmp}`, { cwd: ROOT });
  return fs.readFileSync(tmp, 'utf8');
}
const gameSrc = BEFORE ? headSrc('src/js/game.js') : fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const appSrc = BEFORE ? headSrc('src/js/app.js') : fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const seSrc = BEFORE ? headSrc('src/js/statusEffects.js') : fs.readFileSync(path.join(ROOT, 'src/js/statusEffects.js'), 'utf8');
console.log(BEFORE ? 'MODE: BEFORE (pre-fix HEAD code)' : 'MODE: AFTER (fixed worktree code)');

const _lsStore = {};
global.localStorage = {
  getItem: (k) => (k in _lsStore ? _lsStore[k] : null),
  setItem: (k, v) => { _lsStore[k] = String(v); },
  removeItem: (k) => { delete _lsStore[k]; },
  key: (i) => Object.keys(_lsStore)[i] || null,
  get length() { return Object.keys(_lsStore).length; },
};

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
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', '__GAME__', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  let src;
  if (f === '__GAME__') src = gameSrc;
  else src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
let said = [];
Game.say = function (m) { said.push(String(m)); };
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  said = [];
  Game.tbfight = null;
  for (const k of Object.keys(_lsStore)) delete _lsStore[k];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  said = [];
  return s;
}
function giveAlien(id) {
  setup();
  Game.applyStatus('scholar', id, { source: 'test vector', silent: true });
  said = [];
  return Game.state.scholar;
}

// ============ E1: cureStatus must not touch alien biology ============
{
  console.log('E1: cureStatus pool guard');
  giveAlien('eurika');
  const removed = Game.cureStatus('scholar', 'eurika', 'test');
  const still = Game.hasStatus('scholar', 'eurika');
  ok('cureStatus refuses eurika', removed === false && still === true,
    `removed=${removed} still=${still}`);
  // Control: mundane cure path still works.
  setup();
  Game.applyStatus('scholar', 'disease', { source: 'test', silent: true });
  const mRemoved = Game.cureStatus('scholar', 'disease', 'test');
  ok('cureStatus still cures mundane fever', mRemoved === true && !Game.hasStatus('scholar', 'disease'));
  // Control: non-disease statuses still clear (bleed is combat-scope; use poison).
  setup();
  Game.applyStatus('scholar', 'poison', { source: 'test', silent: true });
  const pRemoved = Game.cureStatus('scholar', 'poison', 'test');
  ok('cureStatus still cures poison', pRemoved === true && !Game.hasStatus('scholar', 'poison'));
}

// ============ E2: diagnoseDisease must not name alien ============
{
  console.log('E2: diagnoseDisease pool guard');
  giveAlien('lemons');
  const dg = Game.diagnoseDisease('scholar', 'lemons', { by: 'test', silent: true });
  const recorded = !!((Game.state.codex || {}).diseases || {}).lemons ||
    !!((Game.state.scholar || {}).diagnosed || {}).lemons;
  ok('diagnoseDisease refuses lemons', dg === false && recorded === false,
    `returned=${dg} recorded=${recorded}`);
  // Control: mundane diagnosis still works.
  setup();
  Game.applyStatus('scholar', 'gutrot', { source: 'test', silent: true });
  const mDg = Game.diagnoseDisease('scholar', 'gutrot', { by: 'test', silent: true });
  ok('diagnoseDisease still names gutrot', mDg === true && !!Game.state.scholar.diagnosed.gutrot);
}

// ============ E3: easeDisease must not ease alien ============
{
  console.log('E3: easeDisease pool guard');
  giveAlien('eurika');
  const eased = Game.easeDisease('scholar', 'eurika', 5, null);
  const entry = (Game.seList('scholar') || []).find(e => e.id === 'eurika');
  ok('easeDisease refuses eurika', eased === false && !(entry && entry.easedUntil),
    `returned=${eased} easedUntil=${entry && entry.easedUntil}`);
  // Control: mundane easing still works.
  setup();
  Game.applyStatus('scholar', 'disease', { source: 'test', silent: true });
  const mEased = Game.easeDisease('scholar', 'disease', 5, null);
  const mEntry = (Game.seList('scholar') || []).find(e => e.id === 'disease');
  ok('easeDisease still eases mundane fever', mEased === true && !!(mEntry && mEntry.easedUntil));
}

// ============ H1: chip must not promise an impossible identification ============
{
  console.log('H1: alien chip title honesty');
  giveAlien('eurika');
  const chips = Game.afflictionChips();
  const chip = chips.find(c => c.id === 'eurika');
  ok('chip carries alien pool marker', !!chip && chip.pool === 'alien',
    JSON.stringify(chip && { id: chip.id, pool: chip.pool }));
  // The rendered title must not promise examination for something unexaminable.
  // Check the app.js renderer source (DOM code — verify the branch exists).
  const m = appSrc.match(/function afflictionRow\(st\) \{([\s\S]*?)\n  \}/);
  const body = m ? m[1] : '';
  const honestTitle = /alien/i.test(body) && !/Undiagnosed — examine.*identify/.test(body.replace(/a\.pool[^;]*alien[^;]*;/g, ''));
  ok('afflictionRow titles alien chips honestly (no examine promise)',
    /pool\s*===?\s*['"]alien['"]/.test(body) && /no earthly/i.test(body),
    'renderer must branch on alien pool with an honest title');
}

// ============ H2: examineSick must not say "not sick" to an alien Bearer <redacted> ============
{
  console.log('H2: examineSick honesty with alien-only bearer');
  giveAlien('lemons');
  // grant a diagnosis-capable ability so the examine path is reachable
  Game.state.scholar.abilities = [{ id: 'herbal_remedy', level: 1 }];
  said = [];
  Game.examineSick();
  const out = said.join(' ');
  ok('examineSick does not claim "not sick" with lemons aboard',
    !/not sick/i.test(out), JSON.stringify(out.slice(0, 160)));
  ok('examineSick names the honest situation (alien, no earthly diagnosis)',
    /alien/i.test(out), JSON.stringify(out.slice(0, 160)));
}

// ============ D1: the Afflictions panel must surface alien conditions ============
{
  console.log('D1: afflictions panel covers alien');
  // Game-side list for the panel.
  giveAlien('gristlefit');
  const alien = Game.alienAfflictions ? Game.alienAfflictions() : null;
  ok('Game.alienAfflictions() lists alien entries',
    Array.isArray(alien) && alien.some(a => a.id === 'gristlefit'),
    JSON.stringify(alien && alien.map(a => a.id)));
  const row = alien && alien.find(a => a.id === 'gristlefit');
  ok('alien row carries description + transformation (readable surface)',
    !!(row && row.description && row.transformation),
    row ? 'missing fields' : 'no row');
  // The panel renderer must include alien entries (source check — DOM code).
  const m = appSrc.match(/function renderAfflictionsSection\(\) \{([\s\S]*?)\n  \}\n/);
  const body = m ? m[1] : appSrc;
  ok('renderAfflictionsSection includes alien entries',
    /alienAfflictions|alien/i.test(body) && /transformation/i.test(body),
    'panel must render alien rows with transformations');
  ok('renderAfflictionsSection offers no treatment buttons for alien',
    !/data-aff=\\"treat:[^\\"]*\\".*alien|alien.*data-aff=\\"treat/.test(body),
    'no treat/folk/medicine buttons may be wired to alien rows');
}

// ============ Permanent aliens still never expire ============
{
  console.log('P1: permanence regression');
  giveAlien('eurika');
  const def = Game.seDef('eurika');
  ok('eurika has no duration (permanent warping)', !def.duration,
    JSON.stringify(def.duration));
  giveAlien('east_nile');
  ok('east_nile has no duration', !Game.seDef('east_nile').duration);
  giveAlien('lemons');
  ok('lemons has no duration', !Game.seDef('lemons').duration);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
