# Parity Audit — Worker B (2026-10-10)

Branch: `parity-audit-b` (worktree `~/workspace/worktrees/parity-audit-b`).
Method: 144-run sweep (seeds 1–48 × competent/roads/competent+roads × 200 days) + 48-run per-monster matrix + targeted probes. Node harness, full src list in index.html order, seeded RNG.

## Coverage verdicts (organic, 200-day caps)

**Reachability sweep (144 runs):** all 44 contests fire; 29/30 shows fire; wave-3 unlocks in 91/144; ranks stuck at `village` 144/144 (scale ladder — known bal-scale territory); only `peacemakers_voice` synergy unlocks organically (42/144); craft never fires (policy-blind, engine fine).

**Per-monster (48 runs):** wave-1 all reached; wave-2 **landlord 0 faced / 0 kills** (fixed, see F7); review_drone marginal (1); wave-3 **gavel 0** (within noise, see below); waves 4–5 all 0 (scale-gated, known).

**r5 revivals verified:** comms_call 96/48 runs ✓; petition_open 279/118 ✓; ratings_summons 50/41 ✓; raids→aid crisis confirmed live (1 raid + 1 crisis in a 200-day probe; havenRaidTick needs 3+ world monsters + 3k pantry + 18% — rare but working); trial_complete 80/60 ✓; feast_burn 1697/143 ✓.

## Fixes landed (this run)

**F7 — Landlord spawn weight (game.js, monsters.json).** Cause: tuning out of reach, not broken code. The landlord's full kit (spawn → warn → territorial escalate → combat → claim/addenda/foreclosure) works end-to-end (proven in harness: 80% conversion when the player lingers, 30/30 for travelers crossing its cell). But it was 1/15th of the wave-2 pool sharing a 3–5 world-monster cap: 6.4% pick share, ~1 spawn per 600 run-days, 0 faces in 48 runs (p≈0.0005 under equal conversion — the clear outlier). Fix: new data-driven `spawnWeight` lever (default 1) respected by `creatureWeight()`; landlord set to 3 (17.2% of wave-2 picks). No behavior change. Proof: `scripts/test-reach-landlord-20261010.js` 7/7.

**F8 — "The Moot" TV show never aired (contests.js).** Cause: ID collision (wrong-precondition routing). showPool had `{id:'moot'}` (TV show) AND contests.json had contest `{id:'moot'}`. The dawn branch routes any event whose id is in contestPool() to fireContest — so the picked TV show was always hijacked into the contest. 0/155 show firings (p≈0.005), contest moot fired 10×. Fix: show id → `moot_show` (+ SHOW_BEATS key); contest untouched. Proof: `scripts/test-reach-moot-20261010.js` 5/5.

## Classified, not fixed

- **Gavel (wave-3) 0 faces:** within statistical noise (17 wave-3 encounters across 9 species; P(0)≈0.14). Mechanism identical to other territorial monsters that do convert. Watch in next sweep; no change.
- **review_drone 1 face:** marginal but mechanism works. No change.
- **Waves 4–5 (0 faced):** scale-gated behind regional/national; 0/180 sims ever left 'village' (bal-scale territory, known). Not a reachability bug in the monsters.
- **Wave 3/4/5 signature mechanics still copy-only** (finale doom countdown, eulogy doom, rerun restart, editor cuts, eater growth): reported LOUD per r14 plan — awaiting Steve's mechanism pick. Not silently patched.
- **Abilities 23/85 granted organically:** grant paths work (choose/trial/pact/synergy-gift); the rest are trial/discovery/offer-gated player choices the bots don't pursue. Reachable, not dead.
- **Craft 0 fires:** engine complete, policies never craft. Policy-blind, not dead.

## Earlier fixes in this branch (uncommitted, all proof-green)

F1 conquest-raid UI, F2 river-trader UI, F3 fan-package open button, F4 quiet-woods investigate, F5 beats panel + switchboard office (15/15), F6 wave-unlock beat from all paths (8/8).

## Proof suite

45/45 green: test-reach-{landlord,moot,raid,trader,beats,wavebeat}-20261010.js.
`node --check` clean on game.js, contests.js, comms.js, hierarchy.js, progression.js; monsters.json valid.
