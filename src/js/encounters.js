// @ontology
// system: encounters
// description: Encounter framework. Every animal and monster follows the same pattern.
// provides:
//   - encAnimalKnown()
//   - encAnimalDef()
//   - encAnimalBehavior()
//   - encAnimalCue()
//   - encFleeText()
//   - encWaryText()
//   - encBoltDir()
//   - encPreyPhase()
//   - encPreyPhaseBadge()
//   - encWeaponMethod()
//   - encMethodWords()
//   - encPossumFlop()
//   - encBehaviorStrikeReact()
//   - encBehaviorAfterBolt()
//   - encStrikeReact()
//   - encStrikeDeadPossum()
//   - spawnEncounter()
// rules:
//   - knowledge_gated: true (code: encounters.js)
// consumes:
//   - state.encounters
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
  // Playing-dead / treed animals read differently on the grid and in popups.
  // Honest perception, not knowledge: anyone can see it's limp or up a tree.
  var _origEncAnimalLabel = G.encAnimalLabel;
  G.encAnimalLabel = function (a) {
    var label = _origEncAnimalLabel.call(this, a);
    if (a && a.pstate === 'playing_dead') label += ' — limp and still';
    if (a && a.pstate === 'taunt') label += ' — watching you, just out of reach';
    return label;
  };

  // ================= 6b. BEHAVIOR ENGINE =================
  // animals.json carries per-species `behavior` (skittish, arboreal, wary,
  // aquatic, aquatic_ambush, aquatic_defensive, flock, plays_dead, slow,
  // cunning, curious, aggressive) and `method` (snare, chase, trap, bow,
  // hands, line). The stalk/strike/flee loop was generic — every animal fled
  // the same way and the data fields sat unused. This engine turns both
  // into play: flee looks different per animal, and the wrong tool is
  // honestly worse. Steve's tool-gated doctrine, translated for the hunt:
  // never hide the strike (moment-to-moment play), but never pretend a
  // spear is a snare either.
  G.encAnimalDef = function (id) {
    try { return (this.data.animals || []).find(function (x) { return x.id === id; }) || null; } catch (e) { return null; }
  };
  G.encAnimalBehavior = function (id) {
    var d = this.encAnimalDef(id);
    return (d && d.behavior) || 'skittish';
  };
  // knownCue coaching, Highbeam-Deer style: once you've learned the animal
  // (3 encounters or a kill), the game tells you its trick up front.
  G.encAnimalCue = function (id) {
    if (!this.encAnimalKnown(id)) return null;
    var b = this.encAnimalBehavior(id);
    var CUES = {
      plays_dead: "You know this one's trick: it plays dead. Don't fall for it — or do, and be ready when it wakes.",
      arboreal: "It'll go straight up a tree when spooked. Bring something ranged, or wait it out.",
      skittish: "Skittish — it bolts at a shadow. Come in slow, or run it down.",
      wary: "Wary. Ears always tracking. Get close before it knows you're there.",
      aquatic: "One splash and it's gone. Corner it away from the water.",
      aquatic_ambush: "It sits still until you're close — then it's gone. Cover the last steps fast.",
      aquatic_defensive: "Grab it right behind the claws, fast. It pinches.",
      flock: "Spook the flock and one might lag behind. Watch for the straggler.",
      slow: "Slow. Walk up and pick it up. That's the whole hunt.",
      cunning: "Clever. It'll stay just out of reach, toying with you. Run it down.",
      curious: "Curious, not scared. It'll come look at you. Let it.",
      aggressive: "Do NOT grab this one. The beak is real. Ranged, or a trap."
    };
    return CUES[b] || null;
  };
  // Flee narration: the vivid huntText is EARNED (knowledge-gated). The
  // ignorant get the generic version — "if you don't know, it doesn't show."
  G.encFleeText = function (a, generic) {
    var d = this.encAnimalDef(a.id);
    if (d && d.huntText && this.encAnimalKnown(a.id)) return d.huntText;
    return generic || 'It bolts!';
  };
  // Windup tell: the moment an animal decides about you. Highbeam-Deer rule —
  // distinct telegraph text per species, not a generic "goes still". This is
  // honest perception (you can SEE it tense), not knowledge: the tell is
  // ungated, but the name still is (encAnimalLabel). The MEANING of the tell
  // (what it does next) is what's earned, via encAnimalCue.
  G.encWaryText = function (a) {
    var d = this.encAnimalDef(a.id);
    var label = this.encAnimalLabel(a);
    var tell = (d && d.tell) || 'goes still — ears up, deciding about you.';
    return this.encCap(label) + ' ' + tell;
  };
  // Bolt direction: away from the player. If you're standing ON its tile
  // (dist 0), "away" is undefined — it shoves past you in a random
  // direction instead of bolting in place and burning stamina for nothing.
  G.encBoltDir = function (a, px, py) {
    var dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
    if (!dx && !dy) {
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      var d = dirs[Math.floor(Math.random() * dirs.length)];
      dx = d[0]; dy = d[1];
    }
    return [dx, dy];
  };
  // Prey phases, exposed for UI siblings (attack-visuals worker): the hunt
  // is a windup → action → recovery machine, same as any monster.
  G.encPreyPhase = function (a) { return (a && a.pstate) || 'graze'; };
  G.encPreyPhaseBadge = function (a) {
    var p = this.encPreyPhase(a);
    var BADGE = {
      graze: 'grazing', wary: '⚠ wary', bolt: '💨 bolting', winded: '😮‍💨 winded',
      playing_dead: '💀 playing dead', taunt: '👀 toying with you'
    };
    return BADGE[p] || p;
  };
  // Weapon -> hunt method. Spears are hand tools; slings and bows are 'bow'.
  G.encWeaponMethod = function () {
    var w = null;
    try { w = this.equippedWeapon(); } catch (e) {}
    if (!w || w.unarmed) return 'hands';
    if (w.type === 'ranged' || (w.range || 1) >= 3) return 'bow';
    return 'hands';
  };
  G.encMethodWords = function (m) {
    return { snare: 'a snare', chase: 'running it down', trap: 'a trap', bow: 'a bow', hands: 'your hands', line: 'a fishing line' }[m] || m;
  };
  // The flop. Shared by the strike path and the awareness path — one text,
  // one fiction. Pre-knowledge the player sees a dead opossum; post, they
  // know it's faking (the unknown descriptor already says "playing dead").
  G.encPossumFlop = function (a) {
    var label = this.encAnimalLabel(a); // before the pstate flips (no suffix)
    a.pstate = 'playing_dead'; a.aware = 1; a.floppedOnce = true;
    var known = false;
    try { known = this.encAnimalKnown(a.id); } catch (e) {}
    this.say(this.encCap(label) + ' flops over, tongue lolling — playing dead. It\'s not dead. It\'s waiting for you to leave.' +
      (known ? ' You know it\'s faking.' : ''));
    try { this.audioEvent('animalFlop'); } catch (e) {}
  };
  // Strike-moment reaction, before the generic flee roll. Returns:
  //   true  — handled, strike aborted (it flopped)
  //   false — explicitly no flee (winded), strike proceeds
  //   null  — defer to the generic preyReaction flee roll
  G.encBehaviorStrikeReact = function (a) {
    var b = this.encAnimalBehavior(a.id);
    if (a.pstate === 'winded') return false;
    if (b === 'plays_dead' && (a.aware || 0) >= 0.9 && a.pstate !== 'playing_dead') {
      this.encPossumFlop(a);
      return true;
    }
    return null;
  };
  // After a generic strike-bolt, behavior takes over: the squirrel reaches a
  // trunk, the fish reaches water, the flock drops a straggler, the fox
  // holds at range and toys with you. Mirrors the animalTurn outcomes —
  // one fiction for both paths. Return values:
  //   true   — the encounter ended (treed/dived; audio fired inside)
  //   'taunt'— the fox holds at range, trotting, not bolting (quiet)
  //   false  — encounter continues; the caller fires animalBolt once
  G.encBehaviorAfterBolt = function (a) {
    var s = this.state.scholar;
    if (!s.animal) return true;
    var b = this.encAnimalBehavior(a.id);
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var detail = null;
    try { detail = this.genDetail(this.map.px, this.map.py); } catch (e) {}
    function nearKind(kinds) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var row = detail && detail[a.my + dy];
        var c = row && row[a.mx + dx];
        if (c && kinds.indexOf(c) !== -1) return true;
      }
      return false;
    }
    var cap = this.encCap(this.encAnimalLabel(a));
    if (b === 'arboreal' && nearKind(['tree', 'bigtree'])) {
      s.animal = null;
      this.say(cap + ' spirals up the trunk — chattering at you from the branches. Catch it on the ground next time.');
      try { this.audioEvent('animalChatter'); } catch (e) {}
      return true;
    }
    if ((b === 'aquatic' || b === 'aquatic_ambush') && nearKind(['water', 'creek'])) {
      s.animal = null;
      this.say(cap + ' dives — gone under. The water keeps it.');
      try { this.audioEvent('animalSplash'); } catch (e) {}
      return true;
    }
    if (b === 'flock' && Math.random() < 0.45) {
      // the flock is gone; one bird lags behind
      s.animal = { id: a.id, mx: a.mx, my: a.my, aware: 0.2, stamina: 1, pstate: 'wary', edgeTurns: 0 };
      this.say(cap + ' erupts — wings like thunder, all going different ways. One hen didn\'t get the memo: half-folded wings, your chance.');
      return false; // caller fires animalBolt
    }
    if (b === 'cunning') {
      var d2 = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      if (d2 >= 5) {
        a.pstate = 'taunt'; a.aware = 0.6;
        this.say(cap + ' trots, just out of range, looking back. It\'s toying with you.');
        return 'taunt'; // trots, not bolts — no bolt audio
      }
    }
    return false;
  };
  // Strike dispatcher. food.js loads AFTER this module, so preyReaction
  // can't be wrapped at load time — huntAnimal calls this instead, which
  // runs the behavior pre-check, then the framework reaction, then the
  // behavior post-bolt. One call site (huntAnimal), one fiction.
  G.encStrikeReact = function (a) {
    var r = null;
    try { r = this.encBehaviorStrikeReact(a); } catch (e) { r = null; }
    if (r === true) return true;   // handled (the flop) — strike aborted
    if (r === false) return false;  // explicitly no flee (winded)
    var bolted = false;
    try { bolted = this.preyReaction ? !!this.preyReaction(a) : false; } catch (e) {}
    if (bolted && this.state.scholar.animal) {
      var s = this.state.scholar;
      // SAME-TILE GUARD (food.js preyReaction bolts away-from-player, but
      // when you strike from its own tile "away" is undefined — it bolts in
      // place. food.js is another worker's file; fix the symptom here.)
      var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
      if (a.mx === px && a.my === py) {
        var bd = this.encBoltDir(a, px, py);
        var detail = null;
        try { detail = this.genDetail(this.map.px, this.map.py); } catch (e) {}
        var BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
        var nx = Math.max(0, Math.min(8, a.mx + bd[0])), ny = Math.max(0, Math.min(8, a.my + bd[1]));
        var cell = detail && detail[ny] && detail[ny][nx];
        if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; }
      }
      var after = false;
      try { after = this.encBehaviorAfterBolt(a); } catch (e) {}
      // one bolt, one sound: treed/dive fired their own; the taunting fox
      // trots (quiet); everything else that kept bolting gets the scamper.
      if (after !== true && after !== 'taunt' && this.state.scholar.animal) {
        try { this.audioEvent('animalBolt'); } catch (e) {}
      }
    }
    return bolted;
  };
  // Striking the "dead" opossum. Mostly a formality — unless it wakes up.
  G.encStrikeDeadPossum = function (a, animal) {
    var s = this.state.scholar;
    if (s.week1) s.week1.hunt++;
    try { if (this.gainAbilityXP) this.gainAbilityXP('tracker', 1); } catch (e) {}
    s.kcal = Math.max(0, s.kcal - 100);
    try { if (this.noteToolUse) this.noteToolUse(); } catch (e) {}
    if (Math.random() < 0.25) {
      // it wakes mid-swing — the trick already failed once, so now it runs
      a.pstate = 'bolt'; a.aware = 1; a.floppedOnce = true;
      var dmg = 3 + Math.floor(Math.random() * 4);
      try { s.health = Math.max(0, (s.health == null ? 100 : s.health) - dmg); } catch (e) {}
      this.feedback('It SCREECHES awake mid-swing and sinks its teeth into your hand! (-' + dmg + ' HP) It bolts, heart hammering.');
      try { this.audioEvent('animalBite'); } catch (e) {}
      this.animalTurn();
      return true;
    }
    s.animal = null;
    var kcal = animal.calories;
    try { kcal = Math.round(this.modTarget('hunt.meat_yield', animal.calories)); } catch (e) {}
    try { s.inventory.push(this.foodCarcass(animal, kcal, s.day, 'hunted')); } catch (e) {}
    this.encIdentifyAnimal(a.id); // a kill teaches you what it was — before the name is said
    try {
      this.state.codex.animalEncounters = this.state.codex.animalEncounters || {};
      this.state.codex.animalEncounters[a.id] = (this.state.codex.animalEncounters[a.id] || 0) + 1;
    } catch (e) {}
    this.feedback('It never moved. One clean strike — it was faking, too late now. About ' + kcal + ' kcal of meat on the bone — gut it quickly (knife).');
    try { this.audioEvent('animalKill'); } catch (e) {}
    return true;
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
    try { this.audioEvent('animalRustle'); } catch (e) {}
    // knownCue coaching: once you've learned the animal, its trick is
    // stated up front. Earned knowledge, not a spoiler.
    try { var acue = this.encAnimalCue(animal.id); if (acue) this.say('👁 ' + acue); } catch (e) {}
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
    var adef = null;
    try { adef = (this.data.animals || []).find(function (x) { return x.id === a.id; }) || null; } catch (e) {}
    var beh = (adef && adef.behavior) || '';
    // PER-ANIMAL BEHAVIOR (Steve 2026-10-05): animals are not monsters and not
    // interchangeable. Each behavior runs before the generic graze/wary/bolt.
    if (beh === 'slow') {
      // BOX TURTLE: it walks. That's it. Total confidence. Free pickup.
      if (Math.random() < 0.2) tryMove(a.mx + rnd3(), a.my + rnd3());
      return;
    }
    if (beh === 'plays_dead' && a.pstate !== 'playing_dead' && !a.floppedOnce) {
      // OPOSSUM: threatened → flops over. The flop is one fiction, one
      // function (encPossumFlop) — strike path and awareness path agree.
      // Once per encounter: if the trick already failed (wake-bite), it runs.
      if (dist <= 4) { this.encPossumFlop(a); return; }
    }
    if (beh === 'plays_dead' && a.pstate === 'playing_dead') {
      if (dist >= 4) { // you left: it gets up and wanders off
        s.animal = null;
        this.say('It was already gone — just a rustle in the grass.');
      }
      return; // stays put while you watch
    }
    if (beh === 'aggressive') {
      // SNAPPING TURTLE: does NOT flee. Hisses, lunges. The beak is the hunt.
      if (dist <= 2 && !a.hissed) {
        a.hissed = true; a.aware = 1;
        this.say(this.encCap(label) + ' hisses and lunges — that beak can take a finger. Keep your distance or commit.');
        try { this.audioEvent('animalHiss'); } catch (e) {}
      }
      if (dist <= 1 && Math.random() < 0.35) {
        var snapDmg = 6 + Math.floor(Math.random() * 8);
        try { s.health = Math.max(0, (s.health || 100) - snapDmg); } catch (e) {}
        this.say('It snaps! ' + snapDmg + ' damage — that beak means it.');
        try { this.audioEvent('animalBite'); } catch (e) {}
      }
      return; // never bolts
    }
    if (beh === 'curious' && dist >= cfg.notice) {
      // RACCOON: not afraid. Watches with clever hands. Sometimes approaches.
      a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.25); a.edgeTurns = 0;
      if (Math.random() < 0.3) {
        var rdx = Math.sign(px - a.mx), rdy = Math.sign(py - a.my);
        if (tryMove(a.mx + rdx, a.my + rdy)) this.say(this.encCap(label) + ' ambles closer, curious. Clever hands.');
      } else if (Math.random() < 0.3) {
        tryMove(a.mx + rnd3(), a.my + rnd3());
      }
      return;
    }
    if (beh === 'curious' && dist <= 1 && Math.random() < 0.15) {
      // RACCOON STEALS: clever hands. Lifts your lightest food and bolts.
      var inv = s.inventory || [];
      var fi = -1, fk = Infinity;
      for (var si = 0; si < inv.length; si++) {
        var it = inv[si];
        if (it && (it.kcalEach > 0 || it.foodKind) && (it.units || 1) > 0) {
          var k = (it.kcalEach || 0) * (it.units || 1);
          if (k < fk && k > 0) { fk = k; fi = si; }
        }
      }
      if (fi >= 0) {
        var stolen = inv.splice(fi, 1)[0];
        this.say(this.encCap(label) + ' snatches your ' + (stolen.name || 'food') + ' and bolts — clever hands!');
        try { this.audioEvent('animalBolt'); } catch (e) {}
        var sdx = Math.sign(a.mx - px), sdy = Math.sign(a.my - py);
        tryMove(a.mx + sdx * 2, a.my + sdy * 2) || tryMove(a.mx + sdx, a.my + sdy);
        a.pstate = 'bolt'; a.aware = 1;
        if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) s.animal = null;
        return;
      }
    }
    if ((beh === 'aquatic' || beh === 'aquatic_ambush' || beh === 'aquatic_defensive') && a.pstate === 'bolt') {
      // WATER ESCAPE: darts for the nearest water cell and dives. Gone.
      var best = null, bd = 99;
      for (var wy = 0; wy < 9; wy++) for (var wx = 0; wx < 9; wx++) {
        var wc = detail[wy] && detail[wy][wx];
        if (wc === 'water' || wc === 'creek') {
          var wd = Math.abs(wx - a.mx) + Math.abs(wy - a.my);
          if (wd < bd) { bd = wd; best = [wx, wy]; }
        }
      }
      if (best && bd <= 2) {
        a.mx = best[0]; a.my = best[1]; s.animal = null;
        this.say(this.encCap(label) + ' dives — gone under. The water keeps it.');
        try { this.audioEvent('animalSplash'); } catch (e) {}
        return;
      }
    }
    if (beh === 'arboreal' && a.pstate === 'bolt') {
      // SQUIRREL: reaches a trunk → spirals up. Uncatchable in the tree.
      var tc = detail[a.my] && detail[a.my][a.mx];
      if (tc === 'tree' || tc === 'bigtree') {
        s.animal = null;
        this.say(this.encCap(label) + ' spirals up the trunk — chattering at you from the branches. Catch it on the ground next time.');
        try { this.audioEvent('animalChatter'); } catch (e) {}
        return;
      }
    }
    if (beh === 'cunning' && a.pstate === 'bolt' && Math.random() < 0.35) {
      // FOX: jukes. Doesn't run straight — cuts sideways. Harder to corner.
      var fdx = Math.sign(a.mx - px), fdy = Math.sign(a.my - py);
      if (tryMove(a.mx - fdy, a.my + fdx) || tryMove(a.mx + fdy, a.my - fdx)) {
        this.say(this.encCap(label) + ' jukes sideways — leading you in circles.');
        try { this.audioEvent('animalBolt'); } catch (e) {}
        a.stamina -= 1;
        if (a.stamina <= 0) { a.pstate = 'winded'; this.say(this.encCap(label) + ' is winded — sides heaving. Now\'s your chance.'); try { this.audioEvent('animalPant'); } catch (e) {} }
        return;
      }
    }
    if (beh === 'wary' && a.aware >= 0.7 && a.pstate !== 'bolt' && a.pstate !== 'winded') {
      // DEER: the white tail goes up early. Explodes into motion.
      a.pstate = 'bolt'; a.aware = 1;
      this.say(this.encCap(label) + ' — white tail up — explodes into motion!');
      try { this.audioEvent('animalSnort'); } catch (e) {}
      try { this.audioEvent('animalBolt'); } catch (e) {}
    }
    if (beh === 'flock' && a.pstate === 'bolt' && !a.flockSaid) {
      // TURKEY: one spots, they all know. Loud panic, every direction.
      a.flockSaid = true;
      this.say('The flock explodes — wings hammering, panic in every direction.');
      try { this.audioEvent('animalBolt'); } catch (e) {}
    }
    if (a.pstate === 'taunt') {
      // FOX: holding at range, toying with you. Close in and it runs for real.
      if (dist < 4) { a.pstate = 'bolt'; }
      else { a.aware = Math.max(0.4, (a.aware || 0.6) - 0.1); return; }
    }
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
      // Windup tell: distinct per species (encWaryText), not the generic line.
      this.say(this.encWaryText(a));
    }
    // Bolt threshold is behavior-aware: the skittish rabbit goes at a
    // shadow (0.75); the wary deer at the white tail (0.7, above); most at 1.
    var boltAt = beh === 'skittish' ? 0.75 : 1;
    if (a.aware >= boltAt && a.pstate !== 'bolt' && a.pstate !== 'winded' && a.pstate !== 'taunt' && a.pstate !== 'playing_dead') {
      a.pstate = 'bolt';
      // Flee narration is knowledge-gated (encFleeText): the vivid huntText
      // is earned; the ignorant get the generic version.
      this.say(this.encFleeText(a, this.encCap(label) + " decides you're trouble and bolts!"));
      // DEER (Steve 2026-10-06): a deer snorts when it bolts — same beat as
      // the white-tail branch above, which only wins the race for stalkers
      // (aware jumps 0.5→1.0 in one turn for the normal player).
      if (beh === 'wary') { try { this.audioEvent('animalSnort'); } catch (e) {} }
      try { this.audioEvent('animalBolt'); } catch (e) {}
    }
    if (a.pstate === 'winded') return; // spent. your move.
    if (a.pstate === 'bolt') {
      var bd = this.encBoltDir(a, px, py);
      var dx = bd[0], dy = bd[1];
      if (beh === 'skittish' && Math.random() < 0.6) {
        // RABBIT: zigzag, not straight away. Don't chase the line — cut it off.
        var zdirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        var zd = zdirs[Math.floor(Math.random() * zdirs.length)];
        dx = zd[0]; dy = zd[1];
      }
      // ONE tile, not two — the chase is real now, and so is the hunt.
      if (!tryMove(a.mx + dx, a.my + dy)) {
        tryMove(a.mx + dx, a.my) || tryMove(a.mx, a.my + dy) || tryMove(a.mx - dy, a.my + dx);
      }
      a.stamina -= 1;
      if (a.stamina <= 0) {
        a.pstate = 'winded';
        this.say(this.encCap(label) + " is winded — sides heaving, head low. Now's your chance.");
        try { this.audioEvent('animalPant'); } catch (e) {}
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
    // the "dead" opossum: striking it resolves the trick, not the generic loop
    if (a.pstate === 'playing_dead') return this.encStrikeDeadPossum(a, animal);
    // the strike's moment of truth — behavior pre-check, then the framework
    // reaction (food.js preyReaction), then behavior post-bolt. One fiction.
    if (this.encStrikeReact(a)) return true; // it bolted (or flopped)
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
    // HANDS VS BIG GAME (Steve 2026-10-05): one-shot at range with appropriate
    // damage. Bare hands can't take a deer — the method field says how.
    var unarmedHunt = !w || (w && w.unarmed) || /^hands$/i.test(String(wname));
    if (unarmedHunt) {
      if ((animal.calories || 0) >= 10000) {
        // KNOWLEDGE GATE: never the true name pre-knowledge — the descriptor.
        this.feedback('You can\'t take ' + label + ' with your hands. Bring a bow, a spear — or a trap.');
        return true;
      }
      if ((animal.method || []).indexOf('hands') === -1) {
        chance *= 0.5; // wrong tool for the job
      }
    }
    // METHOD (Steve 2026-10-05): the animal's method field says how it's
    // hunted — snare, chase, trap, bow, hands, line. The wrong tool still
    // works, just worse, and the game says so honestly. Snares and traps are
    // their own mechanic; the strike honors bow/hands, and 'chase' is earned
    // by running it down (winded). Never hide the strike — moment-to-moment
    // play must not scroll or hunt for buttons.
    if (!unarmedHunt) {
      var wmethod = this.encWeaponMethod();
      var methods = animal.method || [];
      var methodOK = methods.indexOf(wmethod) !== -1 ||
        (methods.indexOf('chase') !== -1 && a.pstate === 'winded');
      if (!methodOK) {
        chance *= 0.65;
        if (!a._methodTold) {
          a._methodTold = true;
          var betterWords = [];
          for (var mi = 0; mi < methods.length; mi++) betterWords.push(this.encMethodWords(methods[mi]));
          this.feedback('Wrong tool for this — ' + (betterWords.join(' or ') || 'a trap') + ' would work better. Your ' + wname + ' is a compromise.');
        }
      }
    }
    // BITE (Steve 2026-10-05): close capture can cost you. Wild things have
    // teeth — not a fight, just the price of grabbing. Traps avoid this.
    if (dist <= 1) {
      var bBeh = animal.behavior || '';
      var biteP = bBeh === 'aggressive' ? 0.6 : bBeh === 'plays_dead' ? 0.3 : 0.2;
      if (Math.random() < biteP) {
        var biteDmg = bBeh === 'aggressive' ? 8 + Math.floor(Math.random() * 8) : 3 + Math.floor(Math.random() * 6);
        try { s.health = Math.max(0, (s.health || 100) - biteDmg); } catch (e) {}
        this.feedback('It bites! Teeth in your hand — ' + biteDmg + ' damage. Wild things have teeth.');
        try { this.audioEvent('animalBite'); } catch (e) {}
        if (Math.random() < 0.3) {
          this.feedback('You fumble — it wriggles free!');
          this.animalTurn(); this.animalTurn();
          return true;
        }
      }
    }
    var roll = Math.random();
    if (roll < chance) {
      s.animal = null;
      var kcal = animal.calories;
      try { kcal = Math.round(this.modTarget('hunt.meat_yield', animal.calories)); } catch (e) {}
      this.encIdentifyAnimal(a.id); // a kill teaches you what it was — BEFORE the name is said
      // ENERGY WEAPONS (Steve 2026-10-05): beams char meat — 10% calories as
      // charred remains, no hide/bones. You can't hunt with a searcaster.
      var charsMeat = false;
      try {
        var eqW = (s.equipped || {}).weapon;
        var wdef = eqW && (this.data.items || []).find(function (i) { return i.id === eqW.itemId; });
        charsMeat = !!(wdef && wdef.weapon && wdef.weapon.charsMeat);
      } catch (e) {}
      if (charsMeat) {
        var charredKcal = Math.round(kcal * 0.1);
        try { s.inventory.push(this.foodCarcass(animal, charredKcal, s.day, 'charred')); } catch (e) {}
        this.feedback('The beam takes it apart. Charred remains — about ' + charredKcal + ' kcal of edible bits. Energy weapons don\'t hunt, they unmake.');
      } else {
        try { s.inventory.push(this.foodCarcass(animal, kcal, s.day, 'hunted')); } catch (e) {}
        this.feedback('Got it — ' + animal.name + '! About ' + kcal + ' kcal of meat on the bone — gut it quickly (knife). It spoils fast.');
        // the kill thud — NOT for beam-kills above (the beam unmakes, no thud)
        try { this.audioEvent('animalKill'); } catch (e) {}
      }
      // CRAYFISH: the tiny boxer gets a pinch in on the way into the bag.
      if ((animal.behavior || '') === 'aquatic_defensive' && !charsMeat && Math.random() < 0.3) {
        var pinchDmg = 2 + Math.floor(Math.random() * 3);
        try { s.health = Math.max(0, (s.health || 100) - pinchDmg); } catch (e) {}
        this.feedback('Got it — but the tiny boxer gets a pinch in first. (-' + pinchDmg + ' HP) Grab it right behind the claws next time.');
        try { this.audioEvent('animalPinch'); } catch (e) {}
      }
      try {
        this.state.codex.animalEncounters = this.state.codex.animalEncounters || {};
        this.state.codex.animalEncounters[a.id] = (this.state.codex.animalEncounters[a.id] || 0) + 1;
      } catch (e) {}
      return true;
    }
    if (roll < chance + 0.15) {
      // near-miss: drama, not failure. It bolts — heart hammering.
      // (Verb agreement: "your hands hiss" vs "your bow hisses" can't both
      // win, so the weapon isn't the subject. You miss. Clean.)
      this.feedback('So close — ' + label + ' jinks at the last breath. You miss with your ' + wname + '. It bolts, heart hammering.');
      try { this.audioEvent('animalBolt'); } catch (e) {}
      a.aware = 1; a.pstate = 'bolt';
      this.animalTurn();
      return true;
    }
    this.feedback('Missed! ' + this.encCap(label) + ' bolts. (-100 kcal)');
    try { this.audioEvent('animalBolt'); } catch (e) {}
    a.aware = 1; a.pstate = 'bolt';
    this.animalTurn();
    return true;
  };
  G.huntAnimal._wrapped = true;

  // ================= REGISTRATION CHECKLIST (see header) =================
  G.encChecklist = function () {
    return [
      '1. Data: "unknown" strange descriptor on the animal/monster def. Animals: also "tell" (the distinct windup telegraph).',
      '2. Prey: Game.ENC_PREY entry {notice, awareRate, stamina} — loop is free.',
      '2b. Behavior: "behavior" + "method" + "tell" in animals.json drive the flee, the strike, and the windup telegraph (encAnimalBehavior / encWeaponMethod / encWaryText). Wrong tool = worse odds, honestly said.',
      '3. Threats: "encounter" config in monsters.json + game.js enc* interface.',
      '4. Telegraph: Game.encTelegraphKnown(m); cue via Game.encPickCue.',
      '5. Phases: Game.encSetPhase / Game.encPhase(ent, phase, beats).',
      '6. Feedback: Game.feedback(text) for action results.',
      '7. Test: gating, loop, feedback-at-site. See test-encounters.js.'
    ];
  };
})();
