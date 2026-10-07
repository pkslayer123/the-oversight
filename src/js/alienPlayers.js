// @ontology
// system: alienPlayers
// description: Late-game sentient aliens impersonating humans in an exclusive encounter pool. Sadistic trophy hunters, neutral participants, and benevolent sympathizers — with full ability sets, alien tech, off-screen rivals, secret allies, fan favor, and the System as referee. Steve (2026-10-07): they impersonate HUMANS, not monsters. Exclusive pool, separate from monsters.
// provides:
//   - apState()
//   - apEligible()
//   - apEncounterEligible()
//   - apRollEncounter()
//   - apBuildFighter(pid)
//   - apAbilityKit(pid)
//   - apAlienTech(pid)
//   - apStartEncounter(pid)
//   - apCombatIntro(pid)
//   - apCombatLine(pid, situation)
//   - apSayCombat(pid, situation, chance)
//   - apCombatChatter(pid, event, fighter, playerHpRatio)
//   - apWealthOf(pid)
//   - apWealthStance(pid, fighter)
//   - apApplyWealthStance(pid, fighter)
//   - apProgressRate(pid)
//   - apProgressLevel(pid)
//   - apProgressiveKit(pid)
//   - apProgressiveTech(pid)
//   - apGroupEligible()
//   - apRollGroupEncounter()
//   - apGroupBanter(pids)
//   - apStartGroupEncounter(pids)
//   - apOnCombatEnd(pid, outcome)
//   - apDailyTick()
//   - apFavor()
//   - apAdjustFavor(n, why)
//   - apContestInterference(ac)
//   - apPersonaPackage()
//   - apEventFeed()
//   - apCodexEntry(pid)
//   - apVillageGossip()
//   - apContactedVillager()
//   - apContactWarning()
//   - apKnowsAlien(pid)
//   - apRevealAlien(pid, how)
//   - apCarePackage()
// rules:
//   - (separation) alien players are HUMANS, not monsters. Exclusive pool, separate spawn logic. Monsters stay monsters. (Steve 2026-10-07)
//   - (gating) alien encounters only post-System arrival, wave 2+, separate roll from monster encounters (code: alienPlayers.js)
//   - (knowledge) alien identity hidden until earned: reveal, System feed slip, or 3rd encounter with same persona (code: alienPlayers.js)
//   - (limits) dead drops max 1 per 3 days; feed max 1 per day; same-rival hunts min 2 days apart (sporting rules); benevolent help is deniable and subtle (code: alienPlayers.js)
//   - (favor) fan favor -100..100; high favor improves care packages and contest lean; low favor makes the crowd bloodthirsty (code: alienPlayers.js)
//   - (integration) woven into contests (rigging/lifelines), codex (discoverable truth), village gossip, and NPC contacts (code: alienPlayers.js)
//   - (people) they are PEOPLE: full ability sets, alien tech, they remember past encounters, escalate or soften, speak in their own voice (code: alienPlayers.js)
//   - (commentary) heavy unhinged mid-combat dialogue: onHit/onHurt/onWinning/onLosing/unhinged per persona, 15+ lines each, knowledge-gated (code: alienPlayers.js)
//   - (wealth) broke personas retreat when losing (can't afford another body); rich never retreat and enrage when hurt (death is an inconvenience) (code: alienPlayers.js)
//   - (progression) alien players level alongside you: kit grows 3->6 abilities, tech upgrades; rich progress faster (buy), broke slower (earn) (code: alienPlayers.js)
//   - (groups) rare late-game 2-3 persona team encounters (day 40+, 3%, 14-day cooldown, needs 2+ established rivals) with inter-alien banter (code: alienPlayers.js)
// consumes:
//   - state.systemArrived, unlockedWave(), endDay (wrapped)
//   - sysSay, say, displayName
/* ALIEN PLAYERS — src/js/alienPlayers.js
 *
 * Steve (2026-10-07): "They should be impersonating humans but with full
 * ability sets and alien technology they shouldn't have. There should be
 * an exclusive pool for this set."
 *
 * NOT monsters. These are human-impersonator encounters from an exclusive
 * pool, separate from the monster spawn table. They look human, fight like
 * players (full ability kits), and carry alien tech that breaks the rules.
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

  // Personas who appear as human combatants. Wren (benevolent) never fights —
  // her avatar is non-combat. She acts only through dead drops and warnings.
  // "Pilot" = the alien wearing the human sleeve. They are PEOPLE, not monsters.
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
    apKnowsAlien: function (pid) {
      return !!(this.apState().known[pid]);
    },

    apRevealAlien: function (pid, how) {
      var ap = this.apState();
      if (ap.known[pid]) return;
      ap.known[pid] = how || 'revealed';
      var p = this.apPersona(pid);
      if (p && this.state.systemArrived) {
        this.say('◈ You understand now: that wasn\'t human. That was ' + p.name + ' — ' + p.title + ' — wearing a person like a suit. (' + how + ')');
      }
    },

    // ---------- EXCLUSIVE POOL: human-impersonator encounters ----------
    // Steve (2026-10-07): NOT monsters. These are human opponents from an
    // exclusive pool — separate spawn logic, separate from the monster table.
    // They look human, fight like players (full ability kits), and carry
    // alien tech that breaks the rules.

    // When can alien players appear? Post-System, wave 2+, not in safe zones.
    apEncounterEligible: function () {
      if (!this.apEligible()) return false;
      try {
        var px = this.map.px, py = this.map.py;
        if (this.isSafeTile && this.isSafeTile(px, py)) return false;
        return true;
      } catch (e) { return false; }
    },

    // Roll for an alien-player encounter. SEPARATE from monster encounters.
    // Called from the encounter phase. Returns a persona id or null.
    apRollEncounter: function () {
      if (!this.apEncounterEligible()) return null;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;

      // Rival scheduling: a sadistic rival who's due gets priority (sporting
      // rules — min 2 days between hunts by the same persona).
      var dueRival = null;
      for (var pid in ap.met) {
        var rec = ap.met[pid];
        var per = this.apPersona(pid);
        if (!per || per.disposition !== 'sadistic') continue;
        if (!COMBAT_PILOTS.includes(pid)) continue;
        if (day - (ap.lastHuntDay[pid] || -999) >= 2 && rec.encounters >= 1) { dueRival = pid; break; }
      }

      // Base chance: 8% per eligible encounter roll (separate from monsters).
      // Rival due: 15%. This is its own pool — not competing with monsters.
      var roll = Math.random();
      var chance = dueRival ? 0.15 : 0.08;
      if (roll >= chance) return null;

      var chosen = null;
      if (dueRival && Math.random() < 0.6) {
        chosen = dueRival;
      } else {
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

    // Ability kits: each combat persona gets 6 abilities that fit their style.
    // These are real abilities from the game's pool — they fight like players.
    apAbilityKit: function (pid) {
      var KITS = {
        // Vex: the hunter — tracking, patience, the perfect shot
        'vex_marlowe': ['tracker', 'patient_aim', 'soft_step', 'game_sense', 'adrenaline_control', 'pattern_recognition'],
        // Sable: the despair collector — fear, presence, breaking wills
        'countess_sable': ['adrenaline_control', 'pattern_recognition', 'soft_step', 'game_sense', 'patient_aim', 'diplomat'],
        // Rax: the pain researcher — precision wounding, staying power
        'rax_dentist': ['triage', 'steady_hands', 'patient_aim', 'adrenaline_control', 'pattern_recognition', 'soft_step'],
        // Pip: the tourist — enthusiastic, random, surprisingly lucky
        'pip_quindle': ['scrounger', 'soft_step', 'game_sense', 'adrenaline_control', 'squirrel_friend', 'rain_dancer'],
        // Sarge: the veteran — solid, honorable, fundamentals
        'sarge': ['adrenaline_control', 'patient_aim', 'triage', 'steady_hands', 'pattern_recognition', 'game_sense'],
        // Fenwick: the researcher — observation, analysis, adaptation
        'dr_fenwick': ['pattern_recognition', 'game_sense', 'patient_aim', 'soft_step', 'adrenaline_control', 'forage_identification'],
        // Old Tam: the atoner — deliberately holds back (throws fights)
        'old_tam': ['adrenaline_control', 'triage', 'game_sense', 'soft_step', 'patient_aim', 'generous'],
      };
      return KITS[pid] || ['adrenaline_control', 'game_sense', 'soft_step', 'patient_aim', 'pattern_recognition', 'triage'];
    },

    // Alien tech: 1-2 pieces per persona that break normal rules.
    // This is what makes them scary — they're cheating and they know it.
    apAlienTech: function (pid) {
      var TECH = {
        'vex_marlowe': [
          { id: 'phase_net', name: 'Phase-net', desc: 'Shots phase through cover. Your hiding spots are decorative.' },
          { id: 'trophy_scope', name: 'Trophy Scope', desc: 'Sees through stealth and camouflage. You cannot hide from Vex.' },
        ],
        'countess_sable': [
          { id: 'dread_projector', name: 'Dread Projector', desc: 'Projects your worst memory. Fear effects are doubled.' },
          { id: 'crystal_lattice', name: 'Crystal Lattice', desc: 'Stores your fear as damage. The more scared you are, the harder she hits.' },
        ],
        'rax_dentist': [
          { id: 'nerve_mapper', name: 'Nerve Mapper', desc: '+accuracy against wounded targets. Rax knows exactly where it hurts.' },
          { id: 'stasis_field', name: 'Stasis Field', desc: 'Prevents fleeing. You leave when Rax says you leave.' },
        ],
        'pip_quindle': [
          { id: 'tourist_cam', name: 'Tourist Cam', desc: 'Records everything. Pip gets stronger the longer the fight goes (more footage).' },
        ],
        'sarge': [
          { id: 'veteran_plate', name: 'Veteran Plate', desc: 'Military-grade armor. Reduces all damage by 2. Sarge earned this.' },
        ],
        'dr_fenwick': [
          { id: 'specimen_scanner', name: 'Specimen Scanner', desc: 'Analyzes your fighting style. +accuracy each round (resets if you change tactics).' },
        ],
        'old_tam': [
          // Old Tam deliberately uses NO alien tech — he's trying to fight fair.
        ],
      };
      return TECH[pid] || [];
    },

    // Build a combat fighter for an alien player.
    // kind: 'hostile' — treated as an enemy in combat, but NOT a monster.
    apBuildFighter: function (pid, mx, my) {
      var p = this.apPersona(pid);
      if (!p) return null;
      var ap = this.apState();
      var rec = ap.met[pid] || { encounters: 0 };

      // Base stats scale with encounters (they learn, they escalate)
      var hp = 80 + (rec.encounters * 10);
      var speed = 4;

      // Sadistic personas are tougher (combat sleeves); Pip is weaker (tourist sleeve)
      if (p.disposition === 'sadistic') hp += 20;
      if (pid === 'pip_quindle') hp -= 20;
      // Old Tam holds back (deliberately)
      if (pid === 'old_tam') hp = Math.min(hp, 70);

      // PROGRESSION (Steve 2026-10-07): kit and tech grow with encounters.
      // Rich personas progress faster (they buy upgrades).
      var tech = this.apProgressiveTech(pid);
      var kit = this.apProgressiveKit(pid);
      var wealth = this.apWealthOf(pid);
      var progLevel = this.apProgressLevel(pid);

      return {
        key: 'ap_' + pid,
        kind: 'hostile',  // NOT 'monster' — this is a person
        alienPid: pid,
        name: this.apKnowsAlien(pid) ? p.name : 'Stranger',
        emoji: '🧑',  // Looks human
        hp: hp, maxHp: hp, speed: speed,
        mx: mx, my: my,
        alive: true, fled: false,
        abilities: kit,
        alienTech: tech,
        // WEALTH (Steve 2026-10-07): affects self-preservation behavior.
        // broke = retreats when losing; rich = never retreats, enrages when hurt.
        wealth: wealth,
        progLevel: progLevel,
        _stance: 'normal',
        _enraged: false,
        _wantsRetreat: false,
        // They fight like players: they use abilities, they adapt
        ai: 'adaptive',
      };
    },

    // Start an alien-player encounter. Called from the encounter roll.
    apStartEncounter: function (pid) {
      var p = this.apPersona(pid);
      if (!p) return false;

      // Find a spot near the player
      var s = this.state.scholar;
      var px = s.mx ?? 4, py = s.my ?? 4;
      var detail = this.genDetail(this.map.px, this.map.py);

      // Place them 3-4 tiles away (they approach, they don't ambush from adjacent)
      var mx = Math.max(0, Math.min(8, px + (Math.random() < 0.5 ? 3 : -3)));
      var my = Math.max(0, Math.min(8, py + (Math.random() < 0.5 ? 3 : -3)));

      var fighter = this.apBuildFighter(pid, mx, my);
      if (!fighter) return false;

      // Start combat with this fighter as the opponent
      // We use a synthetic "monster" wrapper for combat compatibility,
      // but the fighter kind is 'hostile' not 'monster'
      try {
        this.state.alienEncounter = { pid: pid, fighter: fighter };
        this.say('👤 A figure steps out of the treeline. Human-shaped. But something\'s wrong.');
        this.say('They move like someone who\'s done this before. Many times. On many worlds.');
        this.apCombatIntro(pid);
        // Trigger combat with the hostile fighter
        // (Combat system handles 'hostile' kind as an enemy)
        if (this.startAlienCombat) {
          this.startAlienCombat(fighter);
        } else {
          // Fallback: use the standard combat flow
          this.say('(The stranger raises their hands. This is going to hurt.)');
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    apCombatIntro: function (pid) {
      var p = this.apPersona(pid);
      if (!p) return;
      var ap = this.apState();
      var rec = ap.met[pid] || { encounters: 0 };
      var known = this.apKnowsAlien(pid);

      if (!known) {
        // MYSTERY: this person is wrong, but you don't know why.
        var mystery = [
          'They move wrong. Too smooth. Too... practiced?',
          'Their eyes track you like a targeting system. That\'s not human.',
          'Something about their gear — it hums. Nothing from Earth hums like that.',
        ];
        this.say('👁 ' + mystery[Math.floor(Math.random() * mystery.length)]);
        // 30%: they slip — an alien word, a wrong gesture.
        if (Math.random() < 0.3) {
          this.say('...did they just speak? Not English. Not anything. You imagined it.');
        }
        return;
      }

      // KNOWN: they speak in their own voice.
      var line;
      if (rec.encounters >= 1 && p.escalationLines && p.escalationLines.length) {
        line = p.escalationLines[Math.floor(Math.random() * p.escalationLines.length)];
      } else if (p.introLines && p.introLines.length) {
        line = p.introLines[Math.floor(Math.random() * p.introLines.length)];
      }
      if (line) this.say('🎭 ' + p.name + ': "' + line + '"');
      // Signature behavior note (knowledge-gated coaching)
      if (p.signature) this.say('(' + p.signature + ')');
      // Alien tech warning (knowledge-gated)
      var tech = this.apAlienTech(pid);
      if (tech && tech.length) {
        var tnames = tech.map(function(t) { return t.name; }).join(', ');
        this.say('⚠ Alien tech detected: ' + tnames + '. They\'re cheating. Play accordingly.');
      }
    },

    apPilotTaunt: function (pid) {
      var p = this.apPersona(pid);
      if (!p || !p.taunts || !p.taunts.length) return;
      if (!this.apKnowsAlien(pid)) return;
      if (Math.random() < 0.35) {
        this.say('🎭 ' + p.name + ': "' + p.taunts[Math.floor(Math.random() * p.taunts.length)] + '"');
      }
    },

    // ============ UNHINGED COMBAT COMMENTARY (Steve 2026-10-07) ============
    // Heavy mid-combat dialogue. Each persona has 15+ lines across 5 situations.
    // This is what makes them feel like PEOPLE, not stat blocks.

    // Pick a combat line for a situation. Returns null if none/not known.
    apCombatLine: function (pid, situation) {
      var p = this.apPersona(pid);
      if (!p || !p.combatLines) return null;
      var pool = p.combatLines[situation];
      if (!pool || !pool.length) return null;
      if (!this.apKnowsAlien(pid)) return null; // knowledge-gated
      return pool[Math.floor(Math.random() * pool.length)];
    },

    // Say a combat line. situation: onHit, onHurt, onWinning, onLosing, unhinged.
    apSayCombat: function (pid, situation, chance) {
      var line = this.apCombatLine(pid, situation);
      if (!line) return false;
      if (chance === undefined) chance = 0.5;
      if (Math.random() > chance) return false;
      var p = this.apPersona(pid);
      this.say('🎭 ' + p.name + ': "' + line + '"');
      return true;
    },

    // Situational commentary driver. Call with the fighter and what happened.
    // event: 'hit' (they landed a hit), 'hurt' (they took a hit),
    //        'winning' (their HP high, yours low), 'losing' (reverse),
    //        'banter' (random unhinged observation)
    apCombatChatter: function (pid, event, fighter, playerHpRatio) {
      var p = this.apPersona(pid);
      if (!p || !this.apKnowsAlien(pid)) return;
      var situation = null, chance = 0.4;
      if (event === 'hit') { situation = 'onHit'; chance = 0.45; }
      else if (event === 'hurt') { situation = 'onHurt'; chance = 0.45; }
      else if (event === 'winning') { situation = 'onWinning'; chance = 0.35; }
      else if (event === 'losing') { situation = 'onLosing'; chance = 0.4; }
      else if (event === 'banter') { situation = 'unhinged'; chance = 0.25; }
      if (!situation) return;
      // Rich personas talk MORE (they're performing for an audience)
      var wealth = this.apWealthOf(pid);
      if (wealth === 'rich') chance = Math.min(0.75, chance + 0.2);
      if (wealth === 'broke') chance = Math.max(0.15, chance - 0.1);
      this.apSayCombat(pid, situation, chance);
    },

    // ============ WEALTH-BASED SELF-PRESERVATION (Steve 2026-10-07) ============
    // Broke: can't afford another body — fights cautiously, retreats when losing.
    // Comfortable: fights hard but won't throw life away — tactical retreats.
    // Rich: death is an inconvenience — never retreats, gets MORE aggressive hurt.

    apWealthOf: function (pid) {
      var p = this.apPersona(pid);
      return (p && p.wealth) || 'comfortable';
    },

    // Current tactical stance based on wealth + HP. Returns:
    // 'normal', 'cautious' (broke/comfortable pulling back),
    // 'retreating' (broke at critical HP — WILL flee),
    // 'enraged' (rich at low HP — MORE dangerous, not less)
    apWealthStance: function (pid, fighter) {
      var wealth = this.apWealthOf(pid);
      if (!fighter || !fighter.maxHp) return 'normal';
      var ratio = fighter.hp / fighter.maxHp;

      if (wealth === 'rich') {
        // The rich don't retreat. They escalate.
        if (ratio < 0.5) return 'enraged';
        return 'normal';
      }
      if (wealth === 'broke') {
        // Can't afford another body. Survival first.
        if (ratio < 0.35) return 'retreating';
        if (ratio < 0.6) return 'cautious';
        return 'normal';
      }
      // comfortable: tactical
      if (ratio < 0.2) return 'retreating';
      if (ratio < 0.45) return 'cautious';
      return 'normal';
    },

    // Apply wealth stance to a fighter. Called when HP changes significantly.
    // Sets flags the combat AI can read. Rich enrage = +damage. Broke retreat = flee check.
    apApplyWealthStance: function (pid, fighter) {
      if (!fighter) return;
      var stance = this.apWealthStance(pid, fighter);
      var prev = fighter._stance;
      fighter._stance = stance;

      // Announce stance changes (they're theatrical about it)
      if (stance !== prev && this.apKnowsAlien(pid)) {
        var p = this.apPersona(pid);
        if (stance === 'enraged') {
          var enrageLines = {
            'vex_marlowe': "Oh, you've made a MISTAKE. I'm buying a better body AFTER I kill you with this one.",
            'countess_sable': "You DARE? You dare HURT me? I'll preserve your SCREAMS.",
            'rax_dentist': "PAIN DATA SPIKE! This is INCREDIBLE! MORE!",
          };
          var el = enrageLines[pid] || "You've made me angry. That was expensive.";
          this.say('🎭 ' + p.name + ': "' + el + '"');
          this.say('(⚠ ' + p.name + ' is ENRAGED — hitting harder, fighting recklessly.)');
          fighter._enraged = true;
        } else if (stance === 'retreating') {
          var retreatLines = {
            'pip_quindle': "Okay okay okay I can't afford another one of these! I'm OUT! Great fight though!",
            'sarge': "...Tactical withdrawal. Nothing personal.",
            'dr_fenwick': "The data suggests I should NOT be here anymore! Withdrawing!",
            'old_tam': "That's enough. I'm too old and too poor for this.",
          };
          var rl = retreatLines[pid] || "I can't afford to die here. Falling back!";
          this.say('🎭 ' + p.name + ': "' + rl + '"');
          fighter._wantsRetreat = true;
        } else if (stance === 'cautious' && prev === 'normal') {
          this.apSayCombat(pid, 'onLosing', 0.5);
        }
      }
      return stance;
    },

    // ============ PROGRESSION (Steve 2026-10-07) ============
    // Alien players level up alongside you. Rich ones buy upgrades (fast).
    // Broke ones earn them (slow). Tracked in ap.met[pid].sessions.

    // How fast does this persona progress? Rich = 1.0, comfortable = 0.7, broke = 0.4
    apProgressRate: function (pid) {
      var w = this.apWealthOf(pid);
      return w === 'rich' ? 1.0 : w === 'comfortable' ? 0.7 : 0.4;
    },

    // Current progression level (0-5). Grows with encounters, scaled by wealth.
    apProgressLevel: function (pid) {
      var ap = this.apState();
      var rec = ap.met[pid] || { encounters: 0 };
      var rate = this.apProgressRate(pid);
      // Level = encounters * rate, capped at 5. Rich hits 5 in ~5 encounters, broke in ~12.
      return Math.min(5, Math.floor((rec.encounters || 0) * rate));
    },

    // Progressive ability kit: starts with 3-4 core abilities, grows to full 6.
    // Rich personas unlock faster. Each level adds depth, not just power.
    apProgressiveKit: function (pid) {
      var fullKit = this.apAbilityKit(pid);
      var level = this.apProgressLevel(pid);
      // Level 0: 3 abilities. Each level adds depth. Level 3+: full kit.
      var count = Math.min(fullKit.length, 3 + level);
      return fullKit.slice(0, count);
    },

    // Progressive alien tech: base tech at level 0, upgrades at levels 2 and 4.
    // Rich personas get enhanced versions (they buy the good stuff).
    apProgressiveTech: function (pid) {
      var base = this.apAlienTech(pid);
      var level = this.apProgressLevel(pid);
      var wealth = this.apWealthOf(pid);
      var tech = base.map(function (t) {
        return { id: t.id, name: t.name, desc: t.desc };
      });

      // Level 2+: tech gets a "+" upgrade (rich only get the best versions)
      if (level >= 2 && wealth === 'rich') {
        tech = tech.map(function (t) {
          return { id: t.id + '_plus', name: t.name + ' Mk.II', desc: t.desc + ' (Upgraded. Of course.)' };
        });
      } else if (level >= 4 && wealth !== 'rich') {
        // Broke/comfortable eventually catch up (they earn it)
        tech = tech.map(function (t) {
          return { id: t.id + '_plus', name: t.name + ' (tuned)', desc: t.desc + ' (Carefully maintained.)' };
        });
      }
      return tech;
    },

    // ============ RARE GROUP ENCOUNTERS (Steve 2026-10-07) ============
    // Sometimes (rare, late-game) you face 2-3 alien players together.
    // They have team dynamics. This is a MAJOR EVENT, not a regular fight.

    // Can a group encounter happen? Very late game, low chance, needs rivals.
    apGroupEligible: function () {
      if (!this.apEncounterEligible()) return false;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day < 40) return false; // LATE GAME only
      // Need at least 2 personas you've met 2+ times (real rivals)
      var rivals = 0;
      for (var pid in ap.met) {
        if (ap.met[pid].encounters >= 2 && COMBAT_PILOTS.includes(pid)) rivals++;
      }
      if (rivals < 2) return false;
      // Cooldown: max 1 group encounter per 14 days
      if (day - (ap.lastGroupDay || -999) < 14) return false;
      return true;
    },

    // Roll for a group encounter. 3% when eligible. Returns array of pids or null.
    apRollGroupEncounter: function () {
      if (!this.apGroupEligible()) return null;
      if (Math.random() > 0.03) return null;

      var ap = this.apState();
      // Pick 2-3 from your established rivals
      var candidates = [];
      for (var pid in ap.met) {
        if (ap.met[pid].encounters >= 2 && COMBAT_PILOTS.includes(pid)) {
          candidates.push(pid);
        }
      }
      if (candidates.length < 2) return null;

      // Shuffle and take 2-3
      for (var i = candidates.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
      }
      var size = Math.min(candidates.length, Math.random() < 0.3 ? 3 : 2);
      var group = candidates.slice(0, size);

      ap.lastGroupDay = (this.state.scholar || {}).day || 1;
      return group;
    },

    // Team banter: they talk to EACH OTHER, not just you.
    apGroupBanter: function (pids) {
      if (!pids || pids.length < 2) return;
      var names = pids.map(function (pid) {
        var p = this.apPersona(pid);
        return p ? p.name : 'Someone';
      }, this);

      // Personality-driven team dynamics
      var hasVex = pids.includes('vex_marlowe');
      var hasSable = pids.includes('countess_sable');
      var hasSarge = pids.includes('sarge');
      var hasPip = pids.includes('pip_quindle');
      var hasRax = pids.includes('rax_dentist');
      var hasFenwick = pids.includes('dr_fenwick');
      var hasTam = pids.includes('old_tam');

      this.say('👥 ' + names.join(' and ') + ' step out together. This is... not good.');

      if (hasVex && hasSable) {
        this.say('🎭 Vex Marlowe: "Sable. Darling. Try not to break this one before I get my shot."');
        this.say('🎭 Countess Sable: "Try not to bore it to death first, Vex. We all have our collections."');
      } else if (hasSarge) {
        this.say('🎭 Sarge: "Formation. No heroics. We do this clean."');
        if (hasPip) this.say('🎭 Pip Quindle: "Ooh, formation! Like in the movies! Which one am I?"');
      } else if (hasRax && hasFenwick) {
        this.say('🎭 Dr. Fenwick: "Fascinating — a multi-subject trial! Rax, you take pain responses, I\'ll take behavioral."');
        this.say('🎭 Rax "The Dentist": "Dibs on the screaming data."');
      } else if (hasPip) {
        this.say('🎭 Pip Quindle: "OH WOW, it\'s a TEAM UP! This is just like the season finale!"');
      } else if (hasTam) {
        this.say('🎭 Old Tam: "...I didn\'t agree to this. But I\'m here. Let\'s get it over with."');
      } else {
        // Generic team-up
        this.say('🎭 ' + names[0] + ': "Together, then. Don\'t get in my way."');
        this.say('🎭 ' + names[1] + ': "Wouldn\'t dream of it. Probably."');
      }

      this.say('(⚠ MULTIPLE alien players. This is a major event. The System is watching closely.)');
      try { this.apAdjustFavor(5, 'survived a group encounter setup — the crowd loves a spectacle'); } catch (e) {}
    },

    // Start a group encounter with 2-3 alien players
    apStartGroupEncounter: function (pids) {
      if (!pids || pids.length < 2) return false;
      this.apGroupBanter(pids);
      // Build fighters for each (they'll be added to the encounter)
      // For now, start with the first and note the others as incoming
      // (Full multi-fighter combat integration is a deeper change)
      var first = pids[0];
      this.say('(The others are circling. They\'ll join the fight in turn.)');
      try {
        this.state.alienGroup = { pids: pids, current: 0 };
      } catch (e) {}
      return this.apStartEncounter(first);
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

      // Knowledge: 3rd encounter with the same persona reveals them (pattern recognition)
      if (rec.encounters >= 3 && !ap.known[pid]) {
        this.apRevealAlien(pid, 'you recognized the fighting style');
      }

      // Pilot-specific outcome lines
      var lines = outcome === 'won' ? p.victoryLines : p.defeatLines;
      if (lines && lines.length && this.apKnowsAlien(pid)) {
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
            this.apRevealAlien(pid, 'the System feed named them');
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
          if (this.apKnowsAlien(pid)) {
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
        entry.note = 'That wasn\'t a person. It moved like someone wearing a human suit.';
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
      lines.push(vname + ' whispers: "Mara swears she met a stranger who knew things. Things no one should know. I told her she\'s tired."');

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
    // Alien-player encounters: separate from monster combat.
    // After combat ends, check if it was an alien-player fight and record it.
    var _tbEnd = G.tbEnd;
    G.tbEnd = function (result) {
      var alienPid = null;
      try {
        if (this.tbfight && this.tbfight.fighters) {
          for (var i = 0; i < this.tbfight.fighters.length; i++) {
            var f = this.tbfight.fighters[i];
            if (f.kind === 'hostile' && f.alienPid) { alienPid = f.alienPid; break; }
          }
        }
        // Also check the alien encounter state
        if (!alienPid && this.state.alienEncounter && this.state.alienEncounter.pid) {
          alienPid = this.state.alienEncounter.pid;
        }
      } catch (e) {}
      var r = _tbEnd ? _tbEnd.apply(this, arguments) : undefined;
      try {
        if (alienPid) {
          var outcome = result === 'won' ? 'won' : result === 'lost' ? 'lost' : 'fled';
          this.apOnCombatEnd(alienPid, outcome);
          // Clear the encounter state
          if (this.state.alienEncounter) delete this.state.alienEncounter;
        }
      } catch (e) {}
      return r;
    };

    // Alien taunts: hook into the turn if a hostile alien fighter acts.
    var _tbAfter = G.tbAfterPlayerAction;
    if (_tbAfter) {
      G.tbAfterPlayerAction = function () {
        var r = _tbAfter.apply(this, arguments);
        try {
          if (this.tbfight && this.tbfight.fighters) {
            for (var i = 0; i < this.tbfight.fighters.length; i++) {
              var f = this.tbfight.fighters[i];
              if (f.kind === 'hostile' && f.alienPid && f.alive) {
                var pid = f.alienPid;
                // WEALTH STANCE: check if their tactical situation changed
                // (broke ones start thinking about retreat, rich ones enrage)
                try { this.apApplyWealthStance(pid, f); } catch (e) {}
                // SITUATIONAL CHATTER: winning/losing/banter based on HP
                try {
                  var s = this.state.scholar || {};
                  var pRatio = (s.hp || 100) / (s.maxHp || 100);
                  var fRatio = (f.hp || 1) / (f.maxHp || 1);
                  if (fRatio > 0.7 && pRatio < 0.4) {
                    this.apCombatChatter(pid, 'winning', f, pRatio);
                  } else if (fRatio < 0.4 && pRatio > 0.6) {
                    this.apCombatChatter(pid, 'losing', f, pRatio);
                  } else {
                    // Random banter or legacy taunt
                    if (Math.random() < 0.5) this.apCombatChatter(pid, 'banter', f, pRatio);
                    else this.apPilotTaunt(pid);
                  }
                } catch (e) {}
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
