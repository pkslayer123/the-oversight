# review_drone — encounter beat capture

> Text capture from a scripted node sim (`scripts/play-monbatch4.js review_drone`),
> not a live browser session. The sim drives real game turns (declare → windup →
> resolve) and prints exactly what the player would read in the log, with the
> grid state at each beat. Played 2026-10-04.

## Monster
**Performance Review** (review_drone) — a hovering clipboard, projecting light onto
the ground. It is grading you. You are failing. FIFO evaluation queue; announced
3-count beam; dodge-efficiency grading; crowd overload.

## Beat 1 — first sighting
```
[grid] you=(4,4) hp=100 | foe=(7,4) hp=42 phase=stalk | queue=p
  You don't know what that was. a hovering clipboard, projecting light onto the ground Someone at the haven should hear about this.
  ⚔ A HOVERING CLIPBOARD, PROJECTING LIGHT ONTO THE GROUND! You're on your own.
  Turn-based now. Tap a tile to move — speed is squares. Then act.
```
No true name anywhere — descriptor gating holds.

## Beat 2 — telegraph (pre-knowledge: diegetic, not tactical)
```
[grid] you=(4,4) hp=100 | foe=(7,4) hp=42 phase=project 📊 EVALUATING | queue=p
  ⚠ 📊 CORRECTIVE BEAM CHARGING. DODGE EFFICIENCY CURRENTLY AT 41% — BELOW TARGET. COMMENCING IN THREE. The line is projected on the dirt. Light plays across the dirt in a straight line. Probably decorative. Probably.
```
The player reads the projected line and steps off it (→ (3,3)).

## Beat 3 — the countdown is spoken
```
[grid] you=(3,3) hp=100 | foe=(7,4) hp=42 phase=countdown ⏳ CORRECTING IN… | queue=p
  📊 "TWO." DODGE EFFICIENCY: 41%. The projected line brightens.
  📊 "ONE." DODGE EFFICIENCY: 41%. The projected line brightens.
```

## Beat 4 — climax: the correction, dodged
```
[grid] you=(3,3) hp=100 | foe=(7,4) hp=42 phase=recalc 🌀 RECALIBRATING | queue=p
  💥 Scored Assessment!
  You're not where it landed. Clean dodge.
  📊 DODGE EFFICIENCY: 49% — CLEAN DODGE. LOGGED. BELOW TARGET. CORRECTIVE ACTION SCHEDULED.
  📖 Codex: Scored Assessment — fires in a straight line from itself. You won't forget this.
  The drone hovers, re-running the numbers. "RECALIBRATING METRICS."
```

## Beat 5 — round 2 (post-knowledge: tactical coaching unlocks)
```
  ⚠ 📊 CORRECTIVE BEAM CHARGING. DODGE EFFICIENCY CURRENTLY AT 49% — BELOW TARGET. COMMENCING IN THREE. The line is projected on the dirt. That projected line is exactly where the beam fires — it cannot re-aim once announced. Step off it. You know this one: Scored Assessment fires in a straight line from itself.
```
Standing on the line, by contrast: `a hovering clipboard…'s Scored Assessment hits you for 18.` →
`📊 DODGE EFFICIENCY: 29% — HIT TAKEN. LOGGED. BELOW TARGET. CORRECTIVE ACTION SCHEDULED.`

## Beat 6 — crowd: it can't grade a crowd
With two villagers beside the player, the FIFO queue fills (pain jumps the line,
proximity overrules), then:
```
  It wobbles — then the lens LOCKS onto A person, maybe 60s. "PAIN RESPONSE LOGGED. PRIORITY ESCALATED." Pain gets graded first.
  "PROXIMITY VIOLATION." The projector snaps to A person, maybe 60s — closeness overrules the queue.
  📊 "TOO MANY SUBJECTS. EVALUATION PAUSED. RECALIBRATING." The drone backs off, overwhelmed by the crowd.
```
phase=recalc 🌀 RECALIBRATING. Bring friends.

## Playtester's notes
- The joke is playable: the drone tells you exactly what it's doing, and the
  counterplay is believing the projected line. The 8-direction beam sometimes
  draws a line that genuinely misses you — the telegraph stays honest (the line
  IS the attack), and it reads as the drone being as bad at its job as it
  claims you are at yours.
- You can tell which monster this is from the capture: the 📊 patter, the
  efficiency ticker, the clipboard. Identity is unmistakable.
