# Round 4: scale on-ramp tune (2026-10-10)

**Question:** round 3 found the scale on-ramp is the binding constraint in
60/60 runs — the BELONG bar (link-age 21d, trust 60) never matures within run
lifetimes (median 41–48d). Does a tuned on-ramp (14d / trust 50) move the win
rate?

**Change (one coherent change, src/js/hierarchy.js only):**
- `polityOf()`: BELONG good-standing check `trust >= 60, arrears 0, link >= 21
  days` → **`trust >= 50, arrears 0, link >= 14 days`**.
- Kept: arrears-0 and the 4-village realm requirement (the "earned" parts);
  the other five roads untouched; Wave Ledger bars untouched (Steve-owned).
- Comments updated in hierarchy.js (ontology header + polityOf note) and
  docs/SCALE.md (BELONG bar lines).

**Design call (figure-it-out-yourself, Steve can overrule):** canon says
"transitions are NOT speedrunnable: relationships take seasons." 14 days is
still two in-game weeks of upkeep + tribute + deeds — a real waiting cost, not
a day-trip. Trust 50 is still +20 above the fresh-link 30 (round-2 oracle's
deed engine reaches it ~7/60 runs), so the bar rewards courting without
becoming a handshake.

**Sweep:** `scripts/sweep-r4-scale-20261010.js` — oracleV2 (the stronger
round-3 policy), same 60 seeds (1–60), **120d cap (DAY-CAP PROTOCOL, Steve
2026-10-10)**, villagerTurn-corrected day loop (`Game.doAction('wait')` per
part), mulberry32 seeded before eval, 6 shards × 10. Results:
`scripts/sweep-r4-scale-results.json`. Key metric: scale distribution — ranks
reached and national road taken (new `nationalShape` field, from
`_havenPolity()`).

## Outcomes (oracleV2 @ 120d cap, n=60)

| metric | round 4 | round-3 oracleV2 (200d) | delta |
|---|---|---|---|
| wins | **0/60** | 0/60 | — |
| galactic table | 0/60 | 0/60 | — |
| median survival | **50d** | 48d | +2 (cap effect) |
| survived 120d | 0/60 | 2/60 @200d | n/a |
| tier 1 | 47/60 | 46/60 | +1 |
| tier 2 / 3 | 0/60 / 0/60 | 0/60 | — |
| wave-2 unlock | 35/60 | 36/60 | −1 |
| wave-3 unlock | 0/60 | 0/60 | — |
| **scale: regional** | **60/60** | 60/60 | — |
| **scale: national+** | **0/60 (all roads)** | 0/60 | — |
| contests ≥3 | 21/60 | 21/60 | — |
| crises ≥3 | 50/60 | 49/60 | +1 |
| sentiment | 57/60 | 57/60 | — |
| integration (med / stage≥3) | 100 / 56/60 | 100 / 56/60 | — |
| feast used (honest) | 0/60 | 0/60 | — |
| w1 deed bar filled | 56/60 | 56/60 | — |
| w2 deed bar filled | 5/60 | 5/60 | — |
| deed gate ok | 0/60 | — | — |

Scale distribution by road: national 0/60 — BELONG 0, LEAD 0, COVENANT 0,
TRADE 0, CONQUEST 0, REFUSE 0. `nationalAnswered` 0/60. `endReason`:
village-lost 60/60.

## The verdict: the on-ramp did NOT move. The constraint moved one layer deeper.

A 60-seed daily vesting probe (`scripts/probe-r4-scale-20261010.js` —
replicates the sweep day loop incl. watchdogs, then tracks per-link
trust/age/arrears and `Game._belongPolity()` every day) shows the tuned bar
IS reachable but vesting still never happens:

| BELONG component | reached | n/60 |
|---|---|---|
| subordinate link trust ≥ 50 (new bar) | 7/60 | reachable |
| subordinate link age ≥ 14d (new bar) | 12/60 | reachable |
| arrears = 0 at the bar | ~all | not the blocker |
| **foreign realm ≥ 4 fires** | **0/60** | **binding** |
| `_belongPolity()` vested (any day) | **0/60** | — |

The binding constraint is no longer the bar — it is the bar's precondition:
**foreign polities never reach 4 fires inside run lifetimes.** A second
12-seed mechanics probe (`scripts/probe-r4-scale2-20261010.js`) quantifies
why:

- Max foreign-polity subs: 0–1 in all 12 runs (usually 0; a pair forms in
  ~1/3 of runs).
- Candidate pools exist (2–6 known, unlinked villages), so it is a cadence
  problem, not a knowledge problem.
- The sim's math: one action/week at 30%/wk, pairs-first, then 65% grow bias
  onto an existing polity. Expected time to subs≥2: pair at ~3.3 wk +
  ~5.1 wk/grow × 2 ≈ **13.5 weeks ≈ 95 days**. Median run life is 50d.
- The design comment in `_foreignPolitySim` claimed "a 4-realm in ~2
  months" — the actual expectation is ~3 months, and that assumes the
  candidate pool is intact.
- The candidate pool is NOT intact: villages Haven links with are excluded
  from the sim ("Haven's business is Haven's"). The policy proposes ~7
  links/run — Haven's own diplomacy starves the foreign sim of the very
  villages it needs to climb. The more Haven courts, the slower the region
  climbs.
- LEAD road: max Haven subordinates 0/12 — oracleV2 always courts as
  subordinate, never as primary, so the LEAD road is policy-unreachable too.
  COVENANT/TRADE peer proposals: median 0/run.

**Death causes** (605 recorded deaths): combat 184 (30%) + villager combat
136 (22%) = **53% combat**, the night 113 (19%), monster 61 (10%), sickness
35 (6%), starvation 31 (5%), wounds 26 (4%). Combat remains the biggest tax —
it starves the on-ramp of time (median 50d vs ~95d needed for the region to
climb).

**Design call for the coordinator (not taken):** round 5's lever should be
the foreign-realm cadence, not the BELONG bar — e.g., pair formation on a
faster clock, grows seeded off the pair, or the sim not excluding Haven's
linked villages from candidacy. But this is canon-adjacent (Steve: "take
seasons"; SCALE.md documents ~day-80 reachability) — it needs a design
decision, not a worker's tuning knob. Second candidate: combat death share
(~53%) — the survival tax upstream of everything.

## Exploit check

- 0/60 wins, 0/60 national — nothing won via a cheap path, trivially.
- The lowered bar did NOT create a degenerate path: fresh subordinate links
  still start at trust 30 (proven in the proof test), +20 must be earned
  through deeds (proveWorth / tribute / honored calls); arrears still block
  (proven: 1200 arrears → no vest); the realm-4 requirement still held in
  60/60 (it is what blocked every run — the "earned" part did its job).
- No link-spam freebies: even at trust 54, age 15, arrears 0 (seed 1's best
  link), nothing vested — the realm, not the relationship, was the gate.
- Proof test `scripts/test-scale-onramp-20261010.js`: BELONG vests at
  exactly 14d/trust 50; NOT at 13d, NOT at trust 49, NOT with arrears,
  NOT with a 3-fire realm; `_belongPolity`/`_havenPolity` track. Green ×3
  seeds (11, 222, 3333), 11/11 each.
- Hierarchy regressions: test-scale-ladder-20261010.js ALL GREEN (incl. the
  BELONG section, which uses 25-day links — above both bars). test-hierarchy.js
  40/40 with 2 pre-existing fails (unpaid-tribute arrears/trust — identical
  on pristine HEAD, tribute engine, not the bar). test-hierarchy-20261007.js
  harness-errors at line 95 on pristine HEAD too (leader generation, not the
  bar).

## Method notes / caveats

- 120d cap is the new standing protocol; medians vs round-3's 200d cap are
  roughly comparable because only 2/60 round-3 runs survived past 120d.
- The probe runs show slight day-level divergence from the sweep shards for
  identical seeds (e.g. seed 1: probe d49 vs sweep d79) — both are
  deterministic per-seed; the probe omits the sweep's utilization
  instrumentation wrappers. The vesting conclusion (0/60) is robust to this:
  the sweep's own `nationalShape` field independently records 0/60 national
  at end-of-run, and no run ever answered national.
- Feast metric stays honest: `feastSurgeUsed` 0/60 (armed 56/60) — the war
  chest still never banks 300.
