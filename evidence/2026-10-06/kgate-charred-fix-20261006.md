# kgate charred-kill fix + wave-2 text fixes — 2026-10-06 ~19:00 CDT (flesh-out loop worker)

Task: close L1 charred-kill knowledge leak (game.js ~8343) + two small wave-2 text fixes.
Proof script: `scripts/test-kgate-charred-fix-20261006.js` (15 pass, 0 fail, full production module list per AGENTS.md harness lesson).

## A. L1 charred-kill leak — FIXED (with a twist)
- Applied the prescribed fix in game.js's charred branch: `encIdentifyAnimal(animal.id)` (try/catch) BEFORE the `foodCarcass` push, mirroring the hunted branch's "a kill teaches you what it was" rule.
- **Discovery while proving it:** game.js's `huntAnimal()` is DEAD CODE — shadowed by the encounters.js wrapper (`G.huntAnimal = ...`, `_wrapped=true`, encounters.js:1575), which is the live path. The live wrapper ALREADY calls `encIdentifyAnimal(a.id)` at the kill BEFORE the charsMeat split (encounters.js:1785-1799). So the L1 leak was already closed on the live path; the game.js fix is defense-in-depth on the shadowed branch.
- Proof drives the LIVE wrapper end-to-end (real save, fresh codex, real searcaster, calm woodcock at dist 2, forced RNG): kill → known=true → carcass name earned, kill message names nothing.
- First harness attempt failed instructively: forcing Math.random=0.0 with aware unset (defaults 0.6) made the woodcock bolt via preyReaction — the test then set aware:0/pstate:'graze' like debug-scenarios.js:72 and passed. Lesson recorded in the script comments.

## B. Mute-lift comment fixes — DONE (comment-only, no gameplay change)
- game.js: "rolling window of the player's last 6 verbs" → "last 5 verbs" (modNoteVerb shifts at >5).
- game.js: "Window of 5: three quiet rounds flip a habit." → "five quiet rounds flip a habit."
- **TUNING QUESTION FOR STEVE (flagged, not changed):** was 3 the intended number? The modRecent window holds 5 entries (shift at >5) and the lift fires when the window holds no strike/move (modTopVerbs(1) empty → modMuted=[]), so the mute takes 5 quiet rounds to flip. If the design intent was 3, that's a gameplay-number change for Steve to call — left untouched.

## C. Unknown-descriptor possessive (encDamageSource) — VERIFIED FIXED
- Unnamed bulldozer ("something huge, rooting in the underbrush") → "The attack…" — no descriptor possessive.
- Named (villageName set, pattern learned) → "boar's China-Shop Charge" — grammatical possessive via the designed encShortLabel strike-line name. Correct.

## D. L2 system_task quest display — REPRODUCED, NOT FIXED (left for surface owner)
- `Game.triggerEvent({id:'system_task'})` → quest line renders "📋 undefined needs undefined undefined." — confirmed live on current HEAD.
- Root: game.js:13196 builds `{id, desc}` only (no `text`/`giverName`/`qty`/`plant`); app.js:10709 falls back to `giverName + ' needs ' + qty + ' ' + plant + '.'`. The `desc` ("Bring a fully-identified plant (L3) to the System") is never read. The quest also has no completion path (checkQuest only clears bring/visit types) — it lingers forever.
- Exact lines for the owner: game.js:13196 (quest def), app.js:10709 (display template), game.js:13612/13626 (checkQuest). Suggested: give system_task a `text` (or prefer `desc` when `text` missing) + a completion path. NOT touched — sibling's fresh surface (commits 8c7dc00/c42fcf9).
- Note: the audit's test-kgate-leaks-20261006.js C3/C5 expected-fails are now stale in one respect — C3's "charred branch does not teach" fails because the fix IS present. Left as-is (worker's evidence snapshot).

## Commit
- Private-index commit (sibling staged changes present in shared index — never touched). game.js: +10/-2; new test script; these notes. NOT pushed (per task).
