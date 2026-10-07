# Glasswing dive + Sunbasker bask — play-as-player audit (Worker B, 2026-10-07)

Audit base: `2275cc125915e549e17a737f133bfd361d95bdb5` (master), engine read from
pristine `git archive` tree — never the dirty worktree. Proof script:
`scripts/play-feel-20261007-glasswing-audit.js` (run with
`GAME_SRC=<pinned-tree> AUDIT_SHA=<sha>`). **146/146 checks green on seeds 7,
42, and 123.**

## Verdict

**Yes, dive and bask both work, and the loop is playable and enjoyable — with
one live-breaking blocker found during setup (not in the dive/bask code itself)
and a short engine-owner backlog below.** As a player:

- **Glasswing dive** reads as a complete trick: circling dread → shadow declare
  ("one turn to move") → dodge → crash → grounded punish window → kill or it
  escapes. The counterplay is *positioning*, and the shadow (not the bug) is
  the fight — exactly as designed.
- **Sunbasker bask** is the mirror image: the counterplay is *pressure*, not
  positioning. Ignore it and the bite scales 8–14 → 16–22 → 20–26; hit it every
  turn and the charge never builds. The bite tracks (undodgeable, stated
  honestly), so the decision is real every round. Distinct from the dive, which
  is the point.
- **Knowledge gating holds**: fresh encounters get dread ("A shadow crosses the
  ground — growing fast. Something is falling out of the sky." / "Its scales go
  molten gold."), taught encounters get coaching ("MOVE", "hit it NOW and the
  charge dies"). First-contact intros leak nothing; the knownCue lines land only
  at observed/slain.
- **No silent turns**: every monster round in every scenario produced narration;
  every player action got feedback. All 8 dive/bask audio hooks fire live AND
  map to app.js synths.

## What was played (per-mechanic findings)

1. **Exploration dive trap (HIT)**: within 5 tiles the darter vanishes ("The air
   feels wrong…"), the shadow escalates faint → darker over 2 ticks, then
   resolves: 20–30 damage if you stood still, combat starts with the darter
   GROUNDED (3 ticks granted, 1 burned on its opening turn = 2 player strikes,
   matching the design comment).
2. **Exploration dive trap (MISS)**: move >1 tile off and the shadow "hits empty
   dirt where you were" — no combat, the ambush is spent, the darter is gone
   from the world. **Design note**: this means the ONLY way to fight a wild
   glasswing is to eat the 20–30 trap hit — the mDist≤5 vanish check precedes
   the mDist≤1 bump-to-combat check, so there is no walk-up fight. (Intended
   "gotcha" design, but Steve should confirm the no-fight-on-dodge is desired;
   currently a dodged ambush also means no loot/meat.)
3. **In-combat dive**: circle (out of spear reach, honest "out of reach" line) →
   dive declared on the player's tile, `turnsLeft: 1` → dodge → miss → grounded
   2 turns with the +50% "Wings tangled" line → a single good spear strike
   (38–45 observed) usually kills it outright, which the design comment
   explicitly blesses ("one good strike often lethal — the window is real, not
   a formality"). Fail to kill and it climbs screaming back into the sun — gone,
   not circling for another pass. Stand still instead and Skyfall Dive lands for
   10–16 (within the data's [10,16]), then it snatches and climbs ~4 tiles away.
4. **Bask ignored**: charge 0→1→2→3 (cap 3 holds), bite declared at 2 as a
   tracking direct telegraph with honest damage [16,22] at charge 2, landed 19–21,
   charge spends on resolve ("dull brown again, already tilting back toward the
   sun"), loop restarts. Basking scorches the tile (terraform observed).
5. **Bask pressured**: charge never reached 2 across all seeds; every hit
   knocked the charge out with narration ("knocks the sunlight out of its
   scales" / "the gold flickers and dies") + `baskBreak` audio. The sunbasker
   died in 2–3 spear rounds without ever biting — correct, and the intended
   reward for pressure.
6. **Flatten**: at night it flattens ("The sun is gone — and so is the fight in
   it"), builds no charge, dies in 2–3 hits. `tbInShade` unit-checked: true
   orthogonally-adjacent to a tree, false in open grass.
7. **Grid contracts**: `glasswingTrapCells()` (tile + 8 splash), `gwDiveShadow()`
   (circle/dive phases), `sbHeatKeys()` (charge halo) all live and well-shaped
   during the relevant phases. (Pixels belong to the app.js renderer — verified
   contracts only, not rendering.)

## Engine-owner backlog

1. **BLOCKER — live combat is broken at HEAD (stale-base revert, found during
   harness setup)**: version-bump commit `6618925` (2026-10-07 18:21 UTC) was
   built from a stale base predating `59ebdb3` and **dropped the
   `<script>` tags for `src/js/abilityActions.js`, `src/js/monsterBehaviors.js`,
   and `src/js/statusEffects.js` from index.html**. `tbMonsterTurn` calls
   `this.seTickFighter(m)` unguarded → `TypeError` on the first monster turn of
   every combat. (`mbRunPreTurn` is `&&`-guarded so monsterBehaviors degrades;
   abilityActions.js is currently unreferenced elsewhere, so statusEffects is
   the live-breaker.) Repair: re-add the three tags after `ledger.js`
   (order per `4174d39:index.html`: ledger → abilityActions → monsterBehaviors
   → statusEffects → villager-agency), bump, push, verify live version.json.
   This is the exact STALE-BASE REVERT class from AGENTS.md.
2. **Dead modifier** `m.gwDive`: written once (`game.js:22700`, circle init),
   never read anywhere — the dive runs on `m.telegraph` + `m.beamPhase`.
   Delete it or wire it up. (Proof script allow-lists it as known backlog.)
3. **Dead escalation text**: `gwTrapTick`'s darkness array
   `['faint','darker','almost black']` — the resolve fires at `turns >= 3`, so
   the else branch only ever renders indices 0–1. 'almost black' never displays.
   Either resolve at 4 ticks or trim the array.
4. **Text-vs-engine**: codex `slain` stage and `weaknesses` both say "vulnerable
   1 turn" / "vulnerable for a turn" after a missed dive, but the engine grants
   `gwGrounded = 2` → **2 player strikes** (explicitly intended per the design
   comment). Text should say "two strikes" — engine is right.
5. **Text-vs-engine (needs Steve's call)**: the exploration trap hits for
   **20–30 direct** (8–14 splash) while the telegraphed in-combat Skyfall Dive
   is **[10,16]**. The ambush is ~2× the named attack with no damage telegraph
   in the wild. Intended ambush premium, or should the trap match [10,16]?
6. **Audio worker backlog** (informational, no-ops by design): `telegraph`,
   `round`, `impact`, `humRise` are fired engine-wide but have no app.js synth
   yet. All 8 dive/bask hooks are mapped.

## Sibling sweep (bug classes from earlier audits)

- **Nightcourt redive flags** (`ncRedove`/`ncWasRedive`): checked, NOT a bug —
  two-phase handoff (miss sets pending `ncRedove`, declare transfers to
  `ncWasRedive`), the second dive re-aims correctly.
- **Sunbasker charge-spend**: already fixed 2026-10-05 (was dead code in the
  non-direct branch); verified live — charge spends on resolve, bite re-reads
  surviving charge at impact.
- **Nevermore (`nmGrounded`) / statickite (`skDip`)**: grounded/dip flags are
  written and consumed in their aftermath branches — no dead modifiers.
- **Silent turns / unconsumed modifiers / text-vs-engine**: swept across both
  mechanics; findings are items 2–5 above. Nothing else in the dive/bask
  surface.

## Caveats

- Node harness, not a real browser: grid *contracts* verified, pixel rendering
  not. Audio verified as fired+mapped, not heard.
- Player was buffed (500 HP, agi 5, spear) to isolate mechanics; TTK numbers
  (1-shot grounded darter, 2–3 round sunbasker) reflect that, not a day-15 build.
- `drama.js` was excluded from the eval list (touches `document` at load;
  presentational only). `statusEffects.js`/`monsterBehaviors.js`/`abilityActions.js`
  were eval'd in their `4174d39` index.html order — the harness independently
  confirms the missing-tags breakage (item 1).
