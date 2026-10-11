# Round 3: oracle-v2, the systems-engaged policy (2026-10-10)

**Question:** round 2 found oracle wins 0/60 — but no policy ever used the deep
systems (abilities ~0 uses/run, counter-kill 0.0%, crafts/traps 0/240 runs).
Does a systems-engaged policy change the verdict?

**Policy:** `scripts/policies/oracleV2.js` (harness-side only, no game code).
Extends round-2 oracle (keeps the honest win-probability fight assessment and
the real flee-by-barrier) with:

1. **Blow-by-blow ability use** — every combat turn fires the best held combat
   action (System AND background abilities; round-2's opener scanned only
   `s.abilities`, missing the occupation-granted pair), in a
   setup → damage → defense ladder, kcal-gated. Also explore-context
   `ambush.lay_wait` pre-patrol, `treatDisease` self-care, and combat-kit
   preference when the System offers ability choices.
2. **Counter probing** — fight start checks `Game.monsterCounterKnown(mid)` per
   monster and focus-fires known-counter monsters first.
3. **Traps + crafting** — craft known trap recipes / water filter when
   materials are in hand; set traps daily (water traps on water tiles); read
   books (recipe knowledge at L3).
4. **Feast-then-fight** — when the surge is armed, bank kcal deliberately and
   take ONE real favored fight via a deed-gate override (the honest burn needs
   banked ≥ 300 + a real strike).
5. **Aid + System quests to completion** — fetch → hand in; treat →
   `treatVillager(target, healer kit)`; learn → force ID work; System quests on
   the proper `activeSystemQuest` slot; `aidCry` when struggling.

**Sweep:** `scripts/sweep-oraclev2-20261010.js`, 60 seeds (1–60, same set as
rounds 0–2), 200-day cap, villagerTurn-corrected day loop
(`Game.doAction('wait')` per part), mulberry32 seeded before eval, 6 shards ×
10. Analysis: `scripts/analyze-oraclev2.js` →
`scripts/sweep-oraclev2-results.json`. 0 script errors.

## Outcomes (oraclev2, n=60)

| metric | oracleV2 | round-2 oracle | delta |
|---|---|---|---|
| wins | **0/60** | 0/60 | — |
| median survival | 48d | 41d | +7 |
| max day | 116d | 109d | +7 |
| tier 1 | 46/60 | 42/60 | +4 |
| tier 2 | 0/60 | 0/60 | — |
| wave-2 unlock | 36/60 (med day 33) | 33/60 | +3 |
| wave-3 unlock | 0/60 | 0/60 | — |
| scale | regional 60/60, national+ 0/60 | regional 60/60, national+ 0/60 | — |
| contests ≥3 | 21/60 | 20/60 | +1 |
| sentiment | 57/60 | 54/60 | +3 |
| galactic table | 0/60 | 0/60 | — |
| endReason | village-lost 60/60 | village-lost 58/60, survived 2/60 | — |

## Utilization: did the policy actually engage the systems?

| system | oracleV2 | round-2 oracle |
|---|---|---|
| ability uses/run (player/villager) | **2.8** (2.8/0.0) | 1.2 (1.2/0) |
| abilities held/run (L3) | 4.3 (0.3) | — |
| synergy discoveries/run | 0.53 | 0.48 |
| counter-kill rate | **0.0%** (0/399) | 0.0% |
| counter-known monsters seen | 0.00 (8.1 fights assessed/run) | — |
| crafts ok/att | 0.0/0.0 | 0/0 |
| trap catches/sets | 0.0/0.0 | 0/0 |
| feasts ok/att, armed/used | 2.5/9.9, **93%**/0% | 1.5/2.6, 78%/80%* |
| aid quest accept/hand-in | 2.8/0.3 | 2.7/0.2 |
| relief spent/run | 9.8 | 8.6 |
| system quests/run | 0.5 | 0.4 |
| surge fights taken/run | 1.77 | — |
| surgeResonance mean | 50.4 (≥35 in 56/60) | — |

\* Round-2's 80% "used" was the dry-burn artifact (round 1 fix); honest used is
~0 for both. oracleV2 arms 93% via the resonance lane (ability use feeds
`surgeResonance` → 35 arms the surge) but the war chest never banks 300, so no
honest burn ever fires.

**Reading:** abilities 2.3×'d (max 57 uses in one run), synergies up, aid
completion up, surge armed almost always, and the diplomacy road runs hard
(81 codex studies/run, ~7 link proposals/run — all 60 runs). BUT:
crafts/traps still 0 — the trap road never fired because **trap recipe
knowledge is never acquired**: a probe (seed 21, 99 codex studies) ended with
zero trap recipes known; studied villages teach plants/techniques/cooking, not
trap recipes, and no books were found in any of the 60 runs. The road is armed
but the game never deals the knowledge. Counters 0 by construction (verified
again: no monster def carries a `counter` field — the convention is dormant).
Feast-surge used 0% (war chest never banks 300 — round-1 finding, unchanged).

## Death causes

combat 28% + villager combat 23% = **51% combat** (round-2 oracle: 54%), the
night 18%, monster 11%, sickness 7%, starvation 5%. Combat remains the biggest
killer even with favored-only engagement and blow-by-blow ability use.

## The binding constraint

Deed-gate blocker among non-wins: **scale 60/60**. Everything else is within
reach — integration maxed (median 100, stage ≥3 in 56/60), crises ≥3 in 49/60,
sentiment 57/60, w1 bar filled 56/60 — but national/global scale blocks every
run. And this is not a policy-effort gap: the policy courts hard (81 codex
studies/run, ~7 link proposals/run, tribute logic armed) yet links average
0.47/run and never mature to national within run lifetimes (median 48d vs the
21-day link-age floor alone). Supporting rarities: feastSurgeUsed 0/60, w2
deed bar 5/60 (bar=5), contests ≥3 21/60.

Wave-2 bar sensitivity (same data, alternate bars): bar 5 → 5/60 fill; bar 4 →
12/60; bar 3 → 15/60. Lowering the w2 bar helps w2 completion 3× — but scale
binds first, so it wouldn't move wins on its own.

## Exploit check

- 0 wins → nothing won via exploit, trivially.
- No infinite loops introduced (the stuck-fight pathology is pre-existing —
  round-2 oracle hit it in 13/60 runs too; watchdogs clear it, 0.42 clears/run).
- No freebies: `feastSurgeUsed` 0/60 (honest post-round-1 metric); crafts 0
  (never reached); `chooseAbility` enforces slot caps engine-side;
  `gainAbilityXP` only on successful use (1.9 fired/run); aid quests capped
  3/run by the game.
- New code paths exercised: ability ladder (fired 1.9/refused 0.9 per run —
  refusals are engine prechecks working as designed), surge-fight override
  (1.77/run, all favored-assessed), treatVillager (0.2/run), lay_wait,
  readBook (0 — no books found). Trap/craft paths were NOT exercised (0
  attempts) — no exploit surface touched.

## Verdict

**The game is still the bottleneck — and the evidence is stronger now.**
oracleV2 engaged the deep systems for real (2.3× ability use, 4.3 abilities
held, 0.52 synergies, surge armed 93%, better aid completion) and it bought
+7d median survival and small progression gains — but **wins stayed 0/60**.
Policy engagement was not the missing piece.

**Recommended lever (with sim evidence): the scale on-ramp.**
`src/js/hierarchy.js` link-age 21d / trust 60. It is the binding deed-gate
constraint in **60/60** runs: every run reaches regional, none reaches
national, while integration (median 100), crises (49/60), and sentiment
(57/60) are all within reach. Median run life is 48d — barely 2× the 21-day
link-age floor — so links that do form (0.47/run) rarely mature before the
village dies (51% of deaths are combat). Turning this lever first is the only
change that unblocks the table for any policy. Second: combat death share
(~51%) — the survival tax that starves the on-ramp of time. Third (Steve-owned):
Wave Ledger bars — w2 bar 5→3 triples w2 completion (5→15/60), but scale binds
first, so take it only with the on-ramp. NOT recommended: lowering the 300
feastburn bank threshold alone — round-1 showed the honest surge is
near-unreachable in this policy, but `feastSurgeUsed` is behind scale in the
blocker order.

## Method notes / caveats

- Same seeds (1–60), same day loop, same watchdogs as rounds 0–2 —
  apples-to-apples with round-2 oracle.
- The sweep's `rows.push` initially dropped `proposed/climb/taught/named`
  (snapshot computed them); caught via a probe/sweep divergence on seed 21,
  fixed, full 60-seed re-run — trajectories identical (deterministic seeds),
  rows now complete. Round-2's analyzer has the same reporting gap.
- Counter-kills: probed every fight (8.1 assessments/run, 0 known) — the 0.0%
  is a verified structural zero, not a policy gap.
- Traps/crafts at 0 reflect a knowledge-acquisition gap (no books found in 60
  runs; trap recipes never learned), not a policy refusal — the road is armed
  but never has materials+knowledge together.
- `fled` mean 3,185/run is the pre-existing stuck-fight pathology (8/60 runs >
  1000; median 12) — same class as round-2's 13/60, handled by watchdogs.
