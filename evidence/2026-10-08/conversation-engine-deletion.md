# Conversation engine deletion pass — 2026-10-08

Steve: "Yes do a dedicated deletion pass on conversation engine. Did we correctly replace with a new engine?"

Answer: yes. The new engine (conversation.js + convo-*.js, Phases 1+2) fully replaced the legacy
engine. The legacy copy in game.js never executed at runtime. Deleted with proof.

## What was deleted

`src/js/game.js` — the entire legacy conversation block (old lines 1901–2434, ~534 lines):
talkTo, vpOf, convoGet, convoBudget, convoPick, convoPickCycle, convoOpening,
convoAskTopic, convoThreadHasMore, convoThreadBeat, startConvo, convoTurn,
endConvo, convoConflictFallout, convoUI.

Replaced by a tombstone comment + the preserved live helpers (below).

## Why deletion is behavior-preserving (the proof)

1. **Load order**: index.html loads game.js (line 29) before conversation.js (line 31).
   Both attach via `Object.assign(Game, methods)` — the later attach wins every key.
   All 15 names are defined in conversation.js. The game.js copies were unreachable.
2. **No load-time captures**: the only code capturing these methods at load
   (codex-people.js wraps endConvo; party-formal.js/truth.js/ledger.js wrap convoTurn;
   truth.js wraps startConvo; betrayal.js wraps convoChoices) all load AFTER
   conversation.js — they captured the NEW versions. Verified by script order.
3. **Caller sweep**: every in-repo caller of the 15 names (app.js, ledger.js, truth.js,
   convo-*.js, debug-scenarios.js, etc.) resolves through `Game.*` at call time,
   i.e. to the conversation.js versions — unchanged by this deletion.
4. **Differential proof**: scripted 3-villager × 7-turn conversations + convoUI +
   endConvo + npcHomeRegion + villagePick + villageLineFresh + convLineLog,
   run against HEAD game.js vs deletion game.js — **byte-identical output across
   3 seeds** (20261008, 424242, 777), 49 lines each. Script: /tmp/diff-convo.js.
5. **Dialogue proofs on the deletion build**: Phase 1 56/56 × 3 seeds,
   Phase 2 35/35 × 3 seeds — identical to the live build's results.
6. **Ontology gate**: 47/47 systems validated after deletion. Neither header
   claimed the deleted names, so no header changes were needed.

## What was PRESERVED (the worker's 15-name list missed these)

The old block contained 20 methods + 1 data property, not 15. Six items were NOT
shadowed and are still live — kept in game.js with their original code:

- `npcHomeRegion(vid)` — only caller is debug-scenarios.js (guarded fallback),
  but it's live logic; kept.
- `LINE_FRESH_DAYS`, `convLineLog()`, `villageLineFresh(line)`, `noteVillageLine(line)`
  — the village-wide line-retirement subsystem. conversation.js calls
  villageLineFresh/noteVillageLine at runtime; deleting them would have thrown.
- `villagePick(pool)` — called live from game.js:16376 (night-watch ambient lines);
  deleting it would have thrown TypeError.

Had the deletion gone ahead on the worker's 15-name list alone, three live
functions would have been destroyed. The name-level sweep caught them.

## Sibling sweep: duplicate conversation symbols

- `plantKnown` / `pantryItemKnown` were each defined TWICE inside game.js's own
  methods object (later copy wins; earlier copy dead). Deleted the dead first
  copies. The surviving pantryItemKnown is the full Steve 2026-10-06 gate.
  Knowledge proofs: test-pantry-knowledge-gating 28/28 (1 pre-existing fail,
  identical on HEAD); test-knowledge-gate-20261008 25/25 (8 pre-existing
  manager* fails, identical on HEAD).
- No duplicate method definitions across conversation.js + convo-*.js (checked).

## Stale test scripts repaired (would have broken on deletion)

Four scripts eval'd game.js without conversation.js and called the deleted names:
- scripts/playtest-clock.js — added conversation.js + food.js (the latter fixed a
  pre-existing addUnknownToLump crash; script now runs clean end-to-end,
  "DONE — no crashes, clock behaved"). Note: on HEAD this script crashed inside
  the LEGACY startConvo — the deletion fixed it.
- scripts/test-contests-item3.js — added conversation.js → 16/16.
- scripts/test-day-budget.js — added conversation.js → convo-open works.
- scripts/test-examine-recognition-20261006.js — added conversation.js → 22/22.

## Files changed

- src/js/game.js — legacy block deleted (26074 → ~25560 lines), 6 live helpers preserved
- scripts/playtest-clock.js, test-contests-item3.js, test-day-budget.js,
  test-examine-recognition-20261006.js — eval lists gain conversation.js
- evidence/2026-10-08/conversation-engine-deletion.md (this file)
