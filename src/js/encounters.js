/* ENCOUNTER FRAMEWORK — src/js/encounters.js
 *
 * Steve: "Don't fix the deer. Fix the pattern." Every animal and every
 * monster plugs into ONE shared encounter framework. The normal deer was
 * the proof; the framework is the product.
 *
 * The framework:
 *  1. DESCRIPTOR GATING — describe() gives a strange descriptor pre-knowledge
 *     and the true name only when earned (codex observation + village naming).
 *     No true names leak anywhere. Ever.
 *  2. ENCOUNTER LOOP — approach/stalk/strike/flee as framework phases with
 *     per-species tuning. Prey reacts and flees; weapon ranges are real;
 *     tracking skill matters.
 *  3. INLINE ACTION FEEDBACK — no-scroll-up results as a primitive. The UI
 *     marks the log at action start (feedbackMark); new lines render in the
 *     feedback card right under the action bars. All encounter actions use
 *     Game.feedback(); the app wraps every action button so even plain
 *     say() output shows up where you acted.
 *  4. THREAT QUEUE — FIFO kill order, anyone-can-be-targeted, switch only on
 *     damage-taken or adjacency override. Implemented in game.js as the
 *     encThreatQueue/encNoticeFighter/encCurrentTarget/encNoticesPain/
 *     encScanThreats interface (built for the gallowdeer, driven by the
 *     mdef.encounter config block) — this module does NOT duplicate it.
 *  5. TURN-PHASE RHYTHM — declare/act/recover with legible beats, per-entity
 *     timing. The deer's aim/charge/fire/cooldown (m.beamPhase, driven by
 *     mdef.encounter.phases) is one configuration; encPhase() below is the
 *     beats-driven generic for future entities.
 *  6. CODEX-GATED TELEGRAPH — telegraph generosity scales with codex
 *     knowledge: diegetic cues only pre-knowledge (freezing, sounds),
 *     tactical warnings after earned. Implemented in game.js as
 *     encTelegraphKnown(m) (gate: "pattern" — survive a full Discharge);
 *     encPickCue() below picks the cue text by knowledge.
 *
 * REGISTRATION CHECKLIST for a new animal or monster:
 *  1. Data: give it an "unknown" strange descriptor (animals.json /
 *     monsters.json). Never the true name, never a distinctive word of it.
 *  2. Prey: add a Game.ENC_PREY entry {notice, awareRate, stamina} — the
 *     stalk/strike/flee loop is free.
 *  3. Threats: add an "encounter" config block to monsters.json
 *     {fifo, noticeRange, phases, telegraphGate, painSwitch,
 *     adjacencyOverride} and use the game.js enc* interface
 *     (encThreatQueue/encNoticeFighter/encCurrentTarget/encNoticesPain/
 *     encScanThreats/encTelegraphKnown/encSetPhase/encPhaseBadge).
 *     No custom queue code. Ever.
 *  4. Telegraph: Game.encTelegraphKnown(m) — free; pick cue text with
 *     Game.encPickCue(known, rawCue, knownCue).
 *  5. Phases: Game.encSetPhase(m, phase) + beats via Game.encPhase(ent,
 *     phase, beats) for new entities.
 *  6. Feedback: Game.feedback(text) for action results — free.
 *  7. Test: descriptor gating (no name leak), loop completes, feedback
 *     renders at the action site. See scripts/test-encounters.js.
 *
 * Self-attaching module: grabs Game, wraps prey methods, installs generics.
 * game.js's deer* functions delegate to the generics (same names, same
 * behavior — the Highbeam fight keeps working, now on shared code).
 */
(function () {
  'use strict';
  var _g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : {});
  var G = (_g.Scattering && _g.Scattering.Game) ? _g.Scattering.Game : null;
  if (!G) return;
  var S = _g.Scattering || {};

  // ================= 1. DESCRIPTOR GATING =================
  // Knowledge is earned. Until the codex says you know it, every string the
  // player sees uses the strange descriptor — never the true name.

  // Animals: 3 encounters (or a kill) teaches the name. Mirrors the plant
  // knowledge rule: knowing the name is only the start (knowledgeLevels).
  G.encAnimalKnown = function (id) {
    try { return ((this.state.codex.animalEncounters || {})[id] || 0) >= 3; }
    catch (e) { return false; }
  };
  G.encDescribeAnimal = function (adef) {
    if (!adef) return 'an animal';
    if (this.encAnimalKnown(adef.id)) return adef.description;
    return adef.unknown || 'something moving';
  };
  // A kill teaches you what it was — you're holding the body.
  G.encIdentifyAnimal = function (id) {
    try {
      this.state.codex.animalEncounters = this.state.codex.animalEncounters || {};
      this.state.codex.animalEncounters[id] = Math.max(this.state.codex.animalEncounters[id] || 0, 3);
    } catch (e) {}
  };
  // Monsters: reuse the existing progressive-disclosure naming (village-agreed
  // name wins; true name only post-System; strange descriptor otherwise).
  G.encDescribeMonster = function (mdef) {
    if (!mdef) return 'something';
    try {
      if (this.monsterDisplayName) return this.monsterDisplayName(mdef.id);
    } catch (e) {}
    return mdef.unknown || 'something';
  };

  // ================= 2. THREAT QUEUE (shared contract) =================
  // The FIFO threat queue lives in game.js as the enc* interface, built for
  // the gallowdeer and driven by the mdef.encounter config block:
  //   encThreatQueue(m)              — the queue itself (first noticed, first killed)
  //   encNoticeFighter(m, key, silent)
  //   encCurrentTarget(m)            — first live, non-fled entry wins
  //   encNoticesPain(m, attackerKey) — pain jumps the line (config: painSwitch)
  //   encScanThreats(m)              — notice range + adjacency override
  //   encTelegraphKnown(m)           — codex gate (config: telegraphGate)
  //   encSetPhase(m, phase) / encPhaseBadge(m)
  // Anyone can be targeted — player, villager, party member. The queue
  // switches ONLY on damage taken or adjacency override. Future threats:
  // add an "encounter" config block to monsters.json — no new queue code.
  // This module deliberately does NOT reimplement it.
  G.encQueueOf = function (m) {
    try { return this.encThreatQueue ? this.encThreatQueue(m) : (m.threatQueue || []); }
    catch (e) { return []; }
  };

  // ================= 3. CODEX-GATED TELEGRAPH =================
  // Telegraph generosity scales with knowledge. Pre-knowledge: diegetic cues
  // only (it freezes, it makes a sound). Post-knowledge: tactical warnings.
  // The gate itself is game.js encTelegraphKnown(m); this picks cue text.
  G.encPickCue = function (known, rawCue, knownCue) {
    return known ? knownCue : rawCue;
  };

  // ================= 4. TURN-PHASE RHYTHM =================
  // declare -> act -> recover, with legible beats. Each phase reads clearly:
  // text + optional audio. The deer's aim/charge/fire/cooldown is one
  // configuration of this machine.
  // beats: { phaseName: { text: string|fn(ent), audio: 'eventName' } }
  G.encPhase = function (ent, phase, beats) {
    ent.encPhase = phase;
    var b = (beats || {})[phase];
    if (!b) return phase;
    var txt = (typeof b.text === 'function') ? b.text(ent) : b.text;
    if (txt) this.say(txt);
    if (b.audio && this.audioEvent) { try { this.audioEvent(b.audio); } catch (e) {} }
    return phase;
  };
  // NOTE: encPhaseBadge(m) lives in game.js (the shared enc* interface) —
  // it reads m.beamPhase via the mdef.encounter config. This module does not
  // define it; do not add a second one.

  // ================= 5. INLINE ACTION FEEDBACK =================
  // The no-scroll-up pattern. The app marks the log at action start
  // (feedbackMark); every say() after the mark lands in fbLines, which the
  // UI renders in the feedback card directly under the action bars.
  // feedback(text) is the explicit path — use it for action results.
  var _origSay = G.say;
  G.say = function (msg) {
    try { this.state.logSeq = (this.state.logSeq || 0) + 1; } catch (e) {}
    var r = _origSay.call(this, msg);
    try {
      if (this.state.fbMark != null && this.state.logSeq > this.state.fbMark) {
        var buf = this.state.fbLines = this.state.fbLines || [];
        buf.push(msg);
        while (buf.length > 4) buf.shift();
      }
    } catch (e) {}
    return r;
  };
  G.feedbackMark = function () {
    try { this.state.fbMark = this.state.logSeq || 0; this.state.fbLines = []; } catch (e) {}
  };
  G.feedbackLines = function () {
    try { return (this.state.fbLines || []).slice(-4); } catch (e) { return []; }
  };
  G.feedback = function (msg) {
    try { if (this.state.fbMark == null) this.state.fbMark = (this.state.logSeq || 0); } catch (e) {}
    this.say(msg);
  };

  // ================= 6. PREY TUNING =================
  // Per-species encounter tuning. notice: chebyshev range that raises
  // awareness. awareRate: awareness gained per exposed step (0..1). stamina:
  // bolt turns before it's winded and catchable.
  var ENC_PREY_DEFAULT = { notice: 4, awareRate: 0.45, stamina: 3 };
  G.ENC_PREY = {
    white_tailed_deer: { notice: 4, awareRate: 0.50, stamina: 3 },
    wild_turkey:       { notice: 3, awareRate: 0.60, stamina: 4 },
    cottontail_rabbit: { notice: 5, awareRate: 0.70, stamina: 5 },
    gray_squirrel:     { notice: 4, awareRate: 0.60, stamina: 4 },
    gray_fox:          { notice: 5, awareRate: 0.60, stamina: 4 },
    raccoon:           { notice: 4, awareRate: 0.55, stamina: 3 },
    creek_chub:        { notice: 3, awareRate: 0.50, stamina: 2 },
    bullfrog:          { notice: 3, awareRate: 0.40, stamina: 2 },
    box_turtle:        { notice: 2, awareRate: 0.20, stamina: 1 },
    snapping_turtle:   { notice: 2, awareRate: 0.25, stamina: 2 },
    opossum:           { notice: 3, awareRate: 0.30, stamina: 2 },
    crayfish:          { notice: 2, awareRate: 0.30, stamina: 2 }
  };
  G.encPreyCfg = function (id) {
    var o = { notice: ENC_PREY_DEFAULT.notice, awareRate: ENC_PREY_DEFAULT.awareRate, stamina: ENC_PREY_DEFAULT.stamina };
    var t = (this.ENC_PREY || {})[id] || {};
    if (t.notice != null) o.notice = t.notice;
    if (t.awareRate != null) o.awareRate = t.awareRate;
    if (t.stamina != null) o.stamina = t.stamina;
    return o;
  };
  G.encAnimalLabel = function (a) {
    var adef = null;
    try { adef = (this.data.animals || []).find(function (x) { return x.id === a.id; }) || null; } catch (e) {}
    return this.encDescribeAnimal(adef);
  };
  // Descriptors start with "a"/"an" — capitalize, don't prepend "The".
  G.encCap = function (s) {
    s = String(s || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  };

  // ================= 7. PREY ENCOUNTER LOOP =================
  // Replaces the old teleport-bolt: awareness builds per step, bolting moves
  // ONE tile (the chase is real), stamina runs out (winded = catchable), and
  // the edge only swallows it after two cornered turns.
  // States: graze -> wary -> bolt -> winded. Stalking slows awareness.

  function rnd3() { return Math.floor(Math.random() * 3) - 1; }

  var _origCheckAnimals = G.checkAnimals;
  void _origCheckAnimals; // fully replaced below — kept for reference
  G.checkAnimals = function () {
    var s = this.state.scholar;
    if (s.animal) return;
    var t = this.playerTile();
    if (Math.random() > 0.3) return;
    var candidates = (this.data.animals || []).filter(function (a) { return (a.biomes || []).indexOf(t.type) !== -1; });
    if (!candidates.length) return;
    var animal = (this.pickByActivity ? this.pickByActivity(candidates) : null) ||
      candidates[Math.floor(Math.random() * candidates.length)];
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var ax = 4, ay = 4, tries = 0;
    do {
      ax = Math.floor(Math.random() * 9); ay = Math.floor(Math.random() * 9);
      tries++;
    } while (tries < 20 && Math.max(Math.abs(ax - px), Math.abs(ay - py)) < 3);
    var cfg = this.encPreyCfg(animal.id);
    s.animal = { id: animal.id, mx: ax, my: ay, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
    this.say('Movement — ' + this.encDescribeAnimal(animal) + '.');
  };
  // keep a reference for tests that want the original spawn shape
  G.checkAnimals._wrapped = true;

  G.animalTurn = function () {
    var s = this.state.scholar;
    var a = s.animal;
    if (!a || a.mx === undefined) return;
    var cfg = this.encPreyCfg(a.id);
    if (a.aware == null) a.aware = 0;
    if (a.stamina == null) a.stamina = cfg.stamina;
    if (!a.pstate) a.pstate = 'graze';
    if (a.edgeTurns == null) a.edgeTurns = 0;
    var label = this.encAnimalLabel(a);
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
    var detail = this.genDetail(this.map.px, this.map.py);
    var BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
    function tryMove(nx, ny) {
      nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny));
      var cell = detail[ny] && detail[ny][nx];
      if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; return true; }
      return false;
    }
    var stalked = !!s.stalked;
    s.stalked = false; // consumed — one quiet step buys one quiet reaction
    var trackLvl = 0;
    try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
    if (dist >= cfg.notice) {
      // grazing. it doesn't know you're here. or doesn't care yet.
      a.pstate = 'graze';
      a.aware = Math.max(0, a.aware - 0.25);
      a.edgeTurns = 0;
      if (Math.random() < 0.3) tryMove(a.mx + rnd3(), a.my + rnd3());
      return;
    }
    // within notice: awareness builds. stalkers and trackers buy time.
    var rate = cfg.awareRate * (stalked ? 0.35 : 1) * (1 - Math.min(0.45, trackLvl * 0.15));
    try {
      if (this.isNight && this.isNight() && this.skillKnown && this.skillKnown('night_hunting', 2)) rate *= 0.7;
    } catch (e) {}
    var wasWary = a.aware >= 0.5;
    a.aware = Math.min(1, a.aware + rate);
    if (!wasWary && a.aware >= 0.5 && a.pstate === 'graze') {
      a.pstate = 'wary';
      this.say(this.encCap(label) + ' freezes — ears up, deciding about you.');
    }
    if (a.aware >= 1 && a.pstate !== 'bolt' && a.pstate !== 'winded') {
      a.pstate = 'bolt';
      this.say(this.encCap(label) + " decides you're trouble and bolts!");
    }
    if (a.pstate === 'winded') return; // spent. your move.
    if (a.pstate === 'bolt') {
      var dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
      // ONE tile, not two — the chase is real now, and so is the hunt.
      if (!tryMove(a.mx + dx, a.my + dy)) {
        tryMove(a.mx + dx, a.my) || tryMove(a.mx, a.my + dy) || tryMove(a.mx - dy, a.my + dx);
      }
      a.stamina -= 1;
      if (a.stamina <= 0) {
        a.pstate = 'winded';
        this.say(this.encCap(label) + " is winded — sides heaving, head low. Now's your chance.");
        return;
      }
      if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) {
        a.edgeTurns += 1;
        if (a.edgeTurns >= 2) {
          s.animal = null;
          this.say(this.encCap(label) + ' melts into the treeline. Gone.');
          return;
        }
      } else {
        a.edgeTurns = 0;
      }
    }
  };

  // STALK: the hunt verb. One quiet tile toward the animal; awareness builds
  // slowly instead of all at once. This is how you get into range.
  G.stalkAnimal = function () {
    var s = this.state.scholar;
    var a = s.animal;
    if (!a) { this.feedback('Nothing to stalk.'); return null; }
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
    var label = this.encAnimalLabel(a);
    if (dist <= 1) { this.feedback("You're right on top of " + label + '. Strike!'); return null; }
    if (dist > 6) { this.feedback('Too far to stalk — get closer first.'); return null; }
    var detail = this.genDetail(this.map.px, this.map.py);
    var BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
    var dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
    var opts = [[dx, dy], [dx, 0], [0, dy], [dx, 1], [dx, -1], [1, dy], [-1, dy]];
    var moved = false;
    for (var i = 0; i < opts.length; i++) {
      var ox = opts[i][0], oy = opts[i][1];
      if (!ox && !oy) continue;
      var nx = px + ox, ny = py + oy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      var cell = detail[ny] && detail[ny][nx];
      if (BLOCKS[cell]) continue;
      s.mx = nx; s.my = ny; moved = true; break;
    }
    if (!moved) { this.feedback('No quiet way closer.'); return null; }
    s.kcal = Math.max(0, s.kcal - 15);
    s.stalked = true;
    try { if (this.tickAction) this.tickAction(1); } catch (e) {}
    // night stalks teach the dark — practice toward night_hunting.
    try { if (this.isNight && this.isNight() && this.nightHuntPractice) this.nightHuntPractice(); } catch (e) {}
    this.animalTurn(); // one quiet reaction
    if (!s.animal) {
      this.feedback('You stalk closer — but ' + label + ' was already gone.');
      return true;
    }
    var now = this.encAnimalLabel(s.animal);
    // TRACKING (Steve): reading sign is a skill. The tracker knows what left
    // the prints and how fresh; the ignorant see disturbed earth. Button honest.
    var trackK = false;
    try { trackK = this.trackKnown && this.trackKnown(); } catch (e) {}
    var signNote = '';
    if (trackK) {
      var spName = now;
      try { if (this.encAnimalKnown && !this.encAnimalKnown(s.animal.id)) spName = 'something'; } catch (e) {}
      signNote = ' You read the sign as you move — ' + spName + ' prints, fresh, heading ' +
        ((s.animal.mx >= px) ? 'east' : 'west') + '.';
    } else if (!s._signNoted) {
      s._signNoted = true;
      signNote = ' Disturbed earth underfoot. Something passed here — you can\'t read the rest.';
    }
    if ((s.animal.aware || 0) >= 0.5) {
      this.feedback("You stalk closer, low and slow. " + this.encCap(now) + " is watching you now. Careful." + signNote);
    } else {
      this.feedback("You stalk closer, low and slow. " + this.encCap(now) + " hasn't noticed." + signNote);
    }
    return true;
  };

  // HUNT: the strike. Range-gated, awareness-penalized, three outcomes:
  // kill (it teaches you what it was), near-miss (bolts, heart hammering),
  // clean miss (bolts). No silent failures — every outcome is narrated.
  G.huntAnimal = function () {
    var s = this.state.scholar;
    var a = s.animal;
    if (!a) return null;
    if (s.week1) s.week1.hunt++;
    // night strikes teach the dark too — practice toward night_hunting.
    try { if (this.isNight && this.isNight() && this.nightHuntPractice) this.nightHuntPractice(); } catch (e) {}
    try { if (this.gainAbilityXP) this.gainAbilityXP('tracker', 1); } catch (e) {}
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
    var w = null;
    try { w = this.equippedWeapon(); } catch (e) {}
    var range = (w && w.range) || 1;
    // WEAPON NAME HYGIENE: the unarmed fallback is literally called "your
    // hands" — composing it after "your" doubles the word ("your your hands").
    // Strip a leading "your " so every composition reads clean.
    var wname = (w && w.name) || 'hands';
    wname = String(wname).replace(/^your\s+/i, '');
    if (dist > range) {
      this.feedback('Too far. Get closer' + (range > 1 ? ' (your ' + wname + ' reaches ' + range + ')' : '') + '.');
      return null;
    }
    var animal = null;
    try { animal = (this.data.animals || []).find(function (x) { return x.id === a.id; }); } catch (e) {}
    if (!animal) return null;
    var label = this.encAnimalLabel(a);
    // the strike's moment of truth — it reacts to your move. The framework
    // owns the reaction (food.js preyReaction): descriptor-gated, aware-based.
    if (this.preyReaction && this.preyReaction(a)) return true; // it bolted
    var base = animal.difficulty === 'easy' ? 0.7 : animal.difficulty === 'medium' ? 0.4 : 0.15;
    try { base = this.modTarget('hunt.find_chance', base); } catch (e) {}
    var self = this;
    var villager = null;
    try { villager = (this.data.villagers || []).find(function (v) { return v.id === self.villagerId; }); } catch (e) {}
    var isHunter = villager && ((villager.formerOccupation || '').toLowerCase().indexOf('hunter') !== -1);
    var wbonus = 0;
    try { wbonus = this.weaponBonus() / 100; } catch (e) {}
    var trackLvl = 0;
    try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
    var trackBonus = trackLvl >= 2 ? 0.5 : trackLvl >= 1 ? 0.3 : 0;
    var relicHunt = 0;
    try {
      var S_ = _g.Scattering || {};
      if (S_.modifiers) relicHunt = S_.modifiers.resolve(0, 'hunt.success', S_.modifiers.collectModifiers(s, this.data.abilities), {});
    } catch (e) {}
    var nightHuntBonus = 0;
    try {
      if (this.isNight && this.isNight()) {
        if (this.skillKnown('night_hunting', 3)) nightHuntBonus = 0.35;
        else if (this.skillKnown('night_hunting', 2)) nightHuntBonus = 0.2;
        if (this.hasAbility && this.hasAbility('night_eyes')) nightHuntBonus += 0.1;
      }
    } catch (e) {}
    var luck = 1;
    try { luck = this.modTarget('luck.global', 1); } catch (e) {}
    // awareness penalizes the shot — a calm animal is an hittable animal.
    var awarePen = 1 - Math.min(0.5, (a.aware || 0) * 0.5);
    // winded prey barely dodges.
    if (a.pstate === 'winded') awarePen = 1.25;
    var chance = Math.min(0.95, (base + (isHunter ? 0.2 : 0) + wbonus + trackBonus + relicHunt + nightHuntBonus) * luck * awarePen);
    try { if (this.noteToolUse) this.noteToolUse(); } catch (e) {}
    s.kcal = Math.max(0, s.kcal - 100);
    var roll = Math.random();
    if (roll < chance) {
      s.animal = null;
      var kcal = animal.calories;
      try { kcal = Math.round(this.modTarget('hunt.meat_yield', animal.calories)); } catch (e) {}
      try { s.inventory.push(this.foodCarcass(animal, kcal, s.day, 'hunted')); } catch (e) {}
      this.encIdentifyAnimal(a.id); // a kill teaches you what it was
      try {
        this.state.codex.animalEncounters = this.state.codex.animalEncounters || {};
        this.state.codex.animalEncounters[a.id] = (this.state.codex.animalEncounters[a.id] || 0) + 1;
      } catch (e) {}
      this.feedback('Got it — ' + animal.name + '! About ' + kcal + ' kcal of meat on the bone — gut it quickly (knife). It spoils fast.');
      return true;
    }
    if (roll < chance + 0.15) {
      // near-miss: drama, not failure. It bolts — heart hammering.
      // (Verb agreement: "your hands hiss" vs "your bow hisses" can't both
      // win, so the weapon isn't the subject. You miss. Clean.)
      this.feedback('So close — ' + label + ' jinks at the last breath. You miss with your ' + wname + '. It bolts, heart hammering.');
      a.aware = 1; a.pstate = 'bolt';
      this.animalTurn();
      return true;
    }
    this.feedback('Missed! ' + this.encCap(label) + ' bolts. (-100 kcal)');
    a.aware = 1; a.pstate = 'bolt';
    this.animalTurn();
    return true;
  };
  G.huntAnimal._wrapped = true;

  // ================= REGISTRATION CHECKLIST (see header) =================
  G.encChecklist = function () {
    return [
      '1. Data: "unknown" strange descriptor on the animal/monster def.',
      '2. Prey: Game.ENC_PREY entry {notice, awareRate, stamina} — loop is free.',
      '3. Threats: "encounter" config in monsters.json + game.js enc* interface.',
      '4. Telegraph: Game.encTelegraphKnown(m); cue via Game.encPickCue.',
      '5. Phases: Game.encSetPhase / Game.encPhase(ent, phase, beats).',
      '6. Feedback: Game.feedback(text) for action results.',
      '7. Test: gating, loop, feedback-at-site. See test-encounters.js.'
    ];
  };
})();
