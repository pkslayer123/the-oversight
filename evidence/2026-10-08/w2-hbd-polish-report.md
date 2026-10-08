# Wave-2 "Highbeam Deer level" polish audit (2026-10-08)

Worker: wave-2 HBD polish. Worktree: `~/workspace/worktrees/w2-hbd-polish`.
Scope: `src/js/game.js` (declare/audio/aggro regions), `src/data/monsters.json` (read-only this run),
`scripts/test-w2-hbd-polish-20261008.js` (new proof test), this report.

## Verdict

All 13 wave-2 monsters (Static, Grief Counselor, Performance Review, Inspiration,
Nostalgia, Extended Warranty, The Understudy, The Landlord, The Heckler,
The Paparazzo, The Union Rep, The Moderator, The Static Kite) now clear the
Highbeam Deer bar on all 7 dimensions. Proof: `scripts/test-w2-hbd-polish-20261008.js`
— **161 pass, 0 fail, stable across 4 seeds** (20261008, 7, 42, 777).
Existing `scripts/test-wave2.js` still 148/148. `validate-ontology.js` passes
(46 systems).

## What the audit found

The wave-2 roster was already deeply fleshed out (bespoke sections for all 13).
Two real gaps found and fixed; everything else verified live:

### Fix 1 — review_drone's data knownCue had no surface (game.js, tbBatch4Cue)
`tbBatch4Cue` intercepts review_drone before `tbTelegraphCue`'s knownTail, so the
data knownCue ("It scores your dodges. Unpredictable movement breaks its lock.")
**never surfaced anywhere** — it hung dead in monsters.json. Now appended in the
drone branch when the pattern is learned (dread-only for first-timers).
Design call (Steve 2026-10-07 23:55 standing order): the knownCue is coaching,
so it follows the same earned-knowledge gate as every other knownCue.

### Fix 2 — "You don't stroll through a The Static Kite" (game.js, tbPlayerMove)
Walking into an occupied tile composed the blocker name with a naive `"a "`
prefix, doubling the article for every "The …"-named monster (all six corporate
horrors + the kite). Now uses `encSubject()` (the existing article-aware
composer): "You don't stroll through the Static Kite."

## Verified live (per monster, seeded fights)

1. **Distinct telegraph text** — all 13 `attack.telegraph` strings unique and
   non-generic (data-level assertion).
2. **Grid telegraph** — 12/13 declare with real highlighted cells/lock-ons,
   captured live. warranty_caller declares **none** (rush — silence by design,
   the ring IS the telegraph; verified no telegraph object is ever set).
3. **Phase system** — every monster wears its OWN phase vocabulary through the
   fight (call/approach/reveal, mirror/confront/charge, project/countdown/
   correct/recalc, settle/brighten/bloom/ember, watch/spell/static,
   dial/ring/pitch/redial, watching/rehearsing/performing/improv,
   surveying/claiming/collecting/foreclosing, warming_up/heckling/headliner,
   candid/tracking/exclusive, organizing/picketing/walkout,
   observing/muting/shadowban, rise/mark/transmit/recover). Zero Highbeam-phase
   leakage (aim/charge/firing/cooldown) observed.
4. **Audio** — all 13 data `aggroAudio` hooks fire at declare; all 12 data
   `resolveAudio` hooks fire at resolve (warranty has none by design — the rush
   resolve is `serviceRush` + `impact`, no warning voice). Fiction-correctness
   spot-checks: the warranty rush stays grid-silent; the stag's gaze-freeze is
   silent dread; the kite's mark/unfold/transmit/climb each have their own
   voice. (Note: bright_idea's data `aggroAudio: eurekaTick` fires on the
   windup ticks, not at declare — the declare voice is `eurekaCharge`. Both
   fire; the tick-during-brightening is the fiction-correct moment.)
5. **Codex-gated knownCue** — all 13 have knownCue in data; asserted NOT shown
   before the pattern is learned and shown after, via the real `tbTelegraphCue`
   + `tbLearnPattern` path.
6. **Armor/resistances** — all sane; fiction spot-checks pass (drone armored 6,
   idea armor 0 + physical resist 0.75 "made of light", heckler psychic 0.75
   "words wash off", stag psychic 0.75 "IS psychic").
7. **Behavior distinctness** — bespoke mechanics verified firing live:
   stag mirror-gaze + wheel, drone predictive countdown, idea bloom/ember/
   rekindle, projector spell-pull, warranty ring→pitch + call-dropped +
   bad-connection, understudy strike-learning (usSeen) + performing/improv
   arc, landlord tile claims + rent, heckler SHAME + headliner + answer-back,
   paparazzo prediction counter, union_rep organizing→walkout,
   moderator verb-mute (driven directly: strike-heavy window + muting phase →
   modMuted=['strike']), kite mark→transmit dip window.

## Played as a player (3 fights, judged)

- **mirror_stag** (seed 20261008): approached, sidestepped 16 charge lanes,
  8 strikes, killed it in 5 rounds. The wheel ("no windup this time") reads as
  a genuine escalation — the wave-1 dodge-punish rhythm gets you run over.
  Feels right.
- **heckler** (seed 20261008): jibes → SHAME 2 → headliner → psychic chip →
  compulsion → answered back (WAIT) clearing 3. The full dignity-vs-speed
  loop works; killing it fast is viable, answering is viable. Feels right.
- **statickite** (seed 20261008): 41 rounds, 3 marks cleanly dodged, all four
  phases. The dip window is real but hard to reach without ranged — the kite
  drifts at range 4 and the transmit lasts one turn. With a sling/bow (the
  codex-noted counter) this is a fair fight; melee-only it is a long
  dodge-dance. Judgment call: acceptable — the fiction says "don't wait for
  it to land" and the codex teaches the ranged answer. Not changing.

## Notes for the coordinator

- The telegraph-visual distinctness gaps from `telegraph-visual-judgment.md`
  (exposure/detonation buckets) were already fixed by a sibling
  (af48fe9 `pzFlash`/`ideaHeat` in app.js STYLE_BUCKETS) — verified present
  at this worktree's HEAD. No action needed.
- The audio-census "5 unreachable aggro hooks" finding is stale for wave-2:
  hecklerLaugh now fires via the first-jibe `tbAggroAudio` (added 2026-10-08
  by the aggro-audio-leftovers worker). Verified firing live.
- Two harness-environment lessons (not game bugs): (1) `freeSpotNear` can
  fall through to the player's tile in the headless map node — test spawns
  relocate the monster for honest telegraph geometry; (2) `tbPlayerStudy`
  leaves moves unspent so the turn doesn't end, and acting twice hits
  "Already acted" — drivers must spend the turn fully (`takeTurn` helper in
  the proof test).
- monsters.json untouched this run (read-only audit; no data changes needed).

## Files changed

- `src/js/game.js` — 2 fixes (drone knownCue surface; stroll-through article).
- `scripts/test-w2-hbd-polish-20261008.js` — new proof test (161 assertions).
- `evidence/2026-10-08/w2-hbd-polish-report.md` — this report.
