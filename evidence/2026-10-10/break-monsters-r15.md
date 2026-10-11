# Break-it r15 — MONSTERS (wave-3 signatures) — 2026-10-10

**Run:** oversight-flesh-out-loop cron r15, Sat 2026-10-10 22:48 CDT
**Target:** Freshly-built wave-3 signature mechanics (batches A/B/C, built 2026-10-10):
Redactor, Gavel, Focus Group, Spool, Chorus Line, Terms of Service, Callback, Buffering, Ad Break
**Verdict:** BROKE + FIXED (4 catches, 2 sub-fixes). All proof tests green post-fix (233 pass × 3 seeds).
**Worktree:** ~/workspace/worktrees/break-monsters-r1 (merged locally, pending ship)

## Proof script
`scripts/test-monsters-break-r15-20261010.js` — 234 assertions via `scripts/sim-harness.js`
(seeded RNG, SEED env × 3 seeds: 20261010, 1, 2, 3). Before/after verified by stashing fixes
(HEAD = all catches red) vs restored (all green).

## CATCH 1 — GAVEL: free permanent verdict-halving (EXPLOIT/HONESTY) — FIXED
**Attack:** OBJECT at 0 viewership. The −3 cost used `Math.max(0, cur-3)`, flooring at 0 —
a broke player got the ×0.5 verdict softening every trial, forever, for free. The button
title promises "Costs 3 viewership (fame)".
**Fix** (`src/js/sigW3a.js` `tbPlayerGavelObject`): refuse the objection when
`havenViewership() < 3` — "the gallery is empty… (OBJECT needs 3 viewership)" — returns
false, no act spent, trial stays open.
**Proof:** `CATCH1/gavel: OBJECT refused at 0 viewership` (red pre-fix, green post-fix);
`gavel: OBJECT works at 10 viewership` + `costs exactly 3` still green.

## CATCH 2 — SPOOL: ally damage filed as the player's strike (HONESTY) — FIXED
**Attack:** Wound the spool via an ally (simulated `m.hp -= 90`), then wait. The record
phase attributed ALL spool-HP loss between its turns to "your strike" and replayed it AT
the player as "your own swing". Canon (MONSTER-WAVES.md): "classified from what you
actually did."
**Fix** (`src/js/sigW3a.js` + `src/js/sigW3b.js`): `f.sigLastStrike` now carries a per-fight
`seq` (`f.sigStrikeSeq`); each spool tracks `m.spAttrSeq` and attributes strike damage
ONLY when the seq is new and the target is that spool. HP loss from other sources falls
through to the honest reading (wait/heal/move). Legacy (no seq) falls back to the delta.
**Proof:** `CATCH2/spool: ally damage NOT filed as the player's strike` (was
`{kind:"strike",dmg:90}`, now `{kind:"wait"}`); replay of that turn is silence, not a
90-dmg strike back.

## CATCH 2b — SPOOL: turn-1 heal misfiled as WAIT (HONESTY) — FIXED
**Attack:** Heal on turn 1 (before the spool's first turn). The retroactive recovery only
checked strike/move/wait/act — the heal was filed as WAIT, so "your heal comes back as
a heal" never fired for turn-1 heals.
**Fix** (`src/js/sigW3b.js`): new `G.startCombat` wrap captures `f.spBasePhp` (player HP
at fight start); the retroactive chain now detects heals with documented priority
strike > heal > move > wait > act.
**Proof:** `honesty/spool: fed heal recorded as HEAL with exact amount` (+40);
`"your heal comes back as a heal" — literally +40`.

## CATCH 3 — BUFFERING: "the faintest frame is the real present" was invisible (HONESTY) — FIXED
**Attack:** Canon/MONSTER-WAVES.md: "On the grid it shows 2–3 afterimage frames; the
faintest frame is the real present." `m.bufEchoes` was written by the hook but NEVER
read by any renderer — the telegraph promised visuals the engine never drew.
**Fix:** `Game.bufAfterimageCells()` provider in `src/js/sigW3c.js`; bright ghost overlays on echo tiles + the buffering's own
token dimmed to `opacity:.45` in `src/js/app.js` `renderDetail` (guarded, inline styles,
no CSS touch; ungated like `gwDiveShadow`/`sbHeatKeys` — the frames are physically there).
**Proof:** `CATCH3/buffering: provider exists and returns the echo frames`;
`deadcode: app.js renders buffering afterimages`. **[needs-eyes]** — Steve should see
the afterimage look on his phone.
**Sub-fix:** buffering cold-start — `p._bufPrevPos` seeded from `f.bufBasePos`
(captured in the startCombat wrap) so a turn-1 move by a faster player isn't read as
"no heading".

## CATCH 4 — CHORUS: dance + full reposition while untouchable (HONESTY) — FIXED
**Attack:** `tbChorusDance()` didn't zero `moveLeft` despite "dancing is all you do this
turn" — dance (untouchable through the downbeat) + a full 3-tile reposition every turn.
**Fix** (`src/js/sigW3b.js`): `p.moveLeft = 0` in `tbChorusDance` (matches `tbPlayerDodge`).
The turn auto-advances; the beat count proves the monster acted.
**Proof:** `CATCH4/chorus: dance consumes the turn` (clBeat advances); the downbeat kick
still "catches air" while dancing (designed counterplay intact).

## Held ground (attacks that failed — documented, not fixed)
- **Redactor:** quiet-starve (4 waits → flee; costs ~3 monster attacks; telegraphed); decoy
  consumed 1/cycle; weapon redact exactly 2 rounds; shove with no free tile narrated honestly.
- **Gavel:** verdict math exact (objected 50×0.5=25, confessed 50×0.4=20); frontal shield
  ~0.35× vs flank bypass; empty-log fallback crime; recess once per trial.
- **Focus Group:** loved-strike answered exactly once; 3-boring-turn walkout (no kill credit);
  eye-heads un-strikable (act consumed, narrated); mouth-pop overflow kill; rage-lock blocks walkout.
- **Spool:** heal-feed replay heals exactly the fed amount (capped at maxHp — canon counterplay);
  wait-only record still killable; reel examine exact.
- **Chorus:** dance-timing counterplay (dance the downbeat → untouchable, but no progress);
  flank 0.5× / move-on-beat 0.25×; deafness hides the count (not the kick); gravel breaks
  the count for one round.
- **Terms of Service:** accept penalties materialize (arbitration +40/−10 maxHP); object costs
  real; §0 → fled with no kill credit ("routed"); auto-accept + ratchet; killing the Scroll
  voids pending penalties (no leak).
- **Callback:** stranger-funeral fallback (designed); face never a living roster member;
  borrowed moves + name-it strips them.
- **Buffering:** predict/step announce→execute exact; open-eyes strike at the mirage misses
  (brightest frame = past); closed-eyes finds the faintest frame; stand-still → whiff.
- **Ad Break:** skip timing by viewership tier (0→4/3, 30→2/1); sponsor kill +2 progress;
  look-away halves heal + 0.5 bar (total heal identical over double duration — tradeoff, not
  exploit); blind cost lands on next strike; reposition stays on-grid/in-reach.
- **Dead-code:** all 9 hooks registered in `MonsterBehaviorHooks`, declared in
  `monsterBehaviors.json` `preTurnHooks`, fired via `mbRunPreTurn` in live `tbMonsterTurn`;
  combat-menu surfaces wired (`sigCombatButtonsHTML`, `sigW3bCombatButtons`,
  `sigW3cCombatButtons`); field-fight paths called from `fieldFights.js`.
- **Persistence:** fights don't persist across save/load (`storage.js` never serializes
  `tbfight`) — stale mechanic state cannot resurrect. Fighter objects rebuilt per fight.

## Nits noted, not fixed
- `bands/ad_break: damage in 20-70` — the ad_break attack range [19,33] dips 1 below the
  20–70 canon band. Trivial; not a mechanic break. Left for a balance pass.

## Wave 4/5
Still copy-only (16 ids excl. reunion's packTactics hook), awaiting Steve's mechanism pick.
Not built per instructions. Their telegraphs still promise unbuilt mechanics — noted, not launched.

## Files changed
- `src/js/sigW3a.js` — CATCH1 (gavel refusal); `sigStrikeSeq` on `f.sigLastStrike` (CATCH2)
- `src/js/sigW3b.js` — CATCH2 (spool seq attribution); CATCH2b (retroactive heal + startCombat wrap); CATCH4 (dance moveLeft=0)
- `src/js/sigW3c.js` — CATCH3 (`bufAfterimageCells` provider); buffering cold-start (`bufBasePos`)
- `src/js/app.js` — CATCH3 (afterimage ghost overlays + dimmed present token in renderDetail)
- `scripts/test-monsters-break-r15-20261010.js` — 234-assertion proof (new)

## Regression
- r14 break script: 113 pass, 3 FAIL — the 3 failures (hushwolf spawns, wave-3 unlock
  thresholds) reproduce on HEAD without my changes: pre-existing, unrelated.
- No concurrent jest; node harness only.

**Merged locally, pending ship** (coordinator lands via --ff-only; ship loop owns bump/push).
