// policies/oracle-v2.js — ORACLE-V2 (win-rate iteration round 3, 2026-10-10).
//
// oracle + greedy use of the deep systems the round-2 competence panel found
// untouched (abilities ~0/run, synergies <1/run, counter-kills 0%,
// crafts/traps 0/240 runs). A MEASUREMENT INSTRUMENT, not shipped AI: if a
// systems-engaged policy wins where oracle got 0/60, the deep systems are
// load-bearing and the game needs them reachable. If it also gets ~0 wins,
// the game is the bottleneck even for a player who uses everything.
//
// Five greedy systems engagements (every mechanic read from data/code —
// nothing invented):
//  1. IN-FIGHT ABILITIES: per-turn priority — brace when outmatched/hurt,
//     shake_off when statused, field medicine when wounded, war cry vs
//     crowds, loom as the fear_itself leg, haymaker/take_aim/ambush/rage/
//     dead_aim when favored (arm-then-strike 2-turn combos; the strike
//     engine consumes the armed flags), read_stance/pocket_sand/leech/
//     scream as further favored options. Every real use is also a synergy
//     attempt (gainAbilityXP -> noteAbilityUse -> checkSynergyDiscovery).
//  2. OUT-OF-COMBAT PRACTICE: fire safe explore/camp actions once/day
//     (tracker.track, game_sense.read_sign, patient_aim.clean_shot,
//     ambush.lay_wait, field_dressing.dress_game, molt.shed_skin, dowsing,
//     echo_location, herbal_remedy/purify when their gates open) — greedy
//     synergy-attempt farming for sequential/simultaneous/sustained legs.
//     Blacklisted: blood_magic (HP cost), time_skip (skips the day part —
//     would corrupt the harness day loop), cannibal_frenzy (needs a corpse),
//     thief.steal_pantry (steals from the village), compost_king.bury_food
//     (eats food), war_cry.challenge + mediator.mediate_dispute (social
//     context), scarecrow.stage_injury + grave_robber.rob_grave (social
//     consequences).
//  3. TRAPS: when the village has trap supplies (a trap tool, or snare wire
//     for the improvised snare) + hunting knowledge, craft a snare if the
//     recipe is known, then run a trapline to the nearest wild tile and set
//     it (cap 3 set). The dawn checkTraps is the engine's (automatic) —
//     "check them" needs no policy action.
//  4. COUNTER-PREFERENCE: target selection prefers monster types whose
//     counter the codex records as known (Game.monsterCounterKnown).
//     NOTE (verified 2026-10-10, still true on this base): NO monster def
//     carries a `counter` field, so the waveLedger convention is DORMANT
//     and this rule fires 0 times — the measurement will show it, honestly.
//  5. FEAST-THEN-FIGHT: when the war chest CAN bank (bankMult > 1 via
//     deep_reserves x5 or the war_chest synergy x1.5), top up to banked >=
//     300 and run an extra patrol while banked so favored strikes burn it
//     (x1.5-1.75, more with an armed surge). The fight assessment uses a
//     NO-BURN feast multiplier — oracle's assessFight calls Game.feastBurn()
//     to measure the multiplier, and the base burn SPENDS 300 banked kcal
//     (and consumes an armed surge, marking feastSurgeUsed) just to read
//     the number. v2 reads it without spending it.
//
// Scripts only. No game numbers, no Wave Ledger config touched.
'use strict';
const { oracle, armUp, fireOpener, deedValue, monstersOf, mdefOf } = require('./oracle');

// --- no-burn feast multiplier (mirrors food.js feastBurn + the ----------
// --- progression.js surge wrapper, without spending anything) ------------
function feastMultNoBurn(Game) {
  try {
    const b = Game.banked ? Game.banked() : 0;
    if (b < 300) return 1;
    const s = Game.state.scholar || {};
    let mult = 1;
    try {
      const surge = s.prog && s.prog.feastSurge;
      if (surge) mult *= (typeof surge === 'number' ? surge : 1.5);
      if (s.arc4burn) mult *= s.arc4burn;
    } catch (e) {}
    let base = 1.5;
    try { if (Game.feastState && Game.feastState() === 'gorged') base = 1.75; } catch (e) {}
    const q = s.kcalQ || 1;
    if (q >= 1.3) base *= 1.15; else if (q < 0.7) base *= 0.85;
    return Math.round(base * mult * 100) / 100;
  } catch (e) { return 1; }
}

// --- win-probability assessment, v2 (oracle's assessFight minus the burn) --
function assessV2(Game, f) {
  try {
    const p = Game.tbFighter('p');
    const pHp = p.hp || 1, pMax = p.maxHp || pHp || 1;
    const w = (Game.equippedWeapon && Game.equippedWeapon()) || { bonus: 0 };
    const fbMult = feastMultNoBurn(Game);
    const baseStrike = 13 + (w.bonus || 0);
    const monsters = monstersOf(f);
    if (!monsters.length) return { favored: true, playerTTK: 0, monsterTTK: 99, reason: 'no-monsters' };
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
      m._ov2Hits = Math.max(1, Math.ceil(mhp / perHit));
      const dmg = (md.attack && md.attack.damage) || [8, 12];
      const lo = Array.isArray(dmg) ? dmg[0] : dmg, hi = Array.isArray(dmg) ? dmg[1] : dmg;
      totalMDpt += (lo + hi) / 2;
    }
    const order = monsters.slice().sort((a, b) => (a._ov2Hits || 1) - (b._ov2Hits || 1));
    let rounds = 0, aliveDpt = totalMDpt;
    for (const m of order) {
      rounds += (m._ov2Hits || 1);
      const dmg = ((mdefOf(Game, m) || {}).attack || {}).damage || [8, 12];
      const lo = Array.isArray(dmg) ? dmg[0] : dmg, hi = Array.isArray(dmg) ? dmg[1] : dmg;
      aliveDpt -= (lo + hi) / 2;
    }
    const playerTTK = rounds;
    const monsterTTK = totalMDpt > 0 ? pHp / totalMDpt : 99;
    const hpPct = pHp / Math.max(1, pMax);
    const favored = playerTTK <= 1.25 * monsterTTK;
    return { favored, playerTTK, monsterTTK, hpPct, fbMult, reason: favored ? 'favored' : 'outmatched' };
  } catch (e) {
    return { favored: false, playerTTK: 99, monsterTTK: 1, reason: 'assess-error' };
  }
}

function counterKnown(Game, m) {
  try { return !!(Game.monsterCounterKnown && Game.monsterCounterKnown(m.monsterId)); }
  catch (e) { return false; }
}

// Target selection: counter-known monster types first (dormant — fires 0x),
// then weakest. Counts honest counter-preference targets.
function pickTarget(Game, ctx, alive) {
  const sorted = alive.slice().sort((a, b) => {
    const ka = counterKnown(Game, a) ? 1 : 0, kb = counterKnown(Game, b) ? 1 : 0;
    if (kb !== ka) return kb - ka;
    return (a.hp || 0) - (b.hp || 0);
  });
  const t = sorted[0];
  if (t && counterKnown(Game, t)) ctx.counterPrefTargets = (ctx.counterPrefTargets || 0) + 1;
  return t;
}

// Available combat actions right now, keyed by composite id.
function combatActs(Game) {
  const out = {};
  try {
    for (const a of (Game.activatableAbilities() || [])) {
      if (a && a.available && (a.combat || a.context === 'combat')) out[a.id] = a;
    }
  } catch (e) {}
  return out;
}

// Per-turn ability priority. Returns true when an ability consumed the turn
// (the caller then ends the turn); false when the caller should strike.
function tryAbilityTurn(Game, ctx, f, alive, assess, tgt) {
  try {
    const s = Game.state.scholar || {};
    const p = Game.tbFighter('p');
    if (!p) return false;
    const hpPct = (p.hp || 0) / Math.max(1, p.maxHp || p.hp || 1);
    // STALL CAP: no more than 12 ability turns per fight — beyond that the
    // policy is turtling, not fighting. Strike.
    if ((ctx._fightAbCount || 0) >= 12) return false;
    // An armed strike flag from a previous turn: strike to consume it.
    if (s.haymakerReady || s.aimBonus || s.ambushReady || s.deadAimShot) return false;
    if (s.rageActive && s.rageActive.rounds > 0) return false;
    const acts = combatActs(Game);
    const fire = (id) => {
      try {
        const r = Game.activateAbility(id, tgt ? tgt.key : null);
        if (r) {
          ctx.abilityTurns = (ctx.abilityTurns || 0) + 1;
          ctx._fightAbCount = (ctx._fightAbCount || 0) + 1;
          ctx._lastFired = id;
          const k = 'ab_' + String(id).replace(/\./g, '_');
          ctx[k] = (ctx[k] || 0) + 1;
          return true;
        }
      } catch (e) {}
      return false;
    };
    // DEFENSE FIRST: brace when outmatched or softening — but never twice in
    // a row (a brace-every-turn turtle stalls the fight: the monster chips
    // through while the player never strikes; observed as a multi-day stall
    // in testing). Alternate brace with strikes.
    // CONTROL BUDGET (stall fix): loom and bellow are control, not damage —
    // spamming them (loom every turn = perpetual monster hesitation) stalls
    // the fight forever with the turn counter advancing, defeating the
    // no-progress guards. One use per fight each: enough for the synergy leg
    // (fear_itself wants fear_aura + war_cry in the same day-part) and one
    // round of breathing room. Dowsing likewise once per fight.
    const bud = ctx._fightAb || {};
    if (acts['unbreakable.brace'] && (!assess.favored || hpPct < 0.55) && ctx._lastFired !== 'unbreakable.brace')
      return fire('unbreakable.brace');
    if (acts['unbreakable.shake_off']) {
      let statused = false;
      try {
        statused = Game.hasStatus && ['stun', 'stun_full', 'slow', 'bleed']
          .some(id => Game.hasStatus(p, id));
      } catch (e) {}
      if (statused && (s.kcal || 0) >= 50) return fire('unbreakable.shake_off');
    }
    // TRIAGE when wounded: field medicine heals 20 HP, once per day part.
    if (acts['field_medicine'] && hpPct < 0.7) return fire('field_medicine');
    // CROWD CONTROL: war cry vs 2+ (beasts may bolt); loom is the
    // fear_itself synergy leg and buys hesitation. Budget: once per fight.
    if (acts['war_cry.bellow'] && alive.length >= 2 && (s.kcal || 0) >= 30 && !bud.bellow) {
      bud.bellow = true; ctx._fightAb = bud;
      return fire('war_cry.bellow');
    }
    if (acts['fear_aura.loom'] && alive.length >= 1 && !bud.loom) {
      bud.loom = true; ctx._fightAb = bud;
      return fire('fear_aura.loom');
    }
    // OFFENSE when favored: arm the big swing, then strike next turn.
    // (pocket_sand / leech / read_stance are budgeted once per fight —
    // re-firing control every turn is weak play and risks a stall.)
    if (assess.favored) {
      if (acts['haymaker.throw_haymaker'] && (s.kcal || 0) >= 40) return fire('haymaker.throw_haymaker');
      let ranged = false;
      try { const w = Game.equippedWeapon && Game.equippedWeapon(); ranged = !!w && (w.range || 1) > 1; } catch (e) {}
      if (acts['patient_aim.take_aim'] && ranged) return fire('patient_aim.take_aim');
      let round1 = false;
      try { round1 = (f.round || 1) === 1; } catch (e) {}
      if (acts['ambush.set_ambush'] && round1) return fire('ambush.set_ambush');
      if (acts['rage.unleash_rage']) return fire('rage.unleash_rage');
      if (acts['dead_aim.dead_aim_shot']) return fire('dead_aim.dead_aim_shot');
      if (acts['game_sense.read_stance'] && !bud.readStance) {
        bud.readStance = true; ctx._fightAb = bud;
        return fire('game_sense.read_stance');
      }
      if (acts['pocket_sand.throw_sand'] && !bud.sand) {
        bud.sand = true; ctx._fightAb = bud;
        return fire('pocket_sand.throw_sand');
      }
      if (acts['leech.leech_stance'] && !bud.leech) {
        bud.leech = true; ctx._fightAb = bud;
        return fire('leech.leech_stance');
      }
      if (acts['scream_cheese.scream']) return fire('scream_cheese.scream');
    }
    // Free synergy leg: dowsing costs no combat turn (legacy tickAction).
    // Once per fight — it has no cooldown and would otherwise fire every turn.
    if (acts['dowsing'] && !bud.dowsing) {
      bud.dowsing = true; ctx._fightAb = bud;
      try { Game.activateAbility('dowsing'); } catch (e) {}
    }
    return false;
  } catch (e) { return false; }
}

function oracleV2Fight(Game, ctx) {
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
        if (px === 0 || px === 8 || py === 0 || py === 8) pushThrough();
        if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) {
          const tx = px <= 4 ? 0 : 8;
          try { Game.tbPlayerMove(tx, py); } catch (e) {}
          pushThrough();
        }
        ctx.fled = (ctx.fled || 0) + 1;
        ctx['fled_' + why] = (ctx['fled_' + why] || 0) + 1;
      } catch (e) {}
      endTurn();
      return true;
    };
    // FIGHT-START (once per fight): arm up, fire the opener, assess honestly
    // (no-burn), same strategic gates as oracle.
    if (ctx._fightObj !== f) {
      ctx._fightObj = f;
      ctx._fightAb = {};      // per-fight control-ability budget (stall fix)
      ctx._fightAbCount = 0;  // per-fight ability-turn cap (stall fix)
      ctx._lastFired = null;
      armUp(Game, ctx);
      fireOpener(Game, ctx, f);
      const a = assessV2(Game, f);
      ctx._assess = a;
      ctx.assessments = (ctx.assessments || 0) + 1;
      if (hpPct < 0.3) return flee('neardeath');
      if (!deedValue(Game, f)) return flee('nodeed');
      if (!a.favored) { ctx.fledOutmatched = (ctx.fledOutmatched || 0) + 1; return flee('outmatched'); }
      ctx.engagedFavored = (ctx.engagedFavored || 0) + 1;
    }
    if (hpPct < 0.3) return flee('neardeath');
    const alive = monstersOf(f);
    if (!alive.length) return false;
    const tgt = pickTarget(Game, ctx, alive);
    // SYSTEMS ENGAGEMENT 1: one greedy ability per turn before striking.
    const assess = ctx._assess || assessV2(Game, f);
    if (tryAbilityTurn(Game, ctx, f, alive, assess, tgt)) { endTurn(); return true; }
    // Otherwise strike the (counter-preferred) weakest, closing range first.
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
    try { Game.tbPlayerStrike(tgt.key); ctx.struck = (ctx.struck || 0) + 1; ctx._lastFired = null; } catch (e) {}
    endTurn();
    return true;
  } catch (e) { return false; }
}

// --- SYSTEMS ENGAGEMENT 2: out-of-combat ability practice (daily) -----------
const PRACTICE = [
  'tracker.track',            // explore, 15 min
  'game_sense.read_sign',     // explore, 15 min
  'patient_aim.clean_shot',   // explore, 20 min + 15 kcal
  'ambush.lay_wait',          // explore, 30 min + 20 kcal
  'field_dressing.dress_game',// camp, 30 min + 40 kcal (gated: needs carcass)
  'molt.shed_skin',           // camp, 60 min + 100 kcal
  'dowsing',                  // legacy, free-ish
  'echo_location',            // legacy, 1/day
  'herbal_remedy',            // legacy, gated: sick
  'purify',                   // legacy, gated: poisoned
];
function practiceRound(Game, ctx) {
  try {
    if (Game.tbfight && !Game.tbfight.over) return;
    if (Game.inCombat && Game.inCombat()) return;
    const s = Game.state.scholar || {};
    const cap = Game.kcalCap ? Game.kcalCap() : 2400;
    if ((s.kcal || 0) < cap * 0.25) return; // don't practice starving
    let avail = {};
    try {
      for (const a of (Game.activatableAbilities() || [])) {
        if (a && a.available) avail[a.id] = true;
      }
    } catch (e) { return; }
    let n = 0;
    for (const id of PRACTICE) {
      if (n >= 10) break;
      if (!avail[id]) continue;
      try {
        const r = Game.activateAbility(id);
        if (r) { n++; ctx.practiceFired = (ctx.practiceFired || 0) + 1; }
      } catch (e) {}
    }
  } catch (e) {}
}

// --- SYSTEMS ENGAGEMENT 3: traps -------------------------------------------
function huntingKnowledge(Game) {
  try {
    if (Game.hasAbility) {
      for (const a of ['tracker', 'game_sense', 'patient_aim', 'dead_aim', 'ambush'])
        if (Game.hasAbility(a)) return true;
    }
    const techs = (Game.state.codex || {}).techniques || {};
    for (const k of Object.keys(techs)) if (/hunt|track|trail|fish|snare/i.test(k)) return true;
    const skills = (Game.state.codex || {}).skills || {};
    for (const k of ['foraging', 'fishing', 'hunting'])
      if ((skills[k] || {}).level >= 1) return true;
  } catch (e) {}
  return false;
}
function countSetTraps(Game) {
  let n = 0;
  try {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const t = Game.tileAt(x, y);
      if (t && t.traps) n += t.traps.length;
    }
  } catch (e) {}
  return n;
}
function trapTool(Game) {
  try {
    const tools = ((Game.state || {}).scholar || {}).tools || [];
    const trapIds = ((Game.data || {}).recipes || []).filter(r => r.catches).map(r => r.id);
    const tool = tools.find(t => trapIds.indexOf(t.recipeId) >= 0);
    if (tool) return tool.recipeId;
    if (Game.hasItem && Game.hasItem('snare_wire')) return 'snare'; // improvised
  } catch (e) {}
  return null;
}
function trapRound(Game, ctx) {
  try {
    if (Game.tbfight && !Game.tbfight.over) return;
    if (Game.over) return;
    if (!huntingKnowledge(Game)) return;
    if (countSetTraps(Game) >= 3) return;
    let recipeId = trapTool(Game);
    if (!recipeId) {
      // Craft a snare if the recipe is known (knowledge-gated, honest odds).
      try {
        const known = ((Game.state.codex || {}).recipes || {})['snare'];
        if (known && (known.level || 0) >= 1 && Game.craft) {
          if (Game.craft('snare')) { ctx.trapsCrafted = (ctx.trapsCrafted || 0) + 1; recipeId = trapTool(Game); }
        }
      } catch (e) {}
    }
    if (!recipeId) return;
    // Trapline: nearest wild tile, set, return home.
    const hx = Game.map.px, hy = Game.map.py;
    let best = null;
    try {
      for (const tt of (Game.travelTargets() || [])) {
        const t = Game.tileAt(tt.x, tt.y);
        if (!t || t.type === 'haven') continue;
        let blocked = false;
        try { blocked = !!Game.travelBlockage(tt.x, tt.y); } catch (e) {}
        if (blocked) continue;
        if (!best || tt.d < best.d) best = tt;
      }
    } catch (e) {}
    if (!best) return;
    try { Game.travelTo(best.x, best.y); } catch (e) { return; }
    if (Game.over || Game.tbfight) return; // driveFights handles it after daily
    try {
      const r = Game.setTrap(recipeId);
      if (r) ctx.traplineSets = (ctx.traplineSets || 0) + 1;
    } catch (e) {}
    try { Game.travelTo(hx, hy); } catch (e) {}
  } catch (e) {}
}

// --- SYSTEMS ENGAGEMENT 5: feast-then-fight ---------------------------------
function bankMult(Game) {
  try { return Game.bankMult ? Game.bankMult() : 1; } catch (e) { return 1; }
}
function banked(Game) {
  try { return Game.banked ? Game.banked() : 0; } catch (e) { return 0; }
}
function feastBankRound(Game, ctx) {
  try {
    if (!(bankMult(Game) > 1)) return; // war chest can't bank — nothing to do
    const b = banked(Game);
    if (b >= 300) { ctx.feastBankDays = (ctx.feastBankDays || 0) + 1; return; }
    // Top up toward the cap (pack via eat(); pantry only with a big buffer).
    const s = Game.state.scholar || {};
    const cap = Game.kcalCap ? Game.kcalCap() : 2400;
    let guard = 0;
    while ((s.kcal || 0) < cap * 0.98 && guard++ < 25) {
      const before = s.kcal || 0;
      try { Game.eat(); } catch (e) { break; }
      if ((s.kcal || 0) <= before + 1) break;
    }
    if (banked(Game) >= 300) {
      ctx.feastBanks = (ctx.feastBanks || 0) + 1;
      ctx.feastBankDays = (ctx.feastBankDays || 0) + 1;
    }
  } catch (e) {}
}
// While banked, go pick a favored fight to burn it (the bank leaks 20%/night).
function bankedPatrol(Game, ctx) {
  try {
    if (Game.tbfight && !Game.tbfight.over) return;
    if (Game.over) return;
    if (banked(Game) < 300) return;
    const s = Game.state.scholar || {};
    const day = s.day || 1;
    if (ctx._bankPatrolDay === day) return;
    ctx._bankPatrolDay = day;
    if ((s.kcal || 0) < (Game.kcalCap ? Game.kcalCap() * 0.4 : 800)) return;
    const hx = Game.map.px, hy = Game.map.py;
    const cands = [];
    try {
      for (const tt of (Game.travelTargets() || [])) {
        const t = Game.tileAt(tt.x, tt.y);
        if (!t || t.type === 'haven') continue;
        let blocked = false;
        try { blocked = !!Game.travelBlockage(tt.x, tt.y); } catch (e) {}
        if (blocked) continue;
        cands.push({ x: tt.x, y: tt.y, d: tt.d });
      }
    } catch (e) { return; }
    cands.sort((a, b) => b.d - a.d);
    let visited = 0;
    for (const c of cands.slice(0, 3)) {
      if (Game.over) break;
      try { Game.travelTo(c.x, c.y); } catch (e) { break; }
      if (Game.over || Game.tbfight) break;
      if (Game.map.px !== c.x || Game.map.py !== c.y) continue;
      visited++;
      try { Game.doAction('forage', {}); } catch (e) {}
      if (Game.over || Game.tbfight) break;
    }
    if (visited) {
      ctx.bankPatrols = (ctx.bankPatrols || 0) + 1;
      try { Game.travelTo(hx, hy); } catch (e) {}
    }
  } catch (e) {}
}

const oracleV2 = {
  id: 'oracle-v2',
  desc: 'oracle-v2: oracle + greedy deep-systems engagement (in-fight abilities, daily practice, traps, counter-preference targeting, feast-then-fight banking)',
  setup(Game, ctx) { if (oracle.setup) oracle.setup(Game, ctx); },
  upkeep(Game, ctx) {
    if (oracle.upkeep) oracle.upkeep(Game, ctx);
    armUp(Game, ctx);
  },
  daily(Game, ctx) {
    if (oracle.daily) oracle.daily(Game, ctx);
    practiceRound(Game, ctx);   // systems 2: synergy-attempt farming
    trapRound(Game, ctx);       // systems 3: trapline
    feastBankRound(Game, ctx);  // systems 5a: bank the war chest
    bankedPatrol(Game, ctx);    // systems 5b: burn it in favored fights
    try {
      const pg = Game.progState ? Game.progState() : {};
      ctx._sq = pg.systemQuests || 0;
      ctx._integ = (Game.state.scholar || {}).integration || 0;
    } catch (e) {}
  },
  fight(Game, ctx) {
    try { if (oracleV2Fight(Game, ctx)) return true; } catch (e) {}
    return false;
  },
  contest(Game, ctx) { return false; },
};

module.exports = { oracleV2 };
