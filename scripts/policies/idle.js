// policies/idle.js — ported idle-village policies (Steve 2026-10-09).
// zero: pure freeloader (eat + sleep). mvc: minimum viable contribution
// (one honest forage trip when the takes/gives ledger slips below -2000).
// leader: no personal work, but each dawn assigns every free villager to forage.
// All run through the shared sim-harness policy interface.
'use strict';

function playerEat(Game) {
  const s = Game.state.scholar, vv = Game.state.village;
  try {
    if (s.kcal < Game.kcalCap() * 0.85) {
      let guard = 0;
      while (s.kcal < Game.kcalCap() * 0.95 && (vv.pantry || []).length && guard++ < 20) {
        try { Game.takeFromPantry(0); } catch (e) { break; }
      }
      try { Game.eat(); } catch (e) {}
    }
  } catch (e) {}
}

function ledgerNet(Game) {
  try {
    const vv = Game.state.village, vid = Game.villagerId;
    const takes = ((vv.takes || {})[vid]) || 0;
    const gives = ((vv.gives || {})[vid]) || 0;
    return gives - takes;
  } catch (e) { return 0; }
}

// Honest forage trip: travel to nearest stocked wild tile, forage, donate
// ONLY the new haul, travel back. (Haven grounds have no stock — by design.)
function forageTrip(Game, ctx) {
  const s = Game.state.scholar;
  try {
    const before = new Map((s.inventory || []).map(i => [(i.name + '|' + (i.plantId || '')), (i.units || 0)]));
    let bx = null, by = null, bd = 99;
    for (const tt of (Game.travelTargets() || [])) {
      const t = Game.tileAt(tt.x, tt.y);
      if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
      if (tt.d < bd) { bd = tt.d; bx = tt.x; by = tt.y; }
    }
    if (bx === null) return 0;
    const hx = Game.map.px, hy = Game.map.py;
    Game.travelTo(bx, by);
    if (Game.over || Game.tbfight) { try { Game.travelTo(hx, hy); } catch (e) {} return 0; }
    try { Game.doAction('forage', {}); } catch (e) {}
    let haul = 0;
    const inv = s.inventory || [];
    for (let i = inv.length - 1; i >= 0; i--) {
      const key = inv[i].name + '|' + (inv[i].plantId || '');
      const had = before.get(key) || 0;
      const now = inv[i].units || 0;
      if (now > had && (inv[i].kcalEach || 0) > 0 && inv[i].edible !== false) {
        haul += (inv[i].kcalEach || 0) * (now - had);
        try { Game.donateToPantry(i); } catch (e) {}
      }
    }
    if (ctx) { ctx.forageTrips = (ctx.forageTrips || 0) + 1; ctx.forageKcal = (ctx.forageKcal || 0) + haul; }
    try { Game.travelTo(hx, hy); } catch (e) {}
    return haul;
  } catch (e) { try { Game.travelTo(Game.map.px, Game.map.py); } catch (e2) {} return 0; }
}

const zero = {
  id: 'zero',
  desc: 'pure freeloader control: eat, sleep, nothing else',
  upkeep(Game) { playerEat(Game); },
};

const mvc = {
  id: 'mvc',
  desc: 'minimum viable contribution: eat fair share, one honest forage trip when ledger < -2000',
  upkeep(Game, ctx) {
    playerEat(Game);
    if (!ctx.mvcDoneToday && ledgerNet(Game) < -2000) {
      ctx.mvcDoneToday = true;
      forageTrip(Game, ctx);
    }
  },
  daily(Game, ctx) { ctx.mvcDoneToday = false; },
};

const leader = {
  id: 'leader',
  desc: 'no personal work; assigns every free villager to forage',
  setup(Game) {
    const vv = Game.state.village;
    for (const id of (vv.roster || [])) {
      if (id === Game.villagerId) continue;
      if ((vv.assignments || {})[id]) continue;
      try { Game.assignTask(id, 'forage'); } catch (e) {}
    }
  },
  upkeep(Game) { playerEat(Game); },
};

module.exports = { zero, mvc, leader, playerEat, ledgerNet, forageTrip };
