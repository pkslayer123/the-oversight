# Break-it: persistence (save/load) — run 10, 2026-10-11

Target 8. No dedicated persistence canon doc exists (docs/STORAGE.md is about
item storage, not save/load) — worked from docs/CANON.md + code, per the
standing rule. Prior ten passes (r1–r9 + r1 2026-10-10) hardened the save
engine; this run attacked the FRESH surface from commit 2babaa41
("break-it alien players r13"): wealth-stance flags made unconditional,
favor why-copy + persona-package cards/photos knowledge-gated, harness/
index.html parity restored to 11 modules.

## Attacks attempted

- **EXPLOIT / r13 flag round-trip** (`test-persist-alien-r10`, HELD section):
  rich hurt persona enraged via `apApplyWealthStance`, mid-fight save → load →
  `_enraged`/`_stance`/`_wantsRetreat`/fight-id all restored verbatim. The
  r13 fix survives the load boundary; no save-scum disarms the enrage. HELD.
- **EXPLOIT / alien cooldowns** (HELD): dead-drop records `lastDropDay`
  BEFORE the kcal grant and the grant is try/caught — a grant throw consumes
  the cooldown (fail-safe) instead of leaving it unrecorded (which would
  duplicate on retry). Same-day re-call refused. HELD.
- **MIGRATION / fanClubs lazy migration through save/load** (HELD): blob
  without `fanClubs` + legacy favor → `apState()` seeds all four lanes on
  first read after load; `apFavor()` consistent. HELD.
- **MIGRATION / old-save knowledge leak** → **K1 (kill, below)**.
- **DEAD CODE / `state.alienEncounter.fighter`** → **K2 (kill, below)**.
- **DEAD CODE / `state.alienPlayers.*` key pairing**: met, favor (legacy
  mirror, read by `apFavor` fallback + `apSyncFavor`), lastDropDay,
  lastFeedDay, lastHuntDay, known (via `canShow('alien')`), fanClubs,
  lastPackageDay, lastGroupDay, lastLifelineDay, wrenDrops, active — every
  key written is read live. `canShow('alien',pid,'name')` reads the same
  `ap.known` source as the `apKnowsAlien` fallback: no load-order divergence.
  `state.alienGroup = {pids, current}` is minimal and read. No dead keys.
- **SOFTLOCK / double-load idempotency**: load() mutations (endConvo
  settling, ghost drops, arena void) all derive from the fresh disk blob;
  second load repeats the same in-memory transition, autosave persists it
  consistently. No accumulation. HELD by inspection + probe1 green.

## Kills (2)

### K1. Old saves leak ungated alien names through the codex on load (MIGRATION/HONESTY — medium-high)
Pre-2026-10-10 `apCodexEntry` wrote `entry.name = p.name` UNGATED ("the human
persona's name — safe pre-reveal", the false assumption r11 disproved: there
are no cover names). Those entries persist in save blobs, and the codex
renderer prints `entry.name` verbatim. A player with 1–2 pre-reveal encounters
who Continues an old save sees the true persona name in the codex with no
reveal ever happening — a knowledge leak that exists ONLY because of the
load boundary. `apCodexEntry` only re-runs on new encounters/reveals, so
the stale entry was never repaired.
Fix (`src/js/game.js`, `load()`): re-run `apCodexEntry(pid)` for every
stored persona at the load boundary. The builder derives every field from
the current knowledge truth (`ap.known`), so revealed personas keep their
names/stages and unrevealed ones read as strangers; `met` records are
untouched. Idempotent by construction.
Proof: `scripts/test-persist-alien-r10.js` — pre-fix the crafted old entry
loads as "Countess Sable"; post-fix it loads as "someone" (title/species
re-gated, encounters intact); a revealed persona keeps name + stage
(no over-scrub).
Sibling sweep: `apCodexEntry` is the ONLY writer of `codex.aliens` (single
call-site pair: reveal + combat-end), so the scrub covers every entry.
Favor `why` strings and package cards from the pre-r13 leak era live only
in the rolling 40-line `run.log` transcript — history that was announced
live in-session, no knowledge-surface contract to enforce; left alone
deliberately (rewriting the transcript would be history revision).

### K2. `state.alienEncounter.fighter` — dead save payload (DEAD CODE — low)
`apStartEncounter` stored `{ pid, fighter }` in state; only `.pid` was ever
read (tbEnd wrapper). The fighter was a stale fight-start duplicate of the
live tbfight fighter, riding every mid-fight alien save (~1–2KB) and every
subsequent save of that session.
Fix: `apStartEncounter` stores `{ pid }` only (`src/js/alienPlayers.js`),
and `load()` strips the dead copy from older blobs (`src/js/game.js`) —
one Continue cleans the session permanently.
Proof: `test-persist-alien-r10` — old-shape blob loads pid-intact and
fighter-free; re-save after load is clean.

## Held — real attacks that resisted
- r13 wealth-stance flags (`_enraged`/`_wantsRetreat`/`_stance`) round-trip
  through the fighter JSON snapshot; mid-fight reload cannot disarm them.
- `apKnowsAlien` → `canShow('alien')` → `ap.known`: single persisted source,
  consistent across load; no gate divergence.
- Alien cooldowns are fail-safe (record-before-grant); no duplication vector
  on grant failure or save/load.
- Double-load is idempotent; pending-event family still rides day-boundary
  ticks (prior r1 sweep stands).

## Regression
- New `scripts/test-persist-alien-r10.js`: 23/23 green (AFTER mode);
  BEFORE=1 demo assertions fail post-fix as expected (kill demonstrated
  pre-fix: 3 FAILs on the unfixed code).
- `test-break-persistence9-20261010.js`: 23 passed, 0 failed.
- `test-break-persistence8-20261010.js`: 59 checks passed.
- Probes 1,2,3,4,5,7: all green.
- Alien r13 suite (`test-break-alien-20261010-r13.js`): 75/75 green
  (touched alienPlayers.js).

## Notes
- The r13 "harness/index.html parity restored (11 modules)" touched only
  `scripts/break-alien-harness.js` (test-only); index.html already loaded
  those modules, so nothing in any save blob changed shape because of it.
- `_enraged`/`_wantsRetreat` are intentionally sticky for the fight (set
  true, never cleared — `apBuildFighter` initializes, `apApplyWealthStance`
  triggers). Not a bug; noted because the save/load path preserves the
  stickiness exactly.
- The `syncRun` fighter-serialization fallback whitelist still drops
  `_enraged`/`_wantsRetreat`/`_stance` (as it drops all volatile state),
  but it only triggers on unserializable (circular/BigInt) fighters —
  `apBuildFighter` produces plain objects, so the path is unreachable in
  practice; the primary JSON round-trip keeps the flags. Left as designed.

## Files
- `scripts/test-persist-alien-r10.js` — proof probe (23 checks, BEFORE=1 demo mode).
- `src/js/game.js` — load(): alien codex re-gate + dead fighter strip.
- `src/js/alienPlayers.js` — apStartEncounter: pid-only encounter state.
