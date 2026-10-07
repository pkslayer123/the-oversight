# Nightlight Catfish — played pass (2026-10-07)

Worker A. Harness: `scripts/play-feel-20261007-catfish.js` (node, deterministic —
mulberry32, default seed 20261007, `SEED=` override; green on seeds 20261007, 7, 42).
Engine loaded read-only from HEAD via `git show`; nothing in the worktree touched.

## Setup
Creek pool on interior water tiles (3,2),(4,2),(3,3),(4,3); night (dayPart 3);
player starts (4,6); catfish spawns ON the water at (3,2). Two passes, 1v1.

## Pass 1 — BLIND (no codex, unarmed, curious)
The brain does what the fiction asks: walks right up to the pretty glow.

- **r1** — Step to (2,3), one tile off the water. *"A soft green glow pulses
  under the water. Pretty. You want to look closer. That's the idea."* then
  *"The water goes still around the light. Too still. Something down there
  just noticed you."* Phase: lure → still. Tell cell: null. Badges: none.
  I felt the hook working — I *wanted* to lean in.
- **r2** — Held, gawking. *💥 The glow LUNGES — teeth where the light was!
  LURE AND GRASP!* 20 damage. *📖 Codex: Lure and Grasp — locks onto one
  target — moving won't dodge it. You won't forget this.* The bite teaches.
- **r3–r5** — Grasp aftermath (*"The glow gutters out. Dark water. It's
  moving."*), two dark turns of random repositioning, then the re-lure
  (*"A tile or two over, the green glow rekindles. Pretty. That's still the
  problem."*). Full cycle lure→still→grasp→dark→lure legible from text alone.
- **r6–r13** — Wary now: held at d=3–4. The stillness *hunts*: lines escalate
  (*"The stillness spreads — the glow is nearer than it was"*) and every
  other still-turn the glow creeps one tile closer. I backed off; it kept
  coming. r13: grasp #2 (20 dmg). The stand-off is a timer, not a safe spot —
  this is the fight's cruelest and best idea.
- **r14–r40** — Got cornered at the grid edge (1,7); the catfish crept to
  (2,7) and bit me every cycle (114 total grasp damage over the pass). An
  unarmed blind player has no answer — which is honest, not unfair: the
  fiction never promised one.

Phase-legibility verdict: every grasp in the pass fired **exactly one full
turn after** the stillness was announced. The tell is unfailingly fair.

## Pass 2 — KNOWING (codex taught, sling + stones)
- **r1** — Walked the tell to d=3. Still phase; **the catfish's own tile
  shimmered** (`catfishTellCell()` → (3,2)); badge 🪷 TOO STILL. The grid
  itself confirms what the text implies — the "aha" lands visually.
- **r2–r4** — Sling the light from range 3–4: 19, 19, dead. Zero damage taken.
  The catfish never left lure — it sat waiting while I killed it. Its
  strength (infinite patience, never chases) is exactly its weakness.

## Judgement (as a player)

- **Phase legibility**: excellent. lure→still→grasp→dark reads from fiction
  alone; badges (💡 LURING / 🪷 TOO STILL / 🐟 GRASP! / 🌑 DARK) cohere with
  the phase the player sees; the grasp beat holds its badge for the full
  turn (the 2026-10-06 fix is load-bearing here).
- **Learnability**: the counter is lateral, not a stat check — *don't wade
  in; strike the light from range*. A knowing player with the humblest
  ranged weapon (sling, bonus 8) takes zero damage. The trick IS the fight.
  Very Undertale: the fun is the discovery, the kill is the receipt.
- **Known-vs-unknown**: "if you don't know, it doesn't show" HOLDS. Blind:
  no badges, no tell shimmer, no coaching leak (asserted live every round).
  Knowing: everything unlocks and the fight transforms completely
  (114 dmg / 40 rounds / unanswered → 0 dmg / 4 rounds / slain).
- **Feel**: real tension (the creep corners you), fair (one full turn of
  warning, every time), memorable (the lure worked on *me*). The knowing
  kill is anticlimactic in execution — two plinks and it's over — but that
  is the design's bet, and the design earns it.

**Verdict: GOOD, borderline FUN.** The discovery arc is the fun; the kill
is deliberately thin. Would be FUN outright if the earned coaching (bug 1
below) actually reached the player — right now the "aha" has no voice.

## Bugs found (flagged, NOT fixed — engine off-limits)

1. **Dead knownCue (real bug).** The catfish's data `knownCue` — *"The glow
   is a mouth. It won't chase you — it waits for you to come close. Strike
   the light from range. Never wade in."* — has **no surface in the engine**.
   The catfish never sets `m.telegraph`, so `tbTelegraphCue` (the only
   `knownCue` carrier, via `knownTail()`) never runs for it. The coaching is
   earned knowledge with no delivery. **Sibling sweep**: ducks surface theirs
   in the regroup beat (`The line reforms — … ${dkc}`); voice-mimic got the
   identical fix 2026-10-06 (watching beat carries `smKc` once learned);
   glasswing sets `m.telegraph` so `knownTail()` appends it. The catfish is
   the outlier. Suggested shape (engine owner): append the knownCue, gated
   on `encTelegraphKnown`, to the re-lure or still-escalation line —
   mirroring the voice-mimic fix.
2. **Codex text nit.** `tbLearnPattern` writes *"locks onto one target —
   moving won't dodge it"* but the grasp is a cheb-≤2 burst hitting every
   player/villager in radius (data says `pattern.range: 3`, code uses ≤2).
   Three numbers, none agreeing: burst radius 2 vs data range 3 vs
   "one target" prose. Pick one truth.
3. **Observed out of scope (pre-existing).** `equipment.js` attaches
   `S.equipment` to `window.S`; `game.js` reads it from
   `global.Scattering` (`const S = global.Scattering`). In production these
   are different objects, so every `if (S.equipment)` guard in game.js is
   dead and equipment bonuses never apply (e.g. villager `wbonus`/`varmor`
   in `startCombat`). Not catfish-related; flagging for the engine owner.

## Files
- Harness: `scripts/play-feel-20261007-catfish.js`
- This note: `evidence/2026-10-07/catfish-playtest-notes-20261007.md`
