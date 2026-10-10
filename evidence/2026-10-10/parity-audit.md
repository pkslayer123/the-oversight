# Parity Audit — combined report (2026-10-10)

Steve's orders: (1) look for evidence of villagers not playing like players, parts of the game never reached, anything else breaking or weird; (2) run games that SEEK to complete the game. Five workers, parallel long runs.

## Worker A — Villager-player parity (LANDDED as `2b17bd96`)

40 runs (20 seeds × competent/socialite, 200-day cap, 4 parallel processes). Full parity matrix in `evidence/2026-10-10/parity-worker-a.md`.

**Two parity gaps fixed:**
1. **Villager abilities never fired in combat** — `npcGrantAbility` granted ~400 abilities across 40 runs but only phoenix eligibility ever read `npcHasAbility`; measured player ability uses 2440–2470 vs villager **0**. Now: fieldFights read the villager's kit blow-by-blow (patient_aim, haymaker, ambush, war_cry, scream_cheese, unbreakable-at-player-brace-numbers, dead_aim, blood_trail, trade_of_blows, stalk, game_sense/tracker/echo_location); purify/iron_stomach halve sicken (0.70→0.28 measured); triage medics reach 2 patients; tactical-combat allies brace + haymaker. Kit vs baseline: 26.1 vs 8.8 dmg/fight. Proof: `scripts/test-parity-abilities.js` 15/15 (STRIP mode fails 9/15 — sensitive).
2. **Hunt duty was a flat R(400,900) roll** — no prey, no depletion, no gear, no skill, while the player hunts a real animal with real depletion. New `villagerHuntResolve`: real animal from real tile wildlife (hunted-out ground yields nothing, honestly), same chance modifiers as the player's `huntAnimal`, real kcal × butcher fraction.

**Deliberate differences (not fixes):** System quests player-only (the scholar is the System's interlocutor); synergies player-only (needs per-fighter practice logs — villagers now have the ability-use foundation as prerequisite); crafting/trapping player-only (Steve: NOT a crafting game); feasts player-hosted; aid-cry chain player-initiated; ratings summons player-only (canon `summons_castability`); tactical active-ability AI for allies = follow-up (passive/reactive done); contests: villagers co-star through the REAL engine, first-pick prefers the player ("the System's surest star") — deliberate.

**Remaining gaps:** villager tactical active-ability AI; villager synergy discovery (needs use-logging); **late-game parity unverified** — all 40 runs died ~day 30, zero coverage of waves 3–5, switchboard, national scale.

**HARNESS CORRECTION found during this audit:** the shared `runDays` drives time via raw `tickAction(128)`, which fires `npcBatchTurn` but NOT `villagerTurn` (the needs-driven individual-action driver). Live play routes every action through `doAction → villagerTurn`. Uncorrected, prior sweeps measured villagers standing still (~1 npcTakeAction/30 days). This may mean ALL prior utilization sweeps under-measured villager agency — Worker B's instrumentation should correct for this.

## Worker C — Weirdness hunt (LANDDED as `5b04842b`)

16 runs (4 seeds × progress/mvc/survivalist/socialite, 200-day cap, 4 parallel processes), 15-invariant scanner. Full report: `evidence/2026-10-10/parity-worker-c.md`.

**Six weirnesses fixed:**
1. **Dead mentor teaches you** — `bestMentor()` picked from the unpruned trust map; a day-6 corpse taught the day-40 slot beat + post-mortem +4 trust. Live-roster-only now.
2. **Dead conflicts keep simmering** — conflicts with dead parties never pruned: "carry a message from [corpse]" + trust bumps weeks post-mortem. Simmer resolves gone-party conflicts; `conflictIncident` early-returns; `mediateConflict` refuses.
3. **Dead mourner at the mantle** (latent) — `playerDeath` picked the "You're not her" speaker from the unpruned trust map. Live-roster-only now.
4. **Dead absorb witness_maw dread** (latent) — −2 trust looped over trust-map keys incl. the dead. Live roster now.
5. **Ambush victims not marked dead** — `removeVillager(vid,'ambushed')` skipped the DEAD IS DEAD mark; `vpOf().dead` lied. Marked now.
6. **Trust telemetry had no causes** — justice.js's `G.bumpTrust` wrapper dropped `reason`: all 3985 trust events across 16 runs were `'?'`. Reason passthrough + reasons on top-firing sites; post-fix 380/500 events carry real reasons.

Proof: `scripts/test-weird-dead-trust-20261010.js` 10/10 ×3 (4/10 before — sensitive). Invariants held 16/16 post-fix: timeline, death-cause, disease pools exact, gossip provenance, monster waves, pantry sanity, rep-trust law (0 gossip-moved trust), contest gate, unique names, no phantom villages, dead-never-act.

**Caveat:** all 16 runs died days 13–42 (control of the ORIGINAL competent policy also died day 36) — the current organic survival profile; long-horizon (100d+) weirdness surface is thin.

## Worker D — Contest/show reachability (LANDDED as `9c2d3872`)

1005 days (5 × 200d, seeds 424242/777/31337, competent + fame-seeker). Full report: `evidence/2026-10-10/parity-worker-d.md`.

**Organic fire rates:** contests 11.64/100d, TV shows 6.17/100d, ratings summons 3.18/100d (~1.5 TV events/week — inside the 2/week budget). First contest day 14–17 every run (embargo holds). All 8 categories + all risk tiers observed.

**Playability: PLAYABLE end-to-end** — 211/211 modals driven to terminals, 0 stuck, 0 throws. 117 countdowns → 117 interruptions → 0 skipped. 4 arena fights completed. 0 broadcast frame leaks in 1005 days.

**Villager participation: PLAYED, not simulated** — 57 interruptions had villager co-stars, all engine-resolved (`contestResolveVillager`); 5 villager-only contests went through the watch path → real fights/moots/ordeals; 1 villager TV pull played the full watch-phase path → fans/shame. Casting: lead = player 112/117 (the 5 exceptions are the 10% System's-whim path — verified announced, never silent, constrained to notables). Fan clubs move per lane on wins, drift to 0.

**Fixes:** (1) **show/contest id collision** — game.js routes on id, so the fully-authored TV show "The Moot" NEVER aired (every pick became a contest). Renamed → `moot_show` + no-collision regression assert. (2) Unreachable arena epitaph phases marked `unreachable: true` so phase-graph audits skip honestly. (3) Test staleness reconciled (all verified pre-existing via stash). (4) **Ratings design conflict resolved**: live code = bal-util's weekly drift; the sibling's r13 suite had pinned daily decay — updated K1b to the decided weekly design and fixed a genuine incoherence (dip's `now < 15` clause fired the desperate path on rising weeks the −0.10 coast rule rewarded). r13 now 23/23 ×3 seeds on current master.

**Cross-lane observations (not fixed):** villager mortality steep without player healthcare (thirst/sickness cascades emptied rosters ~day 40 — survival-balance lane may want the numbers); idle players get moot-exiled ~day 16–17 (plausible, judged non-contributor, but zeroes contest participation — justice lane may want a glance); villager co-stars win 79% (threat-matching works; too kind is a balance call).

## Worker E — Win-seeking completion runs (LANDDED as `db9d9a23`)

60 seeds × winseek policy × 200-day cap, 6 parallel shards × 10 seeds. The money metric.

**Wins: 0/60. Table reached: 0/60.** Median survival 24 days (max 43) — the win needs ~100 days (pacing audit).

Per-requirement completion (60 runs): w1 ≥5 distinct 42/60 (70%); w2 ≥5 1/60 (2%); w3+ 0/60; contests ≥3 survived 13/60 (22%); crises ≥3 36/60 (60%); scale national+ 0/60; sentiment taught 45/60 (75%); feast surge used 21/60 (35%); integration stage ≥3 41/60 (68%).

**Top blockers:** (1) early-game survival — villages lose ~12 members in ~24 days to combat (~6) and attrition (~6: night/sickness/starvation/thirst/wounds); best run (seed 17, day 43) reached w2=4/5, one short, would have filled with 20 more days. (2) Scale: 0/60 national — the BELONG road works mechanically (subordinate links by day 3–4, weekly tribute paid) but needs 21+ days link age + trust 60, mathematically impossible at 24-day median survival. (3) The 5/5/4/3/2 bars are proportional to wave sizes and well-calibrated — NOT the problem; runs just end too early.

**No game-code fixes warranted:** the policy reliably achieves early requirements (w1 70%, sentiment 75%, stage 68%, crises 60%), proving the gates are achievable in principle. The later gates are unreachable only because runs end. Per settled law, the 5/5/4/3/2 bars stand; no gate changes.

**Vicious cycle documented:** haven tiers (Longhouse/Palisade/Granary) are never built — 0/60 reach tier 1 (needs 8,000 kcal + 200 wood stockpile). The Palisade's raid defense would help survival, but villages can't accumulate surplus while starving. Fixing food economy / combat lethality / tier reachability is a design call for Steve.

Harness fixes found during development: travel in `daily` sets pendingEncounter which blocks `sleep()` → clock stuck (travel belongs in `upkeep`); `startCombat` records the deed immediately, so "flee if faced" needs a faced-before-fight snapshot. Evidence: `evidence/2026-10-10/parity-worker-e.md`; policy `scripts/policies/winseek.js`; results `scripts/sweep-winseek-results.json`.

## Worker B — Reachability sweep (IN FLIGHT)

Instrumented coverage over long organic runs; coverage table system → organic fire count → verdict. Report lands on completion; evidence `evidence/2026-10-10/parity-worker-b.md` (pending).

## Worker E — Win-seeking completion runs (IN FLIGHT)

Policy actively pursuing the galactic-table gate: every-wave deed bars (5/5/4/3/2), 3 contests, national-or-higher scale, 3 crises, sentiment taught, feast surge, integration ≥3. 60+ seeds in parallel, 200-day caps. Money metrics: win rate, median win day, per-requirement completion table, top blockers, unachievable/mismeasured requirements with fixes. Evidence `evidence/2026-10-10/parity-worker-e.md` (pending).

## Notable cross-cutting signals

- **The r13/weekly-drift conflict is settled on current master** (23/23 green) — the util audit's weekly design is the live behavior and the proof now pins it.
- **Harness hygiene lesson (from A):** raw-`tickAction` sweeps under-measure villager agency; corrected sweeps route through `villagerTurn`.
- **The survival wall dominates everything:** every organic long run dies ~day 13–42 (median ~30–36). Waves 3–5, switchboard, national scale, and the win all live beyond the horizon organic play reaches — the win-seeking worker E is the only lens on whether the endgame is reachable at all.
