# camera_swarm — encounter beat capture

> Text capture from a scripted node sim (`scripts/play-monbatch4.js camera_swarm`),
> not a live browser session. The sim drives real game turns and prints exactly
> what the player would read in the log, with the grid state at each beat.
> Played 2026-10-04.

## Monster
**Influencer** (camera_swarm) — a glittering tide, all lenses, all pointed at you.
It doesn't want to kill you. It wants CONTENT. The killing is incidental. FIFO
content queue; chases the PLAYER (its muse) at speed 6; creeps while the flash
builds; fragile (+25% damage); fire scatters it; dodged flashes escalate.

## Beat 1 — first sighting
```
[grid] you=(4,4) hp=100 | foe=(7,4) hp=34 phase=stalk | queue=p
  ⚔ A GLITTERING TIDE, ALL LENSES, ALL POINTED AT YOU! You're on your own.
  Turn-based now. Tap a tile to move — speed is squares. Then act.
```

## Beat 2 — telegraph: it closes in FAST, then declares
```
[grid] you=(4,4) hp=100 | foe=(5,3) hp=34 phase=build 📸 FLASH BUILDING | queue=p
  ⚠ 📸 "SMILE! You're going VIRAL!" The shutters quicken — the flashes are building. It wants a reaction. Do not give it one standing still.
```
It crossed 3 tiles in one turn (speed 6). The player runs.

## Beat 3 — climax: it creeps WHILE winding up
```
[grid] you=(4,1) hp=100 | foe=(4,2) hp=34 phase=build 📸 FLASH BUILDING | queue=p
  It never stops filming — the swarm closes in even as the flashes build.
  📸 "ENGAGEMENT CRITICAL!" The shutters are a strobe now. COVER YOUR EYES.
  💥 Flash Mob!
  a glittering tide, all lenses, all pointed at you's Flash Mob hits you for 14.
  📖 Codex: Flash Mob — hits everything close around it. You won't forget this.
```
This is the scary part: you ran 3 tiles and it still caught you, because it
never stops closing in. The counterplay is running *directly away* (3 tiles
beats creep-1 + radius-2), killing it fast (it's fragile), or fire.

## Beat 4 — post-knowledge: the coaching unlocks
```
  ⚠ 📸 "SMILE! You're going VIRAL!" The shutters quicken — the flashes are building. Flash Mob: burst radius 2 around the swarm, and it keeps closing in while it builds. Keep moving — or get it near fire. You know this one: Flash Mob hits everything close around it.
```

## Beat 5 — fire: lead it into hazards (fresh setup, campfire at (4,2))
```
[grid] you=(4,4) hp=100 | foe=(6,4) hp=34 phase=stalk | queue=p
  --- one turn later ---
[grid] you=(4,4) hp=100 | foe=(8,6) hp=34 phase=scatter 💨 SCATTERED | queue=p
  The shutters stutter. Smoke — no, FIRE — in the lenses. "LOSING THE SHOT! LOSING THE—" It breaks off.
```
It won't come near the fire — it breaks off the hunt entirely and flees two
tiles. A campfire is a shield; killing it still takes stepping away from the
flames. Dodged flashes escalate instead: `"ENGAGEMENT DROPPING! ESCALATING!"`
and the next Flash Mob hits harder (+15% per miss).

## Playtester's notes
- The personality reads instantly: it films YOU (chases the player, not the
  queue), it cannot stop filming (creeps mid-windup), and it wants a reaction
  (escalation). Funny and genuinely threatening — speed 6 means it WILL catch
  you if you dawdle.
- Fragility confirmed in sim: a spear strike does +25% with
  "Cameras shatter across the dirt — the swarm is FRAGILE."
- You can tell which monster this is from the capture: 📸 patter, shutters,
  "VIRAL", the scatter. Identity is unmistakable.
