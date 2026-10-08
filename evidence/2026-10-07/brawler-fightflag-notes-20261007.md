# Per-fight brawler flag leaks — audit + fix notes (2026-10-07 ~21:50 CDT)

Backlog item (run 2128): per-fight flag leaks — `rageActive`, `tradeOpen`,
`debtSettled`, `shakeOffUsed` "and any siblings". Audited against pristine
HEAD bytes (git archive, /tmp/w-fightflags); fix delivered as unified patch
(no commits by worker — coordinator commits).

## Per-flag verdict

| Flag | Set (abilityActions.js) | Consumed/checked | Reset pre-fix | Leak? | Fix |
|---|---|---|---|---|---|
| `rageActive` | `:909` unleash_rage | `:377-381` strike dmg ×2/round | startCombat delete | **YES** — uprising/betrayal fights bypass startCombat; +100% dmg leaked in free | resetPerFightFlags() called from both bypass sites |
| `tradeOpen` | `:784` open_trade | `:364-368` strike +50% ×3 | startCombat delete | **YES** — same bypass | same |
| `debtSettled` | `:800` settle_debt | `:791` "once per fight" gate | startCombat delete | **YES** — leaked `true` made Settle the Debt refuse in the next uprising/betrayal fight | same |
| `settleDebtBonus` | `:802` settle_debt | `:370-374` flat bonus | startCombat delete | **YES** — free banked damage | same |
| `braceActive` | `:811` brace | defense mods | startCombat delete | **YES** — free 60% DR | same |
| `shakeOffUsed` | `:822` shake_off | `:818` "once per fight" gate | startCombat delete | **YES** — leaked `true` made Shake It Off refuse | same |
| `haymakerReady` | `:899` throw_haymaker | `:350-358` 2.5× on next strike | startCombat delete | **YES** — banked 2.5× swing | same |
| `haymakerOffBalance` | game.js `:19158` (whiff) | game.js `:19989` (next incoming hit) | startCombat delete | **YES** — leaked whiff penalty | same |
| `fightDamageTaken` | game.js `:20162` (real dmg) | `:795` settle_debt ledger | startCombat `=0` | **YES** — dishonest ledger: settle debt for LAST fight's damage | same |
| `aimBonus`/`deadAimShot`/`ambushReady`/`ignoreArmorNext`/`noDodgeNext`/`cleanShotReady` | hunter abilities | strike path | startCombat delete | **YES** — same bypass | same |
| `frenzy` | removed 2026-10-07 (`:906` honesty comment) | nothing | n/a | NO — dead flag, nothing reads it | none |
| `fightRead` | `:977` read_fight | speed bonus | intentionally NOT cleared | NO — design: banks +2 speed for NEXT fight when used out of combat | none (proof P7 locks this) |
| `layWaitActive` | `:723` lay_wait | game.js `:7461` checkAnimals | intentionally NOT cleared | NO — design: holds for next animal encounter, consumed by checkAnimals | none (proof P7 locks this) |
| `second_wind` | n/a (once-per-DAY via `secondWindDay`, game.js `:25775`) | maybeCheatDeath | day-scoped | NO — not per-fight | none |

## Root cause

`startCombat` (game.js) already had a full hygiene block. But two fight
entry points build `this.tbfight` **directly**, bypassing it:

- `startVillageUprising` (justice.js `:611`) — uprising fight
- `startBetrayalCombat` (party.js `:617`) — party betrayal fight

(`party.js:950` wraps `startCombat` via `origStartCombat`, so monster fights
with party members were fine. `game.js:5170` is a combat *restore* from save
— same fight continuing, correctly not reset.)

## Fix (patch: /tmp/patch-fightflags.patch)

1. game.js: extracted the inline hygiene block into `Game.resetPerFightFlags()`;
   `startCombat` now calls it (behavior unchanged on that path).
2. justice.js `startVillageUprising`: calls `this.resetPerFightFlags()` right
   before building the fight.
3. party.js `startBetrayalCombat`: same.
4. Ontology: validator run — 46/46 systems green; docs/ONTOLOGY.md byte-identical
   (no header changes needed; validator is one-directional on `provides`).

## Proof

`scripts/test-brawler-fightflag-reset-20261007.js` — seeded (mulberry32,
default SEED=7, SEED env override), full 40-module harness (index.html order
minus app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js; window stub for
eval only, deleted before play), REPO_ROOT env override.

| Run | Result |
|---|---|
| Fixed extract, SEED=1 | 60/60 green |
| Fixed extract, SEED=2 | 60/60 green |
| Fixed extract, SEED=3 | 60/60 green |
| Pristine HEAD, SEED=1 | P1/P4/P5/P7 pass; P2+P3 fail — all 15 flags leak on both bypass paths (30 fails) |
| Pristine HEAD, SEED=2 | same |
| Pristine HEAD, SEED=3 | same |

P1: startCombat clears all 15 flags (regression lock). P2/P3: uprising and
betrayal fights now clear them (the leak). P4: flags are live mechanics —
while set, shake_off and settle_debt genuinely refuse (so the leak had real
effect). P5: abilities usable again post-reset (action surface restored).
P6: back-to-back fresh fights have identical flag snapshots. P7: fightRead /
layWaitActive survive the reset (design intent locked, not a leak).

Turn hygiene: one real `tbPlayerStrike` + endTurn-only-if-still-player's-turn
per the AGENTS.md lessons; fighters kept on interior tiles (1..7); never
advanced after `tbPlayerWait`.

## Deliverables (nothing committed, nothing pushed)

- `/tmp/patch-fightflags.patch` — complete fix vs pristine HEAD bytes (game.js,
  justice.js, party.js; `patch -p1 --dry-run` verified clean).
- `scripts/test-brawler-fightflag-reset-20261007.js` (NEW, repo tree).
- This notes file (NEW, repo tree).
