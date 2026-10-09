// @ontology
// system: convo-dialogue
// description: Dialogue-driven conversation turn handling. Phase 1 (2026-10-08): the dead menu layers are gone — dialogueBeatKind/dialogueResponses and the convoChoices override were removed; the single menu builder is Game.buildMenu (conversation.js). This module now wraps Game.convoTurn with dlg: handlers and want post-turn processing.
// provides:
//   - convoTurn(vid, choiceId) -> dlg: beat handlers + want post-turn wrapper (menu building delegated to Game.buildMenu)
// rules:
//   - beat_drives_menu: responses derive from the NPC's last utterance, not from state flags (code: buildMenu, Steve 2026-10-06; Phase 1 unified 2026-10-08)
//   - no_feature_cut: every existing conversation feature remains reachable — mapped, not removed (code: DIALOGUE_FEATURE_MAP, Steve 2026-10-06)
//   - subject_change_explicit: the topic grab-bag lives behind "talk about something else", never as the default (code: buildMenu, Steve 2026-10-06)
//   - thread_dry_collapse: "tell me more" is offered only while the thread has beats — once dry, the option disappears and the menu winds down instead of looping the admission line (code: buildMenu + dlg:more/dlg:react, 2026-10-06)
//   - substantive_light_set: bare acknowledgments (goon/leave/recap/dlg:react/dlg:more/agree/joke/silence/nv:nod/nv:smile/nv:pointself) never flip c.substantive — only real engagement earns endConvo's uncapped mood residue (code: convoTurn wrapper, break-it 2026-10-09)
//   - soft_probe_mounts_evidence: "That doesn't add up" is a real verb, not flavor — it mounts 'prodded' evidence on the first open doubt and the NPC visibly rattles with repeated prods (code: dlg:doubt handler, Steve 2026-10-06)
// consumes:
//   - village.villagers
//   - state.convos
//   - convoGet(vid)
//   - buildMenu(vid) / convoChoices(vid) (conversation.js — the single menu pipeline)
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

  // NOTE (dialog rethink Phase 1, Steve 2026-10-08): beat classification
  // and response generation now live in exactly one place —
  // Game.beatMenuResponses in convo-beats.js, called by Game.buildMenu
  // in conversation.js. The dead dialogueBeatKind/dialogueResponses
  // that lived here (overridden by load order) were deleted.

  // ============ DIALOGUE TURN HANDLERS ============
  // These process the dialogue responses. They hook into existing systems —
  // we're changing what's OFFERED, not how it's processed.

  const origTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    const c = this.convoGet(vid);

    // SUBSTANCE (socialite break-it 2026-10-08): the uncapped mood residue
    // in endConvo must only linger on a REAL conversation — agree-spam
    // ("yeah", "tell me more", continuer taps) must not smuggle uncapped
    // trust past the 40 talk cap. This wrapper is the choke point: every
    // choice id passes through here (dlg: handled below, the rest
    // delegated). Anything but the light acknowledgments marks the
    // conversation substantive.
    // LIGHT SET, r2 (break-it 2026-10-09): the 2026-10-08 fix named
    // "yeah" (agree) in the comment but never added 'agree'/'joke'/
    // 'silence' to the exclusion — and missed the no-language menu's
    // gesture acks (nv:nod/smile/pointself). Pure acknowledgment spam
    // ("You're right." x6, or smile x6) flipped substantive=true, and
    // with the mood those acks pump, endConvo's uncapped residue fired
    // every conversation: measured 13->57 over 25 empty convos, straight
    // past the 40 talk cap. Nodding along is listening, not engaging —
    // it earns the capped talk stipend, never the residue. Answering a
    // direct question (react:*) IS engaging and stays substantive, as do
    // nv:listen (active language learning) and nv:translate (a real act
    // involving a third person).
    const _light = choiceId === 'goon' || choiceId === 'leave' || choiceId === 'recap' ||
      choiceId === 'dlg:react' || choiceId === 'dlg:more' ||
      choiceId === 'agree' || choiceId === 'joke' || choiceId === 'silence' ||
      choiceId === 'nv:nod' || choiceId === 'nv:smile' || choiceId === 'nv:pointself';
    if (c && c.active && typeof choiceId === 'string' && !_light) {
      c.substantive = true;
    }

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
          // Trust: engaging builds it. SCENE (Phase 2): through the resolver.
          try { this.resolveConsequence(vid, { trust: 1, temper: 'neutral', name: 'dlg:more' }); } catch (e) {}
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
        // SCENE (Phase 2): through the resolver.
        try { this.resolveConsequence(vid, { trust: 0.5, temper: 'neutral', name: 'dlg:react' }); } catch (e) {}
        // They continue or wind down naturally. On a dry thread, don't fish
        // for beats — go straight to the wind-down.
        const dry = c.thread && c.threadDryFor && c.thread === c.threadDryFor;
        // WIND-DOWN (dialogue rethink, Steve 2026-10-07; farm fix 2026-10-08):
        // every react that lands on no beat is a dead "Anyway." — count it
        // whether or not the thread was formally marked dry. A thread that
        // merely ran out of beats (never dried via dlg:more) used to offer
        // react forever, each tap printing +0.5 trust: an infinite trust
        // farm on a dead button. After two dead reacts in a row the menu
        // stops offering it (convo-beats.js reads c.reactDryCount); a landed
        // beat resets the count (see convoThreadBeat).
        const beat = (!dry && Math.random() < 0.6) ? this.convoThreadBeat(vid) : null;
        if (beat) {
          c.threadDryFor = null;
          c.transcript.push({ who: 'them', text: beat });
          this.sayLine(vid, beat);
          return { line: beat, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
        }
        c.reactDryCount = (c.reactDryCount || 0) + 1;
        const line = '"Anyway." A small smile.';
        c.transcript.push({ who: 'them', text: line });
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'comfort' || dlg === 'empathize') {
        // Emotional engagement — real trust, mood shift.
        const youSaid = dlg === 'comfort' ? '"Are you okay?"' : '"That sounds really hard."';
        c.transcript.push({ who: 'you', text: youSaid });
        // SCENE (Phase 2): through the resolver.
        try { this.resolveConsequence(vid, { trust: 2, mood: 1, temper: 'kind', name: 'dlg:' + dlg }); } catch (e) {}
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
        // SCENE (Phase 2): through the resolver.
        try { this.resolveConsequence(vid, { trust: 1, temper: 'kind', name: 'dlg:askwhy' }); } catch (e) {}
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'help') {
        // "How can I help?" — engage with their want (Steve 2026-10-06).
        // The NPC must STATE the favor concretely, not loop on "Here's the thing —".
        c.transcript.push({ who: 'you', text: '"How can I help?"' });
        // SCENE (Phase 2): through the resolver.
        try { this.resolveConsequence(vid, { trust: 2, temper: 'kind', name: 'dlg:help' }); } catch (e) {}
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
        // SCENE (Phase 2): through the resolver.
        try { this.resolveConsequence(vid, { trust: 1, temper: 'kind', name: 'dlg:details' }); } catch (e) {}
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }

      if (dlg === 'cant') {
        // Refusing a favor (dialog rethink Phase 1, Steve 2026-10-08):
        // kind in the moment, but it COOLS the mood and WRITES a
        // 'deflected' memory — they remember you turned them down
        // (HURT_KINDS:'deflected' in convo-mood.js). Honest, and honest
        // things leave marks.
        c.transcript.push({ who: 'you', text: '"I can\'t right now."' });
        // SCENE (Phase 2): through the resolver — cools mood AND writes
        // the 'deflected' memory (HURT_KINDS slot, wired Phase 1).
        try {
          this.resolveConsequence(vid, {
            trust: -1, mood: -1, temper: 'neutral',
            memory: { type: 'deflected', note: 'you turned down their ask' },
            name: 'dlg:cant',
          });
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
        // SCENE (Phase 2): through the resolver.
        try { this.resolveConsequence(vid, { mood: -1, temper: 'honest-hard', name: 'dlg:doubt' }); } catch (e) {}
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

  // NOTE (dialog rethink Phase 1, Steve 2026-10-08): the menu-dispatch
  // override that lived here is deleted. Game.buildMenu in conversation.js
  // is now the single menu builder; it calls Game.beatMenuResponses
  // (convo-beats.js) for the beat matrix. This file keeps the dlg: turn
  // handlers only.

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
