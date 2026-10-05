# contract_golem — beat capture

**How this was captured:** text output of a node simulation driving the real
combat engine (`src/js/game.js` + `src/js/encounters.js`) — the same `say()`
lines a player sees in the combat log. No live browser was used; there is no
screenshot, only the rendered text. Spawn: midday (dayPart 1). Policy 1:
stand in range, then walk away. Policy 2: attack with a pitch torch.

**The encounter:** phases `unfold → clause → bound`. Speed 1 — it barely
moves. Standing in range 3 for one consecutive turn gets you a clause
warning; a second consecutive turn and the Binding Agreement is declared
(undodgeable, 20–30). Leaving range resets the clause entirely. It never
flees. Torch hits do triple damage — it's paper.

---

## First sighting

> It unfolds — paper and ink and fine print, spreading across the ground
> toward you. So slowly. One tile a turn.

## The telegraph, part 1 (the warning — ungated)

> "SECTION 7, SUBSECTION C..." Small text crawls up your legs. You can feel
> the clauses tightening. You should move.

One free warning. The game tells you to move. If you don't:

## The telegraph, part 2 (the binding — ungated)

> ⚠ "BY REMAINING IN PROXIMITY," it rustles, "YOU HAVE ACCEPTED." The fine
> print tightens around you.
>
> 💥 a drift of paper, moving against the wind's Binding Agreement finds you —
> no dodging it.
> a drift of paper, moving against the wind hits you for 20.
> 📖 Codex: Binding Agreement — locks onto one target — moving won't dodge it.
> You won't forget this.
>
> The ink dries. The pages settle. It begins unfolding again — there is always
> more fine print.

After surviving, the codex-gated cue adds the coaching you earned:

> ⚠ "BY REMAINING IN PROXIMITY, YOU HAVE ACCEPTED." The agreement binds — no
> dodging it now. (You could have walked away. It moves one tile a turn.) You
> know this one: Binding Agreement locks onto one target — moving won't dodge
> it.

## The counterplay (just walk away)

> The text loosens as you leave its reach. Proximity was the whole contract.

Leaving range 3 resets the clause counter to zero and drops it back to
`unfold`. The entire fight is a lesson in walking away from bad terms.

## The other counterplay (fire)

> You STRIKE the drift of paper, moving against the wind for 21 (Pitch torch).
> It's paper. The torch does what torches do.
> You hit a drift of paper, moving against the wind for 63.
> "SECTION 7, SUBSECTION C..." Small text crawls up your legs. You can feel the clauses tightening. You should move.
> ⚠ "BY REMAINING IN PROXIMITY," it rustles, "YOU HAVE ACCEPTED." The fine print tightens around you.
> You STRIKE the drift of paper, moving against the wind for 17 (Pitch torch).
> It's paper. The torch does what torches do.
> You hit a drift of paper, moving against the wind for 51.
> The drift of paper, moving against the wind falls.
> Do not eat the contract. (+1 cuts, 1.0 Mcal)

Torch hits land at ×3 (17→51, 23→69). It died in two torch strikes. (The
edibility note is in the fiction: the paper is technically edible. The game
advises against it.)

## What the sim proved

- Phase order: unfold → clause (warning) → bound (declared, undodgeable hit)
  → unfold.
- Standing in range 2 turns: bound both times, 20–30 per hit.
- Walking away: clause resets, phase returns to unfold (asserted in tests).
- It never flees (fleeAt 0) — but at speed 1 it never needs to; you do the
  leaving.
- Torch ×3 confirmed: 20 base → 60 dealt.

## Design notes for Steve

- This is the only fight in the batch where the optimal play is literally
  leaving. The dread is contractual, not physical — the horror is that you
  *agreed* by standing there, and the game told you so.
- The "Do not eat the contract" line is doing a lot of work for one sentence.
