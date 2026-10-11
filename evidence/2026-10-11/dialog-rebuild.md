# Dialog/chat structural rebuild — coordinator report (2026-10-11)

Steve's report (00:24 CDT, live build, screenshot): dialog "horrific and
structurally broken" — duplicated text in two panels, ambient chat leaking
earned knowledge on fresh spawn, layout hopping, nonsense lines, "1 Codex entries".

## The five defects and their fixes

### 1. DUPLICATION — Worker A (branch `dialog-streams`, commit `37cde5f6`)
**Root cause (confirmed, not assumed):** `say()` dual-wrote — game.js's `say()`
pushed to `Game.log`, and encounters.js's wrapper *also* pushed every marked
`say()` into `state.fbLines`. `narrationBoxHTML` rendered `fb || lastNarr` in
the green box while `feedbackHTML()` rendered the same fbLines in the orange
box. One emission → two surfaces, exactly Steve's screenshot. Bonus find:
`Game.toast` pushed a bare string into `Game.log` despite its own comment
saying "don't show in narration box" — toasts echoed in the green box too.
**Fix:** one text stream. `Game.emit(text, surface)` is the single write path;
every line is a String object carrying its surface tag (narration|feedback|
toast|bubble|dialogue|contest|person), JSON-safe via toJSON. `say()` →
narration; marked encounter `say()`s → feedback (no more dual-write);
`feedback()` → explicit feedback; `toast()` → toast. Renderers consume only
their own surface. ~700 existing `Game.log` string-op readers keep working via
coercion (2 one-line guard fixes in old break-it tests).
**Proof:** `scripts/test-dialog-stream-20261011.js` — 43/43. Part 1 replays the
OLD dual-write and shows the duplication; Part 2 drives the real engine and
asserts zero duplicated text, one surface per line.

### 2. KNOWLEDGE GATING — Worker B (branch `dialog-gating`, commit `b626c7bd`)
- `villageLives` used `person.name.split(' ')[0]` — true names on fresh spawn →
  now `displayName(id)`.
- `overheardDiscussion`: 5 openers moved to data-driven `overheard.gatedOpeners`,
  merged only when earned ("If the System wanted us dead…" needs
  `systemArrived`; hushwolf-telegraph and monster-naming lines need a
  `codex.monsters` entry). Two era-neutral analytical openers keep the voice.
- Audited clean: porcupine tip (already gated on `encAnimalKnown`), alien
  mystery lines, npcTakeAction announces, gossip, revealName paths,
  firesideTeaching, corpses.
**Proof:** `scripts/test-dialog-gating-20261011.js` — 40 rounds × 6 emitters ×
2 seeds, 95+99 lines: zero unrevealed names, zero pre-day-7 System concepts,
zero gated openers; positive cases all fire once earned.

### 3. LAYOUT STABILITY — Worker C (branch `dialog-layout`, commit `894cac02`)
- `.ord-narration` → fixed 184px (96px in combat), internal scroll;
  `.dialogue-box` → height 100% flex column, choices pinned at bottom;
  `.ord-feedback` → fixed 68px slot, always rendered (never appears/disappears).
  Toasts already fixed-position; speech bubbles absolute in fixed cells.
- **Honest limit:** no layout engine in this VM (headless Chromium hangs) —
  CSS-contract + source-structure assertions, not measured pixels.
  `[needs-eyes]` on a real 390×844 phone is the final gate.
**Proof:** `scripts/test-dialog-layout-20261011.js` — 26/26.

### 4. GRAMMAR — Worker C (same branch)
- New `Game.pluralize(n, singular, plural)`; 40+ call sites fixed across 11
  files ("1 Codex entries" ×2, days/ticks/items/units/logs/plants/deeds/bars/
  carcasses/villagers/fighters/fires, plus 3 found by the sweep).
- Static sweep over all of src/js fails on any new unhandled `${n} <plural>`.
**Proof:** `scripts/test-dialog-grammar-20261011.js` — 39/39.

### 5. COHERENCE — Worker D (branch `dialog-coherence-fixed`, 4e998f47)
Four nonsense classes, gating preferred over deletion:
- **A.** Goal 'answers' lines named the System pre-arrival → `preSystemLines`
  (era-neutral) + `convoGoalLines()` gating at both call sites.
- **B.** `q_first_week` on day 3, `q_night` on day 1 → `minDay` (8/2) +
  `convoQuestionOk()` at both question-selection sites.
- **C.** Six newer goals had no `goalFollow`/`askAbout` → "tell me more"
  instantly exhausted → 8 follow-ups each + 6 askAbout lines.
- **D.** ambientSocial "tonight" lines at noon → day-part-aware tonight/today.
**Proof:** `scripts/test-dialog-coherence-20261011.js` — 37/37, every class
proven both directions.

### 6. Coordinator leak fixes (commit `2effcad6`, this merge)
Worker B flagged three conversation-path leaks outside its brief; fixed here:
- `theorizeWith` 'monsters' gated lines (the hushwolf "wants quiet" counter,
  birds-quiet telegraph, headlight-deer night habit) moved to
  `theories.<intel>.monstersGated` in characterGen.json; drawn only with a
  `codex.monsters` entry. 'system' topic falls back to 'situation' pre-arrival
  even when called directly.
- Conflict `history` strings were baked with true first names at generation →
  now `{a}`/`{b}` templates resolved via `displayName` at render
  (conversation.js old-wound telling + convoTopics.js grievance lines).
- `conflictNote` used `other.name.split(' ')[0]` → `displayName`.
- temperamentTalk/moodTalk/talkTemplates: System-name lines filtered pre-day-7
  (sardonic "If the System wanted us dead…", mischievous rumor, talkTemplates[48]).
**Proof:** `scripts/test-dialog-leakfix-20261011.js` — ALL GREEN (9 checks).

## Merge notes
- Shared-worktree collisions (one checkout per worktree): Worker A's first commit
  landed on D's branch as `74cc9145`; removed via `dialog-coherence-fixed`
  (cherry-picked D's 3 commits onto the pre-accident base; the cheer-line
  restore was a no-op there since the clobber came from the accident itself).
  All four branches merged clean into `dialog-merge`, then to master.
- Pre-existing failure (not mine): `scripts/test-conversation-coherence.js`
  (2026-10-07) fails — its hardcoded eval list omits `src/js/convo-scene.js`
  where `resolveConsequence` lives. Stale test, untouched.

## For Steve's phone pass ([needs-eyes])
1. Walk 1 tile: one text panel, never two with the same words.
2. Fresh spawn: villagers talk, but no true names, no System talk, no monster
   tips you haven't earned.
3. The text region never pushes the grid/d-pad/status bars around.
4. "1 Codex entries" is gone everywhere.
