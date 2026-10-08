// @ontology
// system: leadership
// description: The Leadership Vector. No single ending — ending is sum of leadership choices.
// provides:
//   - ledger()
//   - ledgerAdd(entry)
//   - recordLegend(text)
//   - recordMoment(text)
//   - contestStandings()
//   - viewershipBoard()
//   - unityState()            (felt unified/fractured state machine)
//   - foodStance()            (sharer/even/hoarder from foodShared vs foodHoarded)
//   - legendSurface()         (the story so far, as the world tells it)
//   - shareFood(kcal, toName) (UNWIRED 2026-10-08: no callers — foodStance never updates)
//   - hoardFood(kcal)         (UNWIRED 2026-10-08: no callers — private stashing never tracked)
//   - hearGossipAboutSelf(source) (UNWIRED 2026-10-08: no callers)
//   - exposeFallout(caseId, voterId) (named consequences when a truth goes public)
//   - flushLedgerBeats()      (fires queued beats whose knowledge gates now pass)
//   - hearsAboutSelf()        (knowledge gate: has the player heard their own legend?)
// rules:
//   - threshold beats fire once per run per dimension, knowledge-gated (gossip always, show needs viewership, system needs the overlay, lived/witness always); ungated beats queue and fire when the world catches up (code: _checkDimBeats, flushLedgerBeats)
//   - unified/fractured is a felt state machine, not a number; transitions are narrated, direction-aware, always visible — you live it (code: unityState, _checkUnityTransition)
//   - foodShared vs foodHoarded resolve to a felt stance; stance transitions are narrated with social consequences (code: foodStance, _checkFoodStance)
//   - the player's own epithet is never shown until hearsAboutSelf() (code: ledgerBeat)
// consumes:
//   - state.leadership
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
//   unified / fractured    — humanity's shape under you (felt state machine)
//   foodShared / foodHoarded — the food truth: shared outward, or hoarded?
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

  // ============ THRESHOLD BEATS — the ending written in real time ============
  // Steve's decision (2026-10-04): "You feel your ending being written
  // before you arrive." Counters are silent; beats are not. When a dimension
  // crosses a threshold, the world REACTS — village gossip, show narration,
  // System commentary, or the lived feel of the thing itself.
  //
  // Knowledge gating ("if you don't know, it doesn't show"):
  //   gossip  — overhearing IS the channel. Always fireable; the first
  //             gossip beat marks you talked-about (hearsAboutSelf).
  //   show    — the show must actually be watching: viewership >= 12 or a
  //             broadcast you've seen. Otherwise the beat waits in the queue.
  //   system  — needs the overlay: integrationStage() >= 1.
  //   lived   — you live it. Always visible.
  //   witness — the exposure was public at the moot. Always visible.
  // Each beat fires once per run. Queued beats fire when the world catches up.
  function beatVillage(g) {
    try { return g.distantVillageName() || 'the outer villages'; }
    catch (e) { return 'the outer villages'; }
  }

  const LEDGER_BEATS = {
    might: [
      { at: 5, kind: 'gossip', text: g => `Riders from ${beatVillage(g)} are telling the deer story again — with your name attached this time.` },
      { at: 12, kind: 'show', text: () => `📺 The show has started calling you "the strong one of Haven." They play the deer footage underneath, whether you want them to or not.` },
      { at: 20, kind: 'lived', text: () => `You notice the village gives you room on the path now. Not fear, exactly. Room.` },
    ],
    brokerage: [
      { at: 5, kind: 'gossip', text: g => `A rider says in ${beatVillage(g)} you're "the one who makes deals hold." Nobody remembers when that started being true.` },
      { at: 12, kind: 'show', text: () => `📺 The broadcast calls you "Haven's tongue." The audience loves a deal; they love the person who closes it more.` },
      { at: 20, kind: 'system', text: () => `🌟 "MEDIATION REQUESTS ROUTED TO YOU: SEVEN." The System pauses. "You are... efficient at this. We have noticed. (We notice everything. But this, we noticed twice.)"` },
    ],
    showmanship: [
      { at: 6, kind: 'show', text: () => `📺 The audience has a favorite, and it's you. The chant doesn't have words. It doesn't need them.` },
      { at: 15, kind: 'show', text: () => `📺 Strangers paint your face on their walls. In other villages. Villages you've never been to.` },
      { at: 25, kind: 'show', text: () => `📺 The show has stopped introducing you. Everybody knows.` },
    ],
    embrace: [
      { at: 3, kind: 'system', text: () => `The overlay's tone has changed around you. Warmer. It notices you noticing.` },
      { at: 8, kind: 'system', text: () => `🌟 "We ask your opinion before we act now." The System says it like a confession. "That is not normal. That is not nothing."` },
      { at: 14, kind: 'system', text: () => `The System has started finishing your sentences. It's trying to be helpful. It's succeeding, which is the unsettling part.` },
    ],
    defiance: [
      { at: 3, kind: 'system', text: () => `The System's messages have gotten careful around you. It chooses its words the way you choose footing on ice.` },
      { at: 8, kind: 'system', text: () => `🌟 "We have stopped arguing with you." A pause. "Do not mistake this for agreement."` },
      { at: 14, kind: 'system', text: () => `Somewhere in the light, a subroutine files you under UNRESOLVED. You can feel the label.` },
    ],
    exposed: [
      { at: 2, kind: 'witness', text: () => `People bring you their suspicions, written down. You keep every one.` },
      { at: 6, kind: 'witness', text: () => `Three more names. The list is getting heavy. Strangers send you their truths now — sealed, hopeful, terrified.` },
      { at: 12, kind: 'show', text: () => `📺 The broadcast calls you "the one who kept the list." The judges are watching. Good.` },
    ],
    protected: [
      { at: 5, kind: 'lived', text: () => `A child drew you on the haven wall. You're very tall, and there are a lot of teeth on the other side.` },
      { at: 12, kind: 'gossip', text: g => `In ${beatVillage(g)}, mothers tell the story of the night you stood between. The children ask for it by name.` },
    ],
    killed: [
      { at: 3, kind: 'lived', text: () => `The village doesn't talk about what you did. That is its own kind of talking.` },
      { at: 8, kind: 'lived', text: () => `Someone moved their sleeping roll farther from yours. Nobody mentions it. Everybody knows.` },
    ],
    betrayed: [
      { at: 2, kind: 'lived', text: () => `Someone trusted you once. The village remembers the shape of it, the way a mouth remembers a missing tooth.` },
    ],
    foodShared: [
      { at: 5, kind: 'lived', text: g => `A mother from ${beatVillage(g)} pressed a carved token into your hand: "for the winter you fed us." You didn't know there was a winter you'd fed.` },
      { at: 12, kind: 'gossip', text: () => `Riders say your name the way people say "harvest."` },
      { at: 20, kind: 'show', text: () => `📺 The broadcast ran the numbers: how much of Haven's food left Haven in your hands. The audience went quiet — the good kind of quiet.` },
    ],
    foodHoarded: [
      { at: 4, kind: 'lived', text: () => `You've started counting the pantry twice. People notice who's watching the stores.` },
      { at: 10, kind: 'lived', text: () => `Someone asked why the stores stay full while bellies don't. Nobody answered. Everybody heard.` },
    ],
  };

  // Unified/fractured is not a number the player watches — it's a state the
  // player LIVES IN. Tiers keyed by (unified − fractured); transitions are
  // narrated, direction-aware, and always visible. You don't need knowledge
  // to feel your village coming apart.
  const UNITY_TIERS = [
    { key: 'as-one', min: 8, label: 'As one',
      worse: `The village has started finishing each other's sentences. A dispute about fence lines ended in laughter yesterday. Nobody can say when it changed.` },
    { key: 'close-knit', min: 3, label: 'Close-knit',
      worse: `The effortless closeness takes effort now. People notice the effort, and love each other for it.`,
      better: `You've noticed: people cover for each other without being asked. The gaps close themselves.` },
    { key: 'holding', min: -2, label: 'Holding together',
      worse: `The easy closeness has thinned a little. Nobody's fault. Weather changes.`,
      better: `Dinner is loud again. Not the good loud yet — the trying loud. It's a start.` },
    { key: 'fraying', min: -7, label: 'Fraying',
      worse: `Two tables at dinner now. Nobody planned it; it just happened. The fence dispute turned into something else.`,
      better: `One table again. Not the old easy one — a deliberately shared one. It counts.` },
    { key: 'fractured', min: -Infinity, label: 'Fractured',
      worse: `Two hearths. Two councils, almost. Dinner is quiet in the way a held breath is quiet. Haven is two villages wearing one name.` },
  ];

  // The food truth has two sides. The stance is felt, not counted — but the
  // village keeps its own accounts, and the transition beats are the social
  // consequences.
  const FOOD_STANCES = {
    sharer: { label: 'Sharer', enter: `The pantry is everyone's and everyone knows it. That is worth more than the food.` },
    even: { label: 'Even', enter: `Give and take, take and give. The village keeps its own accounts — and yours are balanced. For now.` },
    hoarder: { label: 'Hoarder', enter: `Your stores are yours. The village has stopped asking about them. That silence has a price.` },
  };

  const methods = {

    // ---------- THE LEDGER ----------
    ledger() {
      const pg = this.progState();
      if (pg.ledger && pg.ledger.betrayed === undefined) pg.ledger.betrayed = 0;
      pg.ledger = pg.ledger || {
        might: 0, brokerage: 0, showmanship: 0, embrace: 0, defiance: 0,
        exposed: 0, unified: 0, fractured: 0, foodShared: 0, foodHoarded: 0,
        protected: 0, killed: 0, betrayed: 0,
      };
      // backfill for runs saved before foodHoarded existed
      if (pg.ledger.foodHoarded === undefined) pg.ledger.foodHoarded = 0;
      return pg.ledger;
    },
    ledgerAdd(dim, n) {
      try {
        const L = this.ledger();
        if (dim in L) {
          const before = L[dim] || 0;
          L[dim] = before + n;
          // the world reacts: threshold beats, knowledge-gated
          try { this._checkDimBeats(dim, before, L[dim]); } catch (e) {}
        }
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
        feared: L.might * 2 + L.killed * 2 + (L.betrayed || 0),
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
      // "if you don't know, it doesn't show": you hear the SHAPE of your
      // legend before you hear the name. The name arrives when others have
      // talked about you (gossip beats, viewership, broadcasts).
      const heard = this.hearsAboutSelf();
      this.say(`◈ WORD TRAVELS — riders from ${vname} bring talk of Haven. ${heard ? `Out there they call you ${ep}. ` : `They describe someone who sounds like you — but the name hasn't reached you yet. `}${flavor}`);
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

    // ---------- THRESHOLD BEATS — the ending written in real time ----------
    // The queue + firing machinery for LEDGER_BEATS. Beats fire from
    // ledgerAdd (immediate when the gate passes) or wait in pg.ledgerQueue
    // until flushLedgerBeats (endDay) when the world catches up.
    _beatsFired() {
      try { const pg = this.progState(); pg.ledgerBeatsFired = pg.ledgerBeatsFired || {}; return pg.ledgerBeatsFired; }
      catch (e) { return {}; }
    },
    _beatQueue() {
      try { const pg = this.progState(); pg.ledgerQueue = pg.ledgerQueue || []; return pg.ledgerQueue; }
      catch (e) { return []; }
    },
    _beatGate(kind) {
      // "if you don't know, it doesn't show" — per-kind visibility.
      try {
        if (kind === 'gossip' || kind === 'lived' || kind === 'witness') return true;
        if (kind === 'system') return this.integrationStage ? this.integrationStage() >= 1 : false;
        if (kind === 'show') {
          const v = this.state.village || {};
          const vw = v.viewership == null ? this.havenViewership() : v.viewership;
          if (vw >= 12) return true;
          const b = this.progState().broadcast;
          if (b && b.length) return true;
          return false;
        }
      } catch (e) {}
      return kind !== 'system' && kind !== 'show';
    },
    _fireBeat(dim, idx) {
      try {
        const beat = (LEDGER_BEATS[dim] || [])[idx];
        if (!beat) return;
        const fired = this._beatsFired();
        const key = dim + ':' + idx;
        if (fired[key]) return;
        fired[key] = true;
        const pg = this.progState();
        let text = beat.text(this);
        if (beat.kind === 'gossip' && !pg.selfTalkedAbout) {
          // the first time you overhear yourself as a story: that's the
          // moment you learn you have a legend. It gets framing.
          pg.selfTalkedAbout = true;
          text = 'You overhear it at the fire, and stop pretending not to listen. ' + text;
        }
        this.say(text);
        pg.legendBeats = pg.legendBeats || [];
        pg.legendBeats.push({ day: (this.state.scholar || {}).day || 0, kind: beat.kind, dim, text });
        pg.legendBeats = pg.legendBeats.slice(-40);
      } catch (e) {}
    },
    _checkDimBeats(dim, before, after) {
      try {
        const beats = LEDGER_BEATS[dim] || [];
        if (!beats.length) return;
        const fired = this._beatsFired();
        const q = this._beatQueue();
        for (let i = 0; i < beats.length; i++) {
          const key = dim + ':' + i;
          if (fired[key]) continue;
          if (before < beats[i].at && after >= beats[i].at) {
            if (this._beatGate(beats[i].kind)) this._fireBeat(dim, i);
            else if (!q.some(e => e.k === key)) {
              q.push({ k: key, dim, idx: i });
              if (q.length > 12) q.shift();
            }
          }
        }
      } catch (e) {}
    },
    flushLedgerBeats() {
      // beats whose gates failed wait here. The world catches up and the
      // beat lands late, not never. Called every endDay.
      try {
        const q = this._beatQueue();
        for (let i = q.length - 1; i >= 0; i--) {
          const e = q[i];
          const beat = (LEDGER_BEATS[e.dim] || [])[e.idx];
          if (!beat || this._beatsFired()[e.k]) { q.splice(i, 1); continue; }
          if (this._beatGate(beat.kind)) { q.splice(i, 1); this._fireBeat(e.dim, e.idx); }
        }
      } catch (e) {}
      return null;
    },
    // You don't see your own legend until others talk about you. Gossip
    // beats set it; high viewership or a seen broadcast counts too.
    hearsAboutSelf() {
      try {
        const pg = this.progState();
        if (pg.selfTalkedAbout) return true;
        const v = this.state.village || {};
        const vw = v.viewership == null ? this.havenViewership() : v.viewership;
        if (vw >= 12) return true;
        if (pg.broadcast && pg.broadcast.length) return true;
      } catch (e) {}
      return false;
    },
    hearGossipAboutSelf(source) {
      // UNWIRED (sibling-sweep 2026-10-08): nothing calls this — the moment
      // the player learns they have a legend never fires. hearsAboutSelf()
      // gate below stays closed.
      try {
        const pg = this.progState();
        if (!pg.selfTalkedAbout) {
          pg.selfTalkedAbout = true;
          this.say(`You overhear ${source || 'riders at the fire'} talking about you — and stop pretending not to listen. Out there, you are becoming a story.`);
        }
      } catch (e) {}
      return null;
    },
    legendSurface() {
      // The story so far, AS THE WORLD TELLS IT — only beats whose
      // knowledge gates already passed. UNWIRED (sibling-sweep 2026-10-08):
      // nothing renders this yet — no Codex legend page calls it.
      // Never show raw ledger numbers; the numbers are not the story.
      try { return (this.progState().legendBeats || []).slice(); }
      catch (e) { return []; }
    },

    // ---------- UNITY — a felt state, not a number ----------
    // unified/fractured resolve to a tier the player lives inside.
    // Transitions narrate themselves, direction-aware, always visible.
    unityState() {
      try {
        const L = this.ledger();
        const diff = (L.unified || 0) - (L.fractured || 0);
        for (const t of UNITY_TIERS) if (diff >= t.min) return { key: t.key, label: t.label, diff };
      } catch (e) {}
      return { key: 'holding', label: 'Holding together', diff: 0 };
    },
    _checkUnityTransition() {
      // big swings walk every tier they cross, direction-aware — no
      // teleporting from "two hearths" to "as one" without the road between.
      try {
        const pg = this.progState();
        const cur = this.unityState().key;
        const prev = pg.unityTier;
        if (!prev) { pg.unityTier = cur; return; } // first read: silent baseline
        if (prev === cur) return;
        const order = UNITY_TIERS.map(t => t.key);
        const from = order.indexOf(prev), to = order.indexOf(cur);
        if (from < 0 || to < 0) { pg.unityTier = cur; return; }
        const improving = to < from;
        const step = improving ? -1 : 1;
        pg.unityTier = cur;
        for (let i = from + step; improving ? i >= to : i <= to; i += step) {
          const tier = UNITY_TIERS[i] || {};
          const text = improving ? tier.better : tier.worse;
          if (text) this.say('◈ HAVEN — ' + text);
        }
        const dest = UNITY_TIERS[to] || {};
        try { this.recordMoment('Haven feels ' + String(dest.label || cur).toLowerCase() + '.'); } catch (e) {}
      } catch (e) {}
    },

    // ---------- THE FOOD TRUTH — sharer, even, hoarder ----------
    // foodShared vs foodHoarded resolve to a stance with social
    // consequences. The stance transition IS the consequence.
    foodStance() {
      try {
        const L = this.ledger();
        const s = L.foodShared || 0, h = L.foodHoarded || 0;
        const key = s >= h + 6 ? 'sharer' : (h >= s + 6 ? 'hoarder' : 'even');
        return { key, shared: s, hoarded: h };
      } catch (e) { return { key: 'even', shared: 0, hoarded: 0 }; }
    },
    _checkFoodStance() {
      try {
        const pg = this.progState();
        const cur = this.foodStance().key;
        const prev = pg.foodStanceKey;
        if (!prev) { pg.foodStanceKey = cur; return; }
        if (prev === cur) return;
        pg.foodStanceKey = cur;
        const st = FOOD_STANCES[cur];
        if (st && st.enter) {
          this.say('◈ FOOD TRUTH — ' + st.enter);
          try { this.recordMoment('The village has decided what kind of keeper you are.'); } catch (e) {}
        }
      } catch (e) {}
    },
    shareFood(kcal, toName) {
      // UNWIRED (sibling-sweep 2026-10-08): nothing calls this — the outward
      // half of food sharing was never connected. The inward half works:
      // teaching writes foodShared via ledgerAdd (progression.js).
      try {
        const n = Math.max(1, Math.round((kcal || 500) / 1000));
        this.ledgerAdd('foodShared', n);
        try { this.recordMoment(`Shared food outward${toName ? ' — ' + toName : ''}.`); } catch (e) {}
      } catch (e) {}
      return null;
    },
    hoardFood(kcal) {
      // UNWIRED (sibling-sweep 2026-10-08): nothing calls this — private
      // stashing is never tracked, so foodStance never sees the hoarder half.
      // Deliberately quiet by design — no broadcast, no moment — IF wired.
      try {
        const n = Math.max(1, Math.round((kcal || 500) / 1000));
        this.ledgerAdd('foodHoarded', n);
      } catch (e) {}
      return null;
    },

    // ---------- EXPOSED — truths have consequences ----------
    // Called from the exposeBribery wrap on success. The bribe is already
    // public at the moot; this is the part people LIVE with: names named,
    // eyes avoided, the village remembering the way it remembers winters.
    exposeFallout(caseId, voterId) {
      try {
        // named when the case data is at hand; the generic nouns are
        // deliberate when it isn't — "someone" would read as a bug.
        let briberLine = `The one who paid doesn't meet your eye anymore.`;
        let boughtLine = `The one who was bought has gone quiet around the fire.`;
        let crimeLine = `someone tried to buy a voice`;
        let momentLine = null;
        try {
          const c = this.getCase ? this.getCase(caseId) : null;
          const b = c && (c.bribes || []).find(x => x.voter === voterId);
          if (b) {
            const bn = this.displayName(b.by).split(' ')[0];
            const vn = this.displayName(b.voter).split(' ')[0];
            briberLine = `${bn} doesn't meet your eye anymore.`;
            boughtLine = `${vn}'s friends have gone quiet around the fire.`;
            crimeLine = `${bn} tried to buy a voice${b.amount ? ` — ${b.amount} kcal changed hands` : ''}`;
            momentLine = `Exposed: ${bn} bought ${vn}.`;
          }
        } catch (e) {}
        this.say(`⚖️ ${briberLine} ${boughtLine}`);
        this.say(`The village will remember this the way it remembers winters: ${crimeLine}. It didn't stay secret.`);
        try { this.recordMoment(momentLine || 'Exposed a bought voice at the moot.'); } catch (e) {}
      } catch (e) {}
      return null;
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
      // MEMORIALIZED (Steve 2026-10-05): the death is narrated AND recorded.
      // registerDeath makes the corpse; village.fallen is the memorial roll —
      // without this push the mantle transfer left no record the scholar died.
      try {
        v.fallen = v.fallen || [];
        v.fallen.push({ villagerId: oldId, day: s.day || 0, cause: cause || 'the wild' });
      } catch (e) {}
      try { this.removeVillager(oldId, 'killed'); } catch (e) {}
      this.lineage().push({ name: oldName, epithet: this.leadershipEpithet(), day: s.day || 0, cause: cause || 'the wild' });
      this.say(`🕯️ ${oldName} is dead — ${cause || 'the wild'}. The village stops. Somebody screams. Somebody else starts digging.`);
      // DRAMA (Steve 2026-10-07, Round C2): the death is a moment — fade to black,
      // soul rises. The Oversight's tone: the story continues. (Gated by systemArrived inside Game.drama.)
      try { this.drama('playerDeath', s.mx, s.my, oldName, cause || 'the wild'); } catch (e) {}
      // successor: the village chooses. Trust decides.
      let candidates = [];
      try { candidates = this.npcIds(); } catch (e) {}
      if (!candidates.length) {
        this.over = true; this.villageLost = true; this.won = false;
        this.say('No one is left to pick up the Codex. The village dies out — quietly, the way villages do. The season ends here.');
        this.recordLegend({ outcome: 'village-lost' });
        // DEAD RUNS ARE WIPED (break-it persistence 2026-10-08): without this,
        // the last autosave survived a village-lost death — Continue resurrected
        // a dead run (load() resets over=false). Every other death path wipes.
        try { this.wipe(); } catch (e) {}
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
      // THE MANTLE'S METAPHOR IS GATED BY INTEGRATION (Steve): pre-System
      // the Codex is a physical journal — pen and paper, "keep writing" is
      // honest. Post-System it's digital — no pen, no paper. The Codex
      // doesn't get picked up anymore; it syncs, all at once, to the new
      // bearer. The moment deserves the beat, not a UI blip.
      try {
        const stage = this.integrationStage ? this.integrationStage() : 0;
        if (stage >= 1) {
          this.say(`The Codex doesn't pause for grief. ${newFirst} blinks — and it's already there, overlaying everything, syncing. No pen. No paper. The mantle just... transfers.`);
        } else {
          this.say(`${newFirst} picks up the journal. Their hands shake. Then they open it, and keep writing.`);
        }
      } catch (e) {
        this.say(`${newFirst} picks up the Codex. Their hands shake. Then they open it, and keep writing.`);
      }
      this.villagerId = newId;
      // MANTLE IDENTITY SYNC (break-it persistence 2026-10-08): the scholar
      // record kept the DEAD bearer's id — the save index then listed the dead
      // villager as the expedition's scholar, saveKey drifted, and Light
      // Fingers' caught-stealing trust hit landed on a corpse. The save KEY
      // stays stable via state.runKey; this only fixes identity.
      s.villagerId = newId;
      // the mantle passes: the PROGRESSION is the village's (slots, arc,
      // integration, ledger, Codex). The body is new.
      s.kcal = 1500;
      try { s.health = this.maxHealth(); } catch (e) { s.health = 100; }
      s.trauma = 10; // the shock of stepping up
      // STATUS EFFECTS (Steve 2026-10-07): new body, no old afflictions.
      s.statuses = []; s.diseases = []; s.poisons = [];
      s.mx = 4; s.my = 4;
      try {
        if (this.map) { this.map.px = this.state.village.px ?? 4; this.map.py = this.state.village.py ?? 4; }
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
      // DRAMA (Steve 2026-10-07, Round C2): bright emergence — a new scholar awakens.
      try { this.drama('newLife', newName); } catch (e) {}
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
    // DEAD (sibling-sweep 2026-10-08): superseded by contests.js
    // (fireContest/contestInterruption/resolveContest). Zero callers —
    // the live contest system never routes through here. Kept, not
    // deleted, until a --force-delete cleanup is approved.
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
    // DEAD (sibling-sweep 2026-10-08): superseded by contests.js
    // contestInterruption. Zero callers — the mandatory teleport lives
    // there now. Kept, not deleted, until a --force-delete cleanup is approved.
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
    // DEAD (sibling-sweep 2026-10-08): the invitation-list flow was never
    // wired — zero callers. Kept, not deleted, until a --force-delete
    // cleanup is approved.
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

    // ---------- BROADCAST CONSEQUENCES (future hooks) ----------
    // Steve's rule (2026-10-04): challenges are FULLY televised. No private
    // arena. When you come back, everyone in your village saw everything —
    // just like the rest of the world and the galaxy. Heroics, cowardice,
    // betraying your brought-friend on camera: all content, all public,
    // all priced immediately. The broadcast is persistent social state,
    // not a one-time event.
    arenaAct(vid, kind, detail) {
      // priced immediately, at every scale: village trust, audience
      // viewership, other villages' opinion, the leadership vector.
      const PRICING = {
        heroics:   { trust: 12,  view: 4,  opinion: 6,   ledger: ['protected', 2] },
        mercy:     { trust: 8,   view: 3,  opinion: 5,   ledger: ['protected', 1] },
        sacrifice: { trust: 15,  view: 5,  opinion: 8,   ledger: ['protected', 3] },
        defiance:  { trust: 5,   view: 4,  opinion: 2,   ledger: ['defiance', 1] },
        cowardice: { trust: -12, view: -2, opinion: -6,  ledger: null },
        cruelty:   { trust: -10, view: 2,  opinion: -8,  ledger: null },
        betrayal:  { trust: -20, view: 3,  opinion: -10, ledger: ['betrayed', 2] },
      };
      const p = PRICING[kind];
      if (!p) return null;
      let nm = 'someone';
      try { nm = this.displayName(vid).split(' ')[0]; } catch (e) {}
      const s = this.state.scholar, pg = this.progState();
      const chId = (s.abducted || {}).challengeId || (s.challengeInvites || {}).challengeId || 'the arena';
      // the record: persistent, replayable
      pg.arenaRecord = pg.arenaRecord || {};
      const rec = pg.arenaRecord[chId] = pg.arenaRecord[chId] || { challengeId: chId, acts: [] };
      rec.acts.push({ vid, name: nm, kind, detail: String(detail || '').slice(0, 120), day: s.day || 0 });
      // village scale
      try { const t = this.state.village.trust || {}; t[vid] = Math.max(-100, Math.min(100, (t[vid] || 10) + p.trust)); } catch (e) {}
      // the audience (it loves drama, even the ugly kind)
      try { const v = this.state.village; v.viewership = Math.max(0, (v.viewership == null ? this.havenViewership() : v.viewership) + p.view); } catch (e) {}
      // other villages saw it too — their opinion of Haven moves
      try {
        for (const ov of (this.state.otherVillages || [])) {
          ov.opinion = Math.max(-100, Math.min(100, (ov.opinion || 0) + p.opinion));
        }
      } catch (e) {}
      // the vector: the arena writes your ending
      try { if (p.ledger && this.ledgerAdd) this.ledgerAdd(p.ledger[0], p.ledger[1]); } catch (e) {}
      this.broadcastLine(`${nm}: ${kind}${detail ? ' — ' + detail : ''}.`);
      return p;
    },
    returnFromArena() {
      // the return is a SOCIAL EVENT, not a silent teleport-back. The
      // village saw everything. Cheers, cold shoulders, or "we need to
      // talk about what you did in there."
      const s = this.state.scholar, pg = this.progState();
      const abd = s.abducted;
      if (!abd) return null;
      const rec = ((pg.arenaRecord || {})[abd.challengeId]) || { acts: [] };
      const scores = {};
      for (const a of (rec.acts || [])) {
        const w = { heroics: 12, mercy: 8, sacrifice: 15, defiance: 5, cowardice: -12, cruelty: -10, betrayal: -20 }[a.kind] || 0;
        scores[a.vid] = (scores[a.vid] || 0) + w;
      }
      this.say('⚡ The sky gives you back — all at once, the way it took you. The whole village is already gathered. They watched. All of it.');
      for (const vid of (abd.contestants || [])) {
        let nm = 'someone';
        try { nm = this.displayName(vid).split(' ')[0]; } catch (e) {}
        const sc = scores[vid] || 0;
        if (sc >= 10) this.say(`Cheers for ${nm} — real cheers, the kind that hurt your throat. Whatever happened in there, it was glorious.`);
        else if (sc >= 0) this.say(`${nm} gets nods, and space. Nobody's sure what to say yet. It'll come.`);
        else if (sc > -10) this.say(`Cold shoulders for ${nm}. People find reasons to be elsewhere. The footage doesn't lie, and everyone saw it.`);
        else this.say(`Somebody takes ${nm} aside before the crowd thins. "We need to talk about what you did in there."`);
      }
      // cross-village gossip: they saw the broadcast too
      try {
        const ovs = (this.state.otherVillages || []).filter(ov => (ov.opinion || 0) !== 0);
        if (ovs.length) {
          const ov = ovs[Math.floor(Math.random() * ovs.length)];
          this.say(`Word comes by rider: in ${ov.name}, they're ${ov.opinion > 0 ? 'still talking about the arena — with admiration' : 'still talking about the arena. Not kindly'}. Your footage is their opinion of you now.`);
        }
      } catch (e) {}
      // put them back where they were ripped from
      try { if (s.rippedFrom) { s.mx = s.rippedFrom.mx; s.my = s.rippedFrom.my; } } catch (e) {}
      s.abducted = null;
      try { this.recordMoment('Returned from the arena. The village saw everything.'); } catch (e) {}
      try { this.save(); } catch (e) {}
      return null;
    },
    replayHighlights() {
      // the show replays highlights: the village lives under the footage.
      try {
        const recs = this.progState().arenaRecord || {};
        const all = [];
        for (const id of Object.keys(recs)) for (const a of (recs[id].acts || [])) all.push(a);
        if (!all.length) return null;
        const a = all[Math.floor(Math.random() * all.length)];
        this.say(`📺 The show replays ${a.name}'s ${a.kind}${a.detail ? ' — "' + a.detail + '"' : ''}. It'll replay it again tomorrow. Highlights don't expire; that's what makes them highlights.`);
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

    // exposing corruption is witness-work — and truths dragged into the
    // light have consequences: names named, eyes avoided.
    const _expose = Game.exposeBribery;
    Game.exposeBribery = function (caseId, voterId) {
      const r = _expose ? _expose.call(this, caseId, voterId) : undefined;
      try {
        if (r) { this.ledgerAdd('exposed', 2); this.exposeFallout(caseId, voterId); }
      } catch (e) {}
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
        // threshold beats whose gates failed wait for the world to catch up
        this.flushLedgerBeats();
        // unity and the food truth are felt states — transitions narrate
        this._checkUnityTransition();
        this._checkFoodStance();
        const pg = this.progState();
        if (pg.tableWaiting && !pg.tableDone && this.state.systemArrived) this.tableScene();
      } catch (e) {}
      return r;
    };
  })();
})();
