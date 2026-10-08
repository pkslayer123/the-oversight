// @ontology
// system: hierarchy
// description: Inter-village hierarchy. Villages have relationships, rivalries, trade.
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
//   - _nudgeOpinion(villageId, delta)
// rules:
//   - courtship_moves_opinion: joining a village (+5, once) and studying its codex (+3, once) raise its opinion of Haven; cold proposals usually decline (judgeLink base 38) — the climb is earned. (code: hierarchy.js)
//   - join_surfaces_village_news: joining a village reads up to 3 recent village.news entries (named catch-up deaths/births) at their fire. (code: hierarchy.js)
// consumes:
//   - state.otherVillages
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

    // ---------- OPINION (the courtship currency) ----------

    // _nudgeOpinion: a village's opinion of Haven moves ONLY through lived
    // contact — joining them, honoring their knowledge, deeds on the
    // broadcast (ledger.arenaAct), or breaking faith (decline/breakLink).
    // Clamped ±100. Drifter loop 2026-10-08: before this, joining a village,
    // living at their fire, and studying their codex moved opinion by exactly
    // nothing — the only positive source was arena broadcasts, and the
    // proposal was nearly free anyway. The climb didn't exist.
    _nudgeOpinion(villageId, delta) {
      try {
        var ov = this._otherVillage(villageId);
        if (!ov) return 0;
        ov.opinion = Math.max(-100, Math.min(100, (ov.opinion || 0) + delta));
        return ov.opinion;
      } catch (e) { return 0; }
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
    // COURTSHIP IS THE CLIMB (drifter loop 2026-10-08): a cold proposal with
    // no relationship behind it usually declines — the door isn't shut, but
    // opinion has to be EARNED first (join them, learn their codex, deeds on
    // the broadcast). Base 38, not 50: the old base accepted ~80% of cold
    // proposals, skipping the climb entirely.
    judgeLink(targetId, opts) {
      opts = opts || {};
      var score = 38, reasons = [];
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
      var ourS = 0, theirS = 0;
      try { ourS = this.regionalStanding(); theirS = this.villageStandingOf(targetId); } catch (e) {}
      if (opts.asSubordinate) {
        score += 10;
        reasons.push('Haven offers itself as subordinate — a tributary, not a rival.');
      } else {
        if (ourS > theirS) { score += Math.min(15, (ourS - theirS) / 5); reasons.push('Haven is the stronger — they know it.'); }
        else { score -= 10; reasons.push('Why would they bow to the weaker?'); }
      }
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
        };
        this.hierarchyState().push(link);
        this._linkNote(link, 'formed',
          opts.asSubordinate ? 'Haven joined ' + nm + ' as subordinate.' : nm + ' joined Haven as subordinate.');
        var rn = j.rep ? String(this.displayName(j.rep.id)).split(' ')[0] : 'Someone';
        this.say(`⛓️ ${rn} brings it home: ${opts.asSubordinate ? 'Haven bows to ' + nm + ' — one organization, them primary.' : nm + ' bows to Haven — one organization, us primary.'} Tribute: ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. The relationship starts at trust 30. Everything from here is earned.`);
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'linked:' + targetId + ':' + (opts.asSubordinate ? 'sub' : 'prim')); } catch (e) {}
        return link;
      }
      this.say(`${nm} declines. ${j.reasons.join(' ')} The door isn't shut — just not today.`);
      try { if (this._nudgeOpinion) this._nudgeOpinion(targetId, -5); else ov.opinion = (ov.opinion || 0) - 5; } catch (e) {}
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

    // payTribute: the subordinate's due. Real food leaves the pantry.
    payTribute(linkId, kcal) {
      var link = null;
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active' || link.subordinate !== HOME) return null;
      var owed = link.tributeKcalPerWeek;
      var paid = this._removePantryKcal(kcal == null ? owed : kcal);
      var week = this._week();
      if (paid >= owed) {
        link.tributePaidWeek = week; link.arrears = 0;
        link.trust = Math.min(100, link.trust + 3);
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
    // arrears, and the primary notices. Runs inside membershipDaily.
    linkTick() {
      try {
        var m = this.mshipState();
        var week = this._week();
        if (m.lastLinkWeek === week) return;
        m.lastLinkWeek = week;
        var links = this.hierarchyState();
        for (var i = 0; i < links.length; i++) {
          (function (self, link) {
            try {
              if (link.status !== 'active') return;
              if (link.subordinate === HOME) {
                if ((link.tributePaidWeek || -1) < week) {
                  link.arrears += link.tributeKcalPerWeek;
                  link.trust = Math.max(0, link.trust - 6);
                  self._linkNote(link, 'arrears', 'Tribute unpaid. Arrears ' + link.arrears.toLocaleString() + ' kcal.');
                  if (R() < 0.4) self.say(`⚠️ ${self._ovName(link.primary)} notices the missing tribute. Arrears: ${link.arrears.toLocaleString()} kcal. The air changes.`);
                } else {
                  link.trust = Math.min(100, link.trust + 1);
                }
                // the primary calls, sometimes
                if (R() < 0.2) self.primaryDemand(link.id);
              } else if (link.primary === HOME) {
                // our subordinate pays us — abstracted, trust-weighted
                if (R() < link.trust / 100) {
                  link.trust = Math.min(100, link.trust + 1);
                  self._linkNote(link, 'tribute', self._ovName(link.subordinate) + ' paid. The pantry grows.');
                } else {
                  link.arrears += link.tributeKcalPerWeek;
                  link.trust = Math.max(0, link.trust - 4);
                  if (R() < 0.35) self.say(`⚠️ ${self._ovName(link.subordinate)} is late with tribute. The air changes.`);
                }
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
      var kind = pick(['tribute', 'tribute', 'aid', 'counsel']);
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
      var d = link.pendingDemand;
      link.pendingDemand = null;
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
        link.trust = Math.min(100, link.trust + 8);
        this._linkNote(link, 'demand', 'Honored the call (' + d.kind + ').');
        this.say(`The obligation is honored. Trust with ${this._ovName(link.primary)}: ${link.trust}.`);
      } else {
        link.trust = Math.max(0, link.trust - 15);
        this._linkNote(link, 'demand', 'REFUSED the call (' + d.kind + ').');
        this.say(`You refuse ${this._ovName(link.primary)}. The air changes — trust: ${link.trust}. Refusals are remembered longer than payments.`);
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
      if (ourS < theirS * 0.9) {
        this.say(`Not yet. Haven's standing (${ourS}) against theirs (${theirS}) — they'd laugh. Grow first: deeds, tribute paid, trust.`);
        return null;
      }
      if (link.trust >= 60) {
        // THE TABLE TURNS
        var old = link.primary;
        link.primary = HOME; link.subordinate = old;
        link.trust = Math.max(0, link.trust - 10);
        link.arrears = 0; link.tributePaidWeek = -1;
        this._linkNote(link, 'flipped', 'Primacy flipped: Haven is primary.');
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'primacy:' + old); } catch (e) {}
        this.say(`👑 The table turns: ${this._ovName(old)} bows to HAVEN now. Earned — every deed, every tribute, every honored call. Nobody likes it. Everybody respects it.`);
        return 'flipped';
      }
      // not trusted enough to flip — settle for better terms
      link.tributeKcalPerWeek = Math.max(500, Math.round(link.tributeKcalPerWeek * 0.5));
      link.trust = Math.max(0, link.trust - 10);
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
    theirLeaderDied(linkId) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      link.trust = Math.max(0, link.trust - 15);
      var other = link.subordinate === HOME ? link.primary : link.subordinate;
      if (link.subordinate === HOME) {
        link.tributeKcalPerWeek = Math.max(500, Math.round(link.tributeKcalPerWeek * 0.75));
        this._linkNote(link, 'succession', 'Their speaker died; Haven renegotiated in the chaos.');
        this.say(`Word comes: ${this._ovName(other)}'s speaker is dead. In the chaos, Haven renegotiates — tribute down to ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. The gambit would be cheap now, too. Remember that.`);
      } else {
        link.tributeKcalPerWeek = Math.round(link.tributeKcalPerWeek * 1.5);
        this._linkNote(link, 'succession', 'Haven installed its own speaker at their table.');
        this.say(`Their speaker is dead. Haven installs its own at ${this._ovName(other)}'s table — the empire's manners. Tribute rises to ${link.tributeKcalPerWeek.toLocaleString()} kcal/week.`);
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

    // ---------- DAILY ----------

    hierarchyDaily() {
      try { this.linkTick(); } catch (e) {}
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

  // COURTSHIP (drifter loop 2026-10-08): joining a village and honoring their
  // knowledge moves their opinion of Haven — once per village, no farming.
  // Joining also surfaces their catch-up history: the sim records named
  // deaths and births in village.news, but nothing ever READ it to the
  // player. Around their fire, they tell you what the years did.
  var _joinVillageH = G.joinVillage;
  if (_joinVillageH) {
    G.joinVillage = function (villageId) {
      var r = _joinVillageH.apply(this, arguments);
      try {
        var ov = (this.state.otherVillages || []).find(function (x) { return x.id === villageId; });
        if (ov && !ov._joinOpinionGiven) {
          ov._joinOpinionGiven = true;
          if (this._nudgeOpinion) this._nudgeOpinion(villageId, 5);
          var news = (ov.news || []).slice(-3);
          if (news.length) {
            this.say(`Around their fire, you hear what the years did:\n${news.join('\n')}`);
          }
        }
      } catch (e) {}
      return r;
    };
  }

  // studyVillageCodex: honoring their book moves opinion, once per village.
  var _studyVillageCodexH = G.studyVillageCodex;
  if (_studyVillageCodexH) {
    G.studyVillageCodex = function (villageId) {
      var r = _studyVillageCodexH.apply(this, arguments);
      try {
        // success = a study summary ("You study..." or "...holds nothing you
        // don't already know."); failures return the "No codex here." /
        // "You need to be at the village to study" lines.
        var ok = (typeof r === 'string') && r.indexOf('No codex here.') !== 0 &&
                 r.indexOf('You need to be at the village') !== 0;
        var ov = (this.state.otherVillages || []).find(function (x) { return x.id === villageId; });
        if (ok && ov && !ov._codexOpinionGiven) {
          ov._codexOpinionGiven = true;
          if (this._nudgeOpinion) this._nudgeOpinion(villageId, 3);
          this.say(`Word gets around ${ov.name || 'the village'}: you sat with their book and treated it like it mattered. They noticed.`);
        }
      } catch (e) {}
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
