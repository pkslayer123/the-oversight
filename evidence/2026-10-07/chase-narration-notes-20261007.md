# Chase narration fixes — bolt-turn silence + region common-knowledge (Steve 2026-10-07)

Worker: chase-narration. Proof: `scripts/test-chase-narration-20261007.js`
(played chases, seeded mulberry32, full index.html module list).

## Context

The animals playtest (`evidence/2026-10-07/animals-playtest-notes-20261007.md`)
found 2 FAILs. A sibling (db9acd8) had already landed a partial fix in HEAD:
`encChaseText` + a conditional narration call, and the `originKeywords` data
now carries `north_america` for US places. Verifying against the spec turned
up the remaining gaps; this run closes them.

## Finding 1 — mid-chase bolt turns (was: partial)

Sibling's version narrated only `if (movedAny && dist <= 6 && Math.random() < 0.75)` —
~25% of bolt turns still silent, all long-range bolt turns silent, and the
first `edgeTurns++` turn silent. Auditing every chase-state exit in
`animalTurn` found four more silent turns: turkey regroup, bolt→graze
calm-down (generic AND raccoon `curious` branch), fox taunt hold, and the
cornered-breakout dash.

### Changes (`src/js/encounters.js`)

- Bolt continuation now narrates **unconditionally** every turn the chase
  continues — no RNG gate, no range gate.
- New `hold` variant of `encChaseText(a, true)`: held-at-treeline lines for
  every bolt-capable behavior (deer "tail flicking, measuring the gap past
  you"; rabbit "a brown statue — every muscle coiled for the jink"; raccoon
  "head cocked — still more curious than scared"; opossum "teeth bared,
  hissing — the trick failed, the run is real"; …). Knowledge-gated
  vivid/plain pairs like the run lines; generic fallback for the rest.
- Filled the missing RUN lines for bolt-capable behaviors the sibling left
  on generic fallback: `curious` (raccoon), `plays_dead` (opossum),
  `cautious`, `patient`, `unpredictable`, `semiaquatic`, `aerial`, `ambush`,
  `wading`, `burrowing`, `pack`, `social`, `constrictor`.
- Turkey regroup turn narrates ("gathers itself — wings half-folded, breast
  heaving. The window holds.") — label recomputed from the raw descriptor
  to avoid duplicating the "— regrouping, wings half-folded" suffix.
- bolt→graze calm-down narrates ("slows — decides you're not following —
  and goes back to grazing."), both the generic range branch and the
  raccoon `curious` branch ("was never really scared of you").
- Fox taunt hold turn narrates ("trots in place — still toying with you.").
- Cornered-breakout dash narrates ("breaks through and runs — the chase is
  back on!"), skipped when the shove-past-you line already told it.

### Sample lines (played, seed 99)

- `RABBIT-HOLD-KNOWN`: "A brown rabbit, white tail flashing freezes at the treeline — a brown statue — every muscle coiled for the jink."
- `FOX-HOLD-UNKNOWN`: "A russet-gray flicker climbing a tree (it should not do that) pauses at the treeline, watching you." (descriptor-gated, no true name)
- `RACCOON-RUN`: "A raccoon washing nothing in the creek scampers off in bursts — pausing to look back, weighing your pockets."
- `OPOSSUM-RUN-UNKNOWN`: "A waddling pale shape, playing dead (badly) runs — waddling, hissing."
- `TURKEY-REGROUP`: "A wild turkey, iridescent feathers gathers itself — wings half-folded, breast heaving. The window holds."
- `DEER-CALMDOWN`: "A deer, white tail raised in alarm slows — decides you're not following — and goes back to grazing."

### Feel judgment

Played 24 species chases across 3 seeds and read the lines. The chase now
reads as a continuous scene instead of icon movement with occasional text.
Lines are terse (one clause); no log spam in the played runs — a chase is
~4-8 turns and each line advances the fiction (gait, decision, or
transition). The edge-hold lines are the best addition: the treeline pause
used to read as a stuck icon; now it reads as the animal thinking, which
is the correct hunt tension. Pre-existing data quirks noticed but not
touched: rabbit descriptor mentions "white tail flashing" (a deer trait),
fox descriptor carries "(it should not do that)" parentheticals.

## Finding 2 — region `common` knowledge (was: broken at layer a)

db9acd8 fixed layer (b) in data (`originKeywords` US places → `north_america`)
and added pawpaw seeding, but **never fixed layer (a)**: nothing copies
`originTags` onto `state.scholar`, so `canShow('animal')`'s region branch
(`s.scholar.originTags`) was still unreachable — the sibling's own proof
test only *simulated* the logic with hardcoded tags, never the real
`newGame` flow.

### Change (`src/js/game.js`, scholar creation in `newGame`)

```js
const scholar = S.state.newScholar(this.villagerId);
// REGION KNOWLEDGE (Steve 2026-10-07): the scholar carries the player's
// origin tags — "common" means common for YOUR region. ...
scholar.originTags = parsed.tags;
```

`parsed` (from `parseOrigin(homeRegionText)`) is in scope. Exile New Haven
keeps the scholar object, so origin survives the hard reset (correct: it's
the same person).

### Verified end-to-end (real `newGame` flow, 0 encounters)

- Columbus native: `scholar.originTags` includes `north_america`;
  auto-knows white_tailed_deer, cottontail_rabbit, raccoon, wild_turkey.
- Honest gate: does NOT auto-know javelina (`southwest_desert`).
- Accra outsider: tags lack `north_america`; knows neither deer nor rabbit
  at 0 encounters.

Steve's open question from the notes ("should a Columbus native auto-know
deer/rabbit at life start?") is answered by the shipped design: yes —
`common` + region overlap = recognized on sight, name known, deeper
knowledge still earned. The outsider path is unchanged.

## Proof results

`scripts/test-chase-narration-20261007.js` — 23 assertions, all green:

| seed | result |
|------|--------|
| 20261007 | 23 passed, 0 failed |
| 424242 | 23 passed, 0 failed |
| 777 | 23 passed, 0 failed |

Assertions: zero silent chase-state turns across 24 species × up to 14
turns each (bolt/regroup/taunt starts; graze calm is default silence, not
a transition); first edgeTurns++ turn narrates with a treeline decision
line; outsider edge line never names the animal; regroup/taunt-hold/
calm-down turns narrate; `scholar.originTags` populated for native and
outsider; native auto-knows 4 commons, not javelina; outsider knows none;
chase lines vivid+known for native, plain+descriptor for outsider.

## Gaps / notes

- Finding 3 (rattlesnake danger) was observation-only: no change, per notes.
- `scripts/test-animal-fixes-20261007.js` (sibling's, untracked in worktree)
  only simulated the region logic; the new proof script supersedes it for
  these two findings. Left the sibling's file untouched.
- No jest run: no existing suite covers these paths; the node proof is the
  verification (per worker template: write scripts/test-*.js).
