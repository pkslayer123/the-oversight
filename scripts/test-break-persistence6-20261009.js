// BREAK-IT: persistence (save/load) — SIXTH PASS (2026-10-09).
// Passes 1-5 killed: save-leak wipe, fight-id minting, volatile fighter
// drops, mantle/key forks, index dishonesty, corrupt pruning, wipeAll dead
// code, dead payload, win-path stale saves, death-path throw races, mid-fight
// order re-deal, phantom fighters, phantom pending encounters, scholarless
// saves, talkIdx/fireIdx/questGiven dead payload, stale belltoad
// _pendingPack, stale cross-load fights, corrupt fighter nukes, silent quota
// saves, vanishing old-version saves, destroy-on-sight corruption, dead proof
// test, villageLost bleed, mapless saves, two-tab death resurrection,
// quarantine stamp collision.
//
// This pass attacks the FRESH surface:
//   T1. BEAM COOLDOWN SAVE-SCUM (EXPLOIT, KILL): alien r5 (2026-10-09) put the
//       beam's once-per-~3-rounds gate on the fight object (_beamCooldown),
//       but syncRun never persisted it — a mid-fight reload re-armed the beam
//       instantly (save-scummer gets a beam every round). Same gate class as
//       the belltoad chorus / read_stance kills (persistence r3).
//   T2. MID-UPRISING CONTINUE (SOFTLOCK/HONESTY, KILL): the uprising's
//       identity (uprising, uprisingAttackers on the fight; uprising,
//       uprisingAttackers, uprisingAllies on _lastBetrayal) never persisted —
//       a mid-uprising save+Continue resolved as an ORDINARY BETRAYAL:
//       uprisingAftermath (the village-wide justice) never fired, hostile
//       talk lines lost the uprising voice, and the flee-line swallow died.
//   T3. SAVE-SCUM FLAG SWEEP RE-DO (r4's empty own-prop diff, re-run after
//       alien r5 + forager commits).
//   T4. MAP/SET/DATE/CLASS FIDELITY: JSON-native proof on a rich state
//       (double round-trip deep-equal; a Date/Map/Set/class instance fails
//       this) + static sweep for `new Date(/Map(/Set(` into state fields.
//   T5. WRITE-ORDERING CRASH WINDOW: data-then-index is synchronous (no
//       player-hittable window); the real hostile case is index-write failure
//       after a successful data write — save() must report false (honest) and
//       the next save must adopt the orphaned blob (self-healing).
//   T6. MID-FIGHT CONTINUE FROM THE THREE DIRECT-tbfight PATHS: alien duel
//       (encounters.js startAlienCombat), uprising (justice.js), betrayal
//       (party.js) — never actually tested with a mid-fight save+Continue.
//   T7. ALIEN R5 FIELD ROUND-TRIP: apState (known/fanClubs/lastFeedDay/met),
//       fighter-level alienPid/alienTech.
//   T8. STORAGE-UNAVAILABLE HONESTY: throwing localStorage — primitives must
//       not throw, save() must report false, Game.load must refuse honestly.
//   T9. TOMBSTONE EDGES: 100-cap prune correctness, tombstone vs index
//       rebuild, tombstoned save still refused after another run saves.
//   T10. syncRun/load KEY PARITY RE-SWEEP: every state.run key written is
//       read; every tbSave key written is restored.
//   T11. S.state.save SINGLE CALLER (dead-code/backdoor sweep).
//
// Usage: node scripts/test-break-persistence6-20261009.js
//        BEFORE=1 node scripts/test-break-persistence6-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp6-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp6-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
function makeStore(overrides) {
  const _store = {};
  const api = {
    getItem: (k) => (k in _store ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    key: (i) => Object.keys(_store)[i] || null,
    _keys: () => Object.keys(_store),
    _reset: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  };
  Object.defineProperty(api, 'length', { get: () => Object.keys(_store).length });
  return Object.assign(api, overrides || {});
}
let store = makeStore();
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

// ---- seeded RNG BEFORE eval ----
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
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.sysSay = (m) => { said.push('SYS:' + String(m)); };
Game.drama = () => {}; Game.recordLegend = () => {}; Game.recordMoment = () => {};
Game.ledgerAdd = () => {}; Game.writeEpitaph = () => {}; Game.removeVillager = () => {};
Game.lineage = () => []; Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100; Game.integrationStage = () => 0;
Game.playerTile = () => ({ type: 'wild' }); Game.endingFrame = () => 'indispensable';

// ---- rich Game builder (enough for syncRun) ----
function buildGame(vid, opts) {
  reseed(42);
  opts = opts || {};
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: [vid, 'v8', 'v9', 'v10', 'v11'],
    rosterChars: { [vid]: { id: vid, name: 'Mara Voss' } },
  });
  st.scholar = S.state.newScholar(vid);
  st.scholar.day = 14;
  st.runKey = null;
  // alien r5 fields live on state.alienPlayers
  st.alienPlayers = {
    met: { vex_marlowe: { encounters: 3, bond: 2, lastOutcome: 'lost', lastDay: 12 } },
    favor: 5, lastDropDay: 10, lastFeedDay: 13,
    lastHuntDay: { vex_marlowe: 12 },
    known: { vex_marlowe: 'you recognized the fighting style' },
    fanClubs: { fight: 55, survival: 5, social: 5, showbiz: 5 },
  };
  Game.state = st;
  Game.villagerId = vid;
  Game.map = { px: 4, py: 4 };
  Game.dayPart = 1; Game.location = 'wild'; Game.departed = false;
  Game.log = []; Game.homeRegion = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.tbfight = null; Game._pendingPack = null; Game._lastBetrayal = null;
  if (opts.fight) Game.tbfight = opts.fight;
  if (opts.pendingPack) Game._pendingPack = opts.pendingPack;
  return st;
}
function saveAndReloadKey() {
  Game.syncRun();
  const r = S.state.save(Game.state);
  const key = Game.state.runKey;
  // fresh-process simulation: clear session state the way a new boot starts
  Game.tbfight = null; Game._pendingPack = null; Game._lastBetrayal = null;
  Game.villageLost = false; Game.over = false; Game.won = false;
  const ok = Game.load(key);
  return { ok, key, saveResult: r };
}

// ================= T1: BEAM COOLDOWN SAVE-SCUM (EXPLOIT) =================
{
  store._reset();
  // Alien-duel fight shape, as encounters.js startAlienCombat builds it.
  const duel = {
    id: 'f-beamtest', fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, speed: 4, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'h_vex', kind: 'hostile', name: 'The stranger', hp: 120, maxHp: 160, speed: 5, mx: 5, my: 5, alive: true, fled: false, moveLeft: 0, acted: false, alienPid: 'vex_marlowe', alienTech: [{ id: 'beam_weapon' }], apTurns: 2, apSpent: 0 },
    ],
    order: ['p', 'h_vex'], turnIdx: 0, round: 3,
    over: false, result: null, terraform: {}, alienFight: true,
    _beamCooldown: 2, // beam fired 1 round ago; 2 rounds of cooldown left
  };
  buildGame('v1', { fight: duel });
  Game.syncRun();
  const saveR = S.state.save(Game.state);
  const raw = JSON.parse(store.getItem(Game.state.runKey) || 'null');
  const savedCd = raw && raw.run && raw.run.tbfight ? raw.run.tbfight.beamCooldown : undefined;
  // fresh-process load
  Game.tbfight = null;
  const ok = Game.load(Game.state.runKey);
  const restoredCd = Game.tbfight && Game.tbfight._beamCooldown;
  const gateHolds = (() => {
    // with the cooldown restored, apMaybeBeamAttack must refuse (and tick down)
    const foe = Game.tbfight.fighters.find(x => x.alienPid === 'vex_marlowe');
    return Game.apMaybeBeamAttack(foe) === false;
  })();
  if (BEFORE) {
    check('T1. BEFORE: beam cooldown dropped on save (save-scum re-arms beam)',
      ok === true && savedCd === undefined && (restoredCd === undefined || restoredCd === 0),
      `saved.beamCooldown=${savedCd} restored._beamCooldown=${restoredCd}`);
  } else {
    check('T1. beam cooldown persists across save/load (no free beam)',
      ok === true && savedCd === 2 && restoredCd === 2 && gateHolds,
      `saved=${savedCd} restored=${restoredCd} gateHolds=${gateHolds}`);
  }
}

// ================= T2: MID-UPRISING CONTINUE =================
{
  store._reset();
  // Uprising fight shape, as justice.js builds it.
  const up = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 60, maxHp: 100, speed: 4, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'h_v9', kind: 'hostile', villagerId: 'v9', name: 'V9', hp: 0, maxHp: 30, speed: 3, mx: 5, my: 5, alive: false, fled: false, moveLeft: 0, acted: false, uprising: true },
      { key: 'h_v10', kind: 'hostile', villagerId: 'v10', name: 'V10', hp: 20, maxHp: 30, speed: 3, mx: 6, my: 5, alive: true, fled: false, moveLeft: 0, acted: false, uprising: true },
      { key: 'v_v11', kind: 'villager', villagerId: 'v11', name: 'V11', hp: 30, maxHp: 30, speed: 3, mx: 3, my: 5, alive: true, fled: false, moveLeft: 0, acted: false },
    ],
    order: ['p', 'h_v9', 'h_v10', 'v_v11'], turnIdx: 2, round: 2,
    over: false, result: null,
    betrayal: true, uprising: true, aggressor: 'npc', betrayer: 'v9',
    uprisingAttackers: ['v9', 'v10'],
  };
  buildGame('v1', { fight: up });
  const { ok } = saveAndReloadKey();
  const f = Game.tbfight, lb = Game._lastBetrayal;
  if (BEFORE) {
    check('T2. BEFORE: uprising identity lost on reload (resolves as ordinary betrayal)',
      ok === true && !!f && f.betrayal === true && !f.uprising && !(lb && lb.uprising),
      `fight.uprising=${f && f.uprising} lb.uprising=${lb && lb.uprising}`);
  } else {
    check('T2. uprising survives save/load: fight + _lastBetrayal identity intact',
      ok === true && !!f && f.betrayal === true && f.uprising === true &&
      lb && lb.uprising === true &&
      deepEq(lb.uprisingAttackers, ['v9', 'v10']) &&
      deepEq(lb.uprisingAllies, ['v11']) &&
      deepEq(lb.witnesses, ['v11']) &&
      lb.betrayer === 'v9' && lb.aggressor === 'npc' && lb.betrayerDead === true,
      `fight.uprising=${f && f.uprising} lb.uprising=${lb && lb.uprising} ` +
      `attackers=${JSON.stringify(lb && lb.uprisingAttackers)} witnesses=${JSON.stringify(lb && lb.witnesses)} betrayerDead=${lb && lb.betrayerDead}`);
  }
}

// ================= T6a: ALIEN DUEL continue (fight intact, hostile survives) =================
{
  store._reset();
  const duel = {
    id: 'f-duel', fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, speed: 4, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'h_vex', kind: 'hostile', name: 'The stranger', hp: 120, maxHp: 160, speed: 5, mx: 5, my: 5, alive: true, fled: false, moveLeft: 0, acted: false, alienPid: 'vex_marlowe', alienTech: [{ id: 'beam_weapon' }], apTurns: 2, apSpent: 0 },
    ],
    order: ['p', 'h_vex'], turnIdx: 1, round: 3,
    over: false, result: null, terraform: {}, alienFight: true,
  };
  buildGame('v1', { fight: duel });
  const { ok } = saveAndReloadKey();
  const foe = Game.tbfight && Game.tbfight.fighters.find(x => x.alienPid === 'vex_marlowe');
  check('T6a. alien-duel mid-fight Continue: hostile with alienPid + tech survives',
    ok === true && !!Game.tbfight && !!foe && foe.kind === 'hostile' && foe.alive === true &&
    deepEq(Game.tbfight.order, ['p', 'h_vex']) && Game.tbfight.turnIdx === 1,
    `foe=${!!foe} tech=${JSON.stringify(foe && foe.alienTech)} order=${JSON.stringify(Game.tbfight && Game.tbfight.order)}`);
}

// ================= T6b: BETRAYAL (party.js) continue =================
{
  store._reset();
  const bt = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 70, maxHp: 100, speed: 4, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'h_v7', kind: 'hostile', villagerId: 'v7', name: 'V7', hp: 25, maxHp: 30, speed: 3, mx: 5, my: 5, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'v_v8', kind: 'villager', villagerId: 'v8', name: 'V8', hp: 30, maxHp: 30, speed: 3, mx: 3, my: 5, alive: true, fled: false, moveLeft: 0, acted: false },
    ],
    order: ['p', 'h_v7', 'v_v8'], turnIdx: 0, round: 1,
    over: false, result: null,
    betrayal: true, betrayer: 'v7', aggressor: 'player',
  };
  buildGame('v1', { fight: bt });
  const { ok } = saveAndReloadKey();
  const lb = Game._lastBetrayal;
  check('T6b. betrayal-fight mid-fight Continue: _lastBetrayal rebuilt, fight resumable',
    ok === true && !!Game.tbfight && Game.tbfight.betrayal === true &&
    lb && lb.betrayer === 'v7' && lb.aggressor === 'player' &&
    deepEq(lb.witnesses, ['v8']) && lb.betrayerDead === false,
    `betrayal=${Game.tbfight && Game.tbfight.betrayal} lb=${JSON.stringify(lb)}`);
}

// ================= T3: SAVE-SCUM FLAG SWEEP RE-DO =================
// r4 proved the Game own-prop diff across fresh load was EMPTY. Re-run after
// alien r5 + forager break-it commits. Any NEW unpersisted per-day/fight/event
// gate on Game state = a NEW save-scum exploit.
{
  store._reset();
  const duel = {
    id: 'f-sweep', fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, speed: 4, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'h_vex', kind: 'hostile', name: 'The stranger', hp: 120, maxHp: 160, speed: 5, mx: 5, my: 5, alive: true, fled: false, moveLeft: 0, acted: false, alienPid: 'vex_marlowe', alienTech: [{ id: 'beam_weapon' }], apTurns: 2, apSpent: 0 },
    ],
    order: ['p', 'h_vex'], turnIdx: 0, round: 3,
    over: false, result: null, terraform: { '5,5': 'scorched' }, alienFight: true,
    _beamCooldown: 1,
  };
  buildGame('v1', {
    fight: duel,
    pendingPack: { id: 'belltoad', count: 2, mdef: { id: 'belltoad' } },
  });
  Game.pendingEncounter = true; Game.pendingMonsterId = 'hushwolf'; Game.pendingInTent = false;
  const beforeKeys = Object.keys(Game).sort();
  const beforeSnap = {
    villagerId: Game.villagerId, dayPart: Game.dayPart, location: Game.location,
    encounterDone: Game.encounterDone, wanderer: Game.wanderer,
    pendingEncounter: Game.pendingEncounter, pendingMonsterId: Game.pendingMonsterId,
    pendingInTent: Game.pendingInTent,
  };
  const { ok } = saveAndReloadKey();
  const afterKeys = Object.keys(Game).sort();
  const keyDiff = beforeKeys.filter(k => !afterKeys.includes(k))
    .concat(afterKeys.filter(k => !beforeKeys.includes(k)));
  const afterSnap = {
    villagerId: Game.villagerId, dayPart: Game.dayPart, location: Game.location,
    encounterDone: Game.encounterDone, wanderer: Game.wanderer,
    pendingEncounter: Game.pendingEncounter, pendingMonsterId: Game.pendingMonsterId,
    pendingInTent: Game.pendingInTent,
  };
  const packOk = Game._pendingPack && Game._pendingPack.id === 'belltoad' && Game._pendingPack.count === 2;
  const beamOk = Game.tbfight && Game.tbfight._beamCooldown === 1;
  const terrOk = Game.tbfight && Game.tbfight.terraform && Game.tbfight.terraform['5,5'] === 'scorched';
  const beamExpected = BEFORE ? false : true; // the sweep must CATCH the T1-class gate (BEFORE), then hold (AFTER)
  check('T3. own-prop KEY diff across fresh load is empty (no new unpersisted gates)',
    ok === true && keyDiff.length === 0 && deepEq(beforeSnap, afterSnap) && packOk && (beamOk === beamExpected) && terrOk,
    `keyDiff=[${keyDiff.join(',')}] snapEq=${deepEq(beforeSnap, afterSnap)} pack=${packOk} beam=${beamOk}(expected ${beamExpected}) terraform=${terrOk}`);
}

// ================= T4: MAP/SET/DATE/CLASS FIDELITY =================
{
  store._reset();
  buildGame('v1');
  // JSON round-trip deep-equal: a Date/Map/Set/class instance in state FAILS this.
  const snap1 = JSON.stringify(Game.state);
  const st2 = JSON.parse(snap1);
  const jsonNative = deepEq(st2, JSON.parse(JSON.stringify(st2))) && JSON.stringify(st2) === snap1;
  // a Date smuggled into state would survive bit-identically but come back a string — prove none exist
  let dateFound = false;
  (function walk(o) {
    if (!o || typeof o !== 'object' || dateFound) return;
    if (o instanceof Date || o instanceof Map || o instanceof Set) { dateFound = true; return; }
    for (const k of Object.keys(o)) walk(o[k]);
  })(Game.state);
  // tombstones + index entries are constructed literals (JSON-native by construction)
  S.state.wipe('dummy-nonexistent-key'); // no tombstone for a key that never was
  check('T4. rich state is JSON-native: double round-trip deep-equal, no Date/Map/Set/class',
    jsonNative && !dateFound,
    `roundTripEq=${jsonNative} exoticFound=${dateFound}`);
}

// ================= T5: WRITE-ORDERING CRASH WINDOW =================
// localStorage writes are synchronous — no player-hittable window between the
// data write and the index write. The hostile case that IS reachable: the
// index write fails after the data write succeeded (quota). save() must say
// false (never silent success) and the next save must adopt the orphan blob.
{
  store._reset();
  buildGame('v5');
  Game.syncRun();
  const st = Game.state;
  const key = S.state.saveKey(st);
  // poison ONLY the index write
  const realSet = store.setItem;
  store.setItem = (k, v) => { if (k === 'scattering-saves-index') throw new Error('QuotaExceededError'); return realSet(k, v); };
  const r1 = S.state.save(st);
  const blobExists = store.getItem(key) !== null;
  const listedAfterFail = S.state.listSaves().some(i => i.key === key);
  // heal and save again: the orphaned blob must be adopted into the index
  store.setItem = realSet;
  const r2 = S.state.save(st);
  const listedAfterHeal = S.state.listSaves().some(i => i.key === key);
  check('T5. index-write failure: honest false, orphaned blob adopted on next save',
    r1 === false && blobExists && !listedAfterFail && r2 === true && listedAfterHeal,
    `save1=${r1} blob=${blobExists} listed1=${listedAfterFail} save2=${r2} listed2=${listedAfterHeal}`);
}

// ================= T7: ALIEN R5 FIELD ROUND-TRIP =================
{
  store._reset();
  const st = buildGame('v7');
  Game.syncRun();
  const r = S.state.save(st);
  const back = S.state.load(st.runKey);
  const ap = back && back.alienPlayers;
  check('T7. alien r5 fields round-trip: known/fanClubs/lastFeedDay/lastDropDay/met/lastHuntDay',
    r === true && !!ap &&
    deepEq(ap.known, { vex_marlowe: 'you recognized the fighting style' }) &&
    deepEq(ap.fanClubs, { fight: 55, survival: 5, social: 5, showbiz: 5 }) &&
    ap.lastFeedDay === 13 && ap.lastDropDay === 10 &&
    ap.met.vex_marlowe.encounters === 3 && ap.lastHuntDay.vex_marlowe === 12,
    `known=${JSON.stringify(ap && ap.known)} feed=${ap && ap.lastFeedDay}`);
}

// ================= T8: STORAGE-UNAVAILABLE HONESTY =================
{
  const throwing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
    key: () => { throw new Error('denied'); },
  };
  Object.defineProperty(throwing, 'length', { get: () => { throw new Error('denied'); } });
  const prev = globalThis.localStorage;
  globalThis.localStorage = throwing;
  let results = {};
  try { results.save = S.state.save({ startedAt: 1, runKey: 'k' }); } catch (e) { results.save = 'THREW'; }
  try { results.list = S.state.listSaves(); } catch (e) { results.list = 'THREW'; }
  try { results.load = S.state.load('k'); } catch (e) { results.load = 'THREW'; }
  try { results.quarantine = S.state.quarantineKey('k'); } catch (e) { results.quarantine = 'THREW'; }
  globalThis.localStorage = prev;
  // Game.load must refuse honestly, not throw
  let gload = 'unset', gthrew = null;
  try { gload = Game.load('k'); } catch (e) { gthrew = e; }
  check('T8. blocked storage: primitives degrade honestly, never throw',
    results.save === false && Array.isArray(results.list) && results.list.length === 0 &&
    results.load === null && results.quarantine === undefined &&
    gload === false && gthrew === null,
    `save=${results.save} listLen=${results.list && results.list.length} load=${results.load} Game.load=${gload}`);
}

// ================= T9: TOMBSTONE EDGES =================
{
  store._reset();
  // freeze Date.now to a manual counter for deterministic age ordering
  let now = 1000000;
  const realNow = Date.now;
  Date.now = () => now;
  for (let i = 0; i < 101; i++) {
    const k = 'scattering-save-cap-' + i;
    store.setItem(k, JSON.stringify({ v: i }));
    S.state.wipe(k, 'ended');
    now += 1;
  }
  Date.now = realNow;
  const tombKeys = store._keys().filter(k => k.indexOf('scattering-save-tombstone-') === 0);
  const ages = tombKeys.map(k => JSON.parse(store.getItem(k)).t).sort((a, b) => a - b);
  const oldestSurvivor = Math.min.apply(null, ages);
  check('T9a. tombstone cap: 101 wipes -> 100 tombstones, oldest pruned',
    tombKeys.length === 100 && oldestSurvivor === 1000001,
    `count=${tombKeys.length} oldestSurvivorT=${oldestSurvivor}`);
  // tombstone vs index rebuild: wipe K, then save a DIFFERENT run — the
  // index rebuild must not resurrect K, the tombstone must survive, and a
  // later save of K is still refused.
  const stA = buildGame('v9a'); Game.syncRun(); S.state.save(stA); const keyA = stA.runKey;
  S.state.wipe(keyA, 'ended');
  const stB = buildGame('v9b'); Game.syncRun(); const rB = S.state.save(stB);
  const tombA = store.getItem('scattering-save-tombstone-' + keyA) !== null;
  const listedA = S.state.listSaves().some(i => i.key === keyA);
  stA.runKey = keyA;
  const rA2 = S.state.save(stA);
  check('T9b. tombstone survives index rebuilds; tombstoned key still refused',
    rB === true && tombA && !listedA && rA2 === 'tombstoned',
    `saveB=${rB} tombA=${tombA} listedA=${listedA} saveA2=${JSON.stringify(rA2)}`);
}

// ================= T10: syncRun/load KEY PARITY RE-SWEEP =================
{
  const src = srcOf('src/js/game.js');
  // isolate load() body: from "load(key) {" to the following "wipe() {"
  const loadStart = src.indexOf('    load(key) {');
  const wipeStart = src.indexOf('    wipe() {', loadStart);
  const loadBody = src.slice(loadStart, wipeStart);
  const syncStart = src.indexOf('    syncRun() {');
  const syncEnd = src.indexOf('    save() {', syncStart);
  const syncBody = src.slice(syncStart, syncEnd);
  // every tbSave key written must be read in load()
  const tbStart = syncBody.indexOf('tbSave = {');
  const tbEnd = syncBody.indexOf('\n          };', tbStart); // 10-space close of the tbSave literal
  const tbSaveBlock = syncBody.slice(tbStart, tbEnd);
  const tbKeys = [...tbSaveBlock.matchAll(/^\s{12}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map(m => m[1]);
  const tbMissing = tbKeys.filter(k => !loadBody.includes('tbS.' + k));
  // every state.run key written must be read in load() via r.
  const runBlock = syncBody.slice(syncBody.indexOf('this.state.run = {'));
  const runKeys = [...runBlock.matchAll(/^\s{8}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map(m => m[1]);
  const runMissing = runKeys.filter(k => !loadBody.includes('r.' + k));
  check('T10. syncRun/load key parity: every written key is read',
    tbMissing.length === 0 && runMissing.length === 0,
    `tbKeys=[${tbKeys.join(',')}] tbMissing=[${tbMissing.join(',')}] runMissing=[${runMissing.join(',')}]`);
}

// ================= T11: S.state.save SINGLE CALLER (dead-code/backdoor sweep) =================
{
  let hits = 0;
  for (const f of FILES) {
    const s = srcOf(f);
    const re = /S\.state\.save\s*\(/g;
    let m;
    while ((m = re.exec(s))) {
      // exclude the definition itself (engine/state.js) and comments
      const lineStart = s.lastIndexOf('\n', m.index - 1) + 1;
      const line = s.slice(lineStart, s.indexOf('\n', m.index));
      if (/^\s*\/\//.test(line)) continue;
      if (f === 'src/js/engine/state.js') continue;
      hits++;
    }
  }
  check('T11. S.state.save has exactly one live caller (Game.save) — no backdoor writers',
    hits === 1, `callers=${hits}`);
}


// ================= T12: SIBLING SWEEP — hummice + shout gates round-trip =================
{
  store._reset();
  // Hummice fight with stacked hum + a spent shout + broken chorus.
  const hum = {
    id: 'f-hum', fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 70, maxHp: 100, speed: 4, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'm1', kind: 'monster', name: 'hummice', hp: 40, maxHp: 40, speed: 5, mx: 5, my: 5, alive: true, fled: false, moveLeft: 0, acted: false, monsterId: 'hummice' },
    ],
    order: ['p', 'm1'], turnIdx: 0, round: 4,
    over: false, result: null, terraform: {},
    humStacks: 3, humMice: 2, humRiseRound: 4, humDecayRound: 3,
    shouts: 2, chorusBrokenUntil: 5,
    terraformScorched: true, orderDirty: true,
  };
  buildGame('v1', { fight: hum });
  const { ok } = saveAndReloadKey();
  const f = Game.tbfight;
  const got = f && {
    humStacks: f.humStacks, humMice: f.humMice, humRiseRound: f.humRiseRound,
    humDecayRound: f.humDecayRound, shouts: f.shouts,
    chorusBrokenUntil: f.chorusBrokenUntil,
    terraformScorched: f.terraformScorched, orderDirty: f.orderDirty,
  };
  const want = { humStacks: 3, humMice: 2, humRiseRound: 4, humDecayRound: 3, shouts: 2, chorusBrokenUntil: 5, terraformScorched: true, orderDirty: true };
  if (BEFORE) {
    check('T12. BEFORE: hummice/shout fight gates reset on reload (save-scum threat-eraser)',
      ok === true && !!f && (f.humStacks === undefined || f.humStacks === 0) && !f.shouts && !f.chorusBrokenUntil,
      `humStacks=${f && f.humStacks} shouts=${f && f.shouts}`);
  } else {
    check('T12. hummice/shout/scorch/order gates persist across save/load',
      ok === true && !!f && deepEq(got, want),
      `got=${JSON.stringify(got)}`);
  }
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
