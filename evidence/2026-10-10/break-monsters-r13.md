# Break-it: MONSTERS SYSTEM (run 13, 2026-10-10)

Target index 5 (monsters). Canon read first: docs/CANON.md + docs/MONSTER-WAVES.md
(wave law, escalation, tiers), plus docs/DISEASES.md for the tick/mosquito vectors.
No canon invented.

Proof: `scripts/test-monsters-break-20261010.js` — **637 pass, 0 fail, 3 seeds**
(20261010, 777, 424242). Full harness (all src/js in index.html order, Math.random
seeded before eval). Every monster fought to completion twice per seed (slayer +
dodger policies), plus targeted counter/exploit/gating scenarios.

## Verdict: HELD — no breaks. The system survived a genuine hostile attack.

### EXPLOIT front — all blocked
- **Kill credit exactly-once**: bulldozer kill → waveKills[1] +1 exactly; the r6
  snake de-dupe holds (ducks_in_a_row's 14 segments = ONE kill, not 14).
- **Flee grants nothing**: routed/fled monsters → no waveKill, fight ends clean.
- **No monster-on-monster damage**: `S.combat.isFoe` gates every damage path
  (beam sweep, burst resolve, antler thrash) — kiting two monsters together
  cannot farm kills. Verified empirically: bright_idea burst r2 vs a second
  monster, 0 monster-on-monster hits over 80 rounds.
- **Armor model honest** (post-2026-10-09): P=20 halves a 40-hit (took 20);
  P=100 → took 7; P=10000 → took 1. The hit-1 clamp holds: immunity unreachable.
- **No XP fountain**: kills grant combatWins (capped +20 rating), waveKills
  (intended gate progression), carcass/meat (requires butchering/looting —
  real work). Encounter spawn is chance-per-entry (8-15%); farming = the
  intended hunt→eat loop with real HP/time costs.

### SOFTLOCK front — every fight terminates
- All 30 monsters × 3 seeds: fight ends (won/lost/fled/routed) within 200 rounds.
- **union_rep**: a rote slayer LOSES (rep goes WALKOUT-untargetable at half HP,
  summons picket, chips you down) — winnable-by-play, not by rote. Killing
  allies first collapses the walkout → rep targetable → won. Documented in-game
  ("break the line first", "it is TARGETABLE again. End it.").
- **moderator** (wave-2 apex): a spam-strike policy gets strike muted forever and
  loses. The documented quiet counter works: 5 waits lift the mute ("it loses
  the thread" — fired 17× in the winning run), then close+strike. Won at
  844/1000 HP. Mute is ONE verb max by design ("muting both would lock the
  fight"); it only applies inside the field; it recomputes from the live window.
- Restraint sweep (sibling class): turtle bunker = chip damage (15%, min 1),
  once per fight, 2 turns; tick latch = torch burn-off or 4 feeds then drops;
  all finite, all with working counters.

### HONESTY front — telegraphs don't lie
- **Damage ⊆ telegraph cells**: instrumented tbDamage across all 30 monsters ×
  3 seeds — every telegraphed ('squares') hit landed inside the cells shown at
  damage time. 0 lies. (Moth arc is a subset = over-warning, safe direction;
  paparazzo re-center updates tg.cells before damage and is codex-documented.)
- **Counters work as described**: drone crowd (4 targets → RECALIBRATING, verified
  in-engine); flipped turtle never bunkers; tick torch burns off latch;
  paparazzo slain text documents the prediction re-center; mosquito bite draws
  `['eurika', 'east_nile']` (alien pool only — no mundane leak).
- **Wave escalation honest**: data matches canon exactly — wave-2 HP 30-170 /
  dmg 8-48 (means 88.7/25.4) vs wave-1 10-170 / 4-32 (means 54.1/16.0).
- **Knowledge gating**: encTelegraphKnown false for unknown AND for
  observed-alone (design: knowledge is earned — witnessing the pattern via
  tbLearnPattern or slaying reveals it, not the stage label); true after slain
  and after tbLearnPattern. Unknown display is descriptor-like, never the true name.
- **Tick vector honest**: latch → 50% Lemons (alien pool, per Steve 2026-10-09 —
  MONSTER-WAVES.md's "(alien pool)" note is correct; DISEASES.md agrees).

### DEAD-CODE front — everything wired
- 30/30: monsterBehaviors.json entry, xxxIs predicate in game.js, calm+aggro
  sprites, encounter.knownCue coaching, codexStages {unknown, observed, slain},
  attack {name, damage, telegraph, pattern}.
- All 4 hook names resolve against the registry (a typo'd hook would silently
  no-op via `continue` — none found).
- index.html load order: game.js + encounters.js before monsterBehaviors.js. ✓

### Test artifacts corrected (not game bugs)
- `driveFight` slayer now closes to strike range (scatterers like hummice fled
  out of reach — the old no-move driver "failed to terminate" on test artifact).
- Turn-ender is now `tbPlayerWait()` (notes the verb for the moderator's rolling
  window; the manual closer skipped the note and made the mute unliftable —
  test artifact, per the WAIT DOUBLE-ADVANCE lesson).
- 'routed' accepted as a legitimate terminal result (monster broke and ran —
  ends the fight, no credit, no phantom).

### Notes for the loop
- Shared `scripts/sim-harness.js` `driveFights` still uses the manual turn-ender
  (no modNoteVerb('wait')) — any future harness-driven moderator fight would
  inherit the unliftable-mute artifact. Left untouched (shared infra); noted here.
- No source files changed this run. Canon docs verified current; no doc edits needed.
