// @ontology
// system: calorie-engine
// description: The master clock. Every cost in the game flows through here. Needs never decrease with level; power costs calories.
// provides:
//   - BASE_BMR (code: calories.js)
//   - ACTIVE_DAY (code: calories.js)
//   - ACTION_COSTS (code: calories.js)
//   - dailyNeed(scholar)
//   - resolveDay(scholar, village)
// rules:
//   - (none documented)
// consumes:
//   - (none documented)
/* The master clock. Every cost in the game flows through here.
   Thesis enforcement: needs never decrease with level; power costs calories. */
(function (global) {
  'use strict';

  const BASE_BMR = 1800;          // kcal/day at rest
  const ACTIVE_DAY = 2200;       // typical expedition day
  const STARVATION_THRESHOLD = 500; // kcal reserve below which the spiral starts

  const ACTION_COSTS = {
    forage: 60, hunt: 240, craft: 100, explore: 160, // forage is a quick 16-tick beat now: 60 kcal effort, not 120
    rest: -200,           // recovers (negative cost)
    treat_water: 50, travel_leg: 320,
    combat_round: 100, system_ability: 800, // power is expensive
  };

  function dailyNeed(scholar) {
    // BMR + activity; injuries and heavy abilities raise it. Never lowers with level.
    let need = ACTIVE_DAY;
    (scholar.injuries || []).forEach(() => { need += 150; });
    return need;
  }

  // Apply one day's metabolic reality. Returns {ok, warnings[]}.
  // Warnings telegraph the spiral BEFORE it arrives (design rule).
  function resolveDay(scholar, village) {
    const warnings = [];
    const need = dailyNeed(scholar);
    scholar.kcal -= need;
    scholar.hydration -= 35;
    if (scholar.kcal < 0) {
      const deficit = -scholar.kcal;
      scholar.health -= Math.min(25, 2 + deficit / 150);
      scholar.energy = Math.max(0, scholar.energy - 25);
      warnings.push('STARVING: health and energy falling. The spiral has started.');
    } else if (scholar.kcal < STARVATION_THRESHOLD) {
      warnings.push('WARNING: reserves critical. Eat tomorrow or the spiral begins.');
    }
    if (scholar.hydration <= 0) {
      scholar.hydration = 0;
      scholar.health -= 15;
      scholar.energy = Math.max(0, scholar.energy - 30);
      warnings.push('DEHYDRATED: find and treat water today.');
    }
    // floors: the body bottoms out at 0. Death is checked via ok, not negative numbers.
    // (Negative kcal/hp are display/logic noise — the spiral already did its damage above.)
    scholar.kcal = Math.max(0, scholar.kcal);
    scholar.health = Math.max(0, scholar.health);
    // village metabolism lives in game.js (villageEats) — single owner, tuned net drain.
    // the engine only runs the scholar's own body here.
    return { ok: scholar.health > 0, warnings };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.calories = { BASE_BMR, ACTIVE_DAY, ACTION_COSTS, dailyNeed, resolveDay };
})(typeof window !== 'undefined' ? window : globalThis);
