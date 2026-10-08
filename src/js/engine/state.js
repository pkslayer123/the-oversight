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
//   - save(state)
//   - listSaves()
//   - load(key)
//   - wipe(key)
//   - wipeAll()
// rules:
//   - (none documented)
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
    return { plants: {}, monsters: {}, recipes: [], terrain: {}, skills: {}, trees: {} };
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
    try {
      if (!state.startedAt) state.startedAt = Date.now();
      // pin the key on first save so it can't drift mid-run (mantle transfer)
      if (!state.runKey) state.runKey = saveKey(state);
      const key = saveKey(state);
      localStorage.setItem(key, JSON.stringify(state));
      // upsert the index every save: name, day, last-played stay fresh
      const idx = listSaves().filter(i => i.key !== key);
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
    } catch (e) { /* storage full/blocked */ }
  }
  function listSaves() {
    try {
      const raw = localStorage.getItem('scattering-saves-index');
      const idx = raw ? JSON.parse(raw) : [];
      // prune orphans: dead/finished runs are wiped, their index entries shouldn't linger.
      // CORRUPT-SAVE HONESTY (break-it persistence 2026-10-08): an entry whose data
      // is unparseable or version-mismatched can never load — offering Continue for
      // it is a lie that silently does nothing. Prune it from the list. Corrupt
      // (unparseable) data is deleted outright; version-mismatched data is KEPT
      // (a future migrator could recover it) but hidden from the list.
      const live = idx.filter(i => {
        try {
          const d = localStorage.getItem(i.key);
          if (!d) return false;
          const s = JSON.parse(d);
          return !!(s && s.version === SAVE_VERSION);
        } catch (e) { return false; }
      });
      const liveSet = new Set(live);
      for (const i of idx) {
        if (liveSet.has(i)) continue;
        try {
          const d = localStorage.getItem(i.key);
          if (d) { try { JSON.parse(d); } catch (e) { localStorage.removeItem(i.key); } }
          else localStorage.removeItem(i.key);
        } catch (e) {}
      }
      if (live.length !== idx.length) {
        try { localStorage.setItem('scattering-saves-index', JSON.stringify(live)); } catch (e) {}
      }
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
  function wipe(key) {
    try {
      localStorage.removeItem(key || SAVE_KEY);
      // remove from index
      if (key) {
        const idx = listSaves().filter(i => i.key !== key);
        localStorage.setItem('scattering-saves-index', JSON.stringify(idx));
      }
    } catch (e) {}
  }
  function wipeAll() { try {
    for (const i of listSaves()) localStorage.removeItem(i.key);
    localStorage.removeItem('scattering-saves-index');
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {} }

  global.Scattering = global.Scattering || {};
  global.Scattering.state = { newState, newVillage, newScholar, newCodex, save, load, wipe, wipeAll, listSaves, saveKey, SAVE_VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
