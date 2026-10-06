# Wave-2 Play-Verification — played as a player, 2026-10-06

**Method:** headless node harness `scripts/test-wave2-playverify-20261006.js` (NOT jest).
Played each of the five (understudy, landlord, heckler, paparazzo, union_rep) AS A PLAYER:
smart counterplay per monster (switch weapons / keep moving / dignity-wait / footwork-dodge /
union-bust), plus fat-HP arc passes to experience every beat. Deterministic RNG (seed 20261006).
Turn hygiene per AGENTS.md (endTurn = exactly one AI round; interior tiles 1..7 only).

**Result: 65 pass / 5 fail / 6 gaps. Verdicts: 2 MEETS · 2 NEAR · 1 DOES-NOT-MEET.**

The audit's P0/P1 fixes (commits 7efec81, 67a99ff) are real and verified in play: all 21 wave-2
`audioEvent` names resolve in the app.js `CombatAudio` registry (mechanical check, zero silent),
all five have explicit armor/resistances + knownCue + loot, and codex slain text no longer promises
unimplemented moves (Opening Steal, Desperate Improv, Pile-On all fire in live fights).

---

## UNDERSTUDY — MEETS

- Arc play-verified: watching@R1 → rehearsing@R2 (2 obs) → performing@R3 (3 obs) → Desperate Improv@R7 (<30% HP). All four phases read on the grid.
- OPENING STEAL fires (halved + answered with your move at 80%); switching spear→club mid-fight visibly changes the copy. Switch-after-steal wins: player alive@51 after 5 rounds, monster dead.
- Threat scales with the player by design — the copy took half the HP pool in 5 rounds (9.8/round realized with a spear; 80% fidelity of your own damage).
- Knowledge: pattern learned organically via the Codex mid-fight; known/unknown cue branches both exercised. Armor 0 / resistances {} is an explicit fiction statement ("a blank shape has nothing to hide behind").
- **Gap (minor):** a player who never attacks faces a monster that never acts — the watching branch just steps away forever. The unknown cue ("watching. Learning.") never tells the player to attack. After ~3 watch turns with zero observations it should prod ("It gets bored of watching…") or the unknown cue should carry the hint. `game.js` ~19630.

## LANDLORD — MEETS

- Arc play-verified: claiming@R1 → collecting@R2 → foreclosing@R3. Jurisdiction Spread fires in REPEATED WAVES (4 addenda in 10 rounds — the one-shot bug is fixed). 6 claimed tiles rendered.
- Anti-turtle clock works: RENT'S DUE ticks when ending on claimed ground (rises per Addendum); NOTICE SERVED claims your tile + ring when you stand still.
- Stand-and-trade is suicide: ~18–20/round realized (Eviction Notice 18–26 on move-declare-resolve tempo + rent) — isolated probe ended in a MUTUAL KILL at R5. Keep-moving counterplay wins in 5 rounds at 79 HP. The counterplay and the punishment both read.
- Armor 3 + psychic 0.5 ("thick hide, doesn't listen"), knownCue, all audio wired, codex true (Serve Notice / Collect Rent / Jurisdiction Spread all implemented as promised).

## HECKLER — NEAR (was DOES-NOT-MEET)

- The audit's blocking issue is FIXED and play-verified: headliner@R2–3 (was unreachable), PILE-ON fires (double shame + "the laugh multiplies"), Vicious Mockery chip fires ("the mockery cuts", 3–6 psychic), the compulsion is presented and the dignity loop works (WAIT answers back, clears 3; acting defiant feeds +2).
- Feel: the jibes read great, shame visibly weakens your swings, the set has rhythm. Dignity-loop fight: 9 rounds, player alive@79, never in danger.
- **Gap (bar A):** threat floor. Paper ~12.5/round (direct 6–10 + chip), realized 2.3/round — below the 14/round bar. The SHAME tax is real but the HP threat is mild; the fight is won on patience, not fear. Fix: chip 3–6 → 6–10 and/or direct 6–10 → 8–12. `src/data/monsters.json` heckler.attack + `game.js` ~19889.
- **Gap (minor, bar F):** `warming_up` is set then instantly overwritten by `heckling` on the first jibe — the player only ever reads 2 phases, but the data promises 3. Hold it one round or drop it from the data.

## PAPARAZZO — NEAR

- Mechanic complete and play-verified in dodge-play: prediction climbs on the commit (hit OR miss), widening shot announced at 3, EXCLUSIVE@R4 with the unavoidable money shot, dodge-ack reads ("Click. It missed").
- Paper threat 12–18 + freeze meets bar A; armor 0 ("glass and light") + energy 0.5 ("washes off the lens"); knownCue; all audio wired; codex true.
- **Gap (bar D):** in a strike-through the paparazzo dies in 3 rounds at prediction 3/4 — the EXCLUSIVE never fires. P1's commit-stacking fixed the dodge-denial path, but killing it fast skips the money shot entirely; the second act only punishes slow play. The trick is the whole point of the monster and optimal play never sees it. Fix: prediction +2 when the player acts without moving ("posing for the camera"), or a "last warning" frame at prediction 3. `game.js` ~19959.

## UNION_REP — DOES-NOT-MEET (was NEAR)

- The escalation is the best of the five when it works: PICKET LINE summoned on the intro turn, solidarity buffs (+3, then +8 at walkout), WALKOUT@R2 in a real fight with the untargetable read ("behind the picket line, bullhorn up, coordinating").
- **Gap (P0, fight-breaking): SOFT-LOCK.** Once WALKOUT fires, the rep is untargetable for the REST of the fight — `urWalkout` never clears, even after every ally is dead (`game.js` ~15005 + ~20022). The rep deals no damage in walkout, so the fight becomes an infinite stalemate: the player cannot win, cannot lose, can only flee. Play-verified: 16-round real fight ended at the round cap with the player at 82 HP and the rep alive, striking "a clean shot" refusals forever.
- Worse: the codex-advised counterplay ("union-busting: focus the rep before it organizes") CANNOT work — walkout fires at half HP and a spear player cannot burst 80–105 HP to zero before the 50% threshold (needs ~52/round for 2 rounds; spear does ~25). The fight is unwinnable once walkout fires, by design math, not by luck.
- Fix: clear the walkout when no allies remain (`m.urWalkout=false`, back to organizing/picketing with a "the line is broken" say), or let the rep keep a weak direct while coordinating. (Steve 2026-10-06: monsters were sent to fight.)
- **Gap (minor, bar F):** `organizing` is set on the intro turn but the summon immediately advances to `picketing` — the player reads 2 phases; organizing never gets a beat.

---

## Bar scoreboard (A–I per monster)

| | A threat | C trick | D 2nd act ≤8r | E telegraph | F ≥3 phases | G audio | H know. | I armor |
|---|---|---|---|---|---|---|---|---|
| understudy | ✓ scales | ✓ | ✓ R3 | ✓ | ✓ 4 | ✓ 21/21 wired | ✓ | ✓ explicit 0 |
| landlord | ✓ 18–26 | ✓ | ✓ R3 | ✓ | ✓ 3 | ✓ | ✓ | ✓ 3/psy .5 |
| heckler | ✗ ~12.5/2.3 | ✓ | ✓ R2–3 | ✓ | ~ 2 visible | ✓ | ✓ | ✓ 0/psy .75 stated |
| paparazzo | ✓ 12–18 | ✓ | ✗ strike-through | ✓ | ✓ 3 | ✓ | ✓ | ✓ 0/energy .5 stated |
| union_rep | ✓ 14–20 | ✓ | ✓ R2 | ✓ | ~ 2 visible | ✓ | ✓ | ✓ 4/psy .5 |

(B is structural — the Moderator fills the wave-2 apex slot per MEMORY.md; not re-tested here.)

## Feel notes (played, not simulated)

- The five all have distinct voices and the fights feel different from each other — the flesh-out landed. Telegraph text is monster-specific everywhere; no generic declares observed.
- Say density is good: every monster turn says something; no silent turns in any of the five.
- The understudy is the most fun: the steal genuinely punishes autopilot and the weapon-switch answer feels earned (Undertale-style, per Steve 2026-10-06).
- The landlord's claimed tiles + rent clock create real positional pressure; the keep-moving counterplay is readable from the knownCue.
- The heckler's set has the best rhythm of the five — it just needs teeth (bar A gap).
- The paparazzo's flash/freeze tempo is good; it dies too fast for its own arc.
- The union_rep's walkout entrance is the best second-act beat of the five — which makes the soft-lock hurt more.

## Gaps for the fix pass (not fixed — read-only task)

1. **union_rep walkout soft-lock** (P0): `game.js` ~15005 + ~20022 — clear `urWalkout` when allies are gone, or keep a weak direct.
2. **heckler threat floor** (bar A): `monsters.json` heckler.attack + `game.js` ~19889 — chip 3–6 → 6–10, direct 6–10 → 8–12.
3. **paparazzo exclusive reachability** (bar D): `game.js` ~19959 — faster prediction vs stationary players, or exclusive at 3.
4. **understudy passive stall** (minor): `game.js` ~19630 — prod after ~3 watch turns with zero observations.
5. **heckler warming_up invisible** (minor): data + `game.js` ~19835.
6. **union_rep organizing invisible** (minor): data + `game.js` ~20005.

## Method notes

- `Game.startCombat(id)` runs the monster's FIRST turn during the intro — summon/solidarity/first telegraphs land before the play loop. The harness scans the whole fight log (`said()`), not per-round slices.
- After a fight ends the player fighter is cleaned up (`P()` → null); player HP is tracked per-round (`lastPhp`) and the result via `tbfight.result` ('won'/'lost'). Mutual kills clean up `tbfight` entirely (observed: landlord stand-trade).
- Seeded RNG (20261006) — re-runnable. The five arc passes consume RNG state, so per-monster numbers assume full-file runs.
