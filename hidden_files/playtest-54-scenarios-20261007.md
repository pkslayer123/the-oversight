# Playtest Report — All 54 Debug Scenarios (2026-10-07)

**Played as a player, not executed as a script.** Each scenario was run in its own node process (shared-process runs leak state), played through real choices — strikes, moves, watch actions, conversation branches, refusals — and judged against Steve's DONE bar: playable and enjoyable, visuals completed, no stuck-without-context.

**Totals: 37 PLAYABLE / 17 NEEDS WORK / 0 BROKEN / 0 hung.**
No exceptions, no softlocks anywhere. Every scenario runs and resolves.

**Commit:** `a6bc451` — "Playtest all 54 debug scenarios as a player; fix 17 NEEDS WORK (Steve 2026-10-06)" — **not pushed** (main agent handles pushes).
**Proof tests:** `scripts/test-*-20261007.js` (12 files, all GREEN). Also kept in `hidden_files/playtest-54/tests/` with worker reports.
**Worker reports:** `hidden_files/playtest-54/worker-{animals,monsters1,monsters2,contests,social}-report.md`

## Method

Five parallel workers, each owning a partition (animals / monsters1 / monsters2 / contests / social), played every scenario with node harnesses that eval the full production script list in index.html order (minus DOM-only modules), stub `window` for eval then delete it before playing (the window stub flips combat to the async path and headless fights stall — AGENTS.md lesson). Each worker wrote RED proof tests first, then fixes were applied and tests re-run to GREEN.

## Fixes applied (all in commit a6bc451)

### Combat / monsters
- **inspiration** — the ember punish window was unwinnable: 75% physical resist + shrinking ember windows (2→1→0) meant the coached kill path (BACK OFF, punish the ember) could never kill with the spear-only kit. Fix: during `beamPhase === 'ember'` the physical resist is ignored (a guttering idea is just cooling light), with a one-time cue line. Test strikes for 29, unresisted. (`src/js/game.js`)
- **static** — reveal transition double-dipped: breaking the act dealt BOTH the resolving Distress Call AND the no-telegraph rush in one monster turn (mutual kill). Fix: `m.vmRushCd = 1` at reveal so the rush comes next round — the reveal beat is a breath. (`src/js/game.js`)
- **middlemanager** — solo scenario auto-summoned the apex picket (gallowdeer) turn 1, inverting the "isolate it" weakness and one-shotting (85 dmg). Fix: picket summon requires 2+ organize turns; gallowdeer excluded from the picket pool. (`src/js/game.js`)
- **flashbulb / sunbasker / whitenoise** — signature mechanics NEVER fired: HP pools died to the scenario's own spear before the first signature turn (mirrormoth flash, sunbasker charge loop, heron strike). Fix: HP bumps — flashbulb [15,22]→[35,45], sunbasker [20,28]→[45,60], whitenoise [30,40]→[60,80]. **Balance-adjacent — Steve's tuning call** (see below). (`src/data/monsters.json`)
- **nightlight** — scenario was a coin flip: `nightlightActive` needs water within 3 tiles, scenario didn't guarantee it (2 of 4 runs: catfish faded, no fight). Fix: WATER GUARANTEE — relocate near water, mirroring sunbasker's SUN GUARANTEE. (`src/js/debug-scenarios.js`)

### Animals / encounters
- **opossum** — miss branch said "bolts" for `plays_dead` while `encPossumFlop` owned the turn with the flop. Fix: `plays_dead` missVerb → "goes still". (`src/js/encounters.js`)
- **crayfish** — BITE hook fired "Teeth in your hand" for aquatic behaviors (crayfish, frogs, chubs have no teeth); pinch feedback re-announced the catch ("Got it — but…" stutter). Fix: BITE hook excludes `aquatic*`; pinch line de-stuttered. (`src/js/encounters.js`)
- **snappingturtle** — unwinnable grind with no named exit + "no a fishing line" grammar. Fix: article-less tool nouns (`encMethodToolName`); futile-strike guidance after 3 misses on never-bolting animals ("Come back with… Walking away is free"); snapping-turtle beak text in BITE hook. (`src/js/encounters.js`)

### Contests
- **contestWatch** — "Give them space" was narrated as its opposite ("You go to Sam…"). Fix: verdict line gated on `ac.comfort`, else space-respecting line. (`src/js/contests.js`)
- **contestForage** — refusal path lead-in "While you fought your fight, they fought theirs" — the player refused; they fought nothing. Fix: `ac._refused = true` in `_contestRefuse`; refusal-honest lead-in in `_contestResolveOthers`. (`src/js/contests.js`)
- **showWhyEat** — scenario was one `sysSay`, bypassing the real `Game.fireShow` path (villager pull, village reaction, showmanship). Fix: calls the real `fireShow` + stakes line. (`src/js/debug-scenarios.js`)

### Social
- **language** — scenario wrote `v.bgLangs` but `npcLangs()` prefers `person.languages` on hydrated villagers: the cast spoke fluent English, barrier never existed. Fix: scenario sets `Game.getPerson(rid).languages` too. (`src/js/debug-scenarios.js`)
- **uprising** — mob yield after first blood skipped `uprisingAftermath()`: the single-yielder inline branch ran instead, leaving the justice ladder at stage 4 in permanent limbo. Fix: uprising fights route through `uprisingAftermath()` (stage→3, fear for the living). Also fixed "grabs for you's weapon hand" → "your weapon hand". (`src/js/party.js`)
- **mootJuror** — press payoff ("their story has a crack in it now") voiced as the accused's dialogue. Fix: narrated as `who:'narr'`, not via `sayLine`. (`src/js/betrayal.js`)
- **starving** — theft thresholds unreachable: 4000 kcal single-take and −5000 net gates vs a 2700 kcal pantry — emptying it drew zero reaction, contradicting "people notice what you take". Fix: thresholds scale to pantry (`min(4000, pantry/2)`; `min(5000, pantry)`). (`src/js/game.js`)
- **Text nits** — knowledge-gated descriptors ending "." got "'s" appended raw ("watching. learning.'s"); "One threat" for n===1; exile gift hints now honest about whole-portion overshoot. (`src/js/game.js`, `src/js/party-formal.js`, `src/js/betrayal.js`)

## Per-scenario verdicts

### Animals (9 PLAYABLE / 3 NEEDS WORK)
| Scenario | Verdict | Issue → Fix |
|---|---|---|
| deer | PLAYABLE | Clean hunt arc, tracking → kill → butcher reads well |
| rabbit | PLAYABLE | Snare line, flight behavior coherent |
| squirrel | PLAYABLE | — |
| turkey | PLAYABLE | Clean/flock behavior, calling works |
| opossum | NEEDS WORK → fixed | miss/flop contradiction → plays_dead verb |
| bullfrog | PLAYABLE | — |
| boxturtle | PLAYABLE | — |
| fox | PLAYABLE | — |
| raccoon | PLAYABLE | — |
| crayfish | NEEDS WORK → fixed | teeth-bite + pinch stutter → aquatic exclusion, de-stutter |
| snappingturtle | NEEDS WORK → fixed | unwinnable grind + "no a fishing line" → futile-strike guidance, article-less nouns |
| chub | PLAYABLE | — |

### Monsters 1 (7 PLAYABLE / 4 NEEDS WORK)
| Scenario | Verdict | Issue → Fix |
|---|---|---|
| headlight | PLAYABLE | Stalk → headlights → swerve loop works |
| flashbulb | NEEDS WORK → fixed | one-shot before flash → HP 35–45 |
| choir | PLAYABLE | — |
| lockpick | PLAYABLE | Case → steal loop fires |
| hummice | PLAYABLE | — |
| nightlight | NEEDS WORK → fixed | coin-flip scenario → WATER GUARANTEE |
| glasswing | PLAYABLE | — |
| sunbasker | NEEDS WORK → fixed | one-shot before charge loop → HP 45–60 |
| bulldozer | PLAYABLE | Trample/terraform reads |
| hushpuppy | PLAYABLE | Silence telegraph (no rush UI) works |
| whitenoise | NEEDS WORK → fixed | died before strike → HP 60–80 |

### Monsters 2 (9 PLAYABLE / 3 NEEDS WORK)
| Scenario | Verdict | Issue → Fix |
|---|---|---|
| reviewdrone | PLAYABLE | Review cycle, PIP mechanics fire |
| influencer | PLAYABLE | Paparazzo flash/morale loop |
| customerservice | PLAYABLE | Understudy watch → perform; stolen-weapon possessive fixed |
| inspiration | NEEDS WORK → fixed | unwinnable ember math → ember vulnerability + cue |
| speedbump | PLAYABLE | — |
| ducksinarow | PLAYABLE | — |
| static | NEEDS WORK → fixed | reveal double-dip → rush cooldown at reveal |
| griefcounselor | PLAYABLE | Mirror Stag grief loop |
| motivationalspeaker | PLAYABLE | Heckler hype/deflate |
| termsconditions | PLAYABLE | Landlord fine-print |
| middlemanager | NEEDS WORK → fixed | apex auto-summon → 2-turn requirement, gallowdeer excluded |
| nostalgia | PLAYABLE | — |

### Contests (3 PLAYABLE / 3 NEEDS WORK)
| Scenario | Verdict | Issue → Fix |
|---|---|---|
| contestPit | PLAYABLE | Full fight arc, bespoke death lines |
| contestHide | PLAYABLE | — |
| contestForage | NEEDS WORK → fixed | refusal-dishonest lead-in → `_refused` flag |
| contestWatch | NEEDS WORK → fixed | "Give them space" ignored → comfort-gated |
| showWhyEat | NEEDS WORK → fixed | bypassed real show path → `fireShow` + stakes |
| contestEligible | PLAYABLE | Eligibility logic sound |

### Social (9 PLAYABLE / 4 NEEDS WORK)
| Scenario | Verdict | Issue → Fix |
|---|---|---|
| day7 | PLAYABLE | Week-arc village life reads |
| day1 | PLAYABLE | — |
| language | NEEDS WORK → fixed | bgLangs silently ignored → set person.languages |
| liars | PLAYABLE | Forced lies detectable, scanner works |
| night | PLAYABLE | Night activity, tool-noun fix verified here |
| starving | NEEDS WORK → fixed | unreachable theft gates → pantry-scaled |
| uprising | NEEDS WORK → fixed | yield skipped aftermath → route through uprisingAftermath |
| mootAccused | PLAYABLE | Trial ceremony, verdict; "counts on their fingers" left as singular-they (grammatical) |
| mootJuror | NEEDS WORK → fixed | payoff voiced as accused → narrated |
| ambush | PLAYABLE | — |
| exile | PLAYABLE | Petition/gift flow; gift hint now honest about overshoot |
| keepsake | PLAYABLE | — |
| mantle | PLAYABLE | — |

## Balance-adjacent calls for Steve

1. **Monster HP bumps** (flashbulb/sunbasker/whitenoise): justified because signature mechanics literally never fired — that's a visuals-completeness failure, not a tuning preference. But the exact numbers are yours to overrule.
2. **Ember vulnerability** (inspiration): the alternative was moving the scenario to day (daylight disperses it), but then there's no fight — the scenario exists to playtest the combat. The ember is now the kill window the coaching always promised.
3. **Starving thresholds**: `min(4000, pantry/2)` keeps the original gate for healthy pantries; only near-empty pantries notice being emptied. Feels right but it's a feel call.

## Notes

- Hot tree: siblings have uncommitted changes in `docs/`, `evidence/`, `scripts/`, and shared hunks in `src/js/{contests,game}.js`, `src/data/monsters.json`, `src/js/debug-scenarios.js`. My commit contains ONLY my hunks (selective staging via reverse-apply + private index); sibling work is untouched in the worktree.
- `src/js/convo-dialogue.js:315` had a sibling-caused SyntaxError mid-run; verified fixed before the test runs.
- The 12 proof tests were RED before fixes, GREEN after. `test-inspiration` was rewritten mid-session: the original asserted the scenario shouldn't run at night; the fix instead made the night fight winnable (ember vulnerability), which is the better design for a combat scenario.
- Not pushed, per instruction.
