/* Day resolution order. The turn structure — one day, one turn.
   Order is load-bearing; document changes in DECISIONS.md. */
(function (global) {
  'use strict';

  // A day:
  //   1. MORNING — status check, System message roll, weather
  //   2. ACTIONS — player spends AP (4): forage/hunt/craft/explore/rest/treat_water
  //   3. EVENING — eat (player allocates food), spoilage tick, water check
  //   4. METABOLISM — calories.resolveDay (scholar + village)
  //   5. VILLAGE TICK — 1 expedition day = 1 village day (morale, projects, events)
  //   6. NIGHT — save, codex updates, death check
  //
  // Slice 1 implements: morning status, 4 AP actions (forage/rest/treat_water/explore),
  // evening eat, metabolism, save. Village tick, hunting, crafting, events arrive later.

  const PHASES = ['morning', 'actions', 'evening', 'metabolism', 'village', 'night'];

  function newDay(scholar) {
    scholar.day += 1;
    scholar.ap = 4;
    return { day: scholar.day, phase: 'morning', log: [] };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.day = { PHASES, newDay };
})(typeof window !== 'undefined' ? window : globalThis);
