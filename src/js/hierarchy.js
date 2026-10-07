// @ontology
// system: hierarchy
// description: Inter-village hierarchy. Villages have relationships: links with trust, tribute, feud, water-rights, exchange, marriage bonds, spy networks. Leaders are unique people.
// provides:
//   - hierarchyState()
//   - linkWith(vid, other)
//   - linkStanding(a, b)
//   - breakLink(a, b)
//   - judgeLink(a, b)
//   - proposeLink(a, b)
//   - answerDemand(a, b)
//   - payTribute(a, b)
//   - hierarchyDaily()
//   - linkTick(a, b)
//   - onLeaderDeath(vid)
//   - villageIntel(vid)
//   - scoutIntel(vid)
//   - plantSpy(vid)
//   - feudWith(vid)
//   - waterRights(vid)
//   - negotiateWater(linkId)
//   - arrangeMarriage(linkId)
//   - escalate(linkId)
//   - coalitionTax()
//   - tributeResentment()
//   - leaderOf(vid)
//   - rivalLeaderDied(vid)
// rules:
//   - Links are first-class relationship objects: trust, terms, dimensions, history, obligations — never flags. (code: hierarchy.js)
//   - No free intel: other-village strength, intentions, and leader temperament reveal only through scouts, exchange, spies, or observed events; villageIntel is the only honest read path. (code: hierarchy.js)
//   - Demands refused twice escalate to an ultimatum; a refused ultimatum can end the link. (code: hierarchy.js)
//   - Tribute is real food; paying it builds villager resentment that can refuse the next payment outright. (code: hierarchy.js)
//   - Feeding a coalition scales exponentially: tribute owed multiplies by 1.25 per link beyond the first. (code: hierarchy.js)
//   - Leaders are unique people: temperament and goals generate per leader and change with events; succession brings a stranger. (code: hierarchy.js)
// consumes:
//   - state.otherVillages
//   - state.village.mship
/* INTER-VILLAGE HIERARCHY — src/js/hierarchy.js
 *
 * Steve: "Strong enough representatives can link to a haven and join them as
 * one organization, with one being primary to another... you may have to join
 * another kingdom."
 *
 * The link is a FIRST-CLASS RELATIONSHIP OBJECT — trust, terms, history,
 * obligations — not a flag. Villages are nodes; links are directed, weighted
 * edges. The network stage's politics run on this.
 *
 * - LINKING: a village's representative (earned standing, never appointed)
 *   negotiates the link. Trust between villages, tribute terms in food (the
 *   metabolism system makes this REAL), obligations (aid when they call).
 * - THE HIERARCHY IS A RELATIONSHIP: moving trust. The subordinate proves
 *   worth (deeds feed the link); the primary makes demands; the climb toward
 *   equality — or primacy — is playable via bidForPrimacy. The vassal's
 *   gambit (breaking the link) is always an option, with consequences.
 * - JOINING ANOTHER KINGDOM is an earned outcome: kingdomEndingEligible()
 *   exposes the frame for the endings system — the valued subordinate at
 *   the table, there because the primary can't afford to lose them.
 * - DEATHS DETONATE HIERARCHIES: onLeaderDeath (wired into registerDeath,
 *   which the mantle-passing calls) triggers successionCrisis per link —
 *   the primary installs their own, the village renegotiates in the chaos,
 *   or the link snaps.
 *
 * DIMENSIONS (Steve 2026-10-07): a link is more than tribute. Feud,
 * water-rights, cultural exchange, marriage bonds, and our spy network each
 * run on the link and change what plays. Leaders are unique people —
 * temperament and goals generate per leader and evolve with events;
 * succession brings a stranger. Intel is knowledge-gated: villageIntel is
 * the only honest read path, and it shows only what scouts, exchange,
 * spies, or observed events revealed. Refusals escalate to ultimatums.
 * Tribute builds villager resentment. Coalitions tax exponentially: 1.25x
 * per link beyond the first. Empires eat.
 *
 * Self-attaching module. Load after membership.js. Chain-safe wraps.
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var pick = function (a) { return a[Math.floor(R() * a.length)]; };
  var HOME = 'haven';

  // Link dimensions + leader generation pools. Leaders are unique people —
  // never a fixed cast. (Steve 2026-10-07: deepen toward scale transitions.)
  var TEMPERAMENTS = ['proud', 'greedy', 'cautious', 'zealous', 'patient', 'volatile', 'mercantile'];
  var LEADER_GOALS = ['expand', 'hoard', 'learn', 'endure', 'unite', 'prove'];
  var LEADER_MOODS = ['pleased', 'content', 'wary', 'cold', 'hostile'];
  var LEADER_FIRST = ['Mara', 'Joren', 'Sable', 'Tovin', 'Kessa', 'Dain', 'Ruelle', 'Bran', 'Isolde', 'Corvin', 'Tilda', 'Osmund', 'Petra', 'Hollis', 'Vesper', 'Ansel'];
  var LEADER_LAST = ['Ash', 'Blackwood', 'Crow', 'Dunmore', 'Ellery', 'Flint', 'Gallow', 'Harlow', 'Irons', 'Kestrel', 'Lark', 'Morrow', 'Nettle', 'Osric', 'Pyke', 'Quill'];

  var methods = {

    // ---------- STATE ----------

    hierarchyState() {
      var m = null;
      try { m = this.mshipState(); } catch (e) { return []; }
      m.links = m.links || [];
      return m.links;
    },

    _linkNote(link, kind, note) {
      link.history = link.history || [];
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      link.history.push({ day: day, kind: kind, note: note });
      if (link.history.length > 40) link.history.shift();
    },

    villageLinks(villageId) {
      var id = villageId || HOME;
      return this.hierarchyState().filter(function (l) {
        return l.status === 'active' && (l.primary === id || l.subordinate === id);
      });
    },

    linkWith(otherId) {
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        if (l.status !== 'active') continue;
        if ((l.primary === HOME && l.subordinate === otherId) ||
            (l.subordinate === HOME && l.primary === otherId)) return l;
      }
      return null;
    },

    _otherVillage(id) {
      try {
        return (this.state.otherVillages || []).find(function (x) { return x.id === id; }) || null;
      } catch (e) { return null; }
    },

    // ---------- REPRESENTATIVES ----------

    // linkStanding: earned standing, never appointed. Deeds + the village's
    // trust. This is who speaks for the village because they proved it.
    linkStanding(vid) {
      var s = 0;
      try { s += this.agencyScore ? this.agencyScore(vid) : 0; } catch (e) {}
      try { s += ((this.state.village.trust || {})[vid] || 0) / 5; } catch (e) {}
      return Math.round(s);
    },

    representative() {
      var best = null, bestS = -1;
      try {
        var roster = this.state.village.roster || [];
        for (var i = 0; i < roster.length; i++) {
          var id = roster[i];
          if (!this.isMember(id)) continue;
          var st = this.linkStanding(id);
          if (st > bestS) { bestS = st; best = id; }
        }
      } catch (e) {}
      return best ? { id: best, standing: bestS } : null;
    },

    // ---------- LINKING ----------

    // judgeLink: the negotiation, scored. The stronger village has leverage;
    // tribute offered smooths it; alliances and opinion open doors.
    judgeLink(targetId, opts) {
      opts = opts || {};
      var score = 50, reasons = [];
      var rep = this.representative();
      var repS = rep ? rep.standing : 0;
      score += Math.min(20, repS / 2);
      if (rep) {
        var rn = 'Someone';
        try { rn = String(this.displayName(rep.id)).split(' ')[0]; } catch (e) {}
        reasons.push(rn + ' speaks for Haven — earned, not appointed.');
      }
      var ov = this._otherVillage(targetId);
      var opinion = ov ? (ov.opinion || 0) : 0;
      score += opinion / 2;
      if (opinion >= 20) reasons.push('They think well of Haven.');
      else if (opinion <= -20) reasons.push('They think poorly of Haven.');
      if (this.isAllied && this.isAllied(HOME, targetId)) { score += 15; reasons.push('Already allies — this is the next step.'); }
      var ourS = 0;
      try { ourS = this.regionalStanding(); } catch (e) {}
      var intelS = null;
      try { intelS = (this._intelState()[targetId] || {}).strength || null; } catch (e) {}
      if (opts.asSubordinate) {
        score += 10;
        reasons.push('Haven offers itself as subordinate — a tributary, not a rival.');
      } else if (intelS && intelS !== 'unknown') {
        // knowledge-gated: the table only knows what scouts taught it
        if (intelS === 'weaker') { score += 10; reasons.push('Haven is the stronger — the scouts are sure of it.'); }
        else if (intelS === 'stronger') { score -= 10; reasons.push('They are stronger than Haven — the scouts are sure of it. Why would they bow?'); }
        else { reasons.push('Evenly matched, by the scouts\' measure. This will be a negotiation, not a bowing.'); }
      } else {
        reasons.push('Haven can\'t say how they\'d stand — no scout has measured them. Bidding blind is honest, not wise.');
      }
      try {
        var _tax = this.coalitionTax();
        if (_tax > 1) reasons.push('Every link makes every tribute heavier — the coalition tax already runs ×' + _tax.toFixed(2) + '. Empires eat.');
      } catch (e) {}
      var trib = opts.tributeKcalPerWeek || 0;
      if (opts.asSubordinate && trib >= 3000) { score += 8; reasons.push('The tribute offered is generous.'); }
      score += R() * 20 - 10;
      return { score: Math.round(score), reasons: reasons, rep: rep };
    },

    // proposeLink: negotiate one organization, primary/subordinate.
    // opts: {asSubordinate: bool, tributeKcalPerWeek}
    proposeLink(targetId, opts) {
      opts = opts || {};
      var ov = this._otherVillage(targetId);
      if (!ov) { this.say('You don\'t know them well enough to propose anything.'); return null; }
      if (this.linkWith(targetId)) { this.say('There is already a link. One organization, one link — tend it.'); return null; }
      var j = this.judgeLink(targetId, opts);
      var nm = ov.name || 'them';
      if (j.score >= 45) {
        var link = {
          id: 'link_' + Date.now().toString(36) + Math.floor(R() * 999),
          primary: opts.asSubordinate ? targetId : HOME,
          subordinate: opts.asSubordinate ? HOME : targetId,
          trust: 30,
          tributeKcalPerWeek: opts.tributeKcalPerWeek || 4000,
          tributePaidWeek: -1, arrears: 0,
          obligations: ['tribute', 'aid'],
          history: [], status: 'active',
          day: (this.state.scholar || {}).day || 0,
          pendingDemand: null,
          refusals: 0,
        };
        this.hierarchyState().push(link);
        this._ensureDims(link);
        try {
          this._genLeader(targetId);
          var _ov2 = this._otherVillage(targetId);
          if (_ov2) _ov2.leaderMet = true; // negotiated face to face — you know their name
        } catch (e) {}
        this._linkNote(link, 'formed',
          opts.asSubordinate ? 'Haven joined ' + nm + ' as subordinate.' : nm + ' joined Haven as subordinate.');
        var rn = j.rep ? String(this.displayName(j.rep.id)).split(' ')[0] : 'Someone';
        this.say(`⛓️ ${rn} brings it home: ${opts.asSubordinate ? 'Haven bows to ' + nm + ' — one organization, them primary.' : nm + ' bows to Haven — one organization, us primary.'} Tribute: ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. The relationship starts at trust 30. Everything from here is earned.`);
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'linked:' + targetId + ':' + (opts.asSubordinate ? 'sub' : 'prim')); } catch (e) {}
        return link;
      }
      this.say(`${nm} declines. ${j.reasons.join(' ')} The door isn't shut — just not today.`);
      try { ov.opinion = (ov.opinion || 0) - 5; } catch (e) {}
      return null;
    },

    // ---------- TRIBUTE (food is real) ----------

    _removePantryKcal(kcal) {
      var v = this.state.village || {};
      var pantry = v.pantry || [];
      var need = kcal, removed = 0;
      pantry.sort(function (a, b) { return (a.spoilDay || 99999) - (b.spoilDay || 99999); });
      for (var i = pantry.length - 1; i >= 0 && need > 0; i--) {
        var it = pantry[i];
        var have = (it.kcalEach || 0) * (it.units || 0);
        if (have <= 0) continue;
        var take = Math.min(have, need);
        var units = take / (it.kcalEach || 1);
        it.units = Math.max(0, (it.units || 0) - units);
        removed += take; need -= take;
        if (it.units <= 0.001) pantry.splice(i, 1);
      }
      return Math.round(removed);
    },

    _week() {
      return Math.floor(((this.state.scholar || {}).day || 0) / 7);
    },

    // payTribute: the subordinate's due. Real food leaves the pantry — and
    // the village resents every basket. Resentment is a meter, not a mood:
    // at the boil, the pantry crew refuses the next payment outright.
    payTribute(linkId, kcal) {
      var link = null;
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active' || link.subordinate !== HOME) return null;
      var m = null;
      try { m = this.mshipState(); } catch (e) {}
      if (m && m.tributeRefused) {
        this.say('The pantry crew folds its arms: no tribute carts until the resentment cools. Paying is a village act — and the village refuses.');
        return null;
      }
      var owed = this._tributeOwed(link);
      var paid = this._removePantryKcal(kcal == null ? owed : kcal);
      var week = this._week();
      if (m) m.tributeResentment = Math.min(120, (m.tributeResentment || 0) + 12);
      if (paid >= owed) {
        link.tributePaidWeek = week; link.arrears = 0;
        link.trust = Math.min(100, link.trust + 3);
        try { this._evolveLeader(link.primary, 'paid'); } catch (e) {}
        this._linkNote(link, 'tribute', 'Paid ' + paid.toLocaleString() + ' kcal. Current.');
        this.say(`Tribute paid: ${paid.toLocaleString()} kcal walks out of the pantry toward ${this._ovName(link.primary)}. The relationship holds.`);
      } else {
        link.arrears += (owed - paid);
        link.trust = Math.max(0, link.trust - 2);
        this._linkNote(link, 'tribute', 'Short: ' + paid.toLocaleString() + '/' + owed.toLocaleString() + ' kcal. Arrears ' + link.arrears.toLocaleString() + '.');
        this.say(`Tribute short — ${paid.toLocaleString()} of ${owed.toLocaleString()} kcal. They'll count it. Arrears grow teeth.`);
      }
      return paid;
    },

    _ovName(id) {
      if (id === HOME) return 'Haven';
      var ov = this._otherVillage(id);
      return (ov && ov.name) || 'them';
    },

    // linkTick: weekly accounting. Paid → the relationship deepens; unpaid →
    // arrears, and the primary notices. Dimensions breathe: feud decays in
    // good weather and boils over into skirmishes at 70; contested water
    // grates; exchange grows where trust holds and teaches you things at 40
    // and 70. The coalition tax is felt. Runs inside membershipDaily.
    linkTick() {
      try {
        var m = this.mshipState();
        var week = this._week();
        if (m.lastLinkWeek === week) return;
        m.lastLinkWeek = week;
        // tribute refusal cools off once resentment drops
        if (m.tributeRefused && (m.tributeResentment || 0) < 60) {
          m.tributeRefused = false;
          this.say('Cooler heads at the pantry: the tribute carts will roll again. For now.');
        }
        var links = this.hierarchyState();
        for (var i = 0; i < links.length; i++) {
          (function (self, link) {
            try {
              if (link.status !== 'active') return;
              self._ensureDims(link);
              var other = self._linkOther(link);
              if (link.subordinate === HOME) {
                var owed = self._tributeOwed(link);
                if ((link.tributePaidWeek || -1) < week) {
                  link.arrears += owed;
                  link.trust = Math.max(0, link.trust - 6);
                  self._feudChange(link, 6);
                  self._linkNote(link, 'arrears', 'Tribute unpaid. Arrears ' + link.arrears.toLocaleString() + ' kcal.');
                  if (R() < 0.4) self.say(`⚠️ ${self._ovName(link.primary)} notices the missing tribute. Arrears: ${link.arrears.toLocaleString()} kcal. The air changes.`);
                } else {
                  link.trust = Math.min(100, link.trust + 1);
                }
                // the primary calls, sometimes — patient leaders call rarely
                var freq = 0.2;
                try {
                  var _pl = self._ovLeader(link.primary);
                  if (_pl && _pl.temperament === 'patient') freq = 0.1;
                  else if (_pl && _pl.temperament === 'greedy') freq = 0.3;
                } catch (e) {}
                if (R() < freq) self.primaryDemand(link.id);
              } else if (link.primary === HOME) {
                // our subordinate pays us — real food into the pantry
                if (R() < link.trust / 100) {
                  link.trust = Math.min(100, link.trust + 1);
                  var _got = self._tributeOwed(link);
                  self._addPantryKcal(_got, 'Tribute from ' + self._ovName(link.subordinate));
                  self._linkNote(link, 'tribute', self._ovName(link.subordinate) + ' paid ' + _got.toLocaleString() + ' kcal.');
                } else {
                  link.arrears += self._tributeOwed(link);
                  link.trust = Math.max(0, link.trust - 4);
                  self._feudChange(link, 4);
                  if (R() < 0.35) self.say(`⚠️ ${self._ovName(link.subordinate)} is late with tribute. The air changes.`);
                }
              }
              // dimensions breathe
              var dims = link.dims;
              if (link.trust >= 60) dims.feud = Math.max(0, dims.feud - 2);
              if (dims.water === 'contested') self._feudChange(link, 4);
              var cur = link.subordinate === HOME ? ((link.tributePaidWeek || -1) >= week) : true;
              if (link.trust >= 50 && cur) {
                var exB = dims.exchange;
                dims.exchange = Math.min(100, dims.exchange + 3);
                if (exB < 40 && dims.exchange >= 40) {
                  self._revealIntel(other, { intentions: self._intentionsWord(other) });
                  try { (self._intelState()[other] || {}).temperKnown = true; } catch (e) {}
                  self._linkNote(link, 'exchange', 'They talk freely now — intentions readable.');
                }
                if (exB < 70 && dims.exchange >= 70) {
                  self._revealIntel(other, { demands: self._demandsWord(other) });
                  self._linkNote(link, 'exchange', 'Deep exchange — their demands are an open book.');
                }
              }
              if (dims.feud >= 50) dims.exchange = Math.max(0, dims.exchange - 4);
              if (dims.feud >= 70 && R() < 0.3) self._skirmish(link.id);
              // empires eat: the coalition tax, felt
              var tax = self.coalitionTax();
              if (tax >= 1.5 && R() < 0.25) {
                self.say(`Feeding the coalition: Haven's links run ${Math.round((tax - 1) * 100)}% heavy on tribute. Nobody told the founders that empires eat.`);
              }
            } catch (e) {}
          })(this, links[i]);
        }
      } catch (e) {}
    },

    // ---------- DEMANDS & OBLIGATIONS ----------

    // primaryDemand: "send your best when they call." The primary calls.
    primaryDemand(linkId) {
      var link = null;
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active' || link.subordinate !== HOME || link.pendingDemand) return null;
      // the leader's temperament shapes what they ask for — unique people,
      // not a fixed cast. Patient leaders call rarely.
      var _pl = null;
      try { _pl = this._ovLeader(link.primary); } catch (e) {}
      var _temper = _pl ? _pl.temperament : null;
      var pool = ['tribute', 'tribute', 'aid', 'counsel'];
      if (_temper === 'greedy') pool = ['tribute', 'tribute', 'tribute', 'tribute', 'aid'];
      else if (_temper === 'zealous') pool = ['aid', 'aid', 'counsel', 'tribute'];
      else if (_temper === 'proud') pool = ['aid', 'counsel', 'counsel', 'tribute'];
      else if (_temper === 'mercantile') pool = ['tribute', 'tribute', 'counsel', 'counsel'];
      else if (_temper === 'patient') { if (R() < 0.5) return null; pool = ['counsel', 'tribute', 'aid']; }
      var kind = pick(pool);
      var d = { kind: kind };
      if (kind === 'tribute') {
        d.costKcal = Math.round(link.tributeKcalPerWeek * 0.5);
        d.detail = `An extra ${d.costKcal.toLocaleString()} kcal, now. "The season is hard."`;
      } else if (kind === 'aid') {
        d.detail = `Send your best for three days. "${this._ovName(link.primary)} needs hands it can trust."`;
      } else {
        d.detail = `Counsel. "${this._ovName(link.primary)} wants Haven's read on the season."`;
      }
      link.pendingDemand = d;
      this._linkNote(link, 'demand', 'The primary called: ' + kind + '.');
      this.say(`📯 ${this._ovName(link.primary)} calls on the obligation: ${d.detail} Honor it, or refuse — both are remembered.`);
      return d;
    },

    answerDemand(linkId, accept) {
      var link = null;
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || !link.pendingDemand) return null;
      this._ensureDims(link);
      var d = link.pendingDemand;
      link.pendingDemand = null;
      if (d.kind === 'ultimatum') return this._answerUltimatum(link, d, accept);
      if (accept) {
        if (d.kind === 'tribute') {
          var paid = this._removePantryKcal(d.costKcal || 0);
          this.say(`You send ${paid.toLocaleString()} kcal. It hurts. That's rather the point of tribute.`);
        } else if (d.kind === 'aid') {
          var rep = this.representative();
          if (rep) {
            var m = this.mshipState();
            m.loaned = { vid: rep.id, untilDay: ((this.state.scholar || {}).day || 0) + 3, to: link.primary };
            var rn = 'Someone';
            try { rn = String(this.displayName(rep.id)).split(' ')[0]; } catch (e) {}
            this.say(`${rn} walks out to serve ${this._ovName(link.primary)} for three days. Still ours — membership needs no presence.`);
          }
        } else {
          this.say('You give them your honest read. Counsel is cheap; honesty isn\'t.');
        }
        link.refusals = 0;
        this._feudChange(link, -5);
        link.trust = Math.min(100, link.trust + 8);
        this._linkNote(link, 'demand', 'Honored the call (' + d.kind + ').');
        this.say(`The obligation is honored. Trust with ${this._ovName(link.primary)}: ${link.trust}.`);
      } else {
        link.refusals = (link.refusals || 0) + 1;
        var _dl = null;
        try { _dl = this._ovLeader(link.primary); } catch (e) {}
        this._feudChange(link, 12 + (_dl && _dl.temperament === 'proud' ? 6 : 0));
        try { this._evolveLeader(link.primary, 'refused'); } catch (e) {}
        link.trust = Math.max(0, link.trust - 15);
        this._linkNote(link, 'demand', 'REFUSED the call (' + d.kind + '). Refusal #' + link.refusals + '.');
        this.say(`You refuse ${this._ovName(link.primary)}. The air changes — trust: ${link.trust}. Refusals are remembered longer than payments.`);
        if (link.refusals >= 2) this.escalate(link.id);
      }
      return true;
    },

    // ---------- PROVING WORTH ----------

    // proveWorth: subordinate deeds feed the link. The climb is the same
    // verbs as the rest of the game: do things, be seen, be valued.
    proveWorth(linkId, vid, mag) {
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) {
        if (links[i].id !== linkId) continue;
        var link = links[i];
        if (link.status !== 'active' || link.subordinate !== HOME) return;
        var gain = Math.min(6, Math.max(1, Math.round((mag || 0) / 3)));
        link.trust = Math.min(100, link.trust + gain);
        if ((mag || 0) >= 8) this._linkNote(link, 'worth', 'Proved worth (deed, mag ' + mag + ').');
        return gain;
      }
      return 0;
    },

    // ---------- THE VASSAL'S GAMBIT ----------

    // breakLink: always an option, always with consequences. The graph
    // remembers — broken links stay in history.
    breakLink(linkId, how) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      link.status = 'broken';
      var other = link.subordinate === HOME ? link.primary : link.subordinate;
      var weAreSub = link.subordinate === HOME;
      var ov = this._otherVillage(other);
      var hit = how === 'gambit' ? 30 : 15;
      if (ov) ov.opinion = Math.max(-100, Math.min(100, (ov.opinion || 0) - hit));
      this._linkNote(link, 'broken', 'Link broken (' + (how || 'severed') + ').');
      try {
        var _bdims = this._ensureDims(link);
        if (_bdims.marriage > 0) this.say(`The marriages are severed too — ${_bdims.marriage} famil${_bdims.marriage > 1 ? 'ies' : 'y'} split between the villages. That wound outlives the politics.`);
      } catch (e) {}
      try {
        this.seedGossip('broke_' + link.id, { loyal: -6 }, (this.npcIds ? this.npcIds().slice(0, 4) : []));
      } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'broke:' + other + ':' + (how || '')); } catch (e) {}
      if (weAreSub && how === 'gambit') {
        this.say(`🗡️ The vassal's gambit: Haven breaks with ${this._ovName(other)}. No more tribute, no more calls — and no more protection. Word will travel: Haven broke faith. (${this._ovName(other)}'s opinion: ${ov ? ov.opinion : 'unknown'})`);
      } else {
        this.say(`The link with ${this._ovName(other)} is broken (${how || 'severed'}). What was built over weeks comes apart in a sentence.`);
      }
      return true;
    },

    // ---------- THE CLIMB ----------

    // renegotiateLink: the subordinate's eternal verb — better terms, earned.
    renegotiateLink(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active' || link.subordinate !== HOME) return null;
      var rep = this.representative();
      var score = 50 + (rep ? rep.standing / 2 : 0) + link.trust / 4 + R() * 20 - 10;
      if (score >= 55) {
        link.tributeKcalPerWeek = Math.max(500, Math.round(link.tributeKcalPerWeek * 0.75));
        link.trust = Math.max(0, link.trust - 5);
        this._linkNote(link, 'renegotiated', 'Tribute cut to ' + link.tributeKcalPerWeek.toLocaleString() + ' kcal/week.');
        this.say(`Haven renegotiates: tribute down to ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. They didn't like it. They respected it.`);
        return true;
      }
      link.trust = Math.max(0, link.trust - 5);
      this.say('Haven pushes for better terms. They don\'t budge — and they note the push.');
      return false;
    },

    // bidForPrimacy: the climb made playable. When the subordinate's standing
    // approaches the primary's, the table can turn — if the trust is there.
    bidForPrimacy(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active' || link.subordinate !== HOME) return null;
      var ourS = 0, theirS = 0;
      try { ourS = this.regionalStanding(); theirS = this.villageStandingOf(link.primary); } catch (e) {}
      // knowledge-gating: bidding blind is allowed — blind is honest, not
      // disabled — but blindness is billed in trust.
      var blind = true;
      try { var _istr = (this._intelState()[link.primary] || {}).strength; blind = !_istr || _istr === 'unknown'; } catch (e) {}
      if (ourS < theirS * 0.9) {
        if (blind) this.say(`Not yet — and Haven can't even say where ${this._ovName(link.primary)} stands. Send a scout before bidding for the table.`);
        else this.say(`Not yet. Haven's standing (${ourS}) against theirs (${theirS}) — they'd laugh. Grow first: deeds, tribute paid, trust.`);
        return null;
      }
      if (blind) this.say(`Haven bids blind — no scout has measured ${this._ovName(link.primary)} lately. The table respects boldness; it bills blindness. (Trust will cost extra either way.)`);
      if (link.trust >= 60) {
        // THE TABLE TURNS
        var old = link.primary;
        link.primary = HOME; link.subordinate = old;
        link.trust = Math.max(0, link.trust - (blind ? 20 : 10));
        link.arrears = 0; link.tributePaidWeek = -1;
        this._linkNote(link, 'flipped', 'Primacy flipped: Haven is primary.');
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'primacy:' + old); } catch (e) {}
        this.say(`👑 The table turns: ${this._ovName(old)} bows to HAVEN now. Earned — every deed, every tribute, every honored call. Nobody likes it. Everybody respects it.`);
        return 'flipped';
      }
      // not trusted enough to flip — settle for better terms
      link.tributeKcalPerWeek = Math.max(500, Math.round(link.tributeKcalPerWeek * 0.5));
      link.trust = Math.max(0, link.trust - (blind ? 15 : 10));
      this._linkNote(link, 'renegotiated', 'Bid for primacy settled: tribute halved.');
      this.say(`Haven bids for primacy. They won't flip — not yet, not at this trust — but the tribute halves. The climb continues.`);
      return 'terms';
    },

    // ---------- SUCCESSION ----------

    // onLeaderDeath: deaths detonate hierarchies. Wired into registerDeath
    // (which the mantle-passing calls). The representative or the player —
    // when either falls, every link shakes.
    onLeaderDeath(vid) {
      try {
        if (!vid) return;
        var rep = null;
        try { rep = this.representative(); } catch (e) {}
        if (vid !== this.villagerId && (!rep || vid !== rep.id)) return;
        var links = this.villageLinks(HOME);
        if (!links.length) return;
        var nm = 'them';
        try { nm = String(this.displayName(vid)).split(' ')[0]; } catch (e) {}
        this.say(`🕯️ ${nm} is dead — and the dead hold no treaties. Every link Haven has shakes.`);
        for (var i = 0; i < links.length; i++) {
          try { this.successionCrisis(links[i].id); } catch (e) {}
        }
      } catch (e) {}
    },

    // successionCrisis: the primary installs their own, the village
    // renegotiates in the chaos, or the link snaps. Trust decides which.
    successionCrisis(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      link.trust = Math.max(0, link.trust - 15);
      this._ensureDims(link);
      this._feudChange(link, 10); // chaos feeds the feud
      var other = link.subordinate === HOME ? link.primary : link.subordinate;
      if (link.subordinate === HOME) {
        // their leverage grows in our chaos: they install their own
        link.tributeKcalPerWeek = Math.round(link.tributeKcalPerWeek * 1.5);
        this._linkNote(link, 'succession', 'They installed their own speaker. Tribute up to ' + link.tributeKcalPerWeek.toLocaleString() + '.');
        this.say(`With Haven grieving, ${this._ovName(other)} installs their own speaker at the table. Tribute rises to ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. Grief is leverage, and they know it.`);
      } else {
        // our subordinate tests whether we hold
        link.trust = Math.max(0, link.trust - 10);
        this._linkNote(link, 'succession', this._ovName(other) + ' watches to see if Haven holds.');
        this.say(`${this._ovName(other)} watches to see if Haven holds without its dead. They'll test the link — count on it.`);
      }
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'succession:' + other); } catch (e) {}
      if (link.trust < 20) {
        this.say('In the chaos, the link snaps. Nobody meant it. That\'s how these things go.');
        this.breakLink(link.id, 'succession');
        return 'broken';
      }
      return 'shaken';
    },

    // theirLeaderDied: the mirror — called when word comes (gossip, catch-up
    // sim) that the other village's speaker is dead. Chaos is opportunity.
    // A stranger takes the table: new temperament, new goals, and Haven
    // knows NOTHING of them until it learns again.
    theirLeaderDied(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      this._ensureDims(link);
      link.trust = Math.max(0, link.trust - 15);
      var other = link.subordinate === HOME ? link.primary : link.subordinate;
      var ov = this._otherVillage(other);
      var old = (ov && ov.leader && ov.leader.name) || 'their speaker';
      try { this._genLeader(other); } catch (e) {}
      try {
        var ist = this._intelState();
        var ie = ist[other] || (ist[other] = {});
        ie.temperKnown = false; ie.goalsKnown = false;
        if (ov) ov.leaderMet = false;
      } catch (e) {}
      if (link.subordinate === HOME) {
        link.tributeKcalPerWeek = Math.max(500, Math.round(link.tributeKcalPerWeek * 0.75));
        this._linkNote(link, 'succession', 'Their speaker died; Haven renegotiated in the chaos.');
        this.say(`🕯️ Word comes: ${old} of ${this._ovName(other)} is dead. In the chaos, Haven renegotiates — tribute down to ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. A stranger holds their table now — Haven knows nothing of them. The gambit would be cheap now, too. Remember that.`);
      } else {
        link.tributeKcalPerWeek = Math.round(link.tributeKcalPerWeek * 1.5);
        this._linkNote(link, 'succession', 'Haven installed its own speaker at their table.');
        this.say(`🕯️ Their speaker is dead. Haven installs its own at ${this._ovName(other)}'s table — the empire's manners. Tribute rises to ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. A stranger holds their table now — and strangers are watched.`);
      }
      return true;
    },

    // ---------- THE EARNED ENDING ----------

    // kingdomEndingEligible: joining another kingdom is a legitimate ending —
    // the valued subordinate at the table, there because the primary can't
    // afford to lose them. The endings system consumes this frame.
    kingdomEndingEligible() {
      try {
        var day = (this.state.scholar || {}).day || 0;
        var links = this.hierarchyState();
        for (var i = 0; i < links.length; i++) {
          var l = links[i];
          if (l.status !== 'active' || l.subordinate !== HOME) continue;
          if (l.trust >= 70 && (l.arrears || 0) === 0 && (day - (l.day || 0)) >= 21) {
            return { eligible: true, frame: 'the valued subordinate', linkId: l.id, primary: l.primary, trust: l.trust };
          }
        }
      } catch (e) {}
      return { eligible: false };
    },

    // ---------- LINK DIMENSIONS ----------

    // _ensureDims: backfills the dimension object on legacy links. Five
    // dimensions run on every link: feud (warband pressure), water
    // (water-rights), exchange (cultural exchange), marriage (bonds), and
    // spies (our report network into them, held in the intel store).
    _ensureDims(link) {
      if (!link) return null;
      link.dims = link.dims || {};
      var d = link.dims;
      if (d.feud == null) d.feud = 10;
      if (d.water == null) d.water = 'none';
      if (d.exchange == null) d.exchange = 5;
      if (d.marriage == null) d.marriage = 0;
      if (link.refusals == null) link.refusals = 0;
      return d;
    },

    _linkOther(link) {
      return link.subordinate === HOME ? link.primary : link.subordinate;
    },

    _ovLeader(vid) {
      var ov = this._otherVillage(vid);
      return (ov && ov.leader) || null;
    },

    // _feudChange: marriage bonds dampen feud RISES (families on both
    // sides pull their people back). Falls are never dampened.
    _feudChange(link, delta) {
      var dims = this._ensureDims(link);
      if (delta > 0 && dims.marriage > 0) delta = Math.max(1, Math.round(delta * (1 - 0.15 * dims.marriage)));
      dims.feud = Math.max(0, Math.min(100, dims.feud + delta));
      return dims.feud;
    },

    feudWith(vid) {
      var link = this.linkWith(vid);
      if (!link) return null;
      return this._ensureDims(link).feud;
    },

    waterRights(vid) {
      var link = this.linkWith(vid);
      if (!link) return 'none';
      return this._ensureDims(link).water;
    },

    // negotiateWater: water-rights are a dimension of the link — none →
    // shared → formalized. Formalized water counts: tribute owed drops a
    // tenth. Failure leaves the water contested, and contested water
    // breeds feud every week.
    negotiateWater(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      var dims = this._ensureDims(link);
      var other = this._linkOther(link);
      if (dims.water === 'formalized') { this.say(`The water-rights with ${this._ovName(other)} are already formalized — the creek has two names and one law.`); return 'formalized'; }
      var need = dims.water === 'shared' ? 45 : 40;
      var score = link.trust / 2 + dims.exchange / 3 + R() * 20 - 10;
      if (dims.water === 'shared' && link.trust < 55) score = -1; // formalizing takes real trust
      if (score >= need) {
        dims.water = dims.water === 'shared' ? 'formalized' : 'shared';
        link.trust = Math.min(100, link.trust + 4);
        this._linkNote(link, 'water', 'Water-rights: ' + dims.water + '.');
        if (dims.water === 'formalized') this.say(`💧 Water-rights with ${this._ovName(other)} are FORMALIZED — the creek has two names and one law. (Tribute owed drops a tenth; water counts.)`);
        else this.say(`💧 ${this._ovName(other)} agrees to share the creek water — for now. One more negotiation could formalize it.`);
        return dims.water;
      }
      dims.water = 'contested';
      this._feudChange(link, 10);
      link.trust = Math.max(0, link.trust - 5);
      this._linkNote(link, 'water', 'Talks failed — water contested.');
      this.say('The water talks fail. Both villages drink from the same creek and glare across it — the water is CONTESTED now, and contested water breeds feud.');
      return 'contested';
    },

    // arrangeMarriage: families across the link. Each bond dampens feud
    // rises and steadies the link — and breaking a bonded link is a social
    // wound, not just a political one (see breakLink).
    arrangeMarriage(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      var dims = this._ensureDims(link);
      var other = this._linkOther(link);
      if (dims.marriage >= 4) { this.say(`Four marriages bind Haven and ${this._ovName(other)} — the families are thoroughly tangled already.`); return dims.marriage; }
      if (link.trust < 40) { this.say(`${this._ovName(other)} won't hear of marriages — not at this trust. Earn the table first.`); return null; }
      var chance = 0.4 + dims.exchange / 200 + link.trust / 400;
      if (R() < chance) {
        dims.marriage++;
        this._feudChange(link, -15);
        link.trust = Math.min(100, link.trust + 5);
        this._linkNote(link, 'marriage', 'A marriage bond formed (' + dims.marriage + ' total).');
        try { this._evolveLeader(other, 'marriage'); } catch (e) {}
        this.say(`💒 A marriage between Haven and ${this._ovName(other)} — the feast lasts three days and the feud ledgers lose a page. (${dims.marriage} bond${dims.marriage > 1 ? 's' : ''}.)`);
        return dims.marriage;
      }
      link.trust = Math.max(0, link.trust - 3);
      this.say('The marriage talks stall — wrong family, wrong season. Nobody is insulted. Yet.');
      return null;
    },

    // plantSpy: grow our report network inside another village. +10 per
    // planting (max 100); each planting risks discovery (feud +30, trust
    // -20). Thresholds unlock intel: 30 = strength, 60 = intentions and
    // demands, 85 = the leader's goals.
    plantSpy(vid) {
      var ov = this._otherVillage(vid);
      if (!ov) { this.say('You don\'t know them well enough to plant anyone.'); return null; }
      var ist = this._intelState();
      var ie = ist[vid] || (ist[vid] = {});
      ie.spies = Math.min(100, (ie.spies || 0) + 10);
      var nm = ov.name || 'them';
      if (R() < 0.18) {
        var link = this.linkWith(vid);
        if (link) {
          this._ensureDims(link);
          this._feudChange(link, 30);
          link.trust = Math.max(0, link.trust - 20);
          this._linkNote(link, 'spies', 'They caught one of ours.');
        }
        try { this._evolveLeader(vid, 'spycaught'); } catch (e) {}
        this._revealIntel(vid, { lastSeen: (this.state.scholar || {}).day || 0 });
        this.say(`🕵️ They caught one of ours inside ${nm}. The spy came home walking, which is the kind way to say it. Feud spikes.`);
        return { spies: ie.spies, discovered: true };
      }
      this.say(`One of ours settles quietly into ${nm}. Eyes: ${ie.spies}.`);
      return { spies: ie.spies, discovered: false };
    },

    // _skirmish: feud boils over at the border. Trust burns, feud vents,
    // gossip travels. Villages mostly posture — but posture leaves marks.
    _skirmish(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      this._ensureDims(link);
      var other = this._linkOther(link);
      link.trust = Math.max(0, link.trust - 8);
      link.dims.feud = Math.max(0, link.dims.feud - 20);
      this._linkNote(link, 'skirmish', 'Border scuffle — trust burned, feud vented.');
      try { this._evolveLeader(other, 'skirmish'); } catch (e) {}
      try { this.seedGossip('skirmish_' + link.id, { loyal: -2 }, (this.npcIds ? this.npcIds().slice(0, 4) : [])); } catch (e) {}
      this.say(`⚔️ Border scuffle at the creek line with ${this._ovName(other)} — stones, shouting, one split lip. Nobody died. Everybody will remember it anyway.`);
      return true;
    },

    // ---------- LEADERS: unique people ----------

    // _genLeader: temperament and goals generate per leader, never a fixed
    // cast. Succession brings a stranger — the village does not have a
    // static personality.
    _genLeader(vid) {
      var ov = this._otherVillage(vid);
      if (!ov) return null;
      var m = null;
      try { m = this.mshipState(); } catch (e) {}
      var seq = 0;
      if (m) { m.leaderSeq = m.leaderSeq || {}; seq = (m.leaderSeq[vid] || 0) + 1; m.leaderSeq[vid] = seq; }
      var prior = ov.leader || null;
      var temper = pick(TEMPERAMENTS);
      if (prior) { var g0 = 0; while (temper === prior.temperament && g0++ < 6) temper = pick(TEMPERAMENTS); }
      var goals = pick(LEADER_GOALS);
      if (prior) { var g1 = 0; while (goals === prior.goals && g1++ < 6) goals = pick(LEADER_GOALS); }
      var nm = pick(LEADER_FIRST) + ' ' + pick(LEADER_LAST);
      if (seq > 1) nm += ' ' + (['II', 'III', 'IV', 'the Younger'][seq % 4] || 'II');
      var L = { name: nm, temperament: temper, goals: goals, mood: 'wary', age: Math.round(28 + R() * 30), sinceDay: (this.state.scholar || {}).day || 0 };
      ov.leader = L;
      return L;
    },

    // leaderOf: the knowledge-gated read. Strangers stay strangers until a
    // scout, a negotiation, or the exchange network teaches you their name —
    // temperament and goals longer still.
    leaderOf(vid) {
      var ov = this._otherVillage(vid);
      if (!ov || !ov.leader) return { known: false };
      var ie = {};
      try { ie = this._intelState()[vid] || {}; } catch (e) {}
      var met = !!ov.leaderMet || !!this.linkWith(vid);
      if (!met && !ie.leaderKnown) return { known: false, note: 'No word of who speaks for ' + (ov.name || 'them') + '.' };
      var L = ov.leader;
      return {
        known: true, name: L.name,
        temperament: ie.temperKnown ? L.temperament : 'unknown',
        goals: ie.goalsKnown ? L.goals : 'unknown',
        mood: ie.temperKnown ? L.mood : 'unknown',
        age: ie.temperKnown ? L.age : 'unknown',
      };
    },

    // _evolveLeader: events change leaders. Mood slides along the scale;
    // great shocks can redirect goals. People change during a run.
    _evolveLeader(vid, evt) {
      var L = this._ovLeader(vid);
      if (!L) return null;
      var mi = LEADER_MOODS.indexOf(L.mood);
      if (mi < 0) mi = 2;
      var d = 0;
      if (evt === 'paid' || evt === 'marriage' || evt === 'honored') d = -1;
      else if (evt === 'refused' || evt === 'spycaught') d = 1;
      else if (evt === 'skirmish' || evt === 'ultimatum_refused') d = 2;
      else if (evt === 'crisis') { d = 1; if (R() < 0.4) { var g = pick(LEADER_GOALS); if (g !== L.goals) L.goals = g; } }
      L.mood = LEADER_MOODS[Math.max(0, Math.min(LEADER_MOODS.length - 1, mi + d))];
      return L.mood;
    },

    // rivalLeaderDied: the day-engine-visible beat. A rival's speaker dies —
    // of age, of winter, of politics — and a stranger takes the table.
    // Knowledge-gated: if Haven never heard of them, the table turns
    // silently in the sim.
    rivalLeaderDied(vid) {
      var ov = this._otherVillage(vid);
      if (!ov) return null;
      var ie = {};
      try { ie = this._intelState()[vid] || {}; } catch (e) {}
      var heard = !!ov.leaderMet || !!this.linkWith(vid) || !!ie.leaderKnown;
      var old = (ov.leader && ov.leader.name) || 'their speaker';
      var nm = ov.name || 'them';
      if (!heard) {
        try { this._genLeader(vid); ov.leaderMet = false; } catch (e) {}
        return ov.leader;
      }
      var links = this.hierarchyState();
      var any = false;
      for (var i = 0; i < links.length; i++) {
        if (links[i].status !== 'active') continue;
        if (this._linkOther(links[i]) === vid) { any = true; try { this.theirLeaderDied(links[i].id); } catch (e) {} }
      }
      if (!any) {
        try { this._genLeader(vid); } catch (e) {}
        try {
          var ist = this._intelState();
          var i2 = ist[vid] || (ist[vid] = {});
          i2.temperKnown = false; i2.goalsKnown = false;
          ov.leaderMet = false;
        } catch (e) {}
        this.say(`🕯️ Word comes down the trade road: ${old} of ${nm} is dead. A stranger holds the table now — Haven knows nothing of them.`);
      }
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'rivaldeath:' + vid); } catch (e) {}
      return ov.leader;
    },

    // _leaderAging: leaders are mortal. The old die; the table turns over.
    // Moods drift with the weather of the relationship.
    _leaderAging() {
      try {
        var ovs = this.state.otherVillages || [];
        for (var i = 0; i < ovs.length; i++) {
          var ov = ovs[i];
          if (!ov || !ov.leader) continue;
          ov.leader.age += 1 / 365;
          var age = ov.leader.age;
          var p = age > 55 ? 0.004 : (age > 45 ? 0.001 : 0.0002);
          if (R() < p) this.rivalLeaderDied(ov.id);
          else if (R() < 0.02) {
            var link = this.linkWith(ov.id);
            if (link) {
              if (link.trust >= 70) this._evolveLeader(ov.id, 'paid');
              else if (link.trust <= 25) this._evolveLeader(ov.id, 'refused');
            }
          }
        }
      } catch (e) {}
    },

    // ---------- INTEL: knowledge-gated ----------

    _intelState() {
      var m = null;
      try { m = this.mshipState(); } catch (e) { return {}; }
      m.intel = m.intel || {};
      return m.intel;
    },

    _revealIntel(vid, patch) {
      var ist = this._intelState();
      var ie = ist[vid] || (ist[vid] = {});
      for (var k in patch) ie[k] = patch[k];
      return ie;
    },

    // villageIntel: the ONLY honest read path for other-village facts.
    // Unrevealed fields read 'unknown' — if you don't know, it doesn't show.
    villageIntel(vid) {
      var ov = this._otherVillage(vid);
      if (!ov) return { known: false };
      var ie = this._intelState()[vid] || {};
      return {
        known: true, name: ov.name || vid,
        strength: ie.strength || 'unknown',
        intentions: ie.intentions || 'unknown',
        demands: ie.demands || 'unknown',
        lastSeen: ie.lastSeen != null ? ie.lastSeen : 'never',
        sources: (ie.sources || []).slice(),
      };
    },

    // scoutIntel: send a scout for a day. They return at dusk tomorrow with
    // what they saw — strength always; intentions and the leader's name when
    // the network (spies/exchange) can place them. Costs a day; days are food.
    scoutIntel(vid) {
      var ov = this._otherVillage(vid);
      if (!ov) { this.say('You don\'t know them well enough to scout.'); return null; }
      var m = null;
      try { m = this.mshipState(); } catch (e) {}
      if (!m) return null;
      if (m.scoutOut) { this.say('A scout is already out. One set of eyes at a time.'); return null; }
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      m.scoutOut = { vid: vid, untilDay: day + 1 };
      this.say(`🌲 A scout slips out at dawn toward ${ov.name || 'them'}. Word by tomorrow dusk — scouting costs a day, and days are food.`);
      return true;
    },

    _scoutReturns() {
      try {
        var m = this.mshipState();
        if (!m.scoutOut) return;
        var day = 0;
        try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
        if (day < m.scoutOut.untilDay) return;
        var vid = m.scoutOut.vid;
        m.scoutOut = null;
        var ov = this._otherVillage(vid);
        if (!ov) return;
        try { if (!ov.leader) this._genLeader(vid); } catch (e) {}
        var ie = this._revealIntel(vid, {});
        ie.strength = this._strengthWord(vid);
        ie.leaderKnown = true;
        var link = this.linkWith(vid);
        var dims = link ? this._ensureDims(link) : null;
        var spies = ie.spies || 0;
        var exch = dims ? dims.exchange : 0;
        if (spies >= 30 || exch >= 40) { ie.temperKnown = true; ie.intentions = this._intentionsWord(vid); }
        if (spies >= 60 || exch >= 70) ie.demands = this._demandsWord(vid);
        if (spies >= 85) ie.goalsKnown = true;
        ie.lastSeen = day;
        ie.sources = ie.sources || [];
        if (ie.sources.indexOf('scout') < 0) ie.sources.push('scout');
        try { ov.leaderMet = true; } catch (e) {}
        var bits = ['strength: ' + ie.strength];
        if (ie.intentions && ie.intentions !== 'unknown') bits.push('intentions: ' + ie.intentions);
        if (ie.demands && ie.demands !== 'unknown') bits.push('demands run ' + ie.demands);
        var L = ov.leader ? ov.leader.name : 'their speaker';
        this.say(`🌲 The scout returns from ${ov.name || 'them'}: ${bits.join('; ')}. Their speaker is ${L}.`);
      } catch (e) {}
    },

    // _strengthWord: THEIR standing vs OURS, in words. The sim knows the
    // numbers; the player gets the scout's honest read.
    _strengthWord(vid) {
      var theirs = 0, ours = 0;
      try { theirs = this.villageStandingOf(vid); ours = this.regionalStanding(); } catch (e) {}
      if (ours <= 0) return theirs > 0 ? 'weaker' : 'even';
      var r = theirs / ours;
      if (r < 0.8) return 'weaker';
      if (r > 1.25) return 'stronger';
      return 'even';
    },

    _intentionsWord(vid) {
      var L = this._ovLeader(vid);
      var g = L ? L.goals : null;
      var map = {
        expand: 'they mean to grow — watch the borders',
        hoard: 'they are stacking food and grudges',
        learn: 'they are curious about Haven, not hungry',
        endure: 'they want to be left alone',
        unite: 'they dream of one organization under them',
        prove: 'they have something to prove, and Haven is convenient',
      };
      return (g && map[g]) || 'patient, for now';
    },

    _demandsWord(vid) {
      var L = this._ovLeader(vid);
      var t = L ? L.temperament : null;
      if (t === 'greedy' || t === 'volatile') return 'heavy';
      if (t === 'patient' || t === 'cautious') return 'patient';
      return 'lean';
    },

    // ---------- ESCALATION & CONSEQUENCES ----------

    // escalate: two refusals and patience ends. The ultimatum: pay arrears
    // and a half, now, or the link snaps. The leader's temperament colors
    // the threat.
    escalate(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active' || link.pendingDemand) return null;
      this._ensureDims(link);
      var other = this._linkOther(link);
      var leader = this._ovLeader(other);
      var temper = leader ? leader.temperament : 'unknown';
      var cost = Math.round((link.arrears || link.tributeKcalPerWeek) * 1.5);
      link.pendingDemand = { kind: 'ultimatum', costKcal: cost, detail: `Pay ${cost.toLocaleString()} kcal — arrears and a half — or the link is dust.` };
      this._feudChange(link, 15);
      this._linkNote(link, 'demand', 'ULTIMATUM: ' + cost.toLocaleString() + ' kcal.');
      var tline = temper === 'proud' ? 'Pride does not ask twice.'
        : temper === 'volatile' ? 'Something in their voice says this is the last warning.'
        : 'The message is short. That is the frightening part.';
      this.say(`📯 ULTIMATUM from ${this._ovName(other)}: ${cost.toLocaleString()} kcal, now, or the link snaps. ${tline}`);
      return link.pendingDemand;
    },

    _answerUltimatum(link, d, accept) {
      var other = link.primary;
      if (accept) {
        var paid = this._removePantryKcal(d.costKcal || 0);
        link.arrears = 0;
        link.refusals = 0;
        link.trust = Math.min(100, link.trust + 5);
        this._feudChange(link, -20);
        this._linkNote(link, 'demand', 'Swallowed the ultimatum: ' + paid.toLocaleString() + ' kcal.');
        this.say(`You swallow it — ${paid.toLocaleString()} kcal walks out the gate. ${this._ovName(other)} stands down. The link holds, barely.`);
      } else {
        link.trust = Math.max(0, link.trust - 30);
        this._feudChange(link, 30);
        this._linkNote(link, 'demand', 'REFUSED THE ULTIMATUM.');
        try { this._evolveLeader(other, 'ultimatum_refused'); } catch (e) {}
        this.say(`You refuse the ultimatum. ${this._ovName(other)} goes very still. Trust: ${link.trust}.`);
        if (link.trust < 30) {
          this.say(`${this._ovName(other)} walks. "Then we are done being patient."`);
          this.breakLink(link.id, 'ultimatum');
        }
      }
      return true;
    },

    // coalitionTax: feeding a coalition gets exponentially harder — each
    // link beyond the first multiplies every tribute owed by 1.25. Scale
    // transitions are not speedrunnable: empires eat.
    coalitionTax() {
      var n = 0;
      try {
        var links = this.hierarchyState();
        for (var i = 0; i < links.length; i++) if (links[i].status === 'active') n++;
      } catch (e) {}
      return Math.round(Math.pow(1.25, Math.max(0, n - 1)) * 100) / 100;
    },

    // _tributeOwed: base tribute × coalition tax, less a tenth when the
    // water-rights are formalized (water counts as tribute).
    _tributeOwed(link) {
      var owed = Math.round((link.tributeKcalPerWeek || 0) * this.coalitionTax());
      try { if (link.dims && link.dims.water === 'formalized') owed = Math.round(owed * 0.9); } catch (e) {}
      return owed;
    },

    _addPantryKcal(kcal, label) {
      try {
        var v = this.state.village || {};
        var pantry = v.pantry || (v.pantry = []);
        var day = 0;
        try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
        pantry.push({ name: label || 'Tribute stores', kcalEach: 400, units: Math.max(1, Math.round(kcal / 400)), spoilDay: day + 21 });
      } catch (e) {}
      return kcal;
    },

    tributeResentment() {
      try { return this.mshipState().tributeResentment || 0; } catch (e) { return 0; }
    },

    // _resentmentTick: resentment cools slowly; grumbles surface at 70; at
    // the boil, the village refuses the next tribute outright — paying is a
    // village act, and the village can say no.
    _resentmentTick() {
      try {
        var m = this.mshipState();
        var r = m.tributeResentment || 0;
        if (r > 0) m.tributeResentment = Math.max(0, r - 2);
        if ((m.tributeResentment || 0) >= 70 && R() < 0.3) {
          this.say('The pantry crew grumbles about the tribute carts again. Every basket that leaves is a meal someone here doesn\'t eat.');
        }
        if ((m.tributeResentment || 0) >= 100 && !m.tributeRefused) {
          m.tributeRefused = true;
          m.tributeResentment = 60;
          this.say('🛑 The pantry crew folds its arms: NO MORE tribute carts until the resentment cools. The village refuses to feed its own leash.');
        }
      } catch (e) {}
    },

    // _caravanBeats: tribute you RECEIVE arrives as a visible caravan at the
    // gate — day-engine-visible. Neutral villages send trade caravans too,
    // and watching one teaches you their strength (observed events teach).
    _caravanBeats() {
      try {
        var day = 0;
        try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
        var links = this.hierarchyState();
        for (var i = 0; i < links.length; i++) {
          (function (self, link) {
            try {
              if (link.status !== 'active' || link.primary !== HOME) return;
              if (link.lastCaravanWeek === self._week() || R() >= 0.4) return;
              link.lastCaravanWeek = self._week();
              self._linkNote(link, 'caravan', 'Tribute caravan seen at the gate.');
              self.say(`🐪 A tribute caravan from ${self._ovName(link.subordinate)} winds through the gate — the pantry grows heavier.`);
            } catch (e) {}
          })(this, links[i]);
        }
        var ovs = this.state.otherVillages || [];
        for (var j = 0; j < ovs.length; j++) {
          (function (self, ov) {
            try {
              if (!ov || self.linkWith(ov.id)) return;
              if (R() >= 0.05) return;
              var ie = self._revealIntel(ov.id, {});
              ie.strength = self._strengthWord(ov.id);
              ie.lastSeen = day;
              ie.sources = ie.sources || [];
              if (ie.sources.indexOf('caravan') < 0) ie.sources.push('caravan');
              self.say(`🐪 A trade caravan from ${ov.name || 'them'} passes on the old road — fat wagons, armed guards. The scouts make their measure: they look ${ie.strength} than Haven.`);
            } catch (e) {}
          })(this, ovs[j]);
        }
      } catch (e) {}
    },

    // ---------- DAILY ----------

    hierarchyDaily() {
      try { this.linkTick(); } catch (e) {}
      try { this._leaderAging(); } catch (e) {}
      try { this._scoutReturns(); } catch (e) {}
      try { this._caravanBeats(); } catch (e) {}
      try { this._resentmentTick(); } catch (e) {}
    },
  };

  for (var k in methods) G[k] = methods[k];

  // ---------- WRAPS ----------

  // recordDeed: subordinate deeds feed the link. Members are the edges —
  // their fame is the village's leverage. (Guarded: ledger-owned.)
  var _recordDeed = G.recordDeed;
  if (_recordDeed) {
    G.recordDeed = function (vid, type, text, magnitude) {
      var r = _recordDeed.apply(this, arguments);
      try {
        if (this.isMember && this.isMember(vid)) {
          var links = this.villageLinks ? this.villageLinks('haven') : [];
          for (var i = 0; i < links.length; i++) {
            if (links[i].subordinate === 'haven') this.proveWorth(links[i].id, vid, magnitude);
          }
        }
      } catch (e) {}
      return r;
    };
  }

  // registerDeath: THE hook (the mantle-passing calls it). Leader deaths
  // detonate hierarchies.
  var _registerDeath = G.registerDeath;
  if (_registerDeath) {
    G.registerDeath = function (opts) {
      var r = _registerDeath.apply(this, arguments);
      try { if (this.onLeaderDeath) this.onLeaderDeath(opts && opts.villagerId); } catch (e) {}
      return r;
    };
  }

  // hierarchyDaily rides membershipDaily.
  var _membershipDaily = G.membershipDaily;
  G.membershipDaily = function () {
    try { if (this.hierarchyDaily) this.hierarchyDaily(); } catch (e) {}
    return _membershipDaily ? _membershipDaily.call(this) : undefined;
  };

})();
