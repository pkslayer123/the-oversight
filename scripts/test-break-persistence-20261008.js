// BREAK-IT: persistence (save/load) — exploit / softlock / honesty / dead-code.
// (Steve 2026-10-08, break-it hunt loop, target: persistence)
//
// BREAKS FOUND & FIXED:
//   1. VILLAGE-LOST SAVE LEAK -> resurrection exploit: playerDeath's no-candidates
//      branch set over=true but never wiped the save, so the last autosave survived
//      and Continue resurrected a dead run (load() resets over=false). FIX: wipe()
//      in the no-candidates branch (ledger.js). Every other death path wipes.
//   2. MID-COMBAT SAVE MINTED A NEW FIGHT ID -> read_stance "once per fight" bypass:
//      syncRun never persisted tbfight.id, so load() generated a fresh id and the
//      stanceReadFight gate (keyed on fight id) could be re-used after every reload.
//      FIX: persist id (game.js syncRun/load).
//   3. MID-COMBAT SAVE DROPPED VOLATILE FIGHTER STATE: stuns, beam cooldowns/phases,
//      telegraphs, threat queues, hesitate/blind, terraformed ground — all lost on
//      reload (monster debuffs silently cleared = free debuff cleanse). FIX: snapshot
//      every own fighter field except mdef/functions via a JSON round-trip with a
//      minimal-whitelist fallback (game.js syncRun/load).
//   4. MANTLE TRANSFER: save index kept listing the DEAD villager as the expedition's
//      scholar (scholar.villagerId never synced); the same staleness mis-attributed
//      pantry takes/gives, theft-confrontation dedup, ration-share trust, ledger vids
//      and Light Fingers' caught-stealing trust hit to a corpse. FIX: sync
//      s.villagerId in playerDeath (ledger.js) + pin a stable state.runKey so the
//      save key can't fork mid-run (state.js) + index uses the live bearer (state.js,
//      game.js save()).
//   5. SAVE INDEX LOCATION was always the START location (startLocationName never
//      updated). FIX: Game.saveLocationLabel() — Haven by name, else "the wild".
//   6. CORRUPT SAVE: Continue silently did nothing and the dead entry lingered in the
//      list forever (listSaves only pruned orphans, never unparseable data). FIX:
//      listSaves validates parse+version, prunes the entry, deletes corrupt data
//      (version-mismatched data is KEPT for a future migrator); Continue toasts on
//      failed load (app.js).
//   7. DEAD CODE: S.state.wipeAll had zero callers. FIX: wired to the debug panel
//      (Game.wipeAllSaves + "Wipe ALL saves" two-tap button, app.js).
//   8. run.telemetry was a second copy of state.telemetry (shared-ref duplication on
//      JSON round-trip; the run copy was never read back). Removed from syncRun.
//
// HELD (attacked, resisted):
//   - Contest countdowns are day-driven (firesDay in state.pendingContest): survive.
//   - No Map/Set/class instances in persisted state (factories return literals).
//   - hasSave/deleteSave/listSaves all wired; "Expedition deleted" really deletes.
//   - SAVE_KEY legacy fallback in load()/wipe(): unreachable via any caller, kept as
//     harmless defensive code.
//   - saveKey collisions: vid + startedAt(ms); villagers are unique per run.
//
// Usage: node scripts/test-break-persistence-20261008.js
//        BEFORE=1 node scripts/test-break-persistence-20261008.js  (pre-fix, from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/engine/state.js', 'src/js/game.js', 'src/js/ledger.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub (engine uses it directly) ----
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
let _seed = 1;
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }

global.window = global; // stub for modules needing `window` at load
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
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
Game.data = global.SCATTER_DATA;

// journal.js defers its playerDeath wrap to a macrotask; let it install (browser parity)
async function settle() { await new Promise(r => setTimeout(r, 10)); }

// ---- minimal world stubs ----
Game.say = () => {};
Game.drama = () => {};
Game.recordLegend = () => {};
Game.recordMoment = () => {};
Game.ledgerAdd = () => {};
Game.writeEpitaph = () => {};
Game.welcomeBearer = () => {};
Game.removeVillager = () => {};
Game.lineage = () => [];
Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100;
Game.integrationStage = () => 0;
Game.playerTile = () => ({ type: 'haven' });
Game.log = [];

function freshState(rosterIds) {
  const st = S.state.newState();
  const chars = {};
  for (const id of rosterIds) chars[id] = { id, name: id === 'v1' ? 'Mara Voss' : 'Tove Lind' };
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: rosterIds.slice(), rosterChars: chars, trust: {},
  });
  st.scholar = S.state.newScholar(rosterIds[0]);
  st.scholar.day = 5;
  st.startedAt = 1700000000000;
  return st;
}
function wireGame(st, npcIds) {
  Game.state = st;
  Game.villagerId = st.scholar.villagerId;
  Game.map = { px: 4, py: 4 };
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; Game.tbfight = null; Game.encounterDone = false; Game.wanderer = null;
  Game.data.villagers = Object.values(st.village.rosterChars || {});
  Game.npcIds = () => npcIds.slice();
}

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

async function main() {
  await settle();
  reseed(42);

  // ============ 1. VILLAGE-LOST SAVE LEAK -> resurrection exploit ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, []); // no candidates -> village-lost path
    Game.save();
    const keysBefore = globalThis.localStorage._keys().filter(k => k.startsWith('scattering-save-v1-'));
    check('1a. save exists before village-lost death', keysBefore.length === 1, keysBefore.join(','));
    Game.playerDeath('the night');
    const keysAfter = globalThis.localStorage._keys().filter(k => k.startsWith('scattering-save-v1-'));
    const savesAfter = S.state.listSaves();
    if (BEFORE) {
      check('1b. BEFORE: dead run\'s save SURVIVES (resurrection exploit)',
        keysAfter.length === 1 && savesAfter.length === 1,
        `keys=${keysAfter.length}, listSaves=${savesAfter.length}`);
      // prove the resurrection: load() resets over=false and hands back a living run
      const ok = Game.load(keysAfter[0]);
      check('1c. BEFORE: Continue resurrects the dead run',
        ok === true && Game.over === false, `load=${ok}, over=${Game.over}`);
    } else {
      check('1b. AFTER: village-lost death wipes the save',
        keysAfter.length === 0 && savesAfter.length === 0,
        `keys=${keysAfter.length}, listSaves=${savesAfter.length}`);
      check('1c. AFTER: run is over, nothing to resurrect',
        Game.over === true && Game.villageLost === true, `over=${Game.over}`);
    }
  }

  // ============ 2+3. MID-COMBAT SAVE: fight id + volatile fighter state ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    const mdef = (Game.data.monsters || []).find(m => m.id === 'hushwolf') || { id: 'hushwolf' };
    Game.tbfight = {
      id: 'f_test123',
      fighters: [
        { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, mx: 4, my: 4,
          alive: true, fled: false, moveLeft: 1, acted: false, isPlayer: true },
        { key: 'm_0', kind: 'monster', name: 'Hushwolf', hp: 150, maxHp: 160, mx: 5, my: 5,
          monsterId: 'hushwolf', mdef, alive: true, fled: false, moveLeft: 0, acted: true,
          stunned: 2, beamCooldown: 3, beamPhase: 'charge',
          telegraph: { kind: 'rush', turns: 1 }, threatQueue: ['p'], hesitate: 1, blind: 0 },
      ],
      order: ['p', 'm_0'], turnIdx: 1, round: 3, over: false, result: null,
      terraform: { '5,5': 'scorched' },
    };
    Game.state.scholar.stanceReadFight = 'f_test123'; // read_stance used this fight
    Game.save();
    const key = S.state.listSaves()[0].key;
    Game.tbfight = null;
    const ok = Game.load(key);
    check('2a. combat save loads', ok === true);
    const f = Game.tbfight;
    const mo = f.fighters.find(x => x.key === 'm_0');
    if (BEFORE) {
      check('2b. BEFORE: reload mints a NEW fight id (read_stance gate bypassed)',
        f.id !== 'f_test123', `id=${f.id}`);
      check('2c. BEFORE: monster stun silently cleared on reload',
        mo.stunned === undefined, `stunned=${mo.stunned}`);
      check('2d. BEFORE: beam cooldown/phase/telegraph/threat queue lost',
        mo.beamCooldown === undefined && mo.telegraph === undefined,
        `cd=${mo.beamCooldown}, telegraph=${JSON.stringify(mo.telegraph)}`);
      check('2e. BEFORE: terraformed ground lost', !f.terraform || !f.terraform['5,5'],
        `terraform=${JSON.stringify(f.terraform)}`);
    } else {
      check('2b. AFTER: fight id survives (read_stance once-per-fight stays honest)',
        f.id === 'f_test123' && Game.state.scholar.stanceReadFight === f.id, `id=${f.id}`);
      check('2c. AFTER: monster stun survives reload', mo.stunned === 2, `stunned=${mo.stunned}`);
      check('2d. AFTER: beam cooldown/phase/telegraph/threat queue survive',
        mo.beamCooldown === 3 && mo.beamPhase === 'charge' &&
        mo.telegraph && mo.telegraph.kind === 'rush' &&
        Array.isArray(mo.threatQueue) && mo.threatQueue[0] === 'p' && mo.hesitate === 1,
        `cd=${mo.beamCooldown}, phase=${mo.beamPhase}`);
      check('2e. AFTER: terraformed ground survives',
        f.terraform && f.terraform['5,5'] === 'scorched', JSON.stringify(f.terraform));
      check('2f. AFTER: mdef reattached by monsterId (not serialized)',
        !!(mo.mdef && mo.mdef.id === 'hushwolf'), `mdef=${mo.mdef && mo.mdef.id}`);
      const pl = f.fighters.find(x => x.key === 'p');
      check('2g. AFTER: player fighter intact', pl && pl.isPlayer && pl.hp === 80, `hp=${pl && pl.hp}`);
      check('2h. AFTER: round/turn preserved', f.round === 3 && f.turnIdx === 1,
        `round=${f.round}, turnIdx=${f.turnIdx}`);
    }
  }

  // ============ 4. MANTLE TRANSFER: index honesty + stable key ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1', 'v2']);
    wireGame(st, ['v2']); // v2 succeeds
    Game.save();
    const keyBefore = S.state.saveKey(Game.state);
    const nKeysBefore = globalThis.localStorage._keys().filter(k => k.startsWith('scattering-save-v1-')).length;
    Game.playerDeath('the wild'); // mantle passes v1 -> v2; playerDeath saves at the end
    const keys = globalThis.localStorage._keys().filter(k => k.startsWith('scattering-save-v1-'));
    const entries = S.state.listSaves();
    if (BEFORE) {
      check('4a. BEFORE: scholar record still names the DEAD bearer',
        Game.state.scholar.villagerId === 'v1', `scholar.villagerId=${Game.state.scholar.villagerId}`);
      check('4b. BEFORE: save index NEVER names the bearer (state.villagerId unset)',
        entries.length === 1 && entries[0].villagerName == null && entries[0].villagerId == null,
        `name=${entries[0] && entries[0].villagerName}, vid=${entries[0] && entries[0].villagerId}`);
    } else {
      check('4a. AFTER: scholar record synced to the live bearer',
        Game.villagerId === 'v2' && Game.state.scholar.villagerId === 'v2',
        `live=${Game.villagerId}, scholar=${Game.state.scholar.villagerId}`);
      check('4b. AFTER: save key did NOT fork (stable runKey)',
        keys.length === 1 && keys[0] === keyBefore, `keys=${keys.join(',')}`);
      check('4c. AFTER: index names the live bearer, single entry',
        entries.length === 1 && entries[0].villagerName === 'Tove Lind' && entries[0].villagerId === 'v2',
        `name=${entries[0] && entries[0].villagerName}, n=${entries.length}`);
      check('4d. AFTER: save() twice does not duplicate the index',
        (Game.save(), S.state.listSaves().length === 1));
    }
    if (!BEFORE) {
      // location honesty: depart, save, check the entry
      Game.departed = true;
      Game.playerTile = () => ({ type: 'field' });
      Game.save();
      const e2 = S.state.listSaves()[0];
      check('4e. AFTER: index location is live ("the wild"), not the start location',
        e2.location === 'the wild', `location=${e2.location}`);
      Game.departed = false;
      Game.playerTile = () => ({ type: 'haven' });
      Game.save();
      const e3 = S.state.listSaves()[0];
      check('4f. AFTER: index location at home names Haven',
        e3.location === 'Haven', `location=${e3.location}`);
    }
    void nKeysBefore;
  }

  // ============ 6. CORRUPT SAVE: prune + honest load ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    Game.save();
    const key = S.state.listSaves()[0].key;
    // corrupt the data
    globalThis.localStorage.setItem(key, '{broken json,,,');
    const after = S.state.listSaves();
    const dataGone = globalThis.localStorage.getItem(key) === null;
    if (BEFORE) {
      check('6a. BEFORE: corrupt save still listed (dead Continue button)',
        after.length === 1, `listSaves=${after.length}`);
      check('6b. BEFORE: load fails silently', Game.load(key) === false);
    } else {
      check('6a. AFTER: corrupt save pruned from the list', after.length === 0, `listSaves=${after.length}`);
      check('6b. AFTER: corrupt data removed', dataGone);
      check('6c. AFTER: load fails honestly (false)', Game.load(key) === false);
    }
    // version-mismatch: pruned from list but data KEPT for a future migrator
    globalThis.localStorage._clear();
    const st2 = freshState(['v1']);
    wireGame(st2, ['v1']);
    Game.save();
    const key2 = S.state.listSaves()[0].key;
    const parsed = JSON.parse(globalThis.localStorage.getItem(key2));
    parsed.version = 999;
    globalThis.localStorage.setItem(key2, JSON.stringify(parsed));
    const after2 = S.state.listSaves();
    const dataKept = globalThis.localStorage.getItem(key2) !== null;
    if (BEFORE) {
      check('6d. BEFORE: version-mismatched save listed but unloadable',
        after2.length === 1 && Game.load(key2) === false, `listed=${after2.length}`);
    } else {
      check('6d. AFTER: version-mismatched save hidden from list, data kept',
        after2.length === 0 && dataKept, `listed=${after2.length}, kept=${dataKept}`);
    }
  }

  // ============ 7. wipeAllSaves reachable (dead-code wiring) ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    Game.save(); Game.save();
    const hasWipeAll = typeof Game.wipeAllSaves === 'function';
    if (BEFORE) {
      check('7a. BEFORE: Game.wipeAllSaves does not exist (S.state.wipeAll unreachable)',
        !hasWipeAll);
    } else {
      check('7a. AFTER: Game.wipeAllSaves exists and clears everything', hasWipeAll);
      if (hasWipeAll) {
        Game.wipeAllSaves();
        check('7b. AFTER: all saves + index gone',
          S.state.listSaves().length === 0 && globalThis.localStorage._keys().length === 0,
          `keys=${globalThis.localStorage._keys().length}`);
      }
    }
  }

  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
