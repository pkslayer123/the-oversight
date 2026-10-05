# service_mimic — beat capture

**How this was captured:** text output of a node simulation driving the real
combat engine (`src/js/game.js` + `src/js/encounters.js`) — the same `say()`
lines a player sees in the combat log. No live browser was used; there is no
screenshot, only the rendered text. Spawn: night (dayPart 3). Policy 1:
retreat during the watch, then stand. Policy 2: campfire between player and
mimic.

**The encounter:** phases `watching → dialing → hold`. It spends 2–3 turns
being excruciatingly polite (no attack at all). Then, with NO telegraph —
that's the whole point — it rushes at speed 5 and hits for 18–28. Dodge it
once (don't be there) and it doesn't chase: it plays hold music, waits 2
turns, and the cycle restarts. Fire within 3 tiles of you breaks its script
entirely.

---

## First sighting (the politeness)

> "Hello? Are you still there?" It's watching. It's always been watching.
>
> "Your call is very important to us." The voice is syrup. It hasn't blinked.

Two to three turns of escalating customer-service pleasantries. No attack.
The tell is the curiosity: it never blinks, and the script escalates.

## The telegraph (there isn't one)

> "Please hold while we connect you to—" The voice cuts out. It's moving.

No ⚠ line. No warning. The mid-sentence cut IS the tell — and by the time you
read it, it's already moving at speed 5.

## The climax (the rush)

Retreat during the watch and it finds nothing:

> It rushes — and finds only empty air where you were. The line goes quiet.
>
> Hold music plays from somewhere in the dark. It isn't moving. It's waiting
> for you to come back.
>
> "Thank you for holding." The line clicks. It's watching again.

Stand still and it lands:

> Something is right behind you, and a syrupy voice says: "Your fear is
> important to us."
>
> a voice in the dark: 'thank you for calling. your fear is important to us.'
> hits you for 18.
> 📖 Codex: Please Hold — gives no warning — it just moves and hits. You won't
> forget this.

After surviving, the codex names the trick for next time:

> No telegraph — it just moved. Please Hold gives no warning. Watch for the
> curious stance, and don't be standing there when the script ends.

## The counterplay (fire)

> "We're sorry, but we're experiencing..." The script breaks. It can't do this
> near fire.

With a campfire within 3 tiles of the player, it never dials — the whole
fight stays in `watching` and the rush never comes.

## What the sim proved

- Zero ⚠ telegraphs across the full fight (asserted in tests) — the rush is
  genuinely unannounced.
- The rush whiffs if you're not there; it does NOT chase or re-rush — it
  resets to hold for 2 turns.
- It closes at speed 5, so once the script ends you can't outrun it — you
  have to not be there.
- Fire suppression works: 6 rounds, never left `watching`.

## Design notes for Steve

- The horror here is bureaucratic: the most dangerous thing it does is put
  you on hold. The whiffed-rush reset ("waiting for you to come back") is the
  scariest beat — it's patient.
