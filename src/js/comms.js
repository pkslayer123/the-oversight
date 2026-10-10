// @ontology
// system: comms
// description: Call-for-help chain (4 tiers) + the switchboard OFFICE — the mechanical core of inter-village cooperation.
// provides:
//   - aidCrisis()
//   - raiseAidCrisis(name, wave)
//   - resolveAidCrisis(how)
//   - callForHelp(tier, opts)
//   - aidSendRunner(opts)
//   - aidPickRunner()
//   - aidRunnerAway(vid)
//   - aidRoadHot()
//   - aidSignalFire()
//   - aidSystemRelay()
//   - aidCry(abilityId, targetId)
//   - aidCryAbilities()
//   - aidDistance(villageId)
//   - aidPartsFor(villageId)
//   - aidAskVillage(villageId, via, msg)
//   - aidFaceFor(villageId)
//   - aidHelpArrived(help)
//   - repayAidDebt(linkId)
//   - aidFight(vid, mdef, m, opts)
//   - aidAllyDown(villageId, face, allyName)
//   - commsTick()
//   - foreignCrisisTick()
//   - collectSystemFavor()
//   - answerSystemFavor(how)
//   - switchboard()
//   - switchboardAvailable()
//   - switchboardCandidates()
//   - appointSwitchboard(vid)
//   - removeSwitchboard(why)
//   - switchboardRoute(msg)
//   - switchboardTalkerCost()
//   - switchboardStageTick()
//   - confrontSwitchboard()
// rules:
//   - four_tiers_honest_costs: runner (time in day-parts + real road danger), signal (loud/indiscriminate), system relay (garbled + favor owed), cry (build-gated, fast, honest). Help is never free and never guaranteed. (code: callForHelp)
//   - runner_road_danger: the runner can be hurt or die on the road (registerDeath); when the beacon's attention has made the road hot (attracted >= 2) nobody volunteers — said aloud. (code: aidSendRunner)
//   - signal_is_indiscriminate: the beacon asks every linked village, but hostile known villages see it too (opinion -5, remembered), and the smoke draws company — crisis.attracted grows, arrives as real pack members in the fight (packBonus), and fleeing is blocked while it holds. (code: aidSignalFire)
//   - system_relay_garbled: needs integration stage 2+; the call is enthusiastic and mistranslated (party size drifts, wrong-threat comedy said aloud, occasional wrong address); the System takes a cut — a favor owed, narrated aloud and collected later as a played demand. (code: aidSystemRelay)
//   - cry_is_build_gated: war_cry's bellow (and kin) punch through — targeted, same-part muster, honest message; gated on actually having the ability. (code: aidCry)
//   - refusals_aloud_fast: aidAskVillage always speaks — acceptance, refusal, or no-link — never silent waiting. (code: aidAskVillage)
//   - raid_raises_crisis: raids raise the crisis reactively (havenGrowth.js havenRaidTick) — the "monster at your door" beat the chain was built for; raiseAidCrisis had no organic caller (0/120 runs). Lingering raiders are the persistent threat; the crisis resolves 'fought' when the treeline is clear, 'moved-on' on the 6-day valve (lingering cleared). (code: commsTick, 2026-10-10)
//   - standing_ge_ask: only links with trust >= 35 can be asked; below that the refusal names the number. (code: aidAskVillage)
//   - mid_crisis_cant_come: a village with its own crisis says so aloud and stays home; foreign crises start/end reactively (seeded), never on a calendar. (code: aidAskVillage, foreignCrisisTick)
//   - capped_party_named_face: help is a party of at most 4 led by one of the village's ~3 named faces (consistent across calls); the party marches real day-parts and can stand down aloud if the door goes quiet. (code: aidAskVillage, aidHelpArrived)
//   - cost_remembered: their foragers leave their fields — trust >= 60 forgives it into trust; otherwise it's aidDebtKcal on the link, repayable aloud via repayAidDebt. (code: aidAskVillage)
//   - help_fights_blow_by_blow: arrived parties join the crisis fight as real combatants through fieldFight (allyFromStart, real blows, real risk) — never an outcome table; a fallen ally costs trust and forgives debt in blood. (code: aidFight, aidAllyDown)
//   - office_is_not_god_path: the switchboard is an appointed villager who routes/delays/edits messages — the corruption surface is the point, not a power fantasy. (code: switchboardRoute)
//   - appointment_costs: every candidate costs something different — the best talker weakens moots (trial swing -8), the weakest forager breeds resentment (mood -8, trust -10); the appointment is public and televised, and the village reacts (pride/resentment/fear). (code: appointSwitchboard)
//   - corruption_surface: the holder can delay, soften, or sit on messages; tampering is logged, discoverable, and confrontable — a baseless confrontation costs the accuser. (code: switchboardRoute, confrontSwitchboard)
//   - scale_progression_not_skill_tree: the office's stage rides the game's own scale ladder (village relay -> regional switchboard -> national voice -> a name the planet knows), announced aloud, never a skill tree. (code: switchboardStageTick)
//   - messages_feed_ending_frame: clean routing feeds diplomacy/unity; tampering feeds fracture — via leadShift. (code: switchboardRoute)
//   - camera_rule: everything arrives through named people (runners, speakers, the holder); no region-management screen; knowledge never gates an aid call. (code: aidFaceFor)
// consumes:
//   - linkWith()
//   - hierarchyState()
//   - villageLinks()
//   - _otherVillage()
//   - _linkNote()
//   - _nudgeOpinion()
//   - scaleRank()
//   - knowsVillage()
//   - fieldFight()
//   - tickAction()
//   - say()
//   - sysSay()
//   - displayName()
//   - isMember()
//   - npcTemper()
//   - repOf()
//   - registerDeath()
//   - leadShift()
//   - integrationStage()
//   - hasAbility()
//   - genNameForOrigin()
//   - journalNote()
//   - _removePantryKcal()
//   - state.aidCrisis
//   - state.aidRunners
//   - state.pendingHelp
//   - state.switchboard
//   - state.systemFavorsOwed
/* CALL-FOR-HELP + SWITCHBOARD — src/js/comms.js
 *
 * PROGRESSION.md ("When a monster shows up at your door"): four tiers, each
 * with honest costs; help is never free and never guaranteed. Refusals arrive
 * aloud and fast. Help arrives as a capped party led by one of their named
 * faces (~3 per village, consistent). Cost to them: their foragers leave
 * their fields — remembered in trust or in tribute owed.
 *
 * PROGRESSION.md ("The switchboard is an OFFICE, not a god path", Steve
 * 2026-10-10): a villager is APPOINTED to run the relay. The deliberate
 * choice is who you lose — every candidate costs something different. The
 * appointment is a public, televised beat. The officeholder routes messages
 * and can prioritize/delay/EDIT. Their mini-progression rides the scale
 * ladder, never a skill tree. What they do with messages feeds the ending
 * frame. The office arrives with the regional game (gated on networkLive).
 *
 * Camera rule: you manage ONE village; everything through people. Knowledge
 * NEVER gates an aid call. Reactive, never calendar-scripted. No
 * region-management screen.
 *
 * Self-attaching module. Load after hierarchy.js. Chain-safe wraps.
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var R = Math.random;
  var HOME = 'haven';

  // Standing >= the ask. Below this, the refusal names the number.
  var AID_ASK_TRUST = 35;
  // Help parties are capped like yours.
  var PARTY_CAP = 4;
  // Haven's tile on the 9x9.
  var HAVEN_X = 4, HAVEN_Y = 4;

  function _day(self) { try { return (self.state.scholar || {}).day || 0; } catch (e) { return 0; } }
  function _part(self) { try { return self.dayPart || 0; } catch (e) { return 0; } }
  function _first(self, vid) {
    try { return String(self.displayName(vid)).split(' ')[0]; } catch (e) { return 'Someone'; }
  }
  function _vname(self, villageId) {
    try { var ov = self._otherVillage(villageId); return (ov && ov.name) || 'the other fire'; } catch (e) { return 'the other fire'; }
  }
  function _speakerName(self, villageId) {
    try {
      var link = self.linkWith(villageId);
      if (link && link.theirSpeaker && link.theirSpeaker.name) return String(link.theirSpeaker.name).split(' ')[0];
    } catch (e) {}
    return _vname(self, villageId);
  }
  function _links(self) {
    try { return self.villageLinks(HOME); } catch (e) { return []; }
  }
  function _otherId(self, link) {
    return link.primary === HOME ? link.subordinate : link.primary;
  }

  var methods = {

    // ---------- THE CRISIS ----------

    aidCrisis() {
      try { return this.state.aidCrisis || null; } catch (e) { return null; }
    },

    // raiseAidCrisis: a monster is at the door. The village looks to you.
    // Player-declared — reactive, never calendar-scripted.
    raiseAidCrisis(name, wave) {
      if (this.aidCrisis()) {
        this.say('There\'s already teeth at the door — one crisis at a time. Handle this one first.');
        return null;
      }
      this.state.aidCrisis = {
        kind: 'monster', name: name || 'something with teeth', wave: wave || 1,
        sinceDay: _day(this), sincePart: _part(this),
        calls: [], helpAtDoor: [], attracted: 0, resolved: false,
      };
      this.state.aidRunners = this.state.aidRunners || [];
      this.state.pendingHelp = this.state.pendingHelp || [];
      this.say('🚨 ' + this.state.aidCrisis.name + ' is at Haven\'s door. The village looks to you. Four ways to call: a RUNNER (slow, dangerous), a SIGNAL FIRE (fast, loud, everyone sees), the SYSTEM RELAY (if it can carry voices), or an ABILITY CRY (if your build has one). Each with honest costs.');
      try { if (this.journalNote) this.journalNote('village', 'aid', this.state.aidCrisis.name + ' at the door, day ' + _day(this) + '.'); } catch (e) {}
      return this.state.aidCrisis;
    },

    // resolveAidCrisis: the door goes quiet. Help heads home; debts stand.
    resolveAidCrisis(how) {
      var crisis = this.aidCrisis();
      if (!crisis) return null;
      if (how === 'fled' && (crisis.attracted || 0) >= 1) {
        this.say('You try to slip away — but the smoke told it exactly where your door is. It\'s waiting. (Fleeing is blocked while the beacon\'s attention holds.)');
        return 'blocked';
      }
      crisis.resolved = true;
      var doors = crisis.helpAtDoor || [];
      for (var i = 0; i < doors.length; i++) {
        var p = doors[i];
        this.say(_speakerName(this, p.villageId) + ' of ' + _vname(this, p.villageId) + ' heads home — the door is quiet. The debt stands.');
      }
      this.state.aidCrisis = null;
      if (how === 'fought') {
        this.say('The door is quiet. Haven breathes.');
        try { if (this.leadShift) this.leadShift('protection', 1); } catch (e) {}
      } else if (how === 'moved-on') {
        this.say('Whatever was at the door has moved on — or found easier meat. The call goes quiet.');
      }
      return how;
    },

    // ---------- THE FOUR TIERS ----------

    // callForHelp: the single entry. tier: runner | signal | system | cry.
    callForHelp(tier, opts) {
      opts = opts || {};
      var crisis = this.aidCrisis();
      if (!crisis) {
        this.say('No emergency at the door right now — nothing to call about.');
        return null;
      }
      if (tier === 'runner') return this.aidSendRunner(opts);
      if (tier === 'signal') return this.aidSignalFire();
      if (tier === 'system') return this.aidSystemRelay();
      if (tier === 'cry') return this.aidCry(opts.abilityId, opts.targetId);
      this.say('Runner, signal fire, System relay, or an ability cry — those are the four ways to call.');
      return null;
    },

    aidDistance(villageId) {
      try {
        var ov = this._otherVillage(villageId);
        if (!ov) return 3;
        return Math.max(1, Math.abs(HAVEN_X - (ov.x == null ? HAVEN_X : ov.x)) + Math.abs(HAVEN_Y - (ov.y == null ? HAVEN_Y : ov.y)));
      } catch (e) { return 3; }
    },

    // Day-parts one way. Never instant.
    aidPartsFor(villageId) {
      return Math.max(1, Math.ceil(this.aidDistance(villageId) / 3));
    },

    aidRunnerAway(vid) {
      try {
        var rs = this.state.aidRunners || [];
        for (var i = 0; i < rs.length; i++) if (rs[i].vid === vid) return true;
      } catch (e) {}
      return false;
    },

    // The road is hot when the beacon's attention has the treeline watching.
    aidRoadHot() {
      var crisis = this.aidCrisis();
      return !!crisis && (crisis.attracted || 0) >= 2;
    },

    aidPickRunner() {
      try {
        var roster = (this.state.village.roster || []);
        var self = this;
        var holderId = null;
        try { holderId = (this.switchboard() || {}).holderId || null; } catch (e) {}
        var cands = roster.filter(function (id) {
          // the relay holder runs the relay — not the road
          return id !== self.villagerId && id !== holderId && self.isMember(id) && !self.aidRunnerAway(id);
        });
        if (!cands.length) return null;
        // The bold volunteer first.
        var bold = cands.filter(function (id) {
          try { return self.npcTemper(id) === 'bold'; } catch (e) { return false; }
        });
        var pool = bold.length ? bold : cands;
        return pool[Math.floor(R() * pool.length)];
      } catch (e) { return null; }
    },

    // TIER 1 — RUNNER. Slow, dangerous, targeted. The plea passes through
    // the officeholder's hands (they choose the words).
    aidSendRunner(opts) {
      opts = opts || {};
      var crisis = this.aidCrisis();
      if (!crisis) return null;
      var links = _links(this);
      if (!links.length) {
        this.say('There\'s nobody linked to run to — Haven stands alone.');
        return 'nolink';
      }
      var targetId = opts.targetId;
      if (!targetId || !this.linkWith(targetId)) {
        var best = null, bd = 1e9, self = this;
        links.forEach(function (l) {
          var o = _otherId(self, l);
          var d = self.aidDistance(o);
          if (d < bd) { bd = d; best = o; }
        });
        targetId = best;
      }
      if (this.aidRoadHot()) {
        this.say('The road is hot — the beacon\'s smoke has the treeline watching. No runner volunteers to die for a message. (Light fewer fires, or wait for the attention to pass.)');
        return 'hot';
      }
      var vid = opts.runnerId || null;
      if (vid && !(this.isMember(vid) && vid !== this.villagerId && !this.aidRunnerAway(vid))) {
        this.say('They can\'t run — not available, not here, or already on the road.');
        return null;
      }
      if (!vid) vid = this.aidPickRunner();
      if (!vid) {
        this.say('There\'s nobody to send — every hand is needed at the door.');
        return null;
      }
      var parts = this.aidPartsFor(targetId);
      // The plea passes through the officeholder's hands.
      var route = { decision: 'routed', delay: 0 };
      try { route = this.switchboardRoute({ kind: 'aid-call', text: 'plea', targetId: targetId }) || route; } catch (e) {}
      var delay = Math.max(-1, route.delay || 0);
      var partsLeft = Math.max(1, parts + delay);
      // REAL DANGER: the road can take them.
      var danger = 0.12 + 0.02 * (crisis.wave || 1);
      var mishap = null;
      var rn = _first(this, vid);
      var vn = _vname(this, targetId);
      if (R() < danger) {
        if (R() < 0.4) {
          var fullnm = rn;
          try { fullnm = this.displayName(vid); } catch (e) {}
          this.say(rn + ' takes the plea and the road — and the road takes ' + rn + '. They don\'t make it. The message dies with them.');
          try { if (this.registerDeath) this.registerDeath({ kind: 'person', villagerId: vid, name: fullnm, cause: 'aid-runner' }); } catch (e) {}
          crisis.calls.push({ tier: 'runner', day: _day(this), part: _part(this), targetId: targetId, runner: vid, result: 'died' });
          return 'died';
        }
        mishap = 'hurt';
        partsLeft += 1;
      }
      this.state.aidRunners.push({
        vid: vid, targetId: targetId, phase: 'out', parts: parts, partsLeft: partsLeft,
        mishap: mishap, msg: { softened: route.decision === 'edited' }, route: route,
      });
      crisis.calls.push({ tier: 'runner', day: _day(this), part: _part(this), targetId: targetId, runner: vid, result: 'sent' });
      try { this.tickAction(8); } catch (e) {}
      this.say(rn + ' sprints for ' + vn + ' — ' + parts + ' day-part' + (parts > 1 ? 's' : '') + ' each way, and the road isn\'t safe. That\'s the price. They\'re gone from Haven\'s hands until they\'re back.');
      if (mishap === 'hurt') this.say('Word comes back fast: ' + rn + ' was hurt on the road — limping, late, but moving.');
      return 'sent';
    },

    // TIER 2 — SIGNAL FIRE. Fast, loud, indiscriminate. Everyone in range
    // sees it — including hostile villages and everything between.
    aidSignalFire() {
      var crisis = this.aidCrisis();
      if (!crisis) return null;
      var day = _day(this), part = _part(this);
      try { this.tickAction(16); } catch (e) {}
      crisis.attracted = (crisis.attracted || 0) + 1;
      crisis.calls.push({ tier: 'signal', day: day, part: part });
      this.say('🔥 The beacon catches. Smoke climbs — black, deliberate, readable for miles. Every fire in range will see it.');
      var links = _links(this);
      if (!links.length) {
        this.say('The smoke climbs. Nobody\'s linked to read it — it rises for strangers.');
      } else {
        var self = this;
        links.forEach(function (l) { self.aidAskVillage(_otherId(self, l), 'signal', null); });
      }
      // INDISCRIMINATE: hostile known villages read smoke too.
      var seen = [];
      var ovs = [];
      try { ovs = this.state.otherVillages || []; } catch (e) {}
      for (var i = 0; i < ovs.length; i++) {
        var ov = ovs[i];
        if (!ov || ov.id === HOME) continue;
        var linked = false, known = false;
        try { linked = !!this.linkWith(ov.id); known = this.knowsVillage(ov); } catch (e) {}
        if (linked || !known) continue;
        if ((ov.opinion || 0) <= -20) {
          try { this._nudgeOpinion(ov.id, -5); } catch (e) {}
          ov.smokeSeenDay = day;
          seen.push(ov.name || 'a cold fire');
        }
      }
      if (seen.length) this.say('And the wrong eyes saw it too: ' + seen.join(', ') + ' read Haven\'s smoke. Desperation is information — they\'ll remember Haven burned daylight crying for help.');
      this.say('Something in the treeline reads smoke as well. The door just got more crowded — and while the beacon\'s attention holds, slipping away isn\'t an option.');
      return 'signal';
    },

    // TIER 3 — SYSTEM RELAY. Integration-gated. Enthusiastic, translated,
    // possibly wrong — and the System takes a cut, narrated aloud.
    aidSystemRelay() {
      var crisis = this.aidCrisis();
      if (!crisis) return null;
      var stage = 0;
      try { stage = this.integrationStage(); } catch (e) {}
      if (stage < 2) {
        this.say('The System can\'t carry voices yet — the relay needs the neural creep (integration stage 2+). Runners and smoke still work.');
        return 'gated';
      }
      var links = _links(this);
      if (!links.length) {
        this.say('The System looks for someone to carry it to — and finds no one linked. Even the System needs a road.');
        return 'nolink';
      }
      this.state.systemFavorsOwed = (this.state.systemFavorsOwed || 0) + 1;
      this.say('◈ SYSTEM: "OH. Oh no. A CALL FOR HELP — I LOVE these. Loud, urgent, MINE to carry. Consider it CARRIED. (You\'re welcome.)"');
      this.say('The System takes the call — enthusiastic, and already translating. What arrives won\'t be quite what you said. And the System takes a cut: a favor owed. It keeps books you can\'t read.');
      var self = this;
      links.forEach(function (l) {
        var other = _otherId(self, l);
        self.say('What ' + _vname(self, other) + ' hears: "SMALL TEETH PROBLEM AT HAVEN. SEND HELP. (ENTHUSIASM INCLUDED.)"');
        self.aidAskVillage(other, 'system', { garbled: true });
      });
      // Wrong address: the System is enthusiastic, not precise.
      if (R() < 0.2) {
        var strangers = [];
        var ovs = [];
        try { ovs = this.state.otherVillages || []; } catch (e) {}
        for (var i = 0; i < ovs.length; i++) {
          var ov = ovs[i];
          if (!ov || ov.id === HOME) continue;
          var lk = false, kn = false;
          try { lk = !!this.linkWith(ov.id); kn = this.knowsVillage(ov); } catch (e) {}
          if (!lk && kn) strangers.push(ov);
        }
        if (strangers.length) {
          var sv = strangers[Math.floor(R() * strangers.length)];
          this.say('The System also told ' + (sv.name || 'a strange fire') + ' — wrong address, wrong version. They heard "Haven is having a FESTIVAL."');
          try { this._nudgeOpinion(sv.id, -3); } catch (e) {}
        }
      }
      crisis.calls.push({ tier: 'system', day: _day(this), part: _part(this) });
      return 'relayed';
    },

    // TIER 4 — ABILITY CRIES. Earned, build-gated: shouts, flares,
    // beast-calls punch through. Targeted, fast, honest.
    aidCryAbilities() {
      var out = [];
      try {
        var CRY_IDS = ['war_cry'];
        var CRY_ACTIONS = ['bellow', 'war_horn', 'signal_flare', 'beast_call', 'thunder_call'];
        var abs = (this.data && this.data.abilities) || [];
        for (var i = 0; i < abs.length; i++) {
          var a = abs[i];
          var isCry = CRY_IDS.indexOf(a.id) >= 0;
          if (!isCry && a.actions) {
            for (var j = 0; j < a.actions.length; j++) {
              if (CRY_ACTIONS.indexOf(a.actions[j].id) >= 0) { isCry = true; break; }
            }
          }
          if (isCry && this.hasAbility(a.id)) out.push({ id: a.id, name: a.name || a.id });
        }
      } catch (e) {}
      return out;
    },

    aidCry(abilityId, targetId) {
      var crisis = this.aidCrisis();
      if (!crisis) return null;
      var ab = null;
      var cries = this.aidCryAbilities();
      for (var i = 0; i < cries.length; i++) if (cries[i].id === abilityId) ab = cries[i];
      if (!ab) {
        this.say('You don\'t have a cry that carries — no shout, no flare, no beast-call in your build. (Earn one, and the door gets louder.)');
        return 'gated';
      }
      var links = _links(this);
      if (!links.length) {
        this.say('The cry tears out of you — and finds no linked fire to land on. Haven stands alone.');
        return 'nolink';
      }
      if (!targetId || !this.linkWith(targetId)) {
        var best = null, bd = 1e9, self = this;
        links.forEach(function (l) {
          var o = _otherId(self, l);
          var d = self.aidDistance(o);
          if (d < bd) { bd = d; best = o; }
        });
        targetId = best;
      }
      try { this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 30); } catch (e) {}
      try { this.tickAction(2); } catch (e) {}
      this.say('You let out the ' + ab.name + ' — it punches through the treeline like a thrown spear. ' + _vname(this, targetId) + ' will hear the TRUTH of it, fast. No smoke, no translation, no road.');
      var res = this.aidAskVillage(targetId, 'cry', { cry: true });
      crisis.calls.push({ tier: 'cry', day: _day(this), part: _part(this), targetId: targetId, ability: abilityId, result: res });
      return res;
    },

    // ---------- WHO ANSWERS ----------

    // aidAskVillage: the far end decides — aloud, fast, never silent.
    // msg: {garbled, softened, cry}. Returns accepted|refused|nolink.
    aidAskVillage(villageId, via, msg) {
      msg = msg || {};
      var ov = null, link = null;
      try { ov = this._otherVillage(villageId); } catch (e) {}
      try { link = this.linkWith(villageId); } catch (e) {}
      var vn = _vname(this, villageId);
      var sp = _speakerName(this, villageId);
      if (!link || link.status !== 'active') {
        this.say('The ask has nowhere to land — ' + vn + ' isn\'t one organization with Haven. (No link, no call.)');
        return 'nolink';
      }
      if (via === 'runner' && msg.runnerName) {
        this.say(msg.runnerName + ' stumbles into ' + vn + ', half-dead from the road — Haven\'s plea in hand.');
      }
      // STANDING >= THE ASK.
      if ((link.trust || 0) < AID_ASK_TRUST) {
        this.say('"' + vn + ' asks a lot for trust ' + (link.trust || 0) + '," says ' + sp + '. "Come back with more than ' + (via === 'signal' ? 'smoke' : 'words') + '." They stay home.');
        try { this._linkNote(link, 'aid', 'Refused Haven\'s call (' + via + '): trust ' + (link.trust || 0) + ' < ask ' + AID_ASK_TRUST + '.'); } catch (e) {}
        return 'refused';
      }
      // THEIR SITUATION: a village mid-crisis can't come — said aloud.
      if (ov && ov.crisis) {
        this.say('"Our own door has teeth in it," says ' + sp + ' of ' + vn + '. "We cannot come. May your door hold." (Refused — their crisis, not your standing.)');
        try { this._linkNote(link, 'aid', 'Could not answer (' + via + '): mid-crisis at their own door.'); } catch (e) {}
        return 'refused';
      }
      var crisis = this.aidCrisis();
      var wave = crisis ? (crisis.wave || 1) : 1;
      var score = (link.trust || 0) + R() * 24 - 12;
      if (via === 'signal') score -= 5;          // smoke asks smell of panic
      if (msg.softened) score -= 12;            // the holder softened the plea
      if (wave >= 3) score -= 10;               // they know what wave 3 means
      if (score < 45) {
        var reasons = [
          '"Our foragers can\'t leave the fields — not for this," says ' + sp + '.',
          '"' + vn + ' has its own mouths," says ' + sp + '. "We\'re sorry. Truly."',
          'says ' + sp + ', not meeting the plea\'s eyes: "We don\'t believe the teeth are that big. Come back when they are."',
        ];
        this.say(reasons[Math.floor(R() * reasons.length)] + ' (Refused — the ask didn\'t carry.)');
        try { this._linkNote(link, 'aid', 'Refused Haven\'s call (' + via + '): the ask didn\'t carry.'); } catch (e) {}
        return 'refused';
      }
      // ACCEPTED: a capped party, led by a named face, marches real day-parts.
      var partySize = Math.min(PARTY_CAP, 2 + Math.floor((link.trust || 0) / 40));
      if (msg.garbled) partySize = Math.max(1, Math.min(PARTY_CAP, partySize + [-1, 0, 1, 2][Math.floor(R() * 4)]));
      var leader = this.aidFaceFor(villageId);
      var faces = [leader.name];
      try {
        var all = (ov && ov.aidFaces) || [];
        for (var fi = 1; fi < all.length && faces.length < 3; fi++) faces.push(all[fi].name);
      } catch (e) {}
      var parts = via === 'system' ? 1 : via === 'cry' ? 0 : this.aidPartsFor(villageId);
      var help = {
        villageId: villageId, via: via, partySize: partySize,
        leader: leader.name, leaderId: leader.id, faces: faces,
        partsLeft: parts, garbled: !!msg.garbled, askedDay: _day(this),
      };
      this.state.pendingHelp = this.state.pendingHelp || [];
      this.state.pendingHelp.push(help);
      // COST TO THEM: their foragers leave their fields — remembered in
      // trust or in tribute owed.
      var debt = partySize * 1200;
      if ((link.trust || 0) >= 60) {
        link.trust = Math.min(100, (link.trust || 0) + 3);
        this.say('"Old friends don\'t count the grain," says ' + leader.name + ' of ' + vn + '. "' + partySize + ' of us — we\'re coming. Hold the door." (Trust ' + link.trust + ' — the cost lands in trust, not tribute.)');
      } else {
        link.aidDebtKcal = (link.aidDebtKcal || 0) + debt;
        try { this._linkNote(link, 'aid', 'Sent ' + partySize + ' to Haven\'s aid (' + via + '). Debt +' + debt + ' kcal — foragers off their fields.'); } catch (e) {}
        this.say('"Our foragers leave our fields," says ' + leader.name + ' of ' + vn + '. "' + partySize + ' of us — give us ' + parts + ' day-part' + (parts === 1 ? '' : 's') + '. Remember it: ' + debt.toLocaleString() + ' kcal of work, or the trust of it."');
      }
      if (msg.garbled) this.say('(What they heard was the System\'s version. ' + leader.name + ' is bringing ' + partySize + ' — for "a small teeth problem." We\'ll see.)');
      return 'accepted';
    },

    // aidFaceFor: one of the village's ~3 named faces — consistent across
    // calls. The speaker first; then the village's own small cast.
    aidFaceFor(villageId) {
      try {
        var link = this.linkWith(villageId);
        if (link && link.theirSpeaker && link.theirSpeaker.name) {
          return { id: link.theirSpeaker.id, name: link.theirSpeaker.name };
        }
      } catch (e) {}
      var ov = null;
      try { ov = this._otherVillage(villageId); } catch (e) {}
      if (!ov) return { id: 'aidface_unknown', name: 'Someone' };
      ov.aidFaces = ov.aidFaces || [];
      while (ov.aidFaces.length < 3) {
        var nm = 'Someone';
        try { nm = this.genNameForOrigin('village', true); } catch (e) {}
        ov.aidFaces.push({ id: 'aidface_' + villageId + '_' + ov.aidFaces.length, name: nm });
      }
      return ov.aidFaces[0];
    },

    // aidHelpArrived: the party walks in — through people, aloud.
    aidHelpArrived(help) {
      var crisis = this.aidCrisis();
      var vn = _vname(this, help.villageId);
      if (!crisis || crisis.resolved) {
        this.say(help.leader + ' of ' + vn + ' reaches Haven\'s grounds — and the door is quiet. Finished or false alarm; they turn home. (No silent anything.)');
        return 'stood-down';
      }
      crisis.helpAtDoor = crisis.helpAtDoor || [];
      crisis.helpAtDoor.push({
        villageId: help.villageId, partySize: help.partySize,
        leader: help.leader, faces: help.faces, garbled: help.garbled,
      });
      var link = null;
      try { link = this.linkWith(help.villageId); } catch (e) {}
      if (link) link.trust = Math.min(100, (link.trust || 0) + 2);
      this.say('🥁 ' + help.leader + ' of ' + vn + ' walks in with ' + help.partySize + ' — ' + help.faces.join(', ') + '. "We\'re here. Where\'s the teeth?" (They showed up. Trust remembers.)');
      try { if (this.ledgerAdd) this.ledgerAdd('comms', 'aid-arrived:' + help.villageId + ':' + help.partySize); } catch (e) {}
      return 'arrived';
    },

    // repayAidDebt: the books, settled aloud. Partial payment is honored.
    repayAidDebt(linkId) {
      var link = null;
      try {
        var ls = this.hierarchyState();
        for (var i = 0; i < ls.length; i++) if (ls[i].id === linkId) link = ls[i];
      } catch (e) {}
      if (!link) { this.say('No such link on the books.'); return null; }
      var owed = link.aidDebtKcal || 0;
      if (owed <= 0) { this.say('The books are clean — ' + _vname(this, _otherId(this, link)) + ' is owed nothing for their aid.'); return 'clean'; }
      var paid = 0;
      try { paid = this._removePantryKcal(owed); } catch (e) {}
      link.aidDebtKcal = Math.max(0, owed - paid);
      if (link.aidDebtKcal <= 0) {
        link.trust = Math.min(100, (link.trust || 0) + 3);
        try { this._linkNote(link, 'aid', 'Aid debt repaid in full: ' + paid.toLocaleString() + ' kcal. Trust +3.'); } catch (e) {}
        this.say('Paid in full — ' + paid.toLocaleString() + ' kcal to ' + _vname(this, _otherId(this, link)) + '. The debt dies aloud, and trust grows teeth of its own. (+3)');
      } else {
        try { this._linkNote(link, 'aid', 'Aid debt partially repaid: ' + paid.toLocaleString() + ' kcal. ' + link.aidDebtKcal.toLocaleString() + ' kcal still owed.'); } catch (e) {}
        this.say('Partial — ' + paid.toLocaleString() + ' kcal of ' + owed.toLocaleString() + '. ' + _vname(this, _otherId(this, link)) + ' counts it, and counts what\'s left: ' + link.aidDebtKcal.toLocaleString() + ' kcal.');
      }
      return 'repaid';
    },

    // ---------- THE FIGHT (blow-by-blow, never a table) ----------

    // aidFight: the crisis fight with arrived allies as REAL combatants.
    aidFight(vid, mdef, m, opts) {
      opts = opts || {};
      var crisis = this.aidCrisis();
      var present = crisis ? (crisis.helpAtDoor || []) : [];
      if (present.length) {
        opts.allies = present.length;
        opts.allyVids = [];
        opts.foreignAllies = {};
        for (var i = 0; i < present.length; i++) {
          var p = present[i];
          var pid = 'aid:' + p.villageId + ':' + i;
          opts.allyVids.push(pid);
          opts.foreignAllies[pid] = { villageId: p.villageId, face: p.leader, name: p.leader };
        }
        opts.allyName = present[0].leader;
        opts.allyFromStart = true; // they came to fight, not to watch
      }
      if (crisis && crisis.attracted) opts.packBonus = crisis.attracted; // the smoke drew company
      var rec = null;
      try { rec = this.fieldFight(vid, mdef, m, opts); } catch (e) { return null; }
      if (crisis && rec && (rec.outcome === 'vKill' || rec.outcome === 'mFlee')) {
        this.say('The teeth break. The door holds — with ' + (present.length ? present.map(function (q) { return q.leader; }).join(' and ') + ' standing in Haven\'s dirt' : 'nobody\'s help but Haven\'s own') + '.');
        this.resolveAidCrisis('fought');
      }
      return rec;
    },

    // aidAllyDown: their blood on our doorstep. Called by fieldFight.
    aidAllyDown(villageId, face, allyName) {
      var link = null;
      try { link = this.linkWith(villageId); } catch (e) {}
      var vn = _vname(this, villageId);
      this.say((allyName || face || 'Their fighter') + ' of ' + vn + ' goes down in Haven\'s dirt. The ' + vn + ' party drags them clear — or doesn\'t. This will be sung about, badly, by both fires.');
      if (link) {
        link.trust = Math.max(0, (link.trust || 0) - 6);
        link.aidDebtKcal = Math.max(0, (link.aidDebtKcal || 0) - 1000);
        try { this._linkNote(link, 'aid', (allyName || face) + ' fell at Haven\'s door. Trust -6; 1,000 kcal of aid debt forgiven — paid in blood.'); } catch (e) {}
        this.say('They paid in blood. ' + vn + ' will remember — trust falls, and 1,000 kcal of what Haven owed is forgiven.');
      }
      try { if (this.journalNote) this.journalNote('village', 'aid', (allyName || face) + ' of ' + vn + ' fell at Haven\'s door.'); } catch (e) {}
      return true;
    },

    // ---------- THE TICK ----------

    // commsTick: runners walk, help marches, foreign doors rattle, the
    // officeholder's stage rides the scale ladder, the System collects.
    // Chain-wrapped onto advancePart.
    commsTick() {
      var day = _day(this);
      // RUNNERS
      var runners = this.state.aidRunners || [];
      for (var i = runners.length - 1; i >= 0; i--) {
        var rn = runners[i];
        rn.partsLeft--;
        if (rn.partsLeft > 0) continue;
        var vn = _vname(this, rn.targetId);
        var fn = _first(this, rn.vid);
        if (rn.phase === 'out') {
          var res = this.aidAskVillage(rn.targetId, 'runner', { runnerName: fn, softened: !!(rn.msg && rn.msg.softened) });
          if (res === 'accepted') {
            runners.splice(i, 1); // travels home with the party
          } else {
            rn.phase = 'back';
            rn.partsLeft = rn.parts;
            var route = { decision: 'routed', delay: 0 };
            try { route = this.switchboardRoute({ kind: 'return-news', accepted: false, text: 'refused', targetId: rn.targetId }) || route; } catch (e) {}
            rn.route = route;
            if (route.decision === 'delayed') rn.partsLeft += 1;
            this.say(fn + ' turns home from ' + vn + ' — empty-handed.');
          }
        } else {
          var news = 'empty-handed — ' + vn + ' said no.';
          if (rn.route && rn.route.decision === 'edited') {
            var hn = 'the relay';
            try { hn = _first(this, this.switchboard().holderId); } catch (e) {}
            news = '"they\'re thinking it over," ' + hn + ' says. (The relay log tells a shorter story: they said no.)';
          } else if (rn.route && rn.route.decision === 'delayed') {
            news += ' (The word came a day-part late — the relay sat on it.)';
          }
          this.say(fn + ' is back from ' + vn + ' — ' + news);
          runners.splice(i, 1);
        }
      }
      // MARCHING HELP
      var ph = this.state.pendingHelp || [];
      for (var j = ph.length - 1; j >= 0; j--) {
        ph[j].partsLeft--;
        if (ph[j].partsLeft <= 0) {
          var h = ph.splice(j, 1)[0];
          try { this.aidHelpArrived(h); } catch (e) {}
        }
      }
      try { this.foreignCrisisTick(); } catch (e) {}
      try { this.switchboardStageTick(); } catch (e) {}
      // THE SYSTEM COLLECTS.
      try { this.collectSystemFavor(); } catch (e) {}
      // RAID-RAISED CRISES (util audit 2026-10-10): a raid raises the crisis
      // (havenGrowth.js); it resolves 'fought' when no lingering raiders
      // hold the treeline anymore. Only for raid-raised crises (crisis.raiders),
      // and only once the crisis is 3+ parts old — the village looked to YOU,
      // so you get a real chance to answer (call, fight, or let the
      // defenders' work stand) before the door is declared quiet.
      var crisis = this.aidCrisis();
      if (crisis && !crisis.resolved && crisis.raiders) crisis.ageParts = (crisis.ageParts || 0) + 1;
      if (crisis && !crisis.resolved && crisis.raiders && (crisis.ageParts || 0) >= 3) {
        var threat = false;
        try {
          var vv = this.state.village || {};
          var hx2 = (vv.px !== undefined && vv.px !== null) ? vv.px : 4;
          var hy2 = (vv.py !== undefined && vv.py !== null) ? vv.py : 4;
          var ms2 = this.worldMonsters ? this.worldMonsters() : [];
          for (var i = 0; i < ms2.length; i++) {
            var mm = ms2[i];
            if (mm && mm.lingering && mm.tx === hx2 && mm.ty === hy2 && (mm.hp || 0) > 0) { threat = true; break; }
          }
        } catch (e) {}
        if (!threat) this.resolveAidCrisis('fought');
      }
      // SAFETY VALVE: a crisis that outlives attention moves on.
      if (crisis && !crisis.resolved && day - crisis.sinceDay > 6) {
        // the raiders drift off with the crisis — the treeline goes quiet
        try {
          var ms3 = this.worldMonsters ? this.worldMonsters() : [];
          for (var k = 0; k < ms3.length; k++) if (ms3[k] && ms3[k].lingering) ms3[k].lingering = false;
        } catch (e) {}
        this.resolveAidCrisis('moved-on');
      }
    },

    // foreignCrisisTick: other villages live their own game — doors rattle
    // reactively (seeded), never on a calendar.
    foreignCrisisTick() {
      var ovs = [];
      try { ovs = this.state.otherVillages || []; } catch (e) { return; }
      for (var i = 0; i < ovs.length; i++) {
        var ov = ovs[i];
        if (!ov || ov.id === HOME) continue;
        var known = false, linked = false;
        try { known = this.knowsVillage(ov); linked = !!this.linkWith(ov.id); } catch (e) {}
        if (!known) continue;
        if (ov.crisis) {
          ov.crisis.parts--;
          if (ov.crisis.parts <= 0) {
            ov.crisis = null;
            if (linked) this.say('Word with the traders: ' + (ov.name || 'their') + ' door is clear again. Whatever had them, let go.');
          }
          continue;
        }
        if (R() < 0.015) {
          ov.crisis = { kind: 'monster', parts: 2 + Math.floor(R() * 4) };
          if (linked) this.say('Riders from ' + (ov.name || 'the other fire') + ': something\'s at THEIR door now. They can\'t spare anyone — and they wanted Haven to know first.');
        }
      }
    },

    // collectSystemFavor: the favor owed comes due — as a played demand.
    collectSystemFavor() {
      var owed = 0;
      try { owed = this.state.systemFavorsOwed || 0; } catch (e) {}
      if (owed <= 0 || this.state.pendingSystemFavor) return null;
      if (R() >= 0.04) return null;
      this.state.pendingSystemFavor = { day: _day(this), demandKcal: 1500 };
      this.say('🔔 The System clears its throat. "About that favor you owe me — the relay wasn\'t free. 1,500 kcal of tribute, or we discuss what \'enthusiasm\' costs." (Answer: answerSystemFavor("pay") or ("refuse").)');
      return this.state.pendingSystemFavor;
    },

    answerSystemFavor(how) {
      var p = null;
      try { p = this.state.pendingSystemFavor; } catch (e) {}
      if (!p) { this.say('The System isn\'t asking. (It will.)'); return null; }
      this.state.pendingSystemFavor = null;
      this.state.systemFavorsOwed = Math.max(0, (this.state.systemFavorsOwed || 0) - 1);
      if (how === 'pay') {
        var paid = 0;
        try { paid = this._removePantryKcal(p.demandKcal); } catch (e) {}
        if (paid >= p.demandKcal) {
          this.say('Paid — 1,500 kcal into the System\'s nowhere. The books balance. (Somewhere, something nods.)');
        } else {
          this.say('The pantry only held ' + paid.toLocaleString() + ' kcal — the System takes it and notes the shortfall. It will remember differently.');
        }
      } else {
        try { this.state.scholar.integration = Math.max(0, (this.state.scholar.integration || 0) - 3); } catch (e) {}
        try { if (this.leadShift) this.leadShift('systemDefiant', 1); } catch (e) {}
        this.say('You refuse. The System goes very quiet — the cold kind. Integration slips. It will remember this differently than you do.');
      }
      return how;
    },

    // ---------- THE SWITCHBOARD OFFICE ----------

    switchboard() {
      try { return this.state.switchboard || null; } catch (e) { return null; }
    },

    // The office arrives with the regional game.
    switchboardAvailable() {
      try { return !!this.state.networkLive && !this.switchboard(); } catch (e) { return false; }
    },

    // switchboardCandidates: every candidate costs something different —
    // computed from who they actually are, said aloud up front.
    switchboardCandidates() {
      var out = [];
      try {
        var roster = (this.state.village.roster || []);
        var self = this;
        var holderId = null;
        try { holderId = (this.switchboard() || {}).holderId || null; } catch (e) {}
        var cands = roster.filter(function (id) {
          return id !== self.villagerId && id !== holderId && self.isMember(id) && !self.aidRunnerAway(id);
        });
        var talks = cands.map(function (id) { var t = 0; try { t = self.linkStanding(id); } catch (e) {} return { id: id, t: t }; });
        var works = cands.map(function (id) { var w = 0; try { w = self.agencyScore(id); } catch (e) {} return { id: id, w: w }; });
        var maxTalk = -1e9, minWork = 1e9;
        talks.forEach(function (x) { if (x.t > maxTalk) maxTalk = x.t; });
        works.forEach(function (x) { if (x.w < minWork) minWork = x.w; });
        cands.forEach(function (id) {
          var talk = 0, work = 0, honest = 0, temp = 'steady';
          try { talk = self.linkStanding(id); } catch (e) {}
          try { work = self.agencyScore(id); } catch (e) {}
          try { honest = (self.repOf(id) || {}).honest || 0; } catch (e) {}
          try { temp = self.npcTemper(id); } catch (e) {}
          var isTalker = talk >= maxTalk && cands.length > 1;
          var isWeakest = work <= minWork && cands.length > 1;
          var cost = 'Haven loses their hands — no forage, no runner duty, no moot vote while they run the relay.';
          if (isTalker) cost = 'BEST TALKER: the moots lose their voice — trial swing -8 while they hold the relay.';
          else if (isWeakest) cost = 'WEAKEST FORAGER: the appointment stings — a free rider honored. Resentment (village mood -8 for 14 days, trust toward them -10).';
          var corrupt = honest <= -10;
          out.push({
            id: id, name: _first(self, id), talk: talk, work: work,
            isTalker: isTalker, isWeakest: isWeakest, corrupt: corrupt,
            temper: temp, cost: cost,
            risk: corrupt ? 'HIGH — they\'ve been called scheming. The relay would be in scheming hands.' :
              (temp === 'prickly' || temp === 'intense') ? 'WATCH — they read every word twice. The relay would be... thorough.' : 'Steady hands.',
          });
        });
      } catch (e) {}
      return out;
    },

    // appointSwitchboard: public, televised, and the village reacts.
    appointSwitchboard(vid) {
      if (!this.switchboardAvailable()) {
        if (this.switchboard()) this.say('The relay already has hands — ' + _first(this, this.switchboard().holderId) + ' holds it.');
        else this.say('The relay is a regional thing — Haven isn\'t networked yet. (Link a village first.)');
        return null;
      }
      var cands = this.switchboardCandidates();
      var c = null;
      for (var i = 0; i < cands.length; i++) if (cands[i].id === vid) c = cands[i];
      if (!c) { this.say('They\'re not available for the relay — not here, not hale, or already on the road.'); return null; }
      var day = _day(this);
      this.state.switchboard = {
        holderId: vid, appointedDay: day, stage: 'village relay',
        routed: 0, delayed: 0, edited: 0, skimmed: 0, log: [],
        mootVoiceLost: !!c.isTalker, lastLeadDay: -1,
      };
      // The appointment beat is answered — clear the pending flag.
      try { this.state.pendingSwitchboard = null; } catch (e) {}
      try { this.tickAction(16); } catch (e) {}
      // TELEVISED APPOINTMENT BEAT.
      try {
        this.sysSay('🔴 LIVE! THE RELAY! Haven names its voice — every message in and out passes through ONE pair of hands! The galaxy leans in!');
      } catch (e) {}
      this.say('📡 The village gathers. The System names ' + c.name + ' — Holder of the Relay. Every message in and out of Haven passes through their hands now: runners\' pleas, traders\' word, all of it. They can carry, hurry, sit on, or REWRITE what passes. Choose who holds the words carefully — you just did.');
      // THE COST, HONEST AND UP FRONT.
      if (c.isTalker) this.say('The cost, said aloud: ' + c.name + ' argued Haven\'s cases at the moots. The moots just lost their voice — trial swing -8 while they hold the relay.');
      else if (c.isWeakest) {
        this.say('The cost, said aloud: ' + c.name + ' was the weakest forager, and everyone knows it. The appointment stings — resentment moves through the fire like smoke.');
        try {
          var v = this.state.village;
          v.moodMods = v.moodMods || [];
          v.moodMods.push({ kind: 'resentment', amt: -8, untilDay: day + 14, why: 'relay appointment' });
          var t = v.trust || (v.trust = {});
          t[vid] = Math.max(0, (t[vid] || 10) - 10);
        } catch (e) {}
      } else {
        this.say('The cost, said aloud: Haven loses ' + c.name + '\'s hands — no forage, no runner duty, no moot vote while they run the relay.');
      }
      // THE VILLAGE REACTS: pride, resentment, fear.
      try {
        var vt = this.state.village.trust || (this.state.village.trust = {});
        if (c.corrupt) {
          this.say('Fear moves too — ' + c.name + ' has been called scheming, and now they hold every word. Nobody says it. Everybody thinks it.');
          vt[this.villagerId] = Math.max(0, (vt[this.villagerId] || 10) - 5);
        } else if (!c.isWeakest) {
          this.say('Pride moves through the fire — ' + c.name + ' stands straighter. An honor, honestly earned.');
          vt[vid] = Math.min(100, (vt[vid] || 10) + 5);
        }
      } catch (e) {}
      try { if (this.leadShift) this.leadShift('showmanship', 1); } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('comms', 'switchboard:' + vid); } catch (e) {}
      return this.state.switchboard;
    },

    removeSwitchboard(why) {
      var sw = this.switchboard();
      if (!sw) return null;
      var nm = _first(this, sw.holderId);
      this.state.switchboard = null;
      this.say('📡 ' + nm + ' is out of the relay — ' + (why || 'done') + '. The messages go back to runners and smoke, unheld.');
      // The office stands vacant — the appointment beat returns.
      try {
        if (this.switchboardAvailable && this.switchboardAvailable()) {
          this.state.pendingSwitchboard = { day: _day(this) };
        }
      } catch (e) {}
      return true;
    },

    // switchboardTalkerCost: read by the moot tally — the moots lost their voice.
    switchboardTalkerCost() {
      var sw = this.switchboard();
      return !!(sw && sw.mootVoiceLost);
    },

    // switchboardRoute: every carried message passes through the holder's
    // hands. They can carry, hurry, sit on, or rewrite it. Returns
    // {decision, delay, msg}.
    switchboardRoute(msg) {
      msg = msg || {};
      var sw = this.switchboard();
      if (!sw) return { decision: 'routed', delay: 0, msg: msg };
      var holder = sw.holderId;
      var hn = _first(this, holder);
      var honest = 0, temp = 'steady';
      try { honest = (this.repOf(holder) || {}).honest || 0; } catch (e) {}
      try { temp = this.npcTemper(holder); } catch (e) {}
      var r = R(), r2 = R();
      var decision = 'routed';
      if (honest >= 10) { if (r < 0.15) decision = 'priority'; }
      else if (honest <= -10) { if (r < 0.35) decision = 'edited'; else if (r < 0.60) decision = 'delayed'; }
      else { if (r < 0.08) decision = 'delayed'; else if (r < 0.12) decision = 'edited'; }
      if (decision === 'routed' && temp === 'cautious' && msg.kind === 'return-news' && msg.accepted === false && r2 < 0.25) decision = 'delayed';
      var day = _day(this);
      if (decision === 'priority') {
        sw.routed++;
        this.say('📡 ' + hn + ' pushes it to the front of the relay — no waiting. The words fly.');
        if (sw.lastLeadDay !== day) { sw.lastLeadDay = day; try { if (this.leadShift) this.leadShift('diplomacy', 1); } catch (e) {} }
        return { decision: 'priority', delay: -1, msg: msg };
      }
      if (decision === 'delayed') {
        sw.delayed++;
        this.say('📡 ' + hn + ' sits on it — "the road wasn\'t right." It goes out a day-part late. (The relay log notes the delay.)');
        sw.log.push({ day: day, kind: msg.kind, decision: 'delayed' });
        return { decision: 'delayed', delay: 1, msg: msg };
      }
      if (decision === 'edited') {
        sw.edited++;
        if (msg.kind === 'aid-call') msg.softened = true;
        if (msg.kind === 'return-news') msg.softenedNews = true;
        sw.log.push({ day: day, kind: msg.kind, decision: 'edited', note: 'softened' });
        try { if (this.leadShift) this.leadShift('fracture', 1); } catch (e) {}
        if (r2 < 0.5) {
          this.say('📡 The message came back wrong — softened, sanded down, somebody\'s hand in it. ' + hn + ' won\'t meet your eyes. (It\'s in the relay log, if you look.)');
        } else {
          this.say('📡 ' + hn + ' "chooses the words carefully." (The relay log will tell you what that cost — later.)');
        }
        return { decision: 'edited', delay: 0, msg: msg };
      }
      sw.routed++;
      if (sw.lastLeadDay !== day) { sw.lastLeadDay = day; try { if (this.leadShift) this.leadShift('diplomacy', 1); } catch (e) {} }
      return { decision: 'routed', delay: 0, msg: msg };
    },

    // switchboardStageTick: the office's mini-progression rides the scale
    // ladder — never a skill tree.
    switchboardStageTick() {
      var sw = this.switchboard();
      if (!sw) return null;
      var rank = 'village';
      try { rank = this.scaleRank(); } catch (e) {}
      var view = 0;
      try { view = this.havenViewership(); } catch (e) {}
      var want = 'village relay';
      if (view >= 40) want = 'a name the planet knows';
      else if (rank === 'global') want = 'national voice';
      else if (rank === 'national') want = 'regional switchboard';
      if (want === sw.stage) return null;
      sw.stage = want;
      var hn = _first(this, sw.holderId);
      var lines = {
        'regional switchboard': '📡 The relay grows teeth: ' + hn + ' isn\'t just Haven\'s voice anymore — the REGION\'s switchboard runs through their hands. Villages that never met Haven know the name.',
        'national voice': '📡 ' + hn + ' speaks and the polity listens — the national voice, carried on every fire\'s gossip. Televised, of course. Everything is, now.',
        'a name the planet knows': '📡 The planet knows ' + hn + '\'s name. Strangers light fires hoping the relay will carry THEIR words. The office outgrew the village — the village just hasn\'t noticed yet.',
      };
      var line = lines[want] || ('📡 The relay changes shape: ' + hn + ' is now ' + want + '.');
      try { this.sysSay('🔴 LIVE: THE RELAY GROWS — ' + hn.toUpperCase() + ', ' + want.toUpperCase() + '!'); } catch (e) {}
      this.say(line);
      try { if (this.ledgerAdd) this.ledgerAdd('comms', 'switchboard-stage:' + want); } catch (e) {}
      return want;
    },

    // confrontSwitchboard: the log is evidence. A baseless confrontation
    // costs the accuser — false accusations have social consequences.
    confrontSwitchboard() {
      var sw = this.switchboard();
      if (!sw) { this.say('There\'s no office to confront — the relay has no holder.'); return null; }
      var hn = _first(this, sw.holderId);
      if (!sw.edited) {
        this.say('You lay the relay log on the fire — it\'s clean. ' + hn + ' watches you read every line. The accusation dies in your throat, and the whole village saw you make it.');
        try {
          var t = this.state.village.trust || (this.state.village.trust = {});
          t[this.villagerId] = Math.max(0, (t[this.villagerId] || 10) - 8);
        } catch (e) {}
        try { if (this.leadShift) this.leadShift('fracture', 1); } catch (e) {}
        return 'baseless';
      }
      var honest = 0;
      try { honest = (this.repOf(sw.holderId) || {}).honest || 0; } catch (e) {}
      var admits = honest < 0 || R() < 0.4;
      if (admits) {
        this.say(hn + ' doesn\'t deny it. "' + sw.edited + ' messages. I chose the words. Some words shouldn\'t travel raw — you\'d know that if you\'d ever carried them." The fire is very quiet.');
      } else {
        this.say(hn + ' denies it — but the log doesn\'t. ' + sw.edited + ' softened messages, in their hand. The village believes the log.');
      }
      try {
        var t2 = this.state.village.trust || (this.state.village.trust = {});
        t2[sw.holderId] = Math.max(0, (t2[sw.holderId] || 10) - 15);
      } catch (e) {}
      try { if (this.leadShift) this.leadShift('fracture', 1); } catch (e) {}
      this.removeSwitchboard('fired for editing the relay');
      return admits ? 'confessed' : 'denied';
    },

    // switchboardLog: read the relay log aloud — evidence, not accusation.
    // (parity 2026-10-10: the office existed but had no UI surface; the log
    // is the discoverability half of the corruption surface. Reading is
    // safe; CONFRONTING on a clean log costs the accuser.)
    switchboardLog() {
      var sw = this.switchboard();
      if (!sw) { this.say('There\'s no office — the relay has no holder.'); return null; }
      var hn = _first(this, sw.holderId);
      var log = sw.log || [];
      this.say('📡 The relay log, in ' + hn + '\'s hand: ' + (sw.routed || 0) + ' routed, ' + (sw.delayed || 0) + ' delayed, ' + (sw.edited || 0) + ' edited.');
      if (!log.length) { this.say('(Nothing but clean carries. So far.)'); return 'clean'; }
      var recent = log.slice(-6);
      for (var i = 0; i < recent.length; i++) {
        var e = recent[i];
        this.say('· day ' + (e.day || '?') + ' — ' + (e.kind || 'a message') + ': ' + (e.decision || 'carried') + (e.note ? ' (' + e.note + ')' : '') + '.');
      }
      return 'read';
    },

  };

  for (var k in methods) { if (methods.hasOwnProperty(k)) G[k] = methods[k]; }

  // commsTick rides advancePart — runners walk, help marches, doors rattle.
  var _advancePartC = G.advancePart;
  if (_advancePartC) G.advancePart = function () {
    var r = _advancePartC.apply(this, arguments);
    try { if (this.commsTick) this.commsTick(); } catch (e) {}
    return r;
  };

})();
