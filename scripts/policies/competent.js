// policies/competent.js — plays like an aware, experienced player (Steve 2026-10-09).
// Heuristics, not optimal. Genuinely trying to win: learns plants, teaches,
// cooks everything, avoids disease vectors, fights only with advantage,
// keeps the takes/gives ledger honest. This is the skill-ceiling seed.
'use strict';
const idle = require('./idle');

function nearFire(Game) {
  try { return Game.nearFire(); } catch (e) { return false; }
}

// Cook every raw item in the pack when a fire is near. Raw = disease risk.
function cookPack(Game, ctx) {
  if (!nearFire(Game)) return 0;
  let cooked = 0;
  try {
    const inv = Game.state.scholar.inventory || [];
    for (let i = inv.length - 1; i >= 0; i--) {
      const it = inv[i];
      if (it && it.foodState === 'raw' && it.kcalEach > 0) {
        try { Game.cookFood(i); cooked++; } catch (e) {}
        if (cooked >= 6) break; // don't burn the whole day-part
      }
    }
  } catch (e) {}
  if (cooked) ctx.cooked = (ctx.cooked || 0) + cooked;
  return cooked;
}

// Safe water: fill when near a source, boil first (needs fire or beard_moss),
// then drink. An experienced player never drinks risky water raw.
function drinkSafe(Game, ctx) {
  try {
    const s = Game.state.scholar;
    // fill a bottle when the tile offers water
    try {
      const t = Game.playerTile ? Game.playerTile() : null;
      if (t && /creek|well|spring|river|pond/i.test(t.type || '') && (s.water || []).length < 3) {
        try { Game.fillWater(); } catch (e) {}
      }
    } catch (e) {}
    if ((s.hydration || 0) >= 70) return;
    if (!(s.water || []).length) return;
    try { Game.boilWater(); } catch (e) {}
    try { Game.doAction('drink'); ctx.drank = (ctx.drank || 0) + 1; } catch (e) {}
  } catch (e) {}
}

// Ticks: check after wilderness time; remove cleanly only when skilled.
// Blind yanks botch into wound_fever — an experienced player knows that.
function checkTicks(Game, ctx) {
  try {
    const list = Game.seList ? Game.seList('scholar') : [];
    const tick = (list || []).find(e => e.id === 'tick_attached');
    if (!tick) return;
    const knows = !!((Game.state.codex || {}).techniques || {}).tick_removal ||
      (Game.hasAbility && (Game.hasAbility('triage') || Game.hasAbility('field_medicine') || Game.hasAbility('herbal_remedy')));
    if (knows) {
      try { Game.removeTick(); ctx.ticksRemoved = (ctx.ticksRemoved || 0) + 1; } catch (e) {}
    } else {
      ctx.ticksIgnored = (ctx.ticksIgnored || 0) + 1;
    }
  } catch (e) {}
}

// Teach: pass known plants to villagers who don't know them.
// Knowledge → food → power starts with someone knowing the plants.
function teachRound(Game, ctx) {
  try {
    const known = Object.keys((Game.state.codex || {}).plants || {});
    if (!known.length) return;
    const vv = Game.state.village;
    const roster = (vv.roster || []).filter(id => id !== Game.villagerId);
    if (!roster.length) return;
    let taught = 0;
    for (const pid of known.slice(0, 3)) { // a few per day, not a lecture marathon
      for (const vid of roster) {
        let vk = [];
        try { vk = (vv.plantKnowledge && vv.plantKnowledge[vid]) || []; } catch (e) {}
        if (!vk.includes(pid)) {
          try { if (Game.teachPlant(vid, pid)) { taught++; break; } } catch (e) {}
        }
      }
      if (taught >= 2) break;
    }
    if (taught) ctx.taught = (ctx.taught || 0) + taught;
  } catch (e) {}
}

// Talk: one real conversation a day. Relationships are the other economy.
function talkRound(Game, ctx) {
  try {
    const vv = Game.state.village;
    const roster = (vv.roster || []).filter(id => id !== Game.villagerId);
    if (!roster.length || !Game.talkTo) return;
    const vid = roster[Math.floor(Math.random() * roster.length)];
    try {
      Game.talkTo(vid);
      try { Game.endConvo(vid, 'left'); } catch (e2) {} // don't leave modal state open
      ctx.talked = (ctx.talked || 0) + 1;
    } catch (e) {}
  } catch (e) {}
}

// Forage when it matters: pantry low or personal reserves low.
// An experienced player doesn't wait for the ledger to scream.
function needTrip(Game) {
  try {
    const pantry = ((Game.state.village || {}).pantry || [])
      .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const s = Game.state.scholar;
    return pantry < 25000 || s.kcal < Game.kcalCap() * 0.5;
  } catch (e) { return false; }
}

const competent = {
  id: 'competent',
  desc: 'aware experienced player: learns, teaches, cooks, avoids vectors, fights with advantage',
  setup(Game, ctx) {
    ctx.knownAtStart = Object.keys((Game.state.codex || {}).plants || {}).length;
  },
  upkeep(Game, ctx) {
    cookPack(Game, ctx);
    idle.playerEat(Game);
    drinkSafe(Game, ctx);
    checkTicks(Game, ctx);
  },
  daily(Game, ctx) {
    if (needTrip(Game)) idle.forageTrip(Game, ctx);
    // donate surplus beyond a 2-day personal buffer
    try {
      const s = Game.state.scholar;
      const cap = Game.kcalCap();
      if (s.kcal > cap * 1.5) {
        const inv = s.inventory || [];
        for (let i = inv.length - 1; i >= 0; i--) {
          if ((inv[i].kcalEach || 0) > 0 && inv[i].foodState !== 'raw') {
            try { Game.donateToPantry(i); ctx.donated = (ctx.donated || 0) + 1; break; } catch (e) {}
          }
        }
      }
    } catch (e) {}
    teachRound(Game, ctx);
    talkRound(Game, ctx);
    const known = Object.keys((Game.state.codex || {}).plants || {}).length;
    ctx.knownPlants = known;
  },
  // Fight only with advantage: below 35% HP, walk to the edge (flee-by-barrier).
  // Otherwise strike the weakest live monster.
  fight(Game, ctx) {
    try {
      const f = Game.tbfight;
      if (!f || f.over || !Game.tbIsPlayerTurn()) return false;
      const p = Game.tbFighter('p');
      const hpPct = (p.hp || 0) / Math.max(1, p.maxHp || p.hp || 1);
      if (hpPct < 0.35) {
        // retreat toward the nearest edge — the barrier ends pursuit honestly
        const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
        const tx = px <= 4 ? 0 : 8;
        try { Game.tbPlayerMove(tx, py); ctx.fled = (ctx.fled || 0) + 1; } catch (e) {}
        try {
          const q = Game.tbFighter('p');
          q.moveLeft = 0; q.acted = true;
          Game.tbAfterPlayerAction();
        } catch (e) {}
        return true;
      }
      const alive = f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0);
      if (!alive.length) return false;
      alive.sort((a, b) => (a.hp || 0) - (b.hp || 0));
      try { Game.tbPlayerStrike(alive[0].key); ctx.struck = (ctx.struck || 0) + 1; } catch (e) {}
      return true;
    } catch (e) { return false; }
  },
};

module.exports = { competent };
