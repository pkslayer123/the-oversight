# Completion sweep r5 — four fix batches, current master (2026-10-10)

HEAD: `ecbfad1f` (hunter break-it: meat-yield honesty, gill-net 12→16,
hand-line x1.3 removal — on top of the four fix batches). 60 seeds (1–60,
deterministic) × 3 policies × 200-day cap. Read-only sims; no game code
changed. Runner `scripts/sweep-r5.js`, analyzer `scripts/analyze-r5.js`,
policy copy `scripts/policies/progress-r4.js`, raw JSON
`scripts/sweep-r5-results.json` (180 rows, committed).

Policies: canonical `scripts/policies/competent.js` (with bal-survival
counter-play: pack-first eating, forage trips, sort/sow/donate, garden+fish
duties); `progress-r4.js` = r4's reconstructed progress policy, requires
fixed to worktree-local paths (apples-to-apples vs r4); `idle.mvc`.
RNG seeded (mulberry32) before module eval; full index.html script order
minus DOM-only modules; window stubbed for eval then deleted. Util
instrumentation: 14 Game entry points wrapped with hit counters (originals
called — counting only). waveDay tracked in the daily wrapper, same
pre-sleep granularity as r4's arcDay.

## Headline

**Still zero Arc IV, zero table, zero wins in 180 runs — but the game got
longer and deeper.** Median survival 24→35 (competent), wave-3 unlocked in
35–43% of strong-policy runs (was 0/180), the w1 deed bar clears in ~26% of
runs, feast surge arms/uses in 42%/35% of progress runs, stage-3+ 4→25 and
12→30. Six runs hit the 200-day cap for the first time in any sweep. The
four batches moved every needle they could reach from inside a longer life —
and exposed the next wall cleanly: **scale never leaves 'village' in
organic play (0/180)**, which hard-blocks wave-4/5 unlocks, the deed gate,
Arc IV, the table, and the win.

| policy | Arc II | Arc III | Arc IV | table | wins | med days | max days |
|---|---|---|---|---|---|---|---|
| competent | 60/60 | 59/60 | 0 | 0 | 0 | **35** | 57 |
| progress | 60/60 | 59/60 | 0 | 0 | 0 | **31** | 55 |
| mvc | 60/60 | 38/60 | 0 | 0 | 0 | 16 | 25 |

Village-lost still the modal end (57–59/60 per policy), but the death curve
stretched: r4's p90 village-loss was day 31; r5 runs routinely reach the
40s–50s, and 6/180 hit the 200-day cap.

## Success criteria vs measured

| Criterion | Target | Measured | Verdict |
|---|---|---|---|
| median survival > 24d | ≥35 | competent 35, progress 31, mvc 16 | MET (competent, exactly) |
| wave-3 in organic play | ≥25% of competent | 21/60 (35%) competent, 26/60 (43%) progress; unlock days 25–38 | MET |
| feast surge armed | meaningful fraction | progress 25/60 armed (42%), 21/60 used (35%); competent 0/60 | MET for channeling policy; skill-ceiling policy never arms (see warts) |
| scale leaves 'village' | meaningful fraction | 0/180 | MISSED |
| Arc IV / table / wins | some deep runs, wins ~day 90–120 | 0/180 / 0/180 / 0/180 | MISSED |

## Regression vs r4 (HEAD cc7882f4 → ecbfad1f)

| metric | r4 | r5 | Δ |
|---|---|---|---|
| competent med/max days | 24 / 42 | 35 / 57 | **+46% median** |
| progress med/max days | 24 / 44 | 31 / 55 | +29% |
| mvc med/max days | 16 / 30 | 16 / 25 | flat |
| starvation/run (comp/prog/mvc) | 1.12 / 1.40 / 1.65 | 0.52 / 0.70 / 1.77 | halved for counter-play policies; mvc worse (no counter-play, longer exposure) |
| kill-deaths/day (comp/prog) | 0.32 / 0.31 | 0.30 / 0.32 | flat — combat lethality unchanged; totals rose with run length only |
| wave-3 unlocks (comp/prog) | 0/60 / 0/60 | 21/60 / 26/60 | **0 → 35–43%** |
| wave-2 distinct mean (comp/prog) | 0.17 / 0.22 | 1.20 / 1.20 | 7× — engagement lane working |
| w1 deed bar ≥5 (comp/prog) | 12/60 / 16/60 | 15/60 / 16/60 | slight up |
| w2 deed bar ≥5 | 0/180 | 0/180 | unchanged (max distinct 4) |
| sentiment (comp/prog) | 30/60 / 32/60 | 51/60 / 56/60 | + |
| feast used | 0/180 | 21/180 (all progress) | new |
| stage 3+ (comp/prog) | 4/60 / 12/60 | 25/60 / 30/60 | **6× / 2.5×** |
| system quests mean (comp/prog) | 0.03 / 0.02 | 0.18 / 0.22 | **~8×** (offers fire 60/60 runs) |
| study bites mean (progress) | 0.10 | 0.35 | 3.5× |
| L3 plants mean | 0.00 | 0.22–0.25 | lane alive |
| med codex breadth | 28 | 33 | + |
| contests survived ≥3 (comp/prog) | 10/60 / 9/60 | 22/60 / 17/60 | 2× |
| crises ≥3 | 39–46/60 | 41–45/60 | flat |
| scale rank | 180/180 village | 180/180 village | **unchanged** |
| progress roads: channels | 1027 (31 runs) | 1842 (55 runs) | focused XP + sentiment teaching |
| progress roads: backed/bites | 168 / 6 | 242 / 21 | + |

## Deed-gate assembly: closer, still far

Every-wave distinct fought (bars 5/5/4/3/2), max distinct per policy:

| policy | w1 max (mean) | w2 max (mean) | w3 max | w1≥5 | w2≥5 | w3≥4 | w4≥3 | w5≥2 |
|---|---|---|---|---|---|---|---|---|
| competent | 8 (3.83) | 4 (1.20) | 1 | 15/60 | 0/60 | 0 | 0 | 0 |
| progress | 9 (3.88) | 3 (1.20) | 3 | 16/60 | 0/60 | 0 | 0 | 0 |
| mvc | 5 (2.32) | 2 (0.20) | 0 | 1/60 | 0/60 | 0 | 0 | 0 |

Closest run in 180 (progress seed 48, d32): w [5,2,2], cx 3, cr 3, sentiment,
feast armed+used, stage 3, sq 1, breadth 26 — assembled 6 of 9 deed
components. Missing: w2≥5 (has 2), w3≥4 (has 2), w4/w5 (0), national+
(village). Wave-2 kills: max 3, mean 0.42–0.45 — **every w3 unlock came via
the engagement lane** (2 distinct faced); the kill lane (8 w2 kills) fired
0/180. Among w3-unlocked runs, w2 distinct: competent {2:14, 3:3, 4:4},
progress {2:20, 3:6} — nobody reaches the 5-fought deed bar.

Wave unlock days (r5): w2 med day 17 competent / 14 progress (60/60, 58/60
unlocked); w3 med day 31 / 28, range 25–38 — inside the 25–40 pacing target.
w4/w5: 0 unlocks (scale-gated).

## The binding stack, in order

1. **Scale: 0/180 leave 'village' organically.** Wave-4 needs regional,
   wave-5 and the table need national — all hard-blocked. bal-scale proved
   the mechanics with a link-seeking policy (regional 98% by day 45,
   national 30% by day 80), but the canonical policies never propose a
   link: no organic driver exists in the skill-ceiling playbook. The
   integration/plant-L3 parts of bal-scale DID move organically (stage-3+
   6×/2.5×, system quests ~8×, L3 plants 0→0.25) — the ladder's rungs work;
   nobody climbs them without link-seeking roads. This is now the single
   blocker for w4/w5 → deed gate → Arc IV → table → win.
2. **Wave-2 deed bar (5 distinct fought): 0/180, max 4.** The engagement
   lane unlocks w3 at 2 faced, but the deed bars are unchanged per Steve
   (5/5/4/3/2 fought). Wave-2 exposure is the limiter: even w3-unlocked
   runs top out at 4 distinct w2. The unlock now outruns the deed — facing
   counts for gates, only fought counts for deeds (a philosophical seam,
   see warts).
3. **Combat lethality per-day is flat** (0.30–0.32 kill-deaths/day both
   rounds) — still the dominant killer; totals rose only because runs are
   longer. The survival gains came from food, not safety. Bal-survival's
   open question to Steve stands: "dangerous world, fair world?"
4. **Feast surge is playstyle-gated.** Progress (channels) arms 42%,
   uses 35%; competent max surgeRes 21 vs threshold 35 — the skill-ceiling
   policy never arms. If the surge is a general progression lane, the
   skill-ceiling playbook should reach it; if it's the channeler's
   reward, it's working as designed. Needs a Steve call.
5. **Progression and survival are still in tension.** The 6 runs that hit
   the 200-day cap are all low-progression turtles (arc 2–3, uw ≤3, no
   feast, stage ≤2). Engaging the world (w3 fights, contests) is what
   kills runs. The win shape needs ~90–115 days of ENGAGED play; nothing
   survives that engaged yet.
6. **Starvation halved but not at target** — 0.52/0.70 per run vs the
   <0.5 bar; mvc 1.77 (a policy that won't use counter-play gets nothing
   from game-side fixes — expected per bal-survival).

## Batch-by-batch verdicts (did the fix move the needle?)

1. **bal-waves (engagement lanes + devotion lane): YES.** w3 0/180 → 47/120
   strong-policy runs, all via the engagement lane, unlock days 25–38 in
   the pacing target. Feast devotion lane: progress 42% armed / 35% used
   (first organic uses ever). Mastery lane still 0/180 (needs 3×L3 by
   ~day 24; L3-plant mean only 0.25).
2. **bal-scale (on-ramp + integration + plant-L3): SPLIT.** Integration
   pacing and the plant lane moved organically and hard (stage-3+,
   system quests, study bites, L3 plants all up multiples). The scale
   on-ramp did not: 0/180 leave village without link-seeking roads. The
   early-contact rumors and 3–4 villages are proven reachable only by a
   policy that proposes links — the canonical policies don't.
3. **bal-survival (depletion + counter-play): YES on food, NO on combat.**
   Starvation halved, median 24→35/31 (target ≥35 met exactly on
   competent). Combat deaths per day unchanged. mvc flat, as predicted.
4. **bal-util (10 dead systems): YES, beyond the roads policy.** On the
   canonical policies (no roads): sq_offer 60/60, splinter 51–53/60,
   petition_open 50–53/60, sentiment teach/channel 51–56/60,
   ratings_summons 15–21/60, synergy_unlock 24/60 (progress),
   trial_complete 26–28/60. Comms calls and haven tier-ups still need
   deliberate roads (0 and 2–3/60) — policy-blind, not broken, matching
   bal-util's own caveat.

The hunter break-it commit (meat-yield honesty, gill-net 12→16, hand-line
x1.3 removal) rode along on HEAD; no adverse signal — food income held and
starvation halved anyway. Its effect can't be isolated from the batch.

## Design warts found

1. **Unlock/deed seam.** Facing a wave-5 fight counts as "faced" for deeds
   and 2-faced unlocks the next wave — but the deed bars demand 5/5/4/3/2
   FOUGHT. A run can unlock wave 3 while its wave-2 deed bar sits at 2/5
   forever. The two systems now tell different stories about what
   "progressing through a wave" means.
2. **The safest play is the least engaged.** 200-day survivors are turtles;
   every system that advances deeds (w3 fights, contests, link-seeking)
   raises the death rate. Until engaged play survives ~90 days, the win
   shape is unreachable by construction, not by tuning.
3. **Competent never arms the surge** (max res 21/35). The devotion lane
   keys off ability use + channeling; the skill-ceiling policy fights
   lean and channels little. Either the threshold needs a second lane
   the competent playbook fills, or the surge is declared a channeler
   reward.
4. **haven_tierup 2–3/60** — the tier bar fires but the canonical policy
   doesn't stockpile toward it. Same policy-blind class as comms calls:
   reachable, unrewarded by the skill-ceiling playbook.
5. **mvc is now a pure do-nothing baseline** — informative (it isolates
   game-side-only effects: none), but it drags every mean. Consider
   reporting it separately from the two trying policies.
6. Progress-policy fidelity caveat carries forward (reconstructed from
   r3 prose; relative ordering competent ≈ progress ≫ mvc held again).

## Read

r4's read was "the gate is correctly closed but the game got shorter."
r5's read: **the game got longer and the gates started opening — wave-3
in a third of strong runs, the w1 deed bar clearing, the surge arming,
stage-3+ multiplying.** Every batch except the scale on-ramp moved its
needle organically. The next unit of work is the scale ladder's organic
driver (link-seeking roads in the canonical playbook, or an on-ramp the
skill-ceiling policy stumbles into) — without it, wave-4/5, the deed
gate, Arc IV, the table, and the win are unreachable by construction.
After that: the wave-2 deed bar vs wave-2 exposure, and the
progression-survival tension (engaged play must survive ~90 days).

Runner: `scripts/sweep-r5.js` (+ `scripts/policies/progress-r4.js`,
`scripts/analyze-r5.js`); raw: `scripts/sweep-r5-results.json` (180 rows).
Suggested follow-up: re-run this exact sweep after the scale-driver work;
seeds 1–60 deterministic, apples-to-apples.
