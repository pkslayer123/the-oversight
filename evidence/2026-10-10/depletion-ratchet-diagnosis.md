# Depletion ratchet diagnosis (2026-10-10, proactivity research)

## Claim

The r4 survival wall (~day 24, 0/180 wins, starvation the new top killer —
see `completion-sweep-r4.md`) is not a tuning gap. It is a **one-way vigor
ratchet**: the only vigor-heal path in the codebase is unreachable on any
tile under daily village use, so worked ground degrades monotonically to
permanent death on a ~20-day timer. The code comments promise "rest heals
over seasons" and "pressure, not a kill switch" — the numbers implement a
kill switch.

## The mechanism (all in `src/js/game.js`)

**The single heal path** (`regrowTiles`, line 16127):
```js
if (!t.foragedToday && pressure === 0) t.vigor = Math.min(100, t.vigor + 2);
```
Gated on *both* not-worked-today *and* zero pressure.

**Every work of the land blocks both gates** (`stripGround`, lines 5419-5421):
```js
t.foragePressure = (t.foragePressure || 0) + 1;
t.foragedToday = true;
```
One `stripGround` call = +1 pressure, `foragedToday = true` — even when it
takes nothing (scraping bare ground still wounds -2 vigor, line 5417).

**Pressure never decays on worked ground** (line 16151):
```js
if (pressure > 0 && !t.foragedToday) t.foragePressure = Math.max(0, pressure - 1);
```
A tile worked once a day: pressure +1/day, forever. Thresholds then stack:
- pressure ≥ 5 (day ~5): stock regrow slows to every 4 days
- pressure ≥ 8 (day ~8): vigor auto-degrades `-(pressure - 7)`/day on top of takes
- pressure ≥ 10 (day ~10): **stock regrow stops entirely** (`regrow = 0`)

**Vigor erosion per take** (`stripGround`, lines 5414-5417): sustainable
takes (stock > 1) cost 0, but stock is 1–3 and regrows +1/2 days, so near
every take on worked ground strips the last unit: **-5 vigor/take**.
100 vigor ÷ ~5/day → **barren in ~20 days**. Stock cap is
`maxStock × vigor/100` (`tGroundCap`, line 5398), so cap → 0 with vigor:
the tile is dead, and dead ground can only heal via the unreachable gate.

Verified: no other vigor-heal path exists in the codebase
(`grep "vigor [+=]"` — the only `+` is line 16127).

## Why it hits at day 24

- `forageZone` (line 5489): cautious foragers are locked to **ring 1
  (4 tiles)** forever; steady to rings 1–2; only bold range to ring 3.
  `forageTilesInZone` (line 5463) works nearest-first within the ring.
- 2–4 tiles depleted per forage assignment (line 4804); a handful of
  foragers re-work the same 4–12 near tiles daily.
- Timeline for ring-1 tiles: regrow stops ~day 10, vigor dead ~day 20.
  The sweep's median death day is 24. This is the timer.
- Death spiral: `vigorYieldMult` (line 5544) scales forage inflow
  1.0 → 0.35 as vigor erodes while demand is fixed at 2,000 kcal/person/day
  → pantry drains → famine (-5 health/day, `villageEats`) → starvation
  deaths 1.1–1.4/run, new in r4.
- Haven 12→24 growth tiers (havenGrowth.js) double mouths on the same
  81-tile map. Counter-play (garden plots, fishing ecology, commons deals)
  showed zero meaningful use in 180 runs — not reachable in the ~20-day
  window (r4 report blocker #2).

## Fix directions (mechanism, not just numbers)

1. **Make rest reachable.** Heal vigor on lightly-worked ground (e.g.
   heal when pressure < 3, or heal proportional to regrow-minus-takes),
   not only on untouched ground. The current gate means "rest" only
   exists where nobody lives.
2. **Soften the pressure stack.** pressure ≥ 10 halting regrow entirely
   plus pressure ≥ 8 vigor auto-degrade is a double ratchet; consider
   pressure decaying on light-work days too.
3. **Forager rotation.** "The village must branch out" is commented
   (line 4802) but nothing makes them: `depletionLevel` is computed
   (line 5453) — wire it into zone/tile choice so crews abandon
   thinning ground instead of farming it to zero.
4. **Scale food with haven tier or pull counter-play earlier.**
   Gardens/fishing/deals need to be online by ~day 10, or the granary
   buffer (haven growth 2026-10-10) needs to cover the gap the ratchet
   opens.

Suggested validation: re-run `sweep-r4.js` (seeds 1–60, deterministic)
after the fix — apples-to-apples vs the r4 baseline.
