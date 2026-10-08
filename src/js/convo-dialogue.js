// @ontology
// system: convo-dialogue
// description: Dialogue-driven conversation. Every NPC beat generates its own response options — what a person would actually say back to THIS specific thing, not a topic grab-bag.
// provides:
//   - dialogueBeatKind(vid) -> classifies what the NPC just said/did
//   - dialogueResponses(vid) -> 3-4 responses TO the current beat
//   - convoTurn(vid, choiceId) -> advance the dialogue one beat
//   - convoChoices(vid) -> dialogue-model choices (overrides conversation.js)
// rules:
//   - beat_drives_menu: responses derive from the NPC's last utterance, not from state flags (code: dialogueResponses, Steve 2026-10-06)
//   - no_feature_cut: every existing conversation feature remains reachable — mapped, not removed (code: DIALOGUE_FEATURE_MAP, Steve 2026-10-06)
//   - subject_change_explicit: the topic grab-bag lives behind "talk about something else", never as the default (code: dialogueResponses, Steve 2026-10-06)
//   - thread_dry_collapse: "tell me more" is offered only while the thread has beats — once dry, the option disappears and the menu winds down instead of looping the admission line (code: dialogueResponses + dlg:more/dlg:react, 2026-10-06)
//   - soft_probe_mounts_evidence: "That doesn't add up" is a real verb, not flavor — it mounts 'prodded' evidence on the first open doubt and the NPC visibly rattles with repeated prods (code: dlg:doubt handler, Steve 2026-10-06)
// consumes:
//   - village.villagers
//   - state.convos
//   - convoGet(vid)
//   - playerVoice()
// ============ DIALOGUE-DRIVEN CONVERSATION ============
// Steve 2026-10-06: "Conversations need to feel real. Every NPC beat generates
// its own response options — what would a person actually say back to THIS."
//
// The old system built a topic-selection menu from ~15 independent systems.
// The NPC said something, and your options weren't responses to it — they were
// a grab-bag. This module inverts it: the beat drives the menu.
//
// Every existing feature survives — mapped into the dialogue model, not cut.
// See DIALOGUE_FEATURE_MAP below for the complete inventory.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ============ FEATURE INVENTORY (Steve 2026-10-06) ============
  // Every one of these must remain reachable. Mapped, not removed.
  const DIALOGUE_FEATURE_MAP = {
    // INFORMATION
    gossip: 'share beat → "tell me more" / "who else knows?" / ask via subject menu',
    news: 'share beat → engage responses',
    rumors: 'share beat (I heard...) → "tell me more" / "is that true?"',
    rumor_spread: 'subject menu → spread_rumor (two-step: target, type)',
    teaching: 'share beat (lesson) → "show me" / "I see" / "explain that part"',
    learning: 'ask via subject menu → they teach',
    // RELATIONSHIPS
    trust: 'built into responses — engage builds, deflect costs',
    comfort: 'feel beat → "are you alright?" / "that sounds hard"',
    companionship: 'want:just_company → "I\'m here" / stay a while',
    personal: 'subject menu → ask:personal (their own words)',
    // TRANSACTIONS
    trade: 'offer beat → "deal" / "show me" / "not now"',
    hawking: 'offer beat (hawker) → same',
    favors: 'want:ask_favor → "how can I help?" / "I can\'t right now"',
    promises: 'want beat deep → "I promise" / "I\'ll try" / "I can\'t"',
    // PARTY
    invite: 'positive beat + trust → "want to come with us?" (contextual)',
    // CONFLICT
    confrontation: 'doubts → "I need to ask you something" (contextual)',
    lies: 'their story → "that doesn\'t add up" (soft probe: rattles them, mounts evidence that makes the hard confrontation more likely to crack them)',
    observation: 'contextual — "I\'ve been watching you" (2nd convo+ or doubts)',
    // PERSONAL (via subject menu — explicitly changing the subject)
    past: 'subject menu → ask:past',
    goals: 'subject menu → ask:goal',
    village: 'subject menu → ask:village',
    plans: 'subject menu → ask:plans',
    theorize: 'subject menu → theorize (or contextual on mystery beats)',
    // WANTS (drive the beats themselves)
    want_share_news: 'NPC shares → share beat responses',
    want_ask_favor: 'NPC asks → want beat responses',
    want_seek_comfort: 'NPC vulnerable → feel beat responses',
    want_warn_you: 'NPC warns → share beat ("tell me more" / "are you sure?")',
    want_curious: 'NPC asks about you → question beat (answer it)',
    want_just_company: 'NPC hangs out → small beat ("this is nice" / stay)',
    // SYSTEM
    secrets: 'high trust → share beat (secret) with weight',
    grief: 'grief beat → feel responses',
    cheer: 'cheer beat → share responses',
    reactive_q: 'question beat → answers first (unchanged machinery)',
    nonverbal: 'gesture responses (unchanged)',
    language: 'speak_back contextual (unchanged)',
    leave: 'always available — "I should go."',
  };

  // ============ BEAT CLASSIFICATION ============
  // What did the NPC just DO? Not what thread we're on — what they said.
  Game.dialogueBeatKind = function (vid) {
    const c = this.convoGet(vid);
    // Direct questions come first — the existing machinery handles them.
    // We don't override; we just don't add dialogue responses on top.
    if (c.pendingQ || (c.reactiveQ && c.reactiveQ.id) || c.genericQ) return 'question';
    if (c.thread === 'nonverbal') return 'nonverbal';
    if (c.thread === 'trade' && c.pendingTrade) return 'offer';
    if (c.pendingHawk) return 'offer';
    if (c.thread === 'spread_rumor' && !c.rumorDone) return 'rumor';

    // Check the want system — what does this NPC want right now?
    try {
      if (typeof this.convoWant === 'function') {
        const want = this.convoWant(vid);
        if (want === 'ask_favor') return 'want';
        if (want === 'seek_comfort') return 'feel';
        if (want === 'warn_you') return 'share';
        if (want === 'share_news') return 'share';
      }
    } catch (e) {}

    // Classify by thread + content cues.
    const t = c.thread;
    // Emotional threads.
    if (t === 'grief' || t === 'cheer') return t === 'grief' ? 'feel' : 'share';
    if (t === 'secret' || t === 'want') return 'share';
    // The last NPC line — check for emotional/question content.
    const transcript = c.transcript || [];
    const lastThem = [...transcript].reverse().find(e => e.who === 'them');
    if (lastThem) {
      const text = String(lastThem.text || '').toLowerCase();
      // Emotional cues.
      if (/scared|afraid|crying|tears|sad|lost |died|dead|hurt|alone/.test(text)) return 'feel';
      // They need something.
      if (/help|need|please|could you|would you/.test(text)) return 'want';
      // They offered something.
      if (/trade|deal|have.*for you|want.*this/.test(text)) return 'offer';
    }
    // Topic threads are shares — they told you something.
    if (['goal', 'past', 'village', 'plans', 'gossip', 'personal', 'theorize'].includes(t)) return 'share';
    // Default: small talk.
    return 'small';
  };

  // ============ RESPONSE GENERATION ============
  // 3-4 things a person would actually say back to THIS beat.
  Game.dialogueResponses = function (vid) {
    const c = this.convoGet(vid);
    const kind = this.dialogueBeatKind(vid);
    const out = [];

    // Questions and special threads use existing machinery — don't override.
    if (kind === 'question' || kind === 'nonverbal' || kind === 'rumor') return null;
    // Offers use the focused trade shape — already dialogue-driven.
    if (kind === 'offer') return null;

    const pv = typeof this.playerVoice === 'function' ? this.playerVoice() : null;
    const voice = (blunt, soft, plain) => {
      if (!pv) return plain;
      if (pv.voiceClass === 'blunt') return blunt;
      if (pv.voiceClass === 'soft') return soft;
      return plain;
    };

    // Doubts unlock confrontation — contextual, not menued.
    const hasDoubts = (() => {
      try { return this.getDoubts && this.getDoubts(vid).length > 0; } catch (e) { return false; }
    })();

    // THREAD DRY (2026-10-06): "tell me more" is honest only while the thread
    // has beats. Once dry, offering it again just loops the admission line
    // forever — drop it and let the thread wind down (react / subject change
    // / leave). The marker is thread-specific (threadDryFor), so a new thread
    // re-enables the option automatically.
    const threadDry = !!(c.thread && c.threadDryFor && c.thread === c.threadDryFor);

    if (kind === 'share') {
      // They told you something. Respond to IT.
      if (!threadDry) out.push({ id: 'dlg:more', label: voice('"Go on."', '"Tell me more."', '"And then?"') });
      out.push({ id: 'dlg:react', label: voice('"Huh."', '"Oh wow."', '"I see."') });
      if (hasDoubts) out.push({ id: 'dlg:doubt', label: '"That doesn\'t quite add up."' });
      // Theorize surfaces contextually on mystery beats.
      const lastThem = [...(c.transcript || [])].reverse().find(e => e.who === 'them');
      const text = lastThem ? String(lastThem.text || '').toLowerCase() : '';
      if (/system|monster|strange|weird|don't understand|why/.test(text)) {
        out.push({ id: 'dlg:theorize', label: '"What do you think it means?"' });
      }
    } else if (kind === 'feel') {
      // They're feeling something. Acknowledge it.
      out.push({ id: 'dlg:comfort', label: voice('"You alright?"', '"Are you okay?"', '"Hey — you alright?"') });
      out.push({ id: 'dlg:empathize', label: voice('"Yeah. I get it."', '"That sounds really hard."', '"I hear you."') });
      out.push({ id: 'dlg:askwhy', label: '"What happened?"' });
    } else if (kind === 'want') {
      // They need something. Engage or decline kindly.
      out.push({ id: 'dlg:help', label: '"How can I help?"' });
      out.push({ id: 'dlg:details', label: '"Tell me more about it."' });
      out.push({ id: 'dlg:cant', label: voice('"Can\'t right now."', '"I wish I could, but not right now."', '"Not right now, sorry."') });
    } else {
      // Small talk — natural responses.
      // NOTE: this dialogueResponses is OVERRIDDEN by convo-beats.js (beat-tagged
      // replies) — the live menu builder. Menu-shape changes belong there; the
      // dlg: turn handlers below are still live (convo-beats wraps convoTurn).
      if (!threadDry) out.push({ id: 'dlg:more', label: voice('"Yeah?"', '"Mmhm."', '"Go on."') });
      out.push({ id: 'dlg:react', label: voice('"Huh."', '"Oh nice."', '"I see."') });
    }

    // Party invite — contextual on positive beats with trust.
    try {
      const trust = (this.state.village.trust || {})[vid] || 10;
      if (this.state.systemArrived && this.partyUnlocked && this.partyUnlocked() &&
          !this.inParty(vid) && !this.partyFull() && this.hasDiscovered('party') &&
          trust >= 20 && (kind === 'share' || kind === 'small')) {
        out.push({ id: 'dlg:invite', label: '"Want to come with us?"' });
      }
    } catch (e) {}

    // Subject change — the old topic menu, explicitly framed.
    out.push({ id: 'dlg:subject', label: '"Can I ask you something else?"' });
    // Leave is always available.
    out.push({ id: 'leave', label: c.exchanges === 0 ? '"Nice talking to you."' : '"I should go."' });

    return out;
  };

  // ============ DIALOGUE TURN HANDLERS ============
  // These process the dialogue responses. They hook into existing systems —
  // we're changing what's OFFERED, not how it's processed.

  const origTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    const c = this.convoGet(vid);

    // Dialogue responses — handle here, then delegate.
    if (choiceId && choiceId.indexOf('dlg:') === 0) {
      const dlg = choiceId.slice(4);

      if (dlg === 'subject') {
        // Explicit subject change — open the topic menu.
        c.choosingSubject = true;
        c.transcript.push({ who: 'you', text: '"Can I ask you something else?"' });
        const line = '"Sure — what\'s on your mind?"';
        c.transcript.push({ who: 'them', text: line });
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'more') {
        // "Tell me more" — continue the thread.
        c.transcript.push({ who: 'you', text: '"Tell me more."' });
        const beat = this.convoThreadBeat(vid);
        if (beat) {
          c.threadDryFor = null; // thread is alive — clear any stale dry marker
          c.transcript.push({ who: 'them', text: beat });
          this.sayLine(vid, beat);
          // Trust: engaging builds it.
          try { this.trustGain(vid, 1); } catch (e) {}
          return { line: beat, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
        }
        // Thread's dry — honest admission, once. Mark the thread dry so the
        // menu stops offering "tell me more" and winds down instead.
        c.threadDryFor = c.thread;
        const line = '"That\'s... pretty much all of it, honestly."';
        c.transcript.push({ who: 'them', text: line });
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'react') {
        // Generic acknowledgment — small trust, thread continues loosely.
        const reacts = ['"Huh."', '"I see."', '"Yeah."'];
        const youSaid = reacts[Math.floor(Math.random() * reacts.length)];
        c.transcript.push({ who: 'you', text: youSaid });
        try { this.trustGain(vid, 0.5); } catch (e) {}
        // They continue or wind down naturally. On a dry thread, don't fish
        // for beats — go straight to the wind-down.
        const dry = c.thread && c.threadDryFor && c.thread === c.threadDryFor;
        // WIND-DOWN (dialogue rethink, Steve 2026-10-07): dry "Anyway."
        // loops forever — after two of them the menu stops offering the
        // react (convo-beats.js reads c.reactDryCount).
        if (dry) c.reactDryCount = (c.reactDryCount || 0) + 1;
        const beat = (!dry && Math.random() < 0.6) ? this.convoThreadBeat(vid) : null;
        if (beat) {
          c.threadDryFor = null;
          c.transcript.push({ who: 'them', text: beat });
          this.sayLine(vid, beat);
          return { line: beat, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
        }
        const line = '"Anyway." A small smile.';
        c.transcript.push({ who: 'them', text: line });
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'comfort' || dlg === 'empathize') {
        // Emotional engagement — real trust, mood shift.
        const youSaid = dlg === 'comfort' ? '"Are you okay?"' : '"That sounds really hard."';
        c.transcript.push({ who: 'you', text: youSaid });
        try {
          this.trustGain(vid, 2);
          if (typeof this.convoMoodShift === 'function') this.convoMoodShift(vid, 1);
        } catch (e) {}
        // They open up a little more, or accept the comfort.
        const lines = [
          '"Thanks. ...Thanks for saying that."',
          '"I — yeah. It helps, hearing that."',
          '"You\'re kind. Don\'t let this place change that."',
        ];
        const line = this.voiceLine ? this.voiceLine(vid, lines[Math.floor(Math.random() * lines.length)]) : lines[0];
        c.transcript.push({ who: 'them', text: line });
        this.sayLine(vid, line);
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'askwhy') {
        // "What happened?" — they tell the story.
        c.transcript.push({ who: 'you', text: '"What happened?"' });
        const beat = this.convoThreadBeat(vid);
        const line = beat || '"Long story. ...Maybe another time."';
        c.transcript.push({ who: 'them', text: line });
        this.sayLine(vid, line);
        try { this.trustGain(vid, 1); } catch (e) {}
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'help') {
        // "How can I help?" — engage with their want (Steve 2026-10-06).
        // The NPC must STATE the favor concretely, not loop on "Here's the thing —".
        c.transcript.push({ who: 'you', text: '"How can I help?"' });
        try { this.trustGain(vid, 2); } catch (e) {}
        // Get the specific favor from the want system, or generate one.
        let favorLine = null;
        try {
          const want = c.want;
          if (want && want.id === 'ask_favor') {
            // State a concrete favor based on NPC needs (Steve 2026-10-06).
            const n = this.npcNeeds ? this.npcNeeds(vid) : {};
            if (n.hunger > 70) favorLine = '"Really? ...Okay. Food. Anything you can spare - I\'m running on empty."';
            else if (n.fear > 70) favorLine = '"Really? ...Okay. Just - stay close tonight? I don\'t want to be alone when it gets dark."';
            else if (n.energy < 30) favorLine = '"Really? ...Okay. Could you take my watch for a bit? I\'m running on empty."';
            else favorLine = '"Really? ...Okay. I need an extra pair of hands tomorrow. Can you help?"';
          } else {
            favorLine = '"Really? ...Thank you. I\'ll let you know what I need."';
          }
        } catch (e) {
          favorLine = '"Really? ...Thank you for offering."';
        }
        const line = favorLine;
        c.transcript.push({ who: 'them', text: line });
        this.sayLine(vid, line);
        // Mark help offered AND resolve the want so we don't loop.
        // The favor is now stated; the beat should move on.
        c.offeredHelp = true;
        if (c.want) c.want.stage = 1; // engaged, not looping
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'details') {
        // "Tell me more about it" — want details.
        c.transcript.push({ who: 'you', text: '"Tell me more about it."' });
        const beat = this.convoThreadBeat(vid);
        const line = beat || '"It\'s... complicated. But thank you for asking."';
        c.transcript.push({ who: 'them', text: line });
        this.sayLine(vid, line);
        try { this.trustGain(vid, 1); } catch (e) {}
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'cant') {
        // Kind decline — small trust cost, honest.
        c.transcript.push({ who: 'you', text: '"I can\'t right now."' });
        try {
          const t = this.state.village.trust || {};
          t[vid] = Math.max(0, (t[vid] || 10) - 1);
        } catch (e) {}
        const line = '"Oh. ...No, I get it. Thanks for being straight with me."';
        c.transcript.push({ who: 'them', text: line });
        this.sayLine(vid, line);
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'doubt') {
        // "That doesn't add up" — a SOFT PROBE, distinct from the hard
        // confrontation (the confront: choice, added by truth.js).
        // DETECTIVE (Steve 2026-10-06): this used to be a dead verb — a
        // flavor line with no mechanics sitting next to the real
        // confrontation, so players could pick it and never find the verb
        // that actually works. Now it's real: the probe rattles them and
        // mounts 'prodded' evidence on the first open doubt, which raises
        // the odds that a later hard confrontation cracks them (truth.js).
        // Distinct verb, real effect, honest fiction.
        c.transcript.push({ who: 'you', text: '"That doesn\'t quite add up."' });
        try {
          if (typeof this.convoMoodShift === 'function') this.convoMoodShift(vid, -1);
        } catch (e) {}
        let prods = 0;
        try {
          const doubts = (typeof this.getDoubts === 'function' && this.getDoubts(vid)) || [];
          const d = doubts[0];
          if (d) {
            d.evidence = d.evidence || [];
            const dayN = (this.state.scholar || {}).day || 0;
            d.evidence.push('prodded (day ' + dayN + ') — got careful');
            prods = d.evidence.filter(e => String(e).indexOf('prodded') === 0).length;
          }
        } catch (e) {}
        // The fiction tracks the pressure: repeated prods visibly rattle them.
        const line = prods <= 1
          ? '"...What\'s that supposed to mean?" Their voice goes careful.'
          : prods === 2
          ? '"What are you getting at?" A glance away, then back. They\'re choosing their words now.'
          : 'They\'re rattled — hands busy, eyes everywhere but on you. "I\'ve told you what I\'ve told you."';
        c.transcript.push({ who: 'them', text: line });
        this.sayLine(vid, line);
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'theorize') {
        // "What do you think it means?" — route to theorize.
        c.transcript.push({ who: 'you', text: '"What do you think it means?"' });
        // Delegate to the existing theorize handler.
        return origTurn.call(this, vid, 'theorize');
      }

      if (dlg === 'invite') {
        // "Want to come with us?" — route to party invite.
        c.transcript.push({ who: 'you', text: '"Want to come with us?"' });
        return origTurn.call(this, vid, 'invite_party');
      }
    }

    // Not a dialogue choice — delegate to the original handler.
    return origTurn.call(this, vid, choiceId);
  };

  // ============ HOOK INTO CHOICE GENERATION ============
  // Prepend dialogue responses to the menu. The old systems still work —
  // they're just no longer the default. Questions keep priority.

  const origChoices = Game.convoChoices;
  Game.convoChoices = function (vid) {
    const c = this.convoGet(vid);
    // If we're explicitly choosing a subject, use the old menu directly.
    // (The dialogue layer sent us here via dlg:subject.)
    if (c.choosingSubject) {
      const choices = origChoices.call(this, vid);
      // choosingSubject is cleared by the ask: handler; ensure it's set.
      return choices;
    }
    // Get dialogue responses for the current beat.
    let dlgResponses = null;
    try { dlgResponses = this.dialogueResponses(vid); } catch (e) {}
    // If the beat kind defers to existing machinery (question/offer/etc.),
    // or we're mid-thread with follow-ups, use the original menu.
    // The dialogue layer activates on share/feel/want/small beats.
    if (!dlgResponses) return origChoices.call(this, vid);

    // Dialogue responses lead. The old menu is available via subject change.
    // We still append leave (already in dlgResponses) — no duplication.
    return dlgResponses;
  };

  // Expose the feature map for tests and documentation.
  Game.DIALOGUE_FEATURE_MAP = DIALOGUE_FEATURE_MAP;

  // WANT POST-TURN (dialogue rethink, Steve 2026-10-07): the dlg: branch of
  // the convoTurn wrapper above returns early, which bypassed convo-wants'
  // turn wrapper entirely — wants never surfaced, beats never composed, and
  // the want arc never advanced on the live dialogue path. Run the shared
  // post-turn for dlg: choices here. Non-dlg: choices are covered by the
  // wants wrapper inside; this only fires for 'dlg:' ids, so it never
  // double-processes. convo-beats.js wraps outside this and only intercepts
  // 'dlg:subject', which skips this hook once — acceptable.
  const _dlgTurnInner = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    const r = _dlgTurnInner.call(this, vid, choiceId);
    if (r && !r.ended && typeof choiceId === 'string' && choiceId.indexOf('dlg:') === 0 &&
        typeof this.convoWantPostTurn === 'function') {
      try { return this.convoWantPostTurn(vid, choiceId, r) || r; } catch (e) { return r; }
    }
    return r;
  };
})();
