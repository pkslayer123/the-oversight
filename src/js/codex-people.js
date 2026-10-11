// @ontology
// system: codex-people
// description: Every villager is a living codex entry. Deepens while they live.
// provides:
//   - checkPersonLevel(vid)
//   - personDepth(vid)
//   - personFirst(vid)
//   - theirViewOfYou(vid)
//   - noteSharedHistory(vid, text)
//   - closePersonBook(vid)
//   - codexPersonTick()
//   - confirmField(vid, field)
//   - ensurePersonLifeseed(vid)
//   - posthumousReveal(vid)
//   - revealForLevel(vid)
//   - personDepthHTML(vid)
// rules:
//   - (none documented)
// consumes:
//   - village.villagers
//   - state.codex.people
// ============ CODEX PEOPLE ENTRIES ============
// Every villager is a living codex entry. It deepens while they live and
// closes when they die. "Dead is the end of their story."
//
// DEPTH (biography ladder — knowing a name is only the start):
//   0 stranger — descriptor only ("the woman in her 30s, the nurse")
//   1 named    — learned through talking or hearing them spoken about
//   2 known    — background via conversation (hometown, skill origins)
//   3 trusted  — trust + time + shared talk: the deep cuts (wound, want, the year everything changed)
//   4 confirmed— detective layer: things you VERIFIED, not just heard
// LEGEND is not a level — it's the deeds section, fed by the achievement system.
//
// SAID vs KNOWN: the codex distinguishes "they said" from "you know".
// Confirmations come from confessions and resolved doubts — the detective
// game's payoff, visible in the entry.
//
// BREADTH: the entry also holds relationship — how they see YOU (repWords),
// your shared history, and their contest standing once the show runs.
//
// DEATH closes the book: no more deepening, past tense, death recorded.
// A rare posthumous revelation can surface on examining the body —
// the letter in the pocket, the lie finally explained. Never cheap.
//
// The codex only ever reveals what's in their lifeseed. It unlocks; it never
// invents. (Background survivors get a lifeseed generated lazily.)
//
// Self-attaching module: wraps journalLearn, endConvo, endDay, resolveDoubt,
// recordDeed, registerDeath, examineCorpse, defendAlibi, approachWeakest.
// No game.js edits. UI: personDepthHTML(vid) — one hunk in app.js peopleSection.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;

  const day = () => (Game.state.scholar || {}).day || 0;
  const sys = () => !!Game.state.systemArrived;

  const CHAPTERS = {
    0: 'Stranger', 1: 'Named', 2: 'Known', 3: 'Trusted', 4: 'Confirmed',
  };

  const methods = {

    // ---------- entry ----------

    // personDepth: get (or create) the depth record on a journal entry.
    personDepth(vid) {
      const e = this.journalPerson(vid);
      if (!e.depth) {
        e.depth = {
          level: 0, levelDay: {}, convos: 0, facts: 0,
          revealed: {}, confirmed: {}, deeds: [], shared: [],
          closed: false, death: null, posthumous: null,
        };
      }
      return e.depth;
    },

    // ensurePersonLifeseed: generated cast has lifeseeds; background
    // survivors get one lazily so the codex has depth to unlock.
    ensurePersonLifeseed(vid) {
      const rc = ((this.state.village || {}).rosterChars || {})[vid];
      if (rc && rc.lifeseed) return rc.lifeseed;
      const person = this.getPerson(vid);
      const name = (rc && rc.name) || (person && person.name) || 'someone';
      const home = ((this.state.village || {}).bgHome || {})[vid] || 'America';
      try {
        const ls = this.genLifeseed({ name, homeRegion: home, originTags: [home] });
        if (rc) rc.lifeseed = ls;
        return ls;
      } catch (e) { return null; }
    },

    personFirst(vid) {
      try {
        const e = this.journalPerson(vid);
        if (e.name && e.name.value) return String(e.name.value).split(' ')[0];
      } catch (e) {}
      try { return this.firstRef(vid); } catch (e) {}
      return 'them';
    },

    // ---------- level-ups ----------

    // checkPersonLevel: evaluate gates after any learning event.
    // Dead is the end of the story: closed books never deepen.
    checkPersonLevel(vid) {
      const d = this.personDepth(vid);
      if (d.closed) return d.level;
      const e = this.journalPerson(vid);
      const first = this.personFirst(vid);
      const setLevel = (lvl, line) => {
        if (d.level >= lvl) return;
        d.level = lvl;
        d.levelDay[lvl] = day();
        if (line) this.say(sys()
          ? `📖 CODEX · ${first}: ${line}`
          : `📖 ${line} (${first}).`);
        if (lvl >= 2) this.revealForLevel(vid, lvl);
      };
      if (e.name && e.name.value) setLevel(1, null);
      if (d.level >= 1 && d.facts >= 3) setLevel(2, `${first} is becoming a person to you, not just a face`);
      const trust = ((this.state.village || {}).trust || {})[vid] || 0;
      if (d.level >= 2 && trust >= 55 && d.convos >= 4 && (day() - (d.levelDay[2] || 0)) >= 3)
        setLevel(3, `${first} trusts you with the deep cuts now`);
      if (d.level >= 3 && Object.keys(d.confirmed || {}).length >= 1)
        setLevel(4, `you know ${first} now — not what they say, what IS`);
      return d.level;
    },

    // revealForLevel: surface lifeseed content through the journal (so the
    // existing codex UI renders it). via 'confided' — they told you. The
    // codex unlocks; it never invents.
    revealForLevel(vid, lvl) {
      const d = this.personDepth(vid);
      if (d.closed) return;
      const ls = this.ensurePersonLifeseed(vid);
      if (!ls) return;
      const rev = d.revealed;
      const learn = (field, text) => {
        try { this.journalLearn(vid, 'backstory', text, { via: 'confided', sure: true, quiet: true }); } catch (e) {}
      };
      if (lvl >= 2) {
        if (!rev.hometown && ls.hometown) {
          rev.hometown = true;
          learn('hometown', `Grew up in ${ls.hometown}, ${ls.regionLand || ls.regionLabel || 'far from here'}.`);
        }
        if (!rev.skill0) {
          const so = Object.entries(ls.skillOrigins || {})[0];
          if (so) {
            rev.skill0 = true;
            const skName = { food: 'finding food', medicinal: 'patching people up', mending: 'fixing things', navigation: 'never getting lost', tracking: 'reading ground', trapping: 'traps', forecast: 'reading the sky' }[so[0]] || so[0];
            learn('skill0', `Learned ${skName} ${String(so[1]).charAt(0).toLowerCase() + String(so[1]).slice(1)}`);
          }
        }
      }
      if (lvl >= 3) {
        if (!rev.event && ls.event) {
          rev.event = true;
          const ev = String(ls.event);
          learn('event', `${ev.charAt(0).toUpperCase() + ev.slice(1)} — that's the year everything changed, before the sky did.`);
        }
        if (!rev.wound && ls.wound) {
          rev.wound = true;
          learn('wound', `The thing they don't talk about: ${ls.wound}`);
        }
        if (!rev.want && ls.want) {
          rev.want = true;
          learn('want', `What they want now is simple: ${ls.want}`);
        }
        if (!rev.kin0 && (ls.people || [])[0]) {
          rev.kin0 = true;
          const p = ls.people[0];
          learn('kin0', `${p.name.split(' ')[0]} — ${p.relation} — ${p.fate}.`);
        }
        if (!rev.kin1 && (ls.people || [])[1]) {
          rev.kin1 = true;
          const p = ls.people[1];
          learn('kin1', `And ${p.name.split(' ')[0]}, ${p.relation}: ${p.fate}.`);
        }
      }
    },

    // ---------- confirmation: "they said" vs "you know" ----------

    // confirmField: a claim became knowledge. The detective game's payoff.
    confirmField(vid, field, text) {
      const d = this.personDepth(vid);
      if (d.closed || d.confirmed[field]) return false;
      d.confirmed[field] = { text: text || field, day: day() };
      const first = this.personFirst(vid);
      this.say(sys()
        ? `📖 CODEX · ${first}: confirmed — ${text || field}. Not "they said". Known.`
        : `📖 Confirmed about ${first}: ${text || field}. That's not gossip anymore.`);
      this.checkPersonLevel(vid);
      return true;
    },

    // ---------- shared history & their view ----------

    // noteSharedHistory: something you lived through together. Called by
    // systems (moot witnesses, flipped accomplices, rescues).
    noteSharedHistory(vid, text) {
      const d = this.personDepth(vid);
      if (d.closed) return false;
      if (d.shared.some(s => s.text === text)) return false;
      d.shared.push({ text, day: day() });
      return true;
    },

    // theirViewOfYou: reputation words — how they see you, through their lens.
    theirViewOfYou(vid) {
      try { return this.repWords(vid); } catch (e) { return 'still making up their mind'; }
    },

    // ---------- death closes the book ----------

    // closePersonBook: dead is the end of their story. Freeze the entry,
    // record the death, write it in past tense from here on.
    closePersonBook(vid, info) {
      info = info || {};
      const d = this.personDepth(vid);
      if (d.closed) return false;
      d.closed = true;
      d.death = {
        day: day(), cause: info.cause || 'the world', place: info.place || 'out there',
        foundBy: info.foundBy || null,
      };
      const first = this.personFirst(vid);
      const chap = CHAPTERS[d.level] || 'Stranger';
      try {
        this.journalLearn(vid, 'note', `✝ Died day ${d.death.day} — ${d.death.cause}. The book closes here. They got as far as: ${chap.toLowerCase()}.`, { quiet: true });
      } catch (e) {}
      this.say(`📖 The entry for ${first} is finished. ${d.deeds.length ? `${this.pluralize(d.deeds.length, 'deed')} recorded. ` : ''}No more pages.`);
      return true;
    },

    // posthumousReveal: examining the body can teach you something they never
    // told you. Rare, weighty, never cheap: once per corpse, fresh/stiff only,
    // and only if you actually knew them (or found them yourself).
    posthumousReveal(corpse) {
      if (!corpse || corpse.kind !== 'person' || !corpse.villagerId) return false;
      if (corpse.posthumousRolled) return false;
      corpse.posthumousRolled = true;
      const vid = corpse.villagerId;
      let entry = null;
      try { entry = this.journalPerson(vid); } catch (e) { return false; }
      const d = entry.depth;
      if (!d || d.level < 1 || d.posthumous) return false;
      const trust = ((this.state.village || {}).trust || {})[vid] || 0;
      const sawIt = (corpse.witnesses || []).includes(this.villagerId);
      const wasParty = (() => { try { return (this.partyIds || []).includes(vid); } catch (e) { return false; } })();
      if (!(trust >= 40 || sawIt || wasParty)) return false;
      if (Math.random() > 0.35) return false;
      const ls = this.ensurePersonLifeseed(vid);
      if (!ls) return false;
      const first = this.personFirst(vid);
      // Prefer the thing they hid: wound first, then the event, a kin fate,
      // then the want. Never repeats what's already revealed.
      let text = null, key = null;
      if (!d.revealed.wound && ls.wound) { key = 'wound'; text = `Going through ${first}'s things, you find the shape of what they never told you: ${ls.wound}`; }
      else if (!d.revealed.event && ls.event) { key = 'event'; const ev = String(ls.event); text = `A folded note in ${first}'s pocket, in their hand: "${ev.charAt(0).toUpperCase() + ev.slice(1)}." Now you know what year broke them.`; }
      else if (!d.revealed.kin1 && (ls.people || [])[1]) { key = 'kin1'; const p = ls.people[1]; text = `${first} kept a name close and never spoke it: ${p.name.split(' ')[0]}, ${p.relation} — ${p.fate}.`; }
      else if (!d.revealed.want && ls.want) { key = 'want'; text = `You never asked what ${first} wanted. The body can't answer, but the wanting was written all over what they carried: ${ls.want}`; }
      if (!text) return false;
      d.revealed[key] = true;
      d.posthumous = { text, day: day() };
      try { this.journalLearn(vid, 'backstory', text, { via: 'found on the body', sure: true, quiet: true }); } catch (e) {}
      this.say(`📖 ${text}\n<i>Some things you only learn when it's too late to thank them.</i>`);
      return true;
    },

    // ---------- daily tick ----------

    codexPersonTick() {
      const roster = ((this.state.village || {}).roster || []);
      for (const vid of roster) {
        if (vid === this.villagerId) continue;
        try {
          const e = (this.state.codex.people || {})[vid];
          if (!e || !e.depth || e.depth.closed) continue;
          if (e.depth.level >= 2) this.checkPersonLevel(vid);
        } catch (err) {}
      }
    },

    // ---------- codex screen HTML ----------

    // personDepthHTML: the entry's depth made visible — chapter, confirmed
    // vs said, legend deeds, shared history, their view, epitaph.
    personDepthHTML(vid) {
      let e = null;
      try { e = this.journalPerson(vid); } catch (err) { return ''; }
      const d = e.depth;
      if (!d || d.level < 1) return '';
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const first = this.personFirst(vid);
      const out = [];
      if (d.closed && d.death) {
        out.push(`<p class="small" style="opacity:.75"><i>✝ The book is closed. Died day ${d.death.day} — ${esc(d.death.cause)}.</i></p>`);
      } else {
        out.push(`<p class="small" style="opacity:.75"><i>Chapter: ${CHAPTERS[d.level] || 'Stranger'}.</i></p>`);
      }
      const conf = Object.values(d.confirmed || {});
      if (conf.length) {
        out.push(conf.map(c => `<p class="small">✓ <b>Known:</b> ${esc(c.text)} <span style="opacity:.45">· confirmed day ${c.day}</span></p>`).join(''));
      }
      const deeds = (d.deeds || []).slice(0, 6);
      if (deeds.length) {
        out.push(`<p class="small" style="margin-top:4px"><b>LEGEND — what they did:</b></p>`);
        out.push(deeds.map(x => `<p class="small">· ${esc(x.text)} <span style="opacity:.45">· day ${x.day}</span></p>`).join(''));
      }
      const shared = (d.shared || []).slice(-4);
      if (shared.length && !d.closed) {
        out.push(shared.map(s => `<p class="small" style="opacity:.8">◈ ${esc(s.text)} <span style="opacity:.45">· day ${s.day}</span></p>`).join(''));
      }
      if (!d.closed) {
        out.push(`<p class="small" style="opacity:.6">How they see you: <i>${esc(this.theirViewOfYou(vid))}</i></p>`);
        try {
          const board = this.villagerBoard ? this.villagerBoard() : [];
          const rank = board.findIndex(r => r && (r.vid === vid || r.id === vid));
          if (sys() && rank >= 0) out.push(`<p class="small" style="opacity:.6">Contest: #${rank + 1} on the board. The audience is watching.</p>`);
        } catch (err) {}
      }
      if (d.posthumous) {
        out.push(`<p class="small"><i>"${esc(d.posthumous.text)}"</i> <span style="opacity:.45">· learned too late, day ${d.posthumous.day}</span></p>`);
      }
      void first;
      return out.join('');
    },
  };

  Object.assign(Game, methods);

  // ---------- wraps ----------

  // journalLearn: count facts, drive level-ups, confirm confessions.
  // Closed books don't deepen — the story's over.
  const _journalLearn = Game.journalLearn;
  if (_journalLearn) {
    Game.journalLearn = function (vid, field, value, opts) {
      const r = _journalLearn.call(this, vid, field, value, opts);
      try {
        if (!r) return r;
        const d = this.personDepth(vid);
        if (d.closed) return r;
        opts = opts || {};
        if (field === 'name') { this.checkPersonLevel(vid); return r; }
        if (['occupation', 'goal', 'backstory', 'trait', 'language'].includes(field)) {
          d.facts += 1;
          // confession or verified learn → confirmation ("you know").
          // Occupation names the actual job ("Rosa is a blacksmith's
          // apprentice"), never the vague "what Rosa did" (Steve 2026-10-06).
          if (opts.sure && (opts.via === 'confessed' || /confirm|verif/i.test(opts.via || ''))) {
            const occ = field === 'occupation' ? String((value && value.text) || value || '').trim() : '';
            const label = occ ? `${this.personFirst(vid)} is ${/^[aeiou]/i.test(occ) ? 'an' : 'a'} ${occ}` :
              field === 'occupation' ? `what ${this.personFirst(vid)} did` :
              field === 'goal' ? `what ${this.personFirst(vid)} wants` : String((value && value.text) || value || field);
            this.confirmField(vid, field, label);
          }
          this.checkPersonLevel(vid);
        }
      } catch (e) {}
      return r;
    };
  }

  // endConvo: conversations are the intimacy currency. Count them.
  const _endConvo = Game.endConvo;
  if (_endConvo) {
    Game.endConvo = function (vid, how) {
      const r = _endConvo.call(this, vid, how);
      try {
        const d = this.personDepth(vid);
        if (!d.closed) { d.convos += 1; this.checkPersonLevel(vid); }
      } catch (e) {}
      return r;
    };
  }

  // endDay: the daily depth check — trust + time gates.
  const _endDay = Game.endDay;
  if (_endDay) {
    Game.endDay = function () {
      const r = _endDay.call(this);
      try { this.codexPersonTick(); } catch (e) {}
      return r;
    };
  }

  // resolveDoubt: a resolved doubt with a truthful resolution confirms.
  const _resolveDoubt = Game.resolveDoubt;
  if (_resolveDoubt) {
    Game.resolveDoubt = function (doubtId, resolutionText) {
      const d0 = (this.state.codex.doubts || []).find(x => x.id === doubtId);
      const r = _resolveDoubt.call(this, doubtId, resolutionText);
      try {
        if (d0 && /confess|verif|confirm|admit/i.test(resolutionText || '')) {
          this.confirmField(d0.vid, 'doubt:' + doubtId, resolutionText);
        }
      } catch (e) {}
      return r;
    };
  }

  // recordDeed: deeds are the legend section. Mirror them into the entry.
  const _recordDeed = Game.recordDeed;
  if (_recordDeed) {
    Game.recordDeed = function (vid, type, text, magnitude) {
      const r = _recordDeed.call(this, vid, type, text, magnitude);
      try {
        const d = this.personDepth(vid);
        if (!d.closed) {
          d.deeds.unshift({ text, day: day(), mag: magnitude || 0, type });
          d.deeds = d.deeds.slice(0, 12);
        }
      } catch (e) {}
      return r;
    };
  }

  // registerDeath: dead is the end of their story. Close the book.
  const _registerDeath = Game.registerDeath;
  if (_registerDeath) {
    Game.registerDeath = function (opts) {
      const r = _registerDeath.call(this, opts);
      try {
        if (opts && opts.kind === 'person' && opts.villagerId && opts.villagerId !== this.villagerId) {
          this.closePersonBook(opts.villagerId, { cause: opts.cause, place: 'out there' });
        }
      } catch (e) {}
      return r;
    };
  }

  // examineCorpse: looking closely at the body can teach you what they hid.
  const _examineCorpse = Game.examineCorpse;
  if (_examineCorpse) {
    Game.examineCorpse = function (id) {
      const r = _examineCorpse.call(this, id);
      try { this.posthumousReveal(r); } catch (e) {}
      return r;
    };
  }

  // defendAlibi: they vouched for you at the moot. That's shared history.
  const _defendAlibi = Game.defendAlibi;
  if (_defendAlibi) {
    Game.defendAlibi = function (caseId) {
      const r = _defendAlibi.call(this, caseId);
      try {
        if (r === true) {
          const t = (this.state.village.trust || {});
          const friends = (this.npcIds ? this.npcIds() : []).filter(fid => (t[fid] || 0) >= 25).slice(0, 2);
          for (const f of friends) this.noteSharedHistory(f, 'stood up and vouched for you at the moot');
        }
      } catch (e) {}
      return r;
    };
  }

  // approachWeakest: they broke first and told you everything. Shared history.
  const _approachWeakest = Game.approachWeakest;
  if (_approachWeakest) {
    Game.approachWeakest = function (caseId, offerLeniency) {
      const r = _approachWeakest.call(this, caseId, offerLeniency);
      try {
        if (r === true) {
          const c = this.getCase(caseId);
          if (c && c.flipped) this.noteSharedHistory(c.flipped, 'broke first and told you everything — the story came apart like wet paper');
        }
      } catch (e) {}
      return r;
    };
  }
})();
