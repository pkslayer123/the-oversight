# Wave 3 batch A — signature mechanics proof (2026-10-10)

Worker: sig-w3a. Monsters, in build order: **redactor → gavel → focus_group**.
Commit: `28914fd0ab2ee2883f1a83749c862e6b72f5669d` (worktree sig-w3a, NOT landed).

## Design decisions (Steve delegated — overrulable)

**Redactor**
- POINT (named target, phase badge + narration, full round warning) → REDACT. Rotation: weapon → last turn → footing.
- A carried decoy (`decoy_rattle`, craftable: stick + vine, durable) is ALWAYS redacted first and destroyed — decoys are single-use, no infinite-exploit.
- Weapon redaction disables the weapon (unarmed) for exactly 2 rounds, narrated expiry.
- Last-turn undo heals the target's wound, never resurrects (falls back to footing when there's nothing to undo).
- Shove restricted to interior tiles 1–7 (flee-by-barrier rule).
- 2 consecutive quiet player turns → starved (damage ×0.5); 3rd → flees.
- Anchor honored: HP [260,320], pierce 0.1 untouched.

**Gavel**
- ACCUSE (consumes turn, names the freshest `progState().moments` entry — "reviewing footage of you") → full player round → VERDICT (`S.combat.roll([40,60])` through `tbDamage`, pierce-aware).
- Motions: OBJECT (costs exactly 3 viewership, verdict ×0.5); RECESS (delays one round, once per trial, second refused); CONFESS (verdict ×0.4 + `recordMoment` + `bumpTrust(vid,-2)` per villager fighter — later gavels cite the confession because it stays the freshest moment).
- Frontal strikes hit the sound-block ×0.35; flank bypasses. Facing inits toward the player, updates on movement and accuse.
- Anchor honored: HP [300,360], pierce 0.2 untouched.

**Focus Group**
- Lead spawns 2–4 eye-heads (5–7 heads total). Lead carries 3 mouth-parts, each `round(hp/3)`. Mouths soak strikes in order with overflow carrying to the next mouth; all 3 popped → group dies (lead killed through the real `tbDamage` path, eyes flee — loot/codex/wave-kill economy untouched since the lead keeps its original mdef).
- Every lead turn: audible LOVED/HATED rating from {strike, dodge, wait} + menu strip. Loved strike ×1.3 then a mouth-head answers [8,12] ([12,18] if marked); hated strike ×0.7 (×0.55 if marked), safe.
- New `tbPlayerDodge()`: +35% dodge until next turn; loved dodge → +50% but answered (+30% incoming from heads); hated dodge → +20%.
- Eye-heads mark the most-used rated verb (one mark per round); can't be struck (wasted-turn lesson, consumes the turn with coaching).
- Boredom: 3 consecutive boring turns (wait/study/offer/talk only, or empty) → all heads flee. Rage ability locks the walkout off permanently ("rage is DELICIOUS").
- Deliberation (the generic attack) scales ×(alive mouths/3).
- Villager fights: simplified rating loop (villager strikes) — real hook path, not a stub.
- Anchor honored: HP [240,300], pierce 0.0 untouched. Aggregate output preserved via mouth-parts ≈ anchored pool.

## Proof results

All proofs: real headless fights, mulberry32-seeded BEFORE eval (several modules capture `Math.random` at load), full script list in index.html order minus app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js, `global.window=global` for eval then deleted before playing.

| Mechanic | ON (SEED=1,2,3) | OFF (MECHANIC=off) |
|---|---|---|
| Redactor (`test-sig-redactor-20261010.js`) | 25/25 green ×3 | RED (exit 1, 20 fails) |
| Gavel (`test-sig-gavel-20261010.js`) | 24/24 green ×3 | RED (exit 1, 19 fails) |
| Focus Group (`test-sig-focus-group-20261010.js`) | 23/23 green ×3 | RED (exit 1, 18 fails) |

Regressions on the branch: `test-wave3-5-20261010.js` 211/211; `test-monsters-break-r14-20261010.js` 116/116.

## Exploit / softlock checks

- Decoy is single-use (destroyed on redaction) — no infinite loudness.
- Recess/object once per trial; recess refused the second time (narrated).
- Eye-heads can't be struck down; mouths are the only damageable path besides the lead — no softlock (lead itself is always strikeable).
- All three fights terminate ≤200 rounds in proof (strike-only, wait-only, motion-heavy).
- Verdict/deliberation go through `tbDamage` — armor, dodge, cheat-death choke points all honored.
- Knowledge never gates: ratings are always announced; the walkout counter is visible.

## Bugs found and fixed during proof

1. `isFocusEye` required `kind === 'monster'` but eyes spawn as `kind: 'ally'` → eye-strike refusal and eye-flee silently never fired. Fixed kind-agnostic (mdef id is unique).
2. Mouth damage had no overflow carry → lead could die with the 3rd mouth unpopped. Fixed: overflow carries to the next mouth.
3. Gavel cited `moments[trials % n]` (cycling) → confessions got buried; now always the freshest moment, so a confession follows the player until they do something worse.
4. Proof scripts assumed player actions don't auto-advance the turn; motions (object/recess/confess/dodge) spend the action → turn advances through the monster's turn. Tests restructured to measure around the action.
5. `startCombat` at haven fires the breach crisis, recording a fresh moment per fight → tests stub `Game.fireCrisis`.
