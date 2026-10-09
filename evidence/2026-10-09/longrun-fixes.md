# Long-horizon fixes B1–B6 + F1 risk tolerance (2026-10-09)

Steve's correction on F1 is load-bearing: **"It's not like we are trying to
produce death packs, we just want logical item continuity."** No death quota,
no death-rate tuning. F1 is purely about believable villager behavior. Death
packs are where gear logically ends up — item continuity, not a production goal.

## B1 — playerDeath death-pack inversion (ledger.js) — FIXED
Was: corpse received ONLY the sentimental items (via `items: keepsakes`), and
the non-sentimental gear stayed in `s.inventory`, auto-transferring to the
successor. Double violation: sentimentals were lootable, real gear transferred.
Now: the corpse gets the non-sentimental inventory + equipped gear as the
lootable death pack (shaped like generatePossessions entries); sentimentals are
dropped entirely (die with the owner, never placed, never lootable); the
successor's inventory is rebuilt from their OWN kit (`newChar.items`), bonded
to them.

## B2 — empty sapient death pack (corpses.js) — FIXED
Was: a gearless sapient corpse fell through the villager branch into the
generic practical pool + a random keepsake — inventing possessions for a person.
Now: `return items` after the villager branch, so a gearless sapient corpse is
an empty death pack. (Monster/animal generic pools untouched.)

## B3 — recipe knowledge wiped on save/load (engine/state.js, game.js) — FIXED
Was: `newCodex()` initialized `recipes: []` while every consumer treats it as a
string-keyed object; named props don't survive `JSON.stringify`, so knowledge
wiped every save/load. Now: `recipes: {}` + a load-time migration in
`Game.load()` that copies named props off old array-shaped saves and normalizes
to an object.

## B4 — crafting UI hid L1/L2 (app.js) — FIXED
Was: inventory crafting filtered `level >= 3`, hiding the real L1 (35% blind)
and L2 (85%) paths. Now: shows L1+ with honest button labels — L1 "Make (35%
blind — materials at risk)", L2+ "Make (85%)"; L0 still hidden (never seen =
no button, per "button honest").

## B5 — armor never retrieved (game.js villagerGearUp) — FIXED
Was: gear-up fetched weapons from own stash + deposited armory but never armor.
Now: mirrors the weapon logic for best-owned armor (by `def.armor.protection`,
only if better than currently worn), from the villager's PERSONAL stash only.
Nobody else's stash touched. (Armor isn't a depositable stash section —
weapons/medicine only — so there's no communal armor pile; noted, not built.)

## B6 — no pharmacy branch (game.js villagerHealCheck) — FIXED
Was: hurt villagers went straight to healer or rest. Now: before the healer, a
hurt (<70% HP) villager consumes deposited pharmacy medicine — the smallest
dose covering the deficit (no surgeon's-kit-on-a-scratch) — narrated, ledgered
via stashLog. Falls back to healer, then rest.

## F1 — risk tolerance: behavior rules (fieldFights.js, game.js)

Flee is now a SITUATIONAL decision, not a flat HP line. Rules, in order:

1. **Trajectory assessment** (from round 2): `rtk` = rounds to drop the pack
   lead at the observed damage rate; `rtd` = rounds until the villager drops.
   - `winning` = rtk <= rtd * 1.1 → **commit**: flee only at the 5% floor.
   - `hopeless` = rtd < rtk * 0.6 → they'd drop long before the lead falls.
2. **Hopeless + allies near → party up, not scatter.** One ally answers per
   fight: shouts in the log, strikes the lead for [3,6]/round (a second pair of
   hands, off-balance — a new combatant, NOT a buff), draws ~40% of pack hits,
   70 HP, no armor (exposed). If the ally goes down: real wound via
   hurtVillager(30); if still hopeless → immediate believable flight.
3. **Hopeless + alone → flee** at the modified threshold. Self-preservation,
   not suicide.
4. **Threshold modifiers** (on the old bravery/temperament base): armed −0.08
   (trust the gear), allies −0.04 each (max −0.12), post-day-7 −0.08 ("maybe
   die today or definitely die tomorrow" — the System taught them the waves
   only get harder). Clamped [0.05, 0.6].
5. **No damage/stat changes.** Villager strike is verbatim `lroll([4+wb, 8+wb])`
   (wb = their real gear bonus); armor absorption unchanged. "Hand to hand is
   supposed to be hard" stands.
6. **Wiring:** `resolveAssignments()` snapshots the outdoor crew (patrol/scout/
   hunt/forage — they're out in the wild together); `resolvePatrol` and
   `resolveWildMonsterEncounter` pass `{allies, allyVids}` into fieldFight.
   Contests pass none (televised solo).

## Proof results

- `scripts/test-fix-longrun-20261009.js` (B1–B6): **25/25 × 3 seeds**
  (20261009, 7, 424242).
- `scripts/test-f1-risk-tolerance-20261009.js` (F1): **9/9 × 3 seeds**,
  128 fights per seed (armed/unarmed × 4 monsters w1+w2 × day 3/10 × 0/2 allies):
  - winnable fights: rarely flee (1)
  - flees correlate with hopelessness (2a)
  - 7–10 fights/seed held under 30% HP without fleeing — past the old typical
    break line (2b: commitment, not scattering)
  - hopeless + allies → call for help (3)
  - hopeless + alone → flee, not suicide (4)
  - strike formula verbatim; unarmed dpr in the [4,8] band (5a/5b)
  - post-day-7 breaks at lower HP than pre-day-7 (6)
  - patrol wiring passes outdoor crew as allies
- Deaths observed (reported, NOT targeted): 0/128, 0/128, 0/128 across seeds —
  these monster picks mostly end in mFlee/vFlee; the engine no longer *forces*
  flight, which is the behavior change. Death packs remain reachable through
  real combat (vDie path untouched).
- Regressions: villager-gear 26/26, food3 46/46, field-fights 24/24 (Highbeam
  Deer benchmark holds: 0 solo kills in 100), knowledge-playtest 4/4,
  ontology 50/50.
- Pre-existing, unrelated: `test-brawler-corpse-loot-20261006.js` errors with
  `seTickFighter/seMoveMod is not a function` identically on pristine master
  (stale harness, not this work).
