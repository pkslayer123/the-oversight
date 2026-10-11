// @ontology
// system: betrayal
// description: Betrayal, accusation, trial & exile. Micro-quests disguise later betrayals; aftermath is the game.
// provides:
//   - betrayalState()
//   - phoenixVillagerTrigger (delegates to game.js): removeVillager('killed') on a villager holding phoenix_clause fires the link instead of the death (bypasses: _phoenixResolving, dyingLinks) (Steve 2026-10-09)
//   - grievanceBetween(a, b)
//   - motiveBetween(a, b)
//   - recordGrievance(g)
//   - inviteHistory()
//   - pendingInvite()
//   - acceptInvite(id)
//   - declineInvite(id)
//   - resolveInvite(id)
//   - inviteReward(id)
//   - npcInviteTick()
//   - dayOneNudge()
//   - whoTag(vid)
//   - isPlayer(vid)
//   - pairAffinity(a, b)
//   - bondKey(a, b), bondGet(a, b), bondAdd(a, b, dv, reason)
//   - visitorWares(vis)
//   - traderPay(kcal)
//   - visitorBuyWare(visId, idx)
//   - traderSell(visId, packIdx)
//   - traderSellStock(vis)
//   - traderAppraise(vis, it) -> { verdict, pricePerUnit, line }
//   - traderKnowsItem(vis, it)
//   - traderItemKey(it)
//   - seedTraderKnowledge() -> { staples, specialties }
//   - tradeSpirit(person) -> 0-2 (entrepreneurial spirit: trading is a verb)
//   - scamminess(person) -> 0-3
//   - tradeSavvy() / theirReadOfYou(person)
//   - maybeScamWare(person, ware)
//   - recordScam(whoName, whoId, kind, wareName)
//   - scamDaily()
//   - playerPackKcal() / playerPackSpend(kcal)
//   - confrontScammer(vis, s) / resolveConfront(vis, s, how)
//   - hawkerOffer(vid) / hawkerBuy(vid)
//   - visitorHtml()
//   - visitorDaily()
// rules:
//   - betrayal_requires_motive: true (code: betrayal.js)
//   - bonds_form_in_run: true (code: betrayal.js — bondAdd; meals/visits/feasts build, grievances decay, +6/pair/day cap, no bonds with the dead/gone)
//   - switchboard_talker_cost: appointing the village's best talker to the relay weakens moots — trial swing -8 while they hold the office (code: betrayal.js — tallyVotes, switchboardTalkerCost)
//   - switchboard_resentment: timed mood modifiers (village.moodMods) model appointment resentment — e.g. honoring the weakest forager (code: betrayal.js — villageMood)
//   - switchboard_holder_absent: the relay holder runs the relay, not the moot — excluded from moot voters (code: betrayal.js — tallyVotes)
// consumes:
//   - village.relationships
//   - scholar.reputation
// ============ BETRAYAL, ACCUSATION, TRIAL & EXILE ============
// Steve's design: micro-quests disguise later betrayals; the aftermath is the
// real game. SYMMETRY RULE: this is NOT player-centric. Any villager can be
// lured, accused, tried, exiled. The player is one node in the graph — target,
// witness, juror, accuser, briber, bribed, or someone who hears it days later.
//
// Sections:
//  1. pair relationships (affinity/grievance between ANY two villagers)
//  2. micro-quest invites (the trust pattern betrayals weaponize)
//  3. plot arming (any target)
//  4. ambush: player-involved (interactive) + NPC-NPC (sim)
//  5. accusation cases + evidence + interrogation + turning the weakest
//  6. trial: RNG, mood, factions, bribery (any accused)
//  7. exile: any villager; player exile = a phase (petition/found/drift)
//  8. strangers: earned visitors (the world opening up)
//  9. world-gen: guaranteed reachable village
//  10. THE PLAYER STANDS ACCUSED: crimes → accusation → defense → trial
//      (same machinery, other side: speak, alibi, press accuser, bribe,
//      expose, demand moot, flee) → acquittal / weregild / exile / cold war
//
// Self-attaching module: Object.assign(Game, methods) + wraps endDay,
// convoChoices, convoTurn, villageAction, genVillages. Load after food.js.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const R = Math.random;
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  const methods = {

    // ---------- 1. STATE ----------
    betrayalState() {
      const v = this.state.village;
      v.betrayal = v.betrayal || { invites: {}, plots: [], cases: [], seq: 0, strangers: [] };
      return v.betrayal;
    },
    npcIds() {
      return (this.state.village.roster || []).filter(id => id !== this.villagerId);
    },

    // ---------- 2. PAIR RELATIONSHIPS (any two villagers) ----------
    // affinity: -50..+50. groups = friends, conflicts = tension.
    pairAffinity(a, b) {
      if (a === b) return 50;
      let s = 0;
      for (const gr of (this.state.village.groups || [])) {
        if (gr.members.includes(a) && gr.members.includes(b)) s += 25;
      }
      for (const c of (this.state.village.conflicts || [])) {
        if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) s -= (c.tension || 10);
      }
      // BONDS (pacing build 2026-10-10): relationships formed DURING the run.
      const bnd = this.bondGet ? this.bondGet(a, b) : null;
      if (bnd) s += Math.max(-30, Math.min(30, (bnd.v || 0) / 2)) + ((bnd.depth || 0) * 2);
      return clamp(s, -60, 60);
    },
    // ---------- 2b. BONDS: the village befriends itself ----------
    // The audit found the social graph frozen at gen time — trust-of-player
    // was the only persistent relationship number, villagers never became
    // friends mid-run. v.bonds["a|b"] = {v, depth, day, dayGain}: v is the
    // living warmth (-100..100), depth is sediment (-3..3) so sustained
    // warmth leaves a permanent point and long relationships survive a quiet
    // fortnight. pairAffinity reads them above.
    bondKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; },
    bondGet(a, b) {
      const v = this.state.village || {};
      v.bonds = v.bonds || {};
      return v.bonds[this.bondKey(a, b)] || null;
    },
    bondAdd(a, b, dv, reason) {
      // no self-bonds; no bonds with the dead or the gone (break-it: the
      // first grave must not leave phantom friendships behind).
      if (!a || !b || a === b) return false;
      try {
        const roster = (this.state.village || {}).roster || [];
        if (roster.indexOf(a) === -1 || roster.indexOf(b) === -1) return false;
      } catch (e) { return false; }
      const v = this.state.village;
      v.bonds = v.bonds || {};
      const k = this.bondKey(a, b);
      const day = (this.state.scholar || {}).day || 1;
      const bnd = v.bonds[k] || { v: 0, depth: 0, day: 0, dayGain: 0 };
      // no same-day inflation: at most +6 per pair per day.
      let add = dv;
      if (dv > 0) {
        if (bnd.day !== day) { bnd.day = day; bnd.dayGain = 0; }
        const room = Math.max(0, 6 - (bnd.dayGain || 0));
        add = Math.min(dv, room);
        bnd.dayGain = (bnd.dayGain || 0) + add;
      }
      const before = bnd.v || 0;
      bnd.v = Math.max(-100, Math.min(100, before + add));
      // DRIFT SEDIMENT: crossing a 25-multiple banks a permanent point of
      // depth, up or down. Depth -3..+3.
      const crossed = (th) => (before < th && bnd.v >= th) || (before > th && bnd.v <= th);
      if (crossed(25) || crossed(50) || crossed(75)) bnd.depth = Math.min(3, (bnd.depth || 0) + 1);
      if (crossed(-25) || crossed(-50) || crossed(-75)) bnd.depth = Math.max(-3, (bnd.depth || 0) - 1);
      v.bonds[k] = bnd;
      return true;
    },
    // grievance: 0..100. Why A might want B hurt. Symmetric-capable.
    grievanceBetween(a, b) {
      let g = 0;
      const v = this.state.village;
      // recorded grievances
      for (const gr of ((v.betrayal || {}).grievances || [])) {
        if (gr.by === a && gr.against === b) g += gr.severity || 15;
      }
      // conflicts with tension
      for (const c of (v.conflicts || [])) {
        if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) g += (c.tension || 0) * 0.8;
      }
      // player-specific: crimes
      if (a === this.villagerId || b === this.villagerId) {
        const perp = a === this.villagerId ? a : b;
        const vict = a === this.villagerId ? b : a;
        try {
          for (const cr of (this.justiceState().crimes || [])) {
            if (cr.victim === vict) g += cr.type === 'murder' ? 50 : cr.type === 'attack' ? 30 : 12;
          }
        } catch (e) {}
        void perp;
      }
      return clamp(g, 0, 100);
    },
    recordGrievance(by, against, kind, severity) {
      const bs = this.betrayalState();
      bs.grievances = bs.grievances || [];
      bs.grievances.push({ by, against, kind, severity: severity || 15, day: this.state.scholar.day });
      // CRUELTY DECAYS (pacing build 2026-10-10): a recorded grievance eats
      // the bond between the two — warmth built over weeks can crack.
      try { if (this.bondAdd) this.bondAdd(by, against, -Math.min(12, (severity || 15) / 2), 'grievance'); } catch (e) {}
    },
    // motive for A to move against B: grievance + ambition + fear + envy
    motiveBetween(a, b) {
      let score = this.grievanceBetween(a, b) * 0.8;
      const reasons = [];
      if (this.grievanceBetween(a, b) >= 20) reasons.push('grievance');
      try {
        const vp = this.vpOf(a) || {};
        const goal = vp.goal || this.npcGoal(a);
        if (goal === 'lead') { score += 25; reasons.push('ambition'); }
        else if (goal === 'prove') { score += 12; reasons.push('prove'); }
      } catch (e) {}
      // fear: B is dangerous (player with murders, or B hurt A before)
      try {
        if (b === this.villagerId) {
          const murders = (this.justiceState().crimes || []).filter(c => c.type === 'murder').length;
          if (murders) { score += 12; reasons.push('fear'); }
        }
      } catch (e) {}
      return { score: clamp(score, 0, 100), reasons };
    },
    isPlayer(id) { return id === this.villagerId; },
    disp(id) { return this.isPlayer(id) ? 'you' : this.displayName(id); },
    // whoTag: distinguishing token for dialogue. Names once known/post-System;
    // pre-System, an age/gender/role descriptor ("the woman in her 30s, the nurse")
    // so multi-actor dialogue never collapses to "A says dusk. But A said full dark."
    // The player has to track WHO said WHAT — that's the gameplay.
    whoTag(vid) {
      if (!vid) return 'someone';
      if (this.isPlayer(vid)) return 'you';
      try {
        if (this.state.systemArrived || this.nameKnown(vid)) return this.npcName(vid);
      } catch (e) {}
      try {
        const v = (this.data.villagers || []).find(x => x.id === vid)
          /* unified: hydrated seeds are in villagers */ || {};
        let pro = v.pro;
        if (!pro) pro = ['she', 'he', 'they'][this._hashStr(String(vid)) % 3];
        const who = pro === 'she' ? 'woman' : pro === 'he' ? 'man' : 'person';
        const age = v.age || 30;
        const band = age < 25 ? '20s' : age < 35 ? '30s' : age < 45 ? '40s' : age < 55 ? '50s' : '60s';
        const poss = pro === 'she' ? 'her' : pro === 'he' ? 'his' : 'their';
        let role = '';
        try {
          // LIAR'S MASK (Steve 2026-10-05): an unconfessed occupation lie means
          // the village — and the narrator — knows them by their CLAIM, not the
          // truth. whoTag used to leak the TRUE occupation into every dialogue
          // tag, collapsing each liar's mystery at a glance. After confession /
          // exposure the tag flips to the truth: a discovery beat, not a leak.
          // (The confessed truth lands in the journal via truth.js, so the
          // gate below picks it up — the test simulates it with journalLearn.)
          const lies = (this.vpOf(vid) || {}).lies; // read-only: never generate lies from a descriptor
          const liveLie = lies && lies.occupation && !lies.occupation.confessed && lies.occupation.told;
          if (liveLie) {
            role = ', the ' + String(lies.occupation.told).toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
          } else {
            // OCCUPATION IS EARNED KNOWLEDGE (Steve's law: if you don't know,
            // it doesn't show — kgate audit F5, 2026-10-06). A truthful
            // villager's occupation shows only once the player has heard it:
            // the journal's People Codex chapter is the ladder. Pre-knowledge
            // the tag is just the age/gender descriptor — naming "the
            // mortician" before the player has spoken to them collapses the
            // mystery. The journal value is what was HEARD (truth for
            // truthful NPCs, confessed truth after exposure).
            let heard = null;
            try {
              const jp = this.journalPerson ? this.journalPerson(vid) : null;
              heard = jp && jp.occupation && jp.occupation.value;
            } catch (e2) {}
            if (heard) role = ', the ' + String(heard).toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
          }
        } catch (e) {}
        // UNIQUE-PERSON LAW (Steve 2026-10-06): two villagers can share pro +
        // age band, so whoTag would print "the person in their 30s" for two
        // different suspects and the player can't tell them apart. Mirror
        // game.js's personDescriptor collision handling: append a stable,
        // purely-observable trait (no knowledge leak — hair, build, marks).
        let traitBit = '';
        try {
          if (this.descriptorCollides && this.descriptorCollides(vid) &&
              typeof this.personVisibleTrait === 'function') {
            const trait = this.personVisibleTrait(vid);
            if (trait) traitBit = ', ' + trait;
          }
        } catch (e2) {}
        return 'the ' + who + ' in ' + poss + ' ' + band + traitBit + role;
      } catch (e) { return 'someone'; }
    },

    // ---------- 3. MICRO-QUEST INVITES ----------
    // The trust pattern. ~60% smallness / ~30% reward / ~10% wild danger.
    inviteHistory(vid) {
      const bs = this.betrayalState();
      bs.invites[vid] = bs.invites[vid] || { count: 0, accepted: 0, outcomes: [], pending: null };
      return bs.invites[vid];
    },
    INVITE_DEFS() {
      return [
        { id: 'look', label: '"Walk with me? I want another pair of eyes on something."', spot: 'the tree line' },
        { id: 'carry', label: '"Help me haul something back? Too much for one."', spot: 'the cache spot' },
        { id: 'air', label: '"Come get air with me. I need to think out loud."', spot: 'the ridge' },
        { id: 'show', label: '"Come see what I found. You won\'t believe it."', spot: 'the hollow' },
        { id: 'traps', label: '"Walk my trap line with me? Extra hands, extra eyes."', spot: 'the trap line' },
      ];
    },
    // daily: 0-2 NPCs get an invite idea (more once the village trusts you).
    // INVITE FLOW: once average trust passes ~15, people think of you when
    // they head out. Early game is quieter — but the betrayal design needs
    // 3-4 honest invites banked before the turn means anything, so the flow
    // opens up fast once you're even slightly known.
    npcInviteTick() {
      const bs = this.betrayalState();
      const roster = this.npcIds();
      if (!roster.length) return;
      const trusts = roster.map(id => ((this.state.village.trust || {})[id]) || 10);
      const avgTrust = trusts.reduce((a, b) => a + b, 0) / trusts.length;
      const warm = avgTrust >= 15;
      const n = warm
        ? 1 + (R() < 0.6 ? 1 : 0) + (R() < 0.25 ? 1 : 0)
        : (R() < 0.55 ? 1 : (R() < 0.2 ? 2 : 0));
      for (let i = 0; i < n; i++) {
        const vid = pick(roster);
        const hist = this.inviteHistory(vid);
        if (hist.pending) continue;
        // don't invite if they barely know you (gate relaxes once warm)
        const t = ((this.state.village.trust || {})[vid]) || 10;
        if (t < 12 && R() < (warm ? 0.3 : 0.7)) continue;
        hist.pending = { defId: pick(this.INVITE_DEFS()).id, day: this.state.scholar.day };
      }
      // stale pendings expire
      for (const vid of Object.keys(bs.invites)) {
        const h = bs.invites[vid];
        if (h.pending && this.state.scholar.day - h.pending.day > 2) h.pending = null;
      }
    },
    // DAY-1 NUDGE: on the first day, someone comes to YOU. "Can we talk?"
    // Teaches the conversation verb and hands the new player their first
    // thread — the design always meant NPCs to initiate, but it could take
    // days to fire on its own. Fires once, at the first endDay.
    dayOneNudge() {
      const v = this.state.village;
      if (this.state.scholar.day !== 1 || v.day1NudgeDone) return;
      v.day1NudgeDone = true;
      const roster = this.npcIds().filter(id => {
        const t = (this.npcTemper && this.npcTemper(id)) || '';
        return t !== 'withdrawn' && t !== 'prickly' && t !== 'restless';
      });
      if (!roster.length) return;
      const rid = roster[Math.floor(Math.random() * roster.length)];
      const d = this.displayName(rid);
      // TALK-REQUEST LINES are templates, not baked text: names are earned
      // socially, so the requester may still be a descriptor ("A person,
      // maybe 60s") when the nudge fires and "Daljit" by the time the player
      // answers it. The __NAME__ placeholder renders at DELIVERY time.
      v.talkRequests = v.talkRequests || {};
      v.talkRequests[rid] = { line: `"Hey." __NAME__ settles near you, not too close. "Day one. Everyone's pretending they're fine. ...Can we talk? Just talk — like people used to."`, day: 1 };
      try { this.say(`"Hey." ${d} settles near you, not too close. "Day one. Everyone's pretending they're fine. ...Can we talk? Just talk — like people used to."` + ` (Talk to ${d}.)`); } catch (e) {}
    },
    pendingInvite(vid) {
      const h = (this.betrayalState().invites || {})[vid];
      return h && h.pending ? h.pending : null;
    },
    acceptInvite(vid) {
      const hist = this.inviteHistory(vid);
      const inv = hist.pending;
      if (!inv) return null;
      hist.pending = null;
      hist.count++; hist.accepted++;
      // is this the betrayal? an armed plot whose inviter is vid (or whose turn it is)
      const bs = this.betrayalState();
      const plot = bs.plots.find(p => p.active && !p.sprung && p.inviter === vid && p.target === this.villagerId);
      if (plot) return this.springAmbush(plot);
      return this.resolveInvite(vid, inv.defId);
    },
    declineInvite(vid) {
      const hist = this.inviteHistory(vid);
      hist.pending = null;
      hist.count++;
      // BREAK-IT (social r10 2026-10-10): (t[vid] || 10) resurrected a real-0
      // trust to 9 — declining their invitation PAID a hater. Penalties land
      // whole and 0 stays 0 (bumpTrust; same class as the leadership fixes).
      this.bumpTrust(vid, -1, 'declined their invitation');
      return `"Another time, then." A small thing, pocketed.`;
    },
    resolveInvite(vid, defId) {
      const def = this.INVITE_DEFS().find(d => d.id === defId) || this.INVITE_DEFS()[0];
      const hist = this.inviteHistory(vid);
      const name = this.displayName(vid);
      const first = this.whoTag(vid);
      const t = this.state.village.trust || {};
      const roll = R();
      let outcome, line;
      // SHARED-TIME TRUST (break-it social r5 2026-10-09): the old code wrote
      // flat +3/+4/+5 with no progressive scaling and no 40 words-cap — same
      // bug class as comfort/tellSide (break-it social r2). Walking together
      // is shared time, not a deed: through the resolver like every other
      // word. (NPC-paced, not player-farmable, but the math should be one math.)
      const inviteTrust = (amt, nm) => {
        if (typeof this.resolveConsequence === 'function') {
          this.resolveConsequence(vid, { trust: amt, temper: 'kind', name: nm });
        } else {
          t[vid] = Math.min(100, (t[vid] || 10) + this.trustGainProgressive(vid, amt));
        }
      };
      if (roll < 0.60) {
        // characterful smallness
        outcome = 'small';
        inviteTrust(3, 'invite:small');
        line = pick([
          `You walk to ${def.spot} with ${first}. Nothing much there — but they talk the whole way, and you learn the shape of them a little better.`,
          `It's quiet at ${def.spot}. ${first} doesn't say much. Sometimes that's the whole point.`,
          `${first} shows you where they go to think. "Don't tell the others. Everyone needs one place."`,
        ]);
      } else if (roll < 0.90) {
        // real reward
        outcome = 'reward';
        inviteTrust(5, 'invite:reward');
        const rw = this.inviteReward(vid);
        line = rw.line;
      } else {
        // wild danger — teaches caution about the WILD
        outcome = 'wild';
        inviteTrust(4, 'invite:wild');
        line = pick([
          `Halfway to ${def.spot}, ${first} freezes. Fresh tracks — big. "We go back now. Quietly." You do. The wild, reminding you.`,
          `At ${def.spot} the ground is torn up. Something was here, recently, and it wasn't careful. ${first}'s hand finds your sleeve. You leave together, faster than you came.`,
        ]);
        try { this.addTrauma(3); } catch (e) {}
      }
      hist.outcomes.push({ defId, outcome, day: this.state.scholar.day });
      try { this.tickAction(24); } catch (e) {}
      this.say(line);
      return { outcome, line };
    },
    inviteReward(vid) {
      const name = this.displayName(vid);
      const first = this.whoTag(vid);
      const kind = pick(['cache', 'bundle', 'knowledge', 'item']);
      if (kind === 'cache') {
        const kcal = 800 + Math.floor(R() * 1200);
        // PHANTOM FIX (break-it 2026-10-08): this used to bump v.pantryKcal
        // directly — a phantom number wiped by villageEats' end-of-day sync,
        // so the promised cache evaporated. Real food arrives as a real item.
        try { this.stockPantry(kcal, 'Buried cache'); } catch (e) {}
        return { kind, line: `"I buried this before the Scattering. Seemed stupid to keep it secret." ${first} digs up a wrapped bundle — food, still good. (+${kcal} kcal to the pantry.)` };
      }
      if (kind === 'bundle') {
        try {
          const st = this.stashState ? this.stashState() : null;
          if (st) { st.materials = st.materials || {}; st.materials.wood = (st.materials.wood || 0) + 4; st.materials.fiber = (st.materials.fiber || 0) + 4; }
        } catch (e) {}
        return { kind, line: `${first} has been stockpiling where nobody looks. "Take half. You've got the hands for it." (+4 wood, +4 fiber to the village stash.)` };
      }
      if (kind === 'knowledge') {
        return { kind, line: `On the way, ${first} stops and actually teaches you something — how they read a slope for water, how their grandmother did it. (Knowledge, freely given. The Codex notes it.)` };
      }
      return { kind, line: `"Here. I made an extra." ${first} presses something into your hand — a decent tool, oiled and kept. (Useful. Keep it.)` };
    },


  // ---------- 4. PLOT ARMING (any target) ----------
  considerBetrayalPlot() {
    const bs = this.betrayalState();
    if (bs.plots.some(p => p.active && !p.resolved)) return;
    const day = this.state.scholar.day;
    if (day < 6) return;
    const roster = this.npcIds();
    if (roster.length < 4) return;
    // beloved village: basically never
    try {
      const avg = roster.reduce((s, id) => s + (((this.state.village.trust || {})[id]) || 10), 0) / roster.length;
      const heat = this.justiceHeat();
      if (avg > 55 && heat < 20 && R() < 0.9) return;
    } catch (e) {}
    // pick ringleader + target: strongest motive pair
    let best = null;
    const candidates = [...roster, this.villagerId];
    for (const a of roster) {
      for (const b of candidates) {
        if (a === b) continue;
        const m = this.motiveBetween(a, b);
        if (m.score >= 45 && (!best || m.score > best.m.score)) best = { a, b, m };
      }
    }
    if (!best) return;
    if (R() > 0.4) return; // not every day
    const acc = this.recruitAccomplices(best.a, best.b);
    if (acc.length < 2) return;
    this.armPlot(best.a, acc, best.b, best.m);
  },
  recruitAccomplices(leader, target) {
    const v = this.state.village;
    const roster = this.npcIds().filter(id => id !== leader && id !== target);
    const mates = new Set();
    for (const gr of (v.groups || [])) if (gr.members.includes(leader)) gr.members.forEach(m => mates.add(m));
    const scored = [];
    for (const vid of roster) {
      const m = this.motiveBetween(vid, target);
      let s = m.score * 0.5 + (mates.has(vid) ? 30 : 10);
      const t = ((v.trust || {})[vid]) || 10;
      s += (30 - t) * 0.4; // the disaffected are recruitable
      if (s > 18) scored.push({ vid, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 2).map(x => x.vid);
  },
  armPlot(leader, accomplices, target, motive) {
    const bs = this.betrayalState();
    const id = 'plot_' + (++bs.seq);
    const plot = {
      id, leader, accomplices, target,
      motive: motive.reasons, motiveScore: motive.score,
      day: this.state.scholar.day, active: true, sprung: false, resolved: false,
      inviter: null, weakest: null, tells: [],
    };
    // the weakest: most likely to flip
    let bw = -1;
    for (const vid of accomplices) {
      let s = 0;
      try {
        const vp = this.vpOf(vid) || {};
        const temp = (vp.personality && vp.personality.temperament) || 'steady';
        s += temp === 'warm' ? 30 : temp === 'cautious' ? 20 : 10;
        s -= ((vp.personality && vp.personality.dark) || 0) * 12;
        s += (this.getDoubts(vid, true) || []).length * 6;
      } catch (e) {}
      if (s > bw) { bw = s; plot.weakest = vid; }
    }
    // the inviter: whoever the target trusts most (the cruelest cut)
    const cands = [leader, ...accomplices];
    let bi = null, bt = -1;
    for (const vid of cands) {
      const t = vid === target ? 0 : this.pairAffinity(vid, target) + (this.isPlayer(target) ? (((this.state.village.trust || {})[vid]) || 10) : 20);
      if (t > bt) { bt = t; bi = vid; }
    }
    plot.inviter = bi || leader;
    bs.plots.push(plot);
    // the invite goes out through the normal invite channel — indistinguishable
    const hist = this.inviteHistory(plot.inviter);
    hist.pending = { defId: pick(this.INVITE_DEFS()).id, day: this.state.scholar.day, plotId: plot.id };
    plot.tells = this.ambushTells(plot);
    return plot;
  },
  socialPerception() {
    let p = 20;
    try { if (this.hasAbility('social_read')) p += 30; } catch (e) {}
    try { if (this.hasAbility('observer')) p += 15; } catch (e) {}
    return p;
  },
  // tells: gated by perception. The observant earn the warning.
  ambushTells(plot) {
    const p = this.isPlayer(plot.target) ? this.socialPerception() : 30;
    const inviter = this.whoTag(plot.inviter);
    const T = [
      { min: 20, text: `They named the spot — not "a walk," somewhere specific. ${inviter} chose it.` },
      { min: 35, text: `${inviter} is carrying more than usual. You notice the weight of it.` },
      { min: 50, text: `Too eager. Asked twice. People with nothing planned don't ask twice.` },
      { min: 65, text: `Someone's already out there. You saw a figure heading that way earlier — and it wasn't alone.` },
      // POOL EXPANSION (Steve 2026-10-06): high-perception readers earn
      // sharper warnings — the observant don't just sense danger, they
      // start naming it.
      { min: 72, text: `${inviter} keeps glancing at the others — little check-ins, like making sure everyone's still in.` },
      { min: 80, text: `The walk is wrong. Too quiet, too direct. Nobody wanders like this on purpose unless the purpose is already decided.` },
      { min: 88, text: `${inviter} didn't eat at the fire tonight. People don't skip food before a friendly walk.` },
      // KNOWLEDGE GATING: this never names the accomplice — whoTag is
      // name-gated and would read as a broken possessive ("the person in
      // their 30s's name"). At perception 95 you read the ROOM, not the roster.
      { min: 95, text: `Someone's name came up at the fire earlier — ${inviter} went quiet, and so did everyone else. You didn't think anything of it then. You do now.` },
    ];
    return T.filter(t => p >= t.min).map(t => t.text);
  },
  plotAwareness(plot) {
    // how many tells the target noticed → escape tuning
    if (!this.isPlayer(plot.target)) return R() < 0.35 ? 2 : 0;
    return plot.tells.length;
  },

  // ---------- 5. THE AMBUSH ----------
  // Player target: interactive beat via conversation. NPC target: sim.
  springAmbush(plot) {
    plot.sprung = true;
    plot.active = false;
    if (!this.isPlayer(plot.target)) return this.simNpcAmbush(plot);
    const leader = this.whoTag(plot.leader);
    const Cap = (s) => this.capFirst(s);
    // the inviter walked out WITH you — they're already beside you. The
    // flank is everyone else closing in. (Listing the inviter again made
    // one person read as two — a coherence break the player could feel.)
    const others = (plot.accomplices || []).filter(a => a !== plot.inviter).map(a => this.displayName(a));
    let beat2;
    if (others.length >= 2) beat2 = `${others[0]} and ${others[1]} are suddenly on your other sides — not wandering. Placed.`;
    else if (others.length === 1) beat2 = `${others[0]} is suddenly on your other side — not wandering. Placed.`;
    else if (plot.inviter === plot.leader) beat2 = `nobody else in sight. Just ${leader} — close now, too close. Not wandering. Placed.`;
    else beat2 = `${this.displayName(plot.inviter)} was walking beside you a moment ago. Now they're behind you. Too close.`;
    const tells = plot.tells;
    this.say(`You walk out with ${this.displayName(plot.inviter)}. ${tells.length >= 3 ? 'Every warning bell you own is ringing.' : tells.length ? 'Something feels off, but you go anyway.' : 'Just a walk. Just people.'}`);
    this.say(`Halfway there, the shape of it changes. ${Cap(leader)} stops walking. ${beat2}`);
    // OPENER POOL (Steve 2026-10-06, pool expansion 4->9): the leader's
    // opener is generated from WHO they are to you — a trusted friend's
    // betrayal reads different from a stranger's, and temperament shapes
    // the delivery. Bold leaders hold your eyes; the rest can't. The
    // close-friend lines only land when trust was actually earned — that's
    // the wound.
    const ltemp = String((this.npcTemper && this.npcTemper(plot.leader)) || 'steady').toLowerCase();
    const ltrust = ((this.state.village || {}).trust || {})[plot.leader];
    const lclose = (ltrust || 0) >= 40;
    const lhard = (ltemp === 'bold' || ltemp === 'intense');
    const openers = [
      'You\'ve had this coming.',
      'Don\'t make this worse than it is.',
      'We\'re not monsters. We just need you gone.',
      'Nothing personal. That\'s the worst part, isn\'t it?',
      lclose ? 'I keep trying to find a version of this where it isn\'t me. I can\'t.' : null,
      lclose ? 'You were supposed to be one of the good ones. That\'s what makes this — ugh. That\'s what makes it.' : null,
      lhard ? 'You knew this was coming. Everyone did. Don\'t insult us by pretending.' : null,
      (ltemp === 'cautious' || ltemp === 'withdrawn') ? 'Please. Please don\'t — just listen. It\'s not what it looks like, except it is.' : null,
      'The village can\'t carry you anymore. Somebody had to say it.',
    ].filter(Boolean);
    const eyeLine = lhard
      ? `${leader} meets your eyes — steady, which is somehow worse. Their hands are shaking anyway.`
      : `${leader} won't quite meet your eyes. Their hands are shaking.`;
    this.say(`"${pick(openers)}" ${eyeLine}`);
    plot.round = 0; plot.talksLeft = 3;
    plot.aware = plot.tells.length >= 2;
    // open the ambush conversation: RUN / TALK / FIGHT each exchange
    try {
      const c = this.convoGet(plot.leader);
      c.thread = 'ambush'; c.ambushPlot = plot.id; c.depth = 0;
      c.transcript = c.transcript || [];
    } catch (e) {}
    plot.state = 'confront';
    return { ambush: true, plot };
  },
  // one exchange of the ambush. choice: 'run' | 'talk' | 'fight'
  ambushExchange(plot, choice) {
    const s = this.state.scholar;
    plot.round = (plot.round || 0) + 1;
    const acc = plot.accomplices.map(a => this.displayName(a));
    if (choice === 'run') {
      // TUNING: aware (noticed the tells) ~always escapes; oblivious ~sometimes.
      let p = 0.35 + (plot.aware ? 0.55 : 0);
      // talk-stalling earlier bought distance
      p += (plot.stalled || 0) * 0.08;
      p = clamp(p, 0.05, 0.97);
      if (R() < p) {
        const nicked = R() < 0.3;
        if (nicked) {
          const d = 3 + Math.floor(R() * 5);
          s.health = Math.max(1, (s.health == null ? 100 : s.health) - d);
          plot.woundsTaken = (plot.woundsTaken || 0) + d;
          this.say(`You run. Something catches your shoulder on the way out — ${d} of hurt, and proof. Then trees, and breath, and gone.`);
        } else {
          this.say(`You run. They're shaking too hard to aim, too slow to chase. The village hears you coming a long way off.`);
        }
        try { this.addTrauma(12); } catch (e) {}
        return this.ambushAftermath(plot, 'escaped');
      }
      // caught: shaky attack
      if (R() < 0.3) {
        const others = (plot.accomplices || []).length;
        this.say(`You bolt — and one of them just... freezes. Hands up, shaking. They can't do it.${others ? ' The others can.' : ' But the leader can.'}`);
      }
      const d = 2 + Math.floor(R() * 5);
      s.health = Math.max(1, (s.health == null ? 100 : s.health) - d);
      plot.woundsTaken = (plot.woundsTaken || 0) + d;
      try { this.addTrauma(6); } catch (e) {}
      this.say(`They catch your arm, wild and clumsy. It hurts (${d}) — desperate, not skilled. You're still on your feet.`);
      // sometimes a failed run ends badly: overwhelmed, not killed
      if (R() < 0.30) {
        this.say(`Too many hands. Something hits the side of your head and the world tilts sideways.`);
        return this.ambushAftermath(plot, 'knocked_out');
      }
      if (plot.round >= 3) {
        this.say(`They're falling back, breathing hard. This isn't working for them either. You get your distance and keep it.`);
        return this.ambushAftermath(plot, 'escaped');
      }
      return { continue: true, line: `"Don't—" Someone's crying now. This is falling apart for them too.` };
    }
    if (choice === 'talk') {
      if ((plot.talksLeft || 0) <= 0) {
        // the UI hides TALK once talks run out (convoChoices gate), but a
        // raw call must not spin forever: the beat is over, the confrontation
        // moves on. (Steve 2026-10-06: ambush talk-loop stuck state)
        this.say(`"No more talking." The moment's gone — and they know it.`);
        return { continue: false, line: `No more talking. The moment's gone.` };
      }
      plot.talksLeft--;
      plot.stalled = (plot.stalled || 0) + 1;
      // the waver: an accomplice with cold feet — or the leader, if they came alone
      const waver = (plot.accomplices || []).length
        ? plot.accomplices[Math.floor(R() * plot.accomplices.length)]
        : plot.leader;
      const wtag = this.whoTag(waver);
      const Wtag = this.capFirst(wtag);
      // when the leader came alone, the waver IS the leader — "the leader
      // snaps: shut it" would be self-directed nonsense. The crack reads
      // differently when there's nobody else to perform for.
      const alone = waver === plot.leader;
      // ESCALATION (Steve 2026-10-05): each talk is different. The plan frays.
      const n = plot.stalled;
      if (n === 1) {
        this.say(`You talk — hands visible, voice level. ${Wtag} looks away. Looks at the ground. The plan is leaking.`);
      } else if (n === 2) {
        this.say(alone
          ? `You keep talking. ${Wtag} is crying now, quietly. "I didn't — we weren't going to —" They catch themselves, hard. "Shut it," they hiss — at you, at themselves, at the whole idea. But the crack is there.`
          : `You keep talking. ${Wtag} is crying now, quietly. "I didn't — we weren't going to —" The leader snaps: "Shut it." But the crack is there.`);
      } else {
        this.say(alone
          ? `You talk through the shaking. ${Wtag} has stopped pretending. "I'm sorry," they whisper — and it lands wrong, because there's nobody else here to be sorry to but you. The whole thing is coming apart.`
          : `You talk through the shaking. ${Wtag} has stopped pretending. "I'm sorry," they whisper. Not to you — to the leader. The whole thing is coming apart.`);
      }
      try { this.addDoubt(waver, 'observation', `${wtag} wavered when you talked instead of running. They don't want this.`, [], { eventBacked: true }); } catch (e) {}
      // TALK-DOWN (Steve 2026-10-06): three rounds of talk fray the plan to
      // the breaking point — the fiction already promises "the whole thing
      // is coming apart," so the mechanics have to let it actually come
      // apart. Talk becomes a real path: likely, not certain. On failure they
      // snap back and the confrontation continues (run/fight only).
      if (n >= 3) {
        const p = alone ? 0.6 : 0.7;
        if (R() < p) {
          const leaderTag = this.whoTag(plot.leader);
          this.say(alone
            ? `${Wtag} puts their hands down. "I can't—" A breath. "I can't do this." They back off a step, then another. The walk home is going to be the longest of their life.`
            : `${Wtag} drops their hands. "Stop. Just — stop." ${this.capFirst(leaderTag)} stares at them like a stranger. The others look at the ground. Nobody moves to stop you leaving.`);
          return this.ambushAftermath(plot, 'talked_down');
        }
        this.say(`${this.capFirst(this.whoTag(plot.leader))} shakes their head hard, like clearing water from their ears. "No. We're doing this." The crack is still there — but they've decided to walk past it.`);
      }
      return { continue: true, line: `A long second. Nobody moves. You've bought a little distance — use it.` };
    }
    // fight
    const accs = plot.accomplices || [];
    const target = accs.length && R() < 0.5 ? plot.leader : (accs.length ? pick(accs) : plot.leader);
    const dmg = 8 + Math.floor(R() * 10);
    plot.dealt = plot.dealt || {};
    plot.dealt[target] = (plot.dealt[target] || 0) + dmg;
    this.say(`You hit ${this.whoTag(target)} — hard, no form, all survival. (${dmg})`);
    try { this.addTrauma(8); } catch (e) {}
    if ((plot.dealt[target] || 0) >= 25) {
      // first blood breaks them: attackers left standing = everyone minus the one who went down
      const stillUp = accs.length;
      const breakLine = stillUp <= 0 ? `That's all of them. Nobody's getting up to argue.`
        : stillUp === 1 ? `And the last one standing just... stops. This was supposed to be easy. It isn't. They back off, hands up.`
        : `And the other ${stillUp === 2 ? 'two' : stillUp} just... stop. This was supposed to be easy. It isn't. They back off, hands up.`;
      this.say(`${this.capFirst(this.whoTag(target))} goes down — not dead, done. ${breakLine}`);
      plot.foughtOff = true;
      // corpse only if you finished someone — you didn't; they're down
      return this.ambushAftermath(plot, 'fought_off');
    }
    // they flail back
    const d = 2 + Math.floor(R() * 4);
    s.health = Math.max(1, (s.health == null ? 100 : s.health) - d);
    plot.woundsTaken = (plot.woundsTaken || 0) + d;
    this.say(`Wild swings back at you (${d}). They're terrible at this. That's the only reason you're still standing.`);
    if (plot.round >= 3) return this.ambushAftermath(plot, 'escaped');
    // a continuing fight needs a spoken beat — without one the thread renders "undefined"
    return {
      continue: true,
      line: pick([
        `"Stay— stay back!" Someone's voice cracks on it. Nobody's steady here.`,
        `Breathing hard all around. ${this.capFirst(this.whoTag(plot.leader))}'s hands won't stop shaking — but they haven't backed off either.`,
        `"We can still—" ${this.whoTag(target)} doesn't finish. Nobody finishes anything right now.`,
      ]),
    };
  },
  // NPC-NPC ambush: resolved in the sim. The player hears about it later.
  simNpcAmbush(plot) {
    const r = R();
    let outcome, line;
    if (r < 0.55) outcome = 'escaped';
    else if (r < 0.8) outcome = 'hurt';
    else outcome = 'killed';
    plot.sprung = true; plot.active = false; plot.resolved = true; // sim-resolved: the plot is over
    if (outcome === 'killed') {
      // corpse hook (corpses.js) — feature-checked. registerDeath also
      // fires the village grief event, so the death gets talked about.
      try {
        if (this.registerDeath) this.registerDeath({
          kind: 'person', villagerId: plot.target,
          name: this.displayName(plot.target),
          cause: 'ambush', killerId: plot.leader,
          witnesses: this.witnesses ? (this.witnesses(6) || []) : [],
        });
      } catch (e) {}
      this.removeVillager(plot.target, 'ambushed');
      try { this.recordTrauma('killed'); } catch (e) {}
    }
    if (outcome === 'hurt') {
      try { this.recordGrievance(plot.target, plot.leader, 'ambushed', 60); } catch (e) {}
    }
    // seed the aftermath as a case the player can discover
    const c = this.openCase(plot, outcome === 'killed' ? 'murder' : 'ambush');
    // (cover story is seeded inside openCase — first-mover advantage)
    // the target (if alive) may tell theirs
    if (outcome !== 'killed' && R() < 0.6) this.seedTargetStory(c);
    // the player hears about it 1-2 days later via gossip
    c.playerHeardDay = this.state.scholar.day + 1 + Math.floor(R() * 2);
    this.say(`Days later, you'll hear what happened out past the ridge. For now: nothing. The village keeps its face still.`);
    return { ambush: true, sim: true, outcome, caseId: c.id };
  },
  removeVillager(vid, how) {
    // PHOENIX (Steve 2026-10-09): a villager holding the clause doesn't die
    // quietly -- the link fires instead of the death. Bypasses: ash-deaths
    // and broken links set _phoenixResolving; dyingLinks marks a death
    // already held by a link (don't re-trigger).
    try {
      if (how === 'killed' && !this._phoenixResolving &&
          !(this.state.village.dyingLinks || {})[vid] &&
          this.npcHasAbility && this.npcHasAbility(vid, 'phoenix_clause')) {
        if (this.phoenixVillagerTrigger(vid)) return;
      }
    } catch (e) {}
    const v = this.state.village;
    // MENTORSHIP (Steve 2026-10-09): they were learning at your side, and they
    // died on your watch. That's a real social consequence — the village
    // trusted you with them.
    try {
      const wasMentored = v.mentored && v.mentored[vid];
      let inParty = false;
      try { inParty = this.partyMembers ? this.partyMembers().includes(vid) : false; } catch (e) {}
      if (wasMentored && inParty && (how === 'killed' || how === 'ambushed')) {
        const nm = this.displayName ? this.displayName(vid) : vid;
        for (const rid of (v.roster || [])) {
          if (rid === vid) continue;
          v.trust = v.trust || {};
          v.trust[rid] = Math.max(0, ((v.trust[rid] == null) ? 15 : v.trust[rid]) - 8);
        }
        this.say(`${nm} was under your wing — learning, getting sharper — and now they're gone. The village doesn't say it, but you feel the trust go. (Village trust -8.)`);
        try { if (this.recordTrauma) this.recordTrauma('mentee-death'); } catch (e) {}
        try { if (this.journalNote) this.journalNote('village', 'grief', nm + ' died while mentored in your party.'); } catch (e) {}
      }
      if (v.mentored) delete v.mentored[vid];
    } catch (e) {}
    // CRISIS (Steve 2026-10-09): the schism — the village cast one out.
    // This is the one removal choke point, so moot exiles and the freeloader
    // vote-out both land here. Genuine expulsions only: 'killed'/'fled' pass by.
    if (how === 'exiled') {
      try {
        const nm = (() => { try { return this.displayName(vid); } catch (e) { return 'Someone'; } })();
        if (this.fireCrisis) this.fireCrisis('schism', { name: nm });
      } catch (e) {}
    }
    v.roster = (v.roster || []).filter(id => id !== vid);
    for (const gr of (v.groups || [])) gr.members = (gr.members || []).filter(m => m !== vid);
    v.exiles = v.exiles || [];
    // NO DOUBLE EXILE (break-it social r9 2026-10-09): an accused exiled via a
    // non-moot path then sentenced 'exile' at the moot used to land in
    // v.exiles twice — two walkings-out for one leaving.
    if (how !== 'killed' && !(v.exiles.some(e => e && e.vid === vid))) v.exiles.push({ vid, day: this.state.scholar.day, how: how || 'left' });
    // PHANTOM WITNESS (break-it social r9 2026-10-09): exiled/fled removals
    // kept grid + node positions — the gone counted as witnesses() and
    // combatWitnessReact spoke lines for them ("Mei watches, jaw tight" from
    // someone three nodes away). The 'killed' path already cleared positions;
    // every removal does now.
    try { if (v.positions) delete v.positions[vid]; } catch (e) {}
    try { if (v.nodePos) delete v.nodePos[vid]; } catch (e) {}
    // LEADERSHIP HYGIENE (break-it social r10 2026-10-10): a removed
    // contender's heat, challenge, and alliances die with them. The old code
    // left v.challenge pointing at a ghost — agencyLeadershipTick
    // early-returns while any challenge is set (no new challenges until the
    // ghost's challenge aged out ~8 parts), yield/standGround spoke lines to
    // someone who'd walked out, and askSupport could rally support against
    // stale heat for an exiled contender.
    try {
      if (v.heat) delete v.heat[vid];
      if (v.challenge && v.challenge.cid === vid) v.challenge = null;
      if (v.allies) for (const aid of Object.keys(v.allies)) {
        if (aid === vid || v.allies[aid] === vid) delete v.allies[aid];
      }
    } catch (e) {}
    // DOUBT CLOSURE (detective 2026-10-09e): open doubts about the removed
    // die with them — resolved as UNANSWERED, never silently dropped or
    // left open with no resolution path. Truth module owns the closer;
    // removeVillager is the one removal choke point.
    try { if (this.closeDoubtsForGone) this.closeDoubtsForGone(vid, how); } catch (e) {}
    // GHOST-TRIAL CLOSURE (break-it social r11 2026-10-10): an open or
    // dormant case naming the removed as ACCUSED dies with them — the moot
    // doesn't try the dead. The old code let an accused killed mid-case be
    // convened, voted on, and sentenced (exile, for a corpse). Death only
    // ('killed'/'ambushed'): an EXILED accused is still tried in absentia
    // (r9 design — the fire can condemn someone who's gone). Cases where
    // the removed was the TARGET or the accuser stand — the crime happened;
    // the village can still name it. Same class as doubt closure above.
    try {
      const bs = this.betrayalState ? this.betrayalState() : null;
      const dead = how === 'killed' || how === 'ambushed';
      if (dead) for (const c of ((bs && bs.cases) || [])) {
        if ((c.status === 'open' || c.status === 'dormant') && (c.accused || []).includes(vid)) {
          c.status = 'resolved'; c.resolution = 'accused_died';
          const nm = (() => { try { return this.displayName(vid); } catch (e) { return 'They'; } })();
          this.say(`${nm} is gone — the moot doesn't try the dead. The case dies with the accused; the fire remembers the rest.`);
          try { this.journalNote && this.journalNote('village', 'trial', `Case against ${nm} closed: the accused is dead.`); } catch (e) {}
        }
      }
    } catch (e) {}
    // GHOST-QUEST CLOSURE (break-it social r9 2026-10-09): a quest anchored to
    // a removed giver completed posthumously — the dead "took" the dandelions
    // and the pantry got paid. The debt dies with the leaving: lapse it aloud.
    try {
      const s = this.state.scholar || {};
      const q = s.activeQuest;
      if (q && q.giver && q.giver === vid) {
        s.activeQuest = null;
        const nm = (() => { try { return this.displayName(vid); } catch (e) { return 'They'; } })();
        this.say(`${nm} is gone${how === 'killed' ? ' — dead' : ''}. The errand dies with them; nobody's waiting on those dandelions now.`);
      }
    } catch (e) {}
    // PROMISE RELEASE (break-it social r9 2026-10-09): a promise to the
    // removed is neither kept nor broken — it's released. Otherwise
    // checkPromises would rot it at 7 days (-15 trust on a ghost) or "keep"
    // it across the fire ("catches your eye" from a corpse).
    try {
      const pr = (this.state.village || {}).promises || {};
      if (pr[vid] && !pr[vid].kept) {
        pr[vid].kept = 'released';
        const nm = (() => { try { return this.displayName(vid); } catch (e) { return 'They'; } })();
        this.say(`The promise you made ${nm} isn't broken — it's just unkeepable now. You carry that differently.`);
      }
    } catch (e) {}
    // DEAD IS DEAD (2026-10-08): 'killed' removals must mark the villager
    // record — vpOf(vid).dead is read by game code (party skips, System
    // fragments, record filters) and must not lie about a corpse.
    // WEIRDNESS HUNT (2026-10-10): 'ambushed' is also a death
    // (simNpcAmbush registers the death, then removes) — the old
    // killed-only check left ambush victims reading as alive.
    if (how === 'killed' || how === 'ambushed') {
      try {
        const rec = (this.data.villagers || []).find(x => x.id === vid)
          || (this.data.background_survivors || []).find(x => x.id === vid);
        if (rec) rec.dead = true;
      } catch (e) {}
    }
  },

  // ---------- 6. AFTERMATH ----------
  ambushAftermath(plot, outcome) {
    // the plot is OVER: mark it resolved and clear the confrontation state.
    // (Leaving resolved=false / state='confront' was stale state after a
    // transition — any future "open plots" query would misfire on it.)
    plot.outcome = outcome; plot.resolved = true; plot.state = 'aftermath';
    const s = this.state.scholar;
    // end any ambush conversation
    try {
      const c = this.convoGet(plot.leader);
      if (c.thread === 'ambush') { c.thread = null; c.ambushPlot = null; }
    } catch (e) {}
    if (outcome === 'knocked_out') {
      // they take some of your things and leave you
      this.say(`Darkness, then dirt. You wake up lighter — pack rifled — and hurting. But alive. They couldn't finish it.`);
      plot.woundsTaken = (plot.woundsTaken || 0) + 10;
      s.health = Math.max(1, (s.health == null ? 100 : s.health) - 10);
      try { this.addTrauma(18); } catch (e) {}
    }
    if (outcome === 'talked_down') {
      // nobody bled — but the village still hears about the plot, and the
      // talk-down itself is evidence: they backed off when confronted.
      this.say(`You walk back to Haven with all of them, at a distance, in silence. Alive — and nobody's hands are clean, least of all theirs.`);
      try { this.addTrauma(6); } catch (e) {}
    }
    const c = this.openCase(plot, 'ambush');
    if (outcome === 'talked_down') {
      c.talkedDown = true;
      try {
        this.notePlayerEvidence && this.notePlayerEvidence(c, 'Talked them down at the site — they backed off when confronted.');
        this.moveBelief(c, -6, 'the target talked them down, unharmed');
      } catch (e) {}
    }
    // THEIR story gets out first — first-mover advantage (seeded in openCase)
    // witnesses: who saw you leave together
    try {
      const wit = this.witnesses(6) || [];
      plot.witnesses = wit.filter(id => id !== plot.leader && !plot.accomplices.includes(id)).slice(0, 3);
    } catch (e) { plot.witnesses = []; }
    this.say(`Back at Haven, the story is already moving without you. ${(() => {
      const n = [plot.leader, ...((plot.accomplices || []).filter(Boolean))].filter(Boolean).length;
      return n <= 1 ? 'One voice' : n === 2 ? 'Two voices' : n === 3 ? 'Three voices' : `${n} voices`;
    })()}, one story, rehearsed on the walk back.`);
    // CLOSING LINE (Steve 2026-10-08): the aftermath branch in convoTurn
    // renders res.line as narration. Each outcome gets its own closing beat —
    // the old single fallback ("You get out. Breathing hard, alive.") was an
    // escape line that also landed on talk-downs, knockouts, and fights won.
    const closingLine = {
      escaped: `You get out. Breathing hard, alive.`,
      talked_down: `You talked them down. Now you have to live next to them.`,
      fought_off: `Down, not dead. And the whole village is about to hear about it.`,
      knocked_out: `Lighter, hurting, alive. And owed an answer.`,
    }[outcome] || `You get out. Breathing hard, alive.`;
    return { aftermath: true, caseId: c.id, outcome, line: closingLine };
  },
  openCase(plot, charge) {
    const bs = this.betrayalState();
    const id = 'case_' + (++bs.seq);
    const accused = [plot.leader, ...plot.accomplices];
    const c = {
      id, plotId: plot.id, charge, day: this.state.scholar.day,
      accused, target: plot.target, weakest: plot.weakest,
      belief: {}, evidence: [], bribes: [], exposedBribes: [],
      inconsistencies: [], status: 'open', flipped: null,
      playerRole: this.isPlayer(plot.target) ? 'target' : (this.isPlayer(accused[0]) || accused.some(a => this.isPlayer(a)) ? 'accused' : 'bystander'),
    };
    // did the player witness it?
    try {
      if ((plot.witnesses || []).includes(this.villagerId)) c.playerRole = 'witness';
    } catch (e) {}
    bs.cases.push(c);
    this.initBelief(c);
    // the accused's cover story + plantable inconsistencies are part of the
    // case itself — every case opens with them, no matter which path opened
    // it (natural aftermath, accusation, or debug scenario). Without this,
    // pressing accomplices and site examination have nothing to find.
    try { this.seedCoverStory(c, false); } catch (e) {}
    return c;
  },
  getCase(id) { return (this.betrayalState().cases || []).find(c => c.id === id); },
  // belief: -100 (believes the accused's enemies / the target) .. +100 (believes the accused)
  initBelief(c) {
    const v = this.state.village;
    const plot = (this.betrayalState().plots || []).find(p => p.id === c.plotId) || {};
    for (const vid of this.npcIds()) {
      if (c.accused.includes(vid)) { c.belief[vid] = 90; continue; }
      let b = 25; // first-mover: their story landed first
      const t = ((v.trust || {})[vid]) || 10;
      // relationship-weighted credibility
      if (this.isPlayer(c.target)) b -= (t - 25) * 0.8;
      else b -= (this.pairAffinity(vid, c.target) * 0.8);
      for (const a of c.accused) b += this.pairAffinity(vid, a) * 0.5;
      c.belief[vid] = clamp(Math.round(b), -100, 100);
    }
  },
  avgBelief(c) {
    const vals = this.npcIds().filter(id => !c.accused.includes(id)).map(id => c.belief[id] || 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },
  moveBelief(c, delta, why) {
    for (const vid of this.npcIds()) {
      if (c.accused.includes(vid)) continue;
      c.belief[vid] = clamp((c.belief[vid] || 0) + delta, -100, 100);
    }
    if (why) c.evidence.push({ day: this.state.scholar.day, text: why, delta });
  },
  // cover stories the accused tell
  seedCoverStory(c, simHeard) {
    // idempotent: the case seeds its cover once (see openCase). Re-seeding
    // would clobber found inconsistencies mid-investigation.
    if (c.coverSeeded) return;
    c.coverSeeded = true;
    const plot = (this.betrayalState().plots || []).find(p => p.id === c.plotId) || {};
    const tname = this.disp(c.target);
    const stories = [
      { text: `${tname} came at us out there. We defended ourselves.`, dims: { trustworthy: -10, brave: 4 } },
      { text: `It was already happening when we got there — something in the trees. We ran.`, dims: { trustworthy: -6 } },
      { text: `${tname} went strange. Talking wild. We tried to calm them down.`, dims: { trustworthy: -12, honest: -4 } },
    ];
    const st = pick(stories);
    c.coverStory = st.text;
    // plant the inconsistencies the detective work will find. Attribute them
    // to REAL people: plots with fewer than 2 accomplices used to plant
    // claims[undefined] (accomplices[1] on a 2-person plot), leaving an
    // inconsistency no pressing could ever catch. A solo plotter contradicts
    // their OWN first telling — selfContra.
    const accs = [plot.leader, ...((plot.accomplices || []).filter(Boolean))].filter(Boolean);
    const a1 = accs[1] || accs[0], a2 = accs[2] || accs[1] || accs[0];
    const mkInc = (field, first, second, alt) => alt === accs[0]
      ? { field, claims: { [accs[0]]: first }, altClaim: second, selfContra: true, found: false }
      : { field, claims: { [accs[0]]: first, [alt]: second }, found: false };
    c.inconsistencies = [
      mkInc('time', 'dusk', 'full dark', a1),
      mkInc('place', 'the creek', 'near the ridge', a2),
    ];
    try {
      // BREAK-IT (social r7 2026-10-09): the cover story is third-party WORDS
      // about the target — rep only, never trust (r6 canon). The old
      // seed-time applyRep drifted the target's trust -3..-8 from a story the
      // plotters told. The who-dim marks the NPC subject so propagation
      // routes to their record (r6 KILL-2 pattern); when the TARGET is the
      // player the dims already route to listeners' view of the player, so
      // no who-dim is needed — only the trust silence.
      const targetIsPlayer = this.isPlayer(c.target);
      const targetId = targetIsPlayer ? this.villagerId : c.target;
      const dims = targetIsPlayer ? Object.assign({}, st.dims) : Object.assign({ who: targetId }, st.dims);
      this.seedGossip('ambush_cover_' + c.id, dims, [plot.leader, ...plot.accomplices], true);
      // their version names the target as the problem
      this.applyRep(targetId, st.dims, 0.8, true);
    } catch (e) {}
  },
  seedTargetStory(c) {
    // the target's version, when they get to tell it
    // BREAK-IT (social r7 2026-10-09): trust-silent (noTrust). The old seed
    // had no who-dim and no noTrust, so the target telling their side raised
    // every listener's TRUST of the player (+3/hop) — the r6 KILL-1
    // positive-words trust farm class. The who-dim marks an NPC subject (r6
    // KILL-2 pattern); when the target is the player the dims already route
    // to listeners' view of the player, so only the trust silence is added.
    try {
      const targetIsPlayer = this.isPlayer(c.target);
      const targetId = targetIsPlayer ? this.villagerId : c.target;
      const dims = targetIsPlayer
        ? { trustworthy: 6, honest: 6 }
        : { who: targetId, trustworthy: 6, honest: 6 };
      this.seedGossip('ambush_target_' + c.id, dims, [targetId], true);
    } catch (e) {}
    this.moveBelief(c, -8, 'the target told their version');
  },

  // ----- player tools -----
  // (a) evidence: show your wounds
  showWounds(caseId) {
    const c = this.getCase(caseId); if (!c) return null;
    const plot = (this.betrayalState().plots || []).find(p => p.id === c.plotId) || {};
    const w = plot.woundsTaken || 0;
    if (!this.isPlayer(c.target) || w <= 0) { this.say(`You have no wounds to show. That weakens everything.`); return null; }
    this.say(`You show them. The bruises, the cuts. "Does this look like I started it?" Silence does the rest.`);
    this.moveBelief(c, -15, 'showed wounds');
    try { this.addDoubt(plot.leader, 'observation', `Their story doesn't explain your wounds.`, [], { caseId: c.id }); } catch (e) {}
    return true;
  },
  // (b) evidence: revisit the site
  examineAmbushSite(caseId) {
    const c = this.getCase(caseId); if (!c || c.siteExamined) return null;
    c.siteExamined = true;
    try { this.tickAction(32); } catch (e) {}
    const plot = (this.betrayalState().plots || []).find(p => p.id === c.plotId) || {};
    const dropper = pick(plot.accomplices || []);
    // count the feet honestly — plots run 1 to 3 attackers, never "three" by law
    const nfeet = [plot.leader, ...((plot.accomplices || []).filter(Boolean))].filter(Boolean).length;
    const feet = nfeet <= 1 ? 'One set of feet' : nfeet === 2 ? 'Two sets of feet' : nfeet === 3 ? 'Three sets of feet' : `${nfeet} sets of feet`;
    this.say(`The ground out there is churned. ${feet} circling one. And something dropped in the scuffle — ${dropper ? this.whoTag(dropper) + '\'s, by the look of it.' : 'a strip of cloth.'} The earth keeps better records than people.`);
    this.moveBelief(c, -10, `site evidence: ${nfeet} on one, dropped belongings`);
    return true;
  },
  // (c) witnesses: name who saw you leave together
  nameWitnesses(caseId) {
    const c = this.getCase(caseId); if (!c || c.witnessesNamed) return null;
    const plot = (this.betrayalState().plots || []).find(p => p.id === c.plotId) || {};
    c.witnessesNamed = true;
    const wits = plot.witnesses || [];
    // role-aware: "you" only when YOU were the target who walked out
    const you = this.isPlayer(c.target);
    const tname = you ? 'you' : this.disp(c.target);
    if (!wits.length) { this.say(`No one saw ${tname} leave. Just trees.`); return null; }
    // count the walk honestly — the party was the plotters plus the target
    const nwalk = (c.accused || []).length + 1;
    const all = nwalk <= 2 ? 'both of you' : nwalk === 3 ? 'all three of you' : nwalk === 4 ? 'all four of you' : `all ${nwalk} of you`;
    const walked = you ? `saw you walk out together — ${all}, friendly as anything`
      : `saw ${tname} walk out with them — friendly as anything`;
    this.say(`${this.capFirst(wits.map(w => this.whoTag(w)).join(', '))} ${walked}. That much, at least, nobody can rehearse away.`);
    this.moveBelief(c, -8 * Math.min(2, wits.length), 'witnesses saw them leave together');
    return true;
  },
  // (d) interrogate separately: catch the planted inconsistencies
  pressAccomplice(caseId, vid) {
    const c = this.getCase(caseId); if (!c) return null;
    if (!c.accused.includes(vid)) { this.say(`They weren't there.`); return null; }
    const inc = (c.inconsistencies || []).find(i => !i.found && i.claims[vid]);
    if (!inc) {
      // EXHAUSTED PRESS (Steve 2026-10-06): rotate the fallback — never the
      // same line twice in a row. The story holding is still information.
      this.say(this.convoPickCycle(vid, 'pressheld', [
        'Their story holds — this time. The rehearsed parts are smooth.',
        'You walk it back again, slower. Nothing shifts. That, too, is an answer.',
        'They tell it the same way twice. Either it\'s true, or it\'s been rehearsed a lot.',
        'No crack this time. You watch their hands instead of their words. Steady.',
        'You press; they don\'t bend. It tells you something anyway.',
      ]));
      return null;
    }
    inc.found = true;
    const other = c.accused.find(a => a !== vid && inc.claims[a]);
    let line;
    if (inc.selfContra) {
      line = `"Walk me through it again. Slowly." ${this.whoTag(vid)} says ${inc.claims[vid]}. But the first telling was ${inc.altClaim}. Same mouth, different story. Somebody's lying.`;
    } else {
      line = `"Walk me through it again. Slowly." ${this.whoTag(vid)} says ${inc.claims[vid]}. But ${other ? this.whoTag(other) + ' said ' + inc.claims[other] + '.' : 'that\'s not what the ground says.'} Somebody's lying.`;
    }
    this.say(line);
    try {
      this.addDoubt(vid, 'contradiction', inc.selfContra
        ? `${this.displayName(vid)} contradicted their own first telling about the ${inc.field} (${inc.claims[vid]} vs ${inc.altClaim}).`
        : `${this.displayName(vid)} said ${inc.claims[vid]} about the ${inc.field}; the others said otherwise.`,
        [], { caseId: c.id });
    } catch (e) {}
    this.moveBelief(c, -12, `caught inconsistency (${inc.field})`);
    return true;
  },
  // (e) TURN THE WEAKEST — prisoner's dilemma
  approachWeakest(caseId, offerLeniency) {
    const c = this.getCase(caseId); if (!c || c.flipped) return null;
    const w = c.weakest;
    if (!w) return null;
    const name = this.whoTag(w);
    let chance = 0.25;
    try { chance += (this.getDoubts(w, true) || []).length * 0.2; } catch (e) {}
    const t = ((this.state.village.trust || {})[w]) || 10;
    chance += (t - 20) * 0.008;
    if (offerLeniency) chance += 0.2;
    this.say(`Alone with ${name}. "Whoever talks first gets leniency. That's the offer. It expires when I walk away."`);
    if (R() < chance) {
      c.flipped = w;
      this.say(`${this.capFirst(name)} breaks. All of it — whose idea, what they planned, what they told the village after. The rehearsed story comes apart like wet paper.`);
      try { this.addDoubt(c.accused.find(a => a !== w) || w, 'contradiction', `${name} confessed and named the others.`, [], { caseId: c.id }); } catch (e) {}
      this.moveBelief(c, -45, 'the weakest talked');
      return true;
    }
    this.say(`${this.capFirst(name)} stares at the ground. "I can't." Maybe later. Maybe never. The offer stands — for now.`);
    return false;
  },
  // (f) say nothing
  letItLie(caseId) {
    const c = this.getCase(caseId); if (!c) return null;
    c.status = 'dormant';
    this.say(`You say nothing. Watch your back instead. The village will remember that you didn't fight it — and so will they.`);
    // cold war: trust bleeds, re-arm more likely
    const t = this.state.village.trust || {};
    for (const a of c.accused) t[a] = Math.max(0, ((t[a]) || 10) - 15);
    const bs = this.betrayalState();
    bs.coldWar = (bs.coldWar || 0) + 1;
    return true;
  },

  // ---------- 7. THE TRIAL ----------
  // NOT deterministic. Attendance varies, mood shifts, factions pull, noise happens.
  // Justice can be bought — by anyone — and bribery can detonate.
  callMoot(caseId, byId) {
    const c = this.getCase(caseId); if (!c) return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    // IDEMPOTENT (break-it social r11 2026-10-10): the moot is already in
    // session (trial tallied, possibly awaiting the player's vote) — don't
    // re-convene it. playerCaseTick fired this every day for an open case
    // whose vote was pending, re-announcing the moot, burning tickAction(48)
    // per day, and re-randomizing the trial under the player's feet.
    if (c.trial) return null;
    const caller = byId || this.villagerId;
    if (this.isPlayer(caller)) {
      // PLAYER-CONVENED (Steve 2026-10-08): the moot is yours — tallyVotes
      // must always include your vote (see tallyVotes).
      c.playerConvened = true;
    }
    // post-System: the moot is BROADCAST. Countdown energy, the galaxy watching.
    if (this.state.systemArrived) {
      this.sysSay(`🔴 LIVE! THE MOOT! The fire's built HIGH and the whole GALAXY is watching!`);
      this.sysSay(`TONIGHT: ${this.whoTag(c.accused[0]).toUpperCase()} stands accused — ${this.chargeLine(c.charge).toUpperCase()}! The gamblers are FRENZIED! Place your bets, place your bets!`);
    }
    if (this.isPlayer(caller)) {
      // HONESTY (break-it social 2026-10-08): the engine seats ~88% of
      // voters (tallyVotes) — the old line promised "everyone comes".
      this.say(`You call a moot. The fire gets built up. Word travels fast — almost everyone comes, even the ones who'd rather not.`);
    } else {
      const n = (() => { try { return this.whoTag(caller); } catch (e) { return 'Someone'; } })();
      this.say(`${this.capFirst(n)} calls the moot. The fire gets built up — word travels fast, and almost everyone comes.`);
    }
    // DRAMA (Steve 2026-10-07, C1): the moot is a spectacle — fire pulse + banner
    try {
      const callerName = this.isPlayer(caller) ? 'You' : (() => { try { return this.whoTag(caller); } catch (e) { return 'Someone'; } })();
      this.drama('social', { type: 'moot', caller: callerName });
    } catch (e) {}
    try { this.tickAction(48); } catch (e) {}
    return this.conductTrial(c);
  },
  // bribe a voter. Expensive, secret, detonable.
  // bribe price: temperament sets the tag. Extracted so the choice gating
  // (can they be bought at all) and the affordability check use the same number.
  caseBribePrice(cs, voterId) {
    let vp = null;
    try { vp = this.vpOf(voterId) || {}; } catch (e) {}
    const temp = (vp.personality && vp.personality.temperament) || 'steady';
    return temp === 'warm' ? 1500 : temp === 'dark' ? 400 : 800;
  },
  // who can even be bought? warm/dark/steady/bold/restless/intense/dry have a
  // price. The rest (cautious, gentle, withdrawn, prickly) don't take bribes —
  // unless they already distrust the accuser's side. No 'principled'
  // temperament exists in the generator, so this is the principled stand-in.
  caseBribable(cs, voterId) {
    let vp = null;
    try { vp = this.vpOf(voterId) || {}; } catch (e) {}
    const temp = (vp.personality && vp.personality.temperament) || 'steady';
    if (['warm', 'steady', 'bold', 'restless', 'intense', 'dry', 'dark'].includes(temp)) return true;
    const side = (cs && cs.accuser) || (cs && cs.accused && cs.accused[0]);
    try { return !!side && this.pairAffinity(voterId, side) <= 0; } catch (e) { return false; }
  },
  // can the PLAYER afford the bribe? pack food + pantry stockpile.
  canAffordBribe(cs, voterId) {
    const price = this.caseBribePrice(cs, voterId);
    let pack = 0;
    try { pack = this.playerPackKcal() || 0; } catch (e) {}
    // PANTRY IS REAL (break-it 2026-10-08): the pantryKcal scalar is a phantom
    // (pantryKcalLive recomputes from pantry items) — read the live total.
    let pantry = 0;
    try { pantry = (typeof this.pantryKcalLive === 'function') ? (this.pantryKcalLive(this.state.village) || 0) : 0; } catch (e) {}
    if (!pantry) pantry = (this.state.village && this.state.village.pantryKcal) || 0; // compat fallback
    // EXILE (break-it social r11 2026-10-10): pantry funds are the village's
    // hands, not yours — havenStoresAccess() is 'none' while exiled. An
    // exile can't buy votes with the fire's own food (sibling sweep of the
    // exile pantry-drain class).
    try { if (this.havenStoresAccess && this.havenStoresAccess() === 'none') pantry = 0; } catch (e) {}
    return pack + pantry >= price;
  },
  // pay for a player's bribe: carried food first, then the pantry stockpile.
  // Returns the ACTUAL kcal that left the player's stores — whole-unit pack
  // spends can overshoot the price, and the fiction must name what moved
  // (BREAK-IT social 2026-10-08: the label said 800 while a chunky pack
  // unit silently spent 1000).
  payBribe(cs, voterId, price) {
    let spentPack = 0, spentPantry = 0;
    try {
      const p = Math.max(0, price || 0);
      let pack = this.playerPackKcal() || 0;
      const fromPack = Math.min(pack, p);
      if (fromPack > 0) spentPack = this.playerPackSpend(fromPack);
      const rest = p - spentPack; // actuals, not intentions — whole-unit spends can overshoot
      if (rest > 0) {
        // PANTRY IS REAL (break-it 2026-10-08): the old code decremented the
        // phantom pantryKcal scalar — pantryKcalLive recomputes from items, so
        // pantry-funded bribes were FREE (food never left). Remove real items
        // instead, and record the taking: communal food spent on a secret bribe
        // feeds the same takes/gives bookkeeping as a pantry withdrawal —
        // theft allowed, socially punished.
        let removed = 0;
        // PANTRY GATE (break-it social r11 2026-10-10): see canAffordBribe —
        // the exiled can't reach the hall's stores even for a bribe.
        const pantryOpen = (() => { try { return !(this.havenStoresAccess && this.havenStoresAccess() === 'none'); } catch (e) { return true; } })();
        if (pantryOpen && typeof this._removePantryKcal === 'function') removed = this._removePantryKcal(rest) || 0;
        else if (pantryOpen) {
          this.state.village.pantryKcal = Math.max(0, (this.state.village.pantryKcal || 0) - rest);
          removed = rest;
        }
        spentPantry = removed;
        if (removed > 0) {
          // payBribe is the player's bribe path — the taking is theirs.
          const v = this.state.village || {};
          v.takes = v.takes || {};
          v.takes[this.villagerId] = (v.takes[this.villagerId] || 0) + removed;
        }
      }
    } catch (e) {}
    return Math.round(spentPack + spentPantry);
  },
  bribeVoter(caseId, voterId, byId, amount) {
    const c = this.getCase(caseId); if (!c) return null;
    if (c.accused.includes(voterId)) return null;
    // IDEMPOTENT (break-it 2026-10-08): one bribe per briber per voter. The UI
    // never re-offers a bought voter, but the engine must not stack dead
    // entries (or charge twice) on a repeat call — e.g. a double-tap.
    if ((c.bribes || []).some(b => b.voter === voterId && b.by === byId)) {
      if (this.isPlayer(byId)) this.say(`${this.whoTag(voterId)} is already bought. Paying twice doesn't buy them twice.`);
      return null;
    }
    const price = this.caseBribePrice(c, voterId);
    if ((amount || 0) < price) { this.say(`That's not enough to buy ${this.whoTag(voterId)}. Insulting, actually.`); return null; }
    c.bribes.push({ voter: voterId, by: byId, amount, day: this.state.scholar.day, trace: true });
    // the trace: sudden friendliness, a gift noticed
    if (R() < 0.5) {
      try { this.addDoubt(voterId, 'observation', `${this.whoTag(voterId)} has been suddenly warm toward ${this.whoTag(byId)} — and there's a new something in their pack.`, [], { eventBacked: true }); } catch (e) {}
    }
    if (this.isPlayer(byId)) this.say(`Done. Expensive, quiet. Secrets like this have a half-life.`);
    return true;
  },
  investigateBribery(caseId) {
    const c = this.getCase(caseId); if (!c) return null;
    const found = [];
    for (const b of (c.bribes || [])) {
      if (c.exposedBribes.includes(b.voter)) continue;
      // bribes that left traces (sudden friendliness, new goods) are findable;
      // clean ones mostly aren't — follow the food, it usually works
      const p = b.trace === false ? 0.35 : 0.8;
      if (R() < p) found.push(b);
    }
    if (!found.length) { this.say(`You follow the food, the gifts, the sudden friendliness. Nothing you can prove — yet. Dig again; the trail is still warm.`); return []; }
    for (const b of found) {
      this.say(`There it is: ${this.whoTag(b.by)} bought ${this.whoTag(b.voter)}. Follow the food — it always works.`);
    }
    return found;
  },
  exposeBribery(caseId, voterId) {
    const c = this.getCase(caseId); if (!c) return null;
    const b = (c.bribes || []).find(x => x.voter === voterId && !c.exposedBribes.includes(voterId));
    if (!b) return null;
    c.exposedBribes.push(voterId);
    // the swing: the village hates being bought
    this.say(`At the moot, you lay it out: who paid whom, what changed hands. The fire goes very quiet. Nobody likes being bought — least of all the ones who weren't.`);
    // DRAMA (Steve 2026-10-07, C1): the lie breaks — spotlight narrows, ⚡ crackle
    try {
      const liarName = (() => { try { return this.displayName(b.by); } catch (e) { return 'The briber'; } })();
      this.drama('social', { type: 'liar', name: liarName });
    } catch (e) {}
    // SELF-EXPOSURE BACKFIRES (break-it 2026-10-08): exposing your OWN bribe
    // used to swing belief +25 toward your side — a double-dip on top of the
    // bought vote itself. Confessing you bought a vote turns the fire on YOU.
    // BREAK-IT (social 2026-10-08): the old code swung -30 (toward guilty)
    // whenever the briber was the player — including a player VICTIM, where
    // -30 pushed the case toward conviction and REWARDED the confession (the
    // double-dip, still alive). Direction is by SIDE: accused-side bribery
    // exposed -> the fire turns on the accused (-30, toward guilty);
    // victim-side bribery exposed -> the case is tainted (+25, toward
    // acquit). The trust detonation below still lands on the briber.
    const selfExposed = !!(this.isPlayer && this.isPlayer(b.by));
    this.moveBelief(c, c.accused.includes(b.by) ? -30 : 25,
      selfExposed ? 'exposed their own bribery' : 'bribery exposed');
    this.notePlayerEvidence(c, `Exposed: ${this.displayName(b.by)} bought ${this.displayName(b.voter)} (${b.amount} kcal).`);
    // detonates on the briber too
    const t = this.state.village.trust || {};
    t[b.by] = Math.max(0, ((t[b.by]) || 10) - 25);
    return true;
  },
  villageMood() {
    // recent deaths, crimes, hunger → punitive; feasts, births → lenient
    let m = 0;
    try {
      const j = this.justiceState();
      m += (j.crimes || []).filter(cr => this.state.scholar.day - cr.day < 3).length * 8;
      const v = this.state.village;
      if ((v.pantryKcal || 0) < 5000) m += 10;
      // SWITCHBOARD COST (comms 2026-10-10): timed mood modifiers — e.g. the
      // resentment of honoring the weakest forager with the relay.
      const day = this.state.scholar.day || 0;
      for (const mm of (v.moodMods || [])) {
        if ((mm.untilDay || 0) >= day) m += mm.amt;
      }
    } catch (e) {}
    return clamp(m, -20, 30);
  },
  // Trial vote tally, extracted so the wild-day draw can be forced for
  // counterfactual measurement (sim) and testing. rng defaults to Math.random.
  // POLARITY: belief is negative = guilty (evidence moves it down), so a
  // voter convicts when their final score s < 0.
  tallyVotes(c, wildDay, rng) {
    const R = rng || Math.random;
    const v = this.state.village;
    const accused = c.accused[0]; // the ringleader stands trial (accomplices judged with them)
    let voters = this.npcIds().filter(id => !c.accused.includes(id));
    // SWITCHBOARD COST (comms 2026-10-10): the relay holder runs the relay,
    // not the moot — they're not at the fire to vote.
    try {
      const _sw = this.switchboard && this.switchboard();
      if (_sw && _sw.holderId) voters = voters.filter(id => id !== _sw.holderId);
    } catch (e) {}
    // attendance varies
    const present = voters.filter(() => R() < 0.88);
    const mood = this.villageMood();
    const trialSwing = (wildDay ? (R() * 140 - 70) : (R() * 24 - 12)) + mood * 0.5;
    // SWITCHBOARD COST (comms 2026-10-10): appointing the village's best
    // talker to the relay costs the moots their voice — the swing loses 8.
    let _swingAdj = 0;
    try { if (this.switchboardTalkerCost && this.switchboardTalkerCost()) _swingAdj = -8; } catch (e) {}
    const _trialSwing = trialSwing + _swingAdj;
    const noise = () => (R() * 30 - 15);
    let guilty = 0, votes = [];
    // the player's role: always at the moot unless they're the one accused.
    // PLAYER-CONVENED moots (Steve 2026-10-08): you called it, you're there —
    // the vote is unconditional. Otherwise attendance is 90%.
    // EXILE (break-it social r9 2026-10-09): the exiled aren't at the fire.
    const playerVoter = !this.state.scholar.exiled && !c.accused.includes(this.villagerId) && (c.playerConvened ? true : R() < 0.9);
    for (const vid of present) {
      if (vid === this.villagerId) continue; // player votes via choice below
      // belief is capped in its pull: evidence matters enormously, but the
      // room has its own weather. Nobody is un-convictable; nobody is safe.
      let s = clamp(c.belief[vid] || 0, -40, 40);
      s += _trialSwing;
      s += this.pairAffinity(vid, accused) * 0.4; // likes them → acquit
      // faction pull
      for (const gr of (v.groups || [])) {
        if (gr.members.includes(vid) && gr.members.some(m => c.accused.includes(m))) s += 12;
      }
      s += noise();
      // bribery
      const br = (c.bribes || []).find(b => b.voter === vid && !c.exposedBribes.includes(vid));
      if (br) {
        const wantsGuilty = !c.accused.includes(br.by);
        s += wantsGuilty ? -40 : 40;
      }
      const v_ = s < 0 ? 'guilty' : 'acquit';
      if (v_ === 'guilty') guilty++;
      votes.push({ vid, vote: v_, score: Math.round(s) });
    }
    return { present, votes, guilty, playerVoter, wildDay };
  },
  // ---------- trial weather ----------
  // Village trauma log: deaths and exiles put the village on edge for days.
  recordTrauma(kind) {
    const bs = this.betrayalState();
    bs.trauma = bs.trauma || [];
    bs.trauma.push({ day: this.state.scholar.day, kind });
    if (bs.trauma.length > 20) bs.trauma = bs.trauma.slice(-20);
  },
  recentTrauma(days) {
    const bs = this.betrayalState();
    const day = this.state.scholar.day;
    return (bs.trauma || []).some(t => day - t.day <= (days || 5));
  },
  // Wild-day rate. Tuned by sim (scripts/sim-trial-frequency.js): 0.10 keeps
  // the gamble alive — a good case can lose, a weak case can win — without
  // making injustice weather. Trauma clustering was tested and REJECTED:
  // in violent games the village is always "recently traumatized," which
  // pushed the effective rate back up to ~0.27. The trauma log stays, but
  // only so wild days can be narrated honestly ("still raw after the exile").
  wildDayRate() {
    return (this.WILD_DAY_RATE != null) ? this.WILD_DAY_RATE : 0.10;
  },
  conductTrial(c) {
    // TRIAL-LEVEL SWING: the village woke up angry, or forgiving. Most days
    // the room is calm and evidence rules; some days the whole village woke
    // up wrong and the trial is a crapshoot. This is the gamble Steve wants:
    // a good case can lose, a weak case can win. Rate via wildDayRate().
    const rate = this.wildDayRate();
    const wildDay = Math.random() < rate;
    const t = this.tallyVotes(c, wildDay);
    c.trial = { present: t.present, votes: t.votes, guilty: t.guilty, day: this.state.scholar.day, playerVoter: t.playerVoter, wildDay: t.wildDay };
    if (t.wildDay) {
      // narrate the weather honestly: the room is off today. If there's
      // fresh blood behind it, say so — otherwise it's just the village
      // waking up wrong, which is also true sometimes.
      let why = '';
      try {
        const tr = (this.betrayalState().trauma || []).slice(-1)[0];
        if (tr && this.state.scholar.day - tr.day <= 5) {
          why = tr.kind === 'killed' ? ' — still raw after the killing' : ' — still raw after the exile';
        }
      } catch (e) {}
      this.say(`The room is wrong today${why}. Edgy, listening for the wrong things. Evidence feels thin in here.`);
    }
    const need = Math.floor(t.present.length / 2) + 1;
    // player votes if present and not accused (the player is always at their own moot)
    if (t.playerVoter) {
      this.say(`The moot turns to you. Your vote matters here — and everyone will remember it.`);
      c.trial.awaitingPlayerVote = true;
      return { trial: true, awaitingPlayerVote: true, caseId: c.id, guiltySoFar: t.guilty, need };
    }
    return this.finishTrial(c, 0);
  },
  castPlayerVote(caseId, guiltyVote) {
    const c = this.getCase(caseId); if (!c || !c.trial || !c.trial.awaitingPlayerVote) return null;
    c.trial.awaitingPlayerVote = false;
    // EXILE (break-it social r9 2026-10-09): an exiled player isn't at the
    // fire. The moot doesn't wait — the count is taken without them, said aloud.
    if (this.state.scholar.exiled) {
      this.say(`The moot doesn't wait for the exiled. The count is taken without you.`);
      return this.finishTrial(c, 0);
    }
    return this.finishTrial(c, guiltyVote ? 1 : 0);
  },
  finishTrial(c, playerGuiltyVotes) {
    const guilty = (c.trial.guilty || 0) + (playerGuiltyVotes || 0);
    const total = c.trial.present.length + (c.trial.playerVoter ? 1 : 0);
    const need = Math.floor(total / 2) + 1;
    const convicted = guilty >= need;
    c.trial.convicted = convicted;
    c.trial.finalGuilty = guilty;
    // the verdict, with ceremony — the room, the faces, the pause.
    // Post-System the ceremony is broadcast: the LIVE tag.
    if (this.state.systemArrived) this.sysSay(`🔴 LIVE — THE VERDICT IS IN! The galaxy holds its breath!`);
    const counter = (() => {
      try {
        const pool = (c.trial.present || []).filter(id => !c.accused.includes(id) && id !== this.villagerId);
        const id = pool[0] || c.accuser || this.npcIds()[0];
        return this.whoTag(id);
      } catch (e) { return 'Someone'; }
    })();
    this.say(`The fire is built high. Nobody speaks while the count is taken — you can hear the wind past the edge of the light.`);
    this.say(`${this.capFirst(counter)} counts on their fingers, twice, like they don't trust the first number. Then, to the fire: "${guilty} for guilty. ${total - guilty} against."`);
    // DRAMA (Steve 2026-10-07, C1): the vote tally has visual weight
    try { this.drama('social', { type: 'vote', guilty, total }); } catch (e) {}
    if (convicted) {
      this.say(`A pause long enough to live in. Someone's breath catches. Then: "Guilty." Nobody looks at anybody.`);
    } else {
      this.say(`A long exhale moves around the fire like weather. "Not guilty — this time."`);
    }
    // AUDIO (Steve 2026-10-06): the moot has decided — one heavy strike.
    try { this.audioEvent('justiceVerdict'); } catch (e) {}
    // THE ROOM REMEMBERS (Steve 2026-10-05): the ceremony promises "everyone
    // will remember it" — so the player's vote lands socially, not just in
    // the count. The accused remember who voted against them; the victim's
    // side remembers who stood with them. Voting has a price either way.
    try {
      if (c.trial.playerVoter && playerGuiltyVotes !== undefined) {
        const votedGuilty = playerGuiltyVotes > 0;
        const me = this.villagerId;
        for (const aid of (c.accused || [])) {
          if (this.isPlayer(aid)) continue;
          if (votedGuilty) this.recordGrievance(aid, me, 'voted_guilty', 22);
          else { this.bumpTrust(aid, 6); this.remember(aid, 'moot_vote', 'you voted to acquit them at the moot'); }
        }
        // ambush cases name no accuser — the victim (target) brought the case
        const accuser = c.accuser;
        const vSide = (accuser && !c.accused.includes(accuser)) ? accuser : c.target;
        if (vSide && !this.isPlayer(vSide) && !c.accused.includes(vSide)) {
          if (votedGuilty) { this.bumpTrust(vSide, 6); this.remember(vSide, 'moot_vote', 'you voted guilty at the moot'); }
          else this.recordGrievance(vSide, me, 'voted_acquit', 16);
        }
        this.say(votedGuilty
          ? `Your "guilty" lands in the count, out loud, in front of everyone. The accused hear exactly who said it.`
          : `Your "not guilty" lands in the count, out loud. Across the fire, a jaw tightens. The accused breathe — and they'll remember who stood up.`);
      }
    } catch (e) {}
    if (convicted) return this.sentenceCase(c);
    // acquitted: festering or vindication
    c.status = 'acquitted'; c.resolution = 'acquitted';
    // unified pipeline: the formal track is done — re-sync the justice ladder
    try { if (c.accused.includes(this.villagerId) && typeof this.syncJusticeAfterMoot === 'function') this.syncJusticeAfterMoot('acquitted'); } catch (e) {}
    if (c.accused.includes(this.villagerId)) {
      this.say(`Not guilty. The count falls short — you breathe. But an accusation leaves a mark no verdict washes off. Some faces at the fire say they'll remember anyway.`);
      const t = this.state.village.trust || {};
      t[this.villagerId] = Math.max(0, ((t[this.villagerId]) || 10) - 8);
      return { acquitted: true, caseId: c.id };
    }
    if (this.isPlayer(c.target) && c.accused.some(a => !this.isPlayer(a))) {
      this.say(`They walk. The story stands — theirs. You'll be watching your back for a long while.`);
    }
    return { acquitted: true, caseId: c.id };
  },
  sentenceCase(c) {
    // the village chooses the sentence: the CHARGE sets the baseline, the
    // belief decides the close calls. A murder conviction norms to exile —
    // exile is a real risk — while theft needs the village baying for blood.
    // (Natural play almost never pushes avgBelief below -40, which is why the
    // old belief-only ladder exiled nobody.)
    const avg = this.avgBelief(c);
    const charge = c.charge || 'theft';
    const sev = { cannibalism: 5, murder: 4, ambush: 3, assault: 3, theft: 2, intimidation: 1 }[charge] || 1;
    // the flipped weakest bought leniency with testimony — the village honors
    // the deal, and the accomplices face the heavy sentence
    if (c.flipped) return this.resolveCase(c.id, 'exile');
    const exileAt = sev >= 4 ? -5 : sev === 3 ? -25 : -40;
    const weregildAt = -10;
    const cname = (() => { try { return this.whoTag(c.accused[0]); } catch (e) { return 'the accused'; } })();
    // whoTag gives 'you' for the player — fine mid-sentence, but these lines
    // START the sentence, so capitalize (was: "you pays. And stays").
    const cnameCap = cname ? cname.charAt(0).toUpperCase() + cname.slice(1) : cname;
    if (avg < exileAt) {
      this.say(`The oldest among them stands. The fire seems to lean in. "${cnameCap} — take what you can carry and go."`);
      return this.resolveCase(c.id, 'exile');
    }
    // a murder conviction always costs at least weregild — the village can't
    // shrug at a killing, even a shaky one
    if (avg < weregildAt || sev >= 4) {
      const payVerb = this.isPlayer(c.accused[0]) ? 'pay' : 'pays';
      const stayVerb = this.isPlayer(c.accused[0]) ? 'stay' : 'stays';
      this.say(`The sentence is spoken low, like something heavy set down. "${cnameCap} ${payVerb}. And ${stayVerb} — this time."`);
      return this.resolveCase(c.id, 'weregild');
    }
    // weak conviction → schism or cold war
    return this.resolveCase(c.id, R() < 0.5 ? 'schism' : 'cold_war');
  },

  // ---------- 8. RESOLUTIONS (the spectrum) ----------
  resolveCase(caseId, path) {
    const c = this.getCase(caseId); if (!c) return null;
    // no double jeopardy: a resolved case stays resolved
    if (c.status === 'resolved') return { resolved: true, path: c.resolution, caseId: c.id, already: true };
    const v = this.state.village;
    c.status = 'resolved'; c.resolution = path;
    const names = c.accused.map(a => this.whoTag(a)).join(', ');
    const namesCap = names ? names.charAt(0).toUpperCase() + names.slice(1) : names; // sentence-start, not "you pays"
    if (path === 'exile') {
      // the flipped weakest gets leniency
      const exiled = c.flipped ? c.accused.filter(a => a !== c.flipped) : c.accused;
      for (const vid of exiled) {
        if (this.isPlayer(vid)) { this.exilePlayer('moot'); continue; }
        this.say(`${this.displayName(vid)} is exiled. "Take what you can carry and go." The village watches them walk until the trees close.`);
      // DRAMA (Steve 2026-10-07, C1): exile is the darkest social moment
      try { this.drama('social', { type: 'exile', name: this.displayName(vid) }); } catch (e) {}
        this.removeVillager(vid, 'exiled');
        try { this.recordTrauma('exile'); } catch (e) {}
        try { if (this.createCorpse) { /* not dead — no corpse */ } } catch (e) {}
      }
      if (c.flipped && !this.isPlayer(c.flipped)) {
        this.say(`${this.capFirst(this.whoTag(c.flipped))} talked first. The village remembers that too — leniency, and a long probation.`);
      }
    } else if (path === 'weregild') {
      // verb agreement: "you" takes "pay", a single third person takes "pays"
      const wergildVerb = (c.accused.length === 1 && this.isPlayer(c.accused[0])) || c.accused.length > 1 ? 'pay' : 'pays';
      this.say(`Food, work, public apology — ${namesCap} ${wergildVerb} it in the open, where everyone can see. The price of staying.`);
      try {
        // the accused pays — once. (BREAK-IT social r11 2026-10-10: the old
        // leading block stocked 3000 to the pantry unconditionally and the
        // payer blocks stocked ANOTHER 3000 each — every weregild minted
        // 3000-6000 kcal from thin air on top of the real payment. One
        // sentence, one 3000-kcal payment: the village receives exactly what
        // the accused pays.)
        // the player pays from their own stores — it has to hurt.
        // ABSENTIA (break-it social r6 2026-10-09): a moot fired for an
        // already-exiled player (open case + exile via a non-moot path)
        // silently drained 3000 kcal from a pack walking the wilds — the
        // village can't collect from someone who isn't there, and the
        // sentence line is spoken to an empty fire. No payer, no payment.
        if (c.accused.includes(this.villagerId) && !this.state.scholar.exiled) {
          const s = this.state.scholar;
          if (typeof this.stockPantry === 'function') this.stockPantry(3000, 'Weregild');
          else v.pantryKcal = (v.pantryKcal || 0) + 3000;
          if (typeof s.kcal === 'number') s.kcal = Math.max(0, s.kcal - 3000);
          try { this.justiceState().amendsCredit = (this.justiceState().amendsCredit || 0) + 30; } catch (e) {}
        } else if (!c.accused.includes(this.villagerId)) {
          if (typeof this.stockPantry === 'function') this.stockPantry(3000, 'Weregild');
          else v.pantryKcal = (v.pantryKcal || 0) + 3000;
        }
        const t = v.trust || {};
        for (const a of c.accused) t[a] = Math.max(0, ((t[a]) || 10) - 20);
      } catch (e) {}
    } else if (path === 'schism') {
      this.say(`No agreement. The village splits — not in houses, in fires. Two circles now, and the space between them.`);
      try {
        v.groups = v.groups || [];
        const a = c.accused.filter(id => !this.isPlayer(id));
        const b = this.npcIds().filter(id => !c.accused.includes(id)).slice(0, 4);
        // SCHISM RE-TRIGGER (break-it social r11 2026-10-10): a second
        // schism used to push a second 'feud_a'/'feud_b' — duplicate ids,
        // and the group ripple (resolveConsequence) then hit shared members
        // twice (40% x2). Feuds merge; members dedupe.
        const mergeFeud = (gid, members) => {
          if (!members.length) return;
          let g = v.groups.find(x => x && x.id === gid);
          if (!g) { g = { id: gid, kind: 'feud', members: [] }; v.groups.push(g); }
          for (const m of members) if (!g.members.includes(m)) g.members.push(m);
        };
        mergeFeud('feud_a', a);
        mergeFeud('feud_b', b);
        if (c.accused.includes(this.villagerId)) {
          const t = v.trust || {};
          t[this.villagerId] = Math.max(0, ((t[this.villagerId]) || 10) - 15);
        }
      } catch (e) {}
    } else if (path === 'player_exile') {
      this.exilePlayer('moot');
    } else { // cold_war
      this.say(`Nothing is decided. Everyone knows; no one acts. The cold war begins — polite, and poisonous.`);
      const t = v.trust || {};
      for (const a of c.accused) t[a] = Math.max(0, ((t[a]) || 10) - 25);
      const bs = this.betrayalState();
      bs.coldWar = (bs.coldWar || 0) + 2;
    }
    // unified pipeline: the formal track is done — re-sync the justice ladder
    try { if (c.accused.includes(this.villagerId) && typeof this.syncJusticeAfterMoot === 'function') this.syncJusticeAfterMoot(path); } catch (e) {}
    return { resolved: true, path, caseId: c.id };
  },

  // ---------- 9. EXILE IS A PHASE ----------
  exilePlayer(how) {
    const s = this.state.scholar;
    try { this.justiceState().exiled = true; this.justiceState().exileDay = s.day; } catch (e) {}
    // CRISIS (Steve 2026-10-09): the schism — the moot cast YOU out.
    try { if (how === 'moot' && this.fireCrisis) this.fireCrisis('schism', { name: 'You' }); } catch (e) {}
    this.say(`Exiled. You leave with what you carry — nothing more. Behind you, Haven keeps its fire. Ahead: the world, which just got much bigger.`);
    // AUDIO (Steve 2026-10-06): footsteps receding, the village hum thinning.
    try { this.audioEvent('exileWalk'); } catch (e) {}
    try { this.journalNote && this.journalNote('village', 'exile', 'Exiled (' + how + '). Walking.'); } catch (e) {}
    // the old village continues; gossip carries your name
    try { this.seedGossip('exile_' + s.day, { trustworthy: -15 }, this.npcIds().slice(0, 4)); } catch (e) {}
    s.exiled = true;
    s.exileStartDay = s.day; // the solo clock starts now — founding takes 7+ days alone
    s.founding = null; // any previous founding project is gone with the old life
    // GHOST-QUEST CLOSURE (break-it social r9 2026-10-09): exile is a hard
    // reset — the giver is at the old fire, you're walking. An errand for
    // someone who just cast you out doesn't survive the road. Quests with no
    // giver (System tasks) cross with you.
    try {
      const q = s.activeQuest;
      if (q && q.giver) {
        s.activeQuest = null;
        this.say(`Whatever ${q.giverName || 'they'} asked of you stays at the old fire. You're done running errands for people who walked you out.`);
      }
    } catch (e) {}
    // EXILE ENDS THE JOIN (drifter break-it r4 2026-10-08): exilePlayer used
    // to leave a live join in place — the exiled bearer kept another fire's
    // seat (phantom mouth in every simVillageDay), kept their probation, and
    // a later foundHaven() forked a "hard reset" new haven whose founder was
    // still joined elsewhere, so the estranged meal gate refused them their
    // own pantry. Exile, like death (ledger.js r3), lapses the join: seat
    // released, join state cleared. What crosses the road with you: yourself,
    // your Codex, your pack. Nothing else.
    try {
      const jvId = s.joinedVillage;
      if (jvId) {
        const jv = (this.state.otherVillages || []).find(x => x.id === jvId);
        if (jv) jv.population = Math.max(0, (jv.population || 1) - 1);
        s.joinedVillage = null;
      }
      s.probation = null;
    } catch (e) {}
    // TENT ROOMS (break-it camps r11 2026-10-10): exile walks you out of the
    // village — and out of the tent. The old code left s.insideTent (and any
    // pending tent breach) set: the engine kept believing you were inside a
    // tent standing back at the old fire, so shelteredFromSky(), the tent
    // room screen, and the tent's interior fire all worked from tiles away —
    // remote cooking, storm shelter with no canvas, "Rain hammers the canvas"
    // while walking open ground. Same class as the death path (ledger.js
    // camps-3). The pitched tent itself STAYS — walk back and reclaim it.
    try {
      if (s.insideTent) {
        s.insideTent = null; s.tentSmoke = 0;
        this.say('You crawl out of the tent — canvas, poles, your fire pan. It stays pitched behind you; maybe you\'ll walk back for it. The road takes everything else.');
      }
      this.pendingEncounter = false; this.pendingMonsterId = null; this.pendingInTent = false;
    } catch (e) {}
    // EXILE LEAVES THE HALL (break-it social r11 2026-10-10): exilePlayer
    // never cleared s.insideHaven — an exiled player kept 'inside' pantry
    // access to the hall they'd been walked out of ("The pantry is in the
    // hall. Your hands are not" — but their hands were). The walk-out is
    // physical too.
    try { if (s.insideHaven) s.insideHaven = null; } catch (e) {}
    try { this.recordTrauma('exile'); } catch (e) {}
    return true;
  },
  // villageRoom: beds and bowls are finite. A village has room or it doesn't —
  // no forcing your way in. Capacity is set at generation; lazily repaired
  // for older saves.
  villageRoom(ov) {
    if (!ov) return 0;
    if (ov.capacity == null) ov.capacity = (ov.population || 8) + 1 + (R() < 0.5 ? 1 : 0);
    return Math.max(0, ov.capacity - (ov.population || 0));
  },
  // petition a nearby village: they judge you. They've heard things.
  // opts: { giftKcal } — food offered from your pack. Gifts and skills
  // genuinely move the needle; exile alone no longer auto-dooms you.
  petitionVillage(villageId, opts) {
    opts = opts || {};
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    // DRIFTER BREAK-IT 2026-10-10: petitioning the village you already belong
    // to used to run the full judgment (and spend your gift) before
    // joinVillageReal re-added a phantom seat. Refuse early, honestly.
    if ((this.state.scholar || {}).joinedVillage === villageId) {
      this.say(`You're already one of ${ov.name}'s. No need to petition your own fire.`);
      return true;
    }
    // FACE TO FACE (break-it travel 2026-10-09): "Approach & petition" means
    // approach. The card used to offer petition to exiles from across the
    // map — a tap on a seen-but-distant tile joined a village you'd never
    // walked to (no travel, no danger, and the probation clock only ticks at
    // their fire, so you'd be "in" while standing miles away). Every other
    // village action already gates on proximity (villageTalk, villageShareFood
    // at dist<=1; studyVillageCodex at dist<=2) — petition was the outlier.
    const pdist = Math.abs((ov.x || 0) - ((this.map && this.map.px) || 0)) +
                  Math.abs((ov.y || 0) - ((this.map && this.map.py) || 0));
    if (pdist > 1) {
      this.say(`You're not at ${ov.name} yet — walk to their fire first. Petition happens face to face.`);
      return false;
    }
    // CAPACITY FIRST: a full village can't take you, no matter the plea.
    // It's not judgment. It's arithmetic.
    if (this.villageRoom(ov) <= 0) {
      this.say(`${ov.name} listens — then shakes their heads. "We'd take you. There's just no room. Every bed's full, every bowl spoken for." It's not unkind. It's full.`);
      return false;
    }
    // catch-up: they've lived
    try { this.catchUpSim(ov); } catch (e) {}
    let judgment = 50;
    const s = this.state.scholar;
    if (s.exiled) {
      const crimes = (() => { try { return this.justiceState().crimes || []; } catch (e) { return []; } })();
      if (crimes.some(c => c.type === 'murder')) judgment -= 35;
      else if (crimes.some(c => c.type === 'attack')) judgment -= 20;
      else judgment -= 12; // exiled is exiled — they've heard
    }
    // gossip precedes you: your home village's stories travel.
    // your OWN exile notice is already priced in the crime penalty above —
    // counting it again was double jeopardy (and made petition impossible).
    try {
      const bad = ((this.state.village.gossip || []).filter(g =>
        g.dims && (g.dims.trustworthy || 0) < -5 &&
        String(g.action || '').indexOf('exile_') !== 0)).length;
      judgment -= Math.min(16, bad * 4);
    } catch (e) {}
    // THE VILLAGE'S NAME TRAVELS (membership.js memberReputationAbroad —
    // break-it regional 2026-10-09): a Haven member in good standing is
    // vouched for by the name; the severed carry the cut with them.
    try { if (this.memberReputationAbroad) judgment += this.memberReputationAbroad(this.villagerId); } catch (e) {}
    // GIFTS: food offered from your pack speaks louder than words.
    // You can only give what you carry.
    let giftGiven = 0;
    try {
      const have = this.playerPackKcal();
      const offered = Math.max(0, Math.round(opts.giftKcal || 0));
      // real food only, whole-unit spends: the gift is what actually left the pack
      giftGiven = offered > 0 && have > 0 ? this.playerPackSpend(Math.min(offered, have)) : 0;
      if (giftGiven > 0) {
        if (giftGiven >= 1500) judgment += 12;
        else if (giftGiven >= 700) judgment += 8;
        else judgment += 4;
      }
    } catch (e) {}
    // SKILLS: reading the room helps you plead your case.
    try {
      const readLvl = ((this.state.codex.skills || {}).read_people || {}).level || 0;
      judgment += Math.min(9, readLvl * 3);
    } catch (e) {}
    judgment += R() * 20 - 10; // noise: they're people, not calculators
    if (judgment >= 45) {
      const giftNote = giftGiven > 0 ? ` The food you laid down didn't hurt.` : '';
      this.say(`${ov.name} listens. Argues. Votes. "You can stay. Probation. Fourteen days to prove you're not what they said." It's more than you had yesterday.${giftNote}`);
      try { this.joinVillageReal(villageId); } catch (e) { s.joinedVillage = villageId; }
      try { this.rejoinMembership && this.rejoinMembership(); } catch (e) {}
      return true;
    }
    // The gift is spent either way — that keeps the judgment roll honest (a
    // gift you get back on rejection would be a free re-roll). But a village
    // that takes your food owes you the honesty of saying so: 700 kcal must
    // never vanish into the void silently.
    const giftNote = giftGiven > 0
      ? ` They take your food — all ${giftGiven} kcal of it — and turn you away anyway.`
      : '';
    this.say(`${ov.name} turns you away. "We've heard about Haven." The door — there is no door, it's a clearing, but it closes anyway.${giftNote}`);
    return false;
  },
  // joinVillageReal: you enter THEIR social web fresh. The old village is
  // archived (hard reset — no continued residence with your exilers). Here
  // you start wary and low: trust 5, half shares, 14 days of probation served
  // at their fire. Earn it or you're back on the road.
  joinVillageReal(villageId) {
    const s = this.state.scholar;
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    // DRIFTER BREAK-IT 2026-10-10: rejoining the village you're ALREADY joined
    // to re-ran the whole join: population +1 (a phantom seat feeding a
    // phantom mouth in every simVillageDay), trust reset to 5, and a fresh
    // 14-day probation — a voted-in full member who re-petitioned lost their
    // standing and the village gained a ghost. Join is idempotent now.
    if (s.joinedVillage === villageId) {
      this.say(`You're already one of ${ov.name}'s — no new probation, no new vote. The seat's yours.`);
      return true;
    }
    // DRIFTER BREAK-IT r3 2026-10-08: switching villages released nothing —
    // the abandoned village kept the player's seat and fed a phantom mouth
    // in every simVillageDay forever. Give the seat back first.
    const prevId = s.joinedVillage;
    if (prevId && prevId !== villageId) {
      const prev = (this.state.otherVillages || []).find(x => x.id === prevId);
      if (prev) prev.population = Math.max(0, (prev.population || 1) - 1);
    }
    const old = this.state.village || {};
    this.state.pastVillages = this.state.pastVillages || [];
    if (!this.state.pastVillages.includes(old)) this.state.pastVillages.push(old);
    this.state.oldVillage = this.state.oldVillage || old.name;
    ov.population = (ov.population || 0) + 1;
    ov.trust = 5; // wary — you're the exile they took a chance on
    s.joinedVillage = villageId;
    s.exiled = false;
    s.drifting = false;
    s.founding = null;
    s.probation = { villageId, daysLeft: 14 };
    try { this.justiceState().exiled = false; } catch (e) {}
    try { this.journalNote && this.journalNote('village', 'join', 'Joined ' + ov.name + ' on probation — 14 days at their fire to prove it.'); } catch (e) {}
    try { this.audioEvent && this.audioEvent('joinVillage'); } catch (e) {}
    this.say(`Fourteen days. You eat half shares, you work full days, and at the end they vote again. You're not one of them — not yet. You're the chance they took. Don't waste it.`);
    return true;
  },
  // probationTick: served at their fire — away days don't count. At day zero
  // they vote: trust 15+ and you're in; below it, you're back on the road and
  // the exile phase resumes (the road, not the sentence).
  probationTick() {
    const s = this.state.scholar;
    const p = s.probation;
    if (!p) return;
    const ov = (this.state.otherVillages || []).find(x => x.id === p.villageId);
    if (!ov) {
      // BREAK-IT (social 2026-10-08): the village record can vanish
      // mid-probation (scattered, destroyed). The old code cleared the
      // probation but left exiled=false with a stale joinedVillage — the
      // player was NOWHERE: drift() said "you have a home", petition
      // couldn't find it, no village card, no way forward. The road takes
      // you back: exile state restored so drift/petition/founding are all
      // reachable again.
      s.probation = null;
      s.joinedVillage = null;
      s.exiled = true;
      s.drifting = true;
      s.exileStartDay = s.day;
      try { this.journalNote && this.journalNote('village', 'lost', 'The village that took you in is gone — scattered or destroyed. Back on the road.'); } catch (e) {}
      this.say(`The fires went out. Whether they scattered or something worse found them, there's no one left to vote you in — just cold ground where a village was. The road takes you back. Petition somewhere else, or build your own fire.`);
      return;
    }
    const d = this.map ? (Math.abs((ov.x || 0) - this.map.px) + Math.abs((ov.y || 0) - this.map.py)) : 99;
    if (d > 1) return; // not at their fire — the clock waits
    p.daysLeft -= 1;
    if (p.daysLeft === 4) this.say(`Four days of probation left at ${ov.name}. They're watching — kindly, but watching. Work. Share. Be useful.`);
    if (p.daysLeft > 0) return;
    s.probation = null;
    if ((ov.trust || 0) >= 15) {
      try { this.journalNote && this.journalNote('village', 'member', 'Voted in at ' + ov.name + ' — full shares, full voice.'); } catch (e) {}
      this.say(`${ov.name} votes again. This time it's not close. "You're one of us now." Full shares. Full voice. The exile is a story you tell, not a name you wear.`);
    } else {
      ov.population = Math.max(0, (ov.population || 1) - 1);
      s.joinedVillage = null;
      s.exiled = true;
      s.drifting = true;
      s.exileStartDay = s.day;
      try { this.journalNote && this.journalNote('village', 'rejected', 'Turned away from ' + ov.name + ' after probation — back on the road.'); } catch (e) {}
      this.say(`${ov.name} votes. "We tried." They don't meet your eyes when they say it. Your bed goes to someone else's cousin. The road takes you back — petition somewhere else, or build your own fire.`);
    }
  },
  // drift: solo, between villages. The wild provides, or it doesn't.
  // A state, not a place — petition or founding ends it.
  drift() {
    const s = this.state.scholar;
    if (!s.exiled) { this.say('You have a home. Drifting is for the cast-out.'); return null; }
    if (s.drifting) return true;
    s.drifting = true;
    s.driftStartDay = s.day;
    this.say(`You drift. No fire but yours, no roof but weather, no eyes but the sky's. The wild doesn't judge — it just charges.`);
    return true;
  },
  // driftTick: one roll per day while drifting. Minimal, honest: food found
  // or not, weather kind or not, the occasional stranger on the same road.
  // Drifting too long wears on you — it's a road, not a home.
  driftTick() {
    const s = this.state.scholar;
    if (!s.drifting || !s.exiled) return;
    const r = R();
    if (r < 0.22) {
      const gain = 400 + Math.round(R() * 600);
      // BANK CAP (break-it food r3 2026-10-08): kcalCap() is the one number.
      s.kcal = Math.min((s.kcal || 0) + gain, this.kcalCap ? this.kcalCap() : 3000);
      this.say(`Drifting: a lucky stretch — roots, grubs, a bird too slow. +${gain} kcal. The wild provides, today.`);
    } else if (r < 0.38) {
      const loss = 200 + Math.round(R() * 300);
      s.kcal = Math.max(0, (s.kcal || 0) - loss);
      s.energy = Math.max(0, (s.energy || 0) - 10);
      this.say(`Drifting: cold rain, no shelter, nothing found. −${loss} kcal. The wild charges, today.`);
    } else if (r < 0.48) {
      s.energy = Math.min(100, (s.energy || 0) + 15);
      this.say(`Drifting: a dry overhang, a real night's sleep under it. You wake up almost human.`);
    } else if (r < 0.56) {
      // the road has other walkers
      this.say(`Drifting: another walker on the same road — wary, like you. You share a fire, no names. It helps more than you'd admit.`);
      try { this.recordTrauma && this.recordTrauma('drift_kindness'); } catch (e) {}
      s.driftMet = (s.driftMet || 0) + 1;
    } else if (r < 0.64) {
      // smoke on the horizon — the road has neighbors. Discovery for exiles
      // sizing up where to petition.
      try {
        const px = (this.map && this.map.px) || 3, py = (this.map && this.map.py) || 3;
        let best = null, bd = 99;
        for (const v of (this.state.otherVillages || [])) {
          const d = Math.abs((v.x || 0) - px) + Math.abs((v.y || 0) - py);
          if (d < bd) { bd = d; best = v; }
        }
        if (best && bd > 1) {
          const dx = (best.x || 0) - px, dy = (best.y || 0) - py;
          const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
          best.hinted = true;
          this.say(`Drifting: smoke on the horizon, ${dir} — a thin column, cooking fires. Someone lives that way. Walk ${dir} and see who has room.`);
        } else if (best) {
          this.say(`Drifting: you're close enough to smell ${best.name}'s cooking fires. Walk in or walk on.`);
        }
      } catch (e) {}
    }
    // loneliness accrues: drift is a road, not a home
    s.driftDays = (s.driftDays || 0) + 1;
    if (s.driftDays === 7) this.say(`A week of drifting. You're starting to talk to yourself. Petition somewhere, or build a fire of your own.`);
    if (s.driftDays > 0 && s.driftDays % 10 === 0) {
      try { this.recordTrauma('drift_lonely'); } catch (e) {}
      this.say(`${s.driftDays} days drifting. The quiet is getting loud.`);
    }
  },
  // villageCard: the 🏘️ tile UI reads this. Pure data — the UI renders buttons.
  villageCard(villageId) {
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    // FOG (break-it travel 2026-10-09): the card names the village, its size,
    // and its focus — that's earned knowledge. The map tap handler used to
    // call this for any generated village on the tapped tile, so tapping
    // fogged tiles leaked undiscovered villages by name. renderMap already
    // gates the 🏘️ icon on seenTiles; the card holds the same line.
    // HIVE SIGHT (break-it travel 2026-10-10): hive_mind's earned alien sense
    // passes this gate — the ability's whole promise is "(map reveals)". The
    // card's actions still gate themselves on face-to-face proximity below.
    try {
      const seenHow = (typeof this.mapSeen === 'function') ? this.mapSeen(ov.x, ov.y) : null;
      const hive = (typeof this.hiveSight === 'function') ? this.hiveSight() : false;
      if (!seenHow && !hive) return null;
    } catch (e) { return null; }
    const s = this.state.scholar;
    // proximity, computed once: every action on this card is face to face.
    const vpdx = Math.abs((ov.x || 0) - ((this.map && this.map.px) || 0));
    const vpdy = Math.abs((ov.y || 0) - ((this.map && this.map.py) || 0));
    const atFire = (vpdx + vpdy) <= 1;
    const prof = ov.knowledgeProfile || {};
    const focusWord = { fisher: 'fishing folk', forager: 'foragers', farmer: 'farmers', scavenger: 'scavengers' }[prof.focus] || 'survivors';
    // trust is legible: you can see where you stand with them.
    const trustWord = !ov.trust ? '' :
      ov.trust >= 60 ? ' · they trust you deeply' :
      ov.trust >= 30 ? ' · they trust you' :
      ov.trust >= 10 ? ' · they know your face' : ' · wary of you';
    // room is legible to an exile sizing up their options
    let roomWord = '';
    if (s.exiled) {
      const room = this.villageRoom(ov);
      roomWord = room > 0 ? ` · room for ${room}` : ' · no room';
    }
    const card = {
      name: ov.name,
      sub: `${ov.population || '?'} people · ${ov.day || 0} days in · ${focusWord}${trustWord}${roomWord}`,
      actions: [],
    };
    if (s.exiled) {
      // "Approach & petition" is honest only at their fire — petitionVillage
      // refuses from afar, so the button must not promise it from afar.
      if (atFire) {
        let pack = 0;
        try { pack = this.playerPackKcal(); } catch (e) {}
        card.actions.push({ id: 'petition', label: '🙏 Approach & petition', hint: `They've heard the gossip. (You carry ~${pack} kcal of food — offering some helps.)`, giftKcal: 0 });
        if (pack >= 700) card.actions.push({ id: 'petition', label: '🙏 Petition + offer food (700 kcal)', hint: 'A real offering. Costs you.', giftKcal: 700 });
        if (pack >= 1500) card.actions.push({ id: 'petition', label: '🙏 Petition + offer a feast (1500 kcal)', hint: 'More than a day\'s food. Hard to refuse.', giftKcal: 1500 });
      } else {
        card.hint = 'Walk to the edge of the map to travel there — petition happens face to face.';
      }
    } else {
      // DRIFTER: you're a traveler, not an exile. If you're AT their fire,
      // you can sit and talk. From across the map, all you get is the smoke.
      if (atFire) {
        const talkHint = (ov.trust || 0) >= 10
          ? 'Trade news and plant knowledge. Takes time — stories aren\'t fast.'
          : 'Trade news. They\'ll share real knowledge once they know your face — come back.';
        card.actions.push({ id: 'talk', label: '💬 Sit & talk (a while)', hint: talkHint });
        // STUDY THEIR CODEX (break-it knowledge 2026-10-08): studyVillageCodex
        // was engine-only — no UI ever called it, so systemIntegrationLevel
        // could never grow past 0 while the HUD promised "study 1 more
        // village codex". Same face-to-face gate as talk, same trust bar as
        // real teaching (10+): strangers get stories, not the book.
        if ((ov.trust || 0) >= 10) {
          card.actions.push({ id: 'study', label: '📚 Study their codex', hint: 'Link their knowledge to yours — plants, techniques, recipes, animal lore. Takes a while. They notice the respect.' });
        }
        // DRIFTER GENEROSITY (Steve 2026-10-05): the smoke line promises "food
        // would talk here" — now it can. A traveler at their fire can open
        // their pack. Costs you real food; trust remembers. Named costs, no
        // silent drain. Gifts come from what you carry (the pack), same pool
        // as the petition offering.
        let pack = 0;
        try { pack = this.playerPackKcal(); } catch (e) {}
        if (pack >= 700) card.actions.push({ id: 'sharefood', label: '🍲 Share a day\'s food (700 kcal)', hint: 'Feed their fire from your pack. They\'ll remember — especially if the pot is empty.', giftKcal: 700 });
        if (pack >= 1500) card.actions.push({ id: 'sharefood', label: '🍲🍲 Lay down a feast (1500 kcal)', hint: 'More than a day\'s food from your pack. A gift nobody shrugs at.', giftKcal: 1500 });
        // ALLIANCE (regional audit 2026-10-09): an allied village's fire is
        // open to our people — recognizedAbroad, played as a guest's meal.
        // (formAlliance/recognizedAbroad were engine-only with no callers.)
        if (this.recognizedAbroad && this.recognizedAbroad(this.villagerId, ov)) {
          card.actions.push({ id: 'guestmeal', label: '🍲 Ask for a guest meal (allied)', hint: 'Their fire is open to our people. One guest meal per village per day — guests, not locusts.' });
        }
        // THE COMMONS (depletion 2026-10-10): shared ground, shared problem.
        // The speaker will talk turf — trade, a split, or teeth. No region
        // screen: one conversation, face to face, real consequences.
        const cm = ov.commons;
        if (cm && !cm.deal && (cm.strainUs >= 3 || cm.strainThem >= 3)) {
          card.actions.push({ id: 'territory', label: '🌾 Talk about the shared ground', hint: 'Their foragers and yours are stripping the same turf. The speaker will want words — a split, food, or a warning.' });
        }
        if (ov.commonsTalkOpen) {
          card.actions.push({ id: 'deal_split', label: 'Propose a split of the ground', hint: 'We take our side, you take yours. Needs their trust (20+).' });
          card.actions.push({ id: 'deal_tribute', label: 'Offer food for them to back off (2000 kcal)', hint: 'Real food from your pantry, today. They halve their take.' });
          card.actions.push({ id: 'deal_threaten', label: 'Warn them off the ground', hint: 'Teeth. Trust will bleed, and they may answer in kind.' });
          card.actions.push({ id: 'deal_leave', label: 'Leave it alone', hint: 'Say nothing. Silence is an answer too.' });
        }
      } else {
        card.hint = 'Walk to the edge of the map to travel there.';
      }
    }
    return card;
  },
  villageCardAction(villageId, actionId, opts) {
    if (actionId === 'petition') return this.petitionVillage(villageId, opts);
    if (actionId === 'talk') return this.villageTalk(villageId);
    if (actionId === 'territory') return this.villageTerritory(villageId);
    if (actionId === 'deal_split') return this.villageDeal(villageId, 'split');
    if (actionId === 'deal_tribute') return this.villageDeal(villageId, 'tribute');
    if (actionId === 'deal_threaten') return this.villageDeal(villageId, 'threaten');
    if (actionId === 'deal_leave') return this.villageDeal(villageId, 'leave');
    if (actionId === 'study') return this.studyVillageCodex(villageId);
    if (actionId === 'sharefood') return this.villageShareFood(villageId, opts);
    if (actionId === 'guestmeal') return this.guestMeal(villageId);
    return null;
  },
  // villageTerritory: the commons, face to face. Their speaker names the
  // strain — whose hands, which ground — and waits. The deal menu opens on
  // the card (commonsTalkOpen): split, tribute, teeth, or silence. Every
  // option has a real consequence; leaving is one too.
  villageTerritory(villageId) {
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    const s = this.state.scholar;
    const dist = Math.abs((ov.x || 0) - ((this.map && this.map.px) || 0)) +
                 Math.abs((ov.y || 0) - ((this.map && this.map.py) || 0));
    if (dist > 1) { this.say(`You're not at ${ov.name}. Walk there first — this talk happens face to face.`); return null; }
    try { this.catchUpSim(ov); } catch (e) {}
    const cm = ov.commons || { strainUs: 0, strainThem: 0, tension: 0 };
    const dir = this.directionTo(4, 4, ov.x, ov.y);
    const prof = ov.knowledgeProfile || {};
    const speakerWord = { fisher: 'a fisher with net-scarred hands', forager: 'a forager with bark under her nails', farmer: 'a farmer', scavenger: 'a scavenger' }[prof.focus] || 'their speaker';
    let pitch;
    if (cm.strainUs >= cm.strainThem) {
      pitch = `You sit with ${ov.name}'s speaker — ${speakerWord} — and lay it out: the ${dir} ground. Their foragers are on turf your crews work, and the ground is thinning under both of you. They don't deny it. "Our children eat too," they say. "So. What do we do — split it, buy us off, or threaten us?" The fire is very quiet.`;
    } else {
      pitch = `You sit with ${ov.name}'s speaker — ${speakerWord}. Before you can open your mouth: "Your foragers. Our side of the ${dir} ground. Stripped." They let that sit. "We haven't answered it yet. We're answering it now — with you. Split it, feed us, or threaten us. Choose."`;
    }
    this.say(pitch);
    ov.commonsTalkOpen = true;
    return true;
  },
  // villageDeal: the commons resolved (or not). Split needs trust 20+;
  // tribute costs 2000 real kcal from your pantry; threatening costs trust
  // and raises tension; leaving costs a little tension — silence is an
  // answer too. Deals change the SIM (see depleteRandomTile / simVillageDay),
  // not just the mood.
  villageDeal(villageId, which) {
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    ov.commons = ov.commons || { strainUs: 0, strainThem: 0, tension: 0, deal: null, depleteMult: 1, strainTiles: [], rumorStage: 0 };
    const cm = ov.commons;
    ov.commonsTalkOpen = false;
    const trust = ov.trust || 0;
    if (which === 'split') {
      if (trust >= 20) {
        cm.deal = 'split';
        cm.tension = Math.max(0, cm.tension - 30);
        ov.trust = Math.min(100, trust + 5);
        this.say(`The speaker nods slowly. "North is yours, south is ours — three tiles of breathing room, both sides. Our foragers will keep off your turf, and yours keep off ours." Hands are shaken. The commons gets a fence made of words. (Trust +5. Their crews avoid your turf now — and yours avoid theirs.)`);
        try { this.seedGossip('deal', { village: ov.id, kind: 'split' }, []); } catch (e) {}
      } else {
        cm.tension = Math.min(100, cm.tension + 10);
        ov.trust = Math.max(0, trust - 3);
        this.say(`The speaker laughs — not kindly. "Split the ground with strangers? Come back when we've eaten at the same fire a while." (Trust 20+ needed. Tension +10.)`);
      }
    } else if (which === 'tribute') {
      const v = this.state.village;
      const have = this.pantryKcalLive ? this.pantryKcalLive(v) : 0;
      if (have < 2000) {
        this.say(`You open the pantry books and close them again — not 2000 kcal to spare. The speaker sees it. "Come back with food, then." (No deal. The offer stands as long as the strain does.)`);
        ov.commonsTalkOpen = true; // the menu stays — the offer is still on the table
        return true;
      }
      try { this.pantryDraw(v, 2000, {}); } catch (e) {}
      cm.deal = 'tribute';
      cm.depleteMult = 0.5;
      cm.tension = Math.max(0, cm.tension - 25);
      ov.trust = Math.min(100, trust + 8);
      this.say(`Two thousand kcal changes hands — real food, today. The speaker counts it twice, then nods. "Our foragers will work lighter on the shared ground. Half hands, half take." (Trust +8. Their turf pressure halves.)`);
      try { this.seedGossip('deal', { village: ov.id, kind: 'tribute' }, []); } catch (e) {}
    } else if (which === 'threaten') {
      cm.tension = Math.min(100, cm.tension + 25);
      ov.trust = Math.max(0, trust - 15);
      this.say(`You lay it out flat: the ground is yours, and their foragers walk it at their own risk. The speaker's face closes like a door. "Noted," they say. Nothing else. On the walk home you hear their watch being doubled. (Trust -15. Tension +25. If this festers, it won't be words next.)`);
      try { this.seedGossip('threat', { village: ov.id }, []); } catch (e) {}
    } else {
      cm.tension = Math.min(100, cm.tension + 5);
      this.say(`You say nothing about the ground. The speaker watches you decide not to decide, and nods once. Silence is an answer too — and they've heard it. (Tension +5.)`);
    }
    return true;
  },
  // villageTalk: sit with another village. Trade news, trade plant knowledge.
  // The drifter's verb: you walked all that way — come home knowing something.
  // Knowledge ENTERS the system here: they show you a plant you didn't know
  // (L1, attributed), you show them one of yours (their codex grows too —
  // the world learns, not just you). Once per village per day; costs a while
  // (64 ticks, named). Talk happens face to face — no menu magic from afar.
  // TRUST: strangers get stories, not secrets. First sit is sizing-up
  // (trust 0 → news only); once they know your face (10+) they teach.
  // Deep/uncommon lore needs real trust (30+); mastery-level sharing (60+).
  // Generosity is remembered: showing them something new warms them faster.
  villageTalk(villageId) {
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    const s = this.state.scholar;
    const dist = Math.abs((ov.x || 0) - ((this.map && this.map.px) || 0)) +
                 Math.abs((ov.y || 0) - ((this.map && this.map.py) || 0));
    if (dist > 1) { this.say(`You're not at ${ov.name}. Walk there first — talk happens face to face.`); return null; }
    // they've lived since you last looked
    try { this.catchUpSim(ov); } catch (e) {}
    if (ov.lastTalkDay === s.day) {
      this.say(`You've talked ${ov.name}'s ear off for today. Come back tomorrow — stories need time to travel.`);
      return null;
    }
    ov.lastTalkDay = s.day;
    ov.trust = ov.trust || 0;
    const trustIn = ov.trust;
    // outsider status bites: on probation you're the new mouth, and they
    // let you feel it — politely.
    if (s.probation && s.probation.villageId === villageId) {
      this.say(`You're still the new mouth at ${ov.name} — ${Math.max(0, s.probation.daysLeft)} days of probation left. They're polite. Politeness is a wall with a door in it; you're looking for the door.`);
    }
    const prof = ov.knowledgeProfile || {};
    const theirCodex = (ov.codex && ov.codex.plants) || {};
    const mine = (this.state.codex.plants = this.state.codex.plants || {});
    const focusWord = { fisher: 'an old fisher', forager: 'a forager with bark under her nails', farmer: 'a farmer', scavenger: 'a scavenger' }[prof.focus] || 'someone';
    const isCommon = (pid) => {
      const p = (this.data.plants || []).find(x => x.id === pid);
      return !p || (p.rarity || 'common') === 'common';
    };
    // THEY TEACH YOU: something they know that you don't — once they know your face.
    if (trustIn >= 10) {
      // trust gates BREADTH: below 30 they share common lore only; 30+ opens
      // the uncommon; 60+ and their deep experts will walk you through mastery.
      let newToMe = Object.keys(theirCodex).filter(pid => !mine[pid]);
      if (trustIn < 30) newToMe = newToMe.filter(isCommon);
      if (newToMe.length) {
        const pid = newToMe[Math.floor(Math.random() * newToMe.length)];
        const p = (this.data.plants || []).find(x => x.id === pid);
        const theirLvl = (theirCodex[pid] && theirCodex[pid].level) || 1;
        const lvl = (trustIn >= 60 && theirLvl >= 3) ? 3 : Math.min(2, theirLvl);
        mine[pid] = { level: lvl, identifiedDay: s.day, harvests: 0, tastings: 0, learnedFrom: ov.name,
          // a good teacher accelerates: shared knowledge gives a head start, not mastery.
          // The deeper levels still need your own hands (tastings, harvests).
          // (break-it knowledge 2026-10-10 r2: the old copy promised a
          // nonexistent XP discount on the next level — there is no plant-XP
          // mechanic at all; sharedHeadStart is a write-only flag nothing
          // reads. Copy now matches the engine.)
          sharedHeadStart: true };
        const pname = p ? p.name : pid;
        this.say(`You sit with ${ov.name}. ${focusWord.charAt(0).toUpperCase() + focusWord.slice(1)} shows you ${pname} — where it grows, what it looks like, the part that won't kill you. (${pname}: knowledge L${lvl}, learned from ${ov.name}.)`);
      } else {
        // nothing new: deepen something shared, or just trade news
        const shared = Object.keys(theirCodex).filter(pid => mine[pid] && (theirCodex[pid].level || 0) > (mine[pid].level || 0));
        if (shared.length && Math.random() < 0.6) {
          try { this.combineKnowledge(shared[Math.floor(Math.random() * shared.length)]); } catch (e) {}
        } else {
          this.say(`No new plants today — just news. ${ov.name} has its own troubles: who's sick, who's feuding, what the sky did last week. You trade stories. The world feels smaller, in a good way.`);
          try { this.seedGossip('visit_' + ov.id + '_' + s.day, { trustworthy: 2 }, (this.npcIds ? this.npcIds() : []).slice(0, 3)); } catch (e) {}
        }
      }
    } else {
      // first sit: stories, not secrets. They're sizing you up.
      this.say(`You sit with ${ov.name}. Wary eyes, polite nods. They'll trade news — who's sick, who's feuding, what the sky did last week — but nobody's showing a stranger where the good patches are. Come back. Let them learn your face.`);
      try { this.seedGossip('visit_' + ov.id + '_' + s.day, { trustworthy: 2 }, (this.npcIds ? this.npcIds() : []).slice(0, 3)); } catch (e) {}
    }
    // YOU TEACH THEM: the exchange goes both ways — and generosity is remembered.
    const newToThem = Object.keys(mine).filter(pid => !theirCodex[pid]);
    if (newToThem.length) {
      const pid = newToThem[Math.floor(Math.random() * newToThem.length)];
      const p = (this.data.plants || []).find(x => x.id === pid);
      ov.codex = ov.codex || { plants: {} };
      ov.codex.plants[pid] = { level: 1, identifiedDay: s.day };
      if (prof.plants) prof.plants[pid] = { level: 1, learnedDay: s.day };
      // WRONG-KNOWLEDGE HONESTY (break-it knowledge 2026-10-08): you show
      // them the name YOU believe — the true name you never learned doesn't
      // come out of your mouth here either (same class as the conversation
      // teach handler).
      const myKnown = (mine[pid] || {}).wrongAs || ((p && p.name) || pid);
      this.say(`In return you show them ${myKnown}. Someone sketches it in the dirt, memorizing. ${ov.name} knows a little more because you came.`);
      ov.trust = Math.min(100, ov.trust + 4);
    }
    // showing up, sitting down, staying a while: that's how faces get known.
    ov.trust = Math.min(100, ov.trust + (trustIn === 0 ? 8 : 4));
    // talk takes a while: stories aren't fast. (Named cost, no silent drain.)
    this.tickAction(64);
    return true;
  },
  // villageShareFood: open your pack at their fire. (Steve 2026-10-05, drifter
  // loop.) The smoke-on-the-horizon line says "food would talk here" — this
  // is the mechanic behind the promise. A traveler, not an exile, gives food
  // from what they carry (the pack — same pool as the petition offering).
  // Real cost, real memory: pantry gains the food, trust gains a named bump,
  // and the home village hears about it through gossip (generosity is judged
  // by personality there, like everything else). A gift to an empty pot hits
  // harder. Repeat gifts the same day are still welcome but buy less trust.
  // Named cost (32 ticks — a shared meal takes a while), never silent.
  villageShareFood(villageId, opts) {
    opts = opts || {};
    const ov = (this.state.otherVillages || []).find(x => x.id === villageId);
    if (!ov) return null;
    const s = this.state.scholar;
    if (s.exiled) { this.say('Petition them instead — a gift from an exile reads as a bribe, and they know it.'); return null; }
    const dist = Math.abs((ov.x || 0) - ((this.map && this.map.px) || 0)) +
                 Math.abs((ov.y || 0) - ((this.map && this.map.py) || 0));
    if (dist > 1) { this.say(`You're not at ${ov.name}. Walk there first — a gift travels in your hands, not your thoughts.`); return null; }
    // they've lived since you last looked
    try { this.catchUpSim(ov); } catch (e) {}
    let pack = 0;
    try { pack = this.playerPackKcal(); } catch (e) {}
    const wanted = Math.max(0, Math.round(opts.giftKcal || 0));
    if (Math.min(wanted, pack) < 700) {
      this.say(`You don't carry enough to make a gift of it — ${Math.round(pack)} kcal of finished food in your pack, and 700 is the smallest gift that feeds a fire. (Eat up, pack more, come back.)`);
      return null;
    }
    // real food leaves the real pack; the gift is what actually moved
    let gift = 0;
    try { gift = this.playerPackSpend(Math.min(wanted, pack)); } catch (e) {}
    if (gift < 700) { this.say(`You don't carry enough to make a gift of it — the pack wouldn't divide. (Eat up, pack more, come back.)`); return null; }
    const wasLean = (ov.pantryKcal || 0) <= 0;
    ov.pantryKcal = (ov.pantryKcal || 0) + gift;
    // trust: a 700 gift is a day of your food (+10); a 1500 feast is a statement
    // (+18). An empty pot doubles the memory (+4). Same-day repeats are
    // welcomed, not worshipped.
    const firstToday = ov.lastGiftDay !== s.day;
    let gain = (gift >= 1500 ? 18 : 10) + (wasLean ? 4 : 0);
    if (!firstToday) gain = Math.min(gain, 6);
    ov.trust = Math.min(100, (ov.trust || 0) + gain);
    ov.lastGiftDay = s.day;
    const feast = gift >= 1500;
    const leanLine = wasLean
      ? ` Their pot was empty — you could see it in how fast the bowls came out. Nobody forgets who fed them when the fire was cold.`
      : ` Their pantry breathes a little easier.`;
    this.say(`You open your pack and lay out ${gift} kcal of food${feast ? ' — a feast, spread on their ground cloth, more than a day\'s eating' : ', a day\'s food, no ceremony'}. ${ov.name} takes it the way hungry people take everything: fast, and then embarrassed about the fast.${leanLine} (${ov.name} trust +${gain}.)`);
    // home hears. Generosity travels too — and gets judged by personality.
    try { this.seedGossip('gift_' + ov.id + '_' + s.day, { trustworthy: 3 }, (this.npcIds ? this.npcIds() : []).slice(0, 3)); } catch (e) {}
    // a shared meal takes a while: named cost, no silent drain.
    try { this.tickAction(32); } catch (e) {}
    return true;
  },
  // playerPackKcal / playerPackSpend: the PLAYER's real food economy.
  // DRIFTER LOOP 2026-10-07: the exile/drifter/gift/cache/bribe economy used
  // to read packKcal(this.villagerId) — the NPC abstract-pack number (800-1300
  // kcal re-rolled daily), NOT the player's real inventory. Gifts and caches
  // ran on phantom food: a full real pack read as "empty", and havens got
  // founded on ghost food while the real pack never shrank. These read and
  // spend the real inventory (finished food only, like the homecoming haul).
  // Spends are whole-unit, like the rest of the codebase; returns ACTUAL kcal
  // removed, and callers say the actual — the fiction names what moved.
  playerPackKcal() {
    const inv = (this.state.scholar && this.state.scholar.inventory) || [];
    let t = 0;
    for (const i of inv) {
      if (!i || (i.kcalEach || 0) <= 0 || (i.units || 0) <= 0) continue;
      if (i.bonded) continue; // relics aren't food
      try { if (this.isFinishedFood && !this.isFinishedFood(i)) continue; } catch (e) {}
      t += (i.kcalEach || 0) * (i.units || 0);
    }
    return Math.round(t);
  },
  playerPackSpend(kcal) {
    const s = this.state.scholar;
    const inv = s.inventory || [];
    let need = Math.max(0, Math.round(kcal || 0)), got = 0;
    for (let idx = inv.length - 1; idx >= 0 && need > 0; idx--) {
      const i = inv[idx];
      if (!i || (i.kcalEach || 0) <= 0 || (i.units || 0) <= 0 || i.bonded) continue;
      let skip = false;
      try { if (this.isFinishedFood && !this.isFinishedFood(i)) skip = true; } catch (e) {}
      if (skip) continue;
      const take = Math.min(i.units, Math.ceil(need / i.kcalEach));
      i.units -= take;
      got += take * i.kcalEach;
      need -= take * i.kcalEach;
      if (i.units <= 0) inv.splice(idx, 1);
    }
    return Math.round(got);
  },
  // exileSelfActions: the camp/self UI reads this while exiled. Pure data.
  // Founding a haven is a PROJECT, not a button (Steve 2026-10-06): survive
  // solo 7+ days, claim a site, raise at least a hut, cache 10000 kcal.
  // Solo founding takes ~2 weeks of real work. Petitioning a village with
  // room (at their 🏘️ tile) is the likelier road.
  foundingReqs() {
    return {
      minSoloDays: 7, shelterTier: 2, stockpileKcal: 10000,
      timberPerTier: [0, 8, 16, 24], // wood cost to reach each shelter tier
      cachePerAction: 3000,
    };
  },
  foundingState() {
    const s = this.state.scholar;
    if (!s.founding) s.founding = { siteClaimed: false, shelterTier: 0, stockpileKcal: 0 };
    return s.founding;
  },
  foundingMissing() {
    const s = this.state.scholar, f = this.foundingState(), RQ = this.foundingReqs();
    const missing = [];
    const soloDays = (s.day || 0) - (s.exileStartDay != null ? s.exileStartDay : (s.day || 0));
    if (soloDays < RQ.minSoloDays) missing.push(`${RQ.minSoloDays - soloDays} more day(s) surviving solo`);
    if (!f.siteClaimed) missing.push('a claimed campsite');
    if (f.shelterTier < RQ.shelterTier) missing.push(`a hut or better (shelter tier ${f.shelterTier}/${RQ.shelterTier})`);
    if (Math.round(f.stockpileKcal) < RQ.stockpileKcal) missing.push(`cached food (${Math.round(f.stockpileKcal)}/${RQ.stockpileKcal} kcal)`);
    // THE CAIRN IS A PLACE (drifter break-it 2026-10-10): _forkNewHaven used
    // to snap the player to the claimed site from anywhere on the map — claim
    // at one corner, walk to the other, found: a free cross-map teleport that
    // skipped the walk, the monsters, and the time. Founding happens where
    // you stand: walk back to your cairn first.
    if (f.siteClaimed && f.claimX != null && f.claimY != null && this.map) {
      const d = Math.abs((this.map.px || 0) - f.claimX) + Math.abs((this.map.py || 0) - f.claimY);
      if (d > 1) missing.push(`walk back to your cairn (${d} tiles away — founding happens where you stand)`);
    }
    return missing;
  },
  exileSelfActions() {
    const s = this.state.scholar;
    if (!s.exiled) return [];
    const f = this.foundingState(), RQ = this.foundingReqs();
    const tierNames = ['open ground', 'lean-to', 'hut', 'cabin'];
    const acts = [];
    if (!f.siteClaimed) {
      acts.push({ id: 'claimsite', label: '📍 Claim a campsite', hint: 'Walk the ground, mark it, make it yours. First step of a haven — costs a while.' });
    } else {
      if (f.shelterTier < 3) {
        const cost = RQ.timberPerTier[f.shelterTier + 1];
        let wood = 0;
        try { wood = this.woodCount(); } catch (e) {}
        acts.push({
          id: 'buildshelter', label: `🪓 Raise a ${tierNames[f.shelterTier + 1]} (tier ${f.shelterTier}→${f.shelterTier + 1})`,
          hint: `Needs ${cost} wood — you carry ${wood}. Hard labor, half a day.`,
          disabled: wood < cost,
        });
      }
      acts.push({ id: 'gathertimber', label: '🪵 Fell & haul timber', hint: 'A day-part of hard labor for the haven. +6–9 wood. Costs 400 kcal.' });
      acts.push({ id: 'cachefood', label: `📦 Cache food (${Math.round(f.stockpileKcal)}/${RQ.stockpileKcal} kcal)`, hint: `Move up to ${RQ.cachePerAction} kcal from your pack into the haven cache. A haven starts on a full belly.` });
    }
    const missing = this.foundingMissing();
    acts.push({
      id: 'foundhaven', label: '🏕️ Found your haven',
      // HONESTY (break-it social r6 2026-10-09): Steve's hard-reset law — the
      // old hint "Day one." never said what day one MEANS. A new fire, new
      // faces, relationships reset; only self, pack, and Codex cross over.
      hint: missing.length ? 'Not yet — need: ' + missing.join('; ') + '.' : 'Day one — a new fire, new faces. What you carried is what you have: yourself, your pack, and everything you learned.',
      disabled: missing.length > 0,
    });
    if (!s.drifting) acts.push({ id: 'drift', label: '🚶 Drift', hint: "Solo. Petition a village at their 🏘️ tile, or build your own fire." });
    else acts.push({ id: 'drift', label: '🚶 Drifting…', hint: `Day ${(s.driftDays || 0) + 1} on the road. Petition at a 🏘️ tile or found your haven to stop.`, disabled: true });
    return acts;
  },
  exileSelfDo(actionId) {
    if (actionId === 'claimsite') return this.claimSite();
    if (actionId === 'gathertimber') return this.gatherTimber();
    if (actionId === 'buildshelter') return this.buildFoundShelter();
    if (actionId === 'cachefood') return this.cacheFood();
    if (actionId === 'foundhaven') { const r = this.foundHaven(); try { this.state.scholar.drifting = false; } catch (e) {} return r; }
    if (actionId === 'drift') return this.drift();
    return null;
  },
  claimSite() {
    const s = this.state.scholar;
    if (!s.exiled) return null;
    const f = this.foundingState();
    if (f.siteClaimed) return null;
    // INHABITED GROUND (drifter break-it 2026-10-10): another village's tile
    // is their home, not empty wilderness — claiming it let the fork plant a
    // 'haven' tile on top of their record (two villages, one tile; the map
    // tap showed their card while returnToVillage PINed your fire). A haven
    // starts on empty ground, not on top of the neighbors.
    try {
      const px = this.map ? this.map.px : null, py = this.map ? this.map.py : null;
      if ((this.state.otherVillages || []).some(v => v.x === px && v.y === py)) {
        this.say(`People already live here — smoke, voices, somebody else's fire. A haven starts on empty ground, not on top of your neighbors. Walk on and claim somewhere wild.`);
        return null;
      }
    } catch (e) {}
    f.siteClaimed = true;
    // the claim is a PLACE, not a flag — the haven rises here, not wherever
    // you happen to be standing when you found (drifter loop 2026-10-07:
    // the say line already claims "the spot you claimed weeks ago").
    try { f.claimX = this.map.px; f.claimY = this.map.py; } catch (e) {}
    try { this.tickAction(32); } catch (e) {}
    try { this.audioEvent && this.audioEvent('claimSite'); } catch (e) {}
    this.say(`You walk the ground until it feels right — water near, wood near, wind wrong. You mark it with a cairn and a cut branch. This is yours now. Nothing here but a claim and a plan. The work starts tomorrow.`);
    return true;
  },
  gatherTimber() {
    const s = this.state.scholar;
    if (!s.exiled) return null;
    const f = this.foundingState();
    if (!f.siteClaimed) { this.say('Claim a campsite first — timber with nowhere to go is just firewood.'); return null; }
    const gain = 6 + Math.floor(R() * 4);
    try { this.addWood(gain); } catch (e) {}
    s.kcal = Math.max(0, (s.kcal || 0) - 400);
    try { this.tickAction(48); } catch (e) {}
    try { this.audioEvent && this.audioEvent('chopWood'); } catch (e) {}
    this.say(`You fell, limb, and haul. Green wood is heavy and honest work. +${gain} wood for the haven. (−400 kcal, half a day.)`);
    return true;
  },
  buildFoundShelter() {
    const s = this.state.scholar;
    if (!s.exiled) return null;
    const f = this.foundingState(), RQ = this.foundingReqs();
    if (!f.siteClaimed || f.shelterTier >= 3) return null;
    const tierNames = ['open ground', 'lean-to', 'hut', 'cabin'];
    const cost = RQ.timberPerTier[f.shelterTier + 1];
    let wood = 0;
    try { wood = this.woodCount(); } catch (e) {}
    if (wood < cost) { this.say(`Not enough timber — a ${tierNames[f.shelterTier + 1]} needs ${cost} wood, you carry ${wood}. Fell more first.`); return null; }
    try { this.spendWood(cost); } catch (e) {}
    s.kcal = Math.max(0, (s.kcal || 0) - 300);
    f.shelterTier += 1;
    try { this.tickAction(48); } catch (e) {}
    try { this.audioEvent && this.audioEvent('buildShelter'); } catch (e) {}
    const enough = f.shelterTier >= RQ.shelterTier ? ' Good enough to found on.' : '';
    this.say(`You raise the ${tierNames[f.shelterTier]} — ridgepole, walls, a roof that mostly keeps the rain out. Shelter tier ${f.shelterTier}/3.${enough} (−${cost} wood, −300 kcal, half a day.)`);
    return true;
  },
  cacheFood() {
    const s = this.state.scholar;
    if (!s.exiled) return null;
    const f = this.foundingState(), RQ = this.foundingReqs();
    if (!f.siteClaimed) { this.say('Claim a campsite first — a cache needs a home.'); return null; }
    let pack = 0;
    try { pack = this.playerPackKcal(); } catch (e) {}
    const want = Math.min(RQ.cachePerAction, Math.round(pack));
    if (want <= 0) { this.say(`Your pack is empty. The cache waits. Forage, hunt, pack food — then come back.`); return null; }
    // real food into the real cache: the haven starts on YOUR foraging, not a phantom
    let moved = 0;
    try { moved = this.playerPackSpend(want); } catch (e) {}
    if (moved <= 0) { this.say(`Your pack is empty. The cache waits. Forage, hunt, pack food — then come back.`); return null; }
    f.stockpileKcal += moved;
    try { this.tickAction(16); } catch (e) {}
    this.say(`You bury and hang ${moved} kcal where animals won't find it — or not easily. The haven cache holds ${Math.round(f.stockpileKcal)} / ${RQ.stockpileKcal} kcal.`);
    // NO SILENT STARVATION (drifter loop 2026-10-07): caching your last
    // calorie is allowed — it's your call — but the game says so out loud.
    let left = 0;
    try { left = this.playerPackKcal(); } catch (e) {}
    if (left < 700) this.say(`Your pack is light now — ${Math.round(left)} kcal of finished food left. The cache doesn't feed you tonight; keep enough to eat.`);
    return true;
  },
  // found your own haven: the fork, gated behind the founding project.
  // Steve (2026-10-06): a new haven CAN be founded, but not easily — the
  // exile must struggle (solo days, claimed site, hut+, full cache) or,
  // more likely, join an existing village with room.
  foundHaven() {
    const s = this.state.scholar;
    if (!s.exiled) { this.say(`You already have a haven.`); return null; }
    const missing = this.foundingMissing();
    if (missing.length) {
      this.say(`Not yet. A haven needs: ${missing.join('; ')}. The wild doesn't grade on effort — it grades on results.`);
      return null;
    }
    return this._forkNewHaven();
  },
  // _forkNewHaven: the actual village fork, unchanged mechanics.
  // EXILE HARD RESET (Steve 2026-10-06): founding a new haven after exile is a
  // REAL village fork. The old village object is archived into pastVillages
  // (it continues without you — in fiction and in data). The new haven is a
  // fresh village object: new name, new faces to come, fresh trust, fresh
  // pantry, fresh gossip. What crosses the fire with you: yourself, your
  // Codex, your pack. Nothing else. ("Hard reset. Day one, again — kept.")
  _forkNewHaven() {
    const s = this.state.scholar;
    const pid = this.villagerId;
    const f0 = s.founding || {};
    // 1. archive the old village — it continues without you (guard: join-then-
    // found arcs must not archive the same object twice)
    const old = this.state.village || {};
    this.state.pastVillages = this.state.pastVillages || [];
    if (!this.state.pastVillages.includes(old)) this.state.pastVillages.push(old);
    this.state.oldVillage = this.state.oldVillage || old.name;
    // 2. the founder crosses over: your character record moves to the new haven
    const playerChar = ((old.rosterChars || {})[pid]) || null;
    // 3. fresh village object — same shape the game expects, founder-only contents
    const havenNames = ['Emberhold', 'Cinderfall', 'Ashgrove', 'Thornrest', 'Firstfire', 'Dawnrest', 'Emberwake'];
    const usedNames = new Set((this.state.pastVillages || []).map(x => x && x.name).filter(Boolean));
    const namePool = havenNames.filter(n => !usedNames.has(n));
    const pool = namePool.length ? namePool : havenNames;
    const name = pool[Math.floor(R() * pool.length)];
    // the haven rises on the CLAIMED site (see claimSite) — you walk back to
    // your cairn to found, not wherever you wandered. (drifter loop 2026-10-07:
    // founding used to plant the haven at your current feet, and never marked
    // the tile — so pantryInReach() never fired at home and the map never
    // showed the new haven. The founder couldn't eat from their own pantry.)
    const px = (f0.claimX != null) ? f0.claimX : ((this.map && this.map.px != null) ? this.map.px : (old.px != null ? old.px : 3));
    const py = (f0.claimY != null) ? f0.claimY : ((this.map && this.map.py != null) ? this.map.py : (old.py != null ? old.py : 3));
    try { if (this.map) { this.map.px = px; this.map.py = py; } } catch (e) {}
    try {
      const t = this.tileAt(px, py);
      if (t) { t.type = 'haven'; t.isHaven = true; t.stock = 0; }
    } catch (e) {}
    // the old site is not your haven anymore. It stays a lived-in village —
    // the archived village continues there — but it must never read as YOUR
    // fire: travelTo PINs map coords on any 'haven' tile via returnToVillage,
    // which used to snap the founder across the map when they walked back
    // onto the abandoned site (free teleport). Retag it; the estranged
    // return beat (returnToOldVillage) fires there instead of the PIN.
    try {
      const ot = this.tileAt(old.px, old.py);
      if (ot && (old.px !== px || old.py !== py)) {
        ot.type = 'oldhaven'; ot.isHaven = false; ot.pastVillage = old.name;
      }
    } catch (e) {}
    // HONEST CLOCKS (break-it food r4): the founder's cache was spoilDay 9999
    // — immortal food in a fresh pantry. Long, not forever: dried meat ~a
    // month (PRESERVATION.md), dry beans ~a year.
    const fd0 = (s.day || 1);
    const v = {
      name, day: 1, season: old.season || 'spring',
      px, py,
      // founder's cache: a few days for one person, cached along the road out.
      // not a village stockpile — the scarcity starts now.
      pantry: [
        { name: 'Dried meat', kcalEach: 400, units: 6, spoilDay: fd0 + 30, safe: true, kg: 0.3, unit: 'strip' },
        { name: 'Trail mix', kcalEach: 400, units: 4, spoilDay: fd0 + 60, safe: true, kg: 0.3, unit: 'bag' },
        { name: 'Dried beans', rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 20, spoilDay: fd0 + 365, safe: false, kg: 0.5, needsCooking: true, unit: 'scoop' },
      ],
      pantryKcal: 0, // (kept for compat, computed from pantry)
      water: { clean: 6, dirty: 0 },
      waterL: 6, morale: 'steady', favor: 0, fallen: [],
      // roster: just you. New faces arrive via the strangers system — earned, not given.
      roster: [pid],
      villagers: [pid],
      rosterChars: {},
      trust: { [pid]: 15 },
      // the shelter you raised is what you move into — not a generic camp
      buildingType: (f0.shelterTier || 0) >= 3 ? 'cabin' : 'hut',
      spawnBuilding: (f0.shelterTier || 0) >= 3 ? 'your cabin' : 'your hut',
      // every social surface starts clean
      needs: {}, memory: {}, requests: {},
      assignments: {}, sharedKnowledge: {},
      grief: 0, cheer: 0,
      conflicts: [], groups: [],
      gossip: [], truthClaims: [],
      taught: {},
      met: {},
      positions: {}, nodePos: {}, away: {},
      // lazily-initialized systems (betrayal, justice, mship) start fresh
      // automatically on the new object via their || guards.
    };
    if (playerChar) v.rosterChars[pid] = playerChar;
    // the founder teaches what they knew from their old life — like newGame
    try {
      const tags = (playerChar && playerChar.originTags) || [];
      const tier = (this.familiarityTier ? this.familiarityTier(tags) : 'stranger');
      const tierCount = { local: 3, visitor: 2, stranger: 1 };
      const tl = (tags || []).map(t => String(t).toLowerCase());
      const local = [], other = [];
      for (const p of (this.data.plants || [])) {
        const pr = (p.regions || []).map(x => String(x).toLowerCase());
        (pr.some(r => tl.includes(r)) ? local : other).push(p.id);
      }
      for (let i = local.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1));[local[i], local[j]] = [local[j], local[i]]; }
      for (let i = other.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1));[other[i], other[j]] = [other[j], other[i]]; }
      v.taught[pid] = [...local, ...other].slice(0, tierCount[tier] || 1);
    } catch (e) { v.taught[pid] = []; }
    this.state.village = v;
    // social groups regenerate honestly on the new roster (solo → none)
    try { this.genGroups(); } catch (e) {}
    // 4. the exile ends; the scholar, codex, and pack cross over untouched.
    // the founding project is spent — it became the haven.
    s.exiled = false;
    s.drifting = false;
    s.founding = null;
    try { this.justiceState().exiled = false; } catch (e) {}
    s.foundedHaven = true;
    s.foundedDay = s.day;
    try { this.journalNote && this.journalNote('village', 'haven', 'Founded ' + name + ' — hard reset. ' + (old.name || 'Haven') + ' continues without you.'); } catch (e) {}
    try { this.audioEvent && this.audioEvent('foundHaven'); } catch (e) {}
    const fDone = f0.shelterTier || 0;
    const shelterWord = fDone >= 3 ? 'the cabin you raised beam by beam' : 'the hut you raised with your own hands';
    this.say(`You pick the spot you claimed weeks ago. The cache is full, ${shelterWord} stands against the wind. ${name} — day one, again, but this time you know what a day costs. Behind you, ${(old.name || 'Haven')} keeps its fire without you. Ahead: new faces, new names. What you carried is what you have: yourself, your pack, and everything you learned.`);
    return true;
  },

  // ---------- 10. STRANGERS (earned, not timed) ----------
  villageNotability() {
    let n = 0;
    const v = this.state.village, s = this.state.scholar;
    if (s.day >= 7) n += 30; // survived the first week
    if ((v.pantryKcal || 0) > 15000) n += 25; // food to trade
    if (this.state.systemArrived) n += 25; // the show is being watched
    n += ((v.betrayal || {}).strangersHeard || 0) * 5; // word spreads
    return n;
  },
  considerStrangers() {
    const v = this.state.village;
    if (this.state.scholar.exiled) return; // no visitors for the exiled
    if ((v.visitors || []).length) return; // one at a time
    const n = this.villageNotability();
    if (n < 40) return;
    if (R() > (n - 35) / 100) return;
    const type = pick(['trader', 'trader', 'scout', 'curious', 'fleeing']);
    // VISITOR NAMES (Steve 2026-10-06): the old shared pool could name a
    // trader "a frightened family" — a family operating a trade cart breaks
    // the fiction. Names follow the type now.
    const NAMES = {
      trader: ['a weathered trader', 'a sharp-eyed peddler', 'a cart-driver with flour on their sleeves'],
      scout: ['a lean scout'],
      curious: ['a curious wanderer'],
      fleeing: ['a frightened family'],
    };
    const visitor = {
      id: 'vis_' + Date.now().toString(36), type,
      name: pick(NAMES[type] || NAMES.curious),
      day: this.state.scholar.day,
      leavesDay: this.state.scholar.day + 1, // traders don't wait forever (see visitorDaily)
    };
    // ENTREPRENEURIAL SPIRIT (Steve 2026-10-06): trading is a VERB, not a
    // role. "Trader" is someone — inside or outside the village — who happens
    // to have the spirit. The type is arrival flavor; the trait gates trade.
    // Shady/desperate feed the scam system (see scamminess).
    visitor.entrepreneurial = type === 'trader' ? true : R() < 0.25;
    visitor.shady = R() < (type === 'fleeing' ? 0.05 : 0.2);
    visitor.desperate = R() < 0.3;
    // RETURNING SCAMMER (Steve 2026-10-06): if an unresolved discovered scam
    // is on the ledger, the same face may come back down the road — and then
    // there's a reckoning.
    const ledger = (this.state.village || {}).scamLedger || [];
    const open = ledger.filter(s => s.discovered && !s.resolved);
    if (open.length && visitor.entrepreneurial && R() < 0.4) {
      const s = open[Math.floor(R() * open.length)];
      visitor.name = s.whoName; visitor.returningScammer = true; visitor.scamRef = s.id;
      visitor.shady = true;
    }
    // TRADE KNOWLEDGE (Steve 2026-10-06): anyone with the spirit appraises —
    // knowledge-gated like anyone's brain. (De-roled: not a trader class.)
    if (visitor.entrepreneurial) {
      const tk = this.seedTraderKnowledge() || {};
      visitor.traderKnows = tk.staples || [];
      visitor.traderSpecialties = tk.specialties || [];
    }
    v.visitors = v.visitors || [];
    v.visitors.push(visitor);
    const lines = {
      trader: `Riders on the ridge — no, a cart. A TRADER. Word travels: Haven has food, and where there's food there's trade.`,
      scout: `A stranger at the tree line, watching. Not hiding, exactly. Measuring. They'll be gone by dusk — but they'll remember what they saw.`,
      curious: `Someone walks in like they belong here, grinning. "Heard about this place three valleys over. Had to see it." The System's show has an audience, and audiences talk.`,
      fleeing: `They come fast and scared — a family, or what's left of one. "Please. We heard you take people in." Behind them, something worse than weather.`,
    };
    this.say(lines[type]);
    try { this.journalNote && this.journalNote('village', 'stranger', visitor.name + ' arrived (' + type + ').'); } catch (e) {}
    return visitor;
  },
  // interact with the visitor: welcome / trade / turn away / invite to stay
  visitorInteract(visitorId, how) {
    const v = this.state.village;
    const vis = (v.visitors || []).find(x => x.id === visitorId);
    if (!vis) return null;
    const bs = this.betrayalState();
    if (how === 'welcome') {
      this.say(`You welcome ${vis.name}. Food shared, stories traded. Word of Haven travels a little further.`);
      bs.strangersHeard = (bs.strangersHeard || 0) + 1;
      // SHARED FOOD IS REAL (break-it 2026-10-08): the old code decremented the
      // phantom pantryKcal scalar — wiped by pantryKcalLive's sync, so the
      // welcome feast was free. Real food leaves as real items.
      try {
        if (typeof this._removePantryKcal === 'function') this._removePantryKcal(500);
        else v.pantryKcal = Math.max(0, (v.pantryKcal || 0) - 500);
      } catch (e) {}
    } else if (how === 'trade' && this.tradeSpirit(vis) > 0) {
      // THE TRADER'S CART (Steve 2026-10-06): the old beat said "You trade"
      // but no goods moved. Now the cart opens for real — wares below.
      vis.trading = true; vis.selling = false;
      this.visitorWares(vis);
      // RECKONING (Steve 2026-10-06): that face. The one that scammed you.
      // They're back — and they know you know.
      if (vis.returningScammer && vis.scamRef) {
        const s = ((this.state.village || {}).scamLedger || []).find(x => x.id === vis.scamRef);
        if (s && !s.resolved) return this.confrontScammer(vis, s);
      }
      const who = vis.name || 'The hawker';
      this.say(`${who} swings the cart's side panel down. Goods laid out neat on a blanket. "Finished food only — I can't sell a raw turkey at the next village. The good stuff goes first to whoever's hungry for it."`);
      return true;
    } else if (how === 'sell' && this.tradeSpirit(vis) > 0) {
      // SELL TO TRADER (Steve 2026-10-06): he appraises YOUR goods, and his
      // appraisal is knowledge-gated like anyone's brain. You see why the
      // price is what it is.
      vis.selling = true; vis.trading = false;
      this.say(`"Show me what you've got." ${vis.name} folds their arms and waits.`);
      return true;
    } else if (how === 'shelve' && this.tradeSpirit(vis) > 0) {
      vis.trading = false; vis.selling = false;
      this.say(`You step back from the cart. ${vis.name} waits — the road can wait a little.`);
      return true;
    } else if (how === 'done' && this.tradeSpirit(vis) > 0) {
      this.say(`${vis.name || 'The hawker'} folds the blanket back over the cart. "Pleasure doing almost-business. I'll be gone by morning — the road doesn't wait."`);
      v.visitors = (v.visitors || []).filter(x => x.id !== visitorId);
      return true;
    } else if ((how === 'confront' || how === 'letslide') && vis.pendingConfront) {
      const s = ((this.state.village || {}).scamLedger || []).find(x => x.id === vis.pendingConfront);
      if (!s) { vis.pendingConfront = null; return true; }
      return this.resolveConfront(vis, s, how);
    } else if (how === 'invite' && (vis.type === 'fleeing' || vis.type === 'curious')) {
      this.say(`${this.capFirst(vis.name)} ${vis.type === 'fleeing' ? 'cries — relief, mostly' : 'grins wide'}. Haven grows by one.`);
      // they join the roster as a background survivor
      const nid = 'visjoin_' + vis.day;
      v.roster = v.roster || []; v.roster.push(nid);
      const t = v.trust || {}; t[nid] = 20;
    } else if (how === 'away') {
      this.say(`You turn them away. The road takes them. Word travels about that, too.`);
      bs.strangersHeard = (bs.strangersHeard || 0) + 1;
    }
    v.visitors = (v.visitors || []).filter(x => x.id !== visitorId);
    return true;
  },

  // tradeSpirit(person): entrepreneurial spirit, 0-2. Trading is a VERB —
  // anyone with the spirit hawks goods. Villagers: flag or occupation trace
  // (shopkeep blood); visitors: rolled at spawn. (Steve 2026-10-06: de-role
  // the trader — people, not classes.)
  tradeSpirit(person) {
    if (!person) return 0;
    if (person.entrepreneurial) return 2;
    try {
      const vp = (this.data.villagers || []).find(x => x.id === (person.id || person))
        /* unified: hydrated seeds are in villagers */ || {};
      if (vp.entrepreneurial) return 2;
      const occ = String(vp.formerOccupation || '').toLowerCase();
      if (['merchant', 'shopkeep', 'sales', 'peddler', 'trader', 'hawker'].some(w => occ.includes(w))) return 2;
      if (vp._tradeSpiritRolled == null) {
        const temp = (vp.personality || {}).temperament;
        vp._tradeSpiritRolled = (temp === 'bold' && R() < 0.3) ? 1 : 0;
      }
      return vp._tradeSpiritRolled;
    } catch (e) {}
    return 0;
  },
  // seedTraderKnowledge(): what a road trader plausibly knows. Staples are
  // common road foods; specialties are 3 things he "knows a buyer for" —
  // the potential-recognition beat (Steve 2026-10-06).
  seedTraderKnowledge() {
    const staples = ['dandelion', 'dried beans', 'canned beans', 'hardtack', 'trail mix'];
    const specialties = [];
    try {
      const foods = (this.data.items || []).filter(i => i.class === 'food' && i.id);
      const pool = foods.slice();
      for (let n = 0; n < 3 && pool.length; n++) {
        const f = pool.splice(Math.floor(R() * pool.length), 1)[0];
        if (f && !staples.includes(f.id)) specialties.push(f.id);
      }
      const plants = (this.data.plants || []).filter(p => p.id);
      const ppool = plants.slice();
      for (let n = 0; n < 2 && ppool.length; n++) {
        const p = ppool.splice(Math.floor(R() * ppool.length), 1)[0];
        if (p && !staples.includes(p.id) && !specialties.includes(p.id)) staples.push(p.id);
      }
    } catch (e) {}
    return { staples, specialties };
  },
  // traderItemKey: identity for knowledge checks. plantId/itemId when the
  // item carries one, else the plain name.
  traderItemKey(it) {
    if (!it) return '';
    return it.plantId || it.itemId || String(it.name || '').toLowerCase().trim();
  },
  // traderKnowsItem: the trader's brain, knowledge-gated like anyone's.
  // Common knowledge: all meat (everyone on the road knows meat rots) and
  // all preserved trade goods. The rest is what this trader has actually seen.
  traderKnowsItem(vis, it) {
    if (!it) return false;
    if (it.foodKind === 'meat') return true;
    if (/smoked|dried|salted|pickled|cured/i.test(String(it.prep || it.name || ''))) return true;
    const key = this.traderItemKey(it);
    // specialties count as known — if he knows a buyer, he knows the item.
    return (vis.traderKnows || []).includes(key) || (vis.traderSpecialties || []).includes(key);
  },
  // traderAppraise(vis, it): knowledge-gated appraisal. Returns
  // { verdict, pricePerUnit, line } — the player always sees WHY the price
  // is what it is. Verdicts: refuse | decline | cautious | discount |
  // fair | prime | potential. (Steve 2026-10-06: "if you don't know, it
  // doesn't show" applies to the trader's brain too.)
  traderAppraise(vis, it) {
    const day = (this.state.scholar || {}).day || 0;
    const name = it.name || 'it';
    const base = Math.max(0, Math.round(it.kcalEach || 0));
    // BONUS-AWARE (break-it food 2026-10-09): one spoil boundary everywhere.
    // The raw check called bonus-alive food rotten — the trader refused goods
    // your own pack calls edible. He smells the same food you stored right.
    const spoiled = this.isSpoiled ? this.isSpoiled(it) : (it.spoilDay != null && it.spoilDay <= day);
    const key = this.traderItemKey(it);
    // Obviously spoiled meat: refused outright. He smells it — common knowledge.
    if (it.foodKind === 'meat' && spoiled) {
      return { verdict: 'refuse', pricePerUnit: 0,
        line: `He sniffs the ${name} and recoils. "That's turned, friend. I won't touch rotten meat — and neither should you."` };
    }
    if (!this.traderKnowsItem(vis, it)) {
      // Ignorance is honest: a cautious flat offer for plausible food,
      // otherwise a clean decline. He never confidently prices the unknown.
      if (it.edible !== false && (it.foodKind || (it.kcalEach || 0) > 0)) {
        const p = Math.max(5, Math.round(base * 0.4));
        return { verdict: 'cautious', pricePerUnit: p,
          line: `He turns the ${name} over, frowning. "Don't know this one. I'll give you ${p} a piece — my risk, my price."` };
      }
      return { verdict: 'decline', pricePerUnit: 0,
        line: `He shakes his head at the ${name}. "Never seen it. Don't know it, don't buy it."` };
    }
    if (spoiled) {
      const p = Math.max(5, Math.round(base * 0.5));
      return { verdict: 'discount', pricePerUnit: p,
        line: `He sniffs the ${name}, shakes his head. "That's turned. Half price — ${p} a piece, take it or leave it."` };
    }
    // Potential: he knows a buyer for this. The fun part — a knowledgeable
    // trader spotting value you missed.
    if ((vis.traderSpecialties || []).includes(key)) {
      const p = Math.round(base * 1.5);
      return { verdict: 'potential', pricePerUnit: p,
        line: `His eyebrows go up at the ${name}. "Oh — I know a woman two valleys over who pays double for these. ${p} a piece. Don't tell her I said that."` };
    }
    if (/smoked|dried|salted|pickled|cured/i.test(String(it.prep || ''))) {
      const p = Math.round(base * 1.25);
      return { verdict: 'prime', pricePerUnit: p,
        line: `He nods approvingly at the ${name}. "Proper trail food, this. ${p} a piece."` };
    }
    const honest = { verdict: 'fair', pricePerUnit: base,
      line: `"${this.capFirst(name)} — ${base} a piece. Fair's fair."` };
    // UNDER-APPRAISAL SCAM (Steve 2026-10-06): the mirror con. A dishonest
    // buyer claims your fresh goods are "turning" to discount them. You know
    // your own goods — sharp eyes spot the lie at the counter.
    try {
      const sc = this.scamminess(vis);
      if (sc > 0 && !spoiled && base > 0 && this.theirReadOfYou(vis) < 2 && R() < 0.15 + 0.15 * sc) {
        const p = Math.max(5, Math.round(base * 0.55));
        const entry = this.recordScam(vis.name || 'the buyer', vis.id || null, 'underappraise', name);
        const playerKnows = this.plantKnown && it.plantId && this.plantKnown(it.plantId);
        const ap = { verdict: 'discount', pricePerUnit: p,
          line: `He sniffs the ${name}, pulls a face. "Hmm. Turning, I'd say — see the edges? ${p} a piece, and I'm being generous."`,
          scam: { kind: 'underappraise', truePrice: base, ledgerId: entry.id } };
        if (playerKnows) {
          ap.scam.discovered = true; entry.discovered = true;
          ap.line += ` (You know this ${name} — you picked it, you prepped it. It is NOT turning.)`;
        }
        return ap;
      }
    } catch (e) {}
    return honest;
  },
  // ---------- SCAMS (Steve 2026-10-06) ----------
  // Scamming is NOT a trader-class behavior. Anyone can run one — driven by
  // dishonesty, desperation, and their read of YOUR ignorance. The trader is
  // just whoever happens to be hawking right now. (People, not classes.)
  //
  // scamminess(person): 0-3. Malicious dark tell = a dishonest streak.
  // Desperation is situational: hungry village, or a road-desperate visitor.
  scamminess(person) {
    let s = 0;
    try {
      const pid = person && (person.id || person);
      const vp = (this.data.villagers || []).find(x => x.id === pid)
        /* unified: hydrated seeds are in villagers */ || null;
      if (vp && vp.personality && vp.personality.dark && vp.personality.dark.kind === 'malicious') s += 2;
      if (person && person.shady) s += 2;
      if (person && person.desperate) s += 1;
      const v = this.state.village || {};
      if ((v.hungryDays || 0) > 0 && vp) s += 1; // hungry people do hungry things
    } catch (e) {}
    return Math.min(3, s);
  },
  // tradeSavvy(): how sharp the PLAYER is about trade. Scammers read this.
  tradeSavvy() {
    const s = this.state.scholar || {};
    const codexBreadth = Object.keys(this.state.codex.plants || {}).length;
    return (s.tradesDone || 0) + (s.scamsCalledOut || 0) * 2 + Math.min(4, Math.floor(codexBreadth / 4));
  },
  // theirReadOfYou(person): 0 green, 1 ordinary, 2 sharp. They can misread.
  theirReadOfYou(person) {
    const savvy = this.tradeSavvy();
    let read = savvy >= 8 ? 2 : savvy >= 3 ? 1 : 0;
    if (R() < 0.25) read = Math.max(0, Math.min(2, read + (R() < 0.5 ? -1 : 1))); // misread
    return read;
  },
  // maybeScamWare(person, ware): roll once per ware at generation. Marks
  // ware.scam = { kind, ...truth } and adjusts the LIE the player sees.
  // Kinds: overprice (inflated price), spoiled_as_fresh (hidden early spoil),
  // tier_lie (advertised tier above real tier, alien loot only).
  maybeScamWare(person, ware) {
    if (!ware || ware.sold) return ware;
    const sc = this.scamminess(person);
    if (sc <= 0) return ware;
    const read = this.theirReadOfYou(person);
    let chance = 0.12 + 0.18 * sc + (read === 0 ? 0.25 : read === 1 ? 0.1 : -0.12);
    chance = Math.max(0, Math.min(0.65, chance));
    if (R() > chance) return ware;
    const kinds = ['overprice'];
    if (ware.kind === 'alien') kinds.push('tier_lie');
    // spoiled_as_fresh needs something that CAN spoil — food-ish wares only
    if (ware.kind !== 'alien') kinds.push('spoiled_as_fresh');
    const kind = kinds[Math.floor(R() * kinds.length)];
    ware.scam = { kind, by: person.name || 'the hawker', byId: person.id || null, day: (this.state.scholar || {}).day || 0 };
    if (kind === 'overprice') {
      ware.scam.truePrice = ware.price;
      ware.price = Math.round(ware.price * (1.6 + R() * 0.6));
    } else if (kind === 'spoiled_as_fresh') {
      // presented fresh; actually turns in 1-2 days
      ware.scam.trueSpoilIn = 1 + Math.floor(R() * 2);
      ware.blurb += ` "Fresh as morning, I swear it."`;
    } else if (kind === 'tier_lie') {
      const def = (this.data.items || []).find(i => i.id === ware.itemId) || {};
      const realTier = def.tier || 1;
      ware.scam.advertisedTier = Math.min(4, realTier + 1 + Math.floor(R() * 2));
      ware.scam.trueTier = realTier;
      ware.name = (ware.name || 'curio') + ` (tier ${ware.scam.advertisedTier})`;
      ware.blurb = `"Tier ${ware.scam.advertisedTier}, straight off the sky. Feel the weight of it."`;
    }
    return ware;
  },
  // recordScam: the ledger. Discovered scams can be confronted when the face
  // comes back down the road.
  recordScam(whoName, whoId, kind, wareName) {
    const v = this.state.village || {};
    v.scamLedger = v.scamLedger || [];
    const entry = { id: 'scam_' + Date.now().toString(36) + '_' + Math.floor(R() * 1e9).toString(36), whoName, whoId,
      kind, wareName, day: (this.state.scholar || {}).day || 0, discovered: false, resolved: false }; // ID UNIQUENESS (break-it persistence 2026-10-10 r9): Date.now()+R()*99 collided when two scammed wares were bought in the same millisecond (1/99 per pair) — ledger lookups by id then hit the wrong entry. Same shape as fight ids: timestamp + wide random.
    v.scamLedger.push(entry);
    return entry;
  },
  // scamDaily: delayed discovery — a knowledgeable villager remarks on what
  // you bought. Runs from betrayalDaily.
  scamDaily() {
    try {
      const v = this.state.village || {};
      const ledger = v.scamLedger || [];
      const pending = ledger.filter(s => !s.discovered && !s.resolved);
      if (!pending.length) return;
      // a sharp-eyed villager (trade spirit or deep codex) might notice
      const roster = v.roster || [];
      const sharp = roster.find(rid => this.tradeSpirit(rid) >= 1);
      if (!sharp || R() > 0.35) return;
      const s = pending[Math.floor(R() * pending.length)];
      s.discovered = true;
      const remark = {
        overprice: `"You paid ${s.paid || 'that much'} for ${s.wareName}? ${s.whoName} saw you coming, friend."`,
        spoiled_as_fresh: `"That ${s.wareName} from ${s.whoName} — smelled off to me when you brought it in. Check it before you trust it."`,
        tier_lie: `"${s.whoName} called that a tier ${s.advertisedTier}? I've seen tier ${s.advertisedTier}. That wasn't it."`,
      }[s.kind] || `"Keep an eye on ${s.whoName}. Something about that deal stank."`;
      this.say(`${this.displayName(sharp)} sidles up. ${remark} (You can confront them next time that face shows up.)`);
      try { this.journalNote && this.journalNote('village', 'stranger', `Scammed by ${s.whoName} (${s.kind} on ${s.wareName}) — ${sharp} noticed.`); } catch (e) {}
    } catch (e) {}
  },
  // confrontScammer(vis, s): the reckoning. You were scammed, you found out,
  // and that face came back. Nerve + witnesses decide: bluster, discount,
  // or gone by morning. Theft by other means gets the social punishment.
  confrontScammer(vis, s) {
    vis.pendingConfront = s.id;
    const kindLine = { overprice: 'overcharged you', spoiled_as_fresh: 'sold you rotten rations as fresh',
      tier_lie: 'sold you a painted tier', underappraise: 'robbed you blind on the appraisal' }[s.kind] || 'cheated you';
    this.say(`That face. ${vis.name} — the one who ${kindLine} last time they came through. They see the recognition hit. Their smile doesn't quite make it. "...Back again. The road's a circle."`);
    return true;
  },
  // resolveConfront(vis, s, how): 'confront' or 'letslide'.
  resolveConfront(vis, s, how) {
    const v = this.state.village || {};
    vis.pendingConfront = null;
    if (how === 'letslide') {
      s.resolved = true; s.letSlide = true;
      try { this.state.scholar.letSlide = (this.state.scholar.letSlide || 0) + 1; } catch (e) {}
      this.say(`You let it go. ${vis.name}'s smile comes back, a little too fast. They'll remember you as an easy mark.`);
      return true;
    }
    // CONFRONT. Nerve: the desperate fold, the shady bluster, the rest pay.
    const witnesses = (v.roster || []).length;
    const nerve = vis.desperate ? 'fold' : (vis.shady ? 'bluster' : 'pay');
    s.resolved = true;
    try { this.state.scholar.scamsCalledOut = (this.state.scholar.scamsCalledOut || 0) + 1; } catch (e) {}
    try { this.journalNote && this.journalNote('village', 'stranger', `Confronted ${vis.name} over the ${s.kind} scam. They ${nerve === 'bluster' ? 'blustered' : nerve === 'fold' ? 'folded and ran' : 'paid up'}.`); } catch (e) {}
    if (nerve === 'bluster') {
      vis.leavesDay = (this.state.scholar || {}).day || 0; // gone by morning
      this.say(`"Me? Cheat YOU?" ${vis.name} goes loud — the bluster of the caught. Nobody's buying it${witnesses >= 3 ? ', and the whole village is watching' : ''}. They pack the cart an hour later. Word will travel ahead of them now.`);
    } else if (nerve === 'fold') {
      vis.leavesDay = (this.state.scholar || {}).day || 0;
      this.say(`${vis.name} goes pale. No bluster in them — just fear. "Look, times are hard —" They don't finish. The cart is gone before dark.${witnesses >= 3 ? ' Everyone saw.' : ''}`);
    } else {
      vis.confrontDiscount = 0.7;
      this.say(`${vis.name} holds up both hands. "Alright. Alright." Shame looks strange on them. "Thirty percent off — everything — and we forget the whole thing. Deal?" (Their prices are cut until they leave.)`);
    }
    if (witnesses >= 3) {
      try { this.betrayalState().strangersHeard = (this.betrayalState().strangersHeard || 0) + 1; } catch (e) {}
      this.say(`Word travels. The next hawker down the road will have heard about this.`);
    }
    return true;
  },
  // hawkerOffer(vid): an entrepreneurial VILLAGER hawks. Anyone with the
  // spirit can sell — the village has its own merchants. One ware, offered
  // in conversation; scams ride the same rails as visitor wares.
  hawkerOffer(vid) {
    const v = this.state.village || {};
    v.hawkerStock = v.hawkerStock || {};
    let ware = v.hawkerStock[vid];
    if (!ware || ware.sold) {
      // build one ware: a tool they "found", or trail food they made
      const day = (this.state.scholar || {}).day || 0;
      if (R() < 0.5) {
        try {
          const carried = new Set((this.state.scholar.inventory || []).map(i => i.itemId || i.id));
          const tools = (this.data.items || []).filter(i => i.class === 'tool' && !carried.has(i.id));
          const def = (tools.length ? tools[Math.floor(R() * tools.length)] : {}) || {};
          if (def.id) ware = { kind: 'tool', itemId: def.id, name: def.name || def.id, sold: false,
            price: 400 + Math.floor(R() * 5) * 100, kg: def.kg || 0.5, blurb: `"Found it. Fixed it. Yours if the price is right."` };
        } catch (e) {}
      }
      if (!ware) {
        ware = { kind: 'food', itemId: 'hawker_food', name: 'Smoked strips', sold: false,
          price: 300 + Math.floor(R() * 3) * 100, units: 2, kcalEach: 300, spoilDay: day + 5, kg: 0.6,
          blurb: `"Smoked them myself. Good for the road."` };
      }
      const person = { id: vid, name: this.displayName(vid), shady: this.scamminess(vid) >= 2, desperate: (v.hungryDays || 0) > 0 };
      try { this.maybeScamWare(person, ware); } catch (e) {}
      v.hawkerStock[vid] = ware;
    }
    return ware;
  },
  // hawkerBuy(vid): buy the villager's offered ware. Same payment rails.
  hawkerBuy(vid) {
    const v = this.state.village || {};
    const ware = (v.hawkerStock || {})[vid];
    if (!ware || ware.sold) return null;
    const person = { id: vid, name: this.displayName(vid) };
    // seed their appraisal brain if needed (for future sell-side)
    // (villagers appraise via traderAppraise with traderKnows seeded lazily)
    let price = ware.price;
    const pay = this.traderPay(price);
    if (!pay.ok) {
      this.say(`${this.displayName(vid)} shakes their head. "${price} kcal of finished food — and you're about ${pay.short} short. Come back with a full pack."`);
      return null;
    }
    ware.sold = true;
    const savvy = this.tradeSavvy();
    if (ware.scam && !ware.scam.discovered) {
      if (ware.scam.kind === 'overprice' && savvy >= 3) {
        ware.scam.discovered = true;
        this.say(`(You've bought enough to know: ${ware.scam.truePrice} is honest for this. They're asking ${ware.price}.)`);
      }
      const entry = this.recordScam(this.displayName(vid), vid, ware.scam.kind, ware.name);
      entry.paid = ware.price; entry.discovered = !!ware.scam.discovered;
      ware.scam.ledgerId = entry.id;
    }
    try { this.state.scholar.tradesDone = (this.state.scholar.tradesDone || 0) + 1; } catch (e) {}
    if (ware.kind === 'food') {
      const day = (this.state.scholar || {}).day || 0;
      const entry = { itemId: ware.itemId, name: ware.name, units: ware.units || 1, kcalEach: ware.kcalEach || 300,
        spoilDay: ware.spoilDay != null ? ware.spoilDay : day + 5, unit: 'ration',
        kg: ware.kg != null ? ware.kg / (ware.units || 1) : 0.4 };
      if (ware.scam && ware.scam.kind === 'spoiled_as_fresh') {
        entry.spoilDay = day + ware.scam.trueSpoilIn;
        entry.scamSpoiled = true; entry.scamLedgerId = ware.scam.ledgerId;
      }
      (this.state.scholar.inventory = this.state.scholar.inventory || []).push(entry);
    } else {
      const def = (this.data.items || []).find(i => i.id === ware.itemId) || {};
      (this.state.scholar.inventory = this.state.scholar.inventory || []).push({ itemId: ware.itemId, name: ware.name, units: 1, kcalEach: 0, kg: ware.kg != null ? ware.kg : (def.kg || 0.8) });
    }
    const took = pay.taken.map(t => `${t.units}× ${t.name}`).join(', ');
    this.say(`Done — the ${ware.name} is yours for ${took}. ${this.displayName(vid)} pockets the food with a merchant's neat hands.`);
    // SOCIAL: a villager who scams YOU faces the village, not the road.
    // Discovery lands via scamDaily remarks; trust does the punishing.
    try { this.observe('trade', { noTrust: true }); } catch (e) {}
    return true;
  },
  // traderSellStock(vis): pack food stacks with appraisals, for the sell view.
  traderSellStock(vis) {    const inv = this.state.scholar.inventory || [];
    return inv.map((it, idx) => ({ idx, it, ap: this.traderAppraise(vis, it) }))
      .filter(e => (e.it.kcalEach || 0) > 0 && (e.it.units || 0) > 0);
  },
  // traderSell(visId, packIdx): sell the whole stack. The price lands on the
  // trader's tab as credit toward his wares.
  traderSell(visId, packIdx) {
    const v = this.state.village;
    const vis = (v.visitors || []).find(x => x.id === visId);
    if (!vis || this.tradeSpirit(vis) <= 0) return null;
    const inv = this.state.scholar.inventory || [];
    const it = inv[packIdx];
    if (!it || (it.units || 0) <= 0) return null;
    const ap = this.traderAppraise(vis, it);
    if (ap.verdict === 'refuse' || ap.verdict === 'decline') {
      this.say(ap.line);
      return null;
    }
    const units = it.units, total = ap.pricePerUnit * units;
    vis.credit = (vis.credit || 0) + total;
    const name = it.name || 'it';
    inv.splice(packIdx, 1);
    this.say(`${ap.line} Done — ${units}× ${name} for ${total} kcal on your tab.`);
    try { this.observe('trade', { noTrust: true }); } catch (e) {}
    return true;
  },
  // ---------- 8b. THE TRADER'S CART (Steve 2026-10-06) ----------
  // The trader buys FINISHED food from your pack (perishable-first: they eat
  // on the road; rot becomes their problem, not yours) and sells three wares.
  // Preserved food (smoked/dried/salted) counts 1.5x toward the price — trail
  // food is trail food. This is the miser's honest outlet: perishables that
  // would rot in the pantry become alien goods, tools, and news.
  visitorWares(vis) {
    if (vis.wares && vis.wares.length) return vis.wares;
    const wares = [];
    // 1. off-world curiosity: tier-1 only. The trader is not the System; their
    //    best stock is small things that fell out of the sky. The name is the
    //    System's narration (visible); what it DOES, you learn by using it.
    try {
      const alienId = this.rollAlienLoot({ loot: { chance: 1, tier: 1 }, wave: 1 });
      const def = (this.data.items || []).find(i => i.id === alienId) || {};
      if (alienId) wares.push({
        kind: 'alien', itemId: alienId, name: def.name || alienId, sold: false,
        price: 1200 + Math.floor(R() * 9) * 100, kg: def.kg || 0.3,
        blurb: `"Came down in a care package. No idea what it does. That's the fun part."`,
      });
    } catch (e) {}
    // 2. a good tool: fell-tier if the cart has one (a miser without an axe
    //    feels this in their bones), else whatever sharp thing is handy.
    //    Never a duplicate of what's already in your pack.
    try {
      const carried = new Set((this.state.scholar.inventory || []).map(i => i.itemId || i.id));
      const tools = (this.data.items || []).filter(i => i.class === 'tool' && !carried.has(i.id));
      // functional tools first (a duffel bag is class 'tool' but nobody's
      // buying a duffel bag as "good steel"); fell-tier before the rest.
      const functional = tools.filter(i => i.tool && typeof i.tool === 'object');
      const fell = functional.filter(i => i.tool.woodcut === 'fell');
      const def = pick(fell.length ? fell : (functional.length ? functional : tools)) || {};
      if (def.id) wares.push({
        kind: 'tool', itemId: def.id, name: def.name || def.id, sold: false,
        price: 500 + Math.floor(R() * 6) * 100, kg: def.kg || 0.5,
        blurb: def.tool && def.tool.woodcut === 'fell'
          ? `"Fells trees. You know what that means out here."`
          : `"Good steel. Somebody's grandfather kept this sharp."`,
      });
    } catch (e) {}
    // 3. news: names of real other villages + a road tip for the journal.
    //    Word of Haven travels — and word travels back.
    wares.push({
      kind: 'news', name: 'Road news', sold: false, price: 300,
      blurb: `"Two villages you've never heard named, and which road feeds you between them."`,
    });
    // 4. trail rations, sometimes: a hawker eats too. Real food, real spoil.
    //    (This is what spoiled_as_fresh scams ride on.)
    if (R() < 0.5) {
      const day = (this.state.scholar || {}).day || 0;
      wares.push({
        kind: 'food', itemId: 'trail_rations', name: 'Trail rations', sold: false,
        price: 400 + Math.floor(R() * 4) * 100, units: 3,
        kcalEach: 350, spoilDay: day + 4, kg: 1.2,
        blurb: `"Smoked, salted, honest. Four days easy, probably more."`,
      });
    }
    vis.wares = wares;
    // SCAMS (Steve 2026-10-06): anyone with the spirit might run one — keyed
    // off THEIR dishonesty and THEIR read of you, not a role flag.
    try {
      for (const w of wares) this.maybeScamWare(vis, w);
    } catch (e) {}
    return wares;
  },
  // traderPay(kcal): spend finished food from the pack until the price is met.
  // Most-perishable first. Two-pass so a failed payment leaves the pack
  // untouched.
  traderPay(kcal) {
    const inv = this.state.scholar.inventory || [];
    const scored = [];
    inv.forEach((it, idx) => {
      if (!this.isFinishedFood || !this.isFinishedFood(it)) return;
      if ((it.units || 0) <= 0 || (it.kcalEach || 0) <= 0) return;
      const preserved = /smoked|dried|salted|pickled|cured/i.test(String(it.prep || it.name || ''));
      scored.push({ idx, it, preserved, rate: preserved ? 1.5 : 1 });
    });
    scored.sort((a, b) => (a.it.spoilDay ?? 99999) - (b.it.spoilDay ?? 99999));
    let need = kcal;
    const plan = [];
    for (const e of scored) {
      if (need <= 0) break;
      const kcalEach = (e.it.kcalEach || 0) * e.rate;
      const take = Math.min(e.it.units || 0, Math.ceil(need / kcalEach));
      if (take <= 0) continue;
      plan.push({ idx: e.idx, take, name: e.it.name, preserved: e.preserved, kcal: Math.round(take * (e.it.kcalEach || 0)) });
      need -= take * kcalEach;
    }
    if (need > 0) return { ok: false, short: Math.ceil(need) };
    const taken = [];
    for (const p of plan) {
      inv[p.idx].units -= p.take;
      taken.push({ name: p.name, units: p.take, preserved: p.preserved, kcal: p.kcal });
    }
    this.state.scholar.inventory = inv.filter(i => (i.units || 0) > 0 || !(i.kcalEach > 0));
    return { ok: true, taken, paid: taken.reduce((t, x) => t + x.kcal, 0) };
  },
  visitorBuyWare(visId, idx) {
    const v = this.state.village;
    const vis = (v.visitors || []).find(x => x.id === visId);
    if (!vis || this.tradeSpirit(vis) <= 0) return null;
    const w = (this.visitorWares(vis) || [])[idx];
    if (!w) return null;
    if (w.sold) { this.say('Already sold. The blanket has a bare patch where it sat.'); return null; }
    // TAB FIRST (Steve 2026-10-06): credit from selling to the trader spends
    // before the pack does. If the pack can't cover the remainder, the tab
    // spend is rolled back — no partial purchases.
    // CONFRONTATION DISCOUNT: shamed hawkers cut prices until they leave.
    let price = w.price;
    if (vis.confrontDiscount && vis.confrontDiscount < 1) price = Math.max(1, Math.round(price * vis.confrontDiscount));
    const tabUsed = Math.min(vis.credit || 0, price);
    vis.credit = (vis.credit || 0) - tabUsed;
    price -= tabUsed;
    let pay = { ok: true, taken: [], paid: 0 };
    if (price > 0) pay = this.traderPay(price);
    if (!pay.ok) {
      vis.credit = (vis.credit || 0) + tabUsed; // roll back
      this.say(`${vis.name} shakes their head. "${w.price} kcal of finished food for the ${w.name} — and you're about ${pay.short} short${tabUsed ? ` even after your ${tabUsed} tab` : ''}. The smoked stuff counts extra, if you've got any."`);
      return null;
    }
    w.sold = true;
    const took = pay.taken.map(t => `${t.units}× ${t.name}${t.preserved ? ' (preserved)' : ''}`).join(', ');
    const tabNote = tabUsed ? ` ${tabUsed} off your tab${took ? ',' : ''}` : '';
    // SCAM DISCOVERY, at the counter (Steve 2026-10-06): a sharp eye spots
    // the lie before money changes hands. Knowledge is the counterplay.
    const savvy = this.tradeSavvy();
    if (w.scam && !w.scam.discovered) {
      if (w.scam.kind === 'overprice' && savvy >= 3) {
        w.scam.discovered = true;
        this.say(`(You've bought enough on the road to know: ${w.scam.truePrice} is the honest price for this. They're asking ${w.price}.)`);
      } else if (w.scam.kind === 'tier_lie' && savvy >= 5) {
        w.scam.discovered = true;
        this.say(`(The "tier ${w.scam.advertisedTier}" sigil looks painted on. Your gut says tier ${w.scam.trueTier}, tops.)`);
      }
      // ledger it either way — a sharp villager may notice later
      const entry = this.recordScam(vis.name, vis.id, w.scam.kind, w.name);
      entry.paid = w.price; entry.advertisedTier = w.scam.advertisedTier;
      entry.discovered = !!w.scam.discovered;
      w.scam.ledgerId = entry.id;
    }
    try { this.state.scholar.tradesDone = (this.state.scholar.tradesDone || 0) + 1; } catch (e) {}
    if (w.kind === 'alien') {
      const granted = this.alienLootGrant(w.itemId);
      // tier lie rides on the granted item — revealed at first use
      if (w.scam && w.scam.kind === 'tier_lie' && granted && granted.entry) {
        granted.entry.scamTierLie = true;
        granted.entry.advertisedTier = w.scam.advertisedTier;
        granted.entry.scamLedgerId = w.scam.ledgerId;
      }
      this.say(`Done. The ${w.name} is yours —${tabNote}${took ? ' ' + took : ''} for it. ${vis.name} watches you turn it over. "No idea what it does. You'll figure it out — everybody does, eventually." (Try using it.)`);
    } else if (w.kind === 'food') {
      const day = (this.state.scholar || {}).day || 0;
      const entry = { itemId: w.itemId || 'trail_rations', name: w.name, units: w.units || 1,
        kcalEach: w.kcalEach || 300, spoilDay: w.spoilDay != null ? w.spoilDay : day + 4,
        unit: 'ration', kg: 0.4 };
      // spoiled_as_fresh: sold as fresh, actually turns almost immediately.
      // The early rot IS the discovery — undeniable, dated, damning.
      if (w.scam && w.scam.kind === 'spoiled_as_fresh') {
        entry.spoilDay = day + w.scam.trueSpoilIn;
        entry.scamSpoiled = true; entry.scamLedgerId = w.scam.ledgerId;
      }
      (this.state.scholar.inventory = this.state.scholar.inventory || []).push(entry);
      this.say(`Done. The ${w.name} ${w.units > 1 ? `(${w.units} rations)` : ''} ${w.units > 1 ? 'are' : 'is'} yours —${tabNote}${took ? ' ' + took : ''} for ${w.units > 1 ? 'them' : 'it'}. "Eat well on the road."`);
    } else if (w.kind === 'tool') {
      const def = (this.data.items || []).find(i => i.id === w.itemId) || {};
      (this.state.scholar.inventory = this.state.scholar.inventory || []).push({ itemId: w.itemId, name: w.name, units: 1, kcalEach: 0, kg: def.kg || 0.8 });
      this.say(`Done. The ${w.name} is yours —${tabNote}${took ? ' ' + took : ''} for it. Good steel has a way of paying for itself.`);
    } else {
      // news: real village names from the world, a road tip, word spreads
      const bs = this.betrayalState();
      const named = (this.state.otherVillages || []).filter(x => x && x.name).slice(0, 2).map(x => x.name);
      bs.strangersHeard = (bs.strangersHeard || 0) + 2;
      try { this.journalNote && this.journalNote('village', 'stranger', `Road news from the trader: ${named.length ? named.join(', ') : 'two villages down the river'} — and which road feeds you between them.`); } catch (e) {}
      this.say(named.length
        ? `${vis.name} sketches a map in the dirt: "${named.join(' — ')}. Three days if the road's kind. There's orchards gone wild halfway; eat your fill, nobody's claimed them." Word of Haven travels a little further, too.`
        : `${vis.name} sketches a map in the dirt: "Two villages down the river — you'll smell their smoke before you see them. There's orchards gone wild halfway; eat your fill, nobody's claimed them." Word of Haven travels a little further, too.`);
    }
    try { this.observe('trade', { noTrust: true }); } catch (e) {}
    try { this.tickAction(8); } catch (e) {}
    return true;
  },
  // visitorHtml: the Haven panel block. Traders get the cart UI; other
  // visitor types get the honest options they always should have had.
  visitorHtml() {
    const vs = this.state.village.visitors || [];
    if (!vs.length) return '';
    const d = this.state.scholar.day;
    return vs.map(vis => {
      const leaving = vis.leavesDay != null && vis.leavesDay <= d ? ' — leaving tonight' : '';
      let acts = '';
      if (this.tradeSpirit(vis) > 0) {
        if (vis.pendingConfront) {
          acts = `<button class="btn sm" data-visitor-act="${vis.id}" data-how="confront">"You scammed me."</button> <button class="btn sm ghost" data-visitor-act="${vis.id}" data-how="letslide">(let it slide)</button>`;
        } else if (vis.trading) {
          acts = `<button class="btn sm ghost" data-visitor-act="${vis.id}" data-how="shelve">Step back</button>`;
        } else if (vis.selling) {
          acts = `<button class="btn sm ghost" data-visitor-act="${vis.id}" data-how="shelve">Done selling</button>`;
        } else {
          acts = `<button class="btn sm" data-visitor-act="${vis.id}" data-how="trade">🛒 Buy</button> <button class="btn sm" data-visitor-act="${vis.id}" data-how="sell">💰 Sell</button>`;
        }
        acts += ` <button class="btn sm ghost" data-visitor-act="${vis.id}" data-how="welcome">Welcome</button> <button class="btn sm ghost" data-visitor-act="${vis.id}" data-how="away">Turn away</button>`;
      } else {
        acts = `<button class="btn sm" data-visitor-act="${vis.id}" data-how="welcome">Welcome</button>`;
        if (vis.type === 'fleeing' || vis.type === 'curious') acts += ` <button class="btn sm" data-visitor-act="${vis.id}" data-how="invite">Invite to stay</button>`;
        acts += ` <button class="btn sm ghost" data-visitor-act="${vis.id}" data-how="away">Turn away</button>`;
      }
      let cart = '';
      if (this.tradeSpirit(vis) > 0 && vis.trading) {
        cart = `<br>🛒 <b>The cart is open.</b> Finished food only — the perishable stuff goes first, preserved counts extra.${(vis.credit || 0) > 0 ? ` Your tab: <b>${vis.credit} kcal</b>.` : ''}<br>` +
          this.visitorWares(vis).map((w, i) => {
            let spr = '';
            try { const f = window.Scattering && window.Scattering.itemSpriteHtml; if (f && w.itemId) spr = f({ id: w.itemId }); } catch (e) {}
            return `<span class="small">· ${spr}<b>${w.name}</b> — ${w.price} kcal${w.kg ? ` · ${w.kg} kg` : ''}${w.sold ? ' <i>(sold)</i>' : ` <button class="btn ghost sm" data-ware-buy="${vis.id}:${i}">Buy</button>`}<br><span style="opacity:.7">${w.blurb}</span></span>`;
          }).join('<br>');
      }
      if (this.tradeSpirit(vis) > 0 && vis.selling) {
        // SELL VIEW (Steve 2026-10-06): every stack appraised in the open,
        // with the trader's reasoning. His brain is knowledge-gated too.
        const stock = this.traderSellStock(vis);
        const rows = stock.length ? stock.map(e => {
          const sellable = e.ap.pricePerUnit > 0;
          let spr = '';
          try { const f = window.Scattering && window.Scattering.itemSpriteHtml; if (f) spr = f(e.it); } catch (e2) {}
          return `<span class="small">· ${spr}<b>${e.it.name}</b> ×${e.it.units} (${(((e.it.kg || 0.1)) * e.it.units).toFixed(1)} kg) — ${sellable ? `<b>${e.ap.pricePerUnit} kcal</b> each` : '<i>no sale</i>'}${sellable ? ` <button class="btn ghost sm" data-ware-sell="${vis.id}:${e.idx}">Sell</button>` : ''}<br><span style="opacity:.7">${e.ap.line}</span></span>`;
        }).join('<br>') : '<span class="small">Nothing in your pack worth selling.</span>';
        cart = `<br>💰 <b>Selling.</b> He appraises everything in the open. Your tab: <b>${vis.credit || 0} kcal</b>.<br>` + rows;
      }
      return `<p class="small" style="margin-top:8px"><b>🧳 Visitor:</b> ${this.capFirst(vis.name)} (${vis.type})${leaving}${cart}<br>${acts}</p>`;
    }).join('');
  },
  // visitorDaily: traders don't wait forever. Unvisited by the next day, they
  // move on — which also frees the stranger slot (before this, one ignored
  // visitor blocked every future stranger, silently, forever).
  visitorDaily() {
    const v = this.state.village, d = this.state.scholar.day;
    const vs = v.visitors || [];
    for (const x of vs) if (x.leavesDay == null) x.leavesDay = (x.day || d) + 1;
    const leaving = vs.filter(x => (x.leavesDay ?? 999999) <= d && !x.trading);
    if (!leaving.length) return;
    for (const x of leaving) this.say(`${this.capFirst(x.name)} waits a while, then moves on down the road. Word travels about that, too.`);
    v.visitors = vs.filter(x => !leaving.includes(x));
  },

  // ---------- 11. DAILY + WORLDGEN ----------
  // NPC-targeted plots spring on their own (the luring happens off-screen),
  // and stale armed plots expire so the single-plot slot never squats forever.
  npcPlotTick() {
    const bs = this.betrayalState();
    const day = this.state.scholar.day;
    for (const p of (bs.plots || [])) {
      if (!p.active || p.sprung || p.resolved) continue;
      const age = day - (p.day || 0);
      if (age > 4) {
        // stale: the moment passed, the conspirators lost their nerve. Slot frees.
        p.active = false; p.resolved = true; p.expired = true;
        try {
          const h = this.inviteHistory(p.inviter);
          if (h && h.pending && h.pending.plotId === p.id) h.pending = null;
        } catch (e) {}
        continue;
      }
      if (this.isPlayer(p.target)) continue; // player plots spring via acceptInvite
      if (R() < 0.45) this.springAmbush(p);
    }
  },
  betrayalDaily() {
    try { this.considerBetrayalPlot(); } catch (e) {}
    try { this.npcPlotTick(); } catch (e) {}
    try { this.npcInviteTick(); } catch (e) {}
    try { this.dayOneNudge(); } catch (e) {}
    try { this.considerStrangers(); } catch (e) {}
    try { this.scamDaily(); } catch (e) {} // delayed scam discovery: sharp villagers remark
    try { this.visitorDaily(); } catch (e) {} // stale visitors move on; frees the stranger slot
    // simmer: conflicts gain a little tension; grievances fade very slowly
    try {
      for (const c of (this.state.village.conflicts || [])) {
        if (!c.resolved && R() < 0.1) c.tension = Math.min(100, (c.tension || 10) + 2);
      }
    } catch (e) {}
  },
  // guarantee a reachable village: wrap genVillages
  ensureReachableVillage() {
    const ovs = this.state.otherVillages || [];
    const near = ovs.some(v => Math.abs(v.x - 3) + Math.abs(v.y - 3) <= 5);
    if (near || !ovs.length) return;
    // pull the closest one into reach
    let best = ovs[0], bd = 99;
    for (const v of ovs) { const d = Math.abs(v.x - 3) + Math.abs(v.y - 3); if (d < bd) { bd = d; best = v; } }
    best.x = 3 + (R() < 0.5 ? -1 : 1) * (3 + Math.floor(R() * 2));
    best.y = 3 + (R() < 0.5 ? -1 : 1) * (3 + Math.floor(R() * 2));
    best.x = clamp(best.x, 0, 6); best.y = clamp(best.y, 0, 6);
  },

  // ---------- 12. INTEGRATION WRAPS ----------
  betrayalChoices(vid) {
    const out = [];
    let c = null;
    try { c = this.convoGet(vid); } catch (e) { return out; }
    // AMBUSH THREAD: only RUN / TALK / FIGHT
    if (c.thread === 'ambush') {
      const plot = (this.betrayalState().plots || []).find(p => p.id === c.ambushPlot);
      out.push({ id: 'betrayal:run', label: '🏃 RUN — this is the move' });
      if (plot && (plot.talksLeft || 0) > 0) out.push({ id: 'betrayal:talk', label: '🗣️ TALK — stall them, buy distance' });
      out.push({ id: 'betrayal:fight', label: '🥊 FIGHT — desperate, all-in' });
      return out;
    }
    // pending invite
    const inv = this.pendingInvite(vid);
    if (inv) {
      const def = (this.INVITE_DEFS() || []).find(d => d.id === inv.defId);
      out.push({ id: 'betrayal:accept', label: '"Sure. ' + (def ? def.label.slice(1, -1) : 'Let\'s go.') + '"' });
      out.push({ id: 'betrayal:decline', label: '"Not this time."' });
    }
    const cases = (this.betrayalState().cases || []).filter(x =>
      (x.status === 'open' || x.status === 'dormant') && (x.knownToPlayer || x.playerRole !== 'bystander'));
    for (const cs of cases) {
      const tag = cs.id + ':';
      if (cs.accused.includes(vid) && cs.status === 'open') {
        out.push({ id: 'betrayal:press:' + tag + vid, label: `"Walk me through that night again. Slowly." (press ${this.whoTag(vid)})` });
      }
      if (cs.weakest === vid && !cs.flipped && cs.status === 'open') {
        out.push({ id: 'betrayal:approach:' + cs.id, label: `"Talk first. Leniency. The offer expires when I walk away."` });
      }
    }
    // case-level actions (offered once per known case)
    for (const cs of cases) {
      if (cs.status !== 'open' && cs.status !== 'dormant') continue;
      const tname = this.disp(cs.target);
      if (cs.status === 'open' && this.isPlayer(cs.target)) {
        out.push({ id: 'betrayal:wounds:' + cs.id, label: '"Look at me. Does this look like I started it?" (show your wounds)' });
      }
      if (cs.status === 'open' && !cs.siteExamined && cs.playerRole !== 'accused') {
        out.push({ id: 'betrayal:site:' + cs.id, label: 'Go back to the site. Look at the ground.' });
      }
      if (cs.status === 'open' && !cs.witnessesNamed && cs.playerRole !== 'accused') {
        // role-aware: "us" only when you were there; the juror asks about them
        const sawUs = this.isPlayer(cs.target);
        out.push({ id: 'betrayal:witnesses:' + cs.id, label: sawUs ? '"Who saw us leave?" (name the witnesses)' : '"Who saw them leave?" (name the witnesses)' });
      }
      // THE PLAYER'S DEFENSE — when you stand accused. You don't litigate
      // with random villagers; the strategy lives in the case file (⚖️).
      // Per-person you get only what THIS person can actually do for you:
      // ask what they've heard (once), your side (if it matters), press the
      // accuser (only them, once known). demand_moot / flee / speak / alibi
      // are NOT things you say to a specific person — they live in the dossier.
      if (cs.playerRole === 'accused' && (cs.status === 'open' || cs.status === 'dormant') && !cs.trial) {
        if (!(cs.askedHeard || {})[vid] && vid !== cs.accuser) {
          out.push({ id: 'betrayal:askheard:' + cs.id, label: `👂 "What have you heard about the case against me?" (ask ${this.whoTag(vid)})` });
        }
        const theirTrust = ((this.state.village.trust || {})[vid]) || 10;
        if (!(cs.toldSide || {})[vid] && (this.caseInvolved(cs, vid) || theirTrust >= 30)) {
          out.push({ id: 'betrayal:tellside:' + cs.id, label: '"Let me tell you what actually happened." (your side)' });
        }
        if (vid === cs.accuser && (cs.knownAccusers || []).includes(vid) && !cs.pressedAccuser) {
          out.push({ id: 'betrayal:pressaccuser:' + cs.id, label: `🎯 Press ${this.whoTag(cs.accuser)} — find the crack in their story` });
        }
      }
      if (cs.status === 'open' && !(cs.foundBribes || []).length && cs.playerRole !== 'accused') {
        out.push({ id: 'betrayal:investigate:' + cs.id, label: 'Follow the food. Who bought whom? (investigate bribery)' });
      }
      if (cs.status === 'open' && (cs.foundBribes || []).some(b => !cs.exposedBribes.includes(b.voter))) {
        out.push({ id: 'betrayal:expose:' + cs.id, label: '🔥 Expose the bribery. At the moot. Publicly.' });
      }
      if (cs.status === 'open' || cs.status === 'dormant') {
        // the accused player doesn't "call a moot" on themselves — they demand it
        if (!(cs.status === 'open' && cs.trial && cs.trial.awaitingPlayerVote) && cs.playerRole !== 'accused') {
          out.push({ id: 'betrayal:moot:' + cs.id, label: `Call a moot — put the ${cs.charge} of ${tname} to the village` });
        }
      }
      if (cs.status === 'open' && !cs.flipped && cs.playerRole !== 'accused') {
        out.push({ id: 'betrayal:letlie:' + cs.id, label: 'Say nothing. Watch your back. (the game remembers)' });
      }
      // bribe offer from a case party to the player
      if (cs.playerBribeOffer && cs.playerBribeOffer.by === vid) {
        out.push({ id: 'betrayal:hearoffer:' + cs.id, label: `"What do you want?" (they seem... eager)` });
      }
      // player bribes a voter (open case or mid-trial, not while their own vote pends).
      // GATED: only case-involved people (committed voters, witnesses, the
      // accuser's circle — never random villagers), only bribable temperaments,
      // only when the player can afford the price. Most people, most of the
      // time: no offer.
      if ((cs.status === 'open' || cs.status === 'dormant') && !cs.accused.includes(vid) && vid !== this.villagerId &&
          (!cs.trial || cs.trial.awaitingPlayerVote === false) && !(cs.bribes || []).some(b => b.by === this.villagerId && b.voter === vid) &&
          this.caseInvolved(cs, vid) && this.caseBribable(cs, vid) && this.canAffordBribe(cs, vid)) {
        const price = this.caseBribePrice(cs, vid);
        out.push({ id: 'betrayal:bribe:' + cs.id + ':' + vid, label: `Make ${this.whoTag(vid)} an offer (${price} kcal of food). Expensive. Secret. (bribe)` });
      }
      // player's trial vote
      if (cs.trial && cs.trial.awaitingPlayerVote) {
        out.push({ id: 'betrayal:vote_guilty:' + cs.id, label: '⚖️ VOTE: GUILTY' });
        out.push({ id: 'betrayal:vote_acquit:' + cs.id, label: '⚖️ VOTE: NOT GUILTY' });
        break;
      }
    }
    return out;
  },
  betrayalTurn(vid, choiceId) {
    const c = this.convoGet(vid);
    const parts = choiceId.split(':');
    const act = parts[1];
    let line = null, youSaid = null;
    const finish = (l, you, narr) => {
      line = l; youSaid = you || null;
      try {
        if (you) c.transcript.push({ who: 'you', text: you });
        c.transcript.push({ who: narr ? 'narr' : 'them', text: line });
        while (c.transcript.length > 200) c.transcript.shift(); // HISTORY (Steve 2026-10-05): was 8 — destroyed conversation history and desynced the tap-advance. 200 keeps the whole conversation; memory is trivial.
        c.exchanges = (c.exchanges || 0) + 1;
        // AFTERMATH NARRATION (Steve 2026-10-08): the escape beat is not the
        // leader speaking — they tried to kill you; they don't narrate your
        // escape. Narration goes through this.say with a 'narr' transcript
        // tag instead of sayLine on the ambusher.
        if (narr) this.say(line);
        else this.sayLine(vid, line);
      } catch (e) {}
      return { line, choices: this.convoChoices(vid), ended: false, transcript: (c.transcript || []).slice() };
    };
    if (act === 'run' || act === 'talk' || act === 'fight') {
      const plot = (this.betrayalState().plots || []).find(p => p.id === c.ambushPlot);
      if (!plot) return finish(`It's over. Somehow.`, '...');
      const res = this.ambushExchange(plot, act);
      if (res && (res.aftermath || plot.outcome)) {
        try {
          c.thread = null; c.ambushPlot = null;
        } catch (e) {}
        return finish(res.line || `You get out. Breathing hard, alive.`, act === 'run' ? '(run)' : act === 'talk' ? '(talk)' : '(fight)', true);
      }
      return finish(res.line || `The moment stretches.`, act === 'run' ? '(run)' : act === 'talk' ? '(talk)' : '(fight)');
    }
    if (act === 'accept') { const r = this.acceptInvite(vid); return finish((r && r.line) || 'You go.', '"Sure."'); }
    if (act === 'decline') { const l = this.declineInvite(vid); return finish(l, '"Not this time."'); }
    if (act === 'press') {
      const broke = !!this.pressAccomplice(parts[2], parts[3]);
      // OUTCOME-AWARE (Steve 2026-10-06): the box must not claim a crack when
      // the story held. Rotate the held box line like the narration.
      return finish(
        broke ? 'Done — their story has a crack in it now.'
              : this.convoPickCycle(vid, 'pressheldbox', [
                  'Nothing new — their story holds. For now.',
                  'Their story holds. You file that away.',
                  'Same story, second telling. No crack — yet.',
                ]),
        '"Slowly."');
    }
    if (act === 'approach') {
      const ok = this.approachWeakest(parts[2], true);
      return finish(ok ? 'They talked. Everything changes now.' : 'Not yet. The offer stands.', '"Talk first. Leniency."');
    }
    if (act === 'wounds') { this.showWounds(parts[2]); return finish('The wounds speak for themselves.', '"Look at me."'); }
    if (act === 'site') { this.examineAmbushSite(parts[2]); return finish('The ground remembers.', '(examine the site)'); }
    if (act === 'witnesses') { this.nameWitnesses(parts[2]); return finish('Names, named.', '"Who saw us leave?"'); }
    if (act === 'expose') {
      const cs = this.getCase(parts[2]);
      const b = (cs.foundBribes || []).find(x => !cs.exposedBribes.includes(x.voter));
      if (b) this.exposeBribery(parts[2], b.voter);
      return finish('Said. At the moot. Let the fire decide what it means.', '(expose the bribery)');
    }
    if (act === 'moot') {
      this.callMoot(parts[2]);
      return finish('The moot is called. The fire gets built up.', '"We settle this. Tonight."');
    }
    if (act === 'askheard') {
      const r = this.askAboutCase(parts[2], vid);
      return finish((r && r.line) || 'Nothing new.', '"What have you heard?"');
    }
    if (act === 'tellside') {
      const saidIt = this.tellSide(parts[2], vid);
      return finish(saidIt ? 'Said. Now it\'s theirs to carry.' : 'Already said.', '"Let me tell you what happened."');
    }
    if (act === 'pressaccuser') { this.defendPressAccuser(parts[2]); return finish('Your question hangs in the air. Let the pause do the work.', '"Walk me through YOUR story."'); }
    if (act === 'investigate') {
      const f = this.investigateBribery(parts[2]) || [];
      const cs2 = this.getCase(parts[2]);
      if (cs2) {
        cs2.foundBribes = cs2.foundBribes || [];
        for (const b of f) if (!cs2.foundBribes.some(y => y.voter === b.voter)) cs2.foundBribes.push(b);
      }
      return finish(f.length ? 'Found something. Follow it to the moot.' : 'Nothing you can prove — yet. Dig again; the trail is still warm.', '(follow the food)');
    }
    if (act === 'letlie') { this.letItLie(parts[2]); return finish('You say nothing. The silence sits at the fire with everyone else.', '(say nothing)'); }
    if (act === 'vote_guilty') { this.castPlayerVote(parts[2], true); return finish('Counted.', 'GUILTY.'); }
    if (act === 'vote_acquit') { this.castPlayerVote(parts[2], false); return finish('Counted.', 'NOT GUILTY.'); }
    if (act === 'bribe') {
      const cs = this.getCase(parts[2]);
      const price = cs ? this.caseBribePrice(cs, parts[3]) : 1600;
      const ok = this.bribeVoter(parts[2], parts[3], this.villagerId, price);
      let spent = 0;
      if (ok) spent = this.payBribe(cs, parts[3], price);
      // HONESTY (break-it social 2026-10-08): whole-unit pack spends can
      // overshoot the labeled price — the fiction names what actually moved.
      const doneLine = !ok ? 'It didn\'t take.'
        : spent > price ? `Done. Quiet. Expensive — ${spent} kcal changed hands; the pack wouldn't divide.`
        : 'Done. Quiet. Expensive.';
      return finish(doneLine, '(make an offer)');
    }
    if (act === 'hearoffer') {
      const cs = this.getCase(parts[2]);
      const offer = cs && cs.playerBribeOffer;
      if (!offer) return finish('They look away. "Never mind."', '"What do you want?"');
      return finish(`"${offer.amount} in food and goods — if the vote goes our way. Nobody has to know."`, '"I\'m listening."');
    }
    if (act === 'takebribe') {
      const cs = this.getCase(parts[2]);
      const offer = cs && cs.playerBribeOffer;
      if (offer) {
        cs.bribes.push({ voter: this.villagerId, by: offer.by, amount: offer.amount, day: this.state.scholar.day, trace: true });
        cs.playerBribeOffer = null;
        cs.playerBribed = true;
        return finish('Done. Your vote is bought. Secrets like this have a half-life.', '"Deal."');
      }
      return finish('Too late. The moment passed.', '...');
    }
    if (act === 'refusebribe') {
      const cs = this.getCase(parts[2]);
      if (cs) { cs.playerBribeOffer = null; try { this.addDoubt(parts[3] || vid, 'observation', 'Tried to buy a vote. That tells you everything.', [], { eventBacked: true }); } catch (e) {} }
      return finish('"No." The word lands like a door closing.', '"No."');
    }
    return null;
  },
  // NPCs bribe NPC voters too (the world corrupts without you).
  // Against an accused PLAYER, the accuser's side buys votes during the
  // defense window — the player can find and expose it.
  simBriberyTick() {
    for (const cs of (this.betrayalState().cases || [])) {
      if (cs.playerRole === 'accused' && (cs.status === 'open' || cs.status === 'dormant') && !cs.trial) {
        if (R() < 0.3) {
          const voters = this.npcIds().filter(id => !(cs.bribes || []).some(b => b.voter === id));
          const v = pick(voters);
          if (v) cs.bribes.push({ voter: v, by: cs.accuser, amount: 800, day: this.state.scholar.day, trace: R() < 0.5 });
        }
        continue;
      }
      if (cs.status !== 'open' || !cs.trial) continue;
      if (R() < 0.35) {
        const side = pick([cs.accused[0], 'target']);
        const voters = this.npcIds().filter(id => !cs.accused.includes(id) && !(cs.bribes || []).some(b => b.voter === id));
        const v = pick(voters);
        let by = side === 'target' ? cs.target : side;
        // BREAK-IT (social 2026-10-08): the sim used to attribute the bribe
        // to the PLAYER (by = villagerId) whenever the player's side was
        // picked — a phantom bribe the player never paid for and never
        // chose, which investigate/expose then punished them for. Nobody
        // buys votes in your name without your say. An NPC who likes you
        // may act for you; otherwise the moment passes.
        if (v && this.isPlayer(by)) {
          const allies = this.npcIds().filter(id => !cs.accused.includes(id) && id !== v &&
            (() => { try { return this.pairAffinity(id, this.villagerId) > 0; } catch (e) { return false; } })());
          by = allies.length ? allies[Math.floor(R() * allies.length)] : null;
        }
        if (v && by) {
          cs.bribes.push({ voter: v, by, amount: 800, day: this.state.scholar.day, trace: R() < 0.5 });
        }
      }
      // a side may try to buy the PLAYER's vote
      if (cs.trial.awaitingPlayerVote && !cs.playerBribeOffer && !cs.playerBribed && R() < 0.3) {
        const by = pick([cs.accused[0], this.isPlayer(cs.target) ? cs.accused[0] : cs.target]);
        if (!this.isPlayer(by)) {
          cs.playerBribeOffer = { by, amount: 600 + Math.floor(R() * 1200) };
          try { this.journalNote && this.journalNote('village', 'trial', this.whoTag(by) + ' wants a word about your vote.'); } catch (e) {}
        }
      }
    }
  },
  // NPC-NPC cases surface to the player via gossip, days later
  caseDiscoveryTick() {
    const day = this.state.scholar.day;
    for (const cs of (this.betrayalState().cases || [])) {
      if (cs.knownToPlayer || cs.playerRole !== 'bystander') continue;
      if (cs.playerHeardDay && day >= cs.playerHeardDay) {
        cs.knownToPlayer = true;
        cs.playerRole = 'juror';
        this.say(`Word reaches you, days late: ${this.whoTag(cs.accused[0])} stands accused over what happened to ${this.disp(cs.target)}. There's going to be a moot. People are choosing sides.`);
        try { this.journalNote && this.journalNote('village', 'trial', 'Heard about the case against ' + this.displayName(cs.accused[0]) + '.'); } catch (e) {}
      }
    }
  },
  // ---------- 13. THE PLAYER STANDS ACCUSED ----------
  // Symmetric jeopardy (Steve: "obviously a player should have to face the
  // judge. Exile is a real risk."). Player crimes (theft, intimidation,
  // assault, murder — the justice records) become prosecutable cases. NPCs
  // with motive — victims, the righteous, your enemies — formally accuse you.
  // The trial runs the SAME machinery from the other side: attendance RNG,
  // wild days, bribery both directions, relationship-weighted belief.
  // The accusation must be EARNED: heat/evidence/witness thresholds. And
  // false accusations are possible — your enemies can weaponize the moot,
  // and you can expose that.
  strongestMotiveVsPlayer() {
    let best = null;
    for (const vid of this.npcIds()) {
      const m = this.motiveBetween(vid, this.villagerId);
      if (!best || m.score > best.score) best = { id: vid, score: m.score, reasons: m.reasons };
    }
    return best;
  },
  trustInPlayer() {
    const t = (this.state.village.trust || {})[this.villagerId];
    return t == null ? 10 : t;
  },
  chargeLine(charge) {
    return {
      theft: 'Theft — taking what wasn\'t theirs',
      intimidation: 'Threats — putting fear in people on purpose',
      assault: 'Raising hands against one of us',
      murder: 'Murder. There — said plain',
      cannibalism: 'Cannibalism. Eating one of us',
    }[charge] || 'Crimes against the village';
  },
  // Unified pipeline: is the formal track currently holding the player?
  // justice.js freezes its ladder while this is true — one track, no parallel.
  playerCaseOpen() {
    let bs = null;
    try { bs = this.betrayalState(); } catch (e) { return false; }
    return (bs.cases || []).some(c => (c.status === 'open' || c.status === 'dormant') && c.accused.includes(this.villagerId));
  },
  // The justice ladder demanded a moot (refused confrontation, or heat past
  // bearing). Deterministic — no RNG gate: the formal track is the ONLY formal
  // track, and the village already decided. Uses the strongest uncharged crime;
  // the confronter accuses if they're still around.
  forcePlayerAccusation() {
    const bs = this.betrayalState();
    const existing = (bs.cases || []).find(c =>
      (c.status === 'open' || c.status === 'dormant') && c.accused.includes(this.villagerId));
    if (existing) return existing;
    let crimes = [];
    try { crimes = (this.justiceState().crimes || []).filter(c => !c.caseId); } catch (e) {}
    if (!crimes.length) {
      // nothing left unjudged to charge: the formal track is spent. No second
      // moot over judged crimes — but no amnesia either; the cold stays.
      this.say('There\'s nothing left unjudged to charge. No second moot — but the fire stays cold a long while.');
      const j = this.justiceState();
      j.mootDemanded = false; j.confrontRefused = false; j.stage = 1;
      return null;
    }
    const rank = { cannibalism: 5, murder: 4, attack: 3, theft: 2, intimidation: 1 };
    // the formal track charges what it can prove: unwitnessed crimes stay
    // unsolved (detective path), they are not moot ammunition.
    const provable = crimes.filter(c => rank[c.type] && c.witnessed !== false);
    if (!provable.length) {
      // nothing the village can prove: the formal track is spent. No fishing
      // expedition — but no amnesia either; the cold stays.
      this.say('There\'s nothing they can prove. No moot — but the fire stays cold a long while.');
      const j = this.justiceState();
      j.mootDemanded = false; j.confrontRefused = false; j.stage = 1;
      return null;
    }
    const serious = provable.sort((a, b) => (rank[b.type] || 0) - (rank[a.type] || 0))[0];
    let j = {};
    try { j = this.justiceState(); } catch (e) {}
    const accuser = (j.confrontedBy && this.npcIds().includes(j.confrontedBy))
      ? j.confrontedBy
      : (serious && serious.victim && this.npcIds().includes(serious.victim))
        ? serious.victim
        : (this.strongestMotiveVsPlayer() || {}).id;
    if (!accuser) return null;
    const charge = serious
      ? ({ theft: 'theft', intimidation: 'intimidation', attack: 'assault', murder: 'murder', cannibalism: 'cannibalism' }[serious.type])
      : 'theft';
    return this.openPlayerCase(accuser, charge, serious ? [serious] : [], false);
  },
  // daily: does someone accuse the player?
  considerPlayerAccusation() {
    const s = this.state.scholar;
    if (!s || s.exiled) return;
    // backstop: the justice ladder demanded a moot — the formal track is not optional
    try { if (this.justiceState().mootDemanded) return this.forcePlayerAccusation(); } catch (e) {}
    // LADDER PRECEDENCE (Steve 2026-10-06): the justice ladder owns the
    // player's arc — cold shoulder, then confrontation, THEN the moot.
    // While heat sits in the confrontation zone (50+) and the ladder hasn't
    // gone formal, the village confronts instead of convening: the intimate
    // "blocks your path" beat gets its chance before the fire-trial machinery.
    // The ladder hands the case over itself (mootDemanded) on refusal,
    // silence-timeout, or heat that keeps climbing.
    try {
      const j = this.justiceState();
      if (j && !j.mootDemanded && j.stage <= 2 && this.justiceHeat() >= 50) return;
    } catch (e) {}
    const bs = this.betrayalState();
    if ((bs.cases || []).some(c => (c.status === 'open' || c.status === 'dormant') && c.accused.includes(this.villagerId))) return;
    let crimes = [];
    try { crimes = (this.justiceState().crimes || []).filter(c => !c.caseId); } catch (e) {}
    const heat = (() => { try { return this.justiceHeat(); } catch (e) { return 0; } })();
    const rank = { cannibalism: 5, murder: 4, attack: 3, theft: 2, intimidation: 1 };
    const serious = crimes.filter(c => rank[c.type]).sort((a, b) => (rank[b.type] || 0) - (rank[a.type] || 0))[0];
    let accuser = null, charge = null, used = [], fabricated = false;
    if (serious) {
      const t = rank[serious.type];
      const victim = serious.victim;
      const victimAlive = victim && this.npcIds().includes(victim);
      let wit = 0;
      try { wit = (this.witnesses(6) || []).length; } catch (e) {}
      // the threshold: moots aren't convened over nothing
      const sameVictim = crimes.filter(c => c.type === serious.type && c.victim === victim).length;
      const prosecutable = t >= 3
        ? (wit > 0 || victimAlive || heat >= 40)
        : (serious.caught || heat >= 45 || sameVictim >= 2);
      if (prosecutable && R() < 0.5) {
        const m = this.strongestMotiveVsPlayer();
        accuser = victimAlive ? victim : (m && m.id);
        charge = { theft: 'theft', intimidation: 'intimidation', attack: 'assault', murder: 'murder' }[serious.type];
        used = [serious];
      }
    }
    if (!accuser) {
      // false accusation: an enemy weaponizes the moot (only when there's
      // no real ammunition — enemies prefer real crimes)
      const m = this.strongestMotiveVsPlayer();
      if (m && m.score >= 60 && this.trustInPlayer() < 25 && R() < 0.25) {
        accuser = m.id; fabricated = true;
        charge = pick(['theft', 'assault']);
      }
    }
    if (!accuser) return;
    this.openPlayerCase(accuser, charge, used, fabricated);
  },
  openPlayerCase(accuser, charge, crimes, fabricated) {
    const bs = this.betrayalState();
    const id = 'case_' + (++bs.seq);
    const victim = (crimes && crimes[0] && crimes[0].victim) || null;
    const c = {
      id, plotId: null, charge, day: this.state.scholar.day,
      accused: [this.villagerId], target: victim, accuser,
      belief: {}, evidence: [], bribes: [], exposedBribes: [], foundBribes: [],
      inconsistencies: [], status: 'open', flipped: null,
      playerRole: 'accused', knownToPlayer: true,
      fabricated: !!fabricated, crimeKeys: (crimes || []).map(x => x.key),
      mootIn: 2 + Math.floor(R() * 2),
      defenseSpeeches: 0, alibiDone: false, pressedAccuser: false,
      // what the player KNOWS (moot redesign): the accusation is public, so
      // the accuser is known from the start; evidence starts with their story.
      knownAccusers: [accuser], playerEvidence: [], askedHeard: {},
      playerKnownWitnesses: [], toldSide: {},
      witnessIds: [],
    };
    try { c.witnessIds = (this.witnesses && this.witnesses(6)) || []; } catch (e) {}
    for (const cr of (crimes || [])) cr.caseId = id;
    bs.cases.push(c);
    this.initPlayerCaseBelief(c);
    this.seedAccuserStory(c);
    c.playerEvidence.push({ day: c.day, text: c.accuserStory || 'The accusation, stated in public.' });
    const aname = this.whoTag(accuser);
    if (this.state.systemArrived) {
      // post-System: the accusation is CONTENT. sysSay + a case-file sheet offer.
      this.sysSay(`🔴 LIVE BREAKING NEWS! A MOOT has been CALLED! ${aname.toUpperCase()} points at YOU — ${this.chargeLine(charge).toUpperCase()}! The gamblers are SCRAMBLING! Your CASE FILE is ready — check it before the fire decides your fate!`);
      this.say(`${this.capFirst(aname)} stands up at the fire, pointing. "This one. ${this.chargeLine(charge)} — and we all know it." Heads turn. ${c.mootIn} days until the moot. Use them.`);
      try { this.state.scholar.caseDossierOffer = c.id; } catch (e) {}
    } else {
      // pre-System: diegetic. Tightened say + journal note; the case file
      // waits in the self bar (⚖️ Case file).
      this.say(`${this.capFirst(aname)} stands up at the fire, pointing. "This one. ${this.chargeLine(charge)} — and we all know it." Heads turn. There's going to be a moot — ${c.mootIn} days. Use them.`);
    }
    try { this.journalNote && this.journalNote('village', 'trial', `Accused of ${charge} by ${this.displayName(accuser)}. Moot in ${c.mootIn} days.`); } catch (e) {}
    return c;
  },
  // belief polarity: negative = guilty (of the accused), positive = acquit.
  // The accuser's story landed first — the village starts suspicious.
  initPlayerCaseBelief(c) {
    const tp = this.trustInPlayer();
    for (const vid of this.npcIds()) {
      let b = -20;
      b += (tp - 25) * 0.8;                              // they trust you → doubt it
      b -= this.pairAffinity(vid, c.accuser) * 0.5;      // they like the accuser → believe it
      b += this.pairAffinity(vid, this.villagerId) * 0.4; // personal bond with you
      c.belief[vid] = clamp(Math.round(b), -100, 100);
    }
  },
  seedAccuserStory(c) {
    const aname = this.whoTag(c.accuser);
    const vname = (c.target && !this.isPlayer(c.target)) ? this.whoTag(c.target) : 'the village';
    const lines = {
      theft: `stole from ${vname} — took what wasn't theirs`,
      intimidation: `threatened ${vname} — put fear in them, deliberately`,
      assault: `attacked ${vname} — blood was drawn`,
      murder: `killed ${vname}. There it is. Said out loud.`,
    };
    c.accuserStory = `${aname} says you ${lines[c.charge] || 'wronged the village'}.`;
    try {
      // BREAK-IT (social r7 2026-10-09): an accusation is WORDS — rep only,
      // never trust (r6 canon). The old seed drifted every listener's trust
      // -4/hop as it spread, and the seed-time applyRep wrote the immediate
      // rep hit to the player's DEAD self-record (r4: repOf(player) is never
      // read) while drifting the trustInPlayer aggregate -5. The author's
      // intent was an immediate public rep hit — now it lands where intended:
      // every villager's live view of the player, trust-silent. The gossip
      // still travels from the accuser, rep-only.
      this.seedGossip('accuse_' + c.id, { trustworthy: -12, honest: -4 }, [c.accuser], true);
      const roster = (this.state.village.roster || []).filter(id => id !== this.villagerId);
      for (const rid of roster) this.applyRep(rid, { trustworthy: -10 }, 0.8, true);
    } catch (e) {}
    if (c.fabricated) {
      // the lie has seams — planted inconsistencies the player can find
      c.inconsistencies = [
        { field: 'time', claims: { [c.accuser]: 'dusk', witness: 'full dark' }, found: false },
        { field: 'place', claims: { [c.accuser]: 'the creek', witness: 'near the ridge' }, found: false },
      ];
    } else {
      c.inconsistencies = [];
    }
  },
  // ----- player defense tools -----
  // evidence the PLAYER knows: separate from the village belief ledger.
  // The dossier shows only this — never the unknown.
  notePlayerEvidence(c, text) {
    if (!c || !text) return;
    c.playerEvidence = c.playerEvidence || [];
    c.playerEvidence.push({ day: this.state.scholar.day, text });
  },
  // (a) speak in your defense: social stats + relationships matter
  defendSpeak(caseId) {
    const c = this.getCase(caseId); if (!c || c.playerRole !== 'accused') return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    c.defenseSpeeches = (c.defenseSpeeches || 0) + 1;
    const dim = 1 / c.defenseSpeeches; // diminishing returns
    let sp = 10;
    try { if (this.hasAbility('social_read')) sp += 6; } catch (e) {}
    const delta = Math.max(2, Math.round((sp + this.trustInPlayer() * 0.3) * dim));
    // the room's reaction rotates — never the same beat twice in a row.
    // The "nod" tails only fire when the defense is actually landing.
    c.speakTails = c.speakTails || { nod: 0, flat: 0 };
    const bucket = delta > 8 ? 'nod' : 'flat';
    const tails = bucket === 'nod'
      ? ['Some heads nod before they catch themselves.',
         'A murmur moves around the fire — not agreement, but listening.',
         'Someone in the back says "huh" under their breath. It carries.']
      : ['The fire listens. Whether it believes is another matter.',
         'A few faces soften. A few harden.',
         'Nobody interrupts. In this village, that counts as respect.',
         'Your voice holds. That surprises you more than anyone.'];
    const tail = tails[c.speakTails[bucket]++ % tails.length];
    this.say(`You stand and speak. No performance — the truth as you lived it, and the names of people who know you. ${tail}`);
    this.moveBelief(c, delta, 'the accused spoke in their defense');
    this.notePlayerEvidence(c, 'You spoke in your defense at the fire.');
    try { this.tickAction(24); } catch (e) {}
    return true;
  },
  // (b) alibi / character witnesses: who will vouch for you?
  defendAlibi(caseId) {
    const c = this.getCase(caseId); if (!c || c.alibiDone || c.playerRole !== 'accused') return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    c.alibiDone = true;
    const t = this.state.village.trust || {};
    const friends = this.npcIds().filter(id => (t[id] || 0) >= 25).slice(0, 2);
    if (!friends.length) {
      this.say(`You look around the fire for someone to vouch for you. Nobody meets your eyes. That silence is its own testimony.`);
      this.moveBelief(c, -4, 'no one would vouch');
      return false;
    }
    const names = friends.map(f => this.whoTag(f)).join(' and ');
    this.say(`${this.capFirst(names)} ${friends.length > 1 ? 'stand' : 'stands'} with you. "I know this one. Whatever happened, hear them out." It matters who your friends are.`);
    this.moveBelief(c, 8 + friends.length * 5, 'character witnesses vouched');
    this.notePlayerEvidence(c, `${friends.map(f => this.displayName(f)).join(' and ')} vouched for you.`);
    try { this.tickAction(24); } catch (e) {}
    return true;
  },
  // (c) turn it around: press the accuser. Lies have seams; truth doesn't.
  defendPressAccuser(caseId) {
    const c = this.getCase(caseId); if (!c || c.pressedAccuser || c.playerRole !== 'accused') return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    c.pressedAccuser = true;
    const aname = this.whoTag(c.accuser);
    if (c.fabricated) {
      const inc = (c.inconsistencies || []).find(i => !i.found);
      if (inc) {
        inc.found = true;
        c.accuserExposed = true;
        const said = inc.field === 'time' ? 'dusk' : 'the creek';
        const seen = inc.field === 'time' ? 'full dark' : 'near the ridge';
        this.say(`You press ${aname} — not angry, precise. "You said ${said}. But it was ${seen} — people saw." The pause before the answer is the answer.`);
        try { this.addDoubt(c.accuser, 'contradiction', `${aname}'s accusation doesn't match what others saw.`, [], { caseId: c.id }); } catch (e) {}
        this.moveBelief(c, 20, 'accuser caught in a lie');
        this.notePlayerEvidence(c, `Caught ${this.displayName(c.accuser)} in a lie about the ${inc.field}.`);
        const t = this.state.village.trust || {};
        t[c.accuser] = Math.max(0, ((t[c.accuser]) || 10) - 20);
        return true;
      }
    }
    this.say(`You press ${aname}. Their story holds — every detail, steady as stone. You look desperate for having tried.`);
    this.moveBelief(c, -5, 'pressing a truthful accuser backfired');
    return false;
  },
  // (d) demand the moot early: bold, dangerous
  demandMoot(caseId) {
    const c = this.getCase(caseId); if (!c || c.playerRole !== 'accused') return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    // same class as the callMoot re-convene guard (social r11): a trial
    // already in session must not be re-run (the dossier gates this, the
    // engine must not stack a second trial underneath).
    if (c.trial) return null;
    this.say(`You stand before they finish gathering voices. "No more whispering. We settle this NOW — all of it, in the open." Bold. Dangerous. The fire gets built up.`);
    try { this.tickAction(24); } catch (e) {}
    return this.conductTrial(c);
  },
  // (e) flee before the verdict: exile by flight
  fleeBeforeVerdict(caseId) {
    const c = this.getCase(caseId); if (!c || c.playerRole !== 'accused') return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    c.status = 'resolved'; c.resolution = 'fled';
    this.say(`You don't wait for the count. Pack, dark, tree line — gone before the fire is even built. They'll call it guilt. Let them. You're alive, and the world is big.`);
    try { this.seedGossip('fled_' + c.id, { trustworthy: -20 }, this.npcIds().slice(0, 3)); } catch (e) {}
    this.exilePlayer('fled');
    // unified pipeline: the formal track is done — re-sync the justice ladder
    try { if (typeof this.syncJusticeAfterMoot === 'function') this.syncJusticeAfterMoot('fled'); } catch (e) {}
    return true;
  },
  // ---------- 13b. MOOT REDESIGN: gating, investigation, dossier ----------
  // Steve: defense options must be gated by person, situation, knowledge.
  // You don't litigate with random villagers — strategy lives in the case
  // file. Per-person you get only what this person can actually do for you.
  caseWitnesses(cs) {
    const out = [];
    try {
      const plot = (this.betrayalState().plots || []).find(p => p.id === cs.plotId);
      if (plot && plot.witnesses) out.push(...plot.witnesses);
    } catch (e) {}
    if (cs.witnessIds) out.push(...cs.witnessIds);
    return [...new Set(out)];
  },
  // is this person case-involved? A voter with committed views, a witness,
  // or in the accuser's circle. Random villagers (Nadia) are not.
  caseInvolved(cs, vid) {
    if (!vid || this.isPlayer(vid)) return false;
    const side = (cs && cs.accuser) || (cs && cs.accused && cs.accused[0]);
    if (side && vid === side) return true;
    if (this.caseWitnesses(cs).includes(vid)) return true;
    try { if (side && this.pairAffinity(vid, side) >= 20) return true; } catch (e) {}
    // the accuser's circle: shares a group (friends, kin, crew) with a side
    try {
      const v = this.state.village;
      for (const gr of (v.groups || [])) {
        const m = gr.members || [];
        if (m.includes(vid) && m.includes(side)) return true;
      }
    } catch (e) {}
    const b = (cs.belief || {})[vid] || 0;
    if (Math.abs(b) >= 40) return true; // a committed voter
    return false;
  },
  // the player's open/dormant accused case (drives the ⚖️ Case file button)
  playerAccusedCase() {
    return (this.betrayalState().cases || []).find(c =>
      c.playerRole === 'accused' && (c.status === 'open' || c.status === 'dormant'));
  },
  // ----- (3) INVESTIGATION: ask what they've heard (once per person per case)
  // Reveals ONE thing the person would actually know, records it on the case,
  // and silently unlocks the matching targeted option. Never enumerates the
  // unknown: options appear when knowledge justifies them, silently.
  askAboutCase(caseId, vid) {
    const c = this.getCase(caseId); if (!c) return null;
    c.askedHeard = c.askedHeard || {};
    if (c.askedHeard[vid]) return null;
    c.askedHeard[vid] = true;
    const name = this.whoTag(vid);
    const reveal = (text, kind) => {
      this.say(text);
      return { line: text, reveal: kind };
    };
    // 1. the accuser's name — if it's somehow hidden from the player
    if (c.accuser && !(c.knownAccusers || []).includes(c.accuser) && this.caseInvolved(c, vid)) {
      c.knownAccusers = [...(c.knownAccusers || []), c.accuser];
      this.notePlayerEvidence(c, `The accuser is ${this.displayName(c.accuser)} — named by ${this.displayName(vid)}.`);
      return reveal(`${name} lowers their voice. "It was ${this.whoTag(c.accuser)} who stood up. Everyone saw — you'd have heard it yourself if you'd been listening."`, 'accuser');
    }
    // 2. a witness name
    const newWits = this.caseWitnesses(c).filter(w => !(c.playerKnownWitnesses || []).includes(w));
    if (newWits.length && (this.caseInvolved(c, vid) || R() < 0.4)) {
      const w = pick(newWits);
      c.playerKnownWitnesses = [...(c.playerKnownWitnesses || []), w];
      this.notePlayerEvidence(c, `${this.displayName(w)} may have seen something (per ${this.displayName(vid)}).`);
      return reveal(`${name} glances around. "${this.whoTag(w)} was close enough to see. Whether they'll SAY so at the fire is another matter."`, 'witness');
    }
    // 3. a rumor of bribery — only if votes are actually being bought
    if (!c.briberyRumored && (c.bribes || []).length && (this.caseInvolved(c, vid) || R() < 0.35)) {
      c.briberyRumored = true;
      this.notePlayerEvidence(c, `Rumor: votes are being bought before the moot (heard from ${this.displayName(vid)}).`);
      return reveal(`${name} won't quite look at you. "Food's been moving. Quietly. Somebody's buying goodwill before the moot." They don't name names — but now you know to follow the food.`, 'bribery');
    }
    // 4. an inconsistency hint — if the story has seams someone might have felt
    const unfound = (c.inconsistencies || []).filter(i => !i.found);
    if (!c.contradictionHinted && unfound.length && (this.caseInvolved(c, vid) || R() < 0.3)) {
      c.contradictionHinted = true;
      const inc = unfound[0];
      this.notePlayerEvidence(c, `A seam in the story — the ${inc.field} didn't sit right (${this.displayName(vid)}).`);
      return reveal(`${name} frowns. "Something about the ${inc.field} didn't sit right. Press ${this.whoTag(c.accuser)} on it — and watch their face."`, 'contradiction');
    }
    // 5. nothing useful — never a dead end the UI could enumerate.
    // A DEEP pool with per-case rotation: the case shuffles the shrugs once
    // and hands each asker the next one, so six gossip-mongers never parrot
    // the same line at you. Random-per-villager would still collide (birthday
    // problem); rotation can't. Cycles only after all 8 are used.
    const nothingPool = [
      `${name} shrugs. "I hear the fire crackle and people talking. That's all I know, and I know it well."`,
      `"Honestly?" ${name} says. "I try not to listen. Safer that way."`,
      `${name} shakes their head. "Nobody tells me anything. Maybe ask someone closer to it."`,
      `${name} spreads their hands. "Ask me about the ridge path, ask me about fishing the creek. The moot? I keep my head down."`,
      `"I wasn't at that fire," ${name} says. "Whatever was said got said without me in it."`,
      `${name} looks at the ground. "People remember wrong on purpose sometimes. I try to remember nothing at all."`,
      `"Moot talk," ${name} says — and the way they say it closes the subject like a door.`,
      `${name} laughs, short. "You want the truth? I was asleep. Best alibi I own."`,
    ];
    if (!c.nothingOrder) {
      c.nothingOrder = nothingPool.map((_, i) => i);
      for (let i = c.nothingOrder.length - 1; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        [c.nothingOrder[i], c.nothingOrder[j]] = [c.nothingOrder[j], c.nothingOrder[i]];
      }
    }
    c.nothingIdx = c.nothingIdx || 0;
    return reveal(nothingPool[c.nothingOrder[c.nothingIdx++ % nothingPool.length]], null);
  },
  // ----- tell them your side: per-person, only when it matters -----
  tellSide(caseId, vid) {
    const c = this.getCase(caseId); if (!c || c.playerRole !== 'accused') return null;
    if (c.status !== 'open' && c.status !== 'dormant') return null;
    c.toldSide = c.toldSide || {};
    if (c.toldSide[vid]) {
      this.say(`You've already told ${this.whoTag(vid)} your side. Repeating it would sound like panic.`);
      return null;
    }
    c.toldSide[vid] = true;
    // BREAK-IT (social r2 2026-10-08): telling your side is words ("no
    // performance, just the sequence") — the old direct +6 bypassed the 40
    // talk cap and progressive scaling entirely (measured 38->44). Through
    // the resolver like every other word; the belief shift stays direct.
    if (typeof this.resolveConsequence === 'function') {
      this.resolveConsequence(vid, { trust: 6, temper: 'honest-hard', name: 'tellSide' });
    } else {
      const t = this.state.village.trust || {};
      t[vid] = Math.min(100, ((t[vid]) || 10) + 6);
    }
    c.belief[vid] = clamp(((c.belief[vid]) || 0) + 10, -100, 100);
    this.say(`You tell ${this.whoTag(vid)} what actually happened — no performance, just the sequence. They listen. Whether it lands is in the pause after.`);
    this.notePlayerEvidence(c, `Told ${this.displayName(vid)} your side.`);
    return true;
  },
  // ----- (2) THE CASE DOSSIER -----
  // What the player is defending against. Post-System it's a System overlay
  // sheet in the unhinged alien voice — the aliens LOVE trials (there's a
  // spin-off literally called "The Moot"). Pre-System it's diegetic: plain
  // journal styling, same content, no alien voice.
  caseDossierHtml(cs) {
    const c = typeof cs === 'string' ? this.getCase(cs) : cs;
    if (!c) return '<p>No case file.</p>';
    const post = !!this.state.systemArrived;
    const day = this.state.scholar.day;
    const esc2 = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = [];
    // the CHARGE
    rows.push(`<div style="margin-bottom:10px"><div style="opacity:.6;font-size:12px">CHARGE</div><b>${esc2(this.chargeLine(c.charge))}</b></div>`);
    // the accuser(s) the player KNOWS about — never the unknown
    const accs = (c.knownAccusers || []).filter(Boolean);
    rows.push(`<div style="margin-bottom:10px"><div style="opacity:.6;font-size:12px">ACCUSER${accs.length > 1 ? 'S' : ''}</div>${accs.length ? accs.map(a => esc2(this.whoTag(a))).join(', ') : '—'}</div>`);
    // the EVIDENCE the player knows
    const ev = c.playerEvidence || [];
    rows.push(`<div style="margin-bottom:10px"><div style="opacity:.6;font-size:12px">WHAT YOU KNOW</div>${ev.length ? '<ul style="margin:4px 0;padding-left:18px">' + ev.map(e => `<li>${esc2(e.text)}</li>`).join('') + '</ul>' : '—'}</div>`);
    // inconsistencies FOUND (never unfound ones)
    const foundInc = (c.inconsistencies || []).filter(i => i.found);
    if (foundInc.length) {
      rows.push(`<div style="margin-bottom:10px"><div style="opacity:.6;font-size:12px">CRACKS IN THEIR STORY</div><ul style="margin:4px 0;padding-left:18px">${foundInc.map(i => `<li>${esc2(this.inconsistencyLine(c, i))}</li>`).join('')}</ul></div>`);
    }
    // bribery: exposed, and suspected-but-unproven
    const exposed = c.exposedBribes || [];
    const suspected = (c.foundBribes || []).filter(b => !exposed.includes(b.voter));
    if (exposed.length || suspected.length || c.briberyRumored) {
      let bhtml = '';
      for (const v of exposed) {
        const b = (c.bribes || []).find(x => x.voter === v);
        bhtml += `<li>Exposed: ${esc2(this.whoTag(b ? b.by : '?'))} bought ${esc2(this.whoTag(v))}.</li>`;
      }
      for (const b of suspected) bhtml += `<li>Suspected: food moving toward ${esc2(this.whoTag(b.voter))} — unproven.</li>`;
      if (c.briberyRumored && !exposed.length && !suspected.length) bhtml += '<li>Rumor: votes are being bought. Follow the food.</li>';
      rows.push(`<div style="margin-bottom:10px"><div style="opacity:.6;font-size:12px">BRIBERY</div><ul style="margin:4px 0;padding-left:18px">${bhtml}</ul></div>`);
    }
    // moot standing
    let standing;
    if (c.trial) standing = 'The moot is IN SESSION. The count decides now.';
    else {
      const left = Math.max(0, (c.mootIn || 2) - (day - (c.day || day)));
      standing = left > 0 ? `${left} day${left === 1 ? '' : 's'} until the moot is called. Use them.` : 'The moot could be called at any moment.';
    }
    rows.push(`<div style="margin-bottom:4px"><div style="opacity:.6;font-size:12px">MOOT</div>${esc2(standing)}</div>`);
    const head = post
      ? `<p>📺 <i>"TONIGHT'S EPISODE: YOUR TRIAL! The galaxy is TUNED IN! The gamblers have odds and the odds are DELICIOUS! Know your case, little contestant — the fire does NOT do encores!"</i></p>`
      : '';
    return head + rows.join('');
  },
  inconsistencyLine(c, inc) {
    const claims = Object.entries(inc.claims || {}).map(([k, v]) => `${this.whoTag(k)} said "${v}"`).join('; ');
    const selfBit = inc.selfContra ? ` — but the first telling was "${inc.altClaim}"` : '';
    return `The ${inc.field}: ${claims}${selfBit}. Somebody's lying.`;
  },
  // the dossier's strategic actions: speak, witnesses, press, investigate,
  // expose, force the moot, flee. Each appears only while it's still live.
  caseDossierActions(cs) {
    const c = typeof cs === 'string' ? this.getCase(cs) : cs;
    const acts = [];
    if (!c || c.playerRole !== 'accused') return acts;
    if (c.status !== 'open' && c.status !== 'dormant') return acts;
    if (c.trial) return acts; // in session — no more moves
    acts.push({ id: 'speak', label: '🗣️ Speak in your defense', hint: 'Address the village. Diminishing returns.' });
    if (!c.alibiDone) acts.push({ id: 'alibi', label: '🤝 Call character witnesses', hint: 'Who will vouch for you?' });
    if (!c.pressedAccuser && (c.knownAccusers || []).includes(c.accuser)) {
      acts.push({
        id: 'pressaccuser',
        label: c.contradictionHinted ? '🎯 Press the accuser about the contradiction' : '🎯 Press the accuser',
        hint: 'Find the crack in their story.',
      });
    }
    if (c.briberyRumored || (c.foundBribes || []).length) {
      acts.push({ id: 'investigate', label: '🍖 Follow the food (investigate bribery)', hint: 'Who bought whom?' });
    }
    const unexposed = (c.foundBribes || []).find(b => !(c.exposedBribes || []).includes(b.voter));
    if (unexposed) acts.push({ id: 'expose', label: '🔥 Expose the bribery', hint: 'At the moot. Publicly.' });
    acts.push({ id: 'demandmoot', label: '⚖️ Force the moot NOW', hint: 'Bold. Dangerous. Tonight.' });
    acts.push({ id: 'flee', label: '🏃 Flee (exile by flight)', hint: "Don't wait for the count." });
    return acts;
  },
  // dossier action dispatcher (wired by the app sheet buttons)
  caseDossierDo(caseId, actionId) {
    const c = this.getCase(caseId); if (!c) return null;
    if (actionId === 'speak') return this.defendSpeak(caseId);
    if (actionId === 'alibi') return this.defendAlibi(caseId);
    if (actionId === 'pressaccuser') return this.defendPressAccuser(caseId);
    if (actionId === 'investigate') {
      const f = this.investigateBribery(caseId) || [];
      c.foundBribes = c.foundBribes || [];
      for (const b of f) if (!c.foundBribes.some(y => y.voter === b.voter)) c.foundBribes.push(b);
      return f;
    }
    if (actionId === 'expose') {
      const b = (c.foundBribes || []).find(x => !(c.exposedBribes || []).includes(x.voter));
      if (b) return this.exposeBribery(caseId, b.voter);
      return null;
    }
    if (actionId === 'demandmoot') return this.demandMoot(caseId);
    if (actionId === 'flee') return this.fleeBeforeVerdict(caseId);
    return null;
  },
  // the accuser's clock: they call the moot when they've gathered voices
  playerCaseTick() {
    const bs = this.betrayalState();
    const day = this.state.scholar.day;
    for (const c of (bs.cases || [])) {
      if (c.playerRole !== 'accused' || c.status !== 'open') continue;
      // BREAK-IT (social r11 2026-10-10): once the trial is in session (vote
      // pending), the daily clock must not re-convene the moot — callMoot is
      // idempotent now, and this guard keeps the intent explicit.
      if (c.trial) continue;
      if (day - c.day >= (c.mootIn || 2)) {
        const aname = this.whoTag(c.accuser);
        this.say(`${this.capFirst(aname)} has gathered enough voices. This is it — tonight, at the fire.`);
        this.callMoot(c.id, c.accuser);
      }
    }
    try { this.considerPlayerAccusation(); } catch (e) {}
  },
  // TRIAL VOTE BACKSTOP (break-it social r11 2026-10-10): the player's trial
  // vote is cast through conversation choices — if the player never talks to
  // anyone (away, exiled, or just ignoring the fire), the case sat at
  // awaitingPlayerVote FOREVER: the verdict never landed and the justice
  // ladder stayed frozen behind playerCaseOpen. Two days of silence and the
  // village takes the count without them — same honesty as the exiled-vote
  // line, same 2-day convention as the confrontation silence-timeout. The
  // player can still cast the vote any time before this fires.
  trialVoteTick() {
    const day = this.state.scholar.day;
    for (const c of (this.betrayalState().cases || [])) {
      if ((c.status !== 'open' && c.status !== 'dormant') || !c.trial || !c.trial.awaitingPlayerVote) continue;
      if (day - (c.trial.day || day) < 2) continue;
      c.trial.awaitingPlayerVote = false;
      c.trial.playerVoter = false; // no vote was cast: leave the denominator too, and skip the "your vote lands" copy in finishTrial
      this.say(`The moot doesn't wait forever. Two days of silence from the fire's edge — the count is taken without you.`);
      this.finishTrial(c, 0);
    }
  },
  betrayalDailyFull() {
    this.betrayalDaily();
    try { this.simBriberyTick(); } catch (e) {}
    try { this.caseDiscoveryTick(); } catch (e) {}
    try { this.playerCaseTick(); } catch (e) {}
    try { this.trialVoteTick(); } catch (e) {}
    try { this.driftTick(); } catch (e) {}
    try { this.probationTick(); } catch (e) {}
  },
};

  Object.assign(Game, methods);

// ============ WRAPS (chain-safe: capture the current fn) ============
(function attach() {
  const _convoChoices = Game.convoChoices;
  Game.convoChoices = function (vid) {
    const base = _convoChoices ? _convoChoices.call(this, vid) : [];
    try {
      const extra = this.betrayalChoices(vid);
      if (extra && extra.length) return [...extra, ...base];
    } catch (e) {}
    return base;
  };
  const _convoTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    try {
      if (typeof choiceId === 'string' && (choiceId.indexOf('betrayal:') === 0 ||
          (this.convoGet(vid).thread === 'ambush' && ['betrayal:run','betrayal:talk','betrayal:fight'].includes(choiceId)))) {
        // SUBSTANCE (socialite r8 2026-10-09): this early return never
        // reaches convo-dialogue.js's choke-point wrapper. A betrayal
        // confrontation is substantive engagement — mark it here.
        try { this.convoMarkSubstantive(vid, choiceId); } catch (e) {}
        // UNSPOOKEN BEATS (socialite 2026-10-10): this early return also
        // skips the base turn handler's held-beat filter — run the shared
        // choke point or queued beats never die here either.
        try { if (typeof this.convoDropUnspoken === 'function') this.convoDropUnspoken(vid, choiceId); } catch (e) {}
        return this.betrayalTurn(vid, choiceId);
      }
    } catch (e) {}
    return _convoTurn.call(this, vid, choiceId);
  };
  const _villageAction = Game.villageAction;
  Game.villageAction = function (kind) {
    if (kind === 'moot') {
      const cases = (this.betrayalState().cases || []).filter(c => c.status === 'open' || c.status === 'dormant');
      if (!cases.length) return 'No open cases. The village is, for now, at peace with itself.';
      return cases.map(c => `${this.displayName(c.accused[0])} — accused over ${this.disp(c.target)} (${c.charge}). Talk to people, gather evidence, then call the moot from conversation.`).join('\n');
    }
    return _villageAction.call(this, kind);
  };
  const _endDay = Game.endDay;
  Game.endDay = function () {
    try { this.betrayalDailyFull(); } catch (e) {}
    return _endDay.call(this);
  };
  const _genVillages = Game.genVillages;
  if (_genVillages) {
    Game.genVillages = function () {
      const r = _genVillages.call(this);
      try { this.ensureReachableVillage(); } catch (e) {}
      // capacity: beds and bowls are finite. Most villages have room for
      // one more mouth; some for two; none are infinite.
      try {
        for (const v of (this.state.otherVillages || [])) {
          if (v.capacity == null) v.capacity = (v.population || 8) + 1 + (Math.random() < 0.5 ? 1 : 0);
        }
      } catch (e) {}
      return r;
    };
  }
  // villageMeal wrap: outsiders eat last. On probation — or with trust below
  // 15 at a joined village — you get half shares at their fire. (The home
  // village's trust-scaled shares live in the base implementation.)
  const _villageMeal = Game.villageMeal;
  Game.villageMeal = function () {
    try {
      const s = (this.state && this.state.scholar) || {};
      const jvId = s.joinedVillage;
      if (jvId) {
        const ov = (this.state.otherVillages || []).find(x => x.id === jvId);
        const atJv = ov && this.map &&
          (Math.abs((ov.x || 0) - this.map.px) + Math.abs((ov.y || 0) - this.map.py) <= 1);
        const onProb = !!(s.probation && s.probation.villageId === jvId);
        if (ov && atJv && (onProb || (ov.trust || 0) < 15)) {
          const meal = Math.min(1000, Math.round(ov.pantryKcal || 0));
          ov.pantryKcal = Math.max(0, (ov.pantryKcal || 0) - meal);
          // BANK CAP (break-it food r3 2026-10-08): kcalCap() is the one number.
          s.kcal = Math.min((s.kcal || 0) + meal, this.kcalCap ? this.kcalCap() : 3000);
          this.say(`Village meal at ${ov.name}: +${meal} kcal. ` +
            (onProb ? `Probation portions — half shares until they vote you in (${Math.max(0, s.probation.daysLeft)} days left).`
                    : `New mouths eat last — earn their trust for full shares. (Trust ${Math.round(ov.trust || 0)}/15.)`));
          return;
        }
      }
    } catch (e) {}
    return _villageMeal ? _villageMeal.call(this) : null;
  };
})();
})();
