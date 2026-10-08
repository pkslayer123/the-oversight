# abilityActions.js XP gap — fixed (2026-10-08)

## Bug (confirmed by audio-game worker, behaviorally proven)
`Game.useAbility()` (src/js/abilityActions.js) called `noteAbilityUse(abilityId)` but
never granted ability XP. abilityActions.js also OVERRIDES `Game.activateAbility`
(lines ~87–95): composite ids (e.g. `'tracker.track'`) route to `useAbility()`; only
plain ids fall back to the legacy game.js path where the XP fix lives (game.js:14328).
Consequence: **data-driven ability actions NEVER leveled through use** — same
reachability class as the one_person_army bug.

## Patch
src/js/abilityActions.js, in `useAbility()` (~line 214). REPLACED (not added beside)
the standalone `noteAbilityUse` call:

```js
// before
try { this.noteAbilityUse(abilityId); } catch (e) {}
// after — XP + synergy: gainAbilityXP logs the use for synergy discovery
// internally (game.js:14421), so a separate noteAbilityUse here would
// double-count every activation as two synergy attempts.
// Steve 2026-10-08: one activation = one attempt + one XP.
try { this.gainAbilityXP(abilityId, 1); } catch (e) {}
```

Adding beside would have been a regression: `gainAbilityXP` already calls
`noteAbilityUse` internally (game.js:14421), so "add next to" gives 2 notes +
1 XP per activation (the double-count bug fixed 2026-10-08 in game.js).
Replacing gives exactly 1 note + 1 XP. Plain-id `activateAbility` path untouched.

## Proof
New: `scripts/test-ability-xp-use-20261008.js` — seeded node harness (full
index.html eval order, window stub dance). Asserts:
- one `useAbility('tracker','track')` → exactly 1 `noteAbilityUse(tracker)`,
  exactly 1 use-log entry, exactly 1 XP (tracker now levels through use);
- composite `activateAbility('tracker.track')` → routes to useAbility, +1 note, +1 XP;
- plain-id `activateAbility('war_cry')` → behavior unchanged (1 note, 1 XP);
- synergy-attempt counting stays single per activation (2 uses → 2 attempts,
  via a fresh in-memory probe synergy).

Results: green on seeds 7, 42, 123. (Seeds 42 exposed a test-harness issue:
the generated scholar can hold tracker as a background ability — the test now
mirrors `gainAbilityXP`'s backgroundAbilities-first lookup order.)

No regression: `scripts/test-xp-doublecount-20261008.js` still green
(1 use-log entry = 1 synergy attempt = 1 XP per plain-id activation).

Definition of Done check: an ability used through the data-driven action path
now visibly grows — Tracker gained XP per Track use, and would deepen at
thresholds (L1→L2 at 10 uses).
