# Emergent synergy ledger — evidence notes (2026-10-07)

Worker: ABILITY EVOLUTION & SYNERGY DISCOVERY, src/js/progression.js.

## What was built
progression.js gains an **emergent-resonance attempt ledger** (additive; game.js's
designed synergies untouched). Every ability use (via the noteAbilityUse wrap)
feeds candidate sequences:

- **Kinds:** `sequential` (A then B, same day, close in the use log) and
  `same_target` (both gifts on the same target today).
- **Honest counting:** each use of A enables exactly ONE counted use of B
  (use-log index tracking) — spamming B after one A farms nothing.
- **Decay:** B without a fresh A costs 1 run; a component dragged onto a
  different target mid-pattern costs 1; every dawn costs 1 (progDaily).
  One-off tries evaporate entirely.
- **Unlock:** 5 successful activations crystallize the resonance (stricter than
  designed synergies' 3 — this recipe was never written down).
- **Recipes:** seeded from orphaned design intent — abilities.json
  `synergyHints` named pairs ("stabilize then fight on", "find it, then drop
  it clean", "preservation instinct: harvest, then keep it") that no system
  ever read. Order matters for sequential recipes. Anything else crystallizes
  as a System-named generic resonance ("Camp Cook × Triage") with pool-based
  effects riding the existing modifier pipeline.
- **Hint escalation:** runs 1–4 fire sensation-only hints that never name the
  abilities or the recipe ("A shiver ran the length of your spine — not cold,
  not fear. Like a chord resolving."). Unlock is a System-voiced beat +
  codex entry.
- **Codex gating:** candidates never exposed to UI; `emergentInfo(id)` returns
  null until discovered; codex.synergies written at unlock.
- **6-slot cap:** candidates tracked only while both gifts held; unlocked
  resonances go DORMANT off-slot (recomputeActiveSynergies wrap); background
  gifts sit outside the cap (always held), matching game.js semantics.
- **Attunement (neural-creep evolution):** at integration stage 2+, L3
  abilities accrue attunement per use — flicker (8) → hum (20) → woven (40).
  flicker: pairs never fade overnight; hum: pairs count double; woven: unlock
  at 4 instead of 5. Each phase plays a System-voice beat with its wrong
  theory ("resonance harmonics").

## Proof
`scripts/test-synergy-20261007.js` (node harness, seeded RNG): 30/30 green.
Played the full arc as a player — one-off try hints but never unlocks; dawn
evaporates it; mashing B decays run 2→1→0; five clean triage→adrenaline_control
activations escalate hints 1-2-3-4 then unlock "Stabilize Then Fight On";
modifiers verified live in the pipeline (healing 100→187.5); dormancy on
unequip verified (→150); attunement flicker beat verified; same-target pattern
crystallizes a generic resonance. Hint text judged as discovery, not a
vending machine — it describes sensation and the System's bafflement, never
instructions.

## Open / not done
- app.js has no synergy/codex UI surface for emergent resonances; the gate
  (`emergentInfo`) is provided but no UI reads it yet (app.js is
  sibling-owned — left for the UI worker).
- hum/woven attunement phases not exercised in the proof (only flicker);
  mechanics are simple multipliers on the tested path.
