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
//   - save(state) -> true | 'tombstoned' | false: honest save status; false on quota/blocked/unserializable, 'tombstoned' when the run's key was wiped (break-it 2026-10-09 r5)
//   - listSaves(opts): opts.includeStale surfaces version-mismatched saves flagged {stale:true} (break-it 2026-10-09)
//   - load(key)
//   - wipe(key, reason?): leaves a per-key tombstone so a wiped run stays dead (break-it 2026-10-09 r5)
//   - wipeAll()
//   - quarantineKey(key): move corrupt save data to a capped dated quarantine key (break-it 2026-10-09 r5)
// rules:
//   - save_honest_status: save() returns false on any failure; callers (autosave) surface it, never mistake silence for success (code: save, break-it 2026-10-09)
//   - corrupt_quarantined: unparseable save data moves to a capped dated quarantine key before pruning — never destroyed on sight (code: quarantineKey, break-it 2026-10-09)
//   - stale_version_visible: version-mismatched saves are kept and surfaced flagged, never silently hidden (code: listSaves, break-it 2026-10-09)
//   - dead_runs_stay_dead: wipe() leaves a per-key tombstone; save() refuses tombstoned keys with a distinct 'tombstoned' signal (never the quota-false), so a stale tab's autosave can't resurrect a wiped run (code: save/wipe, break-it 2026-10-09 r5)
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
    try {
      if (!state.startedAt) state.startedAt = Date.now();
      // pin the key on first save so it can't drift mid-run (mantle transfer)
      if (!state.runKey) state.runKey = saveKey(state);
      const key = saveKey(state);
      if (isTombstoned(key)) return 'tombstoned';
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
  function quarantineKey(key) {
    try {
      const d = localStorage.getItem(key);
      if (!d) return;
      // RANDOM SUFFIX (break-it persistence r5 2026-10-09): the old
      // Date.now()-only stamp collided when two quarantines landed in the
      // same millisecond — the second silently overwrote the first and one
      // snapshot of corrupt data was lost, defeating the quarantine.
      const stamp = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('scattering-save-quarantine-' + key + '-' + stamp, d);
      localStorage.removeItem(key);
      // cap: keep the 3 most recent quarantine snapshots per key
      const qk = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('scattering-save-quarantine-' + key + '-') === 0) qk.push(k);
        }
      } catch (e2) {}
      qk.sort();
      while (qk.length > 3) { try { localStorage.removeItem(qk.shift()); } catch (e3) {} }
    } catch (e) {}
  }
  function listSaves(opts) {
    opts = opts || {};
    try {
      const raw = localStorage.getItem('scattering-saves-index');
      const idx = raw ? JSON.parse(raw) : [];
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
          const d = localStorage.getItem(i.key);
          if (!d) { prunedKeys.add(i.key); return false; } // orphan: wiped elsewhere
          const s = JSON.parse(d);
          if (s && s.version === SAVE_VERSION) return true;
          if (s && typeof s.version !== 'undefined') {
            // version-mismatched: STAYS in the index (so includeStale can
            // surface it later), just not in the default loadable list.
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
      if (prunedKeys.size > 0) {
        try {
          localStorage.setItem('scattering-saves-index',
            JSON.stringify(idx.filter(i => !prunedKeys.has(i.key))));
        } catch (e) {}
      }
      if (opts.includeStale) return live.concat(stale);
      return live;
    } catch (e) { return []; }
  }
  function load(key) {
    try {
      const k = key || SAVE_KEY; // fallback to legacy single save
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.version !== SAVE_VERSION) return null;
      return s;
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
    for (const i of listSaves({ includeStale: true })) localStorage.removeItem(i.key);
    localStorage.removeItem('scattering-saves-index');
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {} }

  global.Scattering = global.Scattering || {};
  global.Scattering.state = { newState, newVillage, newScholar, newCodex, save, load, wipe, wipeAll, listSaves, saveKey, quarantineKey, SAVE_VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
