# Restructure Baseline Snapshot — 2026-10-06 Phase 0

Recorded before any restructure moves. All later phases diff against this.

## Validator
- `scripts/validate-ontology.js` (hardened): 3 known failures in game.js (dirty, sibling working)
  - `fireShow(event)` — defined in contests.js, not game.js
  - `kcalCap()` — defined in food.js, not game.js
  - consumes 'All systems (central hub)' — prose, not a path
- 34 system files scanned (src/js + src/js/engine)

## Test results (2026-10-06, tree hot with 54 uncommitted sibling changes)
- test-terraform: ALL PASS (29 asserts)
- test-water-filter-chain: 25 passed, 0 failed
- test-item-knowledge-gating: 24 passed, 0 failed
- test-npc-age-voice: 83 passed, 0 failed
- test-hushwolf-pack-fix: 12 passed, 0 failed
- test-charge-sunbasker-fixes: 11 passed, 0 failed (1 flaky failure on first run, green on rerun)

## Tree state
- Phase 0 commit: f6987dd (validator + truthful headers)
- Siblings active: game.js, app.js, contests.js, monsters.json, main.css dirty
- DO NOT start Phase 1 until tree is quiet.
