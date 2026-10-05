# memory_projector — beat capture

**How this was captured:** text output of a node simulation driving the real
combat engine (`src/js/game.js` + `src/js/encounters.js`) — the same `say()`
lines a player sees in the combat log. No live browser was used; there is no
screenshot, only the rendered text. Spawn: dusk (dayPart 2), player stands
still, then breaks the spell by moving.

**The encounter:** phases `watch → spell → static`. It watches for 2 turns
(no attack — curiosity). Then it shows you home, and if you stand still the
spell takes hold: it drags you 1 tile closer per turn AND winds up its beam
(Home Movies, windup 2, aim locked at declare). Moving 2+ tiles in a turn
shatters the spell outright.

---

## First sighting

> Somewhere in the light: a kitchen. A laugh you haven't heard in years. You
> shouldn't look. You look.

## The telegraph (ungated — the picture)

> ⚠ It unfolds a screen of light between the trees. And there — impossibly —
> is home. Your street. Your kitchen. Someone you miss, laughing. You take a
> step closer without deciding to. The light has edges. The edges are sharp.

The cruelest line in the batch: "You take a step closer **without deciding
to**." The pull is real — the sim confirmed the player is displaced 1 tile
per turn toward the projector while the spell holds.

## The climax (the beam)

> 💥 Home Movies!
> a flickering light at dusk, showing... something. you couldn't look away's
> Home Movies hits you for 26.
> 📖 Codex: Home Movies — fires in a straight line from itself. You won't
> forget this.
>
> The screen collapses to gray static, hissing. It's confused — the picture
> won't come back yet.

After surviving, the codex-gated cue names the counterplay:

> ⚠ It's showing you home to hold you still. The beam runs along your line of
> gaze — MOVE. Keep moving and the picture can't hold. You know this one: Home
> Movies fires in a straight line from itself.

## The counterplay (breaking the spell)

> You force your feet to move — the image judders, breaks up. Too fast. It
> can't hold the picture. The screen collapses to static.

Moving 2+ tiles in one turn doesn't just dodge the beam — it ends the whole
spell. The monster drops back to watching and has to start over.

## What the sim proved

- Phase order: watch (2 turns, curious, no attack) → spell (pull + telegraph)
  → static (post-beam confusion).
- Standing still: pulled 1 tile/turn, beam lands for 19–26.
- Moving: spell breaks immediately, beam never fires.
- The aim locks at declare — sidestepping after the telegraph still gets you
  hit; you have to break the spell, not dodge the beam.

## Design notes for Steve

- This is the one that weaponizes nostalgia rather than fear. The counterplay
  (keep moving) is the opposite of what the fiction makes you want to do
  (stand and stare). That's the uncanny working as designed.
