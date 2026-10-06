# Feel-playtest: 4 new contest styles (price / impress / exchange / auction)

Date: 2026-10-06. Commit d0a4870's new styles, played as a PLAYER (20 runs:
14 player branch paths incl. win/lose/death/refuse, 6 watch-mode incl. veteran
knowledge gates). Driver: `scripts/play-contest-newstyles-20261006.js`,
transcripts: `contest-newstyles-feel-20261006.json` (same dir).
Proof test: `scripts/test-contest-newstyles-20261006.js` (53/53 green).

## Player runs summary
price: won (volunteer path, deflect path), lost (defiant path), died (walk-up),
  refused (given the choice). impress: won (grief), lost (silence), died
  (double down). exchange: won (sprint), lost (fall short), died (shortcut).
  auction: won (everything), lost (walk away), died (bluff).
No stuck states, no dead ends, no errors across all 20 runs.

## Feel verdicts

**The Price (moot/extreme) — the strongest of the four.** Social horror that
works as mechanics: you commit to a stance (volunteer / silence / deflect)
BEFORE the envelope opens, and the fiction resolves consistently. The dread
is in the commitment, not RNG theater. Risk is legible before committing
("Almost nobody walks away from this one"). Every win costs something real:
volunteer path = die 0.35 then die 0.25 + trauma 15; deflect-survive path =
fracture 2 + trauma 10. Fun: yes. Scary: very — "Take it, if chosen" is the
best single beat in the batch.

**Impress Us (weird/medium) — the funniest writing in the batch.** The
seizure-laughter joke and the "LONELY" reveal land. Safest contest (tiny die
odds) — it is the breather, and that's fine. The lose path ("Nothing more")
reads almost like a win ("the refusal is its own performance"), which suits
the fiction: restraint, rare. Costs are emotional (grief = trauma 12, "costs
exactly what you thought it would"). Meaningful choices: yes.

**The Exchange (endurance/high) — solid sports drama.** Leg choice
(first/middle/anchor) + mid-race tactics + final leg, each with distinct
physical costs (dmg + kcal). The nest shortcut ("They let you pass — this
once, for the cameras") is genuinely scary (die 0.18). Gray Hollow exists
only in contests.js, but the System introduces them — reads as world-
building, not a leak. Lose path keeps dignity ("you ran like a legend").

**The Auction (chance/high) — the cruelest show, sharpest risk/reward.**
"ALL BIDS ARE FINAL. ALL BIDDERS PAY." is the most legible cost in the
batch. Bid memory (trauma 8) / years (NOW trauma 10 — was free, fixed) /
finger (dmg 8-14): real costs for real currency. "Everything bid so far is
already gone — paid, taken, consumed" is the most dread-inducing line in
the batch. The final trio (Everything / smart bid / walk away) is a real
cost-benefit choice.

## Bugs found and fixed (all in src/js/contests.js)

1. **Silent audio beats (missing hooks).** Phases declared
   beat:'contestPrice'/'contestImpress'/'contestExchange'/'contestAuction',
   but CX_BEAT_DEFS had no entries — `_cxBeat` silently no-opped, violating
   the beat_audio rule ("every contest beat fires a named audioEvent that
   resolves"). Added composed dispatches over already-registered synths:
   price = justiceVerdict+exileWalk (the verdict, then receding footsteps);
   impress = levelup+contestSpared; exchange = contestCall+rushHit;
   auction = contestCall+horrorSting.

2. **Watch mode showed generic filler.** `_contestWatchBeat` returned null
   for all 4 → the fallback ("it's going badly. Or well. It's hard to tell
   through the lights.") played for a televised village VOTE — off-fiction
   and a doctrine violation ("no contest in the pool should ever reach it").
   Added bespoke setup/turn/end + veteran knows-lines for all 4. Verified
   38/38 pool contests now have specific beats; no pool contest reaches the
   generic fallback.

3. **Death lines fell back to category lines.** price (cat moot) got moot's
   line, including mid-sentence "verdict on You". Doctrine: every contest
   kills in its own voice. Added 4 bespoke death lines; 38/38 bespoke now.

4. **Auction 'Bid years' cost nothing.** `do: { dmg: [0, 0] }` — the fiction
   calls years "the serious currency" but the choice was mechanically free
   (choice-that-does-nothing class). Now `trauma: 10` — the heaviest bid,
   as the fiction promises.

Sibling check: sorting/witness/cache/longodds (the previous bespoke batch)
already had all three (beats/deaths/audio) — the gap was specific to the
newest 4. Pre-existing, out of scope: test-contest-watch-beats.js still
asserts "pool has 27 contests" (stale from d0a4870's 38-contest expansion;
1035 other assertions pass) — not touched, not mine. Minor wart left alone:
the generic interruption line "You — you're grabbed" (pre-existing text).

## Knowledge gating verified
- First-timer intros show no 📚 coaching; level-2+ intros do (auction
  verified). Watch beats: first-timer sees no knows-line; level-2 veteran
  gets one (price verified). No leaks observed in any transcript.

## Verdict
The batch is now at Highbeam Deer level: distinct telegraphs, arena
visuals, 3-phase systems, resolving audio beats, codex-gated coaching in
both player and watch mode, fiction-sensible risks, distinct behavior per
style. Nothing blocking; no further deepening needed this run.
