# Pacing + Strategy Audit — The Oversight (2026-10-09)

Method: 240 long-horizon sims (4 policies × 60 seeds × 200 days), new telemetry
script `scripts/telemetry-pacing-20261009.js` recording arc/stage transition
days, crisis day+kind, contest days, integrate-by-reason, ability grants, food
kcal by source, trust curves. Raw: `~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/pacing-sweep-20261009.json`.
Three parallel diagnoses: walls reachability (integration/sentiment/feastSurge),
social fabric, build diversity/strategy.

## 1. PACING DISTRIBUTIONS (measured, 240 runs)

| metric | zero | mvc | leader | competent |
|---|---|---|---|---|
| median end day | 14 | 16 | 14 | 28 (p90 57, max 200) |
| end reason | 60 lost | 60 lost | 60 lost | 59 lost, 1 survived |
| Arc II day | 9 (all) | 9 (all) | 9 (all) | 9 (all) |
| Arc III day (median) | 15 | 16 | 16 | 18 |
| Arc IV | 0 | 0 | 0 | 0 |
| first crisis (median) | 12 | 10 | 11 | 11 |
| crisis kinds | grave 45, hunger 15 | grave 59, hunger 24, breach 25, schism 3 | grave 45, hunger 16 | grave 58, breach 41, hunger 30, schism 9 |
| first contest (median) | 14 | 15 | 14 | 16 |
| integration at end (median) | 38 | 39 | 38 | 52 (p90 79, max 100) |
| stage 3 reached | 0 | 0 | 0 | 5/60 (days 29–54) |
| sentiment taught | 0 | 0 | 0 | 5/240 |
| feastSurgeUsed | 0 | 0 | 0 | 0 |
| tableWaiting / won | 0 | 0 | 0 | 0 |

### Reactive vs timer-driven, beat by beat

- **Arc II (day 9, EVERY run): TIMER in disguise.** Gate is
  `systemArrived && day>=7 && villageNotabilityScore()>=10` (progression.js:326).
  villageNotability() (betrayal.js:2417) returns 30+25=55 by day 7 for every
  village regardless of behavior. The gate is mathematically unreachable-as-false.
  Worse, the beat text claims reactivity: "Strangers will come — not because the
  plot says so, but because surviving is worth watching." It is because the plot
  says so. Fix: gate Arc II on an actual notable deed (breadth>=6? a kill? a
  first contest?) or rewrite the beat honestly.
- **System arrival (day 7):** hard timer, but canonized by Steve — keep.
- **Contests (first med day 14–16): REACTIVE, working.** Day-14 floor, then
  ratings-driven scheduling (contests.js:231): base 0.25/day, +0.15 viewership
  declining, −0.10 ratings high, +0.10 recent death/fracture, 2/week budget cap.
  This is the model everything else should copy.
- **Arc III (med day 15–18): earned-but-cheap.** The crisis gate works
  mechanically, but the dominant crisis is **first-grave** (45–59/60 runs) —
  "someone died" is the near-guaranteed early event, so Arc III usually means
  "you buried someone," not "you survived something together." The crucible
  fires before the village has bonded (see §2). breach/hunger/schism add
  variety for competent runs, but grave-first is the default path.
- **Arc IV: UNREACHABLE.** 0/240. Even the 200-day survivor (competent seed 17:
  stage 3, integ 80, 4 crises, 6 contests) stalled at Arc III. See §3.

### Is the pace healthy? (judgment)

- **Days 1–7 (Act 0):** about right for bonding (talk caps at 40 trust; a social
  player gets a few villagers to friendly), but the village's internal graph is
  frozen at gen time (§2) so there's little *new* sociality to react to.
- **Day 7 → day 9:** TWO megabeats in 48 hours (System arrival, then Arc II).
  The Show should arrive with more air — Arc II on day 9 makes the System's
  arrival feel like a trailer for the real show rather than an event itself.
- **Day 12–18:** first crisis + contests start. This is the strongest stretch —
  genuinely reactive, high drama.
- **Day 20+:** the long grind. Only competent survives past day 30 (median 28).
  Progression is knowledge-monoculture (see §4); integration stalls 40–79 for
  everyone but the best runs. This is where runs die of *boredom-adjacent
  difficulty*, not drama: competent p90 death is day 57, still 40+ days from
  any ending vector.
- **The ending is unwalkable:** no run has ever completed. The "seasons end by
  victory/elimination" canon is currently "seasons end by elimination, always."

## 2. SOCIAL FABRIC (subagent B, static + data)

- **Trust is strictly player-centric.** `v.trust[vid]` = trust *of the player*
  (game.js:5075). No villager↔villager trust exists. Talk hard-caps at 40
  ("Talk gets you to 40. Beyond that, you need ACTIONS" — game.js:2548).
- **Villagers never become friends during a run.** `v.groups` (cliques) are
  generated once at world gen (game.js:12484) and only ever lose members
  (death/feud). `pairAffinity` (betrayal.js:91) is arithmetic over static data.
- **Positive sociality has no engine.** Negative sociality is dynamic and
  reactive (betrayal plots, conflicts, moots, exiles, feud splits). Positive
  sociality is decorative: static groups, meal lingering with 'ate with X'
  memories (game.js:21295), visit objectives. The show reacts to *wounds*
  because wounds are the only moving parts.
- **Trust flatlines in data:** even the 200-day survivor ended max trust 53,
  zero strong ties (≥60), mean trust decaying after day 45. Trust min = 0 in
  every run (always someone at zero).
- **feastSurge is not a feast.** `feastBurn()` (food.js:1889) is a combat damage
  multiplier ("the feast was the weapon"). No player-hosted feast action exists
  (app.js:991: "no separate Feast button — Eat fills the bar to its cap").
  Welcome feasts (visitor, 500 real pantry kcal) and victory feasts exist as
  one-off beats.
- **14-day drift evaporates:** `convoDrift` (conversation.js:1149) is a
  recency-only window — ignore someone two weeks and all warmth is gone. The
  only persistent social number is trust-of-you.
- **Verdict: 12 stat blocks wearing pre-tailored clothes.** The village knows
  itself at gen time; the player is the stranger; the graph is frozen at birth.

## 3. THE THREE WALLS (subagent A, code + data)

**Integration 40→80 is a single-path monoculture.** Per-run integrate ledgers:

| source | runs where fired (of 240) |
|---|---|
| discovery (plant ID +2/+3) | 240 — the only universal engine |
| cooking lesson | 73 |
| day-24 trial | 37 |
| audience trial (+15) | 7 |
| quest | 6 |
| book | **0** — phantom source (10% × 1 ruin/map, never hit) |
| fan package | **0** |
| quiet woods | **0** |

All 5 stage-3 runs got 60–111 integration from discovery alone. Quest grinding
(the designed pre-40 engine) fired 6/240. The milestone trial at 60 fired in
~7 runs. Stage 2 arrives day 13–19 in nearly all surviving runs; the 40→80 gap
is the entire late-progression wall.

**sentimentTaught: 5/240, only via the 80-crossing** (slotMoment 80 →
teachSentiment). No alternate path exists in code or data. The thesis mechanic
(channeling grief/love) is taught to 2% of runs.

**feastSurgeUsed: 0/240 — the hard wall.** Chain: (1) sentiment taught,
(2) channel keepsake requires **ALL owned abilities at L3** + trauma<8
(progression.js:218), (3) then feastBurn in combat with ≥300 banked kcal. The
5 best runs had exactly **one** L3 ability (`diplomat`) each — the closest any
run got was 1-of-3 maxed. "All maxed" is unreachable in practice and demands
a dedicated ability-grinding endgame that exists nowhere in the design.
Verdict: content failure, not policy blindness (though sims also never
channel keepsakes deliberately).

## 4. BUILD DIVERSITY + STRATEGY (subagent C, 240 runs)

**Verdict: CONVERGED — effectively one solved build.** Only 10 of 85 ability
IDs were ever granted (1,117 grants). The hunter-knowledge pipeline is the
entire meta: game_sense 42%, field_dressing 21%, peacemaker 15%, patient_aim
8%, stalk 7%, diplomat 5%, then crumbs. Villagers: 19 distinct kit signatures
total, 207/240 runs have ≥2 villagers with byte-identical kits — structural,
not accidental: `NPC_ABILITY_KITS` (game.js:30840) grants in fixed
deterministic order per track. Only 16% of villagers ever earn an ability.
**Synergies: 0 activations in 240 runs** — all 51 need 2+ abilities; only 7
runs ever hold 2+. The deepen/evolve/combine economy never fires once.
Slot-fill: mean 2.6 of 6 unlocked; the 6-slot economy is dormant. Player: only
the competent policy ever engages (60/60 accept the day-7 gift; 53 end with
`diplomat` alone). zero/mvc/leader never accept the free gift — policy
blindness, not a game gate.
Care-track is vestigial: triage/herbal_remedy 0 grants **while sickness kills
148 villagers**. The cure for a top-4 killer exists and is never taken.

**What gets far:** competent 33.0d vs ~15d others; Arc III 46/60 vs 8–22.
Mechanism: the pantry cliff (~94k starting kcal hits ~0 by day 25–30 in every
policy); zero/mvc/leader die of starvation/thirst; competent survives the
crunch and dies in combat (132/104/79 deaths). Correlates: integrate events
+0.65, trustEvents +0.71, contests +0.60, forage +0.59, slots +0.68 with days.
The 200-day survivor (seed 17) completed 2 audience trials (+15 integ each) →
80 → 6 slots → 3 abilities. Only 7/240 runs complete one audience trial.
Measured forage: **127 kcal/action vs BALANCING.md's 500–1,400 target** —
knowledge-gating works (unknown = 0 kcal), but nothing identifies
strategically.

**Dormant-but-strong systems (policy blindness + learnability gap):**
- Traps: snare ≈ 7,800 kcal expected lifetime for ~1 vine + 1 stick + 16 ticks
  (declining returns already via wildlife depletion). Zero crafts, zero sets —
  recipe L0 = "no button," nothing teaches it.
- Fishing: hard-requires fishing_line; known fisher ≈ 634 kcal expected per
  60-kcal action — the best single action in the game. Zero attempts.
- Scavenging ruins (canned goods), gill nets: zero.
Diagnosis: content is strong; discoverability is the bug.

## 5. PACING JUDGMENT

**What feels right:**
- Contest scheduling is the reactive-show model working: day-14 floor,
  ratings-driven, budget-capped. First contest med day 14–16, ~2/week.
- Crisis system fires around day 10–15 with real variety for surviving runs
  (breach 41/60 competent, hunger 30/60, schism 9/60). The beats are loud and
  diegetic.
- Act 0 (days 1–7) gives a social player enough to start bonding; NPC
  micro-quests open at avg trust ≥15, betrayal plots arm day 6+.

**What feels wrong:**
- **Arc II is a timer wearing reactive's clothes** — day 9 in 240/240 runs,
  beat text claiming otherwise. Either make notability real or the text honest.
- **The Show arrives 2 days after the System.** The two biggest beats of the
  first fortnight stack on each other; the System's arrival needs air.
- **First-grave is the default crucible.** Arc III's "what we survived
  together" is, in practice, "someone died in week two." It's traumatic and
  memorable — but it fires before the village has bonded, so it reads as
  attrition, not bonding. Consider requiring 2 crisis kinds for Arc III, or
  making the first Arc-III beat acknowledge the grave.
- **The social graph is frozen.** Trust-of-player is the only persistent
  relationship number; villagers never befriend each other; drift evaporates.
  The show can only react to wounds. A village that never laughs together
  can't be mourned properly.
- **The ending is unwalkable.** feastSurge's all-maxed precondition is the
  single binding constraint on Arc IV; everything else is now reachable.
  240 runs, 0 tables. The reactive show has no final act.
- **Knowledge is the only engine.** Integration, breadth, and survival all
  reduce to plant identification. The intended diversity (quests, books,
  trials, audience) is phantom or near-phantom in practice.

## 6. BUILD PROPOSAL (numbered, prioritized — NOT implemented)

**P0 — unblock the ending:**
1. **feastSurge: all-maxed → ≥3 abilities at L3** (progression.js:218). Data:
   best of 240 runs had 1 L3. "3 maxed" is a real stretch goal; "all" is
   fiction. Proof: unit test forcing chain (channel → feastBurn →
   feastSurgeUsed=true, Arc-IV gate sees it) + 60-seed sweep asserting
   feastSurgeUsed>0 with a channeling policy.
2. **Teach sentiment at integration 60, not 80** (slotMoment: move
   teachSentiment to the t===60 milestone, or add a mid-path). 5/240 teachings
   of the thesis mechanic is the pacing failure; sentiment should be a
   mid-game engine, not a pre-finale footnote. Proof: sweep asserting
   sentimentTaught>25% competent.

**P1 — unlock the food engines sims never touch (knowledge, not yields):**
3. **Trap learnability: witnessing a catch grants recipe L1.** Snare ≈ 7,800
   kcal lifetime for ~1 vine + 1 stick + 16 ticks; wildlife depletion already
   enforces declining returns (game.js:2787). Recipe L0 = "no button" and
   nothing teaches it — zero crafts in 240 runs. Proof: seeded harness —
   witness catch → recipe L1; 40 dawn checks → catches == 10 (uses exhausted),
   kcal within 40% of expectation.
4. **Audience trial: recurring post-40 + a completable 1,000-kcal task.**
   Only 7/240 completions; the 60-milestone trial is one-shot, and the
   3,000-kcal task is unreachable while the pantry drains ~3k/day. Add a
   1,000-kcal/3-day task (chains to the snare from #3); keep the 3,000 as the
   ambitious option; cooldown-gated repeats. Proof: sweep — integrate-by-reason
   shows audience-trial in >20% of runs.
5. **Smooth the slot ladder: 20→2, 35→3, 50→4, 65→5, 80→6** (game.js:17622).
   Measured typical play sits at integ ~35–53 with 1 ability and 3 slots —
   why synergies are 0/240. Pure granularity; no cap lowered. Proof: seeded
   run at integ 53 → 4 slots; trial completion → 5 slots + 2nd gift.

**P2 — make Arc II honest:**
6. **Gate Arc II on a real deed, or fix the beat text.** Require breadth>=6 or
   a first contest/known kill (reactive), or rewrite the beat to drop "not
   because the plot says so." Proof: sweep — Arc II day distribution shows
   real variance (not 9/9/9).

**P3 — give the village a positive social engine:**
7. **Villager–villager bond formation from co-presence** (new `v.bonds[a][b]`,
   +2 per shared lingering meal, +4 per completed VISIT, cruelty decays;
   `pairAffinity` reads bonds). Proof: 30-day seeded sim, ≥2 cross-group bonds
   form; break-it: no bonds with dead/exiled, no same-day inflation.
8. **Player-hosted feast action** (400×roster kcal, min 1500, from pantry,
   1/day): attendees get `feast_shared` memory (wire the dead lifeseed writer
   so drift sees it), trust via the capped deed path, seeded gossip. Proof:
   memories granted + capped trust; empty pantry refuses honestly.
   (Companion: drift sediment — `bondDepth` −3..+3 so sustained warmth leaves
   a permanent point; long relationships survive a quiet fortnight.)

**Runners-up (not in top 8):** fisher backgrounds spawn with a fishing line
(unlocks the ~634-kcal/action for the one class that fishes well); fix-or-cut
books as an integration source (0/240 reads); revive the 40+ quest line / wire
dead `system_task`; fireside moots for non-criminal conflicts.

**Explicitly NOT proposed:** lowering crisis gates (they're the easy part now),
speeding Arc III (day 15–18 is fast enough), buffing food yields or the 94k
starting pantry (competent survives; the walls are progression, not calories).
