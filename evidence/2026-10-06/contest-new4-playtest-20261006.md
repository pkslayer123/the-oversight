# Contest small-pool expansion — run 4 (2026-10-06)

Played 4 NEW bespoke contests END-TO-END as a player via
`scripts/play-contest-new4-20261006.js` (full transcripts, rigged RNG).
77/77 asserts green. Prior suites still green:
`test-contests-20261006.js` 1958/1958 (now covers all 34 contests, every
choice index, death paths, refuse path, watch verdicts).
`test-contest-fear-2.js` 27/27. `test-contest-fear-3.js` 28/29 — the 1 fail
is a STALE hardcoded assertion in that sibling-owned file ("pool has 27
contests"); the pool is 34 now (30 after 11e9cea + 4 new). Not my file to
fix; flagged for the owning worker.

## New contests (smallest pools: puzzle/detective/forage/chance were 3 each)

### THE SORTING (puzzle/high) — FUN ✓ / FEARED ✓
Conveyor triage: the System's sorter keeps the shiny, burns the dull-useful.
Smart play (save dull roots → body-block the belt → spare the medicine):
won, village eats. Greedy play (save the singing bauble, let the tithe crate
burn): −300 kcal, village remembers. NOT riddle/box/pattern: the mechanic is
triage-under-time with real food on the belt. Knowledge-gated: veterans know
the sorter keeps what shines; first-timers can still reason it out (roots
smell like medicine) — blind is honest. Best line: "bodies aren't in the
manual."

### THE WITNESS (detective/high) — FUN ✓ / FEARED ✓ (best of the four)
Three trap-line accounts, one written by the System. The tell is behavioral:
the fabricated hushwolf "screaming the whole way" — hushwolves never scream,
Silent Rush gives no warning. Level-2 intro coaching names the seam; level-0
gets only "something about the screaming bothers you." Pressing the true
witnesses bruises them (trauma 3); pressing the fabrication makes it repeat
word-for-word and smile wrong. Correct naming: System admits it, village arms
right. Wrong naming: fracture + "the real thing walked in through the
unguarded treeline." NOT informant/confession: forgery-forensics vs the
System as forger. Witnesses are drawn from the live roster (unique-person
law), fallback Mara/Tove/Sef.

### THE CACHE (forage/medium) — FUN ✓ / FEARED ✓
Night heist vs the dawn audit: move the winter store, every caught move taxed.
Decoy path (kids → sacrifice a decoy → present the empty decoy field): "The
real winter store sleeps under the old chapel floor, unmapped." Tax path:
−400 kcal, "the village will eat thin this winter." NOT calorie_run/pantry_raid/
honey: hiding, not gathering. Best line: "Somewhere, a surveyor logs a
victory."

### THE LONG ODDS (chance/medium) — FUN ✓ / FEARED ✓
Dice vs Vex of the Ninth Ledger ("a smile like a tax form"). Push-your-luck:
stake a memory (oath-echo — "It takes the summer afternoon"), double down,
all-in (real 6% die roll) or fold with dignity — refusal-inside-the-
unavoidable is a played sequence. NOT wheel/lottery/secrets: the dice are
fair, the STAKES are the game. Knowledge-gated: veterans know the champion
reads hesitation.

## Audits (all asserted in the harness)
- Knowledge gating: all 4 intros show zero 📚 at level 0; explicit coaching
  at level 2 (sorter rule / hushwolf seam / decoy pattern / hesitation read).
  Watch-mode coaching lines gated the same way. Prize path uses the
  established knowledge-gated alienLootGrant (no loot-stat leaks).
- Audio: 4 new named beats (contestSort/Witness/Cache/Dice), each a composed
  dispatch over registered Game.audio synths (lazy-registered on first fire —
  Game.audio doesn't exist until app.js loads after contests.js). Harness
  stubs the registry and asserts all 4 resolve + every ingredient fired.
  Zero silent.
- Run-3 bug class re-checked: every WIN choice in all 4 carries prize:true.
- One-screen: longest new phase text 694 chars, ≤4 choices/phase — dialogue-
  box safe at 390×844.
- Watch mode: all 4 have contest-specific setup/turn/end beats (never the
  generic fallback); verdicts resolve; veteran coaching gated.
- Regression: all 34 contests have bespoke watch beats, bespoke death lines,
  and level-2 intro coaching.

## Verdicts
All four are playable and enjoyable with completed beat structure. The
Witness is the standout — the seam-reveal is a genuine lateral-thinking
payoff that rewards codex knowledge without gating first-timers out of
playing.
