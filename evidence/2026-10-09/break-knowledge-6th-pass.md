# BREAK-IT: knowledge system (target #2) — SIXTH PASS, 2026-10-09

Hostile-player pass over the knowledge system, deliberately avoiding all 24
prior kills (breaks 1–15 in evidence/2026-10-08/break-knowledge.md, 16–21 in
break-knowledge-4th-pass.md, 22–24 in
evidence/2026-10-09/break-knowledge-5th-pass.md). Fresh attack surface: the
bear rework (commit 7c04049, landed hours before this run) — animals.json
`knowledgeLevels` rewrite, `encAnimalLevel` + `vectorLevel` gating,
`masterTechnique`, fat rendering, pemmican, the "Tallow & Keeping" book.

Found **3 new breaks** (1 honesty/grant-squash, 1 honesty/copy-vs-engine,
1 functional regression), all fixed and proven. 1 new proof suite
(`scripts/test-break-knowledge6-beargating-20261009.js`): 21 checks × 3
seeds — RED pre-fix (13 failures/seed, exactly the break assertions),
GREEN post-fix. All prior knowledge suites re-run green (6 knowledge4,
grant-engine, exploit-sweep, honesty-sweep, softlock, fireside-wrong,
wrongwipe, tradeecon, deadcode, gating, journal 52/52, codex-sections,
sibling-teach, forage-leak, 3 knowledge3, bear-rework). Ontology 50/50.

## BREAK 25 — readBook squashed animal book levels to L1 (HONESTY, grant-squash sibling)
**File:** `src/js/game.js` — `readBook` (~2763).
The animal branch hardcoded `grantKnowledge('animal', aid, 1, ...)` while
the plant branch used `unlocks.level || 1`. The new book "Tallow & Keeping"
carries `unlocks: { techniques: ['render'], animals: ['black_bear'], level: 4 }`
— a grease-darkened pamphlet whose entire fiction is deep bear craft — and
the engine recorded Black Bear L1: codex card `[L1]`, "Learned: Black Bear
(Level 1)", masterTechnique never fired for the book path. Same bug class as
break 1 (2026-10-08 plant grant squash), one branch over.
**Fix:** the animal branch honors `unlocks.level || 1`, like plants. All
twelve older animal books (no `level` key) behave exactly as before.
**Sibling sweep:** the only other `grantKnowledge('animal', ...)` caller
(village codex sync) already passes `entry.level`. Recipe book grants
hardcode L3 (foxfire's journal data says L2) — documented below, NOT
changed: no UI ever surfaces a book's promised recipe level, so no
player-facing lie, and changing it alters gameplay semantics (L3 = "you can
make one"). Steve's call.

## BREAK 26 — the eating-deepening track narrated L4 without recording it (HONESTY, copy vs engine)
**File:** `src/js/game.js` — `eatOne` meat deepening (~17425).
Eating the same game 3/6/10 times narrates `knowledgeLevels['2'/'3'/'4']`
but never wrote `codex.animals[aid].level`. For black_bear the L4 text IS
the rework's gated content — "trichinosis — cook bear meat to 160°F
internal… Render the fat low and slow over fire… Dried meat + rendered fat
+ berries = pemmican" — told to the player while the engine still believed
L1. Consequences: the butcher-line trichinosis vector (vectorLevel 4 gate)
never appeared, the render technique never granted via masterTechnique, the
codex card stayed `[L1]`. The copy promised mastery; the engine kept the
apprentice.
**Fix:** new `_noteAnimalDepth(aid, level, src)` — records depth WITHOUT
narrating (the caller owns the learning beat); `_grantAnimal` now shares it,
so the masterTechnique rule lives in exactly one place (no future drift).
Each deepening beat records its level (2/3/4); narration only fires for
what the codex doesn't already hold (a L4 book followed by 3 tastings no
longer re-teaches the L2 text). No-downgrade, no-repeat, like every grant.

## BREAK 27 — the rework silenced ALL disease-vector lines on kills (REGRESSION, FUNCTION)
**File:** `src/js/encounters.js` — `encButcherHonesty` + `encIdentifyAnimal`.
The rework's gate (`encAnimalLevel >= vectorLevel || 1`, "default: shown at
L1 like before") assumed kills record L1 in `codex.animals`. Nothing did —
`encIdentifyAnimal` only bumped `animalEncounters`. With the level defaulting
to 0, the vector line went silent on kills for **all 34 L1-default animals**
(deer ticks/Lyme, turkey, rattlesnake…) — the exact surface Steve's disease
design ("sickness must be feared", 2026-10-06) depends on. The comment
claimed "like before"; the engine did the opposite.
**Fix:** `encIdentifyAnimal` records L1 via `_noteAnimalDepth` (quiet — the
kill line already says the name; guarded so encounters.js never hard-depends
on game.js). L1 vectors show on kills exactly like before; L4 vectors stay
hidden until L4 is genuinely earned (book or 10 tastings).

## HELD (attacked, survived — documented, not fixed)
- **Leak scan, vectorLevel-4 animals:** all 14 animals' `description`,
  `killText`, `huntText`, `behaviorDesc`, `unknown` scanned for the obscure
  names (trichinosis, trichinella, tularemia, brucellosis, CWD, leptospirosis,
  lung fluke) — zero hits outside the gated `diseaseVector` and (bear only)
  `knowledgeLevels['4']`. The killText/butcher knowledge dumps removed by
  the rework (skunk/javelina/bison) are fully gone.
- **`diseaseVector` has exactly one render site** (the gated butcher line) —
  the new gate is complete, not partial.
- **ANIMALS codex section** renders only the player's current level's text
  (`knowledgeLevels[String(aLvl)]`) — no all-levels dump. Badge now honest
  post-fix (was `[L1]`-forever for eaters).
- **Exploit probes:** masterTechnique is binary/no-repeat; the book is
  consumed on read (one-shot); deepening flags are one-shot; 10 tastings is
  time- and calorie-costed, not a farm. `encIdentifyAnimal` L1 is monotonic
  (no-downgrade).
- **Softlock probes:** pemmican reachable three ways (book → technique,
  bear L4 via book or 10 tastings → masterTechnique, blind renderFat attempt
  → trial teaches). No stuck knowledge states; contested/wrongAs untouched
  by this pass's changes.
- **Dead-code re-sweep (new surface):** `encAnimalLevel` (gated butcher
  line), `vectorLevel` (read), `masterTechnique` (read), `renderFat` /
  `pemmicanSets` / `makePemmican` (app.js actions + per-item buttons),
  spear `encWeaponMethod` (maul + readiness), "Tallow & Keeping" (reachable
  via the ruins 10% book draw — uniform over `data.books`). Nothing dead.
- **Correction to 5th-pass notes:** `Game.encAnimalKnown` IS defined
  (encounters.js:97, delegates to `canShow('animal', id, 'name')`) — the
  "never defined" minor note was wrong. Regional-familiarity true-positives
  are pre-existing design, not a leak.
- **Recipe over-grant drift (noted, not fixed):** readBook grants recipes at
  hardcoded L3 while foxfire's journal data says `level: 2` (L3 = "you can
  make one"). No UI surfaces the promised level — data/code drift, no
  player-facing lie. Left for Steve; changing it nerfs a book.

## Proof-test result counts (this pass)
- test-break-knowledge6-beargating-20261009.js: 21/21 × 3 seeds
  (20261009, 7, 424242). RED pre-fix: 13 failures/seed — exactly the break
  assertions (the 8 controls passed pre-fix, including the telling pair
  `b26_l2Narrated`/`b26_masteryNarrated`: the copy narrated depth the engine
  never recorded).
- Regressions: all 17 prior knowledge suites + bear-rework suite green;
  journal 52/52; ontology 50/50.
