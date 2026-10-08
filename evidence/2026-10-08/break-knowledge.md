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

---

# SECOND PASS — same target, same day (afternoon run)

A second hostile pass over the knowledge system (fresh eyes, different attack
angles) found **6 new breaks** the morning pass missed. All fixed and proven;
7 new proof suites, each RED on unfixed code, GREEN after.

## BREAK 5 — one blind bite revealed the whole Codex entry (EXPLOIT/HONESTY)
Eating an unknown plant creates a level-0 `codex.plants[pid]` entry
(prepKnown/tastings bookkeeping). `codexEntries()` mapped **every** key with
`lvl = e.level || 1` — the plant appeared in the Codex with its **true name**,
L1 badge, and full codex text. "If you don't know, it doesn't show" broken by
a single bite.
**Fix** (`game.js`): `codexEntries()` returns null for level < 1. The prep
knowledge stays in the honest eat-time say-line ("You don't know what it is,
but you know it's edible now"), where it belongs.
**Proof**: `scripts/test-break-knowledge-gating-20261008.js` (G3/G3b failed
before: leaked as "Dandelion" [L1]).

## BREAK 6 — wrongTeaching wiped all player progress on the plant (EXPLOIT)
The taught-wrong branch **replaced** the whole `codex.plants[pid]` object:
harvests, tastings, prepKnown, learned parts, demonstrated — zeroed. The
comment above it says "The label is wrong; the plant is still the plant
(mechanics key off the real pid)" — the engine contradicted its own design.
**Fix** (`game.js`): preserve the entry (`Object.assign({}, prev, {...})`);
only label fields change.
**Proof**: `scripts/test-break-knowledge-wrongwipe-20261008.js` (W2–W6 failed
before).

## BREAK 7 — knowledge-for-knowledge trades never collected payment (EXPLOIT)
`tradeKnowledge()` price='knowledge' narrated "you teach X about Y" but never
recorded it; the payment search used the trader's *filtered* pool and counted
level-0 entries as currency. One plant bought **unlimited** trades.
**Fix** (`game.js`): payment = truly-known (L1+) plants the trader lacks
(unfiltered pool ∪ taught[vid]); `villagerLearnsPlant(vid, trade)` on
completion. `traderKnowledge(vid, unfiltered=true)` added.
**Proof**: `scripts/test-break-knowledge-tradeecon-20261008.js` (T2/T3 failed
before: payment unrecorded, same plant re-spent L0→L2).

## BREAK 8 — fireside wrong-teaching didn't do what the comment claimed (HONESTY)
Comment: "villagers who don't know better learn it wrong." Code: pushed pid
into `taught[]` (mechanically *correct* knowledge) and said nothing. A
villager "taught wrong" would later teach the player the right name.
**Fix** (`game.js`): learners' `wrongAbout[rid][pid]` records the false name
(`deliberate: false`), so it travels when they teach it on; honest fire beat
narrates the wrong name going loose.
**Proof**: `scripts/test-break-knowledge-firesidewrong-20261008.js` (F2/F3
failed before).

## BREAK 9 — the journal's read path was never wired (DEAD CODE, Alien-Players class)
`plantJournalEntry` (per-life entries + dead lives' marginalia + marks + gaps),
`codexPlantLine`, `knowledgeGaps`, `forageCue`, `journalOpening`, `lifeMarks`,
`marginaliaFor`, `homeFamiliarityLine` — wiring comments claimed app.js called
them; app.js called **none**. The Codex screen rendered from `codexEntries()`
only. The journal was write-only.
Also: `occupationKnown()` had zero callers (logic duplicated in
`occupationLabel`); `combineKnowledge()` credited traders phantom L2 for
plants outside their pool while its comment claimed L3.
**Fixes**: `journal.js` — new `codexEntries()` wrap appends the journal
payload (`journalLine`, `journalEntries`, `marginalia`, `journalMarks`,
`knowledgeGaps`); `occupationLabel` delegates to `occupationKnown`; stale
wiring comments corrected. `game.js` — trader combine credit is pool-gated at
L3. `app.js` `codexScreen()` — plant cards render gaps, marks, latest journal
entry, marginalia (attributed); header shows the `journalOpening()` bearer
line.
**Proof**: `scripts/test-break-knowledge-deadcode-20261008.js` (D1–D7 failed
before).

## BREAK 10 — conversation "teach" flow taught unnameable plants (SIBLING SWEEP)
Same bug class as #5: the teach menu/handler (`conversation.js` ×3,
`convo-beats.js` ×1) used `Object.keys(codex.plants)` as "things you know" —
a level-0 entry counted, and the dialogue spoke the plant's **true name**
("You show them Dandelion") though the player never learned it.
**Fix**: all four sites filter to `plantKnown` (L1+).
**Proof**: `scripts/test-break-knowledge-sibling-teach-20261008.js`.

## Latent hardening — learnPart auto-identify bypass
`learnPart()` used to `identifyPlant(pid, 'shown', null)` when unknown — free
naming with no teacher and no wrongTeaching check. No UI caller exists (only
`learnFromShowing` post-teachPlant). Now refuses unknown plants.

## Softlock audit, second pass (held)
identifyPlant idempotent; wrongAs → harvest-5 → contested → `callOutTeaching`
resolves; monster naming (`kickMonsterNaming` → debate → majority →
`villageName`, `monsterNamingActive()` clears); journal/codex surfaces agree;
`pendingTrade` consumed/reset; `discover()` one-shot; `spreadPlantKnowledge`
slow (0.35/part, one learner).
**Proof**: `scripts/test-break-knowledge-softlock-20261008.js`.

## Caveats, second pass
- app.js Codex rendering is additive template HTML, `node --check` clean;
  not visually rendered (headless Chromium hangs in this VM) — Steve's phone
  check on the Codex screen is the visual gate.
- `forageCue()` remains unwired (kept for the grid pass — flagged in the
  wiring comment, not silent).
- `test-conversation-coherence.js` (2026-10-07) crashes in its own stale
  harness (module list predates convo-scene.js/`resolveConsequence`) —
  pre-existing, unrelated.
- Output-layer quirk: tool output renders the file's "bearer of the" as
  "Bearer <redacted>" (`od -c` confirms the file is correct). Don't "fix"
  the phantom.
