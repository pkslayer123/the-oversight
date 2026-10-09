# Break-it: forager r2 — preservation edges + rot-farm winter (2026-10-09)

Target: archetype 0 (forager), hostile pass over the preservation ladder's
specialist path and the village desperation-rot economy. Canon:
docs/PRESERVATION.md ("Energy is never created"), docs/DISEASES.md (two pools).
Proof: `scripts/test-forager-rotfarm-20261009.js` — 22/22 × 3 seeds
(20261009, 7, 99) AFTER; BEFORE mode demonstrates the E1 print.

## KILL (broke, fixed, proven)

### E1. Specialist master preserver printed kcal (EXPLOIT)
Self-smoking is 0.95x known / 0.80x blind (a drying loss). The specialist
branch used `(0.95 + 0.02 * spec.skill)` — skill caps at 3, so a master
smoked at **1.01x**: energy from nothing on every carcass through their
hands (measured: 2000 in → 2020 out). Same class as the pemmican print
(PRESERVATION.md: "Energy is never created").

Fix (food.js): `Math.min(1.0, 0.95 + 0.02 * spec.skill)` — the drying loss
shrinks with skill (a master wastes nothing, 1.00x) but never inverts.
Skill 1/2 regression-checked (0.97x/0.99x, no print). Ontology rule added:
`no_creation: true`. BEFORE: print measured. AFTER: exact 1.00x, still
smoked (state/stamp/prep unchanged), 51/51 ontology validated.

## HELD (attacked, resisted — measured)

### E2. Rot-farm winter (ATTACK on the spoilage clock)
`drawSpoiled` lets the village eat desperation rot at FULL kcal with a flat
50%/day severity-2 sickness roll. Hostile strategy: never preserve, let the
village live on rot, skip the whole ladder. Simulated 12-day winter, zero
production, 11 villagers, daily 30k kcal of day-rotted stores vs fresh
control:

- fresh: health flat 99.5→97.8, 0 sickness, 252k kcal eaten.
- rot: health **99.7→64.8** (slope ≈ −2.9/day, extrapolated dead in ~35d),
  25 'spoiled gut' episodes, 6 concurrently sick at end, 91 desperation
  announcements (never silent), 276k kcal eaten (desperation feeds — no
  starvation lie).

Verdict: the clock is NOT bypassable. The sickness cost is real and feared
(6 dmg/day × 3–5d per episode, expeditions skipped); rot-farming is slow
suicide. The design holds exactly as Steve's disease rule demands.

Wart noted (not a break): `drawSpoiled` ceils to the need (2000) while
`pantryDraw` floor1 leaves crumbs (1500 at need 1994) — the punishment path
feeds slightly more generously. Untriggerable by the player (rot only fires
when fresh is exhausted), consistent with the "indivisible piece eaten
whole" rule. Left as-is.

### S1. Only-rot pack (SOFTLOCK)
Player holding nothing but rot: eatOne refuses ("went bad — beyond eating"),
cookFood/preserveFood drop it honestly, specialist refuses ("won't touch
it"), giveFood says "You have no food to give." No throw, no kcal, every
refusal narrated. (Seed 99 caught a test bug, not an engine bug: the
scholar rolled preservation_instinct, so day-old "rot" was legitimately
fresh under the bonus-aware boundary — one boundary everywhere, working.)

### H1. Smoke labels vs stamps (HONESTY)
Rough-job self-smoke: prep "Keeps ~two weeks" vs spoilDay day+15 ✓.
Specialist: "Keeps well over a month" vs day+30+5·skill (35–45d) ✓.
spoilClockShort: "⚠ spoils tomorrow" at left=1, "spoils in 2d" at left=2,
silent at left=0 (row flags spoiled) ✓.

## Regressions
- test-forager-rotfarm-20261009: 22/22 × 3 seeds (new)
- test-break-food-20261009: 116/116 · test-break-food3: 46/46 ·
  test-break-food-spoilage: ALL PASSED · test-forager-sweep: 17/17
- test-break-food2-20261009: 41/42 — G6 care-package favor failure is
  PRE-EXISTING (fails identically on pristine tree; audience/favor system,
  out of forager scope — flagged for the owning loop)
- test-food-reality: 84/90 — 6 pre-existing failures, identical on pristine
  tree (stale clean/cook yield expectations post bear-rework)
- ontology: 51/51 validated

## FUN notes
- Delights: the desperation announcement ("Nothing fresh left. The village
  eats what should have been thrown out — and will pay for it.") followed
  days later by the sickness lines tells a complete, legible tragedy in the
  message stream. The rot economy reads as a moral choice with a visible
  price, not a hidden tax.
- Drags: nothing new this run.
