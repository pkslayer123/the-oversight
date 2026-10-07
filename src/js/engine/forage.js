// @ontology
// system: forage-engine
// description: Foraging resolver. Tile + biome + day yields plant yield from plants.json + biomes.json data. Pure logic.
// provides:
//   - weightedPick(table, rng)
//   - forage(tile, biome, plants, scholar, codex, abilitiesData, bounty, opts)
//   - canForage(tile)
// rules:
//   - (none documented)
// consumes:
//   - (none documented)
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
  // opts.forcePlantId: when you've targeted a specific known bush, you get
  //   what's actually growing there — not a random pick from the biome table.
  function forage(tile, biome, plants, scholar, codex, abilitiesData, bounty, opts) {
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
    // TARGETED: a known bush gives its own fruit. You tapped a blackberry
    // bush — you get blackberries, not whatever the biome table felt like.
    let plantId;
    if (opts && opts.forcePlantId && plants.some(x => x.id === opts.forcePlantId)) {
      plantId = opts.forcePlantId;
    } else {
      plantId = weightedPick(table);
    }
    const plant = plants.find(x => x.id === plantId);

    // QUICK AND SMALL: foraging is a 16-tick beat, not a time-skip.
    // 5-8 units per press (~200-550 kcal typical) — granular, tactile,
    // more decisions per day instead of one big swing.
    let units = 5 + Math.floor(Math.random() * 4); // 5-8: a quick gather, not a 3-hour haul
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

    // NAMES ARE EARNED: until L1, the engine only knows descriptors.
    const entry = (codex.plants || {})[plantId];
    const known = !!(entry && entry.level >= 1);
    const label = known ? plant.name : (plant.description || 'an unfamiliar plant');
    const firstFind = !(codex.plants[plantId] && codex.plants[plantId].identifiedDay);
    const kcal = units * plant.caloriesPerUnit;

    return {
      plantId, units, kcal, firstFind, rareFind, known,
      plant,
      message: (!known
        ? `You gather ${label}. Unfamiliar — noted, not named.`
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
