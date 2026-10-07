# Brawler playtest: the interrogation gap + two bug fixes (2026-10-07 ~12:00 CDT run)

Archetype 4 (brawler). Angle: **the brawler's interrogation** — a villager spreads
nasty gossip about you (seeded `theft` {honest:-15}, trust 5). The social route is
`confrontGossip` (backfired, dims worsened to -19). The brawler route should be
"take it back." Probe: `scripts/playtest-brawler-interrogate-20261007.js`.

## Design finding (for Steve): intimidation has no grievance context

`intimidate` is hardcoded to a food shakedown ("Your food. Now."). When you have a
real grievance — they're spreading lies about you — threatening them gets you
their lunch. The gossip dims never move ({honest:-19} start to finish); violence
never buys the retraction. The only reputation that moves is YOURS (new 'bully'
gossip {honest:-12}). Third threat: they snap and swing — the breaking-point
ladder works as designed.

The fiction non-sequitur is the problem: the player asked for a retraction, the
game staged a mugging. Two coherent designs: (a) when the target has active
negative gossip about the player, the demand becomes "Take it back" and a yield
damps the gossip dims — fear doing the work of honesty, still costing trust/heat/
bully-gossip; (b) keep violence truthless, but say so in the fiction ("This isn't
about food and they know it"). Currently it's neither — the game pretends you
wanted lunch. **Not implemented — Steve-call.** The brawler's signature social
lever is otherwise "take people's lunch," which is thin for the archetype.

## Bug 1 (fixed): snap/rage paths narrated cold-betrayal fiction

The intimidate breaking point (cornered snap) and the provoked-bold swing both
called `Game.npcBetrays(vid)`, whose fiction is calculated betrayal: "Not anger —
arithmetic" / "Nothing personal. I need what's in your pack more than you do."
A terrified cornered person does not do arithmetic; a provoked person is not
after your pack. Fix: `npcBetrays(vid, {reason})` — 'snap' (terror, no plan),
'rage' (fury, not math); default 'cold' unchanged. Both intimidate call sites
pass reason. Proof: `scripts/test-brawler-snap-fiction-20261007.js` (9/9).

## Bug 2 (fixed): five stale haven-coordinate checks

Haven moved to world tile (4,4) with `type === 'haven'` in the map rework, but
five checks still used the old coordinates — all now test the tile, never coords:
- `party.js` `betrayalOpportunity`: `px===3 && py===3` → backstabbers no longer
  stood down at home, and (3,3) (now a trail) was treated as haven. (This was
  failing `test-party`'s "opportunity zero at haven (witnesses)" — now 88/88.)
- `party.js` `lureCheck`: lures could fire at (3,3), never at haven.
- `perceive.js` stash display: stash readout never showed at haven.
- `carexplore.js` `tileFeature`: 'oldcamp' features could spawn on the haven tile.
- `game.js` `checkGenesis`: `(x===0 && y===0)` → the haven genesis crop never
  credited the pantry.
Proof: `scripts/test-haven-coord-20261007.js` (6/6). Sibling sweep done —
`grep` for `=== 3`/`tileAt(3` coordinate checks finds no other stale sites
(`carexplore.js:292` and `game.js:3091` were the last two; `app.js:13234`
already uses the tile-type form).

## Test-harness repairs (pre-existing, not game bugs)

- `test-betrayal-aftermath`: `freshGame` never cleared `Game.tbfight`, so section
  F crashed (`tbFighter('h_'+vid)` undefined after `playerAttacks` early-returned)
  — same leak class as the 2026-10-06 parallel-jest lesson. Section E used
  `tbPlayerMove`-to-edge to flee, but fleeing is `tbBarrierExit` (deliberate
  push-through; landing on an edge tile does NOT flee) — the test never invoked
  the real verb. Rewrote E around `tbBarrierExit`; 24/24.
- `test-perceive` §13 set `map.px/py = 3,3 // Haven` (stale test-side); updated to
  the haven tile.

## Pre-existing failures (not mine, not fixed — recorded)

- `test-perceive`: "known monster named", "animal hint" fail identically on
  pristine HEAD (verified in a clean worktree).
- `test-carexplore`: "examineCell records depth" fails on pristine HEAD;
  "comfortOptions has 5 approaches" fails only in the hot worktree because a
  sibling's uncommitted carexplore rework expanded comfort to 11 approaches
  (their feature, their test update — not touched).
- Sibling's uncommitted `party.js` renames `betrayalState(vid)` →
  `partyBetrayalState(vid)` (shadow fix); new tests avoid the name and work on
  both.

## Tree notes

Hot tree all run: HEAD moved 4 times (8e59176 → 5fef3d8 → 79ca1b5 → 00b3c36 →
f2eb878 → 66ea2d8). All commits via private-index route; sibling's game.js
hunk (ability-action damage hooks, 79ca1b5) verified present in my commit before
pushing — no clobber. Shared index still carries the stale f803404 version
fossil (left untouched per standing rule).

## Ship

Commit `1fe91df` (fixes + tests) pushed; version bump `de1f6a4`
(`00b3c36-20261007-175120`) pushed. Live verified:
https://steve-vitale.github.io/the-oversight/version.json serves the new build.
(Note: the old pkslayer123.github.io URL now 404s — rename complete.)
