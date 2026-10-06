// @ontology
// system: conversation
// description: Real back-and-forth dialogue. Player always has response choices.
// provides:
//   - startConvo()
//   - convoChoice()
//   - convoUI() -> {active, transcript, choices}
// rules:
//   - transcript_cap: 200 entries (code: conversation.js, convoTurn push sites)
//   - one_beat_turns: a choice yields exactly one new THEM beat; follow-ons queue in c.heldBeats and surface as a voiced continuer ('goon', convoMoreLabel per person/mood/thread); unspoken beats die when the player moves on (code: conversation.js convoTurn, Steve 2026-10-05)
//   - tap_advance: one message per tap; msgIndex anchored on entry identity, never raw length; lands on their reply, not your echoed line (code: app.js chatChoice, Steve 2026-10-05)
//   - history_view: speaker tab toggles full scrollable transcript (code: app.js dialogueBoxHTML, Steve 2026-10-05)
// consumes:
//   - village.villagers
//   - state.convos
// ============ CONVERSATIONS ============
// Real back-and-forth dialogue. The player always has response choices —
// never just "continue". NPCs ask questions back, remember your answers,
// and every conversation has a shape: opening, development, natural end.
// No repeats: said lines are tracked per villager across all threads;
// exhausted threads admit it honestly instead of looping.
//
// Self-attaching module: loaded after game.js, adds/replaces Game methods.
// This keeps the conversation system in one file, independent of game.js churn.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  // ============ REACTIVE QUESTIONS ============
  // NPC lines phrased as DIRECT questions that the old system delivered as
  // small talk with no way to answer — the player could only change the
  // subject (the burdock non sequitur: "Did you see that?" -> plant lesson).
  // Each entry maps a line fragment to a lightweight question:
  // - contextual answers come FIRST in the choice list
  // - pivots (teach/theorize) are suppressed while it hangs in the air
  // - unanswered questions get ONE follow-up, then lapse with a line —
  //   they linger, never vanish mid-thought
  const REACTIVE_DEFS = {
    rq_treeline: {
      match: 'Did you see that, just now?',
      thread: 'spooked',
      answers: [
        { id: 'saw', label: '"I saw it too."',
          line: '"You did?" Their voice drops. "Then I\'m not imagining things. Stay close to the fire tonight — both of us."',
          trust: 2 },
        { id: 'no', label: '"I didn\'t see anything."',
          line: '"Hm." They keep watching the trees. "Maybe I\'m jumpy. Probably jumpy. ...Probably."',
          trust: 0 },
        { id: 'look', label: '"Let\'s go look. Together."', action: 'look_treeline', trust: 3 },
        { id: 'what', label: '"What did it look like?"',
          line: '"I don\'t know. Fast. Wrong-shaped." A pause. "Let\'s not go out alone tonight, yeah?"',
          trust: 1 },
      ],
      followUp: '"Hey — the tree line. Did you see it or not? I need to know I\'m not imagining things."',
      lapse: '"...Never mind. Probably nothing." They don\'t sound convinced. They keep glancing at the trees.',
      reacts: {
        agree: '"I know I saw it. That\'s what scares me."',
        joke: 'You try to laugh it off. It comes out wrong — and now you\'re both scared.',
        silence: 'You say nothing. They read your face, and go a shade paler.',
      },
    },
    rq_heard: {
      match: 'Did you hear that?',
      thread: 'spooked',
      answers: [
        { id: 'yes', label: '"I heard it too."',
          line: '"Okay. Okay, so it\'s real. ...I hate that it\'s real."',
          trust: 2 },
        { id: 'no', label: '"Just the wind."',
          line: '"The wind doesn\'t sound like that." A beat. "Don\'t — don\'t lie to me right now."',
          trust: -1 },
        { id: 'what', label: '"What did it sound like?"',
          line: '"Like something big, moving careful. Like it didn\'t want to be heard."',
          trust: 1 },
      ],
      followUp: '"Don\'t tell me you didn\'t hear that. Please."',
      lapse: '"...It stopped. That\'s worse, somehow."',
      reacts: {
        agree: '"Right? It\'s out there. It\'s out there right now."',
        joke: 'You make a joke about the wind. Neither of you laughs.',
        silence: 'Your silence is answer enough. They edge closer to the fire.',
      },
    },
    rq_wants: {
      match: 'what do you think it actually wants from us?',
      thread: 'small',
      answers: [
        { id: 'test', label: '"Something\'s testing us."',
          line: '"That\'s what I keep coming back to. A test has rules. Rules can be learned."',
          trust: 1 },
        { id: 'dontknow', label: '"I have no idea."',
          line: '"Honest. I appreciate honest. I\'m tired of people pretending they know."',
          trust: 1 },
        { id: 'survive', label: '"Does it matter? We survive anyway."',
          line: 'A short laugh. "Fair. Philosophy\'s a luxury. Surviving\'s the job."',
          trust: 0 },
      ],
      followUp: '"I\'m serious — what do you think it wants? I need someone to sanity-check me."',
      lapse: '"...Forget it. Thinking in circles."',
      reacts: {
        agree: '"Right? It wants SOMETHING. The trick is figuring out what before it collects."',
        joke: '"Ha. "Wants" — like it\'s a person with a shopping list. ...Don\'t make me laugh about this."',
        silence: 'You don\'t answer. They nod slowly, like your silence confirmed something.',
      },
    },
    rq_shifting: {
      match: 'You feel it too, right?',
      thread: 'small',
      answers: [
        { id: 'yes', label: '"I feel it."',
          line: '"Good. Not good, but — good that it\'s not just me. Keep an eye on people, yeah?"',
          trust: 1 },
        { id: 'no', label: '"I think things are fine."',
          line: '"...Maybe. Maybe I\'m reading weather that isn\'t there." They don\'t look convinced.',
          trust: 0 },
        { id: 'how', label: '"Shifting how?"',
          line: '"Small things. Who sits where. Who stopped laughing. It adds up."',
          trust: 1 },
      ],
      followUp: '"The group — you really don\'t feel anything off?"',
      lapse: '"Forget I said anything."',
      reacts: {
        agree: '"Thank you. I needed someone else to say it out loud."',
        joke: 'You joke about group dynamics. They smile, but it doesn\'t reach their eyes.',
        silence: 'You say nothing. They take that as agreement — maybe correctly.',
      },
    },
    rq_personal: {
      match: 'Can I ask you something — person to person',
      thread: 'small',
      answers: [
        { id: 'yes', label: '"Of course. Ask."', action: 'ask_real', trust: 1 },
        { id: 'depends', label: '"Depends what it is."',
          line: '"Fair." A pause. "It\'s personal. But — we\'re past small talk, aren\'t we?"',
          action: 'ask_real', trust: 0 },
        { id: 'later', label: '"Maybe another time."',
          line: '"...Right. Of course. Sorry." They withdraw a fraction.',
          trust: -1 },
      ],
      followUp: '"I meant it — can I ask you something? Person to person."',
      lapse: '"Never mind. Forget it."',
      reacts: {
        agree: '"Okay. Good. Here goes, then —"',
        joke: '"I\'m being serious. ...Okay, one joke. Then I ask."',
        silence: 'You wait. They take a breath, and ask anyway.',
      },
    },
    rq_holding: {
      match: 'how are you holding up',
      thread: 'small',
      answers: [
        { id: 'honest', label: '"Honestly? Not great."',
          line: '"Thank you for saying it straight. Most people perform. I\'m tired of performances." You feel oddly steadier.',
          trust: 2 },
        { id: 'fine', label: '"I\'m fine."',
          line: '"Mm." They don\'t believe you, kindly. "Well. I\'m here if fine stops working."',
          trust: 0 },
        { id: 'busy', label: '"Better when I\'m busy."',
          line: '"Then let\'s find you something to do. Idle hands, idle thoughts."',
          trust: 1 },
      ],
      followUp: '"I asked how you\'re holding up. Honestly means honestly."',
      lapse: '"...I\'ll take the silence as an answer. It\'s okay."',
      reacts: {
        agree: '"Yeah. Me too, if I\'m honest." A small, real smile.',
        joke: 'You deflect with humor. They let you — this time.',
        silence: 'You don\'t answer. They sit with you anyway. That\'s the answer.',
      },
    },
    rq_alright: {
      match: 'Are you alright? Really?',
      thread: 'small',
      answers: [
        { id: 'notreally', label: '"Not really."',
          line: '"Okay. That\'s allowed, you know. Sit a minute?"',
          trust: 2 },
        { id: 'okay', label: '"I\'m okay."',
          line: '"You don\'t have to perform okay for me. But I won\'t push."',
          trust: 0 },
        { id: 'you', label: '"Are YOU?"',
          line: 'A surprised laugh. "Nobody asks me that. ...I\'m managing. Ask me again sometime."',
          trust: 2 },
      ],
      followUp: '"I\'m asking because I mean it. Are you alright?"',
      lapse: '"Okay. I\'ll stop hovering."',
      reacts: {
        agree: '"Good. That\'s good. Hold onto that."',
        joke: 'You joke. They smile, unconvinced but fond.',
        silence: 'Silence. They read it, and don\'t press. That\'s kindness.',
      },
    },
    rq_busy: {
      match: "What do you want? I'm busy.",
      thread: 'small',
      answers: [
        { id: 'talk', label: '"Just wanted to talk."',
          line: '"...Huh. Nobody just talks anymore." A pause. "Fine. Talk." They soften, barely.',
          trust: 1 },
        { id: 'help', label: '"Actually, I could use your help."',
          line: '"Knew it. Fine — what do you need?" Brisk, but not unkind.',
          trust: 0 },
        { id: 'nothing', label: '"Nothing. Sorry."',
          line: '"Right." They turn back to their work — but less sharply than before.',
          trust: 0 },
      ],
      followUp: '"Well? Busy doesn\'t mean gone. What do you want?"',
      lapse: '"..." They go back to work.',
      reacts: {
        agree: '"Right. Busy. We\'re all busy. That\'s the job now."',
        joke: 'A joke. Against all odds, the corner of their mouth moves.',
        silence: 'You stand there. "...You\'re still here. So it wasn\'t nothing."',
      },
    },
    rq_others: {
      match: 'Have you talked to the others lately?',
      thread: 'small',
      answers: [
        { id: 'bit', label: '"A bit. People seem..."',
          line: '"...Yeah. That\'s what I\'m seeing too. Keep checking in, yeah? It matters more than it looks."',
          trust: 1 },
        { id: 'worried', label: '"You\'re worried about the mood."',
          line: '"Someone should be. Moods are load-bearing, out here."',
          trust: 1 },
        { id: 'who', label: '"Who specifically?"',
          line: '"I don\'t want to name names. Just — pay attention. You\'ll see it."',
          trust: 0 },
      ],
      followUp: '"The others — have you talked to them? I\'m a little worried, honestly."',
      lapse: '"Forget it. Probably nothing."',
      reacts: {
        agree: '"I knew you\'d see it. You pay attention. I like that."',
        joke: 'You joke about village gossip. "It\'s not gossip if it\'s true," they say, half-smiling.',
        silence: 'You don\'t answer. "That silence tells me plenty," they murmur.',
      },
    },
    rq_monsters: {
      match: "the monsters aren't the problem?",
      thread: 'small',
      answers: [
        { id: 'maybe', label: '"Maybe they\'re not."',
          line: '"Right? What if they\'re — symptoms. Or guards. Or livestock. "Monsters" feels too easy."',
          trust: 1 },
        { id: 'chase', label: '"They feel like the problem when they\'re chasing you."',
          line: '"Fair. Very fair. I theorize from safety; you theorize from experience."',
          trust: 1 },
        { id: 'what', label: '"What else would they be?"',
          line: '"I don\'t know yet. That\'s why I\'m asking everyone. Collecting wrong answers until a right one shows up."',
          trust: 0 },
      ],
      followUp: '"Hear me out, though — what if the monsters aren\'t the problem? What are they, then?"',
      lapse: '"...Forget it. Half-baked."',
      reacts: {
        agree: '"I knew you\'d get it. Keep thinking — tell me what you land on."',
        joke: '"I\'m serious! ...Okay, it does sound unhinged out loud."',
        silence: 'You don\'t answer. "Yeah," they say quietly. "That\'s what I thought too."',
      },
    },
  };

  // ============ GENERIC QUESTION ANSWERS (Rule 4) ============
  // NPCs ask direct questions all over the opener/small-talk pools — far
  // more than the bespoke REACTIVE_DEFS cover ("Are you eating enough?",
  // "Want to see?", "What's the move?"). A direct question with no
  // answerable option is the non-sequitur Steve flagged: the player can
  // only dodge. So: classify the question, offer real answers.
  // - yes/no shaped -> Yes / No / I don't know
  // - "how are you" shaped -> honest / fine / busy
  // - greeting ("what's up?") -> not much / surviving
  // - open -> "What do you think?" (they give a take) / "I don't know yet."
  // Rhetorical questions ("isn't that weird?", "don't answer that") are
  // NOT direct — agree/joke/silence already answer those fine.
  // Acknowledgments are human filler, tracked no-repeat per villager via
  // convoPick, like every other react pool.
  const GQ_ACK = {
    yes: ['\"Yeah. Thought so — and I\'m glad it\'s you saying it.\"',
          '\"Knew it. You\'ve got good instincts for this stuff.\"',
          '\"Good. Good to know I\'m not the only one seeing it.\"',
          '\"Right. That\'s what I figured — which is why I asked you, not them.\"',
          'They nod, satisfied — like a piece just clicked into place.'],
    no: ['\"Hm. Fair. I had to check — you never know who\'s actually paying attention.\"',
         '\"Okay. Worth asking. I\'d rather hear no than guess wrong.\"',
         '\"Right. Noted — and I mean that, I\'m keeping track of who says what.\"',
         '\"Yeah, figured. Had to ask. The asking matters, even when the answer\'s no.\"',
         'They take that in, turning it over like a stone.'],
    unsure: ['\"Nobody is, these days. We\'re all guessing — some of us just guess louder.\"',
             '\"Fair enough. I\'d rather hear that than a confident lie.\"',
             '\"Yeah. Me neither, some days. The days I do know, I worry I\'m wrong.\"',
             '\"Honest. I\'ll take honest over certain every time.\"'],
    howru_bad: ['"Yeah. Me too, if I\'m honest." A small, real smile.',
                '"Thank you for saying it straight. Most people perform."',
                '"Okay. That\'s allowed, you know. Sit a minute?"'],
    howru_fine: ['"Mm." They don\'t believe you, kindly. "Well. I\'m here if fine stops working."',
                 '"Good. Hold onto that."',
                 '"You don\'t have to perform okay for me. But I won\'t push."'],
    howru_busy: ['"Then let\'s find you something to do. Idle hands, idle thoughts."',
                 '"Busy is good. Busy means tomorrow."',
                 '"Same. Keep moving, keep okay."'],
    greet_notmuch: ['"Same. Same."', '"Yeah. That\'s the job now."',
                    '"Not much is good. Not much is safe."'],
    greet_surviving: ['"Aren\'t we all."', '"That\'s the whole resume now."',
                      '"Surviving counts. Don\'t let anyone tell you different."'],
    // Nodding along IS an answer to a direct question — small acks so the
    // passive conversationalist is never stranded mid-question.
    gq_agree: ['"Yeah." They take it.', '"Mm." That seems to land.',
               'Nods. "Okay. Good to know."'],
    gq_joke: ['You crack a joke. It lands, mostly.',
              'A joke. They snort despite themselves.',
              'You deflect with humor. They let you — this time.'],
    gq_silence: ['You say nothing. They read it as an answer.',
                 'Silence. They don\'t press.',
                 'You don\'t answer. They nod slowly, like your silence confirmed something.'],
  };
  // "What do YOU think?" — they give a take. Short, portable across
  // questions, human. Tracked no-repeat per villager.
  const GQ_TAKES = [
    '"Honestly? I think about it more than I say."',
    '"I go back and forth. Ask me tomorrow, I\'ll say different."',
    '"My take? We\'re not going to like the answer, whatever it is."',
    '"I\'ve got theories. Most of them are just fear with better lighting."',
    '"Short version: I don\'t know. Long version: also that, but slower."',
    '"I think the asking matters more than the answer, out here."',
    '"Everyone\'s got a take. Mine\'s just the one I can live with."',
    '"You really want my take? ...Yeah. Okay. I think we\'re being tested."',
  ];
  const GQ_FOLLOWUP = '"Sorry — I asked you something there."';
  const GQ_LAPSE = '"Forget it. Wasn\'t important."';

  // classifyQuestion: direct question without a bespoke def? Returns
  // { kind, q } or null. kind: 'yn' | 'howru' | 'open'.
  function classifyQuestion(line) {
    if (!line || typeof line !== 'string') return null;
    const t = String(line).replace(/^[\s"'“”‘’]+|[\s"'“”‘’.,;:—–-]+$/g, '');
    // The direct question can sit mid-line ("Are you eating enough? You
    // look thin.") — take the first question sentence, not just a trailing one.
    const m = t.match(/([^.?!]*\?)/);
    if (!m) return null;
    const q = m[1].trim();
    // Discourse markers, not questions: a bare "Honestly?" / "Really?" /
    // "Right?" is a tag, not something the player must answer.
    if (/^(honestly|really|right|yeah|huh|eh)\?$/i.test(q)) return null;
    if (/isn'?t that (weird|strange|something)|rhetorical/i.test(q)) return null;
    // Rhetorical markers can trail the question ("...? Don't answer that.")
    if (/don'?t answer|never mind/i.test(t)) return null;
    if (/how are you\b/i.test(q)) return { kind: 'howru', q };
    if (/what'?s up\?|how'?s it going\?/i.test(q)) return { kind: 'greet', q };
    // Colloquial yes/no: "you ever...?", "have you ever...?"
    if (/^(do you ever|you ever|have you ever|did you ever)\b/i.test(q)) return { kind: 'yn', q };
    // Imperative-as-question: invitations and requests ("Grab an end?",
    // "Walk with me?", "Smile for me?"). Yes/No fits.
    if (/^(grab|take|walk|sits?|come|join|help|look|listen|smile|race|stay|wait|tell me)\b/i.test(q)) return { kind: 'yn', q };
    if (/^(do|did|is|are|can|could|would|should|will|have|has|was|were|does|am|don't|can't|won't|isn't|aren't|want to|wanna|shall we)\b/i.test(q)) return { kind: 'yn', q };
    return { kind: 'open', q };
  }

  // floraWords: the green world coming up in conversation. Teaching later
  // can connect to it (Rule 2: show/teach relates to what's discussed).
  const FLORA_WORDS = /(forag|plant|herb|\broot\b|berr|mushroom|\bgreen\b|grow|\bseed\b|garden|\beat\b|food|cook|meal|dandelion|burdock|nettle|ramp|acorn|walnut)/i;

  const methods = {

    talkTo(vid) {
      // Now opens a real conversation. Kept for compatibility — returns the opening line.
      const st = this.startConvo(vid);
      return st ? st.line : null;
    },

    vpOf(vid) {
      return (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid)
        || ((((this.state || {}).village) || {}).rosterChars || {})[vid] || {};
    },

    // cleanDialogue: defense-in-depth against doubled quotes. Dialogue data
    // sometimes carries its own quotes and a template wraps it again —
    // ""x"" reads broken. Collapse accidental doublings at the edges.
    // Applied at render (both chat paths), so every conversation benefits.
    cleanDialogue(text) {
      let t = String(text == null ? '' : text);
      t = t.replace(/^""+/, '"').replace(/""+$/, '"');
      return t;
    },
    // quoteWrap: wrap a line in exactly one pair of quotes. Flavor and
    // System text sometimes carry their own quotes; naive '"'+t+'"' doubles
    // them (the ""PLANTS LIKE YOU!"" bug). Strip, then wrap — once.
    quoteWrap(text) {
      const t = this.cleanDialogue(text).replace(/^"+/, '').replace(/"+$/, '');
      return '"' + t + '"';
    },

    // voiceMods: what has this person LIVED through? Voice isn't a static
    // template from generation — people change during a run. A villager
    // who's been threatened, betrayed, or grieved sounds different than on
    // day 1. Derived from memory + trust + mood; no state writes.
    // (Steve 2026-10-06: unique-person law — not the same person throughout.)
    voiceMods(vid) {
      const v = this.state.village || {};
      const mods = [];
      const mem = (v.memory || {})[vid] || [];
      const day = (this.state.scholar || {}).day || 1;
      const recent = n => mem.filter(m => day - (m.day || 0) <= n).map(m => m.t);
      const r7 = recent(7), r4 = recent(4);
      const has = (arr, ...ts) => ts.some(t => arr.indexOf(t) !== -1);
      try { if (this.npcMood(vid) === 'grieving') mods.push('grieving'); } catch (e) {}
      if (has(r7, 'confronted', 'hostile', 'you_threatened', 'moot_vote', 'observed')) mods.push('scarred');
      if (has(r7, 'promise_broken', 'rumor_about_them', 'caught_you_stealing', 'suspects_you_stealing', 'deal_refused')) mods.push('betrayed');
      if (has(r4, 'gift', 'private_gift', 'saved', 'hero', 'comforted', 'promise_kept', 'amends', 'mediated')) mods.push('grateful');
      if (((v.trust || {})[vid] || 10) >= 55) mods.push('close');
      return mods;
    },

    // voicePool: terse people say less. When selecting from a generic pool,
    // prickly/withdrawn/grieving villagers prefer short lines — fragments,
    // not paragraphs. Falls back to the full pool when nothing is short.
    voicePool(vid, pool) {
      if (!pool || pool.length < 4) return pool;
      const temp = String(this.npcTemper(vid) || 'steady').toLowerCase();
      const V = (this.data.characterGen || {}).voice || {};
      const prof = (V.profiles || {})[temp] || {};
      let terse = !!prof.terse;
      if (!terse) {
        for (const m of this.voiceMods(vid)) {
          if ((((V.states || {})[m] || {}).terse)) { terse = true; break; }
        }
      }
      if (!terse) return pool;
      const short = pool.filter(s => String(s).length < 75);
      return short.length >= 2 ? short : pool;
    },

    // voiceLine: HOW they say it, not what they say. The temperament profile
    // is the base voice (who they are); voiceMods inflect it with what
    // they've lived through (who they've become). Applies an opener OR a
    // closer — never both; restraint is what keeps it voice, not mannerism.
    // Only touches plain quoted speech; stage directions pass through.
    // Never call on choice labels (sibling's lane) or turn-flow text.
    voiceLine(vid, line) {
      const t = String(line == null ? '' : line);
      if (!/^".*"$/.test(t)) return line;
      const temp = String(this.npcTemper(vid) || 'steady').toLowerCase();
      const V = (this.data.characterGen || {}).voice || {};
      const prof = (V.profiles || {})[temp] || (V.profiles || {}).steady || {};
      const mods = this.voiceMods(vid);
      let p = prof.p || 0.3;
      let opens = (prof.open || []).slice();
      let closes = (prof.close || []).slice();
      for (const m of mods) {
        const st = (V.states || {})[m] || {};
        if (st.open) opens = opens.concat(st.open);
        if (st.close) closes = closes.concat(st.close);
        if (st.pMul) p *= st.pMul;
        if (st.hush && st.hush.indexOf(temp) !== -1) p *= 0.35;
      }
      if ((!opens.length && !closes.length) || Math.random() >= p) return line;
      const inner = t.slice(1, -1);
      const isQ = /\?\s*$/.test(inner);
      // Openers don't lead questions ("I think are you okay?" is broken).
      const useOpen = opens.length && (!closes.length || (!isQ && Math.random() < 0.45));
      const pool = useOpen ? opens : closes;
      // Mannerisms cycle, never exhaust: real people repeat their tics.
      // convoPickCycle reshuffles when the pool runs dry.
      const bit = this.convoPickCycle(vid, 'voice:' + temp + ':' + mods.join('+') + ':' + (useOpen ? 'o' : 'c'), pool);
      if (!bit) return line;
      return useOpen ? '"' + bit + inner + '"' : '"' + inner + ' ' + bit + '"';
    },

    // sayLine: villager speech to the feed, exactly one quote layer.
    // Lines flowing through convo are pre-quoted speech (voiceLine's contract:
    // "only touches plain quoted speech"), so a blind `Name: "line"` wrap
    // produced `Name: ""line""`. A line that already opens with a quote
    // carries its own layer; bare narration still gets wrapped. (Steve 2026-10-06)
    sayLine(vid, line) {
      const t = String(line == null ? '' : line);
      this.say(`${this.displayName(vid)}: ${/^"/.test(t) ? t : `"${t}"`}`);
    },

    convoGet(vid) {
      const v = this.state.village;
      v.conv = v.conv || {};
      if (!v.conv[vid]) v.conv[vid] = {
        active: false, exchanges: 0, budget: 4, thread: null, depth: 0,
        said: {}, transcript: [], pendingQ: null, askedQs: [],
        answered: {}, recalled: {}, lastDay: -1, count: 0, over: false,
        offeredHelp: false, askedTopics: [], qCount: 0,
        theorized: [], heldBeats: [], heldAsk: false,
      };
      const c = v.conv[vid];
      // Normalize older convo states (saves/scenarios predate the fields).
      if (!c.heldBeats) c.heldBeats = [];
      if (typeof c.heldAsk === 'undefined') c.heldAsk = false;
      if (typeof c.winddownQueued === 'undefined') c.winddownQueued = false;
      return c;
    },

    // synthPrototype: derive Want/Know/Feel/Secret for generated villagers
    // from their occupation, personality, and backstory. Not hand-authored,
    // but specific enough to feel like a person, not a template.
    synthPrototype(v) {
      const occ = (v.formerOccupation || v.occupation || 'drifter').toLowerCase();
      const temp = ((v.personality || {}).temperament || 'steady').toLowerCase();
      const name = (v.name || 'they').split(' ')[0];

      // Know from occupation
      const knowByOcc = {
        'nurse': 'triage — she can look at a wound and tell you if it\'s going to kill you',
        'cook': 'food — he can make anything edible, and most things delicious',
        'chef': 'precision with a knife — no waste, no hesitation',
        'driver': 'roads — thirty years of knowing where everything is, or was',
        'engineer': 'fixing things — wire, tape, and stubbornness',
        'accountant': 'numbers — she can organize chaos into systems',
        'teacher': 'explaining — she can make anything make sense',
        'farmer': 'growing — she knows what the land wants',
        'mechanic': 'engines — he hears what\'s wrong before he sees it',
      };
      let know = 'surviving — they\'ve learned fast';
      for (const [k, val] of Object.entries(knowByOcc)) {
        if (occ.includes(k)) { know = val; break; }
      }

      // Want: something specific and actionable. First-person: the hook is
      // SPOKEN by the villager as their own dialogue, never narrated in
      // third person about them (Steve 2026-10-06: third-person-as-speech fix).
      const wants = [
        `I'm running low on ${['bandages', 'salt', 'wire', 'paper', 'thread'][Math.floor(Math.random() * 5)]}. It's the kind of thing you don't miss until it's gone.`,
        `I want to ${['fix the water filter', 'map the east woods', 'build a better shelter', 'find a working radio'][Math.floor(Math.random() * 4)]}. Been thinking about it for days.`,
        `I'm worried about ${['the kids', 'the food stores', 'the winter', 'the strangers'][Math.floor(Math.random() * 4)]}. Trying not to say it out loud.`,
      ];
      const want = wants[Math.floor(Math.random() * wants.length)];

      // Feel from temperament
      const feelByTemp = {
        'warm': 'Open and tired. They\'re holding on by holding others.',
        'steady': 'Calm on the surface. They\'ve decided to endure.',
        'sharp': 'Alert and a little angry. They\'re not going down easy.',
        'restless': 'Itchy. They need to move, to do, to not think.',
        'bold': 'Confident, or performing confidence. Hard to tell.',
      };
      const feel = feelByTemp[temp] || feelByTemp.steady;

      // Secret: something specific with stakes — 6 distinct secrets so villagers
      // don't share (the duplicate opener bug: 2-item pool meant collisions).
      // First-person: confessed as "Can I tell you something? I..." — their
      // own voice, never third-person narration (Steve 2026-10-06).
      const secrets = [
        `I've been ${['skimming extra food', 'sneaking out at night', 'hiding an injury', 'writing letters I\'ll never send'][Math.floor(Math.random() * 4)]}. I'm ashamed and I can't stop.`,
        `Before the scattering, I ${['froze when it mattered', 'said something cruel', 'ran when I should have stayed', 'stole from someone who trusted me'][Math.floor(Math.random() * 4)]}. I think about it every day.`,
        `I'm ${['keeping a photo of someone I left behind', 'saving a candy bar for when things get better', 'practicing what I would say if I ever saw my family again'][Math.floor(Math.random() * 3)]}. I haven't told anyone.`,
        `I ${['don\'t actually know how to swim and I\'m terrified someone will find out', 'have been lying about my age — I\'m younger than I look', 'can\'t read, and I\'m scared it matters now'][Math.floor(Math.random() * 3)]}.`,
        `At night I ${['cry quietly so no one hears', 'talk to someone who isn\'t there anymore', 'count the stars and name them after people'][Math.floor(Math.random() * 3)]}.`,
        `I ${['stole medicine from the stash once and never confessed', 'know who took the extra rations but won\'t say', 'saw something in the woods I\'m not telling anyone about'][Math.floor(Math.random() * 3)]}.`,
      ];
      const secret = secrets[Math.floor(Math.random() * secrets.length)];

      return { want, know, feel, secret, relationships: [] };
    },

    // convoMatchReactive: does this NPC line ask the player something direct?
    // Returns { id, ...def } or null. Matched lines get contextual answers;
    // unmatched lines flow through the normal choice builder.
    // Matching is case-insensitive on a normalized line — bespoke defs use
    // short fragments ('how are you holding up') so openers and formal
    // questions share them instead of missing by a tail word.
    convoMatchReactive(line) {
      if (!line || typeof line !== 'string') return null;
      const norm = line.toLowerCase();
      for (const id of Object.keys(REACTIVE_DEFS)) {
        const def = REACTIVE_DEFS[id];
        if (norm.indexOf(String(def.match).toLowerCase()) !== -1) return Object.assign({ id }, def);
      }
      return null;
    },

    // convoGenericQ: the NPC just said something that's a direct question
    // with no bespoke reactive def. Classify it and hang it on the convo
    // (like reactiveQ): answers come first, pivots are suppressed, and a
    // dodged question gets one follow-up before it lapses. Never leave a
    // direct question answerless (Steve's Rule 4).
    convoGenericQ(vid, line) {
      const c = this.convoGet(vid);
      if (c.pendingQ || c.reactiveQ) return null;
      // Never stack questions: one hanging question at a time. A response
      // line that asks something new while a question hangs is part of the
      // dodge, not a second question (it must not reset the follow-up).
      if (c.genericQ) return null;
      if (this.convoMatchReactive(line)) return null;
      const gq = classifyQuestion(line);
      if (!gq) return null;
      c.genericQ = { kind: gq.kind, q: gq.q, followedUp: false };
      return c.genericQ;
    },

    // convoGenericAnswers: the answer options for a hanging generic
    // question. Real answers to what was asked — never topic-change
    // buttons masquerading as replies (Steve's Rule 1 + Rule 4).
    convoGenericAnswers(vid, gq) {
      if (!gq) return [];
      if (gq.kind === 'yn') {
        return [
          { id: 'gq:yn:yes', label: '"Yes."' },
          { id: 'gq:yn:no', label: '"No."' },
          { id: 'gq:yn:unsure', label: '"I don\'t know."' },
        ];
      }
      if (gq.kind === 'howru') {
        return [
          { id: 'gq:howru:bad', label: '"Honestly? Not great."' },
          { id: 'gq:howru:fine', label: '"I\'m fine."' },
          { id: 'gq:howru:busy', label: '"Better when I\'m busy."' },
        ];
      }
      if (gq.kind === 'greet') {
        return [
          { id: 'gq:greet:notmuch', label: '"Not much. You?"' },
          { id: 'gq:greet:surviving', label: '"Surviving."' },
        ];
      }
      return [
        { id: 'gq:open:take', label: '"What do you think?"' },
        { id: 'gq:open:unsure', label: '"I don\'t know yet."' },
      ];
    },

    // convoNoteFlora: the green world came up in this conversation. Later
    // teaching can connect to it — Rule 2: show/teach relates to what's
    // being discussed. Tracks a specific named plant when one appears.
    convoNoteFlora(vid, text) {
      if (!text) return;
      const c = this.convoGet(vid);
      const t = String(text).toLowerCase();
      // Fresh read per line: only the latest NPC line counts as "what's
      // being discussed". A stale mention from three turns ago is not a
      // connection — that's what the teach bridge is for.
      c.floraMentioned = null;
      try {
        for (const p of (this.data.plants || [])) {
          const nm = (p.name || '').toLowerCase();
          if (nm && nm.length > 3 && t.indexOf(nm) !== -1) {
            c.floraMentioned = { pid: p.id, name: p.name };
            return;
          }
        }
      } catch (e) {}
      if (FLORA_WORDS.test(t)) c.floraMentioned = { pid: null, name: null };
    },

    convoBudget(vid) {
      const temp = this.npcTemper(vid);
      const n = this.npcNeeds(vid);
      let b = 4;
      if ((n.social || 0) > 70) b += 1;
      if (temp === 'warm' || temp === 'gentle') b += 1;
      if (temp === 'withdrawn' || temp === 'prickly' || temp === 'restless') b -= 1;
      // INTELLIGENCE SHAPES TALK: social and analytical minds linger over ideas;
      // practical minds would rather be doing.
      try {
        const ip = this.npcIntel(vid).primary;
        if (ip === 'social' || ip === 'analytical') b += 1;
        if (ip === 'practical') b -= 1;
      } catch (e) {}
      // Brief people are brief — but never cut off after a single exchange.
      // Floor 3: opener + two real turns before the wind-down can land.
      // RELATIONSHIP AGE (Steve 2026-10-06): old friends linger — more to
      // say, more comfortable saying it. Close tier gets +1 budget.
      try {
        if (this.convoVoiceTier && this.convoVoiceTier(vid) === 'close') b += 1;
      } catch (e) {}
      return Math.max(3, Math.min(7, b));
    },

    // convoHesitationMs: people don't respond instantly. A brief,
    // personality-shaped pause before their line lands — impulsive people
    // fire back, thoughtful people take their time. Deep or emotional beats
    // get a longer pause. Feels human, never laggy (200–950ms).
    // RELATIONSHIP AGE (Steve 2026-10-06): the rhythm of a relationship.
    // Strangers are careful — they weigh words, feel for the shape of you.
    // Old friends fire back — shorthand, no performance. New +70ms, close
    // -110ms. First meetings open slower (sizing each other up); reunions
    // open quick (they saw you coming).
    convoHesitationMs(vid, choiceId, isOpening) {
      const c = this.convoGet(vid);
      const isFirstMeeting = (c.count || 0) <= 1;
      let ms = isOpening ? (isFirstMeeting ? 380 : 260) : 400;
      const temp = (this.npcTemper && this.npcTemper(vid)) || '';
      if (temp === 'bold' || temp === 'intense' || temp === 'restless') ms -= 150;
      else if (temp === 'cautious' || temp === 'withdrawn' || temp === 'steady') ms += 230;
      else if (temp === 'warm' || temp === 'gentle') ms += 90;
      // 'dry' and 'prickly' answer at their own pace — no modifier.
      const deep = choiceId && /^(ask:|more|theorize|confront|trade|teach|offer_help|invite_party|ans:)/.test(choiceId);
      if (deep) ms += 260;
      try {
        const tier = this.convoVoiceTier ? this.convoVoiceTier(vid) : 'new';
        if (tier === 'new') ms += 70;
        else if (tier === 'close') ms -= 110;
      } catch (e) {}
      return Math.max(200, Math.min(950, ms + Math.floor(Math.random() * 120)));
    },

    // convoDeepTick: going deep costs a little time (1 tick), not energy.
    // Small talk is cheap — you're already standing there. A real exchange,
    // a lesson, a hard question: those take a real moment. Keeps social
    // play viable: a full deep conversation runs ~4-6 ticks, not a day.
    convoDeepTick(vid) {
      try { this.tickAction(1); } catch (e) {}
      try { this.setEngaged(vid, 2); } catch (e) {}
    },

    // convoPick: no repeats, ever. Tracks by line TEXT (not index), so it
    // stays correct even when the pool's composition shifts with mood/rep.
    // Filters against EVERYTHING ever said to this villager — a line used in
    // one thread never resurfaces in another. ALSO filters village-wide:
    // lines said by ANYONE in the village in the last LINE_FRESH_DAYS are
    // deprioritized, so shared pools don't recycle visibly across speakers.
    // Falls back to per-villager-fresh, then to anything, then null.
    // Returns the line, or null when the pool is genuinely exhausted.
    convoPick(vid, key, pool) {
      const c = this.convoGet(vid);
      c.said[key] = c.said[key] || [];
      const allSaid = [];
      for (const k of Object.keys(c.said)) for (const l of c.said[k]) allSaid.push(l);
      const fresh = (pool || []).filter(l => allSaid.indexOf(l) === -1);
      if (!fresh.length) return null;
      let pickPool = fresh;
      try {
        const vf = fresh.filter(l => this.villageLineFresh(l));
        if (vf.length) pickPool = vf;
      } catch (e) {}
      const line = pickPool[Math.floor(Math.random() * pickPool.length)];
      c.said[key].push(line);
      try { this.noteVillageLine(line); } catch (e) {}
      return line;
    },

    // convoPickCycle: like convoPick, but generic pools (exits, "told you
    // everything") are allowed to cycle rather than collapse to one fixed
    // string — the order still varies, so it never feels like a loop.
    convoPickCycle(vid, key, pool) {
      let l = this.convoPick(vid, key, pool);
      if (l == null) {
        this.convoGet(vid).said[key] = [];
        l = this.convoPick(vid, key, pool);
      }
      return l;
    },

    convoOpening(vid) {
      const cg = (this.data.characterGen || {}).convo || {};
      const v = this.state.village;
      const c = this.convoGet(vid);
      const trust = (v.trust || {})[vid] || 10;
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      const goal = this.npcGoal(vid);
      const goalDef = (this.data.characterGen.goals || []).find(g => g.id === goal);
      const vp = this.vpOf(vid);

      // 1. THEY asked to talk — their reason leads, once. The stored line is
      // a template: the requester's name may have been earned since the
      // request fired, so it renders fresh here, never stale.
      // FIRST, before any random hooks: a pending request is why they're
      // here. (socialite playtest 2026-10-06: the want/secret/taught hooks
      // used to pre-empt it intermittently, stranding the request.)
      const treq = (v.talkRequests || {})[vid];
      if (treq && !treq.delivered) {
        treq.delivered = true;
        return { line: this.renderTalkLine(String(treq.line).replace(/ \(Talk to .*?\.\)$/, ''), vid), thread: 'request' };
      }

      // PROTOTYPE: Four Things (Steve 2026-10-05)
      // Want/Know/Feel/Secret per villager. Want surfaces as a hook (30%).
      // Secret surfaces at trust 40+ (20%).
      // Villagers are randomly generated each game (12 random) — so we
      // SYNTHESIZE from occupation/personality/backstory, not hand-author.
      const villager = (this.data.villagers || []).find(x => x.id === vid);
      let proto = villager && villager.prototype;
      if (!proto && villager) {
        proto = this.synthPrototype(villager);
        // Cache it — otherwise every conversation regenerates a random prototype
        // and two villagers can share the same secret/want (the duplicate opener bug)
        villager.prototype = proto;
      }
      if (proto) {
        // Secret at high trust
        if (trust >= 40 && proto.secret && !c.secretShared && Math.random() < 0.2) {
          c.secretShared = true;
          return { line: this.voiceLine(vid, `"Can I tell you something? ${proto.secret}"`), thread: 'secret' };
        }
        // Want as a hook (evolved if the world has moved)
        if (proto.want && !c.wantHooked && Math.random() < 0.3) {
          c.wantHooked = true;
          // Use evolved want if enough days have passed (simplified Change)
          const day = this.state.scholar.day || 1;
          const wantText = (day > 7 && proto.want_evolved) ? proto.want_evolved : proto.want;
          return { line: this.voiceLine(vid, `"${wantText}"`), thread: 'want' };
        }
      }

      // TAUGHT PLANTS (Steve 2026-10-05): if you taught them something, they
      // remember. The one real conversation mechanic was invisible — now it's
      // visible. They reference what you taught them.
      const taught = (v.taught || {})[vid] || [];
      if (taught.length > 0 && !c.taughtMentioned && Math.random() < 0.4) {
        c.taughtMentioned = true;
        const pid = taught[Math.floor(Math.random() * taught.length)];
        const plant = (this.data.plants || []).find(p => p.id === pid);
        const pname = plant ? plant.name : 'that plant';
        const refs = [
          `"Hey — I found some ${pname} today. You were right, it was right where you said."`,
          `"I tried the ${pname} like you showed me. Didn't poison anyone, so that's a win."`,
          `"${pname} — I keep thinking about what you said. I'm seeing it everywhere now."`,
        ];
        const tr = this.convoPick(vid, 'taughtref', refs) || refs[0];
        return { line: this.voiceLine(vid, tr), thread: 'taughtref' };
      }

      // 2. They remember what you told them. Being remembered feels real.
      if (c.answered.q_origin === 'a_tell' && !c.recalled.q_origin) {
        const qd = (cg.questions || []).find(q => q.id === 'q_origin');
        c.recalled.q_origin = true;
        if (qd && qd.recall) {
          const region = (this.homeRegion || (this.state.scholar || {}).homeRegion) || 'wherever you said';
          return { line: qd.recall.replaceAll('{region}', region), thread: 'recall' };
        }
      }
      if (c.answered.q_trust && !c.recalled.q_trust) {
        const qd = (cg.questions || []).find(q => q.id === 'q_trust');
        c.recalled.q_trust = true;
        if (qd && qd.recall) return { line: qd.recall, thread: 'recall' };
      }
      // 3. The village's weather is the elephant in the room.
      if ((v.grief || 0) > 0) {
        const l = this.convoPick(vid, 'grief', [
          '"Have you — sorry. I keep thinking about them."',
          '"It\'s quiet today. Wrong kind of quiet."',
        ]);
        if (l) return { line: this.voiceLine(vid, l), thread: 'grief' };
      }
      if ((v.cheer || 0) > 0 && Math.random() < 0.5) {
        const l = this.convoPick(vid, 'cheer', [
          '"Good day, huh? Almost feels normal."',
          '"People are smiling. I forgot what that looked like."',
        ]);
        if (l) return { line: this.voiceLine(vid, l), thread: 'cheer' };
      }
      // 4. What they want — if they trust you enough to say it.
      const shareAt = temp === 'withdrawn' ? 60 : temp === 'prickly' ? 50
        : (temp === 'warm' || temp === 'gentle') ? 25 : 35;
      if (goalDef && trust >= shareAt) {
        const l = this.convoPick(vid, 'goal', goalDef.lines || []);
        if (l) return { line: this.voiceLine(vid, this.fillTalkLine(l, vp)), thread: 'goal' };
      }
      // 5. Contextual small talk — mood, temperament, reputation. Never repeated.
      const pool = [];
      const push = (arr, w) => { for (const x of (arr || [])) for (let i = 0; i < (w || 1); i++) pool.push(x); };
      push((this.data.characterGen.moodTalk || {})[mood], (mood === 'grieving' || mood === 'scared') ? 3 : 1);
      push((this.data.characterGen.temperamentTalk || {})[temp], 2);
      push(this.repTalkLines(vid), 2);
      // INTELLIGENCE VOICE: analytical people open with questions, practical
      // people open with work, social people open with the group. How someone
      // is smart shapes how they talk. (Note: cg here is characterGen.convo;
      // intelOpeners lives at characterGen top level.)
      try { push(((this.data.characterGen || {}).intelOpeners || {})[this.npcIntel(vid).primary], 2); } catch (e) {}
      // Talk templates: sample 8 fresh each time, not the same first 8 —
      // otherwise every villager's small talk converges on the same lines.
      const allT = (this.data.characterGen.talkTemplates || []).slice();
      for (let i = allT.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = allT[i]; allT[i] = allT[j]; allT[j] = t;
      }
      push(allT.slice(0, 8), 1);
      if (!pool.length) push(cg.openers || ['"Hey."'], 1);
      // Authored-voiced lines (mood/temperament/intel) already sound like
      // someone — the voice layer only voices the generic pools.
      const voiced = new Set();
      for (const x of ((this.data.characterGen.moodTalk || {})[mood] || [])) voiced.add(x);
      for (const x of ((this.data.characterGen.temperamentTalk || {})[temp] || [])) voiced.add(x);
      try { for (const x of (((this.data.characterGen || {}).intelOpeners || {})[this.npcIntel(vid).primary] || [])) voiced.add(x); } catch (e) {}
      const l = this.convoPick(vid, 'small', this.voicePool(vid, pool));
      if (l) {
        const filled = this.fillTalkLine(l, vp);
        return { line: voiced.has(l) ? filled : this.voiceLine(vid, filled), thread: 'small' };
      }
      // Reopeners: the small-talk well is dry, but you've talked before —
      // a familiar line beats a loop. (Previously dead data; now wired in.)
      if ((c.count || 0) > 1) {
        const rl = this.convoPick(vid, 'small', cg.reopeners || []);
        if (rl) return { line: this.voiceLine(vid, this.fillTalkLine(rl, vp)), thread: 'small' };
      }
      // 6. Truly nothing new — said like a person, not a loop.
      const ex = this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know."']);
      return { line: this.voiceLine(vid, ex || '"Good to just be around people."'), thread: 'small' };
    },

    convoThreadHasMore(vid) {
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const t = c.thread;
      // TOPIC PACK (Steve 2026-10-06): generated topics track their own depth.
      if (this.topic2Has && this.topic2Has(t)) return this.topic2HasMore(vid);
      if (t === 'goal') {
        const goal = this.npcGoal(vid);
        const lines = (cg.goalFollow || {})[goal] || [];
        const said = c.said.goaldeep || [];
        return said.length < lines.length;
      }
      if (t === 'past') {
        // A deflected past is a closed door, not a thread: "Tell me more."
        // must not pry it open with pastFollow beats. Other topics stay open.
        if (c.pastDeflected) return false;
        const said = c.said.pastdeep || [];
        return said.length < (cg.pastFollow || []).length;
      }
      if (t === 'plans') {
        const said = c.said.plansdeep || [];
        return said.length < (cg.plansFollow || []).length;
      }
      return false;
    },

    convoThreadBeat(vid) {
      // The next beat in the current thread, or null when it's honestly done.
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const vp = this.vpOf(vid);
      const t = c.thread;
      let l = null;
      if (t === 'goal') {
        const goal = this.npcGoal(vid);
        l = this.convoPick(vid, 'goaldeep', (cg.goalFollow || {})[goal] || []);
      } else if (t === 'past') {
        l = this.convoPick(vid, 'pastdeep', cg.pastFollow || []);
      } else if (t === 'plans') {
        l = this.convoPick(vid, 'plansdeep', cg.plansFollow || []);
      }
      // TOPIC PACK (Steve 2026-10-06): generated topic beats.
      else if (this.topic2Has && this.topic2Has(t)) l = this.topic2Beat(vid);
      if (!l) return null;
      c.depth++;
      return this.fillTalkLine(l, vp);
    },

    convoAskTopic(vid, topic) {
      // Ask about something specific. Threads develop; pools never repeat.
      // One topic per conversation — re-asking gets an honest deflection.
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const exh = () => this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']);
      c.askedTopics = c.askedTopics || [];
      if (c.askedTopics.indexOf(topic) !== -1) return exh();
      c.askedTopics.push(topic);
      const vp = this.vpOf(vid);
      if (topic === 'personal') {
        // PERSONAL: the villager's own talk lines — generated from their
        // personality, occupation, backstory. These are the lines that make
        // them a person, not a template. (Steve 2026-10-05: wire up dead data)
        const talkLines = vp.talk || [];
        if (talkLines.length) {
          const l = this.convoPick(vid, 'personal', this.voicePool(vid, talkLines));
          c.thread = 'personal'; c.depth = 1;
          return l ? this.voiceLine(vid, this.fillTalkLine(l, vp)) : exh();
        }
        // Fallback if no personal lines (background survivors)
        return exh();
      }
      if (topic === 'goal') {
        const goal = this.npcGoal(vid);
        const goalDef = (this.data.characterGen.goals || []).find(g => g.id === goal);
        const l = this.convoPick(vid, 'goal', (goalDef && goalDef.lines) || []);
        this.state.village.goalsKnown = this.state.village.goalsKnown || {};
        this.state.village.goalsKnown[vid] = goal;
        this.remember(vid, 'shared_goal', goal || 'unknown');
        c.thread = 'goal'; c.depth = 1;
        return l ? this.voiceLine(vid, this.fillTalkLine(l, vp)) : exh();
      }
      if (topic === 'past') {
        // DEFLECTORS don't do "before". Withdrawn/prickly people with low
        // trust shut it down — that's a real conversation, not a dead end.
        const temp = this.npcTemper(vid);
        const trust = (this.state.village.trust || {})[vid] || 10;
        if ((temp === 'withdrawn' || temp === 'prickly') && trust < 40 && Math.random() < 0.55) {
          c.thread = 'past'; c.depth = 1; c.pastDeflected = true;
          return this.convoPickCycle(vid, 'deflectpast', [
            '"Before doesn\'t matter anymore." A wall comes down.',
            '"I don\'t talk about before." Flat. Final.',
            '"Long story. Not a good one. Let\'s leave it there."',
          ]);
        }
        const all = this.data.characterGen.talkTemplates || [];
        // PREFER occupation answers for "what did you do" — origin-flavored
        // lines ("I'm from Chicago...") are non-sequiturs here. Only fall
        // back to origin lines if no occupation lines exist.
        // (matches {occ}, {an_occ}, {Occ} — 'occ}' is the common tail)
        const occPool = all.filter(s => s.indexOf('occ}') !== -1);
        const pool = occPool.length ? occPool : all.filter(s => s.indexOf('{origin}') !== -1);
        const l = this.convoPick(vid, 'past', this.voicePool(vid, pool.length ? pool : ['"Before? I was {an_occ}. Feels like someone else\'s life."']));
        c.thread = 'past'; c.depth = 1;
        return l ? this.voiceLine(vid, this.fillTalkLine(l, vp)) : exh();
      }
      if (topic === 'village') {
        const vg = this.state.village;
        const bits = [];
        if ((vg.grief || 0) > 0) bits.push("everyone's quiet since the loss");
        if ((vg.cheer || 0) > 0) bits.push('people are in good spirits');
        const hungry = (vg.roster || []).filter(id => id !== this.villagerId && (this.npcNeeds(id).hunger || 0) > 70).length;
        if (hungry > 2) bits.push(hungry + ' people are going hungry');
        const scared = (vg.roster || []).filter(id => id !== this.villagerId && (this.npcNeeds(id).fear || 0) > 70).length;
        if (scared > 2) bits.push('people are scared');
        const heat = Object.values(vg.heat || {}).filter(h => h > 0).length;
        if (heat) bits.push("there's tension about who's in charge");
        // TEMPERAMENT-SPECIFIC (Steve 2026-10-05): the same generic pool made
        // every villager sound identical ("better than yesterday" x3). Now the
        // idle lines reflect who's talking.
        const temp = ((vp.personality || {}).temperament || 'steady').toLowerCase();
        const idleByTemp = {
          bold: [
            'holding. Because we hold — that\'s the job.',
            'fine. We decide it\'s fine, then we make it true.',
            'better than it looks. I refuse to read it any other way.',
          ],
          cautious: [
            '...okay, I think. Nothing\'s broken that I can see.',
            'stable, probably. I\'m watching for the crack.',
            'alright. For now. I keep checking.',
          ],
          warm: [
            'holding together, somehow. People are good, you know?',
            'tired, but nobody\'s giving up. That counts for a lot.',
            'we\'re alright. We look out for each other.',
          ],
          prickly: [
            'fine. Nobody died. High bar, cleared.',
            'whatever "okay" means out here. We\'re it.',
            'people are people. Still here.',
          ],
          steady: [
            'quiet. People keeping to themselves, mostly.',
            'stable. No crises today, which is its own kind of good.',
            'same as yesterday. I\'ll take boring.',
          ],
          restless: [
            'everyone\'s itchy. Too much sitting, not enough doing.',
            'fine, I guess. I need to move, though. You?',
            'okay. But okay feels like waiting for something.',
          ],
          dry: [
            'oh, thriving. Absolutely thriving. (We are not.)',
            'fine, in the technical sense.',
            'nobody\'s on fire. Today.',
          ],
          gentle: [
            'we\'re... okay. Being gentle with each other, mostly.',
            'tired, but kind. That\'s something.',
            'holding each other up. Quietly.',
          ],
          intense: [
            'everyone\'s awake now. Good. Awake is alive.',
            'focused. Finally. Fear sharpens.',
            'we\'re here. That\'s not nothing — that\'s everything.',
          ],
          withdrawn: [
            '...fine. I think. Haven\'t really... yeah. Fine.',
            'quiet. I like quiet. Mostly.',
            'okay. Don\'t ask me for details.',
          ],
        };
        const idlePool = idleByTemp[temp] || idleByTemp.steady;
        const line = bits.length ? bits.join('; ') + '.' : this.convoPickCycle(vid, 'villageidle', idlePool);
        // Repeat-check on the raw line — voiceLine is probabilistic, so the
        // voiced output can't be the dedupe key.
        const rawLine = '"Honestly? ' + line + '"';
        // Village news can repeat when nothing changed — say it differently.
        c.said.villagelines = c.said.villagelines || [];
        if (c.said.villagelines.indexOf(rawLine) !== -1) {
          c.thread = 'village'; c.depth = 1;
          return this.voiceLine(vid, '"Honestly? ' + this.convoPickCycle(vid, 'villageidle', [
            'same as before, mostly.',
            'no big changes. That\'s good news, out here.',
            'still standing. Ask me tomorrow.',
          ]) + '"');
        }
        c.said.villagelines.push(rawLine);
        c.thread = 'village'; c.depth = 1;
        return this.voiceLine(vid, rawLine);
      }
      if (topic === 'plans') {
        const l = this.convoPick(vid, 'plansdeep', cg.plansFollow || []);
        c.thread = 'plans'; c.depth = 1;
        return l ? this.voiceLine(vid, this.fillTalkLine(l, vp)) : exh();
      }
      if (topic === 'gossip') {
        // THE SOCIALITE'S VERB: "heard anything about anyone?" The gossip
        // engine lives in askAbout (game.js) and says its beats directly —
        // capture them so the conversation flow can display the line.
        // (askedTopics already gates this to once per conversation.)
        const said = [];
        const origSay = this.say;
        this.say = (t) => { said.push(String(t)); };
        try { this.askAbout(vid, 'gossip'); } catch (e) {}
        this.say = origSay;
        c.thread = 'gossip'; c.depth = 1;
        const line = said.join(' ');
        return this.voiceLine(vid, line) || exh();
      }
      if (topic === 'spread_rumor') {
        // THE DRAMA VERB: start a rumor about someone. Two-step: pick target, then rumor type.
        // The person you're talking to becomes the first hearer.
        const others = (this.state.village.roster || []).filter(id => 
          id !== vid && id !== this.villagerId);
        if (!others.length) return "There's no one to talk about.";
        c.thread = 'spread_rumor'; c.depth = 1;
        c.rumorTargets = others;
        // Return a line prompting target selection; the choices are built in convoChoices
        return `${this.displayName(vid)} leans in. "Oh? Who are we talking about?"`;
      }
      // TOPIC PACK (Steve 2026-10-06): generated identity/event topics delegate
      // to convoTopics.js. askedTopics was already pushed above.
      if (this.topic2Has && this.topic2Has(topic)) return this.topic2Ask(vid, topic);
      return null;
    },

    // playerVoice: WHO the player is this life. Steve's law (2026-10-06):
    // every player is a completely unique person, and not the same person
    // run to run. The player character is a full generated villager
    // (rosterChars[villagerId]) with temperament, occupation, age. Choice
    // labels draw from that identity: a gruff ex-soldier and a nervous
    // teenager do not "say" the same things.
    // voiceClass: blunt (bold/prickly/intense), soft (warm/gentle/cautious),
    // dry (dry), plain (steady/restless/withdrawn — the neutral register).
    // occTags: teachTags from the occupation def (medicinal, food) — a
    // medic asks about injuries the way a cook asks about hunger.
    playerVoice() {
      const rc = (this.state.village.rosterChars || {})[this.villagerId] || {};
      const temp = (rc.personality && rc.personality.temperament) || 'steady';
      const occName = rc.formerOccupation || '';
      const occDef = ((this.data || {}).characterGen || {}).occupations || [];
      const def = occDef.find(o => o.name === occName) || {};
      const voiceClass = { bold: 'blunt', prickly: 'blunt', intense: 'blunt',
        warm: 'soft', gentle: 'soft', cautious: 'soft', dry: 'dry' }[temp] || 'plain';
      return { temp, voiceClass, occName, occTags: def.teachTags || [],
               age: rc.age || null, name: rc.name || null };
    },

    // convoVoicePool: shared selection for tier x voice labels. Occupation
    // flavor wins (a medic's check-in is about injuries), then temperament
    // voice, then the relationship-tier default. Seeded per person so your
    // phrasing is stable — you sound like YOU, consistently.
    convoVoicePool(vid, def, seedKey) {
      const tier = this.convoVoiceTier(vid);
      const pv = this.playerVoice();
      let pool = null;
      if (def) {
        if (def.occ && pv.occTags.length) {
          for (const t of pv.occTags) { if (def.occ[t]) { pool = def.occ[t]; break; } }
        }
        if (!pool && def.voice && def.voice[pv.voiceClass]) pool = def.voice[pv.voiceClass];
        if (!pool && def.tier) pool = def.tier[tier] || def.tier.new;
      }
      pool = pool || [seedKey];
      const h = this._hashStr ? this._hashStr(vid + ':' + seedKey + ':' + tier + ':' + pv.voiceClass) : 0;
      return pool[Math.abs(h) % pool.length];
    },

    // convoVoiceTier: the REGISTER the player speaks in to this villager.
    // Not a stat — a voice. Strangers are careful and a little formal;
    // friends are direct; close ones are blunt and warm. Choice labels
    // should sound like a person whose relationship has a history, not
    // a menu that never changes. Tier shifts as trust/conversations grow —
    // your voice changing is the point, not a bug.
    convoVoiceTier(vid) {
      const trust = (this.state.village.trust || {})[vid] || 10;
      const c = this.convoGet(vid);
      const count = c.count || 0;
      if (trust >= 55 || count >= 6) return 'close';
      if (trust >= 30 || count >= 3) return 'warm';
      return 'new';
    },

    // convoLabel: topic prompts are NOT identical every time, and they're
    // not identical for every relationship. Each villager gets stable-per-
    // person phrasing (seeded by id hash) WITHIN their voice tier, so the
    // "paths" stop looking like paths and your voice deepens as trust grows.
    // You learn to talk to PEOPLE, not menus.
    convoLabel(vid, key) {
      const variants = {
        goal: {
          tier: {
            new: ['"What do you want? Out of all this."',
                  '"What are you hoping for, here?"'],
            warm: ['"What keeps you going?"',
                   '"What are you working toward — really?"'],
            close: ['"Tell me what you actually want. Not the polite version."',
                    '"If you could do anything tomorrow, what would it be?"'],
          },
          voice: {
            blunt: ['"What do you actually want?"', '"Endgame. What is it?"'],
            soft: ['"What are you hoping for? If you don\'t mind me asking."'],
            dry: ['"So. What\'s the dream?"'],
          },
        },
        past: {
          tier: {
            new: ['"What did you do — before?"',
                  '"Mind if I ask what your life was, before?"'],
            warm: ['"What was your life, before?"',
                   '"You\'ve never said what you did before all this."'],
            close: ['"Tell me about before. The real version."',
                    '"What do you miss most, from before?"'],
          },
          voice: {
            blunt: ['"What were you, before?"', '"Before all this — what?"'],
            soft: ['"Do you mind talking about before?"', '"What was your life like? Before, I mean."'],
            dry: ['"What did you used to be?"'],
          },
        },
        village: {
          tier: {
            new: ['"How\'s everyone holding up?"',
                  '"How are people doing?"'],
            warm: ['"What\'s the feeling around the fire lately?"',
                   '"Who\'s struggling that I haven\'t noticed?"'],
            close: ['"Be honest — how bad is it, really?"',
                    '"Who do I need to check on?"'],
          },
          occ: {
            medicinal: ['"Anyone hurt? Who needs looking at?"', '"How are the injured doing?"'],
            food: ['"Is anyone going hungry?"', '"How\'s the food holding out — honestly?"'],
          },
          voice: {
            blunt: ['"Everyone still breathing?"', '"Who\'s falling apart?"'],
            soft: ['"Is everyone alright? Really alright?"'],
            dry: ['"How\'s morale? Or shouldn\'t I ask."'],
          },
        },
        plans: {
          tier: {
            new: ['"What\'s your plan for tomorrow?"',
                  '"Thought about what\'s next?"'],
            warm: ['"Any plans, or just getting through?"',
                   '"What are you thinking for tomorrow?"'],
            close: ['"So what\'s the move tomorrow?"',
                    '"What do you need tomorrow to look like?"'],
          },
          voice: {
            blunt: ['"Tomorrow. What\'s the plan?"'],
            soft: ['"Have you thought about tomorrow at all?"'],
            dry: ['"What\'s the plan, then?"'],
          },
        },
        gossip: {
          tier: {
            new: ['"Heard anything about anyone?"',
                  '"What\'s the word around the fire?"'],
            warm: ['"Anyone saying anything interesting?"',
                   '"What are people saying when they think I\'m not listening?"'],
            close: ['"Give me the real gossip. All of it."',
                    '"What aren\'t people saying out loud?"'],
          },
          voice: {
            blunt: ['"What are people saying?"'],
            soft: ['"Has anyone told you anything — about anyone?"'],
            dry: ['"Any good gossip? I\'m bored."'],
          },
        },
      };
      const def = variants[key] || null;
      // Unknown topic keys fall through to the action-voice system
      // ('personal' lives there) rather than echoing a raw key.
      if (!def) return this.convoActionLabel(vid, key);
      return this.convoVoicePool(vid, def, 'ask:' + key);
    },

    // convoMoreLabel: continuers that fit the moment. A continuer should
    // sound like a response to WHAT THEY JUST SAID — not a button.
    // Gentle when they're grieving or scared; eager when they trail off
    // mid-story; per-thread otherwise. Stable per person within context.
    convoMoreLabel(vid) {
      const c = this.convoGet(vid);
      // TOPIC PACK (Steve 2026-10-06): generated topics have their own more-labels.
      if (this.topic2Has && this.topic2Has(c.thread || '')) return this.topic2MoreLabel(vid);
      const thread = c.thread || 'small';
      const mood = (this.npcMood && this.npcMood(vid)) || '';
      const themLines = (c.transcript || []).filter(e => e.who === 'them');
      const last = themLines.length ? String(themLines[themLines.length - 1].text || '') : '';
      const trailsOff = /(\.\.\.|—|…)\s*"?$/.test(last);
      const askedYou = /\?\s*"?$/.test(last);
      let pool;
      if (mood === 'grieving' || mood === 'scared') {
        pool = ['"Take your time."', '"I\'m here. Go on."', '"You don\'t have to say it all at once."'];
      } else if (trailsOff) {
        pool = ['"What? What were you going to say?"', '"And then?"', '"Don\'t stop there —"'];
      } else if (askedYou) {
        pool = ['"Hm. Let me think — go on, first."', '"Good question. What do YOU think?"'];
      } else {
        const variants = {
          past: ['"What happened next?"', '"Go on — what was it like?"', '"Then what?"'],
          goal: ['"Say more about that."', '"What would that look like?"', '"How would that even work?"'],
          plans: ['"And after that?"', '"What\'s the first step?"', '"How do you start?"'],
          village: ['"Who else?"', '"How bad is it, really?"', '"What aren\'t you telling me?"'],
          gossip: ['"Whoa — go on."', '"What else did you hear?"', '"Who told you that?"'],
          personal: ['"Go on."', '"I\'m listening."', '"What else?"'],
          small: ['"Go on."', '"I\'m listening."', '"Yeah?"'],
        };
        // Your voice colors even the continuer: a blunt person says "And?",
        // a soft one says "Please, go on." Same moment, different person.
        const pv = this.playerVoice();
        const voiceMore = { blunt: ['"And?"', '"Keep going."'],
                            soft: ['"Please, go on."', '"I\'m listening, I promise."'],
                            dry: ['"Do go on."'] }[pv.voiceClass];
        pool = voiceMore || variants[thread] || variants.small;
      }
      const pv = this.playerVoice();
      const h = this._hashStr ? this._hashStr(vid + ':more:' + thread + ':' + pv.voiceClass + ':' + pool.length) : 0;
      return pool[Math.abs(h) % pool.length];
    },

    // convoActionLabel: the player's ACTION lines (offer help, trade,
    // teach, theorize, change subject, start a rumor...). Same principle:
    // voiced per relationship tier, stable per person. Things a person
    // would actually say out loud.
    convoActionLabel(vid, key) {
      const variants = {
        personal: {
          tier: {
            new: ['"I realize I don\'t actually know you. Who are you?"',
                  '"So \u2014 who are you, when nobody\'s watching?"'],
            warm: ['"Tell me about yourself \u2014 the parts you don\'t tell everyone."',
                   '"I want to know you better. The real you."'],
            close: ['"Talk to me. The real stuff."',
                    '"You never really told me your story."'],
          },
          voice: {
            blunt: ['"Who are you, then?"', '"Your story. Go."'],
            soft: ['"I\'d like to know you better, if that\'s alright."'],
            dry: ['"So what\'s your deal?"'],
          },
        },
        spread_rumor: {
          tier: {
            new: ['"Can I tell you something? About someone..."',
                  '"Between you and me \u2014 have you heard about...?"'],
            warm: ['"I heard something. About someone here."',
                   '"Can you keep a secret? It\'s about someone."'],
            close: ['"You\'ll want to hear this. It\'s about someone."',
                    '"Between us \u2014 I heard something about someone."'],
          },
          voice: {
            blunt: ['"Heard about someone. You\'ll want to know."'],
            dry: ['"I have gossip. Good gossip."'],
          },
        },
        theorize: {
          tier: {
            new: ['"What do you think is actually going on here?"',
                  '"Seriously \u2014 what do you make of all this?"'],
            warm: ['"You ever wonder what this is all for?"',
                   '"What\'s your theory? The real one."'],
            close: ['"Okay, real talk \u2014 what IS this?"',
                    '"You and me, honestly: what do you think is happening?"'],
          },
          voice: {
            blunt: ['"What\'s your read on all this?"'],
            soft: ['"What do you think it all means? I keep wondering."'],
            dry: ['"Any theories? I\'m collecting."'],
          },
        },
        offer_help: {
          tier: {
            new: ['"I could help with that."',
                  '"If you need help, I\'m here."'],
            warm: ['"Let me help. I mean it."',
                   '"What if I helped with that?"'],
            close: ['"I\'ve got you. We\'ll figure it out."',
                    '"Say the word and I\'m in."'],
          },
          occ: {
            medicinal: ['"I might be able to help \u2014 it\'s what I did."', '"Let me help. I know bodies."'],
            food: ['"I can help with that \u2014 feeding people is what I do."'],
          },
          voice: {
            blunt: ['"Point me at the problem."'],
            soft: ['"Can I help? Please \u2014 let me."'],
            dry: ['"I could be useful, if you want."'],
          },
        },
        trade: {
          tier: {
            new: ['"You know things. I know things. Shall we trade?"'],
            warm: ['"I\'ll show you mine if you show me yours \u2014 knowledge, I mean."',
                   '"Trade you something I know for something you know?"'],
            close: ['"Let\'s trade what we know."',
                    '"Teach me something; I\'ll return the favor."'],
          },
          voice: {
            blunt: ['"Trade knowledge. You in?"'],
            dry: ['"Knowledge for knowledge. Fair trade."'],
          },
        },
        teach: {
          tier: {
            new: ['"Could I show you something?"',
                  '"Mind if I show you something I learned?"'],
            warm: ['"Let me show you something."',
                   '"Here \u2014 let me show you."'],
            close: ['"Come here, I want to show you this."',
                    '"Watch \u2014 this is useful."'],
          },
          occ: {
            medicinal: ['"Let me show you \u2014 I did this for a living."'],
            food: ['"Here, I know this one \u2014 let me show you."'],
          },
          voice: {
            blunt: ['"Watch. This matters."'],
            soft: ['"Can I show you something? It might help."'],
          },
        },
        subject: {
          tier: {
            new: ['"Can I ask you something else?"',
                  '"Actually \u2014 different question."'],
            warm: ['"Can we talk about something else a minute?"',
                   '"Changing the subject \u2014"'],
            close: ['"Different thing \u2014"', '"Okay, new subject:"'],
          },
          voice: {
            blunt: ['"Next subject."'],
            soft: ['"Can we \u2014 can we talk about something else?"'],
            dry: ['"Anyway \u2014"'],
          },
        },
        invite_party: {
          tier: {
            new: ['"Want to come with me?"'],
            warm: ['"Come with me. I could use you."',
                   '"I\'m heading out \u2014 come along?"'],
            close: ['"You\'re coming with me."',
                    '"I need you on this one. Come on."'],
          },
          voice: {
            blunt: ['"You\'re with me tomorrow."'],
            soft: ['"Would you come with me? I\'d feel better."'],
          },
        },
      };
      const def = variants[key] || null;
      if (!def) return key;
      return this.convoVoicePool(vid, def, 'act:' + key);
    },

    convoChoices(vid) {
      const c = this.convoGet(vid);
      const choices = [];
      // Answering their question comes first — it's rude to ignore it.
      if (c.pendingQ) {
        const region = (this.homeRegion || (this.state.scholar || {}).homeRegion) || 'far from here';
        for (const a of c.pendingQ.answers) choices.push({ id: 'ans:' + c.pendingQ.id + ':' + a.id, label: String(a.label).replaceAll('{region}', region) });
        choices.push({ id: 'deflect_q', label: '(avoid the question)' });
        choices.push({ id: 'leave', label: '"I should go."' });
        return choices;
      }
      if (c.thread === 'nonverbal') {
        return [
          { id: 'nv:nod', label: '(nod slowly)' },
          { id: 'nv:smile', label: '(smile)' },
          { id: 'nv:pointself', label: '(point: you, them, together)' },
          { id: 'leave', label: '(walk away)' },
        ];
      }
      // TRADE THREAD: focused. They've laid out terms; you decide.
      if (c.thread === 'trade' && c.pendingTrade) {
        return [
          { id: 'trade_yes', label: '"Deal."' },
          { id: 'trade_no', label: '"Another time, maybe."' },
          { id: 'leave', label: '"I should go."' },
        ];
      }
      // CONTINUER (Steve 2026-10-05): one-beat turns. When the engine held
      // follow-on beats, the continuer leads the choices — voiced per
      // person, mood, and thread (convoMoreLabel), never a hardcoded
      // "Go on." (unique-person law, Steve 2026-10-06).
      if (c.thread !== 'nonverbal' && (c.heldBeats || []).length) {
        choices.unshift({ id: 'goon', label: this.convoGoonLabel(vid) });
      }
      // REACTIVE: they asked you something direct ("Did you see that?").
      // Answers come first — it's rude to ignore it. Pivots (teach/theorize)
      // are suppressed while the question hangs: you don't teach burdock
      // when someone asks if you saw something move by the tree line.
      const reactiveDef = c.reactiveQ ? REACTIVE_DEFS[c.reactiveQ.id] : null;
      if (reactiveDef) {
        for (const a of reactiveDef.answers) {
          choices.push({ id: 'react:' + c.reactiveQ.id + ':' + a.id, label: a.label });
        }
      }
      // GENERIC-Q: a direct question with no bespoke def still deserves
      // answers first (Rule 4). Same narrowing as reactive: pivots wait.
      // One generic react rides along — nodding along is a valid answer
      // too, and a passive conversationalist is never stranded with no
      // valid move mid-question.
      const gqActive = c.genericQ && !reactiveDef && !c.pendingQ;
      const gqAnswers = gqActive ? this.convoGenericAnswers(vid, c.genericQ) : [];
      for (const a of gqAnswers) choices.push(a);
      if (gqActive) {
        const gr = [['agree', '"You\'re right."'], ['joke', '"Ha — yeah."'], ['silence', '"..."']];
        const pick = gr[Math.floor(Math.random() * gr.length)];
        choices.push({ id: pick[0], label: pick[1] });
      }
      // RUMOR THREAD: two-step — pick WHO, then WHAT. While the thread is
      // open the menu narrows to the steps, like the reactive narrowing
      // above. (Fix 2026-10-06: the thread used to dangle at "who are we
      // talking about?" with no follow-up choices — rumors could never be
      // started through conversation.)
      if (c.thread === 'spread_rumor' && !c.rumorDone && !reactiveDef && !gqActive && !c.pendingQ) {
        const rlist = [];
        if (!c.rumorTarget) {
          for (const tid of (c.rumorTargets || [])) {
            rlist.push({ id: 'rumor:tgt:' + tid, label: this.displayName(tid) });
          }
        } else {
          const tname = this.firstRef ? this.firstRef(c.rumorTarget) : this.displayName(c.rumorTarget);
          const types = [
            ['stingy', `"${tname}'s been holding back. Keeping the good stuff close."`],
            ['untrustworthy', `"Can't trust ${tname}. Watch your back around them."`],
            ['generous', `"${tname}'s been generous. Sharing around, no questions asked."`],
            ['scheming', `"${tname}'s scheming. Planning something — I can see it."`],
            ['coward', `"${tname} froze when it mattered. Coward."`],
          ];
          for (const [ty, label] of types) rlist.push({ id: 'rumor:type:' + ty, label });
        }
        rlist.push({ id: 'leave', label: '"Never mind."' });
        return rlist;
      }
      const suppressPivot = !!c.reactiveQ || !!c.genericQ || c.thread === 'grief' || c.thread === 'cheer';
      // MAXC: the chat view has room for a real choice list. Topic asks
      // must never be starved by action buttons — Steve found deep topics
      // unreachable when discovery actions filled all 5 slots.
      // When a direct question hangs (reactive), the menu narrows to the
      // answers plus a couple conversational options — discovery actions
      // return next exchange, once the question is engaged. You don't get
      // the full menu mid-question; that's the coherence fix, not a bug.
      // (7: five topic asks can now be open at once — gossip joined them —
      // and discovery actions must still fit behind topics/theorize/observe.)
      const MAXC = reactiveDef ? reactiveDef.answers.length + 2 : gqActive ? gqAnswers.length + 3 : 7;
      if (c.thread && this.convoThreadHasMore(vid)) choices.push({ id: 'more', label: this.convoMoreLabel(vid) });
      // DEPTH GATING: what they'll talk about depends on how well they know
      // you. Little hits over time, like real people. Defined once, used by
      // theorize and the topic asks below — and by the party-invite trust
      // check above it (moved up 2026-10-06: the invite block read effTrust
      // before its const declaration, a TDZ ReferenceError the try/catch
      // swallowed — invite_party silently never appeared).
      // - village, plans: always (safe small talk)
      // - past: trust 20+ or 2nd conversation
      // - goal: trust 35+ or 3rd conversation (what they really want)
      // - theorize: trust 25+ or 2nd conversation (thinking together is intimate)
      // DEFLECTORS offer fewer doors: withdrawn/prickly/restless people don't
      // volunteer every topic — you get two, and you earn the rest.
      const trustNow = (this.state.village.trust || {})[vid] || 10;
      const convoCount = c.count || 0;
      // MOOD (convo-mood.js): warmth opens doors, tension closes them.
      // Effective trust for depth gates shifts with the conversation's
      // temperature (±15). A tense villager shuts doors (fewer topics);
      // a warm one volunteers more.
      const moodBandNow = typeof this.convoMoodBand === 'function' ? this.convoMoodBand(vid) : 'neutral';
      const effTrust = trustNow + (typeof this.convoMoodMod === 'function' ? this.convoMoodMod(vid) : 0);
      // PARTY INVITES live in conversation, not on a button. Discovered via
      // the System unlock. You ask people. Like a person.
      // Sits with 'more', AHEAD of the topic asks: a trust-earned, contextual
      // person-action must never be crowded out by small talk. When you've
      // earned the right to ask, the ask is there.
      if (choices.length < MAXC) {
        try {
          if (this.state.systemArrived && this.partyUnlocked && this.partyUnlocked() &&
              !this.inParty(vid) && !this.partyFull()) {
            if (this.hasDiscovered('party') && effTrust >= 20) choices.push({ id: 'invite_party', label: this.convoActionLabel(vid, 'invite_party') });
          }
        } catch (e) {}
      }
      // TOPIC ASKS come first — the conversation itself. Discovery actions
      // (trade/teach/promise/invite) fill whatever slots remain; they never
      // crowd out the talk.
      const threadAsk = { goal: 'ask:goal', past: 'ask:past', village: 'ask:village', plans: 'ask:plans', gossip: 'ask:gossip', personal: 'ask:personal' }[c.thread];
      const asked = c.askedTopics || [];
      const tempNow = this.npcTemper(vid);
      const topicCap = (tempNow === 'withdrawn' || tempNow === 'prickly' || tempNow === 'restless') ? 2 : 5;
      // Tense conversations close down: one fewer door (min 1).
      const topicCapMood = moodBandNow === 'tense' ? Math.max(1, topicCap - 1) : topicCap;
      const pastOpen = effTrust >= 20 || convoCount >= 2;
      const goalOpen = effTrust >= 35 || convoCount >= 3;
      // GOSSIP ASK: the socialite's core verb. "Heard anything about anyone?"
      // The detective layer is ask-able, not just receive-only. Same intimacy
      // gate as theorize; sits with the other topic asks, never crowding out
      // discovery actions.
      const gossipOpen = effTrust >= 20 || convoCount >= 2;
      const asks = [];
      // PERSONAL: their own words — the talk lines generated from personality.
      // Always available and prioritized; it's who they are, not what they know.
      if (asked.indexOf('personal') === -1) asks.push({ id: 'ask:personal', label: this.convoActionLabel(vid, 'personal') });
      // GOSSIP FIRST: the socialite's core verbs. They used to sit last in
      // the asks list, so the topic cap (5, or 2 for deflectors) starved
      // them on a fresh conversation — gossip and rumor-spreading were
      // unreachable until you'd exhausted every other topic. (socialite
      // playtest 2026-10-06)
      if (gossipOpen && asked.indexOf('gossip') === -1) asks.push({ id: 'ask:gossip', label: this.convoLabel(vid, 'gossip') });
      // SPREAD RUMOR: the player's drama verb. Start a rumor about someone.
      // Same gate as gossip — you need some rapport to be believed.
      if (gossipOpen && asked.indexOf('spread_rumor') === -1) asks.push({ id: 'ask:spread_rumor', label: this.convoActionLabel(vid, 'spread_rumor') });
      if (!this.goalKnown(vid) && asked.indexOf('goal') === -1 && goalOpen) asks.push({ id: 'ask:goal', label: this.convoLabel(vid, 'goal') });
      if (asked.indexOf('past') === -1 && pastOpen) asks.push({ id: 'ask:past', label: this.convoLabel(vid, 'past') });
      if (asked.indexOf('village') === -1) asks.push({ id: 'ask:village', label: this.convoLabel(vid, 'village') });
      if (asked.indexOf('plans') === -1) asks.push({ id: 'ask:plans', label: this.convoLabel(vid, 'plans') });
      // TOPIC PACK (Steve 2026-10-06): fresh generated topics get first crack
      // at the topic budget — who this villager IS shouldn't wait behind small
      // talk forever. 'lately' always qualifies: live events cut the queue.
      // Once a generated topic's been discussed, it joins the rotation behind
      // the main asks. Shared budget — the cap never grows.
      let topicsAdded = 0;
      const t2said = (this.convoGet(vid).said || {});
      const t2list = this.topic2Asks ? this.topic2Asks(vid) : [];
      const freshCap = topicCapMood <= 2 ? 1 : 2;
      for (const a of t2list) {
        const tid = a.id.slice(4);
        if (tid !== 'lately' && (t2said['t2:' + tid] || []).length) continue;
        if (a.id === threadAsk || topicsAdded >= freshCap || topicsAdded >= topicCapMood || choices.length >= MAXC) continue;
        choices.push(a); topicsAdded++;
      }
      for (const a of asks) {
        if (a.id === threadAsk || topicsAdded >= topicCapMood || choices.length >= MAXC) continue;
        choices.push(a); topicsAdded++;
      }
      for (const a of t2list) {
        const tid = a.id.slice(4);
        if (tid === 'lately' || !(t2said['t2:' + tid] || []).length) continue;
        if (a.id === threadAsk || topicsAdded >= topicCapMood || choices.length >= MAXC) continue;
        choices.push(a); topicsAdded++;
      }
      // THEORIZE: joint discovery, a signature mechanic — not small talk.
      // GATED: thinking together is intimate. System talk only makes sense
      // after it arrives; before that, the scattering itself and the
      // monsters are the mystery.
      const theorized = c.theorized || [];
      const sysUp = !!this.state.systemArrived;
      const theorizeOpen = effTrust >= 25 || convoCount >= 2;
      const topicsLeft = ['system', 'monsters', 'situation'].filter(t =>
        theorized.indexOf(t) === -1 && (t !== 'system' || sysUp));
      if (theorizeOpen && topicsLeft.length && choices.length < MAXC && !suppressPivot) choices.push({ id: 'theorize', label: this.convoActionLabel(vid, 'theorize') });
      // WATCH THEM: the detective's tool. Spend time observing — behavior may
      // contradict story. Available once you've talked enough to have a baseline
      // (2nd conversation+), or if you already have doubts about them.
      // (observePerson lives in truth.js; guarded in case that module is absent.)
      if (choices.length < MAXC && typeof this.observePerson === 'function') {
        const hasDoubts = this.getDoubts && this.getDoubts(vid).length > 0;
        if (convoCount >= 2 || hasDoubts) {
          choices.push({ id: 'observe', label: hasDoubts ? '"I\'ve been watching you. Keep talking."' : '(watch them for a while)' });
        }
      }
      // DISCOVERY ACTIONS fill the remaining slots — trade, teach, promise,
      // invite. Meaningful, but the conversation itself comes first.
      // PROMISES are discovered, not menued. Before you've learned the
      // concept, the offer only surfaces when they've really opened up
      // (deep in their goal thread). After that, any known goal will do.
      // The handler makes a FORMAL tracked promise — keep it or break it.
      const alreadyPromised = !!((this.state.village.promises || {})[vid]);
      if (this.goalKnown(vid) && !c.offeredHelp && !alreadyPromised && choices.length < MAXC) {
        const openedUp = c.thread === 'goal' && (c.depth || 0) >= 2;
        if (this.hasDiscovered('promise') || openedUp) choices.push({ id: 'offer_help', label: this.convoActionLabel(vid, 'offer_help') });
      }
      // KNOWLEDGE TRADING is discovered through conversation: traders seed it
      // by mentioning it; once learned, you can raise it with any trader.
      if (choices.length < MAXC) {
        try {
          const isTrader = this.isKnowledgeTrader && this.isKnowledgeTrader(vid);
          const tradeable = isTrader ? (this.traderKnowledge(vid) || []) : [];
          if (isTrader && tradeable.length && (this.hasDiscovered('trade') || c.traderMentioned)) {
            choices.push({ id: 'trade', label: '"You know things. I know things. Shall we trade?"' });
          }
        } catch (e) {}
      }
      // TEACHING happens in conversation now — show, don't menu.
      // Suppressed while a direct question hangs: no burdock non sequiturs.
      if (choices.length < MAXC && !suppressPivot) {
        try {
          const youKnow = Object.keys(this.state.codex.plants || {});
          const theyKnow = (this.state.village.taught && this.state.village.taught[vid]) || [];
          if (youKnow.some(pid => theyKnow.indexOf(pid) === -1)) {
            choices.push({ id: 'teach', label: this.convoActionLabel(vid, 'teach') });
          }
        } catch (e) {}
      }
      const reacts = [
        { id: 'agree', label: '"You\'re right."' },
        { id: 'joke', label: '"Ha — yeah."' },
        { id: 'silence', label: '"..."' },
      ];
      if (choices.length < MAXC) choices.push(reacts[Math.floor(Math.random() * reacts.length)]);
      if (c.thread && c.thread !== 'small' && choices.length < MAXC) choices.push({ id: 'subject', label: '"Can I ask you something else?"' });
      choices.push({ id: 'leave', label: c.exchanges === 0 ? '"Nice talking to you."' : '"I should go."' });
      return choices;
    },

    startConvo(vid) {
      // MODAL (Steve 2026-10-05): one conversation at a time. If another is
      // active, end it first — you can't talk to two people at once.
      const v = this.state.village;
      for (const otherId of Object.keys(v.convos || {})) {
        if (otherId !== vid) {
          const oc = (v.convos || {})[otherId];
          if (oc && oc.active) {
            oc.active = false; oc.over = true;
            try {
              const oname = this.displayName(otherId) || 'them';
              this.say(`You turn away from ${oname} mid-conversation.`);
            } catch (e) {}
          }
        }
      }
      const vp = this.vpOf(vid);
      if (!vp || !vp.id) return null;
      const c = this.convoGet(vid);
      c.active = true; c.exchanges = 0; c.budget = this.convoBudget(vid);
      c.thread = null; c.depth = 0; c.transcript = []; c.pendingQ = null;
      c.over = false; c.offeredHelp = false; c.askedTopics = [];
      c.qCount = 0; c.theorized = [];
      c.traderMentioned = false; c.pendingTrade = null;
      c.reactiveQ = null; c.windingDown = false; c.pastDeflected = false;
      // MOOD (convo-mood.js): every conversation starts at a temperature
      // derived from the relationship as it stands and who they are right
      // now — never stored, re-derived fresh each time (Steve 2026-10-06).
      // Guarded: old harnesses may load conversation.js without convo-mood.js.
      c.mood = typeof this.convoMoodInit === 'function' ? this.convoMoodInit(vid) : 0;
      c.moodGuardUsed = false; c.moodGraceUsed = false; c.moodBeat = null;
      c.genericQ = null; c.floraMentioned = null;
      c.count++; c.lastDay = this.state.scholar.day;
      // TALKING COSTS A LITTLE ENERGY — 10 kcal to open a conversation, not
      // per line. Small talk is quick and cheap; going deep costs ticks
      // (see convoDeepTick), not a flat tax. Social play stays viable.
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 10);
      // ACTION CLOCK: opening a conversation takes 1 tick (time-only —
      // talking barely burns calories). Deep beats add ticks as they land.
      // ENGAGEMENT: they're talking with you now — batch turns won't wander them off.
      this.tickAction(1);
      this.setEngaged(vid, 2);
      if (this.state.scholar.week1) this.state.scholar.week1.talk++;
      this.notePlaystyle('social');
      this.gainAbilityXP('diplomat', 1);
      // LANGUAGE: the barrier is discovered in conversation, never listed.
      const comm = this.commLevel(vid);
      const firstMet = !(v.met || {})[vid];
      v.met = v.met || {}; v.met[vid] = true;
      if (firstMet && comm.level !== 'full') {
        const langName = ((this.data.characterGen || {}).languages || []).find(l => l.id === comm.lang);
        const label = langName ? `${langName.icon} ${langName.name}` : comm.lang;
        this.say(`...and then it lands: ${this.displayName(vid)} speaks ${label}. ${comm.level === 'partial' ? 'A few shared words. Gestures. Patience.' : 'You share no language at all.'}`);
      }
      // NAMES ARE EARNED SOCIALLY — but only with enough shared language.
      if (firstMet && !this.state.systemArrived && comm.level !== 'none') this.revealName(vid, 'intro');
      if (firstMet && !this.state.systemArrived && comm.level === 'none') this.revealName(vid, 'gesture');
      // ALIVE: talking eases loneliness — for them, not just you.
      try { this.npcNeeds(vid).social = Math.max(0, this.npcNeeds(vid).social - 40); } catch (e) {}
      if (comm.level === 'none') {
        // No shared language: real foreign speech, not gestures-then-English.
        // nvOpen (appended module) states the barrier plainly and lets them
        // speak their actual tongue.
        return this.nvOpen(vid);
      }
      const op = this.convoOpening(vid);
      // DEFENSIVE (Steve 2026-10-05): convoOpening must return {line, thread}.
      // A bare-string return once rendered as `Name: "undefined"` — normalize
      // here so no future branch can leak that into the fiction.
      const opLine = (op && typeof op === 'object' && op.line) ? op.line
        : (typeof op === 'string' && op) ? op : '"Hey."';
      const opThread = (op && typeof op === 'object' && op.thread) ? op.thread : 'small';
      c.thread = opThread; c.depth = 1;
      // REACTIVE: if the opener asked something direct ("Did you see that?"),
      // it becomes a lightweight question — answerable, follow-up-able,
      // not small talk the player can only dodge.
      // TALK REQUESTS are exempt: "Can we talk? ..." is the reason they came
      // to you, not a question — matching it produced the garbled
      // "Sorry — I asked you something there. Can we talk?" follow-up.
      const rq = (opThread === 'request') ? null : this.convoMatchReactive(opLine);
      if (rq) {
        c.reactiveQ = { id: rq.id, followedUp: false };
        if (rq.thread) { c.thread = rq.thread; }
      } else {
        // GENERIC-Q: opener asked something direct with no bespoke def —
        // hang it as an answerable question (Rule 4).
        this.convoGenericQ(vid, opLine);
      }
      this.convoNoteFlora(vid, opLine);
      c.transcript.push({ who: 'them', text: opLine });
      this.sayLine(vid, opLine);
      // SEEDING: knowledge traders mention their trade in conversation — the
      // mechanic is discovered by talking, not by a button. Once you've
      // learned the concept, you can bring it up with any trader yourself.
      if (this.isKnowledgeTrader && this.isKnowledgeTrader(vid) && !this.hasDiscovered('trade') && Math.random() < 0.5) {
        const seed = '"...I should say, I trade in what I know. My knowledge for yours. Or food, if you\'re short on secrets."';
        c.transcript.push({ who: 'them', text: seed });
        this.say(`${this.displayName(vid)}: ${seed}`);
        c.traderMentioned = true;
      }
      return { line: opLine, choices: this.convoChoices(vid), transcript: c.transcript.slice(), ended: false };
    },

    // convoGoonLabel: the continuer, voiced per person/mood/thread — or a
    // gesture when there's no shared language. Never a hardcoded "Go on."
    // (unique-person law, Steve 2026-10-06).
    convoGoonLabel(vid) {
      const c = this.convoGet(vid);
      if (c.thread === 'nonverbal') return '(watch quietly)';
      return this.convoMoreLabel(vid);
    },

    // convoWinddownChoices: one last turn — say goodbye yourself, take one
    // more beat of a live thread, or just leave.
    convoWinddownChoices(vid) {
      const wdChoices = [{ id: 'leave', label: '"I should go."' }];
      if (this.convoThreadHasMore(vid)) {
        wdChoices.push({ id: 'more', label: '"One more thing —"' });
      }
      const reacts = ['agree', 'joke', 'silence'];
      const rid = reacts[Math.floor(Math.random() * reacts.length)];
      const rlabels = { agree: '"You\'re right."', joke: '(crack a joke)', silence: '(say nothing)' };
      wdChoices.push({ id: rid, label: rlabels[rid] });
      return wdChoices;
    },

    convoTurn(vid, choiceId) {
      const c = this.convoGet(vid);
      if (!c.active) return null;
      // Old saves / mid-run convos predate heldBeats (one-beat-turns):
      // lazy-init so a dodged question can't crash the turn.
      if (!c.heldBeats) c.heldBeats = [];
      const cg = (this.data.characterGen || {}).convo || {};
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      let line = null, youSaid = null;
      const done = (l, you) => { line = l; youSaid = you || null; };
      // MOOD-SAFE shift (convo-mood.js): old harnesses may load
      // conversation.js without the mood module — never crash alone.
      const mshift = (d) => { if (typeof this.convoMoodShift === 'function') this.convoMoodShift(vid, d); };
      // answeredReactive: this turn engaged their direct question — the
      // follow-up logic must not fire. extraQ: a formal question that lands
      // as a second beat in the same turn (rq_personal -> real question).
      // extraLine: a follow-up beat after an answer — Q -> A -> follow-up,
      // so answering doesn't dead-end the moment.
      let answeredReactive = false, answeredGeneric = false, extraQ = null, extraLine = null;

      // ONE-BEAT TURNS (Steve 2026-10-05): a choice yields exactly one new
      // THEM beat. Unspoken held beats die when the player moves on — like
      // a real conversation, the moment passes. The wind-down can't be
      // dodged: it stays queued until the continuer reveals it.
      if (choiceId !== 'goon' && c.heldBeats && c.heldBeats.length) {
        c.heldBeats = c.heldBeats.filter(h => h.winddown);
        if (!c.heldBeats.length) { c.heldAsk = false; c.winddownQueued = false; }
      }

      if (choiceId === 'leave') {
        return this.endConvo(vid, 'left');
      } else if (choiceId === 'goon') {
        // CONTINUER (Steve 2026-10-05): the queued beat lands now, with
        // whatever state its showing implies. Nothing else happens this
        // turn — the beats belonged to the turn that queued them.
        // The label is voiced per person, mood, and thread (convoMoreLabel)
        // — never a hardcoded "Go on." (unique-person law, Steve 2026-10-06).
        const hb = (c.heldBeats || []).shift();
        if (hb) {
          // The ask-beat is the one piece of state that waits for the
          // showing: offering answers before the player has seen the
          // question would be answering blind.
          if (hb.ask) {
            c.pendingQ = hb.ask;
            c.qCount = (c.qCount || 0) + 1;
            if (c.askedQs.indexOf(hb.ask.id) === -1) c.askedQs.push(hb.ask.id);
            c.heldAsk = false;
          }
          const gl = this.convoGoonLabel(vid);
          c.transcript.push({ who: 'you', text: gl });
          c.transcript.push({ who: 'them', text: hb.text, foreign: hb.foreign });
          while (c.transcript.length > 200) c.transcript.shift();
          this.sayLine(vid, hb.text);
          done(hb.text, gl);
          if (hb.winddown) {
            // The goodbye lands: one last turn of choices, then it's over.
            // Only the player's "I should go." (or the turn after) ends it —
            // never a silent chop.
            c.windingDown = true;
            c.winddownQueued = false;
            const wdChoices = c.thread === 'nonverbal'
              ? [{ id: 'leave', label: '(walk away)' }, { id: 'nv:nod', label: '(nod slowly)' }]
              : this.convoWinddownChoices(vid);
            return { line, choices: wdChoices, ended: false, windingDown: true, transcript: c.transcript.slice() };
          }
        } else {
          done('"..."', null);
        }
        return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
      } else if (choiceId.indexOf('ans:') === 0) {
        const parts = choiceId.split(':');
        const qid = parts[1], aid = parts[2];
        const qd = (cg.questions || []).find(q => q.id === qid);
        const ad = qd && qd.answers.find(a => a.id === aid);
        c.answered[qid] = aid;
        if (c.askedQs.indexOf(qid) === -1) c.askedQs.push(qid);
        c.pendingQ = null;
        let react = (ad && ad.react) || '"Huh. Okay."';
        const regionNow = (this.homeRegion || (this.state.scholar || {}).homeRegion) || 'there';
        react = react.replaceAll('{region}', regionNow);
        const saidLabel = ad && ad.label ? String(ad.label).replaceAll('{region}', regionNow) : null;
        done(this.voiceLine(vid, this.fillTalkLine(react, this.vpOf(vid))), saidLabel);
        this.remember(vid, 'you_said', qid + '=' + aid);
        // FOLLOW-UP BEAT: answering a real question sometimes earns a second
        // beat — their thought continues instead of terminating. Not every
        // time; people don't monologue after every answer.
        if (qd && qd.follow && Math.random() < 0.5) {
          extraLine = this.voiceLine(vid, this.fillTalkLine(qd.follow, this.vpOf(vid)));
        }
      } else if (choiceId === 'deflect_q') {
        const qid = c.pendingQ && c.pendingQ.id;
        c.pendingQ = null;
        if (qid && c.askedQs.indexOf(qid) === -1) c.askedQs.push(qid);
        const t = this.state.village.trust || {};
        t[vid] = Math.max(0, (t[vid] || 10) - 1);
        // MOOD: dodging a direct question cools the room.
        mshift(-1);
        done('"Okay." Something shutters, just slightly.', '(avoid the question)');
      } else if (choiceId.indexOf('react:') === 0) {
        // REACTIVE ANSWER: engaged their direct question. The outcome must
        // read as a RESPONSE to what they asked — never a canned pivot.
        const parts = choiceId.split(':');
        const rid = parts[1], aid = parts[2];
        const rdef = REACTIVE_DEFS[rid];
        const ad = rdef && rdef.answers.find(a => a.id === aid);
        if (c.reactiveQ && c.reactiveQ.id === rid) c.reactiveQ = null;
        answeredReactive = true;
        const t = this.state.village.trust || {};
        if (ad && ad.action === 'look_treeline') {
          // "Let's go look. Together." — the contextual show, not burdock.
          const spooky = Math.random() < 0.5;
          t[vid] = Math.min(100, (t[vid] || 10) + (ad.trust || 0));
          // MOOD: warmth follows the trust delta — bravery together warms.
          mshift(Math.sign(ad.trust || 0));
          c.thread = 'spooked'; c.depth = 1;
          try { this.convoDeepTick(vid); } catch (e) {}
          done(spooky
            ? 'You go to the tree line together. Nothing moves. ...Or something just stopped moving. Broken branches at head height — snapped, not cut. You don\'t let go of each other\'s sleeves all the way back.'
            : 'You go to the tree line together and stare until your eyes water. Nothing. Just wind. "Okay," they breathe. "Okay. Good." Neither of you believes it.',
            '"Let\'s go look. Together."');
        } else if (ad && ad.action === 'ask_real') {
          // "Of course. Ask." — the personal question becomes a REAL
          // question with real answers (pendingQ machinery).
          const cg2 = (this.data.characterGen || {}).convo || {};
          const prefer = ['q_miss', 'q_regret', 'q_first_memory', 'q_hope', 'q_scared', 'q_trust'];
          let pool = (cg2.questions || []).filter(q => prefer.indexOf(q.id) !== -1 && c.askedQs.indexOf(q.id) === -1);
          if (!pool.length) pool = (cg2.questions || []).filter(q => c.askedQs.indexOf(q.id) === -1);
          const qd = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
          t[vid] = Math.min(100, (t[vid] || 10) + (ad.trust || 0));
          // MOOD: warmth follows the trust delta.
          mshift(Math.sign(ad.trust || 0));
          c.thread = 'small'; c.depth = 1;
          done(ad.line || '"...Okay. Here it is."', ad.label);
          // ONE-BEAT TURNS (Steve 2026-10-05): the question queues behind
          // "Of course. Ask." — pendingQ/askedQs/qCount land when the
          // continuer reveals it, never before the player has seen it asked.
          if (qd) extraQ = qd;
        } else if (ad) {
          t[vid] = Math.max(0, Math.min(100, (t[vid] || 10) + (ad.trust || 0)));
          // MOOD: warmth follows the trust delta — kind answers warm,
          // cruel or dismissive ones cool. No separate data needed.
          mshift(Math.sign(ad.trust || 0));
          if (rdef.thread) { c.thread = rdef.thread; c.depth = 1; }
          done(ad.line, ad.label);
        } else {
          done('"..."', null);
        }
      } else if (choiceId === 'more') {
        const beat = this.convoThreadBeat(vid);
        done(beat || this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']), '"Tell me more."');
      } else if (choiceId.indexOf('gq:') === 0) {
        // GENERIC ANSWER: the player answered their direct question. The
        // outcome must read as a RESPONSE — never a canned pivot (Rule 1).
        const parts = choiceId.split(':');
        const kind = parts[1], aid = parts[2];
        const wasGq = c.genericQ;
        c.genericQ = null; answeredGeneric = true;
        const t = this.state.village.trust || {};
        let youLine = null, resp = null;
        if (kind === 'yn') {
          youLine = aid === 'yes' ? '"Yes."' : aid === 'no' ? '"No."' : '"I don\'t know."';
          resp = this.convoPick(vid, 'gq:yn:' + aid, GQ_ACK[aid] || GQ_ACK.unsure);
          if (aid !== 'unsure') t[vid] = Math.min(100, (t[vid] || 10) + 1);
        } else if (kind === 'howru') {
          youLine = aid === 'bad' ? '"Honestly? Not great."' : aid === 'fine' ? '"I\'m fine."' : '"Better when I\'m busy."';
          resp = this.convoPick(vid, 'gq:howru:' + aid, GQ_ACK['howru_' + aid] || GQ_ACK.howru_fine);
          t[vid] = Math.min(100, (t[vid] || 10) + (aid === 'bad' ? 2 : 1));
        } else if (kind === 'greet') {
          youLine = aid === 'notmuch' ? '"Not much. You?"' : '"Surviving."';
          resp = this.convoPick(vid, 'gq:greet:' + aid, GQ_ACK['greet_' + aid] || GQ_ACK.greet_notmuch);
          t[vid] = Math.min(100, (t[vid] || 10) + 1);
        } else {
          if (aid === 'take') {
            youLine = '"What do you think?"';
            resp = this.convoPick(vid, 'gq:open:take', GQ_TAKES);
            t[vid] = Math.min(100, (t[vid] || 10) + 1);
          } else {
            youLine = '"I don\'t know yet."';
            resp = this.convoPick(vid, 'gq:open:unsure', GQ_ACK.unsure);
          }
        }
        if (wasGq && wasGq.kind === 'howru' && aid === 'bad') {
          try { this.convoDeepTick(vid); } catch (e) {}
        }
        done(this.voiceLine(vid, resp || '"Hm."'), youLine);
      } else if (choiceId.indexOf('ask:') === 0) {
        const topic = choiceId.slice(4);
        // DEEP BEATS build trust faster: asking about someone's past or what
        // they want is an act of care. Words only go so far — talk caps at 40.
        // TOPIC PACK (Steve 2026-10-06): you/fears/loved are acts of care too.
        if (topic === 'past' || topic === 'goal' || (this.topic2Deep && this.topic2Deep(topic))) {
          const t = this.state.village.trust || {};
          const cur = t[vid] || 10;
          if (cur < 40) t[vid] = Math.min(40, cur + 2);
        }
        // TOPIC PACK (Steve 2026-10-06): generated topics carry their own labels.
        done(this.convoAskTopic(vid, topic), this.topic2AskLabel ? this.topic2AskLabel(vid, topic) : this.convoLabel(vid, topic));
      } else if (choiceId === 'observe') {
        // WATCH THEM: the detective's tool. Costs time, may reveal that
        // behavior doesn't match story. (observePerson lives in truth.js.)
        const r = this.observePerson(vid);
        done(r.text, r.found ? '"I\'ve been watching you. Keep talking."' : '(watch them for a while)');
      } else if (choiceId === 'offer_help') {
        c.offeredHelp = true;
        // A promise is a FORMAL tracked commitment now — not just +2 trust.
        // This is the conversation path to promiseHelp (the button is gone).
        // Keep it or break it: they remember.
        const pr = this.promiseHelp(vid);
        if (pr && pr.ok) {
          done('"...Thank you. Really."', '"I could help with that."');
        } else {
          const l = this.convoPick(vid, 'offerhelp', [
            '"You\'d do that? ...Thank you. Really."',
            '"I won\'t forget you said that."',
            '"Okay. Okay — that means something, you know that?"',
          ]) || '"Thank you."';
          const t = this.state.village.trust || {};
          t[vid] = Math.min(100, (t[vid] || 10) + 2);
          done(l, '"I could help with that."');
        }
      } else if (choiceId === 'trade') {
        // Knowledge trading, discovered through conversation. They lay out
        // what they know and the price; you decide. No button was ever here.
        const tradeable = (this.traderKnowledge && this.traderKnowledge(vid)) || [];
        if (!tradeable.length) {
          done('"Nothing I know that you don\'t — right now. The green world keeps its secrets."', '"You know things. I know things. Shall we trade?"');
        } else {
          const pid = tradeable[0];
          const p = (this.data.plants || []).find(x => x.id === pid) || {};
          const pname = (this.plantKnown && this.plantKnown(pid)) ? p.name : (p.description || 'a plant');
          const trust = (this.state.village.trust || {})[vid] || 10;
          const price = trust >= 60 ? 'trust' : (trust >= 30 ? 'food' : 'knowledge');
          const priceLine = price === 'trust'
            ? '"For you? Just remember who taught you."'
            : price === 'food'
              ? `"${pname} — I know it deep. 300 kcal of food and it's yours."`
              : `"${pname}. Deep knowledge. ...What do YOU know that's worth it?"`;
          c.thread = 'trade'; c.depth = 1;
          c.pendingTrade = { pid, price };
          done(`"Ah. A fellow collector." ${priceLine}`, '"You know things. I know things. Shall we trade?"');
        }
      } else if (choiceId === 'trade_yes') {
        const pt = c.pendingTrade;
        c.pendingTrade = null; c.thread = null;
        if (pt) {
          const before = ((this.state.codex.plants || {})[pt.pid] || {}).level || 0;
          this.tradeKnowledge(vid, pt.pid);
          const after = ((this.state.codex.plants || {})[pt.pid] || {}).level || 0;
          done(after > before ? '"Pleasure doing business."' : '"...Come back when you can pay."', '"Deal."');
        } else {
          done('"..."', '"Deal."');
        }
      } else if (choiceId === 'trade_no') {
        c.pendingTrade = null; c.thread = null;
        done('"Another time, then. Knowledge keeps."', '"Another time, maybe."');
      } else if (choiceId === 'teach') {
        // Teaching happens in conversation now — show, don't menu.
        // TOPICAL TEACH (Steve, Rule 2): show/teach must relate to what's
        // being discussed. If the green world came up, teach the plant that
        // came up. Otherwise the teach carries a bridge — "that reminds
        // me" — never a random burdock drop mid-thought.
        const youKnow = Object.keys(this.state.codex.plants || {});
        const theyKnow = (this.state.village.taught && this.state.village.taught[vid]) || [];
        const teachable = youKnow.filter(pid => theyKnow.indexOf(pid) === -1);
        if (!teachable.length) {
          done('"Huh — looks like we\'re even on the green stuff."', '"Let me show you something."');
        } else {
          const fm = c.floraMentioned;
          let pid = teachable[0], youLine = '"Let me show you something."', respLine = null;
          if (fm && fm.pid && teachable.indexOf(fm.pid) !== -1) {
            // They named it, you teach it — the show connects to the talk.
            pid = fm.pid;
            respLine = `You crouch down — the ${fm.name} you were just talking about. You show them where it grows, how to tell it apart, what it's good for. Their eyes widen. "I never knew that."`;
          } else if (!fm || fm.pid) {
            // Nothing green came up — or they named a plant you can't teach
            // them — so the teach pivots: bridge it or it's a non sequitur.
            youLine = this.convoPickCycle(vid, 'teachbridge', [
              '"That reminds me — let me show you something."',
              '"Speaking of staying alive out here — let me show you something."',
              '"Different subject, but this can\'t wait — let me show you something."',
            ]) || '"Let me show you something."';
          }
          // (generic flora words matched: the green world IS the topic —
          // teaching any plant connects without a bridge.)
          this.state.village.taught[vid] = this.state.village.taught[vid] || [];
          this.state.village.taught[vid].push(pid);
          const pname = ((this.data.plants || []).find(p => p.id === pid) || {}).name || pid;
          this.discover('teach');
          const t = this.state.village.trust || {};
          t[vid] = Math.min(100, (t[vid] || 10) + 2);
          try { this.socialTick(vid); } catch (e) {}
          try { this.convoDeepTick(vid); } catch (e) {}
          done(respLine || `You show them ${pname} — where it grows, how to tell it apart. Their eyes widen. "I never knew that."`, youLine);
        }
      } else if (choiceId === 'invite_party') {
        const r = (this.inviteToParty && this.inviteToParty(vid)) || { ok: false, msg: '...' };
        done(r.msg || '...', '"Want to come with me?"');
      } else if (choiceId.indexOf('rumor:tgt:') === 0) {
        // RUMOR STEP 1: who are we talking about. The listener is in on
        // the secret — they become the rumor's first hearer. (Fix
        // 2026-10-06: the thread dangled here with no follow-up choices.)
        const tid = choiceId.slice('rumor:tgt:'.length);
        c.rumorTarget = tid;
        c.thread = 'spread_rumor'; c.depth = 1;
        done(`"${(this.firstRef ? this.firstRef(tid) : this.displayName(tid))}? Okay. And what's the word — what am I hearing?"`,
          `"${this.displayName(tid)}."`);
      } else if (choiceId.indexOf('rumor:type:') === 0) {
        // RUMOR STEP 2: what's the word. The drama verb completes: the
        // rumor enters the gossip system WITH the listener as first hearer,
        // so spreadGossip has a teller and it can actually travel. (Fix
        // 2026-10-06: heard: [] meant rumors died on arrival.)
        const type = choiceId.slice('rumor:type:'.length);
        const rtarget = c.rumorTarget;
        const tname = this.firstRef ? this.firstRef(rtarget) : this.displayName(rtarget);
        const typeLabels = {
          stingy: `"${tname}'s been holding back. Keeping the good stuff close."`,
          untrustworthy: `"Can't trust ${tname}. Watch your back around them."`,
          generous: `"${tname}'s been generous. Sharing around, no questions asked."`,
          scheming: `"${tname}'s scheming. Planning something — I can see it."`,
          coward: `"${tname} froze when it mattered. Coward."`,
        };
        const g = this.spreadRumor(rtarget, type, vid);
        c.rumorDone = true; c.thread = null; c.rumorTarget = null; c.rumorTargets = null;
        // Sharing a secret is intimate: a little trust, and they remember.
        const t = this.state.village.trust || {};
        t[vid] = Math.min(100, (t[vid] || 10) + 2);
        this.remember(vid, 'you_told_rumor', `${type} about ${this.displayName(rtarget)}`);
        try { this.socialTick(vid); } catch (e) {}
        // Reaction in their temperament voice — not a canned pivot.
        const temp = this.npcTemper(vid);
        const reacts = {
          warm: [`"Oh no. Really? ...Thanks for trusting me with that."`],
          gentle: [`"...That's hard to hear. I'll keep it between us."`],
          prickly: [`"Huh. Noted. I'll be watching them."`],
          bold: [`"Interesting. I'll keep my eyes open."`],
          intense: [`"${tname}? Are you sure? ...Okay. Okay, noted."`],
          withdrawn: [`"...I won't say who told me."`],
          cautious: [`"...I didn't hear it from you. Got it."`],
          dry: [`"Juicy. Filed away."`],
          restless: [`"Huh — okay, that's worth knowing."`],
        };
        const pool = reacts[temp] || [`"Oh? ...I'll keep that in mind."`];
        done(g ? this.convoPick(vid, 'rumorreact:' + type, pool) : `"Hmm. No one's around to hear that yet."`,
          typeLabels[type] || `"Word about ${tname}."`);
      } else if (choiceId === 'theorize') {
        // Think TOGETHER. Topic order: the System (if it's here), the monsters,
        // the situation. Each NPC theorizes in their intelligence voice — and
        // sharp minds advance your understanding for real.
        const done_topics = c.theorized || [];
        const sysUp = !!this.state.systemArrived;
        const order = sysUp ? ['system', 'monsters', 'situation'] : ['monsters', 'situation'];
        const topic = order.find(x => done_topics.indexOf(x) === -1) || 'situation';
        if (done_topics.indexOf(topic) === -1) done_topics.push(topic);
        c.theorized = done_topics;
        c.thread = 'theorize'; c.depth = 1;
        const line = this.theorizeWith(vid, topic);
        // Thinking together is intimate — it deepens trust, like past/goal asks.
        const tt = this.state.village.trust || {};
        const tcur = tt[vid] || 10;
        if (tcur < 40) tt[vid] = Math.min(40, tcur + 2);
        done(line, '"What do you think is actually going on here?"');
      } else if (choiceId === 'agree') {
        // Reactive-aware: "You're right" IS an answer to a direct question.
        const rrA = c.reactiveQ && REACTIVE_DEFS[c.reactiveQ.id];
        if (rrA && rrA.reacts && rrA.reacts.agree) {
          c.reactiveQ = null; answeredReactive = true;
          if (rrA.thread) { c.thread = rrA.thread; c.depth = 1; }
          done(rrA.reacts.agree, '"You\'re right."');
        } else if (c.genericQ) {
          // Nodding along answers a direct question too — no strand.
          c.genericQ = null; answeredGeneric = true;
          done(this.convoPick(vid, 'gq:agree', GQ_ACK.gq_agree) || '"Yeah."', '"You\'re right."');
        } else {
          const m = cg.agreeReacts || {};
          // Acknowledgments are human filler — per-temperament pools (arrays
          // in data), never a loop.
          const rawA = m[temp] || m.default || '"Yeah."';
          const poolA = Array.isArray(rawA) ? rawA : [rawA];
          const l = this.convoPick(vid, 'agree:' + temp, poolA)
            || this.convoPickCycle(vid, 'agreefill', ['"Yeah."', '"Mm."', '"Right."', 'Nods along.']);
          // MOOD: being agreeable warms the room, a little, every time.
          mshift(1);
          done(l, '"You\'re right."');
        }
      } else if (choiceId === 'joke') {
        const rrJ = c.reactiveQ && REACTIVE_DEFS[c.reactiveQ.id];
        if (rrJ && rrJ.reacts && rrJ.reacts.joke) {
          c.reactiveQ = null; answeredReactive = true;
          if (rrJ.thread) { c.thread = rrJ.thread; c.depth = 1; }
          const vgJ = this.state.village;
          vgJ.cheer = Math.max(vgJ.cheer || 0, 1);
          done(rrJ.reacts.joke, '(crack a joke)');
        } else if (c.genericQ) {
          c.genericQ = null; answeredGeneric = true;
          const vgJ2 = this.state.village;
          vgJ2.cheer = Math.max(vgJ2.cheer || 0, 1);
          done(this.convoPick(vid, 'gq:joke', GQ_ACK.gq_joke) || 'A short laugh.', '(crack a joke)');
        } else {
        const m = cg.jokeReacts || {};
        const rkey = (mood === 'grieving' || mood === 'scared') ? mood : temp;
        const key = 'joke:' + rkey;
        const rawJ = m[rkey] || m.default || 'A short laugh.';
        const poolJ = Array.isArray(rawJ) ? rawJ : [rawJ];
        const l = this.convoPick(vid, key, poolJ)
          || this.convoPickCycle(vid, 'jokefill', ['A short laugh.', 'Snorts.', 'Grins.']);
        // MOOD: jokes warm — unless they're grieving or scared, in which
        // case it lands badly. Read the room.
        mshift((mood === 'grieving' || mood === 'scared') ? -1 : 1);
        done(l, '(crack a joke)');
        const vg = this.state.village;
        vg.cheer = Math.max(vg.cheer || 0, 1);
        }
      } else if (choiceId === 'silence') {
        const rrS = c.reactiveQ && REACTIVE_DEFS[c.reactiveQ.id];
        if (rrS && rrS.reacts && rrS.reacts.silence) {
          c.reactiveQ = null; answeredReactive = true;
          if (rrS.thread) { c.thread = rrS.thread; c.depth = 1; }
          done(rrS.reacts.silence, '(say nothing)');
        } else if (c.genericQ) {
          c.genericQ = null; answeredGeneric = true;
          done(this.convoPick(vid, 'gq:silence', GQ_ACK.gq_silence) || '...', '(say nothing)');
        } else {
        // MOOD: silence means different things at different temperatures —
        // comfortable when warm, pointed when cold. (convo-mood.js)
        const ms = typeof this.convoMoodSilence === 'function'
          ? this.convoMoodSilence(vid) : { line: '"..."', shift: 0 };
        mshift(ms.shift);
        done(ms.line, '(say nothing)');
        }
      } else if (choiceId === 'subject') {
        // Change the subject — to a topic you haven't covered yet.
        const asked = c.askedTopics || [];
        const opts = [];
        if (!this.goalKnown(vid) && asked.indexOf('goal') === -1) opts.push('goal');
        if (asked.indexOf('past') === -1) opts.push('past');
        if (asked.indexOf('village') === -1) opts.push('village');
        if (asked.indexOf('plans') === -1) opts.push('plans');
        // TOPIC PACK (Steve 2026-10-06): generated topics are subject-change
        // options too (gated — no 'loved' at trust 10).
        if (this.topic2SubjectOpts) for (const t of this.topic2SubjectOpts(vid)) opts.push(t);
        if (!opts.length) {
          done(this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I think we\'ve covered everything."']), '"Actually — different subject."');
        } else {
          const nt = opts[Math.floor(Math.random() * opts.length)];
          // TOPIC PACK: generated topics carry their own labels.
          const ntLabel = this.topic2AskLabel ? this.topic2AskLabel(vid, nt) : this.convoLabel(vid, nt);
          done(this.convoAskTopic(vid, nt), '"Actually — different subject." ' + ntLabel);
        }
      } else if (choiceId.indexOf('nv:') === 0) {
        const kind = choiceId.slice(3);
        const outs = {
          nod: ['They nod back, slowly. Some understanding passes between you.',
                'They nod. A small, careful acknowledgment.',
                'Nod returned. The ice thins a fraction.'],
          smile: ['They smile — surprised, then genuine.',
                  'A grin breaks through, quick and warm.',
                  'They smile back. It reaches their eyes this time.'],
          pointself: ['You point at yourself, then at them, then at the fire. Together. They get it.',
                      'You draw a circle in the dirt around both your feet. They laugh, surprised.',
                      'You tap your chest, then theirs. Us. They nod, emphatic.'],
        };
        const t = this.state.village.trust || {};
        t[vid] = Math.min(40, (t[vid] || 10) + 1);
        done(this.convoPickCycle(vid, 'nv:' + kind, outs[kind] || ['You gesture.']), '(gesture)');
      } else {
        done('"..."', null);
      }

      // GENERIC-Q DETECTION: their response just asked something direct with
      // no bespoke def — hang it as an answerable question (Rule 4), and
      // note when the green world comes up (Rule 2: topical teaching).
      // Skipped when a formal/reactive question is already live, or the
      // player just answered the generic one.
      // RUMOR PROMPTS are menu prompts, not real questions: "who are we
      // talking about?" must surface the target choices, not generic-Q
      // answers. Without this the generic-Q narrowing re-dangles the rumor
      // thread the 2026-10-06 fix had just un-dangled. (socialite playtest
      // 2026-10-06)
      const rumorPrompt = c.thread === 'spread_rumor' && !c.rumorDone;
      if (line) this.convoNoteFlora(vid, line);
      if (line && !answeredGeneric && !answeredReactive && !extraQ && !rumorPrompt) this.convoGenericQ(vid, line);

      if (youSaid) c.transcript.push({ who: 'you', text: youSaid });
      c.transcript.push({ who: 'them', text: line });
      while (c.transcript.length > 200) c.transcript.shift(); // HISTORY (Steve 2026-10-05): was 8 — destroyed conversation history and desynced the tap-advance. 200 keeps the whole conversation; memory is trivial.
      c.exchanges++;
      this.sayLine(vid, line);
      // ONE-BEAT TURNS (Steve 2026-10-05): everything after the line queues.
      // MOOD: a band-crossing or guard/grace beat queues behind the line —
      // the continuer reveals their reaction settling in. (convo-mood.js
      // queues into c.heldBeats; never lands mid-turn.)
      try { this.convoMoodFlush(vid); } catch (e) {}

      // extraQ: "Of course. Ask." is the turn's beat; the real question
      // queues behind it — asked is asked only when it's actually asked.
      if (extraQ) {
        c.heldBeats.push({ text: extraQ.q, ask: extraQ });
        c.heldAsk = true;
      }
      // extraLine: the follow-up beat after an answer queues — the thought
      // continues on the continuer, or goes unspoken if the player moves on.
      if (extraLine) {
        c.heldBeats.push({ text: extraLine });
      }

      // DEEP BEATS cost a tick: topic asks, "tell me more", theorizing,
      // trading, teaching, promises, invites, answering personal questions.
      // Small talk (agree, joke, silence, subject-change) is free — you're
      // already here. Graduated cost keeps long conversations affordable.
      if (/^(ask:|more|theorize|trade_yes|teach|offer_help|invite_party|ans:)/.test(choiceId || '')) {
        this.convoDeepTick(vid);
      }

      // THEY ask YOU things. Conversations go both ways — but they follow
      // the player's lead. A question never stomps a live thread: if the
      // player drove the conversation this turn (ask:/more/theorize/...),
      // the NPC stays with the thread. Questions arrive after small talk,
      // breaths, and thread exhaustion — never as an interrogation pile-on.
      // Never in nonverbal: someone you share no words with does not
      // suddenly ask "Where are you from?" in fluent English. (Leak fix.)
      //
      // COHERENCE: an unanswered direct question LINGERS. If the player
      // dodged it, the NPC follows up once before letting it lapse — the
      // thread is never silently dropped for a random new topic. And a
      // genuinely new question mid-thread gets a narrative bridge, not a
      // hard pivot.
      //
      // PACING: at most 2 questions per conversation, never on the turn
      // right after an answer (let the react breathe), and the first-
      // conversation question waits until the second exchange — the opener
      // and the player's first move set the tone, not an interrogation.
      const droveThread = /^(ask:|more|theorize|react:|trade|teach|offer_help|invite_party)/.test(choiceId || '');
      const justAnswered = /^(ans:)/.test(choiceId || '');
      const forceQ = c.count === 1 && (c.qCount || 0) === 0 && c.exchanges >= 2 && !droveThread && !justAnswered;
      // ONE-BEAT TURNS (Steve 2026-10-05): follow-ups, lapses, and new
      // questions queue behind the turn's line — the continuer reveals them.
      // heldAsk guards against queueing a second question behind one already
      // queued ("Of course. Ask." case above).
      if (c.thread !== 'nonverbal' && !c.pendingQ && !c.heldAsk && c.exchanges >= 1 && !answeredReactive) {
        const rqf = c.reactiveQ && REACTIVE_DEFS[c.reactiveQ.id];
        const gqf = c.genericQ && !answeredGeneric ? c.genericQ : null;
        if (rqf) {
          if (!c.reactiveQ.followedUp) {
            // State marks at queue time (as before); only the showing waits
            // for the continuer.
            c.reactiveQ.followedUp = true;
            c.heldBeats.push({ text: rqf.followUp });
          } else {
            if (rqf.lapse) c.heldBeats.push({ text: rqf.lapse });
            c.reactiveQ = null;
          }
        } else if (gqf) {
          // GENERIC-Q LINGERS: a dodged direct question gets one follow-up,
          // then lapses honestly — the thread is never silently dropped
          // for a random new topic (Rule 3).
          if (!gqf.followedUp) {
            const fup = GQ_FOLLOWUP + ' ' + gqf.q;
            gqf.followedUp = true;
            c.heldBeats.push({ text: fup });
          } else {
            c.heldBeats.push({ text: GQ_LAPSE });
            c.genericQ = null;
          }
        } else if (!droveThread && !justAnswered && !c.windingDown && (forceQ || ((c.qCount || 0) < 2 && Math.random() < 0.3))) {
          const trust = (this.state.village.trust || {})[vid] || 10;
          const moodNow = this.npcMood(vid);
          const cands = (cg.questions || []).filter(q =>
            c.askedQs.indexOf(q.id) === -1 && trust >= (q.minTrust || 0) &&
            (!q.when || q.when === moodNow));
          if (cands.length) {
            const qd = cands[Math.floor(Math.random() * cands.length)];
            // BRIDGE: pivoting off a live thread without a breath reads as
            // a non sequitur (the tree-line -> hope-question cut). Name the
            // pivot so the conversation keeps its shape.
            const liveThreads = ['goal', 'past', 'plans', 'village', 'theorize', 'trade',
              'spooked', 'request', 'recall', 'grief', 'cheer', 'small'];
            if (liveThreads.indexOf(c.thread) !== -1) {
              const bridge = this.convoPickCycle(vid, 'qbridge', [
                'A beat. Then, as if shaking something off:',
                'They let that thread drop — for now.',
                'A pause. When they speak again, it\'s about something else entirely.',
                'They glance away, then back. Different subject, same worry:',
              ]);
              c.heldBeats.push({ text: bridge });
            }
            // Asked is asked — but only when it's actually asked: pendingQ,
            // qCount, and askedQs land when the continuer reveals the
            // question, never before the player has seen it.
            c.heldBeats.push({ text: qd.q, ask: qd });
            c.heldAsk = true;
            // The answer and their question stay SEPARATE transcript entries —
            // never mashed into one line. Reading back feels like dialogue.
          }
        }
      }

      // WIND-DOWN (Steve 2026-10-05, one-beat turns): the goodbye beat queues
      // like any other follow-on — the continuer reveals it, and only then
      // does the conversation start ending. It can't be dodged: other held
      // beats die on a new choice, the wind-down stays queued. heldAsk
      // guards: a queued question gets asked before the goodbye.
      // The player can still say goodbye themselves, take one more beat of
      // a live thread, or just leave. Never a silent chop.
      if (!c.pendingQ && !c.heldAsk && c.exchanges >= c.budget) {
        if (!c.windingDown && !c.winddownQueued) {
          c.winddownQueued = true;
          let wdPool = (cg.winddowns || {})[temp] || (cg.winddowns || {}).default
            || ['"Anyway — I should get back to it."'];
          // RELATIONSHIP AGE (Steve 2026-10-06): old friends don't wind down
          // formally. Close tier gets a brief, warm "I should..." — the
          // conversation tapers like it does between people who'll talk
          // again tomorrow.
          try {
            if (this.convoVoiceTier && this.convoVoiceTier(vid) === 'close' && Math.random() < 0.5) {
              wdPool = ['"Alright — I should get back to it."', '"I should go. You know where to find me."',
                        '"Okay. We\'ll pick this up later."'];
            }
          } catch (e) {}
          const wd = this.convoPickCycle(vid, 'winddown', wdPool);
          c.heldBeats.push({ text: wd, winddown: true });
        } else if (c.windingDown) {
          return this.endConvo(vid, 'natural');
        }
      }
      return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
    },

    endConvo(vid, how) {
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      const first = this.displayName(vid);
      c.active = false; c.over = true; c.thread = null; c.pendingQ = null;
      c.reactiveQ = null;
      c.heldBeats = []; c.heldAsk = false; c.winddownQueued = false; c.windingDown = false;
      let line;
      if (how === 'left') {
        line = this.convoPickCycle(vid, 'leftexit', [
          '"Oh — okay. Later, then."',
          '"Sure. I\'ll be around."',
          '"Right. Go on, then."',
        ]);
      } else {
        const exits = cg.exits || {};
        const key = (mood === 'grieving' || mood === 'scared') ? mood : temp;
        let pool = exits[key] || exits.steady || ['"I should go."'];
        // RELATIONSHIP AGE (Steve 2026-10-06): old friends don't make
        // speeches. Close tier sometimes gets short, warm shorthand —
        // "Later." lands harder than a paragraph when you've talked a
        // hundred times. 50/50 keeps it human: sometimes brief, sometimes
        // the full temperament line. Grieving/scared always get the real
        // goodbye — shorthand would read as cold.
        try {
          if (this.convoVoiceTier && this.convoVoiceTier(vid) === 'close' &&
              mood !== 'grieving' && mood !== 'scared' && Math.random() < 0.5) {
            pool = ['"Later."', '"Good talk."', '"Don\'t be a stranger."',
                    '"See you at the fire."', '"Take care of yourself."'];
          }
        } catch (e) {}
        line = this.convoPickCycle(vid, 'exit', pool);
      }
      c.transcript.push({ who: 'them', text: line });
      while (c.transcript.length > 200) c.transcript.shift(); // HISTORY (Steve 2026-10-05): was 8 — destroyed conversation history and desynced the tap-advance. 200 keeps the whole conversation; memory is trivial.
      // WORDS ONLY GO SO FAR: talk caps at 40. Beyond that, do something real.
      const t = this.state.village.trust || (this.state.village.trust = {});
      const cur = t[vid] || 10;
      t[vid] = cur >= 40 ? cur : Math.min(40, cur + 3);
      // MOOD LINGERS (convo-mood.js): how the conversation felt sticks to
      // the relationship — ending warm earns a little trust, ending tense
      // costs a little. Small, but felt over many conversations.
      const cm = Math.max(-3, Math.min(3, c.mood || 0));
      if (cm !== 0) t[vid] = Math.max(0, Math.min(100, (t[vid] || 10) + cm));
      try { this.observe('talk', { noTrust: true }); } catch (e) {}
      try { this.checkPromises('social'); } catch (e) {}
      this.convoConflictFallout(vid, t[vid]);
      this.say(`${first}: ${line}`);
      // MOOD GOODBYE: the parting beat carries the temperature out the door.
      try {
        const mgb = this.convoMoodGoodbye(vid);
        if (mgb) {
          c.transcript.push({ who: 'them', text: mgb });
          while (c.transcript.length > 200) c.transcript.shift();
          this.say(`${first}: ${mgb}`);
        }
      } catch (e) {}
      return { line, choices: [], ended: true, transcript: c.transcript.slice() };
    },

    convoConflictFallout(vid, newTrust) {
      // OLD WOUNDS: favoritism is noticed. If you're close to one side of a
      // conflict, the other side keeps score — even if you don't know there's
      // a score being kept.
      for (const cf of (this.state.village.conflicts || [])) {
        if (cf.resolved || (cf.a !== vid && cf.b !== vid)) continue;
        if (newTrust >= 50) {
          const other = cf.a === vid ? cf.b : cf.a;
          const ot = this.state.village.trust;
          ot[other] = Math.max(0, (ot[other] || 10) - 2);
          if (cf.known) this.say(`${this.displayName(other)} saw how close you've gotten to ${this.displayName(vid)}. Old history has long eyes. (-2 trust)`);
          else this.say(`${this.displayName(other)} has been colder to you lately. You don't know why.`);
        }
        // HISTORY UNFOLDS through trust — slowly, partially, maybe never fully.
        if (cf.known && cf.kind === 'old_wound') {
          const t = (this.state.village.trust || {})[vid] || 0;
          if (cf.stage === 0 && t >= 45) {
            cf.stage = 1;
            this.say(`Late, quiet, ${this.displayName(vid)} tells you: "${cf.history[1]}"`);
          } else if (cf.stage === 1 && t >= 70) {
            cf.stage = 2;
            this.say(`${this.displayName(vid)} looks away. "${cf.history[2]}" That's all you get. Maybe that's all there is.`);
          }
        }
      }
    },

    convoUI(vid) {
      // What the person card needs to render the conversation.
      const c = this.convoGet(vid);
      if (!c.active) return { active: false, transcript: c.transcript.slice(), choices: [], over: c.over };
      const them = c.transcript.filter(t => t.who === 'them');
      return {
        active: true, transcript: c.transcript.slice(),
        choices: this.convoChoices(vid), over: false,
        line: them.length ? them[them.length - 1].text : null,
      };
    },

  };

  Object.assign(Game, methods);
})();

// ============ REAL FOREIGN LANGUAGES ============
// No shared language means NO shared language. NPCs speak their actual
// tongue — real Italian, real Mandarin, real Spanish. Not gibberish, not
// "[speaks Italian]". You see the words. You don't understand them.
// That's the point. Over time, exposure teaches you: first a word,
// then the shape of sentences, then — earned, never given — you get by.
// Interpreters (bilingual NPCs) bridge the gap humanly. And post-System,
// friction inspires augmentation: the System offers a Translator. It works.
// It's in your head. The translations are... cheerful. Slightly off.
// Tone sold separately.
//
// Self-attaching module: appended to conversation.js, loads before
// journal.js/party.js/truth.js. Overrides startConvo's nonverbal branch,
// the nv: turn handlers, and the nonverbal choices via method replacement.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const methods = {

    // langDef: icon + name for a language id.
    langDef(id) {
      const d = ((this.data.characterGen || {}).languages || []).find(l => l.id === id);
      return d ? { icon: d.icon || '', name: d.name || id } : { icon: '', name: id || 'an unknown tongue' };
    },

    npcNativeLang(vid) {
      const nl = this.npcLangs(vid);
      return (nl && nl.native) || 'english';
    },

    npcEnglishLevel(vid) {
      return (this.levelsOf(this.npcLangs(vid)).english) || 0;
    },

    // foreignLine: one real phrase in their tongue. No-repeat per villager
    // (tracked by object identity — pools are stable data references).
    foreignLine(vid, kind, sub) {
      const lang = this.npcNativeLang(vid);
      const fd = (this.data.foreignSpeech || {})[lang];
      if (!fd) return null;
      const pool = sub ? ((fd[kind] || {})[sub] || []) : (fd[kind] || []);
      if (!pool.length) return null;
      const p = this.convoPickCycle(vid, 'fl:' + lang + ':' + kind + (sub ? ':' + sub : ''), pool);
      return p ? Object.assign({ lang }, p) : null;
    },

    // translatorActive: the System in your head, translating live.
    translatorActive() {
      return !!this.state.systemArrived && this.hasAbility('translator');
    },

    // langExposure: words of this tongue you've absorbed. 0..25+.
    langExposure(lang) {
      const e = (this.state.scholar || {}).langExposure || {};
      return e[lang] || 0;
    },

    // langExposureGain: listening teaches. Thresholds: 3 (words), 10 (shape
    // of sentences), 25 (you get by — level 1, earned). The translator
    // short-circuits learning: the System does it for you, your brain
    // never bothers. That's the tradeoff.
    langExposureGain(vid, lang, n) {
      const s = this.state.scholar || {};
      if (this.translatorActive()) {
        const f = s._translatorNote || (s._translatorNote = {});
        if (!f[lang]) {
          f[lang] = true;
          this.say('The translator hums behind your eyes. Your brain doesn\'t bother learning — why would it?');
        }
        return this.langExposure(lang);
      }
      s.langExposure = s.langExposure || {};
      const before = s.langExposure[lang] || 0;
      const after = before + (n || 1);
      s.langExposure[lang] = after;
      const def = this.langDef(lang);
      if (before < 3 && after >= 3) {
        this.say(`💡 You're starting to catch words in ${def.name}. Not sentences — words.`);
        try { this.journalLearn(vid, 'note', { text: `picking up ${def.name}, a word at a time` }, { quiet: true }); } catch (e) {}
      } else if (before < 10 && after >= 10) {
        this.say(`💡 ${def.name} is starting to make sense. You catch the shape of sentences now.`);
        try { this.journalLearn(vid, 'note', { text: `${def.name}: catching whole phrases now` }, { quiet: true }); } catch (e) {}
      } else if (before < 25 && after >= 25) {
        s.languages = s.languages || {};
        s.languages[lang] = 1;
        this.say(`💡 You can get by in ${def.name} now. A few dozen words — all earned the hard way. Gestures. Patience. Embarrassment.`);
        try { this.journalLearn(vid, 'note', { text: `can get by in ${def.name} now — learned it live` }, {}); } catch (e) {}
        try { this.discover('language'); } catch (e) {}
      }
      return after;
    },

    // langExposureReport: for the journal's LANGUAGES section.
    // "Italian: 12 words — catching phrases."
    langExposureReport() {
      const e = (this.state.scholar || {}).langExposure || {};
      const out = [];
      for (const [id, n] of Object.entries(e)) {
        if (!n) continue;
        const def = this.langDef(id);
        const lvl = ((this.state.scholar || {}).languages || {})[id] || 0;
        const stage = lvl >= 1 ? 'can get by' : n >= 10 ? 'catching phrases' : n >= 3 ? 'catching words' : 'heard a few times';
        out.push({ id, icon: def.icon, name: def.name, n, stage, fluent: lvl >= 1 });
      }
      return out.sort((a, b) => b.n - a.n);
    },

    // renderForeign: what the player SEES. Never auto-translated.
    // Understanding is earned (exposure), borrowed (interpreter), or
    // System-mediated (translator — cheerful, slightly wrong).
    // Returns { text, foreign } for transcript entries.
    renderForeign(vid, phrase) {
      if (!phrase) return null;
      const lang = phrase.lang;
      const c = this.convoGet(vid);
      const t = phrase.t;
      // TRANSLATOR: the System in your head, always on, inescapable. It takes
      // priority even over a human interpreter — which is exactly what's
      // unsettling about it. Works. Slightly off. Cheerful. Misses tone entirely.
      if (this.translatorActive()) {
        let en = phrase.en;
        if (Math.random() < 0.3) {
          const quips = [
            ' (Family units: IMPORTANT! The audience loves family!)',
            ' (Emotional content: HIGH! Great for ratings!)',
            ' (We think they mean it! Probably!)',
            ' (Such passion! The gamblers are taking notes!)',
          ];
          en += quips[Math.floor(Math.random() * quips.length)];
        }
        return { text: `«${t}» → "${en}"`, foreign: lang };
      }
      // INTERPRETER: a bilingual friend translates, humanly. The pre-System
      // way — and the only way that carries tone, warmth, and trust.
      if (c.interpreter) {
        const iname = this.firstRef(c.interpreter);
        return { text: `«${t}» — ${iname} translates: "${phrase.en}"`, foreign: lang };
      }
      const exp = this.langExposure(lang);
      const def = this.langDef(lang);
      if (exp >= 10) return { text: `«${t}» (${phrase.en} — you're fairly sure)`, foreign: lang };
      if (exp >= 3) {
        const kws = Object.entries(phrase.kw || {}).slice(0, 2);
        if (kws.length) {
          const gloss = kws.map(([k, v]) => `'${k}' — ${v}`).join(', ');
          return { text: `«${t}» (you catch ${gloss})`, foreign: lang };
        }
      }
      return { text: `«${t}»`, foreign: lang };
    },

    // maybeEnglishFragment: the Mario moment. Zero-English speakers sometimes
    // know a handful of English words — crude, proud, characterful.
    // "Sometimes you get Mario from Italy and all he can say is 'fuck you'."
    maybeEnglishFragment(vid) {
      if (this.npcEnglishLevel(vid) !== 0) return null;
      const c = this.convoGet(vid);
      if (c._fragUsed) return null;
      const fd = (this.data.foreignSpeech || {})[this.npcNativeLang(vid)];
      const pool = (fd && fd.fewWords) || [];
      if (!pool.length || Math.random() > 0.35) return null;
      c._fragUsed = true;
      return pool[Math.floor(Math.random() * pool.length)];
    },

    // findInterpreter: someone nearby who speaks their tongue AND one of yours.
    // Bilinguals are worth their weight in food.
    findInterpreter(vid, targetLang) {
      let here = [];
      try { here = this.npcsOnNode() || []; } catch (e) {}
      const trust = (this.state.village.trust || {});
      for (const oid of here) {
        if (oid === vid) continue;
        const ol = this.levelsOf(this.npcLangs(oid));
        if ((ol[targetLang] || 0) < 1) continue;
        let comm = null;
        try { comm = this.commLevel(oid); } catch (e) {}
        if (!comm || comm.level === 'none') continue;
        if ((trust[oid] || 10) < 10) continue;
        return oid;
      }
      return null;
    },

    // nvOpen: the rewritten no-shared-language opening. The barrier is
    // stated plainly — language named, incomprehension total. Then THEY
    // speak: real words in a real tongue. No English. Not even a little.
    nvOpen(vid) {
      const v = this.state.village;
      const c = this.convoGet(vid);
      const lang = this.npcNativeLang(vid);
      const def = this.langDef(lang);
      c.thread = 'nonverbal'; c.wasNonverbal = true; c.nativeLang = lang;
      c.interpreter = null; c._fragUsed = false;
      // Consume any pending "can we talk" — they approached, but in their tongue.
      const treq = (v.talkRequests || {})[vid];
      if (treq) treq.delivered = true;
      // FRICTION TRACKING: the System notices what you struggle with.
      if (this.state.scholar.week1) this.state.scholar.week1.langStruggle = (this.state.scholar.week1.langStruggle || 0) + 1;
      // THE BARRIER, COMMUNICATED — in the conversation itself, not just the
      // log. Steve's bug was that the barrier was never stated and then the
      // NPC "just started talking". Now the opening line states it plainly,
      // and THEN they speak: real words in a real tongue. No English. Not even a little.
      const first = this.displayName(vid);
      const barrier = `${first} speaks only ${def.icon} ${def.name}. No shared words at all — just eyes, hands, and patience.`;
      this.say(barrier);
      const ph = this.foreignLine(vid, 'openers');
      const r = this.renderForeign(vid, ph);
      let spoken = r ? r.text : 'They speak. You understand none of it.';
      const frag = this.maybeEnglishFragment(vid);
      if (frag) spoken += ` "${frag}" — they grin, proud of the one English they know.`;
      // Transcript: your realization (narration), then their real speech.
      c.transcript.push({ who: 'you', text: `(${barrier})` });
      c.transcript.push({ who: 'them', text: spoken, foreign: lang });
      // The returned opening line carries BOTH — the first thing the player
      // reads states the barrier plainly, then the foreign speech lands.
      const line = `${barrier}\n${spoken}`;
      this.langExposureGain(vid, lang, 1);
      return { line, choices: this.convoChoices(vid), transcript: c.transcript.slice(), ended: false };
    },

    // nvRespond: every gesture gets a real answer — in their tongue.
    // Listening is the fastest way to learn. Interpreters bridge humanly.
    nvRespond(vid, kind) {
      const c = this.convoGet(vid);
      const lang = c.nativeLang || this.npcNativeLang(vid);
      const t = this.state.village.trust || {};
      if (kind === 'listen') {
        const ph = this.foreignLine(vid, 'questions') || this.foreignLine(vid, 'openers');
        this.langExposureGain(vid, lang, 3);
        const r = this.renderForeign(vid, ph);
        return `You listen hard, watching their mouth shape the words. ${r ? r.text : 'Sounds, and the shape of meaning just out of reach.'}`;
      }
      if (kind === 'translate') {
        const yid = c.interpreter;
        if (!yid) return 'No one here can bridge the gap. Gestures will have to do.';
        const ph = this.foreignLine(vid, 'questions') || this.foreignLine(vid, 'openers');
        const r = this.renderForeign(vid, ph);
        const yt = this.state.village.trust || {};
        yt[yid] = Math.min(100, (yt[yid] || 10) + 2);
        return r ? r.text : 'They speak; the translation falters.';
      }
      const reactKind = { nod: 'agree', smile: 'warm', pointself: 'warm' }[kind] || 'agree';
      const ph = this.foreignLine(vid, reactKind);
      this.langExposureGain(vid, lang, 1);
      t[vid] = Math.min(40, (t[vid] || 10) + 1);
      const r = this.renderForeign(vid, ph);
      const narr = {
        nod: 'They nod back, slowly.',
        smile: 'A grin breaks through, quick and warm.',
        pointself: 'You tap your chest, then theirs. Us. They nod, emphatic.',
      }[kind] || 'You gesture.';
      const frag = this.maybeEnglishFragment(vid);
      return `${r ? r.text : 'They answer at length.'} ${narr}${frag ? ` "${frag}"` : ''}`;
    },

    // nvEndLine: gesture exits. No fluent English goodbyes from someone
    // you share no words with. (Steve's leak, fixed.)
    nvEndLine(vid) {
      return this.convoPickCycle(vid, 'nvexit', [
        'They press their palms together — thanks, or goodbye, or both. Then turn back to their own thoughts.',
        'A final nod. They touch their chest, then point at you — a promise without words.',
        'They wave you off gently, already turning away. The conversation ends where language couldn\'t reach.',
      ]);
    },
  };

  Object.assign(Game, methods);

  // ---- Overrides: fix the leaks, rewire the nonverbal path ----
  // These run at load (conversation.js loads before truth.js), wrapping the
  // base methods defined above in this same file.

  // 1. startConvo: route 'none' through nvOpen.
  const _startConvo = Game.startConvo;
  Game.startConvo = function (vid) {
    const c = this.convoGet(vid);
    // reset nonverbal state every conversation
    c.wasNonverbal = false; c.nativeLang = null; c.interpreter = null;
    const st = _startConvo.call(this, vid);
    // _startConvo already handled the 'none' branch inline; if it took the
    // OLD path (shouldn't happen after our edit below), leave it.
    return st;
  };

  // 2. convoChoices: nonverbal gets gestures + listen + interpreter.
  // NOTE: the base convoChoices (defined earlier in this file) is replaced
  // here rather than wrapped, because we need the nonverbal branch changed.
  // We capture the base first.
  const _convoChoices = Game.convoChoices;
  Game.convoChoices = function (vid) {
    const c = this.convoGet(vid);
    if (c.thread === 'nonverbal') {
      const out = [
        { id: 'nv:nod', label: '(nod slowly)' },
        { id: 'nv:smile', label: '(smile)' },
        { id: 'nv:pointself', label: '(point: you, them, together)' },
        { id: 'nv:listen', label: '(listen hard — catch words)' },
      ];
      const lang = c.nativeLang || this.npcNativeLang(vid);
      const yid = this.findInterpreter(vid, lang);
      c.interpreter = yid || null;
      if (yid) {
        const yn = this.firstRef(yid);
        out.push({ id: 'nv:translate', label: `(ask ${yn} to translate)` });
      }
      out.push({ id: 'leave', label: '(walk away)' });
      // ONE-BEAT TURNS (Steve 2026-10-05): queued beats surface as a
      // gestural continuer, first.
      if ((c.heldBeats || []).length) out.unshift({ id: 'goon', label: this.convoGoonLabel(vid) });
      return out;
    }
    return _convoChoices.call(this, vid);
  };

  // 3. convoTurn: nv: kinds route through nvRespond (real foreign answers).
  const _convoTurn = Game.convoTurn;
  Game.convoTurn = function (vid, choiceId) {
    if (typeof choiceId === 'string' && choiceId.indexOf('nv:') === 0) {
      const c = this.convoGet(vid);
      if (!c.active) return null;
      if (choiceId === 'leave') return this.endConvo(vid, 'left');
      const kind = choiceId.slice(3);
      const line = this.nvRespond(vid, kind);
      c.transcript.push({ who: 'you', text: '(gesture)' });
      c.transcript.push({ who: 'them', text: line, foreign: c.nativeLang || this.npcNativeLang(vid) });
      while (c.transcript.length > 200) c.transcript.shift(); // HISTORY (Steve 2026-10-05): was 8 — destroyed conversation history and desynced the tap-advance. 200 keeps the whole conversation; memory is trivial.
      c.exchanges++;
      this.say(`${this.displayName(vid)}: ${line}`);
      // No they-ask-you in nonverbal. Ever. (The leak Steve reported.)
      // Wind-down, not a chop: the budget landing gets a gesture beat first,
      // same as the verbal path. ONE-BEAT TURNS (Steve 2026-10-05): queued —
      // the gestural continuer reveals it.
      if (!c.pendingQ && c.exchanges >= c.budget) {
        if (!c.windingDown && !c.winddownQueued) {
          c.winddownQueued = true;
          const wd = this.convoPickCycle(vid, 'nvwinddown', [
            'Their gestures slow — the conversation thinning like light at dusk.',
            'They glance toward their own thoughts; the exchange is winding down.',
            'A final shared look — you both feel the talk running its course.',
          ]);
          c.heldBeats.push({ text: wd, winddown: true, foreign: c.nativeLang || this.npcNativeLang(vid) });
        } else if (c.windingDown) {
          return this.endConvo(vid, 'natural');
        }
      }
      return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
    }
    return _convoTurn.call(this, vid, choiceId);
  };

  // 4. endConvo: gesture exits for nonverbal conversations.
  // wasNonverbal is deliberately NOT cleared here (startConvo clears it):
  // a redundant endConvo on an already-over nonverbal chat still exits
  // with a gesture, never a sudden English "I should go."
  const _endConvo = Game.endConvo;
  Game.endConvo = function (vid, how) {
    const c = this.convoGet(vid);
    const wasNV = c.wasNonverbal || c.thread === 'nonverbal';
    const r = _endConvo.call(this, vid, how);
    if (wasNV && r) {
      const line = this.nvEndLine(vid);
      const tr = (r.transcript || []).slice();
      if (tr.length) tr[tr.length - 1] = { who: 'them', text: line, foreign: c.nativeLang || undefined };
      r.line = line;
      r.transcript = tr;
    }
    return r;
  };
})();
