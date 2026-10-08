# BREAK-IT: knowledge system (target #2) — 2026-10-08

Hostile-player run against the cross-cutting knowledge system (identifyPlant /
grantKnowledge dispatcher, teaching loops, codex UI, gating). Three real breaks
found and fixed; every attack below has a proof test in `scripts/test-*.js`.

## BREAK 1 — grantKnowledge squashed L2/L3 plant grants to L1 (honesty + function)
**File:** `src/js/game.js` — `_grantPlant` (~10843).
`grantKnowledge('plant', pid, level>1, ...)` on an unidentified plant early-returned
through `identifyPlant`, which grants only L1. The promised level was silently dropped.
Live callers hit it:
- `readBook`: books with `unlocks.level` 2/3 (`medicinal_plants`, `wardens_notebook`,
  `late_summer_herbarium`, `foxfires_journal`, …) promised deep knowledge, the book is
  CONSUMED (one-shot) — the player was left at L1 forever with no recourse.
- `studyVillageCodex`: granted `entry.level` (up to 3) but the return line claimed
  "Learned: 🌿 X (L3)" while the codex landed at L1 — the label lied.
**Fix:** identify first, then fall through to the level-up path when `level > 1`
(the identify beat still fires; the deeper level lands in the same beat with the
"deeper understanding" line).
**Proof:** `scripts/test-knowledge-grant-squash-20261008.js` — RED pre-fix
(6 failures incl. "label L3 vs engine L1"), GREEN post-fix × 4 seeds
(20261008, 7, 424242, 987654321). Existing `test-knowledge-grant-engine-20261007.js`
still 34/34.

## BREAK 2 — villager forage knowledge branch crashed (ReferenceError)
**File:** `src/js/game.js` — `resolveOneAssignment` forage branch (~4458).
The 25%-gated "villager learns a plant" block used a bare `v` that was never
declared in the function. Every time the gate hit: `ReferenceError: v is not
defined` — the whole forage resolution died (no pantry food, no report), and the
endDay caller deletes the assignment in its catch. Villager forage knowledge was
effectively dead 25% of the time.
**Fix:** `const v = this.state.village;` at the top of `resolveOneAssignment`.
**Proof:** `scripts/test-knowledge-forage-leak-20261008.js` — RED pre-fix
(ReferenceError), GREEN post-fix × 4 seeds.

## BREAK 3 — forage learn-report leaked the true plant name (honesty, sibling of #2)
**File:** `src/js/game.js` — same hunk (~4473). Once un-crashed, the report said
"<First> also learned to recognize `<TRUE NAME>`" — but the branch guard fires
exactly when the PLAYER does not know the plant, handing them the name for free.
**Fix:** descriptor gating, the firesideTeaching pattern:
`plantKnown(p.id) ? p.name : (p.description || 'a plant')`.
Sibling sweep: other task reports (hunt/fish/wood/water/scout/patrol) name no
species; `wrongTeaching` both branches gated; `flowVillageKnowledge` grants-then-names
(honest); `refreshItemNames` only called post-identification; `plantUses` level-gated.
**Proof:** same test file — asserts zero true-name leaks × 4 seeds.

## BREAK 4 — animal/tree codex entries had no readable surface (dead-code)
**File:** `src/js/app.js` — `codexScreen`. `_grantAnimal` / `_grantTree` (and the
carexplore tree writes) land entries in `state.codex.animals` / `state.codex.trees`,
but the codex screen rendered plants, skills, techniques, beasts, aliens, people —
never animals or trees. Earned knowledge landed nowhere re-readable.
**Fix:** ANIMALS and TREES sections in `codexScreen`. Animals name-gate on
`encAnimalKnown` with the `unknown`-descriptor fallback; tree entries only exist
once learned.
**Proof:** `scripts/test-knowledge-codex-sections-20261008.js` — extracts the actual
shipped template expressions (brace-matched tokenizer, not copies), evals against
live Game: known animal renders with level, unknown animal shows descriptor not
true name, trees list, sections hide when empty. RED pre-fix (sections absent),
GREEN post-fix × 3 seeds.

## HELD (attacked, survived — documented, not fixed)
- **Exploit sweep** (`test-knowledge-exploit-sweep-20261008.js`, 17 checks × 4 seeds):
  identifyPlant one-shot (no integration farm), grant/learnSkill no-repeat +
  no-downgrade, eat() L3 tasting fires exactly once, combineKnowledge blocked at
  0 harvests even when others know L4, studyVillageCodex second pass learns nothing.
- **Honesty sweep** (`test-knowledge-honesty-sweep-20261008.js`, 8 checks × 4 seeds):
  examine descriptions (whole pool × 3 qualities), questPlantRef, codexEntries
  kcal/prep gating at L1, monsterDisplayName pre-System, apCodexEntry pre-reveal,
  sortBag villager-sort (naming earned before the report prints) — zero leaks.
- **Dead-code notes:** `grantKnowledge` domains `skill`/`tree`/`monster` have no
  callers (callers use `learnSkill` / direct writes / `ensureMonsterEntry`); the
  branches are unused-but-harmless unified-dispatcher infrastructure. All
  `Scattering.Examine` exports are reachable; all 26 knowledge-touching modules
  load in index.html (Alien Players lesson re-checked — no dead modules).
- **Death/mantle:** `state.codex` persisting across mantle transfer is by design
  (ledger.js `playerDeath` — the village is the protagonist).
- Pre-existing failures in `test-knowledge-gate-20261008.js` (8, all
  `managerCircle/managerCharge/managerDebrief/managerFear` audio synths) reproduce
  identically on HEAD — unrelated to this run.
