// @ontology
// system: justice
// description: Village justice + combat dialogue. Crimes have consequences.
// provides:
//   - recordCrime(type, opts)
//   - justiceState()
//   - justiceTick()
//   - justiceConfront(vid)
//   - justiceHeat()
//   - justiceStage()
//   - startVillageUprising()
//   - uprisingAftermath()
// rules:
//   - one_ladder: cold shoulder -> confrontation -> moot -> uprising; the moot is the ONE formal track (code: justiceTick)
//   - confrontation_first: heat 50+ holds the formal track until the ladder demands the moot — refusal, silence-timeout, or heat 70+ (code: considerPlayerAccusation, justiceTick)
//   - refused_payment_not_taken: a failed restitution offer costs nothing — refused food stays in the pack (code: justiceRespond)
//   - judged_heat_halved: judged crimes (caseId set) count half heat — the village remembers but never re-tries: no double jeopardy (code: justiceHeat)
//   - summons_voice: the moot demand is generated from the confronter's identity + the strongest witnessed crime + why it's happening now; never names unwitnessed crimes (code: justiceDemandMoot)
//   - accuser_aftermath: the verdict moves the accuser's standing too — weak cases cost them, held cases earn them respect (code: mootAccuserAftermath)
// consumes:
//   - village.laws
//   - scholar.crimes
/* VILLAGE JUSTICE + COMBAT DIALOGUE
 *
 * Two systems, one file:
 *
 * 1. VILLAGE JUSTICE — antisocial behavior escalates along ONE ladder. The village
 *    doesn't just lower a trust number; it goes quiet (cold shoulder), confronts
 *    you (restitution or else), and then goes formal: the moot in betrayal.js is
 *    the single formal resolution — no parallel exile vote, no double jeopardy.
 *    While the moot has you, the ladder freezes; nobody gets mobbed mid-trial.
 *    Exile is enforced, defiance ends in the uprising. Every stage is earned,
 *    visible in advance, and has an amends path — until there isn't one.
 *
 * 2. COMBAT DIALOGUE — on your turn you can TALK instead of striking. Beg,
 *    intimidate, reason, lie, bribe, taunt. Hostiles talk back on their turns.
 *    Desperate words from scared people, not Diplomacy +5.
 *
 * Self-attaching module: no edits to game.js. Wraps a few methods.
 */
(function () {
  'use strict';
  const G = (typeof globalThis !== 'undefined' && globalThis.Scattering && globalThis.Scattering.Game)
    ? globalThis.Scattering.Game
    : (typeof Game !== 'undefined' ? Game : null);
  if (!G) return;

  const methods = {

    // ================= VILLAGE JUSTICE =================

    justiceState() {
      const v = this.state.village;
      v.justice = v.justice || { stage: 0, crimes: [], confrontedBy: null, confrontRefused: false, exiled: false, exileDay: null, amendsCredit: 0, warned: false };
      return v.justice;
    },

    // Record a crime the PLAYER committed. Called via wrappers below.
    recordCrime(type, opts) {
      opts = opts || {};
      const j = this.justiceState();
      // dedupe: same type+victim within the same day part isn't a new crime
      const key = type + ':' + (opts.victim || '') + ':' + this.state.scholar.day + ':' + this.dayPart;
      if (j.crimes.some(c => c.key === key)) return;
      j.crimes.push(Object.assign({ type, day: this.state.scholar.day, key }, opts));
    },

    // Heat: 0-100ish. Murders don't decay. Theft heat fades as trust recovers
    // only via amends — the village remembers, but it can forgive.
    // Unwitnessed murders are unsolved: the village doesn't know, so no
    // heat — but the crime stays on the books for the detective/moot path.
    // NO DOUBLE JEOPARDY (Steve 2026-10-06): a crime the moot already
    // judged (caseId set) counts HALF heat. The village remembers — a
    // judged killing keeps the fire cold — but it doesn't re-confront or
    // re-moot you over the same crime forever. Before this, an acquittal
    // left heat at full, and the ladder re-confronted every tick: an
    // infinite harassment loop with no recovery.
    justiceHeat() {
      const j = this.justiceState();
      const v = this.state.village;
      let heat = 0;
      for (const c of j.crimes) {
        const judged = !!c.caseId;
        const w = judged ? 0.5 : 1;
        if (c.type === 'murder') heat += (c.witnessed === false ? 0 : (c.justified ? 15 : 40)) * w;
        // (Steve 2026-10-06): an attack nobody saw is unsolved like the murder
        // it opened — the opening 'attack' is marked witnessed:false at tbEnd
        // when the victim dies unseen (party.js). No heat; stays on the books.
        else if (c.type === 'attack') heat += (c.witnessed === false ? 0 : 20) * w;
        // theft/intimidation: real heat, but the village can forgive —
        // amends credit wears it down, unlike murder.
        else if (c.type === 'theft') heat += 15 * w;
        else if (c.type === 'intimidation') heat += 15 * w;
      }
      // theft: net takes far beyond gives
      const takes = (v.takes && v.takes[this.villagerId]) || 0;
      const gives = (v.gives && v.gives[this.villagerId]) || 0;
      const net = gives - takes;
      if (net < -15000) heat += 25;
      else if (net < -5000) heat += 10;
      // ambient: everyone already distrusts you
      const roster = (v.roster || []).filter(id => id !== this.villagerId);
      if (roster.length) {
        const avg = roster.reduce((s, id) => s + (((v.trust || {})[id]) || 10), 0) / roster.length;
        if (avg < 5) heat += 25;
        else if (avg < 10) heat += 15;
      }
      heat -= (j.amendsCredit || 0);
      return Math.max(0, Math.round(heat));
    },

    justiceStage() { return this.justiceState().stage || 0; },
    justiceExiled() { return !!this.justiceState().exiled; },

    // Cold shoulder: kindness lands softer. The village has gone quiet.
    justiceCold() { return this.justiceStage() >= 1; },

    justiceTick() {
      if (this.over || this.tbfight) return;
      const j = this.justiceState();
      // UNIFIED PIPELINE: while the moot has you, the village waits. No
      // parallel escalation, no mobbing someone mid-trial, no cooling either.
      // (betrayal.js may not be loaded in some unit tests — degrade cleanly.)
      if (typeof this.playerCaseOpen === 'function') {
        try { if (this.playerCaseOpen()) return; } catch (e) {}
      }
      const heat = this.justiceHeat();
      // STAGE 0 -> 1: cold shoulder
      if (j.stage === 0 && heat >= 25) {
        j.stage = 1;
        this.say('Something has shifted. Conversations stop when you approach the fire. Nobody meets your eyes for long.');
        try { if (this.journalNote) this.journalNote('village', 'mood', 'The village has gone quiet around me. I know why.'); } catch (e) {}
        return;
      }
      // STAGE 1 -> 2: confrontation
      if (j.stage === 1 && heat >= 50 && !j.confrontedBy) {
        j.stage = 2;
        this.justiceConfront();
        return;
      }
      // STAGE 2 -> 3: refused, or heat keeps climbing -> the village goes formal.
      // The moot (betrayal.js) is the ONE formal track. No parallel exile vote,
      // no double jeopardy: one crime spree, one trial.
      // Silence times out: two days with a pending confrontation and no answer
      // counts as refusal — the village won't wait on you forever.
      if (j.stage === 2 && j.pendingConfront && !j.mootDemanded) {
        const day = this.state.scholar.day;
        if (day - (j.confrontDay || day) >= 2) {
          const cname = j.confrontedBy ? this.displayName(j.confrontedBy) : 'The village';
          this.say(`⚖ ${cname} waited two days for your answer. None came. "Silence is an answer too."`);
          j.confrontRefused = true;
          j.silenceRefused = true; // the summons should know you went quiet, not loud
          j.pendingConfront = false;
        }
      }
      if (j.stage === 2 && (j.confrontRefused || heat >= 70)) {
        j.stage = 3;
        if (!j.mootDemanded) {
          j.mootDemanded = true;
          this.justiceDemandMoot();
        }
        return;
      }
      // STAGE 3 -> 4: exiled but still here (moot exile defied), or unforgivable
      // heat with no trial pending -> the village comes at you with numbers.
      const atHaven = this.map && this.map.px === 3 && this.map.py === 3;
      if (j.stage === 3 && j.exiled && atHaven) {
        j.stage = 4;
        this.startVillageUprising('defied exile');
        return;
      }
      if (j.stage < 4 && heat >= 95) {
        j.stage = 4;
        this.startVillageUprising('unforgivable');
        return;
      }
      // Cooling: heat dropped back down via amends -> stage relaxes (not below 1 if crimes stand)
      if (j.stage === 1 && heat < 20) {
        j.stage = 0;
        this.say('The air thins a little. Someone nods at you by the fire. Maybe it blows over.');
      }
    },

    // Pick who confronts you: bold first, then leadership-goal, then anyone brave enough.
    justicePickConfronter() {
      const v = this.state.village;
      const roster = (v.roster || []).filter(id => id !== this.villagerId);
      if (!roster.length) return null;
      const score = (id) => {
        let s = 0;
        const t = this.npcTemper(id);
        if (t === 'bold') s += 3; else if (t === 'prickly' || t === 'intense') s += 2; else if (t === 'cautious' || t === 'withdrawn') s -= 2;
        if (this.npcGoal(id) === 'lead') s += 2;
        s += Math.random();
        return s;
      };
      return roster.slice().sort((a, b) => score(b) - score(a))[0];
    },

    justiceConfront() {
      const j = this.justiceState();
      const vid = this.justicePickConfronter();
      if (!vid) return;
      j.confrontedBy = vid;
      j.pendingConfront = true;
      // CONFRONTATION TIMEOUT (Steve 2026-10-06): silence is an answer too.
      // Ignoring the confronter doesn't stall the ladder — two days with no
      // answer and the village goes formal on its own.
      j.confrontDay = this.state.scholar.day;
      const name = this.displayName(vid);
      const crimes = j.crimes || [];
      // KNOWLEDGE-GATED (Steve 2026-10-06): crimes nobody saw (witnessed ===
      // false) stay on the books for the detective/moot path but NEVER enter
      // the confrontation voice — "everyone knows whose hands" is a lie when
      // the woods kept your secret.
      const known = crimes.filter(c => c.witnessed !== false);
      const murders = known.filter(c => c.type === 'murder').length;
      const attacks = known.filter(c => c.type === 'attack').length;
      const thefts = known.filter(c => c.type === 'theft').length;
      // CONFRONTATION VOICE (Steve 2026-10-06, pool expansion 2->identity):
      // the confrontation is generated from WHO confronts you — temperament,
      // how close you were, and what the village actually knows (the
      // confrontation names only recorded crimes — never invented ones).
      // A close friend's hurt reads different from a stranger's anger; a
      // cautious person doesn't block your path, they corner you at the fire.
      const R = Math.random;
      const pick = (arr) => arr[Math.floor(R() * arr.length)];
      const trust = ((this.state.village || {}).trust || {})[vid] || 10;
      const close = trust >= 40;
      const temp = String((this.npcTemper && this.npcTemper(vid)) || 'steady').toLowerCase();
      const wary = (temp === 'cautious' || temp === 'withdrawn');
      let line;
      if (murders > 0) {
        line = pick([
          `${name} steps in front of you. "We know what you did. Say it wasn't you — go on, try." Their hands are shaking. Not from fear. "You pay it back, or you go. Those are the choices."`,
          close ? `${name} finds you alone, away from the fire. "Tell me it wasn't you." A pause — you can see them hoping. "Please. Tell me it wasn't you."` : null,
          `${name} doesn't raise their voice. That's how you know it's serious. "Someone's dead. And everyone knows whose hands. Talk."`,
        ].filter(Boolean));
      } else if (attacks > 0) {
        line = pick([
          `${name} plants themself in your way, jaw set. "You put hands on one of ours. That doesn't wash off with an apology — but an apology is where it starts."`,
          wary ? `${name} waits until the fire's low and it's just you two. "I saw what happened. I'm not here to fight — I'm here because next time, someone won't ask first."` : null,
          close ? `${name} looks sick. "I told them you wouldn't — I said that, out loud, to people. Don't make me the fool here. Fix it."` : null,
        ].filter(Boolean));
      } else if (thefts > 0) {
        line = pick([
          `${name} blocks your path. "We need to talk about the stores. About what you've been taking." A few others are watching, not approaching. "Make it right, or leave. Your call."`,
          close ? `${name} won't look at you. "The stores. I covered for you once — told them it was a miscount. Don't make me a liar too."` : null,
          `${name} corners you by the stores, voice low. "Count it with me. Right now. If I'm wrong I'll say so in front of everyone."`,
        ].filter(Boolean));
      } else {
        line = pick([
          `${name} steps close. "Something's off and everyone's felt it. I drew the short straw — so here I am. Talk to me before the village decides it doesn't need to."`,
          close ? `${name} sits down next to you like nothing's wrong, which is how you know everything is. "People are talking. I wanted you to hear it from me first."` : null,
          wary ? `${name} catches your eye across the fire and tilts their head — follow me. Away from everyone: "I'm asking as a friend, not the village. What happened?"` : null,
        ].filter(Boolean));
      }
      this.say('⚖ ' + line);
      this.say('(Find them and answer — pay restitution, or refuse. Attacking them answers too.)');
      try { this.audioEvent('confront'); } catch (e) {}
    },

    // Is this vid the one waiting for your answer?
    justicePendingConfront(vid) {
      const j = this.justiceState();
      return !!(j.pendingConfront && j.confrontedBy === vid && j.stage === 2);
    },

    justiceRestitutionOwed() {
      const j = this.justiceState();
      const murders = j.crimes.filter(c => c.type === 'murder' && !c.justified).length;
      const attacks = j.crimes.filter(c => c.type === 'attack').length;
      // food kcal owed: murder is nearly unpayable; theft is payable
      return murders * 6000 + attacks * 2000 + 1500;
    },

    // Player answers the confrontation: 'pay' | 'refuse'
    justiceRespond(choice) {
      const j = this.justiceState();
      // No pending confrontation, no answer: the button only renders while
      // justicePendingConfront is true, but the function must not double-charge.
      if (!j.pendingConfront || !j.confrontedBy) return null;
      const vid = j.confrontedBy;
      const name = vid ? this.displayName(vid) : 'They';
      if (choice === 'pay') {
        const owed = this.justiceRestitutionOwed();
        // Plan the payment BEFORE moving anything. The fiction is they LOOK
        // at what you offer and refuse it — refused food stays in your pack.
        // (Before 2026-10-06 the food was moved to the pantry first, so a
        // failed offer cost you the food AND the confrontation. "They didn't
        // accept it" has to mean they didn't take it.)
        const inv = this.state.scholar.inventory || [];
        const plan = [];
        let paid = 0;
        for (const it of inv) {
          if (paid >= owed) break;
          const kcalEach = it.kcalEach || 0;
          if (kcalEach <= 0 || !(it.units > 0)) continue;
          const need = owed - paid;
          const takeUnits = Math.min(it.units, Math.ceil(need / kcalEach));
          if (takeUnits <= 0) continue;
          plan.push([it, takeUnits]);
          paid += takeUnits * kcalEach;
        }
        if (paid < owed * 0.5) {
          this.say(`${name} looks at what you offer. "That's not enough. Not close." The confrontation isn't over.`);
          return { paid, enough: false };
        }
        // pay from inventory food first, then pantry contribution credit
        for (const [it, takeUnits] of plan) {
          it.units -= takeUnits;
          try { this.addPantryKcal ? this.addPantryKcal(takeUnits * (it.kcalEach || 0)) : null; } catch (e) {}
        }
        // clean up emptied stacks
        this.state.scholar.inventory = inv.filter(i => (i.units || 0) > 0);
        j.amendsCredit = (j.amendsCredit || 0) + Math.round(paid / 100);
        j.pendingConfront = false;
        j.confrontedBy = null;
        j.confrontRefused = false;
        j.silenceRefused = false;
        // heat recompute may drop them back to cold shoulder or peace
        const heat = this.justiceHeat();
        j.stage = heat >= 25 ? 1 : 0;
        this.say(`${name} takes it. Counts it. The watchers drift back to the fire. "We're watching," ${name} says. But it's over — for now.`);
        try { this.observe('amends', { target: vid }); } catch (e) {}
        for (const rid of (this.state.village.roster || [])) {
          if (rid !== this.villagerId) this.bumpTrust(rid, 4);
        }
        return { paid, enough: true };
      }
      // refuse
      j.pendingConfront = false;
      j.confrontRefused = true;
      this.say(`"Then go." ${name} doesn't raise their voice. That's worse. "We'll decide it without you."`);
      return { refused: true };
    },

    // The village goes formal: hand the case to the moot (betrayal.js).
    // There is exactly one formal track — this never holds its own vote.
    // SUMMONS VOICE (Steve 2026-10-06): the demand is generated from WHO
    // demands it (temperament, how close you were — the unique-person law),
    // WHAT the village can actually prove (strongest witnessed crime only;
    // the summons never names an unwitnessed crime or a suspicion —
    // knowledge gating runs both ways), and WHY it's happening now
    // (refused outright, two days of silence, or the heat just kept
    // climbing past talking). The confrontation beat is personal; the
    // summons is the village going public. Sibling of the confrontation
    // voice — the old single generic line is gone.
    justiceDemandMoot() {
      const j = this.justiceState();
      const vid = j.confrontedBy;
      const v = this.state.village;
      const alive = !!(vid && (v.roster || []).includes(vid));
      const name = alive ? this.displayName(vid) : 'The village';
      // what the village can prove: strongest witnessed crime on the books,
      // not yet judged. forcePlayerAccusation charges this same set — the
      // summons never gets ahead of the evidence.
      const rank = { murder: 4, attack: 3, theft: 2, intimidation: 1 };
      const provable = (j.crimes || []).filter(c => rank[c.type] && c.witnessed !== false && !c.caseId);
      const serious = provable.sort((a, b) => (rank[b.type] || 0) - (rank[a.type] || 0))[0];
      const chargeWord = !serious ? 'what you\'ve done' :
        serious.type === 'murder' ? 'the killing' :
        serious.type === 'attack' ? 'the attack' :
        serious.type === 'theft' ? 'the thefts' : 'the threats';
      const reason = j.silenceRefused ? 'silence' : (j.confrontRefused ? 'refused' : 'heat');
      const temp = alive ? String((this.npcTemper && this.npcTemper(vid)) || 'steady').toLowerCase() : 'steady';
      const trust = alive ? (((v.trust || {})[vid]) || 10) : 10;
      const close = trust >= 40;
      const wary = (temp === 'cautious' || temp === 'withdrawn');
      const bold = (temp === 'bold' || temp === 'intense');
      const R = Math.random;
      const pick = (arr) => arr[Math.floor(R() * arr.length)];
      const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
      let line;
      if (reason === 'silence') {
        line = pick([
          `${name} waited two days for your answer. None came — so the question goes to everyone. "${cap(chargeWord)}, in the open. Be there, or don't. It happens either way."`,
          close ? `${name} doesn't look at you when they say it. "I waited. Two days. The moot hears ${chargeWord} — all of it, in the open."` : null,
          `${name} stands. "Silence is an answer. Fine. Here's ours: a moot. ${cap(chargeWord)}, in the open, where silence doesn't work."`,
        ].filter(Boolean));
      } else if (reason === 'refused') {
        line = pick([
          bold ? `${name} stands, and the fire goes quiet around them. "No more talking around it. ${cap(chargeWord)} gets a moot — all of it, in the open. You said no to me. Say it to everyone."` : null,
          wary ? `${name} says it low, and the low carries. "There'll be a moot. ${cap(chargeWord)} — in the open. I asked you quiet. You chose loud."` : null,
          close ? `${name} looks sick saying it. "I asked you as —" A breath. "There's a moot. ${cap(chargeWord)}, in the open. I didn't want this."` : null,
          serious && serious.type === 'murder' ? `${name}'s voice doesn't shake. That's how you know. "A moot. For the killing. In the open, where everyone has to hear it."` : null,
          serious && serious.type === 'attack' ? `${name} doesn't dress it up. "You put hands on one of ours. The moot hears ${chargeWord} — all of it, in the open."` : null,
          serious && serious.type === 'theft' ? `${name} looks around the fire. "The stores. The counts. All of it — in the open. There's a moot."` : null,
          serious && serious.type === 'intimidation' ? `${name} keeps their voice level. "Threats stop working when everyone hears them. A moot — in the open."` : null,
          // nothing provable (shouldn't happen — the accusation would bail):
          // the old generic line, kept as the last resort only.
          !serious ? `${name} looks around the fire. "No more talking around it. There'll be a moot — all of it, in the open."` : null,
        ].filter(Boolean));
      } else {
        // heat climbed past talking: the confronter never even got their answer
        line = pick([
          `"It's past asking," ${name} says. "The fire hears ${chargeWord} — tonight, in the open."`,
          close ? `${name} won't meet your eyes. "I was going to talk to you. It's past that now. The moot hears ${chargeWord} — in the open."` : null,
          `${name} doesn't bother with preamble. "A moot. ${cap(chargeWord)}. In the open."`,
        ].filter(Boolean));
      }
      // last resort: never render "undefined" — a broken summons line is
      // worse than a plain one.
      if (!line) line = `${name} looks around the fire. "No more talking around it. There'll be a moot — all of it, in the open."`;
      this.say('⚖ ' + line);
      try { if (this.journalNote) this.journalNote('village', 'moot', 'They demanded a moot. Formal. No more hallway justice.'); } catch (e) {}
      if (typeof this.forcePlayerAccusation === 'function') {
        try { this.forcePlayerAccusation(); } catch (e) {}
      }
      // if betrayal.js isn't loaded the demand stands as a flag; the real
      // game always loads betrayal.js after justice.js.
    },

    // Called by the moot (betrayal.js) when a case against the player resolves.
    // Re-syncs the single ladder: the formal track is done, social pressure
    // resumes from the new reality. No double jeopardy, no double exile.
    syncJusticeAfterMoot(path) {
      const j = this.justiceState();
      j.mootDemanded = false;
      j.confrontRefused = false;
      j.silenceRefused = false;
      j.confrontedBy = null;
      j.pendingConfront = false;
      // MOOT AFTERMATH: SOCIAL CONSEQUENCES (Steve 2026-10-06). The verdict
      // lands on the ACCUSER too, not just the accused — consequences are
      // real and social, not mechanical. A case the fire wouldn't hold costs
      // the accuser standing; a case that held earns them respect; a case
      // that split the village costs them. The player SEES it happen — the
      // ceremony promised "everyone will remember it," so the aftermath
      // narrates the remembering, and the village gossip system carries it
      // into reputation. Sibling of the verdict's own vote-memory lines.
      try { this.mootAccuserAftermath(path); } catch (e) {}
      if (path === 'exile' || path === 'player_exile' || path === 'fled') {
        j.stage = 3; // exiled: enforcement + defiance rules apply
        return;
      }
      const heat = this.justiceHeat();
      j.stage = heat >= 25 ? 1 : 0; // acquittal / weregild / schism / cold war
    },

    // The accuser's standing moves with the verdict they called for.
    mootAccuserAftermath(path) {
      // find the case that just resolved against the player
      let c = null;
      try {
        const cases = (this.betrayalState() || {}).cases || [];
        for (let i = cases.length - 1; i >= 0; i--) {
          const x = cases[i];
          if (x && x.accused && x.accused.includes(this.villagerId) &&
              (x.status === 'resolved' || x.status === 'acquitted')) { c = x; break; }
        }
      } catch (e) {}
      if (!c || !c.accuser) return;
      const accuser = c.accuser;
      if (this.isPlayer && this.isPlayer(accuser)) return;
      if (!((this.state.village || {}).roster || []).includes(accuser)) return;
      const name = this.displayName(accuser);
      const trust = (((this.state.village || {}).trust || {})[accuser]) || 10;
      const close = trust >= 40;
      const R = Math.random;
      const pick = (arr) => arr[Math.floor(R() * arr.length)];
      const heardBy = (((c.trial || {}).present) || [])
        .filter(id => id !== this.villagerId && id !== accuser).slice(0, 5);
      if (path === 'acquitted') {
        // the fire wouldn't hold it — the accuser overreached, and the
        // village saw. Costs more when they were your friend: the village
        // watched a friendship burn for nothing.
        this.bumpTrust(accuser, close ? -12 : -8);
        try { this.remember(accuser, 'moot_weak_case', `brought a case against you the fire wouldn't hold (${c.charge || 'unknown charge'})`); } catch (e) {}
        try { this.recordGrievance(this.villagerId, accuser, 'false_accusation', 18); } catch (e) {}
        try { this.seedGossip('moot_weak_case', { honest: -8, competent: -8, who: accuser }, heardBy); } catch (e) {}
        this.say(pick([
          `The count falls short — and some eyes turn to ${name}. They brought this. Dragged everyone to the fire for it. The fire remembers that too.`,
          `${name} doesn't meet anyone's eyes. A case the village wouldn't hold — that's on the one who called it.`,
          close ? `${name} looks at you across the cooling fire, and something between you is over. They called a moot on you — and the fire said no.` : null,
        ].filter(Boolean)));
      } else if (path === 'weregild' || path === 'exile' || path === 'player_exile') {
        // the case held — the accuser stood up when it counted
        this.bumpTrust(accuser, 6);
        try { this.remember(accuser, 'moot_case_held', `stood up at the moot and the fire agreed (${c.charge || 'unknown charge'})`); } catch (e) {}
        this.say(pick([
          `${name} doesn't gloat. Nobody thanks them out loud. But the nods they get by the fire, later — those are real.`,
          `Nobody says ${name} was right. Nobody has to. The way the fire settles says it.`,
        ]));
      } else { // schism, cold_war — the case divided the village
        this.bumpTrust(accuser, -4);
        try { this.remember(accuser, 'moot_split_fire', `called a moot that split the village (${c.charge || 'unknown charge'})`); } catch (e) {}
        this.say(`${name} got their moot. The village got two fires and the space between them. Nobody calls that a win — least of all ${name}.`);
      }
    },

    justiceExileGuards() {
      // Called when exiled player tries Haven-only comforts. Returns a refusal string or null.
      if (!this.justiceExiled()) return null;
      if (!(this.map && this.map.px === 3 && this.map.py === 3)) return null;
      return 'You\'re exiled. They watch you from the fire, hands on whatever\'s sharp. Take nothing.';
    },

    // VILLAGE UPRISING (Steve 2026-10-05): the village comes at you with numbers.
    // This is the end of the justice ladder — stage 4. You've stolen, attacked,
    // refused exile. Now they come. Anyone who still trusts you fights at your side.
    // Attackers are a MOB (2-4, lowest trust first, bold temperaments lead) — never
    // the whole roster folded into one fighter. The fight is built here, directly:
    // party.js's single-betrayer startBetrayalCombat takes ONE vid, not an army —
    // calling it with a roster produced a single 40-HP pseudo-fighter with a
    // comma-joined key and wiped _lastBetrayal. Fixed 2026-10-05 (brawler loop).
    startVillageUprising(reason) {
      if (this.tbfight) return null;
      // Defensive: never render a dev marker in the player-facing "Reason:" line.
      reason = String(reason || '').replace(/debug scenario:?\s*/i, '');
      const v = this.state.village;
      const s = this.state.scholar;
      const px = s.mx ?? 4, py = s.my ?? 4;
      const roster = (v.roster || []).filter(rid => rid !== this.villagerId);
      if (!roster.length) return null;
      const trustOf = (id) => ((v.trust || {})[id]) || 10;
      // Attackers: lowest trust first, bold temperaments lead. Cap at 4 — a mob, not an army.
      const attackers = roster.slice()
        .sort((a, b) => {
          const ta = this.npcTemper(a) === 'bold' ? -1000 : 0;
          const tb = this.npcTemper(b) === 'bold' ? -1000 : 0;
          return (trustOf(a) + ta) - (trustOf(b) + tb);
        })
        .slice(0, Math.min(4, Math.max(2, Math.ceil(roster.length / 3))));
      // Defenders: anyone who still trusts you (>= 60) stands WITH you. Earned.
      const defenders = roster.filter(id => !attackers.includes(id) && trustOf(id) >= 60).slice(0, 2);
      const detail = this.genDetail(this.map.px, this.map.py);
      const blocked = (x, y) => {
        const cell = detail[y] && detail[y][x];
        return this.cellProps(cell).blocks;
      };
      // UPRISING SPAWN (Steve 2026-10-06): every fighter gets their OWN tile.
      // The old code called freeSpotNear fresh per attacker with the same
      // anchor and no occupancy tracking, so the whole mob stacked on ONE
      // tile — a "mob" that read as one person, and in tight geometry could
      // body-block the player's only escape. Door tiles are never spawn
      // points: the door is the player's way out, it stays clear.
      const taken = new Set([px + ',' + py]);
      const freeSpotNear = (cx, cy) => {
        for (let r = 1; r <= 5; r++) {
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8 || taken.has(nx + ',' + ny)) continue;
            const cell = detail[ny] && detail[ny][nx];
            if (cell === 'door') continue; // the escape stays clear
            if (!blocked(nx, ny)) { taken.add(nx + ',' + ny); return { x: nx, y: ny }; }
          }
        }
        // No free tile in range: ring-offset fallback so fighters never stack.
        const fb = { x: Math.max(0, Math.min(8, cx + taken.size)), y: Math.max(0, Math.min(8, cy)) };
        taken.add(fb.x + ',' + fb.y);
        return fb;
      };
      const fighters = [{
        key: 'p', kind: 'player', name: 'You', emoji: '🧑',
        hp: s.health, maxHp: this.maxHealth ? this.maxHealth() : 100,
        speed: this.playerSpeed(), mx: px, my: py,
        alive: true, fled: false, moveLeft: 0, acted: false, aimed: false,
      }];
      for (const vid of attackers) {
        const spot = freeSpotNear(px + 2, py);
        const temp = this.npcTemper(vid);
        fighters.push({
          key: 'h_' + vid, kind: 'hostile', villagerId: vid,
          name: this.displayName(vid), emoji: '🔪',
          hp: 30, maxHp: 30, speed: 3, mx: spot.x, my: spot.y,
          alive: true, fled: false, moveLeft: 0, acted: false,
          ai: temp === 'bold' ? 'brave' : 'cautious',
          uprising: true,
        });
      }
      for (const vid of defenders) {
        const spot = freeSpotNear(px - 1, py + 1);
        fighters.push({
          key: 'v_' + vid, kind: 'villager', villagerId: vid,
          name: this.displayName(vid), emoji: '🧍',
          hp: 30, maxHp: 30, speed: 3, mx: spot.x, my: spot.y,
          alive: true, fled: false,
          ai: 'helpful', helped: false,
        });
      }
      this.tbfight = {
        fighters,
        order: (globalThis.Scattering.combat || {}).turnOrder
          ? globalThis.Scattering.combat.turnOrder(fighters)
          : fighters.map(f => f.key),
        turnIdx: 0, round: 1,
        over: false, result: null,
        betrayal: true, uprising: true, aggressor: 'npc',
        betrayer: attackers[0],
        uprisingAttackers: attackers.slice(),
      };
      this.say('');
      this.say('⚔️ THE UPRISING');
      this.say('They\'re coming. Torches in the dark. You can hear them — not shouting, just walking. That\'s worse.');
      this.say('');
      this.say(`Reason: ${reason}. You did this.`);
      this.say('');
      const anames = attackers.map(id => this.displayName(id)).join(', ');
      this.say(`⚔ ${anames} ${attackers.length > 1 ? 'come' : 'comes'} at you — not sneaking, not talking. Done talking.`);
      if (defenders.length) {
        this.say(`${defenders.map(id => this.displayName(id)).join(', ')} ${defenders.length > 1 ? 'step' : 'steps'} between you and them. "Not like this," someone says.`);
      } else {
        this.say('Nobody steps between. You earned this alone.');
      }
      this.say('');
      this.say('What do you do? FIGHT, FLEE, or TALK?');
      // FLEE is a real verb here, not a menu ghost — name the way out, plainly.
      // Violence in this game is desperate and traumatic, never casual; running
      // should read like tearing something, not like skipping a cutscene.
      if (s.insideHaven) {
        this.say('The doors are behind you. FLEE means through them — into the dark, don\'t stop, don\'t look back. There\'s nothing left in this hall worth turning around for.');
      } else {
        this.say('FLEE means the treeline. Walk to the edge of the clearing and push through — run like the dark is on fire. They might follow. Run anyway.');
      }
      this.sysSay('OH!!! THE VILLAGE IS DOING A JUSTICE!!! The audience is SO conflicted!!! The gamblers don\'t know WHO to bet on!!!');
      this.audioEvent('combatStart');
      // Seed aftermath context at combat START so flee/yield outcomes still resolve.
      // Set AFTER tbfight; nothing in this path overwrites _lastBetrayal again.
      this._lastBetrayal = {
        betrayer: attackers[0], aggressor: 'npc', uprising: true,
        uprisingAttackers: attackers.slice(),
        uprisingAllies: defenders.slice(),
        witnesses: defenders.slice(),
        betrayerDead: false,
        reason: reason,
      };
      try { this.villageEvent('uprising'); } catch (e) {}
      this.tbBeginTurn();
      return this.tbfight;
    },
    uprisingAftermath() {
      const lb = this._lastBetrayal || {};
      const result = lb.result || 'betrayal_won';
      const v = this.state.village;
      const attackers = lb.uprisingAttackers || [];
      const dead = attackers.filter(id => !(v.roster || []).includes(id));
      const alive = attackers.filter(id => (v.roster || []).includes(id));
      if (result === 'betrayal_won' || result === 'betrayal_routed') {
        // You survived the village's justice. Nothing is the same.
        this.say('It\'s over. The clearing is quiet in a way it has never been.');
        if (dead.length) {
          this.say(`${dead.map(id => this.displayName(id)).join(', ')} ${dead.length > 1 ? 'are' : 'is'} dead. By your hand. The village did this — and you finished it.`);
        }
        if (alive.length) {
          this.say(`${alive.map(id => this.displayName(id)).join(', ')} ${alive.length > 1 ? 'are' : 'is'} still breathing. They won't meet your eyes. They won't ever again.`);
          for (const id of alive) {
            const t = ((v.trust || {})[id]) || 0;
            if (v.trust) v.trust[id] = 0;
            try { this.npcNeeds(id).fear = 100; } catch (e) {}
          }
        }
        // The village doesn't attack again — it's broken. But it's not home anymore.
        const j = this.justiceState();
        j.stage = 4; j.exiled = true; j.broken = true;
        this.say('(The village won\'t rise again. There\'s nothing left to rise. Haven is yours the way a grave is yours.)');
        try { if (this.journalNote) this.journalNote('village', 'uprising', 'They came at me. All of them. I\'m still here. I don\'t know what that means.'); } catch (e) {}
      } else if (result === 'fled') {
        // You ran. That's a choice too, and the village will treat it as one —
        // consequences social and permanent, not a mechanical reset.
        this.say('You run. Behind you, the village — was the village. The exile is permanent now. There\'s no vote that brings you back from this.');
        const allies = lb.uprisingAllies || [];
        if (allies.length) {
          const anames = allies.map(id => this.displayName(id)).join(', ');
          this.say(`${anames} stood with you. The village saw. Whatever this cost you, it cost them more — don't forget who paid it.`);
        }
        this.say('Don\'t go back inside. There\'s nothing in there for you anymore.');
        for (const id of attackers) {
          if ((v.roster || []).includes(id) && v.trust) v.trust[id] = 0;
        }
        try { this.seedGossip('fled_uprising', { trustworthy: -15, brave: -10 }, attackers.slice(0, 3)); } catch (e) {}
        try { this.addTrauma(10); } catch (e) {}
        // Door-flee stashes the mob as "waiting monsters" (game.js) — but these
        // are villagers, not a monster pack, and the uprising is socially
        // resolved. Clear it, or the next building exit ambushes you with a
        // phantom bulldozer (startCombat(undefined) fallback).
        try { this.state.doorFledMonsters = null; } catch (e) {}
        const j = this.justiceState();
        j.stage = 4; j.exiled = true;
        try { if (this.journalNote) this.journalNote('village', 'uprising', 'I ran. They\'ll call it guilt. Let them. I\'m alive, and the world is big.'); } catch (e) {}
      } else if (result === 'betrayal_yielded') {
        // They yielded — the uprising collapses.
        this.say('One by one, they stop. Weapons lower. Someone is crying. The uprising ends not with victory but with exhaustion.');
        const j = this.justiceState();
        j.stage = 3; // back to exile, enforced by fear now
        for (const id of alive) {
          try { this.npcNeeds(id).fear = Math.min(100, (this.npcNeeds(id).fear || 0) + 40); } catch (e) {}
          this.bumpTrust(id, -30);
        }
      }
      this._lastBetrayal = null;
    },

    tbTalkTactics() {
      const t = [
        { id: 'beg', label: '🙏 Beg — "Please don\'t."' },
        { id: 'intimidate', label: '😠 Intimidate — "Back off."' },
        { id: 'reason', label: '🗣 Reason — "This isn\'t you."' },
      ];
      if (this.state.systemArrived) t.push({ id: 'lie', label: '🤥 Lie — "The System is watching."' });
      t.push({ id: 'bribe', label: '💰 Bribe — "Take everything."' });
      t.push({ id: 'taunt', label: '😏 Taunt — "Is that all?"' });
      return t;
    },

    tbPlayerTalk(targetKey, tactic) {
      const f = this.tbfight;
      if (!f || !this.tbIsPlayerTurn()) return false;
      const p = this.tbFighter('p');
      if (p.acted) { this.say('Already acted this turn.'); return false; }
      const t = this.tbFighter(targetKey);
      if (!t || !t.alive || t.fled) { this.say('No one there to talk to.'); return false; }
      if (t.kind !== 'hostile') {
        // Talking to a monster. The System appreciates the effort.
        p.acted = true;
        this.say('You try talking to it. It tilts its head. The moment passes.');
        this.sysSay('They tried DIPLOMACY on a GRIEF COUNSELOR!!! The audience is WHEEZING!!!');
        this.tbAfterPlayerAction();
        return true;
      }
      const vid = t.villagerId;
      const temp = this.npcTemper(vid);
      const hpFrac = t.hp / t.maxHp;
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      const dname = t.name;
      p.acted = true;
      const R = Math.random;
      if (tactic === 'beg') {
        const lines = [
          `"Please —" Your voice cracks. "I don't want to hurt you. I don't want this."`,
          `"Stop! Please!" Your hands are up, empty. "We don't have to do this."`,
        ];
        this.say('💬 ' + lines[Math.floor(R() * lines.length)]);
        const ch = 0.3 + (hpFrac < 0.5 ? 0.3 : 0) + (temp === 'gentle' || temp === 'warm' ? 0.2 : 0) - (temp === 'bold' ? 0.15 : 0);
        if (R() < ch) {
          t.talkStun = 1;
          this.say(`💬 ${dname} hesitates — weapon lowering a fraction. Not stopping. But listening.`);
        } else {
          this.say(`💬 ${dname} doesn't stop. ${temp === 'bold' ? '"Save it," they spit.' : 'They can\'t hear you over their own breathing.'}`);
        }
      } else if (tactic === 'intimidate') {
        const lines = [
          `"BACK OFF." You make yourself big. "You don't want to see what I do next."`,
          `"Walk away. Right now. Or I finish this." Your voice is flat. You mean it, and they can tell.`,
        ];
        this.say('💬 ' + lines[Math.floor(R() * lines.length)]);
        const hasRage = this.hasAbility && this.hasAbility('rage');
        const ch = 0.25 + (hpFrac < 0.4 ? 0.35 : 0) + (temp === 'cautious' ? 0.15 : 0) - (temp === 'bold' ? 0.2 : 0) + (hasRage ? 0.15 : 0);
        if (R() < ch) {
          t.fled = true;
          this.say(`💬 ${dname} breaks. Drops back, then runs — not brave enough for what you promised.`);
        } else {
          this.say(`💬 ${dname} bares their teeth. "Try me." It didn't work.`);
          if (temp === 'bold') { t.enraged = true; this.say(`💬 Something in ${dname} snaps louder. (enraged: hits harder)`); }
        }
      } else if (tactic === 'reason') {
        const lines = [
          `"This isn't you." You're breathing hard. "Think about what you're doing. Really think."`,
          `"We were —" You stop. Start again. "You don't have to be the person who does this."`,
        ];
        this.say('💬 ' + lines[Math.floor(R() * lines.length)]);
        const ch = 0.3 + (temp === 'steady' ? 0.15 : 0) + (trust >= 40 ? 0.2 : 0) + (hpFrac < 0.5 ? 0.15 : 0) - (temp === 'prickly' ? 0.15 : 0);
        if (R() < ch) {
          t.talkStun = 1;
          this.say(`💬 ${dname} falters. The weapon dips. "Don't — don't do that," they whisper. "Don't make me think."`);
        } else {
          this.say(`💬 ${dname} shakes their head, jaw tight. "Too late for that."`);
        }
      } else if (tactic === 'lie') {
        if (!this.state.systemArrived) { this.say('That lie needs the System to be true-ish.'); p.acted = false; return false; }
        this.say('💬 "The System is watching. You know what it does to people who waste good content." You almost believe it yourself.');
        const ch = 0.35 + (hpFrac < 0.5 ? 0.15 : 0);
        if (R() < ch) {
          t.talkStun = 1;
          this.say(`💬 ${dname} glances up — at the sky, at nothing. "It's always watching," they mutter. They've lost the thread.`);
          this.sysSay('WAIT. Are they using US as a threat?! The audience is DELIGHTED!!!');
        } else {
          this.say(`💬 ${dname} laughs, raw. "Then let it watch."`);
        }
      } else if (tactic === 'bribe') {
        // What can you actually offer? Food kcal from inventory.
        const inv = this.state.scholar.inventory || [];
        let offerKcal = 0;
        for (const it of inv) offerKcal += (it.kcalEach || 0) * (it.units || 0);
        if (offerKcal < 500) {
          this.say('💬 "Take everything I —" You look at your pack. There\'s nothing worth taking. The words die.');
          p.acted = false;
          return false;
        }
        const giveKcal = Math.min(offerKcal, 3000);
        // strip food from inventory
        let need = giveKcal;
        for (const it of inv) {
          if (need <= 0) break;
          const kcalEach = it.kcalEach || 0;
          if (kcalEach <= 0 || !(it.units > 0)) continue;
          const take = Math.min(it.units, Math.ceil(need / kcalEach));
          need -= take * kcalEach;
          it.units -= take;
        }
        this.state.scholar.inventory = inv.filter(i => (i.units || 0) > 0);
        this.say(`💬 "Take it. All of it." You drop your pack open. ${this.fmtKcal ? this.fmtKcal(giveKcal) : giveKcal + ' kcal'} of food, on the ground between you. "Just let me walk away."`);
        const ch = 0.5 + (hpFrac < 0.5 ? 0.2 : 0) + (temp === 'cautious' ? 0.1 : 0) - (temp === 'bold' ? 0.15 : 0);
        if (R() < ch) {
          this.say(`💬 ${dname} stares at the food. At you. Something breaks — or bends. They take it. They leave. Nobody's proud of this.`);
          // everyone hostile takes the deal and goes
          for (const x of f.fighters) if (x.kind === 'hostile' && x.alive) x.fled = true;
          try { this.observe('bribe_fight', { target: vid }); } catch (e) {}
        } else {
          this.say(`💬 ${dname} kicks the pack aside. "You think this is about FOOD?"`);
        }
      } else if (tactic === 'taunt') {
        this.say('💬 "Is that all?" You smile. It\'s the worst thing you\'ve ever done with your face.');
        if (R() < 0.5) {
          t.talkStun = 1;
          this.say(`💬 ${dname} freezes mid-step — wrong-footed, furious, suddenly unsure.`);
        } else {
          t.enraged = true;
          this.say(`💬 Oh no. ${dname}'s face changes. Whatever was holding back just left. (enraged: hits harder)`);
        }
      } else {
        p.acted = false;
        return false;
      }
      this.tbAfterPlayerAction();
      return true;
    },

    // Hostiles talk on their turn sometimes — threats, reasons, desperation.
    tbHostileTalk(h) {
      const f = this.tbfight;
      if (!f || f.over) return;
      const vid = h.villagerId;
      const temp = this.npcTemper(vid);
      const hpFrac = h.hp / h.maxHp;
      const trust = ((this.state.village.trust || {})[vid]) || 10;
      const dname = h.name;
      const R = Math.random;
      if (f.uprising) {
        const lines = [
          `"The village voted," ${dname} says, advancing. "You don't get to stay."`,
          `"This isn't personal," ${dname} lies, badly.`,
          `"You know what you did." ${dname} won't meet your eyes. "We all do."`,
        ];
        this.say('🔪 ' + lines[Math.floor(R() * lines.length)]);
      } else if (hpFrac < 0.35) {
        const lines = [
          `"Just — just stay back!" ${dname} is crying and swinging at the same time.`,
          `"I don't want to die out here!" ${dname}'s voice breaks on the last word.`,
        ];
        this.say('🔪 ' + lines[Math.floor(R() * lines.length)]);
      } else if (trust >= 40) {
        const lines = [
          `"Why are you doing this?" ${dname} sounds more hurt than angry. "We were — we ATE together."`,
          `"Talk to me!" ${dname} pleads. "Whatever it is, we can —" They can't finish. Neither can you.`,
        ];
        this.say('🔪 ' + lines[Math.floor(R() * lines.length)]);
      } else if (temp === 'bold') {
        const lines = [
          `"I'm going to kill you," ${dname} says, almost conversationally. Like weather.`,
          `"You picked the wrong person," ${dname} snarls.`,
        ];
        this.say('🔪 ' + lines[Math.floor(R() * lines.length)]);
      } else {
        const lines = [
          `"Don't make me do this," ${dname} whispers.`,
          `${dname} is muttering — to themselves, to someone who isn't here. "Sorry sorry sorry."`,
        ];
        this.say('🔪 ' + lines[Math.floor(R() * lines.length)]);
      }
      // talking costs them the turn. words are actions too.
      if (this.tbEndCheck()) return;
    },
  };

  Object.assign(G, methods);

  // ---------- WRAPPERS ----------

  // Cold shoulder: kindness lands softer when the village has gone quiet.
  const origBumpTrust = G.bumpTrust;
  G.bumpTrust = function (vid, n) {
    if (n > 0 && this.justiceCold && this.justiceCold() && vid !== this.villagerId) {
      n = Math.ceil(n / 2);
    }
    return origBumpTrust.call(this, vid, n);
  };

  // Crime recording: murder via villageEvent, attack via playerAttacks.
  // The crime is recorded even when unwitnessed (the village doesn't know —
  // it's unsolved, no heat — but the detective systems can connect it later).
  const origVillageEvent = G.villageEvent;
  G.villageEvent = function (type, opts) {
    const r = origVillageEvent.call(this, type, opts);
    try {
      if (type === 'murder' && opts && opts.victim) {
        const justified = (this.tbfight || {}).aggressor === 'npc';
        this.recordCrime('murder', { victim: opts.victim, justified, witnessed: opts.witnessed !== false });
      }
    } catch (e) {}
    return r;
  };

  const origPlayerAttacks = G.playerAttacks;
  if (origPlayerAttacks) {
    G.playerAttacks = function (vid) {
      try { this.recordCrime('attack', { victim: vid }); } catch (e) {}
      return origPlayerAttacks.call(this, vid);
    };
  }

  // Justice ticks once per day part, alongside everything else that lives.
  const origAdvancePart = G.advancePart;
  G.advancePart = function () {
    const r = origAdvancePart.call(this, ...arguments);
    try { this.justiceTick(); } catch (e) {}
    return r;
  };

  // Exile enforcement: the Haven pantry is closed to the exiled.
  const origPack = G.packFromPantry;
  if (origPack) {
    G.packFromPantry = function () {
      try {
        const refusal = this.justiceExileGuards && this.justiceExileGuards();
        if (refusal) { this.say('🚫 ' + refusal); return null; }
      } catch (e) {}
      return origPack.apply(this, arguments);
    };
  }

  // Hostiles sometimes talk instead of acting. And talk-stun / enrage resolve here.
  const origHostileTurn = G.tbHostileTurn;
  G.tbHostileTurn = function (h) {
    const f = this.tbfight;
    // talk-stun: words stopped them last turn. They lose this turn to thinking.
    if (h.talkStun > 0) {
      h.talkStun -= 1;
      this.say(`🔪 ${h.name} doesn't move. Your words are still in the air between you.`);
      if (this.tbEndCheck()) return;
      return;
    }
    if (!h._talked && !h._begged && Math.random() < 0.22) {
      h._talked = true;
      this.tbHostileTalk(h);
      return;
    }
    const r = origHostileTurn.call(this, h);
    return r;
  };

  // Enraged hostiles hit harder — applied at damage time via wrapper on tbDamage.
  const origTbDamage = G.tbDamage;
  G.tbDamage = function (targetKey, dmg, sourceLabel, sourceKey, opts) {
    const f = this.tbfight;
    if (f && sourceKey) {
      const src = this.tbFighter(sourceKey);
      if (src && src.enraged && src.kind === 'hostile') {
        dmg = Math.round(dmg * 1.5);
      }
    } else if (f && typeof sourceLabel === 'string') {
      // tbDamage is called as tbDamage(key, dmg, name) — find fighter by name match is unreliable;
      // enrage applies via the hostile's own strike path which passes sourceKey. Fallback: check
      // if any alive hostile is enraged and the source label matches their name.
      const src = f.fighters.find(x => x.kind === 'hostile' && x.alive && x.name === sourceLabel && x.enraged);
      if (src) dmg = Math.round(dmg * 1.5);
    }
    return origTbDamage.call(this, targetKey, dmg, sourceLabel, sourceKey, opts);
  };

  // 'betrayal_bribed' isn't a thing anymore (bribe sets fled -> routed), but guard
  // the tbEnd wrapper chain anyway: uprising aftermath.
  // Stash the result on _lastBetrayal BEFORE party.js's tbEnd wrapper nulls tbfight.
  const origTbEndJ = G.tbEnd;
  G.tbEnd = function (result) {
    try {
      const lb = this._lastBetrayal;
      if (lb && lb.uprising) lb.result = result;
    } catch (e) {}
    // UPRISING FLEE (Steve 2026-10-06): game.js's shared combat path says
    // "You escape. The thicket keeps its secrets." on every 'fled' — monster
    // fiction, wrong for a social fight, and it lands one line before the
    // uprising aftermath speaks for itself. Swallow just that line here
    // rather than touching the shared path.
    if (result === 'fled' && this.tbfight && this.tbfight.uprising) {
      const origSay = this.say;
      this.say = function (s) {
        if (String(s) === 'You escape. The thicket keeps its secrets.') return;
        return origSay.call(this, s);
      };
      try {
        return origTbEndJ.call(this, result);
      } finally {
        this.say = origSay;
      }
    }
    return origTbEndJ.call(this, result);
  };

  const origBetrayalAftermath = G.betrayalAftermath;
  if (origBetrayalAftermath) {
    G.betrayalAftermath = function () {
      const lb = this._lastBetrayal;
      if (lb && lb.uprising) {
        this.uprisingAftermath();
        return;
      }
      return origBetrayalAftermath.call(this);
    };
  }

  // Track enraged strikes: tbHostileTurn calls tbDamage(foe.key, dmg, h.name) — name-matched above.

  if (typeof module !== 'undefined' && module.exports) module.exports = methods;
})();
