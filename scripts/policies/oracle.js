// policies/oracle.js — ORACLE variant of winseek (2026-10-10, competence panel).
//
// Same win-seeking shape as winseek (roads 1-6: hunt, contests, scale, crises,
// sentiment/feast, integration, table) but with 3 hand-tuned greedy
// improvements chosen from the utilization gaps the panel measures:
//
//  1. WIN-PROBABILITY FIGHT ASSESSMENT. winseek flees on a crude HP-ratio
//     heuristic (totalMhp > 3.5x player maxHp, or wave>=2 at <60% HP) — it
//     flees fights it would probably WIN. The oracle estimates honest
//     turns-to-kill both ways from real def bands (monster attack.damage +
//     hp; player strike roll [10,16] + weapon bonus, feastburn multiplier,
//     monster armor) and ENGAGES when favored (playerTTK <= 1.25x
//     monsterTTK), flees only when genuinely outmatched. A favored fight is
//     always taken, never fled.
//  2. ARM UP + COMBAT OPENERS. winseek/competent fight unarmed at range 1
//     unless the scholar happens to hold gear (autoEquip runs once at
//     spawn). The oracle equips the best available weapon before engaging
//     (melee AND ranged — sling/bow reach flyers) and fires one held combat
//     ability at fight start (always execute the known opener). NOTE: the
//     game's `counter` mechanic is DORMANT — monsterCounterKnown requires a
//     `counter` field on the monster def and NO def carries one (verified
//     2026-10-10, waveLedger.js) — so "execute a known counter" is
//     unavailable to every policy; openers are the honest substitute.
//  3. AID WHEN STRUGGLING. Accept pending aid quests, hand in completable
//     fetch quests, run the aid-quest check hooks, spend relief options
//     (triage/hunt, rations only with a pantry buffer) — the safetynets are
//     struggling-gated and a struggling village that refuses offered help is
//     just dying with extra steps.
//
// This is an upper-bound instrument, not a design proposal: if the oracle
// wins far more than winseek, the POLICY is the bottleneck. If the oracle
// also gets ~0 wins, the GAME is the bottleneck.
'use strict';
const { winseek } = require('./winseek');

function monstersOf(f) {
  try { return f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0); }
  catch (e) { return []; }
}

function mdefOf(Game, m) {
  try { return ((Game.data || {}).monsters || []).find(d => d.id === m.monsterId) || null; }
  catch (e) { return null; }
}

// --- Improvement 2a: arm up ------------------------------------------------
// Equip the best available weapon (and armor) from the scholar's inventory.
function armUp(Game, ctx) {
  try {
    const sch = Game.state.scholar;
    if (!sch) return;
    const S = (globalThis.Scattering || {});
    if (S.equipment && typeof S.equipment.autoEquip === 'function') {
      S.equipment.autoEquip(sch, Game.data.items);
      ctx.armedUp = (ctx.armedUp || 0) + 1;
      return;
    }
    // Fallback: manual best-weapon equip.
    const inv = sch.inventory || [];
    let best = -1, bestScore = -1;
    for (let i = 0; i < inv.length; i++) {
      const def = (Game.data.items || []).find(d => d.id === (inv[i].itemId || inv[i].id));
      const w = def && def.weapon;
      if (!w) continue;
      const score = (w.bonus || 0) + (w.range || 1) * 2;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0 && Game.equip) {
      const def = (Game.data.items || []).find(d => d.id === ((inv[best] || {}).itemId || (inv[best] || {}).id));
      const slot = (def && def.weapon && def.weapon.range > 1) ? 'ranged' : 'melee';
      try { Game.equip(best, slot); ctx.armedUp = (ctx.armedUp || 0) + 1; } catch (e) {}
    }
  } catch (e) {}
}

// --- Improvement 2b: combat openers ----------------------------------------
// Fire one held combat-context ability at fight start (the known opener).
// Costs are real; context/cost validation is the engine's. Once per fight.
function fireOpener(Game, ctx, f) {
  try {
    if (ctx._openerFired === f) return;
    ctx._openerFired = f;
    const held = ((Game.state.scholar || {}).abilities || []).map(a => a && (a.id || a)).filter(Boolean);
    if (!held.length) return;
    const defs = (Game.data || {}).abilities || [];
    const tgt = monstersOf(f).slice().sort((a, b) => (a.hp || 0) - (b.hp || 0))[0];
    let fired = 0;
    for (const aid of held) {
      if (fired >= 2) break;
      const def = defs.find(d => d.id === aid);
      if (!def || !def.actions) continue;
      for (const ac of def.actions) {
        if (ac.context !== 'combat') continue;
        try {
          const r = Game.activateAbility(aid + '.' + ac.id, tgt ? tgt.key : null);
          if (r !== false && r !== undefined && r !== null) {
            ctx.openers = (ctx.openers || 0) + 1;
            fired++;
            break;
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

// --- Improvement 1: win-probability assessment ------------------------------
// Honest turns-to-kill both ways. Player strike: roll [10,16] + weapon bonus,
// feastburn multiplier, minus monster flat armor. Monster: avg of
// attack.damage band per round. Focus fire weakest-first (player side);
// monsters all hit (monster side). Engage when favored.
function assessFight(Game, f) {
  try {
    const p = Game.tbFighter('p');
    const pHp = p.hp || 1, pMax = p.maxHp || pHp || 1;
    const w = (Game.equippedWeapon && Game.equippedWeapon()) || { bonus: 0 };
    let fbMult = 1;
    try { const fb = Game.feastBurn ? Game.feastBurn() : 0; if (fb > 0) fbMult = fb; } catch (e) {}
    const baseStrike = 13 + (w.bonus || 0);
    const monsters = monstersOf(f);
    if (!monsters.length) return { favored: true, playerTTK: 0, monsterTTK: 99, reason: 'no-monsters' };
    // Unhittable: every monster airborne and we have no reach.
    let allAir = true;
    for (const m of monsters) {
      let air = false;
      try { air = !!(Game.flyerAirborne && Game.flyerAirborne(m) && Game.encUsesFifo && Game.encUsesFifo(m)); } catch (e) {}
      if (!air) { allAir = false; break; }
    }
    if (allAir && (w.range || 1) <= 2) {
      return { favored: false, playerTTK: 99, monsterTTK: 1, reason: 'airborne-unreachable' };
    }
    let totalMhp = 0, totalMDpt = 0;
    for (const m of monsters) {
      const md = mdefOf(Game, m) || {};
      const mhp = m.hp || 1;
      totalMhp += mhp;
      const armor = md.armor || 0;
      const perHit = Math.max(1, Math.round(baseStrike * fbMult) - armor);
      m._oracleHits = Math.max(1, Math.ceil(mhp / perHit));
      const dmg = (md.attack && md.attack.damage) || [8, 12];
      const lo = Array.isArray(dmg) ? dmg[0] : dmg, hi = Array.isArray(dmg) ? dmg[1] : dmg;
      totalMDpt += (lo + hi) / 2;
    }
    // Focus fire: kill weakest first; each kill removes its DPT.
    const order = monsters.slice().sort((a, b) => (a._oracleHits || 1) - (b._oracleHits || 1));
    let rounds = 0, incoming = 0, aliveDpt = totalMDpt;
    for (const m of order) {
      rounds += (m._oracleHits || 1);
      incoming += aliveDpt * (m._oracleHits || 1);
      const dmg = ((mdefOf(Game, m) || {}).attack || {}).damage || [8, 12];
      const lo = Array.isArray(dmg) ? dmg[0] : dmg, hi = Array.isArray(dmg) ? dmg[1] : dmg;
      aliveDpt -= (lo + hi) / 2;
    }
    const playerTTK = rounds;
    const monsterTTK = totalMDpt > 0 ? pHp / totalMDpt : 99;
    const hpPct = pHp / Math.max(1, pMax);
    const favored = playerTTK <= 1.25 * monsterTTK;
    return { favored, playerTTK, monsterTTK, hpPct, reason: favored ? 'favored' : 'outmatched' };
  } catch (e) {
    return { favored: false, playerTTK: 99, monsterTTK: 1, reason: 'assess-error' };
  }
}

function deedValue(Game, f) {
  // Same strategic gate as winseek: only risk death where there's deed value.
  try {
    const g = Game.deedGateReady ? Game.deedGateReady() : null;
    if (!g) return true;
    const bars = [0, 5, 5, 4, 3, 2];
    const counts = [0, g.w1, g.w2, g.w3, g.w4, g.w5];
    const monsters = monstersOf(f);
    if (!monsters.length) return false;
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    let value = false;
    for (const m of monsters) {
      const md = mdefOf(Game, m);
      const wv = (md && md.wave) || 1;
      const barOpen = (counts[wv] || 0) < (bars[wv] || 99);
      const unfaced = !faced[m.monsterId];
      if (barOpen || unfaced) { value = true; break; }
    }
    return value;
  } catch (e) { return true; }
}

function oracleFight(Game, ctx) {
  try {
    const f = Game.tbfight;
    if (!f || f.over || !Game.tbIsPlayerTurn()) return false;
    const p = Game.tbFighter('p');
    const hpPct = (p.hp || 0) / Math.max(1, p.maxHp || p.hp || 1);
    const endTurn = () => {
      try {
        const q = Game.tbFighter('p');
        q.moveLeft = 0; q.acted = true;
        Game.tbAfterPlayerAction();
      } catch (e) {}
    };
    // pushThrough: the REAL flee. Walking to the grid edge via
    // tbPlayerMove never ends a fight against chasers (the barrier exit is
    // a deliberate push THROUGH the edge — tbBarrierExit). Try the edge
    // we're on first, then the other three.
    const pushThrough = () => {
      if (!Game.tbBarrierExit) return false;
      try {
        const q = Game.tbFighter('p');
        if (!q) return false;
        const dirs = [];
        if (q.mx === 0) dirs.push([-1, 0]);
        if (q.mx === 8) dirs.push([1, 0]);
        if (q.my === 0) dirs.push([0, -1]);
        if (q.my === 8) dirs.push([0, 1]);
        dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        for (const [dx, dy] of dirs) {
          try {
            if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && Game.tbBarrierExit(dx, dy)) {
              ctx.barrierExits = (ctx.barrierExits || 0) + 1;
              return true;
            }
          } catch (e) {}
          if (!Game.tbfight || Game.tbfight.over) return true;
        }
      } catch (e) {}
      return false;
    };
    const flee = (why) => {
      try {
        const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
        // Already on an edge: push through first (no point pacing).
        if (px === 0 || px === 8 || py === 0 || py === 8) pushThrough();
        if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) {
          const tx = px <= 4 ? 0 : 8;
          try { Game.tbPlayerMove(tx, py); } catch (e) {}
          // Landed on the edge: push through now.
          pushThrough();
        }
        ctx.fled = (ctx.fled || 0) + 1;
        ctx['fled_' + why] = (ctx['fled_' + why] || 0) + 1;
      } catch (e) {}
      endTurn();
      return true;
    };
    // FIGHT-START (once per fight): arm up, fire the opener, assess honestly.
    if (ctx._fightObj !== f) {
      ctx._fightObj = f;
      armUp(Game, ctx);
      fireOpener(Game, ctx, f);
      const a = assessFight(Game, f);
      ctx._assess = a;
      ctx.assessments = (ctx.assessments || 0) + 1;
      // Near-death: no assessment saves you — leave.
      if (hpPct < 0.3) return flee('neardeath');
      // No deed value: no reason to bleed (winseek's strategic gate).
      if (!deedValue(Game, f)) return flee('nodeed');
      // Genuinely outmatched: leave. Favored or even: STAY (this is the
      // improvement — winseek's crude heuristic fled these).
      if (!a.favored) { ctx.fledOutmatched = (ctx.fledOutmatched || 0) + 1; return flee('outmatched'); }
      ctx.engagedFavored = (ctx.engagedFavored || 0) + 1;
    }
    // Mid-fight: if it turned (hp collapsed), re-assess cheaply.
    if (hpPct < 0.3) return flee('neardeath');
    const alive = monstersOf(f).slice().sort((a, b) => (a.hp || 0) - (b.hp || 0));
    if (!alive.length) return false;
    const tgt = alive[0];
    const px = p.mx != null ? p.mx : 4, py = p.my != null ? p.my : 4;
    const tmx = tgt.mx != null ? tgt.mx : 4, tmy = tgt.my != null ? tgt.my : 4;
    try {
      const w = (Game.equippedWeapon && Game.equippedWeapon()) || { range: 1 };
      const d0 = Math.max(Math.abs(tmx - px), Math.abs(tmy - py));
      if (d0 > (w.range || 1)) {
        const occupied = new Set(
          f.fighters.filter(x => x.alive && x.key !== 'p').map(x => x.mx + ',' + x.my));
        let bx = null, by = null, bd = 1e9;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const cx = tmx + dx, cy = tmy + dy;
          if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
          if (occupied.has(cx + ',' + cy)) continue;
          const dd = Math.max(Math.abs(cx - px), Math.abs(cy - py));
          if (dd < bd) { bd = dd; bx = cx; by = cy; }
        }
        if (bx != null) { try { Game.tbPlayerMove(bx, by); } catch (e) {} }
        endTurn();
        return true;
      }
    } catch (e) {}
    try { Game.tbPlayerStrike(tgt.key); ctx.struck = (ctx.struck || 0) + 1; } catch (e) {}
    endTurn();
    return true;
  } catch (e) { return false; }
}

// --- Improvement 3: aid when struggling -------------------------------------
function aidRoad(Game, ctx) {
  try {
    const st = Game.state || {};
    if (st.pendingAidQuest && Game.answerAidQuest) {
      try { Game.answerAidQuest('accept'); ctx.aidAccepted = (ctx.aidAccepted || 0) + 1; } catch (e) {}
    }
  } catch (e) {}
  try { if (Game.aidQuestCheckTreat) Game.aidQuestCheckTreat(); } catch (e) {}
  try { if (Game.aidQuestCheckLearn) Game.aidQuestCheckLearn(); } catch (e) {}
  try {
    if (st_activeAidQuest(Game) && Game.handInAidQuest) {
      const r = Game.handInAidQuest();
      if (r && r !== 'short' && r !== null) ctx.aidHanded = (ctx.aidHanded || 0) + 1;
    }
  } catch (e) {}
  try {
    const rel = (Game.state || {}).relief;
    if (rel && Game.answerRelief) {
      let pantry = 0;
      try { pantry = Game.pantryKcalLive ? Game.pantryKcalLive(Game.state.village) : 0; } catch (e2) {}
      for (const opt of ['triage', 'hunt', 'rations']) {
        if ((rel.used || {})[opt]) continue;
        if (opt === 'rations' && pantry < 4000) continue; // morale cost needs a buffer
        let r = null;
        try { r = Game.answerRelief(opt); } catch (e2) {}
        if (r && ['used', 'noneed', 'short', null].indexOf(r) < 0) { ctx.reliefSpent = (ctx.reliefSpent || 0) + 1; break; }
      }
    }
  } catch (e) {}
}

function st_activeAidQuest(Game) {
  try { return !!Game.state.activeAidQuest; } catch (e) { return false; }
}

const oracle = {
  id: 'oracle',
  desc: 'oracle: winseek + win-probability fight assessment + arm-up/openers + always-accept-aid-when-struggling',
  setup(Game, ctx) { if (winseek.setup) winseek.setup(Game, ctx); },
  upkeep(Game, ctx) {
    if (winseek.upkeep) winseek.upkeep(Game, ctx);
    armUp(Game, ctx); // stay armed (gear changes across the run)
  },
  daily(Game, ctx) {
    if (winseek.daily) winseek.daily(Game, ctx);
    aidRoad(Game, ctx);
    try {
      const pg = Game.progState ? Game.progState() : {};
      ctx._sq = pg.systemQuests || 0;
      ctx._integ = (Game.state.scholar || {}).integration || 0;
    } catch (e) {}
  },
  fight(Game, ctx) {
    try { if (oracleFight(Game, ctx)) return true; } catch (e) {}
    return false;
  },
  contest(Game, ctx) { return false; },
};

module.exports = { oracle };
