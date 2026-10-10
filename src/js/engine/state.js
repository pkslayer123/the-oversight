// @ontology
// system: game-state
// description: State factories, versioned save/load. Village / scholars / Codex / run are independent so one can reset cleanly.
// provides:
//   - SAVE_VERSION (code: state.js)
//   - newVillage()
//   - newScholar(villagerId)
//   - newCodex()
//   - newState()
//   - saveKey(state)
//   - save(state) -> true | 'tombstoned' | 'stale' | false: honest save status; false on quota/blocked/unserializable, 'tombstoned' when the run's key was wiped (break-it 2026-10-09 r5), 'stale' when another tab saved this run newer (cross-tab overwrite refused, break-it 2026-10-09 r7)
//   - listSaves(opts): opts.includeStale surfaces version-mismatched saves with no migration path flagged {stale:true} (break-it 2026-10-09); self-heals a corrupt/missing index by adopting orphaned blobs from disk (break-it 2026-10-09 r7)
//   - load(key): refuses tombstoned keys; runs registered migrations for old versions (break-it 2026-10-09 r7)
//   - wipe(key, reason?): leaves a per-key tombstone so a wiped run stays dead (break-it 2026-10-09 r5)
//   - wipeAll(): tombstones every removed key — a stale tab's autosave can't resurrect wiped runs (break-it 2026-10-09 r7)
//   - quarantineKey(key): move corrupt save data to a capped dated quarantine key; writes a one-shot player notice + a restore manifest (break-it 2026-10-09 r7)
//   - takeQuarantineNotice(): one-shot {key, at} for the title screen toast (break-it 2026-10-09 r7)
//   - listQuarantines(): restorable snapshots [{qkey, origKey, at}] (break-it 2026-10-09 r7)
//   - restoreQuarantine(qkey) -> true | 'occupied' | 'corrupt' | 'unusable' | false (break-it 2026-10-09 r7; 'unusable' added break-it persistence r1 2026-10-10: parseable but never-loadable snapshots refuse instead of lying "restored")
//   - MIGRATIONS: {targetVersion: (state)=>state} forward-migration registry; the runner owns version stamping, fns must not set version (break-it 2026-10-09 r7)
//   - migrateSave(state): run registered migrations forward; null when no path or version > SAVE_VERSION (break-it 2026-10-09 r7)
//   - hasMigrationPath(fromVersion): dry-run path check, no mutation (break-it 2026-10-09 r7)
// rules:
//   - save_honest_status: save() returns false on any failure; callers (autosave) surface it, never mistake silence for success (code: save, break-it 2026-10-09)
//   - corrupt_quarantined: unparseable save data moves to a capped dated quarantine key before pruning — never destroyed on sight (code: quarantineKey, break-it 2026-10-09)
//   - stale_version_visible: version-mismatched saves with no migration path are kept and surfaced flagged, never silently hidden (code: listSaves, break-it 2026-10-09)
//   - dead_runs_stay_dead: wipe() leaves a per-key tombstone; save() refuses tombstoned keys with a distinct 'tombstoned' signal (never the quota-false), so a stale tab's autosave can't resurrect a wiped run; load() refuses them too (code: save/wipe/load, break-it 2026-10-09 r5, read-path break-it 2026-10-09 r7); wipeAll() tombstones every key it removes (code: wipeAll, break-it 2026-10-09 r7)
//   - stale_tab_refused: a monotonic saveSeq detects cross-tab races — a tab whose in-memory copy is older than the disk blob gets 'stale' and no write, never a silent last-write-wins (code: save, break-it 2026-10-09 r7)
//   - index_self_healing: the index is a cache, not truth — listSaves() adopts orphaned save blobs from disk when the index is corrupt or incomplete (code: listSaves, break-it 2026-10-09 r7)
//   - quarantine_recoverable: quarantines write a one-shot player notice (title screen toast) and a restore manifest (debug panel) — "preserved for recovery" is reachable, not a black hole (code: quarantineKey/takeQuarantineNotice/listQuarantines/restoreQuarantine, break-it 2026-10-09 r7)
//   - migrate_forward: old versions upgrade through the registered MIGRATIONS map on load and on save; versions with no path stay stale-surfaced (never destroyed, never silently loaded); future versions refuse (code: migrateSave/hasMigrationPath/load, break-it 2026-10-09 r7)
// consumes:
//   - (none documented)
/* Game state: factory, save/load (versioned), sub-objects separable.
   Village / scholars / Codex / run are independent so one can reset cleanly. */
(function (global) {
  'use strict';
  const SAVE_KEY = 'scattering-save-v1';
  const SAVE_VERSION = 1;

  function newVillage() {
    return {
      name: 'Haven', day: 1, season: 'spring',
      // Starting pantry: RNG, scaled for 12 people. 1.5-3 days of food (36k-72k kcal).
      // Set properly in newGame (this is just the template).
      pantryKcal: 36000, waterL: 12, morale: 'steady',
      villagers: [], // villager ids (living)
      fallen: [],    // {villagerId, day, cause} — remembered
      favor: 0,
    };
  }

  function newScholar(villagerId) {
    return {
      villagerId, day: 1, ap: 4, integration: 5, lastIntegration: 0,
      health: 100, kcal: 2200, hydration: 100, energy: 100,
      abilities: [], // ability ids (max 6)
      relics: [],    // {itemId, bond}
      injuries: [],
      position: { region: null, x: 0, y: 0 },
      inventory: [], // {plantId|itemId, qty, spoilageDay}
      prepStash: [], // the kitchen counter: unprocessed hauls awaiting prep, with spoilage clocks
      // BETTER HUMAN (Steve 2026-10-05): five human stats, separate from alien
      // abilities. You get better at being human by DOING human things —
      // practice, not XP allocation. Background sets the starting point.
      stats: { str: 5, end: 5, per: 5, agi: 5, pre: 5 },
      practice: {}, // {stat: count} — meaningful reps toward the next point
      passives: {}, // {passiveId: tier} — earned skills, 3 tiers each
    };
  }

  function newCodex() {
    return { plants: {}, monsters: {}, recipes: {}, terrain: {}, skills: {}, trees: {} };
    // RECIPE KNOWLEDGE (fix 2026-10-09): recipes was briefly initialized as
    // an array — named props don't survive JSON.stringify, so recipe
    // knowledge silently wiped on every save/load. It's a string-keyed object.
    // plants: {plantId: {identifiedDay, survivedEating: bool, notes}}
    // trees: {species: {level, learnedDay}} — tree species knowledge (Steve 2026-10-05)
    // skills: {skillId: {level, learnedDay, via}} — knowledge about ANYTHING, not just plants
  }

  function newState() {
    return { version: SAVE_VERSION, village: newVillage(), scholar: null, codex: newCodex(), run: null };
  }

  // Multiple saves: one per run. Key = villager + started timestamp.
  // Dead runs are wiped. Living runs persist until you start a new one (or delete).
  // runKey: the key is STABLE for the whole run. The mantle can pass to a new
  // villager mid-run (playerDeath) — without a stable key the save would fork
  // into a second keyed save and orphan the first (break-it persistence 2026-10-08).
  function saveKey(state) {
    if (state.runKey) return state.runKey;
    const vid = state.villagerId || state.scholar && state.scholar.villagerId || 'unknown';
    const started = state.startedAt || Date.now();
    return `scattering-save-v1-${vid}-${started}`;
  }
  // MIGRATIONS (break-it persistence r7 2026-10-09): forward-migration
  // registry. ARCHITECTURE.md claimed "state.js migrates old versions
  // forward" — no migration code existed, so a SAVE_VERSION bump bricked
  // every save permanently (stale forever, Delete the only option). Now the
  // path is real: register MIGRATIONS[targetVersion] = (state) => state.
  // CONTRACT: the function transforms the state IN PLACE (or returns a
  // replacement object) but MUST NOT set version itself — the runner stamps
  // version after each step. A throwing migration is a failed migration
  // (refuse, never half-upgrade).
  const MIGRATIONS = {};
  function hasMigrationPath(fromV) {
    // dry-run: does a registered chain exist from fromV to SAVE_VERSION?
    // No mutation — safe for listSaves() to call per entry.
    if (fromV === SAVE_VERSION) return true;
    if (typeof fromV !== 'number' || fromV > SAVE_VERSION) return false;
    let v = fromV, guard = 0;
    while (v < SAVE_VERSION && guard++ < 20) {
      if (typeof MIGRATIONS[v + 1] !== 'function') return false;
      v++;
    }
    return v === SAVE_VERSION;
  }
  function migrateSave(s) {
    if (!s || typeof s !== 'object') return null;
    if (s.version === SAVE_VERSION) return s;
    // unknown/future version: refuse (never corrupt, never guess)
    if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return null;
    let guard = 0;
    while (s.version < SAVE_VERSION && guard++ < 20) {
      const fn = MIGRATIONS[s.version + 1];
      if (typeof fn !== 'function') return null; // no path: refuse
      try {
        const out = fn(s);
        if (out && typeof out === 'object') s = out;
      } catch (e) { return null; } // throwing migration = failed migration
      if (typeof s.version !== 'number') return null;
      s.version = s.version + 1; // the runner owns version stamping
    }
    return s.version === SAVE_VERSION ? s : null;
  }
  function save(state) {
    // SAVE STATUS (break-it persistence 2026-10-09): returns true when the
    // save (and index) actually persisted, false on ANY failure (quota,
    // blocked storage, unserializable state). Callers must not mistake a
    // silent no-op for success — the autosave surfaces false to the player.
    // TOMBSTONE (break-it persistence r5 2026-10-09): returns the string
    // 'tombstoned' when this run's key was wiped (death/win/delete, possibly
    // in another tab). A stale tab's autosave must not re-create a dead run —
    // the exact two-tab resurrection of the class pass 2 killed single-tab.
    // Checked before any write; 'tombstoned' is deliberately distinct from
    // the quota-false so the UI can say so honestly.
    // CROSS-TAB STALENESS (break-it persistence r7 2026-10-09): a monotonic
    // saveSeq detects the two-tabs-one-run race. If the disk blob is newer
    // than this tab's in-memory copy, writing would silently destroy the
    // other tab's progress (last-write-wins). Refuse with a distinct 'stale'
    // signal instead — the autosave toasts it honestly. The player closes
    // the other tab and reloads here to keep playing.
    // MIGRATE-ON-SAVE (break-it persistence r7 2026-10-09): an old-version
    // in-memory state (stale tab across a version bump) upgrades through
    // registered migrations before writing, so blobs are always current.
    try {
      if (!state.startedAt) state.startedAt = Date.now();
      // pin the key on first save so it can't drift mid-run (mantle transfer)
      if (!state.runKey) state.runKey = saveKey(state);
      const key = saveKey(state);
      if (isTombstoned(key)) return 'tombstoned';
      if (state.version !== SAVE_VERSION) {
        const m = migrateSave(state);
        if (m && m !== state) {
          for (const k of Object.keys(state)) delete state[k];
          Object.assign(state, m);
        }
      }
      let diskSeq = 0;
      try {
        const raw = localStorage.getItem(key);
        if (raw) diskSeq = JSON.parse(raw).saveSeq || 0;
      } catch (e) { diskSeq = 0; } // unparseable disk blob: overwrite is healing
      const memSeq = state.saveSeq || 0;
      if (diskSeq > memSeq) return 'stale';
      state.saveSeq = Math.max(diskSeq, memSeq) + 1;
      localStorage.setItem(key, JSON.stringify(state));
      // upsert the index every save: name, day, last-played stay fresh.
      // includeStale: rebuilding from the default list would silently drop
      // version-mismatched entries from the index (break-it 2026-10-09).
      const idx = listSaves({ includeStale: true }).filter(i => i.key !== key);
      const rc = (state.village && state.village.rosterChars) || {};
      // HONEST INDEX (break-it persistence 2026-10-08): the entry must name the
      // CURRENT bearer, not whoever started the run — state.villagerId is synced
      // to the live villager by Game.save(); the scholar record lags by design.
      const liveVid = state.villagerId || (state.scholar && state.scholar.villagerId);
      const char = rc[liveVid] || {};
      idx.push({
        key,
        runName: state.runName || null,
        villagerId: liveVid,
        villagerName: char.name || null,
        day: state.scholar && state.scholar.day,
        location: state.saveLocationName || state.startLocationName || null,
        startedAt: state.startedAt,
        lastPlayed: Date.now(),
      });
      idx.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      localStorage.setItem('scattering-saves-index', JSON.stringify(idx));
      return true;
    } catch (e) { /* storage full/blocked/unserializable */ return false; }
  }
  // Tombstone: a wiped save stays dead. Written by wipe() for keys that
  // actually existed; read by save(). Per-runKey, so new runs (new keys)
  // are never blocked. Capped at 100, oldest pruned — tombstones are bytes,
  // but bytes accumulate over a long season of dead runs.
  const TOMBSTONE_PREFIX = 'scattering-save-tombstone-';
  function tombstoneKey(key) { return TOMBSTONE_PREFIX + key; }
  function isTombstoned(key) {
    try { return localStorage.getItem(tombstoneKey(key)) !== null; } catch (e) { return false; }
  }
  function writeTombstone(key, reason) {
    try {
      if (!key) return;
      localStorage.setItem(tombstoneKey(key), JSON.stringify({ t: Date.now(), reason: reason || 'wiped' }));
      const tk = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(TOMBSTONE_PREFIX) === 0) tk.push(k);
        }
      } catch (e2) {}
      if (tk.length > 100) {
        const aged = tk.map(k => {
          let t = 0;
          try { t = (JSON.parse(localStorage.getItem(k)) || {}).t || 0; } catch (e3) {}
          return { k, t };
        });
        aged.sort((a, b) => a.t - b.t);
        for (const e of aged.slice(0, aged.length - 100)) { try { localStorage.removeItem(e.k); } catch (e4) {} }
      }
    } catch (e) {}
  }
  // Quarantine: preserve corrupt save data under a capped, dated key instead
  // of destroying it. A future migrator (or a human) can still recover it.
  const QUARANTINE_MANIFEST = 'scattering-save-quarantine-manifest';
  const QUARANTINE_NOTICE = 'scattering-save-quarantine-notice';
  function quarantineKey(key) {
    try {
      const d = localStorage.getItem(key);
      if (!d) return;
      // RANDOM SUFFIX (break-it persistence r5 2026-10-09): the old
      // Date.now()-only stamp collided when two quarantines landed in the
      // same millisecond — the second silently overwrote the first and one
      // snapshot of corrupt data was lost, defeating the quarantine.
      const stamp = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      const qk = 'scattering-save-quarantine-' + key + '-' + stamp;
      localStorage.setItem(qk, d);
      localStorage.removeItem(key);
      // NOTICE + MANIFEST (break-it persistence r7 2026-10-09): quarantines
      // were a black hole — the expedition vanished with no word to the
      // player, and nothing could ever read the data back, so "preserved for
      // recovery" was unreachable. The one-shot notice lets the title screen
      // say so honestly; the manifest makes snapshots restorable (debug
      // panel). Neither resurrects anything by itself.
      try {
        let m = {};
        try { m = JSON.parse(localStorage.getItem(QUARANTINE_MANIFEST) || '{}'); } catch (e) {}
        m[qk] = { origKey: key, at: Date.now() };
        localStorage.setItem(QUARANTINE_MANIFEST, JSON.stringify(m));
        localStorage.setItem(QUARANTINE_NOTICE, JSON.stringify({ key: key, at: Date.now() }));
      } catch (e) {}
      // cap: keep the 3 most recent quarantine snapshots per key
      const qk2 = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('scattering-save-quarantine-' + key + '-') === 0) qk2.push(k);
        }
      } catch (e2) {}
      qk2.sort();
      while (qk2.length > 3) {
        const drop = qk2.shift();
        try { localStorage.removeItem(drop); } catch (e3) {}
        try {
          const m = JSON.parse(localStorage.getItem(QUARANTINE_MANIFEST) || '{}');
          if (m[drop]) { delete m[drop]; localStorage.setItem(QUARANTINE_MANIFEST, JSON.stringify(m)); }
        } catch (e4) {}
      }
    } catch (e) {}
  }
  // takeQuarantineNotice: one-shot {key, at} — the title screen toasts it
  // once ("damaged, set aside — not deleted") then it's gone.
  function takeQuarantineNotice() {
    try {
      const raw = localStorage.getItem(QUARANTINE_NOTICE);
      if (!raw) return null;
      localStorage.removeItem(QUARANTINE_NOTICE);
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  // listQuarantines: restorable snapshots, newest first. Manifest entries
  // whose snapshot is gone are skipped (bounded, self-cleaning).
  function listQuarantines() {
    try {
      let m = {};
      try { m = JSON.parse(localStorage.getItem(QUARANTINE_MANIFEST) || '{}'); } catch (e) {}
      return Object.keys(m)
        .filter(qk => { try { return localStorage.getItem(qk) !== null; } catch (e) { return false; } })
        .map(qk => ({ qkey: qk, origKey: m[qk].origKey, at: m[qk].at }))
        .sort((a, b) => (b.at || 0) - (a.at || 0));
    } catch (e) { return []; }
  }
  // restoreQuarantine(qkey): copy a snapshot back under its original key.
  // Deliberate user action (debug panel) — clears the tombstone so the
  // revived run can save again. Refuses to clobber a live save ('occupied'),
  // restore an unparseable snapshot ('corrupt'), or "restore" a snapshot
  // that parses but can never load ('unusable': no version, or a version
  // with no migration path). The old code returned true for those — the
  // debug panel said "restored" while Continue still couldn't load it, and
  // the next listSaves() silently re-quarantined it, burning a quarantine
  // slot per restore cycle (break-it persistence r1 2026-10-10).
  function restoreQuarantine(qkey) {
    try {
      let m = {};
      try { m = JSON.parse(localStorage.getItem(QUARANTINE_MANIFEST) || '{}'); } catch (e) {}
      const meta = m[qkey];
      if (!meta || !meta.origKey) return false;
      const d = localStorage.getItem(qkey);
      if (!d) return false;
      let s = null;
      try { s = JSON.parse(d); } catch (e) { return 'corrupt'; }
      if (!s || typeof s !== 'object') return 'corrupt';
      if (s.version !== SAVE_VERSION && !hasMigrationPath(s.version)) return 'unusable';
      try {
        const cur = localStorage.getItem(meta.origKey);
        if (cur) {
          try { const s = JSON.parse(cur); if (s && s.version === SAVE_VERSION) return 'occupied'; }
          catch (e) {}
        }
      } catch (e) {}
      localStorage.setItem(meta.origKey, d);
      try { localStorage.removeItem(tombstoneKey(meta.origKey)); } catch (e) {}
      // the next listSaves() adopts the restored blob into the index
      return true;
    } catch (e) { return false; }
  }
  // Save-blob key prefix. Tombstones ('scattering-save-tombstone-…') and
  // quarantine snapshots ('scattering-save-quarantine-…') do NOT match it.
  const BLOB_PREFIX = 'scattering-save-v1-';
  function scanSaveBlobs() {
    const found = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(BLOB_PREFIX) === 0) found.push(k);
      }
    } catch (e) {}
    return found;
  }
  // adoptEntry: synthesize an honest index entry from a blob found on disk
  // but missing from the index (corrupt/missing index, crashed save).
  function adoptEntry(k, s, isStale) {
    const rc = (s.village && s.village.rosterChars) || {};
    const liveVid = s.villagerId || (s.scholar && s.scholar.villagerId);
    const char = (liveVid && rc[liveVid]) || {};
    const e = {
      key: k,
      runName: s.runName || null,
      villagerId: liveVid || null,
      villagerName: char.name || null,
      day: s.scholar && s.scholar.day,
      location: s.saveLocationName || s.startLocationName || null,
      startedAt: s.startedAt || 0,
      lastPlayed: s.startedAt || 0,
      adopted: true,
    };
    if (isStale) { e.stale = true; e.staleVersion = s.version; }
    else if (s.version !== SAVE_VERSION) e.willMigrate = true;
    return e;
  }
  function listSaves(opts) {
    opts = opts || {};
    try {
      const raw = localStorage.getItem('scattering-saves-index');
      // CORRUPT INDEX (break-it persistence r7 2026-10-09): the index was a
      // single point of failure — one corrupt index blob hid every healthy
      // save, and the next save() rebuilt the index with only its own entry,
      // orphaning the rest on disk (invisible to the player). The index is a
      // cache, not truth: start from [] and let the disk scan below re-adopt
      // every healthy blob.
      let idx = [];
      try { idx = raw ? JSON.parse(raw) : []; } catch (e) { idx = []; }
      if (!Array.isArray(idx)) idx = [];
      // prune orphans: dead/finished runs are wiped, their index entries shouldn't linger.
      // CORRUPT-SAVE HONESTY (break-it persistence 2026-10-08): an entry whose data
      // is unparseable or version-mismatched can never load — offering Continue for
      // it is a lie that silently does nothing. Prune it from the list.
      // STALE-VERSION HONESTY (break-it persistence 2026-10-09): a parseable
      // save whose version doesn't match is NOT corrupt — its data is KEPT
      // untouched, and with {includeStale:true} it is surfaced flagged
      // {stale:true} so the title screen can say "older version" instead of
      // pretending the expedition never existed.
      // QUARANTINE (break-it persistence 2026-10-09): unparseable data is
      // moved to a capped dated quarantine key before pruning — never
      // destroyed on sight (Steve 2026-10-05's corrupt-save recovery, restored
      // in minimal form; the full migration subsystem stays retired).
      const stale = [];
      const prunedKeys = new Set();
      const live = idx.filter(i => {
        try {
          // TOMBSTONED (break-it persistence r7): a tombstoned key lingering
          // in the index (crashed wipe) is pruned — dead runs stay dead.
          if (isTombstoned(i.key)) { prunedKeys.add(i.key); return false; }
          const d = localStorage.getItem(i.key);
          if (!d) { prunedKeys.add(i.key); return false; } // orphan: wiped elsewhere
          const s = JSON.parse(d);
          if (s && s.version === SAVE_VERSION) return true;
          if (s && typeof s.version !== 'undefined') {
            if (hasMigrationPath(s.version)) {
              // MIGRATABLE (break-it persistence r7): an old version with a
              // registered path loads fine (migrates on load) — it is NOT
              // stale. Flagged so the title screen can say "upgrades on load".
              if (s.version !== SAVE_VERSION) i.willMigrate = true;
              return true;
            }
            // version-mismatched with no path: STAYS in the index (so
            // includeStale can surface it later), just not in the default
            // loadable list.
            stale.push(Object.assign({}, i, { stale: true, staleVersion: s.version }));
          }
          return false;
        } catch (e) { return false; } // unparseable: quarantined below
      });
      const liveSet = new Set(live);
      const staleKeys = new Set(stale.map(i => i.key));
      for (const i of idx) {
        if (liveSet.has(i)) continue;
        if (staleKeys.has(i.key)) continue; // version-mismatched: data kept as-is
        if (prunedKeys.has(i.key)) continue; // orphan: nothing to quarantine
        try {
          const d = localStorage.getItem(i.key);
          if (d) { try { JSON.parse(d); } catch (e) { quarantineKey(i.key); prunedKeys.add(i.key); } }
        } catch (e) {}
      }
      // SELF-HEALING SCAN (break-it persistence r7 2026-10-09): adopt blobs
      // on disk that the index doesn't know about (corrupt/missing index,
      // crashed save). Parseable current-version (or migratable) blobs join
      // live; version-mismatched with no path join stale; unparseable ones
      // are quarantined (never destroyed). Tombstoned keys are skipped —
      // dead runs stay dead.
      let adopted = false;
      try {
        const known = new Set(idx.map(i => i.key));
        for (const k of scanSaveBlobs()) {
          if (known.has(k) || isTombstoned(k)) continue;
          let s = null, parseable = false;
          try { s = JSON.parse(localStorage.getItem(k)); parseable = !!(s && typeof s === 'object'); }
          catch (e) { parseable = false; }
          if (!parseable) { quarantineKey(k); adopted = true; continue; }
          if (s.version === SAVE_VERSION || hasMigrationPath(s.version)) {
            live.push(adoptEntry(k, s, false)); adopted = true;
          } else if (typeof s.version !== 'undefined') {
            stale.push(adoptEntry(k, s, true)); adopted = true;
          } else {
            quarantineKey(k); adopted = true; // no version at all: untrustworthy
          }
        }
      } catch (e) {}
      if (prunedKeys.size > 0 || adopted) {
        try {
          const rebuilt = idx.filter(i => !prunedKeys.has(i.key));
          for (const e of live.concat(stale)) {
            if (e.adopted && !rebuilt.some(r => r.key === e.key)) rebuilt.push(e);
          }
          localStorage.setItem('scattering-saves-index', JSON.stringify(rebuilt));
        } catch (e) {}
      }
      if (opts.includeStale) return live.concat(stale);
      return live;
    } catch (e) { return []; }
  }
  function load(key) {
    try {
      const k = key || SAVE_KEY; // fallback to legacy single save
      // TOMBSTONE READ PATH (break-it persistence r7 2026-10-09): a blob
      // that somehow still exists under a tombstoned key (failed removeItem,
      // cross-tab weirdness) must not load — dead runs stay dead.
      if (isTombstoned(k)) return null;
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.version === SAVE_VERSION) return s;
      // MIGRATION (break-it persistence r7 2026-10-09): old versions upgrade
      // through registered migrations; versions with no path (or future
      // versions) refuse — null, never corrupt, never guess.
      return migrateSave(s);
    } catch (e) { return null; }
  }
  function wipe(key, reason) {
    try {
      const k = key || SAVE_KEY;
      // TOMBSTONE (break-it persistence r5 2026-10-09): only mark keys that
      // actually existed — newGame wipes a never-written key and must not
      // leave a tombstone behind for a run that never was.
      const existed = localStorage.getItem(k) !== null;
      localStorage.removeItem(k);
      if (existed) writeTombstone(k, reason);
      // remove from index (preserve stale entries — see save())
      if (key) {
        const idx = listSaves({ includeStale: true }).filter(i => i.key !== key);
        localStorage.setItem('scattering-saves-index', JSON.stringify(idx));
      }
    } catch (e) {}
  }
  function wipeAll() { try {
    // includeStale: "wipe ALL saves" means all of them, including
    // version-mismatched ones the default list hides (break-it 2026-10-09).
    const keys = [];
    for (const i of listSaves({ includeStale: true })) {
      localStorage.removeItem(i.key);
      keys.push(i.key);
    }
    const hadLegacy = localStorage.getItem(SAVE_KEY) !== null;
    localStorage.removeItem('scattering-saves-index');
    localStorage.removeItem(SAVE_KEY);
    // TOMBSTONES (break-it persistence r7 2026-10-09): wipe-all must leave
    // the same per-key tombstones wipe() does — without them a stale tab's
    // autosave silently resurrected every wiped run (dead runs must stay
    // dead, no matter which wipe path killed them).
    for (const k of keys) writeTombstone(k, 'wiped-all');
    if (hadLegacy) writeTombstone(SAVE_KEY, 'wiped-all');
  } catch (e) {} }

  global.Scattering = global.Scattering || {};
  global.Scattering.state = { newState, newVillage, newScholar, newCodex, save, load, wipe, wipeAll, listSaves, saveKey, quarantineKey, SAVE_VERSION, MIGRATIONS, migrateSave, hasMigrationPath, takeQuarantineNotice, listQuarantines, restoreQuarantine };
})(typeof window !== 'undefined' ? window : globalThis);
