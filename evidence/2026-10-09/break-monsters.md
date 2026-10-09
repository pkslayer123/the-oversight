# Break-it monsters (system 5) — 2026-10-09

Run: oversight-flesh-out-loop, scheduled 03:28 CDT. Target index 5→6. Worker tree `break-monsters`, landed as 6478be9 + e0d822b (rebased onto sibling's b9fcba3 detective-playtest landing, clean rebase, proofs re-run green), version bump `e0d822b-20261009-084310`, verified live on both endpoints.

## CATCH 1 — 9 weakness lines promised counters with NO mechanic (HONESTY) — FIXED

Audited all 28 monsters' weakness/copy lines against the engine. Same lie class as the 2026-10-08 hushwolf fire fix.
- **bulldozer** "soft flanks (HARRY then STRIKE)" and **gallowdeer** "interrupt the freeze (HARRY)" — no player HARRY verb exists ('harry' is a villager-AI action type only). Gallowdeer doubly wrong: the disrupt window is while the beam is *firing*, not during the freeze.
- **mirrormoth** "overcast days dull the wings" — weather rolls only clear/rain/cold; 'overcast' can never occur.
- **hummice** "cats (ordinary cats terrify them)" — no cats exist anywhere in code/data.
- **voice_mimic_radio** "fire scrambles it", **nevermore** "fire scatters it", **understudy** "fire breaks its concentration" — no player-applied fire/burn path against monsters exists (torch has no combat effect).
- **moderator** "darkness — it cannot moderate what it cannot see" — no darkness mechanic; the real counter is silence (wait → loses thread → mute lifts).
- **belltoad** "loud noises scatter the pack" — overstated; SHOUT breaks the chorus for one round.

Fix: copy-only byte-surgical rewrites (11 lines) in `src/data/monsters.json` naming verified real mechanics; radio's first-contact coaching line in `game.js` also fixed. Sibling sweep caught the radio's fire lie in codex slain + knownTactics texts too.
Proof: `scripts/test-break-monsters5-weakness.js` — 59/59 (old strings fail the same validator = before/after).

## CATCH 2 — dead world-layer fear computation (DEAD-CODE) — FIXED

`monsterTurn()` computed a `feared` flag from mdef.fear (fire/daylight/movement) that no live branch could consume — the raccoon branch required fear='dogs' (matches no condition), the numbers branch requires !feared. 15+ monsters' fear data fed a flag that did nothing. Deleted the dead conditions + dead raccoon-fearful branch + `scholarNearCell` (its only caller). Kept: numbers caution (hushwolf/drone), shout's 'loud noise', lockpick's bespoke steal-then-bolt flee.
Proof: `scripts/test-break-monsters5-fear.js` — static 9/9; differential vs HEAD at 2 seeds: 6 world scenarios byte-identical (deletion provably behavior-preserving).

## CATCH 3 — villager kills never counted toward wave unlocks (HONESTY) — FIXED

Design comment says "4 wave-1 kills (village-wide, not just player)" — but `recordWaveKill` was only called from the player's `tbEnd('won')`. Both villager routers (`resolveWildMonsterEncounter`, `expeditionMonster`) now record vKills.
Proof: `scripts/test-break-monsters5-wavekills.js` — 4/4 (on HEAD the 2 router checks fail, patched they pass).

## Held (attacked, resisted)

- Telegraph honesty: drone windup 3, moth facing-lock, heron commit, stag LoS-fizzle, warranty call-drop, landlord claimed ground, snake split, paparazzo prediction, heckler stun — all real.
- Loot tier mapping, wave-3 all-veteran escalation, flee/disengage anti-farming (monsters despawn on flee, HP doesn't persist for chip-farming), corpse registration.
- EXPLOIT: no infinite XP — XP grants are integration-based, not per-kill farmable; no loot duplication found.
- SOFTLOCK: tbEndCheck disengage + chorus + telegraph-commit guards all hold.
- Noted, not cut: wave-4 gate is unreachable until wave-3/4 monsters ship (future content, Steve's roadmap) — documented, not deleted.

## Regressions

counters-fix 14/14, deadcode exit 0, turtle 13/13, sunbasker 3/3, wavegate 9/9, killgrants 8/8 — all green.
