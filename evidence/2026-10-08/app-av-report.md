# app-av worker report — audio registry cleanup + wave-2 telegraph distinctness
Steve 2026-10-08 · worktree `app-av` (base 5b266b2) · owns src/js/app.js only

## 1. catfishLure dedup — DONE
**Before:** two `function catfishLure()` definitions inside the CombatAudio IIFE
(2026-10-05 "NIGHTLIGHT LURE" ~6073 + 2026-10-07 "NIGHTLIGHT AGGRO" rewrite ~8906)
and two identical registry keys (~10332 "Batch monsters", ~10462 round-5 aggro).
JS hoisting meant only the later (AGGRO) definition ever executed — the LURE was
dead code shadowing nothing, confusing every future reader.

**Determination of live/correct:** the 2026-10-07 AGGRO voice is live (later
function declaration wins) AND correct — it is the deliberate round-5 rewrite
wired as `nightlight_catfish`'s aggroAudio ("pretty is the problem"), matching
monsters.json `encounter.aggroAudio: "catfishLure"`.

**After:** one definition (the AGGRO voice), one registry key (with the
descriptive round-5 comment). Removed: dead 6073 definition (33 lines), duplicate
10332 registry key.

**Proof:** `scripts/test-audio-catfishlure-proof.js` — 18/18 green:
- exactly 1 definition + 1 registry key; no stale 3.7x-partial fingerprint
- monsters.json `encounter.aggroAudio` resolves to the surviving key
- the surviving synth runs clean against a mocked WebAudio graph and schedules
  the documented voice: 220Hz breathing pulse, 0.7Hz LFO swell, 900Hz underwater
  lowpass, 300Hz/Q4 glug, grasp at t+1.5 with lowpass suction 800→150,
  thump at grasp+0.55

## 2. warrantyCall — verified ZERO references
`grep -r warrantyCall src/` returns nothing (checked in the audio proof test,
assertion 17/18). Nothing to create, nothing to wire.

## 3. Wave-2 escalation leftovers — REMOVED (all dead, verified)
- `camera_swarm → w2aSwarm` class mapping (renderDetail) + `.cell.w2aSwarm` CSS
  + `@keyframes w2aStrobe` + reduced-motion entry: camera_swarm is retired
  (renamed to paparazzo per monsterBehaviors.json; absent from monsters.json and
  from W2A_IDS). Its flashbulb strobe voice is salvaged into the paparazzo's new
  w2bPz EXPOSURE treatment.
- `delegate_beast` charge→encircle routing (tbAllTelegraphCells) + the entire
  `out.encircle` bucket + `encircleAngle` + `encircleLane` render path:
  delegate_beast is retired; the routing was the bucket's only producer.
  Stale cross-references in dozeLane/ducks comments reworded.
- Retired-id comments in `burstWindup` (camera_swarm, hype_horn) and
  `chargeWindup` (delegate_beast): reworded to live monsters, retirement noted.
- Note for game.js owner (NOT touched — out of my area): `beastCircleKeys()`
  (game.js ~22050) and `beastIs()` are delegate_beast-gated and now unreachable;
  `managerFear` audioEvent at game.js:13222 references the retired id too.

## 4. Wave-2 telegraph distinctness — DONE
**Before** (sibling judgment evidence/2026-10-08/telegraph-visual-judgment.md):
9 of 14 render targets generic — 3 bursts shared one orange burstRadius
(bright_idea windup, paparazzo, statickite), 5 directs shared one purple lockOn
(understudy, landlord, heckler, union_rep, moderator), and w2aStatic's violet
overlay was invisible at mobile size. Paparazzo's `exposure` burstStyle mapped
to no bucket.

**After:** W2A_IDS expanded to all 11 wave-2 monsters with grid telegraphs
(warranty_caller is rush — declares nothing by design). Each gets a distinct
injected-CSS voice (all inline in app.js, no main.css touch, per precedent):

| Monster | Class | Voice |
|---|---|---|
| voice_mimic_radio | w2aStatic (boosted) | VOICE-RIPPLE: 3px electric-violet #d9a7ff outline, glowing violet fill (real color distance from lockOn purple), expanding ripple ring, ≋ glyph |
| bright_idea | w2bIdea | EUREKA WARM-UP: radial ember glow every windup tick; class withheld on last tick so biHot white-hot wins (cascade-verified: class !important would beat inline) |
| paparazzo | w2bPz | EXPOSURE: near-black cell, hard white strobe, viewfinder corner brackets |
| statickite | w2bKite | THE BROADCAST: jagged cyan-white static bands + ↯ (area static — distinct from the radio's violet voice) |
| understudy | w2bUnder | THE MIMIC: dark plum fill, WHITE dashed outline (negative of your lock-on), ◐ |
| landlord | w2bLord | EVICTION NOTICE: red caution-tape stripes + § |
| heckler | w2bHeck | THE TAUNT: hot-pink radial glow + ‼ |
| union_rep | w2bUnion | GRIEVANCE FILED: ledger-blue ruled lines |
| moderator | w2bMod | REMOVAL NOTICE: heavy dark-red stamp + ✕ |
| mirror_stag / review_drone / memory_projector | w2aStag / w2aDrone / mpBeam | unchanged (already distinct) |

All 11 voices are pairwise distinct by (outline color, outline style, fill
family, glyph) — asserted in code, not by eye. All classes covered by
prefers-reduced-motion. Knowledge gating untouched: mon map populates only for
learned patterns.

**Proof:** `scripts/test-telegraph-wave2-proof.js` — static assertions (routing
fidelity, pairwise distinctness, dead-ref absence) plus 15 SVG+PNG captures at
390px in `evidence/2026-10-08/telegraphs-wave2b/` (see below), judged at mobile
size. Compare against the before-captures in `evidence/2026-10-08/telegraphs/`.

## Captures (after)
- evidence/2026-10-08/telegraphs-wave2b/voice_mimic_radio-telegraph.png — violet ripple + ≋
- evidence/2026-10-08/telegraphs-wave2b/bright_idea-telegraph.png — ember warm-up
- evidence/2026-10-08/telegraphs-wave2b/bright_idea-telegraph-bihot.png — white-hot last tick (unchanged)
- evidence/2026-10-08/telegraphs-wave2b/paparazzo-telegraph.png — exposure flash + viewfinder
- evidence/2026-10-08/telegraphs-wave2b/statickite-telegraph.png — static discharge
- evidence/2026-10-08/telegraphs-wave2b/understudy-telegraph.png — white-dashed mimic
- evidence/2026-10-08/telegraphs-wave2b/landlord-telegraph.png — red tape §
- evidence/2026-10-08/telegraphs-wave2b/heckler-telegraph.png — pink ‼
- evidence/2026-10-08/telegraphs-wave2b/union_rep-telegraph.png — ledger blue
- evidence/2026-10-08/telegraphs-wave2b/moderator-telegraph.png — banhammer ✕
- evidence/2026-10-08/telegraphs-wave2b/mirror_stag-telegraph.png — unchanged
- evidence/2026-10-08/telegraphs-wave2b/review_drone-telegraph.png — unchanged
- evidence/2026-10-08/telegraphs-wave2b/memory_projector-telegraph.png — unchanged
- evidence/2026-10-08/telegraphs-wave2b/gallowdeer-telegraph.png — benchmark
- evidence/2026-10-08/telegraphs-wave2b/warranty_caller-telegraph.png — no telegraph by design

## Files changed (app.js only, +2 proof scripts, +1 evidence note)
- src/js/app.js: catfishLure dedup, dead escalation removal, w2b telegraph voices
- scripts/test-audio-catfishlure-proof.js (new, 18/18 green)
- scripts/test-telegraph-wave2-proof.js (new)

## Judgment (mobile scale, by builder — 2026-10-08 ~00:55 CDT)
Viewed all 15 captures at 390px. Verdict: **all 11 wave-2 voices read as their
own thing at a glance** — the generic-sharing is gone.

- **Direct family** (the worst offender): six tiles that were one identical
  purple square are now unmistakable — violet ripple + ≋ (Static), white-dashed
  mimic + ◐ (Understudy), red tape + § (Landlord), hot-pink + ‼ (Heckler),
  ledger blue (Union Rep), dark-red stamp + ✕ (Moderator). Each ALSO rings the
  player token in its own color (new W2B_RING, following the established
  diveTarget/sbLockTarget pattern), because the token swallows the tile fill —
  the ::after glyphs paint above the token in the real game (positioned
  element over in-flow content), verified in the renderer's paint order.
- **Burst trio**: Paparazzo's 5×5 is now black cells + white strobe + viewfinder
  corners (reads as FLASH, not explosion — the retired camera_swarm's flashbulb
  voice salvaged); Statickite is cyan zigzag static + ↯; bright_idea is amber
  ember radial (white-hot biHot on the last tick preserved — the class is
  deliberately withheld that tick because class !important would beat the
  inline biHot style in the cascade).
- **Static specifically**: the old #b388ff-on-#9d4edd hue shift is replaced by
  #d9a7ff outline on a glowing violet fill with an animated ripple ring —
  visible without side-by-side comparison.
- Unchanged and still distinct: mirror_stag, review_drone, memory_projector,
  gallowdeer benchmark. warranty_caller: no telegraph by design (rush).

No regressions: audio census 42/42, audio-complete 321/321, ontology 46/46
validated, tgPlayerAlertClasses contract 13/13 (incl. legacy diveTarget/
sbLockTarget). Pre-existing failure noted: scripts/test-telegraph-judgment.js
section (a) crashes on `mdef('delegate_beast')` → undefined (retired from
monsters.json at HEAD; game.js tbTelegraphCue) — not caused by this work;
flagged for the game.js owner. Follow-ups for game.js owner (out of my area):
`beastCircleKeys()`/`beastIs()` delegate-gated and unreachable; `managerFear`
audioEvent at game.js:13222 references the retired id.
