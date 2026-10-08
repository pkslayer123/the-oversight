// @ontology
// system: convo-wants
// description: Want-driven conversation architecture. Every conversation has an NPC want that gives it direction; beats acknowledge what the player said; endings plant seeds for next time.
// provides:
//   - convoSelectWant(vid) -> want object
//   - convoWantOpener(vid, want) -> {line, thread}
//   - convoComposeBeat(vid, rawBeat, playerSaid) -> composed beat that acknowledges the player
//   - convoPlantSeed(vid, seed)
//   - convoCheckSeeds(vid) -> pending seed or null
//   - convoAdvanceWant(vid, playerChoiceKind)
// rules:
//   - want_driven: every conversation selects one NPC want at start; the want shapes the opening and provides beats (code: convoSelectWant, Steve 2026-10-06)
//   - beat_acknowledgment: NPC beats must acknowledge the player's last utterance before delivering new content — no non-sequiturs (code: convoComposeBeat, Steve 2026-10-06)
//   - seeds: unresolved wants plant seeds; next conversation opens with the seed (code: convoPlantSeed/convoCheckSeeds, Steve 2026-10-06)
//   - arc: want stages 0 (unspoken) -> 1 (surfaced) -> 2 (engaged) -> 3 (resolved); endings record the resolution (code: convoAdvanceWant, Steve 2026-10-06)
// consumes:
//   - village.villagers
//   - state.convos
//   - npcNeeds (hunger/fear/social/energy)
// ============ CONVERSATION WANTS ============
// Structural rethink (Steve 2026-10-06): conversations were a reactive
// choice-menu with no direction — the NPC had nothing they wanted, beats
// didn't respond to what the player said, and endings evaporated.
//
// Now: every conversation has an NPC WANT. The want is selected from their
// needs, personality, unresolved seeds, and recent events. It gives the
// conversation a shape: the want surfaces, the player engages or deflects,
// and the ending plants a seed for next time.
//
// Beats go through convoComposeBeat, which ensures the NPC's line
// acknowledges what the player just said before delivering new content.
// No more non-sequiturs: if you ask about their past, they don't answer
// with a burdock lesson.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ============ WANT DEFINITIONS ============
  // Each want: what the NPC wants from this conversation.
  // - pick(vid): weight for selection (higher = more likely)
  // - opener(vid): the opening line when this want drives the conversation
  // - thread: the conversation thread this want lives in
  // - engage(vid): beat when the player engages with the want
  // - deflect(vid): beat when the player deflects/ignores it
  // - resolve(vid, how): what happens at the end; returns a seed or null
  const WANTS = {
    share_news: {
      thread: 'small',
      pick(vid) {
        // They've seen something, heard something — bursting to tell.
        // More likely if they haven't talked in a while.
        const c = Game.convoGet(vid);
        const daysSince = (Game.state.scholar.day || 0) - (c.lastDay || 0);
        return daysSince > 2 ? 3 : 1;
      },
      opener(vid) {
        const news = [
          '"You\'ll never guess what I saw by the treeline."',
          '"Okay, so — something happened this morning."',
          '"Have you heard? No? Good, I get to tell you first."',
        ];
        return Game.convoPickCycle(vid, 'want:news:open', news);
      },
      engage(vid) {
        return Game.convoPickCycle(vid, 'want:news:engage', [
          '"Right? I knew you\'d get it. Nobody else listens like that."',
          '"See, this is why I tell you things."',
        ]);
      },
      deflect(vid) {
        return '"Oh. Right. Never mind — it\'s probably nothing." They look a little deflated.';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null; // fully shared, no seed
        // They didn't get to tell you — they'll try again.
        return { wantId: 'share_news', note: 'that news they were bursting to share' };
      },
    },
    ask_favor: {
      thread: 'personal',
      pick(vid) {
        // High need drives favors: hungry, scared, tired.
        try {
          const n = Game.npcNeeds(vid);
          if (n.hunger > 70 || n.fear > 70 || n.energy < 30) return 4;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        try {
          const n = Game.npcNeeds(vid);
          if (n.hunger > 70) return '"I hate to ask, but — do you have anything to eat? Anything at all?"';
          if (n.fear > 70) return '"Can you — would you stay close tonight? I don\'t want to be alone when it gets dark."';
          if (n.energy < 30) return '"I\'m running on empty. Could you take my watch for a bit?"';
        } catch (e) {}
        return Game.convoPickCycle(vid, 'want:favor:open', [
          '"There\'s something I\'ve been meaning to ask you."',
          '"Could you do something for me? It\'s not big. Probably."',
        ]);
      },
      engage(vid) {
        return '"Thank you. Seriously — thank you. I wouldn\'t ask if it wasn\'t important."';
      },
      deflect(vid) {
        return '"No, yeah, of course. Forget I asked." They won\'t forget. They\'ll just stop asking.';
      },
      resolve(vid, how) {
        if (how === 'engaged') {
          // They owe you now — that's a seed (Phase 1: real wantId).
          return { wantId: 'repay', note: 'the favor they still owe you for' };
        }
        return { wantId: 'ask_favor', note: 'the help they asked you for' };
      },
    },
    // repay: they owe you one. Seed-driven only — pick() returns 0 so it
    // never surfaces spontaneously. Debts unpaid just sit there (Phase 1,
    // Steve 2026-10-08: the dead 'repay' seed gets a real wantId).
    repay: {
      thread: 'personal',
      pick(vid) { return 0; },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:repay:open', [
          '"I\'ve been thinking about what you did for me. I don\'t like owing."',
          '"About last time — I haven\'t forgotten. I want to make it right."',
        ]);
      },
      engage(vid) {
        return '"Good. Then we\'re square." They look lighter for it.';
      },
      deflect(vid) {
        return '"Right. Forget it." They won\'t forget. Debts unpaid just sit there.';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null; // repaid, debt clear
        return { wantId: 'repay', note: 'the favor they still owe you for' };
      },
    },
    seek_comfort: {
      thread: 'personal',
      pick(vid) {
        try {
          const n = Game.npcNeeds(vid);
          if (n.fear > 60) return 3;
        } catch (e) {}
        // Grieving or scared mood also drives this.
        try {
          const m = Game.npcMood(vid);
          if (m === 'grieving' || m === 'scared') return 3;
        } catch (e) {}
        return 0.5;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:comfort:open', [
          '"Do you ever — no. Never mind." They don\'t look away, though. They want you to ask.',
          '"I\'m not okay. I\'m saying it out loud so it\'s real: I\'m not okay."',
        ]);
      },
      engage(vid) {
        return '"It helps. Just — saying it out loud to someone who\'s actually listening. It helps."';
      },
      deflect(vid) {
        return '"Right. Sorry. I\'m fine." They are very obviously not fine.';
      },
      resolve(vid, how) {
        if (how === 'engaged') return null;
        return { wantId: 'seek_comfort', note: 'whatever\'s been weighing on them' };
      },
    },
    warn_you: {
      thread: 'small',
      pick(vid) {
        // They know something dangerous. More likely after monster activity.
        try {
          const v = Game.state.village;
          if ((v.recentAttacks || 0) > 0) return 3;
        } catch (e) {}
        return 0.5;
      },
      opener(vid) {
        return '"Listen. I need you to hear this before you go back out there."';
      },
      engage(vid) {
        return '"Good. Just — be careful. I mean it."';
      },
      deflect(vid) {
        return '"...Suit yourself. Don\'t say I didn\'t try."';
      },
      resolve(vid, how) {
        return null; // warning delivered or not, no seed
      },
    },
    curious: {
      thread: 'personal',
      pick(vid) {
        // They want to know about YOU. More likely at higher trust.
        try {
          const t = (Game.state.village.trust || {})[vid] || 10;
          if (t >= 40) return 2;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:curious:open', [
          '"Can I ask you something? Something real?"',
          '"I realize I don\'t actually know much about you."',
        ]);
      },
      engage(vid) {
        return '"Huh. I wouldn\'t have guessed that about you."';
      },
      deflect(vid) {
        return '"Fair enough. Some things aren\'t for sharing."';
      },
      resolve(vid, how) {
        // Engaged: they know something real now. The closeness lives in
        // the trust the engagement built — no seed needed (Phase 1: the
        // dead 'closeness' seed is cut, not faked).
        return null;
      },
    },
    just_company: {
      thread: 'small',
      pick(vid) {
        try {
          const n = Game.npcNeeds(vid);
          if (n.social > 70) return 3;
        } catch (e) {}
        return 1;
      },
      opener(vid) {
        return Game.convoPickCycle(vid, 'want:company:open', [
          '"Hey. Got a minute? No reason. Just — hey."',
          '"Mind if I just sit with you for a bit?"',
        ]);
      },
      engage(vid) {
        return '"This is nice. Just — being around people. I forget how much I need it."';
      },
      deflect(vid) {
        return '"Oh. Yeah, of course. I\'ll — I\'ll go."';
      },
      resolve() { return null; },
    },
  };

  const methods = {
    // convoSelectWant: pick the NPC's want for this conversation.
    // Priority: unresolved seeds > high needs > personality > random.
    convoSelectWant(vid) {
      // 1. Seeds first — unfinished business takes priority.
      const seed = this.convoCheckSeeds(vid);
      if (seed && WANTS[seed.wantId]) {
        return { id: seed.wantId, def: WANTS[seed.wantId], fromSeed: true, seedNote: seed.note };
      }
      // 2. Weight by needs and context.
      let best = null, bestW = -1;
      for (const [id, def] of Object.entries(WANTS)) {
        let w = 0;
        try { w = def.pick.call(this, vid); } catch (e) { w = 0; }
        // Small random factor so it's not deterministic.
        w += Math.random() * 0.5;
        if (w > bestW) { bestW = w; best = id; }
      }
      if (!best) best = 'just_company';
      return { id: best, def: WANTS[best], fromSeed: false };
    },

    // convoWantOpener: the opening line when a want drives the conversation.
    // Returns {line, thread}. Falls back to the normal opener if no want.
    convoWantOpener(vid, want) {
      if (!want || !want.def) return null;
      let line = null;
      try { line = want.def.opener.call(this, vid); } catch (e) { line = null; }
      if (!line) return null;
      return { line, thread: want.def.thread || 'small', wantId: want.id };
    },

    // convoComposeBeat: THE NON-SEQUITUR FIX.
    // Every NPC beat goes through here. It takes the raw beat and the
    // player's last utterance, and ensures the beat acknowledges what the
    // player said before delivering new content.
    //
    // playerSaid: { kind, label, topic } — what the player just chose/said
    // rawBeat: the beat the old system would have delivered
    //
    // The composition: if the raw beat already references the player's
    // input (contains a response to their question/statement), pass through.
    // Otherwise, prepend a brief acknowledgment that bridges to the beat.
    convoComposeBeat(vid, rawBeat, playerSaid) {
      if (!rawBeat) return rawBeat;
      if (!playerSaid || !playerSaid.label) return rawBeat;
      // If the beat is already a direct answer (reactive/generic answers,
      // question answers), it was composed as a response — pass through.
      if (playerSaid.isAnswer) return rawBeat;
      // Acknowledgment bridges: short, natural, voice-aware.
      // These acknowledge WITHOUT answering — the beat still delivers
      // its content, but now it follows the player's line of thought.
      const label = String(playerSaid.label).toLowerCase();
      let ack = null;
      if (/tell me more|go on|more/i.test(playerSaid.label)) {
        // They're asking for more — no ack needed, the beat IS more.
        return rawBeat;
      }
      if (playerSaid.topic) {
        // Player asked about a topic — acknowledge the question.
        const topicAcks = [
          '"Good question." ',
          '"Huh. Let me think about that." ',
          '"You want to know about that? Okay." ',
        ];
        ack = topicAcks[Math.floor(Math.random() * topicAcks.length)];
      } else if (/you|your/i.test(label) && label.length < 60) {
        // Player asked about THEM — acknowledge being asked.
        ack = '"Me? Okay." ';
      }
      if (!ack) return rawBeat;
      // Voice the acknowledgment through their voice, then the beat.
      // QUOTE HYGIENE (dialogue rethink, Steve 2026-10-07): the old code
      // stripped the beat's quotes and never re-added them, leaving the
      // beat's closing quote dropped. The beat keeps its own quote layer.
      try {
        return String(this.voiceLine ? this.voiceLine(vid, ack) : ack).replace(/\s+$/, '') + ' ' + rawBeat;
      } catch (e) {
        return String(ack).replace(/\s+$/, '') + ' ' + rawBeat;
      }
    },

    // convoAdvanceWant: track the want's progress based on player behavior.
    // playerKind: 'engage' | 'deflect' | 'ignore'
    // Moves stage 0->1 (surfaced) -> 2 (engaged) -> 3 (resolved).
    convoAdvanceWant(vid, playerKind) {
      const c = this.convoGet(vid);
      if (!c.want) return;
      const want = c.want;
      if (playerKind === 'engage') {
        if (want.stage < 2) want.stage = 2;
        // Engaging delivers the want's engage beat.
        try {
          const beat = want.def.engage.call(this, vid);
          if (beat) {
            c.transcript.push({ who: 'them', text: beat });
            this.sayLine(vid, beat);
          }
        } catch (e) {}
      } else if (playerKind === 'deflect') {
        try {
          const beat = want.def.deflect.call(this, vid);
          if (beat) {
            c.transcript.push({ who: 'them', text: beat });
            this.sayLine(vid, beat);
          }
        } catch (e) {}
        want.stage = 3;
        want.resolution = 'deflected';
      }
    },

    // convoPlantSeed: record unfinished business for next conversation.
    // seed: { wantId, note, day }
    convoPlantSeed(vid, seed) {
      if (!seed || !seed.wantId) return;
      const v = this.state.village;
      v.convoSeeds = v.convoSeeds || {};
      v.convoSeeds[vid] = {
        wantId: seed.wantId,
        note: seed.note || '',
        day: this.state.scholar.day || 0,
      };
    },

    // convoCheckSeeds: is there unfinished business with this NPC?
    // Returns the seed or null. Seeds expire after 7 days.
    convoCheckSeeds(vid) {
      const v = this.state.village;
      const seed = (v.convoSeeds || {})[vid];
      if (!seed) return null;
      const now = this.state.scholar.day || 0;
      if (now - (seed.day || 0) > 7) {
        delete v.convoSeeds[vid];
        return null;
      }
      return seed;
    },

    // convoResolveWant: called at endConvo. Determines the resolution
    // and plants a seed if the want is unresolved.
    convoResolveWant(vid, how) {
      const c = this.convoGet(vid);
      if (!c.want || !c.want.def) return;
      const want = c.want;
      // PHANTOM SEEDS (dialogue rethink, Steve 2026-10-07): a want that never
      // surfaced (stage 0) was never established — planting a seed for it
      // makes the next conversation reference unfinished business the player
      // never heard ("About they still need help but stopped asking — ...").
      // Unfinished business must be established to be unfinished.
      if ((want.stage || 0) < 1) {
        want.stage = 3;
        want.resolution = 'unestablished';
        // Clear the consumed seed if this want came from one.
        if (want.fromSeed) {
          try { delete this.state.village.convoSeeds[vid]; } catch (e) {}
        }
        return;
      }
      // If they never engaged (stage < 2), the want is unresolved.
      // A deflect already recorded its resolution ('deflected') — never
      // overwrite it with 'engaged' (Phase 1 fix, Steve 2026-10-08).
      const resolution = want.resolution ||
        (want.stage >= 2 ? 'engaged' : (how === 'left' ? 'abandoned' : 'unresolved'));
      want.stage = 3;
      want.resolution = resolution;
      let seed = null;
      try {
        seed = want.def.resolve.call(this, vid, resolution);
      } catch (e) {}
      if (seed) this.convoPlantSeed(vid, seed);
      // Clear the consumed seed if this want came from one.
      if (want.fromSeed) {
        try { delete this.state.village.convoSeeds[vid]; } catch (e) {}
      }
    },

    // convoWant: the dialogue layer's read of the current want (id string).
    // dialogueBeatKind references this; it was never defined, so the
    // want-aware classification silently never fired (rethink 2026-10-07).
    convoWant(vid) {
      try { const c = this.convoGet(vid); return (c.want && c.want.id) || null; }
      catch (e) { return null; }
    },

    // convoWantPostTurn: the shared post-turn work for the want system —
    // surfacing unspoken wants, composing beats, advancing the want arc.
    // Extracted from the convoTurn wrapper below so the dialogue layer
    // (convo-dialogue.js), which returns early for dlg: choices and used to
    // bypass this whole system, can run the same post-turn (rethink
    // 2026-10-07). Idempotent: safe to call once per turn from either path.
    convoWantPostTurn(vid, choiceId, result) {
      const c = this.convoGet(vid);
      // Turn counter for surfacing: c.exchanges never advances on the
      // dialogue path (dlg: handlers return before the base turn), so the
      // want system tracks its own post-turns (rethink 2026-10-07).
      const turns = (c.wantTurns = (c.wantTurns || 0) + 1);
      if (c.want && c.want.stage === 0 && turns >= 1) {
        // Time to surface the want. Queue it as a held beat so it lands
        // on the continuer — natural, not interruptive.
        const opener = this.convoWantOpener(vid, c.want);
        if (opener && opener.line) {
          c.heldBeats = c.heldBeats || [];
          // Don't duplicate if already queued.
          const already = c.heldBeats.some(h => h.wantSurface);
          if (!already) {
            c.heldBeats.push({ text: opener.line, wantSurface: true });
            c.want.stage = 1; // surfaced
            // The want's thread becomes the conversation thread if the
            // player engages — but we don't force it yet.
          }
        }
      }
      // BEAT COMPOSITION: wrap the returned line through the composer
      // so it acknowledges what the player just said.
      // We track the player's choice from the choiceId.
      if (result && result.line && choiceId && choiceId !== 'goon' && choiceId !== 'leave') {
        const playerSaid = this.convoPlayerSaid(vid, choiceId);
        if (playerSaid) {
          const composed = this.convoComposeBeat(vid, result.line, playerSaid);
          if (composed && composed !== result.line) {
            result.line = composed;
            // Update the transcript's last them-entry too.
            const t = c.transcript;
            for (let i = t.length - 1; i >= 0; i--) {
              if (t[i].who === 'them') { t[i].text = composed; break; }
            }
          }
        }
      }
      // WANT ARC: dialogue choices engage or deflect the want. Engaging
      // moves it toward resolution; deflecting closes it honestly.
      // (convoAdvanceWant previously had zero callers — rethink 2026-10-07.)
      if (c.want && typeof this.convoAdvanceWant === 'function') {
        if (/^dlg:(help|comfort|empathize)$/.test(choiceId || '')) {
          try { this.convoAdvanceWant(vid, 'engage'); } catch (e) {}
        } else if ((choiceId || '') === 'dlg:cant') {
          try { this.convoAdvanceWant(vid, 'deflect'); } catch (e) {}
        }
      }
      return result;
    },
  };

  Object.assign(Game, methods);

  // ============ HOOKS ============
  // Layer the want system onto the existing conversation flow.
  // We wrap startConvo (want selection + opener) and endConvo (resolution + seeds).
  // The beat composition hook integrates into convoTurn via convoBeatOf.

  const _startConvo = Game.startConvo;
  Game.startConvo = function (vid) {
    // Select the want BEFORE the original startConvo runs, so we can
    // override the opener if the want has one.
    let want = null;
    try { want = this.convoSelectWant(vid); } catch (e) {}
    const result = _startConvo.call(this, vid);
    if (!result || result.ended) return result;
    // If the want has a bespoke opener and this isn't a seed-driven
    // conversation that already set its tone, layer it in.
    // (We don't replace the original opener — we let the want shape
    // the SECOND beat, so the greeting stays natural and the want
    // surfaces organically after hello.)
    if (want && want.def) {
      const c = this.convoGet(vid);
      c.want = { id: want.id, def: want.def, stage: 0, fromSeed: !!want.fromSeed };
      // If this want came from a seed, surface it immediately —
      // they have unfinished business and it shows.
      if (want.fromSeed) {
        try {
          const opener = this.convoWantOpener(vid, want);
          if (opener && opener.line) {
            // QUOTE HYGIENE (dialogue rethink, Steve 2026-10-07): the old
            // composition left a stray quote (`— " There...`), mangling the line.
            const seedLine = `"About ${want.seedNote || 'last time'} — ` +
              opener.line.replace(/^"/, '').replace(/"$/, '') + '"';
            c.transcript.push({ who: 'them', text: seedLine });
            this.sayLine(vid, seedLine);
            result.line = seedLine;
            c.want.stage = 1; // surfaced
            // UNFINISHED BUSINESS (dialog rethink Phase 1, Steve 2026-10-08):
            // seed-driven conversations open one mood band cooler. Whatever
            // was left hanging, it wasn't nothing — the air is heavier.
            if (typeof this.convoMoodShift === 'function') this.convoMoodShift(vid, -1);
          }
        } catch (e) {}
      }
    }
    return result;
  };

  const _endConvo = Game.endConvo;
  Game.endConvo = function (vid, how) {
    // Resolve the want and plant seeds BEFORE the original endConvo
    // clears the conversation state.
    try { this.convoResolveWant(vid, how); } catch (e) {}
    return _endConvo.call(this, vid, how);
  };

  // ============ WANT SURFACING ============
  // The want surfaces organically after the greeting — not as the opener
  // (that's abrupt), but as the second or third beat. We wrap convoTurn:
  // after the normal turn completes, if the want is still unspoken (stage 0)
  // and enough exchanges have passed, the NPC brings it up.
  const _convoTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    const result = _convoTurn.call(this, vid, choiceId);
    if (!result || result.ended) return result;
    try {
      // Shared post-turn (see convoWantPostTurn): the dialogue layer calls
      // the same method for dlg: choices, which used to bypass this wrapper.
      if (typeof this.convoWantPostTurn === 'function') {
        return this.convoWantPostTurn(vid, choiceId, result) || result;
      }
    } catch (e) {}
    return result;
  };

  // convoPlayerSaid: reconstruct what the player just said from the choiceId.
  // Returns { label, topic, isAnswer } for the beat composer.
  Game.convoPlayerSaid = function (vid, choiceId) {
    try {
      const c = this.convoGet(vid);
      // Ask-topic choices carry the topic.
      if (choiceId.indexOf('ask:') === 0) {
        const topic = choiceId.slice(4);
        return { label: 'ask:' + topic, topic, isAnswer: false };
      }
      // Answers to their questions are already responses — pass through.
      if (choiceId.indexOf('ans:') === 0 || choiceId.indexOf('react:') === 0 ||
          choiceId.indexOf('gq:') === 0) {
        return { label: choiceId, isAnswer: true };
      }
      // Follow-ups reference the topic.
      if (choiceId.indexOf('follow:') === 0) {
        const parts = choiceId.split(':');
        return { label: 'follow:' + parts[1], topic: parts[1], isAnswer: false };
      }
      return { label: choiceId, isAnswer: false };
    } catch (e) { return null; }
  };

})();

