// @ontology
// system: forage-engine
// description: Foraging resolver. Tile + biome + day yields plant yield from plants.json + biomes.json data. Pure logic.
// provides:
//   - weightedPick(table, rng)
//   - forage(tile, biome, plants, scholar, codex, abilitiesData, bounty, opts)
//   - canForage(tile)
//   - familiarityFor(scholar, plant)
//   - effectiveIdDifficulty(plant, scholar)
//   - forageModeFor(tile, scholar, codex, plants, opts)
//   - forageTableFor(biome, plants, tile, scholar, codex, bounty, mode)
//   - sweepPreview(mode, table, plants, codex)
//   - forageCost(scholar)
//   - patchStatus(tile, day)
//   - depletePatch(tile, day, regrowDays)
//   - regrowCheck(tile, day)
//   - canForageNow(tile, day)
//   - forageSweep(tile, biome, plants, scholar, codex, abilitiesData, bounty, opts)
//   - haulLearnData(plant, codex, day, units)
// rules:
//   - familiarity is honest: native regions read easier (idDifficulty -1, +25% yield), foreign ground harder (+1, -25%), every modifier ships a note saying why (code: forage.js).
//   - blind sweeps never name plants or kcal — descriptors and "?" until codex L1; deliberate/targeted name and value only what is known (code: forage.js).
//   - a foraged patch depletes and regrows over days; canForageNow blocks re-farming until regrowCheck says the ground recovered (code: forage.js).
//   - every forage names its cost (ticks + kcal) and explains its result, including "nothing here" (code: forage.js).
//   - successful hauls return haulLearnData for the codex identify/learn-more flow; the engine never writes codex state itself (code: forage.js).
// consumes:
//   - Scattering.modifiers (forage.yield, luck.global), Scattering.calories (ACTION_COSTS)
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

  // ── KNOWLEDGE-GATED FORAGING DEPTH (Steve 2026-10-05) ──────────────────
  // Learn → recognize → forage deliberately → haul home → identify → learn
  // more. Pure logic; UI lives in app.js. All rng injectable for tests.

  const FORAGE_TICKS = 16;   // a forage press is a 16-tick beat, not a time-skip
  const PATCH_REGROW_DAYS = 3; // a picked-clean patch needs days, not hours

  // Forager-background occupations whose hands know plants. WIRING: game.js
  // already stores scholar/former occupation as free text (formerOccupation);
  // this list is a loose substring match on purpose.
  const FORAGER_OCCUPATIONS = ['forag', 'botan', 'herbal', 'farm', 'garden', 'chef', 'cook', 'naturalist', 'survivalist'];

  // familiarityFor(scholar, plant) → { level, idShift, yieldMult, note }
  // A forager's background makes local plants easier and foreign biomes
  // harder — outsider difficulty, honest and explainable. scholar may carry
  // originTags (from parseOrigin) or homeRegion free text; plant.regions is
  // the data list (e.g. ['ohio','georgia']).
  function familiarityFor(scholar, plant) {
    const s = scholar || {};
    const tags = new Set();
    for (const t of (s.originTags || [])) tags.add(String(t).toLowerCase());
    for (const tok of String(s.homeRegion || '').toLowerCase().split(/[^a-z]+/)) {
      if (tok.length > 2) tags.add(tok);
    }
    const regions = (plant.regions || []).map(r => String(r).toLowerCase());
    const overlap = regions.filter(r => tags.has(r) || [...tags].some(t => r.includes(t) || t.includes(r)));
    const occ = String(s.formerOccupation || s.occupation || '').toLowerCase();
    const bgSkill = FORAGER_OCCUPATIONS.some(k => occ.includes(k));
    if (overlap.length) {
      return {
        level: 'native', idShift: bgSkill ? -2 : -1, yieldMult: bgSkill ? 1.4 : 1.25,
        note: bgSkill
          ? `${overlap[0]} plants are home to you — and your old hands remember the work. Easier to read, fuller gathers.`
          : `${overlap[0]} plants are home to you. This ground reads the way the land back home did.`
      };
    }
    if (!regions.length) {
      return { level: 'neutral', idShift: bgSkill ? -1 : 0, yieldMult: 1.0,
        note: bgSkill ? 'Your old hands help anywhere — the work is the work.' : 'No home ground to compare against.' };
    }
    return {
      level: 'outsider', idShift: bgSkill ? 0 : 1, yieldMult: bgSkill ? 1.0 : 0.75,
      note: bgSkill
        ? `Nothing here grows like home — but foraging hands adapt. You watch closer than you would back home.`
        : `Nothing here grows like home. You misread the green here; the gathers come up thinner until you learn.`
    };
  }

  // effectiveIdDifficulty(plant, scholar): idDifficulty shifted by familiarity,
  // clamped 1..5. The same plant is a different puzzle for different people.
  function effectiveIdDifficulty(plant, scholar) {
    const base = plant.idDifficulty || 1;
    return Math.max(1, Math.min(5, base + familiarityFor(scholar, plant).idShift));
  }

  // forageModeFor(tile, scholar, codex, plants, opts) → { mode, plantId, why }
  // targeted: you tapped a known bush (opts.forcePlantId) — the plant is
  //   what's actually growing there, guaranteed.
  // deliberate: tile.knownPlant is codex-known (L1+) — the sweep works the
  //   plants you've named, deliberately.
  // blind: everything else — an honest blind shot. The engine does NOT
  //   weight toward plants you can't name; the UI must not either.
  function forageModeFor(tile, scholar, codex, plants, opts) {
    const o = opts || {};
    if (o.forcePlantId && plants.some(x => x.id === o.forcePlantId)) {
      return { mode: 'targeted', plantId: o.forcePlantId,
        why: 'You tapped a known stand — you get what is actually growing there.' };
    }
    const kp = tile.knownPlant;
    const entry = kp && (codex.plants || {})[kp];
    if (kp && entry && entry.level >= 1) {
      return { mode: 'deliberate', plantId: kp,
        why: 'You know this ground — the sweep works the plants you have named.' };
    }
    return { mode: 'blind', plantId: null,
      why: 'You do not know this ground yet — the sweep takes what is green, honest and unnamed.' };
  }

  // forageTableFor(biome, plants, tile, scholar, codex, bounty, mode): the
  // weighted pick table, knowledge-gated. blind: NO knownPlant bonus — place
  // memory without naming is not a targeting bonus. deliberate: identified
  // (L1+) plants get 2.5x — you aim for the good stuff; the named patch
  // (tile.knownPlant) gets 4x. targeted: table is vestigial (forcePlantId
  // wins), built blind for honest previews.
  function forageTableFor(biome, plants, tile, scholar, codex, bounty, mode) {
    const table = {};
    for (const [pid, w] of Object.entries(biome.forageTable || {})) {
      const p = plants.find(x => x.id === pid);
      if (!p) continue;
      const aff = (p.tileAffinity || []).includes(tile.type) ? 2 : 1;
      const fav = (bounty && bounty.favored === pid) ? 4 : 1;
      let know = 1;
      if (mode === 'deliberate') {
        const entry = (codex.plants || {})[pid];
        if (entry && entry.level >= 1) know = 2.5; // named good plants: aimed for
        if (tile.knownPlant === pid) know *= 1.6;  // ~4x on the named patch
      }
      table[pid] = w * aff * fav * know;
    }
    return table;
  }

  // Mode yield multipliers — care, not dice. The knowledgeable gather more
  // from the same ground because their hands know what to take.
  const MODE_YIELD = { blind: 0.7, deliberate: 1.25, targeted: 1.5 };

  // sweepPreview(mode, table, plants, codex): what the UI may honestly show
  // BEFORE the press. "If you don't know, it doesn't show": unknown plants
  // render as their descriptor with kcal '?' — the value is hidden, not
  // invented. WIRING: app.js forage button/panel consumes this.
  function sweepPreview(mode, table, plants, codex) {
    const rows = [];
    for (const pid of Object.keys(table)) {
      const p = plants.find(x => x.id === pid);
      if (!p) continue;
      const entry = (codex.plants || {})[pid];
      const known = !!(entry && entry.level >= 1);
      const showValue = known && (mode === 'deliberate' || mode === 'targeted');
      rows.push({
        plantId: pid, known,
        display: known ? p.name : (p.description || 'an unfamiliar plant'),
        kcalPerUnit: showValue ? p.caloriesPerUnit : null, // null = UI shows "?"
        idDifficulty: p.idDifficulty || 1
      });
    }
    rows.sort((a, b) => (b.known - a.known) || ((b.kcalPerUnit || 0) - (a.kcalPerUnit || 0)));
    return rows;
  }

  // forageCost(scholar): the named cost of a forage press. The button says
  // this; cheap inspection stays cheap because the sweep IS the inspection.
  function forageCost(scholar) {
    const S = global.Scattering;
    const kcal = (S.calories && S.calories.ACTION_COSTS && S.calories.ACTION_COSTS.forage) || 60;
    return { ticks: FORAGE_TICKS, kcal,
      label: `Forage — ${FORAGE_TICKS} ticks, ~${kcal} kcal. A quick sweep; cheap to look, honest about what it finds.` };
  }

  // ── PATCH DEPLETION / REGROWTH ──────────────────────────────────────────
  // A foraged patch depletes; regrowth takes days. Never infinite farming of
  // one tile. Stored on the tile as tile.patch = { depletedAt, regrowAt }.

  // patchStatus(tile, day) → { state: 'fresh'|'depleted', regrowIn, label }
  function patchStatus(tile, day) {
    const p = tile.patch;
    if (p && day < p.regrowAt) {
      const left = p.regrowAt - day;
      return { state: 'depleted', regrowIn: left,
        label: `Picked clean — give it ${left} more day${left === 1 ? '' : 's'}. The woods don't restock on your schedule.` };
    }
    return { state: 'fresh', regrowIn: 0, label: 'Fresh ground — nothing here has been picked clean lately.' };
  }

  // depletePatch(tile, day, regrowDays): call after a successful forage.
  function depletePatch(tile, day, regrowDays) {
    const days = (regrowDays == null) ? PATCH_REGROW_DAYS : regrowDays;
    tile.patch = { depletedAt: day, regrowAt: day + days };
    return tile.patch;
  }

  // regrowCheck(tile, day): true if the patch recovered (clears the marker).
  function regrowCheck(tile, day) {
    if (tile.patch && day >= tile.patch.regrowAt) { delete tile.patch; return true; }
    return false;
  }

  // canForageNow(tile, day): stock AND patch gate. The engine-side answer to
  // "can I work this ground again today?"
  function canForageNow(tile, day) {
    if (!canForage(tile)) return false;
    const p = tile.patch;
    return !(p && day < p.regrowAt);
  }

  // forageSweep(tile, biome, plants, scholar, codex, abilitiesData, bounty, opts):
  // the knowledge-gated sweep. Resolves mode → table → pick → yield, depletes
  // the patch, names its cost, and returns haulLearnData for the codex.
  // Returns null (with .message) when the ground is not workable — never
  // silent: "nothing here" is a result, not an absence.
  // opts: { forcePlantId, mode (override), rng, regrowDays }
  function forageSweep(tile, biome, plants, scholar, codex, abilitiesData, bounty, opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const S = global.Scattering;
    const day = (scholar && scholar.day) || 0;
    const cost = forageCost(scholar);

    if (!canForage(tile)) {
      return { ok: false, mode: 'none', message: 'Nothing left to take here — the stock is gone.', cost,
        why: 'tile.stock is empty or the tile is a ruin.' };
    }
    const ps = patchStatus(tile, day);
    if (ps.state === 'depleted') {
      return { ok: false, mode: 'none', message: ps.label, cost, why: 'patch is regrowing.' };
    }

    const resolved = forageModeFor(tile, scholar, codex, plants, o);
    const mode = o.mode || resolved.mode;
    const table = forageTableFor(biome, plants, tile, scholar, codex, bounty, mode);
    const ids = Object.keys(table);
    if (!ids.length) {
      return { ok: false, mode, message: 'Nothing edible grows in this ground — not even green. Walk on.', cost,
        why: 'forage table is empty for this biome.' };
    }
    let plantId = resolved.plantId;
    if (!(plantId && plants.some(x => x.id === plantId))) plantId = weightedPick(table, rng);
    const plant = plants.find(x => x.id === plantId);

    // YIELD: 5-8 base, then care: mode × familiarity × land × modifiers.
    const mods = S.modifiers.collectModifiers(scholar, abilitiesData || []);
    const ctx = { biome: biome.id };
    let units = 5 + Math.floor(rng() * 4);
    const fam = familiarityFor(scholar, plant);
    units = units * (MODE_YIELD[mode] || 1) * fam.yieldMult;
    if (bounty && bounty.richness) units *= bounty.richness;
    units = S.modifiers.resolve(units, 'forage.yield', mods, ctx);
    units = Math.round(units * S.modifiers.resolve(1, 'luck.global', mods, ctx));
    if (tile.compost) units = Math.round(units * 1.1);
    units = Math.max(1, Math.round(units));

    const entry = (codex.plants || {})[plantId];
    const known = !!(entry && entry.level >= 1);
    const firstFind = !(codex.plants[plantId] && codex.plants[plantId].identifiedDay);
    const kcal = units * plant.caloriesPerUnit;
    const preview = sweepPreview(mode, { [plantId]: 1 }, plants, codex)[0];

    // The ground is worked: deplete the patch. No farming one tile forever.
    const patch = depletePatch(tile, day, o.regrowDays);

    // NO SILENT ACTIONS: the message says the mode, the take, the cost, and
    // the consequence. Blind sweeps are honest about being blind.
    let message;
    if (mode === 'targeted') {
      message = `You work the ${plant.name} stand with practiced hands: ${units}× ${plant.unit} (+${kcal} kcal). This patch is picked clean — back in ${patch.regrowAt - day} days. (${cost.ticks} ticks, ~${cost.kcal} kcal.)`;
    } else if (mode === 'deliberate') {
      message = known
        ? `You work the patch you know: ${units}× ${plant.unit} of ${plant.name} (+${kcal} kcal).${fam.level === 'native' ? ' Home ground feeds you well.' : ''} Picked clean — it recovers in ${patch.regrowAt - day} days. (${cost.ticks} ticks, ~${cost.kcal} kcal.)`
        : `You work the patch: ${units}× ${preview.display} — you can't name it yet. Into the bag, unnamed. (Not food until identified — sort them at camp.) Picked clean for ${patch.regrowAt - day} days. (${cost.ticks} ticks, ~${cost.kcal} kcal.)`;
    } else {
      message = known
        ? `A sweep of unfamiliar ground turns up something you know: ${units}× ${plant.name} (+${kcal} kcal). Lucky — or the land likes you. Picked clean for ${patch.regrowAt - day} days. (${cost.ticks} ticks, ~${cost.kcal} kcal.)`
        : `A shot in the dark — you take what's green: ${units}× ${preview.display}. Into the bag, unnamed. (Not food until identified.) ${fam.note} This patch is picked clean for ${patch.regrowAt - day} days. (${cost.ticks} ticks, ~${cost.kcal} kcal.)`;
    }

    return {
      ok: true, plantId, units, kcal, mode, known, firstFind, cost,
      familiarity: fam, preview, message, why: resolved.why,
      regrowAt: patch.regrowAt,
      // WIRING: hand this to the codex identify/learn-more flow (codex.js /
      // game.js plantKnowledge). The engine stages the data; it never writes
      // codex state itself.
      learnData: haulLearnData(plant, codex, day, units)
    };
  }

  // haulLearnData(plant, codex, day, units): what a successful haul teaches.
  // isFirstFind flags the identify beat; teachable stages the knowledgeLevels
  // the forager is ready for (up to current+1 — the next lesson peeks out).
  // WIRING: codex identify flow consumes this to stage learn-more beats.
  function haulLearnData(plant, codex, day, units) {
    const entry = (codex.plants || {})[plant.id] || {};
    const level = entry.level || 0;
    const isFirstFind = !entry.identifiedDay;
    const teachable = [];
    const kl = plant.knowledgeLevels || {};
    for (let l = 1; l <= Math.min(level + 1, 4); l++) {
      if (kl[String(l)]) teachable.push({ level: l, text: kl[String(l)], locked: l > level });
    }
    return {
      plantId: plant.id, isFirstFind, level,
      identifiedDay: entry.identifiedDay || (isFirstFind ? day : null),
      units,
      teachable, // WIRING: codex UI renders text; locked:true marks the "learn more" beat
      suggestedXp: isFirstFind ? 2 : 1, // WIRING: progression/knowledge XP hooks
      // WIRING: the haul-home ritual (game.js) consumes isFirstFind to stage
      // the identify beat; parts/uses unlock at the levels knowledgeLevels defines.
      beat: isFirstFind ? 'identify' : (level < 4 ? 'learn-more' : 'mastery')
    };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.forage = { forage, canForage, weightedPick,
    familiarityFor, effectiveIdDifficulty, forageModeFor, forageTableFor,
    sweepPreview, forageCost, patchStatus, depletePatch, regrowCheck,
    canForageNow, forageSweep, haulLearnData, FORAGE_TICKS, PATCH_REGROW_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
