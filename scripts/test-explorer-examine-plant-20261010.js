// EXPLORER BREAK-IT 2026-10-10 — E1 ORPHANED PLANT-EXAMINE VERB (honesty/design)
// ATTACK: Steve 2026-10-06 — "I should be able to examine more things instead
// of just foraging them. Come away with vague plant descriptions. This should
// be the foundation of recognizing a plant when someone reveals knowledge to
// you at a later date." src/js/examine.js built the whole system
// (examinePlantCell: vague description, observation memory, 8 ticks +
// 15 kcal, observation->recognitionBeat chain). But its ONLY caller is
// game.js's examineCell, which carexplore.js has SHADOWED since 2026-10-04
// (loads later in index.html) — so the live "Examine" verb on plants/bushes
// runs carexplore's generic flavor branch: no observation memory, no vague
// description, no plantVisualDepth progression. Observations were reachable
// ONLY by foraging (handling teaches) — the cheap look Steve asked for never
// existed in a live build. The recognition foundation was dead on arrival.
//
// FIX: the live Game.examineCell bush/plant branch now resolves the species
// via Ex.resolveCellSpecies, records Ex.observePlant(pid, 'examine'), and
// says the vague Ex.examineDescription (name-scrubbed; skipped when known).
// Same guards, same 2-tick charge, same farm cap — plus the memory the
// recognition beat needs.
// Usage: node scripts/test-explorer-examine-plant-20261010.js
//        BEFORE=1 node scripts/test-explorer-examine-plant-20261010.js
//        SEED=999 node scripts/test-explorer-examine-plant-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let carexploreSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/carexplore.js > /tmp/exe-care-before.js', { cwd: ROOT });
  carexploreSrc = fs.readFileSync('/tmp/exe-care-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix carexplore.js from git HEAD)');
} else {
  carexploreSrc = fs.readFileSync(path.join(ROOT, 'src/js/carexplore.js'), 'utf8');
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
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rngReset(s) { _rng = mulberry32(s === undefined ? SEED : s); }
Math.random = () => _rng();
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  '__CARE__', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = f === '__CARE__' ? carexploreSrc : fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0, skipped = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function skip(name, why) { skipped++; console.log('  SKIP ' + name + ' — ' + why); }
function setup() {
  rngReset();
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  if (s.insideHaven) Game.exitBuilding();
  s.insideHaven = false;
  return s;
}
// capture say() output
let said = [];
const _say = Game.say.bind(Game);
Game.say = function (msg) { said.push(String(msg)); return _say(msg); };
// find a bush cell adjacent to a walkable stand cell
function findBushSpot() {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (detail[y] && detail[y][x] === 'bush') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ax = x + dx, ay = y + dy;
        if (ax < 0 || ax > 8 || ay < 0 || ay > 8) continue;
        const c = detail[ay] && detail[ay][ax];
        if (c && !Game.cellProps(c).blocks) return { bx: x, by: y, sx: ax, sy: ay };
      }
    }
  }
  return null;
}

// ---- E1: the live Examine verb records an observation (the design) ----
{
  setup();
  const s = Game.state.scholar;
  const spot = findBushSpot();
  if (!spot) { skip('E1: no bush cell with adjacent stand on this seed', 'map'); }
  else {
    s.mx = spot.sx; s.my = spot.sy;
    const t = Game.playerTile();
    const pid = Ex.resolveCellSpecies(spot.bx, spot.by); // what the live verb would resolve
    ok('E1 setup: bush resolves to a species', !!pid, String(pid));
    if (pid) {
      const pdef = (Game.data.plants || []).find(p => p.id === pid);
      const before = Ex.observationOf(pid);
      ok('E1 setup: no observation yet', !before);
      said = [];
      Game.examineCell(spot.bx, spot.by);
      const after = Ex.observationOf(pid);
      const depth = Ex.plantVisualDepth(pid);
      if (BEFORE) {
        ok('BEFORE: live Examine records NO observation (verb is orphaned)',
          !after, after ? JSON.stringify(after) : 'none — the design never fires');
        ok('BEFORE: plantVisualDepth stays 0 after examining',
          depth === 0, 'depth=' + depth);
      } else {
        ok('AFTER: live Examine records the observation memory',
          !!after && after.via.indexOf('examine') !== -1,
          after ? `via=${after.via} count=${after.count}` : 'none');
        ok('AFTER: plantVisualDepth is 1 (examined, unnamed)',
          depth === 1, 'depth=' + depth);
        // the vague description was said — and carries no true name
        const blob = said.join('\n');
        const desc = Ex.examineDescription(pid, after.quality);
        ok('AFTER: the vague description was narrated',
          blob.indexOf(desc.slice(0, 40)) !== -1,
          'said ' + said.length + ' lines');
        if (pdef) {
          const nm = pdef.name.toLowerCase();
          ok('AFTER: no true-name leak in the examine narration',
            blob.toLowerCase().indexOf(nm) === -1,
            'name=' + pdef.name);
        }
      }
    }
  }
}

// ---- E2: the full chain — examine, then taught, then the recognition beat ----
{
  setup();
  const s = Game.state.scholar;
  const spot = findBushSpot();
  if (!spot) { skip('E2: no bush cell with adjacent stand on this seed', 'map'); }
  else {
    s.mx = spot.sx; s.my = spot.sy;
    const pid = Ex.resolveCellSpecies(spot.bx, spot.by);
    if (!pid) { skip('E2: bush resolved to no species', 'data'); }
    else {
      said = [];
      Game.examineCell(spot.bx, spot.by);
      const obsBefore = Ex.observationOf(pid);
      // now someone teaches you the name
      const taught = Game.identifyPlant(pid, 'taught', 'Test Teacher');
      ok('E2 setup: identifyPlant taught the species', taught === true);
      if (BEFORE) {
        ok('BEFORE: no observation existed, so no recognition beat could fire',
          !obsBefore, 'observation was never recorded by the live verb');
      } else {
        ok('AFTER: observation existed before naming (the foundation)',
          !!obsBefore, 'count=' + (obsBefore && obsBefore.count));
        const blob = said.join('\n');
        ok('AFTER: the recognition beat fired on naming ("it clicks")',
          /clicks like a key|never unsee it|land on the memory/i.test(blob),
          said.slice(-2).join(' | ').slice(0, 160));
      }
    }
  }
}

// ---- E3: repeated examines don't farm past the skill cap (held) ----
{
  setup();
  const s = Game.state.scholar;
  const spot = findBushSpot();
  if (!spot) { skip('E3: no bush cell on this seed', 'map'); }
  else {
    s.mx = spot.sx; s.my = spot.sy;
    for (let i = 0; i < 6; i++) Game.examineCell(spot.bx, spot.by);
    const enc = (Game.state.codex.encounters || {}).track_read || 0;
    // farm cap: one cell teaches a skill at most 2 encounters' worth
    ok('E3 held: 6 examines on one bush feed at most 2 track_read encounters',
      enc <= 2, 'track_read encounters=' + enc);
  }
}

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail, ${skipped} skipped (seed ${SEED}) ===`);
process.exit(fail > 0 ? 1 : 0);
