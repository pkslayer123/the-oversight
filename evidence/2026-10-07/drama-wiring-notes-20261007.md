# Drama/audio wiring fixes — Worker 2 (2026-10-07 ~16:40–17:20 CDT)

Assignment: remaining drama/audio backlog (floatText patch, knowledgeReveal
synth, Inspiration ember-timing bug). Base: `5f30aee`.

## What landed

**1. beamHorror drama kind wired (the real float-text gap).**
The "floatText 8-site patch" backlog label has NO documented definition in any
evidence note at HEAD — no audit flags any floatText miswiring. Empirical audit
of pristine HEAD found:
- `kind === 'text'` → `D.floatText(...args)` (game.js:14424) has ZERO call
  sites — a dead branch, not 8 miswired sites. All 18 internal `D.floatText`
  calls in drama.js are positionally correct and route through `spawn()`.
- Exactly ONE fired-but-unhandled drama kind: `'beamHorror'`
  (alienPlayers.js:1835) — the "oh shit" moment when the alien beam goes
  through your armor ("THIS IS NOT A FAIR FIGHT. Run."). The dispatch had no
  branch and Drama had no method: the beat fired silently every time.

Fix (drama.js + game.js dispatch region only):
- `Drama.beamHorror(x, y, integration)` — composes existing primitives only
  (red-white flash, shake, floatText '💀 YOUR ARMOR MEANS NOTHING'). No new
  mechanics, no invented systems. Audio stays quiet by design (the beam's own
  fire audio covers the hit); added to the E1 comment's quiet list.
- Dispatch branch `else if (kind === 'beamHorror') D.beamHorror(...args);`
  plus 'beamHorror' in the B1 integration-append list (combat beat, consistent
  with playerHurt/dodgeMiss).

**2. knowledgeReveal synth — backlog item was STALE, verified not re-built.**
Commit `5fef3d8` ("Fix audio orphans") already landed a distinctive synth:
ascending C-E-G arpeggio whose top note drifts sharp past resolution ("never
lands") over an unsettled detuned shimmer — alien, not generic. It meets
Steve's freaky-not-generic bar. `DRAMA_AUDIO_MATES` already maps
secret→knowledgeReveal and plantIdentified→knowledgeReveal. app.js is outside
my allowed files, so no synth edits were in scope anyway. The proof (Part B)
asserts the voice resolves for all 9 fired kinds (slots, integration, codex,
skill, plant, recipe, animal, technique, synergy) and all 8 mate-table voices.

**3. Inspiration ember-timing bug — DIAGNOSED, pinned with failing proof, NOT
fixed (flagged).** The mechanic lives in game.js `tbMonsterTurn`, which is a
sibling's active area (worktree game.js is dirty with their uncommitted
edits — see hazard note below), and the fix is a mechanic timing change
outside my allowed "audio dispatch region". Per task instructions: flag,
don't edit.

The bug (verified empirically in Part C, real tbMonsterTurn, 3 cycles):
design (monsters.json codex + REKINDLE comment) says the ember safe window is
**2 turns, then 1, then 0**. Observed player-visible ember turns: **1, 0, 0**.
Root cause: the bloom→ember transition (game.js ~22746) sets
`m.biEmber = Math.max(0, 3 - m.biCycles)` and the ember countdown block in the
SAME monster turn immediately decrements it — the transition turn double-counts.
Cycle 2's kill window never appears at all (ember→settle in one turn, and the
EMBER PUNISH comment calls the ember "the kill window").

Recommended fix (for the engine owner / whoever owns tbMonsterTurn):
```js
if ((m.beamPhase === 'brighten' || m.beamPhase === 'bloom') && !m.telegraph && m.biDeclared) {
  m.biDeclared = false;
  m.biCycles = (m.biCycles || 0) + 1;
  this.encSetPhase(m, 'ember'); m.biEmber = Math.max(0, 3 - m.biCycles);
  this.say('The light gutters down to a dying ember. ...');
  this.audioEvent('eurekaSpent');
  // The transition turn IS the first ember turn — the countdown starts next
  // turn, or "2 turns, then 1, then 0" loses a turn to the transition itself.
  if (m.biEmber <= 0) { // cycle 3+: no safe window — settle immediately
    this.encSetPhase(m, 'settle');
    this.say('The ember steadies. Somewhere inside the glass, an idea is forming again.');
  }
  this.tbRefreshTelegraphUI(); this.tbEndCheck(); return;
}
```
Part C of the proof asserts the designed 2/1/0 timing and goes green once this
lands. No design decision needed — the design is documented; the code is off
by one.

## Proof results

`scripts/test-drama-wiring-fixes-20261007.js` (seeded mulberry32, default
20261007; full index.html module order minus app.js/sprites.js/tile-scenes.js/
move-anim.js; window stubbed for eval then deleted):
- Seeds 20261007, 20261008, 20261009, 20261010 — deterministic, identical.
- Part A (floatText routing + 33-kind dispatch census): **PASS** — 'text'
  routes (x,y,text,opts) intact incl. percentage path; beamHorror dispatches
  with integration appended and emits its floatText line (DOM-stub capture).
- Part B (knowledgeReveal resolution): **PASS** — registered, distinctive
  synth, 9/9 fired kinds resolve, 8/8 mate voices resolve.
- Part C (ember timing): **XFAIL as designed** — cycle 1: 1 visible (want 2);
  cycle 2: 0 visible (want 1); cycle 3: 0 (want 0) ✓. Pins the bug.

Regression: `scripts/test-audio-hooks-static-20261007.js` reports 1
fired-but-undefined (`'miss'` at game.js:18489) — PRE-EXISTING at pristine
c32c36d, introduced by the haymaker-whiff commit 70d3a69 which fires
`this.audioEvent('miss', {})` with no 'miss' voice in the registry. NOT caused
by this worker's changes (verified against pristine extract); flagged for the
audio/brawler owner — app.js is outside my allowed files.
`scripts/test-audio-wiring-fixes-20261007.js` PASS (audioFor/hummice/
antlerThrash) against the edited tree.

## Flags for the coordinator / Steve

1. **Sibling revert-in-progress (revert hazard, ACTIVE):** the worktree's
   uncommitted game.js edits REVERT committed fixes: the antlerThrash inline
   double-fire branch is RESTORED (commit 55576b2 fixed this), the E1 comment
   is rolled back to the stale "map to null in D.audioFor" wording, and the
   brawler per-fight flag hygiene (`delete s.rageActive` etc.) is REMOVED.
   If that worktree state commits, three landed fixes un-land. Someone needs
   to reconcile with that sibling before their next commit.
2. **Ember fix needs an owner** — game.js tbMonsterTurn ~22746; exact patch
   above; proof Part C goes green on landing. Not a design call.
3. **"floatText 8-site patch" label is undefined** — no note at HEAD defines
   the 8 sites. If the coordinator meant something other than the beamHorror
   drop + dead 'text' branch, the next worker needs the actual site list.
4. Audible output on a device can't be verified headless — the synth checks
   are structural (registry resolution + distinctive-design markers), not
   listening tests. Steve's phone pass remains the final gate for the
   knowledgeReveal voice and the beamHorror beat.
5. **New `'miss'` audio gap (pre-existing, not mine):** commit 70d3a69
   (haymaker whiff) fires `this.audioEvent('miss', {})` at game.js:18489 with
   no 'miss' voice defined — the static proof's fired-but-undefined census
   now fails (1 unexpected). Needs a 'miss' synth or a rename to an existing
   voice; app.js is outside my files.

## Tree-safety notes

- Worked from `git archive 5f30aee` extract in /tmp/w-drama; worktree
  src/js/game.js + src/js/drama.js were dirty (sibling edits) — never touched
  the dirty worktree copies during development.
- STALE-READ GUARD: all data reads from `git show HEAD:` (monsters.json,
  evidence notes); worktree reads only for git-status/diff inspection.
- Commit via scripts/safe-commit.sh (private index); worktree backups taken
  before overlay and restored after commit so the sibling's uncommitted work
  survives. No push.
