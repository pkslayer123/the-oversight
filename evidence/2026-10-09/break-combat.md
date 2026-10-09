# Break-it: combat engine — round 1 (2026-10-09)

Hostile pass over the tactical combat core (`src/js/game.js` tb*), field fights
(`src/js/fieldFights.js`), and the ability-damage paths. Proof:
`scripts/test-break-combat1-20261009.js` — 13/13 AFTER (seeds 20261009, 1, 7, 99);
BEFORE=1 detects all 5 breaks. Ontology 50/50.

## KILLS

### C1. HONESTY: every stated damage number lied (copy vs engine)
`tbPlayerStrike` composed "You STRIKE x for D" from the pre-`tbDamage` number,
but `tbDamage` applies monster-state modifiers AFTER: turtle bunker ×0.15,
boar winded ×1.5, voice-mimic reveal ×1.5, flyer grounded ×1.5.
Measured: stated 9 / applied 1 (bunker); stated 23 / applied 35 (vm reveal).
**Fix:** `tbDamage` now returns the applied damage; the strike line, the
understudy's learned damage, and the drama number all use what landed.
**Sibling sweep (same class — stated-before-applied):** shrapnel, beam sweep,
duck train bites, duck contact bites, terraform paper/leased/shadowed/scorch,
duck nips, moderator rent — all now resolve via `tbDamage` first and state the
landed number. (Betrayal ambush's `(${dmg})` checked: narrative path, no
`tbDamage`, stated == applied — honest, untouched.)

### C2. EXPLOIT: fieldFight vs an already-dead world monster paid full rewards
A `vFlee` round can coincide with the lead falling, so the world keeps a 0-hp
monster entity. The next `resolveWildMonsterEncounter` ran `fieldFight` on the
corpse → `vKill` (1 round, 0 taken, 0 dealt) → full cheer, +trust, hero deed.
Trust/deed farming off a body.
**Fix:** `fieldFight` early-exits `alreadyDead` (0 rounds, honest log);
`resolveWildMonsterEncounter` removes the monster with no cheer/trust/deed;
`fieldFightSummary` names it honestly ("old news, not a kill").
Contest callers pass `m=null` — unaffected.

### C3. EXPLOIT: startCombat() mid-fight silently clobbered the live fight
No guard — a second call rebuilt fighters from stale `scholar.health`:
measured player HP 37→200 (a free heal), monster 5→45 (wounds erased).
**Fix:** refuse loudly when a fight is live ("Already in a fight — finish this
one first"). Audited all callers: `monsterTurn` bump/trap paths are gated by
`!this.tbfight` at every `tickAction`/caller; door-flee re-engage and contest
arena waves run after `tbEnd`; betrayal entries guard `tbfight` themselves.
Four sibling test harnesses depended on the clobber (their `setupFight`s);
updated to close live fights honestly first
(test-aggro-audio-hooks, test-audio-break-honesty, test-declare-audio,
test-audio-w2freakiness — all back to their HEAD-green counts).

### C4. DEAD CODE: contestEngine checked `rec.outcome === 'standoff'`
`fieldFight` never returns `'standoff'` — stale contract from an older
version. Removed the dead branch.

### C5. DEAD CODE + MOVEMENT: 2x2 monsters couldn't step E/S/SE
`tbMoveFighter` ("Multi-tile monsters MUST use this") had **zero callers** —
the Alien Players lesson class. Worse, the live step callbacks excluded only
the mover's TOP-LEFT tile from `tbBlocked`, so a 2x2 bulldozer/moderator's own
body "blocked" east/south/southeast steps: measured 5/8 neighbor targets
available; E/S/SE refused by self-collision. (The bulldozer's charge masked it
in live play.)
**Fix:** the three step `blocked` callbacks (monster approach ×2, villager AI)
now use `!this.tbCanOccupy(m, x, y)` — whole-footprint validation; the dead
`tbMoveFighter` removed (contract lives in the callbacks; ontology header
updated). **Sibling sweep:** charge landing (`m.mx = last.cx`) also
single-tile-validated — now `tbCanOccupy`. Checked all other direct-assignment
moves: hummice scatter, belltoad hop, moth-light pull are size-1 movers;
flyers all size 1 (air callback fine).

## HELD (attacked, resisted)
- H1: `tbEnd('won')` double-fire pays once (`f.over` guard) — corpse count 1.
- H2: striking dead/fled targets refused honestly, turn NOT spent.
- H3: `useAbility` with insufficient kcal refused before payment (nothing
  paid, turn not spent); with sufficient kcal pays exactly and spends the turn.
- H4: one strike per turn (`p.acted`). (Test note: Patient Aim's round-1
  double can one-shot a bulldozer — legit passive, not a bug; the test now
  uses a 500-hp target.)
- Turn economy: ability `cost.turn` routes through `spendCombatAction`
  (sets `acted`, advances). Ability XP granted after dispatch only.
- Betrayal fight entries (`npcBetrays`, `playerAttacks`) both guard `tbfight`.
- Dead-code audit: every `src/js/**/*.js` file is in index.html's script list;
  `tbAdvanceAsync` (browser path), `fieldFightSummary`, `tbPlayerFlip`,
  `tbTerraform`/`tbTerrainCost`, `fighterSize`/`fighterTiles`,
  `tbCanOccupy`, `tbMonsterReach`, `tbLearnPattern`, `tbSnakeSplit`,
  `tbVillagerFalls`, `combatWitnessReact` all have live callers.

## Regressions run
test-break-combat1 (13/13 ×4 seeds), aggro-audio (27/27),
audio-break-honesty (21/21), declare-audio (15/15), w2freakiness (258/258),
persistence 1/2/3 (all pass), brawler-adversarial (15/15), monsters4-flip
(18/18), ambush-noDodge (17/17). Pre-existing failures NOT mine (identical at
HEAD): audio-leftover-decisions 3 (nightcourtTurn hook), betrayal-aftermath
crash (subset harness missing statusEffects), brawler-actions-fixed (needs
/tmp/aa-fixed.js).

## Files changed
- `src/js/game.js` — tbDamage returns applied; strike/shrapnel/beam/duck/
  terraform/nips/rent state landed numbers; startCombat mid-fight guard;
  alreadyDead routing; footprint step callbacks; charge landing; tbMoveFighter
  removed.
- `src/js/fieldFights.js` — alreadyDead early exit + summary + ontology rule.
- `src/js/contestEngine.js` — dead standoff branch removed.
- `docs/ONTOLOGY.md` — auto-regen (1 line).
- `scripts/test-break-combat1-20261009.js` — new proof test (13 checks).
- 4 sibling test harnesses — setupFight closes live fights first.
