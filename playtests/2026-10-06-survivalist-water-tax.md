# 2026-10-06 survivalist water-tax run v2 (playtest loop)

Ten days of the haven water economy: cistern drawdown, trust-gated delegation, creek risky water, dehydration spiral, shelter tiers.

```
START: day=1 part=0 ticks=0 kcal=2200 hyd=100 hp=100 en=100 bottles=2(2c) cistern=25L (cistern 25L)

--- DAY 1: morning routine ---
filled 4L (refused=false): cistern 25 -> 21L; day=1 part=0 ticks=4 kcal=2160 hyd=100 hp=100 en=100 bottles=6(6c) cistern=21L
  PASS day 1: fills only refused when cistern is dry
drank 0: hyd=100
  PASS day 1: sleep advanced the clock (quality hall)
slept (hall): hp 100 -> 110; eod day=2 part=0 ticks=0 kcal=1371 hyd=65 hp=110 en=100 bottles=7(7c) cistern=20L

--- DAY 2: morning routine ---
filled 4L (refused=false): cistern 20 -> 16L; day=2 part=0 ticks=4 kcal=1331 hyd=65 hp=110 en=100 bottles=11(11c) cistern=16L
  PASS day 2: fills only refused when cistern is dry
drank 1: hyd=100
  PASS day 2: sleep advanced the clock (quality hall)
slept (hall): hp 110 -> 110; eod day=3 part=0 ticks=0 kcal=1122 hyd=65 hp=110 en=100 bottles=11(11c) cistern=15L

--- DAY 3: morning routine ---
filled 4L (refused=false): cistern 15 -> 11L; day=3 part=0 ticks=4 kcal=1082 hyd=65 hp=110 en=100 bottles=15(15c) cistern=11L
  PASS day 3: fills only refused when cistern is dry
drank 1: hyd=100
  PASS day 3: sleep advanced the clock (quality hall)
slept (hall): hp 110 -> 110; eod day=4 part=0 ticks=0 kcal=1050 hyd=65 hp=110 en=100 bottles=15(15c) cistern=10L
cistern days 1-3: {"1_start":25,"1_end":20,"2_start":20,"2_end":15,"3_start":15,"3_end":10}

--- DAY 4: delegation + drain the cistern ---
  NOTE water duty delegation day 4: REFUSED (trust too low) — a fresh life cannot delegate
drained: filled 10L more, cistern 10 -> 0L (refused=true)
  PASS cistern runs dry and further fills refuse honestly
  FAIL dry cistern names the fallback (creek / water duty)
slept (hall): eod day=5 part=0 ticks=0 kcal=1000 hyd=30 hp=110 en=100 bottles=25(25c) cistern=0L

--- DAY 5: creek day ---
hopped to creek (3,2)
filled 0L creek (risky): bottles=25(25c)
  PASS day 5: wild water is risky, never clean
  raw risky drink: got lucky
slept (hall): eod day=6 part=0 ticks=0 kcal=1000 hyd=45 hp=110 en=100 bottles=24(24c) cistern=0L

--- DAY 6: creek day ---
hopped to creek (3,2)
filled 1L creek (risky): bottles=25(24c)
  PASS day 6: wild water is risky, never clean
  raw risky drink: got lucky
slept (hall): eod day=7 part=0 ticks=0 kcal=1055 hyd=60 hp=110 en=100 bottles=24(23c) cistern=0L

--- DAYS 7-8: dehydration spiral (zero drinks) ---
day 7: hyd 60 -> 60 (Δ0) hp 110 -> 110
  game warned during the day: false
  slept (hall) dehydrated: hp 110 -> 110, en 100 -> 100
  PASS day 7: dehydration night does not fully heal (crisis path)
day 8: hyd 25 -> 25 (Δ0) hp 110 -> 110
  game warned during the day: false
  slept (hall) dehydrated: hp 110 -> 95, en 100 -> 60
  PASS day 8: dehydration night does not fully heal (crisis path)

--- DAY 9: recovery ---
filled 0, drank 2: hyd=100 hp=95 cistern=0L
slept (hall): hp 95 -> 110 (heal tier check)

--- DAY 10: shelter tier audit ---
at haven: quality=hall heal=20 ("the hall floor")
packed tent in inventory: false
bunk adjacent at haven: false
slept (hall)
eod day=11 part=0 ticks=0 kcal=1104 hyd=30 hp=110 en=100 bottles=22(21c) cistern=0L

FINAL: day=11 part=0 ticks=0 kcal=1104 hyd=30 hp=110 en=100 bottles=22(21c) cistern=0L gameDay=11 over=false
water economy: water-ticks=12, filled=23L, drank=6, sick=0
cistern trace: {"1_start":25,"1_end":20,"2_start":20,"2_end":15,"3_start":15,"3_end":10,"4_end":0}
```

## Feel verdict
See loop log entry for this run.
