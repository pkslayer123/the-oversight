# break-it: camps & structures, round 7 — CAMP+Fire interplay (2026-10-09)

Worker: break-camps7 worktree. Proof: `scripts/test-camps7-breakit-20261009.js`
(71 checks. BEFORE run: 14 FAILURES — every catch below demonstrated red.
AFTER: ALL GREEN × 3 seeds: 20261009, 1, 777.)
Regressions green: test-camps6-breakit (40/40), test-storage.js (59/59),
attack-survivalist-r3 (14/14). Ontology gate: ✓ 50/50 validated.

Canon: docs/CANON.md read. **There is NO dedicated camps canon doc** — stated
per instructions instead of inventing. Relevant canon used: docs/STORAGE.md
(stash/buried caches) + Steve's standing law "Havens are the ONLY unbreakable
human structures (plus alien structures when they exist)."

Context: rounds 1–6 killed phantom camps ×2, lying breakCamp messages,
pack→re-pitch free repair, shredded-tent state, room eviction invariants,
INFINITE BURY, sweepDeadFires eating tents, storm camp rules, bulldoze camp
integrity, and the bridge system. This pass attacked what they left alone:
camp↔fire interplay, pitchTent cost honesty (copy was fixed in 42a140a —
this pass attacked the ENGINE), the struck path's other tents, scorchCells vs
state.camp, and stale fire cells.

## CATCH 1 — STALE-FIRE CAMP LIE (honesty) — BROKE, FIXED
**Attack:** setUpCamp → hasCampfireNearby never called sweepDeadFires. A
burned-out player fire leaves its 'fire' cell until some fire-touching path
runs — setUpCamp isn't one. Proof: dead tracked entry (till in the past) +
'fire' cell + pitched tent → BEFORE founded the camp: "Camp made. Tent up,
fire going" — on a cold pit. The fire was dead; the copy promised it going.
**Fix:** hasCampfireNearby sweeps first, then requires a YOUR live tracked
grid fire within 1 of the player (also verifies the cell is actually 'fire',
guarding split-brain). Proof E3/H5 red→green.

## CATCH 2 — HEARTH-FIRE CAMP (honesty) — BROKE, FIXED
**Attack:** map-gen 'fire' cells counted as "your campfire" — the haven hearth
(genDetail emits them) and edge-blended wild fires from haven neighbors.
Proof: 'fire' cell with NO tracked entry → BEFORE founded a camp on a fire
the player never built. Then breakCamp promised "the fire's scattered cold"
about a hearth that keeps burning — and the camp's fire sweep can't kill
what it never tracked.
**Fix (decide-and-document, Steve can overrule):** the camp's fire is YOUR
fire — same hasCampfireNearby change. The hearth stays usable for cooking/
warmth (established fires, by design); it just can't found a camp. Proof E4
red→green.

## CATCH 3 — STRUCK-MESSAGE FIRE LIE (honesty) — BROKE, FIXED
**Attack:** breakCamp('you packed up the tent') checked the ledger raw:
`fires.some(f => f.tx === c.px && f.ty === c.py)` — no sweep, no till check.
Proof: kill the camp's fire (till in past, untouched) → pack the tent →
BEFORE said "The fire keeps burning; it'll die on its own" — about a fire
already cold.
**Fix:** sweep first, then name only live grid fires (`!f.inside`, `till >
now`). Proof H3 red→green; H3c control (live fire still honestly "keeps
burning") green throughout.

## CATCH 4 — SHREDDED-CAMP SOFTLOCK (softlock) — BROKE, FIXED
**Attack:** scorchCells (the monster beam) shredded the camp's tent
(condition → 'shredded') but never touched state.camp. The camp stood on
ribbons: packTent refuses shredded, enterTent refuses shredded, no abandon-
camp action exists, and "Set up camp" says "already your camp". A stuck camp
— with the sort ritual (atCamp) still working on wreckage. Same phantom-camp
class as wreckTent (round 2) and destroyCell (round "camps" 2026-10-08).
**Fix:** scorchCells post-loop: if state.camp is on this tile and no INTACT
yours-tent remains, breakCamp('the beam tore it to ribbons'). breakCamp's
sweep wrecks the shredded tents and kills the fires honestly; a surviving
intact tent keeps the camp standing (no over-break — proof S2). Proof
S1/S1b/S1c/D5 red→green; S3 (re-founding after the break) green.

## CATCH 5 — STRUCK SWEEP WRECKED THE OTHER TENT (honesty) — BROKE, FIXED
**Attack:** pitch two tents, set up camp, pack ONE. breakCamp('you packed up
the tent') ran the tent sweep anyway and silently wrecked the OTHER tent —
no tent item back, no message. "Struck, not destroyed" — except the rest.
**Fix:** the tent sweep runs only when the camp is DESTROYED (!struck). A
struck camp's other tents stand — still pitched, still yours, still
set-up-able. Proof E5 red→green.

## CATCH 6 — DEAD setUpDay FIELD (dead code) — REMOVED
**Attack:** setUpCamp wrote `setUpDay: this.state.day` on every camp; grep
found zero readers. Write-only ledger field. Removed (one line). Proof D4
red→green.

## CATCH 7 — SIBLING: cookFood's STALE-FIRE GATE (honesty) — BROKE, FIXED
**Attack (sibling sweep, same bug class as C1):** cookFood scanned for any
'fire' cell without sweeping. A dead player fire passed the gate; then
consumeCookFire found no live tracked fire and returned 'ok' — BEFORE proof
shows "Cooked Test berries: 50 → 50 kcal" over a COLD pit. Free cooking.
**Fix:** sweepDeadFires() before the gate. Hearth cooking untouched (map
fires are established, never swept — proof H6b). Proof H6 red→green.

## Also fixed (honesty nits)
- setUpCamp copy now names its 30 ticks of work (rest/boil name theirs;
  pitchTent was fixed in 42a140a). Proof H2 red→green.
- breakCamp destroy copy pluralizes: "The 2 tents are wrecked" (was always
  singular even when the sweep wrecked both). Proof H4 red→green.
- setUpCamp fire refusal is now specific: "You need your own campfire burning
  to make camp — a hearth or a cold pit doesn't count." Proof H5 red→green.

## Held (attacked, resisted / verified)
- **pitchTent cost honesty (42a140a's copy fix):** engine charges EXACTLY 50
  kcal + 48 ticks — copy and engine agree (E1/E2/H1 green throughout).
- **PERSISTENCE of travel:** t.detail is cached by genDetail — pitch a tent,
  travel away, travel back: tent and camp persist. No decay by design (S7).
- **packTent has no canCarry check** (unlike found-tent pickup): deliberate.
  Your own shelter must always be packable; refusing would softlock a heavy
  player out of their tent. Encumbrance is the player's problem.
- **Death keeps the pitched tent standing** (ledger.js: "The tent still
  stands, if anyone walks back for it") — village-continuity design; the
  successor inherits via the still-yours secret. Documented, not changed.
- **feedFire's uncapped till:** each feed costs 8 ticks + real fuel — finite
  fuel, no infinite loop.
- **Bulldoze camp integrity (round 6 re-verify):** destroyCell on the camp
  tent still kills the camp with the honest cause copy (S6).
- **Shredded-tent eviction (round 5):** validateInsideTent still dumps the
  sleeper (S4). Storm while inside the tent dumps you outside (S5).
- **One-camp-at-a-time:** setUpCamp on a new tile still abandons the old,
  message names it (H7). Pitch→pack→pitch conserves exactly one tent (E7).
- **DEAD CODE sweep:** packTent, wreckTent, breakCamp, destroyCell,
  scorchCells, stormSmashBridges, validateInsideTent, setUpCamp,
  hasCampfireNearby, atPlayerCamp, pitchTent, enterTent, lightTentFire — all
  defined AND called (wreckTent's single caller is the tent-breach branch;
  atPlayerCamp is wired via food.js atCamp). No dead camp helper. Storm's
  camp sweep fires at runtime (D2: resolveStormFront sheltered → camp gone).

## Flagged for the alien-players run (out of area, not fixed)
- `apDousePlayerFire` (alienPlayers.js) douses the nearest 'fire' CELL —
  including hearth cells — while claiming to douse YOUR fire. After this
  pass's fix, camp logic no longer trusts the cell, but the raid copy ("your
  fire") can still target a hearth. Same cell-vs-ownership class; belongs to
  target 7.

## For Steve's overrule
The hearth-can't-found-a-camp rule is a design call made under "figure it
out yourself": the camp's fire is yours or it isn't a campfire; hearths stay
fully usable for cooking/warmth. If he'd rather hearth-camps be allowed, the
revert is the `!f.inside` tracked-fire requirement — but breakCamp's "fire's
scattered cold" copy would then lie about hearths again.
