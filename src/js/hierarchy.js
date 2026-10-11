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
//   - proposeCovenant(vid)
//   - proposeTrade(vid)
//   - raidVillage(vid)
//   - answerRaid(how)
//   - covenantCrisis(linkId, why)
//   - answerCovenantCrisis(linkId, how)
//   - answerDefenseCall(linkId, how)
//   - answerTradeCall(linkId, how)
//   - drawLeaguePool(kcal)
//   - leaguePool()
//   - refuseTheScale()
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
//   - scaleRank()
//   - polityOf(villageId)
//   - _havenPolity()
//   - _belongPolity()
//   - _covenantPolity()
//   - _tradePolity()
//   - _peerLinks(kind)
//   - _linkOther(link, id)
//   - foreignPolities()
//   - _foreignPolitySim()
//   - _checkNational()
//   - stageNationalBeat(polity)
//   - answerNationalChoice(how)
//   - _checkGlobal()
//   - stageGlobalBeat(v)
//   - answerGlobalChoice(how)
//   - polityNews()
//   - worldFeed()
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
//   - their_fields_pay: a subordinate's tribute is debited from THEIR pantry — a starving fire can't pay 4,000 kcal/week from nothing. Shortfalls are said aloud, cost trust, and accrue arrears (sibling of league_pool_is_real_food's thin-air fix). The System's x1.25 national routing still applies to what actually arrives, and the arrival line names the true amount. (code: hierarchy.js)
//   - the_moment_survives: a pending accord killed by a broken first link is said aloud and restaged on the next link (accordUnanswered) — the Regional Dawn moment is never lost silently. (code: hierarchy.js)
//   - scale_is_a_ladder: scaleRank() returns village/regional/national/global from the nationalLive/globalLive/networkLive flags — global implies national implies regional, never a skip. Read it defensively; it never throws. (code: hierarchy.js)
//   - national_is_a_polity: a polity is one primary with >=3 active subordinates (four fires is a realm; two is a pact). Haven reaches national SIX ways (docs/SCALE.md, Steve 2026-10-10): LEAD (primary of >=3), BELONG (valued subordinate: trust >=60, arrears 0, link >=21 days to a primary whose realm holds >=4 villages), COVENANT (league of >=4 fires with no primary — mutual defense + shared pool, council votes played), TRADE (trade league of >=4 fires — pooled routes, tariff income, no mutual defense), CONQUEST (a led realm where every subordinate was taken by force — raid-to-subjugate, tribute under duress), or REFUSE (a played, permanent refusal of the scale). All are deed-reactive and take seasons — no calendar path. (code: hierarchy.js)
//   - the_court_is_played: national and global transitions stage played beats with real-cost choices (feast/host/cold; swear/serve/walk; champion/feast/decline; the founding council's pact/pool; the charter's sign/bargain; the iron court's yoke/mercy/release). Walking away from the Binding refuses the scale's shape; the court dies aloud if the realm dissolves mid-beat. Every national beat also offers REFUSE — the scale itself can be refused, permanently and aloud. (code: hierarchy.js)
//   - national_is_a_live_state: national/global are live, not titles — when the realm dissolves (no qualifying polity, no pending beat) nationalLive and globalLive clear, the pending global summons dies, and every loss is said aloud. The oath's trust is proportional to the kcal sealed (like the feast-court and accord gift) — a 0-kcal oath buys token trust, never the full +12. (code: hierarchy.js)
//   - peers_have_no_primary: covenant/trade links are peer links (kind, a/b fields) — no primary, no subordinate. Primacy bids, tribute demands, and vassal succession don't apply; crises are covenant-style (concede/hold/release), and any member can trigger one. (code: hierarchy.js)
//   - conquest_is_blood: raidVillage/answerRaid is the force path — casualties via registerDeath, wounds marked, loot as real food, subjugation at trust 15 / opinion -40 / 7,000 kcal duress tribute. Conquered links can sabotage or revolt while trust < 30; mercy converts them to courtship links. Distinct from bidForPrimacy's courtship climb. (code: hierarchy.js)
//   - league_pool_is_real_food: covenant pool contributions leave the pantry weekly; draws move real kcal back; shorts are said aloud and cost trust. Trade tariff income arrives as real food; route upkeep is real food out. (code: hierarchy.js)
//   - trade_has_no_swords: trade-league help requests carry no defense obligation — Haven may refuse aloud (small trust cost, the charter said so) or send help as a priced favor. Covenant defense calls are obligations: sending costs a party, refusing costs trust league-wide. (code: hierarchy.js)
//   - knowledge_never_gates_the_scale: peer proposals, raids, and all four new national beats are never knowledge-gated — force and trade don't ask what you know. (code: hierarchy.js)
//   - foreign_fires_climb_too: known, unlinked villages bind among themselves off-screen (~seasonal); Haven hears through traders — delayed, possibly wrong, never omniscience. (code: hierarchy.js)
//   - the_world_watches: global = national + deed-reactive viewership >= 40, staged as the played pre-table beat "The Watchers". The table itself is the ending, not this. (code: hierarchy.js)
//   - national_routes_tribute: when national, subordinate tribute grain arrives at x1.25 via the System's logistics layer — and the arrival line says the true amount. Copy and engine agree. (code: hierarchy.js)
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
        if (l.status !== 'active') return false;
        if (l.primary === id || l.subordinate === id) return true;
        // peer links (covenant/trade): no primary — matched on a/b.
        if ((l.kind === 'covenant' || l.kind === 'trade') && (l.a === id || l.b === id)) return true;
        return false;
      });
    },

    linkWith(otherId) {
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        if (l.status !== 'active') continue;
        if ((l.primary === HOME && l.subordinate === otherId) ||
            (l.subordinate === HOME && l.primary === otherId)) return l;
        if ((l.kind === 'covenant' || l.kind === 'trade') &&
            ((l.a === HOME && l.b === otherId) || (l.b === HOME && l.a === otherId))) return l;
      }
      return null;
    },

    // _linkOther: the far end of a link, whatever its kind.
    _linkOther(link, id) {
      id = id || HOME;
      if (link.primary === id) return link.subordinate;
      if (link.subordinate === id) return link.primary;
      if (link.a === id) return link.b;
      if (link.b === id) return link.a;
      return null;
    },

    // _peerLinks: Haven's active peer links of a kind ('covenant'|'trade').
    _peerLinks(kind) {
      var out = [];
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        if (l.status === 'active' && l.kind === kind && (l.a === HOME || l.b === HOME)) out.push(l);
      }
      return out;
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
        if (c.kind === 'covenant' || c.kind === 'trade') {
          return this._formPeerLink(c.targetId, {
            kind: c.kind,
            poolKcalPerWeek: c.kind === 'covenant' ? 2500 : undefined,
            tariffRate: c.kind === 'trade' ? 1200 : undefined,
          });
        }
        return this._formLink(c.targetId, { asSubordinate: c.asSubordinate, tributeKcalPerWeek: c.tributeKcalPerWeek }, null);
      }
      if (how === 'sweeten') {
        var paid = this._removePantryKcal(1500);
        if (paid < 1500) {
          this.say(`The pantry can't cover the sweetener — only ${paid.toLocaleString()} kcal to hand. They watch you count. The offer stands; the table waits.`);
          return 'counter';
        }
        var j2 = (c.kind === 'covenant' || c.kind === 'trade') ? this._judgePeer(c.targetId, c.opts) : this.judgeLink(c.targetId, c.opts);
        if (j2.score + 12 >= 45) {
          this.state.pendingCounter = null;
          this.say(`The gift talks. ${nm} reconsiders — at YOUR terms.`);
          if (c.kind === 'covenant' || c.kind === 'trade') return this._formPeerLink(c.targetId, { kind: c.kind });
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
      // LINK DAY (bal-scale 2026-10-10): the System leans in when the village
      // moves — link formation weights the system-quest offer chance.
      try { this.state.lastLinkDay = (this.state.scholar || {}).day || 0; } catch (e) {}
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
      // SWITCHBOARD (parity 2026-10-10): the office arrives with the regional
      // game — stage the appointment beat. The player picks who holds the
      // words (the deliberate choice is who you lose to the relay).
      try {
        if (this.switchboardAvailable && this.switchboardAvailable()) {
          this.state.pendingSwitchboard = { day: (this.state.scholar || {}).day || 0 };
          this.say('📡 The relay needs hands. Every message in and out of Haven — runners\' pleas, traders\' word, all of it — should pass through ONE pair of hands. Name who holds the words. (The choice is up top: every candidate costs something different, and the village will react.)');
        }
      } catch (e) {}
      var other = this._linkOther(link, HOME);
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
      var other = link ? this._linkOther(link, HOME) : null;
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
        var per = it.kcalEach || 0, units = it.units || 0;
        if (per <= 0 || units <= 0) continue;
        // WHOLE UNITS (break-it food r3 2026-10-10): the old fractional take
        // (take/per) minted sub-unit crumbs in the pantry. A crumb eats at
        // full per-unit value downstream — eatOne grants kcalEach per bite
        // regardless of fraction, and takeFromPantry's coercion inflated
        // sub-1 crumbs back to whole units (0.4u x 500 -> 1u x 500): phantom
        // kcal, measured +50% on a tribute shave. Indivisible pieces go
        // whole — over-removal is honest, callers report actuals. Same
        // doctrine as pantryDraw's player ceil ("no fractionating").
        var takeUnits = Math.min(units, Math.ceil(need / per));
        if (takeUnits <= 0) continue;
        it.units = units - takeUnits;
        var take = takeUnits * per;
        removed += take; need -= take;
        if (it.units <= 0) pantry.splice(i, 1);
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
        var other = this._linkOther(link, HOME);
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
              // peer links tick on their own rails (covenant/trade sections).
              if (link.kind === 'covenant') { self.covenantTick(link); return; }
              if (link.kind === 'trade') { self.tradeTick(link); return; }
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
                // CONQUEST IS BLOOD (2026-10-10): tribute under duress is a
                // countdown, not a settlement. While a conquered link sits
                // under trust 30, the tribute can arrive sabotaged — or the
                // yoke gets thrown off entirely. Mercy (the iron court's
                // answer) clears the conquered flag and ends this.
                if (link.conquered && link.trust < 30) {
                  if (R() < 0.05) {
                    self._linkNote(link, 'revolt', 'The yoke is thrown off.');
                    try { if (self._nudgeOpinion) self._nudgeOpinion(link.subordinate, -20); } catch (e) {}
                    self.say(`🔥 ${self._ovName(link.subordinate)} rises — the yoke is thrown off, loudly, in front of everyone. Tribute under duress was never tribute. It was a countdown.`);
                    try { if (self.ledgerAdd) self.ledgerAdd('hierarchy', 'revolt:' + link.subordinate); } catch (e) {}
                    self.breakLink(link.id, 'revolt');
                    return;
                  }
                  if (R() < 0.12) {
                    var _half = Math.round(link.tributeKcalPerWeek / 2);
                    link.arrears += _half;
                    link.trust = Math.max(0, link.trust - 4);
                    self._linkNote(link, 'sabotage', 'Tribute arrived light — grain "lost on the road." Arrears +' + _half.toLocaleString() + ' kcal.');
                    if (R() < 0.5) self.say(`🌾 ${self._ovName(link.subordinate)}'s tribute arrives light — half the grain "lost on the road." Nobody believes it. Sabotage wears a thin mask. (Arrears +${_half.toLocaleString()} kcal.)`);
                    return;
                  }
                }
                if (R() < link.trust / 100) {
                  link.trust = Math.min(100, link.trust + 1);
                  // THE PANTRY GROWS (break-it regional 2026-10-10, third
                  // pass): the old code said "the pantry grows" but added
                  // nothing — a copy/engine lie. Tribute is real food (the
                  // metabolism system makes it REAL): it arrives as grain,
                  // spoil-dated, like any other haul.
                  // NATIONAL ROUTES TRIBUTE (2026-10-10): the governance
                  // layer's logistics route the harvest — x1.25, and the
                  // arrival line says the true amount.
                  // THEIR FIELDS PAY (break-it regional 2026-10-10): the old
                  // code minted the full tribute from nothing — a starving
                  // subordinate paid 4,000+ kcal/week forever while its own
                  // pantry never moved. Same class as the covenant pool's
                  // thin-air pour (fixed the same day): every fire pours
                  // from its own stores. The sub's pantry is debited for
                  // the owed amount; the System's logistics layer still
                  // routes it at x1.25 national (the arrival line names the
                  // true post-route amount). A shortfall is said aloud,
                  // costs trust, and accrues arrears — like the pool's
                  // short pours.
                  try {
                    var _v = self.state.village || {}; _v.pantry = _v.pantry || [];
                    var _day = (self.state.scholar || {}).day || 0;
                    var _mult = 1;
                    try { if (self.state.nationalLive) _mult = 1.25; } catch (e) {}
                    var _want = link.tributeKcalPerWeek;
                    var _sov = self._otherVillage(link.subordinate);
                    var _have = Math.max(0, Math.round((_sov && _sov.pantryKcal) || 0));
                    var _give = Math.min(_want, _have);
                    if (_sov) _sov.pantryKcal = _have - _give;
                    var _amt = Math.round(_give * _mult);
                    if (_amt > 0) {
                      _v.pantry.push({ name: 'Tribute grain from ' + self._ovName(link.subordinate), kcalEach: _amt, units: 1, spoilDay: _day + 21 });
                    }
                    if (_give >= _want) {
                      self._linkNote(link, 'tribute', self._ovName(link.subordinate) + ' paid. The pantry grows.');
                      var _said = (typeof _amt === 'number' && isFinite(_amt)) ? _amt : _want;
                      if (R() < 0.35) self.say(`🌾 Tribute from ${self._ovName(link.subordinate)} arrives — ${_said.toLocaleString()} kcal of grain into the pantry. Their fields, our fire.`);
                    } else {
                      var _short = _want - _give;
                      link.arrears = (link.arrears || 0) + _short;
                      link.trust = Math.max(0, link.trust - 4);
                      self._linkNote(link, 'tribute', self._ovName(link.subordinate) + ' paid thin: ' + _give.toLocaleString() + ' of ' + _want.toLocaleString() + ' kcal. Arrears +' + _short.toLocaleString() + '.');
                      self.say(`🌾 ${self._ovName(link.subordinate)}'s tribute comes up thin — ${_give.toLocaleString()} of ${_want.toLocaleString()} kcal. Their fields are as empty as the wagons look. The shortfall rides as arrears (+${_short.toLocaleString()} kcal), and they feel the shame. (Trust -4.)`);
                    }
                  } catch (e) {}
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
      link.pendingDefense = null; link.pendingTradeCall = null; link.pendingCovenantCrisis = null;
      // THE MOMENT SURVIVES (break-it regional 2026-10-10): a pending first
      // accord died WITH the link's object while state.pendingAccord kept
      // pointing at the corpse — and the accord buttons only render for
      // ACTIVE links, so answerAccord's dead-link branch could never fire
      // from the UI. The Regional Dawn moment was lost silently: the exact
      // failure the restage was built to prevent. Break it aloud HERE
      // instead — the gesture dies unmade, said plainly, and the next link
      // restages it via accordUnanswered.
      if (this.state.pendingAccord && this.state.pendingAccord.linkId === link.id) {
        this.state.pendingAccord = null;
        this.state.accordUnanswered = true;
        this._linkNote(link, 'accord', 'The first gesture died unmade with the link.');
        this.say(`The first gesture dies unmade — the link with ${this._ovName(this._linkOther(link, HOME))} is gone before Haven ever came to their fire. They'll remember the silence longer than any gift. The next fire gets the gesture instead.`);
      }
      var other = this._linkOther(link, HOME);
      var weAreSub = link.subordinate === HOME;
      var isPeer = (link.kind === 'covenant' || link.kind === 'trade');
      var ov = this._otherVillage(other);
      var hit = how === 'gambit' ? 30 : 15;
      if (isPeer && (how === 'released' || how === 'seceded')) hit = 5; // an honored parting, not a betrayal
      if (ov) ov.opinion = Math.max(-100, Math.min(100, (ov.opinion || 0) - hit));
      this._linkNote(link, 'broken', 'Link broken (' + (how || 'severed') + ').');
      try {
        this.seedGossip('broke_' + link.id, { loyal: -6 }, (this.npcIds ? this.npcIds().slice(0, 4) : []));
      } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'broke:' + other + ':' + (how || '')); } catch (e) {}
      if (isPeer) {
        var kindName = link.kind === 'covenant' ? 'covenant' : 'trade league';
        if (how === 'released') {
          this.say(`🤝 Haven lets ${this._ovName(other)} walk out of the ${kindName} with honor — no chains, no hard words. They'll remember the letting-go longer than the league.`);
        } else if (how === 'seceded' || how === 'revolt') {
          this.say(`⛓️‍💥 ${this._ovName(other)} tears out of the ${kindName} — ${how === 'revolt' ? 'the yoke is thrown off, loudly' : 'the league couldn\'t hold them'}. Word travels: the ${kindName} bleeds.`);
        } else {
          this.say(`The ${kindName} with ${this._ovName(other)} is broken (${how || 'severed'}). What was built over weeks comes apart in a sentence.`);
        }
        return true;
      }
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
          try {
            var _dl = links[i];
            // peer leagues shake covenant-style, not vassal-style
            if (_dl.kind === 'covenant' || _dl.kind === 'trade') this.covenantCrisis(_dl.id, 'leader-death');
            else this.successionCrisis(_dl.id);
          } catch (e) {}
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
      // peer leagues shake covenant-style
      if (link.kind === 'covenant' || link.kind === 'trade') return this.covenantCrisis(link.id, 'their-speaker-died');
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

    // ---------- THE SCALE LADDER ----------

    // scaleRank: the single scale API. Other systems (wave gating, the
    // endgame deed gate) read scale through this — defensively, never by
    // reading flags. The ladder builds: global implies national implies
    // regional. Never throws.
    scaleRank() {
      try {
        if (this.state.globalLive) return 'global';
        if (this.state.nationalLive) return 'national';
        if (this.state.networkLive) return 'regional';
      } catch (e) {}
      return 'village';
    },

    // foreignPolities: polities that don't include Haven — entries
    // {primary, subs[], day}. The region has its own agendas: foreign
    // bindings form off-screen (_foreignPolitySim) and Haven hears about
    // them through traders, never omnisciently.
    foreignPolities() {
      this.state.foreignPolities = this.state.foreignPolities || [];
      return this.state.foreignPolities;
    },

    // polityOf: the polity a village belongs to, or null. A polity is one
    // primary with >=3 active subordinates — four fires under one head is a
    // realm; two is a pact. Haven reaches it two ways (docs/SCALE.md):
    //   LEAD — Haven is primary of >=3 active subordinates (the built realm).
    //   BELONG — Haven is a subordinate in good standing (trust >=60, no
    //     arrears, link >=21 days — the valued-subordinate bar) to a primary
    //     whose realm holds >=4 villages.
    // Both are deed-reactive (links formed, trust earned, tribute paid) and
    // take seasons. Note: the BELONG polity is queried as
    // polityOf(primaryId), not polityOf('haven') — use _havenPolity() for
    // Haven's own polity either way.
    polityOf(villageId) {
      var id = villageId || HOME;
      var links = this.hierarchyState();
      var i, l;
      if (id === HOME) {
        var subs = [], subLinks = [];
        for (i = 0; i < links.length; i++) {
          l = links[i];
          if (l.status === 'active' && l.primary === HOME) { subs.push(l.subordinate); subLinks.push(l); }
        }
        if (subs.length >= 3) {
          // CONQUEST (2026-10-10): a led realm where every subordinate was
          // taken by force stages the Iron Court, not the First Court.
          var byConquest = subLinks.length > 0 && subLinks.every(function (x) { return !!x.conquered; });
          return { primary: HOME, villages: ['haven'].concat(subs), size: subs.length + 1, led: true, shape: byConquest ? 'conquest' : 'lead', byConquest: byConquest };
        }
        return null;
      }
      l = this.linkWith(id);
      if (!l || l.status !== 'active' || l.subordinate !== HOME) return null;
      var day = (this.state.scholar || {}).day || 0;
      var good = l.trust >= 60 && (l.arrears || 0) === 0 && (day - (l.day || 0)) >= 21;
      if (!good) return null;
      var fp = null;
      var fps = this.foreignPolities();
      for (i = 0; i < fps.length; i++) if (fps[i].primary === id) { fp = fps[i]; break; }
      var size = 2 + (fp ? fp.subs.length : 0); // primary + Haven + their subs
      if (size < 4) return null;
      return { primary: id, villages: [id, 'haven'].concat(fp ? fp.subs : []), size: size, led: false, shape: 'belong' };
    },

    // _havenPolity: Haven's polity on any road — led first, belonging
    // second, then the peer leagues. Priority order is a documented design
    // call (docs/SCALE.md): the head's realm outranks the oath, which
    // outranks the leagues. Walking away from one shape's beat defers only
    // that shape — the next qualifying shape's beat stages instead.
    _havenPolity() {
      var cands = [this.polityOf(HOME), this._belongPolity(), this._covenantPolity(), this._tradePolity()];
      for (var i = 0; i < cands.length; i++) if (cands[i]) return cands[i];
      return null;
    },

    // _belongPolity: the BELONG road, extracted from _havenPolity so
    // _checkNational can stage shapes by priority.
    _belongPolity() {
      var links = this.hierarchyState();
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        if (l.status === 'active' && l.subordinate === HOME) {
          var bp = this.polityOf(l.primary);
          if (bp) return bp;
        }
      }
      return null;
    },

    // _covenantPolity: the COVENANT road — a league of >=4 fires with no
    // primary. Four fires under no head is a polity; three is a pact.
    // Mutual defense + shared tribute pool; decisions by council vote.
    _covenantPolity() {
      var ls = this._peerLinks('covenant');
      if (ls.length < 3) return null;
      var vs = ['haven'];
      for (var i = 0; i < ls.length; i++) vs.push(ls[i].a === HOME ? ls[i].b : ls[i].a);
      return { primary: null, villages: vs, size: vs.length, led: false, shape: 'covenant', links: ls };
    },

    // _tradePolity: the TRADE road — a league of >=4 fires bound by the
    // charter. Pooled trade routes, tariff income, no mutual defense.
    _tradePolity() {
      var ls = this._peerLinks('trade');
      if (ls.length < 3) return null;
      var vs = ['haven'];
      for (var i = 0; i < ls.length; i++) vs.push(ls[i].a === HOME ? ls[i].b : ls[i].a);
      return { primary: null, villages: vs, size: vs.length, led: false, shape: 'trade', links: ls };
    },

    // _foreignPolitySim: weekly, off-screen. When >=2 known, unlinked
    // villages exist outside any polity, they may bind (or join an existing
    // foreign polity). ~Seasonal cadence — the region's politics move in
    // seasons, and Haven hears late through traders.
    _foreignPolitySim() {
      try {
        var s = this.state;
        if (!s.networkLive) return;
        var wk = this._week();
        if (s._lastForeignPolityWeek === wk) return;
        s._lastForeignPolityWeek = wk;
        var oV = s.otherVillages || [];
        var fps = this.foreignPolities();
        var cands = [];
        for (var i = 0; i < oV.length; i++) {
          var v = oV[i];
          if (!v || v.id === 'haven') continue;
          if (!this.knowsVillage(v)) continue;
          if (this.linkWith(v.id)) continue; // Haven's business is Haven's
          var inFp = false;
          for (var j = 0; j < fps.length; j++) {
            if (fps[j].primary === v.id || fps[j].subs.indexOf(v.id) >= 0) { inFp = true; break; }
          }
          if (!inFp) cands.push(v);
        }
        if (cands.length < 2) return;
        // FOREIGN CADENCE (bal-scale 2026-10-10; was 22%/wk, grow-bias 50%).
        // The BELONG road needs a foreign 4-realm (primary + 3 subs); at the
        // old rate a 4-realm took ~a season+, putting national-by-~80 out of
        // reach on that road. 30%/wk with a 65% grow bias: a pair forms in
        // ~3 weeks, a 4-realm in ~2 months — still seasonal, still slow, but
        // reachable inside the every-wave gate's window. The region climbs
        // without you; it just doesn't outrun you anymore.
        if (R() > 0.30) return;
        var a = pick(cands);
        var anm = this._ovName(a.id);
        if (fps.length && R() < 0.65) {
          var fp = pick(fps);
          if (fp.primary !== a.id && fp.subs.indexOf(a.id) < 0) {
            fp.subs.push(a.id);
            this.say(`🧳 Word comes late, through traders: ${anm} has bound itself to ${this._ovName(fp.primary)}. The region's map is being redrawn — not by Haven.`);
            try { if (this.journalNote) this.journalNote('village', 'polity', anm + ' bound itself to ' + this._ovName(fp.primary) + '.'); } catch (e) {}
            return;
          }
        }
        var rest = cands.filter(function (x) { return x.id !== a.id; });
        var b = pick(rest);
        if (!b) return;
        fps.push({ primary: a.id, subs: [b.id], day: (s.scholar || {}).day || 0 });
        this.say(`🧳 Word comes late, through traders: ${anm} and ${this._ovName(b.id)} have bound together — ${anm} primary. Other fires are climbing, too.`);
        try { if (this.journalNote) this.journalNote('village', 'polity', anm + ' and ' + this._ovName(b.id) + ' bound; ' + anm + ' primary.'); } catch (e) {}
      } catch (e) {}
    },

    // _checkNational: stages the national beat when a polity qualifies with
    // Haven in it. Called daily — the beat lands the morning after the deed
    // that earned it, like rumor delivery at the day boundary. Shapes are
    // checked in _havenPolity priority order; walking away from one shape's
    // beat defers only that shape (the next qualifying shape's beat stages
    // instead — walking is how the player picks their road). A refused
    // scale never re-stages: the offer comes once.
    _checkNational() {
      try {
        var p = this._havenPolity();
        if ((this.state.nationalLive || this.state.globalLive) && !this.state.pendingNational && !p) {
          // THE REALM CAME APART (break-it regional r4 2026-10-10): national
          // was sticky — burn the realm after the court sat and keep
          // wave-5/scaleRank forever, dodging BELONG-road tribute upkeep. A
          // polity is a live relationship, not a title (docs/SCALE.md: "try
          // not to lose it the way you found it" — loss is possible); when
          // the realm dies the rank dies with it — aloud, like the mid-beat
          // death. Global goes with it: the audience came for a world power,
          // and the ladder never skips (global implies national).
          var hadGlobal = !!this.state.globalLive;
          this.state.nationalLive = false;
          this.state.globalLive = false;
          if (this.state.pendingGlobal) {
            this.state.pendingGlobal = null;
            this.say('📡 The world feed goes quiet — the summons dies with the realm that earned it. The galaxy watched a fire that is out.');
          }
          this.say('◈ The realm came apart — no polity answers to Haven now, and Haven is a free fire again. National' + (hadGlobal ? ' and global' : '') + ' no longer describe this village. The climb starts over.');
          try { if (this.journalNote) this.journalNote('village', 'national', 'The realm came apart — Haven is no longer national.'); } catch (e) {}
          try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'national-lost'); } catch (e) {}
          return;
        }
        if (this.state.nationalLive || this.state.pendingNational) return;
        if (this.state.scaleRefused) return;
        var day = (this.state.scholar || {}).day || 0;
        var defer = this.state._natDefer || {};
        var cands = [this.polityOf(HOME), this._belongPolity(), this._covenantPolity(), this._tradePolity()];
        for (var i = 0; i < cands.length; i++) {
          var p2 = cands[i];
          if (p2 && !(defer[p2.shape] > day)) { this.stageNationalBeat(p2); return; }
        }
      } catch (e) {}
    },

    // stageNationalBeat: THE MOMENT Haven becomes national — five shapes
    // (docs/SCALE.md). LEAD — "The First Court" (feast/host/cold). CONQUEST —
    // "The Iron Court" (yoke/mercy/release). BELONG — "The Binding"
    // (swear/serve/walk). COVENANT — "The Founding Council" (pact/pool/walk).
    // TRADE — "The Charter" (sign/bargain/walk). Every shape also offers
    // REFUSE — the scale itself, refused permanently and aloud. Never a
    // silent threshold flip.
    stageNationalBeat(polity) {
      if (!polity || this.state.nationalLive || this.state.pendingNational) return null;
      this.state.pendingNational = {
        led: !!polity.led, primary: polity.primary, shape: polity.shape || (polity.led ? 'lead' : 'belong'),
        villages: polity.villages.slice(),
        day: (this.state.scholar || {}).day || 0,
      };
      var pn = this.state.pendingNational;
      var refuseLine = `Or REFUSE the scale itself — stay a free fire at regional, whatever that costs. The System will not offer twice.`;
      if (pn.shape === 'lead') {
        var names = [];
        for (var i = 0; i < pn.villages.length; i++) {
          if (pn.villages[i] !== 'haven') names.push(this._ovName(pn.villages[i]));
        }
        this.say(`◈ SYSTEM: "Four fires. One head. GOVERNANCE LAYER: online — polity tribute routing, the court calendar, famine reserves. You built a realm. Try not to lose it the way you found it."`);
        this.say(`👑 Speakers from ${names.join(', ')} ride in for the first court — and every one of them is measuring you. FEAST them from a shared granary (5,000 kcal, no strings), HOST the court at Haven's fire (your speaker's time), or write the law in COLD ink (they'll pay more and love you less). ${refuseLine}`);
      } else if (pn.shape === 'conquest') {
        var cnames = [];
        for (var ci = 0; ci < pn.villages.length; ci++) {
          if (pn.villages[ci] !== 'haven') cnames.push(this._ovName(pn.villages[ci]));
        }
        this.say(`◈ SYSTEM: "Four fires. One head. Taken, not given. GOVERNANCE LAYER: online — the war-ledger, the garrison calendar, the tribute routes. You built this with blood. The audience is still applauding."`);
        this.say(`⚔️ The speakers of ${cnames.join(', ')} kneel because they lost — not because they chose. This is the Iron Court, and the realm is listening for what kind of conqueror you are. Hold the YOKE (tribute up, fear is mortar), show MERCY (ease the yoke — tribute down to courtship terms, hatred decays), or RELEASE them all and let the realm dissolve. ${refuseLine}`);
      } else if (pn.shape === 'covenant') {
        var lnames = [];
        for (var li = 0; li < pn.villages.length; li++) {
          if (pn.villages[li] !== 'haven') lnames.push(this._ovName(pn.villages[li]));
        }
        this.say(`◈ SYSTEM: "Four fires. NO head. Interesting. GOVERNANCE LAYER: online — the council calendar, the mutual-defense ledger, the shared granary. A league of equals. The audience has never seen one survive. Prove them wrong."`);
        this.say(`🤝 The founding council: speakers from ${lnames.join(', ')} sit in a circle — no throne, no kneeling. This league needs its first act. Swear the war-PACT (mutual defense — any member's call is answered, or refused aloud), found the shared POOL (2,000 kcal a week from every fire into one granary, drawn in famine), or WALK from this table for now. ${refuseLine}`);
      } else if (pn.shape === 'trade') {
        var tnames = [];
        for (var ti = 0; ti < pn.villages.length; ti++) {
          if (pn.villages[ti] !== 'haven') tnames.push(this._ovName(pn.villages[ti]));
        }
        this.say(`◈ SYSTEM: "Four fires. One ledger. GOVERNANCE LAYER: online — the route registry, the tariff tables, the charter. No swords in this polity. The audience finds that either wise or hilarious."`);
        this.say(`📜 The charter of ${tnames.join(', ')} waits for Haven's seal: pooled trade routes, tariff income every week — and no mutual defense, written plainly so nobody can pretend otherwise. SIGN at the table rate, BARGAIN for a better tariff (they'll answer aloud), or WALK from this table for now. ${refuseLine}`);
      } else {
        var nm = this._ovName(pn.primary);
        this.say(`◈ SYSTEM: "You are not the head of this. That is the point. A realm of ${polity.size} fires — and ${nm} wants Haven's oath. The audience LOVES a binding."`);
        this.say(`📯 ${nm}'s court summons Haven's speaker. SWEAR the oath of the realm (a gift seals it), SERVE at their court (seven days of your speaker's life), or WALK — break the link and stay a free fire. Refusal is a choice, and it is remembered. ${refuseLine}`);
      }
      try { if (this.journalNote) this.journalNote('village', 'national', 'National beat staged: ' + pn.shape + ' (' + pn.villages.length + ' villages).'); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'national-beat:' + pn.shape); } catch (e) {}
      return true;
    },

    // answerNationalChoice: the court's answer. Every option has a real
    // cost — food, time, or love. 'walk' (belong case) refuses the scale:
    // the realm continues without Haven and national stays unachieved.
    answerNationalChoice(how) {
      var pn = this.state.pendingNational;
      if (!pn) return null;
      var links = this.hierarchyState();
      var day = (this.state.scholar || {}).day || 0;
      var rep = null, rnm = 'Someone';
      try { rep = this.representative(); } catch (e) {}
      try { rnm = rep ? String(this.displayName(rep.id)).split(' ')[0] : 'Someone'; } catch (e) {}

      // REFUSE THE SCALE (2026-10-10): every national beat offers 'refuse' —
      // the scale itself, refused permanently and aloud. See refuseTheScale.
      if (how === 'refuse') return this.refuseTheScale();
      // WALK from a league table defers that shape's offer (the next
      // qualifying shape's beat stages instead — walking picks the road).
      if (how === 'walk' && (pn.shape === 'covenant' || pn.shape === 'trade')) {
        this.state.pendingNational = null;
        var defer = this.state._natDefer = this.state._natDefer || {};
        defer[pn.shape] = day + 14;
        this.say(`🚶 Haven walks from the ${pn.shape === 'covenant' ? 'council' : 'charter'} table — for now. The league stands as bilateral bonds; the polity can wait two weeks. Other roads stay open.`);
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'national-deferred:' + pn.shape); } catch (e) {}
        return 'deferred';
      }
      if (pn.shape === 'lead') {
        // Haven is the head. The realm must still hold >=3 subordinates —
        // if it dissolved before the court sat, the beat dies aloud.
        var subs = [];
        for (var i = 0; i < links.length; i++) {
          var l = links[i];
          if (l.status === 'active' && l.primary === HOME) subs.push(l);
        }
        if (subs.length < 3) {
          this.state.pendingNational = null;
          this.say('The court never sits — the realm came apart before the speakers arrived. Three fires make a polity; fewer make gossip.');
          return null;
        }
        this.state.pendingNational = null;
        var onames = [];
        for (var oi = 0; oi < pn.villages.length; oi++) {
          if (pn.villages[oi] !== 'haven') onames.push(this._ovName(pn.villages[oi]));
        }
        var si;
        if (how === 'feast') {
          // HONOR IS PROPORTIONAL: trust follows the food, never free.
          var paid = this._removePantryKcal(5000);
          var gain = paid >= 5000 ? 10 : Math.max(2, Math.round(10 * paid / 5000));
          for (si = 0; si < subs.length; si++) {
            subs[si].trust = Math.min(100, subs[si].trust + gain);
            this._nudgeOpinion(subs[si].subordinate, paid >= 5000 ? 5 : 2);
            this._linkNote(subs[si], 'court', 'First court: shared granary feast (' + paid.toLocaleString() + ' kcal).');
          }
          if (paid >= 5000) {
            this.say(`🍲 The shared granary opens: 5,000 kcal for every fire of the realm, no strings. ${onames.join(', ')} count it — and remember who fed them first. (Trust +${gain} with each.)`);
          } else {
            this.say(`🍲 Haven opens the granary — ${paid.toLocaleString()} kcal, all it holds. An honest feast, not a grand one. They count it anyway. (Trust +${gain} with each.)`);
          }
        } else if (how === 'host') {
          var m = this.mshipState();
          if (rep && rep.id !== this.villagerId && !(m.loaned && day < (m.loaned.untilDay || 0))) {
            m.loaned = { vid: rep.id, untilDay: day + 7, to: 'the first court' };
            for (si = 0; si < subs.length; si++) {
              subs[si].trust = Math.min(100, subs[si].trust + 6);
              this._linkNote(subs[si], 'court', 'First court hosted at Haven\'s fire.');
            }
            this.say(`🏕️ The court sits at Haven's fire for seven days — ${rnm} holds the room, hears every grievance, pours every cup. Still ours; membership needs no presence. (Trust +6 with each.)`);
          } else {
            for (si = 0; si < subs.length; si++) {
              subs[si].trust = Math.min(100, subs[si].trust + 3);
              this._linkNote(subs[si], 'court', 'First court: word sent — no speaker to host it.');
            }
            this.say('There is no speaker to hold the room — the court gets word and promises instead. It lands softer. (Trust +3 with each.)');
          }
        } else {
          // cold: the iron price — tribute standardized up, trust down.
          for (si = 0; si < subs.length; si++) {
            subs[si].tributeKcalPerWeek = Math.round(subs[si].tributeKcalPerWeek * 1.1);
            subs[si].trust = Math.max(0, subs[si].trust - 12);
            this._nudgeOpinion(subs[si].subordinate, -5);
            this._linkNote(subs[si], 'court', 'First court: the law in cold ink. Tribute up 10%.');
          }
          this.say(`⚖️ Haven writes the law in cold ink: tribute up 10%, terms standard, no favorites. ${onames.join(', ')} bow — and do not love you for it. The realm holds. Fear is a kind of mortar. (Trust -12 with each.)`);
        }
      } else if (pn.shape === 'conquest') {
        // The Iron Court. The war-realm must still hold >=3 conquered
        // subordinates — if it dissolved before the court sat, the beat
        // dies aloud.
        var csubs = [];
        for (var cqi = 0; cqi < links.length; cqi++) {
          var cql = links[cqi];
          if (cql.status === 'active' && cql.primary === HOME && cql.conquered) csubs.push(cql);
        }
        if (csubs.length < 3) {
          this.state.pendingNational = null;
          this.say('The Iron Court never sits — the war-realm came apart before the conquerors arrived. Broken yokes make gossip, not polities.');
          return null;
        }
        this.state.pendingNational = null;
        var csubNames = [];
        for (var cni = 0; cni < pn.villages.length; cni++) {
          if (pn.villages[cni] !== 'haven') csubNames.push(this._ovName(pn.villages[cni]));
        }
        var csi;
        if (how === 'yoke') {
          for (csi = 0; csi < csubs.length; csi++) {
            csubs[csi].tributeKcalPerWeek = Math.round(csubs[csi].tributeKcalPerWeek * 1.1);
            csubs[csi].trust = Math.max(0, csubs[csi].trust - 12);
            this._nudgeOpinion(csubs[csi].subordinate, -10);
            this._linkNote(csubs[csi], 'iron-court', 'The yoke holds: tribute up 10%.');
          }
          this.say(`⚔️ The Iron Court's answer: the YOKE. Tribute up 10%, terms standard, garrisons doubled. ${csubNames.join(', ')} kneel lower — and hate you cleaner. The realm holds. Fear is a kind of mortar. (Trust -12 with each.)`);
        } else if (how === 'mercy') {
          for (csi = 0; csi < csubs.length; csi++) {
            csubs[csi].conquered = false;
            csubs[csi].tributeKcalPerWeek = 4000;
            csubs[csi].trust = Math.min(100, csubs[csi].trust + 8);
            this._nudgeOpinion(csubs[csi].subordinate, 10);
            this._linkNote(csubs[csi], 'iron-court', 'Mercy: the yoke eased — courtship terms now.');
          }
          this.say(`🕊️ The Iron Court's answer: MERCY. The yoke comes off — tribute back to courtship terms, 4,000 kcal a week, and the hatred starts to decay. ${csubNames.join(', ')} don't trust it yet. They might, in a season. (Trust +8 with each.)`);
        } else {
          // release: the realm dissolves, loudly
          for (csi = 0; csi < csubs.length; csi++) {
            this.breakLink(csubs[csi].id, 'released');
          }
          this.say(`🕊️ Haven opens the cages. ${csubNames.join(', ')} walk out free — the war-realm dissolves before it ever sat as a court. They'll remember the yoke. They'll remember the release longer.`);
          try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'iron-court-released'); } catch (e) {}
          return 'released';
        }
      } else if (pn.shape === 'belong') {
        // Haven belongs. The court wants the oath.
        var link = this.linkWith(pn.primary);
        if (!link || link.status !== 'active' || link.subordinate !== HOME) {
          this.state.pendingNational = null;
          this.say('The Binding never happens — the link came apart before the oath was sworn. The court moves on without Haven.');
          return null;
        }
        this.state.pendingNational = null;
        var onm = this._ovName(pn.primary);
        if (how === 'walk') {
          this.say(`🚶 Haven walks away from ${onm}'s table — a free fire, whatever that costs. The realm continues without you. The door is not shut forever. It is shut today.`);
          this.breakLink(link.id, 'gambit');
          return 'walked';
        }
        if (how === 'swear') {
          var oath = this._removePantryKcal(3000);
          // HONOR IS PROPORTIONAL (break-it regional r4 2026-10-10): a 0-kcal
          // oath on an empty pantry used to buy the full +12 trust — free
          // honor. The feast-court path and the accord gift already scale;
          // the oath does too. The copy always says the true amount.
          var ogain = oath >= 3000 ? 12 : Math.max(2, Math.round(12 * oath / 3000));
          link.trust = Math.min(100, link.trust + ogain);
          this._nudgeOpinion(pn.primary, oath >= 3000 ? 5 : 2);
          this._linkNote(link, 'binding', 'Swore the oath of the realm (' + oath.toLocaleString() + ' kcal gift).');
          this.say(`🤝 ${rnm} kneels at ${onm}'s court and swears the oath — sealed with ${oath.toLocaleString()} kcal of Haven's harvest. The realm has its fires now, and one of them is yours. (Trust +${ogain}.)`);
        } else {
          var mm = this.mshipState();
          if (rep && rep.id !== this.villagerId && !(mm.loaned && day < (mm.loaned.untilDay || 0))) {
            mm.loaned = { vid: rep.id, untilDay: day + 7, to: pn.primary };
            link.trust = Math.min(100, link.trust + 8);
            this._linkNote(link, 'binding', rnm + ' serves seven days at their court.');
            this.say(`🚶 ${rnm} rides to ${onm}'s court for seven days — Haven's face, their time. Still ours; membership needs no presence. (Trust +8.)`);
          } else {
            link.trust = Math.min(100, link.trust + 4);
            this._linkNote(link, 'binding', 'No speaker to send — word and promises.');
            this.say('There is no speaker to send — the court gets word and promises instead. It lands softer. (Trust +4.)');
          }
        }
      } else if (pn.shape === 'covenant') {
        // The Founding Council. The league must still hold >=3 covenant
        // bonds — if it dissolved before the council sat, the beat dies
        // aloud.
        var covLinks = this._peerLinks('covenant');
        if (covLinks.length < 3) {
          this.state.pendingNational = null;
          this.say('The founding council never sits — the league came apart before the speakers arrived. Three bonds make a league; fewer make gossip.');
          return null;
        }
        this.state.pendingNational = null;
        var vnames = [];
        for (var vni = 0; vni < covLinks.length; vni++) {
          vnames.push(this._ovName(covLinks[vni].a === HOME ? covLinks[vni].b : covLinks[vni].a));
        }
        var vsi;
        // The league carries both pillars after the founding; the choice is
        // which act founds it — the war-pact (trust) or the shared granary
        // (an opening pour into the pool, said aloud).
        for (vsi = 0; vsi < covLinks.length; vsi++) {
          covLinks[vsi].warOath = true;
          covLinks[vsi].poolLive = true;
        }
        if (how === 'pact') {
          for (vsi = 0; vsi < covLinks.length; vsi++) {
            covLinks[vsi].trust = Math.min(100, covLinks[vsi].trust + 8);
            this._linkNote(covLinks[vsi], 'council', 'The war-pact sworn: mutual defense.');
          }
          this.say(`🤝 The war-pact is sworn — no throne, no kneeling, just hands on the table. When any member's treeline burns, the league answers: Haven sends hands (two villagers, three days) or refuses aloud and the whole league hears it. ${vnames.join(', ')} — equals, now, in war as in council. The shared granary opens beside it: 2,000 kcal a week from every fire. (Trust +8 each.)`);
        } else {
          var opened = 0;
          for (vsi = 0; vsi < covLinks.length; vsi++) {
            covLinks[vsi].trust = Math.min(100, covLinks[vsi].trust + 6);
            this._linkNote(covLinks[vsi], 'council', 'The shared pool founded.');
            opened += 2000;
          }
          this.state.leaguePoolKcal = (this.state.leaguePoolKcal || 0) + opened;
          this.say(`🌾 The shared granary is founded: ${vnames.join(', ')} each pour 2,000 kcal into one pool — ${opened.toLocaleString()} kcal under no one's roof and everyone's. Draw on it in famine; every draw is written in the council's book. The war-pact is sworn beside it: any member's call gets answered, or refused aloud. (Trust +6 each.)`);
        }
      } else if (pn.shape === 'trade') {
        // The Charter. The league must still hold >=3 trade bonds.
        var trLinks = this._peerLinks('trade');
        if (trLinks.length < 3) {
          this.state.pendingNational = null;
          this.say('The charter is never sealed — the league came apart before the ink dried. Three routes make a charter; fewer make gossip.');
          return null;
        }
        this.state.pendingNational = null;
        var tnames2 = [];
        for (var tni = 0; tni < trLinks.length; tni++) {
          tnames2.push(this._ovName(trLinks[tni].a === HOME ? trLinks[tni].b : trLinks[tni].a));
        }
        var tsi;
        if (how === 'sign') {
          for (tsi = 0; tsi < trLinks.length; tsi++) {
            trLinks[tsi].chartered = true;
            trLinks[tsi].tariffRate = 1000;
            trLinks[tsi].trust = Math.min(100, trLinks[tsi].trust + 6);
            this._linkNote(trLinks[tsi], 'charter', 'Sealed at the table rate (1,000 kcal/week).');
          }
          this.say(`📜 Haven seals the charter at the table rate: pooled routes, 1,000 kcal a week in tariff per route, 400 out in upkeep. And the clause everyone reads twice: no mutual defense — when a member calls for help, Haven may refuse aloud, and the charter says that's allowed. (Trust +6 each.)`);
        } else {
          // bargain: demand 1,500 — each member answers aloud, by opinion.
          // Played, not rolled: the courtship you did (or didn't) is the
          // negotiation.
          var held = 0;
          for (tsi = 0; tsi < trLinks.length; tsi++) {
            var tl = trLinks[tsi];
            tl.chartered = true;
            var tother = tl.a === HOME ? tl.b : tl.a;
            var top = 0;
            try { var _tov = this._otherVillage(tother); top = (_tov && _tov.opinion) || 0; } catch (e) {}
            if (top >= 10) {
              tl.tariffRate = 1500; tl.trust = Math.max(0, tl.trust - 5); held++;
              this._linkNote(tl, 'charter', 'Bargained up: 1,500 kcal/week tariff.');
            } else {
              tl.tariffRate = 1000; tl.trust = Math.max(0, tl.trust - 3);
              this._linkNote(tl, 'charter', 'Bargain refused aloud: table rate stands.');
            }
          }
          if (held === trLinks.length) {
            this.say(`📜 Haven bargains hard — and ${tnames2.join(', ')} all swallow the 1,500 kcal tariff. They didn't like it. The routes are richer for it. (Trust -5 each.)`);
          } else if (held === 0) {
            this.say(`📜 Haven pushes for 1,500 — and every fire at the table says no, aloud. The charter seals at the table rate anyway; they heard you push. (Trust -3 each.)`);
          } else {
            this.say(`📜 A split table: ${held} of ${trLinks.length} fires accept the 1,500 kcal tariff, the rest hold at 1,000 — said aloud, no hard feelings beyond the honest kind.`);
          }
        }
      } else {
        // unknown shape — defensive: never set nationalLive on a beat we
        // don't understand.
        this.state.pendingNational = null;
        this.say('The court scatters — something about the summons didn\'t parse, and the System hates a malformed ceremony more than a refusal. The offer dies unmade.');
        return null;
      }
      // THE COURT SAT (or the oath was sworn): Haven is national.
      this.state.nationalLive = true;
      this.state.nationalDay = day;
      try { if (this.journalNote) this.journalNote('village', 'national', 'Haven is national — ' + (pn.led ? 'the realm bows to Haven.' : 'Haven swore to ' + this._ovName(pn.primary) + '.')); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'national-live'); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment('Haven became national — ' + (pn.led ? 'the first court sat.' : 'the oath was sworn.')); } catch (e) {}
      return true;
    },

    // _checkGlobal: the pre-table beat. The ladder is a ladder — global only
    // after national. Deed-reactive: viewership climbs on recordMoment (big
    // plays), show stunts, ledger showmanship — seasons of being watched,
    // never a calendar flip. (Threshold 40 is provisional v1 — docs/SCALE.md.)
    _checkGlobal() {
      try {
        if (this.state.globalLive || this.state.pendingGlobal || !this.state.nationalLive) return;
        var v = (typeof this.havenViewership === 'function') ? this.havenViewership() : 0;
        if (v >= 40) this.stageGlobalBeat(v);
      } catch (e) {}
    },

    // stageGlobalBeat: THE MOMENT Haven becomes global — "The Watchers".
    // The audience has picked its favorite fire. This is NOT the table (the
    // ending); it is the summons to be SEEN. Played: send your champion to
    // the broadcast, feast the cameras, or decline on camera — and the
    // galaxy watches you say no.
    stageGlobalBeat(v) {
      if (this.state.globalLive || this.state.pendingGlobal) return null;
      this.state.pendingGlobal = { viewership: Math.round(v || 0), day: (this.state.scholar || {}).day || 0 };
      this.say(`◈ SYSTEM: "Forty. You see the number. THE WORLD IS WATCHING. Broadcast tier: planetary — the audience has picked its favorite fire and it is YOURS. This is not the table. The table comes later. Tonight, the galaxy wants a show."`);
      this.say(`📡 The feed floods in — fan art, messages in languages nobody speaks, a countdown that isn't yours. The audience demands Haven for the world feed: SEND your speaker into the light, FEAST the cameras with a grand showing, or DECLINE and let the galaxy watch you say no.`);
      try { if (this.journalNote) this.journalNote('village', 'global', 'The Watchers: the world feed wants Haven.'); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'global-beat'); } catch (e) {}
      return true;
    },

    // answerGlobalChoice: the galaxy gets its answer. Every option lands
    // Haven at global — the scale is the world's attention, not compliance.
    // Declining costs viewership and is remembered.
    answerGlobalChoice(how) {
      var pg = this.state.pendingGlobal;
      if (!pg) return null;
      this.state.pendingGlobal = null;
      var day = (this.state.scholar || {}).day || 0;
      var rep = null, rnm = 'Someone';
      try { rep = this.representative(); } catch (e) {}
      try { rnm = rep ? String(this.displayName(rep.id)).split(' ')[0] : 'Someone'; } catch (e) {}
      if (how === 'champion') {
        var m = this.mshipState();
        if (rep && rep.id !== this.villagerId && !(m.loaned && day < (m.loaned.untilDay || 0))) {
          m.loaned = { vid: rep.id, untilDay: day + 7, to: 'the world feed' };
          this.say(`📡 ${rnm} walks into the light for seven days — Haven's face on every screen in the sky. The galaxy gets its champion. The village gets the quiet.`);
        } else {
          this.say('There is no speaker to send — the cameras find you anyway. The galaxy gets what the galaxy wants.');
        }
        try { if (this.recordMoment) this.recordMoment('Haven sent its champion to the world feed.'); } catch (e) {}
      } else if (how === 'feast') {
        var paid = this._removePantryKcal(5000);
        this.say(`📡 Haven feasts for the cameras — ${paid.toLocaleString()} kcal of theater, every fire of the realm at the table. The chat eats it up. Somewhere, the table makes a note.`);
        try { if (this.recordMoment) this.recordMoment('Haven feasted the world feed.'); } catch (e) {}
      } else {
        var vv = this.state.village || {};
        var cur = vv.viewership;
        if (cur == null && typeof this.havenViewership === 'function') cur = this.havenViewership();
        vv.viewership = Math.max(0, (cur || 0) - 10);
        this.say('📡 Haven declines the world feed. The countdown runs without you. The galaxy watches you say no — and remembers. (Viewership -10.)');
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'global-declined'); } catch (e) {}
      }
      this.state.globalLive = true;
      this.state.globalDay = day;
      this.say(`◈ SYSTEM: "Species agency: unlocked. You are not at the table yet. But the table has your name now."`);
      try { if (this.journalNote) this.journalNote('village', 'global', 'Haven is global — the world is watching. The table comes later.'); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'global-live'); } catch (e) {}
      return true;
    },

    // ---------- SCALE UNLOCKS ----------

    // polityNews: NATIONAL unlock. Traders carry word between the polity's
    // fires — delayed, possibly wrong, never omniscience. Weekly, one item.
    polityNews() {
      try {
        if (!this.state.nationalLive) return;
        var wk = this._week();
        if (this.state._lastPolityNewsWeek === wk) return;
        this.state._lastPolityNewsWeek = wk;
        var p = this._havenPolity();
        if (!p) return;
        for (var i = 0; i < p.villages.length; i++) {
          var id = p.villages[i];
          if (id === 'haven') continue;
          if (R() > 0.6) continue;
          var ov = this._otherVillage(id);
          var news = (ov && ov.news) || [];
          var item = news.length ? news[Math.floor(R() * news.length)] : null;
          var line = item || ('traders say ' + this._ovName(id) + ' had ' + pick(['a good harvest', 'a hard winter', 'a wedding', 'a feud over grain', 'a new speaker', 'a monster at the treeline']) + ' — or so the traders say');
          this.say(`🧳 Word from ${this._ovName(id)}: ${line}`);
          try { if (this.journalNote) this.journalNote('village', 'polity-news', 'Word from ' + this._ovName(id) + ': ' + line); } catch (e) {}
          return;
        }
      } catch (e) {}
    },

    // worldFeed: GLOBAL unlock. The galaxy's cameras see everything and the
    // chat talks — weekly word from the whole known region.
    worldFeed() {
      try {
        if (!this.state.globalLive) return;
        var wk = this._week();
        if (this.state._lastWorldFeedWeek === wk) return;
        this.state._lastWorldFeedWeek = wk;
        var oV = this.state.otherVillages || [];
        var known = [];
        for (var i = 0; i < oV.length; i++) {
          if (oV[i] && oV[i].id !== 'haven' && this.knowsVillage(oV[i])) known.push(oV[i]);
        }
        if (!known.length) return;
        var v = pick(known);
        var news = v.news || [];
        var item = news.length ? news[Math.floor(R() * news.length)] : null;
        var line = item || pick(['a harvest festival', 'a monster sighting', 'a new speaker rising', 'a feud settled', 'a wedding', 'a strange light in the sky']);
        this.say(`📡 The world feed: ${v.name || this._ovName(v.id)} — ${line}. The chat has opinions.`);
        try { if (this.journalNote) this.journalNote('village', 'world-feed', 'World feed: ' + (v.name || v.id) + ' — ' + line); } catch (e) {}
      } catch (e) {}
    },

    // ---------- PEER POLITIES: COVENANT & TRADE ----------

    // _judgePeer: the courtship for equals. No primary, no tribute upward —
    // the score is about respect and appetite for the table. Base 38 like
    // judgeLink; equals-at-the-table is its own +10. NEVER knowledge-gated
    // (knowledge_never_gates_the_scale): force and trade don't ask what
    // you know.
    _judgePeer(targetId, opts) {
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
      score += 10;
      reasons.push('No one kneels at this table — that is the offer.');
      score += R() * 20 - 10;
      return { score: Math.round(score), reasons: reasons, rep: rep };
    },

    // _proposePeer: shared courtship for covenant ('covenant') and trade
    // ('trade'). Same played bands as proposeLink (>=55 accept, 35-54
    // counter, <35 decline) — the negotiation is the climb.
    _proposePeer(targetId, kind) {
      var ov = this._otherVillage(targetId);
      if (!ov || targetId === HOME) { this.say('No one to bind.'); return null; }
      if (this.linkWith(targetId)) { this.say('There is already a link. One organization, one link — tend it.'); return null; }
      if (this.state.pendingCounter) { this.say('There is already an offer on the table — answer it first.'); return 'counter'; }
      var j = this._judgePeer(targetId, { kind: kind });
      var nm = ov.name || 'them';
      var opinion = ov.opinion || 0;
      var kindName = kind === 'covenant' ? 'covenant' : 'charter';
      if (opinion <= -20) {
        this.say(`${nm} declines the ${kindName}. ${j.reasons.join(' ')} The door isn't shut forever — but it is shut today.`);
        try { this._nudgeOpinion(targetId, -5); } catch (e) {}
        return null;
      }
      if (j.score >= 55) return this._formPeerLink(targetId, { kind: kind });
      if (j.score >= 35) return this._stagePeerCounter(targetId, { kind: kind }, j);
      this.say(`${nm} declines the ${kindName}. ${j.reasons.join(' ')} The door isn't shut — just not today.`);
      try { this._nudgeOpinion(targetId, -5); } catch (e) {}
      return null;
    },

    // proposeCovenant: a league of equals — mutual defense + shared pool,
    // council votes, no primary.
    proposeCovenant(targetId) { return this._proposePeer(targetId, 'covenant'); },

    // proposeTrade: the charter — pooled routes, tariff income, no mutual
    // defense (written plainly).
    proposeTrade(targetId) { return this._proposePeer(targetId, 'trade'); },

    // _stagePeerCounter: the middle band for peer proposals — they name
    // their price (a richer pool share / a higher tariff), played.
    _stagePeerCounter(targetId, opts, j) {
      var ov = this._otherVillage(targetId);
      var nm = (ov && ov.name) || 'them';
      var c = {
        targetId: targetId, opts: opts, kind: opts.kind,
        day: (this.state.scholar || {}).day || 0,
      };
      c.terms = opts.kind === 'covenant'
        ? `They'll swear the covenant — but every fire pours 2,500 kcal a week into the shared pool, not 2,000. Take it or leave it.`
        : `They'll sign the charter — but the tariff is 1,200 kcal a week, not 1,000. Take it or leave it.`;
      this.state.pendingCounter = c;
      this.say(`⛓️ ${nm} doesn't say no. They say: "${c.terms}" The table is set — accept their terms, sweeten the offer, or walk away.`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'peer-counter:' + targetId + ':' + opts.kind); } catch (e) {}
      return 'counter';
    },

    // _formPeerLink: the single place peer links are born. kind 'covenant'
    // (mutual defense + shared pool) or 'trade' (routes + tariff, no
    // defense). No primary/subordinate — peers_have_no_primary.
    _formPeerLink(targetId, opts) {
      opts = opts || {};
      var kind = opts.kind || 'covenant';
      var ov = this._otherVillage(targetId);
      var nm = (ov && ov.name) || 'them';
      var link = {
        id: 'link_' + Date.now().toString(36) + Math.floor(R() * 999),
        kind: kind, a: HOME, b: targetId,
        primary: null, subordinate: null,
        trust: 30,
        history: [], status: 'active',
        day: (this.state.scholar || {}).day || 0,
        theirSpeaker: null,
      };
      if (kind === 'covenant') {
        link.poolKcalPerWeek = opts.poolKcalPerWeek || 2000;
        link.obligations = ['mutual-defense', 'pool'];
      } else {
        link.tariffRate = opts.tariffRate || 1000;
        link.obligations = ['routes'];
      }
      this.hierarchyState().push(link);
      this._designateSpeaker(link);
      // LINK DAY (bal-scale 2026-10-10): peer links count as the village
      // moving too — the System's offer cadence weights on it.
      try { this.state.lastLinkDay = (this.state.scholar || {}).day || 0; } catch (e) {}
      this._linkNote(link, 'formed', kind === 'covenant' ? 'Covenant sworn with ' + nm + ' — equals.' : 'Charter signed with ' + nm + '.');
      var rep = null, rn = 'Someone';
      try { rep = this.representative(); } catch (e) {}
      try { rn = rep ? String(this.displayName(rep.id)).split(' ')[0] : 'Someone'; } catch (e) {}
      if (kind === 'covenant') {
        this.say(`🤝 ${rn} brings it home: a COVENANT with ${nm} — no primary, no kneeling. Mutual defense and a shared pool, decided by council vote. Equals. The relationship starts at trust 30.`);
      } else {
        this.say(`📜 ${rn} brings it home: a CHARTER with ${nm} — pooled trade routes, tariff income, and the clause in plain ink: no mutual defense. The relationship starts at trust 30.`);
      }
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'peer:' + kind + ':' + targetId); } catch (e) {}
      if (!this.state.networkLive || this.state.accordUnanswered) this.stageFirstAccord(link);
      return link;
    },

    // covenantTick: the league's weekly accounting. Haven's pool share
    // leaves the pantry as REAL food (league_pool_is_real_food); the other
    // fires' shares arrive abstractly, said aloud when they land. Defense
    // calls are reactive — a member's treeline burns, or it doesn't.
    covenantTick(link) {
      try {
        var day = (this.state.scholar || {}).day || 0;
        var onm = this._ovName(this._linkOther(link, HOME));
        if (link.poolLive && this.state._leaguePoolWeek !== this._week()) {
          this.state._leaguePoolWeek = this._week();
          var havenShare = (link.concessionUntil || 0) > day ? Math.round((link.poolKcalPerWeek || 2000) / 2) : (link.poolKcalPerWeek || 2000);
          var paid = this._removePantryKcal(havenShare);
          // DRIFTER BREAK-IT 2026-10-10: their 2,000 kcal/week per fire used
          // to appear from thin air — "real food in and out" held only for
          // Haven's share. Every fire pours from its own stores now; a fire
          // that can't cover its share pours what it has, and the league
          // notices the shortfall (trust -2 on that link, said aloud in the
          // council's book).
          var theirs = 0;
          var covs = this._peerLinks('covenant');
          for (var pi = 0; pi < covs.length; pi++) {
            var pOther = this._linkOther(covs[pi], HOME);
            var pOv = pOther ? this._otherVillage(pOther) : null;
            var pGive = 0;
            if (pOv) {
              pGive = Math.min(2000, Math.max(0, Math.round(pOv.pantryKcal || 0)));
              pOv.pantryKcal = Math.max(0, (pOv.pantryKcal || 0) - pGive);
            }
            theirs += pGive;
            if (pGive < 2000) {
              covs[pi].trust = Math.max(0, (covs[pi].trust || 0) - 2);
              this._linkNote(covs[pi], 'pool', (pOv ? (pOv.name || 'They') : 'They') + ' poured short this week (' + pGive.toLocaleString() + ' of 2,000 kcal) — the council counts it.');
            }
          }
          this.state.leaguePoolKcal = (this.state.leaguePoolKcal || 0) + paid + theirs;
          this._linkNote(link, 'pool', 'Pool week: Haven poured ' + paid.toLocaleString() + ' kcal; the league poured ' + theirs.toLocaleString() + '.');
          if (paid < havenShare) {
            var ls = this._peerLinks('covenant');
            for (var i = 0; i < ls.length; i++) ls[i].trust = Math.max(0, ls[i].trust - 4);
            this.say(`🌾 Haven's share of the league pool comes up short — ${paid.toLocaleString()} of ${havenShare.toLocaleString()} kcal. The council counts it. (Trust -4 across the league.)`);
          } else if (R() < 0.4) {
            this.say(`🌾 The league pool grows: ${(paid + theirs).toLocaleString()} kcal this week — Haven's share and the other fires'. The granary under no one's roof fills.`);
          }
          try { if (this.journalNote) this.journalNote('village', 'pool', 'League pool week: +' + (paid + theirs).toLocaleString() + ' kcal.'); } catch (e) {}
        } else if (!link.poolLive) {
          link.trust = Math.min(100, link.trust + 1);
        }
        if (link.warOath && !link.pendingDefense && R() < 0.15) {
          link.pendingDefense = { day: day };
          this._linkNote(link, 'call', onm + ' calls the covenant: their treeline is hot.');
          this.say(`🔥 ${onm}'s treeline is burning — they call the covenant. The war-pact is not a suggestion: send two villagers for three days, or refuse aloud and let the whole league hear it.`);
          try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'defense-call:' + this._linkOther(link, HOME)); } catch (e) {}
        }
        // a strained member challenges the league — any member can trigger
        if (!link.pendingCovenantCrisis && !link.pendingDefense && link.trust < 40 && R() < 0.10) {
          this.covenantCrisis(link.id, 'strain');
        }
      } catch (e) {}
    },

    // tradeTick: the charter's weekly accounting. Tariff income arrives as
    // real food; route upkeep leaves as real food. Help requests arrive
    // separately — and may be refused aloud (trade_has_no_swords).
    tradeTick(link) {
      try {
        var day = (this.state.scholar || {}).day || 0;
        var other = this._linkOther(link, HOME);
        var onm = this._ovName(other);
        if (!link.chartered) { link.trust = Math.min(100, link.trust + 1); return; }
        var rate = link.tariffRate || 1000;
        var v = this.state.village || {}; v.pantry = v.pantry || [];
        v.pantry.push({ name: 'Route tariff — ' + onm, kcalEach: rate, units: 1, spoilDay: day + 21 });
        var upkeep = this._removePantryKcal(400);
        link.trust = Math.min(100, link.trust + 1);
        this._linkNote(link, 'tariff', 'Tariff +' + rate.toLocaleString() + ' kcal; upkeep -' + upkeep.toLocaleString() + ' kcal.');
        if (R() < 0.3) this.say(`📜 The ${onm} route pays: ${rate.toLocaleString()} kcal of tariff into the pantry, ${upkeep.toLocaleString()} out in upkeep. The charter earns its ink.`);
        if (!link.pendingTradeCall && R() < 0.12) {
          link.pendingTradeCall = { day: day };
          this._linkNote(link, 'call', onm + ' asks for help — hands, not tariff.');
          this.say(`📯 ${onm} asks Haven for help — hands, not tariff. The charter has no swords: Haven may refuse aloud (the charter allows it), or send help as a priced favor.`);
          try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'trade-call:' + other); } catch (e) {}
        }
      } catch (e) {}
    },

    // leaguePool: read the shared granary. Draws move real food.
    leaguePool() {
      return Math.max(0, Math.round(this.state.leaguePoolKcal || 0));
    },

    // drawLeaguePool: famine relief — real kcal from the pool to the
    // pantry, written in the council's book. Empty pool says so aloud.
    drawLeaguePool(kcal) {
      var pool = this.leaguePool();
      if (pool <= 0) {
        this.say(`The league granary is empty — nothing to draw. The council's book shows every pour and every draw; this week it shows nothing.`);
        return 0;
      }
      var take = Math.min(pool, Math.max(0, Math.round(kcal || 0)));
      if (take <= 0) return 0;
      this.state.leaguePoolKcal = pool - take;
      var day = (this.state.scholar || {}).day || 0;
      var v = this.state.village || {}; v.pantry = v.pantry || [];
      v.pantry.push({ name: 'League granary draw', kcalEach: take, units: 1, spoilDay: day + 14 });
      this.say(`🌾 Haven draws ${take.toLocaleString()} kcal from the league granary — real food, written in the council's book. ${this.leaguePool().toLocaleString()} kcal remain under no one's roof.`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'pool-draw:' + take); } catch (e) {}
      return take;
    },

    // _musterAway: pick n roster members (never the player) for league
    // service. Returns the ids; empty when the bench is empty.
    _musterAway(n, what) {
      var out = [];
      try {
        var roster = this.state.village.roster || [];
        var me = this.villagerId;
        for (var i = 0; i < roster.length && out.length < n; i++) {
          var id = roster[i];
          if (id === me) continue;
          if (!this.isMember(id)) continue;
          // DRIFTER BREAK-IT 2026-10-10: the away muster used to re-draft
          // villagers already out (raid party, defense call, wounded) —
          // the same two people could be "sent" to three fires at once.
          try { if (this._isAwayVid(id)) continue; } catch (e2) {}
          out.push(id);
        }
      } catch (e) {}
      return out;
    },

    // _sendAwayParty: the multi-person version of the representative loan.
    // vids walk out for `days` days — real absence: awayMembers() shows them,
    // _musterAway won't re-draft them, and awayPartiesReturnTick says the
    // return aloud. kind: 'raid' | 'defense' | 'trade'. `to` is a VILLAGE ID
    // (the return tick resolves it via _ovName — passing a display name
    // renders "at them"). opts.repayKcal is delivered to the pantry on
    // return (the trade favor's "repaid after"), debited from the payer's
    // own stores.
    _sendAwayParty(vids, days, to, kind, opts) {
      var m = null;
      try { m = this.mshipState(); } catch (e) { return; }
      if (!m) return;
      var day = (this.state.scholar || {}).day || 0;
      m.awayParties = m.awayParties || [];
      m.awayParties.push({
        vids: (vids || []).slice(),
        untilDay: day + (days || 3),
        to: to, kind: kind || 'service',
        repayKcal: (opts && opts.repayKcal) || 0,
      });
    },

    // _isAwayVid: is this roster member currently out (loaned, partied, or
    // recovering from raid wounds)? Informational reads only.
    _isAwayVid(vid) {
      try {
        var m = this.mshipState ? this.mshipState() : null;
        if (!m) return false;
        var day = (this.state.scholar || {}).day || 0;
        if (m.loaned && day < (m.loaned.untilDay || 0) && m.loaned.vid === vid) return true;
        var ps = m.awayParties || [];
        for (var i = 0; i < ps.length; i++) {
          if (day < (ps[i].untilDay || 0) && (ps[i].vids || []).indexOf(vid) >= 0) return true;
        }
        var w = m.woundedUntil || {};
        if ((w[vid] || 0) > day) return true;
      } catch (e) {}
      return false;
    },

    // answerDefenseCall: a covenant defense call, answered. 'send' costs a
    // party (two villagers, three days — real absence); 'refuse' is said
    // aloud and costs trust league-wide (trade_has_no_swords does NOT
    // apply here — the war-pact is an obligation).
    answerDefenseCall(linkId, how) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || !link.pendingDefense) return null;
      if (link.status !== 'active' || link.kind !== 'covenant') { link.pendingDefense = null; return null; }
      var other = this._linkOther(link, HOME);
      var onm = this._ovName(other);
      var day = (this.state.scholar || {}).day || 0;
      link.pendingDefense = null;
      if (how === 'send') {
        var sent = this._musterAway(2, 'defense');
        if (!sent.length) {
          link.trust = Math.max(0, link.trust - 4);
          this.say(`There's no one to send — Haven's bench is empty. The covenant notices the empty bench. (Trust -4.)`);
          return 'empty';
        }
        this._sendAwayParty(sent, 3, other, 'defense');
        link.trust = Math.min(100, link.trust + 8);
        this._linkNote(link, 'defense', 'Answered the call: ' + sent.length + ' villagers, 3 days.');
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'defense-sent:' + other); } catch (e) {}
        this.say(`🛡️ Haven answers: ${sent.length} villagers walk out to ${onm}'s treeline for three days. The war-pact holds because it's held. (Trust +8.)`);
        return 'sent';
      }
      var ls = this._peerLinks('covenant');
      for (var i2 = 0; i2 < ls.length; i2++) ls[i2].trust = Math.max(0, ls[i2].trust - 10);
      this._linkNote(link, 'defense', 'REFUSED the call — aloud.');
      try { this.seedGossip('defense_refused_' + link.id, { loyal: -6 }, (this.npcIds ? this.npcIds().slice(0, 4) : [])); } catch (e) {}
      this.say(`🔥 Haven refuses ${onm}'s call — aloud, in council, no excuses dressed up. The war-pact remembers refusals longer than battles. (Trust -10 across the league.)`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'defense-refused:' + other); } catch (e) {}
      return 'refused';
    },

    // answerTradeCall: a trade-league help request. The charter has no
    // swords — 'refuse' is allowed and said aloud (small trust cost);
    // 'send' is a priced favor (1,500 kcal repaid after — real food).
    answerTradeCall(linkId, how) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || !link.pendingTradeCall) return null;
      if (link.status !== 'active' || link.kind !== 'trade') { link.pendingTradeCall = null; return null; }
      var other = this._linkOther(link, HOME);
      var onm = this._ovName(other);
      var day = (this.state.scholar || {}).day || 0;
      link.pendingTradeCall = null;
      if (how === 'send') {
        var sent = this._musterAway(2, 'favor');
        if (!sent.length) {
          link.trust = Math.max(0, link.trust - 2);
          this.say(`There's no one to send — Haven's bench is empty. They note the difference between a refusal and an empty bench. (Trust -2.)`);
          return 'empty';
        }
        // DRIFTER BREAK-IT 2026-10-10: state.tradeAway was write-only ("villagers
        // walk out for three days" never happened), and the 1,500 kcal favor
        // landed in the pantry INSTANTLY while the copy promised "repaid
        // after". The party walks out for real now; the repayment arrives
        // with them, on return, via the away-parties return tick.
        this._sendAwayParty(sent, 3, other, 'trade', { repayKcal: 1500 });
        link.trust = Math.min(100, link.trust + 6);
        this._linkNote(link, 'favor', 'Sent help as a priced favor (+1,500 kcal repaid).');
        this.say(`🤝 Haven sends ${sent.length} villagers to ${onm} — not an obligation, a favor, priced: 1,500 kcal repaid after. The charter has no swords, but Haven has hands. (Trust +6.)`);
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'favor-sent:' + other); } catch (e) {}
        return 'sent';
      }
      link.trust = Math.max(0, link.trust - 4);
      this._linkNote(link, 'favor', 'Refused aloud — the charter allows it.');
      this.say(`📜 Haven refuses ${onm} — aloud, and the charter backs it: no mutual defense, written plainly. They knew the terms when they signed. (Trust -4.)`);
      return 'refused';
    },

    // covenantCrisis: any member can trigger a succession-style crisis —
    // their speaker died, Haven's did, or the strain got loud. Played:
    // CONCEDE (better terms, the league holds), HOLD (the line — they may
    // walk), or RELEASE (let them walk with honor).
    covenantCrisis(linkId, why) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || link.status !== 'active') return null;
      if (link.kind !== 'covenant' && link.kind !== 'trade') return this.successionCrisis(linkId);
      if (link.pendingCovenantCrisis) return 'pending';
      link.pendingCovenantCrisis = { why: why || 'strain', day: (this.state.scholar || {}).day || 0 };
      var other = this._linkOther(link, HOME);
      var onm = this._ovName(other);
      var kindName = link.kind === 'covenant' ? 'covenant' : 'charter';
      link.trust = Math.max(0, link.trust - 10);
      this._linkNote(link, 'crisis', 'Crisis: ' + (why || 'strain') + '.');
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'covenant-crisis:' + other); } catch (e) {}
      if (why === 'their-speaker-died') {
        this.say(`🕯️ ${onm}'s speaker is dead — and the ${kindName} shakes. Their council wants new terms, or out. CONCEDE (better terms, the league holds), HOLD the line (they may walk), or RELEASE them with honor.`);
      } else if (why === 'leader-death') {
        this.say(`🕯️ Haven grieves — and ${onm} tests the ${kindName} in the chaos. Their speaker wants new terms, or out. CONCEDE, HOLD, or RELEASE.`);
      } else {
        this.say(`⚡ ${onm} challenges the ${kindName} — the strain got loud. Their speaker names their price, or the door. CONCEDE (better terms), HOLD the line, or RELEASE them with honor.`);
      }
      return 'crisis';
    },

    // answerCovenantCrisis: resolve the league crisis. Every option is
    // priced: concede buys the league, hold risks it, release honors the
    // leaving.
    answerCovenantCrisis(linkId, how) {
      var links = this.hierarchyState();
      var link = null;
      for (var i = 0; i < links.length; i++) if (links[i].id === linkId) { link = links[i]; break; }
      if (!link || !link.pendingCovenantCrisis) return null;
      if (link.status !== 'active') { link.pendingCovenantCrisis = null; return null; }
      var other = this._linkOther(link, HOME);
      var onm = this._ovName(other);
      var day = (this.state.scholar || {}).day || 0;
      var kindName = link.kind === 'covenant' ? 'covenant' : 'charter';
      link.pendingCovenantCrisis = null;
      if (how === 'concede') {
        if (link.kind === 'covenant') {
          link.concessionUntil = day + 28;
          this.say(`🤝 Haven concedes: ${onm}'s pool share halves for four weeks. The ${kindName} holds — bought, honestly, and everyone knows the price. (Trust +8.)`);
        } else {
          link.tariffRate = Math.max(500, Math.round((link.tariffRate || 1000) * 0.75));
          this.say(`🤝 Haven concedes: the ${onm} route tariff drops to ${link.tariffRate.toLocaleString()} kcal a week. The ${kindName} holds — bought, honestly. (Trust +8.)`);
        }
        link.trust = Math.min(100, link.trust + 8);
        this._linkNote(link, 'crisis', 'Conceded better terms; the league holds.');
        try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'crisis-conceded:' + other); } catch (e) {}
        return 'conceded';
      }
      if (how === 'hold') {
        link.trust = Math.max(0, link.trust - 10);
        this._linkNote(link, 'crisis', 'Held the line.');
        if (link.trust < 20) {
          this.say(`Haven holds the line — and ${onm} walks. The ${kindName} couldn't hold them.`);
          this.breakLink(link.id, 'seceded');
          return 'seceded';
        }
        this.say(`Haven holds the line. ${onm}'s speaker sits back down — slowly. The ${kindName} holds its breath, and holds. (Trust -10.)`);
        return 'held';
      }
      this._linkNote(link, 'crisis', 'Released with honor.');
      this.say(`🤝 Haven opens the door: ${onm} walks out of the ${kindName} with honor — no chains, no hard words. A league that can't be left isn't a league.`);
      this.breakLink(link.id, 'released');
      return 'released';
    },

    // ---------- CONQUEST ----------

    // raidVillage: the conquest road's first step — muster a war party.
    // Played: STRIKE (blood and fire), offer TERMS (yield or bleed), or
    // WITHDRAW. Distinct from bidForPrimacy's courtship: force, not
    // climbing. Never knowledge-gated.
    raidVillage(vid) {
      var ov = this._otherVillage(vid);
      if (!ov || vid === HOME) { this.say('No one to raid.'); return null; }
      if (this.linkWith(vid)) { this.say('Already bound — you don\'t raid your own table.'); return null; }
      if (this.state.pendingRaid) { this.say('A war party is already mustered — answer it first.'); return null; }
      var fighters = this._musterAway(4, 'raid');
      if (fighters.length < 2) {
        this.say('Not enough fighters to raid — Haven needs at least two besides you. The war party never musters.');
        return null;
      }
      var nm = ov.name || 'them';
      this.state.pendingRaid = { target: vid, fighters: fighters, day: (this.state.scholar || {}).day || 0 };
      this.say(`⚔️ The war party musters against ${nm}: ${fighters.length} fighters, three days gone, blood on the table. STRIKE and take them by force — the dead don't negotiate. Offer TERMS — yield or bleed. Or WITHDRAW the party before it marches.`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'raid-mustered:' + vid); } catch (e) {}
      return true;
    },

    // answerRaid: resolve the muster. 'strike' pays blood for a subjugated
    // village (trust 15, opinion -40, 7,000 kcal/week duress tribute);
    // 'terms' lets the strong yield without blood; 'withdraw' costs face.
    answerRaid(how) {
      var pr = this.state.pendingRaid;
      if (!pr) return null;
      var ov = this._otherVillage(pr.target);
      var nm = (ov && ov.name) || 'them';
      var day = (this.state.scholar || {}).day || 0;
      if (how === 'withdraw') {
        this.state.pendingRaid = null;
        try { this._nudgeOpinion(pr.target, -10); } catch (e) {}
        this.say(`The war party stands down. ${nm} heard it muster — they'll remember the almost. (Opinion -10.)`);
        return 'withdrawn';
      }
      if (how === 'terms') {
        var ourS = 0, theirS = 0;
        try { ourS = this.regionalStanding(); theirS = this.villageStandingOf(pr.target); } catch (e) {}
        if (ourS >= theirS * 1.2 && ourS > 0) {
          this.state.pendingRaid = null;
          var ylink = this._formLink(pr.target, { asSubordinate: false, tributeKcalPerWeek: 5000 }, null);
          ylink.conquered = true; ylink.trust = 25;
          try { this._nudgeOpinion(pr.target, -25); } catch (e) {}
          this._linkNote(ylink, 'conquered', 'Yielded to the war party without blood. Tribute 5,000 kcal/week under duress.');
          this.say(`⚔️ ${nm} looks at the war party on their horizon — and chooses the tribute over the pyre. No blood today. The yoke is lighter for it, not light. (Trust 25, opinion -25, tribute 5,000 kcal/week.)`);
          try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'yielded:' + pr.target); } catch (e) {}
          return ylink;
        }
        this.say(`${nm} refuses the terms — laughs at them, even. The table is still set: STRIKE, or WITHDRAW.`);
        return 'refused';
      }
      // strike: blood and fire
      this.state.pendingRaid = null;
      // DRIFTER BREAK-IT 2026-10-10: state.raidParty was write-only — "raiders
      // gone three days" was copy the engine never ran, and state.raidWounds
      // the same ("wounded for a week" never kept anyone home). Both now ride
      // the away-party mechanism: real absence, announced returns.
      this._sendAwayParty(pr.fighters, 3, pr.target, 'raid');
      var dead = [], wounded = [];
      for (var i = 0; i < pr.fighters.length; i++) {
        var r = R();
        if (r < 0.15) dead.push(pr.fighters[i]);
        else if (r < 0.45) wounded.push(pr.fighters[i]);
      }
      try {
        var mm = this.mshipState();
        mm.woundedUntil = mm.woundedUntil || {};
        for (var wi = 0; wi < wounded.length; wi++) mm.woundedUntil[wounded[wi]] = day + 7;
      } catch (e2) {}
      for (var di = 0; di < dead.length; di++) {
        var dnm = 'Someone';
        try { dnm = String(this.displayName(dead[di])); } catch (e) {}
        try { this.registerDeath({ kind: 'person', villagerId: dead[di], name: dnm, cause: 'raid' }); } catch (e) {}
      }
      var slink = this._formLink(pr.target, { asSubordinate: false, tributeKcalPerWeek: 7000 }, null);
      slink.conquered = true; slink.trust = 15;
      try { this._nudgeOpinion(pr.target, -40); } catch (e) {}
      this._linkNote(slink, 'conquered', 'Taken by force. Tribute 7,000 kcal/week under duress.');
      var loot = 3000 + Math.floor(R() * 3000);
      try {
        var v = this.state.village || {}; v.pantry = v.pantry || [];
        v.pantry.push({ name: 'Raid spoils — ' + nm, kcalEach: loot, units: 1, spoilDay: day + 14 });
      } catch (e) {}
      var wnames = [];
      for (var wni = 0; wni < wounded.length; wni++) {
        try { wnames.push(String(this.displayName(wounded[wni])).split(' ')[0]); } catch (e) {}
      }
      var costLine = (dead.length ? dead.length + ' dead' : 'no dead') + (wounded.length ? ', ' + wnames.join(', ') + ' wounded for a week' : ', none wounded');
      this.say(`⚔️ ${nm} burns, and then it kneels. The cost, said plainly: ${costLine}. Spoils: ${loot.toLocaleString()} kcal. The yoke: 7,000 kcal a week, trust 15, hatred at -40. This is what conquest costs. Everybody saw.`);
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'conquered:' + pr.target); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment('Haven took ' + nm + ' by force.'); } catch (e) {}
      return slink;
    },

    // ---------- REFUSE THE SCALE ----------

    // refuseTheScale: the sixth road — a played, permanent refusal of the
    // national scale. Real benefits (every kcal stays in Haven's pantry:
    // no oath, no court, no tithe, no pool shares) and real costs (no
    // x1.25 polity logistics, no league to call when the late waves come,
    // the table stays distant — coalition-or-death stays honest). The
    // offer never returns: _checkNational skips a refused scale.
    refuseTheScale() {
      var pn = this.state.pendingNational;
      this.state.pendingNational = null;
      var day = (this.state.scholar || {}).day || 0;
      this.state.scaleRefused = true;
      this.state.scaleRefusedDay = day;
      this.state.scaleRefusedShape = pn ? pn.shape : 'offered';
      this.say(`◈ SYSTEM: "Noted. The offer is withdrawn — permanently. No court. No oath. No tithe. The audience is... divided. Half of them just subscribed."`);
      this.say(`🚶 Haven refuses the scale. Every kcal stays in Haven's pantry — no one's court, no one's oath, no pool shares, no tariffs. The price, said plainly: no polity logistics (tribute comes in whole, never ×1.25), no league to call when the late waves come, and the table stays distant. Coalition or death — Haven walks it alone.`);
      try { if (this.journalNote) this.journalNote('village', 'national', 'Haven REFUSED the national scale — permanently. A free fire, whatever it costs.'); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('hierarchy', 'scale-refused'); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment('Haven refused the national scale.'); } catch (e) {}
      return 'refused';
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
      try { this._foreignPolitySim(); } catch (e) {}
      try { this._checkNational(); } catch (e) {}
      try { this._checkGlobal(); } catch (e) {}
      try { this.deliverVillageRumors(); } catch (e) {}
      try { this.polityNews(); } catch (e) {}
      try { this.worldFeed(); } catch (e) {}
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
            // peer leagues hear of deeds too — a league respects strength
            else if ((links[i].kind === 'covenant' || links[i].kind === 'trade') &&
                     (links[i].a === 'haven' || links[i].b === 'haven')) {
              var g = Math.min(4, Math.max(1, Math.round((magnitude || 0) / 4)));
              links[i].trust = Math.min(100, links[i].trust + g);
            }
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

  // DRIFTER BREAK-IT 2026-10-10: the national-ladder verbs are Haven-council
  // verbs — mustering Haven's fighters, pledging its food, answering its
  // calls. The exiled have no standing to call them (same class as
  // membership.js's pantry wraps); a scholar eating at another fire can't
  // pledge Haven's table either. The UI hides these buttons for non-members,
  // and the engine holds the line too (a hostile drifter calling
  // Game.raidVillage straight from exile gets refused, not a free war
  // party). NOTE: these wraps live here, not in membership.js — that file
  // loads BEFORE hierarchy.js, so G.proposeCovenant et al don't exist yet
  // when its wraps run (the guard silently no-ops). Same-object wraps must
  // run after the methods they wrap.
  function _blockIfNotHaven(G, fnName) {
    var _fn = G[fnName];
    if (!_fn) return;
    G[fnName] = function () {
      var s = this.state.scholar || {};
      if (s.exiled) { this.say('Haven\'s council doesn\'t take orders from the road. Exile means exile.'); return null; }
      if (s.joinedVillage) { this.say('You eat at another fire now — Haven\'s table isn\'t yours to pledge.'); return null; }
      return _fn.apply(this, arguments);
    };
  }
  _blockIfNotHaven(G, 'proposeCovenant');
  _blockIfNotHaven(G, 'proposeTrade');
  _blockIfNotHaven(G, 'raidVillage');
  _blockIfNotHaven(G, 'answerRaid');
  _blockIfNotHaven(G, 'answerDefenseCall');
  _blockIfNotHaven(G, 'answerTradeCall');
  _blockIfNotHaven(G, 'answerCovenantCrisis');
  _blockIfNotHaven(G, 'drawLeaguePool');

})();
