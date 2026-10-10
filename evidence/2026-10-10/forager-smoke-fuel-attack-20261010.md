# Break-it: forager r5 — smoke/render fuel (2026-10-10)

Target: archetype 0 (forager), hostile pass over the SMOKE/RENDER fuel
economy (`Game.preserveFood`, `Game.renderFat`). Canon: docs/PRESERVATION.md
(16-tick smoke pace; "energy is never created"). Proof:
`scripts/test-forager-smoke-fuel-20261010.js` — 11/11 BEFORE (demonstrates the
exploit), 17/17 AFTER x 3 seeds (20261010, 7, 99).

## KILL (broke, fixed, proven)

### E1. EXPLOIT: smoking/rendering burned zero fire fuel
`cookFood` and `cookAll` drain the tracked player fire via
`consumeCookFire()` and downgrade the outcome when the fire dies mid-session.
`preserveFood` (16 ticks) and `renderFat` (12 ticks) never called it — a fire
with 3 ticks of till smoked the whole harvest and lived. Measured BEFORE:
till delta 0 on both paths; a dying fire changed nothing.

Fix (my design call — Steve can overrule): a smoke press burns one 16-tick
fire session, a render press 12 ticks. A fire that dies mid-press drops the
batch to the rough-job outcome (blind values: smoke 0.80x / +15d, render
0.65x) with narration — the same fiction as cookAll's batch path. Nothing
burns on an empty press; untracked map hearths stay free (established). The
died-fire smoke prep names the dead fire, not the smoker's hands
("Smoked (rough job). The fire died halfway — uneven, damp in spots.").

This closes the "broader batch pattern" the 2026-10-09 cookall run noted but
left open.

## HELD (attacked, resisted — measured)

### E2. Specialist cook fallback print (dead code, no break)
The rawKcal fallback at food.js:1081 multiplies by `(1 + 0.05 * skill)` when
`cookTransform` returns null. Attacked: `cookClassFor` covers every rawKcal
item (the `if (item.rawKcal)` branch returns grain_legume, which has
raw/cooked in data/cooking.json), and `cookTransform`'s `Math.min(gross,
...)` caps the skill mult anyway. No phantom energy reachable — held.

### S1. Softlock edges
Empty press: no fuel burned, "Nothing to preserve", no throw.
`preserveFood(999)` / `renderFat(-1)`: null, no throw, no fuel burn.

### H1. Label honesty
Fire-context "Smoke N (preserve)" / "Render N fat" labels count exactly the
engine's pre-rot-drop target filter (2/2 meat, 0/2 fat in the probe).

## Proof / regressions
- New: scripts/test-forager-smoke-fuel-20261010.js — BEFORE 11/11 (exploit
  demonstrated); AFTER 17/17 x seeds 20261010/7/99.
- Regressions: break-food-20261009 116/116; 20261010 16/16; 20261010b 19/19;
  20261010c 25/25; food-reality 91/91; cookall-fuel 18/18; sweep 17/17;
  meal-20261010 14/14; pemmican-print 15/15; engines/merges/pantrycap/spoilage
  all green. Ontology 53/53.
- Pre-existing failures (identical on pristine HEAD, not mine): break-food-r3
  W4b (documented since the 2026-10-10 meal run); break-food-r4 W3a/W3b/W3c
  (frenzy/trust — different system); rotfarm H1 clock labels 3x.

## FUN notes
- The fire-death downgrade makes the fire feel like a real participant in
  preservation, not just a gate check — feeding the smoke fire matters now.
- [needs-eyes] Player-facing feel change: smoking/rendering on a dying
  tracked fire now costs the fuel honestly and can produce rough jobs. Worth
  a phone check that the narration lands.
