# Pacing build — all 8 proposals implemented (2026-10-10)

Steve 2026-10-09 23:36 CDT: "Continue all proposed. Address all gaps identified."

## Commits (local master, pending ship)

- `b912071c` — P0: feastSurge gate all-maxed→≥3 at L3 (channelSentiment); sentiment taught at integration 60, not 80; Arc III needs 2 crisis kinds + grave-first beat acknowledgment.
- `e0c18ee8` — P1: trap learnability (first witnessed catch → recipe L1); audience trials recurring post-40 with completable 1,000-kcal task (3,000 kept as ambitious).
- `6d482c62` — P1/P2: slot ladder 20→2/35→3/50→4/65→5/80→6; Arc II gates on a real deed.
- `49d228f6` — P3: villager↔villager bonds engine (v.bonds, +2 lingering meals, +4 visits, grievance decay, drift sediment ±3, +6/pair/day cap, pairAffinity reads bonds); player-hosted feast (400×roster kcal min 1,500 from real pantry items, 1/day, feast_shared memories + revived recordLifeseedEvent writer + capped trust + gossip); Haven panel button.
- `527d1824` — fixes: abilitySlots WRAP (progression.js, the runtime authority) gets the new ladder; Arc II deed = 6+ NEW breadth since landing (baseBreadth; starting endowment is ~8, so breadth>=6 was trivially true); proof test 39/39 ×3 seeds.

## Gaps addressed (beyond the 8)

- **Arc II timer**: starting breadth measured at 8 — the first deed draft (breadth>=6) was STILL a timer. Fixed with baseBreadth: only newly-learned breadth counts.
- **Arc III grave dominance**: now needs 2 crisis kinds; grave-first runs get the acknowledgment line ("The first grave is still fresh soil...").
- **Dead lifeseed writer**: recordLifeseedEvent created; drift's feast_shared/kindness reads work now.
- **feastSurge honesty**: new "Not yet" path when <3 mastered gifts (was: silent practice loop forever).

## Caught during implementation

- progression.js wraps abilitySlots() — game.js's copy is NOT the runtime authority. The wrap had its own ladder (20/40/60/70/80). Both updated.
- P1 test initially showed "1xL3 alone → practice": character backgroundAbilities made unmaxed non-empty — correct behavior, test setup fixed.

## Proof

scripts/test-pacing-20261010.js: 39/39 × 3 seeds (20261010, 7, 99).
Covers: surge gate (3 paths), sentiment at 60/80, trap witness learning, trial tasks + encore gating, slot ladder (12 cases), Arc II deed (3 cases), Arc III 2-crisis gate + beat text, bonds (10 cases), feast (9 cases), lifeseed writer.
Ontology: 52/52 validated.

## Sweep

Re-ran scripts/sweep-completion.js (60 seeds × 4 policies × 200 days).

### Headline deltas vs pre-build baseline

| policy | Arc III (base → now) | Arc IV | table | wins |
|---|---|---|---|---|
| competent | 80% → 78% | 0 | 0 | 0 |
| mvc | 43% → 35% | 0 | 0 | 0 |
| leader | 33% → 10% | 0 | 0 | 0 |
| zero | 22% → 5% | 0 | 0 | 0 |

The 2-crisis Arc III gate made Arc III harder (intended: earned, not attrition) —
the drop is steepest for weak policies that only ever crisis via first-grave.

### What moved

- **sentimentTaught (competent): 2% → 37%** (22/60; audit target was >25%). The
  thesis mechanic is a mid-game engine now.
- **stage 3 (competent): 5/240 → 6/60.** Integration 80 remains the wall —
  the discovery monoculture persists; audience-encore trials are too new to
  judge from this sweep (policies don't chase trials).
- **feastSurgeUsed: still 0/240** — policies never channel keepsakes (policy
  blindness, flagged in the audit; not a game gate anymore).
- **Median survival unchanged** (competent 27d, mvc 17d, leader/zero 14d) —
  expected: this build was progression pacing, not survival tuning.

### The road is walkable (forced-chain proof)

`/tmp/prove-arc4.js` (one-off): sentiment@60 → channel with 3×L3 → feastBurn
(mult 2.25, feastSurgeUsed=true) → Arc IV fires → tableWaiting=true → ARC IV
beat. All four links verified green. No run has completed organically yet —
remaining walls are integration-80 reach and sim policies that don't channel.

### Follow-ups (not in this build)

- Integration 40→80 diversity: encore trials exist but policies don't chase
  them; the 40+ quest line / dead system_task revival (audit runners-up).
- A channeling sim policy to prove organic completion.
- Trap/fishing uptake in sims (witness learning is new; policies don't set traps).
