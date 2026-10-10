# Wave 3–5 monsters — build evidence (2026-10-10, prog-waves)

Workstream: promote the WAVE-3-5-DRAFT (wave35-draft branch, 647 lines) to
real playable content. 26 monsters as data (25 draft + THE EATER), gating,
announcements, docs. Merged locally, pending ship.

## Steve's decided calls — all applied

- Wave 3 = "The Final Draft", wave 4 = "The Mirror Draft", wave 5 = "The
  Producers". (Draft alts "The Audience Draft" / "Oversight Fauna" dropped.)
- THE EATER (Steve's own, wave 4): implemented faithfully — consumes plants
  and animals above all else, grows stronger with the calories it consumes
  (+15 damage per 2000 kcal eaten in the fight, telegraphed by its swelling
  belly), including people. "Humans eat to become gods; it eats to become a
  monster." The aliens watched humans eat and thought it looked like fun.
- Numbers ANCHORED to measured godhood DPS (see anchor below), not guessed.
- Phoenix clause redesign: already honored in code — `maybeCheatDeath()` is
  the single death choke point and the comment at game.js records Steve's
  ruling verbatim ("Doom countdowns (Eulogy / Finale) do NOT bypass it —
  unkillable means unkillable"). No bypass exists; nothing to change. A random
  villager burns in the ash-death; the villager pool is the cap.
- Escalation law / anatomy-justifies-attacks / wacky Undertale counters / no
  emoji doubling: all 26 entries carry anatomy-telegraphed attacks, codex
  "slain" entries document the lateral counters, 56/56 unique emoji.

## NEEDS-STEVE items — resolved per "figure it out yourself"

1. **Callback (w3) vs Reunion (w4): KEPT BOTH.** Different mechanics sharing a
   theme: Callback = single lost face, hesitation/trauma, resolved by the
   funeral farewell; Reunion = gestalt of the failed village, knows your
   tactics, resolved by novelty. Steve's law favors distinct mechanics.
2. **Eulogy (w4) vs Spoiler (w5): KEPT BOTH.** Eulogy = doom counter you
   INTERRUPT (contradict the narration); Spoiler = truthful announcements you
   EXPLOIT (ask binding questions / fulfill cheaply). Documented the
   distinction in Spoiler's codex slain entry.
3. **Living Garden wave 3–5 predator: FILLED, not a gap.** THE EATER is the
   wave-4 predator of the food economy — it eats the grid (crops, forage,
   carcasses, pack food) before it eats you. Eater's codex names it: "the
   Living Garden's predator — the wave-4 answer to the food economy."
4. **The Suburb as a PLACE: KEPT.** "Fights you win by leaving" works as a
   monster frame: it's data-shaped (attack = Property Tax memory/bond cost,
   telegraph = flickering streetlights, HP 1300-1500 "it's a place"), and the
   win-by-leaving is the honest documented counter in weaknesses + codex.
   Cutting it would lose the draft's best "comfort as a trap" concept.
5. **Ad Break "skip ad" UI beat: DEFERRED with a note.** The telegraph
   describes the progress bar + skip beat and the codex documents the three
   counters (patience / look away / kill the sponsor). The actual UI choice
   is a future app.js beat — flagged here, not silently dropped.

## Sim anchor (scripts/sim-dps-anchor-20261010.js, seeds 1-3)

Measured, not guessed. Full harness (sim-harness.js), seeded RNG.

| Build | Kit | DPS/round (mean, 3 seeds) |
|---|---|---|
| Godhood brawler (One-Person Army) | rage/second_wind/blood_magic/leech/adrenaline_control/cornered_rat, worldbreaker_maul, full alien armor (P=138) | ~220 |
| Godhood hunter (Apex Predator) | tracker/echo_location/patient_aim/dead_aim/game_sense/soft_step, apex_bow | ~230 |
| Mid build | hunter kit lvl 2, fire-hardened spear, hide armor kit (P=64) | ~64 |

Monster offense measured: wave-5 vs P=138 → 8-21 dmg/round (cancellation
18.5, editor 20.3, finale 16.9-20.2 — matches the draft's max-build math
within noise: draft predicted 25/30/30); wave-3 vs P=64 → 8-10/round;
wave-4 vs P=64 → 12-19/round.

Design call (documented): target fight lengths — wave-5 apex 7-10 rounds,
wave-5 rest 5-7, wave-4 4-6 (vs godhood), wave-3 4-6 (vs mid). HP bands =
measured DPS x target rounds. The draft's HP bands assumed 50-80/round and
would have died in 2 rounds to a real godhood build — the anchor overruled
them; damage/pierce bands kept from the draft (validated by the sims).

Final bands: w3 HP 240-420 / dmg 20-70 / pierce 0-0.25; w4 HP 850-1500 /
dmg 35-95 / pierce 0.2-0.5; w5 HP 1000-2200 / dmg 50-130 / pierce 0.25-0.75.
Finale's [150,200] finale strike takes ~70 through god armor (P=138,
pierce 0.75) — the wall holds; one finale nearly kills a max build.

## What fired in tests

- scripts/test-wave3-5-20261010.js: **211 passed, 0 failed, seeds 1/2/3.**
  Covers: 56-monster roster, kills+scale gating (incl. calendar-alone never
  unlocks, kills-without-rank never unlocks, rank-without-kills never
  unlocks, defensive no-scaleRank path), combat smoke per monster (start +
  12 rounds, no crash), anchored bands, unlock beats naming each identity,
  doom ruling recorded, unknown codex stages hide true names.
- scripts/schema-check-wave35-20261010.py: 26 new entries schema-clean vs
  src/data/schemas.json (mirrors validate-data.js — the real validator
  crashes pre-existing on events.json:157 before validating anything).
  Caught 1 real leak: gavel's unknown named "the gavel" — fixed.
- scripts/validate-ontology.js: 52/52 systems validated, release permitted.
- node --check on game.js: clean.

## Files changed

- src/data/monsters.json: +26 entries (30 old byte-identical, splice-append)
- src/data/schemas.json: +1 line (`pierce: number?` on monster)
- src/js/game.js: unlockedWave() wave-4/5 gates, scaleAtLeast(), waveUnlockBeat(),
  spawnWaveTarget() wave-5 ratios, unlock call site wires the beat
- docs/MONSTER-WAVES.md: canon status for waves 3-5 (gates, bands, anchor)
- scripts/: sim-dps-anchor, test-wave3-5, schema-check, gen-wave35 parts 1-3,
  assemble script (one-shots; harmless to keep)

## Notes for the coordinator

- Did NOT touch: build-notes.json, hierarchy.js, progression.js, ledger.js,
  index.html (per brief).
- The parallel scale worker owns scaleRank(); my gating reads it defensively
  and degrades to kills-only for wave 4 until it lands.
- Loot: w3 0.15/tier 2-3, w4 0.12/tier 3, w5 0.10/tier 3 (apex: Cancellation,
  Editor, Finale at tier 4, low rate — tiers never conflated with monster
  waves in code/comments).
- Not pushed / bumped / verified live — merged locally, pending ship.
