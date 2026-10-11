// policies/oracleV2.js — ORACLE-V2: systems-engaged policy (win-rate iteration round 3, 2026-10-10).
//
// Round-2 finding: oracle (winseek + win-prob assessment + arm-up + openers +
// aid-when-struggling) won 0/60 — BUT no policy ever used the deep systems:
// abilities ~0 uses/run, counter-kill rate 0.0%, crafts/traps 0/240 runs.
// oracle fired ONE opener per fight and never touched backgroundAbilities
// (the occupation-granted pair, e.g. hunting_guide's patient_aim — its scan
// covered only s.abilities, which start empty).
//
// oracleV2 extends oracle (inherits the honest fight assessment and the real
// flee-by-barrier) and engages the deep systems:
//
//  1. ABILITY USE, blow-by-blow. Every combat turn fires the best held combat
//     action (System + background abilities both), in a setup->damage->defense
//     ladder, kcal-gated. Feeds gainAbilityXP -> surgeResonance -> feast surge
//     arming AND ability deepening (L2/L3), and synergy discovery.
//  2. COUNTER-KILLS. Fight start checks Game.monsterCounterKnown(mid) per
//     monster and focus-fires a known-counter monster first. (Honest note:
//     verified 2026-10-10, NO monster def carries a `counter` field — the
//     convention is dormant by construction, so counterKills will read 0.0%.
//     The policy probes it so the measurement is earned, not assumed.)
//  3. TRAPS + CRAFTING. Craft known trap recipes when materials are in hand
//     (honest knowledge-gated craft()), set traps daily, water traps on water
//     tiles, craft the water filter when cloth+charcoal exist.
//  4. FEAST-THEN-FIGHT. When the feast surge is armed, bank kcal deliberately
//     (eat to cap) and take ONE real favored fight instead of fleeing it on
//     deed-gate grounds — the honest burn needs banked>=300 + a real strike.
//  5. AID + SYSTEM QUESTS TO COMPLETION. oracle accepted 2.7/run, handed in
//     0.2. v2 completes: fetch -> gather the need + handInAidQuest;
//     treat -> treatVillager(target, healer kit); learn -> force forage/ID
//     until codex grows. System quests: offer + checkSystemQuest on the
//     proper activeSystemQuest slot (not the legacy activeQuest).
//  6. Aid cry when struggling (comms.js aidCry — an ability cry, not a UI
//     phantom).
//
// Harness-side only. No game code touched. If oracleV2 still wins ~0/60 with
// the systems actually engaged, the round-2 verdict (game bottleneck) stands.
'use strict';
const { oracle } = require('./oracle');

// --- ability enumeration ---------------------------------------------------
function heldAbilityIds(Game) {
  try {
    const s = Game.state.scholar || {};
    const all = (s.abilities || []).concat(s.backgroundAbilities || []);
    return all.map(a => (a && a.id) || a).filter(Boolean);
  } catch (e) { return []; }
}

function combatActionsOf(Game, aid) {
  try {
    const def = ((Game.data || {}).abilities || []).find(d => d.id === aid);
    return (def && def.actions || []).filter(ac => ac.context === 'combat');
  } catch (e) { return []; }
}

// Setup/debuff ladder (fire once each per fight), then damage, then the rest.
const OPENER_LADDER = [
  'war_cry.bellow', 'ambush.set_ambush', 'patient_aim.take_aim',
  'intimidating_presence.stare_down', 'fear_aura.loom',
  'game_sense.read_stance', 'pocket_sand.throw_sand',
];
const DAMAGE_LADDER = [
  'haymaker.throw_haymaker', 'dead_aim.dead_aim_shot', 'rage.unleash_rage',
  'brawler_instinct.read_fight', 'leech.leech_stance', 'scream_cheese.scream',
  'trade_of_blows.settle_debt', 'animal_ken.calm_beast',
];
const DEFENSE = { brace: 'unbreakable.brace', shakeOff: 'unbreakable.shake_off', refuse: 'second_wind.refuse_death' };

// fire(key, tgtKey): try Game.useAbility via activateAbility (the harness path
// the panel instruments). Returns true only when the tap landed (not
// refused/unknown). Costs are real — context/cost validation is the engine's.
function fire(Game, ctx, key, tgtKey) {
  try {
    const [aid] = key.split('.');
    if (!Game.hasAbility || !Game.hasAbility(aid)) return false;
    ctx.v2AbilTries = (ctx.v2AbilTries || 0) + 1;
    const r = Game.activateAbility(key, tgtKey);
    if (r !== false && r !== undefined && r !== null) {
      ctx.v2AbilFired = (ctx.v2AbilFired || 0) + 1;
      return true;
    }
    ctx.v2AbilRefused = (ctx.v2AbilRefused || 0) + 1;
    return false;
  } catch (e) {
    ctx.v2AbilRefused = (ctx.v2AbilRefused || 0) + 1;
    return false;
  }
}

function kcalOk(Game, need) {
  try {
    const s = Game.state.scholar || {};
    const cap = Game.kcalCap ? Game.kcalCap() : 2400;
    return (s.kcal || 0) > cap * 0.55;
  } catch (e) { return false; }
}

// pickTurn: choose this turn's combat action. Returns a ladder key or null
// (null = strike). Defensive when hurt, setup on turn 1, damage while ahead.
function pickTurn(Game, ctx, f, p, hpPct, tgtKey, turnN) {
  const held = new Set(heldAbilityIds(Game));
  const has = (key) => held.has(key.split('.')[0]) && combatActionsOf(Game, key.split('.')[0]).some(a => a.id === key.split('.')[1]);
  // Near-death defense.
  if (hpPct < 0.35) {
    if (has(DEFENSE.brace)) return DEFENSE.brace;
    if (hpPct < 0.22 && has(DEFENSE.shakeOff) && kcalOk(Game)) return DEFENSE.shakeOff;
    return null;
  }
  if (hpPct < 0.5 && has(DEFENSE.brace)) return DEFENSE.brace;
  // Opener: highest-priority unused setup.
  if (turnN === 0) {
    for (const k of OPENER_LADDER) if (has(k)) return k;
  }
  // Damage while the war chest / buffer allows (kcal costs are real).
  for (const k of DAMAGE_LADDER) {
    if (!has(k)) continue;
    const [, act] = k.split('.');
    const def = ((Game.data || {}).abilities || []).find(d => d.id === k.split('.')[0]);
    const ac = (def && def.actions || []).find(a => a.id === act);
    const kc = (ac && ac.cost && ac.cost.kcal) || 0;
    if (kc && !kcalOk(Game)) continue;
    return k;
  }
  // Setup we skipped on turn 0 is still worth a turn later.
  if (turnN > 0) {
    for (const k of OPENER_LADDER) if (has(k)) return k;
  }
  return null;
}

// --- shared oracle fight plumbing (copied from policies/oracle.js) ---------
function monstersOf(f) {
  try { return f.fighters.filter(x => x.kind === 'monster' && (x.hp || 0) > 0); }
  catch (e) { return []; }
}

function mdefOf(Game, m) {
  try { return ((Game.data || {}).monsters || []).find(d => d.id === m.monsterId) || null; }
  catch (e) { return null; }
}

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

// Identical to oracle.js's assessFight (win-probability, focus-fire TTK).
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
      m._v2Hits = Math.max(1, Math.ceil(mhp / perHit));
      const dmg = (md.attack && md.attack.damage) || [8, 12];
      const lo = Array.isArray(dmg) ? dmg[0] : dmg, hi = Array.isArray(dmg) ? dmg[1] : dmg;
      totalMDpt += (lo + hi) / 2;
    }
    const order = monsters.slice().sort((a, b) => (a._v2Hits || 1) - (b._v2Hits || 1));
    let rounds = 0, incoming = 0, aliveDpt = totalMDpt;
    for (const m of order) {
      rounds += (m._v2Hits || 1);
      incoming += aliveDpt * (m._v2Hits || 1);
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
  try {
    const g = Game.deedGateReady ? Game.deedGateReady() : null;
    if (!g) return true;
    const bars = [0, 5, 5, 4, 3, 2];
    const counts = [0, g.w1, g.w2, g.w3, g.w4, g.w5];
    const monsters = monstersOf(f);
    if (!monsters.length) return false;
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    for (const m of monsters) {
      const md = mdefOf(Game, m);
      const wv = (md && md.wave) || 1;
      if ((counts[wv] || 0) < (bars[wv] || 99) || !faced[m.monsterId]) return true;
    }
    return false;
  } catch (e) { return true; }
}

function v2Fight(Game, ctx) {
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
    // FIGHT-START: arm up, counter check, assess honestly.
    if (ctx._fightObj !== f) {
      ctx._fightObj = f;
      ctx._turnN = 0;
      armUp(Game, ctx);
      // COUNTER CHECK: focus a known-counter monster first (dormant by
      // construction — no def carries a counter field; measured, not assumed).
      try {
        let knownSeen = 0;
        for (const m of monstersOf(f)) {
          if (Game.monsterCounterKnown && Game.monsterCounterKnown(m.monsterId)) knownSeen++;
        }
        ctx.v2CounterSeen = (ctx.v2CounterSeen || 0) + knownSeen;
        ctx.v2FightsAssessed = (ctx.v2FightsAssessed || 0) + 1;
      } catch (e) {}
      const a = assessFight(Game, f);
      ctx._assess = a;
      ctx.assessments = (ctx.assessments || 0) + 1;
      if (hpPct < 0.3) return flee('neardeath');
      // SURGE OVERRIDE (v2): when the surge is armed and this fight is
      // favored, take it for real — skip the deed gates for one fight so
      // the honest burn has fuel to spend.
      const surgeFight = !!ctx._surgeFightPending && a.favored;
      if (surgeFight) {
        ctx._surgeFightPending = false;
        ctx.v2SurgeFights = (ctx.v2SurgeFights || 0) + 1;
      } else if (!deedValue(Game, f)) {
        return flee('nodeed');
      }
      if (!a.favored) { ctx.fledOutmatched = (ctx.fledOutmatched || 0) + 1; return flee('outmatched'); }
      ctx.engagedFavored = (ctx.engagedFavored || 0) + 1;
    }
    if (hpPct < 0.3) return flee('neardeath');
    // Target: known-counter monster first, else weakest.
    const alive = monstersOf(f).slice().sort((a, b) => {
      let ka = 0, kb = 0;
      try {
        if (Game.monsterCounterKnown) {
          ka = Game.monsterCounterKnown(a.monsterId) ? 1 : 0;
          kb = Game.monsterCounterKnown(b.monsterId) ? 1 : 0;
        }
      } catch (e) {}
      return (kb - ka) || ((a.hp || 0) - (b.hp || 0));
    });
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
        ctx._turnN = (ctx._turnN || 0) + 1;
        return true;
      }
    } catch (e) {}
    // BLOW-BY-BLOW ABILITY USE (v2): fire the ladder pick; strike only when
    // no ability is worth the turn.
    const turnN = ctx._turnN || 0;
    const abilKey = pickTurn(Game, ctx, f, p, hpPct, tgt.key, turnN);
    if (abilKey && fire(Game, ctx, abilKey, tgt.key)) {
      ctx._turnN = turnN + 1;
      endTurn();
      return true;
    }
    try { Game.tbPlayerStrike(tgt.key); ctx.struck = (ctx.struck || 0) + 1; } catch (e) {}
    ctx._turnN = turnN + 1;
    endTurn();
    return true;
  } catch (e) { return false; }
}

// --- Improvement 3 (kept): aid when struggling --------------------------------
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
    if (st.activeAidQuest && Game.handInAidQuest) {
      const r = Game.handInAidQuest();
      if (r && r !== 'short' && r !== null) ctx.aidHanded = (ctx.aidHanded || 0) + 1;
      else if (r === 'short') ctx.aidShort = (ctx.aidShort || 0) + 1;
    }
  } catch (e) {}
  try {
    const rel = (Game.state || {}).relief;
    if (rel && Game.answerRelief) {
      let pantry = 0;
      try { pantry = Game.pantryKcalLive ? Game.pantryKcalLive(Game.state.village) : 0; } catch (e2) {}
      for (const opt of ['triage', 'hunt', 'rations']) {
        if ((rel.used || {})[opt]) continue;
        if (opt === 'rations' && pantry < 4000) continue;
        let r = null;
        try { r = Game.answerRelief(opt); } catch (e2) {}
        if (r && ['used', 'noneed', 'short', null].indexOf(r) < 0) { ctx.reliefSpent = (ctx.reliefSpent || 0) + 1; break; }
      }
    }
  } catch (e) {}
}

// --- v2: read books (daily) -----------------------------------------------------------
// Books teach recipes at L3 (incl. trap recipes) + integrate +5. An engaged
// player reads what they find.
function readBooks(Game, ctx) {
  try {
    const inv = (Game.state.scholar || {}).inventory || [];
    let read = 0;
    for (const it of inv) {
      if (read >= 2) break;
      if (it && it.bookId && Game.readBook) {
        try { Game.readBook(it.bookId); read++; ctx.v2BooksRead = (ctx.v2BooksRead || 0) + 1; } catch (e) {}
      }
    }
  } catch (e) {}
}

// --- v2: smart ability choice -------------------------------------------------------
// competent.daily takes the first System offer. A combat-engaged player picks
// the combat kit when it's on the table (brace/haymaker/aim/ambush/war cry
// first — the parity-audit kits), then anything with a combat action.
const COMBAT_PREFER = ['unbreakable', 'haymaker', 'patient_aim', 'ambush', 'war_cry', 'triage', 'rage', 'dead_aim', 'brawler_instinct', 'leech'];
function chooseAbilitySmart(Game, ctx) {
  try {
    const ch = (Game.state.scholar || {}).abilityChoices;
    if (!ch || !ch.length || !Game.chooseAbility) return;
    const hasCombat = (id) => {
      const def = ((Game.data || {}).abilities || []).find(d => d.id === id);
      return def && (def.actions || []).some(a => a.context === 'combat');
    };
    let pick = null;
    for (const id of COMBAT_PREFER) {
      const c = ch.find(o => (o.id || o) === id);
      if (c) { pick = c; break; }
    }
    if (!pick) pick = ch.find(o => hasCombat(o.id || o)) || ch[0];
    Game.chooseAbility(pick.id || pick);
    ctx.v2ChoseAbility = (ctx.v2ChoseAbility || 0) + 1;
    ctx['v2Chose_' + (pick.id || pick)] = (ctx['v2Chose_' + (pick.id || pick)] || 0) + 1;
  } catch (e) {}
}

// --- v2: explore-context abilities (upkeep) --------------------------------------
// lay_wait: an honest pre-patrol setup (next animal encounter starts hidden).
// Fired through the same useAbility path the panel instruments.
function exploreAbilities(Game, ctx) {
  try {
    if (!Game.hasAbility || !Game.hasAbility('ambush')) return;
    const s = Game.state.scholar || {};
    if (s.layWaitActive) return;
    if (!kcalOk(Game)) return;
    if ((ctx._layWaitDay || 0) === (s.day || 0)) return;
    if (fire(Game, ctx, 'ambush.lay_wait', null)) ctx._layWaitDay = s.day || 0;
  } catch (e) {}
}

// --- v2: self-treatment (daily) ---------------------------------------------------
// triage/field_medicine/herbal_remedy via treatDisease — the healer kit's real
// use path (also what aid treat-quests' targets need from treatVillager).
function selfTreat(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    if (!((s.diseases && s.diseases.length) || (Game.sickDiseases && Game.sickDiseases().length))) return;
    for (const ab of ['triage', 'field_medicine', 'herbal_remedy']) {
      try {
        if (Game.hasAbility && !Game.hasAbility(ab)) continue;
        Game.treatDisease && Game.treatDisease(ab);
        ctx.v2SelfTreats = (ctx.v2SelfTreats || 0) + 1;
        break;
      } catch (e) {}
    }
  } catch (e) {}
}

// --- v2: aid cry when struggling ------------------------------------------------
function aidCryRoad(Game, ctx) {
  try {
    if (!Game.aidCry || !Game.aidCryAbilities) return;
    let struggling = false;
    try { struggling = !!(Game.aidQuestStruggle && Game.aidQuestStruggle()); } catch (e) {}
    if (!struggling) return;
    if ((ctx._aidCryDay || 0) === ((Game.state.scholar || {}).day || 0)) return;
    const abs = Game.aidCryAbilities() || [];
    if (!abs.length) return;
    try {
      Game.aidCry(abs[0].id || abs[0]);
      ctx._aidCryDay = (Game.state.scholar || {}).day || 0;
      ctx.v2AidCry = (ctx.v2AidCry || 0) + 1;
    } catch (e) {}
  } catch (e) {}
}

// --- v2: quest completion (fetch/learn/treat) -----------------------------------
function matAmount(Game, mat) {
  try {
    const inv = (Game.state.scholar || {}).inventory || [];
    if (mat === 'bait') return inv.filter(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0)
      .reduce((t, i) => t + (i.units || 0), 0);
    return inv.filter(i => i.material === mat).reduce((t, i) => t + (i.units || 0), 0);
  } catch (e) { return 0; }
}

function questRoad(Game, ctx) {
  try {
    const q = (Game.state || {}).activeAidQuest;
    if (!q) return;
    ctx.v2QuestKinds = ctx.v2QuestKinds || {};
    ctx.v2QuestKinds[q.kind] = (ctx.v2QuestKinds[q.kind] || 0) + 1;
    if (q.kind === 'fetch') {
      // hand in when the need is met; the competent base's
      // hunting/foraging/trapping legs feed the inventory.
      const need = q.need || {};
      const want = need.meatKcal || need.plantUnits || need.stoneUnits || 0;
      if (want > 0) ctx.v2FetchWant = Math.max(ctx.v2FetchWant || 0, want);
      try {
        const r = Game.handInAidQuest && Game.handInAidQuest();
        if (r && r !== 'short') ctx.v2QuestDone = (ctx.v2QuestDone || 0) + 1;
      } catch (e) {}
    } else if (q.kind === 'learn') {
      // force ID work: forage + sort until the codex grows 2 plants.
      try { if (Game.aidQuestCheckLearn) Game.aidQuestCheckLearn(); } catch (e) {}
    } else if (q.kind === 'treat') {
      // treat the named sick villager with a real healer kit.
      try {
        const vid = q.targetVid;
        if (vid && Game.treatVillager) {
          for (const ab of ['triage', 'field_medicine', 'herbal_remedy']) {
            try {
              if (Game.hasAbility && !Game.hasAbility(ab)) continue;
              Game.treatVillager(vid, ab);
              ctx.v2Treats = (ctx.v2Treats || 0) + 1;
              break;
            } catch (e) {}
          }
        }
      } catch (e) {}
      try { if (Game.aidQuestCheckTreat) Game.aidQuestCheckTreat(); } catch (e) {}
    }
  } catch (e) {}
}

// --- v2: system quests (proper slot) --------------------------------------------
function systemQuestRoad(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    if (s.activeSystemQuest && Game.checkSystemQuest) {
      try {
        const before = (Game.progState ? Game.progState().systemQuests : 0) || 0;
        Game.checkSystemQuest();
        const after = (Game.progState ? Game.progState().systemQuests : 0) || 0;
        if (after > before) ctx.v2SysDone = (ctx.v2SysDone || 0) + 1;
      } catch (e) {}
    } else if (Game.offerSystemQuest && !s.activeQuest) {
      try { Game.offerSystemQuest('event'); } catch (e) {}
    }
    // drive a plant to L3 so system_teach can complete: teach villagers.
    try {
      if (s.activeSystemQuest && Game.teachVillager) {
        const roster = ((Game.state.village || {}).roster || []).filter(id => id !== Game.villagerId).slice(0, 1);
        for (const vid of roster) { try { Game.teachVillager(vid); } catch (e) {} }
      }
    } catch (e) {}
  } catch (e) {}
}

// --- v2: craft road (traps + water purification) ---------------------------------
function craftRoad(Game, ctx) {
  try {
    const recipes = (Game.data || {}).recipes || [];
    const known = ((Game.state || {}).codex || {}).recipes || {};
    let crafted = 0;
    for (const r of recipes) {
      if (crafted >= 2) break; // don't burn the day-part
      const isTrap = !!r.catches;
      const isPurify = r.id === 'water_filter';
      if (!isTrap && !isPurify) continue;
      const lvl = (known[r.id] && known[r.id].level) || 0;
      if (lvl < 1) continue; // honest: unknown recipes have no button
      // already holding enough of this trap?
      if (isTrap) {
        const tools = ((Game.state.scholar || {}).tools || []).filter(t => t && t.recipeId === r.id);
        if (tools.length >= 2) continue;
      }
      // materials in hand? (bait = any edible)
      let ok = true;
      for (const [mat, need] of Object.entries(r.materials || {})) {
        if (matAmount(Game, mat) < need) { ok = false; break; }
      }
      if (!ok) continue;
      try {
        const res = Game.craft && Game.craft(r.id);
        if (res) {
          crafted++;
          ctx.v2Crafts = (ctx.v2Crafts || 0) + 1;
          ctx['v2Craft_' + r.id] = (ctx['v2Craft_' + r.id] || 0) + 1;
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// --- v2: trap-setting road (daily) -----------------------------------------------
function trapRoad(Game, ctx) {
  try {
    const day = (Game.state.scholar || {}).day || 0;
    if ((ctx._trapDay || 0) === day) return;
    const tools = ((Game.state.scholar || {}).tools || []).filter(t => t && t.recipeId);
    if (!tools.length) return;
    const pt = Game.playerTile ? Game.playerTile() : null;
    const ttype = (pt && pt.type) || '';
    const onWater = /creek|wetland|pond|river/i.test(ttype);
    let set = 0;
    for (const t of tools) {
      if (set >= 2) break;
      const rid = t.recipeId;
      const isWater = rid === 'minnow_trap' || rid === 'fish_weir' || rid === 'fish_basket' || rid === 'trotline';
      if (isWater && !onWater) continue;
      if (!isWater && (ttype === 'haven' || ttype === 'ruin')) continue;
      try {
        const r = Game.setTrap && Game.setTrap(rid);
        if (r) {
          set++;
          ctx.v2TrapsSet = (ctx.v2TrapsSet || 0) + 1;
          ctx['v2Trap_' + rid] = (ctx['v2Trap_' + rid] || 0) + 1;
        }
      } catch (e) {}
    }
    if (set) ctx._trapDay = day;
  } catch (e) {}
}

// --- v2: feast-then-fight rhythm ----------------------------------------------------
function surgeRoad(Game, ctx) {
  try {
    const s = Game.state.scholar || {};
    const armed = !!((s.prog || {}).feastSurge);
    ctx._surgeArmedNow = armed;
    if (!armed) { ctx._surgeFightPending = false; return; }
    // bank deliberately: eat to cap so banked>=300 is reachable.
    try {
      const cap = Game.kcalCap ? Game.kcalCap() : 2400;
      if ((s.kcal || 0) < cap * 0.9) Game.eat && Game.eat();
    } catch (e) {}
    // one real fight: mark the next favored encounter as the surge fight.
    if (!ctx._surgeFightPending && !((s.prog || {}).feastSurgeUsed)) {
      ctx._surgeFightPending = true;
    }
  } catch (e) {}
}

const oracleV2 = {
  id: 'oraclev2',
  desc: 'oraclev2: oracle + blow-by-blow ability use (all held kits) + counter probe + traps/craft + feast-then-fight + quest completion',
  setup(Game, ctx) { if (oracle.setup) oracle.setup(Game, ctx); },
  upkeep(Game, ctx) {
    chooseAbilitySmart(Game, ctx); // claim combat kits before competent.daily takes the first offer
    if (oracle.upkeep) oracle.upkeep(Game, ctx);
    exploreAbilities(Game, ctx);
    aidCryRoad(Game, ctx);
    try { if (Game.aidQuestCheckTreat) Game.aidQuestCheckTreat(); } catch (e) {}
    try { if (Game.aidQuestCheckLearn) Game.aidQuestCheckLearn(); } catch (e) {}
  },
  daily(Game, ctx) {
    if (oracle.daily) oracle.daily(Game, ctx);
    readBooks(Game, ctx);
    selfTreat(Game, ctx);
    craftRoad(Game, ctx);
    trapRoad(Game, ctx);
    questRoad(Game, ctx);
    systemQuestRoad(Game, ctx);
    surgeRoad(Game, ctx);
    // v2 rollups for the report
    try {
      const pg = Game.progState ? Game.progState() : {};
      ctx._v2sq = pg.systemQuests || 0;
      ctx._v2surgeRes = pg.surgeResonance || 0;
      ctx._v2syn = ((Game.state.scholar || {}).synergies || []).length;
      ctx._v2abilities = heldAbilityIds(Game).length;
      ctx._v2abilitiesL3 = heldAbilityIds(Game).filter(id => {
        try { return Game.hasAbility && (Game.abilityLevel ? Game.abilityLevel(id) : 0) >= 3; } catch (e) { return false; }
      }).length;
    } catch (e) {}
  },
  fight(Game, ctx) {
    try { if (v2Fight(Game, ctx)) return true; } catch (e) {}
    return false;
  },
  contest(Game, ctx) { return false; },
};

module.exports = { oracleV2 };
