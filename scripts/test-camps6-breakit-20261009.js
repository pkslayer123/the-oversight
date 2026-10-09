// BREAK-IT: camps & structures — SIXTH PASS (2026-10-09).
// Rounds 1-5 (evidence/2026-10-08/break-camps*.md) killed phantom camps,
// lying breakCamp messages, pack->re-pitch free repair, shredded-evasion,
// camp-integrity on bulldoze, and more. This pass attacks what they left
// alone: the tile-level BRIDGE (buildBridge) and the tile structure ledger.
//
// CATCHES (all demonstrated RED in BEFORE mode, GREEN after fix):
//   B1. DOUBLE-BUILD EXPLOIT (exploit + honesty): buildBridge had no
//       dest.bridged guard and no need-check. A stale double-call (the
//       blockage card can sit open; the engine is the last line) spent 4
//       MORE wood and pushed a DUPLICATE bridge entry onto the same tile.
//       FIX: engine-level guards — refuse honestly (no spend) when already
//       bridged or when the tile needs no bridge.
//   B2. DRY-LAND BRIDGE LIE (honesty): a direct buildBridge on dry land
//       (no creek, no washed-out path) spent 4 wood and said "A rough
//       bridge spans the gap" — spanning nothing. FIX: same need-check;
//       "No gap to span here — save your wood."
//   B3. DEAD LEDGER (dead code): tile-level structure ledger was WRITTEN
//       (push) and NEVER READ anywhere — every bridge decision keys off
//       dest.bridged. The "foundation for walls/palisades" was speculative
//       scaffolding. FIX (Steve's no-dead-code rule): deleted the push,
//       the per-tile init, and the future-comments. dest.bridged is the
//       source of truth; the washed-out origin a destroyed bridge needs
//       lives in one purpose-built field (dest.bridgeFrom), not a ledger.
//   B4. UNBREAKABLE BRIDGE (Steve's law: havens are the ONLY unbreakable
//       human structures): tile-level bridges had NO destruction path —
//       tbBulldozeCells works the detail grid, storms only took camps.
//       FIX (decide-and-document): new Game.smashBridge(x,y,cause) engine
//       function + storm hook — a storm flood washes out bridges on CREEK
//       tiles ("The storm swells the creek — your bridge washes out in logs
//       and spray"). Dry-land washed-out-path bridges stand (nothing to
//       flood). Never strands: creek blockage returns with bridge/swim/
//       go-around intact; washed-out blockage is restored from bridgeFrom.
//       The build copy now foreshadows it ("a bad storm could take it").
//
// HELD (attacked, resisted — documented, not failures):
//   - PERSISTENCE: bridged/bridgeFrom survive save/load verbatim (tiles
//     serialize wholesale in syncRun). Before the fix the DUPLICATE ledger
//     also survived — the dup was persisted, not healed, by save/load.
//   - SIBLING SWEEP: hidden caches (bury/digUp/theft/spoilage all wired,
//     digUpCache removes the entry — removable ✓); campfires (player-made
//     breakable via destroyCell fire carve-out, state.fires purged ✓);
//     tents ✓ (round 5); blockFrom clearings (permanent by design — "the
//     path stays clear" — read by travelBlockage, deleted by
//     clearBlockage/buildBridge, honest copy); claimSite cairn (marker,
//     guarded double-claim, consumed by founding — no destruction needed);
//     founding shelter tiers (convert into the new haven's building —
//     unbreakable, correct); _forkNewHaven leftovers (rounds 3/5: camp/
//     fires/caches are physical/node-keyed, "just theirs", reachable).
//
// Usage: node scripts/test-camps6-breakit-20261009.js
//        BEFORE=1 node scripts/test-camps6-breakit-20261009.js
//        SEED=777 node scripts/test-camps6-breakit-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps6-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps6-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  _clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  _keys: () => Object.keys(_store),
};

// ---- data ----
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

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }
reseed(parseInt(process.env.SEED || '20261009', 10) || 20261009);

global.window = global;
// index.html order, minus DOM-only (app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js)
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
Game.data = global.SCATTER_DATA;

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {};
Game.audioEvent = () => {};
Game.recordLegend = () => {};
Game.recordMoment = () => {};
Game.ledgerAdd = () => {};
Game.writeEpitaph = () => {};
Game.removeVillager = () => {};
Game.lineage = () => [];
Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100;
Game.integrationStage = () => 0;
Game.playerTile = () => ({ type: 'haven' });
Game.endingFrame = () => 'indispensable';
Game.log = [];

function mkMap() {
  const tiles = [];
  for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push({ type: 'meadow' }); tiles.push(r); }
  return tiles;
}
function freshGame() {
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: ['v1'], rosterChars: { v1: { id: 'v1', name: 'Mara Voss' } }, trust: {},
  });
  st.scholar = S.state.newScholar('v1');
  st.scholar.day = 5;
  st.scholar.actionClock = 0; st.scholar.dayTicks = 0;
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { tiles: mkMap(), px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; said.length = 0;
  Game.tbfight = null; Game._pendingPack = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.data.villagers = Object.values(st.village.rosterChars || {});
  return st;
}
function saveKey() {
  const saves = S.state.listSaves();
  if (!saves.length) throw new Error('no saves listed');
  return saves[0].key;
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ================= A. DOUBLE-BUILD EXPLOIT =================
section('A. double-build exploit (washed_out tile, 8 wood)');
freshGame();
{
  const t = Game.tileAt(5, 5);
  t.blockFrom = { dx: 0, dy: 1, type: 'washed_out' };
  Game.addWood(8);
  const r1 = Game.buildBridge(5, 5);
  const saidAfterBuild = said.join(' ');
  const wood1 = Game.woodCount();
  const r2 = Game.buildBridge(5, 5);
  const wood2 = Game.woodCount();
  check('A1 first build spends exactly 4 wood', !!r1 && wood1 === 4, `r1=${r1} wood=${wood1}`);
  check('A2 stale double-call refused, no second spend', r2 === false && wood2 === 4, `r2=${r2} wood=${wood2}`);
  check('A3 refusal is honest (already a bridge)', /already/i.test(said.join(' ')), said.slice(-1)[0]);
  check('A4 exactly one bridge on the tile', t.bridged === true && (t.structures || []).length <= 1,
    `bridged=${t.bridged} ledgerLen=${(t.structures || []).length}`);
  check('G1 build copy foreshadows storm risk', /storm/i.test(saidAfterBuild), saidAfterBuild.slice(0, 120));
}

// ================= B. DRY-LAND BRIDGE LIE =================
section('B. bridge on dry land (honesty)');
freshGame();
{
  Game.addWood(4);
  const r = Game.buildBridge(6, 6); // meadow, no blockFrom, not a creek
  check('B1 dry-land build refused', r === false, `r=${r}`);
  check('B2 no wood spent', Game.woodCount() === 4, `wood=${Game.woodCount()}`);
  check('B3 no phantom bridge flag', !Game.tileAt(6, 6).bridged);
  check('B4 honest line (no gap)', /no gap/i.test(said.join(' ')), said.slice(-1)[0]);
}

// ================= C. DEAD LEDGER =================
section('C. dead tile-level structure ledger');
{
  const src = srcOf('src/js/game.js');
  check('C1 no .structures reads/writes in game.js', !/\.structures/.test(src));
  check('C2 no structures[] future-scaffolding comments', !/structures\[\]/.test(src));
  freshGame();
  const t = Game.tileAt(5, 5);
  t.blockFrom = { dx: 0, dy: 1, type: 'washed_out' };
  Game.addWood(4);
  Game.buildBridge(5, 5);
  check('C3 runtime: no ledger written on build', t.structures === undefined, `structures=${JSON.stringify(t.structures)}`);
  check('C4 bridged flag is the single source of truth', t.bridged === true);
}

// ================= D. DESTRUCTION PATH =================
section('D. storm takes creek bridges (unbreakable-law)');
freshGame();
{
  check('D0 smashBridge exists', typeof Game.smashBridge === 'function');
  if (typeof Game.smashBridge !== 'function') {
    for (const n of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) check(n + ' (no destruction path)', false, 'smashBridge missing');
  } else {
    // creek bridge: the storm's target
    const ct = Game.tileAt(5, 4);
    ct.type = 'creek'; ct.needsBridge = true;
    Game.addWood(4);
    Game.buildBridge(5, 4);
    check('D-pre creek bridge built', ct.bridged === true);
    // dry-land washed_out bridge: storm must NOT take it
    const wt = Game.tileAt(3, 3);
    const origDx = 1, origDy = 0;
    wt.blockFrom = { dx: origDx, dy: origDy, type: 'washed_out' };
    Game.addWood(4);
    Game.buildBridge(3, 3);
    check('D-pre dry bridge built', wt.bridged === true);
    // storm
    Game.state.scholar.stormFront = { day: 5 };
    Game.playerAtHaven = () => true;
    said.length = 0;
    Game.resolveStormFront();
    check('D1 storm smashed the creek bridge', !Game.tileAt(5, 4).bridged);
    check('D2 storm copy honest (bridge lost, options named)',
      /bridge/i.test(said.join(' ')) && /swim|go around/i.test(said.join(' ')), said.slice(-2).join(' | ').slice(0, 200));
    check('D3 dry-land bridge survived the storm', Game.tileAt(3, 3).bridged === true);
    // no stranding: the crossing is crossable again, honestly
    const bl = Game.travelBlockage(5, 4);
    check('D4 blockage returns (creek kind, choices intact)',
      bl && bl.kind === 'blockage' && bl.blockType === 'creek', JSON.stringify(bl));
    Game.addWood(4);
    check('D5 rebuild after storm works', !!Game.buildBridge(5, 4) && Game.tileAt(5, 4).bridged === true);
    // direct smash on a washed_out bridge restores the original blockage
    const before = { dx: origDx, dy: origDy };
    Game.smashBridge(3, 3, 'test');
    const wt2 = Game.tileAt(3, 3);
    check('D6 smash restores washed_out blockage verbatim',
      !wt2.bridged && wt2.blockFrom && wt2.blockFrom.type === 'washed_out' &&
      wt2.blockFrom.dx === before.dx && wt2.blockFrom.dy === before.dy,
      JSON.stringify(wt2.blockFrom));
    // smash on a bridgeless tile: quiet no-op
    said.length = 0;
    check('D7 smash on bridgeless tile is a quiet no-op', Game.smashBridge(6, 6, 'test') === false && said.length === 0);
  }
}

// ================= E. PERSISTENCE =================
section('E. save/load round-trip');
freshGame();
{
  const wt = Game.tileAt(5, 5);
  wt.blockFrom = { dx: 0, dy: 1, type: 'washed_out' };
  const ct = Game.tileAt(5, 4);
  ct.type = 'creek'; ct.needsBridge = true;
  Game.addWood(12);
  Game.buildBridge(5, 5);
  Game.buildBridge(5, 5); // hostile double-call: must not duplicate state
  Game.buildBridge(5, 4);
  Game.save();
  const key = saveKey();
  wt.bridged = false; // tamper in memory
  const ok = Game.load(key);
  check('E1 load succeeds', ok === true);
  check('E2 washed_out bridge restored', Game.tileAt(5, 5).bridged === true);
  check('E3 creek bridge intact', Game.tileAt(5, 4).bridged === true);
  check('E4 no ledger, no duplication', (Game.tileAt(5, 5).structures || []).length <= 1 &&
    (Game.tileAt(5, 4).structures || []).length <= 1,
    `w=${JSON.stringify(Game.tileAt(5, 5).structures)} c=${JSON.stringify(Game.tileAt(5, 4).structures)}`);
  check('E5 washed_out origin survives (bridgeFrom)', Game.tileAt(5, 5).bridgeFrom &&
    Game.tileAt(5, 5).bridgeFrom.type === 'washed_out' &&
    Game.tileAt(5, 5).bridgeFrom.dx === 0 && Game.tileAt(5, 5).bridgeFrom.dy === 1,
    JSON.stringify(Game.tileAt(5, 5).bridgeFrom));
  Game.save();
  const key2 = saveKey();
  Game.load(key2);
  check('E6 second round-trip stable', Game.tileAt(5, 5).bridged === true && Game.tileAt(5, 4).bridged === true);
}

// ================= F. SIBLING SWEEP =================
section('F. sibling sweep: every other player-placed thing');
freshGame();
{
  // F1. hidden caches: removable
  Game.addWood(4);
  let cacheId = null;
  try {
    const r = Game.buryCache('material', 'wood', 2);
    const caches = Game.playerCaches();
    cacheId = caches.length ? caches[caches.length - 1].id : null;
    check('F1a bury writes a cache entry', !!cacheId && caches.length === 1, `caches=${caches.length}`);
    said.length = 0;
    Game.digUpCache(cacheId);
    check('F1b digUp removes the entry (removable)', Game.playerCaches().length === 0,
      `caches=${Game.playerCaches().length}`);
    check('F1c wood came home', Game.woodCount() === 4, `wood=${Game.woodCount()}`);
  } catch (e) { check('F1 cache round-trip (threw: ' + e.message + ')', false); }

  // F2. blockFrom clearings: honest, permanent by design
  try {
    const t = Game.tileAt(2, 2);
    t.blockFrom = { dx: 0, dy: 1, type: 'rubble' };
    Game.state.scholar.kcal = 2000;
    said.length = 0;
    Game.clearBlockage(2, 2);
    check('F2a rubble clearing removes the blockage', !Game.tileAt(2, 2).blockFrom);
    check('F2b honest copy', /clear/i.test(said.join(' ')), said.slice(0, 2).join(' | ').slice(0, 120));
    check('F2c travel no longer blocked', Game.travelBlockage(2, 2) === null);
  } catch (e) { check('F2 clearing (threw: ' + e.message + ')', false); }

  // F3. player campfire: breakable via destroyCell, tracking purged
  try {
    Game.state.fires = [{ tx: 4, ty: 4, cx: 3, cy: 3, till: Game._absTick() + 100000 }];
    const detail = [];
    for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push(null); detail.push(r); }
    detail[3][3] = 'fire';
    Game.genDetail = () => detail;
    said.length = 0;
    const r = Game.destroyCell(3, 3, 'bulldozer');
    check('F3a player campfire breaks', r !== false && detail[3][3] === null);
    check('F3b fire tracking purged (no split-brain)', (Game.state.fires || []).length === 0,
      `fires=${JSON.stringify(Game.state.fires)}`);
    check('F3c no haven-lie copy', !/Havens do not break/.test(said.join(' ')), said.join(' ').slice(0, 160));
  } catch (e) { check('F3 campfire break (threw: ' + e.message + ')', false); }

  // F4. claimSite: guarded marker, consumed by founding
  try {
    Game.state.scholar.exiled = true;
    const c1 = Game.claimSite();
    const c2 = Game.claimSite();
    check('F4a first claim works', c1 === true);
    check('F4b double-claim refused (no dup markers)', c2 === null || c2 === false);
  } catch (e) { check('F4 claimSite (threw: ' + e.message + ')', false); }
}

console.log(`\n---- RESULT: ${pass} passed, ${fail} failed ----`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);
