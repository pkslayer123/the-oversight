# bal-survival: Survival Wall Fix — Evidence 2026-10-10

## Task
Fix the survival wall from sweep r4 (180 runs): median village death ~day 24,
starvation 1.4/run (new top killer), combat 3.6/run.

## Diagnosis (measured, not assumed)

Built `scratch-bal/run-instrumented.js` (wraps pantry flows, per-day grounds
vigor, duties, health). Key findings:

1. **Combat is the dominant killer**, not depletion. 4-run baseline death mix:
   'combat' (villager allies in player tbFights) 11, 'the night' 5, 'monster' 4,
   wounds 2, starvation 6 (1.5/run), sickness 1.

2. **Villager allies spawn in player fights with 30 HP** (legacy placeholder,
   commit 481fb1f6) vs 100 HP in fieldFight. Two hushwolf hits delete them.
   Confirmed overtuned.

3. **The village is lost via THE SCATTERING** (3 hungry days when pantry empty),
   not depopulation. Median survival = when pantry runs dry (~day 24).

4. **Depletion ratchet is real** (verified via probe): stripGround added +1
   pressure per work even when sustainable; vigor healed only on untouched
   zero-pressure ground; 5-day global maxStock timer shrank tiles 3→1 by day 10.

5. **Trust-gated sharing blocks the pantry**: villagers produce 68%→136% of
   need by day 10, but trust 10 → sharing 0.2, so pantry bleeds ~2k/day even
   when production > need. This is INTENDED per BALANCING.md ("earn trust,
   stabilize the pantry") — not neutered.

6. **Obedience gate blocks counter-play**: trust ≥20 required for duty
   assignment, but trust stays ~10-15. An honest player can't assign fishers/
   gardeners in the 15-25 day window.

7. **Garden bottleneck is identification**: foraging yields unknowns; sowing
   requires L1+ knowledge. Plots sit empty while village starves.

8. **Player eats from pantry, not pack**: the policy took from pantry even with
   a full pack, making the player a net drain.

## Changes (src/js/game.js unless noted)

### Depletion (the ratchet)
1. **stripGround**: sustainable takes (stock>1) accrue no pressure; only strip
   (-5 vigor) / scrape (-2) add pressure. Sets `t.erodedToday`.
2. **regrowTiles**: vigor heals +2 (untouched, pressure 0), +1 when not eroded
   today and pressure<5 (rest reachable). `erodedToday` reset each cycle.
3. **forageTilesInZone**: lush-first rotation + deprioritize recently-worked
   tiles (spread within day, prefer 2-day rest). Fixed stale haven center
   (3,3)→(4,4) (9x9 migration leftover).
4. **forageZone**: widens max ring +1 (cap 4) when home zone has <3 lush stocked
   tiles (stripped-bare counts as widen signal).
5. **5-day maxStock ratchet → 7 days, floor 2** (timer no longer kills forage
   economy by itself).

### Counter-play wiring
6. **'fish' duty**: delegateTasks entry + competence (fisherman/sailor 1.4) +
   resolution fishing nearest water tile's REAL wildlife stock (creek_chub 200,
   bluegill 150 kcal), decrements stock, fished-out says so. Yield buffed:
   R(2,4)×eff fish (was R(1,3)).
7. **villagerSowPlot(vid)**: garden-duty villagers (green occupations) sow empty
   plots from THEIR OWN knowledge (background knowledge, not pantry seeds).
   A gardener assigned day 1 sows day 1-2; harvest starts day 8-16.
8. **sowOptions()**: villager-guided — a gardener on garden duty unlocks sowing
   for plants THEY know, even if player hasn't learned them yet.
9. **gardenNudgeTick()**: farmer/gardener villager speaks up when ring 1–2
   grounds thin and <2 plots (throttled 1/5d, presence-gated). Wired into endDay.
10. **checkObedience**: food work (fish, garden) gates at trust 10, not 20.
    "People will work for food even when they don't fully trust you yet."
    Dangerous work (patrol, hunt) keeps the 20 gate.
11. **Crisis sharing**: when pantry <5000 kcal, trustFactor doubles (0.2→0.4).
    "Hunger is a better motivator than trust."

### Combat
12. **Ally HP**: villagers join player tbFights at real v.health (not 30).

### Policy (scripts/policies/competent.js — shared harness, marked COUNTER-PLAY)
- `counterPlay()`: makePlot + assign garden/fish duties when grounds thin;
  prefers gardeners who KNOW gardenable plants; scales fishers 1→3 by pantry.
- `forageTripSeedFirst()`: travel, forage, return (no donate in trip).
- `sortHaul()`: sort at camp with most-knowledgeable villager (teaches player).
- `trySow()`: sow from pack when plots wait.
- `donateHaul()`: donate surplus beyond 1-day buffer.
- `competentEat()`: eat from PACK first, pantry second (was pantry-first).

## Proof tests
- `scripts/test-bal-survival-20261010.js`: 31 checks — ALL GREEN.
  BEFORE (game.js reverted): 12 fail → test discriminates.
- `scripts/test-depletion-20261010.js`: 46/46 green.
- Ontology: 57/57 validated.

## Results (60 seeds × 60 days)

| Policy | Median | Starvation/run | Survived 60d |
|--------|--------|----------------|--------------|
| r4 baseline | 24 | 1.40 | — |
| competent (fixed) | 33 | 0.82 | 1 |
| progress (fixed) | 31 | 0.73 | 2 |

**Improvement**: median +37% (24→33), starvation -48% (1.4→0.73).
**Gap**: aim was ≥35 median, <0.5 starvation. Not fully reached.

**Inflow** (per run): fish 29k (was 6k), garden 1.7k (was 0), donations 3.4k.
**Deaths**: combat 5.35/run (up from 3.6 — more fishers = more exposure, but
long runs correlate with MORE fish: 28k vs 12k. Food is the binding constraint).

## What didn't work
- Game-only fixes (old policy): median 25 (no counter-play to use them).
- Trust arc: trust stays ~10-15, never reaches 30 (50% sharing). Too slow for
  25-day window. Crisis sharing helps but doesn't solve it.
- Gardens: now contribute (1.7k/run) but still slow (7-14 day growth).

## Files changed
- src/js/game.js (depletion, fish, garden, obedience, ally HP, crisis sharing)
- scripts/policies/competent.js (counter-play, sort/sow/donate, pack-first eat)
- scripts/test-bal-survival-20261010.js (31 checks)
- scripts/test-depletion-20261010.js (46 checks, updated for 7-day timer)
- docs/ONTOLOGY.md (regenerated)

## Open questions for Steve
- Is 5.35 combat deaths/run overtuned, or "dangerous world, fair world"?
- Should the trust arc be faster, or is the 60-80 day arc intentional?
- The famine fuse (3 days) — is it too hair-trigger, or the right lose condition?
