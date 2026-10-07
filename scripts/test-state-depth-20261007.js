#!/usr/bin/env node
// STATE DEPTH PROOF TEST (Steve 2026-10-05)
// Save robustness (migration, corrupt-save quarantine, backup rotation) +
// run chronicle (village memory across the exile hard-reset fork).
// Plain node, seeded PRNG (mulberry32, fixed default, SEED env override).
//
// PLAYED PASS ARC (read top to bottom — this is the run, not just asserts):
//   1. New game: a haven is founded, the chronicle opens with a founding beat.
//   2. Days pass: era beats accrue (arrival, moot, contest). Cap prunes.
//   3. Save. Save again. Backups rotate — one bad write can't nuke the run.
//   4. The slot gets corrupted (iOS evicted half a write, classic).
//      load() stays null-safe; loadDetailed() quarantines the bytes and
//      recovers from the rotated backup. Nothing is silently lost.
//   5. A synthetic old-version save (no version stamp, thin shape) migrates
//      cleanly to v1 instead of being dropped on the title screen.
//   6. A save from a FUTURE version fails gracefully — no throw, named reason.
//   7. Exile: hard reset fork. The new haven gets ONE beat — the exile.
//      The old haven's moots and triumphs do not follow. Honest.
//
'use strict';

// Seeded PRNG: deterministic proof, reproducible across runs.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
const rng = mulberry32(SEED);

// In-memory localStorage shim (node has none; the module only needs get/set/remove).
function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}
globalThis.localStorage = makeStorage();
require('/home/hatch/workspace/the-scattering/src/js/engine/state.js');
const S = globalThis.Scattering.state;

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

section('1. New game — factories');
{
  const st = S.newState();
  ok(st.version === S.SAVE_VERSION, 'newState stamps SAVE_VERSION');
  ok(st.scholar === null && st.run === null, 'scholar/run start null (title screen shape)');
  ok(Array.isArray(st.village.chronicle), 'village.chronicle exists');
  ok(st.village.chronicle.length === 1 && st.village.chronicle[0].kind === 'founding',
     'founding beat recorded on newVillage');
  ok(typeof S.migrations === 'object' && typeof S.migrations[0] === 'function',
     'migrations table present');
}

section('2. Days pass — chronicle accrues, cap prunes');
{
  const v = S.newVillage();
  v.name = 'Haven'; v.day = 12;
  S.chronicleAdd(v, 'arrival', 'Mara and her two kids walked in from the east road.', { day: 4 });
  S.chronicleAdd(v, 'moot', 'The moot voted to ration the winter stores.', { day: 9 });
  S.chronicleAdd(v, 'contest', 'Haven took the Harvest Games — the show loved us.', { day: 12 });
  ok(v.chronicle.length === 4, 'beats accrue (founding + 3)');
  ok(v.chronicle[3].day === 12, 'day stamps land');
  // flood it: cap must hold
  for (let i = 0; i < 60; i++) S.chronicleAdd(v, 'omen', 'beat ' + i, { day: 13 + i });
  ok(v.chronicle.length === S.CHRONICLE_CAP, 'chronicle capped at ' + S.CHRONICLE_CAP);
  ok(v.chronicle[0].text === 'beat 20', 'oldest pruned first (founding eventually ages out)');
  const sum = S.chronicleSummary(v);
  ok(sum.split('\n').length === S.CHRONICLE_CAP && /Day 72/.test(sum),
     'chronicleSummary renders one line per beat');
  // FEEL: 40 era beats is a whole campaign's worth of memory. A village that
  // remembers its moots and contests feels lived-in; pruning from the front
  // means the RECENT past — the stuff that matters — is always there.
}

section('3. Save twice — backups rotate');
{
  globalThis.localStorage = makeStorage();
  const st = S.newState();
  st.villagerId = 'gen_mara';
  st.startedAt = 1000;
  st.village.name = 'Haven';
  S.save(st);
  const key = S.saveKey(st);
  st.village.day = 5; // day passes
  S.save(st);
  const bks = S.backupKeys(key);
  ok(bks.length === S.BACKUP_COUNT, 'backupKeys returns BACKUP_COUNT names');
  const bak1 = JSON.parse(globalThis.localStorage.getItem(bks[0]));
  ok(bak1.village.day === 1, 'bak1 holds the pre-write state (day 1, not day 5)');
  const cur = JSON.parse(globalThis.localStorage.getItem(key));
  ok(cur.village.day === 5, 'main slot holds the fresh write');
  // FEEL: this is the load-bearing bit. The OS kills a write mid-flush and
  // the player loses ONE day, not the run.
}

section('4. Corruption — the iOS-evicted-half-a-write arc');
{
  globalThis.localStorage = makeStorage();
  const st = S.newState();
  st.villagerId = 'gen_mara';
  st.startedAt = 2000;
  st.village.name = 'Haven';
  st.village.day = 9;
  S.save(st);                       // day 9
  st.village.day = 10;
  S.save(st);                       // day 10; bak1 = day 9
  const key = S.saveKey(st);

  // The bad write: garbage lands in the slot.
  globalThis.localStorage.setItem(key, '{"village": TRUNCATED BY THE OS');

  // Detailed recovery FIRST (it promotes the backup to the main slot, so a
  // second detailed call would see a clean main — that's the point).
  const det = S.loadDetailed(key);
  ok(det.ok === true, 'loadDetailed recovers from the rotated backup');
  ok(det.recoveredFrom && det.recoveredFrom.endsWith('.bak1'), 'recovery names its source (bak1)');
  ok(det.state.village.day === 9, 'recovered state is the last good write (day 9)');
  ok(typeof det.quarantined === 'string' && det.quarantined.indexOf('scattering-save-quarantine-') === 0,
     'the corrupt bytes were quarantined, not discarded');
  ok(globalThis.localStorage.getItem(det.quarantined) === '{"village": TRUNCATED BY THE OS',
     'quarantine preserves the exact corrupt bytes');

  // Legacy contract on a FRESH corruption: load() never throws, still recovers.
  globalThis.localStorage.setItem(key, '{"village": TRUNCATED AGAIN');
  let threw = false, legacy = 'unset';
  try { legacy = S.load(key); } catch (e) { threw = true; }
  ok(!threw && legacy && legacy.village && legacy.village.day === 9,
     'load() never throws on corruption and still recovers the run');

  // And the truly unrecoverable case: garbage everywhere, no valid backup.
  globalThis.localStorage = makeStorage();
  globalThis.localStorage.setItem('dead-slot', '###not json###');
  const d2 = S.loadDetailed('dead-slot');
  ok(d2.ok === false && d2.reason === 'corrupt-json', 'unrecoverable slot reports corrupt-json');
  ok(typeof d2.backupKey === 'string', 'unrecoverable slot still names its quarantine key');
  ok(S.load('dead-slot') === null, 'legacy load() returns null, never throws');
  // FEEL: the player is never stuck on a dead title screen. Either we hand
  // back the run (from backup) or we hand back the quarantined bytes and a
  // named reason so app.js can offer "start fresh — old save preserved".
  // No silent data loss, no mystery.
}

section('5. Migration — a synthetic old-version save');
{
  globalThis.localStorage = makeStorage();
  // Pre-stamp shape: no version, thin village, no chronicle at all.
  const old = { village: { name: 'OldHaven', day: 30, villagers: ['gen_a'], fallen: [] }, codex: { plants: {} }, scholar: null };
  globalThis.localStorage.setItem('old-slot', JSON.stringify(old));
  const d = S.loadDetailed('old-slot');
  ok(d.ok === true && d.migrated === true, 'old-version save migrates instead of vanishing');
  ok(d.state.version === S.SAVE_VERSION, 'migrated state stamped current version');
  ok(Array.isArray(d.state.village.chronicle), 'migration ensures chronicle exists');
  ok(d.state.village.chronicle.length === 0, 'migration invents no fake history (honest)');
  ok(d.state.village.name === 'OldHaven', 'migration keeps what was there');
}

section('6. Future version — fail gracefully, never throw');
{
  globalThis.localStorage = makeStorage();
  const fut = { version: 99, village: { villagers: [], fallen: [], chronicle: [] }, codex: {} };
  globalThis.localStorage.setItem('fut-slot', JSON.stringify(fut));
  const d = S.loadDetailed('fut-slot');
  ok(d.ok === false && d.reason === 'newer-version', 'future version fails with a named reason');
  ok(d.backupKey === null, 'future-version save is NOT quarantined (it may be fine elsewhere)');
  ok(S.load('fut-slot') === null, 'legacy load() still null-safe');
}

section('7. Bad shape — wrong types, not just bad JSON');
{
  globalThis.localStorage = makeStorage();
  const bad = { version: 1, village: { villagers: 'not-an-array', fallen: [] }, codex: {} };
  globalThis.localStorage.setItem('bad-slot', JSON.stringify(bad));
  const d = S.loadDetailed('bad-slot');
  ok(d.ok === false && d.reason === 'bad-shape', 'bad shape reports bad-shape');
  ok(typeof d.backupKey === 'string' &&
     JSON.parse(globalThis.localStorage.getItem(d.backupKey)).village.villagers === 'not-an-array',
     'bad-shape slot quarantined byte-identical');
}

section('8. Exile — the hard-reset fork');
{
  const old = S.newVillage();
  old.name = 'Haven';
  old.day = 64;
  S.chronicleAdd(old, 'moot', 'The moot turned against the scholar.', { day: 60 });
  S.chronicleAdd(old, 'triumph', 'The granary held through the blight.', { day: 62 });
  const forked = S.chronicleFork(old);
  ok(Array.isArray(forked) && forked.length === 1, 'fork carries exactly one beat');
  ok(forked[0].kind === 'exile' && /Haven/.test(forked[0].text), 'the one beat is the exile, naming the old haven');
  ok(forked.every(e => e.kind !== 'moot' && e.kind !== 'triumph'),
     "the old haven's moots and triumphs do not follow");
  // FEEL: this is the fiction working. You remember being cast out — of
  // course you do. But the new haven at the end of the road never heard your
  // old moots. Memory is personal; the village's memory stays with the village.
}

section('9. Housekeeping — wipe, no-save, index');
{
  globalThis.localStorage = makeStorage();
  ok(S.loadDetailed('missing-slot').reason === 'no-save', 'missing slot reports no-save');
  const st = S.newState();
  st.villagerId = 'gen_x'; st.startedAt = 3000;
  S.save(st);
  const key = S.saveKey(st);
  S.save(st); // second save -> bak1 exists
  ok(S.listSaves().length === 1, 'listSaves sees the run');
  S.wipe(key);
  ok(globalThis.localStorage.getItem(key) === null &&
     globalThis.localStorage.getItem(key + '.bak1') === null,
     'wipe removes the slot AND its rotated backups');
  ok(S.listSaves().length === 0, 'index pruned on wipe');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed (seed ' + SEED + ')');
process.exit(failed ? 1 : 0);
