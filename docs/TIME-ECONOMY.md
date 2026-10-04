# Time & Movement Economy

How the world moves when you do. All tunables live in `Game.TIME` (src/js/game.js).

## The model

Three clocks, three scales:

1. **Your steps (free).** Single steps (`microMove`) and committed walks (`movePath`)
   cost kcal, not time. You can explore a node freely — the world doesn't
   freeze-frame, but it doesn't lurch forward because you shifted your weight.

2. **NPC batch turn (background life).** Every `NPC_BATCH_MOVES` (32) of your
   squares within a node, NPCs take a batch turn: they wander at their own
   speed, pursue initiative (come to you), wants tick up slightly. This is the
   "they're living their lives in the background" beat — catching up in batches,
   not acting on every step.

3. **Node travel (the big time step).** Moving between nodes runs
   `travelTimeStep()`: a full NPC batch, needs tick, one gossip hop, small
   energy cost. Time visibly passes in the world.

Combat switches to strict turn-based (existing system, untouched) — `tickMoveClock`
is suppressed while `tbfight` is active.

## NPC speed is a real stat

`npcSpeed(vid)` returns 0.5–1.5 relative to your 1.0:
- Age: <30 → +0.2, >55 → −0.25, >45 → −0.1
- Temperament: bold/intense → +0.15, cautious/withdrawn → −0.15

Per batch, each NPC wanders `round(NPC_BATCH_WANDER × speed)` squares
(8 base → 12 for the fast, 4 for the slow). You can *see* who's fast.

## Tuning notes (playtested 2026-10-04)

- **32 moves** for the batch trigger: a full crossing of the 9×9 grid is ~16
  steps, so 32 ≈ two crossings — enough freedom to explore without the world
  feeling frozen, frequent enough that NPCs feel alive. Try 20 if NPCs feel
  sluggish, 50 if they feel hyperactive.
- **8 wander squares** per batch: keeps NPCs visibly moving without teleporting
  across the grid. The 50%-per-step meander keeps it organic.
- **Travel does NOT consume a day-part.** Playtested: 1 part/travel broke the
  4-action economy (forage = 1 part) — sim win rates collapsed because travel
  competed with foraging instead of complementing it. Steve said "portion of
  the day"; the portion is paid by the *world* (NPCs act, needs grow, gossip
  spreads), not by your action budget. If travel ever feels free, the lever is
  `travelTimeStep` (raise needs tick / energy cost), not the part economy.
