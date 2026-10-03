/* Game state: factory, save/load (versioned), sub-objects separable.
   Village / scholars / Codex / run are independent so one can reset cleanly. */
(function (global) {
  'use strict';
  const SAVE_KEY = 'scattering-save-v1';
  const SAVE_VERSION = 1;

  function newVillage() {
    return {
      name: 'Haven', day: 1, season: 'spring',
      pantryKcal: 2000, waterL: 12, morale: 'steady',
      villagers: [], // villager ids (living)
      fallen: [],    // {villagerId, day, cause} — remembered
      favor: 0,
    };
  }

  function newScholar(villagerId) {
    return {
      villagerId, day: 1, ap: 4,
      health: 100, kcal: 2200, hydration: 100, energy: 100,
      abilities: [], // ability ids (max 6)
      relics: [],    // {itemId, bond}
      injuries: [],
      position: { region: null, x: 0, y: 0 },
      inventory: [], // {plantId|itemId, qty, spoilageDay}
    };
  }

  function newCodex() {
    return { plants: {}, monsters: {}, recipes: [], terrain: {} };
    // plants: {plantId: {identifiedDay, survivedEating: bool, notes}}
  }

  function newState() {
    return { version: SAVE_VERSION, village: newVillage(), scholar: null, codex: newCodex(), run: null };
  }

  function save(state) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.version !== SAVE_VERSION) return null; // refuse to corrupt; migrate later
      return s;
    } catch (e) { return null; }
  }

  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  global.Scattering = global.Scattering || {};
  global.Scattering.state = { newState, newVillage, newScholar, newCodex, save, load, wipe, SAVE_VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
