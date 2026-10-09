// @ontology
// system: encounters
// description: Encounter framework. Every animal and monster follows the same pattern.
// provides:
//   - encAnimalKnown(id)
//   - encAnimalLevel(id)     (codex depth 0-4; deep vectors gate on it)
//   - encWeaponMethod()      (bow > spear > hands — spear is a real method)
//   - encDescribeAnimal(adef)
//   - encIdentifyAnimal(id)
//   - encDescribeMonster(mdef)
//   - encQueueOf(m)
//   - encPickCue(known, rawCue, knownCue)
//   - encPhase(ent, phase, beats)
//   - encAudio(name, data)
//   - encKillLine(animal, kcal)
//   - encButcherHonesty(kcal, animal)
//   - encReleaseAnimal(a)
//   - feedback(msg)
//   - feedbackLines()
//   - feedbackMark()
//   - startAlienCombat(fighter)
//   - tbAlienTurn(m)
// rules:
//   - knowledge_gated: true (code: encounters.js)
//   - (alien-wiring) alien-player pool rolls SEPARATE from monsters in checkEncounter (guarded); hostile person-fighters take bespoke tbAlienTurn via tbMonsterTurn+tbHostileTurn intercepts, never the monster/betrayal pipelines; tbEndCheck counts alien hostiles (code: encounters.js)
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
    // KNOWLEDGE GATE (Steve 2026-10-07): delegates to the unified canShow.
    // The region + encounter logic lives in Game.canShow('animal', ...).
    try { return this.canShow('animal', id, 'name'); }
    catch (e) { return false; }
  };
  // Animal knowledge depth (Steve 2026-10-09, bear rework): codex.animals
  // levels 1-4. Deep truths (trichinosis, fat rendering) live at L4 — the
  // name alone (L1) must never leak them.
  G.encAnimalLevel = function (id) {
    try {
      var e = (this.state.codex.animals || {})[id];
      return (e && e.level) || 0;
    } catch (err) { return 0; }
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
    // KNOWLEDGE RECORD (break-it 2026-10-09): holding the body teaches the
    // species (L1) — the fiction this function's comment always promised.
    // The bear rework's vectorLevel gate reads codex.animals[].level, and
    // nothing else wrote it on a kill, so the gate defaulted every hunted
    // animal to 0 and the disease-vector line went silent on kills
    // ("default: shown at L1 like before" was false for 34 animals).
    // Quiet: the kill line already says the name; no downgrade, no repeat.
    try { if (this._noteAnimalDepth) this._noteAnimalDepth(id, 1, { type: 'kill' }); } catch (e) {}
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
  // ================= 4b. HUNT AUDIO RESOLUTION =================
  // AUDIO FALLBACK (Steve 2026-10-06; contract fulfilled 2026-10-07): Game.audioEvent
  // silently no-ops when the CombatAudio registry (app.js) has no such synth.
  // 'animalPanic' (cornered-prey detonation, fired in the cornered branch) NOW
  // has a real registry synth (app.js animalPanic, break-it audio r2/r3 audit),
  // so the hook resolves directly; encAudio keeps the fallback map anyway —
  // if a future hook name lacks a synth, the panic still composes from
  // registered freaks (bolt-thrash + brush-rustle, plus the bite-snap the
  // cornered branch already fires on top). Zero silent beats.
  var ENC_AUDIO_FALLBACK = {
    animalPanic: ['animalBolt', 'animalRustle'],
  };
  G.encAudio = function (name, data) {
    var fn = null;
    try { fn = this.audio && this.audio[name]; } catch (e) {}
    if (typeof fn === 'function') { try { fn.call(this.audio, data || {}); } catch (e) {} return true; }
    var fb = ENC_AUDIO_FALLBACK[name] || [];
    for (var i = 0; i < fb.length; i++) {
      var f2 = null;
      try { f2 = this.audio && this.audio[fb[i]]; } catch (e) {}
      if (typeof f2 === 'function') { try { f2.call(this.audio, data || {}); } catch (e) {} }
    }
    return fb.length > 0;
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
    crayfish:          { notice: 2, awareRate: 0.30, stamina: 2 },
    // NEW SPECIES (Steve 2026-10-06): the snake stands its ground (low notice,
    // strikes instead of bolting); the skunk barely cares (low awareRate);
    // the muskrat dives when it bolts near water (architect => water escape).
    timber_rattlesnake: { notice: 2, awareRate: 0.60, stamina: 1 },
    striped_skunk:      { notice: 3, awareRate: 0.25, stamina: 2 },
    muskrat:            { notice: 3, awareRate: 0.55, stamina: 3 },
    // PACK 2 (Steve 2026-10-06): the boar notices late but answers with a
    // charge; the porcupine barely reacts to anything (quills are the answer);
    // the groundhog sprints for its burrow (high stamina, short race);
    // the goose spots you early and comes AT you; the woodcock is nearly
    // invisible (notice 1, slow awareness); the beaver slaps and vanishes;
    // the bobcat notices YOU first and closes in.
    wild_boar:                 { notice: 3, awareRate: 0.65, stamina: 2 },
    north_american_porcupine:   { notice: 2, awareRate: 0.20, stamina: 1 },
    groundhog:                 { notice: 4, awareRate: 0.60, stamina: 4 },
    canada_goose:              { notice: 4, awareRate: 0.70, stamina: 3 },
    american_woodcock:         { notice: 1, awareRate: 0.30, stamina: 3 },
    north_american_beaver:      { notice: 3, awareRate: 0.60, stamina: 2 },
    bobcat:                    { notice: 6, awareRate: 0.50, stamina: 4 },
    // THIN FOUR (Steve 2026-10-06): data-only animals, now given behavior.
    // The armadillo barely notices (armor is the plan); the crow notices
    // everything (notice 6, fast awareness — the mob is the hunt); the
    // bluegill guards its bed (slow to care); the rat snake freezes, hoping
    // you'll walk past.
    nine_banded_armadillo:     { notice: 2, awareRate: 0.25, stamina: 2 },
    american_crow:             { notice: 6, awareRate: 0.80, stamina: 3 },
    bluegill:                  { notice: 2, awareRate: 0.35, stamina: 2 },
    gray_rat_snake:            { notice: 2, awareRate: 0.40, stamina: 2 }
  };
  G.encPreyCfg = function (id) {
    var o = { notice: ENC_PREY_DEFAULT.notice, awareRate: ENC_PREY_DEFAULT.awareRate, stamina: ENC_PREY_DEFAULT.stamina };
    var t = (this.ENC_PREY || {})[id] || {};
    var hasTable = !!(this.ENC_PREY && this.ENC_PREY[id]); // hand-tuned entries always win
    if (t.notice != null) o.notice = t.notice;
    if (t.awareRate != null) o.awareRate = t.awareRate;
    if (t.stamina != null) o.stamina = t.stamina;
    if (!hasTable) {
      // FLEEDIFFICULTY (Steve 2026-10-07): animals.json's fleeDifficulty was
      // dead data — schemas.json validated the enum but nothing read it.
      // DECISION: wired in, not deleted. For species WITHOUT hand-tuned
      // ENC_PREY entries (the 2026-10-07 expansion animals), fleeDifficulty
      // now drives chase tuning: notice range, awareness gain per exposed
      // step, and bolt turns before winded. dangerous = it can hurt you, so
      // it notices fast. Table entries keep their hand-tuned values.
      try {
        var fdef = this.encAnimalDef(id);
        var fd = fdef && fdef.fleeDifficulty;
        // [notice, awareRate, stamina]
        var FDMAP = {
          trivial: [2, 0.25, 1], easy: [3, 0.35, 2], medium: [4, 0.50, 3],
          hard: [4, 0.65, 4], very_hard: [5, 0.80, 5], dangerous: [5, 0.85, 4]
        };
        var fm = FDMAP[fd];
        if (fm) { o.notice = fm[0]; o.awareRate = fm[1]; o.stamina = fm[2]; }
      } catch (e) {}
    }
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
    if (a && a.pstate === 'cornered') label += ' — cornered, eyes wild';
    if (a && a.pstate === 'regroup') label += ' — regrouping, wings half-folded';
    return label;
  };

  // ================= 6b. BEHAVIOR ENGINE =================
  // animals.json carries per-species `behavior` (38 as of 2026-10-07: skittish,
  // arboreal, wary, aquatic, aquatic_ambush, aquatic_defensive, flock,
  // plays_dead, slow, cunning, curious, aggressive, defensive, unbothered,
  // architect, charger, quilled, alarmed, territorial, camouflaged, sentinel,
  // stalker, armored, sentinel_mob, bedding, constrictor, aerial, ambush,
  // burrowing, cautious, pack, patient, semiaquatic, social, stealthy,
  // still, unpredictable, wading) and `method` (snare, chase, trap, bow, hands, line). The stalk/strike/flee loop was generic — every animal fled
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
  // NEVER_BOLT (Steve 2026-10-06): these animals answer a miss differently.
  // The skunk's answer is the spray; the porcupine's the quills; the goose
  // and the boar end fights instead of leaving them; the bobcat is the one
  // doing the hunting; the snake and the snapper stand their ground.
  G.encNeverBolt = function (beh) {
    return !!({ unbothered: 1, quilled: 1, territorial: 1, stalker: 1, defensive: 1, aggressive: 1, charger: 1, sentinel: 1, armored: 1, bedding: 1, sentinel_mob: 1 }[beh]);
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
      aggressive: "Do NOT grab this one. The beak is real. Ranged, or a trap.",
      defensive: "It warns first — the rattle IS the negotiation. Heed it. Pin it behind the head with a forked stick, or take it at range. Never reach.",
      unbothered: "It is not afraid of you. It has exactly one argument and it wins every argument. Trap it at dusk holding a tarp low — or just don't.",
      architect: "It dives the second it spooks and stays down longer than your nerve holds. Corner it away from the water, or trap the den mouth at dusk.",
      charger: "It paws the ground before it charges — that's your warning. Strike only when it's calm, or be ready to sidestep.",
      quilled: "Never grab it barehanded. A bow works clean; hands get quills. Flip it with a long stick if you must.",
      alarmed: "It whistles when it clocks you — and the whole meadow hears it. Wind it before it reaches the burrow, or hunt the whistlers last.",
      territorial: "It doesn't flee, it advances. Back off and it settles. Strike when it commits — and respect the wings.",
      camouflaged: "You will walk past it ten times. Sweep likely patches at dusk — it bursts from under your feet, one fast shot.",
      sentinel: "The tail-slap ends the hunt — it dives and warns the whole creek. Strike before the tail rises, or trap the slide.",
      stalker: "It is hunting you. Don't run — that invites the chase. Hold your ground, strike true, or wear the claws.",
      // THIN FOUR (Steve 2026-10-06).
      armored: "It doesn't run — the armor IS the plan. It'll hunch down and dare you. The armor turns a blow; grab the soft underbelly, or trap the grub trail at night.",
      sentinel_mob: "It sees you before you see it, and it tells everyone. Take the shot before the cawing starts — after that, the whole woods knows where you're standing.",
      bedding: "It won't leave its bed — that's the whole trick. Pressed, it darts to the center and waits. Reach down and take it, or fish the bed with a worm.",
      constrictor: "No rattle, no venom — but your hands don't know that yet. It freezes, hoping you'll walk past. Pin it behind the head; it bites only when grabbed.",
      // PACK 3 (Steve 2026-10-07): the twelve behaviors that shipped without
      // knownCue coaching. Same contract as the rest: once you've learned the
      // animal (3 encounters or a kill), its trick is stated up front.
      aerial: "It hears you coming mid-wingbeat — in the air, you don't catch it. Hunt it roosting at dawn, or wait for the water it must come down to.",
      ambush: "It waits for YOU to come close — the stillness is the trap. Spot the shape before you're in reach, and strike first. It only gets one.",
      burrowing: "Spook it and it's down a hole you never saw. Block the burrow mouth, or hunt it in the open where the hole can't help.",
      cautious: "It's not scared — it's DECIDING. Two hundred pounds of deciding. Give it the exit, never the corner; noise and bigness buy you the day.",
      pack: "There's never just one — the one you see is the assessment. The rest are the question. Watch your back trail.",
      patient: "That log isn't a log. The water erupts when you're close enough. Strike from the bank — or don't go in the water at all.",
      semiaquatic: "Land or water, it owns both. Cut off the creek and it's fast but catchable; near the water it's gone like spilled ink.",
      social: "One barks and the whole town dives. Take the sentry's shot before the alarm, or pick your moment between warnings.",
      stealthy: "The birds going silent is your only warning. If you can see it, it's already too close. Hunt it by sound — or not at all.",
      still: "It doesn't move — that's the whole defense. Look for the shape that doesn't belong. It'll watch you find it.",
      unpredictable: "It decides mood by mood. Broadside and pawing means back off — the decision is the danger. Never press an animal this size.",
      wading: "It unfolds upward — one fast shot as it goes. Stalk the shallows low; it sees movement, not you."
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
  // SLOW MISS VERB (Steve 2026-10-07): the clean-miss text said "bolts" for
  // slow-behavior animals — while their own huntTexts say they don't flee.
  // The turtle tucks, unimpressed; the gila holds its ground, mouth wider.
  // Neither bolts. Neither flinches either — they're animals, not statues.
  G.encSlowMissVerb = function (a) {
    if (a && a.id === 'gila_monster') return ' holds its ground — beaded head turning toward you, slowly, mouth open wider. It doesn\'t flee. It never was going to. (-100 kcal)';
    return ' draws into its shell — the slowest dodge in history, and it worked. It doesn\'t flee; it barely even hurries. (-100 kcal)';
  };
  // MID-CHASE NARRATION (Steve 2026-10-07): no-silent-turns is a hard rule.
  // Every bolt turn gets a line — what the animal does, how it moves, what
  // it sounds like. Species-specific, not generic. Knowledge-gated like the
  // flee text: the vivid version is earned; the ignorant get the plain one.
  G.encChaseText = function (a, hold) {
    var beh = '';
    try {
      var d = this.encAnimalDef(a.id);
      beh = (d && d.behavior) || '';
    } catch (e) {}
    var label = this.encAnimalLabel(a);
    var known = false;
    try { known = this.encAnimalKnown(a.id); } catch (e) {}
    // Per-behavior chase lines: verb phrases following the label.
    // [vividKnown, plainFallback]
    var LINES = {
      wary: [ // DEER: straight-line burst, white tail flashing
        'bounds — white tail flashing — crashing through the brush, legs a blur.',
        'crashes away through the brush, white tail up.'
      ],
      skittish: [ // RABBIT: zigzag, never the same hop twice
        'jinks left, then right — a brown blur between the stems, impossible to track.',
        'zigzags away through the grass, changing direction every hop.'
      ],
      cunning: [ // FOX: trotting just out of reach
        'trots just out of reach, looking back over its shoulder. Still toying with you.',
        'keeps its distance, trotting away, watching you.'
      ],
      flock: [ // TURKEY: flutter-hop rhythm
        'flutters hard — wings hammering — gaining ground in bursts.',
        'flaps heavily away, wings pounding the air.'
      ],
      alarmed: [ // GROUNDHOG: sprint for the burrow
        'sprints low and fast — belly nearly scraping dirt — making for the burrow.',
        'sprints low and fast toward its burrow.'
      ],
      aquatic: [ // FISH: dart for water
        'darts — a silver flash — making for deeper water.',
        'darts away toward the water.'
      ],
      aquatic_ambush: [ // FROG: slide off the bank
        'slides off the bank — barely a ripple — gone under.',
        'slips into the water and vanishes.'
      ],
      aquatic_defensive: [ // CRAYFISH: scuttle back
        'scuttles backward, claws up, retreating under its rock.',
        'backs away under cover, claws raised.'
      ],
      arboreal: [ // SQUIRREL: ground dash for the trunk
        'sprints for the nearest trunk — a grey streak across the leaf litter.',
        'dashes across the ground toward the trees.'
      ],
      architect: [ // MUSKRAT: water-bound slide
        'slides toward the water — sleek and fast, leaving a V-wake.',
        'hurries toward the water.'
      ],
      camouflaged: [ // WOODCOCK: twisting flush
        'twists away through the branches — a whir of wings, gone between the trunks.',
        'flushes again, twisting away through the trees.'
      ],
      sentinel: [ // BEAVER: already dived; fallback
        'is gone — just spreading rings where it went under.',
        'has vanished under the water.'
      ],
      sentinel_mob: [ // CROW: wingbeats
        'beats away — cawing — wings loud against the sky.',
        'flies off, cawing.'
      ],
      curious: [ // RACCOON: bursts, pausing to look back at your pockets
        'scampers off in bursts — pausing to look back, weighing your pockets.',
        'scampers away in bursts, pausing to look back.'
      ],
      plays_dead: [ // OPOSSUM: the trick failed — the run is real, waddling and hissing
        'shambles off — waddling, hissing, playing nothing now. The trick failed; the legs are real.',
        'runs — waddling, hissing.'
      ],
      cautious: [ // BLACK BEAR: not scared, just done with you
        'lopes off, unhurried — it is not scared of you, it is done with you.',
        'ambles away, unhurried.'
      ],
      patient: [ // ALLIGATOR: slow, deliberate, gone when it chooses
        'slides toward the water — slow, deliberate, gone when it chooses.',
        'slides toward the water.'
      ],
      unpredictable: [ // BISON/MOOSE: the ground tells you
        'thunders off — the ground telling you what the eyes already did.',
        'charges away, the ground shaking.'
      ],
      semiaquatic: [ // MINK: in the water, out, gone between the reeds
        'ripples along the bank — in the water, out, gone between the reeds.',
        'darts along the bank.'
      ],
      aerial: [ // BAT: erratic, untouchable
        'flutters up and away — erratic, untouchable, laughing in ultrasound.',
        'flutters away into the dark.'
      ],
      ambush: [ // OWL: no wingbeat, just gone
        'lifts off silent — no wingbeat, just gone between the trunks.',
        'lifts off silently, gone.'
      ],
      wading: [ // HERON: heavy liftoff, further down the creek
        'lifts off heavy — wings slow and huge — settling further down the creek.',
        'lifts off, wings beating slow.'
      ],
      burrowing: [ // CHIPMUNK: stop-start bursts, cheek pouches bouncing
        'dashes for the burrow in stop-start bursts — cheek pouches bouncing.',
        'dashes for its burrow.'
      ],
      pack: [ // COYOTE: the pack answers back
        "lopes off, yipping — the pack's answer coming back through the trees.",
        'lopes away, yipping.'
      ],
      social: [ // PRAIRIE DOG: one last bark as it goes under
        'dives for the burrow — one last bark as it goes under.',
        'dives into its burrow.'
      ],
      constrictor: [ // RAT SNAKE: no hurry, no sound, just gone
        'flows away through the grass — no hurry, no sound, just gone.',
        'slides away through the grass.'
      ],
      // STILL/STEALTHY (Steve 2026-10-08): the two fleers that had no chase
      // lines — owl and panther got the generic fallback. The owl leaves
      // like it hunted: one beat of stillness too many, then a silent glide.
      // The panther doesn't run at all. It just stops being there.
      still: [ // SPOTTED OWL: the beat too long, then the silent drop
        'holds one beat too long — then drops off its branch and glides, silent, banking away between the trunks.',
        "drops off its branch and glides silently away."
      ],
      stealthy: [ // FLORIDA PANTHER: no run — just gone
        "doesn't run — it simply stops being there. The grass settles behind nothing.",
        'melts back into the brush, silent.'
      ]
    };
    // HELD-AT-EDGE LINES (Steve 2026-10-07): the chase turn where the animal
    // reaches the treeline but doesn't exit — it's deciding whether to risk
    // it. Still species-distinct, still knowledge-gated. The player reads
    // the decision, not a moving icon.
    var HOLD = {
      wary: [ // DEER: measuring the gap past you
        'stands at the treeline, head high — tail flicking, measuring the gap past you.',
        'halts at the treeline, tail up, deciding.'
      ],
      skittish: [ // RABBIT: a brown statue, coiled for the jink
        'freezes at the treeline — a brown statue — every muscle coiled for the jink.',
        'freezes at the treeline, twitching, ready to bolt.'
      ],
      cunning: [ // FOX: weighing the woods against the chase
        'stops at the treeline and looks back at you, weighing the woods against the chase.',
        'pauses at the treeline, watching you.'
      ],
      flock: [ // TURKEY: the flock bunches behind
        'crowds the treeline, wings half-open, clucking — the flock bunches behind.',
        'bunches at the treeline, wings half-open.'
      ],
      alarmed: [ // GROUNDHOG: nearly at its hole, whistle building
        'is nearly at its hole — rearing up, the whistle building in its throat.',
        'rears up near its burrow, about to whistle.'
      ],
      aquatic: [ // FISH: one flick from deeper water
        'hangs in the shallows, gills working — one flick from deeper water.',
        'hovers at the edge of deeper water.'
      ],
      aquatic_ambush: [ // FROG: throat pulsing, ready to slide under
        "crouches at the water's edge, throat pulsing — ready to slide under.",
        "crouches at the water's edge."
      ],
      aquatic_defensive: [ // CRAYFISH: daring you to reach
        'backs against its rock, claws high — daring you to reach.',
        'backs under cover, claws raised.'
      ],
      arboreal: [ // SQUIRREL: one leap from the bark
        "pauses at the trunk's base, tail jerking — one leap from the bark.",
        'hesitates at the nearest trunk.'
      ],
      architect: [ // MUSKRAT: deciding whether to dive
        "slides to the water's lip, sleek and low — deciding whether to dive.",
        "pauses at the water's edge."
      ],
      camouflaged: [ // WOODCOCK: already half-vanished
        'settles into the leaf litter at the treeline — already half-vanished.',
        'melts into the leaf litter at the treeline.'
      ],
      curious: [ // RACCOON: still more curious than scared
        'pauses at the treeline, head cocked — still more curious than scared.',
        'hesitates at the treeline, watching you.'
      ],
      plays_dead: [ // OPOSSUM: backing toward the treeline, teeth bared
        'is up and backing toward the treeline, teeth bared, hissing — the trick failed, the run is real.',
        'backs toward the treeline, hissing.'
      ],
      cautious: [ // BLACK BEAR: deciding if you're worth the trouble
        "rises at the treeline, testing the air — deciding if you're worth the trouble.",
        'rises at the treeline, watching you.'
      ],
      patient: [ // ALLIGATOR: only the eyes move
        "slides to the water's edge and goes still — only the eyes move.",
        "goes still at the water's edge."
      ],
      unpredictable: [ // BISON/MOOSE: do not press this
        'stops at the treeline, massive head swinging toward you — do not press this.',
        'turns toward you at the treeline. Do not press it.'
      ],
      semiaquatic: [ // MINK: never quite catchable
        'dances along the bank, in and out of the reeds — never quite catchable.',
        'weaves along the bank.'
      ],
      aerial: [ // BAT: it can outlast you in the air
        'wheels overhead, circling tighter — it can outlast you in the air.',
        'circles overhead.'
      ],
      ambush: [ // OWL: watching for the move
        'lifts off its branch and hangs in the air, silent — watching for the move.',
        'lifts off, circling silently.'
      ],
      wading: [ // HERON: a statue with opinions
        "stalks to the water's edge and freezes, neck coiled — a statue with opinions.",
        "freezes at the water's edge."
      ],
      burrowing: [ // CHIPMUNK: scolding
        'dashes to its burrow mouth and pops back up, cheeks full, scolding.',
        'darts to its burrow, scolding.'
      ],
      pack: [ // COYOTE: the others answer from the dark
        'falls back to the treeline, yipping — the others answer from the dark.',
        'falls back, yipping.'
      ],
      social: [ // PRAIRIE DOG: barking the alarm
        'pops up at the burrow mouth, barking the alarm — the town goes quiet.',
        'barks the alarm from its burrow.'
      ],
      constrictor: [ // RAT SNAKE: the old trick, still running
        "freezes at the treeline, hoping you'll walk past — the old trick, still running.",
        'goes still at the treeline.'
      ],
      // STILL/STEALTHY HOLD (Steve 2026-10-08): the treeline decision for
      // the owl (unblinking — is it real?) and the panther (just eyes, then
      // just dark — it has you measured, not scared).
      still: [ // SPOTTED OWL: unblinking, deciding if you're real
        "sits at the treeline, unblinking — it hasn't decided you're real yet.",
        'sits at the treeline, watching you.'
      ],
      stealthy: [ // FLORIDA PANTHER: just eyes, then just dark
        "hangs at the treeline's edge — just eyes, then just dark. It has you measured.",
        "hangs at the treeline's edge, half-seen."
      ]
    };
    var pair = (hold ? HOLD : LINES)[beh];
    var cap = this.encCap(label);
    if (!pair) {
      // Generic fallback for behaviors without specific chase text
      if (hold) return cap + (known ? ' holds at the treeline — deciding whether to risk it.' : ' holds at the treeline, deciding.');
      return cap + (known ? ' runs — putting distance between you, fast.' : ' runs, putting distance between you.');
    }
    return cap + ' ' + (known ? pair[0] : pair[1]);
  };

  // Kill line: the vivid killText is earned the same way — a kill teaches you
  // what you were holding (encIdentifyAnimal runs before the name is said).
  // {kcal} is replaced with the real yield. Real-world anchored: fat vs
  // lean, organs first, the hazard in the guts — the parts the knowledge
  // text promises, said once, at the body. The butcher-honesty footer says
  // what you actually EAT: the gross on the bone is not the meal.
  G.encKillLine = function (animal, kcal) {
    var kt = animal && animal.killText;
    var core = null;
    try {
      if (kt && this.encAnimalKnown(animal.id)) {
        core = String(kt).split('{kcal}').join(String(kcal));
      }
    } catch (e) {}
    if (!core) core = 'About ' + kcal + ' kcal of meat on the bone.';
    // FIELD-DRESSING BONUS (hunter wiring 2026-10-07): the kill's kcal
    // already carries hunt.meat_yield — the caller applied it just above.
    // Name the skill here, at the kill, the way dress_game names it at the
    // carcass. Same phrasing both places, one fiction.
    var dressTxt = '';
    try {
      var dm = this.modTarget('hunt.meat_yield', 100) / 100;
      if (dm > 1.01) dressTxt = ' (Field Dressing ×' + (Math.round(dm * 100) / 100) + ' — your skill kept more of the carcass.)';
    } catch (e) {}
    return core + dressTxt + ' ' + this.encButcherHonesty(kcal, animal);
  };
  // BUTCHER HONESTY (Steve 2026-10-06): yield honesty — what the player
  // actually gets vs what the kill promises. The {kcal} above is the gross
  // on the bone; cleaning (knife, learned technique) keeps 40% in 4 raw
  // portions, 30% while the hands are learning. DISEASE LAW (Steve
  // 2026-10-06): sickness is feared, not chipped — raw meat is a vector,
  // and every species carries its own real one (animals.json diseaseVector:
  // ticks/Lyme on deer, trichinella in boar, tularemia in rabbits...). The
  // vector note is KNOWLEDGE-GATED (encAnimalKnown) — if you don't know the
  // animal, you don't know its diseases. Treatment is gated and honest:
  // Herbal Remedy cures disease (plant knowledge, once a day) — no remedy,
  // no cure. Processing states named in order: clean (knife) → cook (fire)
  // → smoke (fire + know-how). The knife gate is honest-blind: no knife in
  // the pack gets named, with the fix.
  G.encButcherHonesty = function (kcal, animal) {
    var knowsClean = false, hasKnife = false, vec = '';
    try { knowsClean = !!this.knowsTechnique('clean'); } catch (e) {}
    try { hasKnife = !!this.hasCuttingTool(); } catch (e) {}
    try {
      // DEEP VECTORS (Steve 2026-10-09, bear rework): some disease truths are
      // L4 knowledge (trichinosis, trichinella). The name alone must never
      // leak them — animals.json vectorLevel (default: shown at L1 like before).
      if (animal && animal.diseaseVector && this.encAnimalKnown(animal.id)) {
        var needLvl = animal.vectorLevel || 1;
        if (this.encAnimalLevel(animal.id) >= needLvl) vec = animal.diseaseVector;
      }
    } catch (e) {}
    var frac = knowsClean ? 0.40 : 0.30;
    // PORTION LAW (Steve 2026-10-09, bear rework): portions are honest —
    // ~500 kcal each, so big game becomes many pieces, never one slab.
    var net = Math.round((kcal || 0) * frac);
    var units = Math.max(1, Math.round(net / 500));
    var per = Math.round(net / units);
    var line = 'Cleans to ~' + per + ' kcal × ' + units + ' raw portions' +
      (knowsClean ? ' (you know the cuts)' : ' (your hands are learning — technique keeps more)') +
      '. Raw is a gamble — about 1-in-3 sickens you: fever by nightfall, logged as disease. Herbal Remedy cures it (plant knowledge, once a day) — no remedy, no cure.' +
      (vec ? ' ' + vec : '') +
      ' Cook it over fire; smoke what you can\'t eat soon. Gut it fast — the carcass spoils in ~2 days.';
    if (!hasKnife) line += ' You have no knife — knap a Stone knife (stone + vine, Craft in your pack) or this stays a carcass.';
    return line;
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
    // PERIOD JOIN (Steve 2026-10-06): the descriptor is a sentence; the tell
    // is another one. Comma-joining made run-ons ("head jerking the heads
    // jerk up"). The tell escalates the descriptor: idle motion, then the
    // telegraph.
    return this.encCap(label) + '. ' + this.encCap(tell);
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
      hiding: '🫥 hiding', playing_dead: '💀 playing dead', taunt: '👀 toying with you',
      hunkered: '🛡 hunkered', pawing: '⚠ pawing ground', advancing: '🪿 advancing', charging: '💥 charging',
      cornered: '😱 cornered', regroup: '🦃 regrouping'
    };
    return BADGE[p] || p;
  };
  // Weapon -> hunt method. Spears are hand tools; slings and bows are 'bow'.
  // SPEAR LADDER (Steve 2026-10-09, bear rework): bow > spear > knife/hands.
  // A spear is a real hunting weapon with reach — the method system can now
  // tell it apart from a knife. Knives and bare hands stay 'hands'.
  G.encWeaponMethod = function () {
    var w = null;
    try { w = this.equippedWeapon(); } catch (e) {}
    if (!w || w.unarmed) return 'hands';
    if (w.type === 'ranged' || (w.range || 1) >= 3) return 'bow';
    var wname = '';
    try { wname = String(w.name || '') + ' ' + String(w.itemId || '') + ' ' + String(w.recipeId || ''); } catch (e) {}
    if (/spear/i.test(wname)) return 'spear';
    return 'hands';
  };
  G.encMethodWords = function (m) {
    return { snare: 'a snare', chase: 'running it down', trap: 'a trap', bow: 'a bow', spear: 'a spear', hands: 'your hands', line: 'a fishing line', stick: 'a forked stick' }[m] || m;
  };
  // TOOL READINESS (Steve 2026-10-06): tool-gated hunting. Each hunt method
  // names what it needs: snare -> snare wire in the pack; trap -> the
  // trapping skill (or a cage); line -> fishing line; bow -> a real ranged
  // weapon equipped; hands/chase -> always available (chase is a condition,
  // not a tool). encMethodToolName names the missing piece honestly.
  G.encMethodToolReady = function (m) {
    var s = null;
    try { s = this.state.scholar; } catch (e) {}
    if (m === 'hands' || m === 'chase' || m === 'stick') return true; // sticks are everywhere
    if (m === 'bow') { try { return this.encWeaponMethod() === 'bow'; } catch (e) { return false; } }
    var inv = [];
    try { inv = (s.inventory || []).concat(s.tools || []); } catch (e) {}
    function has(re) {
      for (var i = 0; i < inv.length; i++) {
        var it = inv[i] || {};
        if (re.test(String(it.name || '') + ' ' + String(it.itemId || '') + ' ' + String(it.recipeId || ''))) return true;
      }
      return false;
    }
    if (m === 'snare') return has(/snare/i);
    if (m === 'spear') {
      try { return this.encWeaponMethod() === 'spear'; } catch (e) { return false; }
    }
    if (m === 'line') return has(/fishing[ _]?line|fishing[ _]?pole/i);
    if (m === 'trap') {
      var sk = false;
      try { sk = this.skillKnown && this.skillKnown('trapping'); } catch (e) {}
      return sk || has(/trap|cage/i);
    }
    return true;
  };
  G.encMethodToolName = function (m) {
    return { snare: 'snare wire', trap: 'the trapping skill or a cage', line: 'a fishing line', bow: 'a bow or sling', spear: 'a spear', hands: 'your hands', chase: 'running it down', stick: 'a forked stick' }[m] || m;
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
    // RAT SNAKE (Steve 2026-10-06): it was already coiled to go — your
    // strike is the signal. It pours itself into the brush before the blow
    // lands. The strike is spent; the encounter is over.
    if (b === 'constrictor' && Math.random() < 0.4) {
      this.say(this.encFleeText(a, this.encCap(this.encAnimalLabel(a)) + ' pours itself off the log and into the brush — gone before your strike lands.'));
      try { this.audioEvent('animalBolt'); } catch (e) {}
      try { this.state.scholar.animal = null; } catch (e) {}
      return true;
    }
    // NEVER-BOLT (Steve 2026-10-06): these animals stand their ground when
    // struck — the strike resolves, it never routs them. The boar answers
    // with a charge (huntAnimal hook), the goose with retaliation
    // (encMissReact), the rest with teeth/quills/chemistry (bite block).
    if (this.encNeverBolt && this.encNeverBolt(b)) return false;
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
      this.encReleaseAnimal(a);
      this.say(this.encFleeText(a, cap + ' spirals up the trunk — chattering at you from the branches. Catch it on the ground next time.'));
      try { this.audioEvent('animalChatter'); } catch (e) {}
      return true;
    }
    if ((b === 'aquatic' || b === 'aquatic_ambush' || b === 'architect') && nearKind(['water', 'creek'])) {
      this.encReleaseAnimal(a);
      this.say(this.encFleeText(a, cap + ' dives — gone under. The water keeps it.'));
      try { this.audioEvent('animalSplash'); } catch (e) {}
      return true;
    }
    if (b === 'flock' && Math.random() < 0.45) {
      // the flock is gone; one bird lags behind
      s.animal = { id: a.id, mx: a.mx, my: a.my, aware: 0.2, stamina: 1, pstate: 'wary', edgeTurns: 0, wild: a.wild };
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
    try { this.encHuntPracticed('strike'); } catch (e) {} // striking the "dead" opossum is still practice
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
    this.feedback('It never moved. One clean strike — it was faking, too late now. ' + this.encKillLine(animal, kcal));
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
    // ECOLOGY (hunter loop 2026-10-08): animals come from the LOCAL
    // population, not thin air. The 2026-10-08 rewrite dropped the game.js
    // version's wildlife link; restoring it here, on the live path.
    // Hunted-out tiles spawn nothing; simEcology regrowth refills them while
    // you're away. Same contract as traps (checkTraps).
    var _wl = (t && t.wildlife) || this.backfillWildlife(t, this.map.px, this.map.py);
    var _local = Object.keys(_wl).filter(function (sid) { return _wl[sid] > 0; });
    if (!_local.length) return; // barren ground — nothing here
    var candidates = (this.data.animals || []).filter(function (a) { return (a.biomes || []).indexOf(t.type) !== -1 && _local.indexOf(a.id) !== -1; });
    if (!candidates.length) return;
    if (Math.random() > 0.3) {
      // SIGN (Steve 2026-10-06): the tracker reads the woods even when
      // nothing shows itself. Tracker L2+: a quiet sign hint, species name
      // knowledge-gated — "if you don't know, it doesn't show."
      try {
        var sLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0;
        if (sLvl >= 2 && Math.random() < 0.25) {
          var sa = candidates[Math.floor(Math.random() * candidates.length)];
          var spName = this.encAnimalKnown(sa.id) ? sa.description : 'something';
          this.say('Sign — ' + spName + ' passed here recently. Fresh prints. Close, maybe.');
        }
      } catch (e) {}
      return;
    }
    var animal = (this.pickByActivity ? this.pickByActivity(candidates) : null) ||
      candidates[Math.floor(Math.random() * candidates.length)];
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var ax = 4, ay = 4, tries = 0;
    do {
      // INTERIOR SPAWN (Steve 2026-10-08): the grid edge is the flee-by-
      // barrier — an animal spawning ON it reaches the treeline in one bolt
      // and the chase never happens. Spawns stay on interior tiles (1..7);
      // the animal earns the edge by running, it doesn't start there.
      ax = 1 + Math.floor(Math.random() * 7); ay = 1 + Math.floor(Math.random() * 7);
      tries++;
    } while (tries < 20 && Math.max(Math.abs(ax - px), Math.abs(ay - py)) < 3);
    var cfg = this.encPreyCfg(animal.id);
    s.animal = { id: animal.id, mx: ax, my: ay, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0, wild: true };
    // the animal left the tile population to wander the detail grid
    if (t.wildlife && t.wildlife[animal.id] > 0) t.wildlife[animal.id]--;
    this.say('Movement — ' + this.encDescribeAnimal(animal) + '.');
    try { this.audioEvent('animalRustle'); } catch (e) {}
    // WOODS ON EDGE (Steve 2026-10-06): a groundhog whistle or beaver
    // tail-slap warned everything. The next animal spawns already wary —
    // one-shot, then the woods settle. Hunt the alarmists LAST, not first.
    try {
      if (s.whAlert && s.whAlert.day === s.day) {
        s.whAlert = null;
        s.animal.aware = 0.6; s.animal.pstate = 'wary';
        this.say('The woods are on edge — something warned everything here. It\'s already watching.');
      }
    } catch (e) {}
    // knownCue coaching: once you've learned the animal, its trick is
    // stated up front. Earned knowledge, not a spoiler.
    try { var acue = this.encAnimalCue(animal.id); if (acue) this.say('👁 ' + acue); } catch (e) {}
  };
  // keep a reference for tests that want the original spawn shape
  G.checkAnimals._wrapped = true;

  // ESCAPE ACCOUNTING (hunter break-it 2026-10-09): checkAnimals moves one
  // animal out of the tile's wildlife onto the detail grid (tagged a.wild).
  // An animal that ESCAPES — bolts off the grid, dives, trees, melts away —
  // is not dead: it rejoins the tile population. Kills never call this (the
  // spawn already consumed the population; the carcass is the receipt).
  // Debug-spawned animals (no a.wild) just vanish — they were never counted.
  G.encReleaseAnimal = function (a) {
    try {
      if (a && a.wild && a.id && this.map && this.map.tiles) {
        var row = this.map.tiles[this.map.py];
        var t = row && row[this.map.px];
        if (t) {
          t.wildlife = t.wildlife || {};
          t.wildlife[a.id] = (t.wildlife[a.id] || 0) + 1;
        }
      }
    } catch (e) {}
    try { this.state.scholar.animal = null; } catch (e2) {}
  };
  G.animalTurn = function () {
    var s = this.state.scholar;
    var a = s.animal;
    if (!a || a.mx === undefined) return;
    var cfg = this.encPreyCfg(a.id);
    if (a.aware == null) a.aware = 0;
    if (a.stamina == null) a.stamina = cfg.stamina;
    if (!a.pstate) a.pstate = 'graze';
    if (a.edgeTurns == null) a.edgeTurns = 0;
    // ANIMAL HUNGER (Steve 2026-10-07): hunger 0-100, rises ~1/turn. Hungry
    // animals graze for REAL — depleting the shared tile via detailRegrow,
    // the same system player/NPC foraging uses. A deer eating the greens
    // means fewer greens for you. Hunger also competes with fear: starving
    // animals hold their ground longer (boldness scales the bolt threshold).
    if (a.hunger == null) a.hunger = 30 + Math.floor(Math.random() * 30);
    a.hunger = Math.min(100, a.hunger + 1);
    // BOLDNESS: hunger bids against fear. Starving animals tolerate more of
    // you before bolting — the bolt threshold rises up to +0.2 at hunger 100.
    var boldBonus = (a.hunger || 0) > 70 ? Math.min(0.2, ((a.hunger || 0) - 70) / 150) : 0;
    a.turns = (a.turns || 0) + 1; // encounter age — the tracker's freshness read
    var label = this.encAnimalLabel(a);
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
    var detail = this.genDetail(this.map.px, this.map.py);
    var ptile = this.playerTile(); // for shared tile depletion (detailRegrow)
    var BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
    // NOISE TRACKING (Steve 2026-10-06): the woods key on sound. How loud
    // was the player's last beat? Stalk steps are crouch-quiet (the stalked
    // flag is consumed below); standing still is quieter than walking;
    // moving 2+ tiles in one beat is RUNNING — it announces you. Real
    // anchor: a deer hears a running human at ~40m, a walking one at ~15m,
    // a still one at ~5m. BALANCING 5-question: (1) anchor = real deer
    // hearing; (2) too-loud = unhuntable, too-quiet = free meat — the
    // multipliers below sit between the existing stalk 0.35 and parity;
    // (3-5) feel-verified in scripts/test-encounters-prey-20261006.js.
    var pSteps = (a.lastPX == null) ? 1 : Math.max(Math.abs(px - a.lastPX), Math.abs(py - a.lastPY));
    a.lastPX = px; a.lastPY = py;
    var ranLoud = pSteps >= 2;
    function tryMove(nx, ny) {
      nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny));
      var cell = detail[ny] && detail[ny][nx];
      if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; return true; }
      return false;
    }
    // ANIMAL HUNGER helpers: graze depletes the shared world (detailRegrow),
    // exactly like player/NPC foraging. plant->dirt; bush stays but is marked
    // stripped until it regrows.
    var self = this;
    function depleted(cx, cy) { return !!(ptile.detailRegrow && ptile.detailRegrow[cx + ',' + cy]); }
    function grazeable(cell, cx, cy) { return (cell === 'plant' || cell === 'bush') && !depleted(cx, cy); }
    function graze() {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var cx = a.mx + dx, cy = a.my + dy;
        if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
        var cell = detail[cy] && detail[cy][cx];
        if (!grazeable(cell, cx, cy)) continue;
        ptile.detailRegrow = ptile.detailRegrow || {};
        ptile.detailRegrow[cx + ',' + cy] = { day: s.day + 2, was: cell };
        if (cell === 'plant') detail[cy][cx] = 'dirt'; // picked clean, like yours
        a.hunger = Math.max(0, a.hunger - 35);
        a.mx = cx; a.my = cy;
        if (dist <= 5 && Math.random() < 0.5) {
          self.say(self.encCap(label) + ' nibbles ' + (cell === 'plant' ? 'the greens' : 'the bush') + ' bare.');
        }
        try { self.drama('wild', cx, cy); } catch (e) {}
        return true;
      }
      return false;
    }
    function nearestGraze() {
      var best = null, bd = 99;
      for (var cy = 0; cy < 9; cy++) for (var cx = 0; cx < 9; cx++) {
        var cell = detail[cy] && detail[cy][cx];
        if (!grazeable(cell, cx, cy)) continue;
        var d = Math.max(Math.abs(cx - a.mx), Math.abs(cy - a.my));
        if (d < bd) { bd = d; best = { cx: cx, cy: cy, d: d }; }
      }
      return best;
    }
    var stalked = !!s.stalked;
    s.stalked = false; // consumed — one quiet step buys one quiet reaction
    var trackLvl = 0;
    try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
    var adef = null;
    try { adef = (this.data.animals || []).find(function (x) { return x.id === a.id; }) || null; } catch (e) {}
    var beh = (adef && adef.behavior) || '';
    // HIDING (Steve 2026-10-06): the water keeps them. A missed strike at a
    // fish, frog, or crayfish doesn't rout it — it dives and stays. Wait it
    // out (a few turns) and it comes back up, forgetting you already.
    if (a.pstate === 'hiding') {
      a.hideTurns = (a.hideTurns == null ? 3 : a.hideTurns) - 1;
      if (a.hideTurns <= 0) {
        a.pstate = 'graze'; a.aware = 0.2;
        this.say('Ripples settle — ' + this.encAnimalLabel(a) + ' is back out, forgetting you already.');
      }
      return;
    }
    // PER-ANIMAL BEHAVIOR (Steve 2026-10-05): animals are not monsters and not
    // interchangeable. Each behavior runs before the generic graze/wary/bolt.
    if (beh === 'slow') {
      // BOX TURTLE: it walks. That's it. Total confidence. Free pickup.
      // (Steve 2026-10-06): the branch returned before the wary text, so
      // the tell never showed. The turtle notices you too — it just doesn't
      // care. The tell is honest perception, ungated; shown once.
      if (dist <= 3 && !a.toldSlow) { a.toldSlow = true; this.say(this.encWaryText(a)); }
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
        this.encReleaseAnimal(a);
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
    if (beh === 'defensive') {
      // TIMBER RATTLESNAKE (Steve 2026-10-06): warns first. The rattle is the
      // whole deal — heed it. Press a warned snake and it strikes: venom.
      if (dist <= 3 && !a.rattled) {
        a.rattled = true; a.aware = 1;
        this.say(this.encCap(label) + ' raises its tail — a dry rattle fills the leaf litter. It is not bluffing. Back off, or commit.');
        try { this.audioEvent('animalRattle'); } catch (e) {}
        return;
      }
      if (a.rattled && dist <= 1 && Math.random() < 0.5) {
        var vDmg = 8 + Math.floor(Math.random() * 7);
        try { s.health = Math.max(0, (s.health || 100) - vDmg); } catch (e) {}
        try { (s.poisons = s.poisons || []).push({ name: 'rattlesnake venom', day: s.day }); } catch (e) {}
        this.say('It strikes — ' + vDmg + ' damage, and the venom is in. (poisoned — find an antidote)');
        try { this.audioEvent('animalBite'); } catch (e) {}
      }
      if (dist > 4) a.rattled = false; // you left: it settles back into the litter
      return; // never bolts — it stands its ground
    }
    if (beh === 'unbothered' && dist <= 1 && !a.sprayed) {
      // STRIPED SKUNK (Steve 2026-10-06): not afraid of you. Consequence
      // animal, not dangerous animal. Press it and chemistry happens: blinded
      // for the encounter, and the smell follows you for days — everything
      // with a nose knows where you've been.
      a.sprayed = true; a.aware = 1;
      s.skunkScent = (s.skunkScent || 0) + 5;
      this.say(this.encCap(label) + " turns its back. Lifts its tail. — Your eyes are on fire. Blinded. And the smell... the smell will follow you for days. Everything with a nose knows where you've been.");
      try { this.audioEvent('animalSpray'); } catch (e) {}
      tryMove(a.mx + Math.sign(a.mx - px), a.my + Math.sign(a.my - py)); // ambles off, unhurried
      return;
    }
    if (beh === 'quilled') {
      // PORCUPINE (Steve 2026-10-06): it does not flee, ever. It has never
      // needed to. Warning = quill-rattle, back turned. Strike it barehanded
      // and the quills lodge (huntAnimal owns the consequence). Otherwise it
      // ambles, unhurried, and the generic graze/wary awareness below still
      // runs — but the bolt threshold excludes it (NEVER_BOLT).
      if (dist <= 1 && !a.quillWarned) {
        a.quillWarned = true; a.aware = 1;
        this.say(this.encCap(label) + ' turns its back — quills rising with a dry rattle, like beans in a gourd. That is the whole warning. It will not give another.');
        try { this.audioEvent('animalQuill'); } catch (e) {}
        return;
      }
      if (dist >= cfg.notice) {
        a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.25); a.edgeTurns = 0;
        if (Math.random() < 0.25) tryMove(a.mx + rnd3(), a.my + rnd3());
        return;
      }
      // within notice: it still clocks you (awareness builds below) but it
      // will not bolt — fall through to the generic awareness only.
    }
    // Unbothered otherwise: the generic graze/wary turn below runs (it still
    // notices you — the scent hook included), but the skunk NEVER bolts.
    // The spray is its answer; bolting is for animals with something to lose.
    if (beh === 'curious' && dist >= cfg.notice) {
      // RACCOON: not afraid. Watches with clever hands. Sometimes approaches.
      // NO-SILENT-TURNS (Steve 2026-10-07): the chase dissolving into
      // curiosity narrates — it was never really scared of you.
      var wasChase2 = (a.pstate === 'bolt' || a.pstate === 'regroup' || a.pstate === 'taunt');
      a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.25); a.edgeTurns = 0;
      var said2 = false;
      if (Math.random() < 0.3) {
        var rdx = Math.sign(px - a.mx), rdy = Math.sign(py - a.my);
        if (tryMove(a.mx + rdx, a.my + rdy)) { this.say(this.encCap(label) + ' ambles closer, curious. Clever hands.'); said2 = true; }
      } else if (Math.random() < 0.3) {
        tryMove(a.mx + rnd3(), a.my + rnd3());
      }
      if (wasChase2 && !said2) this.say(this.encCap(label) + ' slows — was never really scared of you — and goes back to watching. Clever hands.');
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
        if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) this.encReleaseAnimal(a);
        return;
      }
    }
    if (beh === 'territorial') {
      // CANADA GOOSE (Steve 2026-10-06): the hunt inverts. It does not flee —
      // it advances on YOU, honking, neck low. Back off (dist >= 5) and it
      // settles; at dist <= 1 the wings and beak are real. It never bolts.
      if (dist >= 5) {
        if (a.pstate === 'advancing') {
          a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.5);
          this.say(this.encCap(label) + ' settles, neck rising. It holds its patch — no grudge, just ground.');
        } else {
          a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.25);
        }
        return;
      }
      if (dist <= 1) {
        a.pstate = 'advancing'; a.aware = 1;
        var wingDmg = 4 + Math.floor(Math.random() * 6);
        try { s.health = Math.max(0, (s.health || 100) - wingDmg); } catch (e) {}
        this.say('HONK — ' + this.encCap(label) + ' is on you, wings hammering, beak pinching. (-' + wingDmg + ' HP) It has never lost a fight it started.');
        try { this.audioEvent('animalHonk'); } catch (e) {}
        return;
      }
      // dist 2-4: advances one tile toward you, honking
      a.pstate = 'advancing'; a.aware = Math.min(1, a.aware + 0.3);
      var gdx = Math.sign(px - a.mx), gdy = Math.sign(py - a.my);
      if (tryMove(a.mx + gdx, a.my + gdy)) {
        if (!a.honked) {
          a.honked = true;
          this.say(this.encCap(label) + ' honks — neck dropping level — and comes at you. Back off or commit.');
          try { this.audioEvent('animalHonk'); } catch (e) {}
        }
      }
      return;
    }
    if (beh === 'stalker') {
      // BOBCAT (Steve 2026-10-06): you are not hunting. It pads closer each
      // turn, circling. Run (dist increased since last turn) and it chases;
      // hold your ground (a.satTurns >= 3) and it loses interest and melts
      // away. At dist <= 1 the claws come out. It never bolts — it leaves
      // when the math stops working.
      var lastD = (a.lastDist == null) ? dist : a.lastDist;
      if (dist > lastD) {
        // you backed off: it follows, unhurried
        var cdx = Math.sign(px - a.mx), cdy = Math.sign(py - a.my);
        tryMove(a.mx + cdx, a.my + cdy) || tryMove(a.mx + cdx, a.my) || tryMove(a.mx, a.my + cdy);
        a.satTurns = 0;
        if (!a.chaseTold) {
          a.chaseTold = true;
          this.say(this.encCap(label) + ' pads after you, unhurried. Running invites the chase.');
          try { this.audioEvent('animalYowl'); } catch (e) {}
        }
      } else if (dist <= 1) {
        a.satTurns = 0; a.aware = 1;
        var clawDmg = 6 + Math.floor(Math.random() * 7);
        try { s.health = Math.max(0, (s.health || 100) - clawDmg); } catch (e) {}
        this.say(this.encCap(label) + ' slashes — claws raking your arm. (-' + clawDmg + ' HP) Yellow eyes, no hurry.');
        try { this.audioEvent('animalBite'); } catch (e) {}
      } else {
        // holding ground or closing: it circles closer, or loses interest
        a.satTurns = (a.satTurns || 0) + 1;
        if (a.satTurns >= 3) {
          this.encReleaseAnimal(a);
          this.say(this.encCap(label) + ' holds your gaze a long moment — then melts into the brush. You were too expensive.');
          try { this.audioEvent('animalYowl'); } catch (e) {}
          return;
        }
        var sdx2 = Math.sign(px - a.mx), sdy2 = Math.sign(py - a.my);
        if (dist > 2) tryMove(a.mx + sdx2, a.my + sdy2);
        if (!a.stalkTold) {
          a.stalkTold = true;
          this.say(this.encCap(label) + ' circles closer, yellow eyes fixed on you. It is not prey. It is deciding whether you are.');
          try { this.audioEvent('animalYowl'); } catch (e) {}
        }
      }
      a.lastDist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      return;
    }
    if (beh === 'charger') {
      // WILD BOAR (Steve 2026-10-06): warns (pawing, head low) at dist <= 3.
      // Press it (dist <= 1) or strike while it paws and it CHARGES: it moves
      // to your tile and gores. A charging boar commits — afterwards it's
      // winded (overcommitted, catchable). It never bolts; it ends fights.
      if (a.pstate === 'charging') {
        // mid-charge: it reaches you
        a.mx = px; a.my = py;
        var goreDmg = 10 + Math.floor(Math.random() * 7);
        try { s.health = Math.max(0, (s.health || 100) - goreDmg); } catch (e) {}
        a.pstate = 'winded'; a.stamina = 0; a.aware = 1;
        this.say(this.encCap(label) + ' hits you like a door — tusks raking. (-' + goreDmg + ' HP) It overshoots, blowing hard. Overcommitted. Now\'s your chance.');
        try { this.audioEvent('animalCharge'); } catch (e) {}
        return;
      }
      if (dist <= 3 && a.pstate !== 'pawing' && a.pstate !== 'winded') {
        a.pstate = 'pawing'; a.aware = Math.max(a.aware, 0.6);
        this.say(this.encWaryText(a) + ' It is not bluffing. Back off, or be ready to sidestep.');
        try { this.audioEvent('animalSnort'); } catch (e) {}
        return;
      }
      if (a.pstate === 'pawing' && dist <= 1) {
        a.pstate = 'charging';
        this.say(this.encCap(label) + ' drops its head and COMES — 150 pounds, tusks first, straight at you!');
        try { this.audioEvent('animalCharge'); } catch (e) {}
        return;
      }
      if (dist > 4 && a.pstate === 'pawing') {
        a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.4);
        this.say(this.encCap(label) + ' snorts and goes back to rooting. Wise choice.');
        return;
      }
      // otherwise the generic graze/wary below runs (it still roots around)
    }
    // THIN FOUR — behavior, not generic flee (Steve 2026-10-06).
    if (beh === 'armored') {
      // ARMADILLO: armor, not speed. It never bolts — it hunches, plates
      // locking with a clank. The armor turns a blow (huntAnimal: chance
      // *0.6 while hunkered); grab it barehanded and it may LEAP straight
      // up, three feet of armored surprise.
      if (dist <= 2 && (a.aware || 0) >= 0.7 && a.pstate !== 'hunkered') {
        a.pstate = 'hunkered'; a.aware = 1;
        this.say(this.encWaryText(a) + ' It hunches — armor plates locking. Good luck.');
        try { this.audioEvent('animalFlop'); } catch (e) {} // dull armored thud
        return;
      }
      if (a.pstate === 'hunkered' && dist > 3) {
        a.pstate = 'graze'; a.aware = Math.max(0, a.aware - 0.3);
        this.say(this.encCap(label) + ' unhunches and goes back to rooting. False alarm.');
        return;
      }
      // otherwise the generic graze/wary below runs (it still notices you —
      // the awareness builds, but the bolt threshold excludes it: NEVER_BOLT)
    }
    if (beh === 'sentinel_mob') {
      // CROW: the lookout. It spots you early and the cawing starts — the
      // whole treeline joins in, every animal nearby goes on edge for the
      // day, and it's on the dead branch, still cawing. Strike only before
      // it clocks you (aware < 0.5).
      if ((a.aware || 0) >= 0.5 && !a.mobbed) {
        a.mobbed = true;
        this.encReleaseAnimal(a);
        this.say(this.encFleeText(a, 'Cawing — three sharp barks, then the whole treeline joins in. It lifts to the dead branch, still cawing. Everything within earshot knows exactly where you\'re standing.') + ' (the woods are on edge)');
        try { this.audioEvent('animalFlush'); } catch (e) {} // wingbeats
        try { s.whAlert = { day: s.day }; } catch (e) {}
        return;
      }
      // pre-spot: it watches from the branch — generic awareness below
    }
    if (beh === 'bedding') {
      // BLUEGILL: it guards its bed — it will not leave the tile. Pressed
      // (aware 1), it darts to the bed's center and waits: hiding, but
      // grabbable (huntAnimal allows the strike — reach down and take it).
      if ((a.aware || 0) >= 1 && a.pstate !== 'hiding') {
        a.pstate = 'hiding'; a.hideTurns = 2; a.aware = 0.6;
        this.say(this.encFleeText(a, this.encCap(label) + ' darts to the middle of its bed and holds — a shadow over the circles. It\'s not leaving. Neither is the bed.'));
        try { this.audioEvent('animalSplash'); } catch (e) {}
        return;
      }
      // otherwise the generic graze/wary below runs; it never bolts (NEVER_BOLT)
    }
    if (beh === 'constrictor') {
      // RAT SNAKE: no rattle, no venom — but your hands don't know that yet.
      // It freezes, hoping you'll walk past: no special movement, awareness
      // just builds. The strike decides it (encBehaviorStrikeReact: it may
      // pour itself into the brush before your blow lands; the bite block in
      // huntAnimal owns the teeth).
      if (dist <= 3 && !a.frozeOnce) {
        a.frozeOnce = true;
        this.say(this.encWaryText(a));
        return;
      }
      // otherwise the generic graze/wary below runs
    }
    if ((beh === 'aquatic' || beh === 'aquatic_ambush' || beh === 'aquatic_defensive' || beh === 'architect') && a.pstate === 'bolt') {
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
        a.mx = best[0]; a.my = best[1]; this.encReleaseAnimal(a);
        this.say(this.encFleeText(a, this.encCap(label) + ' dives — gone under. The water keeps it.'));
        try { this.audioEvent('animalSplash'); } catch (e) {}
        return;
      }
    }
    if (beh === 'arboreal' && a.pstate === 'bolt') {
      // SQUIRREL: reaches a trunk → spirals up. Uncatchable in the tree.
      var tc = detail[a.my] && detail[a.my][a.mx];
      if (tc === 'tree' || tc === 'bigtree') {
        this.encReleaseAnimal(a);
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
    if (beh === 'wary' && a.aware >= 0.7 + boldBonus && a.pstate !== 'bolt' && a.pstate !== 'winded' && a.pstate !== 'cornered' && a.pstate !== 'regroup') {
      // DEER: the white tail goes up early. Explodes into motion.
      // (cornered/regroup excluded: a trapped or regrouping deer doesn't
      // re-bolt — the panic branch and the regroup rhythm own those turns.)
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
      else {
        a.aware = Math.max(0.4, (a.aware || 0.6) - 0.1);
        // NO-SILENT-TURNS (Steve 2026-10-07): the toying turn narrates too —
        // the fox is performing, and the player reads the performance.
        // (The label already carries "— watching you, just out of reach".)
        this.say(this.encCap(label) + ' trots in place — still toying with you.');
        return;
      }
    }
    // BEAVER (Steve 2026-10-06): the tail-slap ends the hunt. At aware 0.7 the
    // flat tail rises — the slap is already decided: CRACK, it dives, and
    // every animal on the water hears it (woods-on-edge for the day).
    if (beh === 'sentinel' && a.aware >= 0.7 && a.pstate !== 'bolt' && a.pstate !== 'winded') {
      this.encReleaseAnimal(a);
      this.say('CRACK — ' + this.encCap(label) + ' slaps the water with its flat tail and dives. Just spreading rings. Every animal on the creek heard that. (the woods are on edge)');
      try { this.audioEvent('animalTailSlap'); } catch (e) {}
      try { s.whAlert = { day: s.day }; } catch (e) {}
      return;
    }
    // GROUNDHOG (Steve 2026-10-06): the whistle warns the whole meadow.
    // Once per encounter: +woods-on-edge for the day, and the text is the
    // telegraph — you know it's about to sprint for the hole.
    if (beh === 'alarmed' && a.aware >= 0.5 && !a.whistled) {
      a.whistled = true;
      this.say(this.encWaryText(a) + ' The whistle splits the meadow, sharp, twice. Every animal for a hundred yards heard that. (the woods are on edge)');
      try { this.audioEvent('animalWhistle'); } catch (e) {}
      try { s.whAlert = { day: s.day }; } catch (e) {}
    }
    // MUSKRAT (Steve 2026-10-06): dive-happy. Near water it doesn't wait for
    // the full bolt threshold — at aware 0.6 it slides off the bank and stays
    // down. Corner it away from the water (its own knownCue says so).
    if (beh === 'architect' && (a.aware || 0) >= 0.6 && a.pstate !== 'bolt' && a.pstate !== 'winded') {
      var mwNear = false;
      for (var mdy = -1; mdy <= 1 && !mwNear; mdy++) for (var mdx = -1; mdx <= 1; mdx++) {
        var mc = detail[a.my + mdy] && detail[a.my + mdy][a.mx + mdx];
        if (mc === 'water' || mc === 'creek') mwNear = true;
      }
      if (mwNear) {
        this.encReleaseAnimal(a);
        this.say(this.encFleeText(a, this.encCap(label) + ' vanishes — under the bank before you can move. The water keeps it.'));
        try { this.audioEvent('animalSplash'); } catch (e) {}
        return;
      }
    }
    // SKUNK SPRAY (Steve 2026-10-06): you smell. Everything with a nose
    // notices you sooner — animals and monsters alike.
    // NOISE-TRIGGERED FLEE RADIUS (Steve 2026-10-06): running announces you
    // — the notice radius grows a tile. Stillness does the opposite work
    // below (awareness rate), so crouch-sneak and patience both close
    // distance, honestly.
    var noticeRange = cfg.notice + (s.skunkScent > 0 ? 2 : 0) + (ranLoud ? 1 : 0);
    // WOODCOCK (Steve 2026-10-06): leaf-litter camouflage. You only notice it
    // when you're right on top of it (range 1), and awareness builds slowly.
    // At dist <= 1 with high awareness it EXPLODES from under your feet.
    // Graze cutoff is dist >= 2 (not 1): at dist 1 it's clocking you, slowly.
    if (beh === 'camouflaged') {
      noticeRange = 1;
      if (dist <= 1 && (a.aware || 0) >= 0.75 && a.pstate !== 'bolt' && a.pstate !== 'winded') {
        a.pstate = 'bolt'; a.aware = 1;
        this.say(this.encFleeText(a, this.encCap(label) + ' EXPLODES from under your boots — a whir of wings, twisting away!'));
        try { this.audioEvent('animalFlush'); } catch (e) {}
        return; // the explosion IS this turn; it bolts next turn
      }
    }
    var grazeRange = (beh === 'camouflaged') ? 2 : noticeRange;
    if (dist >= grazeRange) {
      // grazing. it doesn't know you're here. or doesn't care yet.
      // NO-SILENT-TURNS (Steve 2026-10-07): a chase that ends in a calm-down
      // narrates the transition — it lost you, and the player sees the
      // decision. An already-grazing animal stays quiet (grazing is the
      // default silence, not a transition).
      var wasChase = (a.pstate === 'bolt' || a.pstate === 'regroup' || a.pstate === 'taunt');
      a.pstate = 'graze';
      a.aware = Math.max(0, a.aware - 0.25);
      a.edgeTurns = 0;
      if (wasChase) {
        this.say(this.encCap(label) + " slows — decides you're not following — and goes back to grazing.");
        try { this.audioEvent('animalRustle'); } catch (e) {}
      }
      // ANIMAL HUNGER: grazing is for real now. Hungry animals eat the tile
      // underfoot (shared depletion); with nothing in reach they drift toward
      // the nearest green. Full animals just amble, decorative as before.
      if ((a.hunger || 0) > 40) {
        if (!graze()) {
          var ng = nearestGraze();
          if (ng && ng.d > 0 && Math.random() < 0.6) {
            tryMove(a.mx + Math.sign(ng.cx - a.mx), a.my + Math.sign(ng.cy - a.my));
          } else if (Math.random() < 0.3) {
            tryMove(a.mx + rnd3(), a.my + rnd3());
          }
        }
      } else if (Math.random() < 0.3) {
        tryMove(a.mx + rnd3(), a.my + rnd3());
      }
      return;
    }
    // within notice: awareness builds. stalkers and trackers buy time.
    // APPROACH VECTOR + NOISE (Steve 2026-10-06): crouch-sneaking (stalk)
    // is quietest; standing still is quieter than walking; running is
    // loudest. Closing head-on is scarier than circling — a direct approach
    // reads as a charge, a lateral drift as weather. Real anchor: prey keys
    // on approach geometry as much as volume (a deer watches a closing
    // human, tolerates a passing one).
    var pNoise = stalked ? 0.35 : pSteps === 0 ? 0.55 : ranLoud ? 1.4 : 1;
    var closing = (a.apprDist == null) ? 0 : (a.apprDist - dist);
    a.apprDist = dist;
    var approach = closing >= 1 ? 1.25 : closing < 0 ? 0.85 : 1;
    var rate = cfg.awareRate * pNoise * approach * (1 - Math.min(0.45, trackLvl * 0.15));
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
    // NEVER_BOLT: the skunk's answer is the spray; the porcupine's is the
    // quills; the goose and the boar end fights instead of leaving them;
    // the bobcat is the one doing the hunting; the snake and the snapper
    // return early above (kept here as documentation).
    var boltAt = beh === 'skittish' ? 0.75 : 1;
    // ANIMAL HUNGER: starving animals hold their ground (boldBonus above).
    if ((a.hunger || 0) > 70) boltAt += boldBonus;
    // cornered/regroup excluded: those states own their turns (panic branch,
    // regroup rhythm) — the threshold must not yank them back to 'bolt'.
    if (!this.encNeverBolt(beh) && a.aware >= boltAt && a.pstate !== 'bolt' && a.pstate !== 'winded' && a.pstate !== 'taunt' && a.pstate !== 'playing_dead' && a.pstate !== 'cornered' && a.pstate !== 'regroup') {
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
    // ANIMAL HUNGER: desperate — starving but only wary (hasn't bolted), it
    // creeps toward food even with you in sight. You can SEE hunger beating
    // fear. Next turn, if it reaches the green, it eats.
    if ((a.hunger || 0) > 80 && a.pstate === 'wary') {
      var ng2 = nearestGraze();
      if (ng2 && ng2.d <= 3 && ng2.d > 0) {
        if (tryMove(a.mx + Math.sign(ng2.cx - a.mx), a.my + Math.sign(ng2.cy - a.my))) {
          if (dist <= 5 && Math.random() < 0.4) {
            this.say(this.encCap(label) + ' is too hungry to fear you — it creeps toward the greens.');
          }
        }
      }
    }
    if (a.pstate === 'winded') {
      // NO-SILENT-TURNS (Steve 2026-10-07): winded turns were silent — the
      // animal just sat there while the player beat passed. The chase is
      // over; say so, every turn. It's your move — but the animal is still
      // THERE, and still a creature. (The pant audio already fired on the
      // transition; don't re-fire it every turn.)
      // WINDED BEATS (Steve 2026-10-08): one line every turn read as a
      // frozen screen. Three quiet beats in rotation — low-key, never
      // spamy. Catchable-but-doomed, not stuck.
      a._windedBeats = (a._windedBeats || 0) + 1;
      var _wb = [
        this.encCap(label) + ' stands spent — sides heaving, head low. It\'s not running any more. Your move.',
        this.encCap(label) + ' sways where it stopped, head drooping — too blown to run. Yours to take, whenever.',
        this.encCap(label) + ' drags in one more ragged breath, flanks shuddering. The chase is over. Your move.'
      ];
      this.say(_wb[(a._windedBeats - 1) % _wb.length]);
      return; // spent. your move.
    }
    if (a.pstate === 'regroup') {
      // TURKEY REGROUP: landed, gathering itself. One turn of stillness —
      // the window the flutter-rhythm buys you. Then back in the air.
      // NO-SILENT-TURNS (Steve 2026-10-07): the gathering turn narrates too —
      // the window is still open, and the player reads the rhythm. Label is
      // recomputed from the raw descriptor: encAnimalLabel at the top of
      // animalTurn already carries the "— regrouping, wings half-folded"
      // suffix, which this line says itself.
      var rdef = null;
      try { rdef = this.encAnimalDef(a.id); } catch (e) {}
      this.say(this.encCap(rdef ? this.encDescribeAnimal(rdef) : label) + ' gathers itself — wings half-folded, breast heaving. The window holds.');
      a.pstate = 'bolt'; a.aware = Math.max(0.4, (a.aware || 0) - 0.3);
      return;
    }
    if (a.pstate === 'cornered') {
      // CORNER PANIC (Steve 2026-10-06): trapped prey doesn't freeze — it
      // explodes. Real-world: a cornered deer kicks (ribs break), a cornered
      // turkey spurs, a cornered rabbit screams and thrashes. About half the
      // time it lashes out at what's trapping it; otherwise it breaks for
      // the nearest edge, THROUGH you if it must. Panic is honest
      // perception — ungated — and it has its own audio hook (animalPanic,
      // resolved via encAudio — a real synth wins, otherwise bolt+rustle;
      // never silent).
      if (dist <= 1 && Math.random() < 0.5) {
        var panicDmg = { wary: [4, 8], flock: [2, 5], skittish: [1, 3] }[beh] || [2, 4];
        var pd = panicDmg[0] + Math.floor(Math.random() * (panicDmg[1] - panicDmg[0] + 1));
        try { s.health = Math.max(0, (s.health || 100) - pd); } catch (e) {}
        var panicVerb = beh === 'wary' ? 'lashes out — hooves flashing, a kick that could break ribs'
          : beh === 'flock' ? 'spurs wildly — wings hammering your face, claws raking'
          : beh === 'skittish' ? 'THRASHES — a scream like a stepped-on toy, claws everywhere'
          : 'explodes — teeth and claws and panic';
        this.say(this.encCap(label) + ' ' + panicVerb + '! (-' + pd + ' HP) Cornered things don\'t surrender. They detonate.');
        try { this.encAudio('animalPanic'); } catch (e) {}
        try { this.audioEvent('animalBite'); } catch (e) {}
        return;
      }
      // desperation dash: nearest edge, up to 2 tiles. A panicking animal
      // does not treat your tile as a wall — it shoves past.
      var ex = a.mx <= 4 ? 0 : 8, ey = a.my <= 4 ? 0 : 8;
      var ddx = Math.sign(ex - a.mx), ddy = Math.sign(ey - a.my);
      var dashed = 0;
      for (var di = 0; di < 2; di++) {
        if (!ddx && !ddy) break;
        var nx2 = a.mx + ddx, ny2 = a.my + ddy;
        if (nx2 < 0 || nx2 > 8 || ny2 < 0 || ny2 > 8) break;
        var cell2 = detail[ny2] && detail[ny2][nx2];
        var shoveThru = (nx2 === px && ny2 === py);
        if (!BLOCKS[cell2] || shoveThru) {
          if (shoveThru && !a.shovedOnce) {
            a.shovedOnce = true;
            this.say(this.encCap(label) + ' shoves PAST you — a blur of panic, hooves and claws raking as it goes.');
            try { this.encAudio('animalPanic'); } catch (e) {}
          }
          a.mx = nx2; a.my = ny2; dashed++;
        } else if (!(tryMove(a.mx + ddx, a.my) || tryMove(a.mx, a.my + ddy))) break;
      }
      if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) {
        this.encReleaseAnimal(a);
        this.say(this.encCap(label) + ' breaks past everything and is GONE — just torn grass and your hammering heart.');
        try { this.audioEvent('animalBolt'); } catch (e) {}
        return;
      }
      if (dashed > 0) {
        var shovedSaid = !!a.shovedOnce; // the shove-past-you line fired above
        a.pstate = 'bolt'; // it broke the corner — back to the chase
        a.shovedOnce = false;
        // NO-SILENT-TURNS (Steve 2026-10-07): breaking the corner IS the
        // turn's story — the chase is back on. (Skipped when the shove line
        // already told it.)
        if (!shovedSaid) {
          this.say(this.encCap(label) + ' breaks through and runs — the chase is back on!');
          try { this.audioEvent('animalBolt'); } catch (e) {}
        }
      } else {
        // still trapped, still narrated — no silent turns (Steve's rule).
        this.say(this.encCap(label) + ' wheels, snorting — looking for a way out. There isn\'t one.');
        try { this.encAudio('animalPanic'); } catch (e) {}
      }
      return;
    }
    if (a.pstate === 'bolt') {
      var bd = this.encBoltDir(a, px, py);
      var dx = bd[0], dy = bd[1];
      if (beh === 'flock' && (a.flutterHops || 0) >= 2) {
        // TURKEY (Steve 2026-10-06): poor sustained fliers — flutter, land,
        // regroup, flutter. Real turkeys burst-fly 100-200m, then land and
        // gather themselves. The regroup turn is your window: still, close,
        // hittable. Distinct from the deer's line and the rabbit's zigzag.
        a.flutterHops = 0; a.pstate = 'regroup';
        this.say(this.encCap(label) + ' lands hard — wings half-folded, breast heaving. Gathering itself. Your window.');
        try { this.audioEvent('animalRustle'); } catch (e) {}
        return;
      }
      // FLEE STYLES (Steve 2026-10-06): species-distinct gaits, not one bolt.
      var steps = 1, stepCost = 1;
      if (beh === 'wary' && a.stamina >= cfg.stamina - 1) {
        // DEER: straight-line burst. 30 mph vs your 12 — on fresh legs it
        // OUTPACES you, early game especially. You don't run a deer down;
        // you out-think it (stalk close, cut the line, or wind it). The
        // burst costs double stamina: sprinting is real, and it ends.
        steps = 2; stepCost = 2;
      }
      if (beh === 'skittish') {
        // RABBIT: zigzag, never the same hop twice in a row. Cottontails
        // jink at 18-29 mph — don't chase the line, cut it off. The stored
        // lastZig forces the change; a straight chase loses.
        var zdirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        var zd = null, zk = null, zt = 0;
        do {
          zd = zdirs[Math.floor(Math.random() * zdirs.length)];
          zk = zd[0] + ',' + zd[1]; zt++;
        } while (zt < 8 && zk === a.lastZig);
        a.lastZig = zk; dx = zd[0]; dy = zd[1];
      }
      var movedAny = false;
      var ox0 = a.mx, oy0 = a.my;
      for (var si = 0; si < steps; si++) {
        var okStep = tryMove(a.mx + dx, a.my + dy);
        if (!okStep) okStep = tryMove(a.mx + dx, a.my) || tryMove(a.mx, a.my + dy) || tryMove(a.mx - dy, a.my + dx);
        movedAny = movedAny || okStep;
      }
      // staying on your own tile is not moving (tryMove counts it as a
      // success) — a walled-in animal is cornered, not "fleeing in place."
      if (a.mx === ox0 && a.my === oy0) movedAny = false;
      if (beh === 'flock') a.flutterHops = (a.flutterHops || 0) + 1; // one flutter per bolt-turn
      // GROUNDHOG: the second move stays. It sprints for the burrow — low,
      // fast, straight. You get one chase: wind it before the hole, or it's
      // down and gone.
      if (beh === 'alarmed' && (a.mx !== 0 && a.mx !== 8 && a.my !== 0 && a.my !== 8)) {
        if (!tryMove(a.mx + dx, a.my + dy)) {
          tryMove(a.mx + dx, a.my) || tryMove(a.mx, a.my + dy);
        }
      }
      a.stamina -= stepCost;
      if (a.stamina <= 0) {
        a.pstate = 'winded';
        this.say(this.encCap(label) + " is winded — sides heaving, head low. Now's your chance.");
        try { this.audioEvent('animalPant'); } catch (e) {}
        return;
      }
      // CORNERED (Steve 2026-10-06): nowhere to run with you closing in is
      // panic, not a quiet slip away. Trapped prey detonates — see the
      // 'cornered' branch above. (food.js's strike-path corner is the same
      // fiction from the other side: nowhere to run = desperate, not gone.)
      // Cornered means NO EXIT: walled in away from the edge, or pressed
      // against the treeline with you right on top of it (dist <= 1 — it
      // can't slip past you). An animal AT the edge with room to breathe
      // still melts into the treeline (edgeTurns) — the exit is the exit.
      var atEdge = (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8);
      var distNow = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      var noExit = !movedAny && !atEdge;
      var pressedAtEdge = atEdge && distNow <= 1;
      if ((noExit && distNow <= 3) || pressedAtEdge) {
        a.pstate = 'cornered'; a.aware = 1;
        this.say(this.encCap(label) + ' is TRAPPED — nowhere left to run. It wheels on you, eyes wild. (cornered: it may lash out — or break through)');
        try { this.encAudio('animalPanic'); } catch (e) {}
        return;
      }
      if (atEdge) {
        a.edgeTurns += 1;
        // GROUNDHOG: one edge turn is enough — the hole is right there.
        var edgeNeed = beh === 'alarmed' ? 1 : 2;
        if (a.edgeTurns >= edgeNeed) {
          this.encReleaseAnimal(a);
          this.say(beh === 'alarmed'
            ? this.encCap(label) + ' pours itself down its burrow — a dark hole in the bank. Gone. The whistle echoes a little longer than the groundhog does.'
            : this.encCap(label) + ' melts into the treeline. Gone.');
          return;
        }
      } else {
        a.edgeTurns = 0;
      }
      // MID-CHASE NARRATION (Steve 2026-10-07): no-silent-turns is a HARD
      // rule — EVERY bolt turn narrates, unconditionally. The animal ran but
      // didn't wind, corner, or escape: the chase continues and the player
      // sees HOW it runs. Species-specific, knowledge-gated (encChaseText).
      // A turn held at the treeline narrates too (the first edgeTurns++
      // turn included): it's deciding whether to risk the exit, and the
      // player deserves that read. A turn spent wheeling for a gap narrates
      // as well — never a moving icon with no text.
      if (movedAny) {
        this.say(this.encChaseText(a));
      } else if (atEdge) {
        this.say(this.encChaseText(a, true));
      } else {
        this.say(this.encCap(label) + ' wheels, looking for a gap — there isn\'t one.');
      }
      try { this.audioEvent('animalBolt'); } catch (e) {}
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
    // DEEPENED (Steve 2026-10-06): tracker levels read more. L1: species (if
    // known) + heading. L2: + freshness (fresh vs hours old). L3: + gait
    // (ambling, running, moving). The name stays knowledge-gated either way —
    // "if you don't know, it doesn't show."
    var trackK = false, trackLvl = 0;
    try { trackK = this.trackKnown && this.trackKnown(); } catch (e) {}
    try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
    var signNote = '';
    if (trackK) {
      var spName = now;
      try { if (this.encAnimalKnown && !this.encAnimalKnown(s.animal.id)) spName = 'something'; } catch (e) {}
      var heading = ((s.animal.mx >= px) ? 'east' : 'west');
      if (trackLvl >= 2) {
        var fresh = (s.animal.turns || 0) <= 4 ? 'fresh' : 'hours old';
        var gait = (s.animal.pstate === 'bolt') ? 'running' : (s.animal.pstate === 'graze' ? 'ambling' : 'moving');
        signNote = ' You read the sign as you move — ' + spName + ' prints, ' + fresh + ', ' + gait + ' ' + heading + '.';
      } else {
        signNote = ' You read the sign as you move — ' + spName + ' prints, heading ' + heading + '.';
      }
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

  // MISS REACTION (Steve 2026-10-06): a miss doesn't always mean it bolts.
  // The boar charges, the goose retaliates, the bobcat slashes and melts
  // away; the porcupine, skunk, and snake just... stay. Returns true when
  // the encounter ended (caller skips animalTurn).
  G.encMissReact = function (a, animal) {
    var s = this.state.scholar;
    var b = (animal && animal.behavior) || '';
    // OPOSSUM (Steve 2026-10-06): a swing and a miss is still a threat — it
    // does the only thing it knows. The flop is one fiction, one function.
    if (b === 'plays_dead' && a.pstate !== 'playing_dead') {
      this.encPossumFlop(a);
      return true; // the flop IS this turn — skip animalTurn, encounter continues
    }
    // WATER HIDES (Steve 2026-10-06): a miss at a fish, frog, or crayfish
    // doesn't rout it — the creek keeps its own. It dives and stays; wait it
    // out and it comes back up. The crayfish stays grabbable under its rock
    // (strike still allowed); the chub and the frog are unhittable down there.
    if (b === 'aquatic' || b === 'aquatic_ambush' || b === 'aquatic_defensive') {
      var capH = this.encCap(this.encAnimalLabel(a));
      var hideText = b === 'aquatic'
        ? capH + ' shoots under the rock — gone from sight. The creek is small, though. It\'s still in there.'
        : b === 'aquatic_ambush'
        ? 'Splash — ' + capH + ' slides under the bank. Frogs don\'t leave a pond they like. Wait.'
        : capH + ' backs under the next rock, claws out. Still there. Still angry.';
      a.pstate = 'hiding'; a.hideTurns = 3; a.aware = 0.3;
      this.feedback(hideText);
      try { this.audioEvent('animalSplash'); } catch (e) {}
      return false;
    }
    // BEAR (Steve 2026-10-09): a missed strike doesn't rout a bear — it
    // answers. The fight continues on the bear's terms: mauling damage, and
    // it stays. This is the non-monster monster fight.
    if (animal && animal.id === 'black_bear') {
      var bDmg = 6 + Math.floor(Math.random() * 8);
      try { s.health = Math.max(0, (s.health || 100) - bDmg); } catch (e) {}
      a.pstate = 'advancing'; a.aware = 1;
      this.feedback(this.encCap(this.encAnimalLabel(a)) + ' does not run. It ROARS — the sound goes through your ribs — and comes at you. (-' + bDmg + ' HP) This is a fight now.');
      try { this.audioEvent('animalBite'); } catch (e) {}
      return false; // stays — animalTurn runs, and the bear is still here
    }
    if (b === 'charger' && Math.random() < 0.6) {
      a.pstate = 'charging'; a.aware = 1;
      this.feedback(this.encCap(this.encAnimalLabel(a)) + ' drops its head and COMES — your miss was the invitation.');
      try { this.audioEvent('animalCharge'); } catch (e) {}
      return false;
    }
    if (b === 'territorial') {
      a.pstate = 'advancing'; a.aware = 1;
      var wd = 4 + Math.floor(Math.random() * 6);
      try { s.health = Math.max(0, (s.health || 100) - wd); } catch (e) {}
      this.feedback('HONK — your miss enrages it. Wings hammering, beak pinching. (-' + wd + ' HP) It is not leaving.');
      try { this.audioEvent('animalHonk'); } catch (e) {}
      return false;
    }
    if (b === 'stalker') {
      var cd = 6 + Math.floor(Math.random() * 6);
      try { s.health = Math.max(0, (s.health || 100) - cd); } catch (e) {}
      this.encReleaseAnimal(a);
      this.feedback(this.encCap(this.encAnimalLabel(a)) + ' twists aside — claws raking as it goes (-' + cd + ' HP) — and melts into the brush. It hates a fair fight.');
      try { this.audioEvent('animalYowl'); } catch (e) {}
      return true;
    }
    if (b === 'armored' && !a.leaptOnce && Math.random() < 0.5) {
      // ARMADILLO: the startle leap — only on a failed grab, never pre-empting
      // a clean kill. Three feet straight up: you grab air and leaf litter.
      a.leaptOnce = true; a.aware = 1;
      this.feedback('It LEAPS straight up — three feet of armored surprise! You grab air and a mouthful of leaf litter. It lands hunched tighter.');
      try { this.audioEvent('animalBolt'); } catch (e) {}
      return false; // stays (never bolts) — animalTurn runs, and likely hunkers
    }
    if (this.encNeverBolt(b)) { a.aware = 1; return false; } // stays. it was never leaving.
    // SLOW (Steve 2026-10-07): a miss at the turtle/gila never routs it —
    // the bolt the old code set here contradicted the huntText ("doesn't
    // flee"). It stays; the miss verb above (encSlowMissVerb) owns the words.
    if (b === 'slow') { a.aware = 1; return false; }
    a.aware = 1; a.pstate = 'bolt';
    return false;
  };

  // HUNT PRACTICE (Steve 2026-10-06 — role-audit fix #4): the competence
  // counter for the hunt. Kept here, on the scholar, owned end to end by
  // this module — the shared tree is hot (game.js/app.js are OFF LIMITS),
  // so no cross-file helpers. The pattern follows the audit's "correct"
  // examples (lifeseed occCategory, food.js techniques): background sets
  // the START — a former hunter opens with 3 practice points ("that body
  // remembers") — and lived experience moves the number: every strike
  // adds 1, a clean kill teaches double. Cap +0.2 at 5 points, same ceiling
  // the old flat buff had — but now it's earned, by anyone.
  // BALANCING 5-question: (1) anchor = real skill acquisition — a handful
  // of hunts teaches competence, not mastery; the tracker ABILITY stays the
  // big earned lever (+0.3/+0.5). (2) too-fast = the hunter head start is
  // meaningless; too-slow = the audit's complaint returns. 5 strikes to
  // cap is one good afternoon. (5) respects the fiction: practice, not
  // pedigree.
  G.encHuntXPBonus = function (villager) {
    var s = null;
    try { s = this.state.scholar; } catch (e) {}
    if (!s) return 0;
    if (s.huntXPSeeded == null) {
      // one-time seed per life: background sets the start, never the ceiling.
      var hunterBack = false;
      try { hunterBack = ((villager && (villager.formerOccupation || '')) + '').toLowerCase().indexOf('hunter') !== -1; } catch (e) {}
      s.huntXPSeeded = true;
      s.huntXP = hunterBack ? 3 : 0;
      if (hunterBack) this.say('Old habits wake up — you hunted before the world ended. A head start, not a destiny.');
    }
    var xp = s.huntXP || 0;
    if (xp <= 0) return 0;
    return Math.min(0.2, 0.04 * xp); // +0.04 per practice point, capped at +0.2
  };
  G.encHuntPracticed = function (kind) {
    try {
      var s = this.state.scholar; if (!s) return;
      if (s.huntXPSeeded == null) { s.huntXPSeeded = true; s.huntXP = 0; }
      s.huntXP = (s.huntXP || 0) + (kind === 'kill' ? 2 : 1);
    } catch (e) {}
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
    // hiding: the chub and the frog are under the water — you can't hit what
    // you can't see. The crayfish is under a rock, still grabbable: reach in.
    var hb0 = (animal.behavior || '');
    if (a.pstate === 'hiding' && (hb0 === 'aquatic' || hb0 === 'aquatic_ambush')) {
      this.feedback("It's under the water — you can't hit what you can't see. Wait it out, or move on.");
      return true;
    }
    // the strike's moment of truth — behavior pre-check, then the framework
    // reaction (food.js preyReaction), then behavior post-bolt. One fiction.
    // A swing is a swing — practice accrues even when it bolts or flops.
    if (this.encStrikeReact(a)) { this.encHuntPracticed('strike'); return true; } // it bolted (or flopped)
    var base = animal.difficulty === 'easy' ? 0.7 : animal.difficulty === 'medium' ? 0.4 : 0.15;
    try { base = this.modTarget('hunt.find_chance', base); } catch (e) {}
    var self = this;
    var villager = null;
    try { villager = (this.data.villagers || []).find(function (v) { return v.id === self.villagerId; }); } catch (e) {}
    // ROLE-AUDIT FIX #4 (Steve 2026-10-06): the old isHunter flat +0.2 was
    // a permanent backstory buff — practice-independent, forever. It's
    // gone. Background sets the start, lived experience moves the number
    // (see G.encHuntXPBonus / G.encHuntPracticed above).
    var practiceBonus = this.encHuntXPBonus(villager);
    var wbonus = 0;
    try { wbonus = this.weaponBonus() / 100; } catch (e) {}
    var trackLvl = 0;
    try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
    var trackBonus = trackLvl >= 2 ? 0.5 : trackLvl >= 1 ? 0.3 : 0;
    var relicHunt = 0;
    try {
      var S_ = _g.Scattering || {};
      if (S_.modifiers) relicHunt = S_.modifiers.resolve(0, 'hunt.success', S_.modifiers.collectModifiers(s, this.data.abilities, this.data.synergies), {});
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
    // CLEAN SHOT (hunter wiring 2026-10-07): patient_aim's "Line Up Clean Shot"
    // armed a flag nothing consumed — you paid 20 min + 15 kcal for nothing.
    // Now it steadies this strike: +0.25, in the same family as the tracker
    // bonus, consumed here, once. A lined-up shot that lands is narrated
    // clean at the kill below.
    var cleanShotLined = false;
    try { if (s.cleanShotReady) { cleanShotLined = true; s.cleanShotReady = false; } } catch (e) {}
    var chance = Math.min(0.95, (base + practiceBonus + wbonus + trackBonus + relicHunt + nightHuntBonus + (cleanShotLined ? 0.25 : 0)) * luck * awarePen);
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
    // TOOL READINESS (Steve 2026-10-06): tool-gated hunting, deepened. The
    // wrong-tool penalty above is about the strike; this is about the HUNT —
    // if you have NO proper method at all (no snare wire for a snare animal,
    // no trapping skill for a trap animal, no line for a line animal, no bow
    // for a bow animal), this is a long shot, and the game names exactly
    // what's missing. The strike stays visible (moment-to-moment play), but
    // the game is honest: you're improvising.
    if (!unarmedHunt) {
      var hmethods = animal.method || [];
      var self2 = this;
      var anyReady = hmethods.some(function (m) { return self2.encMethodToolReady(m); });
      if (!anyReady && hmethods.length) {
        chance *= 0.4;
        if (!a._unprepTold) {
          a._unprepTold = true;
          var missing = [];
          for (var ui = 0; ui < hmethods.length; ui++) {
            var hm = hmethods[ui];
            if (!self2.encMethodToolReady(hm)) missing.push(self2.encMethodToolName(hm));
          }
          this.feedback('You don\'t have the right tool for this one — no ' + missing.join(', no ') +
            '. Your ' + wname + (/^hands$/i.test(wname) ? ' are' : ' is') + ' a real long shot.');
        }
      }
    }
    // SKUNK SPRAY (Steve 2026-10-06): sprayed this encounter — your eyes are
    // streaming. You swing at a blur. Clears when the encounter ends (read
    // from the animal, not a scholar flag).
    if (s.animal && s.animal.sprayed) {
      chance *= 0.35;
      if (!a._blindTold) {
        a._blindTold = true;
        this.feedback('Your eyes are streaming — you swing at a blur. (sprayed: blinded)');
      }
    }
    // BEHAVIOR STRIKE HOOKS (Steve 2026-10-06): the new animals answer the
    // strike itself, not just the approach. Each hook is encounter-scoped
    // (read from the animal, cleared when the encounter ends).
    var hBeh = animal.behavior || '';
    if (hBeh === 'quilled' && dist <= 1 && range <= 1 && !a.quilledYou) {
      // PORCUPINE: grabbing it barehanded = quills, barbed and deep. Ranged
      // strikes are clean — the quills only punish the grab.
      a.quilledYou = true;
      var qDmg = 4 + Math.floor(Math.random() * 5);
      try { s.health = Math.max(0, (s.health || 100) - qDmg); } catch (e) {}
      this.feedback('Quills — in your hand, barbed and deep. (-' + qDmg + ' HP) Pull them straight out, slow. Every strike this encounter is compromised.');
      try { this.audioEvent('animalQuill'); } catch (e) {}
    }
    if (a.quilledYou) chance *= 0.5; // quills in your swinging hand
    if (hBeh === 'armored' && a.pstate === 'hunkered') chance *= 0.6; // the armor turns the blow — aim under
    if (hBeh === 'territorial' && a.pstate === 'advancing') chance = Math.max(0.05, chance - 0.25); // it sees you coming
    if (hBeh === 'stalker') chance *= 0.6; // it dodges — ambush hunters hate fair fights
    if (hBeh === 'charger' && a.pstate === 'pawing') {
      // BOAR: striking a pawing boar triggers the charge, not a normal
      // strike. It resolves RIGHT NOW (animalTurn) — no free second strike
      // while it's mid-charge. The charge commits and winds it.
      a.pstate = 'charging';
      this.feedback('You move — it drops its head and COMES. 150 pounds, tusks first. (sidestep, don\'t outrun)');
      this.animalTurn();
      return true;
    }
    // BITE (Steve 2026-10-05): close capture can cost you. Wild things have
    // teeth — not a fight, just the price of grabbing. Traps avoid this.
    // (Porcupines don't bite — the quills already answered. Bluegill don't
    // bite either — reaching into the bed is the whole point.)
    if (dist <= 1 && hBeh !== 'quilled' && hBeh !== 'bedding') {
      var bBeh = animal.behavior || '';
      var biteP = bBeh === 'aggressive' ? 0.6 : bBeh === 'defensive' ? 0.6 : bBeh === 'constrictor' ? 0.5 : bBeh === 'plays_dead' ? 0.3 : 0.2;
      if (Math.random() < biteP) {
        var biteDmg = bBeh === 'aggressive' ? 8 + Math.floor(Math.random() * 8)
          : bBeh === 'defensive' ? 8 + Math.floor(Math.random() * 7)
          : bBeh === 'charger' ? 6 + Math.floor(Math.random() * 7)
          : 3 + Math.floor(Math.random() * 6);
        try { s.health = Math.max(0, (s.health || 100) - biteDmg); } catch (e) {}
        this.feedback(bBeh === 'defensive'
          ? 'It strikes! Fangs — ' + biteDmg + ' damage. The head bites after death — cut wide, bury the head.'
          : bBeh === 'charger'
          ? 'It catches you with a tusk — ' + biteDmg + ' damage. Boars don\'t bite, they slash.'
          : bBeh === 'constrictor'
          ? 'It whips around and bites — ' + biteDmg + ' damage. Teeth, no venom. The insult is worse than the wound.'
          : 'It bites! Teeth in your hand — ' + biteDmg + ' damage. Wild things have teeth.');
        if (bBeh === 'defensive') {
          // RATTLESNAKE: fangs, not teeth. The venom is in.
          try { (s.poisons = s.poisons || []).push({ name: 'rattlesnake venom', day: s.day }); } catch (e) {}
          this.feedback('(poisoned — rattlesnake venom. Find an antidote.)');
        }
        try { this.audioEvent('animalBite'); } catch (e) {}
        if (Math.random() < 0.3) {
          this.feedback('You fumble — it wriggles free!');
          // TURN HYGIENE (Steve 2026-10-08): one animalTurn per miss, like
          // every other miss path (near-miss, clean miss). The old code ran
          // animalTurn() TWICE here — the animal acted twice for the
          // player's single strike, the same double-advance class of bug as
          // the playtest wait/strike lessons. "Wriggles free" buys it one
          // turn's head start, not two.
          this.animalTurn();
          return true;
        }
      }
    }
    // BEAR MAUL (Steve 2026-10-09): a black bear is not a deer — it's a
    // non-monster monster fight. Striking one inside mauling range turns the
    // hunt into a fight. Bow hunters at range get a clean shot; a spear is a
    // dangerous second choice (reach halves the mauling); a knife or bare
    // hands this close is answered in full. Fierce, not a stat-check.
    if (a.id === 'black_bear' && dist <= 2 && !a._mauled) {
      a._mauled = true;
      var maulMethod = 'hands';
      try { maulMethod = this.encWeaponMethod(); } catch (e) {}
      var maulDmg = 8 + Math.floor(Math.random() * 10);
      if (maulMethod === 'spear') maulDmg = Math.ceil(maulDmg / 2);
      try { s.health = Math.max(0, (s.health || 100) - maulDmg); } catch (e) {}
      this.feedback(maulMethod === 'bow'
        ? 'It closes the distance before your shot lands — claws rake across your arm as you loose. (-' + maulDmg + ' HP) Too close for a bow.'
        : maulMethod === 'spear'
        ? 'The bear is ON you — you set the spear and it takes the point, but four hundred pounds does not stop politely. Claws find you anyway. (-' + maulDmg + ' HP)'
        : 'The bear is ON you — no reach, no plan, just claws and teeth and four hundred pounds of NO. (-' + maulDmg + ' HP)');
      try { this.audioEvent('animalBite'); } catch (e) {}
      chance *= (maulMethod === 'bow' ? 0.85 : maulMethod === 'spear' ? 0.6 : 0.4);
    }
    var roll = Math.random();
    if (roll < chance) {
      s.animal = null;
      this.encHuntPracticed('kill'); // a clean kill teaches double
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
        this.feedback('Got it — ' + animal.name + '! ' + this.encKillLine(animal, kcal));
        // CLEAN SHOT (hunter wiring 2026-10-07): the lined-up shot landed —
        // say so. No suffering was the promise; the kill line above already
        // named the yield honestly.
        if (cleanShotLined) this.feedback('One shot — it never knew. No suffering. (Clean Shot — the lined-up shot.)');
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
      // near-miss: drama, not failure. It bolts — heart hammering. (Unless
      // it's one of the animals that doesn't bolt — encMissReact owns that.)
      // (Verb agreement: "your hands hiss" vs "your bow hisses" can't both
      // win, so the weapon isn't the subject. You miss. Clean.)
      // SLOW (Steve 2026-10-07): a turtle doesn't "jink" — it was never
      // moving. The shame is the drama.
      var nmText = (animal.behavior === 'slow')
        ? 'Not even close — ' + label + ' doesn\'t jink. It doesn\'t move at all. You miss with your ' + wname + ' anyway. A stationary turtle. Feel the shame.'
        : 'So close — ' + label + ' jinks at the last breath. You miss with your ' + wname + '.';
      this.feedback(nmText);
      try { this.audioEvent('animalBolt'); } catch (e) {}
      this.encHuntPracticed('strike'); // a near-miss still teaches
      var nmEnded = this.encMissReact(a, animal);
      if (!nmEnded) this.animalTurn();
      return true;
    }
    var mBeh = (animal.behavior || '');
    // the miss feedback is honest about what the animal does next: aquatic
    // animals vanish under the water (they hide, they don't bolt — encMissReact).
    // SLOW (Steve 2026-10-07): the old text said "bolts" — the huntText says
    // it doesn't flee. encSlowMissVerb owns the per-animal truth.
    var missVerb = this.encNeverBolt(mBeh) ? ' doesn\'t even flinch. (-100 kcal)'
      : (mBeh === 'aquatic' || mBeh === 'aquatic_ambush' || mBeh === 'aquatic_defensive')
      ? ' vanishes under the water — still in there, not gone. (-100 kcal)'
      : (mBeh === 'slow')
      ? this.encSlowMissVerb(a)
      : ' bolts. (-100 kcal)';
    this.feedback('Missed! ' + this.encCap(label) + missVerb);
    try { this.audioEvent('animalBolt'); } catch (e) {}
    this.encHuntPracticed('strike'); // a clean miss still teaches
    var mEnded = this.encMissReact(a, animal);
    if (!mEnded) this.animalTurn();
    return true;
  };
  G.huntAnimal._wrapped = true;

  // ================= ALIEN-PLAYER ENCOUNTER WIRING (Steve 2026-10-08) =================
  // The exclusive alien-player pool (src/js/alienPlayers.js) was dead code:
  // apRollEncounter/apStartEncounter existed with a "called from the encounter
  // phase" comment but no call site. This section wires the pool into the live
  // game WITHOUT touching game.js (chain-safe wraps, same as every other
  // module). Three pieces:
  //
  // 1. checkEncounter wrap — after the monster encounter phase, take the
  //    alien pool's SEPARATE roll. Skipped when a fight already started, a
  //    monster holds the tile, an animal encounter is live, or the module
  //    failed to load (guarded like contests.js _contestVerdict's
  //    apContestInterference call). Gating (post-System, wave 2+, safe tiles,
  //    readiness) lives inside the module's apEncounterEligible.
  // 2. startAlienCombat(fighter) — builds this.tbfight for a PERSON fight:
  //    player + party villagers + one kind:'hostile' fighter. The combat
  //    engine already treats 'hostile' as an enemy (targeting, damage).
  // 3. tbAlienTurn(m) — the hostile fighter's bespoke turn: intercepted in
  //    tbMonsterTurn (browser async path) and lazily in tbHostileTurn inside
  //    startAlienCombat (node/sync path via party.js's tbAdvance, which
  //    would otherwise run the betrayal AI on an alien). Chain-safe. The
  //    monster pipeline (needs m.mdef) and the betrayal pipeline
  //    (begging/yielding villagers) never see a person. Windup → heavy
  //    burst → recovery, with grid-highlighted telegraphs, audio cues, and
  //    knowledge-safe lines.
  //
  // 4. BEAM KEY ADAPTER — alienPlayers.js addresses the player fighter as
  //    'player' in apBeamHit, but the engine's key is 'p' (tbFighter('player')
  //    is undefined, so the beam announced and silently whiffed). Translated
  //    lazily in startAlienCombat, same load-order reason as (3).
  //
  // KNOWLEDGE (Steve 2026-10-07): pre-reveal the fighter is a "Stranger".
  // Nothing here names the alien truth — fighter.name is already gated by
  // the module, and the flavor lines below describe behavior, never species.

  var _checkEncounter = G.checkEncounter;
  G.checkEncounter = function () {
    var r = _checkEncounter ? _checkEncounter.apply(this, arguments) : undefined;
    try {
      // GUARDED (contests.js _contestVerdict pattern): module absent = no-op.
      if (typeof this.apRollEncounter !== 'function') return r;
      // The monster phase already claimed this crossing — separate pools,
      // separate beats. No doubling up on one tile entry.
      if (this.inCombat && this.inCombat()) return r;
      var s = this.state.scholar || {};
      if (s.animal) return r;
      var px = this.map.px, py = this.map.py;
      if (this.monsterAt && this.monsterAt(px, py)) return r;
      // GROUP ENCOUNTERS (Steve 2026-10-07, wired break-it 2026-10-08):
      // apRollGroupEncounter/apStartGroupEncounter were dead code — built,
      // documented in the ontology, never called. Rare late-game team fights
      // (day 40+, 2+ established rivals, 14-day cooldown, 3%) roll first;
      // the single-persona pool is the fallback.
      try {
        if (typeof this.apRollGroupEncounter === 'function' && typeof this.apStartGroupEncounter === 'function') {
          var apGroup = this.apRollGroupEncounter();
          if (apGroup && apGroup.length >= 2 && this.apStartGroupEncounter(apGroup)) return r;
        }
      } catch (e2) {}
      var pid = this.apRollEncounter();
      if (pid && typeof this.apStartEncounter === 'function') {
        this.apStartEncounter(pid);
      }
    } catch (e) {}
    return r;
  };
  G.checkEncounter._wrapped = true;

  // Start turn-based combat against an alien-player fighter. apStartEncounter
  // calls this when the module is loaded; the module's fallback (a line of
  // text, no fight) covers a missing definition.
  G.startAlienCombat = function (fighter) {
    if (!fighter) return null;
    if (this.inCombat && this.inCombat()) return null;
    // LATE CHAIN (load order): party.js Object.assigns tbHostileTurn AFTER
    // encounters.js loads, so a load-time wrap would be silently replaced.
    // Install the intercept here instead — no fight can start before every
    // module has loaded. Idempotent. Without it, node/sync combat would run
    // the betrayal AI (begging/yielding villagers) on an alien fighter.
    if (!G.startAlienCombat._hostileWrapped) {
      G.startAlienCombat._hostileWrapped = true;
      var _tbHostileTurnLate = G.tbHostileTurn;
      G.tbHostileTurn = function (m) {
        try {
          if (m && m.alienPid && typeof this.tbAlienTurn === 'function') {
            this.tbAlienTurn(m);
            return;
          }
        } catch (e) {}
        return _tbHostileTurnLate ? _tbHostileTurnLate.apply(this, arguments) : undefined;
      };
    }
    // NOTE: the apBeamHit 'player'/'p' key mismatch is fixed at the source
    // in alienPlayers.js (engineKey normalization) — no adapter needed here.
    try { this.resetPerFightFlags(); } catch (e) {}
    var s = this.state.scholar || {};
    var px = (s.mx == null ? 4 : s.mx), py = (s.my == null ? 4 : s.my);
    var fighters = [];
    fighters.push({
      key: 'p', kind: 'player', name: 'You', emoji: '🧑',
      hp: s.health, maxHp: (this.maxHealth ? this.maxHealth() : 100),
      speed: this.playerSpeed(), mx: px, my: py,
      alive: true, fled: false, moveLeft: 0, acted: false, aimed: false,
    });
    // party: villagers within 4 squares join (nearest 4 — no zerg).
    // Same shape as a monster fight; villagers fight people too.
    try {
      var vpos = (this.state.village && this.state.village.positions) || {};
      var roster = (this.state.village && this.state.village.roster) || [];
      var cands = [];
      for (var i = 0; i < roster.length; i++) {
        var pos = vpos[roster[i]];
        if (!pos) continue;
        var d = Math.max(Math.abs(pos.mx - px), Math.abs(pos.my - py));
        if (d > 4) continue;
        cands.push({ rid: roster[i], pos: pos, d: d });
      }
      cands.sort(function (a, b) { return a.d - b.d; });
      for (var k = 0; k < Math.min(4, cands.length); k++) {
        var rid = cands[k].rid, vp = cands[k].pos;
        var vdef = null;
        try {
          var vl = this.data.villagers || [];
          for (var vi = 0; vi < vl.length; vi++) if (vl[vi].id === rid) { vdef = vl[vi]; break; }
        } catch (e2) {}
        var temp = (vdef && vdef.personality && vdef.personality.temperament) || 'steady';
        var ai = temp === 'bold' ? 'brave' : temp === 'cautious' ? 'cautious' : 'helpful';
        fighters.push({
          key: 'v_' + rid, kind: 'villager', villagerId: rid,
          name: this.displayName ? this.displayName(rid) : rid, emoji: '🧍',
          hp: 30, maxHp: 30, speed: 3, mx: vp.mx, my: vp.my,
          alive: true, fled: false, ai: ai, helped: false,
        });
      }
    } catch (e) {}
    // Normalize the person-fighter for the combat engine.
    fighter.telegraph = null;
    fighter.moveLeft = 0; fighter.acted = false;
    fighter.apTurns = 0; fighter.apSpent = 0;
    fighters.push(fighter);
    this.tbfight = {
      id: 'f' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36),
      fighters: fighters,
      order: S.combat.turnOrder(fighters),
      turnIdx: -1, round: 1,
      over: false, result: null,
      terraform: {},
      alienFight: true,
    };
    // STALE CHORUS (break-it persistence 2026-10-09, sibling sweep): this path
    // builds the fight directly instead of via Game.startCombat, so it needs
    // the same _pendingPack clear — a belltoad pack left over from a previous
    // fight must not answer the call in an alien duel's round 2.
    this._pendingPack = null;
    var partyNames = fighters.filter(function (x) { return x.kind === 'villager'; }).map(function (x) { return x.name; });
    var dispName = fighter.name || 'The stranger';
    // FACE TO FACE (Steve 2026-10-04 rule, person edition): the ambiguity
    // does NOT end. Descriptor and dread, not a name — pre-reveal.
    this.say('⚔ ' + dispName.toUpperCase() + '! ' +
      (partyNames.length ? partyNames.join(', ') + (partyNames.length > 1 ? ' join' : ' joins') + ' you!' : "You're on your own."));
    this.say('Turn-based now. Tap a tile to move — speed is squares. Then act.');
    try { this.audioEvent('combatStart'); } catch (e) {}
    try { this.combatWitnessReact('start'); } catch (e) {}
    try { this.observe('fight'); } catch (e) {}
    this.pendingEncounter = false;
    // OPENING TURNS: same as a monster fight — fastest fighter opens, run AI
    // turns until the player's turn lands (no "Not your turn" soft-lock).
    this.tbfight.turnIdx = -1;
    try { this.tbBeginTurn(); } catch (e) {}
    try { if (!this.tbIsPlayerTurn()) this.tbAdvance(); } catch (e) {}
    return this.tbfight;
  };

  // The alien fighter's turn. People don't telegraph like beasts — they
  // fight like players: close in, strike, and every third turn plant their
  // feet for a heavy burst (windup → action → recovery, all legible).
  G.tbAlienTurn = function (m) {
    var f = this.tbfight;
    if (!f || f.over || !m || !m.alive || m.fled) return;
    var pid = m.alienPid;
    var mName = m.name || 'The stranger';
    var self = this;
    function endTurn() { try { self.tbEndCheck(); } catch (e) {} }

    // 1. RETREAT STANCE (Steve 2026-10-07): broke personas can't afford
    // another body — at critical HP they break off instead of dying.
    try {
      var stance = (typeof this.apWealthStance === 'function') ? this.apWealthStance(pid, m) : 'normal';
      if (m._wantsRetreat || stance === 'retreating') {
        m.fled = true;
        this.say(mName + ' breaks off — backing away, hands raised, then GONE into the treeline.');
        try { this.audioEvent('alienRetreat'); } catch (e) {}
        endTurn();
        return;
      }
    } catch (e) {}

    // 2. PENDING HEAVY resolves: burst radius 1 around the declared tile.
    // The grid highlight was the warning; being elsewhere was the answer.
    if (m.telegraph && m.telegraph.kind === 'apHeavy') {
      var tg = m.telegraph;
      m.telegraph = null;
      var cx = (tg.aim && tg.aim.x != null) ? tg.aim.x : m.mx;
      var cy = (tg.aim && tg.aim.y != null) ? tg.aim.y : m.my;
      var hit = [];
      for (var i = 0; i < f.fighters.length; i++) {
        var o = f.fighters[i];
        if (!o.alive || o.fled || o.key === m.key) continue;
        var foe = false;
        try { foe = S.combat.isFoe(m, o); } catch (e) {}
        if (!foe) continue;
        if (Math.max(Math.abs(o.mx - cx), Math.abs(o.my - cy)) <= 1) hit.push(o);
      }
      if (!hit.length) {
        this.say(mName + "'s heavy strike lands on empty ground — dirt fountains where you stood.");
      } else {
        this.say(mName + ' brings the heavy strike DOWN — the ground erupts.');
      }
      var dmg = tg.dmg || 18;
      for (var h = 0; h < hit.length; h++) {
        this.tbDamage(hit[h].key, dmg, mName + "'s heavy strike");
      }
      try { this.drama('alienHeavyHit', cx, cy); } catch (e) {}
      m.apSpent = 1; // recovery: the strike took it out of them
      try { this.tbRefreshTelegraphUI(); } catch (e) {}
      endTurn();
      return;
    }

    // 3. RECOVERY: still moves (half), doesn't attack. The window is real.
    // (apSpent decrements at the END of the recovery turn, so the gates
    // below actually see it.)
    if (m.apSpent > 0) {
      try {
        this.saySituationOnce(m, 'apRecovery', mName + ' circles, breathing hard — the heavy strike took it out of them. (recovery — punish now)');
      } catch (e) { this.say(mName + ' circles, breathing hard. (recovery)'); }
    }

    // 4. Target: nearest enemy (player or villager ally).
    var tgt = null;
    try { tgt = S.combat.nearestEnemy(f.fighters, m); } catch (e) {}
    if (!tgt || !tgt.f) { endTurn(); return; }
    var t = tgt.f;

    // 5. Close in (half speed while recovering).
    var budget = (m.apSpent > 0) ? Math.max(1, Math.ceil((m.speed || 4) / 2)) : (m.speed || 4);
    try {
      var blocked = (function (mm) {
        return function (x, y) { return self.tbBlocked(x, y) && !(x === mm.mx && y === mm.my); };
      })(m);
      for (var sn = 0; sn < budget; sn++) {
        if (Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my)) <= 1) break;
        var st = this.tbStepToward(m, t.mx, t.my, blocked);
        if (!st || !st.moved) break;
      }
    } catch (e) {}
    var dist = Math.max(Math.abs(t.mx - m.mx), Math.abs(t.my - m.my));

    // 6. HEAVY STRIKE declare (every 3rd turn, in range): windup 1, burst 1.
    // The grid IS the telegraph — highlighted cells, audio cue, legible.
    m.apTurns = (m.apTurns || 0) + 1;
    if (m.apTurns % 3 === 0 && dist <= 3 && !(m.apSpent > 0)) {
      var cells = [];
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var gx = t.mx + dx, gy = t.my + dy;
        if (gx >= 0 && gx <= 8 && gy >= 0 && gy <= 8) cells.push({ cx: gx, cy: gy });
      }
      var heavy = Math.round((m.heavyDmg || 18) * (m._enraged ? 1.5 : 1));
      m.telegraph = { kind: 'apHeavy', cells: cells, dmg: heavy, aim: { x: t.mx, y: t.my }, attackName: 'heavy strike', turnsLeft: 1 };
      this.say('⚠ ' + mName + ' plants their feet — HEAVY STRIKE winding up. The marked ground is about to erupt. MOVE.');
      try {
        this.warnCells(cells, 1);
        this.audioEvent('telegraph', { urgency: 1, pattern: 'burst' });
        this.tbRefreshTelegraphUI();
      } catch (e) {}
      endTurn();
      return;
    }

    // 6b. BEAM (replaces the strike): the alien fires its beam weapon INSTEAD
    // of closing to strike. (break-it 2026-10-09: the beam used to fire from
    // a tbAfterPlayerAction wrap AFTER the alien's normal turn — a free bonus
    // attack that contradicted the "replaces their normal attack" design.
    // The roll lives here now, in the alien's own turn.) No beam while
    // recovering — the heavy strike took it out of them. No beam on the
    // opening turn either: the old post-player-action beam could never fire
    // before the player's first move, and a 90-110% max-HP beam with zero
    // counterplay on turn zero is not a fight, it's an execution.
    if (!(m.apSpent > 0) && (m.apTurns || 0) > 1) {
      try {
        if (typeof this.apMaybeBeamAttack === 'function' && this.apMaybeBeamAttack(m)) {
          try { this.tbRefreshTelegraphUI(); } catch (e6b) {}
          endTurn(); return;
        }
      } catch (e6b2) {}
    }

    // 7. Melee strike when adjacent. Persona-flavored but knowledge-safe:
    // behavior, never species — pre-reveal this is just a strange person.
    if (dist <= 1 && !(m.apSpent > 0)) {
      var base = 8 + Math.floor(Math.random() * 7);
      try { base += (typeof this.apProgressLevel === 'function') ? this.apProgressLevel(pid) : 0; } catch (e) {}
      if (m._enraged) base = Math.round(base * 1.5);
      // TOURIST CAM (break-it 2026-10-08): "Pip gets stronger the longer the
      // fight goes (more footage)." +1 per 2 alien turns, capped +6.
      if (pid === 'pip_quindle') {
        try { base += Math.min(6, Math.floor((m.apTurns || 0) / 2)); } catch (e2t) {}
      }
      // CRYSTAL LATTICE (break-it 2026-10-08): "Stores your fear as damage.
      // The more scared you are, the harder she hits." An afraid target
      // takes +8 from Sable's strike.
      if (pid === 'countess_sable') {
        try { if (this.hasStatus && this.hasStatus(t, 'fear')) base += 8; } catch (e3t) {}
      }
      var disp = 'neutral';
      try {
        var per = (typeof this.apPersona === 'function') ? this.apPersona(pid) : null;
        if (per && per.disposition) disp = per.disposition;
      } catch (e) {}
      var verb = disp === 'sadistic'
        ? 'They smile while they strike — like this is the fun part.'
        : disp === 'benevolent'
        ? 'They pull the blow at the last instant — holding back, even now.'
        : 'Efficient. Practiced. No wasted motion.';
      this.say('🗡 ' + mName + ' strikes. ' + verb);
      this.tbDamage(t.key, base, mName + "'s strike");
      // DREAD PROJECTOR (break-it 2026-10-08): "Projects your worst memory."
      // Sable's strike leaves the player Afraid (the status engine's fizzle
      // is the hands not listening). KNOWLEDGE GATE: the status source must
      // not name her pre-reveal — the fighter is still a "Stranger".
      if (pid === 'countess_sable' && t && t.kind === 'player') {
        try {
          var _dreadSrc = "the stranger's dread projector";
          if (this.apKnowsAlien && this.apKnowsAlien('countess_sable')) _dreadSrc = "Sable's dread projector";
          this.applyStatus(t, 'fear', { chance: 1, source: _dreadSrc });
        } catch (e4t) {}
      }
      try { this.audioEvent('meleeHit'); } catch (e) {}
    } else if (dist > 1) {
      this.say(mName + ' closes in, patient and unhurried.');
    }
    if (m.apSpent > 0) m.apSpent -= 1; // recovery spent at end of the turn
    endTurn();
  };

  // Intercept: hostile person-fighters take the bespoke turn.
  // tbMonsterTurn covers the browser's stepped tbAdvanceAsync, which calls it
  // directly for every non-player fighter. (The monster pipeline needs
  // m.mdef — a person has none, so it must never reach the generic turn.)
  // The node/sync path (party.js's tbAdvance) routes kind:'hostile' to
  // tbHostileTurn instead — that intercept is installed LAZILY inside
  // startAlienCombat below, because party.js Object.assigns tbHostileTurn
  // AFTER encounters.js loads and would silently replace a load-time wrap.
  var _tbMonsterTurn = G.tbMonsterTurn;
  G.tbMonsterTurn = function (m) {
    try {
      if (m && m.kind === 'hostile' && m.alienPid && typeof this.tbAlienTurn === 'function') {
        this.tbAlienTurn(m);
        return;
      }
    } catch (e) {}
    return _tbMonsterTurn ? _tbMonsterTurn.apply(this, arguments) : undefined;
  };

  // tbEndCheck ends combat when no MONSTERS fight — an alien-only fight
  // would end instantly as a phantom win. Wrap it (chain-safe; party.js's
  // betrayal wrap chains after this one): alien hostiles are the enemy.
  var _tbEndCheck = G.tbEndCheck;
  G.tbEndCheck = function () {
    try {
      var f = this.tbfight;
      if (f && !f.over && !f.betrayal) {
        var hostiles = (f.fighters || []).filter(function (x) { return x.kind === 'hostile' && x.alienPid; });
        if (hostiles.length) {
          var alive = hostiles.filter(function (x) { return x.alive && !x.fled; });
          var p = this.tbFighter ? this.tbFighter('p') : null;
          if (!alive.length) { this.tbEnd('won'); return true; }
          if (p && (!p.alive || p.fled)) {
            if (!p.alive) {
              this.state.scholar.health = Math.max(0, p.hp);
              if (this.maybeCheatDeath && this.maybeCheatDeath()) {
                p.hp = this.state.scholar.health;
                if (p.hp > 0) { p.alive = true; this.say('You refuse to stay down. The fight goes on.'); return false; }
              }
              this.tbEnd('lost');
            } else {
              this.tbEnd('fled');
            }
            return true;
          }
          return false;
        }
      }
    } catch (e) {}
    return _tbEndCheck ? _tbEndCheck.apply(this, arguments) : false;
  };

  // ================= REGISTRATION CHECKLIST (see header) =================
  G.encChecklist = function () {
    return [
      '1. Data: "unknown" strange descriptor on the animal/monster def. Animals: also "tell" (the distinct windup telegraph) and "killText" (knowledge-gated kill line, {kcal} placeholder, real yield feel — fat vs lean, the hazard in the guts).',
      '2. Prey: Game.ENC_PREY entry {notice, awareRate, stamina} — loop is free.',
      '2b. Behavior: "behavior" + "method" + "tell" in animals.json drive the flee, the strike, and the windup telegraph (encAnimalBehavior / encWeaponMethod / encWaryText). Wrong tool = worse odds, honestly said. NO proper tool at all = long shot, missing piece named (encMethodToolReady).',
      '2c. Miss reactions: encMissReact owns what a miss means per behavior (boar charges, goose retaliates, bobcat slashes and leaves). encNeverBolt lists the animals that never bolt.',
      '2d. Flee styles (Steve 2026-10-06): deer bursts 2 tiles on fresh legs (costs 2 stamina), turkey flutters then regroups (pstate regroup = your window), rabbit zigzags never repeating a hop (a.lastZig). Trapped prey corners (pstate cornered): lashes out or breaks through — panic audio animalPanic (encAudio: real synth preferred, bolt+rustle fallback — never silent). Noise: stalk 0.35 / still 0.55 / walk 1.0 / run 1.4 on awareness; running extends notice +1. Hunt practice XP (encHuntXPBonus/encHuntPracticed): background seeds 3, strikes +1, kills +2, capped +0.2 — no permanent backstory buff.',
      '3. Threats: "encounter" config in monsters.json + game.js enc* interface.',
      '4. Telegraph: Game.encTelegraphKnown(m); cue via Game.encPickCue.',
      '5. Phases: Game.encSetPhase / Game.encPhase(ent, phase, beats).',
      '6. Feedback: Game.feedback(text) for action results.',
      '7. Test: gating, loop, feedback-at-site. See test-encounters.js.'
    ];
  };
})();
