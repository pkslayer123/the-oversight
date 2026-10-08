# Playtest 54 — Animal encounters (worker-animals)

Played 12 debug scenarios headless (node harness, `Game.stalkAnimal` / `Game.huntAnimal`,
up to 6 turns each, every action wrapped in try/catch). No exceptions thrown in any
scenario. Proof tests: `tests/test-<name>-20261007.js` (all currently RED).

## deer
Verdict: PLAYABLE
Setup: Crude bow + 12 arrows, deer grazing 1 tile away at dawn, unaware.
Played: Struck immediately (in range) — one-shot bow kill. Got the full kill
arc: "Got it — White-tailed Deer!", organ-first butchering advice, tick/Lyme
note, 1-in-3 raw sickness gamble, no-knife honesty ("knap a Stone knife or
this stays a carcass"), carcass added to inventory.
Found: Nothing blocking. Minor nit: spawn cue says "white tail raised in
alarm" while the scenario intends an unaware grazing deer (spawnAnimalNear
generic cue vs debug-scenarios.js intent). Headline "About 20000 kcal" vs
"Cleans to ~1500 kcal × 4" net is by-design (butcher honesty) but the gap is
large; flagging, not filing.
Fix: None needed.

## rabbit
Verdict: PLAYABLE
Setup: Sling in hand, rabbit adjacent at dawn.
Played: Strike → miss + "Wrong tool — a snare or running it down would work
better"; near-miss → bolt; stalked closer twice; rabbit winded (stamina 0,
"sides heaving, head low. Now's your chance"); final strike still missed
(randomness). Coaching line appeared: "a calm animal is a hittable animal."
Arc continues sensibly, never stuck, costs always stated (-100/-50 kcal).
Found: No bugs. Knowledge-gating held (descriptor "a brown blur with a
white tail-flag..." instead of the name until kill).
Fix: None needed.

## squirrel
Verdict: PLAYABLE
Setup: Sling, squirrel adjacent, midday.
Played: One-shot sling kill on first strike. Full kill arc, fat/cook/smoke
advice, carcass in inventory.
Found: Same by-design gross/net gap (350 vs ~104 net). No defects.
Fix: None needed.

## turkey
Verdict: PLAYABLE
Setup: Crude bow + 8 arrows, turkey adjacent at dawn.
Played: Fullest arc of the batch: clean miss → bolt → "The flock explodes";
stalk twice → regroup ("lands hard — wings half-folded, breast heaving.
Gathering itself. Your window."); strike → miss → winded; final strike →
kill with salmonella/cook-through advice. Every turn narrated, tracking
notes honest ("You read the sign — something prints, heading east").
Found: No bugs. Descriptor stays ungated-name-safe throughout.
Fix: None needed.

## opossum
Verdict: NEEDS WORK
Setup: Sharpened stick, opossum adjacent at night.
Played: T1 clean miss → TWO contradictory texts on one turn:
"[FB] Missed! A waddling pale shape, playing dead (badly) bolts. (-100 kcal)"
followed by "[SAY] ...flops over, tongue lolling — playing dead. It's not
dead. It's waiting for you to leave." It cannot bolt AND flop. T2 strike on
the "dead" possum resolved the trick correctly ("It never moved. One clean
strike — it was faking, too late now") with a proper kill arc.
Found: `encounters.js` huntAnimal clean-miss branch (~line 1832): `missVerb`
defaults to ' bolts. (-100 kcal)' for `plays_dead`, but `encMissReact`
immediately after owns the turn via `encPossumFlop`. Contradictory fiction
on one turn.
Fix: In `encounters.js` ~line 1832, add a `plays_dead` case to `missVerb`
that doesn't contradict the flop, e.g. `: (mBeh === 'plays_dead') ? ' goes still. (-100 kcal)'`. The flop's own say text then follows coherently.
Proof: `tests/test-opossum-20261007.js` (RED — asserts no "bolts" when the
flop owns the miss).

## bullfrog
Verdict: PLAYABLE
Setup: No weapon (bare hands), bullfrog adjacent at dusk.
Played: One-shot barehand catch. Clean kill arc (legs, salmonella, boil).
Found: No defects in this run, but the generic BITE hook ("It bites! Teeth
in your hand") CAN fire for frogs/fish — wrong anatomy. See crayfish fix.
Fix: None needed for the played arc; the BITE-hook exclusion proposed under
crayfish covers the latent case.

## boxturtle
Verdict: PLAYABLE
Setup: No weapon, box turtle adjacent, midday.
Played: Strike → near-miss ("jinks at the last breath"); wary tell ("Pulls
its head in a fraction"); bolt → winded → stalk → kill by hand with soup-
turtle kill text and the no-knife gate. Slow-animal arc works exactly as the
comments promise.
Found: No bugs. ("explodes away — but it's winded already" is dramatic for a
turtle, but reads as charm, not error.)
Fix: None needed.

## fox
Verdict: PLAYABLE
Setup: Crude bow + 10 arrows, gray fox adjacent at night.
Played: One-shot bow kill. Rabies-vector honesty, pelt advice, no-knife
gate, carcass in inventory.
Found: No defects.
Fix: None needed.

## crayfish
Verdict: NEEDS WORK
Setup: No weapon, crayfish adjacent in the creek.
Played: T1 strike caught it — but the catch printed THREE texts with two
defects: (1) "[FB] It bites! Teeth in your hand — 4 damage. Wild things have
teeth." — a crayfish has no teeth (the kill branch's own pinch text says
"the tiny boxer gets a pinch in"); (2) the kill line "Got it — Rusty
Crayfish! ..." immediately followed by "Got it — but the tiny boxer gets a
pinch in first. (-3 HP)" — "Got it" twice reads as a stutter / two catches.
Found: (1) `encounters.js` ~line 1755 BITE hook fires the generic
"It bites! Teeth in your hand" for `aquatic_defensive` (and would for
`aquatic`/`aquatic_ambush` — chub/minnow bites observed in chub run).
(2) `encounters.js:1808` pinch feedback re-announces the catch.
Fix: (1) In the BITE hook condition (~line 1755), exclude the aquatic
behaviors: add `&& hBeh !== 'aquatic' && hBeh !== 'aquatic_ambush' && hBeh
!== 'aquatic_defensive'` — the crayfish pinch text already covers its
retaliation; frogs/fish don't bite hands. (2) In the pinch branch (line
1808), drop the second "Got it": 'The tiny boxer gets a pinch in on the
way into the bag. (-3 HP) Grab it right behind the claws next time.'
Proof: `tests/test-crayfish-20261007.js` (RED — asserts no "Teeth in your
hand" and ≤1 "Got it").

## raccoon
Verdict: PLAYABLE
Setup: No weapon, raccoon adjacent at night.
Played: Best fiction arc of the batch. Near-miss → "[SAY] A masked shape
washing nothing in the creek snatches your Dried meat and bolts — clever
hands!" (inventory 7→6, actually stole an item). Stalked it to the treeline;
it melted away ("Gone. (-50 kcal)") and the encounter granted Night Hunting
Level 1. Honest costs, clever hands, a real consequence, and a skill reward
— exactly the kind of animal encounter the game wants.
Found: No bugs.
Fix: None needed.

## snappingturtle
Verdict: NEEDS WORK
Setup: Sharpened stick, snapping turtle adjacent at midday.
Played: 6 straight strikes. Every turn: -100 kcal, usually a ~13-15 HP bite
or snap retaliation ("It snaps! 13 damage — that beak means it."), "doesn't
even flinch", turtle never bolts (by design — aggressive = never-bolt), no
kill. The scenario gives no viable tool (method: line/trap; player has a
sharpened stick → wrong-method + "real long shot" 0.4 penalties) and the
encounter has NO resolution or exit guidance — a real player can grind to
zero HP with no hint to disengage.
Found: (1) Unwinnable-by-construction arc: the honest "wrong tool" text names
the fix (line/trap) but the player has no path to get one here and no
"sensible next action" beyond walking away — nothing suggests that.
(2) Grammar bug in the tool-readiness line: "You don't have the right tool
for this one — no a fishing line, no the trapping skill or a cage." —
`encMethodToolName` (encounters.js:508) returns article-bearing nouns
('a fishing line', 'the trapping skill or a cage') while huntAnimal prefixes
'no '. (3) Bite fiction: "It bites! Teeth in your hand" for a turtle — the
retaliation text correctly says "that beak", the generic bite text says
teeth.
Fix: (2) `encounters.js:508` `encMethodToolName`: return article-less nouns
('fishing line', 'trapping skill or a cage', 'snare wire', 'bow or sling')
so the 'no ' composition reads clean. (1) Design call: either equip the
scenario with a fishing line (it's "near water"), or after ~3 futile strikes
on a never-bolt animal say so and suggest moving on ("It isn't moving, and
you can't take it like this. Come back with a line or a trap."). (3) Add a
per-species `biteWords` override read from animals.json (snapping_turtle:
"The beak clamps on your hand") and use it in the BITE-hook feedback at
~line 1765.
Proof: `tests/test-snappingturtle-20261007.js` (RED — composes the line as
huntAnimal does, asserts no 'no a ' / 'no the ').

## chub
Verdict: PLAYABLE
Setup: No weapon, creek chub adjacent.
Played: Near-miss → "shoots under the rock — gone from sight. The creek is
small, though. It's still in there." (pstate hiding, hideTurns 3). Repeated
strikes while hiding are honestly blocked: "It's under the water — you can't
hit what you can't see. Wait it out, or move on." Verified the wait loop
separately: 3 `animalTurn`s → "Ripples settle — ... is back out, forgetting
you already." (pstate graze). A second run caught it first strike with a
clean kill arc. No softlock — the feedback names the right action.
Found: Two nits, both by-design-adjacent: (1) the generic teeth-bite can
fire for a minnow (same BITE-hook fix as crayfish); (2) "Eat it whole,
bones and all" followed by "You have no knife — knap a Stone knife ... or
this stays a carcass" is odd — nobody needs a knife to eat a minnow whole.
Economy note: 100-kcal strikes for ~60 kcal net fish; fine, it's a minnow.
Fix: Adopt the crayfish BITE-hook exclusion; optionally skip the knife gate
for tiny fish (behavior aquatic, calories < 500).

---
Scripts: `hidden_files/playtest-54/play-one.js` (driver), `hidden_files/playtest-54/smoke.js`.
Proof tests (all RED, deterministic via pinned Math.random): 
`hidden_files/playtest-54/tests/test-crayfish-20261007.js`,
`hidden_files/playtest-54/tests/test-opossum-20261007.js`,
`hidden_files/playtest-54/tests/test-snappingturtle-20261007.js`.
No repo files modified; no commits.
