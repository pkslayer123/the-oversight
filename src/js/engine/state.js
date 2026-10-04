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
    };
  }

  function newCodex() {
    return { plants: {}, monsters: {}, recipes: [], terrain: {}, skills: {} };
    // plants: {plantId: {identifiedDay, survivedEating: bool, notes}}
    // skills: {skillId: {level, learnedDay, via}} — knowledge about ANYTHING, not just plants
  }

  function newState() {
    return { version: SAVE_VERSION, village: newVillage(), scholar: null, codex: newCodex(), run: null };
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
      if (!state.startedAt) state.startedAt = Date.now();
      const key = saveKey(state);
      localStorage.setItem(key, JSON.stringify(state));
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
      localStorage.setItem('scattering-saves-index', JSON.stringify(idx));
    } catch (e) { /* storage full/blocked */ }
  }
  function listSaves() {
    try {
      const raw = localStorage.getItem('scattering-saves-index');
      const idx = raw ? JSON.parse(raw) : [];
      // prune orphans: dead/finished runs are wiped, their index entries shouldn't linger
      const live = idx.filter(i => { try { return !!localStorage.getItem(i.key); } catch (e) { return true; } });
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
