# Completion sweep r3 — current master (2026-10-10)

HEAD: `a24f0146` (brawler break-it r11). 60 seeds (1–60, deterministic) × 5 policies × 200-day cap.
Read-only sims; no game code changed. Runner + policies live in `/tmp/sweep-r3/`
(repo untouched): `sweep-r3.js`, `progress-policy.js`.

New this round: a **progress** policy (competent base + the five roads the
completion-gap crew built): channels keepsakes daily once taught, tells
villagers about beasts (`askAbout` tellbeast/namebeast) and backs the leading
name, takes explorer lessons (`agencyTurn` ask_field), grinds plants toward L3
(study bites), completes villager quests (unblocks the system-quest slot),
answers the table. The other four policies are unchanged baselines.

## Headline

**The game is finishable. First organic win on record: progress policy, seed 1,
won on day 47 — well under 200 days.** Ending frame **feared**, final live
choice **"Make an example."** The full chain fired through real code paths:
sentiment taught (day 25) → 110 keepsake channels → 3 abilities to L3 → surge
armed (day 44) → feastBurn surge in a real fight → Arc IV → the table.

| policy | Arc III | Arc IV | table | wins | median days | max days |
|---|---|---|---|---|---|---|
| zero | 22% (13/60) | 0 | 0 | 0 | 16 | 200 |
| mvc | 35% (21/60) | 0 | 0 | 0 | 18 | 200 |
| leader | 12% (7/60) | 0 | 0 | 0 | 16 | 40 |
| competent | 85% (51/60) | 0 | 0 | 0 | 29 | 105 |
| **progress** | 72% (43/60) | **1/60** | **1/60** | **1/60** | 28 | 58 |

vs r2 (HEAD `7c832842`): competent Arc III 75%→85%, stage-3 7/60→16/60,
mean breadth 26.3→30.7, max survival 52→105. The integration-80 road and
breadth fixes measurably moved the needle for the *unchanged* competent
policy. mvc/leader/zero within noise.

## The winning run (progress, seed 1)

- Arc II day 9, Arc III day 33, stage 2 day 12, stage 3 day 36, sentiment
  taught day 25, surge armed day 44, **won day 47** (`over-other`, `won=true`,
  lineage outcome `table`).
- Final state: integration 100, breadth 35, 5 contests, maxWave 2,
  15 villager deaths weathered along the way (the village bled for it).
- Road: 110 channels, 28 explorer lessons, 1 monster named, 0 system quests,
  0 study bites (the L3-plant lane never engaged — see blockers).
- Frame **feared** / choice **"Make an example."** — the leadership vector
  (heavy combat, many graves) was felt before arrival, as designed.

## The road engages (progress policy means)

- Channeling: 32/60 taught runs channeled (median taught day 21), mean 29.5
  channels/run. The channeling link from gap-2 is closed in the sim.
- Lessons: mean 10.6/run. Naming: mean 0.87 settled names/run (ambient
  debate + player backing).
- System quests: **mean 0.07/run — the line barely fires** (4/60 completed).
  Two compounding causes: offers are 15%/day *and* the slot is usually
  occupied (see wart 1); completion needs a NEW plant at L3, and the L3
  lane never engaged (see blocker 3).
- Study bites: **0 across all 300 runs.** No run produced an L2 plant.

## The binding stack, in order

1. **Survival.** Median 28–29 days (progress/competent), max 105. The win
   needed 47 days; 15/60 progress runs reached win-shape (stage 3 + sentiment
   + Arc III) and died anyway — killed by combat (45), the night (45),
   monsters (28), villager combat (20). Village fragility is still the
   binding wall, exactly as the gap report predicted.
2. **The 3×L3-ability surge gate.** Only 2/60 progress runs armed the surge
   (seeds 1 and 6); seed 6 armed day 17 but died day 34 before using it.
   The XP math is fine (35 XP/ability, +2/channel/unmaxed — seed 1 armed in
   19 channeling days), but two structural throttles bite:
   - **Fewer than 3 owned abilities = gate unreachable forever.** Seed 55:
     121 channels, 2 abilities, surge impossible. Ability acquisition is
     offer-scarce (week-1 choice + trial gifts).
   - **Scholar death resets the grind.** Abilities are per-scholar, not
     per-village; the mantle passes and the L3 climb restarts.
3. **The plant-L3 lane is dead in practice.** L1→L2 needs 5 harvests of the
   same familiar plant (one bump per forage sweep); L2→L3 needs 3 tastings.
   Zero L2s in 300 runs means the system_teach identify-trials and the
   quest-completion path never fire organically. The mechanics exist; the
   pacing doesn't produce them inside a ~30-day survival window.
4. **Integration 80** (improved, no longer the wall): 15–16/60 for the strong
   policies (was 7/60). 40→80 stretch: median ~14 days (stage 2 day 13 →
   stage 3 day 27). Sources are diverse now (trials, milestones, namings,
   quests) — the monoculture is gone.

Gate analysis (progress, 43 Arc III non-winning runs): feast 43/43 unmet,
stage 28/43, sentiment 13/43, breadth 3/43. Competent (51 runs): feast 51/51,
stage 34/51, sentiment 19/51, breadth 1/51. **Feast-surge is the universal
blocker; breadth is solved.**

## Death causes (all policies, top)

`the night` (scholar attrition — health hit 0 overnight; the dominant
scholar-killer), `combat`, `monster`, `starvation`, `villager combat`,
`sickness`, `thirst`, `a wound that wouldn't close`. Weak policies die of
needs (starvation/thirst/sickness lead); strong policies die of violence and
attrition (combat/monster/night lead). Contests killed 3–4 villagers per
strong policy (Blood on Air is live but rare — villages rarely reach contest
age in numbers).

## Design warts found while building the sweep

1. **Stale pre-40 quest blocks the 40+ system-quest line.** `offerSystemQuest`
   refuses while `activeQuest` exists; the ghost-quest guard only lapses
   dead-giver quests. A hard-to-complete villager errand (e.g. out-of-season
   plant) permanently blocks system_teach offers. The progress policy works
   around it by doing errands; the game should lapse or sideline stale
   villager quests once the System line opens. (Not fixed — game change,
   needs Steve's eyes on whether quest-abandonment should exist.)
2. **Surge gate has no graceful failure for <3 abilities.** A 2-ability
   scholar can channel forever and never arm the surge; nothing says why.
   The channel copy already handles it ("the surge wants three mastered
   gifts, and you hold 2") — honest, but the *acquisition* side is thin.
3. **Mantle/ability XP reset** (seed 55: 3→2 abilities on scholar death).
   By design (village-not-individual), but it makes the surge gate fragile
   in bloody runs.

## Read

**Can it be finished? Yes — day 47, organically, through every designed
gate.** Is it finishable *well under* 200 days? The one win says yes, but
the rate is 1/60 for the best policy and 0/240 otherwise. The game is
completable but the completion is a needle: the village must survive ~45
days (median is 28), hold 3+ abilities on one scholar, and grind 3 of them
to L3. The next unit of work is survival (the fragility wall), then the
ability-acquisition economy and the plant-L3 pacing — not the arc gates,
which all fire correctly now.

Runner: `/tmp/sweep-r3/sweep-r3.js`; policy: `/tmp/sweep-r3/progress-policy.js`;
raw JSON: `/tmp/sweep-r3/results-r3.json`.
