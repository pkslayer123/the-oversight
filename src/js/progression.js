// @ontology
// system: progression
// description: Character progression. XP, levels, abilities.
// provides:
//   - abilitySlots()
//   - accrueRelicBond(item)
//   - integrationStage()
//   - checkTrial(id)
//   - completeTrial(id)
//   - progState()
//   - fireCrisis(kind, ctx)
//   - progDaily()
//   - slotMoment()
// rules:
//   - crisis_once: true (code: progression.js — fireCrisis dedupes via pg.crises keys; one per kind per run)
//   - ability_cap: 6 (code: progression.js)
//   - feast_surge_gate: 3 abilities at L3 (code: progression.js — channelSentiment; was all-maxed, unwalkable per 2026-10-09 audit)
//   - arc2_deed: true (code: progression.js — checkArc requires breadth>=6 or a held contest; the beat text is honest again)
//   - arc3_crucible: 2 crisis kinds (code: progression.js — checkArc; grave-first runs get the acknowledgment line)
//   - sentiment_at_60: true (code: progression.js — slotMoment(60); was 80)
//   - audience_encore: true (code: progression.js — checkAudienceEncore, recurring post-40 trials)
// consumes:
//   - scholar.xp
//   - scholar.abilities
// ============ PROGRESSION, ARCS & SENTIMENTAL ITEMS ============
// Built on the lifeseed foundation (lifeseed.js). Steve's design (2026-10-04):
//
// 1. ABILITY SLOT LADDER: 6 slots. Each unlock is a MOMENT — discovery (20),
//    mentorship (40), audience trial (60), neural creep (70), the grant (80).
//    Slot GRANULARITY (pacing build 2026-10-10): 20->2, 35->3, 50->4, 65->5,
//    80->6 — the beats stay, the ladder fills between them. abilitySlots()
//    in game.js is the authority.
//    NPCs climb the same ladder visibly (gossip).
// 2. SYSTEM INTEGRATION STAGES: 0 journal (pre-Day 7) / 1 overlay / 2 neural
//    creep / 3 full integration. The interface IS the story (body class).
//    The System never understands food OR feelings — its sentiment theory is
//    wrong ("resonance harmonics") and that's the joke.
// 3. ARC TRIGGERS (earned, never timers): The Long Haul -> The Show ->
//    Engines -> The Inefficiency. Announced diegetically; the world changes.
// 4. ANTI-UNDERPOWERED: the watching System offers trials to strugglers —
//    "the audience is bored" is diegetic catch-up, telegraphed in the open.
// 5. SENTIMENTAL ITEMS: chosen at gear pick as a legible gamble (the opening
//    asks the player to trust the game). Undiscardable. Bond accrues; at
//    evolution thresholds the game plays a FLASHBACK — a scene from the
//    character's past, resolved against their lifeseed, revealing knowledge.
//    At integration 60 the System teaches sentiment-channeling (wrong
//    theory, right power) — the thesis mechanic as a mid-game engine, not
//    a pre-finale footnote (pacing build 2026-10-10). Keepsakes of the dead can evolve too — grief as
//    fuel, handled with care.
//
// Self-attaching module: Object.assign(Game, methods) + wraps. Load after
// lifeseed.js.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;
  const R = Math.random;
  const pick = (a) => a[Math.floor(R() * a.length)];

  const SLOT_MOMENT = { 20: 'spark', 40: 'mentor', 60: 'trial', 70: 'creep', 80: 'grant' };

  // CRISIS BEATS (Steve 2026-10-09): the road to Arc III. A crisis is a real
  // setback the village weathers — recorded permanently, once per kind per
  // run. name: the beat's title. line(ctx): the loud in-fiction beat.
  // sys: one earnest System line, said only after the System arrives.
  const CRISIS_BEATS = {
    'hunger-winter': {
      name: 'THE HUNGER WINTER',
      line: () => 'Three days now the village has gone to sleep hungry. The pantry is an echo. This is the part the old stories skip \u2014 the part where you find out what you\u2019re made of.',
      sys: 'SYSTEM: "Organic units require fuel. Noting. Noting loudly. The audience is very quiet, which for them is screaming."',
    },
    'first-grave': {
      name: 'THE FIRST GRAVE',
      line: (ctx) => `${ctx.name || 'Someone'} is dead. The village digs its first grave, and everyone understands at once: this place can kill you. It just did.`,
      sys: 'SYSTEM: "Oh. Oh no. Was that supposed to happen? The audience is crying. I did not know they could do that."',
    },
    'breach': {
      name: 'THE BREACH',
      line: () => 'It got INSIDE. The haven was supposed to be the safe place \u2014 the one place. It isn\u2019t.',
      sys: 'SYSTEM: "Perimeter violated! This is unprecedented! ...Is this unprecedented? Checking. Yes. Unprecedented."',
    },
    'schism': {
      name: 'THE SCHISM',
      line: (ctx) => (ctx.name === 'You'
        ? 'You are cast out. The village chose, and the choosing cut something that won\u2019t heal clean. The fire keeps burning without you.'
        : `${ctx.name || 'Someone'} is cast out. The village chose, and the choosing cut something that won\u2019t heal clean. Fewer chairs around the fire tonight.`),
      sys: 'SYSTEM: "Social unit ejected. The audience is divided. Half of them are furious. The other half is also furious, but differently."',
    },
    'blood-on-air': {
      name: 'BLOOD ON AIR',
      line: (ctx) => `It happened on camera. Trillions watched ${ctx.name || 'someone'} die, and the show kept rolling. The village will remember who the cameras loved.`,
      sys: 'SYSTEM: "That was... a lot. The producers say the ratings were historic. I don\u2019t know what to do with that sentence."',
    },
  };

  const methods = {

    // ---------- STATE ----------
    progState() {
      const s = this.state.scholar;
      s.prog = s.prog || { slotMoments: {}, arc: 1, arcSeen: {}, sentimentTaught: false, trial: null, trialCd: 0, flags: {}, seeking: [], crises: {}, chanDay: {}, npcInteg: {} };
      return s.prog;
    },

    // ---------- INTEGRATION STAGES ----------
    // 0 = journal (pre-Day 7, the System doesn't exist yet)
    // 1 = overlay (arrival — the interface changes)
    // 2 = neural creep (abilities deepen, synergies unlock)
    // 3 = full integration (sentiment channeling)
    integrationStage() {
      if (!this.state.systemArrived) return 0;
      const integ = this.state.scholar.integration || 5;
      if (integ >= 80) return 3;
      if (integ >= 40) return 2;
      return 1;
    },
    integrationStageName() {
      return ['Journal', 'Overlay', 'Neural Creep', 'Full Integration'][this.integrationStage()] || 'Journal';
    },

    // ---------- CODE BREATH ----------
    codexBreadth() {
      const cx = this.state.codex || {};
      let n = 0;
      for (const e of Object.values(cx.plants || {})) if ((e.level || 0) >= 1) n++;
      for (const e of Object.values(cx.monsters || {})) if ((e.level || 0) >= 1) n++;
      n += Object.keys(cx.recipes || {}).length;
      for (const e of Object.values(cx.skills || {})) if ((e.level || 0) >= 2) n++;
      return n;
    },

    // ---------- SLOT MOMENTS ----------
    // Fired once per threshold crossing. Each unlock is a beat, not a number.
    slotMoment(t) {
      const s = this.state.scholar, pg = this.progState();
      if (pg.slotMoments[t]) return;
      pg.slotMoments[t] = true;
      const first = (this.data.villagers || []).find(v => v.id === this.villagerId);
      const fname = first ? first.name.split(' ')[0] : 'you';
      const sys = this.state.systemArrived;
      const led = (d, n) => { try { if (this.ledgerAdd) this.ledgerAdd(d, n); } catch (e) {} };
      if (t === 20) {
        led('embrace', 1);
        this.say(`◈ THE SPARK — something clicks. A trick ${fname} learned long ago suddenly has edges it never had. ${sys ? 'SYSTEM: "ANOMALY: organic unit demonstrates pattern recognition. Slot capacity increased. We are taking notes."' : 'The world feels a fraction more legible.'} (Ability slots: ${this.abilitySlots()})`);
      } else if (t === 40) {
        led('brokerage', 1);
        const mentor = this.bestMentor();
        if (mentor) {
          this.say(`◈ THE MENTOR — ${this.displayName(mentor)} watches ${fname} work, then reaches over. "No. Like this." An hour later something has unlocked that no manual could teach. (Ability slots: ${this.abilitySlots()})`);
          try { this.bumpTrust(mentor, 4); } catch (e) {}
        } else {
          this.say(`◈ THE MENTOR — nobody left to teach ${fname}. So the System tries, clumsily, to be a teacher. It almost works. (Ability slots: ${this.abilitySlots()})`);
        }
      } else if (t === 60) {
        led('showmanship', 1);
        this.say(`◈ THE TRIAL — the audience is restless. The System offers ${fname} a trial, broadcast live. Survive it and take the slot. Refuse it and... well. The audience remembers refusals. (Ability slots: ${this.abilitySlots()})`);
        this.offerAudienceTrial('milestone');
        // SENTIMENT AT 60 (pacing build 2026-10-10): the thesis mechanic was
        // taught at 80 to 2% of runs — a pre-finale footnote. It's a mid-game
        // engine now: the System teaches it while the trial runs, wrong theory
        // and all.
        this.teachSentiment();
      } else if (t === 70) {
        led('embrace', 1);
        this.say(`◈ THE CREEP — ${fname}'s thoughts have an echo now. The System's echo. Or theirs. Hard to tell anymore. Gifts used in sequence resonate — try them together. (Ability slots: ${this.abilitySlots()})`);
        try { if (this.state.scholar.synergyHint !== true) { this.state.scholar.synergyHint = true; } } catch (e) {}
      } else if (t === 80) {
        led('embrace', 1);
        this.say(`◈ THE GRANT — full integration. The System opens the last slot like a door it built just for ${fname}. "You have been adequate entertainment. We upgrade adequate." (Ability slots: ${this.abilitySlots()})`);
      }
      try { this.save(); } catch (e) {}
    },
    bestMentor() {
      try {
        const trust = (this.state.village.trust || {});
        const ids = Object.keys(trust).filter(id => id !== this.villagerId);
        ids.sort((a, b) => (trust[b] || 0) - (trust[a] || 0));
        return ids[0] || null;
      } catch (e) { return null; }
    },

    // ---------- SENTIMENT LESSON ----------
    // The System teaches channeling with a completely wrong theory.
    // The human truth (grief, love) is visible to the player, invisible to it.
    teachSentiment() {
      const pg = this.progState();
      if (pg.sentimentTaught) return;
      pg.sentimentTaught = true;
      this.say(`◈ RESONANCE HARMONICS — SYSTEM: "HYPOTHESIS CONFIRMED. Objects with high observer-attention waveforms function as auxiliary capacitors. We call this RESONANCE HARMONICS. We do not know why the waveforms taste like grief. We have stopped asking." — Hold a keepsake. Think about them. The System will do the math. (It is not math. It is love. The System will never know.) Channel keepsakes from your pack.`);
    },
    sentimentTaught() { return !!(this.progState && this.progState().sentimentTaught); },

    itemDef(item) {
      if (!item) return {};
      return (this.data.items || []).find(i => i.id === (item.itemId || item.id)) || {};
    },
    isKeepsake(item) {
      if (!item) return false;
      if (item.sentimental) return true;
      return this.itemDef(item).class === 'sentimental';
    },

    // ---------- CHANNELING ----------
    // One tap, context-smart: soothe trauma, inspire practice, or surge the
    // feast. Once per item per day. Chosen keepsakes and deep grief hit harder.
    channelSentiment(idx) {
      const s = this.state.scholar, pg = this.progState();
      const item = (s.inventory || [])[idx];
      if (!item || !this.isKeepsake(item)) return 'Not a keepsake.';
      if (!pg.sentimentTaught) return 'You hold it. Nothing happens. Not yet.';
      const day = s.day;
      pg.chanDay[item.itemId || item.id] = pg.chanDay[item.itemId || item.id] || {};
      if (pg.chanDay[item.itemId || item.id][day]) return 'It is quiet now. Tomorrow.';
      pg.chanDay[item.itemId || item.id][day] = true;
      const def = this.itemDef(item);
      const name = item.name || def.name || 'it';
      let mult = 1;
      if (item.chosen) mult *= 1.5; // you picked this at the start. It knows.
      if (def.id === 'wedding_ring') mult *= 2; // love with nowhere to go
      let msg;
      if ((s.trauma || 0) >= 8) {
        const amt = Math.round(6 * mult);
        s.trauma = Math.max(0, (s.trauma || 0) - amt);
        msg = `You hold ${name}. Breathe. The shaking eases. (−${amt} trauma)`;
      } else {
        // FEAST SURGE GATE (pacing build 2026-10-10, Steve: "Continue all
        // proposed"): the old gate was ALL owned abilities at L3 — best of 240
        // audit runs had exactly 1 L3, so Arc IV was unwalkable. New gate: 3+
        // abilities mastered. A real stretch goal, not fiction.
        const allAbs = [...(s.abilities || []), ...(s.backgroundAbilities || [])];
        const maxed = allAbs.filter(a => (a.level || 1) >= 3).length;
        const unmaxed = allAbs.filter(a => (a.level || 1) < 3);
        if (maxed >= 3) {
          s.prog.feastSurge = true;
          msg = `You hold ${name}. The feast was the weapon — and they are with you. (Next feastburn surges ×${(1.5 * mult).toFixed(1)})`;
        } else if (unmaxed.length) {
          for (const a of unmaxed) { try { this.gainAbilityXP(a.id, Math.round(2 * mult)); } catch (e) { a.xp = (a.xp || 0) + 2; } }
          msg = `You hold ${name} and practice. They would want you to get better at this. (+ability experience)`;
        } else {
          msg = `You hold ${name}. It hums — but the surge wants three mastered gifts, and you hold ${maxed}. Not yet.`;
        }
      }
      this.say(`💛 ${msg}`);
      try { this.save(); } catch (e) {}
      return msg;
    },

    // ---------- FLASHBACKS ----------
    // Evolution moments play a scene from the character's past — resolved
    // against their lifeseed (real names, real places), revealing knowledge.
    // This is worldbuilding, not flavor text.
    playFlashback(item, def) {
      const s = this.state.scholar;
      const char = (this.data.villagers || []).find(v => v.id === this.villagerId) || {};
      const holder = char.lifeseed ? char : { name: char.name || 'you', lifeseed: null };
      // keepsakes of the dead carry their own provenance — resolved against
      // THEIR lifeseed at the moment of taking, not the player's. Grief as fuel.
      const memory = (item.memoryOf && item.keepsakeMemory)
        ? item.keepsakeMemory
        : (this.resolveKeepsakeText
          ? this.resolveKeepsakeText(holder, def, def.memory || '')
          : (def.memory || ''));
      const itemName = item.name || def.name || 'it';
      this.say(`◈ FLASHBACK — ${itemName}\n${memory}`);
      const rev = def.reveals;
      if (rev) {
        const note = this.resolveKeepsakeText ? this.resolveKeepsakeText(holder, def, rev.note || '') : (rev.note || '');
        this.applyFlashbackReveal(rev);
        if (note) this.say(`📖 The memory leaves something behind: ${note}`);
      }
      // keepsakes of the dead: carrying them is the relationship continuing
      if (item.memoryOf) {
        try {
          const dead = (this.data.villagers || []).find(v => v.id === item.memoryOf);
          if (dead) this.say(`You carry ${dead.name.split(' ')[0]} with you. That's the whole of it. That's enough.`);
        } catch (e) {}
      }
    },
    applyFlashbackReveal(rev) {
      const s = this.state.scholar, pg = this.progState();
      try {
        if (rev.type === 'plant') {
          this.state.codex = this.state.codex || {};
          this.state.codex.plants = this.state.codex.plants || {};
          const e = this.state.codex.plants[rev.id] || {};
          e.level = Math.max(e.level || 0, 2);
          this.state.codex.plants[rev.id] = e;
        } else if (rev.type === 'skill') {
          this.state.codex = this.state.codex || {};
          this.state.codex.skills = this.state.codex.skills || {};
          const e = this.state.codex.skills[rev.id] || {};
          e.level = Math.max(e.level || 0, 2);
          this.state.codex.skills[rev.id] = e;
        } else if (rev.type === 'place') {
          this.state.codex = this.state.codex || {};
          this.state.codex.places = this.state.codex.places || [];
          if (!this.state.codex.places.some(p => p.id === rev.id)) this.state.codex.places.push({ id: rev.id, note: rev.note || '' });
        } else if (rev.type === 'name') {
          pg.seeking = pg.seeking || [];
          if (!pg.seeking.some(x => x.id === rev.id)) pg.seeking.push({ id: rev.id, note: rev.note || '' });
        } else if (rev.type === 'flag') {
          pg.flags[rev.id] = true;
        }
      } catch (e) {}
    },

    // ---------- ARCS ----------
    arcName() {
      return ['The Long Haul', 'The Show', 'Engines', 'The Inefficiency'][(this.progState().arc || 1) - 1] || 'The Long Haul';
    },
    noteCrisis(kind) {
      try { this.progState().crises[kind] = true; } catch (e) {}
    },
    fireCrisis(kind, ctx) {
      // CRISIS (Steve 2026-10-09): one loud beat + ledger moment + noteCrisis.
      // Dedupe lives here: once per kind per run — the hook sites stay 1-3
      // lines and never think about farming.
      let pg = null;
      try { pg = this.progState(); } catch (e) { return false; }
      if (!pg) return false;
      pg.crises = pg.crises || {};
      if (pg.crises[kind]) return false;
      const B = CRISIS_BEATS[kind] || null;
      if (B) {
        this.say('\u25C8 CRISIS \u2014 ' + B.name + '. ' + (typeof B.line === 'function' ? B.line(ctx || {}) : B.line));
        try { if (this.recordMoment) this.recordMoment('Crisis survived: ' + B.name + '.'); } catch (e) {}
        try { if (this.state.systemArrived && B.sys) this.say(B.sys); } catch (e) {}
      }
      this.noteCrisis(kind);
      return true;
    },
    villageNotabilityScore() {
      try {
        if (this.villageNotability) return this.villageNotability();
      } catch (e) {}
      const s = this.state.scholar;
      let n = 0;
      if ((s.day || 0) >= 7) n += 5;
      if (this.state.systemArrived) n += 5;
      return n;
    },
    checkArc() {
      const pg = this.progState(), s = this.state.scholar;
      const stage = this.integrationStage();
      const breadth = this.codexBreadth();
      const crises = Object.keys(pg.crises || {}).length;
      let want = 1;
      // ARC II HONESTY (pacing build 2026-10-10, Steve: "Continue all
      // proposed"): the old gate (notability>=10) was mathematically true for
      // every village by day 7 — a timer wearing reactive's clothes, while the
      // beat text claimed "not because the plot says so." Now the Show arrives
      // when the village has DONE something notable: real knowledge breadth,
      // or a televised contest already survived. The beat text is true again.
      const deedDone = breadth >= 6 || (this.state.contestsHeld || 0) >= 1;
      if (this.state.systemArrived && (s.day || 0) >= 7 && this.villageNotabilityScore() >= 10 && deedDone) want = 2;
      // ARC III CRUCIBLE (pacing build 2026-10-10): was crises>=1, but
      // first-grave fires in ~every run by day 13 — "someone died in week two"
      // read as attrition, not bonding. Two distinct crises = something the
      // village survived TOGETHER.
      if (want >= 2 && stage >= 2 && breadth >= 12 && crises >= 2) want = 3;
      if (want >= 3 && stage >= 3 && pg.sentimentTaught && breadth >= 25 && s.prog.feastSurgeUsed) want = 4;
      if (want > pg.arc) {
        pg.arc = want;
        this.arcBeat(want);
      }
    },
    arcBeat(n) {
      const pg = this.progState();
      if (pg.arcSeen[n]) return;
      pg.arcSeen[n] = true;
      try { if (this.recordMoment) this.recordMoment(`Haven entered Arc ${['I','II','III','IV'][n - 1] || n}.`); } catch (e) {}
      if (n === 2) {
        try { if (this.ledgerAdd) this.ledgerAdd('showmanship', 2); } catch (e) {}
        this.say(`◈ ARC II — THE SHOW. The sky tore open a week ago and the village is still here. Still eating. The audience has noticed. Strangers will come — not because the plot says so, but because surviving is worth watching.`);
      } else if (n === 3) {
        try { if (this.ledgerAdd) this.ledgerAdd('might', 1); } catch (e) {}
        let arc3line = `◈ ARC III — ENGINES. SYSTEM: "VIEWERSHIP MILESTONE. Organic unit demonstrates compounding capability. Resonance protocols unlocked." — Your gifts deepen. Used in sequence, they resonate. The village is no longer just surviving. It is becoming something.`;
        // GRAVE-FIRST ACKNOWLEDGMENT (pacing build 2026-10-10): the crucible
        // usually opens with a grave. Name it — the village survived the worst
        // thing together, and the beat should say so.
        try {
          const cr = Object.keys((this.progState() || {}).crises || {});
          if (cr.length && cr.every(k => k === 'first-grave' || k === 'hunger-winter')) {
            arc3line += ` The first grave is still fresh soil. The village didn't choose this crucible — but it chose to keep going.`;
          }
        } catch (e) {}
        this.say(arc3line);
        try { this.state.scholar.synergyBonus = true; } catch (e) {}
      } else if (n === 4) {
        try {
          if (this.ledgerAdd) this.ledgerAdd('foodShared', 1);
          this.progState().tableWaiting = true;
          this.say('The table is being set. They are watching to see who comes to it.');
        } catch (e) {}
        this.say(`◈ ARC IV — THE INEFFICIENCY. SYSTEM: "ROUNDING ERROR RECLASSIFIED: ANOMALY. Organic consumption yields impossible output. Recalculating. Recalculating." — They finally see it. The thing they laughed at — needing to EAT — is the engine. Their confusion is your weapon now. One day there will be a table, and humanity will need a case to make. You're building it. (Feastburn burns hotter from here.)`);
        try { this.state.scholar.arc4burn = 1.25; } catch (e) {}
      }
      try { this.save(); } catch (e) {}
    },

    // ---------- ANTI-UNDERPOWERED ----------
    // The System is a SHOW. A struggling protagonist is bad television — so it
    // intervenes, openly. Telegraph the path: this is the catch-up, and the
    // game says so.
    checkStruggle() {
      const s = this.state.scholar, pg = this.progState();
      if (!this.state.systemArrived) return;
      if ((s.day || 0) < 10) return;
      if (pg.trial || (pg.trialCd || 0) > s.day) return;
      const integ = s.integration || 5;
      const fed = (s.kcal || 0) >= 2000;
      const strong = integ >= 25 || (s.abilities || []).length >= 2;
      if (!strong && !fed) this.offerAudienceTrial('struggle');
    },
    offerAudienceTrial(reason) {
      const s = this.state.scholar, pg = this.progState();
      if (pg.trial) return;
      // AUDIENCE TRIAL TASKS (pacing build 2026-10-10): the 3,000-kcal haul was
      // unreachable while the pantry drains ~3k/day — 7/240 completions. The
      // 1,000-kcal haul is the completable ask (chains to the snare); the
      // 3,000 stays as the ambitious option.
      const tasks = [
        { id: 'haul_small', text: 'Haul 1,000 kcal to the pantry within 3 days.', need: 1000, have: 0, kind: 'pantry' },
        { id: 'haul', text: 'Haul 3,000 kcal to the pantry within 3 days.', need: 3000, have: 0, kind: 'pantry' },
        { id: 'identify', text: 'Fully identify 3 plants (knowledge level 3) within 3 days.', need: 3, have: 0, kind: 'identify' },
      ];
      const roll = Math.random();
      const t = roll < 0.45 ? tasks[0] : roll < 0.7 ? tasks[1] : tasks[2];
      if (t.kind === 'pantry') { try { t.start = this.pantryKcal ? this.pantryKcal() : 0; } catch (e) { t.start = 0; } }
      if (t.kind === 'identify') {
        t.startN = Object.values((this.state.codex || {}).plants || {}).filter(e => (e.level || 0) >= 3).length;
      }
      pg.trial = { ...t, reason, expires: (s.day || 0) + 3 };
      const why = reason === 'struggle'
        ? 'SYSTEM: "The audience is bored. Bored audiences stop watching. Stopped being watched is... we do not like to think about it. A trial, then. For you."'
        : reason === 'audience'
          ? 'SYSTEM: "The audience wants an encore. A trial, then — smaller this time, but televised."'
          : 'SYSTEM: "A trial, broadcast live. The audience loves a trial."';
      this.say(`◈ AUDIENCE TRIAL — ${why} ${t.text} Reward: integration, and a gift.`);
      try { this.save(); } catch (e) {}
    },
    // AUDIENCE ENCORE (pacing build 2026-10-10): post-40 the audience keeps
    // wanting trials. Recurring, cooldown-gated (completeTrial sets +7), so
    // the 60-milestone trial is the first of many, not a one-shot.
    checkAudienceEncore() {
      const s = this.state.scholar, pg = this.progState();
      if (!this.state.systemArrived) return;
      if ((s.integration || 0) < 40) return;
      if (pg.trial || (pg.trialCd || 0) > (s.day || 0)) return;
      if (Math.random() < 0.25) this.offerAudienceTrial('audience');
    },
    checkTrial(kind) {
      const s = this.state.scholar, pg = this.progState();
      const t = pg.trial;
      if (!t) return;
      if ((s.day || 0) > t.expires) {
        pg.trial = null; pg.trialCd = (s.day || 0) + 5;
        try { if (this.ledgerAdd) this.ledgerAdd('defiance', 1); } catch (e) {}
        this.say('The trial window closed. The audience makes a disappointed sound, like wind.');
        return;
      }
      let done = false;
      if (t.kind === 'pantry') {
        try {
          const now = this.pantryKcal ? this.pantryKcal() : 0;
          if (now - (t.start || 0) >= t.need) done = true;
        } catch (e) {}
      } else if (t.kind === 'identify') {
        const n = Object.values((this.state.codex || {}).plants || {}).filter(e => (e.level || 0) >= 3).length;
        if (n >= (t.startN || 0) + t.need) done = true;
      }
      if (done) this.completeTrial();
    },
    completeTrial() {
      const s = this.state.scholar, pg = this.progState();
      pg.trial = null; pg.trialCd = (s.day || 0) + 7;
      this.integrate(15, 'audience trial');
      // the gift: a System ability, if there's room
      // (break-it abilities 2026-10-09: the old filter was `a.system` — a
      // schema flag that exists on ZERO abilities, so the promised gift was
      // dead from birth. System abilities are unlock.type === 'system_offer'.)
      let gift = null;
      try {
        const owned = new Set((s.abilities || []).map(a => a.id));
        const cands = (this.data.abilities || []).filter(a => !owned.has(a.id) && a.unlock && a.unlock.type === 'system_offer');
        if (cands.length && (s.abilities || []).length < this.abilitySlots()) {
          const def = pick(cands);
          s.abilities.push({ id: def.id, name: def.name, desc: def.description || '', level: 1, xp: 0 });
          gift = def.name;
        }
      } catch (e) {}
      try { if (this.ledgerAdd) this.ledgerAdd('showmanship', 3); } catch (e) {}
      try { if (this.recordMoment) this.recordMoment(`Survived the audience's trial: ${t.name}.`); } catch (e) {}
      const luck = (pg.flags || {}).quiet_luck ? ' Quiet luck was with you.' : '';
      this.say(`◈ TRIAL COMPLETE — the audience applauds, which sounds like static. (+15 integration${gift ? `, gift: ${gift}` : ''})${luck}`);
      try { this.save(); } catch (e) {}
    },

    // ---------- DAILY ----------
    progDaily() {
      const s = this.state.scholar, pg = this.progState();
      // pre-arrival slot moments, fired now that the System exists to speak
      if (this.state.systemArrived && (pg.pendingMoments || []).length) {
        const pend = pg.pendingMoments.slice().sort((a, b) => a - b);
        pg.pendingMoments = [];
        for (const t of pend) this.slotMoment(t);
      }
      // trial progress
      this.checkTrial('daily');
      // struggle watch
      this.checkStruggle();
      // audience encore: recurring post-40 trials (pacing build 2026-10-10)
      this.checkAudienceEncore();
      // arc watch
      this.checkArc();
      // comfort flag: making bad days smaller, including your own
      if ((pg.flags || {}).comfort && (s.trauma || 0) > 0) s.trauma = Math.max(0, s.trauma - 1);
      // NPC ladder: villagers climb too, and the village notices
      this.npcLadderDaily();
      // feastSurge consumption is handled at the burn site (food.js wrap below)
    },
    npcLadderDaily() {
      const s = this.state.scholar, pg = this.progState();
      pg.npcInteg = pg.npcInteg || {};
      const ids = ((this.state.village || {}).roster || []).filter(id => id !== this.villagerId).slice(0, 6);
      for (const id of ids) {
        pg.npcInteg[id] = (pg.npcInteg[id] || 5) + (R() < 0.3 ? 1 : 0);
        const cur = pg.npcInteg[id];
        pg.npcInteg[id + '_last'] = pg.npcInteg[id + '_last'] || 0;
        for (const t of [20, 40, 60, 80]) {
          if (cur >= t && pg.npcInteg[id + '_last'] < t) {
            try {
              const nm = this.displayName(id).split(' ')[0];
              this.say(`${nm} stared at their hands for a long time today. Something is changing.`);
            } catch (e) {}
          }
        }
        pg.npcInteg[id + '_last'] = cur;
      }
    },

    // ---------- ITEM POOL AUDIT ----------
    auditItemPool() {
      const errors = [];
      const items = this.data.items || [];
      const cg = this.data.characterGen || {};
      const biased = new Set();
      for (const o of (cg.occupations || [])) for (const ids of Object.values(o.itemBias || {})) for (const id of ids) biased.add(id);
      for (const it of items) {
        if (!it.flavor) errors.push(`${it.id}: no flavor text`);
        if (/\b(Ruth|Theo)\b/.test(it.flavor || '')) errors.push(`${it.id}: flavor names a specific NPC who may not exist`);
        if (it.class === 'sentimental') {
          if (!it.memory) errors.push(`${it.id}: sentimental without flashback memory`);
          if (!it.reveals) errors.push(`${it.id}: sentimental without knowledge reveal`);
          if (typeof it.kin !== 'string') errors.push(`${it.id}: sentimental without kin link`);
        }
        if (['tool', 'weapon', 'clothing', 'sentimental'].includes(it.class)) {
          if (!biased.has(it.id) && it.universal !== true) errors.push(`${it.id}: no occupation link and not universal`);
        }
      }
      return { errors: errors.slice(0, 40), total: errors.length, checked: items.length };
    },
  };

  Object.assign(Game, methods);

  // ============ WRAPS (chain-safe) ============
  (function attach() {
    // abilitySlots: 20->2, 40->3, 60->4, 70->5, 80->6.
    const _abilitySlots = Game.abilitySlots;
    Game.abilitySlots = function () {
      const integ = this.state.scholar.integration || 5;
      if (integ >= 80) return 6;
      if (integ >= 70) return 5;
      if (integ >= 60) return 4;
      if (integ >= 40) return 3;
      if (integ >= 20) return 2;
      return _abilitySlots ? 1 : 1;
    };

    // integrate: fire slot moments + stage beats on threshold crossing.
    // Pre-arrival moments queue — the System can't speak before it exists.
    const _integrate = Game.integrate;
    Game.integrate = function (amount, reason) {
      const s = this.state.scholar;
      const before = s.integration || 5;
      const r = _integrate ? _integrate.call(this, amount, reason) : undefined;
      try {
        if ((reason === 'system' || reason === 'quest') && this.ledgerAdd) this.ledgerAdd('embrace', 1);
      } catch (e) {}
      try {
        const pg = this.progState();
        pg.pendingMoments = pg.pendingMoments || [];
        for (const t of [20, 40, 60, 70, 80]) {
          if (before < t && (s.integration || 0) >= t && !pg.slotMoments[t]) {
            if (this.state.systemArrived) this.slotMoment(t);
            else if (!pg.pendingMoments.includes(t)) pg.pendingMoments.push(t);
          }
        }
        // stage-change beat: the interface IS the story
        const st = this.integrationStage();
        if (st !== (pg.lastStage === undefined ? (this.state.systemArrived ? 1 : 0) : pg.lastStage)) {
          pg.lastStage = st;
          try {
            if (typeof document !== 'undefined') document.body.className =
              document.body.className.replace(/\binteg-stage-\d\b/g, '').trim() + ' integ-stage-' + st;
          } catch (e) {}
          if (this.state.systemArrived && st === 2) this.say('◈ NEURAL CREEP — the overlay isn\'t on the world anymore. It\'s under it. Behind your eyes, faintly, when you blink.');
          if (this.state.systemArrived && st === 3) this.say('◈ FULL INTEGRATION — you don\'t look AT the System anymore. You look WITH it.');
        }
      } catch (e) {}
      return r;
    };

    // offerRelicEnhancement: sentimental evolution plays the flashback FIRST.
    const _offer = Game.offerRelicEnhancement;
    Game.offerRelicEnhancement = function (item, threshold) {
      try {
        const def = this.itemDef ? this.itemDef(item) : ((this.data.items || []).find(i => i.id === (item.itemId || item.id)) || {});
        if (def.class === 'sentimental' && def.memory) this.playFlashback(item, def);
      } catch (e) {}
      return _offer ? _offer.call(this, item, threshold) : undefined;
    };

    // accrueRelicBond: chosen keepsakes (picked at gear select) bond faster —
    // the opening gamble pays off in a stronger evolution curve.
    const _accrue = Game.accrueRelicBond;
    Game.accrueRelicBond = function () {
      const r = _accrue ? _accrue.call(this) : undefined;
      try {
        for (const it of this.relicItems()) {
          if (it.chosen && this.isKeepsake(it)) it.bond = (it.bond || 0) + 1;
        }
      } catch (e) {}
      return r;
    };

    // noteToolUse: work_song flag — you sang while you worked; everything earned it.
    const _ntu = Game.noteToolUse;
    Game.noteToolUse = function () {
      const r = _ntu ? _ntu.call(this) : undefined;
      try {
        if ((this.progState().flags || {}).work_song) {
          for (const it of this.relicItems()) this.noteRelicUse(it.itemId || it.id);
        }
      } catch (e) {}
      return r;
    };

    // feastBurn: the surge — a channeled keepsake makes the feast hit harder.
    // Arc IV makes every burn hotter. Mark feastSurgeUsed for the arc trigger.
    // HONESTY (Steve 2026-10-08, break-it): the base feastBurn() states its own
    // multiplier — the wrapper's extra multiplier used to apply SILENTLY
    // (said x1.5, dealt x2.25 with a surge). Now the total is stated.
    const _feastBurn = Game.feastBurn;
    Game.feastBurn = function () {
      let mult = 1;
      let why = '';
      try {
        const s = this.state.scholar;
        if (s.prog && s.prog.feastSurge) { mult *= 1.5; s.prog.feastSurge = false; s.prog.feastSurgeUsed = true; why += ' A channeled keepsake feeds the flames (FEAST SURGE).'; }
        if (s.arc4burn) { mult *= s.arc4burn; why += ' Arc IV burns hotter.'; }
        if (this.ledgerAdd) this.ledgerAdd('might', 2);
      } catch (e) {}
      const r = _feastBurn ? _feastBurn.call(this) : 0;
      const out = r * mult > 0 ? r * mult : r;
      if (r > 0 && mult !== 1) this.say(`The burn catches on held feeling.${why} x${Math.round(out * 100) / 100} all told.`);
      return out;
    };

    // lootCorpse: taken keepsakes become bonded sentimental items with a memory
    // of the dead — grief as fuel, handled with care.
    //
    // Corpse keepsakes are generated ad-hoc (plantId 'keepsake', an evocative
    // name, no itemId), so bond could never accrue and flashbacks could never
    // fire. Here we adopt them into the sentimental family: map the evocative
    // name onto the closest sentimental def so the itemId exists, bond accrues
    // daily, thresholds fire, and the flashback plays the dead friend's own
    // provenance (keepsakeMemory) — not the def's memory.
    const CORPSE_KEEPSAKE_DEFS = {
      'A creased photograph, faces smiling': 'photo_album',
      'A letter, unsent, in careful handwriting': 'notebook',
      'A wedding ring, worn thin': 'wedding_ring',
      "A child's drawing of a house": 'daughters_drawing',
      'A smooth stone, pocket-worn': 'lucky_coin',
    };
    const _loot = Game.lootCorpse;
    Game.lootCorpse = function (id, takeAll) {
      const r = _loot ? _loot.call(this, id, takeAll) : undefined;
      try {
        const s = this.state.scholar;
        const corpse = (this.state.corpses || []).find(c => c.id === id);
        const dead = corpse && (this.data.villagers || []).find(v => v.id === corpse.villagerId);
        for (const it of (s.inventory || [])) {
          if (it.keepsake && !it.sentimental) {
            it.sentimental = true; it.bonded = true; it.bond = it.bond || 0;
            if (corpse) it.memoryOf = corpse.villagerId;
            const def = (this.data.items || []).find(i => i.id === (CORPSE_KEEPSAKE_DEFS[it.name] || 'lucky_coin'));
            if (def) it.itemId = def.id;
            if (dead && this.resolveKeepsakeText) {
              const holder = { name: dead.name, lifeseed: dead.lifeseed };
              it.keepsakeMemory = this.resolveKeepsakeText(holder,
                { kin: 'none' },
                `${dead.name.split(' ')[0]} carried this on purpose. That is the whole provenance, and it is enough.`);
            }
          }
        }
      } catch (e) {}
      return r;
    };

    // newGame: the gear pick is the gamble. Picked keepsakes are marked CHOSEN —
    // the opening asks the player to trust the game, and the game remembers.
    const _newGame = Game.newGame;
    Game.newGame = function (homeRegionText, locationId, villagerId, pickedItems, runName) {
      const r = _newGame ? _newGame.call(this, homeRegionText, locationId, villagerId, pickedItems, runName) : undefined;
      try {
        const s = this.state.scholar;
        const picked = new Set(pickedItems || []);
        for (const it of (s.inventory || [])) {
          const def = this.itemDef ? this.itemDef(it) : {};
          if (def.class === 'sentimental') {
            it.sentimental = true;
            if (picked.has(it.itemId || it.id)) it.chosen = true;
          }
        }
      } catch (e) {}
      return r;
    };

    // endDay: arcs, trials, struggle watch, NPC ladder.
    const _endDay = Game.endDay;
    Game.endDay = function () {
      try { this.progDaily(); } catch (e) {}
      return _endDay ? _endDay.call(this) : undefined;
    };
  })();
})();
