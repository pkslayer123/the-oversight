// @ontology
// system: convo-scene
// description: Dialogue rethink Phase 2 (Steve 2026-10-08) — the Scene pipeline. One scene state unifying want + mood + relationship + beat; one consequence resolver every choice flows through; the Ask/Answer Contract as a validate gate; memory-driven "what's alive" menu data.
// provides:
//   - getScene(vid)
//   - resolveConsequence(vid, spec)
//   - validateAskContract(vid)
//   - convoWhatsAlive(vid)
// rules:
//   - scene_unified: want + mood + bond + beat compose into one snapshot; handlers read the Scene for decisions, mutate convo state only (code: convo-scene.js, getScene; Steve 2026-10-08)
//   - one_resolver: every trust/mood/disposition/memory consequence in conversation flows through resolveConsequence — no inline t[vid]= writes in turn handlers (code: convo-scene.js, resolveConsequence; Steve 2026-10-08)
//   - words_cap: talk-originated trust gains cap at 40 ("words only go so far"); penalties land whole, never softened (code: convo-scene.js, resolveConsequence)
//   - mediated_halves: live-translate mediation halves positive rapport gains (code: convo-scene.js, resolveConsequence; kept from trustGain, Steve 2026-10-06)
//   - warmth_follows_trust: mood delta defaults to sign(trust delta) when not given — no separate data (code: convo-scene.js, resolveConsequence)
//   - contract_gate: every NPC question offers honest answer + boundary + silence; validateAskContract fails the build otherwise (code: convo-scene.js, validateAskContract; Steve 2026-10-08)
//   - whats_alive: the topic menu leads with open threads, fresh memories, want questions, world events — not the static pool (code: convo-scene.js, convoWhatsAlive; Steve 2026-10-08)
// consumes:
//   - convoGet(vid), convoVoiceTier(vid), relDays(vid), playerDisposition()
//   - convoMoodBand(vid), convoMoodShift(vid, d), convoMoodReceptivity(vid)
//   - dispositionCostMult(vid, temper), shiftDisposition(d), markEscalated(vid)
//   - mediatedBySystem(vid), remember(vid, type, note)
//   - village.trust, village.memory, convoSeeds
// ============ THE SCENE (dialog rethink Phase 2) ============
// One driver per conversation (Principle 1): the want, the mood, the
// relationship, and the beat compose into a single snapshot. buildMenu and
// the turn handlers read the Scene for decisions; the Scene never mutates.
// Consequences flow through resolveConsequence — one place, one set of
// rules, every choice legible in the fiction.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const methods = {
    // getScene: the unified scene snapshot. Computed fresh per call —
    // never stored, never mutated. Decision reads go here; mutations stay
    // on the convo object (c.*) or flow through resolveConsequence.
    getScene(vid) {
      const c = (typeof this.convoGet === 'function') ? this.convoGet(vid) : null;
      const v = this.state.village || {};
      const trust = (v.trust || {})[vid] === undefined ? 10 : (v.trust || {})[vid];
      const want = (c && c.want) ? {
        id: c.want.id || null,
        stage: c.want.stage || 0,
        resolution: c.want.resolution || null,
        fromSeed: !!c.want.fromSeed,
      } : null;
      const mood = (c && typeof c.mood === 'number') ? c.mood : 0;
      let moodBand = 'neutral';
      try { moodBand = this.convoMoodBand ? this.convoMoodBand(vid) : 'neutral'; } catch (e) {}
      let tier = 'new';
      try { tier = this.convoVoiceTier ? this.convoVoiceTier(vid) : 'new'; } catch (e) {}
      let relDays = 0;
      try { relDays = this.relDays ? this.relDays(vid) : 0; } catch (e) {}
      let receptivity = 0;
      try { receptivity = this.convoMoodReceptivity ? this.convoMoodReceptivity(vid) : 0; } catch (e) {}
      const mem = ((v.memory || {})[vid]) || [];
      let disposition = 0;
      try { disposition = this.playerDisposition ? this.playerDisposition() : 0; } catch (e) {}
      return {
        vid,
        active: !!(c && c.active),
        want,                       // {id, stage, resolution, fromSeed} | null
        mood,                       // -3..3
        moodBand,                   // warm|friendly|neutral|cool|tense
        bond: {
          trust,                    // 0..100
          tier,                     // new|warm|close
          relDays,                  // relationship age, days
          receptivity,              // -3..3 lived-memory guard/grace
          memoryCount: mem.length,
        },
        beat: {                     // what was just said / what's hanging
          thread: (c && c.thread) || null,
          topic: (c && c.topic) || null,
          pendingQ: !!(c && c.pendingQ),
          reactiveQ: !!(c && c.reactiveQ),
          genericQ: !!(c && c.genericQ),
          heldBeats: (c && c.heldBeats ? c.heldBeats.length : 0),
          choosingSubject: !!(c && c.choosingSubject),
          questionHangs: !!(c && (c.pendingQ || c.reactiveQ || c.genericQ)),
        },
        disposition,                // -3 cruel .. +3 kind
        escalated: !!(c && c.escalated),
      };
    },

    // resolveConsequence: THE single place conversation consequences attach.
    // spec: {
    //   trust: number (delta; + gains, - costs),
    //   mood: number|undefined (delta; undefined → sign(trust) if trust else 0),
    //   disposition: number|undefined (±0.5 moral trajectory),
    //   temper: 'kind'|'neutral'|'cruel'|'honest-hard' (cost mult + escalation),
    //   memory: { type, note }|undefined,
    //   talk: true|false (default true → gains cap at 40; false = real act),
    //   escalate: bool (markEscalated),
    //   name: string (fiction-naming key, for tests + legibility audit),
    // }
    // Returns { trust, mood, disposition, memory } — the APPLIED deltas.
    // Numbers never leak to the fiction; the caller names what moved.
    resolveConsequence(vid, spec) {
      spec = spec || {};
      const scene = this.getScene(vid);
      const applied = { trust: 0, mood: 0, disposition: 0, memory: null, name: spec.name || null };
      try {
        const temper = spec.temper || 'neutral';
        // Out-of-character costs more (Principle 4, Phase 1): negative
        // deltas double on mismatched picks. Becoming someone new isn't free.
        const mult = (typeof this.dispositionCostMult === 'function')
          ? this.dispositionCostMult(vid, temper) : 1;
        let tdelta = spec.trust || 0;
        let mdelta = spec.mood;
        // Warmth follows trust (existing rule): no separate data needed.
        if (mdelta === undefined) mdelta = tdelta !== 0 ? Math.sign(tdelta) : 0;
        if (tdelta < 0) tdelta *= mult;
        if (mdelta < 0) mdelta *= mult;
        // TRUST
        if (tdelta !== 0) {
          const t = this.state.village.trust || (this.state.village.trust = {});
          const cur = (t[vid] === undefined ? 10 : t[vid]);
          let gain = tdelta;
          if (gain > 0) {
            // Live-translate mediation halves rapport gains (kept from
            // trustGain, Steve 2026-10-06): the System gives you the words
            // without the work — the relationship starves.
            try {
              if (this.mediatedBySystem && this.mediatedBySystem(vid)) gain = Math.ceil(gain / 2);
            } catch (e) {}
            // PROGRESSIVE TRUST (break-it 2026-10-08): higher trust is harder
            // to earn — applies here too, before the talk cap.
            try {
              if (typeof this.trustGainProgressive === 'function') gain = this.trustGainProgressive(vid, gain);
            } catch (e) {}
            // WORDS ONLY GO SO FAR: talk caps at 40. Beyond that, do
            // something real. Real acts pass talk:false.
            if (spec.talk !== false) {
              gain = cur >= 40 ? 0 : Math.min(gain, 40 - cur);
            }
          }
          // Penalties are never softened: embarrassment and consequences
          // land whole (kept from trustGain).
          const nv = Math.max(0, Math.min(100, cur + gain));
          t[vid] = nv;
          applied.trust = nv - cur;
        }
        // MOOD via convoMoodShift — keeps guard/grace + band beats.
        if (mdelta !== 0 && typeof this.convoMoodShift === 'function') {
          const before = scene.mood;
          this.convoMoodShift(vid, mdelta);
          const c = this.convoGet(vid);
          const after = (c && typeof c.mood === 'number') ? c.mood : before;
          applied.mood = after - before;
        }
        // DISPOSITION: kind/cruel choices reshape the palette.
        if (spec.disposition && typeof this.shiftDisposition === 'function') {
          const before = this.playerDisposition();
          this.shiftDisposition(spec.disposition);
          applied.disposition = this.playerDisposition() - before;
        }
        // MEMORY: every write needs a later read site (Telltale-theater rule).
        if (spec.memory && spec.memory.type && typeof this.remember === 'function') {
          this.remember(vid, spec.memory.type, spec.memory.note || '');
          applied.memory = spec.memory.type;
        }
        // ESCALATION: the player chose a hard move — room-fit suppression
        // lifts for the rest of this conversation (escalation, not ambush).
        if (spec.escalate && typeof this.markEscalated === 'function') this.markEscalated(vid);
      } catch (e) {}
      return applied;
    },

    // validateAskContract: the Ask/Answer Contract as a gate (Principle 2).
    // Every NPC question must offer: honest answers + "I'd rather not say"
    // + "...". Returns { ok, failures[] }. A missing honest option is a
    // test failure, not a design discussion (Steve 2026-10-08).
    // Behavioral: it builds the actual menus and checks what the player sees.
    validateAskContract(vid) {
      const failures = [];
      const c = (typeof this.convoGet === 'function') ? this.convoGet(vid) : null;
      if (!c) return { ok: false, failures: ['no convo'] };
      // Save + restore convo question state — validation never mutates.
      const save = { pendingQ: c.pendingQ, reactiveQ: c.reactiveQ, genericQ: c.genericQ, thread: c.thread, heldBeats: c.heldBeats };
      const wasActive = c.active;
      c.active = true;
      try {
        const hasHonest = (menu, answers) => menu.some(ch => {
          if (!ch || !ch.id) return false;
          if (/honest_pass/.test(ch.id)) return true;
          // Data-authored honest boundary (honest_opt_out flag).
          const aid = ch.id.split(':').pop();
          return !!(answers || []).some(a => a.id === aid && a.honest_opt_out);
        });
        const hasSilence = (menu) => menu.some(ch => ch && ch.id &&
          (ch.id === 'silence' || ch.id === 'nv:listen'));
        const hasRealAnswer = (menu, prefix) => menu.some(ch => ch && ch.id &&
          ch.id.indexOf(prefix) === 0 && ch.id.indexOf('honest_pass') === -1 &&
          ch.id !== 'deflect_q');
        // 1. BESPOKE questions (pendingQ): data gate + menu gate.
        const cg = (this.data.characterGen || {}).convo || {};
        for (const q of (cg.questions || [])) {
          const ans = q.answers || [];
          if (ans.length < 2) failures.push(q.id + ': fewer than 2 answers');
          for (const a of ans) {
            if (!a.label || !String(a.label).trim()) failures.push(q.id + ':' + (a.id || '?') + ': empty label');
          }
          c.pendingQ = { id: q.id, answers: ans };
          c.reactiveQ = null; c.genericQ = null; c.thread = null; c.heldBeats = [];
          const menu = this.buildMenu(vid);
          if (!hasRealAnswer(menu, 'ans:')) failures.push(q.id + ': no real answer offered');
          if (!hasHonest(menu, ans)) failures.push(q.id + ': missing honest opt-out');
          if (!hasSilence(menu)) failures.push(q.id + ': missing silence');
          // honest-hard answers, where they exist, must be offered.
          for (const a of ans) {
            if ((a.temper === 'honest-hard') && !menu.some(ch => ch && ch.id === 'ans:' + q.id + ':' + a.id)) {
              failures.push(q.id + ': honest-hard answer not offered');
            }
          }
        }
        // 2. REACTIVE questions: every reactive def gets the contract too.
        const rdefs = this.REACTIVE_DEFS || {};
        for (const rid of Object.keys(rdefs)) {
          const rd = rdefs[rid];
          const rans = rd.answers || [];
          if (rans.length < 2) failures.push('react:' + rid + ': fewer than 2 answers');
          c.pendingQ = null;
          c.reactiveQ = { id: rid };
          c.genericQ = null; c.thread = null; c.heldBeats = [];
          const menu = this.buildMenu(vid);
          if (!hasRealAnswer(menu, 'react:')) failures.push('react:' + rid + ': no real answer offered');
          if (!hasHonest(menu)) failures.push('react:' + rid + ': missing honest opt-out');
          if (!hasSilence(menu)) failures.push('react:' + rid + ': missing silence');
        }
        // 3. GENERIC questions: every generic kind gets the contract.
        for (const kind of ['yn', 'howru', 'greet', 'open']) {
          c.pendingQ = null; c.reactiveQ = null;
          c.genericQ = { kind };
          c.thread = null; c.heldBeats = [];
          const menu = this.buildMenu(vid);
          if (!hasRealAnswer(menu, 'gq:')) failures.push('gq:' + kind + ': no real answer offered');
          if (!hasHonest(menu)) failures.push('gq:' + kind + ': missing honest opt-out');
          if (!hasSilence(menu)) failures.push('gq:' + kind + ': missing silence');
        }
      } finally {
        c.pendingQ = save.pendingQ; c.reactiveQ = save.reactiveQ;
        c.genericQ = save.genericQ; c.thread = save.thread;
        c.heldBeats = save.heldBeats; c.active = wasActive;
      }
      return { ok: failures.length === 0, failures };
    },

    // convoMemoryAbout: human label for a memory type — the ledger is
    // continuity, not a database dump. Shared by convoWhatsAlive (menu) and
    // the alive:memory turn handler so the label and the line agree.
    convoMemoryAbout(memType) {
      const MEM_LABELS = {
        deflected: 'what I asked before',
        gift: 'what you brought me',
        private_gift: 'what you gave me quietly',
        promise_kept: 'what you promised — and did',
        promise_broken: 'what you promised',
        comforted: 'when you sat with me',
        shared_fear: 'what you admitted',
        you_threatened: 'what you said to me',
        confronted: 'what you accused me of',
        shared_goal: 'what we talked about wanting',
      };
      return MEM_LABELS[memType] || null;
    },

    // convoRecallYouSaid: read the you_said ledger — what the player told
    // this NPC before. Returns the note (e.g. "q_trust=a_yes") or null.
    // This is the read site for the you_said writes (Telltale-theater rule).
    convoRecallYouSaid(vid, qid) {
      try {
        const mem = (((this.state.village || {}).memory || {})[vid]) || [];
        for (let i = mem.length - 1; i >= 0; i--) {
          const m = mem[i];
          if (m && m.t === 'you_said' && String(m.note || '').indexOf(qid + '=') === 0) {
            return String(m.note).slice(qid.length + 1);
          }
        }
      } catch (e) {}
      return null;
    },

    // convoWhatsAlive: memory-driven "what can we talk about" (Principle 8).
    // The topic menu inverts — instead of "pick a subject," the game surfaces
    // what's ALIVE: open threads, fresh memories, want-driven questions, and
    // world events. Returns menu-ready items, most alive first.
    convoWhatsAlive(vid) {
      const scene = this.getScene(vid);
      const items = [];
      const day = (this.state.scholar || {}).day || 0;
      try {
        // 1. OPEN THREADS: unfinished business, resumable. Not the current
        // thread — that's already the menu (thread coherence).
        const open = (typeof this.convoOpenThreads === 'function') ? this.convoOpenThreads(vid) : [];
        for (const o of open) {
          if (!o || !o.tid || o.tid === scene.beat.thread) continue;
          const label = o.label || o.tid;
          const ago = Math.max(0, day - (o.day || day));
          const when = ago > 7 ? `${ago} days back` : ago <= 1 ? 'last time' : `${ago} days ago`;
          items.push({
            kind: 'thread', tid: o.tid,
            id: 'alive:thread:' + o.tid,
            label: `"We never finished — ${label} (${when})."`,
            temper: 'neutral',
          });
          if (items.length >= 2) break;
        }
        // 2. FRESH MEMORIES: things that happened between you, worth naming.
        // Only memory types with a human label — the ledger is continuity,
        // not a database dump.
        const mem = (((this.state.village || {}).memory || {})[vid]) || [];
        const seen = {};
        for (let i = mem.length - 1; i >= 0 && items.length < 4; i--) {
          const m = mem[i];
          const about = m && this.convoMemoryAbout(m.t);
          if (!about || seen[m.t]) continue;
          if (day - (m.day || 0) > 7) continue; // stale grief isn't alive
          seen[m.t] = true;
          items.push({
            kind: 'memory', memType: m.t,
            id: 'alive:memory:' + m.t,
            label: `"About ${about}..."`,
            temper: 'neutral',
          });
        }
        // 3. WANT-DRIVEN QUESTIONS: the want surfaces as a question, not a
        // menu item — "Questions come from character" (Principle 9).
        if (scene.want && (scene.want.stage || 0) < 2 && !scene.beat.questionHangs) {
          const WANT_Q = {
            ask_favor: '"Is there something you need? Really."',
            share_news: '"What\'s the word? What should I know?"',
            comfort: '"You seem off. Want to talk about it?"',
            curious: '"What do you want to know? Ask me anything."',
            repay: '"I owe you. Let me make it right — what do you need?"',
            just_company: '"Want some company? No agenda."',
          };
          const wq = WANT_Q[scene.want.id];
          if (wq && scene.bond.tier !== 'new') {
            items.push({ kind: 'want', wantId: scene.want.id, id: 'alive:want:' + scene.want.id, label: wq, temper: 'kind' });
          }
        }
        // 4. WORLD EVENTS: the lately system — live events cut the queue.
        if (typeof this.t2LatelyEvent === 'function') {
          const ev = this.t2LatelyEvent(vid);
          if (ev && ev.kind) {
            const EV_LABELS = {
              naming: '"Have you heard about the naming debate?"',
              mourning: '"How are you holding up? About... them."',
              threat: '"Something\'s wrong out there. Have you felt it?"',
              betrayal: '"We need to talk. About what happened."',
              tension: '"It\'s tense around the fire lately."',
              hunger: '"People are going hungry. What do we do?"',
            };
            if (EV_LABELS[ev.kind]) {
              items.push({ kind: 'event', eventKind: ev.kind, id: 'alive:event:' + ev.kind, label: EV_LABELS[ev.kind], temper: 'neutral' });
            }
          }
        }
      } catch (e) {}
      return items;
    },
  };

  Object.assign(Game, methods);
})();
