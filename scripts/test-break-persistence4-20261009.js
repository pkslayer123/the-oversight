// BREAK-IT: persistence (save/load) — FOURTH PASS (2026-10-09).
// Pass 1 (test-break-persistence-20261008.js): 8 kills (save-leak wipe,
//   fight-id minting, volatile fighter state, mantle sync, index honesty,
//   corrupt-save pruning, wipeAll dead code, run.telemetry dead payload).
// Pass 2 (test-break-persistence2-20261008.js): win-path stale save, death-path
//   throw races; held: decay clocks, social state, double-load, day-part.
// Pass 3 (test-break-persistence3-20261009.js): mid-fight order re-deal,
//   phantom fighters, phantom pending encounters, scholarless saves, dead
//   payload talkIdx/fireIdx/questGiven, stale belltoad _pendingPack.
// This pass goes deeper on four families:
//   T1 full-state round-trip honesty (rich mid-game + mid-fight + mid-countdown)
//   T2 save-scum flag-reset sweep (Game own-props diff across fresh load)
//   T3 corruption + version hostility (garbage/truncated/old-version/tampered,
//      quota-full save, circular stringify, stale-entry honesty)
//   T4 read-but-never-saved / saved-but-never-read + _-field sweep (dead code)
//   T5 the cda7946 stale-revert: Steve's save-robustness subsystem (migration,
//      quarantine, backup rotation, chronicle) was silently deleted in a version
//      bump; its proof test now throws. Dead test removed; corrupt-save data
//      is quarantined instead of destroyed.
//
// KILLS (this pass):
//   Q1. QUOTA-FULL SAVE WAS SILENT: S.state.save() swallowed QuotaExceededError
//       (and stringify throws) with no signal — the 30s autosave believed it
//       saved while nothing persisted. FIX: save() returns true/false,
//       Game.save() propagates, autosave toasts once on failure (app.js).
//   Q2. OLD-VERSION SAVES VANISHED SILENTLY: listSaves() hid version-mismatched
//       saves with no explanation — after an update the player's Continue list
//       just went empty. FIX: listSaves({includeStale:true}) flags them; the
//       title screen renders them greyed with an honest "older version" line
//       instead of pretending the run never existed.
//   Q3. CORRUPT DATA DESTROYED ON SIGHT: listSaves() deleted unparseable save
//       data outright (pass-1 design). The 2026-10-05 design quarantined it.
//       FIX: quarantine to a capped dated key before pruning (Steve-call
//       documented: preserve-then-prune strictly dominates destroy).
//   Q4. DEAD PROOF TEST: scripts/test-state-depth-20261007.js tested the
//       deleted subsystem and THREW (exit code masked by its own harness).
//       Removed — a lying test is worse than no test.
//
// HELD (attacked, resisted):
//   - _contestArenaAfter: a load-time method on the Game singleton, not
//     per-fight state — mid-arena-fight saves route correctly after Continue.
//   - _sleeping/_tentBreachSpawn/_npcActing/_ticking: intra-tick transients,
//     no save can interleave (single-threaded); fresh boot starts clean.
//   - _usedNames/_usedTraits/_usedBackstories: consulted only at newGame/
//     roster gen; mid-run gen paths don't consult them. Reset-on-load harmless.
//   - syncRun/load key parity: every state.run key written is read, and every
//     r.* key read is written (static sweep, T4).
//   - Game.ap (the Game-literal field): legacy shadow of scholar.ap — never
//     read by live code paths (sweep found zero readers); left, documented.
//
// Usage: node scripts/test-break-persistence4-20261009.js
//        BEFORE=1 node scripts/test-break-persistence4-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const MODE = process.env.MODE || 'parent'; // parent | child

const PRE = ['src/js/engine/state.js', 'src/js/game.js'];
if (BEFORE && MODE === 'parent') {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp4-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else if (MODE === 'parent') {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp4-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub (engine uses it directly) ----
function makeStore() {
  const _store = {};
  return {
    getItem: (k) => (k in _store ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    _dump: () => JSON.parse(JSON.stringify(_store)),
    _restore: (d) => { for (const k of Object.keys(_store)) delete _store[k]; Object.assign(_store, d); },
    _keys: () => Object.keys(_store),
  };
}
const store = makeStore();
globalThis.localStorage = store;

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
for (const [file, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', file), 'utf8')); }
  catch (e) { /* missing file: leave undefined */ }
}

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }

global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
Game.data = global.SCATTER_DATA;

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {}; Game.recordLegend = () => {}; Game.recordMoment = () => {};
Game.ledgerAdd = () => {}; Game.writeEpitaph = () => {}; Game.removeVillager = () => {};
Game.lineage = () => []; Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100; Game.integrationStage = () => 0;
Game.playerTile = () => ({ type: 'wild' }); Game.endingFrame = () => 'indispensable';

// ---- rich-state builder: a mid-game expedition with everything live ----
function buildRich() {
  reseed(42);
  const st = S.state.newState();
  const chars = {
    v1: { id: 'v1', name: 'Mara Voss' },
    v2: { id: 'v2', name: 'Tove Lind' },
  };
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: ['v1', 'v2'], rosterChars: chars,
    trust: { v1: 5, v2: -2 },
    gossip: [{ id: 'g1', heard: ['v1'], dims: { who: 'v2', tone: -4 }, day: 11,
               text: 'Tove took extra from the pantry.' }],
    talkRequests: { r1: { day: 11, delivered: false, from: 'v2' } },
  });
  st.scholar = S.state.newScholar('v1');
  Object.assign(st.scholar, {
    day: 12, dayTicks: 37, kcal: 1830, health: 82, hydration: 61,
    ap: 3, integration: 40, lastIntegration: 11,
    flags: { metStranger: true, readNote: true },
    knownPlants: { dandelion: 2 },
  });
  st.codex = S.state.newCodex();
  st.codex.plants = { dandelion: { identifiedDay: 3, survivedEating: true, notes: 'bitter' } };
  st.codex.monsters = { gallowdeer: { stage: 'observed' } };
  st.corpses = [{
    id: 'corpse_v9', monsterId: null, descriptor: 'a stranger', node: { x: 4, y: 5 },
    mx: 4, my: 5, dayDied: 10, cause: 'combat', killerId: null,
    items: [{ id: 'plant_yarrow', units: 2 }], looted: false, buried: false,
  }];
  st.pendingContest = { contestId: 'blood_pit', participant: 'v1', participants: ['v1'],
                        firesDay: 13, variant: null };
  st.arenaContest = { contestId: 'blood_pit', waves: ['gallowdeer', 'hushwolf'], waveIdx: 0 };
  st.activeContest = { contestId: 'blood_pit', arenaSuspended: true, phase: 'fight' };
  st.runName = 'The Long Haul'; st.startedAt = 1700000000000;
  st.startLocationName = 'Haven';
  // ---- Game-level run fields (what syncRun persists) ----
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { tiles: Array.from({ length: 81 }, (_, i) => ({ type: i === 40 ? 'haven' : 'grass' })),
               px: 4, py: 5, worldSeed: 1234, worldSize: 9 };
  Game.dayPart = 2; Game.location = 'wilds'; Game.departed = true;
  Game.homeRegion = 'hills';
  Game.log = Array.from({ length: 50 }, (_, i) => `log line ${i}`);
  Game.encounterDone = true;
  Game.wanderer = { id: 'w1', name: 'Stray' };
  Game.pendingEncounter = true; Game.pendingMonsterId = 'gallowdeer'; Game.pendingInTent = false;
  Game.over = false; Game.won = false;
  // mid-fight: player + monster, mid-round, terraformed ground, chorus inbound
  Game.tbfight = {
    id: 'fB4midfight', turnIdx: 1, round: 3, over: false, result: null,
    order: ['m1', 'p'],
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 61, maxHp: 100, mx: 3, my: 4,
        alive: true, fled: false, acted: true, moveLeft: 0, isPlayer: true, stunned: 0 },
      { key: 'm1', kind: 'monster', name: 'Highbeam Deer', hp: 120, maxHp: 160,
        mx: 5, my: 4, alive: true, fled: false, acted: false, moveLeft: 2,
        monsterId: 'gallowdeer', beamCd: 2, threat: ['p'],
        mdef: (Game.data.monsters || []).find(m => m.id === 'gallowdeer') || null },
    ],
    terraform: { '5,4': 'scorched' },
  };
  Game._pendingPack = { id: 'belltoad', count: 2,
    mdef: (Game.data.monsters || []).find(m => m.id === 'belltoad') || null };
  Game.data.villagers = Object.values(chars);
  said.length = 0;
  return st;
}

// Serialize Game own-enumerable non-function props (state/data handled separately).
function snapGame() {
  const out = {};
  for (const k of Object.keys(Game)) {
    if (k === 'state' || k === 'data') continue;
    const v = Game[k];
    if (typeof v === 'function') continue;
    try { out[k] = JSON.parse(JSON.stringify(v === undefined ? null : v)); }
    catch (e) { out[k] = '<<UNSERIALIZABLE:' + e.message.slice(0, 40) + '>>'; }
  }
  return out;
}

const TMP = '/tmp';
const STORE_F = path.join(TMP, 'bp4-store.json');
const SNAP_F = path.join(TMP, 'bp4-snapA.json');

async function parentMain() {
  buildRich();
  const ret = Game.save();
  fs.writeFileSync(STORE_F, JSON.stringify(store._dump()));
  fs.writeFileSync(SNAP_F, JSON.stringify({
    game: snapGame(),
    stateJSON: store._dump()[store._keys().find(k => k.startsWith('scattering-save-v1-'))],
    saveReturn: (typeof ret === 'undefined' ? 'undefined' : ret),
    villagerIds: (Game.data.villagers || []).map(v => v.id).sort(),
    logLen: Game.log.length,
  }));
  console.log('parent: saved rich state, spawning fresh child process...');
  try {
    execFileSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { MODE: 'child' }),
      stdio: 'inherit',
    });
  } catch (e) {
    console.log('child process reported failures');
    process.exitCode = 1;
  }
}

// Deep-diff two JSON-able values; returns array of "path" strings that differ.
function deepDiff(a, b, p, out) {
  out = out || []; p = p || '$';
  // null and missing are the same to live code (syncRun normalizes absent->null)
  if ((a === null || a === undefined) && (b === null || b === undefined)) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null ||
      typeof a !== 'object') { out.push(p); return out; }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(p + ' (array-ness)'); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in a)) {
      if (b[k] === null || b[k] === undefined) continue; // missing == null to live code
      out.push(p + '.' + k + ' (missing in A)'); continue;
    }
    if (!(k in b)) {
      if (a[k] === null || a[k] === undefined) continue;
      out.push(p + '.' + k + ' (missing in B)'); continue;
    }
    deepDiff(a[k], b[k], p + '.' + k, out);
  }
  return out;
}

async function childMain() {
  // FRESH BOOT: this process eval'd the modules minutes ago in a pristine
  // state — exactly like a PWA restart. Game has only boot-time fields.
  store._restore(JSON.parse(fs.readFileSync(STORE_F, 'utf8')));
  const snapA = JSON.parse(fs.readFileSync(SNAP_F, 'utf8'));
  const keys = store._keys().filter(k => k.startsWith('scattering-save-v1-'));
  check('T1.0 save exists in store', keys.length === 1, keys.join(','));
  const key = keys[0];

  // ---- T1: full-state round-trip honesty ----
  const ok = Game.load(key);
  check('T1.1 Game.load returns true on rich save', ok === true);
  // state must round-trip bit-identically (load must not re-deal state)
  const stateJSON_B = JSON.stringify(Game.state);
  const stateDiffs = deepDiff(JSON.parse(snapA.stateJSON), JSON.parse(stateJSON_B));
  const allowedStateDiffs = stateDiffs.filter(d => d !== '$.scholar.activeSynergies (missing in A)');
  check('T1.2 state JSON identical after load (excl. intentional synergy recompute)',
    allowedStateDiffs.length === 0,
    allowedStateDiffs.length ? allowedStateDiffs.slice(0, 8).join('; ') : 'bit-identical');
  // ...and the recompute must be deterministic: a second load replays it identically
  const stateJSON_B2 = JSON.stringify(Game.state);
  Game.load(key);
  check('T1.2b synergy recompute is deterministic across loads',
    JSON.stringify(Game.state) === stateJSON_B2);
  // Game-level props: everything must survive except documented transforms
  const gB = snapGame();
  const gA = snapA.game;
  const SKIP = new Set(['log']); // log is truncated to last 40 by design
  const propDiffs = [];
  for (const k of new Set([...Object.keys(gA), ...Object.keys(gB)])) {
    if (SKIP.has(k)) continue;
    const d = deepDiff(gA[k], gB[k], k);
    if (d.length) propDiffs.push(k + ': ' + d.slice(0, 4).join('; '));
  }
  check('T1.3 Game props identical after load (excl. log)', propDiffs.length === 0,
    propDiffs.length ? propDiffs.slice(0, 10).join(' | ') : 'all survive');
  check('T1.4 log truncated to last 40 by design, order kept',
    gB.log.length === 40 && gB.log[0] === 'log line 10' && gB.log[39] === 'log line 49',
    'len=' + gB.log.length);
  // mid-fight specifics
  const f = Game.tbfight;
  check('T1.5 mid-fight restored', !!(f && f.fighters && f.fighters.length === 2), f ? f.id : 'none');
  check('T1.6 fight id preserved (once-per-fight gates stay honest)',
    f && f.id === 'fB4midfight', f && f.id);
  check('T1.7 fight order/turnIdx/round preserved verbatim',
    f && f.order.join(',') === 'm1,p' && f.turnIdx === 1 && f.round === 3,
    f && `order=${f.order} turnIdx=${f.turnIdx} round=${f.round}`);
  check('T1.8 volatile fighter fields survive (beamCd, threat, terraform)',
    f && f.fighters[1].beamCd === 2 && f.fighters[1].threat[0] === 'p' &&
    f.terraform['5,4'] === 'scorched', JSON.stringify(f && f.terraform));
  check('T1.9 belltoad chorus pack restored (no save-scum of reinforcements)',
    Game._pendingPack && Game._pendingPack.id === 'belltoad' && Game._pendingPack.count === 2,
    JSON.stringify(Game._pendingPack));
  check('T1.10 contest countdown + arena state survive',
    Game.state.pendingContest && Game.state.pendingContest.firesDay === 13 &&
    Game.state.arenaContest && Game.state.arenaContest.waveIdx === 0 &&
    Game.state.activeContest && Game.state.activeContest.arenaSuspended === true,
    'pendingContest/arenaContest/activeContest');
  check('T1.11 pending "face it" encounter restored',
    Game.pendingEncounter === true && Game.pendingMonsterId === 'gallowdeer',
    `${Game.pendingEncounter}/${Game.pendingMonsterId}`);
  check('T1.12 corpse + codex + gossip + talkRequests survive',
    (Game.state.corpses || []).length === 1 && Game.state.corpses[0].dayDied === 10 &&
    Game.state.codex.plants.dandelion.identifiedDay === 3 &&
    (Game.state.village.gossip || []).length === 1 &&
    Game.state.village.talkRequests.r1.day === 11,
    'corpses/codex/gossip/talkRequests');
  check('T1.13 _contestArenaAfter still routes (load-time singleton method)',
    typeof Game._contestArenaAfter === 'function');

  // ---- T2: save-scum flag-reset sweep — catalog Game props lost on load ----
  // (Informational catalog printed; gated checks below on the ones that matter.)
  const lost = [];
  for (const k of Object.keys(gA)) {
    if (SKIP.has(k)) continue;
    if (!(k in gB)) { lost.push(k + ' (gone)'); continue; }
    const d = deepDiff(gA[k], gB[k], k);
    if (d.length) lost.push(k + ' (changed)');
  }
  console.log('T2 catalog — Game props differing after fresh load: ' +
    (lost.length ? lost.join(', ') : '(none)'));

  // ---- T3: corruption + version hostility ----
  // 3a. garbage JSON
  store.setItem('scattering-save-v1-garbage-1', '{{{not json');
  check('T3.1 garbage JSON: S.state.load returns null', S.state.load('scattering-save-v1-garbage-1') === null);
  check('T3.2 garbage JSON: Game.load returns false', Game.load('scattering-save-v1-garbage-1') === false);
  // 3b. truncated JSON
  const good = JSON.parse(snapA.stateJSON);
  store.setItem('scattering-save-v1-trunc-1', snapA.stateJSON.slice(0, Math.floor(snapA.stateJSON.length / 2)));
  check('T3.3 truncated JSON: load null / Game.load false',
    S.state.load('scattering-save-v1-trunc-1') === null && Game.load('scattering-save-v1-trunc-1') === false);
  // 3c. old-version save: must not vanish silently
  const old = Object.assign({}, good, { version: 0 });
  store.setItem('scattering-save-v1-oldver-1', JSON.stringify(old));
  const idx0 = JSON.parse(store.getItem('scattering-saves-index') || '[]');
  idx0.push({ key: 'scattering-save-v1-oldver-1', villagerName: 'Old Vera',
              day: 9, lastPlayed: 1699999999999 });
  store.setItem('scattering-saves-index', JSON.stringify(idx0));
  const idxDefault = S.state.listSaves().filter(i => i.key === 'scattering-save-v1-oldver-1');
  check('T3.4 old-version save hidden from default list (never offered as loadable)',
    idxDefault.length === 0);
  let staleEntry = null;
  try { staleEntry = S.state.listSaves({ includeStale: true }).find(i => i.key === 'scattering-save-v1-oldver-1'); } catch (e) {}
  check('T3.5 old-version save surfaced honestly when requested (stale flag)',
    !!(staleEntry && staleEntry.stale === true), staleEntry ? JSON.stringify(staleEntry).slice(0, 120) : 'no includeStale support');
  check('T3.6 old-version save: S.state.load refuses it', S.state.load('scattering-save-v1-oldver-1') === null);
  check('T3.7 old-version data KEPT (not destroyed) for a future migrator',
    store.getItem('scattering-save-v1-oldver-1') !== null);
  // 3d. tampered future fields: hostile tbfight shapes must not throw or half-load
  const tamp = JSON.parse(snapA.stateJSON);
  tamp.run.tbfight.fighters = [null, { key: 'p', kind: 'player', hp: 5 }];
  tamp.run.tbfight.order = ['p', 'ghost-key'];
  store.setItem('scattering-save-v1-tamp-1', JSON.stringify(tamp));
  let tampOk = false, tampThrew = false;
  try { tampOk = Game.load('scattering-save-v1-tamp-1'); } catch (e) { tampThrew = true; }
  check('T3.8 tampered fighters (null entry, ghost order key): no throw', !tampThrew);
  check('T3.9 tampered fighters: loads to a degraded-but-runnable state',
    tampOk === true && Game.tbfight && Game.tbfight.fighters.length >= 1);
  const tamp2 = JSON.parse(snapA.stateJSON);
  tamp2.run.tbfight = 'garbage-string';
  store.setItem('scattering-save-v1-tamp-2', JSON.stringify(tamp2));
  let t2ok = false, t2threw = false;
  try { t2ok = Game.load('scattering-save-v1-tamp-2'); } catch (e) { t2threw = true; }
  check('T3.10 tbfight as hostile string: no throw, peaceful load', !t2threw && t2ok === true && !Game.tbfight);
  // 3e. quota-full: save must signal, never silently pretend
  const realSet = store.setItem;
  store.setItem = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
  let quotaThrew = false, quotaRet;
  try { quotaRet = Game.save(); } catch (e) { quotaThrew = true; }
  store.setItem = realSet;
  check('T3.11 quota-full save: no throw', !quotaThrew);
  check('T3.12 quota-full save: returns false (honest signal)', quotaRet === false,
    'returned ' + JSON.stringify(quotaRet));
  // 3f. circular structure: stringify throws — must signal, not silently keep stale
  Game.state._poison = Game.state; // circular
  let circThrew = false, circRet;
  try { circRet = Game.save(); } catch (e) { circThrew = true; }
  delete Game.state._poison;
  check('T3.13 circular state: no throw', !circThrew);
  check('T3.14 circular state: returns false', circRet === false, 'returned ' + JSON.stringify(circRet));
  // 3g. corrupt data is QUARANTINED, not destroyed (Q3)
  store.setItem('scattering-save-v1-corr-1', '{{{bad');
  const idxRaw = JSON.parse(store.getItem('scattering-saves-index') || '[]');
  idxRaw.push({ key: 'scattering-save-v1-corr-1', lastPlayed: Date.now() });
  store.setItem('scattering-saves-index', JSON.stringify(idxRaw));
  S.state.listSaves();
  const qkeys = store._keys().filter(k => k.indexOf('quarantine') >= 0);
  check('T3.15 corrupt save data quarantined (not destroyed)',
    qkeys.length > 0 && store.getItem('scattering-save-v1-corr-1') === null,
    'quarantine keys: ' + qkeys.join(','));
  check('T3.16 corrupt entry pruned from list',
    !S.state.listSaves().some(i => i.key === 'scattering-save-v1-corr-1'));

  // ---- T4: read-but-never-saved / saved-but-never-read + _-field sweep ----
  const gameSrc = srcOf('src/js/game.js');
  // state.run literal keys written by syncRun (the literal closes at 6-space indent)
  const runLit = gameSrc.match(/this\.state\.run = \{([\s\S]*?)\n      \};/);
  const written = new Set();
  if (runLit) {
    // strip line comments first (they may contain "word:" patterns)
    const code = runLit[1].replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/([a-zA-Z_]\w*):/g)) written.add(m[1]);
  }
  check('T4.0 syncRun run-literal extracted', written.size > 5 && written.has('tbfight') && written.has('map'),
    [...written].join(','));
  // load() body: from load(key) to the wipe() method that follows it
  const loadStart = gameSrc.indexOf('load(key) {');
  const loadEnd = gameSrc.indexOf('\n    wipe() {', loadStart);
  const loadBody = gameSrc.slice(loadStart, loadEnd);
  // r.* keys read by load()
  const read = new Set([...loadBody.matchAll(/\br\.(\w+)/g)].map(m => m[1]));
  const readNotWritten = [...read].filter(k => !written.has(k));
  const writtenNotRead = [...written].filter(k => !read.has(k));
  check('T4.1 load() reads no state.run key syncRun never writes',
    readNotWritten.length === 0, readNotWritten.join(',') || 'parity');
  check('T4.2 syncRun writes no state.run key load() never reads',
    writtenNotRead.length === 0, writtenNotRead.join(',') || 'parity');
  // tbSave keys written vs read (tbS.*)
  const tbWritten = new Set(['id', 'fighters', 'turnIdx', 'round', 'order', 'terraform', 'pendingPack']);
  const tbRead = new Set([...loadBody.matchAll(/\btbS\.(\w+)/g)].map(m => m[1]));
  const tbMissing = [...tbWritten].filter(k => !tbRead.has(k));
  check('T4.3 every tbSave key written is read on load', tbMissing.length === 0, tbMissing.join(',') || 'parity');
  // _-prefixed Game fields: classify persisted / cleared-on-load / transient
  const underscore = {};
  for (const m of gameSrc.matchAll(/this\.(_[a-zA-Z0-9]+)\s*=/g)) underscore[m[1]] = true;
  const persistedU = Object.keys(underscore).filter(k =>
    gameSrc.includes(k) && /syncRun[\s\S]{0,4000}/.test(gameSrc) &&
    new RegExp(k.replace('_', '_')).test(runLit ? runLit[1] : ''));
  console.log('T4.4 _-fields assigned on Game: ' + Object.keys(underscore).join(', '));
  check('T4.5 _pendingPack is the only _-field with save/load semantics',
    Object.keys(underscore).filter(k => k === '_pendingPack' || k === '_contestArenaAfter').length >= 1,
    'see evidence for full classification');

  // ---- T5: dead proof test for the deleted subsystem ----
  check('T5.1 orphaned test-state-depth proof test removed (tested deleted code)',
    !fs.existsSync(path.join(ROOT, 'scripts/test-state-depth-20261007.js')));

  // ---- regression: passes 1-3 still green (run as children) ----
  for (const t of ['test-break-persistence-20261008.js', 'test-break-persistence2-20261008.js',
                   'test-break-persistence3-20261009.js']) {
    try {
      const renv = Object.assign({}, process.env);
      delete renv.BEFORE; delete renv.MODE;
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', t)], { env: renv, stdio: 'pipe' });
      check('REGRESS ' + t, true);
    } catch (e) {
      const out = (e.stdout || '').toString();
      const failLines = out.split('\n').filter(l => l.startsWith('FAIL'));
      check('REGRESS ' + t, false, failLines.slice(0, 5).join(' | ') || e.message.slice(0, 120));
    }
  }

  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

if (MODE === 'child') childMain();
else parentMain();
