// @ontology
// system: alienPlayers
// description: Late-game sentient aliens impersonating humans in an exclusive encounter pool. Sadistic trophy hunters, neutral participants, and benevolent sympathizers — with full ability sets, alien tech, off-screen rivals, secret allies, fan favor, and the System as referee. Steve (2026-10-07): they impersonate HUMANS, not monsters. Exclusive pool, separate from monsters.
// provides:
//   - apState()
//   - apPersonas()
//   - apPersona(pid)
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
//   - apPilotTaunt(pid)
//   - apWealthOf(pid)
//   - apIsCombat(pid)
//   - apIsDead(pid) -> met-record death flag (break-it r12: kills are permanent)
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
//   - apOnCombatEnd(pid, outcome, opts)
//   - apDailyTick()
//   - apActive()
//   - apPlaygroundTick()
//   - apMaybeActivate()
//   - apMaybeDeactivate()
//   - apPlaygroundAction()
//   - apPlaygroundKill()
//   - apPlaygroundBurn()
//   - apPlaygroundRaid()
//   - apPlaygroundRookieMistake()
//   - apPlaygroundDuel()
//   - apFactionAligned()
//   - apVillagerFear()
//   - apBeamResistPieces()
//   - apBeamResistLevel()
//   - apBeamResistText()
//   - apReadinessCheck()
//   - apHasBeam(pid)
//   - apStasisFieldLive()
//   - apBeamHit(targetKey, dmg, sourceLabel, opts)
//   - apArmorName()
//   - apMaybeBeamAttack(fighter)
//   - apIsArsonist()
//   - apExperience()
//   - apFavor() -> loudest fan-club lane (max of fight/survival/social/showbiz)
//   - apFanLane(lane) -> one club's favor
//   - apTopLane() -> loudest club id
//   - apClubName(lane) -> plain-language club name
//   - apAdjustFavor(n, why, lane)
//   - apPackageClubLine() -> " — your X fans" credit for care packages
//   - apClubBoon() -> a loud club (50+) votes a small favor, max 1/5 days
//   - apDeadDrop()
//   - apFeedMessage()
//   - apContestInterference(ac, opts)
//   - apPersonaPackage()
//   - apEventFeed()
//   - apCodexEntry(pid)
//   - apVillageGossip()
//   - apContactedVillager()
//   - apContactWarning()
//   - apKnowsAlien(pid)
//   - apRevealAlien(pid, how)
//   - apCarePackage()
//   - apWackyGift(tier) -> alien curio def or null (wacky, never dinner; shared by apCarePackage + apClubBoon)
//   - apGrantItem(itemId)
//   - apDousePlayerFire()
// rules:
//   - (separation) alien players are HUMANS, not monsters. Exclusive pool, separate spawn logic. Monsters stay monsters. (Steve 2026-10-07) (code: alienPlayers.js)
//   - (gating) alien encounters only post-System arrival, wave 2+, separate roll from monster encounters (code: alienPlayers.js)
//   - (knowledge) alien identity hidden until earned: reveal, System feed slip, 3rd encounter with same persona, or spotting Wren at a dead drop (break-it 2026-10-08 r4: Wren never fights, so she had no reveal path) (code: alienPlayers.js)
//   - (limits) dead drops max 1 per 3 days; feed max 1 per day; same-rival hunts min 2 days apart (sporting rules); group encounters max 1 per 14 days, cooldown recorded on successful start only (break-it 2026-10-08 r4); benevolent help is deniable and subtle (code: alienPlayers.js)
//   - (favor) fan favor -100..100; high favor improves care packages and contest lean; low favor makes the crowd bloodthirsty (code: alienPlayers.js)
//   - (fan_clubs_per_lane) four audience clubs (fight/survival/social/showbiz); apFavor() is the loudest lane; legacy favor seeds all lanes on migration; drift is per-lane toward 0 (code: apState, apFavor, apAdjustFavor, apDailyTick, audit-shows 2026-10-09)
//   - (club_boons_vote) a lane at 50+ may vote a small favor — fight: +10 health, survival: +300 kcal pantry, social: +1 unity, showbiz: wacky curio — max 1 per 5 days, always announced (code: apClubBoon, audit-shows 2026-10-09)
//   - (package_club_credit) care packages name the loudest club; feed messages get per-lane lines at 50+ (code: apCarePackage, apPackageClubLine, apFeedMessage, audit-shows 2026-10-09)
//   - (integration) woven into contests (rigging/lifelines), codex (discoverable truth), village gossip, and NPC contacts (code: alienPlayers.js)
//   - (knowledge_alien_word) the word "alien" IS the alien truth and never appears in player-facing copy pre-reveal — the beam-horror lesson, sadistic package, contact establishment, duel feed, and Pip's rookie mistakes all gate on apKnowsAlien; stripping alien armor off a body reveals the persona on the spot (the item is literally named "Alien <piece>") — same class as the gated "MULTIPLE alien players" line (break-it 2026-10-09 r7) (code: alienPlayers.js)
//   - (knowledge_persona_names) persona names ("Countess Sable", "K'thari Expeditionary") are the alien truth too — there are no cover names in the data, so group banter, feed lines, and combat cards all gate names on apKnowsAlien (break-it 2026-10-10 r11: group encounters fire at 2 encounters, before the 3rd-encounter auto-reveal — the banter was naming them outright) (code: apGroupBanter, alienPlayers.js)
//   - (lifeline_player_only) the benevolent lifeline fires only at the player's own death roll — apContestInterference(ac, {forPlayer:true}) from contestChoose's killing-blow check and from tbEnd's arena-loss branch (break-it 2026-10-08: arena deaths never checked the lifeline). The save converts death into 'lost' and leaves the player barely alive (break-it 2026-10-08: 0-HP saves died at the next endDay). The verdict call never passes forPlayer, so deathSave is always false there — a villager's played death is never converted by a hidden roll (break-it 2026-10-08: the old playerIn-only gate fired the lifeline at VERDICT, wasting the 7-day cooldown on a non-death and erasing a villager's earned death) (code: apContestInterference, contestChoose, tbEnd)
//   - (people) they are PEOPLE: full ability sets, alien tech, they remember past encounters, escalate or soften, speak in their own voice (code: alienPlayers.js)
//   - (commentary) heavy unhinged mid-combat dialogue: onHit/onHurt/onWinning/onLosing/unhinged per persona, 15+ lines each, knowledge-gated (code: alienPlayers.js)
//   - (salvage_kill_only) alien armor salvage fires only on a real kill: a retreating persona ends the fight 'won' (drove them off) but leaves no body to strip — sibling honesty with monster 'routed' ("no meat, no trophy") (break-it 2026-10-09) (code: apOnCombatEnd)
//   - (death_permanent) a persona killed in combat (opts.killed) stays dead: rec.dead + deadDay, released from the playground, named honestly once (knowledge-gated), then excluded from EVERY pool — encounters, activation, groups, packages, dead drops, feed, rigging, lifelines, gossip, duels. Duel losers who can't afford another body die too (rich "come back"). The codex keeps the entry and records the fate. (break-it 2026-10-10 r12) (code: apOnCombatEnd, apIsDead)
//   - (outcome_lines) persona victoryLines are spoken when the PERSONA wins (player lost/fled); defeatLines when the persona loses (player won, drove them off). A killed persona speaks no post-fight line — the death beat replaces it. (break-it 2026-10-10 r12: the mapping was inverted) (code: apOnCombatEnd)
//   - (top_lane_ties) apTopLane breaks ties toward showbiz (the default crowd), per its contract (break-it 2026-10-10 r12: strict > gave ties to fight) (code: apTopLane)
//   - (wealth) broke personas retreat when losing (can't afford another body); rich never retreat and enrage when hurt (death is an inconvenience) (code: alienPlayers.js)
//   - (progression) alien players level alongside you: kit grows 3->6 abilities, tech upgrades; rich progress faster (buy), broke slower (earn) (code: alienPlayers.js)
//   - (groups) rare late-game 2-3 persona team encounters (day 40+, 3%, 14-day cooldown, needs 2+ established rivals) with inter-alien banter; they join the fight in turn via the tbEnd chain (wired break-it 2026-10-08 — was dead code) (code: alienPlayers.js, encounters.js)
//   - (playground) active aliens persist for days: kill villagers/monsters/animals, burn map (Sable/Vex), raid pantry/fire/trust (veterans), fight each other; max 3 active (code: alienPlayers.js)
//   - (factions) sadistic coordinate loosely (70%), benevolent solid (90%), neutral opportunistic; sadistic+benevolent never align (code: alienPlayers.js)
//   - (veterans) most aliens played before: exploit pantry/fire/trust mechanics; Pip is the rookie who makes charming mistakes (code: alienPlayers.js)
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
        favor: 0,          // legacy aggregate (kept in sync = loudest lane)
        lastDropDay: -999,
        lastFeedDay: -999,
        lastHuntDay: {},   // pid -> day (sporting rules)
        known: {},         // pid -> how the player learned (knowledge gate)
      };
      // FAN CLUBS PER LANE (audit-shows 2026-10-09): canon (docs/CONTESTS.md)
      // says "audience segments per lane that send care packages, vote, and
      // grow with highlights. Whatever you do, there's a club for it." The
      // old single favor is now four clubs: fight (Blood), survival
      // (Endurance), social (Moot), showbiz (Weird + TV shows). Migration:
      // legacy favor seeds every lane, so nothing earned is lost.
      var ap = s.alienPlayers;
      if (!ap.fanClubs) {
        var legacy = ap.favor || 0;
        ap.fanClubs = { fight: legacy, survival: legacy, social: legacy, showbiz: legacy };
      }
      return ap;
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
      // KNOWLEDGE GATE (Steve 2026-10-07): delegates to the unified canShow.
      try { return this.canShow('alien', pid, 'name'); }
      catch (e) { return !!(this.apState().known[pid]); }
    },

    apRevealAlien: function (pid, how) {
      var ap = this.apState();
      if (ap.known[pid]) return;
      ap.known[pid] = how || 'revealed';
      var p = this.apPersona(pid);
      if (p && this.state.systemArrived) {
        this.say('◈ You understand now: that wasn\'t human. That was ' + p.name + ' — ' + p.title + ' — wearing a person like a suit. (' + how + ')');
      }
      // CODEX (Steve 2026-10-08): the book catches up to the truth.
      try { this.apCodexEntry(pid); } catch (e) {}
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
        if (!this.apIsCombat(pid)) continue;
        if (this.apIsDead(pid)) continue; // the dead do not hunt (break-it r12)
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
          if (!this.apIsCombat(cp.id)) continue;
          // SPORTING RULES (Steve 2026-10-08): min 2 days between hunts by
          // the same persona. The due-rival gate above enforced this for the
          // priority path, but the weighted pool below bypassed it — a
          // hostile player could re-fight yesterday's rival daily (break-it
          // 2026-10-08: re-picked 400/400). Filter here too.
          if (day - (ap.lastHuntDay[cp.id] || -999) < 2) continue;
          if (this.apIsDead(cp.id)) continue; // corpses don't re-encounter (break-it r12)
          var w = cp.disposition === 'sadistic' ? 4 : cp.disposition === 'neutral' ? 4.5 : 1.5;
          // Existing rivals are more likely to return
          if (ap.met[cp.id] && ap.met[cp.id].encounters > 0) w *= 2;
          // TRACKED (break-it 2026-10-08): the sadistic persona package sets
          // flags.trackedBy ("they're watching") — the flag was never read.
          // A tracker knows where you sleep: triple encounter weight.
          try {
            var _s0 = this.state.scholar || {};
            if (_s0.flags && _s0.flags.trackedBy === cp.id) w *= 3;
          } catch (e0t) {}
          pool.push({ p: cp, w: w });
        }
        // Fallback: if the sporting filter emptied the pool (fought the whole
        // roster in 2 days — extreme), allow anyone rather than a silent no-op.
        if (!pool.length) {
          for (var i2 = 0; i2 < personas.length; i2++) {
            var cp2 = personas[i2];
            if (!this.apIsCombat(cp2.id)) continue;
            if (this.apIsDead(cp2.id)) continue; // corpses don't re-encounter (break-it r12)
            var w2 = cp2.disposition === 'sadistic' ? 4 : cp2.disposition === 'neutral' ? 4.5 : 1.5;
            if (ap.met[cp2.id] && ap.met[cp2.id].encounters > 0) w2 *= 2;
            // TRACKED (break-it 2026-10-08): same tracker boost in the
            // fallback pool — they find you regardless of sporting filters.
            try {
              var _s0b = this.state.scholar || {};
              if (_s0b.flags && _s0b.flags.trackedBy === cp2.id) w2 *= 3;
            } catch (e0u) {}
            pool.push({ p: cp2, w: w2 });
          }
        }
        var total = 0, k;
        for (k = 0; k < pool.length; k++) total += pool[k].w;
        var r = Math.random() * total;
        for (k = 0; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) { chosen = pool[k].p.id; break; } }
        if (!chosen && pool.length) chosen = pool[pool.length - 1].p.id;
      }

      // (break-it 2026-10-08: lastHuntDay is recorded by apStartEncounter on
      // success — the single source of truth, covering single rolls, group
      // chains, and debug starts alike.)
      return chosen;
    },

    // Ability kits: each combat persona gets 6 abilities that fit their style.
    // HONEST (break-it 2026-10-08): the old comment claimed "these are real
    // abilities from the game's pool — they fight like players." The kit ids
    // must be real pool ids (two weren't: pattern_recognition,
    // forage_identification), but the kit itself is persona flavor data
    // carried on the fighter — the bespoke tbAlienTurn AI does not consume
    // ability ids. Don't claim engine use the code doesn't have.
    // DATA-DRIVEN (Steve 2026-10-07): kits live in alienPlayers.json; the
    // hardcoded table below is a fallback for unknown pids only.
    apAbilityKit: function (pid) {
      var p = this.apPersona(pid);
      if (p && Array.isArray(p.abilityKit)) return p.abilityKit;
      var KITS = {
        // Vex: the hunter — tracking, patience, the perfect shot
        'vex_marlowe': ['tracker', 'patient_aim', 'soft_step', 'game_sense', 'adrenaline_control', 'eagle_eye'],
        // Sable: the despair collector — fear, presence, breaking wills
        'countess_sable': ['adrenaline_control', 'eyes_in_back', 'soft_step', 'game_sense', 'patient_aim', 'diplomat'],
        // Rax: the pain researcher — precision wounding, staying power
        'rax_dentist': ['triage', 'steady_hands', 'patient_aim', 'adrenaline_control', 'third_eye', 'soft_step'],
        // Pip: the tourist — enthusiastic, random, surprisingly lucky
        'pip_quindle': ['scrounger', 'soft_step', 'game_sense', 'adrenaline_control', 'squirrel_friend', 'rain_dancer'],
        // Sarge: the veteran — solid, honorable, fundamentals
        'sarge': ['adrenaline_control', 'patient_aim', 'triage', 'steady_hands', 'night_eyes', 'game_sense'],
        // Fenwick: the researcher — observation, analysis, adaptation
        'dr_fenwick': ['evidence_board', 'game_sense', 'patient_aim', 'soft_step', 'adrenaline_control', 'taste_vision'],
        // Old Tam: the atoner — deliberately holds back (throws fights)
        'old_tam': ['adrenaline_control', 'triage', 'game_sense', 'soft_step', 'patient_aim', 'generous'],
      };
      return KITS[pid] || ['adrenaline_control', 'game_sense', 'soft_step', 'patient_aim', 'eagle_eye', 'triage'];
    },

    // Alien tech: 1-2 pieces per persona that break normal rules.
    // This is what makes them scary — they're cheating and they know it.
    // DATA-DRIVEN (Steve 2026-10-07): tech lives in alienPlayers.json; the
    // hardcoded table below is a fallback for unknown pids only.
    apAlienTech: function (pid) {
      var p = this.apPersona(pid);
      if (p && Array.isArray(p.alienTech)) return p.alienTech;
      var TECH = {
        'vex_marlowe': [
          { id: 'phase_net', name: 'Phase-net', desc: 'Phase-laced filament net, worn like a shawl. It hums when you think about running.' },
          { id: 'trophy_scope', name: 'Trophy Scope', desc: 'A scope that drinks in every detail. Vex notices everything \u2014 especially you.' },
        ],
        'countess_sable': [
          { id: 'dread_projector', name: 'Dread Projector', desc: 'Projects your worst memory on loop. Her strikes leave you Afraid \u2014 and fear makes her hit harder.' },
          { id: 'crystal_lattice', name: 'Crystal Lattice', desc: 'A crystal lattice that drinks in dread. Her strikes land harder on an Afraid target \u2014 fear in, damage out.' },
        ],
        'rax_dentist': [
          { id: 'nerve_mapper', name: 'Nerve Mapper', desc: 'Maps your nerves in real time. Rax always knows exactly where it hurts \u2014 and likes to prolong it.' },
          { id: 'stasis_field', name: 'Stasis Field', desc: 'Prevents fleeing. You leave when Rax says you leave.' },
        ],
        'pip_quindle': [
          { id: 'tourist_cam', name: 'Tourist Cam', desc: 'Records everything. Pip gets stronger the longer the fight goes (more footage).' },
        ],
        'sarge': [
          { id: 'veteran_plate', name: 'Veteran Plate', desc: 'Military-grade armor. Reduces all damage by 2. Sarge earned this.' },
        ],
        'dr_fenwick': [
          { id: 'specimen_scanner', name: 'Specimen Scanner', desc: 'A specimen scanner, always humming. Fenwick catalogues everything \u2014 wingspan, stride, the way you favor your left. For the collection, he says. Probably.' },
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
      // DEAD (break-it r12): refuse to start a fight with a corpse — debug
      // spawns and group chains alike. No phantom, just a refusal.
      if (this.apIsDead(pid)) return false;

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
        // Only the pid persists: the fighter itself rides the tbfight
        // snapshot in syncRun (and goes stale the moment the fight advances).
        // Storing it here too duplicated it in every mid-fight alien save and
        // nothing ever read the copy (break-it persistence 2026-10-11 r10).
        this.state.alienEncounter = { pid: pid };
        this.say('👤 A figure steps out of the treeline. Human-shaped. But something\'s wrong.');
        this.say('They move like someone who\'s done this before. Many times. On many worlds.');
        this.apCombatIntro(pid);
        // BEAM READINESS (Steve 2026-10-08): the player should KNOW when
        // they're not ready. apBeamResistText was dead code — now it's the
        // pre-fight warning, once per player, when facing a KNOWN beam-user
        // (pre-reveal it would name the alien truth; the horror beat covers
        // the mid-fight lesson for the unready).
        try {
          var s0 = this.state.scholar || {};
          if (!s0._beamReadoutSeen && this.apKnowsAlien(pid) && this.apHasBeam(pid)) {
            s0._beamReadoutSeen = true;
            this.say(this.apBeamResistText());
          }
        } catch (e0) {}
        // Trigger combat with the hostile fighter
        // (Combat system handles 'hostile' kind as an enemy)
        // HONEST (break-it 2026-10-08): startAlienCombat returns null when a
        // fight is already active. Returning true anyway left a phantom
        // alienEncounter (and let apStartGroupEncounter re-arm alienGroup)
        // around a fight that never began — the next tbEnd then recorded a
        // phantom met-encounter for combat that never happened.
        if (this.startAlienCombat) {
          if (!this.startAlienCombat(fighter)) {
            try { delete this.state.alienEncounter; } catch (e2b) {}
            return false;
          }
        } else {
          // Fallback: use the standard combat flow
          this.say('(The stranger raises their hands. This is going to hurt.)');
          // HONEST (break-it 2026-10-09): no fight started on this path —
          // leaving state.alienEncounter set would let a LATER unrelated
          // tbEnd read it as this fight's persona and record a phantom
          // encounter (favor, met-count, armor). Clear it.
          try { delete this.state.alienEncounter; } catch (e2d) {}
        }
        // SPORTING RULES (break-it 2026-10-08): a hunt happened — record it.
        // The roll used to record lastHuntDay before the fight started (and
        // the group chain never recorded it at all), so chained personas
        // could be re-rolled by the single pool the very next day. Record on
        // success only: a refused start is not a hunt.
        try { this.apState().lastHuntDay[pid] = (this.state.scholar || {}).day || 1; } catch (e2c) {}
        return true;
      } catch (e) {
        // HONEST (break-it 2026-10-09): the two inner failure paths clear
        // state.alienEncounter, but this outer catch didn't — any throw
        // between the state write and the guarded paths (combat intro,
        // beam readout, startAlienCombat itself) left a PHANTOM
        // alienEncounter. The next unrelated tbEnd then read it as this
        // fight's persona and recorded a phantom encounter (favor,
        // met-count, armor strip) for combat that never began.
        try { delete this.state.alienEncounter; } catch (e2e) {}
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

    // DATA-DRIVEN (Steve 2026-10-07): is this persona a combatant?
    // Reads the `combat` flag from alienPlayers.json; falls back to the
    // hardcoded COMBAT_PILOTS list for unknown pids.
    apIsCombat: function (pid) {
      var p = this.apPersona(pid);
      if (p && typeof p.combat === 'boolean') return p.combat;
      return COMBAT_PILOTS.includes(pid);
    },

    // DEATH IS PERMANENT (break-it 2026-10-10 r12): apOnCombatEnd marks
    // rec.dead on a real kill. Every selection pool below consults this —
    // a corpse never re-encounters, never activates, never raids, never
    // rigs, never lifelines, never gossips.
    apIsDead: function (pid) {
      try {
        var rec = (this.apState().met || {})[pid];
        return !!(rec && rec.dead);
      } catch (e) { return false; }
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

      // MECHANICS ARE KNOWLEDGE-FREE (break-it 2026-10-10 r13): the (wealth)
      // canon rule — broke retreats when losing, rich enrages when hurt —
      // is unconditional. The old code set _enraged/_wantsRetreat ONLY
      // inside the apKnowsAlien announcement gate, so a rich persona fought
      // pre-reveal never enraged (no 1.5x damage, no beam +0.2) and broke
      // personas skipped their retreat flag on fights 1-2. Theatrics are
      // announced; the stance itself always applies.
      if (stance === 'enraged') fighter._enraged = true;
      if (stance === 'retreating') fighter._wantsRetreat = true;

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
        } else if (stance === 'retreating') {
          var retreatLines = {
            'pip_quindle': "Okay okay okay I can't afford another one of these! I'm OUT! Great fight though!",
            'sarge': "...Tactical withdrawal. Nothing personal.",
            'dr_fenwick': "The data suggests I should NOT be here anymore! Withdrawing!",
            'old_tam': "That's enough. I'm too old and too poor for this.",
          };
          var rl = retreatLines[pid] || "I can't afford to die here. Falling back!";
          this.say('🎭 ' + p.name + ': "' + rl + '"');
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
        if (ap.met[pid].encounters >= 2 && this.apIsCombat(pid) && !this.apIsDead(pid)) rivals++;
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
        if (ap.met[pid].encounters >= 2 && this.apIsCombat(pid) && !this.apIsDead(pid)) {
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

      // HONEST (break-it 2026-10-08 r4): the 14-day cooldown used to burn at
      // ROLL time — a refused start (fight already active) wasted it with no
      // fight. Recorded in apStartGroupEncounter on success instead.
      return group;
    },

    // Team banter: they talk to EACH OTHER, not just you.
    apGroupBanter: function (pids) {
      if (!pids || pids.length < 2) return;
      // KNOWLEDGE GATE (break-it 2026-10-10 r11): the banter above named
      // personas outright pre-reveal — but there are no cover names in the
      // data. p.name ("Countess Sable", "K'thari Expeditionary (Ret.)") IS
      // the alien truth: the fighter card says "Stranger" and the combat
      // intro stays silent pre-reveal. A group encounter can fire at 2
      // encounters, BEFORE the 3rd-encounter auto-reveal, so the banter
      // must gate too. Pre-reveal the team-up is anonymous: generic lines
      // only.
      var self = this;
      var _allKnown = true;
      for (var _gi = 0; _gi < pids.length; _gi++) {
        try { if (!self.apKnowsAlien(pids[_gi])) { _allKnown = false; break; } } catch (e) { _allKnown = false; break; }
      }
      var names = pids.map(function (pid) {
        var p = self.apPersona(pid);
        if (!p) return 'A stranger';
        return _allKnown ? p.name : 'A stranger';
      });

      if (_allKnown) {
        this.say('👥 ' + names.join(' and ') + ' step out together. This is... not good.');
      } else {
        this.say('👥 ' + (pids.length >= 3 ? 'Three figures' : 'Two figures') + ' step out together. You don\'t know their names. This is... not good.');
      }

      // Personality-driven team dynamics (known personas speak in their own
      // voice; pre-reveal the team-up stays anonymous)
      var hasVex = _allKnown && pids.includes('vex_marlowe');
      var hasSable = _allKnown && pids.includes('countess_sable');
      var hasSarge = _allKnown && pids.includes('sarge');
      var hasPip = _allKnown && pids.includes('pip_quindle');
      var hasRax = _allKnown && pids.includes('rax_dentist');
      var hasFenwick = _allKnown && pids.includes('dr_fenwick');
      var hasTam = _allKnown && pids.includes('old_tam');

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
        // Generic team-up (also the pre-reveal fallback)
        this.say('🎭 ' + names[0] + ': "Together, then. Don\'t get in my way."');
        this.say('🎭 ' + names[1] + ': "Wouldn\'t dream of it. Probably."');
      }

      if (_allKnown) {
        this.say('(⚠ MULTIPLE alien players. This is a major event. The System is watching closely.)');
      } else {
        this.say('(⚠ Multiple hostiles — and they\'re coordinating. This is a major event. The System is watching closely.)');
      }
      // HONEST (break-it 2026-10-10 r11): the old copy claimed the player
      // "survived a group encounter setup" at FIGHT START — nothing has been
      // survived yet. The favor is for facing it.
      try { this.apAdjustFavor(5, 'faced down a group encounter — the crowd loves a spectacle', 'fight'); } catch (e) {}
    },

    // Start a group encounter with 2-3 alien players
    apStartGroupEncounter: function (pids) {
      if (!pids || pids.length < 2) return false;
      // DEAD (break-it r12): a group is only as alive as its members.
      pids = pids.filter(function (pid) { return !this.apIsDead(pid); }, this);
      if (pids.length < 2) return false;
      // Build fighters for each (they'll be added to the encounter)
      // They join the fight IN TURN: the tbEnd wrap chains the next persona
      // via state.alienGroup when the current fight is won (fleeing or
      // losing disperses the group). Break-it 2026-10-08: state.alienGroup
      // was written here and never read — "they'll join in turn" was a lie.
      var first = pids[0];
      try {
        this.state.alienGroup = { pids: pids, current: 0 };
      } catch (e) {}
      var ok = false;
      try { ok = !!this.apStartEncounter(first); } catch (e2) { ok = false; }
      if (!ok) { try { delete this.state.alienGroup; } catch (e3) {} return false; }
      // HONEST (break-it 2026-10-08 r4): the 14-day cooldown burned at roll
      // time, so a refused start wasted it. Record on success only — and the
      // banter plays for a fight that actually begins, not a phantom one.
      try { this.apState().lastGroupDay = (this.state.scholar || {}).day || 1; } catch (e4) {}
      this.apGroupBanter(pids);
      this.say('(The others are circling. They\'ll join the fight in turn.)');
      return true;
    },


    apOnCombatEnd: function (pid, outcome, opts) {
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

      var killed = !!(opts && opts.killed);
      // DEATH IS PERMANENT (break-it 2026-10-10 r12): a killed persona used
      // to keep no record of dying — every selection pool (encounters,
      // activation, groups, packages, feed, rigging, the playground itself)
      // kept re-picking the corpse, and each re-kill re-granted favor and
      // another armor roll. People stay dead, like villagers.
      if (killed) {
        rec.dead = true;
        rec.deadDay = day;
        try { delete this.apActive()[pid]; } catch (e0d) {}
        // The dead do not give post-fight quotes. The kill is said out loud,
        // knowledge-gated like every other naming.
        var _dk = false;
        try { _dk = !!this.apKnowsAlien(pid); } catch (e0dk) {}
        if (_dk) this.say('🎭 ' + p.name + ' goes still. The suit stops moving. Whatever was wearing it is gone. They are not coming back.');
        else this.say('🎭 The stranger goes still. Whoever they were wearing, it\'s empty now. They are not coming back.');
        try { this.sysSay('◈ "One less player in the game. The feed observes a moment of silence. Then the betting resumes."'); } catch (e0ds) {}
      } else {
        // Pilot-specific outcome lines.
        // HONEST (break-it 2026-10-10 r12): the mapping was INVERTED — a
        // player win played the persona's VICTORY lines (the loser gloating
        // "Magnificent. Truly. The moment the light went out") and a player
        // loss played their DEFEAT lines ("You BEAT me!"). victoryLines are
        // spoken when the PERSONA wins; defeatLines when the persona loses.
        var lines = outcome === 'won' ? p.defeatLines : p.victoryLines;
        if (lines && lines.length && this.apKnowsAlien(pid)) {
          this.say('🎭 ' + p.name + ': "' + lines[Math.floor(Math.random() * lines.length)] + '"');
        }
      }

      // ALIEN ARMOR SALVAGE (Steve 2026-10-07): defeating an alien player
      // lets you strip their armor. This is how you GET beam-resistant gear.
      // The transition: kill them (hard, risky) → take their armor → survive beams.
      // KILL-ONLY (break-it 2026-10-09): a broke persona that retreats ends the
      // fight 'won' (you drove them off) — but there is no body to strip. The
      // old code salvaged armor off a fled opponent 60% of the time, with copy
      // claiming "from their body. It's warm." Sibling honesty: a monster
      // 'routed' gives "no meat, no trophy" (game.js) — the alien pool matches.
      if (outcome === 'won' && killed) {
        try {
          var armorPool = ['alien_helm', 'alien_carapace', 'alien_greaves', 'alien_gauntlets', 'alien_boots'];
          // Don't drop what you already have
          var have = {};
          try {
            var eq = (this.state.scholar || {}).equipped || {};
            for (var sk in eq) {
              var it = eq[sk];
              if (it) have[it.itemId || it.id] = true;
            }
            var inv2 = (this.state.scholar || {}).inventory || [];
            for (var ii = 0; ii < inv2.length; ii++) {
              if (inv2[ii]) have[inv2[ii].itemId || inv2[ii].id] = true;
            }
          } catch (e) {}
          var available = armorPool.filter(function(id) { return !have[id]; });
          if (available.length > 0 && Math.random() < 0.6) {
            var dropId = available[Math.floor(Math.random() * available.length)];
            var dropDef = null;
            var allItems = this.data.items || [];
            for (var di = 0; di < allItems.length; di++) {
              if (allItems[di].id === dropId) { dropDef = allItems[di]; break; }
            }
            if (dropDef) {
              // HONEST (break-it 2026-10-09): this.grantItem never existed —
              // the old `if (this.giveItem)` branch was dead and every
              // salvage fell into the else, pushing a bare {itemId,id}
              // brick (no name, no units): the exact brick class r4 fixed
              // in apCarePackage/apPersonaPackage via apGrantItem, missed
              // here. The armor transition's core reward — kill them, strip
              // their armor, survive beams — never actually worked.
              try { this.apGrantItem(dropId); } catch (e) {}
              this.say('◈ You strip ' + dropDef.name.toLowerCase() + ' from their body. It\'s warm. It\'s still humming. This will stop beam weapons.');
              // HONEST (break-it 2026-10-09 r7): the armor is literally named
              // "Alien <piece>" — holding humming alien hardware off a warm
              // body IS learning the truth firsthand. The strip reveals them,
              // so the item name never precedes the knowledge. (A kill with
              // no salvage still follows the normal reveal paths.)
              try { if (!this.apKnowsAlien(pid)) this.apRevealAlien(pid, 'you stripped their armor'); } catch (e) {}
            }
          } else if (available.length === 0) {
            this.say('◈ They were wearing standard gear — nothing you don\'t already have.');
          }
        } catch (e) {}
      }

      // Fan favor: the audience judges your performance
      // KNOWLEDGE GATE (break-it 2026-10-10 r13): the why-copy names the
      // persona and apAdjustFavor sysSays it when |n|>=3 — pre-reveal that
      // put "defeated Countess Sable" on the System feed on fight 1-2
      // (the 3rd-encounter reveal runs earlier in this function, so fight 3
      // names honestly). Pre-reveal the crowd cheers a stranger.
      var _favKnown = false;
      try { _favKnown = !!this.apKnowsAlien(pid); } catch (e0fk) {}
      var _foe = _favKnown ? p.name : 'the stranger';
      if (outcome === 'won') {
        // Stylish wins please the crowd; stomping a tourist doesn't
        var gain = (p.disposition === 'sadistic') ? 6 : (p.id === 'pip_quindle' ? 1 : 4);
        this.apAdjustFavor(gain, 'defeated ' + _foe, 'fight');
      } else if (outcome === 'lost') {
        this.apAdjustFavor(-2, 'lost to ' + _foe, 'fight');
      } else if (outcome === 'fled') {
        this.apAdjustFavor(-5, 'fled from ' + _foe + ' — the crowd boos', 'fight');
      }

      // Benevolent bond deepens
      if (p.disposition === 'benevolent' && outcome === 'won') {
        rec.bond = (rec.bond || 0) + 1;
      }

      ap.met[pid] = rec;

      // CODEX (Steve 2026-10-08): every encounter is discoverable truth.
      // Knowledge-gated inside apCodexEntry — pre-reveal the entry reads
      // as the human persona, never the alien truth.
      try { this.apCodexEntry(pid); } catch (e) {}
    },

    // ---------- fan favor (per-lane clubs) ----------
    // apFavor() is the CROWD'S MOOD: the lane with the strongest feeling,
    // sign preserved. A club that loves you (+100) unlocks the favor gates;
    // a club that hates you (-100) makes the crowd bloodthirsty — the old
    // -100..100 threshold semantics (care packages >= 20, booing <= -30)
    // keep working, now driven by whichever club feels most.
    apFavor: function () {
      var ap = this.apState();
      var fc = ap.fanClubs;
      if (!fc) return ap.favor || 0;
      var best = 0, bestAbs = -1;
      var lanes = ['fight', 'survival', 'social', 'showbiz'];
      for (var i = 0; i < lanes.length; i++) {
        var v = fc[lanes[i]] || 0;
        var a = Math.abs(v);
        if (a > bestAbs) { bestAbs = a; best = v; }
      }
      return best;
    },

    // One club's favor.
    apFanLane: function (lane) {
      var fc = this.apState().fanClubs || {};
      return fc[lane] || 0;
    },

    // Which club is loudest right now (ties -> showbiz, the default crowd).
    apTopLane: function () {
      var fc = this.apState().fanClubs || {};
      var best = 'showbiz', bestV = -101;
      var lanes = ['fight', 'survival', 'social', 'showbiz'];
      for (var i = 0; i < lanes.length; i++) {
        var v = fc[lanes[i]] || 0;
        // HONEST (break-it 2026-10-10 r12): the comment always promised ties
        // break toward showbiz, but strict > let the first lane (fight) win
        // every tie. >= with showbiz last in the order keeps the promise.
        if (v >= bestV) { bestV = v; best = lanes[i]; }
      }
      return best;
    },

    // Legacy mirror: state.alienPlayers.favor always equals apFavor(),
    // so direct readers of the field keep working.
    apSyncFavor: function () {
      var ap = this.apState();
      ap.favor = this.apFavor();
      return ap.favor;
    },

    // Plain-language club names for announcements (descriptive, not proper
    // nouns — the clubs are audience segments, not characters).
    apClubName: function (lane) {
      return { fight: 'your fight fans', survival: 'your survival fans',
        social: 'your moot crowd', showbiz: 'your showbiz fans' }[lane] || 'your fans';
    },

    apAdjustFavor: function (n, why, lane) {
      var ap = this.apState();
      var L = lane || 'showbiz';
      ap.fanClubs = ap.fanClubs || { fight: 0, survival: 0, social: 0, showbiz: 0 };
      if (typeof ap.fanClubs[L] !== 'number') ap.fanClubs[L] = 0;
      ap.fanClubs[L] = Math.max(-100, Math.min(100, ap.fanClubs[L] + n));
      // Legacy mirror stays in sync (direct readers of
      // state.alienPlayers.favor keep working).
      this.apSyncFavor();
      if (why && Math.abs(n) >= 3 && this.state.systemArrived) {
        var dir = n > 0 ? '📈' : '📉';
        this.sysSay(dir + ' ' + this.apClubName(L) + ' ' + (n > 0 ? '+' : '') + n + ' — ' + why + ' (favor: ' + ap.fanClubs[L] + ')');
      }
    },

    // Grant a real inventory entry for an item id (package gifts). Builds the
    // entry from the item def — name, units, kg — so the thing is actually
    // usable: useItem reads item.name and decrements item.units, and a bare
    // {itemId,id} entry crashed the first and NaN'd the second (break-it
    // 2026-10-08 r4: the "beautiful alien medkit" was an unusable brick).
    apGrantItem: function (itemId) {
      var def = null;
      try {
        var items = this.data.items || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].id === itemId) { def = items[i]; break; }
        }
      } catch (e) {}
      var entry = {
        itemId: itemId,
        id: itemId + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 9999),
        name: (def && def.name) || itemId,
        units: 1,
      };
      if (def && def.kg != null) entry.kg = def.kg;
      if (def && def.kcalEach != null) entry.kcalEach = def.kcalEach;
      try {
        var s = this.state.scholar;
        s.inventory = s.inventory || [];
        s.inventory.push(entry);
      } catch (e2) {}
      return entry;
    },

    // Wacky gift pool (canon; break-it fame-seeker 2026-10-10): fan gifts
    // are curios, NEVER dinner — docs/CONTESTS.md "fan care packages
    // (wacky, never dinner)". The "Can labeled BEANS" (350 kcal, class
    // food) is dinner wearing a joke label; the _showEnd prize filter
    // excluded it 2026-10-09 but apCarePackage and the club-boon curio
    // kept granting it. One helper, one rule — both fan paths call this.
    // Returns the item def, or null when the vault is shy (never falls
    // back to food — callers say the shyness out loud).
    apWackyGift: function (tier) {
      var items = [];
      try { items = this.data.items || []; } catch (e) {}
      var t = tier || 1;
      var cands = items.filter(function (it) {
        return it.origin === 'alien' && (it.tier || 1) <= t
          && !it.kcalEach && it.class !== 'food';
      });
      if (!cands.length) return null;
      return cands[Math.floor(Math.random() * cands.length)];
    },

    // Care package: the fan club sends supplies. Quality and frequency scale
    // with favor. Deepens the existing "wacky and available, not core" rule.
    apCarePackage: function () {
      var ap = this.apState();
      var favor = this.apFavor(); // wired (break-it 2026-10-08): apFavor had no runtime callers
      if (favor < 20) return false; // the crowd doesn't love you enough yet
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastPackageDay || -999) < 4) return false; // max 1 per 4 days

      ap.lastPackageDay = day;
      // Package quality scales with favor
      var tier = favor >= 70 ? 3 : favor >= 40 ? 2 : 1;
      // WACKY, NEVER DINNER (canon; break-it fame-seeker 2026-10-10): the
      // "Can labeled BEANS" (350 kcal, class food) used to be grantable
      // here — dinner wearing a joke label. The _showEnd prize filter
      // learned this 2026-10-09; this path had the same hole. One helper,
      // one rule (code: apWackyGift).
      var gift = this.apWackyGift ? this.apWackyGift(tier) : null;

      // Plus some practical supplies (the fans know you need to eat)
      // WACKY, NEVER DINNER (canon; break-it shows 2026-10-09): the old
      // formula (300 + rand*400 + favor*5) handed over up to ~800+ kcal — a
      // free day of food every 4 days, and a kcal-positive loop with the
      // ratings stunt (200 kcal cost, 400+ back). The package is the wacky
      // gift; the snacks are a taste, not a meal.
      var kcal = 30 + Math.floor(Math.random() * 40);

      this.say('📦 A care package drops from the sky with a little parachute. There\'s a note: "WE LOVE YOU!' + this.apPackageClubLine() + '"');
      // AUDIO (break-it 2026-10-09, sibling of the silent alien beam): the
      // fanPackageDrop voice was built for exactly this beat (descent
      // whistle, silk flutter, thump) but only the fan-package unboxing
      // fired it — the alien care package fell silently.
      try { this.audioEvent('fanPackageDrop'); } catch (e) {}
      if (gift) {
        this.say('Inside: ' + (gift.name || gift.id) + (gift.desc ? ' — ' + gift.desc : ''));
        // HONEST (break-it 2026-10-08): the gift used to land in
        // state.scholar.pack — an array no system reads, so the item was
        // invisible and unusable. Inventory is what equipping reads.
        // HONEST (break-it 2026-10-08 r4): the bare {itemId,id} entry had no
        // name and no units — useItem crashed on item.name.toLowerCase()
        // (TypeError) and item.units-- went NaN, so the "gift" was a brick.
        // apGrantItem builds a real, usable entry from the item def.
        try { this.apGrantItem(gift.id); } catch (e) {}
      } else {
        // Said out loud, never a silent pocket (no-silent-actions rule).
        this.say('The vault was feeling shy tonight — just the snacks. The thought is televised.');
      }
      this.say('Plus ' + kcal + ' kcal of fan-approved snacks.');
      try { var _cap = this.kcalCap ? this.kcalCap() : 2400; this.state.scholar.kcal = Math.min(_cap, (this.state.scholar.kcal || 0) + kcal); } catch (e) {}
      return true;
    },

    // Club credit: the package comes from your LOUDEST club, said out loud.
    apPackageClubLine: function () {
      try {
        var top = this.apTopLane();
        if ((this.apFanLane(top) || 0) >= 20) return ' — ' + this.apClubName(top);
      } catch (e) {}
      return '';
    },

    // CLUB BOONS (audit-shows 2026-10-09): the clubs "vote" (docs/CONTESTS.md:
    // "the audience can vote small favors"). A lane at 50+ may vote you a
    // small favor — max 1 per 5 days, always announced, always real. This is
    // the vote mechanic; the care package is the gift mechanic.
    apClubBoon: function () {
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastBoonDay || -999) < 5) return false;
      if (Math.random() > 0.15) return false;
      var top = this.apTopLane();
      if ((this.apFanLane(top) || 0) < 50) return false;
      ap.lastBoonDay = day;
      var club = this.apClubName(top);
      if (top === 'fight') {
        this.say('📦 ' + club.charAt(0).toUpperCase() + club.slice(1) + ' voted: a training stimulant, military-grade, questionably legal. You feel dangerous.');
        try { var s = this.state.scholar; s.health = Math.min(this.maxHealth(), (s.health || 0) + 10); } catch (e) {}
        this.say('(+10 health. The crowd approves of your continued breathing.)');
      } else if (top === 'survival') {
        this.say('📦 ' + club.charAt(0).toUpperCase() + club.slice(1) + ' voted: trail rations for the pantry. They want you ALIVE out there.');
        try {
          var pday = (this.state.scholar || {}).day || 1;
          var share = { name: "Fan-voted trail rations", kcalEach: 150, units: 2, spoilDay: pday + 9, safe: true };
          var added = (typeof this.pantryAdd === 'function') ? this.pantryAdd(share) : false;
          this.say(added ? '(+300 kcal to the pantry, voted by your fans.)' : '(The pantry is full — the village eats the voted rations on the spot.)');
        } catch (e) {}
      } else if (top === 'social') {
        this.say('📦 ' + club.charAt(0).toUpperCase() + club.slice(1) + ' voted: a spotlight segment on your people. The village stands a little taller today.');
        try { this.leadShift('unity', 1); } catch (e) {}
        this.say('(+1 unity. Being seen, together.)');
      } else {
        this.say('📦 ' + club.charAt(0).toUpperCase() + club.slice(1) + ' voted: a wacky curio, gift-wrapped, no note. The note would have explained it. There is no note.');
        try {
          // WACKY, NEVER DINNER (canon; break-it fame-seeker 2026-10-10):
          // same BEANS hole as apCarePackage had — one helper, one rule.
          var wg = this.apWackyGift ? this.apWackyGift(1) : null;
          if (wg) this.apGrantItem(wg.id);
          else this.say('(The vault was shy — the thought counts. The thought is televised.)');
        } catch (e) {}
      }
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
        if (this.apIsDead(per.id)) continue; // the dead leave no drops (break-it r12)
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
      try { var _cap = this.kcalCap ? this.kcalCap() : 2400; this.state.scholar.kcal = Math.min(_cap, (this.state.scholar.kcal || 0) + kcal); } catch (e) {}
      // WREN (break-it 2026-10-08 r4): she never fights, so she had no
      // encounters and no reveal path — apKnowsAlien('wren') was forever
      // false and her introLines/signature were dead content. Her data says
      // "eventually Wren risks direct contact": after repeated drops you may
      // spot her at the cache, and then you know.
      try {
        if (helper.id === 'wren') {
          ap.wrenDrops = (ap.wrenDrops || 0) + 1;
          if (ap.wrenDrops >= 3 && !ap.known.wren && Math.random() < 0.25) {
            var wIntro = (helper.introLines && helper.introLines[0]) || '"...don\'t react."';
            this.say('👁 ' + wIntro);
            this.apRevealAlien('wren', 'you spotted her leaving a cache');
          }
        }
      } catch (e2w) {}
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
      var favor = this.apFavor(); // wired (break-it 2026-10-08)
      var msgs = [];
      var msgPids = []; // parallel: which persona (if any) this message names

      // Rival gossip (sadistic pilots you've met talk about you)
      for (var pid in ap.met) {
        var per = this.apPersona(pid);
        // DEAD (break-it r12): the dead are not "overheard saying" things.
        if (per && per.disposition === 'sadistic' && ap.met[pid].encounters > 0 && !this.apIsDead(pid)) {
          msgs.push('"' + per.name.toUpperCase() + ' was overheard saying the human is "still interesting. For now." Your people just felt the room turn against them."');
          msgPids.push(pid);
        }
      }

      // Fan chatter scales with favor
      if (favor >= 50) {
        msgs.push('"Your fan club is GROWING. There\'s fan art. It\'s... surprisingly good. The System is confused but supportive."'); msgPids.push(null);
        msgs.push('"Betting pools favor you 3-to-1 now. The smart money says you\'re learning faster than the monsters."'); msgPids.push(null);
      } else if (favor <= -30) {
        msgs.push('"The crowd is getting restless. "BORING," says the feed. The sadistic ones are smiling."'); msgPids.push(null);
        msgs.push('"Your approval rating just dropped. Someone in the audience threw a tomato. Through the screen. How."'); msgPids.push(null);
      } else {
        msgs.push('"The audience is watching. The gamblers are watching. Everyone\'s watching. No pressure."'); msgPids.push(null);
      }

      // FAN CLUBS PER LANE (audit-shows 2026-10-09): a loud club (50+) gets
      // its own feed line — the gossip lane has its own celebrities, and
      // the feed should know which crowd is chanting.
      try {
        if (this.apFanLane('fight') >= 50) { msgs.push('"The fight clubs are making banners. Your name, in fire. The sadistic ones are taking it personally."'); msgPids.push(null); }
        if (this.apFanLane('survival') >= 50) { msgs.push('"The long-haul fans are sending trail mix. Actual trail mix. Through the screen. Nobody knows how."'); msgPids.push(null); }
        if (this.apFanLane('social') >= 50) { msgs.push('"The moot crowd has a chant for you now. It rhymes. It\'s devastating in debates."'); msgPids.push(null); }
        if (this.apFanLane('showbiz') >= 50) { msgs.push('"Your showbiz fans voted you "most watchable human" three weeks running. The trophy is a small moon."'); msgPids.push(null); }
      } catch (e) {}

      // Benevolent whispers (deniable)
      var wren = this.apPersona('wren');
      if (wren && Math.random() < 0.2) {
        msgs.push('"A message board post, quickly deleted: \'stay away from the northern treeline for a while. trust me.\' — the System claims it saw nothing."');
        msgPids.push(null);
      }

      if (msgs.length) {
        var _mi = Math.floor(Math.random() * msgs.length);
        this.sysSay(msgs[_mi]);
        // HONEST (break-it 2026-10-09): the old line named the rival on the
        // feed and then revealed them only 30% of the time — the other 70%
        // you HEARD the name but the system still called them "Stranger".
        // Naming someone on the System feed IS the reveal path ("the System
        // feed named them"); it fires whenever the naming is actually heard.
        var _np = msgPids[_mi];
        if (_np && !this.apKnowsAlien(_np)) {
          try { this.apRevealAlien(_np, 'the System feed named them'); } catch (e2n) {}
        }
      }
      return true;
    },

    // ---------- daily off-screen tick ----------
    apDailyTick: function () {
      if (!this.apEligible()) return;
      var ap = this.apState();
      // Favor drifts slowly toward 0 (the crowd forgets) — per lane now.
      var fc = ap.fanClubs || {};
      var lanes = ['fight', 'survival', 'social', 'showbiz'];
      for (var li = 0; li < lanes.length; li++) {
        var L = lanes[li];
        if ((fc[L] || 0) > 0) fc[L] = Math.max(0, fc[L] - 1);
        else if ((fc[L] || 0) < 0) fc[L] = Math.min(0, fc[L] + 1);
      }
      this.apSyncFavor();

      // Off-screen actions (each self-limited by cooldowns)
      try { this.apDeadDrop(); } catch (e) {}
      try { this.apFeedMessage(); } catch (e) {}
      // Care packages are rarer — check every day, gate inside
      try { if (Math.random() < 0.25) this.apCarePackage(); } catch (e) {}
      // CLUB BOONS (audit-shows 2026-10-09): canon says clubs "vote" —
      // a loud club (lane >= 50) votes you small favors. Max 1 per 5 days.
      try { this.apClubBoon(); } catch (e) {}
      // Playground: persistent aliens act (kill, burn, raid, duel)
      try { this.apPlaygroundTick(); } catch (e) {}
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
    apContestInterference: function (ac, opts) {
      if (!this.apEligible()) return { winMod: 0, deathSave: false, note: null };
      var ap = this.apState();
      var result = { winMod: 0, deathSave: false, note: null };
      var day = (this.state.scholar || {}).day || 1;
      // FOR-PLAYER (break-it 2026-10-08): the verdict-only call site can never
      // have the player as a participant, so the benevolent lifeline below
      // was unreachable in real play. contestChoose calls with
      // {forPlayer:true} at the player's death roll — sadistic rigging and
      // fan favor are verdict-only fiction (they bend verdict performance,
      // which doesn't exist on the playable path), so they're skipped here;
      // only the lifeline is evaluated.
      var forPlayer = !!(opts && opts.forPlayer);

      // SADISTIC RIGGING: a rival who's met you may rig the contest
      if (!forPlayer) {
      for (var pid in ap.met) {
        var per = this.apPersona(pid);
        if (!per || per.disposition !== 'sadistic') continue;
        if (ap.met[pid].encounters < 2) continue; // needs a real rivalry
        if (this.apIsDead(pid)) continue; // the dead rig nothing (break-it r12)
        if (day - (ap.lastRigDay || -999) < 5) continue; // LIMIT: max 1 rig per 5 days
        if (Math.random() < 0.35) {
          ap.lastRigDay = day;
          result.winMod -= 0.12;
          result.note = '📺 ' + per.name + ' is in the judging booth. They\'re smiling. That\'s never good.';
          if (this.apKnowsAlien(pid)) {
            this.say(result.note + ' "' + (per.taunts[0] || 'Enjoy the show.') + '"');
          } else {
            this.say('📺 One of the judges is smiling too widely. Your people just felt the room turn against them.');
          }
          break;
        }
      }
      } // end SADISTIC RIGGING (verdict-only)

      // BENEVOLENT LIFELINE: a bonded ally may save you from death.
      // HONEST (Steve 2026-10-08): the note promises "the killing blow
      // misses". The lifeline fires ONLY at the player's own death roll —
      // contestChoose calls with {forPlayer:true} at the killing blow, and
      // tbEnd's arena-loss branch calls the same way (break-it 2026-10-08).
      // HONEST (break-it 2026-10-08): the old gate was `playerIn` alone, so
      // _contestVerdict's call (no forPlayer) fired the lifeline for the
      // player's own contest reaching VERDICT — consuming the 7-day cooldown
      // and announcing "the killing blow misses" when the player wasn't
      // dying (the verdict auto-resolves the player as 'lost'), then
      // converting a VILLAGER's real played death into 'lost' via a hidden
      // 40% roll. Contests are played, not RNG: gate on forPlayer.
      var playerIn = ac && (((ac.participants || []).indexOf('player') >= 0) || ac.participant === 'player');
      if (forPlayer && !result.note && playerIn) {
        for (var pid2 in ap.met) {
          var per2 = this.apPersona(pid2);
          if (!per2 || per2.disposition !== 'benevolent') continue;
          if ((ap.met[pid2].bond || 0) < 2) continue;
          if (this.apIsDead(pid2)) continue; // the dead save no one (break-it r12)
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

      // FAN FAVOR: the crowd's love is real (stacks with existing cheer).
      // Verdict-only: it bends verdict performance, which doesn't exist on
      // the playable path (break-it 2026-10-08).
      if (!forPlayer) {
      var favor = this.apFavor(); // wired (break-it 2026-10-08)
      if (favor >= 40) {
        result.winMod += 0.08;
        this.sysSay('📺 The crowd is CHANTING your name. The judges can hear it. (the people love you — it steadies them)');
      } else if (favor <= -40) {
        result.winMod -= 0.08;
        this.sysSay('📺 The crowd is BOOING. Someone threw something. The judges look nervous. (the crowd wants blood — it shakes them)');
      }
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
        if (ap.met[pid].encounters >= 1 && !this.apIsDead(pid)) candidates.push(pid);
      }
      if (!candidates.length) return false;
      var pid = candidates[Math.floor(Math.random() * candidates.length)];
      var per = this.apPersona(pid);
      if (!per) return false;

      ap.lastPersonaPackageDay = day;

      if (per.disposition === 'sadistic') {
        // CRUEL GIFT: looks helpful, isn't — it's real AND it's a tracker.
        // KNOWLEDGE GATE (break-it 2026-10-10 r13): there are no cover names
        // in the data — per.name IS the alien truth (same class as the r11
        // group-banter fix). The old card read "With love, Countess Sable"
        // on encounter 1, naming them before the 3rd-encounter reveal.
        // Pre-reveal the card is unsigned; the creep is the point.
        var _pkgKnown = false;
        try { _pkgKnown = !!this.apKnowsAlien(pid); } catch (e0p) {}
        this.say('📦 A package arrives, wrapped in black ribbon. ' + (_pkgKnown
          ? 'The card reads: "With love, ' + per.name + '."'
          : 'The card reads: "With love." No name. You don\'t like that.'));
        // KNOWLEDGE GATE (break-it 2026-10-09 r7): "alien medkit" names the
        // alien truth — the word "alien" is gated like "MULTIPLE alien
        // players" above. Pre-reveal it's advanced tech from a sender you
        // can't place yet. (Post-reveal the card is signed — they signed it.)
        this.say('Inside: a beautiful ' + (_pkgKnown ? 'alien ' : '') + 'medkit. It\'s... ticking? No — it\'s humming. It\'s humming your name.');
        // HONEST (break-it 2026-10-08): the copy promised a medkit but none
        // was ever given. The medkit is real and usable — and it's a tracker.
        // (The old "smash it or keep it" choice was never implemented; the
        // copy no longer promises one. The tracking cost is real: trackedBy
        // triples their encounter weight in apRollEncounter.)
        // HONEST (break-it 2026-10-08 r4): granted via apGrantItem — a bare
        // {itemId,id} entry crashed useItem (no name) and never consumed
        // (no units). The medkit must actually heal when used.
        try { this.apGrantItem('medfoam_canister'); } catch (e) {}
        // KNOWLEDGE GATE (break-it 2026-10-10 r13): per.name pre-reveal.
        this.say('(' + (_pkgKnown ? 'It\'s a tracker. ' + per.name + ' now knows where you sleep.'
          : 'It\'s a tracker. Whoever sent this now knows where you sleep.') + ' The medkit is real, though — out here you don\'t throw those away.)');
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
        try { var _cap = this.kcalCap ? this.kcalCap() : 2400; this.state.scholar.kcal = Math.min(_cap, (this.state.scholar.kcal || 0) + kcal); } catch (e) {}
        return true;
      } else {
        // NEUTRAL: weird, enthusiastic, mostly harmless
        // KNOWLEDGE GATE (break-it 2026-10-10 r13): the card and photo named
        // the persona pre-reveal — same class as the sadistic card above.
        var _npk = false;
        try { _npk = !!this.apKnowsAlien(pid); } catch (e0n) {}
        this.say('📦 A package covered in stickers. ' + (_npk
          ? 'The card: "' + per.name + '!! Hope you\'re doing great! Here\'s some stuff from home!"'
          : 'The card, in loopy handwriting: "Hope you\'re doing great! Here\'s some stuff from home!"'));
        this.say('Inside: snacks that taste like purple, a tiny flag, and a photo of ' + (_npk ? per.name : 'someone') + ' giving a thumbs-up.');
        try { var _cap = this.kcalCap ? this.kcalCap() : 2400; this.state.scholar.kcal = Math.min(_cap, (this.state.scholar.kcal || 0) + 200); } catch (e) {}
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
      // HONEST (break-it 2026-10-08 r4): the cooldown burned even when msgs
      // came up empty (early game: no rivals, small village) — and it shares
      // lastFeedDay with apFeedMessage, which ALWAYS has something to say.
      // An empty event feed must not eat the day's feed slot. Record only
      // when a message actually goes out.
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
        if (this.apIsDead(pid)) continue; // the dead request nothing (break-it r12)
        if (per.disposition === 'sadistic') {
          // KNOWLEDGE GATE (break-it 2026-10-10): the old line named the
          // rival with no gate and no reveal — the same class r7 fixed in
          // apFeedMessage. Naming on the feed IS the reveal path.
          var _rknown = false;
          try { _rknown = !!this.apKnowsAlien(pid); } catch (e0rk) {}
          if (_rknown) { msgs.push('"' + per.name + ' has requested you specifically for the next exhibition. That\'s... not good."'); }
          else { msgs.push('"Someone out there has requested you specifically for the next exhibition. That\'s... not good."'); }
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
        ap.lastFeedDay = day;
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

      var known = !!ap.known[pid];
      // KNOWLEDGE GATE (break-it 2026-10-10): the old line stored the
      // persona's true name ungated ("safe pre-reveal") — but the fighter
      // card, combat intro, feed lines, and reveal message all treat p.name
      // as the alien truth, and the codex renderer prints entry.name
      // verbatim. Pre-reveal the entry is filed under "someone"; the reveal
      // re-runs this entry and the name lands then.
      entry.name = known ? p.name : 'someone';
      entry.title = known ? p.title : 'stranger';
      entry.species = known ? p.species : 'unknown';
      entry.disposition = known ? p.disposition : 'unknown';
      // Progressive disclosure
      if (rec.encounters >= 1) {
        entry.stage = 'encountered';
        // Pre-reveal: suspicion, never conclusion. The alien truth stays hidden.
        entry.note = known
          ? 'That wasn\'t a person. It moved like someone wearing a human suit.'
          : 'A stranger crossed you out in the wild. Moved wrong — too smooth, too practiced. You can\'t place why.';
      }
      if (ap.known[pid]) {
        entry.stage = 'identified';
        entry.note = p.name + ' — ' + p.title + '. ' + p.backstory.slice(0, 200) + '...';
      }
      if (known && rec.encounters >= 5) {
        entry.stage = 'understood';
        entry.note = p.name + ' — ' + p.title + '. ' + p.backstory + ' Motivation: ' + p.motivation;
      }
      this.state.codex.aliens[pid] = entry;
      // DEAD (break-it r12): the codex is a historical record — it keeps the
      // entry, but the fate is written down. The dead don't get new stages.
      if (rec.dead) {
        entry.fate = 'dead' + (rec.deadDay ? ' — killed on day ' + rec.deadDay : '');
      }
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

      var roster = (this.state.village && this.state.village.roster) || [];
      if (!roster.length) return false;
      // HONEST (break-it 2026-10-09): the cooldown used to burn before the
      // roster check — an empty village ate the 2-day slot with no gossip
      // (same class as the apEventFeed r4 fix). Record only when gossip
      // actually goes out.
      ap.lastGossipDay = day;
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
        if (this.apIsDead(pid)) continue; // gossip about the living (break-it r12)
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
      // HONEST (break-it 2026-10-09): the roster keeps the dead (corpses.js
      // never removes them) — the old pick could establish a corpse as your
      // contact, and dead contacts kept whispering dream warnings. Only
      // the living get contacted.
      var living = roster.filter(function (rid) {
        try { return !(this.vpOf(rid) || {}).dead; } catch (e) { return true; }
      }, this);
      if (living.length < 3) return null;
      var vid = living[Math.floor(Math.random() * living.length)];
      ap.contactedVid = vid;

      var vname = 'Someone';
      try { vname = this.displayName(vid) || 'Someone'; } catch (e) {}
      this.say('💬 ' + vname + ' pulls you aside. "I need to tell you something. Last night I... dreamed? No. I was AWAKE. And something spoke to me. Not the System — something else. It said: \'Tell the human to watch the northern treeline.\' Then it was gone."');
      // KNOWLEDGE GATE (break-it 2026-10-09 r7): the parenthetical is
      // narrator voice — "alien player" names the alien truth to a player
      // who may never have earned it. Gate on knowing ANY alien; otherwise
      // the contact is just "something".
      var _anyKnown = false;
      try { for (var _ck in (this.apState().known || {})) { _anyKnown = true; break; } } catch (e0c) {}
      this.say('(' + vname + ' has been contacted by ' + (_anyKnown ? 'an alien player' : 'something') + '. They don\'t understand what happened. But they\'ll warn you when they dream again.)');
      return vid;
    },

    // Contacted villager warnings (called from daily tick)
    apContactWarning: function () {
      var ap = this.apState();
      if (!ap.contactedVid) return false;
      // HONEST (break-it 2026-10-09): a contact who died since establishment
      // is released, not kept whispering from the grave.
      try {
        var cvp = this.vpOf ? this.vpOf(ap.contactedVid) : null;
        if (cvp && cvp.dead) { delete ap.contactedVid; return false; }
      } catch (e) {}
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
    // ============ PLAYGROUND (Steve 2026-10-07) ============
    // Alien players are PERSISTENT. Once they enter your game, they stay for
    // days — killing villagers, monsters, and animals, burning the map,
    // fighting each other, raiding your pantry, and exploiting every mechanic
    // they know. Most have played before. This is their playground.

    // Active presence: pids currently "in the game" (not just encountered).
    // active[pid] = { enteredDay, lastActionDay }
    apActive: function () {
      var ap = this.apState();
      ap.active = ap.active || {};
      return ap.active;
    },

    // Maybe an alien player ENTERS the game (becomes persistent).
    // Called from the daily tick. Separate from encounter rolls.
    apMaybeActivate: function () {
      if (!this.apEncounterEligible()) return null;
      var ap = this.apState();
      var active = this.apActive();
      var day = (this.state.scholar || {}).day || 1;

      // Max 3 active at once (balance: spice, not the whole meal)
      var count = Object.keys(active).length;
      if (count >= 3) return null;

      // Don't activate too often — max 1 new per 4 days
      if (day - (ap.lastActivateDay || -999) < 4) return null;
      if (Math.random() > 0.3) return null;

      // Pick from combat personas not already active
      var candidates = [];
      var personas = this.apPersonas();
      for (var i = 0; i < personas.length; i++) {
        var cp = personas[i];
        if (!this.apIsCombat(cp.id)) continue;
        if (active[cp.id]) continue;
        if (this.apIsDead(cp.id)) continue; // the dead don't enter (break-it r12)
        // Weight: sadistic more likely to go active (they're here to play)
        var w = cp.disposition === 'sadistic' ? 3 : cp.disposition === 'neutral' ? 2 : 1;
        candidates.push({ p: cp, w: w });
      }
      if (!candidates.length) return null;

      var total = 0, k;
      for (k = 0; k < candidates.length; k++) total += candidates[k].w;
      var r = Math.random() * total, chosen = null;
      for (k = 0; k < candidates.length; k++) { r -= candidates[k].w; if (r <= 0) { chosen = candidates[k].p.id; break; } }
      if (!chosen) chosen = candidates[candidates.length - 1].p.id;

      active[chosen] = { enteredDay: day, lastActionDay: day };
      ap.lastActivateDay = day;

      var per = this.apPersona(chosen);
      if (per && this.state.systemArrived) {
        // They don't announce themselves — you hear about it
        // HONEST (break-it 2026-10-08 r4): "the odds just got interesting"
        // was the same stale odds register (see apFeedMessage fix above) —
        // broadcast color, not a mechanical claim.
        // KNOWLEDGE GATE (break-it 2026-10-10): the old line named the
        // persona outright on first entry — every other naming site gates on
        // apKnowsAlien (the r7 feed-naming precedent), and this naming never
        // registered a reveal. Pre-reveal they're "a stranger".
        var _aknown = false;
        try { _aknown = !!this.apKnowsAlien(chosen); } catch (e0ak) {}
        this.sysSay('◈ The System feed flickers: "' + (_aknown ? per.name : 'A stranger') + ' has entered the game. The feed just got a lot more interesting."');
      }
      return chosen;
    },

    // Maybe an active alien LEAVES (they get bored, they die, they move on).
    apMaybeDeactivate: function (pid) {
      var active = this.apActive();
      var rec = active[pid];
      if (!rec) return;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      var per = this.apPersona(pid);

      // Rich ones stay longer (they can afford to). Broke ones leave sooner.
      var wealth = this.apWealthOf(pid);
      var maxStay = wealth === 'rich' ? 12 : wealth === 'comfortable' ? 8 : 5;
      var daysIn = day - rec.enteredDay;

      // Leave if: been too long, or random boredom (neutral especially)
      var bored = per && per.disposition === 'neutral' && Math.random() < 0.15;
      if (daysIn >= maxStay || bored) {
        delete active[pid];
        if (per && this.state.systemArrived && Math.random() < 0.5) {
          // KNOWLEDGE GATE (break-it 2026-10-10): sibling of the activation
          // leak — the exit announcement named the persona pre-reveal.
          var _dknown = false;
          try { _dknown = !!this.apKnowsAlien(pid); } catch (e0dk) {}
          this.sysSay('◈ "' + (_dknown ? per.name : 'A stranger') + ' has left the game. ' +
            (bored ? 'Said something about dinner reservations.' : 'The feed goes quiet.') + '"');
        }
      }
    },

    // THE PLAYGROUND TICK: each active alien does something every day.
    // Called from apDailyTick.
    apPlaygroundTick: function () {
      if (!this.apEncounterEligible()) return;
      var active = this.apActive();
      var pids = Object.keys(active);
      if (!pids.length) {
        // No one active — maybe someone enters
        try { this.apMaybeActivate(); } catch (e) {}
        return;
      }

      for (var i = 0; i < pids.length; i++) {
        var pid = pids[i];
        try {
          // DEAD (break-it r12): a killed-then-active persona must never act
          // from beyond the grave. Release the slot; the dead don't raid.
          if (this.apIsDead(pid)) { delete active[pid]; continue; }
          // Each active alien acts (not every day — they're busy)
          if (Math.random() < 0.6) this.apPlaygroundAction(pid);
          // Maybe they leave
          this.apMaybeDeactivate(pid);
        } catch (e) {}
      }

      // Aliens may fight EACH OTHER (rare, dramatic)
      try { this.apPlaygroundDuel(); } catch (e) {}

      // Maybe someone new enters
      try { this.apMaybeActivate(); } catch (e) {}
    },

    // One active alien's daily off-screen action.
    apPlaygroundAction: function (pid) {
      var per = this.apPersona(pid);
      if (!per) return;
      if (this.apIsDead(pid)) return false; // corpses take no actions (break-it r12)
      var active = this.apActive();
      var day = (this.state.scholar || {}).day || 1;
      if (active[pid]) active[pid].lastActionDay = day;

      var disp = per.disposition;
      var exp = this.apExperience(pid); // 'veteran' or 'rookie'

      // Choose an action (weighted by disposition and personality)
      var roll = Math.random();

      // VETERANS exploit mechanics. Rookies make mistakes.
      var isVeteran = (exp === 'veteran');

      if (disp === 'sadistic') {
        if (roll < 0.25) return this.apPlaygroundKill(pid, 'villager');
        if (roll < 0.40) return this.apPlaygroundKill(pid, 'monster');
        if (roll < 0.50) return this.apPlaygroundKill(pid, 'animal');
        if (roll < 0.65 && this.apIsArsonist(pid)) return this.apPlaygroundBurn(pid);
        if (roll < 0.80 && isVeteran) return this.apPlaygroundRaid(pid);
        return this.apPlaygroundKill(pid, 'monster'); // default: hunt
      } else if (disp === 'neutral') {
        if (roll < 0.20) return this.apPlaygroundKill(pid, 'monster'); // hunting
        if (roll < 0.30) return this.apPlaygroundKill(pid, 'animal'); // foraging/fun
        if (roll < 0.40 && isVeteran) return this.apPlaygroundRaid(pid); // opportunistic
        if (roll < 0.45 && !isVeteran) return this.apPlaygroundRookieMistake(pid); // Pip!
        return null; // neutral often just... watches
      } else {
        // Benevolent: they don't kill. They help, they warn, they watch.
        // Old Tam might hunt monsters (he's atoning, not passive)
        if (pid === 'old_tam' && roll < 0.3) return this.apPlaygroundKill(pid, 'monster');
        return null; // Wren stays hidden
      }
    },

    // Who's an arsonist? Sable always. Vex sometimes (spectacle).
    apIsArsonist: function (pid) {
      if (pid === 'countess_sable') return true;
      if (pid === 'vex_marlowe' && Math.random() < 0.4) return true;
      return false;
    },

    // Experience: most have played before. Pip is new.
    apExperience: function (pid) {
      var per = this.apPersona(pid);
      if (per && per.experience) return per.experience;
      // Default: veterans. Pip is the rookie.
      return (pid === 'pip_quindle') ? 'rookie' : 'veteran';
    },

    // KILL: an active alien kills something off-screen.
    apPlaygroundKill: function (pid, target) {
      var per = this.apPersona(pid);
      if (!per) return false;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;

      if (target === 'villager') {
        // Kill a villager (not the player — that's a direct encounter)
        var v = this.state.village || {};
        var roster = (v.roster || []).filter(function (rid) {
          return rid !== this.villagerId && !(this.vpOf(rid) || {}).dead;
        }, this);
        if (!roster.length) return false;
        // Don't kill too often — max 1 villager per 5 days TOTAL (shared
        // cooldown, not per-alien; break-it 2026-10-10: the old comment said
        // "per alien" but the engine has always used one shared key).
        if (day - (ap.lastVillagerKillDay || -999) < 5) return false;

        var victim = roster[Math.floor(Math.random() * roster.length)];
        var vp = this.vpOf(victim) || {};
        var vname = this.displayName ? this.displayName(victim) : (vp.name || 'a villager');

        // Mark dead and register
        try {
          vp.dead = true;
          if (this.registerDeath) {
            this.registerDeath({ kind: 'person', villagerId: victim, name: vname, cause: 'alien', killerId: 'ap_' + pid });
          }
          // PHANTOM EATER (break-it food 2026-10-09): the old code marked
          // dead but left them in the roster — villageEats kept feeding the
          // corpse (they ate AND produced). Every other death path pairs
          // registerDeath with removeVillager; this one does too.
          if (this.removeVillager) this.removeVillager(victim, 'killed');
        } catch (e) {}

        ap.lastVillagerKillDay = day;
        // Villagers react: fear, gossip
        try { this.apVillagerFear(pid, vname); } catch (e) {}

        // System feed reports it (if you have the feed)
        if (this.state.systemArrived && Math.random() < 0.7) {
          var known = this.apKnowsAlien(pid);
          var who = known ? per.name : 'a stranger';
          this.sysSay('◈ "' + vname + ' was found dead near the treeline. ' + who + ' was seen in the area. The village is terrified."');
        }
        return true;

      } else if (target === 'monster') {
        // Kill a monster (competing for the hunt, or clearing the board)
        // This is abstract — we don't track individual off-screen monsters,
        // but we report it and it affects the monster population feel
        if (this.state.systemArrived && Math.random() < 0.5) {
          var known2 = this.apKnowsAlien(pid);
          var who2 = known2 ? per.name : 'Someone';
          var msgs = [
            '◈ "' + who2 + ' just took down a monster near the ridge. Show-off."',
            '◈ "Another monster down. ' + who2 + ' is clearing the board."',
            '◈ "The feed shows ' + who2 + ' standing over a monster corpse. They\'re not even breathing hard."',
          ];
          this.sysSay(msgs[Math.floor(Math.random() * msgs.length)]);
        }
        return true;

      } else if (target === 'animal') {
        // Kill an animal (fun, resources, or accident)
        if (this.state.systemArrived && Math.random() < 0.3) {
          this.sysSay('◈ "Something\'s hunting the wildlife. The deer are nervous."');
        }
        return true;
      }
      return false;
    },

    // BURN: an arsonist burns part of the map.
    apPlaygroundBurn: function (pid) {
      var per = this.apPersona(pid);
      if (!per) return false;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;

      // Limit: max 1 burn per 7 days (balance) — recorded only when the burn
      // actually lands (break-it r4: a fizzled burn must not eat the cooldown).
      if (day - (ap.lastBurnDay || -999) < 7) return false;

      // Burn some tiles — mark them as burned in the detail
      // HONEST (break-it 2026-10-08 r4): burnedTiles was write-only — "the
      // next time the player visits, tiles are ash" never happened. Now the
      // burn scorches the current node's grid for real: tiles become rubble
      // (scavengeable ash). Arsonists torch the wild, not Haven.
      try {
        var s = this.state.scholar;
        s.burnedTiles = s.burnedTiles || {};
        var key = this.map.px + ',' + this.map.py;
        s.burnedTiles[key] = s.burnedTiles[key] || [];
        var tile = null;
        try { tile = this.tileAt ? this.tileAt(this.map.px, this.map.py) : null; } catch (e0b) {}
        if (tile && tile.type === 'haven') return false; // not Haven. Never Haven.
        var bd = this.genDetail(this.map.px, this.map.py);
        var bpx = (s.mx == null ? 4 : s.mx), bpy = (s.my == null ? 4 : s.my);
        var want = 3 + Math.floor(Math.random() * 3), scorched = 0, btries = 0;
        while (scorched < want && btries++ < 80) {
          var bx = Math.floor(Math.random() * 9), by = Math.floor(Math.random() * 9);
          if (bx === bpx && by === bpy) continue;
          var bc = bd[by] && bd[by][bx];
          if (!bc || bc === 'rubble' || bc === 'tent' || bc === 'wall' || bc === 'water' || bc === 'lodge') continue;
          bd[by][bx] = 'rubble';
          s.burnedTiles[key].push({ mx: bx, my: by, day: day, by: pid });
          scorched++;
        }
        if (scorched < 3) return false; // couldn't scorch: no burn, no cooldown
      } catch (e) {}
      ap.lastBurnDay = day;

      // Villagers are terrified
      try { this.apVillagerFear(pid, null, 'burn'); } catch (e) {}

      if (this.state.systemArrived) {
        var known = this.apKnowsAlien(pid);
        var who = known ? per.name : 'Someone';
        this.say('🔥 You smell smoke. A column rises from the treeline. ' + who + ' is burning the map. For fun. For the spectacle. Because they can.');
        this.sysSay('◈ "' + who + ' just torched the old camp area. The feed is eating it up. Sickos."');
      }
      return true;
    },

    // RAID: veterans exploit game mechanics they know.
    // Douse the player's nearest lit fire on the current tile: the grid cell
    // goes cold AND the tracked fire entry is removed, so hasCampfireNearby,
    // cooking, and fireLastsTillDawn all agree the fire is out. Returns true
    // when a fire was actually doused. (break-it 2026-10-08 r4: fire
    // sabotage used to write a write-only flag while the fire kept burning.)
    apDousePlayerFire: function () {
      // FIRE HONESTY (break-it camps R10 2026-10-10, sibling sweep): the old
      // scan took the nearest 'fire' CELL — map hearths, edge-blended wild
      // fires, and burned-out cells nobody swept yet all qualified. The raid
      // then announced "Your fire is out. Not burned down — doused." about a
      // hearth that was never yours, or a pit that burned down on its own —
      // the same copy-vs-engine class as breakCamp's cold-pit lie. Sweep
      // first, then take only the player's LIVE tracked fire; otherwise
      // refuse and the raid falls through to trust sabotage honestly.
      try {
        if (typeof this.sweepDeadFires === 'function') this.sweepDeadFires();
        var detail = this.genDetail(this.map.px, this.map.py);
        var s = this.state.scholar || {};
        var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
        var bx = -1, by = -1, best = 1e9;
        for (var y = 0; y < 9; y++) {
          for (var x = 0; x < 9; x++) {
            if (detail[y] && detail[y][x] === 'fire') {
              var mine = false;
              try { mine = this.playerFireAt(x, y); } catch (e2) { mine = false; }
              if (!mine) continue;
              var d2 = Math.abs(x - px) + Math.abs(y - py);
              if (d2 < best) { best = d2; bx = x; by = y; }
            }
          }
        }
        if (bx < 0) return false;
        detail[by][bx] = 'dirt';
        var fires = this.state.fires || [];
        for (var i = fires.length - 1; i >= 0; i--) {
          var f = fires[i];
          if (f.tx === this.map.px && f.ty === this.map.py && f.cx === bx && f.cy === by) fires.splice(i, 1);
        }
        return true;
      } catch (e) { return false; }
    },

    apPlaygroundRaid: function (pid) {
      var per = this.apPersona(pid);
      if (!per) return false;
      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;

      // Limit: max 1 raid per 6 days
      if (day - (ap.lastRaidDay || -999) < 6) return false;

      var roll = Math.random();
      var didSomething = false;

      if (roll < 0.35) {
        // PANTRY RAID: they know about the pantry.
        // HONEST (break-it 2026-10-08 r4): the pantry is a LIST of food
        // items (game.js), not a kcal scalar — the old code read
        // v.pantry.kcal (always undefined), stole 0, and the raid was a
        // silent no-op. Now it takes real pieces off the pile.
        try {
          var v = this.state.village || {};
          v.pantry = v.pantry || [];
          var want = 500 + Math.floor(Math.random() * 500);
          var stolen = 0;
          for (var si = v.pantry.length - 1; si >= 0 && stolen < want; si--) {
            var pit = v.pantry[si];
            var pku = pit.kcalEach || 0, pun = pit.units || 1;
            if (!(pku > 0)) continue;
            // Take units, not whole pieces — a 12000-kcal slab doesn't vanish.
            var takeUnits = Math.min(pun, Math.ceil((want - stolen) / pku));
            stolen += takeUnits * pku;
            if (takeUnits >= pun) v.pantry.splice(si, 1);
            else pit.units = pun - takeUnits;
          }
          if (stolen > 0) {
            ap.lastRaidDay = day;
            didSomething = true;
            this.say('🥷 Your pantry is lighter (' + stolen + ' kcal gone). Someone knew exactly where it was. Someone who\'s played this game before.');
            if (this.state.systemArrived) {
              var known = this.apKnowsAlien(pid);
              this.sysSay('◈ "' + (known ? per.name : 'Someone') + ' just raided a pantry. Textbook. They\'ve done this before."');
            }
          }
        } catch (e) {}
      } else if (roll < 0.60) {
        // FIRE SABOTAGE: douse the player's fire — for real.
        // HONEST (break-it 2026-10-08 r4): the old branch wrote a write-only
        // s.fireSabotaged flag while the fire kept burning, and announced
        // "your fire is out" even with no fire lit. Now it douses the
        // nearest lit fire (grid cell + tracked fire); with no fire nearby
        // they poison trust instead of lying about it.
        var doused = false;
        try { doused = !!this.apDousePlayerFire(); } catch (e0f) { doused = false; }
        if (doused) {
          try {
            ap.lastRaidDay = day;
            didSomething = true;
            this.say('🔥 Your fire is out. Not burned down — doused. Deliberately. Someone knows that fire is life out here.');
          } catch (e) {}
        } else {
          roll = 0.99; // no fire to douse — fall through to trust sabotage
        }
      }
      if (roll >= 0.60) {
        // TRUST SABOTAGE: turn villagers against you
        // TRUST≠REP (break-it 2026-10-09, canon): gossip/rumors move REP
        // only, never trust. The old code wrote v.trust[target] -= 15
        // directly — an off-screen rumor campaign bypassing the entire
        // social resolver. Now it seeds a REAL rumor: the village's OPINION
        // of you sours (rep dims, which spread via spreadGossip), and trust
        // is untouched. The social damage is real — it just lands where
        // talk lands.
        try {
          var v2 = this.state.village || {};
          var roster = (v2.roster || []).filter(function (rid) {
            return rid !== this.villagerId && !(this.vpOf(rid) || {}).dead;
          }, this);
          if (roster.length) {
            var target = roster[Math.floor(Math.random() * roster.length)];
            if (typeof this.seedGossip === 'function') {
              this.seedGossip('alien_smear', { honest: -8, generous: -5, who: this.villagerId }, [target], true);
            }
            ap.lastRaidDay = day;
            didSomething = true;
            var tname = this.displayName ? this.displayName(target) : 'Someone';
            this.say('🗣️ ' + tname + ' is giving you strange looks. Someone\'s been talking. Someone who knows how trust works here.');
          }
        } catch (e) {}
      }
      return didSomething;
    },

    // ROOKIE MISTAKE: Pip does something newbie and charming.
    apPlaygroundRookieMistake: function (pid) {
      var per = this.apPersona(pid);
      if (!per || pid !== 'pip_quindle') return false;

      // KNOWLEDGE GATE (break-it 2026-10-09 r7): "alien currency" names the
      // alien truth on the System feed. Pre-reveal it's coins that chime
      // wrong — the joke lands either way.
      var _pipKnown = false;
      try { _pipKnown = !!this.apKnowsAlien('pip_quindle'); } catch (e0m) {}
      var mistakes = [
        '◈ "Pip just tried to pet a monster. It did not go well. Pip is fine. The monster is confused."',
        '◈ "Pip set up camp in a monster den. By accident. They\'re having a great time. The monster left."',
        '◈ "Pip tried to trade with a villager using ' + (_pipKnown ? 'alien currency' : 'coins that chime wrong') + '. The villager now thinks Pip is a god. Pip is delighted."',
        '◈ "Pip got lost. Again. The System had to give them directions. The feed is laughing WITH them, not at them. Mostly."',
      ];
      if (this.state.systemArrived && Math.random() < 0.6) {
        this.sysSay(mistakes[Math.floor(Math.random() * mistakes.length)]);
      }
      return true;
    },

    // DUEL: two active aliens encounter each other and fight.
    // Rare, dramatic, reported on the feed.
    apPlaygroundDuel: function () {
      var active = this.apActive();
      var pids = Object.keys(active);
      if (pids.length < 2) return false;
      if (Math.random() > 0.15) return false; // rare

      // Pick two
      var a = pids[Math.floor(Math.random() * pids.length)];
      var b = pids[Math.floor(Math.random() * pids.length)];
      if (a === b) return false;

      var pa = this.apPersona(a), pb = this.apPersona(b);
      if (!pa || !pb) return false;
      // DEAD (break-it r12): the dead don't duel.
      if (this.apIsDead(a) || this.apIsDead(b)) return false;

      var ap = this.apState();
      var day = (this.state.scholar || {}).day || 1;
      if (day - (ap.lastDuelDay || -999) < 10) return false; // max 1 per 10 days
      ap.lastDuelDay = day;

      // Faction check: are they aligned or rivals?
      var aligned = this.apFactionAligned(a, b);

      if (this.state.systemArrived) {
        var na = this.apKnowsAlien(a) ? pa.name : 'a stranger';
        var nb = this.apKnowsAlien(b) ? pb.name : 'another stranger';
        if (aligned) {
          this.sysSay('◈ "' + na + ' and ' + nb + ' were seen together. Coordinating. That\'s... not great for you."');
        } else {
          // They fight! One might get hurt, might leave
          var loser = Math.random() < 0.5 ? a : b;
          var winner = loser === a ? b : a;
          var pw = this.apPersona(winner), pl = this.apPersona(loser);

          this.sysSay('◈ "' + na + ' and ' + nb + ' just threw down. ' +
            (this.apKnowsAlien(winner) ? pw.name : 'One of them') + ' walked away. The other... didn\'t."');

          // Loser leaves the game (they lost, they're done)
          // Unless they're rich — rich ones come back
          var lw = this.apWealthOf(loser);
          if (lw !== 'rich' || Math.random() < 0.5) {
            delete active[loser];
            // DEAD (break-it r12): the copy says "the other... didn't [walk
            // away]" — a non-rich loser who can't afford another body is
            // dead, not resting. Mark it so the corpse never re-encounters.
            // (Rich losers "come back" — death is an inconvenience to them.)
            if (lw !== 'rich') {
              try {
                var _lm = this.apState().met[loser] || { encounters: 0 };
                _lm.dead = true; _lm.deadDay = (this.state.scholar || {}).day || 1;
                this.apState().met[loser] = _lm;
              } catch (e0ld) {}
            }
            if (this.state.systemArrived && Math.random() < 0.5) {
              // KNOWLEDGE GATE (break-it 2026-10-09 r7): the old line gated
              // the NAME but still said "aliens" to a player who never earned
              // the truth. The whole sentence follows the gate now.
              var _duelKnown = false;
              try { _duelKnown = !!this.apKnowsAlien(loser); } catch (e0d) {}
              this.sysSay('◈ "' + (_duelKnown ? pl.name : 'The loser') + ' has left the game. ' + (_duelKnown ? 'Even aliens have limits.' : 'Even they have limits.') + ' Well, some of them."');
            }
          }
        }
      }
      return true;
    },

    // FACTION ALIGNMENT: are two aliens inclined to team up?
    // Sadistic coordinate (loosely). Benevolent warn each other.
    // Neutral goes with whoever benefits them. But alliances are fragile.
    apFactionAligned: function (pidA, pidB) {
      var pa = this.apPersona(pidA), pb = this.apPersona(pidB);
      if (!pa || !pb) return false;

      var da = pa.disposition, db = pb.disposition;

      // Same disposition: likely aligned (but not guaranteed)
      if (da === db) {
        // Sadistic alliances are fragile — 70% aligned, 30% they turn
        if (da === 'sadistic') return Math.random() < 0.7;
        // Benevolent are solid — 90% aligned
        if (da === 'benevolent') return Math.random() < 0.9;
        // Neutral: 50/50, depends on mood
        return Math.random() < 0.5;
      }

      // Sadistic + Neutral: neutral might join for profit (40%)
      if ((da === 'sadistic' && db === 'neutral') || (da === 'neutral' && db === 'sadistic')) {
        return Math.random() < 0.4;
      }

      // Benevolent + Neutral: neutral might help for goodwill (30%)
      if ((da === 'benevolent' && db === 'neutral') || (da === 'neutral' && db === 'benevolent')) {
        return Math.random() < 0.3;
      }

      // Sadistic + Benevolent: NEVER aligned. They're enemies.
      return false;
    },

    // VILLAGER FEAR: villagers react to alien activity.
    apVillagerFear: function (pid, victimName, kind) {
      var per = this.apPersona(pid);
      if (!per) return;
      var v = this.state.village || {};
      var roster = (v.roster || []).filter(function (rid) {
        return rid !== this.villagerId && !(this.vpOf(rid) || {}).dead;
      }, this);

      // Everyone's fear goes up
      for (var i = 0; i < roster.length; i++) {
        var rid = roster[i];
        try {
          var needs = this.npcNeeds ? this.npcNeeds(rid) : null;
          if (needs) needs.fear = Math.min(100, (needs.fear || 0) + 20);
        } catch (e) {}
      }

      // They talk about it (gossip)
      if (victimName && Math.random() < 0.6) {
        var known = this.apKnowsAlien(pid);
        var who = known ? per.name : 'that stranger';
        this.say('😨 The village is whispering. "' + victimName + ' is dead. ' + who + ' did it. We\'re not safe."');
      } else if (kind === 'burn' && Math.random() < 0.6) {
        this.say('😨 "Did you see the fire? They\'re burning everything. What do they WANT?" The village huddles closer to the fire.');
      }
    },


    // ============ ALIEN ARMOR TRANSITION (Steve 2026-10-07) ============
    // Alien beam weapons vs human armor = nearly instant lethal.
    // Alien armor OR sufficiently bonded sentimental gear = resistant.
    // Until you have a full set, every alien encounter is tremendous risk.
    //
    // The three concepts stay separate:
    // - MONSTER TIERS (wave 1/2/veterans) = how hard the monster is
    // - LOOT TIERS (1-4) = how strong the item is
    // - BEAM RESISTANCE = whether your gear stops alien beam weapons
    // Beam resistance is its own axis. It doesn't care about waves or tiers.

    // apBeamResistPieces: count beam-resistant pieces the player is wearing.
    // GEAR SLOTS (Steve 2026-10-07): sentimental gear must be EQUIPPED in an
    // armor slot to count. Sitting in inventory does nothing — out of sight,
    // out of mind. Weapons and accessories never count (a knife doesn't block
    // beams — but a bonded sentimental VEST does).
    // Two sources:
    // 1. Alien armor (armor.beamResist:true in items.json) — grown, not made.
    // 2. Sentimental armor with bond >= 25, EQUIPPED in head/torso/legs/hands/shoes.
    //    Your love for it creates resonance that deflects beam weapons.
    //    (Bond 10 reveals the keepsake; 25 is deep.)
    // Full-body sets count per covered slot (head+torso+legs+shoes = 4).
    // Returns array of {slot, itemId, source:'alien'|'bonded'}.
    apBeamResistPieces: function () {
      var pieces = [];
      try {
        var s = this.state.scholar || {};
        var equipped = s.equipped || {};
        // Armor slots only. 'feet' kept as legacy alias for old saves.
        var slots = ['head', 'torso', 'legs', 'hands', 'shoes', 'feet'];
        for (var i = 0; i < slots.length; i++) {
          var slot = slots[i];
          var item = equipped[slot];
          if (!item) continue;
          var itemId = item.itemId || item.id;
          if (!itemId) continue;
          var def = null;
          try {
            var items = this.data.items || [];
            for (var j = 0; j < items.length; j++) {
              if (items[j].id === itemId) { def = items[j]; break; }
            }
          } catch (e) {}
          if (!def) continue;
          // Full-body set on torso: counts per covered slot.
          var isFS = false;
          try {
            if (typeof S !== 'undefined' && S.equipment && S.equipment.isFullSet(itemId, def)) isFS = true;
          } catch (e) {}
          // Source 1: alien armor
          if (def.armor && def.armor.beamResist) {
            if (isFS && slot === 'torso') {
              // Riot-gear-style full set: one piece per covered body slot.
              var covered = ['head', 'torso', 'legs', 'shoes'];
              for (var c = 0; c < covered.length; c++) {
                pieces.push({ slot: covered[c], itemId: itemId, source: 'alien' });
              }
            } else {
              pieces.push({ slot: slot, itemId: itemId, source: 'alien' });
            }
            continue;
          }
          // Source 2: sufficiently bonded sentimental ARMOR, equipped.
          // Weapons don't block beams. Accessories don't block beams.
          // A bonded vest does. (Steve 2026-10-07: knife is a bad example.)
          if (def.class === 'sentimental' && def.armor && (item.bond || 0) >= 25) {
            pieces.push({ slot: slot, itemId: itemId, source: 'bonded' });
          }
        }
      } catch (e) {}
      return pieces;
    },

    // apBeamResistLevel: none (0), partial (1-2), substantial (3-4), full (5+).
    // 5 armor slots; a full set on torso counts per covered slot, so 5 is the
    // practical max. Only EQUIPPED armor counts (break-it 2026-10-10: the old
    // comment claimed bonded keepsakes in inventory could push beyond 5 —
    // the engine only scans equipped slots, so the comment was the lie).
    apBeamResistLevel: function () {
      var n = this.apBeamResistPieces().length;
      if (n <= 0) return 'none';
      if (n <= 2) return 'partial';
      if (n <= 4) return 'substantial';
      return 'full';
    },

    // apBeamResistText: player-facing resistance readout.
    // The player should KNOW when they're not ready.
    apBeamResistText: function () {
      var level = this.apBeamResistLevel();
      var pieces = this.apBeamResistPieces();
      if (level === 'none') {
        return '⚠ BEAM VULNERABILITY: CRITICAL — no resistant gear. Alien beam weapons will nearly kill you outright.';
      } else if (level === 'partial') {
        return '⚠ Beam resistance: PARTIAL (' + pieces.length + '/5). You might survive a glancing hit. You will not survive a second.';
      } else if (level === 'substantial') {
        return '◈ Beam resistance: SUBSTANTIAL (' + pieces.length + '/5). You can take a hit. Don\'t get cocky.';
      }
      return '◈ Beam resistance: FULL (' + pieces.length + '). You can stand against beam weapons. Still a hard fight.';
    },

    // apReadinessCheck: spawn gating. Don't spawn alien players until the
    // player has at least a slight chance with a party.
    // Factors: party size, threat rating, day, System integration.
    // Returns { ready: bool, score, reasons[] }.
    apReadinessCheck: function () {
      var reasons = [];
      var score = 0;
      try {
        var s = this.state.scholar || {};
        var day = s.day || 1;
        // Party: each ally is 25 points (Steve: "slight chance with a party")
        var party = (this.state.party || []).length;
        score += party * 25;
        if (party >= 2) reasons.push(party + ' allies at your side');
        else reasons.push('only ' + party + ' ' + (party === 1 ? 'ally' : 'allies') + ' (need 2+)');
        // Threat rating: existing system, gear + stats + party + performance
        var threat = 0;
        try { threat = this.threatRating() || 0; } catch (e) {}
        score += Math.min(threat, 100);
        if (threat >= 60) reasons.push('threat rating ' + threat + ' (solid)');
        else reasons.push('threat rating ' + threat + ' (need 60+)');
        // Day: day 30+ is a bonus, not a gate (break-it 2026-10-09: the old
        // comment claimed "no aliens before day 30" but the formula never
        // enforced it — a strong early player scores 100+ without it).
        if (day >= 30) { score += 25; reasons.push('day ' + day + ' (seasoned)'); }
        else reasons.push('day ' + day + ' (young — needs allies and threat to compensate)');
        // System integration: must have arrived (already gated, but count it)
        var sysInt = this.state.systemIntegration || 0;
        if (sysInt >= 1) { score += 25; }
        // Beam resistance: having ANY resistant gear is a big plus
        var resistPieces = this.apBeamResistPieces().length;
        score += resistPieces * 15;
        if (resistPieces > 0) reasons.push(resistPieces + ' beam-resistant ' + (resistPieces === 1 ? 'piece' : 'pieces'));
      } catch (e) {}
      // Threshold: 100. A day-30 player with 2 allies (50), threat 60 (60),
      // day bonus (25) = 135. Ready. A solo day-10 player = ~30. Not ready.
      var ready = score >= 100;
      return { ready: ready, score: Math.round(score), reasons: reasons };
    },

    // apBeamHit: alien beam weapon damage resolution.
    // Called from the tbDamage wrap when damageType is 'alien_beam'.
    // Normal armor does NOTHING. Only beam-resistant gear helps.
    // 0 pieces: nearly instant lethal (90-110% of max HP).
    // Each piece multiplies damage by 0.7. Full set (5): ~17% — hard but fair.
    apBeamHit: function (targetKey, dmg, sourceLabel, opts) {
      var s = this.state.scholar || {};
      // Engine keys the player fighter as 'p'; 'player' is the module's
      // display convention. Resolve the fighter with the engine key so beam
      // damage actually lands — tbFighter('player') is undefined and beams
      // used to announce then silently whiff (Steve 2026-10-08).
      var engineKey = (targetKey === 'player') ? 'p' : targetKey;
      var maxHp = s.maxHp || 100;
      var pieces = this.apBeamResistPieces();
      var n = pieces.length;
      // Base beam damage: devastating. This is the "oh shit" weapon.
      var base = Math.round(maxHp * (0.9 + Math.random() * 0.2));
      // Each resistant piece multiplies by 0.7
      var mult = Math.pow(0.7, n);
      var final = Math.max(1, Math.round(base * mult));
      // THE "OH SHIT" MOMENT: first beam hit with no resistance.
      // The game tells you, clearly: your armor will not save you from this.
      if (n === 0 && !s._beamHorrorSeen) {
        s._beamHorrorSeen = true;
        this.say('💀 The beam doesn\'t care about your armor. It goes through like it isn\'t there.');
        // KNOWLEDGE GATE (break-it 2026-10-09 r7): "alien armor" names the
        // alien truth. Pre-reveal the lesson is wordless: their armor stops
        // it, yours doesn't. (The raise above already gates "The stranger" /
        // "a beam weapon" the same way.)
        var _beamKnown = false;
        try { _beamKnown = !!((opts && opts.pid) && this.apKnowsAlien(opts.pid)); } catch (e0b) {}
        this.say('💀 Your ' + this.apArmorName() + ' might as well be paper. ' + (_beamKnown ? 'You need alien armor — or something you love enough to resonate.' : 'Whatever they\'re wearing stops this. Yours doesn\'t.'));
        this.say('💀 THIS IS NOT A FAIR FIGHT. Run, or find resistant gear.');
        try { this.drama('beamHorror', s.mx, s.my); } catch (e) {}
      } else if (n > 0 && n < 5 && !s._beamPartialSeen) {
        s._beamPartialSeen = true;
        this.say('◈ Your resistant gear flares — ' + n + ' ' + (n === 1 ? 'piece' : 'pieces') + ' catching the beam. It helps. It\'s not enough for a second hit.');
      } else if (n >= 5 && !s._beamFullSeen) {
        s._beamFullSeen = true;
        this.say('◈ Your full resistant set sings — the beam breaks across it like water on stone. You can fight them now. It\'s still going to hurt.');
      }
      // Apply the damage via the normal path (bypassing armor since we
      // already calculated final — damage is applied directly below).
      // DEAD CODE (break-it 2026-10-10): an orphaned flag object used to be
      // built here and marked "beam final", but nothing ever read it — the
      // tbDamage wrap's matching branch was removed (break-it 2026-10-08)
      // and apBeamHit never re-enters tbDamage.
      // AUDIO (break-it 2026-10-09): the beam DISCHARGES here — the resolve
      // sounds like any machine beam (droneBeam via the impact dispatcher),
      // whether or not the target is still standing to take it. Was: the
      // game's most devastating attack played nothing.
      try { this.audioEvent('impact', { pattern: 'beam' }); } catch (e) {}
      try {
        var t = this.tbFighter(engineKey);
        if (t && t.alive) {
          t.hp = Math.max(0, (t.hp || maxHp) - final);
          var who = targetKey === 'player' ? 'You take' : (t.name || 'They take');
          this.say('🔆 ' + who + ' ' + final + ' beam damage' + (n > 0 ? ' (' + n + ' resistant ' + (n === 1 ? 'piece' : 'pieces') + ' absorbing)' : ' (no resistance)') + ' — ' + sourceLabel + '.');
          if (t.hp <= 0) {
            t.alive = false;
            try { this.tbKill(t, sourceLabel); } catch (e) {}
          }
        }
      } catch (e) {}
      // SENTIMENTAL BOND (Steve 2026-10-07): surviving a beam hit while wearing
      // bonded sentimental armor is a meaningful moment — the bond deepens.
      // HONEST (break-it 2026-10-09): this.bumpBond never existed — the
      // guarded call was dead and the bond never moved. Bump inline, on the
      // actual equipped piece (same +3 the victory path uses in game.js).
      try {
        if (targetKey === 'player' && n > 0) {
          var eq2 = (this.state.scholar || {}).equipped || {};
          for (var bi = 0; bi < pieces.length; bi++) {
            if (pieces[bi].source !== 'bonded') continue;
            var bitem = eq2[pieces[bi].slot];
            if (bitem) bitem.bond = (bitem.bond || 0) + 3;
          }
        }
      } catch (e) {}
      return final;
    },

    // apArmorName: what the player is currently wearing (for the horror text).
    apArmorName: function () {
      try {
        var s = this.state.scholar || {};
        var eq = (s.equipped || {}).torso;
        if (eq) {
          var def = null;
          var items = this.data.items || [];
          var id = eq.itemId || eq.id;
          for (var i = 0; i < items.length; i++) {
            if (items[i].id === id) { def = items[i]; break; }
          }
          if (def) return def.name.toLowerCase();
        }
      } catch (e) {}
      return 'armor';
    },

    // apMaybeBeamAttack: called when an alien fighter attacks. Chance to use
    // beam weapon instead of normal attack. Rich/sadistic ones use it more.
    // Who fields a beam weapon? Everyone but Old Tam (he fights fair).
    // Shared by apMaybeBeamAttack (firing) and apStartEncounter (readiness
    // warning) — one source of truth, not two hardcoded lists.
    apHasBeam: function (pid) {
      return this.apIsCombat(pid) && pid !== 'old_tam';
    },

    // apStasisFieldLive: is a stasis field active in the current fight?
    // HONEST (break-it 2026-10-08): Rax's Stasis Field promises "Prevents
    // fleeing. You leave when Rax says you leave." — the barrier exit had no
    // stasis check, so fleeing worked fine. This scans the live fight for a
    // hostile fielding the tech (base or upgraded id). Returns the persona
    // id (for knowledge-gated messaging) or false.
    apStasisFieldLive: function () {
      try {
        var f = this.tbfight;
        if (!f || f.over || !f.fighters) return false;
        for (var i = 0; i < f.fighters.length; i++) {
          var m = f.fighters[i];
          if (!m || m.kind !== 'hostile' || !m.alive || m.fled || !m.alienPid) continue;
          var tech = m.alienTech || [];
          for (var t = 0; t < tech.length; t++) {
            var id = tech[t] && tech[t].id;
            if (id === 'stasis_field' || id === 'stasis_field_plus') return m.alienPid;
          }
        }
      } catch (e) {}
      return false;
    },

    apMaybeBeamAttack: function (fighter) {
      try {
        if (!fighter || !fighter.alienPid) return false;
        var pid = fighter.alienPid;
        var per = this.apPersona(pid);
        if (!per) return false;
        // SINGLE SOURCE OF TRUTH (break-it 2026-10-08): apHasBeam decides
        // who fields a beam weapon — not a second hardcoded list. Old Tam
        // fights fair: no beam, ever.
        if (!this.apHasBeam(pid)) return false;
        // Cooldown ticks on the alien's own turn: max one beam per ~3 rounds.
        // (break-it 2026-10-09: the tick used to live in a tbAfterPlayerAction
        // wrap that ALSO fired the beam after the alien's normal strike — a
        // free bonus attack contradicting the "replaces their normal attack"
        // design. The roll moved into tbAlienTurn (encounters.js); the tick
        // moved with it.)
        var f = this.tbfight;
        if (f && f._beamCooldown > 0) { f._beamCooldown--; return false; }
        // Who uses beams? Sadistic ones love them. Others use them when serious.
        var chance = 0.25;
        if (per.disposition === 'sadistic') chance = 0.4;
        if (fighter._enraged) chance += 0.2;
        if (Math.random() >= chance) return false;
        if (f) f._beamCooldown = 3;
        // FIRE THE BEAM
        var beamNames = {
          'vex_marlowe': 'Vex\'s phase lance',
          'countess_sable': 'Sable\'s dread beam',
          'rax_dentist': 'Rax\'s nerve scalpel',
          'pip_quindle': 'Pip\'s tourist zapper (it\'s set to "stun"! mostly)',
          'sarge': 'Sarge\'s service beam',
          'dr_fenwick': 'Fenwick\'s specimen beam',
        };
        // KNOWLEDGE GATE (break-it 2026-10-09): pre-reveal the fighter is a
        // "Stranger" (apBuildFighter's convention) — the old line named them
        // outright ("Vex raises Vex's phase lance") while the fighter card
        // still said Stranger.
        var _known = false;
        try { _known = !!this.apKnowsAlien(pid); } catch (e0k) {}
        var _who = _known ? per.name : 'The stranger';
        var beamName = _known ? (beamNames[pid] || (per.name + '\'s beam weapon')) : 'a beam weapon';
        this.say('🔆 ' + _who + ' raises ' + beamName + '. The air tastes like copper.');
        // AUDIO (break-it 2026-10-09): the beam is the aliens' signature
        // weapon — the raise is the "oh shit" telegraph and it was silent.
        // Machine-beam windup (beamTechWindup via the telegraph dispatcher),
        // not the deer's beamCharge — other beams are machines.
        try { this.audioEvent('telegraph', { pattern: 'beam', urgency: 1 }); } catch (e) {}
        // Player is the target (beam weapons are for the player)
        this.apBeamHit('player', 0, beamName, { damageType: 'alien_beam', pid: pid });
        return true;
      } catch (e) { return false; }
    },

  };

  Object.assign(G, methods);

  // ============ WRAPS (chain-safe) ============
  (function attach() {
    // Alien-player encounters: separate from monster combat.
    // After combat ends, check if it was an alien-player fight and record it.
    var _tbEnd = G.tbEnd;
    G.tbEnd = function (result) {
      var alienPid = null, alienKilled = false;
      try {
        if (this.tbfight && this.tbfight.fighters) {
          for (var i = 0; i < this.tbfight.fighters.length; i++) {
            var f = this.tbfight.fighters[i];
            if (f.kind === 'hostile' && f.alienPid) {
              alienPid = f.alienPid;
              // KILLED vs FLED (break-it 2026-10-09): a broke persona that
              // retreats ends the fight 'won' (encounters.js tbEndCheck treats
              // a fled hostile as defeated) — but there is no body to strip.
              // Armor salvage is kill-only.
              if (!f.alive) alienKilled = true;
              break;
            }
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
          this.apOnCombatEnd(alienPid, outcome, { killed: alienKilled });
          // Clear the encounter state
          if (this.state.alienEncounter) delete this.state.alienEncounter;
        }
        // GROUP CHAIN (Steve 2026-10-08): when a group encounter's current
        // fight is WON, the next persona steps in — the old fight is over
        // (tbfight.over=true, so startAlienCombat's inCombat guard passes
        // and the new fight replaces the corpse). Fleeing or losing
        // disperses the group: no ambush on a retreat, no fight after death.
        var grp = this.state.alienGroup;
        if (grp && grp.pids && alienPid) {
          delete this.state.alienGroup; // consume first — no re-entry loops
          var gi = grp.pids.indexOf(alienPid);
          var nextPid = gi >= 0 ? grp.pids[gi + 1] : null;
          if (nextPid && outcome === 'won') {
            // HONEST (break-it 2026-10-10 r11): the old code announced "the
            // next one steps out" BEFORE the chained start confirmed — a
            // refused or throwing start left the line hanging over an empty
            // treeline. Announce only on a real chain; the dispersal is
            // named honestly when nobody comes.
            var chained = false;
            try { chained = !!this.apStartEncounter(nextPid); } catch (e2) { chained = false; }
            if (chained) {
              this.say('👥 The next one steps out of the treeline. No rest. No mercy.');
              this.state.alienGroup = { pids: grp.pids, current: gi + 1 };
            } else {
              this.say('👥 The others melt back into the treeline. The moment passes.');
            }
          }
          // else: group done, fled, or lost — the moment passes.
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
    // WIRED (Steve 2026-10-08): contests.js _contestVerdict calls
    // apContestInterference(ac) directly and applies winMod/deathSave.
    // The old self-wrap here is REMOVED — it would double-fire the
    // interference (double messages, double RNG, double limits).

    // STASIS FIELD (break-it 2026-10-08): Rax's tech "prevents fleeing. You
    // leave when Rax says you leave." While a live hostile fields a stasis
    // field, the barrier exit is consumed with a stasis message — no 50%
    // break roll, no travel, the fight continues. Chain-safe: delegates to
    // the original tbBarrierExit otherwise.
    var _tbBarrierExit = G.tbBarrierExit;
    G.tbBarrierExit = function (dx, dy) {
      try {
        var _stasisPid = this.apStasisFieldLive && this.apStasisFieldLive();
        if (_stasisPid) {
          var f = this.tbfight;
          if (f && !f.over && this.tbIsPlayerTurn && this.tbIsPlayerTurn()) {
            // KNOWLEDGE GATE (break-it 2026-10-08): pre-reveal the field's
            // owner is unnamed — saying "Rax" would leak the alien truth
            // through the block message.
            var _known = false, _pn = null;
            try { _known = this.apKnowsAlien(_stasisPid); } catch (e0k) {}
            try { _pn = this.apPersona(_stasisPid); } catch (e0p) {}
            if (_known && _pn) {
              this.say('🛑 The air goes still — ' + _pn.name + '\u2019s stasis field catches the barrier and HOLDS it. You can\'t push through. You leave when ' + _pn.name + ' says you leave.');
            } else {
              this.say('🛑 The air goes still — a stasis field catches the barrier and HOLDS it. Someone out there doesn\'t want you leaving. You can\'t push through.');
            }
            try { this.audioEvent('stasisBlock'); } catch (e0s) {}
            return true; // consumed: no flee, no travel, fight continues
          }
        }
      } catch (e) {}
      return _tbBarrierExit ? _tbBarrierExit.apply(this, arguments) : false;
    };

    // ============ ARMOR TRANSITION WRAPS (Steve 2026-10-07) ============

    // 1. READINESS GATE: don't spawn alien players until the player has
    // at least a slight chance with a party.
    var _apEligible = G.apEncounterEligible;
    G.apEncounterEligible = function () {
      try {
        if (_apEligible && !_apEligible.apply(this, arguments)) return false;
        var check = this.apReadinessCheck ? this.apReadinessCheck() : { ready: true };
        if (!check.ready) return false;
        return true;
      } catch (e) { return false; }
    };

    // 2. BEAM DAMAGE INTERCEPT: alien_beam damage type bypasses normal armor.
    // Only beam-resistant gear (alien armor, bonded sentimental) reduces it.
    // VETERAN PLATE (break-it 2026-10-08): Sarge's tech "reduces all damage
    // by 2" was pure copy — no reduction existed in the damage path. Applied
    // here, on the target fighter's alien tech (base or upgraded id).
    // DEAD CODE (break-it 2026-10-08): the old "beam final" opts branch below
    // is removed — apBeamHit applies beam damage directly and never re-enters
    // tbDamage, so no caller could ever set that flag.
    var _tbDamage = G.tbDamage;
    G.tbDamage = function (targetKey, dmg, sourceLabel, sourceKey, opts) {
      try {
        if (opts && opts.damageType === 'alien_beam') {
          // Route through the beam resolver (handles resistance + horror beat)
          if (this.apBeamHit) return this.apBeamHit(targetKey, dmg, sourceLabel, opts);
        }
      } catch (e) {}
      try {
        var vf = this.tbFighter ? this.tbFighter(targetKey) : null;
        if (vf && vf.alienPid && vf.alive && !vf.fled) {
          var vtech = vf.alienTech || [];
          for (var vi = 0; vi < vtech.length; vi++) {
            var vid = vtech[vi] && vtech[vi].id;
            if (vid === 'veteran_plate' || vid === 'veteran_plate_plus') {
              if (typeof dmg === 'number' && isFinite(dmg)) dmg = Math.max(1, Math.round(dmg) - 2);
              break;
            }
          }
        }
      } catch (e2) {}
      return _tbDamage ? _tbDamage.call(this, targetKey, dmg, sourceLabel, sourceKey, opts) : undefined;
    };

    // 3. BEAM ATTACKS IN COMBAT (break-it 2026-10-09): the beam roll lives in
    // tbAlienTurn (encounters.js) — it REPLACES the alien's strike, per the
    // design. The old second tbAfterPlayerAction wrap here fired the beam
    // AFTER the alien's normal turn (a free bonus attack, contradicting the
    // "replaces their normal attack" design) — removed, and the cooldown
    // tick moved into apMaybeBeamAttack with the roll.

  })();
})(typeof window !== 'undefined' ? window : global);
