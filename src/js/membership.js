// @ontology
// system: membership
// description: Village membership. Joining, leaving, exile status.
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
// rules:
//   - (none documented)
// consumes:
//   - village.members
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
        // VILLAGER GRIT (Steve 2026-10-09): projection from identity, not flat %.
        var produced = 0;
        try { produced = this.villagerExpectedDaily ? this.villagerExpectedDaily(person, roster[i], v) : ((person.providesPerDay || 0)); } catch (e) { produced = (person.providesPerDay || 0); }
        var health = (v.health && v.health[roster[i]] !== undefined) ? v.health[roster[i]] : 100;
        var hf = health / 100;
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
    var self = this;
    // non-members are withheld from the pot during the call — but they must
    // come back after, even though the call below may kill members.
    var withheld = saved.filter(function (id) { return !self.isMember(id); });
    try {
      v.roster = saved.filter(function (id) { return self.isMember(id); });
      return _villageEats.call(this);
    } finally {
      // DEAD STAY DEAD (drifter break-it 2026-10-09): villagers who starved
      // during the call were correctly dropped from the live roster by
      // removeVillager. The old `v.roster = saved` restored the pre-call
      // array wholesale — resurrecting corpses onto the roster as
      // dead-marked zombies (eating again tomorrow, counted in meals).
      // Restore = live roster (deaths honored) + pre-call non-members.
      var live = v.roster || [];
      var seen = {}, out = [], i, id;
      for (i = 0; i < live.length; i++) { id = live[i]; if (!seen[id]) { seen[id] = true; out.push(id); } }
      for (i = 0; i < withheld.length; i++) { id = withheld[i]; if (!seen[id]) { seen[id] = true; out.push(id); } }
      v.roster = out;
    }
  };

  // Pantry draws are a membership benefit. The exiled are cut off — legibly.
  // MISER BREAK-IT 2026-10-08: the stash wasn't in the block list. Exile
  // doesn't move you — an exiled player could walk back into the old hall
  // (enterBuilding has no membership check) and loot the village stash
  // freely while the pantry stayed closed (measured: 5 wood taken, no
  // refusal). Stash takes are membership benefits too. DONATIONS stay
  // allowed: gifts toward amends are how the exiled earn trust back, and
  // the justice loop's "convince the village" path needs a verb.
  function _blockIfExiled(G, fnName, place) {
    var _fn = G[fnName];
    if (!_fn) return;
    var what = place || 'pantry';
    G[fnName] = function () {
      if (this.state.scholar && this.state.scholar.exiled) {
        this.say('The ' + what + ' is not yours anymore. Exile means exile — membership had no check-ins, but it had exactly one way to lose it.');
        return null;
      }
      return _fn.apply(this, arguments);
    };
  }
  _blockIfExiled(G, 'takeFromPantry');
  _blockIfExiled(G, 'takeFromPantryBulk');
  _blockIfExiled(G, 'villageMeal');
  _blockIfExiled(G, 'takeMaterial', 'stash');
  _blockIfExiled(G, 'takeTool', 'stash');

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

})();
