// ============ PEOPLE JOURNAL ============
// Facts about people fill in as you learn them. Pre-System it's your
// handwritten field journal — uncertain, personal ("I think she's a nurse?").
// Post-System the Codex gets precise and invasive.
//
// Learning paths: talking to them, hearing about them, observing what they
// do, being introduced. Every new fact gives a little "noted" reward.
// Per-run persistent (lives in state.codex, saved with the run).
//
// Self-attaching module: wraps existing Game methods, no game.js edits.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const day = () => (Game.state.scholar || {}).day || 0;

  const methods = {

    // journalPerson: get (or create) someone's entry.
    journalPerson(vid) {
      const cx = Game.state.codex;
      cx.people = cx.people || {};
      if (!cx.people[vid]) {
        cx.people[vid] = {
          vid, metDay: day(), name: null, occupation: null, goal: null,
          languages: [], backstory: [], traits: [], promises: [], notes: [],
        };
      }
      return cx.people[vid];
    },

    // journalLearn: record a fact. Returns true only when it's genuinely new
    // (or more certain) — that's when the "noted" feedback fires.
    // field: name|occupation|goal|language|backstory|trait|promise|note
    journalLearn(vid, field, value, opts) {
      opts = opts || {};
      const e = this.journalPerson(vid);
      const sys = !!Game.state.systemArrived;
      let isNew = false, label = '';

      const noted = (msg) => {
        // Rewarding, not spammy: only for genuinely new facts.
        this.say(`📓 ${this.journalName()}: ${msg}`);
      };

      if (field === 'name') {
        if (!e.name) {
          e.name = { value, how: opts.how || 'told', day: day() };
          isNew = true; label = `learned ${value}'s name`;
        }
      } else if (field === 'occupation') {
        if (!e.occupation || (!e.occupation.sure && opts.sure)) {
          const was = e.occupation && e.occupation.value;
          e.occupation = { value, sure: !!opts.sure, day: day() };
          isNew = !was || was !== value || (!e.occupation.sure && opts.sure);
          label = opts.sure ? `learned what ${e.name ? e.name.value : 'they'} does` : `a guess about what they do`;
        }
      } else if (field === 'goal') {
        const gid = value && value.id ? value.id : value;
        const want = value && value.want ? value.want : Game.goalWant(vid);
        if (!e.goal || e.goal.id !== gid) {
          e.goal = { id: gid, want, day: day() };
          isNew = true; label = `learned what they want`;
        }
      } else if (field === 'language') {
        if (!e.languages.find(l => l.id === value.id)) {
          e.languages.push({ id: value.id, label: value.label, day: day() });
          isNew = true; label = `noted a language they speak`;
        }
      } else if (field === 'backstory' || field === 'trait' || field === 'note') {
        const arr = e[field === 'note' ? 'notes' : field];
        if (!arr.find(x => x.text === value)) {
          arr.push({ text: value, day: day(), via: opts.via || 'talk', sure: opts.sure !== false });
          if (arr.length > 12) arr.shift();
          isNew = true;
          label = field === 'trait' ? `noticed something about them` : `jotted down what they said`;
        }
      } else if (field === 'promise') {
        const ex = e.promises.find(p => p.text === value.text);
        if (!ex) {
          e.promises.push({ text: value.text, status: 'open', day: day() });
          isNew = true; label = `a promise you made`;
        } else if (value.status && ex.status !== value.status) {
          ex.status = value.status;
          isNew = true; label = value.status === 'kept' ? `a promise you kept` : `a promise you broke`;
        }
      }

      if (isNew && !opts.quiet) {
        const who = e.name ? e.name.value : Game.personDescriptor(vid);
        noted(sys ? `${who} — ${label}. Filed.` : `${label} (${who}).`);
      }
      return isNew;
    },

    // peopleJournal: entries for the Codex screen, met-order.
    peopleJournal() {
      const cx = Game.state.codex || {};
      const v = Game.state.village || {};
      const roster = (v.roster || []).filter(id => id !== Game.villagerId);
      return roster.map(vid => {
        const e = this.journalPerson(vid);
        return { vid, e };
      }).sort((a, b) => (a.e.metDay || 0) - (b.e.metDay || 0));
    },

    // journalTraitWord: temperament in plain observed language.
    journalTraitWord(vid) {
      const t = Game.npcTemper(vid);
      return {
        bold: 'Takes charge. Doesn\'t wait to be asked.',
        cautious: 'Careful. Thinks before moving.',
        warm: 'Kind without trying. People lean toward them.',
        prickly: 'Sharp edges. Don\'t take it personally — probably.',
        steady: 'Solid. The kind you want nearby when things go wrong.',
        restless: 'Can\'t sit still. Always moving, always doing.',
        dry: 'Funny in a way that takes a second to land.',
        gentle: 'Soft-spoken. Listens more than talks.',
        intense: 'Burns bright. A lot, all at once.',
        withdrawn: 'Keeps to themselves. Hard to read.',
      }[t] || null;
    },
  };

  Object.assign(Game, methods);

  // ---- learning hooks: wrap, don't edit ----

  // 1. Names — told, overheard, or gestured.
  const origReveal = Game.revealName;
  Game.revealName = function (vid, how) {
    const r = origReveal.call(this, vid, how);
    if (r) {
      const vp = (this.data.villagers || []).find(x => x.id === vid)
        || (this.data.background_survivors || []).find(x => x.id === vid) || {};
      const first = (vp.name || 'Someone').split(' ')[0];
      const howText = how === 'overheard' ? 'overheard by the fire' : how === 'gesture' ? 'exchanged in gestures' : 'they told me';
      this.journalLearn(vid, 'name', first, { how: howText });
    }
    return r;
  };

  // 2. Goals & past — from real conversation.
  const origAskTopic = Game.convoAskTopic;
  if (origAskTopic) Game.convoAskTopic = function (vid, topic) {
    const line = origAskTopic.call(this, vid, topic);
    try {
      if (topic === 'goal') {
        const gid = this.npcGoal(vid);
        const gdef = (this.data.characterGen.goals || []).find(g => g.id === gid);
        if (gdef) this.journalLearn(vid, 'goal', { id: gid, want: gdef.want }, {});
      } else if (topic === 'past') {
        const vp = (this.data.villagers || []).find(x => x.id === vid)
          || (this.data.background_survivors || []).find(x => x.id === vid) || {};
        if (vp.formerOccupation) this.journalLearn(vid, 'occupation', vp.formerOccupation, { sure: true, via: 'talk' });
        if (vp.homeRegion) this.journalLearn(vid, 'backstory', `From ${vp.homeRegion}.`, { via: 'talk' });
      }
    } catch (e) {}
    return line;
  };

  // 3. Legacy askAbout path (same facts, deduped by journalLearn).
  const origAskAbout = Game.askAbout;
  if (origAskAbout) Game.askAbout = function (vid, topic) {
    const r = origAskAbout.call(this, vid, topic);
    try {
      if (r && r.ok && topic === 'goal') {
        const gid = this.npcGoal(vid);
        const gdef = (this.data.characterGen.goals || []).find(g => g.id === gid);
        if (gdef) this.journalLearn(vid, 'goal', { id: gid, want: gdef.want }, { quiet: true });
      }
    } catch (e) {}
    return r;
  };

  // 4. Languages — discovered in that first conversation.
  const origStartConvo = Game.startConvo;
  if (origStartConvo) Game.startConvo = function (vid) {
    const v = this.state.village;
    const firstMet = !(v.met || {})[vid];
    const st = origStartConvo.call(this, vid);
    try {
      if (firstMet && st) {
        const comm = this.commLevel(vid);
        const defs = (this.data.characterGen || {}).languages || [];
        if (comm.level === 'none') {
          this.journalLearn(vid, 'language', { id: '__none', label: 'no shared words — gestures only' }, { quiet: true });
        } else if (comm.lang) {
          const d = defs.find(l => l.id === comm.lang);
          this.journalLearn(vid, 'language', { id: comm.lang, label: d ? `${d.icon} ${d.name}` : comm.lang }, { quiet: true });
        }
        // After a couple of real talks, temperament shows through.
        const c = this.convoGet(vid);
        if (c.count >= 2) {
          const w = this.journalTraitWord(vid);
          if (w) this.journalLearn(vid, 'trait', w, { via: 'observed', sure: false, quiet: true });
        }
      }
    } catch (e) {}
    return st;
  };

  // 5. Promises — made, kept, broken.
  const origPromise = Game.promiseHelp;
  if (origPromise) Game.promiseHelp = function (vid) {
    const r = origPromise.call(this, vid);
    try {
      if (r) {
        const want = this.goalWant(vid) || 'something';
        this.journalLearn(vid, 'promise', { text: `Help them ${want}` }, {});
      }
    } catch (e) {}
    return r;
  };

  const origCheckPromises = Game.checkPromises;
  if (origCheckPromises) Game.checkPromises = function (kind) {
    const before = {};
    for (const [vid, p] of Object.entries((this.state.village.promises || {}))) before[vid] = p.kept;
    const r = origCheckPromises.call(this, kind);
    try {
      for (const [vid, p] of Object.entries((this.state.village.promises || {}))) {
        if (before[vid] !== p.kept) {
          const want = this.goalWant(vid) || 'something';
          this.journalLearn(vid, 'promise',
            { text: `Help them ${want}`, status: p.kept === true ? 'kept' : 'broken' }, {});
        }
      }
    } catch (e) {}
    return r;
  };

  // 6. Observed deeds — what they DO goes in the book, not just what they say.
  // Mining the village memory: gifts, rescues, teaching.
  const origEndDay = Game.endDay;
  if (origEndDay) Game.endDay = function () {
    const r = origEndDay.call(this);
    try {
      const mem = (this.state.village.memory || {});
      for (const [vid, ms] of Object.entries(mem)) {
        for (const m of ms.slice(-4)) {
          if (m.journaled) continue;
          m.journaled = true;
          if (m.t === 'gift') this.journalLearn(vid, 'trait', 'Generous — shares without being asked.', { via: 'observed', sure: true, quiet: true });
          else if (m.t === 'saved') this.journalLearn(vid, 'trait', 'Brave — stepped in when it mattered.', { via: 'observed', sure: true, quiet: true });
          else if (m.t === 'taught') this.journalLearn(vid, 'note', `Taught me something: ${m.note || 'a skill'}.`, { via: 'observed', quiet: true });
        }
      }
    } catch (e) {}
    return r;
  };
})();
