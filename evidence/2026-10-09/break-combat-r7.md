# Break-it: combat engine — round 7 (2026-10-09)

Hostile pass, fresh ground only. Rounds 1–6 vectors NOT re-attacked; their
suites re-ran green (break-combat6 21/21, r3-honesty 18/18, r3-async 21/21,
ontology 50/50). Proof: `scripts/test-combat-r7-20261009.js` — 29/29 AFTER
on seeds 20261009, 1, 7, 99. BEFORE=1: 12 checks fail on stashed pre-fix code.

Canon: docs/CANON.md read first; combat has no dedicated canon doc beyond
CANON.md's standing rules (said-vs-engine honesty, monsters-fought-not-rolled,
knowledge gating). Nothing invented.

## KILLS (broke + fixed, all with proof)

### F1. EXPLOIT/DATA-LOSS: mid-betrayal-fight save/load erased the betrayer and "won" the fight
Autosave fires every 30s + on tab-hide, mid-combat included — this hit real
players, not just save-scummers. Two compounding defects in the combat
persistence path (game.js):
1. `syncRun()` snapshotted only `id/fighters/turnIdx/round/order/terraform/
   pendingPack` — the person-fight flags (`betrayal`, `betrayer`,
   `aggressor`, `playerFled`) were dropped.
2. `load()`'s phantom-fighter drop (`(kind==='monster'||kind==='hostile') &&
   !mdef`) deleted every hostile fighter — betrayers, uprisers, alien
   players — because people carry no mdef to reattach.

Net effect, verified on pre-fix code: reload mid-betrayal → hostile dropped
with "Something that was in the fight is gone" → `f.betrayal` undefined →
party.js tbEndCheck wrapper can't recognize the fight → falls through to
`origTbEndCheck` → no monsters → `tbEnd('won')` → "WINNER! Style score",
`combatWins++`, `leadShift('force', 1)` — a free win for a person-fight you
never finished, with no murder aftermath, no corpse, no justice heat, and the
betrayer still in the village.

**Fix (game.js):** syncRun persists `betrayal/betrayer/aggressor/playerFled`;
load() only def-drops `kind==='monster'`; hostiles reattach by identity
(villagers by roster, alien players by persona — a hostile whose person is
gone from the world IS dropped, honestly); the rebuilt tbfight carries the
betrayal flags; `_lastBetrayal` is rebuilt from the restored fight so
`betrayalAftermath` still resolves (gossip, trust, unsolved murders).
Post-fix the reload resumes the real fight: killing the betrayer routes to
`betrayal_won` with the kill narration, loot-as-action on the corpse, and
the full aftermath (verified end-to-end in T1i).

### F2. HONESTY: War Cry's "All enemies" skipped hostiles (F7 copy class)
`war_cry.bellow` filtered `m.kind !== 'monster'` — in a betrayal fight the
bellow hit nobody and ate the turn. Loom already established the precedent
(hostiles hesitate), and hostile turns run through `tbMonsterTurn`, which
consumes stun exactly like monsters. **Fix:** the filter now covers
`monster` + `hostile`. (Hostiles never flee from it — the skittish branch
needs an mdef, and the copy only promises beasts flee.)

### F3. HONESTY (copy): Read the Fight "before it starts" (F7 class)
The action is combat-only context (r6 F6, deliberate) — but the effect and
ability description still said "Read the fight before it starts." **Fix:**
copy now reads "Read the fight as it moves." Pre-fight wiring stays a
content-run decision (r6 note stands).

### F4. HONESTY (copy): Menace promised +intimidation and −trust, delivered neither (F7 class)
`fear_aura.menace` copy: "+intimidation in this conversation, −trust
afterward." Exhaustive grep: no convo code reads any intimidation flag, and
no code path applies the trust hit — both promises were write-only, and the
button shows on the main screen even with no conversation running. **Fix:**
copy now describes what the action does (social weight, no mechanical edge);
impl say line dropped the "(−trust afterward.)" fiction. Real menace wiring
(convo intimidation checks, targeted trust cost) is content-run work — noted
below, not invented here.

### F5. HONESTY (copy): Refuse Death "gain 500 kcal" (F3 stated-before-applied class)
`maybeCheatDeath` does `s.kcal = Math.max(s.kcal, 500)` — a top-up to a
floor, not +500. At 3000 kcal you gain nothing while the copy says "gain."
**Fix:** copy now says "brought up to at least 500 kcal." No engine change.

### F6. HONESTY: villager Help stated "+12 HP" even when the cap ate most of it (F3 class)
`tbVillagerTurn` help: `t.hp = min(maxHp, hp+12)` then said "+12 HP" — a
nearly-full target gained 3 while the line claimed 12. **Fix:** the line
states the actual healed amount.

## HELD (attacked, resisted)
- **tbEnd string census (all 8):** `won/lost/fled/routed` handled in
  game.js tbEnd; `betrayal_won/betrayal_routed/betrayal_yielded` handled in
  the party.js wrapper; `calmed` unhandled but ends cleanly via the
  try/finally (r6 note confirmed; in a betrayal fight the wrapper's trailing
  `_lastBetrayal` aftermath still fires — social consequences land).
- **XP sources:** `gainAbilityXP` fires only after dispatch returns non-false
  (refused/fizzled actions pay nothing — the r3 hunter fix holds); capped at
  L3 (10/25 XP); no combat XP anywhere; fled/routed pay knowledge
  (`identifyMonster`) only. Practice-by-use is bounded grinding, not an
  exploit.
- **Betrayal wound-stash (r6 F5) across save/load:** hostile at 5 HP → save →
  load → still 5 HP (T1g); flee → stash 5 → re-engage at 5, not flat 40
  (T9). Rewards pay once per kill (tbEnd over-guard; one corpse, one loot).
  Flee-heal-return carries real social costs (gossip/trust/journal), not a
  free loop.
- **The 4 unwired data-actions** (scream/pocket_sand/leech_stance/walk_in):
  fail fast pre-cost with "(X isn't wired up yet — the data defines it but
  the code doesn't. This is a bug, not a feature. Nothing spent.)", turn
  kept (T8). Correction to the r6 note: scream's FUNCTIONALITY is wired —
  the combat bar's Scream verb (`tbPlayerScream`, 1/day, stuns monsters)
  requires the ability; only the data-action entry point is dead. Same for
  pocket_sand's passive opener (`blind: hasSand ? 2 : 0` at fight start —
  live, consumed in tbMonsterTurn). leech_stance and walk_in are fully dead.
- **F1 sibling sweep (write-only flags):** `cleanShotReady` (consumed in
  encounters.js huntAnimal), `layWaitActive` (game.js:7887),
  `pushThroughParts` (game.js food-poison rolls + advancePart tick),
  `bloodPriceDayPart/Uses` (ledger reset + game.js) — all have live
  consumers. `m.hesitate`/`m.blind` in tbMonsterTurn: NOT dead — armed by
  the fear_aura/pocket_sand passive openers in startCombat (`hasFear ? 1 :
  0`), consumed per-turn. Villager fight flags (`helped`) and fieldFights
  records clean.
- **tbMonsterTurn behavior branches:** all 4 registered preTurnHooks
  (antlerThrash, turtleBunker, humSwarmCheck, droneCrowdOverload) have
  implementations; the behavior table covers 28/30 monsters —
  giant_mosquito and alien_tick lack entries, but the table is documentary
  (aggroRange/preferredRange/fleeAt unread) and missing entries degrade to
  no-hooks, so this is a documentation gap, not dead code. The old
  `behavior` string field (territorial/pack/drifter/...) is still read by
  `stanceFor` — live data, not a fossil.
- **War-cry/loom vs fearless:** `stare_down` honors fearless immunity and
  its 50% base (+intimidate modifier, capped 95%) matches copy. Loom's
  "loses its next round" = loses its next turn = its round (one action per
  round) — honest.
- **Haymaker tradeoff chain:** accPenalty consumed in tbPlayerStrike,
  off-balance kills dodge on the next incoming hit, per-fight hygiene
  clears — fully wired.
- **Settle the Debt:** tracks post-armor post-brace real damage; the
  voluntary 10 HP from Open the Trade routes through addHealth, NOT
  tbDamage — no self-damage inflation of the ledger.
- **Calm on hostiles:** the precheck excludes monster/player/villager but
  NOT hostile — Calm can end a betrayal fight via 'calmed'. Handled
  gracefully (aftermath runs, social consequences land); whether animal_ken
  SHOULD calm people is a design call, left for Steve.

## Regressions
test-combat-r7 29/29 ×4 seeds (20261009, 1, 7, 99); test-break-combat6 21/21;
r3-honesty 18/18; r3-async 21/21; ontology 50/50.

## Content-run candidates (not break-it fixes)
- Real menace wiring: convo intimidation checks + targeted trust cost.
- Pre-fight Read the Fight (UI placement + cost design; r6 note stands).
- The 2 fully-dead combat actions: leech_stance, peacemaker walk_in
  (scream/pocket_sand functionality already exists via other paths).
- giant_mosquito/alien_tick behavior-table entries (documentary).
- Calm-vs-hostile: intended or not?

## Files changed
- `src/js/game.js` — betrayal flags persisted in syncRun; hostile fighters
  reattach by identity on load (no more mdef-drop); betrayal flags +
  `_lastBetrayal` rebuilt on restore; villager Help states actual healed HP.
- `src/js/abilityActions.js` — war_cry.bellow covers hostiles; menace say
  line honest.
- `src/data/abilities.json` — read_fight, menace, refuse_death copy honesty.
- `scripts/test-combat-r7-20261009.js` — new proof (29 checks).
