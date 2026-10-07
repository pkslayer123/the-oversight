// @ontology
// system: alienPlayers
// description: Late-game sentient aliens inhabiting combat avatars. Sadistic trophy hunters, neutral participants, and benevolent sympathizers — with off-screen rivals, secret allies, fan favor, and the System as referee.
// provides:
//   - apState()
//   - apEligible()
//   - apMaybeInhabit(monsterId, mdef)
//   - apCombatIntro(pilot, mdef)
//   - apOnCombatEnd(pilot, outcome)
//   - apDailyTick()
//   - apFavor()
//   - apAdjustFavor(n, why)
//   - apPilotAffinity(monsterId)
//   - apContestInterference(ac)
//   - apPersonaPackage()
//   - apEventFeed()
//   - apCodexEntry(pid)
//   - apVillageGossip()
//   - apContactedVillager()
//   - apContactWarning()
//   - apKnowsInhabited(pid)
//   - apRevealInhabited(pid, how)
//   - apCarePackage()
// rules:
//   - (gating) inhabited encounters only post-System arrival, wave 2+, ~12% chance per eligible encounter (code: alienPlayers.js)
//   - (knowledge) pilot identity hidden until earned: pilot reveal, System feed slip, or 3rd encounter with same pilot (code: alienPlayers.js)
//   - (limits) dead drops max 1 per 3 days; feed max 1 per day; same-rival hunts min 2 days apart (sporting rules); benevolent help is deniable and subtle (code: alienPlayers.js)
//   - (favor) fan favor -100..100; high favor improves care packages and contest lean; low favor makes the crowd bloodthirsty (code: alienPlayers.js)
//   - (integration) pilots are woven into contests (rigging/lifelines), monster fiction (affinity), codex (discoverable truth), village gossip, and NPC contacts (code: alienPlayers.js)
//   - (people) pilots are PEOPLE: they remember past encounters, escalate or soften, and speak in their own voice (code: alienPlayers.js)
// consumes:
//   - state.systemArrived, unlockedWave(), startCombat (wrapped), tbEnd (wrapped), endDay (wrapped)
//   - sysSay, say, displayName, monsterDisplayName
/* ALIEN PLAYERS — src/js/alienPlayers.js
 *
 * Steve (2026-10-07): "Later game aggressions should also feature highly
 * leveled player characters, and even aliens that inhabit an avatar — they
 * are fully sentient and intelligent monsters, who are really sadistic rich
 * people aliens who are paying their way into playing. Others might be
 * neutral or benevolent and are just here to participate."
 *
 * Three dispositions:
 * - SADISTIC: pay-to-play trophy hunters. Theatrical, cruel, escalating.
 * - NEUTRAL: here for the experience. Unpredictable, not cruel.
 * - BENEVOLENT: think the games are wrong. Help secretly, deniably.
 *
 * Off-screen social layer: rivals remember you, allies leave dead drops,
 * the fan club's favor shapes care packages and contests, and the System
 * enforces sporting rules on everyone — including the aliens.
 */
(function (_g) {
  'use strict';
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;

  // Personas that can pilot a combat avatar. Wren (benevolent) never fights —
  // her avatar is non-combat. She acts only through dead drops and warnings.
  var COMBAT_PILOTS = ['vex_marlowe', 'countess_sable', 'rax_dentist', 'pip_quindle', 'sarge', 'dr_fenwick', 'old_tam'];

  var methods = {
    // ---------- state ----------
    apState: function () {
      var s = this.state;
      s.alienPlayers = s.alienPlayers || {
        met: {},           // pid -> { encounters, lastOutcome, lastDay, bond }
        favor: 0,          // fan club favor, -100..100
        lastDropDay: -999,
        lastFeedDay: -999,
        lastHuntDay: {},   // pid -> day (sporting rules)
        known: {},         // pid -> how the player learned (knowledge gate)
      };
      return s.alienPlayers;
    },

    apEligible: function () {
      try {
        return !!(this.state.systemArrived && this.unlockedWave && this.unlockedWave() >= 2);
      } catch (e) { return false; }
    },

    apPersonas: function () {
      return this.data.alienPlayers || [];
    },

    apPersona: function (pid) {
      var list = this.apPersonas();
      for (var i = 0; i < list.length; i++) if (list[i].id === pid) return list[i];
      return null;
    },

    // ---------- knowledge gating ----------
    apKnowsInhabited: function (pid) {
      return !!(this.apState().known[pid]);
    },

    apRevealInhabited: function (pid, how) {
      var ap = this.apState();
      if (ap.known[pid]) return;
      ap.known[pid] = how || 'revealed';
      var p = this.apPersona(pid);
      if (p && this.state.systemArrived) {
        this.say('◈ You understand now: that wasn\'t a beast. That was ' + p.name + ' — ' + p.title + ' — wearing a monster like a suit. (' + how + ')');
      }
    },

    // ---------- inhabited encounters ----------
    // Called from wrapped startCombat. Returns a persona or null.
    apMaybeInhabit: function (monsterId, mdef) {
      if (!this.apEligible()) return null;
      if (!mdef || (mdef.wave || 1) < 2) return null;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;

      // Rival scheduling: a sadistic rival who's due gets priority (sporting
      // rules — min 2 days between hunts by the same pilot).
      var dueRival = null;
      for (var pid in ap.met) {
        var rec = ap.met[pid];
        var per = this.apPersona(pid);
        if (!per || per.disposition !== 'sadistic') continue;
        if (!COMBAT_PILOTS.includes(pid)) continue;
        if (day - (ap.lastHuntDay[pid] || -999) >= 2 && rec.encounters >= 1) { dueRival = pid; break; }
      }

      var roll = Math.random();
      var chance = dueRival ? 0.20 : 0.12;
      if (roll >= chance) return null;

      var chosen = null;
      if (dueRival && Math.random() < 0.6) {
        chosen = dueRival;
      } else {
        // AFFINITY: some monsters fit some pilots (fiction-matched)
        var affinity = this.apPilotAffinity ? this.apPilotAffinity(monsterId) : null;
        if (affinity && affinity.length && Math.random() < 0.5) {
          // Prefer affinity pilots, but only if they're combat-capable
          var affCombat = affinity.filter(function (pid) { return COMBAT_PILOTS.includes(pid); });
          if (affCombat.length) chosen = affCombat[Math.floor(Math.random() * affCombat.length)];
        }
      }
      if (!chosen) {
        // Weighted by disposition: sadistic 40%, neutral 45%, benevolent (Tam) 15%
        var pool = [];
        var personas = this.apPersonas();
        for (var i = 0; i < personas.length; i++) {
          var cp = personas[i];
          if (!COMBAT_PILOTS.includes(cp.id)) continue;
          var w = cp.disposition === 'sadistic' ? 4 : cp.disposition === 'neutral' ? 4.5 : 1.5;
          // Existing rivals are more likely to return
          if (ap.met[cp.id] && ap.met[cp.id].encounters > 0) w *= 2;
          pool.push({ p: cp, w: w });
        }
        var total = 0, k;
        for (k = 0; k < pool.length; k++) total += pool[k].w;
        var r = Math.random() * total;
        for (k = 0; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) { chosen = pool[k].p.id; break; } }
        if (!chosen && pool.length) chosen = pool[pool.length - 1].p.id;
      }

      if (chosen) ap.lastHuntDay[chosen] = day;
      return chosen;
    },

    apCombatIntro: function (pid, mdef) {
      var p = this.apPersona(pid);
      if (!p) return;
      var ap = this.apState();
      var rec = ap.met[pid] || { encounters: 0 };
      var known = this.apKnowsInhabited(pid);

      if (!known) {
        // MYSTERY: something is wrong with this one, but you don't know what.
        var mystery = [
          'It moves wrong. Too deliberate. Too... amused?',
          'It watches you the way a person watches — not the way a beast does.',
          'There\'s intelligence in its eyes. That\'s new. That\'s wrong.',
        ];
        this.say('👁 ' + mystery[Math.floor(Math.random() * mystery.length)]);
        // 30%: the pilot slips — a very human sound from a monster's throat.
        if (Math.random() < 0.3 && p.taunts && p.taunts.length) {
          this.say('...did it just — no. Monsters don\'t talk. You imagined it.');
        }
        return;
      }

      // KNOWN: the pilot speaks in their own voice.
      var line;
      if (rec.encounters >= 1 && p.escalationLines && p.escalationLines.length) {
        line = p.escalationLines[Math.floor(Math.random() * p.escalationLines.length)];
      } else if (p.introLines && p.introLines.length) {
        line = p.introLines[Math.floor(Math.random() * p.introLines.length)];
      }
      if (line) this.say('🎭 ' + p.name + ': "' + line + '"');
      // Signature behavior note (knowledge-gated coaching)
      if (p.signature) this.say('(' + p.signature + ')');
    },

    apPilotTaunt: function (pid) {
      var p = this.apPersona(pid);
      if (!p || !p.taunts || !p.taunts.length) return;
      if (!this.apKnowsInhabited(pid)) return;
      if (Math.random() < 0.35) {
        this.say('🎭 ' + p.name + ': "' + p.taunts[Math.floor(Math.random() * p.taunts.length)] + '"');
      }
    },

    apOnCombatEnd: function (pid, outcome) {
      var p = this.apPersona(pid);
      if (!p) return;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      var rec = ap.met[pid] || { encounters: 0, bond: 0 };
      rec.encounters++;
      rec.lastOutcome = outcome;
      rec.lastDay = day;

      // Knowledge: 3rd encounter with the same pilot reveals them (pattern recognition)
      if (rec.encounters >= 3 && !ap.known[pid]) {
        this.apRevealInhabited(pid, 'you recognized the fighting style');
      }

      // Pilot-specific outcome lines
      var lines = outcome === 'won' ? p.victoryLines : p.defeatLines;
      if (lines && lines.length && this.apKnowsInhabited(pid)) {
        this.say('🎭 ' + p.name + ': "' + lines[Math.floor(Math.random() * lines.length)] + '"');
      }

      // Fan favor: the audience judges your performance
      if (outcome === 'won') {
        // Stylish wins please the crowd; stomping a tourist doesn't
        var gain = (p.disposition === 'sadistic') ? 6 : (p.id === 'pip_quindle' ? 1 : 4);
        this.apAdjustFavor(gain, 'defeated ' + p.name);
      } else if (outcome === 'lost') {
        this.apAdjustFavor(-2, 'lost to ' + p.name);
      } else if (outcome === 'fled') {
        this.apAdjustFavor(-5, 'fled from ' + p.name + ' — the crowd boos');
      }

      // Benevolent bond deepens
      if (p.disposition === 'benevolent' && outcome === 'won') {
        rec.bond = (rec.bond || 0) + 1;
      }

      ap.met[pid] = rec;
    },

    // ---------- fan favor ----------
    apFavor: function () {
      return this.apState().favor || 0;
    },

    apAdjustFavor: function (n, why) {
      var ap = this.apState();
      ap.favor = Math.max(-100, Math.min(100, (ap.favor || 0) + n));
      if (why && Math.abs(n) >= 3 && this.state.systemArrived) {
        var dir = n > 0 ? '📈' : '📉';
        this.sysSay(dir + ' Fan favor ' + (n > 0 ? '+' : '') + n + ' — ' + why + ' (favor: ' + ap.favor + ')');
      }
    },

    // Care package: the fan club sends supplies. Quality and frequency scale
    // with favor. Deepens the existing "wacky and available, not core" rule.
    apCarePackage: function () {
      var ap = this.apState();
      var favor = ap.favor || 0;
      if (favor < 20) return false; // the crowd doesn't love you enough yet
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastPackageDay || -999) < 4) return false; // max 1 per 4 days

      ap.lastPackageDay = day;
      // Package quality scales with favor
      var tier = favor >= 70 ? 3 : favor >= 40 ? 2 : 1;
      var items = this.data.items || [];
      var cands = items.filter(function (it) {
        return it.alien && (it.tier || 1) <= tier;
      });
      if (!cands.length) cands = items.filter(function (it) { return it.alien; });
      var gift = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;

      // Plus some practical supplies (the fans know you need to eat)
      var kcal = 300 + Math.floor(Math.random() * 400) + favor * 5;

      this.say('📦 A care package drops from the sky with a little parachute. There\'s a note: "WE LOVE YOU! — your fans."');
      if (gift) {
        this.say('Inside: ' + (gift.name || gift.id) + (gift.desc ? ' — ' + gift.desc : ''));
        try {
          var s = this.state.scholar;
          s.pack = s.pack || [];
          s.pack.push({ id: gift.id, name: gift.name || gift.id, qty: 1, alien: true });
        } catch (e) {}
      }
      this.say('Plus ' + kcal + ' kcal of fan-approved snacks.');
      try { this.state.scholar.kcal = (this.state.scholar.kcal || 0) + kcal; } catch (e) {}
      return true;
    },

    // ---------- off-screen: dead drops ----------
    // Benevolent allies leave supplies. Subtle, deniable, limited.
    apDeadDrop: function () {
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day - ap.lastDropDay < 3) return false; // LIMIT: max 1 per 3 days

      // Find a benevolent ally you've met (or Wren, who helps from the start)
      var helper = null;
      var personas = this.apPersonas();
      for (var i = 0; i < personas.length; i++) {
        var per = personas[i];
        if (per.disposition !== 'benevolent') continue;
        if (per.id === 'wren' || (ap.met[per.id] && ap.met[per.id].bond > 0)) { helper = per; break; }
      }
      if (!helper) return false;
      if (Math.random() > 0.5) return false; // they're careful

      ap.lastDropDay = day;
      var line = helper.helpLines && helper.helpLines.length
        ? helper.helpLines[Math.floor(Math.random() * helper.helpLines.length)]
        : '"Supplies. No questions. — a friend."';

      // DENIABLE: small, practical, never tier 3+
      var kcal = 200 + Math.floor(Math.random() * 300);
      this.say('🎁 You find a small bundle tucked where you\'ll find it. No one saw it left there.');
      this.say(line);
      this.say('(' + kcal + ' kcal of dried meat and clean water. Nothing traceable.)');
      try { this.state.scholar.kcal = (this.state.scholar.kcal || 0) + kcal; } catch (e) {}
      return true;
    },

    // ---------- off-screen: System feed ----------
    // You hear what the aliens are saying about you. Gossip, rivalry, odds.
    apFeedMessage: function () {
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day - ap.lastFeedDay < 1) return false; // LIMIT: max 1 per day
      if (Math.random() > 0.4) return false;

      ap.lastFeedDay = day;
      var favor = ap.favor || 0;
      var msgs = [];

      // Rival gossip (sadistic pilots you've met talk about you)
      for (var pid in ap.met) {
        var per = this.apPersona(pid);
        if (per && per.disposition === 'sadistic' && ap.met[pid].encounters > 0) {
          msgs.push('"' + per.name.toUpperCase() + ' was overheard saying the human is "still interesting. For now." The odds on your next fight just shifted."');
          // KNOWLEDGE SLIP: the feed can reveal a pilot's identity
          if (!ap.known[pid] && Math.random() < 0.3) {
            this.apRevealInhabited(pid, 'the System feed named them');
            return true;
          }
        }
      }

      // Fan chatter scales with favor
      if (favor >= 50) {
        msgs.push('"Your fan club is GROWING. There\'s fan art. It\'s... surprisingly good. The System is confused but supportive."');
        msgs.push('"Betting pools favor you 3-to-1 now. The smart money says you\'re learning faster than the monsters."');
      } else if (favor <= -30) {
        msgs.push('"The crowd is getting restless. "BORING," says the feed. The sadistic ones are smiling."');
        msgs.push('"Your approval rating just dropped. Someone in the audience threw a tomato. Through the screen. How."');
      } else {
        msgs.push('"The audience is watching. The gamblers are watching. Everyone\'s watching. No pressure."');
      }

      // Benevolent whispers (deniable)
      var wren = this.apPersona('wren');
      if (wren && Math.random() < 0.2) {
        msgs.push('"A message board post, quickly deleted: \'stay away from the northern treeline tomorrow. trust me.\' — the System claims it saw nothing."');
      }

      if (msgs.length) this.sysSay(msgs[Math.floor(Math.random() * msgs.length)]);
      return true;
    },

    // ---------- daily off-screen tick ----------
    apDailyTick: function () {
      if (!this.apEligible()) return;
      var ap = this.apState();
      // Favor drifts slowly toward 0 (the crowd forgets)
      if (ap.favor > 0) ap.favor = Math.max(0, ap.favor - 1);
      else if (ap.favor < 0) ap.favor = Math.min(0, ap.favor + 1);

      // Off-screen actions (each self-limited by cooldowns)
      try { this.apDeadDrop(); } catch (e) {}
      try { this.apFeedMessage(); } catch (e) {}
      // Care packages are rarer — check every day, gate inside
      try { if (Math.random() < 0.25) this.apCarePackage(); } catch (e) {}
      // Deep integration ticks
      try { this.apVillageGossip(); } catch (e) {}
      try { this.apContactWarning(); } catch (e) {}
      try { if (Math.random() < 0.2) this.apPersonaPackage(); } catch (e) {}
      try { this.apEventFeed(); } catch (e) {}
      // Try to establish a contacted villager
      try { this.apContactedVillager(); } catch (e) {}
    },

    // ============ DEEP INTEGRATION (Steve 2026-10-07) ============
    // Alien players woven into existing systems, not bolted on.

    // Monster-pilot affinity: which existing monsters fit which pilots.
    // Not random — a Hollow Stalker moves like Vex; a pack hunter suits Sarge.
    apPilotAffinity: function (monsterId) {
      var AFFINITY = {
        // Vex Marlowe: theatrical predators, stalkers, things that play with prey
        'nightlight_catfish': ['vex_marlowe'],
        'mirror_stag': ['vex_marlowe', 'countess_sable'],
        'hushwolf': ['vex_marlowe'],
        // Countess Sable: dread-inducers, psychological horrors
        'white_noise_heron': ['countess_sable'],
        'voice_mimic_radio': ['countess_sable'],
        'memory_projector': ['countess_sable'],
        // Rax: things that wound and study
        'belltoad': ['rax_dentist'],
        'lockpick_raccoon': ['rax_dentist'],
        // Pip: curious, clumsy, enthusiastic
        'sunbasker': ['pip_quindle'],
        'speedbump_turtle': ['pip_quindle'],
        'ducks_in_a_row': ['pip_quindle'],
        // Sarge: honorable fighters, pack leaders, soldiers
        'bulldozer': ['sarge'],
        'moderator': ['sarge', 'vex_marlowe'],
        // Dr. Fenwick: observers, mimics, researchers
        'mirrormoth': ['dr_fenwick'],
        'paparazzo': ['dr_fenwick'],
        // Old Tam: old warriors, tired predators
        'gallowdeer': ['old_tam'],
      };
      return AFFINITY[monsterId] || null;
    },

    // ---------- contest integration ----------
    // Alien players interfere in contests: sadistic rigs, benevolent saves,
    // fan favor moves the needle. Called from wrapped _contestVerdict.
    apContestInterference: function (ac) {
      if (!this.apEligible()) return { winMod: 0, deathSave: false, note: null };
      var ap = this.apState();
      var result = { winMod: 0, deathSave: false, note: null };
      var day = (this.state.scholar || {}).day || 1;

      // SADISTIC RIGGING: a rival who's met you may rig the contest
      for (var pid in ap.met) {
        var per = this.apPersona(pid);
        if (!per || per.disposition !== 'sadistic') continue;
        if (ap.met[pid].encounters < 2) continue; // needs a real rivalry
        if (day - (ap.lastRigDay || -999) < 5) continue; // LIMIT: max 1 rig per 5 days
        if (Math.random() < 0.35) {
          ap.lastRigDay = day;
          result.winMod -= 0.12;
          result.note = '📺 ' + per.name + ' is in the judging booth. They\'re smiling. That\'s never good.';
          if (this.apKnowsInhabited(pid)) {
            this.say(result.note + ' "' + (per.taunts[0] || 'Enjoy the show.') + '"');
          } else {
            this.say('📺 One of the judges is smiling too widely. The odds just shifted.');
          }
          break;
        }
      }

      // BENEVOLENT LIFELINE: a bonded ally may save you from death
      if (!result.note) {
        for (var pid2 in ap.met) {
          var per2 = this.apPersona(pid2);
          if (!per2 || per2.disposition !== 'benevolent') continue;
          if ((ap.met[pid2].bond || 0) < 2) continue;
          if (day - (ap.lastLifelineDay || -999) < 7) continue; // LIMIT: max 1 per week
          if (Math.random() < 0.4) {
            ap.lastLifelineDay = day;
            result.deathSave = true;
            result.note = '📺 Somewhere in the control room, a feed cuts to static for exactly three seconds. When it returns, the killing blow... misses. No one can explain it.';
            this.say(result.note);
            break;
          }
        }
      }

      // FAN FAVOR: the crowd's love is real (stacks with existing cheer)
      var favor = ap.favor || 0;
      if (favor >= 40) {
        result.winMod += 0.08;
        this.sysSay('📺 The crowd is CHANTING your name. The judges can hear it. (+8% — the people love you)');
      } else if (favor <= -40) {
        result.winMod -= 0.08;
        this.sysSay('📺 The crowd is BOOING. Someone threw something. The judges look nervous. (-8% — the crowd wants blood)');
      }

      return result;
    },

    // ---------- persona care packages ----------
    // Fans have names now. Sadistic fans send traps. Benevolent send help.
    apPersonaPackage: function () {
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastPersonaPackageDay || -999) < 6) return false; // LIMIT
      if (Math.random() > 0.3) return false;

      // Pick a persona who knows you
      var candidates = [];
      for (var pid in ap.met) {
        if (ap.met[pid].encounters >= 1) candidates.push(pid);
      }
      if (!candidates.length) return false;
      var pid = candidates[Math.floor(Math.random() * candidates.length)];
      var per = this.apPersona(pid);
      if (!per) return false;

      ap.lastPersonaPackageDay = day;

      if (per.disposition === 'sadistic') {
        // CRUEL GIFT: looks helpful, isn't
        this.say('📦 A package arrives, wrapped in black ribbon. The card reads: "With love, ' + per.name + '."');
        this.say('Inside: a beautiful alien medkit. It\'s... ticking? No — it\'s humming. It\'s humming your name.');
        this.say('(It\'s a tracker. ' + per.name + ' now knows where you sleep. You can smash it (lose the medkit) or keep it (they\'re watching).)');
        // Player choice would go here — for now, knowledge-gated warning
        try {
          var s = this.state.scholar;
          s.flags = s.flags || {};
          s.flags.trackedBy = pid; // future systems can use this
        } catch (e) {}
        return true;
      } else if (per.disposition === 'benevolent') {
        // REAL HELP: practical, warm, deniable
        var kcal = 400 + Math.floor(Math.random() * 300);
        this.say('📦 A plain package, no card. Inside: real food, clean bandages, and a note in handwriting you almost recognize:');
        this.say('"Eat. Rest. They\'re watching the skies, not the ground. — a friend"');
        try { this.state.scholar.kcal = (this.state.scholar.kcal || 0) + kcal; } catch (e) {}
        return true;
      } else {
        // NEUTRAL: weird, enthusiastic, mostly harmless
        this.say('📦 A package covered in stickers. The card: "' + per.name + '!! Hope you\'re doing great! Here\'s some stuff from home!"');
        this.say('Inside: snacks that taste like purple, a tiny flag, and a photo of ' + per.name + ' giving a thumbs-up.');
        try { this.state.scholar.kcal = (this.state.scholar.kcal || 0) + 200; } catch (e) {}
        return true;
      }
    },

    // ---------- event-referencing feed ----------
    // The feed talks about YOUR actual game, not generic banter.
    apEventFeed: function () {
      var ap = this.apState();
      var s = this.state.scholar;
      var day = s.day || 1;
      if (day - ap.lastFeedDay < 1) return false;
      if (Math.random() > 0.35) return false;
      ap.lastFeedDay = day;

      var msgs = [];
      var wins = this.state.combatWins || 0;
      var losses = this.state.combatLosses || 0;

      // Reference real outcomes
      if (wins >= 5) {
        msgs.push('"Five wins. FIVE. The human is on a streak and the bookmakers are sweating."');
      }
      if (losses >= 3) {
        msgs.push('"Three losses. The crowd is getting that look. You know the look."');
      }
      // Reference specific rivals
      for (var pid in ap.met) {
        var per = this.apPersona(pid);
        var rec = ap.met[pid];
        if (!per || rec.encounters < 2) continue;
        if (per.disposition === 'sadistic') {
          msgs.push('"' + per.name + ' has requested you specifically for the next exhibition. That\'s... not good."');
        } else if (per.disposition === 'benevolent' && rec.bond > 1) {
          msgs.push('"Someone in the audience keeps voting for you. The System can\'t trace the votes. Curious."');
        }
      }
      // Reference village
      var vcount = (this.state.village && this.state.village.roster || []).length;
      if (vcount >= 10) {
        msgs.push('"Your village is getting big. The audience loves an underdog collective. The gamblers are taking notes."');
      }

      if (msgs.length) {
        this.sysSay(msgs[Math.floor(Math.random() * msgs.length)]);
        return true;
      }
      return false;
    },

    // ---------- codex entries ----------
    // Learning who pilots what is discoverable truth. Codex records it.
    apCodexEntry: function (pid) {
      var p = this.apPersona(pid);
      if (!p) return null;
      this.state.codex = this.state.codex || {};
      this.state.codex.aliens = this.state.codex.aliens || {};
      var entry = this.state.codex.aliens[pid] || {};
      var ap = this.apState();
      var rec = ap.met[pid] || { encounters: 0 };

      entry.name = p.name;
      entry.title = p.title;
      entry.species = p.species;
      entry.disposition = ap.known[pid] ? p.disposition : 'unknown';
      // Progressive disclosure
      if (rec.encounters >= 1) {
        entry.stage = 'encountered';
        entry.note = 'Something piloted that avatar. It moved like a person.';
      }
      if (ap.known[pid]) {
        entry.stage = 'identified';
        entry.note = p.name + ' — ' + p.title + '. ' + p.backstory.slice(0, 200) + '...';
      }
      if (rec.encounters >= 5) {
        entry.stage = 'understood';
        entry.note = p.name + ' — ' + p.title + '. ' + p.backstory + ' Motivation: ' + p.motivation;
      }
      this.state.codex.aliens[pid] = entry;
      return entry;
    },

    // ---------- village reactions ----------
    // Villagers have opinions about the alien players. Affects gossip/morale.
    apVillageGossip: function () {
      if (!this.apEligible()) return false;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastGossipDay || -999) < 2) return false; // LIMIT
      if (Math.random() > 0.4) return false;
      ap.lastGossipDay = day;

      var roster = (this.state.village && this.state.village.roster) || [];
      if (!roster.length) return false;
      var vid = roster[Math.floor(Math.random() * roster.length)];
      var vname = 'Someone';
      try { vname = this.displayName(vid) || 'Someone'; } catch (e) {}

      var lines = [];
      // General awareness (post-System, villagers know about the audience)
      lines.push(vname + ' says: "Do you think they\'re watching right now? The... audience? I try not to think about it."');
      lines.push(vname + ' whispers: "Mara swears she saw one of the beasts TALK. Like, with words. I told her she\'s tired."');

      // Specific pilot gossip (only if known)
      for (var pid in ap.known) {
        var per = this.apPersona(pid);
        if (!per) continue;
        if (per.disposition === 'sadistic') {
          lines.push(vname + ' says: "That ' + per.name + '... I don\'t like the way it looks at you. Be careful."');
        } else if (per.disposition === 'benevolent') {
          lines.push(vname + ' says: "Someone\'s been leaving food out. Good food. Don\'t ask me how I know it wasn\'t one of us."');
        }
      }

      if (lines.length) {
        this.say('💬 ' + lines[Math.floor(Math.random() * lines.length)]);
        return true;
      }
      return false;
    },

    // ---------- NPC connections ----------
    // A villager has been contacted. They've seen through the fiction, a little.
    apContactedVillager: function () {
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (ap.contactedVid) return ap.contactedVid; // already established
      if (day < 20) return null; // needs time
      if (Math.random() > 0.3) return null;

      var roster = (this.state.village && this.state.village.roster) || [];
      if (roster.length < 3) return null;
      var vid = roster[Math.floor(Math.random() * roster.length)];
      ap.contactedVid = vid;

      var vname = 'Someone';
      try { vname = this.displayName(vid) || 'Someone'; } catch (e) {}
      this.say('💬 ' + vname + ' pulls you aside. "I need to tell you something. Last night I... dreamed? No. I was AWAKE. And something spoke to me. Not the System — something else. It said: \'Tell the human to watch the northern treeline.\' Then it was gone."');
      this.say('(' + vname + ' has been contacted by an alien player. They don\'t understand what happened. But they\'ll warn you when they dream again.)');
      return vid;
    },

    // Contacted villager warnings (called from daily tick)
    apContactWarning: function () {
      var ap = this.apState();
      if (!ap.contactedVid) return false;
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastContactWarningDay || -999) < 4) return false;
      if (Math.random() > 0.4) return false;
      ap.lastContactWarningDay = day;

      var vname = 'Your contact';
      try { vname = this.displayName(ap.contactedVid) || 'Your contact'; } catch (e) {}
      var warnings = [
        vname + ' says: "Dreamed again. They showed me teeth. Lots of teeth. Be ready to fight soon."',
        vname + ' says: "The voice said \'north.\' Just... north. I don\'t know what it means."',
        vname + ' says: "They said you\'re doing well. It sounded... proud? Can they feel proud?"',
      ];
      this.say('💬 ' + warnings[Math.floor(Math.random() * warnings.length)]);
      return true;
    },
  };

  Object.assign(G, methods);

  // ============ WRAPS (chain-safe) ============
  (function attach() {
    // After combat starts, roll for an inhabited avatar
    var _sc = G.startCombat;
    G.startCombat = function (monsterId) {
      var r = _sc ? _sc.apply(this, arguments) : undefined;
      try {
        if (!this.tbfight || !this.tbfight.fighters) return r;
        // Find the primary monster fighter
        var mf = null;
        for (var i = 0; i < this.tbfight.fighters.length; i++) {
          var f = this.tbfight.fighters[i];
          if (f.kind === 'monster' && f.key === 'm_0') { mf = f; break; }
        }
        if (!mf || !mf.mdef) return r;
        var pid = this.apMaybeInhabit(mf.monsterId, mf.mdef);
        if (pid) {
          mf.pilot = pid;
          mf.pilotPersona = this.apPersona(pid);
          this.apCombatIntro(pid, mf.mdef);
        }
      } catch (e) {}
      return r;
    };

    // After combat ends, record the pilot outcome
    var _tbEnd = G.tbEnd;
    G.tbEnd = function (result) {
      var pilot = null;
      try {
        if (this.tbfight && this.tbfight.fighters) {
          for (var i = 0; i < this.tbfight.fighters.length; i++) {
            var f = this.tbfight.fighters[i];
            if (f.kind === 'monster' && f.pilot) { pilot = f.pilot; break; }
          }
        }
      } catch (e) {}
      var r = _tbEnd ? _tbEnd.apply(this, arguments) : undefined;
      try {
        if (pilot) {
          var outcome = result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'fled';
          this.apOnCombatEnd(pilot, outcome);
        }
      } catch (e) {}
      return r;
    };

    // Pilot taunts: hook into the monster turn if a piloted fighter acts.
    // We piggyback on tbAfterPlayerAction if it exists, else skip (intros +
    // end lines carry the personality; taunts are garnish).
    var _tbAfter = G.tbAfterPlayerAction;
    if (_tbAfter) {
      G.tbAfterPlayerAction = function () {
        var r = _tbAfter.apply(this, arguments);
        try {
          if (this.tbfight && this.tbfight.fighters) {
            for (var i = 0; i < this.tbfight.fighters.length; i++) {
              var f = this.tbfight.fighters[i];
              if (f.kind === 'monster' && f.pilot && f.alive) {
                this.apPilotTaunt(f.pilot);
                break;
              }
            }
          }
        } catch (e) {}
        return r;
      };
    }

    // Daily off-screen tick
    var _endDay = G.endDay;
    G.endDay = function () {
      var r = _endDay ? _endDay.apply(this, arguments) : undefined;
      try { this.apDailyTick(); } catch (e) {}
      return r;
    };

    // Contest interference: alien players rig, save, and sway contests.
    // Wrapped on _contestVerdict (contests.js) — applied before the verdict roll.
    var _verdict = G._contestVerdict;
    if (_verdict) {
      G._contestVerdict = function (ac) {
        var interference = { winMod: 0, deathSave: false, note: null };
        try {
          if (this.apContestInterference) interference = this.apContestInterference(ac) || interference;
        } catch (e) {}
        // Stash for the verdict logic to consume
        if (ac) {
          ac._apWinMod = interference.winMod || 0;
          ac._apDeathSave = !!interference.deathSave;
        }
        return _verdict.apply(this, arguments);
      };
    }
  })();
})(typeof window !== 'undefined' ? window : global);
