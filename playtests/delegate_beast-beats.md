# delegate_beast — encounter beat capture

> Text capture from a scripted node sim (`scripts/play-monbatch4.js delegate_beast`),
> not a live browser session. The sim drives real game turns and prints exactly
> what the player would read in the log, with the grid state at each beat.
> Played 2026-10-04.

## Monster
**Middle Manager** (delegate_beast) — something pacing in circles, muttering
about action items. It doesn't do the violence itself. It DELEGATES. To itself.
Repeatedly. FIFO meeting agenda; always circles first; wide locked charge line
(length 4, width 2 — sidestep far); post-charge debrief.

## Beat 1 — first sighting
```
[grid] you=(4,4) hp=100 | foe=(7,4) hp=61 phase=stalk | queue=p
  ⚔ SOMETHING PACING IN CIRCLES, MUTTERING ABOUT ACTION ITEMS! You're on your own.
```

## Beat 2 — it always circles first
```
[grid] you=(4,4) hp=100 | foe=(7,2) hp=61 phase=circle 🔄 CIRCLING | queue=p
  ⚠ It paces a wide circle around you, dictating into nothing: 'Per my last roar... circling back on the violence action item... let's take this OFFLINE.' It lowers its horns. The meeting has been scheduled. Attendance is mandatory.
```
It genuinely orbits (7,4 → 7,2), committing to a direction — no pacing out and
back. The circle is the telegraph.

## Beat 3 — the announce: the line is set
```
[grid] you=(4,4) hp=100 | foe=(7,2) hp=61 phase=announce 📋 LINE SET | queue=p
  ⚠ "let's take this OFFLINE." It lowers its horns. The meeting line is SET — attendance is mandatory. It is staring down a line on the ground. You should not be on that line.
```
The announced line is drawn true to the aim (not snapped to 8 directions) —
the target is always ON it. The player sidesteps to (3,3).

## Beat 4 — climax: the announced line, exactly
```
[grid] you=(3,3) hp=100 | foe=(3,4) hp=61 phase=debrief 🗂 DEBRIEFING | queue=p
  It charges the announced line — exactly where it said it would. Attendance was mandatory.
  💥 Circle Back!
  You're not where it landed. Clean dodge.
  📖 Codex: Circle Back — charges in a straight line, trampling everything in its path. You won't forget this.
  It dictates into nothing: "violence action item: closed. Scheduling retrospective."
```
Unlike a normal charge it does NOT re-aim at fire time — the deal it offered
is the deal it keeps. It ends at the far end of the announced line (3,4).

## Beat 5 — it always circles first (again)
```
[grid] you=(3,3) hp=100 | foe=(3,2) hp=61 phase=circle 🔄 CIRCLING | queue=p
  ⚠ It paces a wide circle around you, dictating into nothing: 'Per my last roar... circling back on the violence action item...'
```
Every charge is preceded by a circle. Always.

## Playtester's notes
- The counterplay is the whole joke made real: it schedules the violence, tells
  you the line, and keeps its word. Wide (width 2) but predictable — sidestep
  FARTHER than feels necessary (post-knowledge coaching says exactly this).
- Fixed during playtesting: the first circle implementation paced out and back
  to the same tile; now it commits to an orbit direction. Also fixed: the
  generic 8-direction line sometimes announced a lane that missed the target —
  the announce now uses true-angle rasterization so the threat is always genuine.
- You can tell which monster this is from the capture: the meeting patter,
  the circling, the debrief. Identity is unmistakable.
