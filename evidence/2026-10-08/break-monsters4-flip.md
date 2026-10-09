# Break-it: monsters RUN 4 — the turtle flip mechanic (2026-10-08)

Hostile-player run against the brand-new turtle flip mechanic (commit c00b92f,
never adversarially tested until now), plus the assigned sibling sweeps
(wavegate third-path hunt, dead-code re-sweep). Prior runs' ground
(dead AI purge, wave-gate unification, sunbasker dusk, patterncells zero-range,
lockpick bolt, ambush-zone removal, field-fight wounds, pack-lead break,
turtle disengage) was read first and not re-attacked.

Two catches, both fixed + proven. Everything else held.

## CATCH 1 — Flipped "no armor" lied: the 0.5 physical resist survived the flip (HONESTY) — FIXED

**The break:** The flip promises "armor 0" — the commit message, the code
comment, the in-game say ("(FLIPPED: no armor, can't snap, 3 turns.)"), the
button tooltip ("no armor"). The engine zeroed the flat armor (15) but the
turtle's `resistances.physical = 0.5` kept halving every flipped strike.
Measured: base spear damage 28 (roll 13 + 15) dealt exactly 14 while flipped —
the shell's percentage defense applied with the shell explicitly "not in the
way." The resist even narrated itself ("resists physical — 28 → 14"), so the
lie was visible to any player doing the math.

**The fix (src/js/game.js):** flipped now zeroes the physical resist too, in
the resistance block next to the ember-punish precedent (which already zeroes
resist for bright_idea's ember window — same "vulnerable window" class). The
callout now reads "(Upside down — the shell isn't in the way. No armor, no
resistance.)"

**Proof:** `scripts/test-break-monsters4-flip-20261008.js` §C1 — forced flip,
fixed-roll strike: exactly 28 (was 14 pre-fix).

## CATCH 2 — audioEvent('turtleFlip') fired with no handler (DEAD-CODE) — FIXED

**The break:** `tbPlayerFlip` fires `audioEvent('turtleFlip')` on success, but
no `turtleFlip()` audio function existed in app.js — fired-but-silent since
the flip commit. (The snap and bunker both resolve: `turtleSnap` via
encConfig resolveAudio, `turtleBunker` direct.) Static check: 1 call site, 0
handlers.

**The fix (src/js/app.js):** added `turtleFlip()` (heave rising into a
shell-on-dirt crash + stone thud), registered in the audio dispatch table,
indexed in the hook comment. Also: the fail branch IS a Snap Decision, so it
now plays `turtleSnap` (was silent damage).

**Proof:** §C2 — static assertions that the function exists and is
registered. (app.js is DOM-only, excluded from the node harness; verified by
source inspection + `node --check`-adjacent extraction.)

## Attacked and HELD

- **EXPLOIT — flip-lock economy:** natural turn loop (flip → wait out the
  flailing → strike the soft parts → re-flip). 200-HP turtle dies in ~15
  player turns / 4 flips / 8 free strikes — but every failed flip costs a
  real snap and the loop costs real HP (133 damage taken in the measured run).
  The counter is strong, as Steve wants ("reward players for learning"), but
  not free. Not an infinite loop: re-flip is refused while flipped (turn not
  spent), the window is 3 turtle-turns, fail = snap.
- **HONESTY — fail-snap is the real snap:** the fail branch deals
  `S.combat.roll(atk.damage || [20,30])` where atk is the turtle's actual
  mdef.attack — Snap Decision [20,30] through the standard tbDamage path, not
  a hardcoded fake. (Test subtlety: the turtle also snaps on its own turn
  right after, so the proof captures the first tbDamage call to isolate the
  fail-snap.)
- **SOFTLOCK — flip + disengage:** flip the adjacent turtle, walk 3 tiles —
  the fight ends cleanly via disengage ("just walk around" weakness). No
  stuck state. Flip-while-bunkered / at-distance / already-flipped are all
  refused without spending the turn.
- **HONESTY — crowbar +0.25 is equipped-as-weapon only:** measured over 1200
  trials each — base 0.49, crowbar-in-pack 0.51, crowbar-equipped 0.73.
  Matches the code (0.3+str*0.04, +0.25 equipped crowbar). No in-game copy
  promises otherwise (tooltip says "strength check", codex says "flip it
  (good luck)") — undisclosed-by-design, not a lie. Noted.
- **HONESTY — flip predicate:** `turtleIs` matches only speedbump_turtle (no
  hushwolf-flipping); the app.js button predicate already filters
  alive-and-not-fled (the `mons` list is pre-filtered). Button can't appear
  for a dead/fled turtle.
- **DEAD-CODE — full re-sweep:** all 28 monster ids referenced in code; all
  46 audio names in monsters.json resolve to app.js handlers; the 8 orphaned
  audio functions from run 1 (swarm*/hype*) still have zero call sites —
  still the audio run's territory, left alone.
- **SIBLING SWEEP — wavegate third path:** every wave-picking path goes
  through the unified gate — `monsterWavePool()` (tile-entry, background
  maintainWorldMonsters, contestEngine, contests, villager-agency) and
  `castMonster()` (wanderer) both key on the single `unlockedWave()`
  definition; `spawnWaveTarget` is a pure function of the gated pool.
  Explicit-id `startCombat` calls (door-flee re-engage, traps) re-engage
  known monsters, not wave picks. No third gate.

## Test-harness lesson (for future runs)

`tbPlayerStrike` does NOT advance the turn by itself — the action economy
advances only when `p.moveLeft <= 0` (the player can move after striking).
A harness that sets moveLeft=6 and strikes in a loop will never give the
monster a turn, and status windows (like the flip's 3 turtle-turns) will
never tick down. The honest harness pattern: strike, then WAIT to forfeit
remaining moves (`endTurn` helper in the new test). `tbPlayerFlip` zeroes
moveLeft itself, which is why the original flip test never hit this.

## Regression status

- New: `scripts/test-break-monsters4-flip-20261008.js` — 18/18 × 4 seeds
  (20261008, 7, 99, 4242)
- Untouched suites green: turtle-flip 14/14, turtle-breakit 13/13,
  wave-gate 9/9, behaviors 21/21, loot 42/42, patterncells 11/11,
  fieldfights 24/24, lockpick 9/9, combat-r3-honesty 18/18
- `validate-ontology.js`: 50/50, release permitted

## Files changed

- src/js/game.js (flipped zeroes physical resist; fail-snap plays turtleSnap)
- src/js/app.js (turtleFlip() audio + dispatch registration + hook index)
- scripts/test-break-monsters4-flip-20261008.js (new, 18/18 ×4 seeds)
- evidence/2026-10-08/break-monsters4-flip.md (this file)

## Open / handed off

- The counter-honesty + telegraph-lies sweep (belltoad shout vs chorus,
  projector sidestep, hushwolf fire, landlord rent, union-rep kill-first,
  nevermore landing window, hushwolf silence telegraph, multi-turn windups)
  is running in worktree break-monsters4b as the second worker; its findings
  and any src/ patches it proposes will land as a follow-up commit.
- The 8 orphaned audio functions (swarmFilm/swarmBuild/swarmFlash/
  swarmShutters/swarmScatter/swarmEscalate/hypeDeflate/hypeEncourage/
  hypeInflate) are still unreferenced — audio run's call, not monsters'.
