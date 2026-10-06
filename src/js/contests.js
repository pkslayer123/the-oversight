// @ontology
// system: contests
// description: Alien TV contests and shows that interrupt village life. Contests are FEARED high-risk events; shows are gossip/drama. UNAVOIDABLE — they interrupt whatever you're doing.
// provides:
//   - contestEligible() -> {eligible, reason}
//   - contestTick() -> event|null
//   - contestPool()
//   - pickContest()
//   - pickShow()
//   - fireContest(contest)
//   - resolveContest()
//   - contestInterruption(contest, participant) -> sequence
//   - contestKnowledge(contestId) -> {seen,wins,level}
//   - contestLearn(contestId, outcome)
//   - _contestDeathLine(contest, how, pname)
//   - _contestRenderPhase(ac, phase, idx)
//   - _contestCloserOdds(kind, wounds)
//   - _cxCoaching(contest)
//   - _cxPhaseSay(text)
// rules:
//   - unlock_day: 14 (code: contestTick, contestEligible)
//   - weekly_budget: 2 combined contests+shows (code: contestTick)
//   - daily_chance: 0.3 (code: contestTick)
//   - contest_vs_show_ratio: 0.6 (code: contestTick)
//   - system_whim_chance: 0.1 random participant override (code: fireContest)
//   - countdown_days: 1 (code: fireContest)
//   - unavoidable: true — contests interrupt, cannot be skipped (code: contestInterruption, Steve 2026-10-05)
//   - choice_sometimes: player may get choice to participate, usually grabbed (code: fireContest, Steve 2026-10-05)
//   - watch_mode: non-participants watch as a show (code: contestInterruption, Steve 2026-10-05)
//   - single_prefix: phase texts carry their own 📺 prefix; _cxPhaseSay never doubles it (code: _cxPhaseSay, Steve 2026-10-05)
//   - wounds_feed_closer: gauntlet closer death odds scale with damage taken in waves 1-2, displayed by the System (code: _contestCloserOdds, _contestRenderPhase, contestChoose dieWounds, Steve 2026-10-05)
//   - contest_knowledge: repeats build codex.contests levels 1-3; level 2 unlocks coaching in the intro, level 3 (veteran) reads hits coming (code: contestLearn, _cxCoaching, contestChoose, Steve 2026-10-05)
// consumes:
//   - scholar.day
//   - state.showBudget
//   - state.pendingContest
//   - state.contestsSeen
//   - state.codex.contests
// CONTESTS & SHOWS (Steve 2026-10-05)
// The aliens' flagship is OVERSIGHT. Contests are its teeth. TV shows are its gossip.
// Both interrupt your life. Neither asks permission.
//
// Unlock: day 14+. Budget: max 2/week combined. Contests are FEARED.

(function() {
  const G = globalThis.Scattering.Game;

  // === ELIGIBILITY ===
  // Visible, legible. Player can always answer "who can go, and why."
  G.contestEligible = function() {
    const day = this.state.scholar.day || 1;
    if (day < 14) return { eligible: [], reason: 'Show not yet casting (day 14+)' };
    
    const eligible = [];
    const roster = (this.state.village.roster || []);
    
    // Player always eligible if alive and not exiled
    const s = this.state.scholar;
    if (!this.state.over && !s.exiled) {
      const notes = [];
      const nota = this.notability('player');
      if (nota.length) notes.push(...nota);
      eligible.push({ id: 'player', name: 'You', notability: nota, notes });
    }
    
    // Villagers: check each
    for (const rid of roster) {
      const vp = (this.data.villagers || []).find(v => v.id === rid);
      if (!vp) continue;
      // Ineligible: gravely wounded, very young/old, exiled
      // (Simplified: skip if health < 30)
      const vpos = (this.state.village.positions || {})[rid];
      if (!vpos) continue;
      // For now, all villagers with positions are eligible
      // TODO: age, health checks when those systems exist
      const nota = this.notability(rid);
      eligible.push({ id: rid, name: this.displayName(rid), notability: nota, notes: [] });
    }
    
    return { eligible, reason: null };
  };

  // Notability: specific deeds that flag you
  G.notability = function(vid) {
    const notes = [];
    const deeds = (this.state.notability || {})[vid] || {};
    if (deeds.wave2Kill) notes.push('slew a wave-2 beast');
    if (deeds.wave3Kill) notes.push('slew a wave-3 horror');
    if (deeds.survivedMoot) notes.push('survived the Moot');
    if (deeds.heist) notes.push('pulled off a heist');
    if (deeds.contestWin) notes.push(`won ${deeds.contestWin} contest(s)`);
    return notes;
  };

  G.addNotability = function(vid, deed) {
    this.state.notability = this.state.notability || {};
    this.state.notability[vid] = this.state.notability[vid] || {};
    this.state.notability[vid][deed] = (this.state.notability[vid][deed] || 0) + 1;
  };

  // === SCHEDULER ===
  // 2/week budget shared between contests and shows.
  // Runs each dawn. Returns event or null.
  G.contestTick = function() {
    const day = this.state.scholar.day || 1;
    if (day < 14) return null;
    
    this.state.showBudget = this.state.showBudget || { week: 0, used: 0 };
    const week = Math.floor(day / 7);
    if (this.state.showBudget.week !== week) {
      this.state.showBudget = { week, used: 0 };
    }
    if (this.state.showBudget.used >= 2) return null; // budget exhausted
    
    // 30% chance per day of an event (if budget remains)
    // This averages ~2/week without being predictable
    if (Math.random() > 0.3) return null;
    
    const { eligible } = this.contestEligible();
    if (!eligible.length) return null;
    
    // 60% contest, 40% show
    const isContest = Math.random() < 0.6;
    const event = isContest ? this.pickContest() : this.pickShow();
    if (!event) return null;
    
    this.state.showBudget.used++;
    return event;
  };

  // === CONTEST POOL ===
  // Data-driven templates. Categories: Blood, Endurance, Moot, Weird,
  // Puzzle, Detective, Forage, Chance. (Steve 2026-10-05: expand variety)
  G.contestPool = function() {
    return [
      // BLOOD (combat) — the feared ones
      { id: 'pit', name: 'The Pit', cat: 'blood', risk: 'high',
        desc: 'Thrown into an arena with a wave-appropriate beast. Kill or be killed. The audience votes on weapons.',
        participants: 1,
        arena: '🕳️\n🪨🪨🪨🪨🪨\n🪨⬛⬛⬛🪨\n🪨⬛🦴⬛🪨\n🪨⬛⬛⬛🪨\n🪨🪨🪨🪨🪨\n👥👥👥👥👥' },
      { id: 'gauntlet', name: 'Gauntlet', cat: 'blood', risk: 'extreme',
        desc: 'Three waves, no rest. Survive all three and the crowd goes wild. Most don\'t see wave two.',
        participants: 1,
        arena: '⚔️\n🔥🔥🔥🔥🔥\n🔥⬛⬛⬛🔥\n🔥⬛⚔️⬛🔥\n🔥⬛⬛⬛🔥\n🔥🔥🔥🔥🔥' },
      { id: 'duel', name: 'Duel', cat: 'blood', risk: 'high',
        desc: 'You vs another contestant. Not to the death — to the yield. But accidents happen.',
        participants: 2,
        arena: '🤺\n➖➖➖➖➖\n⬜⬜⚔️⬜⬜\n➖➖➖➖➖\n👥👥👥👥👥' },
      // ENDURANCE (survival)
      { id: 'drop', name: 'The Drop', cat: 'endurance', risk: 'high',
        desc: 'Dropped somewhere with nothing. First back to the beacon eats. The others... walk.',
        participants: 3,
        arena: '🏔️\n⛰️⛰️⛰️⛰️⛰️\n⛰️❄️❄️❄️⛰️\n⛰️❄️🚩❄️⛰️\n⛰️❄️❄️❄️⛰️\n⛰️⛰️⛰️⛰️⛰️' },
      { id: 'starve', name: 'Hollow Belly', cat: 'endurance', risk: 'medium',
        desc: 'No food for three days. The System watches who breaks first. Water provided. Dignity not.',
        participants: 4,
        arena: '🍽️\n⬛⬛⬛⬛⬛\n⬛🍽️⬛🍽️⬛\n⬛⬛⬛⬛⬛\n⬛🍽️⬛🍽️⬛\n⬛⬛⬛⬛⬛' },
      // MOOT (social)
      { id: 'moot', name: 'The Moot', cat: 'moot', risk: 'medium',
        desc: 'Televised trial. Defend yourself against accusations (true or not). The audience is the jury.',
        participants: 1,
        arena: '⚖️\n👥👥👥👥👥\n⬜⬜🎤⬜⬜\n⬜⬜⬜⬜⬜\n👥👥👥👥👥' },
      { id: 'lies', name: 'Lie Detector', cat: 'moot', risk: 'low',
        desc: 'Answer questions. The System knows when you lie. The audience loves when you do.',
        participants: 2,
        arena: '🤥\n🔍🔍🔍🔍🔍\n⬜⬜🪑⬜⬜\n⬜⬜⬜⬜⬜\n📺📺📺📺📺' },
      // WEIRD (unhinged)
      { id: 'cookfight', name: 'Cooking With Teeth', cat: 'weird', risk: 'medium',
        desc: 'Cook a meal. The ingredients fight back. Presentation matters. Survival matters more.',
        participants: 2,
        arena: '🍳\n🔪🔪🔪🔪🔪\n🍳🦷🦷🦷🍳\n🔪🔪🔪🔪🔪\n👨‍🍳👨‍🍳👨‍🍳' },
      { id: 'fetch', name: 'Bring Us Something Interesting', cat: 'weird', risk: 'low',
        desc: 'One mile radius. One hour. Most interesting thing wins. Judged by beings who have never touched grass.',
        participants: 3,
        arena: '🔍\n🌿🌿🌿🌿🌿\n🌿❓🌿❓🌿\n🌿🌿🌿🌿🌿\n🌿❓🌿❓🌿' },
      { id: 'hide', name: 'Hide and Seek', cat: 'weird', risk: 'extreme',
        desc: 'Hide. The seeker is a wave-2 predator. It\'s very good at seeking.',
        participants: 3,
        arena: '👁️\n🌲🌲🌲🌲🌲\n🌲👤🌲👤🌲\n🌲🌲🌲🌲🌲\n🌲👤🌲🐺🌲' },
      // PUZZLE (Steve 2026-10-05)
      { id: 'box', name: 'The Box', cat: 'puzzle', risk: 'medium',
        desc: 'An alien puzzle box. Solve it or be stuck inside the arena until you do. The audience has the manual.',
        participants: 1,
        arena: '📦\n⬛⬛⬛⬛⬛\n⬛🧩🧩🧩⬛\n⬛🧩📦🧩⬛\n⬛🧩🧩🧩⬛\n⬛⬛⬛⬛⬛' },
      { id: 'pattern', name: 'Pattern Hunger', cat: 'puzzle', risk: 'low',
        desc: 'A sequence of foods. Eat them in the right order. The wrong order... disagrees with you.',
        participants: 2,
        arena: '🧩\n🍎🍌🍇🍊🍎\n❓❓❓❓❓\n🍽️🍽️🍽️🍽️🍽️' },
      // DETECTIVE (Steve 2026-10-05)
      { id: 'whoate', name: 'Who Ate It?', cat: 'detective', risk: 'low',
        desc: 'Someone stole the prize. Interrogate the suspects. The thief is among you.',
        participants: 3,
        arena: '🔍\n👤👤👤👤👤\n❓❓❓❓❓\n🍖🍖🍖🍖🍖' },
      { id: 'informant', name: 'The Informant', cat: 'detective', risk: 'medium',
        desc: 'One of you is lying about everything. Find them before they find the exit.',
        participants: 4,
        arena: '🕵️\n👤🤥👤🤥👤\n🔍🔍🔍🔍🔍\n🚪🚪🚪🚪🚪' },
      // FORAGE (Steve 2026-10-05)
      { id: 'calorie_run', name: 'Calorie Run', cat: 'forage', risk: 'medium',
        desc: 'One hour. Whoever collects the most calorie-dense materials wins. The forest is... competitive.',
        participants: 3,
        arena: '🌿\n🌳🍎🌳🍇🌳\n🌳🌿🌳🌿🌳\n🌳🍒🌳🌰🌳\n🌳🌿🌳🌿🌳' },
      { id: 'pantry_raid', name: 'Pantry Raid', cat: 'forage', risk: 'high',
        desc: 'Gather from a dangerous location. The locals object. Bring back food or don\'t come back.',
        participants: 2,
        arena: '🏚️\n⚠️⚠️⚠️⚠️⚠️\n🏚️🍖🏚️🍖🏚️\n⚠️⚠️⚠️⚠️⚠️\n🐺🐺🐺🐺🐺' },
      // CHANCE (Steve 2026-10-05)
      { id: 'wheel', name: 'Wheel of Teeth', cat: 'chance', risk: 'medium',
        desc: 'Spin the wheel. The teeth decide. The audience holds its breath.',
        participants: 1,
        arena: '🎡\n🦷🦷🦷🦷🦷\n🎡⬛⬛⬛🎡\n🦷🦷🦷🦷🦷' },
      { id: 'lottery', name: 'The Lottery', cat: 'chance', risk: 'low',
        desc: 'Pure luck. Draw a token. The audience loves an underdog.',
        participants: 5,
        arena: '🎰\n🎫🎫🎫🎫🎫\n🎰⬛⬛⬛🎰\n🎫🎫🎫🎫🎫' },
    ];
  };

  G.pickContest = function() {
    const pool = this.contestPool();
    const wave = this.unlockedWave();
    // Filter by wave-appropriateness (higher waves unlock scarier contests)
    let candidates = pool;
    if (wave < 2) candidates = pool.filter(c => c.risk !== 'extreme');
    if (wave < 3) candidates = candidates.filter(c => c.id !== 'gauntlet');
    
    // RNG: pick random (Steve 2026-10-05: mostly random which one you get)
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    
    // VARIANT (Steve 2026-10-05): like monsters, contests get variants.
    // If you've seen this contest before, 30% chance it's HARDENED:
    // higher risk, better prizes, twist on the rules.
    const seen = (this.state.contestsSeen || {})[pick.id] || 0;
    let variant = null;
    if (seen > 0 && Math.random() < 0.3) {
      variant = 'hardened';
    }
    // Track that we've seen it
    this.state.contestsSeen = this.state.contestsSeen || {};
    this.state.contestsSeen[pick.id] = seen + 1;
    
    // Wave scaling: higher waves = harder contests
    // (Risk increases, but so do prizes)
    const scaled = Object.assign({}, pick);
    if (wave >= 3 && scaled.risk === 'medium') scaled.risk = 'high';
    if (wave >= 4 && scaled.risk === 'high') scaled.risk = 'extreme';
    
    if (variant === 'hardened') {
      scaled.name = 'Hardened ' + scaled.name;
      scaled.desc += ' The rules have changed. The audience demanded it.';
      // Bump risk one level
      const risks = ['low', 'medium', 'high', 'extreme'];
      const idx = risks.indexOf(scaled.risk);
      if (idx < 3) scaled.risk = risks[idx + 1];
      scaled.variant = 'hardened';
    }
    
    return scaled;
  };

  // === TV SHOWS ===
  G.showPool = function() {
    return [
      { id: 'why_eat', name: 'WHY DO THEY EAT?', 
        desc: 'Cook for the aliens. They are horrified. The audience is delighted.' },
      { id: 'break_room', name: 'Break Room',
        desc: 'Gossip show. Your drama, aired to the galaxy.' },
      { id: 'mouth_race', name: 'Mouth Race',
        desc: 'Cooking competition. Speed matters. So does not poisoning the judges.' },
      { id: 'ask_human', name: 'Ask a Human',
        desc: 'Call-in show. Strangers ask you deeply uncomfortable questions.' },
      { id: 'death_reel', name: 'The Death Reel',
        desc: 'Highlights. Yes, including yours. Especially yours.' },
    ];
  };

  G.pickShow = function() {
    const pool = this.showPool();
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // === RESOLUTION ===
  // Simplified for now: contest fires, participant chosen, outcome rolled.
  // Full arena combat comes later.
  G.fireContest = function(contest) {
    const { eligible } = this.contestEligible();
    if (!eligible.length) return;
    
    // Pick participant: prefer player if eligible, else random villager
    // (System's whim: 10% chance of random pick regardless)
    let pick;
    if (Math.random() < 0.1) {
      pick = eligible[Math.floor(Math.random() * eligible.length)];
      this.sysSay(`📺 The System's whim: ${pick.name} is *interesting*. ${pick.name} goes.`);
    } else {
      pick = eligible.find(e => e.id === 'player') || eligible[Math.floor(Math.random() * eligible.length)];
    }
    
    this.sysSay(`📺 CONTEST: ${contest.name}. ${contest.desc}`);
    if (contest.arena) {
      this.sysSay(`📺 Arena:\n${contest.arena}`);
    }
    if (contest.variant === 'hardened') {
      this.sysSay(`📺 ⚠️ HARDENED VARIANT — you've seen this before. It's worse now.`);
    }
    this.sysSay(`📺 ${pick.id === 'player' ? 'You have' : pick.name + ' has'} been chosen. The village holds its breath.`);
    
    // Countdown: 1 day (simplified)
    this.state.pendingContest = {
      contestId: contest.id,
      participant: pick.id,
      firesDay: (this.state.scholar.day || 1) + 1,
      variant: contest.variant || null,
    };
  };

  // CONTEST INTERRUPTION (Steve 2026-10-05):
  // Contests are UNAVOIDABLE. When the time comes, you go through the sequence
  // no matter where you are or what you're doing. Participate or don't —
  // but skipping isn't a thing. If you're not involved, you watch the show.
  G.contestInterruption = function(contest, participantId) {
    const isPlayer = participantId === 'player';
    const pname = isPlayer ? 'You' : this.displayName(participantId);
    
    // The interruption itself — this is the sequence you can't skip
    this.sysSay(`📺 ═══ CONTEST INTERRUPTION ═══`);
    this.sysSay(`📺 ${contest.name}. ${contest.desc}`);
    
    if (contest.arena) {
      this.sysSay(`📺 Arena:\n${contest.arena}`);
    }
    if (contest.variant === 'hardened') {
      this.sysSay(`📺 ⚠️ HARDENED VARIANT — you've seen this before. It's worse now.`);
    }
    
    if (isPlayer) {
      // Sometimes you get a choice, usually you're grabbed
      // (Steve 2026-10-05: "sometimes you get a choice depending on the contest,
      //  but usually it grabs you anyways, participate or don't")
      const givesChoice = contest.givesChoice || Math.random() < 0.3;
      if (givesChoice) {
        this.sysSay(`📺 The System offers you a choice: participate or refuse.`);
        // Real choice — refusal is a sequence via _contestRefuse, not a skip
        const playable = this.contestPlayable(contest);
        const choicePhase = {
          text: `📺 ${contest.name}. ${contest.desc}\n\nThe System waits. The cameras are already rolling. Participate — or refuse, and let the galaxy watch you say no.`,
          choices: [
            { label: 'Participate', sub: 'step into the light', do: {}, next: 0 },
            { label: 'Refuse', sub: 'say no on camera', do: {}, next: 'REFUSE' },
          ]
        };
        this.state.activeContest = {
          contestId: contest.id,
          participant: 'player',
          phase: 'choice',
          phaseIdx: 0,
          phases: [choicePhase, ...playable],
          variant: contest.variant || null,
          wounds: 0,
        };
        return this.state.activeContest;
      } else {
        this.sysSay(`📺 ${pname} — you're grabbed. No choice. The cameras are already rolling.`);
      }
      // PLAYABLE (Steve 2026-10-05): the contest is a phase sequence with
      // real choices, not a dice roll. Phases render in the narration UI.
      let phases;
      try { phases = this.contestPlayable(contest); } catch (e) { phases = null; }
      this.state.activeContest = {
        contestId: contest.id,
        participant: 'player',
        phase: 'intro',
        phaseIdx: 0,
        phases: phases,
        variant: contest.variant || null,
        wounds: 0,
      };
      if (phases && phases[0]) {
        this.sysSay('📺 ───');
        this._cxPhaseSay(this._contestRenderPhase(this.state.activeContest, phases[0], 0).text);
      }
    } else {
      // You're not in it — you WATCH. Especially if villagers are involved.
      // (Steve 2026-10-05: "we should aspire to essentially put on a show
      //  they can watch, especially if other villagers are involved")
      this.sysSay(`📺 ${pname} has been chosen. The village holds its breath.`);
      this.sysSay(`📺 You watch. The cameras love this part.`);
      let wphases;
      try { wphases = this._contestWatchPhases(contest, participantId); } catch (e) { wphases = null; }
      this.state.activeContest = {
        contestId: contest.id,
        participant: participantId,
        phase: 'watching',
        phaseIdx: 0,
        phases: wphases,
        variant: contest.variant || null,
        wounds: 0,
      };
      if (wphases && wphases[0]) {
        this.sysSay('📺 ───');
        this._cxPhaseSay(wphases[0].text);
      }
    }
    
    // The interruption is modal — it takes over the UI until resolved
    // (Steve: "no matter where you are or what you are doing, when the time
    //  comes you go through the sequence")
    return this.state.activeContest;
  };

  G.resolveContest = function() {
    const pc = this.state.pendingContest;
    if (!pc) return;
    this.state.pendingContest = null;
    
    const contest = this.contestPool().find(c => c.id === pc.contestId);
    if (!contest) return;
    
    // INTERRUPTION (Steve 2026-10-05): the contest doesn't resolve via dice roll.
    // It INTERRUPTS. You go through the sequence. Participate or don't.
    // If you're not involved, you watch.
    return this.contestInterruption(contest, pc.participant);
    
    // LEGACY DICE ROLL (below) — kept for reference, not used.
    // The playable sequence replaces this. When each contest becomes playable,
    // its specific mechanics live in the interruption phases.
    /*
    
    let outcome;
    if (r < deathChance) {
      outcome = 'died';
    } else if (r < deathChance + 0.3) {
      outcome = 'lost';
    } else {
      outcome = 'won';
    }
    
    const pname = pc.participant === 'player' ? 'You' : this.displayName(pc.participant);
    
    if (outcome === 'died') {
      this.sysSay(`📺 ${pname} did not come home from ${contest.name}. The Death Reel will be tasteful.`);
      // Handle death (simplified)
      if (pc.participant === 'player') {
        this.playerDeath('contest');
      } else {
        // Villager death
        this.say(`☠ ${pname} is gone.`);
      }
      this.leadShift('fracture', 2);
    } else if (outcome === 'won') {
      this.sysSay(`📺 ${pname} WINS ${contest.name}! The crowd goes wild!`);
      this.addNotability(pc.participant, 'contestWin');
      this.leadShift('showmanship', 2);
      // Prize: alien loot
      const prize = this.rollAlienLoot({ wave: this.unlockedWave(), loot: { chance: 1, tier: this.unlockedWave() } });
      if (prize) {
        this.sysSay(`📺 Prize: ${prize}!`);
        // Give to participant (simplified: player inventory)
        if (pc.participant === 'player') {
          this.state.scholar.inventory.push({ itemId: prize, units: 1 });
        }
      }
    } else {
      this.sysSay(`📺 ${pname} survives ${contest.name}, but does not win. The audience is... polite.`);
      this.leadShift('showmanship', 1);
    }
    */
  };

  // === PLAYABLE CONTEST ENGINE (Steve 2026-10-05) ===
  // Contests were "executable" (fired, printed lines, died) but not playable.
  // Now each contest is a 3-phase interactive sequence with real choices,
  // real stakes, real consequences. FEARED means dangerous. UNAVOIDABLE means
  // even refusal is a played sequence, not a skip.
  //
  // Phase: { text, choices: [{label, sub, do, next}] }
  //   do: { dmg:[lo,hi] (to player), heal:n, die:0-1 (chance), prize:bool,
  //         note:"...", notability:"deed", kcal:-n, trauma:n }
  //   next: phase index, or 'WIN' / 'LOSE' / 'DIE' / 'REFUSE'
  //
  // contestChoose(idx): apply the choice at current phase, advance.

  G.contestPlayable = function(contest) {
    const id = contest.id;
    if (id === 'pit') return this._contestPit(contest);
    if (id === 'gauntlet') return this._contestGauntlet(contest);
    if (id === 'hide') return this._contestHide(contest);
    if (id === 'duel') return this._contestDuel(contest);
    const cat = contest.cat;
    if (cat === 'endurance') return this._contestEndurance(contest);
    if (cat === 'moot') return this._contestMoot(contest);
    if (cat === 'weird') return this._contestWeird(contest);
    if (cat === 'puzzle') return this._contestPuzzle(contest);
    if (cat === 'detective') return this._contestDetective(contest);
    if (cat === 'forage') return this._contestForage(contest);
    if (cat === 'chance') return this._contestChance(contest);
    return this._contestGeneric(contest);
  };

  // --- shared helpers ---
  G._cxIntro = function(contest) {
    const riskLine = { low: 'The audience expects entertainment, not blood.',
      medium: 'People have been hurt in this one. Not always.',
      high: 'People die in this one. Regularly.',
      extreme: 'Almost nobody walks away from this one.' }[contest.risk] || '';
    return `📺 ${contest.name}. ${contest.desc}\n\n${riskLine}\n\nThe lights come up. You can hear the crowd — millions of them, somewhere past the sky.` + this._cxCoaching(contest);
  };

  G._cxWin = function(contest, prizeText) {
    return { text: `📺 ${contest.name} — OVER. The crowd is on its feet. Somewhere, impossibly far away, something like cheering shakes the air.\n\n${prizeText || 'You won.'}`,
      choices: [{ label: 'Take the win', sub: 'collect', do: { prize: true, notability: 'contestWin' }, next: 'WIN' }] };
  };

  G._cxLose = function(contest, text) {
    return { text: `📺 ${contest.name} — OVER.\n\n${text || 'You survived. The audience is polite. Polite is worse than booing.'}`,
      choices: [{ label: 'Walk away', sub: 'alive, barely', do: {}, next: 'LOSE' }] };
  };

  // Phase texts carry their own 📺 prefix (see _cxIntro). Say them as-is;
  // never stack another 📺 in front (Steve 2026-10-05: double-prefix fix).
  G._cxPhaseSay = function(text) {
    this.sysSay(/^📺/.test(text) ? text : ('📺 ' + text));
  };

  // === CONTEST KNOWLEDGE (Steve 2026-10-05) ===
  // Surviving, losing, or watching a contest teaches its beats. Knowledge
  // compounds: doing teaches double. Level 1 = witnessed (in the codex).
  // Level 2 = know the beats (intro shows coaching — "if you don't know,
  // it doesn't show" cuts the other way too: earned knowledge IS shown).
  // Level 3 = veteran: you read the hits coming (contest damage reduced).
  G.contestKnowledge = function(contestId) {
    const c = (this.state.codex || {}).contests || {};
    return c[contestId] || { seen: 0, wins: 0, level: 0 };
  };

  G.contestLearn = function(contestId, outcome) {
    // outcome: 'won' | 'lost' | 'died' | 'refused' | 'watched'
    this.state.codex = this.state.codex || {};
    this.state.codex.contests = this.state.codex.contests || {};
    const k = this.state.codex.contests[contestId] || { seen: 0, wins: 0, level: 0 };
    const did = outcome === 'won' || outcome === 'lost' || outcome === 'died';
    k.seen += did ? 2 : 1;
    if (outcome === 'won') k.wins += 1;
    const lvl = k.seen >= 6 ? 3 : k.seen >= 3 ? 2 : 1;
    if (lvl > k.level) {
      k.level = lvl;
      const cname = (this.contestPool().find(c => c.id === contestId) || {}).name || contestId;
      if (lvl === 2) this.sysSay(`📚 ${cname}: you know its beats now. The intro will tell you what you've learned.`);
      if (lvl === 3) this.sysSay(`📚 ${cname}: veteran. You read the hits coming now — the System hates that.`);
    }
    this.state.codex.contests[contestId] = k;
    return k;
  };

  // Coaching: what level-2+ knowledge actually tells you. Short, real intel —
  // the kind of thing a survivor would mutter to a first-timer.
  G._cxCoaching = function(contest) {
    if (this.contestKnowledge(contest.id).level < 2) return '';
    const LINES = {
      pit: 'The beast feints first, commits second. Sand buys a full second. The sidestep wins cleaner than the charge.',
      gauntlet: "Wave two hits hardest — don't spend everything on wave one. The closer smells blood: arrive hurt and it knows.",
      duel: 'The drone calls it fast. Mercy plays better than cruelty — unless you mean it.',
      drop: "Ridge line beats valley. Don't eat the snow. Night movement is a gamble.",
      starve: 'Sleep through day one. The broth is a trap and the cameras saw you.',
      moot: 'The audience votes with attention. Confession disarms; the perfect lie wins the moment.',
      lies: 'The scanner hates hesitation more than lies. Commit to the bit.',
      cookfight: "Befriend first, wrestle second. The judges have never tasted anything — novelty beats technique.",
      fetch: 'Weird beats shiny. The story of the thing matters more than the thing.',
      hide: "Stillness beats speed. It hears running from a mile off.",
      box: "The chat lies half the time. Trust the pattern you built, not the crowd.",
      pattern: 'Small bites, right order. Your gut knows before you do.',
      whoate: "Watch the quiet one. Alibis that almost hold don't.",
      informant: 'The informant tests the exits early. Watch the doors, not the faces.',
      calorie_run: 'Deep woods pay double and charge double. The edges are safe and middling.',
      pantry_raid: "The locals have routines — learn them before you grab. Leave an offering; they'll let you walk.",
      wheel: "Nothing helps. That's the point. Take it standing.",
      lottery: "Nothing helps. That's the point. Laugh anyway.",
    };
    return '\n\n📚 What you know: ' + (LINES[contest.id] || "You've seen this before. Trust your instincts.");
  };

  // --- THE PIT (bespoke, blood) ---
  G._contestPit = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe arena floor is sand and old bone. The gate across from you rattles. Something in there is breathing hard.\n\nThe System's voice, bright as a knife: "CHOOSE YOUR WEAPON, CONTESTANT."`,
        choices: [
          { label: 'Spear', sub: 'reach, steady', do: { note: 'You take the spear. It feels honest.' }, next: 1 },
          { label: 'Net and knife', sub: 'tricky, close', do: { note: 'Net in one hand, knife in the other. The crowd oohs.' }, next: 1 },
          { label: 'Nothing', sub: 'the crowd gasps', do: { note: 'You shake your head. The gasp rolls around the arena like weather.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: `The gate slams up. A wave-appropriate beast comes out low and fast — it has been promised food.\n\nIt circles. It's deciding how you die.`,
        choices: [
          { label: 'Hold your ground', sub: 'let it come to you', do: { dmg: [8, 18], note: 'It feints, then commits. You take the hit on your terms — mostly.' }, next: 2 },
          { label: 'Charge it', sub: 'shock and awe', do: { dmg: [12, 25], die: 0.08, note: 'You SCREAM and run at it. The crowd loses its mind. So does the beast.' }, next: 2 },
          { label: 'Throw sand', sub: 'dirty, smart', do: { dmg: [4, 10], note: 'Sand in the eyes. It shakes its head, blind and furious — and slower.' }, next: 2 },
        ] },
      { text: `It's bleeding. You're bleeding. The crowd can smell both.\n\nThe beast gathers itself for one last rush. This is the moment the Death Reel loves.`,
        choices: [
          { label: 'Meet the rush', sub: 'end it now', do: { prize: true,  dmg: [15, 30], die: 0.12, note: 'You plant your feet and meet it head-on. Something has to give.' }, next: 'WIN' },
          { label: 'Sidestep and strike', sub: 'precision over courage', do: { prize: true,  dmg: [6, 14], note: 'You slide aside at the last breath and open its flank as it passes.' }, next: 'WIN' },
          { label: 'Play dead', sub: 'desperate', do: { dmg: [0, 6], die: 0.05, note: 'You drop. It sniffs you. The crowd holds its breath... it turns away, confused. Cowardice, televised — but breathing.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- GAUNTLET (bespoke, blood/extreme) ---
  G._contestGauntlet = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThree gates. Three waves. No rest between.\n\nThe System: "WAVE ONE. TRY TO LOOK SURPRISED."\n\nThe System adds, almost kindly: "THE CLOSER SMELLS BLOOD, CONTESTANT. ARRIVE HURT AND IT KNOWS."\n\nThe first beast is fast and stupid. It wants you tired for what's next.`,
        choices: [
          { label: 'Kill it fast', sub: 'spend everything', do: { dmg: [10, 20], kcal: -300, note: 'You go all out. It dies quick. You\'re breathing hard already.' }, next: 1 },
          { label: 'Wear it down', sub: 'patient, costly', do: { dmg: [6, 12], kcal: -150, note: 'You let it waste itself on your guard. Slow. Smart. Tiring anyway.' }, next: 1 },
          { label: 'Use the arena', sub: 'walls, spikes, sand', do: { dmg: [4, 10], note: 'You bait it into the spike strip. The crowd appreciates the craft.' }, next: 1 },
        ] },
      { text: `WAVE TWO. Bigger. It has seen the first wave's corpse and learned nothing, which is worse.\n\nYour arms are heavy. The crowd chants your name wrong.`,
        choices: [
          { label: 'All offense', sub: 'no defense left', do: { dmg: [18, 32], die: 0.15, note: 'You throw everything into the attack. If this doesn\'t work, nothing will.' }, next: 2 },
          { label: 'Desperate defense', sub: 'survive the wave', do: { dmg: [10, 18], kcal: -200, note: 'You curl around your vitals and let it spend itself. It hurts. You live.' }, next: 2 },
          { label: 'Beg the crowd', sub: 'humiliating, maybe works', do: { dmg: [6, 14], die: 0.05, note: 'You drop to your knees and BEG. The audience laughs — and votes you a weapon drop. A real one.' }, next: 2 },
        ] },
      { text: `WAVE THREE. The gate opens and what comes out is wrong in ways the first two weren't.\n\nThis is the one the Death Reel is for.`,
        choices: [
          // CLOSER (Steve 2026-10-05): no flat dice. The closer's kill odds scale
          // with the wounds you carried in (dieWounds), and the System displays
          // them — readable danger, earned by how you fought waves 1-2.
          { label: 'Stand and fight', sub: 'the only way out is through', do: { prize: true,  dmg: [25, 45], dieWounds: 'stand', note: 'You stand. It comes. The next minute is the longest of your life.' }, next: 'WIN' },
          { label: 'Run the clock', sub: 'dodge until it tires', do: { prize: true,  dmg: [12, 22], dieWounds: 'run', kcal: -400, note: 'You run. The arena is small and the crowd counts your laps. It tires. You nearly don\'t.' }, next: 'WIN' },
          { label: 'Offer yourself', sub: 'a different bargain — about a coin flip', do: { die: 0.5, note: 'You stop, spread your arms, and offer it something it didn\'t expect: stillness. It hesitates. The System leans in, fascinated.' }, next: 'LOSE' },
        ] },
    ];
  };

  // GAUNTLET CLOSER (Steve 2026-10-05): the closer smells blood. Death odds
  // scale with wounds taken during the contest — readable, escalating,
  // earned. Standing your ground is riskier than running, always.
  G._contestCloserOdds = function(kind, wounds) {
    const spec = { stand: [0.08, 0.006, 0.45], run: [0.03, 0.005, 0.30] }[kind] || [0.10, 0.005, 0.40];
    return Math.min(spec[2], spec[0] + (wounds || 0) * spec[1]);
  };

  // Render a phase for display. For the Gauntlet closer, append the wound
  // readout and per-choice death odds — the System displays them, because
  // it's television and it wants you to know. Identified structurally
  // (choices carrying dieWounds), so the choice-phase prepend can't shift it.
  G._contestRenderPhase = function(ac, phase, idx) {
    if (!phase) return phase;
    const hasCloser = (phase.choices || []).some(c => c.do && c.do.dieWounds);
    if (ac.contestId === 'gauntlet' && hasCloser) {
      const w = ac.wounds || 0;
      const cond = w >= 45 ? 'You are barely standing. The closer can smell the blood.'
        : w >= 25 ? 'You are hurt — limping, bleeding, loud. The closer likes that.'
        : w >= 10 ? 'You are nicked and winded. It could be worse.'
        : 'You are barely scratched. The closer looks... disappointed.';
      const text = phase.text +
        `\n\n📺 ${cond} (Damage taken so far: ${w}.)` +
        `\n📺 The System helpfully displays your odds. It wants you to know.`;
      const choices = (phase.choices || []).map(c => {
        if (c.do && c.do.dieWounds) {
          const odds = Math.round(this._contestCloserOdds(c.do.dieWounds, w) * 100);
          return Object.assign({}, c, { sub: `${c.sub} — death odds ~${odds}%` });
        }
        return c;
      });
      return { text, choices };
    }
    return phase;
  };

  // --- HIDE AND SEEK (bespoke, weird/extreme) ---
  G._contestHide = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe seeker is a wave-2 predator. It is very good at seeking.\n\nYou get a sixty-count. The forest is dense, dark, and full of things that want to be left alone.\n\nThe System counts down. The predator is already listening.`,
        choices: [
          { label: 'Climb high', sub: 'trees, branches', do: { note: 'You climb until the branches thin. Your heart is louder than the leaves.' }, next: 1 },
          { label: 'Go low', sub: 'mud, roots, burrow', do: { note: 'You press into the mud under the roots. Something else is already down here. It ignores you.' }, next: 1 },
          { label: 'Hide in the open', sub: 'stillness as camouflage', do: { note: 'You stand against a trunk and do not move. Not a muscle. You become bark.' }, next: 1 },
        ] },
      { text: `You hear it. Not footsteps — the absence of other sounds. Birds go quiet in a widening circle.\n\nIt's close. It sniffs the air the way you check the weather.`,
        choices: [
          { label: 'Hold your breath', sub: 'do not exist', do: { dmg: [0, 8], die: 0.1, note: 'You stop breathing. Your lungs burn. It passes — or it doesn\'t.' }, next: 2 },
          { label: 'Throw a stone', sub: 'misdirect', do: { note: 'You flick a stone into the dark. It turns toward the sound. Clever. It knows that trick too.' }, next: 2 },
          { label: 'Run', sub: 'break cover', do: { dmg: [10, 22], die: 0.2, note: 'You RUN. Branches tear. Behind you, the quiet breaks into pursuit.' }, next: 2 },
        ] },
      { text: `The count is almost up. You can hear the System warming up the "FOUND YOU" sting.\n\nIt's right there. You can see its eyes catch the light.`,
        choices: [
          { label: 'Stay hidden', sub: 'trust the spot', do: { prize: true,  dmg: [0, 12], die: 0.18, note: 'You do not move. You barely breathe. The eyes sweep past — or stop.' }, next: 'WIN' },
          { label: 'Confront it', sub: 'scare it off', do: { prize: true,  dmg: [15, 30], die: 0.25, note: 'You burst out screaming, arms wide. Predators hate surprises. Usually.' }, next: 'WIN' },
          { label: 'Surrender', sub: 'live, lose', do: { note: 'You stand up with your hands out. It blinks. The System sighs — found, but boring.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- DUEL (blood) ---
  G._contestDuel = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nYour opponent is another contestant — scared, like you, but hiding it worse. Not to the death. To the yield.\n\nBut accidents happen. The System says this like it's a joke.`,
        choices: [
          { label: 'Offer a deal', sub: 'split the prize', do: { note: 'You whisper: we both walk out, we split whatever they give. They stare. The audience leans in.' }, next: 1 },
          { label: 'Study them', sub: 'find the weakness', do: { note: 'You watch how they stand. Favoring the left. Nervous hands. You can work with this.' }, next: 1 },
          { label: 'Attack first', sub: 'no ceremony', do: { dmg: [6, 14], note: 'You don\'t wait for the bell. Neither does the crowd\'s gasp.' }, next: 1 },
        ] },
      { text: `They yield — or they don't. The ref-drone hovers, sensors hot.\n\nThe crowd wants blood. The System wants a story. You want to go home.`,
        choices: [
          { label: 'Press the advantage', sub: 'finish it', do: { prize: true,  dmg: [12, 24], die: 0.1, trauma: 10, note: 'You press. They go down. The drone calls it. Your hands won\'t stop shaking.' }, next: 'WIN' },
          { label: 'Accept their yield', sub: 'mercy, televised', do: { prize: true,  note: 'They tap out. You step back. The crowd boos the mercy and loves you for it, both at once.' }, next: 'WIN' },
          { label: 'Take the dive', sub: 'lose on purpose', do: { dmg: [8, 16], note: 'You go down easy. They "win." The System knows. It always knows. But the deal was the deal.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- ENDURANCE (category template) ---
  G._contestEndurance = function(contest) {
    const intro = this._cxIntro(contest);
    const isDrop = contest.id === 'drop';
    return [
      { text: intro + (isDrop
        ? `\n\nThey drop you on a ridge with nothing. The beacon is three miles through snow and attitude.\n\nTwo others hit the ground near you. Nobody waves.`
        : `\n\nThree days. No food. Water provided. Dignity not.\n\nFour of you in the white room. The cameras never blink.`),
        choices: [
          { label: isDrop ? 'Move fast' : 'Sleep it off', sub: isDrop ? 'burn bright' : 'conserve', do: isDrop ? { kcal: -500, dmg: [4, 12], note: 'You run the ridge line. Fast is a kind of armor.' } : { note: 'You sleep. Hunger dreams are vivid. You wake emptier.' }, next: 1 },
          { label: isDrop ? 'Forage as you go' : 'Drink water constantly', sub: isDrop ? 'slow, fed' : 'full belly, water', do: isDrop ? { kcal: 200, note: 'You pick as you walk. Slow. Your stomach thanks you.' } : { note: 'You drink until you slosh. It helps. Barely.' }, next: 1 },
          { label: isDrop ? 'Follow the others' : 'Meditate', sub: isDrop ? 'let them break trail' : 'mind over gut', do: { note: isDrop ? 'You let them break trail through the drifts. Cruel. Efficient.' : 'You sit with the hunger until it becomes weather. It passes through you.' }, next: 1 },
        ] },
      { text: isDrop
        ? `Night. The cold is a second opponent. One of the others is crying, quietly, like it's a secret.\n\nThe beacon blinks, impossibly far.`
        : `Day two. Someone is talking to their food hallucinations. The System zooms in.\n\nYour stomach has filed a formal complaint.`,
        choices: [
          { label: isDrop ? 'Keep moving at night' : 'Steal a sip of broth', sub: isDrop ? 'dangerous, gains ground' : 'someone\'s stash', do: isDrop ? { dmg: [8, 18], die: 0.06, kcal: -300, note: 'You walk through the dark. The snow hides the drop-offs. Mostly.' } : { dmg: [0, 4], note: 'You steal broth. It\'s warm. The guilt is warmer. The cameras saw everything.', notability: 'heist' }, next: 2 },
          { label: isDrop ? 'Shelter and shiver' : 'Share your water', sub: isDrop ? 'lose time, live' : 'kindness, televised', do: isDrop ? { kcal: -200, note: 'You dig in and shiver through the night. Slow. Alive.' } : { note: 'You share your water ration. The audience awws. The System notes it.', notability: 'showmanship' }, next: 2 },
          { label: isDrop ? 'Eat snow' : 'Chew your sleeve', sub: isDrop ? 'hydration, cold core' : 'desperate', do: isDrop ? { dmg: [4, 10], note: 'Snow for water. Your core temp drops with every mouthful.' } : { note: 'You chew your sleeve. The chat explodes. You are now a meme across seventeen systems.' }, next: 2 },
        ] },
      { text: isDrop
        ? `The beacon is close enough to hear. One of the others is ahead of you — limping, but ahead.\n\nThis is the part the promos are made of.`
        : `Day three. The doors will open at dusk. Whoever looks the least broken wins the audience.\n\nYou are very broken. So is everyone.`,
        choices: [
          { label: isDrop ? 'Sprint the last mile' : 'Walk out smiling', sub: isDrop ? 'everything left' : 'performance', do: isDrop ? { dmg: [10, 20], die: 0.08, kcal: -400, note: 'You sprint. Lungs, legs, heart — everything files a complaint. You pass them at the line.' } : { note: 'You walk out smiling like you ate yesterday. The audience buys it. The System knows. It respects the lie.' }, next: 'WIN' },
          { label: isDrop ? 'Pace it home' : 'Help another up', sub: isDrop ? 'steady' : 'carry them', do: isDrop ? { note: 'You pace it. They beat you by a minute. You beat the mountain.' } : { dmg: [0, 6], note: 'You help another contestant stand. You both cross. The crowd weeps. Second place, first in the edit.' }, next: 'WIN' },
          { label: isDrop ? 'Collapse short' : 'Crawl out', sub: isDrop ? 'so close' : 'no dignity left', do: isDrop ? { dmg: [6, 14], note: 'Your legs quit a hundred yards out. You crawl. The beacon blinks. You make it. Barely counts.' } : { note: 'You crawl out. There is no dignity left. There is, however, a finish line.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- MOOT (category template: trial / lie detector) ---
  G._contestMoot = function(contest) {
    const intro = this._cxIntro(contest);
    const isLies = contest.id === 'lies';
    return [
      { text: intro + (isLies
        ? `\n\nTwo chairs. One scanner. The System knows when you lie — and the audience lives for it.\n\nFirst question's coming. Your opponent is already sweating.`
        : `\n\nTelevised trial. The accusations may be true or not — the audience is the jury either way.\n\nThe prosecutor-drone reads the charges. Some of them are even yours.`),
        choices: [
          { label: 'Tell the truth', sub: 'radical', do: { note: 'You tell the truth. The scanner stays quiet. The audience is disappointed and impressed.' }, next: 1 },
          { label: 'Lie beautifully', sub: 'performance', do: { note: 'You lie like it\'s an art form. The scanner buzzes. The audience GASPS with delight.', notability: 'showmanship' }, next: 1 },
          { label: 'Refuse to answer', sub: 'contempt', do: { note: 'You say nothing. Silence, televised. The System notes the defiance.', notability: 'showmanship' }, next: 1 },
        ] },
      { text: isLies
        ? `Harder questions now. Personal ones. The scanner hums.\n\nYour opponent just lied badly about something small. The crowd smells blood.`
        : `A witness is called. It's someone from your village. They look at you, then at the cameras, then back.\n\nWhat they say next matters enormously.`,
        choices: [
          { label: 'Double down', sub: 'commit', do: { dmg: [0, 8], trauma: 5, note: 'You commit to the story. The scanner screams. The audience is feral with joy.' }, next: 2 },
          { label: 'Confess', sub: 'disarm', do: { note: 'You confess — the small thing, the real thing. The scanner goes quiet. The crowd doesn\'t know what to do with honesty.', notability: 'showmanship' }, next: 2 },
          { label: 'Turn it around', sub: 'accuse the accuser', do: { note: 'You point at the question itself. "Who benefits from asking that?" The System pauses. Interesting.', notability: 'showmanship' }, next: 2 },
        ] },
      { text: isLies
        ? `Final question. The big one. The scanner is hot.\n\nWhatever you say next will be clipped and replayed for years.`
        : `Closing statements. The audience votes with their attention — you can feel it like heat.\n\nThis is the moment.`,
        choices: [
          { label: 'The whole truth', sub: 'burn it down', do: { trauma: 8, note: 'You tell all of it. Every ugly true thing. The scanner is silent. The audience is silent. Then — applause like weather.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'The perfect lie', sub: 'one for the ages', do: { note: 'You deliver a lie so beautiful the scanner hesitates. The crowd erupts. You win the moment, if not the truth.', notability: 'showmanship' }, next: 'WIN' },
          { label: 'Walk out', sub: 'refuse the game', do: { note: 'You stand and leave. The cameras follow you to the door. The System lets you go — the refusal IS the content.', notability: 'showmanship' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- WEIRD (category template: cookfight / fetch) ---
  G._contestWeird = function(contest) {
    const intro = this._cxIntro(contest);
    const isCook = contest.id === 'cookfight';
    return [
      { text: intro + (isCook
        ? `\n\nThe ingredients are in cages. They are looking at you.\n\nCook a meal. Presentation matters. Survival matters more.`
        : `\n\nOne mile radius. One hour. Most interesting thing wins.\n\nJudged by beings who have never touched grass. Good luck.`),
        choices: [
          { label: isCook ? 'Befriend the ingredients' : 'Go far', sub: isCook ? 'gentle' : 'distance', do: { note: isCook ? 'You speak softly to the caged things. One of them stops rattling. The audience melts.' : 'You run for the treeline. Interesting lives far from the start.' }, next: 1 },
          { label: isCook ? 'Assert dominance' : 'Go weird', sub: isCook ? 'chef energy' : 'unhinged', do: { dmg: isCook ? [4, 10] : [0, 0], note: isCook ? 'You slam the counter. The ingredients flinch. Gordon would be proud.' : 'You look for the thing nobody else would touch. There it is.' }, next: 1 },
          { label: isCook ? 'Ask the audience' : 'Go obvious', sub: isCook ? 'crowd work' : 'safe', do: { note: isCook ? 'You play to the cameras. "What should I make?" The chat explodes with suggestions, half of them lethal.' : 'You grab the shiniest thing. Safe. The judges yawn in seventeen languages.' }, next: 1 },
        ] },
      { text: isCook
        ? `Something is out of its cage. The audience is delighted. You are not.\n\nDinner is fighting back.`
        : `Half the hour gone. Your find is... okay. Someone else is carrying something that glows.\n\nThe judges are bored. Bored judges are dangerous judges.`,
        choices: [
          { label: isCook ? 'Wrestle it' : 'Double down on weird', sub: isCook ? 'hands on' : 'commit', do: { dmg: isCook ? [8, 16] : [0, 6], die: isCook ? 0.05 : 0, note: isCook ? 'You grapple the ingredient. It grapples back. The crowd is screaming.' : 'You commit to the weird thing. It\'s either genius or a war crime. No middle.' }, next: 2 },
          { label: isCook ? 'Negotiate' : 'Sabotage the glowing one', sub: isCook ? 'diplomacy' : 'dirty', do: { note: isCook ? 'You offer it a deal: cooperate and live. It considers. The System is taking notes.' : 'You "accidentally" knock their glow into the mud. The audience gasps. The judges pretend not to see.', notability: 'heist' }, next: 2 },
          { label: isCook ? 'Set it free' : 'Present with confidence', sub: isCook ? 'mercy' : 'sell it', do: { note: isCook ? 'You open the cage. It stares. Then it bows — actually bows — and leaves. The crowd weeps.' : 'You present your okay thing like it\'s the crown jewels. Confidence is a kind of interesting.' }, next: 2 },
        ] },
      { text: isCook
        ? `Plating. The judges lean in — three aliens who have never tasted anything.\n\nWhat you serve now defines you across the galaxy.`
        : `Time. You present your find to the judges.\n\nThey turn it over with instruments. They confer in frequencies that hurt.`,
        choices: [
          { label: isCook ? 'Serve with love' : 'Tell its story', sub: isCook ? 'heart' : 'narrative', do: { note: isCook ? 'You serve it like it matters. Because it did. The lead judge tastes — and makes a sound no one has heard before. Delight.' : 'You tell them where you found it, what it cost. The story lands. The thing is secondary.' }, next: 'WIN' },
          { label: isCook ? 'Serve with flair' : 'Let it speak', sub: isCook ? 'showmanship' : 'minimal', do: { note: isCook ? 'Fire, spinning plates, a garnish thrown from across the room. The crowd roars. The judges blink.' : 'You say nothing. Let the thing be the thing. Brave. The judges respect restraint. Maybe.' }, next: 'WIN' },
          { label: isCook ? 'Serve yourself' : 'Apologize', sub: isCook ? 'chaos' : 'humble', do: { dmg: [4, 10], note: isCook ? 'You sit down and eat it yourself, on camera. The judges are horrified. The audience is deceased. Iconic, not victorious.' : 'You apologize for it in advance. Never apologize. The judges smell fear.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- PUZZLE (category template: box / pattern) ---
  G._contestPuzzle = function(contest) {
    const intro = this._cxIntro(contest);
    const isBox = contest.id === 'box';
    return [
      { text: intro + (isBox
        ? `\n\nThe box is bigger inside than out. That's the first problem.\n\nThe audience has the manual. They are not sharing. They are laughing.`
        : `\n\nA sequence of foods on the table. Eat them in the right order.\n\nThe wrong order... disagrees with you. The audience knows the order. They are not telling.`),
        choices: [
          { label: 'Study it first', sub: 'patience', do: { note: 'You circle it, learning its logic. The audience gets restless. Restless is good — they start shouting hints.' }, next: 1 },
          { label: 'Touch everything', sub: 'brute force', do: { dmg: [2, 8], note: 'You poke, prod, and pull. Something clicks. Something else shocks you. Progress.' }, next: 1 },
          { label: 'Ask the box nicely', sub: 'unhinged', do: { note: '"Please?" The box does nothing. The audience finds this hilarious. One of them slips you a hint in the chat.' }, next: 1 },
        ] },
      { text: isBox
        ? `A panel slides open. Inside: a smaller box. Of course.\n\nThe chat is spamming the solution. Half of them are lying.`
        : `First bite down. The sequence matters and your gut knows it.\n\nThe second item smells wrong. Or right. You can't tell anymore.`,
        choices: [
          { label: 'Trust the chat', sub: 'crowdsource', do: { dmg: [0, 10], die: 0.04, note: 'You follow the most-upvoted hint. It\'s either genius or sabotage. Fifty-fifty, televised.' }, next: 2 },
          { label: 'Trust your gut', sub: 'instinct', do: { note: 'You ignore everyone and follow the logic you\'ve built. Quiet. Certain. Yours.' }, next: 2 },
          { label: 'Do the opposite', sub: 'contrarian', do: { dmg: [2, 8], note: 'Everyone says left. You go right. The contrarian play — sometimes the puzzle wants what nobody expects.' }, next: 2 },
        ] },
      { text: isBox
        ? `Last layer. The box is humming now — it knows you're close.\n\nOne move left. The audience holds its breath.`
        : `Last item. Your stomach is a democracy in crisis.\n\nGet this right and you're a legend. Get it wrong and you're a clip.`,
        choices: [
          { label: 'The elegant solution', sub: 'beauty', do: { note: 'You see it — the pattern resolves like a chord. You move. The box OPENS. The crowd detonates.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'The brute solution', sub: 'force', do: { dmg: [6, 14], note: 'You stop solving and start forcing. The box resists, then — grudgingly — yields. Ugly. Effective.' }, next: 'WIN' },
          { label: 'Admit defeat', sub: 'graceful', do: { note: 'You bow to the box. "You win." The audience awws. The System files it under: humility, rare.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- DETECTIVE (category template: whoate / informant) ---
  G._contestDetective = function(contest) {
    const intro = this._cxIntro(contest);
    const isWho = contest.id === 'whoate';
    return [
      { text: intro + (isWho
        ? `\n\nThe prize is gone. Three suspects. One of them is lying about everything.\n\nYou have an hour. The cameras love a deadline.`
        : `\n\nFour of you. One is the informant — lying about everything, working the exits.\n\nFind them before they find the door.`),
        choices: [
          { label: 'Watch everyone', sub: 'observe', do: { note: 'You watch. Hands, eyes, who stands near the exits. People leak truth like heat.' }, next: 1 },
          { label: 'Ask blunt questions', sub: 'direct', do: { note: '"Where were you?" Blunt works. Liars over-explain. The innocent get annoyed. Both are data.' }, next: 1 },
          { label: 'Befriend a suspect', sub: 'soft', do: { note: 'You get close to one of them. Trust is a tool. It feels awful and works great.' }, next: 1 },
        ] },
      { text: isWho
        ? `Two of them have alibis that almost hold. The third keeps changing small details.\n\nThe audience has a favorite suspect. The audience is often wrong.`
        : `Someone just tried the east door. Locked — but the attempt tells you everything.\n\nThe informant is getting nervous. Nervous people make mistakes.`,
        choices: [
          { label: 'Confront the liar', sub: 'direct accusation', do: { dmg: [0, 6], note: 'You point. "You." The room goes still. They deny it — badly. The cameras zoom.' }, next: 2 },
          { label: 'Set a trap', sub: 'bait', do: { note: 'You plant false information and watch who acts on it. The trap snaps shut on schedule.' }, next: 2 },
          { label: 'Follow the quiet one', sub: 'instinct', do: { note: 'The quietest person in the room is always the story. You follow. You\'re right.' }, next: 2 },
        ] },
      { text: isWho
        ? `You know who. Saying it on camera is the whole game.\n\nGet it right: hero. Get it wrong: the clip lives forever.`
        : `It's down to you and them. The exits are watched. The clock is loud.\n\nName the informant. Now.`,
        choices: [
          { label: 'Name them, with proof', sub: 'the full case', do: { note: 'You lay it out — timeline, motive, the detail they got wrong. Airtight. The System confirms. The crowd erupts.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Name them, on instinct', sub: 'the gut call', do: { die: 0.03, note: 'You point on instinct. The pause before the System confirms is the longest second of your life. Correct. Barely.' }, next: 'WIN' },
          { label: 'Accuse the wrong one', sub: 'the mistake', do: { trauma: 6, note: 'You get it wrong. The real thief smiles. The clip will follow you. The System is merciless with editors.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- FORAGE (category template: calorie_run / pantry_raid) ---
  G._contestForage = function(contest) {
    const intro = this._cxIntro(contest);
    const isRaid = contest.id === 'pantry_raid';
    return [
      { text: intro + (isRaid
        ? `\n\nThe location is dangerous. The locals object. Bring back food or don't come back.\n\nYour competition is already moving.`
        : `\n\nOne hour. Most calorie-dense haul wins. The forest is... competitive.\n\nThe others fan out. The clock starts.`),
        choices: [
          { label: isRaid ? 'Sneak in' : 'Go for known patches', sub: isRaid ? 'quiet' : 'reliable', do: { note: isRaid ? 'Low and slow. The locals have routines. You learn them fast.' : 'You hit the patches you know. Steady calories. No surprises.' }, next: 1 },
          { label: isRaid ? 'Brave the front' : 'Try the deep woods', sub: isRaid ? 'bold' : 'risky', do: { dmg: isRaid ? [6, 14] : [2, 8], note: isRaid ? 'You walk in like you belong. Boldness is a kind of invisibility. Mostly.' : 'Deeper means richer and meaner. You know this. You go anyway.' }, next: 1 },
          { label: isRaid ? 'Distract them' : 'Follow the birds', sub: isRaid ? 'clever' : 'read sign', do: { note: isRaid ? 'You start a commotion on the far side. While they look there, you\'re here.' : 'Birds know where the food is. You read the sky like a menu.' }, next: 1 },
        ] },
      { text: isRaid
        ? `You're inside. The locals are close — you can hear them.\n\nYour sack is half full. Greed and sense are negotiating.`
        : `Half the hour gone. Your haul is decent. Someone else is carrying something heavy and grinning.\n\nTime to commit.`,
        choices: [
          { label: isRaid ? 'Grab and run' : 'Push deeper', sub: isRaid ? 'speed' : 'greed', do: { dmg: [8, 18], die: isRaid ? 0.06 : 0.02, kcal: 300, note: isRaid ? 'You grab and RUN. Shouting behind you. Your sack is full and your heart is fuller.' : 'You push past the safe line. The calories are incredible. So is the risk.' }, next: 2 },
          { label: isRaid ? 'Take only the best' : 'Work the edges', sub: isRaid ? 'selective' : 'steady', do: { kcal: 150, note: isRaid ? 'You take only the densest cuts. Quality over quantity. The connoisseur\'s raid.' : 'You work the edges clean. No drama. Solid haul.' }, next: 2 },
          { label: isRaid ? 'Leave an offering' : 'Eat as you go', sub: isRaid ? 'respect' : 'fuel', do: { kcal: isRaid ? -100 : 200, note: isRaid ? 'You leave something for the locals. Respect. They watch you go. They let you.' : 'You eat the best bits yourself. Fuel for the push. The judges can\'t weigh what\'s in your stomach.' }, next: 2 },
        ] },
      { text: isRaid
        ? `Out. The weigh-in is in front of the cameras.\n\nYour sack vs theirs. The locals are watching from the treeline.`
        : `Time. The hauls are weighed in front of everyone.\n\nYours looks... competitive. Theirs looks heavy.`,
        choices: [
          { label: 'Present with pride', sub: 'the haul', do: { kcal: 200, note: 'You lay it out. The calorie count climbs. The crowd counts with it. You win on density.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Share the method', sub: 'teach', do: { note: 'You explain HOW you found it — the sign, the birds, the thinking. The System loves knowledge. So does the crowd.' }, next: 'WIN' },
          { label: 'Accept second', sub: 'graceful', do: { kcal: 100, note: 'Theirs weighs more. You nod. Good haul, good game. The System notes the grace.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- CHANCE (category template: wheel / lottery) ---
  G._contestChance = function(contest) {
    const intro = this._cxIntro(contest);
    const isWheel = contest.id === 'wheel';
    return [
      { text: intro + (isWheel
        ? `\n\nThe wheel is huge and the teeth are real. Spin it. The teeth decide.\n\nThe audience holds its breath. So do you.`
        : `\n\nFive tokens. One is gold. Draw.\n\nThe audience loves an underdog. Be the underdog.`),
        choices: [
          { label: 'Spin with conviction', sub: 'commit', do: { note: 'You spin like you mean it. The wheel screams around. The teeth blur.' }, next: 1 },
          { label: 'Spin gently', sub: 'finesse', do: { note: 'You barely touch it. The wheel creeps. The crowd leans in — slow is excruciating.' }, next: 1 },
          { label: 'Pray first', sub: 'ritual', do: { note: 'You close your eyes and ask anything listening for luck. The wheel doesn\'t care. The audience loves the theater.' }, next: 1 },
        ] },
      { text: isWheel
        ? `The wheel slows. The pointer wobbles between fates.\n\nYou can see where it wants to land. You can't do anything about it.`
        : `Your hand hovers over the tokens. They all feel the same. They aren't.\n\nPick.`,
        choices: [
          { label: 'Trust the feeling', sub: 'instinct', do: { dmg: [0, 12], die: 0.06, note: 'You go with the pull. The wheel stops. The teeth are very close to your name.' }, next: 2 },
          { label: 'Change your mind', sub: 'second-guess', do: { note: 'You switch at the last second. The crowd groans. Second-guessing is box office.' }, next: 2 },
          { label: 'Close your eyes', sub: 'fate', do: { note: 'You don\'t watch. The crowd watches for you. Their gasp tells you everything.' }, next: 2 },
        ] },
      { text: isWheel
        ? `It stops. The pointer settles.\n\nThe teeth are smiling. Or that's just how they look.`
        : `You turn the token over.\n\nGold. Or not.`,
        choices: [
          { label: 'Accept the result', sub: 'whatever it is', do: { dmg: [0, 20], die: 0.1, prize: true, note: 'Whatever the wheel decided — you take it standing. The crowd respects the spine.', notability: 'contestWin' }, next: 'WIN' },
          { label: 'Laugh', sub: 'defiance', do: { note: 'You laugh in the teeth\'s face. The audience laughs with you. Losing beautifully is still beautiful.' }, next: 'LOSE' },
          { label: 'Demand a recount', sub: 'chaos', do: { dmg: [4, 10], note: 'You demand a recount. There is no recount. There is, however, security. Worth it for the clip.' }, next: 'LOSE' },
        ] },
    ];
  };

  // --- GENERIC fallback ---
  G._contestGeneric = function(contest) {
    const intro = this._cxIntro(contest);
    return [
      { text: intro + `\n\nThe rules are explained. They're complicated. The gist: don't lose.`,
        choices: [
          { label: 'Go all in', sub: 'commit', do: { dmg: [6, 14], note: 'You commit fully. The crowd appreciates commitment.' }, next: 1 },
          { label: 'Play it safe', sub: 'cautious', do: { note: 'You play cautious. Safe doesn\'t win, but it survives.' }, next: 1 },
        ] },
      { text: `Midway. The standings are unclear and the System likes it that way.`,
        choices: [
          { label: 'Push hard', sub: 'risk', do: { dmg: [8, 18], die: 0.06, note: 'You push. It costs. It might pay.' }, next: 'WIN' },
          { label: 'Hold steady', sub: 'safe', do: { note: 'You hold. Steady doesn\'t win headlines.' }, next: 'LOSE' },
        ] },
    ];
  };

  // === CHOICE RESOLUTION ===
  G.contestChoose = function(idx) {
    const ac = this.state.activeContest;
    if (!ac || ac.phase === 'done') return null;
    const phases = ac.phases;
    const phase = phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices[idx]) return null;
    const choice = phase.choices[idx];
    const s = this.state.scholar;
    const log = [];

    // Apply effects
    const d = choice.do || {};
    // Wounds BEFORE this choice resolve — the Gauntlet closer's odds are
    // computed from what you carried in, so the displayed number is the
    // number rolled (Steve 2026-10-05: readable danger, no lying odds).
    const woundsBeforeChoice = ac.wounds || 0;
    if (d.note) { this.sysSay('📺 ' + d.note); log.push(d.note); }
    if (d.dmg) {
      let amt = d.dmg[0] + Math.floor(Math.random() * (d.dmg[1] - d.dmg[0] + 1));
      // VETERAN (contest knowledge level 3): you read the hits coming.
      try {
        const ck = this.contestKnowledge(ac.contestId);
        if (ck.level >= 3 && amt > 1 && ac.participant === 'player') {
          const cut = Math.min(amt - 1, Math.max(1, Math.round(amt * 0.25)));
          amt -= cut;
          this.sysSay(`📺 You read it coming. (-${cut})`);
          log.push(`read it coming -${cut}`);
        }
      } catch (e) {}
      if (amt > 0) {
        s.health = Math.max(0, (s.health || 0) - amt);
        // Wounds feed the Gauntlet closer (and anything else that reads them)
        ac.wounds = (ac.wounds || 0) + amt;
        this.sysSay(`📺 You take ${amt} damage.`);
        log.push(`-${amt} hp`);
      }
      // (Zero damage rolls are silent — no "You take 0 damage" noise)
      if ((s.health || 0) <= 0) {
        return this._contestDie(ac, 'The damage was too much.');
      }
    }
    // dieWounds: Gauntlet closer — death odds computed from wounds taken,
    // not a flat roll (Steve 2026-10-05).
    let dieChance = d.die || 0;
    if (d.dieWounds) {
      dieChance = this._contestCloserOdds(d.dieWounds, woundsBeforeChoice);
      log.push(`closer odds ${Math.round(dieChance * 100)}% on ${woundsBeforeChoice} wounds`);
    }
    if (dieChance > 0 && Math.random() < dieChance) {
      return this._contestDie(ac, choice.label + ' — it went wrong.');
    }
    if (d.heal) {
      s.health = Math.min(this.maxHealth(), (s.health || 0) + d.heal);
      log.push(`+${d.heal} hp`);
    }
    if (d.kcal) {
      s.kcal = Math.max(0, (s.kcal || 0) + d.kcal);
      log.push(`${d.kcal > 0 ? '+' : ''}${d.kcal} kcal`);
    }
    if (d.trauma) {
      s.trauma = Math.min(100, (s.trauma || 0) + d.trauma);
      log.push(`+${d.trauma} trauma`);
    }
    if (d.notability) {
      this.addNotability('player', d.notability);
      log.push(`noted: ${d.notability}`);
    }

    // Advance
    const next = choice.next;
    if (next === 'WIN') return this._contestEnd(ac, 'won', d.prize);
    if (next === 'LOSE') return this._contestEnd(ac, 'lost', false);
    if (next === 'DIE') return this._contestDie(ac, choice.label);
    if (next === 'REFUSE') return this._contestRefuse(ac);
    ac.phaseIdx = next;
    const np = phases[next];
    if (!np) return this._contestEnd(ac, 'lost', false);
    this.sysSay('📺 ───');
    const rendered = this._contestRenderPhase(ac, np, next);
    this._cxPhaseSay(rendered.text);
    return { phase: rendered, log };
  };

  G._contestEnd = function(ac, outcome, prize) {
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { name: ac.contestId };
    const s = this.state.scholar;
    const isWatch = ac.participant && ac.participant !== 'player';
    const pname = isWatch ? this.displayName(ac.participant) : 'You';
    ac.phase = 'done';
    if (outcome === 'won') {
      try { this.contestLearn(ac.contestId, isWatch ? 'watched' : 'won'); } catch (e) {}
      if (isWatch) {
        // Villager won — resolve THEIR fate, not the player's
        this.sysSay(`📺 ${contest.name} — ${pname.toUpperCase()} WINS. The crowd is a weather system.`);
        this.sysSay(`📺 ${pname} is alive. Shaking, grinning, alive. You were there to see it.`);
        this.addNotability(ac.participant, 'contestWin');
        // Villager gets the prize (not the player)
        if (prize) {
          this.sysSay(`📺 Prize for ${pname}: the System's favor (and a story they'll tell forever).`);
        }
      } else {
        this.sysSay(`📺 ${contest.name} — YOU WIN. The crowd is a weather system.`);
        this.addNotability('player', 'contestWin');
        try { this.leadShift('showmanship', 2); } catch (e) {}
        if (prize) {
          try {
            const loot = this.rollAlienLoot({ wave: this.unlockedWave(), loot: { chance: 1, tier: this.unlockedWave() } });
            if (loot) {
              this.sysSay(`📺 Prize: ${loot}!`);
              s.inventory = s.inventory || [];
              s.inventory.push({ itemId: loot, units: 1 });
            }
          } catch (e) { this.sysSay('📺 Prize: the System\'s favor (and a story).'); }
        }
        // FEARED means winning costs: winners are marked
        s.health = Math.max(1, (s.health || 0) - 5);
      }
    } else {
      try { this.contestLearn(ac.contestId, isWatch ? 'watched' : 'lost'); } catch (e) {}
      if (isWatch) {
        this.sysSay(`📺 ${contest.name} — over. ${pname} survived. The audience is polite.`);
        this.sysSay(`📺 You go to ${pname}. They're quiet. They'll talk about it later. Or never.`);
      } else {
        this.sysSay(`📺 ${contest.name} — over. You survived. The audience is polite.`);
        try { this.leadShift('showmanship', 1); } catch (e) {}
      }
    }
    // Clear after a beat — the village processes what happened
    this.state.activeContest = null;
    this.state.lastContestDay = s.day;
    return { done: true, outcome };
  };

  // BESPOKE DEATH LINES (Steve 2026-10-05): contests must be FEARED. A generic
  // "did not come home" is placeholder text — every contest kills you in its
  // own voice. pname is 'You' or a villager name; lines work for both.
  G._contestDeathLine = function(contest, how, pname) {
    const you = pname === 'You';
    const them = you ? 'you' : 'them';
    const poss = you ? 'Your' : pname + "'s";
    const LINES = {
      pit: `${pname} fed the Pit. The beast doesn't celebrate — it eats. The crowd observes four seconds of silence (respect), then the betting opens on the next contestant.`,
      gauntlet: `${pname} almost cleared the Gauntlet. ALMOST is what the Death Reel is for — it will run the last ten seconds in slow motion, forever.`,
      duel: `"Not to the death," they said. The ref-drone logs it as an accident. ${poss} opponent doesn't stop shaking for a week.`,
      drop: `The beacon kept blinking. ${pname} stopped walking toward it a mile out. The snow does the rest — quietly, the way it does for everyone.`,
      starve: `Day three. ${pname} broke — first, last, all the way. The System notes the exact time of death for the highlight package.`,
      moot: `The audience voted. The verdict wasn't guilty — it was boring. The System doesn't keep boring contestants. The cameras cut away before it finished.`,
      lies: `The scanner caught the big one. The audience's delight curdled into something else. The System doesn't like being lied to twice.`,
      cookfight: `The ingredients stopped fighting back. That's how you know. Dinner is served.`,
      fetch: `${pname} brought them something interesting. It brought ${them}. The judges award posthumous points for irony.`,
      hide: `It found ${pname}. It was always going to find ${them}. The "FOUND YOU" sting plays over the part where the running stopped.`,
      box: `The box is bigger inside than out. There's room in there for one more. The audience finally gets the manual. It doesn't help.`,
      pattern: `Wrong order. Fifteen seconds of footage. It will outlive everyone who loved ${them}.`,
      whoate: `${pname} named the wrong name. The real thief is still hungry. The System is merciless with editors — and with wrong answers.`,
      informant: `${pname} found the exit before finding the liar. The informant sends flowers. The card reads: "Thanks for the cover."`,
      calorie_run: `${pname} pushed past the safe line for the calories. The forest collected. It always collects.`,
      pantry_raid: `The locals objected. ${pname} didn't listen. "Bring back food or don't come back" — ${you ? 'you' : 'they'} didn't come back.`,
      wheel: `The teeth decided. They were very close to ${you ? 'your' : 'their'} name. Then they weren't close at all.`,
      lottery: `${pname} drew the black token. The audience loves an underdog. This underdog is dead.`,
    };
    const CAT = {
      blood: `${pname} bled out for the cameras. The Death Reel thanks ${them} for the content.`,
      endurance: `${poss} body filed its last complaint. The System stamps the timecode.`,
      moot: `The audience has rendered its verdict on ${pname}. There is no appeal. There is only the Reel.`,
      weird: `${pname} was interesting right up to the end. The judges give full marks. Posthumously.`,
      puzzle: `${pname} never solved it. The puzzle keeps the pieces. The audience keeps the clip.`,
      detective: `${pname} got it wrong on camera. Wrong answers have consequences. The Reel has the receipts.`,
      forage: `The wild took ${pname} as payment. The harvest was good this year.`,
      chance: `The odds were never with ${pname}. That's what made it television.`,
    };
    return LINES[contest.id] || CAT[contest.cat] || `${pname} did not come home from ${contest.name}.`;
  };

  G._contestDie = function(ac, how) {
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { name: ac.contestId, id: ac.contestId };
    const isWatch = ac.participant && ac.participant !== 'player';
    const pname = isWatch ? this.displayName(ac.participant) : 'You';
    ac.phase = 'done';
    this.sysSay(`📺 ${contest.name} — ${how}`);
    this.sysSay('📺 ' + this._contestDeathLine(contest, how, pname));
    this.sysSay(`📺 The Death Reel will be tasteful. It won't be.`);
    try { this.contestLearn(ac.contestId, 'died'); } catch (e) {}
    this.state.activeContest = null;
    try { this.playerDeath('contest'); } catch (e) { this.state.scholar.health = 0; this.state.over = true; }
    return { done: true, outcome: 'died' };
  };

  G._contestRefuse = function(ac) {
    // Refusal is a sequence, not a skip (Steve 2026-10-05)
    const contest = this.contestPool().find(c => c.id === ac.contestId) || { name: ac.contestId };
    this.sysSay(`📺 You refuse ${contest.name}.`);
    this.sysSay(`📺 The System pauses. Refusal is... content. The cameras stay on.`);
    this.sysSay(`📺 "NOTED," says the System. "THE AUDIENCE WILL REMEMBER THE COWARDICE. OR THE PRINCIPLE. WE HAVEN'T DECIDED."`);
    this.addNotability('player', 'showmanship');
    const s = this.state.scholar;
    s.trauma = Math.min(100, (s.trauma || 0) + 5);
    try { this.contestLearn(ac.contestId, 'refused'); } catch (e) {}
    ac.phase = 'done';
    this.state.activeContest = null;
    return { done: true, outcome: 'refused' };
  };

  // === WATCH MODE (villager participant) ===
  // When someone else is taken, you watch. The show plays out as
  // narrated beats with occasional choices (cheer? intervene? look away?).
  G._contestWatchPhases = function(contest, participantId) {
    const pname = this.displayName(participantId);
    return [
      { text: `📺 ${contest.name}. ${pname} has been taken.\n\nYou watch with the village. The cameras love the watchers almost as much as the watched.`,
        choices: [
          { label: 'Cheer them on', sub: 'loud', do: { note: `You cheer for ${pname}. They hear it. It matters more than you'd think.` }, next: 1 },
          { label: 'Watch silently', sub: 'tense', do: { note: 'You watch without a sound. Your hands hurt from gripping.' }, next: 1 },
          { label: 'Look away', sub: 'can\'t watch', do: { note: 'You look away. The cameras catch it anyway. The audience understands.', trauma: 3 }, next: 1 },
        ] },
      { text: `📺 It's going badly. Or well. It's hard to tell through the lights.\n\n${pname} is still in it. The crowd is restless.`,
        choices: [
          { label: 'Shout advice', sub: 'maybe helps', do: { note: `You shout something useful. Whether ${pname} hears it over the noise is another question.` }, next: 2 },
          { label: 'Hold your breath', sub: 'tense', do: { note: 'You stop breathing. Everyone does. The village is one held breath.' }, next: 2 },
        ] },
      { text: `📺 It's over.\n\nThe outcome scrolls across the sky in letters the size of weather.`,
        choices: [
          { label: 'Go to them', sub: 'after', do: { note: `You go to ${pname} after. Win or lose, they need a familiar face more than applause.` }, next: 'WIN' },
          { label: 'Give them space', sub: 'respect', do: { note: 'You give them space. The cameras move on. You don\'t.' }, next: 'LOSE' },
        ] },
    ];
  };

})();