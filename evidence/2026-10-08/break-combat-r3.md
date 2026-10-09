# BREAK-IT round 3: combat engine (2026-10-08, target #0, third pass)

Hostile-player audit, fresh attack surface only — rounds 1–2 vectors were NOT
re-attacked (their suites re-ran green, except one outdated r2 expectation —
see notes). Proof tests: `scripts/test-combat-r3-async.js` (21 checks),
`scripts/test-combat-r3-honesty.js` (18), `scripts/test-combat-r3-deadcode.js`
(13); shared harness `scripts/combat-r3-harness.js`. All green × 5+ seeds.
Every check was run against pre-fix code via stash: all fail pre-fix, all
pass post-fix.

## EXPLOIT — broke + fixed (2)

**A. Async-path turn stall (BROKE, fixed).** The browser runs combat on the
ASYNC path (`window` defined → `tbAfterPlayerAction` → `tbAdvanceAsync`).
`tbAdvanceAsync()` no-op'd when it was the player's turn — which is ALWAYS
true at the moment a turn ends — so every action-driven turn end
(strike/wait/ability with 0 moves left, e.g. walk-up-and-hit) stranded the
fight in the browser: 0 moves, acted, no legal moves, no end-turn button.
Node tests never saw it (they take the sync path). The whole stepped-combat
system was effectively dead code whose entry point was a softlock.
Fix: the entry now STARTS the chain (`tbAdvanceOneAsync`), with an
`asyncRunning` + generation guard against double-scheduling and stale ticks
(save/load mid-chain invalidates in-flight ticks). Proof: A1 (chain
scheduled, AI turns run, turn resets).

**B. `_pendingPack` save-scum (BROKE, fixed).** Mid-fight saves serialized
`tbfight` but dropped `_pendingPack` (belltoad delayed reinforcements).
Reload mid-chorus → the chorus evaporated → free 'won' while reinforcements
were inbound. Fix: `pendingPack: {id, count}` persisted in `tbSave`, mdef
reattached by id on load; the restored fight still honors the chorus hold.
Proof: B (save → load → hold intact).

**Sibling sweep — HP-routing invariant (r2):** triaged every direct
`scholar.health`/`s.health` write in game.js/abilityActions.js. Clean:
sleep (guarded), travelTo pit-trap (combat-guarded), gwTrapTick
(tickAction-gated), tent-breach (pre-combat), trials/storms (out-of-combat),
bulk eat (selfbar suppressed in combat; Pack routes to eatOne), drinkWild
(legacy, zero callers), endDay, tbEnd/tbDamage/tbEndCheck (sync FROM
fighter), maybeCheatDeath (intentional sync). Two breaks found:
- **D. Phantom Field Medicine REGRESSION (BROKE, fixed).** Round 2 routed
  `field_medicine` via `addHealth`; commit bc2bf4f's wound gate rewrote the
  block and dropped the routing — +20 HP to `scholar.health` mid-fight,
  erased at `tbEnd`, again. Fix: `this.addHealth(actual)`; the wound-aware
  cap is preserved via `actual` (maxHealth is wound-aware). Proof: D.
- **doAction('rest') phantom heal (BROKE, fixed).** `rest` wrote
  `scholar.health` directly with no combat guard — callable mid-fight
  (UI-unreachable, but a live code path). Routing it via addHealth would
  have made it a REAL free mid-fight heal, so instead it now refuses
  mid-fight like sleep ("Not in the middle of a fight.") — the fiction
  ("rest through most of the day part") can't happen in a fight anyway.
  Proof: H3.

## SOFTLOCK — broke + fixed (3, all in the async path)

**A2. Async player arrival skipped `tbBeginTurn`.** `tbAdvanceOneAsync`
never called it — moves/acted never reset, stuns never consumed, player
status ticks skipped in the browser. Fix: arrival now calls `tbBeginTurn()`
(matching sync). Proof: A2 (moves reset 0→6, stun consumed).

**A3. Belltoad chorus never arrived in the browser.** The async round wrap
lacked the chorus spawn AND the `orderDirty` re-sort; `tbEndCheck`'s
"another croak answers" clause then held finished fights open FOREVER with
no arrivals coming. Additionally, skipping dead fighters recursed without
bound → `RangeError` once the chain actually ran. Fix: round wrap extracted
to shared `tbRoundWrap(f)` (order re-sort + ROUND call + chorus spawn),
called from both paths; dead-skips bounded to one round per tick (a fully
dead round re-ticks so chorus rolls proceed). Proof: A3 (arrivals land,
fight resolves 'won' when spent, no stack overflow).

**C. Gravity Well stranded the turn (BROKE, fixed).** `tbPlayerGravityWell`
set `acted=true` but never called `tbAfterPlayerAction()` — every sibling
verb does. Using it with 0 moves left left the turn unadvanced with no
legal moves (in node AND browser). Fix: `tbRefreshTelegraphUI()` +
`tbAfterPlayerAction()` like shout/offerFood. Proof: C.

## HONESTY — broke + fixed (2)

**H4. `unbreakable.shake_off` was a free action.** 19 of 20 tappable combat
data-actions cost `{turn: true}` (`second_wind.refuse_death` is automatic,
not a button). shake_off cost only 50 kcal — clear stun AND strike in one
turn, silently. Fix: added `"turn": true` to its data cost (matches its
sibling `brace` and the bar's universal contract). Design call, documented —
Steve can overrule. Proof: H4/H5.

**Pre-payment refusals (BROKE, fixed — same class as r1's unwired
turn-eaters).** Three once-per-fight actions refused INSIDE the impl, AFTER
`payActionCost`: a second tap on `shake_off`, `read_stance`, or
`settle_debt` spent the turn (+kcal/hp) on a known no-op; `calm_beast`
(with no targeting UI, the bar never passes a target) ALWAYS spent the
turn then failed "Nothing here to calm." Fix: new
`ABILITY_ACTION_PRECHECKS` registry — prechecks run BEFORE payment in
`useAbility` and drive the button's disabled state via `_actionAvailable`
(implements the generic once-per-fight check the code comment already
promised). Proof: H5 (refused taps spend nothing; availability gate
reports it).

**Held:** strike/shout/study/wait/scream all spend the act (H1); strike
range refusal spends nothing and says why (H2); `blood_magic` correctly
absent from the mid-fight bar (no combat flag; UI filters at render).

## DEAD-CODE — findings (1 real)

**D1. The old combat-break harness evaluated an INCOMPLETE module list.**
`scripts/combat-break-harness.js` omitted `convo-scene.js`,
`contestEngine.js`, `fieldFights.js`, `villager-objectives.js` — all in
index.html's script order. Every round 1–2 proof ran without them (harmless
in practice: no combat path touched them, but the proofs' coverage claim
was wrong). New `scripts/combat-r3-harness.js` uses the exact index.html
order; `test-combat-r3-deadcode.js` asserts parity forever (D1).
Also verified: all combat namespaces load (D2), the async path is wired
post-fix (D3), alienPlayers.js's two `tbAfterPlayerAction` wrappers both
call through (found while checking D3).

## Attack surface that HELD (deeper level)

- Sync-path turn engine untouched and behavior-identical (extraction
  verified diff-clean); r1/r2 suites green.
- `tbPlayerEndTurn` (movement-driven ends) deliberately left on the sync
  path: the 550ms stepped beats have never fired in production (the chain
  never started), so instant-after-moving IS the feel Steve has been
  playtesting. Making it stepped is a design call, not a break-it fix.
- XP: no combat XP exists (r2); ability XP single-count re-verified
  (`test-xp-doublecount`, `test-ability-xp-use` green); `useAbility`
  prechecks return false before `gainAbilityXP` — the r1 invariant holds.
- Flee economy, ally targeting, kill credit: unchanged from r2.

## Notes / handoff

- r2's `test-combat-r2-deadcode-20261008.js` X2 now reports 1 fear applier:
  NOT a regression — the alien-players break-it run deliberately added
  countess_sable's dread projector (`applyStatus(t, 'fear', ...)`). The r2
  expectation ("zero fighter appliers") is outdated; fear is live now, which
  incidentally makes shake_off's cleanse genuinely useful.
- `test-combat-engine-20261007.js` fails pre-existing (stale:
  `C.monsterTacticPlan is not a function`) — verified identical on stashed
  code, not touched.
- Ontology: 50/50 validated; `tbRoundWrap` + precheck rule added to headers
  and regenerated `docs/ONTOLOGY.md`.

## Files changed

- `src/js/game.js`: `tbRoundWrap(f)` extracted (shared by sync/async);
  `tbAdvanceAsync` starts the chain (+asyncRunning/generation guards);
  `tbAdvanceOneAsync` rewritten (bounded dead-skips, `tbBeginTurn` on
  player arrival, shared round wrap); `tbPlayerGravityWell` ends the turn;
  `field_medicine` re-routed via `addHealth`; `doAction('rest')` combat
  guard; `_pendingPack` persisted/restored in `syncRun`/`load`.
- `src/js/abilityActions.js`: `ABILITY_ACTION_PRECHECKS` registry; wired
  into `useAbility` (pre-payment) and `_actionAvailable` (button state).
- `src/data/abilities.json`: `shake_off` costs the turn.
- `docs/ONTOLOGY.md`: regenerated.
- New: `scripts/combat-r3-harness.js`, `scripts/test-combat-r3-async.js`,
  `scripts/test-combat-r3-honesty.js`, `scripts/test-combat-r3-deadcode.js`.
