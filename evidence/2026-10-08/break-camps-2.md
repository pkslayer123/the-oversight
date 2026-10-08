# break-it: camps & structures, 2nd pass (2026-10-08)

Worker: break-camps2 worktree. Proof: `scripts/test-camps2-breakit-20261008.js`
(57 checks, ALL GREEN × 4 seeds: 20261008, 1, 777, 20261009).
Before-fix run: 26 FAILURES — every catch below demonstrated red, then green.

Context: first pass (break-camps.md, ~07:10) killed the destroyCell phantom
camp. Since then tent-breach, storm-break, and tent rooms landed unattacked.
This pass attacked the NEW code. Result: 7 catches, all broke, all fixed.

## CATCH 1 — PHANTOM CAMP TAKE 2 (softlock + honesty) — BROKE, FIXED
**Attack:** `wreckTent()` (big-monster tent breach) cleared the tent cell but
never told the camp system — the exact CATCH-1 class from the first pass,
through the new tent-breach path.
**Result:** `state.camp` survived on a wrecked tent. `atCamp()` stayed true →
sort-the-bag ritual + prep-stash counter on bare dirt; "Set up camp" refused
("You already have a camp"); no abandon action existed. Ghost camp, no exit.
**Fix:** `wreckTent` purges the tent's interior-fire entry (phantom-fire
sibling: `tentFire()` matches by coords — a re-pitched tent on the same cell
would inherit a lit fire) and calls `breakCamp('a monster tore it down')`
when the wrecked tent is on the camp's tile (same guard shape as destroyCell's
`smashedCampTent`). Far-tile wrecks don't touch the camp.
Also reordered the big-breach branch: `insideTent` nulls BEFORE `wreckTent` so
breakCamp's inside-dump stays a no-op and the branch's "thrown clear" message
owns the fiction.

## CATCH 2 — breakCamp's MESSAGE LIED (honesty) — BROKE, FIXED
**Attack:** the single message — "The tent's wrecked, the fire's cold." —
was false on two paths:
- packTent path: the tent was PACKED (it's in your inventory), not wrecked;
  and the fire kept burning, feedable.
- storm/bulldozer/monster paths: camp-tile fires kept burning, feedable —
  copy said cold, engine said lit.
**Fix:** reason-aware messages. Destruction now actually extinguishes:
`breakCamp` sweeps all player fires (grid + interior) on the camp tile and
clears their cells — the message's promise made true. The struck path
('you packed up the tent') keeps the fire honestly: "Camp struck — the
tent's back in your pack. The fire keeps burning; it'll die on its own."
(No-fire variant omits the fire clause — no new lies.)

## CATCH 3 — "let it go" WAS A PHANTOM PROMISE (honesty) — BROKE, FIXED
**Attack:** `setUpCamp` refused with "Pack it up or let it go before making a
new one" — but no abandon action existed anywhere. Meanwhile the design
comment on the CAMP block always said "Setting up a new camp abandons the
old one." Copy promised, engine refused, design agreed with the copy.
**Fix:** engine now matches the documented design. `setUpCamp` abandons a
foreign-tile camp (`breakCamp('you left it behind')`) after the tent/fire
checks pass (a failed setup never costs the old camp). Same-tile re-setup
says "This is already your camp." (honest, non-destructive).
**UI follow-through (same bug class):** `canSetUpCamp()` gated the tile-menu
button on `!state.camp` — with auto-abandon that gate would HIDE the only
path to the new behavior. Gate now allows a camp on another tile.
app.js confirm names the cost when abandoning ("Your OLD camp is abandoned —
its tent is wrecked, its fire dies"), per "expensive buttons name their cost".

## CATCH 4 — MONSTER IN THE TENT, FULL MENU STILL OPEN (fiction hole) — BROKE, FIXED
**Attack:** with `pendingInTent` (the thing is IN the tent with you), the
tent-room screen kept offering Light fire / Feed / Cook / Vent / Sleep /
Exit — and every Game function ran. Cooking a meal while it watches; calmly
exiting left the "INSIDE the tent with you" panel stranded.
**Fix:** `_breachLock()` — while `pendingInTent`, the only move is facing it.
Guards on lightTentFire, feedTentFire, cookInTent, setTentVent, sleep, and
exitTent (forced exits bypass — that's faceTentIntruder's own burst-out).
app.js suppresses the action buttons while breached; the breach card ("Face
it") is the only action. No softlock: faceTentIntruder → startCombat always
resolves.

## CATCH 5 — sweepDeadFires ATE THE TENT (sibling catch) — BROKE, FIXED
**Attack (sibling sweep, fire-tracking-vs-grid class):** an expired INTERIOR
fire entry carries the TENT's (cx,cy). `sweepDeadFires` blindly cleared that
cell on expiry → the tent vanished when its fire burned out, and
`validateInsideTent` dumped you with "wrecked while you were away."
**Fix:** interior fires skip cell-clearing (they have no grid cell); grid
fires clear only when the cell is actually a `'fire'` cell now.

## CATCH 6 — GRID FEED PATH FED TENT FIRES (sibling catch) — BROKE, FIXED
**Attack (same class):** `playerFireAt()` matched interior-fire entries, so
the outside "Feed the fire" tile action could feed a tent-interior fire at
full burn through the grid, bypassing the interior cap.
**Fix:** `playerFireAt` ignores `inside` entries. Interior fires are fed only
via `feedTentFire()`.

## CATCH 7 — SAVE-SCUM THE BREACH (exploit) — BROKE, FIXED
**Attack:** `pendingEncounter`/`pendingMonsterId`/`pendingInTent` are
Game-instance fields, never persisted — `syncRun()` didn't write them.
Save during the breach panel → reload → the encounter silently vanished.
The designed risk ("sleeping with a fire lit is a decision") was dodgeable
for free. (The break-it persistence run never covered pending encounters.)
**Fix:** the triple persists in `state.run`; `load()` restores it, with a
downgrade: `pendingInTent` requires a live `insideTent`, else it becomes a
regular encounter — never a phantom in-tent panel.

## Held (attacked, resisted)
- **EXPLOIT — tent pitch/pack loop:** still net-negative (48+16 ticks, 50 kcal);
  wreck destroys with no salvage. No dup path.
- **EXPLOIT — interior-fire revival:** killed as a sibling inside CATCH 1/2
  (entries purged on wreckTent and breakCamp's tent sweep).
- **SOFTLOCK — storm while inside the tent:** `resolveStormFront` → breakCamp
  dumps insideTent with its own message; sleep's quality was pre-captured.
  No stuck state (existing storm suite green).
- **SOFTLOCK — stale `_tentBreachSpawn`:** `faceTentIntruder` always reaches
  `startCombat`, whose only early exit is a loud throw — the override can't
  leak into a later fight. Verified by reading, not changed.
- **HONESTY — unbreakable rule:** after pass 1's carve-out, the destroyCell
  list (`hall/bunk/door/haven/sanct/base`) is haven buildings + pre-emptive
  alien `'base'` only. Player structures all break. Held.
- **DEAD CODE:** caller audit of all 30 camp/tent/breach functions — every one
  has ≥1 caller; no zero-caller functions, no orphaned helpers, no never-true
  branches in pitchTent/makeFire/setUpCamp/breakCamp/packTent/atPlayerCamp/
  hasTentNearby/playerFireAt/hasCampfireNearby. The old pendingEncounter yank
  is fully gone (only the documentary NOTE comment remains). `shredded`
  branch in enterTent serves found tents (gen'd at game.js:6119) — live.
- **SIBLING SWEEP — fires tracking vs grid:** destroyCell (pass 1), taxFires
  (till-only), detailRegrow (plant-scoped, can't overwrite tent/fire cells),
  found-tent take (non-yours, camp-untouched). All consistent after fixes.
- **SIBLING SWEEP — stash/cache:** prepStash is pack-staged items, unaffected
  by camp breaks (correct — it's yours, not the camp's); exile cache covered
  in pass 1.

## Regressions
Existing suites green after the fix: test-camp-phantom, test-camp-storm-break,
test-tent-breach, test-tent-rooms, test-make-fire (26), test-sleep-preview-tonight
(11), test-fireside-return-guarantee (11). Ontology 48/48 validated.

## Files
- `src/js/game.js` — all 7 fixes
- `src/js/app.js` — breach-card-only tent room; honest abandon confirm
- `scripts/test-camps2-breakit-20261008.js` — 57-check proof (before: 26 red)
