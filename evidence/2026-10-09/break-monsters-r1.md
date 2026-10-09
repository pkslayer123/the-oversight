# Break-it: MONSTERS r1 (2026-10-09)

Hostile-player adversarial run on the monster system. Canon read first:
docs/CANON.md + docs/MONSTER-WAVES.md. No canon invented.

## Verdict: BROKE (infrastructure drift) + HELD (combat core)

The combat engine itself resisted every attack. What broke was the
**scaffolding around it**: the wave-2 roster grew (mosquito + tick,
2026-10-09) and was hardened (damage x1.4, cedacea1) without the docs,
tests, or behavior registry following. Four test suites and one canon doc
were red/stale. All repaired; the deeper level is documented below.

## Proof suite (new)

`scripts/test-break-monster-20261009-r1.js` — 50 checks, green x3 seeds
(1337, 4242, 777). Seeded mulberry32, SEED env override.

### EXPLOIT (all held)
- **E1 one kill = one corpse**: bulldozer kill leaves exactly 1 new monster
  corpse (corpseForKill's _deathCorpse/node+species path doesn't double-register).
- **E2 no double-loot**: corpseTakeItem zeroes the stack; second take returns
  null. Loot-as-action holds.
- **E3 kill counting**: one real kill = exactly one waveKills[1] (no
  double-count via alreadyDead/vKill paths).
- **E4 respawn farm**: 40 maintainWorldMonsters ticks stay under
  worldMonsterCap (3/5/8). No spawn spam.
- **No player monster-kill XP exists** — rewards are meat + loot on the
  corpse. "XP theft / friendly-fire XP" is N/A by design; villager kills
  grant loot to the villager, corpse persists for the player (fixed by an
  earlier break-it run).

### SOFTLOCK (all held)
- **S1 speedbump bunker**: bunker expires on its own (2 turns), chip damage
  lands through the shell (min 1 via Math.max(1, round(final*0.15))), fight
  resolves. No permanent turtle state.
- **S2 union_rep**: rep death scatters summoned picketers; fight can end.
- **S3 windup**: mirror_stag telegraph never stuck 20+ consecutive monster
  turns; windups always resolve or re-declare.
- **S4 nevermore dive**: dive machine cycles phases (stalk/dive/land) and the
  fight resolves; nothing stuck airborne.
- **Mutually-immune**: impossible by construction — player strikes always do
  >= 1 (Math.max(1, d) in tbPlayerStrike), bunker chips >= 1, monster armor
  is flat reduction not immunity.

### HONESTY
- **H1 cedacea1 x1.4 verified real**: every wave-2 damage value in
  monsters.json matches pre-commit x1.4 within rounding (30 values, 0 drifts).
- **H2 no double-multiply**: no runtime code re-multiplies wave damage —
  the hardening was a one-time data change. (Grep over game.js,
  encounters.js, engine/combat.js: zero hits.)
- **H3 wave-2 announcement fires**: day 8 + 4th wave-1 kill -> combat win ->
  sysSay "New casting directives incoming — Wave 2 talent has been released
  into your sector." The wave-3 empty-roster honest fallback ("protocols
  active... the woods feel expectant") is in place for when wave 3 unlocks
  with no monsters.
- **H4 hushwolf silence**: combat start narrates "The woods go silent — not
  quiet. Silent."; quiet-woods event does the same pre-fight. No rush
  indicator UI remnants in app.js (Steve killed it; stays dead).
- **Telegraphs honest by construction**: declares build cells from
  S.combat.patternCells and resolution uses the same cells (warnCells shows
  exactly where the attack lands). Spot-checked mirror_stag charge 6x1.
- **Wave escalation honest**: wave-2 mean HP 88.7 vs 54.1, mean dmg 25.4 vs
  16.0. Genuinely tougher across the board.

### DEAD CODE (all live)
Every wave-2 special mechanic FIRES at runtime (not just data):
- heckler: hkShame stacks accumulate over rounds
- paparazzo: pzPrediction climbs, candid->tracking->exclusive phases
- statickite: rise->mark->transmit scan-zone cycle
- union_rep: organizing->walkout->picketing, summons picketers
- review_drone: project->countdown->correct grading cycle
- voice_mimic_radio: vmLure/call->reveal cycle
- understudy: watching->performing->improv, learns favorite move
- bright_idea: settle->brighten->ember cycle, ember punish window live
- giant_mosquito: tbMosquitoTurn circle/dive/drink cycle
- alien_tick: tbTickTurn quest/latch/feed cycle (latch can carry Lemons)
- nightcourt: double-dive path reachable; nevermore: strafe dive cycles
- landlord: leased-tiles cycle live
- All 30 src/js modules load in index.html (the Alien Players lesson —
  checked, no dead modules).

## KILLS (fixed this run)

1. **test-wave2.js was RED** (3 fails): asserted the retired gate
   (systemArrived alone) and the 28-roster. The real gate since 2026-10-08 is
   unlockedWave() = day 8 + 4 wave-1 kills. Updated gate + counts (30) +
   WAVE2 list (+mosquito/tick) + 'single' pattern + fixed the smoke test's
   turn-driving (tbPlayerStudy doesn't burn movement — the old loop spun on
   the player's turn and the monster never acted; now ends the turn
   explicitly). 170 checks green.
2. **test-w2-escalation-verify was RED** (7 fails): bands predated the x1.4
   hardening; count 13 predated the vectors. Updated to 15-roster, bands
   HP 30-170 / dmg 8-48, 'single' pattern exempt like 'rush' (documented
   textual tell). 22 checks green.
3. **test-w2-hbd-polish was RED** (2 fails): harness parked bright_idea at
   d=3 — outside its reach-2 — so the disengage rule (correctly) ended the
   fight before declare; parked the tick at d=3 where it quests forever by
   design. Fixed harness geometry (idea d=2, tick adjacent), exempted the
   tick's bespoke 'single' pattern from the grid-telegraph check, added both
   vectors to the audit roster. 183 checks green.
4. **test-monster-behaviors was RED** (1 fail): giant_mosquito + alien_tick
   had no monsterBehaviors.json entries. Added (diver/ambusher archetypes,
   empty preTurnHooks — bespoke turns stay inline like other unmigrated
   species). 21 checks green.
5. **audit-wave2-escalation was RED** (6 NEEDS-WORK): same band staleness +
   missing vector theses + tick pattern. Updated. 15/15 PASS.
6. **test-patch-readiness** count 13->15 (specialized tool, syntax-checked).
7. **docs/MONSTER-WAVES.md** brought current: 15 wave-2 (added mosquito +
   tick rows), damage 8-48 post-hardening, corrected wave-1 reference ranges
   (10-170 / 4-32, were 12-70 / 6-30), fixed the stale "wanderer is hardcoded
   wave-1" line (it casts via wave-gated castMonster()).

## Attack surface notes (held — the deeper level)

- **Kill economy**: corpseForKill prefers mf._deathCorpse (per-kill
  registration); node+species fallback misfiles only when two of the same
  species die in one fight — already fixed 2026-10-08 via the _deathCorpse
  preference. Snake segments share one body via snakeId.
- **Flee resets**: door-flee stashes monster HP/positions (doorFledMonsters);
  betrayal wounds persist on the village record. No free heal by fleeing.
- **Disengage honesty**: follows:false monsters that can't chase end the
  fight when out of reach — the bright_idea "back off" counterplay working
  as designed (telegraph, once armed, holds the fight: the bomb still goes
  off). Minor fiction wrinkle: the generic disengage line says "they melt
  back into the wilds" for a sessile glow-bomb — acceptable, noted, not
  worth per-monster lines.
- **Double-KO rule**: player death on the same tick as the last monster
  checks player-first — no 'won' for a corpse.
- **validate-data.js is BROKEN pre-existing** (crashes on events.json:
  expects an array, file is {_comment,_schema,events} since the 2026-10-07
  events expansion). Not touched — outside monster area; flagged for the
  coordinator.

## Sibling-sweep recommendation

The bug class was **roster-count drift**: monsters.json grew (mosquito/tick)
and damage was rebalanced (x1.4) while docs/tests/audit bands kept the old
numbers. Swept: test-wave2, w2-escalation-verify, w2-hbd-polish,
monster-behaviors, audit-wave2-escalation, patch-readiness,
monsterBehaviors.json, MONSTER-WAVES.md. Possible remaining siblings:
other docs with monster counts (checked: none found outside
SCAFFOLD-AUDIT.md, which is a historical report and correctly left alone).

## Commits

- (pending) break-it monsters r1: proof suite + drift repairs
