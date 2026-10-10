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
