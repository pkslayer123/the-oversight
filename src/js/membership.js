// @ontology
// system: membership
// description: Village membership. Joining, leaving, exile status — plus the exile arc (moment → road → founding) and belonging texture.
// provides:
//   - isMember(vid)
//   - mshipState()
//   - acceptApplication(app)
//   - refuseApplication(app)
//   - genApplicant()
//   - judgeApplication(app)
//   - considerApplications()
//   - rejoinMembership()
//   - severMembership(vid)
//   - housingCap()
//   - foodSupports(n)
//   - exileArcState()
//   - exileManifest()
//   - describeExile(how)
//   - beginExileRoad()
//   - roadDaily()
//   - _roadEatFromPack(need)
//   - forkVillage(opts)
//   - genSettler()
//   - standingSummary(vid)
//   - foodSupportsSpeech(n)
//   - severMembershipSocial(vid)
//   - applicantBackstory(app)
//   - readmissionConditions()
//   - seekReadmission()
// rules:
//   - Exile is an arc (moment → road → founding), not a flag flip (code: membership.js)
//   - The exile moment is spoken: keep/lose manifest, no silent severing (code: membership.js)
//   - The road-between is pack-only survival: the pack covers the day's REAL burn (dailyNeed, what resolveDay takes) — hunger is real, monsters are curious (code: membership.js)
//   - forkVillage delegates to the canonical hard-reset fork (betrayal.js); membership stages the arc and speaks the founding (code: membership.js)
//   - Readmission is never automatic: conditions are itemized and the petition is announced (code: membership.js)
//   - Death on the road ends the exile with the body: the pack stays where they fell (no phantom pantry), the road arc closes, the new bearer starts clean — spoken, never silent (code: membership.js)
//   - Severing is social: the old village remembers, other villages hear (code: membership.js)
//   - Settlers/applicants are unique composed people — never a fixed cast (code: membership.js)
//   - foodSupports projections are spoken honestly when they deny (code: membership.js)
// consumes:
//   - village.members
//   - scholar.exiled
//   - scholar.kcal
//   - scholar.inventory
//   - scholar.health
//   - state.pastVillages
//   - state.village
/* VILLAGE MEMBERSHIP — src/js/membership.js
 *
 * Steve: "Villages shouldn't strictly require presence or check ins. Unless
 * exiled, I think a villager stays tied to that village and reaps the
 * benefits. If the haven is strong enough maybe some of them apply remotely.
 * And the village could grow in size to allow for more people."
 *
 * Steve (architectural): "this also allows us to more easily expand to the
 * network and regional or national effects without much trouble." Villages
 * are nodes; members are the edges. The network stage is this graph getting
 * denser. Design so it scales without rework.
 *
 * What this module builds:
 * 1. MEMBERSHIP WITHOUT PRESENCE — explicit isMember(). No check-ins, no
 *    decay-by-distance. On the roster (and not severed) = a member, whether
 *    at Haven, three nodes out, or drifting. Benefits flow by right:
 *    pantry share (villageEats feeds the whole roster wherever they are),
 *    the codex (the village's book is theirs), "one of ours" standing with
 *    neighbors, and cast membership (the audience follows them).
 * 2. EXILE IS THE SEVERING — severMembership() makes the cut complete and
 *    legible: no pantry, no codex sync, not one of ours abroad. Rejoining
 *    (petition/founding) clears it.
 * 3. REMOTE APPLICATIONS — a strong haven attracts people who've heard
 *    (gossip, reputation, the broadcast). They apply without being present;
 *    the village judges (reputation, skills, mouths, roof). Accept/refuse
 *    with social weight. Big intakes get debated, not blocked.
 * 4. VILLAGE GROWTH — housing caps (expandable via buildShelter), food
 *    projections, notability-driven demand. Over-cap intake has honest
 *    consequences (crowding), not a hard wall.
 * 5. NETWORK HOOKS — regionalStanding() (member fame raises the village),
 *    alliances (allied villages recognize each other's members),
 *    memberReputationAbroad() (the village's name travels with its people),
 *    village-to-village applications (the prototype for regional population
 *    flow: applicant.fromVillage, judged with home standing).
 *
 * Self-attaching module. Load after codex-people.js. Chain-safe wraps.
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var pick = function (a) { return a[Math.floor(R() * a.length)]; };

  // Occupations a village is always glad to see. Loose match on formerOccupation.
  var NEEDY_OCC = ['cook', 'chef', 'baker', 'carpenter', 'builder', 'construction',
    'healer', 'nurse', 'doctor', 'medic', 'paramedic', 'veterinarian',
    'farmer', 'gardener', 'fisherman', 'hunter', 'blacksmith', 'mechanic', 'engineer'];

  var methods = {

    // ---------- STATE ----------

    mshipState() {
      var v = this.state.village || {};
      v.mship = v.mship || {};
      var m = v.mship;
      if (m.housing == null) m.housing = 12; // tents. Expandable.
      m.applications = m.applications || [];
      m.arrivals = m.arrivals || [];
      m.allies = m.allies || [];
      m.intakesThisWeek = m.intakesThisWeek || 0;
      m.intakeWeek = (m.intakeWeek != null) ? m.intakeWeek : -1;
      return m;
    },

    // ---------- 1. MEMBERSHIP CORE ----------

    // isMember: the whole rule in one place. On the roster, alive, not
    // severed. Distance is irrelevant — no presence requirement, no check-ins.
    isMember(vid, village) {
      var v = village || this.state.village || {};
      var id = vid || this.villagerId;
      // exile is the severing (player side)
      if (id === this.villagerId && this.state.scholar && this.state.scholar.exiled) return false;
      if ((v.severed || {})[id]) return false;
      var roster = v.roster || [];
      if (roster.indexOf(id) < 0) return false;
      try { var vp = this.vpOf(id); if (vp && vp.dead) return false; } catch (e) {}
      return true;
    },

    // memberBenefits: what membership IS, for legibility (Haven panel, etc.)
    memberBenefits(vid) {
      if (!this.isMember(vid)) return [];
      return [
        { key: 'pantry', label: 'Pantry share — the village feeds its own, wherever they are' },
        { key: 'codex', label: 'Codex — the village\'s book is theirs' },
        { key: 'protection', label: '"One of ours" — neighbors know the name' },
        { key: 'viewership', label: 'Cast — the audience follows them' },
      ];
    },

    // awayMembers: roster members not currently at Haven (expeditions etc.)
    // Membership needs no presence — this is informational, never punitive.
    awayMembers() {
      var out = [];
      try {
        var roster = (this.state.village.roster || []);
        var ag = null;
        try { ag = this.agencyState ? this.agencyState() : null; } catch (e) {}
        for (var i = 0; i < roster.length; i++) {
          var id = roster[i];
          if (id === this.villagerId) continue;
          var away = false;
          if (ag && ag.exped && ag.exped[id] && ag.exped[id].status === 'away') away = true;
          // npcNodeTravel away-system: villagers have node positions
          try {
            if (!away && this.npcNodePos && this.npcNodePos(id)) away = true;
          } catch (e2) {}
          if (away && this.isMember(id)) out.push(id);
        }
      } catch (e) {}
      return out;
    },

    // ---------- 2. PANTRY (distance-free by construction) ----------

    // pantryAccess: the exiled don't draw. Everyone else does — wherever.
    pantryAccess(vid) {
      return this.isMember(vid == null ? this.villagerId : vid);
    },

    // ---------- 3. EXILE IS THE SEVERING ----------

    // severMembership: the complete, legible cut. Called on exile.
    severMembership(vid, how) {
      var v = this.state.village || {};
      var id = vid || this.villagerId;
      v.severed = v.severed || {};
      v.severed[id] = { day: (this.state.scholar || {}).day || 0, how: how || 'exile' };
      if (id !== this.villagerId) {
        try { if (this.removeVillager) this.removeVillager(id, how); } catch (e) {}
      } else {
        // the book stays behind: no more village-synced knowledge
        try { this.state.scholar.codexCut = true; } catch (e) {}
      }
      return true;
    },

    // rejoinMembership: joining a new village (or founding a haven).
    // (Steve 2026-10-05): Exile sticks until you join another village OR
    // convince the village to trust you again. Joining a new village ends
    // YOUR exile (you're somewhere new, the mantle picks up there), but the
    // OLD village's severed record stays — they still remember. If you ever
    // go back, you'll need to earn trust.
    rejoinMembership() {
      var s = this.state.scholar || {};
      var wasExiled = !!s.exiled;
      try {
        s.codexCut = false;
        s.exiled = false; // you're somewhere new now — the exile is over for you
      } catch (e) {}
      // NOTE: we do NOT delete v.severed[id]. The old village still considers
      // you cut off. That's their record, not yours. If you return, the trust
      // rebuild mechanic (amends via justice system) is the path back.
      if (wasExiled) {
        try { this.say('The old village is behind you. The mantle picks up here now — new fire, new names, same codex.'); } catch (e) {}
      }
      return true;
    },

    // ---------- 4. HOUSING & GROWTH ----------

    housingCap() {
      return (this.mshipState().housing) || 12;
    },

    // buildShelter: +2 housing. Costs 10 wood from your pack and the work
    // of hands. Villages grow by building, not by wishing.
    buildShelter() {
      var inv = (this.state.scholar.inventory || []);
      var w = null;
      for (var i = 0; i < inv.length; i++) {
        if (inv[i].itemId === 'wood' || inv[i].id === 'wood') { w = inv[i]; break; }
      }
      var have = w ? (w.units || 0) : 0;
      if (have < 10) {
        this.say(`A new shelter takes 10 wood and willing hands. You have ${have}. The forest has the rest.`);
        return null;
      }
      w.units -= 10;
      if (w.units <= 0) inv.splice(inv.indexOf(w), 1);
      var m = this.mshipState();
      m.housing += 2;
      this.say(`Raised together: posts, canvas, a fire ring. Two more sleep warm. Housing is now ${m.housing}.`);
      try { if (this.journalNote) this.journalNote('village', 'housing', 'Built shelter. Housing ' + m.housing + '.'); } catch (e) {}
      return true;
    },

    // foodSupports: can the village feed `extra` more mouths? Projection
    // using the same math as villageEats (providesPerDay x knowledge).
    foodSupports(extra) {
      var v = this.state.village || {};
      var roster = v.roster || [];
      var give = 0, eat = 0;
      for (var i = 0; i < roster.length; i++) {
        var person = null;
        try {
          person = this.getPerson(roster[i]);
        } catch (e) {}
        if (!person) continue;
        var health = (v.health && v.health[roster[i]] !== undefined) ? v.health[roster[i]] : 100;
        var hf = health / 100;
        var known = (v.taught && v.taught[roster[i]]) ? v.taught[roster[i]].length : 0;
        var kf = Math.min(1.8, 1 + known * 0.10);
        var produced = (person.providesPerDay || 0) * hf * kf;
        var needed = (person.kcalPerDay || 2000) * (0.7 + 0.3 * hf);
        if (produced >= needed) give += (produced - needed) * 0.5;
        else eat += (needed - produced);
      }
      var net = eat - give; // daily shortfall at current size
      var pantryDays = 0;
      try {
        var pk = 0;
        for (var j = 0; j < (v.pantry || []).length; j++) pk += ((v.pantry[j].kcalEach || 0) * (v.pantry[j].units || 0));
        pantryDays = net > 0 ? pk / net : 999;
      } catch (e) {}
      var extraNeed = (extra || 0) * 2000;
      var ok = (net + extraNeed) <= Math.max(give * 0.5 + 4000, 2000);
      return { ok: ok, shortfall: Math.round(net), pantryDays: Math.round(pantryDays), extraNeed: extraNeed };
    },

    growthStatus() {
      var v = this.state.village || {};
      var used = (v.roster || []).length;
      var cap = this.housingCap();
      var fs = this.foodSupports(1);
      var notab = 0;
      try { notab = this.villageNotability ? this.villageNotability() : 0; } catch (e) {}
      return { housing: cap, used: used, room: cap - used, foodOk: fs.ok, food: fs, notability: notab };
    },

    // crowdingTick: over housing cap has honest consequences — trust frays,
    // sleep is rough. Not a wall: people still come. But the village feels it.
    crowdingTick() {
      try {
        var v = this.state.village || {};
        var over = (v.roster || []).length - this.housingCap();
        if (over <= 0) return;
        var t = v.trust || {};
        for (var i = 0; i < (v.roster || []).length; i++) {
          var id = v.roster[i];
          if (id === this.villagerId) continue;
          t[id] = Math.max(0, (t[id] || 20) - 1);
        }
        if (R() < 0.3) {
          this.say(`Too many bodies, not enough roof — ${over} sleeping rough. The village frays a little. Build shelter, or don't grow.`);
        }
      } catch (e) {}
    },

    // ---------- 5. REMOTE APPLICATIONS ----------

    // considerApplications: daily. A strong haven is HEARD — via gossip,
    // reputation, the broadcast. People apply without being present.
    considerApplications() {
      try {
        var v = this.state.village || {};
        if (this.state.scholar.exiled) return; // no applications for the cast-out
        var m = this.mshipState();
        if (m.applications.length >= 3) return; // inbox full
        var notab = 0;
        try { notab = this.villageNotability ? this.villageNotability() : 0; } catch (e) {}
        var view = 0;
        try { view = this.havenViewership ? this.havenViewership() : 0; } catch (e) {}
        var p = Math.max(0, (notab - 40) / 100) + view / 200;
        if (R() > p) return;
        var app = this.genApplicant();
        if (!app) return;
        m.applications.push(app);
        this.say(`📨 Word came: ${app.name} ${app.fromVillageName ? 'of ' + app.fromVillageName + ' ' : ''}wants to join Haven. "${app.reason}" — they haven't set foot here. The village will judge.`);
        try { if (this.journalNote) this.journalNote('village', 'application', app.name + ' applied remotely.'); } catch (e) {}
      } catch (e) {}
    },

    genApplicant() {
      var used = {};
      try {
        for (var i = 0; i < (this.state.village.roster || []).length; i++) used[this.state.village.roster[i]] = 1;
        for (var j = 0; j < (this.mshipState().applications || []).length; j++) used[this.mshipState().applications[j].id] = 1;
      } catch (e) {}
      var bg = [];
      try { bg = (this.data.background_survivors || []).filter(function (c) { return !used[c.id]; }); } catch (e) {}
      var c = null, id = null, name = null, occ = null;
      if (bg.length && R() < 0.7) {
        c = pick(bg);
        id = c.id; name = c.name; occ = c.formerOccupation;
      } else {
        // a drifter with a past, generated light
        id = 'app_' + Date.now().toString(36) + Math.floor(R() * 999);
        var occs = ['cook', 'carpenter', 'nurse', 'farmer', 'mechanic', 'teacher', 'hunter'];
        occ = pick(occs);
        name = 'a ' + pick(['tired', 'lean', 'weathered', 'young', 'quiet']) + ' ' + occ;
      }
      // reputation: what have we heard? better villages attract better heard-of people
      var view = 0;
      try { view = this.havenViewership ? this.havenViewership() : 0; } catch (e) {}
      var rr = R();
      var rep = rr < 0.15 ? 'bad' : (rr < (view > 20 ? 0.55 : 0.40) ? 'good' : 'unknown');
      // village-to-village: sometimes they come FROM somewhere (migration prototype)
      var fromVillage = null, fromVillageName = null;
      try {
        var ovs = (this.state.otherVillages || []).filter(function (ov) { return ov.generated || ov.day > 0; });
        if (ovs.length && R() < 0.35) {
          var ov = pick(ovs);
          fromVillage = ov.id; fromVillageName = ov.name || 'a far village';
        }
      } catch (e) {}
      var reasons = [
        'Heard about this place three valleys over. Had to try.',
        'My village is gone. Yours isn\'t. That\'s the whole of it.',
        'I saw you on the broadcast. You looked like people who eat.',
        'I can work. That\'s all I\'m selling.',
        'Word travels: Haven takes people in. I\'m people.',
      ];
      return {
        id: id, name: name, formerOccupation: occ, charId: (c && c.id) || null,
        reputation: rep, fromVillage: fromVillage, fromVillageName: fromVillageName,
        day: (this.state.scholar || {}).day || 0,
        reason: pick(reasons),
      };
    },

    // judgeApplication: the pipeline. Reputation, skills, mouths, roof —
    // and, for village-to-village applicants, the home village's standing.
    judgeApplication(app) {
      var score = 50, reasons = [];
      if (!app) return { score: 0, reasons: ['No application.'] };
      // REPUTATION: what have we heard?
      if (app.reputation === 'good') { score += 20; reasons.push('Word of them is good.'); }
      else if (app.reputation === 'bad') { score -= 30; reasons.push('You\'ve heard bad things.'); }
      else { reasons.push('Nobody knows them.'); }
      // SKILLS: what do they offer that the village needs?
      var occ = String(app.formerOccupation || '').toLowerCase();
      var needy = false;
      for (var i = 0; i < NEEDY_OCC.length; i++) {
        if (occ.indexOf(NEEDY_OCC[i]) >= 0) { needy = true; break; }
      }
      if (needy) { score += 10; reasons.push('A ' + app.formerOccupation + ' — the village could use one.'); }
      // FOOD: another mouth the pantry can (or can't) feed
      var fs = this.foodSupports(1);
      if (fs.ok) { score += 15; reasons.push('The pantry can carry one more.'); }
      else { score -= 20; reasons.push('Another mouth the pantry can\'t feed.'); }
      // ROOF
      var g = this.growthStatus();
      if (g.room > 0) { score += 10; reasons.push('There\'s roof to spare.'); }
      else { score -= 10; reasons.push('They\'d sleep rough.'); }
      // HOME STANDING (village-to-village): the village's name travels with them
      if (app.fromVillage) {
        var mod = this.villageStandingOf(app.fromVillage);
        if (mod >= 5) { score += 10; reasons.push(app.fromVillageName + ' vouches by reputation.'); }
        else if (mod <= -5) { score -= 10; reasons.push('Nobody trusts ' + (app.fromVillageName || 'that place') + '.'); }
        if (this.isAllied('haven', app.fromVillage)) { score += 10; reasons.push('They\'re one of an allied village — nearly one of ours already.'); }
      }
      return { score: Math.max(0, Math.min(100, score)), reasons: reasons };
    },

    acceptApplication(appId) {
      var m = this.mshipState();
      var idx = -1;
      for (var i = 0; i < m.applications.length; i++) if (m.applications[i].id === appId) { idx = i; break; }
      if (idx < 0) return null;
      var app = m.applications[idx];
      // BIG INTAKES get debated: the village weighs in, then you decide —
      // overruling a hostile room costs trust. Decisions, not chores.
      var g = this.growthStatus();
      var weekIntakes = this._weekIntakes();
      if (g.room <= 0 || (g.used + m.arrivals.length) >= g.housing + 3 || weekIntakes >= 3) {
        this.debateIntake(app);
        if (app.debateAgainst >= 60) {
          this.say(`You overrule the room. They'll remember that.`);
          var t = (this.state.village.trust || {});
          var roster = this.state.village.roster || [];
          for (var k = 0; k < roster.length; k++) {
            var rid = roster[k];
            if (rid === this.villagerId) continue;
            t[rid] = Math.max(0, (t[rid] || 20) - 3);
          }
        }
      }
      m.applications.splice(idx, 1);
      app.status = 'accepted';
      app.arriveDay = (this.state.scholar.day || 0) + 2 + Math.floor(R() * 3);
      m.arrivals.push(app);
      m.intakesThisWeek = weekIntakes + 1;
      this.say(`Accepted. ${app.name} is walking. They'll reach Haven in a few days — membership starts when they arrive, but the village already counts them.`);
      try { if (this.journalNote) this.journalNote('village', 'application', 'Accepted ' + app.name + '. Arrives ~day ' + app.arriveDay + '.'); } catch (e) {}
      return true;
    },

    refuseApplication(appId) {
      var m = this.mshipState();
      var idx = -1;
      for (var i = 0; i < m.applications.length; i++) if (m.applications[i].id === appId) { idx = i; break; }
      if (idx < 0) return null;
      var app = m.applications[idx];
      m.applications.splice(idx, 1);
      this.say(`You turn ${app.name} away. The road takes them. Word travels about that, too.`);
      try {
        this.seedGossip('refused_' + app.id, { generous: -4 }, (this.npcIds ? this.npcIds().slice(0, 3) : []));
        var bs = this.betrayalState ? this.betrayalState() : null;
        if (bs) bs.strangersHeard = (bs.strangersHeard || 0) + 1;
      } catch (e) {}
      return true;
    },

    // debateIntake: the village weighs a big intake. Weighted by trust —
    // the people you trust most count most. Sets app.debateAgainst (0-100).
    debateIntake(app) {
      var v = this.state.village || {};
      var roster = v.roster || [];
      var trust = v.trust || {};
      var forW = 0, againstW = 0;
      var voices = [];
      for (var i = 0; i < roster.length; i++) {
        var id = roster[i];
        if (id === this.villagerId) continue;
        var t = trust[id] || 20;
        // temperament: the generous welcome, the territorial resist
        var rc = null;
        try { rc = (v.rosterChars || {})[id]; } catch (e) {}
        var temper = rc && rc.temperament ? String(rc.temperament) : '';
        var welcoming = /generous|warm|kind|welcoming/.test(temper);
        var wary = /suspicious|territorial|cold|wary/.test(temper);
        var w = 10 + t;
        if (welcoming || (!wary && R() < 0.5)) { forW += w; }
        else { againstW += w; if (voices.length < 3) voices.push(id); }
      }
      var total = forW + againstW;
      app.debateAgainst = total > 0 ? Math.round(againstW / total * 100) : 50;
      var names = voices.map(function (vid) {
        try { return String(this.displayName(vid)).split(' ')[0]; } catch (e) { return 'someone'; }
      }, this).join(', ');
      this.say(`The village debates ${app.name}. ${app.debateAgainst >= 60 ? 'The room is cold — ' + (names || 'too many') + ' against. "More mouths, same fire."' : app.debateAgainst >= 40 ? 'Split room. Some for, some against. It\'s your call.' : 'Warm, mostly. "One more pair of hands."'} (${100 - app.debateAgainst}% for.)`);
      return app.debateAgainst;
    },

    _weekIntakes() {
      var m = this.mshipState();
      var day = (this.state.scholar || {}).day || 0;
      var week = Math.floor(day / 7);
      if (m.intakeWeek !== week) { m.intakeWeek = week; m.intakesThisWeek = 0; }
      return m.intakesThisWeek || 0;
    },

    // arrivalTick: the accepted walk in.
    arrivalTick() {
      try {
        var m = this.mshipState();
        var day = (this.state.scholar || {}).day || 0;
        var v = this.state.village || {};
        for (var i = m.arrivals.length - 1; i >= 0; i--) {
          var app = m.arrivals[i];
          if ((app.arriveDay || 0) > day) continue;
          m.arrivals.splice(i, 1);
          v.roster = v.roster || [];
          // ensure a character record exists
          var nid = app.charId || app.id;
          if (v.roster.indexOf(nid) < 0) v.roster.push(nid);
          var t = v.trust || (v.trust = {});
          if (t[nid] == null) t[nid] = 20;
          this.say(`🚶 ${app.name} walks in — pack light, eyes wide. Haven grows by one. (${v.roster.length} souls.)`);
          try { if (this.journalNote) this.journalNote('village', 'arrival', app.name + ' arrived and joined.'); } catch (e) {}
          this.memberReactions(nid);
        }
      } catch (e) {}
    },

    // memberReactions: the village notices newcomers. The generous welcome,
    // the territorial resent. Temperament, not a dice roll on nothing.
    memberReactions(nid) {
      try {
        var v = this.state.village || {};
        var roster = v.roster || [];
        var t = v.trust || {};
        var said = 0;
        for (var i = 0; i < roster.length && said < 2; i++) {
          var id = roster[i];
          if (id === this.villagerId || id === nid) continue;
          var rc = null;
          try { rc = (v.rosterChars || {})[id]; } catch (e) {}
          var temper = rc && rc.temperament ? String(rc.temperament) : '';
          var nm = 'Someone';
          try { nm = String(this.displayName(id)).split(' ')[0]; } catch (e2) {}
          if (/generous|warm|kind|welcoming/.test(temper)) {
            t[nid] = Math.min(100, (t[nid] || 20) + 4);
            if (R() < 0.4 && said < 2) { this.say(`${nm} shows the newcomer where the water is. Small kindnesses, fast.`); said++; }
          } else if (/suspicious|territorial|cold/.test(temper)) {
            t[nid] = Math.max(0, (t[nid] || 20) - 3);
            if (R() < 0.3 && said < 2) { this.say(`${nm} watches the newcomer the way you watch weather.`); said++; }
          }
        }
      } catch (e) {}
    },

    // ---------- 6. NETWORK SCALING (nodes & edges) ----------

    // regionalStanding: a village's weight in the region. Its own notability
    // PLUS its members' fame — a famous member raises the whole village.
    // This is the number other villages judge by, and the network stage's
    // gravity well. Works for home and away villages alike.
    regionalStanding(village) {
      var v = village || this.state.village || {};
      var standing = 0;
      try {
        if (v === this.state.village || v.id === 'haven' || !v.id) {
          standing += this.villageNotability ? this.villageNotability() : 0;
        } else {
          standing += (v.viewership || 10);
          standing += ((v.population || 10) - 10);
        }
      } catch (e) {}
      // member fame: deeds raise the village
      try {
        var fame = 0;
        var ag = this.agencyState ? this.agencyState() : null;
        if (ag && ag.ach) {
          for (var i = 0; i < ag.ach.length; i++) fame += (ag.ach[i].mag || 0);
        }
        standing += Math.round(fame / 4);
      } catch (e) {}
      return Math.round(standing);
    },

    // villageStandingOf: standing for any village by id ('haven' = home).
    villageStandingOf(villageId) {
      if (!villageId || villageId === 'haven') return this.regionalStanding();
      var ov = null;
      try { ov = (this.state.otherVillages || []).find(function (x) { return x.id === villageId; }); } catch (e) {}
      if (!ov) return 0;
      return this.regionalStanding(ov);
    },

    // Alliances: villages that recognize each other's members. Stored both
    // sides; the network stage will grow diplomacy on top of this.
    formAlliance(villageId) {
      var m = this.mshipState();
      if (m.allies.indexOf(villageId) < 0) m.allies.push(villageId);
      try {
        var ov = (this.state.otherVillages || []).find(function (x) { return x.id === villageId; });
        if (ov) { ov.allies = ov.allies || []; if (ov.allies.indexOf('haven') < 0) ov.allies.push('haven'); }
      } catch (e) {}
      var nm = 'them';
      try {
        var ov2 = (this.state.otherVillages || []).find(function (x) { return x.id === villageId; });
        nm = (ov2 && ov2.name) || nm;
      } catch (e) {}
      this.say(`An understanding with ${nm}: their people are nearly ours, and ours nearly theirs. The network has one more thread.`);
      return true;
    },

    isAllied(aId, bId) {
      try {
        if (aId === 'haven' || !aId) return (this.mshipState().allies || []).indexOf(bId) >= 0;
        var ov = (this.state.otherVillages || []).find(function (x) { return x.id === aId; });
        return ov && (ov.allies || []).indexOf(bId) >= 0;
      } catch (e) { return false; }
    },

    // recognizedAbroad: "one of ours" extends across alliances. An allied
    // village treats your members as guests — meal, roof, the benefit of
    // the doubt. THE hook the network stage builds on.
    recognizedAbroad(vid, otherVillage) {
      if (!this.isMember(vid)) return false;
      if ((this.state.village.severed || {})[vid]) return false;
      var ovId = otherVillage && otherVillage.id;
      if (!ovId) return false;
      return this.isAllied('haven', ovId);
    },

    // memberReputationAbroad: the village's name travels with its people.
    // Returns a standing modifier other villages' judgments can apply.
    // (Used mechanically in judgeApplication for village-to-village moves;
    // exposed as the hook for petition/trial judgments abroad.)
    memberReputationAbroad(vid) {
      if (!this.isMember(vid)) return -10; // the severed carry the cut with them
      var st = this.regionalStanding();
      if (st >= 60) return 10;
      if (st >= 40) return 5;
      if (st >= 20) return 0;
      return -5;
    },

    // ---------- 7. DAILY ----------

    membershipDaily() {
      try { this.considerApplications(); } catch (e) {}
      try { this.arrivalTick(); } catch (e) {}
      try { this.crowdingTick(); } catch (e) {}
    },

    // ---------- 8. EXILE ARC: moment → road → founding ----------
    //
    // Exile is not a flag flip. It has beats: the MOMENT (what you're told,
    // what you keep, what you lose), the ROAD-BETWEEN (pack-only survival —
    // hunger is real, monsters are curious), and the FOUNDING (a hard-reset
    // fork: new village object, fresh ties; you keep self/knowledge/pack).
    // The arc lives on the SCHOLAR — it survives the village fork, because
    // the road is walked by the person, not the place.

    // exileArcState: stages 'home' → 'moment' → 'road' → 'founding' → 'home'.
    exileArcState() {
      var s = this.state.scholar || {};
      s.exileArc = s.exileArc || {};
      var a = s.exileArc;
      if (!a.stage) a.stage = s.exiled ? 'road' : 'home';
      if (a.exiledDay == null) a.exiledDay = (s.exileStartDay != null) ? s.exileStartDay : (s.day || 0);
      a.roadDays = a.roadDays || 0;
      a.roadBeats = a.roadBeats || [];
      return a;
    },

    // exileManifest: the moment, legible. Exactly what the player KEEPS and
    // exactly what they LOSE. No silent actions — the severing is spoken.
    exileManifest() {
      return {
        keep: [
          'Yourself — name, body, scars, everything you are',
          'Your knowledge — the codex in your head walks with you',
          'Your pack — every item, every strip of dried meat',
        ],
        lose: [
          'The pantry — not one more draw from the common pot',
          'The village book — your codex no longer syncs with theirs',
          '"One of ours" — neighbors will not know your name abroad',
          'The fire — a seat by it, a roof over you, a voice in the moot',
        ],
      };
    },

    // describeExile: the beat of the moment. Wired to exilePlayer (see wraps).
    describeExile(how) {
      var m = this.exileManifest();
      var a = this.exileArcState();
      a.stage = 'moment';
      var reason = how ? ' (' + how + ')' : '';
      this.say('EXILE' + reason + '. The moot has spoken, and the fire is not yours anymore.');
      this.say('You KEEP: ' + m.keep.join('; ') + '.');
      this.say('You LOSE: ' + m.lose.join('; ') + '.');
      this.say('The road is yours now. Walk it hungry, walk it watched — but walk it as yourself.');
      try { if (this.journalNote) this.journalNote('exile', 'the moment', 'Exiled day ' + ((this.state.scholar || {}).day || 0) + '. Kept self/knowledge/pack; lost pantry/codex-sync/standing.'); } catch (e) {}
      return m;
    },

    // beginExileRoad: the leaving. The old village is behind you; the
    // mantle picks up on the road.
    beginExileRoad() {
      var a = this.exileArcState();
      a.stage = 'road';
      a.roadDays = 0;
      try { this.say('You walk. Behind you: a village that remembers. Ahead: nothing but what you carry and what you know.'); } catch (e) {}
      return a;
    },

    // roadDaily: the road-between, one day at a time. Runs at the day
    // boundary while exiled (see wraps). Pack-only survival: the pack feeds
    // you or the body pays — hunger is REAL. And monsters are CURIOUS about
    // a lone walker: roadExposed flags it for the encounters system, and the
    // road itself gets beats.
    //
    // FOOD HONESTY (drifter loop 2026-10-07): the pack must cover the day's
    // REAL burn. resolveDay (endDay, always runs after this) subtracts
    // dailyNeed from the body — the old code ate a fictional 2000 kcal
    // "road need" and settled it right back, so the exile starved at
    // ~2200/day with a full pack. Now the pack tops up the body by the real
    // daily need first; resolveDay's burn then breaks even against it.
    roadDaily() {
      var s = this.state.scholar || {};
      var a = this.exileArcState();
      if (!s.exiled || a.stage === 'founding') return null;
      a.stage = 'road';
      a.roadDays += 1;
      // the day's real food cost — what resolveDay is about to burn.
      var need = 2200;
      try {
        var cal = (typeof globalThis !== 'undefined' && globalThis.Scattering && globalThis.Scattering.calories) || null;
        if (cal && cal.dailyNeed) need = cal.dailyNeed(s);
      } catch (e) {}
      var eaten = this._roadEatFromPack(need);
      var cap = 3000;
      try { cap = this.kcalCap ? this.kcalCap() : 3000; } catch (e) {}
      // top up the body from the pack; resolveDay burns `need` right after,
      // so a full pack means the day breaks even. Empty pack: the body pays.
      s.kcal = Math.min(cap, (s.kcal || 0) + eaten);
      // monsters notice the lone walker
      try { s.roadExposed = true; } catch (e) {}
      if (a.roadDays % 2 === 0 && R() < 0.5) {
        var beats = [
          'Something large moves parallel to you in the treeline. Curious, not hunting. Yet.',
          'Eyes at the edge of the firelight. The woods are taking your measure.',
          'A call you don\'t recognize answers a call you do. The road is not empty.',
        ];
        var b = pick(beats);
        a.roadBeats.push({ day: s.day || 0, text: b });
        try { this.say(b); } catch (e) {}
      }
      if (eaten < need) {
        var short = need - eaten;
        var dmg = Math.max(1, Math.min(25, Math.round(short / 200)));
        s.health = Math.max(1, (s.health || 100) - dmg);
        try { this.say('Hunger is not a metaphor anymore. Your body eats itself a little. (-' + dmg + ' health)'); } catch (e) {}
        try { if (this.journalNote) this.journalNote('exile', 'hunger', 'Starving on the road, day ' + (s.day || 0) + '.'); } catch (e) {}
      }
      return { roadDays: a.roadDays, eaten: eaten };
    },

    // _roadEatFromPack: eat what's edible in the pack, honestly reported.
    // Same edible rule as the world: kcalEach > 0, units left, not bonded,
    // not spoiled, not marked inedible. Raw/unsafe food still feeds — the
    // road doesn't grade your cooking. Returns kcal eaten; never touches
    // the kcal bank (roadDaily settles the day's books).
    _roadEatFromPack(need) {
      var s = this.state.scholar || {};
      var inv = s.inventory || [];
      var eaten = 0, names = [];
      for (var i = inv.length - 1; i >= 0 && eaten < need; i--) {
        var it = inv[i];
        if (!it || (it.kcalEach || 0) <= 0 || (it.units || 0) <= 0) continue;
        if (it.bonded) continue;
        if (it.edible === false) continue;
        var spoiled = false;
        try { spoiled = this.isSpoiled ? this.isSpoiled(it, 0) : false; } catch (e) {}
        if (spoiled) continue;
        while ((it.units || 0) > 0 && eaten < need) {
          eaten += (it.kcalEach || 0);
          it.units -= 1;
          if (names.indexOf(it.name) < 0) names.push(it.name);
        }
      }
      s.inventory = inv.filter(function (x) { return (x.units || 0) > 0; });
      if (eaten > 0) {
        try { this.say('On the road you eat from your pack: ' + names.join(', ') + ' (+' + eaten + ' kcal). The pack is thinner now.'); } catch (e) {}
      } else {
        try { this.say('Your pack has nothing to eat. The road asks, and you have no answer.'); } catch (e) {}
      }
      return eaten;
    },

    // ---------- 9. FORKING: the founding beat ----------
    //
    // forkVillage: the membership-owned entry point to the founding beat.
    // The CANONICAL hard reset lives in betrayal.js (_forkNewHaven, Steve
    // 2026-10-06): old village archived to state.pastVillages (it continues
    // without you), fresh village object, founder-only roster — new faces
    // arrive via the strangers system, EARNED not given. This function does
    // NOT reimplement that; it stages the membership arc around it and
    // speaks the founding in membership terms. Delegation, not duplication.

    // forkVillage: found the new haven. Requires exile-on-the-road; the
    // canonical founding project (claimed site, shelter, cache, solo days)
    // is checked by foundHaven, which says what's missing — honestly, never
    // silently. On success: arc closes, ties start over, road ends.
    forkVillage(opts) {
      opts = opts || {};
      var s = this.state.scholar || {};
      if (!s.exiled) {
        this.say('You already have a fire. Founding is for the cast-out — the road gives you this, not ambition.');
        return null;
      }
      var a = this.exileArcState();
      if (a.stage === 'founding') {
        this.say('The founding is already underway. One fire at a time.');
        return null;
      }
      a.stage = 'founding';
      var r = null;
      try { r = this.foundHaven ? this.foundHaven() : null; } catch (e) { r = null; }
      if (!r) { a.stage = 'road'; return null; } // foundHaven already said what's missing
      // success: the canonical fork ran (fresh village, archived old) and the
      // existing foundHaven wrap ran rejoinMembership (exile cleared, mantle
      // speech spoken). Membership's founding beats:
      a.stage = 'home';
      a.roadDays = 0;
      try { s.roadExposed = false; } catch (e) {}
      var nv = this.state.village || {};
      var souls = (nv.roster || []).length;
      try {
        this.say('New fire, new names, same codex. ' + (nv.name || 'The new haven') + ' holds ' + souls + ' soul' + (souls === 1 ? '' : 's') + ' — you, first. Village ties start over: trust here is earned the slow way, one shared meal at a time.');
      } catch (e) {}
      try { if (this.journalNote) this.journalNote('village', 'founding', 'Founded ' + (nv.name || '?') + ' on day ' + (s.day || 0) + ' after exile. Hard reset: fresh village object, ties start over; kept self/knowledge/pack.'); } catch (e) {}
      return nv;
    },

    // ---------- 10. BELONGING TEXTURE ----------

    // genSettler: a UNIQUE person (unique-person law, Steve 2026-10-06).
    // Never a fixed cast: every settler is COMPOSED from part-pools —
    // origin, past, need, quirk — so no two share a backstory. Temperament
    // is deliberately null: the village learns them by LIVING with them,
    // not from a label. (Wiring: the strangers system should draw arrivals
    // from here — see the wiring block at the bottom of this file.)
    genSettler() {
      var FIRST = ['Mara', 'Joss', 'Tilda', 'Renn', 'Sable', 'Ilya', 'Noor', 'Petra', 'Aldo', 'Wren', 'Kessa', 'Dorian', 'Liv', 'Tam', 'Oka', 'Bex'];
      var LAST = ['Ash', 'Fen', 'Hollis', 'Marsh', 'Vale', 'Thorn', 'Reed', 'Calloway', 'Drift', 'Sparrow', 'Hale', 'Quill', 'Vane', 'Lark'];
      var ORIGINS = ['a drowned coastal town', 'a burned orchard commune', 'a highway rest-stop camp', 'a flooded subway station', 'a mountain chapel', 'a casino that ran out of luck', 'a library basement', 'a grain silo collective', 'a ferry that never docked', 'a radio station gone quiet'];
      var PASTS = ['kept the night watch alone for a winter', 'buried their whole street', 'traded a wedding ring for seed potatoes', 'learned to read from salvaged manuals', 'carried water uphill for forty families', 'talked a raider down with soup', 'crossed a river without knowing how to swim', 'kept bees through the first bad year', 'mapped the valley on foot, twice', 'sang the generator back to life'];
      var NEEDS = ['a roof that doesn\'t leak', 'work for their hands', 'someone to trust with their kid\'s name', 'a reason to stay awake at dawn', 'a place their past can\'t follow', 'proof the fire won\'t go out'];
      var QUIRKS = ['hums while mending', 'counts fence posts', 'names every dog', 'saves the burnt bits', 'sleeps with their boots on', 'laughs at funerals and cries at weddings'];
      var OCCUPATIONS = [
        { name: 'cook', providesPerDay: 2600 }, { name: 'carpenter', providesPerDay: 1800 },
        { name: 'nurse', providesPerDay: 1500 }, { name: 'farmer', providesPerDay: 3000 },
        { name: 'mechanic', providesPerDay: 1700 }, { name: 'teacher', providesPerDay: 1400 },
        { name: 'hunter', providesPerDay: 3200 }, { name: 'fisher', providesPerDay: 2800 },
      ];
      var id = 'st_' + Date.now().toString(36) + '_' + Math.floor(R() * 99999);
      var name = pick(FIRST) + ' ' + pick(LAST);
      var occ = pick(OCCUPATIONS);
      var origin = pick(ORIGINS);
      var past = pick(PASTS);
      var need = pick(NEEDS);
      var quirk = pick(QUIRKS);
      var evPool = PASTS.filter(function (p) { return p !== past; });
      var evs = [];
      var nEv = 1 + Math.floor(R() * 2);
      for (var i = 0; i < nEv && evPool.length; i++) {
        var e = pick(evPool);
        evPool.splice(evPool.indexOf(e), 1);
        evs.push({ when: 'before the road', text: e });
      }
      return {
        id: id, name: name, formerOccupation: occ.name,
        providesPerDay: occ.providesPerDay, kcalPerDay: 2000,
        temperament: null, // learned by living with them, not assigned
        origin: origin,
        backstory: 'From ' + origin + '. Once ' + past + '. ' + (R() < 0.5 ? 'Still ' + quirk + '.' : 'Wants ' + need + '.'),
        livedEvents: evs, need: need, quirk: quirk,
        arrivedDay: (this.state.scholar || {}).day || 0,
      };
    },

    // standingSummary: belonging made VISIBLE. Who they are to the village —
    // trusted by how many, what membership means for them. Belonging is
    // earned (trust counts) and visible (this summary).
    standingSummary(vid) {
      var id = vid || this.villagerId;
      var v = this.state.village || {};
      if (!this.isMember(id)) {
        var sev = null;
        try { sev = (v.severed || {})[id]; } catch (e) {}
        if (sev) return { member: false, note: 'Severed — exiled day ' + (sev.day || '?') + '. The village remembers.' };
        return { member: false, note: 'Not one of ours.' };
      }
      var t = v.trust || {};
      var roster = v.roster || [];
      var trustedBy = 0;
      for (var i = 0; i < roster.length; i++) {
        if (roster[i] === id) continue;
        if ((t[roster[i]] || 0) >= 40) trustedBy++;
      }
      var benefits = [];
      try {
        benefits = this.memberBenefits(id).map(function (b) { return b.label; });
      } catch (e) {}
      return {
        member: true,
        trustedBy: trustedBy,
        of: Math.max(0, roster.length - 1),
        benefits: benefits,
        note: trustedBy >= 3 ? 'Belonging, earned the slow way.' : 'One of ours — still earning the room\'s trust.',
      };
    },

    // foodSupportsSpeech: the honest spoken version of foodSupports. If the
    // village can't feed n more, it SAYS so — no silent actions (Steve).
    foodSupportsSpeech(n) {
      var fs = this.foodSupports(n || 1);
      var k = n || 1;
      var line;
      if (fs.ok) {
        line = 'The pantry can carry ' + k + ' more mouth' + (k > 1 ? 's' : '') + '.';
      } else {
        line = 'Honest math: the village already runs a ' + fs.shortfall + ' kcal/day shortfall' +
          ', and ' + k + ' more mouth' + (k > 1 ? 's' : '') + ' would need ' + fs.extraNeed + ' more. ' +
          'The pantry covers ' + (fs.pantryDays >= 999 ? 'plenty of days' : fs.pantryDays + ' days') + ' at this size.';
      }
      try { this.say(line); } catch (e) {}
      return fs;
    },

    // severMembershipSocial: the cut has SOCIAL consequences, not just
    // mechanical ones. THEY REMEMBER (betrayal-memory entry the justice
    // system reads; the severed record itself is never deleted on fork) and
    // OTHER VILLAGES HEAR (strangers carry the word — memberReputationAbroad
    // prices the cut into every future judgment).
    severMembershipSocial(vid) {
      var id = vid || this.villagerId;
      var nm = id;
      try { nm = String(this.displayName(id)).split(' ')[0]; } catch (e) {}
      try { if (this.remember) this.remember(id, 'severed', 'cut from the village'); } catch (e) {}
      try {
        var strangers = [];
        try { strangers = this.npcIds ? this.npcIds().slice(0, 3) : []; } catch (e2) {}
        this.seedGossip('severed_' + id, { generous: -6, trustworthy: -8 }, strangers);
        var bs = this.betrayalState ? this.betrayalState() : null;
        if (bs) bs.strangersHeard = (bs.strangersHeard || 0) + 1;
      } catch (e) {}
      try { this.say('Word will travel about ' + nm + '. Villages talk — the severed carry the cut with them.'); } catch (e) {}
      return true;
    },

    // applicantBackstory: belonging texture for APPLICANTS — the
    // unique-person law applies before they ever arrive. Backstory, lived
    // events, need: composed from identity, never a fixed cast. (Wired to
    // genApplicant via wraps — additive enrichment, no signature change.)
    applicantBackstory(app) {
      if (!app || app.backstory) return app;
      var settler = null;
      try { settler = this.genSettler(); } catch (e) {}
      if (!settler) return app;
      app.backstory = settler.backstory;
      app.livedEvents = settler.livedEvents;
      app.need = settler.need;
      app.origin = settler.origin;
      return app;
    },

    // ---------- 11. READMISSION: the way back (never automatic) ----------
    //
    // Returning to the village that exiled you is an ARC with conditions,
    // announced to the village. Joining a NEW village is different — that
    // path (joinVillage → rejoinMembership) legitimately ends your personal
    // exile, because you're somewhere new. But the OLD village's severed
    // record stays until THIS arc earns its clearing.

    // readmissionConditions: the arc, itemized. Every condition is
    // announced — nothing silent, nothing automatic.
    readmissionConditions() {
      var s = this.state.scholar || {};
      var a = this.exileArcState();
      var day = s.day || 0;
      var daysOut = day - (a.exiledDay != null ? a.exiledDay : day);
      var amends = 0;
      try { var j = this.justiceState ? this.justiceState() : null; amends = (j && j.amendsCredit) || 0; } catch (e) {}
      var homeHere = false;
      try { homeHere = !!((this.state.village || {}).severed || {})[this.villagerId]; } catch (e) {}
      return [
        { key: 'time', met: daysOut >= 14, label: 'Time on the road (' + daysOut + '/14 days) — the village needs to miss the person, not the problem.' },
        { key: 'amends', met: amends >= 20, label: 'Amends made (' + amends + '/20 credit) — the village remembers, but it can forgive.' },
        { key: 'record', met: homeHere, label: homeHere ? 'The severed record stands — there is something to forgive.' : 'No severed record stands here — there is nowhere to return TO.' },
      ];
    },

    // seekReadmission: petition the old village. Announced, conditioned,
    // never automatic. Only on the road — if you founded a fork, the fork
    // is your village now. On success the old village strikes YOUR severed
    // record (earned, announced); the village is TOLD.
    seekReadmission() {
      var s = this.state.scholar || {};
      if (!s.exiled) {
        this.say('You are not exiled. There is nothing to be readmitted to.');
        return null;
      }
      var a = this.exileArcState();
      if (a.stage !== 'road') {
        this.say('The fork is your village now. You don\'t petition a fire you left — you tend the one you built.');
        return null;
      }
      var conds = this.readmissionConditions();
      var unmet = conds.filter(function (c) { return !c.met; });
      if (unmet.length) {
        this.say('You send word to the old village. The answer comes back honest:');
        for (var i = 0; i < unmet.length; i++) this.say('— not yet: ' + unmet[i].label);
        try { if (this.journalNote) this.journalNote('exile', 'petition', 'Petition refused: ' + unmet.map(function (c) { return c.key; }).join(', ') + '.'); } catch (e) {}
        return false;
      }
      // granted: the old village strikes YOUR severed record — earned, announced
      try { delete (this.state.village.severed || {})[this.villagerId]; } catch (e) {}
      try { this.rejoinMembership(); } catch (e) {}
      a.stage = 'home';
      a.roadDays = 0;
      try { s.roadExposed = false; } catch (e) {}
      this.say('Word comes back at dusk: COME HOME. The old fire makes room. The severed record is struck — not forgotten, forgiven. The village is told, and the village remembers the telling.');
      try { if (this.journalNote) this.journalNote('exile', 'readmission', 'Readmitted on day ' + (s.day || 0) + '. The arc is closed — the hard way, the honest way.'); } catch (e) {}
      return true;
    },
  };

  for (var k in methods) G[k] = methods[k];

  // ---------- WRAPS ----------

  // villageEats feeds MEMBERS. The exiled don't draw from the common pot —
  // filter the roster for the call, restore after. Membership itself has no
  // presence check (away members stay members — no check-ins). But MEALS are
  // physical: the away player neither draws from nor provides to the pot that
  // day (see the gate in villageMeal / the skip in villageEats). The village
  // feeds its own — at the table, not by teleport.
  var _villageEats = G.villageEats;
  G.villageEats = function () {
    var v = this.state.village;
    if (!v || !v.roster) return _villageEats ? _villageEats.call(this) : undefined;
    var saved = v.roster;
    try {
      var self = this;
      v.roster = saved.filter(function (id) { return self.isMember(id); });
      return _villageEats.call(this);
    } finally {
      v.roster = saved;
    }
  };

  // Pantry draws are a membership benefit. The exiled are cut off — legibly.
  function _blockIfExiled(G, fnName) {
    var _fn = G[fnName];
    if (!_fn) return;
    G[fnName] = function () {
      if (this.state.scholar && this.state.scholar.exiled) {
        this.say('The pantry is not yours anymore. Exile means exile — membership had no check-ins, but it had exactly one way to lose it.');
        return null;
      }
      return _fn.apply(this, arguments);
    };
  }
  _blockIfExiled(G, 'takeFromPantry');
  _blockIfExiled(G, 'takeFromPantryBulk');
  _blockIfExiled(G, 'villageMeal');

  // exilePlayer: the severing, complete and legible.
  var _exilePlayer = G.exilePlayer;
  G.exilePlayer = function (how) {
    var r = _exilePlayer ? _exilePlayer.call(this, how) : undefined;
    try {
      this.severMembership(this.villagerId, how);
      this.say('The pantry is closed to you. The book stays behind. To Haven, you are not one of ours anymore. Membership asked nothing — no presence, no check-ins. Exile is the one way to lose it.');
    } catch (e) {}
    return r;
  };

  // removeVillager: NPC exile severs too.
  var _removeVillager = G.removeVillager;
  G.removeVillager = function (vid, how) {
    var r = _removeVillager ? _removeVillager.call(this, vid, how) : undefined;
    try {
      if (how === 'exile' || how === 'exiled') {
        var v = this.state.village || {};
        v.severed = v.severed || {};
        v.severed[vid] = { day: (this.state.scholar || {}).day || 0, how: how };
      }
    } catch (e) {}
    return r;
  };

  // Rejoining heals the cut: petition accepted, haven founded.
  var _joinVillage = G.joinVillage;
  G.joinVillage = function (villageId) {
    var r = _joinVillage ? _joinVillage.call(this, villageId) : undefined;
    try { this.rejoinMembership(); } catch (e) {}
    return r;
  };
  var _foundHaven = G.foundHaven;
  G.foundHaven = function () {
    var r = _foundHaven ? _foundHaven.call(this) : undefined;
    // only rejoin on SUCCESS — a refused founding (requirements unmet)
    // must not clear the exile (2026-10-06: founding is a gated project now)
    if (r) { try { this.rejoinMembership(); } catch (e) {} }
    return r;
  };

  // membershipDaily rides the day boundary.
  var _endDay = G.endDay;
  G.endDay = function () {
    try { this.membershipDaily(); } catch (e) {}
    return _endDay ? _endDay.call(this) : undefined;
  };

  // ---------- WRAPS (appended 2026-10-07: exile arc beats) ----------
  // Chain-safe: each wraps the CURRENT G.fn (which may already be wrapped
  // above). No existing wrap bodies were modified.

  // The exile moment is TOLD, not just flagged: keep/lose manifest, then
  // the road is staged. (The earlier exilePlayer wrap above already ran the
  // severing itself.)
  var _exilePlayer2 = G.exilePlayer;
  G.exilePlayer = function (how) {
    var r = _exilePlayer2 ? _exilePlayer2.call(this, how) : undefined;
    try { this.describeExile(how); } catch (e) {}
    try { this.beginExileRoad(); } catch (e) {}
    return r;
  };

  // Severing has social consequences: they remember, other villages hear.
  var _severMembership2 = G.severMembership;
  G.severMembership = function (vid, how) {
    var r = _severMembership2 ? _severMembership2.call(this, vid, how) : undefined;
    try { this.severMembershipSocial(vid); } catch (e) {}
    return r;
  };

  // The road-between runs at the day boundary while exiled.
  var _endDay2 = G.endDay;
  G.endDay = function () {
    try {
      if (this.state.scholar && this.state.scholar.exiled) this.roadDaily();
    } catch (e) {}
    return _endDay2 ? _endDay2.call(this) : undefined;
  };

  // Dying on the road ends the exile WITH THE BODY (drifter loop 2026-10-07).
  // The mantle passes to a villager who was never cast out — but the scholar
  // object is reused, so without this the new bearer inherits exiled=true,
  // the road arc (stage='road'), the dead exile's whole pack, and a
  // returnToVillage homecoming that pours tens of thousands of phantom kcal
  // into the pantry for someone who never left. The exile dies with the
  // exile: the arc closes, the pack stays where the body fell, the new
  // bearer starts clean. Spoken, never silent.
  var _playerDeathExile = G.playerDeath;
  G.playerDeath = function (cause) {
    var s0 = this.state.scholar || {};
    var wasExiled = !!s0.exiled;
    var oldName = '';
    var packKcal = 0;
    if (wasExiled) {
      try { oldName = String(this.displayName(this.villagerId)).split(' ')[0]; } catch (e) {}
      try {
        packKcal = (s0.inventory || []).reduce(function (t, i) {
          return t + (((i.kcalEach || 0) > 0 && (i.units || 0) > 0) ? (i.units || 0) * (i.kcalEach || 0) : 0);
        }, 0);
      } catch (e) {}
    }
    var r = _playerDeathExile ? _playerDeathExile.call(this, cause) : undefined;
    // only adjudicate a real mantle pass: no candidates means the village
    // died out too (over=true) and there is no new bearer to clean up for.
    if (wasExiled && _playerDeathExile && !this.over) {
      var s = this.state.scholar || {};
      // the exile ended where the body fell. The new bearer was never cast out.
      s.exiled = false;
      s.exileStartDay = null;
      s.drifting = false;
      s.driftDays = 0;
      s.roadExposed = false;
      s.codexCut = false;
      s.founding = null;
      try { s.exileArc = { stage: 'ended', roadDays: 0, roadBeats: [], exiledDay: null }; } catch (e) {}
      // the pack stays with the body on the road — it does not teleport home.
      // (playerDeath already moved bonded/sentimental keepsakes onto the corpse.)
      try {
        s.inventory = (s.inventory || []).filter(function (i) { return i && (i.bonded || i.sentimental); });
      } catch (e) { s.inventory = []; }
      // the new bearer never left: no "days away" homecoming is owed.
      try { s.lastHavenDay = s.day || 1; } catch (e) {}
      try {
        this.say('The road keeps ' + (oldName || 'them') + '.' +
          (packKcal > 0 ? ' What ' + (oldName || 'they') + ' carried — ' + Math.round(packKcal) +
            ' kcal of road food — stays where ' + (oldName || 'they') + ' fell.' : '') +
          ' The exile ended out there, not here. The fire is yours by inheritance, not by pardon.');
      } catch (e) {}
      try { if (this.journalNote) this.journalNote('exile', 'death', (oldName || 'The exile') + ' died on the road day ' + (s.day || 0) + '. The exile ended with them; the pack stayed where they fell.'); } catch (e) {}
    }
    return r;
  };

  // Applicants arrive as unique people: backstory, lived events, needs.
  // Additive enrichment only — genApplicant's signature is unchanged.
  var _genApplicant2 = G.genApplicant;
  G.genApplicant = function () {
    var app = _genApplicant2 ? _genApplicant2.call(this) : null;
    try { if (app) this.applicantBackstory(app); } catch (e) {}
    return app;
  };

})();

/* WIRING POINTS for game.js / app.js (2026-10-07, membership exile arc).
 * Intentionally NOT wired here — membership.js stays additive-only on the
 * hot tree. A sibling integrating UI should:
 *
 * 1. EXILE BANNER (app.js): while Game.state.scholar.exiled, surface the arc:
 *      Game.exileArcState() → { stage: 'road'|'founding', roadDays, roadBeats }
 *    Show "Day N on the road", pack kcal remaining, and the road beats log.
 *    Mobile: one line in the status row + the beats in a scrollable exile
 *    card (planning surface — scrolling allowed there).
 *
 * 2. forkVillage CALL SITE (app.js): the exile action menu needs
 *    "🏕️ Found your haven" → Game.forkVillage(). It delegates to the
 *    canonical gated founding project (betrayal.js foundHaven); when
 *    requirements are unmet, foundHaven already says what's missing —
 *    surface that text, don't invent your own. After a fork, refresh the
 *    village panel + map label (state.village is a NEW object).
 *
 * 3. roadExposed (encounters.js): Game.state.scholar.roadExposed is true
 *    while the exiled walk alone. Curiosity encounters should bias toward
 *    the lone walker — monsters were sent to fight, and a lone exile is
 *    the most interesting thing on the road.
 *
 * 4. READMISSION (app.js): while exiled-on-the-road, offer "Send word to
 *    the old village" → Game.seekReadmission(). Show
 *    Game.readmissionConditions() FIRST (the unmet labels) so the petition
 *    is never a blind button — no silent actions.
 *
 * 5. INTAKE HONESTY (app.js Haven panel): call Game.foodSupportsSpeech(n),
 *    not bare foodSupports(n), wherever an accept/refuse decision is shown.
 *
 * 6. STANDING (app.js Haven panel): Game.standingSummary(vid) for member
 *    rows — belonging made visible (trusted-by counts, benefits).
 *
 * 7. SETTLER SOURCE (betrayal.js considerStrangers): new faces for a forked
 *    haven should come from Game.genSettler() — unique composed people
 *    (backstory/livedEvents/need), never a fixed cast. Roster records need
 *    providesPerDay/kcalPerDay for foodSupports (genSettler supplies both).
 *
 * 8. EXILE MOMENT (no UI work): describeExile + beginExileRoad already run
 *    via the exilePlayer wrap — the moment speaks itself.
 */
