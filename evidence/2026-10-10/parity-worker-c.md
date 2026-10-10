# Worker C — Weirdness Hunt (parity audit, 2026-10-10)

## Method
- Worktree: ~/workspace/worktrees/parity-audit-c (branch parity-audit-c)
- Canon read first: docs/CANON.md, PROGRESSION.md, DISEASES.md, MONSTER-WAVES.md.
- Policies (scripts/policies/weird-c.js): progress (competent + 5 completion
  roads), mvc (idle.js), survivalist (competent + always-flee + rest-heavy),
  socialite (competent + talk-first: multi-villager convos, naming debates,
  lessons, keepsakes, generous giving, feasts).
- Sims: 200-day caps, 4 seeds per policy (distinct sets 11–14, 21–24, 31–34,
  41–44), 4 parallel processes, sequential seeds inside each process.
- Histories: /tmp/weird-c (pre-fix), /tmp/weird-c2 (post-fix) as
  weird-c-<policy>-seed<N>.json — full telemetry, daily samples, villager
  snapshots, gossip store, rep/trust ledgers, tribute log, System lines,
  final digest.
- Scanner: scripts/scan-weird-c.js — 15 invariant checks.
- Proof: scripts/test-weird-dead-trust-20261010.js (10 checks x 3 seeds).

## Runs (pre-fix)
All 16 runs ended village-lost at day 13–42 (median ~30). A control run of
the ORIGINAL competent policy (seed 11) also died at day 36 — so this is the
game's current organic survival profile, not a policy artifact. (Consistent
with the known ~35-day median; Steve's "0 of 180 sims left village" wall.)
Long-horizon (100d+) weirdness surface is therefore thin in organic play;
all findings below come from days 1–42.

## Weirdness found + fixes

### W1. Dead mentor teaches you (logic bug — FIXED)
`bestMentor()` (progression.js) picked from the unpruned trust map. In
progress/seed11 the slotMoment(40) beat named gen_48ph6lf — dead since day 6
— "watches you work, then reaches over. 'No. Like this.'" and bumped their
trust +4 post-mortem (telemetry: day 13, reason '?').
Fix: candidate pool = live roster only; bump now carries a reason
('mentored you through the slot moment').

### W2. Dead conflicts keep simmering (logic bug — FIXED)
`socialSimmer`/`conflictIncident` (game.js) never pruned conflicts when a
party died: "You carry a message from [corpse] to X" + trust bumps for the
dead (progress/seed14: david_kim +2 / gen_a8rwujs −3 at days 28 AND 31,
weeks after death).
Fix: simmer resolves conflicts with a gone party (journal trace, no scene);
`conflictIncident` early-returns for gone parties (defense in depth);
`mediateConflict` refuses when the other side is gone.

### W3. Dead "close" mourner at the mantle (logic bug, latent — FIXED)
`playerDeath` successor beat (ledger.js) picked `closeId` from the unpruned
trust map — a corpse could deliver the "You're not her" line. Not observed
in the 16 runs (needs trust>55 + player death), fixed same-class: live
roster only.

### W4. Dead absorb witness_maw dread (logic bug, latent — FIXED)
game.js dropped −2 trust on every trust-map key, including the dead, while
narrating "everyone" edges away. Fix: iterate the live roster.

### W5. Ambush victims not marked dead (data bug — FIXED)
`removeVillager(vid, 'ambushed')` skipped the DEAD IS DEAD record mark
(only 'killed' was handled) — `vpOf(vid).dead` lied for ambush victims;
party skips / System fragments / record filters read that flag. Fix: mark
for 'ambushed' too.

### W6. Trust telemetry had no causes (data/observability bug — FIXED)
justice.js wrapped `G.bumpTrust(vid, n)` and dropped `reason` — ALL 3985
trust events across the 16 runs carried reason '?'. No reputation delta had
a cause. Fix: pass reason through the wrapper, plus reasons on the
top-firing call sites: the 9 task-completion bumps in resolveOneAssignment
(forage/hunt/wood/stone/water/garden/fish/haven-role/scout), the away-forage
return bump, the field-fight mFlee bump ('stood down a monster and walked
home'), the callOutTeaching wrapper, and the slotMoment mentor bump.
Post-fix: 380/500 trust events in a socialite run carry real reasons (was
0/500). The remaining '?' events are the long tail of ~70 quieter call
sites — honest edge, values track behavior.

### Scanner false positives (not game bugs)
- system-persona: 2 flags were diegetic lock-picking prose ("click" of a
  tumbler, "press your ear to the metal") — regex refined to match
  mechanical phrasing only ("press X to Y", "click to", "+N xp", etc.).
- trust-provenance '?': explained by W6 (now fixed).

### Honest edges (investigated, not bugs)
- Zero-hearer gossip entries (raid/death/freeload/deal): inert traces — the
  real effects are applied directly at the call site + narrated. Not nonsense.
- "the night" / "combat" death causes: the game's honest cause strings for
  endDay player death (mantle passes) and fight deaths.
- Dormant other-villages: canon by design (catch-up sim on approach).
- Pantry: never negative, no teleport jumps, across 16 runs.

## Invariants that held (pre-fix scan, 16/16 unless noted)
timeline, death-cause, disease-pools (DISEASES.md roster exact), gossip-prov,
monster-wave (no wave mismatches, no pre-gate spawns), pantry-sanity,
phantom-village, rep-bounds, rep-trust-law (Trust ≠ reputation — 0 gossip-
moved trust events), contest-gate (no show before day 14), unique-names,
system-persona (15/16 — 2 false positives, see above), tribute-prov,
dead-never-act (9/16 — the 7 failures are W1/W2, now fixed).

## Verification
- scripts/test-weird-dead-trust-20261010.js: 10/10 x 3 seeds AFTER;
  4/10 (6 failing) BEFORE — demonstrates each fix.
- Regressions: test-break-social-r12-20261010.js ALL GREEN;
  test-break-social-r11-20261010.js 18/18; validate-ontology.js 57/57.
- test-progression.js / test-justice.js failures are PRE-EXISTING at HEAD
  (verified by reverting my files and re-running — same failures).
- Post-fix sim re-run (/tmp/weird-c2) + re-scan: dead-never-act 16/16
  (was 9/16); system-persona 15/16 (2 remaining flags are the diegetic
  "How to Human" show title — "the aliens attempt a human tutorial episode"
  is the in-fiction joke, not mechanical language); trust reasons now flow
  (380/500 with real reasons in the verification run, was 0/500).
- Rebased onto maintree/master (b4daaced); re-ran on the new base:
  test-weird-dead-trust 10/10 x3 seeds, social-r12 ALL GREEN, social-r11
  18/18, ontology 57/57. Branch parity-audit-c @ 1670d940 — ready for
  coordinator --ff-only merge. No push, no bump (ship loop owns that).
