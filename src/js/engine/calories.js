/* The master clock. Every cost in the game flows through here.
   Thesis enforcement: needs never decrease with level; power costs calories. */
(function (global) {
  'use strict';

  const BASE_BMR = 1800;          // kcal/day at rest
  const ACTIVE_DAY = 2200;       // typical expedition day
  const STARVATION_THRESHOLD = 500; // kcal reserve below which the spiral starts

  const ACTION_COSTS = {
    forage: 150, hunt: 300, craft: 120, explore: 200,
    rest: -200,           // recovers (negative cost)
    treat_water: 60, travel_leg: 400,
    combat_round: 120, system_ability: 800, // power is expensive
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
    // village eats too — 2200 kcal per living villager per day
    const mouths = village.villagers.length;
    village.pantryKcal -= mouths * 2200;
    if (village.pantryKcal < 0) {
      village.pantryKcal = 0;
      warnings.push('VILLAGE HUNGRY: the pantry is empty. Someone will weaken soon.');
    }
    return { ok: scholar.health > 0, warnings };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.calories = { BASE_BMR, ACTIVE_DAY, ACTION_COSTS, dailyNeed, resolveDay };
})(typeof window !== 'undefined' ? window : globalThis);
