# sig-w3c: Wave 3 batch C — callback / buffering / ad_break (2026-10-10)

## What was built
Three wave-3 signature monster mechanics in `src/js/sigW3c.js`, each with honest telegraphs, real counterplay, and non-violent resolution paths where the fiction demands them.

### THE CALLBACK (`callback`, HP [260,320], pierce 0.25, ambush)
Wears the face of an ACTUAL dead villager from the run's corpse records (deathKnown preferred; living roster excluded; "a stranger" fallback if none have died). Speaks in their voice using real lines from the village `convLineLog` (generated-but-plausible fallback). Uses THEIR moves — borrowed abilities mapped from `npcAbilities` (pocket_sand→blind, rage/adrenaline/cannibal_frenzy→heavy, blood_magic→self-cost, scream_cheese, time_skip→double, else generic stance swing), telegraphed by whose face it wears: "the face shifts — you recognize the stance."
- **Funeral beat** (`tbPlayerFuneral`): speak to it AS the person, say goodbye properly → 2-turn non-violent dissolve (final tick is lethal dispersal, not a resumed fight).
- **Name-it** (`tbPlayerNameIt`): declare the wrongness ("you are NOT them") → borrowed moves stripped + 15 psychic damage.
- Narrated with care; poignant, never cheap.

### BUFFERING (`buffering`, HP [280,340], pierce 0.2, drifter)
Exists 3 seconds in the past. Telegraphs ANNOUNCE the future truthfully ("IT WILL STEP LEFT" → it steps left; announce consumes the turn, execute follows exactly). Shows 2–3 afterimage frames; the faintest frame is the real present. Player strikes at bright frames MISS (hitting where it was); strikes at the faintest frame HIT.
- **Stand still**: it aims at your predicted future position (playerPos + lastMoveDelta); no heading → it whiffs. Real, checkable.
- **Close eyes** (`tbPlayerCloseEyes`): blind yourself for a round → next strike finds the faintest frame (announcements hidden — real tradeoff); or strike in the post-execute sync window.

### AD BREAK (`ad_break`, HP [320,380], pierce 0.15, passive)
Periodically PAUSES the fight: visible progress bar (the bar is the telegraph). During the pause it repositions (clamped to never exceed distance 3 from player — drifting further tripped the engine disengage rule and fizzled fights) and heals 3%/tick while you watch. After the bar fills, SKIP AD beat appears (`tbPlayerSkipAd`): skipAt = total-1 (was total, useless at tier 0); broadcast favor/viewership shortens total (≥25→2 ticks, ≥12→3, else 4).
- **Look away** (`tbPlayerLookAway`): halves heal + 0.5 progress/tick, blinds next strike. Real tradeoff.
- **Sponsor-creature**: 40-HP add riding the glyph; killing it jumps the bar +2.

## Design calls (Steve-delegated, overrulable)
1. Ad heal 3%/tick (was 5%, then 4% — both stalemated unarmed players at ~185–201 rounds; 3% lets even unarmed fights terminate while staying threatening for geared players).
2. Ad reposition clamped to distance ≤3 (engine disengage rule, not a design choice to move the monster far).
3. Callback face from corpse records only; funeral is 2-turn non-violent; borrowed moves mapped from npcAbilities with stance telegraph.
4. Buffering announce consumes the turn; execute follows exactly as announced; predicted strike uses lastMoveDelta.

## Proof results (all green)
- `scripts/test-sig-callback-20261010.js`: 32/32 ×3 seeds (SEED=1,2,3); MECHANIC=off → RED.
- `scripts/test-sig-buffering-20261010.js`: 31/31 ×3 seeds; MECHANIC=off → RED.
- `scripts/test-sig-ad-break-20261010.js`: 37/37 ×3 seeds; MECHANIC=off → RED.
- Each proof: telegraph appears → mechanic fires → counterplay works → resolution (incl. funeral dissolve, stillness whiff, skip/look-away/sponsor-kill).

## Bugs found & fixed during build
1. **Telegraph-yield deadlock**: 'single'/'direct' patterns re-declare telegraphs every turn → `if (m.telegraph) return false` deadlocked the ad (and starved callback borrowed moves). Fix: ad pre-empts the wind-up with honest narration; borrowed move consumes the turn.
2. **Ad reposition fizzled fights**: clamped to distance ≤3 (did NOT touch monsters.json).
3. **Funeral dissolve**: final tick must be lethal dispersal.
4. **Fled sponsor blocked movement**: pre-existing engine bug — `tbPlayerMove` occupancy check tested `o.alive` but not `!o.fled`; fled sponsor at (4,6) blocked the proof brawler for 200 rounds. Fixed in game.js (one-line: added `!o.fled`).
5. **Proof harness WAIT double-advance**: `tbPlayerWait()` already advances; `endPlayerTurn` after it caused 2× monster turns. Fixed in proof (per AGENTS.md lesson).

## Exploit / softlock checks
- No infinite heals: ad heal is %/tick bounded by maxHp; sponsor kill shortens ad.
- No infinite loops: all fights terminate ≤200 rounds (brawl proof asserts this).
- Funeral is non-violent but requires 2 turns of vulnerability (real cost).
- Knowledge never gates: all counterplay is discoverable in-fight via narration.

## Regressions (post-rebase onto 48b58607)
- `scripts/test-wave3-5-20261010.js`: [to be run]
- `scripts/test-monsters-break-r14-20261010.js`: [to be run]
- 4 pre-existing failures on master (not chased): ad_break damage band [19,33] vs 20-70 floor, hushwolf solo 2→1, wave-3 unlock ledger-points gate ×2 — stale tests from sibling survival-attrition and wave-ledger commits, identical with/without this code.

## Files changed
- `src/js/sigW3c.js` (new): all mechanics, hooks, player actions, menu/field wiring.
- `src/js/game.js`: fled-fighter movement block fix (1 line).
- `src/data/monsterBehaviors.json`: callback/buffering/ad_break/ad_sponsor entries.
- `index.html`: script load line.
- `src/js/app.js`: combat button surface + wiring (coexists with A/B blocks).
- `src/js/fieldFights.js`: round-loop seam (sigFx.mDmgBonus/mSkip/vMiss).
- `docs/ONTOLOGY.md`: regenerated (62 systems).
- `docs/MONSTER-WAVES.md`: batch C block (after A).
- `src/data/build-notes.json`: player-facing entry (prepended).
- `scripts/test-sig-*-20261010.js`: 3 proof scripts.
