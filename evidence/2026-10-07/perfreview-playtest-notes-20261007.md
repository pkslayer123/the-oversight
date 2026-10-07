# Performance Review — played pass (2026-10-07)

Worker, flesh-out loop. Played AS A PLAYER through a node harness
(`scripts/play-feel-20261007-perfreview.js`, 54 assertions, green on seeds
20261007 and 777). Engine loaded from HEAD via `git show` (hot-tree safe —
the worktree holds in-flight sibling changes; nothing here touches them).
Seeded mulberry32, deterministic. All HP/position shortcuts disclosed in-run.

## Verdict: PASS — a genuine step up, not a reskin

Wave 1 (Highbeam Deer) asks: **read the freeze, leave the lane** — positional,
and the dwell punishes. The Performance Review asks: **respect the count** (a
spoken 3-beat windup — fairer than the deer's freeze, and the line is locked
at declare), **manage your habits** (it learns your dodge — same sidestep
twice and the led line takes you; vary it), **work the rhythm** (the recalc
breath after every beam is your strike window), and **bring friends** (the
crowd buys exactly one breather turn, then it adapts — monsters were sent to
fight). The grading-aloud theater lands: dread first, coaching earned.

Honest caveat for Steve: this is the *gentlest* wave-2 monster played so far.
The escalation is cognitive and theatrical, not numerical — a competent player
takes zero damage (my kill: 5 spear strikes, 16 rounds, 500→500 HP) while the
deer can kill you through good play. The step up is in *demands*, and the
predictive aim is something wave 1 never does. Whether wave 2 wants this one
meaner is a stats call (off-limits this run).

## What I played

**Blind first contact (ACT 1).** `"SUBJECT DETECTED. COMMENCING BASELINE
EVALUATION." A drone hovers, projecting a grid over the ground. It is taking
notes. On you.` No counterplay coaching — correct for unknown. The loop:
declare (`"SUBJECT LOCKED. COMMENCING CORRECTIVE ACTION IN THREE..." The
projector draws a burning line across the dirt.`) → spoken beats (`📊 "TWO."
DODGE EFFICIENCY: 49%. The projected line brightens.` / `"ONE."`) → fire →
grading (`💥 The light hits! You're not where it landed. Clean dodge. 📊
DODGE EFFICIENCY: 49% — CLEAN DODGE. LOGGED. BELOW TARGET. CORRECTIVE ACTION
SCHEDULED.`) → recalc breath (`The drone hovers, re-running the numbers.
"RECALIBRATING METRICS."`) → resume (`"RECALIBRATION COMPLETE. RESUMING
EVALUATION."`). ~6–7 rounds per cycle. Efficiency opens at 41% (BELOW
TARGET), +8 per clean dodge, −12 per hit, graded aloud every beat and every
resolve. A blind player who simply *moves when it counts* takes zero beam
damage — the line is locked at declare, so the fair out is always available.
Phase badges are distinct per phase: 📊 EVALUATING / ⏳ CORRECTING IN… /
🎯 CORRECTING / 🌀 RECALIBRATING.

**Predictive aim (ACT 2).** After any clean dodge, the next declare announces
`📊 "DODGE PATTERN RECOGNIZED. ADJUSTING AIM." The projected line slides
sideways — toward where you went last time.` Repeating the same sidestep walks
into the led line: 2 hits at 23 and 26 (in the 18–28 band, no cheap one-shot).
Varying the dodge beats it clean. The announcement fires *before* the led shot
— the trap is telegraphed, not a gotcha.

**The punishment path (ACT 2b).** Fresh fight, stood still: the beam hits,
`HIT TAKEN. LOGGED.`, efficiency 41 → 17 across two hits. The grading
punishes honestly when you're threatened.

**Crowd (ACT 3).** Two villagers in the fight: `📊 "TOO MANY SUBJECTS.
EVALUATION PAUSED. RECALIBRATING." It wobbles, overwhelmed.` — exactly once —
then `📊 "SAMPLE SIZE INSUFFICIENT. REDUCING SCOPE. EVALUATING PRIMARY
SUBJECT."` and the fight resumes (3 more beam cycles, no stall). "Bring
friends" is real counterplay with a real limit. Pain switch verified live: a
villager's strike moved them front of queue and fired `It wobbles — then the
lens LOCKS onto A person, maybe 30s. "PAIN RESPONSE LOGGED. PRIORITY
ESCALATED." Pain gets graded first.` — and the instrumentation proved it fires
iff the striker wasn't already front (silent in 1v1, correctly).

**Codex-known rematch (ACT 4, stage slain).** First contact now coaches: `(It
counts down THREE-TWO-ONE then fires along the projected line. Move OFF the
line. It can't handle crowds — bring friends.)` The cue names the line
exactly (`That projected line is exactly where the beam fires — it cannot
re-aim once announced. Step off it.`) and the 6-tile lane renders on the grid
during windup (verified cell-for-cell against the telegraph). Knowledge
ladder, all working: blind = no lane + "Probably decorative. Probably." →
survive one beam = lane renders + exact-line cue + "You know this one:
Scored Assessment…" tail (📖 Codex: "You won't forget this.") → slain =
first-contact coaching.

**The kill (ACT 5).** Dodge-the-count / strike-the-recalc rhythm: won in 16
rounds, 5 strikes for 107 damage vs 97 HP (spear ~19–24 per hit vs armor 6),
player untouched. Death narrated (`It is a drone. Do not eat the drone.`),
loot-as-action on the body.

**Loot (200 seeded rolls ×2 seeds).** 32/200 and 28/200 drops (~0.15, not
raining), always tier 2 — exactly per monsters.json. Wave-2 loot rule check:
Steve's rule says only veteran wave-1 variants (post-unlock) + the apex may
drop wave-2 loot (tier 3+); base wave-1 stays tier 1–2. A regular wave-2
monster at tier 2 is *consistent* with that rule — the task's "should drop
tier 3+" expectation conflicts with the rule as stated. Flagged for Steve;
nothing changed (stats off-limits).

**Audio.** droneHum (first contact / reposition), droneCount:3/:2/:1 (every
beat), droneCorrect (resolve), droneRecalc (breather), droneBeam (fire) — all
fire.

## Wiring backlog (engine/data off-limits this run — for the engine owner)

1. **Dead knownCue (same class as Worker A's catfish find).** The data
   knownCue `"It scores your dodges. Unpredictable movement breaks its
   lock."` never surfaces: `tbBatch4Cue` (game.js ~17500) builds its own
   `learned` string that duplicates `knownTail`'s first sentence but omits the
   `enc.knownCue` append — and it intercepts review_drone before knownTail
   ever runs. Suggested: mirror knownTail's kc append in tbBatch4Cue's
   `learned`.
2. **Led-line hits go unscored.** The grading + `droneScore` + dodge-model wipe
   all sit inside `if (tg.threatenedPlayer)` (declare-time). Predictive-aim
   hits — where you walk into the led line, not threatened at declare — land
   but produce no "HIT TAKEN. LOGGED.", no efficiency change, and the stale
   `drDodge` persists (the code comment "getting hit wipes the model"
   over-claims). The grading fiction goes silent exactly where the wave-2
   mechanic bites. Suggested: recompute threatenedPlayer at resolve, or grade
   on actual hit.
3. **Loot-tier question for Steve** (above): data tier 2 vs the task's "should
   drop tier 3+" — the stated wave-2 loot rule actually supports tier 2.

## Harness notes (for future workers)

- `scripts/play-feel-20261007-perfreview.js` — 54 assertions, exit non-zero on
  failure, green on seeds 20261007 and 777. `SEED=777 node scripts/...`
- The instinct policy snapshots declare-time knowledge state (first vs second
  declare) — the codex learns mid-fight, so a single capture gets overwritten.
- `newFight` pushes the fight-init text into the transcript — `drain()` after
  `startCombat` was silently eating the first-contact dread/coaching and
  failing those assertions.
- Track player HP inside the policy (`st.hpLast`) — `P()` is null after
  `tbEnd`, so post-fight HP reads 0 and fakes an attrition failure.
- `encNoticesPain` wrapper pattern (ACT 3) asserts the pain line fires iff the
  striker wasn't already front — deterministic across queue churn.
- Full index.html script order at HEAD was used (incl. convo-wants.js, which
  the moderator harness predates); drama.js / move-anim.js / sprites.js /
  tile-scenes.js / app.js excluded as DOM-only.
