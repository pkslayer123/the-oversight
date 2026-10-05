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
// consumes:
//   - scholar.day
//   - state.showBudget
//   - state.pendingContest
//   - state.contestsSeen
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
    this.sysSay(`📺 ${pick.name} has been chosen. The village holds its breath.`);
    
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
        this.sysSay(`📺 (Choice UI coming — for now, you're grabbed. The refusal sequence is a real path.)`);
        // TODO: actual choice UI — refusal is a sequence, not a skip
      } else {
        this.sysSay(`📺 ${pname} — you're grabbed. No choice. The cameras are already rolling.`);
      }
      // The contest sequence happens HERE (playable content, not dice roll)
      // For now: mark as active, player must engage
      this.state.activeContest = {
        contestId: contest.id,
        participant: 'player',
        phase: 'intro',
        variant: contest.variant || null,
      };
    } else {
      // You're not in it — you WATCH. Especially if villagers are involved.
      // (Steve 2026-10-05: "we should aspire to essentially put on a show
      //  they can watch, especially if other villagers are involved")
      this.sysSay(`📺 ${pname} has been chosen. The village holds its breath.`);
      this.sysSay(`📺 You watch. The cameras love this part.`);
      this.state.activeContest = {
        contestId: contest.id,
        participant: participantId,
        phase: 'watching',
        variant: contest.variant || null,
      };
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

})();
