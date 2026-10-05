# voice_mimic_radio — beat capture

**How this was captured:** text output of a node simulation driving the real
combat engine (`src/js/game.js` + `src/js/encounters.js`) — the same `say()`
lines a player sees in the combat log. No live browser was used; there is no
screenshot, only the rendered text. Spawn: night (dayPart 3), player vs the
mimic, scripted player policies.

**The encounter:** phases `call → approach → reveal`. It cries in a voice you
know. Walking toward it feeds the lure; holding your ground starves it. Two
turns of resistance breaks the act — and what's underneath is worse.

---

## First sighting (the lure)

> Crying, somewhere in the trees. It sounds like a woman, maybe 60s. They are supposed to be safe at the haven.
>
> "Please... is anyone there?" sobs the dark, in a voice like a woman, maybe 60s.

No name. No stats. Just someone who shouldn't be out here, in a voice picked
from the people you know. The counterplay is the opposite of every instinct:
**do not go toward it.**

## The telegraph (ungated — diegetic)

> ⚠ A voice you know is crying your name in the dark. It sounds exactly like
> a woman, maybe 60s. It is not a woman, maybe 60s. Distress Call is coming —
> and moving won't help once it has your voice.

Once declared, the Distress Call cannot be dodged — the cue says so plainly.
The dread isn't the damage, it's that you walked closer yourself.

## The climax (the reveal)

Hold your ground for two turns and the act breaks:

> You don't move. The crying stutters... fragments... stops. Silence — then a
> small, furious crackle of static. It's a radio. It was always a radio.
>
> ⚠ The radio SCREAMS — no voice left, just noise and fury. Distress Call
> incoming. No dodging it.
>
> 💥 crying in the dark — a voice you almost recognize's Distress Call finds
> you — no dodging it.
> crying in the dark — a voice you almost recognize hits you for 16.
> 📖 Codex: Distress Call — locks onto one target — moving won't dodge it.
> You won't forget this.

Revealed, it fights honestly — and takes hits badly (1.5× when exposed).
After surviving, the codex appends the tactical suffix to every future
telegraph:

> ⚠ The radio SCREAMS — no voice left, just noise and fury. Distress Call
> incoming. No dodging it. You know this one: Distress Call locks onto one
> target — moving won't dodge it.

## What the sim proved

- Policy A (walk toward the crying): lure builds, it closes in, 13 telegraphs,
  player down to 19 hp — the bad decision, punished.
- Policy B (hold ground): the act breaks in 2 turns, reveal, player ends at
  120 hp — the counterplay works and is legible.
- The true name ("Static") never appears in any line before the codex names it.

## Design notes for Steve

- When no villagers are in the fight it cycles stolen voices at random each
  turn — kept intentionally; the fiction says "It learns new voices" and the
  cycling reads as the mimic rifling through its collection.
- The crying voice is drawn from the threat queue / nearby roster when
  available, so it can sound like someone actually in the fight with you.
