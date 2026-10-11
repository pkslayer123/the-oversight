// @ontology
// system: safety-nets
// description: Earned early-game survival safety nets — three played systems, not flat relief. (1) System aid quests (days 7-21): the System offers struggling villages played quests (fetch / treat / learn) with real costs and real failure; help is sometimes bizarrely wrong (canon: alien, out of touch). (2) Crisis relief: when a crisis (sickness cascade, raid aftermath, storm aftermath, hunger winter) hits, a villager-driven relief path opens — triage tents, rationing votes, emergency hunts — each with honest costs, finite per crisis. (3) Neighbor-village aid flows: struggling villages can REQUEST aid (food/medicine/hands) and richer neighbors can OFFER it; real deliveries, trust/reputation both ways, ingratitude remembered. Anti-farm: trigger-gated + cooldowns + finite neighbor pantries + bounded quest count.
// provides:
//   - safetyNetsDayTick()
//   - safetyNetsPartTick()
//   - aidQuestStruggle()
//   - offerAidQuest()
//   - answerAidQuest(how)
//   - handInAidQuest()
//   - abandonAidQuest()
//   - aidQuestCheckTreat()
//   - aidQuestCheckLearn()
//   - raiseRelief(kind, ctx)
//   - answerRelief(opt)
//   - resolveRelief(why)
//   - aidLedger(villageId)
//   - aidRequestable(linkId)
//   - requestAid(villageId, kind)
//   - resolveAidOut(req)
//   - resolveAidInbound(del)
//   - answerAidOffer(how)
//   - answerAidBeg(how)
//   - aidKnownTick()
// rules:
//   - quests_triggered_not_scheduled: aid quests fire only when the village is genuinely struggling (hunger/death/sickness signals), never on a calendar; max 3 per run, 4-day cooldown, days 7-21 only, systemArrived only (code: aidQuestStruggle, offerAidQuest)
//   - quests_played_not_granted: every quest has a real cost (items leave the pack, the sick must actually recover, knowledge must actually grow) and real failure (deadline passes: the System notices, integration -2) (code: handInAidQuest, aidQuestCheckTreat, aidQuestCheckLearn, safetyNetsDayTick)
//   - wrong_help_canon: 1 in 4 quests is bizarrely wrong in method (rocks, hugs, shouting plant names) while the reward stays real — the System misunderstands, it doesn't shortchange (code: offerAidQuest)
//   - relief_villager_driven: relief beats are proposed by named villagers, never the System — pre-day-7 relief is identical, because the System never speaks here (code: raiseRelief)
//   - relief_honest_finite: every relief option names its cost and spends it; each option fires once per relief; the relief expires (code: answerRelief, safetyNetsPartTick)
//   - aid_real_deliveries: requested/granted aid moves real kcal between real pantries (theirs abstract, ours physical); neighbors can run dry and say so (code: resolveAidOut, resolveAidInbound, answerAidBeg)
//   - aid_knowledge_gated: the request-aid move is learned via gossip/travelers, an inbound offer, or a beg — never assumed known (code: aidKnownTick)
//   - aid_standing_ge_ask: same bar as the call-for-help chain — trust >= 35, said aloud when refused (code: aidRequestable, resolveAidOut)
//   - ingratitude_remembered: aid given/received is ledgered per village; refusing a creditor after taking their food costs double trust and travels as gossip (code: answerAidBeg, aidLedger)
//   - antifarm_triggers_cooldowns_caps: quests bounded (3/run), requests per-village 7-day cooldown + global struggling gate (the trigger costs more than the reward), offers 5-day cooldown, neighbor pantries finite (code: offerAidQuest, requestAid, safetyNetsDayTick)
// consumes:
//   - say()
//   - sysSay()
//   - stockPantry()
//   - pantryKcalLive()
//   - _removePantryKcal()
//   - linkWith()
//   - _otherVillage()
//   - villageLinks()
//   - aidPartsFor()
//   - aidFaceFor()
//   - journalNote()
//   - leadShift()
//   - hurtVillager()
//   - displayName()
//   - vpOf()
//   - getPerson()
//   - tickAction()
//   - playerAtHaven()
//   - pantryInReach()
//   - hasAbility()
//   - abilitySlots()
//   - endDay()
//   - advancePart()
//   - villageSicknessTick()
//   - resolveAidCrisis()
//   - resolveStormFront()
//   - fireCrisis()
//   - villagerMealDay()
//   - villageMeal()
//   - aidCrisis()
//   - state.pendingAidQuest
//   - state.activeAidQuest
//   - state.aidQuestLedger
//   - state.relief
//   - state.aidOut
//   - state.aidInbound
//   - state.aidLedger
//   - state.aidKnown
//   - state.pendingAidOffer
//   - state.pendingAidBeg
//   - state.aidHands
/* SAFETY NETS — src/js/safetynets.js
 *
 * The survival-economy diagnosis (2026-10-10): win-seeking policy, 60 seeds x
 * 200 days — 0 wins, median survival 24 days vs the ~100-day target. Villages
 * lose ~12 members by day 24; 0/60 reach Haven tier 1. The numbers workers
 * retune yields and lethality; THIS module builds the earned safety nets that
 * keep early villages alive through the first ~30 days: played systems, not
 * outcome tables, not flat relief.
 *
 * Three systems, each reachable (UI beat + engine path) and each finite:
 *
 * 1. SYSTEM AID QUESTS (days 7-21). The System is already an alien benefactor;
 *    now it notices struggling villages and offers aid QUESTS — fetch a thing,
 *    treat the sick, learn a lesson — with real costs and real failure. The
 *    help is bizarrely wrong 1 in 4 times (canon: alien and out of touch) but
 *    the reward stays real. Never before day 7. Max 3 per run.
 *
 * 2. CRISIS RELIEF. When a crisis hits — sickness cascade, raid aftermath,
 *    storm aftermath, hunger winter — a NAMED VILLAGER proposes relief:
 *    triage tents, a rationing vote, an emergency hunt. Real tradeoffs, honest
 *    costs, one use per option per crisis. Villager-driven always (the System
 *    never speaks here), so pre-day-7 villages get the same path.
 *
 * 3. NEIGHBOR-VILLAGE AID FLOWS. Villages already splinter/petition/raid;
 *    this adds the aid direction. Struggling villages can REQUEST aid (food,
 *    medicine, hands) through the existing link/comms machinery; richer
 *    neighbors can OFFER it; struggling neighbors can BEG from you. Real
 *    trades, real deliveries, ingratitude remembered. Requests arrive through
 *    runners/gossip/beats; the request move itself must be LEARNED (gossip).
 *
 * Camera rule (from comms.js): everything arrives through named people.
 * Knowledge never gates a relief beat; it gates the request-aid move.
 *
 * Self-attaching module. Load after comms.js. Chain-safe wraps.
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;

  // The ask bar matches the call-for-help chain: standing >= the ask.
  var AID_ASK_TRUST = 35;
  // Aid quests: bounded, always.
  var QUEST_MAX_PER_RUN = 3;
  var QUEST_OFFER_COOLDOWN = 4;   // days between offers
  var QUEST_DAY_LO = 7, QUEST_DAY_HI = 21;

  function _day(self) { try { return (self.state.scholar || {}).day || 0; } catch (e) { return 0; } }
  function _vname(self, villageId) {
    try { var ov = self._otherVillage(villageId); return (ov && ov.name) || 'the other fire'; } catch (e) { return 'the other fire'; }
  }
  // _faceName: unwrap a face object — aidFaceFor's name can be a raw
  // {name, cultureId} object for speaker-less villages (see comms.js fix).
  function _faceName(face) {
    if (!face) return 'Someone';
    var n = face.name || face;
    if (n && typeof n === 'object') n = n.name || 'Someone';
    return String(n).split(' ')[0] || 'Someone';
  }
  function _face(self, villageId) {
    try { return _faceName(self.aidFaceFor(villageId)); } catch (e) { return 'Someone'; }
  }
  function _first(self, vid) {
    try { return String(self.displayName(vid)).split(' ')[0]; } catch (e) { return 'Someone'; }
  }
  function _links(self) {
    try { return self.villageLinks('haven'); } catch (e) { return []; }
  }
  function _otherId(self, link) {
    try { return link.primary === 'haven' ? link.subordinate : link.primary; } catch (e) { return null; }
  }
  // A named villager to carry the beat — never the player, never the dead.
  function _speaker(self) {
    try {
      var v = self.state.village || {};
      var roster = (v.roster || []).filter(function (id) {
        return id !== self.villagerId && !(self.vpOf(id) || {}).dead;
      });
      if (!roster.length) return 'Someone by the fire';
      // steadiest hands: highest health among the living
      var best = roster[0], bestH = -1;
      for (var i = 0; i < roster.length; i++) {
        var h = ((v.health || {})[roster[i]] !== undefined) ? v.health[roster[i]] : 100;
        if (h > bestH) { bestH = h; best = roster[i]; }
      }
      return _first(self, best);
    } catch (e) { return 'Someone by the fire'; }
  }

  var methods = {

    // ---------- STRUGGLE DETECTION ----------

    // aidQuestStruggle: is the village GENUINELY struggling? Signals, not a
    // vibe: per-capita pantry under 2 days, recent death, sickness, a
    // starving scholar. Anti-farm note: dumping the pantry alone doesn't
    // qualify — a pantry-only "crisis" costs more kcal than any aid pays.
    // (Documented in evidence/2026-10-10/survival-nets.md for Steve.)
    aidQuestStruggle() {
      var v = this.state.village || {};
      var day = _day(this);
      var roster = [];
      try {
        roster = (v.roster || []).filter(function (id) { return !(this.vpOf(id) || {}).dead; }, this);
      } catch (e) { roster = v.roster || []; }
      var n = Math.max(1, roster.length);
      var pantry = 0;
      try { pantry = this.pantryKcalLive(v); } catch (e) {}
      var lowFood = pantry < n * 2 * 2000;
      var sickN = Object.keys(v.sick || {}).length;
      var recentDeath = false;
      try {
        for (var i = 0; i < (v.fallen || []).length; i++) {
          if (day - ((v.fallen[i] || {}).day || 0) <= 3) { recentDeath = true; break; }
        }
      } catch (e) {}
      var scholarLow = ((this.state.scholar || {}).kcal || 0) < 800;
      var struggling = (lowFood && (sickN >= 1 || recentDeath || scholarLow)) ||
        sickN >= 2 || recentDeath || (scholarLow && pantry < n * 2000);
      return { struggling: struggling, lowFood: lowFood, sickN: sickN, recentDeath: recentDeath, scholarLow: scholarLow, perCapita: Math.round(pantry / n) };
    },

    // ---------- SYSTEM AID QUESTS ----------

    // offerAidQuest: the System notices. Gated: systemArrived, days 7-21, no
    // open quest, 4-day cooldown, max 3 per run, genuinely struggling.
    // Returns the quest or null (with the reason said aloud when refused by
    // the gate — the System doesn't do silent).
    offerAidQuest() {
      var st = this.state;
      if (!st.systemArrived) return null;
      var day = _day(this);
      if (day < QUEST_DAY_LO || day > QUEST_DAY_HI) return null;
      if (st.pendingAidQuest || st.activeAidQuest) return null;
      var ledger = st.aidQuestLedger = st.aidQuestLedger || { lastOfferDay: -99, done: 0, failed: 0 };
      if (ledger.done + ledger.failed >= QUEST_MAX_PER_RUN) return null;
      if (day - ledger.lastOfferDay < QUEST_OFFER_COOLDOWN) return null;
      var sg = this.aidQuestStruggle();
      if (!sg.struggling) return null;
      var kinds = ['fetch', 'treat', 'learn'];
      // TREAT needs a sick villager to name; LEARN always works; FETCH always.
      var v = st.village || {};
      var sickIds = Object.keys(v.sick || {});
      if (!sickIds.length) kinds = kinds.filter(function (k) { return k !== 'treat'; });
      var kind = kinds[Math.floor(R() * kinds.length)];
      var weird = R() < 0.25;
      var q = this._makeAidQuest(kind, weird, sg, sickIds);
      if (!q) return null;
      q.offerDay = day;
      st.pendingAidQuest = q;
      ledger.lastOfferDay = day;
      try { if (this.journalNote) this.journalNote('system', 'aid', 'The System offered an aid quest (' + kind + '), day ' + day + '.'); } catch (e) {}
      this.sysSay('"HELLO. WE HAVE BEEN WATCHING YOUR... METRICS."');
      this.sysSay('"' + q.ask + '"');
      this.sysSay('(Aid quest: ' + q.title + ' — ' + q.needText + ' Take it: answerAidQuest("accept"). Refuse it: answerAidQuest("refuse").)');
      return q;
    },

    // _makeAidQuest: concrete quest objects. need is engine-checkable; the
    // ask/needText/rewardText are the honest fiction.
    _makeAidQuest(kind, weird, sg, sickIds) {
      var day = _day(this);
      var q = { id: 'aq_' + day + '_' + Math.floor(R() * 1e6), kind: kind, weird: !!weird, sinceDay: day, deadlineDay: day + 3 };
      if (kind === 'fetch') {
        if (weird) {
          q.title = 'THE SMOOTH ONES';
          q.ask = 'BRING US YOUR ROCKS. THE SMOOTH ONES. THREE OF THEM. LINE THEM UP. WE ARE MAKING... ART. DO NOT ASK WHAT THE ART IS FOR.';
          q.need = { stoneUnits: 3 }; q.needText = 'hand over 3 stone (any)';
        } else if (R() < 0.5) {
          q.title = 'PROTEIN ACQUISITION';
          q.ask = 'YOUR ORGANIC UNITS ARE RUNNING LOW ON... FLESH-FUEL. BRING US 1,500 KCAL OF MEAT. RAW IS FINE. WE WILL NOT ASK WHERE IT CAME FROM. (WE WILL ASK. QUIETLY.)';
          q.need = { meatKcal: 1500 }; q.needText = 'hand over 1,500 kcal of meat';
        } else {
          q.title = 'GREEN THINGS, EDIBLE';
          q.ask = 'BRING US 5 UNITS OF PLANTS YOU HAVE EATEN AND SURVIVED. WE ARE BUILDING A... SALAD. FOR SCIENCE. DO NOT EAT THE SCIENCE SALAD.';
          q.need = { plantUnits: 5 }; q.needText = 'hand over 5 units of plant food';
        }
        q.rewardKind = R() < 0.6 ? 'supply' : 'ability';
      } else if (kind === 'treat') {
        // sickest first: lowest daysLeft
        var v = this.state.village || {};
        var target = sickIds[0], targetLeft = 9999;
        for (var i = 0; i < sickIds.length; i++) {
          var rec = (v.sick || {})[sickIds[i]] || {};
          if ((rec.daysLeft || 99) < targetLeft) { targetLeft = rec.daysLeft || 99; target = sickIds[i]; }
        }
        q.targetVid = target;
        q.targetName = _first(this, target);
        if (weird) {
          q.title = 'HUG-BASED MEDICINE';
          q.ask = 'THE SMALL SICK ONE — ' + q.targetName.toUpperCase() + '. OUR MEDICAL DATABASE SAYS: HUG THEM. HUGS ARE MEDICINE. (THE DATABASE IS WRONG ABOUT MANY THINGS. HUG THEM ANYWAY. ALSO: ACTUAL MEDICINE, IF YOU HAVE IT.)';
        } else {
          q.title = 'TEND THE SICK';
          q.ask = q.targetName.toUpperCase() + ' IS FAILING. OUR MODELS GIVE THEM...' + (targetLeft <= 2 ? ' NOT LONG.' : ' A CHANCE, IF TENDED.') + ' TEND THEM. MEDICINE, REST, SOUP, VIGIL — WHATEVER YOUR SPECIES DOES. BRING THEM BACK.';
        }
        q.need = { recoverVid: target };
        q.needText = q.targetName + ' recovers (any means)';
        q.rewardKind = R() < 0.6 ? 'ability' : 'supply';
      } else {
        var baseline = 0;
        try { baseline = Object.keys((this.state.codex || {}).plants || {}).length; } catch (e) {}
        q.baselinePlants = baseline;
        if (weird) {
          q.title = 'WHAT IS GREEN';
          q.ask = 'POINT AT THE GREEN THINGS AND SAY THEIR NAMES. LOUDLY. THE NAMES ARE THE MAGIC. TEACH US TWO (2) NEW GREEN THINGS AND WE WILL... UNDERSTAND. PROBABLY.';
        } else {
          q.title = 'SHOW YOUR WORK';
          q.ask = 'KNOWLEDGE IS THE ONLY CURRENCY WE RESPECT. IDENTIFY TWO (2) NEW PLANTS — NAME THEM, LEARN THEM, WRITE THEM DOWN. PROVE YOUR SPECIES PAYS ATTENTION.';
        }
        q.need = { plantsGain: 2 };
        q.needText = 'identify 2 new plants (' + baseline + ' known now)';
        q.rewardKind = R() < 0.6 ? 'ability' : 'supply';
      }
      return q;
    },

    // answerAidQuest: take it or leave it. Refusing is free but the System
    // pouts — and the cooldown still runs (no re-rolling the offer).
    answerAidQuest(how) {
      var st = this.state;
      var q = st.pendingAidQuest;
      if (!q) { this.say('The System isn\'t offering. (It offers when you\'re hurting — days 7-21.)'); return null; }
      st.pendingAidQuest = null;
      if (how === 'accept') {
        st.activeAidQuest = q;
        this.sysSay('"EXCELLENT. WE WILL BE WATCHING. (WE ARE ALWAYS WATCHING. THIS TIME WE MEAN IT ENCOURAGINGLY.)"');
        this.say('Aid quest accepted: ' + q.title + ' — ' + q.needText + '. ' + (q.deadlineDay - _day(this)) + ' days to finish it.');
        return q;
      }
      this.sysSay('"OH. OKAY. WE WILL JUST... WATCH YOU STRUGGLE, THEN. IT IS FINE. WE ARE FINE."');
      try { if (this.journalNote) this.journalNote('system', 'aid', 'Refused an aid quest (' + q.kind + '), day ' + _day(this) + '.'); } catch (e) {}
      return 'refused';
    },

    // _questFetchMatch: does this inventory item count toward the fetch need?
    _questFetchMatch(item, need) {
      if (!item) return 0;
      if (need.meatKcal) {
        if (item.foodKind === 'meat') return (item.kcalEach || 0) * (item.units || 0);
        return 0;
      }
      if (need.plantUnits) {
        if (item.foodKind === 'plant' || item.plantId) return (item.units || 0);
        return 0;
      }
      if (need.stoneUnits) {
        if (item.material === 'stone') return (item.units || 0);
        return 0;
      }
      return 0;
    },

    // handInAidQuest: the fetch hand-over. Items REALLY leave the pack —
    // whole units, over-take honest (same doctrine as _removePantryKcal).
    handInAidQuest() {
      var st = this.state;
      var q = st.activeAidQuest;
      if (!q) { this.say('No active aid quest.'); return null; }
      if (q.kind !== 'fetch') { this.say('Nothing to hand over — this quest completes on its own terms (' + q.needText + ').'); return null; }
      var need = q.need || {};
      var inv = (st.scholar || {}).inventory || [];
      var have = 0;
      for (var i = 0; i < inv.length; i++) have += this._questFetchMatch(inv[i], need);
      var want = need.meatKcal || 0;
      var wantUnits = need.plantUnits || need.stoneUnits || 0;
      var met = want ? have >= want : have >= wantUnits;
      if (!met) {
        var haveTxt = want ? Math.round(have).toLocaleString() + ' / ' + want.toLocaleString() + ' kcal of meat'
          : Math.round(have) + ' / ' + wantUnits + ' units';
        this.say('Not enough yet for the System\'s asking: ' + haveTxt + '. (' + q.title + ')');
        return 'short';
      }
      // take it — whole units, from the oldest stacks first
      var remaining = want || wantUnits;
      var byUnit = !want;
      for (var j = inv.length - 1; j >= 0 && remaining > 0; j--) {
        var it = inv[j];
        var val = this._questFetchMatch(it, need);
        if (val <= 0) continue;
        if (byUnit) {
          var takeU = Math.min(it.units || 0, Math.ceil(remaining));
          it.units -= takeU; remaining -= takeU;
        } else {
          var per = it.kcalEach || 0;
          var takeU2 = Math.min(it.units || 0, Math.ceil(remaining / Math.max(1, per)));
          it.units -= takeU2; remaining -= takeU2 * per;
        }
        if ((it.units || 0) <= 0) inv.splice(j, 1);
      }
      this.sysSay('"RECEIVED. ' + (q.weird ? 'THE ROCKS ARE MAGNIFICENT. THE ART PROCEEDS.' : 'FLESH-FUEL / GREEN THINGS LOGGED. YOUR SPECIES PROVIDES.') + '"');
      return this._completeAidQuest(true);
    },

    // abandonAidQuest: walk away. The System remembers — failure counts
    // against the 3-quest budget.
    abandonAidQuest() {
      var st = this.state;
      var q = st.activeAidQuest;
      if (!q) { this.say('No active aid quest.'); return null; }
      st.activeAidQuest = null;
      var ledger = st.aidQuestLedger = st.aidQuestLedger || { lastOfferDay: 0, done: 0, failed: 0 };
      ledger.failed += 1;
      this.sysSay('"...OH. WE SEE HOW IT IS. THE WATCHING CONTINUES, BUT ENCOURAGEMENT IS CANCELLED."');
      try { if (this.journalNote) this.journalNote('system', 'aid', 'Abandoned aid quest (' + q.kind + '), day ' + _day(this) + '.'); } catch (e) {}
      return 'abandoned';
    },

    // aidQuestCheckTreat: called per day-part — the named sick one recovered?
    aidQuestCheckTreat() {
      var st = this.state;
      var q = st.activeAidQuest;
      if (!q || q.kind !== 'treat' || !q.targetVid) return null;
      var v = st.village || {};
      var vp = null;
      try { vp = this.vpOf(q.targetVid); } catch (e) {}
      if ((vp && vp.dead) || !((v.roster || []).indexOf(q.targetVid) >= 0)) {
        this.sysSay('"...THE SMALL SICK ONE IS GONE. WE DO NOT UNDERSTAND. WE ARE GOING TO BE QUIET FOR A WHILE."');
        return this._completeAidQuest(false);
      }
      if (!(v.sick || {})[q.targetVid]) {
        this.sysSay('"' + q.targetName.toUpperCase() + ' LIVES. ' + (q.weird ? 'THE HUGS WORKED. SCIENCE IS BAFFLED. WE ARE TAKING CREDIT.' : 'YOUR SPECIES TENDS ITS OWN. NOTED. RESPECTFULLY NOTED.') + '"');
        return this._completeAidQuest(true);
      }
      return null;
    },

    // aidQuestCheckLearn: called per day-part — codex grew?
    aidQuestCheckLearn() {
      var st = this.state;
      var q = st.activeAidQuest;
      if (!q || q.kind !== 'learn') return null;
      var now = 0;
      try { now = Object.keys((st.codex || {}).plants || {}).length; } catch (e) {}
      if (now >= (q.baselinePlants || 0) + (q.need.plantsGain || 2)) {
        this.sysSay('"TWO NEW GREEN THINGS. THE NAMES HAVE BEEN SAID LOUDLY. WE... FEEL SOMETHING. IS THIS UNDERSTANDING? WE ARE KEEPING IT."');
        return this._completeAidQuest(true);
      }
      return null;
    },

    // _completeAidQuest: pay out. Supply = real pantry kcal with a parachute;
    // ability = the System's choice sheet (existing UI, slot-capped).
    _completeAidQuest(ok) {
      var st = this.state;
      var q = st.activeAidQuest;
      st.activeAidQuest = null;
      var ledger = st.aidQuestLedger = st.aidQuestLedger || { lastOfferDay: 0, done: 0, failed: 0 };
      if (!ok) {
        ledger.failed += 1;
        try { if (this.journalNote) this.journalNote('system', 'aid', 'Aid quest failed (' + (q && q.kind) + '), day ' + _day(this) + '.'); } catch (e) {}
        return 'failed';
      }
      ledger.done += 1;
      try { if (this.journalNote) this.journalNote('system', 'aid', 'Aid quest completed (' + q.kind + '), day ' + _day(this) + '.'); } catch (e) {}
      var rewardKind = q.rewardKind || 'supply';
      // slot check first: an ability with nowhere to land becomes supply
      if (rewardKind === 'ability') {
        var s = st.scholar || {};
        var maxSlots = 6;
        try { maxSlots = this.abilitySlots(); } catch (e) {}
        if ((s.abilities || []).length < maxSlots) {
          var pool = q.kind === 'fetch' ? ['scrounger', 'tracker', 'swimmer']
            : q.kind === 'treat' ? ['triage', 'field_medicine']
            : ['green_thumb', 'translator', 'night_eyes'];
          var owned = {};
          for (var i = 0; i < (s.abilities || []).length; i++) owned[(s.abilities[i] && s.abilities[i].id) || s.abilities[i]] = true;
          var cands = [];
          for (var j = 0; j < pool.length; j++) {
            var def = null;
            try { def = (this.data.abilities || []).find(function (a) { return a.id === pool[j]; }); } catch (e) {}
            if (def && !owned[def.id] && !(this.hasAbility && this.hasAbility(def.id))) {
              cands.push({ id: def.id, name: def.name, description: def.description || def.desc || '', flavor: q.weird ? 'It hums faintly. The System refuses to explain the humming.' : 'The System is extremely proud of this one.' });
            }
          }
          if (cands.length) {
            s.abilityChoices = cands.slice(0, 2);
            this.sysSay('"FOR YOUR SERVICE: A GIFT. CHOOSE. (THE SHEET WILL NOT TAKE NO FOR AN ANSWER. WE DESIGNED IT THAT WAY.)"');
            return 'reward-ability';
          }
        }
        rewardKind = 'supply'; // no room / nothing new — supply instead, said honestly below
      }
      var weirdSupply = q.weird && R() < 0.4;
      var kcal = 2400 + Math.floor(R() * 1200);
      var name = 'System aid cache';
      if (weirdSupply) {
        name = 'SYNTHETIC SUSTENANCE BRICKS';
        this.say('📦 A care package drops from the sky with a little parachute. Inside: gray bricks, warm, humming faintly.');
        this.sysSay('"SUSTENANCE. SYNTHESIZED. 2,800 KCAL PER BRICK-SLAB. TASTES LIKE... WE DID NOT TASTE IT. THE TASTING DIVISION RESIGNED."');
        this.say('The village eats the bricks. Nobody is happy about it. Everybody is alive about it. (+' + kcal.toLocaleString() + ' kcal, honestly counted.)');
      } else {
        this.say('📦 A care package drops from the sky with a little parachute. Real food — sealed, labeled in a cheerful alien hand: "FOR THE STRUGGLING ONES. EAT. GROW. CONFUSE US MORE."');
        this.sysSay('"EAT. GROW. WE ARE ROOTING FOR YOU. (THE GAMBLERS HAVE YOU AT LONG ODDS. PROVE THEM WRONG.)"');
        this.say('(+' + kcal.toLocaleString() + ' kcal into Haven\'s pantry — real pieces, real bins.)');
      }
      try { this.stockPantry(kcal, name, { pieceKcal: 400 }); } catch (e) {}
      return 'reward-supply';
    },

    // ---------- CRISIS RELIEF ----------

    // raiseRelief: a crisis hits; a NAMED VILLAGER proposes the relief path.
    // Villager-driven always — the System never speaks here, so pre-day-7
    // villages get the identical path. One relief at a time.
    raiseRelief(kind, ctx) {
      ctx = ctx || {};
      var st = this.state;
      if (st.relief) return null;
      if (this.over) return null;
      var speaker = _speaker(this);
      var names = {
        sickness: 'the fever in the tents', raid: 'what the raid left behind',
        storm: 'what the storm took', hunger: 'the empty bins',
      };
      st.relief = { kind: kind, sinceDay: _day(this), partsLeft: 12, used: {}, speaker: speaker };
      this.say('🛟 ' + speaker + ' stands up by the fire. "We can\'t just watch ' + (names[kind] || 'this') + ' happen. Here\'s what we CAN do — pick one, maybe two, but everything costs something."');
      if (kind === 'sickness') this.say('"The sick need tending — triage tents, broth, boiled water. Or we tighten our belts and wait it out. Or the hale hunt while the sick lie still."');
      else if (kind === 'hunger') this.say('"The bins are echoing. We vote half rations — three days, everyone, no exceptions — or the hunters go out hungry and bring back more than hunger."');
      else this.say('"There\'s hurt to tend and bellies to fill. Triage for the hurt, rations to stretch what\'s left, or a hard hunt to replace what we lost."');
      this.say('(Relief is open — answer from the beats row. Each option works once; the moment passes in ~3 days.)');
      try { if (this.journalNote) this.journalNote('village', 'relief', speaker + ' proposed relief (' + kind + '), day ' + _day(this) + '.'); } catch (e) {}
      return st.relief;
    },

    // answerRelief: the three options, each honest, each once per relief.
    answerRelief(opt) {
      var st = this.state;
      var rel = st.relief;
      if (!rel) { this.say('No relief on the table right now.'); return null; }
      if (rel.used[opt]) { this.say(rel.speaker + ' shakes their head. "Already done — we don\'t get to spend that twice."'); return 'used'; }
      var v = st.village || {};
      if (opt === 'triage') {
        var sickIds = Object.keys(v.sick || {});
        var wounded = [];
        try {
          for (var i = 0; i < (v.roster || []).length; i++) {
            var vid = v.roster[i];
            if (vid === this.villagerId || ((v.health || {})[vid] !== undefined && (v.health[vid] || 100) < 70)) {
              if (vid !== this.villagerId) wounded.push(vid);
            }
          }
        } catch (e) {}
        if (!sickIds.length && !wounded.length) { this.say('"Nobody\'s hurt enough to need the tents," says ' + rel.speaker + '. "Save it for when there is."'); return 'noneed'; }
        var paid = 0;
        try { paid = this._removePantryKcal(800); } catch (e) {}
        if (paid < 800) { this.say('"The bins can\'t cover broth and bandages for everyone," says ' + rel.speaker + ', quietly. "We don\'t have 800 kcal to burn on tending." (Triage needs 800 kcal in the pantry — honest cost, honestly refused.)'); return 'short'; }
        rel.used.triage = true;
        var nurse = _speaker(this);
        for (var s2 = 0; s2 < sickIds.length; s2++) {
          var rec = v.sick[sickIds[s2]];
          rec.daysLeft = Math.max(1, (rec.daysLeft || 3) - 2);
        }
        for (var w = 0; w < wounded.length; w++) {
          var vid2 = wounded[w];
          v.health = v.health || {};
          v.health[vid2] = Math.min(100, ((v.health[vid2] !== undefined) ? v.health[vid2] : 100) + 25);
        }
        this.say('⛺ Triage tents go up. ' + nurse + ' runs them — broth, boiled water, clean bandages, no sleep. (-800 kcal from the pantry, said aloud and spent.)');
        if (sickIds.length) this.say('The sick get real tending: every fever breaks two days sooner. The hurt get stitched and splinted.');
        return 'triage';
      }
      if (opt === 'rations') {
        rel.used.rations = true;
        var day = _day(this);
        v.rationing = { until: day + 3, votedDay: day };
        var before = v.morale;
        v.morale = 'strained';
        this.say('🗳️ The rationing vote passes — half rations, three days, everyone, no exceptions. (You eat half too: your evening pantry meal draws half, and you put the rest back in the bins.)');
        this.say('The vote costs something you can\'t eat: the village mood goes from "' + (before || 'steady') + '" to strained. Grumbling around the fire tonight.');
        try { if (this.leadShift) this.leadShift('unity', -1); } catch (e) {}
        try { if (this.journalNote) this.journalNote('village', 'relief', 'Rationing voted: half rations until day ' + (day + 3) + '.'); } catch (e) {}
        return 'rations';
      }
      if (opt === 'hunt') {
        rel.used.hunt = true;
        // two named hunters, real risk, real meat
        var hunters = [];
        try {
          var roster = (v.roster || []).filter(function (id) { return id !== this.villagerId && !(this.vpOf(id) || {}).dead; }, this);
          roster.sort(function (a, b) {
            var ha = ((v.health || {})[a] !== undefined) ? v.health[a] : 100;
            var hb = ((v.health || {})[b] !== undefined) ? v.health[b] : 100;
            return hb - ha;
          });
          hunters = roster.slice(0, 2);
        } catch (e) {}
        if (!hunters.length) { this.say('No hale hunters to send — everyone\'s down or gone.'); return 'noneed'; }
        var gain = 1500 + Math.floor(R() * 2500);
        var injuries = [];
        for (var h = 0; h < hunters.length; h++) {
          if (R() < 0.25) {
            var dmg = 10 + Math.floor(R() * 11);
            try { this.hurtVillager(hunters[h], dmg, 'emergency hunt'); } catch (e) {}
            injuries.push(_first(this, hunters[h]));
          }
        }
        try { this.stockPantry(gain, 'Emergency hunt meat', { pieceKcal: 500 }); } catch (e) {}
        var hn = hunters.map(function (id) { return _first(this, id); }, this).join(' and ');
        this.say('🏹 ' + hn + ' go out hungry and come back heavy: +' + gain.toLocaleString() + ' kcal of meat into the bins — real pieces, honestly counted.');
        if (injuries.length) this.say('The hunt took its price: ' + injuries.join(' and ') + ' came home hurt. (Emergency hunts are never free.)');
        else this.say('Nobody hurt this time. The village exhales.');
        return 'hunt';
      }
      if (opt === 'dismiss') {
        return this.resolveRelief('dismissed');
      }
      this.say('Triage tents, a rationing vote, or an emergency hunt — those are the options on the table.');
      return null;
    },

    // resolveRelief: the moment passes.
    resolveRelief(why) {
      var st = this.state;
      var rel = st.relief;
      if (!rel) return null;
      st.relief = null;
      if (why === 'expired') this.say('The relief moment passes — the crisis runs its own course now. What you did stands; what you didn\'t, doesn\'t.');
      else if (why === 'dismissed') this.say(rel.speaker + ' nods slowly. "Then we endure it plain. So be it."');
      return why;
    },

    // ---------- NEIGHBOR-VILLAGE AID FLOWS ----------

    // _linkById: links are keyed by id in the UI; linkWith() takes a village id.
    _linkById(linkId) {
      try {
        var links = this.hierarchyState();
        for (var i = 0; i < links.length; i++) if (links[i].id === linkId) return links[i];
      } catch (e) {}
      return null;
    },

    // aidLedger: per-village memory of aid given/received.
    aidLedger(villageId) {
      var st = this.state;
      st.aidLedger = st.aidLedger || {};
      if (!st.aidLedger[villageId]) st.aidLedger[villageId] = { lastReqDay: -99, givenKcal: 0, receivedKcal: 0, ingratitude: 0 };
      return st.aidLedger[villageId];
    },

    // aidRequestable: can Haven ask this link for aid? Returns {kinds} or
    // {blocked: reason}. Knowledge-gated: the move must be LEARNED.
    aidRequestable(linkId) {
      var st = this.state;
      if (!st.aidKnown) return { blocked: 'Haven hasn\'t learned that villages ASK each other for aid — that knowledge arrives via gossip, travelers, or an offer.' };
      // _linkById: links are keyed by id in the UI; linkWith takes a village id.
      var link = this._linkById(linkId);
      if (!link || link.status !== 'active') return { blocked: 'No active link — no one to ask.' };
      if ((link.trust || 0) < AID_ASK_TRUST) return { blocked: 'Trust ' + (link.trust || 0) + ' < ' + AID_ASK_TRUST + ' — the ask wouldn\'t carry.' };
      var sg = this.aidQuestStruggle();
      if (!sg.struggling) return { blocked: 'Haven\'s stores are fine — the ask wouldn\'t carry. (Aid is for struggling villages, honestly.)' };
      var vid = _otherId(this, link);
      var led = this.aidLedger(vid);
      var day = _day(this);
      if (day - led.lastReqDay < 7) return { blocked: 'Already asked them ' + (day - led.lastReqDay) + 'd ago — one ask per village per week.' };
      var out = (st.aidOut || []).concat(st.aidInbound || []);
      for (var i = 0; i < out.length; i++) if (out[i].villageId === vid) return { blocked: 'Word is already on the road to them — wait for the answer.' };
      return { kinds: ['food', 'medicine', 'hands'] };
    },

    // requestAid: Haven asks. linkId is the hierarchy link id (what the UI
    // passes); the village id is derived from it. The ask travels by runner
    // (real day-parts); the far end decides when the runner arrives.
    requestAid(linkId, kind) {
      var link = this._linkById(linkId);
      var villageId = link ? _otherId(this, link) : null;
      if (!villageId) { this.say('No such link.'); return 'blocked'; }
      var chk = this.aidRequestable(linkId);
      if (chk.blocked) { this.say(chk.blocked); return 'blocked'; }
      if (chk.kinds.indexOf(kind) < 0) { this.say('Food, medicine, or hands — those are the asks.'); return null; }
      var vn = _vname(this, villageId);
      var parts = 2, face = _face(this, villageId);
      try { parts = Math.max(2, this.aidPartsFor(villageId)); } catch (e) {}
      var runner = _speaker(this);
      var amount = kind === 'food' ? 2000 : kind === 'medicine' ? 1 : 2;
      var req = { villageId: villageId, kind: kind, amount: amount, partsLeft: parts, face: face, askedDay: _day(this) };
      this.state.aidOut = this.state.aidOut || [];
      this.state.aidOut.push(req);
      this.aidLedger(villageId).lastReqDay = _day(this);
      var what = kind === 'food' ? '2,000 kcal of food' : kind === 'medicine' ? 'medicine for the sick' : 'two pairs of hands for a few days';
      this.say('🏃 ' + runner + ' takes the road to ' + vn + ' with Haven\'s plea: ' + what + '. (' + parts + ' day-parts there, ' + parts + ' back with the answer. The road is real.)');
      try { if (this.journalNote) this.journalNote('village', 'aid', 'Asked ' + vn + ' for ' + kind + ', day ' + _day(this) + '.'); } catch (e) {}
      return req;
    },

    // resolveAidOut: the runner arrives; the far end decides — aloud, fast.
    resolveAidOut(req) {
      var st = this.state;
      var link = null, ov = null;
      try { link = this.linkWith(req.villageId); } catch (e) {}
      try { ov = this._otherVillage(req.villageId); } catch (e) {}
      var vn = _vname(this, req.villageId);
      var sp = _face(this, req.villageId);
      if (!link || link.status !== 'active') {
        this.say(req.face + ' comes home: the link with ' + vn + ' is gone — no one to ask anymore.');
        return 'nolink';
      }
      // THEIR SITUATION, honestly: mid-crisis villages can't give; poor
      // villages say so.
      if (ov && ov.crisis) {
        this.say('"' + sp + ' of ' + vn + ': "Our own door has teeth in it. We can\'t spare a grain — may your door hold." (Refused — their crisis, said aloud.)');
        try { this._linkNote(link, 'aid', 'Could not answer Haven\'s ' + req.kind + ' ask: mid-crisis.'); } catch (e) {}
        return 'refused';
      }
      var theirPantry = (ov && ov.pantryKcal) || 0;
      var cost = req.kind === 'food' ? 2000 : req.kind === 'medicine' ? 1500 : 3000;
      if (theirPantry < cost + 4000) {
        this.say('"' + sp + ' looks at their own bins, then at your runner. "' + vn + ' is thin ourselves — we can\'t spare it. Ask again when the green comes back." (Refused — their pantry is honestly bare: ~' + Math.round(theirPantry).toLocaleString() + ' kcal.)');
        try { this._linkNote(link, 'aid', 'Refused Haven\'s ' + req.kind + ' ask: pantry bare.'); } catch (e) {}
        link.trust = Math.max(0, (link.trust || 0) - 2);
        return 'refused';
      }
      var led = this.aidLedger(req.villageId);
      var score = (link.trust || 0) + R() * 24 - 12;
      if ((led.givenKcal || 0) > (led.receivedKcal || 0)) score += 10; // they owe you — credit is real
      if (req.kind === 'hands') score -= 5; // people are dear
      if (score < 45) {
        var reasons = [
          '"' + sp + ': "Our foragers can\'t leave our fields — not for this."',
          '"' + vn + ' has its own mouths," says ' + sp + '. "We\'re sorry. Truly."',
        ];
        this.say(reasons[Math.floor(R() * reasons.length)] + ' (Refused — the ask didn\'t carry. Trust ' + (link.trust || 0) + '.)');
        try { this._linkNote(link, 'aid', 'Refused Haven\'s ' + req.kind + ' ask: the ask didn\'t carry.'); } catch (e) {}
        link.trust = Math.max(0, (link.trust || 0) - 2);
        return 'refused';
      }
      // ACCEPTED: their stores thin for real; the delivery marches.
      ov.pantryKcal = Math.max(0, theirPantry - cost);
      var parts = 2;
      try { parts = Math.max(2, this.aidPartsFor(req.villageId)); } catch (e) {}
      var leader = null;
      try { leader = this.aidFaceFor(req.villageId); } catch (e) {}
      var del = { villageId: req.villageId, kind: req.kind, amount: req.amount, cost: cost, partsLeft: parts, face: (leader ? _faceName(leader) : sp), sentDay: _day(this) };
      st.aidInbound = st.aidInbound || [];
      st.aidInbound.push(del);
      if ((link.trust || 0) >= 60) {
        link.trust = Math.min(100, (link.trust || 0) + 3);
        this.say('"' + del.face + ' of ' + vn + ': "Old friends don\'t count the grain. ' + parts + ' day-parts — hold on." (Trust ' + link.trust + '.)');
      } else {
        this.say('"' + del.face + ' of ' + vn + ': "We\'ll send it. ' + cost.toLocaleString() + ' kcal of our work, or the trust of it — remember it." ' + parts + ' day-parts.');
        try { this._linkNote(link, 'aid', 'Sent Haven ' + req.kind + ' (' + cost.toLocaleString() + ' kcal cost to them).'); } catch (e) {}
      }
      return 'accepted';
    },

    // resolveAidInbound: the delivery walks in — real goods, real people.
    resolveAidInbound(del) {
      var vn = _vname(this, del.villageId);
      var led = this.aidLedger(del.villageId);
      led.receivedKcal = (led.receivedKcal || 0) + (del.cost || 0);
      if (del.kind === 'food') {
        try { this.stockPantry(del.amount, 'Aid from ' + vn, { pieceKcal: 500 }); } catch (e) {}
        this.say('🎁 ' + del.face + ' of ' + vn + ' walks in with pack-mules and full baskets: ' + del.amount.toLocaleString() + ' kcal, into Haven\'s bins — real pieces, honestly counted. "Eat. We\'ll settle the books when the green comes back."');
      } else if (del.kind === 'medicine') {
        // medicine for the sick: the sickest villager is treated, for real
        var v = this.state.village || {};
        var sickIds = Object.keys(v.sick || {});
        if (sickIds.length) {
          var target = sickIds[0], tl = 9999;
          for (var i = 0; i < sickIds.length; i++) {
            var rec = v.sick[sickIds[i]] || {};
            if ((rec.daysLeft || 99) < tl) { tl = rec.daysLeft || 99; target = sickIds[i]; }
          }
          delete v.sick[target];
          this.say('💊 ' + del.face + ' of ' + vn + ' brings bitter bark and careful hands — ' + _first(this, target) + '\'s fever breaks by nightfall. (Real cure: the sickness is gone, not eased.)');
          try { if (this.remember) this.remember(target, 'recovered', 'treated with ' + vn + ' medicine'); } catch (e) {}
        } else {
          this.say('💊 ' + del.face + ' of ' + vn + ' arrives with medicine — but nobody\'s sick anymore. They leave the remedies anyway: "For next time. There\'s always a next time."');
          try { this.stockPantry(600, 'Remedy stores from ' + vn, { pieceKcal: 300 }); } catch (e) {}
        }
      } else if (del.kind === 'hands') {
        this.state.aidHands = { villageId: del.villageId, daysLeft: 3, names: [del.face, 'a second pair of hands'] };
        try {
          var ov = this._otherVillage(del.villageId);
          var faces = (ov && ov.aidFaces) || [];
          if (faces[1]) this.state.aidHands.names = [del.face, _faceName(faces[1])];
        } catch (e) {}
        this.say('🤝 ' + this.state.aidHands.names.join(' and ') + ' of ' + vn + ' settle in for three days — their own bellies first, the surplus in your bins. (+1,200 kcal/day while they work your treeline.)');
      }
      try { if (this.journalNote) this.journalNote('village', 'aid', vn + ' delivered ' + del.kind + ' aid, day ' + _day(this) + '.'); } catch (e) {}
      return del.kind;
    },

    // answerAidOffer: a richer neighbor OFFERED. Accept with grace or refuse
    // with pride — both remembered.
    answerAidOffer(how) {
      var st = this.state;
      var of = st.pendingAidOffer;
      if (!of) { this.say('No aid offer on the table.'); return null; }
      st.pendingAidOffer = null;
      var link = null;
      try { link = this.linkWith(of.villageId); } catch (e) {}
      var vn = _vname(this, of.villageId);
      st.aidKnown = true;
      if (how === 'accept') {
        var parts = 2;
        try { parts = Math.max(2, this.aidPartsFor(of.villageId)); } catch (e) {}
        st.aidInbound = st.aidInbound || [];
        st.aidInbound.push({ villageId: of.villageId, kind: of.kind, amount: of.amount, cost: of.amount, partsLeft: parts, face: of.face, sentDay: _day(this) });
        try {
          var ov = this._otherVillage(of.villageId);
          if (ov) ov.pantryKcal = Math.max(0, (ov.pantryKcal || 0) - of.amount);
        } catch (e) {}
        if (link) link.trust = Math.min(100, (link.trust || 0) + 4);
        this.say('You accept ' + vn + '\'s ' + of.kind + ' — ' + of.amount.toLocaleString() + ' kcal on the road, ' + parts + ' day-parts out. ' + of.face + ' clasps your runner\'s shoulder. "That\'s what the fire network is FOR." (Trust +4.)');
        try { if (this.journalNote) this.journalNote('village', 'aid', 'Accepted ' + vn + ' aid offer (' + of.kind + '), day ' + _day(this) + '.'); } catch (e) {}
        return 'accepted';
      }
      if (link) {
        link.trust = Math.max(0, (link.trust || 0) - 3);
        try { if (this._nudgeOpinion) this._nudgeOpinion(of.villageId, -5); } catch (e) {}
      }
      this.say('You refuse ' + vn + '\'s offer — pride, or principle. ' + of.face + '\'s face closes. "As you say." (Trust -3. Pride is expensive.)');
      return 'refused';
    },

    // answerAidBeg: a struggling neighbor begs from YOU. Give real food or
    // refuse aloud — ingratitude is ledgered and travels.
    answerAidBeg(how) {
      var st = this.state;
      var beg = st.pendingAidBeg;
      if (!beg) { this.say('No one is begging.'); return null; }
      st.pendingAidBeg = null;
      var link = null, ov = null;
      try { link = this.linkWith(beg.villageId); } catch (e) {}
      try { ov = this._otherVillage(beg.villageId); } catch (e) {}
      var vn = _vname(this, beg.villageId);
      st.aidKnown = true; // watching a beg teaches the move
      var led = this.aidLedger(beg.villageId);
      if (how === 'give') {
        var paid = 0;
        try { paid = this._removePantryKcal(beg.amount); } catch (e) {}
        if (paid < beg.amount) {
          this.say('"Our bins are bare too," you tell ' + beg.face + ' — and they can SEE it. No shame in an honest no. (' + paid.toLocaleString() + ' kcal was all there was — you say so, they see it.)');
          if (link) link.trust = Math.max(0, (link.trust || 0) - 2);
          return 'short';
        }
        try { if (ov) ov.pantryKcal = (ov.pantryKcal || 0) + paid; } catch (e) {}
        led.givenKcal = (led.givenKcal || 0) + paid;
        if (link) {
          link.trust = Math.min(100, (link.trust || 0) + 4);
          link.aidCreditKcal = (link.aidCreditKcal || 0) + paid; // they owe you — future asks carry +10
          try { this._linkNote(link, 'aid', 'Gave ' + vn + ' ' + paid.toLocaleString() + ' kcal aid. Credit stands.'); } catch (e) {}
        }
        this.say('You give ' + vn + ' ' + paid.toLocaleString() + ' kcal from Haven\'s bins — real food, honestly counted. ' + beg.face + ' weeps, openly. "The fire network. That\'s what it\'s FOR." (Trust +4. They owe you — the ledger remembers.)');
        return 'gave';
      }
      // refuse
      var debt = (led.receivedKcal || 0) > (led.givenKcal || 0);
      if (link) {
        var hit = debt ? 10 : 5;
        link.trust = Math.max(0, (link.trust || 0) - hit);
        if (debt) {
          led.ingratitude = (led.ingratitude || 0) + 1;
          try { this._linkNote(link, 'aid', 'REFUSED ' + vn + ' after taking their aid. Ingratitude noted.'); } catch (e) {}
          this.say('You turn ' + beg.face + ' away — after ' + vn + ' fed YOU. The silence afterward is its own weather. (Trust -' + hit + '. Word travels: Haven forgot who fed them.)');
          try { if (this.leadShift) this.leadShift('unity', -1); } catch (e) {}
        } else {
          this.say('You refuse ' + vn + ' — gently, honestly, aloud. ' + beg.face + ' nods like they expected it. (Trust -' + hit + '.)');
        }
      }
      return 'refused';
    },

    // aidKnownTick: the request move is LEARNED — gossip, travelers, offers.
    aidKnownTick() {
      var st = this.state;
      if (st.aidKnown) return null;
      if (_day(this) < 3) return null;
      if (!_links(this).length) return null;
      if (R() >= 0.2) return null;
      var ovs = [];
      try { ovs = (st.otherVillages || []).filter(function (v) { return v.generated; }); } catch (e) {}
      var a = ovs.length ? ovs[Math.floor(R() * ovs.length)] : null;
      var an = a ? (a.name || 'a far fire') : 'a far fire';
      var b = ovs.length > 1 ? ovs[Math.floor(R() * ovs.length)] : null;
      var bn = (b && b !== a) ? (b.name || 'another') : 'another fire';
      st.aidKnown = true;
      this.say('🗣️ Word with the traders: ' + an + ' sent ' + bn + ' grain when their stores ran thin — no tribute, no ceremony, just food on the road. That\'s a thing villages DO now.');
      this.say('(Learned: Haven can REQUEST aid from linked villages — food, medicine, hands. Find it on the Haven panel, under your links.)');
      try { if (this.journalNote) this.journalNote('village', 'aid', 'Learned villages send each other aid — day ' + _day(this) + '.'); } catch (e) {}
      return true;
    },

    // ---------- TICKS ----------

    // safetyNetsDayTick: rides endDay. Offers, deadlines, inbound offers,
    // neighbor begs, quest auto-checks, relief expiry is part-based.
    safetyNetsDayTick() {
      if (this.over) return;
      var st = this.state;
      var day = _day(this);
      // quest offer
      try { this.offerAidQuest(); } catch (e) {}
      // pending offer expires
      if (st.pendingAidQuest && day > st.pendingAidQuest.offerDay + 2) {
        st.pendingAidQuest = null;
        this.sysSay('"...FINE. THE OFFER EXPIRES. WE WILL PRETEND WE NEVER CARED."');
      }
      // active quest: deadline + auto-checks
      var q = st.activeAidQuest;
      if (q) {
        if (day > q.deadlineDay) {
          st.activeAidQuest = null;
          var ledger = st.aidQuestLedger = st.aidQuestLedger || { lastOfferDay: 0, done: 0, failed: 0 };
          ledger.failed += 1;
          this.sysSay('"THE CLOCK RAN OUT. WE NOTICED. ENCOURAGEMENT: CANCELLED."');
          try { this.state.scholar.integration = Math.max(0, (this.state.scholar.integration || 0) - 2); } catch (e) {}
          try { if (this.journalNote) this.journalNote('system', 'aid', 'Aid quest expired (' + q.kind + '), day ' + day + '.'); } catch (e) {}
        } else {
          try { this.aidQuestCheckTreat(); } catch (e) {}
          try { this.aidQuestCheckLearn(); } catch (e) {}
        }
      }
      // aid-hands crews work their 3 days
      if (st.aidHands) {
        try { this.stockPantry(1200, 'Aid crew haul', { pieceKcal: 400 }); } catch (e) {}
        st.aidHands.daysLeft -= 1;
        if (st.aidHands.daysLeft <= 0) {
          var vn = _vname(this, st.aidHands.villageId);
          this.say('🤝 ' + (st.aidHands.names || []).join(' and ') + ' head home to ' + vn + ' — three days\' work in your bins, their own road under their feet. "That\'s what the fire network is FOR."');
          st.aidHands = null;
        }
      }
      // inbound AID OFFERS: a rich linked neighbor notices you're hurting
      try {
        if (!st.pendingAidOffer && (st.aidOfferCdDay || -99) + 5 <= day) {
          var sg = this.aidQuestStruggle();
          if (sg.struggling) {
            var rich = null;
            var links = _links(this);
            for (var i = 0; i < links.length; i++) {
              var lid = _otherId(this, links[i]);
              if (!lid || links[i].status !== 'active') continue;
              var ov = null;
              try { ov = this._otherVillage(lid); } catch (e) {}
              if (ov && (ov.pantryKcal || 0) > 20000 && (!rich || (ov.pantryKcal || 0) > (rich.pantryKcal || 0))) rich = ov;
            }
            if (rich && R() < 0.35) {
              st.aidOfferCdDay = day;
              var face = _face(this, rich.id);
              var amt = 1500 + Math.floor(R() * 1500);
              st.pendingAidOffer = { villageId: rich.id, kind: 'food', amount: amt, face: face, offerDay: day };
              st.aidKnown = true;
              this.say('🏃 ' + face + ' of ' + rich.name + ' walks into Haven unannounced, pack-mules behind. "Heard your bins are echoing. ' + rich.name + ' has grain to spare — ' + amt.toLocaleString() + ' kcal, no tribute, no ceremony. Say the word."');
              this.say('(Aid offer — accept or refuse from the beats row. Refusing costs pride: trust -3.)');
            }
          }
        }
      } catch (e) {}
      // neighbor BEGS: a thin linked village asks YOU
      try {
        if (!st.pendingAidBeg && (st.aidBegCdDay || -99) + 6 <= day && R() < 0.12) {
          var links2 = _links(this);
          var thin = null;
          for (var j = 0; j < links2.length; j++) {
            var lid2 = _otherId(this, links2[j]);
            if (!lid2 || links2[j].status !== 'active') continue;
            var ov2 = null;
            try { ov2 = this._otherVillage(lid2); } catch (e) {}
            if (ov2 && (ov2.pantryKcal || 0) < 5000 && (!thin || (ov2.pantryKcal || 0) < (thin.pantryKcal || 0))) thin = ov2;
          }
          if (thin) {
            st.aidBegCdDay = day;
            var face2 = _face(this, thin.id);
            var amt2 = 1200 + Math.floor(R() * 800);
            st.pendingAidBeg = { villageId: thin.id, kind: 'food', amount: amt2, face: face2, begDay: day };
            st.aidKnown = true;
            this.say('🥣 ' + face2 + ' of ' + thin.name + ' stands at your fire, thinner than pride allows. "' + thin.name + ' is eating bark. We\'re asking — ' + amt2.toLocaleString() + ' kcal, whatever you can spare. We\'ll remember it."');
            this.say('(They beg — give from the beats row, or refuse aloud. If they once fed you, refusing costs double.)');
          }
        }
      } catch (e) {}
      // gossip teaches the request move
      try { this.aidKnownTick(); } catch (e) {}
    },

    // safetyNetsPartTick: rides advancePart. Deliveries march; relief ticks.
    safetyNetsPartTick() {
      if (this.over) return;
      var st = this.state;
      // outbound asks arrive at the far end
      var out = st.aidOut || [];
      for (var i = out.length - 1; i >= 0; i--) {
        out[i].partsLeft -= 1;
        if (out[i].partsLeft <= 0) {
          var req = out.splice(i, 1)[0];
          try { this.resolveAidOut(req); } catch (e) {}
        }
      }
      // inbound deliveries arrive
      var inbound = st.aidInbound || [];
      for (var j = inbound.length - 1; j >= 0; j--) {
        inbound[j].partsLeft -= 1;
        if (inbound[j].partsLeft <= 0) {
          var del = inbound.splice(j, 1)[0];
          try { this.resolveAidInbound(del); } catch (e) {}
        }
      }
      // quest auto-checks (treat/learn complete between day ticks)
      try { this.aidQuestCheckTreat(); } catch (e) {}
      try { this.aidQuestCheckLearn(); } catch (e) {}
      // relief countdown: ~3 days of parts
      if (st.relief) {
        st.relief.partsLeft -= 1;
        if (st.relief.partsLeft <= 0) this.resolveRelief('expired');
      }
    },

  };

  for (var k in methods) { if (methods.hasOwnProperty(k)) G[k] = methods[k]; }

  // safetyNetsDayTick rides endDay — offers, deadlines, inbound beats.
  var _endDayS = G.endDay;
  if (_endDayS) G.endDay = function () {
    var r = _endDayS.apply(this, arguments);
    try { if (this.safetyNetsDayTick) this.safetyNetsDayTick(); } catch (e) {}
    return r;
  };

  // safetyNetsPartTick rides advancePart — deliveries march, relief ticks.
  var _advancePartS = G.advancePart;
  if (_advancePartS) G.advancePart = function () {
    var r = _advancePartS.apply(this, arguments);
    try { if (this.safetyNetsPartTick) this.safetyNetsPartTick(); } catch (e) {}
    return r;
  };

  // SICKNESS CASCADE -> relief (villager-driven; the System never speaks).
  var _vstS = G.villageSicknessTick;
  if (_vstS) G.villageSicknessTick = function () {
    var r = _vstS.apply(this, arguments);
    try {
      var v = this.state.village || {};
      var sickN = Object.keys(v.sick || {}).length;
      if (sickN >= 2 && !this.state.relief && !this.over) this.raiseRelief('sickness', { sickN: sickN });
    } catch (e) {}
    return r;
  };

  // RAID AFTERMATH -> relief.
  var _racS = G.resolveAidCrisis;
  if (_racS) G.resolveAidCrisis = function (how) {
    var crisis = null;
    try { crisis = this.aidCrisis(); } catch (e) {}
    var r = _racS.apply(this, arguments);
    try {
      if (r === 'fought' && crisis && crisis.raiders && !this.state.relief && !this.over) this.raiseRelief('raid', {});
    } catch (e) {}
    return r;
  };

  // STORM AFTERMATH -> relief (only when the storm actually hurt).
  var _rsfS = G.resolveStormFront;
  if (_rsfS) G.resolveStormFront = function () {
    var had = false, sheltered = true;
    try {
      had = !!((this.state.scholar || {}).stormFront);
      sheltered = (this.playerAtHaven && this.playerAtHaven()) || (this.isSafeTile && this.isSafeTile(this.map.px, this.map.py));
    } catch (e) {}
    var r = _rsfS.apply(this, arguments);
    try {
      if (had && !sheltered && !this.state.relief && !this.over) this.raiseRelief('storm', {});
    } catch (e) {}
    return r;
  };

  // HUNGER WINTER -> relief (the rationing answer lives here).
  var _fcS = G.fireCrisis;
  if (_fcS) G.fireCrisis = function (kind, ctx) {
    var r = _fcS.apply(this, arguments);
    try {
      if (r === true && kind === 'hunger-winter' && !this.state.relief && !this.over) this.raiseRelief('hunger', {});
    } catch (e) {}
    return r;
  };

  // RATIONING: villagers eat half while the vote holds. The need halves —
  // the pantry draw halves with it. Restored after the call.
  var _vmdS = G.villagerMealDay;
  if (_vmdS) G.villagerMealDay = function (vid, person, v, ctx) {
    var day = 0, ration = false, saved = null, had = false;
    try {
      day = (this.state.scholar || {}).day || 0;
      ration = !!(v && v.rationing && v.rationing.until >= day);
    } catch (e) {}
    if (ration && person && !person._rationHalf) {
      had = true; saved = person.kcalPerDay;
      person.kcalPerDay = Math.round((saved || 2000) * 0.5);
      person._rationHalf = true;
    }
    try { return _vmdS.apply(this, arguments); }
    finally { if (had) { person.kcalPerDay = saved; person._rationHalf = false; } }
  };

  // RATIONING: the player eats half too — the evening meal draws half, and
  // the rest goes back in the bins as real pieces. Said once per day.
  var _vmS = G.villageMeal;
  if (_vmS) G.villageMeal = function () {
    var day = 0, ration = false, v = null;
    try {
      v = this.state.village || {};
      day = (this.state.scholar || {}).day || 0;
      ration = !!(v.rationing && v.rationing.until >= day);
    } catch (e) {}
    var r = _vmS.apply(this, arguments);
    try {
      if (ration && v && (v.lastPlayerMeal || 0) > 0) {
        var give = Math.round(v.lastPlayerMeal / 2);
        if (give > 0) {
          var s = this.state.scholar;
          s.kcal = Math.max(0, (s.kcal || 0) - give);
          if (this.stockPantry) this.stockPantry(give, 'Ration returned', { pieceKcal: 400 });
          v.lastPlayerMeal = (v.lastPlayerMeal || 0) - give;
          if (v._rationSaidDay !== day) {
            v._rationSaidDay = day;
            this.say('You eat half and put the rest back in the bins. The vote holds — for everyone. (Rationing: -' + give.toLocaleString() + ' kcal from your meal, back in the pantry.)');
          }
        }
      }
    } catch (e) {}
    return r;
  };

})();
