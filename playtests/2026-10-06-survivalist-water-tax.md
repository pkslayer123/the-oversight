# 2026-10-06 survivalist water-tax run v2 (playtest loop)

Ten days of the haven water economy: cistern drawdown, trust-gated delegation, creek risky water, dehydration spiral, shelter tiers.

```
START: day=1 part=0 ticks=0 kcal=2200 hyd=100 hp=100 en=100 bottles=2(2c) cistern=20L (cistern 20L)

--- DAY 1: morning routine ---
filled 4L (refused=false): cistern 20 -> 16L; day=1 part=0 ticks=4 kcal=2160 hyd=100 hp=100 en=100 bottles=6(6c) cistern=16L
  PASS day 1: fills only refused when cistern is dry
drank 0: hyd=100
  PASS day 1: sleep advanced the clock (quality hall)
slept (hall): hp 100 -> 100; eod day=2 part=0 ticks=0 kcal=1371 hyd=65 hp=100 en=100 bottles=7(7c) cistern=15L

--- DAY 2: morning routine ---
filled 4L (refused=false): cistern 15 -> 11L; day=2 part=0 ticks=4 kcal=1331 hyd=65 hp=100 en=100 bottles=11(11c) cistern=11L
  PASS day 2: fills only refused when cistern is dry
drank 1: hyd=100
  PASS day 2: sleep advanced the clock (quality hall)
slept (hall): hp 100 -> 100; eod day=3 part=0 ticks=0 kcal=1122 hyd=65 hp=100 en=100 bottles=11(11c) cistern=10L

--- DAY 3: morning routine ---
filled 4L (refused=false): cistern 10 -> 6L; day=3 part=0 ticks=4 kcal=1082 hyd=65 hp=100 en=100 bottles=15(15c) cistern=6L
  PASS day 3: fills only refused when cistern is dry
drank 1: hyd=100
  PASS day 3: sleep advanced the clock (quality hall)
slept (hall): hp 100 -> 100; eod day=4 part=0 ticks=0 kcal=1050 hyd=65 hp=100 en=100 bottles=15(15c) cistern=5L
cistern days 1-3: {"1_start":20,"1_end":15,"2_start":15,"2_end":10,"3_start":10,"3_end":5}

--- DAY 4: delegation + drain the cistern ---
  NOTE water duty delegation day 4: REFUSED (trust too low) — a fresh life cannot delegate
drained: filled 5L more, cistern 5 -> 0L (refused=true)
  PASS cistern runs dry and further fills refuse honestly
  PASS dry cistern names the fallback (creek / water duty)
  dry message names creek + water duty — good honesty
slept (hall): eod day=5 part=0 ticks=0 kcal=1050 hyd=30 hp=100 en=100 bottles=20(20c) cistern=0L

--- DAY 5: creek day ---
no creek reachable — SKIP

--- DAYS 7-8: dehydration spiral (zero drinks) ---
day 7: hyd 30 -> 30 (Δ0) hp 100 -> 100
  game warned during the day: false
  slept (hall) dehydrated: hp 100 -> 85, en 100 -> 60
  PASS day 7: dehydration night does not fully heal (crisis path)
day 8: hyd 0 -> 0 (Δ0) hp 85 -> 85
  game warned during the day: false
  slept (hall) dehydrated: hp 85 -> 75, en 60 -> 60
  PASS day 8: dehydration night does not fully heal (crisis path)

--- DAY 9: recovery ---
filled 0, drank 2: hyd=100 hp=75 cistern=0L
slept (hall): hp 75 -> 90 (heal tier check)

--- DAY 10: shelter tier audit ---
at haven: quality=hall heal=20 ("the hall floor")
packed tent in inventory: false
bunk adjacent at haven: false
slept (hall)
eod day=9 part=0 ticks=0 kcal=1200 hyd=30 hp=100 en=100 bottles=18(18c) cistern=0L

FINAL: day=9 part=0 ticks=0 kcal=1200 hyd=30 hp=100 en=100 bottles=18(18c) cistern=0L gameDay=9 over=false
water economy: water-ticks=12, filled=17L, drank=4, sick=0
cistern trace: {"1_start":20,"1_end":15,"2_start":15,"2_end":10,"3_start":10,"3_end":5,"4_end":0}
```

## Feel verdict
See loop log entry for this run.
