// @ontology
// system: journal
// description: People journal. Facts fill in as you learn them. Pre-System manual, post-System automatic.
// provides:
//   - journalPerson(vid)
//   - journalLearn(vid, topic)
//   - journalTraitWord(vid)
//   - peopleJournal()
//   - occupationKnown(vid)
//   - occupationLabel(vid)
//   - plantPartsList(pid)
//   - partKnown(pid, partKey)
//   - learnPart(pid, partKey, how)
//   - recordThinKnowledge(pid, text, by)
//   - thickenKnowledge(pid, by)
//   - teacherGreenish(vid)
//   - learnFromShowing(pid, vid, opts)
//   - haulTeachingMoment(items, opts)
//   - codexPlantLine(pid)
//   - knowledgeGaps(pid)
//   - forageCue(pid)
//   - homeFamiliarityLine(pid)
// rules:
//   - pre_system_manual: true (code: journal.js)
//   - parts_are_knowledge: plant parts (roots/leaves/petals) tracked per item; first part learned lifts L1->L2 (code: learnPart, Steve 2026-10-05)
//   - haul_is_curriculum: the haul-return moment teaches from the species carried home, not a random pick; max 2 demonstration lessons per return (code: haulTeachingMoment, Steve 2026-10-05)
//   - thin_knowledge_honest: poor teaching lands as notes, never mechanics; thin=true until a proper lesson confirms it (code: recordThinKnowledge/thickenKnowledge, Steve 2026-10-05)
//   - quality_model_borrowed: teaching quality 0-3 lives in examine.js (sibling-owned); journal calls Scattering.Examine.teachPlant, never reimplements it (code: learnFromShowing)
//   - no_k0_display: progress lines and gap lists return null/[] below L1 — if you don't know, it doesn't show (code: codexPlantLine/knowledgeGaps)
// consumes:
//   - state.journal
//   - state.codex.plants (parts, partials, thin, demonstrated)
//   - Scattering.Examine.teachPlant (sibling-owned quality primitive)
//   - Game.wrongTeaching
//   - Game.data.plants (knowledgeLevels, uses, regions)
// ============ PEOPLE JOURNAL ============
// Facts about people fill in as you learn them. Pre-System it's your
// handwritten field journal — uncertain, personal ("I think she's a nurse?").
// Post-System the Codex gets precise and invasive.
//
// Learning paths: talking to them, hearing about them, observing what they
// do, being introduced. Every new fact gives a little "noted" reward.
// Per-run persistent (lives in state.codex, saved with the run).
//
// Self-attaching module: wraps existing Game methods, no game.js edits.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const day = () => (Game.state.scholar || {}).day || 0;

  const methods = {

    // journalPerson: get (or create) someone's entry.
    journalPerson(vid) {
      const cx = Game.state.codex;
      cx.people = cx.people || {};
      if (!cx.people[vid]) {
        cx.people[vid] = {
          vid, metDay: day(), name: null, occupation: null, goal: null,
          languages: [], backstory: [], traits: [], promises: [], notes: [],
        };
      }
      return cx.people[vid];
    },

    // journalLearn: record a fact. Returns true only when it's genuinely new
    // (or more certain) — that's when the "noted" feedback fires.
    // field: name|occupation|goal|language|backstory|trait|promise|note
    journalLearn(vid, field, value, opts) {
      opts = opts || {};
      const e = this.journalPerson(vid);
      const sys = !!Game.state.systemArrived;
      let isNew = false, label = '';

      const noted = (msg) => {
        // Rewarding, not spammy: only for genuinely new facts.
        this.say(`📓 ${this.journalName()}: ${msg}`);
      };

      if (field === 'name') {
        if (!e.name) {
          e.name = { value, how: opts.how || 'told', day: day() };
          isNew = true; label = `learned ${value}'s name`;
        }
      } else if (field === 'occupation') {
        if (!e.occupation || (!e.occupation.sure && opts.sure)) {
          const was = e.occupation && e.occupation.value;
          e.occupation = { value, sure: !!opts.sure, day: day() };
          isNew = !was || was !== value || (!e.occupation.sure && opts.sure);
          label = opts.sure ? `learned what ${e.name ? e.name.value : 'they'} does` : `a guess about what they do`;
        }
      } else if (field === 'goal') {
        const gid = value && value.id ? value.id : value;
        const want = value && value.want ? value.want : Game.goalWant(vid);
        if (!e.goal || e.goal.id !== gid) {
          e.goal = { id: gid, want, day: day() };
          isNew = true; label = `learned what they want`;
        }
      } else if (field === 'language') {
        if (!e.languages.find(l => l.id === value.id)) {
          e.languages.push({ id: value.id, label: value.label, day: day() });
          isNew = true; label = `noted a language they speak`;
        }
      } else if (field === 'backstory' || field === 'trait' || field === 'note') {
        const key = field === 'note' ? 'notes' : field === 'trait' ? 'traits' : 'backstory';
        const arr = e[key];
        if (!arr.find(x => x.text === value)) {
          arr.push({ text: value, day: day(), via: opts.via || 'talk', sure: opts.sure !== false });
          if (arr.length > 12) arr.shift();
          isNew = true;
          label = field === 'trait' ? `noticed something about them` : `jotted down what they said`;
        }
      } else if (field === 'promise') {
        const ex = e.promises.find(p => p.text === value.text);
        if (!ex) {
          e.promises.push({ text: value.text, status: 'open', day: day() });
          isNew = true; label = `a promise you made`;
        } else if (value.status && ex.status !== value.status) {
          ex.status = value.status;
          isNew = true; label = value.status === 'kept' ? `a promise you kept` : `a promise you broke`;
        }
      }

      if (isNew && !opts.quiet) {
        const who = e.name ? e.name.value : Game.personDescriptor(vid);
        noted(sys ? `${who} — ${label}. Filed.` : `${label} (${who}).`);
      }
      return isNew;
    },

    // peopleJournal: entries for the Codex screen, met-order.
    peopleJournal() {
      const cx = Game.state.codex || {};
      const v = Game.state.village || {};
      const roster = (v.roster || []).filter(id => id !== Game.villagerId);
      return roster.map(vid => {
        const e = this.journalPerson(vid);
        return { vid, e };
      }).sort((a, b) => (a.e.metDay || 0) - (b.e.metDay || 0));
    },

    // occupationKnown: gated like names (Steve 2026-10-06). Learned via
    // talk ('past' topic), gossip, or confession — or given by the System
    // overlay post-arrival. Read-only: never creates journal entries.
    occupationKnown(vid) {
      if (Game.state.systemArrived) return true;
      const p = (Game.state.codex.people || {})[vid];
      return !!(p && p.occupation && p.occupation.value);
    },

    // occupationLabel: display string for a villager's occupation, or null
    // when unknown. Unsure claims keep their "?" — honest, never "???".
    occupationLabel(vid) {
      if (Game.state.systemArrived) {
        const v = (Game.data.villagers || []).find(x => x.id === vid)
          /* unified: hydrated seeds are in villagers */ || {};
        return v.formerOccupation || null;
      }
      const p = (Game.state.codex.people || {})[vid];
      const o = p && p.occupation;
      if (!o || !o.value) return null;
      return o.sure ? o.value : o.value + '?';
    },

    // journalTraitWord: temperament in plain observed language.
    journalTraitWord(vid) {
      const t = Game.npcTemper(vid);
      return {
        bold: 'Takes charge. Doesn\'t wait to be asked.',
        cautious: 'Careful. Thinks before moving.',
        warm: 'Kind without trying. People lean toward them.',
        prickly: 'Sharp edges. Don\'t take it personally — probably.',
        steady: 'Solid. The kind you want nearby when things go wrong.',
        restless: 'Can\'t sit still. Always moving, always doing.',
        dry: 'Funny in a way that takes a second to land.',
        gentle: 'Soft-spoken. Listens more than talks.',
        intense: 'Burns bright. A lot, all at once.',
        withdrawn: 'Keeps to themselves. Hard to read.',
      }[t] || null;
    },

    // ============ KNOWLEDGE LEVELS — parts, thin knowledge, haul moments ============
    // Steve 2026-10-05 design: knowing a name is only the start. Deeper levels
    // cover tasting, cooking/processing, and plant PARTS — dandelion roots,
    // leaves, petals with distinct uses. Good teaching, SHOWN properly with a
    // specimen in hand, unlocks instantly; poor teaching is only a partial
    // reveal. Returning to haven with a new haul is the KEY teaching moment.
    //
    // ---- WIRING POINTS (game.js / app.js read this — journal.js edits no other file) ----
    // 1. game.js :: returnToVillage(), TEACHING MOMENT block: the unprocessed
    //    haul is staged onto the counter (prepStash) just above that block.
    //    Teach FROM THE HAUL, not from a random known-species pick:
    //      this.haulTeachingMoment(this.prepStash().slice(-staged));
    //    The species the player carried home IS the curriculum. Lessons are
    //    demonstrations (specimen in hand), capped at 2 per return — a moment,
    //    not a dump.
    // 2. game.js :: teachPlant(vid, plantId) / firesideTeaching(): player-side
    //    learning already routes through Scattering.Examine.teachPlant
    //    (sibling-owned, quality-gated). After any such lesson, call
    //    this.learnFromShowing(pid, vid, {shown:true|false, via:'taught'})
    //    so the PARTS layer and thin-knowledge bookkeeping land too.
    // 3. app.js :: Codex screen: per-item line via this.codexPlantLine(pid),
    //    honest gaps via this.knowledgeGaps(pid). null/[] below L1 — "if you
    //    don't know, it doesn't show."
    // 4. app.js :: forage/grid: L2+ coaching via this.forageCue(pid) — known
    //    parts and uses only, never a hint at unknown parts.
    //
    // The teaching-quality MODEL lives in examine.js (teachQuality 0-3,
    // sibling-owned): journal.js calls it via Scattering.Examine.teachPlant
    // and never reimplements it. The synergy ledger lives in progression.js
    // (sibling-owned): never touched here.

    // plantPartsList(pid): the parts of a plant, parsed from data.
    // knowledgeLevels['2'] carries the design's parts line ("Parts: roots
    // (roast for coffee), young leaves (salad), petals (tea)"). Parsed into
    // [{key, use}]; falls back to uses[] when data has no parts line.
    // Pure read — never grants knowledge, so it can't leak.
    plantPartsList(pid) {
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return [];
      const out = [];
      const kl2 = (p.knowledgeLevels || {})['2'] || '';
      const m = String(kl2).match(/[Pp]arts\s*:\s*([^.]+)/);
      if (m) {
        for (const seg of m[1].split(/[,;]/)) {
          const sm = seg.trim().match(/^([^(]+?)\s*(?:\(([^)]*)\))?\s*$/);
          if (sm && sm[1] && sm[1].trim()) {
            const key = sm[1].trim().toLowerCase();
            // "Don't take old leaves (bitter)" style negatives aren't parts —
            // skip imperative clauses.
            if (!/^(don't|never|avoid|not)\b/.test(key)) out.push({ key, use: (sm[2] || '').trim() });
          }
        }
      }
      if (out.length) return out;
      return (p.uses || []).map(u => ({ key: String(u.kind || 'use').toLowerCase(), use: u.note || '' }));
    },

    // partKnown(pid, partKey): has the player learned this part's use?
    // Read-only: never creates entries (codex honesty).
    partKnown(pid, partKey) {
      const e = (this.state.codex.plants || {})[pid];
      return !!(e && e.parts && e.parts[partKey] && e.parts[partKey].known);
    },

    // learnPart(pid, partKey, how): record that a part's use is known.
    // The first part learned lifts L1 -> L2 — the use IS the part. Fires a
    // say-line so the progression has FEEL, not just a number moving.
    learnPart(pid, partKey, how) {
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return false;
      if (!this.plantKnown(pid)) {
        if (!this.identifyPlant(pid, 'shown', null)) return false;
      }
      const e = this.state.codex.plants[pid];
      e.parts = e.parts || {};
      if (e.parts[partKey] && e.parts[partKey].known) return false;
      e.parts[partKey] = { known: true, how: how || 'shown', day: day() };
      const all = this.plantPartsList(pid);
      const n = all.filter(pt => e.parts[pt.key] && e.parts[pt.key].known).length;
      if ((e.level || 1) < 2) {
        e.level = 2;
        const kl2 = (p.knowledgeLevels || {})['2'];
        this.say(`\u2605 ${p.name}: a part you know how to use. Level 2.${kl2 ? ' ' + kl2 : ''}`);
      } else {
        this.say(`Noted: ${p.name} ${partKey} — ${n} of ${all.length} parts known.`);
      }
      return true;
    },

    // recordThinKnowledge(pid, text, by): poor teaching lands as a PARTIAL
    // reveal — a note, never a mechanic. thin=true marks the entry: the
    // Codex is honest that this knowledge is unconfirmed.
    recordThinKnowledge(pid, text, by) {
      if (!this.plantKnown(pid)) return false;
      const e = this.state.codex.plants[pid];
      e.partials = e.partials || [];
      if (e.partials.some(x => x.text === text)) return false;
      e.partials.push({ text, by: by || 'someone', day: day() });
      e.thin = true;
      return true;
    },

    // thickenKnowledge(pid, by): a proper lesson over thin knowledge. The
    // confirmation beat — "you'd heard; now you've SEEN."
    thickenKnowledge(pid, by) {
      const e = (this.state.codex.plants || {})[pid];
      if (!e || !e.thin) return false;
      e.thin = false;
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      this.say(`Confirmed: ${p.name || pid}. You'd only heard it third-hand${by ? ` — ${by} showed you proper` : ''}. Now it's solid.`);
      return true;
    },

    // teacherGreenish(vid): occupation-fit teachers, mirroring examine.js's
    // teacherIsGreen so haul ranking matches the quality model.
    teacherGreenish(vid) {
      try {
        const vp = (this.vpOf ? this.vpOf(vid) : (this.data.villagers || []).find(x => x.id === vid)) || {};
        return /botanist|herbalist|forager|gardener|naturalist|ranger/.test(String(vp.formerOccupation || '').toLowerCase());
      } catch (err) { return false; }
    },

    // learnFromShowing(pid, vid, opts): THE demonstration lesson. Someone
    // shows you the actual plant — the haul moment, or a deliberate lesson.
    // Routes the teaching through the sibling-owned quality primitive
    // (Scattering.Examine.teachPlant: quality 0-3), then layers the journal-
    // owned parts/thin bookkeeping on top. Returns {quality, level, parts, outcome}.
    learnFromShowing(pid, vid, opts) {
      opts = opts || {};
      const out = { quality: 0, level: 0, parts: 0, outcome: 'none' };
      const Ex = (globalThis.Scattering || {}).Examine;
      if (!Ex || !Ex.teachPlant) return out;
      // BAD KNOWLEDGE first: the game owns wrong-teaching (game.js).
      if (this.wrongTeaching) {
        try {
          const wt = this.wrongTeaching(vid, pid, opts.via || 'shown');
          if (wt) { out.outcome = wt; return out; }
        } catch (err) {}
      }
      const r = Ex.teachPlant(pid, vid, { shown: opts.shown !== false, hearsay: !!opts.hearsay });
      out.quality = r.quality || 0;
      const e = (this.state.codex.plants || {})[pid];
      out.level = (e && e.level) || 0;
      if (!r.taught) { out.outcome = r.reason || 'not taught'; return out; }
      const tname = this.displayName ? this.displayName(vid) : 'your teacher';
      if (out.quality >= 3) {
        // SHOWN PROPERLY: "goes through the parts one by one" — every part
        // is now known. Thin knowledge, if any, is confirmed solid.
        const ee = this.state.codex.plants[pid];
        ee.demonstrated = true; ee.demonstratedBy = tname;
        this.thickenKnowledge(pid, tname);
        let n = 0;
        for (const pt of this.plantPartsList(pid)) if (this.learnPart(pid, pt.key, 'shown')) n++;
        out.parts = n; out.outcome = 'shown-deep';
      } else if (out.quality <= 1 && r.hearsay) {
        // POOR TEACHING: a partial reveal only. A note, not a mechanic —
        // honest about what it isn't.
        const p = (this.data.plants || []).find(x => x.id === pid) || {};
        const unk = this.plantPartsList(pid).find(pt => !this.partKnown(pid, pt.key));
        const note = unk
          ? `Heard ${tname} say the ${unk.key} might be the useful bit — unconfirmed.`
          : `Heard ${tname} mention ${p.name || pid} in passing — thin knowledge.`;
        this.recordThinKnowledge(pid, note, tname);
        out.outcome = 'thin';
      } else {
        out.outcome = 'named';
      }
      return out;
    },

    // haulTeachingMoment(items, opts): THE KEY TEACHING MOMENT (Steve
    // 2026-10-05). You come home with a haul; the haul goes on the counter;
    // people gather and look at WHAT YOU ACTUALLY CARRIED. The species in the
    // haul are the curriculum — not a random known-species pick. Lessons are
    // demonstrations (specimen in hand), capped at 2 per return: a moment,
    // not a dump. Skips species you already know deep (L3+), teachers you
    // don't trust, and teachers who don't know the species.
    haulTeachingMoment(items, opts) {
      opts = opts || {};
      const lessons = [];
      const v = this.state.village || {};
      const seen = {};
      const haulPids = [];
      for (const it of (items || [])) {
        const pid = it && it.plantId;
        if (!pid || seen[pid]) continue;
        if (String(pid).indexOf('meat_') === 0) continue; // meat teaches via the monster codex, not here
        if (!(this.data.plants || []).some(p => p.id === pid)) continue;
        seen[pid] = true; haulPids.push(pid);
      }
      const myLevel = (pid) => ((this.state.codex.plants || {})[pid] || {}).level || 0;
      const cands = [];
      for (const pid of haulPids) {
        if (myLevel(pid) >= 3) continue;
        const teachers = (v.roster || []).filter(rid =>
          rid !== this.villagerId &&
          ((v.trust || {})[rid] || 0) > 30 &&
          (((v.taught || {})[rid] || []).includes(pid)));
        if (!teachers.length) continue;
        // greenest, most-trusted teacher first — matches the quality model
        teachers.sort((a, b) =>
          ((this.teacherGreenish(b) ? 1 : 0) - (this.teacherGreenish(a) ? 1 : 0)) ||
          (((v.trust || {})[b] || 0) - (((v.trust || {})[a] || 0) || 0)));
        cands.push({ pid, vid: teachers[0] });
      }
      // biggest unknowns first: unnamed species before deepening
      cands.sort((a, b) => myLevel(a.pid) - myLevel(b.pid));
      const maxLessons = opts.maxLessons || 2;
      for (const c of cands.slice(0, maxLessons)) {
        const p = (this.data.plants || []).find(x => x.id === c.pid) || {};
        const tname = this.displayName ? this.displayName(c.vid) : 'someone';
        const pname = this.plantKnown(c.pid) ? p.name : (p.description || 'a plant');
        this.say(`You lay out the haul. ${tname} leans over the ${pname}. "Oh — THAT one. Here, look."`);
        const r = this.learnFromShowing(c.pid, c.vid, { shown: true, via: 'haul' });
        lessons.push({ pid: c.pid, vid: c.vid, quality: r.quality, level: r.level, outcome: r.outcome });
      }
      const teachable = haulPids.filter(pid => myLevel(pid) < 3);
      if (!lessons.length && teachable.length) {
        // HONEST, not silent: nobody could teach from this haul.
        this.say(`Nobody at the fire knows your haul any better than you do. It'll be your own hands that teach you.`);
      }
      return { lessons };
    },

    // codexPlantLine(pid): the entry's progress in one honest line. null at
    // k0 — "if you don't know, it doesn't show."
    codexPlantLine(pid) {
      const e = (this.state.codex.plants || {})[pid];
      if (!e || (e.level || 0) < 1) return null;
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      const lvl = e.level || 1;
      const bits = [];
      bits.push(e.thin ? 'thin knowledge — heard, not confirmed' : `L${lvl}${lvl >= 4 ? ' (mastered)' : ''}`);
      const parts = this.plantPartsList(pid);
      if (parts.length) {
        const known = parts.filter(pt => this.partKnown(pid, pt.key)).map(pt => pt.key);
        const rest = parts.length - known.length;
        bits.push(known.length ? `parts: ${known.join(', ')}${rest ? ` (+${rest} unknown)` : ' (all)'}` : 'parts: unknown');
      }
      bits.push((e.tastings || 0) > 0 || lvl >= 3 ? 'tasted' : 'untasted');
      if ((e.partials || []).length) bits.push(`${e.partials.length} unconfirmed note${e.partials.length > 1 ? 's' : ''}`);
      const by = e.demonstratedBy ? ` — shown by ${e.demonstratedBy}` : e.by ? ` — ${e.by}` : '';
      return `${p.name || pid}${by}: ${bits.join('; ')}.`;
    },

    // knowledgeGaps(pid): what you still DON'T know, in plain words. Never
    // leaks uses of unknown parts — an unknown part is "unexamined", never
    // described. [] at k0.
    knowledgeGaps(pid) {
      const e = (this.state.codex.plants || {})[pid];
      if (!e || (e.level || 0) < 1) return [];
      const gaps = [];
      const lvl = e.level || 1;
      if (lvl < 2) gaps.push(`You don't know a single use for it yet.`);
      for (const pt of this.plantPartsList(pid)) {
        if (!this.partKnown(pid, pt.key)) gaps.push(`Its ${pt.key} — unexamined.`);
      }
      if (lvl < 3 && !(e.tastings > 0)) gaps.push(`You haven't tasted it.`);
      if (lvl < 4) gaps.push(`Far from mastery — harvest and handle it more.`);
      if (!e.demonstrated && lvl < 3) gaps.push(`Nobody's ever shown you one properly.`);
      if (e.thin) gaps.push(`What you "know" is hearsay — get it confirmed.`);
      return gaps;
    },

    // forageCue(pid): L2+ coaching for the forage/grid UI — the known pattern,
    // spelled out. Known parts and uses only. null below L2.
    forageCue(pid) {
      const e = (this.state.codex.plants || {})[pid];
      if (!e || (e.level || 0) < 2) return null;
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      const knownParts = this.plantPartsList(pid).filter(pt => this.partKnown(pid, pt.key));
      const cue = knownParts.length
        ? `Take the ${knownParts.map(pt => pt.key + (pt.use ? ` (${pt.use})` : '')).join(', ')}.`
        : 'You know it has uses — handle it to remember which parts.';
      let uses = '';
      try { if (this.plantUsesText) uses = this.plantUsesText(pid); } catch (err) {}
      return `${p.name || pid} (known${uses ? ', ' + uses : ''}): ${cue}`;
    },

    // homeFamiliarityLine(pid): regional familiarity as FEEL. Your background
    // taught you some plants (village.taught[villagerId]); this land's regions
    // may overlap your origin. Honest about foreignness — never a hint.
    homeFamiliarityLine(pid) {
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      const v = this.state.village || {};
      const mine = (v.taught || {})[this.villagerId] || [];
      if (mine.includes(pid)) return 'Your old life taught you this one. It feels familiar in your hands.';
      let tags = [];
      try {
        if (this.state.scholar && this.state.scholar.originTags) tags = this.state.scholar.originTags;
      } catch (err) {}
      const tl = tags.map(t => String(t).toLowerCase());
      const pr = (p.regions || []).map(r => String(r).toLowerCase());
      if (tl.length && pr.some(r => tl.includes(r))) return `This grows where you're from. You half-remember it — it'll come faster.`;
      return `Nothing in your past names this. This land is foreign to you; it'll take proper showing.`;
    },
  };

  Object.assign(Game, methods);

  // ---- learning hooks: wrap, don't edit ----

  // 1. Names — told, overheard, or gestured.
  const origReveal = Game.revealName;
  Game.revealName = function (vid, how) {
    const r = origReveal.call(this, vid, how);
    if (r) {
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        /* unified: hydrated seeds are in villagers */ || {};
      const first = (vp.name || 'Someone').split(' ')[0];
      const howText = how === 'overheard' ? 'overheard by the fire' : how === 'gesture' ? 'exchanged in gestures' : 'they told me';
      this.journalLearn(vid, 'name', first, { how: howText });
    }
    return r;
  };

  // 2. Goals & past — from real conversation.
  const origAskTopic = Game.convoAskTopic;
  if (origAskTopic) Game.convoAskTopic = function (vid, topic) {
    const line = origAskTopic.call(this, vid, topic);
    try {
      if (topic === 'goal') {
        const gid = this.npcGoal(vid);
        const gdef = (this.data.characterGen.goals || []).find(g => g.id === gid);
        if (gdef) this.journalLearn(vid, 'goal', { id: gid, want: gdef.want }, {});
      } else if (topic === 'past') {
        // DEFLECTED PAST LEAK FIX (Steve 2026-10-06): a villager who shuts
        // down ("I don't talk about before") teaches NOTHING — the old hook
        // journaled their true occupation anyway, handing the player earned
        // knowledge the conversation explicitly refused. pastDeflected is set
        // only in the deflect branch and reset at convo start, so it's a
        // reliable signal for exactly this ask.
        let deflected = false;
        try { deflected = !!(this.convoGet(vid) || {}).pastDeflected; } catch (e) {}
        if (!deflected) {
          const vp = (this.data.villagers || []).find(x => x.id === vid)
            /* unified: hydrated seeds are in villagers */ || {};
          if (vp.formerOccupation) this.journalLearn(vid, 'occupation', vp.formerOccupation, { sure: true, via: 'talk' });
          if (vp.homeRegion) this.journalLearn(vid, 'backstory', `From ${vp.homeRegion}.`, { via: 'talk' });
        }
      }
    } catch (e) {}
    return line;
  };

  // 3. Legacy askAbout path (same facts, deduped by journalLearn).
  const origAskAbout = Game.askAbout;
  if (origAskAbout) Game.askAbout = function (vid, topic) {
    const r = origAskAbout.call(this, vid, topic);
    try {
      if (r && r.ok && topic === 'goal') {
        const gid = this.npcGoal(vid);
        const gdef = (this.data.characterGen.goals || []).find(g => g.id === gid);
        if (gdef) this.journalLearn(vid, 'goal', { id: gid, want: gdef.want }, { quiet: true });
      }
    } catch (e) {}
    return r;
  };

  // 4. Languages — discovered in that first conversation.
  const origStartConvo = Game.startConvo;
  if (origStartConvo) Game.startConvo = function (vid) {
    const v = this.state.village;
    const firstMet = !(v.met || {})[vid];
    const st = origStartConvo.call(this, vid);
    try {
      if (firstMet && st) {
        const comm = this.commLevel(vid);
        const defs = (this.data.characterGen || {}).languages || [];
        if (comm.level === 'none') {
          this.journalLearn(vid, 'language', { id: '__none', label: 'no shared words — gestures only' }, { quiet: true });
        } else if (comm.lang) {
          const d = defs.find(l => l.id === comm.lang);
          this.journalLearn(vid, 'language', { id: comm.lang, label: d ? `${d.icon} ${d.name}` : comm.lang }, { quiet: true });
        }
        // After a couple of real talks, temperament shows through.
        const c = this.convoGet(vid);
        if (c.count >= 2) {
          const w = this.journalTraitWord(vid);
          if (w) this.journalLearn(vid, 'trait', w, { via: 'observed', sure: false, quiet: true });
        }
      }
    } catch (e) {}
    return st;
  };

  // 5. Promises — made, kept, broken.
  const origPromise = Game.promiseHelp;
  if (origPromise) Game.promiseHelp = function (vid) {
    const r = origPromise.call(this, vid);
    try {
      if (r) {
        const want = this.goalWant(vid) || 'something';
        this.journalLearn(vid, 'promise', { text: `Help them ${want}` }, {});
      }
    } catch (e) {}
    return r;
  };

  const origCheckPromises = Game.checkPromises;
  if (origCheckPromises) Game.checkPromises = function (kind) {
    const before = {};
    for (const [vid, p] of Object.entries((this.state.village.promises || {}))) before[vid] = p.kept;
    const r = origCheckPromises.call(this, kind);
    try {
      for (const [vid, p] of Object.entries((this.state.village.promises || {}))) {
        if (before[vid] !== p.kept) {
          const want = this.goalWant(vid) || 'something';
          this.journalLearn(vid, 'promise',
            { text: `Help them ${want}`, status: p.kept === true ? 'kept' : 'broken' }, {});
        }
      }
    } catch (e) {}
    return r;
  };

  // 6. Observed deeds — what they DO goes in the book, not just what they say.
  // Mining the village memory: gifts, rescues, teaching.
  const origEndDay = Game.endDay;
  if (origEndDay) Game.endDay = function () {
    const r = origEndDay.call(this);
    try {
      const mem = (this.state.village.memory || {});
      for (const [vid, ms] of Object.entries(mem)) {
        for (const m of ms.slice(-4)) {
          if (m.journaled) continue;
          m.journaled = true;
          if (m.t === 'gift') this.journalLearn(vid, 'trait', 'Generous — shares without being asked.', { via: 'observed', sure: true, quiet: true });
          else if (m.t === 'saved') this.journalLearn(vid, 'trait', 'Brave — stepped in when it mattered.', { via: 'observed', sure: true, quiet: true });
          else if (m.t === 'taught') this.journalLearn(vid, 'note', `Taught me something: ${m.note || 'a skill'}.`, { via: 'observed', quiet: true });
        }
      }
    } catch (e) {}
    return r;
  };
})();
