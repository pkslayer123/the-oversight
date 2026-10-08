# Break-it 3rd pass: alien players (2026-10-08 ~23:30 CDT)

Target: `src/js/alienPlayers.js` + `src/data/alienPlayers.json` + wires into
`encounters.js`, `contests.js`, `game.js`. Third adversarial pass — the first
two found and fixed 11 breaks (see `break-alien-players.md`). This pass went
deeper: lifeline paths end-to-end, group-chain bookkeeping, honesty on
unread copy, and a full dead-code sweep of every `ap*` export.

**Verdict: BROKE in 7 places. All fixed, all proven.**

Note on queue discrepancy: pass 2 wrote "Next target: 8 (audio)" but the
target index file read 7 — this run is the 3rd alien-players pass per the
authoritative queue.

Harness: full `src/js/*.js` eval in index.html order (minus DOM-only),
one shared resettable RNG installed BEFORE eval, window stubbed for eval
then deleted. Reused `scripts/break-alien-harness.js` from pass 1.

## What broke (7 catches, all fixed)

### 1. LIFELINE fired at VERDICT — cooldown wasted, copy lied, villager death erased (honesty/exploit)
`_contestVerdict` calls `apContestInterference(ac)` WITHOUT `{forPlayer:true}`.
The lifeline block gated only on `playerIn` (player in `ac.participants`) —
TRUE for the player's own contest reaching VERDICT. Before-proof: the
verdict-style call returned `deathSave=true` **82/200** and consumed
`lastLifelineDay` 82/200. Three harms: (a) the 7-day lifeline cooldown burned
on a non-death; (b) the note "the killing blow misses" announced when the
player wasn't dying (the verdict auto-resolves the player as 'lost'); (c) the
verdict honored `deathSave` for VILLAGERS — a hidden 40% roll converting a
real played death into 'lost', exactly the RNG-outcome-resolution Steve
banned ("contests are PLAYED, not RNG").
Fix: the lifeline block now requires `forPlayer`; the dead
villager-`deathSave` branch in `_contestVerdict` removed. After-proof:
0/200 fires, 0/200 cooldown burns.

### 2. ARENA deaths bypassed the lifeline entirely (honesty)
The lifeline guarded ONLY the phase-engine death path (`contestChoose` dmg).
Arena deaths (Blood pit/gauntlet/siege) go `tbEnd('lost')` → `playerDeath`
with NO lifeline check — the bonded ally's promise ("may save you from
death") never fired on the deadliest contest path. Before-proof: 0/60 arena
deaths saved.
Fix: `tbEnd`'s 'lost' branch (game.js) checks the lifeline when
`state.arenaContest` is active, BEFORE `playerDeath`. On save: health
restored to 10%, arena routing cleared (so `_contestArenaAfter` doesn't run
its death branch), contest ends 'lost' via `_contestEnd`. After-proof: saves
>0/60 and deaths >0/60 (the 40% design holds — not guaranteed).

### 3. Lifeline save left you at 0 HP — dead by morning (honesty)
The phase-path save ran AFTER `s.health` was set to 0; the next `endDay`'s
`health<=0` check then killed you ("the night"). A save that doesn't save is
a lie. Fix: the save restores 10% maxHealth (min 1) in BOTH the phase path
and the new arena path. ("The killing blow misses: you live — barely.")

### 4. Group chain skipped lastHuntDay — sporting-rule leak (exploit)
The `tbEnd` group chain called `apStartEncounter(nextPid)` for chained
personas but never recorded `lastHuntDay` — and neither did
`apStartGroupEncounter` for the first fighter. The sporting rule ("min 2 days
between hunts by the same persona") was bypassed: a chained rival could be
re-rolled by the single pool the next day. Before-proof: 6/6 chained/first
fighters had no `lastHuntDay`.
Fix: `apStartEncounter` records `lastHuntDay[pid]` on SUCCESS — the single
source of truth covering single rolls, group chains, and debug starts. The
roll-time pre-record (which logged hunts that never started when the fight
refused) removed. `scripts/test-alien-break-economy.js`'s sporting section
updated to model the production roll→start pairing. After-proof: 6/6 recorded.

### 5. apHasBeam vs beamNames — two beam lists, one lie (honesty/dead-code)
`apHasBeam(pid)` was documented as the "single source of truth for 'fields a
beam weapon'", but `apMaybeBeamAttack` kept its OWN parallel `beamNames`
table (`old_tam: null`) and never called `apHasBeam` — two lists that diverge
the moment a persona is added or Tam is armed.
Fix: `apMaybeBeamAttack` gates on `this.apHasBeam(pid)`; the table is display
names only (with a generic fallback). After-proof: source-gated + behavioral
(Tam 0/40 beams enraged; others fire).

### 6. Ability-kit ids invalid + false "fights like players" comment (honesty)
`pattern_recognition` (5 personas) and `forage_identification` (fenwick)
are NOT in the ability pool — and the comment claimed "these are real
abilities from the game's pool — they fight like players" while `tbAlienTurn`
never reads `fighter.abilities` at all. Doubly false.
Fix: replaced with real pool ids (`eagle_eye`, `eyes_in_back`, `third_eye`,
`night_eyes`, `evidence_board`, `taste_vision`) in BOTH `alienPlayers.json`
and the hardcoded fallback table; comment corrected to describe the kit as
flavor data, not engine input.

### 7. apFavor() dead — zero runtime call sites (dead code)
The getter existed only in the ontology header and old tests. Fix: the
module's three internal favor reads (`apCarePackage`, `apFeedMessage`,
`apContestInterference`) now route through `this.apFavor()`. The Alien
Players lesson applied: wired, not just claimed.

## What held (attacked, resisted — documented, not failures)

- **Lifeline farming bounds**: bond≥2 with a benevolent persona required
  (only Old Tam is benevolent+combat — bond means beating him twice), 7-day
  cooldown enforced (0/100 re-fires), 40% roll, benevolent-only. A save
  converts death→'lost' (no XP) — no infinite farm. 90-day economy sim from
  pass 1 still bounded.
- **apDeadDrop values**: 200–500 kcal, NO items, 1/3d gate — nothing to
  vendor, no infinite value. The <1500 kcal economy claim holds with margin.
- **Playground activation**: every action is a COST (villager kills, pantry
  raids, burns, trust sabotage); 1 activation/4 days, max 3 active. No
  cooldown bypass via group-chain or contest paths (neither touches
  `lastActivateDay`/`apActive`).
- **Favor negatives**: nothing buys negative favor — feed flavor at ≤-30,
  verdict rig at ≤-40 (both punishments, not rewards). No toggle exploit;
  decay pulls to 0.
- **Death mid-chain** (re-verified adversarially): `tbEnd('lost')` disperses
  `alienGroup`, records the loss, no chained fight into a corpse — 20/20.
- **Flee mid-chain**: disperses, no phantom chain — 20/20.
- **Stasis + death**: `apStasisFieldLive` requires a live fight AND the
  player's turn; the death flow never calls the barrier exit — no trap.
  Prior 42/42 stasis proofs re-green.
- **Persona death**: there is NO persona-death mechanic — personas are
  immortal by design (they're alien players; defeat ≠ death). No death state
  means no null crashes, no ghost personas, no codex contradictions possible.
  (The armor-salvage "from their body" is defeat flavor.)
- **Feed/gossip knowledge gates**: `apVillageGossip` names only `ap.known`
  personas; `apEventFeed`/`apFeedMessage` name human SLEEVE names pre-reveal
  (consistent with the codex showing the sleeve name — diegetic, as pass 1
  ruled), never title/species/disposition, never the word "alien" as a
  truth-claim. 30 seeded trials clean.
- **Contest-grab mid-fight**: contests fire from the dawn briefing, never
  mid-combat; save/load preserves `tbfight` (fighter snapshot keeps
  `alienPid`) AND `state.alienGroup` together — no stale chain after reload.
- **Sporting filter in both pools**: re-verified 10/10 (due-rival path +
  weighted pool + fallback).
- **Wren's missing combat lines**: she is non-combat by design
  (`combat:false`, excluded from `COMBAT_PILOTS`); `apCombatLine` returns null
  gracefully. Not a break.

## Sibling sweep

- **Same bug class (invalid ability ids in data) — FOUND, out of area.**
  `src/data/characterGen.json` has THREE invalid ability ids across 19
  occupation `granted` entries: `pattern_recognition` ×6 (emergency
  dispatcher, locksmith, HVAC tech, appliance repair tech, Beekeeper,
  programmer), `forage_identification` ×3 (Pharmacist, Wild food forager,
  Mushroom grower), `taught_hands` ×10 (Veterinarian, physical therapy aide,
  plumber, locksmith, mason, blacksmith, Beekeeper, Baker, Vintner, tailor).
  The consumers (`game.js:1783`, `ledger.js:745`) silently FILTER invalid ids,
  so these occupations grant FEWER abilities than character creation promises
  — a player-facing honesty bug in the character-gen system. NOT fixed here:
  choosing replacement abilities per occupation is content design outside the
  alien-players assignment. Flagged LOUDLY for the content/flesh-out loop.
- **Hidden death-conversion class**: `_contestResolveOthers` honors played
  deaths with no hidden rolls — clean.
- **Cooldown-on-action class**: every other alien cooldown (`lastRigDay`,
  `lastLifelineDay`, `lastDropDay`, `lastFeedDay`, `lastPackageDay`,
  `lastGossipDay`, `lastContactWarningDay`, `lastActivateDay`, `lastGroupDay`,
  `lastVillagerKillDay`, `lastRaidDay`, `lastBurnDay`, `lastDuelDay`,
  `lastPersonaPackageDay`) is set when the action FIRES, not when rolled —
  clean.
- **Beam-tech id class**: `stasis_field_plus`/`veteran_plate_plus` are
  constructed at runtime by `apProgressiveTech` and matched by the
  `tbBarrierExit`/`tbDamage` wraps — reachable, clean.

## Dead-code sweep (every ap* export, ≥1 runtime call site)

All 60+ exports verified with ≥1 real call site. Two findings, both fixed:
`apFavor` (0 sites → wired, §7) and the `apHasBeam`/`beamNames` duplication
(§5). Priority pass-2 additions all live: `apPersonas` (4), `apPersona` (39),
`apDeadDrop` (1), `apFeedMessage` (1), `apActive` (5), `apStasisFieldLive`
(1, tbBarrierExit wrap). `apAbilityKit`'s kit is flavor data carried on the
fighter — now honestly documented.

## Proof tests

New (this pass):
- `scripts/test-alien3-lifeline.js` — 7/7 (verdict-path silence, arena saves,
  farming bounds)
- `scripts/test-alien3-groupchain2.js` — 20/20 (chain lastHuntDay, death/flee
  dispersal)
- `scripts/test-alien3-honesty.js` — 13/13 (beam single-source, kit validity,
  apFavor wiring, feed/gossip gates)

Prior passes re-greened on the rebased tree (miser sibling moved master
mid-run; rebased cleanly, zero conflicts):
- test-alien-break-carepackage 21 · tech 42 · groupchain 28 · economy 10 ·
  beam 12 · test-break-alien-20261008 52 · test-break-alien-after-20261008 63 ·
  test-ap-encounter-20261008 55 → **283 green**

Pre-existing failures (verified identical on pristine tree, NOT this pass):
- `test-contest-break-2.js` (5 pass, 4 fail — outcome=null in its contest
  driver, fails without my changes)
- `test-break-contests.js` (61 pass, 2 fail — MOOT_JUDGE phase-graph +
  cheer/winOdds, fails without my changes)
- `test-alien-players-20261007.js` (crashes on `apPilotAffinity` — stale
  since pass 1)

Ontology validator: **50/50 systems validated, release permitted.**
`docs/ONTOLOGY.md` regenerated.

## Files changed

- `src/js/alienPlayers.js` — lifeline `forPlayer` gate + ontology rule
  rewrite; `apMaybeBeamAttack` gated on `apHasBeam`; `lastHuntDay` recorded
  in `apStartEncounter` on success (roll-time pre-record removed); ability
  kit id fixes + honest comment; 3 favor reads wired through `apFavor()`
- `src/js/contests.js` — dead villager-`deathSave` branch removed;
  lifeline save restores 10% HP (phase path)
- `src/js/game.js` — arena lifeline check in `tbEnd` 'lost' branch
- `src/data/alienPlayers.json` — 6 kit id replacements
- `docs/ONTOLOGY.md` — regenerated by validator
- `scripts/test-alien3-lifeline.js`, `test-alien3-groupchain2.js`,
  `test-alien3-honesty.js` (new)
- `scripts/test-alien-break-economy.js`, `scripts/test-break-alien-20261008.js`
  (updated to the fixed behavior)
