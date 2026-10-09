// @ontology
// system: corruption
// description: Corruption system — the dark mirror of trust. Per-character 0-100, never shown as a number; felt through tells, unease, and witnessed acts. Slippery-slope cannibalism pipeline (butcher a person-corpse -> human meat -> eat), contextual consequences (exile in healthy villages, horror-without-exile when starving, power move when corrupted), fear as a social currency distinct from trust, bottom-up village corruption, NPC corruption arcs + temptation, psycho player spawns, and show framing for dark runs.
// provides:
//   - corruptionOf(who), addCorruption(n, reason), addNpcCorruption(vid, n, reason)
//   - villageCorruption(), cannibalNorm(), starvingVillage()
//   - corpseButcher(cid), eatCannibal(idx), humanMeatItem()
//   - fearOf(vid, target), addFear(vid, target, n), avgFearOf(target), fearWeakness(target)
//   - psychoIntro(char), mantleWatch()
//   - corruptionTick() (per-part: cravings, fear decay, NPC drift, events)
//   - npcCannibalTick(), temptTick(), darkShowBeat(kind)
// rules:
//   - corruption_hidden: the number never renders in UI; it surfaces through behavior tells, unease lines, and witnessed acts (code: corruptionOf, Steve 2026-10-09)
//   - foil_drag: high player corruption drags trust gains — the two systems push against each other (code: trustGainProgressive wrap, Steve 2026-10-09)
//   - slope: the first cannibal meal costs the most trauma; repeats desensitize while corruption gains accelerate and cravings grow (code: eatCannibal, Steve 2026-10-09)
//   - contextual_norms: discovered cannibalism means exile in a healthy village, horror-without-exile when starving, a power move when corrupted (code: cannibalNorm, Steve 2026-10-09)
//   - fear_not_love: fear compels obedience but never loyalty; it collapses when the feared show weakness (code: addFear/fearWeakness, Steve 2026-10-09)
//   - bottom_up: village corruption emerges from its members' corruption, not a flag (code: villageCorruption, Steve 2026-10-09)
//   - televised_evil: evil is a legitimate path to power and the show notices dark runs (code: darkShowBeat, Steve 2026-10-09)
//   - terrible_bargain: real power at a real price — cravings, brittleness, exile risk, prion death (code: cravingTick, Steve 2026-10-09)
// consumes:
//   - state.scholar.corruption, state.village.corruption{}, state.village.dread{}
//   - recordCrime/justiceHeat (wrapped), observe/witnesses, addTrauma, contractDisease
/* CORRUPTION SYSTEM
 *
 * Trust is per-relationship and progressive. Corruption is per-character,
 * 0-100, the dark mirror: it measures what you've become. Others never see
 * the number — they sense it through behavior tells, witnessed acts, and
 * unease. High corruption drags trust gains (the foil), breeds fear (not
 * love), and at the top end the village's norms bend around you.
 *
 * Cannibalism is the slope, not a button: butcher a person-corpse for human
 * meat, then eat. The first meal is devastating; each repeat costs less
 * trauma (that's the horror) while corruption accelerates and cravings grow.
 * Prions don't care about cooking. Witnesses change everything — and what
 * "everything" means depends on what the village has been through.
 *
 * Villagers are full participants: they corrupt bottom-up, tempt, normalize,
 * and can become the corrupt figures who shift a village's norms.
 */
(function () {
  'use strict';
  const G = (typeof globalThis !== 'undefined' && globalThis.Scattering && globalThis.Scattering.Game)
    ? globalThis.Scattering.Game
    : (typeof Game !== 'undefined' ? Game : null);
  if (!G) return;
  const R = Math.random;

  const clamp100 = n => Math.max(0, Math.min(100, Math.round(n || 0)));

  const methods = {
    // ============ CORE STATE ============
    // corruptionOf('player'|'scholar') or a villager id. Hidden number —
    // never rendered; fiction surfaces it.
    corruptionOf(who) {
      try {
        if (who === 'player' || who === 'scholar' || (this.villagerId && who === this.villagerId))
          return clamp100((this.state.scholar || {}).corruption);
        const v = this.state.village || {};
        return clamp100((v.corruption || {})[who]);
      } catch (e) { return 0; }
    },
    addCorruption(n, reason) {
      const s = this.state.scholar; if (!s) return 0;
      const before = clamp100(s.corruption);
      s.corruption = clamp100(before + n);
      if (s.corruption > before) this.corruptionThresholdBeat(before, s.corruption, reason);
      return s.corruption;
    },
    addNpcCorruption(vid, n, reason) {
      if (!vid || vid === this.villagerId) return this.addCorruption(n, reason);
      const v = this.state.village; if (!v) return 0;
      v.corruption = v.corruption || {};
      v.corruption[vid] = clamp100((v.corruption[vid] || 0) + n);
      return v.corruption[vid];
    },
    // corruptionThresholdBeat: the fiction notices crossings. Mostly felt,
    // not told — unease lines, tells surfacing, the show noticing.
    corruptionThresholdBeat(before, after, reason) {
      const crossed = [30, 60, 85].filter(t => before < t && after >= t);
      if (!crossed.length) return;
      const t = crossed[crossed.length - 1];
      if (t === 30) {
        this.say('Something in you has shifted, and you know exactly when it happened. You catch your own reflection in still water and look away first.');
      } else if (t === 60) {
        this.say('You don\'t flinch anymore. That\'s the part that scares you — on the nights you let it. The hunger has a voice now, and it sounds like yours.');
        this.darkShowBeat('threshold60');
      } else if (t === 85) {
        this.say('There isn\'t much left in you that the old you would recognize. What\'s left is honest about what it wants. That\'s worse, somehow.');
        this.darkShowBeat('threshold85');
      }
    },

    // ============ VILLAGE-LEVEL ============
    // villageCorruption: bottom-up mean of the living roster + player.
    villageCorruption() {
      try {
        const v = this.state.village || {};
        const roster = (v.roster || []).filter(id => {
          try { const vp = this.vpOf(id); return vp && !vp.dead; } catch (e) { return true; }
        });
        let sum = clamp100((this.state.scholar || {}).corruption), n = 1;
        for (const id of roster) {
          if (id === this.villagerId) continue;
          sum += clamp100((v.corruption || {})[id]); n++;
        }
        return n ? sum / n : 0;
      } catch (e) { return 0; }
    },
    // starvingVillage: sustained food stress. Starvation deaths in the last
    // week, or a third of the living roster deep in hunger.
    starvingVillage() {
      try {
        const v = this.state.village || {};
        const day = (this.state.scholar || {}).day || 0;
        const recent = (v.fallen || []).filter(f => /starv/i.test(f.cause || '') && (day - (f.day || 0)) <= 7);
        if (recent.length >= 1) return true;
        const roster = (v.roster || []).filter(id => id !== this.villagerId);
        if (!roster.length) return false;
        let hungry = 0;
        for (const id of roster) {
          try { if ((this.npcNeeds(id).hunger || 0) >= 70) hungry++; } catch (e) {}
        }
        return hungry >= Math.max(2, Math.ceil(roster.length / 3));
      } catch (e) { return false; }
    },
    // cannibalNorm: what would THIS village tolerate today? Answerable from
    // existing state — food stress, recent deaths, members' corruption.
    //   exile: healthy village. Discovered cannibalism = exile.
    //   horror: starving village. Horror without exile — desperation moved the line.
    //   power: corrupted village. The quickest source of power.
    cannibalNorm() {
      try {
        if (this.villageCorruption() >= 45) return 'power';
        // a corrupt figurehead bends norms even before the mean catches up
        const v = this.state.village || {};
        const roster = (v.roster || []);
        for (const id of roster) {
          if (clamp100((v.corruption || {})[id]) >= 60) { /* fall through to check leadership */ break; }
        }
        if (this.starvingVillage()) return 'horror';
        return 'exile';
      } catch (e) { return 'exile'; }
    },

    // ============ FEAR (distinct from trust) ============
    // v.dread[targetVid][vid] = how much vid fears target. Fear compels
    // obedience but never loyalty; it collapses on shown weakness.
    fearOf(vid, target) {
      try {
        const d = ((this.state.village || {}).dread || {})[target || this.villagerId] || {};
        return clamp100(d[vid]);
      } catch (e) { return 0; }
    },
    addFear(vid, target, n) {
      try {
        const v = this.state.village; if (!v || !vid) return 0;
        target = target || this.villagerId;
        v.dread = v.dread || {}; v.dread[target] = v.dread[target] || {};
        v.dread[target][vid] = clamp100((v.dread[target][vid] || 0) + n);
        return v.dread[target][vid];
      } catch (e) { return 0; }
    },
    avgFearOf(target) {
      try {
        const v = this.state.village || {};
        const roster = (v.roster || []).filter(id => id !== (target || this.villagerId));
        if (!roster.length) return 0;
        let sum = 0;
        for (const id of roster) sum += this.fearOf(id, target);
        return sum / roster.length;
      } catch (e) { return 0; }
    },
    // fearWeakness: the feared show weakness — fear collapses into contempt.
    fearWeakness(target) {
      try {
        const v = this.state.village || {};
        const tm = v.dread[target || this.villagerId] || {};
        let any = false;
        for (const vid of Object.keys(tm)) {
          if ((tm[vid] || 0) >= 20) {
            tm[vid] = clamp100(tm[vid] - 45); any = true;
            try {
              const r = this.repOf(vid);
              r.honest = (r.honest || 0) - 8;
              this.remember(vid, 'saw_weakness', 'watched the feared one break');
            } catch (e) {}
          }
        }
        if (any) this.say('Something in the air changes. Fear curdles when it sees weakness — and everyone just saw.');
        return any;
      } catch (e) { return false; }
    },

    // ============ THE SLOPE: BUTCHER -> MEAT -> EAT ============
    humanMeatItem(units) {
      const day = (this.state.scholar || {}).day || 0;
      return {
        plantId: 'meat_human', foodKind: 'meat', foodState: 'raw',
        edible: true, units: units || 1, kcalEach: 550, hiddenKcal: 550,
        spoilDay: day + 2, unit: 'portion', kg: 0.4,
        name: 'human meat',
        desc: 'You know exactly what this is. That\'s the worst part.',
        // PRIONS (Steve 2026-10-09): cooking doesn't kill it. Nothing kills it.
        prionRisk: { p: 0.15, id: 'trembles', note: 'prions — cooking doesn\'t kill them' },
      };
    },
    // corpseButcher(cid): butcher a PERSON corpse for meat. The enabler, not
    // the act — but desecration has its own weight and its own witnesses.
    corpseButcher(cid) {
      if (this.over) return null;
      const c = (this.corpses ? this.corpses() : []).find(x => x.id === cid);
      if (!c || c.buried) { this.say('Nothing there.'); return null; }
      if (c.kind !== 'person') { this.say('Field-dressing handles animals. This is different. This is a person.'); return null; }
      if (c.butchered) { this.say('There\'s nothing left to take that way.'); return null; }
      const s = this.state.scholar;
      if (c.node.x !== this.map.px || c.node.y !== this.map.py ||
          Math.max(Math.abs(c.mx - (s.mx || 4)), Math.abs(c.my - (s.my || 4))) > 1) {
        this.say('Too far — get closer to the body.'); return null;
      }
      if (this.hasCuttingTool && !this.hasCuttingTool()) {
        this.say('You need a blade for this. Your hands aren\'t enough — thank whatever\'s left of your conscience for that.'); return null;
      }
      const units = 2 + Math.floor(R() * 3); // 2-4
      const meat = this.humanMeatItem(units);
      // merge into an identical stack only (fungibility rule)
      const inv = s.inventory;
      const ex = inv.find(x => x.plantId === 'meat_human' && !x.keepsake && (!this.stacksMatch || this.stacksMatch(x, meat)));
      if (ex) ex.units = (ex.units || 1) + units; else inv.push(meat);
      c.butchered = true;
      this.tickAction(4);
      // the weight: worse than looting. You didn't take their pack — you took them.
      let trauma = 6;
      try { trauma += this.corpseTrauma(c, {}); } catch (e) { trauma += 8; }
      this.addTrauma(trauma);
      this.addCorruption(4, 'butchered a person');
      const wit = (this.witnesses ? this.witnesses(3) : []) || [];
      const known = this.nameKnown ? this.nameKnown(c.villagerId) : true;
      const who = known && c.villagerId ? this.displayName(c.villagerId) : 'them';
      this.say(`You butcher ${who}. Your hands know exactly what they're doing, and that's what will stay with you. (+${trauma} trauma)`);
      if (wit.length) {
        try { this.observe('butcher_person', { target: c.villagerId }); } catch (e) {}
        try { this.recordCrime('desecration', { victim: c.villagerId, witnessed: true }); } catch (e) {}
        this.say('Someone is watching. You hear the sound they make, and you will hear it again tonight.');
      } else {
        try { this.recordCrime('desecration', { victim: c.villagerId, witnessed: false }); } catch (e) {}
        this.say('Nobody saw. The knowledge sits in you like something swallowed whole.');
      }
      return meat;
    },
    // eatCannibal(idx): THE ACT. Routed from eatOne for human meat.
    // Slope: trauma = 35 * 0.82^meals (min 6); corruption = 14 + 3*meals (cap 30).
    eatCannibal(idx) {
      const s = this.state.scholar;
      if (this.over) return false;
      const it = (s.inventory || [])[idx];
      if (!it || it.plantId !== 'meat_human' || (it.units || 0) <= 0) {
        this.say('Nothing edible there.'); return false;
      }
      const meals = s.cannibalMeals || 0;
      const first = meals === 0;
      // trauma desensitizes; corruption accelerates. That's the horror.
      const trauma = Math.max(6, Math.round(35 * Math.pow(0.82, meals)));
      const corrGain = Math.min(30, 14 + 3 * meals);
      const norm = this.cannibalNorm();
      const wit = (this.witnesses ? this.witnesses(3) : []) || [];
      // approving witnesses: the corrupt don't judge — they recognize.
      const approving = wit.filter(id => { try { return this.corruptionOf(id) >= 50; } catch (e) { return false; } });
      const horrified = wit.filter(id => approving.indexOf(id) < 0);
      this.tickAction(1);
      // eat it: the calories are real. So is everything else.
      const cap = this.kcalCap ? this.kcalCap() : 99999;
      const kcal = Math.min(it.kcalEach || 550, Math.max(0, cap - (s.kcal || 0)));
      s.kcal = Math.min(cap, (s.kcal || 0) + (it.kcalEach || 550));
      it.units -= 1; if (it.units <= 0) s.inventory.splice(idx, 1);
      s.cannibalMeals = meals + 1;
      s.lastCannibalDay = s.day || 0;
      s.cravingFedDay = s.day || 0; // the gnawing quiets. For now.
      this.addTrauma(trauma);
      this.addCorruption(corrGain, 'ate human meat');
      // PRIONS: cooking doesn't kill them. Nothing does.
      if (!((s.atePrionSafe) /* no such thing */) && R() < 0.15) {
        try { this.contractDisease('trembles', { source: 'human meat' }); } catch (e) {}
        this.say('Something in it was wrong in a way fire can\'t fix. Prions don\'t cook out. You know this. You ate it anyway.');
      }
      if (first) {
        this.say(`The first bite is the worst thing you have ever done, and your body knows it before your mind catches up. You shake for an hour. (+${trauma} trauma — it will never be this bad again, and that thought is its own horror)`);
        s._nightmareWarned = true;
      } else {
        const lines = [
          `Easier this time. That's what frightens you, in the quiet moments. (+${trauma} trauma)`,
          `Your hands don't shake anymore. You remember when they did. (+${trauma} trauma)`,
          `It tastes like meat. That's the whole problem — it just tastes like meat. (+${trauma} trauma)`,
        ];
        this.say(lines[Math.floor(R() * lines.length)]);
      }
      if (horrified.length) {
        try { this.observe('cannibalism', {}); } catch (e) {}
        try { this.recordCrime('cannibalism', { witnessed: true }); } catch (e) {}
        if (norm === 'exile') {
          this.say('They watched you eat one of us. There is no coming back from their faces. (In a healthy village, this means exile.)');
        } else if (norm === 'horror') {
          this.say('They watched. Nobody moves to stop you — there\'s no strength left for outrage, only horror. Desperation moved the line; it didn\'t erase what you did.');
        } else {
          // power: the quickest source of power. Fear does the talking.
          for (const id of horrified) this.addFear(id, this.villagerId, 30);
          this.say('They watched — and they understood. In a village like this one has become, what you did isn\'t madness. It\'s a résumé. (Fear +30 among witnesses)');
        }
      } else if (wit.length === 0) {
        try { this.recordCrime('cannibalism', { witnessed: false }); } catch (e) {}
        this.say('Nobody saw. The crime stays on the books anyway — unsolved, waiting for someone to ask the right question.');
      }
      for (const id of approving) {
        try {
          this.bumpTrust(id, 4);
          this.remember(id, 'shared_secret', 'they watched you feed and didn\'t look away');
        } catch (e) {}
      }
      if (approving.length) this.say('One of them doesn\'t look away. Later, they\'ll remember that you noticed they didn\'t.');
      this.darkShowBeat(wit.length ? 'cannibalism_witnessed' : 'cannibalism_hidden');
      return true;
    },

    // ============ CRAVINGS (the slope gets steeper) ============
    // At 60+ corruption the hunger has a voice. Abstaining costs.
    cravingTick() {
      try {
        const s = this.state.scholar; if (!s || this.over) return;
        const c = clamp100(s.corruption);
        if (c < 60) return;
        if ((this.dayPart || 0) !== 0) return; // dawn only
        const since = (s.day || 0) - (s.cravingFedDay || 0);
        if (since < 3) return;
        const drain = c >= 85 ? 10 : 6;
        s.energy = Math.max(0, (s.energy || 0) - drain);
        const lines = [
          'The gnawing is back. Ordinary food sits in you like ash. You know what would quiet it.',
          'You catch yourself looking at people the way you used to look at game trails. You hate yourself for the comparison. It doesn\'t stop.',
          'Three days. The hunger has stopped asking and started insisting. (-' + drain + ' energy until fed)',
        ];
        this.say(lines[Math.floor(R() * lines.length)]);
      } catch (e) {}
    },

    // ============ NPC CORRUPTION (bottom-up) ============
    npcDriftTick() {
      try {
        if ((this.dayPart || 0) !== 0) return; // dawn only
        const v = this.state.village || {};
        const starving = this.starvingVillage();
        // the feared set the tone: a highly corrupt figure normalizes
        let topCorr = 0;
        for (const id of (v.roster || [])) topCorr = Math.max(topCorr, clamp100((v.corruption || {})[id]));
        if (topCorr < 60 && !starving) return;
        for (const id of (v.roster || [])) {
          if (id === this.villagerId) continue;
          let vp = null; try { vp = this.vpOf(id); } catch (e) {}
          if (vp && vp.dead) continue;
          this.addNpcCorruption(id, 1, starving ? 'hunger erodes' : 'the feared set the tone');
        }
        if (starving) this.say('Hunger is doing its slow work on everyone. The lines get thinner every hungry day.');
      } catch (e) {}
    },
    // npcCannibalTick: rarely, in a starving village, someone crosses the
    // line on their own. Evidence, not a cutscene — discovery detonates later.
    npcCannibalTick() {
      try {
        if ((this.dayPart || 0) !== 0) return;
        if (!this.starvingVillage()) return;
        if (R() > 0.12) return;
        const v = this.state.village || {};
        const corpses = (this.corpses ? this.corpses() : []).filter(c => c.kind === 'person' && !c.buried && !c.butchered && !c.npcFed);
        if (!corpses.length) return;
        const cands = (v.roster || []).filter(id => {
          if (id === this.villagerId) return false;
          let vp = null; try { vp = this.vpOf(id); } catch (e) {}
          if (vp && vp.dead) return false;
          return clamp100((v.corruption || {})[id]) >= 35;
        });
        if (!cands.length) return;
        const vid = cands[Math.floor(R() * cands.length)];
        const c = corpses[Math.floor(R() * corpses.length)];
        c.butchered = true; c.npcFed = vid;
        this.addNpcCorruption(vid, 12, 'fed in the hungry dark');
        // evidence: gnawed remains. Examining the corpse can discover it.
        try { this.seedGossip('cannibalism_rumor', { honest: -20, generous: -15 }, []); } catch (e) {}
        // normalization: the village's line moves a fraction
        v.normShift = (v.normShift || 0) + 1;
      } catch (e) {}
    },
    // discoverNpcCannibalism: the player examines a desecrated corpse and
    // puts it together. Retroactive detonation.
    discoverNpcCannibalism(cid) {
      try {
        const c = (this.corpses ? this.corpses() : []).find(x => x.id === cid);
        if (!c || !c.npcFed || c.npcKnown) return false;
        c.npcKnown = true;
        const vid = c.npcFed;
        const nm = this.displayName ? this.displayName(vid) : 'someone';
        this.say(`The marks on the bones aren't from animals. You know butchering when you see it — and you know whose hands, from the gossip, from the way ${nm} won't meet anyone's eyes. The village will know by nightfall.`);
        try { this.seedGossip('cannibalism', { honest: -30, generous: -20 }, (this.witnesses ? this.witnesses(6) : []) || []); } catch (e) {}
        try { this.bumpTrust(vid, -25); } catch (e) {}
        try { this.remember(vid, 'exposed_cannibal', 'you found what they did to the dead'); } catch (e) {}
        const wit = (this.witnesses ? this.witnesses(3) : []) || [];
        for (const id of wit) this.addFear(id, vid, 15);
        // normalization: seeing it done makes your own line thinner
        const s = this.state.scholar;
        s.cannibalNormFactor = Math.max(0.6, (s.cannibalNormFactor || 1) * 0.9);
        return true;
      } catch (e) { return false; }
    },
    // temptTick: a corrupt villager tempts or pressures the player. Rare.
    temptTick() {
      try {
        if (this.over) return;
        if (R() > 0.05) return;
        const v = this.state.village || {};
        const cands = (v.roster || []).filter(id => {
          if (id === this.villagerId) return false;
          let vp = null; try { vp = this.vpOf(id); } catch (e) {}
          if (vp && vp.dead) return false;
          return clamp100((v.corruption || {})[id]) >= 55;
        });
        if (!cands.length) return;
        const vid = cands[Math.floor(R() * cands.length)];
        const nm = this.displayName ? this.displayName(vid).split(' ')[0] : 'Someone';
        const s = this.state.scholar;
        // an offer: real meat, real choice. Take it or leave it — both are on you.
        const meat = this.humanMeatItem(1);
        s.inventory.push(meat);
        this.say(`${nm} presses a wrapped parcel into your hands without a word. The weight of it tells you everything before you open it. "Eat," they murmur. "No one will know." (They're wrong about that last part — but that's your problem now.)`);
        try { this.remember(vid, 'offered_meat', 'they offered you human meat'); } catch (e) {}
      } catch (e) {}
    },

    // ============ PSYCHO SPAWN ============
    // psychoIntro: you spawned as one of the dark ones. Flashback, inner
    // voice, starting corruption — the fiction acknowledges what you are
    // without handing you a villain manual.
    psychoIntro(char) {
      try {
        const s = this.state.scholar; if (!s || s._psychoIntroFired) return false;
        const dark = char && char.personality && char.personality.dark;
        if (!dark || dark.kind !== 'malicious') {
          // also catch rosterChars form
          const d2 = this.npcDark ? this.npcDark(this.villagerId) : null;
          if (!d2 || d2.kind !== 'malicious') return false;
        }
        const tell = this.darkTellOf(dark && dark.kind === 'malicious' ? dark : this.npcDark(this.villagerId));
        s._psychoIntroFired = true;
        s.darkPath = true;
        if (!s.corruption) s.corruption = 20;
        const first = (char && char.name ? char.name : 'You').split(' ')[0];
        this.say(`FLASHBACK — before the scattering, there was an incident. People who knew you then use careful words about it now. You remember it differently than they do. You remember it clearly.`);
        if (tell && tell.note) {
          let note = tell.note.replace(/\{first\}/g, first).replace(/\{They\}/g, 'You').replace(/\{they\}/g, 'you').replace(/\{their\}/g, 'your').replace(/\{them\}/g, 'you');
          this.say(note);
        }
        if (tell && tell.quirk) this.say(`People will notice: ${tell.quirk}. Let them. It's useful, being underestimated — or feared.`);
        this.say(`INNER VOICE: the others are already afraid. Fear is a kind of respect that doesn't ask for anything back. You could build something here — not on trust. On what people will do to stay on your good side. (Corruption starts at 20. The slope is yours to walk — or not.)`);
        return true;
      } catch (e) { return false; }
    },
    // mantleWatch: the mantle passes to another villager on death. If the
    // new bearer is one of the dark ones, the intro fires for them too.
    // Also: a corrupt NPC's corruption follows them into the player's hands.
    mantleWatch() {
      try {
        const s = this.state.scholar; if (!s) return;
        if (this._lastBearer === this.villagerId) return;
        this._lastBearer = this.villagerId;
        const v = this.state.village || {};
        if (v.corruption && v.corruption[this.villagerId]) {
          s.corruption = clamp100(v.corruption[this.villagerId]);
          delete v.corruption[this.villagerId];
        }
        let char = null;
        try { char = ((this.generatedRoster || []).find(c => c.id === this.villagerId)) || null; } catch (e) {}
        if (!char) { try { char = { personality: { dark: this.npcDark(this.villagerId) } }; } catch (e) {} }
        this.psychoIntro(char || {});
      } catch (e) {}
    },

    // ============ SHOW FRAMING ============
    // darkShowBeat: evil is televised. The audience notices a dark run —
    // ratings, gamblers, dark-lane fans. Villains are good TV.
    darkShowBeat(kind) {
      try {
        if (!this.state.systemArrived) return;
        const lines = {
          threshold60: '"OH. OH. The gamblers are recalculating EVERYTHING. We have a VILLAIN, folks — a real one! Ratings are SPIKING!"',
          threshold85: '"There it is. There IT is. The audience has chosen its favorite monster, and it\'s YOU. The fan mail is... unsettling. We\'re reading all of it on air."',
          cannibalism_witnessed: '"DID YOU SEE THAT?! The censors looked away but WE didn\'t! Clip it! CLIP IT! The dark-lane fans are losing their MINDS!"',
          cannibalism_hidden: '"Something happened out there just now. The cameras caught... hmm. We\'ll enhance that in post. The audience loves a mystery with teeth."',
          fear_reign: '"Look at them obey. Not love — OBEY. There\'s a difference, and the difference is DELICIOUS television."',
        };
        const line = lines[kind];
        if (line && this.sysSay) this.sysSay(line);
      } catch (e) {}
    },
    // darkCarePackage: dark-lane fans send things. Rare, ominous.
    darkCarePackageTick() {
      try {
        if (!this.state.systemArrived) return;
        if ((this.dayPart || 0) !== 0) return;
        const c = clamp100((this.state.scholar || {}).corruption);
        if (c < 60) return;
        const s = this.state.scholar;
        if ((s.day || 0) - (s._darkPackDay || -99) < 5) return;
        if (R() > 0.08) return;
        s._darkPackDay = s.day || 0;
        s.inventory.push(this.humanMeatItem(2));
        this.say('📦 A care package drops from the sky. No parachute — it just falls, like it couldn\'t wait. The note is unsigned: "WE LOVE WHAT YOU\'RE BECOMING. — your dark fans." Inside, wrapped with care: meat. You know what kind. They knew you\'d know.');
      } catch (e) {}
    },

    // nearButcherableCorpse: a person-corpse in butcher range (same node, adjacent cell).
    nearButcherableCorpse() {
      try {
        const s = this.state.scholar;
        return (this.corpses ? this.corpses() : []).find(c =>
          c.kind === 'person' && !c.buried && !c.butchered &&
          c.node.x === this.map.px && c.node.y === this.map.py &&
          Math.max(Math.abs(c.mx - (s.mx || 4)), Math.abs(c.my - (s.my || 4))) <= 1) || null;
      } catch (e) { return null; }
    },
    // ============ PER-PART TICK ============
    corruptionTick() {
      if (this.over) return;
      try { this.mantleWatch(); } catch (e) {}
      try { this.cravingTick(); } catch (e) {}
      try { this.npcDriftTick(); } catch (e) {}
      try { this.npcCannibalTick(); } catch (e) {}
      try { this.temptTick(); } catch (e) {}
      try { this.darkCarePackageTick(); } catch (e) {}
      // fear decays without reinforcement — but slowly. Dread lingers.
      try {
        const d = (this.state.village || {}).dread || {};
        for (const t of Object.keys(d)) for (const vid of Object.keys(d[t])) {
          d[t][vid] = Math.max(0, (d[t][vid] || 0) - 1);
        }
      } catch (e) {}
    },
  };

  Object.assign(G, methods);

  // ============ WRAPS (chain-safe) ============
  (function attach() {
    // FOIL: corruption drags trust gains. The two systems push against each other.
    var _tgp = G.trustGainProgressive;
    if (_tgp) G.trustGainProgressive = function (vid, base) {
      var n = _tgp.call(this, vid, base);
      try {
        if (n > 0) {
          var c = (this.state.scholar && this.state.scholar.corruption) || 0;
          if (c >= 30) n = Math.max(0, Math.round(n * (1 - c / 250)));
        }
      } catch (e) {}
      return n;
    };
    // EAT: human meat routes through the act, never the normal path.
    var _eatOne = G.eatOne;
    if (_eatOne) G.eatOne = function (idx) {
      try {
        var it = (this.state.scholar.inventory || [])[idx];
        if (it && it.plantId === 'meat_human') return this.eatCannibal(idx);
      } catch (e) {}
      return _eatOne.call(this, idx);
    };
    // JUSTICE HEAT: cannibalism/desecration heat is contextual; fear moves the needle.
    var _jh = G.justiceHeat;
    if (_jh) G.justiceHeat = function () {
      var h = 0;
      try { h = _jh.call(this); } catch (e) {}
      try {
        var j = this.justiceState();
        var norm = this.cannibalNorm ? this.cannibalNorm() : 'exile';
        for (var ci = 0; ci < (j.crimes || []).length; ci++) {
          var c = j.crimes[ci];
          if (c.type !== 'cannibalism' && c.type !== 'desecration') continue;
          if (c.witnessed === false) continue; // unsolved — on the books, no heat
          var w = c.caseId ? 0.5 : 1;
          if (c.type === 'cannibalism') h += (norm === 'exile' ? 60 : norm === 'horror' ? 25 : 5) * w;
          else h += (norm === 'power' ? 5 : 20) * w;
        }
        var f = this.avgFearOf ? this.avgFearOf(this.villagerId) : 0;
        if (norm === 'exile' && f >= 50) h += 15;       // they want you gone
        else if (norm === 'power' && f >= 50) h -= 10;  // fear is your shield
      } catch (e) {}
      return Math.max(0, Math.round(h));
    };
    // INTIMIDATE: dread overrides temperament — the fearful obey regardless.
    // Obedience without warmth: it works, and it costs.
    var _int = G.intimidate;
    if (_int) G.intimidate = function (vid) {
      try {
        var dread = this.fearOf ? this.fearOf(vid, this.villagerId) : 0;
        if (dread >= 60 && (this.state.village.roster || []).indexOf(vid) >= 0 && vid !== this.villagerId && !this.tbfight) {
          var dname = this.displayName(vid);
          this.say('👁️ ' + dname + ' looks at you and does the math. Whatever they were going to say dies unsaid.');
          // yield path: reuse the base implementation's cautious branch by
          // temporarily... no — replicate the yield honestly and simply.
          this.tickAction(2);
          var pack = this.packKcal ? this.packKcal(vid) : 0;
          var demand = Math.min(pack, 400 + Math.round(Math.random() * 300));
          if (demand >= 100 && this.packSpend) {
            this.packSpend(vid, demand);
            var units = Math.max(1, Math.round(demand / 150));
            var day = this.state.scholar.day;
            var inv = this.state.scholar.inventory;
            var tmpl = { name: 'Taken rations', kcalEach: 150, units: units, stolen: true, spoilDay: day + 3, desc: 'Taken, not given. Fear took it.' };
            var stack = null;
            try { stack = inv.find(function (i) { return i.stolen && !i.bonded; }); } catch (e) {}
            if (stack) stack.units += units; else inv.push(tmpl);
            this.say('😶 ' + dname + ' hands it over without a word. No pleading this time — just arithmetic. It\'s worse.');
          } else {
            this.say('😶 ' + dname + ' empties their pockets. There\'s almost nothing. The look they give you isn\'t gratitude — it\'s bookkeeping.');
          }
          try { this.npcNeeds(vid).fear = Math.min(100, (this.npcNeeds(vid).fear || 0) + 20); } catch (e) {}
          try { this.bumpTrust(vid, -15); } catch (e) {}
          try { this.observe('intimidation', { target: vid }); } catch (e) {}
          try { this.recordCrime('intimidation', { victim: vid }); } catch (e) {}
          try { this.remember(vid, 'you_threatened', 'they obeyed out of dread'); } catch (e) {}
          return 'yielded_dread';
        }
      } catch (e) {}
      return _int.call(this, vid);
    };
    // PER-PART: cravings, drift, fear decay, events, mantle watch.
    var _ap = G.advancePart;
    if (_ap) G.advancePart = function () {
      var r = _ap.call(this);
      try { this.corruptionTick(); } catch (e) {}
      return r;
    };
    // NEW GAME: psycho spawn bundle.
    var _ng = G.newGame;
    if (_ng) G.newGame = function (a, b, c, d, e) {
      var r = _ng.call(this, a, b, c, d, e);
      try {
        var char = (this.generatedRoster || []).find(function (x) { return x.id === c; }) || null;
        if (char) this.psychoIntro(char);
        this._lastBearer = this.villagerId;
      } catch (e2) {}
      return r;
    };
    // ROSTER GEN: seed starting corruption for dark NPCs (bottom-up material).
    var _gr = G.genRoster;
    if (_gr) G.genRoster = function (origin) {
      var r = _gr.call(this, origin);
      try {
        var v = this.state ? this.state.village : null;
        for (var i = 0; i < (this.generatedRoster || []).length; i++) {
          var ch = this.generatedRoster[i];
          if (ch && ch.personality && ch.personality.dark && ch.personality.dark.kind === 'malicious') {
            ch._seedCorruption = 15 + Math.floor(Math.random() * 16); // 15-30
          }
        }
        // apply to village map once roster exists (genRoster may run pre-state)
        if (v) {
          v.corruption = v.corruption || {};
          for (var j = 0; j < (this.generatedRoster || []).length; j++) {
            var ch2 = this.generatedRoster[j];
            if (ch2 && ch2._seedCorruption) v.corruption[ch2.id] = ch2._seedCorruption;
          }
        }
      } catch (e) {}
      return r;
    };
  })();
})();
