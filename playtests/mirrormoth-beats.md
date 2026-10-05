# Monster encounter beats — mirrormoth — Flashbulb Moth

> Captured 2026-10-04 from the node combat sim (`scripts/test-monbatch2.js` harness
> driving `Game.startCombat` + turn functions). These are **text captures of
> `Game.log`** — what the player reads in the log/feedback — not screenshots:
> there is no live browser in this environment, so visual layout, badges, and
> audio are not shown. `[stage direction]` lines are sim notes, not game text.

Personality: the flash must FACE you. Phases: stalk → land → fold → flash → recover.

## Beat 1 — first sighting

```
The village is rattled. Everyone's jumpy — eyes on the treeline.
You don't know what that was. a moth the size of a dinner plate, catching light wrong Someone at the haven should hear about this.
⚔ A MOTH THE SIZE OF A DINNER PLATE, CATCHING LIGHT WRONG! You're on your own.
Turn-based now. Tap a tile to move — speed is squares. Then act.
```

*[player walks adjacent; the moth lands]*

## Beat 2 — it lands

```
It lands on a branch at eye level — wings half-open, catching light that isn't there. Watching you watch it.
```

*[the fold: telegraph declared, facing locks]*

## Beat 3 — telegraph (the fold)

```
⚠ It lands. It folds its wings. The light in the clearing changes, like someone adjusting a lamp. It's about to loose!
It hangs mid-air — turns to face you — and the wings begin to fold.
```

## Beat 4 — climax: the flash, player in front

```
💥 Wing Flash!
moth's Wing Flash hits you for 12.
Spots bloom across your vision — the flash is still in your eyes. (blinded 1 round)
Its wings hang open and dull — the light spent. For a moment, it's just a moth.
📖 Codex: Wing Flash — hits everything close around it. You won't forget this.
```

*[second fold — the codex has learned the pattern, so the cue now coaches]*

## Beat 5 — telegraph, post-knowledge (tactical coaching)

```
The moth shivers its wings — dull, lightless. Gathering itself again.
It lands on a branch at eye level — wings half-open, catching light that isn't there. Watching you watch it.
⚠ It lands. It folds its wings. The light in the clearing changes, like someone adjusting a lamp. It's about to loose! You know this one: Wing Flash hits everything close around it. Wing Flash only fires FORWARD — it must face you. Circle behind it before the wings open.
It hangs mid-air — turns to face you — and the wings begin to fold.
💥 Wing Flash!
moth's Wing Flash hits you for 9.
Spots bloom across your vision — the flash is still in your eyes. (blinded 1 round)
Its wings hang open and dull — the light spent. For a moment, it's just a moth.
```

*[facing locked at fold: {"x":0,"y":1} — player circles behind]*

## Beat 6 — climax: the flash, player behind (flanked)

```
Your vision clears — the spots fade.
The moth shivers its wings — dull, lightless. Gathering itself again.
```
