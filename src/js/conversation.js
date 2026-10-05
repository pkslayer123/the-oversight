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
      match: 'How are you holding up? Honestly.',
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

  const methods = {

    talkTo(vid) {
      // Now opens a real conversation. Kept for compatibility — returns the opening line.
      const st = this.startConvo(vid);
      return st ? st.line : null;
    },

    vpOf(vid) {
      return (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
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

    convoGet(vid) {
      const v = this.state.village;
      v.conv = v.conv || {};
      if (!v.conv[vid]) v.conv[vid] = {
        active: false, exchanges: 0, budget: 4, thread: null, depth: 0,
        said: {}, transcript: [], pendingQ: null, askedQs: [],
        answered: {}, recalled: {}, lastDay: -1, count: 0, over: false,
        offeredHelp: false, askedTopics: [], qCount: 0,
        theorized: [],
      };
      return v.conv[vid];
    },

    // convoMatchReactive: does this NPC line ask the player something direct?
    // Returns { id, ...def } or null. Matched lines get contextual answers;
    // unmatched lines flow through the normal choice builder.
    convoMatchReactive(line) {
      if (!line || typeof line !== 'string') return null;
      for (const id of Object.keys(REACTIVE_DEFS)) {
        const def = REACTIVE_DEFS[id];
        if (line.indexOf(def.match) !== -1) return Object.assign({ id }, def);
      }
      return null;
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
      return Math.max(3, Math.min(6, b));
    },

    // convoHesitationMs: people don't respond instantly. A brief,
    // personality-shaped pause before their line lands — impulsive people
    // fire back, thoughtful people take their time. Deep or emotional beats
    // get a longer pause. Feels human, never laggy (200–950ms).
    convoHesitationMs(vid, choiceId, isOpening) {
      let ms = isOpening ? 320 : 400;
      const temp = (this.npcTemper && this.npcTemper(vid)) || '';
      if (temp === 'bold' || temp === 'intense' || temp === 'restless') ms -= 150;
      else if (temp === 'cautious' || temp === 'withdrawn' || temp === 'steady') ms += 230;
      else if (temp === 'warm' || temp === 'gentle') ms += 90;
      // 'dry' and 'prickly' answer at their own pace — no modifier.
      const deep = choiceId && /^(ask:|more|theorize|confront|trade|teach|offer_help|invite_party|ans:)/.test(choiceId);
      if (deep) ms += 260;
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

      // 1. THEY asked to talk — their reason leads, once.
      const treq = (v.talkRequests || {})[vid];
      if (treq && !treq.delivered) {
        treq.delivered = true;
        return { line: String(treq.line).replace(/ \(Talk to .*?\.\)$/, ''), thread: 'request' };
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
        if (l) return { line: l, thread: 'grief' };
      }
      if ((v.cheer || 0) > 0 && Math.random() < 0.5) {
        const l = this.convoPick(vid, 'cheer', [
          '"Good day, huh? Almost feels normal."',
          '"People are smiling. I forgot what that looked like."',
        ]);
        if (l) return { line: l, thread: 'cheer' };
      }
      // 4. What they want — if they trust you enough to say it.
      const shareAt = temp === 'withdrawn' ? 60 : temp === 'prickly' ? 50
        : (temp === 'warm' || temp === 'gentle') ? 25 : 35;
      if (goalDef && trust >= shareAt) {
        const l = this.convoPick(vid, 'goal', goalDef.lines || []);
        if (l) return { line: this.fillTalkLine(l, vp), thread: 'goal' };
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
      const l = this.convoPick(vid, 'small', pool);
      if (l) return { line: this.fillTalkLine(l, vp), thread: 'small' };
      // Reopeners: the small-talk well is dry, but you've talked before —
      // a familiar line beats a loop. (Previously dead data; now wired in.)
      if ((c.count || 0) > 1) {
        const rl = this.convoPick(vid, 'small', cg.reopeners || []);
        if (rl) return { line: this.fillTalkLine(rl, vp), thread: 'small' };
      }
      // 6. Truly nothing new — said like a person, not a loop.
      const ex = this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know."']);
      return { line: ex || '"Good to just be around people."', thread: 'small' };
    },

    convoThreadHasMore(vid) {
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const t = c.thread;
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
      if (topic === 'goal') {
        const goal = this.npcGoal(vid);
        const goalDef = (this.data.characterGen.goals || []).find(g => g.id === goal);
        const l = this.convoPick(vid, 'goal', (goalDef && goalDef.lines) || []);
        this.state.village.goalsKnown = this.state.village.goalsKnown || {};
        this.state.village.goalsKnown[vid] = goal;
        this.remember(vid, 'shared_goal', goal || 'unknown');
        c.thread = 'goal'; c.depth = 1;
        return l ? this.fillTalkLine(l, vp) : exh();
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
        const l = this.convoPick(vid, 'past', pool.length ? pool : ['"Before? I was {an_occ}. Feels like someone else\'s life."']);
        c.thread = 'past'; c.depth = 1;
        return l ? this.fillTalkLine(l, vp) : exh();
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
        const idlePool = [
          'holding together, somehow.',
          'tired, but nobody\'s giving up. That counts for a lot.',
          'quiet. People keeping to themselves, mostly.',
          'better than yesterday. Worse than tomorrow, probably.',
        ];
        const line = bits.length ? bits.join('; ') + '.' : this.convoPickCycle(vid, 'villageidle', idlePool);
        const fullLine = '"Honestly? ' + line + '"';
        // Village news can repeat when nothing changed — say it differently.
        c.said.villagelines = c.said.villagelines || [];
        if (c.said.villagelines.indexOf(fullLine) !== -1) {
          c.thread = 'village'; c.depth = 1;
          return '"Honestly? ' + this.convoPickCycle(vid, 'villageidle', [
            'same as before, mostly.',
            'no big changes. That\'s good news, out here.',
            'still standing. Ask me tomorrow.',
          ]) + '"';
        }
        c.said.villagelines.push(fullLine);
        c.thread = 'village'; c.depth = 1;
        return fullLine;
      }
      if (topic === 'plans') {
        const l = this.convoPick(vid, 'plansdeep', cg.plansFollow || []);
        c.thread = 'plans'; c.depth = 1;
        return l ? this.fillTalkLine(l, vp) : exh();
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
        return line || exh();
      }
      return null;
    },

    // convoLabel: topic prompts are NOT identical every time. Each villager
    // gets stable-per-person phrasing (seeded by id hash), so the "paths"
    // stop looking like paths. You learn to talk to PEOPLE, not menus.
    convoLabel(vid, key) {
      const variants = {
        goal: ['"What do you want? Out of all this."',
               '"What are you hoping for, here?"',
               '"What keeps you going?"'],
        past: ['"What did you do — before?"',
               '"What was your life, before?"',
               '"Tell me about before."'],
        village: ['"How\'s everyone holding up?"',
                  '"What\'s the mood like around here?"',
                  '"How are people doing?"'],
        plans: ['"What\'s your plan for tomorrow?"',
                '"Thought about what\'s next?"',
                '"Any plans, or just getting through?"'],
        gossip: ['"Heard anything about anyone?"',
                 '"What\'s the word around the fire?"',
                 '"Anyone saying anything interesting?"'],
      };
      const vs = variants[key] || [key];
      const h = this._hashStr ? this._hashStr(vid + ':' + key) : 0;
      return vs[Math.abs(h) % vs.length];
    },

    // convoMoreLabel: "Tell me more." is not identical every time, and it
    // reads differently per thread — "what happened next" for the past,
    // "what would that look like" for a goal. Stable per person, like
    // convoLabel: you learn to talk to PEOPLE, not menus.
    convoMoreLabel(vid) {
      const c = this.convoGet(vid);
      const variants = {
        past: ['"Tell me more."', '"What happened next?"', '"Go on — what was it like?"'],
        goal: ['"Tell me more."', '"Say more about that."', '"What would that look like?"'],
        plans: ['"Tell me more."', '"And after that?"', '"What\'s the first step?"'],
        village: ['"Tell me more."', '"Who else?"', '"How bad is it, really?"'],
        gossip: ['"Tell me more."', '"Whoa — go on."', '"What else did you hear?"'],
        small: ['"Tell me more."', '"Go on."', '"I\'m listening."'],
      };
      const vs = variants[c.thread] || variants.small;
      const h = this._hashStr ? this._hashStr(vid + ':more:' + (c.thread || '')) : 0;
      return vs[Math.abs(h) % vs.length];
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
      const suppressPivot = !!c.reactiveQ || c.thread === 'grief' || c.thread === 'cheer';
      // MAXC: the chat view has room for a real choice list. Topic asks
      // must never be starved by action buttons — Steve found deep topics
      // unreachable when discovery actions filled all 5 slots.
      // When a direct question hangs (reactive), the menu narrows to the
      // answers plus a couple conversational options — discovery actions
      // return next exchange, once the question is engaged. You don't get
      // the full menu mid-question; that's the coherence fix, not a bug.
      // (7: five topic asks can now be open at once — gossip joined them —
      // and discovery actions must still fit behind topics/theorize/observe.)
      const MAXC = reactiveDef ? reactiveDef.answers.length + 2 : 7;
      if (c.thread && this.convoThreadHasMore(vid)) choices.push({ id: 'more', label: this.convoMoreLabel(vid) });
      // PARTY INVITES live in conversation, not on a button. Discovered via
      // the System unlock. You ask people. Like a person.
      // Sits with 'more', AHEAD of the topic asks: a trust-earned, contextual
      // person-action must never be crowded out by small talk. When you've
      // earned the right to ask, the ask is there.
      if (choices.length < MAXC) {
        try {
          if (this.state.systemArrived && this.partyUnlocked && this.partyUnlocked() &&
              !this.inParty(vid) && !this.partyFull()) {
            const trust = (this.state.village.trust || {})[vid] || 10;
            if (this.hasDiscovered('party') && trust >= 20) choices.push({ id: 'invite_party', label: '"Want to come with me?"' });
          }
        } catch (e) {}
      }
      // DEPTH GATING: what they'll talk about depends on how well they know
      // you. Little hits over time, like real people. Defined once, used by
      // theorize and the topic asks below.
      // - village, plans: always (safe small talk)
      // - past: trust 20+ or 2nd conversation
      // - goal: trust 35+ or 3rd conversation (what they really want)
      // - theorize: trust 25+ or 2nd conversation (thinking together is intimate)
      // DEFLECTORS offer fewer doors: withdrawn/prickly/restless people don't
      // volunteer every topic — you get two, and you earn the rest.
      const trustNow = (this.state.village.trust || {})[vid] || 10;
      const convoCount = c.count || 0;
      // TOPIC ASKS come first — the conversation itself. Discovery actions
      // (trade/teach/promise/invite) fill whatever slots remain; they never
      // crowd out the talk.
      const threadAsk = { goal: 'ask:goal', past: 'ask:past', village: 'ask:village', plans: 'ask:plans', gossip: 'ask:gossip' }[c.thread];
      const asked = c.askedTopics || [];
      const tempNow = this.npcTemper(vid);
      const topicCap = (tempNow === 'withdrawn' || tempNow === 'prickly' || tempNow === 'restless') ? 2 : 5;
      const pastOpen = trustNow >= 20 || convoCount >= 2;
      const goalOpen = trustNow >= 35 || convoCount >= 3;
      // GOSSIP ASK: the socialite's core verb. "Heard anything about anyone?"
      // The detective layer is ask-able, not just receive-only. Same intimacy
      // gate as theorize; sits with the other topic asks, never crowding out
      // discovery actions.
      const gossipOpen = trustNow >= 20 || convoCount >= 2;
      const asks = [];
      if (!this.goalKnown(vid) && asked.indexOf('goal') === -1 && goalOpen) asks.push({ id: 'ask:goal', label: this.convoLabel(vid, 'goal') });
      if (asked.indexOf('past') === -1 && pastOpen) asks.push({ id: 'ask:past', label: this.convoLabel(vid, 'past') });
      if (asked.indexOf('village') === -1) asks.push({ id: 'ask:village', label: this.convoLabel(vid, 'village') });
      if (asked.indexOf('plans') === -1) asks.push({ id: 'ask:plans', label: this.convoLabel(vid, 'plans') });
      if (gossipOpen && asked.indexOf('gossip') === -1) asks.push({ id: 'ask:gossip', label: this.convoLabel(vid, 'gossip') });
      let topicsAdded = 0;
      for (const a of asks) {
        if (a.id === threadAsk || topicsAdded >= topicCap || choices.length >= MAXC) continue;
        choices.push(a); topicsAdded++;
      }
      // THEORIZE: joint discovery, a signature mechanic — not small talk.
      // GATED: thinking together is intimate. System talk only makes sense
      // after it arrives; before that, the scattering itself and the
      // monsters are the mystery.
      const theorized = c.theorized || [];
      const sysUp = !!this.state.systemArrived;
      const theorizeOpen = trustNow >= 25 || convoCount >= 2;
      const topicsLeft = ['system', 'monsters', 'situation'].filter(t =>
        theorized.indexOf(t) === -1 && (t !== 'system' || sysUp));
      if (theorizeOpen && topicsLeft.length && choices.length < MAXC && !suppressPivot) choices.push({ id: 'theorize', label: '"What do you think is actually going on here?"' });
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
        if (this.hasDiscovered('promise') || openedUp) choices.push({ id: 'offer_help', label: '"I could help with that."' });
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
            choices.push({ id: 'teach', label: this.hasDiscovered('teach') ? '"Let me show you something."' : '"Could I show you something?"' });
          }
        } catch (e) {}
      }
      const reacts = [
        { id: 'agree', label: '"You\'re right."' },
        { id: 'joke', label: '(crack a joke)' },
        { id: 'silence', label: '(say nothing)' },
      ];
      if (choices.length < MAXC) choices.push(reacts[Math.floor(Math.random() * reacts.length)]);
      if (c.thread && c.thread !== 'small' && choices.length < MAXC) choices.push({ id: 'subject', label: '"Actually — different subject."' });
      choices.push({ id: 'leave', label: c.exchanges === 0 ? '"Nice talking to you."' : '"I should go."' });
      return choices;
    },

    startConvo(vid) {
      const vp = this.vpOf(vid);
      if (!vp || !vp.id) return null;
      const v = this.state.village;
      const c = this.convoGet(vid);
      c.active = true; c.exchanges = 0; c.budget = this.convoBudget(vid);
      c.thread = null; c.depth = 0; c.transcript = []; c.pendingQ = null;
      c.over = false; c.offeredHelp = false; c.askedTopics = [];
      c.qCount = 0; c.theorized = [];
      c.traderMentioned = false; c.pendingTrade = null;
      c.reactiveQ = null; c.windingDown = false; c.pastDeflected = false;
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
      c.thread = op.thread; c.depth = 1;
      // REACTIVE: if the opener asked something direct ("Did you see that?"),
      // it becomes a lightweight question — answerable, follow-up-able,
      // not small talk the player can only dodge.
      const rq = this.convoMatchReactive(op.line);
      if (rq) {
        c.reactiveQ = { id: rq.id, followedUp: false };
        if (rq.thread) { c.thread = rq.thread; op.thread = rq.thread; }
      }
      c.transcript.push({ who: 'them', text: op.line });
      this.say(`${this.displayName(vid)}: "${op.line}"`);
      // SEEDING: knowledge traders mention their trade in conversation — the
      // mechanic is discovered by talking, not by a button. Once you've
      // learned the concept, you can bring it up with any trader yourself.
      if (this.isKnowledgeTrader && this.isKnowledgeTrader(vid) && !this.hasDiscovered('trade') && Math.random() < 0.5) {
        const seed = '"...I should say, I trade in what I know. My knowledge for yours. Or food, if you\'re short on secrets."';
        c.transcript.push({ who: 'them', text: seed });
        this.say(`${this.displayName(vid)}: ${seed}`);
        c.traderMentioned = true;
      }
      return { line: op.line, choices: this.convoChoices(vid), transcript: c.transcript.slice(), ended: false };
    },

    convoTurn(vid, choiceId) {
      const c = this.convoGet(vid);
      if (!c.active) return null;
      const cg = (this.data.characterGen || {}).convo || {};
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      let line = null, youSaid = null;
      const done = (l, you) => { line = l; youSaid = you || null; };
      // answeredReactive: this turn engaged their direct question — the
      // follow-up logic must not fire. extraQ: a formal question that lands
      // as a second beat in the same turn (rq_personal -> real question).
      // extraLine: a follow-up beat after an answer — Q -> A -> follow-up,
      // so answering doesn't dead-end the moment.
      let answeredReactive = false, extraQ = null, extraLine = null;

      if (choiceId === 'leave') {
        return this.endConvo(vid, 'left');
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
        done(this.fillTalkLine(react, this.vpOf(vid)), saidLabel);
        this.remember(vid, 'you_said', qid + '=' + aid);
        // FOLLOW-UP BEAT: answering a real question sometimes earns a second
        // beat — their thought continues instead of terminating. Not every
        // time; people don't monologue after every answer.
        if (qd && qd.follow && Math.random() < 0.5) {
          extraLine = this.fillTalkLine(qd.follow, this.vpOf(vid));
        }
      } else if (choiceId === 'deflect_q') {
        const qid = c.pendingQ && c.pendingQ.id;
        c.pendingQ = null;
        if (qid && c.askedQs.indexOf(qid) === -1) c.askedQs.push(qid);
        const t = this.state.village.trust || {};
        t[vid] = Math.max(0, (t[vid] || 10) - 1);
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
          c.thread = 'small'; c.depth = 1;
          done(ad.line || '"...Okay. Here it is."', ad.label);
          if (qd) {
            c.pendingQ = qd;
            if (c.askedQs.indexOf(qd.id) === -1) c.askedQs.push(qd.id);
            c.qCount = (c.qCount || 0) + 1;
            extraQ = qd;
          }
        } else if (ad) {
          t[vid] = Math.max(0, Math.min(100, (t[vid] || 10) + (ad.trust || 0)));
          if (rdef.thread) { c.thread = rdef.thread; c.depth = 1; }
          done(ad.line, ad.label);
        } else {
          done('"..."', null);
        }
      } else if (choiceId === 'more') {
        const beat = this.convoThreadBeat(vid);
        done(beat || this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']), '"Tell me more."');
      } else if (choiceId.indexOf('ask:') === 0) {
        const topic = choiceId.slice(4);
        // DEEP BEATS build trust faster: asking about someone's past or what
        // they want is an act of care. Words only go so far — talk caps at 40.
        if (topic === 'past' || topic === 'goal') {
          const t = this.state.village.trust || {};
          const cur = t[vid] || 10;
          if (cur < 40) t[vid] = Math.min(40, cur + 2);
        }
        done(this.convoAskTopic(vid, topic), this.convoLabel(vid, topic));
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
        const youKnow = Object.keys(this.state.codex.plants || {});
        const theyKnow = (this.state.village.taught && this.state.village.taught[vid]) || [];
        const teachable = youKnow.filter(pid => theyKnow.indexOf(pid) === -1);
        if (!teachable.length) {
          done('"Huh — looks like we\'re even on the green stuff."', '"Let me show you something."');
        } else {
          const pid = teachable[0];
          this.state.village.taught[vid] = this.state.village.taught[vid] || [];
          this.state.village.taught[vid].push(pid);
          const pname = ((this.data.plants || []).find(p => p.id === pid) || {}).name || pid;
          this.discover('teach');
          const t = this.state.village.trust || {};
          t[vid] = Math.min(100, (t[vid] || 10) + 2);
          try { this.socialTick(vid); } catch (e) {}
          try { this.convoDeepTick(vid); } catch (e) {}
          done(`You show them ${pname} — where it grows, how to tell it apart. Their eyes widen. "I never knew that."`, '"Let me show you something."');
        }
      } else if (choiceId === 'invite_party') {
        const r = (this.inviteToParty && this.inviteToParty(vid)) || { ok: false, msg: '...' };
        done(r.msg || '...', '"Want to come with me?"');
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
        } else {
          const m = cg.agreeReacts || {};
          // Acknowledgments are human filler — per-temperament pools (arrays
          // in data), never a loop.
          const rawA = m[temp] || m.default || '"Yeah."';
          const poolA = Array.isArray(rawA) ? rawA : [rawA];
          const l = this.convoPick(vid, 'agree:' + temp, poolA)
            || this.convoPickCycle(vid, 'agreefill', ['"Yeah."', '"Mm."', '"Right."', 'Nods along.']);
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
        } else {
        const m = cg.jokeReacts || {};
        const rkey = (mood === 'grieving' || mood === 'scared') ? mood : temp;
        const key = 'joke:' + rkey;
        const rawJ = m[rkey] || m.default || 'A short laugh.';
        const poolJ = Array.isArray(rawJ) ? rawJ : [rawJ];
        const l = this.convoPick(vid, key, poolJ)
          || this.convoPickCycle(vid, 'jokefill', ['A short laugh.', 'Snorts.', 'Grins.']);
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
        } else {
        const m = cg.silence || {};
        const key = 'silence:' + temp;
        const rawS = m[temp] || '"..."';
        const poolS = Array.isArray(rawS) ? rawS : [rawS];
        const l = this.convoPick(vid, key, poolS)
          || this.convoPickCycle(vid, 'silencefill', ['...', 'The quiet holds.', 'Say nothing more.']);
        done(l, '(say nothing)');
        }
      } else if (choiceId === 'subject') {
        // Change the subject — to a topic you haven't covered yet.
        const asked = c.askedTopics || [];
        const opts = [];
        if (!this.goalKnown(vid) && asked.indexOf('goal') === -1) opts.push('goal');
        if (asked.indexOf('past') === -1) opts.push('past');
        if (asked.indexOf('village') === -1) opts.push('village');
        if (asked.indexOf('plans') === -1) opts.push('plans');
        if (!opts.length) {
          done(this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I think we\'ve covered everything."']), '"Actually — different subject."');
        } else {
          const nt = opts[Math.floor(Math.random() * opts.length)];
          done(this.convoAskTopic(vid, nt), '"Actually — different subject." ' + this.convoLabel(vid, nt));
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

      if (youSaid) c.transcript.push({ who: 'you', text: youSaid });
      c.transcript.push({ who: 'them', text: line });
      while (c.transcript.length > 8) c.transcript.shift();
      c.exchanges++;
      this.say(`${this.displayName(vid)}: "${line}"`);

      // extraQ: rq_personal's "Of course. Ask." lands the real question as a
      // second beat in the same turn — question and answers stay together.
      if (extraQ) {
        c.transcript.push({ who: 'them', text: extraQ.q });
        while (c.transcript.length > 8) c.transcript.shift();
        this.say(`${this.displayName(vid)}: "${extraQ.q}"`);
      }
      // extraLine: the follow-up beat after an answer — same-turn, so the
      // thought lands whole instead of dying at the react line.
      if (extraLine) {
        c.transcript.push({ who: 'them', text: extraLine });
        while (c.transcript.length > 8) c.transcript.shift();
        this.say(`${this.displayName(vid)}: "${extraLine}"`);
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
      if (c.thread !== 'nonverbal' && !c.pendingQ && c.exchanges >= 1 && !answeredReactive) {
        const rqf = c.reactiveQ && REACTIVE_DEFS[c.reactiveQ.id];
        if (rqf) {
          if (!c.reactiveQ.followedUp) {
            c.reactiveQ.followedUp = true;
            c.transcript.push({ who: 'them', text: rqf.followUp });
            while (c.transcript.length > 8) c.transcript.shift();
            this.say(`${this.displayName(vid)}: "${rqf.followUp}"`);
          } else {
            if (rqf.lapse) {
              c.transcript.push({ who: 'them', text: rqf.lapse });
              while (c.transcript.length > 8) c.transcript.shift();
              this.say(`${this.displayName(vid)}: "${rqf.lapse}"`);
            }
            c.reactiveQ = null;
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
              'spooked', 'request', 'recall', 'grief', 'cheer'];
            if (liveThreads.indexOf(c.thread) !== -1) {
              const bridge = this.convoPickCycle(vid, 'qbridge', [
                'A beat. Then, as if shaking something off:',
                'They let that thread drop — for now.',
                'A pause. When they speak again, it\'s about something else entirely.',
                'They glance away, then back. Different subject, same worry:',
              ]);
              c.transcript.push({ who: 'them', text: bridge });
              this.say(`${this.displayName(vid)}: ${bridge}`);
            }
            c.pendingQ = qd;
            c.qCount = (c.qCount || 0) + 1;
            c.transcript.push({ who: 'them', text: qd.q });
            while (c.transcript.length > 8) c.transcript.shift();
            this.say(`${this.displayName(vid)}: "${qd.q}"`);
            // The answer and their question are SEPARATE transcript entries —
            // never mashed into one line. Reading back should feel like dialogue.
          }
        }
      }

      // Natural ending: the conversation has run its course. But an abrupt
      // exit mid-thought reads as a cutoff — so the budget landing gets a
      // wind-down beat first: a temperament-colored "I should get going"
      // with one last turn of choices. The player can still say goodbye
      // themselves, take one more beat of a live thread, or just leave.
      // Only the player's "I should go." (or the turn after the wind-down)
      // ends the scene — never a silent chop.
      if (!c.pendingQ && c.exchanges >= c.budget) {
        if (!c.windingDown) {
          c.windingDown = true;
          const wdPool = (cg.winddowns || {})[temp] || (cg.winddowns || {}).default
            || ['"Anyway — I should get back to it."'];
          const wd = this.convoPickCycle(vid, 'winddown', wdPool);
          c.transcript.push({ who: 'them', text: wd });
          while (c.transcript.length > 8) c.transcript.shift();
          this.say(`${this.displayName(vid)}: ${wd}`);
          const wdChoices = [{ id: 'leave', label: '"I should go."' }];
          if (this.convoThreadHasMore(vid)) {
            wdChoices.push({ id: 'more', label: '"One more thing —"' });
          }
          const reacts = ['agree', 'joke', 'silence'];
          const rid = reacts[Math.floor(Math.random() * reacts.length)];
          const rlabels = { agree: '"You\'re right."', joke: '(crack a joke)', silence: '(say nothing)' };
          wdChoices.push({ id: rid, label: rlabels[rid] });
          return { line: wd, choices: wdChoices, ended: false, windingDown: true, transcript: c.transcript.slice() };
        }
        return this.endConvo(vid, 'natural');
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
        const pool = exits[key] || exits.steady || ['"I should go."'];
        line = this.convoPickCycle(vid, 'exit', pool);
      }
      c.transcript.push({ who: 'them', text: line });
      while (c.transcript.length > 8) c.transcript.shift();
      // WORDS ONLY GO SO FAR: talk caps at 40. Beyond that, do something real.
      const t = this.state.village.trust || (this.state.village.trust = {});
      const cur = t[vid] || 10;
      t[vid] = cur >= 40 ? cur : Math.min(40, cur + 3);
      try { this.observe('talk', { noTrust: true }); } catch (e) {}
      try { this.checkPromises('social'); } catch (e) {}
      this.convoConflictFallout(vid, t[vid]);
      this.say(`${first}: ${line}`);
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
        const iname = String(this.displayName(c.interpreter)).split(' ')[0];
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
        const yn = String(this.displayName(yid)).split(' ')[0];
        out.push({ id: 'nv:translate', label: `(ask ${yn} to translate)` });
      }
      out.push({ id: 'leave', label: '(walk away)' });
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
      while (c.transcript.length > 8) c.transcript.shift();
      c.exchanges++;
      this.say(`${this.displayName(vid)}: ${line}`);
      // No they-ask-you in nonverbal. Ever. (The leak Steve reported.)
      // Wind-down, not a chop: the budget landing gets a gesture beat first,
      // same as the verbal path.
      if (!c.pendingQ && c.exchanges >= c.budget) {
        if (!c.windingDown) {
          c.windingDown = true;
          const wd = this.convoPickCycle(vid, 'nvwinddown', [
            'Their gestures slow — the conversation thinning like light at dusk.',
            'They glance toward their own thoughts; the exchange is winding down.',
            'A final shared look — you both feel the talk running its course.',
          ]);
          c.transcript.push({ who: 'them', text: wd, foreign: c.nativeLang || this.npcNativeLang(vid) });
          while (c.transcript.length > 8) c.transcript.shift();
          this.say(`${this.displayName(vid)}: ${wd}`);
          return { line: wd, choices: [
            { id: 'leave', label: '(walk away)' },
            { id: 'nv:nod', label: '(nod slowly)' },
          ], ended: false, windingDown: true, transcript: c.transcript.slice() };
        }
        return this.endConvo(vid, 'natural');
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
