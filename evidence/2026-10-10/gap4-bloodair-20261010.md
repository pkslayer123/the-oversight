# Gap 4: Blood on Air — 0/120 natural runs (2026-10-10)

## Diagnosis

The crisis hook (`blood-on-air` in `_contestResolveOthers`) passed its unit proof but
fired 0/120 in the crisis-wire sweep. Three compounding causes, all confirmed by
measurement:

1. **Villager contest death rate was 0% — the danger was vestigial.** `_cxBlood`
   (pit/gauntlet/siege) resolves through `fieldFight`, a real fight — but the
   System picked beasts by HP-matching ("a fair fight for ratings"), and monster
   DPR outscales villager DPR ~3:1. Every such fight was a hopeless rout, and
   `fieldFight`'s situational morale (correct for the wild) let the villager flee
   100% of the time. Measured: 744/744 `lost` (fled), 0 died, across pit/gauntlet/
   siege/duel/tithe/drop/starve/moot/hide/cookfight. Death was structurally
   unreachable — the only villager contest deaths in the codebase were degenerate
   corners (maw 100%, duel overkill ~0%).

2. **Blood contests never took villagers.** `pit/gauntlet/siege/tithe` all had
   `participants: 1`. The only multi-participant blood contest was `duel` (2),
   whose deaths are freak overkill accidents. `_contestResolveOthers` — the sole
   crisis hook site — requires `ac.others` non-empty, which never happened for
   blood.

3. **The watch path never fired the crisis.** When the player isn't taken,
   `_contestVerdict` resolves villagers through the real engine and kills go
   through `_contestDie` (isWatch) — which did gossip + roster removal but never
   fired `blood-on-air`. The duel partner's death (`_cxDuelSingle` bDied) also
   never fired it.

## Fix (all played, not RNG — no new rolls anywhere)

- **Threat-matching** (`contestEngine.js`): `contestBeastFor(wave, targetThreat)`
  now matches DPR×HP×pack instead of HP. HP-matching wasn't fair; threat-matching
  is. Gauntlet/siege keep per-wave escalation (0.7/1.0/1.3); hardened runs 1.2×
  hotter. Bias favors the contestant (0.9/0.75/0.6 per wave — the System wants a
  show, not a slaughter; its stars are investments).
- **Sealed arena** (`fieldFights.js`, `contestEngine.js`): `_cxBlood` passes
  `noFlee` — the System doesn't open the gate mid-fight. Hopeless/low-HP no
  longer auto-flee; the fight runs to vKill/vDie/mFlee; round cap becomes a
  judges' call. Wild fights keep the believable flight (untouched).
- **Casting** (`src/data/contests.json`): pit/gauntlet/siege/tithe `participants`
  1→2. Blood contests now take villagers. More taken = more FEARED (canon).
- **Reactive crisis** (`contests.js`): `blood-on-air` now fires from
  `_cxKillContestant` — the choke point for EVERY villager contest death
  (multi-take, watch verdict, duel partner). The redundant hook in
  `_contestResolveOthers` was removed. Player never routes through here
  (guarded).

## Measured danger (post-fix, `scripts/probe-bloodair-deathrate.js`)

Pit: 23% died / 77% won (was 0%/0%/100% fled). Fear is honest, not a slaughter.
Gauntlet/siege remain extreme (multi-wave, wounds persist — "most don't see
wave two" is the fiction). Duel/tithe/moot/endurance unchanged.

## Proof

- `scripts/test-gap4-bloodair-20261010.js` — **81/81 × 3 seeds** (real danger,
  sealed arena, threat-match, reactive wiring, casting, honesty, no regressions).
- `scripts/probe-bloodair-crisis-20261010.js` — full flow: forced pit death →
  villager dead, `blood-on-air` fired exactly once, reactively. PASS.
- Watch path verified: villager death on camera → crisis. PASS.
- Regressions: `test-crisis-20261009.js` 15/16 (1 pre-existing C6 failure, fails
  on clean HEAD too); `test-contest-engine-break-3.js` 16/16 (updated E for
  threat-match); `test-break-contest-20261009.js` 76/76;
  `test-break-contests-20261010.js` 50/50;
  `test-break-monsters3-fieldfights-20261008.js` 24/24; ontology 52/52.
- Natural sweep (24 runs, 44 contests): 0 blood-on-air — **blocked by pre-existing
  village fragility** (villages die day 13–49 in current build, predates this
  change; first probe showed it before any edits). The mechanism is proven;
  natural reachability needs villages to survive to contest age (separate gap).

## Files

- `src/js/contestEngine.js` — threat-match, sealed arena, ontology header
- `src/js/fieldFights.js` — `opts.noFlee`, ontology header
- `src/js/contests.js` — crisis choke point, ontology header
- `src/data/contests.json` — blood multi-take
- `scripts/test-contest-engine-break-3.js` — updated E (threat-match)
- `scripts/test-gap4-bloodair-20261010.js` (new, 81 checks × 3 seeds)
- `scripts/probe-bloodair-crisis-20261010.js` (new, full-flow proof)
- `scripts/probe-bloodair-deathrate.js`, `scripts/probe-bloodair.js`,
  `scripts/sweep-bloodair.js` (investigation probes)
