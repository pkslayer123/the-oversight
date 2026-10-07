# Journal depth — worker B run notes (2026-10-07 ~04:08 CDT)

## What was done
Deepened `src/js/journal.js` (619 → ~1170 lines) into a living document per the
assignment. Additive only; all existing exports/behavior intact.

### 1. Mantle continuity (the palimpsest)
- `state.codex.mantle = { lives: [], marginalia: [], currentStart }` — per-run
  persistent, outlives every bearer.
- `playerDeath` (ledger.js, loads AFTER journal.js) is wrapped via a **deferred
  macrotask install** (`setTimeout(installMantleWrap, 0)` + direct attempt +
  `_journalMantleWrapped` guard). Rationale: setTimeout callbacks queue behind the
  remaining synchronous `<script>` tasks, so the wrap installs after every module
  attaches — long before any death can occur in play. Lesson for future workers:
  you cannot wrap a later-loading module's method at load time; the direct call
  covers future reorderings, the deferred call covers the current order.
- `writeEpitaph(old, cause)`: dying life's last margin note, written WHILE still
  the bearer, in THEIR lifeseed register. `welcomeBearer(old, cause)`: successor's
  first line in the NEW hand. Skipped cleanly on village-lost (no successor).

### 2. Knowledge-progression beats (entries evolve, never rewritten)
Wraps: `identifyPlant` → sighting entry; `eat` → before/after tasting deltas →
`tasting` + `deeper` (L3) entries; `doAction` → level deltas → `handling` (L2) +
`mastery` (L4, + triumph life-mark); `eatOne` → poison/disease growth → mark +
`poison` entry; journal-owned `learnPart`/`thickenKnowledge`/`recordThinKnowledge`/
`learnFromShowing`/`haulTeachingMoment` → `part`/`confirm`/`thin`/`triumph` entries.
All entries: `{day, life, first, register, kind, text}`, append-only, exact-dup
guarded, capped at 40/plant.

### 3. Scholar voice from lifeseed (never a hardcoded narrator)
- `journalVoice()` / `journalVoiceFor(char)`: first name + lifeseed register +
  current lifeseed mood.
- `JOURNAL_VOICES`: 6 registers × 13 beats (78 lines), all non-empty (asserted).
  Laconic lives write short ("Mayapple. Noted. Uses: unknown."), effusive lives
  write long ("Dandelion BIT me back! ... Oh, we're going to have words, you and I!").
- `JOURNAL_MOOD_SHADE`: strong moods (grieving/haunted/bitter/hollow/ashamed/
  wary/buoyant/adrift) tint observational beats; never the epitaph.

### 4. Marks reframe later entries
`recordPlantMark` (poisoned/sickened) and `recordLifeMark` (hunger/triumph);
`noteHungerNight()` called from the endDay wrap (sub-400 kcal = a hunger margin
line). Surfaced in `plantJournalEntry().marks`.

### 5. Neglect honesty
`journalTouch(kind)` on every write + `journalTouch('read')` WIRING for app.js;
`journalStaleness()` returns null when fresh, "a little dusty" at 2–3 days,
"Neglected." beyond. `journalOpening()` → `{line, staleness, lives}` header.

### 6. Knowledge-gated honesty
`plantJournalEntry(pid)` → null below L1; `writePlantEntry` refuses unknown
plants; marginalia only ever from known plants. Blind is "button honest".

### 7. Drive-by fix (own surface)
`plantPartsList` split parts on commas INSIDE parens: mayapple's "RIPE fruit only
(soft, yellow, fragrant)" produced garbage keys "yellow"/"fragrant)" that leaked
into knowledge gaps as "Its yellow — unexamined." Now paren-aware; gaps read
"Its ripe fruit only — unexamined."

## Proof
`scripts/test-journal-depth-20261007.js` — full production script list in
index.html order (minus DOM-only), window stubbed for eval then deleted,
SCATTER_DATA preloaded, seeded mulberry32. Plays a 3-life arc (identify →
part → thin → confirm → poison → death → inherit → new plant → hunger →
death → read both journals → neglect → honesty), then prints the journals for
human reading. 60 checks, **60/60 green on seeds 20261007, 1, 42** (distinct
casts each: Carl/Mei/Sergio; Si-yeon/Nadia/Nora; Marvin/Darius/Yuki).
Read as a player: each life unmistakably a different person; knowledge visibly
grows across entries; the mantle marginalia ("Carl († a hushwolf), Mei († the
long winter)") reads like a real inherited book.
Harness stubs (outside assignment scope, noted honestly): playerDeath's heavy
callees (`progState`/`lineage`/`leadershipEpithet` fallbacks); `codex.encounters`
init (identifyPlant writes it directly at game.js:23934 without the `|| {}`
guard used at 1862/2860 — pre-existing, game.js-owned).

## WIRING for app.js / game.js owners
- app.js Codex screen header: `Game.journalOpening()`; call
  `Game.journalTouch('read')` on open. Per-plant view: `Game.plantJournalEntry(pid)`
  → `{name, line, entries, marginalia, marks, gaps}` (null at k0).
- Forage/grid knownCue: `Game.marginaliaFor(pid)` — dead hands coaching the living.
- No game.js edits needed; all seams are wraps.

## Hazards / follow-ups
- **SHARED INDEX HAS A STAGED DELETION OF src/js/journal.js** (157 staged files
  total). Worktree == HEAD (verified); my commit used a private index. If anyone
  commits from the shared index, journal.js will be deleted from HEAD. Do NOT
  `git reset`/`stash pop` to fix — a sibling staged it; flag to the loop owner.
- `docs/ONTOLOGY.md` is sibling-owned and dirty; validator did NOT rewrite it on
  my run (mtime predates run) so I left it untouched. My @ontology header is
  accurate for the next regeneration. Validator still reports 3 pre-existing
  errors in sibling-owned `src/js/drama.js` (floatText/flash/soulWisp provides
  without definitions) — not mine to fix; release gate is their call.
- `validate-ontology.js` exit was non-zero due to drama.js; journal.js clean.
