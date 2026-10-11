# break-it knowledge r3 (2026-10-10) — evidence

Target: knowledge system (8th attack this week; prior fixes NOT re-hashed).
Canon read: docs/CANON.md, docs/DISEASES.md, docs/PERCEPTION.md (+ DESIGN.md
knowledge sections from context). Verdict: **BROKE + FIXED** — one live bug
of Alien-Players class, fixed, proof-tested, regressions green.

## HEADLINE CATCH: synergy tech: legs read a dead store (fix)

**The break.** The 2026-10-07 grantKnowledge unification (commit 66ea2d80)
moved ALL technique writes to `state.codex.techniques`, but three synergy
readers still read `state.scholar.codex.techniques` — a store that is only
ever initialized to `{}` inside studyVillageCodex (game.js) and is never
written anywhere else. Result:

- All **7 synergies with a `tech:` leg could never unlock**:
  tidecaller (tech:tide_reading), wildreader (tech:plant_tracking),
  trailblazers_promise (tech:trail_blazing), stones_remember (tech:ruin_reading),
  smokehouse (tech:smoke_preserving), green_highway (tech:trail_blazing),
  read_the_patch (tech:plant_tracking).
- The reader's own comment promises "A technique from a village codex + your
  skill level + an ability = something greater" — dead on arrival. A hostile
  player who studied every village codex and earned every technique still
  could not combine them.
- `getNearSynergies` never listed them as "one leg away" either (need.length
  was 2, not 1), so the UI also hid the path.

**The fix** (src/js/game.js, 4 edits):
1. checkSynergyDiscovery's `hasReq` tech: branch → reads `state.codex.techniques`
   (same canonical store the `skill:` branch already reads via state.codex.skills).
2. The multi-path synthetic union (tech: held-leg check) → same store.
3. getNearSynergies' standard-requires `met` check → same store.
4. Removed the dead `scholar.codex = scholar.codex || {...}` init in
   studyVillageCodex (write-only store; nothing references it anymore).

Note: getNearSynergies' `requires_any` branch has no tech: case — verified
zero requires_any tech: legs in data, so no live gap (future data additions
would need it; flagged, not changed — minimal diff).

**Proof** (scripts/test-break-knowledge-r3-20261010.js):
- BEFORE (pre-fix HEAD via `git show HEAD:src/js/game.js`): 8/11 — tidecaller
  never discovers after 3 sequential water_breathing→fishing uses; near-hints
  empty; 4 stale `scholar.codex` source refs.
- AFTER: 11/11 across seeds 20261010, 99, 7. Technique granted via the real
  grantKnowledge path fires tidecaller; near-hints list it have=2/need=
  water_breathing; all 7 tech legs land in the store the engine reads;
  repeat grants refuse (no-downgrade); zero stale source refs.

**Regressions**: test-break-knowledge-20261010.js 28/28, 
...[truncated 3963 chars]