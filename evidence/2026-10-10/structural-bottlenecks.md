# Structural bottleneck fixes (2026-10-10 → 2026-10-11)

Steve's directive: "Okay, so let's address structurally." Plus pacing law
(2026-10-10, MEMORY.md): the target is **40+ hours of genuinely engaging
content**, not a day count. Day counts in sims = measurement tool.

Diagnosis source: evidence/2026-10-10/winrate-iteration.md (rounds 3–4),
winrate-iter3-oracle-v2.md, winrate-iter4-scale.md.
Four worker branches, all merged locally via --ff-only, pending ship.
Main tree verified clean after landing.

## 1. Scale cadence — foreign-realm growth is engagement-driven (commit 8b5c9613 + cdfe9261)

**Was:** weekly RNG tick, 30%/wk, pairs-first, 65% grow bias → 4-realm in
~95 days vs median run life ~50d. The old 65% uniform grow-bias scattered
competing pairs until the candidate pool saturated and no realm could ever
form (found during proof: 2/6 seeds stalled forever). Haven-linked villages
were excluded from candidacy — courting starved the sim.

**Now:** `Game.stirRegion(kind, note)` records regional engagement beats
(charge capped at 12), hooked into real player-touched deeds: caravan
tariffs, tribute current, honored demands, answered defense/trade calls,
answered covenant crises, new bindings, televised contests (gossip spread
to foreign villages). Background drift (~12%/wk) can only *seed pacts* —
it can never grow past one pair, so "waiting does nothing" is mechanical,
not probabilistic. Stir-fired weeks (~3 banked beats) consolidate: always
grow the largest polity. Haven-linked exclusion removed.

**Measured:** engaged run (2 beats/wk) grows pair → 3-fire → 4-realm in
~21–42 days; drift-only never passes a pair in 120 days. Still earned:
momentum is deed-gated, never a calendar path. Engagement-gated is the
opposite of speedrunnable (canon: "take seasons, NOT speedrunnable").

**Design calls (Steve can overrule):** drift capped at seeding pacts, not
merely slowed; consolidation replaced the 65% grow-bias (variance was the
bug, not cadence).

## 2. Link fragility — succession grace unified with landed law (commit cdfe9261)

**Was:** successionCrisis = trust −15, snap if trust < 20. Fresh links start
at 30 → one succession snapped them. 58/58 broken links broke this way.
Mid-build, the win-rate loop landed its own succession fix on master
(round-5: −8 haircut, 7-day mourning window, snap only for the neglected)
— a real design collision, resolved by unification rather than overwrite:

- **Young links (<21d):** −8, no snap, staged `pendingRenegotiation` beat
  answered via `Game.answerRenegotiation`: **gift** (1,500 kcal, trust +8,
  tribute stays), **visit** (speaker rides out 2 real days, trust +5),
  **wait** (trust −6, deferred tribute ×1.5 lands — grief becomes leverage).
  Unanswered beats expire aloud in 7 days. The tribute leverage play is
  deferred into the beat, not waived.
- **Old links (≥21d):** master's landed law exactly — −8, mourning window,
  snap only when trust < 20 AND neglected (no upkeep 14+ days).
  Death + neglect kills; death alone doesn't.

Also fixed a genuine `ReferenceError` the merge surfaced:
`answerCovenantCrisis` concede path referenced undefined `_cgw` (broken on
master) — now `_trustGain(link, 8)`.

**Proof:** scripts/test-structural-scale-a-foreign-20261010.js and
test-structural-scale-a-succession-20261010.js, ALL GREEN ×3 seeds
(foreign also ×8). Neighbors: scale-ladder, scale-onramp,
hierarchy-break (35/35) green.

## 3. Combat death tax — hopeless stands eliminated (commit d3826b30, [needs-eyes])

**Decomposition (instrumented, 3 seeds × 120d, 42 deaths classified):**
player combat deaths are relentless/no-retreat (7/8) + 1 fair loss, killers
all wave 1 (hushwolf ×4); night deaths 12 (all player); wound-upstream 0.

**Now:** villagers retreat from hopeless fights (`tbVillagerHopeless` +
taken ledger — 91 field fights → 37 vFlee, all 17 ever-hopeless
trajectories flee, villager hopeless deaths = 0). Sealed-flight bug fixed
(the gate only checked arenaContest, ignored fight-level noFlee). New
`field_medicine` in fieldFight: once per fight, when hurt (<60% max), the
villager binds the wound instead of striking (+20 HP, narrated into rec.log)
— the honest off-screen mirror of the player's Heal. Legible night-danger
telegraphs (dusk-in-the-wild narration — player-facing copy, flagged
[needs-eyes] for Steve's phone read).

**What's left** is structural: relentless monsters and fair losses, not
hopeless stands. Armor model untouched; combat stays feared.

**Proof:** retreat 12/12, wounds 11/11, telegraph 8/8. Neighbors:
test-break-monsters3-fieldfights 24/24 green; 4 other scripts fail
byte-identical on HEAD (pre-existing stale APIs, not this work).

## 4. Monster counters — the dormant mechanic is live (commit 5ef0a5c1)

**Was:** 0/399 counter-kills — no monster def carried a `counter` field and
nothing ever set `state.monsterCounters`. waveLedger's
`monsterCounterKnown()` was dormant.

**Now:** all 30 wave 1–2 defs carry `counter: {kind, trick, hint, reveal}` —
Undertale-style lateral tricks (wound the hushwolf lead, shout down the
belltoad chorus, buy off the lockpick with food, walk toward the mimic's
cry…). Waves 3–5 deliberately untouched (pending signature-mechanics work
owns that space). Engine: `Game.discoverMonsterCounter(mid, via)` +
`Game.checkMonsterCounter(mid, ev)` with 14 data-driven trigger kinds,
hooked into existing verbs only (tbPlayerStrike/Wait/Move/Shout/OfferFood/
tbAfterPlayerAction). Three reachable discovery channels: perform the trick
mid-fight, Haven teaching (2+ village slain unlocks the askAbout
`beasttricks` topic), Monster Codex slain-stage hint (full reveal stays
knowledge-gated). The 2-pt counter-kill ledger bonus fires; non-counter
kills still 1 pt; per-type cap 2 respected.

**Proof:** scripts/test-structural-counters-20261011.js, 51 checks × 3
seeds, all green. Neighbors: wave-ledger 31/31, break-monsters-r2-counters
17/17, bal-waves 30/30, monsters schema-clean (56 defs).

## 5. Trap recipes — reachable through real channels (commit d4a77fda)

**Was:** trap supplies + hunting knowledge co-occurred in 1/60 runs. Root
causes found (verified, not guessed):
1. Dropped wire — `hunting_guide` occupation carries `knowsSnare: true`
   but `genCharacter` never copied it to the profile; the whole villager
   TRAPS objective + teaching beats were dormant.
2. Village codices never carried trap recipes (`strategyRecipes` was
   cooking-only) — 81 round-5 studies, 0 trap teaches, structurally.
3. Books were a lottery: 4 trap manuals among 34 on one uniform ruin shelf;
   the System's trap manual had no spawn.
4. Practice-ladder gap: successful blind trap crafts never taught L2
   (hunter-taught players stuck at 35% blind forever).

**Now:** knowsSnare inherited; a new beat on the hunter's witnessed TRAPS
return teaches snare L1 (once per hunter, trust ≥ 15, never silent);
studied villages teach (fisher → minnow_trap/fish_weir, forager → snare,
scavenger → deadfall, via studyVillageCodex L3); wild ruins draw from a
field shelf (the 4 trap/fishing manuals) 50% of the time; the day-24 stalk
trial issues the *System Field Manual: Small Game (Rev. 5)* as a real
readable pack book → spring_snare L3. Blind trap crafts now teach L2 per
the code's own stated intent.

**Proof:** scripts/test-structural-traps-proof.js — 27/27 on 2 seeds;
before/after (stashed src, same script): **9/27 → 27/27**. End-to-end
trapline through the real engine (teach → materials → blind craft → L2 →
set → 5–9 catches in 25 days). Neighbors: ontology 63/63, recipe-blind,
proof-hunter-traps 31/31, proof-hunter-trapline 27/27 green.

## What round 5+ should measure

- Foreign 4-realm formation inside *engaged* runs (BELONG road vesting) —
  the precondition now moves on engagement.
- Trap-recipe acquisition rate by channel + trapline kcal contribution —
  oracle-v2's craft/trap roads will now actually fire.
- Counter-kill rate through real combat actions (the policy performs the
  strike/move/wait/shout verbs the triggers listen on).
- Combat death share re-decomposed: the hopeless-stand bucket should be
  empty; remaining share = relentless + fair-loss + night.
- Young-link survival through succession events (grace path vs old snap).
