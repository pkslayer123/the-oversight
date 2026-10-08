# Telegraph Visual Judgment — wave-2 monsters + Highbeam Deer
Steve 2026-10-08 · evidence run by telegraph-visuals worker · read-only on src

## Method
- Telegraph cell geometry computed with the engine's own `S.combat.patternCells`
  (src/js/engine/combat.js) — same math the game uses to declare telegraphs.
- Visual routing reproduced EXACTLY from app.js `tbAllTelegraphCells`
  (base bucket per pattern type → STYLE_BUCKETS routing → W2A_IDS overlays →
  mpBeam tint → biHot), including the silent fallthroughs.
- Rendered at 390px width (mobile scale), player at (4,4), patterns LEARNED —
  the game hides telegraphs entirely for unknown patterns, so "learned" is the
  only state where a visual exists at all.
- Judged at mobile size: does the telegraph read as its own thing (beam sweep
  vs charge lane vs burst radius vs lock-on), or as a generic highlight?

## Per-monster verdicts

### DISTINCT — reads as its own visual voice
| Monster | Attack | Image | Why it reads distinct |
|---|---|---|---|
| Highbeam Deer (benchmark) | Ocular Discharge | `evidence/2026-10-08/telegraphs/gallowdeer-telegraph.png` | Harsh red beamLane (#ff3b30) lane, 8 cells long. The bar. Unmistakable. |
| Grief Counselor (mirror_stag) | Confrontation | `evidence/2026-10-08/telegraphs/mirror_stag-telegraph.png` | Pale-glass mirror-shimmer lane (w2aStag) — cool blue-grey vs the generic yellow charge lane. Reads as "wrong glass," not a hazard stripe. |
| Performance Review (review_drone) | Scored Assessment | `evidence/2026-10-08/telegraphs/review_drone-telegraph.png` | Cyan dotted projected grid over the beam. Cool/bureaucratic vs the Deer's hot red. Immediately different monster. |
| Nostalgia (memory_projector) | Home Movies | `evidence/2026-10-08/telegraphs/memory_projector-telegraph.png` | Warm amber home-light tint (mpBeam) — soft gold, not the Deer's red or the drone's cyan. |
| Inspiration (bright_idea, last tick) | Eureka | `evidence/2026-10-08/telegraphs/bright_idea-telegraph-bihot.png` | White-hot burst on the final windup tick — the only white telegraph in the set. Urgent, scary, correct. |

### GENERIC — renders as the same highlight as another monster
| Monster | Attack | Image | What it shares |
|---|---|---|---|
| Inspiration (bright_idea, windup) | Eureka | `evidence/2026-10-08/telegraphs/bright_idea-telegraph.png` | Generic orange burstRadius — identical to Paparazzo's and Statickite's. The `detonation` burstStyle in data has NO STYLE_BUCKETS entry, so the first 1–2 windup ticks are a plain orange burst. Only the last tick (biHot) earns its identity. |
| The Paparazzo | Flash Photography | `evidence/2026-10-08/telegraphs/paparazzo-telegraph.png` | Generic orange burstRadius — identical to Inspiration's windup and Statickite's. The `exposure` burstStyle in data has NO bucket (see gaps below). A *flash* attack reads as a generic explosion. |
| The Static Kite | The Broadcast | `evidence/2026-10-08/telegraphs/statickite-telegraph.png` | Generic orange burstRadius, only smaller (3×3). Identical visual family to the two above. |
| The Understudy | Your Move | `evidence/2026-10-08/telegraphs/understudy-telegraph.png` | Generic purple lockOn on the player's tile — identical to Landlord/Heckler/Union Rep/Moderator. |
| The Landlord | Eviction Notice | `evidence/2026-10-08/telegraphs/landlord-telegraph.png` | Generic purple lockOn — identical to all other direct attacks. |
| The Heckler | You Call That A Swing? | `evidence/2026-10-08/telegraphs/heckler-telegraph.png` | Generic purple lockOn — identical to all other direct attacks. |
| The Union Rep | Grievance Filed | `evidence/2026-10-08/telegraphs/union_rep-telegraph.png` | Generic purple lockOn — identical to all other direct attacks. |
| The Moderator | Removal Notice | `evidence/2026-10-08/telegraphs/moderator-telegraph.png` | Generic purple lockOn — identical to all other direct attacks. |
| Static (voice_mimic_radio) | Distress Call | `evidence/2026-10-08/telegraphs/voice_mimic_radio-telegraph.png` | lockOn + w2aStatic violet overlay — BUT violet (#b388ff) over purple (#9d4edd) is a subtle hue shift that reads as "generic purple lock" at mobile size. The voice-ripple is effectively invisible; only a side-by-side comparison reveals it. Filed under generic-ish → weakest 3. |

### By design — no grid telegraph
| Monster | Attack | Image | Note |
|---|---|---|---|
| Extended Warranty (warranty_caller) | The Pitch | `evidence/2026-10-08/telegraphs/warranty_caller-telegraph.png` | rush pattern declares nothing — "No telegraph. That's the point." Correct as designed; the text/audio cue carries it. |

## Scoreboard
- Distinct: 5 of 14 render targets (Deer + Stag + Drone + Projector + Idea-last-tick)
- Generic: 9 of 14 (3 bursts share one visual; 5 directs share one; radio's overlay is too subtle to count as distinct at mobile size)
- By design, no visual: 1 (warranty_caller)

## Weakest 3 (ranked — most need visual work)
1. **The direct-attack family (Understudy / Landlord / Heckler / Union Rep / Moderator).** Five monsters, five rich telegraph fictions ("the sign has your name on it", "doing the thing you do before you do it", banhammer), ONE identical purple square on the player's tile. The telegraph *texts* are among the best in wave 2 — the grid tells you nothing that distinguishes them, and nothing about what KIND of hit is coming. This is the biggest distinctness gap in the set.
2. **The Paparazzo.** `exposure` burstStyle exists in monsters.json but maps to no bucket — the attack renders as the same orange burst as Inspiration and the Static Kite. A flash-bulb attack that doesn't look like a flash is a fiction/visual mismatch.
3. **Static (voice_mimic_radio).** The w2aStatic voice-ripple (violet #b388ff) over the lockOn purple (#9d4edd) is a hue shift too subtle to read at mobile size. Either widen the color distance or give the ripple a shape (concentric rings on the tile, a sound-wave glyph), or it may as well not exist.

## Code gaps observed (read-only — NOT fixed this run)
- `STYLE_BUCKETS` (app.js ~13512) has entries for `bulldozer/pep/swarm/resonant/flash` only. Data defines `chargeStyle: 'mirror'` (mirror_stag), `burstStyle: 'detonation'` (bright_idea), `burstStyle: 'exposure'` (paparazzo) — all three silently fall through to the generic bucket. Mirror_stag is rescued by its W2A overlay; detonation/exposure are not.
- `W2A_IDS` (app.js 13504) references `camera_swarm`; the encircle routing (app.js 13535) references `delegate_beast`. Neither id exists in src/data/monsters.json — phantom references, dead code paths (w2aSwarm CSS, encircle bucket routing) that can never fire.
- No wave-2 monster uses the `single` pattern type → the `targetTile` (red 3px) class is unreachable for this set; `direct` (lockOn) covers all targeted attacks.
- The `line` pattern bucket (`lineCells`, red #e71d36) is also unused by wave-2 — only beam/charge/burst/direct/rush appear.

## Verdict
The beam trio (Deer/Drone/Projector) and the Stag's mirror lane and the Idea's white-hot last tick are Highbeam-Deer-level: distinct telegraph text AND a grid visual that reads as its own thing. The three burst monsters share one orange burst, and five direct monsters share one purple square — those are the visuals that most need work. The telegraph texts carry all the identity right now; the grid doesn't.
