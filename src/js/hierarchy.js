// @ontology
// system: hierarchy
// description: Inter-village hierarchy. Villages have relationships, rivalries, trade.
// provides:
//   - hierarchyState()
//   - linkWith(vid, other)
//   - knowsVillage(v)
//   - linkStanding(a, b)
//   - breakLink(a, b)
//   - judgeLink(a, b)
//   - proposeLink(a, b)
//   - answerCounter(how)
//   - answerDemand(a, b)
//   - payTribute(a, b)
//   - primaryDemand(linkId)
//   - proveWorth(linkId, vid, mag)
//   - successionCrisis(linkId)
//   - renegotiateLink(linkId)
//   - bidForPrimacy(linkId)
//   - villageLinks(villageId)
//   - representative()
//   - hierarchyDaily()
//   - linkTick(a, b)
//   - onLeaderDeath(vid)
//   - theirLeaderDied(linkId)
//   - stageFirstAccord(link)
//   - answerAccord(how)
//   - deliverVillageRumors()
//   - kingdomEndingEligible()
//   - _nudgeOpinion(villageId, delta)
// rules:
//   - courtship_moves_opinion: joining a village (+5, once) and studying its codex (+3, once) raise its opinion of Haven; cold proposals usually draw a counter-offer in the 35-54 band (judgeLink base 38) — the negotiation is the climb, and acceptance is earned through courtship (generosity bonus needs opinion 5+). (code: hierarchy.js)
//   - join_surfaces_village_news: joining a village reads up to 3 recent village.news entries (named catch-up deaths/births) at their fire. (code: hierarchy.js)
//   - negotiation_is_played: proposeLink scores the courtship; >=55 accepts, 35-54 counters with the village's own terms (accept/sweeten/walk away — played, never rolled), <35 declines. (code: hierarchy.js)
//   - regional_dawn: Haven's first-ever link stages a played beat, not a threshold flip — the System overlay grows into coordination (networkLive) and the player chooses Haven's first gesture (gift/visit/cold), each with real costs. (code: hierarchy.js)
//   - speaker_is_named: theirSpeaker is a named person from the sim's roster; when the sim kills them, theirLeaderDied fires the mirror succession beat. (code: hierarchy.js)
//   - rumors_are_delivered: queued village rumors are spoken one per day at the day boundary — "heard of them" is reachable. (code: hierarchy.js)
//   - tribute_partials_dont_double_count: weekly tribute payments accumulate (tributePaidKcal); linkTick charges the true shortfall once — paying half is strictly better than paying nothing. (code: hierarchy.js)
//   - debts_survive_the_break: re-linking a broken pair inherits the latest broken link's outstanding arrears — break to wipe the debt is an exploit the engine refuses, and says so. (code: hierarchy.js)
//   - the_table_burns_the_books: bidForPrimacy's flip clears old arrears (the new primary writes the books) and SAYS so — silent forgiveness was an exploit-shaped honesty hole. (code: hierarchy.js)
//   - tribute_is_real_food: when our subordinate pays, the kcal arrive as a real spoil-dated pantry item — "the pantry grows" is engine, not copy. (code: hierarchy.js)
//   - the_moment_survives: a pending accord killed by a broken first link is said aloud and restaged on the next link (accordUnanswered) — the Regional Dawn moment is never lost silently. (code: hierarchy.js)
//   - demand_honor_is_proportional: honoring a tribute demand with a thin pantry grants proportional trust and honest copy, never a free +8 on empty hands; an already-loaned representative extends instead of being clobbered. (code: hierarchy.js)
//   - the_table_is_weekly: renegotiateLink/bidForPrimacy are one hard conversation per week (lastTableWeek) — the climb is paced in weeks, not ground out in an afternoon. (code: hierarchy.js)
//   - diplomacy_is_knowledge_gated: proposeLink/proposeAlliance refuse villages the player never heard of or visited (knowsVillage). (code: hierarchy.js)
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

    // knowsVillage: the knowledge gate for diplomacy. You've HEARD of them
    // (a traveler's rumor reached you — rumored) or you've BEEN there
    // (approach runs the catch-up sim and sets generated). Broadcast-deed
    // opinion from afar does NOT count — a name you never heard is not
    // knowledge, and never a button. (Regional audit 2026-10-09: the Haven
    // panel used to list every village on the map, met or not.)
    knowsVillage(v) {
      if (!v || v.id === 'haven') return true;
      return !!(v.generated || v.rumored);
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
    // no relationship behind it usually draws a COUNTER-OFFER, not a
    // decline — the negotiation is the climb, and opinion has to be EARNED
    // first (join them, learn their codex, deeds on the broadcast). Base
    // 38, not 50: the old base accepted ~80% of cold proposals, skipping
    // the climb entirely.
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
      // GENEROSITY IS EARNED (break-it regional 2026-10-10): the old code
      // handed +8 to any cold offer of 3,000+ — stacked with the +10
      // subordinate bonus, cold proposals accepted ~50% of the time and
      // skipped the counter band (the played negotiation) entirely. A big
      // offer from a stranger is suspicious; from a village that's sat
      // with you (opinion 5+, i.e. courtship started), it's generous.
      if (opts.asSubordinate && trib >= 3000 && opinion >= 5) { score += 8; reasons.push('The tribute offered is generous.'); }
      score += R() * 20 - 10;
      return { score: Math.round(score), reasons: reasons, rep: rep };
    },

    // proposeLink: negotiate one organization, primary/subordinate.
    // opts: {asSubordinate: bool, tributeKcalPerWeek}
    // PLAYED, NOT ROLLED (regional audit 2026-10-09): judgeLink scores the
    // courtship, but the middle band is a negotiation, not a coin flip.
    // score >= 55: earned — they accept. 35-54: they COUNTER with their terms
    // (played: accept / sweeten / walk away). Below 35: declined — do the
    // climb first (join them, study their book, deeds on the broadcast).
    proposeLink(targetId, opts) {
      opts = opts || {};
      var ov = this._otherVillage(targetId);
      if (!ov || !this.knowsVillage(ov)) { this.say('You don\'t know them well enough to propose anything.'); return null; }
      if (this.linkWith(targetId)) { this.say('There is already a link. One organization, one link — tend it.'); return null; }
      if (this.state.pendingCounter) { this.say('There is already an offer on the table — answer it first.'); return 'counter'; }
      var j = this.judgeLink(targetId, opts);
      var nm = ov.name || 'them';
      var opinion = ov.opinion || 0;
      // Active dislike isn't a negotiation — it's a closed door. The climb
      // (join, study, deeds) has to come before the table.
      if (opinion <= -20) {
        this.say(`${nm} declines. ${j.reasons.join(' ')} The door isn't shut forever — but it is shut today.`);
        try { if (this._nudgeOpinion) this._nudgeOpinion(targetId, -5); else ov.opinion = (ov.opinion || 0) - 5; } catch (e) {}
        return null;
      }
      if (j.score >= 55) return this._formLink(targetId, opts, j);
      if (j.score >= 35) return this._stageCounter(targetId, opts, j);
      this.say(`${nm} declines. ${j.reasons.join(' ')} The door isn't shut — just not today.`);
      try { if (this._nudgeOpinion) this._nudgeOpinion(targetId, -5); else ov.opinion = (ov.opinion || 0) - 5; } catch (e) {}
      return null;
    },

    // _stageCounter: the middle band. They don't say no — they name their
    // price. The negotiation is played: accept their terms, sweeten the offer
    // with real food, or walk away from the table.
    _stageCounter(targetId, opts, j) {
      var ov = this._otherVillage(targetId);
      var nm = (ov && ov.name) || 'them';
      var offered = opts.tributeKcalPerWeek || 4000;
      var c = {
        targetId: targetId, opts: opts,
        asSubordinate: true,
        tributeKcalPerWeek: opts.asSubordinate ? Math.max(offered, 6000) : 5000,
        day: (this.state.scholar || {}).day || 0,
      };
      c.terms = opts.asSubordinate
        ? `They'll take Haven — but the tribute is ${c.tributeKcalPerWeek.toLocaleString()} kcal/week, not ${offered.toLocaleString()}. Take it or leave it.`
        : `They won't bow to Haven. But they'll TAKE Haven — ${c.tributeKcalPerWeek.toLocaleString()} kcal/week, them primary. That's the offer.`;
      this.state.pendingCounter = c;
      this.say(`⛓️ ${nm} doesn't say no. They say: "${c.terms}" The table is set — accept their terms, sweeten the offer, or walk away.`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'counter:' + targetId); } catch (e) {}
      return 'counter';
    },

    // answerCounter: resolve the pending counter-offer. 'accept' forms the
    // link on their terms; 'sweeten' spends real food for a re-judgment at
    // your terms (the gift is kept either way — that's what sweeteners
    // risk); 'walk' leaves the table, and opinion remembers.
    answerCounter(how) {
      var c = this.state.pendingCounter;
      if (!c) return null;
      var ov = this._otherVillage(c.targetId);
      var nm = (ov && ov.name) || 'them';
      if (how === 'accept') {
        this.state.pendingCounter = null;
        return this._formLink(c.targetId, { asSubordinate: c.asSubordinate, tributeKcalPerWeek: c.tributeKcalPerWeek }, null);
      }
      if (how === 'sweeten') {
        var paid = this._removePantryKcal(1500);
        if (paid < 1500) {
          this.say(`The pantry can't cover the sweetener — only ${paid.toLocaleString()} kcal to hand. They watch you count. The offer stands; the table waits.`);
          return 'counter';
        }
        var j2 = this.judgeLink(c.targetId, c.opts);
        if (j2.score + 12 >= 45) {
          this.state.pendingCounter = null;
          this.say(`The gift talks. ${nm} reconsiders — at YOUR terms.`);
          return this._formLink(c.targetId, c.opts, j2);
        }
        this._nudgeOpinion(c.targetId, -5);
        this.state.pendingCounter = null;
        this.say(`They take the food — all 1,500 kcal of it — and turn you away anyway. "${j2.reasons.join(' ')}" The gift is gone. That's what sweeteners risk.`);
        return null;
      }
      // walk away
      this.state.pendingCounter = null;
      this._nudgeOpinion(c.targetId, -3);
      this.say(`You walk away from ${nm}'s table. They'll remember you came — and what you wouldn't pay.`);
      return null;
    },

    // _formLink: the single place links are born. Designates their speaker
    // (a named person from the sim's roster — deaths detonate hierarchies),
    // and stages the REGIONAL DAWN on Haven's first-ever link: the moment the
    // village becomes regional is played, never a threshold flip.
    _formLink(targetId, opts, j) {
      opts = opts || {};
      var ov = this._otherVillage(targetId);
      var nm = (ov && ov.name) || 'them';
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
        theirSpeaker: null,
      };
      this.hierarchyState().push(link);
      this._designateSpeaker(link);
      // DEBTS SURVIVE THE BREAK (break-it regional 2026-10-10, third pass):
      // the old code wiped arrears on re-link — rack up debt, break, re-form,
      // clean slate. The graph remembers: a new link with the same pair
      // inherits the latest broken link's outstanding arrears, and says so
      // aloud. Pair-matched either direction; clean breaks re-link clean.
      try {
        var _priorDebt = 0, _latest = null;
        var _all = this.hierarchyState();
        for (var _bi = 0; _bi < _all.length; _bi++) {
          var _bl = _all[_bi];
          if (_bl === link || _bl.status !== 'broken' || !(_bl.arrears || 0)) continue;
          var _same = (_bl.primary === link.primary && _bl.subordinate === link.subordinate) ||
                      (_bl.primary === link.subordinate && _bl.subordinate === link.primary);
          if (_same && (!_latest || (_bl.day || 0) > (_latest.day || 0))) _latest = _bl;
        }
        if (_latest) _priorDebt = _latest.arrears || 0;
        if (_priorDebt > 0) {
          link.arrears = _priorDebt;
          this.say(`Old debts don't die with the old table — ${nm} remembers the ${_priorDebt.toLocaleString()} kcal owed. It rides with the new link.`);
          this._linkNote(link, 'formed', 'Inherited arrears ' + _priorDebt.toLocaleString() + ' kcal from the broken link.');
        }
      } catch (e) {}
      this._linkNote(link, 'formed',
        opts.asSubordinate ? 'Haven joined ' + nm + ' as subordinate.' : nm + ' joined Haven as subordinate.');
      var rep = (j && j.rep) ? j.rep : null;
      try { if (!rep) rep = this.representative(); } catch (e) {}
      var rn = 'Someone';
      try { rn = rep ? String(this.displayName(rep.id)).split(' ')[0] : 'Someone'; } catch (e) {}
      this.say(`⛓️ ${rn} brings it home: ${opts.asSubordinate ? 'Haven bows to ' + nm + ' — one organization, them primary.' : nm + ' bows to Haven — one organization, us primary.'} Tribute: ${link.tributeKcalPerWeek.toLocaleString()} kcal/week. The relationship starts at trust 30. Everything from here is earned.`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'linked:' + targetId + ':' + (opts.asSubordinate ? 'sub' : 'prim')); } catch (e) {}
      // accordUnanswered: a first link that broke before its gesture restages
      // the moment on the next link (break-it regional 2026-10-10).
      if (!this.state.networkLive || this.state.accordUnanswered) this.stageFirstAccord(link);
      return link;
    },

    // ---------- THE REGIONAL DAWN ----------

    // stageFirstAccord: THE MOMENT the village becomes regional. Not a stat
    // threshold — a played beat. The System overlay visibly grows into
    // coordination (networkLive), the village feels it, and the player
    // decides Haven's FIRST GESTURE toward the other fire: a real gift of
    // food, the representative's three days, or cold ink. They watch what
    // you do first.
    stageFirstAccord(link) {
      if (!link) return null;
      if (this.state.networkLive && !this.state.accordUnanswered) return null;
      this.state.networkLive = true;
      this.state.accordUnanswered = false;
      var other = link.subordinate === HOME ? link.primary : link.subordinate;
      this.state.pendingAccord = { linkId: link.id, day: (this.state.scholar || {}).day || 0 };
      var rep = null;
      try { rep = this.representative(); } catch (e) {}
      var rn = 'Someone';
      try { rn = rep ? String(this.displayName(rep.id)).split(' ')[0] : 'Someone'; } catch (e) {}
      this.say(`◈ SYSTEM: "One fire was a village. Two fires is a NETWORK. Coordination layer: online — tribute, demands, the long climb, all tracked now. Try not to starve twice as fast."`);
      this.say(`The village feels it before they understand it: Haven isn't just Haven anymore. ${rn} speaks at ${this._ovName(other)}'s table now — earned, not appointed. And the other fire is watching what Haven does FIRST.`);
      try { if (this.journalNote) this.journalNote('village', 'accord', 'First link formed with ' + this._ovName(other) + '. Haven is regional now — the System tracks the network.'); } catch (e) {}
      return true;
    },

    // answerAccord: Haven's first gesture. Real costs, real consequences —
    // the other village's first impression of the network, priced honestly.
    answerAccord(how) {
      var pa = this.state.pendingAccord;
      if (!pa) return null;
      var link = null;
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) if (links[i].id === pa.linkId) { link = links[i]; break; }
      var other = link ? (link.subordinate === HOME ? link.primary : link.subordinate) : null;
      var onm = other ? this._ovName(other) : 'them';
      if (!link || link.status !== 'active') {
        // THE MOMENT SURVIVES (break-it regional 2026-10-10, third pass):
        // the old code cleared the accord silently when the first link broke
        // before the gesture — the Regional Dawn moment was lost forever and
        // nothing said so. The gesture dies unmade, aloud, and the next link
        // restages it (see accordUnanswered in _formLink/stageFirstAccord).
        this.state.pendingAccord = null;
        this.state.accordUnanswered = true;
        this.say(`The first gesture dies unmade — the link with ${onm} is gone before Haven ever came to their fire. They'll remember the silence longer than any gift. The next fire gets the gesture instead.`);
        return null;
      }
      this.state.pendingAccord = null;
      if (how === 'gift') {
        var paid = this._removePantryKcal(2000);
        var gain = paid >= 2000 ? 10 : Math.max(2, Math.round(10 * paid / 2000));
        link.trust = Math.min(100, link.trust + gain);
        this._nudgeOpinion(other, paid >= 2000 ? 5 : 2);
        this._linkNote(link, 'accord', 'First gesture: gift of ' + paid.toLocaleString() + ' kcal.');
        try { this.seedGossip('accord_' + link.id, { generous: 5 }, (this.npcIds ? this.npcIds().slice(0, 4) : [])); } catch (e) {}
        if (paid <= 0) {
          this.say(`🎁 Haven would send a gift — the pantry is bare. An empty-handed promise. They note the empty hands, and the hoping. (Trust +${gain}.)`);
        } else if (paid >= 2000) {
          this.say(`🎁 Haven's first gesture: 2,000 kcal walks to ${onm}'s fire — a gift, no strings. They count it, and they remember who sent it. (Trust +${gain}.)`);
        } else {
          this.say(`🎁 Haven sends ${paid.toLocaleString()} kcal — all it can spare. Not the feast they hoped for, but an honest one. They count it anyway. (Trust +${gain}.)`);
        }
        return true;
      }
      if (how === 'visit') {
        var rep = null;
        try { rep = this.representative(); } catch (e) {}
        var rnm = 'Someone';
        try { rnm = rep ? String(this.displayName(rep.id)).split(' ')[0] : 'Someone'; } catch (e) {}
        if (rep && rep.id !== this.villagerId) {
          var m = this.mshipState();
          var day0 = (this.state.scholar || {}).day || 0;
          if (m.loaned && day0 < (m.loaned.untilDay || 0)) {
            // LOANS DON'T CLOBBER (break-it regional 2026-10-09): the gesture
            // becomes a message instead of erasing an in-flight loan.
            link.trust = Math.min(100, link.trust + 4);
            this._linkNote(link, 'accord', 'First gesture: word sent — the speaker was already abroad.');
            this.say(`🚶 ${rnm} is already abroad at another fire — Haven's first gesture is a runner with word instead of a seat at the table. It lands softer. (Trust +4.)`);
          } else {
            m.loaned = { vid: rep.id, untilDay: day0 + 3, to: other };
            link.trust = Math.min(100, link.trust + 8);
            this._linkNote(link, 'accord', 'First gesture: ' + rnm + ' sits at their fire.');
            this.say(`🚶 ${rnm} walks out to sit at ${onm}'s fire for three days — Haven's face, their time. Still ours; membership needs no presence. (Trust +8.)`);
          }
        } else {
          link.trust = Math.min(100, link.trust + 8);
          this._linkNote(link, 'accord', 'First gesture: the player sits at their fire.');
          this.say(`🚶 You go yourself — days of your life at a stranger's fire. That's the price of being the face Haven earned. (Trust +8.)`);
        }
        return true;
      }
      // cold: send nothing. The ink dries on its own.
      this._nudgeOpinion(other, -3);
      this._linkNote(link, 'accord', 'First gesture: nothing. Cold ink.');
      this.say(`Haven sends nothing. The ink dries on its own. ${onm} notes the coldness — first gestures are remembered longest.`);
      return true;
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
      var week = this._week();
      // IDEMPOTENT (break-it regional 2026-10-10): the old code granted +3
      // trust on EVERY call once the week's accumulated total reached the
      // owed amount — pay once in full, then click again with a bare
      // pantry, and farm +3 trust per click for zero food. Tribute is
      // current or it isn't; the bonus fires once, when the week becomes
      // current. The UI hides the button when paid, but the engine holds
      // the line too.
      if (link.tributePaidWeek === week) {
        this.say('Tribute is already current this week — the pantry keeps its food.');
        return 0;
      }
      var owed = link.tributeKcalPerWeek;
      var paid = this._removePantryKcal(kcal == null ? owed : kcal);
      // PARTIALS DON'T DOUBLE-COUNT (break-it regional 2026-10-09): the
      // week's payments accumulate in tributePaidKcal; linkTick charges the
      // true shortfall ONCE. The old code added (owed - paid) here AND the
      // full owed in linkTick — paying half was worse than paying nothing.
      if (link.tributeWeek !== week) { link.tributeWeek = week; link.tributePaidKcal = 0; }
      link.tributePaidKcal = (link.tributePaidKcal || 0) + paid;
      if (link.tributePaidKcal >= owed) {
        link.tributePaidWeek = week; link.arrears = 0;
        link.trust = Math.min(100, link.trust + 3);
        this._linkNote(link, 'tribute', 'Paid ' + link.tributePaidKcal.toLocaleString() + ' kcal. Current.');
        this.say(`Tribute paid: ${link.tributePaidKcal.toLocaleString()} kcal walks out of the pantry toward ${this._ovName(link.primary)}. The relationship holds.`);
      } else {
        this._linkNote(link, 'tribute', 'Short: ' + link.tributePaidKcal.toLocaleString() + '/' + owed.toLocaleString() + ' kcal this week. Arrears settle at the week\'s end.');
        this.say(`Tribute short — ${link.tributePaidKcal.toLocaleString()} of ${owed.toLocaleString()} kcal so far this week. They'll count it. Arrears grow teeth.`);
      }
      return paid;
    },

    _ovName(id) {
      if (id === HOME) return 'Haven';
      var ov = this._otherVillage(id);
      return (ov && ov.name) || 'them';
    },

    // _designateSpeaker: their speaker is a NAMED PERSON from the catch-up
    // sim's roster — not a title. When the sim's hunger takes them, the
    // mirror succession beat (theirLeaderDied) fires for real. Backfills
    // links formed before this existed.
    _designateSpeaker(link) {
      try {
        var other = link.subordinate === HOME ? link.primary : link.subordinate;
        if (!other || other === HOME) return;
        var ov = this._otherVillage(other);
        var roster = (ov && ov.roster) || [];
        for (var i = 0; i < roster.length; i++) {
          if (roster[i] && roster[i].alive) {
            link.theirSpeaker = { id: roster[i].id, name: roster[i].name };
            return;
          }
        }
      } catch (e) {}
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
                // THE TRUE SHORTFALL, CHARGED ONCE (break-it regional
                // 2026-10-09; boundary fix 2026-10-10): the tick runs at the
                // week's boundary (endDay), AFTER the week's last day — so it
                // settles the week that just ENDED (week-1), crediting the
                // payments tagged with that week. The old code settled the
                // CURRENT week, which only credited payments made on the
                // single boundary day: every other payment — full or
                // partial — was silently voided (food left the pantry AND
                // full arrears were charged), the "partials are better than
                // nothing" rule was false in the engine, and
                // kingdomEndingEligible (arrears===0) was unreachable.
                // Links formed mid-week get grace for the partial week: no
                // full week's tribute for days the link didn't exist.
                var settledWeek = week - 1;
                var settled = (link.tributePaidWeek || -1) >= settledWeek;
                var existedAllWeek = (link.day || 0) <= settledWeek * 7;
                var paidK = (!settled && existedAllWeek && link.tributeWeek === settledWeek) ? (link.tributePaidKcal || 0) : 0;
                var short = (settled || !existedAllWeek) ? 0 : Math.max(0, link.tributeKcalPerWeek - paidK);
                if (short > 0) {
                  link.arrears += short;
                  link.trust = Math.max(0, link.trust - 6);
                  self._linkNote(link, 'arrears', 'Tribute short ' + paidK.toLocaleString() + '/' + link.tributeKcalPerWeek.toLocaleString() + ' kcal. Arrears ' + link.arrears.toLocaleString() + ' kcal.');
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
                  // THE PANTRY GROWS (break-it regional 2026-10-10, third
                  // pass): the old code said "the pantry grows" but added
                  // nothing — a copy/engine lie. Tribute is real food (the
                  // metabolism system makes it REAL): it arrives as grain,
                  // spoil-dated, like any other haul.
                  try {
                    var _v = self.state.village || {}; _v.pantry = _v.pantry || [];
                    var _day = (self.state.scholar || {}).day || 0;
                    _v.pantry.push({ name: 'Tribute grain from ' + self._ovName(link.subordinate), kcalEach: link.tributeKcalPerWeek, units: 1, spoilDay: _day + 21 });
                  } catch (e) {}
                  self._linkNote(link, 'tribute', self._ovName(link.subordinate) + ' paid. The pantry grows.');
                  if (R() < 0.35) self.say(`🌾 Tribute from ${self._ovName(link.subordinate)} arrives — ${link.tributeKcalPerWeek.toLocaleString()} kcal of grain into the pantry. Their fields, our fire.`);
                } else {
                  link.arrears += link.tributeKcalPerWeek;
                  link.trust = Math.max(0, link.trust - 4);
                  if (R() < 0.35) self.say(`⚠️ ${self._ovName(link.subordinate)} is late with tribute. The air changes.`);
                }
              }
              // THEIR SPEAKER LIVES OR DIES IN THE SIM (regional audit
              // 2026-10-09): the catch-up sim kills named people. If the
              // designated speaker is dead, the mirror succession beat fires
              // — this is what theirLeaderDied was built for, and nothing
              // ever called it. Backfills older links, then watches.
              try {
                var _other = link.subordinate === HOME ? link.primary : link.subordinate;
                if (_other && _other !== HOME) {
                  if (!link.theirSpeaker) {
                    self._designateSpeaker(link);
                  } else {
                    var _ov = self._otherVillage(_other);
                    var _ros = (_ov && _ov.roster) || [];
                    var _sp = null;
                    for (var _si = 0; _si < _ros.length; _si++) {
                      if (_ros[_si] && _ros[_si].id === link.theirSpeaker.id) { _sp = _ros[_si]; break; }
                    }
                    if (_sp && !_sp.alive) {
                      link.theirSpeaker = null;
                      self.theirLeaderDied(link.id);
                      if (link.status === 'active') self._designateSpeaker(link);
                    }
                  }
                }
              } catch (_e2) {}
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
      if (link.status !== 'active') {
        // THE TABLE IS GONE (break-it regional 2026-10-10): a demand
        // outliving its link used to be honor-able — tribute food left the
        // pantry for a broken bond. Dead links hold no obligations.
        link.pendingDemand = null;
        this.say('That bond is broken — there is no one left at the other end of the table. The demand dies with it.');
        return null;
      }
      var d = link.pendingDemand;
      link.pendingDemand = null;
      var tGain = 8;
      if (accept) {
        if (d.kind === 'tribute') {
          // HONOR IS PROPORTIONAL (break-it regional 2026-10-09): the old
          // code granted the full +8 trust even when the pantry was empty
          // and 0 kcal moved — free trust, and "It hurts" said over an
          // empty-handed gesture. Now the trust follows the food.
          var want = d.costKcal || 0;
          var paid = this._removePantryKcal(want);
          var frac = want > 0 ? Math.min(1, paid / want) : 1;
          tGain = Math.round(8 * frac);
          if (frac >= 1) {
            this.say(`You send ${paid.toLocaleString()} kcal. It hurts. That's rather the point of tribute.`);
          } else {
            link.arrears = (link.arrears || 0) + Math.round(want - paid);
            this.say(`You send ${paid.toLocaleString()} of ${want.toLocaleString()} kcal — all the pantry holds. They count the gap; the arrears grow teeth.`);
            try { if (this._nudgeOpinion) this._nudgeOpinion(link.primary, -2); } catch (e) {}
          }
        } else if (d.kind === 'aid') {
          var rep = this.representative();
          var m = this.mshipState();
          var day0 = (this.state.scholar || {}).day || 0;
          if (rep) {
            if (m.loaned && day0 < (m.loaned.untilDay || 0)) {
              // LOANS DON'T CLOBBER (break-it regional 2026-10-09): the old
              // code overwrote m.loaned silently — a representative already
              // abroad had their record erased. Extend or send word instead.
              var ln = 'Someone';
              try { ln = String(this.displayName(m.loaned.vid)).split(' ')[0]; } catch (e) {}
              if (m.loaned.to === link.primary) {
                m.loaned.untilDay = (m.loaned.untilDay || day0) + 3;
                tGain = 4;
                this.say(`${ln} is already at ${this._ovName(link.primary)}'s fire — you send word they stay on three more days. It counts, barely.`);
              } else {
                tGain = 3;
                this.say(`${ln} is already serving at ${this._ovName(m.loaned.to)}'s fire — you can't send them twice. You send word and promises instead. They note the difference.`);
              }
            } else {
              m.loaned = { vid: rep.id, untilDay: day0 + 3, to: link.primary };
              var rn = 'Someone';
              try { rn = String(this.displayName(rep.id)).split(' ')[0]; } catch (e) {}
              this.say(`${rn} walks out to serve ${this._ovName(link.primary)} for three days. Still ours — membership needs no presence.`);
            }
          } else {
            // nobody to send — honoring anyway used to grant the full +8.
            tGain = 3;
            this.say(`There's no one to send — Haven's bench is empty. You send word and promises instead. They note the difference.`);
          }
        } else {
          this.say('You give them your honest read. Counsel is cheap; honesty isn\'t.');
        }
        link.trust = Math.min(100, link.trust + tGain);
        this._linkNote(link, 'demand', 'Honored the call (' + d.kind + ', trust +' + tGain + ').');
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
      link.pendingDemand = null; // demands die with the link (break-it 2026-10-10)
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
      // THE TABLE IS A WEEKLY VERB (break-it regional 2026-10-09): the old
      // code let a player grind renegotiate/bid round after round in one
      // sitting — tribute to the 500 floor in an afternoon, trust bought
      // back with deeds. The climb is paced in weeks, like the tribute.
      var wk = this._week();
      if (link.lastTableWeek === wk) {
        this.say('They\'re still chewing on the last round — the table is a weekly verb. Give it a week.');
        return false;
      }
      link.lastTableWeek = wk;
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
      // THE TABLE IS A WEEKLY VERB (break-it regional 2026-10-09) — shared
      // with renegotiateLink: one hard conversation per week.
      var bwk = this._week();
      if (link.lastTableWeek === bwk) {
        this.say('They\'re still chewing on the last round — the table is a weekly verb. Give it a week.');
        return null;
      }
      link.lastTableWeek = bwk;
      if (link.trust >= 60) {
        // THE TABLE TURNS
        var old = link.primary;
        var oldArrears = link.arrears || 0;
        link.primary = HOME; link.subordinate = old;
        link.trust = Math.max(0, link.trust - 10);
        // THE BOOKS BURN (break-it regional 2026-10-10, third pass): the flip
        // used to zero old arrears silently — refuse tribute for weeks, then
        // turn the table and the debt vanishes. That's a designed reset
        // (the new primary writes the books), but it has to be SAID: silent
        // forgiveness is an exploit-shaped honesty hole.
        link.arrears = 0; link.tributePaidWeek = -1;
        this._linkNote(link, 'flipped', 'Primacy flipped: Haven is primary.' + (oldArrears > 0 ? ' Old arrears ' + oldArrears.toLocaleString() + ' kcal burned with the old table.' : ''));
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'primacy:' + old); } catch (e) {}
        this.say(`👑 The table turns: ${this._ovName(old)} bows to HAVEN now. Earned — every deed, every tribute, every honored call. Nobody likes it. Everybody respects it.` + (oldArrears > 0 ? ` The old books burn — the ${oldArrears.toLocaleString()} kcal Haven owed dies with the old table. Nobody mentions it. Everybody knows.` : ''));
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

    // deliverVillageRumors: the traveler's word, actually delivered. The
    // rumor queue (scholar.rumors, type 'village') was write-only —
    // maybeVillageRumor queued "a village to the north called X" and nobody
    // ever spoke it, so "heard of them" could never become true. One per
    // day, at the day boundary, with a journal line.
    deliverVillageRumors() {
      try {
        var s = this.state.scholar || {};
        var rumors = s.rumors || [];
        for (var i = 0; i < rumors.length; i++) {
          var r = rumors[i];
          if (r && r.type === 'village' && !r.delivered) {
            r.delivered = true;
            this.say(`🧳 ${r.text} The region is bigger than your fire.`);
            try { if (this.journalNote) this.journalNote('village', 'rumor', r.text); } catch (e) {}
            return true;
          }
        }
      } catch (e) {}
      return false;
    },

    hierarchyDaily() {
      try { this.linkTick(); } catch (e) {}
      try { this.deliverVillageRumors(); } catch (e) {}
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

  // COURTSHIP (drifter loop 2026-10-08; retargeted regional audit 2026-10-09):
  // joining a village and honoring their knowledge moves their opinion of
  // Haven — once per village, no farming. Joining also surfaces their
  // catch-up history: the sim records named deaths and births in
  // village.news, but nothing ever READ it to the player. Around their fire,
  // they tell you what the years did.
  // RETARGET (2026-10-09): the old wrap sat on G.joinVillage (game.js),
  // which has NO callers — the real join path is joinVillageReal
  // (betrayal.js, via petition). The courtship never fired. Now it does.
  var _joinVillageRealH = G.joinVillageReal;
  if (_joinVillageRealH) {
    G.joinVillageReal = function (villageId) {
      var r = _joinVillageRealH.apply(this, arguments);
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
