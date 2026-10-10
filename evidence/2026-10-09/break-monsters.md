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

---

# Break-it monsters r11 — 2026-10-09 (21:28 CDT run)

Target: **monsters** (index 5→6). Worker tree `break-monsters`.
Proof: `scripts/test-break-monsters-20261009.js` — 57 assertions, **ALL GREEN × 4 seeds**
(20261009, 7, 99, 424242). Canon read first: docs/CANON.md, docs/MONSTER-WAVES.md,
docs/DISEASES.md. Builds on the earlier r10 run above (counter fixes landed) —
this run re-attacked the system fresh and found no regressions.

## Verdict: the system HELD on every attack. One doc-honesty fix landed.

## Attacks attempted (all resisted)

**W — wave-gate honesty (11 asserts)**
- Kill-farm vs day-gate: day 7 + 100 wave-1 kills → wave 1. Day-gate holds.
- Thresholds exact: day 8+3 → 1, day 8+4 → 2, day 25+7w2 → 2, day 25+8w2 → 3,
  day 50+5w3 → 4, day 49 → 3.
- castMonster over 3000 draws pre-unlock: zero wave-2 ids — never over-leveled.
- 6000 draws post-unlock: all 15 wave-2 AND all 14 castable wave-1 reachable
  (earlier waves never leave).
- spawnWaveTarget ≈ 60/40 (±5%) post-unlock.
- Escalation honest in data: wave-2 mean HP 88.7 vs 54.1, mean damage 25.4 vs
  15.7, ceiling 48 vs 32 — not reskins.

**T — telegraph lies (4 asserts)**
- review_drone windup 3: instrumented fight — 3 full warned player turns
  (turnsLeft 3→2→1) before damage lands on the 4th. The dodge window is real.
- hushwolf Silent Rush: zero `⚠` telegraph cues before first contact; rush hit
  with no declare — "no warning, just teeth" is mechanically true. (Steve's
  killed rush indicator stayed killed: telegraph UI only renders when
  m.telegraph is set, and rush never sets it.)

**C — counter honesty (6 asserts)**
- bright_idea burst cells bounded by radius 2 (backing off works).
- review_drone beam is a straight line ≤ 6 (the telegraphed line is the line that fires).
- SHOUT vs hummice: chorus broken, swarm startled; vs belltoad (fear "loud noise"): startled.
- Hushwolf fire counter wired in the quiet-woods event (flame → pack gives ground).
- Tick torch counter: torch in inventory burns a latched tick off.

**L — loot honesty (8 asserts)**
- rollAlienLoot caps hold: wave-1 base ≤2, veteran ≤3 (post-wave-2 only),
  wave-2 base ≤3, gallowdeer → 4, moderator → 4 — tier 4 from hand-placed
  `apex` flags, never an automatic one-apex-per-wave mapping. Tier-4 alien
  item pool non-empty (drops can land).
- All loot chances ≤ 0.15 (low by design).

**F — friendly fire / field fights (5 asserts)**
- fieldFight(vid, gallowdeer) and (vid, hushwolf): rounds ≥ 1, log narrates
  real attack data ("Ocular Discharge" in the record) — blow-by-blow, never an
  outcome table.

**E — encounter farming (3 asserts)**
- checkEncounter spawns ≤1 monster per tile; re-entry never stacks. Pity capped at 60%.

**S — softlocks (2 asserts)**
- startCombat mid-fight refused with honest narration (guard from combat r1 holds).

**D — dead code (3 asserts)**
- All 30 monsters have behavior entries; every pattern type engine-supported;
  all JS modules loaded in index.html (verified by grep — no "NOT LOADED" misses).
- nightlight_catfish ('in'-water) is honestly excluded from the treeline
  wanderer cast by design, stays in the wave pool for water-grid spawns.

**V — alien-disease vectors (9 asserts)**
- Mosquito bite: 50/50 eurika/east_nile per landed bite; second bite can land
  the other (min-maxers seek both); null when both held. Instrumented real
  fight: a landed drink triggers the virus roll and infects.
- Tick latch: undodgeable at adjacency; 50% lemons roll lands (alien pool).

## What broke (fixed)

- **DOC-CODE MISMATCH (honesty):** docs/MONSTER-WAVES.md claimed wave 3 gates on
  "System arrival AND deep integration (80+)" — the engine never checks
  integration; the live gate is day 25 + 8 wave-2 kills (unlockedWave()). Doc
  corrected to match the engine (both the Wave 3 section and the
  monsterWavePool() implementation note). No code change — the gate is the design.

## Sibling sweep

Same-class hunt: checked other canon docs for stale gate claims (DISEASES.md
vectors match code; CANON.md manifest accurate). The in-code tbEnd wave-3
announcement honesty note (2026-10-09) already matches the corrected doc.

## Notes for the queue

- The wave-1 kill gate (4 kills) is farmable with hummice by design ("prove you
  can handle it") — cheap, but the gate is a floor, not a test. Not a bug.
- Wave-3/4 monsters don't exist yet; pool/ratios degrade gracefully (top=2).
- Test triage notes (test bugs caught during the run, engine was innocent):
  an off-by-one in my windup counter (probe showed 3 honest warned turns),
  an emoji filter that caught the "⚠️ threats" rollcall instead of "⚠" telegraphs,
  and nightlight_catfish's by-design exclusion from the wanderer cast.
