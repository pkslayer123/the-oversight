# Wave-2 Gap Re-Verification — played as a player, 2026-10-06

**Task:** read-only re-verification of the 6 open gaps from `evidence/2026-10-06/wave2-playverify-20261006.md`, against the current worktree (which carries uncommitted sibling fixes). No game files touched.

**Method:** headless node harness `scripts/test-wave2-gap-reverify-20261006.js` (plain node, NOT jest). Each gap PLAYED as a player through the real combat loop (`tbPlayerStrike` / `tbPlayerMove` / `endTurn`), not grepped. Deterministic RNG (seed 20261006). Turn hygiene per AGENTS.md (endTurn = exactly one AI round; interior tiles 1..7 only).

**Result: 29 pass / 0 fail. Verdicts: 4 FIXED · 1 PARTIAL · 1 STILL OPEN.**

| # | Gap | Verdict |
|---|---|---|
| 1 | union_rep walkout soft-lock (P0) | **FIXED** |
| 2 | heckler threat floor (bar A) | **PARTIAL** |
| 3 | paparazzo exclusive reachability (bar D) | **FIXED** |
| 4 | understudy passive stall (minor) | **STILL OPEN** |
| 5 | heckler warming_up invisible phase (minor) | **FIXED** |
| 6 | union_rep organizing invisible phase (minor) | **FIXED** |

---

## 1. union_rep walkout soft-lock — FIXED

**Played:** waited for WALKOUT (rep dropped to 60/160 HP), tried to strike the rep during walkout, then broke the picket line for real by striking the summoned ally to death, then finished the rep.

**Evidence (6 rounds):**
- Walkout fired at half HP. Strike on the rep during walkout refused: *"You can't get a clean shot — it's behind the picket line, bullhorn up, coordinating."*
- The picket ally was strikable during walkout (dealt real strike damage, it died).
- On the next rep turn with no allies: *"The line — the LINE is broken!"* — `urWalkout=false`, `urLineBroken=true`, phase back to `organizing`.
- Rep strikable after the break (60 → −10 HP via strikes), fight ended **`result: 'won'`**. No stalemate, no infinite fight.
- Phases observed: `walkout -> organizing`. All fired audio (`unionWalkout`, `unionPicket`, `unionRepWhistle`, `unionBullhorn`) resolves in the app.js `CombatAudio` registry.

## 2. heckler threat floor — PARTIAL

**Played:** 20 rounds of strike-play (the threat case), measuring realized damage/round and parsing every Vicious Mockery chip from the combat log.

**Evidence:**
- Vicious Mockery chip fires in play; every observed chip in **[6, 10]** (the 3–6 → 6–10 half of the prescribed fix is implemented and live).
- `hecklerTaunt` (deepened synth) fires at the pile-on; all audio resolves in the registry.
- **Realized: 6.8 dmg/round** over 20 rounds (player 400 → 263). That's ~3× the prior 2.3/round — but still below the **14/round bar**.
- The other half of the prescribed fix ("and/or direct 6–10 → 8–12") is **not done**: `monsters.json` heckler direct is still `[6, 10]` (no diff), and `encDeclareDirect` reads damage straight from the data. (The sibling's own WIP harness asserts `[8,12]` in data — the data doesn't have it; their fix pass is incomplete here too.)

**Verdict rationale:** the chip half works and the floor tripled, but the bar isn't met and half the specified fix is missing. Remaining work: the direct bump to 8–12, or an explicit call that 6.8/round is the intended floor.

## 3. paparazzo exclusive reachability — FIXED

**Played three ways:** (A) strike-through at 120 HP, (A2) strike-through at data-range 80 HP (the original "dies in 3 rounds" case), (B) fully stationary player.

**Evidence:**
- Play A: kill at R4 (`won`), prediction reached 4/4, **exclusive fired at R2**.
- Play A2 (80 HP): kill at R3 (`won`), prediction 4/4, **exclusive fired at R2** — the original gap case ("dies at R3 with prediction 3/4, exclusive never fires") **no longer reproduces**.
- Play B: prediction climb R1:3 → R2:4; exclusive at prediction 4 (codex-true); *"Hold still. Yes. Just like that."* coaching said; UNAVOIDABLE/UNBLOCKABLE cue shown.
- Why it works now: the paparazzo no longer stops shooting to reposition (the old step-away early return is gone), so prediction climbs every flash cycle even while it kites; freeze rounds read as still, accelerating it. The money-shot beat fires in all three play styles.

## 4. understudy passive stall — STILL OPEN

**Played:** 8 rounds, never attacked.

**Evidence:**
- Player HP 300 → 300 (untouched), zero observations recorded, phases `{watching}` only, fight unresolved after 8 rounds.
- The prescribed prod ("after ~3 watching turns with zero observations") exists **nowhere** in the worktree — grep over `src/js/` and `src/data/` for the prod line, `usBored`, `usProd`, `usWatchCount` finds nothing. The watching branch still just steps away and re-says the watch line.
- A passive player still faces a monster that never acts, forever. The stall persists exactly as the gap described.

## 5. heckler warming_up invisible phase — FIXED

**Played:** strike-play; checked the intro log ordering and phase timeline.

**Evidence:**
- The warm-up is now **narrated on the intro turn**: *"It cracks its knuckles. 'Oh, this ought to be good.' (It is sizing you up — the set starts soon.)"* (known variant; unknown variant is the cat/dropped-glass line).
- The narration reads in the play log **before** the headliner entrance (`"Oh, we've got a LIVE ONE!"` at R2). The player now reads three beats: warming_up → heckling → headliner.
- Honest note: the phase *chip* itself still flips to `heckling` on the first jibe (RNG-timed; happened on the intro turn in this seed) — the gap's "hold it one round" option wasn't taken. The beat is carried by the narration instead, which satisfies the underlying complaint (the player only ever read 2 phases).

## 6. union_rep organizing invisible phase — FIXED

**Played:** union_rep intro + full arc (same fight as gap 1).

**Evidence:**
- Intro turn now says: *"It produces a clipboard. Your name is already on it. (It is organizing — the allies are the weapon. Union-bust it before the picket forms.)"* (known variant; unknown: *"It is holding a meeting. About you."*)
- `organizing` phase observed in play (also re-entered after the line breaks). The first act now reads before the picket/walkout second act.

---

## Method notes

- `Game.startCombat(id)` runs the monster's first turn during the intro; the harness reads the full fight log (`says`), not per-round slices.
- `tbEnd` nulls `Game.tbfight` in a `finally` — the harness reads `result` off the fight object reference, not the nulled global (an earlier revision misread this as `result: null`).
- Harness-artifact compensation (documented in the script): `newFight` repositions the player *after* `startCombat`, staling the paparazzo intro's `pzLast` snapshot; Play B re-syncs it, matching real play where the player doesn't teleport between intro and R1. Without this, the first re-declare reads "moved" (+1) and the still-player coaching's `<4` guard never trips — a harness artifact, not a game bug.
- Audio registry check is mechanical: every `audioEvent` name fired during these plays resolves in the app.js `CombatAudio` registry (zero silent/missing).
- Seed 20261006 — re-runnable: `node scripts/test-wave2-gap-reverify-20261006.js`.
