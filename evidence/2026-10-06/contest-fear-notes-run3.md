# Contest fear/fun playtest — run 3 (2026-10-06)

Played 3 contests END-TO-END as a player via `scripts/play-contest-fear-3.js`
(full transcripts). Run 1 covered pit, maw, riddle, confession, honey,
secrets; run 2 covered gauntlet, hide (watch), oath. This run: SIEGE, STARVE,
DUEL (+ REFUSE path + forced death). 29 audit/regression asserts green;
all prior contest suites still green (29 + 812 + 48 + 52 + 27 + 143 + 685).

## Verdicts

### SIEGE (extreme, wave-3-gated, grabbed player) — FEARED ✓ / FUN ✓
- Smart play (fortify → fall back → drop the fence): won at 68 HP. Reckless
  play (taunt → head-on → hold): won at 22 HP. Barely surviving feels earned.
- Forced-death run: bespoke death line renders —
  "The chokepoint held. You didn't. The village rings the bell anyway —
  because the line held, because they were the line." Contest-specific,
  works for player and villagers.
- Best fear beat: the village watching from the walls is woven into every
  phase ("Someone on the wall is screaming your name"), not just set dressing.
- Prize path verified: winning now grants knowledge-gated loot
  ("The System presses something humming into your hands: Starfall bow...
  The deer never hear it.") — was missing before this run's fix.

### STARVE (endurance template) — playable ✓, fear is slow dread
- Full natural flow played: fireContest on day 15 (announced by name +
  chosen + arena, 1-day countdown), resolveContest day 16 → interruption →
  choice phase → participate → all 3 phases → win.
- Fear here is attrition, not damage — good variety. Steal-a-sip-of-broth
  grants 'heist' notability (theft is social, not mechanical ✓).
- Won with a prize after the fix — before, template wins paid nothing.

### DUEL — REFUSE path ✓
- Choice phase renders Participate/Refuse; Refuse is a played sequence:
  "NOTED... THE AUDIENCE WILL REMEMBER THE COWARDICE. OR THE PRINCIPLE.
  WE HAVEN'T DECIDED." +5 trauma, showmanship notability, modal clears.
  Skipping isn't a thing — refusal is content.

## Bugs fixed (src/js/contests.js only)

1. **Bug class: prize-less wins in category templates.** Every bespoke
   contest WIN choice carries `prize: true` (alien-loot prize path), but all
   12 WIN choices in the 6 old category templates (endurance, moot, weird,
   puzzle, detective, forage) were missing it — winning paid nothing but
   "the System's favor." Siblings fixed: all 12. Intentional exceptions:
   tithe 'Offer your name instead' (you traded your name) and confession
   'Accuse the System' (survival is the prize) — asserted in test 8.
2. **Sibling: watch-mode veteran coaching existed only for tithe/riddle.**
   Added gated `knows` coaching lines to the other 7 wave-2+ watch beats
   (siege/maw/oath/beastmaster/confession/honey/secrets). First-timers see
   nothing (asserted — no leaks).

## Audit holds (asserted in scripts/test-contest-fear-3.js)
- All 27 contests: bespoke watch beats (3 each), bespoke death lines,
  coaching lines — none fall back to generic.
- Knowledge gating holds: tithe measure / riddle last-riddle / confession
  coaching all hidden from first-timers, revealed at codex level 2.
- Frequency cap: budget-exhausted tick → null; week rollover resets.
- One interruption at a time: tick → null while pending or unresolved.
- RECAST: dead villager contestant overnight → show recasts from living.
- Hardened variant: announced scaling == played scaling.
- Eligibility: pre-14 locked with day-14 reason; exiled player excluded.

## Design gaps (not fixed, out of scope or Steve-call)
- `participants` count on contest defs is never read — only ONE participant
  is ever taken, even for lottery (5) or drop (3). Fiction says "four of
  you," the code takes one. Works, but the fiction hole is visible.
- Watcher choices (cheer/shout advice) are flavor-only, don't touch verdict.
