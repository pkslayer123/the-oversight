# break-it: audio (2nd pass) — 2026-10-09

Worktree: `~/workspace/worktrees/break-audio2` @ `0c0d01c`
Tests: `scripts/attack-audio-20261009.js` (35 checks, green ×3 seeds; 2 red pre-fix)
Regressions green post-merge: `test-declare-audio-20261008.js` 15/15, `test-wiring-fixes-20261007.js` 19/19
(worker: + audio-breakit 15/15, audio-break 9/9, exploit 13/13, honesty 21/21, alien-beam 12/12,
carepackage 21/21, ontology 50/50 — re-verified ontology 50/50 + honesty 21/21 + exploit 13/13
by coordinator on merged tree). Live: `0c0d01c-20261009-060936` on both endpoints.

**Verdict: BROKE + FIXED.** One genuine honesty catch (the aliens' signature weapon fired
silently) plus one sibling-sweep fix. Everything else held.

## CATCH 1 (HONESTY, fixed): the alien beam was silent — raise AND discharge

The alien beam is the signature move of the alien players (machine-beam windup, copper-taste
telegraph, armor-skipping discharge — the game's most devastating attack). Both beats fired
ZERO audio hooks:

1. **Raise (the "oh shit" telegraph):** `raiseBeam` said "🔆 {name} raises {beam}. The air
   tastes like copper." with no cue. The telegraph dispatcher already routes
   `telegraph{pattern:'beam'}` → `beamTechWindup` (machine beam, distinct from the deer's
   beamCharge — other beams are machines; verified the dispatcher handles pattern 'beam'
   at app.js:10482/10713).
   **Fix:** `this.audioEvent('telegraph', { pattern: 'beam', urgency: 1 })` at the raise
   (alienPlayers.js:2235).
2. **Discharge (the resolve):** `_beamFinal` direct-damage path applied the hit silently —
   whether or not the target was still standing. The impact dispatcher routes
   `impact{pattern:'beam'}` → `droneBeam` (app.js:10495).
   **Fix:** `this.audioEvent('impact', { pattern: 'beam' })` at the discharge
   (alienPlayers.js:2123), deliberately placed before the alive-check so the resolve sounds
   even if the target already fell.
3. **Sibling sweep — same bug class (built-for-this voice, never fired):** the alien
   `fanPackage` beat had `fanPackageDrop` registered (descent whistle, silk flutter, thump —
   built exactly for a crate falling from the sky) but only the fan-package *unboxing* fired
   it; the alien care package fell silently.
   **Fix:** `this.audioEvent('fanPackageDrop')` in the alien care-package beat
   (alienPlayers.js:958).

**Proof:** `scripts/attack-audio-20261009.js` 35/35 — beam raise/discharge + care-package
checks were red pre-fix (2 red), all green post-fix ×3 seeds. Coordinator verified dispatch
paths exist (fanPackageDrop@10779, beamTechWindup@10482/10713, droneBeam@10495).

## HELD — yesterday's fixes still hold

- Failed trials stay silent (`triumphed` flag intact; victory fires only on triumph).
- `nightcourtDive` synth + registry entry still deleted (census 35/35: dead-check green).
- hushwolf rush: no `wolfSnarl` before first contact (aftermath-only); pack snarl bounded
  one-per-wolf; `wolfSilence` noticeAudio at combat start.
- turtle snap: silent pre-snap turns; `turtleSnap`+`turtleGrind` fire on the snap turn itself.
- Zero ambient/persona audio hooks in alienPlayers.js (no knowledge-bearing sound cues from
  aliens).
- Every `noise()` looping source has an explicit `.stop()` (no new looping voices added).
- Every audio-dispatching module is loaded in index.html (Alien Players lesson — no dead
  modules).
- Specimen_scanner hum claim is honest; new synergies (loud_and_proud, the_long_con,
  living_armor, war_chest, iron_gut, master_of_flame) carry no bespoke audio claims —
  generic unlock cue only, no lies to fix.

## Notes for the next pass

- The alien-player audio surface is thin (one hostile-player design: aliens are quiet by
  fiction). The beam catch was the gap — aliens had *no* signature-weapon sound despite a
  fully built dispatcher for it. The `urgency` param on the telegraph dispatcher scales
  windup duration; urgency 1 chosen so the raise reads as a telegraph, not a long charge.
- Attack suite lives at `scripts/attack-audio-20261009.js` — reuse next pass as regression.
