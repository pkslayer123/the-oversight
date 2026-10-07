# Wave-2 played audit — GROUP A (Steve 2026-10-07)

Played AS A PLAYER through `scripts/play-feel-20261007-wave2a.js` (node harness,
engine loaded from HEAD, seeded RNG `20261007`; also verified stable on seeds 42
and 99). Five wave-2 monsters: **Static** (voice_mimic_radio), **Grief Counselor**
(mirror_stag), **Inspiration** (bright_idea), **Nostalgia** (memory_projector),
**Extended Warranty** (warranty_caller).

Final: **151/152 assertions green** on all three seeds. The one failure is honest:
the Inspiration's intended kill loop is broken by a real engine bug (see below).

## Verdicts

| Monster | Bar | Felt | One-line |
|---|---|---|---|
| Static | **PASS** | FUN | The lure is the whole fight — dread first, the replay is the punchline |
| Grief Counselor | **PASS** | GOOD | Mirror gaze + wheel = the deer evolved; dodge once and it punishes greed |
| Inspiration | **FAIL** | BORING→BROKEN | The intended kill loop cannot land a hit (ember-timing bug); unkillable by design |
| Nostalgia | **PASS** | FUN | The spell-pull is the cruelest wave-2 mechanic; movement is the dodge and it feels earned |
| Extended Warranty | **BORDERLINE** | GOOD (1v1) / BORING (crowd) | The call cycle is great theater 1v1; crowds perma-lock it in redial |

## Per-monster played notes

### 1. STATIC (voice_mimic_radio) — PASS, FUN

**The loop, played:** Blind contact is dread ("Crying, in the dark. A voice you know.
It sounds exactly like them — but they're safe at the haven. Aren't they?"). Hold
your ground and the Distress Call declares (direct/range 3, undodgeable once
declared — 16-24, verified in-band). Two resists break the act ("You don't move.
The crying stutters... fragments... stops. Silence — then a small, furious crackle
of static. It's a radio. It was always a radio.") and it RUSHES with no telegraph
("Your own voice screams out of the radio — no words, just fury — and it's already
on you. No voice. No warning. Teeth of static."). The revealed radio takes 1.5x
("The signal scrambles — exposed, it takes the hit badly.") — resisting pays.

**Fed the lure (act 2):** walking toward the crying advances call → approach
("The crying sharpens — clearer, closer. It knows you're coming." / "The static
resolves — mid-sob — into a voice like a person, maybe 50s. 'PLEASE. Don't leave
me out here.' It's coming closer now." / 📻 CLOSING IN). Standing still through
act 2 cost 241 HP over 22 turns — feeding it is properly punishing.

**Checklist:**
- Telegraph text: distinct. Declare dread pre-name ("Something is coming — and
  moving won't help once it has your voice."); post-learn it names Distress Call.
- Grid visual: **none by design** — direct pattern, "the voice is everywhere."
  Honest, but note: `sayTelegraphOnce` is SILENT in combat, so the declare dread
  lives ONLY on the telegraph UI (danger bar). In-harness I verified the cue text
  via `tbTelegraphCue`; on the real UI the player sees the ⚠ cue. If the danger
  bar ever fails to render cueText for direct telegraphs, this monster has NO warning.
- Phases: 📻 CALLING → 📻 CLOSING IN → 📻 REVEALED, all surfaced.
- Audio: staticCry (contact/call/approach), staticBreak (reveal), staticScream
  (replay rush), telegraph (declare). All distinct, all fire.
- Knowledge gate: blind = dread only; slain rematch coaches ("It's bait. Don't
  walk toward the crying — that feeds it. Stand still, resist, and the act
  breaks. Fire scrambles the signal."); learned declare appends "You know this
  one: Distress Call…" + the data knownCue ("The voice is bait. It wants you to
  come closer — don't."). No leaks.
- Distinct from wave-1: the Nightlight Catfish is the direct-pattern lure
  predecessor (light); Static is the cognitive escalation (a voice you know).
  Genuine step up on theatrical terms.
- Kill: resist → reveal → punish the exposed. Won with 82 HP taken. Loot-as-action OK.
- Loot: 37/200, tier 3 (data). See loot rule note below.

### 2. GRIEF COUNSELOR (mirror_stag) — PASS, GOOD

**The loop, played:** Mirror phase (walks at you, 2 steps/turn — "It starts walking.
Not running. Walking. That's worse."), the gaze freezes you 40%/turn ("You meet
its gaze in the mirror. Yourself, tired and afraid — and you can't look away.
FROZEN."), then confront declares a 6-tile lane locked at declare (verified
straight/contiguous; grid-clamped near edges). Sidestep and stay off — the lane
doesn't track you. Miss → **THE WHEEL**: immediate re-declare, 1-turn windup,
aimed at where you are NOW ("It wheels on a hoof — no windup this time. The
mirror is already on you. MOVE."). Respect the wheel, punish after. Played right:
0 damage taken across acts 1-2; the kill took 3 strikes.

**Grid snapshot (declare, blind) — 6-tile locked lane:**
```
|· · · · · · · · · |
|· · · · · · · · · |
|· · · · · · · · · |
|· · · · · · · · · |
|* * p* * * * M · · |
|· · · · · · · · · |
```
(P on the lane at declare → sidestepped off; the lane never moved.)

**Checklist:**
- Telegraph text: distinct per phase; blind declare is dread ("The mirror face
  swings toward you, blinding. Something is coming.") with NO "MOVE SIDWAYS" leak;
  known declare coaches ("It's going to charge — in a straight line. MOVE SIDWAYS.").
- Phases: 🪞 MIRROR → 👁 CONFRONT → 💥 CHARGE, all surfaced.
- Audio: stagMirror (contact/gaze), stagSnort (declare/wheel), stagCharge (resolve).
- Knowledge gate: blind = dread; slain rematch coaches the gaze + the line;
  learned tail appends knownCue ("Don't look at the reflection. Look at its feet —
  they tell you where it's going.") + knownTactics ("Break line of sight during
  the mirror beat and the charge dies unspent. Or sidestep — it can't turn
  mid-charge."). No leaks.
- Distinct from wave-1: explicit evolution of the Highbeam Deer (same chassis,
  beam replaced by mirror + WHEEL). The wave-1 answer (dodge once, step in,
  punish) gets you run over — the wheel demands a new rhythm. Genuine step up.
- **Wiring gap (backlog):** the stag's declare never sets `threatenedPlayer`, so
  the generic "Clean dodge" feedback never fires — a sidestepped charge says "It
  slams through!" with no acknowledgment the player read the lane.
- Kill: dodge → wheel → punish. Won, 0 damage when played right.
- Loot: 29/200, tier 3 (data).

### 3. INSPIRATION (bright_idea) — FAIL, BORING→BROKEN

**The loop, played:** It SETS on first contact (never moves again), brightens over
2 beats ("The glow intensifies — the air tastes like copper. Brighter." /
"BRIGHTER. The light is wrong now, too bright to look at."), detonates (burst
radius 2, 22-34 — verified in-band; verified 25-cell snapshot below), craters the
ground ("Where the light struck, the ground is cratered and black."), gutters to
ember. Backing off = 0 damage across 10 detonations. Eating it = DAZZLE (blinded
2 rounds, "White — then spots that won't clear. You're dazzled.") + 22-34.
Daylight disperses it ("It was never meant for daytime."). REKINDLE narrates
("But it guttered faster this time. It's learning how to come back.").

**Grid snapshot (declare, blind) — 25-cell burst:**
```
|· · · * * * * * · |
|· · · * * * * * · |
|· · P * * m* * * · |
|· · · * * * * * · |
|· · · * * * * * · |
```
(Player at safe range 3; the burst is honest on the grid.)

**The bug (FAIL reason):** the design says the ember burns 2 turns, then 1, then
0 (`m.biEmber = 3 - m.biCycles`), and the EMBER PUNISH comment says the ember is
the spear kill-window ("without this the coaching can never kill it with a
spear"). But the bloom→ember flip and the first ember decrement run in the SAME
monster turn (`const biPhase = m.beamPhase` is re-read AFTER `encSetPhase(m,
"ember")`). Observed ember player-turns per cycle: **[1, 0, 0]** vs design
[2, 1, 0]. One turn is only enough to STEP IN from safe range — never to strike.
The intended dodge→punish loop cannot land a hit; the EMBER PUNISH resist-ignore
never triggers; the monster is effectively unkillable by the intended loop (only
facetanking 22-34 bursts works, contradicting the BACK OFF coaching). The kill
act (80 turns of the best available grind) failed: 1 resisted strike for 8, then
the loop dead-ends. **Flagged for the engine owner** with location + suggested fix
(capture biPhase before the flip, or return after setting ember).

**Checklist (aside from the bug):** telegraph text distinct; phases
💡 SETTLED → 💡 BRIGHTENING → 💡 EUREKA → 💡 EMBER all surface; audio eurekaDrift /
eurekaCharge / eurekaTick / eurekaSpent / eurekaDisperse all fire (plus
eurekaDetonate on the blast); knowledge gate clean (blind dread vs known
"⚠ It's brightening. Two beats from glow to boom — BACK OFF. Radius 2."); distinct
from wave-1 bursts (Flashbulb Moth flash, Choir Toad resonance, Hummice stacks) —
the escalation is rekindle + dazzle + the biggest burst in either wave. With the
ember bug fixed this is a PASS; as played it's a FAIL.
- Loot: 27/200, tier 2 (data).

### 4. NOSTALGIA (memory_projector) — PASS, FUN

**The loop, played:** It watches first (2 turns — "The light flickers. Shapes
resolve. Is that... is that home?"), then the spell: a 5-tile beam along your
line of gaze (verified 5 cells). Stand still and the light PULLS you ("You take a
step closer without deciding to. The light wants you nearer.") — 26 pulls
observed — straight into the beam (16-26, verified in-band; 158 damage over 7
beams for the statue player). Move 2+ tiles in one turn and the spell SHATTERS
("You force your feet to move — the image judders, breaks up. Too fast. It can't
hold the picture.") — the mover took 0 damage across 30 turns. Post-beam it goes
static (narrated, one beat), then watches again — and HOMESICK means it finds you
faster next time ("It barely watches this time. It knows you'll stand still.
It's counting on it."). The cruelest wave-2 mechanic, and the counterplay
(movement) is the dodge.

**Checklist:**
- Telegraph text: distinct; blind declare is the picture-dread ("It unfolds a
  screen of light between the trees. And there — impossibly — is home… The light
  has edges. The edges are sharp."); known declare coaches ("It's showing you
  home to hold you still. The beam runs along your line of gaze — MOVE. Keep
  moving and the picture can't hold.").
- Grid visual: 5-cell beam; **knowledge-gated** — `mpBeamKeys()` returns 0 cells
  while winding blind, 5 once learned (warm-amber overlay; verified via the gate
  function). The grid IS the telegraph, earned.
- Phases: 📼 WATCHING → 📼 SPELLBOUND → 📼 STATIC, all surfaced (static is a
  monster-turn-internal beat, narrated).
- Audio: projectorHum (watch + spell), projectorPull (the drag), projectorStatic
  (post-reel), projectorBreak (the shatter), telegraph (declare). All fire.
- Knowledge gate: blind = dread; slain rematch coaches; learned tail appends the
  data knownCue ("The picture holds you still. Keep moving and it can't lock
  on."). No leaks.
- Distinct from wave-1: the Highbeam Deer is the beam predecessor (sweep);
  Nostalgia is the cognitive escalation (the beam follows your gaze; stillness
  is the trap). Genuine step up.
- Kill: break the spell, punish the static/watch windows. Won (3 strikes, 42 taken).
- Loot: 25/200, tier 3 (data).

### 5. EXTENDED WARRANTY (warranty_caller) — BORDERLINE, GOOD 1v1 / BORING in crowds

**The loop, played (1v1):** dial ("We've been trying to reach you about your car's
extended warranty.") → ring (the tell — "A phone is ringing. In the trees. It's
ringing for you." + hold-music audio; **no grid telegraph, by design**) → pitch
(the rush — "The voice drops all pretense of politeness, and the WORDS hit you.",
14-22 verified in-band) → redial ("Hold music, faint, from the treeline. It is
redialing."). Move 2+ tiles from the dialed spot and the call DROPS ("CALL
DROPPED." — the mover took 0 damage over 26 turns). Hurt it mid-call = BAD
CONNECTION ("—BAD CONNECTION— … It hangs up. It is already redialing."). Redials
come faster: [2,1,1,1,1,1,1,1] turns ("The hold music is shorter this time. It
knows your number now."). Wrong-number works: 3-6/8 first-dials go to a villager
across seeds (the 50% pick verified). Known ring coaches the tell ("Ring-ring.
It's calling YOU. Don't be where you were. It can only dial a stationary
target. Keep moving and it can't place the call.").

**The crowd problem (BORDERLINE reason):** with villagers in the fight, their
autonomous chip damage (2-4/round) triggers BAD CONNECTION on EVERY monster turn
— the caller never completes a dial→ring→pitch cycle. It redials forever and
deals zero damage. Thematically charming ("hang up on the telemarketer"), but the
wave-2 bar says monsters were sent to fight, and the Performance Review ADAPTS
to crowds after one recalc ("REDUCING SCOPE. EVALUATING PRIMARY SUBJECT") while
the warranty has no such adaptation. A crowd permanently neutralizes it.
**Flagged for Steve** (suggested: after N consecutive bad-connections it drops
the phone and rushes directly, "it's done being polite" — or threshold the
bad-connection trigger).

**Checklist (1v1):** telegraph text distinct per phase; phases 📱 DIALING →
📱 RINGING → 📱 CONNECTED → 📱 REDIALING all surface; audio lineCut (dial/drop),
holdMusic (ring/redial), serviceRush + impact (pitch) all fire; knowledge gate
clean (blind dread vs known coaching + learned tail); distinct from wave-1 rush
(Hushpuppy) — the escalation is the call cycle, wrong-number, bad-connection.
1v1 it's GOOD; in crowds it's a training dummy → BORDERLINE overall.
- Kill (1v1): drop/move, punish the redial. Won (4 strikes, 14 taken).
- Loot: 24/200, tier 2 (data).

## Loot rule check (reported, not fixed)

| Monster | Data tier | 200-roll drops | Rolled tiers |
|---|---|---|---|
| Static | 3 | 37 | 3 (starfall_bow, phase_blade, nanite_swarm, gravity_well) |
| Grief Counselor | 3 | 29 | 3 (same pool) |
| Inspiration | 2 | 27 | 2 (gravity_hook, hardlight_knife, contract_quill, phase_sling, medfoam_canister) |
| Nostalgia | 3 | 25 | 3 (same pool as Static) |
| Extended Warranty | 2 | 24 | 2 (same pool as Idea) |

All chances ~0.12-0.19 (LOW, not raining). The engine implements Steve's rule
exactly (wave-1 non-veterans capped at 2, veterans bump to 3 post-unlock). Regular
wave-2 monsters dropping tier 3 is the DATA as authored — Static/Stag/Nostalgia
at tier 3 vs the "only veteran wave-1 variants + apex drop wave-2 loot" reading.
For Steve's call; nothing changed (stats off-limits).

## Audio inventory (all fired at least once across the run)

staticCry, staticBreak, staticScream, stagMirror, stagSnort, stagCharge,
eurekaCharge, eurekaTick, eurekaDetonate, eurekaSpent, eurekaDisperse,
projectorHum, projectorPull, projectorFire, projectorStatic, projectorBreak,
lineCut, holdMusic, serviceRush, impact, telegraph, combatStart. No generic-sounding
hooks on these five; every cue is monster-specific.

## Wiring backlog (engine off-limits — for the engine owner)

1. **EMBER-TIMING** (bright_idea, game.js ~22078): bloom→ember flip and first
   `m.biEmber` decrement run in the same monster turn. Observed ember
   player-turns/cycle [1,0,0] vs design [2,1,0]. The intended punish loop can't
   land a hit; the monster is unkillable by the intended loop. Fix: capture
   biPhase before the flip, or return after setting ember.
2. **MISSING threatenedPlayer** (mirror_stag, game.js stagIs branch): the charge
   and wheel declares don't set `threatenedPlayer`, so "Clean dodge" never fires
   for the stag.
3. **CROWD SUPPRESSION** (warranty_caller, game.js ~22846): villager chip damage
   perma-locks the caller in bad-connection redial. Suggested: adapt like the
   drone after N consecutive bad-connections, or threshold the trigger.

## Things needing Steve's judgment

- The Inspiration FAIL is a bug, not a tuning question — fix the ember timing and
  it should become the intended dodge→punish loop. Worth re-auditing after the fix.
- The warranty crowd-suppression: is "bring friends and they hang up for you"
  an acceptable hard counter, or should it adapt? (My suggestion: it gets
  impatient and rushes.)
- Loot tiers: Static/Stag/Nostalgia at tier 3 in data vs the strict reading of
  the wave-2 loot rule. Engine matches the rule; data is the question.
- Wave-2 bar, honestly: Static and Nostalgia are cognitive/theatrical
  escalations (the step up is what they do to your head, not their DPS) — I
  count that as genuine on its own terms, per Steve's allowance. The Stag is the
  most "mechanical" step up (wheel). The Warranty is the most theatrical (the
  call cycle) and the weakest in crowds.
