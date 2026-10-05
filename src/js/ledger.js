// ============ THE LEADERSHIP VECTOR ============
// Steve's decision (2026-10-04): NO single ending. The ending is the sum of
// how you led humanity to the table. This module tracks that sum as a
// first-class thing across the whole game — not numbers the player sees,
// but a shape the world reacts to. Villages talk about you. The show's
// narration talks about you. You feel your ending being written before
// you arrive.
//
// Dimensions:
//   might / brokerage      — force vs diplomacy: did your network grow
//                             through feastburn strength or deal-making?
//   showmanship            — how much you played to the audience
//   embrace / defiance     — integration stance toward the System
//   exposed                — truths dragged into the light (bribes, plots)
//   unified / fractured    — humanity's shape under you
//   foodShared             — the food truth: shared outward, or hoarded?
//   protected / killed     — the moral ledger
//
// Ending frames: the Indispensable, the Feared, the Beloved, the Witness,
// the Defiant, the Assimilated. Within the earned frame, the player gets
// one final live choice — that's the drama. Endings feed the next
// roguelite run: the Codex remembers, and the next adventurer inherits
// the last one's legend (or warning).
//
// Self-attaching module: Object.assign(Game, methods) + wraps. Load after
// progression.js.

(function () {
  const Game = (globalThis.Scattering || {}).Game;
  if (!Game) return;
  const R = Math.random;

  const FRAMES = {
    indispensable: {
      name: 'the Indispensable',
      narrate: 'The galaxy runs on energy, and only one species knows the trick: eating. They need what you know. You walk to the table knowing they cannot afford for you to leave it.',
      epithet: 'the one the galaxy needs',
    },
    feared: {
      name: 'the Feared',
      narrate: '"Look what eating built." The footage plays unasked — the deer, the fire, the ones who came for you and didn\'t come back. Nobody at the table is comfortable. That is the point.',
      epithet: 'the one the table fears',
    },
    beloved: {
      name: 'the Beloved',
      narrate: 'The audience is chanting. You don\'t know the words — it isn\'t a language with words — but you know the feeling. The table can\'t move against the cast\'s favorite. That\'s leverage.',
      epithet: 'the audience\'s favorite',
    },
    witness: {
      name: 'the Witness',
      narrate: 'You didn\'t come to negotiate. You came with a list. Every bribe, every buried plot, every "rounding error" — including theirs. The judges are about to be judged.',
      epithet: 'the one who kept the list',
    },
    defiant: {
      name: 'the Defiant',
      narrate: 'You came to the table to tell it no. The System keeps recalculating, the way it does when it\'s afraid. Humanity walks. Let the galaxy watch that.',
      epithet: 'the one who said no',
    },
    assimilated: {
      name: 'the Assimilated',
      narrate: 'Comfort, on their terms. Warm light, no hunger, no fear. All it costs is everything that made you worth watching. It\'s such a gentle trap. That\'s what makes it a trap.',
      epithet: 'the comfortable one',
    },
  };

  const TABLE_CHOICES = {
    indispensable: [
      { id: 'price', label: 'Name your price.', outcome: 'You name it. Humanity becomes the galaxy\'s engine — prosperous, entangled, never quite free. The table agrees so fast it embarrasses everyone. Irreplaceable is its own kind of cage, but it\'s a gilded one, and it\'s yours.' },
      { id: 'teach', label: 'Teach them freely.', outcome: 'You give away the trick. The table wasn\'t ready for generosity as strategy — it doesn\'t compute, until it does. Humanity becomes teachers, not fuel. The galaxy eats, at last, and remembers who fed it.' },
    ],
    feared: [
      { id: 'example', label: 'Make an example.', outcome: 'Deterrence holds for a century. The footage never stops playing. Nobody bothers humanity again. You tell yourself the fear was the price of safety. Some nights you almost believe it.' },
      { id: 'mercy', label: 'Show mercy.', outcome: 'The most frightening thing you ever did. The table doesn\'t know what to do with mercy from a predator. Neither do you, quite. But the audience weeps, and the galaxy learns that the feared one chose gentleness — and that choice echoes longer than any threat.' },
    ],
    beloved: [
      { id: 'audience', label: 'Let the audience speak.', outcome: 'The show becomes the government. Strange. It works. Trillions of viewers hold the table to account in real time, and humanity\'s seat is wherever the cameras are. You made popularity into a constitution.' },
      { id: 'quiet', label: 'Speak for the quiet ones.', outcome: 'You spend the love you earned on people who never had any. The villages nobody filmed, the dead nobody named. The audience weeps in eleven dimensions. This is what the show was for, it turns out.' },
    ],
    witness: [
      { id: 'charges', label: 'Read the charges.', outcome: 'The trial of the judges. You read every charge, and some of them flinch — actual flinching, from beings of light. Justice, at last, with an audience. The galaxy\'s court has a new precedent, and your name is on it.' },
      { id: 'wayback', label: 'Offer them a way back.', outcome: 'Even judges can be taught. It\'s the hardest thing you\'ve done — harder than the deer, harder than the hunger. One of them accepts. That\'s enough. That\'s everything.' },
    ],
    defiant: [
      { id: 'walk', label: 'Walk away.', outcome: 'Humanity walks. The cameras follow for years — the long shot of small figures leaving the light, carrying their food and their dead and their songs. The highest-rated footage in galactic history. Nobody owns it.' },
      { id: 'terms', label: 'Name your terms anyway.', outcome: 'Defiance with a contract. They sign. They hate signing. Humanity stays free and gets the trade routes too, because you refused to choose between dignity and dinner. The table learns a new word: no.' },
    ],
    assimilated: [
      { id: 'comfort', label: 'Accept comfort.', outcome: 'Warm, safe, dim. The show gets a final season. You don\'t watch it. Somewhere, in a drawer of your mind, a locket clicks open and shut. You can\'t remember why that matters. That\'s the point of comfort.' },
      { id: 'grief', label: 'Remember the taste of grief.', outcome: 'At the last second — the locket, the drawing, the coin. You choose the ache over the anesthesia. The table recoils; the audience erupts. You didn\'t come this far to be comfortable. The frame breaks, and something rawer walks out.' },
    ],
  };

  const methods = {

    // ---------- THE LEDGER ----------
    ledger() {
      const pg = this.progState();
      pg.ledger = pg.ledger || {
        might: 0, brokerage: 0, showmanship: 0, embrace: 0, defiance: 0,
        exposed: 0, unified: 0, fractured: 0, foodShared: 0,
        protected: 0, killed: 0,
      };
      return pg.ledger;
    },
    ledgerAdd(dim, n) {
      try {
        const L = this.ledger();
        if (dim in L) L[dim] = (L[dim] || 0) + n;
      } catch (e) {}
    },

    // ---------- THE FRAME ----------
    // Computed from the sum of play. Ties break toward the more distinctive
    // frames; a quiet game returns 'unwritten'.
    endingFrame() {
      const L = this.ledger();
      const total = Object.values(L).reduce((a, b) => a + b, 0);
      if (total < 6) return 'unwritten';
      const scores = {
        indispensable: L.might + L.brokerage + L.foodShared * 2 + L.unified,
        feared: L.might * 2 + L.killed * 2,
        beloved: L.showmanship * 2 + L.protected * 2 + L.brokerage + L.unified,
        witness: L.exposed * 3 + L.defiance,
        defiant: L.defiance * 3 + L.might * 0.5,
        assimilated: Math.max(0, L.embrace * 3 - L.defiance * 2),
      };
      const order = ['witness', 'beloved', 'indispensable', 'defiant', 'feared', 'assimilated'];
      let best = 'assimilated', bs = -1;
      for (const k of order) { if (scores[k] > bs) { bs = scores[k]; best = k; } }
      return best;
    },
    leadershipEpithet() {
      const f = this.endingFrame();
      if (f === 'unwritten') return 'the Unknown';
      return (FRAMES[f] || {}).name || 'the Unknown';
    },

    // ---------- VISIBILITY (not numbers — the world reacting) ----------
    // Every ~12 days, the world tells you who you're becoming.
    ledgerBeat() {
      const s = this.state.scholar, pg = this.progState();
      if ((s.day || 0) < 12) return;
      if ((pg.lastLedgerBeat || 0) + 12 > (s.day || 0)) return;
      pg.lastLedgerBeat = s.day || 0;
      const ep = this.leadershipEpithet();
      if (ep === 'the Unknown') return;
      const f = this.endingFrame();
      const flavor = {
        feared: 'The show\'s narration lingers on your hands.',
        beloved: 'Strangers ask for your blessing. You don\'t know what to do with that.',
        indispensable: 'Other villages send envoys now. They need what you know.',
        witness: 'People bring you their suspicions, written down. You keep every one.',
        defiant: 'The System\'s messages have gotten... careful around you.',
        assimilated: 'The overlay feels like home. That should probably worry you.',
      }[f] || '';
      const vname = this.distantVillageName ? this.distantVillageName() : 'the outer villages';
      this.say(`◈ WORD TRAVELS — riders from ${vname} have heard of you. Out there they call you ${ep}. ${flavor}`);
      try { this.save(); } catch (e) {}
    },
    distantVillageName() {
      try {
        const ovs = this.state.otherVillages || [];
        if (ovs.length) return ovs[Math.floor(R() * ovs.length)].name || 'the outer villages';
      } catch (e) {}
      return 'the outer villages';
    },

    // ---------- THE TABLE ----------
    // Arc IV sets tableWaiting. The scene fires the next dawn. One final
    // live choice, inside the earned frame.
    tableScene() {
      const s = this.state.scholar, pg = this.progState();
      if (pg.tableDone) return;
      pg.tableDone = true;
      const frame = this.endingFrame() === 'unwritten' ? 'indispensable' : this.endingFrame();
      const F = FRAMES[frame];
      this.say('◈ THE TABLE — it is not a table. It\'s a ring of pale light, and around it, things with too many angles to be faces. Above it all — the audience. Trillions of eyes, and every one of them knows your name. The System speaks, and for once it isn\'t performing: "HUMANITY PRESENTS ITS CASE."');
      this.say(`Your case. ${F.narrate}`);
      this.say(`Out there they call you ${F.name.toLowerCase()}. Now — the last choice is yours, and it's live.`);
      s.tableChoices = {
        frame,
        options: (TABLE_CHOICES[frame] || []).map(c => ({ id: c.id, label: c.label })),
      };
      try { this.save(); } catch (e) {}
    },
    chooseTableOption(id) {
      const s = this.state.scholar, pg = this.progState();
      const tc = s.tableChoices;
      if (!tc) return null;
      const opt = (TABLE_CHOICES[tc.frame] || []).find(o => o.id === id);
      if (!opt) return null;
      s.tableChoices = null;
      const F = FRAMES[tc.frame];
      this.say(`◈ ${F.name.toUpperCase()} — "${opt.label}"`);
      this.say(opt.outcome);
      this.recordLegend({ outcome: 'table', frame: tc.frame, choice: opt.label });
      this.over = true; this.won = true;
      try { this.save(); } catch (e) {}
      return null;
    },

    // ---------- LEGENDS (roguelite continuity) ----------
    recordLegend(info) {
      try {
        const pg = this.progState();
        if (pg.legendRecorded) return;
        pg.legendRecorded = true;
        const s = this.state.scholar;
        const char = (this.data.villagers || []).find(v => v.id === this.villagerId) || {};
        const legend = {
          name: char.name || 'Someone',
          epithet: this.leadershipEpithet(),
          frame: (info && info.frame) || this.endingFrame(),
          choice: (info && info.choice) || null,
          outcome: (info && info.outcome) || (this.won ? 'haven-endures' : 'died'),
          day: s.day || 0,
          at: Date.now(),
        };
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem('oversight_legends') || '[]'); } catch (e) {}
        arr.unshift(legend);
        try { localStorage.setItem('oversight_legends', JSON.stringify(arr.slice(0, 20))); } catch (e) {}
      } catch (e) {}
    },
    readLegends() {
      try {
        return JSON.parse(localStorage.getItem('oversight_legends') || '[]');
      } catch (e) { return []; }
    },
    legendLine() {
      const ls = this.readLegends();
      if (!ls.length) return '';
      const l = ls[0];
      const out = {
        'table': `sat at the galactic table as ${l.epithet}`,
        'haven-endures': 'kept Haven alive',
        'village-lost': 'lost the village',
        'died': "didn't make it back",
      }[l.outcome] || 'played their part';
      return `Before you, ${l.name} was called ${l.epithet} — ${l.name.split(' ')[0]} ${out}. The Codex remembers.`;
    },
  };

  Object.assign(Game, methods);

  // ============ WRAPS ============
  (function attach() {
    // deaths write the moral ledger
    const _registerDeath = Game.registerDeath;
    Game.registerDeath = function (opts) {
      const r = _registerDeath ? _registerDeath.call(this, opts) : undefined;
      try {
        const o = opts || {};
        if (o.killerId && o.killerId === this.villagerId) {
          if (o.kind === 'monster' || o.kind === 'hostile') {
            this.ledgerAdd('might', 3);
            const party = this.state.party;
            if (party && party.members && party.members.length) this.ledgerAdd('protected', 1);
          } else if (o.kind === 'villager') {
            this.ledgerAdd('killed', 3);
          }
        }
      } catch (e) {}
      return r;
    };

    // intimidation is force, whatever its excuse
    const _intimidate = Game.intimidate;
    Game.intimidate = function (vid) {
      const r = _intimidate ? _intimidate.call(this, vid) : undefined;
      try { this.ledgerAdd('might', 1); } catch (e) {}
      return r;
    };

    // exposing corruption is witness-work
    const _expose = Game.exposeBribery;
    Game.exposeBribery = function (caseId, voterId) {
      const r = _expose ? _expose.call(this, caseId, voterId) : undefined;
      try { if (r) this.ledgerAdd('exposed', 2); } catch (e) {}
      return r;
    };

    // how cases resolve shapes humanity
    const _resolveCase = Game.resolveCase;
    Game.resolveCase = function (caseId, path) {
      const r = _resolveCase ? _resolveCase.call(this, caseId, path) : undefined;
      try {
        if (path === 'weregild') { this.ledgerAdd('brokerage', 2); this.ledgerAdd('unified', 1); }
        else if (path === 'schism') { this.ledgerAdd('fractured', 2); }
        else if (path === 'exile') { this.ledgerAdd('exposed', 1); this.ledgerAdd('unified', 1); }
        else if (path === 'cold_war') { this.ledgerAdd('fractured', 1); }
      } catch (e) {}
      return r;
    };

    // teaching is sharing the food truth outward
    const _convoTurn = Game.convoTurn;
    Game.convoTurn = function (vid, choiceId) {
      let before = -1;
      try {
        if (choiceId === 'teach') before = (((this.state.village || {}).taught || {})[vid] || []).length;
      } catch (e) {}
      const r = _convoTurn ? _convoTurn.call(this, vid, choiceId) : undefined;
      try {
        if (choiceId === 'teach' && before >= 0) {
          const after = (((this.state.village || {}).taught || {})[vid] || []).length;
          if (after > before) {
            const roster = ((this.state.village || {}).roster || []);
            this.ledgerAdd('foodShared', roster.includes(vid) ? 1 : 2);
          }
        }
      } catch (e) {}
      return r;
    };

    // run ends: the legend is recorded (guarded against double-record)
    const _wipe = Game.wipe;
    Game.wipe = function () {
      try {
        if (this.over && this.progState && !this.progState().legendRecorded) {
          this.recordLegend({ outcome: this.won ? (this.villageLost ? 'village-lost' : 'haven-endures') : 'died' });
        }
      } catch (e) {}
      return _wipe ? _wipe.call(this) : undefined;
    };

    // daily: the world reacts + the table waits
    const _endDay = Game.endDay;
    Game.endDay = function () {
      const r = _endDay ? _endDay.call(this) : undefined;
      try {
        this.ledgerBeat();
        const pg = this.progState();
        if (pg.tableWaiting && !pg.tableDone && this.state.systemArrived) this.tableScene();
      } catch (e) {}
      return r;
    };
  })();
})();
