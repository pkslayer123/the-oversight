// @ontology
// system: conversation-topics
// description: Generated conversation topics. Every villager is a unique person
//   who changes during a run — so topics are GENERATED from identity (backstory,
//   fears, hopes, occupation, temperament) and run events (losses, betrayals,
//   threats), never a fixed list. A topic pool that doesn't know the speaker
//   is just trivia.
// provides:
//   - topic2Has(topic)
//   - topic2Ask(vid, topic)
//   - topic2HasMore(vid)
//   - topic2Beat(vid)
//   - topic2Asks(vid)
//   - topic2Label(vid, topic)
//   - topic2MoreLabel(vid)
//   - topic2AskLabel(vid, topic)
//   - topic2Deep(topic)
//   - topic2SubjectOpts(vid)
//   - t2lifeseed(vid) -> their lifeseed or null
//   - t2seedName(vid) -> a named person from their seed (coherence)
//   - t2hasHardLived(vid) / t2hardAnchor(vid)
// rules:
//   - generated_not_pooled: topic lines are composed from villager identity + run state (code: convoTopics.js, t2gen_*)
//   - seed_coherence: named people in topic lines come ONLY from the lifeseed (t2seedName) — the 'loved' topic no longer invents names (code: t2gen_loved, Steve 2026-10-07)
//   - change_over_run: re-asking after events acknowledges the change (code: convoTopics.js, topic2Ask t2snap)
//   - event_topic: 'lately' appears only while a run event is live (code: convoTopics.js, t2LatelyEvent)
//   - no_repeat: openers and beats route through convoPick (code: convoTopics.js, topic2Ask/topic2Beat)
//   - hardstory_once: the 'hardstory' topic is gated on deep trust + a hard lived event, is told exactly once (marked in topic2Ask, hidden by t2gate after), and speaks the lifeseed wound in their own words (code: t2gen_hardstory/t2fol_hardstory, Steve 2026-10-07)
//   - said_facts_recorded: asserted claims go on the said-facts record — the hardstory's wound/anchor, the others-topic's grievance history and trust claims — so later talk extends the same thread instead of inventing a new past (code: t2gen_hardstory/t2gen_others via convoSaidFact, Steve 2026-10-07)
//   - lived_gates: 'lived' topics need something hard actually lived — the gate is the run itself (code: t2gate/t2hasHardLived, Steve 2026-10-07)
// consumes:
//   - Game (characterGen.topicPack labels)
//   - village.villagers
//   - vpOf(vid) -> villager char incl. lifeseed
//   - lifeseedWoundEuphemism, lifeseedKin
// ============ GENERATED CONVERSATION TOPICS ============
// Steve 2026-10-06 (unique-person law): topics generate from WHO this villager
// is and WHAT they've lived through this run. Self-attaching module, same
// pattern as conversation.js. Integration points in conversation.js are all
// marked "TOPIC PACK".

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const methods = {
    // ---------- identity helpers ----------
    t2pack() { return (this.data.characterGen || {}).topicPack || {}; },
    t2pers(vp) { return (vp && vp.personality) || {}; },
    t2fear(vp) { return (vp && (vp.secretFear || vp.fear)) || 'being forgotten'; },
    t2cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); },
    t2trust(vid) { return (this.state.village.trust || {})[vid] || 10; },
    t2band(vid) {
      const t = this.t2trust(vid);
      return t >= 75 ? 'devoted' : t >= 50 ? 'close' : t >= 30 ? 'warming' : 'wary';
    },
    t2mem(vid) { return ((this.state.village.memory || {})[vid]) || []; },
    // t2lifeseed: the villager's lifeseed — backstory, named people, wound,
    // lived events, voice taboos. Topics generate FROM this, never from
    // random names (Steve 2026-10-06 unique-person law; the lifeseed voice-
    // coherence rule: voice topics name ONLY seed people/places).
    t2lifeseed(vid) {
      try {
        const vp = this.vpOf(vid);
        return (vp && vp.lifeseed) || null;
      } catch (e) { return null; }
    },
    // t2seedName: a named person from their lifeseed (first name). The
    // 'loved' topic used to invent random names — incoherent with the seed
    // (fixed Steve 2026-10-07). Someone waiting is someone from their life.
    t2seedName(vid) {
      try {
        const ls = this.t2lifeseed(vid);
        const p = ls && (ls.people || [])[0];
        if (p && p.name) return p.name.split(' ')[0];
        if (typeof this.lifeseedKin === 'function') {
          const vp = this.vpOf(vid);
          const k = this.lifeseedKin(vp, null);
          if (k && k !== 'someone') return k;
        }
      } catch (e) {}
      return null;
    },
    t2pro(vp, vid) {
      if (vp && vp.pro) return vp.pro;
      try { return ['she', 'he', 'they'][this._hashStr(vid || 'x') % 3]; }
      catch (e) { return 'they'; }
    },
    // t2fill: fillTalkLine plus identity slots. Every generated line passes
    // through here, so {fear}/{hope}/{quirk}/{habit} always resolve to THIS
    // villager's truth — never another speaker's.
    t2fill(line, vp, vid) {
      let s;
      try { s = this.fillTalkLine(line, vp || {}); } catch (e) { s = String(line); }
      const p = this.t2pers(vp);
      const pro = this.t2pro(vp, vid);
      const subj = pro === 'they' ? 'they' : pro;
      const obj = pro === 'they' ? 'them' : (pro === 'she' ? 'her' : 'him');
      const poss = pro === 'they' ? 'their' : (pro === 'she' ? 'her' : 'his');
      const Subj = subj.charAt(0).toUpperCase() + subj.slice(1);
      // Habits/quirks are stored third-person ("checks the treeline"); the
      // {habitI}/{quirkI} slots convert to first-person for "I ..." frames.
      const toFirst = (x) => String(x || '')
        .replace(/^(never|always|still|just)\s+([a-z]+?)s\b/, '$1 $2')
        .replace(/^does\b/, 'do').replace(/^has\b/, 'have')
        .replace(/^([a-z]+?)s\b/, '$1');
      const habitI = toFirst(p.habit || 'keeping busy');
      const quirkI = toFirst(p.quirk || 'a habit I don\'t talk about');
      return s.replaceAll('{fear}', this.t2fear(vp))
        .replaceAll('{Fear}', this.t2cap(this.t2fear(vp)))
        .replaceAll('{hope}', p.hope || 'something better')
        .replaceAll('{quirk}', p.quirk || 'a habit I don\'t talk about')
        .replaceAll('{Quirk}', this.t2cap(p.quirk || 'a habit I don\'t talk about'))
        .replaceAll('{quirkI}', quirkI)
        .replaceAll('{habit}', p.habit || 'keeping busy')
        .replaceAll('{habitI}', habitI)
        .replaceAll('{They}', Subj).replaceAll('{they}', subj)
        .replaceAll('{them}', obj).replaceAll('{their}', poss);
    },
    t2pick(vid, key, cands) {
      const pool = (cands || []).filter(Boolean);
      if (!pool.length) return null;
      return this.convoPick(vid, key, pool) || pool[0];
    },
    // Event clock: advances when the run changes. Re-asking a topic after the
    // clock moves gets an honest "it's different now" — people change.
    t2clock(vid) {
      const v = this.state.village;
      const day = (this.state.scholar || {}).day || 0;
      return [this.t2band(vid), day, (v.exiles || []).length,
        (v.grief || 0) > 0 ? 1 : 0, this.t2mem(vid).length].join('|');
    },
    t2changeLine() {
      return this.t2pick('__change', 't2change', [
        '"You asked me that before. It\'s a different question now."',
        '"Last time things were different. They always are."',
        '"Huh. I answered that once — back when the answer was simpler."',
      ]);
    },

    // ---------- registry ----------
    // Gate mirrors the main system's depth gating: intimacy is earned.
    t2defs() {
      return [
        { id: 'lately', event: true },
        { id: 'you', minTrust: 30, deep: true },
        { id: 'fears', minTrust: 25, deep: true },
        { id: 'others', minTrust: 20 },
        { id: 'advice', minTrust: 20 },
        { id: 'oldworld', minTrust: 15 },
        { id: 'skills', minTrust: 0 },
        { id: 'work', minTrust: 10,
          labels: ['"What do you actually do around here?"', '"What\'s your work?"', '"How do you spend your days?"'],
          moreLabels: ['"What\'s the hard part of it?"', '"Tell me more about the work."'] },
        { id: 'hopes', minTrust: 30, deep: true,
          labels: ['"What are you hoping for?"', '"What do you want, down the road?"', '"What does the future look like to you?"'],
          moreLabels: ['"Tell me more about that."', '"What would it take?"'] },
        { id: 'hardstory', minTrust: 60, deep: true, lived: true,
          labels: ['"What\'s the hardest thing you\'ve lived through?"'],
          moreLabels: ['"I\'m here."'] },
        { id: 'systemtake', system: true },
        { id: 'loved', minTrust: 40, deep: true },
      ];
    },
    topic2Has(topic) {
      return this.t2defs().some(d => d.id === topic);
    },
    topic2Deep(topic) {
      const d = this.t2defs().find(x => x.id === topic);
      return !!(d && d.deep);
    },
    t2gate(vid, def) {
      if (def.event) return !!this.t2LatelyEvent(vid);
      if (def.system) return !!this.state.systemArrived;
      const c = this.convoGet(vid);
      // The hard story is told ONCE. After that the topic is gone —
      // asking again would be cruel, and they'd never repeat it.
      if (def.id === 'hardstory' && c.hardstoryTold) return false;
      // 'lived' topics need something hard actually lived — the knowledge
      // gate is the run itself, not a number.
      if (def.lived && !this.t2hasHardLived(vid)) return false;
      const trust = this.t2trust(vid);
      const count = c.count || 0;
      const mt = def.minTrust || 0;
      if (mt <= 0) return true;
      if (mt >= 60) return trust >= 60 || count >= 6;
      if (mt >= 40) return trust >= 40 || count >= 4;
      if (mt >= 30) return trust >= 30 || count >= 3;
      return trust >= mt || count >= 2;
    },
    // t2hasHardLived: have they lived something hard this run? Read from
    // the lifeseed lived record first, village memory second.
    t2hasHardLived(vid) {
      const HARD = /death_of_kin|betrayal|loss|kill|exile|theft_victim|theft_done|death_witnessed|hunger_survived/i;
      try {
        const lived = (this.t2lifeseed(vid) || {}).lived || [];
        if (lived.some(e => HARD.test(e.kind || ''))) return true;
        const mem = this.t2mem(vid);
        if (mem.some(m => /promise_broken|you_threatened|caught_you_stealing|suspects_you|confronted/i.test(m.t || ''))) return true;
      } catch (e) {}
      return false;
    },
    // t2hardAnchor: the lived event the hard story hangs on, in their words.
    t2hardAnchor(vid) {
      try {
        const lived = (((this.t2lifeseed(vid) || {}).lived) || []).slice().reverse();
        const hard = lived.find(e => /death_of_kin|betrayal|loss|kill|exile|theft_victim|theft_done|death_witnessed|hunger_survived/i.test(e.kind || ''));
        if (hard) {
          const subj = hard.subject ? hard.subject.split(' ')[0] : null;
          const map = {
            death_of_kin: subj ? 'Since ' + subj + ' died' : 'Since the death',
            betrayal: 'Since someone I trusted turned',
            loss: 'Since I lost what I lost',
            kill: 'Since the killing',
            exile: 'Since I was cast out',
            theft_victim: 'Since I was robbed',
            theft_done: 'Since I stole',
            death_witnessed: 'Since I watched someone die',
            hunger_survived: 'Since the hungry days',
          };
          return map[hard.kind] || null;
        }
      } catch (e) {}
      return null;
    },

    // ---------- labels ----------
    // Code-side labels: new topics (work/hopes/hardstory) carry their own
    // labels here instead of the data topicPack, so they're per-topic voiced
    // instead of falling back to a raw id. (The data file isn't this lane.)
    topic2Label(vid, topic) {
      const def = this.t2defs().find(d => d.id === topic);
      if (def && def.labels && def.labels.length) {
        let h = 0;
        try { h = this._hashStr(vid + ':t2:' + topic); } catch (e) {}
        return def.labels[Math.abs(h) % def.labels.length];
      }
      const vs = (this.t2pack().labels || {})[topic] || [topic];
      let h = 0;
      try { h = this._hashStr(vid + ':t2:' + topic); } catch (e) {}
      return vs[Math.abs(h) % vs.length];
    },
    topic2MoreLabel(vid) {
      const c = this.convoGet(vid);
      const def = this.t2defs().find(d => d.id === c.thread);
      if (def && def.moreLabels && def.moreLabels.length) return def.moreLabels[0];
      const vs = (this.t2pack().moreLabels || {})[c.thread] || ['"Tell me more."'];
      let h = 0;
      try { h = this._hashStr(vid + ':t2more:' + (c.thread || '')); } catch (e) {}
      return vs[Math.abs(h) % vs.length];
    },
    topic2AskLabel(vid, topic) {
      return this.topic2Has(topic) ? this.topic2Label(vid, topic) : this.convoLabel(vid, topic);
    },

    // ---------- ask / depth ----------
    topic2Ask(vid, topic) {
      // Open a generated topic. convoAskTopic already pushed askedTopics.
      const c = this.convoGet(vid);
      const gen = this['t2gen_' + topic];
      const cands = gen ? gen.call(this, vid) : [];
      let line = this.t2pick(vid, 't2:' + topic, cands);
      if (!line) {
        const cg = (this.data.characterGen || {}).convo || {};
        return this.convoPickCycle(vid, 'exh', cg.exhausted || ['"I\'ve told you everything I know about that."']);
      }
      line = this.t2fill(line, this.vpOf(vid), vid);
      // The hard story is told ONCE, ever — mark it so the topic vanishes
      // from the menu and the gate never offers it again.
      if (topic === 'hardstory') c.hardstoryTold = true;
      // Change acknowledgment: the same question, a different run.
      c.t2snap = c.t2snap || {};
      const now = this.t2clock(vid);
      const prev = c.t2snap[topic];
      c.t2snap[topic] = now;
      if (prev && prev !== now) line = this.t2fill(this.t2changeLine(), this.vpOf(vid), vid) + ' ' + line;
      c.thread = topic; c.depth = 1;
      return line;
    },
    topic2HasMore(vid) {
      const c = this.convoGet(vid);
      const said = (c.said || {})['t2:' + c.thread] || [];
      return said.length < 4; // opener + 3 follow-ups
    },
    topic2Beat(vid) {
      const c = this.convoGet(vid);
      const t = c.thread;
      const folFn = this['t2fol_' + t];
      const fns = folFn ? folFn.call(this, vid) : [];
      const said = (c.said || {})['t2:' + t] || [];
      const cands = fns[Math.min(Math.max(said.length - 1, 0), fns.length - 1)] || [];
      let line = this.t2pick(vid, 't2:' + t, cands.length ? cands : ['"..."']);
      line = this.t2fill(line, this.vpOf(vid), vid);
      c.depth = (c.depth || 1) + 1;
      return line;
    },

    // ---------- choice construction ----------
    topic2Asks(vid) {
      const c = this.convoGet(vid);
      const asked = c.askedTopics || [];
      const out = [];
      for (const def of this.t2defs()) {
        if (def.id === c.thread) continue;
        if (asked.indexOf(def.id) !== -1) continue;
        if (!this.t2gate(vid, def)) continue;
        out.push({ id: 'ask:' + def.id, label: this.topic2Label(vid, def.id), _t2: def.id });
      }
      // Priority: live events first, then fresh topics, then the rest.
      const said = c.said || {};
      out.sort((a, b) => {
        const pa = a._t2 === 'lately' ? 0 : ((said['t2:' + a._t2] || []).length ? 2 : 1);
        const pb = b._t2 === 'lately' ? 0 : ((said['t2:' + b._t2] || []).length ? 2 : 1);
        return pa - pb;
      });
      return out.map(({ _t2, ...rest }) => rest);
    },
    topic2SubjectOpts(vid) {
      const c = this.convoGet(vid);
      const asked = c.askedTopics || [];
      return this.t2defs()
        .filter(d => d.id !== c.thread && asked.indexOf(d.id) === -1 && this.t2gate(vid, d))
        .map(d => d.id);
    },

    // ---------- the live-event topic ----------
    // 'lately' exists only while the run gives it something to be about.
    t2LatelyEvent(vid) {
      const v = this.state.village;
      const day = (this.state.scholar || {}).day || 0;
      try {
        if ((v.grief || 0) > 0) {
          const corpses = v.corpses || [];
          const recent = corpses[corpses.length - 1];
          const nm = recent ? String(recent.name || recent.vid || '').split(' ')[0] : null;
          return { kind: 'mourning', name: nm };
        }
        const mem = this.t2mem(vid).filter(m => day - (m.day || 0) <= 3);
        const threat = mem.find(m => /threat|attack|monster|treeline/i.test((m.t || '') + ' ' + (m.note || '')));
        if (threat) return { kind: 'threat', note: threat.note };
        const betray = mem.find(m => /promise_broken|caught_you_stealing|suspects_you/i.test(m.t || ''));
        if (betray) return { kind: 'betrayal', mem: betray };
        if (Object.values(v.heat || {}).some(h => h > 0)) return { kind: 'tension' };
        const hungry = (v.roster || []).filter(id => {
          try { return id !== this.villagerId && (this.npcNeeds(id).hunger || 0) > 70; }
          catch (e) { return false; }
        }).length;
        if (hungry > 2) return { kind: 'hunger', n: hungry };
        const good = mem.find(m => /promise_kept|gift|comforted|ally|mediated/i.test(m.t || ''));
        if (good) return { kind: 'gratitude', mem: good };
        if ((v.cheer || 0) > 0) return { kind: 'cheer' };
      } catch (e) {}
      return null;
    },

    // ---------- YOU: what they think of the player ----------
    t2gen_you(vid) {
      const band = this.t2band(vid);
      const mem = this.t2mem(vid);
      const vp = this.vpOf(vid);
      const temp = this.npcTemper(vid);
      const bandLine = {
        wary: '"Honestly? I\'m still making up my mind about you."',
        warming: '"You\'re alright. I think. Ask me again in a week."',
        close: '"You\'re one of the good ones. Don\'t make me regret saying that out loud."',
        devoted: '"You\'re family now. Chosen family — the kind that actually counts."',
      }[band];
      // The most recent significant thing the player did TO them.
      const sig = mem.filter(m => /promise_kept|promise_broken|gift|you_threatened|caught_you_stealing|comforted|ally|mediated|deal|amends/i.test(m.t || '')).pop();
      let memLine = null;
      if (sig) {
        const note = sig.note ? ' "' + sig.note + '"' : '';
        const map = {
          promise_kept: '"You said you\'d help, and you did.' + note + ' That stays with me."',
          promise_broken: '"You promised' + note + ', and it didn\'t happen. I\'m still carrying that."',
          gift: '"You fed me when I was hungry. I don\'t forget things like that."',
          you_threatened: '"You threatened me once.' + note + ' I haven\'t forgotten. But I\'m still here talking to you."',
          caught_you_stealing: '"I know about my pack. Hands where I can see them, next time."',
          comforted: '"You sat with me when I was scared. That meant something."',
          ally: '"You stood up for me.' + note + ' I owe you for that."',
          mediated: '"You stepped between me and a fight.' + note + ' Not many would."',
          amends: '"You apologized.' + note + ' That took something. I respect it."',
        };
        memLine = map[sig.t] || ('"I remember' + note + '. I remember everything, actually."');
      }
      const closer = {
        bold: '"Ask me again in a week. The answer might be better."',
        warm: '"I\'m glad you asked, actually."',
        prickly: '"There. You wanted honest."',
        withdrawn: '"Don\'t make me say it twice."',
        dry: '"Make of that what you will."',
      }[temp] || '"That\'s where we are."';
      const cands = [];
      if (memLine) cands.push(bandLine + ' A beat. ' + memLine);
      cands.push(bandLine + ' ' + closer);
      if (band === 'wary') cands.push('"You want to know what I think of you? Earn a better answer." ' + closer);
      if (band === 'devoted') cands.push('"I\'d follow you out past the treeline. Don\'t tell the others — they\'d want to come too."');
      return cands;
    },
    t2fol_you(vid) {
      const mem = this.t2mem(vid);
      const sig = mem.filter(m => /promise_kept|promise_broken|gift|you_threatened|comforted|ally/i.test(m.t || '')).pop();
      const vp = this.vpOf(vid);
      const f1 = [];
      if (sig && sig.note) {
        f1.push('"About ' + sig.note + ' — here\'s what you didn\'t see. ' +
          (this.t2pers(vp).quirk ? 'I {quirkI}, that\'s just what I do when things matter.' : 'It mattered more than I let on.') + '"');
      }
      f1.push('"Here\'s what it would take, if you want more than this: show up when it costs you something. That\'s the whole test."');
      f1.push('"People here talk. What they say about you when you\'re not at the fire — that\'s the real answer to your question."');
      const f2 = [
        '"I\'ve changed my mind about people before. Usually it takes getting hurt first. You haven\'t hurt me yet."',
        '"A month ago I wouldn\'t have said any of this to you. That\'s not nothing."',
        '"Trust is slow out here. It\'s the one thing the System can\'t grant us."',
      ];
      const f3 = [
        '"What do I want from you? Nothing fancy. Just — be the person you are when nobody\'s watching. Here."',
        '"Stay. That\'s it. People leave. You keep showing up, and that starts to mean something."',
      ];
      return [f1, f2, f3];
    },

    // ---------- FEARS ----------
    t2gen_fears(vid) {
      const vp = this.vpOf(vid);
      const v = this.state.village;
      const cands = [
        '"{Fear}." A pause. "Stupid, maybe. But there it is."',
        '"{Fear}." Said flat, like something rehearsed in the dark.',
        '"Don\'t laugh. {Fear}."',
      ];
      if ((v.grief || 0) > 0) cands.push('"{Fear} — and now losing people. That one isn\'t abstract anymore."');
      const threat = this.t2mem(vid).find(m => /threat|attack|monster/i.test((m.t || '') + ' ' + (m.note || '')));
      if (threat && threat.note) cands.push('"{Fear}. Especially since ' + threat.note + '."');
      if (this.t2band(vid) === 'wary') cands.push('"Why do you want to know what scares me?" A long look. "...{Fear}."');
      return cands;
    },
    t2fol_fears(vid) {
      const vp = this.vpOf(vid);
      const f1 = [
        '"When it gets bad, I {habitI}. It doesn\'t help, exactly. It gives my hands something to do while my head catches up."',
        '"I {habitI} when it gets loud in my head. Everyone\'s got something. That\'s mine."',
        '"{Quirk} — that\'s what I do when the fear gets loud. You\'ve probably noticed."',
      ];
      const f2 = [
        '"It\'s worse since the scattering. Before, {fear} was... theoretical. Now it has a schedule."',
        '"I wasn\'t always like this. {origin} didn\'t prepare me for checking the treeline every night."',
        '"Some fears you outgrow. This one grew up with me."',
      ];
      const f3 = [
        '"If it happened — really happened — I think I\'d {habitI} first, then figure out the rest. That\'s the plan. It\'s a bad plan."',
        '"I try not to think about what I\'d do. Thinking about it feels like inviting it."',
        '"I\'d survive it. I\'ve survived everything else so far, haven\'t I?"',
      ];
      return [f1, f2, f3];
    },

    // ---------- OLD WORLD ----------
    t2gen_oldworld(vid) {
      const small = ['hot showers', 'traffic noise', 'grocery stores', 'rain on a real roof',
        'coffee that didn\'t taste like bark', 'streetlights', 'air conditioning',
        'a bed that didn\'t try to kill my back', 'my phone buzzing', 'ice in a glass'];
      const s = small[Math.floor(Math.random() * small.length)];
      return [
        '"Mornings. I miss mornings — {occ} mornings, {origin} light, the whole day still possible."',
        '"You know what I miss? ' + s + '. Nobody writes songs about ' + s + ', but I\'d trade a week of this for an hour of that."',
        '"{origin} had this smell after rain — concrete and wet leaves. I\'d forgotten it until just now, saying it out loud."',
        '"I miss being bored. Really, properly bored. That was a luxury and I never knew."',
      ];
    },
    t2fol_oldworld(vid) {
      const vp = this.vpOf(vid);
      const f1 = [
        '"What I miss most? ' + ['the food', 'the noise', 'the feeling that tomorrow would look like today'][Math.floor(Math.random() * 3)] + '. The small stuff. It\'s always the small stuff."',
        '"I miss {hope}. Funny — I still hope for it, just... translated."',
      ];
      const f2 = [
        '"What I don\'t miss? Deadlines. Rent. Small talk at parties where nobody listens." A short laugh. "The world ended and my calendar finally cleared."',
        '"I don\'t miss pretending I was busy. Turns out I was just... occupied. There\'s a difference."',
      ];
      const f3 = [
        '"Would I go back, if I could? ...Ask me on a warm day. Today, with the fire going — I\'m not sure."',
        '"Being {an_occ} taught me {skill}. Out here that\'s worth more than everything I left behind."',
      ];
      return [f1, f2, f3];
    },

    // ---------- SKILLS ----------
    t2intelTrait(vp) {
      const intel = ((vp && vp.intelligence) || {}).primary || 'steady';
      return {
        analytical: 'taking things apart to see how they work',
        practical: 'making things work with what\'s actually here',
        social: 'reading people — what they want, what they\'re hiding',
        observant: 'noticing what everyone else walks past',
        creative: 'making something out of nothing',
        steady: 'keeping going when everything says stop',
      }[intel] || 'getting by';
    },
    t2gen_skills(vid) {
      const vp = this.vpOf(vid);
      const taught = ((this.state.village.taught || {})[vid]) || [];
      const cands = [
        '"I was {an_occ}. Which means I\'m good at ' + this.t2intelTrait(vp) + '."',
        '"' + this.t2cap(this.t2intelTrait(vp)) + '. That\'s my thing. Everything else I\'m figuring out like everyone."',
      ];
      if (taught.length) cands.push('"Ask around — I taught ' + taught.length + ' thing' + (taught.length > 1 ? 's' : '') + ' to this village. Knowledge is the one thing that multiplies when you give it away."');
      if (this.t2band(vid) === 'wary') cands.push('"Why — do I look useless to you?" A grin takes the sting out. "I was {an_occ}. I manage."');
      return cands;
    },
    t2fol_skills(vid) {
      const vp = this.vpOf(vid);
      const f1 = [
        '"Learned it in {origin}, mostly. {Occ} work teaches you fast — the kind that doesn\'t wait while you read a manual."',
        '"Nobody taught me. I watched, I failed, I watched closer. That\'s the whole curriculum."',
      ];
      const weak = ['sitting still', 'letting things go', 'asking for help', 'small talk', 'sleeping through the night'];
      const f2 = [
        '"What I\'m bad at? ' + weak[Math.floor(Math.random() * weak.length)] + '. We all get one fatal flaw. That\'s mine."',
        '"I\'m terrible at resting. There\'s always something — the fire, the stores, the watch. Rest feels like stealing."',
      ];
      const f3 = [
        '"Want me to show you sometime? Not now — but sometime. Teaching keeps it sharp."',
        '"If you ever need ' + this.t2intelTrait(vp) + ', come find me. That\'s what I\'m for."',
      ];
      return [f1, f2, f3];
    },

    // ---------- WORK: what they actually do ----------
    t2gen_work(vid) {
      const vp = this.vpOf(vid);
      const intel = ((vp && vp.intelligence) || {}).primary || 'steady';
      const byIntel = {
        analytical: 'figuring things out — the kind of problems that don\'t have manuals',
        practical: 'fixing what breaks, building what doesn\'t exist yet',
        social: 'keeping people from each other\'s throats, mostly',
        observant: 'watching — the treeline, the stores, the moods',
        creative: 'making things we need out of things we have',
        steady: 'the unglamorous stuff. Someone has to.',
      };
      const cands = [
        '"I was {an_occ}, before. Now? ' + this.t2cap(byIntel[intel] || byIntel.steady) + '."',
        '"Officially? Whatever needs doing. Unofficially — ' + (byIntel[intel] || byIntel.steady) + '."',
        '"My days? Work, watch, work. The work changes; the days don\'t."',
      ];
      if (this.t2band(vid) === 'wary') cands.push('"Why — taking attendance?" A tired grin. "I pull my weight. Ask anyone."');
      return cands;
    },
    t2fol_work(vid) {
      const vp = this.vpOf(vid);
      const f1 = [
        '"The hard part? It never ends. You finish one thing and the next one was already waiting."',
        '"The hard part is doing it tired. Everything out here is done tired."',
        '"The hard part isn\'t the work. It\'s watching other people do it wrong and keeping your mouth shut."',
      ];
      const f2 = [
        '"Best part of the day? When something actually works. You forget how good that feels."',
        '"I like the rhythm of it. Hands busy, head quiet. That\'s the closest thing to peace I get."',
      ];
      const f3 = [
        '"Being {an_occ} taught me ' + this.t2intelTrait(vp) + '. Out here that\'s worth more than everything I left behind."',
        '"If you want to learn it, I can show you sometime. Not now — but sometime."',
      ];
      return [f1, f2, f3];
    },

    // ---------- HOPES: what they want, down the road ----------
    t2gen_hopes(vid) {
      const p = this.t2pers(this.vpOf(vid));
      const hope = p.hope || 'something better';
      const cands = [
        '"' + this.t2cap(hope) + '. That\'s the whole answer. Everything else is logistics."',
        '"I want ' + hope + '. Saying it out loud makes it feel less stupid."',
        '"Hope? I ration it. But if you\'re asking — ' + hope + '."',
      ];
      const ls = this.t2lifeseed(vid);
      if (ls && ls.want) cands.push('"What I want? ' + ls.want.charAt(0).toUpperCase() + ls.want.slice(1) + '. That\'s the honest version."');
      if (this.t2band(vid) === 'wary') cands.push('"Hopes are leverage. ...' + this.t2cap(hope) + '. Don\'t make me regret telling you."');
      return cands;
    },
    t2fol_hopes(vid) {
      const p = this.t2pers(this.vpOf(vid));
      const hope = p.hope || 'something better';
      const f1 = [
        '"What would it take? Time. Luck. People not dying. The usual impossible list."',
        '"It takes surviving first. Hope is a luxury good — you have to earn the shelf space."',
      ];
      const f2 = [
        '"Some days I believe it. Some days I just say the words to keep the shape of it."',
        '"I used to hope bigger. Now I hope specific. Specific hurts less when it doesn\'t happen."',
      ];
      const f3 = [
        '"You? What are you hoping for — really?" A pause. "You don\'t have to answer. Just — have an answer."',
        '"Hold onto yours. It\'s the one thing they can\'t take — the System, the winter, all of it."',
      ];
      return [f1, f2, f3];
    },

    // ---------- HARDSTORY: the thing they never talk about ----------
    // THE REVEAL (Steve 2026-10-07): at deep trust, after they've lived
    // something hard, they finally talk about the thing they never talk
    // about — the lifeseed wound, spoken around in their own words,
    // anchored to a lived event. Told ONCE, ever (topic2Ask marks it;
    // t2gate hides the topic after). Never repeated, never farmed.
    t2gen_hardstory(vid) {
      const vp = this.vpOf(vid);
      const first = (this.displayName(vid) || 'they').split(' ')[0];
      let euph = null;
      try {
        const ls = this.t2lifeseed(vid);
        if (ls && ls.wound && typeof this.lifeseedWoundEuphemism === 'function') {
          euph = this.lifeseedWoundEuphemism(ls.wound, first);
        }
      } catch (e) {}
      const anchor = this.t2hardAnchor(vid);
      // COHERENCE (Steve 2026-10-07): the telling is once-only, so its facts
      // go on the record verbatim — the wound as they named it, the lived
      // anchor. Nothing later gets a second, contradictory version.
      try {
        if (euph && typeof this.convoSaidFact === 'function') this.convoSaidFact(vid, 'hardstory:wound', euph);
        if (anchor && typeof this.convoSaidFact === 'function') this.convoSaidFact(vid, 'hardstory:anchor', anchor);
      } catch (e) {}
      const about = euph ? 'about ' + euph : 'about the thing I don\'t talk about';
      const cands = [
        '"I\'ve never told anyone this." A long pause. "' + (anchor ? anchor + ' — and ' : '') + 'I don\'t talk ' + about + '. I\'m talking about it now, and I don\'t know why."',
        '"' + (anchor ? anchor + '. ' : '') + 'That\'s when it got quiet in me. I don\'t talk ' + about + ' — you know I don\'t talk ' + about + '. There. It\'s said."',
      ];
      if (anchor) cands.push('"' + anchor + '. You asked for the hardest thing — that\'s the door I don\'t open. I\'m opening it. Once."');
      return cands;
    },
    t2fol_hardstory(vid) {
      const f1 = [
        '"Don\'t — don\'t look at me like that. I\'m fine. I just needed it said once."',
        '"That\'s all of it. There isn\'t a second part. There\'s just... the rest of my life, with it in it."',
      ];
      const f2 = [
        '"It changed how I am. I {habitI} when it gets loud in my head. That\'s the scar tissue."',
        '"I\'m not the person I was before it. I keep meeting that person in my head, and they don\'t recognize me."',
      ];
      const f3 = [
        '"Thank you for hearing it. I won\'t say it again — once was enough. Once was everything."',
        '"Don\'t bring it up again. Not because I\'m angry — because it\'s done. It\'s out. Let it be out."',
      ];
      return [f1, f2, f3];
    },

    // ---------- OTHERS: who's on their mind ----------
    t2pickOther(vid) {
      const v = this.state.village;
      const roster = (v.roster || []).filter(id => id !== vid && id !== this.villagerId);
      if (!roster.length) return null;
      try {
        const cf = (v.conflicts || []).find(x => !x.resolved && (x.a === vid || x.b === vid));
        if (cf) {
          const oid = cf.a === vid ? cf.b : cf.a;
          if (roster.indexOf(oid) !== -1) return { id: oid, why: 'grievance', hist: cf.history };
        }
      } catch (e) {}
      try {
        const groups = v.groups || [];
        for (const g of groups) {
          const mates = (g.members || []).filter(id => id !== vid && roster.indexOf(id) !== -1);
          if (mates.length) return { id: mates[Math.floor(Math.random() * mates.length)], why: 'close' };
        }
      } catch (e) {}
      return { id: roster[Math.floor(Math.random() * roster.length)], why: 'neutral' };
    },
    t2gen_others(vid) {
      const pick = this.t2pickOther(vid);
      if (!pick) return ['"It\'s just us, really. The others are... elsewhere."'];
      const c = this.convoGet(vid);
      c.t2other = pick.id;
      let nm = pick.id;
      try { nm = this.displayName(pick.id).split(' ')[0]; } catch (e) {}
      const vp = this.vpOf(vid);
      const temp = this.npcTemper(vid);
      if (pick.why === 'grievance') {
        // COHERENCE (Steve 2026-10-07): the grievance story doesn't
        // reshuffle between conversations — once they've told you what the
        // history IS, the record holds it and later talk extends the same
        // thread instead of inventing a new past.
        let hist = (pick.hist || ['old history'])[0];
        try {
          const rec = (typeof this.convoFactRecalled === 'function') ? this.convoFactRecalled(vid, 'otherhist:' + pick.id) : null;
          if (rec) hist = rec;
          else if (typeof this.convoSaidFact === 'function') this.convoSaidFact(vid, 'otherhist:' + pick.id, hist);
        } catch (e) {}
        return [
          '"' + nm + '?" A muscle moves in their jaw. "' + hist + '"',
          '"' + nm + '. We don\'t... it\'s old. Older than the scattering, even. Some things you carry so long they grow into you."',
          temp === 'bold' ? '"' + nm + ' and I have history. I\'ll leave it at that — unless you want the version with names.' : '"' + nm + '? I\'d rather not. Some doors stay closed."',
        ];
      }
      if (pick.why === 'close') {
        // On the record: the trust claim, so nothing later contradicts it.
        try { if (typeof this.convoSaidFact === 'function') this.convoSaidFact(vid, 'othertrust:' + pick.id, 'pack'); } catch (e) {}
        return [
          '"' + nm + '? I\'d trust ' + nm + ' with my pack. That\'s the highest compliment I have."',
          '"' + nm + ' keeps me sane. Everyone needs one person who\'d notice if they stopped showing up."',
        ];
      }
      return [
        '"' + nm + ' keeps to themselves. Can\'t tell if that\'s wisdom or just tired."',
        '"' + nm + '? Still figuring that one out. We\'re all still figuring each other out, aren\'t we?"',
      ];
    },
    t2fol_others(vid) {
      const c = this.convoGet(vid);
      const oid = c.t2other;
      let nm = oid || 'them';
      try { if (oid) nm = this.displayName(oid).split(' ')[0]; } catch (e) {}
      const ovp = oid ? this.vpOf(oid) : {};
      const oocc = (ovp && ovp.formerOccupation) || 'survivor';
      const f1 = oid ? [
        '"' + nm + ' was ' + (/^[aeiou]/i.test(oocc) ? 'an ' : 'a ') + oocc.toLowerCase() + ', before. You can still see it — the way they handle things."',
        '"Here\'s a story: ' + nm + ' once ' + ['shared food without being asked', 'stayed up all night on watch so someone else could sleep', 'talked someone down from leaving'][Math.floor(Math.random() * 3)] + '. That\'s who ' + nm + ' is, when it counts."',
      ] : ['"There\'s not much more to say. People are complicated; that\'s the whole story."'];
      const f2 = [
        '"Has it changed? Everything changes. Ask me again after the next hard week."',
        '"I used to think worse of ' + nm + '. The scattering has a way of... editing people. Mostly for the better. Mostly."',
      ];
      const f3 = [
        '"If you\'re going to deal with ' + nm + ' — be direct. Nothing sideways. ' + nm + ' smells sideways a mile off."',
        '"My advice? Give ' + nm + ' time. We\'re all still becoming whoever we are now."',
      ];
      return [f1, f2, f3];
    },

    // ---------- SYSTEMTAKE ----------
    t2gen_systemtake(vid) {
      const vp = this.vpOf(vid);
      const intel = ((vp && vp.intelligence) || {}).primary || 'steady';
      const temp = this.npcTemper(vid);
      const byIntel = {
        analytical: '"It didn\'t give us food, water, or shelter. It gave us an audience. Draw your own conclusions."',
        practical: '"I don\'t care what it IS. I care what it DOES. So far: mostly watches."',
        social: '"It likes us, I think. That\'s what worries me — ever been liked by something that could swat you?"',
        observant: '"It watches the same way I do. Noticing. I don\'t know what it does with what it notices."',
        creative: '"It\'s making something out of us. I just can\'t tell if we\'re the clay or the audience."',
        steady: '"It\'s here. We\'re here. I deal with what\'s in front of me."',
      };
      const cands = [byIntel[intel] || byIntel.steady];
      if (temp === 'prickly') cands.push('"The System? It forgot food. I don\'t trust anything that forgets food."');
      if (temp === 'warm') cands.push('"It\'s trying, I think. In the way a cat tries to help you type. Genuine. Useless. Sweet."');
      if (this.state.systemArrived && (this.state.scholar || {}).day > 30) cands.push('"A month in and I still don\'t know if it\'s a god, a zookeeper, or a tourist. Maybe all three."');
      return cands;
    },
    t2fol_systemtake(vid) {
      const f1 = [
        '"If I could ask it one thing? Why us. Why here. Why like THIS."',
        '"I\'d ask it what it wants to happen. Not what it says — what it actually wants, underneath."',
        '"I\'d ask if it\'s lonely. That\'s a stupid question. I\'d ask it anyway."',
      ];
      const f2 = [
        '"Do I trust it? I trust it the way I trust weather. It\'s real, it\'s powerful, and it doesn\'t care about my plans."',
        '"Trust is the wrong word. It\'s like trusting the tide. You don\'t — you learn to swim."',
        '"It gave us powers and forgot food. I don\'t know what that means, but I know what it tells me."',
      ];
      const f3 = [
        '"It\'s changed me. I catch myself performing — for it, for the audience. Then I feel sick about it."',
        '"Has it changed me? I talk to the sky now. So yes. Probably yes."',
      ];
      return [f1, f2, f3];
    },

    // ---------- ADVICE: contextual wisdom ----------
    t2gen_advice(vid) {
      const v = this.state.village;
      const vp = this.vpOf(vid);
      const intel = ((vp && vp.intelligence) || {}).primary || 'steady';
      const cands = [];
      try {
        const hungry = (v.roster || []).filter(id => {
          try { return id !== this.villagerId && (this.npcNeeds(id).hunger || 0) > 70; }
          catch (e) { return false; }
        }).length;
        if (hungry > 2) cands.push('"Eat before you\'re hungry. The body lies about it until it\'s too late — and right now, too late is close."');
      } catch (e) {}
      if ((v.grief || 0) > 0) cands.push('"Grief makes you stupid the way hunger does. Don\'t make big decisions this week. Just... don\'t."');
      const byIntel = {
        analytical: '"Learn one thing all the way down. Not ten things shallow — one thing deep. Depth is what saves you."',
        practical: '"Fix what\'s in front of you. The big problems solve themselves once the small ones stop bleeding."',
        social: '"Remember who did what for whom. Out here, that ledger is worth more than any skill."',
        observant: '"Watch the treeline at dusk. Not because something\'s there — because noticing is a muscle."',
        creative: '"Make something useless beautiful. It reminds you you\'re a person, not just a stomach."',
        steady: '"Keep going. That\'s the whole advice. Keep going."',
      };
      cands.push(byIntel[intel] || byIntel.steady);
      cands.push('"Sleep before you\'re tired. Drink before you\'re thirsty. The body\'s warning system was built for a safer world."');
      return cands;
    },
    t2fol_advice(vid) {
      const mistakes = ['trusted too fast, once', 'ate something I shouldn\'t have', 'didn\'t say the thing when I had the chance',
        'tried to carry everything myself', 'assumed tomorrow would be like today'];
      const m = mistakes[Math.floor(Math.random() * mistakes.length)];
      const f1 = [
        '"My biggest mistake? I ' + m + '. Cost me. Still paying, some days."',
        '"I ' + m + '. Don\'t. Whatever it costs you to not do that — pay it."',
      ];
      const f2 = [
        '"What would I do differently? Everything slower. I rushed the beginning and I\'m still catching up."',
        '"I\'d ask for help sooner. Pride is expensive out here."',
      ];
      const f3 = [
        '"The real advice? Be useful. Not impressive — useful. Impressive fades by dinner."',
        '"And this: learn people\'s names. All of them. It\'s the cheapest thing you can give and the dearest."',
      ];
      return [f1, f2, f3];
    },

    // ---------- LOVED: someone waiting ----------
    t2gen_loved(vid) {
      const vp = this.vpOf(vid);
      const p = this.t2pers(vp);
      const grief = (this.state.village.grief || 0) > 0;
      // The name comes from their lifeseed — a real person from their life,
      // never an invented name (Steve 2026-10-07 coherence fix).
      const seedName = this.t2seedName(vid);
      const cands = [
        '"There was someone. There\'s always someone, isn\'t there?" A small, private smile.',
        '"I tell myself ' + (p.hope || 'we\'ll find each other') + '. Some days I even believe it."',
      ];
      if (grief) cands.push('"After this week — losing people — I don\'t know. I hope they\'re somewhere warm. That\'s all I\'ve got."');
      if (seedName && this.t2trust(vid) >= 60) cands.push('"Their name was ' + seedName + '. I haven\'t said that out loud in months."');
      if (this.t2trust(vid) >= 75 && seedName) cands.push('"' + seedName + '. If you ever meet them — tell them I kept the fire going."');
      return cands;
    },
    t2fol_loved(vid) {
      const f1 = [
        '"If I saw them tomorrow? I wouldn\'t even speak at first. I\'d just... check. Hands, face. Make sure they\'re real."',
        '"I rehearse it, you know. What I\'d say. It\'s never the right words. It never needs to be."',
        '"I\'d know them anywhere. Even changed, even older. Some people you don\'t see with your eyes."',
      ];
      const f2 = [
        '"Do I think they\'re alive? ...I have to. The alternative doesn\'t leave room for anything else."',
        '"Some nights I\'m sure. Some nights I do the math and it doesn\'t work. I choose the sure nights."',
        '"Alive? I don\'t know. Hoping? Every day. Those are different questions and I answer them differently."',
      ];
      const vp = this.vpOf(vid);
      const f3 = [
        '"I {habitI} when I think about them. It\'s not much of a ritual, but it\'s mine."',
        '"{hope} — that\'s what I hold. It\'s thin, some days. But it holds."',
      ];
      return [f1, f2, f3];
    },

    // ---------- LATELY: the run, right now ----------
    t2gen_lately(vid) {
      const ev = this.t2LatelyEvent(vid);
      if (!ev) return [];
      const vp = this.vpOf(vid);
      switch (ev.kind) {
        case 'mourning':
          return ev.name
            ? ['"Since ' + ev.name + ' died... I keep expecting to see ' + ev.name + ' at the fire. Stupid."',
               '"' + ev.name + ' is gone and the world just... continues. That\'s the part I can\'t stand."']
            : ['"We lost someone. I keep setting out an extra portion. Stupid."',
               '"Grief doesn\'t schedule itself. It just shows up at dinner."'];
        case 'threat':
          return ['"That thing — ' + (ev.note || 'by the treeline') + '. I keep seeing it when I blink."',
            '"I don\'t scare easy. I\'m scared. There. I said it out loud."'];
        case 'betrayal': {
          const aboutPlayer = /promise_broken|caught_you_stealing|suspects_you/i.test((ev.mem && ev.mem.t) || '');
          return aboutPlayer
            ? ['"Someone broke a promise to me. I\'m looking at them." A pointed pause. "You know what you did."',
               '"Trust is a currency, and I\'m feeling poor right now. Your move."']
            : ['"Someone here broke their word. I won\'t say who. But the fire feels colder."'];
        }
        case 'tension':
          return ['"Everyone\'s choosing sides and pretending they aren\'t. I hate it."',
            '"You feel that? The air before a storm. That\'s the village right now."'];
        case 'hunger':
          return ['"My stomach\'s been talking louder than me lately. ' + (ev.n || 'Several') + ' of us are running on empty."',
            '"Hunger makes people strange. Watch for it — in me, too."'];
        case 'gratitude':
          return ['"Someone helped me recently. I\'m still turning it over — people don\'t do that for nothing, out here. Or maybe they do now."'];
        case 'cheer':
          return ['"Something good happened. I almost don\'t trust it. When did I get like this?"'];
        default:
          return [];
      }
    },
    t2fol_lately(vid) {
      const ev = this.t2LatelyEvent(vid);
      const kind = ev ? ev.kind : 'none';
      const cope = {
        mourning: ['"I {habitI}. It doesn\'t bring anyone back. It just keeps my hands from shaking."',
          '"I keep busy. Grief hates an idle pair of hands — I learned that fast."'],
        threat: ['"I sleep with my boots on now. That\'s where we are."',
          '"I check the treeline every hour. It\'s probably nothing. Probably."'],
        betrayal: ['"I\'m watching. That\'s what I do now — I watch."'],
        tension: ['"I stay out of it. Mostly. It\'s getting harder."',
          '"I talk to both sides and agree with neither. It\'s exhausting."'],
        hunger: ['"Small meals. Slow. Pretend it\'s a choice."',
          '"I chew longer. Tricks the stomach, a little. A little is something."'],
        gratitude: ['"I\'ll pay it forward. That\'s the only math that works."'],
        cheer: ['"I\'m letting myself feel it. That\'s new."'],
        none: ['"Ask me tomorrow. Everything changes by tomorrow."'],
      };
      const next = {
        mourning: ['"We bury, we grieve, we keep going. There\'s no step four."',
          '"Someone should say something proper. I might. I\'m still finding the words."'],
        threat: ['"We set a better watch. We always say that. This time we mean it."',
          '"Nobody goes out alone. That\'s the rule now — I don\'t care who complains."'],
        betrayal: ['"Either it gets talked out or it festers. I know which one I\'d bet on."'],
        tension: ['"Someone has to say the thing nobody\'s saying. Probably won\'t be me."',
          '"It\'ll break or it won\'t. I\'m done trying to hold it together with my hands."'],
        hunger: ['"We need food. Everything else is decoration until that\'s solved."',
          '"Eat the ugly roots first. Save the good stuff for when it gets worse."'],
        gratitude: ['"Maybe we\'re becoming something. Something that helps."'],
        cheer: ['"More of this. Whatever this was — more."'],
        none: ['"Same as always: we endure."'],
      };
      const part = {
        mourning: ['"My part? I remember them. Someone has to do it properly."'],
        threat: ['"I take the watch nobody wants. It\'s the least useless thing I can do."'],
        betrayal: ['"I keep my word. Someone around here has to."'],
        tension: ['"I talk to both sides. It hasn\'t exploded yet."'],
        hunger: ['"I share what I have. It isn\'t much. It\'s something."'],
        gratitude: ['"I say thank you like I mean it. Because I do."'],
        cheer: ['"I laugh. Out loud. It startles people."'],
        none: ['"I show up. That\'s my part."'],
      };
      return [cope[kind] || cope.none, next[kind] || next.none, part[kind] || part.none];
    },
  };

  Object.assign(Game, methods);
})();
