// policies/oracle-v3.js — ORACLE-V3: tribute-priority variant of oracleV2 (win-rate iteration round 6, 2026-10-10).
//
// MEASUREMENT PROBE, not a game tweak and not shipped AI. Round 5 fixed the
// succession churn and still got 0/60 wins, 0/60 vests — binding blocker
// `scale`. The round-5 evidence notes the oracleV2 policy may simply
// under-invest in tribute/deeds upkeep vs survival actions. Before Steve
// makes a design call, round 6 asks: is vesting reachable AT ALL by a
// policy that actually prioritizes it?
//
// oracle-v3 extends oracleV2 (harness-side require — no game code touched)
// and changes NOTHING about survival play (abilities, traps, counter
// preference, feast-then-fight, fight assessment, aid, quests — all
// inherited verbatim). The ONLY delta is the tribute-priority layer, which
// treats trust upkeep as a first-class goal alongside survival:
//
//  1. TRIBUTE VANGUARD. oracleV2's diplomacyRoad pays tribute once in daily;
//     v3 pays at the first upkeep of each week (upkeep runs 3x/day) so the
//     pantry pays while it's full. Same engine call (payTribute is idempotent
//     per week), earlier and more often — never let arrears accrue. Also
//     pays the link current immediately after any succession beat on it.
//  2. ANSWER THE CALL. oracleV2 NEVER answers link.pendingDemand — the
//     primary's ~20%/week call (tribute +8, aid 3-day visit +8, counsel +8;
//     refuse = -15, demands never expire) sat pending forever, blocking the
//     next call. v3 honors every demand promptly:
//       - counsel: always (free +8, no cost);
//       - tribute: only when the pantry covers the FULL cost — honoring short
//         is proportional trust AND accrues arrears (arrears block the BELONG
//         bar), and refusing is -15. If short, the demand stays pending.
//       - aid (the 3-day visit — "send your best"): whenever the village
//         isn't in immediate survival danger (pantry >= 3000 kcal and scholar
//         kcal >= 30% cap). Loans the representative: one villager assigned
//         to link upkeep, for real, for three days.
//       - mourning: tribute/aid honors are deferred (the 7-day mourning
//         window zeroes trust gains — paying would waste food and the loan);
//         counsel is still answered (free, unblocks the demand slot).
//       - REFUSE IS NEVER CHOSEN. -15 is the one outcome worse than waiting.
//  3. SUCCESSION WATCH. Wraps successionCrisis/theirLeaderDied: the moment a
//     beat fires on a link, v3 immediately pays that link's tribute current
//     (arrears are the snap vector — a death must never meet a neglected
//     link) and answers any pending demand for it. The prompt answer.
//
// What v3 deliberately does NOT do (honest-measurement rules):
//  - No direct Game.proveWorth calls with invented magnitudes. Deeds feed
//    proveWorth through the engine's own recordDeed wrap — real deeds only.
//    v3 inherits oracleV2's deed-doing (patrols, hunts, contests); the new
//    trust comes from demands + on-time tribute, all engine-priced.
//  - No change to survival, fight, feast, or scale-seeking behavior — any
//    survival difference vs oracleV2 is the COST of the tribute priority,
//    which is itself a measured output of the round.
'use strict';
const { oracleV2 } = require('./oracleV2');

// week index, mirroring the engine's _week()
function weekOf(Game) {
  try { return Math.floor((((Game.state || {}).scholar || {}).day || 0) / 7); }
  catch (e) { return 0; }
}

function pantryKcal(Game) {
  try { return Game.pantryKcalLive ? Game.pantryKcalLive(Game.state.village) : 0; }
  catch (e) { return 0; }
}

// Immediate survival danger: the village can't spare food or hands.
function inDanger(Game) {
  try {
    const s = Game.state.scholar || {};
    const cap = Game.kcalCap ? Game.kcalCap() : 2400;
    if ((s.kcal || 0) < cap * 0.3) return true;
    if (pantryKcal(Game) < 3000) return true;
    return false;
  } catch (e) { return false; }
}

function subLinks(Game) {
  try {
    return (Game.hierarchyState ? Game.hierarchyState() : [])
      .filter(l => l && l.status === 'active' && l.subordinate === 'haven');
  } catch (e) { return []; }
}

function mourning(Game, link) {
  try {
    const day = ((Game.state || {}).scholar || {}).day || 0;
    return (link.mourningUntil || 0) > day;
  } catch (e) { return false; }
}

// 1. TRIBUTE VANGUARD: pay each subordinate link current at the first upkeep
// of each DAY (before the day's consumption), and at the first upkeep of each
// week regardless. Same engine call as oracleV2's diplomacyRoad (payTribute
// is idempotent per week) — earlier in the day, never more than once/day per
// link: re-paying partials 3x/day would drain new pantry arrivals into
// tribute faster than the village can eat, which is a policy artifact, not
// "paying on time". Succession-triggered pays (successionWatch) are exempt —
// those are the prompt answer the probe is testing.
function tributeVanguard(Game, ctx) {
  try {
    const w = weekOf(Game);
    const day = ((Game.state || {}).scholar || {}).day || 0;
    ctx._v3TribDay = ctx._v3TribDay || {};
    for (const l of subLinks(Game)) {
      if ((l.tributePaidWeek || -1) === w) continue;
      if (ctx._v3TribDay[l.id] === day) continue; // once/day/link
      try {
        const r = Game.payTribute && Game.payTribute(l.id);
        if (r !== null && r !== undefined) {
          ctx._v3TribDay[l.id] = day;
          ctx.v3TributePays = (ctx.v3TributePays || 0) + 1;
          ctx.v3TributeKcal = (ctx.v3TributeKcal || 0) + (r || 0);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// A deferral is counted once per demand (link + kind), not once per upkeep
// retry — otherwise a single pending demand inflates the counter 3x/day.
function defer(Game, ctx, l, kind) {
  try {
    ctx._v3DefSeen = ctx._v3DefSeen || {};
    const key = (l.id || '?') + ':' + kind;
    if (!ctx._v3DefSeen[key]) {
      ctx._v3DefSeen[key] = true;
      ctx.v3DemandDeferred = (ctx.v3DemandDeferred || 0) + 1;
    }
  } catch (e) {}
}

// 2. ANSWER THE CALL: honor pending demands promptly, by kind.
function demandRoad(Game, ctx) {
  try {
    const links = Game.hierarchyState ? Game.hierarchyState() : [];
    for (const l of links) {
      if (!l || l.status !== 'active' || !l.pendingDemand) continue;
      if (l.subordinate !== 'haven') continue; // only our obligations
      const d = l.pendingDemand;
      const kind = d.kind || '?';
      const mourn = mourning(Game, l);
      let accept = false;
      if (kind === 'counsel') {
        accept = true; // free +8, unblocks the slot even in mourning
      } else if (kind === 'tribute') {
        // full honor only: partials accrue arrears (BELONG needs arrears 0);
        // never refuse (-15). Short = stay pending, try again next upkeep.
        if (!mourn && pantryKcal(Game) >= (d.costKcal || 0)) accept = true;
        else defer(Game, ctx, l, kind);
      } else if (kind === 'aid') {
        // the 3-day visit: a real villager assigned to the link — but only
        // when the village isn't in immediate survival danger.
        if (!mourn && !inDanger(Game)) accept = true;
        else defer(Game, ctx, l, kind);
      }
      if (!accept) continue;
      try {
        const before = l.trust || 0;
        const r = Game.answerDemand(l.id, true);
        if (r) {
          // demand answered — clear the deferral key so a future demand of
          // the same kind counts fresh
          try { if (ctx._v3DefSeen) delete ctx._v3DefSeen[(l.id || '?') + ':' + kind]; } catch (e2) {}
          ctx.v3DemandHonored = (ctx.v3DemandHonored || 0) + 1;
          ctx['v3Demand_' + kind] = (ctx['v3Demand_' + kind] || 0) + 1;
          if (kind === 'aid') ctx.v3AidVisits = (ctx.v3AidVisits || 0) + 1;
          // trust actually applied (0 during mourning, full otherwise)
          const after = (() => {
            try {
              return (Game.hierarchyState().find(x => x && x.id === l.id) || {}).trust || 0;
            } catch (e2) { return before; }
          })();
          ctx.v3TrustFromDemands = (ctx.v3TrustFromDemands || 0) + Math.max(0, after - before);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// 3. SUCCESSION WATCH: a death must never meet a neglected link. On any
// succession beat, immediately pay that link current + answer its demand.
function successionWatch(Game, ctx) {
  const answer = (linkId) => {
    try {
      if (Game.payTribute) { try { Game.payTribute(linkId); } catch (e) {} }
      ctx.v3SuccessionAnswered = (ctx.v3SuccessionAnswered || 0) + 1;
      // answer any demand on this link now (same rules as demandRoad)
      try {
        const l = (Game.hierarchyState ? Game.hierarchyState() : []).find(x => x && x.id === linkId);
        if (l && l.pendingDemand && l.subordinate === 'haven') {
          const d = l.pendingDemand, kind = d.kind || '?';
          const mourn = mourning(Game, l);
          let accept = kind === 'counsel' ||
            (kind === 'tribute' && !mourn && pantryKcal(Game) >= (d.costKcal || 0)) ||
            (kind === 'aid' && !mourn && !inDanger(Game));
          if (accept) {
            const r = Game.answerDemand(linkId, true);
            if (r) {
              ctx.v3DemandHonored = (ctx.v3DemandHonored || 0) + 1;
              ctx['v3Demand_' + kind] = (ctx['v3Demand_' + kind] || 0) + 1;
              if (kind === 'aid') ctx.v3AidVisits = (ctx.v3AidVisits || 0) + 1;
            }
          }
        }
      } catch (e) {}
    } catch (e) {}
  };
  const wrap = (name) => {
    const orig = Game[name];
    if (typeof orig !== 'function') return;
    Game[name] = function (linkId) {
      const r = orig.apply(this, arguments);
      try { if (linkId) answer(linkId); } catch (e) {}
      return r;
    };
  };
  wrap('successionCrisis');
  wrap('theirLeaderDied');
}

const V3_KEYS = ['v3TributePays', 'v3TributeKcal', 'v3DemandHonored',
  'v3Demand_tribute', 'v3Demand_aid', 'v3Demand_counsel', 'v3DemandDeferred',
  'v3AidVisits', 'v3TrustFromDemands', 'v3SuccessionAnswered'];

const oracleV3 = {
  id: 'oraclev3',
  desc: 'oracle-v3: oracleV2 + tribute-priority layer (tribute vanguard, demand honoring, succession watch) — vesting reachability probe',
  setup(Game, ctx) {
    if (oracleV2.setup) oracleV2.setup(Game, ctx);
    successionWatch(Game, ctx);
  },
  upkeep(Game, ctx) {
    if (oracleV2.upkeep) oracleV2.upkeep(Game, ctx);
    tributeVanguard(Game, ctx);  // pay current before anything else
    demandRoad(Game, ctx);       // answer the primary's call promptly
  },
  daily(Game, ctx) {
    if (oracleV2.daily) oracleV2.daily(Game, ctx);
    try {
      for (const k of V3_KEYS) if (ctx[k] != null) ctx['_v3_' + k] = ctx[k];
    } catch (e) {}
  },
  fight(Game, ctx) {
    try { if (oracleV2.fight(Game, ctx)) return true; } catch (e) {}
    return false;
  },
  contest(Game, ctx) { return false; },
};

module.exports = { oracleV3, V3_KEYS };
