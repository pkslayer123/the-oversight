# Tent Rooms v1 + Lighting Nuance — evidence (2026-10-08)

Steve's direction, built same-day:
1. "Fires in general should care about the rain" — not just friction ignition.
2. "Maybe tents become rooms that can be entered, and can host a fire that doesn't get put out?"
3. "We spawn in dawn and it's all really dark. Spawn in the afternoon. Darkness needs more nuance. Havens should maintain a comfortable light level at all times."

## What shipped

**Tent rooms** (`Game.enterTent` / `exitTent`, room screen in app.js):
- Your own intact pitched tent is enterable ("Enter tent" on its cell). Inside is a
  room screen (one screen, no scroll): fire status, vent flap, weather outside,
  Light/Feed/Cook(slow)/Vent/Sleep/Exit.
- Inside = sheltered from the sky: cold-day shiver tax skipped, rain can't touch you.
- Interior fire (`lightTentFire`): small (0.6x burn, capped at 2x burn0 on feed),
  **rain-immune** — rain onset never halves it, no 2x drain. Slower cooking (24 ticks).
- Smoke tradeoff: sealed flap + lit fire → smoke builds on tickAction (coughing fit,
  -3 energy at 100, honest warning); sleeping sealed with fire lit → -10 health,
  energy capped at 50, named lesson. Vent open: no smoke ever, but draft burns the
  interior fire 1.25x.
- Guards: can't pack the tent you're inside; breakCamp dumps you out; encounters
  yank you out ("the tent is not invisibility"); wrecked tent clears insideTent
  (validated every status()); save/load safe (plain data on scholar).

**Rain vs fire, generally** (`taxFires`, called from `sweepDeadFires`):
- Rain onset: exposed player fires lose half remaining burn, named honestly
  ("The rain hisses on your fire — half its life, gone in steam").
- While raining: exposed fires burn 2x. Weak fires gutter; strong ones burn through.
- Interior fires immune (vent open: 1.25x draft, never gutters). Map fires unaffected.
- Friction ignition penalty (-0.25) kept — same system now.

**Lighting nuance** (`lightLevel`):
- Rain dims: rainy midday 0.7 (was 1), rainy night 0.12 floor.
- Haven floor 0.65 at all times (hearths and lamps).
- Firelight pools: near a burning fire at night → 0.45.
- Tent interior at night: lit fire → 0.55 glow; no fire → dark (0.15-0.2).

**Afternoon spawn**: new runs start dayPart=1 (midday), dayTicks=192 — full light,
half a day to get bearings before first dusk. Later days still roll at dawn.

## Proof

`scripts/test-tent-rooms-20261008.js` — **34/34 green**, all on real code paths
(advancePart for shiver tax, full sleep() for inhalation, real taxFires sweeps):
- Spawn values → lightLevel 1; night/rain/haven/firelight/tent-interior levels.
- Enter/exit, shelter flag, cellActions gating, shiver tax skipped inside / bites outside.
- Interior fire small + rain-immune (no halving, no rainHit; vent closed = zero drain;
  vent open = 1.25x); exposed fire halved on onset + 2x in rain + honest message.
- Smoke: sealed coughing fit (-3 energy, names the fix); sealed sleep (-10 health,
  energy ≤50, lesson); vented sleep clean.
- Guards: pack-while-inside refused, encounter yank, phantom-room validation,
  feed cap, breakCamp dump-out.

Existing suites: test-make-fire (26), test-sleep-preview-tonight (11),
test-fireside-return-guarantee (11) — all green. Ontology 47/47.

## Design notes (Steve can overrule)

- Interior fires are deliberately small — a tent can't host a bonfire. Cooking is
  slower, capacity capped. The tradeoff for rain immunity is throughput, not a tax.
- Smoke only matters with a lit fire + sealed flap. No fire, no problem; vented,
  no problem. One clean rule: never sleep sealed with the fire lit.
- The room is the abstraction; the tent is the first room. Cabins/caves/ruins can
  follow without new code paths.
- Encounters yank you out of the tent — hiding through the night is not a stealth
  exploit. Villagers can't visit you inside yet (v2 charm, not v1 scope).
