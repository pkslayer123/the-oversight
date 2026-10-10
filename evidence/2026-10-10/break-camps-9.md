# break-it: camps & structures, round 9 — struck-break eviction lie (2026-10-09)

Worker: break-camps9 worktree. Proof: `scripts/test-camps9-breakit-20261009.js`
(49 checks. BEFORE run: 2 FAILURES — the catch below demonstrated red.
AFTER: ALL GREEN × 3 seeds: 20261009, 1, 777.)
Regressions green: test-camps6-breakit (40/40), test-camps7-breakit (71/71),
test-camps8-breakit (93/93), test-storage.js (59/59). Ontology gate: ✓ 52/52.

Canon: docs/CANON.md read. **There is NO dedicated camps canon doc** — stated
per instructions instead of inventing (same gap noted in rounds 6–8).
Relevant canon used: docs/STORAGE.md (stash/buried caches) + Steve's standing
law "Havens are the ONLY unbreakable human structures".

Context: rounds 1–8 killed phantom camps ×2, lying breakCamp messages,
pack→re-pitch free repair, shredded-tent state, room eviction invariants,
INFINITE BURY, sweepDeadFires eating tents, storm camp rules, bulldoze camp
integrity, the bridge system, camp↔fire interplay (stale-fire camp lie,
hearth-fire camp, struck-message fire lie, shredded-camp softlock, struck
sweep wrecking the other tent, dead setUpDay field), cookFood stale-fire gate,
pitchTent cost engine honesty, tent persistence on travel, destroyCell camp
kill, one-camp-at-a-time, cook-in-tent fire lie, wreckTent/destroyCell
over-break (campTentStanding rule), travel phantom tent room. This pass
attacked what they left alone: struck-break eviction, exile↔camp interplay,
bury-at-camp, the cookInTent fire-death race, and a dead-code re-scan.

## CATCH 1 — STRUCK-BREAK EVICTION LIE (honesty + unjust eviction) — BROKE, FIXED
**Attack:** two tents pitched on the camp tile, player inside tent A, strike
tent B. packTent(B) → breakCamp('you packed up the tent') — the STRUCK path,
which never packs the tent you're in (packTent refuses). breakCamp's tent-room
dump was unconditional: BEFORE cleared insideTent and said "The canvas comes
down around you — you crawl out into the open, coughing." The canvas did NOT
come down — tent A stands, intact, yours. Eviction from a standing tent plus
a lying message, engine-side (the honest UI's tent room replaces the grid, so
this is engine armor for direct calls/debug scenarios — same class as round
8's travel phantom fix).
**Fix (game.js breakCamp):** the dump now checks the room — cell still a yours
non-shredded tent → you stay inside; gone/wrecked → honest eviction. The
struck path now leaves you in the standing tent; the destroyed path (storm /
wreck / bulldoze sweep wrecks the tents) still evicts honestly. Proof C1a/C1b
red→green; controls C1e–C1h (destroyed-camp eviction, wreckTent eviction via
the validateInsideTent choke point) green throughout; C1i/C1j confirm the
struck fire interplay from rounds 3/7 still holds (other tent's interior fire
survives, packed tent's fire purged).

## Held (attacked, resisted / verified)
- **EXILE + CAMP (H1):** exilePlayer leaves state.camp and pitched tents
  standing — physical persistence. Tents are facts on the ground; the exile
  comment's "what crosses the road with you: yourself, your Codex, your pack.
  Nothing else" refers to the join lapsing, not to deleting physical things.
  Verified: camp reference intact, tents standing, no tent items minted,
  campTentStanding still true (no phantom camp). Not changed.
- **BURY AT CAMP + STORM (H2):** a buried cache on the camp tile survives
  breakCamp — the hole is in the ground, not in the tent. INFINITE BURY stays
  dead: digUpCache returns the goods exactly once (second dig no-ops).
- **DEAD CODE re-scan (H3):** all 29 camp/structure helpers (pitchTent …
  havenStoresAccess) defined AND called, scan now including app.js callers —
  same bar as round 8. No dead camp helper.
- **cookInTent fire-death race:** the fire can die during the 24-tick cook —
  but cookAll's wrapper downgrades the batch on mid-cook fuel death (forager
  break-it), never pay-then-refuse. Held.
- **'Pack up tent' button while inside:** unreachable — the tent room replaces
  the grid (app.js), and packTent refuses honestly anyway ("You are inside it
  — duck out through the flap first."). Held.

## Sibling sweep (same bug class: unconditional insideTent dumps)
All other `insideTent = null` sites audited: travelTo (intentional — "you walk
out of the tent to travel", honest comment), validateInsideTent (checks
cell/secret — camps-5, correct), exitTent (voluntary), faceTentIntruder
eyes_in_back ("out the other side before it gets inside" — honest) and breach
(tent wrecked — honest "thrown clear"). No second worker needed; the class is
closed.

## For Steve's overrule
Nothing needs design adjudication — the fix aligns engine with existing
copy/rules. The struck-path "Camp struck — the tent's back in your pack"
message is unchanged and still honest.
