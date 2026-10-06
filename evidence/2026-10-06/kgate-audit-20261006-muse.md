# Knowledge-gating audit — recent-commit surfaces (2026-10-06, Steve's law: "If you don't know, it doesn't show.")

Auditor: Muse (subagent). READ-ONLY on game code; no fixes applied.
Repro: `node scripts/test-kgate-audit.js` — EXPECTED-FAIL documentation. Each leak below
has a failing assert that flips green once the gate is added. SKIP IN CI until green.

Scope (per task): arrival text pools (3efd271, carexplore.js/game.js), rot legibility +
spoilClockShort (edb9138, food.js), moot verdict transcript (2e6f28a/855cbcc,
betrayal.js/justice.js), villageEats messaging (89dae4b, game.js), contest play
surfaces (513d747, contests.js). Telegraph gating already verified clean
(evidence/2026-10-06/proof-notes.md) — not re-audited.

Severity: HIGH = narrator names something the character can't know, on a hot path.
MEDIUM = same, on a colder path. LOW = flavor-level, Steve's call.

---

## FINDINGS (5 leaks)

### F1 (HIGH) — Tree examine names unknown species — carexplore.js:354,357,362
- **What leaks:** `Game.examineCell` (explorer-loop examine) uses the raw
  `mod.species` string: surface says `"Pine, healthy."`, deep says
  `"You circle the pine."` — with zero knowledge check.
- **What should gate it:** `Game.treeName(species)` (game.js:18870) — returns the
  name only when `treeLevel(species) >= 1`. The game.js tree *interact* path
  (game.js:5918-5921) already gates correctly ("TREE SPECIES GATING (Steve
  2026-10-05): species name only if known"). The carexplore path is the ungated
  sibling — commit 3efd271 touched line 362 (article strip) without noticing.
- **Impact:** real. `oak`/`hickory` seed at L1 (common knowledge), but `pine`
  starts at L0 and NOTHING in the codebase ever writes `codex.trees` for it —
  so pine is permanently unknowable, yet examine names it freely. Observed:
  `"Pine, healthy. Young enough to still be reaching..."`
- **Suggested fix:** in carexplore.js tree branch, replace
  `const species = (mod && mod.species) || ...` with
  `const species = (mod && this.treeName(mod.species)) || (cell === 'bigtree' ? 'an old giant' : 'a tree')`.
  (Bush/plant examine at :490 is safe — bush/plant modifiers have no `species`
  field, always falls back to "a bush".)
- **Bonus gap (not a leak, but the fixer should see it):** there is no learn path
  for tree species — examining a pine 100 times never teaches "pine". Either add
  one (examine/deep-examine feeds tree knowledge, e.g. via `codex.examined`
  depth) or accept permanent mystery.

### F2 (HIGH) — Proximity hint names unknown tree species — perceive.js:177
- **What leaks:** the RESOURCE proximity hint for `tree` cells:
  `const sp = mod.species || 'nut tree'; push(`${art} ${sp}. There might be nuts.`)`.
  Observed: `"A pine. There might be nuts."`
- **What should gate it:** `treeLevel`. Note the bush branch 10 lines above
  (perceive.js:165-173) does this RIGHT: names the bush only when
  `codex.plants[bs].level >= 1`, else `"A berry bush. You don't know which kind yet."`
  The tree branch is the ungated sibling of a gated pattern.
- **Suggested fix:** `const sp = (mod.species && this.treeLevel(mod.species) >= 1) ? mod.species : 'nut tree';`
  → unknown reads `"A nut tree. There might be nuts."` (parallel to the bush fallback).

### F3 (HIGH) — Bigtree proximity hint names unknown species — perceive.js:134
- **What leaks:** `const species = mod.species || 'tree';` then
  `"A mature ${species}. You'd need an axe to fell it."` Observed:
  `"A mature pine. You'd need an axe to fell it."`
- **What should gate it:** same as F2 — `treeLevel`.
- **Suggested fix:** same one-line gate; unknown reads `"A mature tree. ..."`.
  (F2/F3 are one fix in spirit — the whole RESOURCE block should route species
  through a single gated helper.)

### F4 (MEDIUM) — Tile-tap panel shows species after any examine — app.js:1112
- **What leaks:** the tile-tap descriptor: `if (mod && mod.known) {
  desc = `${mod.species}, ${mod.health}...` }`. But `mod.known` is set by ANY
  examine (game.js:5917) regardless of species knowledge — while the examine
  *message* gates the name via `treeName()`. So: examine a pine → message
  correctly says "This tree, healthy..." → tap the tile later → panel says
  "pine, healthy. Nuts (about 1)." The gate holds at the moment of learning and
  leaks on every revisit.
- **What should gate it:** `treeName()`.
- **Suggested fix:** `desc = `${Game.treeName(mod.species) || 'tree'}, ${mod.health}...``.
  (The `sec.known` branch below it is fine — no species shown. Exact-yield
  numbers "Nuts (about N)" appear in both paths; that's the established
  estimation convention, not flagged.)

### F5 (MEDIUM) — whoTag names the TRUE former occupation pre-knowledge — betrayal.js:147
- **What leaks:** pre-System, `whoTag(vid)` appends `", the <occupation>"` from
  `v.formerOccupation` with NO knowledge gate — for every truthful NPC, in
  every moot/ambush dialogue tag. Observed: `"the person in their 40s, the
  mortician"`, `"the man in his 60s, the bush pilot"` — before the player has
  spoken to them, let alone earned their backstory.
- **What should gate it:** occupation knowledge. The SAME commit under audit
  (855cbcc) established in truth.js that the true occupation is earned
  knowledge ("The truth comes from slips, gossip, or confrontation"), and the
  earlier liar's-mask fix (ee66c60) already called the true occupation in
  whoTag a leak — but only masked it for *liars*. Truthful NPCs still leak.
- **Suggested fix:** track `village.knownOcc = {}` (set on truthful 'personal'
  topic reveal, confession, or gossip), and in whoTag only append the
  occupation descriptor when `knownOcc[vid]` (or post-System). Until then, the
  age/gender descriptor alone — which is already distinguishing. The liar's-mask
  cover side stays as-is; this completes the other half.

---

## CLEAN (verified, with evidence)

- **Arrival text pools (3efd271, game.js:64-118 + carexplore.js:362):** new texts
  name no mechanically-relevant species. `greenbrier` (thicket) and `kingfisher`
  (creek) are flavor — neither is a codex entity (grep: only those two lines).
  `hickory` (grove) continues a pre-existing ungated pattern ("Hickories and
  oaks" was already in the pool). One new text explicitly honors the law:
  meadow wildflowers — "You don't know their names yet, and the not-knowing is
  a kind of hunger." The tree-examine grammar fix preserves the game.js species
  gate (it only changed the fallback article).
- **Rot legibility (edb9138, food.js:1546-1562):** both smoking-teach lines are
  gated on `knowsTechnique('preserve')` — unknowing players get Old Mara's
  outright teaching (villager-voiced, the designed knowledge channel); knowing
  players get the short mutter. `lost`/`lostPantry` names are safe: unidentified
  lumps carry form names ("unfamiliar shoots", food.js:228-246), never species.
  `spoilClockShort` (food.js:1530-1538) is sensory (smell/slime), not knowledge —
  it shows the countdown even on unknown lumps WITHOUT naming them. Correct.
- **Moot verdict transcript (2e6f28a, 855cbcc, betrayal.js):** vote counts are a
  public ceremony (diegetically public). All person references go through the
  gated `whoTag`/`displayName` (names only if earned/post-System; liars show the
  cover). The case-file dossier (betrayal.js:2380) shows only `knownAccusers`,
  `playerEvidence`, and *found* inconsistencies — carefully gated. 2e6f28a added
  audio hooks only, no text. (F5 above is the one gap in this surface.)
- **justice.js (2aad388):** dev-marker sanitize only — no player-facing text
  change. Clean.
- **villageEats (89dae4b, game.js):** zero new player-facing text — pure
  sort-order/skip-spoiled mechanics. Clean.
- **Contests (513d747 test-only; 5d725c1; contests.js):** recent game-code change
  is audio hooks only. 5196553/6ee8fd4 already fixed the prize-name leaks.
  Contest announcements use the System voice (diegetically omniscient — the
  fiction's own frame); defs name no monster species, reveal no patterns, show
  no exact odds. `HARDENED VARIANT` ("you've seen this before") and the
  lvl2/lvl3 intro lines ("you know its beats now") are knowledge-gated. Clean.
- **Perceive animal branch (perceive.js:196-203):** already gated via
  `encDescribeAnimal` ("DESCRIPTOR GATING: no true names pre-knowledge").
  The tree branches (F2/F3) are the outliers — same file, same function.

## Asides (not knowledge leaks, noted for the fixer)
- game.js haven arrival text hardcodes "twelve people" — village size varies
  (visitors/exiles). Coherence nit, not a leak.
- game.js:5925 branches behavior on raw `mod.species === 'oak' || 'hickory'`
  (nut yield vs "no nuts worth the trouble") — behavior, not text; the player
  sees nuts or doesn't. Acceptable: the character can see the nuts.
- F1's bonus gap: no learn path exists for tree species at all
  (`codex.trees` is write-once at newGame). If Steve wants pine learnable,
  deep-examine is the natural teacher.
