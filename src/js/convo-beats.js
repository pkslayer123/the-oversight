// @ontology
// system: convo-beats
// description: Beat-tagged conversation. Every NPC line is tagged at generation time with its beat (offer, question, news, feeling, small). Replies are generated from beat + topic, never a generic grab-bag. Topic changes carry explicit bridge lines.
// provides:
//   - threadBeatTag(thread) -> beat tag for a conversation thread
//   - Game.beatOf(vid) -> current beat {tag, topic, line}
//   - Game.bridgeLine(vid, fromTopic) -> contextual bridge when leaving a topic
//   - dialogueResponses(vid) -> beat+topic aware replies with variation
// rules:
//   - tag_at_source: every NPC line is tagged when generated, not classified after the fact (code: convo-beats.js wrapOpening/wrapThreadBeat, Steve 2026-10-06)
//   - beat_drives_replies: reply options derive from (beat, topic), never from state flags alone (code: dialogueResponses, Steve 2026-10-06)
//   - bridge_on_shift: topic changes speak a bridge line tied to the old topic; bridges cover every thread incl. theorize/taughtref/recall/request (code: bridgeLine/BRIDGES, Steve 2026-10-06; expanded 2026-10-07)
//   - no_repeat_replies: reply pools rotate via convoPickCycle — two conversations never show identical menus (code: dialogueResponses, Steve 2026-10-06)
//   - four_rules_kept: transcript_cap, one_beat_turns, tap_advance, history_view untouched (code: conversation.js ontology)
//   - continuer_kept: the dialogue menu offers the 'goon' continuer first when held beats are queued — the dialogue layer replaced the base menu that carried it, and without this, want surfacing and mood beats queued mid-conversation would die silently (code: dialogueResponses, 2026-10-07)
//   - probe_on_news_and_small: the "That doesn't add up" soft probe is offered on news and small beats (wherever the hard confrontation is reachable); withheld on feeling/offer beats (code: dialogueResponses, Steve 2026-10-06)
//   - want_beat_tags_canonical: want ID -> beat tag mapping lives in convo-wants.js WANT_BEAT_TAGS; threadBeatTag/beatOf consume it, never duplicate it (code: convo-beats.js, 2026-10-07)
//   - offer_menus_want_keyed: an offer beat's menu is keyed by want ID — ask_favor gets the favor menu, offer_teach the lesson menu, trade the trade menu (code: REPLY_POOLS.offer.wantPools/trade, dialogueResponses, 2026-10-07)
// consumes:
//   - village.villagers
//   - state.convos
//   - convoGet(vid)
//   - convoPickCycle(vid, key, pool)
//   - playerVoice()
//   - Game.wantBeatTag (convo-wants.js WANT_BEAT_TAGS)
// ============ BEAT-TAGGED CONVERSATION ============
// Steve 2026-10-06 (Idea: "Make every reply answer what's actually said"):
// Every NPC line IS an offer, a question, a news item, or a feeling — tagged
// at generation, not guessed afterward. Every reply option answers THAT beat
// on THAT topic. Topic changes speak a bridge, never a hard pivot.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ============ BEAT TAXONOMY ============
  // offer: they want something from you (trade, favor, request)
  // question: they're asking you directly (answered via existing machinery)
  // news: they're telling you something (goal, past, gossip, secret, village)
  // feeling: they're feeling something (grief, cheer, comfort-seeking)
  // small: chit-chat, companionship, nothing heavy
  const BEAT_TAGS = ['offer', 'question', 'news', 'feeling', 'small'];

  function threadBeatTag(thread, c) {
    if (!thread) return 'small';
    // Direct questions and offers — checked first, they own the menu.
    if (c && (c.pendingQ || (c.reactiveQ && c.reactiveQ.id) || c.genericQ)) return 'question';
    if (c && ((c.thread === 'trade' && c.pendingTrade) || c.pendingHawk)) return 'offer';
    switch (thread) {
      case 'request': return 'question';   // they asked to talk — there's a reason
      case 'secret': return 'news';
      case 'want': {
        // Distinguish by want ID (Steve 2026-10-06).
        // The canonical mapping lives in convo-wants.js (WANT_BEAT_TAGS) —
        // this file consumes it so the two can never drift apart.
        const wid = c && c.want && c.want.id;
        if (typeof Game.wantBeatTag === 'function' && wid) return Game.wantBeatTag(wid);
        if (wid === 'ask_favor') return 'offer';
        if (wid === 'seek_comfort') return 'feeling';
        if (wid === 'share_news') return 'news';
        if (wid === 'warn_you') return 'news';
        if (wid === 'curious') return 'question';
        if (wid === 'just_company') return 'small';
        return 'offer'; // fallback for unknown wants
      }
      case 'taughtref': return 'news';
      case 'recall': return 'news';
      case 'grief': return 'feeling';
      case 'cheer': return 'feeling';
      case 'goal': return 'news';
      case 'past': return 'news';
      case 'village': return 'news';
      case 'plans': return 'news';
      case 'personal': return 'news';
      case 'theorize': return 'news';
      case 'work': return 'news';
      case 'hopes': return 'news';
      case 'hardstory': return 'feeling'; // vulnerable — comfort beats answer it
      case 'gossip': return 'news';
      case 'small': return 'small';
      case 'trade': return 'offer';
      case 'nonverbal': return 'small';
      default: return 'news';
    }
  }
  Game.threadBeatTag = threadBeatTag;

  // ============ TAG AT THE SOURCE ============
  // Wrap the two line generators. Every NPC line leaves here carrying
  // its beat tag. No regex classification needed downstream.

  function tagResult(vid, result) {
    ensureTranscriptTagged(Game, vid);
    if (!result || !result.line) return result;
    const c = Game.convoGet(vid);
    const tag = threadBeatTag(result.thread, c);
    result.beat = tag;
    // Record the beat — this is what replies answer.
    c.lastBeat = { tag, topic: result.thread || c.thread || 'small', line: result.line };
    return result;
  }

  if (Game.convoOpening) {
    const origOpening = Game.convoOpening;
    Game.convoOpening = function (vid) {
      return tagResult(vid, origOpening.call(this, vid));
    };
  }

  if (Game.convoThreadBeat) {
    const origBeat = Game.convoThreadBeat;
    Game.convoThreadBeat = function (vid) {
      const c = this.convoGet(vid);
      ensureTranscriptTagged(Game, vid);
      const line = origBeat.call(this, vid);
      if (!line) return null;
      // Tag the beat. The line itself stays a primitive string — callers
      // use it as one. The tag lives in c.lastBeat; beatOf() reads it.
      const tag = threadBeatTag(c.thread, c);
      c.lastBeat = { tag, topic: c.thread || 'small', line: String(line) };
      return line;
    };
  }

  // beatOf: the current beat. Reads the tag — never guesses from text.
  // Re-classifies 'want' threads by want ID (Steve 2026-10-06): the lastBeat
  // is cached from the opening, before c.want is set, so it may have the
  // wrong tag for the actual want type.
  Game.beatOf = function (vid) {
    const c = this.convoGet(vid);
    if (c.lastBeat && c.lastBeat.tag) {
      // Re-classify want threads by want ID — the cached tag may be wrong.
      if (c.lastBeat.tag === 'offer' && c.thread === 'want' && c.want && c.want.id) {
        const wid = c.want.id;
        const newTag = (typeof this.wantBeatTag === 'function') ? this.wantBeatTag(wid) : 'offer';
        // ask_favor stays 'offer'; anything else gets its true tag.
        if (newTag !== 'offer') {
          return { tag: newTag, topic: c.lastBeat.topic, line: c.lastBeat.line };
        }
      }
      return c.lastBeat;
    }
    // Fallback for conversations started before tagging (or nonstandard flows).
    const tag = threadBeatTag(c.thread, c);
    return { tag, topic: c.thread || 'small', line: null };
  };

  // Tag transcript entries: every 'them' line carries its beat tag.
  // Wrapped once per convo — the push stamps the entry from c.lastBeat.
  function ensureTranscriptTagged(Game, vid) {
    const c = Game.convoGet(vid);
    if (!c.transcript || c.transcript._beatTagged) return;
    const origPush = c.transcript.push.bind(c.transcript);
    c.transcript.push = function (entry) {
      if (entry && entry.who === 'them' && !entry.beat && c.lastBeat) {
        entry.beat = c.lastBeat.tag;
        entry.topic = c.lastBeat.topic;
      }
      return origPush(entry);
    };
    c.transcript._beatTagged = true;
  }

  // ============ BRIDGE LINES ============
  // When the topic shifts, the NPC speaks a bridge tied to the OLD topic.
  // Never a hard pivot. Voiced per person (voiceLine), never hardcoded flat.
  const BRIDGES = {
    grief: ['"Sorry — I got lost in it for a second. What did you want to ask?"',
      '"...Anyway. Sorry. What\'s on your mind?"',
      '"I drift. Sorry. What were you saying?"',
      '"Grief makes me ramble. You wanted something?"'],
    cheer: ['"Ha — sorry, I\'m rambling. What\'s up?"',
      '"Good times. What did you want to talk about?"',
      '"Anyway — good news is still allowed, right? What\'s on your mind?"'],
    goal: ['"Anyway — that\'s my cross to carry. What\'s on your mind?"',
      '"Right. Sorry, I go on about it. What did you want?"',
      '"That\'s the dream, anyway. What did you want?"',
      '"Sorry — it leaks out of me. What\'s up?"'],
    past: ['"Ancient history. What\'s on your mind?"',
      '"...That was a lifetime ago. What did you want to ask?"',
      '"Old stories. You had something?"',
      '"Feels like someone else\'s life, saying it out loud. What\'s on your mind?"'],
    village: ['"That\'s the state of things. What\'s up?"',
      '"Anyway — people stuff. What did you want?"',
      '"That\'s the village for you. What were you after?"'],
    plans: ['"That\'s the plan, anyway. What\'s on your mind?"',
      '"We\'ll see how it goes. What did you want?"',
      '"Plans change. Yours?"'],
    gossip: ['"That\'s what I heard, anyway. What\'s up?"',
      '"Take it with salt. What did you want to ask?"',
      '"People talk. Anyway — what did you want?"',
      '"That\'s the rumor mill. What\'s on your mind?"'],
    personal: ['"That\'s me, I guess. What\'s on your mind?"',
      '"Anyway. What did you want?"',
      '"More than you asked, probably. Sorry. What\'s up?"'],
    hardstory: ['"Thank you for hearing that. What did you want to ask?"',
      '"...Anyway. What\'s on your mind?"',
      '"Once was enough. What did you want?"'],
    want: ['"Sorry — I shouldn\'t load that on you. What\'s up?"',
      '"Forget I said anything. What did you want?"',
      '"I didn\'t mean to dump all that. What\'s on your mind?"'],
    secret: ['"Don\'t tell anyone I told you. What\'s on your mind?"',
      '"...Anyway. What did you want to ask?"',
      '"That stays between us. What\'s up?"',
      '"Forget I said it — no. You know what, don\'t forget. Just don\'t repeat it. What did you want?"'],
    theorize: ['"That\'s my theory, anyway. Probably wrong. What\'s on your mind?"',
      '"I think about it too much. What did you want?"',
      '"Who knows. What\'s up?"'],
    taughtref: ['"Anyway — your lesson stuck. What did you want?"',
      '"Still turning it over. What\'s on your mind?"'],
    recall: ['"Funny what you remember. What\'s up?"',
      '"Anyway. What did you want to ask?"'],
    request: ['"Sorry — I came to you with a reason and I\'m already wandering. What did you need?"',
      '"Right. Focus. What\'s on your mind?"'],
    small: ['"Sure — what\'s on your mind?"',
      '"Yeah? What\'s up?"',
      '"I\'m listening. What\'s up?"'],
  };

  Game.bridgeLine = function (vid, fromTopic) {
    const c = this.convoGet(vid);
    const pool = BRIDGES[fromTopic] || BRIDGES.small;
    const pick = (typeof this.convoPickCycle === 'function')
      ? this.convoPickCycle(vid, 'bridge:' + (fromTopic || 'small'), pool)
      : pool[Math.floor(Math.random() * pool.length)];
    const line = pick || pool[0];
    const voiced = (typeof this.voiceLine === 'function') ? this.voiceLine(vid, line) : line;
    // Tag the bridge itself — it's a small beat, an invitation.
    c.lastBeat = { tag: 'small', topic: fromTopic || 'small', line: voiced };
    return voiced;
  };

  // ============ TOPIC-AWARE REPLIES ============
  // Every reply answers (beat, topic). Pools rotate — no two conversations
  // show the same menu. Player voice (blunt/soft/plain) shapes phrasing.

  function pvVoice(Game, blunt, soft, plain) {
    try {
      const pv = Game.playerVoice ? Game.playerVoice() : null;
      if (!pv) return plain;
      if (pv.voiceClass === 'blunt') return blunt;
      if (pv.voiceClass === 'soft') return soft;
    } catch (e) {}
    return plain;
  }

  // Reply pools: [beat][topic] -> array of {id, label}
  // Labels are templates — voice() picks the phrasing per player voice.
  const REPLY_POOLS = {
    news: {
      past: [
        { id: 'dlg:more', v: ['"What was that like?"', '"Do you ever miss it?"', '"Tell me about before."]'] },
        { id: 'dlg:react', v: ['"Huh."', '"I can picture it."', '"That\'s a whole life."]'] },
      ],
      goal: [
        { id: 'dlg:more', v: ['"How\'s that going?"', '"What\'s the hard part?"', '"What would it take?"]'] },
        { id: 'dlg:react', v: ['"I hope you get there."', '"That matters."', '"Yeah."]'] },
      ],
      village: [
        { id: 'dlg:more', v: ['"Who\'s struggling most?"', '"What do we do about it?"', '"How\'s everyone holding up, really?"]'] },
        { id: 'dlg:react', v: ['"I\'ve noticed."', '"We\'ll figure it out."', '"Hm."]'] },
      ],
      plans: [
        { id: 'dlg:more', v: ['"When?"', '"Want company?"', '"What do you need for that?"]'] },
        { id: 'dlg:react', v: ['"Good plan."', '"Be careful out there."', '"Sounds right."]'] },
      ],
      gossip: [
        { id: 'dlg:more', v: ['"Who told you?"', '"Do you believe it?"', '"What else have you heard?"]'] },
        { id: 'dlg:react', v: ['"No kidding."', '"Huh. People talk."', '"I\'ll keep that in mind."]'] },
      ],
      personal: [
        { id: 'dlg:more', v: ['"Tell me more about that."', '"I didn\'t know that about you."', '"What else?"]'] },
        { id: 'dlg:react', v: ['"That tracks."', '"I get that."', '"Huh."]'] },
      ],
      secret: [
        { id: 'dlg:more', v: ['"Why are you telling me this?"', '"Does anyone else know?"', '"Go on."]'] },
        { id: 'dlg:react', v: ['"I won\'t tell."', '"...Wow."', '"Okay."]'] },
      ],
      _default: [
        { id: 'dlg:more', v: ['"Go on."', '"Tell me more."', '"And then?"'] },
        { id: 'dlg:react', v: ['"Huh."', '"I see."', '"Yeah."'] },
      ],
    },
    feeling: {
      grief: [
        { id: 'dlg:comfort', v: ['"You alright?"', '"Are you okay?"', '"Hey — you alright?"'] },
        { id: 'dlg:empathize', v: ['"Yeah. I get it."', '"That sounds really hard."', '"I hear you."'] },
        { id: 'dlg:askwhy', v: ['"What happened?"', '"Want to talk about it?"', '"Do you want to tell me?"]'] },
      ],
      cheer: [
        { id: 'dlg:more', v: ['"What\'s got you smiling?"', '"Good. We needed that."', '"Tell me the good news."]'] },
        { id: 'dlg:react', v: ['"Nice."', '"Ha — good."', '"That\'s the spirit."]'] },
      ],
      _default: [
        { id: 'dlg:comfort', v: ['"You alright?"', '"Are you okay?"', '"Hey — you alright?"'] },
        { id: 'dlg:empathize', v: ['"Yeah. I get it."', '"That sounds hard."', '"I hear you."'] },
      ],
    },
    offer: {
      want: [
        { id: 'dlg:help', v: ['"How can I help?"', '"What do you need?"', '"I\'m listening."]'] },
        { id: 'dlg:details', v: ['"Tell me more about it."', '"What\'s the situation?"', '"Start from the beginning."]'] },
        { id: 'dlg:cant', v: ['"Can\'t right now."', '"I wish I could, but not right now."', '"Not right now, sorry."'] },
      ],
      trade: [
        { id: 'dlg:deal', v: ['"Let\'s see it."', '"Show me what you\'ve got."', '"What are you offering?"'] },
        { id: 'dlg:browse', v: ['"Just looking."', '"Maybe — what else do you have?"'] },
        { id: 'dlg:cant', v: ['"Not today."', '"I\'ll pass."', '"Can\'t right now."'] },
      ],
      _default: [
        { id: 'dlg:help', v: ['"How can I help?"', '"What do you need?"'] },
        { id: 'dlg:cant', v: ['"Can\'t right now."', '"Not right now, sorry."'] },
      ],
      // Want-keyed offer menus: what "yes" means depends on what they want.
      // A favor wants help; a lesson wants a student. dialogueResponses
      // selects by c.want.id so the menu always answers the actual beat.
      // (ask_favor falls back to the 'want' pools — same thing.)
      wantPools: {
        offer_teach: [
          { id: 'dlg:learn', v: ['"Show me."', '"I\'d like that."', '"Yes — teach me."'] },
          { id: 'dlg:later', v: ['"Some other time?"', '"Not today, but I\'m interested."', '"Rain check?"'] },
          { id: 'dlg:cant', v: ['"Can\'t right now."', '"Not right now, sorry."'] },
        ],
      },
    },
    small: {
      _default: [
        { id: 'dlg:more', v: ['"Yeah?"', '"Mmhm."', '"Go on."'] },
        { id: 'dlg:react', v: ['"Huh."', '"Oh nice."', '"I see."'] },
      ],
    },
  };

  // Override dialogueResponses with the beat+topic matrix.
  // Questions and offers-with-machinery still defer (existing handlers).
  Game.dialogueResponses = function (vid) {
    const c = this.convoGet(vid);
    const beat = this.beatOf(vid);
    const tag = beat.tag;
    const topic = beat.topic || 'small';

    // Questions and trade offers use their focused machinery — already dialogue-driven.
    if (tag === 'question') return null;
    if (tag === 'offer' && (c.pendingTrade || c.pendingHawk || c.thread === 'trade')) return null;
    if (c.thread === 'nonverbal' || c.thread === 'spread_rumor') return null;

    const out = [];
    const pools = REPLY_POOLS[tag] || REPLY_POOLS.small;
    // Offer beats are want-keyed: what "yes" means depends on the want.
    // offer_teach gets the lesson menu; ask_favor the favor menu. Everything
    // else falls back through topic, then _default.
    let topicPool;
    if (tag === 'offer' && c.want && c.want.id && pools.wantPools && pools.wantPools[c.want.id]) {
      topicPool = pools.wantPools[c.want.id];
    } else {
      topicPool = pools[topic] || pools._default || REPLY_POOLS.small._default;
    }

    // THREAD DRY (Steve 2026-10-06): "tell me more" is honest only while the
    // thread has beats. Once dry, drop it and let the thread wind down.
    // (This was in convo-dialogue.js but lost in the beats override.)
    const threadDry = !!(c.thread && c.threadDryFor && c.thread === c.threadDryFor);

    // Doubts unlock confrontation — contextual, not menued.
    let hasDoubts = false;
    try { hasDoubts = this.getDoubts && this.getDoubts(vid).length > 0; } catch (e) {}

    // Pick one label per reply id, rotating via convoPickCycle.
    const seen = new Set();
    for (const entry of topicPool) {
      if (seen.has(entry.id)) continue;
      // Skip "tell me more" if the thread is dry.
      if (threadDry && entry.id === 'dlg:more') continue;
      seen.add(entry.id);
      const label = (typeof this.convoPickCycle === 'function')
        ? this.convoPickCycle(vid, 'reply:' + tag + ':' + topic + ':' + entry.id, entry.v)
        : entry.v[Math.floor(Math.random() * entry.v.length)];
      // Voice-shape the label: blunt/soft/plain variants are baked into
      // the pools above as alternates; the cycle keeps them fresh.
      out.push({ id: entry.id, label });
    }

    // Doubt surfaces on news AND small beats when you have doubts.
    // DETECTIVE (Steve 2026-10-06): the hard confrontation (confront:,
    // truth.js) is offered on every beat, so the soft probe must be
    // reachable wherever the player can confront — otherwise the
    // soften-then-confront tactic is unplayable. Withheld on feeling/offer
    // beats: pressing a suspicion while they're grieving or asking for help
    // reads cruel.
    if ((tag === 'news' || tag === 'small') && hasDoubts && !seen.has('dlg:doubt')) {
      out.push({ id: 'dlg:doubt', label: '"That doesn\'t quite add up."' });
    }
    // Theorize surfaces contextually on mystery beats.
    if (tag === 'news') {
      const text = beat.line ? String(beat.line).toLowerCase() : '';
      if (/system|monster|strange|weird|don't understand|why/.test(text) && !seen.has('dlg:theorize')) {
        out.push({ id: 'dlg:theorize', label: '"What do you think it means?"' });
      }
    }

    // Party invite — contextual on warm beats with trust.
    try {
      const trust = (this.state.village.trust || {})[vid] || 10;
      if (this.state.systemArrived && this.partyUnlocked && this.partyUnlocked() &&
          !this.inParty(vid) && !this.partyFull() && this.hasDiscovered('party') &&
          trust >= 20 && (tag === 'news' || tag === 'small' || tag === 'feeling')) {
        out.push({ id: 'dlg:invite', label: '"Want to come with us?"' });
      }
    } catch (e) {}

    // Subject change — explicit, with a bridge on the way out.
    out.push({ id: 'dlg:subject', label: '"Can I ask you something else?"' });
    out.push({ id: 'leave', label: c.exchanges === 0 ? '"Nice talking to you."' : '"I should go."' });

    // CONTINUER (Steve 2026-10-05 one-beat turns): queued beats surface as
    // a voiced continuer, FIRST. The dialogue menu must not swallow it:
    // held beats (want surfacing, mood shifts, the want opener itself) die
    // when the player moves on, so the continuer has to be offered here —
    // the dialogue layer replaced the base menu that used to carry it, and
    // without this, wants queued mid-conversation never surface at all.
    if ((c.heldBeats || []).length && !out.some(x => x.id === 'goon')) {
      let gl = null;
      try { gl = (typeof this.convoGoonLabel === 'function') ? this.convoGoonLabel(vid) : null; } catch (e) {}
      out.unshift({ id: 'goon', label: gl || '"Go on."' });
    }

    return out;
  };

  // Override the dlg:subject handler to speak a bridge line.
  // (convo-dialogue.js's convoTurn wrapper handles the rest; we patch
  // the subject branch by wrapping convoTurn once more.)
  if (Game.convoTurn) {
    const prevTurn = Game.convoTurn;
    Game.convoTurn = function (vid, choiceId) {
      const c = this.convoGet(vid);
      if (choiceId === 'dlg:subject') {
        const fromTopic = c.thread || (c.lastBeat && c.lastBeat.topic) || 'small';
        c.transcript.push({ who: 'you', text: '"Can I ask you something else?"' });
        const bridge = this.bridgeLine(vid, fromTopic);
        c.transcript.push({ who: 'them', text: bridge, beat: 'small', topic: fromTopic });
        if (typeof this.sayLine === 'function') this.sayLine(vid, bridge);
        c.choosingSubject = true;
        return { line: bridge, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      }
      const result = prevTurn.call(this, vid, choiceId);
      // Want engagement advances here, at the outermost layer: the dialogue
      // layer intercepts every 'dlg:' choice and returns early, so a mapper
      // inside the wants wrapper would never see them (convoWantEngage).
      try {
        if (typeof this.convoWantEngage === 'function') this.convoWantEngage(vid, choiceId);
      } catch (e) {}
      return result;
    };
  }

  // Also override dialogueBeatKind to prefer tags over regex.
  // (convo-dialogue.js defined it with regex classification; tags win now.)
  Game.dialogueBeatKind = function (vid) {
    const beat = this.beatOf(vid);
    // Map our 5 tags onto the 6 kinds dialogueResponses expects.
    // 'news' -> 'share', 'feeling' -> 'feel', 'offer' -> 'want'/'offer',
    // 'question' -> 'question', 'small' -> 'small'.
    const c = this.convoGet(vid);
    if (beat.tag === 'question') return 'question';
    if (beat.tag === 'offer') {
      if (c.thread === 'trade' || c.pendingTrade || c.pendingHawk) return 'offer';
      return 'want';
    }
    if (beat.tag === 'feeling') return 'feel';
    if (beat.tag === 'news') return 'share';
    return 'small';
  };

  Game.BEAT_TAGS = BEAT_TAGS;
})();
