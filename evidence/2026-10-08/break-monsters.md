# Break-it: monsters (target 5) — 2026-10-08

Hostile-player run against the monster system (combat monsters, not the combat
engine). Three real catches, all fixed + proven. Everything else held.

## CATCH 1 — Dead bespoke AI for 5 retired monsters (DEAD-CODE) — FIXED

**The break:** Commit 6943235 (Steve 2026-10-06) retired `hype_horn`,
`camera_swarm`, `service_mimic`, `contract_golem`, `delegate_beast` from
monsters.json — but game.js kept **456 lines** of live-looking code for them:
id predicates (`swarmIs/hornIs/smIs/cgIs`), the full camera_swarm flash-mob AI
block, the service_mimic watch/dial/hold block, the contract_golem fine-print
block, the hype_horn crowd-deflate/encourage/detonate branches, the
camera_swarm fire-scatter/windup/resolve branches, a torch-×3-vs-paper damage
rule, a +25%-fragile damage rule, `swarmCreep`/`swarmChase` helpers, and a
`hornIs` entry in the `tbFifoBreather` spec table. The predicates could never
match (no data def carries those ids) — the Alien Players lesson class,
explicitly deferred by a code comment ("another run's scope"). This run was
that scope.

**The fix:** Anchor-verified deletion of all 18 dead spans + stale-comment
updates (src/js/game.js, src/js/monsterBehaviors.js ontology note,
src/data/monsterBehaviors.json notes — byte-surgical, no JSON rewrite).
One deletion-induced bug caught by the harness before commit: the approach
section kept referencing the deleted `swarmChased` flag — fixed to drop the
dead condition.

**Sibling sweep:** every other module checked — encounters.js, alienPlayers.js,
contests.js and the rest of src/js carry no live references (only historical
comments). All 50 audio names in monsters.json resolve to real audio functions
in app.js. 8 orphaned audio *functions* remain in app.js (swarmFilm,
swarmBuild, swarmFlash, swarmShutters, swarmScatter, swarmEscalate,
hypeDeflate, hypeEncourage, hypeInflate — `serviceRush` stays live via the
warranty caller) — noted for the audio run, not deleted here.

**Proof:** `scripts/test-break-monsters-deadcode-20261008.js`
- Static: retired ids absent from monsters.json; zero string-literal
  references in code/data; zero live callers of the removed predicates/helpers.
  HEAD fails 6/6 caller checks; patched passes all.
- Differential: 28-monster × 3-state × 3-seed battery (tbMonsterTurn +
  tbDamage, 252 scenarios, 1065 messages captured) run against HEAD's game.js
  and the patched game.js — **0/252 diffs**. Deletion provably
  behavior-preserving.
- Existing suites: test-monster-behaviors-20261007.js 21/21,
  test-monster-loot.js 42/42 green.

## CATCH 2 — Wave-2 gate disagreed between spawn paths (HONESTY) — FIXED

**The break:** `monsterWavePool()` (tile-entry spawns + background
`maintainWorldMonsters`) keyed wave 2 on System arrival (day 7) with **no kill
requirement**, while `unlockedWave()` — used by `castMonster`, the loot tiers,
and the "Wave 2 talent has been released" announcement — requires day 8 + 4
wave-1 kills. Measured on HEAD: day 7, System arrived, zero kills →
tile-entry pool was 13/28 wave-2 and `spawnWaveTarget` dealt **~58% wave-2**,
while `unlockedWave()` said 1 and the System hadn't announced anything. The
"prove you can handle it" kill gate was bypassed on two of three spawn paths.

**The fix (figure-it-out-yourself call):** the kill gate is the deliberate
design, so `monsterWavePool()` now follows `unlockedWave()` — one gate
everywhere. No wave-3+ monsters exist in data, so behavior changes only for
wave 2's gate (day-7 arrival → day 8 + 4 kills). Stale comments updated.

**Proof:** `scripts/test-break-monsters-wavegate-20261008.js` — 9/9 green:
day-7/0-kill pool is wave-1-only, day-8/4-kill unlocks wave 2 on both paths,
day gate holds at 99 kills, 2000 `spawnWaveTarget` draws never deal wave 2
pre-unlock, the 60/40 newest-wave ratio is preserved post-unlock, and 500
`castMonster` calls never cast wave 2 pre-unlock.

## CATCH 3 — Sunbasker weakness lied about dusk (HONESTY) — FIXED

**The break:** monsters.json weakness promises "it won't fight in shade **or
at dusk**", and the code comment says "Shade or dusk: it flattens" — but the
engine tested `isNight()` (dayPart 3 only). At dusk (dayPart 2) the sunbasker
kept basking, charging, and biting. Copy said dusk; engine said night.

**The fix:** dusk (dayPart 2) flattens it too, with its own honest line ("The
light is dying and the fight dies with it…"). Unflatten path verified correct
(dawn/midday re-bask). Sibling sweep: the other three "dusk" mentions in
monsters.json (nightlight_catfish, memory_projector, nevermore) are flavor
text, not mechanical promises — clean.

**Proof:** `scripts/test-break-monsters-sunbasker-20261008.js` — HEAD:
dusk sunbasker keeps basking (lie documented); patched: dusk flattens
(phase=flat, charge=0), night still flattens, midday still basks.

## Attacked and HELD (solid notes)

- **Exploit — monster farming:** kill rewards are one carcass per fight
  (tbEnd, first monster fighter only) + low-chance loot rolls; per-segment
  corpses yield trophies (0 kcal), not meat. Ducks' 14 segments = 14 wave
  kills, but each is a real HP-bearing fighter — legitimate effort, not an
  exploit. Union rep's picket-line summon is once-per-fight (`urSummoned`).
  Fleeing/routing grants no meat, no trophy, no XP — and the fled-strike
  guard blocks parting hits.
- **Exploit — infinite spawns:** `worldMonsterCap` (3/5/8) bounds background
  spawns; tile-entry pity is capped at 60%; wave ratios preserved.
- **Softlock — union rep walkout:** the old permanent-untargetable stalemate
  was already fixed (killing allies collapses the walkout — verified in code).
- **Softlock — moderator shadowban:** mute only ever covers strike/move;
  WAIT is unmutable and flips the mute ("silence is a verb the algorithm
  cannot moderate") — always escapable. Flee-by-barrier-exit is never blocked
  by any monster.
- **Softlock — belltoad chorus:** `_pendingPack` strictly decrements; the
  fight always terminates. Turtle bunker decrements; drone recalc bounded at 1.
- **Honesty — hushwolf:** no grid rush indicator in code (per Steve's kill);
  the silence telegraph is implemented (Quiet Woods event + encounter
  messaging); rush moves-and-hits with no telegraph, snarl fires only after
  first contact. Data telegraph text matches.
- **Honesty — warranty caller:** weaknesses match code exactly (2+ tile move
  drops the call; pain forces redial; ring always first).
- **Honesty — lockpick theft:** escaping with your item is narrated
  explicitly ("it's gone. so is your stuff.") — theft-allowed by design, not
  a silent loss.
- **Dead-code — full sweep:** all 28 data monsters have behavior-table
  entries, encounter blocks, and reachable spawn paths; every monster js
  module is loaded in index.html in order; zero retired-id string literals
  remain in code or data.

## Notes for other runs
- app.js has 8 orphaned audio functions from the retired monsters
  (swarmFilm, swarmBuild, swarmFlash, swarmShutters, swarmScatter,
  swarmEscalate, hypeDeflate, hypeEncourage, hypeInflate) — audio run's scope.
- `scripts/test-encounters-20261007.js` is broken pre-existing (calls
  `G.encPatternStage`, which exists nowhere in the codebase, HEAD included).
- `monsterWaveAvailable()` has zero callers — harmless, left alone.

## Files changed
- src/js/game.js (−456 dead lines; wave-gate unification; sunbasker dusk fix;
  swarmChased dangling-ref fix)
- src/js/monsterBehaviors.js (ontology note updated)
- src/data/monsterBehaviors.json (2 notes updated, byte-surgical)
- scripts/break-monsters-harness.js (new shared harness)
- scripts/test-break-monsters-deadcode-20261008.js (new)
- scripts/test-break-monsters-wavegate-20261008.js (new)
- scripts/test-break-monsters-sunbasker-20261008.js (new)

## Landing status (2026-10-08, end of run)
- COMMITTED (f29b09a): wave-gate unification, sunbasker dusk honesty,
  comment updates, proof tests, this evidence file. All proof tests green.
- PENDING — dead-code purge (Catch 1): the 460-line deletion in src/js/game.js
  is staged in the worktree as UNCOMMITTED changes. safe-commit.sh REFUSED it
  (492-line deletion guard = stale-revert signature). This is the documented
  intentional-deletion case, verified by a 252-scenario differential vs HEAD
  (0 diffs) — but per run rules it needs coordinator approval for
  --force-delete. The full end-state is in the worktree, tests green against
  it. Do NOT let the reaper or another run touch this tree until the purge
  decision is made.

---

# Break-it: monsters RUN 2 (target 5, second pass) — 2026-10-08

Hostile-player run 2 against the monster system, going deeper than run 1's
catches (dead bespoke AI, wave-gate, sunbasker dusk). Four new catches, all
fixed + proven. Method: 28-monster hostile sim (passive player, 40 rounds)
plus targeted probes.

## CATCH 4 — Zero-range beam/line/charge whiffed (HONESTY, engine) — FIXED

**The break:** `S.combat.patternCells` returned `[]` for beam/line/charge when
attacker and target shared a tile (`n=0`). Same-tile spawns are real
(bump-in-the-dark, `startCombat` with no world position, player stepping onto
the monster). Measured on HEAD, passive player, monster on player tile:
- mirror_stag: Confrontation declared + "resolved" every 2 rounds for 40
  rounds, **0 damage** — infinite wheel loop, signature attack a permanent
  whiff.
- review_drone: beam "dies against the trees. Cover works." — **a lie**
  (no cover; degenerate geometry) — then project→countdown→recalc forever,
  0 damage.
- memory_projector: Home Movies beam resolved harmlessly, 0 damage / 40 rounds.
- white_noise_heron: first strike ate the same "cover works" lie.

**The fix:** combat.js `patternCells` — zero-range lane is the shared tile
(`if (n === 0) cells.push({cx: ax, cy: ay})`). One engine line fixes every
caller (stag, drone, projector, heron, bulldozer, deer beam paths).
Ontology rule added (`zero-range`, code: patternCells); validator green.

**Proof:** `scripts/test-break-monsters2-patterncells-20261008.js` — 11/11:
unit (same-tile covers tile for beam/line/charge; adjacent lanes unchanged;
burst unaffected) + fight-level (stag/drone/projector/heron all damage a
same-tile player; zero "cover works" lies). Post-fix hostile sim: stag kills
in 11 rounds (was 40-round 0-dmg loop), drone in 24, projector in 20, heron
in 23.

## CATCH 5 — Lockpick bolt-phase stuck forever (SOFTLOCK) — FIXED

**The break:** after stealing, the raccoon bolts for the nearest edge. When
that edge sat behind blocking terrain, `tbStepToward` returned null every
turn — the raccoon sat in 'bolt' phase forever saying "pure getaway," going
nowhere. Measured: 40 rounds, zero movement, `over=false`. The fight never
ended on its own (player could still flee, so not a hard lock — a stuck
monster state contradicting its own fiction).

**The fix:** game.js bolt phase — two consecutive no-progress bolt turns and
the raccoon "finds a gap in the treeline" (`fled=true`, item honestly lost,
fight ends 'routed'). The two turns preserve the counterplay: hurt it
mid-bolt and it drops your things (verified via `tbPlayerStrike` →
`encNoticesPain` → `lockpickHit` path).

**Proof:** `scripts/test-break-monsters2-lockpick-20261008.js` — 9/9:
stuck escape (fight ends, item honestly gone, narrated), counterplay
(item dropped + returned, no duplication), normal edge escape intact.

## CATCH 6 — Dead ambush-zone system with a live crash inside (DEAD-CODE) — FIXED

**The break:** game.js carried a full seeded-ground ambush system —
`tbSeedAmbushZone()`, `tbAmbushZoneTick()`, three tick call sites — with
**zero seeders** (no monster/scenario/debug path ever creates a zone). Worse,
the engine side was wiped by a stale-tree revert: combat.js lost `zoneArmed()`
and `telegraphText()` (466 lines gone between b1c90d1 and ab148ef), so the
dead tick would have THROWN (`S.combat.zoneArmed is not a function`) the
moment any zone existed. The Alien Players class: dead system, live crash.
Note: ab148ef deliberately rewrote combat.js's provides header (slimming),
but left the game.js callers dangling — this removal completes that cleanup
in the direction the header points. Full engine restore from b1c90d1 remains
available in git history if Steve wants the system back.

**The fix:** removed seeder + tick + all three call sites + ontology claims
(~90 lines game.js). Sweep confirmed zero remaining references to any of the
14 slimmed engine functions (`isInterior`, `cellsAtPhase`, `dodgeable`,
`hpFrac`, `desperate`, `traumaOf`, `flinching`, `monsterDesperate`,
`villagerShield`, `zoneArmed`, `telegraphText`, `patternInfo`,
`phaseTiming`, `applyVariant`, `patternFollowUp`).

**Proof:** `scripts/test-break-monsters2-ambushzone-20261008.js` — 11/11:
system gone, zero callers of the missing engine functions, ontology claims
dropped, combat runs clean, `validate-ontology.js` passes.

## CATCH 7 — Dead helper + broken wave test (DEAD-CODE) — FIXED

**The break:** `Game.monsterWaveAvailable()` had **zero game-code callers** —
its only consumer was `scripts/test-wave-system.js`, which was itself broken
on HEAD (asserted hushwolf=wave 2, gallowdeer=wave 4 — both wave 1 now — and
a `thornback_boar` that no longer exists: 2 FAILs + TypeError crash).
Also removed the dead `delete m.hypeDeflateCrowd` in `tbFifoBreather`
(leftover of the retired hype_horn; field never set — run 1's purge missed it).
Stale "one apex per wave" framing fixed in `rollAlienLoot` comment and the
moderator's data note per Steve's 2026-10-07 correction (tier 4 earned on its
own terms; byte-surgical JSON edit, file otherwise identical).

**Proof:** `scripts/test-break-monsters2-deadcode-20261008.js` — 9/9;
`scripts/test-wave-system.js` rewritten to current data — 26/26.

## Attacked and HELD (run 2 solid notes)

- **Exploit — loot-as-action:** `lootCorpse` decrements units per take;
  emptied corpses refuse ("Nothing left worth taking"). No duplication across
  take/search cycles. `tbLockpickReturn` clears `m.stolen` on return — single
  path, no dupe. Corpse registration: `_deathCorpse` set once in tbDamage;
  `corpseForKill` prefers it, fallback creates exactly one.
- **Exploit — wave-kill paths:** `recordWaveKill` only on 'won'; fled/routed
  monsters are alive → no credit; hushwolf pack-flee grants nothing.
  (Run 1's ducks-segments verdict stands — not re-litigated.)
- **Exploit — loot rolls:** `rollAlienLoot` fires once at tbEnd; no re-roll
  path. Veteran tier bump gated on `unlockedWave() >= 2`.
- **Honesty — damage:** monster damage rolls match data ranges modulo armor
  absorption, which is narrated ("Armor absorbs N"). Moderator's phase-scaled
  damage (observing 6-10 "weak now", muting compliant graze 8-12, shadowban
  14-18/20-28) matches its copy. Sunbasker charged bite (8-14 + 4/charge)
  matches the heat-halo meter. Bulldozer trample (10-16) is a separate
  documented beat from the charge (18-26).
- **Honesty — counters:** warranty caller "pain forces redial" verified
  (hit → redial next turn); "2+ tile move drops the call" in code; ring always
  first. Lockpick "hurt it mid-bolt drops the item" verified. Moderator
  "WAIT flips the mute" in code (run 1).
- **Honesty — telegraphs:** all 9 `m.telegraph = null` sites narrate the
  cancellation (scream fizzle, gravity well, bellow startle, projector
  static-break, drone recalc, stag lost-sight, beam end).
- **Honesty — wave escalation:** wave 2 averages HP 96 / dmg 19.3 vs wave 1's
  47 / 15.5 — tougher but not reskins; all 13 wave-2 monsters have bespoke
  system-horror mechanics (mimic/lure, mirror/gaze-freeze, drone/evaluation,
  idea/detonation-rekindle, projector/pull, caller/phone, understudy/copy,
  landlord/territory-rent, heckler/shame, paparazzo/prediction-flash,
  union/picket-line, moderator/mute-field, statickite/broadcast). Wave 2 on
  its own terms — holds per Steve's progression law.
- **Softlock — no crashes:** 28-monster hostile sim, zero exceptions.
  Understudy cold-read anti-stall verified in code (run 1 sim killed player).
  Turtle bunker decrements; belltoad `_pendingPack` strictly decrements.
- **Dead-code — zero-caller sweep:** all `tb*` monster helpers have ≥1 caller;
  `tbFifoBreather` spec table clean; all 28 monsters loaded in index.html
  order (prior run).

## Notes for other runs / Steve

- `scripts/test-combat-telegraphs-20261007.js` is broken PRE-EXISTING on HEAD
  (calls `C.cellsAtPhase`, `C.zoneArmed`, `C.telegraphText` — all lost in the
  ab148ef engine slimming; fails at line 62 before reaching them). Not caused
  by this run. If the engine functions are ever restored, this test documents
  the expected API.
- The ab148ef slimming (authored as Steven Vitale, 2026-10-07 04:27) removed
  466 lines from combat.js with a rewritten provides header — likely
  deliberate, but the game.js callers were left dangling. This run completed
  the cleanup. If the slimming was NOT intended, restore combat.js from
  b1c90d1 (git history intact) — but then a monster must actually seed
  ambush zones, or the system stays dead.
- bright_idea flees in daylight ("never meant for daytime") — by design, not
  a bug; verified in code.

## Files changed (run 2)

- src/js/engine/combat.js (+8/−2: zero-range lane fix + ontology rule)
- src/js/game.js (+~30/−~120: lockpick bolt stuck-counter, monsterWaveAvailable
  removal, hypeDeflateCrowd removal, ambush-zone system removal (seed + tick +
  3 call sites), ontology claim updates, tier-4 comment fix)
- src/data/monsters.json (1 string: moderator loot note rewording, byte-surgical)
- docs/ONTOLOGY.md (auto-regenerated by validate-ontology.js)
- scripts/test-wave-system.js (stale assertions → current data, 26/26)
- scripts/test-break-monsters2-patterncells-20261008.js (new, 11/11)
- scripts/test-break-monsters2-lockpick-20261008.js (new, 9/11 → 9/9)
- scripts/test-break-monsters2-deadcode-20261008.js (new, 9/9)
- scripts/test-break-monsters2-ambushzone-20261008.js (new, 11/11)

## Landing status (2026-10-08, end of run 2)

- All proof tests green (40 new assertions) + all prior suites green
  (behaviors 21/21, loot 42/42, wave-gate 9/9, sunbasker 3/3, run-1 deadcode,
  wave-system 26/26) + `validate-ontology.js` green (47 systems).
- Committed in worktree; awaiting coordinator merge/push/version-bump.

---

## Run 2 follow-up (same worker, ~14:40 CDT — deeper on the coordinator's new asks)

The coordinator's follow-up asked for HEAD-level verification of run-1's
purge, the audio orphans, corpse-rot honesty, and XP-grant honesty. Most of
the follow-up's attack list was already covered by run 2 above (28-monster
honesty sim, wave-2 escalation, softlock sweeps, ambush-zone + wave-helper
dead-code purges). The genuinely new findings:

**Verified against HEAD (not the worktree): 9410481 purge held.** The
retired ids (hype_horn, camera_swarm, service_mimic, contract_golem,
delegate_beast) still appear in main-tree HEAD — but ONLY as historical
comments/notes in game.js, monsterBehaviors.js, and monsterBehaviors.json
(e.g. "Renamed from hype_horn; the old hornIs crowd-deflate branch was dead
code; removed 2026-10-08"). Zero live code references. The purge is real.

**Confirmed: the 8 orphaned audio functions in app.js are STILL orphans.**
swarmFilm, swarmBuild, swarmFlash, swarmShutters, swarmScatter, swarmEscalate,
hypeDeflate, hypeEncourage, hypeInflate — zero `audioEvent('<name>')` call
sites anywhere in src/js/. (Two have registry-wrapper entries
`swarmShutters(d) { swarmShutters(d); }` — dispatch stubs, not gameplay
callers.) break-audio.md does not mention them; the audio run did not handle
them. Left alone — app.js is the audio run's territory, not monsters'.

**Corpse rot is REAL and honest (proven, not just implemented).**
`endDay` calls `sweepSpoiled()`, which sweeps corpse inventories with the RAW
spoilDay clock (no storage-skill bonus — "the earth doesn't grade on
technique"). Proof test kills a hushwolf, leaves a carcass (spoilDay =
day+2): survives day D and D+1, rots off at the D+2 dawn sweep — matching the
UI promise "Spoils in ~2 days" exactly. Rot is announced when the player is
on the same node ("went bad — maggots, smell, the whole sad story"), never
silent. Non-food trophies (Teeth) never rot; buried corpses are exempt.
**Proof:** `scripts/test-break-monsters2-corpse-rot-20261008.js` — 9/9.

**XP-grant honesty: there is no XP to farm.** `one_person_army` is a brawler
synergy in synergies.json, not an XP path — no `gainXP`/XP-on-kill numeric
path exists in game.js, corpses.js, or progression.js. A kill grants: exactly
one corpse (verified 1 death = 1 corpse), bounded possessions (1–2 items from
a fixed pool; 30 kills = linear finite loot, max 4 items per kill), plus
death-knowledge/gossip sync. Loot-as-action anti-duplication proven: total
units ever taken from a corpse never exceed what it held; a drained corpse
yields nothing further (the first version of this test asserted a `looted`
flag — wrong mechanism; the real mechanism is unit depletion, corrected in
the test).
**Proof:** `scripts/test-break-monsters2-killgrants-20261008.js` — 8/8.

**Note for the coordinator:** this follow-up's work sits on top of run 2's
still-uncommitted changes (safe-commit.sh refused the 114-line deletion;
awaiting `--force-delete` approval per the run-2 report). Nothing was
committed by this follow-up.
