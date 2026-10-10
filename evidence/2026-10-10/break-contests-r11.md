# Break-it: contests — round 11 (2026-10-10)

Target: the contests system (`src/js/contests.js`, `src/js/contestEngine.js`,
plus the shared morale model in `src/js/fieldFights.js` where the root cause
lived). Canon read first: `docs/CANON.md`, `docs/CONTESTS.md`.
Proof: `scripts/test-break-contests-20261010.js` — 50 checks × 3 seeds
(424242 / 777 / 31337), all green.

## Kills (4)

### K1 — Cheer was a trap: +15 bravery converted flight into death (HONESTY)
**Attack:** measured off-screen blood outcomes with cheer 0 vs max cheer
(40 trials/contest, `contestResolveGroup` with the exact `{cheerBonus:15,
cheerLift:3}` the verdict passes).
**Break:** pit deaths 0%→22%, gauntlet 0%→32%, siege 0%→15% WITH cheer; win
rates unchanged. Cheer maps to bravery, and bravery only lowers the flee
threshold (`fieldFights.js` `vBreak`) — in a losing fight the cheered villager
held to ~20% HP instead of fleeing at ~50%, dying where the uncheered fled.
Cheer never added a single win. A support button that can only hurt is a
dishonest button.
**Fix:** `src/js/fieldFights.js` morale block — hopeless + no help coming now
flees ("believable flight", which the Steve 2026-10-09 comment promised but the
code never delivered: it fell through to the bravery threshold). This subsumes
the old help-failed branch. Cheer is now fair variance: gauntlet wins 0%→5%,
deaths 32%→17% (residual = honest gamble in losing-but-not-hopeless fights).
Plus courage-honesty copy in `_contestDie` (watch branch): a cheered death now
says "They heard you. They held the line longer than wisdom allowed…" out loud.
**Proof:** H5b — hopeless fight vs wave-2 beast: 12/12 flee at 0 AND +15 bravery
(0 deaths); the honesty line fires on a cheered death.
**Sibling sweep:** `duelFight` applies braveryBonus symmetrically (wash, no
perversity); moot `cheerLift` is purely additive (no harm); fieldFights suite
24/24 incl. the Highbeam benchmark (0 solo kills/100 holds).

### K2 — Dead `_cxWin`/`_cxLose` helpers (DEAD CODE)
**Attack:** call-site census over all 94 `G.*` defs in contests.js across every
loaded module. **Break:** `_cxWin`/`_cxLose` had zero call sites repo-wide —
shared win/lose phase builders no bespoke contest ever adopted. **Fix:**
removed (with a tombstone comment). Ontology 52/52 still validates.

### K3 — Arena-death path skipped resolve hygiene (SIBLING of audio pass 5)
**Attack:** traced every contest-death path for the Resolve beat /
heartbeatStop / loser-drama triple. **Break:** `_contestArenaAfter`'s
`'lost'` branch (player dies in a real arena fight) said the death line but
skipped all three — a sustained tithe heartbeat would thump on forever, no
resolve sting, no sympathetic dim. **Fix:** added the triple, matching
`_contestDie`. **Proof:** S2b stubs audioEvent/drama and asserts
`contestPitResolve` + `heartbeatStop` + `contest:loser` fire.

### K4 — `dead=true` leaked across expeditions → phantom roster members (SIBLING)
**Attack:** E3 (eligibility bypass) failed on seed 777 only when run after E1:
a "healthy adult" was ineligible. **Root cause:** `removeVillager(..., 'killed')`
sets `rec.dead=true` on the SHARED `data.villagers` object (betrayal.js:889);
`genRoster` never cleared it, and `newGame`'s background-survivor draw doesn't
filter `dead`. A villager killed in run N stayed dead in run N+1 (same page
load): drawable into the new roster, but `isMember()` reads `vp.dead` → phantom
non-member, ineligible for contests, skipped by party code.
**Fix:** `genRoster` (game.js) now clears `dead` on `data.villagers` +
`data.background_survivors` alongside the existing per-expedition cast cleanup.
One fix covers both writers (betrayal.js:889, alienPlayers.js:1821).
**Proof:** E3 green on all 3 seeds in full-sequence runs.

## Held (documented, not fixed)

- **E1 bet arbitrage:** 14 contests show >55% win rates at max cheer (solo
  chance contests are rigged theater — the lone contestant always wins, BY
  DOCUMENTED DESIGN in `_cxChance`). Not an economy break: the wager is a
  FIXED 200→400 kcal stake (asserted: exactly one amount everywhere), once per
  watch contest, which requires the 10% whim path with the player not taken.
  +200 kcal/rare occurrence, kcal-capped, no compounding. Below Steve's
  "true infinite exploit" bar — min-maxing welcome.
- **E2 prize duplication:** player win = ≤1 loot grant + ≤1 care package;
  villager win = exactly 1 pantryAdd. No dupes.
- **E3 eligibility:** dead / severed / <15 / >72 / ≤20 HP villagers never
  castable (300 fires, all picks in-set). Documented asymmetry holds: a
  1-HP player IS eligible ("The System is not kind").
- **E4 countdown:** firesDay = day+1 exactly; no second fire while pending;
  resolve lands the interruption modal.
- **S1 phase graph:** 1808 choice edges across 44 contests (+5 choice-mode)
  all terminate; no throws, no dead input, no cycles (path-based detection);
  static check: every numeric `next` in range.
- **S2/S3:** arena loss clears the modal; WIN/LOSE/DIE/REFUSE all clear
  `activeContest`; DIE passes the mantle (village-as-protagonist, game
  continues) and says the death line.
- **H2 budget:** 28 forced dawns → exactly 2/week, 8 events total.
- **H3 cheer:** real (read by the engine; moves outcomes), now fair.
- **H4 casting:** whim announced; 6-win villager leads 64–67% of 240 fires vs
  ~17% uniform — notability-first, never RNG-first. docs/CONTESTS.md amended:
  ratings_casting (Steve 2026-10-08/09) supersedes the viewership-rank gate for
  casting (viewership still drives scheduling).
- **H5 fear:** the Maw kills the nerveless 10/10 (extreme honest); the blood
  engine CAN kill (vDie reachable); player pit → real arena fight.
- **D1–D3:** index.html wires both modules; 92/92 defs called; all 44 pool
  contests produce playable phases; bespoke death lines + setup/turn/end watch
  beats for all 44.

## Design observation (for Steve, not fixed)
Watched blood kills rarely for healthy villagers (~0–3%/gauntlet) — the morale
model favors believable flight, and hopeless now flee. Fear is real where it's
played (player arena/maw/real damage) and certain at the extreme (maw).
Whether watched blood should be bloodier is a tuning call — left alone.

## Regressions
test-break-contest-r10 20/20 · test-show-break-20261010 50/50 ·
test-fameseeker-20261010 41/41 · test-break-shows-20261009 64/64 ·
test-break-monsters3-fieldfights 24/24 · ontology 52/52 · node --check clean.
