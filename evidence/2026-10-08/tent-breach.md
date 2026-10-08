# Tent Breach — causal night encounters (Steve 2026-10-08)

Steve's critique: the encounter "yank" (pendingEncounter dragging you out of the
tent with a generic warning) was a cheap RNG pull. It should be based on a monster
actually finding you — often from having a lit fire — and the monster should enter
the tent, or bust it down if it's something like a bulldozer. Part of the world,
not RNG. Life shouldn't stop when you sleep.

## What shipped

**Detection is causal** (`Game.wandererFindsYou`):
- Out in the open: it sees you (unchanged).
- Inside the tent: base 0.12 (canvas, sweat, snoring); lit interior fire +0.45 vented
  / +0.30 sealed (light through canvas, smoke on the wind); dark + sealed −0.04;
  scent hunters (hushwolf, new `scentHunter` flag in monsters.json) ×1.5.
- Measured in proof: 0.57 / 0.42 / 0.08 / 0.855 — all within 0.05 of design.

**Encounter choke point** (`Game.triggerEncounter`): every "it comes for you" panel
routes through here — the wanderer tile entry AND the hushwolf Silent Rush script.
Inside the tent: detection roll → found = breach, not found = pass-through
("Something heavy moves past outside... It never knew you were here.").

**Enter or bust** (`Game.wandererTentBreach`):
- Small/medium (size < 2): it comes through the flap — `pendingInTent`, panel reads
  "It is INSIDE the tent with you." Facing it = `faceTentIntruder`: burst out, it
  comes right behind you, combat spawns at arm's length (`_tentBreachSpawn`
  override in startCombat).
- Big (size ≥ 2: bulldozer, moderator): the canvas EXPLODES inward — tent wrecked
  (`wreckTent`), you're thrown clear (−5 health), regular encounter panel.
- eyes_in_back: ambushes never surprise — warning first, you scramble out before
  it gets inside; tent intact, regular fight.

**Sleep is not a pause button**: moveWanderer runs on advancePart, which runs
inside sleep()'s tick loop — a wanderer can arrive mid-sleep, detection runs,
breach wakes you (`woke` path). Sleeping with a fire lit is now a risk decision.

**Removed**: the old status() yank (replaced, not supplemented).

## Proof

`scripts/test-tent-breach-20261008.js` — 34/34: causal odds, enter, bust, pass-
through, moveWanderer integration, eyes_in_back, close spawn, open-air unchanged.
`scripts/test-tent-rooms-20261008.js` — updated (yank→no-yank contract), all green.
Existing fire/sleep suites green. Ontology 47/47.

## Design notes (Steve can overrule)

- Detection numbers are chosen, not derived: fire-lit sleep ≈ 50-60% found, dark
  sealed ≈ 8%. Tune freely.
- Only the hushwolf is flagged scentHunter today. Other monsters can earn it.
- Path 1 (wanderer spawns physically on the tile → spawnWorldMonster in-grid) is
  unchanged: the monster is really there, the grid AI does what it does. The tent
  vs grid-monster AI (does it know you're in the tent?) is the next depth layer.
