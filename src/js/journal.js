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
//   - journalPlantEntries(pid)
//   - writePlantEntry(pid, kind, text)
//   - plantJournalEntry(pid)
//   - marginaliaFor(pid)
//   - recordPlantMark(pid, kind, note)
//   - plantMarks(pid)
//   - recordLifeMark(kind, note)
//   - lifeMarks()
//   - mantleRecord()
//   - journalVoice()
//   - journalVoiceFor(char)
//   - journalVoiceLine(kind, voice, ctx)
//   - journalTouch(kind)
//   - journalStaleness()
//   - journalOpening()
//   - noteTastings(pid, count, leveled)
//   - noteHungerNight()
//   - writeEpitaph(old, cause)
//   - welcomeBearer(old, cause)
// rules:
//   - pre_system_manual: true (code: journal.js)
//   - parts_are_knowledge: plant parts (roots/leaves/petals) tracked per item; first part learned lifts L1->L2 (code: learnPart, Steve 2026-10-05)
//   - haul_is_curriculum: the haul-return moment teaches from the species carried home, not a random pick; max 2 demonstration lessons per return (code: haulTeachingMoment, Steve 2026-10-05)
//   - thin_knowledge_honest: poor teaching lands as notes, never mechanics; thin=true until a proper lesson confirms it (code: recordThinKnowledge/thickenKnowledge, Steve 2026-10-05)
//   - quality_model_borrowed: teaching quality 0-3 is assessed in learnFromShowing itself (shown-deep=3, named=2, thin=1) over the Game.teachPlant primitive (game.js, sibling-owned); journal never reimplements teaching (code: learnFromShowing)
//   - no_k0_display: progress lines and gap lists return null/[] below L1 — if you don't know, it doesn't show (code: codexPlantLine/knowledgeGaps)
//   - mantle_continuity: dead lives persist as marginalia in their OWN voices; the epitaph is written in the dying life's register, the new hand in the successor's (code: writeEpitaph/welcomeBearer, Steve 2026-10-07)
//   - entries_evolve: sighting -> tasting -> deeper -> part/handling -> mastery entries accrue per plant per life, never rewritten (code: writePlantEntry + identifyPlant/eat/doAction/eatOne wraps, Steve 2026-10-07)
//   - voice_from_lifeseed: the journal's voice (register/mood) reads the lifeseed voice profile — never a hardcoded narrator (code: journalVoice/journalVoiceFor, Steve 2026-10-07)
//   - neglect_honest: staleness is stated plainly when the hand hasn't touched the page; a neglected codex is never silently perfect (code: journalStaleness/journalTouch, Steve 2026-10-07)
//   - marks_reframe: poisoning, hunger, and triumph marks persist and reframe later entries about the same plant (code: recordPlantMark/recordLifeMark, Steve 2026-10-07)
// consumes:
//   - state.journal
//   - state.codex.plants (parts, partials, thin, demonstrated)
//   - state.codex.journal / state.codex.journalMarks / state.codex.mantle (this module's diary layer)
//   - Game.teachPlant (game.js teaching primitive, sibling-owned)
//   - Game.lifeseedVoice / Game.lifeseedMood (lifeseed-owned voice profiles)
//   - Game.plantCalledName / Game.plantDisplayName (game.js believed-name funnel; journal's _calledName falls back to the data name in stub harnesses)
//   - Game.wrongTeaching
//   - Game.playerDeath (wrapped; ledger.js loads after journal.js — guarded)
//   - Game.identifyPlant / Game.eat / Game.eatOne / Game.doAction (wrapped for entry beats)
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

  // JOURNAL_VOICES: the diary beats in six lifeseed registers. This is the
  // unique-person law made text: a laconic life writes short, an effusive
  // life writes long, a wry life can't help itself. Every life that holds
  // the journal sounds like itself — check with lifeseedVoice().register.
  // ctx fields: pname, extra, part, use, kl2, kl3, note, cause, oldFirst, teacher, text.
  const JOURNAL_VOICES = {
    plainspoken: {
      sighting: c => `Saw it proper today: ${c.pname}. ${c.extra}Don't know a use for it yet — that's tomorrow's work.`,
      tasting: c => `Tasted the ${c.pname}. Still alive. That's data too.`,
      deeper: c => `Three tastings of ${c.pname}. ${c.kl3} Now I know what it does to me — that's the difference between eating and knowing.`,
      part: c => `${c.pname} ${c.part} — ${c.use}. That's a use I can count on.`,
      handling: c => `Handled enough ${c.pname} that my hands know it. ${c.kl2} Yield's better when you know what you're doing.`,
      confirm: c => `Heard it third-hand about ${c.pname}; now I've seen it done. Solid.`,
      thin: c => `Pencil, not pen: '${c.text}' — heard it, haven't seen it.`,
      mastery: c => `${c.pname} and I understand each other now. Seasons of handling it and there's nothing left it can hide.`,
      poison: c => `${c.pname} turned on me. ${c.note} Respect from here on — it earned it the hard way.`,
      hunger: () => `Went to bed hungry again. The journal doesn't fill bellies, but it remembers the nights the belly was empty.`,
      triumph: c => `${c.teacher} showed me ${c.pname} proper — hands in the dirt, the whole of it. Some days the world teaches back.`,
      epitaph: c => `If someone's reading this in my handwriting — I didn't make it back. ${c.cause}. The notes are good. Keep writing.`,
      newhand: c => `Picked up ${c.oldFirst}'s journal. Their handwriting, my hands now. I'll keep it honest.`,
    },
    laconic: {
      sighting: c => `${c.pname}. Noted. Uses: unknown.`,
      tasting: c => `Tasted ${c.pname}. Survived.`,
      deeper: c => `${c.pname}: three tastings. ${c.kl3} Known now.`,
      part: c => `${c.pname}: ${c.part} = ${c.use}. Filed.`,
      handling: c => `${c.pname}: handled it into knowledge. Yield up.`,
      confirm: c => `${c.pname}: confirmed. Not hearsay anymore.`,
      thin: c => `Unconfirmed: '${c.text}'`,
      mastery: c => `${c.pname}: mastered. It has no secrets left.`,
      poison: c => `${c.pname} poisoned me. ${c.note} Noted in red.`,
      hunger: () => `Hungry. Again. Writing it down so I don't romanticize this later.`,
      triumph: c => `${c.teacher} taught me ${c.pname}. All of it. Good day.`,
      epitaph: c => `${c.cause}. Journal's yours now. The notes hold.`,
      newhand: c => `${c.oldFirst}'s book. Mine now. Continuing.`,
    },
    effusive: {
      sighting: c => `${c.pname}! Finally put a name to it — ${c.extra}Oh, this one's going to be useful, I can feel it!`,
      tasting: c => `Tasted it! ${c.pname} — my whole mouth is taking notes! Still here!`,
      deeper: c => `${c.pname} — three tastings and it all CLICKS! ${c.kl3} I feel smarter. (I am smarter. It's documented.)`,
      part: c => `${c.pname} ${c.part}! ${c.use} — oh, this changes the whole plant for me!`,
      handling: c => `${c.pname} and these hands are old friends now! Everything comes easier!`,
      confirm: c => `${c.pname} — CONFIRMED! Saw it with my own eyes, it's real, it's all real!`,
      thin: c => `Rumor! '${c.text}' — writing it down but I'm not betting on it yet!`,
      mastery: c => `${c.pname} — MASTERED! I know this plant the way I know my own hands!`,
      poison: c => `${c.pname} BIT me back! ${c.note} Oh, we're going to have words, you and I!`,
      hunger: () => `Another hungry night! You'd think I'd get used to it. I refuse to get used to it!`,
      triumph: c => `${c.teacher} showed me EVERYTHING about ${c.pname}! I could have hugged them. (I did not. Almost.)`,
      epitaph: c => `Oh no. Oh no no. ${c.cause} — if you're reading this, it's yours now! The notes are good, I promise, keep going!`,
      newhand: c => `I'm holding ${c.oldFirst}'s journal! Their notes, their handwriting — and now ME. I won't waste a page!`,
    },
    wry: {
      sighting: c => `${c.pname}. ${c.extra}Named it. Can't eat a name, but it's a start.`,
      tasting: c => `Ate some ${c.pname}. For science. Mostly for science.`,
      deeper: c => `${c.pname}, tasted thrice. ${c.kl3} My stomach has officially graduated.`,
      part: c => `The ${c.part} of ${c.pname}, it turns out, is for ${c.use}. The plant's been holding out on me.`,
      handling: c => `${c.pname} has been harvested by an expert. Me. I'm the expert. The yield agrees.`,
      confirm: c => `${c.pname} graduates from rumor to fact. Took long enough.`,
      thin: c => `'${c.text}' — allegedly. The journal accepts no liability.`,
      mastery: c => `${c.pname} has officially run out of surprises. Weary victory. I'll take it.`,
      poison: c => `Note to self: ${c.pname} is not the friend I thought it was. ${c.note} The betrayal stings almost literally.`,
      hunger: () => `Dinner was a memory and a smell from someone else's fire. Luxury accommodations, as always.`,
      triumph: c => `${c.teacher} cracked ${c.pname} wide open for me. Free education. The System charges for less.`,
      epitaph: c => `Well. ${c.cause}. Statistically, someone had to go first. The journal's yours — try to die less dramatically than me.`,
      newhand: c => `Inherited: one journal, slightly bloodstained, previous owner deceased. ${c.oldFirst} wrote good notes. I'll try to be worthy of the margins.`,
    },
    formal: {
      sighting: c => `Identified: ${c.pname}. ${c.extra}Uses not yet established; further observation required.`,
      tasting: c => `Tasting notes, ${c.pname}: no adverse effects observed at this dose.`,
      deeper: c => `${c.pname}: after three controlled tastings — ${c.kl3} The use is established.`,
      part: c => `${c.pname}, ${c.part}: ${c.use}. Recorded as reliable.`,
      handling: c => `${c.pname}: proficiency through handling. ${c.kl2} Yield increased accordingly.`,
      confirm: c => `${c.pname}: hearsay resolved into observed fact. The record is corrected.`,
      thin: c => `Recorded as hearsay: '${c.text}' Awaiting confirmation.`,
      mastery: c => `${c.pname}: mastery. Complete working knowledge; the entry is closed.`,
      poison: c => `${c.pname}: toxic event. ${c.note} The entry is amended with appropriate caution.`,
      hunger: () => `Caloric deficit continues. Morale: annotated. The record will show we endured.`,
      triumph: c => `${c.teacher} provided a complete demonstration of ${c.pname}. The debt is recorded.`,
      epitaph: c => `Should this be my final entry: ${c.cause}. The record passes to my successor. Maintain it.`,
      newhand: c => `I assume the record from ${c.oldFirst}. The hand changes; the standard does not.`,
    },
    halting: {
      sighting: c => `${c.pname}… I think. ${c.extra}Still learning its face.`,
      tasting: c => `Tried the ${c.pname}… waiting to see what my stomach says.`,
      deeper: c => `${c.pname}… three times now. ${c.kl3} I think — I think I finally know it.`,
      part: c => `${c.pname}… the ${c.part}. ${c.use}, they say. I'll trust my hands on it first.`,
      handling: c => `${c.pname}… my hands remember it now. Even when my head's elsewhere.`,
      confirm: c => `${c.pname}… it's true. Saw it myself. I can stop doubting the note.`,
      thin: c => `'${c.text}'… that's what they say. I'll believe my own eyes.`,
      mastery: c => `${c.pname}… I know it now. Really know it. That took everything.`,
      poison: c => `${c.pname}… hurt me. ${c.note} I should have been more careful. I know that now.`,
      hunger: () => `Hungry… tried not to think about it. Thinking about it anyway.`,
      triumph: c => `${c.teacher}… showed me ${c.pname}. All of it. I didn't know how much I didn't know.`,
      epitaph: c => `I… don't think I'm coming back. ${c.cause}. The journal — keep it. Please keep writing.`,
      newhand: c => `${c.oldFirst}'s… journal. It's mine now. I'll… try to write as true as they did.`,
    },
  };

  // JOURNAL_MOOD_SHADE: strong lifeseed moods tint the observational beats.
  // Appended, never replacing the voice — grief doesn't change your
  // handwriting, it just bleeds through it.
  const JOURNAL_MOOD_SHADE = {
    grieving: ' Everything tastes like the funeral.',
    haunted: ' I keep seeing it when I close my eyes.',
    bitter: ' Not that anyone asked.',
    hollow: ' Wrote it down anyway.',
    ashamed: " Don't deserve the clean page. Writing anyway.",
    wary: ' Trusting the page more than people lately.',
    buoyant: " Good day. They're not all like this.",
    adrift: ' Not sure whose book this is anymore.',
  };

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
          label = opts.sure
            ? (e.name ? `learned what ${e.name.value} does` : `learned what they do`)
            : `a guess about what they do`;
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
      if (isNew) { try { this.journalTouch('write'); } catch (e) {} }
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
      // wired through occupationKnown (break-it 2026-10-08: it had zero
      // callers and this method duplicated its gate).
      if (!this.occupationKnown(vid)) return null;
      if (Game.state.systemArrived) {
        const v = (Game.data.villagers || []).find(x => x.id === vid)
          /* unified: hydrated seeds are in villagers */ || {};
        return v.formerOccupation || null;
      }
      const p = (Game.state.codex.people || {})[vid];
      const o = p && p.occupation;
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
    //    Teach FROM THE HAUL, not from a random known-species pick — WIRED
    //    (forager loop 2026-10-08): this.haulTeachingMoment(
    //      this.prepStash().slice(-staged), { maxLessons: 2 }). The species
    //    the player carried home IS the curriculum. Lessons are
    //    demonstrations (specimen in hand), capped at 2 per return — a moment,
    //    not a dump.
    // 2. game.js :: teachPlant(vid, plantId) / firesideTeaching(): player-side
    //    learning already routes through Game.teachPlant (game.js,
    //    quality-gated). After any such lesson, call
    //    this.learnFromShowing(pid, vid, {shown:true|false, via:'taught'})
    //    so the PARTS layer and thin-knowledge bookkeeping land too.
    // 3. app.js :: Codex screen plant cards: via the codexEntries() wrap
    //    (break-it 2026-10-08) — e.journalLine, e.journalEntries,
    //    e.marginalia, e.journalMarks, e.knowledgeGaps. null/[] below L1 —
    //    "if you don't know, it doesn't show."
    // 4. app.js :: forage/grid: L2+ coaching via this.forageCue(pid) — known
    //    parts and uses only, never a hint at unknown parts. (UNWIRED as of
    //    2026-10-08 — no caller yet; kept for the grid pass.)
    //
    // The teaching-quality MODEL (0-3) is assessed in learnFromShowing itself
    // (shown-deep/named/thin) over Game.teachPlant's result: journal.js calls
    // the game.js primitive and never reimplements teaching. The synergy
    // ledger lives in progression.js (sibling-owned): never touched here.

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
        // Split on commas/semicolons, but NOT inside parentheses — "RIPE
        // fruit only (soft, yellow, fragrant)" is one part, not three.
        // (Steve 2026-10-07: the naive split produced garbage part keys like
        // "yellow" that leaked into the knowledge gaps as nonsense.)
        const segs = [];
        let depth = 0, cur = '';
        for (const ch of m[1]) {
          if (ch === '(') depth++;
          else if (ch === ')') depth = Math.max(0, depth - 1);
          if ((ch === ',' || ch === ';') && depth === 0) { segs.push(cur); cur = ''; }
          else cur += ch;
        }
        if (cur.trim()) segs.push(cur);
        for (const seg of segs) {
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

    // _calledName(pid): the believed name without a hard game.js dependency.
    // journal.js also loads in stub harnesses (the 2026-10-06/07 proof tests
    // stub Game without game.js) — so delegate to Game.plantCalledName when
    // present, else fall back to the data name (the old behavior).
    _calledName(pid) {
      try { if (this.plantCalledName) return this.plantCalledName(pid); } catch (e) {}
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      return p.name || pid;
    },

    // learnPart(pid, partKey, how): record that a part's use is known.
    // The first part learned lifts L1 -> L2 — the use IS the part. Fires a
    // say-line so the progression has FEEL, not just a number moving.
    // Identification is the teacher's job (teachPlant/learnFromShowing), not
    // this function's: an unknown plant is refused, never auto-identified.
    // (break-it 2026-10-08: the old fallback identifyPlant(pid,'shown',null)
    // named plants with no teacher and no wrongTeaching check.)
    learnPart(pid, partKey, how) {
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return false;
      if (!this.plantKnown(pid)) return false;
      const e = this.state.codex.plants[pid];
      e.parts = e.parts || {};
      if (e.parts[partKey] && e.parts[partKey].known) return false;
      e.parts[partKey] = { known: true, how: how || 'shown', day: day() };
      const all = this.plantPartsList(pid);
      const n = all.filter(pt => e.parts[pt.key] && e.parts[pt.key].known).length;
      if ((e.level || 1) < 2) {
        e.level = 2;
        const kl2 = (p.knowledgeLevels || {})['2'];
        // BELIEVED NAME (break-it knowledge 2026-10-09 r2): the celebration
        // names what the player calls it — a false label is still their label.
        this.say(`\u2605 ${this._calledName(pid)}: a part you know how to use. Level 2.${kl2 ? ' ' + kl2 : ''}`);
      } else {
        this.say(`Noted: ${this._calledName(pid)} ${partKey} — ${n} of ${all.length} parts known.`);
      }
      // The part learned is a diary beat too — the use, in the current hand.
      try {
        const pl = this.plantPartsList(pid).find(x => x.key === partKey);
        this.writePlantEntry(pid, 'part', this.journalVoiceLine('part', this.journalVoice(),
          { pname: p.name || pid, part: partKey, use: (pl && pl.use) || 'a use' }));
        this.journalTouch('part');
      } catch (e2) {}
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
      try {
        this.writePlantEntry(pid, 'thin', this.journalVoiceLine('thin', this.journalVoice(), { text }));
        this.journalTouch('thin');
      } catch (e2) {}
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
      try {
        this.writePlantEntry(pid, 'confirm', this.journalVoiceLine('confirm', this.journalVoice(), { pname: p.name || pid }));
        this.journalTouch('confirm');
      } catch (e2) {}
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
    // Routes through the real teaching primitive (Game.teachPlant, game.js:
    // good teachers identify instantly, poor ones only tick encounters), then
    // layers the journal-owned parts/thin bookkeeping on top. Returns
    // {quality, level, parts, outcome}.
    // (forager loop 2026-10-08: this previously called
    // Scattering.Examine.teachPlant, which never existed — every lesson
    // narrated but taught nothing. Now it teaches for real via Game.teachPlant.)
    learnFromShowing(pid, vid, opts) {
      opts = opts || {};
      const out = { quality: 0, level: 0, parts: 0, outcome: 'none' };
      // BAD KNOWLEDGE first: the game owns wrong-teaching (game.js).
      if (this.wrongTeaching) {
        try {
          const wt = this.wrongTeaching(vid, pid, opts.via || 'shown');
          if (wt) { out.outcome = wt; return out; }
        } catch (err) {}
      }
      const tname = this.displayName ? this.displayName(vid) : 'your teacher';
      const before = ((this.state.codex.plants || {})[pid] || {}).level || 0;
      const r = this.teachPlant ? this.teachPlant(vid, pid) : null;
      if (!r) { out.outcome = 'not taught'; return out; }
      const e = (this.state.codex.plants || {})[pid];
      out.level = (e && e.level) || 0;
      if (out.level > before) {
        // the lesson landed — a real identification.
        out.quality = 2; out.outcome = 'named';
        if (opts.shown !== false) {
          // SHOWN PROPERLY: the specimen is in hand — "goes through the
          // parts one by one". Every part is now known. Thin knowledge, if
          // any, is confirmed solid.
          e.demonstrated = true; e.demonstratedBy = tname;
          this.thickenKnowledge(pid, tname);
          let n = 0;
          for (const pt of this.plantPartsList(pid)) if (this.learnPart(pid, pt.key, 'shown')) n++;
          out.parts = n; out.quality = 3; out.outcome = 'shown-deep';
        }
      } else {
        // POOR TEACHING: a partial reveal only — encounters ticked, nothing
        // identified. A note, not a mechanic — honest about what it isn't.
        // The note is the player's journal: their label, not the true name.
        const unk = this.plantPartsList(pid).find(pt => !this.partKnown(pid, pt.key));
        const called = this._calledName(pid);
        const note = unk
          ? `Heard ${tname} say the ${unk.key} might be the useful bit — unconfirmed.`
          : `Heard ${tname} mention ${called} in passing — thin knowledge.`;
        this.recordThinKnowledge(pid, note, tname);
        out.quality = 1; out.outcome = 'thin';
      }
      try { this.journalTouch('lesson'); } catch (e2) {}
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
      // LUMPS (forager loop 2026-10-08): the day-1 blind haul arrives as
      // unlabeled lumps (plantId null) — the species live in the composition.
      // Without this the moment is silent exactly when it's most needed.
      for (const it of (items || [])) {
        const comp = (it && it.lump) || {};
        for (const cpid of Object.keys(comp)) {
          if (seen[cpid] || String(cpid).indexOf('meat_') === 0) continue;
          if (!(this.data.plants || []).some(p => p.id === cpid)) continue;
          seen[cpid] = true; haulPids.push(cpid);
        }
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
        // BELIEVED NAME (break-it knowledge 2026-10-09 r2): the haul is laid
        // out in the player's terms — plantDisplayName says what they call it.
        const pname = this.plantDisplayName ? this.plantDisplayName(c.pid)
          : (this.plantKnown && this.plantKnown(c.pid) ? (p.name || c.pid) : (p.description || 'a plant'));
        // (forager loop 2026-10-08: "the a tree…" — the template must not
        // supply "the" when the description carries its own article.)
        this.say(`You lay out the haul. ${tname} leans over ${pname}. "Oh — THAT one. Here, look."`);
        const r = this.learnFromShowing(c.pid, c.vid, { shown: true, via: 'haul' });
        lessons.push({ pid: c.pid, vid: c.vid, quality: r.quality, level: r.level, outcome: r.outcome });
        if (r.outcome === 'shown-deep') {
          // The triumph beat: a complete demonstration, in the current hand.
          try {
            const pp = (this.data.plants || []).find(x => x.id === c.pid) || {};
            this.writePlantEntry(c.pid, 'triumph', this.journalVoiceLine('triumph', this.journalVoice(),
              { pname: pp.name || c.pid, teacher: tname }));
            this.recordLifeMark('triumph', `${tname} showed you ${pp.name || c.pid} proper — the whole of it.`);
          } catch (e2) {}
        }
      }
      const teachable = haulPids.filter(pid => myLevel(pid) < 3);
      if (!lessons.length && teachable.length) {
        // HONEST, not silent: nobody could teach from this haul.
        this.say(`Nobody at the fire knows your haul any better than you do. It'll be your own hands that teach you.`);
      }
      try { this.journalTouch('haul'); } catch (e) {}
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
      // BELIEVED NAME (break-it knowledge 2026-10-09 r2): the progress line
      // is the player's own record — it says what the player calls it.
      return `${this._calledName(pid)}${by}: ${bits.join('; ')}.`;
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
      // BELIEVED NAME (break-it knowledge 2026-10-09 r2): coaching speaks the
      // player's label, never a true name they were taught wrongly.
      return `${this._calledName(pid)} (known${uses ? ', ' + uses : ''}): ${cue}`;
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

    // ============ THE MANTLE & THE MARGINALIA (Steve 2026-10-07) ============
    // The Codex is diegetic and persists across lives: one villager snagged
    // the codex skill, the player is a designated scholar, and each life is
    // another adventurer assuming the mantle. Steve's unique-person law: every
    // player character is a COMPLETELY unique person — voice, mood, and topics
    // evolve with what's happened. So the journal is not one narrator. It is
    // a palimpsest: each life writes in its own hand, in its own voice, and
    // the dead leave marginalia for the living.
    //
    // Design:
    // - journalVoice()/journalVoiceFor(char): the CURRENT hand — first name,
    //   lifeseed register (plainspoken/laconic/effusive/wry/formal/halting),
    //   and current lifeseed mood. Never a hardcoded narrator.
    // - journalVoiceLine(kind, voice, ctx): the entry text in that voice.
    //   Six registers, thirteen beats. Laconic lives write short. Effusive
    //   lives write long. That's the point.
    // - writePlantEntry(pid, kind, text): append-only diary record for a
    //   plant, attributed {day, life, first, register}. Guarded by plantKnown
    //   — unknown plants get no entries, ever.
    // - plantJournalEntry(pid): the full honest rendering — this life's
    //   entries, inherited marginalia (other hands, named + register-tagged),
    //   marks, and gaps. null below L1: if you don't know, it doesn't show.
    // - recordPlantMark/recordLifeMark: poisoning, hunger, triumph. Marks
    //   persist and reframe later entries (the same plant reads different
    //   after it poisoned you, after a famine winter, after a triumph).
    // - journalTouch/journalStaleness: the journal is honest about neglect.
    //   A codex nobody writes in says so on its face.
    // - writeEpitaph/welcomeBearer: the mantle passing. Called from the
    //   playerDeath wrap — epitaph in the DYING voice (written while they're
    //   still the bearer), new-hand line in the SUCCESSOR's voice.
    //
    // ---- WIRING POINTS (app.js reads this — journal.js edits no other file) ----
    // 5. app.js :: Codex/Journal screen header: this.journalOpening() ->
    //    {line, staleness, lives}. Call this.journalTouch('read') when the
    //    screen OPENS so neglect is measured against reading too. (UNWIRED
    //    as of 2026-10-08 — the header still uses its own subtitle; the
    //    function is live and tested, awaiting the header pass.)
    // 6. app.js :: per-plant journal view: this.plantJournalEntry(pid) ->
    //    {name, line, entries, marginalia, marks, gaps} or null at k0.
    //    WIRED (break-it 2026-10-08) via the codexEntries() wrap — the Codex
    //    screen's plant cards render entries/marginalia/marks/gaps.
    //    entries = this life's hand; marginalia = dead lives' hands
    //    ({day, first, register, kind, text}).
    // 7. game.js :: playerDeath is WRAPPED here (ledger.js defines it and
    //    loads after journal.js, so the wrap is guarded). No game.js edits.

    // mantleRecord: the lives that held the journal, and their marginalia.
    // Per-run persistent (state.codex) — the mantle outlives every bearer.
    mantleRecord() {
      const cx = this.state.codex;
      cx.mantle = cx.mantle || { lives: [], marginalia: [], currentStart: 0 };
      return cx.mantle;
    },

    // lifeseedVoice / lifeseedMood: the hand behind a character, DERIVED
    // from the lifeseed — register, pace, humor, address term. The ontology
    // always promised these ("Game.lifeseedVoice / Game.lifeseedMood
    // (lifeseed-owned voice profiles)"), but they were never defined, so
    // convoSpeechDNA() fell back to plainspoken|measured|none|you for EVERY
    // villager and the whole Speech DNA layer spoke with one voice
    // (dialogue rethink, Steve 2026-10-07). Derivation is deterministic per
    // villager and legible: temperament shapes the register, the mind
    // (intelligence) sharpens or softens it, age sets the pace, temperament
    // sets the humor, warmth picks the address term. Two villagers with the
    // same temperament still differ when their minds, age, or warmth do.
    lifeseedVoice(ch) {
      try {
        ch = ch || {};
        const temp = String(((ch.personality || {}).temperament) || 'steady').toLowerCase();
        const vid = ch.id || ch.vid || null;
        // Register: temperament first, then the mind refines it.
        const REG_BY_TEMP = {
          bold: 'effusive', cautious: 'halting', warm: 'plainspoken',
          prickly: 'laconic', steady: 'plainspoken', restless: 'wry',
          dry: 'wry', gentle: 'formal', intense: 'laconic', withdrawn: 'halting',
        };
        let register = REG_BY_TEMP[temp] || 'plainspoken';
        try {
          const intel = ((vid && this.npcIntel && this.npcIntel(vid)) || {}).primary || 'steady';
          if (intel === 'analytical') register = 'formal';
          else if (intel === 'social' && (register === 'laconic' || register === 'halting')) register = 'plainspoken';
          else if (intel === 'observant' && register === 'effusive') register = 'plainspoken';
        } catch (e) {}
        // Pace: age sets it; restlessness hurries it.
        let pace = 'measured';
        try {
          const band = (vid && this.npcAgeBand && this.npcAgeBand(vid)) || 'adult';
          if (band === 'young') pace = 'quick';
          else if (band === 'elder') pace = 'slow';
        } catch (e) {}
        if (temp === 'restless') pace = 'quick';
        // Humor: the dry joke dryly; the prickly joke at funerals.
        const humor = temp === 'dry' ? 'dry' : (temp === 'prickly' ? 'gallows' : 'none');
        // Address: the warm name you; everyone else just says you.
        const address = (temp === 'warm' || temp === 'gentle') ? 'friend' : 'you';
        return { register, pace, humor, address };
      } catch (e) {
        return { register: 'plainspoken', pace: 'measured', humor: 'none', address: 'you' };
      }
    },

    // lifeseedMood: the mood behind the hand. Derived live (never stored) —
    // the journal sounds like the person as they are now, not as generated.
    lifeseedMood(ch) {
      try {
        const vid = ch && (ch.id || ch.vid);
        if (vid && typeof this.npcMood === 'function') return this.npcMood(vid) || 'steady';
      } catch (e) {}
      return 'steady';
    },

    // journalVoiceFor(char): the hand behind a character — lifeseed register
    // + current mood. journalVoice(): the current bearer's hand.
    journalVoiceFor(ch) {
      try {
        const voice = (this.lifeseedVoice && ch) ? this.lifeseedVoice(ch) : null;
        const mood = (this.lifeseedMood && ch) ? this.lifeseedMood(ch) : 'steady';
        return {
          first: ((ch && ch.name) || 'Someone').split(' ')[0],
          register: (voice && voice.register) || 'plainspoken',
          mood: mood || 'steady',
        };
      } catch (e) { return { first: 'Someone', register: 'plainspoken', mood: 'steady' }; }
    },
    journalVoice() {
      const ch = (this.data.villagers || []).find(v => v.id === this.villagerId) || {};
      return this.journalVoiceFor(ch);
    },

    // journalVoiceLine(kind, v, ctx): one diary beat in the given voice.
    // Strong moods shade the observational beats (never the epitaph — the
    // dying get their own words clean).
    journalVoiceLine(kind, v, ctx) {
      const c = ctx || {};
      const reg = (v && v.register) || 'plainspoken';
      const table = JOURNAL_VOICES[reg] || JOURNAL_VOICES.plainspoken;
      const fn = table[kind] || JOURNAL_VOICES.plainspoken[kind];
      let text = '';
      try { text = fn(c); } catch (e) { text = ''; }
      if (!text && JOURNAL_VOICES.plainspoken[kind]) {
        try { text = JOURNAL_VOICES.plainspoken[kind](c); } catch (e2) {}
      }
      const shade = JOURNAL_MOOD_SHADE[(v && v.mood) || 'steady'];
      if (shade && /^(sighting|tasting|part|thin|handling)$/.test(kind)) text += shade;
      return text;
    },

    // journalTouch(kind): the hand touched the page (wrote OR read).
    journalTouch(kind) {
      try { this.state.codex.lastJournalTouch = { day: day(), kind: kind || 'write' }; } catch (e) {}
    },

    // journalStaleness: honest neglect. null when fresh — a line when not.
    journalStaleness() {
      const t = (this.state.codex || {}).lastJournalTouch;
      const d = day();
      const jn = this.journalName();
      if (!t) return `${jn} opens on a blank first page. ${d} days in, and no hand has touched it yet — the life is happening faster than the record.`;
      const gap = d - (t.day || 0);
      if (gap <= 1) return null;
      if (gap <= 3) return `A little dusty. ${gap} days since anything was ${t.kind === 'read' ? 'read or ' : ''}written — the ${jn.toLowerCase()} is falling behind the life.`;
      return `Neglected. ${gap} days since the last entry. The ${jn.toLowerCase()} remembers less than the bearer does — and the bearer is forgetting too.`;
    },

    // journalOpening: the journal screen's header — who holds it, who held
    // it, and whether it's being kept. WIRING: app.js Codex screen.
    journalOpening() {
      const m = this.mantleRecord();
      const v = this.journalVoice();
      const jn = this.journalName();
      const lives = m.lives || [];
      const ord = (n) => n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`;
      const line = lives.length
        ? `Kept by ${v.first}, ${ord(lives.length + 1)} bearer of the ${jn.toLowerCase()}. ${lives.length} hand${lives.length > 1 ? 's' : ''} before: ${lives.map(l => `${l.first}${l.cause ? ` († ${l.cause})` : ''}`).join(', ')}.`
        : `Kept by ${v.first}, first bearer of the ${jn.toLowerCase()}. Every page so far is their hand.`;
      return { line, staleness: this.journalStaleness(), lives: lives.length + 1 };
    },

    // journalPlantEntries(pid): this plant's diary records (all lives).
    journalPlantEntries(pid) {
      const cx = this.state.codex;
      cx.journal = cx.journal || {};
      cx.journal.plants = cx.journal.plants || {};
      if (!cx.journal.plants[pid]) cx.journal.plants[pid] = [];
      return cx.journal.plants[pid];
    },

    // writePlantEntry(pid, kind, text): append one diary record in the
    // current hand. Guarded by plantKnown — unknown plants get no entries,
    // ever. Exact-duplicate guard; capped so a life can't flood the book.
    writePlantEntry(pid, kind, text) {
      if (!text) return false;
      try { if (!this.plantKnown(pid)) return false; } catch (e) { return false; }
      const arr = this.journalPlantEntries(pid);
      if (arr.some(x => x.kind === kind && x.text === String(text))) return false;
      if (arr.length > 40) arr.shift();
      const v = this.journalVoice();
      arr.push({ day: day(), life: this.villagerId, first: v.first, register: v.register, kind, text: String(text) });
      return true;
    },

    // plantJournalEntry(pid): the full honest rendering for the Codex
    // screen. null below L1. Marginalia = dead lives' hands, attributed.
    // WIRING: app.js per-plant journal view.
    plantJournalEntry(pid) {
      const e = (this.state.codex.plants || {})[pid];
      if (!e || (e.level || 0) < 1) return null;
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      const all = this.journalPlantEntries(pid);
      return {
        pid,
        name: p.name || pid,
        line: this.codexPlantLine(pid),
        entries: all.filter(x => x.life === this.villagerId),
        marginalia: all.filter(x => x.life !== this.villagerId),
        marks: this.plantMarks(pid),
        gaps: this.knowledgeGaps(pid),
      };
    },

    // marginaliaFor(pid): what dead hands wrote about this plant. For the
    // forage/grid UI's knownCue coaching — the dead teach the living.
    marginaliaFor(pid) {
      return this.journalPlantEntries(pid).filter(x => x.life !== this.villagerId);
    },

    // recordPlantMark(pid, kind, note): this plant did something to you.
    // kinds: poisoned | sickened. Surfaced in plantJournalEntry and reframe
    // later entries (the voice lines for poison are their own beat).
    recordPlantMark(pid, kind, note) {
      const cx = this.state.codex;
      cx.journalMarks = cx.journalMarks || {};
      cx.journalMarks.plants = cx.journalMarks.plants || {};
      const arr = cx.journalMarks.plants[pid] || (cx.journalMarks.plants[pid] = []);
      if (arr.some(m => m.kind === kind && m.day === day())) return false;
      arr.push({ kind, day: day(), note: note || '' });
      return true;
    },
    plantMarks(pid) {
      const cx = this.state.codex || {};
      return (((cx.journalMarks || {}).plants || {})[pid] || []).slice();
    },

    // recordLifeMark(kind, note): the life did something to the bearer.
    // kinds: hunger | triumph. Hunger reframes foraging entries; triumph
    // reframes mastery. Same-day dedupe; capped.
    recordLifeMark(kind, note) {
      const cx = this.state.codex;
      cx.journalMarks = cx.journalMarks || {};
      const arr = cx.journalMarks.life || (cx.journalMarks.life = []);
      if (arr.some(m => m.kind === kind && m.day === day())) return false;
      if (arr.length > 30) arr.shift();
      arr.push({ kind, day: day(), note: note || '' });
      return true;
    },
    lifeMarks() {
      const cx = this.state.codex || {};
      return ((cx.journalMarks || {}).life || []).slice();
    },

    // noteTastings(pid, count, leveled): the eat() wrap's beat. First
    // tasting ever gets its own entry; arrival at L3 (three tastings, uses
    // known) gets the deeper entry. Called with before/after deltas so the
    // diary only writes what actually happened.
    noteTastings(pid, count, leveled) {
      if (!this.plantKnown(pid)) return;
      const e = (this.state.codex.plants || {})[pid] || {};
      const p = (this.data.plants || []).find(x => x.id === pid) || {};
      const v = this.journalVoice();
      if ((e.tastings || 0) - (count || 0) <= 0) {
        this.writePlantEntry(pid, 'tasting', this.journalVoiceLine('tasting', v, { pname: p.name || pid }));
      }
      if ((e.level || 0) >= 3 && !this.journalPlantEntries(pid).some(x => x.kind === 'deeper')) {
        this.writePlantEntry(pid, 'deeper',
          this.journalVoiceLine('deeper', v, { pname: p.name || pid, kl3: ((p.knowledgeLevels || {})['3'] || '').trim() }));
      }
      this.journalTouch('taste');
    },

    // noteHungerNight(): called from the endDay wrap. Going to bed genuinely
    // hungry (sub-400 kcal) writes itself into the margins — the famine
    // winter beat, one honest line per night, in the current hand.
    noteHungerNight() {
      const s = this.state.scholar || {};
      if ((s.kcal || 0) >= 400) return false;
      const ok = this.recordLifeMark('hunger', `Day ${day()}: went to bed hungry.`);
      if (ok) {
        try {
          const cx = this.state.codex;
          cx.journal = cx.journal || {};
          const arr = cx.journal.margins || (cx.journal.margins = []);
          const v = this.journalVoice();
          arr.push({ day: day(), life: this.villagerId, first: v.first, register: v.register, kind: 'hunger', text: this.journalVoiceLine('hunger', v, {}) });
          if (arr.length > 30) arr.shift();
        } catch (e) {}
        this.journalTouch('hunger');
      }
      return ok;
    },

    // writeEpitaph(old, cause): the dying life's last margin note — written
    // WHILE they're still the bearer, in their own register. welcomeBearer:
    // the successor's first line, in the NEW hand. Called from the
    // playerDeath wrap (ledger.js, guarded — it loads after journal.js).
    writeEpitaph(old, cause) {
      const m = this.mantleRecord();
      const v = this.journalVoiceFor(old.char);
      const causeText = cause || 'the wild';
      const causeCap = causeText.charAt(0).toUpperCase() + causeText.slice(1);
      m.lives.push({
        vid: old.vid, name: old.name, first: v.first, register: v.register,
        startDay: m.currentStart || 0, endDay: day(), cause: causeText,
      });
      m.marginalia.push({
        kind: 'epitaph', day: day(), life: old.vid, first: v.first, register: v.register,
        text: this.journalVoiceLine('epitaph', v, { cause: causeCap }),
      });
      this.journalTouch('death');
    },
    welcomeBearer(old, cause) {
      if (this.over || this.villageLost) return;
      const newId = this.villagerId;
      if (!newId || newId === old.vid) return;
      const m = this.mantleRecord();
      m.currentStart = day();
      const v = this.journalVoice();
      m.marginalia.push({
        kind: 'newhand', day: day(), life: newId, first: v.first, register: v.register,
        text: this.journalVoiceLine('newhand', v, { oldFirst: (old.name || 'Someone').split(' ')[0] }),
      });
      this.journalTouch('mantle');
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
      // BREAK-IT (social r7 2026-10-09): only a real promise is journaled —
      // an honest deflection ("I won't promise what I can't keep") made no
      // vow, so there is nothing to track.
      if (r && r.ok) {
        const want = this.goalWant(vid) || 'something';
        this.journalLearn(vid, 'promise', { text: `Help them ${want}` }, {});
      }
    } catch (e) {}
    return r;
  };

  // BREAK-IT (social 2026-10-08): the wrapper dropped the vid parameter —
  // per-villager fulfillment (checkPromises('social', vid)) silently fell
  // back to the village-wide sweep. Forward it.
  const origCheckPromises = Game.checkPromises;
  if (origCheckPromises) Game.checkPromises = function (kind, vid) {
    const before = {};
    for (const [vid, p] of Object.entries((this.state.village.promises || {}))) before[vid] = p.kept;
    const r = origCheckPromises.call(this, kind, vid);
    try {
      for (const [vid, p] of Object.entries((this.state.village.promises || {}))) {
        if (before[vid] !== p.kept) {
          const want = this.goalWant(vid) || 'something';
          this.journalLearn(vid, 'promise',
            { text: `Help them ${want}`, status: p.kept === true ? 'kept' : (p.kept === 'released' ? 'released — they\'re gone' : 'broken') }, {});
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
    // HUNGER MARGIN (Steve 2026-10-07): going to bed genuinely hungry writes
    // itself into the journal's margins — the famine-winter beat.
    try { this.noteHungerNight(); } catch (e2) {}
    return r;
  };

  // ============ MANTLE & ENTRY-BEAT WRAPS (Steve 2026-10-07) ============
  // The diary writes itself at the moments that matter: identification
  // (first sighting), eating (tastings), handling (harvest mastery),
  // poisoning (the plant turns), and death (the mantle passes). All wraps —
  // journal.js edits no other file.

  // 7. First sighting — identifyPlant succeeding means the diary gets its
  //    opening line for this plant, in the current hand.
  const origIdentifyPlant = Game.identifyPlant;
  if (origIdentifyPlant) Game.identifyPlant = function (pid, source, teacherName) {
    const r = origIdentifyPlant.call(this, pid, source, teacherName);
    if (r) {
      try {
        const p = (this.data.plants || []).find(x => x.id === pid) || {};
        const v = this.journalVoice();
        const desc = p.description || '';
        const extra = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) + '. ' : '';
        this.writePlantEntry(pid, 'sighting',
          this.journalVoiceLine('sighting', v, { pname: p.name || pid, extra }));
        this.journalTouch('identify');
      } catch (e) {}
    }
    return r;
  };

  // 8. Tastings — eat() moves tastings/levels in bulk; the wrap diffs
  //    before/after and the diary notes only what actually happened.
  const origEat = Game.eat;
  if (origEat) Game.eat = function () {
    let before = null;
    try {
      before = {};
      for (const [pid, e] of Object.entries(this.state.codex.plants || {}))
        before[pid] = `${e.tastings || 0}:${e.level || 0}`;
    } catch (e) {}
    const r = origEat.call(this);
    try {
      if (before) for (const [pid, e] of Object.entries(this.state.codex.plants || {})) {
        const b = String(before[pid] || '0:0').split(':').map(Number);
        const dt = (e.tastings || 0) - b[0];
        const dl = (e.level || 0) - b[1];
        if (dt > 0 || dl > 0) this.noteTastings(pid, Math.max(dt, 0), dl > 0);
      }
    } catch (e) {}
    return r;
  };

  // 9. Handling & mastery — doAction's harvest path moves L1->L2 (handling)
  //    and L3->L4 (mastery). The diary notes the transition in the hand that
  //    did the work; mastery also marks the life (triumph reframes later).
  const origDoAction = Game.doAction;
  if (origDoAction) Game.doAction = function (kind, opts) {
    let before = null;
    try {
      before = {};
      for (const [pid, e] of Object.entries(this.state.codex.plants || {})) before[pid] = e.level || 0;
    } catch (e) {}
    const r = origDoAction.call(this, kind, opts);
    try {
      if (before) for (const [pid, e] of Object.entries(this.state.codex.plants || {})) {
        const bl = before[pid] || 0, al = e.level || 0;
        if (al <= bl) continue;
        const p = (this.data.plants || []).find(x => x.id === pid) || {};
        const v = this.journalVoice();
        const entries = this.journalPlantEntries(pid);
        if (bl < 2 && al >= 2 && !entries.some(x => x.kind === 'handling' || x.kind === 'part')) {
          this.writePlantEntry(pid, 'handling', this.journalVoiceLine('handling', v,
            { pname: p.name || pid, kl2: ((p.knowledgeLevels || {})['2'] || '').trim() }));
        }
        if (bl < 4 && al >= 4) {
          this.writePlantEntry(pid, 'mastery', this.journalVoiceLine('mastery', v, { pname: p.name || pid }));
          this.recordLifeMark('triumph', `Mastered ${p.name || pid} — nothing left it can hide.`);
        }
        this.journalTouch('handle');
      }
    } catch (e) {}
    return r;
  };

  // 10. The plant turns — eatOne poisoning/disease lands a mark AND a diary
  //     entry in the current hand. The same plant reads different afterwards.
  const origEatOne = Game.eatOne;
  if (origEatOne) Game.eatOne = function (idx) {
    let item = null, pb = 0, db = 0;
    try {
      const s = this.state.scholar || {};
      item = (s.inventory || [])[idx] || null;
      pb = (s.poisons || []).length; db = (s.diseases || []).length;
    } catch (e) {}
    const r = origEatOne.call(this, idx);
    try {
      const s = this.state.scholar || {};
      const pid = item && item.plantId && String(item.plantId).indexOf('meat_') !== 0 ? item.plantId : null;
      if (pid && this.plantKnown(pid)) {
        const p = (this.data.plants || []).find(x => x.id === pid) || {};
        const v = this.journalVoice();
        const poisoned = (s.poisons || []).length > pb;
        const sickened = (s.diseases || []).length > db;
        if (poisoned || sickened) {
          this.recordPlantMark(pid, poisoned ? 'poisoned' : 'sickened',
            `Day ${day()}: ${poisoned ? 'poisoned by it' : 'fever by nightfall'}.`);
          this.writePlantEntry(pid, 'poison', this.journalVoiceLine('poison', v,
            { pname: p.name || pid, note: poisoned ? 'Veins burned for an hour.' : 'Fever by nightfall.' }));
          this.journalTouch('poison');
        }
      }
    } catch (e) {}
    return r;
  };

  // 11. The Codex read path — codexEntries carries the journal payload.
  //     plantJournalEntry (this life's entries, dead lives' marginalia,
  //     marks, gaps, progress line) was write-only: the Codex screen never
  //     called it. The wrap appends the payload so the screen can render
  //     what the journal has been recording all along. (break-it 2026-10-08)
  const origCodexEntries = Game.codexEntries;
  if (origCodexEntries && !origCodexEntries._journalWired) {
    const wired = function () {
      const list = origCodexEntries.call(this);
      return (list || []).map(e => {
        if (!e || !e.pid) return e;
        try {
          const pj = this.plantJournalEntry ? this.plantJournalEntry(e.pid) : null;
          if (pj) {
            e.journalLine = pj.line;
            e.journalEntries = pj.entries;
            e.marginalia = pj.marginalia;
            e.journalMarks = pj.marks;
            e.knowledgeGaps = pj.gaps;
          }
        } catch (err) {}
        return e;
      });
    };
    wired._journalWired = true;
    Game.codexEntries = wired;
  }

  // 12. The mantle passes — playerDeath is ledger.js's, which loads AFTER
  //     journal.js, so the wrap cannot install at load time. It installs on
  //     a deferred macrotask: setTimeout callbacks queue behind the remaining
  //     synchronous <script> tasks, so this runs after every module has
  //     attached — long before any death can occur in play. A direct attempt
  //     runs first too (covers any future load reordering). Guarded against
  //     double-install; chains cleanly if a later module wraps playerDeath.
  function installMantleWrap() {
    if (!Game.playerDeath || Game.playerDeath._journalMantleWrapped) return;
    const origPlayerDeath = Game.playerDeath;
    const wrapped = function (cause) {
      let old = null;
      try {
        const oldId = this.villagerId;
        const ch = (this.data.villagers || []).find(x => x.id === oldId) || {};
        old = { vid: oldId, name: ch.name || 'the scholar', char: ch };
        this.writeEpitaph(old, cause);
      } catch (e) {}
      const r = origPlayerDeath.call(this, cause);
      try { if (old) this.welcomeBearer(old, cause); } catch (e) {}
      return r;
    };
    wrapped._journalMantleWrapped = true;
    Game.playerDeath = wrapped;
  }
  try { installMantleWrap(); } catch (e) {}
  try { setTimeout(installMantleWrap, 0); } catch (e) {}
})();
