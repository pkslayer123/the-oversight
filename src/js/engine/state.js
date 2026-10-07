// @ontology
// system: game-state
// description: State factories, versioned save/load with migration, corrupt-save quarantine + backup rotation, run chronicle. Village / scholars / Codex / run are independent so one can reset cleanly.
// provides:
//   - SAVE_VERSION (code: state.js)
//   - BACKUP_COUNT (code: state.js)
//   - CHRONICLE_CAP (code: state.js)
//   - migrations (code: state.js)
//   - newVillage()
//   - newScholar(villagerId)
//   - newCodex()
//   - newState()
//   - saveKey(state)
//   - save(state)
//   - listSaves()
//   - load(key)
//   - loadDetailed(key)
//   - backupKeys(key)
//   - quarantine(key)
//   - restoreBackup(key)
//   - wipe(key)
//   - wipeAll()
//   - chronicleAdd(village, kind, text, opts)
//   - chronicleFork(oldVillage)
//   - chronicleSummary(village)
// rules:
//   - migrations_run_old_to_new: loads of version < SAVE_VERSION run migrations[version]; unknown future versions fail gracefully, never throw (code: loadDetailed, Steve 2026-10-05)
//   - corrupt_never_loses: a corrupt slot is quarantined to a dated backup key before anything is discarded; load() falls back to rotated backups first (code: quarantine, restoreBackup, Steve 2026-10-05)
//   - backups_rotate: save() rotates the previous slot into .bak1/.bak2 before writing, so one bad write can't nuke a run (code: save, Steve 2026-10-05)
//   - chronicle_capped: village.chronicle holds at most CHRONICLE_CAP era beats; oldest pruned (code: chronicleAdd)
//   - exile_fork_honest: exile hard reset carries ONLY the exile beat into the new haven — the old haven's beats do not follow; the scholar remembers being exiled, the new village knows nothing else (code: chronicleFork, Steve 2026-10-06)
// consumes:
//   - (none documented)
/* Game state: factory, save/load (versioned), sub-objects separable.
   Village / scholars / Codex / run are independent so one can reset cleanly.
   Mobile PWA reality: localStorage gets wiped/corrupted by the OS. Save
   robustness is load-bearing: migrations, shape validation, quarantine,
   backup rotation. Never throws to the title screen. */
(function (global) {
  'use strict';
  const SAVE_KEY = 'scattering-save-v1';
  const SAVE_VERSION = 1;
  const BACKUP_COUNT = 2;          // last N rotated backups per slot
  const CHRONICLE_CAP = 40;        // era-level beats remembered per village
  const QUARANTINE_PREFIX = 'scattering-save-quarantine-';

  // Storage accessor: graceful when localStorage is unavailable (private mode, node).
  function _store() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; }
    catch (e) { return null; }
  }

  // ---------------------------------------------------------------- chronicle
  // Era-level beats the village remembers: foundings, exiles, hard resets,
  // arrivals, moots, contests, omens, falls, triumphs. Complements journal.js
  // (per-life mantle/marginalia) and ledger.js (leadership vector) — this is
  // the VILLAGE's memory, not the scholar's and not the legend's.
  const CHRONICLE_KINDS = ['founding', 'exile', 'hard-reset', 'arrival', 'departure',
    'moot', 'contest', 'omen', 'fall', 'triumph', 'blight', 'feast'];

  function _chron(v) {
    if (!v || typeof v !== 'object') return [];
    if (!Array.isArray(v.chronicle)) v.chronicle = [];
    return v.chronicle;
  }

  function chronicleAdd(village, kind, text, opts) {
    opts = opts || {};
    const c = _chron(village);
    const k = CHRONICLE_KINDS.indexOf(kind) >= 0 ? kind : 'omen';
    c.push({
      day: (opts.day != null ? opts.day : (village && village.day) || 1),
      kind: k,
      text: String(text || '').slice(0, 280),
    });
    while (c.length > CHRONICLE_CAP) c.shift(); // oldest pruned
    return c;
  }

  // Exile hard reset (Steve 2026-10-06): a REAL fork. The new haven does NOT
  // inherit the old haven's beats — what would they know? The scholar carries
  // one thing: the memory of being exiled. journal.js / ledger.js layers live
  // on state (scholar-adjacent), not on the village — their exile semantics
  // belong to those modules, not here.
  function chronicleFork(oldVillage) {
    const name = (oldVillage && oldVillage.name) || 'the old haven';
    return [{ day: 1, kind: 'exile',
      text: 'Exiled from ' + name + '. The road begins again.' }];
  }

  function chronicleSummary(village) {
    const c = _chron(village);
    if (!c.length) return '';
    return c.map(function (e) { return 'Day ' + e.day + ' — ' + e.text; }).join('\n');
  }

  // ---------------------------------------------------------------- factories
  function newVillage() {
    const v = {
      name: 'Haven', day: 1, season: 'spring',
      // Starting pantry: RNG, scaled for 12 people. 1.5-3 days of food (36k-72k kcal).
      // Set properly in newGame (this is just the template).
      pantryKcal: 36000, waterL: 12, morale: 'steady',
      villagers: [], // villager ids (living)
      fallen: [],    // {villagerId, day, cause} — remembered
      favor: 0,
      chronicle: [], // era-level beats; see chronicleAdd
    };
    chronicleAdd(v, 'founding', 'The haven was founded.', { day: 1 });
    return v;
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
    return { plants: {}, monsters: {}, recipes: [], terrain: {}, skills: {}, trees: {} };
    // plants: {plantId: {identifiedDay, survivedEating: bool, notes}}
    // trees: {species: {level, learnedDay}} — tree species knowledge (Steve 2026-10-05)
    // skills: {skillId: {level, learnedDay, via}} — knowledge about ANYTHING, not just plants
  }

  function newState() {
    return { version: SAVE_VERSION, village: newVillage(), scholar: null, codex: newCodex(), run: null };
  }

  // ------------------------------------------------------------- migrations
  // Version history: 1 is the first stamped version. Anything parsed without
  // a numeric version (pre-stamp, hand-written, synthetic) is treated as v0.
  function _migrateV0toV1(s) {
    const out = (s && typeof s === 'object') ? s : {};
    if (!out.village || typeof out.village !== 'object') out.village = newVillage();
    if (!out.codex || typeof out.codex !== 'object') out.codex = newCodex();
    // scholar may legitimately be null (title screen, no run yet); run may be null.
    // chronicle: ensure the array exists; add NOTHING — we honestly don't know the past.
    _chron(out.village);
    out.version = SAVE_VERSION;
    return out;
  }
  const migrations = { 0: _migrateV0toV1 };

  function _shapeOk(s) {
    if (!s || typeof s !== 'object') return false;
    if (!s.village || typeof s.village !== 'object') return false;
    if (!Array.isArray(s.village.villagers)) return false;
    if (!Array.isArray(s.village.fallen)) return false;
    if (!s.codex || typeof s.codex !== 'object') return false;
    return true;
  }

  // ------------------------------------------------------- backups/quarantine
  function backupKeys(key) {
    const ks = [];
    for (let i = 1; i <= BACKUP_COUNT; i++) ks.push(key + '.bak' + i);
    return ks;
  }

  function _rotateBackups(key) {
    const st = _store(); if (!st) return;
    try {
      const cur = st.getItem(key);
      if (cur == null) return; // nothing to rotate on first save
      const ks = backupKeys(key);
      for (let i = ks.length - 1; i > 0; i--) {
        const prev = st.getItem(ks[i - 1]);
        if (prev != null) st.setItem(ks[i], prev);
      }
      st.setItem(ks[0], cur);
    } catch (e) { /* storage full/blocked */ }
  }

  // Quarantine: copy the bad slot's raw bytes to a dated backup key so nothing
  // is ever silently lost. Returns the backup key (or null).
  function quarantine(key) {
    const st = _store(); if (!st) return null;
    const k = key || SAVE_KEY;
    try {
      const raw = st.getItem(k);
      if (!raw) return null;
      const bkey = QUARANTINE_PREFIX + Date.now() + '-' +
        Math.floor(Math.random() * 1296).toString(36);
      st.setItem(bkey, raw);
      return bkey;
    } catch (e) { return null; }
  }

  // First valid backup, oldest-to-newest preference order (bak1 is freshest).
  // Returns {state, from, migrated} or null. Read-only: never rewrites slots.
  function restoreBackup(key) {
    const st = _store(); if (!st) return null;
    const k = key || SAVE_KEY;
    for (const bk of backupKeys(k)) {
      try {
        const raw = st.getItem(bk);
        if (!raw) continue;
        const s = JSON.parse(raw);
        if (!_shapeOk(s)) continue;
        const v = (typeof s.version === 'number') ? s.version : 0;
        if (v > SAVE_VERSION) continue;
        if (v < SAVE_VERSION && typeof migrations[v] !== 'function') continue;
        const out = v < SAVE_VERSION ? migrations[v](s) : s;
        out.version = SAVE_VERSION;
        return { state: out, from: bk, migrated: v < SAVE_VERSION };
      } catch (e) { /* try next backup */ }
    }
    return null;
  }

  // Multiple saves: one per run. Key = villager + started timestamp.
  // Dead runs are wiped. Living runs persist until you start a new one (or delete).
  function saveKey(state) {
    const vid = state.villagerId || state.scholar && state.scholar.villagerId || 'unknown';
    const started = state.startedAt || Date.now();
    return `scattering-save-v1-${vid}-${started}`;
  }
  function save(state) {
    try {
      const st = _store(); if (!st) return;
      if (!state.startedAt) state.startedAt = Date.now();
      const key = saveKey(state);
      _rotateBackups(key); // one bad write can't nuke the run
      st.setItem(key, JSON.stringify(state));
      // upsert the index every save: name, day, last-played stay fresh
      const idx = listSaves().filter(i => i.key !== key);
      const rc = (state.village && state.village.rosterChars) || {};
      const char = rc[state.villagerId] || {};
      idx.push({
        key,
        runName: state.runName || null,
        villagerId: state.villagerId,
        villagerName: char.name || null,
        day: state.scholar && state.scholar.day,
        location: state.startLocationName || null,
        startedAt: state.startedAt,
        lastPlayed: Date.now(),
      });
      idx.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      st.setItem('scattering-saves-index', JSON.stringify(idx));
    } catch (e) { /* storage full/blocked */ }
  }
  function listSaves() {
    try {
      const st = _store(); if (!st) return [];
      const raw = st.getItem('scattering-saves-index');
      const idx = raw ? JSON.parse(raw) : [];
      // prune orphans: dead/finished runs are wiped, their index entries shouldn't linger
      const live = idx.filter(i => { try { return !!st.getItem(i.key); } catch (e) { return true; } });
      if (live.length !== idx.length) {
        try { st.setItem('scattering-saves-index', JSON.stringify(live)); } catch (e) {}
      }
      return live;
    } catch (e) { return []; }
  }

  // Structured load. Never throws.
  //   {ok:true, state, recoveredFrom, migrated, quarantined?}
  //   {ok:false, reason, backupKey}
  // reasons: 'no-save' | 'corrupt-json' | 'bad-shape' | 'newer-version' |
  //          'no-migration' | 'migration-bad-shape'
  // app.js can use this on the title screen to offer "start fresh (old save
  // preserved)" instead of silently showing an empty slot list.
  function loadDetailed(key) {
    try {
      const st = _store();
      const k = key || SAVE_KEY; // fallback to legacy single save
      const raw = st ? st.getItem(k) : null;
      if (!raw) return { ok: false, reason: 'no-save', backupKey: null };

      const accept = function (parsed, recoveredFrom) {
        if (!_shapeOk(parsed)) return null;
        const v = (typeof parsed.version === 'number') ? parsed.version : 0;
        if (v > SAVE_VERSION)
          return { ok: false, reason: 'newer-version', backupKey: null };
        if (v < SAVE_VERSION) {
          if (typeof migrations[v] !== 'function')
            return { ok: false, reason: 'no-migration', backupKey: null };
          const m = migrations[v](parsed);
          if (!_shapeOk(m)) return { ok: false, reason: 'migration-bad-shape', backupKey: null };
          m.version = SAVE_VERSION;
          return { ok: true, state: m, recoveredFrom: recoveredFrom || null, migrated: true };
        }
        return { ok: true, state: parsed, recoveredFrom: recoveredFrom || null, migrated: false };
      };

      let parsed = null, badJson = false;
      try { parsed = JSON.parse(raw); } catch (e) { badJson = true; }

      if (!badJson) {
        const r = accept(parsed, null);
        if (r) return r; // clean load (possibly migrated); no quarantine needed
      }

      // Main slot is unusable: quarantine the bytes, then try rotated backups.
      const bkey = quarantine(k);
      const rb = restoreBackup(k);
      if (rb) {
        // Promote the recovered backup to the main slot so the next load is clean.
        try { st.setItem(k, JSON.stringify(rb.state)); } catch (e) {}
        return { ok: true, state: rb.state, recoveredFrom: rb.from,
                 migrated: rb.migrated, quarantined: bkey };
      }
      return { ok: false, reason: badJson ? 'corrupt-json' : 'bad-shape', backupKey: bkey };
    } catch (e) { return { ok: false, reason: 'load-error', backupKey: null }; }
  }

  // Legacy contract (game.js load()): state object or null. Never throws.
  // Quarantine + backup fallback happen inside loadDetailed.
  function load(key) {
    const r = loadDetailed(key);
    return (r && r.ok) ? r.state : null;
  }
  function wipe(key) {
    try {
      const st = _store(); if (!st) return;
      const k = key || SAVE_KEY;
      st.removeItem(k);
      for (const bk of backupKeys(k)) st.removeItem(bk);
      // remove from index
      if (key) {
        const idx = listSaves().filter(i => i.key !== key);
        st.setItem('scattering-saves-index', JSON.stringify(idx));
      }
    } catch (e) {}
  }
  function wipeAll() { try {
    const st = _store(); if (!st) return;
    for (const i of listSaves()) { st.removeItem(i.key); for (const bk of backupKeys(i.key)) st.removeItem(bk); }
    st.removeItem('scattering-saves-index');
    st.removeItem(SAVE_KEY);
  } catch (e) {} }

  global.Scattering = global.Scattering || {};
  global.Scattering.state = {
    newState, newVillage, newScholar, newCodex,
    save, load, loadDetailed, wipe, wipeAll, listSaves, saveKey,
    backupKeys, quarantine, restoreBackup,
    chronicleAdd, chronicleFork, chronicleSummary,
    migrations, SAVE_VERSION, BACKUP_COUNT, CHRONICLE_CAP,
  };
})(typeof window !== 'undefined' ? window : globalThis);
