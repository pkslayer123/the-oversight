// @ontology
// system: villageAgency
// description: Foreign villages as players — inner life (famine, succession, schism), splinter events, petition-to-join beats, rumor-carried internal events.
// provides:
//   - villageAgencyDaily()
//   - ensureFaces(v)
//   - havenPopCap()
//   - havenRoom()
//   - openPetition(pet)
//   - petitionInterview(petitionId, qid)
//   - conductPetitionMoot(petitionId)
//   - answerPetition(petitionId, how)
//   - aidVillage(villageId, kcal)
//   - answerBeg(how)
//   - answerRaidDefense(how)
//   - answerSuccession(how)
//   - stageSuccessionBeat(villageId)
//   - queueVillageEventRumor(villageId, kind, opts)
//   - fireSplinter(villageId, cause)
//   - _vaInner(v)
//   - _vaSimInner(v)
//   - _vaStartSuccession(v)
//   - _vaResolveSuccession(v, backedIdx)
//   - _vaPickSplinterCause(v)
//   - _vaSplinterMembers(v, n)
//   - _vaMakeSplinterVillage(v, remainers, cause, kcal, day)
//   - _vaPetitionScore(vid, pet, ppm, mood)
//   - _vaFinishPetition(pet, playerAccept)
//   - _vaAdmitPetitioners(pet)
//   - _vaTurnAway(pet, why)
//   - _vaPetitionConsequences(pet, accepted)
//   - _vaFamineAct(v)
//   - _vaStageBeg(v)
//   - _vaStageRaidDefense(v)
//   - _vaRumorText(v, kind, wrong, opts)
//   - _vaPantryPerMouth()
// rules:
//   - camera_rule: max 3 named faces per village (speaker, leader, champion); every beat goes through them, everything else via rumors (code: villageAgency.js)
//   - petition_never_silent: intake is always a played beat with a vote; never silent population ticks (code: villageAgency.js)
//   - cap_is_ceiling: havenPopCap() is the haven workstream's hook — reads their growthTier when present, falls back to 12/16/20/24 (code: villageAgency.js)
//   - knowledge_never_gates: a starving stranger doesn't check your codex; no beat here is knowledge-gated (code: villageAgency.js)
//   - reactive_not_calendar: schisms, succession, famine fire from conditions (hunger, tension, leader death), never timers (code: villageAgency.js)
//   - rumors_delayed_wrong: internal events arrive delayed, possibly wrong, never omniscience — only for known villages (code: villageAgency.js)
//   - evil_is_legitimate: a cannibal splinter is content, not a bug; accepting them has real, lasting consequences (code: villageAgency.js)
// consumes:
//   - state.otherVillages[].faces, state.otherVillages[].inner, state.otherVillages[].famine
//   - state.pendingPetition, state.petitionQueue, state.pendingBeg, state.pendingRaidDefense, state.pendingSuccession
//   - state.scholar.rumors (type 'village_event')
// UI CONTRACT (app.js workstream — same pattern as pendingAccord/answerAccord):
//   - state.pendingPetition = {id, petitioners:[{name, age, occupation, temperament, corruption}], cause, originVillage, originName, day, interviews:[], interviewBonus, vote, awaitingPlayerVote}
//     choices: petitionInterview(id,'why'|'bring'|'cause'|'origin') (max 3), conductPetitionMoot(id), answerPetition(id,'accept'|'reject')
//   - state.pendingBeg = {villageId, speaker, amount, day} -> answerBeg('give'|'refuse')
//   - state.pendingRaidDefense = {villageId, champion, raiders:[names], demand, day} -> answerRaidDefense('give'|'hold'|'fight')
//   - state.pendingSuccession = {villageId, claimants:[{name, idx}], day} -> answerSuccession('backA'|'backB'|'extort'|'stayOut')
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var HOME = 'haven';

  var CAUSES = {
    cannibal: 'cannibal',
    'famine-flight': 'famine-flight',
    hardline: 'hardline',
    peaceful: 'peaceful',
    'succession-loser': 'succession-loser',
  };

  function firstOf(name) { return String(name || 'Ash').split(' ')[0]; }

  var methods = {
    // ensureFaces: the camera rule — max 3 named faces per village
    // (speaker, leader, champion). Lazy, stable, drawn from their roster
    // when they have one. Every beat goes through these three.
    ensureFaces(v) {
      if (!v) return null;
      if (!v.faces) {
        var names = [];
        try {
          var roster = (v.roster || []).filter(function (p) { return p && p.alive !== false && !p.left && (p.age || 20) >= 16; });
          for (var i = 0; i < roster.length && names.length < 3; i++) {
            var nm = firstOf(roster[i].name);
            if (nm && names.indexOf(nm) < 0) names.push(nm);
          }
        } catch (e) {}
        var guard = 0;
        while (names.length < 3 && guard++ < 20) {
          var fn = 'Ash';
          try { var g = this.genNameForOrigin('village', true); if (g && g.name) fn = firstOf(g.name); } catch (e2) {}
          if (names.indexOf(fn) < 0) names.push(fn);
        }
        v.faces = { leader: { name: names[0] }, speaker: { name: names[1] }, champion: { name: names[2] } };
      }
      return v.faces;
    },

    // _vaInner: hidden inner-life state. Tension 0-100, driven by hunger,
    // crisis, and drift. Reactive, never calendar-scripted.
    _vaInner(v) {
      if (!v.inner) {
        v.inner = {
          tension: 10 + R() * 20,
          famineDays: 0,
          fragility: 0.3 + R() * 0.6,
          crisis: null,
          splinterCooldownUntil: 0,
          begCooldownUntil: 0,
          runnerSent: false,
        };
      }
      return v.inner;
    },

    // villageAgencyDaily: every known village lives its own day. Rides
    // hierarchyDaily (which rides membershipDaily at the day boundary).
    villageAgencyDaily() {
      var ovs = [];
      try { ovs = this.state.otherVillages || []; } catch (e) {}
      for (var i = 0; i < ovs.length; i++) {
        try { this._vaSimInner(ovs[i]); } catch (e) {}
      }
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      // a petition ignored for 3 days walks — never a silent limbo
      try {
        var pet = this.state.pendingPetition;
        if (pet && !pet.vote && !pet.awaitingPlayerVote && day - (pet.day || 0) >= 3) {
          this._vaTurnAway(pet, 'waited');
        }
      } catch (e) {}
      // an unanswered begging speaker walks after 2 days
      try {
        var pb = this.state.pendingBeg;
        if (pb && day - (pb.day || 0) >= 2) {
          this.state.pendingBeg = null;
          var bv = this._otherVillage(pb.villageId);
          this.say(`${pb.speaker} waits two days at your fire, getting thinner. Nobody answers. They walk back to ${(bv && bv.name) || 'their fire'} with nothing. They'll remember the silence.`);
          try { if (this._nudgeOpinion) this._nudgeOpinion(pb.villageId, -4); } catch (e) {}
        }
      } catch (e) {}
      // an unanswered raid at the treeline doesn't wait — they take and go
      try {
        var pr = this.state.pendingRaidDefense;
        if (pr && day > (pr.day || 0)) {
          this.state.pendingRaidDefense = null;
          var taken = 0;
          try { taken = this._removePantryKcal ? (this._removePantryKcal(800) || 0) : 0; } catch (e) {}
          var rv = this._otherVillage(pr.villageId);
          this.say(`🌙 You weren't at the treeline. ${pr.champion} of ${(rv && rv.name) || 'nowhere'} didn't wait — they hit the stores and melted back into the dark with ${taken.toLocaleString()} kcal. The village will talk about this for a long time.`);
          try { if (this._nudgeOpinion) this._nudgeOpinion(pr.villageId, -5); } catch (e) {}
          try { if (this.journalNote) this.journalNote('village', 'raid', `Unanswered raid from ${(rv && rv.name) || 'unknown'}: ${taken} kcal taken.`); } catch (e) {}
        }
      } catch (e) {}
      // a succession beat unanswered resolves without you, said aloud
      try {
        var ps = this.state.pendingSuccession;
        if (ps) {
          var sv = this._otherVillage(ps.villageId);
          if (!sv || !sv.inner || !sv.inner.crisis) {
            this.state.pendingSuccession = null;
            this.say(`Word comes from ${(sv && sv.name) || 'the other fire'}: it resolved without you. Whatever happens there now happens without Haven's hand in it.`);
          }
        }
      } catch (e) {}
    },

    // _vaSimInner: one lived day of inner life for a foreign village.
    _vaSimInner(v) {
      if (!v || v.id === HOME) return;
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      var inner = this._vaInner(v);
      this.ensureFaces(v);
      var starving = (v.pantryKcal || 0) <= 0;

      // FAMINE: real pantries starve for real. Unapproached villages hold
      // static pantries, so their famine arrives abstractly — turf played
      // out — and sets the pantry empty for real (the catch-up sim will
      // starve them by its own rules when you arrive; aid refills it).
      if (starving) inner.famineDays++; else inner.famineDays = 0;
      if (!v.famine && inner.famineDays >= 2) {
        v.famine = { since: day, severity: 1 };
        inner.tension = Math.min(100, inner.tension + 25);
        this.queueVillageEventRumor(v.id, 'famine', {});
      }
      if (!v.generated && !v.famine && inner.tension >= 70 && inner.fragility >= 0.6 && R() < 0.10) {
        v.famine = { since: day, severity: 1, abstract: true };
        v.pantryKcal = Math.min(v.pantryKcal || 0, 1500);
        inner.famineDays = 2;
        inner.tension = Math.min(100, inner.tension + 20);
        this.queueVillageEventRumor(v.id, 'famine', {});
      }
      if (v.famine && !starving && (v.pantryKcal || 0) > 6000) {
        v.famine = null;
        inner.tension = Math.max(0, inner.tension - 15);
      }

      // SUCCESSION: the leader dies — condition-weighted, never scheduled.
      if (!inner.crisis) {
        var deathP = 0.0008 + (starving ? 0.006 : 0) + (inner.tension / 100) * 0.004 + (v.famine ? 0.004 : 0);
        if (R() < deathP) this._vaStartSuccession(v);
      } else {
        var c = inner.crisis;
        if (day - c.since >= c.resolveIn) {
          var winner = this._vaResolveSuccession(v, 0);
          // the pending beat dies aloud, not silently
          try {
            if (this.state.pendingSuccession && this.state.pendingSuccession.villageId === v.id) {
              this.state.pendingSuccession = null;
              this.say(`Word from ${v.name}: ${winner} holds the fire now. It resolved without you.`);
            }
          } catch (e) {}
        } else if (!inner.runnerSent) {
          // linked villages send a runner asking for backing
          var linked = null;
          try { linked = this.linkWith(v.id); } catch (e) {}
          if (linked && day - c.since >= 1 && R() < 0.5) {
            inner.runnerSent = true;
            this.stageSuccessionBeat(v.id);
            var faces = this.ensureFaces(v);
            this.say(`🏃 A runner from ${v.name} comes in muddy and breathless. "${faces.leader.name} is dead, and the fire's got two mouths arguing over it. ${v.name} is asking Haven to back a claimant."`);
          }
        }
      }

      // TENSION drift: hunger and crisis feed it, calm starves it.
      var d = (starving ? 3 : -1.2) + (v.famine ? 2 : 0) + (inner.crisis ? 2 : -0.4) + (R() * 2 - 1);
      inner.tension = Math.max(0, Math.min(100, inner.tension + d));

      // SCHISM: the faction breaks. Reactive — tension is earned, not timed.
      if (inner.tension >= 80 && day >= inner.splinterCooldownUntil && (v.population || 0) >= 8) {
        this.fireSplinter(v.id, null);
      }

      // FAMINE ACTS: beg or raid. Played beats, throttled.
      if (v.famine) {
        try { if (this.knowsVillage(v)) this._vaFamineAct(v); } catch (e) {}
      }
    },

    // _vaStartSuccession: the leader is dead; claimants circle the fire.
    _vaStartSuccession(v) {
      var inner = this._vaInner(v);
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      var faces = this.ensureFaces(v);
      var claimants = [];
      try {
        var roster = (v.roster || []).filter(function (p) { return p && p.alive !== false && !p.left && (p.age || 20) >= 18; });
        for (var i = 0; i < roster.length && claimants.length < 3; i++) {
          var nm = firstOf(roster[i].name);
          if (nm !== faces.leader.name && claimants.indexOf(nm) < 0) claimants.push(nm);
        }
      } catch (e) {}
      var guard = 0;
      while (claimants.length < 2 && guard++ < 20) {
        var fn = 'Ash';
        try { var g = this.genNameForOrigin('village', true); if (g && g.name) fn = firstOf(g.name); } catch (e2) {}
        if (fn !== faces.leader.name && claimants.indexOf(fn) < 0) claimants.push(fn);
      }
      inner.crisis = { type: 'succession', since: day, resolveIn: 4 + Math.floor(R() * 6), claimants: claimants, deadLeader: faces.leader.name };
      inner.tension = Math.min(100, inner.tension + 20);
      inner.runnerSent = false;
      this.queueVillageEventRumor(v.id, 'succession', {});
    },

    // _vaResolveSuccession: the fire is held. backedIdx picks the winner;
    // 0 = the strongest claimant (the natural outcome).
    _vaResolveSuccession(v, backedIdx) {
      var inner = this._vaInner(v);
      var c = inner.crisis;
      if (!c) return null;
      var winner = c.claimants[backedIdx] || c.claimants[0];
      var faces = this.ensureFaces(v);
      faces.leader = { name: winner };
      inner.crisis = null;
      inner.tension = Math.max(0, inner.tension - 25);
      return winner;
    },

    // stageSuccessionBeat: the played beat — back a claimant, extort, or stay out.
    stageSuccessionBeat(villageId) {
      var v = null;
      try { v = this._otherVillage(villageId); } catch (e) {}
      if (!v || !v.inner || !v.inner.crisis) return null;
      var c = v.inner.crisis;
      this.state.pendingSuccession = {
        villageId: v.id,
        claimants: c.claimants.map(function (nm, i) { return { name: nm, idx: i }; }),
        day: (this.state.scholar || {}).day || 0,
      };
      return true;
    },

    // answerSuccession: backA/backB (aid — the winner owes you), extort
    // (evil is legitimate: tribute for backing), stayOut (it resolves alone).
    answerSuccession(how) {
      var ps = this.state.pendingSuccession;
      if (!ps) return null;
      this.state.pendingSuccession = null;
      var v = null;
      try { v = this._otherVillage(ps.villageId); } catch (e) {}
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      if (!v || !v.inner || !v.inner.crisis) {
        this.say(`The moment's passed — word comes that it resolved without you.`);
        return 'passed';
      }
      var nm = v.name || 'the village';
      if (how === 'stayOut') {
        this.say(`Haven stays out of ${nm}'s fire-fight. Whatever happens there happens without you — and they'll remember you weren't there.`);
        try { if (this.journalNote) this.journalNote('village', 'succession', `Stayed out of ${nm}'s succession.`); } catch (e) {}
        return 'stayed-out';
      }
      if (how === 'extort') {
        var paid = Math.min(2000, Math.max(0, v.pantryKcal || 0));
        v.pantryKcal = Math.max(0, (v.pantryKcal || 0) - paid);
        if (paid > 0) {
          try {
            var vp = this.state.village || {}; vp.pantry = vp.pantry || [];
            vp.pantry.push({ name: 'Tribute — ' + nm, kcalEach: paid, units: 1, spoilDay: day + 14 });
          } catch (e) {}
        }
        var winner = this._vaResolveSuccession(v, 0);
        try { if (this._nudgeOpinion) this._nudgeOpinion(v.id, -15); } catch (e) {}
        var link = null;
        try { link = this.linkWith(v.id); } catch (e) {}
        if (link) link.trust = Math.max(0, (link.trust || 0) - 10);
        this.say(`Haven names its price: ${paid.toLocaleString()} kcal for Haven's backing. ${nm} pays — what choice do they have? ${winner} holds the fire now, and hates the price of it. (Opinion -15${link ? ', trust -10' : ''}.)`);
        try { if (this.journalNote) this.journalNote('village', 'succession', `Extorted ${nm}'s succession: ${paid} kcal for backing ${winner}.`); } catch (e) {}
        return 'extorted';
      }
      var idx = how === 'backB' ? 1 : 0;
      var win = this._vaResolveSuccession(v, idx);
      try { if (this._nudgeOpinion) this._nudgeOpinion(v.id, 8); } catch (e) {}
      var lk = null;
      try { lk = this.linkWith(v.id); } catch (e) {}
      if (lk) lk.trust = Math.min(100, (lk.trust || 0) + 8);
      var loser = ps.claimants[(idx + 1) % ps.claimants.length];
      this.say(`Haven backs ${win}. Runners carry the word, and ${win} holds the fire with Haven's name behind them. ${loser ? loser.name + ' walks — and will remember who chose.' : ''} (Opinion +8${lk ? ', trust +8' : ''}.)`);
      try { if (this.journalNote) this.journalNote('village', 'succession', `Backed ${win} in ${nm}'s succession.`); } catch (e) {}
      return 'backed';
    },

    // _vaPickSplinterCause: what the faction became. Hunger erodes norms
    // (CORRUPTION.md) — a starving village grows cannibals; a sated one
    // grows raiders, peacemakers, or losers.
    _vaPickSplinterCause(v) {
      var inner = this._vaInner(v);
      var starving = (v.pantryKcal || 0) <= 0 || !!v.famine;
      var r = R();
      if (starving) {
        if (r < 0.45) return 'cannibal';
        if (r < 0.75) return 'famine-flight';
        return 'hardline';
      }
      if (inner.crisis) return 'succession-loser';
      if (r < 0.15) return 'cannibal';
      if (r < 0.45) return 'hardline';
      if (r < 0.70) return 'peaceful';
      return 'famine-flight';
    },

    // _vaSplinterMembers: the breakaways are NAMED individuals, drawn from
    // their roster when they have one. They leave the roster as leavers,
    // not deaths — the parent village's news says so.
    _vaSplinterMembers(v, n) {
      var out = [];
      try {
        var roster = (v.roster || []).filter(function (p) { return p && p.alive !== false && !p.left && (p.age || 20) >= 14; });
        for (var i = 0; i < roster.length && out.length < n; i++) {
          var p = roster[i];
          out.push({ name: p.name || 'Ash River', age: p.age || 30, id: p.id || null });
          p.left = true;
          p.cause = 'schism';
          v.news = v.news || [];
          if (v.news.length < 20) v.news.push(`🚶 ${firstOf(p.name)} left with the schism.`);
        }
      } catch (e) {}
      var guard = 0;
      while (out.length < n && guard++ < 30) {
        var nm = 'Ash River';
        try { var g = this.genNameForOrigin('village', true); if (g && g.name) nm = g.name; } catch (e2) {}
        out.push({ name: nm, age: 18 + Math.floor(R() * 30), id: null });
      }
      var occs = ['forager', 'hunter', 'fisher', 'cook', 'minder', 'trapper', 'healer', 'scavenger'];
      var temps = ['steady', 'warm', 'cautious', 'bold', 'prickly', 'withdrawn'];
      for (var j = 0; j < out.length; j++) {
        out[j].occupation = occs[Math.floor(R() * occs.length)];
        out[j].temperament = temps[Math.floor(R() * temps.length)];
      }
      return out;
    },

    // _vaMakeSplinterVillage: the half that doesn't petition becomes a new
    // fire in the world — a live village, not a rumor. It keeps playing.
    _vaMakeSplinterVillage(v, remainers, cause, kcal, day) {
      var suffix = {
        cannibal: 'the Red Table', 'famine-flight': 'the Hungry Road',
        hardline: 'the Bloodied', peaceful: 'the Quiet Ones',
        'succession-loser': 'the Cast Out',
      }[cause] || 'Splinter';
      var id = 'village_spl_' + day + '_' + Math.floor(R() * 100000);
      var nv = {
        id: id,
        name: (v.name || 'Emberhold') + ' ' + suffix,
        x: Math.min(8, (v.x || 4) + 1), y: v.y || 4,
        day: 0,
        population: Math.max(2, remainers.length),
        pantryKcal: Math.max(0, kcal || 0),
        knowledge: v.knowledge || 0,
        generated: false, rumored: false,
        isSplinter: true, splinterCause: cause, parentVillage: v.id,
        opinion: cause === 'hardline' ? -10 : 0,
      };
      this.ensureFaces(nv);
      try { (this.state.otherVillages || []).push(nv); } catch (e) {}
      return nv;
    },

    // fireSplinter: THE SCHISM. A faction breaks away from a linked village.
    // Half the breakaways petition to join YOU (played beat); the rest
    // become a new village. Hardliners don't petition — they want blood,
    // not your fire. Reactive: call this from tension, or force a cause.
    fireSplinter(villageId, forcedCause) {
      var v = null;
      try { v = this._otherVillage(villageId); } catch (e) {}
      if (!v) return null;
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      var inner = this._vaInner(v);
      this.ensureFaces(v);
      var cause = forcedCause && CAUSES[forcedCause] ? forcedCause : this._vaPickSplinterCause(v);
      var pop = v.population || 8;
      var n = Math.min(6, Math.max(3, Math.floor(pop / 2)));
      n = Math.min(n, Math.max(2, pop - 6)); // the parent stays viable
      if (n < 2) return null;
      var members = this._vaSplinterMembers(v, n);
      if (cause === 'cannibal') {
        for (var ci = 0; ci < members.length; ci++) members[ci].corruption = 40 + Math.floor(R() * 20);
      }
      v.population = Math.max(6, pop - members.length);
      var takeKcal = Math.floor((v.pantryKcal || 0) * 0.25);
      v.pantryKcal = Math.max(0, (v.pantryKcal || 0) - takeKcal);
      inner.tension = Math.max(0, inner.tension - 40);
      inner.splinterCooldownUntil = day + 30;

      var petitioners = [], remainers = members;
      var linked = null;
      try { linked = this.linkWith(v.id); } catch (e) {}
      if (cause !== 'hardline' && linked) {
        var half = Math.ceil(members.length / 2);
        petitioners = members.slice(0, half);
        remainers = members.slice(half);
      }
      var nv = this._vaMakeSplinterVillage(v, remainers, cause, Math.floor(takeKcal / 2), day);
      this.queueVillageEventRumor(v.id, 'schism', { cause: cause, newVillageId: nv.id });

      var faces = v.faces || {};
      var cLine = {
        cannibal: `A faction of ${v.name} has turned cannibal — and split. The eaters walked.`,
        'famine-flight': `${v.name} is coming apart from hunger — a faction walked, looking for a fire that feeds.`,
        hardline: `${v.name} has split over blood — the hardliners walked, and they didn't walk far.`,
        peaceful: `${v.name} has split over the spear — the ones who wouldn't raid walked.`,
        'succession-loser': `${v.name}'s fire-fight is over, and the losers walked rather than kneel.`,
      }[cause] || `${v.name} has split.`;
      this.say(`💔 ${cLine} ${nv.name} is a new fire in the world now — ${nv.population} people under ${(nv.faces || {}).champion ? nv.faces.champion.name : 'a new name'}.`);
      try { if (this.journalNote) this.journalNote('village', 'schism', `${v.name} split (${cause}). ${nv.name} formed; ${petitioners.length} petition at Haven's fire.`); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'schism:' + v.id + ':' + cause); } catch (e) {}

      if (petitioners.length) {
        this.openPetition({
          id: 'pet_' + day + '_' + v.id,
          petitioners: petitioners, cause: cause,
          originVillage: v.id, originName: v.name,
          day: day, interviews: [],
        });
      } else if (cause === 'hardline') {
        this.say(`They didn't come to your fire. Hardliners don't ask — ${(nv.faces || {}).champion ? nv.faces.champion.name : 'their champion'} is building something out there, and it isn't a farm.`);
      }
      return { cause: cause, petitioners: petitioners, newVillage: nv };
    },

    // openPetition: THEY arrive at YOUR fire. Named, interviewed, voted on —
    // never a silent population tick. If a petition is already pending, the
    // newcomers queue — one thing at a time at the fire.
    openPetition(pet) {
      pet = pet || {};
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      pet.id = pet.id || ('pet_' + day + '_' + Math.floor(R() * 100000));
      pet.day = day;
      pet.interviews = pet.interviews || [];
      pet.maxInterviews = 3;
      if (this.state.pendingPetition) {
        this.state.petitionQueue = this.state.petitionQueue || [];
        this.state.petitionQueue.push(pet);
        var qn = pet.petitioners.length;
        this.say(`More travelers at the treeline — ${qn} of them — but there's already a petition at your fire. One thing at a time. They make camp outside to wait.`);
        return pet.id;
      }
      this.state.pendingPetition = pet;
      var names = pet.petitioners.map(function (p) { return p.name; }).join(', ');
      var speaker = pet.petitioners[0] || { name: 'Ash' };
      var sf = firstOf(speaker.name);
      var origin = pet.originName || 'another fire';
      this.say(`🌒 Dusk. They come out of the treeline in a knot — ${pet.petitioners.length} of them, thin and road-worn — and stop at the edge of your firelight like they're not sure they're allowed closer. The oldest steps forward. "${speaker.name}. From ${origin}." A pause. "We're asking for a fire."`);
      var causeLine = {
        cannibal: `"We ate people," ${sf} says, before anyone asks. "At ${origin}, when the food ran out. I'm not asking you to like it. I'm asking for a fire." Nobody at your fire speaks. Somebody's spoon stops halfway to their mouth.`,
        'famine-flight': `"${origin} is eating bark and calling it dinner," ${sf} says. "We left before we started looking at each other like food."`,
        peaceful: `"${origin} voted for the raid," ${sf} says. "We voted no. We're done voting."`,
        'succession-loser': `"We backed the wrong fire and it burned us," ${sf} says. "${origin} isn't ours anymore."`,
      }[pet.cause] || `"We need a fire," ${sf} says.`;
      this.say(causeLine);
      this.say(`They're named, every one: ${names}. Your move — ask them questions (up to three), call a MOOT on it, or turn them away at the edge of the firelight.`);
      try { if (this.journalNote) this.journalNote('village', 'petition', `${pet.petitioners.length} petitioners from ${origin} (${pet.cause}): ${names}.`); } catch (e) {}
      try { if (this.drama) this.drama('social', { type: 'petition', n: pet.petitioners.length }); } catch (e) {}
      return pet.id;
    },

    // petitionInterview: the played interview. Three questions max — the
    // village gets restless. Answers are honest; some move the room.
    petitionInterview(petitionId, qid) {
      var pet = this.state.pendingPetition;
      if (!pet || pet.id !== petitionId) return null;
      if (['why', 'bring', 'cause', 'origin'].indexOf(qid) < 0) return null;
      if (pet.interviews.indexOf(qid) >= 0) { this.say(`You already asked that.`); return null; }
      if (pet.interviews.length >= pet.maxInterviews) {
        this.say(`They've answered enough — the village is getting restless. Call the moot, or turn them away.`);
        return null;
      }
      pet.interviews.push(qid);
      var speaker = pet.petitioners[0] || { name: 'Ash' };
      var sf = firstOf(speaker.name);
      var origin = pet.originName || 'another fire';
      var bonus = 0, text = '';
      if (qid === 'why') {
        var staying = {
          cannibal: 'staying meant getting hungry enough to do it again',
          'famine-flight': 'staying meant watching the kids go hollow',
          peaceful: "staying meant holding a spear for something we didn't choose",
          'succession-loser': 'staying meant kneeling to the winners',
        }[pet.cause] || 'staying meant dying slow';
        text = `"Because ${staying}," ${sf} says. No performance in it. Just the truth, said plain.`;
        bonus = 2;
      } else if (qid === 'bring') {
        var skills = pet.petitioners.map(function (p) { return `${firstOf(p.name)} ${p.occupation || 'survived'}`; }).join(', ');
        var useful = pet.petitioners.some(function (p) { return ['hunter', 'fisher', 'cook', 'trapper', 'healer', 'forager'].indexOf(p.occupation) >= 0; });
        text = `"Hands," ${sf} says. "${skills}." ${useful ? 'A couple of your people glance at each other — those are useful hands.' : ''}`;
        bonus = useful ? 4 : 1;
      } else if (qid === 'cause') {
        if (pet.cause === 'cannibal') {
          text = `${sf} doesn't look away. "Three of them. Two were already dead — the hunger took them and we... didn't waste them. The third —" A long pause. "The third we don't talk about. Not yet. Maybe not ever." The fire feels very small.`;
          bonus = -3;
        } else if (pet.cause === 'peaceful') {
          text = `"We wouldn't raid," ${sf} says. "That's the whole of it. Make of that what you want."`;
          bonus = 2;
        } else if (pet.cause === 'succession-loser') {
          text = `"We chose wrong," ${sf} says. "That's the whole of it."`;
          bonus = 1;
        } else {
          text = `"Nothing to confess," ${sf} says. "We're just hungry."`;
          bonus = 2;
        }
      } else if (qid === 'origin') {
        var faces = null;
        try { var ov = this._otherVillage(pet.originVillage); faces = ov ? this.ensureFaces(ov) : null; } catch (e) {}
        var pop = '?';
        try { pop = (this._otherVillage(pet.originVillage) || {}).population || '?'; } catch (e) {}
        text = `"${origin}," ${sf} says. "${pop} people, ${faces ? faces.leader.name : 'someone'} holding the fire. Good ground, bad luck."`;
        bonus = 1;
      }
      pet.interviewBonus = (pet.interviewBonus || 0) + bonus;
      this.say(text);
      return true;
    },

    // _vaPantryPerMouth: days of food per mouth — the room's real arithmetic.
    _vaPantryPerMouth() {
      var kcal = 0, mouths = 1;
      try {
        var v = this.state.village || {};
        kcal = this.pantryKcalLive ? this.pantryKcalLive(v) : (v.pantryKcal || 0);
        mouths = Math.max(1, (v.roster || []).length);
      } catch (e) {}
      return kcal / mouths / 2000;
    },

    // _vaPetitionScore: one voter's heart, honestly computed. Temperament,
    // food pressure, the cause, fear, what the interview revealed, the
    // room's weather, noise. Nobody is unbribable by hunger; nobody is safe.
    _vaPetitionScore(vid, pet, ppm, mood) {
      var s = 0;
      var temp = 'steady';
      try { temp = this.npcTemper(vid) || 'steady'; } catch (e) {}
      s += { warm: 12, gentle: 8, bold: 4, steady: 2, restless: 2, intense: 0, dry: 0, anxious: -4, cautious: -4, withdrawn: -6, prickly: -8, dark: 6 }[temp] || 0;
      if (ppm < 3) s -= 15; else if (ppm < 7) s -= 5; else if (ppm > 14) s += 5;
      if (pet.cause === 'cannibal') {
        s -= 25;
        if (temp === 'dark') s += 14; // the corrupt recognize their own
        var brave = 0;
        try { brave = (this.repOf(vid) || {}).brave || 0; } catch (e) {}
        s += brave > 25 ? 6 : (brave < 0 ? -8 : 0);
      } else if (pet.cause === 'famine-flight') s += 8;
      else if (pet.cause === 'peaceful') s += 4;
      s += (pet.interviewBonus || 0);
      s += mood * 0.3;
      s += R() * 20 - 10;
      return s;
    },

    // conductPetitionMoot: the village votes. Speeches first (the drama),
    // then the count — and the moot turns to you. Knowledge never gates:
    // a starving stranger doesn't check your codex.
    conductPetitionMoot(petitionId) {
      var pet = this.state.pendingPetition;
      if (!pet || pet.id !== petitionId) return null;
      if (pet.vote) return pet.vote;
      var room = this.havenRoom();
      var names = pet.petitioners.map(function (p) { return firstOf(p.name); }).join(', ');
      if (room <= 0) {
        this.say(`There's no room — every bed's full, every bowl spoken for. What would the moot even vote on? ${names} hear it plain. It's not unkind. It's full.`);
        return { room: 0 };
      }
      this.say(`You call a moot on it. The fire gets built up. The petitioners sit just outside the light, trying not to look like they're listening.`);
      try { if (this.drama) this.drama('social', { type: 'moot', caller: 'You' }); } catch (e) {}
      var voters = [];
      try { voters = this.npcIds(); } catch (e) {}
      // attendance varies, like every moot
      var present = voters.filter(function () { return R() < 0.88; });
      var mood = 0;
      try { mood = this.villageMood(); } catch (e) {}
      var ppm = this._vaPantryPerMouth();
      var votes = [], accept = 0;
      for (var i = 0; i < present.length; i++) {
        var vid = present[i];
        if (vid === this.villagerId) continue;
        var s = this._vaPetitionScore(vid, pet, ppm, mood);
        var vv = s > 0 ? 'accept' : 'reject';
        if (vv === 'accept') accept++;
        votes.push({ vid: vid, vote: vv, score: Math.round(s) });
      }
      // the speeches — within-village drama, played
      var forV = votes.filter(function (x) { return x.vote === 'accept'; }).sort(function (a, b) { return b.score - a.score; })[0];
      var agV = votes.filter(function (x) { return x.vote === 'reject'; }).sort(function (a, b) { return a.score - b.score; })[0];
      var tag = function (id) { try { return this.whoTag(id); } catch (e) { return 'Someone'; } }.bind(this);
      var cap = function (s) { try { return this.capFirst(s); } catch (e) { return s; } }.bind(this);
      if (forV) {
        var fLine = pet.cause === 'cannibal'
          ? `"I'm not saying I trust them. I'm saying I remember being hungry."`
          : `"A fire's for sharing. That's the whole point of it."`;
        this.say(`${cap(tag(forV.vid))} stands. ${fLine}`);
      }
      if (agV) {
        var aLine = pet.cause === 'cannibal'
          ? `"They EAT people. I don't care how hungry the road made them. No."`
          : `"More mouths. Less food. You do the math."`;
        this.say(`${cap(tag(agV.vid))} stands. ${aLine}`);
      }
      var need = Math.floor((present.length + 1) / 2) + 1;
      pet.vote = { votes: votes, accept: accept, need: need, present: present.length, forId: forV && forV.vid, againstId: agV && agV.vid };
      var playerVoter = !(this.state.scholar || {}).exiled;
      if (playerVoter) {
        this.say(`The moot turns to you. Your vote matters here — and everyone will remember it.`);
        pet.awaitingPlayerVote = true;
        return { awaitingPlayerVote: true, acceptSoFar: accept, need: need };
      }
      return this._vaFinishPetition(pet, 0);
    },

    // answerPetition: 'accept'/'reject' — your vote in the moot, or turning
    // them away at the door before any moot is called.
    answerPetition(petitionId, how) {
      var pet = this.state.pendingPetition;
      if (!pet || pet.id !== petitionId) return null;
      if (how === 'reject' && !pet.vote && !pet.awaitingPlayerVote) {
        return this._vaTurnAway(pet, 'door');
      }
      if (pet.awaitingPlayerVote && (how === 'accept' || how === 'reject')) {
        pet.awaitingPlayerVote = false;
        // THE ROOM REMEMBERS: your vote lands socially, like every moot.
        try {
          var me = this.villagerId;
          if (how === 'accept') {
            var ag = pet.vote && pet.vote.againstId;
            if (ag && !this.isPlayer(ag)) this.recordGrievance(ag, me, 'voted_for_petitioners', 14);
          } else {
            var fo = pet.vote && pet.vote.forId;
            if (fo && !this.isPlayer(fo)) this.recordGrievance(fo, me, 'turned_away_petitioners', 12);
          }
        } catch (e) {}
        return this._vaFinishPetition(pet, how === 'accept' ? 1 : 0);
      }
      return null;
    },

    // _vaFinishPetition: the count, said aloud. Then the consequence.
    _vaFinishPetition(pet, playerAccept) {
      var v = pet.vote || { accept: 0, present: 0 };
      var acceptVotes = v.accept + (playerAccept ? 1 : 0);
      var total = v.present + 1;
      var need = Math.floor(total / 2) + 1;
      var accepted = acceptVotes >= need;
      var counter = 'Someone';
      try {
        var pool = (v.votes || []).map(function (x) { return x.vid; });
        counter = this.whoTag(pool[0] || this.npcIds()[0]);
      } catch (e) {}
      this.say(`The fire is built high. Nobody speaks while the count is taken.`);
      this.say(`${this.capFirst(counter)} counts on their fingers, twice. Then, to the fire: "${acceptVotes} for taking them in. ${total - acceptVotes} against."`);
      try { if (this.drama) this.drama('social', { type: 'vote', guilty: acceptVotes, total: total }); } catch (e) {}
      // the loudest loser speaks — the drama doesn't end at the count
      try {
        var loserVotes = (v.votes || []).filter(function (x) { return (x.vote === 'accept') !== accepted; })
          .sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); })[0];
        if (loserVotes) {
          var lt = this.whoTag(loserVotes.vid);
          this.say(accepted
            ? `${this.capFirst(lt)} looks at the fire a long moment. "Fine. But when the food runs short, remember whose idea this was."`
            : `${this.capFirst(lt)} exhales. "Good. I hope the road's kinder to them than we were."`);
        }
      } catch (e) {}
      if (accepted) return this._vaAdmitPetitioners(pet);
      return this._vaTurnAway(pet, 'moot');
    },

    // _vaAdmitPetitioners: they join. Real villagers — hydrated persons,
    // roster seats, wary trust, their corruption crossing with them.
    // The cap is the ceiling: only havenRoom() are admitted, said aloud.
    _vaAdmitPetitioners(pet) {
      var room = this.havenRoom();
      var admitted = pet.petitioners.slice(0, Math.max(0, room));
      var left = pet.petitioners.slice(admitted.length);
      var v = this.state.village || {};
      var newIds = [];
      for (var i = 0; i < admitted.length; i++) {
        var p = admitted[i];
        var id = 'ptn_' + pet.id + '_' + i;
        var seed = {
          id: id, name: p.name, age: p.age || 30,
          formerOccupation: p.occupation || 'survivor',
          personality: { temperament: p.temperament || 'steady' },
          line: 'Came to Haven\'s fire from ' + (pet.originName || 'another fire') + '.',
        };
        var hydrated = null;
        try { hydrated = this.hydrateSeed(seed); } catch (e) {}
        if (!hydrated || !hydrated.id) continue;
        try {
          if (!this.data.villagers.some(function (x) { return x.id === hydrated.id; })) this.data.villagers.push(hydrated);
        } catch (e) {}
        v.rosterChars = v.rosterChars || {};
        v.rosterChars[hydrated.id] = hydrated;
        v.roster = v.roster || [];
        if (v.roster.indexOf(hydrated.id) < 0) v.roster.push(hydrated.id);
        v.trust = v.trust || {};
        v.trust[hydrated.id] = 5; // wary newcomer — trust is earned
        try {
          var goalIds = (this.data.characterGen.goals || []).map(function (g) { return g.id; }).filter(function (x) { return x !== 'lead'; });
          v.bgGoals = v.bgGoals || {};
          if (goalIds.length) v.bgGoals[hydrated.id] = goalIds[Math.floor(R() * goalIds.length)];
        } catch (e) {}
        try {
          v.bgIntel = v.bgIntel || {};
          v.bgIntel[hydrated.id] = { primary: 'steady', secondary: 'practical' };
        } catch (e) {}
        if (pet.cause === 'cannibal' && p.corruption) {
          try { if (this.addNpcCorruption) this.addNpcCorruption(hydrated.id, p.corruption, 'cannibal past'); } catch (e) {}
        }
        newIds.push(hydrated.id);
      }
      // the sponsor remembers standing for them (once — not per head)
      try {
        if (pet.vote && pet.vote.forId && !this.isPlayer(pet.vote.forId)) this.bumpTrust(pet.vote.forId, 2);
      } catch (e) {}
      var adNames = admitted.map(function (p) { return p.name; }).join(', ');
      this.say(`The fire makes room. ${adNames} — said aloud, so the village learns the names. They're Haven's now, for better or worse.`);
      if (pet.cause === 'cannibal' && newIds.length) {
        this.say(`Nobody says it, but everyone thinks it: there are eaters at the fire now. The village will watch them. So will you.`);
      }
      if (left.length) {
        var leftNames = left.map(function (p) { return firstOf(p.name); }).join(', ');
        this.say(`${leftNames} — there's no room. Every bed's full. They nod like they expected it, and walk on into the dark.`);
      }
      this._vaPetitionConsequences(pet, true);
      this.state.pendingPetition = null;
      // the queue moves: one thing at a time at the fire
      try {
        var q = this.state.petitionQueue || [];
        if (q.length) this.openPetition(q.shift());
      } catch (e) {}
      try { if (this.journalNote) this.journalNote('village', 'petition', `Admitted ${newIds.length}: ${adNames} (${pet.cause}).`); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'petition-accepted:' + pet.id + ':' + pet.cause + ':' + newIds.length); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment(`Haven took in ${newIds.length} from ${pet.originName || 'another fire'}.`); } catch (e) {}
      return { accepted: true, admitted: newIds };
    },

    // _vaTurnAway: they walk. Said aloud — never silent. The origin village
    // hears, and judges.
    _vaTurnAway(pet, why) {
      var speaker = firstOf((pet.petitioners[0] || {}).name);
      if (why === 'waited') {
        this.say(`They waited three days at the edge of your fire. Nobody called the moot. ${speaker} nods — not angry, just done — and they walk.`);
      } else if (why === 'door') {
        this.say(`You turn them away at the edge of the firelight. ${speaker} holds your eyes a moment, then nods. "Thanks for the fire, anyway." They walk.`);
      } else {
        this.say(`The moot votes no. ${speaker} nods like they expected it. "Thanks for the fire, anyway." They walk.`);
      }
      // they rejoin the remnant fire if it exists, else walk on
      try {
        var ovs = this.state.otherVillages || [];
        var remnant = null;
        for (var i = 0; i < ovs.length; i++) {
          if (ovs[i].isSplinter && ovs[i].parentVillage === pet.originVillage) { remnant = ovs[i]; break; }
        }
        if (remnant) {
          remnant.population += pet.petitioners.length;
          this.say(`Word later: they walked to ${remnant.name}. Another fire in the world, whether you wanted it or not.`);
        }
      } catch (e) {}
      this._vaPetitionConsequences(pet, false);
      this.state.pendingPetition = null;
      try {
        var q = this.state.petitionQueue || [];
        if (q.length) this.openPetition(q.shift());
      } catch (e) {}
      try { if (this.journalNote) this.journalNote('village', 'petition', `Turned away ${pet.petitioners.length} petitioners from ${pet.originName || 'another fire'} (${pet.cause}).`); } catch (e) {}
      return { accepted: false };
    },

    // _vaPetitionConsequences: accepting has real consequences. Mouths to
    // feed are automatic (they're roster now). Reputation follows them:
    // other villages react to what you harbored — opinion moves on every
    // known fire, and the village talks.
    _vaPetitionConsequences(pet, accepted) {
      var delta = 0, note = '';
      if (accepted) {
        if (pet.cause === 'cannibal') { delta = -12; note = 'harboring eaters'; }
        else if (pet.cause === 'famine-flight') { delta = 3; note = 'feeding the hungry'; }
        else if (pet.cause === 'peaceful') { delta = 2; note = 'sheltering the peacemakers'; }
      } else {
        if (pet.cause === 'cannibal') { delta = 2; note = 'clean hands'; }
        else if (pet.cause === 'famine-flight') { delta = -4; note = 'turned away the hungry'; }
      }
      if (delta) {
        var ovs = [];
        try { ovs = this.state.otherVillages || []; } catch (e) {}
        for (var i = 0; i < ovs.length; i++) {
          var vv = ovs[i];
          if (!vv || vv.id === pet.originVillage) continue;
          var known = false;
          try { known = this.knowsVillage(vv); } catch (e) {}
          if (!known) continue;
          try { if (this._nudgeOpinion) this._nudgeOpinion(vv.id, delta); } catch (e) {}
        }
        this.say(delta < 0
          ? `Word will travel: Haven is ${note}. Other fires will remember. (Opinion ${delta} with every village that knows you.)`
          : `Word will travel: Haven is ${note}. (Opinion +${delta} with every village that knows you.)`);
      }
      // the origin fire judges separately — you sheltered their schism
      try {
        if (pet.originVillage && this._nudgeOpinion) {
          if (accepted && pet.cause === 'succession-loser') this._nudgeOpinion(pet.originVillage, -6);
          else if (accepted && pet.cause === 'cannibal') this._nudgeOpinion(pet.originVillage, -5);
          else if (!accepted && pet.cause === 'cannibal') this._nudgeOpinion(pet.originVillage, 2);
        }
      } catch (e) {}
      // the village talks: harboring cannibals moves how they see you
      try {
        if (accepted && pet.cause === 'cannibal' && this.seedGossip) {
          var hearers = (this.npcIds ? this.npcIds() : []).slice(0, 4);
          this.seedGossip('harbor_cannibals', { who: this.villagerId, honest: -10, trustworthy: -8 }, hearers);
        }
      } catch (e) {}
    },

    // havenPopCap: THE CAP HOOK (clean hook for the haven workstream).
    // The haven workstream owns the growth tiers (PROGRESSION.md: 12 base,
    // 16 Longhouse, 20 Palisade, 24 Granary), exposed live as
    // Game.havenTier() -> 0..3 (code: havenGrowth.js). This reads their
    // state when present, keeps the legacy growthTier key as a fallback,
    // and falls back to the canon mapping otherwise. They can also
    // register Game._havenPopCapOverride = fn. The cap is the ceiling;
    // the village decides who stands under it.
    havenPopCap() {
      try {
        var tier = null;
        if (typeof this.havenTier === 'function') tier = this.havenTier();
        if (tier === null || tier === undefined) {
          var v = this.state.village || {};
          tier = v.growthTier || ((this.state.haven || {}).growthTier) || null;
        }
        if (tier === 3 || tier === 'granary') return 24;
        if (tier === 2 || tier === 'palisade') return 20;
        if (tier === 1 || tier === 'longhouse') return 16;
        if (typeof this._havenPopCapOverride === 'function') {
          var c = this._havenPopCapOverride();
          if (c > 0) return Math.floor(c);
        }
      } catch (e) {}
      return 12;
    },

    // havenRoom: beds left. Never negative, never silent.
    havenRoom() {
      var cap = 12;
      try { cap = this.havenPopCap(); } catch (e) {}
      var pop = 0;
      try { pop = (this.state.village.roster || []).length; } catch (e) {}
      return Math.max(0, cap - pop);
    },

    // aidVillage: send real food to a starving or crisis-hit village.
    // Played, costly, remembered. Aid can end a famine outright.
    aidVillage(villageId, kcal) {
      var v = null;
      try { v = this._otherVillage(villageId); } catch (e) {}
      if (!v) { this.say(`No such village.`); return null; }
      kcal = Math.max(0, Math.round(kcal || 0));
      if (!kcal) return null;
      var removed = 0;
      try { removed = this._removePantryKcal ? (this._removePantryKcal(kcal) || 0) : 0; } catch (e) {}
      if (!removed) { this.say(`The pantry can't spare it — the jars echo. Aid is real food or it isn't aid.`); return false; }
      v.pantryKcal = (v.pantryKcal || 0) + removed;
      var inner = this._vaInner(v);
      inner.tension = Math.max(0, inner.tension - 15);
      var famineEnded = false;
      if (v.famine && (v.pantryKcal || 0) > 6000) { v.famine = null; famineEnded = true; }
      try { if (this._nudgeOpinion) this._nudgeOpinion(villageId, 10); } catch (e) {}
      var link = null;
      try { link = this.linkWith(villageId); } catch (e) {}
      if (link) link.trust = Math.min(100, (link.trust || 0) + 5);
      var nm = v.name || 'them';
      this.say(`A runner leaves Haven with ${removed.toLocaleString()} kcal for ${nm}. ${famineEnded ? 'Their jars fill. The famine breaks — they will not forget who fed them.' : 'Every kcal of it real.'} (Opinion +10${link ? ', trust +5' : ''}.)`);
      try { if (this.journalNote) this.journalNote('village', 'aid', `Sent ${removed} kcal to ${nm}${famineEnded ? ' — famine broken' : ''}.`); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'aid:' + villageId + ':' + removed); } catch (e) {}
      return true;
    },

    // _vaFamineAct: a starving village acts — beg or raid. Throttled,
    // channeled through known villages only. Never silent, never both.
    _vaFamineAct(v) {
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      if (this.state.pendingBeg || this.state.pendingRaidDefense) return;
      var inner = this._vaInner(v);
      if (day < (inner.begCooldownUntil || 0)) return;
      var linked = null;
      try { linked = this.linkWith(v.id); } catch (e) {}
      var p = linked ? 0.25 : 0.08;
      if (R() > p) return;
      inner.begCooldownUntil = day + 14;
      var opinion = v.opinion || 0;
      var raidP = opinion < -10 ? 0.6 : 0.25;
      if (v.isSplinter && v.splinterCause === 'hardline') raidP = 0.8;
      if (R() < raidP) this._vaStageRaidDefense(v);
      else this._vaStageBeg(v);
    },

    // _vaStageBeg: their speaker at your fire, thin. Played.
    _vaStageBeg(v) {
      var faces = this.ensureFaces(v);
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      this.state.pendingBeg = { villageId: v.id, speaker: faces.speaker.name, amount: 1500, day: day };
      this.say(`🥣 ${faces.speaker.name} of ${v.name} walks into your firelight alone, thinner than you remember. "Our jars are empty," they say. No preamble. "I'm asking for food."`);
      try { if (this.journalNote) this.journalNote('village', 'beg', `${faces.speaker.name} of ${v.name} begs food at Haven's fire.`); } catch (e) {}
    },

    // answerBeg: give (real food, real gratitude) or refuse (real cold).
    answerBeg(how) {
      var pb = this.state.pendingBeg;
      if (!pb) return null;
      this.state.pendingBeg = null;
      var v = null;
      try { v = this._otherVillage(pb.villageId); } catch (e) {}
      var nm = (v && v.name) || 'their fire';
      if (how === 'give') {
        var removed = 0;
        try { removed = this._removePantryKcal ? (this._removePantryKcal(pb.amount) || 0) : 0; } catch (e) {}
        if (!removed) {
          this.say(`You'd give — but the pantry can't spare it. ${pb.speaker} sees it in your face before you say it. That's almost worse.`);
          try { if (this._nudgeOpinion) this._nudgeOpinion(pb.villageId, -3); } catch (e) {}
          return false;
        }
        if (v) {
          v.pantryKcal = (v.pantryKcal || 0) + removed;
          var inner = this._vaInner(v);
          inner.tension = Math.max(0, inner.tension - 12);
          if (v.famine && (v.pantryKcal || 0) > 6000) v.famine = null;
        }
        try { if (this._nudgeOpinion) this._nudgeOpinion(pb.villageId, 10); } catch (e) {}
        var link = null;
        try { link = this.linkWith(pb.villageId); } catch (e) {}
        if (link) link.trust = Math.min(100, (link.trust || 0) + 5);
        this.say(`You load ${removed.toLocaleString()} kcal onto ${pb.speaker}'s back. They don't say thank you — not in words. They just stand there a moment, holding it like it's heavier than food. (Opinion +10${link ? ', trust +5' : ''}.)`);
        try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'beg-gave:' + pb.villageId + ':' + removed); } catch (e) {}
        return true;
      }
      this.say(`You refuse. ${pb.speaker} nods — once — and walks back into the dark with nothing. The fire feels colder after.`);
      try { if (this._nudgeOpinion) this._nudgeOpinion(pb.villageId, -8); } catch (e) {}
      // hunger doesn't take no for an answer: 30% they come back with spears
      if (v && R() < 0.3) {
        this.say(`Three nights later, you hear them in the treeline. Asking didn't work.`);
        this._vaStageRaidDefense(v);
      }
      try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'beg-refused:' + pb.villageId); } catch (e) {}
      return false;
    },

    // _vaStageRaidDefense: their champion at your treeline. Played standoff.
    _vaStageRaidDefense(v) {
      var faces = this.ensureFaces(v);
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      var n = 2 + Math.floor(R() * 3);
      var raiders = [];
      for (var i = 0; i < n; i++) {
        var fn = 'Ash';
        try { var g = this.genNameForOrigin('village', true); if (g && g.name) fn = firstOf(g.name); } catch (e) {}
        raiders.push(fn);
      }
      this.state.pendingRaidDefense = { villageId: v.id, champion: faces.champion.name, raiders: raiders, demand: 2000, day: day };
      this.say(`🌙 Night. Shouts from the treeline — ${faces.champion.name} of ${v.name} with ${raiders.length} others, and they're not here to talk. "Your pantry or your blood. Choose." (They want ~2,000 kcal.)`);
      try { if (this.journalNote) this.journalNote('village', 'raid', `${faces.champion.name} of ${v.name} raids Haven's treeline — demands ~2,000 kcal.`); } catch (e) {}
    },

    // answerRaidDefense: give (they leave, they'll be back), hold (the
    // standoff — they count your spears, you count theirs), fight (blood,
    // mirrored from the conquest raid's own costs).
    answerRaidDefense(how) {
      var pr = this.state.pendingRaidDefense;
      if (!pr) return null;
      this.state.pendingRaidDefense = null;
      var v = null;
      try { v = this._otherVillage(pr.villageId); } catch (e) {}
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      var nm = (v && v.name) || 'nowhere';
      var op = function (d) { try { if (this._nudgeOpinion) this._nudgeOpinion(pr.villageId, d); } catch (e) {} }.bind(this);
      if (how === 'give') {
        var removed = 0;
        try { removed = this._removePantryKcal ? (this._removePantryKcal(pr.demand) || 0) : 0; } catch (e) {}
        if (v) v.pantryKcal = (v.pantryKcal || 0) + removed;
        op(-5);
        this.say(`You pay. ${removed.toLocaleString()} kcal changes hands in the dark, and ${pr.champion}'s people melt back into the trees with it. They'll be back — hunger doesn't learn manners. (Opinion -5.)`);
        try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'raid-gave:' + pr.villageId + ':' + removed); } catch (e) {}
        return 'gave';
      }
      if (how === 'hold') {
        var fighters = 0;
        try { fighters = (this.state.village.roster || []).length; } catch (e) {}
        var theirs = pr.raiders.length + 1;
        this.say(`You walk out to the treeline with everyone who can hold a spear. "${pr.champion}," you call. "Count them." They count. You count them back.`);
        if (fighters >= theirs) {
          op(-3);
          this.say(`${pr.champion} looks at your line a long moment. "...Not tonight." They melt back into the trees. Nobody bled. Everybody understands what almost happened. (Opinion -3.)`);
          try { if (this.recordMoment) this.recordMoment(`Haven held the treeline against ${nm} — no blood.`); } catch (e) {}
          return 'held';
        }
        var taken = 0;
        try { taken = this._removePantryKcal ? (this._removePantryKcal(1500) || 0) : 0; } catch (e) {}
        if (v) v.pantryKcal = (v.pantryKcal || 0) + taken;
        op(-10);
        this.say(`They come anyway — you're outnumbered and they know it. The scuffle is short and ugly. They take ${taken.toLocaleString()} kcal for your defiance, on top of everything. (Opinion -10.)`);
        try { if (this.journalNote) this.journalNote('village', 'raid', `Held the treeline vs ${nm}, outnumbered — lost ${taken} kcal.`); } catch (e) {}
        return 'overrun';
      }
      // fight: blood. Muster like the conquest raid; pay like it too.
      var muster = [];
      try { muster = this._musterAway ? this._musterAway(4, 'defense') : []; } catch (e) {}
      if (muster.length < 2) {
        this.say(`Not enough fighters to drive them off — Haven needs at least two besides you. The treeline holds its breath. (Give, or hold.)`);
        this.state.pendingRaidDefense = pr; // the beat stays open
        return 'no-fighters';
      }
      var dead = [], wounded = [];
      for (var i = 0; i < muster.length; i++) {
        var r = R();
        if (r < 0.15) dead.push(muster[i]);
        else if (r < 0.45) wounded.push(muster[i]);
      }
      for (var di = 0; di < dead.length; di++) {
        var dnm = 'Someone';
        try { dnm = String(this.displayName(dead[di])); } catch (e) {}
        try { this.registerDeath({ kind: 'person', villagerId: dead[di], name: dnm, cause: 'raid-defense' }); } catch (e) {}
      }
      var wounds = this.state.homeWounds = this.state.homeWounds || {};
      for (var wi = 0; wi < wounded.length; wi++) wounds[wounded[wi]] = day + 7;
      var theirDead = 1 + Math.floor(R() * 2);
      if (v) {
        v.population = Math.max(2, (v.population || 3) - theirDead);
        var inner = this._vaInner(v);
        inner.tension = Math.min(100, inner.tension + 20);
      }
      op(-25);
      var costLine = (dead.length ? dead.length + ' dead' : 'no dead') + (wounded.length ? ', ' + wounded.length + ' wounded for a week' : ', none wounded');
      this.say(`⚔️ You drive them off. The cost, said plainly: ${costLine}. ${theirDead} of theirs don't get up. ${pr.champion} carries the hate back to ${nm} personally. (Opinion -25.)`);
      try { if (this.journalNote) this.journalNote('village', 'raid', `Drove off ${nm}'s raid: ${costLine}; ${theirDead} of theirs dead.`); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('villageAgency', 'raid-fought:' + pr.villageId); } catch (e) {}
      return 'fought';
    },

    // queueVillageEventRumor: their inner life reaches you through the rumor
    // pipeline — delayed, possibly wrong, never omniscience. Only villages
    // you know (heard-of or visited). Linked fires travel faster and truer.
    queueVillageEventRumor(villageId, kind, opts) {
      opts = opts || {};
      var v = null;
      try { v = this._otherVillage(villageId); } catch (e) {}
      if (!v) return null;
      var known = false;
      try { known = this.knowsVillage(v); } catch (e) {}
      if (!known) return null; // never omniscience
      var day = 0;
      try { day = (this.state.scholar || {}).day || 0; } catch (e) {}
      var linked = null;
      try { linked = this.linkWith(v.id); } catch (e) {}
      var delay = linked ? 1 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
      var wrong = R() < (linked ? 0.2 : 0.35);
      var text = this._vaRumorText(v, kind, wrong, opts);
      if (!text) return null;
      var s = this.state.scholar || {};
      s.rumors = s.rumors || [];
      s.rumors.push({ type: 'village_event', kind: kind, villageId: v.id, text: text, day: day, deliverDay: day + delay, wrong: wrong, delivered: false });
      return true;
    },

    // _vaRumorText: the traveler's word. Wrong variants are plausible, not
    // random — the distortion has a shape, and visiting corrects it.
    _vaRumorText(v, kind, wrong, opts) {
      opts = opts || {};
      var faces = this.ensureFaces(v) || { leader: { name: 'Ash' }, speaker: { name: 'Ash' }, champion: { name: 'Ash' } };
      var nm = v.name || 'a village';
      var dir = 'the wilds';
      try { dir = this.directionTo(4, 4, v.x || 4, v.y || 4); } catch (e) {}
      if (kind === 'famine') {
        if (wrong) return `A traveler swears ${nm}, ${dir}, is feasting — a whole elk, they say. (They're wrong. ${nm} is starving.)`;
        return `A traveler from ${dir} says ${nm} is starving — ${faces.speaker.name}'s been seen counting empty jars, and the kids have gone quiet.`;
      }
      if (kind === 'succession') {
        var c = (v.inner && v.inner.crisis) || { claimants: ['Ash', 'River'], deadLeader: faces.leader.name };
        if (wrong) return `Word from ${nm}: ${c.deadLeader} was killed — ${c.claimants[0] || 'someone'} did it, they say. (The truth: dead is dead; the killing part is gossip.)`;
        return `Word from ${nm}: ${c.deadLeader} is dead, and ${(c.claimants || []).slice(0, 2).join(' and ')} both claim the fire. ${nm} is choosing — or fighting.`;
      }
      if (kind === 'schism') {
        var cause = opts.cause || 'unknown';
        var causeWord = { cannibal: 'the eaters walked', 'famine-flight': 'the hungry walked', hardline: 'the hardliners walked', peaceful: 'the peacemakers walked', 'succession-loser': 'the losers walked' }[cause] || 'a faction walked';
        var nv = null;
        try { nv = this._otherVillage(opts.newVillageId); } catch (e) {}
        if (wrong) return `A traveler says ${nm} burned — the whole fire, gone. (Wrong. It split: ${causeWord}. ${nv ? nv.name + ' is the new fire.' : ''})`;
        return `${nm} has split — ${causeWord}. ${nv ? 'They call the new fire ' + nv.name + '.' : ''} Half of them were headed this way, or so the traveler says.`;
      }
      return null;
    },
  };

  for (var k in methods) G[k] = methods[k];

  // ---------- WRAPS ----------

  // hierarchyDaily rides membershipDaily at the day boundary. The villages'
  // inner lives ride with it — one lived day per village per day.
  var _hierarchyDaily = G.hierarchyDaily;
  if (_hierarchyDaily) {
    G.hierarchyDaily = function () {
      var r = _hierarchyDaily.apply(this, arguments);
      try { if (this.villageAgencyDaily) this.villageAgencyDaily(); } catch (e) {}
      return r;
    };
  }

  // deliverVillageRumors: one rumor a day. Village-event rumors queue behind
  // discovery rumors and deliver when due — delayed by deliverDay, which the
  // queue sets at event time.
  var _deliverVillageRumors = G.deliverVillageRumors;
  if (_deliverVillageRumors) {
    G.deliverVillageRumors = function () {
      var r = _deliverVillageRumors.apply(this, arguments);
      try {
        if (r) return r; // one rumor a day
        var s = this.state.scholar || {};
        var day = s.day || 0;
        var rumors = s.rumors || [];
        for (var i = 0; i < rumors.length; i++) {
          var ru = rumors[i];
          if (ru && ru.type === 'village_event' && !ru.delivered && (ru.deliverDay || 0) <= day) {
            ru.delivered = true;
            this.say(`🧳 ${ru.text}`);
            try { if (this.journalNote) this.journalNote('village', 'rumor', ru.text); } catch (e) {}
            return true;
          }
        }
      } catch (e) {}
      return false;
    };
  }
})();
