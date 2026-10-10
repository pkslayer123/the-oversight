# Break-it: combat engine — 2026-10-10

Target: combat engine (tbDamage, tbPlayerStrike, tbEndCheck, fieldFights, phase badges, XP/practice, dead code).
Canon read: docs/CANON.md, docs/MONSTER-WAVES.md. No canon doc covers the tactical engine's damage internals; the armor model is Steve 2026-10-09 (AGENTS.md + code comments).

## CATCHES (2, both fixed in src/data/monsters.json)

### H1 — hushwolf "💨 RUSH" grid badge: Steve's killed rush indicator was live again
- Steve 2026-10-06 killed the grid rush UI indicator: "Silent Rush gives no warning, it just moves and hits. The telegraph is the silence itself: birds going quiet, woods holding their breath."
- But `monsters.json` still shipped `encounter.phaseBadges.rush = " 💨 RUSH"`, the rush branch sets `beamPhase='rush'` via `encPhaseFor(m,'resolve')`, and `app.js` renders `encPhaseBadge(m)` in TWO surfaces (combatStripHTML above the grid, and the monster card rows) once the pattern is learned — learning happens via `tbLearnPattern` AFTER the first rush lands.
- Nothing ever resets the wolf's phase between rushes, so from rush 2 on the player sees a standing "💨 RUSH" badge: the killed indicator resurrected by stale phase state. It also lies in the other direction (badge persists on turns the broken wolf circles instead).
- Fix: removed the `"rush"` entry from the hushwolf's `phaseBadges`; `encPhaseBadge` now returns `''` for the rush phase. Guard note added to the data `comment` field so nobody re-adds it. The telegraph stays what Steve said it is: the silence (narration + `wolfSilence` audio).

### H2 — speedbump_turtle "⚡ SNAP" badge (SIBLING SWEEP, same bug class)
- The snap fiction is explicit: "No warning. There never is." Yet `phaseMap.resolve='snap'` + `phaseBadges.snap="⚡ SNAP"` rendered the same standing post-learning warning (phase never resets after the snap either).
- Fix: removed the `"snap"` entry; guard note in the data comment. Same class, same fix.

## HELD (attacked, resisted — documented, not fixed)

- **E1 armor invariant** (`absorbed = min(hit-1, round(hit*r))`, `r = P/(P+20)`): holds in tbDamage's player block AND villager block for hits 1–40 at P=500 — min landed = 1 in both. Pierce hook defaults 0 (no monster in monsters.json declares `pierce`). fieldFights.js uses the textually identical `Math.min(total-1, …)` clamp. Brace (60% reduction, an *ability* not armor) can zero a 1-damage chip hit — honestly narrated, outside the armor law; left alone.
- **E2 negative damage**: `tbDamage(-50)` applies 0; HP unchanged — no heal path (`final = Math.max(0, …)`).
- **E3 practice/stat farming**: stats hard-cap at 10 (`practice` returns early); 10k dodge/strike reps can't push past it.
- **E4 ambush "double-count"**: the ambush PASSIVE (`combat.first_strike_damage` ×1.5, round 1) and the ambush ACTION (`set_ambush` → `s.ambushReady` ×2.0) DO stack on one strike — but so do haymaker (passive ×1.2 + action ×2.5) and patient_aim (passive ×2 + take_aim ×2.5). It's the consistent passive+action grammar, all honestly narrated, "broken builds welcome" per Steve. Not a bug.
- **S1 softlock**: `tbEndCheck` ends `routed` when all monsters fled; the double-KO guard ends `lost` (not a corpse-victory) when the player drops with the last monster. No unendable fight found; chorus/`_pendingPack` staleness already handled (persistence break-it 2026-10-09).
- **D1 dead code**: every `src/js/**/*.js` (minus DOM-only app/sprites/tile-scenes/move-anim/drama) is loaded in index.html script order; all 10 `Scattering.combat` exports resolve AND are called from live code (`cheb`/`inGrid` are internal helpers used by `patternCells`/`stepToward` inside the module). Ontology: 52/52 validated.
- **Honesty sweep**: `tbDamage` callers state the returned `landed` value (2026-10-09 sweep held — beam/shrapnel/duck-bite all use it); villager `help` states post-cap healing; feastBurn states its own burn+mult; strike floor `d = Math.max(1, d)` sits AFTER resist so "STRIKE for 0" is unreachable.
- **Fidelity note (not fixed)**: contest `duelFight` (villager-vs-villager) applies no worn armor — the tactical engine honors it. Design gap, not an exploit; flagged, not changed.

## Proof
`scripts/test-combat-break-20261010.js` — 19/19 × 3 seeds (20261010, 777, 424242). Before the fix the 5 badge assertions failed (badge rendered `" 💨 RUSH"` / `" ⚡ SNAP"`); after, all green. Full harness: index.html order, seeded mulberry32 before eval, `delete global.window` before play.

## Files changed
- `src/data/monsters.json` — removed 2 badge entries + 2 guard comments (6 lines touched)
- `scripts/test-combat-break-20261010.js` — proof suite (new)

---

# Second pass — 2026-10-10 13:08 CDT run (independent concurrent pass at target 0)

A second instance of this loop attacked combat independently (same target index 0 before this run advanced it to 1). Different attack surface, one real catch — fixed, proven, landed on top of the above.

## The catch: SNAKE-SPLIT REWARD MULTIPLICATION (EXPLOIT — fixed)

**Mechanism.** `Ducks in a Row` (14 segments, one spawn, 2100 kcal, 10% tier-2 alien-loot roll, wave 1) can be split by `tbSnakeSplit` into fragments that carry **new snakeIds**. `tbEnd`'s two reward de-dupe loops keyed on the bare `snakeId`, so every fragment paid the full reward for one creature. A hostile player killing middle segments (cheap, since segments are thin) got:

- one duck → **7× carcasses (14,700 kcal)**
- **7× alien-loot rolls** (10% tier-2 each)
- **7× wave-1 kills** toward the wave-2 gate (which needs only 4)

Same bug class as the r6 "ONE BODY = ONE KILL" fix — reopened via the split path. (No combat-specific canon doc exists; monster behavior checked against MONSTER-WAVES.md for wave-gating honesty.)

**Fix** (src/js/game.js): spawn stamps `snakeRoot` (the original snakeId) on every segment; `tbSnakeSplit` deliberately preserves it; new `tbSnakeLineageKey()` de-dupes both `tbEnd` loops (wave-kill counting + carcass/loot rewards) by lineage. Splits still happen — only the payout is unified. Save/load safe (fighters are JSON-copied wholesale; pre-fix saves fall back to `snakeId`).

**Proof**: `scripts/test-break-combat-snake-split-rewards-20261010.js` — **8/8 checks × 3 seeds (1, 7, 42)**. The script first demonstrates the exploit on the pre-fix shape (7× rewards) and then verifies the fix: exactly 1 wave kill / 1 carcass / 1 loot roll with splits still occurring (the harder fight survives the fix). Re-run green after the coordinator-side rebase onto maintree/master (17d784e1, mid-run sibling landing) and after the --ff-only merge.

**Regressions**: `test-break-monsters5-wavekills.js` 4/4. `test-ducks-split-20261006.js` 17/18 — the 1 failure is pre-existing and stale (expects duck HP [8,12]; data is now [12,18] after wave-2 hardening), left for routing, not touched.

Ontology validator: 53/53, release permitted; `docs/ONTOLOGY.md` regenerated in the same commit.

## Attack surfaces that HELD (no fix needed)

- **EXPLOIT — XP loops**: `practice()` hard-caps at stat 10 (grindable, but intended "earned by doing"); dodge-practice costs real hits. Villager 'help' is once-per-fight, +12, honesty-gated on actual HP healed.
- **EXPLOIT — reward routing**: patrol/wild villager kills route loot to the killer via `villagerKillLoot`; the carcass stays in the world to rot — the player banks nothing risk-free.
- **SOFTLOCK**: belltoad chorus arrival is geometric (always eventually spawns, mdef always attached); `resetPerFightFlags()` clears `_pendingPack` (no phantom cross-fight spawns); async chain guards on `f.over`; disengage recursion bounded.
- **HONESTY**: strike/beam/shrapnel all narrate `tbDamage`'s landed number; villager armor has the r8 zero-absorb narration gate; style score is display-only flavor (no mechanical promise to break); flee/disengage copy matches engine behavior.
- **DEAD CODE**: all 46 `src/js` files cross-checked against index.html script tags — all loaded (an initial lowercase-only grep falsely flagged 8 camelCase files; each verified individually). `mbRunPreTurn` is genuinely called from `tbMonsterTurn`.

## Sibling sweep (same bug class: identity reassignment → per-body reward multiplication)

Checked and clear: pack monsters (separate creatures, correct), fieldFights-vs-snake (1 member/1 kill — conservative, correct), chorus reinforcements (genuinely new creatures, correct), hummice (separate fighters, correct), union-rep picketers (separate summons, correct), contest arena kills (route through `tbEnd`, covered by the fix), `duckState`-by-snakeId (behavior state only, not rewards). No other instances found.

## Landing (second pass)

Worker branch `break-combat` committed by worker as 9d529bb0; rebased by coordinator onto maintree/master (17d784e1), proof re-run green (8/8), merged fast-forward to master as 909f1b44. No `[needs-eyes]` (anti-exploit fix, invisible to honest players). Merged locally, pending ship.
