# Break-it monsters r6 (system 5) — 2026-10-10

Run: oversight-flesh-out-loop. Worker tree `break-monsters`.
Prior art read first: `evidence/2026-10-08/break-monsters.md` (+4, 3, fieldfights, flip),
`evidence/2026-10-09/break-monsters.md` (run 5: weakness-copy, dead fear, wave-kills),
`break-monsters-r1.md`, `break-monsters-r2.md` (waterAffinity, phantom cook calories,
villager carcasses, patrol RNG, wave-2 hardening). Fresh angles only — 2 kills + 1
held, all fixed + proven.

Canon: docs/CANON.md + docs/MONSTER-WAVES.md read first. No canon invented.

## CATCH 1 — snake wave-kill inflation (EXPLOIT, wave-gate manipulation) — FIXED

**The break:** `tbEnd('won')` recorded wave kills per dead *fighter*
(`for (const m of f.fighters) if (m.kind==='monster' && !m.alive ...) recordWaveKill`),
but snake segments are one creature — the reward loop 20 lines below de-dupes them
by `snakeId` for carcasses, loot rolls, and codex 'slain'. Killing the duck's
**14 segments minted 14 "kills"**: a single snake encounter cleared the 4-kill
wave-2 minimum alone (proved: `waveKills[1]` went 0→14, `unlockedWave()` returned 2
at day 8 off one body).

**The fix** (`src/js/game.js`, tbEnd): one body = one kill — the recordWaveKill loop
now de-dupes with the same body key the rewards use (`'snake:'+snakeId` /
`'body:'+key`). Split halves that became independent snakes (new snakeId) still
count separately — the fiction says "both halves hunt you". Pack monsters are
separate creatures and still count individually. Sibling sweep: the only other
per-fighter loops are already de-duped (`_kills`); `monsterKills` in
expeditionMonster is per single-creature fieldFight; contest kills don't record
wave kills at all (open design question — see below).

**Proof:** `scripts/test-break-monsters-20261010.js` §A — synthetic 14-segment
fight, `tbEnd('won')`, assert `waveKills[1]` delta === 1 and wave 2 stays locked.
Pre-fix FAIL (got 14, wave 2 unlocked); post-fix green ×3 seeds.

## CATCH 2 — migrated hook inline branches left in tbMonsterTurn (DEAD CODE + double-fire) — FIXED

**The break:** the hook migration (monsterBehaviors.js, Steve 2026-10-07) moved
antlerThrash/turtleBunker/humSwarmCheck/droneCrowdOverload into data-driven
`preTurnHooks`, but only the highbeam's inline branch was removed (its comment
explicitly says the inline "double-fired it"). Three inlines were left behind:
- **hummice: LIVE double-fire.** The `humSwarmCheck` hook returns `false` (the
  check runs *in addition to* the turn), then the still-live inline
  `if (this.humiceIs(m)) this.tbHumSwarmCheck(m)` ran it a **second time every
  turn**. Benign only because the function's mutations are round-guarded
  (`f.humMice`, `f.humDecayRound`) — the second call is a guaranteed no-op — but
  it's exactly the double-fire the highbeam migration fixed.
- turtle/drone inlines: unreachable (their hooks consume the turn first under
  identical conditions) — pure dead code.

**The fix:** removed all three inline branches per the migration pattern's own
step 3 ("remove the inline branch" — the highbeam precedent). Ordering safety
verified: flipped-turtle and bunker can never co-occur (flip is refused while
sealed at tbPlayerFlip; bunker requires unflipped at the trigger), so the hook
running before the flipped check changes nothing. The drone hook's
`encUsesFifo` guard matches the inline's `useFifo &&` guard; the hummice hook is
a verbatim call.

**Proof:** §B — wrapped `tbHumSwarmCheck`, drove one hummice turn: 2 calls
pre-fix (FAIL), 1 post-fix. Source asserts: all 4 hooks registered, JSON wires
them to the right ids, no inline branches remain. Behavioral parity: turtle
bunker counts down 2→0 via the hook with the unseal narration; drone crowd
overload still recalcs (phase `recalc`, telegraph cleared, turn consumed).
Green ×3 seeds.

## HELD — windup honesty (all 30 monsters' telegraphs tell the truth)

Attacked the windup pipeline end to end: `encDeclareDirect`/`encDeclareBeam` set
`turnsLeft = pat.windup || 1` for every monster; bespoke declares checked by hand
— bright_idea (`pat.windup || 2` + cue "Two beats from glow to boom — BACK OFF"),
mirror_stag (hardcoded 2 + cue "in a straight line. MOVE SIDWAYS"), moderator
shadowban (`turnsLeft = 2` + cue "It falls next round"). Runtime proof (§C):
declare→`turnsLeft` equals JSON windup for drone (3), memory_projector (2),
gallowdeer (1), landlord/heckler/understudy/union_rep (2), lockpick (1, honest
default); and a heckler fight shows **zero damage during the 2 windup turns,
the hit lands on exactly monster turn 2**. The system held — the countdown is
honest.

## Also surveyed (no break found)

- **Dispatch coverage:** all 30 monster ids in monsters.json have a `*Is`
  predicate in game.js, all defined, all reachable via tbMonsterTurn; all 30
  have `monsterBehaviors.json` entries (the 4 migrated hooks registered).
- **Kill-count call sites:** tbEnd (fixed), resolveWildMonsterEncounter,
  expeditionMonster routers (village-wide, intended per 2026-10-09).
- **No XP loop:** combat grants no XP — nothing to farm.
- **Flee/chase:** barrier-flee with per-monster pursuit stamina via
  `chasePersistence`; relentless hushwolf ends only at Haven or by kill (Steve
  2026-10-09 design). No deadlock found.
- **`systemDesignation`:** never read by code — pure flavor data, harmless.
- **Telegraph cue honesty** (23964-23965): "about to break loose" at turnsLeft 1,
  "still gathering" above — matches the countdown.

## Open questions for Steve (not fixed — canon calls)

1. **Contest arena kills don't feed wave kills.** The gate is "village-wide" and
   contests are real fights — should a Blood pit kill count toward wave
   unlocks? Left as-is; say the word and it's one line.
2. **Snake split halves = 2 wave kills** after a mid-fight split (each half is
   an independent hunter per the fiction). Kept as honest; flag if you'd rather
   count the encounter once.

## Proof results

`scripts/test-break-monsters-20261010.js` — 18 checks, green ×3 seeds
(SEED=7, 20261010, 999). Pre-fix run (game.js stashed): 4 FAIL as designed
(snake +14 kills, wave-2 unlock, humSwarmCheck 2×, inline branch present).
Regressions: `test-break-monsters-20261009.js` 57/57, `test-break-monsters5-wavekills.js`
4/4, `test-wave2.js` 170/170, `test-wave2-harden-20261009.js` green,
ontology 52/52. No jest concurrency (node scripts only).
