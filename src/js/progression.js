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
//   - progDaily()
//   - slotMoment()
//   - synLedger()
//   - trackResonance(abilityId, ctx)
//   - emergentSynergies()
//   - emergentInfo(id)
//   - attunePhase(abilityId)
// rules:
//   - ability_cap: 6 (code: progression.js)
//   - emergent_unlock: 5 successful pattern activations (4 if woven); one-off tries never unlock (code: progression.js)
//   - slot_cap_bounds_synergy: candidates tracked only while both abilities held; unlocked resonances go dormant off-slot; C(6,2)=15 pairs max in play (code: progression.js)
//   - resonance_codex_gate: candidates never exposed to UI; hints never name the recipe; codex entry written only on unlock (code: progression.js)
// consumes:
//   - scholar.xp
//   - scholar.abilities
// ============ PROGRESSION, ARCS & SENTIMENTAL ITEMS ============
// Built on the lifeseed foundation (lifeseed.js). Steve's design (2026-10-04):
//
// 1. ABILITY SLOT LADDER: 6 slots. Each unlock is a MOMENT — discovery (20),
//    mentorship (40), audience trial (60), neural creep (70), the grant (80).
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
//    At integration stage 3 the System teaches sentiment-channeling (wrong
//    theory, right power). Keepsakes of the dead can evolve too — grief as
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

  // Emergent-resonance recipe table. Seeded from orphaned design intent:
  // abilities.json synergyHints named these pairings ("Adrenaline Control:
  // stabilize then fight on", "Patient Aim: find it, then drop it clean",
  // "Preservation Instinct: harvest, then keep it") but no system ever read
  // them. The ledger crystallizes them when the PLAYER performs the pattern
  // — the hint in the data becomes a discovery in play. kind must match the
  // candidate kind ('sequential' or 'same_target'); order matters for
  // sequential recipes.
  const EMERGENT_RECIPES = [
    {
      id: 'res_stabilize_fight', pair: ['triage', 'adrenaline_control'], kind: 'sequential',
      order: ['triage', 'adrenaline_control'], name: 'Stabilize Then Fight On',
      flavor: 'Patch the wound. Then let the rush carry you. The body remembers this order even when the mind does not.',
      discovery: 'SYSTEM: "STABILIZE, THEN FIGHT. Oh! OH! The ORDER matters! We have updated our medical textbooks. We did not HAVE medical textbooks. We do now."',
      modifiers: [
        { target: 'healing.amount', op: 'multiply', value: 1.25 },
        { target: 'combat.strike_damage', op: 'multiply', value: 1.1 },
      ],
    },
    {
      id: 'res_find_drop_clean', pair: ['game_sense', 'patient_aim'], kind: 'sequential',
      order: ['game_sense', 'patient_aim'], name: 'Find It, Then Drop It Clean',
      flavor: 'Read the sign. Wait for the shot. The clean kill is a courtesy — to the animal, and to the village that eats.',
      discovery: 'SYSTEM: "FIND, THEN AIM. The gamblers are taking notes! The audience is holding its breath! Nothing personal, prey animal!"',
      modifiers: [
        { target: 'hunt.success', op: 'add', value: 0.15 },
        { target: 'hunt.find_chance', op: 'add', value: 0.1 },
      ],
    },
    {
      id: 'res_preservation', pair: ['field_dressing', 'camp_cook'], kind: 'sequential',
      order: ['field_dressing', 'camp_cook'], name: 'Preservation Instinct',
      flavor: 'Harvest clean, keep it clean. Nothing the land gave you goes to waste on your watch.',
      discovery: 'SYSTEM: "HARVEST, THEN KEEP. Nothing wasted! EVERYTHING returns! We are taking sustainability notes. From a human. We contain multitudes."',
      modifiers: [
        { target: 'cook.kcal', op: 'multiply', value: 1.15 },
      ],
    },
  ];

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
      } else if (t === 70) {
        led('embrace', 1);
        this.say(`◈ THE CREEP — ${fname}'s thoughts have an echo now. The System's echo. Or theirs. Hard to tell anymore. Gifts used in sequence resonate — try them together. (Ability slots: ${this.abilitySlots()})`);
        try { if (this.state.scholar.synergyHint !== true) { this.state.scholar.synergyHint = true; } } catch (e) {}
      } else if (t === 80) {
        led('embrace', 1);
        this.say(`◈ THE GRANT — full integration. The System opens the last slot like a door it built just for ${fname}. "You have been adequate entertainment. We upgrade adequate." (Ability slots: ${this.abilitySlots()})`);
        this.teachSentiment();
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
        const abs = [...(s.abilities || []), ...(s.backgroundAbilities || [])].filter(a => (a.level || 1) < 3);
        if (abs.length) {
          for (const a of abs) { try { this.gainAbilityXP(a.id, Math.round(2 * mult)); } catch (e) { a.xp = (a.xp || 0) + 2; } }
          msg = `You hold ${name} and practice. They would want you to get better at this. (+ability experience)`;
        } else {
          s.prog.feastSurge = true;
          msg = `You hold ${name}. The feast was the weapon — and they are with you. (Next feastburn surges ×${(1.5 * mult).toFixed(1)})`;
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
      if (this.state.systemArrived && (s.day || 0) >= 7 && this.villageNotabilityScore() >= 10) want = 2;
      if (want >= 2 && stage >= 2 && breadth >= 12 && crises >= 1) want = 3;
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
        this.say(`◈ ARC III — ENGINES. SYSTEM: "VIEWERSHIP MILESTONE. Organic unit demonstrates compounding capability. Resonance protocols unlocked." — Your gifts deepen. Used in sequence, they resonate. The village is no longer just surviving. It is becoming something.`);
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
      const tasks = [
        { id: 'haul', text: 'Haul 3,000 kcal to the pantry within 3 days.', need: 3000, have: 0, kind: 'pantry' },
        { id: 'identify', text: 'Fully identify 3 plants (knowledge level 3) within 3 days.', need: 3, have: 0, kind: 'identify' },
      ];
      const t = pick(tasks);
      if (t.kind === 'pantry') { try { t.start = this.pantryKcal ? this.pantryKcal() : 0; } catch (e) { t.start = 0; } }
      if (t.kind === 'identify') {
        t.startN = Object.values((this.state.codex || {}).plants || {}).filter(e => (e.level || 0) >= 3).length;
      }
      pg.trial = { ...t, reason, expires: (s.day || 0) + 3 };
      const why = reason === 'struggle'
        ? 'SYSTEM: "The audience is bored. Bored audiences stop watching. Stopped being watched is... we do not like to think about it. A trial, then. For you."'
        : 'SYSTEM: "A trial, broadcast live. The audience loves a trial."';
      this.say(`◈ AUDIENCE TRIAL — ${why} ${t.text} Reward: integration, and a gift.`);
      try { this.save(); } catch (e) {}
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
      let gift = null;
      try {
        const owned = new Set((s.abilities || []).map(a => a.id));
        const cands = (this.data.abilities || []).filter(a => !owned.has(a.id) && a.system);
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
      // emergent-resonance ledger: the feeling fades overnight
      try { this.resonanceDawnDecay(); } catch (e) {}
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

    // ============ EMERGENT SYNERGY LEDGER ============
    // Steve's design (2026-10-04): "Synergy discovery is earned through
    // practice: logical, guessable activation conditions (e.g. abilities in
    // succession on the same target), a few successful attempts required —
    // no reward for one-off tries; attempts 1–2 reliably hint at what's
    // possible without saying how."
    //
    // game.js owns the DESIGNED synergies (data/synergies.json — 3 combined
    // uses to unlock). This ledger owns the EMERGENT ones: pairings the data
    // never named, discovered purely because the player kept doing the thing
    // and the System kept watching. The recipe table below is seeded from
    // orphaned design intent (abilities.json synergyHints — named pairs that
    // were never wired into any system); anything else crystallizes as a
    // generic resonance the System names on the spot.
    //
    // HONESTY RULES (the ledger is a contract with the player):
    // - One clean pattern completion = one counted activation. Each use of A
    //   enables exactly ONE counted use of B (tracked by use-log index), so
    //   spamming B after a single A does not farm the ledger.
    // - Wrong sequences decay the run: B without a fresh A costs 1; a
    //   component ability used on a different target mid-pattern costs 1;
    //   every dawn costs 1. One-off tries evaporate entirely.
    // - Unlock needs EMERGENT_NEED (5) successful activations — stricter than
    //   designed synergies (3), because this recipe was never written down.
    //   A woven-attuned ability lowers it to 4 for its pairs.
    // - 6-SLOT CAP: candidates are tracked only while BOTH abilities are held
    //   (abilityLevel >= 1). An unlocked resonance goes DORMANT the moment a
    //   component leaves the slots. The cap bounds the choosable combo space:
    //   C(6,2)=15 pairs of slotted gifts in play at once (background gifts —
    //   who you already were — are always held and sit outside the cap).
    //   Bounded but rich. Synergies never grant slots; they reward choosing
    //   well WITHIN the cap.
    // - CODEX GATING ("if you don't know, it doesn't show"): candidates are
    //   never exposed to any UI surface. Hint text never names the abilities
    //   or the recipe — it describes the FEELING. emergentInfo(id) returns
    //   null until unlocked; the codex entry is written at unlock.
    synLedger() {
      const pg = this.progState();
      pg.synLedger = pg.synLedger || { cands: {}, emergent: {}, attune: {} };
      return pg.synLedger;
    },

    // Pairs the designed system already owns — the emergent ledger keeps out.
    designedSynergyPairs() {
      const s = new Set();
      for (const syn of (this.data.synergies || [])) {
        const r = (syn.requires || []).slice().sort();
        if (r.length === 2) s.add(r.join('|'));
      }
      return s;
    },

    abilityDisplayName(id) {
      const d = (this.data.abilities || []).find(a => a.id === id);
      return d ? d.name : id;
    },

    // trackResonance: called from the noteAbilityUse wrap (which runs AFTER
    // the original, so abilityUseLog already contains this use as its last
    // entry). Builds candidate sequences from the log and scores them.
    trackResonance(abilityId, ctx) {
      const sch = this.state.scholar;
      if (!sch || !abilityId) return;
      const L = this.synLedger();
      // day source mirrors game.js noteAbilityUse (village.day first) so the
      // ledger and the use log always agree on what "today" means.
      const day = (this.state.village && this.state.village.day) || (sch.day || 1);
      this.attuneUse(abilityId);
      const log = sch.abilityUseLog || [];
      const curIdx = log.length - 1;
      let held = 0;
      try { held = this.abilityLevel(abilityId) >= 1; } catch (e) { held = 0; }
      if (!held) return;
      const heldFn = (id) => { try { return this.abilityLevel(id) >= 1; } catch (e) { return false; } };
      // purge: components no longer held, or already crystallized
      for (const k of Object.keys(L.cands)) {
        const c = L.cands[k];
        if (!heldFn(c.a) || !heldFn(c.b)) delete L.cands[k];
      }
      const designed = this.designedSynergyPairs();
      const pairKey = (a, b) => [a, b].sort().join('|');
      // --- succession: most recent DISTINCT earlier use, same day, close by
      let prevA = null, prevIdx = -1;
      for (let i = curIdx - 1; i >= 0 && i >= curIdx - 5; i--) {
        const u = log[i];
        if (!u || u.id === abilityId) continue;
        if ((u.day || 1) !== day) break; // yesterday's rhythm doesn't count
        prevA = u.id; prevIdx = i; break;
      }
      // --- same target: partner use on the same target today
      const tgt = (ctx && ctx.target) || null;
      let partnerIdx = -1, partnerId = null;
      if (tgt) {
        for (let i = curIdx - 1; i >= 0 && i >= curIdx - 8; i--) {
          const u = log[i];
          if (!u || (u.day || 1) !== day || u.target !== tgt || u.id === abilityId) continue;
          partnerId = u.id; partnerIdx = i; break;
        }
      }
      const completions = [];
      if (prevA && heldFn(prevA)) completions.push({ key: 'seq:' + prevA + '>' + abilityId, a: prevA, b: abilityId, kind: 'sequential', enabler: prevIdx });
      if (partnerId && heldFn(partnerId)) {
        const pr = [partnerId, abilityId].sort();
        completions.push({ key: 'tgt:' + pr[0] + '|' + pr[1] + '@' + tgt, a: pr[0], b: pr[1], kind: 'same_target', target: tgt, enabler: partnerIdx });
      }
      const doneKeys = new Set();
      for (const c of completions) {
        if (c.a === c.b) continue;
        if (designed.has(pairKey(c.a, c.b))) continue; // game.js owns it
        // resonanceSuccess reports whether the pattern actually counted —
        // a repeated B off the same A counts for nothing AND breaks rhythm.
        if (this.resonanceSuccess(c, day)) doneKeys.add(c.key);
      }
      // --- honest decay: B used without a fresh A (mashing), or a component
      // dragged onto a different target mid-pattern.
      for (const k of Object.keys(L.cands)) {
        const c = L.cands[k];
        if (doneKeys.has(k) || c.run <= 0) continue;
        let decay = false;
        if (c.kind === 'sequential' && abilityId === c.b) {
          // this B completed nothing fresh — the rhythm broke
          decay = true;
        } else if (c.kind === 'same_target' && tgt && tgt !== c.target &&
                   (abilityId === c.a || abilityId === c.b)) {
          decay = true; // the thread moved to another mark
        }
        if (decay) {
          c.run = Math.max(0, c.run - 1);
          c.lastDay = day;
        }
      }
    },

    // Returns true when the activation counted toward the run.
    resonanceSuccess(c, day) {
      const L = this.synLedger();
      let cand = L.cands[c.key];
      if (!cand) {
        cand = L.cands[c.key] = {
          key: c.key, a: c.a, b: c.b, kind: c.kind, target: c.target || null,
          run: 0, total: 0, hintStage: 0, lastAIdx: -1, lastDay: day,
        };
      }
      if (cand.lastAIdx === c.enabler) return false; // one A enables one counted B
      cand.lastAIdx = c.enabler;
      let gain = 1;
      if (this.attunePhase(c.a) >= 2 || this.attunePhase(c.b) >= 2) gain = 2; // hum
      cand.run += gain;
      cand.total += 1;
      cand.lastDay = day;
      if (cand.run >= this.emergentNeed(cand)) this.crystallizeResonance(cand);
      else this.resonanceHint(cand);
      return true;
    },

    emergentNeed(cand) {
      // woven attunement (phase 3) shortens the road for its pairs
      if (this.attunePhase(cand.a) >= 3 || this.attunePhase(cand.b) >= 3) return 4;
      return 5; // EMERGENT_NEED: unknown recipes demand more proof
    },

    // resonanceHint: attempts 1–2 (and beyond) tease the FEELING, never the
    // recipe. The player should think "whoa, what did I just do?" — not read
    // an instruction manual.
    resonanceHint(cand) {
      if (cand.hintStage >= cand.run) return; // one hint per depth
      cand.hintStage = cand.run;
      const lines = this.resonanceHintLines(cand.kind, cand.run);
      if (lines && lines.length) {
        try { this.say(pick(lines)); } catch (e) {}
      }
    },

    resonanceHintLines(kind, run) {
      const SEQ = {
        1: [
          'For a breath, the two gifts felt like one thing with two ends. Then the moment passed. (Probably nothing. Probably.)',
          'A shiver ran the length of your spine — not cold, not fear. Like a chord resolving. Then nothing.',
        ],
        2: [
          'Again. The same order, the same rhythm. The overlay flickered at the edge of your sight. The System noticed before you did. It doesn\'t know what it saw.',
          'Twice now, and the second time the air tasted like copper and ozone. Something is keeping count. It might be you.',
        ],
        3: [
          'There is a shape to this now. Do it the same way — deliberately, not by accident. The echo is getting louder.',
          'The System has stopped pretending it isn\'t watching. Do the thing again. Exactly the thing.',
        ],
        4: [
          'One more. Exactly like that. You can feel it leaning in — whatever "leaning in" means for something with no body.',
          'This is the edge of something. One more, and it tips over.',
        ],
      };
      const TGT = {
        1: [
          'Something answered — there, on that one. A chord struck twice in the same place. Gone before you could name it.',
        ],
        2: [
          'Twice now, on the same mark. Coincidence is getting lazy with its excuses.',
          'The same place, the same two gifts. The overlay drew a circle around it, then erased the circle, embarrassed.',
        ],
        3: [
          'The pattern has a location. Keep bringing both gifts to the same mark. Deliberately.',
        ],
        4: [
          'One more, on the same mark. The System has started taking notes in the margins. You can see its handwriting.',
        ],
      };
      const bank = kind === 'same_target' ? TGT : SEQ;
      return bank[run] || null;
    },

    crystallizeResonance(cand) {
      const L = this.synLedger();
      const pk = [cand.a, cand.b].sort().join('|');
      const recipe = EMERGENT_RECIPES.find(r => {
        if (r.pair.slice().sort().join('|') !== pk) return false;
        if (r.kind && r.kind !== cand.kind) return false;
        // sequential recipes care about ORDER: stabilize THEN fight.
        if (r.kind === 'sequential' && r.order) {
          return cand.a === r.order[0] && cand.b === r.order[1];
        }
        return true;
      });
      let entry;
      if (recipe) {
        entry = {
          id: recipe.id, name: recipe.name, pair: [cand.a, cand.b], kind: cand.kind,
          flavor: recipe.flavor, discovery: recipe.discovery, modifiers: recipe.modifiers,
        };
      } else {
        entry = this.genericResonance(cand);
      }
      entry.day = cand.lastDay || 1;
      entry.total = cand.total;
      L.emergent[entry.id] = entry;
      delete L.cands[cand.key];
      // codex: now you know, now it shows
      try {
        this.state.codex = this.state.codex || {};
        this.state.codex.synergies = this.state.codex.synergies || {};
        this.state.codex.synergies[entry.id] = { known: true, day: entry.day, note: entry.name + ' — ' + entry.flavor };
      } catch (e) {}
      this.say(`✨ RESONANCE DISCOVERED: ${entry.name}!`);
      this.say(entry.flavor);
      this.say(entry.discovery);
      this.say(`(Resonance effect: ${this.describeEmergentFx(entry.modifiers)}. Dormant unless both gifts are held in your slots.)`);
      try { this.recomputeActiveSynergies(); } catch (e) {}
      try { this.save(); } catch (e) {}
    },

    genericResonance(cand) {
      const an = this.abilityDisplayName(cand.a), bn = this.abilityDisplayName(cand.b);
      return {
        id: 'res_' + cand.a + '_' + cand.b + '_' + cand.kind.slice(0, 3),
        name: an + ' × ' + bn,
        pair: [cand.a, cand.b], kind: cand.kind,
        flavor: 'Nobody taught you this. The two gifts just... fit, like hands finding each other in the dark.',
        discovery: `SYSTEM: "UNFILED RESONANCE DETECTED. We did not plan this. We are taking credit anyway. The audience demanded a name, so: ${an} × ${bn}. Filed under FAVORITES."`,
        modifiers: this.genericResonanceFx(cand.a, cand.b),
      };
    },

    genericResonanceFx(a, b) {
      const pool = (id) => {
        const d = (this.data.abilities || []).find(x => x.id === id);
        return (d && d.pool) || 'system';
      };
      const pa = pool(a), pb = pool(b);
      const has = (p) => pa === p || pb === p;
      if (pa === 'combat' && pb === 'combat') return [{ target: 'combat.strike_damage', op: 'multiply', value: 1.1 }];
      if (has('fieldcraft')) return [{ target: 'hunt.find_chance', op: 'add', value: 0.1 }];
      if (has('care')) return [{ target: 'healing.amount', op: 'multiply', value: 1.15 }];
      if (has('craft')) return [{ target: 'craft.success', op: 'multiply', value: 1.15 }];
      return [
        { target: 'hunt.find_chance', op: 'add', value: 0.05 },
        { target: 'forage.yield', op: 'multiply', value: 1.05 },
      ];
    },

    describeEmergentFx(mods) {
      const names = {
        'combat.strike_damage': 'strike damage', 'healing.amount': 'healing',
        'hunt.success': 'hunt success', 'hunt.find_chance': 'finding prey',
        'cook.kcal': 'cooking yield', 'forage.yield': 'forage yield',
        'craft.success': 'crafting', 'trust.gain_mult': 'trust gains',
      };
      return (mods || []).map(m => {
        const n = names[m.target] || m.target;
        const v = m.op === 'multiply' ? '×' + m.value : (m.value > 0 ? '+' : '') + Math.round(m.value * 100) + '%';
        return n + ' ' + v;
      }).join(', ');
    },

    // emergentSynergies: all crystallized resonances (the UI/codex read).
    emergentSynergies() {
      return Object.values(this.synLedger().emergent || {});
    },
    // emergentInfo: codex-gated. Null until discovered — if you don't know,
    // it doesn't show. Any UI surface must read through this gate.
    emergentInfo(id) {
      const e = (this.synLedger().emergent || {})[id];
      if (!e) return null;
      let active = false;
      try { active = (((this.state.scholar || {}).activeEmergent) || []).indexOf(e.id) >= 0; } catch (err) {}
      return {
        id: e.id, name: e.name, pair: (e.pair || []).slice(), kind: e.kind,
        flavor: e.flavor, effect: this.describeEmergentFx(e.modifiers), active,
      };
    },
    activeEmergentIds() {
      return ((this.state.scholar || {}).activeEmergent || []).slice();
    },

    // Dawn decay: the feeling fades overnight. One-off tries evaporate.
    resonanceDawnDecay() {
      const sch = this.state.scholar;
      if (!sch) return;
      const L = this.synLedger();
      const day = (this.state.village && this.state.village.day) || (sch.day || 1);
      for (const k of Object.keys(L.cands)) {
        const c = L.cands[k];
        if ((c.lastDay || 0) >= day) continue;
        // attunement flicker: the feeling doesn't fade overnight
        if (this.attunePhase(c.a) >= 1 || this.attunePhase(c.b) >= 1) { c.lastDay = day; continue; }
        c.run = Math.max(0, c.run - 1);
        c.lastDay = day;
        if (c.run === 0 && c.total <= 1) delete L.cands[k];
      }
    },

    // ============ ATTUNEMENT (neural-creep evolution) ============
    // At integration stage 2+ ("neural creep — abilities deepen, synergies
    // unlock"), abilities already at max level (3) keep a second track:
    // ATTUNEMENT. Use deepens the groove. Phases: flicker (8) → hum (20) →
    // woven (40). Each phase is a beat, and each one bends the resonance
    // ledger toward the attuned gift:
    //   flicker: overnight decay never touches its pairs (the feeling stays)
    //   hum:    its pairs count double per successful activation
    //   woven:  its pairs crystallize at 4 activations instead of 5
    // The System explains all of this with a completely wrong theory, which
    // is the joke and also the fiction.
    attuneUse(abilityId) {
      if (this.integrationStage() < 2) return;
      const sch = this.state.scholar;
      const ab = (sch.backgroundAbilities || []).find(a => a.id === abilityId) ||
                 (sch.abilities || []).find(a => a.id === abilityId);
      if (!ab || (ab.level || 1) < 3) return; // only deepened gifts attune
      const L = this.synLedger();
      const at = L.attune[abilityId] || (L.attune[abilityId] = { xp: 0, phase: 0 });
      if (at.xp >= 40) return;
      at.xp += 1;
      const want = at.xp >= 40 ? 3 : at.xp >= 20 ? 2 : at.xp >= 8 ? 1 : 0;
      if (want > at.phase) {
        at.phase = want;
        this.attuneBeat(abilityId, want);
      }
    },
    attunePhase(abilityId) {
      const at = (this.synLedger().attune || {})[abilityId];
      return at ? at.phase : 0;
    },
    attuneBeat(abilityId, phase) {
      const nm = this.abilityDisplayName(abilityId);
      if (phase === 1) {
        this.say(`◈ ATTUNEMENT — ${nm} flickers at the edges now, like a word on the tip of a tongue. SYSTEM: "ANOMALY: the ${nm} waveform is echoing ITSELF. We are calling this RESONANCE. We are probably wrong. It is probably resonance." (Resonances involving ${nm} no longer fade overnight.)`);
      } else if (phase === 2) {
        this.say(`◈ ATTUNEMENT — ${nm} hums, low and constant. Your other gifts lean toward it the way plants lean toward light. (Resonances involving ${nm} deepen twice as fast.)`);
      } else if (phase === 3) {
        this.say(`◈ ATTUNEMENT — ${nm} is woven in. It doesn't feel like a gift anymore. It feels like a habit the universe has. (Resonances involving ${nm} crystallize sooner.)`);
      }
      try { this.save(); } catch (e) {}
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
    const _feastBurn = Game.feastBurn;
    Game.feastBurn = function () {
      let mult = 1;
      try {
        const s = this.state.scholar;
        if (s.prog && s.prog.feastSurge) { mult *= 1.5; s.prog.feastSurge = false; s.prog.feastSurgeUsed = true; }
        if (s.arc4burn) mult *= s.arc4burn;
        if (this.ledgerAdd) this.ledgerAdd('might', 2);
      } catch (e) {}
      const r = _feastBurn ? _feastBurn.call(this) : 0;
      return r * mult > 0 ? r * mult : r;
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

    // noteAbilityUse: every ability use feeds the emergent-resonance ledger.
    // Runs AFTER the original (game.js) so abilityUseLog already holds this
    // use as its last entry. Chain-safe: other modules' wraps keep working.
    const _nau = Game.noteAbilityUse;
    Game.noteAbilityUse = function (abilityId, context) {
      const r = _nau ? _nau.call(this, abilityId, context) : undefined;
      try { if (this.trackResonance) this.trackResonance(abilityId, context); } catch (e) {}
      return r;
    };

    // recomputeActiveSynergies: emergent resonances go DORMANT unless both
    // component gifts are currently held — the 6-slot cap is the boss here.
    const _rec = Game.recomputeActiveSynergies;
    Game.recomputeActiveSynergies = function () {
      const r = _rec ? _rec.call(this) : undefined;
      try {
        const sch = this.state.scholar;
        if (!sch || !this.synLedger) return r;
        const L = this.synLedger();
        const act = [];
        for (const e of Object.values(L.emergent || {})) {
          const held = (e.pair || []).every(id => {
            try { return this.abilityLevel(id) >= 1; } catch (x) { return false; }
          });
          if (held) act.push(e.id);
        }
        sch.activeEmergent = act;
      } catch (e) {}
      return r;
    };

    // synergyMods: emergent modifiers ride the same pipeline as designed ones.
    const _sm = Game.synergyMods;
    Game.synergyMods = function () {
      const base = _sm ? _sm.call(this) : [];
      try {
        if (!this.synLedger) return base;
        const L = this.synLedger();
        for (const id of ((this.state.scholar || {}).activeEmergent || [])) {
          const e = L.emergent[id];
          if (e && e.modifiers) {
            for (const m of e.modifiers) base.push(Object.assign({ source: 'emergent:' + id }, m));
          }
        }
      } catch (e) {}
      return base;
    };

    // hasSynergy: emergent resonances count as resonating.
    const _hs = Game.hasSynergy;
    Game.hasSynergy = function (sid) {
      if (_hs && _hs.call(this, sid)) return true;
      try { return (((this.state.scholar || {}).activeEmergent) || []).indexOf(sid) >= 0; }
      catch (e) { return false; }
    };
  })();
})();
