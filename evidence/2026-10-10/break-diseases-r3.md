# Break-it: diseases, round 3 (2026-10-10)

Target: disease system, alien-pool enforcement layer. Round 1 (commit 9b791347:
tick-escalation lie, legacy mirror desync, rattlesnake phantom mirror, dead
chronic/tickRolled; persistence r8 a985b247: _seSeq save/load collision) and
round 2 (break-diseases-r2.md) are NOT re-litigated.

Canon read first: docs/CANON.md + docs/DISEASES.md. Two pools, never mix.
Worktree: ~/workspace/worktrees/break-disease (registered this run, released as
merged, removed). Commits: 7ccf3e10 (alien pool enforcement + honest surfaces),
fd85bd81 (ONTOLOGY.md regenerate). Merged locally to master, pending ship.

## Verdict: BROKE 3, fixed 3. Held: vector honesty, cure gating, stacking.

### CATCH 1 — EXPLOIT: cureStatus() was a back door through the pool wall (FIXED)
Attack: `Game.cureStatus('scholar','eurika')` — the engine's generic cure path
had no pool guard. It silently deleted a *permanent* alien infection (eurika =
permanent biological warping, no expiry). Every current caller happened to be
mundane-filtered via sickDiseases(), so this was latent — one future caller away
from a real exploit: mundane medicine touching alien biology, in direct violation
of the two-pools law.
Fix: `cureStatus()`, `diagnoseDisease()`, and `easeDisease()` now refuse
alien-pool ids with honest narration ("Earthly medicine doesn't touch alien
biology — the X stays."). The `two_pools` ontology rule now names the
enforcement points. The test that had encoded the old buggy behavior (asserting
cureStatus removes a quirk) was updated to assert refusal + targeted removal via
seRemove.
Sibling sweep: all ease/cure/diagnose callers verified mundane-filtered via
sickDiseases(); no seList splices outside statusEffects.js; folk/rest
dayPartsLeft reductions mundane-only; villager treat path yields 'no' for alien
(cure:[]).

### CATCH 2 — HONESTY: chips promised an identification path that cannot exist (FIXED)
Attack: HUD chips rendered alien true names with the title "Undiagnosed —
examine (🧬 You) to identify". But examineSick() only reads sickDiseases()
(mundane-only), so an alien-only bearer got "You're not sick. Nothing to
examine." — a lie stacked on a dead promise.
Fix: alien chips now carry an honest title (no examine promise); examineSick()
tells the truth when only alien is aboard ("Nothing earthly in you to name —
but there IS something else in there…").

### CATCH 3 — DEAD CODE: alien conditions had no readable surface (FIXED)
Attack: the Afflictions panel rendered mundane diseases only. The min-max
building blocks Steve wants players to seek (eurika, lemons, gristlefit…) were
invisible except a bare chip, and all 9 transformation texts were never
displayed anywhere — fully-written content, unreachable.
Fix: Game.alienAfflictions() added; the Afflictions panel now renders alien
rows — name, effects, transformation, permanent-vs-passing note — with NO
treatment buttons and the honest why.

## Held (attacked, resisted)
- Vector honesty: ambient tick/mosquito never grant alien viruses; only
  `cooked` clears trichinosis (smoking doesn't); trembles death-certainty path
  intact (40 day-parts, no cure at any tier).
- Cure/treatment gating: the folk → occupation → ruin-medicine ladder still
  gates mundane cures; trembles has no cure path by design.
- Alien stacking: all 9 alien conditions can coexist — allowed (min-max
  welcome, per canon); drawbacks verified to stack alongside the abilities.

## Proofs
- New scripts/test-disease-break-alien-20261010.js: 18/18 across 3 seeds,
  8 red pre-fix (verified via BEFORE=1).
- Regressions after rebase onto master (4a6e9895 endgame deed gate + waves 3-5):
  pools 66/66 x3 seeds, rework 53/53 x2 seeds, ontology 53/53 ("Release
  permitted").
- Note: the merge initially failed --ff-only because a sibling landed mid-run;
  the worker branch was rebased onto the new master inside its own worktree and
  re-verified green before landing. No force used.

## Notes for next rounds
- The alien pool now has real enforcement at the engine level, but the design
  space is still open: alien *diagnosis* is forbidden (never name them?) vs.
  the new panel showing true names — the panel exposes the name without the
  diagnosis machinery, which is the intended reading ("these are alien effects,
  not diagnoses"). If Steve wants the true names hidden until a System-level
  reveal, that is a design call, not a bug.
