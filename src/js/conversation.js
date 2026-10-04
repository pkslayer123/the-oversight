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

    convoGet(vid) {
      const v = this.state.village;
      v.conv = v.conv || {};
      if (!v.conv[vid]) v.conv[vid] = {
        active: false, exchanges: 0, budget: 4, thread: null, depth: 0,
        said: {}, transcript: [], pendingQ: null, askedQs: [],
        answered: {}, recalled: {}, lastDay: -1, count: 0, over: false,
        offeredHelp: false, askedTopics: [], qAskedThisConvo: false,
        theorized: [],
      };
      return v.conv[vid];
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
      return Math.max(2, Math.min(6, b));
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
    // one thread never resurfaces in another.
    // Returns the line, or null when the pool is genuinely exhausted.
    convoPick(vid, key, pool) {
      const c = this.convoGet(vid);
      c.said[key] = c.said[key] || [];
      const allSaid = [];
      for (const k of Object.keys(c.said)) for (const l of c.said[k]) allSaid.push(l);
      const fresh = (pool || []).filter(l => allSaid.indexOf(l) === -1);
      if (!fresh.length) return null;
      const line = fresh[Math.floor(Math.random() * fresh.length)];
      c.said[key].push(line);
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
      push((this.data.characterGen.talkTemplates || []).slice(0, 8), 1);
      if (!pool.length) push(cg.openers || ['"Hey."'], 1);
      const l = this.convoPick(vid, 'small', pool);
      if (l) return { line: this.fillTalkLine(l, vp), thread: 'small' };
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
          c.thread = 'past'; c.depth = 1;
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
      };
      const vs = variants[key] || [key];
      const h = this._hashStr ? this._hashStr(vid + ':' + key) : 0;
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
      if (c.thread && this.convoThreadHasMore(vid)) choices.push({ id: 'more', label: '"Tell me more."' });
      // DISCOVERY CHOICES take priority over generic topic asks. These are
      // the meaningful actions — trade, teach, promise, invite — and they
      // should surface before small talk fills the slots.
      // PROMISES are discovered, not menued. Before you've learned the
      // concept, the offer only surfaces when they've really opened up
      // (deep in their goal thread). After that, any known goal will do.
      // The handler makes a FORMAL tracked promise — keep it or break it.
      const alreadyPromised = !!((this.state.village.promises || {})[vid]);
      if (this.goalKnown(vid) && !c.offeredHelp && !alreadyPromised && choices.length < 5) {
        const openedUp = c.thread === 'goal' && (c.depth || 0) >= 2;
        if (this.hasDiscovered('promise') || openedUp) choices.push({ id: 'offer_help', label: '"I could help with that."' });
      }
      // KNOWLEDGE TRADING is discovered through conversation: traders seed it
      // by mentioning it; once learned, you can raise it with any trader.
      if (choices.length < 5) {
        try {
          const isTrader = this.isKnowledgeTrader && this.isKnowledgeTrader(vid);
          const tradeable = isTrader ? (this.traderKnowledge(vid) || []) : [];
          if (isTrader && tradeable.length && (this.hasDiscovered('trade') || c.traderMentioned)) {
            choices.push({ id: 'trade', label: '"You know things. I know things. Shall we trade?"' });
          }
        } catch (e) {}
      }
      // TEACHING happens in conversation now — show, don't menu.
      if (choices.length < 5) {
        try {
          const youKnow = Object.keys(this.state.codex.plants || {});
          const theyKnow = (this.state.village.taught && this.state.village.taught[vid]) || [];
          if (youKnow.some(pid => theyKnow.indexOf(pid) === -1)) {
            choices.push({ id: 'teach', label: this.hasDiscovered('teach') ? '"Let me show you something."' : '"Could I show you something?"' });
          }
        } catch (e) {}
      }
      // PARTY INVITES live in conversation, not on a button. Discovered via
      // the System unlock. You ask people. Like a person.
      if (choices.length < 5) {
        try {
          if (this.state.systemArrived && this.partyUnlocked && this.partyUnlocked() &&
              !this.inParty(vid) && !this.partyFull()) {
            const trust = (this.state.village.trust || {})[vid] || 10;
            if (this.hasDiscovered('party') && trust >= 20) choices.push({ id: 'invite_party', label: '"Want to come with me?"' });
          }
        } catch (e) {}
      }
      // THEORIZE comes before the topic asks: it's a signature mechanic
      // (joint discovery), not small talk — it shouldn't be starved by
      // the discovery choices above or the asks below.
      // System talk only makes sense after it arrives; before that, the
      // scattering itself and the monsters are the mystery.
      const theorized = c.theorized || [];
      const sysUp = !!this.state.systemArrived;
      const topicsLeft = ['system', 'monsters', 'situation'].filter(t =>
        theorized.indexOf(t) === -1 && (t !== 'system' || sysUp));
      if (topicsLeft.length && choices.length < 5) choices.push({ id: 'theorize', label: '"What do you think is actually going on here?"' });
      // TOPIC ASKS fill remaining slots after the meaningful actions.
      // DEFLECTORS offer fewer doors: withdrawn/prickly/restless people don't
      // volunteer every topic — you get two, and you earn the rest.
      const threadAsk = { goal: 'ask:goal', past: 'ask:past', village: 'ask:village', plans: 'ask:plans' }[c.thread];
      const asked = c.askedTopics || [];
      const tempNow = this.npcTemper(vid);
      const topicCap = (tempNow === 'withdrawn' || tempNow === 'prickly' || tempNow === 'restless') ? 2 : 5;
      const asks = [];
      if (!this.goalKnown(vid) && asked.indexOf('goal') === -1) asks.push({ id: 'ask:goal', label: this.convoLabel(vid, 'goal') });
      if (asked.indexOf('past') === -1) asks.push({ id: 'ask:past', label: this.convoLabel(vid, 'past') });
      if (asked.indexOf('village') === -1) asks.push({ id: 'ask:village', label: this.convoLabel(vid, 'village') });
      if (asked.indexOf('plans') === -1) asks.push({ id: 'ask:plans', label: this.convoLabel(vid, 'plans') });
      // Cap counts TOPIC asks, not total choices — deflectors get fewer doors,
      // not zero. (An earlier version capped choices.length and starved them.)
      let topicsAdded = 0;
      for (const a of asks) {
        if (a.id === threadAsk || topicsAdded >= topicCap || choices.length >= 5) continue;
        choices.push(a); topicsAdded++;
      }
      const reacts = [
        { id: 'agree', label: '"You\'re right."' },
        { id: 'joke', label: '(crack a joke)' },
        { id: 'silence', label: '(say nothing)' },
      ];
      if (choices.length < 5) choices.push(reacts[Math.floor(Math.random() * reacts.length)]);
      if (c.thread && c.thread !== 'small' && choices.length < 5) choices.push({ id: 'subject', label: '"Actually — different subject."' });
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
      c.qAskedThisConvo = false; c.theorized = [];
      c.traderMentioned = false; c.pendingTrade = null;
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
      } else if (choiceId === 'deflect_q') {
        const qid = c.pendingQ && c.pendingQ.id;
        c.pendingQ = null;
        if (qid && c.askedQs.indexOf(qid) === -1) c.askedQs.push(qid);
        const t = this.state.village.trust || {};
        t[vid] = Math.max(0, (t[vid] || 10) - 1);
        done('"Okay." Something shutters, just slightly.', '(avoid the question)');
      } else if (choiceId === 'more') {
        const beat = this.convoThreadBeat(vid);
        done(beat || this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']), '"Tell me more."');
      } else if (choiceId.indexOf('ask:') === 0) {
        const topic = choiceId.slice(4);
        done(this.convoAskTopic(vid, topic), this.convoLabel(vid, topic));
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
        done(`"${r.msg || '...'}"`, '"Want to come with me?"');
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
        done(line, '"What do you think is actually going on here?"');
      } else if (choiceId === 'agree') {
        const m = cg.agreeReacts || {};
        // Acknowledgments are human filler — a small cycling pool, never a loop.
        const l = this.convoPick(vid, 'agree:' + temp, [m[temp] || m.default || '"Yeah."'])
          || this.convoPickCycle(vid, 'agreefill', ['"Yeah."', '"Mm."', '"Right."', 'Nods along.']);
        done(l, '"You\'re right."');
      } else if (choiceId === 'joke') {
        const m = cg.jokeReacts || {};
        const rkey = (mood === 'grieving' || mood === 'scared') ? mood : temp;
        const key = 'joke:' + rkey;
        const l = this.convoPick(vid, key, [m[rkey] || m.default || 'A short laugh.'])
          || this.convoPickCycle(vid, 'jokefill', ['A short laugh.', 'Snorts.', 'Grins.']);
        done(l, '(crack a joke)');
        const vg = this.state.village;
        vg.cheer = Math.max(vg.cheer || 0, 1);
      } else if (choiceId === 'silence') {
        const m = cg.silence || {};
        const key = 'silence:' + temp;
        const l = this.convoPick(vid, key, [m[temp] || '"..."'])
          || this.convoPickCycle(vid, 'silencefill', ['...', 'The quiet holds.', 'Say nothing more.']);
        done(l, '(say nothing)');
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

      // DEEP BEATS cost a tick: topic asks, "tell me more", theorizing,
      // trading, teaching, promises, invites, answering personal questions.
      // Small talk (agree, joke, silence, subject-change) is free — you're
      // already here. Graduated cost keeps long conversations affordable.
      if (/^(ask:|more|theorize|trade_yes|teach|offer_help|invite_party|ans:)/.test(choiceId || '')) {
        this.convoDeepTick(vid);
      }

      // THEY ask YOU things. Conversations go both ways.
      // Never in nonverbal: someone you share no words with does not
      // suddenly ask "Where are you from?" in fluent English. (Leak fix.)
      const forceQ = c.count === 1 && !c.qAskedThisConvo;
      if (c.thread !== 'nonverbal' && !c.pendingQ && c.exchanges >= 1 && (forceQ || Math.random() < 0.4)) {
        const trust = (this.state.village.trust || {})[vid] || 10;
        const moodNow = this.npcMood(vid);
        const cands = (cg.questions || []).filter(q =>
          c.askedQs.indexOf(q.id) === -1 && trust >= (q.minTrust || 0) &&
          (!q.when || q.when === moodNow));
        if (cands.length) {
          const qd = cands[Math.floor(Math.random() * cands.length)];
          c.pendingQ = qd;
          c.qAskedThisConvo = true;
          c.transcript.push({ who: 'them', text: qd.q });
          while (c.transcript.length > 8) c.transcript.shift();
          this.say(`${this.displayName(vid)}: "${qd.q}"`);
          // The answer and their question are SEPARATE transcript entries —
          // never mashed into one line. Reading back should feel like dialogue.
        }
      }

      // Natural ending: the conversation has run its course.
      if (!c.pendingQ && c.exchanges >= c.budget) return this.endConvo(vid, 'natural');
      return { line, choices: this.convoChoices(vid), ended: false, transcript: c.transcript.slice() };
    },

    endConvo(vid, how) {
      const c = this.convoGet(vid);
      const cg = (this.data.characterGen || {}).convo || {};
      const temp = this.npcTemper(vid);
      const mood = this.npcMood(vid);
      const first = this.displayName(vid);
      c.active = false; c.over = true; c.thread = null; c.pendingQ = null;
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
      if (!c.pendingQ && c.exchanges >= c.budget) return this.endConvo(vid, 'natural');
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
