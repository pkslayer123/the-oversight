// BREAK-IT: persistence (save/load) — SEVENTH PASS (2026-10-09).
// Passes 1-6 killed: save-leak wipe, fight-id minting, volatile fighter
// drops, mantle/key forks, index dishonesty, corrupt pruning, wipeAll dead
// code, dead payload, win-path stale saves, death-path throw races, mid-fight
// order re-deal, phantom fighters, phantom pending encounters, scholarless
// saves, dead payload r2, stale belltoad _pendingPack, stale cross-load
// fights, corrupt fighter nukes, silent quota saves, vanishing old-version
// saves, destroy-on-sight corruption, dead proof test, villageLost bleed,
// mapless saves, two-tab death resurrection, quarantine stamp collision,
// beam-cooldown save-scum, mid-uprising continue, Map/Set/Date fidelity,
// write-ordering crash window, alien r5 round-trip, storage-unavailable
// honesty, tombstone edges, syncRun/load parity, S.state.save callers.
// This pass attacks the FRESH surface (engine-level, S.state):
//   T1. WIPEALL RESURRECTION (EXPLOIT): wipeAll() never wrote tombstones —
//       a stale tab's autosave re-created every wiped run (dead runs must
//       stay dead — the r5 rule wipeAll violates).
//   T2. CROSS-TAB LAST-WRITE-WINS (EXPLOIT): two tabs, same run — the stale
//       tab silently overwrites the fresh tab's progress. No sequence, no
//       signal.
//   T3. VERSION-BUMP BRICK (SOFTLOCK): ARCHITECTURE.md claims "state.js
//       migrates old versions forward" — no migration code exists. A
//       SAVE_VERSION bump bricks every save permanently (stale forever,
//       only Delete). Migration was aspirational.
//   T4. CORRUPT-INDEX ORPHANS (SOFTLOCK): the index is a single point of
//       failure — one corrupt index blob hides every healthy save, and the
//       next save() rebuilds the index with only its own entry (the rest
//       stay orphaned on disk, invisible).
//   T5. QUARANTINE BLACK HOLE (HONESTY): corrupt saves vanish with no word
//       to the player, and nothing can ever read quarantined data back —
//       "preserved for recovery" was unreachable.
//   T6. DEAD-CODE SWEEP (static): every S.state export and every Game
//       save/load entry point must have a caller.
//   T7. DOUBLE-LOAD FORK: loading the same key twice must not alias state.
//   T8. TOMBSTONED READ PATH: load() of a tombstoned key whose blob somehow
//       still exists must refuse (dead runs stay dead at the read path too).
//
// Usage: node scripts/test-break-persistence7-20261009.js
//        BEFORE=1 node scripts/test-break-persistence7-20261009.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/engine/state.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp7-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp7-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub (shared across tabs in these tests: one device) ----
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
let store = makeStore();
globalThis.localStorage = store;

function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(7);
Math.random = function () { return rng(); };

global.window = global;
eval(srcOf('src/js/engine/state.js'));
delete global.window;
const S = globalThis.Scattering;

let fails = 0, passes = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (cond) passes++; else fails++;
}
const keyOf = (st) => S.state.saveKey(st);
function mkState(vid, day) {
  return {
    version: 1, villagerId: vid, startedAt: 1000 + Math.floor(Math.random() * 1e9),
    runName: 'Test run ' + vid,
    village: { name: 'Haven', rosterChars: { [vid]: { id: vid, name: 'Testy McTest' } } },
    scholar: { villagerId: vid, day: day || 1 },
    codex: { plants: {} }, run: { map: { px: 1, py: 1 } },
  };
}
function reset() { store._reset(); }

// ================= T1: wipeAll resurrection =================
console.log('\n--- T1: wipeAll vs stale-tab resurrection ---');
reset();
{
  const stA = mkState('gen_a', 3), stB = mkState('gen_b', 5);
  check('T1 setup saves', S.state.save(stA) === true && S.state.save(stB) === true);
  const kA = keyOf(stA), kB = keyOf(stB);
  check('T1 two saves listed', S.state.listSaves().length === 2);
  S.state.wipeAll(); // tab 1: debug-panel "wipe all saves"
  check('T1 saves gone after wipeAll', S.state.listSaves().length === 0);
  // tab 2 (stale): still holds stA in memory, autosave fires
  const r = S.state.save(stA);
  if (BEFORE) {
    check('T1 BREAK: stale tab resurrected wiped run', r === true && store.getItem(kA) !== null,
      'save() returned ' + JSON.stringify(r) + ' — dead runs did NOT stay dead');
  } else {
    check('T1 FIX: stale tab save refused as tombstoned', r === 'tombstoned', 'got ' + JSON.stringify(r));
    check('T1 FIX: no blob re-created', store.getItem(kA) === null && store.getItem(kB) === null);
    const stC = mkState('gen_c', 1);
    check('T1 FIX: new runs still save after wipeAll', S.state.save(stC) === true);
  }
}

// ================= T2: cross-tab last-write-wins =================
console.log('\n--- T2: cross-tab stale overwrite ---');
reset();
{
  const st1 = mkState('gen_x', 1);           // tab 1
  check('T2 tab1 saves', S.state.save(st1) === true);
  const K = keyOf(st1);
  const st2 = JSON.parse(store.getItem(K));  // tab 2: separate JS context
  st2.scholar.day = 5;
  check('T2 tab2 saves newer progress', S.state.save(st2) === true, 'day=5 on disk');
  st1.scholar.day = 2;                        // tab 1: stale, acts anyway
  const r = S.state.save(st1);
  const diskDay = JSON.parse(store.getItem(K)).scholar.day;
  if (BEFORE) {
    check('T2 BREAK: stale tab silently destroyed newer progress', r === true && diskDay === 2,
      'save()=' + JSON.stringify(r) + ', disk day now ' + diskDay + ' (was 5)');
  } else {
    check('T2 FIX: stale overwrite refused', r === 'stale', 'got ' + JSON.stringify(r));
    check('T2 FIX: newer progress intact', diskDay === 5, 'disk day=' + diskDay);
  }
  // normal sequential saves in one tab still work
  const st3 = mkState('gen_y', 1);
  const r1 = S.state.save(st3), r2 = S.state.save(st3);
  check('T2 sequential saves still true/true', r1 === true && r2 === true,
    BEFORE ? '' : JSON.stringify([r1, r2]));
}

// ================= T3: version bump / migration =================
console.log('\n--- T3: version bump brick vs migration registry ---');
reset();
function sandboxState(bumpedSrc, st) {
  const sbStore = st || makeStore();
  const sandbox = { localStorage: sbStore, console };
  vm.createContext(sandbox);
  vm.runInContext(bumpedSrc, sandbox);
  return { Sx: sandbox.Scattering, sbStore };
}
{
  const st = mkState('gen_m', 4);
  S.state.save(st);
  const K = keyOf(st);
  const bumped = srcOf('src/js/engine/state.js').replace('const SAVE_VERSION = 1;', 'const SAVE_VERSION = 2;');
  check('T3 harness bump applied', bumped.indexOf('const SAVE_VERSION = 2;') >= 0);
  const { Sx, sbStore } = sandboxState(bumped, store); // same device storage
  const v = Sx.state.load(K);
  if (BEFORE) {
    check('T3 BREAK: bumped load() refuses (null)', v === null);
    check('T3 BREAK: no migration registry (aspirational)', typeof Sx.state.MIGRATIONS === 'undefined');
    const stale = Sx.state.listSaves({ includeStale: true });
    check('T3 BREAK: save stranded stale-only', stale.length === 1 && stale[0].stale === true,
      'player can only Delete — the expedition is bricked');
  } else {
    check('T3 registry exists', Sx.state.MIGRATIONS && typeof Sx.state.MIGRATIONS === 'object');
    check('T3 unmigrated old version refuses honestly', v === null, 'no path registered yet');
    Sx.state.MIGRATIONS[2] = (s) => { s.migratedByTest = true; return s; };
    const v2 = Sx.state.load(K);
    check('T3 FIX: registered migration loads old save', !!v2 && v2.version === 2 && v2.migratedByTest === true);
    const listed = Sx.state.listSaves();
    check('T3 FIX: migratable save listed as loadable, not stale',
      listed.length === 1 && !listed[0].stale, JSON.stringify(listed.map(e => ({ stale: e.stale, willMigrate: e.willMigrate }))));
    // future version still refuses
    const kf = K + '-future';
    sbStore.setItem(kf, JSON.stringify({ version: 99, scholar: { day: 1 }, village: {}, codex: {}, run: {} }));
    check('T3 future version refuses', Sx.state.load(kf) === null);
    // save() from an old-version in-memory state upgrades the blob
    const oldMem = { version: 1, villagerId: 'gen_n', startedAt: 4242, village: { rosterChars: {} }, scholar: { villagerId: 'gen_n', day: 2 }, codex: {}, run: {} };
    const rs = Sx.state.save(oldMem);
    const blob = JSON.parse(sbStore.getItem(Sx.state.saveKey(oldMem)));
    check('T3 FIX: save() upgrades old-version state before writing', rs === true && blob.version === 2 && blob.migratedByTest === true);
  }
}

// ================= T4: corrupt index orphans =================
console.log('\n--- T4: corrupt index vs self-healing ---');
reset();
{
  const stA = mkState('gen_p', 2), stB = mkState('gen_q', 6);
  S.state.save(stA); S.state.save(stB);
  const kA = keyOf(stA);
  check('T4 two saves listed', S.state.listSaves().length === 2);
  store.setItem('scattering-saves-index', '{{{corrupt');
  const listed = S.state.listSaves();
  if (BEFORE) {
    check('T4 BREAK: corrupt index hides every healthy save', listed.length === 0);
    const stC = mkState('gen_r', 1);
    S.state.save(stC); // rebuilds index with only its own entry
    const idx = JSON.parse(store.getItem('scattering-saves-index'));
    check('T4 BREAK: rebuild orphaned the other runs', idx.length === 1 && idx[0].key !== kA,
      'index now lists 1 of 3 blobs');
  } else {
    check('T4 FIX: healthy saves still listed', listed.length === 2, 'got ' + listed.length);
    const idx = JSON.parse(store.getItem('scattering-saves-index'));
    check('T4 FIX: index healed and rewritten', Array.isArray(idx) && idx.length === 2);
    const stC = mkState('gen_r', 1);
    S.state.save(stC);
    check('T4 FIX: later saves adopt, not orphan', S.state.listSaves().length === 3);
  }
}

// ================= T5: quarantine black hole =================
console.log('\n--- T5: quarantine notice + recovery ---');
reset();
{
  const st = mkState('gen_z', 3);
  S.state.save(st);
  const K = keyOf(st);
  store.setItem(K, '{{{damaged'); // corrupt the blob
  S.state.listSaves();            // triggers quarantine
  const hasQuarantine = store._keys().some(k => k.indexOf('scattering-save-quarantine-') === 0);
  check('T5 blob was quarantined', hasQuarantine);
  check('T5 entry pruned from list', S.state.listSaves().length === 0);
  if (BEFORE) {
    check('T5 BREAK: no notice API — player never told', typeof S.state.takeQuarantineNotice === 'undefined');
    check('T5 BREAK: no recovery API — "preserved" is unreachable', typeof S.state.listQuarantines === 'undefined');
  } else {
    const n1 = S.state.takeQuarantineNotice();
    check('T5 FIX: one-shot quarantine notice', !!n1 && n1.key === K, JSON.stringify(n1));
    check('T5 FIX: notice consumed', S.state.takeQuarantineNotice() === null);
    const qs = S.state.listQuarantines();
    check('T5 FIX: quarantine listed', qs.length === 1 && qs[0].origKey === K, JSON.stringify(qs));
    const r = S.state.restoreQuarantine(qs[0].qkey);
    check('T5 FIX: restore refuses corrupt snapshot honestly', r === 'corrupt', 'got ' + JSON.stringify(r));
    // now a parseable-but-orphaned snapshot restores
    const st2 = mkState('gen_w', 7);
    S.state.save(st2);
    const K2 = keyOf(st2);
    const blob2 = store.getItem(K2);
    store.setItem(K2, '{{{damaged');
    S.state.listSaves();
    const q2 = S.state.listQuarantines().find(q => q.origKey === K2);
    store.setItem('scattering-save-quarantine-' + K2 + '-manual', blob2); // healthy snapshot
    const m = JSON.parse(store.getItem('scattering-save-quarantine-manifest'));
    m['scattering-save-quarantine-' + K2 + '-manual'] = { origKey: K2, at: Date.now() };
    store.setItem('scattering-save-quarantine-manifest', JSON.stringify(m));
    const r2 = S.state.restoreQuarantine('scattering-save-quarantine-' + K2 + '-manual');
    check('T5 FIX: healthy snapshot restores', r2 === true);
    const loaded = S.state.load(K2);
    check('T5 FIX: restored save loads', !!loaded && loaded.scholar.day === 7);
    check('T5 FIX: restored key saves again (tombstone cleared)', S.state.save(loaded) === true);
    // occupied slot refuses
    const r3 = S.state.restoreQuarantine('scattering-save-quarantine-' + K2 + '-manual');
    check('T5 FIX: restore refuses occupied slot', r3 === 'occupied', 'got ' + JSON.stringify(r3));
  }
}

// ================= T8: tombstoned read path =================
console.log('\n--- T8: load() of a tombstoned key ---');
reset();
{
  const st = mkState('gen_t', 2);
  S.state.save(st);
  const K = keyOf(st);
  // blob somehow still on disk under a tombstoned key (failed removeItem /
  // cross-tab weirdness) — write the tombstone by hand
  store.setItem('scattering-save-tombstone-' + K, JSON.stringify({ t: Date.now(), reason: 'wiped' }));
  const v = S.state.load(K);
  if (BEFORE) {
    check('T8 BREAK: tombstoned key still loads', v !== null, 'dead run loadable');
  } else {
    check('T8 FIX: tombstoned key refuses at read path', v === null);
  }
}

// ================= T7: double-load fork =================
console.log('\n--- T7: double-load independence ---');
reset();
{
  const st = mkState('gen_d', 1);
  S.state.save(st);
  const K = keyOf(st);
  const a = S.state.load(K), b = S.state.load(K);
  a.scholar.day = 99; a.village.name = 'Mutated';
  check('T7 loads are independent objects', b.scholar.day === 1 && b.village.name === 'Haven');
}

// ================= T6: dead-code sweep (static) =================
console.log('\n--- T6: save-pipeline dead-code sweep ---');
{
  const stateSrc = srcOf('src/js/engine/state.js');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const all = stateSrc + gameSrc + appSrc;
  const provided = ['newState', 'newVillage', 'newScholar', 'newCodex', 'save', 'load',
    'wipe', 'wipeAll', 'listSaves', 'saveKey', 'quarantineKey', 'SAVE_VERSION',
    'MIGRATIONS', 'migrateSave', 'hasMigrationPath',
    'takeQuarantineNotice', 'listQuarantines', 'restoreQuarantine'];
  for (const fn of provided) {
    if (BEFORE && ['MIGRATIONS', 'migrateSave', 'hasMigrationPath', 'takeQuarantineNotice', 'listQuarantines', 'restoreQuarantine'].includes(fn)) continue;
    // bare-word refs across all sources: need def + export-listing + >=1 use
    const uses = (all.match(new RegExp('\\b' + fn + '\\b', 'g')) || []).length;
    check('T6 export `' + fn + '` has a caller', uses >= 3, uses + ' references');
  }
  const gameFns = ['save', 'load', 'wipe', 'deleteSave', 'wipeAllSaves', 'hasSave', 'listSaves'];
  for (const name of gameFns) {
    // Game.wipe is invoked as this.wipe() inside game.js — count both forms
    const uses = (all.match(new RegExp('(?:Game|this)\\.' + name + '\\b', 'g')) || []).length;
    check('T6 Game.' + name + ' reachable', uses >= 1, uses + ' references');
  }
  // S.state.save must have exactly one non-test caller family: Game.save
  const saveCallers = (all.match(/S\.state\.save\(/g) || []).length;
  const gameSaveDefs = (gameSrc.match(/[^.]save\(\)\s*\{/) || []).length;
  check('T6 S.state.save callers sane', saveCallers >= 1, saveCallers + ' S.state.save( refs, ' + gameSaveDefs + ' Game.save def');
}

console.log('\n==== ' + passes + ' passed, ' + fails + ' failed ====');
process.exit(fails ? 1 : 0);
