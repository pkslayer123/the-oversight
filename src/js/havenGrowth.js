// @ontology
// system: havenGrowth
// description: Haven growth milestones — the 12→24 population ladder (PROGRESSION.md §10, Steve 2026-10-10). Resource-based, System-announced, never deed-based, never calendar. Each tier visibly improves the Haven and grants real mechanics. The raid system gives the Palisade something to defend against.
// provides:
//   - havenTier()
//   - havenPopCap()
//   - havenStores()
//   - havenGrowthMeter()
//   - havenGrowthDaily()
//   - havenTierUp()
//   - announceHavenBar(tier)
//   - havenNeedGossip(next)
//   - havenRaidTick()
//   - raidPillage(v, kcal)
//   - hearthStretch()
//   - granarySpoilBonus(foodState)
//   - famineGraceDays()
// rules:
//   - resource_based: tiers unlock on stockpile thresholds only (code: havenGrowth.js — havenGrowthDaily checks havenStores() vs HAVEN_TIERS req; no deed, calendar, or knowledge reads anywhere in the tier path)
//   - knowledge_never_gates: nothing here reads the codex (code: havenGrowth.js — havenTierUp/havenGrowthMeter reference stores only; announceHavenBar prints exact numbers)
//   - discoverable: System announces each tier bar post-arrival, Haven panel shows the live meter, villagers gossip the shortfall (code: havenGrowth.js — announceHavenBar, havenGrowthMeter + app.js havenGrowthHTML, havenNeedGossip)
//   - reactive_raids: raids fire on world state, never a schedule (code: havenGrowth.js — havenRaidTick requires 3+ world monsters, 3k+ pantry kcal, 7-day cooldown, 18% roll; wealth draws teeth: 3 +1 per 12k pantry over 3k, cap 5)
//   - raid_raises_crisis: a raid raises an aid crisis reactively (the village looks to you; four call-for-help options said aloud). Raiders nobody meets LINGER at the treeline and gorge nightly (havenGrowthDaily) until driven off — the persistent threat the comms chain exists for. (code: havenRaidTick, 2026-10-10)
//   - cap_ceiling: havenPopCap is the ceiling; intake reads it via housingCap (code: havenGrowth.js — havenPopCap; membership.js — housingCap takes max(shelters, 12+4*havenTier()))
//   - no_consumption: reaching a tier does not eat the stockpile (code: havenGrowth.js — havenTierUp sets v.havenTier only; stores untouched)
// consumes:
//   - state.village.pantry, state.village.wood
//   - stashState().materials (wood, stone)
//   - pantryKcalLive(v)
//   - worldMonsters(), spawnWorldMonster(), removeWorldMonster()
//   - fieldFight(), resolveWildMonsterEncounter()
//   - progDaily() (wrapped: daily tier check + raid tick)
//   - pantryCapKcal() (wrapped: longhouse +25%)
// ============ HAVEN GROWTH — 12 → 24 ============
// Steve 2026-10-10 (PROGRESSION.md §10, settled law): the village grows
// through RESOURCE thresholds. Each tier visibly improves the Haven and
// grants new abilities; the System announces the next tier and the Haven
// shows a progress meter, so the path is unmissable. Deed-gating was
// rejected. Knowledge NEVER gates anything.
//
// Tiers (thresholds tuned from measured stockpile sims, 2026-10-10 — a
// thriving village banks ~+23 wood/day at 2 wood-duty; the starting pantry
// holds ~47k kcal, so the food bars mean "still thriving", not "hoarded"):
//   16 — The Longhouse: food 8,000 + wood 200. Hearth stretches meals 10%,
//        pantry capacity +25%.
//   20 — The Palisade: food 14,000 + wood 350 + stone 60. Raiders take wall
//        damage; the watch holds at night (sleep is never interrupted).
//   24 — The Granary: food 20,000 + wood 500 + preserved 2,000 kcal. Pantry
//        spoilage slows (+3d fresh, +14d preserved); famine buffer 3→5 days.
//
// Refugees/petitioners/splinter groups fill the cap through played beats —
// the villages-as-agents workstream owns that side. Its hooks: havenTier(),
// havenPopCap(), havenStores(), havenGrowthMeter(). Intake (membership.js)
// already reads growthStatus()/housingCap(), which this ladder raises.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;
  const R = Math.random;

  // ---------- tier data ----------
  const HAVEN_TIERS = [
    null, // tier 0: Haven
    {
      tier: 1, name: 'The Longhouse', cap: 16,
      req: [
        { key: 'food', label: 'food stored', req: 8000 },
        { key: 'wood', label: 'wood', req: 200 },
      ],
      effects: [
        'Population cap 16 — four more mouths under the roof.',
        'Longhouse hearth: village meals stretch 10% further (less food burned daily).',
        'Pantry capacity +25% — room for the bigger village.',
      ],
      sysDangle: '"The audience has SPOKEN. They want a LONGHOUSE. Stockpile 8,000 kcal of food and 200 wood and we raise it ON CAMERA. Sixteen mouths, one roof — the ratings write themselves. Try not to starve twice as fast."',
      upSys: '"LONGHOUSE: RAISED. Sixteen souls, one roof. The hearth is bigger, the meals stretch further, the pantry holds more. The audience wept. We did not. We do not weep. ...We logged it as weeping."',
      upBeat: 'Three days of raising beams, and the longhouse stands — a real roof, a real hearth, room to grow. Someone carves the date into the center post. The village feels bigger already.',
    },
    {
      tier: 2, name: 'The Palisade', cap: 20,
      req: [
        { key: 'food', label: 'food stored', req: 14000 },
        { key: 'wood', label: 'wood', req: 350 },
        { key: 'stone', label: 'stone', req: 60 },
      ],
      effects: [
        'Population cap 20 — the village is a small town now.',
        'Palisade: raiders take wall damage coming over; the watch holds at night.',
        'Safe sleep — nothing walks through the palisade to reach your bed.',
      ],
      sysDangle: '"RATINGS DIP. The audience wants STAKES — pointed ones. A PALISADE. Stockpile 14,000 kcal, 350 wood and 60 stone. Walls make such good television. You will thank us when the teeth come."',
      upSys: '"PALISADE: ONLINE. Pointy! The audience approves of pointy. Raiders will think twice — the ones that can think. Sleep easy, little ones. The walls are watching so you do not have to."',
      upBeat: 'A week of sharpened stakes and lashed crossbeams, and Haven has a wall — a real one, shoulder-high, with a walkway and a watch. The village sleeps differently tonight. Lighter.',
    },
    {
      tier: 3, name: 'The Granary', cap: 24,
      req: [
        { key: 'food', label: 'food stored', req: 20000 },
        { key: 'wood', label: 'wood', req: 500 },
        { key: 'preserved', label: 'preserved food', req: 2000 },
      ],
      effects: [
        'Population cap 24 — the full muster.',
        'Granary: cool dark bins slow spoilage (+3 days fresh, +14 days preserved).',
        'Famine buffer: sealed reserve bins hold the village 5 hungry days, not 3.',
      ],
      sysDangle: '"The long game, little hoarders. A GRANARY. Stockpile 20,000 kcal, 500 wood and 2,000 kcal of PRESERVED food — food that WAITS. Smoke it, dry it, render it. The audience finds delayed gratification EXOTIC. So do stomachs, we are told."',
      upSys: '"GRANARY: SEALED. Cool, dark, and full of waiting food. Twenty-four mouths. You are not a camp anymore. You are a going concern. The audience has already commissioned the famine episode. We told them there would not be one."',
      upBeat: 'Raised bins, sealed lids, clay and cool dark. The granary stands full of food that waits — smoked, dried, rendered, patient. Whatever comes, Haven eats a while longer.',
    },
  ];

  const methods = {
    // havenTier: 0..3. Stored on the village; exile forks reset it (hard reset).
    havenTier() {
      try { return (this.state.village || {}).havenTier || 0; } catch (e) { return 0; }
    },

    // havenPopCap: the ceiling. Intake paths read housingCap() (membership.js),
    // which takes the max of shelter-built housing and this ladder.
    havenPopCap() {
      return 12 + 4 * this.havenTier();
    },

    // havenStores: the CURRENT stockpile, honestly measured. Wood counts the
    // village pile (v.wood, what wood-duty hauls) plus stashed wood; stone
    // counts the communal stash (villager stone-duty + player stash).
    havenStores() {
      const v = this.state.village || {};
      let food = 0, preserved = 0;
      try { food = this.pantryKcalLive(v) || 0; } catch (e) {}
      try {
        for (const it of (v.pantry || [])) {
          if (it && it.foodState === 'preserved') preserved += (it.kcalEach || 0) * (it.units || 1);
        }
      } catch (e) {}
      let wood = (v.wood || 0), stone = 0;
      try {
        const st = this.stashState ? this.stashState() : null;
        const mats = st && st.materials ? st.materials : null;
        if (mats) { wood += (mats.wood || 0); stone += (mats.stone || 0); }
      } catch (e) {}
      return {
        food: Math.round(food), wood: Math.round(wood),
        stone: Math.round(stone), preserved: Math.round(preserved),
      };
    },

    // havenGrowthMeter: the visible progress meter (Haven panel renders this).
    havenGrowthMeter() {
      const tier = this.havenTier();
      const stores = this.havenStores();
      let next = null;
      if (tier < 3) {
        const T = HAVEN_TIERS[tier + 1];
        const bars = T.req.map(r => {
          const have = stores[r.key] || 0;
          return {
            key: r.key, label: r.label, have, req: r.req,
            pct: Math.min(100, Math.round((have / r.req) * 100)),
            done: have >= r.req,
          };
        });
        next = {
          tier: T.tier, name: T.name, cap: T.cap, bars,
          complete: bars.every(b => b.done), effects: T.effects,
        };
      }
      return {
        tier,
        tierName: tier === 0 ? 'Haven' : HAVEN_TIERS[tier].name,
        cap: this.havenPopCap(),
        effects: tier === 0
          ? ['A camp with a name. Twelve mouths, one fire.']
          : HAVEN_TIERS[tier].effects,
        next,
      };
    },

    // havenGrowthDaily: runs from the progDaily wrap (i.e. every endDay).
    havenGrowthDaily() {
      const v = this.state.village;
      if (!v || this.over) return;
      // LINGERING RAIDERS (util audit 2026-10-10): raiders nobody met hold
      // the treeline and gorge at each dawn until driven off (killed, or the
      // crisis goes quiet and they drift). Re-pinned to the Haven tile —
      // they're besieging, not wandering.
      try {
        const hx = (v.px !== undefined && v.px !== null) ? v.px : 4;
        const hy = (v.py !== undefined && v.py !== null) ? v.py : 4;
        const ms = this.worldMonsters ? this.worldMonsters() : [];
        for (const m of ms) {
          if (!m || !m.lingering || (m.hp || 0) <= 0) continue;
          m.tx = hx; m.ty = hy;
          const take = 500 + Math.floor(R() * 1000);
          let got = 0;
          try { got = this.raidPillage(v, take); } catch (e) {}
          let mn = 'it';
          try { mn = (this.monsterDisplayName && this.monsterDisplayName(m.id)) || 'it'; } catch (e) {}
          this.say(`🌙 Night. The lingering ${mn} gorges at the treeline — ${Math.round(got).toLocaleString()} kcal gone from the stores. Drive it off, or call for help.`);
        }
        try { if (this.syncMonsterAlias) this.syncMonsterAlias(); } catch (e) {}
      } catch (e) {}
      v.havenGrowth = v.havenGrowth || {};
      const hg = v.havenGrowth;
      const tier = this.havenTier();
      // The System dangles the next tier once it has arrived to do the dangling.
      if (this.state.systemArrived && tier < 3 && !hg['barAnnounced' + (tier + 1)]) {
        hg['barAnnounced' + (tier + 1)] = true;
        this.announceHavenBar(tier + 1);
      }
      if (tier >= 3) return;
      const meter = this.havenGrowthMeter();
      if (!meter || !meter.next) return;
      if (meter.next.complete) { this.havenTierUp(); return; }
      // Villagers gossip about what's needed — the path stays unmissable.
      // Cooldown: a village that nags every dawn is a village you mute.
      const day = (this.state.scholar || {}).day || 1;
      if (R() < 0.22 && day - (hg.lastNeedGossipDay || 0) >= 3) {
        hg.lastNeedGossipDay = day;
        this.havenNeedGossip(meter.next);
      }
    },

    // announceHavenBar: the System's gameshow dangle — exact numbers, on screen.
    announceHavenBar(tier) {
      const T = HAVEN_TIERS[tier];
      if (!T) return;
      this.say('◈ SYSTEM: ' + T.sysDangle);
      try { if (this.journalNote) this.journalNote('village', 'haven-tier', 'The System wants ' + T.name + ': ' + T.req.map(r => r.req.toLocaleString() + ' ' + r.label).join(' + ') + '.'); } catch (e) {}
    },

    // havenTierUp: the stockpile hit the bar. The building rises; the cap rises;
    // the next bar is dangled immediately. Effects are read live (hearthStretch,
    // pantryCapKcal wrap, granarySpoilBonus, famineGraceDays, raid wall damage).
    havenTierUp() {
      const v = this.state.village;
      if (!v) return false;
      const tier = this.havenTier();
      if (tier >= 3) return false;
      const T = HAVEN_TIERS[tier + 1];
      v.havenTier = tier + 1;
      if (this.state.systemArrived) this.say('◈ SYSTEM: ' + T.upSys);
      this.say('🛖 ' + T.upBeat);
      try { if (this.journalNote) this.journalNote('village', 'haven-tier', T.name + ' raised. Population cap now ' + T.cap + '.'); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment(T.name + ' raised — Haven grows to ' + T.cap + ' souls.'); } catch (e) {}
      try {
        const hearers = this.npcIds ? this.npcIds().slice(0, 4) : [];
        this.seedGossip('haven_built', { which: T.name }, hearers);
      } catch (e) {}
      // Dangle the next bar immediately — and mark it announced so the daily
      // check doesn't repeat it (break-it 2026-10-10: the dangle fired twice).
      if (this.state.systemArrived && tier + 1 < 3) {
        v.havenGrowth['barAnnounced' + (tier + 2)] = true;
        this.announceHavenBar(tier + 2);
      }
      return true;
    },

    // havenNeedGossip: villagers talk about what's missing, by the fire. The
    // say-line is the overheard beat; the gossip entry lets it travel.
    havenNeedGossip(next) {
      try {
        const v = this.state.village || {};
        const roster = (v.roster || []).filter(id => id !== this.villagerId);
        if (roster.length < 2) return;
        const missing = (next.bars || []).filter(b => !b.done);
        if (!missing.length) return;
        // scarcest first — that's what people actually talk about.
        missing.sort((a, b) => (a.have / a.req) - (b.have / b.req));
        const m = missing[0];
        const speaker = roster[Math.floor(R() * roster.length)];
        let listener = roster[Math.floor(R() * roster.length)];
        if (listener === speaker) listener = roster[(roster.indexOf(speaker) + 1) % roster.length];
        const sName = String(this.displayName(speaker)).split(' ')[0];
        const lName = String(this.displayName(listener)).split(' ')[0];
        const fmt = (n) => Math.round(n).toLocaleString();
        let line = '';
        if (m.key === 'food') line = `"The pantry's the thing. We don't raise ${next.name} on empty shelves — ${fmt(m.have)} of ${fmt(m.req)} kcal."`;
        else if (m.key === 'wood') line = `"${fmt(m.have)} wood. We need ${fmt(m.req)}. The forest isn't going to cut itself."`;
        else if (m.key === 'stone') line = `"Stone. We need ${fmt(m.req - m.have)} more for the palisade footings. Creek beds, hillsides — pry it loose."`;
        else if (m.key === 'preserved') line = `"The granary wants food that WAITS — ${fmt(m.have)} of ${fmt(m.req)} kcal preserved. Smoke it, dry it, render it. The fresh stuff doesn't count."`;
        if (!line) return;
        this.say(`🗣️ ${sName} to ${lName}, by the fire: ${line}`);
        this.seedGossip('haven_need', { who: speaker, need: m.key }, [speaker, listener]);
      } catch (e) {}
    },

    // ---------- tier mechanics (read live by the systems they touch) ----------

    // hearthStretch: longhouse hearth — village meals go 10% further.
    // Read by villagerMealDay (game.js) for villagers eating at haven.
    hearthStretch() {
      return this.havenTier() >= 1 ? 0.9 : 1;
    },

    // granarySpoilBonus: cool dark bins slow spoilage. Read at pantry-deposit
    // sites (stockPantry, donateToPantry, pantryAdd).
    granarySpoilBonus(foodState) {
      if (this.havenTier() < 3) return 0;
      return foodState === 'preserved' ? 14 : 3;
    },

    // famineGraceDays: the scattering fuse. Read by villageEats (game.js).
    famineGraceDays() {
      return this.havenTier() >= 3 ? 5 : 3;
    },

    // ---------- raids: what the palisade defends against ----------
    // Reactive, never a schedule: the woods must be thick (3+ world monsters)
    // and the pantry must smell (3,000+ kcal). ~18%/day when ripe, ≥7 days
    // between raids. Raiders are real world-monster entities; defenders fight
    // them blow-by-blow via resolveWildMonsterEncounter. Raiders nobody meets
    // pillage the pantry. Without a palisade, one raider can reach the
    // sleeping player (pendingEncounter wakes them into the fight); with a
    // palisade the watch holds the wall — safe sleep is real.
    havenRaidTick() {
      const v = this.state.village;
      if (!v || this.over) return false;
      const day = (this.state.scholar || {}).day || 1;
      if (day - (v.lastRaidDay || 0) < 7) return false;
      let monsters = [];
      try { monsters = this.worldMonsters ? this.worldMonsters() : []; } catch (e) { return false; }
      if (!monsters.length || monsters.length < 3) return false;
      let pantry = 0;
      try { pantry = this.pantryKcalLive(v) || 0; } catch (e) {}
      if (pantry < 3000) return false;
      if (R() < 0.82) return false;
      // ---- RAID ----
      v.lastRaidDay = day;
      const palisade = this.havenTier() >= 2;
      const hx = (v.px !== undefined && v.px !== null) ? v.px : 4;
      const hy = (v.py !== undefined && v.py !== null) ? v.py : 4;
      const sorted = monsters.slice().sort((a, b) =>
        (Math.abs(a.tx - hx) + Math.abs(a.ty - hy)) - (Math.abs(b.tx - hx) + Math.abs(b.ty - hy)));
      // WEALTH DRAWS TEETH (util audit 2026-10-10): a rich pantry smells
      // farther. 3 raiders base, +1 per 12k kcal above the 3k smell-line, cap 5.
      // Reactive (world state), never scheduled.
      const raidN = Math.min(5, 3 + (pantry > 12000 ? 1 : 0) + (pantry > 24000 ? 1 : 0));
      const raiders = sorted.slice(0, raidN);
      const mname = (m) => {
        try { return this.monsterDisplayName(m.id) || 'something'; } catch (e) { return 'something'; }
      };
      for (const m of raiders) {
        m.tx = hx; m.ty = hy;
        if (palisade) {
          const wall = Math.round(((m.maxHp || m.hp || 20)) * 0.25);
          m.hp = Math.max(1, (m.hp || wall) - wall);
        }
      }
      try { if (this.syncMonsterAlias) this.syncMonsterAlias(); } catch (e) {}
      const names = raiders.map(mname).join(', ');
      this.say(`🐗 RAID — ${raiders.length === 1 ? 'a raider' : raiders.length + ' raiders'} (${names}) hit Haven in the night, drawn by the smell of the pantry!` +
        (palisade ? " The palisade's stakes take their toll as they come over the wall." : ' No walls. No warning but the noise.'));
      // THE DOOR (util audit 2026-10-10): raiders at Haven are exactly the
      // "monster at your door" beat the call-for-help chain was built for —
      // but raiseAidCrisis had no organic caller, so all four tiers sat dead
      // (0/120 runs). Raids now raise the crisis reactively: the village
      // looks to you, the four options are said aloud, you decide. Raiders
      // nobody meets LINGER at the treeline (the crisis threat) instead of
      // one instant pillage nobody can answer — that's what help is FOR.
      // The crisis resolves 'fought' when the treeline is clear (commsTick),
      // or drifts 'moved-on' on the 6-day valve.
      try {
        if (this.raiseAidCrisis) {
          let wmax = 1;
          for (const m of raiders) { try { wmax = Math.max(wmax, m.wave || 1); } catch (e) {} }
          const crisis = this.raiseAidCrisis(names, wmax);
          if (crisis) crisis.raiders = true;
        }
      } catch (e) {}
      // defenders: healthy villagers at home. Real fights, not rolls.
      const defenders = (v.roster || []).filter(id =>
        id !== this.villagerId &&
        !(v.away && v.away[id]) &&
        ((v.health || {})[id] === undefined || (v.health || {})[id] > 40));
      let di = 0;
      for (const m of raiders) {
        if (di < defenders.length) {
          const d = defenders[di++];
          try { if (this.resolveWildMonsterEncounter) this.resolveWildMonsterEncounter(d, m); } catch (e) {}
        } else {
          // nobody met this one — it doesn't gorge once and leave. It
          // LINGERS at the treeline and gorges at each dawn until driven
          // off (havenGrowthDaily). The crisis threat, made persistent —
          // this is the situation the call-for-help chain exists for.
          m.lingering = true;
          this.say(`Nobody met the ${mname(m)} — it's still out there at the treeline. It'll gorge every night until it's driven off.`);
        }
      }
      // the player: without a palisade, one raider can reach a sleeper.
      let playerAtHaven = false;
      try { playerAtHaven = this.playerAtHaven ? this.playerAtHaven() : false; } catch (e) {}
      if (playerAtHaven && !palisade && raiders.length) {
        const m = raiders[0];
        this.say(`One of them is coming for YOU — ${mname(m)}, inside the haven, eyes on your bedroll.`);
        this.pendingEncounter = true;
        this.pendingMonsterId = m.id;
      } else if (playerAtHaven && palisade) {
        this.say('The watch holds the wall. You sleep through the worst of it — or would have, if the shouting had let you.');
      }
      if (!playerAtHaven) {
        try {
          const sch = this.state.scholar;
          sch.awayNews = sch.awayNews || [];
          if (sch.awayNews.length < 8) sch.awayNews.push(`🐗 RAID at Haven last night — ${raiders.length} raiders hit the pantry.${pillaged > 0 ? ' ' + Math.round(pillaged).toLocaleString() + ' kcal lost.' : ''}${palisade ? ' The palisade held.' : ''}`);
        } catch (e) {}
      }
      try {
        const hearers = this.npcIds ? this.npcIds().slice(0, 4) : [];
        this.seedGossip('raid', { raiders: raiders.length }, hearers);
      } catch (e) {}
      return true;
    },

    // raidPillage: raiders eat from the real pantry (best-fit draw, discarded).
    raidPillage(v, kcal) {
      v = v || this.state.village;
      if (!v || kcal <= 0) return 0;
      let taken = 0;
      try {
        const drawn = this.pantryDraw(v, Math.round(kcal), {});
        taken = (drawn && drawn.taken) || 0;
      } catch (e) {}
      return taken;
    },
  };

  Object.assign(Game, methods);

  // ---------- wraps (attach at load; all targets exist — food.js, progression.js loaded earlier) ----------

  // Daily: tier check + raid tick, via progDaily (which endDay calls).
  try {
    const _progDaily = Game.progDaily;
    Game.progDaily = function () {
      const r = _progDaily ? _progDaily.apply(this, arguments) : undefined;
      try { this.havenGrowthDaily(); } catch (e) {}
      try { this.havenRaidTick(); } catch (e) {}
      return r;
    };
  } catch (e) {}

  // Longhouse: +25% pantry capacity.
  try {
    const _pantryCapKcal = Game.pantryCapKcal;
    if (typeof _pantryCapKcal === 'function') {
      Game.pantryCapKcal = function () {
        let c = _pantryCapKcal.call(this);
        try { if (this.havenTier && this.havenTier() >= 1) c = Math.round(c * 1.25); } catch (e) {}
        return c;
      };
    }
  } catch (e) {}
})();
