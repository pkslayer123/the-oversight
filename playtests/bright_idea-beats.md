# bright_idea — beat capture

**How this was captured:** text output of a node simulation driving the real
combat engine (`src/js/game.js` + `src/js/encounters.js`) — the same `say()`
lines a player sees in the combat log. No live browser was used; there is no
screenshot, only the rendered text. Spawn: night (dayPart 3), player
approaches, then holds.

**The encounter:** phases `settle → brighten → ember`. It drifts until you're
close, then SETS — it never moves again — and brightens over exactly 2 beats
before detonating (radius 2, 22–34). Then it's a harmless ember for 2 turns.
Daylight disperses it.

---

## First sighting

> A light in the dark, drifting closer. Beautiful. It wasn't there yesterday.

## The telegraph (ungated — diegetic beauty)

> ⚠ It sits perfectly still, glowing brighter and brighter. A beautiful idea,
> taking shape. You can feel the brilliance building. That's when you realize:
> ideas this bright are never safe to stand next to.
>
> The glow intensifies — the air tastes like copper. Brighter.
>
> BRIGHTER. The light is wrong now, too bright to look at. It's about to loose.

Two beats from glow to boom, narrated beat by beat. The instinct is to stare.
The correct move is to back off.

## The climax (the bloom)

> 💥 Eureka!
> 📖 Codex: Eureka — hits everything close around it. You won't forget this.
>
> The light gutters down to a dying ember. It's spent — dim, flickering,
> harmless. For now.
> The ember flickers, dim. It can't brighten yet.
> The ember steadies. Somewhere inside the glass, an idea is forming again.

After surviving, the codex-gated cue drops the poetry and gives the order:

> ⚠ It's brightening. Two beats from glow to boom — BACK OFF. Radius 2.

## What the sim proved

- Full cycle observed: settle → brighten → bloom → ember → settle again.
- The first bloom in the sim missed the player (out of radius 2) while later
  ones hit for 27–30 — backing off before the boom dodges it cleanly (covered
  in `scripts/test-monbatch3.js`: retreat during brighten → 0 damage).
- The ember is genuinely harmless for 2 turns — a safe window to reposition
  or strike.
- At dawn/midday it disperses instead of fighting ("Dawn touches it and the
  light gutters, thins, goes out. It was never meant for daytime.").

## Design notes for Steve

- It never moves once set — the horror is that the beautiful thing just sits
  there getting brighter while every instinct says *look closer*.
- The ember phase is the breather that makes the loop a rhythm instead of a
  meat grinder: brighten (fear) → bloom (pain) → ember (relief) → repeat.
