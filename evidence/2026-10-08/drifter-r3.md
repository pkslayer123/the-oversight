# Drifter adversarial r3 — playtest loop (2026-10-08 ~18:45 CDT)

Archetype: drifter (rotation 8 → 0). Worktree: playtest-drifter. Proof: scripts/test-drifter-round3.js (27 checks, green × 3 seeds; every attack assert failed pre-fix as designed).

## BROKE 5, fixed 5 — plus 2 HELD

**CATCH 1 (SOFTLOCK, shipped): wild-camp villageMeal TDZ crash.** Commit 4960fe7 (parity hunt, today 15:32 CDT) added `v.lastPlayerMeal = 0` in the camp-wild branch, but `const v` was declared ~30 lines below → `ReferenceError: Cannot access 'v' before initialization` on EVERY night spent off the haven tile. endDay calls villageMeal unguarded, so the day never advanced — a shipped softlock. Also crashed the existing test-drifter-joinstay.js suite on pristine (it could never run). Fixed by hoisting `const v` to the top of villageMeal.

**CATCH 2 (EXPLOIT, economy): joined village fed the player twice a day.** joinVillageReal does `population += 1`, so simVillageDay's collective draw (`need = population*2000`) counted the player's mouth AND endDay's villageMeal drew the separate joined meal — measured 4000 kcal/day from the joined pantry. Fixed: simVillageDay excludes the joined scholar's mouth (mirrors the home village's HONEST BURN convention); the 4-day buffer cap uses mouths too. While away from their fire, the joined village feeds no phantom mouth (home convention: member while away, unfed).

**CATCH 3 (STATE CORRUPTION on return): exiles welcomed home.** returnToVillage fired the full homecoming for exiled players walking back onto the old haven tile — welcome beat, awayNews-as-homecoming, homecomingFireside flag, lastHavenDay reset — contradicting the exile severance ("To Haven, you are not one of ours anymore"). Fixed: estranged path (exiled OR joined elsewhere) gets the cold shoulder line; no beat/fireside/news/clock-reset. The haul still pools (donations toward amends stay allowed per membership doctrine).

**CATCH 4 (PHANTOM): village-switch left a phantom mouth.** joinVillageReal never released the previous village's seat — join A then B left A's population +1 forever, feeding a ghost in every sim. Fixed: release the old seat before seating the new one.

**CATCH 5 (HONESTY): joined-elsewhere player ate from the old pantry.** A player joined to B standing on A's haven tile fell through to the home-pantry branch and ate from the exilers' pantry (membership wrap only blocks `s.exiled`, not joined). Fixed: estranged guard in villageMeal's home branch — honest refusal, no draw.

**CATCH 6 (MANTLE): death while joined kept the probation.** playerDeath never cleared joinedVillage/probation and never released the seat — the successor (chosen from the HOME roster, waking in the HOME hall) inherited B's probation, couldn't eat at home (Fix 5), and B fed a dead person's seat forever. Fixed in ledger.js: death lapses the join — seat released, joinedVillage + probation cleared. (Whether s.exiled passes to the successor is exile-flow territory — flagged for the flesh-out loop, not touched.)

## HELD (verified, not theater)
- Probation half-shares: the betrayal.js villageMeal wrap already implements them (1000 kcal on probation / trust<15, honest copy). 2 checks green.
- Exile pantry block: membership.js `_blockIfExiled(G, 'villageMeal')` already shuts the exilers' pantry. Green.
- Catch-up vs endDay double-sim: traced the day watermarks — arrival catch-up brings v.day TO today, endDay's tick covers today; no double-count. The regrowLand day-key holds across both.
- Node travel is free by Steve's design (2026-10-05) with the anti-spam tick gate — not an exploit.

## SOFTLOCK ATTEMPT (design gap, documented not fixed)
After passing probation there is NO engine path to leave a joined village — plain `leaveVillage()` is dead code (zero callers), no UI action, no villageCard option. A joined player can never return to A's membership, drift again, or found a haven. Flagged for Steve: needs a designed leave path (seat release + status), not a silent worker addition.

## Regressions
- test-drifter-round3.js: 27/27 × 3 seeds.
- test-exile-haven-reset.js 39/39, test-exile-routes.js 34/34, test-meals-like-people-20261008.js 20/20.
- test-drifter.js: 38/39 (F3 pre-existing, fails on pristine too). test-drifter-presence.js: 16/18 (both pre-existing on pristine). test-drifter-fixes.js: 7/9 (1b,1c pre-existing on pristine).
- test-drifter-joinstay.js: my TDZ fix un-breaks the suite (it crashed on pristine). Remaining failures are pre-existing/stale: the betrayal half-share wrap (trust<15) vs the test's full-2000 expectation, a village-placement flaw (nearest village within 1 of "home" breaks the at-home premise), and a turf regrow/deplete balance shift — all reproduce with ONLY the TDZ fix applied, none caused by this run's changes. Suite is also nondeterministic (no pre-eval seeding — harness flaw).

## FUN note
The cold-shoulder lines landed well in the harness — exile now has teeth on return, and the join/seat accounting makes the drifter's village-hopping feel like it has weight. What drags: nothing new; the join flow's copy ("half shares, full days") is now fully honest.
