# Break-it monsters r2 (system 5) — 2026-10-09

Run: oversight-flesh-out-loop, scheduled 07:08 CDT. Target index 5→6 (read from
`~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/break-it-target.txt`;
index file says 5 — this run attacks it and writes back 6).
Worker tree `break-monsters-r2`. Prior art read first: `evidence/2026-10-09/break-monsters.md`
(run 5: weakness-copy, dead fear, wave-kills — all fixed), `evidence/2026-10-08/break-monsters-4.md`,
`break-monsters3-fieldfights.md`, `break-monsters4-flip.md`, `real-fights.md`.
Fresh angles only — 6 catches, all fixed + proven.

## CATCH 1 — Steve's waterAffinity design silently deleted (SPAWNABILITY) — FIXED

**The break:** Commit `01dc286` (Steve 2026-10-06, "Water-monster spawn audit") added
`waterAffinity` to 4 monsters: `nightlight_catfish: "in"` (lives IN water),
`white_noise_heron`/`belltoad`/`speedbump_turtle: "near"`. Commit `98041cc`
(2026-10-07, "Add pyrokinesis + stormcall abilities; tune loot") rewrote
monsters.json from a stale copy and **deleted all 4 fields**. The stale-tree
version bump `cda7946` coincidentally re-added them; the bulk restore `7b49fc5`
(reverting cda7946's damage) deleted them again. Net: HEAD had zero
waterAffinity fields while `pickWorldTile`, `pickSpawnMonster`,
`placeSpawnMonster`, `castMonster`'s exclusion, and the wanderer placement all
still read them — **live guards over dead data**. The catfish spawned on dry
grass like any land monster; the 2026-10-06 edge-water placement fix
("41 rounds, 0 strikes, 83 damage taken, no way in") could never engage.

**The fix:** byte-surgical restore of the 4 fields (4-line diff), verified
identical to the pre-damage state (`98041cc^`) for all 28 monsters.

**Proof:** `scripts/test-break-monsters-r2.js` §C1 — data asserts (4 fields,
exact values, no others) + source asserts (all 4 spawn functions read the
field) + differential (`git show HEAD:...` has 0 fields pre-fix).

## CATCH 2 — specialist cook printed phantom calories (EXPLOIT) — FIXED

**The break:** `askSpecialist` 'cook' on cleaned meat computed
`total = it.hiddenKcal || it.kcalEach * 2.5 * units`. But the clean step stores
the **raw gross** in `hiddenKcal` (`it.hiddenKcal = gross; // full gross
remembered for cooking`) while `kcalEach×units` is the honest 40%-yield net.
A 3200-gross bulldozer cleaned to 1280 kcal (3×427) came back from the
specialist's fire at **3840 kcal** (skill 4) — the butchering loss resurrected,
energy from nothing. The 2026-10-08 hunter loop fixed this exact class in the
batch-cook path ("hiddenKcal is the RAW gross… 2.5× phantom calories") but the
specialist path was missed. Reachable via the stash "ask to cook" button
(forceTask='cook').

**The fix** (`src/js/food.js`): digestibility honesty — the cleaned total
(`kcalEach×units`) is the raw net; the specialist's skill buys a better cut of
the reconstructed gross via the food's class (`raw`/`cooked`), never more than
gross. 3200-gross bulldozer at skill 4 now cooks to 2235 (was 3840): better
than the player's perfect 1863 (+5%/level, as advertised), honest.

**Sibling sweep:** self-smoke (`kcalEach×0.95/0.80`), shelling (single 0.75×),
fat rendering (fatKcal is a 20% share, no double loss), player cook and batch
cook (both via `cookTransform`, capped at gross) — all honest. Only the
specialist branch was affected.

**CATCH 2b — reveal order-dependency (HONESTY):** `markMonsterFoodSafe`'s reveal
used `gross * 0.40 / 4` ("standard yield") regardless of actual portions —
test-after-clean yielded 320×3=960 vs test-before-clean 427×3=1280 for the
same meat. Now distributes over actual portions for cleaned meat (carcasses
keep /4; cleaning recomputes from hiddenKcal anyway).

**Proof:** §C2 — played math through the real `askSpecialist` (only the
specialist lookup stubbed): 2235 total, ≤ gross, > cleaned net, old formula
shown printing 3840; reveal order-independence asserted.

## CATCH 3 — villager kills evaporated carcasses (WORLD HONESTY) — FIXED

**The break:** `resolveWildMonsterEncounter` vKill called `removeWorldMonster(m)`
with no corpse and no meat. A villager's 3200-kcal bulldozer kill vanished
entirely — no body, no carcass — while the player's identical kill left a
lootable, rottable carcass (loot-as-action). The corpse system's own header:
"when a person or monster dies, a corpse entity stays."

**The fix:** the vKill branch now registers a monster corpse at the kill tile
(`registerDeath` accepts a new `opts.node` override — corpses are node-scoped,
and the kill is off the player's tile) with the same carcass entry via the new
`monsterMeatEntry(mdef)` helper, factored out of `tbEnd` (behavior-identical
refactor — the meat-flow win path still says and places exactly as before).

**Proof:** §C3 — rigged vKill record through the live router: corpse registered
at (7,7) not the player tile, `meat_bulldozer` carcass on it, calories hidden
until learned, monster removed from the world.

## CATCH 4 — patrol RNG outcome table (STEVE'S LAW) — FIXED

**The break:** `resolvePatrol` still resolved villager-vs-monster as a flat roll
(`fightPower + R(0,20)` vs `mHp*1.2` → killed/drove-off/mauled) — the exact
outcome-table class Steve rejected twice ("it should be a fight. A hard one";
the parity hunt's 35/25/25/15 and the pre-real-fights routers). Two compounding
sins: (1) the "kill" granted flat `R(200, 600)` "Game meat" via `stockPantry` —
phantom calories bypassing the entire carcass/clean/cook/**weirdness** pipeline
(patrol meat never rolled monster-meat weirdness, never needed a cautious
test, never spoiled); (2) the roll used the def's **minimum** HP, so wounding a
monster first bought nothing — wounds didn't persist into the patrol.

**The fix:** patrols fight through `fieldFight(vid, mdef, m, {})` with the same
outcome routing as the other two routers (alreadyDead/vKill/mFlee/vFlee/vDie —
wounds via `hurtVillager`, wave kills recorded, trust/deeds/gossip intact);
kills leave the same carcass (shared `killCorpse` closure); deaths route through
the real death pipeline.

**Proof:** §C4 — source asserts (fieldFight routed, table gone, no stockPantry,
carcass + wave-kill present) + played canned vKill through the live router
(carcass with meat, waveKills incremented).

## CATCH 5 — wave-3 unlock announcement lied (HONESTY) — FIXED

**The break:** `unlockedWave()` can return 3 (day 25 + 8 wave-2 kills — genuinely
reachable), and the unlock `sysSay` announced "Wave 3 talent has been released
into your sector." The roster has **zero** wave-3 monsters — the System promised
beasts that never came (spawns stay 60/40 w2/w1; only contests gate on wave 3).

**The fix:** the announcement checks the data — "talent released" only when the
new wave has monsters; otherwise it says what wave 3 actually brings
(escalating challenges, expectant woods). When wave-3 monsters ship, the talent
line becomes true on its own.

## CATCH 6 — disengage copy lied (HONESTY) — FIXED

**The break:** "You walk clear of them. Nothing follows." — but the separation
isn't always the player's. A mirrormoth (drifter, `follows:false`) can jitter
out of its own flash range on turn 1 via the 45%-jitter approach; the
disengage rule ends the fight and the copy blamed the player for walking.

**The fix:** direction-neutral line — "It comes apart — no one in reach, no
one chasing. The fight ends; they melt back into the wilds." (The fizzle
itself is drifter nature, not a bug — noted, not "fixed".)

## HELD (attacked, resisted — the deeper level)

- **Alien-pool routing (angle 3):** the boundary holds. `seIsDisease` admits
  mundane only; `contractDisease` refuses alien ("That is not a sickness of
  this earth"); `sickDiseases` (feeds treatDisease/useMedicine/rest/diagnosis)
  is mundane-only; `cureEffectFor` returns 'no' for the alien `cure: []` defs;
  Shake It Off clears only stun/slow/bleed. The meat paths (player
  `maybeMonsterWeirdness`, villager `villagerMonsterWeirdness`) and the giant-
  mosquito vector apply via `applyStatus` directly — the alien path, never
  through `contractDisease`. Eurika/east_nile carry no `duration` → entries get
  no `dayPartsLeft` → `tickStatuses` never expires them: permanent warping,
  ticking 1/2 HP per dayPart forever, exactly per docs/DISEASES.md canon.
- **Counter playability (angle 5, PLAYED not copy):** 17/17 ×3 seeds in real
  harness fights — moderator: 4 strikes build the mute, 5 waits LIFT it
  (announced "lost the thread"), post-lift strike is not a violation;
  hushwolf: the rush moves adjacent and hits ("no warning, just teeth") with
  zero telegraph ever declared; mirrormoth: facing locks at the fold toward
  the player, the flash is a frontal 180° arc (behind = 0 damage), post-flash
  `encCooldown` recovery ("dull, lightless") with no second flash.
  (`scripts/test-break-monsters-r2-counters.js`)
- **Wave escalation (angle 6):** all 13 wave-2 monsters are conceptual/system
  horrors (radio grief-voice, performance-review drone, warranty caller,
  landlord, heckler, paparazzo, union rep, moderator, nostalgia projector,
  understudy, memory stag, inspiration bulb, static kite) — no stronger-animal
  reskins. `mirror_stag` is the deliberate edge: a deer base, but the vibe
  frames it as the System iterating the deer into psychological horror with
  psychic attacks — escalation, not a stat bump. Wave-4 gate still honestly
  unreachable (kills[3] can never increment); wave-3 reachable but monsterless
  (C5 fixed the announcement).
- **Sent to fight (angle 7):** no purposeless disengagement found. `fleeAt` is
  unset on all 28 (the low-HP flee branch is dead — consistent with Steve's
  NO SELF-PRESERVATION call); lockpick flees are its thief design
  (steal-then-bolt, with the anti-forever-loop bolt cap); bright_idea disperses
  at dawn (its fiction — made of light); picketers scatter on rep death
  (designed); the disengage rule only ends fights no one can act in.
  `ducks_in_a_row` has `follows: undefined` → defaults to chaser via
  `!== false` — consistent with its march/hunt fiction, but the data should be
  explicit; left untouched (zero behavior change), noted here.
- **Spawnability (angle 1):** all 28 ids defined and referenced; all spawnable
  through live paths (`monsterWavePool`/`castMonster`/contest arena for 27;
  water-gated background/tile spawns for the catfish post-C1); contest arena
  draws from `monsterWavePool` (no hardcoded ids); debug scenarios reference
  26 valid ids (moderator/warranty_caller simply have no scenario); no
  referenced-but-undefined ids anywhere; `monsters.json` is in the game.js
  load manifest.
- **Softlock (angle 4):** `tbEndCheck` runs after every fighter's turn; the
  disengage/telegraph-commit/chorus guards hold; the belltoad chorus is bounded
  (packDelayed trickle); hesitate/loom are single-turn; the union-rep picketer
  scatter sets `fled` (fight can end). No fight-that-can't-end found.
- **Meat economy (angle 2):** the kill→carcass→clean→cook→eat loop is honest
  end to end (40% clean yield, digestibility-capped cooking, spoilDay on every
  stage, corpse/pack/pantry sweeps all covered). No infinite-calorie farm
  beyond the fixed specialist hole: respawns are capped (world cap 3–8, one
  spawn per tick), kills are real fights, carcasses rot in 3 days.

## Proof results

- `scripts/test-break-monsters-r2.js` — **32/32 ×3 seeds** (20261008, 7, 99)
- `scripts/test-break-monsters-r2-counters.js` — **17/17 ×3 seeds**
- Regressions: villager-agency 43/43, cooking-model ALL CHECKS PASSED,
  real-fights 15/15, parity-combat 6/6, weakness 59/59, fear 9/9, wavekills
  4/4, fieldfights-r3 24/24, ontology 50/50 ("Release permitted").

## Pre-existing failures (not this run, verified)

- `scripts/test-meat-flow.js` fails identically on HEAD: expects the kill
  carcass in the player's pack, but loot-as-action (Steve 2026-10-06) puts it
  on the corpse — the test is stale, the game is right. Flagged for the
  cleanup run; out of area.

## Infrastructure incident (loud)

A failed `git stash push -- <paths> -m msg -q` (pathspec misparse) was followed
by `; git stash pop -q`, which popped a SIBLING'S ANCIENT stash
("visitorHtml render slot for trader wares", 2026-10-06) into this tree,
conflicting index.html/app.js/build.js/sw.js/version.json. Recovered with
`git checkout HEAD -- <files>` (my 4 files were never conflicted); the
sibling's stash entry was preserved, NOT dropped. Lesson re-learned the hard
way: never bare-pop on the shared tree — AGENTS.md already says this.
