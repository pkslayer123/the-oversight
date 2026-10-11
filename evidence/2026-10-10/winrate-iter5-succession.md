# Win-rate iteration round 5 — the succession snap (2026-10-10)

## The design flaw (from round-4 diagnosis)

A link is with a *village*, but succession treated it as with a *person*:
the catch-up sim regularly kills the other village's designated speaker;
each death was trust −15 and snapped any link under trust 20
(`theirLeaderDied`, and Haven-side `successionCrisis` via `onLeaderDeath`).
A fresh link (trust 30) died on the FIRST speaker death (30−15=15 < 20).
Reaching the BELONG bar (trust 50) needed ~7 weeks of perfect tribute with
zero deaths — structurally near-impossible. Observed lifecycle in 120 runs:
form → snap → re-form churn; 58/58 broken links broke via 'succession'.

## The change (tuning call — Steve can overrule)

**"The link is with the village, not the person."** One coherent mechanics
change in `src/js/hierarchy.js`:

1. **Haircut, not wipe:** any speaker death (theirs via `theirLeaderDied`,
   Haven's via `successionCrisis`) now costs **trust −8** (was −15). The old
   extra −10 stack in `successionCrisis` for Haven-primary links ("our
   subordinate tests whether we hold") is gone with the old −15 — one death
   doesn't wipe weeks anymore.
2. **Never snaps by itself:** the new speaker inherits the village's bond.
   The link persists; `_designateSpeaker` already re-seats the chair.
3. **Mourning window:** every speaker death sets `link.mourningUntil =
   day + 7` — **no trust gains land for 7 days** ("grief is not bought
   off"). Enforced at a new choke point: **every** trust gain in the file
   now routes through `_trustGain(link, n)` (25 sites: tribute, deeds,
   pool/tariff ticks, court/charter/council beats, favors, oaths — copy
   updated to report the actually-applied gain, including grief clauses on
   batch beats). Positive gains stamp `link.lastKeptDay` (upkeep).
4. **Neglect + death still kills:** the snap survives for the neglected —
   `link.trust < 20` after the haircut **and** `_linkNeglected(link)` (no
   tribute-paid week and no trust-granting deed for 14+ days; fresh links
   fall back to formation day, so the first two weeks are never neglect).
5. **The chaos still bites (leverage, not wipes):** whoever didn't lose the
   speaker presses tribute — their speaker died and Haven is subordinate:
   tribute ×0.75 (Haven renegotiates); their speaker died and Haven is
   primary: tribute ×1.5 (Haven installs its own); Haven's speaker died and
   Haven is subordinate: tribute ×1.5 (they install their own); Haven's
   speaker died and Haven is primary: tribute ×0.75 (the subordinate smells
   weakness and presses down).

Figure-it-out-yourself calls, documented for overrule: the −8 number (half
the old hit, rounded — a real cost, survivable); 7-day mourning (one week of
the tribute cadence); 14-day neglect (two tribute weeks); dropping the −10
stack rather than shrinking it (the stack was part of the wipe math); the
tribute-leverage symmetry (chaos = leverage for whoever holds it).

Ontology: `+ succession_is_with_the_village`, `+ trust_gains_are_choked`
(`docs/ONTOLOGY.md` regenerated; `validate-ontology.js` green, 62/62).

## Proof test (`scripts/test-succession-snap-20261010.js`)

32 assertions, green ×3 seeds (11, 222, 3333):
- fresh subordinate link: theirLeaderDied → trust 30→22, ACTIVE
  ('shaken'), mourningUntil = day+7, tribute renegotiated down (leverage).
- mourning: proveWorth → 0 during the window, trust unchanged;
  `_trustGain` → 0; after the window proveWorth → +3, lastKeptDay stamped.
- neglected (trust 15, no upkeep 20d): death → 'broken' (haircut applied
  first: 15→7).
- kept low-trust (trust 15, deed today): death → 'shaken', active at 7.
- successionCrisis (Haven-side): −8, mourning, active; tribute ×1.5
  (subordinate) / ×0.75 (primary, no −10 stack); neglected → broken.
- exploit: 30d zero upkeep → trust 0 via the −6/wk shortfall engine,
  `_linkNeglected` true, fails the BELONG gates (trust<50, arrears>0),
  snaps on the next speaker death.

Regressions: `test-scale-ladder-20261010` ALL GREEN;
`test-scale-onramp-20261010` ALL GREEN (the BELONG bar still gates);
`test-hierarchy.js` 40 passed + 2 pre-existing fails (identical on pristine
HEAD — tribute engine, verified via file-swap);
`test-hierarchy-break-20261010` 35/35; `validate-ontology.js` green, 62/62.

## Sweep results — oracleV2, 60 seeds × 120d (DAY-CAP PROTOCOL)

Driver `scripts/sweep-r5-succession-20261010.js` (SEEDS/OUT/DAYS env, 6×10
shards; mulberry32 seeded before eval; `Game.doAction('wait')` per part,
never raw `tickAction(128)`), analyzer
`scripts/analyze-r5-succession-20261010.js`. Raw:
`scripts/sweep-r5-succession-s{1..6}.json`.

**Result: 0/60 wins, 0/60 national+ (nationalLive ever: 0/60).**
Survival: median 38d, max 75d, min 7d; endReasons 60/60 village-lost.
maxTier: 0→15, 1→45, 2→0, 3→0. Wave unlocks: w1 met 56/60 (median deeds
9/5); w2 met 2/60 (median 0/5); w3/w4/w5 met 0/60. Wave-2 unlock days
(n=28): median ~d30, max d45. End rank: 60/60 regional — never national.
Binding blocker: `scale` 60/60. **Vests: 0/60** (no link vested in any run).

**Link lifecycle (60 runs):** formed 264 (4.4/run, 60/60 runs formed ≥1);
theirDied 5, successionCrisis 1086 (0.08 / 18.1 per run — succession beats
are overwhelmingly Haven-side leader/player deaths in the catch-up sim, not
their speakers); shaken 988; broken 103 — **all 103 are
brokenSuccession** (brokenOther: 0). Snaps = 9.4% of succession beats,
down from ~100% of succession-affected links pre-fix (58/58 in round 4).
Up to 6 links active at end of run. The churn is fixed; links persist.

**Death causes (n=679):** combat 28.1%, the night 19.4%, villager combat
16.3%, monster 10.6%, starvation 8.5%, sickness 7.4%, wound 3.2%, thirst
2.2% (rest: contests, ambushes, named monsters ≤1.2% each).

## Exploit check: verdict

The softer snap does NOT let players ignore diplomacy. Zero-upkeep
behavior is still punished on three independent axes:
1. The −6/wk tribute-shortfall engine drains trust (proof test: 30d of
   zero upkeep → trust 0).
2. The BELONG gates still require trust ≥50 + 14d + no arrears — a
   neglected link can never vest, it only survives deaths while kept.
3. Neglect + death still kills: `_linkNeglected` (no tribute-paid week, no
   trust-granting deed for 14+ days) + trust <20 post-haircut → snap; and
   the sweep shows all 103 breaks are exactly these succession-neglect
   snaps (brokenOther: 0). Link-spam with zero upkeep forms links that
   decay and snap — they never vest.
The mourning window also blocks any attempt to "bank" gains through a
succession event: gains during grief are 0 at the choke point.

## What's binding NOW

The succession fix worked exactly as designed — link churn is gone — and
wins didn't move. That isolates the binding constraint cleanly: **scale**.
Every one of the 60 runs binds on `scale` (never reached national/global
rank by end of run). Two sub-walls:
1. **Survival:** median 38d village life vs ~95d needed for a foreign
   realm to reach 4 fires (round-4 finding). The village dies of combat /
   night / monster / starvation long before any coalition can mature. The
   win path is gated on 4 fires AND survival AND vesting — all three are
   downstream of just staying alive ~2.5× longer than the median.
2. **No vests even where survival allows:** 0/60 vest events. The BELONG
   bar (trust ≥50, link ≥14d) still never fires even in the 75d max run.
   With succession fixed, the remaining trust-growth math is the target:
   +3/deed-style gains vs −8 per death and 7-day mourning freezes means
   trust 50 needs long uninterrupted upkeep — achievable in principle now,
   but the oracleV2 policy doesn't prioritize it (0 tribute-defaulted
   events seen, td0 everywhere — tribute upkeep is happening, but trust
   still never reaches 50; the growth rate itself is the question).

**Recommended round-6 lever (Steve-call):** not the bar, not the snap —
the mid-game survival and trust-growth rates. Two candidate directions:
(a) oracle policy is likely under-investing in tribute/deeds upkeep vs
survival actions — a policy-level reprioritization probe could show
whether vesting is reachable at all; (b) if reachable, the question is
whether the *game* should let a competent player survive 95d+ and vest —
i.e. this is now a content/arc question (what does the middle game even
look like?), not a mechanics bug. Per the pacing law: the target is 40+
hours of actual fun content, not 120 days as a number — the current
median 38d life may be *correct* for the arc as designed, and the win
path may need re-thinking around shorter, denser arcs rather than longer
lives.
