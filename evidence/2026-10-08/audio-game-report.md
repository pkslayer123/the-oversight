# audio-game worker report — 2026-10-08 (00:30–01:00 CDT)

Worker: game.js behavioral/audio-dispatch sections. Worktree: ~/workspace/worktrees/audio-game, base 5b266b2.

## Fix 1 — bespoke aggro hooks now fire (7 monsters)

**Problem:** 7 registered aggro hooks in app.js's audio registry had ZERO call sites.
The generic declare path fired `dcfg.aggroAudio` — but bespoke turn blocks return
before it, and `encDeclareDirect` never fired aggroAudio at all. (Pre-fix proof:
10/15 test assertions failed; the hooks were absent from the audio log.)

**Fix (game.js only):** new helper `tbAggroAudio(m)` — fires the data-driven
`encounter.aggroAudio` hook, deduped per telegraph (one voice per declare).
Wired into:
- `encDeclareDirect` — sunbasker bite, voice_mimic lure, moderator strikes,
  landlord eviction, and all other bespoke direct-declarers get their voice free.
- Generic declare path — the double `audioEvent(dcfg.aggroAudio)` per declare
  (two BELLOWs per turn) collapsed to one `tbAggroAudio(m)` call.
- glasswing dive declare → glasswingBuzz (kept 'glasswingDive' alongside).
- turtle snap → turtleGrind (the snap IS its declaration; it never telegraphs).
- heckler first jibe → hecklerLaugh (once per fight via m.hkDeclared).
- lockpick case phase → lockpickFingers (the casing is the declaration).
- nevermore strafe declare → nevermoreUnfold (same bug class, found by census).
- statickite mark declare → kiteUnfold (same bug class, found by census).

**Remaining (needs Steve's call):**
- nightcourt's aggroAudio 'nightcourtTurn' still unreachable — the dive is
  DELIBERATELY silent by design ("The silence IS the telegraph"). The head-turn
  sound wants a roost moment; firing it at the dive would break the fiction.
- heron's 'heronUnfold' unreachable — the windup fires 'heronStatic' bespoke
  instead. Decide: unfold at strike-declare, or retire heronUnfold.
- hushwolf's 'wolfSnarl' fires only at exploration notices (encNoticesPain/scan),
  never in its rush turn — the rush branch has no audioEvent at all. Same class;
  left alone because the rush is designed silent ("no warning, just teeth").

## Fix 2 — patternResolve: DECISION (remove)

`patternResolve` is registered in app.js (10407) with zero call sites. The
intended telegraph-resolution moment is ALREADY served: game.js fires
`audioEvent('impact', {pattern})` at resolve (e.g. game.js:22378), and app.js's
`impact(d)` handler (10177) dispatches per-pattern resolve synths — the exact
mapping patternResolve duplicates. DECISION: **remove the dead `patternResolve`
registration from app.js** — it's a redundant alias, not a missing wire.
**I could not edit app.js** (game.js-only mandate) — coordinator: one-line
removal at src/js/app.js:10407-10420 (keep `impact`, delete `patternResolve`).

## Fix 3 — winded turns speak (bulldozer)

**Problem:** `boarWinded` decremented silently; the player got no sayLine or cue
when the winded state resolved — the punish window was invisible.

**Fix:** winded turns now say + cue via the existing 'animalPant' hook
(winded state: sides heaving, spent):
- Trample turn (winded 2→1): "Its sides heave — spent, flanks soft. (WINDRED 1)" + animalPant.
- Final winded turn (1→0): "It paws the earth, sides heaving — still winded. (WINDRED 1)" + animalPant,
  then "It shakes its great head — the wind is back in it." on clear.
- Note: boarWinded is the ONLY winded state in the codebase (20214 damage-taken
  modifier consumes it). No other monsters have a winded equivalent.

## Fix 4 — one_person_army XP double-count (activateAbility)

**Problem:** `activateAbility()` called `noteAbilityUse(id)` directly AND
`gainAbilityXP(id, 1)` — which ALSO calls `noteAbilityUse` — so every activation
logged TWO synergy attempts (synergyAttempts inflation, incl. one_person_army legs).

**Fix:** removed the direct `noteAbilityUse(id)` call; `gainAbilityXP` already
notes unconditionally before the XP/level check. One activation = one attempt = +1 XP.

**Before/after proof** (`scripts/test-xp-attempts-20261008.js`):
- FIX=1 (current): 4/4 green — 1 attempt + 1 XP per activation.
- FIX=0 (old-behavior shim): 2/4 red — 2 attempts per activation (XP was always +1).

## Tests (both green before commit, stable across seeds 1/3/42/99/777/1234/20261008)

- `scripts/test-declare-audio-20261008.js` — 15 assertions: 7 bespoke aggro hooks
  fire at their declare moments; generic path fires once (was twice); heckler
  fires once not per-jibe; winded turns say+cue via the honest missed-charge path.
  Pre-fix (stash check): 3/15 — the 5 census hooks absent, boarSnort x2, winded silent.
- `scripts/test-xp-attempts-20261008.js` — 4 assertions, before/after via FIX=0.

Harness: full src/js eval list in index.html order minus DOM-only
(app/sprites/tile-scenes/move-anim/drama); window+document stubbed for eval,
deleted before play; seeded PRNG (mulberry32, SEED env override); Game.audio
proxied to capture hook names. `--cacheDirectory` N/A (plain node, no jest).

## Files changed (game.js only, per mandate)
- src/js/game.js — tbAggroAudio + 8 wiring points, winded cues, XP fix.
- scripts/test-declare-audio-20261008.js (new), scripts/test-xp-attempts-20261008.js (new).
- evidence/2026-10-08/audio-game-report.md (this file).

## Diff stat
`git show --stat HEAD` after safe-commit (see below).

---

## Follow-up 2026-10-08 ~01:45 CDT (coordinator)

### Balance worker's characterization test — pulled in and flipped
- `scripts/test-xp-doublecount-20261008.js` pulled from master (`git show
  master:...`, commit eb995a2) into the worktree.
- Assertions flipped 2/2/2 → 1/1/1 per the script's own comments; header and
  closing copy rewritten to fixed-state characterization. GREEN against the
  fixed code (all 5 PASS, seed 7).

### EXTRA FINDING (balance worker): useAbility never grants XP — OUT OF SCOPE, reported
- `Game.useAbility` (src/js/abilityActions.js:182) calls `noteAbilityUse(abilityId)`
  (line 214) but NEVER `gainAbilityXP`. Behavioral probe (node, full harness):
  `Game.useAbility('tracker','track')` returned true, logged 1 use, granted **0 XP**.
- Reachability impact: abilityActions.js OVERRIDES `Game.activateAbility`
  (lines 81-95) — composite ids (`tracker.track`) route to `useAbility` (no XP),
  only plain ids fall back to the legacy game.js path where the 9ef4d1e/00d2531
  XP fix lives. So data-driven ability actions never level — same reachability
  class as the original one_person_army bug, which 9ef4d1e only fixed on the
  legacy path.
- Recommended patch (NOT applied — abilityActions.js is outside my game.js
  mandate; needs the owning worker or coordinator approval): in
  src/js/abilityActions.js useAbility, next to line 214:
  `try { this.gainAbilityXP(abilityId, 1); } catch (e) {}`
  (mirrors the noteAbilityUse call's try/catch; gainAbilityXP already
  re-notes, so this keeps one-note-per-use honest.)
- Coordinator: please route this one-liner to the abilityActions owner with a
  proof assertion (probe above is the behavioral evidence).
