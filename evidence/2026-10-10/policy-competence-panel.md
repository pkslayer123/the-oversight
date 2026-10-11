# Policy-competence panel — evidence (2026-10-10)

Steve's question: **"how do we know the sim plays well?"** This panel runs four policies
on the same 60 seeds (common random numbers, 10 seeds × 4 policies per shard × 6 shards,
200-day cap) and measures outcomes + system utilization + an oracle bound.
Run: `node scripts/analyze-competence.js` (merges `scripts/panel-competence-s1..s6.json`
into `scripts/panel-competence-results.json`).

Base: post-rebase onto master (shards 4+6 re-run on the rebased base; 1/2/3/5 carried
over from the pre-reboot worker run on b155bb7c — measurement only, no game changes).

## Outcomes (per policy, n=60)

| policy    | wins | medSurv | t1 | t2 | w2unlk | w3unlk | nation+ | maxDay | cx>=3 | sent |
|-----------|------|---------|----|----|--------|--------|---------|--------|-------|------|
| competent | 0/60 | 45      | 54 | 0  | 38     | 1      | 0       | 91     | 10    | 56   |
| progress  | 0/60 | 46      | 54 | 0  | 40     | 1      | 0       | 86     | 15    | 56   |
| winseek   | 0/60 | 32      | 37 | 0  | 14     | 0      | 0       | 74     | 16    | 53   |
| oracle    | 0/60 | 41      | 42 | 0  | 33     | 0      | 0       | 109    | 20    | 54   |

Scale reached: competent/progress stayed `village` in all 60 runs; winseek/oracle reached
`regional` in all 60. Nobody reached t2, national, or the endgame; only 2 of 240 runs
even survived the 200-day cap without a win ('survived' endReason, s3/s5). Every other
run ended `village-lost`.

## (a) Which systems each policy uses / ignores

| policy    | abil (p/v) | syn | kills | ctrRate | crafts | traps | feasts (ok/att, arm/use) | aid cry | aq (acc/hnd) | relief | summons | sq |
|-----------|------------|-----|-------|---------|--------|-------|--------------------------|---------|--------------|--------|---------|-----|
| competent | 0.0 (0/0)  | 0.00| 6.9   | 0.0%    | 0/0    | 0/0   | 0.0/0.0 —                | 0.0     | 0.0/0.0      | 0.0    | 0.3     | 0.2 |
| progress  | 0.0 (0/0)  | 0.42| 7.3   | 0.0%    | 0/0    | 0/0   | 0.0/0.0 —                | 0.0     | 0.0/0.0      | 0.0    | 0.3     | 0.2 |
| winseek   | 0.0 (0/0)  | 0.53| 4.1   | 0.0%    | 0/0    | 0/0   | 1.8/4.5, 80%/15%         | 0.0     | 0.0/0.0      | 0.0    | 60.3    | 0.2 |
| oracle    | 1.2 (1.2/0)| 0.48| 6.5   | 0.0%    | 0/0    | 0/0   | 1.5/2.6, 78%/80%         | 0.0     | 2.7/0.2      | 8.6    | 187.0   | 0.4 |

- **Abilities / synergies**: effectively untouched. No policy uses the six ability slots
  with any regularity (oracle: 1.2 uses/run, all player-side); synergy discoveries are
  <1/run; **counter-kill rate is 0.0% for every policy** — nobody is earning kills via
  learned monster counters.
- **Crafting and traps**: dead to all policies — 0 crafts, 0 trap sets/catches across
  all 240 runs.
- **Feasts**: the only deep system winseek/oracle touch — winseek arms 80% but only uses
  15%; oracle arms 78% and uses 80%. Competent/progress never feast.
- **Aid**: competent/progress ignore it; oracle accepts 2.7 aid quests/run but hands in
  only 0.2 (accepts, can't complete), spends 8.6 relief/run. Nobody cries for aid.
- **Shows / summons**: competent/progress barely see them (0.3/run); winseek answers
  60.3 summons/run; oracle 187.0 (its always-respond-to-summons tuning). System quests
  are rare for everyone (0.2–0.4/run).
- Interpretation: the policies' ceiling is set by **fight/survive basics only** — the
  mid/late systems (abilities, synergies, crafting, traps, counters) are not load-bearing
  in any run, by any policy. If these systems were required to win, the win rate would
  still be ~0. Either way they are not being exercised by this panel.

## (b) The oracle bound — policy vs game bottleneck

- winseek: 0/60 wins, median 32d, max 74d
- oracle (winseek + win-probability fight assessment, arm-up + combat openers,
  always-accept-aid-when-struggling): 0/60 wins, median 41d (+10), max 109d
- **Verdict: ORACLE ALSO ~0 WINS — the GAME is the bottleneck, not the policy.**
  Even the hand-tuned oracle never won in 60 runs; no policy reached t2, national
  scale, or the endgame. "Does the sim play well?" cannot currently be answered by
  win-rate at all — nothing can win. Note also the inversion: winseek (the
  win-seeking policy) survives *worse* than competent (median 32d vs 45d).

## (c) Death-cause shares

| policy    | deaths | combat | villager combat | the night | monster | other top-5            |
|-----------|--------|--------|-----------------|-----------|---------|------------------------|
| competent | 691    | 42%    | 20%             | 12%       | 7%      | wound that wouldn't close 6% |
| progress  | 703    | 42%    | 21%             | 11%       | 7%      | wound that wouldn't close 6% |
| winseek   | 566    | 36%    | 19%             | —         | 10%     | sickness 10%, starvation 8%  |
| oracle    | 621    | 31%    | 23%             | 18%       | 10%     | sickness 5%                  |

- ~60% of deaths are combat (player + villager). "The night" is a named killer
  (11–18%) for competent/progress/oracle. winseek dies differently — more
  sickness (10%) and starvation (8%), fewer combat deaths — consistent with its
  lower survival despite reaching regional scale every run.

## Method notes / caveats

- 240 runs, 0 script ERRORs. All runs on villagerTurn-corrected day loop
  (`Game.doAction('wait')` per part, never raw tickAction(128)).
- Common random numbers: same seed => identical RNG stream per policy.
- winseek/oracle engage shows heavily; competent/progress do not — so utilization
  differences partly reflect engagement, not just competence.
- 'summons' counts contestChoose calls during an active summons (responses, not offers).
- Shard seeds: s1=1–10, s2=11–20, s3=21–30, s4=31–40, s5=41–50, s6=51–60.
- Measurement only: no game numbers, Wave Ledger, or balance changes touched.
- `scripts/policies/competent.js` carries a makePlot no-progress guard added by the
  previous worker (scripts-only, infinite-spin fix); all 6 shards ran without it
  firing (no shard hung), so it does not affect the measurements.

## Incident note (ghost re-run loop, 2026-10-10 ~03:33–03:38 UTC)

A bash loop from the killed previous worker survived the runtime restart and re-ran
shards s3→s6 sequentially in this same worktree, overwriting `panel-competence-s3.json`
at 03:36:02 (same seeds, new base — content legitimately differs from the original
s3 run, which is measurement-identical-seeds, not an RNG bug). Found via mtime +
`ps`; killed (PIDs 7105/7740) before it could overwrite s4/s5/s6. s3 was restored
from git (`git checkout HEAD -- scripts/panel-competence-s3.json`), s4/s5/s6 verified
intact, analyzer re-run reproduces the committed results byte-identically, and the
ghost's partial s4 log is at /tmp/panel-s4.log (s3 log at /tmp/panel-s3.log).
Lesson: on worker restart, check `ps` for surviving loops from the previous session
before trusting shard files.
