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
      const fav = (bounty && bounty.favored === pid) ? 4 : 1;
      table[pid] = w * aff * fav;
    }
    // discovery, not given: the first forage is pure luck. AFTER you find something,
    // you know where to look — the known plant gets 3x weight on later visits.
    if (tile.knownPlant && table[tile.knownPlant]) table[tile.knownPlant] *= 3;
    const plantId = weightedPick(table);
    const plant = plants.find(x => x.id === plantId);

    let units = 10 + Math.floor(Math.random() * 6); // 10-15: 3hrs of real foraging. A skilled gatherer fills a bag, not a pocket.
    if (bounty && bounty.richness) units = Math.round(units * bounty.richness); // rich ground feeds better
    units = Math.round(S.modifiers.resolve(units, 'forage.yield', mods, ctx));
    // lucky_rock: the System helps a little. Everywhere.
    units = Math.round(units * S.modifiers.resolve(1, 'luck.global', mods, ctx));
    // compost_king: buried food feeds the tile. +10% here.
    if (tile.compost) units = Math.round(units * 1.1);
    units = Math.max(1, units);
    // pattern_recognition: sometimes you see what others miss. A rare find.
    let rareFind = null;
    const rareChance = S.modifiers.resolve(0, 'forage.rare_find_chance', mods, ctx);
    if (rareChance > 0 && Math.random() < rareChance) {
      rareFind = { plantId: 'rare_herb', units: 1, kcal: 300 };
      units += 0; // bonus is separate, not in the main haul
    }

    const firstFind = !(codex.plants[plantId] && codex.plants[plantId].identifiedDay);
    const kcal = units * plant.caloriesPerUnit;

    return {
      plantId, units, kcal, firstFind, rareFind,
      plant,
      message: (firstFind
        ? `New plant recorded: ${plant.name}. The Codex grows.`
        : `Foraged ${units}× ${plant.unit} of ${plant.name} (+${kcal} kcal).`)
        + (rareFind ? ` And something rare — a hidden patch. (+${rareFind.kcal} kcal)` : '')
    };
  }

  // Can this tile be foraged? (stock remains, natural tile)
  function canForage(tile) {
    return (tile.stock || 0) > 0 && tile.type !== 'ruin';
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.forage = { forage, canForage, weightedPick };
})(typeof window !== 'undefined' ? window : globalThis);
