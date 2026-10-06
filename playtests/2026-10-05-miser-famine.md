# 2026-10-05 miser famine run (playtest loop)

The famine baron: hoard a fat pack + far caches, then let the village go hungry
without donating. Fresh angle vs miser-week (theft/justice) and miser-caches
(cache network/robbery): the SOCIAL ECONOMY of hoarding — begging, answering,
ignoring, donating.

## The find (fixed + shipped, build 7396379-20261006-031458)

NPC behavioral hunger (`npcNeeds.hunger`, drives begging/moods/"N people are
going hungry") only ever rose (+11/day-part in tickNeeds) and was never touched
by the communal meal. Every villager pinned at 100 hunger within two days no
matter how full the pantry was — begging never reflected real scarcity, and
the miser fantasy (drain the pot → hungry eyes on your pack) could never fire.

`villageEats()` now syncs it: fed village → content (≤15), starving → +15.
Donations feed people through the real pantry; `giveFood` stays the
personal-generosity verb. Also removed the dead `villageEvent('donation')`
branch — never called by anything since it was written (verified via git -S).

## Verified end-to-end (post-fix)

- 2 famine endDays → avgHunger 81 → begging fires: "Got anything to eat? The
  pot's been thin and my stomach's filing complaints."
- Answering: `giveFood(rid,'meal')` → trust 8→26, hunger→33, gratitude line:
  "eats like it's the first time. 'Thank you,' they say, quiet. 'I won't
  forget this.'" Request cleared.
- Unanswered requests curdle next day (pre-existing): trust -2, 'ignored'
  memory, bold/prickly NPCs say "stops asking."
- Donate bulk → pantry stocked → next communal meal resets hunger via the
  real system (no phantom event needed).

## Feel notes

- The miser fantasy is now real BOTH ways: drain the pot → begging storm;
  feed the pot → content village, your hoard invisible. Hoarding is bounded
  well: 20kg carry cap stops one-trip pantry drains, NPC foragers restock,
  net-negative takes erode trust (half rations at low trust).
- Begging is say-buffer-only: pending asks aren't surfaced in any UI (no
  `requests` read in app.js). Person card shows hunger state so it's playable,
  but a "they asked you" indicator would be better. Left open.
- Begging pacing: max 1 ask per day-part by design (lastInitPart gate). With
  11 starving villagers that's sparse but readable — fine.

## Sim harness lesson (important)

NPC initiative NEVER fires unless `ensureVillagerPositions()` has run (NPCs
get no grid positions otherwise — `order` is empty, whole system dead), and it
fires via `npcBatchTurn()` (every player action), NOT via `advancePart()`.
Earlier miser sims almost certainly never exercised begging. Any future
social-verb sim must call both.

## Tests

- scripts/test-villageeats-hunger-sync.js — 11 pass (new, this run)
- scripts/playtest-miser-famine.js — playtest script (new, this run)
- Miser/cache suites green (test-miser 34, cache-* 96 total)
- test-week1-hunger: 1 failure, PRE-EXISTING (fails on clean HEAD)
