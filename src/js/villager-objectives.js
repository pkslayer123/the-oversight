// @ontology
// system: villager-objectives
// description: Villager objective AI. Villagers pursue objectives instead of drifting randomly.
// provides:
//   - objState()
//   - objOf(vid)
//   - objPick(vid, hx, hy)
//   - objDanger(vid, tx, ty, hx, hy)
//   - objMaybeDepart(rid, node, atHaven, hx, hy)
//   - objAwayStep(rid, node, away, hx, hy)
//   - objAskCompanion(vid, obj, hx, hy)
//   - objTick()
// rules:
//   - objectives_drive_departures: npcNodeTravel's old dice triggers are replaced by objMaybeDepart (code: villager-objectives.js)
//   - night_departure_ban: nobody sets out at night, hard rule kept from base (code: villager-objectives.js)
//   - danger_gates_departure: every departure verdicts go / ask / tighten / defer via objDanger (code: villager-objectives.js)
// consumes:
//   - village.roster, village.away, village.nodePos, village.gossip
//   - npcNode, npcSetNode, npcInside, npcSetInside, npcTemper, npcGoal, npcNeeds
//   - npcRangeProfile, npcMaxDist (villager-agency.js), agencyState
/* VILLAGER OBJECTIVES — src/js/villager-objectives.js
 *
 * Steve (2026-10-08): "people don't ever seem to leave haven. They shouldn't
 * just move randomly, they should pursue objectives."
 *
 * The old npcNodeTravel departure logic was four dice triggers (hungry→forage
 * 0.35, escape→leave 0.15, bold→explore 0.12, curious 0.04) — in a fed village
 * the hunger trigger rarely fires and most of the roster sits. While away,
 * movement was pure random drift. This module replaces the departure decision
 * with OBJECTIVES and gives away-movement a target plus meander:
 *
 * 1. OBJECTIVES — each villager holds one: FORAGE, WATER, TRAPS, VISIT,
 *    HAVEN_CHORE, EXPLORE, REST, EAT, LEAVE (escape). Re-picked at dawn and when
 *    idle. Outdoor kinds carry a target node and a tightness (max nodes out,
 *    max parts). Indoor kinds keep people home with real lives.
 * 2. DEPARTURE DANGER CHECK — before leaving: recent monster activity (from
 *    village gossip), rain, distance, temperament. GO / ASK (find a companion
 *    — both go, gossiped) / TIGHTEN (short nearby errand only) / DEFER (stay,
 *    take an indoor objective). Night never leaves (hard rule, kept).
 * 3. MOVEMENT WITH DRIFT — each part, step toward the target; 35% of the time
 *    step somewhere adjacent instead (meander → encounters). Co-location with
 *    another villager sometimes produces a seen-together beat.
 * 4. INDOOR vs OUTDOOR — indoor objectives (chores, rest, teach, socialize)
 *    hold villagers inside the hall; the objective generator still pushes
 *    people out because water/forage/traps can't be done inside.
 * 5. NOMADIC RANGE — npcRangeProfile/npcMaxDist (villager-agency.js): explorers
 *    range to 6 nodes, homebodies stay tight. The driven go farther (kept).
 * 6. HONESTY — departures/returns/asks are said (player present) and gossiped
 *    (departure). The base away/return machinery (pantry stocking on forage
 *    return, explorer news, escape) is preserved and extended, not replaced.
 *
 * Every part away costs hunger/energy through npcNeeds — the engine already
 * tracks it, this just charges it honestly.
 *
 * Self-attaching module. Load after villager-agency.js (uses npcRangeProfile,
 * npcMaxDist, agencyState; wraps npcNodeTravel after agencyTick).
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var pick = function (a) { return a[Math.floor(R() * a.length)]; };
  var clampN = function (n) { return Math.max(0, Math.min(8, n)); }; // 9x9 world

  var DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

  var methods = {

    // ---------- STATE ----------
    objState() {
      var v = this.state.village;
      v.objectives = v.objectives || {};
      return v.objectives;
    },
    // objDist: trip distance in STEPS (chebyshev). The world moves
    // 8-directionally — a diagonal is one step, not two. Tightness, range,
    // and danger all speak steps.
    objDist(ax, ay, bx, by) {
      return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    },
    objOf(vid) {
      var o = this.objState();
      if (!o[vid]) o[vid] = { kind: 'idle', state: 'idle' };
      return o[vid];
    },

    // ---------- 1. OBJECTIVE PICKING ----------
    // Called at dawn (dayPart 0) and whenever a villager is idle at haven.
    objPick(vid, hx, hy) {
      var o = this.objOf(vid);
      var v = this.state.village;
      var vp = {};
      try { vp = this.vpOf(vid) || {}; } catch (e) {}
      if (vp.dead) { o.kind = 'idle'; o.state = 'idle'; return o; }
      o.tightened = false; // fresh pick: not a danger-tightened trip
      var n = {};
      try { n = this.npcNeeds(vid); } catch (e) {}
      var goal = null;
      try { goal = this.npcGoal(vid); } catch (e) {}
      var temp = 'steady';
      try { temp = this.npcTemper(vid); } catch (e) {}
      var prof = 'forager';
      try { prof = this.npcRangeProfile(vid); } catch (e) {}
      var maxD = 1;
      try { maxD = Math.max(0, this.npcMaxDist(vid)); } catch (e) {}

      // the escape goal: they leave. Maybe for good. (kept from base)
      if (goal === 'escape') {
        o.kind = 'LEAVE'; o.purpose = 'leave'; o.state = 'ready';
        // they walk AWAY — a far node, not the haven doorstep. Duration 999:
        // the base return clock never brings them home.
        var ld = pick(DIRS8), ldist = 4 + Math.floor(R() * 3);
        o.tx = clampN(hx + ld[0] * ldist); o.ty = clampN(hy + ld[1] * ldist);
        o.tightness = 8; o.partsLeft = 999;
        o.indoor = false; o.targetVid = null; o.companion = null;
        return o;
      }
      // body first: rest when spent
      if ((n.energy || 70) < 35) {
        o.kind = 'REST'; o.purpose = 'rest'; o.state = 'indoor';
        o.indoor = true; o.targetVid = null; o.companion = null;
        o.partsLeft = 2 + Math.floor(R() * 3);
        return o;
      }
      var pantry = 0;
      try { pantry = this.pantryKcalLive(v); } catch (e) {}
      // EAT — hungry and the pantry has food: go eat. Indoor, at the fire.
      // (meals-like-people 2026-10-08: hunger is a real need now, driven by
      // real individual meals in villageEats — the EAT objective is the
      // visible behavior: they go to the hall and eat, like people.)
      if ((n.hunger || 0) > 55 && pantry > 500) {
        o.kind = 'EAT'; o.purpose = 'eat'; o.state = 'indoor';
        o.indoor = true; o.targetVid = null; o.companion = null;
        o.partsLeft = 1 + Math.floor(R() * 2);
        return o;
      }
      var water = 99;
      try { water = ((v.water || {}).clean == null) ? 99 : v.water.clean; } catch (e) {}
      var cands = [];
      // FORAGE — the village eats, or they do. Homebodies only go when hungry.
      if (pantry < 4000 || (n.hunger || 0) > 50) {
        var w = pantry < 2000 ? 4 : pantry < 4000 ? 2.5 : 1.5;
        if (prof === 'homebody' && pantry >= 2000 && (n.hunger || 0) <= 60) w = 0;
        if (w > 0) cands.push({ kind: 'FORAGE', w: w });
      }
      // WATER — the well runs dry; someone has to walk.
      if (water < 3) cands.push({ kind: 'WATER', w: 3.5 });
      // TRAPS — only hands that know the wire. (knowledge-gated)
      if (vp.knowsSnare) cands.push({ kind: 'TRAPS', w: 1.6 });
      // VISIT — go find someone specific. Social, uses real familiarity.
      // Tight goals: don't cross the world for a chat — the target must be
      // within this villager's range (homebodies visit at home, not abroad).
      var visitT = this.objVisitTarget(vid);
      if (visitT) {
        var vtn = null;
        try { vtn = this.npcNode(visitT); } catch (e) {}
        var vdist = vtn ? this.objDist(vtn.nx, vtn.ny, hx, hy) : 0;
        if (vdist > Math.max(1, maxD)) visitT = null;
      }
      if (visitT) cands.push({ kind: 'VISIT', w: 1.2 + ((n.social || 40) > 60 ? 0.8 : 0), targetVid: visitT });
      // EXPLORE — nomads only.
      if ((prof === 'wanderer' || prof === 'explorer') && R() < 0.5) cands.push({ kind: 'EXPLORE', w: prof === 'explorer' ? 2 : 1.2 });
      // HAVEN_CHORE — indoor life. Always available; homebodies lean here.
      cands.push({ kind: 'HAVEN_CHORE', w: prof === 'homebody' ? 3 : 1.4 });
      var tot = 0, i;
      for (i = 0; i < cands.length; i++) tot += cands[i].w;
      var r = R() * tot, chosen = cands[cands.length - 1];
      for (i = 0; i < cands.length; i++) { r -= cands[i].w; if (r <= 0) { chosen = cands[i]; break; } }

      o.kind = chosen.kind; o.targetVid = chosen.targetVid || null;
      o.companion = null; o.indoor = false; o.state = 'ready';
      var dist = 1;
      if (chosen.kind === 'FORAGE') {
        o.purpose = 'forage'; dist = Math.max(1, Math.min(maxD, 1 + Math.floor(R() * 2)));
        o.partsLeft = 2 + Math.floor(R() * 3); o.tightness = dist;
      } else if (chosen.kind === 'WATER') {
        o.purpose = 'water'; dist = Math.min(1 + Math.floor(R() * 2), Math.max(1, maxD));
        o.partsLeft = 2 + Math.floor(R() * 2); o.tightness = dist;
      } else if (chosen.kind === 'TRAPS') {
        o.purpose = 'traps'; dist = Math.min(1 + Math.floor(R() * 2), Math.max(1, maxD));
        o.partsLeft = 2 + Math.floor(R() * 2); o.tightness = dist;
      } else if (chosen.kind === 'VISIT') {
        o.purpose = 'visit'; o.partsLeft = 3 + Math.floor(R() * 3);
        var tn = null;
        try { tn = this.npcNode(chosen.targetVid); } catch (e) {}
        if (tn && (tn.nx !== hx || tn.ny !== hy)) {
          // they're out there — go find them
          o.tx = tn.nx; o.ty = tn.ny;
          o.tightness = Math.abs(tn.nx - hx) + Math.abs(tn.ny - hy);
        } else {
          // they're home — this is an indoor social call
          o.indoor = true; o.state = 'indoor'; o.tx = hx; o.ty = hy;
          o.partsLeft = 2; o.tightness = 0;
          return o;
        }
      } else if (chosen.kind === 'EXPLORE') {
        o.purpose = 'explore'; dist = 1 + Math.floor(R() * Math.max(1, maxD));
        o.partsLeft = 3 + Math.floor(R() * 4); o.tightness = dist;
      } else { // HAVEN_CHORE
        o.purpose = 'chore'; o.indoor = true; o.state = 'indoor';
        o.tx = hx; o.ty = hy; o.tightness = 0;
        o.partsLeft = 2 + Math.floor(R() * 3);
        o.chore = pick(['fire', 'repair', 'teach', 'cook', 'sweep']);
        return o;
      }
      // outdoor target: a real direction, clamped to the 9x9 world
      var d = pick(DIRS8);
      o.tx = clampN(hx + d[0] * dist);
      o.ty = clampN(hy + d[1] * dist);
      if (o.tx === hx && o.ty === hy) { o.tx = clampN(hx + 1); }
      return o;
    },
    // VISIT target: someone they actually know — same fire-group, or someone
    // the village trusts (familiar face), or someone away worth checking on.
    objVisitTarget(vid) {
      var v = this.state.village;
      var roster = (v.roster || []).filter(function (id) {
        if (id === vid) return false;
        try { var vp = this.vpOf(id); if (vp && vp.dead) return false; } catch (e) {}
        try { if (this.isEngaged(id)) return false; } catch (e) {}
        return true;
      }, this);
      if (!roster.length) return null;
      var mates = {};
      try {
        for (var gi = 0; gi < (v.groups || []).length; gi++) {
          var gr = v.groups[gi];
          if (gr.members && gr.members.indexOf(vid) !== -1) {
            for (var mi = 0; mi < gr.members.length; mi++) mates[gr.members[mi]] = true;
          }
        }
      } catch (e) {}
      var scored = [];
      for (var i = 0; i < roster.length; i++) {
        var id = roster[i], s = 0;
        if (mates[id]) s += 3;
        var tr = 0;
        try { tr = (v.trust || {})[id] || 0; } catch (e) {}
        if (tr > 40) s += 2; else if (tr > 20) s += 1;
        var away = null;
        try { away = (v.away || {})[id]; } catch (e) {}
        if (away) s += 2; // checking on someone out there is a real errand
        if (s > 0) scored.push({ id: id, s: s });
      }
      if (!scored.length) return null;
      scored.sort(function (a, b) { return b.s - a.s; });
      return scored[0].id;
    },

    // ---------- 2. DEPARTURE DANGER CHECK ----------
    // Before leaving: read the world. Recent monster activity comes from
    // village gossip (attack/death/murder within 3 days). Rain makes it
    // miserable. Distance and temperament move the needle.
    // Verdicts: go / ask (bring someone) / tighten (short errand only) / defer (stay).
    objDanger(vid, tx, ty, hx, hy) {
      var score = 0;
      var day = 0;
      try { day = this.state.scholar.day; } catch (e) {}
      try {
        var g = (this.state.village.gossip || []);
        for (var i = 0; i < g.length; i++) {
          var a = g[i].action;
          if ((a === 'attack' || a === 'murder') && day - (g[i].day || 0) <= 3) score += 2;
          else if (a === 'death' && day - (g[i].day || 0) <= 3) score += 1;
        }
        if (score > 4) score = 4;
      } catch (e) {}
      try { if (this.state.weather === 'rain') score += 1; } catch (e) {}
      var dist = this.objDist(tx, ty, hx, hy);
      var maxD = 1;
      try { maxD = Math.max(1, this.npcMaxDist(vid)); } catch (e) {}
      if (dist > maxD) score += 2;
      else if (dist > Math.ceil(maxD * 0.66)) score += 1;
      var temp = 'steady';
      try { temp = this.npcTemper(vid); } catch (e) {}
      if (temp === 'cautious' || temp === 'withdrawn') score += 1;
      if (temp === 'bold' || temp === 'restless') score -= 1;
      try { if (this.npcGoal(vid) === 'escape') score -= 2; } catch (e) {} // the desperate don't count danger
      if (score < 0) score = 0;
      var verdict = score <= 1 ? 'go' : score <= 3 ? 'ask' : score <= 5 ? 'tighten' : 'defer';
      return { score: score, verdict: verdict };
    },
    // objVillageDanger: the world-level part of the danger check (gossip +
    // weather, no distance). Used to gate expedition launches too.
    objVillageDanger() {
      var score = 0;
      var day = 0;
      try { day = this.state.scholar.day; } catch (e) {}
      try {
        var g = (this.state.village.gossip || []);
        for (var i = 0; i < g.length; i++) {
          var a = g[i].action;
          if ((a === 'attack' || a === 'murder') && day - (g[i].day || 0) <= 3) score += 2;
          else if (a === 'death' && day - (g[i].day || 0) <= 3) score += 1;
        }
        if (score > 4) score = 4;
      } catch (e) {}
      try { if (this.state.weather === 'rain') score += 1; } catch (e) {}
      return score;
    },
    // ASK: find someone to walk with. A companion with their own outdoor
    // errand is ideal; otherwise the willing (bold, warm, trusting, sociable).
    // Both are marked away together, and the village hears about it.
    objAskCompanion(vid, obj, hx, hy) {
      var v = this.state.village;
      var roster = v.roster || [];
      var tripDist = this.objDist(obj.tx, obj.ty, hx, hy);
      var cands = [];
      for (var i = 0; i < roster.length; i++) {
        var id = roster[i];
        if (id === vid || id === this.villagerId) continue;
        var vp = null;
        try { vp = this.vpOf(id); } catch (e) {}
        if (vp && vp.dead) continue;
        try { if (this.isEngaged(id)) continue; } catch (e) {}
        try { if ((v.away || {})[id]) continue; } catch (e) {}
        var node = null;
        try { node = this.npcNode(id); } catch (e) { continue; }
        if (!node || node.nx !== hx || node.ny !== hy) continue;
        // tight goals: the companion must actually be willing to walk that far
        var cmax = 1;
        try { cmax = Math.max(1, this.npcMaxDist(id)); } catch (e) {}
        if (tripDist > cmax) continue;
        var co = this.objOf(id);
        var s = 0;
        if (co && !co.indoor && co.state === 'ready' && co.kind !== 'LEAVE') s += 4; // their own errand — natural pair
        var t = 'steady';
        try { t = this.npcTemper(id); } catch (e) {}
        if (t === 'bold' || t === 'warm') s += 2;
        var tr = 0;
        try { tr = (v.trust || {})[id] || 0; } catch (e) {}
        if (tr > 40) s += 1;
        var nn = null;
        try { nn = this.npcNeeds(id); } catch (e) {}
        if (nn && (nn.social || 0) > 65) s += 1;
        if (s > 0) cands.push({ id: id, s: s });
      }
      if (!cands.length) return null;
      cands.sort(function (a, b) { return b.s - a.s; });
      var cid = cands[0].id;
      // the companion walks with them: same target, same clock, purpose 'guard'
      var co2 = this.objOf(cid);
      co2.kind = 'GUARD'; co2.purpose = 'guard'; co2.state = 'ready';
      co2.tx = obj.tx; co2.ty = obj.ty; co2.targetVid = vid;
      co2.tightness = obj.tightness; co2.partsLeft = obj.partsLeft;
      co2.indoor = false; co2.companion = vid;
      obj.companion = cid;
      return cid;
    },
    objDepart(vid, obj, hx, hy, playerAtHaven) {
      var v = this.state.village;
      var s = this.state.scholar;
      var node = null;
      try { node = this.npcNode(vid); } catch (e) { return; }
      this.npcSetNode(vid, obj.tx, obj.ty);
      try { this.npcSetInside(vid, false); } catch (e) {}
      v.away = v.away || {};
      v.away[vid] = {
        nx: obj.tx, ny: obj.ty, purpose: obj.purpose,
        sinceDay: s.day, sincePart: this.dayPart, duration: obj.partsLeft,
      };
      obj.state = 'out';
      var nm = 'Someone';
      try { nm = this.displayName(vid); } catch (e) {}
      var purposeLine = {
        forage: 'heads out to forage. "Back before dark. Probably."',
        water: 'heads out for water. "The well won\'t fill itself."',
        traps: 'heads out to check the snares. "Wire doesn\'t lie."',
        visit: 'sets out to find ' + (function () { try { return this.displayName(obj.targetVid); } catch (e) { return 'someone'; } }.call(this)) + '. "Won\'t be long."',
        explore: 'wanders off. "I want to see what\'s out there."',
        leave: 'walks away from Haven. They don\'t look back.',
        guard: 'walks out with ' + (function () { try { return this.displayName(obj.targetVid); } catch (e) { return 'someone'; } }.call(this)) + '. "Nobody walks alone today."',
      }[obj.purpose] || 'heads out.';
      if (playerAtHaven) this.say((obj.companion ? '👥 ' : '') + nm + ' ' + purposeLine);
      // leaving is gossip-worthy. Two witnesses so the rumor can travel.
      try {
        var seen = (v.roster || []).filter(function (id) { return id !== vid && id !== this.villagerId; }, this);
        var shuf = seen.slice();
        for (var i = shuf.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = shuf[i]; shuf[i] = shuf[j]; shuf[j] = t; }
        var dims = { who: vid };
        if (obj.companion) dims.with = obj.companion;
        this.seedGossip('departure', dims, shuf.slice(0, 2));
      } catch (e) {}
    },

    // ---------- 3. THE DEPARTURE DECISION (replaces the dice triggers) ----------
    // Called from npcNodeTravel for each villager at haven, once per day-part.
    objMaybeDepart(rid, node, atHaven, hx, hy) {
      if (!atHaven) return;
      var v = this.state.village;
      // expeditions (agency) own their departures; don't double-book
      try {
        var ast = this.agencyState();
        if (ast.exped && ast.exped[rid]) return;
      } catch (e) {}
      if ((v.away || {})[rid]) return;
      try { if (this.isEngaged(rid)) return; } catch (e) {}
      // SICK: the feverish stay home (parity 2026-10-08 — villagers get sick now)
      try { if ((v.sick || {})[rid]) return; } catch (e) {}
      var o = this.objOf(rid);
      // idle or done → pick fresh (dawn re-pick happens in objTick, but a
      // villager can finish mid-day and should decide again, not sit)
      if (!o.kind || o.kind === 'idle' || o.state === 'done' || o.state === 'indoor') {
        // indoor objectives are handled by objTick; nothing to depart for
        if (o.state === 'indoor') return;
        this.objPick(rid, hx, hy);
        o = this.objOf(rid);
        if (!o.kind || o.kind === 'idle' || o.indoor || o.state === 'indoor') return;
      }
      if (o.state === 'out' || o.indoor) return;
      if (o.state !== 'ready') return;
      var playerAtHaven = false;
      try { playerAtHaven = (this.map.px === hx && this.map.py === hy); } catch (e) {}
      // escape: the desperate don't do danger checks
      if (o.kind === 'LEAVE') { this.objDepart(rid, o, hx, hy, playerAtHaven); return; }
      var dg = this.objDanger(rid, o.tx, o.ty, hx, hy);
      if (dg.verdict === 'go') {
        this.objDepart(rid, o, hx, hy, playerAtHaven);
      } else if (dg.verdict === 'ask') {
        var cid = this.objAskCompanion(rid, o, hx, hy);
        if (cid) {
          this.objDepart(rid, o, hx, hy, playerAtHaven);
          // the companion walks out with them, same part
          var co = this.objOf(cid);
          this.objDepart(cid, co, hx, hy, playerAtHaven);
          try { this.bumpTrust(rid, 1); this.bumpTrust(cid, 1); } catch (e) {}
        } else {
          // nobody to walk with → tighten or stay
          this.objTightenOrDefer(rid, o, hx, hy, playerAtHaven);
        }
      } else if (dg.verdict === 'tighten') {
        this.objTightenOrDefer(rid, o, hx, hy, playerAtHaven);
      } else {
        // defer: stay home, take indoor work instead
        o.kind = 'HAVEN_CHORE'; o.purpose = 'chore'; o.indoor = true; o.state = 'indoor';
        o.tx = hx; o.ty = hy; o.tightness = 0; o.partsLeft = 2 + Math.floor(R() * 2);
        o.chore = pick(['fire', 'repair', 'sweep', 'cook']);
        o.targetVid = null; o.companion = null;
      }
    },
    objTightenOrDefer(rid, o, hx, hy, playerAtHaven) {
      // TIGHTEN: only accept a short nearby errand. FORAGE/WATER/TRAPS can
      // shrink to 1 node and a short clock; EXPLORE and far VISITs defer.
      var ok = (o.kind === 'FORAGE' || o.kind === 'WATER' || o.kind === 'TRAPS');
      if (ok) {
        // orthogonal only: a tightened trip is EXACTLY 1 node out, never a
        // diagonal 2. (DIRS8 diagonals would break the promise.)
        var d = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        o.tx = clampN(hx + d[0]); o.ty = clampN(hy + d[1]);
        if (o.tx === hx && o.ty === hy) o.tx = clampN(hx + 1);
        o.tightness = 1; o.partsLeft = Math.min(o.partsLeft, 2);
        o.state = 'ready'; o.tightened = true; // short leash: no meandering out
        this.objDepart(rid, o, hx, hy, playerAtHaven);
      } else {
        o.kind = 'HAVEN_CHORE'; o.purpose = 'chore'; o.indoor = true; o.state = 'indoor';
        o.tx = hx; o.ty = hy; o.tightness = 0; o.partsLeft = 2 + Math.floor(R() * 2);
        o.chore = pick(['fire', 'repair', 'sweep', 'cook']);
        o.targetVid = null; o.companion = null;
      }
    },

    // ---------- 4. AWAY MOVEMENT: pursue, meander, cost ----------
    // Called from npcNodeTravel for each away villager, once per day-part.
    // Replaces the old pure-random drift: step toward the objective target,
    // but 35% of the time step somewhere adjacent instead — they meander,
    // run into people, get seen. Every part out costs hunger and energy.
    objAwayStep(rid, node, away, hx, hy) {
      // agency expeditions move themselves
      try {
        var ast = this.agencyState();
        if (ast.exped && ast.exped[rid]) return;
      } catch (e) {}
      var o = this.objOf(rid);
      var tx = (o && o.state === 'out' && o.tx != null) ? o.tx : away.nx;
      var ty = (o && o.state === 'out' && o.ty != null) ? o.ty : away.ny;
      var returning = !o || o.state !== 'out';
      if (returning) { tx = hx; ty = hy; } // objective done or lost: head home; the base return clock brings them in
      var nx = node.nx, ny = node.ny;
      var leashed = !!(o && o.tightened); // danger-tightened: short leash, no meander
      var ox = nx, oy = ny; // pre-step position (for the tightness guard)
      if (nx !== tx || ny !== ty) {
        if (!leashed && R() < 0.35) {
          // meander: a step somewhere adjacent
          var dx = Math.floor(R() * 3) - 1, dy = Math.floor(R() * 3) - 1;
          if (dx || dy) { nx = clampN(nx + dx); ny = clampN(ny + dy); }
        } else {
          // pursue: one step toward the target
          nx = clampN(nx + Math.sign(tx - nx));
          ny = clampN(ny + Math.sign(ty - ny));
        }
      } else if (!returning && !leashed && o && o.partsLeft > 1 && R() < 0.5) {
        // AT THE SITE, clock still running: work the area instead of standing
        // still — forage the patch, check around the snares. Stays near the
        // target; the pursue logic pulls them back if they drift.
        var mdx = Math.floor(R() * 3) - 1, mdy = Math.floor(R() * 3) - 1;
        if (mdx || mdy) {
          var mx = clampN(nx + mdx), my = clampN(ny + mdy);
          if (Math.abs(mx - tx) + Math.abs(my - ty) <= 2) { nx = mx; ny = my; }
        }
      }
      // TIGHTNESS IS A TRIP RADIUS: no step (meander or area-work) may take
      // them farther from haven than the objective allows. Homebodies stay
      // home; tightened trips stay tight. The walk home is always allowed.
      if (!returning && o && o.tightness != null) {
        if (this.objDist(nx, ny, hx, hy) > o.tightness) { nx = ox; ny = oy; }
      }
      if (nx !== ox || ny !== oy) this.npcSetNode(rid, nx, ny);
      // the walk costs: hunger up, energy down (npcNeeds is the engine's ledger)
      try {
        var nn = this.npcNeeds(rid);
        nn.hunger = Math.min(100, (nn.hunger || 0) + 3);
        nn.energy = Math.max(0, (nn.energy || 70) - 4);
      } catch (e) {}
      if (o && o.partsLeft != null) o.partsLeft--;
      // arrived at a VISIT target: the visit happens
      if (o && o.state === 'out' && o.kind === 'VISIT' && o.targetVid) {
        var tn = null;
        try { tn = this.npcNode(o.targetVid); } catch (e) {}
        if (tn && tn.nx === nx && tn.ny === ny) {
          try {
            this.bumpTrust(rid, 2); this.bumpTrust(o.targetVid, 2);
            var v = this.state.village;
            v.objectives[o.targetVid] = v.objectives[o.targetVid] || { kind: 'idle', state: 'idle' };
            this.seedGossip('deed', { generous: 2, who: rid }, [o.targetVid]);
          } catch (e) {}
          o.state = 'returning';
        }
      }
      // co-location: run into someone out here. Sometimes the village hears.
      try {
        var others = this.npcsOnNode(nx, ny).filter(function (id) {
          return id !== rid && ((this.state.village.away || {})[id]);
        }, this);
        if (others.length && R() < 0.25) {
          var other = pick(others);
          this.bumpTrust(rid, 1); this.bumpTrust(other, 1);
          var pHere = false;
          try { pHere = (this.map.px === nx && this.map.py === ny); } catch (e) {}
          if (pHere) {
            var a1 = 'Someone', a2 = 'Someone';
            try { a1 = this.displayName(rid); a2 = this.displayName(other); } catch (e) {}
            this.say(`👥 Out here, of all places — ${a1} and ${a2} run into each other. They stop and talk a while.`);
          }
        }
      } catch (e) {}
    },

    // ---------- 5. INDOOR LIFE ----------
    // Runs after the base loop each day-part. Indoor-objective holders stay
    // inside (the door drift may have moved them; their objective holds them),
    // live their chore/rest/social, and cost less than the walkers.
    objTick() {
      if (this.over) return;
      var v = this.state.village;
      var hx = v.px ?? 4, hy = v.py ?? 4;
      var dawn = false;
      try { dawn = (this.dayPart === 0); } catch (e) {}
      var playerAtHaven = false;
      try { playerAtHaven = (this.map.px === hx && this.map.py === hy); } catch (e) {}
      var roster = v.roster || [];
      for (var i = 0; i < roster.length; i++) {
        var rid = roster[i];
        if (rid === this.villagerId) continue;
        var vp = null;
        try { vp = this.vpOf(rid); } catch (e) {}
        if (vp && vp.dead) continue;
        try { if (this.isEngaged(rid)) continue; } catch (e) {}
        var o = this.objOf(rid);
        var away = (v.away || {})[rid];
        // expeditions (agency) own these villagers: keep the objective
        // truthful — they're out exploring, not on indoor chores.
        try {
          var ast2 = this.agencyState();
          if (ast2.exped && ast2.exped[rid]) {
            var ex = ast2.exped[rid];
            o.kind = 'EXPLORE'; o.purpose = 'expedition'; o.state = 'out';
            o.indoor = false; o.tx = ex.tx; o.ty = ex.ty;
            o.targetVid = null; o.companion = null;
            continue; // agency moves them; nothing more to do here
          }
        } catch (e) {}
        // dawn: everyone re-decides. Idle villagers pick up a life.
        if (dawn && !away) {
          try {
            var ast = this.agencyState();
            if (!(ast.exped && ast.exped[rid])) {
              if (!o.kind || o.kind === 'idle' || o.state === 'done' || o.state === 'returning') this.objPick(rid, hx, hy);
            }
          } catch (e) {}
          o = this.objOf(rid);
        }
        if (away) continue; // the away machinery (base + objAwayStep) owns them
        // stale out-objective: home with no away entry and no expedition — the
        // trip ended without the objective closing (e.g. expedition return).
        // Don't sit on a dead errand; re-decide below.
        if (o.state === 'out' && !o.indoor) { o.state = 'done'; o.kind = 'idle'; }
        var node = null;
        try { node = this.npcNode(rid); } catch (e) { continue; }
        if (!node || node.nx !== hx || node.ny !== hy) continue;
        if (!o.indoor || o.state !== 'indoor') {
          // no indoor objective: make sure they have one rather than sitting
          // in the decision gap (objMaybeDepart already ran this part; the
          // indoor set is the fallback life, not a second departure roll)
          if (!o.kind || o.kind === 'idle' || o.state === 'done') this.objPick(rid, hx, hy);
          o = this.objOf(rid);
          // a fresh indoor pick starts living it THIS part, not next
          if (!o.indoor || o.state !== 'indoor') continue;
        }
        // indoor: hold the door, live the chore
        try { if (!this.npcInside(rid)) this.npcSetInside(rid, true); } catch (e) {}
        try {
          var nn = this.npcNeeds(rid);
          nn.hunger = Math.min(100, (nn.hunger || 0) + 1);
          if (o.kind === 'REST') nn.energy = Math.min(100, (nn.energy || 0) + 9);
        } catch (e) {}
        if (o.partsLeft != null) { o.partsLeft--; if (o.partsLeft <= 0) { o.state = 'done'; o.kind = 'idle'; } }
        if (R() >= 0.22) continue; // most indoor life is quiet
        var nm = 'Someone';
        try { nm = this.displayName(rid); } catch (e) {}
        if (o.kind === 'REST') {
          if (playerAtHaven) this.say(`😴 ${nm} is sleeping by the fire.`);
        } else if (o.kind === 'EAT') {
          // visible hunger, answered: they went to the hall and ate
          if (playerAtHaven && R() < 0.5) this.say(`🍲 ${nm} is eating by the fire — not talking, just eating.`);
        } else if (o.kind === 'HAVEN_CHORE') {
          var lines = {
            fire: `${nm} is tending the fire, coaxing it steady.`,
            repair: `${nm} is mending something by the door — patient work.`,
            teach: null, // handled below
            cook: `${nm} is working the cookpot, tasting, adjusting.`,
            sweep: `${nm} is sweeping the hall. Someone has to.`,
          };
          if (o.chore === 'teach') {
            // teach what they actually know (agency's earned lessons)
            var taught = false;
            try {
              var lessons = this.npcFieldLessons ? this.npcFieldLessons(rid) : [];
              if (lessons.length) {
                var mates = roster.filter(function (id) { return id !== rid && id !== this.villagerId; }, this);
                var tn2 = null, tm = null;
                try { tn2 = this.npcNode(pick(mates)); } catch (e) {}
                if (mates.length) {
                  tm = pick(mates);
                  var tnode = null;
                  try { tnode = this.npcNode(tm); } catch (e) {}
                  if (tnode && tnode.nx === hx && tnode.ny === hy) {
                    var tname = 'someone';
                    try { tname = this.displayName(tm); } catch (e) {}
                    this.bumpTrust(rid, 1); this.bumpTrust(tm, 1);
                    this.seedGossip('deed', { generous: 2, who: rid }, [tm]);
                    taught = true;
                    if (playerAtHaven) this.say(`📖 ${nm} is showing ${tname} something from the wild — leaf, stem, smell.`);
                  }
                }
              }
            } catch (e) {}
            if (!taught && playerAtHaven) this.say(`📖 ${nm} is talking through something they learned out there. Someone's listening.`);
          } else if (lines[o.chore] && playerAtHaven) {
            this.say(lines[o.chore]);
          }
        } else if (o.kind === 'VISIT' && o.targetVid) {
          // indoor social call: the visit happens at home
          var tnode2 = null;
          try { tnode2 = this.npcNode(o.targetVid); } catch (e) {}
          if (tnode2 && tnode2.nx === hx && tnode2.ny === hy && R() < 0.5) {
            try {
              this.bumpTrust(rid, 1); this.bumpTrust(o.targetVid, 1);
              var nn2 = this.npcNeeds(rid); nn2.social = Math.max(0, (nn2.social || 40) - 15);
              if (playerAtHaven) {
                var tname2 = 'someone';
                try { tname2 = this.displayName(o.targetVid); } catch (e) {}
                this.say(`💬 ${nm} is sitting with ${tname2}, talking low. Not business. Just people.`);
              }
            } catch (e) {}
          }
        }
      }
    },

    // ---------- 6. RETURN EFFECTS for the new purposes ----------
    // The base return block handles forage/explore/leave; these extend it.
    // Called from the base return path (surgical hook in npcNodeTravel).
    objReturnEffect(vid, purpose) {
      var v = this.state.village;
      var nm = 'Someone';
      try { nm = this.displayName(vid); } catch (e) {}
      var playerAtHaven = false;
      try { playerAtHaven = (this.map.px === (v.px ?? 4) && this.map.py === (v.py ?? 4)); } catch (e) {}
      if (purpose === 'water') {
        var n = 2 + Math.floor(R() * 3);
        v.water = v.water || { clean: 0 };
        v.water.clean = (v.water.clean || 0) + n;
        if (playerAtHaven) this.say(`💧 ${nm} returns with water: +${n} clean.`);
        try { this.bumpTrust(vid, 1); } catch (e) {}
      } else if (purpose === 'traps') {
        if (R() < 0.4) {
          var kcal = 100 + Math.floor(R() * 300);
          try { this.stockPantry(kcal, 'Snared meat'); } catch (e) {}
          if (playerAtHaven) this.say(`🪤 ${nm} is back from the snares: +${kcal} kcal to the pantry.`);
        } else if (playerAtHaven) {
          this.say(`🪤 ${nm} is back. "Snares were empty. They'll keep."`);
        }
        try { this.bumpTrust(vid, 1); } catch (e) {}
      } else if (purpose === 'visit' || purpose === 'guard') {
        if (playerAtHaven) {
          var withLine = '';
          var withId = null;
          try {
            var o = this.objOf(vid);
            if (o.companion) { withLine = ' with ' + this.displayName(o.companion); withId = o.companion; }
            else if (o.targetVid) { withLine = ' — found ' + this.displayName(o.targetVid).split(' ')[0]; withId = o.targetVid; }
          } catch (e) {}
          this.say(`🚶 ${nm} is back${withLine}.`);
        }
        // BONDS (pacing build 2026-10-10): a completed visit with someone —
        // miles walked together, stories traded. +4.
        try { if (withId && this.bondAdd) this.bondAdd(vid, withId, 4, 'visit'); } catch (e) {}
        try { this.seedGossip('return', { who: vid }, []); } catch (e) {}
      }
      // objective complete
      var oo = this.objOf(vid);
      oo.state = 'done'; oo.kind = 'idle'; oo.companion = null; oo.targetVid = null;
    },
  };

  Object.assign(G, methods);

  // ============ WRAPS (chain-safe) ============
  (function attach() {
    // after the base away-system AND agency run each day-part, run objectives:
    // dawn re-picks, indoor life, door-holding.
    var _nnt = G.npcNodeTravel;
    G.npcNodeTravel = function () {
      if (_nnt) _nnt.call(this);
      try { this.objTick(); } catch (e) {}
    };
  })();
})();
