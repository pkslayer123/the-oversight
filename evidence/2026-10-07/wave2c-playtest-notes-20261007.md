# Wave-2C played audit — Hushwolf, White-Noise Heron, Hummice, Speedbump Turtle (Steve 2026-10-07)

Played AS A PLAYER through `scripts/play-feel-20261007-wave2c.js` (node harness,
engine loaded from HEAD, seeded RNG). **85/85 assertions green on seeds 20261007
and 777.** Audit base: HEAD at run time (see script header; the tree is hot —
siblings committed several times during the run).

**Label correction:** these four are **wave 1** in monsters.json (the ten
fleshed-out wave-2 monsters were covered by wave2a/wave2b). They are the wave-1
content newly brought to Highbeam Deer level and never fight-playtested. The
wave-2 bar does not apply; the deer checklist does.

## Verdicts

| Monster | Bar | Felt | One-line |
|---|---|---|---|
| Hushwolf | **PASS** | FUN | The silence is the whole fight — no telegraph, just teeth; wound the lead and the nerve breaks |
| White-Noise Heron | **PASS** | FUN | The locked lane is honest — sidestep it, punish the statue; the drift re-hide is a lovely beat |
| Hummice | **PASS** | GOOD | The stacking hum is real pressure; killing mice and SHOUTing both answer it |
| Speedbump Turtle | **PASS** | GOOD (slow) | The snap is a genuine scare; the bunker teaches patience; the grind is long |

## Per-monster played notes

### 1. HUSHWOLF (hushwolf) — PASS, FUN

**The loop, played (H1, blind):** "The woods go silent — not quiet. Silent.
Like the world holding its breath. The pack is already moving." The pack is
faster than the player — the opening rush resolves before the player's first
turn, and surviving it teaches the pattern (earned, not given: verified not
known pre-contact). The rush NEVER declares — verified across the fight, no
telegraph object ever set. One spear strike (PATIENT AIM doubled, 37) killed
the lead outright → "Without the lead, another wolf melts back between the
trees." + rout. On the other seed the strike wounded the lead instead →
"The lead staggers — and the pack's silence shatters into yips and snarls.
Coordination broken. (WOUND THE LEAD: it worked.)" — both paths play.

**The wound path, played (H1b, disclosed controlled wound via the engine
damage path):** all three wolves wolfBroken, the break narrates, wolfBreak
audio fires, the broken pack yips ("circles wide — the pack's nerve is
gone") instead of pressing, withdraw phase visited. Killed the yipping
non-leads, then the lead → won.

**Checklist:**
- Telegraph: none by design — the silence IS the telegraph (Steve killed the
  rush indicator; the tg-hushwolf-nodesign proof matches).
- Phases: rush → withdraw visited. **Data hygiene:** silence/circle are never
  entered in combat (the pack opens in rush); badges render (🤫/🐕) but the
  states are unreachable.
- Audio: wolfSilence (combat start), wolfBreak (wound + lead-falls) fire.
  wolfSnarl never fired — it plays only on threat-queue-front changes, which
  a straight fight never triggers (same class as wave2b's hecklerLaugh).
- Knowledge: blind = dread + the unknown descriptor ("a dog-shaped silence
  at the treeline"); no "Hushpuppy", no coaching pre-learn. The data knownCue
  ("They go quiet before the rush…") **has no surface in play** — the rush
  never declares, so the danger bar can never show it (same class as the
  service_mimic, which got a bespoke carrier beat; the hushwolf has none —
  see backlog).
- Distinct: the wave-1 rush predecessor done right — the escalation is the
  lead/wound/break system, not damage.
- Kill: won (H1b); routed (H1). Loot: tier 2, 0.1 (wave-1 appropriate).

### 2. WHITE-NOISE HERON (white_noise_heron) — PASS, FUN

**The loop, played (E1, blind):** holds at range 2 → declare: 4-cell line
locked through the player's square (verified contiguous, includes 4,4),
"still gathering itself…", UNFOLDING. Sidestep to (4,5) → second beat
("It unfolds further — impossibly tall. The air goes staticky.") → resolve:
"💥 It STRIKES — a needle out of the white noise! You're not where it
landed. Clean dodge." (the generic dodge ack FIRES for the heron — no stag
wiring gap here). Stepped INTO the next lane on purpose → ate 20. Surviving
taught the pattern (📖 Codex); later declares coached "It strikes where you
were, not where you are" + the sidestep knownTactics. After the strike it
sometimes drifts ("It is somewhere else now. You didn't see it move." — the
50% re-hide, verified via a dedicated 6-iteration loop). Killed with the
spear → won.

**Statue miss (E1b):** 10 swung at the still heron at range 2 → misses and
hits both observed ("You strike where you thought it was. It wasn't. (The
heron is hardest to see when it is stillest.)"). The miss is real, not flavor.

**Checklist:**
- Telegraph text: distinct; blind dread vs known coaching, correctly gated
  (knownTail needs the pattern earned — slain alone doesn't coach, which is
  correct per "knowledge is earned": a real veteran survived a strike).
- Grid visual: the locked 4-lane; matches the tg-heron-known proof.
- Phases: still → unfold → strike, all surfaced with distinct badges.
- Audio: heronStatic (notice/declare/unfold), heronUnfold (aggro),
  heronStrike (resolve) — all fire, all bespoke.
- Knowledge: no leaks ("White Noise" never shows blind); the strike's true
  name surfaces only via the codex gate ("💥 Spearfish Strike!" once learned
  — the encAttackName gate working as designed).
- Anatomy: spear beak → 4-line spear strike. ✓
- Loot: tier 2, 0.1.

### 3. HUMMICE (hummice) — PASS, GOOD

**The loop, played (M1, blind):** "The grass is humming. In harmony… Your
teeth ache with it. You don't know what it wants." (no SHOUT coaching blind;
humNotice audio). Stood in it: stacks 1→2→3→4 ("a low thrum" → "your teeth
aching" → "your bones buzzing" → "a solid wall of sound"), damage scaling
with it (9s → 14s per mouse per round at 4 stacks). At 3 stacks: "The hum
becomes a TIDE — teeth everywhere in the grass, all leaning your way."
Killed one mouse → "A voice drops out of the choir — the hum stutters and
thins.", stacks dropped, survivors scattered. SHOUT → "You cup your hands
and BELLOW" + shout audio, telegraphs cleared, mice startled back. Killed
the rest → won.

**Checklist:**
- Telegraph: per-mouse 5×5 burst declares; the declare also carries the
  stack narration. Matches tg-hummice-known proof.
- The humMult (1 + 0.25×stacks) is felt, not just math — standing still at
  4 stacks costs ~50/round from 13-HP mice.
- Phases: stalk → hum → tide → scatter (+ 'quiet' from SHOUT — **data
  hygiene:** 'quiet' has no phase badge).
- Audio: humNotice, humRise (stack-tagged), humBreak (choir drop), shout —
  all fire and mapped. **Backlog:** the declare also fires the generic
  `deerAggro` fallback (hummice has no aggroAudio) — the mice bellow like
  the Highbeam Deer every declare. Same class as wave2b's toad-bellow note.
- Knowledge: blind dread vs slain SHOUT coaching ("Or SHOUT (📢) — noise
  breaks the music.") — verified in M2. No leaks.
- Distinct: the wave-1 burst reference done as a swarm — the escalation is
  the stack economy + the choir-drop counterplay.
- Loot: tier 1, 0.08.
- **Telegraph-truth finding (see backlog):** burst telegraphs re-center at
  resolve (see below).

### 4. SPEEDBUMP TURTLE (speedbump_turtle) — PASS, GOOD (slow)

**The loop, played (T1, blind):** stepped adjacent → "💥 The boulder SNAPS —
its head is suddenly somewhere else. No warning. There never is." (turtleSnap
audio, 21 damage, pattern learned). Never declares — verified, no telegraph
ever set. Fought from spear range 2: strikes do 8-9 (armor 15 + physical
resist 0.5 stack — "hide absorbs 15", "resists physical — 15 → 8"). Below
half: "It withdraws. The shell seals with a sound like a door closing.
(BUNKER: nearly invulnerable for 2 turns — wait it out.)" — bunker strikes
did 1 (chip). "The shell unseals with a soft pop." Killed → won (11 rounds).

**Checklist:**
- Telegraph: none by design — the snap is the ambush (matches
  tg-speedbump-nodesign). The `quiet: true` config holds: no threat-queue
  chatter ("the queue stays silent — it's a rock").
- Phases: rock → snap → bunker, all surfaced.
- Audio: turtleSnap, turtleBunker — both fire, both mapped.
- Knowledge: blind = "a boulder with opinions about where you're walking";
  no "Speedbump". The data knownCue ("It's slow but the snap is fast…") is
  **reachable only via direct tbTelegraphCue — no in-play surface** (never
  declares; same class as the hushwolf — see backlog).
- Anatomy: snapping turtle → adjacent snap. ✓
- Feel note: the armor+resist double-dip makes the spear feel weak (8-9/hit
  on a 52-HP turtle = a long grind). The fiction supports it (it's a bunker)
  and the real counterplay is walking around it (it can't chase) — but a
  player who commits to the kill should expect a slog. Honest, not broken.
- Loot: tier 2, 0.1.

## Audio inventory (all fired hooks resolve to real synths in app.js)

knowledgeReveal, combatStart, wolfSilence, monsterDown, wolfBreak, round,
monsterHurt, combatEnd, heronStatic, telegraph, heronUnfold, impact,
heronStrike, victory, humNotice, deerAggro, humRise, humBreak, shout,
turtleSnap, turtleBunker, levelup, passiveUnlock — 23 hooks, zero unmapped.
wolfSnarl never fired (threat-queue-front-gated; informational).

## Backlog (engine/data — off-limits this run)

1. **CRITICAL — index.html stale-base revert (live-breaking).** Commit
   59ebdb3 added `<script>` tags for statusEffects.js, monsterBehaviors.js,
   abilityActions.js; a later version-bump commit reverted index.html from a
   stale base and all three tags are gone at HEAD. game.js calls
   `this.seTickFighter(m)` / `this.seFizzle(m)` UNGUARDED on every monster
   turn (game.js ~21055) and `this.applyStatus(...)` unguarded in a dozen
   places — without statusEffects.js the live game throws on the first
   monster turn and no fight can complete. The harness loads the three files
   in 59ebdb3's intended positions (documented deviation); the revert itself
   needs the engine owner + a fresh version bump. (Same STALE-BASE REVERT
   class as AGENTS.md 2026-10-06.)
2. **Burst telegraph re-centers at resolve; the windup grid shows stale
   cells.** For `squares`-kind telegraphs with non-beam/line patterns, the
   resolve recomputes cells from the attacker's CURRENT square
   (game.js ~21374), but the grid during windup shows the declare-position
   cells. A hummice that steps (pack cohesion) between declare and resolve
   hits a shifted 5×5: the shown burst can lie by a tile, and "Clean dodge"
   fired for a player who never moved (observed in M1). Fix (engine): after
   a telegraph-carrying monster moves, recompute tg.cells for re-centering
   patterns (or lock them). Sweep: mobile burst/ambush monsters — hummice is
   the live case; bright_idea (statue) and the turtle (never moves) are
   unaffected.
3. **Unreachable knownCues (never-declaring monsters).** hushwolf and
   speedbump_turtle never declare, so their data knownCues can never reach
   the danger bar — same class as the service_mimic, which got a bespoke
   carrier beat (game.js ~23181). Suggested: carry the hushwolf's on the
   "woods go silent" combat-start line once learned, and the turtle's on the
   snap line once learned.
4. **hummice plays the deer bellow.** No aggroAudio in data → the declare
   falls back to `deerAggro` (`dcfg.aggroAudio || 'deerAggro'`, twice in the
   declare branch). Mice shouldn't bellow like the Highbeam Deer. Suggested:
   a hum-flavored declare audio or a neutral fallback.
5. **antlerThrash double-run hazard.** monsterBehaviors.js's antlerThrash hook
   runs the thrash and returns false; the inline branch in tbMonsterTurn then
   runs it AGAIN. Today this is latent (the script tag is missing — see #1),
   but restoring the tags naively doubles the deer's adjacent damage. The
   hook should return true after running, or the inline branch should be
   removed per the migration's own rule.
6. **Data hygiene (no player impact):** hushwolf phases silence/circle never
   entered (pack opens in rush); hummice SHOUT sets phase 'quiet' which has
   no badge.

## Harness notes (for future workers)

- `scripts/play-feel-20261007-wave2c.js` — 85 assertions, exit non-zero on
  failure, green on seeds 20261007 and 777 (`SEED=777 node scripts/...`).
- HEAD moved 3 times during this run (siblings committing). The script reads
  the engine via `git show HEAD:` at runtime and records the base SHA — pin
  and re-verify if HEAD moves under you.
- Faster monsters act in the combat opening INSIDE startCombat: install
  damage watchers BEFORE newFight, and check pre-contact knowledge BEFORE
  newFight (the opening exchange teaches).
- `sayTelegraphOnce` is silent in combat by design — capture cue text via
  direct `Game.tbTelegraphCue(m)` calls in the policy, not from the transcript.
- knownTail gates on the pattern being learned (tbPatternKnown), NOT on
  codex stage — a "slain veteran" setup must also seed
  `codex.monsters[id].patterns[attackName]` to represent true knowledge.
- The heron's 50% drift is seed-flaky in a single fight — the E1c loop
  (rig beamPhase='strike' before the monster's turn, up to 6 fresh fights)
  makes it deterministic.
- The hushwolf one-shots/near-one-shots its 31-HP lead with a spear, so the
  natural fight often routs in 1-2 rounds — the wound path needs the
  disclosed tbDamage setup (H1b).
