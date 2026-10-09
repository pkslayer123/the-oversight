# Break-it: CONTESTS system — 2026-10-09 (round 3)

Target: contests (system 4), new surface only. Prior rounds covered: arena
re-fire, terminal double-claim, moot walk-out prize, villager-win pantry cap,
notability-weighted lead casting, countdown/2-per-week/unavoidability, engine
determinism, played-not-RNG, fear honesty (evidence/2026-10-09/break-contests.md,
commit 7ef1946). Do NOT re-attack those.

## Attacks attempted

**EXPLOIT**
- E1 double-dip: can the player participate AND collect fan-favor/watch rewards
  (cheer/bet/favor/package) for the same contest?
- E2 care-package farm: apCarePackage on every player win — self-sabotage cheap
  contests into favor + packages?
- E3 recast: dead player's mantle re-entry — reward vacuum or phantom cast?
- E4 save-scum tilt: what mutates state between prediction and resolve
  (cheer spam, injury injection) to tilt the deterministic engine?
- E5 prize table: player-win `rollAlienLoot({chance:1, tier:wave})`.

**SOFTLOCK**
- S1 contest fires while another modal open (conversation/tent/challenge
  countdown) — modal stack resolve or wedge?
- S2 countdown vs player death / village exile mid-countdown (recast path).
- S3 Maw/pursuit during travel — chase across nodes or freeze?
- S4 contest during day-7 System arrival.

**HONESTY**
- H1 hardened variant: announced "It's worse now" — is it mechanically worse,
  at fire AND at resolve?
- H2 eligibility roster display vs actual cast (whim/recast announced?).
- H3 reward copy vs grants (share math, prize amounts).
- H4 "the grab comes at dawn" timing.
- H5 fan-favor/audience-boon copy vs delivered effects (winMod numbers).
- H6 cheer cap copy vs engine (0.15).

**DEAD-CODE**
- D1 all 44 pool contests: playable builders vs _contestGeneric fallback;
  watch-beat table coverage; death-line coverage; phase-beat resolution.
- D2 wave gates vs 2/week budget: can extreme/gauntlet/siege ever fire?

## What broke (3 fixes, all src/js/contests.js)

1. **Hardened variant dropped at resolve (HONESTY).** `_contestVerdict` and
   `_contestResolveOthers` refetched the pool BASE contest, so watched
   villagers resolved at base risk even when "HARDENED VARIANT — you've seen
   this before. It's worse now" was announced — and every end path
   (`_contestEnd`/`_contestDie`/`_contestRefuse`/`_contestArenaAfter`) said
   "The Pit" after announcing "Hardened The Pit". Fix: `_cxScaledContest(ac)`
   helper — re-resolves from `ac.variant` at every end path. Proof F1a–F1d:
   BEFORE engine got risk=high/name="The Pit"; AFTER risk=extreme/
   name="Hardened The Pit".
2. **Hardened was a paper tiger for the player (HONESTY).** No phase builder
   reads `variant` (only moot demand reads risk), so hardened changed nothing
   mechanically on the participate path; arena beasts were unscaled too.
   Fix: phase damage x1.25 at the single `contestChoose` choke point; arena
   beasts drafted one wave hotter when hardened; hardened prize rolls hotter
   (0.75). Proof F2a: BEFORE [4,4] dealt 4; AFTER 5. F2b: BEFORE 0/200 wave-2
   drafts; AFTER >0/200, normal path 0/200.
3. **Prize table was a guaranteed apex hose (EXPLOIT/economy).** Player-win
   prize was `rollAlienLoot({chance:1, tier:wave})` — the forbidden wave→tier
   conflation in code, and a GUARANTEED tier-4 (apex) item on every wave-4 win
   (genesis_seed = 5000 kcal, starfall_lance, searcaster) vs 12% off an actual
   apex-monster kill. Fix: real drop table — 60% chance of alien loot (75%
   hardened), loot tier capped at 3, tier 4 only at 25% for extreme-risk wins
   at wave 4 — hardest challenges, on their own terms. A whiffed roll now
   says so aloud ("The vault was feeling shy tonight") — the old code would
   have silently pocketed the prize. Proof F3: BEFORE {chance:1,tier:4}
   200/200; AFTER chance 0.6/0.75, tier-4 rare, never above 4. (Judgment call
   for Steve to overrule: exact rates.)

## What held (documented, not failures)

- **No double-dip**: cheer/bet/study are watch-phase-only; participate phases
  carry none of those levers (asserted). Favor +4 (player win) and care
  package can't combine with bet payouts — different paths.
- **Care package not farmable**: favor>=20 gate, 1/4-day cooldown, 2/week
  contest budget, and the player can't choose to be cast. Winning is the farm
  and winning is the risk.
- **Save-scum tilt closed**: engine reseeds deterministically from
  (day, contest, pids, stat snapshot); cheer is a capped (0.15) designed lever,
  not a hidden mutation; no prediction is shown before the verdict.
- **Modal stacking**: contestTick refuses to fire while pendingContest or an
  unresolved activeContest exists; the sleep loop wakes with a start on
  activeContest (no dawn accounting under the cameras); the contest modal owns
  the narration surface by design ("unavoidable").
- **Maw**: modal tunnel fiction, no location/map state — nothing to chase or
  freeze. **Day-7 arrival**: contests unlock day 14 — no overlap. **Exile/
  death mid-countdown**: recast path held (round 2).
- **Eligibility display**: panel driven by the same `contestEligible()`;
  whim and recast both announced aloud.
- **"Grab at dawn"**: firesDay = day+1, resolved in the dawn routine — honest.
- **Fan-favor copy**: chant/boo lines map to winMod ±0.08, consumed as
  cheerBonus/cheerLift in the engine (verified in contestEngine.js).
- **Dead code**: none. All 44 have bespoke watch beats AND bespoke death
  lines; all 66 declared phase beats resolve in CX_BEAT_DEFS; 31 bespoke
  playable builders + 13 via the playable generic fallback; wave gates
  reachable (wave 2: day 8 + 4 kills; wave 3: day 25 + 8 w2 kills; contests
  start day 14; extreme needs wave 2, gauntlet/siege wave 3).

## Proof

- `scripts/test-break-contest-20261009-r3.js`: 22/22 green × 3 seeds
  (424242, 777, 20261009). BEFORE run (fix stashed): 8/22 — the 14 failures
  are exactly the 3 fixed bugs.
- Regressions: `scripts/test-break-contest-20261009.js` 76/76 green;
  `scripts/test-break-contests.js` 65/65 green; `validate-ontology.js` 50/50.

## Sibling sweep

- Other `rollAlienLoot` callers: monster kills use data-driven `mdef.loot`
  tiers; betrayal.js uses fixed `{chance:1, tier:1}` — no wave→tier
  conflation elsewhere.
- `contestPool().find` refetch sites: all 6 end-path sites now go through
  `_cxScaledContest`; the remaining one (contestLearn codex name) keys by id
  and is display-only.
- alienPlayers.js `apContestInterference`: bounded (rig 1/5d + 40%,
  lifeline 1/7d + bond>=2 + 40%, favor ±0.08) — no same-class bug.
- drama.js 'contest' channel: render-only, N/A.
