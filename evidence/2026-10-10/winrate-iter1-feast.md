# Win-rate iteration 1 — feast-surge regression diagnosis (2026-10-10)

Worker: winrate-feast. Question: feast-surge "used" dropped 21/60 (35%, Worker
E baseline) -> 13/60 (22%, survival-validation sweep) after the
survival-economy rebalance. The validation note hypothesized "villages die
before the surge is used". **Refuted.** Villages live LONGER (median 24 ->
34d); arming IMPROVED. The drop is behavioral: the policy strikes less after
arming. Plus one genuine adjacent bug (dry-burn consumption), fixed with
proof.

## 1. What the metric actually measures

`feastSurgeUsed` is set in the `Game.feastBurn` wrapper (src/js/progression.js).
`feastBurn` is called on **every player strike** (src/js/game.js strike path).
Until this round, the wrapper consumed the armed surge and marked
`feastSurgeUsed` **unconditionally on any call** — including strikes with an
empty war chest where the base burn returns 0 (no feastburn, no narration,
no damage). So "used" never measured a real surged feastburn; it measured
"the player struck at least once while the surge was armed".

Why real burns never happen in the winseek policy: the base burn needs
`banked() >= 300`. `banked() = kcal - 2400*metabolicMult`, capped by
`kcalCap() = 2400*mult*bankMult()`, and `bankMult()` is 1 unless the scholar
holds `deep_reserves` (x5) or the `war_chest` synergy (x1.5). The winseek
scholar's kcal pins at the 2400 full line, so banked ~ 0 always. 16-seed
instrumentation (winseek policy, validation day loop): **0 real burns across
all runs, banked@arm = 0 in every armed run, median banked at strike = 0.**

## 2. The regression is behavioral

| | Baseline (E) | Validation | Δ |
|---|---|---|---|
| feastSurgeUsed | 21/60 (35%) | 13/60 (22%) | -13pp |
| feastSurge armed (end snapshot) | 36/60 | 49/60 | +13 |
| surgeResonance >= 35 | 40/60 | 51/60 | +11 |
| sentiment taught | 45/60 | 55/60 | +10 |
| median survival | 24d | 34d | +10d |
| median channels (keepsake) | 20 | 61 | +41 |
| median player strikes | 6 | 6 | — |
| median flees | 9 | 25.5 | +16.5 |

Arming got BETTER: longer-lived villages channel keepsakes far more (median
61 vs 20 channels), so the devotion lane (resonance >= 35) arms in 49/60
runs. "Used" fell because "used" = a post-arm strike, and the policy now
flees most fights: once the wave-1 deed bar (5 distinct) is filled and the
monster is in the known set, the policy's `fledKnown` / `fledFilled` triggers
fire on turn 1 — no strike, no consumption, surge stays armed (49 end-armed
vs 36).

Accelerants that landed between the sweeps:
- **5f6f06ce** (villager experiences count toward wave unlocks): villager
  field fights now feed `wavesFaced`, which is exactly what the policy's
  flee-once-known (`_facedBefore`) and flee-once-bar-filled
  (`deedGateReady()`) read — bars and known-sets fill faster.
- **Live day loop** (`doAction('wait')` per part instead of raw
  `tickAction(128)`): needs-driven villager agency -> more villager fights
  -> more wavesFaced entries -> earlier flee regime.
- **Longer survival itself** (the rebalance working): median 24 -> 34d means
  more encounters per run, so the flee-everything regime (post wave-1 bar)
  covers a larger share of each run's lifetime.

Flee-reason breakdown (3 fresh seeds x 80d, instrumented, post-fix code —
flee logic itself untouched by the fix):
- seed 21: arm d20, 2 post-arm strikes, flee[bad 1 / filled 31 / known 0],
  died d65, surge still armed
- seed 22: arm d17, 0 post-arm strikes, flee[bad 1 / filled 53 / known 0],
  died d48, surge still armed
- seed 23: arm d18, 0 post-arm strikes, flee[bad 1 / filled 2 / known 0],
  died d19

**fledFilled dominates completely** (the policy's flee-once-bar-filled check
runs before flee-once-known, so repeats count as filled). Once the wave-1
deed bar (5 distinct) is filled — accelerated by 5f6f06ce feeding villager
field fights into wavesFaced — every all-wave-1 fight is fled on turn 1:
no strike, no consumption. The surge arms (devotion lane, ~day 12-27) right
as this regime takes hold. maxBanked = 0 in all runs: the war chest never
holds a single kcal above the full line, so no real feastburn ever fires.

Net: the policy rationally stops fighting exactly when the surge is armed,
because there is nothing left worth fighting (deed bars filled, monsters
known). The surge then rides along, armed, until the village dies in a fight
the policy didn't choose to flee (or the run ends).

## 3. Genuine bug found and fixed: dry-burn consumption

A strike with an empty war chest is not a feastburn — the base returns 0
silently — yet the old wrapper consumed the armed surge AND marked
`feastSurgeUsed`, with no narration (`r > 0` gate) and no damage. The arm
message promises "Next feastburn surges xN"; nothing burned. Worse,
`feastSurgeUsed` is an Arc IV deed-gate requirement, so the deed could be
earned for nothing.

Fix (src/js/progression.js, `Game.feastBurn` wrapper): the surge is now
consumed and `feastSurgeUsed` marked only when a real burn fires (`r > 0`).
A dry strike leaves the surge armed.

Proof: scripts/test-feast-surge-20261010.js Part 1 (9 checks): 7/9 before
(the 2 dry-burn checks red), 9/9 after. Part 2 is the sweep instrumentation
above.

Regressions (all on the fixed code):
- scripts/test-channeling-gap-20261010.js: 41/42 (1 failure "practice payoff
  is legible" — pre-existing, fails identically on pristine master)
- scripts/test-bal-waves-20261010.js: 30/30
- scripts/test-pacing-20261010.js: 39/39
- scripts/test-deed-gate-20261010.js: 68/68
- scripts/test-combat-break-honesty-20261008.js: 2/2 HELD
- scripts/test-progression.js: 13 failures, identical count on pristine
  master (pre-existing, corpse-keepsake area)
- scripts/validate-ontology.js: 62/62

## 4. Recommendation for Steve (lever-turn — not taken)

With the honest fix, the winseek "used" metric will read ~0/60, because a
real feastburn needs a 300+ war chest the policy never builds (maxBanked = 0
in every instrumented run). The old 35% was masking this: the surge pipeline
(bank -> burn -> surge) is near-unreachable in current play, for players as
well as the policy, unless they hold deep_reserves/war_chest. Candidate
levers, his call:
1. Lower the feastburn banked threshold (300) so ordinary feasts can fuel it.
2. Make feasts bank more (feast -> war chest, not just the body pool).
3. Teach the winseek policy (and surface to players) a feast-then-fight
   rhythm: host feast, then patrol while banked. Harness-side variant: once
   the surge is armed, the policy should deliberately take one real fight
   (a single strike) instead of fleeing everything — currently the
   flee-once-bar-filled logic guarantees the surge is never cashed.
4. Accept the surge as a late-game engine piece gated behind bank-expanding
   skillsets — but then the Arc IV deed gate's feastSurgeUsed is much harder
   than the current numbers suggest, and the win-rate loop should stop
   tracking it as a mid-game signal.

UI reachability was checked and is NOT a factor: channeling fires via the
pack keepsake action (covered by the channeling-gap suite); no UI change in
the rebalance touched it.
