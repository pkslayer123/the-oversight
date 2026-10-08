# BREAK-IT: food economy (2026-10-08, run target #1)

Hostile-player audit of the food economy. One worker, deep. Verdict per attack below.
Proof tests: `scripts/test-food-break-blood-engine.js`, `scripts/test-food-break-pantry-phantoms.js`.
Commit: `b9b45e8` (worker `175e57e` rebased onto master `1ee7091` — clean, same 6 files).
Release: version `5db6c1f-20261008-104158` (commit `228a57d`), verified live on BOTH
raw.githubusercontent.com and the-oversight.vercel.app.

## EXPLOIT — broke + fixed (3)

**E1. Blood-magic/field-medicine kcal engine (the combat run's handoff lead). CONFIRMED REAL.**
Pre-fix proof measured **+4,900 kcal net in a single daypart** (combat run's optimal
cycle: +5,400/daypart, ~21,600/day). blood_magic had no per-daypart gate; the code
comment claiming the 100-kcal heal cost "prevents Blood Magic infinite loop" was false —
it only bounded the engine per daypart. Additionally, blood_magic bypassed `kcalCap()`
(eating clamps to the bank cap; blood kcal did not).
Fix (design call, "figure it out yourself" authority): **2/day-part cap** on Blood Price
(`bloodPriceDayPart`/`bloodPriceUses`, same key pattern as field_medicine); refusal names
the gate ("Your body needs time to knit back together"); blood kcal clamped to
`kcalCap()`. Post-fix: a daypart of maximal looping nets 400 kcal (cap-bounded); the
FM-paired cycle is +900/daypart max — strong but finite min-maxing, legible fiction.
Listing descriptions updated in both listing sites + abilities.json.

**E2. Phantom pantry kcal x2 (HONESTY + EXPLOIT hybrid).** `checkGenesis` (haven genesis
crop "+500 kcal to the pantry") and `betrayal.js inviteReward` 'cache' ("+800–2000 kcal
to the pantry") bumped the compat counter `v.pantryKcal` directly — a phantom number
that `villageEats`' end-of-day sync re-derives from the real item list, so **the promised
food evaporated overnight**. Both now route through `stockPantry()` (real items, real
spoil clocks). Proof: pre-fix `pantryKcalLive` delta = 0 (red); post-fix = stated amount
as a surviving item.

**E3. Dead data-actions (DEAD CODE).** Enumerated all 44 abilities.json actions vs
`ABILITY_ACTION_IMPLS`: **16 dead** (no impl). 5 have working legacy fallbacks; 11 pure
dead buttons telling players "isn't wired up yet". In food scope: removed dead duplicates
`blood_magic.blood_price` and `cannibal_frenzy.feed_hunger` (legacy is canonical);
**wired `thief.steal_pantry`** — effect fully specified in data, theft is a designed verb
("theft allowed, socially punished"): 2-unit lift, weight-checked, 50% clean / caught =
-20 trust + `caught_you_stealing` observe. The other 8 pure-dead buttons (molt,
scream_cheese, pocket_sand, grave_robber, mediator, leech, scarecrow, peacemaker x2,
water_breathing) are outside food scope — flagged for their loops.

## HELD (attacked, resisted — documented, not failures)

- **Contest betting**: deducted at placement, 2x payout — fair gamble, no edge.
- **Alien care packages**: hard 1-per-4-days gate, favor-scaled — not farmable.
- **stealFrom** (villager packs): 300–600 kcal takes from real daily-regenerating packs,
  35–90% detection, -35 trust + crime record + delayed suspicion sweep — socially punished
  by design, not an exploit.
- **Spoilage**: wired — endDay -> `sweepSpoiled()` covers pack + prep + pantry, announced,
  never silent.
- **Feastburn / forage yields**: labels match engine exactly; pack-full refuses honestly.

## Sibling sweep

Same bug classes hunted: all other ability XP/kcal grants checked for cap-bypass and
pre-success grants — clean. Other container transfer paths (pack/pantry/cache) checked for
phantom-counter writes — E2's two were the only ones.

## Proof results

- `scripts/test-food-break-blood-engine.js` — 7 asserts, green x4 seeds
  (20261008, 7, 424242, 987654321). Red pre-fix (exploit number shown).
- `scripts/test-food-break-pantry-phantoms.js` — 11 asserts, green x4 seeds. Red pre-fix.
- Re-verified post-merge on master: 7/7 + 11/11 green, `validate-ontology.js` 46/46 valid.

## Coordinator notes

- Target index advanced 1 -> 2 (next run: #2 knowledge system).
- Rebase: worker branch was based on `dd78b55`; master moved to `1ee7091` (ontology docs
  regen, docs/ONTOLOGY.md only) mid-run. Rebases cleanly; merged `--ff-only`.
- **Combat-branch resolution**: the previous run's `break-combat` worktree/branch
  (commit `8a01d39`) was cleaned up during this run by the loop that landed it — the 5
  unique fixes are in master as `d285f37` ("combat break-it: land 5 unique fixes from
  break-combat branch"), keeping the playtest loop's e314a09 XP design. `8a01d39` is an
  orphaned object; its content is preserved in `d285f37`. No work lost.
- **Stale registry entry**: `~/workspace/worktrees/REGISTRY.json` still lists
  `break-food` as active (owner oversight-flesh-out-loop) although the tree was removed
  after merge. Next pre-flight's `worktree-reap.sh` should clear it. This run used bare
  `git worktree add` — the registry protocol (Steve 2026-10-08) landed mid-run; future
  runs must use `worktree-register.sh`.
- **Pre-existing stale test**: `scripts/test-xp-attempts-20261008.js` fails 3/4 identically
  with and without these changes — asserts pre-combat-fix behavior (XP on failed
  activation) that was deliberately removed. Needs update or deletion by a future run.
- Main tree left with one untracked sibling file: `evidence/2026-10-08/dialog-phase2-brief.md`
  (dialog-phase2 loop's, active worktree) — not mine, not touched.
