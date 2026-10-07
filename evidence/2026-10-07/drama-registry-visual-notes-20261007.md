# Drama registry visual proof — 2026-10-07

Proof script: `scripts/telegraph-proof-drama-20261007.js` (read-only vs engine: all `src/js` loaded via `git show HEAD:<path>`).
Capture data: `evidence/2026-10-07/drama-registry-visual-proof-20261007.json`.
Renders: `evidence/2026-10-07/drama-proof-<hook>.{svg,png}` (390px mobile grid, settled-state capture).

## HEADLINE: the migration was reverted — there are no migrated hooks at HEAD

Sibling commit **d2b6623** ("Fix double-tileCenter bug…", 11:44 CDT) landed ~2 min after
migration batch 4 (57464b5, 11:43 CDT) and **deleted the entire data-driven renderer**:
`renderEffect` + `effectRegistry` are gone from `src/js/drama.js` (0 references at HEAD).
This kills all four migration batches (68913c0 scaffold + b8a980f + 70ff157 + 65226c7 + 57464b5),
not just the batches in this task's scope.

Orphaned fallout (engine owner to decide):
- `src/data/dramaEffects.json` (34 entries, incl. the batch 2–4 hooks) is still fetched by
  `game.js:144-150` and assigned to `D.effectRegistry` — dead wiring; the JSON downloads
  for every player and is never consumed.
- `scripts/test-drama-registry-20261007.js` sets `Drama.effectRegistry` and calls
  `Drama.renderEffect(...)` — now a TypeError; the registry's green proof no longer runs.

Revert fidelity (method-level diff of all 17 hooks, pre-migration `70ff157^` vs HEAD):
- 14/17 byte-identical restore. No stale-base data loss.
- 3 differ ONLY by the intended dx/dy floatText fix (critHit, phaseShift, enrage) — the
  double-tileCenter fix survived the revert in imperative form. Verified in the renders:
  CRIT!/damage, WINDUP/STRIKE labels, 💢/ENRAGED all land on the anchor tile.

## Visual verdicts (current imperative implementations, what the player actually sees)

| Hook | Spawns | Verdict |
|---|---|---|
| exclaim `!` (L1) | 1 | PASS — red `!` above tile, legible at 28px |
| exclaim `?` (L3) | 1 | PASS — `?` + glow + 👁️ (eye is tofu in cairosvg only; fine on phone) |
| npcAlert warn | 1 | PASS — orange ⚠️, distinct from exclaim |
| npcAlert heart | 1 | PASS — pink ❤️, distinct |
| critHit L2/L3 | 3/4 | PASS — big yellow starburst + CRIT! + damage; L3 adds flash tint + shake(10). Very legible |
| contestLoser | 3 | **FAIL (positioning)** — dim + 💔 render; name label lands top-left, not centered (see F1) |
| phaseShift windup/strike | 2/2 | PASS — gold vs red ring + distinct labels; legible |
| enrage | 3 + shake(12) | PASS — red aura + 💢 + ENRAGED; distinct |
| contestAnnounce | 2 + shake(10) | PASS — full-screen pink wash + centered banner; unmistakable |
| systemCommentary | 1 | PASS — cyan italic line; legible |
| integrationPulse L3 | 2 | PASS — teal wash + SYSTEM hero card; distinct |
| abilityLevelUp | 2 | PASS — gold double ring + LEVEL UP + name; legible |
| synergyShimmer | 2 | **FAIL (positioning)** — shimmer wash renders; text lands top-left, not centered (see F1) |
| teaseFaint | 1 | MARGINAL — by design a whisper (radial wash, alpha 0.07); nearly invisible in static capture. Recommend a phone check that it's perceptible at all |
| ahaMoment | 2 | PASS — 💡 + radiating lines + centered quote; distinct |
| techniqueLearned | 3 | PASS — 📜 + gold name + System quote line (quote is centered in browser; left-clip in PNG is a cairosvg text-anchor quirk, NOT a game bug) |
| skillGained | 2 | PASS — teal beam + name; distinct |
| plantIdentified | 2 | PASS — green sprout + name; distinct |

No hook renders nothing. No two hooks render identically. All text is mobile-legible
(13–40px on a 390px grid) except the two F1 positioning failures.

## F1 (real bug, in 2 of the 17 hooks): `floatText('50%', …)` produces invalid CSS

`tileCenter('50%','50%')` falls through to the `{x:'50%',y:'50%'}` fallback, then
floatText builds `left:${'50%' + 0}px` → **`left:50%0px`** (invalid). The declaration is
dropped and the element renders at the overlay's top-left instead of centered.
Affected in-scope hooks: **contestLoser** (loser name), **synergyShimmer** ("something is
happening…"). Pre-existing — the migration's own `_note` on contestLoser misdiagnosed it
as "Name at screen center."

## F2 (sibling sweep of F1): same class at 6 more sites in drama.js

- integrationPulse L2 (:417) — '👁️ The System watches'
- weatherShift (:707, :718) — rain + cold-snap System notes
- mootGather (:775) — '📺 The System tunes in — the galaxy watches'
- exileMoment (:824) — '📺 The galaxy watches them go'
- reconcileGlow (:877) — `${name} — forgiven`

Suggested engine fix (not applied — engine is read-only for this worker): make
`floatText`/`tileCenter` handle percentage strings, or give these call sites a
centered-spawn path like `systemCommentary` uses (`left:50%;transform:translate(-50%,-50%)`).

## Capture artifacts (NOT game bugs)

- Emoji render as tofu boxes in cairosvg (👁️ 💔 ⚡ 💢 📜 🌱 ⬆️ 💡). They render on real
  phones; judging shape/color/position from the PNGs is still valid.
- techniqueLearned's quote line appears left-clipped in the PNG: isolated-element test
  proves cairosvg ignores `text-anchor="middle"` when the string contains an em-dash.
  Browser CSS centering is unaffected.
