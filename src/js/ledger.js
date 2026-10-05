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
      // the contest: standings every so often. Notability is ratings.
      try {
        if (this.state.systemArrived && (s.day || 0) % 24 < 12) {
          const rows = this.contestStandings();
          const place = rows.findIndex(r => r.us) + 1;
          const leader = rows[0];
          this.say(`📊 THE STANDINGS — Haven sits ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} of ${rows.length}. ${leader.us ? 'Haven leads. The audience has a favorite, and it\'s you.' : `${leader.name} leads — the audience loves them today. One season. Every village is playing.`}`);
        }
      } catch (e) {}
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
      try { this.recordMoment(`Haven reached the table as ${F.name}.`); } catch (e) {}
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

    // ---------- LINEAGE (the village's own remembered dead) ----------
    // Steve's correction: NO cross-run inheritance. The Codex spans one
    // contest — one village, one season. But the village remembers its own
    // mantle-bearers. That's the scholar-mantle fiction: each death, another
    // adventurer assumes the mantle. Same village. Same book.
    lineage() {
      try { const pg = this.progState(); pg.lineage = pg.lineage || []; return pg.lineage; }
      catch (e) { return []; }
    },
    recordLegend(info) {
      try {
        const pg = this.progState();
        if (pg.legendRecorded) return;
        pg.legendRecorded = true;
        const s = this.state.scholar;
        const char = (this.data.villagers || []).find(v => v.id === this.villagerId) || {};
        this.lineage().push({
          name: char.name || 'Someone',
          epithet: this.leadershipEpithet(),
          frame: (info && info.frame) || this.endingFrame(),
          choice: (info && info.choice) || null,
          outcome: (info && info.outcome) || (this.won ? 'haven-endures' : 'died'),
          day: s.day || 0,
          at: Date.now(),
        });
      } catch (e) {}
    },

    // ---------- THE MANTLE PASSES ----------
    // The village is the protagonist. When the bearer dies, the story does
    // NOT reset: the village mourns, someone steps up, the Codex notes the
    // changing of the mantle. Same village, same arc, same Codex, same
    // leadership vector — a new face. The only game overs: the village
    // achieves its ending (the table), or the village dies out.
    playerDeath(cause) {
      const s = this.state.scholar, v = this.state.village;
      const oldId = this.villagerId;
      const oldChar = (this.data.villagers || []).find(x => x.id === oldId) || {};
      const oldName = oldChar.name || 'the scholar';
      const oldFirst = oldName.split(' ')[0];
      // the body remains: the keepsakes go with it. Grief is fuel — whoever
      // comes next can pick them up from the corpse.
      let keepsakes = [];
      try {
        const inv = s.inventory || [];
        keepsakes = inv.filter(i => i && (i.bonded || i.sentimental));
        s.inventory = inv.filter(i => !(i && (i.bonded || i.sentimental)));
      } catch (e) {}
      try {
        this.registerDeath({ kind: 'villager', villagerId: oldId, name: oldName, mx: s.mx, my: s.my, cause: cause || 'the wild', killerId: null, items: keepsakes });
      } catch (e) {}
      try { this.removeVillager(oldId, 'killed'); } catch (e) {}
      this.lineage().push({ name: oldName, epithet: this.leadershipEpithet(), day: s.day || 0, cause: cause || 'the wild' });
      this.say(`🕯️ ${oldName} is dead — ${cause || 'the wild'}. The village stops. Somebody screams. Somebody else starts digging.`);
      // successor: the village chooses. Trust decides.
      let candidates = [];
      try { candidates = this.npcIds(); } catch (e) {}
      if (!candidates.length) {
        this.over = true; this.villageLost = true; this.won = false;
        this.say('No one is left to pick up the Codex. The village dies out — quietly, the way villages do. The season ends here.');
        this.recordLegend({ outcome: 'village-lost' });
        return;
      }
      const trust = (v.trust || {});
      candidates.sort((a, b) => (trust[b] || 0) - (trust[a] || 0));
      const newId = candidates[0];
      const newChar = (this.data.villagers || []).find(x => x.id === newId) || {};
      const newName = newChar.name || 'someone';
      const newFirst = newName.split(' ')[0];
      // "you're not her." — the village reacts to the change.
      const closeId = Object.keys(trust).filter(id => id !== newId && (trust[id] || 0) > 55)
        .sort((a, b) => (trust[b] || 0) - (trust[a] || 0))[0];
      if (closeId) {
        const cn = ((this.data.villagers || []).find(x => x.id === closeId) || {}).name || 'Someone';
        this.say(`"${oldFirst}'s gone." ${cn.split(' ')[0]} looks at you for a long moment. "You're not ${oldFirst}." No heat in it. Just fact. You'll have to earn this face.`);
      }
      this.say(`${newFirst} picks up the Codex. Their hands shake. Then they open it, and keep writing.`);
      this.villagerId = newId;
      // the mantle passes: the PROGRESSION is the village's (slots, arc,
      // integration, ledger, Codex). The body is new.
      s.kcal = 1500;
      try { s.health = this.maxHealth(); } catch (e) { s.health = 100; }
      s.trauma = 10; // the shock of stepping up
      s.mx = 4; s.my = 4;
      try {
        if (this.map) { this.map.px = this.state.village.px ?? 3; this.map.py = this.state.village.py ?? 3; }
      } catch (e) {}
      // background abilities are THEIRS — their past, their hands.
      try {
        const occ = (this.data.occupations || []).find(o => o.id === newChar.occupation) || {};
        const granted = (occ.granted || []).filter(id => (this.data.abilities || []).find(a => a.id === id));
        s.backgroundAbilities = granted.map(id => {
          const d = (this.data.abilities || []).find(a => a.id === id) || {};
          return { id, name: d.name || id, desc: d.description || '', level: 1, xp: 0, background: true };
        });
      } catch (e) {}
      // System abilities pass with the mantle — the System recognizes the
      // office, not the face. It's alien like that.
      this.say('🌟 "MANTLE TRANSFER DETECTED. ...Oh! New face! Same job! We hardly noticed. (That is a lie. We noticed. The audience CRIED.)"');
      this.say(`📖 The Codex turns a page: ${oldName}, ${s.day || 0} days. The mantle passes to ${newName}.`);
      try { this.recordMoment(`${oldName} died. ${newFirst} picked up the Codex.`); } catch (e) {}
      // the trust of the office transfers, discounted — the person must earn the rest
      try {
        v.trust = v.trust || {};
        v.trust[newId] = Math.round((trust[oldId] || 20) * 0.6);
      } catch (e) {}
      try { this.ledgerAdd('unified', 1); } catch (e) {}
      try { this.save(); } catch (e) {}
    },

    // ---------- ONE CONTEST ----------
    // Many villages, one season. Rival contestants — trade and cooperation,
    // but also competition for the audience's favor. Notability is ratings.
    //
    // FUTURE HOOK (Steve 2026-10-04): the show will run periodic spectacle
    // challenges in distinct arenas, gated by the viewership leaderboard —
    // roughly the top 20% of contestants per challenge. Ratings = access.
    // viewershipBoard() is the API those challenges will read: per-village
    // viewership scores, trends, and the moments that moved them. Don't
    // paint over it: every notable event should recordMoment().
    havenViewership() {
      try {
        const v = this.state.village, pg = this.progState();
        const base = (v.pantryKcal || 0) / 2000 + this.codexBreadth() * 1.5 + (pg.arc || 1) * 5 + (this.ledger().showmanship || 0);
        v.viewership = v.viewership == null ? base : v.viewership;
        return v.viewership;
      } catch (e) { return 0; }
    },
    // trending moments: the log the future leaderboard reads. Cap 30.
    recordMoment(text) {
      try {
        const pg = this.progState();
        pg.moments = pg.moments || [];
        pg.moments.unshift({ day: (this.state.scholar || {}).day || 0, text: String(text).slice(0, 140) });
        pg.moments = pg.moments.slice(0, 30);
        // moments move viewership: big plays get watched
        const v = this.state.village;
        v.viewership = (v.viewership == null ? this.havenViewership() : v.viewership) + 1;
      } catch (e) {}
    },
    viewershipBoard() {
      // THE leaderboard. Future challenge-gating reads this. Rows:
      // { name, viewership, trend, us }. Sorted high→low.
      try {
        const rows = [{ name: 'Haven', viewership: this.havenViewership(), trend: 0, us: true }];
        for (const ov of (this.state.otherVillages || [])) {
          const prev = ov.viewership == null ? 8 + R() * 8 : ov.viewership;
          const drift = (R() - 0.45) * 3;
          ov.viewership = Math.max(2, Math.min(60, prev + drift));
          ov.trend = Math.round((drift) * 10) / 10;
          rows.push({ name: ov.name || 'a far village', viewership: ov.viewership + (ov.generated ? 4 : 0), trend: ov.trend || 0, us: false });
        }
        rows.sort((a, b) => b.viewership - a.viewership);
        return rows;
      } catch (e) { return [{ name: 'Haven', viewership: 0, trend: 0, us: true }]; }
    },
    contestStandings() {
      // legacy name — the standings ARE the viewership board now.
      return this.viewershipBoard().map(r => ({ name: r.name, score: r.viewership, trend: r.trend, us: r.us }));
    },

    // ---------- CHALLENGE ABDUCTION (future hooks) ----------
    // Steve's design (2026-10-04): challenges come with a System warning +
    // countdown — dread is the point; the village watches the sky count
    // down. When it fires, teleportation is MANDATORY: ripped out of
    // whatever you were doing (mid-conversation, mid-hunt, mid-trial — the
    // show doesn't care). Sometimes a decline is offered, sometimes not.
    // Unhinged games vs monsters or other humans. High risk, high reward,
    // OFTEN DEADLY.
    //
    // Participation is INDIVIDUAL: the leaderboard picks PEOPLE, not
    // villages. Sometimes the chosen can bring companions — the "who do you
    // bring" beat: choosing for a deadly televised game, and the ones left
    // behind, is social dynamite. The invitation list is a mechanic.
    //
    // The future challenge scheduler drives these. Nothing here runs a
    // challenge — these are the hooks it will call.
    warnChallenge(spec) {
      const s = this.state.scholar;
      spec = spec || {};
      const picked = (spec.picked && spec.picked.length ? spec.picked : [this.villagerId]);
      const days = spec.firesDay != null ? spec.firesDay : (s.day || 0) + 3;
      s.challengeWarning = {
        id: spec.id || 'ch_' + Date.now(),
        name: spec.name || 'A New Game',
        arena: spec.arena || 'a place that is not a place',
        firesDay: days,
        canDecline: !!spec.canDecline,
        picked: [...picked],
        canBring: spec.canBring || 0,
        vs: spec.vs || 'unknown',
      };
      s.challengeInvites = {
        challengeId: s.challengeWarning.id,
        picked: [...picked],
        canBring: s.challengeWarning.canBring,
        brought: [],
      };
      const names = picked.map(id => { try { return this.displayName(id).split(' ')[0]; } catch (e) { return 'someone'; } }).join(', ');
      const n = Math.max(1, days - (s.day || 0));
      this.say(`🌟 "ATTENTION, CONTESTANTS." The sky ripples. "${String(s.challengeWarning.name).toUpperCase()} begins in ${n} day${n === 1 ? '' : 's'}. The arena: ${s.challengeWarning.arena}. The chosen: ${names}."`);
      this.say('The village watches the sky count down. Dread is the point.');
      if (s.challengeWarning.canDecline) this.say('This one comes with a way out. The System almost never offers. (You can decline — but the audience will remember.)');
      else this.say('No decline is offered. There never is, for this kind.');
      try { this.recordMoment(`The show chose ${names} for ${s.challengeWarning.name}.`); } catch (e) {}
      try { this.save(); } catch (e) {}
      return s.challengeWarning;
    },
    challengeCountdownText() {
      // HUD surface: the countdown chip. The future scheduler ticks firesDay.
      try {
        const w = this.state.scholar.challengeWarning;
        if (!w) return '';
        const n = Math.max(0, w.firesDay - (this.state.scholar.day || 0));
        return `⏳ ${w.name}: ${n === 0 ? 'TODAY' : n + 'd'}`;
      } catch (e) { return ''; }
    },
    declineChallenge() {
      const s = this.state.scholar, w = s.challengeWarning;
      if (!w) return null;
      if (!w.canDecline) {
        this.say('There is no decline. There never was, for this kind.');
        return null;
      }
      s.challengeWarning = null; s.challengeInvites = null;
      const pg = this.progState();
      pg.showDebt = (pg.showDebt || 0) + 1; // whether you owe the show: a design lever
      try { const v = this.state.village; v.viewership = Math.max(0, (v.viewership == null ? 0 : v.viewership) - 3); } catch (e) {}
      this.say('You decline. The sky goes quiet in a way that feels personal. The audience boos — politely, the way trillions of beings boo. (Viewership −3. The show will remember that you owe it one.)');
      try { this.recordMoment('Declined the show\u2019s invitation.'); } catch (e) {}
      try { this.save(); } catch (e) {}
      return null;
    },
    abduct(contestantIds, challengeId) {
      // MANDATORY teleport. Interrupts ANYTHING — conversations end
      // mid-sentence, fights stop mattering. The show doesn't care.
      const s = this.state.scholar;
      const ids = (contestantIds && contestantIds.length ? contestantIds : [this.villagerId]);
      try {
        for (const vid of (this.state.village.roster || [])) {
          try { const c = this.convoGet(vid); if (c && c.active) this.endConvo(vid, 'abducted'); } catch (e) {}
        }
      } catch (e) {}
      try { this.tbfight = null; this.fight = null; } catch (e) {}
      s.rippedFrom = { mx: s.mx, my: s.my, day: s.day || 0 };
      s.abducted = {
        challengeId: challengeId || (s.challengeWarning && s.challengeWarning.id) || 'unknown',
        at: s.day || 0,
        contestants: [...ids],
      };
      s.challengeWarning = null;
      const names = ids.map(id => { try { return this.displayName(id).split(' ')[0]; } catch (e) { return 'someone'; } }).join(', ');
      this.say('⚡ The sky OPENS. Light like a held breath — and then you are NOT where you were. Mid-step, mid-word, mid-swing: GONE. The show doesn\u2019t care what you were doing.');
      this.say(`Ripped from the world: ${names}. Back home, the village stares at the empty air where people used to be.`);
      try { this.recordMoment(`${names} ${ids.length > 1 ? 'were' : 'was'} taken to the arena.`); } catch (e) {}
      try { this.save(); } catch (e) {}
      return s.abducted;
    },
    // ---------- THE INVITATION LIST ----------
    bringCompanion(vid) {
      // the chosen can bring friends. Who you bring into a deadly televised
      // game — and who you leave — is its own drama. Trust, guilt, politics.
      const s = this.state.scholar, inv = s.challengeInvites;
      if (!inv) return null;
      if (inv.brought.length >= inv.canBring) {
        this.say('The invitation list is full. The show is strict about headcounts.');
        return null;
      }
      if (inv.brought.includes(vid) || inv.picked.includes(vid)) return null;
      inv.brought.push(vid);
      let nm = 'them';
      try { nm = this.displayName(vid).split(' ')[0]; } catch (e) {}
      this.say(`You put ${nm} on the list. ${nm} goes pale, then nods. The ones you didn't pick look away.`);
      try { const t = this.state.village.trust || {}; t[vid] = Math.min(100, (t[vid] || 10) + 8); } catch (e) {}
      try { this.recordMoment(`${nm} was brought to the arena.`); } catch (e) {}
      try { this.save(); } catch (e) {}
      return null;
    },
    expectedButLeft() {
      // who expected to be brought and wasn't. Future drama reads this.
      try {
        const inv = this.state.scholar.challengeInvites;
        if (!inv) return [];
        const trust = this.state.village.trust || {};
        return (this.state.village.roster || []).filter(id =>
          !inv.picked.includes(id) && !inv.brought.includes(id) && (trust[id] || 0) > 60);
      } catch (e) { return []; }
    },
    // ---------- SPECTATORSHIP ----------
    broadcastLine(text) {
      // the village watches its own go. The show is a SHOW — lean broadcast.
      try {
        const pg = this.progState();
        pg.broadcast = pg.broadcast || [];
        pg.broadcast.unshift({ day: (this.state.scholar || {}).day || 0, text: String(text).slice(0, 160) });
        pg.broadcast = pg.broadcast.slice(0, 40);
      } catch (e) {}
      this.say(`📺 ${text} (The village watches the broadcast. Nobody blinks.)`);
      return null;
    },
    // ---------- DEATH IN THE ARENA ----------
    arenaDeath(cause) {
      // village-as-protagonist continuity: the mantle passes, the village
      // mourns — and the show keeps the footage. And replays it. The
      // audience loves a death reel; the village has to live inside one.
      const char = (this.data.villagers || []).find(v => v.id === this.villagerId) || {};
      const nm = char.name || 'the contestant';
      try {
        const pg = this.progState();
        pg.deathReel = pg.deathReel || [];
        pg.deathReel.unshift({
          name: nm,
          day: (this.state.scholar || {}).day || 0,
          challenge: (this.state.scholar.abducted || {}).challengeId || 'the arena',
        });
      } catch (e) {}
      this.say(`📺 ${nm} dies in the arena. The show keeps the footage. They always keep the footage.`);
      try { this.recordMoment(`${nm} died in the arena. The footage plays on.`); } catch (e) {}
      try { this.playerDeath('the arena'); } catch (e) { this.over = true; }
      return null;
    },
    replayFootage() {
      // the future scheduler calls this. The village has to live with the reel.
      try {
        const reel = this.progState().deathReel || [];
        if (!reel.length) return null;
        const r = reel[Math.floor(Math.random() * reel.length)];
        this.say(`📺 Before dinner, the show replays ${r.name}'s death. Nobody eats much. The audience loves a death reel; the village has to live inside one.`);
        try { this.recordTrauma('footage'); } catch (e) {}
        return null;
      } catch (e) { return null; }
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
