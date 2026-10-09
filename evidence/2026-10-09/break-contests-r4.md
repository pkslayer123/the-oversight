# break-it: CONTESTS round 4 (2026-10-09)

Target: contest system. Hostile-player attack. 4 kills, 5 held/documented.
Proof: `scripts/test-break-contest-20261009-r4.js` — 32 checks, green x3 seeds
(909090, 1234567, 777). Before-fix run: 12 fails (the breaks below).
Regression: `test-break-contest-20261009.js` 76/76, `test-break-contest-20261009-r3.js`
22/22, ontology gate green (51/51).

Canon: docs/CANON.md + docs/CONTESTS.md read first. One canon divergence
found (viewership rank gate) — documented for Steve, NOT redesigned.

## KILLS

### F1 — DUEL "PLAYED NOT RNG" VIOLATION (the big one)
`contestEngine.js` — `contestResolveVillager()` on a duel returned a canned
`{outcome:'lost', detail:'duel needs a partner'}` — no fight, no process.
Fired in two live paths:
- `_contestResolveOthers` (contests.js): when the player is taken for a duel
  with villager co-takers, each co-taken villager auto-lost their duel.
- `_contestVerdict`: single-villager watch-mode duel auto-lost.

The comment directly above the `_contestResolveOthers` call claimed "their
arena ran the real engine too — fights fought, cases argued". A canned loss
is exactly the RNG-as-outcome-resolution Steve banned (2026-10-08).

Fix: `_cxDuelPartner` casts a sparring partner from the living roster
(alive, member, fighting age 15-72; never self, never the player) drawn from
the seeded stream under `_cxWithSeed` — never Math.random — so the
determinism contract holds. `_cxDuelSingle` runs the REAL `duelFight` and
maps the outcome from pid's perspective; wounds land on BOTH duelists via
`hurtVillager`; a dead partner is removed via `_cxKillContestant` and
gossiped about (nothing silent). No partner on the roster → honest
`'no partner — forfeit'` with a said-aloud log line, never a silent loss.
Also added a liveness guard in `_contestResolveOthers`: an earlier fate in
the same loop can kill a later contestant (duel partner casting) — the dead
don't fight their own duel afterward.

### F2 — CHEER-TO-DUELFIGHT WIRING LIE
The code comment claimed cheer "now reaches duelFight" (break-it 2026-10-08).
`_cxBlood` did map `cheerBonus → braveryBonus`, but the GROUP duel branch
(`contestResolveGroup`, pids>=2) passed `opts` straight through — and
`duelFight` reads `opts.braveryBonus`, while watch paths send `cheerBonus`.
The cheer was silently dropped in every watch-mode duel. Verified with a
wrapped-duelFight harness: `braveryBonus=undefined` before, `=15` after.
Fix: `{ braveryBonus: opts.braveryBonus || opts.cheerBonus || 0 }` in the
group duel branch and in `_cxDuelSingle`. The comment now says what the
code does.

### F3 — ELIGIBILITY vs CANON: gravely wounded were draftable
docs/CONTESTS.md: ineligible = "the gravely wounded, the very young/old, and
anyone currently exiled". `contestEligible()` had NO villager health gate —
a villager at 5 HP was draftable. Fix: villagers at <=20 HP are excluded.
20 HP is the engine's own survival floor (drop/starve reserve) — at or below
it you're not a contestant. Battered-but-standing (21+) stays eligible —
the System is not kind (matches the existing player-gate comment).

### F4 — DEAD CODE: `state.lastContestDay`
Written in `_contestEnd` and `_contestVerdict`, read NOWHERE (grep across
src/js + app.js + docs). Fear pacing already lives in the ratings-driven
scheduler + 2/week budget — nothing needed it. Removed both writes. The
round-1 proof test's `lastContestDay stamped` assertion updated to pin the
removal.

## HELD / DOCUMENTED (attacked, resisted — deeper level)

- **Phase integrity**: harness runs `contestPlayable` for all 44 pool ids —
  non-empty phases, >=1 choice per phase, every numeric `next` in bounds,
  every string `next` in {WIN, LOSE, DIE, REFUSE, VERDICT, MOOT_JUDGE,
  MAW_JUDGE} — plus the choice-prepend +1 shift path the player actually
  sees. No empty-phase softlocks. Watch phases: 3 intact phases x44.
- **Watch beats**: all 44 contests have bespoke `_contestWatchBeat` entries —
  the recon's "missing beats" sub-lead was already fixed (ontology header
  `watch_beats_specific`); verified, not just trusted. `_contestGeneric`
  unreachable by any pool contest (30 id-builders + 7 cat fallbacks cover
  all 44).
- **`_cxChance`**: documented rigged theater — deterministic from real
  state (viewership trend), rigging said aloud in `detail`. Not a hidden
  table; honest fiction. Held.
- **`_cxOther`**: stat-driven structured resolution, no rolls. Held.
- **Blood kills real**: fragile villagers (12 HP) die in the pit across
  seeds (fear honest — death on the table); `_cxKillContestant` actually
  removes from the roster. Held.
- **Sibling sweep**: `alienPlayers.js` has no "needs a partner"-style canned
  contest returns. The `_cxDuelPartner` exclusion rule (never the player)
  prevents the player's off-screen double-dip.

## FOR STEVE (design calls — documented, not decided)

1. **Viewership rank gate (canon) vs notability-weighted casting (code).**
   docs/CONTESTS.md says viewership rank is "the primary gate. Top ~20% per
   challenge". Code: casting is notability-weighted, never reads
   `viewershipBoard()` (ledger.js — zero callers). Rewiring casting to the
   rank gate is a redesign, not a bug fix. Left alone; the eligibility panel
   shows what the code actually computes. Your call whether canon or code
   moves.
2. **Player health gate divergence.** The player is eligible at any
   health>0 ("The System is not kind" — deliberate, documented in code),
   while canon says the gravely wounded are ineligible. Villagers now
   follow canon (<=20 HP out). If the player should too, say so.
3. Threshold note: 20 HP ("gravely wounded") is my call, anchored to the
   engine's endurance survival floor. Easy to move.
