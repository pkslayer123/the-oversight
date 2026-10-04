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
        const pool = (this.data.characterGen.talkTemplates || [])
          .filter(s => s.indexOf('{occ}') !== -1 || s.indexOf('{origin}') !== -1);
        const l = this.convoPick(vid, 'past', pool.length ? pool : ['"Before? I was {occ}. Feels like someone else\'s life."']);
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

    convoChoices(vid) {
      const c = this.convoGet(vid);
      const choices = [];
      // Answering their question comes first — it's rude to ignore it.
      if (c.pendingQ) {
        for (const a of c.pendingQ.answers) choices.push({ id: 'ans:' + c.pendingQ.id + ':' + a.id, label: a.label });
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
      if (c.thread && this.convoThreadHasMore(vid)) choices.push({ id: 'more', label: '"Tell me more."' });
      const threadAsk = { goal: 'ask:goal', past: 'ask:past', village: 'ask:village', plans: 'ask:plans' }[c.thread];
      const asked = c.askedTopics || [];
      const asks = [];
      if (!this.goalKnown(vid) && asked.indexOf('goal') === -1) asks.push({ id: 'ask:goal', label: '"What do you want? Out of all this."' });
      if (asked.indexOf('past') === -1) asks.push({ id: 'ask:past', label: '"What did you do — before?"' });
      if (asked.indexOf('village') === -1) asks.push({ id: 'ask:village', label: '"How\'s everyone holding up?"' });
      if (asked.indexOf('plans') === -1) asks.push({ id: 'ask:plans', label: '"What\'s your plan for tomorrow?"' });
      for (const a of asks) if (a.id !== threadAsk && choices.length < 4) choices.push(a);
      if (this.goalKnown(vid) && !c.offeredHelp && choices.length < 5) choices.push({ id: 'offer_help', label: '"I could help with that."' });
      // THEORIZE: think TOGETHER. Not info-vending — joint discovery.
      // System talk only makes sense after it arrives; before that, the
      // scattering itself and the monsters are the mystery.
      const theorized = c.theorized || [];
      const sysUp = !!this.state.systemArrived;
      const topicsLeft = ['system', 'monsters', 'situation'].filter(t =>
        theorized.indexOf(t) === -1 && (t !== 'system' || sysUp));
      if (topicsLeft.length && choices.length < 5) choices.push({ id: 'theorize', label: '"What do you think is actually going on here?"' });
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
      c.count++; c.lastDay = this.state.scholar.day;
      // TALKING COSTS ENERGY — 20 kcal per conversation, not per line.
      this.state.scholar.kcal = Math.max(0, (this.state.scholar.kcal || 0) - 20);
      // ACTION CLOCK: a real conversation takes 2 ticks (time-only — talking barely burns calories).
      // ENGAGEMENT: they're talking with you now — batch turns won't wander them off.
      this.tickAction(2);
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
        // No shared language isn't a wall — it's a different conversation.
        const line = 'No shared words. Just eyes, hands, and patience.';
        c.thread = 'nonverbal';
        c.transcript.push({ who: 'them', text: line });
        this.say(`${this.displayName(vid)}: (no shared words — you communicate in gestures)`);
        return { line, choices: this.convoChoices(vid), transcript: c.transcript.slice(), ended: false };
      }
      const op = this.convoOpening(vid);
      c.thread = op.thread; c.depth = 1;
      c.transcript.push({ who: 'them', text: op.line });
      this.say(`${this.displayName(vid)}: "${op.line}"`);
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
        react = react.replaceAll('{region}', (this.homeRegion || (this.state.scholar || {}).homeRegion) || 'there');
        done(this.fillTalkLine(react, this.vpOf(vid)), ad ? ad.label : null);
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
        const labels = { goal: '"What do you want? Out of all this."', past: '"What did you do — before?"', village: '"How\'s everyone holding up?"', plans: '"What\'s your plan for tomorrow?"' };
        done(this.convoAskTopic(vid, topic), labels[topic] || null);
      } else if (choiceId === 'offer_help') {
        c.offeredHelp = true;
        const l = this.convoPick(vid, 'offerhelp', [
          '"You\'d do that? ...Thank you. Really."',
          '"I won\'t forget you said that."',
          '"Okay. Okay — that means something, you know that?"',
        ]) || '"Thank you."';
        const t = this.state.village.trust || {};
        t[vid] = Math.min(100, (t[vid] || 10) + 2);
        done(l, '"I could help with that."');
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
        const labels = { goal: '"What do you want? Out of all this."', past: '"What did you do — before?"', village: '"How\'s everyone holding up?"', plans: '"What\'s your plan for tomorrow?"' };
        if (!opts.length) {
          done(this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I think we\'ve covered everything."']), '"Actually — different subject."');
        } else {
          const nt = opts[Math.floor(Math.random() * opts.length)];
          done(this.convoAskTopic(vid, nt), '"Actually — different subject." ' + (labels[nt] || ''));
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

      // THEY ask YOU things. Conversations go both ways.
      // First conversation with someone: they're curious about the stranger.
      // After that, curiosity strikes about 40% of turns.
      const forceQ = c.count === 1 && !c.qAskedThisConvo;
      if (!c.pendingQ && c.exchanges >= 1 && (forceQ || Math.random() < 0.4)) {
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
          line = qd.q;
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
