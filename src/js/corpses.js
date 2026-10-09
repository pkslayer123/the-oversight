// @ontology
// system: corpses
// description: Corpse system. Dead bodies persist, can be butchered, buried, or left.
// provides:
//   - buryCorpse(cid)
//   - corpseAt(x, y)
//   - corpseDesc(c)
//   - examineCorpse(cid)
//   - lootCorpse(cid)
//   - corpseTakeItem(cid, idx)
//   - corpseUseItem(cid, idx)
//   - corpseEatItem(cid, idx)
//   - registerDeath(vid, cause)
//   - corpseStage(c)
//   - corpseGlyph(c)
//   - knowsDeath(vid)
//   - generatePossessions(vid)
//   - payRespects(cid)
//   - codexDeathSync()
// rules:
//   - (none documented)
// consumes:
//   - state.corpses
/* CORPSE SYSTEM
 *
 * Steve's design: "One of the most essential parts of knowledge is confirming
 * the knowledge of death." Death is knowledge — and bodies persist.
 *
 * 1. CORPSES PERSIST — when a person or monster dies, a corpse entity stays at
 *    the location: who it was, what they carried, when they died.
 * 2. REAL-TIME DECAY — fresh -> stiff -> bloating -> rotting -> bones, on the
 *    game clock. Each stage changes the description, what's lootable, disease
 *    risk, and grossness.
 * 3. LOOTING HAS WEIGHT — bodies are lootable, but looting the dead costs
 *    trauma scaled by how well you knew them and how fresh they are. The
 *    existing trauma system carries it; no second system. Fresh is worse
 *    mentally, safer physically; rotten is the reverse.
 * 4. DISEASE FROM ROT — handling bloating+ corpses risks illness (existing
 *    disease pattern: honest roll, health damage, a message).
 * 5. DEATH IS KNOWLEDGE — confirming a death is a knowledge event. Early you
 *    learn by witnessing, finding the body, or being told. When the codex
 *    reaches attunement 2, death knowledge syncs in real time — the codex
 *    just knows, no checking or asking required.
 * 6. PARTY AUTO-NOTIFY — party members' deaths tell you immediately.
 * 7. SOCIAL CONSEQUENCES — looting a fresh person-corpse where others can see
 *    costs trust and seeds gossip. The village watches.
 *
 * Humane, not edgy: the grossness serves weight. Death should feel like
 * death, not a loot pinata. No gore for gore's sake; the horror is recognition.
 *
 * Self-attaching module: attaches methods to Game. game.js gets tiny hooks
 * in tbDamage's death branches (marked CORPSE SYSTEM). app.js renders corpse
 * glyphs + cell-tap actions. index.html loads this after food.js.
 */
(function () {
  'use strict';
  const G = (typeof globalThis !== 'undefined' && globalThis.Scattering && globalThis.Scattering.Game)
    ? globalThis.Scattering.Game
    : (typeof Game !== 'undefined' ? Game : null);
  if (!G) return;

  // ---------- decay ----------

  // stages by days since death. Real time = game clock.
  var STAGES = [
    { id: 'fresh',    until: 1, diseaseP: 0.02, diseaseDmg: 4,  traumaMult: 1.5,
      glyphPerson: '😔', glyphMonster: '👹', glyphAnimal: '🐾' },
    { id: 'stiff',    until: 2, diseaseP: 0.05, diseaseDmg: 6,  traumaMult: 1.25,
      glyphPerson: '😔', glyphMonster: '👹', glyphAnimal: '🐾' },
    { id: 'bloating', until: 4, diseaseP: 0.15, diseaseDmg: 10, traumaMult: 1.0,
      glyphPerson: '😵', glyphMonster: '💀', glyphAnimal: '💀' },
    { id: 'rotting',  until: 8, diseaseP: 0.25, diseaseDmg: 14, traumaMult: 0.7,
      glyphPerson: '😵', glyphMonster: '💀', glyphAnimal: '💀' },
    { id: 'bones',    until: 1e9, diseaseP: 0.03, diseaseDmg: 4, traumaMult: 0.4,
      glyphPerson: '🦴', glyphMonster: '🦴', glyphAnimal: '🦴' },
  ];

  var methods = {

    // ---------- storage ----------

    corpses() {
      this.state.corpses = this.state.corpses || [];
      return this.state.corpses;
    },

    corpseStage(c) {
      const days = (this.state.scholar.day || 0) - (c.dayDied || 0);
      for (let i = 0; i < STAGES.length; i++) {
        if (days < STAGES[i].until) return i;
      }
      return STAGES.length - 1;
    },

    corpseStageInfo(c) { return STAGES[this.corpseStage(c)]; },

    corpseAt(cx, cy) {
      const px = this.map.px, py = this.map.py;
      return this.corpses().filter(c =>
        !c.buried && c.node.x === px && c.node.y === py && c.mx === cx && c.my === cy);
    },

    corpseGlyph(c) {
      const st = this.corpseStageInfo(c);
      if (c.kind === 'person') return st.glyphPerson;
      if (c.kind === 'monster') return st.glyphMonster;
      return st.glyphAnimal;
    },

    // ---------- death registration ----------

    // fightWitnesses: who's alive and present when someone dies in combat.
    // Villagers in the fight + the player (you saw it happen).
    fightWitnesses(excludeVid) {
      const out = [];
      try {
        const f = this.tbfight;
        if (!f) return out;
        for (const o of f.fighters) {
          if (!o.alive || o.fled) continue;
          if (o.kind === 'villager' && o.villagerId && o.villagerId !== excludeVid) out.push(o.villagerId);
        }
        // you were there
        if (this.villagerId && this.villagerId !== excludeVid) out.push(this.villagerId);
      } catch (e) {}
      return out;
    },

    // registerDeath: THE hook. Call whenever someone/something dies.
    // opts: {kind:'person'|'monster'|'animal', villagerId?, monsterId?, monsterName?,
    //        name, mx, my, cause, killerId?, items?}
    registerDeath(opts) {
      opts = opts || {};
      const s = this.state.scholar;
      const corpse = {
        id: 'corpse_' + (s.day || 0) + '_' + Math.random().toString(36).slice(2, 8),
        kind: opts.kind || 'person',
        name: opts.name || 'someone',
        villagerId: opts.villagerId || null,
        monsterId: opts.monsterId || null,
        descriptor: opts.descriptor || null,
        node: { x: this.map.px, y: this.map.py },
        mx: opts.mx != null ? opts.mx : (s.mx || 4),
        my: opts.my != null ? opts.my : (s.my || 4),
        dayDied: s.day || 0,
        cause: opts.cause || 'combat',
        killerId: opts.killerId || null,
        items: opts.items || this.generatePossessions(opts),
        looted: false,
        buried: false,
        deathKnown: false,
        respectsPaid: false,
        witnesses: opts.witnesses || [],
      };
      const list = this.corpses();
      list.push(corpse);
      // bones persist as markers, but cap the list
      if (list.length > 40) {
        const idx = list.findIndex(c => this.corpseStage(c) === 4);
        if (idx >= 0) list.splice(idx, 1);
      }

      // KNOWLEDGE: did you see it happen?
      const sawIt = (opts.witnesses || []).includes(this.villagerId) || !!opts.youWitnessed;
      if (sawIt) corpse.deathKnown = true;

      // PARTY: your people tell you immediately. No codex stage required.
      this.partyDeathNotify(corpse);

      // CODEX: at attunement 2, death knowledge syncs in real time.
      this.codexDeathSync(corpse);

      // GOSSIP: the village learns, distorted, along social lines.
      if (corpse.kind === 'person' && corpse.witnesses.length) {
        try {
          this.seedGossip('death:' + (corpse.villagerId || corpse.id),
            { victim: corpse.villagerId }, corpse.witnesses.filter(id => id !== this.villagerId));
        } catch (e) {}
      }
      // GRIEF: a villager's death is a village event — this is what makes
      // the grief dialogue fire. Without it, NPCs had nothing to say about
      // the dead (the trigger existed, the event never did).
      if (corpse.kind === 'person' || corpse.kind === 'villager') {
        try {
          if (opts.killerId && opts.killerId === this.villagerId) {
            // Combat kills already fired the witness-gated murder event in
            // tbDamage — firing it here too double-punished (the village
            // reacted twice to one killing). Only non-combat player murders
            // (poison, etc.) fire it from death registration, witness-gated
            // the same way: unseen means unsolved, not broadcast.
            if (opts.cause !== 'combat' && this.villageEvent) {
              const wit = (opts.witnesses || []).filter(id => id !== this.villagerId);
              this.villageEvent('murder', { victim: corpse.villagerId, witnessed: wit.length > 0 });
            }
          } else if (this.villageEvent) {
            this.villageEvent('death');
          }
        } catch (e) {}
      }
      return corpse;
    },

    // possessions: what the dead carried. Practical things + one keepsake.
    // The keepsake is flavor you can take or leave — taking it costs extra.
    generatePossessions(opts) {
      opts = opts || {};
      if (opts.items) return opts.items;
      const items = [];
      const R = Math.random;
      if (opts.kind === 'monster') {
        const mid = opts.monsterId || 'beast';
        const pool = [
          { name: 'Stripped hide', units: 1, kg: 1.5, kcalEach: 0, note: 'Tough. Useful.' },
          { name: 'Gland sac', units: 1, kg: 0.3, kcalEach: 0, note: 'Smells wrong. Alchemists would pay.' },
          { name: 'Teeth', units: 2 + Math.floor(R() * 3), kg: 0.1, kcalEach: 0, note: 'Trophies. Or tools.' },
          { name: 'Sinew cord', units: 1 + Math.floor(R() * 2), kg: 0.2, kcalEach: 0, note: 'Strong fiber.' },
        ];
        const n = 1 + Math.floor(R() * 2);
        for (let i = 0; i < n; i++) {
          const p = pool[Math.floor(R() * pool.length)];
          items.push({ plantId: mid + '_trophy_' + i, name: p.name, units: p.units, kg: p.kg, kcalEach: 0, spoilDay: 9999, prep: p.note });
        }
        return items;
      }
      if (opts.kind === 'animal') {
        return [{ plantId: 'animal_hide', name: 'Hide', units: 1, kg: 1.0, kcalEach: 0, spoilDay: 9999, prep: 'Cure it or lose it.' }];
      }
      // people carry practical things
      const practical = [
        { name: 'Worn knife', kg: 0.4, note: 'Still sharp.' },
        { name: 'Lighter', kg: 0.1, note: 'Half full.' },
        { name: 'Coil of rope', kg: 0.8, note: 'Good rope.' },
        { name: 'Dried meat', kg: 0.3, kcalEach: 400, units: 2, note: 'Their last meal, uneaten.' },
        { name: 'Water bottle', kg: 0.5, note: 'Still sealed.' },
        { name: 'Bandages', kg: 0.2, note: 'Clean. They were careful.' },
        { name: 'Work gloves', kg: 0.3, note: 'Broken in.' },
      ];
      const keepsakes = [
        'A creased photograph, faces smiling',
        'A letter, unsent, in careful handwriting',
        'A wedding ring, worn thin',
        "A child's drawing of a house",
        'A smooth stone, pocket-worn',
      ];
      const shuffled = practical.slice().sort(() => R() - 0.5);
      const n = 2 + Math.floor(R() * 2);
      for (let i = 0; i < n && i < shuffled.length; i++) {
        const p = shuffled[i];
        items.push({ plantId: 'effect_' + i, name: p.name, units: p.units || 1, kg: p.kg, kcalEach: p.kcalEach || 0, spoilDay: 9999, prep: p.note });
      }
      items.push({ plantId: 'keepsake', name: keepsakes[Math.floor(R() * keepsakes.length)], units: 1, kg: 0.1, kcalEach: 0, spoilDay: 9999, keepsake: true, prep: 'Not useful. Not yours. Take it or leave it with them.' });
      return items;
    },

    // ---------- looting ----------

    // LOOT-AS-ACTION (Steve 2026-10-06): no auto-loot. The kill leaves a
    // corpse with an inventory; the player opens the pack deliberately and
    // takes, leaves, or uses per item. These are the per-item primitives —
    // the app.js loot UI calls them. Trauma/disease apply once per corpse
    // (first touch), not per item — the horror is the act, not the count.

    // _corpseFirstTouch(c): trauma + disease on first handling. Idempotent.
    _corpseFirstTouch(c) {
      if (!c || c._touched) return;
      c._touched = true;
      const st = this.corpseStageInfo(c);
      const trauma = this.corpseTrauma(c, {});
      try { this.addTrauma(trauma); } catch (e) {}
      const s = this.state.scholar;
      if (Math.random() < st.diseaseP) {
        s.health = Math.max(0, (s.health || 100) - st.diseaseDmg);
        this.say(`Handling the ${st.id} remains was a mistake. Fever by nightfall. (-${st.diseaseDmg} health)`);
      }
      // WITNESSES: looting a fresh person-corpse where others can see.
      if (c.kind === 'person' && this.corpseStage(c) <= 2) {
        try { this.observe('loot_corpse', { target: c.villagerId }); } catch (e) {}
      }
      if (this.tickAction) this.tickAction(8);
    },

    _corpseCheckRange(c) {
      const s = this.state.scholar;
      if (c.node.x !== this.map.px || c.node.y !== this.map.py ||
          Math.max(Math.abs(c.mx - (s.mx || 4)), Math.abs(c.my - (s.my || 4))) > 1) {
        this.say('Too far — get closer to the body.');
        return false;
      }
      return true;
    },

    // corpseTakeItem(cid, idx): take the whole stack of one item.
    corpseTakeItem(cid, idx) {
      const c = this.corpses().find(x => x.id === cid);
      if (!c || c.buried) { this.say('Nothing there.'); return null; }
      if (!this._corpseCheckRange(c)) return null;
      const it = (c.items || [])[idx];
      if (!it || (it.units == null ? 1 : it.units) <= 0) { this.say('Nothing left of that.'); return null; }
      const units = it.units || 1;
      const kg = (it.kg || 0.3) * units;
      if (this.canCarry && !this.canCarry(kg)) { this.say("Too heavy — your pack can't take it."); return null; }
      this._corpseFirstTouch(c);
      const s = this.state.scholar;
      const inv = s.inventory;
      // FUNGIBILITY (miser break-it 2026-10-08): the old merge keyed on plantId
      // alone — raw corpse meat folded into a cooked pack stack at the cooked
      // kcalEach, minting phantom calories (measured +500 on 2 units). Merge
      // only into a truly identical stack; otherwise it rides separately.
      const ex = inv.find(x => x.plantId === it.plantId && !x.keepsake && !it.keepsake &&
        (!this.stacksMatch || this.stacksMatch(x, it)));
      if (ex && !it.keepsake) ex.units = (ex.units || 1) + units;
      else inv.push(Object.assign({}, it, { units }));
      it.units = 0;
      const nm = this.itemDisplayName ? this.itemDisplayName(it) : (it.name || 'it');
      this.say(`Taken: ${nm} x${units}.`);
      if (!c.items.some(i => (i.units == null ? 1 : i.units) > 0)) {
        c.looted = true;
        this.say('The body is stripped. What\'s left isn\'t worth taking.');
      }
      return it;
    },

    // corpseUseItem(cid, idx): take one unit into your pack, then use it
    // through the normal use path. "Use it on the spot."
    corpseUseItem(cid, idx) {
      const c = this.corpses().find(x => x.id === cid);
      if (!c || c.buried) { this.say('Nothing there.'); return null; }
      if (!this._corpseCheckRange(c)) return null;
      const it = (c.items || [])[idx];
      if (!it || (it.units == null ? 1 : it.units) <= 0) { this.say('Nothing left of that.'); return null; }
      if (!this.isUsable || !this.isUsable(it)) { this.say("You can't use that here."); return null; }
      this._corpseFirstTouch(c);
      const s = this.state.scholar;
      // move one unit to the pack, then use via the standard path
      it.units = (it.units || 1) - 1;
      const copy = Object.assign({}, it, { units: 1 });
      s.inventory.push(copy);
      const invIdx = s.inventory.length - 1;
      try { this.useItem(invIdx); } catch (e) {}
      if (!c.items.some(i => (i.units == null ? 1 : i.units) > 0)) c.looted = true;
      return copy;
    },

    // corpseEatItem(cid, idx): take one unit, eat it on the spot.
    corpseEatItem(cid, idx) {
      const c = this.corpses().find(x => x.id === cid);
      if (!c || c.buried) { this.say('Nothing there.'); return null; }
      if (!this._corpseCheckRange(c)) return null;
      const it = (c.items || [])[idx];
      if (!it || (it.units == null ? 1 : it.units) <= 0) { this.say('Nothing left of that.'); return null; }
      if (!((it.kcalEach || 0) > 0 && it.edible !== false)) { this.say("That's not food."); return null; }
      this._corpseFirstTouch(c);
      const s = this.state.scholar;
      it.units = (it.units || 1) - 1;
      const copy = Object.assign({}, it, { units: 1 });
      s.inventory.push(copy);
      const invIdx = s.inventory.length - 1;
      try { this.eatOne(invIdx); } catch (e) {}
      if (!c.items.some(i => (i.units == null ? 1 : i.units) > 0)) c.looted = true;
      return copy;
    },

    // corpseTrauma: the grossness factor. Existing trauma system carries it.
    // Fresh + knew them well = horrifying. Old bones = just sad.
    // Monsters are field-dressing; people are people.
    corpseTrauma(c, opts) {
      opts = opts || {};
      const st = this.corpseStageInfo(c);
      let base;
      if (c.kind === 'monster') base = 2;
      else if (c.kind === 'animal') base = 1;
      else {
        const trust = ((this.state.village.trust || {})[c.villagerId]) || 10;
        if (trust >= 60) base = 14;       // friend
        else if (trust >= 30) base = 9;   // acquaintance
        else if (trust >= 10) base = 6;   // knew their name
        else base = 4;                    // stranger — still a person
        // party bonds cut deeper
        try {
          if (this.partyMembers && this.partyMembers().includes(c.villagerId)) base += 4;
        } catch (e) {}
        if (this.villagerId === c.killerId) base += 3; // you did this
      }
      let n = base * st.traumaMult;
      if (opts.keepsake) n += 3; // you took the photograph too
      return Math.max(1, Math.round(n));
    },

    // lootCorpse(id, takeAll): search the body. Weight, trauma, disease, witnesses.
    lootCorpse(id, takeAll) {
      const c = this.corpses().find(x => x.id === id);
      if (!c || c.buried) { this.say('Nothing there.'); return null; }
      // must be close: same node, adjacent cell
      const s = this.state.scholar;
      if (c.node.x !== this.map.px || c.node.y !== this.map.py ||
          Math.max(Math.abs(c.mx - (s.mx || 4)), Math.abs(c.my - (s.my || 4))) > 1) {
        this.say('Too far — get closer to the body.'); return null;
      }
      const st = this.corpseStageInfo(c);
      const remaining = c.items.filter(i => (i.units == null ? 1 : i.units) > 0);
      if (!remaining.length) { this.say('Nothing left worth taking.'); return null; }

      const took = [];
      const takeOne = (it) => {
        const kg = (it.kg || 0.3) * 1;
        if (this.canCarry && !this.canCarry(kg)) { this.say('Too heavy — your pack can\'t take it.'); return false; }
        const inv = s.inventory;
        // FUNGIBILITY GATE (break-it food r3 2026-10-08): the old merge keyed
        // on plantId alone — looted low-quality meat folded into a
        // high-quality pack stack kept the pack's kcalEach (value laundering,
        // same class as round 2's F1). Only truly identical stacks merge.
        const ex = (!it.keepsake && this.stacksMatch)
          ? inv.find(x => x.plantId === it.plantId && !x.keepsake && this.stacksMatch(x, it))
          : null;
        if (ex) ex.units = (ex.units || 1) + 1;
        else inv.push(Object.assign({}, it, { units: 1 }));
        it.units -= 1;
        took.push(it);
        return true;
      };

      if (takeAll) {
        for (const it of remaining.slice()) { if (!takeOne(it)) break; }
      } else {
        takeOne(remaining[0]);
      }
      if (!took.length) return null;

      // THE WEIGHT: trauma scaled by knowing them + freshness
      const keepsakeTaken = took.some(t => t.keepsake);
      const trauma = this.corpseTrauma(c, { keepsake: keepsakeTaken });
      this.addTrauma(trauma);

      // DISEASE: handling rot risks illness. Fresh is safer physically.
      // addHealth routing (break-it food r3 2026-10-08): the old direct write
      // bypassed the combat fighter — mid-fight damage was erased at tbEnd.
      if (Math.random() < st.diseaseP) {
        this.addHealth(-st.diseaseDmg);
        this.say(`Handling the ${st.id} remains was a mistake. Fever by nightfall. (-${st.diseaseDmg} health)`);
      }

      // voice: what it felt like
      if (c.kind === 'person') {
        const known = this.nameKnown ? this.nameKnown(c.villagerId) : true;
        const who = known ? this.displayName(c.villagerId) : 'them';
        this.say(`You take ${took.map(t => t.name.toLowerCase()).join(', ')} from ${who}. Your hands know what they did. (+${trauma} trauma)`);
      } else {
        this.say(`Field-dressed: ${took.map(t => t.name.toLowerCase()).join(', ')}. (+${trauma} trauma)`);
      }

      // WITNESSES: looting a fresh person-corpse where others can see.
      // The village watches. Trust hits; gossip carries it.
      if (c.kind === 'person' && this.corpseStage(c) <= 2) {
        try { this.observe('loot_corpse', { target: c.villagerId }); } catch (e) {}
      }

      if (!c.items.some(i => (i.units == null ? 1 : i.units) > 0)) {
        c.looted = true;
        this.say('The body is stripped. What\'s left isn\'t worth taking.');
      }
      // searching a body costs time — the day doesn't pause for this
      if (this.tickAction) this.tickAction(8);
      return took;
    },

    // ---------- examination & rites ----------

    corpseDesc(c) {
      const st = this.corpseStageInfo(c);
      const s = this.state.scholar;
      const days = (s.day || 0) - (c.dayDied || 0);
      const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
      let who;
      if (c.kind === 'person') {
        const known = this.nameKnown ? this.nameKnown(c.villagerId) : true;
        who = known ? this.displayName(c.villagerId) : 'someone you don\'t recognize';
      } else if (c.kind === 'monster') {
        who = c.descriptor || (c.monsterName || 'the beast');
      } else {
        who = c.name;
      }
      const D = {
        fresh: [
          `${who} lies here. Still. It happened ${when}, and the ground hasn't forgotten yet.`,
          `This is ${who}. Was. The word sticks in your throat. ${when}.`,
        ],
        stiff: [
          `${who}. ${when}. Rigor has set in — the body holds the shape of its last moment.`,
        ],
        bloating: [
          `${who}. ${when}. The body is changing. You don't look too long.`,
          `What's left of ${who}. ${when}. The smell tells you before your eyes do.`,
        ],
        rotting: [
          `The remains of ${who}. ${when}. Nature is thorough and unbothered.`,
        ],
        bones: [
          `Bones. ${who}, ${when}. The land kept what mattered and returned the rest.`,
          `Picked clean. ${who} — ${when}. Just the shape of a person now.`,
        ],
      };
      const lines = D[st.id] || D.fresh;
      return lines[Math.floor(Math.random() * lines.length)];
    },

    // examineCorpse: looking closely is a knowledge event. Confirming the death.
    examineCorpse(id) {
      const c = this.corpses().find(x => x.id === id);
      if (!c || c.buried) { this.say('Nothing there.'); return null; }
      this.say(this.corpseDesc(c));
      const st = this.corpseStageInfo(c);
      const remaining = c.items.filter(i => (i.units == null ? 1 : i.units) > 0).length;
      if (remaining && !c.looted) {
        this.say(c.kind === 'person'
          ? `They're still wearing their life: ${remaining} thing${remaining > 1 ? 's' : ''} worth taking. Whether you should is another question.`
          : `The carcass has ${remaining} thing${remaining > 1 ? 's' : ''} worth cutting free.`);
      } else if (c.looted) {
        this.say('Stripped already. Nothing left but the fact of it.');
      }
      if (!c.deathKnown) {
        c.deathKnown = true;
        this.say('You know now. Really know. That\'s its own kind of weight.');
      }
      return c;
    },

    // payRespects: a small rite. Costs a little time, steadies you, and the
    // village notices the difference between this and looting.
    payRespects(id) {
      const c = this.corpses().find(x => x.id === id);
      if (!c || c.buried || c.kind !== 'person') { this.say('Nothing to honor here.'); return null; }
      if (c.respectsPaid) { this.say('You already said your words.'); return null; }
      c.respectsPaid = true;
      const s = this.state.scholar;
      s.trauma = Math.max(0, (s.trauma || 0) - 3);
      const known = this.nameKnown ? this.nameKnown(c.villagerId) : true;
      const who = known ? this.displayName(c.villagerId) : 'them';
      this.say(`You say a few words for ${who}. Not a ceremony — just: you were here, and someone noticed you leaving. (-3 trauma)`);
      try { this.observe('honor_dead', { target: c.villagerId }); } catch (e) {}
      if (this.tickAction) this.tickAction(4);
      return true;
    },

    // buryCorpse: lay them to rest. Removes the corpse, ends the decay.
    buryCorpse(id) {
      const c = this.corpses().find(x => x.id === id);
      if (!c || c.buried || c.kind !== 'person') return null;
      const st = this.corpseStageInfo(c);
      c.buried = true;
      const known = this.nameKnown ? this.nameKnown(c.villagerId) : true;
      const who = known ? this.displayName(c.villagerId) : 'them';
      // burying the rotten is honest work; burying the fresh is heartbreak
      const trauma = Math.max(1, Math.round(this.corpseTrauma(c) * 0.6));
      this.addTrauma(trauma);
      if (Math.random() < st.diseaseP) {
        const s = this.state.scholar;
        s.health = Math.max(0, (s.health || 100) - st.diseaseDmg);
        this.say(`Burying the ${st.id} dead was honest work, and it cost you. Fever by nightfall. (-${st.diseaseDmg} health)`);
      }
      this.say(`You bury ${who}. A marker, of sorts. The village will know where. (+${trauma} trauma)`);
      try { this.observe('bury_dead', { target: c.villagerId }); } catch (e) {}
      if (this.tickAction) this.tickAction(16);
      return true;
    },

    // ---------- death as knowledge ----------

    knowsDeath(c) {
      if (c.deathKnown) return true;
      // party told you, codex synced you, gossip reached you
      return false;
    },

    // codexAttunement: 0 = pre-System (journal only), 1 = System arrived,
    // 2 = attuned — the codex is deeply integrated and syncs on its own.
    // Stage 2: the System is here AND (you've survived 12+ days OR the codex
    // holds real breadth). Documented threshold; tested.
    codexAttunement() {
      if (!this.state.systemArrived) return 0;
      const cx = this.state.codex || {};
      const breadth = Object.keys(cx.plants || {}).length +
        Object.keys(cx.monsters || {}).length +
        Object.keys(cx.skills || {}).length;
      const day = (this.state.scholar || {}).day || 0;
      return (day >= 12 || breadth >= 15) ? 2 : 1;
    },

    maybeAttune() {
      if (this.codexAttunement() === 2 && !this.state.codex._attunedTold) {
        this.state.codex._attunedTold = true;
        this.say('📖 The Codex settles deeper into you. It knows things before you do now. Deaths, especially — it will tell you itself.');
      }
    },

    // codexDeathSync: at attunement 2, the codex updates on its own.
    // No checking, no asking. It just knows, and so do you.
    codexDeathSync(corpse) {
      try { this.maybeAttune(); } catch (e) {}
      if (this.codexAttunement() < 2 || corpse.deathKnown) return false;
      corpse.deathKnown = true;
      const who = corpse.kind === 'person'
        ? (this.displayName ? this.displayName(corpse.villagerId) : corpse.name)
        : (corpse.descriptor || corpse.name);
      this.say(`📖 The Codex turns a page on its own. ${who} is dead. You didn't ask. It knew.`);
      return true;
    },

    // partyDeathNotify: your people tell you immediately. No codex needed.
    partyDeathNotify(corpse) {
      let members = [];
      try { members = this.partyMembers ? this.partyMembers() : []; } catch (e) {}
      if (corpse.kind === 'person' && members.includes(corpse.villagerId)) {
        const who = this.displayName ? this.displayName(corpse.villagerId) : corpse.name;
        this.say(`💔 ${who} is dead.`);
        corpse.deathKnown = true;
        return true;
      }
      // a party member saw it happen — they'd tell you
      if (corpse.witnesses.some(w => members.includes(w)) && corpse.kind === 'person') {
        const who = this.displayName ? this.displayName(corpse.villagerId) : corpse.name;
        this.say(`Someone in your party saw it happen. ${who} is dead. They tell you straight.`);
        corpse.deathKnown = true;
        return true;
      }
      return false;
    },
  };

  Object.assign(G, methods);
})();
