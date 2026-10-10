# Utilization Audit r5 — The Oversight (2026-10-10)

**Worker:** bal-util | **Worktree:** ~/workspace/worktrees/bal-util
**Method:** `scripts/util-sweep.js` — full index.html script order eval'd in node, RNG seeded before eval, ~45 Game entry points wrapped with hit counters. 60 seeds × policies, 200-day cap. Baseline: competent + progress policies (canonical `~/workspace/sweep-r4-scratch/progress-policy.js`). Post-fix: `competent+roads` (`scripts/util-roads.js`) — models obvious competent behaviors the canonical policies predate (answer crises, interview petitioners, work toward haven tiers, use ability bar).

**Rule honored:** Steve's "Everything built must be reachable." Every 0% below was root-caused in code, not assumed.

## Utilization matrix (60 competent runs; post-fix = competent+roads)

| System | Baseline | Post-fix | Verdict |
|---|---|---|---|
| comms call (aid crisis answered) | 0% | **90.0%** | WIN |
| comms signal fire | 0% | **90.0%** | WIN |
| splinter petition opened | 0% | **45.0%** | WIN |
| petition moot held | 0% | **40.0%** | WIN |
| haven tier-up (0→1→2) | 0% | **50.0%** | WIN |
| ratings summons (played stunt) | 0% | **18.3%** | WIN |
| synergy unlocked | 0% | **28.3%** | WIN |
| synergy teased | 0% | **30.0%** | WIN |
| village splinter beat | 5% | **46.7%** | WIN |
| ability-bar use | 0% | **30.0%** | WIN |
| trials completed | 16.7% | 20.0% | alive |
| contests fired | 68.3% | 66.7% | alive |
| shows fired | 61.7% | 56.7% | alive |
| comms runner tier | 0% | 0% | reachable, road prefers signal |
| beg/raid answered | 0% | 0% | dead prereq (see below) |
| aid sent to village | 0% | 0% | dead prereq (see below) |
| folk-remedy cure | 0% | 1.7% | improved; policy-blind |
| feast hosted | 0% | 0% | bal-waves territory |
| craft | 0% | 0% | policy-blind, UI reachable |
| gossip topic2 | 0% | 0% | policy-blind, UI reachable |

**10 systems moved from dead (0–5%) to ≥15%.** Median run length 25 days (survival wall — bal-survival's territory).

## Fixes (each with proof test `scripts/test-util-*-20261010.js`, all green)

**F1 — Raids raise aid crises** (`havenGrowth.js`, `comms.js`): `raiseAidCrisis` had no organic caller (only debug-scenarios). Haven raids now raise a real aid crisis; raid size scales with pantry wealth; unmet raiders linger and gorge nightly (replacing instant pillage); crisis auto-resolves 'fought' when the treeline clears (3+ parts old, so the player gets a day to answer); 6-day 'moved-on' valve. → comms_call 0→90%.

**F2 — Petitions without links** (`villageAgency.js`): `fireSplinter` required an inter-village link, but links form in 0/120 runs — dead prerequisite. PROGRESSION.md §10 shows breakaways petitioning with no link mentioned. Non-hardline causes now send petitioners regardless. → petition_open 0→45%, splinter 5→47%.

**F3 — Audience drift** (`contests.js`): viewership only ratcheted up (moments +1, nothing down), so the dip-gate feeding the ratings summons never armed. Weekly drift: −10% (min 2.5, floor 12); `_lastWeekViewership` made truly week-over-week (was refreshed daily); dip state persists all week; soft = falling OR <15. → ratings_summons 0→18.3%.

**F4 — Synergy-aware trial gifts** (`progression.js`): `_synergyGiftPick` prefers gifts completing a held/teased synergy leg. **F4b — Passive resonance** (`game.js`): pure-passive legs count as brought-to-bear while held. → synergy_unlock 0→28% (all peacemakers_voice: diplomat+mediator).

**F5 — Other villages eat** (`villageAgency.js`): unapproached villages burned nothing; pantries sat at 15–24k forever, tension decayed to 0 — famine/schism preconditions unreachable. Now burn pop×120 kcal/day; existing famine/tension machinery takes over. → splinter 5→47%.

## Not fixed (honest report)

- **beg/raid/aid beats (0%):** need inter-village links or proximity the policy doesn't pursue; village catch-up sim is bal-scale's lane. Mechanism verified live (F5 famines fire); beats reachable, policy doesn't walk there.
- **craft, topic2, counter-verbs, folk cures:** UI-reachable; canonical policies predate the UI. Policy-blind, not game-broken.
- **feast:** bal-waves. **Alien diseases/players:** wave-2 gate, coordinate with bal-waves. **System-quest completion:** plant-lane gate, bal-scale.
- **comms_runner:** reachable (`aidPickRunner` works); road prefers signal fire. Not a bug.

## Regression
`test-haven-growth` 61/61, `test-aid-comms` 71/71, ontology 57/57, `node --check` clean. No sibling files touched (food/depletion/lethality, wave unlocks/feast, scale/plant-lane).

**Merged locally, pending ship.** No push/bump per Vercel batching rule.

## Landing notes — coordinator conflict resolution (2026-10-10)

- **Ratings-decay design conflict:** sibling break-it contests r13 landed the same day with a different fix for the dead dip signal (daily −1 viewership decay, floor 0). Resolved in favor of this pass's design (weekly −10% drift, floor 12; week-over-week trend persisted all week; soft = falling OR <15), which carries the measured utilization data (summons 18.3% of runs). Sibling's break-contest r3 suite still green (22/22) under the chosen design. ONTOLOGY.md keeps both entries.
- **Test bug fixed:** test-util-raid-crisis's "resolves fought" check called commsTick once on a crisis <3 parts old; the 3-part answer delay is intentional design (village gets a chance to answer). Test now ticks until the crisis is old enough (≤5). 11/11 ×3 seeds.
