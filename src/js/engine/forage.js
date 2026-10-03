/* Foraging resolver — slice 1.
   Tile + biome + day → plant yield. Uses data from plants.json + biomes.json.
   Pure logic; UI lives in app.js. */
(function (global) {
  'use strict';

  // Weighted pick from {id: weight}
  function weightedPick(table, rng) {
    const entries = Object.entries(table);
    const total = entries.reduce((s, e) => s + e[1], 0);
    let r = (rng || Math.random)() * total;
    for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
    return entries[entries.length - 1][0];
  }

  // Forage a tile. Returns {plantId, units, kcal, message, firstFind}.
  // tile: {type, foragedToday}  biome: biome data  plants: plant array
  // scholar: scholar state (for modifiers)  codex: codex state (for firstFind)
  function forage(tile, biome, plants, scholar, codex, abilitiesData, bounty) {
    const S = global.Scattering;
    const mods = S.modifiers.collectModifiers(scholar, abilitiesData || []);
    const ctx = { biome: biome.id };

    // tile affinity: plants with tileAffinity including tile.type get 2x weight.
    // place bounty: the node's favored plant gets 3x — the land's character decides.
    const table = {};
    for (const [pid, w] of Object.entries(biome.forageTable || {})) {
      const p = plants.find(x => x.id === pid);
      if (!p) continue;
      const aff = (p.tileAffinity || []).includes(tile.type) ? 2 : 1;
      const fav = (bounty && bounty.favored === pid) ? 3 : 1;
      table[pid] = w * aff * fav;
    }
    const plantId = weightedPick(table);
    const plant = plants.find(x => x.id === plantId);

    let units = 8 + Math.floor(Math.random() * 9); // 8-16: a day-part is ~3hrs of volume work; a knowing forager gathers real food
    if (bounty && bounty.richness) units = Math.round(units * bounty.richness); // rich ground feeds better
    units = Math.round(S.modifiers.resolve(units, 'forage.yield', mods, ctx));
    units = Math.max(1, units);

    const firstFind = !(codex.plants[plantId] && codex.plants[plantId].identifiedDay);
    const kcal = units * plant.caloriesPerUnit;

    return {
      plantId, units, kcal, firstFind,
      plant,
      message: firstFind
        ? `New plant recorded: ${plant.name}. The Codex grows.`
        : `Foraged ${units}× ${plant.unit} of ${plant.name} (+${kcal} kcal).`
    };
  }

  // Can this tile be foraged? (not foraged today, natural tile)
  function canForage(tile) {
    return !tile.foraged && tile.type !== 'ruin';
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.forage = { forage, canForage, weightedPick };
})(typeof window !== 'undefined' ? window : globalThis);
