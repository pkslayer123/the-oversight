# Break-it: food economy, layer 3 — 2026-10-09

Target: the VILLAGE food economy (villager-grit commit a0e37a9), the
prepStash render/pemmican gap, the assignTask gate (fe459b6), blood_magic
re-verification, trap economy. Proof: `scripts/test-break-food3-20261009.js`
(46/46 × 3 seeds AFTER; BEFORE mode confirms the kills).

Layers 1–2 (break-food.md, break-food-layer2.md) are not re-proven here.

## KILLS (broke, fixed, proven)

### H1. Villager takes never recorded → freeloader pipeline dead (EXPLOIT/DEAD-CODE)
`v.takes[vid]` was only ever written for the PLAYER (takeFromPantry, bulk
take). Villagers' pantry/pack draws in `villagerMealDay` were never recorded —
so `draining = takes - gave > 1500` in `freeloaderTick` was always false for
villagers, and the entire exile pipeline (gossip → warning → moot vote) was
unreachable for its intended population. The villager-grit proof test faked
takes by hand-writing them (`vv.takes[slackId] += 800`), so 22/22 passed on a
dead pipeline. Measured: 20 days of real `villageEats`, takes stayed
`undefined`, stage 0.

Fix (game.js `villagerMealDay`): record the day's real flows —
`v.takes[vid] += pile.taken` (pantry draws + away pack rations, which are
pantry-drawn at dawn) and `v.gives[vid] += gave` (surplus shared).
BEFORE: takes undefined. AFTER: takes match the draw.

### H2. Haven credit double-counted + printed food (HONESTY/EXPLOIT)
`havenRoleCredit` was folded into `villagerMealDay`'s `produced` AND written
to `v.gives` by `resolveOneAssignment`. The freeloader's
`actual = produced + gives` counted it twice (measured 4360 vs 2100 expected),
and — worse — the produced inclusion flowed through surplus → `stockSurplus`
→ REAL pantry items: ledger credit conjured food (measured ~1000 kcal/day
for a haven cook). The design intent (code comment) is ledger recognition,
not production.

Fix (game.js): `produced` is now pure `villagerDayProduction`; the credit
lives ONLY in `v.gives` (written when the work resolves). No food printing,
single count. The "who's pulling weight" panel now includes today's haven
credit (`havenToday`, reset daily in `villageEats`) so haven work stays
visible. BEFORE: produced 2942 (incl. 1120 credit). AFTER: 1822 (identity
model only), pantry delta 0.

### H3. Alien-kill phantom eaters (EXPLOIT)
`alienPlayers.js` marked victims `dead = true` + `registerDeath` but never
called `removeVillager` — the corpse stayed in `v.roster`, and `villageEats`
(whose loop only skipped `!person`) kept feeding it: it ATE from the pantry
and PRODUCED food. Every other death path pairs registerDeath with
removeVillager; `freeloaderTick`/`mentorTick`/`villageDrinks` already skip
dead — the meal loop was the inconsistent one. Measured: dead villager ate
2195, drew 200 from the pantry.

Fix: `villageEats` skips `person.dead` (defense in depth); the alien kill now
calls `removeVillager(victim, 'killed')` (pattern-conformant). BEFORE: dead
eats. AFTER: no contribLog, roster clean.

### H4. prepStash render/pemmican never wired (HONESTY — the known gap)
`docs/PRESERVATION.md` lists it: "Render/pemmican are not yet wired for the
village stash path (prepStash)." The engine functions accept a container, but
app.js offered no buttons — raw fat / pemmican ingredients on the counter
were a UI dead end (only smoke/cook/clean/shell were wired).

Fix (app.js): per-item "Render" button for raw fat + "Make pemmican (N bars)"
counter button (gated on `knowsTechnique('render')` + `pemmicanPreview(stash)`),
wired to `Game.renderFat(idx, stashOf())` / `Game.makePemmican(stashOf())`
like the smoke path. Clocks verified honest: stashClock shows 120d/90d
(+preservation_instinct bonus, one boundary); pemmican rots on its clock
(day+120+bonus), not immortal; rendered fat stamps day+90; stash→pantry
put-away preserves both clocks.

### H5. Player villageMeal draw unrecorded (SIBLING of H1)
The communal meal burned the pantry (`lastPlayerMeal` for the burn clock) but
never wrote `v.takes[player]` — a player eating free village meals forever
never tripped the draining check (only takeFromPantry recorded takes).
Fix (game.js `villageMeal`): record the draw in takes. BEFORE: takes 0 on a
600+ meal. AFTER: takes match.

### H6. Freeloader effort gate unreachable for villagers (DEAD-CODE)
`effort = actual/expected < 0.5` can never fire for villagers: `produced` is
`expected × grit` by construction and `gritRoll ≥ 0.5` always. The pipeline's
logic was sound; its input was impossible. (The proof test faked
produced=50.)

Fix (game.js `freeloaderTick`): OR in a capacity-scaled drain gate —
`netDrain > max(1500, totE*3)` — alongside the original clause. Per-person,
never flat: an old woman's modest shortfall (totE×3 ≈ 8900) is effectively
never flagged; sustained heavy drain is. All 22 villager-grit proofs still
pass (spec scenarios: sustained drain → vote; bad week → no vote; elderly →
never flagged; haven cook → safe; player → vote).

## HELD (attacked, resisted — with numbers)

- **blood_magic gate**: 2/daypart enforced (6 rapid → 2 succeed); wound +10/use,
  refuse at ≥50 (49→59 allowed, then refused); +500 kcal clamped to kcalCap
  (2400); day-part key resets on new part AND new day; wound survives a JSON
  save/load round-trip (scholar field, `load()` restores whole state); menu
  mirror (`_legacyActivatables`) honestly unavailable after 2 uses. Sustainable
  ≈1/day by design. The 2026-10-08 +21,600 kcal/day engine is dead.
- **assignTask gate**: remote `assignTask` refused; bogus `via` refused;
  face-to-face allowed (obedience check intact — a "no" is the designed
  refusal path, not the gate); `remoteAssignMethods()` empty by default so the
  UI sheet refuses honestly upfront. `resolveOneAssignment` direct-call is
  engine-internal (gated callers: assignTask, designed taskLeads). No menu
  promises assignment the gate then breaks.
- **Trap economy**: uses decrement per catch, break at 0, catches deplete real
  wildlife, only present species eligible. Snare lifetime EV ~3.1k kcal gross
  for vine+stick+craft+set time — fair. Pit trap (deer/boar, 4 uses) is the
  hottest table but bounded by uses + ecology depletion; no infinite angle.
- **Mentorship faucet**: mentorBonus capped 0.5, knowledgeFactor capped 1.8;
  the return compounds on the villager's OWN production (feeds self first) —
  bounded ≈2.7x after a 30-day party investment in one villager. Not a faucet.
- **Phantom producers (general)**: roster is the single gate; removeVillager
  cleans it; the membership wrapper's dead-stay-dead restore holds. Exiled
  villagers keep no production/meal/draw footprint (roster-skipped).

## SIBLING SWEEP
- Takes/gives class: player villageMeal fixed (H5); away pack rations counted
  once (at meal, not at dawn pack-fill); assigned forage/hunt stockPantry
  directly without ledger credit — reviewed, not a kill (the ledger judges
  daily life; assignments are player-directed bonuses on top).
- Double-count class: havenRoleCredit now single-sourced (gives);
  mentorship bonus lives only in produced; no other credit path double-dips.
- Dead-guard class: villageEats fixed; villageDrinks/freeloaderTick/
  mentorTick already skip dead; alien kill now removes from roster.
- Stash-UI class: all 16 stash actions audited; render/pemmican were the only
  missing pair.

## DEAD CODE
All touched functions are live: villagerMealDay (villageEats), freeloaderTick
(villageEats), havenRoleCredit (resolveOneAssignment), removeVillager (alien
kill), renderFat/makePemmican (new stash buttons + fire menu). No dead
modules.

## Regressions
- New proof: scripts/test-break-food3-20261009.js — 46/46 × seeds 20261009, 7, 99 (AFTER); BEFORE mode 40/40 confirms kills.
- Layer 1: scripts/test-break-food-20261009.js — 116/116.
- Layer 2: scripts/test-break-food2-20261009.js — 42/42.
- Villager-grit: scripts/test-villager-grit-20261009.js — 22/22.
- Drifter remote (assignTask gate): scripts/test-drifter-remote.js — 27/27.
- Alien break-it: scripts/test-alien-breakit-20261009.js — 75/75.
- Ontology: 50/50 validated (no header changes — bodies only).
- validate-data.js: CRASHES (TypeError at line 157, `get('events.json').forEach`
  — events.json isn't an array). Pre-existing: crashes identically on the main
  tree; unrelated to this change (no data files touched).

## Files changed
- src/js/game.js — villagerMealDay takes/gives recording; haven credit out of
  produced; villageEats dead skip + havenToday reset; freeloaderTick
  capacity-scaled drain gate; villageMeal takes recording; lastContrib haven
  field; resolveOneAssignment havenToday tracking
- src/js/alienPlayers.js — alien kill calls removeVillager(victim, 'killed')
- src/js/app.js — stash Render button, Make-pemmican counter button, wiring;
  "who's pulling weight" band includes haven credit
- scripts/test-break-food3-20261009.js — new proof test (46 asserts)

## Landing addendum (coordinator, 2026-10-09 ~11:00 CDT)

**Rebase, no conflicts.** Master moved during the worker run (sibling landings:
playtest explorer r3 975b5f8, villager gear 94fa7f7, socialite r4 7447b64 +
version bump 73e555d). Rebased the worker branch onto 73e555d cleanly; proof
suites re-run on the new base.

**Cross-loop regression hunt (the rebase caught this):** the layer-2 suite went
red on the new base — seeds 20261009 (2 fail) and 7 (4 fail), seed 99 green.
Root causes, all pre-existing on master, none from this worker's commit:

1. **G9/G2 test fragility (test bug, not game bug).** Sibling commits shifted
   the setup RNG stream, so the scholar now legitimately starts with
   `preservation_instinct` (+2 spoilage days) on some seeds. The engine is
   honest — stashClock/spoilClockShort and isSpoiled all honor the bonus (one
   boundary everywhere, layer-1 canon). The test asserted absolute clock
   strings ("spoils tomorrow", spoilDay=day means rot) assuming bonus=0.
   Fixed in the TEST per the proof-test RNG stability rule: G9 expectations
   now derive from the live `spoilBonusDays()`; G2's "past the clock" setups
   use spoilDay/day offsets relative to the live bonus.
2. **REAL KILL — H7. `villagerMealDay` crashed on unfed villagers when
   `v.health` was uninitialized** ("Cannot set properties of undefined",
   seed 7, empty pantry + low production hit the starvation write). The
   drifter r6 fix (fe459b6) had initialized `v.health` in `villageEats` only;
   `villagerMealDay` has direct callers and kept the unguarded
   `v.health[vid] = ...` write. Structural fix: `v.health = v.health || {}`
   at the top of `villagerMealDay`, next to the other ledger inits (same
   self-init pattern as `npcNeeds`). Sibling sweep: all other `v.*[vid]`
   writes in the meal chain are guarded; no further instances.

**Final regression state (rebased branch, all green):**
- food3 proof 46/46 × seeds 20261009, 7, 99
- layer-1 116/116 · layer-2 42/42 × 3 seeds (post test-robustness fix)
- villager-grit 22/22 · drifter-remote 27/27 · socialite r4 ALL GREEN × 3
- ontology 50/50 validated
