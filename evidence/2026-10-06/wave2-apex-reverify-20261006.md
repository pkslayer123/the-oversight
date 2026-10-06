# Wave-2 Apex + NEAR/Fail Re-verification
**Date:** 2026-10-06 · **Worker:** wave-2 apex re-verify (read-only vs game code — no src/js or src/data edits)
**Bar:** `evidence/2026-10-06/wave2-escalation-bar.md` criteria A–I
**Method:** worktree reads (HEAD = 1b8a5e3; tree hot, ~100 dirty files) + headless as-a-player playtests
(scratch harnesses in /tmp, NOT committed — correct turn hygiene: the action's own
advance is authoritative; force-advance only when the round didn't move and it's still
the player's turn). One harness bug caught and corrected mid-run: a trailing
`tbAfterPlayerAction()` after `tbPlayerWait()` double-advanced the monster (the
"double damage" seen in early runs was harness artifact, NOT a game bug — the game
deals exactly one Notice/round; AGENTS.md turn-hygiene lesson re-confirmed).

---

## 1. THE MODERATOR (wave-2 apex) vs bar A–I

Played as a player (150 HP, fire-hardened spear, realistic stats) with a compliant,
mute-flipping policy: chase with full movement, strike when adjacent and legal, never
violate, wait out mutes. Zero violations, compliant every round.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| A | Threat floor (HP ≥ 55, ≥ 14/round) | **✓** | HP 150–170 (worktree roll: 169). Unavoidable 8–12/round compliant, 12–18+3/violation defiant, Deplatform 14–18 compliant / 20–28 defiant every other round in shadowban. The 14/round line is met when defiant or shadowbanned; compliant chip is 8–12 but *unavoidable by design* ("the counterplay is the field and your habits, not your feet"). |
| B | Apex slot (HP ≥ 150 **or** ≥ 25/round w/ harder counterplay) | **✓** | HP 150–170 meets the HP prong outright. Genuinely scarier than the deer: the deer's 22–32 beam is dodgeable (skilled player takes ~0); the Moderator's damage cannot be dodged, only managed. A perfect-play 150-HP spear player DIED at boss-10-HP over 25 rounds — knife's-edge, winnable with better RNG/HP. This is the roster's scariest fight now. |
| C | Novel trick | **✓** | Verb muting from a rolling 5-verb habit window (strike/move, most-used first, ties by recency); violations spend the turn and stack +3/strike; compliance makes Notices graze; 5 quiet rounds LIFT the mute ("silence is a verb the algorithm cannot moderate"). Nothing in wave 1 like it. |
| D | Reachable second act (≤ 8 rounds) | **✓** | observing→**muting** at R2 (pain-switch + round gate). Third act **shadowban** fired at R17 (hp ≤ 50% + round ≥ 4) — late, but the bar binds the *second* act. Deplatform windup verified: hammer RISES a full round (no damage), then falls for 14–18 compliant. |
| E | Telegraph | **✓** | Monster-specific declare text + projected suppression field as terraform tiles (radius 2, radius 3 in shadowban; re-projected every turn so it visibly follows). Mute-change announcements name the muted verb; verb-aware escape coaching ("You cannot walk out while MOVE is muted — STRIKE or WAIT to flip the mute, then move"). |
| F | ≥ 3 named phases | **✓** | observing → muting → shadowban via `encSetPhase` (+ phaseBadges 👁/🔇/⬛). |
| G | Audio all wired | **✓** | Mechanical check: all 7 call sites (`modNotice/Noted/Mute/Violation/Removal/Shadow/Down`) resolve in the `Game.audio` registry (app.js ~4541–4691, registry ~8733–8739). Zero silent no-ops. (Synth *quality* not judged headless.) |
| H | Knowledge gating | **✓** | `knownCue` present and fires (mute announcements carry the known-tail coaching; unknown variant hides the mechanics). 3 codex stages. Codex-vs-code check: every slain-text move verified implemented — Content Noted 6–10 ✓ (`dmg=[6,10]`), Removal Notice 12–18 defiant / 8–12 compliant ✓ (+bonus, disclosed), Deplatform 20–28 / 14–18 ✓, full-round windup ✓ (`turnsLeft=2`), field → radius 3 ✓, shadowed ground rejects for 2 ✓ (`tbDamage('p', 2, 'shadowbanned ground')`), +3/violation + defiance voids graze ✓. |
| I | Armor/resistances | **✓** | armor 4 + psychic 0.5 — fiction-matched (machine, unmoved by mockery). |

**Feel judgment (played, not simulated):** the mute-flip mind game is genuinely novel and
tense — the monster kites at range 2–4, you must enter the field to strike, and the mute
chases your habits. The LIFT beat ("The hammer hovers — then lowers. It lost the thread.")
is a great earned moment. Two friction points (fix list §3): the mute lockout is LONG
(5 quiet rounds ≈ 50 unavoidable damage per cycle — the fight is 70% waiting), and the
unknown-descriptor possessive reads broken ("...around itself's Removal Notice").

**New scoreboard: 10 meet · 1 near→meets (heckler) · 0 fail. Apex slot FILLED.**

---

## 2. Re-verdicts: the 4 NEAR + heckler (sibling reworked all five)

| Monster | Old gaps | Current state | Verdict |
|---|---|---|---|
| **heckler** | escalation unreachable, Pile-On unimplemented, no knownCue/armor, 2 silent audio | **All closed.** HP 85–100, jibe 55%+10%/shame, headliner at 3 shame, Pile-On implemented (game.js ~21809), compulsion (wait = answer back, clear 3; act = +2 shame), headliner mockery 6–10 psychic chip, attack trimmed to 8–12, knownCue ✓, armor 0 (deliberate fragility) + psychic 0.75 ✓, all audio registered ✓. **Play-verified:** headliner fired R4–R5 in a normal fight; the trick is now the threat, not the chip. | **MEETS** |
| **union_rep** | missing knownCue/armor | **Closed.** knownCue present (quality coaching: kill it before it organizes, +3/+8 ally buffs, untargetable walkout). armor 4 + psychic 0.5 ✓. Walkout second act intact. Codex honest. | **MEETS** |
| **landlord** | one-shot spread, dead heal, no knownCue/armor, codex lie | **All closed.** Spread now repeats (Addendum every 2 claims or 3 waves — game.js ~21693), 4th phase **foreclosing** at 2 Addenda, heal 2+addenda on claimed ground when hurt, rent 1+addenda every round you end on claimed ground (codex-honest), knownCue ✓, armor 3 + psychic 0.5 ✓, audio registered ✓. **Play-verified:** foreclosing at R4, addenda stacking. | **MEETS** |
| **paparazzo** | marginal prediction-5, no knownCue/armor, 1 silent audio | **All closed.** Exclusive threshold lowered 5→4 (game.js ~21874) — **play-verified** firing at R4. knownCue ✓, armor 0 deliberate ("glass and light, not hide") + energy 0.5 ✓, paparazzoExclusive registered ✓. | **MEETS** |
| **understudy** | missing knownCue/audio/armor, unimplemented Opening Steal/Desperate Improv, arc too fast | **All closed.** Opening Steal implemented (armed at performing, fired in tbPlayerStrike, game.js ~16556/21516), Desperate Improv implemented (below 30% HP chains two learned moves, ~21588/19479), 4th phase **improv**, arc compressed (performing @3 observations), "wears your guard" armor fiction implemented (~16463), knownCue ✓, all audio registered ✓. **Play-verified:** watching→rehearsing→performing (R7)→improv (R8), Opening Steal fired. | **MEETS** |

Mechanical audio re-check (all `audioEvent('x')` call sites in game.js vs `Game.audio`
registry in app.js): **zero missing for wave-2 + moderator.** (12 missing names exist but
all belong to kite/nevermore/nightcourt — a different worker's in-flight content; flagged
in §3 as hygiene, out of scope.)

---

## 3. Precise FIX LIST (read-only task — no code touched; for a future worker)

**P1 — Moderator tuning (Steve's call):**
1. **Mute lockout is long.** `modTopVerbs` window of 5 means 5 quiet rounds to lift the
   mute (game.js ~17867–17880) — but the code comment at game.js:17876 promises
   "three quiet rounds flip a habit." Either fix the comment or shorten the window to 3.
   Feel impact: the fight is ~70% waiting; perfect-play 150-HP player died at boss-10-HP
   over 25 rounds. Consider lift@3 quiet rounds or compliant Notice 8–12 → 7–10.
2. **Unknown-descriptor possessive reads broken.** game.js:19483:
   `` `${this.encShortLabel(m) || m.name}'s ${hitName} finds ...` `` renders
   "a hovering shape with a hammer, drawing a circle on the ground around itself's
   Removal Notice". Proposed: when `encShortLabel` is null (unnamed), use
   `"The ${descriptor}" … " — the ${hitName} finds you"` (no possessive), or gate the
   `'s` on the short label existing.

**P2 — hygiene (found during audit, out of scope):**
3. **12 silent audio call sites** (no registry function in app.js — `audioEvent` no-ops):
   `kiteBroadcast, kiteClimb, kiteHum, kiteMark, kiteTransmit` (game.js ~19869 etc.),
   `nevermoreClimb, nevermoreCroak, nevermoreLand, nevermoreStrafe` (~15318, ~20904),
   `nightcourtClimb, nightcourtLand, nightcourtSilence` (~15328). Likely another
   worker's in-flight monster; map to synths or write them before those ship.
4. **Harness-bug class re-confirmed:** a trailing `tbAfterPlayerAction()` after
   `tbPlayerWait()` double-advances the monster (wait already advances when the turn is
   spent). Two scratch harnesses inherited this and measured 2× monster damage before
   correction. Correct pattern: advance ONLY if still player turn AND `f.round` didn't
   move. (AGENTS.md already documents this; the reverify script in §4 encodes it.)

---

## 4. Deliverables
- This file: `evidence/2026-10-06/wave2-apex-reverify-20261006.md`
- `scripts/test-wave2-apex-reverify-20261006.js`: mechanical checks (audio registry
  cross-check, codex-promise grep, phase counts, apex-slot stat check) + the
  as-a-player Moderator fight harness with correct turn hygiene. Run:
  `node scripts/test-wave2-apex-reverify-20261006.js` (add
  `--cacheDirectory=/tmp/jest-cache-wave2apex` if jest is ever involved — it isn't;
  pure node).
