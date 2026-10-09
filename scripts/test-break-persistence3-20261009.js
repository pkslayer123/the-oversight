// BREAK-IT: persistence (save/load) — THIRD PASS (2026-10-09).
// First pass (test-break-persistence-20261008.js): 8 kills.
// Second pass (test-break-persistence2-20261008.js): win-path + death-race kills.
// This pass attacks what remains: mid-fight Continue fidelity (order/turnIdx),
// phantom fighters & phantom pending encounters (missing monster defs),
// scholarless saves, dead payload in state.run, stale belltoad _pendingPack,
// plus duplication held-checks (corpse loot, pantry/inventory conservation).
//
// KILLS:
//   P1. MID-FIGHT CONTINUE REORDERED THE FIGHT (HONESTY): load() recomputed
//       `order` via turnOrder() — random tiebreak, reinforcements re-sorted by
//       speed instead of their appended position. turnIdx then pointed at the
//       WRONG fighter ("Continue" didn't resume the fight, it re-dealt it).
//       FIX: syncRun persists f.order verbatim; load() restores it.
//   P2. PHANTOM FIGHTER SOFTLOCK: a mid-fight save whose monsterId has no def
//       at load (removed/renamed in an update, tampered save) restored with
//       mdef undefined; tbMonsterTurn throws TypeError (reading 'fleeAt') —
//       the fight could never advance and Continue resurrected it forever.
//       FIX: load() drops def-less monster fighters with an honest log line.
//   P3. PHANTOM PENDING-ENCOUNTER SOFTLOCK: pendingMonsterId with no def made
//       the "face it" panel unresolvable — startCombat throws on unknown ids,
//       so the button always threw and the expedition was stuck. FIX: load()
//       validates pendingMonsterId and clears the phantom encounter.
//   P4. SCHOLARLESS SAVE LOADED "FINE": load() only required s.run; a save
//       with no scholar loaded into a half-built Game. FIX: require s.scholar,
//       so the title screen takes the honest "could not be loaded" path.
//   P5. DEAD PAYLOAD: syncRun copied talkIdx/fireIdx/questGiven into state.run;
//       zero readers of state.run.talkIdx (etc.) — they persist on state
//       directly. FIX: removed from syncRun (state copies untouched).
//   P6. STALE BELLTOAD PACK: _pendingPack is per-fight Game state, not in the
//       save — loading a peaceful save (or starting a fresh fight) left the
//       previous fight's delayed pack armed, so belltoads answered the call in
//       some other fight's round 2. FIX: load() and startCombat clear it.
//
// HELD (attacked, resisted — documented, not failures):
//   - Duplication on load: corpse loot is rolled at death (registerDeath) and
//     persisted on the corpse — save/load changes nothing (P7a). Pantry and
//     inventory are conserved exactly across save/load (P7b) — all transfers
//     are single-tick and atomic; there is no mid-transaction save hook.
//   - runKey stability: still pinned across saves (regression re-check P8).
//   - RNG save-scumming of action-time outcomes (forage yields, fight turns)
//     remains possible — inherent to Math.random action-time rolls, and the
//     fixed class was *gates/flags* (read_stance once-per-fight, chorus pack,
//     debuff cleanse — all persistent now). Contest resolutions are
//     state-seeded (contestEngine._cxSeed) so re-resolving after a reload
//     replays the identical fate. Documented, not fixed: persisting the RNG
//     stream would be a design change, not a bug fix.
//
// Usage: node scripts/test-break-persistence3-20261009.js
//        BEFORE=1 node scripts/test-break-persistence3-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp3-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp3-before-${path.basename(f)}`, 'utf8')
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

async function settle() { await new Promise(r => setTimeout(r, 10)); }

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {};
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
function wireGame(st) {
  Game.state = st;
  Game.villagerId = st.scholar ? st.scholar.villagerId : 'v1';
  Game.map = { tiles: [], px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; said.length = 0;
  Game.tbfight = null; Game._pendingPack = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.data.villagers = Object.values(st.village.rosterChars || {});
}
function saveKey() {
  const saves = S.state.listSaves();
  if (!saves.length) throw new Error('no saves listed');
  return saves[0].key;
}
function storedRun(key) {
  return JSON.parse(globalThis.localStorage.getItem(key));
}

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

function mkFighter(key, kind, speed, monsterId) {
  const f = {
    key, kind, name: key === 'p' ? 'You' : 'Beast',
    hp: 40, maxHp: 40, speed, mx: 4, my: 4,
    alive: true, fled: false, acted: false, moveLeft: 0,
  };
  if (monsterId) f.monsterId = monsterId;
  return f;
}

async function main() {
  await settle();
  reseed(42);

  // ============ P1. MID-FIGHT CONTINUE: order/turnIdx fidelity ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    // Three fighters, speeds 1/5/9. Save-time order is NOT speed-sorted:
    // m_slow was appended as a mid-fight reinforcement (order.push), and it
    // is m_slow's turn (turnIdx 0). turnOrder() would sort [m_fast, p, m_slow].
    Game.tbfight = {
      id: 'f_order1',
      fighters: [mkFighter('p', 'player', 5), mkFighter('m_slow', 'monster', 1, 'bulldozer'), mkFighter('m_fast', 'monster', 9, 'bulldozer')],
      order: ['m_slow', 'p', 'm_fast'], turnIdx: 0, round: 2, over: false, result: null, terraform: {},
    };
    Game.save();
    const key = saveKey();
    const storedOrder = storedRun(key).run.tbfight.order;
    Game.tbfight = null;
    const ok = Game.load(key);
    check('P1a. load succeeds', ok === true);
    if (BEFORE) {
      check('P1b. BEFORE: Continue RE-SORTS the fight (order lost)',
        JSON.stringify(Game.tbfight.order) === JSON.stringify(['m_fast', 'p', 'm_slow']),
        `order=${JSON.stringify(Game.tbfight.order)}`);
      check('P1c. BEFORE: turnIdx now points at the WRONG fighter',
        Game.tbfight.order[Game.tbfight.turnIdx] === 'm_fast',
        `acting=${Game.tbfight.order[Game.tbfight.turnIdx]} (was m_slow's turn)`);
      check('P1d. BEFORE: save carries no order payload', storedOrder == null, `stored=${JSON.stringify(storedOrder)}`);
    } else {
      check('P1b. AFTER: Continue restores the save-time order verbatim',
        JSON.stringify(Game.tbfight.order) === JSON.stringify(['m_slow', 'p', 'm_fast']),
        `order=${JSON.stringify(Game.tbfight.order)}`);
      check('P1c. AFTER: turnIdx still means m_slow\'s turn',
        Game.tbfight.order[Game.tbfight.turnIdx] === 'm_slow',
        `acting=${Game.tbfight.order[Game.tbfight.turnIdx]}, turnIdx=${Game.tbfight.turnIdx}`);
      check('P1d. AFTER: order persisted in the save',
        JSON.stringify(storedOrder) === JSON.stringify(['m_slow', 'p', 'm_fast']));
    }
  }

  // ============ P2. PHANTOM FIGHTER (monster def gone at load) ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game.tbfight = {
      id: 'f_ghost1',
      fighters: [mkFighter('p', 'player', 5), mkFighter('m1', 'monster', 3, 'ghost_beast_xx')],
      order: ['p', 'm1'], turnIdx: 1, round: 2, over: false, result: null, terraform: {},
    };
    Game.save();
    const key = saveKey();
    Game.tbfight = null;
    const ok = Game.load(key);
    check('P2a. load succeeds', ok === true);
    const ghost = Game.tbfight.fighters.find(f => f.key === 'm1');
    if (BEFORE) {
      check('P2b. BEFORE: phantom fighter restores with NO mdef',
        !!ghost && ghost.mdef === undefined, `mdef=${ghost && ghost.mdef}`);
      let threw = false, msg = '';
      try { Game.tbMonsterTurn(ghost); } catch (e) { threw = true; msg = String(e.message).slice(0, 60); }
      check('P2c. BEFORE: the phantom\'s turn THROWS — fight can never advance (softlock)',
        threw, `threw=${threw} ${msg}`);
    } else {
      check('P2b. AFTER: phantom fighter dropped on load',
        !ghost, `fighters=${Game.tbfight.fighters.map(f => f.key).join(',')}`);
      check('P2c. AFTER: player fighter survives the purge',
        Game.tbfight.fighters.some(f => f.key === 'p' && f.isPlayer));
      check('P2d. AFTER: honest log line about the dropped phantom',
        said.some(m => /phantom fighter/i.test(m)), `said=${JSON.stringify(said).slice(0, 120)}`);
      check('P2e. AFTER: order/turnIdx still valid after the drop',
        Game.tbfight.turnIdx < Game.tbfight.order.length &&
        Game.tbfight.order.every(k => Game.tbfight.fighters.some(f => f.key === k)),
        `order=${JSON.stringify(Game.tbfight.order)} turnIdx=${Game.tbfight.turnIdx}`);
    }
  }

  // ============ P3. PHANTOM PENDING ENCOUNTER ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game.pendingEncounter = true;
    Game.pendingMonsterId = 'ghost_beast_xx';
    Game.pendingInTent = false;
    Game.save();
    const key = saveKey();
    Game.pendingEncounter = false; Game.pendingMonsterId = null;
    const ok = Game.load(key);
    check('P3a. load succeeds', ok === true);
    if (BEFORE) {
      check('P3b. BEFORE: phantom "face it" panel restores (unresolvable)',
        Game.pendingEncounter === true && Game.pendingMonsterId === 'ghost_beast_xx');
      let threw = false;
      try { Game.startCombat(Game.pendingMonsterId); } catch (e) { threw = /unknown monster id/.test(String(e.message)); }
      check('P3c. BEFORE: "Face it" can only throw — expedition stuck (softlock)',
        threw, 'startCombat throws on the phantom id');
    } else {
      check('P3b. AFTER: phantom pending encounter cleared on load',
        Game.pendingEncounter === false && Game.pendingMonsterId === null,
        `pending=${Game.pendingEncounter} id=${Game.pendingMonsterId}`);
      check('P3c. AFTER: honest log line about the cleared phantom',
        said.some(m => /no longer exists|phantom/i.test(m)), `said=${JSON.stringify(said).slice(0, 140)}`);
    }
  }

  // ============ P4. SCHOLARLESS SAVE ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game.save();
    const key = saveKey();
    // simulate a scholarless save (partial migration / tampered): strip scholar
    const raw = JSON.parse(globalThis.localStorage.getItem(key));
    raw.scholar = null;
    globalThis.localStorage.setItem(key, JSON.stringify(raw));
    const ok = Game.load(key);
    if (BEFORE) {
      check('P4a. BEFORE: scholarless save "loads" (half-built Game)', ok === true);
    } else {
      check('P4a. AFTER: scholarless save rejected (honest could-not-load path)', ok === false);
    }
  }

  // ============ P5. DEAD PAYLOAD in state.run ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game.state.talkIdx = { v1: 3 };
    Game.state.fireIdx = 7;
    Game.state.questGiven = true;
    Game.save();
    const key = saveKey();
    const run = storedRun(key).run;
    const hasDead = ('talkIdx' in run) || ('fireIdx' in run) || ('questGiven' in run);
    if (BEFORE) {
      check('P5a. BEFORE: run carries talkIdx/fireIdx/questGiven (zero readers)',
        hasDead, `keys=${Object.keys(run).filter(k => /talkIdx|fireIdx|questGiven/.test(k)).join(',')}`);
    } else {
      check('P5a. AFTER: dead payload gone from run', !hasDead);
    }
    // regression: the state-level fields still persist and restore
    Game.state.talkIdx = null; Game.state.fireIdx = null; Game.state.questGiven = false;
    const ok = Game.load(key);
    check('P5b. state-level talkIdx/fireIdx/questGiven still round-trip',
      ok === true && Game.state.questGiven === true && Game.state.fireIdx === 7 &&
      Game.state.talkIdx && Game.state.talkIdx.v1 === 3,
      `questGiven=${Game.state.questGiven} fireIdx=${Game.state.fireIdx}`);
  }

  // ============ P6. STALE BELLTOAD _pendingPack ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game._pendingPack = { id: 'belltoad', count: 2, mdef: {} }; // leftover from a previous fight
    Game.tbfight = null; // peaceful save — nothing pending
    Game.save();
    const key = saveKey();
    const ok = Game.load(key);
    check('P6a. load succeeds', ok === true);
    if (BEFORE) {
      check('P6b. BEFORE: stale pack survives the load (leaks into the next fight)',
        !!(Game._pendingPack && Game._pendingPack.count === 2),
        `pack=${JSON.stringify(Game._pendingPack && { id: Game._pendingPack.id, count: Game._pendingPack.count })}`);
    } else {
      check('P6b. AFTER: stale pack cleared on load', Game._pendingPack === null);
    }
    // regression: a mid-chorus save still restores its pack (r3 behavior kept)
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game.tbfight = {
      id: 'f_chorus1',
      fighters: [mkFighter('p', 'player', 5), mkFighter('m1', 'monster', 3, 'belltoad')],
      order: ['p', 'm1'], turnIdx: 0, round: 2, over: false, result: null, terraform: {},
    };
    Game._pendingPack = { id: 'belltoad', count: 2, mdef: { id: 'belltoad' } };
    Game.save();
    const k2 = saveKey();
    Game._pendingPack = null; Game.tbfight = null;
    Game.load(k2);
    check('P6c. mid-chorus pack still restores (no regression)',
      !!(Game._pendingPack && Game._pendingPack.id === 'belltoad' && Game._pendingPack.count === 2),
      `pack=${Game._pendingPack && Game._pendingPack.id}:${Game._pendingPack && Game._pendingPack.count}`);
  }

  // ============ P7. DUPLICATION HELD-CHECKS (both modes green) ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    // corpse loot is fixed at death and persisted on the corpse
    const corpseItems = [{ plantId: 'dandelion', qty: 3, spoilageDay: 9 }, { itemId: 'relic_1', qty: 1 }];
    Game.state.corpses = [{
      id: 'corpse_5_x', kind: 'monster', name: 'dead thing', monsterId: 'bulldozer',
      node: { x: 4, y: 4 }, mx: 4, my: 4, dayDied: 5, cause: 'combat',
      items: JSON.parse(JSON.stringify(corpseItems)), looted: false, buried: false,
    }];
    Game.state.scholar.inventory = [{ plantId: 'dandelion', qty: 2, spoilageDay: 8 }];
    Game.state.village.pantry = [{ name: 'Rice', kcalEach: 200, units: 65, spoilDay: 9999, safe: false, kg: 0.5, unit: 'scoop' }];
    Game.save();
    const key = saveKey();
    // mutate live (theft of opportunity), then reload — load must restore, not merge
    Game.state.corpses[0].items = [];
    Game.state.scholar.inventory = [];
    Game.state.village.pantry = [];
    Game.load(key);
    check('P7a. corpse loot unchanged by save/load (no re-roll, no wipe)',
      JSON.stringify(Game.state.corpses[0].items) === JSON.stringify(corpseItems),
      `items=${JSON.stringify(Game.state.corpses[0].items)}`);
    check('P7b. inventory + pantry conserved exactly (no duplication, no loss)',
      Game.state.scholar.inventory.length === 1 && Game.state.scholar.inventory[0].qty === 2 &&
      Game.state.village.pantry.length === 1 && Game.state.village.pantry[0].units === 65,
      `inv=${Game.state.scholar.inventory.length} pantry=${Game.state.village.pantry.length}`);
  }

  // ============ P8. runKey stability (regression re-check) ============
  {
    globalThis.localStorage._clear();
    wireGame(freshState(['v1']));
    Game.save();
    const k1 = saveKey();
    Game.save();
    const k2 = saveKey();
    check('P8a. save key stable across saves', k1 === k2, `${k1} vs ${k2}`);
    check('P8b. single index entry (no fork)', S.state.listSaves().length === 1);
  }

  console.log(fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECKS FAILED');
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
