# Socialite playtest — 2026-10-05 (evening run)

Archetype: socialite — conversations, gossip, relationships, party building.
Rotation index was 2; advanced to 3 (next: survivalist).

## What ran
- `node scripts/playtest-socialite.js --seed 42` — 10 days, 50 conversations, no errors.
- `node scripts/playtest-socialite-gossip.js` — 14 pass, 0 fail.
- `node scripts/test-party.js` — 88 pass, 0 fail (after fixing 1 stale assertion).
- `node scripts/test-brawler-loop.js` — 43 pass, 0 fail (incl. 4 new regression tests).
- `node scripts/test-conversation-coherence.js` — 80 pass. `test-conversation-depth.js` — 812 pass.
- `node scripts/validate-ontology.js` — 26 systems validated; release permitted.

## Bugs found and fixed (both in src/js/game.js)

**1. Every player strike crashed (TDZ ReferenceError).** Commit b8b9bea
("Monster armor + elemental resistances", today) inserted the armor block
`if (!isHuman)` ~23 lines ABOVE the existing `const isHuman = t.kind ===
'hostile'` in `tbPlayerStrike`. TDZ → `ReferenceError: Cannot access
'isHuman' before initialization` on ANY player attack — monster or human.
In a browser this throws inside the combat click handler, so all melee
combat was broken. Fix: hoisted the `const` above the armor block (single
declaration, both uses). Regression: test-party.js §8 already strikes a
hostile (it was crashing pre-fix, now passes); added explicit no-throw
strike tests for monster + human targets in test-brawler-loop.js §9.

**2. `tbEnd('won')` crashed with no monster fighter.** `f.fighters.find(x =>
x.kind === 'monster').mdef` threw `TypeError: Cannot read properties of
undefined` for a human-only fight that didn't route through the betrayal end
path. (All current human fights ARE betrayal-flagged and wrapped safely, so
this was latent — but `tbEndCheck` routes any no-monster fight to 'won',
making it a landmine.) Fix: monster carcass rewards (codex slain entry,
meat, alien loot, WINNER sysSay) now guarded behind `(mf && mf.mdef)`;
generic victory handling unchanged. Regression: test-brawler-loop.js §8
builds a synthetic human-only fight and calls `tbEnd('won')` directly.

**3. Stale assertion in test-party.js.** "split offered with text" expected
'TWO THREATS'; today's deliberate offerSplit rewrite (Steve's directive:
diegetic language) emits 'Two threats'. Updated the assertion — the rewrite
itself is correct.

## Feel verdict (socialite)

- Talk-request cadence is healthy in real grid play (~1 per day-part via
  `villagerInitiative`; the socialite harness's endDay-only loop undercounts
  because it never drives the grid). Expiry after ~3 days is in place.
- 50 conversations, avg 3.9 exchanges, all ended naturally via wind-down —
  the 3–6 exchange budget + wind-down beat works. NPCs asked the player a
  question in 19/50 (38%) — the village feels alive, not interrogated.
- Trust 14.8 → 35.3 over 10 days, talk cap 40 (by design: "words only go so
  far"). Line uniqueness 72%; exit/wind-down pools are the main repeat
  offenders ("Gotta run. Literally. Bye!" 5×, wind-downs 4×) — small pools,
  worth expanding when the conversation UI rework lands.
- Party invites: refusal lines are contextual and characterful ("I don't
  know you well enough for that. Ask me again when we've survived something
  together."). Accept is a gamble even at trust 80 — earned, not automatic.
  Feels right for Steve's design.
- Gossip: spread/distortion/fade all healthy; visibility via ask:gossip +
  NPC initiative + rare fire fragments. Confrontation is a real gamble
  (trust moves the odds 77% vs 49%).

## Not fixed this run (flagged)
- `test-combat-harness.js`: 2 stale expectations from TODAY's deliberate
  rebalances — spear bonus 25→15 (Steve's wave-tuning commit e8c3028) and
  20→23 monsters ("All 23 monsters" commit). Hunter loop's harness; left
  for its owner.
- Doubt-visibility UI gap (detective run's note): `Game.doubtsHTML()` still
  unwired in app.js — deferred to the sibling's conversation UI rework.

## Shared-tree notes
- `src/js/membership.js` was already modified before this run (sibling's);
  not touched, not committed. Untracked `hidden_files/`, `tools/`,
  `playtests/2026-10-05-detective-evening.md` belong to other agents; left alone.
- No stashes touched (8 present, all left intact).
