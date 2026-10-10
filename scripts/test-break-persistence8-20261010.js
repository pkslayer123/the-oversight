// BREAK-IT: persistence (save/load) — EIGHTH PASS (2026-10-10).
// Passes 1-7 killed: save-leak wipe, fight-id minting, volatile fighter
// drops, mantle/key forks, index dishonesty, corrupt pruning, wipeAll dead
// code, dead payload, win-path stale saves, death-path throw races, mid-fight
// order re-deal, phantom fighters, phantom pending encounters, scholarless
// saves, belltoad _pendingPack, stale cross-load fights, corrupt fighter
// nukes, silent quota saves, vanishing old-version saves, destroy-on-sight
// corruption, dead proof test, villageLost bleed, mapless saves, two-tab
// death resurrection, quarantine stamp collision, beam-cooldown save-scum,
// mid-uprising continue, Map/Set/Date fidelity, write-ordering crash window,
// alien r5 round-trip, storage-unavailable honesty, tombstone edges, key
// parity, S.state.save callers, wipeAll tombstones, cross-tab staleness
// refusal, migration registry, corrupt-index self-healing, quarantine
// notice + restore manifest, tombstoned read path, save-integrity reverts,
// talkIdx rewire, _seSeq (this pass).
//
// This pass attacks the FRESH surface (systems added/changed since 2026-10-08):
//   K8. _seSeq SAVE/LOAD COLLISION (KILL): applyStatus mints a session-unique
//       _seq per status entry; the legacy s.diseases/s.poisons mirror is
//       matched by _seq (disease rework 2026-10-10). _seSeq is Game-level and
//       does NOT survive save/load — after Continue it reset to undefined, so
//       the first post-load applyStatus re-minted seq 1, colliding with a
//       pre-load entry. Curing the post-load disease dropped the WRONG
//       mirror (seDropMirror takes the first seq match): engine and the
//       herbal_remedy/purify gate disagreed in both directions. Fixed: reseed
//       _seSeq from the max live _seq (scholar + live fight fighters) before
//       minting.
//   N.  ROUND-TRIP FIDELITY of new persisted slices: alienPlayers, stash
//       (armory/pharmacy + deposit ledger), buried caches (parasiteRisk field
//       contract), state.fires, scholar.statuses + disease mirror,
//       activeContest (mid-show), arenaContest (suspended), village.justice
//       (moot/exile), pendingContest, gossip, saveSeq monotonicity.
//   S.  SAVE-SCUM: fight-id gate, _cxSeed determinism across load, corpse
//       loot fixed at death, read_stance gate, beam cooldown.
//   D.  DUPLICATION ON LOAD (new slices): double-load growth checks,
//       quarantine double-restore, apState/stashState migration idempotence.
//   F.  SOFTLOCK mid-flight: mid-activeContest, arenaSuspended+tbfight,
//       pending moot, exile, mid-alien-duel.
//   H.  HONESTY: index bearer after mantle transfer (post alien-r7 re-verify),
//       saveLocationLabel, quarantine-notice wiring, debug-panel restore
//       wiring, autosave status handling, willMigrate copy (source-level).
//   M.  DEAD CODE + MIGRATION: S.state export caller sweep, synthetic
//       MIGRATIONS[2] end-to-end (registry fires in production path).
//
// BEFORE=1 runs the _seSeq break demonstration against pre-fix code from git
// HEAD (src/js/statusEffects.js only); all other checks are mode-independent.
// Seeded per repo convention: SEED env override, fixed default.
//
// Usage: node scripts/test-break-persistence8-20261010.js
//        BEFORE=1 node scripts/test-break-persistence8-20261010.js
//        SEED=7 node scripts/test-break-persistence8-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/statusEffects.js'];
if (BEFORE) {
  for (const f of PRE) execSync(`git show HEAD:${f} > /tmp/bp8-before-${path.basename(f)}`, { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix statusEffects.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp8-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
function makeStore() {
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
  return api;
}
globalThis.localStorage = makeStore();

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
let rng = mulberry32(SEED);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }

// ---- full module list in index.html order (minus DOM-only) ----
global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js',
  'src/js/truth.js', 'src/js/contests.js', 'src/js/broadcast.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

// ---- data ----
const PAIRS = [['statusEffects.json', 'statusEffects'], ['monsters.json', 'monsters'],
  ['alienPlayers.json', 'alienPlayers'], ['plants.json', 'plants']];
global.SCATTER_DATA = {};
for (const [file, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', file), 'utf8')); }
  catch (e) { /* leave undefined */ }
}
if (!global.SCATTER_DATA.monsters) global.SCATTER_DATA.monsters = { monsters: [] };
if (!global.SCATTER_DATA.alienPlayers) global.SCATTER_DATA.alienPlayers = [];
Game.data = global.SCATTER_DATA;

// ---- stubs ----
Game.say = () => {}; Game.drama = () => {}; Game.audioEvent = () => {};
Game.recordLegend = () => {}; Game.recordMoment = () => {}; Game.ledgerAdd = () => {};
Game.playerTile = () => ({ type: 'haven' });
Game.maxHealth = () => 100;

// ---- helpers ----
let fails = 0, passes = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (cond) passes++; else fails++;
}
function deq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deq(x, b[i]));
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every(k => deq(a[k], b[k]));
}
function freshState(vid) {
  const st = S.state.newState();
  const chars = {}; chars[vid] = { id: vid, name: 'Tove Lind' };
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: [vid], rosterChars: chars, trust: {},
  });
  st.scholar = S.state.newScholar(vid);
  st.scholar.day = 5; st.scholar.dayTicks = 100;
  st.startedAt = 1700000000000;
  st.run = { map: { tiles: [], px: 4, py: 4, worldSeed: 1, worldSize: 9 } };
  return st;
}
function wireGame(st, vid) {
  Game.state = st;
  Game.villagerId = vid;
  Game.map = st.run.map;
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; Game.tbfight = null; Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game._seSeq = undefined;
}
function saveKeyOf() { return S.state.listSaves()[0] && S.state.listSaves()[0].key; }

// ================= K8: _seSeq save/load collision =================
console.log('\n--- K8: _seSeq save/load collision (disease mirror desync) ---');
{
  globalThis.localStorage._reset();
  reseed(SEED);
  const st = freshState('v1'); wireGame(st, 'v1');
  Game.applyStatus('scholar', 'gutrot', {});
  Game.applyStatus('scholar', 'wound_fever', {});
  const preSeqs = Game.state.scholar.statuses.map(e => e._seq);
  Game.save();
  const key = saveKeyOf();
  // fresh boot: Game-level counter is gone
  Game._seSeq = undefined;
  check('K8 setup: load ok', Game.load(key) === true);
  Game.applyStatus('scholar', 'trichinosis', {});
  const seqs = Game.state.scholar.statuses.map(e => e.id + ':' + e._seq);
  const triSeq = Game.state.scholar.statuses.find(e => e.id === 'trichinosis')._seq;
  const mirrorsBefore = Game.state.scholar.diseases.map(m => m.name);
  Game.cureStatus('scholar', 'trichinosis', 'test');
  const engAfter = Game.state.scholar.statuses.map(e => e.id);
  const mirAfter = Game.state.scholar.diseases.map(m => m.name);
  if (BEFORE) {
    check('K8 BREAK: post-load applyStatus re-mints a colliding seq',
      triSeq === 1 && preSeqs.indexOf(triSeq) >= 0, 'trichinosis seq=' + triSeq + ', pre=' + preSeqs.join(','));
    check('K8 BREAK: curing the post-load disease drops the WRONG mirror',
      engAfter.indexOf('gutrot') >= 0 && mirAfter.indexOf('Nauseous') < 0,
      'engine=' + engAfter.join(',') + ' mirrors=' + mirAfter.join(','));
  } else {
    check('K8 FIX: post-load applyStatus reseeds from max live seq (no collision)',
      triSeq === 3, 'seqs=' + seqs.join(' '));
    check('K8 FIX: cure removes only its own mirror; engine and mirrors agree',
      deq(engAfter, ['gutrot', 'wound_fever']) && deq(mirAfter, ['Nauseous', 'Feverish']),
      'engine=' + engAfter.join(',') + ' mirrors=' + mirAfter.join(','));
  }
}
{
  // K8c: same class mid-fight — fighter statuses persist with _seq; a fresh
  // load must not re-mint a colliding seq onto a fighter either.
  globalThis.localStorage._reset();
  reseed(SEED);
  const st = freshState('v1'); wireGame(st, 'v1');
  Game.tbfight = {
    id: 'f_seq1', fighters: [
      { key: 'p', kind: 'player', hp: 90, mx: 4, my: 4, alive: true, statuses: [] },
      { key: 'm1', kind: 'monster', monsterId: 'hushwolf', hp: 100, mx: 5, my: 5, alive: true, statuses: [] },
    ],
    order: ['p', 'm1'], turnIdx: 0, round: 1, over: false, terraform: {},
  };
  const m1 = Game.tbfight.fighters[1];
  Game.applyStatus(m1, 'burn', { turns: 3 });
  const preFighterSeq = m1.statuses[0]._seq;
  Game.save();
  const key = saveKeyOf();
  Game.tbfight = null; Game._seSeq = undefined;
  if (BEFORE) {
    Game.load(key);
    const m1b = Game.tbfight.fighters[1];
    Game.applyStatus(m1b, 'slow', { turns: 2 });
    const newSeq = m1b.statuses[m1b.statuses.length - 1]._seq;
    check('K8c BREAK: mid-fight post-load applyStatus collides on the fighter',
      newSeq === preFighterSeq, `pre=${preFighterSeq} post=${newSeq}`);
  } else {
    Game.load(key);
    const m1b = Game.tbfight.fighters[1];
    check('K8c setup: fighter statuses survive mid-fight load',
      m1b.statuses.length === 1 && m1b.statuses[0]._seq === preFighterSeq);
    Game.applyStatus(m1b, 'slow', { turns: 2 });
    const newSeq = m1b.statuses[m1b.statuses.length - 1]._seq;
    check('K8c FIX: mid-fight post-load seq reseeds (no fighter collision)',
      newSeq === preFighterSeq + 1, `pre=${preFighterSeq} post=${newSeq}`);
  }
}

// ================= N: round-trip fidelity of new persisted slices =================
console.log('\n--- N: round-trip fidelity of new persisted slices ---');
{
  globalThis.localStorage._reset();
  reseed(SEED);
  const st = freshState('v1'); wireGame(st, 'v1');
  // N1: alienPlayers — rival knowledge, activation/deactivation, fan clubs
  st.alienPlayers = {
    met: { zx1: { encounters: 3, lastOutcome: 'spared', lastDay: 4, bond: 2 } },
    favor: 5,
    fanClubs: { fight: 5, survival: 3, social: 0, showbiz: 1 },
    lastDropDay: 3, lastFeedDay: 4, lastGroupDay: 2,
    lastHuntDay: { zx1: 4 }, lastVillagerKillDay: 1,
    known: { zx1: 'feed-reveal' },
  };
  // N2: stash — armory/pharmacy sections + deposit ledger
  st.village.stash = {
    materials: { wood: 3, branch: 0, stone: 1, fiber: 0 },
    tools: [{ id: 't1', name: 'stone axe' }],
    weapons: [{ id: 'w1', name: 'spear' }],
    medicine: [{ id: 'm1', name: 'yarrow poultice' }],
    ledger: [{ day: 4, vid: 'v1', kind: 'deposit', what: 'spear', qty: 1 }],
  };
  // N3: buried caches — parasiteRisk field contract (food r2 2026-10-10)
  st.scholar.caches = [
    { id: 'c1', kind: 'food', key: 0, qty: 2, parasiteRisk: 0.3, spoilDay: 9, buriedDay: 4, x: 3, y: 3 },
  ];
  // N4: fires — till/burn0/inside/lastTax
  st.fires = [
    { tx: 4, ty: 4, cx: 2, cy: 2, till: 5 * 960 + 400, burn0: 300 },
    { tx: 4, ty: 4, cx: 5, cy: 5, till: 5 * 960 + 700, burn0: 200, inside: true, lastTax: 5 * 960 + 100 },
  ];
  // N6/N7: contest state — mid-show + suspended arena contest
  st.activeContest = {
    kind: 'show', showId: 's1', showName: 'Mouth Race', participant: 'v1',
    phase: 'beat2', phaseIdx: 1, phases: [{ text: 'a' }, { text: 'b' }], variant: null, wounds: 1,
  };
  st.arenaContest = { id: 'ac1', suspended: true, phase: 'duel', fighters: ['v1', 'm_hush'] };
  // N8: justice — pending moot + exile
  st.village.justice = { stage: 3, crimes: [{ kind: 'theft', day: 4 }], confrontedBy: 'v2', confrontRefused: true, exiled: false, exileDay: null, amendsCredit: 2, warned: true };
  // N9: pendingContest + gossip
  st.pendingContest = { firesDay: 12, id: 'c1' };
  st.village.gossip = [{ day: 5, action: 'feast', heard: ['v1'] }];
  Game.save();
  const key = saveKeyOf();
  const rawBefore = JSON.parse(globalThis.localStorage.getItem(key));
  const ok = Game.load(key);
  check('N setup: save+load ok', ok === true, 'key=' + key);
  const s2 = Game.state;
  check('N1. alienPlayers round-trips (rival knowledge, fan clubs, activation flags)',
    deq(s2.alienPlayers, rawBefore.alienPlayers), JSON.stringify(s2.alienPlayers).slice(0, 120));
  check('N2. stash round-trips (armory/pharmacy sections + deposit ledger)',
    deq(s2.village.stash, rawBefore.village.stash));
  check('N3. buried caches round-trip (parasiteRisk field contract)',
    deq(s2.scholar.caches, rawBefore.scholar.caches));
  check('N4. state.fires round-trips (till/burn0/inside/lastTax)',
    deq(s2.fires, rawBefore.fires));
  check('N6. activeContest round-trips mid-show', deq(s2.activeContest, rawBefore.activeContest));
  check('N7. arenaContest round-trips (suspended)', deq(s2.arenaContest, rawBefore.arenaContest));
  check('N8. village.justice round-trips (moot/exile pending)', deq(s2.village.justice, rawBefore.village.justice));
  check('N9. pendingContest + gossip round-trip',
    deq(s2.pendingContest, rawBefore.pendingContest) && deq(s2.village.gossip, rawBefore.village.gossip));
  // N5: statuses + disease mirror via the real path
  Game.applyStatus('scholar', 'gutrot', {});
  Game.applyStatus('scholar', 'wound_fever', {});
  Game.save();
  const raw2 = JSON.parse(globalThis.localStorage.getItem(key));
  Game._seSeq = undefined;
  Game.load(key);
  check('N5. scholar.statuses + disease mirror round-trip',
    deq(Game.state.scholar.statuses, raw2.scholar.statuses) && deq(Game.state.scholar.diseases, raw2.scholar.diseases));
  // N10: saveSeq monotonic across save -> load -> save
  const seq1 = Game.state.saveSeq;
  Game.save();
  const seq2 = Game.state.saveSeq;
  check('N10. saveSeq monotonic (load does not reset the counter)', seq2 === seq1 + 1, `seq ${seq1} -> ${seq2}`);
}

// ================= S: save-scum attacks =================
console.log('\n--- S: save-scum attacks ---');
{
  globalThis.localStorage._reset();
  reseed(SEED);
  const st = freshState('v1'); wireGame(st, 'v1');
  // S1+S4: fight-id gate + read_stance once-per-fight
  Game.tbfight = {
    id: 'f_scum1', fighters: [{ key: 'p', kind: 'player', hp: 90, mx: 4, my: 4, alive: true, statuses: [] }],
    order: ['p'], turnIdx: 0, round: 2, over: false, terraform: {},
  };
  Game.state.scholar.stanceReadFight = 'f_scum1';
  Game.save();
  const key = saveKeyOf();
  Game.tbfight = null; Game.state.scholar.stanceReadFight = null;
  Game.load(key);
  check('S1. fight id survives save/load (no fresh-id mint)',
    Game.tbfight && Game.tbfight.id === 'f_scum1', 'id=' + (Game.tbfight && Game.tbfight.id));
  check('S4. read_stance once-per-fight gate survives (no re-read after Continue)',
    Game.state.scholar.stanceReadFight === Game.tbfight.id);
  // S5: beam cooldown gate (pass-6 kill re-verified)
  Game.tbfight._beamCooldown = 2;
  Game.save();
  Game.tbfight = null;
  Game.load(key);
  check('S5. alien beam cooldown survives (no immediate re-beam after Continue)',
    Game.tbfight && Game.tbfight._beamCooldown === 2, 'cd=' + (Game.tbfight && Game.tbfight._beamCooldown));
  // S3: corpse loot fixed at death, not re-rolled on load
  Game.state.corpses = [{ kind: 'monster', name: 'hushwolf', dayDied: 5, node: { x: 4, y: 4 }, loot: [{ id: 'fang', qty: 2 }] }];
  Game.save();
  const lootBefore = JSON.stringify(Game.state.corpses[0].loot);
  Game.state.corpses = [];
  Game.load(key);
  check('S3. corpse loot fixed at death (no re-roll on load)',
    JSON.stringify(Game.state.corpses[0].loot) === lootBefore, lootBefore);
}
{
  // S2: contest determinism — _cxSeed draws only from save-persistent state
  globalThis.localStorage._reset();
  reseed(SEED);
  const st = freshState('v1'); wireGame(st, 'v1');
  st.village.rosterChars.v2 = { id: 'v2', name: 'Mara Voss' };
  const contest = { id: 'cx1' };
  const pids = ['v1', 'v2'];
  let seedBefore = null, seedAfter = null;
  try { seedBefore = Game._cxSeed(pids, contest); } catch (e) { seedBefore = 'unavailable:' + e.message; }
  Game.save();
  const key = saveKeyOf();
  // mutate live state hard, then load: the seed must replay identically
  st.scholar.day = 99;
  Game.load(key);
  try { seedAfter = Game._cxSeed(pids, contest); } catch (e) { seedAfter = 'unavailable:' + e.message; }
  check('S2. contest fate seed identical across save/load (no re-roll)',
    seedBefore === seedAfter && typeof seedBefore === 'number', `seed ${seedBefore} -> ${seedAfter}`);
  // and the resolution path is seeded, never Math.random
  const cxSrc = fs.readFileSync(path.join(ROOT, 'src/js/contestEngine.js'), 'utf8');
  check('S2b. contest resolutions run under _cxWithSeed (seeded stream)',
    /_cxWithSeed/.test(cxSrc) && /No Math\.random anywhere in the resolution path/.test(cxSrc));
}

// ================= D: duplication on load (new slices) =================
console.log('\n--- D: duplication on load (new slices) ---');
{
  globalThis.localStorage._reset();
  reseed(SEED);
  const st = freshState('v1'); wireGame(st, 'v1');
  st.scholar.caches = [{ id: 'c1', kind: 'food', key: 0, qty: 2, parasiteRisk: 0.3, spoilDay: 9, buriedDay: 4 }];
  st.village.stash = { materials: {}, tools: [], weapons: [], medicine: [], ledger: [{ day: 4, vid: 'v1', kind: 'deposit', what: 'spear', qty: 1 }] };
  st.fires = [{ tx: 4, ty: 4, cx: 2, cy: 2, till: 5200, burn0: 300 }];
  st.village.gossip = [{ day: 5, action: 'feast', heard: ['v1'] }];
  Game.applyStatus('scholar', 'gutrot', {});
  Game.save();
  const key = saveKeyOf();
  const snap = () => ({
    caches: Game.state.scholar.caches.length,
    ledger: Game.state.village.stash.ledger.length,
    fires: Game.state.fires.length,
    gossip: Game.state.village.gossip.length,
    statuses: Game.state.scholar.statuses.length,
    log: Game.log.length,
  });
  Game.load(key);
  const once = snap();
  Game.load(key);
  const twice = snap();
  check('D1. double load appends nothing (caches/stash/fires/gossip/statuses/log)',
    deq(once, twice), JSON.stringify(twice));
  // D3: apState fan-club migration idempotent (legacy favor -> lanes, once)
  Game.state.alienPlayers = { favor: 7, met: {}, lastHuntDay: {}, known: {} };
  const ap1 = Game.apState();
  const lanes1 = JSON.stringify(ap1.fanClubs);
  ap1.fanClubs.fight = 9; // player earns favor post-migration
  const ap2 = Game.apState();
  check('D3. apState fan-club migration does not re-fire (earned favor kept)',
    JSON.stringify(ap2.fanClubs) === JSON.stringify({ fight: 9, survival: 7, social: 7, showbiz: 7 }),
    JSON.stringify(ap2.fanClubs) + ' (was ' + lanes1 + ')');
  // D4: stashState idempotent
  const st1 = Game.stashState();
  st1.tools.push({ id: 't9', name: 'x' });
  const st2 = Game.stashState();
  check('D4. stashState does not reset sections on re-access',
    st2.tools.length === 1 && st2.weapons.length === 0 && Array.isArray(st2.ledger));
}
{
  // D2: quarantine double-restore refused
  globalThis.localStorage._reset();
  const st = { version: 1, villagerId: 'vq', startedAt: 1700000000001, scholar: { villagerId: 'vq', day: 3 }, run: { map: { px: 1, py: 1 } }, village: { rosterChars: { vq: { id: 'vq', name: 'Q' } } } };
  check('D2 setup: save ok', S.state.save(st) === true);
  const key = S.state.saveKey(st);
  // quarantine a PARSEABLE snapshot (restore refuses unparseable ones by design)
  S.state.quarantineKey(key);
  const qs = S.state.listQuarantines();
  check('D2 setup: snapshot listed', qs.length === 1, 'n=' + qs.length);
  S.state.wipe(key, 'test'); // original slot now empty
  const r1 = S.state.restoreQuarantine(qs[0].qkey);
  const r2 = S.state.restoreQuarantine(qs[0].qkey);
  check('D2. first restore succeeds', r1 === true, 'r1=' + JSON.stringify(r1));
  check('D2. second restore refused as occupied (no double-restore)',
    r2 === 'occupied', 'r2=' + JSON.stringify(r2));
}

// ================= F: softlock — load mid-flight in new transient states =================
console.log('\n--- F: softlock — load mid-flight in new transient states ---');
{
  globalThis.localStorage._reset();
  reseed(SEED);
  // F1: mid-activeContest (choice phase)
  let st = freshState('v1'); wireGame(st, 'v1');
  st.activeContest = {
    kind: 'show', showId: 's1', showName: 'Mouth Race', participant: 'v1',
    phase: 'choice', phaseIdx: 2, phases: [{ text: 'a' }, { text: 'b' }, { text: 'pick!' }], variant: null, wounds: 0,
  };
  Game.save();
  let key = saveKeyOf();
  st.activeContest = null;
  check('F1. mid-contest Continue restores the contest mid-phase (not stranded, not wiped)',
    Game.load(key) === true && Game.state.activeContest && Game.state.activeContest.phase === 'choice' &&
    Game.state.activeContest.phaseIdx === 2,
    'phase=' + (Game.state.activeContest && Game.state.activeContest.phase));
}
{
  globalThis.localStorage._reset();
  reseed(SEED);
  // F2: arena-suspended contest + live tbfight
  const st = freshState('v1'); wireGame(st, 'v1');
  st.arenaContest = { id: 'ac1', suspended: true, phase: 'duel' };
  st.activeContest = { kind: 'contest', id: 'cx9', phase: 'duel', phaseIdx: 0, phases: [], arenaSuspended: true };
  Game.tbfight = {
    id: 'f_arena1', fighters: [
      { key: 'p', kind: 'player', hp: 80, mx: 4, my: 4, alive: true, statuses: [] },
      { key: 'm1', kind: 'monster', monsterId: 'hushwolf', hp: 100, mx: 5, my: 5, alive: true, statuses: [] },
    ],
    order: ['p', 'm1'], turnIdx: 1, round: 3, over: false, terraform: {},
  };
  Game.save();
  const key = saveKeyOf();
  Game.tbfight = null;
  const ok = Game.load(key);
  check('F2. suspended arena contest + live fight both restore (no phantom, no strand)',
    ok === true && !!Game.tbfight && Game.tbfight.id === 'f_arena1' &&
    Game.state.arenaContest && Game.state.arenaContest.suspended === true &&
    Game.state.activeContest && Game.state.activeContest.arenaSuspended === true,
    'fight=' + (Game.tbfight && Game.tbfight.id));
}
{
  globalThis.localStorage._reset();
  reseed(SEED);
  // F3/F4: pending moot + exile
  const st = freshState('v1'); wireGame(st, 'v1');
  st.village.justice = { stage: 3, crimes: [{ kind: 'theft', day: 4 }], confrontedBy: 'v2', confrontRefused: false, exiled: false, exileDay: null, amendsCredit: 0, warned: true };
  Game.save();
  const key = saveKeyOf();
  st.village.justice = { stage: 0, crimes: [] };
  Game.load(key);
  check('F3. pending moot (justice stage 3) survives load',
    Game.state.village.justice && Game.state.village.justice.stage === 3);
  Game.state.village.justice.exiled = true;
  Game.state.village.justice.exileDay = 5;
  Game.state.village.justice.stage = 0;
  Game.save();
  Game.state.village.justice.exiled = false;
  Game.load(key);
  check('F4. exile flag + exileDay survive load',
    Game.state.village.justice.exiled === true && Game.state.village.justice.exileDay === 5);
}
{
  globalThis.localStorage._reset();
  reseed(SEED);
  // F5: mid-alien-duel
  const st = freshState('v1'); wireGame(st, 'v1');
  Game.tbfight = {
    id: 'f_alien1', alienFight: true,
    fighters: [
      { key: 'p', kind: 'player', hp: 90, mx: 4, my: 4, alive: true, statuses: [] },
      { key: 'a1', kind: 'monster', monsterId: 'hushwolf', hp: 120, mx: 5, my: 5, alive: true, alienPid: 'zx1', alienTech: 'beam', statuses: [] },
    ],
    order: ['p', 'a1'], turnIdx: 0, round: 1, over: false, terraform: {}, _beamCooldown: 1,
  };
  Game.save();
  const key = saveKeyOf();
  Game.tbfight = null;
  const ok = Game.load(key);
  const af = ok && Game.tbfight && Game.tbfight.fighters.find(f => f.key === 'a1');
  check('F5. mid-alien-duel Continue restores fighters + alien tags + beam cooldown',
    !!(af && af.alienPid === 'zx1' && af.alienTech === 'beam' && Game.tbfight._beamCooldown === 1),
    'alienPid=' + (af && af.alienPid) + ' cd=' + (Game.tbfight && Game.tbfight._beamCooldown));
}

// ================= H: honesty =================
console.log('\n--- H: honesty ---');
{
  globalThis.localStorage._reset();
  reseed(SEED);
  // H1: Continue list names the LIVE bearer after mantle transfer (re-verify post alien-r7)
  const st = freshState('v1'); wireGame(st, 'v1');
  st.village.rosterChars.v9 = { id: 'v9', name: 'Mara Voss' };
  Game.save();
  // mantle passes: playerDeath syncs s.villagerId + Game.villagerId
  Game.villagerId = 'v9';
  Game.save();
  const entry = S.state.listSaves({ includeStale: true })[0];
  check('H1. save-list entry names the live bearer after mantle transfer',
    entry && entry.villagerName === 'Mara Voss' && S.state.listSaves().length === 1,
    'name=' + (entry && entry.villagerName) + ' entries=' + S.state.listSaves().length);
  // H2: saveLocationLabel — Haven by name, departed = the wild
  Game.departed = false;
  Game.playerTile = () => ({ type: 'haven' });
  const atHaven = Game.saveLocationLabel();
  Game.departed = true;
  Game.playerTile = () => ({ type: 'grass' });
  const inWild = Game.saveLocationLabel();
  check('H2. location label honest (Haven by name / the wild)',
    atHaven === 'Haven' && inWild === 'the wild', `'${atHaven}' / '${inWild}'`);
}
// H3-H6: source-level (app.js is DOM-only, not eval-able headless)
{
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('H3. quarantine notice toast fires on the title screen (renderSaves takes the notice)',
    /function renderSaves/.test(app) && /takeQuarantineNotice\(\)/.test(app) &&
    /set aside \(not deleted\)/.test(app));
  check('H4. debug panel lists quarantines + one-tap restore wired',
    /Game\.listQuarantines\(\)/.test(app) && /Game\.restoreQuarantine\(b\.dataset\.q\)/.test(app) &&
    /a live save already occupies that slot/.test(app));
  check('H5. autosave surfaces all four save statuses (true/false/tombstoned/stale)',
    /r === 'tombstoned'/.test(app) && /r === 'stale'/.test(app) &&
    /Another tab saved this/.test(app) && /ended somewhere else/.test(app));
  const savesCard = app.match(/willMigrate[\s\S]{0,200}/);
  check('H6. migratable saves labeled "upgrades on load" (not silently stale)',
    /willMigrate/.test(app) && /upgrades on load/.test(app));
  void savesCard;
}

// ================= M: dead code + migration registry =================
console.log('\n--- M: dead code + migration registry ---');
{
  // M1: every S.state export has a caller (def + export + >=1 use)
  const fns = ['newState', 'newVillage', 'newScholar', 'newCodex', 'save', 'load', 'wipe',
    'wipeAll', 'listSaves', 'saveKey', 'quarantineKey', 'migrateSave', 'hasMigrationPath',
    'takeQuarantineNotice', 'listQuarantines', 'restoreQuarantine'];
  const engineSrc = srcOf('src/js/engine/state.js');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const dead = [];
  for (const fn of fns) {
    const uses = (engineSrc.split(fn).length - 1) + (gameSrc.split(fn).length - 1);
    // def + export + >=1 real call site: allow for the def/export occurrences
    const callSites = (engineSrc.match(new RegExp('\\b' + fn + '\\s*\\(', 'g')) || []).length +
      (gameSrc.match(new RegExp('\\b' + fn + '\\s*\\(', 'g')) || []).length;
    if (callSites < 3) dead.push(fn + '(calls~' + callSites + ')');
  }
  check('M1. every S.state persistence export has a live caller (no dead machinery)',
    dead.length === 0, dead.join(', ') || 'all wired');
  // M3: Game entry points reachable
  for (const m of ['save', 'load', 'wipe', 'deleteSave', 'wipeAllSaves', 'hasSave', 'listSaves',
    'takeQuarantineNotice', 'listQuarantines', 'restoreQuarantine']) {
    check('M3. Game.' + m + ' defined', typeof Game[m] === 'function');
  }
}
{
  // M2: synthetic migration end-to-end — the registry fires on the real path
  globalThis.localStorage._reset();
  const oldSave = {
    version: 1, villagerId: 'vm', startedAt: 1700000000002, runName: 'Old run',
    scholar: { villagerId: 'vm', day: 6 }, run: { map: { px: 1, py: 1 } },
    village: { name: 'Haven', rosterChars: { vm: { id: 'vm', name: 'M' } } },
    codex: {},
  };
  const key = S.state.saveKey(oldSave);
  globalThis.localStorage.setItem(key, JSON.stringify(oldSave));
  check('M2 setup: v1 blob on disk', S.state.load(key) && S.state.load(key).version === 1);
  // register a synthetic migration in the LIVE registry (as a real update would)
  S.state.MIGRATIONS[2] = (s) => { s.migratedByTest = true; return s; };
  check('M2a. synthetic migration registered in the live registry',
    typeof S.state.MIGRATIONS[2] === 'function',
    'SAVE_VERSION is 1 in production, so the version gate is proven via the bumped re-eval below');
  delete S.state.MIGRATIONS[2]; // leave production state clean
}
// (M2 continued — needs SAVE_VERSION bumped to exercise the version gate;
// done via a source-level re-eval like the r7 proof, to keep the registry live)
{
  const bumped = srcOf('src/js/engine/state.js').replace('const SAVE_VERSION = 1;', 'const SAVE_VERSION = 2;');
  check('M2 harness: SAVE_VERSION bump applied', bumped.indexOf('const SAVE_VERSION = 2;') >= 0);
  const vm = require('vm');
  const sandbox = { localStorage: globalThis.localStorage, Math, JSON, Object, Array, Date };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bumped, sandbox);
  const Sx = sandbox.Scattering;
  Sx.state.MIGRATIONS[2] = (s) => { s.migratedByTest = true; return s; };
  const oldSave = {
    version: 1, villagerId: 'vm', startedAt: 1700000000002, runName: 'Old run',
    scholar: { villagerId: 'vm', day: 6 }, run: { map: { px: 1, py: 1 } },
    village: { name: 'Haven', rosterChars: { vm: { id: 'vm', name: 'M' } } },
    codex: {},
  };
  const key = Sx.state.saveKey(oldSave);
  globalThis.localStorage.setItem(key, JSON.stringify(oldSave));
  const loaded = Sx.state.load(key);
  check('M2b. old-version save upgrades through the registry on load()',
    loaded && loaded.version === 2 && loaded.migratedByTest === true,
    'version=' + (loaded && loaded.version));
  check('M2c. hasMigrationPath(1) true, future version refuses',
    Sx.state.hasMigrationPath(1) === true && Sx.state.load(key) !== null);
  const fut = Object.assign({}, oldSave, { version: 99 });
  const fkey = 'scattering-save-v1-vm-1700000000099';
  globalThis.localStorage.setItem(fkey, JSON.stringify(fut));
  check('M2d. future version (99) refuses (null, never guess)', Sx.state.load(fkey) === null);
  const listed = Sx.state.listSaves({ includeStale: true }).find(e => e.key === key);
  check('M2e. migratable save listed as loadable (willMigrate), not stale-only',
    !!(listed && listed.willMigrate), 'willMigrate=' + (listed && listed.willMigrate));
  // save() upgrades an old-version in-memory state before writing
  const memOld = JSON.parse(JSON.stringify(oldSave));
  const sr = Sx.state.save(memOld);
  const stored = JSON.parse(globalThis.localStorage.getItem(key));
  check('M2f. save() upgrades old in-memory state (blobs always current)',
    sr === true && stored.version === 2 && stored.migratedByTest === true,
    'save=' + JSON.stringify(sr) + ' v=' + stored.version);
}

console.log(fails === 0 ? `\nALL CHECKS PASSED (${passes} checks, SEED=${SEED})` : `\n${fails} CHECK(S) FAILED (${passes} passed, SEED=${SEED})`);
process.exit(fails === 0 ? 0 : 1);
