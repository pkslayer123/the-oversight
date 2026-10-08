# Highbeam Deer Playtest Report — 2026-10-07

**Role:** Player. **Method:** Headless harness driving the real combat engine
(full production script list, sync combat path), 30+ full fights across 6
strategies. **Report only — no commits.**

TL;DR: The cadence is clean, the telegraph text is excellent, and the fight is
genuinely scary. But the core promise — "dodge the beam" — doesn't work.
Movement cannot reliably dodge the beam; the winning strategy is to stand
still and spam spear strikes, praying for a 50% disrupt RNG. Skill expression
is inverted: the intuitive play (dodge) loses 100%, the boring play wins 60%.

---

## 1. Combat cadence — CLEAN ✓

Verified across every fight: **player acts → deer acts → back to player.**
The deer acted exactly once per round in all 30+ fights. No skipped turns,
no doubled turns, no "already acted" stalls.

- Turn order at combat start: deer declares (aim), then player gets exactly
  one reaction turn before the first discharge. Correct.
- `tbPlayerEndTurn()` only fires when it's actually the player's turn
  (monster turns resolve inside `tbAdvance()`). No turn leaks.

## 2. Beam mechanics

### The telegraph (text) — EXCELLENT ✓
The player-facing text is dramatic and clear:
- Declare: `⚠ The Highbeam Deer's eyes lock onto YOU.`
- Windup: `💥 A ray of light lances FROM ITS EYES — MOVE`
- Sustained: `🔥 The beam HOLDS its line on you! (84)` / `the beam swings toward you`
- Disrupt: `💥 Your strike bites DEEP into the Highbeam Deer — the beam stutters and dies!`
- Death throes: killing it during windup holds it at 1 HP — "the light was already in its eyes" — the beam fires anyway. Killing it mid-fire has a 50%/25% disrupt chance.

### The beam-lane grid overlay — codex-gated (by design)
`encTelegraphKnown()` returns true only after you've **survived a full
discharge** or **slain it**. On first encounter: no lane, text only.
After learning: lane + fading ghost arc of previous ticks (the sweep is
visible, not teleporting). This is the "if you don't know, it doesn't show"
principle working as intended. I could not visually verify the overlay
headless, but the data feed (`telegraph.cells`) is correct.

### Dodgeable? — NO ✗ (the big finding)
The beam **tracks in real time**. From the code: "each tile is an action,
and during the firing phase the beam answers every step with a sweep tick
(action-locked)." The beam rotates up to 0.28 rad/tick toward your *current*
position, then checks the hit. You cannot "dodge between ticks" — there is
no between.

Test results (10 fights each, 120 HP, fire-hardened spear):
| Strategy | Won | Notes |
|---|---|---|
| Stand still, spam strike | **6/10** | Wins often close (1, 11, 39, 43 HP). Relies on 50% disrupt/round. |
| Circle consistently (3 tiles/rd) + strike | 0/10 | Dead in 4–5 rounds every time. Beam hits through movement. |
| Bounce-strafe (3 tiles/rd) | 0/10 | Dead. Reversing lets the beam catch up. |
| Pure dodge, no strikes | 0/10 | Can't win (no damage), can't survive 30 rounds. |
| Rush adjacent | 0/10 | Dead in 2 rounds. 112 beam + 14 antlers in one round. |

The one partial success: a full-speed consistent circle dodged an entire
6-tick discharge (0 damage) — but only by abandoning all offense, and the
beam caught up on the second discharge. Circling is a stall, not a kill.

**The math:** beam rotates 0.28 rad/tick toward you continuously. At fight
range (2–4 tiles), your 3 tiles/round of lateral movement is ~0.75 rad/round
— but the beam ticks *during* your move, so it spends its budget following
you step by step. You never build separation. The codex says "outrun it
sideways" — you can't.

### Fair? — BORDERLINE
- 60% win rate for optimal play is reasonable boss difficulty.
- But wins feel **luck-based, not skill-based**. The disrupt is a flat 50%
  per strike (spear ≥20 dmg). You stand still, trade, and hope.
- A player who reads the telegraph and tries to play well (move!) is
  punished. A player who ignores the telegraph and spams attack is rewarded.
  **This inverts the intended skill expression.**

## 3. Phase system — VISIBLE ✓

aim (1 round windup) → firing (6 ticks: 1 ignition + 5 damage) →
cooldown (2 rounds) → stalk → aim. All visible:
- The windup gives exactly one player turn to reposition (not enough to
  matter, given the dodge problem — but the *information* is there).
- Cooldown/stalk are real breathing room (observed 2-round cooldowns).
- The phase badge + text make the state unambiguous. A player always knows
  whether the beam is live.

## 4. Is it FUN? Scary? Fair?

- **Scary? YES.** 55–112 damage ticks against 120 HP. The "MOVE" callout,
  the hold-line ticks, the death-throes ("the light was already in its
  eyes") — this feels like a boss. The mantle transfer on death (my tester
  Megan Morelli died; Sofia Chen picked up the journal and kept writing) is
  a gut-punch in the best way.
- **Fun? MIXED.** The *fantasy* (dodge the sweeping eye-beams) is thrilling.
  The *reality* (stand still, spam strike, pray) is a slot machine. The
  50% disrupt RNG decides fights more than player decisions do.
- **Fair? BORDERLINE.** See above. The difficulty number is fine; the
  *agency* is wrong.

## 5. Bugs found

1. **Dodge-by-movement is non-functional (design bug).** The beam's
   action-locked per-step tracking makes lateral movement useless as a
   defense. Either the sweep rate needs to be lower than a committed mover's
   angular velocity (design doc claims "a committed lateral mover outruns
   it" — false), or the tick should resolve *after* movement completes, or
   the codex should stop advertising dodging as counterplay.
2. **Point-blank beam contradicts the codex.** Codex: "close in and break
   its aim — mind the antlers." Reality: adjacent = 112 beam + antler thrash
   = death in 2 rounds. "Close in" only works at spear range 2 (for the
   disrupt), not adjacent. The coaching is misleading.
3. **No bug in cadence, telegraph, phases, death/mantle, or knowledge
   gating.** All verified working.

## Verdict for Steve

The Highbeam Deer *presents* as a boss and *reads* as a boss, but it
*plays* as a DPS race against a coin flip. The single highest-leverage fix:
**make the beam dodgeable by a committed lateral mover** (reduce sweep
tracking vs. movement, or resolve ticks after the player's move completes).
Until then, the fight's skill ceiling is "stand still and hope," which wastes
the excellent telegraph work and the gorgeous sweep-ghost UI. The disrupt
mechanic is a good *backup* plan; it shouldn't be the *only* plan.
