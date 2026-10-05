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
  // Data-driven templates. Categories: Blood, Endurance, Moot, Weird.
  G.contestPool = function() {
    return [
      // BLOOD (combat) — the feared ones
      { id: 'pit', name: 'The Pit', cat: 'blood', risk: 'high',
        desc: 'Thrown into an arena with a wave-appropriate beast. Kill or be killed. The audience votes on weapons.',
        participants: 1 },
      { id: 'gauntlet', name: 'Gauntlet', cat: 'blood', risk: 'extreme',
        desc: 'Three waves, no rest. Survive all three and the crowd goes wild. Most don\'t see wave two.',
        participants: 1 },
      { id: 'duel', name: 'Duel', cat: 'blood', risk: 'high',
        desc: 'You vs another contestant. Not to the death — to the yield. But accidents happen.',
        participants: 2 },
      // ENDURANCE (survival)
      { id: 'drop', name: 'The Drop', cat: 'endurance', risk: 'high',
        desc: 'Dropped somewhere with nothing. First back to the beacon eats. The others... walk.',
        participants: 3 },
      { id: 'starve', name: 'Hollow Belly', cat: 'endurance', risk: 'medium',
        desc: 'No food for three days. The System watches who breaks first. Water provided. Dignity not.',
        participants: 4 },
      // MOOT (social)
      { id: 'moot', name: 'The Moot', cat: 'moot', risk: 'medium',
        desc: 'Televised trial. Defend yourself against accusations (true or not). The audience is the jury.',
        participants: 1 },
      { id: 'lies', name: 'Lie Detector', cat: 'moot', risk: 'low',
        desc: 'Answer questions. The System knows when you lie. The audience loves when you do.',
        participants: 2 },
      // WEIRD (unhinged)
      { id: 'cookfight', name: 'Cooking With Teeth', cat: 'weird', risk: 'medium',
        desc: 'Cook a meal. The ingredients fight back. Presentation matters. Survival matters more.',
        participants: 2 },
      { id: 'fetch', name: 'Bring Us Something Interesting', cat: 'weird', risk: 'low',
        desc: 'One mile radius. One hour. Most interesting thing wins. Judged by beings who have never touched grass.',
        participants: 3 },
      { id: 'hide', name: 'Hide and Seek', cat: 'weird', risk: 'extreme',
        desc: 'Hide. The seeker is a wave-2 predator. It\'s very good at seeking.',
        participants: 3 },
    ];
  };

  G.pickContest = function() {
    const pool = this.contestPool();
    const wave = this.unlockedWave();
    // Filter by wave-appropriateness (higher waves unlock scarier contests)
    let candidates = pool;
    if (wave < 2) candidates = pool.filter(c => c.risk !== 'extreme');
    if (wave < 3) candidates = candidates.filter(c => c.id !== 'gauntlet');
    return candidates[Math.floor(Math.random() * candidates.length)];
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
    this.sysSay(`📺 ${pick.name} has been chosen. The village holds its breath.`);
    
    // Countdown: 1 day (simplified)
    this.state.pendingContest = {
      contestId: contest.id,
      participant: pick.id,
      firesDay: (this.state.scholar.day || 1) + 1,
    };
  };

  G.resolveContest = function() {
    const pc = this.state.pendingContest;
    if (!pc) return;
    this.state.pendingContest = null;
    
    const contest = this.contestPool().find(c => c.id === pc.contestId);
    if (!contest) return;
    
    // Outcome based on risk
    const deathChance = { low: 0.05, medium: 0.15, high: 0.3, extreme: 0.5 }[contest.risk] || 0.1;
    const r = Math.random();
    
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
  };

})();
